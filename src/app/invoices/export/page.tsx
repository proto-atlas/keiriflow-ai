import { AppShell } from "@/components/app-shell";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionCard } from "@/components/section-card";
import { getDocumentRepository } from "@/lib/server/document-repository";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const repository = getDocumentRepository();
  const approvedDocuments = await repository.listDocuments({ status: "Approved" });

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
            <p className="text-sm text-slate-600">承認済みデータ: {approvedDocuments.length}件</p>
            <CsvDownloadButton />
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
