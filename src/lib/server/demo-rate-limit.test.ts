import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ACCESS_KEY_HEADER, hashDemoGuardValue } from "./demo-access";
import {
  enforceDemoAccess,
  type DemoRouteGroup,
  type DemoUsageRecordInput,
  type DemoUsageStore,
} from "./demo-rate-limit";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("enforceDemoAccess", () => {
  it("確認用キー環境変数が未設定ならusage storeへ記録しない", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "");
    const store = new MemoryDemoUsageStore();

    const response = await enforceDemoAccess(createRequest("demo-secret"), "upload", store);

    expect(response).toBeNull();
    expect(store.records).toEqual([]);
  });

  it("外部接続モードでusage storeが無ければ503を返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");

    const response = await enforceDemoAccess(createRequest("demo-secret"), "ai_extract", null);
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(503);
    expect(body.error).toBe("demo_rate_limit_unavailable");
  });

  it("確認用キーが不正なら401を返しusage storeへ記録しない", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    const store = new MemoryDemoUsageStore();

    const response = await enforceDemoAccess(createRequest("wrong-secret"), "upload", store);
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(401);
    expect(body.error).toBe("invalid_demo_key");
    expect(store.records).toEqual([]);
  });

  it("上限未満なら確認用キーとIPをhash化してusage storeへ記録する", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    const store = new MemoryDemoUsageStore();

    const response = await enforceDemoAccess(createRequest("demo-secret"), "upload", store);

    expect(response).toBeNull();
    expect(store.records).toHaveLength(1);
    expect(store.records[0]).toMatchObject({
      routeGroup: "upload",
    });
    expect(store.records[0]?.accessKeyHash).not.toBe("demo-secret");
    expect(store.records[0]?.ipHash).not.toBe("203.0.113.10");
    expect(store.records[0]?.accessKeyHash).toHaveLength(64);
    expect(store.records[0]?.ipHash).toHaveLength(64);
  });

  it("確認用キー単位のwindow上限に達していたら429を返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    vi.stubEnv("KEIRIFLOW_DEMO_RATE_LIMIT_MAX_REQUESTS", "1");
    const store = new MemoryDemoUsageStore([
      await createUsageRecord({
        accessKey: "demo-secret",
        ip: "198.51.100.20",
        routeGroup: "upload",
      }),
    ]);

    const response = await enforceDemoAccess(createRequest("demo-secret"), "upload", store);
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(429);
    expect(body.error).toBe("demo_rate_limited");
    expect(store.records).toHaveLength(1);
  });

  it("IP単位のwindow上限に達していたら429を返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    vi.stubEnv("KEIRIFLOW_DEMO_RATE_LIMIT_MAX_REQUESTS", "1");
    const store = new MemoryDemoUsageStore([
      await createUsageRecord({
        accessKey: "other-demo-secret",
        ip: "203.0.113.10",
        routeGroup: "upload",
      }),
    ]);

    const response = await enforceDemoAccess(createRequest("demo-secret"), "upload", store);
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(429);
    expect(body.error).toBe("demo_rate_limited");
    expect(store.records).toHaveLength(1);
  });

  it("AI系routeの日次上限に達していたら503を返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    vi.stubEnv("KEIRIFLOW_DEMO_DAILY_AI_LIMIT", "1");
    const store = new MemoryDemoUsageStore([
      await createUsageRecord({
        accessKey: "demo-secret",
        ip: "203.0.113.10",
        routeGroup: "ai_journal",
      }),
    ]);

    const response = await enforceDemoAccess(createRequest("demo-secret"), "ai_extract", store);
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(503);
    expect(body.error).toBe("demo_budget_exhausted");
    expect(store.records).toHaveLength(1);
  });

  it("usage storeが失敗したら503を返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");

    const response = await enforceDemoAccess(createRequest("demo-secret"), "upload", new FailingDemoUsageStore());
    const body = (await response?.json()) as { error: string };

    expect(response?.status).toBe(503);
    expect(body.error).toBe("demo_rate_limit_unavailable");
  });
});

function createRequest(accessKey: string) {
  return new Request("http://localhost/api/documents/upload", {
    headers: {
      [DEMO_ACCESS_KEY_HEADER]: accessKey,
      "cf-connecting-ip": "203.0.113.10",
    },
    method: "POST",
  });
}

async function createUsageRecord(input: {
  accessKey: string;
  ip: string;
  routeGroup: DemoRouteGroup;
}): Promise<DemoUsageRecordInput> {
  return {
    accessKeyHash: await hashDemoGuardValue(input.accessKey),
    ipHash: await hashDemoGuardValue(input.ip),
    routeGroup: input.routeGroup,
    createdAt: new Date().toISOString(),
  };
}

class MemoryDemoUsageStore implements DemoUsageStore {
  constructor(readonly records: DemoUsageRecordInput[] = []) {}

  async countSince(input: {
    identity: "access_key" | "ip";
    identityHash: string;
    routeGroups: DemoRouteGroup[];
    sinceIso: string;
  }) {
    return this.records.filter((record) => {
      const recordHash = input.identity === "access_key" ? record.accessKeyHash : record.ipHash;

      return (
        recordHash === input.identityHash &&
        input.routeGroups.includes(record.routeGroup) &&
        record.createdAt >= input.sinceIso
      );
    }).length;
  }

  async record(input: DemoUsageRecordInput) {
    this.records.push(input);
  }
}

class FailingDemoUsageStore implements DemoUsageStore {
  async countSince(): Promise<number> {
    throw new Error("count_failed");
  }

  async record(): Promise<void> {
    throw new Error("record_failed");
  }
}
