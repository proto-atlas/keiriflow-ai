import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { UploadForm } from "@/components/upload-form";

export default function NewInvoicePage() {
  return (
    <AppShell>
      <div className="grid max-w-3xl gap-6">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-slate-500">Upload</p>
          <h1 className="mt-2 text-3xl font-semibold">証憑を追加</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            アップロード後、登録した証憑の確認画面へ遷移します。
          </p>
        </header>
        <SectionCard description="ファイル、種別、メモを登録する入口です。" title="アップロード">
          <UploadForm />
        </SectionCard>
      </div>
    </AppShell>
  );
}
