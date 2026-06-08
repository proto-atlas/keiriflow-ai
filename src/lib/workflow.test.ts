import { describe, expect, it } from "vitest";
import { UNEXTRACTED_PLACEHOLDER } from "./document-placeholders";
import { mockDocuments } from "./mock-data";
import type { DocumentStatus } from "./types";
import {
  buildPolicyWarnings,
  getDashboardSummary,
  getNextReviewStatus,
  getOpenWarnings,
  isAmountConsistent,
  isPatchStatusTransitionAllowed,
  toDocumentsCsv,
} from "./workflow";

const documentStatuses: DocumentStatus[] = [
  "Uploaded",
  "Extracted",
  "NeedsReview",
  "Reviewed",
  "PendingApproval",
  "Approved",
  "Rejected",
  "Exported",
];

describe("getDashboardSummary", () => {
  it("証憑一覧を渡したらステータス別件数と警告件数を集計する", () => {
    expect(getDashboardSummary(mockDocuments)).toEqual({
      uploaded: 0,
      needsReview: 1,
      pendingApproval: 1,
      approved: 1,
      warningCount: 2,
      monthlyAmount: 46400,
    });
  });

  it("CSV出力済み証憑も確定済み金額に含める", () => {
    const exportedDocument = {
      ...mockDocuments[3],
      id: "doc-exported",
      status: "Exported" as const,
      totalAmount: 1200,
    };

    expect(getDashboardSummary([mockDocuments[1], exportedDocument]).monthlyAmount).toBe(44000);
  });
});

describe("getOpenWarnings", () => {
  it("未確認の警告だけを返す", () => {
    expect(getOpenWarnings(mockDocuments[0]).map((warning) => warning.id)).toEqual([
      "warning-001",
      "warning-002",
    ]);
  });
});

describe("buildPolicyWarnings", () => {
  it("10万円以上で登録番号が空なら高額支出と登録番号未確認を返す", () => {
    expect(buildPolicyWarnings(mockDocuments[0], mockDocuments).map((warning) => warning.warningType)).toEqual([
      "high_amount",
      "missing_registration_number",
    ]);
  });

  it("小計と税額が合計金額に一致しなければ金額不一致を返す", () => {
    const document = {
      ...mockDocuments[1],
      subtotal: 30000,
      taxAmount: 3000,
      totalAmount: 40000,
    };

    expect(buildPolicyWarnings(document, mockDocuments).map((warning) => warning.warningType)).toEqual([
      "amount_mismatch",
    ]);
  });

  it("同じ請求書番号の証憑があれば重複候補を返す", () => {
    const duplicate = {
      ...mockDocuments[1],
      id: "doc-duplicate",
      totalAmount: 42800,
    };

    expect(buildPolicyWarnings(duplicate, mockDocuments).map((warning) => warning.warningType)).toEqual([
      "duplicate",
    ]);
  });

  it("未抽出の仮値同士なら重複候補を返さない", () => {
    const uploadedDocument = {
      ...mockDocuments[1],
      id: "mock-upload-a",
      vendorName: UNEXTRACTED_PLACEHOLDER,
      invoiceNumber: UNEXTRACTED_PLACEHOLDER,
      registrationNumber: "T0000000000000",
      issueDate: "2026-05-06",
      subtotal: 1,
      taxAmount: 0,
      totalAmount: 1,
      confidenceScore: 0.9,
      warnings: [],
    };
    const candidate = {
      ...mockDocuments[2],
      id: "mock-upload-b",
      vendorName: UNEXTRACTED_PLACEHOLDER,
      invoiceNumber: UNEXTRACTED_PLACEHOLDER,
      registrationNumber: "T0000000000001",
      issueDate: "2026-05-06",
      subtotal: 1,
      taxAmount: 0,
      totalAmount: 1,
      confidenceScore: 0.9,
      warnings: [],
    };

    expect(
      buildPolicyWarnings(uploadedDocument, [uploadedDocument, candidate]).map((warning) => warning.warningType),
    ).toEqual([]);
  });

  it("登録番号があって抽出信頼度が低い場合は信頼度低の警告だけを返す", () => {
    const document = {
      ...mockDocuments[1],
      confidenceScore: 0.79,
    };

    expect(buildPolicyWarnings(document, mockDocuments).map((warning) => warning.warningType)).toEqual([
      "low_confidence_extraction",
    ]);
  });

  it("既存警告が確認済みなら警告再計算後も確認済みを保持する", () => {
    const document = {
      ...mockDocuments[0],
      warnings: mockDocuments[0].warnings.map((warning) =>
        warning.warningType === "high_amount" ? { ...warning, status: "acknowledged" as const } : warning,
      ),
    };

    expect(buildPolicyWarnings(document, mockDocuments).find((warning) => warning.warningType === "high_amount"))
      .toMatchObject({
        warningType: "high_amount",
        status: "acknowledged",
      });
  });
});

