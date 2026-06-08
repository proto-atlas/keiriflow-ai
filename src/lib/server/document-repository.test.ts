import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNEXTRACTED_PLACEHOLDER } from "../document-placeholders";
import { getDocumentRepository, RepositoryConflictError, resetMockUploadedDocumentsForTesting } from "./document-repository";

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
});

describe("getDocumentRepository", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Supabaseのserver envがない場合はmock repositoryを返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(getDocumentRepository().mode).toBe("mock");
  });
});

describe("MockDocumentRepository", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ステータスを指定したら該当する証憑だけを返す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const documents = await repository.listDocuments({ status: "Approved" });

    expect(documents.map((document) => document.id)).toEqual(["doc-004"]);
  });

  it("アップロード入力を渡したらプレビュー用の証憑を返す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.createDocumentFromUpload({
      documentType: "receipt",
      memo: "交通費",
      file: new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    });

    expect(document.documentType).toBe("receipt");
    expect(document.fileName).toBe("receipt.jpg");
    expect(document.status).toBe("Uploaded");
    expect(document.id.startsWith("mock-upload-")).toBe(true);
    expect(document.vendorName).toBe(UNEXTRACTED_PLACEHOLDER);
    expect(document.fileMediaType).toBe("image/jpeg");
    expect(document.fileStoragePath).toBe(document.id);
    expect(document.lines).toEqual([]);
  });

  it("アップロード入力を渡したらファイル本文をrepositoryから取得できる", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.createDocumentFromUpload({
      documentType: "receipt",
      memo: "交通費",
      file: new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    });
    const documentFile = await repository.getDocumentFile(document.id);

    expect(documentFile?.fileName).toBe("receipt.jpg");
    expect(documentFile?.mediaType).toBe("image/jpeg");
    expect(new TextDecoder().decode(documentFile?.bytes)).toBe("receipt");
  });

  it("mockアップロード状態をリセットしたら登録済み証憑を一覧から消す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録",
      file: new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    });

    expect((await repository.listDocuments()).map((document) => document.id)).toContain(uploaded.id);

    resetMockUploadedDocumentsForTesting();

    expect((await repository.listDocuments()).map((document) => document.id)).not.toContain(uploaded.id);
  });

  it("2回連続でアップロードしても2件目に重複候補警告を付けない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録1",
      file: new File(["invoice"], "invoice-1.pdf", { type: "application/pdf" }),
    });
    const second = await repository.createDocumentFromUpload({
      documentType: "invoice",
      memo: "一時登録2",
      file: new File(["invoice"], "invoice-2.pdf", { type: "application/pdf" }),
    });

    expect(second.warnings.map((warning) => warning.warningType)).not.toContain("duplicate");
  });

  it("仕訳候補を更新したら監査ログを先頭に追加する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.updateJournalEntry("journal-001", {
      debitAccount: "販売促進費",
    });

    expect(document.journalEntry.debitAccount).toBe("販売促進費");
    expect(document.auditLogs[0].action).toBe("仕訳更新");
  });

  it("警告を確認済みにしたら警告ステータスと監査ログを更新する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.updateWarning("doc-001", "warning-001", {
      status: "acknowledged",
    });

    expect(document.warnings[0].status).toBe("acknowledged");
    expect(document.auditLogs[0].action).toBe("警告更新");
  });

  it("警告を確認済みにした後に証憑を更新しても警告ステータスを保持する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    await repository.updateWarning("doc-001", "warning-001", {
      status: "acknowledged",
    });
    const document = await repository.updateDocument("doc-001", {
      memo: "確認後にメモを更新",
    });
    const highAmountWarning = document.warnings.find((warning) => warning.warningType === "high_amount");

    expect(highAmountWarning?.status).toBe("acknowledged");
  });

  it("アップロード後に証憑を複数回更新したら監査ログを先頭に積む", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const uploaded = await repository.createDocumentFromUpload({
      documentType: "receipt",
      memo: "交通費",
      file: new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    });
    await repository.updateDocument(uploaded.id, {
      status: "Extracted",
    });
    const document = await repository.updateDocument(uploaded.id, {
      vendorName: "サンプル更新株式会社",
    });

    expect(document.auditLogs.map((log) => log.action)).toEqual([
      "証憑更新",
      "証憑更新",
      "証憑アップロード",
    ]);
  });

  it("承認依頼を作成したら承認待ちステータスにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.requestApproval("doc-002", {
      approverName: "承認者",
      comment: "確認お願いします。",
    });

    expect(document.status).toBe("PendingApproval");
    expect(document.approval?.status).toBe("pending");
  });

  it("レビュー済み以外から承認依頼を作成しようとしたらconflictにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();

    await expect(
      repository.requestApproval("doc-004", {
        approverName: "承認者",
        comment: "確認お願いします。",
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("承認応答がapprovedなら証憑ステータスを承認済みにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.respondApproval("approval-001", {
      status: "approved",
      comment: "問題ありません。",
    });

    expect(document.status).toBe("Approved");
    expect(document.approval?.status).toBe("approved");
  });

  it("応答済みの承認に再応答しようとしたらconflictにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    await repository.respondApproval("approval-001", {
      status: "approved",
      comment: "問題ありません。",
    });

    await expect(
      repository.respondApproval("approval-001", {
        status: "rejected",
        comment: "再応答します。",
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("承認応答がrejectedなら証憑ステータスを差し戻しにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();
    const document = await repository.respondApproval("approval-001", {
      status: "rejected",
      comment: "差し戻します。",
    });

    expect(document.status).toBe("Rejected");
    expect(document.approval?.status).toBe("rejected");
  });

  it("承認済み証憑の抽出項目を更新しようとしたらconflictにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();

    await expect(
      repository.updateDocument("doc-004", {
        vendorName: "承認後更新株式会社",
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("承認済み証憑の仕訳候補を更新しようとしたらconflictにする", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const repository = getDocumentRepository();

    await expect(
      repository.updateJournalEntry("journal-004", {
        debitAccount: "消耗品費",
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });
});
