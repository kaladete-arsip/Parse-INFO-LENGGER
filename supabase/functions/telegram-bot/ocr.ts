/**
 * VLM OCR — send image to Gemini 3 Flash, get text.
 *
 * Gemini API (free, 1500 req/day):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent
 *
 * Fallback: OpenRouter (if Gemini fails)
 *   POST https://openrouter.ai/api/v1/chat/completions
 *
 * VLM prompt: extract Info Lengger text faithfully, preserve format.
 */

const VLM_PROMPT = `You are an OCR assistant specialized in extracting "Info Lengger" text from photos of Instagram posts about the Lengger dance tradition in Wonosobo, Central Java, Indonesia.

Extract ALL text from this image faithfully. Output as Markdown preserving this exact format:

1. Date header: "Info Lengger <Day>, DD Month YYYY"
   - Day: Sabtu, Minggu, Senin, Selasa, Rabu, Kamis, Jumat
   - Month: Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember

2. Entry headers: "<n>_<dusun>, <desa> Kec: <kecamatan> Kab: <kabupaten>"
   - Use UNDERSCORE after number (1_ not 1.)
   - If "Prov:" present, include it

3. Rombongan: "(Romb <name>)"

4. Performers: "Lengger: <names>", "Sinden: <names>", "Wiraswara: <names>"
   - Separator: & and ,

5. Quote markers: "MBENGI THOK", "TAYUB", "JARANAN & WAROK", etc. — keep quoted

6. If "Sumber :" line visible, include it.

DO NOT add commentary, headers (#), or translations. Output ONLY the extracted text.`;

interface OcrResult {
  text: string;
  model: string;
  confidence: number;
}

/** Run Gemini 3 Flash VLM OCR on image. */
export async function runVlmOcr(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  geminiApiKey: string
): Promise<OcrResult> {
  const base64 = bufferToBase64(imageBuffer);

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: VLM_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text.trim()) throw new Error("Gemini returned empty text");

  return { text: text.trim(), model: "gemini-flash", confidence: 90 };
}

/** Fallback: OpenRouter VLM (if Gemini fails). */
export async function runVlmOcrOpenRouter(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  openRouterKey: string
): Promise<OcrResult> {
  const base64 = bufferToBase64(imageBuffer);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: VLM_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) throw new Error(`OpenRouter error ${resp.status}`);

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("OpenRouter returned empty text");

  return { text: text.trim(), model: "openrouter-gemini", confidence: 85 };
}

/** ArrayBuffer to base64 (Deno-compatible). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
