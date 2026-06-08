"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { buildDemoAccessHeaders } from "@/lib/client/demo-access-key";
import { readDemoErrorMessage } from "@/lib/client/demo-error-message";

export function CsvDownloadButton() {
  const [message, setMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadCsv() {
    setIsDownloading(true);
    setMessage("");

    try {
      const response = await fetch("/api/documents/export.csv", {
        headers: buildDemoAccessHeaders(),
      });

      if (!response.ok) {
        setMessage(await readDemoErrorMessage(response, "CSV出力に失敗しました。"));
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = "keiriflow-export.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("CSVを出力しました。");
    } catch {
      setMessage("CSV出力に失敗しました。");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
        disabled={isDownloading}
        onClick={downloadCsv}
        type="button"
      >
        <Download className="h-4 w-4" />
        {isDownloading ? "出力中" : "CSVを出力"}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