describe("getNextReviewStatus", () => {
  it("要確認を渡したらレビュー済みを返す", () => {
    expect(getNextReviewStatus("NeedsReview")).toBe("Reviewed");
  });

  it("承認済みを渡したらCSV出力済みを返す", () => {
    expect(getNextReviewStatus("Approved")).toBe("Exported");
  });
});

describe("isPatchStatusTransitionAllowed", () => {
  it("アップロード済みからAI抽出済みへのPATCHならtrueを返す", () => {
    expect(isPatchStatusTransitionAllowed("Uploaded", "Extracted")).toBe(true);
  });

  it("アップロード済みから承認済みへのPATCHならfalseを返す", () => {
    expect(isPatchStatusTransitionAllowed("Uploaded", "Approved")).toBe(false);
  });

  it("レビュー済みから承認待ちへのPATCHならfalseを返す", () => {
    expect(isPatchStatusTransitionAllowed("Reviewed", "PendingApproval")).toBe(false);
  });

  it("許可遷移と同一ステータス以外の組み合わせならfalseを返す", () => {
    const allowedTransitions = new Set([
      "Uploaded->Uploaded",
      "Uploaded->Extracted",
      "Extracted->Extracted",
      "Extracted->NeedsReview",
      "NeedsReview->NeedsReview",
      "NeedsReview->Reviewed",
      "Reviewed->Reviewed",
      "PendingApproval->PendingApproval",
      "Approved->Approved",
      "Approved->Exported",
      "Rejected->Rejected",
      "Exported->Exported",
    ]);

    for (const current of documentStatuses) {
      for (const next of documentStatuses) {
        const transition = `${current}->${next}`;
        expect(isPatchStatusTransitionAllowed(current, next)).toBe(allowedTransitions.has(transition));
      }
    }
  });
});

describe("isAmountConsistent", () => {
  it("小計と税額の合計が合計金額と一致したらtrueを返す", () => {
    expect(isAmountConsistent({ subtotal: 100000, taxAmount: 10000, totalAmount: 110000 })).toBe(true);
  });

  it("小計と税額の合計が合計金額と異なればfalseを返す", () => {
    expect(isAmountConsistent({ subtotal: 100000, taxAmount: 9000, totalAmount: 110000 })).toBe(false);
  });
});

describe("toDocumentsCsv", () => {
  it("承認済み証憑を渡したらCSVヘッダーと仕訳行を返す", () => {
    const csv = toDocumentsCsv([mockDocuments[3]]);

    expect(csv.split("\r\n")[0]).toBe(
      "\uFEFF取引日,借方勘定科目,借方金額,借方税区分,貸方勘定科目,貸方金額,貸方税区分,摘要,取引先,請求書番号,ステータス",
    );
    expect(csv.split("\r\n")[1]).toBe(
      "2026-05-04,旅費交通費,3600,課税仕入10%,未払金,3600,対象外,電車運賃,サンプル交通株式会社,TR-2026-003,承認済み",
    );
  });

  it("数式として解釈される値を渡したら先頭にアポストロフィーを付ける", () => {
    const csv = toDocumentsCsv([
      {
        ...mockDocuments[3],
        vendorName: "=cmd",
        invoiceNumber: "+1",
        journalEntry: {
          ...mockDocuments[3].journalEntry,
          description: "@SUM",
        },
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe(
      "2026-05-04,旅費交通費,3600,課税仕入10%,未払金,3600,対象外,'@SUM,'=cmd,'+1,承認済み",
    );
  });

  it("CRを含む値を渡したらCSVセルをquoteする", () => {
    const csv = toDocumentsCsv([
      {
        ...mockDocuments[3],
        vendorName: "サンプル\r交通株式会社",
      },
    ]);

    expect(csv.split("\r\n")[1]).toBe(
      '2026-05-04,旅費交通費,3600,課税仕入10%,未払金,3600,対象外,電車運賃,"サンプル\r交通株式会社",TR-2026-003,承認済み',
    );
  });
});
