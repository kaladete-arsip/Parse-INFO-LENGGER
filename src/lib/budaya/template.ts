/**
 * Template constants for the Lengger/Budaya ledger xlsx.
 * Mirrors the OBH (Observatorium Budaya Hidup) database schema.
 *
 * 26 columns arranged by OBH layers:
 *
 *   A-G   Event/Peristiwa layer (WHY + WHEN)
 *   H-K   Partisipasi layer (WHO)
 *   L-Q   Lokasi layer (WHERE)
 *   R-W   Provenance layer (SOURCE)
 *   X-Z   Data Quality layer (META)
 *
 * Aligns with OBH schema tables:
 *   peristiwa, aktivitas_harian, partisipasi, dokumen_sumber
 *
 * Fields like kelengkapan + catatan_gap appear on every DB table
 * (principle: data tidak lengkap tidak ditolak).
 */

export interface ColumnDef {
  key: string;
  header: string;
  width: number;
}

export const COLUMNS: ColumnDef[] = [
  // ── Event / Peristiwa Layer (WHY + WHEN) ──────────────────
  { key: "Tanggal",                  header: "Tanggal",                  width: 21.16 },
  { key: "TanggalSelesai",           header: "TanggalSelesai",           width: 15.0  },
  { key: "Jam",                      header: "Jam",                      width: 12.0  },
  { key: "peristiwa",                header: "peristiwa",                width: 40.0  },
  { key: "Kategori",                 header: "Kategori",                 width: 24.16 },
  { key: "aktivitas_budaya",         header: "aktivitas_budaya",         width: 30.83 },
  { key: "Gagrak",                   header: "Gagrak",                   width: 25.16 },

  // ── Partisipasi Layer (WHO) ───────────────────────────────
  { key: "nama_rombongan",           header: "nama_rombongan",           width: 50.0  },
  { key: "Peran_Rombongan",          header: "Peran_Rombongan",          width: 40.0  },
  { key: "nama_individu",            header: "nama_individu",            width: 50.0  },
  { key: "peran_individu",           header: "peran_individu",           width: 25.66 },

  // ── Lokasi Layer (WHERE) ──────────────────────────────────
  { key: "Lokasi",                   header: "Lokasi",                   width: 35.16 },
  { key: "nama_dusun/kampung",       header: "nama_dusun/kampung",       width: 19.66 },
  { key: "nama_desa/Kelurahan",      header: "nama_desa/Kelurahan",      width: 19.33 },
  { key: "kode_desa",                header: "kode_desa",                width: 18.0  },
  { key: "Nama_Kecamatan",           header: "Nama_Kecamatan",           width: 16.0  },
  { key: "kode_kecamatan",           header: "kode_kecamatan",           width: 15.0  },
  { key: "nama_kabupaten",           header: "nama_kabupaten",           width: 31.83 },
  { key: "kode_kabupaten",           header: "kode_kabupaten",           width: 12.0  },
  { key: "nama_provinsi",            header: "nama_provinsi",            width: 29.33 },

  // ── Provenance Layer (SOURCE) ─────────────────────────────
  { key: "sumber",                   header: "sumber",                   width: 60.0  },
  { key: "bukti",                    header: "bukti",                    width: 38.33 },
  { key: "tipe_sumber",              header: "tipe_sumber",              width: 15.0  },
  { key: "tanggal_capture",          header: "tanggal_capture",          width: 15.0  },
  { key: "tingkat_verifikasi",       header: "tingkat_verifikasi",       width: 18.0  },
  { key: "status_consent",           header: "status_consent",           width: 15.0  },

  // ── Data Quality Layer (META) ────────────────────────────
  { key: "kelengkapan",              header: "kelengkapan",              width: 12.0  },
  { key: "catatan_gap",              header: "catatan_gap",              width: 40.0  },
  { key: "catatan",                  header: "catatan",                  width: 40.5  },
];

export const ROW_HEIGHT = 20.25;
export const HEADER_ROW_HEIGHT = 20.25;
export const DEFAULT_PROVINSI = "Jawa Tengah";

export interface RowData {
  // Event / Peristiwa Layer
  Tanggal?: string | null;
  TanggalSelesai?: string | null;
  Jam?: string | null;
  peristiwa?: string | null;
  Kategori?: string | null;
  aktivitas_budaya?: string | null;
  Gagrak?: string | null;

  // Partisipasi Layer
  nama_rombongan?: string | null;
  Peran_Rombongan?: string | null;
  nama_individu?: string | null;
  peran_individu?: string | null;

  // Lokasi Layer
  Lokasi?: string | null;
  "nama_dusun/kampung"?: string | null;
  "nama_desa/Kelurahan"?: string | null;
  kode_desa?: string | null;
  Nama_Kecamatan?: string | null;
  kode_kecamatan?: string | null;
  nama_kabupaten?: string | null;
  kode_kabupaten?: string | null;
  nama_provinsi?: string | null;

  // Provenance Layer
  sumber?: string | null;
  bukti?: string | null;
  tipe_sumber?: string | null;
  tanggal_capture?: string | null;
  tingkat_verifikasi?: string | null;
  status_consent?: string | null;

  // Data Quality Layer
  kelengkapan?: string | null;
  catatan_gap?: string | null;
  catatan?: string | null;
}
