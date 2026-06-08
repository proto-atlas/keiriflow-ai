"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { buildDemoAccessHeaders } from "@/lib/client/demo-access-key";
import { readDemoErrorMessage } from "@/lib/client/demo-error-message";
import { uploadFormSchema, type UploadFormInput, type UploadFormValues } from "@/lib/schemas";

export function UploadForm() {
  const router = useRouter();
  const [fileName, setFileName] = useState("ファイルを選択してください");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UploadFormInput, unknown, UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "invoice",
      memo: "証憑として登録",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("");

    if (!selectedFile) {
      setSubmitError("PDF / PNG / JPGの証憑ファイルを選択してください。");
      return;
    }

    const formData = new FormData();
    formData.set("documentType", values.documentType);
    formData.set("memo", values.memo ?? "");
    formData.set("file", selectedFile);

    const response = await fetch("/api/documents/upload", {
      headers: buildDemoAccessHeaders(),
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setSubmitError(await readDemoErrorMessage(response, "証憑登録に失敗しました。入力内容を確認してください。"));
      return;
    }

    const payload = (await response.json()) as { documentId: string };
    router.push(`/invoices/${payload.documentId}`);
  });

  return (
    <form className="grid gap-6" onSubmit={onSubmit}>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-slate-700">ファイル</span>
        <p className="text-xs leading-5 text-slate-500">
          この画面では合成データだけを使い、機密情報・個人情報を含む証憑は登録しないでください。
        </p>
        <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <Upload className="h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">{fileName}</p>
          <p className="mt-1 text-xs text-slate-500">PDF / PNG / JPGの証憑ファイルを登録します。</p>
          <input
            className="mt-4 block w-full max-w-sm text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setFileName(file?.name ?? "ファイルを選択してください");
            }}
            accept="application/pdf,image/png,image/jpeg"
            type="file"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-slate-700">証憑種別</span>
        <select
          className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
          {...register("documentType")}
        >
          <option value="invoice">請求書</option>
          <option value="receipt">領収書</option>
        </select>
        {errors.documentType ? <span className="text-sm text-rose-600">{errors.documentType.message}</span> : null}
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-slate-700">メモ</span>
        <textarea
          className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          {...register("memo")}
        />
        {errors.memo ? <span className="text-sm text-rose-600">{errors.memo.message}</span> : null}
      </label>

      <button
        className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isSubmitting || !selectedFile}
        type="submit"
      >
        登録してAI抽出結果へ進む
      </button>
      {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}
    </form>
  );
}
