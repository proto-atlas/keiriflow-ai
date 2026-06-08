import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentRepository, resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { PATCH } from "./route";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PATCH /api/documents/[id]", () => {
  it("不正Bodyを渡したら400 invalid_requestを返す", async () => {
    const response = await PATCH(createJsonRequest({ status: "Unknown" }), createContext("doc-001"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("存在しないIDを渡したら404 document_not_foundを返す", async () => {
    const response = await PATCH(createJsonRequest({ status: "Extracted" }), createContext("missing-doc"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("document_not_found");
  });

  it("UploadedからExtractedへのstatus PATCHなら200を返す", async () => {
    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録",
      file: new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    });

    const response = await PATCH(createJsonRequest({ status: "Extracted" }), createContext(uploaded.id));
    const body = (await response.json()) as { document: { id: string; status: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.id).toBe(uploaded.id);
    expect(body.document.status).toBe("Extracted");
    expect(body.mode).toBe("mock");
  });

  it("UploadedからApprovedへのstatus PATCHなら409 invalid_status_transitionを返す", async () => {
    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録",
      file: new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    });

    const response = await PATCH(createJsonRequest({ status: "Approved" }), createContext(uploaded.id));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("invalid_status_transition");
  });

  it("承認済み証憑の抽出項目PATCHなら409 document_lockedを返す", async () => {
    const response = await PATCH(createJsonRequest({ vendorName: "承認後更新株式会社" }), createContext("doc-004"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("document_locked");
  });
});

function createJsonRequest(body: object) {
  return new Request("http://localhost/api/documents/doc-001", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function createContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
