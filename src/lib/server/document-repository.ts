import type { SupabaseClient } from "@supabase/supabase-js";
import { UNEXTRACTED_PLACEHOLDER } from "../document-placeholders";
import { mockDocuments } from "../mock-data";
import type {
  AccountingDocument,
  ActorType,
  Approval,
  AuditLog,
  DocumentStatus,
  DocumentType,
  JournalEntry,
  PolicyWarning,
  WarningSeverity,
  WarningStatus,
} from "../types";
import { buildPolicyWarnings, isPatchStatusTransitionAllowed } from "../workflow";
import { createStorageObjectKey } from "./storage-path";
import { createSupabaseAdminClient } from "./supabase-client";

export type DocumentListFilters = {
  status?: DocumentStatus;
  vendorName?: string;
  hasWarnings?: boolean;
  from?: string;
  to?: string;
};

export type DocumentPatchInput = Partial<
  Pick<
    AccountingDocument,
    | "vendorName"
    | "invoiceNumber"
    | "registrationNumber"
    | "issueDate"
    | "dueDate"
    | "subtotal"
    | "taxAmount"
    | "totalAmount"
    | "taxRate"
    | "confidenceScore"
    | "memo"
    | "status"
  >
>;

export type DocumentUploadInput = {
  documentType: DocumentType;
  memo: string;
  file: File;
};

export type DocumentFile = {
  bytes: ArrayBuffer;
  mediaType: string;
  fileName: string;
};

export type JournalPatchInput = Partial<
  Pick<
    JournalEntry,
    | "debitAccount"
    | "debitAmount"
    | "debitTaxCategory"
    | "creditAccount"
    | "creditAmount"
    | "creditTaxCategory"
    | "department"
    | "description"
    | "aiReason"
    | "confidenceScore"
  >
>;

export type WarningPatchInput = {
  status: WarningStatus;
};

export type ApprovalRequestInput = {
  approverName: string;
  comment: string;
};

export type ApprovalResponseInput = {
  status: Approval["status"];
  comment: string;
};

export type DocumentRepository = {
  mode: "mock" | "supabase";
  listDocuments(filters?: DocumentListFilters): Promise<AccountingDocument[]>;
  getDocument(id: string): Promise<AccountingDocument | null>;
  getDocumentFile(id: string): Promise<DocumentFile | null>;
  createDocumentFromUpload(input: DocumentUploadInput): Promise<AccountingDocument>;
  updateDocument(id: string, input: DocumentPatchInput): Promise<AccountingDocument>;
  updateJournalEntry(journalEntryId: string, input: JournalPatchInput): Promise<AccountingDocument>;
  updateWarning(documentId: string, warningId: string, input: WarningPatchInput): Promise<AccountingDocument>;
  requestApproval(documentId: string, input: ApprovalRequestInput): Promise<AccountingDocument>;
  respondApproval(approvalId: string, input: ApprovalResponseInput): Promise<AccountingDocument>;
};

export function getDocumentRepository(): DocumentRepository {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return new MockDocumentRepository();
  }

  return new SupabaseDocumentRepository(supabase);
}

const mockUploadedDocuments: AccountingDocument[] = [];
const mockDocumentOverrides = new Map<string, AccountingDocument>();
const mockDocumentFiles = new Map<string, DocumentFile>();

export function resetMockUploadedDocumentsForTesting() {
  mockUploadedDocuments.splice(0, mockUploadedDocuments.length);
  mockDocumentOverrides.clear();
  mockDocumentFiles.clear();
}

function getMockDocuments() {
  return [...mockUploadedDocuments, ...mockDocuments].map(
    (document) => mockDocumentOverrides.get(document.id) ?? document,
  );
}

function findMockDocument(id: string) {
  return getMockDocuments().find((document) => document.id === id) ?? null;
}

