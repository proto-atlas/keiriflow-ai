import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentReviewWorkspace } from "@/components/document-review-workspace";
import { StatusBadge } from "@/components/status-badge";
import { formatYen } from "@/lib/format";
import { getDocumentRepository } from "@/lib/server/document-repository";

type InvoiceDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const repository = getDocumentRepository();
  let document = null as Awaited<ReturnType<typeof repository.getDocument>>;
  let hasDocumentLoadError = false;

  try {
    document = await repository.getDocument(id);
  } catch {
    hasDocumentLoadError = true;
  }

  if (hasDocumentLoadError) {
    return (
      <AppShell>
        <div className="grid gap-6">
          <header className="border-b border-slate-200 pb-6">
            <p className="text-sm font-medium text-slate-500">Document Review</p>
            <h1 className="mt-2 text-3xl font-semibold">証憑詳細</h1>
          </header>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            証憑詳細を取得できませんでした。環境設定後に再度確認してください。
          </div>
        </div>
      </AppShell>
    );
  }

  if (!document) {
    notFound();
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Document Review</p>
            <h1 className="mt-2 text-3xl font-semibold">{document.vendorName}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {document.invoiceNumber} / {formatYen(document.totalAmount)}
            </p>
          </div>
          <StatusBadge status={document.status} />
        </header>
        <DocumentReviewWorkspace initialDocument={document} />
      </div>
    </AppShell>
  );
}
