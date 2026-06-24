/**
 * Parser for "Info Lengger" markdown files.
 *
 * Supports three input formats (auto-detected by normalize-input.ts):
 *   1. Plain MD         — Info Lengger .md (single or multi-day)
 *   2. CSV scraping     — each row's first column = 1 post (multi-line OK)
 *   3. FB scraping MD   — has `POST #N` + `--- RAW POST ---` blocks
 *
 * After normalization, all three become MD-equivalent text that this parser
 * handles uniformly.
 *
 * Features:
 *   - Multi-day source: multiple "Info Lengger <Day>, DD Month YYYY" headers
 *     throughout the file. Each entry inherits the date from the nearest
 *     "Info Lengger" header above it.
 *   - "MBENGI TOK" / "MBENGI THOK" detection: sets Jam = "19:30" (evening only).
 *     Default (no MBENGI TOK) = "15:30" (afternoon, after Asar).
 *   - Rombongan normalization: "X & Y" → "X; Y" (multiple groups separator).
 *   - Individual name filtering: drops tokens containing "..." (placeholder for
 *     unknown name, e.g. "...?", "Bu ...?") and tokens with no letters.
 *   - Gagrak rules: Pentas Lengger w/ Sinden → "Sindenan", w/o Sinden →
 *     "Bedhenan". Non-Lengger activities → Gagrak left empty.
 *   - "Sumber :" line detection (anywhere in MD) → fills sumber column for all rows.
 *   - "-----" separator → ignored.
 *   - Special activities: "TAYUB", "WAROK", "JARANAN & WAROK",
 *     "TOPENG IRENG & WAROK", "LENGGERAN, JARANAN & WAROK".
 */

import { RowData, DEFAULT_PROVINSI } from "./template";

export interface ParseResult {
  /** All unique dates detected across the source file (multi-day support). */
  tanggalList: string[];
  rows: RowData[];
  warnings: string[];
}

/** Parse Indonesian month name → number (1-12). */
const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

