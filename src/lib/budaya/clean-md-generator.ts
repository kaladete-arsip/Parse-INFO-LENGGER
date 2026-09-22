/**
 * Clean MD Generator — convert parsed RowData[] to standardized Info Lengger MD
 * with YAML frontmatter aligned with OBH (Observatorium Budaya Hidup) database schema.
 *
 * Output: ZIP containing one .md file per date (YYYY-MM-DD-clean.md).
 *
 * Format principles (from OBH schema):
 * - kelengkapan + catatan_gap on every level (data tidak lengkap tidak ditolak)
 * - Nullable by design (rombongan null = belum diketahui, bukan text placeholder)
 * - Field names match DB: tipe_sumber, tipe_aktivitas, kelengkapan, catatan_gap, dimensi_makna
 * - Partisipasi (observed) ≠ Keanggotaan (organizational)
 * - CIDOC-CRM event-centric: peristiwa → aktivitas_harian → partisipasi
 *
 * Body MD format (setiap field di baris terpisah):
 *   <n>_<dusun>, <desa> Kec: X Kab: Y Prov: Z
 *   Rombongan: <nama | null>
 *   Aktivitas: <tipe_aktivitas>
 *   Gagrak: <Sindenan | Bedhenan | null>
 *   Quote: "<marker>"         (opsional, multiple)
 *   Jam: <15:30 | 19:30>
 *   Lengger: <nama1; nama2>   (opsional)
 *   Sinden: <nama1>           (opsional)
 *   ; catatan_gap: <penjelasan>  (jika ada gap)
 */

import { parseMd, type RowData } from "./md-parser";
import { normalizeInput } from "./normalize-input";
import { DEFAULT_PROVINSI } from "./template";
import JSZip from "jszip";

