/**
 * VLM OCR — read a photo file, base64-encode it, send to z-ai-web-dev-sdk's
 * vision chat (createVision) with an Info Lengger extraction prompt.
 *
 * Returns the raw text extracted from the photo (Info Lengger MD format).
 *
 * Uses z-ai-web-dev-sdk in the backend only — never client-side.
 */

import ZAI from "z-ai-web-dev-sdk";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

let zaiInstance: ZAI | null = null;

async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

const VLM_SYSTEM_PROMPT = `Anda adalah OCR khusus untuk flyer "Info Lengger" (komunitas @wonosobonyawijiingseni, Wonosobo).

TUGAS: Baca foto flyer Info Lengger dan ekstrak setiap entri pentas. Output dalam format MD standar Info Lengger (BUKAN teks bebas — ikuti format persis).

FORMAT OUTPUT (wajib ikuti):

\`\`\`
Info Lengger <Hari>, <DD> <Bulan> <YYYY>

1_<dusun/kampung>, <desa/kelurahan> Kec: <kecamatan> Kab: <kabupaten>
Rombongan: <nama rombongan>
Sinden: <nama sinden>
Lengger: <nama1; nama2>
Jam: <15:30 atau 19:30>

2_<dusun>, <desa> Kec: <kec> Kab: <kab>
MBENGI TOK
Rombongan: <nama>
Sinden: <nama>
Lengger: <nama1; nama2>
Jam: 19:30

... (lanjut untuk semua entri)

Sumber: INFO LENGGER Nyawiji Ing Seni (@wonosobonyawijiingseni)
\`\`\`

ATURAN:
1. Mulai dengan header "Info Lengger <hari>, <tanggal>" persis seperti di flyer.
2. Untuk setiap entri: nomor urut + "_" + lokasi (dusun, desa, Kec, Kab).
3. Tulis "MBENGI TOK" di baris terpisah SEBELUM Rombongan JIKA di flyer ada tulisan "MBENGI TOK" / "MBENGI THOK" (artinya pentas malam saja, Jam = 19:30).
4. Jika TIDAK ada "MBENGI TOK", Jam = 15:30 (sore, habis Asar).
5. Nama lengkap: "Bu Yati", "Antok; Bagong" (multi nama pisah dengan "; ").
6. Jangan dibuat-buat. Jika field tidak terbaca, tulis kosong (jangan placeholder "???").
7. Jika ada Sumber/kredit di flyer, akhiri dengan "Sumber: <kredit>".
8. Output HANYA markdown di atas — tanpa penjelasan, tanpa code fences, tanpa pembukaan.`;

export interface OcrResult {
  text: string;
  ok: boolean;
  error?: string;
}

export async function ocrPhoto(photoPath: string): Promise<OcrResult> {
  try {
    const zai = await getZai();
    const buffer = await readFile(photoPath);
    const ext = extname(photoPath).toLowerCase();
    const mime =
      ext === ".png" ? "image/png" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      "image/jpeg";
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "assistant",
          content: VLM_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Ekstrak semua entri Info Lengger dari flyer ini. Output dalam format MD standar." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const text = response.choices[0]?.message?.content ?? "";
    if (!text.trim()) {
      return { text: "", ok: false, error: "VLM returned empty content" };
    }
    return { text, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vlm] OCR failed:", msg);
    return { text: "", ok: false, error: msg };
  }
}
