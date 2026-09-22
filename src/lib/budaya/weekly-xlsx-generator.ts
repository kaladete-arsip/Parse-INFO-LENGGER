/**
 * Weekly Excel Generator — split rows by ISO week (Senin-Minggu).
 *
 * User downloads 1 ZIP berisi multiple .xlsx files (1 per minggu).
 * Tiap file 20-30 rows — gampang edit (isi peristiwa dari flyer).
 *
 * Week label: YYYY-WNN (ISO 8601 week, e.g., "2026-W37")
 * Week starts Monday, ends Sunday.
 */

import { generateXlsx } from "./xlsx-generator";
import type { RowData } from "./template";
import JSZip from "jszip";

/** Calculate ISO 8601 week from a date string (YYYY-MM-DD). */
function getISOWeek(dateStr: string): { year: number; week: number; label: string } {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = d.getUTCDay() || 7; // Sunday=0 → 7
  // ISO: Thursday of this week determines year + week number
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dayNum + 4);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 4)); // Jan 4 = always week 1
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week, label: `${year}-W${String(week).padStart(2, "0")}` };
}

/** Format week date range (e.g., "2026-W37 (07-13 Sep)") */
function getWeekRange(rows: RowData[]): string {
  const dates = rows.map((r) => r.Tanggal).filter(Boolean).sort();
  if (dates.length === 0) return "";
  const start = dates[0];
  const end = dates[dates.length - 1];
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const sd = new Date(start + "T00:00:00Z");
  const ed = new Date(end + "T00:00:00Z");
  return `${sd.getUTCDate()}-${ed.getUTCDate()} ${months[ed.getUTCMonth()]}`;
}

/**
 * Generate weekly Excel ZIP — 1 .xlsx per ISO week.
 *
 * @param rows     RowData[] from parser
 * @param baseName Base filename (e.g., "fb_new_raw")
 * @returns ZIP ArrayBuffer
 */
export async function generateWeeklyXlsxZip(
  rows: RowData[],
  baseName: string
): Promise<ArrayBuffer> {
  // Group by ISO week
  const byWeek = new Map<string, RowData[]>();
  for (const row of rows) {
    const dateStr = row.Tanggal ?? "9999-12-31";
    const { label } = getISOWeek(dateStr);
    if (!byWeek.has(label)) byWeek.set(label, []);
    byWeek.get(label)!.push(row);
  }

  // Sort weeks ascending
  const sortedWeeks = [...byWeek.keys()].sort();

  // Generate one .xlsx per week
  const zip = new JSZip();

  for (const weekLabel of sortedWeeks) {
    const weekRows = byWeek.get(weekLabel)!;
    const xlsxBuffer = await generateXlsx(weekRows);
    const range = getWeekRange(weekRows);
    const filename = range
      ? `${weekLabel} (${range}).xlsx`
      : `${weekLabel}.xlsx`;
    zip.file(filename, xlsxBuffer);
  }

  // README
  const totalRows = rows.length;
  const totalWeeks = sortedWeeks.length;
  zip.file("README.md", `# Weekly Excel Archive

Generated from: ${baseName}
Date: ${new Date().toISOString()}

## Summary
- Total rows: ${totalRows}
- Total weeks: ${totalWeeks}
- Date range: ${sortedWeeks[0] ?? "N/A"} → ${sortedWeeks[totalWeeks - 1] ?? "N/A"}

## Files
Each .xlsx file = 1 ISO week (Senin-Minggu).
Edit tiap file: isi peristiwa, kategori, bukti dari flyer.

## Workflow
1. Download ZIP
2. Unzip
3. Buka 1 file .xlsx per minggu (20-30 rows, gampang edit)
4. Isi peristiwa + kategori dari flyer
5. Upload via tab "Excel" → download clean.md ZIP
`);

  return await zip.generateAsync({ type: "arraybuffer" });
}
