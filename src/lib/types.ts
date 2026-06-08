export type DocumentStatus =
  | "Uploaded"
  | "Extracted"
  | "NeedsReview"
  | "Reviewed"
  | "PendingApproval"
  | "Approved"
  | "Rejected"
  | "Exported";

export type DocumentType = "invoice" | "receipt";
export type WarningStatus = "open" | "acknowledged" | "resolved";
export type WarningSeverity = "info" | "warning" | "critical";
export type ActorType = "user" | "ai" | "system";

export type DocumentLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  confidenceScore: number;
};

export type JournalEntry = {
  id: string;
  debitAccount: string;
  debitAmount: number;
  debitTaxCategory: string;
  creditAccount: string;
  creditAmount: number;
  creditTaxCategory: string;
  department: string;
  description: string;
  aiReason: string;
  confidenceScore: number;
};

export type PolicyWarning = {
  id: string;
  warningType:
    | "high_amount"
    | "duplicate"
    | "missing_registration_number"
    | "low_confidence_extraction"
    | "amount_mismatch";
  severity: WarningSeverity;
  message: string;
  status: WarningStatus;
};

export type Approval = {
  id: string;
  approverName: string;
  status: "pending" | "approved" | "rejected";
  comment: string;
  requestedAt: string;
  respondedAt?: string;
};

export type AuditLog = {
  id: string;
  actorType: ActorType;
  actorName: string;
  action: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
};

export type AccountingDocument = {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  vendorName: string;
  invoiceNumber: string;
  registrationNumber: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  confidenceScore: number;
  fileStoragePath: string;
  fileMediaType: string;
  fileName: string;
  memo: string;
  updatedAt: string;
  // 明細行は将来拡張用のモデル境界。現在の構成のSupabase modeでは永続化せず、UIにも表示しない。
  lines: DocumentLine[];
  journalEntry: JournalEntry;
  warnings: PolicyWarning[];
  approval?: Approval;
  auditLogs: AuditLog[];
};
