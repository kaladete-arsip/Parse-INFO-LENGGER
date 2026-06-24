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

function parseHeader(header: string): ParsedLocation {
  const m = header.match(/^\d+_(.*)$/);
  let body = m ? m[1] : header;

  let kec: string | null = null;
  let kab: string | null = null;

  const mKecKab = body.match(/Kec\/Kab:\s*(\S+)/);
  if (mKecKab) {
    kec = mKecKab[1];
    kab = kec;
    body = body.slice(0, mKecKab.index).trim();
  } else {
    const mKec = body.match(/Kec:\s*(\S+)/);
    const mKab = body.match(/Kab:\s*(\S+)/);
    if (mKec) kec = mKec[1];
    if (mKab) kab = mKab[1];
    const starts: number[] = [];
    if (mKec && mKec.index !== undefined) starts.push(mKec.index);
    if (mKab && mKab.index !== undefined) starts.push(mKab.index);
    if (starts.length > 0) {
      body = body.slice(0, Math.min(...starts)).trim();
    }
  }

  let lokasi: string | null = null;
  let dusun: string | null = null;
  let desa: string | null = null;

  // Extract Kec/Kab from the original body before splitting
  const mKec = body.match(/Kec:\s*(\S+)/i);
  const mKab = body.match(/Kab:\s*(\S+)/i);
  if (mKec) kec = mKec[1];
  if (mKab) kab = mKab[1];

  body = body.replace(/,+$/, "").trim();
  const parts = body.split(",").map((p) => p.trim()).filter(Boolean);

  const namedVenueKeywords = ["halaman", "lapangan", "terminal", "pendapa", "alun-alun", "balaidesa"];
  
  // Logic untuk parsing lokasi yang fleksibel:
  // Case 1: dusun, desa, kec, kab (lengkap)
  // Case 2: desa, kec, kab
  // Case 3: lokasi, kec, kab (lokasi spesifik)
  // Case 4: lokasi, kab (lokasi spesifik tanpa kecamatan)
  
  if (parts.length > 0) {
    const firstPart = parts[0].toLowerCase();
    
    // Cek apakah lokasi spesifik (halaman, lapangan, terminal, pendapa, alun-alun, balaidesa)
    if (namedVenueKeywords.some((kw) => firstPart.includes(kw))) {
      // Case 3 & 4: lokasi spesifik
      lokasi = parts[0];
      
      // Jika ada kecamatan/kabupaten di bagian yang sama
      const hasKecKab = parts.some((p) => 
        p.toLowerCase().includes("kec:") || p.toLowerCase().includes("kab:")
      );
      
      // Kec and kab sudah diextract di atas
  } else {
    // Case 1 & 2: dusun/desa, kec, kab
    // Cek apakah bagian pertama adalah dusun (Dk., Dukuh) atau desa (Ds., Desa)
    // Cek original part, not cleaned
    if (parts.length >= 1) {
      const firstPartOriginal = parts[0];
      const firstPartLower = firstPartOriginal.toLowerCase();
      
      // Cek apakah bagian pertama adalah dusun
      if (firstPartLower.startsWith("dk") || 
          firstPartLower.startsWith("dukuh")) {
        dusun = parts[0];
        // Sisa bagian adalah desa dan lokasi
        if (parts.length >= 2) {
          // Bagian kedua bisa berisi "Desa X" atau langsung nama desa
          const secondPartLower = parts[1].toLowerCase();
          if (secondPartLower.startsWith("ds") || secondPartLower.startsWith("desa")) {
            // Strip "Desa" prefix if present
            desa = parts[1].replace(/^desa\s+/i, "").trim();
            // Sisa bagian adalah lokasi
            if (parts.length >= 3) lokasi = parts.slice(2).join(", ");
          } else {
            // Bagian kedua langsung nama desa
            desa = parts[1];
            // Sisa bagian adalah lokasi
            if (parts.length >= 3) lokasi = parts.slice(2).join(", ");
          }
        }
      } else if (parts.length >= 2) {
        // Cek apakah bagian kedua adalah desa (jika bagian pertama bukan dusun)
        const secondPartLower = parts[1].toLowerCase();
        if (secondPartLower.startsWith("ds") || 
            secondPartLower.startsWith("desa")) {
          // Strip "Desa" prefix if present
          desa = parts[1].replace(/^desa\s+/i, "").trim();
          // Sisa bagian adalah lokasi
          if (parts.length >= 3) lokasi = parts.slice(2).join(", ");
        } else {
          // Bagian pertama adalah desa
          desa = parts[0].replace(/^desa\s+/i, "").trim();
          // Sisa bagian adalah lokasi
          if (parts.length >= 2) lokasi = parts.slice(1).join(", ");
        }
      } else {
        // Hanya satu bagian, anggap sebagai desa
        desa = parts[0].replace(/^desa\s+/i, "").trim();
      }
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
 * Normalize rombongan name: convert " & " (multiple groups) to "; " separator.
 * Single-group names with commas (e.g. homebase info) are left untouched.
 *
 * Examples:
 *   "Sri Muda Rahayu & Wahyu Margi Utomo" → "Sri Muda Rahayu; Wahyu Margi Utomo"
 *   "Wargo Ngudi Budoyo, Salaman, Lengkong Kec: Garung Kab: Wonosobo" → unchanged
 */
function normalizeRombongan(name: string): string {
  return name.replace(/\s*&\s*/g, "; ");
}

interface RawEntry {
  header: string;
  extra: string[];
  tanggal: string | null; // date context at the time this entry was parsed
}

/**
 * Split MD into entries.
 *
 * Supports multi-day sources: a "Info Lengger <Day>, DD Month YYYY" line may
 * appear multiple times throughout the file. Each entry inherits the date
 * from the most recent "Info Lengger" line above it.
 *
 * Also detects the trailing "Sumber :" line and the "-----" separator.
 */
function splitEntries(mdText: string): {
  entries: RawEntry[];
  sumber: string | null;
  tanggalList: string[];
} {
  const rawLines = mdText.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const lines = rawLines.filter((l) => l.trim().length > 0);

  let sumber: string | null = null;
  const entries: RawEntry[] = [];
  const tanggalList: string[] = [];
  let current: RawEntry | null = null;
  let currentDate: string | null = null;

  for (const ln of lines) {
    const trimmed = ln.trim();

    // Skip the "-----" separator
    if (/^-{3,}$/.test(trimmed)) continue;

    // Detect "Info Lengger <Day>, DD Month YYYY" — sets current date context
    const infoMatch = trimmed.match(/^info lengger\s+.+$/i);
    if (infoMatch) {
      const parsed = parseDateStr(trimmed);
      if (parsed) {
        currentDate = parsed;
        if (!tanggalList.includes(parsed)) tanggalList.push(parsed);
      }
      continue;
    }

    // Detect "Sumber :" line (anywhere in the doc, typically at the bottom)
    const sumberMatch = trimmed.match(/^Sumber\s*:\s*(.+)$/i);
    if (sumberMatch) {
      sumber = sumberMatch[1].trim();
      continue;
    }

    // New entry starts with "<n>_<text>"
    if (/^\d+_/.test(trimmed)) {
      if (current) entries.push(current);
      current = { header: trimmed, extra: [], tanggal: currentDate };
    } else if (current) {
      current.extra.push(trimmed);
    }
  }
  if (current) entries.push(current);

  return { entries, sumber, tanggalList };
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
  const { entries, sumber, tanggalList } = splitEntries(mdText);

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
    let isMbeniTok = false;

    for (const ln of e.extra) {
      const cleaned = ln.trim();
      if (!cleaned) continue;

      // Detect "MBENGI TOK" / "MBENGI THOK" / "MBENI TOK" marker anywhere in
      // the line (case-insensitive). May appear as a standalone line or
      // embedded (e.g. "MBENGI THOK" inside quotes).
      if (/mbeng?i\s*th?ok/i.test(cleaned)) {
        isMbeniTok = true;
      }

      const mRomb = cleaned.match(/^\(Romb\s+(.*)\)\s*$/);
      if (mRomb) {
        rombongan = normalizeRombongan(mRomb[1].trim());
        continue;
      }
      const mQuote = cleaned.match(/^"(.+)"\s*$/);
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
      sumber: sumber,
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
