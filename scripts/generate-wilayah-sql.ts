/**
 * Generate SQL INSERT statements from wilayah .ts files.
 * Run: bun run scripts/generate-wilayah-sql.ts
 * Output: supabase/seed-wilayah.sql
 */

import { GEO_KABUPATEN } from "../src/lib/data/wilayah/geo-kabupaten";
import { GEO_KECAMATAN } from "../src/lib/data/wilayah/geo-kecamatan";
import { WONOSOBO_DESA } from "../src/lib/data/wilayah/tier1-wonosobo/desa";
import { TIER3_PROVINSI } from "../src/lib/data/wilayah/tier3-luar-jateng/index";

import { KABUPATEN_BANJARNEGARA, KECAMATAN_BANJARNEGARA, DESA_BANJARNEGARA } from "../src/lib/data/wilayah/tier2-sekitar/banjarnegara";
import { KECAMATAN_BANYUMAS, DESA_BANYUMAS } from "../src/lib/data/wilayah/tier2-sekitar/banyumas";
import { KECAMATAN_BATANG, DESA_BATANG } from "../src/lib/data/wilayah/tier2-sekitar/batang";
import { KECAMATAN_BOYOLALI, DESA_BOYOLALI } from "../src/lib/data/wilayah/tier2-sekitar/boyolali";
import { KECAMATAN_CILACAP, DESA_CILACAP } from "../src/lib/data/wilayah/tier2-sekitar/cilacap";
import { KECAMATAN_DEMAK, DESA_DEMAK } from "../src/lib/data/wilayah/tier2-sekitar/demak";
import { KECAMATAN_GROBOGAN, DESA_GROBOGAN } from "../src/lib/data/wilayah/tier2-sekitar/grobogan";
import { KECAMATAN_JEPARA, DESA_JEPARA } from "../src/lib/data/wilayah/tier2-sekitar/jepara";
import { KECAMATAN_KARANGANYAR, DESA_KARANGANYAR } from "../src/lib/data/wilayah/tier2-sekitar/karanganyar";
import { KECAMATAN_KEBUMEN, DESA_KEBUMEN } from "../src/lib/data/wilayah/tier2-sekitar/kebumen";
import { KECAMATAN_KENDAL, DESA_KENDAL } from "../src/lib/data/wilayah/tier2-sekitar/kendal";
import { KECAMATAN_KUDUS, DESA_KUDUS } from "../src/lib/data/wilayah/tier2-sekitar/kudus";
import { KECAMATAN_MAGELANG, DESA_MAGELANG } from "../src/lib/data/wilayah/tier2-sekitar/magelang";
import { KECAMATAN_PEKALONGAN, DESA_PEKALONGAN } from "../src/lib/data/wilayah/tier2-sekitar/pekalongan";
import { KECAMATAN_PEMALANG, DESA_PEMALANG } from "../src/lib/data/wilayah/tier2-sekitar/pemalang";
import { KECAMATAN_PURBALINGGA, DESA_PURBALINGGA } from "../src/lib/data/wilayah/tier2-sekitar/purbalingga";
import { KECAMATAN_PURWOREJO, DESA_PURWOREJO } from "../src/lib/data/wilayah/tier2-sekitar/purworejo";
import { KECAMATAN_SEMARANG, DESA_SEMARANG } from "../src/lib/data/wilayah/tier2-sekitar/semarang";
import { KECAMATAN_TEMANGGUNG, DESA_TEMANGGUNG } from "../src/lib/data/wilayah/tier2-sekitar/temanggung";
import { KECAMATAN_WONOGIRI, DESA_WONOGIRI } from "../src/lib/data/wilayah/tier2-sekitar/wonogiri";
import { writeFileSync } from "fs";

