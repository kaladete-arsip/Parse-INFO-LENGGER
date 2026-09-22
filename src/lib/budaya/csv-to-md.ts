/**
 * CSV → MD-equivalent converter.
 *
 * Supports RAW CSV from Instagram scraping where each row's first column is
 * one full "Info Lengger" post (multi-line text in a single CSV cell).
 *
 * Each post gets concatenated with double newlines, producing MD-equivalent
 * text that the md-parser can process directly. Multi-day posts are supported
 * (each post can have its own "Info Lengger <date>" header inside the cell).
 *
 * Also supports a CSV with a single column (no quotes needed) where each row
 * is one line of MD text — those get joined with single newlines.
 */

import { parse as csvParse } from "csv-parse/sync";

/**
 * Convert CSV content to MD-equivalent text.
 * Each row → one block. The first column is treated as the post content
 * (may contain embedded newlines).
 */
export function csvToMd(csvText: string): string {
  let records: string[][] = [];
  try {
    records = csvParse(csvText, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
    });
  } catch {
    // Fallback: treat as plain text (one row per line)
    return csvText;
  }

  if (records.length === 0) return "";

  // Detect header row: if first row's first cell looks like a header label
  // (e.g. "post", "caption", "text", "content"), skip it.
  const firstCell = (records[0][0] ?? "").trim().toLowerCase();
  const headerKeywords = ["post", "caption", "text", "content", "raw", "body", "message"];
  const hasHeader = headerKeywords.includes(firstCell);
  const dataRows = hasHeader ? records.slice(1) : records;

  const posts: string[] = [];
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const cell = row[0] ?? "";
    if (!cell.trim()) continue;
    posts.push(cell);
  }

  return posts.join("\n\n");
}
