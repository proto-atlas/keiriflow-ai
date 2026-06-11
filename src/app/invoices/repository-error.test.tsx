import { beforeEach, describe, expect, it, vi } from "vitest";
import ExportPage from "./export/page";
import InvoiceDetailPage from "./[id]/page";
import InvoicesPage from "./page";

const repository = {
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
};

vi.mock("@/lib/server/document-repository", () => ({
  getDocumentRepository: () => repository,
}));

describe("証憑ページのデータ取得失敗", () => {
  beforeEach(() => {
    repository.getDocument.mockReset();
    repository.listDocuments.mockReset();
  });

  it("一覧ページは取得失敗時もページを返す", async () => {
    repository.listDocuments.mockRejectedValue(new Error("database unavailable"));

    await expect(InvoicesPage()).resolves.toBeTruthy();
  });

  it("CSV出力ページは取得失敗時もページを返す", async () => {
    repository.listDocuments.mockRejectedValue(new Error("database unavailable"));

    await expect(ExportPage()).resolves.toBeTruthy();
  });

  it("詳細ページは取得失敗時もページを返す", async () => {
    repository.getDocument.mockRejectedValue(new Error("database unavailable"));

    await expect(InvoiceDetailPage({ params: Promise.resolve({ id: "mock-doc-001" }) })).resolves.toBeTruthy();
  });
});
