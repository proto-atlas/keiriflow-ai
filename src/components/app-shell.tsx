import { FileText, Gauge, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoAccessKeyPanel } from "@/components/demo-access-key-panel";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: Gauge },
  { href: "/invoices", label: "証憑一覧", icon: FileText },
  { href: "/invoices/new", label: "証憑追加", icon: Upload },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-slate-200 bg-white px-5 py-5 lg:border-b-0 lg:border-r">
          <Link className="block" href="/dashboard">
            <p className="text-sm font-medium text-slate-500">KeiriFlow AI</p>
            <p className="mt-1 text-lg font-semibold">経理レビュー</p>
          </Link>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            この画面は合成データ確認用です。機密情報・個人情報を含むファイルは登録しないでください。
          </div>
          <nav className="mt-6 flex max-w-full gap-2 overflow-x-auto lg:flex-col">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <DemoAccessKeyPanel />
        </aside>
        <section className="min-w-0 max-w-full overflow-x-hidden px-5 py-6 lg:px-8">
          {children}
        </section>
      </div>
    </main>
  );
}
