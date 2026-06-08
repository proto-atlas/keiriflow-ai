import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { GET } from "./route";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/documents", () => {
  it("fromに不正日付を渡したら400 invalid_date_filterを返す", async () => {
    const response = await GET(new Request("http://localhost/api/documents?from=bad-date"));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_date_filter");
  });

  it("statusフィルタを渡したら該当証憑だけを返す", async () => {
    const response = await GET(new Request("http://localhost/api/documents?status=Approved"));
    const body = (await response.json()) as {
      items: Array<{ id: string; status: string }>;
      total: number;
      mode: string;
    };

    expect(response.status).toBe(200);
    expect(body.items.map((item) => ({ id: item.id, status: item.status }))).toEqual([
      { id: "doc-004", status: "Approved" },
    ]);
    expect(body.total).toBe(1);
    expect(body.mode).toBe("mock");
  });
});
