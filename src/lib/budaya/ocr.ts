/**
 * OCR module using Tesseract.js loaded from CDN (100% client-side).
 *
 * WHY CDN INSTEAD OF NPM IMPORT?
 * Tesseract.js uses Web Workers + WASM + dynamic chunks that Turbopack/Next.js
 * bundler struggles with. Loading from CDN via a <script> tag bypasses all
 * bundling issues and works perfectly with static export (GitHub Pages).
 *
 * Supports image input (PNG, JPEG, WebP, BMP, GIF).
 * Uses Indonesian + English language data for best results on "Info Lengger" photos.
 *
 * Language data + WASM core are fetched on first use (~5MB total) and cached
 * by the browser. No API key, no server — fully privacy-friendly.
 *
 * Compatible with the existing normalize-input → parseMd pipeline:
 * the OCR output text is treated as MD-equivalent and fed to parseMd.
 */

export type OcrLang = "ind" | "ind+eng" | "eng";

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface MultiImageOcrResult {
  text: string;
  items: { name: string; text: string; confidence: number }[];
}

const TESSERACT_CDN =
  "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

// Module-level cache so we only load the script once per session.
let tesseractLoadPromise: Promise<TesseractGlobal> | null = null;

interface TesseractGlobal {
  createWorker: (
    lang: string,
    oem?: number,
    options?: {
      logger?: (m: { status: string; progress: number }) => void;
      errorHandler?: (err: unknown) => void;
    }
  ) => Promise<TesseractWorker>;
}

interface TesseractWorker {
  recognize: (
    image: File | Blob | string
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
}

/**
 * Load Tesseract.js global from CDN (idempotent — only loads once).
 * Returns the global `Tesseract` object.
 */
function loadTesseract(): Promise<TesseractGlobal> {
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    // Already loaded?
    const existing = (window as unknown as { Tesseract?: TesseractGlobal })
      .Tesseract;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const T = (window as unknown as { Tesseract?: TesseractGlobal })
        .Tesseract;
      if (T && typeof T.createWorker === "function") {
        resolve(T);
      } else {
        reject(
          new Error(
            "Tesseract.js loaded from CDN but `Tesseract.createWorker` not found."
          )
        );
      }
    };
    script.onerror = () => {
      tesseractLoadPromise = null; // allow retry
      reject(new Error("Gagal load Tesseract.js dari CDN. Cek koneksi internet."));
    };
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

/**
 * Run OCR on a single image using Tesseract.js.
 *
 * @param image     Image File/Blob/dataURL to recognize.
 * @param lang      Language(s) to use. Default "ind+eng" (best for Indonesian text).
 * @param onProgress Optional progress callback.
 */
export async function runOcr(
  image: File | Blob | string,
  lang: OcrLang = "ind+eng",
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker(lang, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (onProgress) {
        onProgress({ status: m.status, progress: m.progress ?? 0 });
      }
    },
  });

  try {
    const { data } = await worker.recognize(image);
    return {
      text: (data.text ?? "").trim(),
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Run OCR on multiple images sequentially.
 *
 * Results are concatenated with double newlines — same format as multi-post MD,
 * so the existing parseMd pipeline handles multi-day sources seamlessly.
 *
 * @param images   Array of image Files.
 * @param lang     Language(s). Default "ind+eng".
 * @param onProgress Optional progress callback. `status` includes image index.
 */
export async function runOcrBatch(
  images: File[],
  lang: OcrLang = "ind+eng",
  onProgress?: (
    p: OcrProgress & { imageIndex: number; total: number }
  ) => void
): Promise<MultiImageOcrResult> {
  const items: { name: string; text: string; confidence: number }[] = [];
  const total = images.length;

  for (let i = 0; i < total; i++) {
    const img = images[i];
    if (onProgress) {
      onProgress({
        status: `Memproses gambar ${i + 1}/${total}: ${img.name}`,
        progress: i / total,
        imageIndex: i,
        total,
      });
    }

    try {
      const res = await runOcr(img, lang, (p) => {
        if (onProgress) {
          onProgress({
            status: `${p.status} (${i + 1}/${total})`,
            progress: (i + p.progress) / total,
            imageIndex: i,
            total,
          });
        }
      });
      items.push({
        name: img.name,
        text: res.text,
        confidence: res.confidence,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown OCR error";
      items.push({ name: img.name, text: "", confidence: 0 });
      console.error(`OCR failed for ${img.name}:`, msg);
    }
  }

  if (onProgress) {
    onProgress({
      status: "Selesai",
      progress: 1,
      imageIndex: total,
      total,
    });
  }

  const text = items
    .filter((it) => it.text.length > 0)
    .map((it) => it.text)
    .join("\n\n");

  return { text, items };
}

/**
 * Heuristic: does the OCR'd text look like "Info Lengger" content?
 * Used to warn user if OCR output doesn't match expected format.
 */
export function looksLikeInfoLengger(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /info\s*lengger/.test(t) ||
    /\d+_[a-z]/.test(t) ||
    /romb/.test(t) ||
    /lengger\s*:/.test(t) ||
    /sinden\s*:/.test(t)
  );
}
