import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_ACCESS_KEY_HEADER, hashDemoGuardValue, verifyDemoAccessRequest } from "./demo-access";
import { createSupabaseAdminClient } from "./supabase-client";

export type DemoRouteGroup = "ai_extract" | "ai_journal" | "export" | "mutation" | "upload";

export type DemoUsageRecordInput = {
  accessKeyHash: string;
  ipHash: string;
  routeGroup: DemoRouteGroup;
  createdAt: string;
};

type DemoUsageCountInput = {
  identity: "access_key" | "ip";
  identityHash: string;
  routeGroups: DemoRouteGroup[];
  sinceIso: string;
};

export type DemoUsageStore = {
  countSince(input: DemoUsageCountInput): Promise<number>;
  record(input: DemoUsageRecordInput): Promise<void>;
};

type DemoRateLimitFailure = {
  error: "demo_budget_exhausted" | "demo_rate_limit_unavailable" | "demo_rate_limited";
};

type DemoRateLimitConfig = {
  dailyAiLimit: number;
  maxRequests: number;
  windowSeconds: number;
};

const AI_ROUTE_GROUPS: DemoRouteGroup[] = ["ai_extract", "ai_journal"];
const DEFAULT_DAILY_AI_LIMIT = 30;
const DEFAULT_MAX_REQUESTS = 6;
const DEFAULT_WINDOW_SECONDS = 60;
const DEMO_USAGE_TABLE = "demo_usage_events";

export async function enforceDemoAccess(
  request: Request,
  routeGroup: DemoRouteGroup,
  store: DemoUsageStore | null = createSupabaseDemoUsageStore(),
): Promise<Response | null> {
  const accessError = await verifyDemoAccessRequest(request);

  if (accessError) {
    return accessError;
  }

  const configuredAccessKey = process.env.KEIRIFLOW_DEMO_ACCESS_KEY?.trim();
  const suppliedAccessKey = request.headers.get(DEMO_ACCESS_KEY_HEADER)?.trim();

  if (!configuredAccessKey || !suppliedAccessKey) {
    return null;
  }

  if (!store) {
    return isExternalDemoMode()
      ? createDemoRateLimitError("demo_rate_limit_unavailable", 503)
      : null;
  }

  const config = getDemoRateLimitConfig();
  const now = new Date();
  const accessKeyHash = await hashDemoGuardValue(suppliedAccessKey);
  const ipHash = await hashDemoGuardValue(getRequestIp(request));

  try {
    const limitError = await evaluateUsageLimit({
      accessKeyHash,
      config,
      ipHash,
      now,
      routeGroup,
      store,
    });

    if (limitError) {
      return limitError;
    }

    await store.record({
      accessKeyHash,
      ipHash,
      routeGroup,
      createdAt: now.toISOString(),
    });

    return null;
  } catch {
    return createDemoRateLimitError("demo_rate_limit_unavailable", 503);
  }
}

function createSupabaseDemoUsageStore(): DemoUsageStore | null {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  return new SupabaseDemoUsageStore(supabase);
}

function isExternalDemoMode() {
  return (
    process.env.AI_PROVIDER_MODE === "anthropic" ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) ||
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}

async function evaluateUsageLimit(input: {
  accessKeyHash: string;
  config: DemoRateLimitConfig;
  ipHash: string;
  now: Date;
  routeGroup: DemoRouteGroup;
  store: DemoUsageStore;
}) {
  const windowStart = new Date(input.now.getTime() - input.config.windowSeconds * 1000).toISOString();
  const accessKeyWindowCount = await input.store.countSince({
    identity: "access_key",
    identityHash: input.accessKeyHash,
    routeGroups: [input.routeGroup],
    sinceIso: windowStart,
  });

  if (accessKeyWindowCount >= input.config.maxRequests) {
    return createDemoRateLimitError("demo_rate_limited", 429);
  }

  const ipWindowCount = await input.store.countSince({
    identity: "ip",
    identityHash: input.ipHash,
    routeGroups: [input.routeGroup],
    sinceIso: windowStart,
  });

  if (ipWindowCount >= input.config.maxRequests) {
    return createDemoRateLimitError("demo_rate_limited", 429);
  }

  if (AI_ROUTE_GROUPS.includes(input.routeGroup)) {
    const dailyAiCount = await input.store.countSince({
      identity: "access_key",
      identityHash: input.accessKeyHash,
      routeGroups: AI_ROUTE_GROUPS,
      sinceIso: getUtcDayStart(input.now).toISOString(),
    });

    if (dailyAiCount >= input.config.dailyAiLimit) {
      return createDemoRateLimitError("demo_budget_exhausted", 503);
    }
  }

  return null;
}

function getDemoRateLimitConfig(): DemoRateLimitConfig {
  return {
    dailyAiLimit: readPositiveIntegerEnv("KEIRIFLOW_DEMO_DAILY_AI_LIMIT", DEFAULT_DAILY_AI_LIMIT),
    maxRequests: readPositiveIntegerEnv("KEIRIFLOW_DEMO_RATE_LIMIT_MAX_REQUESTS", DEFAULT_MAX_REQUESTS),
    windowSeconds: readPositiveIntegerEnv("KEIRIFLOW_DEMO_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS),
  };
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

function getRequestIp(request: Request) {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function getUtcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function createDemoRateLimitError(error: DemoRateLimitFailure["error"], status: 429 | 503) {
  return Response.json({ error } satisfies DemoRateLimitFailure, { status });
}

class SupabaseDemoUsageStore implements DemoUsageStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async countSince(input: DemoUsageCountInput) {
    const hashScopedQuery =
      input.identity === "access_key"
        ? this.supabase
            .from(DEMO_USAGE_TABLE)
            .select("id", { count: "exact", head: true })
            .eq("access_key_hash", input.identityHash)
        : this.supabase
            .from(DEMO_USAGE_TABLE)
            .select("id", { count: "exact", head: true })
            .eq("ip_hash", input.identityHash);
    const routeScopedQuery =
      input.routeGroups.length === 1
        ? hashScopedQuery.eq("route_group", input.routeGroups[0])
        : hashScopedQuery.in("route_group", input.routeGroups);
    const { count, error } = await routeScopedQuery.gte("created_at", input.sinceIso);

    if (error) {
      throw new Error("demo_usage_count_failed");
    }

    return count ?? 0;
  }

  async record(input: DemoUsageRecordInput) {
    const { error } = await this.supabase.from(DEMO_USAGE_TABLE).insert({
      access_key_hash: input.accessKeyHash,
      ip_hash: input.ipHash,
      route_group: input.routeGroup,
      created_at: input.createdAt,
    });

    if (error) {
      throw new Error("demo_usage_record_failed");
    }
  }
}
