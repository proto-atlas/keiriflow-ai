"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { readDemoAccessKey, writeDemoAccessKey } from "@/lib/client/demo-access-key";

export function DemoAccessKeyPanel() {
  const storedValue = useSyncExternalStore(subscribeToSessionStorage, readDemoAccessKey, () => "");
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const value = draftValue ?? storedValue;

  function saveAccessKey() {
    writeDemoAccessKey(value);
    setDraftValue(readDemoAccessKey());
    setMessage(value.trim() ? "このタブで確認用キーを使います。" : "確認用キーを削除しました。");
  }

  function clearAccessKey() {
    writeDemoAccessKey("");
    setDraftValue("");
    setMessage("確認用キーを削除しました。");
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <KeyRound className="h-4 w-4" />
        確認用キー
      </div>
      <input
        className="mt-3 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
        onChange={(event) => {
          setDraftValue(event.target.value);
          setMessage("");
        }}
        placeholder="個別に共有された確認用キー"
        type="password"
        value={value}
      />
      <div className="mt-3 flex gap-2">
        <button
          className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white hover:bg-slate-800"
          onClick={saveAccessKey}
          type="button"
        >
          保存
        </button>
        <button
          aria-label="確認用キーを削除"
          className="inline-flex h-8 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          onClick={clearAccessKey}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        ブラウザ保存はこのタブのsessionStorageだけです。
      </p>
      {message ? <p className="mt-2 text-xs text-slate-700">{message}</p> : null}
    </section>
  );
}

function subscribeToSessionStorage() {
  return () => undefined;
}
