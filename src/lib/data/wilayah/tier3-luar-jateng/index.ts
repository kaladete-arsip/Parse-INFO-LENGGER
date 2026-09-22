import type { WilayahProvinsi, WilayahKabupaten } from '../types'

// ─── Tier 3: Luar Jawa Tengah (Reaktif) ──────────────────────
// Data ini hanya placeholder level provinsi + kabupaten utama.
// Ditambah secara reaktif saat data muncul dari UNMAPPED_WILAYAH report.
// TIDAK ada kecamatan/desa di Tier 3 — cukup untuk identifikasi.

export const TIER3_PROVINSI: WilayahProvinsi[] = [
  // Jawa
  { kodeKemendagri: '33', kodeBPS: '33', nama: 'Jawa Tengah' },
  { kodeKemendagri: '32', kodeBPS: '32', nama: 'Jawa Barat' },
  { kodeKemendagri: '31', kodeBPS: '31', nama: 'DKI Jakarta' },
  { kodeKemendagri: '35', kodeBPS: '35', nama: 'Jawa Timur' },
  { kodeKemendagri: '34', kodeBPS: '34', nama: 'DI Yogyakarta' },
  { kodeKemendagri: '36', kodeBPS: '36', nama: 'Banten' },
  // Kalimantan
  { kodeKemendagri: '62', kodeBPS: '62', nama: 'Kalimantan Tengah' },
  { kodeKemendagri: '63', kodeBPS: '63', nama: 'Kalimantan Selatan' },
  { kodeKemendagri: '64', kodeBPS: '64', nama: 'Kalimantan Timur' },
  { kodeKemendagri: '61', kodeBPS: '61', nama: 'Kalimantan Barat' },
  { kodeKemendagri: '65', kodeBPS: '65', nama: 'Kalimantan Utara' },
  // Sumatera
  { kodeKemendagri: '11', kodeBPS: '11', nama: 'Aceh' },
  { kodeKemendagri: '12', kodeBPS: '12', nama: 'Sumatera Utara' },
  { kodeKemendagri: '13', kodeBPS: '13', nama: 'Sumatera Barat' },
  { kodeKemendagri: '14', kodeBPS: '14', nama: 'Riau' },
  { kodeKemendagri: '15', kodeBPS: '15', nama: 'Jambi' },
  { kodeKemendagri: '16', kodeBPS: '16', nama: 'Sumatera Selatan' },
  { kodeKemendagri: '17', kodeBPS: '17', nama: 'Bengkulu' },
  { kodeKemendagri: '18', kodeBPS: '18', nama: 'Lampung' },
  { kodeKemendagri: '19', kodeBPS: '19', nama: 'Kepulauan Bangka Belitung' },
  { kodeKemendagri: '21', kodeBPS: '21', nama: 'Kepulauan Riau' },
  // Sulawesi
  { kodeKemendagri: '71', kodeBPS: '71', nama: 'Sulawesi Utara' },
  { kodeKemendagri: '72', kodeBPS: '72', nama: 'Sulawesi Tengah' },
  { kodeKemendagri: '73', kodeBPS: '73', nama: 'Sulawesi Selatan' },
  { kodeKemendagri: '74', kodeBPS: '74', nama: 'Sulawesi Tenggara' },
  { kodeKemendagri: '75', kodeBPS: '75', nama: 'Gorontalo' },
  { kodeKemendagri: '76', kodeBPS: '76', nama: 'Sulawesi Barat' },
  // Bali & Nusa Tenggara
  { kodeKemendagri: '51', kodeBPS: '51', nama: 'Bali' },
  { kodeKemendagri: '52', kodeBPS: '52', nama: 'Nusa Tenggara Barat' },
  { kodeKemendagri: '53', kodeBPS: '53', nama: 'Nusa Tenggara Timur' },
  // Maluku & Papua
  { kodeKemendagri: '81', kodeBPS: '81', nama: 'Maluku' },
  { kodeKemendagri: '82', kodeBPS: '82', nama: 'Maluku Utara' },
  { kodeKemendagri: '91', kodeBPS: '91', nama: 'Papua' },
  { kodeKemendagri: '92', kodeBPS: '92', nama: 'Papua Barat' },
]

