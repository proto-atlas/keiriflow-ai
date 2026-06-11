import { AppShell } from "@/components/app-shell";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionCard } from "@/components/section-card";
import { getDocumentRepository } from "@/lib/server/document-repository";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const repository = getDocumentRepository();
  let approvedDocuments = [] as Awaited<ReturnType<typeof repository.listDocuments>>;
  let hasDocumentLoadError = false;

  try {
    approvedDocuments = await repository.listDocuments({ status: "Approved" });
  } catch {
    hasDocumentLoadError = true;
    approvedDocuments = [];
  }

  return (
    <AppShell>
      <div className="grid max-w-3xl gap-6">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-slate-500">CSV Export</p>
          <h1 className="mt-2 text-3xl font-semibold">CSV出力</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            承認済みの仕訳候補を、汎用CSVとして出力します。
          </p>
        </header>
        <SectionCard description="特定会計ソフト完全互換ではなく、汎用CSVとして扱います。" title="出力対象">
          <div className="grid gap-4">
            {hasDocumentLoadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                承認済みデータを取得できませんでした。環境設定後に再度確認してください。
              </div>
            ) : null}
            <p className="text-sm text-slate-600">承認済みデータ: {approvedDocuments.length}件</p>
            <CsvDownloadButton />
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
