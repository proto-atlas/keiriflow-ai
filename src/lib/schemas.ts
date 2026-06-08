import { z } from "zod";

export const uploadFormSchema = z.object({
  documentType: z.enum(["invoice", "receipt"]),
  memo: z.string().max(200, "メモは200文字以内で入力してください。").optional(),
});

export type UploadFormValues = z.infer<typeof uploadFormSchema>;
export type UploadFormInput = z.input<typeof uploadFormSchema>;

export const extractionFormSchema = z.object({
  vendorName: z.string().min(1, "取引先名を入力してください。"),
  registrationNumber: z.string().optional(),
  invoiceNumber: z.string().min(1, "請求書番号を入力してください。"),
  issueDate: z.string().min(1, "請求日を入力してください。"),
  dueDate: z.string().min(1, "支払期日を入力してください。"),
  subtotal: z.coerce.number().min(0, "小計は0以上で入力してください。"),
  taxAmount: z.coerce.number().min(0, "消費税額は0以上で入力してください。"),
  totalAmount: z.coerce.number().positive("合計金額は1円以上で入力してください。"),
  taxRate: z.coerce.number().refine((value) => [0, 0.08, 0.1].includes(value), {
    message: "税率は0、0.08、0.1のいずれかを選んでください。",
  }),
  memo: z.string().max(200, "メモは200文字以内で入力してください。").optional(),
});

export type ExtractionFormValues = z.infer<typeof extractionFormSchema>;
export type ExtractionFormInput = z.input<typeof extractionFormSchema>;

export const journalFormSchema = z.object({
  debitAccount: z.string().min(1, "借方勘定科目を入力してください。"),
  debitAmount: z.coerce.number().positive("借方金額は1円以上で入力してください。"),
  debitTaxCategory: z.string().min(1, "借方税区分を入力してください。"),
  creditAccount: z.string().min(1, "貸方勘定科目を入力してください。"),
  creditAmount: z.coerce.number().positive("貸方金額は1円以上で入力してください。"),
  creditTaxCategory: z.string().min(1, "貸方税区分を入力してください。"),
  department: z.string().min(1, "部門を入力してください。"),
  description: z.string().min(1, "摘要を入力してください。"),
});

export type JournalFormValues = z.infer<typeof journalFormSchema>;
export type JournalFormInput = z.input<typeof journalFormSchema>;

export const journalPatchSchema = journalFormSchema
  .extend({
    aiReason: z.string().optional(),
    confidenceScore: z.coerce.number().min(0).max(1).optional(),
  })
  .partial();

export type JournalPatchValues = z.infer<typeof journalPatchSchema>;

export const warningPatchSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]),
});

export type WarningPatchValues = z.infer<typeof warningPatchSchema>;

export const approvalRequestSchema = z.object({
  approverName: z.string().min(1, "承認者名を入力してください。"),
  comment: z.string().max(200, "コメントは200文字以内で入力してください。").optional(),
});

export type ApprovalRequestValues = z.infer<typeof approvalRequestSchema>;

export const approvalResponseSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  comment: z.string().max(200, "コメントは200文字以内で入力してください。").optional(),
});

export type ApprovalResponseValues = z.infer<typeof approvalResponseSchema>;

export const documentPatchSchema = extractionFormSchema
  .extend({
    status: z
      .enum([
        "Uploaded",
        "Extracted",
        "NeedsReview",
        "Reviewed",
        "PendingApproval",
        "Approved",
        "Rejected",
        "Exported",
      ])
      .optional(),
  })
  .partial();

export type DocumentPatchValues = z.infer<typeof documentPatchSchema>;