// Kabupaten/kota utama yang sering muncul di data pentas (reaktif)
export const TIER3_KABUPATEN: WilayahKabupaten[] = [
  // Jawa Barat (32)
  { kodeKemendagri: '32.73', kodeBPS: '3273', nama: 'Kota Bandung', tipe: 'kota', provinsiKode: '32' },
  { kodeKemendagri: '32.04', kodeBPS: '3204', nama: 'Bandung', tipe: 'kabupaten', provinsiKode: '32' },
  { kodeKemendagri: '32.01', kodeBPS: '3201', nama: 'Bogor', tipe: 'kabupaten', provinsiKode: '32' },
  { kodeKemendagri: '32.75', kodeBPS: '3275', nama: 'Kota Bekasi', tipe: 'kota', provinsiKode: '32' },
  { kodeKemendagri: '32.16', kodeBPS: '3216', nama: 'Bekasi', tipe: 'kabupaten', provinsiKode: '32' },
  { kodeKemendagri: '32.09', kodeBPS: '3209', nama: 'Cirebon', tipe: 'kabupaten', provinsiKode: '32' },
  // DKI Jakarta (31)
  { kodeKemendagri: '31.73', kodeBPS: '3173', nama: 'Jakarta Selatan', tipe: 'kota', provinsiKode: '31' },
  { kodeKemendagri: '31.74', kodeBPS: '3174', nama: 'Jakarta Timur', tipe: 'kota', provinsiKode: '31' },
  { kodeKemendagri: '31.71', kodeBPS: '3171', nama: 'Jakarta Selatan', tipe: 'kota', provinsiKode: '31' },
  // Jawa Timur (35)
  { kodeKemendagri: '35.07', kodeBPS: '3507', nama: 'Kediri', tipe: 'kabupaten', provinsiKode: '35' },
  { kodeKemendagri: '35.78', kodeBPS: '3578', nama: 'Kota Surabaya', tipe: 'kota', provinsiKode: '35' },
  { kodeKemendagri: '35.15', kodeBPS: '3515', nama: 'Jombang', tipe: 'kabupaten', provinsiKode: '35' },
  // DI Yogyakarta (34)
  { kodeKemendagri: '34.02', kodeBPS: '3402', nama: 'Bantul', tipe: 'kabupaten', provinsiKode: '34' },
  { kodeKemendagri: '34.71', kodeBPS: '3471', nama: 'Kota Yogyakarta', tipe: 'kota', provinsiKode: '34' },
  // Kalimantan
  { kodeKemendagri: '63.03', kodeBPS: '6303', nama: 'Banjar', tipe: 'kabupaten', provinsiKode: '63' },
  { kodeKemendagri: '63.71', kodeBPS: '6371', nama: 'Kota Banjarmasin', tipe: 'kota', provinsiKode: '63' },
  { kodeKemendagri: '62.03', kodeBPS: '6203', nama: 'Kapuas', tipe: 'kabupaten', provinsiKode: '62' },
  { kodeKemendagri: '62.05', kodeBPS: '6205', nama: 'Barito Selatan', tipe: 'kabupaten', provinsiKode: '62' },
  { kodeKemendagri: '64.71', kodeBPS: '6471', nama: 'Kota Samarinda', tipe: 'kota', provinsiKode: '64' },
  // Bali
  { kodeKemendagri: '51.02', kodeBPS: '5102', nama: 'Badung', tipe: 'kabupaten', provinsiKode: '51' },
  { kodeKemendagri: '51.71', kodeBPS: '5171', nama: 'Kota Denpasar', tipe: 'kota', provinsiKode: '51' },
]
