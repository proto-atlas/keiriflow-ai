import { FileDown, Plus } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InvoiceTable } from "@/components/invoice-table";
import { getDocumentRepository } from "@/lib/server/document-repository";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const repository = getDocumentRepository();
  let documents = [] as Awaited<ReturnType<typeof repository.listDocuments>>;
  let hasDocumentLoadError = false;

  try {
    documents = await repository.listDocuments();
  } catch {
    hasDocumentLoadError = true;
    documents = [];
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Documents</p>
            <h1 className="mt-2 text-3xl font-semibold">証憑一覧</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              請求書・領収書をステータス、金額、AI信頼度、警告の有無で確認します。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/invoices/export"
            >
              <FileDown className="h-4 w-4" />
              CSV出力
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href="/invoices/new"
            >
              <Plus className="h-4 w-4" />
              証憑を追加
            </Link>
          </div>
        </header>
        {hasDocumentLoadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            証憑一覧を取得できませんでした。環境設定後に再度確認してください。
          </div>
        ) : null}
        <InvoiceTable documents={documents} />
      </div>
    </AppShell>
  );
}
