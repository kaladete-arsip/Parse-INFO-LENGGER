/**
 * Geo-Wilayah — GPS Coordinate Lookup
 *
 * Provides coordinates for wilayah (kabupaten, kecamatan, desa, dusun, landmark).
 * Data source: OpenStreetMap Nominatim (batch-geocoded) + DB master_lokasi.latitude/longitude.
 *
 * Granularity by Tier:
 *   Tier 1 (Wonosobo): kecamatan + desa + dusun + landmark
 *   Tier 2 (20 kabupaten sekitar): kecamatan only
 *   Tier 3 (luar Jateng): kabupaten only
 *
 * 2 API:
 * - getGeoByKode (sync, static only) — kabupaten/kecamatan/desa Wonosobo
 * - resolveGeoWithFallback (async, DB + static) — full fallback chain:
 *   landmark → dusun → desa → kecamatan → kabupaten
 *
 * Usage:
 *   import { getGeoByKode } from '@/lib/data/wilayah/geo-wilayah'
 *   const coord = getGeoByKode('33.07.12')  // sync, static
 *
 *   import { resolveGeoWithFallback } from '@/lib/data/wilayah/geo-wilayah'
 *   const { lat, lng, accuracy } = await resolveGeoWithFallback('33.07.06.2005.01')
 *   // fallback: dusun no geo → desa geo (accuracy='desa')
 */

import type { GeoKoordinat, GeoWilayahEntry } from './types'
import { GEO_KABUPATEN } from './geo-kabupaten'
import { GEO_KECAMATAN } from './geo-kecamatan'
import { GEO_DESA_WONOSOBO } from './geo-desa-wonosobo'

// Dynamic import db untuk avoid circular dependency (db.ts import dari obh)
async function getDb() {
  const { db } = await import('@/lib/db')
  return db
}

// === PUBLIC API (sync, static only) ===

/**
 * Get GPS coordinates by Kemendagri code (static lookup)
 *
 * Searches in order: desa → kecamatan → kabupaten
 * Returns the most specific match available.
 * Falls back to parent level if exact level not found.
 *
 * Note: Tidak handle dusun/landmark (datanya di DB, bukan static).
 * Untuk dusun/landmark + fallback chain, pakai resolveGeoWithFallback().
 */
export function getGeoByKode(kodeKemendagri: string): GeoKoordinat | null {
  // Try desa level first (Tier 1 only)
  const desaEntry = GEO_DESA_WONOSOBO[kodeKemendagri]
  if (desaEntry) return desaEntry.koordinat

  // Try kecamatan level
  const kecEntry = GEO_KECAMATAN[kodeKemendagri]
  if (kecEntry) return kecEntry.koordinat

  // Try kabupaten level
  const kabEntry = GEO_KABUPATEN[kodeKemendagri]
  if (kabEntry) return kabEntry.koordinat

  // Fallback: try parent kecamatan from desa code (e.g., "33.07.12.2002" → "33.07.12")
  if (kodeKemendagri.length > 8) {
    const parentKec = kodeKemendagri.substring(0, 8) // "33.07.12"
    const parentEntry = GEO_KECAMATAN[parentKec]
    if (parentEntry) return { ...parentEntry.koordinat, accuracy: 'kecamatan' }
  }

  // Fallback: try parent kabupaten from kecamatan code (e.g., "33.07.12" → "33.07")
  if (kodeKemendagri.length >= 5 && kodeKemendagri.length <= 8) {
    const parentKab = kodeKemendagri.substring(0, 5) // "33.07"
    const parentEntry = GEO_KABUPATEN[parentKab]
    if (parentEntry) return { ...parentEntry.koordinat, accuracy: 'kabupaten' }
  }

  return null
}

// === PUBLIC API (async, DB + static, full fallback) ===

/**
 * Resolve geo dengan fallback chain (async, query DB untuk dusun/landmark)
 *
 * Fallback: landmark → dusun → desa → kecamatan → kabupaten
 * Kalau dusun tidak punya geo, pakai geo desa induk (accuracy='desa').
 *
 * Return { lat, lng, accuracy, source } atau null kalau semua level no geo.
 *
 * Dipakai di /api/obh/peta supaya peristiwa dengan dusun no-geo tetap
 * muncul di peta (fallback ke desa).
 */
