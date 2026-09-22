/**
 * LLM typo fix — pass the raw VLM OCR output through an LLM to fix common
 * OCR errors (mis-read characters, inconsistent casing, missing semicolons)
 * WITHOUT changing content (no inventing names, no merging entries).
 *
 * Uses z-ai-web-dev-sdk chat.completions.create (text-only).
 */

import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: ZAI | null = null;

async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

const LLM_FIX_SYSTEM_PROMPT = `Anda adalah proofreader untuk teks OCR "Info Lengger" (komunitas @wonosobonyawijiingseni).

TUGAS: Perbaiki typo/kesalahan OCR pada teks yang diberikan. Output HANYA teks yang sudah diperbaiki, tanpa penjelasan, tanpa code fences.

ATURAN STRICT:
1. JANGAN ubah struktur: header "Info Lengger <hari>, <tanggal>" harus tetap di awal.
2. JANGAN ubah jumlah entri. Jangan gabungkan atau pisahkan entri.
3. JANGAN dibuat-buat nama yang tidak ada di input. Jika ragu, biarkan apa adanya.
4. Perbaiki typo OCR yang JELAS:
   - "Lenggerr" → "Lengger", "Lenger" → "Lengger"
   - "Sinclen" / "Sinden" → "Sinden" (huruf i kecil, bukan l)
   - "MBENGI THOK" → "MBENGI TOK" (standar)
   - "Kab." atau "Kab " → "Kab:"
   - "Kec." atau "Kec " → "Kec:"
   - "Romongan" → "Rombongan"
   - Spasi ganda → spasi tunggal
   - Huruf kapital di nama tempat/orang yang jelas salah (e.g. "kEndal" → "Kendal")
5. Format lokasi: "<dusun>, <desa> Kec: <kec> Kab: <kab>"
6. Multi-nama: pisah dengan "; " (semicolon spasi).
7. Jam: "15:30" (sore) atau "19:30" (malam, dengan "MBENGI TOK" di baris sebelumnya).
8. Jika "Sumber:" line ada di akhir, pertahankan.
9. Hapus baris kosong berlebihan (max 1 baris kosong antar entri).
10. Output harus valid MD yang bisa di-parse oleh parser Info Lengger.

CONTOH INPUT (dengan typo):
"Lengger Senin, 22 September 2026\\n\\n1_Krajan, Lengkong Kec Mojoendung Kab Kendal\\nRomongan GAGRAK SENI MOJO\\nSinclen Bu Yati\\nLengger Antok Bagong\\nJam 15.30"

CONTOH OUTPUT (typo fixed):
"Info Lengger Senin, 22 September 2026\\n\\n1_Krajan, Lengkong Kec: Mojoendung Kab: Kendal\\nRombongan: GAGRAK SENI MOJO\\nSinden: Bu Yati\\nLengger: Antok; Bagong\\nJam: 15:30"

Output HANYA teks diperbaiki. Tanpa penjelasan.`;

export interface LlmFixResult {
  text: string;
  ok: boolean;
  error?: string;
}

export async function fixTypos(rawMd: string): Promise<LlmFixResult> {
  if (!rawMd.trim()) {
    return { text: "", ok: false, error: "Empty input" };
  }
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: LLM_FIX_SYSTEM_PROMPT },
        { role: "user", content: rawMd },
      ],
      thinking: { type: "disabled" },
    });
    const text = completion.choices[0]?.message?.content ?? "";
    if (!text.trim()) {
      return { text: rawMd, ok: false, error: "LLM returned empty — kept original" };
    }
    // Strip accidental code fences if the LLM added them
    const cleaned = text
      .replace(/^```(?:markdown|md)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "");
    return { text: cleaned, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[llm] fixTypos failed:", msg);
    // Non-fatal: return original text
    return { text: rawMd, ok: false, error: msg };
  }
}
