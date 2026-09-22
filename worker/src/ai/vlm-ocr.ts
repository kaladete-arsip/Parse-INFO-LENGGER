/**
 * VLM OCR via Gemini 3 Flash (vision model).
 *
 * Library: @google/genai (v2.23.0+ — the unified SDK, replaces deprecated @google/generative-ai)
 * Model: gemini-3-flash (Sep 2026 — gemini-2.0-flash was shut down 2026-06-01)
 * Free tier: 1,500 requests/day, 10 RPM, 250K TPM — we use 1-5/day.
 *
 * Flow:
 *   1. Worker downloads photo from Telegram (fetch getFile + download)
 *   2. Base64 encode image (for Gemini inlineData)
 *   3. Call Gemini with VLM_SYSTEM_PROMPT
 *   4. Return extracted MD text
 */
import { GoogleGenAI } from "@google/genai";
import type { Env, VlmResult } from "../types";
import { CONFIG } from "../config";
import { VLM_SYSTEM_PROMPT } from "./prompts";
import { withRetry, isRetryableError } from "../utils/retry";
import { logger } from "../utils/logger";

/**
 * Run Gemini VLM OCR on a base64-encoded image.
 *
 * @param env           Worker env (for GEMINI_API_KEY)
 * @param imageBase64   Base64 string of the image (no data: prefix)
 * @param mimeType      e.g. "image/jpeg", "image/png"
 * @returns VlmResult with extracted text + estimated confidence
 */
export async function runVlmOcr(
  env: Env,
  imageBase64: string,
  mimeType: string
): Promise<VlmResult> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  logger.info(env, "vlm-ocr", `calling Gemini ${CONFIG.GEMINI_MODEL}`, {
    imageBytes: imageBase64.length,
    mimeType,
  });

  try {
    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: VLM_SYSTEM_PROMPT },
        ],
      });
    });

    const text = response.text ?? "";

    // Gemini doesn't return explicit confidence — estimate from output structure
    const looksValid =
      text.length > 50 &&
      (/info\s*lengger/i.test(text) || /\d+_[a-z]/i.test(text));
    const confidence = looksValid ? 90 : 50;

    logger.info(env, "vlm-ocr", "Gemini OCR success", {
      textLen: text.length,
      confidence,
    });

    return { text, confidence, model: CONFIG.GEMINI_MODEL };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(env, "vlm-ocr", `Gemini OCR failed: ${msg}`, {
      retryable: isRetryableError(err),
    });
    throw new Error(`Gemini VLM failed: ${msg}`);
  }
}
