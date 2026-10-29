import { Transaction } from '../types';
import { formatPaise } from './money';

/**
 * Escapes a single CSV cell value:
 * - Sanitizes formula injection characters (=, +, -, @, \t, \r) by prefixing with an apostrophe '
 * - Escapes internal quotes by doubling them (" -> "")
 * - Wraps the entire cell in double quotes
 */
export function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) {
    return '""';
  }
  
  let str = String(val);
  
  // Formula injection prevention: if first char is =, +, -, @, \t, or \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  
  // Escape existing double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Exports transactions to a CSV string and initiates browser download
 */
export function exportTransactionsToCsv(transactions: Transaction[], filename: string = "ecorewind_transactions.csv"): void {
  const headers = [
    "Transaction ID",
    "Date & Time",
    "Item Type",
    "Status",
    "Weight (g)",
    "Rate (paise/g)",
    "Base Payout",
    "Bonus",
    "Total Payout",
    "Reason",
    "Machine ID"
  ];

  const rows = transactions.map((t) => [
    t.id,
    new Date(t.created_at).toLocaleString("en-IN"),
    t.display_label || t.label,
    t.status,
    t.weight_grams,
    t.rate_paise_per_gram,
    formatPaise(t.payout_paise - (t.bonus_paise || 0)),
    formatPaise(t.bonus_paise || 0),
    formatPaise(t.payout_paise),
    t.reason || "",
    t.machine_id
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(","))
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
