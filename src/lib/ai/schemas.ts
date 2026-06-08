import { z } from "zod";

const confidenceScoreSchema = z.number().min(0).max(1);
const taxRateSchema = z.number().refine((value) => [0, 0.08, 0.1].includes(value), {
  message: "税率は0、0.08、0.1のいずれかで返してください。",
});

const isExtractedText = (value: string) => value !== "未抽出" && value !== "<UNKNOWN>";

export const aiExtractionResultSchema = z.object({
  vendorName: z.string().min(1).refine(isExtractedText, {
    message: "vendorNameがplaceholderのままです。画像から読み取れていません。",
  }),
  invoiceNumber: z.string().min(1).refine(isExtractedText, {
    message: "invoiceNumberがplaceholderのままです。画像から読み取れていません。",
  }),
  registrationNumber: z.string(),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  totalAmount: z.number().positive(),
  taxRate: taxRateSchema,
  confidenceScore: confidenceScoreSchema,
  memo: z.string().max(200),
});

export type AiExtractionResult = z.infer<typeof aiExtractionResultSchema>;

export const aiJournalSuggestionSchema = z.object({
  debitAccount: z.string().min(1),
  debitAmount: z.number().positive(),
  debitTaxCategory: z.string().min(1),
  creditAccount: z.string().min(1),
  creditAmount: z.number().positive(),
  creditTaxCategory: z.string().min(1),
  department: z.string().min(1),
  description: z.string().min(1),
  aiReason: z.string().min(1),
  confidenceScore: confidenceScoreSchema,
});

export type AiJournalSuggestion = z.infer<typeof aiJournalSuggestionSchema>;
