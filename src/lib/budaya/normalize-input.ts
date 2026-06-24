/**
 * Unified input normalizer: detect input format and convert to MD-equivalent.
 *
 * Supported formats (auto-detected by content):
 *   1. FB scraping MD  — has `POST #N` and `--- RAW POST ---` markers
 *   2. CSV scraping    — `.csv` extension, each row's first column = 1 post
 *   3. Plain MD        — Info Lengger .md format (single or multi-day)
 *
 * The output is always MD-equivalent text that can be parsed by parseMd.
 */

import { csvToMd } from "./csv-to-md";
import { fbToMd, isFbFormat } from "./fb-to-md";

export type InputFormat = "fb" | "csv" | "md";

export interface NormalizeResult {
  mdText: string;
  format: InputFormat;
}

/**
 * Normalize any input format to MD-equivalent.
 *
 * @param raw         Raw file content (text)
 * @param filename    Original filename (used for .csv detection)
 */
export function normalizeInput(raw: string, filename?: string): NormalizeResult {
  const lower = (filename ?? "").toLowerCase();

  // 1. FB format (detected by content, regardless of extension)
  if (isFbFormat(raw)) {
    return { mdText: fbToMd(raw), format: "fb" };
  }

  // 2. CSV format (by extension)
  if (lower.endsWith(".csv")) {
    return { mdText: csvToMd(raw), format: "csv" };
  }

  // 3. Plain MD
  return { mdText: raw, format: "md" };
}
