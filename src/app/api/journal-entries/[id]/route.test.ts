import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { PATCH } from "./route";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PATCH /api/journal-entries/[id]", () => {
  it("未確定証憑の仕訳候補なら更新できる", async () => {
    const response = await PATCH(createJsonRequest({ debitAccount: "販売促進費" }), createContext("journal-001"));
    const body = (await response.json()) as { document: { journalEntry: { debitAccount: string } }; mode: string };

    expect(response.status).toBe(200);
    expect(body.document.journalEntry.debitAccount).toBe("販売促進費");
    expect(body.mode).toBe("mock");
  });

  it("承認済み証憑の仕訳候補なら409 document_lockedを返す", async () => {
    const response = await PATCH(createJsonRequest({ debitAccount: "消耗品費" }), createContext("journal-004"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("document_locked");
  });
});

function createJsonRequest(body: object) {
  return new Request("http://localhost/api/journal-entries/journal-001", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function createContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
