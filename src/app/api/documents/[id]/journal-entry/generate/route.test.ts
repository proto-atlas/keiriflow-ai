import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/demo-rate-limit", () => ({
  enforceDemoAccess: vi.fn(() => Promise.resolve(null)),
}));

import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { POST } from "./route";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/documents/[id]/journal-entry/generate", () => {
  it("未確定証憑なら仕訳候補を返す", async () => {
    const response = await POST(new Request("http://localhost/api/documents/doc-001/journal-entry/generate"), createContext("doc-001"));
    const body = (await response.json()) as { journalEntry: { debitAccount: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.journalEntry.debitAccount).toBe("広告宣伝費");
    expect(body.mode).toBe("mock");
  });

  it("承認済み証憑なら409 document_lockedを返す", async () => {
    const response = await POST(new Request("http://localhost/api/documents/doc-004/journal-entry/generate"), createContext("doc-004"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("document_locked");
  });

  it("Anthropic modeでprovider設定が不足したら503 provider_not_configuredを返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "");

    const response = await POST(new Request("http://localhost/api/documents/doc-001/journal-entry/generate"), createContext("doc-001"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("provider_not_configured");
  });
});

function createContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
