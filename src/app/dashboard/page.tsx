import { AlertTriangle, CheckCircle2, FileText, Upload } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatYen } from "@/lib/format";
import { getDocumentRepository } from "@/lib/server/document-repository";
import { getDashboardSummary, getOpenWarnings } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = getDocumentRepository();
  let documents = [] as Awaited<ReturnType<typeof repository.listDocuments>>;
  let hasDocumentLoadError = false;

  try {
    documents = await repository.listDocuments();
  } catch {
    hasDocumentLoadError = true;
    documents = [];
  }

  const summary = getDashboardSummary(documents);
  const recentDocuments = documents.slice(0, 3);

  const summaryCards = [
    { label: "未処理", value: summary.uploaded, detail: "アップロード後の確認待ち" },
    { label: "要確認", value: summary.needsReview, detail: "警告または低信頼度あり" },
    { label: "承認待ち", value: summary.pendingApproval, detail: "マネージャー確認中" },
    { label: "承認済み", value: summary.approved, detail: "CSV出力候補" },
  ];

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              経理レビュー ダッシュボード
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              AIが抽出した証憑情報を、人間が確認・修正・承認するための業務フロー画面です。
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
            href="/invoices/new"
          >
            <Upload className="h-4 w-4" />
            証憑を追加
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <article
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              key={card.label}
            >
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold">{card.value}</p>
              <p className="mt-2 text-sm text-slate-600">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <SectionCard
            action={
              <Link className="text-sm font-medium text-slate-700 hover:text-slate-950" href="/invoices">
                一覧を見る
              </Link>
            }
            description="一覧・詳細・修正画面へ進むための起点です。"
            title="最近の証憑"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">取引先</th>
                    <th className="px-4 py-3 font-medium">ステータス</th>
                    <th className="px-4 py-3 font-medium">金額</th>
                    <th className="px-4 py-3 font-medium">警告</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentDocuments.map((document) => (
                    <tr className="hover:bg-slate-50" key={document.id}>
                      <td className="px-4 py-4 font-medium">
                        <Link className="hover:text-slate-600" href={`/invoices/${document.id}`}>
                          {document.vendorName}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={document.status} />
                      </td>
                      <td className="px-4 py-4">{formatYen(document.totalAmount)}</td>
                      <td className="px-4 py-4 text-slate-600">
                        {getOpenWarnings(document).length > 0
                          ? `${getOpenWarnings(document).length}件`
                          : "なし"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <aside className="flex flex-col gap-4">
            {hasDocumentLoadError ? (
              <article className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-700" />
                  <h2 className="text-sm font-semibold text-red-950">データを取得できませんでした</h2>
                </div>
                <p className="mt-2 text-sm text-red-900">
                  一部の初期表示データを取得できないため、一覧は空で表示しています。環境設定後に確認してください。
                </p>
              </article>
            ) : null}
            <article className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                <h2 className="text-base font-semibold text-amber-950">確認が必要な警告</h2>
              </div>
              <p className="mt-3 text-3xl font-semibold text-amber-950">{summary.warningCount}件</p>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                高額支出、登録番号未確認、金額不一致、重複候補を確認ポイントとして表示します。
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-slate-700" />
                <h2 className="text-base font-semibold">今月の処理金額</h2>
              </div>
              <p className="mt-3 text-3xl font-semibold">{formatYen(summary.monthlyAmount)}</p>
              <p className="mt-2 text-sm text-slate-600">
                レビュー済み・承認済み・CSV出力済みの合計です。
              </p>
            </article>
            <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                <h2 className="text-base font-semibold text-emerald-950">レビュー中心の設計</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-emerald-900">
                AI候補をそのまま確定せず、担当者の確認、修正、承認、履歴記録へつなげます。
              </p>
            </article>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
