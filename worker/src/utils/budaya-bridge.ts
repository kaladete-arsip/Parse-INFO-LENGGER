/**
 * Bridge to the existing src/lib/budaya/ parser — reuses the same code
 * as the Next.js web UI via tsconfig path alias @budaya/*.
 *
 * This module wraps parseMd + generateXlsx so the Worker can convert
 * .md → .xlsx using the EXACT same logic as the web UI. No duplication.
 *
 * Path alias is configured in worker/tsconfig.json:
 *   "@budaya/*" → "../src/lib/budaya/*"
 */
import { parseMd } from "@budaya/md-parser";
import { generateXlsx } from "@budaya/xlsx-generator";
import { normalizeInput } from "@budaya/normalize-input";

/**
 * Convert Info Lengger MD text → .xlsx ArrayBuffer.
 * Uses the same parser + xlsx-generator as the web UI.
 *
 * @throws if no entries detected (rows.length === 0)
 */
export async function convertMdToXlsx(
  mdText: string,
  filename: string
): Promise<{ buffer: ArrayBuffer; rows: number; warnings: string[] }> {
  const { mdText: normalized } = normalizeInput(mdText, filename);
  const { rows, warnings } = parseMd(normalized, filename);

  if (rows.length === 0) {
    throw new Error(
      "Tidak ada entri terdeteksi. Cek format input — harus ada 'Info Lengger <date>' header dan '<n>_<lokasi> Kec: X Kab: Y' entries."
    );
  }

  const buffer = await generateXlsx(rows);
  return { buffer, rows: rows.length, warnings };
}

/** Parse MD → rows only (for preview, without xlsx generation). */
export function parseMdToRows(mdText: string, filename: string) {
  const { mdText: normalized } = normalizeInput(mdText, filename);
  return parseMd(normalized, filename);
}

/**
 * Heuristic: does the text look like Info Lengger content?
 * Used to decide whether to run LLM fix (skip if text is clearly not IL).
 *
 * Mirrors the same function from src/lib/budaya/ocr.ts but inline
 * (since ocr.ts is browser-focused and we don't want to import it here).
 */
export function looksLikeInfoLengger(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /info\s*lengger/.test(t) ||
    /\d+_[a-z]/.test(t) ||
    /romb/.test(t) ||
    /lengger\s*:/.test(t) ||
    /sinden\s*:/.test(t)
  );
}