function esc(s: string | undefined | null): string {
  if (!s) return "NULL";
  return "'" + s.replace(/'/g, "''") + "'";
}

const lines: string[] = [];
lines.push("-- OBH Master Lokasi Seed Data");
lines.push("-- Generated: " + new Date().toISOString());
lines.push("-- Source: INFO LENGGER Nyawiji Ing Seni + Kemendagri/BPS codes");
lines.push("");

// Provinsi
lines.push("-- === Provinsi ===");
for (const p of TIER3_PROVINSI) {
  lines.push(`INSERT INTO master_lokasi (nama, nama_resmi, level, tipe, kode_kemendagri, kode_bps, status, kelengkapan) VALUES (${esc(p.nama)}, ${esc(p.nama.toUpperCase())}, 'provinsi', 'provinsi', ${esc(p.kodeKemendagri)}, ${esc(p.kodeBPS)}, 'confirmed', 'lengkap');`);
}

// Kabupaten
lines.push("\n-- === Kabupaten (with GPS) ===");
for (const [kode, e] of Object.entries(GEO_KABUPATEN)) {
  lines.push(`INSERT INTO master_lokasi (nama, nama_resmi, level, tipe, kode_kemendagri, lat, lng, geo_accuracy, geo_source, alamat_lengkap, status, kelengkapan) VALUES (${esc(e.namaWilayah)}, ${esc(e.namaWilayah.toUpperCase())}, 'kabupaten', 'kabupaten', ${esc(kode)}, ${e.koordinat.lat}, ${e.koordinat.lng}, ${esc(e.koordinat.accuracy)}, ${esc(e.koordinat.source)}, ${esc(e.alamatLengkap)}, 'confirmed', 'lengkap');`);
}

// Kecamatan (geo, with GPS)
lines.push("\n-- === Kecamatan (geo, with GPS) ===");
for (const [kode, e] of Object.entries(GEO_KECAMATAN)) {
  lines.push(`INSERT INTO master_lokasi (nama, nama_resmi, level, tipe, kode_kemendagri, lat, lng, geo_accuracy, geo_source, alamat_lengkap, status, kelengkapan) VALUES (${esc(e.namaWilayah)}, ${esc(e.namaWilayah.toUpperCase())}, 'kecamatan', 'kecamatan', ${esc(kode)}, ${e.koordinat.lat}, ${e.koordinat.lng}, ${esc(e.koordinat.accuracy)}, ${esc(e.koordinat.source)}, ${esc(e.alamatLengkap)}, 'confirmed', 'lengkap');`);
}

// Kecamatan (tier2, no GPS)
const allKec2 = [
  ...KECAMATAN_BANJARNEGARA, ...KECAMATAN_BANYUMAS, ...KECAMATAN_BATANG,
  ...KECAMATAN_BOYOLALI, ...KECAMATAN_CILACAP, ...KECAMATAN_DEMAK,
  ...KECAMATAN_GROBOGAN, ...KECAMATAN_JEPARA, ...KECAMATAN_KARANGANYAR,
  ...KECAMATAN_KEBUMEN, ...KECAMATAN_KENDAL, ...KECAMATAN_KUDUS,
  ...KECAMATAN_MAGELANG, ...KECAMATAN_PEKALONGAN, ...KECAMATAN_PEMALANG,
  ...KECAMATAN_PURBALINGGA, ...KECAMATAN_PURWOREJO, ...KECAMATAN_SEMARANG,
  ...KECAMATAN_TEMANGGUNG, ...KECAMATAN_WONOGIRI,
];
lines.push(`\n-- === Kecamatan (tier2, ${allKec2.length}, no GPS) ===`);
for (const k of allKec2) {
  lines.push(`INSERT INTO master_lokasi (nama, nama_resmi, level, tipe, kode_kemendagri, kode_bps, status, kelengkapan, catatan_gap) VALUES (${esc(k.nama)}, ${esc(k.namaResmi)}, 'kecamatan', 'kecamatan', ${esc(k.kodeKemendagri)}, ${esc(k.kodeBPS)}, 'confirmed', 'partial', 'GPS belum tersedia');`);
}

// Desa
const allDesa2 = [
  ...WONOSOBO_DESA,
  ...DESA_BANJARNEGARA, ...DESA_BANYUMAS, ...DESA_BATANG, ...DESA_BOYOLALI,
  ...DESA_CILACAP, ...DESA_DEMAK, ...DESA_GROBOGAN, ...DESA_JEPARA,
  ...DESA_KARANGANYAR, ...DESA_KEBUMEN, ...DESA_KENDAL, ...DESA_KUDUS,
  ...DESA_MAGELANG, ...DESA_PEKALONGAN, ...DESA_PEMALANG, ...DESA_PURBALINGGA,
  ...DESA_PURWOREJO, ...DESA_SEMARANG, ...DESA_TEMANGGUNG, ...DESA_WONOGIRI,
];
lines.push(`\n-- === Desa (${allDesa2.length}) ===`);
for (const d of allDesa2) {
  lines.push(`INSERT INTO master_lokasi (nama, nama_resmi, level, tipe, kode_kemendagri, kode_bps, status, kelengkapan, catatan_gap) VALUES (${esc(d.nama)}, ${esc(d.namaResmi)}, 'desa', ${esc(d.tipe)}, ${esc(d.kodeKemendagri)}, ${esc(d.kodeBPS)}, 'confirmed', 'partial', 'GPS belum tersedia');`);
}

lines.push(`\n-- Stats: ${TIER3_PROVINSI.length} prov + ${Object.keys(GEO_KABUPATEN).length} kab + ${Object.keys(GEO_KECAMATAN).length + allKec2.length} kec + ${allDesa2.length} desa = ${TIER3_PROVINSI.length + Object.keys(GEO_KABUPATEN).length + Object.keys(GEO_KECAMATAN).length + allKec2.length + allDesa2.length} total`);

writeFileSync("supabase/seed-wilayah.sql", lines.join("\n"));
console.log(`✓ supabase/seed-wilayah.sql generated (${lines.length} lines)`);
console.log(`  Provinsi: ${TIER3_PROVINSI.length}`);
console.log(`  Kabupaten: ${Object.keys(GEO_KABUPATEN).length}`);
console.log(`  Kecamatan: ${Object.keys(GEO_KECAMATAN).length + allKec2.length}`);
console.log(`  Desa: ${allDesa2.length}`);
console.log(`  Total: ${TIER3_PROVINSI.length + Object.keys(GEO_KABUPATEN).length + Object.keys(GEO_KECAMATAN).length + allKec2.length + allDesa2.length}`);