// ─── Date helpers ───────────────────────────────────────────

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** ISO date → "Day, DD Month YYYY" (EYD: Jumat tanpa apostrof). */
function isoToIndonesianDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${DAYS_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─── Reverse mapping: aktivitas_budaya → quote marker ───────

const ACTIVITY_TO_QUOTE: Record<string, string> = {
  "Pentas Tayub": "TAYUB",
  "Pentas Warok": "WAROK",
  "Pentas Jaranan & Warok": "JARANAN & WAROK",
  "Pentas Topeng Ireng & Warok": "TOPENG IRENG & WAROK",
  "Pentas Lenggeran, Jaranan & Warok": "LENGGERAN, JARANAN & WAROK",
  "Pentas Jaranan": "JARANAN",
};

// ─── Entry reconstruction ────────────────────────────────────

/** Reconstruct a single entry's clean MD lines from RowData. */
function rowToCleanMd(row: RowData, entryNum: number): string {
  const lines: string[] = [];

  // 1. Peristiwa (Layer 1 — WHY, nullable, diisi manual dari flyer)
  lines.push(`Peristiwa : ${row.peristiwa ?? ""}`);
  lines.push(`Kategori : ${row.Kategori ?? ""}`);

  // 2. aktivitas_budaya (Layer 2 — WHAT, dari parser)
  if (row.aktivitas_budaya) {
    lines.push(`aktivitas_budaya : ${row.aktivitas_budaya}`);
  } else {
    lines.push("aktivitas_budaya :");
  }

  // 3. Gagrak
  if (row.Gagrak) {
    lines.push(`Gagrak : ${row.Gagrak}`);
  } else {
    lines.push("Gagrak :");
  }

  // 4. Quote markers (MBENGI THOK + aktivitas quotes)
  if (row.Jam === "19:30") {
    lines.push('Quote : "MBENGI THOK"');
  }
  if (row.aktivitas_budaya && row.aktivitas_budaya !== "Pentas Lengger") {
    const quote = ACTIVITY_TO_QUOTE[row.aktivitas_budaya];
    if (quote) {
      lines.push(`Quote : "${quote}"`);
    } else {
      const stripped = row.aktivitas_budaya.replace(/^Pentas\s+/i, "");
      lines.push(`Quote : "${stripped}"`);
    }
  }

  // 5. Jam
  if (row.Jam) {
    lines.push(`Jam : ${row.Jam}`);
  } else {
    lines.push("Jam :");
  }

  // 6. Lokasi (multi-line, setiap level berlabel eksplisit)
  const kec = row.Nama_Kecamatan ?? "";
  const kab = row.nama_kabupaten ?? "";
  const dusun = row["nama_dusun/kampung"] ?? "";
  const desa = row["nama_desa/Kelurahan"] ?? "";
  const lokasi = row.Lokasi ?? "";
  const prov = row.nama_provinsi ?? DEFAULT_PROVINSI;

  lines.push("Lokasi :");
  if (lokasi && !dusun && !desa) {
    // Venue-type location (e.g., "Halaman Terminal Kalibeber")
    lines.push(`Lokasi: ${lokasi}`);
  } else {
    // Standard dusun/desa/kec/kab/prov
    lines.push(`Dusun: ${dusun || ""}`);
    lines.push(`Desa: ${desa || ""}`);
    if (row.kode_desa) lines.push(`KodeDesa: ${row.kode_desa}`);
  }
  lines.push(`Kec: ${kec}`);
  if (row.kode_kecamatan) lines.push(`KodeKec: ${row.kode_kecamatan}`);
  lines.push(`Kab: ${kab}`);
  if (row.kode_kabupaten) lines.push(`KodeKab: ${row.kode_kabupaten}`);
  lines.push(`Prov: ${prov}`);

  // 7. Rombongan (nullable — null means belum diketahui)
  if (row.nama_rombongan) {
    const rombClean = row.nama_rombongan.replace(/\s*&\s*/g, "; ");
    lines.push(`Rombongan: ${rombClean}`);
  } else {
    lines.push("Rombongan: null");
    lines.push("; catatan_gap: rombongan belum diketahui dari sumber");
  }

  // 8. Individu — group by role, separator ;
  const namaInd = row.nama_individu?.split("; ").filter(Boolean) ?? [];
  const peranInd = row.peran_individu?.split("; ").filter(Boolean) ?? [];
  const byRole: Record<string, string[]> = {};
  for (let i = 0; i < namaInd.length; i++) {
    const role = peranInd[i] ?? "Penari";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(namaInd[i]);
  }
  const roleOrder: Record<string, string> = {
    Penari: "Lengger",
    Sinden: "Sinden",
    Wiraswara: "Wiraswara",
  };
  for (const role of ["Penari", "Sinden", "Wiraswara"]) {
    if (byRole[role]?.length) {
      const names = byRole[role].join("; ");
      const prefix = roleOrder[role] ?? role;
      lines.push(`${prefix}: ${names}`);
    }
  }

  // 9. Catatan gap for missing individuals
  if (namaInd.length === 0 && row.aktivitas_budaya === "Pentas Lengger") {
    lines.push("; catatan_gap: tidak ada nama individu tercatat di sumber");
  }

  return lines.join("\n");
}

// ─── Ringkasan (data-driven, bukan LLM) ──────────────────────

/**
 * Generate ringkasan berbasis data raw — hitung jumlah dari RowData[].
 * Bukan AI/LLM yang nulis, tapi script ekstrak dari parser output.
 * User akan edit sebagai ringkasan untuk sentuhan manusia.
 */
function generateSummary(date: string, rows: RowData[], sumber: string | null): string {
  const realEntries = rows.filter((r) => r.nama_rombongan || r.nama_individu || r.Nama_Kecamatan);

  if (realEntries.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`Ringkasan OBH (Observatorium Budaya Hidup) ${date}`);
  lines.push("");
  lines.push(`Dari sumber Komunitas INFO LENGGER Nyawiji Ing Seni (@wonosobonyawijiingseni):`);
  lines.push("");

  // Count stats
  const totalPentas = realEntries.length;

  // Unique lokasi (kabupaten)
  const kabSet = new Set(realEntries.map((r) => r.nama_kabupaten).filter(Boolean));
  const kecSet = new Set(realEntries.map((r) => r.Nama_Kecamatan).filter(Boolean));
  const desaSet = new Set(realEntries.map((r) => r["nama_desa/Kelurahan"]).filter(Boolean));
  const dusunSet = new Set(realEntries.map((r) => r["nama_dusun/kampung"]).filter(Boolean));

  // Unique individu
  const allNames = realEntries.flatMap((r) => (r.nama_individu ?? "").split("; ").filter(Boolean));
  const uniqueNames = [...new Set(allNames)];

  // Peran breakdown
  const allPeran = realEntries.flatMap((r) => (r.peran_individu ?? "").split("; ").filter(Boolean));
  const peranCount: Record<string, number> = {};
  for (const p of allPeran) {
    peranCount[p] = (peranCount[p] ?? 0) + 1;
  }

  // Rombongan
  const rombSet = new Set(realEntries.map((r) => r.nama_rombongan).filter(Boolean));
  const rombNull = realEntries.filter((r) => !r.nama_rombongan).length;

  // Aktivitas breakdown
  const aktCount: Record<string, number> = {};
  for (const r of realEntries) {
    if (r.aktivitas_budaya) {
      aktCount[r.aktivitas_budaya] = (aktCount[r.aktivitas_budaya] ?? 0) + 1;
    }
  }

  // Jam breakdown
  const jamCount: Record<string, number> = {};
  for (const r of realEntries) {
    if (r.Jam) {
      jamCount[r.Jam] = (jamCount[r.Jam] ?? 0) + 1;
    }
  }

  // Build summary text
  lines.push(`- ${totalPentas} titik pentas di ${kabSet.size} kabupaten (${[...kabSet].sort().join(", ")})`);
  lines.push(`- ${dusunSet.size + desaSet.size} lokasi (${dusunSet.size} dusun, ${desaSet.size} desa di ${kecSet.size} kecamatan)`);
  lines.push(`- ${uniqueNames.length} individu (${Object.entries(peranCount).map(([k, v]) => `${v} ${k}`).join(", ")})`);

  if (rombSet.size > 0) {
    const rombList = [...rombSet].map((r) => r.replace(/\s*&\s*/g, "; "));
    lines.push(`- ${rombSet.size} rombongan: ${rombList.join(", ")}`);
  }
  if (rombNull > 0) {
    lines.push(`- ${rombNull} pentas dengan rombongan belum diketahui`);
  }

  lines.push(`- Aktivitas: ${Object.entries(aktCount).map(([k, v]) => `${k} (${v})`).join(", ")}`);

  if (Object.keys(jamCount).length > 1) {
    lines.push(`- Jam: ${Object.entries(jamCount).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  }

  lines.push("");
  lines.push("<!-- Ringkasan ini di-generate dari data raw oleh script. Edit sesuai kebutuhan untuk sentuhan manusia. -->");
  lines.push("");

  return lines.join("\n");
}

// ─── Per-day generation ─────────────────────────────────────

function generateDayMd(date: string, rows: RowData[], sumber: string | null): string {
  const lines: string[] = [];
  lines.push(`Info Lengger ${isoToIndonesianDate(date)}`);
  lines.push("");

  const realEntries = rows.filter((r) => r.nama_rombongan || r.nama_individu || r.Nama_Kecamatan);

  // Ringkasan (data-driven, bukan LLM)
  const summary = generateSummary(date, rows, sumber);
  if (summary) {
    lines.push(summary);
  }

  if (realEntries.length === 0) {
    // Empty date — gap fill
    lines.push("; kelengkapan: tidak_ada");
    lines.push("; catatan_gap: tidak ada event terdeteksi untuk tanggal ini");
    lines.push("; catatan: mungkin post cuma foto (OCR flyer via tab Foto->OCR), atau scraper belum tangkap post");
    if (sumber) {
      lines.push(`; sumber: ${sumber}`);
    } else {
      lines.push("; sumber: (tidak ada - cek manual FB group)");
    }
  } else {
    let entryNum = 1;
    for (const row of realEntries) {
      lines.push(rowToCleanMd(row, entryNum));
      entryNum++;
      lines.push("");
    }

    // Sumber line
    if (sumber) {
      lines.push(`Sumber: ${sumber}`);
    }
  }

  return lines.join("\n");
}

// ─── YAML frontmatter generation ────────────────────────────

function generateYamlFrontmatter(
  date: string,
  rows: RowData[],
  sumber: string | null
): string {
  const realEntries = rows.filter((r) => r.nama_rombongan || r.nama_individu || r.Nama_Kecamatan);

  // Collect unique values for summary
  const tipeAktivitas = [...new Set(realEntries.map((r) => r.aktivitas_budaya).filter(Boolean))];
  const gagrak = [...new Set(realEntries.map((r) => r.Gagrak).filter(Boolean))];
  const jam = [...new Set(realEntries.map((r) => r.Jam).filter(Boolean))];
  const kabupaten = [...new Set(realEntries.map((r) => r.nama_kabupaten).filter(Boolean))].sort();
  const kecamatan = [...new Set(realEntries.map((r) => r.Nama_Kecamatan).filter(Boolean))].sort();
  const provinsi = [...new Set(realEntries.map((r) => r.nama_provinsi).filter(Boolean))].sort();
  const peranInd = [...new Set(realEntries.flatMap((r) => (r.peran_individu ?? "").split("; ").filter(Boolean)))];
  const peranRom = [...new Set(realEntries.map((r) => r.Peran_Rombongan).filter(Boolean))];

  const hasEvents = realEntries.length > 0;
  const kelengkapan = hasEvents ? "partial" : "tidak_ada";
  const catatanGap = hasEvents
    ? "data dari auto-scrape, peristiwa belum diisi dari flyer"
    : "tidak ada event terdeteksi - mungkin post cuma foto atau scraper belum tangkap post";

  // Build YAML
  const yaml: string[] = ["---"];

  // Tanggal
  yaml.push(`# Tanggal (ISO 8601)`);
  yaml.push(`date: ${date}`);
  yaml.push(`date_display: "${isoToIndonesianDate(date)}"`);

  // Dokumen Sumber (Provenance Layer)
  yaml.push("");
  yaml.push(`# Dokumen Sumber (Provenance Layer)`);
  yaml.push(`tipe_sumber: fieldnote`);
  yaml.push(`tanggal_capture: ${new Date().toISOString().slice(0, 10)}`);
  yaml.push(`tingkat_verifikasi: auto-scrape`);
  yaml.push(`status_consent: public`);
  if (sumber) {
    yaml.push(`sumber_url: "${sumber}"`);
  } else {
    yaml.push(`sumber_url: null`);
  }

  // Peristiwa (Event Layer - nullable by design)
  yaml.push("");
  yaml.push(`# Peristiwa (Event Layer - nullable by design)`);
  yaml.push(`peristiwa:`);
  yaml.push(`  nama: null`);
  yaml.push(`  tipe: null`);
  yaml.push(`  dimensi_makna: null`);
  yaml.push(`  kelengkapan: tidak_ada`);
  yaml.push(`  catatan_gap: "tidak ada flyer untuk tanggal ini"`);

  // Aktivitas Harian (summary)
  yaml.push("");
  yaml.push(`# Aktivitas Harian (summary)`);
  yaml.push(`entries_count: ${realEntries.length}`);
  yaml.push(`has_events: ${hasEvents}`);
  yaml.push(`tipe_aktivitas:`);
  if (tipeAktivitas.length > 0) {
    tipeAktivitas.forEach((a) => yaml.push(`  - ${a}`));
  } else {
    yaml.push(`  []`);
  }
  yaml.push(`gagrak:`);
  if (gagrak.length > 0) {
    gagrak.forEach((g) => yaml.push(`  - ${g}`));
  } else {
    yaml.push(`  []`);
  }
  yaml.push(`jam:`);
  if (jam.length > 0) {
    jam.forEach((j) => yaml.push(`  - "${j}"`));
  } else {
    yaml.push(`  []`);
  }

  // Lokasi Summary
  yaml.push("");
  yaml.push(`# Lokasi Summary`);
  yaml.push(`kabupaten:`);
  if (kabupaten.length > 0) {
    kabupaten.forEach((k) => yaml.push(`  - ${k}`));
  } else {
    yaml.push(`  []`);
  }
  yaml.push(`kecamatan:`);
  if (kecamatan.length > 0) {
    kecamatan.forEach((k) => yaml.push(`  - ${k}`));
  } else {
    yaml.push(`  []`);
  }
  yaml.push(`provinsi: ${provinsi[0] ?? DEFAULT_PROVINSI}`);

  // Partisipasi Summary
  yaml.push("");
  yaml.push(`# Partisipasi Summary`);
  yaml.push(`peran_individu:`);
  if (peranInd.length > 0) {
    peranInd.forEach((p) => yaml.push(`  - ${p}`));
  } else {
    yaml.push(`  []`);
  }
  yaml.push(`peran_rombongan:`);
  if (peranRom.length > 0) {
    peranRom.forEach((p) => yaml.push(`  - ${p}`));
  } else {
    yaml.push(`  []`);
  }

  // Status Workflow
  yaml.push("");
  yaml.push(`# Status Workflow`);
  yaml.push(`status: raw`);
  yaml.push(`kelengkapan: ${kelengkapan}`);
  yaml.push(`catatan_gap: "${catatanGap}"`);

  // Generated
  yaml.push("");
  yaml.push(`# Generated`);
  yaml.push(`generated_by: lengger-ledger-converter`);
  yaml.push(`generated_at: ${new Date().toISOString()}`);

  // OBH Attribution
  yaml.push("");
  yaml.push(`# OBH - Observatorium Budaya Hidup`);
  yaml.push(`# https://jayasanganusantara.or.id/observatorium`);

  yaml.push("---");

  return yaml.join("\n");
}

// ─── Public API ──────────────────────────────────────────────

export interface CleanMdResult {
  perDay: Map<string, string>;
  totalEntries: number;
  emptyDates: string[];
}

export function generateCleanMdPerDay(
  rawText: string,
  filename: string
): CleanMdResult {
  const { mdText } = normalizeInput(rawText, filename);
  const result = parseMd(mdText, filename);

  // Group rows by Tanggal
  const byDate = new Map<string, RowData[]>();
  for (const row of result.rows) {
    const date = row.Tanggal ?? "TANPA-TANGGAL";
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  // Generate clean MD for each date
  const perDay = new Map<string, string>();
  let totalEntries = 0;
  const emptyDates: string[] = [];

  for (const [date, rows] of byDate) {
    // Get sumber from first row that has it
    const sumber = rows.find((r) => r.sumber)?.sumber ?? null;

    const yaml = generateYamlFrontmatter(date, rows, sumber);
    const body = generateDayMd(date, rows, sumber);
    const fullMd = `${yaml}\n\n${body}`;

    perDay.set(date, fullMd);

    const realCount = rows.filter(
      (r) => r.nama_rombongan || r.nama_individu || r.Nama_Kecamatan
    ).length;
    totalEntries += realCount;
    if (realCount === 0) emptyDates.push(date);
  }

  return { perDay, totalEntries, emptyDates };
}

export async function generateCleanMdZip(
  rawText: string,
  filename: string
): Promise<ArrayBuffer> {
  const { perDay, totalEntries, emptyDates } = generateCleanMdPerDay(rawText, filename);
  const zip = new JSZip();
  const sortedDates = [...perDay.keys()].sort();

  for (const date of sortedDates) {
    const mdContent = perDay.get(date)!;
    zip.file(`${date}-clean.md`, mdContent);
  }

  // README with OBH attribution
  const summary = `# OBH - Observatorium Budaya Hidup
# https://jayasanganusantara.or.id/observatorium

# Clean MD Archive

Generated from: ${filename}
Date: ${new Date().toISOString()}

## Summary
- Total dates: ${sortedDates.length}
- Total entries: ${totalEntries}
- Empty dates (validasi ke sumber): ${emptyDates.length}
- Date range: ${sortedDates[0] ?? "N/A"} -> ${sortedDates[sortedDates.length - 1] ?? "N/A"}

## Files
Each file is one day's Info Lengger in standardized MD format with YAML frontmatter.
YAML fields aligned with OBH database schema (CIDOC-CRM event-centric).

## Format
Each file contains:
- YAML frontmatter (date, sumber, peristiwa, aktivitas, lokasi, partisipasi, status)
- Body: standardized Info Lengger MD (each field on separate line)

## Status
status: raw (data dari auto-scrape, peristiwa belum diisi dari flyer)

## Next steps
1. Cross-check flyer untuk tiap tanggal (cari peristiwa: nikahan, sunatan, merti dusun, dll.)
2. Isi peristiwa.nama, peristiwa.tipe, peristiwa.dimensi_makna di YAML
3. Setelah review, status: draft -> reviewed -> published

## Sumber data
Sumber: INFO LENGGER Nyawiji Ing Seni (@wonosobonyawijiingseni)
Dataset: Yayasan Jaya Sanga Nusantara
License: CC BY 4.0
`;

  zip.file("README.md", summary);

  return await zip.generateAsync({ type: "arraybuffer" });
}

/**
 * Generate 1 single .md file (all days concatenated) — for raw-clean.md.
 * Used when user clicks "Download raw-clean.md" in Tab 1 (Upload RAW).
 */
export function generateCleanMdSingleFile(
  rawText: string,
  filename: string
): string {
  const { perDay } = generateCleanMdPerDay(rawText, filename);
  const sortedDates = [...perDay.keys()].sort();
  return sortedDates.map((date) => perDay.get(date)!).join("\n\n---\n\n");
}

/**
 * Generate clean.md ZIP from RowData[] (from edited Excel).
 * Used when user clicks "Download clean.md ZIP" in Tab 3 (Upload Excel).
 */
export async function generateCleanMdZipFromRows(
  rows: RowData[],
  filename: string
): Promise<ArrayBuffer> {
  const byDate = new Map<string, RowData[]>();
  for (const row of rows) {
    const date = row.Tanggal ?? "TANPA-TANGGAL";
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  const perDay = new Map<string, string>();
  for (const [date, dayRows] of byDate) {
    const sumber = dayRows.find((r) => r.sumber)?.sumber ?? null;
    const yaml = generateYamlFrontmatter(date, dayRows, sumber);
    const body = generateDayMd(date, dayRows, sumber);
    perDay.set(date, `${yaml}\n\n${body}`);
  }

  const zip = new JSZip();
  const sortedDates = [...perDay.keys()].sort();
  for (const date of sortedDates) {
    zip.file(`${date}-clean.md`, perDay.get(date)!);
  }

  const totalEntries = rows.filter(
    (r) => r.nama_rombongan || r.nama_individu || r.Nama_Kecamatan
  ).length;

  zip.file("README.md", `# OBH - Observatorium Budaya Hidup
# https://jayasanganusantara.or.id/observatorium

# Clean MD Archive (from edited Excel)

Generated from: ${filename}
Date: ${new Date().toISOString()}

## Summary
- Total dates: ${sortedDates.length}
- Total entries: ${totalEntries}
- Date range: ${sortedDates[0] ?? "N/A"} -> ${sortedDates[sortedDates.length - 1] ?? "N/A"}

## Status
status: draft (data dari Excel yang sudah diedit user)

## Sumber data
Sumber: INFO LENGGER Nyawiji Ing Seni (@wonosobonyawijiingseni)
Dataset: Yayasan Jaya Sanga Nusantara
License: CC BY 4.0
`);

  return await zip.generateAsync({ type: "arraybuffer" });
}

