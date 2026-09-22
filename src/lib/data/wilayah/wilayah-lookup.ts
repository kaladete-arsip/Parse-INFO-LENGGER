/**
 * Wilayah Lookup — comprehensive lookup using ALL tier1 + tier2 data.
 *
 * Coverage:
 *   - Tier1 Wonosobo: 265 desa + 16 kecamatan (full)
 *   - Tier2 (20 kabupaten sekitar): ~6000 desa + kecamatan
 *   - Geo: 21 kabupaten + 69 kecamatan with GPS (progressive)
 *
 * Lookup: exact match (case-insensitive) by nama → {kode, nama, lat?, lng?}
 * If not found → catatan_gap for manual addition
 */

import type { WilayahLookupResult } from "./types";
import { GEO_KABUPATEN } from "./geo-kabupaten";
import { GEO_KECAMATAN } from "./geo-kecamatan";

// Tier1 Wonosobo
import { WONOSOBO_DESA } from "./tier1-wonosobo/desa";

// Tier2 — all 20 kabupaten sekitar
import { DESA_BANJARNEGARA, KECAMATAN_BANJARNEGARA } from "./tier2-sekitar/banjarnegara";
import { DESA_BANYUMAS, KECAMATAN_BANYUMAS } from "./tier2-sekitar/banyumas";
import { DESA_BATANG, KECAMATAN_BATANG } from "./tier2-sekitar/batang";
import { DESA_BOYOLALI, KECAMATAN_BOYOLALI } from "./tier2-sekitar/boyolali";
import { DESA_CILACAP, KECAMATAN_CILACAP } from "./tier2-sekitar/cilacap";
import { DESA_DEMAK, KECAMATAN_DEMAK } from "./tier2-sekitar/demak";
import { DESA_GROBOGAN, KECAMATAN_GROBOGAN } from "./tier2-sekitar/grobogan";
import { DESA_JEPARA, KECAMATAN_JEPARA } from "./tier2-sekitar/jepara";
import { DESA_KARANGANYAR, KECAMATAN_KARANGANYAR } from "./tier2-sekitar/karanganyar";
import { DESA_KEBUMEN, KECAMATAN_KEBUMEN } from "./tier2-sekitar/kebumen";
import { DESA_KENDAL, KECAMATAN_KENDAL } from "./tier2-sekitar/kendal";
import { DESA_KUDUS, KECAMATAN_KUDUS } from "./tier2-sekitar/kudus";
import { DESA_MAGELANG, KECAMATAN_MAGELANG } from "./tier2-sekitar/magelang";
import { DESA_PEKALONGAN, KECAMATAN_PEKALONGAN } from "./tier2-sekitar/pekalongan";
import { DESA_PEMALANG, KECAMATAN_PEMALANG } from "./tier2-sekitar/pemalang";
import { DESA_PURBALINGGA, KECAMATAN_PURBALINGGA } from "./tier2-sekitar/purbalingga";
import { DESA_PURWOREJO, KECAMATAN_PURWOREJO } from "./tier2-sekitar/purworejo";
import { DESA_SEMARANG, KECAMATAN_SEMARANG } from "./tier2-sekitar/semarang";
import { DESA_TEMANGGUNG, KECAMATAN_TEMANGGUNG } from "./tier2-sekitar/temanggung";
import { DESA_WONOGIRI, KECAMATAN_WONOGIRI } from "./tier2-sekitar/wonogiri";

// ─── Build unified lookup maps ──────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

// All desa from tier1 + tier2
const ALL_DESA = [
  ...WONOSOBO_DESA,
  ...DESA_BANJARNEGARA, ...DESA_BANYUMAS, ...DESA_BATANG, ...DESA_BOYOLALI,
  ...DESA_CILACAP, ...DESA_DEMAK, ...DESA_GROBOGAN, ...DESA_JEPARA,
  ...DESA_KARANGANYAR, ...DESA_KEBUMEN, ...DESA_KENDAL, ...DESA_KUDUS,
  ...DESA_MAGELANG, ...DESA_PEKALONGAN, ...DESA_PEMALANG, ...DESA_PURBALINGGA,
  ...DESA_PURWOREJO, ...DESA_SEMARANG, ...DESA_TEMANGGUNG, ...DESA_WONOGIRI,
];