function createUploadedMockDocument(input: DocumentUploadInput): AccountingDocument {
  const now = new Date().toISOString();
  const id = `mock-upload-${crypto.randomUUID()}`;
  const document: AccountingDocument = {
    id,
    documentType: input.documentType,
    status: "Uploaded",
    vendorName: UNEXTRACTED_PLACEHOLDER,
    invoiceNumber: UNEXTRACTED_PLACEHOLDER,
    registrationNumber: "",
    issueDate: now.slice(0, 10),
    dueDate: now.slice(0, 10),
    subtotal: 1,
    taxAmount: 0,
    totalAmount: 1,
    taxRate: 0,
    confidenceScore: 0,
    fileStoragePath: id,
    fileMediaType: input.file.type || "application/octet-stream",
    fileName: input.file.name,
    memo: input.memo,
    updatedAt: now,
    lines: [],
    journalEntry: {
      id: `journal-${id}`,
      debitAccount: "未設定",
      debitAmount: 1,
      debitTaxCategory: "対象外",
      creditAccount: "未設定",
      creditAmount: 1,
      creditTaxCategory: "対象外",
      department: "未設定",
      description: "AI抽出前",
      aiReason: "アップロード直後のため、抽出結果はまだ確定していません。",
      confidenceScore: 0,
    },
    warnings: [],
    auditLogs: [createAuditLog("証憑アップロード", "fileName", "", input.file.name)],
  };

  return {
    ...document,
    warnings: buildPolicyWarnings(document, getMockDocuments()),
  };
}

function saveMockDocument(document: AccountingDocument) {
  const uploadedIndex = mockUploadedDocuments.findIndex((candidate) => candidate.id === document.id);

  if (uploadedIndex >= 0) {
    mockUploadedDocuments[uploadedIndex] = document;
    return document;
  }

  mockDocumentOverrides.set(document.id, document);
  return document;
}

class MockDocumentRepository implements DocumentRepository {
  mode = "mock" as const;

  async listDocuments(filters: DocumentListFilters = {}) {
    return filterDocuments(getMockDocuments(), filters);
  }

  async getDocument(id: string) {
    return findMockDocument(id);
  }

  async getDocumentFile(id: string) {
    return mockDocumentFiles.get(id) ?? null;
  }

  async createDocumentFromUpload(input: DocumentUploadInput): Promise<AccountingDocument> {
    const document = createUploadedMockDocument(input);
    mockDocumentFiles.set(document.id, {
      bytes: await input.file.arrayBuffer(),
      mediaType: input.file.type || "application/octet-stream",
      fileName: input.file.name,
    });
    mockUploadedDocuments.unshift(document);
    return document;
  }

  async updateDocument(id: string, input: DocumentPatchInput): Promise<AccountingDocument> {
    const current = findMockDocument(id);

    if (!current) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertDocumentPatchAllowed(current, input);

    const updated = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    return saveMockDocument({
      ...updated,
      warnings: buildPolicyWarnings(updated, getMockDocuments()),
      auditLogs: [...createPatchAuditLogs(current, input), ...current.auditLogs],
    });
  }

  async updateJournalEntry(journalEntryId: string, input: JournalPatchInput): Promise<AccountingDocument> {
    const current = getMockDocuments().find((document) => document.journalEntry.id === journalEntryId);

    if (!current) {
      throw new RepositoryNotFoundError("journal_entry_not_found");
    }

    assertDocumentContentEditable(current);

    const journalEntry = {
      ...current.journalEntry,
      ...input,
    };

    return saveMockDocument({
      ...current,
      journalEntry,
      updatedAt: new Date().toISOString(),
      auditLogs: [...createJournalPatchAuditLogs(current.journalEntry, input), ...current.auditLogs],
    });
  }

  async updateWarning(
    documentId: string,
    warningId: string,
    input: WarningPatchInput,
  ): Promise<AccountingDocument> {
    const current = findMockDocument(documentId);

    if (!current) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    const target = current.warnings.find((warning) => warning.id === warningId);

    if (!target) {
      throw new RepositoryNotFoundError("warning_not_found");
    }

    return saveMockDocument({
      ...current,
      warnings: current.warnings.map((warning) =>
        warning.id === warningId ? { ...warning, status: input.status } : warning,
      ),
      updatedAt: new Date().toISOString(),
      auditLogs: [
        createAuditLog("警告更新", target.warningType, target.status, input.status),
        ...current.auditLogs,
      ],
    });
  }

