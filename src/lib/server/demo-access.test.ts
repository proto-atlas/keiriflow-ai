import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_ACCESS_KEY_HEADER, hashDemoGuardValue, verifyDemoAccessRequest } from "./demo-access";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyDemoAccessRequest", () => {
  it("環境変数が未設定ならguardせずnullを返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "");

    const result = await verifyDemoAccessRequest(new Request("http://localhost/api/documents/upload"));

    expect(result).toBeNull();
  });

  it("外部接続モードで確認用キー環境変数が未設定なら503を返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "");

    const result = await verifyDemoAccessRequest(new Request("http://localhost/api/documents/upload"));
    const body = (await result?.json()) as { error: string };

    expect(result?.status).toBe(503);
    expect(body.error).toBe("demo_key_not_configured");
  });

  it("確認用キーが未入力なら401 demo_key_requiredを返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");

    const result = await verifyDemoAccessRequest(new Request("http://localhost/api/documents/upload"));
    const body = (await result?.json()) as { error: string };

    expect(result?.status).toBe(401);
    expect(body.error).toBe("demo_key_required");
  });

  it("確認用キーが一致しなければ401 invalid_demo_keyを返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");

    const result = await verifyDemoAccessRequest(
      new Request("http://localhost/api/documents/upload", {
        headers: {
          [DEMO_ACCESS_KEY_HEADER]: "wrong-secret",
        },
      }),
    );
    const body = (await result?.json()) as { error: string };

    expect(result?.status).toBe(401);
    expect(body.error).toBe("invalid_demo_key");
  });

  it("確認用キーが一致すればnullを返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");

    const result = await verifyDemoAccessRequest(
      new Request("http://localhost/api/documents/upload", {
        headers: {
          [DEMO_ACCESS_KEY_HEADER]: "demo-secret",
        },
      }),
    );

    expect(result).toBeNull();
  });
});

describe("hashDemoGuardValue", () => {
  it("同じ値なら同じSHA-256 hexを返す", async () => {
    const first = await hashDemoGuardValue("demo-secret");
    const second = await hashDemoGuardValue("demo-secret");

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("入力値そのものは返さない", async () => {
    const result = await hashDemoGuardValue("demo-secret");

    expect(result).not.toBe("demo-secret");
  });
});
