/**
 * Types for wilayah (location) master data.
 * Aligns with OBH schema location_master table.
 *
 * 2 type systems:
 * 1. WilayahDesa/Kecamatan/Kabupaten — from tier1/tier2 (kode + nama, no GPS)
 * 2. GeoWilayahEntry — from geo-*.ts (kode + nama + GPS coordinates)
 */

// ── Tier1/Tier2 types (kemendagri codes + names, no GPS) ────

export interface WilayahProvinsi {
  kodeKemendagri: string;
  kodeBPS: string;
  nama: string;
}

export interface WilayahKabupaten {
  kodeKemendagri: string;
  kodeBPS: string;
  nama: string;
  tipe: string; // 'kabupaten' | 'kota'
  provinsiKode: string;
}

export interface WilayahKecamatan {
  kodeKemendagri: string;
  kodeBPS: string;
  nama: string;
  namaResmi: string;
  kabupatenKode: string;
}

export interface WilayahDesa {
  kodeKemendagri: string;
  kodeBPS: string;
  nama: string;
  namaResmi: string;
  tipe: string; // 'desa' | 'kelurahan'
  kecamatanKode: string;
}

// ── Geo types (GPS coordinates, progressive) ──────────────

export interface GeoKoordinat {
  lat: number;
  lng: number;
  source: string;
  accuracy: string;
}

export interface GeoWilayahEntry {
  kodeKemendagri: string;
  koordinat: GeoKoordinat;
  namaWilayah: string;
  alamatLengkap?: string;
}

export interface WilayahLookupResult {
  kode: string;
  nama: string;
  lat?: number;
  lng?: number;
}