  async requestApproval(documentId: string, input: ApprovalRequestInput): Promise<AccountingDocument> {
    const current = findMockDocument(documentId);

    if (!current) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertApprovalRequestAllowed(current);

    const approval: Approval = {
      id: `approval-${documentId}`,
      approverName: input.approverName,
      status: "pending",
      comment: input.comment,
      requestedAt: new Date().toISOString(),
    };

    const pendingStatus: DocumentStatus = "PendingApproval";

    return saveMockDocument({
      ...current,
      status: pendingStatus,
      approval,
      updatedAt: new Date().toISOString(),
      auditLogs: [
        createAuditLog("承認依頼", "status", current.status, pendingStatus),
        createAuditLog("承認依頼", "approverName", current.approval?.approverName ?? "", input.approverName),
        ...current.auditLogs,
      ],
    });
  }

  async respondApproval(approvalId: string, input: ApprovalResponseInput): Promise<AccountingDocument> {
    const current = getMockDocuments().find((document) => document.approval?.id === approvalId);

    if (!current || !current.approval) {
      throw new RepositoryNotFoundError("approval_not_found");
    }

    const nextStatus: DocumentStatus = input.status === "approved" ? "Approved" : "Rejected";

    assertApprovalResponseAllowed(current, current.approval);

    return saveMockDocument({
      ...current,
      status: nextStatus,
      approval: {
        ...current.approval,
        status: input.status,
        comment: input.comment,
        respondedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
      auditLogs: [
        createAuditLog("承認応答", "status", current.status, nextStatus),
        createAuditLog("承認応答", "approvalStatus", current.approval.status, input.status),
        ...current.auditLogs,
      ],
    });
  }
}

class SupabaseDocumentRepository implements DocumentRepository {
  mode = "supabase" as const;

  constructor(private readonly supabase: SupabaseClient) {}

  async listDocuments(filters: DocumentListFilters = {}) {
    let query = this.supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .order("updated_at", { ascending: false });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.vendorName) {
      query = query.ilike("vendor_name", `%${filters.vendorName}%`);
    }

    if (filters.from) {
      query = query.gte("issue_date", filters.from);
    }

    if (filters.to) {
      query = query.lte("issue_date", filters.to);
    }

    const { data, error } = await query;

    if (error) {
      throw new RepositoryError("list_documents_failed");
    }

    const documents = (data ?? []).map((row) => mapDocumentQueryRow(row as DocumentQueryRow));

    return filterDocuments(documents, filters);
  }

  async getDocument(id: string) {
    const { data, error } = await this.supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new RepositoryError("get_document_failed");
    }

    if (!data) {
      return null;
    }

