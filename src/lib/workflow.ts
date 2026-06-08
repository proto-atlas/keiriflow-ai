import { UNEXTRACTED_PLACEHOLDER } from "./document-placeholders";
import type { AccountingDocument, DocumentStatus, PolicyWarning } from "./types";

const UTF8_BOM = "\uFEFF";

// デモ上は10万円以上を承認者確認が必要な支出として強調します。
export const HIGH_AMOUNT_REVIEW_THRESHOLD_YEN = 100_000;

// AI候補を人間が重点確認する境界として、UI表示と警告生成で同じ値を使います。
export const CONFIDENCE_REVIEW_THRESHOLD = 0.8;

export const statusLabels: Record<DocumentStatus, string> = {
  Uploaded: "アップロード済み",
  Extracted: "AI抽出済み",
  NeedsReview: "要確認",
  Reviewed: "レビュー済み",
  PendingApproval: "承認待ち",
  Approved: "承認済み",
  Rejected: "差し戻し",
  Exported: "CSV出力済み",
};

export const warningTitles: Record<PolicyWarning["warningType"], string> = {
  high_amount: "高額支出",
  duplicate: "重複候補",
  missing_registration_number: "登録番号未確認",
  low_confidence_extraction: "抽出信頼度低",
  amount_mismatch: "金額不一致",
};

export const warningStatusLabels: Record<PolicyWarning["status"], string> = {
  open: "未確認",
  acknowledged: "確認済み",
  resolved: "解消済み",
};

export const statusOrder: DocumentStatus[] = [
  "Uploaded",
  "Extracted",
  "NeedsReview",
  "Reviewed",
  "PendingApproval",
  "Approved",
  "Exported",
];

export function getOpenWarnings(document: AccountingDocument): PolicyWarning[] {
  return document.warnings.filter((warning) => warning.status === "open");
}

export function getDashboardSummary(documents: AccountingDocument[]) {
  return {
    uploaded: documents.filter((document) => document.status === "Uploaded").length,
    needsReview: documents.filter((document) => document.status === "NeedsReview").length,
    pendingApproval: documents.filter((document) => document.status === "PendingApproval").length,
    approved: documents.filter((document) => document.status === "Approved").length,
    warningCount: documents.reduce(
      (total, document) => total + getOpenWarnings(document).length,
      0,
    ),
    monthlyAmount: documents
      .filter(
        (document) =>
          document.status === "Reviewed" ||
          document.status === "Approved" ||
          document.status === "Exported",
      )
      .reduce((total, document) => total + document.totalAmount, 0),
  };
}

export function getNextReviewStatus(status: DocumentStatus): DocumentStatus {
  if (status === "Uploaded") {
    return "Extracted";
  }

  if (status === "Extracted") {
    return "NeedsReview";
  }

  if (status === "NeedsReview") {
    return "Reviewed";
  }

  if (status === "Reviewed") {
    return "PendingApproval";
  }

  if (status === "PendingApproval") {
    return "Approved";
  }

  if (status === "Approved") {
    return "Exported";
  }

  return status;
}

export function isPatchStatusTransitionAllowed(current: DocumentStatus, next: DocumentStatus): boolean {
  if (current === next) {
    return true;
  }

  const allowedTransitions: Partial<Record<DocumentStatus, DocumentStatus[]>> = {
    Uploaded: ["Extracted"],
    Extracted: ["NeedsReview"],
    NeedsReview: ["Reviewed"],
    Approved: ["Exported"],
  };

  return allowedTransitions[current]?.includes(next) ?? false;
}

export function isAmountConsistent(document: Pick<AccountingDocument, "subtotal" | "taxAmount" | "totalAmount">) {
  return Math.abs(document.subtotal + document.taxAmount - document.totalAmount) < 1e-9;
}