/** Parse "DD Month YYYY" → "YYYY-MM-DD". Returns null if no match. */
function parseDateStr(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = MONTHS[m[2].toLowerCase()];
  const year = m[3];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${day}`;
}

/**
 * Try to detect date from the first "Info Lengger ..." line or filename.
 * (Used only as fallback; for multi-day sources, dates come from per-section
 * "Info Lengger" headers throughout the file.)
 */
export function detectTanggal(mdText: string, filename?: string): string | null {
  const firstLine = mdText.split(/\r?\n/, 1)[0] || "";
  const parsed = parseDateStr(firstLine);
  if (parsed) return parsed;
  if (filename) {
    const fm = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (fm) return `${fm[1]}-${fm[2]}-${fm[3]}`;
  }
  return null;
}

interface ParsedLocation {
  lokasi: string | null;
  dusun: string | null;
  desa: string | null;
  kec: string | null;
  kab: string | null;
}

/**
 * Venue-type keywords that indicate a part is a specific location (lokasi)
 * rather than a dusun/desa name. e.g. "Halaman Terminal Kalibeber",
 * "Lapangan Desa Kejajar", "Pendopo Kabupaten".
 *
 * Uses word boundaries to avoid false positives like "Gunungsari" (desa name
 * that contains "gunung" as a substring but not as a whole word).
 */
const VENUE_KEYWORDS =
  /\b(terminal|lapangan|halaman|pendopo|alun[-\s]?alun|gedung|sekolah|masjid|gereja|pasar|jembatan|balai|aula|stadion|gor|kompleks|pabrik|rs\b|rumah\s+sakit|puskesmas|koramil|polsek|polres|perumahan|area\b|pantai|bukit|jalan|jl\.?)\b/i;

interface PartInfo {
  /** Cleaned text (prefix stripped). */
  text: string;
  /** True if part had "Dk."/"Dukuh" prefix → dusun. */
  isDusun: boolean;
  /** True if part had "Ds."/"Desa" prefix → desa. */
  isDesa: boolean;
  /** True if part contains a venue keyword → lokasi. */
  isVenue: boolean;
}

/**
 * Parse a single entry header (e.g. "1_Trenggiling, Sariyoso Kec/Kab: Wonosobo")
 * into structured location fields.
 *
 * Hybrid detection strategy (priority high → low):
 *   1. Explicit prefix: "Dk."/"Dukuh" → dusun; "Ds."/"Desa" → desa.
 *      Prefix is stripped, clean name kept.
 *   2. Venue keyword: "Terminal", "Lapangan", "Halaman", etc. → lokasi.
 *   3. Count-based fallback (right-aligned to desa, then dusun):
 *        1 part  → desa
 *        2 parts → dusun + desa
 *        3 parts → dusun + desa + (rest → lokasi)
 *
 * This implements the user's rules:
 *   - 5 data (ideal): lokasi, dusun, desa, kec, kab
 *   - 4 data: dusun, desa, kec, kab (lokasi empty)
 *   - 3 data: desa, kec, kab (lokasi & dusun empty)
 *   - Specific venue ("Terminal Kalibeber"): lokasi + remaining
 */
function parseHeader(header: string): ParsedLocation {
  const m = header.match(/^\d+_(.*)$/);
  let body = m ? m[1] : header;

  let kec: string | null = null;
  let kab: string | null = null;

  // Extract kec & kab from markers
  const mKecKab = body.match(/Kec\/Kab:\s*(\S+)/i);
  if (mKecKab) {
    // Combined marker: kec = kab = same value
    kec = mKecKab[1];
    kab = kec;
    body = body.slice(0, mKecKab.index).trim();
  } else {
    const mKec = body.match(/Kec:\s*(\S+)/i);
    const mKab = body.match(/Kab:\s*(\S+)/i);
    if (mKec) kec = mKec[1];
    if (mKab) kab = mKab[1];
    const starts: number[] = [];
    if (mKec && mKec.index !== undefined) starts.push(mKec.index);
    if (mKab && mKab.index !== undefined) starts.push(mKab.index);
    if (starts.length > 0) {
      body = body.slice(0, Math.min(...starts)).trim();
    }
  }

  // Clean trailing commas/whitespace, split into parts
  body = body.replace(/,+$/, "").trim();
  const parts = body.split(",").map((p) => p.trim()).filter(Boolean);

  // Analyze each part: detect prefix & venue keyword
  const infos: PartInfo[] = parts.map((p) => {
    const lower = p.toLowerCase();
    let isDusun = false;
    let isDesa = false;
    let text = p;

    if (lower.startsWith("dk.") || lower.startsWith("dukuh ")) {
      isDusun = true;
      text = p.replace(/^dk\.\s*/i, "").replace(/^dukuh\s+/i, "").trim();
    } else if (lower.startsWith("ds.") || lower.startsWith("desa ")) {
      isDesa = true;
      text = p.replace(/^ds\.\s*/i, "").replace(/^desa\s+/i, "").trim();
    }

    const isVenue = VENUE_KEYWORDS.test(p);
    return { text, isDusun, isDesa, isVenue };
  });

  let lokasi: string | null = null;
  let dusun: string | null = null;
  let desa: string | null = null;

  // Pass 1: explicit prefixes (strongest signal)
  const dusunExplicit = infos.find((i) => i.isDusun);
  const desaExplicit = infos.find((i) => i.isDesa);
  if (dusunExplicit) dusun = dusunExplicit.text;
  if (desaExplicit) desa = desaExplicit.text;

  // Unmarked parts (no explicit prefix)
  const unmarked = infos.filter((i) => !i.isDusun && !i.isDesa);

  if (unmarked.length > 0) {
    // Pass 2: venue keyword → lokasi
    const venuePart = unmarked.find((i) => i.isVenue);
    const nonVenue = unmarked.filter((i) => !i.isVenue);

    if (venuePart) {
      lokasi = venuePart.text;
    }

    // Pass 3: count-based assignment for non-venue unmarked parts
    if (dusun && desa) {
      // Both set by prefixes; all remaining non-venue → lokasi
      if (nonVenue.length > 0) {
        const extra = nonVenue.map((i) => i.text).join(", ");
        lokasi = lokasi ? `${lokasi}, ${extra}` : extra;
      }
    } else if (desa && !dusun) {
      // Desa set, dusun not: first non-venue → dusun, rest → lokasi
      if (nonVenue.length >= 1) {
        dusun = nonVenue[0].text;
        if (nonVenue.length > 1) {
          const extra = nonVenue.slice(1).map((i) => i.text).join(", ");
          lokasi = lokasi ? `${lokasi}, ${extra}` : extra;
        }
      }
    } else if (dusun && !desa) {
      // Dusun set, desa not: first non-venue → desa, rest → lokasi
      if (nonVenue.length >= 1) {
        desa = nonVenue[0].text;
        if (nonVenue.length > 1) {
          const extra = nonVenue.slice(1).map((i) => i.text).join(", ");
          lokasi = lokasi ? `${lokasi}, ${extra}` : extra;
        }
      }
    } else {
      // Neither dusun nor desa set: pure count-based (right-aligned)
      //   1 part  → desa
      //   2 parts → dusun + desa
      //   3+      → dusun + desa + (rest → lokasi)
      if (nonVenue.length === 1) {
        desa = nonVenue[0].text;
      } else if (nonVenue.length === 2) {
        dusun = nonVenue[0].text;
        desa = nonVenue[1].text;
      } else if (nonVenue.length >= 3) {
        dusun = nonVenue[0].text;
        desa = nonVenue[1].text;
        const extra = nonVenue.slice(2).map((i) => i.text).join(", ");
        lokasi = lokasi ? `${lokasi}, ${extra}` : extra;
      }
    }
  }

  return { lokasi, dusun, desa, kec, kab };
}

function splitNames(text: string): string[] {
  if (!text) return [];
  const t = text.replace(/\s*&\s*/g, ",").replace(/&/g, ",");
  return t
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    // Rule: drop tokens containing "..." (placeholder for unknown name).
    // Catches "...?", "Bu ...?", "Mas ...?", etc.
    .filter((p) => !/\.{2,}/.test(p))
    // Rule: drop tokens with no letters (e.g., "?", "-", "...")
    .filter((p) => /[A-Za-zÀ-ÿ]/.test(p));
}

/**
 * Rombongan name is kept AS-IS from the RAW source.
 *
 * The name may contain:
 *   - Multiple groups separated by " & " (e.g. "Sri Muda Rahayu & Wahyu Margi Utomo")
 *   - Homebase info with commas & Kec/Kab (e.g. "Wargo Ngudi Budoyo, Salaman, Lengkong Kec: Garung Kab: Wonosobo")
 *
 * We do NOT normalize or split — the homebase location embedded in the name is
 * NOT the pentas location, so it must stay verbatim for manual review in Excel.
 */

interface RawEntry {
  header: string;
  extra: string[];
  tanggal: string | null; // date context at the time this entry was parsed
  sumber: string | null; // per-section source link (nearest "Sumber :" in this section)
}

/**
 * Split MD into entries.
 *
 * Supports multi-day sources: a "Info Lengger <Day>, DD Month YYYY" line may
 * appear multiple times throughout the file. Each entry inherits the date
 * from the most recent "Info Lengger" line above it.
 *
 * Source link ("Sumber :") is tracked PER-SECTION. A new section starts at
 * each "Info Lengger" header. When a "Sumber :" line appears, it is assigned
 * to ALL entries in the current section (backfilled — "Sumber :" usually
 * appears at the END of a section, after the entries). This way, a single
 * file with multiple days can have a different source link per day, and each
 * row gets the correct source for its day.
 *
 * Also handles "-----" and "=====" separators (skipped, not section dividers).
 */
function splitEntries(mdText: string): {
  entries: RawEntry[];
  tanggalList: string[];
} {
  const rawLines = mdText.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const lines = rawLines.filter((l) => l.trim().length > 0);

  const entries: RawEntry[] = [];
  const tanggalList: string[] = [];
  let current: RawEntry | null = null;
  let currentDate: string | null = null;
  let currentSectionSumber: string | null = null;
  // Index in `entries` where the current section starts (for backfill).
  let sectionStartIndex = 0;

  for (const ln of lines) {
    const trimmed = ln.trim();

    // Skip "-----" and "=====" separators (not section dividers, just noise)
    if (/^-{3,}$/.test(trimmed)) continue;
    if (/^={3,}$/.test(trimmed)) continue;

    // Detect "Info Lengger <Day>, DD Month YYYY" — starts a NEW section.
    // Flush the previous entry (if any) with its section's sumber, then reset
    // sumber so the new day starts with no inherited source.
    const infoMatch = trimmed.match(/^info lengger\s+.+$/i);
    if (infoMatch) {
      if (current) {
        current.sumber = currentSectionSumber;
        entries.push(current);
        current = null;
      }
      const parsed = parseDateStr(trimmed);
      if (parsed) {
        currentDate = parsed;
        if (!tanggalList.includes(parsed)) tanggalList.push(parsed);
      }
      currentSectionSumber = null;
      sectionStartIndex = entries.length;
      continue;
    }

    // Detect "Sumber :" line — assign to current section (backfill all entries
    // in this section, plus the pending `current` entry).
    const sumberMatch = trimmed.match(/^Sumber\s*:\s*(.+)$/i);
    if (sumberMatch) {
      currentSectionSumber = sumberMatch[1].trim();
      // Backfill all already-pushed entries in this section
      for (let i = sectionStartIndex; i < entries.length; i++) {
        entries[i].sumber = currentSectionSumber;
      }
      // Also apply to the pending entry (last entry of section, not yet pushed)
      if (current) current.sumber = currentSectionSumber;
      continue;
    }

    // New entry starts with "<n>_<text>"
    if (/^\d+_/.test(trimmed)) {
      if (current) {
        current.sumber = currentSectionSumber;
        entries.push(current);
      }
      current = {
        header: trimmed,
        extra: [],
        tanggal: currentDate,
        sumber: currentSectionSumber,
      };
    } else if (current) {
      current.extra.push(trimmed);
    }
  }
  // Flush the last pending entry with its section's sumber
  if (current) {
    current.sumber = currentSectionSumber;
    entries.push(current);
  }

  return { entries, tanggalList };
}

interface SpecialMapping {
  aktivitas_budaya: string;
  Peran_Rombongan: string;
  Gagrak: string | null;
}

function mapSpecialActivity(label: string): SpecialMapping | null {
  const u = label.toUpperCase();
  if (u.includes("TAYUB")) {
    return {
      aktivitas_budaya: "Pentas Tayub",
      Peran_Rombongan: "Performer Rombongan Tayub",
      Gagrak: null,
    };
  }
  if (u.includes("LENGGERAN") && u.includes("JARANAN") && u.includes("WAROK")) {
    return {
      aktivitas_budaya: "Pentas Lenggeran, Jaranan & Warok",
      Peran_Rombongan: "Performer Rombongan Lenggeran, Jaranan & Warok",
      Gagrak: null,
    };
  }
  if (u.includes("JARANAN") && u.includes("WAROK")) {
    return {
      aktivitas_budaya: "Pentas Jaranan & Warok",
      Peran_Rombongan: "Performer Rombongan Jaranan & Warok",
      Gagrak: null,
    };
  }
  if (u.includes("TOPENG IRENG") && u.includes("WAROK")) {
    return {
      aktivitas_budaya: "Pentas Topeng Ireng & Warok",
      Peran_Rombongan: "Performer Rombongan Topeng Ireng & Warok",
      Gagrak: null,
    };
  }
  if (u.includes("WAROK")) {
    return {
      aktivitas_budaya: "Pentas Warok",
      Peran_Rombongan: "Performer Rombongan Warok",
      Gagrak: null,
    };
  }
  if (u.includes("JARANAN")) {
    return {
      aktivitas_budaya: "Pentas Jaranan",
      Peran_Rombongan: "Performer Rombongan Jaranan",
      Gagrak: null,
    };
  }
  return null;
}

export function parseMd(mdText: string, filename?: string): ParseResult {
  const warnings: string[] = [];
  const fallbackTanggal = detectTanggal(mdText, filename);
  const { entries, tanggalList } = splitEntries(mdText);

  // If no per-section date headers were found, fall back to single-date detection
  const effectiveTanggalList = tanggalList.length > 0
    ? tanggalList
    : (fallbackTanggal ? [fallbackTanggal] : []);

  const rows: RowData[] = [];

  for (const e of entries) {
    // Use entry's own date context; fall back to global fallback if missing
    const rowTanggal = e.tanggal ?? fallbackTanggal;
    const loc = parseHeader(e.header);

    let rombongan: string | null = null;
    let aktivitasSpecial: string | null = null;
    let lengger: string[] = [];
    let sinden: string[] = [];
    let artis: string[] = [];
    let wiraswara: string[] = [];
    let isMbeniTok = false;

    for (const ln of e.extra) {
      const cleaned = ln.trim();
      if (!cleaned) continue;

      // Detect "MBENGI TOK" / "MBENGI THOK" / "MBENI TOK" marker.
      // May appear standalone, quoted ("MBENGI THOK"), or embedded in a line.
      // If the line is PURELY the marker (after stripping quotes), set
      // isMbeniTok and skip — it must NOT be treated as aktivitasSpecial.
      const strippedForMbeni = cleaned.replace(/^"|"$/g, "").trim();
      if (/^mbeng?i\s*th?ok$/i.test(strippedForMbeni)) {
        isMbeniTok = true;
        continue;
      }
      // Embedded marker (e.g. marker inside other text) — set flag but
      // keep processing the line for other patterns.
      if (/mbeng?i\s*th?ok/i.test(cleaned)) {
        isMbeniTok = true;
      }

      // Match "(Romb ...)" or abbreviation "(Rom ...)". Both forms appear in
      // real sources — some entries use "Rom" as shorthand for "Rombongan".
      const mRomb = cleaned.match(/^\(Romb?\s+(.*)\)\s*$/);
      if (mRomb) {
        // Keep rombongan name AS-IS from RAW source (no normalization).
        // The name may contain homebase info with " & " or "Kec:/Kab:" —
        // that is NOT the pentas location, so we preserve it verbatim.
        rombongan = mRomb[1].trim();
        continue;
      }
      // Quoted activity marker. Handles BOTH closed quotes ("TAYUB") and
      // unclosed quotes ("JARANAN & WAROK — missing closing quote in source).
      const mQuote = cleaned.match(/^"(.+?)"?\s*$/);
      if (mQuote) {
        aktivitasSpecial = mQuote[1].trim();
        continue;
      }
      if (/^lengger\s*:/i.test(cleaned)) {
        lengger = splitNames(cleaned.replace(/^lengger\s*:\s*/i, ""));
        continue;
      }
      if (/^sinden\s*:/i.test(cleaned)) {
        sinden = splitNames(cleaned.replace(/^sinden\s*:\s*/i, ""));
        continue;
      }
      // Also handle common misspellings: "Sinde:" instead of "Sinden:"
      if (/^sinde\s*:/i.test(cleaned)) {
        sinden = splitNames(cleaned.replace(/^sinde\s*:\s*/i, ""));
        continue;
      }
      if (/^artis[e]?\s*:/i.test(cleaned)) {
        artis = splitNames(cleaned.replace(/^artis[e]?\s*:\s*/i, ""));
        continue;
      }
      // Wiraswara = gamelan musician (niyogo player). New role.
      if (/^wiraswara\s*:/i.test(cleaned)) {
        wiraswara = splitNames(cleaned.replace(/^wiraswara\s*:\s*/i, ""));
        continue;
      }
    }

    let aktivitas_budaya: string;
    let Peran_Rombongan: string;
    let Gagrak: string | null = null;

    if (aktivitasSpecial) {
      const mapped = mapSpecialActivity(aktivitasSpecial);
      if (mapped) {
        aktivitas_budaya = mapped.aktivitas_budaya;
        Peran_Rombongan = mapped.Peran_Rombongan;
        Gagrak = mapped.Gagrak;
      } else {
        aktivitas_budaya = `Pentas ${aktivitasSpecial}`;
        Peran_Rombongan = `Performer Rombongan ${aktivitasSpecial}`;
        Gagrak = null;
      }
    } else {
      aktivitas_budaya = "Pentas Lengger";
      Peran_Rombongan = "Performer Rombongan Lengger";
      // Gagrak only applies to Pentas Lengger.
      // - With sinden → "Sindenan"
      // - Without sinden → "Bedhenan" (default pentas lengger)
      Gagrak = sinden.length > 0 ? "Sindenan" : "Bedhenan";
    }

    const namaList: string[] = [];
    const peranList: string[] = [];
    for (const n of lengger) {
      namaList.push(n);
      peranList.push("Penari");
    }
    for (const n of artis) {
      namaList.push(n);
      peranList.push("Penari");
    }
    for (const n of sinden) {
      namaList.push(n);
      peranList.push("Sinden");
    }
    for (const n of wiraswara) {
      namaList.push(n);
      peranList.push("Wiraswara");
    }

    const row: RowData = {
      Tanggal: rowTanggal,
      TanggalSelesai: null,
      Jam: isMbeniTok ? "19:30" : "15:30", // MBENGI TOK = evening only; otherwise default afternoon (after Asar)
      peristiwa: null,
      Kategori: null,
      aktivitas_budaya,
      Gagrak,
      nama_rombongan: rombongan,
      Peran_Rombongan,
      nama_individu: namaList.length > 0 ? namaList.join("; ") : null,
      peran_individu: peranList.length > 0 ? peranList.join("; ") : null,
      sumber: e.sumber, // per-section source link (each day gets its own)
      bukti: null,
      Lokasi: loc.lokasi,
      "nama_dusun/kampung": loc.dusun,
      "nama_desa/Kelurahan": loc.desa,
      Nama_Kecamatan: loc.kec,
      nama_kabupaten: loc.kab,
      nama_provinsi: loc.kab ? DEFAULT_PROVINSI : null,
      catatan: null,
    };

    if (!rombongan) {
      warnings.push(`Baris "${e.header}" tidak punya baris "(Romb ...)" — nama_rombongan dikosongkan.`);
    }
    if (!loc.kec) {
      warnings.push(`Baris "${e.header}" — kecamatan tidak terdeteksi.`);
    }
    if (namaList.length === 0) {
      warnings.push(`Baris "${e.header}" — tidak ada nama individu terdeteksi.`);
    }

    rows.push(row);
  }

  // Sort rows by Tanggal ascending (entries with no date go last, preserving source order).
  // Entries with the same date keep their original source order (stable sort).
  rows.sort((a, b) => {
    const ta = a.Tanggal ?? "9999-12-31";
    const tb = b.Tanggal ?? "9999-12-31";
    if (ta === tb) return 0;
    return ta < tb ? -1 : 1;
  });

  // Sort tanggalList ascending too (for the preview header display)
  effectiveTanggalList.sort();

  return { tanggalList: effectiveTanggalList, rows, warnings };
}