    return mapDocumentQueryRow(data as DocumentQueryRow);
  }

  async getDocumentFile(id: string) {
    const document = await this.getDocument(id);

    if (!document?.fileStoragePath) {
      return null;
    }

    const { data, error } = await this.supabase.storage.from("documents").download(document.fileStoragePath);

    if (error) {
      throw new RepositoryError("storage_download_failed");
    }

    return {
      bytes: await data.arrayBuffer(),
      mediaType: document.fileMediaType || data.type || "application/octet-stream",
      fileName: document.fileName,
    };
  }

  async createDocumentFromUpload(input: DocumentUploadInput) {
    const filePath = createStorageObjectKey(input.file.name, input.file.type);
    const { error: uploadError } = await this.supabase.storage
      .from("documents")
      .upload(filePath, input.file, {
        contentType: input.file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new RepositoryError("storage_upload_failed");
    }

    const { data, error } = await this.supabase
      .from("documents")
      .insert({
        document_type: input.documentType,
        status: "Uploaded",
        vendor_name: UNEXTRACTED_PLACEHOLDER,
        invoice_number: UNEXTRACTED_PLACEHOLDER,
        registration_number: "",
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date().toISOString().slice(0, 10),
        subtotal: 1,
        tax_amount: 0,
        total_amount: 1,
        tax_rate: 0,
        confidence_score: 0,
        file_url: filePath,
        file_name: input.file.name,
        file_media_type: input.file.type || "application/octet-stream",
        memo: input.memo,
      })
      .select(DOCUMENT_SELECT)
      .single();

    if (error) {
      throw new RepositoryError("create_document_failed");
    }

    const created = mapDocumentQueryRow(data as DocumentQueryRow);

    await this.createInitialJournalEntry(created.id);
    await this.insertAuditLog(created.id, createAuditLog("証憑アップロード", "fileName", "", input.file.name));
    await this.syncPolicyWarnings(created);

    return (await this.getDocument(created.id)) ?? created;
  }

  async updateDocument(id: string, input: DocumentPatchInput) {
    const current = await this.getDocument(id);

    if (!current) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertDocumentPatchAllowed(current, input);

    const patch = mapDocumentPatchToRow(input);
    const { data, error } = await this.supabase
      .from("documents")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(DOCUMENT_SELECT)
      .single();

    if (error) {
      throw new RepositoryError("update_document_failed");
    }

    const logs = createPatchAuditLogs(current, input);
    await Promise.all(logs.map((log) => this.insertAuditLog(id, log)));
    await this.syncPolicyWarnings(mapDocumentQueryRow(data as DocumentQueryRow));

    const refreshed = await this.getDocument(id);
    return refreshed ?? mapDocumentQueryRow(data as DocumentQueryRow);
  }

  async updateJournalEntry(journalEntryId: string, input: JournalPatchInput) {
    const { data: currentRow, error: currentError } = await this.supabase
      .from("journal_entries")
      .select("*")
      .eq("id", journalEntryId)
      .single();

    if (currentError || !currentRow) {
      throw new RepositoryNotFoundError("journal_entry_not_found");
    }

    const current = mapJournalEntryRow(currentRow as JournalEntryRow);
    const documentId = (currentRow as JournalEntryRow).document_id;
    const currentDocument = await this.getDocument(documentId);

    if (!currentDocument) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertDocumentContentEditable(currentDocument);

    const patch = mapJournalPatchToRow(input);
    const { error } = await this.supabase
      .from("journal_entries")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", journalEntryId);

    if (error) {
      throw new RepositoryError("update_journal_entry_failed");
    }

    const logs = createJournalPatchAuditLogs(current, input);
    await Promise.all(logs.map((log) => this.insertAuditLog(documentId, log)));

    const refreshed = await this.getDocument(documentId);

    if (!refreshed) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    return refreshed;
  }

  async updateWarning(documentId: string, warningId: string, input: WarningPatchInput) {
    const { data: currentRow, error: currentError } = await this.supabase
      .from("policy_warnings")
      .select("*")
      .eq("id", warningId)
      .eq("document_id", documentId)
      .single();

    if (currentError || !currentRow) {
      throw new RepositoryNotFoundError("warning_not_found");
    }

    const current = mapPolicyWarningRow(currentRow as PolicyWarningRow);
    const { error } = await this.supabase
      .from("policy_warnings")
      .update({ status: input.status })
      .eq("id", warningId)
      .eq("document_id", documentId);

    if (error) {
      throw new RepositoryError("update_warning_failed");
    }

    await this.insertAuditLog(
      documentId,
      createAuditLog("警告更新", current.warningType, current.status, input.status),
    );

    const refreshed = await this.getDocument(documentId);

    if (!refreshed) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    return refreshed;
  }

  async requestApproval(documentId: string, input: ApprovalRequestInput) {
    const current = await this.getDocument(documentId);

    if (!current) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertApprovalRequestAllowed(current);

    const { error: approvalError } = await this.supabase.from("approvals").insert({
      document_id: documentId,
      approver_name: input.approverName,
      status: "pending",
      comment: input.comment,
    });

    if (approvalError) {
      throw new RepositoryError("request_approval_failed");
    }

    const { error: documentError } = await this.supabase
      .from("documents")
      .update({ status: "PendingApproval", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    if (documentError) {
      throw new RepositoryError("update_document_failed");
    }

    await this.insertAuditLog(documentId, createAuditLog("承認依頼", "status", current.status, "PendingApproval"));
    await this.insertAuditLog(
      documentId,
      createAuditLog("承認依頼", "approverName", current.approval?.approverName ?? "", input.approverName),
    );

    const refreshed = await this.getDocument(documentId);

    if (!refreshed) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    return refreshed;
  }

  async respondApproval(approvalId: string, input: ApprovalResponseInput) {
    const { data: approvalRow, error: approvalError } = await this.supabase
      .from("approvals")
      .select("*")
      .eq("id", approvalId)
      .single();

    if (approvalError || !approvalRow) {
      throw new RepositoryNotFoundError("approval_not_found");
    }

    const currentApproval = mapApprovalRow(approvalRow as ApprovalRow);
    const documentId = (approvalRow as ApprovalRow).document_id;
    const nextStatus: DocumentStatus = input.status === "approved" ? "Approved" : "Rejected";
    const currentDocument = await this.getDocument(documentId);

    if (!currentDocument) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    assertApprovalResponseAllowed(currentDocument, currentApproval);

    const { error: responseError } = await this.supabase
      .from("approvals")
      .update({
        status: input.status,
        comment: input.comment,
        responded_at: new Date().toISOString(),
      })
      .eq("id", approvalId);

    if (responseError) {
      throw new RepositoryError("respond_approval_failed");
    }

    const { error: documentError } = await this.supabase
      .from("documents")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    if (documentError) {
      throw new RepositoryError("update_document_failed");
    }

    await this.insertAuditLog(
      documentId,
      createAuditLog("承認応答", "status", currentDocument?.status ?? "PendingApproval", nextStatus),
    );
    await this.insertAuditLog(
      documentId,
      createAuditLog("承認応答", "approvalStatus", currentApproval.status, input.status),
    );

    const refreshed = await this.getDocument(documentId);

    if (!refreshed) {
      throw new RepositoryNotFoundError("document_not_found");
    }

    return refreshed;
  }

  private async insertAuditLog(documentId: string, log: AuditLog) {
    const { error } = await this.supabase.from("audit_logs").insert({
      document_id: documentId,
      actor_type: log.actorType,
      actor_name: log.actorName,
      action: log.action,
      field_name: log.fieldName,
      old_value: log.oldValue,
      new_value: log.newValue,
      created_at: log.createdAt,
    });

    if (error) {
      throw new RepositoryError("create_audit_log_failed");
    }
  }

  private async createInitialJournalEntry(documentId: string) {
    const { error } = await this.supabase.from("journal_entries").insert({
      document_id: documentId,
      debit_account: "未設定",
      debit_amount: 1,
      debit_tax_category: "対象外",
      credit_account: "未設定",
      credit_amount: 1,
      credit_tax_category: "対象外",
      department: "未設定",
      description: "AI抽出前",
      ai_reason: "アップロード直後のため、仕訳候補はまだ確定していません。",
      confidence_score: 0,
    });

    if (error) {
      throw new RepositoryError("create_journal_entry_failed");
    }
  }

  private async syncPolicyWarnings(document: AccountingDocument) {
    const documents = await this.listDocuments();
    const warnings = buildPolicyWarnings(document, documents);
    const warningIds = new Set(warnings.map((warning) => warning.id));
    const staleWarnings = document.warnings.filter((warning) => !warningIds.has(warning.id));

    if (warnings.length > 0) {
      const { error } = await this.supabase.from("policy_warnings").upsert(
        warnings.map((warning) => ({
          id: warning.id,
          document_id: document.id,
          warning_type: warning.warningType,
          severity: warning.severity,
          message: warning.message,
          status: warning.status,
        })),
        { onConflict: "id" },
      );

      if (error) {
        throw new RepositoryError("sync_policy_warnings_failed");
      }
    }

    await Promise.all(
      staleWarnings.map(async (warning) => {
        const { error } = await this.supabase
          .from("policy_warnings")
          .delete()
          .eq("id", warning.id)
          .eq("document_id", document.id);

        if (error) {
          throw new RepositoryError("sync_policy_warnings_failed");
        }
      }),
    );
  }
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export class RepositoryNotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryNotFoundError";
  }
}

export class RepositoryConflictError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

const LOCKED_DOCUMENT_CONTENT_STATUSES: readonly DocumentStatus[] = [
  "PendingApproval",
  "Approved",
  "Rejected",
  "Exported",
];

function assertDocumentPatchAllowed(current: AccountingDocument, input: DocumentPatchInput) {
  if (input.status !== undefined && !isPatchStatusTransitionAllowed(current.status, input.status)) {
    throw new RepositoryConflictError("invalid_status_transition");
  }

  if (hasDocumentContentPatch(input)) {
    assertDocumentContentEditable(current);
  }
}

function assertDocumentContentEditable(document: AccountingDocument) {
  if (LOCKED_DOCUMENT_CONTENT_STATUSES.includes(document.status)) {
    throw new RepositoryConflictError("document_locked");
  }
}

function assertApprovalRequestAllowed(document: AccountingDocument) {
  if (document.status !== "Reviewed") {
    throw new RepositoryConflictError("invalid_status_transition");
  }
}

function assertApprovalResponseAllowed(document: AccountingDocument, approval: Approval) {
  if (document.status !== "PendingApproval" || approval.status !== "pending") {
    throw new RepositoryConflictError("invalid_approval_state");
  }
}

function hasDocumentContentPatch(input: DocumentPatchInput) {
  return Object.keys(input).some((key) => key !== "status");
}

const DOCUMENT_SELECT = `
  *,
  journal_entries(*),
  policy_warnings(*),
  approvals(*),
  audit_logs(*)
`;

type DocumentQueryRow = {
  id: string;
  document_type: DocumentType;
  status: DocumentStatus;
  vendor_name: string;
  invoice_number: string;
  registration_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  tax_rate: number | string;
  confidence_score: number | string;
  file_url: string;
  file_name: string;
  file_media_type: string | null;
  memo: string;
  updated_at: string;
  journal_entries: JournalEntryRow[] | null;
  policy_warnings: PolicyWarningRow[] | null;
  approvals: ApprovalRow[] | null;
  audit_logs: AuditLogRow[] | null;
};

type JournalEntryRow = {
  id: string;
  document_id: string;
  debit_account: string;
  debit_amount: number | string;
  debit_tax_category: string;
  credit_account: string;
  credit_amount: number | string;
  credit_tax_category: string;
  department: string;
  description: string;
  ai_reason: string;
  confidence_score: number | string;
};

type PolicyWarningRow = {
  id: string;
  document_id?: string;
  warning_type: PolicyWarning["warningType"];
  severity: WarningSeverity;
  message: string;
  status: WarningStatus;
};

type ApprovalRow = {
  id: string;
  document_id: string;
  approver_name: string;
  status: Approval["status"];
  comment: string;
  requested_at: string;
  responded_at: string | null;
};

type AuditLogRow = {
  id: string;
  actor_type: ActorType;
  actor_name: string;
  action: string;
  field_name: string;
  old_value: string;
  new_value: string;
  created_at: string;
};

function filterDocuments(documents: AccountingDocument[], filters: DocumentListFilters) {
  return documents.filter((document) => {
    if (filters.status && document.status !== filters.status) {
      return false;
    }

    if (filters.vendorName && !document.vendorName.toLowerCase().includes(filters.vendorName.toLowerCase())) {
      return false;
    }

    if (filters.from && document.issueDate < filters.from) {
      return false;
    }

    if (filters.to && document.issueDate > filters.to) {
      return false;
    }

    if (filters.hasWarnings && document.warnings.every((warning) => warning.status !== "open")) {
      return false;
    }

    return true;
  });
}

function mapDocumentQueryRow(row: DocumentQueryRow): AccountingDocument {
  const journalEntry = row.journal_entries?.[0] ?? createEmptyJournalEntryRow(row.id);
  const approvals = (row.approvals ?? []).map(mapApprovalRow).sort(sortByNewestRequestedAt);
  const auditLogs = (row.audit_logs ?? []).map(mapAuditLogRow).sort(sortByNewestCreatedAt);

  return {
    id: row.id,
    documentType: row.document_type,
    status: row.status,
    vendorName: row.vendor_name,
    invoiceNumber: row.invoice_number,
    registrationNumber: row.registration_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    subtotal: toNumber(row.subtotal),
    taxAmount: toNumber(row.tax_amount),
    totalAmount: toNumber(row.total_amount),
    taxRate: toNumber(row.tax_rate),
    confidenceScore: toNumber(row.confidence_score),
    fileStoragePath: row.file_url,
    fileMediaType: row.file_media_type ?? "application/octet-stream",
    fileName: row.file_name || row.file_url,
    memo: row.memo,
    updatedAt: row.updated_at,
    lines: [],
    journalEntry: mapJournalEntryRow(journalEntry),
    warnings: (row.policy_warnings ?? []).map(mapPolicyWarningRow),
    approval: approvals[0],
    auditLogs,
  };
}

function mapJournalEntryRow(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    debitAccount: row.debit_account,
    debitAmount: toNumber(row.debit_amount),
    debitTaxCategory: row.debit_tax_category,
    creditAccount: row.credit_account,
    creditAmount: toNumber(row.credit_amount),
    creditTaxCategory: row.credit_tax_category,
    department: row.department,
    description: row.description,
    aiReason: row.ai_reason,
    confidenceScore: toNumber(row.confidence_score),
  };
}

