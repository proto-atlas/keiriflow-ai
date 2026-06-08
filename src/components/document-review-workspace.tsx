"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, FileText, History, RotateCcw, Save, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormRegister } from "react-hook-form";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { buildDemoAccessHeaders } from "@/lib/client/demo-access-key";
import { readDemoErrorMessage } from "@/lib/client/demo-error-message";
import { formatJapaneseDateTime, formatYen } from "@/lib/format";
import {
  extractionFormSchema,
  journalFormSchema,
  type ExtractionFormInput,
  type ExtractionFormValues,
  type JournalFormInput,
  type JournalFormValues,
} from "@/lib/schemas";
import type { AccountingDocument, AuditLog } from "@/lib/types";
import {
  getNextReviewStatus,
  isAmountConsistent,
  statusLabels,
  warningStatusLabels,
  warningTitles,
} from "@/lib/workflow";

type DocumentReviewWorkspaceProps = {
  initialDocument: AccountingDocument;
};

export function DocumentReviewWorkspace({ initialDocument }: DocumentReviewWorkspaceProps) {
  const [document, setDocument] = useState(initialDocument);
  const [aiActionMessage, setAiActionMessage] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);
  const [isSavingExtraction, setIsSavingExtraction] = useState(false);
  const [isSavingJournal, setIsSavingJournal] = useState(false);
  const [isUpdatingWorkflow, setIsUpdatingWorkflow] = useState(false);
  const [approverName, setApproverName] = useState(document.approval?.approverName ?? "承認者");
  const [approvalComment, setApprovalComment] = useState(document.approval?.comment ?? "");
  const auditSequenceRef = useRef(0);
  const extractionForm = useForm<ExtractionFormInput, unknown, ExtractionFormValues>({
    resolver: zodResolver(extractionFormSchema),
    defaultValues: {
      vendorName: document.vendorName,
      registrationNumber: document.registrationNumber,
      invoiceNumber: document.invoiceNumber,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      subtotal: document.subtotal,
      taxAmount: document.taxAmount,
      totalAmount: document.totalAmount,
      taxRate: document.taxRate,
      memo: document.memo,
    },
  });
  const journalForm = useForm<JournalFormInput, unknown, JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: {
      debitAccount: document.journalEntry.debitAccount,
      debitAmount: document.journalEntry.debitAmount,
      debitTaxCategory: document.journalEntry.debitTaxCategory,
      creditAccount: document.journalEntry.creditAccount,
      creditAmount: document.journalEntry.creditAmount,
      creditTaxCategory: document.journalEntry.creditTaxCategory,
      department: document.journalEntry.department,
      description: document.journalEntry.description,
    },
  });

  const amountConsistent = useMemo(() => isAmountConsistent(document), [document]);
  const nextStatus = getNextReviewStatus(document.status);
  const canRejectApproval = document.status === "PendingApproval" && document.approval?.status === "pending";
  const canEditContent = isDocumentContentEditable(document.status);
  const canRunExtraction = document.status === "Uploaded" || document.status === "Extracted";

  function addAuditLog(action: string, fieldName: string, oldValue: string, newValue: string): AuditLog {
    auditSequenceRef.current += 1;

    return {
      id: `audit-local-${auditSequenceRef.current}-${fieldName}`,
      actorType: "user",
      actorName: "経理担当",
      action,
      fieldName,
      oldValue,
      newValue,
      createdAt: new Date().toISOString(),
    };
  }

  const saveExtraction = extractionForm.handleSubmit(async (values) => {
    setIsSavingExtraction(true);
    setAiActionMessage("");

    try {
      const payload = await requestJson<DocumentMutationResponse>(
        `/api/documents/${encodeURIComponent(document.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...values,
            registrationNumber: values.registrationNumber ?? "",
            memo: values.memo ?? "",
          }),
        },
        "抽出結果の保存に失敗しました。入力内容とAPI状態を確認してください。",
      );

      setDocument(payload.document);
      extractionForm.reset(createExtractionDefaultValues(payload.document));
      setAiActionMessage("抽出結果を保存し、監査ログを更新しました。");
    } catch (error) {
      setAiActionMessage(toErrorMessage(error, "抽出結果の保存に失敗しました。入力内容とAPI状態を確認してください。"));
    } finally {
      setIsSavingExtraction(false);
    }
  });

  const saveJournal = journalForm.handleSubmit(async (values) => {
    setIsSavingJournal(true);
    setAiActionMessage("");

    try {
      const payload = await requestJson<DocumentMutationResponse>(
        `/api/journal-entries/${encodeURIComponent(document.journalEntry.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(values),
        },
        "仕訳候補の保存に失敗しました。入力内容とAPI状態を確認してください。",
      );

      setDocument(payload.document);
      journalForm.reset(createJournalDefaultValues(payload.document.journalEntry));
      setAiActionMessage("仕訳候補を保存し、監査ログを更新しました。");
    } catch (error) {
      setAiActionMessage(toErrorMessage(error, "仕訳候補の保存に失敗しました。入力内容とAPI状態を確認してください。"));
    } finally {
      setIsSavingJournal(false);
    }
  });

  async function acknowledgeWarning(warningId: string) {
    setIsUpdatingWorkflow(true);
    setAiActionMessage("");

    try {
      const payload = await requestJson<DocumentMutationResponse>(
        `/api/documents/${encodeURIComponent(document.id)}/warnings/${encodeURIComponent(warningId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "acknowledged" }),
        },
        "警告ステータスの更新に失敗しました。",
      );

      setDocument(payload.document);
      setAiActionMessage("警告を確認済みにしました。");
    } catch (error) {
      setAiActionMessage(toErrorMessage(error, "警告ステータスの更新に失敗しました。"));
    } finally {
      setIsUpdatingWorkflow(false);
    }
  }

  async function advanceStatus() {
    setIsUpdatingWorkflow(true);
    setAiActionMessage("");

    try {
      const payload =
        document.status === "Reviewed"
          ? await requestApproval()
          : document.status === "PendingApproval" && document.approval
            ? await respondApproval(document.approval.id, "approved")
            : await patchDocumentStatus(getNextReviewStatus(document.status));

      setDocument(payload.document);
      setApprovalComment(payload.document.approval?.comment ?? approvalComment);
      setApproverName(payload.document.approval?.approverName ?? approverName);
      setAiActionMessage("ステータスと監査ログを更新しました。");
    } catch (error) {
      setAiActionMessage(toErrorMessage(error, "ステータス更新に失敗しました。"));
    } finally {
      setIsUpdatingWorkflow(false);
    }
  }

  async function rejectApproval() {
    setIsUpdatingWorkflow(true);
    setAiActionMessage("");

    try {
      const payload =
        document.approval?.status === "pending"
          ? await respondApproval(document.approval.id, "rejected")
          : await patchDocumentStatus("Rejected");

      setDocument(payload.document);
      setAiActionMessage("差し戻しを記録しました。");
    } catch (error) {
      setAiActionMessage(toErrorMessage(error, "差し戻しの記録に失敗しました。"));
    } finally {
      setIsUpdatingWorkflow(false);
    }
  }

  async function runExtraction() {
    if (!canRunExtraction) {
      setAiActionMessage("このステータスではAI抽出を再実行できません。");
      return;
    }

    setIsExtracting(true);
    setAiActionMessage("");

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/extract`, {
        headers: buildDemoAccessHeaders(),
        method: "POST",
      });

      if (!response.ok) {
        setAiActionMessage(await readDemoErrorMessage(response, "抽出候補の更新に失敗しました。設定とAPI状態を確認してください。"));
        return;
      }

      const payload = (await response.json()) as AiExtractionResponse;
      setDocument(payload.document);
      extractionForm.reset(createExtractionDefaultValues(payload.document));
      setAiActionMessage(`抽出候補を更新しました。provider: ${payload.mode}`);
    } catch {
      setAiActionMessage("抽出候補の更新に失敗しました。設定とAPI状態を確認してください。");
    } finally {
      setIsExtracting(false);
    }
  }

  async function generateJournal() {
    if (!canEditContent) {
      setAiActionMessage("このステータスでは仕訳候補を再生成できません。");
      return;
    }

    setIsGeneratingJournal(true);
    setAiActionMessage("");

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/journal-entry/generate`, {
        headers: buildDemoAccessHeaders(),
        method: "POST",
      });

      if (!response.ok) {
        setAiActionMessage(await readDemoErrorMessage(response, "仕訳候補の更新に失敗しました。設定とAPI状態を確認してください。"));
        return;
      }

      const payload = (await response.json()) as AiJournalResponse;
      setDocument((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        journalEntry: {
          ...current.journalEntry,
          ...payload.journalEntry,
        },
        auditLogs: [
          addAuditLog("仕訳候補生成", "journalEntry", current.journalEntry.debitAccount, payload.journalEntry.debitAccount),
          ...current.auditLogs,
        ],
      }));
      journalForm.reset(createJournalDefaultValues(payload.journalEntry));
      setAiActionMessage(`仕訳候補を更新しました。provider: ${payload.mode}`);
    } catch {
      setAiActionMessage("仕訳候補の更新に失敗しました。設定とAPI状態を確認してください。");
    } finally {
      setIsGeneratingJournal(false);
    }
  }

  function requestApproval() {
    return requestJson<DocumentMutationResponse>(
      `/api/documents/${encodeURIComponent(document.id)}/request-approval`,
      {
        method: "POST",
        body: JSON.stringify({
          approverName,
          comment: approvalComment,
        }),
      },
      "ステータス更新に失敗しました。",
    );
  }

  function respondApproval(approvalId: string, status: "approved" | "rejected") {
    return requestJson<DocumentMutationResponse>(
      `/api/approvals/${encodeURIComponent(approvalId)}/respond`,
      {
        method: "POST",
        body: JSON.stringify({
          status,
          comment: approvalComment,
        }),
      },
      "ステータス更新に失敗しました。",
    );
  }

  function patchDocumentStatus(status: AccountingDocument["status"]) {
    return requestJson<DocumentMutationResponse>(
      `/api/documents/${encodeURIComponent(document.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
      "ステータス更新に失敗しました。",
    );
  }

  return (
    <div className="grid gap-6">
      {aiActionMessage ? (
        <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {aiActionMessage}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <SectionCard description={document.fileName} title="証憑プレビュー">
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-6 text-center">
            <FileText className="h-14 w-14 text-slate-400" />
            <p className="mt-4 text-lg font-semibold">{document.vendorName}</p>
            <p className="mt-2 text-sm text-slate-500">登録済み証憑の確認用プレビューです。</p>
            <div className="mt-6 grid w-full gap-3 text-left text-sm">
              <PreviewRow label="証憑種別" value={document.documentType === "invoice" ? "請求書" : "領収書"} />
              <PreviewRow label="請求書番号" value={document.invoiceNumber} />
              <PreviewRow label="合計金額" value={formatYen(document.totalAmount)} />
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard
            action={
              <div className="flex flex-wrap items-center gap-3">
                <ConfidenceMeter value={document.confidenceScore} />
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                  disabled={isExtracting || !canRunExtraction}
                  onClick={runExtraction}
                  type="button"
                >
                  <Sparkles className="h-4 w-4" />
                  {isExtracting ? "抽出中" : "AI抽出を再実行"}
                </button>
              </div>
            }
            description="AI抽出結果は担当者が修正できます。"
            title="抽出結果フォーム"
          >
            <form className="grid gap-4" onSubmit={saveExtraction}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="取引先名" name="vendorName" register={extractionForm.register} />
                <Field label="インボイス登録番号" name="registrationNumber" register={extractionForm.register} />
                <Field label="請求書番号" name="invoiceNumber" register={extractionForm.register} />
                <Field label="請求日 / 取引日" name="issueDate" register={extractionForm.register} type="date" />
                <Field label="支払期日" name="dueDate" register={extractionForm.register} type="date" />
                <Field label="小計" name="subtotal" register={extractionForm.register} type="number" />
                <Field label="消費税額" name="taxAmount" register={extractionForm.register} type="number" />
                <Field label="合計金額" name="totalAmount" register={extractionForm.register} type="number" />
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">税率</span>
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  {...extractionForm.register("taxRate")}
                >
                  <option value={0}>0%</option>
                  <option value={0.08}>8%</option>
                  <option value={0.1}>10%</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">摘要メモ</span>
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  {...extractionForm.register("memo")}
                />
              </label>
              {!amountConsistent ? (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  小計と消費税額の合計が、請求合計額と一致していません。
                </p>
              ) : null}
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
                disabled={isSavingExtraction || !canEditContent}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {isSavingExtraction ? "保存中" : "抽出結果を保存"}
              </button>
            </form>
          </SectionCard>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          action={
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={isGeneratingJournal || !canEditContent}
              onClick={generateJournal}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              {isGeneratingJournal ? "生成中" : "仕訳候補を再生成"}
            </button>
          }
          description={document.journalEntry.aiReason}
          title="仕訳候補"
        >
          <form className="grid gap-4" onSubmit={saveJournal}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="借方勘定科目" name="debitAccount" register={journalForm.register} />
              <Field label="借方金額" name="debitAmount" register={journalForm.register} type="number" />
              <Field label="借方税区分" name="debitTaxCategory" register={journalForm.register} />
              <Field label="貸方勘定科目" name="creditAccount" register={journalForm.register} />
              <Field label="貸方金額" name="creditAmount" register={journalForm.register} type="number" />
              <Field label="貸方税区分" name="creditTaxCategory" register={journalForm.register} />
              <Field label="部門" name="department" register={journalForm.register} />
              <Field label="摘要" name="description" register={journalForm.register} />
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
              disabled={isSavingJournal || !canEditContent}
              type="submit"
            >
              <Save className="h-4 w-4" />
              {isSavingJournal ? "保存中" : "仕訳候補を保存"}
            </button>
          </form>
        </SectionCard>

        <SectionCard description="法的判定ではなく、確認を促す業務上の注意です。" title="警告チェック">
          <div className="grid gap-3">
            {document.warnings.length > 0 ? (
              document.warnings.map((warning) => (
                <div
                  className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-start sm:justify-between"
                  key={warning.id}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <p className="text-sm font-semibold text-amber-950">{warningTitles[warning.warningType]}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-amber-900">{warning.message}</p>
                    <p className="mt-2 text-xs text-amber-700">状態: {warningStatusLabels[warning.status]}</p>
                  </div>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200 disabled:text-slate-400"
                    disabled={warning.status !== "open" || isUpdatingWorkflow}
                    onClick={() => acknowledgeWarning(warning.id)}
                    type="button"
                  >
                    <Check className="h-4 w-4" />
                    確認済みにする
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                未確認の警告はありません。
              </p>
            )}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <SectionCard description="レビュー済み、承認待ち、承認済み、CSV出力済みへ進めます。" title="承認ステータス">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={document.status} />
              <span className="text-sm text-slate-500">現在の状態</span>
            </div>
            {document.status === "Reviewed" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <LocalTextField label="承認者名" onChange={setApproverName} value={approverName} />
                <LocalTextField label="承認依頼コメント" onChange={setApprovalComment} value={approvalComment} />
              </div>
            ) : null}
            {document.status === "PendingApproval" ? (
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">承認 / 差し戻しコメント</span>
                <textarea
                  className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                  onChange={(event) => setApprovalComment(event.target.value)}
                  value={approvalComment}
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
                disabled={document.status === nextStatus || isUpdatingWorkflow}
                onClick={advanceStatus}
                type="button"
              >
                {statusLabels[nextStatus]}に進める
              </button>
              {canRejectApproval ? (
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={isUpdatingWorkflow}
                  onClick={rejectApproval}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" />
                  差し戻す
                </button>
              ) : null}
              <CsvDownloadButton />
            </div>
          </div>
        </SectionCard>

        <SectionCard description="AI出力、人間の修正、承認操作の履歴を残します。" title="監査ログ / 修正履歴">
          <div className="grid gap-3">
            {document.auditLogs.map((log) => (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={log.id}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-slate-500" />
                  {log.action}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {log.actorName} が {log.fieldName} を「{log.oldValue || "空"}」から「{log.newValue}」へ変更
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatJapaneseDateTime(log.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}

type AiExtractionResponse = {
  document: AccountingDocument;
  mode: string;
};

type DocumentMutationResponse = {
  document: AccountingDocument;
  mode: string;
};

type AiJournalResponse = {
  journalEntry: JournalFormValues & {
    aiReason: string;
    confidenceScore: number;
  };
  mode: string;
};

function createExtractionDefaultValues(document: AccountingDocument): ExtractionFormValues {
  return {
    vendorName: document.vendorName,
    registrationNumber: document.registrationNumber,
    invoiceNumber: document.invoiceNumber,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    subtotal: document.subtotal,
    taxAmount: document.taxAmount,
    totalAmount: document.totalAmount,
    taxRate: document.taxRate,
    memo: document.memo,
  };
}

function createJournalDefaultValues(journalEntry: JournalFormValues): JournalFormValues {
  return {
    debitAccount: journalEntry.debitAccount,
    debitAmount: journalEntry.debitAmount,
    debitTaxCategory: journalEntry.debitTaxCategory,
    creditAccount: journalEntry.creditAccount,
    creditAmount: journalEntry.creditAmount,
    creditTaxCategory: journalEntry.creditTaxCategory,
    department: journalEntry.department,
    description: journalEntry.description,
  };
}

async function requestJson<TResponse>(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<TResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(buildDemoAccessHeaders(init.headers)),
    },
  });

  if (!response.ok) {
    throw new Error(await readDemoErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as TResponse;
}

function isDocumentContentEditable(status: AccountingDocument["status"]) {
  return status !== "PendingApproval" && status !== "Approved" && status !== "Rejected" && status !== "Exported";
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LocalTextField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

type FieldProps<TFormValues extends FieldValues> = {
  label: string;
  name: Path<TFormValues>;
  type?: "date" | "number" | "text";
  register: UseFormRegister<TFormValues>;
};

function Field<TFormValues extends FieldValues>({
  label,
  name,
  register,
  type = "text",
}: FieldProps<TFormValues>) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
        type={type}
        {...register(name)}
      />
    </label>
  );
}
