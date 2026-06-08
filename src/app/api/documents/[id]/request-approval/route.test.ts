import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { POST } from "./route";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/documents/[id]/request-approval", () => {
  it("レビュー済み証憑なら承認依頼を作成する", async () => {
    const response = await POST(
      createJsonRequest({ approverName: "承認者", comment: "確認お願いします。" }),
      createContext("doc-002"),
    );
    const body = (await response.json()) as { document: { id: string; status: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.id).toBe("doc-002");
    expect(body.document.status).toBe("PendingApproval");
    expect(body.mode).toBe("mock");
  });

  it("レビュー済み以外の証憑なら409 invalid_status_transitionを返す", async () => {
    const response = await POST(
      createJsonRequest({ approverName: "承認者", comment: "確認お願いします。" }),
      createContext("doc-004"),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("invalid_status_transition");
  });
});

function createJsonRequest(body: object) {
  return new Request("http://localhost/api/documents/doc-002/request-approval", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function createContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