function mapPolicyWarningRow(row: PolicyWarningRow): PolicyWarning {
  return {
    id: row.id,
    warningType: row.warning_type,
    severity: row.severity,
    message: row.message,
    status: row.status,
  };
}

function mapApprovalRow(row: ApprovalRow): Approval {
  return {
    id: row.id,
    approverName: row.approver_name,
    status: row.status,
    comment: row.comment,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at ?? undefined,
  };
}

function mapAuditLogRow(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actorType: row.actor_type,
    actorName: row.actor_name,
    action: row.action,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  };
}

function sortByNewestRequestedAt(a: Approval, b: Approval) {
  return b.requestedAt.localeCompare(a.requestedAt);
}

function sortByNewestCreatedAt(a: AuditLog, b: AuditLog) {
  return b.createdAt.localeCompare(a.createdAt);
}

function mapDocumentPatchToRow(input: DocumentPatchInput) {
  const row: DocumentPatchRow = {};

  if (input.vendorName !== undefined) row.vendor_name = input.vendorName;
  if (input.invoiceNumber !== undefined) row.invoice_number = input.invoiceNumber;
  if (input.registrationNumber !== undefined) row.registration_number = input.registrationNumber;
  if (input.issueDate !== undefined) row.issue_date = input.issueDate;
  if (input.dueDate !== undefined) row.due_date = input.dueDate;
  if (input.subtotal !== undefined) row.subtotal = input.subtotal;
  if (input.taxAmount !== undefined) row.tax_amount = input.taxAmount;
  if (input.totalAmount !== undefined) row.total_amount = input.totalAmount;
  if (input.taxRate !== undefined) row.tax_rate = input.taxRate;
  if (input.confidenceScore !== undefined) row.confidence_score = input.confidenceScore;
  if (input.memo !== undefined) row.memo = input.memo;
  if (input.status !== undefined) row.status = input.status;

  return row;
}

