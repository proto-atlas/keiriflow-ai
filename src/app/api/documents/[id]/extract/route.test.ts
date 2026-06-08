import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/demo-rate-limit", () => ({
  enforceDemoAccess: vi.fn(() => Promise.resolve(null)),
}));

import { getDocumentRepository, resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
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

describe("POST /api/documents/[id]/extract", () => {
  it("アップロード直後の証憑なら抽出候補を更新できる", async () => {
    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録",
      file: new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    });

    const response = await POST(new Request("http://localhost/api/documents/upload/extract", { method: "POST" }), createContext(uploaded.id));
    const body = (await response.json()) as { document: { confidenceScore: number; id: string; status: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.id).toBe(uploaded.id);
    expect(body.document.status).toBe("Extracted");
    expect(body.document.confidenceScore).toBe(0.86);
    expect(body.mode).toBe("mock");
  });

  it("承認済み証憑なら409 invalid_status_transitionを返す", async () => {
    const response = await POST(new Request("http://localhost/api/documents/doc-004/extract", { method: "POST" }), createContext("doc-004"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("invalid_status_transition");
  });

  it("Anthropic modeでprovider設定が不足したら503 provider_not_configuredを返す", async () => {
    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録",
      file: new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    });

    vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "");

    const response = await POST(new Request("http://localhost/api/documents/upload/extract", { method: "POST" }), createContext(uploaded.id));
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
