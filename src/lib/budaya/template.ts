/**
 * Template constants for the Lengger/Budaya ledger xlsx.
 * Mirrors the structure of 2026-06-19_2026-06-20.xlsx template (20 columns).
 *
 * Columns (in order):
 *   A  Tanggal
 *   B  TanggalSelesai
 *   C  Jam
 *   D  peristiwa
 *   E  Kategori
 *   F  aktivitas_budaya
 *   G  Gagrak
 *   H  nama_rombongan
 *   I  Peran_Rombongan
 *   J  nama_individu
 *   K  peran_individu
 *   L  sumber
 *   M  bukti
 *   N  Lokasi
 *   O  nama_dusun/kampung
 *   P  nama_desa/Kelurahan
 *   Q  Nama_Kecamatan
 *   R  nama_kabupaten
 *   S  nama_provinsi
 *   T  catatan
 */

export interface ColumnDef {
  key: string;
  header: string;
  width: number;
}

export const COLUMNS: ColumnDef[] = [
  { key: "Tanggal",                  header: "Tanggal",                  width: 21.16 },
  { key: "TanggalSelesai",           header: "TanggalSelesai",           width: 15.0  },
  { key: "Jam",                      header: "Jam",                      width: 16.16 },
  { key: "peristiwa",                header: "peristiwa",                width: 40.0  },
  { key: "Kategori",                 header: "Kategori",                 width: 24.16 },
  { key: "aktivitas_budaya",         header: "aktivitas_budaya",         width: 30.83 },
  { key: "Gagrak",                   header: "Gagrak",                   width: 25.16 },
  { key: "nama_rombongan",           header: "nama_rombongan",           width: 63.0  },
  { key: "Peran_Rombongan",          header: "Peran_Rombongan",          width: 47.83 },
  { key: "nama_individu",            header: "nama_individu",            width: 66.0  },
  { key: "peran_individu",           header: "peran_individu",           width: 25.66 },
  { key: "sumber",                   header: "sumber",                   width: 126.5 },
  { key: "bukti",                    header: "bukti",                    width: 38.33 },
  { key: "Lokasi",                   header: "Lokasi",                   width: 35.16 },
  { key: "nama_dusun/kampung",       header: "nama_dusun/kampung",       width: 19.66 },
  { key: "nama_desa/Kelurahan",      header: "nama_desa/Kelurahan",      width: 19.33 },
  { key: "Nama_Kecamatan",           header: "Nama_Kecamatan",           width: 16.0  },
  { key: "nama_kabupaten",           header: "nama_kabupaten",           width: 31.83 },
  { key: "nama_provinsi",            header: "nama_provinsi",            width: 29.33 },
  { key: "catatan",                  header: "catatan",                  width: 40.5  },
];

export const ROW_HEIGHT = 20.25;
export const HEADER_ROW_HEIGHT = 20.25;
export const DEFAULT_PROVINSI = "Jawa Tengah";

export interface RowData {
  Tanggal?: string | null;
  TanggalSelesai?: string | null;
  Jam?: string | null;
  peristiwa?: string | null;
  Kategori?: string | null;
  aktivitas_budaya?: string | null;
  Gagrak?: string | null;
  nama_rombongan?: string | null;
  Peran_Rombongan?: string | null;
  nama_individu?: string | null;
  peran_individu?: string | null;
  sumber?: string | null;
  bukti?: string | null;
  Lokasi?: string | null;
  "nama_dusun/kampung"?: string | null;
  "nama_desa/Kelurahan"?: string | null;
  Nama_Kecamatan?: string | null;
  nama_kabupaten?: string | null;
  nama_provinsi?: string | null;
  catatan?: string | null;
}