type DocumentPatchRow = Partial<{
  vendor_name: string;
  invoice_number: string;
  registration_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  tax_rate: number;
  confidence_score: number;
  memo: string;
  status: DocumentStatus;
}>;

function mapJournalPatchToRow(input: JournalPatchInput) {
  const row: JournalPatchRow = {};

  if (input.debitAccount !== undefined) row.debit_account = input.debitAccount;
  if (input.debitAmount !== undefined) row.debit_amount = input.debitAmount;
  if (input.debitTaxCategory !== undefined) row.debit_tax_category = input.debitTaxCategory;
  if (input.creditAccount !== undefined) row.credit_account = input.creditAccount;
  if (input.creditAmount !== undefined) row.credit_amount = input.creditAmount;
  if (input.creditTaxCategory !== undefined) row.credit_tax_category = input.creditTaxCategory;
  if (input.department !== undefined) row.department = input.department;
  if (input.description !== undefined) row.description = input.description;
  if (input.aiReason !== undefined) row.ai_reason = input.aiReason;
  if (input.confidenceScore !== undefined) row.confidence_score = input.confidenceScore;

  return row;
}

type JournalPatchRow = Partial<{
  debit_account: string;
  debit_amount: number;
  debit_tax_category: string;
  credit_account: string;
  credit_amount: number;
  credit_tax_category: string;
  department: string;
  description: string;
  ai_reason: string;
  confidence_score: number;
}>;

