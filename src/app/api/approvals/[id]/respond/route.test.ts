import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { POST } from "./route";

const PENDING_APPROVAL_ID = "approval-001";
const PENDING_APPROVAL_DOCUMENT_ID = "doc-003";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/approvals/[id]/respond", () => {
  it("approvedで応答したら証憑ステータスがApprovedになる", async () => {
    const response = await POST(createJsonRequest({ status: "approved" }, PENDING_APPROVAL_ID), createContext(PENDING_APPROVAL_ID));
    const body = (await response.json()) as { document: { id: string; status: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.id).toBe(PENDING_APPROVAL_DOCUMENT_ID);
    expect(body.document.status).toBe("Approved");
    expect(body.mode).toBe("mock");
  });

  it("rejectedで応答したら証憑ステータスがRejectedになる", async () => {
    const response = await POST(createJsonRequest({ status: "rejected" }, PENDING_APPROVAL_ID), createContext(PENDING_APPROVAL_ID));
    const body = (await response.json()) as { document: { id: string; status: string }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.id).toBe(PENDING_APPROVAL_DOCUMENT_ID);
    expect(body.document.status).toBe("Rejected");
    expect(body.mode).toBe("mock");
  });

  it("応答済みapprovalへ再応答したら409 invalid_approval_stateを返す", async () => {
    await POST(createJsonRequest({ status: "approved" }, PENDING_APPROVAL_ID), createContext(PENDING_APPROVAL_ID));

    const response = await POST(createJsonRequest({ status: "rejected" }, PENDING_APPROVAL_ID), createContext(PENDING_APPROVAL_ID));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("invalid_approval_state");
  });

  it("存在しないapprovalIdなら404 approval_not_foundを返す", async () => {
    const response = await POST(createJsonRequest({ status: "approved" }, "missing-approval"), createContext("missing-approval"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("approval_not_found");
  });

  it("不正Bodyを渡したら400 invalid_requestを返す", async () => {
    const response = await POST(createJsonRequest({ status: "pending" }, PENDING_APPROVAL_ID), createContext(PENDING_APPROVAL_ID));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });
});

function createJsonRequest(body: object, approvalId: string) {
  return new Request(`http://localhost/api/approvals/${approvalId}/respond`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function createContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
