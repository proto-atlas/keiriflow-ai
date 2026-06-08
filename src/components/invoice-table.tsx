"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { StatusBadge } from "@/components/status-badge";
import { formatJapaneseDateTime, formatYen } from "@/lib/format";
import type { AccountingDocument } from "@/lib/types";
import { getOpenWarnings } from "@/lib/workflow";

type InvoiceTableProps = {
  documents: AccountingDocument[];
};

export function InvoiceTable({ documents }: InvoiceTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);

  const columns = useMemo<ColumnDef<AccountingDocument>[]>(
    () => [
      {
        accessorKey: "vendorName",
        header: "取引先",
        cell: ({ row }) => (
          <Link className="font-medium text-slate-950 hover:text-slate-600" href={`/invoices/${row.original.id}`}>
            {row.original.vendorName}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "ステータス",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "documentType",
        header: "種別",
        cell: ({ row }) => (row.original.documentType === "invoice" ? "請求書" : "領収書"),
      },
      {
        accessorKey: "issueDate",
        header: "取引日",
      },
      {
        accessorKey: "dueDate",
        header: "支払期日",
      },
      {
        accessorKey: "totalAmount",
        header: "金額",
        cell: ({ row }) => formatYen(row.original.totalAmount),
      },
      {
        accessorKey: "confidenceScore",
        header: "AI信頼度",
        cell: ({ row }) => <ConfidenceMeter value={row.original.confidenceScore} />,
      },
      {
        id: "warnings",
        header: "警告",
        cell: ({ row }) => {
          const count = getOpenWarnings(row.original).length;
          return count > 0 ? `${count}件` : "なし";
        },
      },
      {
        accessorKey: "updatedAt",
        header: "更新日時",
        cell: ({ row }) => formatJapaneseDateTime(row.original.updatedAt),
      },
    ],
    [],
  );

  // TanStack Tableはtable helperを返す設計のため、React Compilerの自動メモ化対象から外す。
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: documents,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-md items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          className="w-full bg-transparent outline-none placeholder:text-slate-400"
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="取引先・ステータス・金額で検索"
          value={globalFilter}
        />
      </label>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className="px-4 py-3 font-medium" key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        className="inline-flex items-center gap-1 text-left"
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? "↑" : null}
                        {header.column.getIsSorted() === "desc" ? "↓" : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr className="hover:bg-slate-50" key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td className="px-4 py-4 align-middle" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-500">{table.getRowModel().rows.length}件を表示中</p>
    </div>
  );
}