function createPatchAuditLogs(current: AccountingDocument, input: DocumentPatchInput) {
  const logs: AuditLog[] = [];

  addPatchLog(logs, "vendorName", current.vendorName, input.vendorName);
  addPatchLog(logs, "invoiceNumber", current.invoiceNumber, input.invoiceNumber);
  addPatchLog(logs, "registrationNumber", current.registrationNumber, input.registrationNumber);
  addPatchLog(logs, "issueDate", current.issueDate, input.issueDate);
  addPatchLog(logs, "dueDate", current.dueDate, input.dueDate);
  addPatchLog(logs, "subtotal", String(current.subtotal), input.subtotal?.toString());
  addPatchLog(logs, "taxAmount", String(current.taxAmount), input.taxAmount?.toString());
  addPatchLog(logs, "totalAmount", String(current.totalAmount), input.totalAmount?.toString());
  addPatchLog(logs, "taxRate", String(current.taxRate), input.taxRate?.toString());
  addPatchLog(logs, "confidenceScore", String(current.confidenceScore), input.confidenceScore?.toString());
  addPatchLog(logs, "memo", current.memo, input.memo);
  addPatchLog(logs, "status", current.status, input.status);

  return logs;
}

function addPatchLog(logs: AuditLog[], fieldName: string, oldValue: string, newValue: string | undefined) {
  if (newValue === undefined || oldValue === newValue) {
    return;
  }

  logs.push(createAuditLog("証憑更新", fieldName, oldValue, newValue));
}