export function buildPolicyWarnings(
  document: AccountingDocument,
  documents: AccountingDocument[],
): PolicyWarning[] {
  const warnings: PolicyWarning[] = [];

  addWarning(warnings, document, "high_amount", document.totalAmount >= HIGH_AMOUNT_REVIEW_THRESHOLD_YEN);
  addWarning(
    warnings,
    document,
    "missing_registration_number",
    document.registrationNumber.trim().length === 0,
  );
  addWarning(
    warnings,
    document,
    "low_confidence_extraction",
    document.confidenceScore < CONFIDENCE_REVIEW_THRESHOLD,
  );
  addWarning(warnings, document, "amount_mismatch", !isAmountConsistent(document));
  addWarning(warnings, document, "duplicate", hasDuplicateCandidate(document, documents));

  return preserveWarningStatuses(warnings, document.warnings);
}

export function toDocumentsCsv(documents: AccountingDocument[]): string {
  const headers = [
    "取引日",
    "借方勘定科目",
    "借方金額",
    "借方税区分",
    "貸方勘定科目",
    "貸方金額",
    "貸方税区分",
    "摘要",
    "取引先",
    "請求書番号",
    "ステータス",
  ];

  const rows = documents.map((document) => [
    document.issueDate,
    document.journalEntry.debitAccount,
    String(document.journalEntry.debitAmount),
    document.journalEntry.debitTaxCategory,
    document.journalEntry.creditAccount,
    String(document.journalEntry.creditAmount),
    document.journalEntry.creditTaxCategory,
    document.journalEntry.description,
    document.vendorName,
    document.invoiceNumber,
    statusLabels[document.status],
  ]);

  return `${UTF8_BOM}${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

function addWarning(
  warnings: PolicyWarning[],
  document: AccountingDocument,
  warningType: PolicyWarning["warningType"],
  enabled: boolean,
) {
  if (!enabled) {
    return;
  }

  warnings.push({
    id: `warning-${document.id}-${warningType}`,
    warningType,
    severity: warningType === "amount_mismatch" ? "critical" : "warning",
    message: warningMessages[warningType],
    status: "open",
  });
}

const warningMessages: Record<PolicyWarning["warningType"], string> = {
  high_amount: "10万円以上の支出です。承認者による確認が必要です。",
  duplicate: "同じ内容の証憑が既に登録されている可能性があります。",
  missing_registration_number: "インボイス登録番号が確認できません。必要に応じて取引先情報を確認してください。",
  low_confidence_extraction: "抽出信頼度が低いため、証憑画像と抽出結果を重点的に確認してください。",
  amount_mismatch: "小計と消費税額の合計が、請求合計額と一致していません。",
};

function preserveWarningStatuses(warnings: PolicyWarning[], currentWarnings: PolicyWarning[]): PolicyWarning[] {
  return warnings.map((warning) => {
    const current = currentWarnings.find((candidate) => candidate.warningType === warning.warningType);
    return current ? { ...warning, status: current.status } : warning;
  });
}

function hasDuplicateCandidate(document: AccountingDocument, documents: AccountingDocument[]) {
  return documents.some((candidate) => {
    if (candidate.id === document.id) {
      return false;
    }

    if (hasUnextractedIdentity(document) || hasUnextractedIdentity(candidate)) {
      return false;
    }

    if (candidate.invoiceNumber && candidate.invoiceNumber === document.invoiceNumber) {
      return true;
    }

    return (
      candidate.vendorName === document.vendorName &&
      candidate.issueDate === document.issueDate &&
      candidate.totalAmount === document.totalAmount
    );
  });
}

function hasUnextractedIdentity(document: Pick<AccountingDocument, "vendorName" | "invoiceNumber">) {
  return (
    document.vendorName === UNEXTRACTED_PLACEHOLDER ||
    document.invoiceNumber === UNEXTRACTED_PLACEHOLDER
  );
}

function escapeCsvCell(value: string): string {
  const escapedValue = /^[=+\-@\t]/.test(value) ? `'${value}` : value;

  if (!/[",\n\r]/.test(escapedValue)) {
    return escapedValue;
  }

  return `"${escapedValue.replaceAll('"', '""')}"`;
}