export async function resolveGeoWithFallback(
  kodeKemendagri: string
): Promise<{ lat: number; lng: number; accuracy: string; source: 'db' | 'static' } | null> {
  const db = await getDb()

  // Walk up the hierarchy: kode → parent → grandparent → ...
  // Cek geo di setiap level (DB dulu untuk dusun/landmark, static untuk desa/kec/kab)
  let currentKode: string | null = kodeKemendagri

  while (currentKode) {
    // 1. Cek DB master_lokasi (untuk semua level, tapi terutama dusun/landmark)
    const dbEntry = await db.masterLokasi.findUnique({
      where: { kodeKemendagri: currentKode },
      select: { latitude: true, longitude: true, level: true, kodeInduk: true },
    })

    if (dbEntry?.latitude && dbEntry?.longitude) {
      return {
        lat: dbEntry.latitude,
        lng: dbEntry.longitude,
        accuracy: dbEntry.level,
        source: 'db',
      }
    }

    // 2. Cek static dataset (desa Wonosobo / kecamatan / kabupaten)
    const staticGeo = getGeoByKode(currentKode)
    if (staticGeo) {
      return {
        lat: staticGeo.lat,
        lng: staticGeo.lng,
        accuracy: staticGeo.accuracy,
        source: 'static',
      }
    }

    // 3. Naik ke parent (kodeInduk dari DB, atau derive dari kode)
    if (dbEntry?.kodeInduk) {
      currentKode = dbEntry.kodeInduk
    } else {
      // Derive parent dari kode (split by '.')
      const parts = currentKode.split('.')
      if (parts.length <= 1) break
      // Handle landmark suffix (.L01) — parent = tanpa .L01
      if (parts[parts.length - 1].startsWith('L')) {
        currentKode = parts.slice(0, -1).join('.')
      } else {
        currentKode = parts.slice(0, -1).join('.')
      }
    }
  }

  return null
}

/**
 * Get full geo entry (with alamatLengkap, namaWilayah) by Kemendagri code
 */
export function getGeoEntryByKode(kodeKemendagri: string): GeoWilayahEntry | null {
  // Desa
  const desaEntry = GEO_DESA_WONOSOBO[kodeKemendagri]
  if (desaEntry) return desaEntry

  // Kecamatan
  const kecEntry = GEO_KECAMATAN[kodeKemendagri]
  if (kecEntry) return kecEntry

  // Kabupaten
  const kabEntry = GEO_KABUPATEN[kodeKemendagri]
  if (kabEntry) return kabEntry

  return null
}

/**
 * Get coordinates for a kabupaten by code
 */
export function getGeoKabupatenByKode(kodeKemendagri: string): GeoKoordinat | null {
  return GEO_KABUPATEN[kodeKemendagri]?.koordinat ?? null
}

/**
 * Get coordinates for a kecamatan by code
 */
export function getGeoKecamatanByKode(kodeKemendagri: string): GeoKoordinat | null {
  return GEO_KECAMATAN[kodeKemendagri]?.koordinat ?? null
}

/**
 * Get all available kabupaten coordinates
 */
export function getAllGeoKabupaten(): GeoWilayahEntry[] {
  return Object.values(GEO_KABUPATEN)
}

/**
 * Get all available kecamatan coordinates
 */
export function getAllGeoKecamatan(): GeoWilayahEntry[] {
  return Object.values(GEO_KECAMATAN)
}

/**
 * Get all available Wonosobo desa coordinates
 */
export function getAllGeoDesaWonosobo(): GeoWilayahEntry[] {
  return Object.values(GEO_DESA_WONOSOBO)
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Find nearby wilayah by coordinates
 * Returns entries sorted by distance (nearest first)
 */
export function findNearby(
  lat: number,
  lng: number,
  maxRadiusKm: number = 50,
  options?: { level?: 'kabupaten' | 'kecamatan' | 'desa' }
): Array<GeoWilayahEntry & { distance: number }> {
  const results: Array<GeoWilayahEntry & { distance: number }> = []

  const searchIn = (entries: Record<string, GeoWilayahEntry>) => {
    for (const entry of Object.values(entries)) {
      if (options?.level && entry.koordinat.accuracy !== options.level) continue
      const dist = haversineDistance(lat, lng, entry.koordinat.lat, entry.koordinat.lng)
      if (dist <= maxRadiusKm) {
        results.push({ ...entry, distance: Math.round(dist * 10) / 10 })
      }
    }
  }

  // Search all levels
  searchIn(GEO_KABUPATEN)
  searchIn(GEO_KECAMATAN)
  searchIn(GEO_DESA_WONOSOBO)

  return results.sort((a, b) => a.distance - b.distance)
}

/**
 * Get bounding box for all mapped wilayah (useful for map viewport)
 */
export function getBounds(): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  let found = false

  const processEntries = (entries: Record<string, GeoWilayahEntry>) => {
    for (const entry of Object.values(entries)) {
      found = true
      minLat = Math.min(minLat, entry.koordinat.lat)
      maxLat = Math.max(maxLat, entry.koordinat.lat)
      minLng = Math.min(minLng, entry.koordinat.lng)
      maxLng = Math.max(maxLng, entry.koordinat.lng)
    }
  }

  processEntries(GEO_KABUPATEN)
  processEntries(GEO_KECAMATAN)
  processEntries(GEO_DESA_WONOSOBO)

  return found ? { minLat, maxLat, minLng, maxLng } : null
}

/**
 * Statistics: how many entries have coordinates
 */
export function getGeoStats(): { kabupaten: number; kecamatan: number; desaWonosobo: number; total: number } {
  const kabCount = Object.keys(GEO_KABUPATEN).length
  const kecCount = Object.keys(GEO_KECAMATAN).length
  const desaCount = Object.keys(GEO_DESA_WONOSOBO).length
  return { kabupaten: kabCount, kecamatan: kecCount, desaWonosobo: desaCount, total: kabCount + kecCount + desaCount }
}