function createJournalPatchAuditLogs(current: JournalEntry, input: JournalPatchInput) {
  const logs: AuditLog[] = [];

  addPatchLog(logs, "debitAccount", current.debitAccount, input.debitAccount);
  addPatchLog(logs, "debitAmount", String(current.debitAmount), input.debitAmount?.toString());
  addPatchLog(logs, "debitTaxCategory", current.debitTaxCategory, input.debitTaxCategory);
  addPatchLog(logs, "creditAccount", current.creditAccount, input.creditAccount);
  addPatchLog(logs, "creditAmount", String(current.creditAmount), input.creditAmount?.toString());
  addPatchLog(logs, "creditTaxCategory", current.creditTaxCategory, input.creditTaxCategory);
  addPatchLog(logs, "department", current.department, input.department);
  addPatchLog(logs, "description", current.description, input.description);
  addPatchLog(logs, "aiReason", current.aiReason, input.aiReason);
  addPatchLog(logs, "confidenceScore", String(current.confidenceScore), input.confidenceScore?.toString());

  return logs.map((log) => ({ ...log, action: "仕訳更新" }));
}

function createAuditLog(action: string, fieldName: string, oldValue: string, newValue: string): AuditLog {
  return {
    id: crypto.randomUUID(),
    actorType: "user",
    actorName: "経理担当",
    action,
    fieldName,
    oldValue,
    newValue,
    createdAt: new Date().toISOString(),
  };
}

function createEmptyJournalEntryRow(documentId: string): JournalEntryRow {
  return {
    id: `journal-empty-${documentId}`,
    document_id: documentId,
    debit_account: "未設定",
    debit_amount: 1,
    debit_tax_category: "未設定",
    credit_account: "未設定",
    credit_amount: 1,
    credit_tax_category: "未設定",
    department: "",
    description: "未設定",
    ai_reason: "仕訳候補はまだ生成されていません。",
    confidence_score: 0,
  };
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}