// All kecamatan from tier2 (tier1 kecamatan are in geo-kecamatan.ts)
const ALL_KECAMATAN = [
  ...KECAMATAN_BANJARNEGARA, ...KECAMATAN_BANYUMAS, ...KECAMATAN_BATANG,
  ...KECAMATAN_BOYOLALI, ...KECAMATAN_CILACAP, ...KECAMATAN_DEMAK,
  ...KECAMATAN_GROBOGAN, ...KECAMATAN_JEPARA, ...KECAMATAN_KARANGANYAR,
  ...KECAMATAN_KEBUMEN, ...KECAMATAN_KENDAL, ...KECAMATAN_KUDUS,
  ...KECAMATAN_MAGELANG, ...KECAMATAN_PEKALONGAN, ...KECAMATAN_PEMALANG,
  ...KECAMATAN_PURBALINGGA, ...KECAMATAN_PURWOREJO, ...KECAMATAN_SEMARANG,
  ...KECAMATAN_TEMANGGUNG, ...KECAMATAN_WONOGIRI,
];

// Build name → desa lookup map
const DESA_MAP = new Map<string, { kode: string; nama: string }>();
for (const d of ALL_DESA) {
  DESA_MAP.set(normalize(d.nama), { kode: d.kodeKemendagri, nama: d.nama });
}

// Build name → kecamatan lookup map (from tier2 + geo)
const KECAMATAN_MAP = new Map<string, { kode: string; nama: string; lat?: number; lng?: number }>();
for (const k of ALL_KECAMATAN) {
  KECAMATAN_MAP.set(normalize(k.nama), { kode: k.kodeKemendagri, nama: k.nama });
}
// Add geo kecamatan (with GPS)
for (const [kode, entry] of Object.entries(GEO_KECAMATAN)) {
  const key = normalize(entry.namaWilayah);
  if (!KECAMATAN_MAP.has(key)) {
    KECAMATAN_MAP.set(key, { kode, nama: entry.namaWilayah, lat: entry.koordinat.lat, lng: entry.koordinat.lng });
  } else {
    // Enrich with GPS if available
    const existing = KECAMATAN_MAP.get(key)!;
    if (!existing.lat) {
      existing.lat = entry.koordinat.lat;
      existing.lng = entry.koordinat.lng;
    }
  }
}

// ─── Public API ──────────────────────────────────────────────

export function lookupKabupaten(nama: string): WilayahLookupResult | null {
  const target = normalize(nama);
  for (const entry of Object.values(GEO_KABUPATEN)) {
    if (normalize(entry.namaWilayah) === target) {
      return { kode: entry.kodeKemendagri, nama: entry.namaWilayah, lat: entry.koordinat.lat, lng: entry.koordinat.lng };
    }
  }
  return null;
}

export function lookupKecamatan(nama: string): WilayahLookupResult | null {
  const result = KECAMATAN_MAP.get(normalize(nama));
  if (result) {
    return { kode: result.kode, nama: result.nama, lat: result.lat, lng: result.lng };
  }
  return null;
}

export function lookupDesa(nama: string): WilayahLookupResult | null {
  const result = DESA_MAP.get(normalize(nama));
  if (result) {
    return { kode: result.kode, nama: result.nama };
  }
  return null;
}

export function getDesaCount(): number {
  return ALL_DESA.length;
}

export function getKecamatanCount(): number {
  return KECAMATAN_MAP.size;
}

export function getKabupatenCount(): number {
  return Object.keys(GEO_KABUPATEN).length;
}
