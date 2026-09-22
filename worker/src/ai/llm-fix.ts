/**
 * LLM typo fix via GLM-4.6-Flash (Z.ai / Zhipu AI).
 *
 * Library: openai (npm, v4+) — GLM API is OpenAI-compatible
 * Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
 * Model: glm-4.6-flash (always free, 128K context)
 *
 * Flow:
 *   1. Worker has VLM output (MD text)
 *   2. Send to GLM with LLM_FIX_SYSTEM_PROMPT
 *   3. GLM fixes obvious OCR typos
 *   4. Return cleaned MD
 *
 * Optional step — if GLM fails, bot uses raw VLM output (user edits manually).
 */
import OpenAI from "openai";
import type { Env, LlmResult } from "../types";
import { CONFIG } from "../config";
import { LLM_FIX_SYSTEM_PROMPT } from "./prompts";
import { withRetry, isRetryableError } from "../utils/retry";
import { logger } from "../utils/logger";

/**
 * Run GLM LLM typo fix on VLM output.
 *
 * @param env    Worker env (for GLM_API_KEY)
 * @param mdText VLM-extracted MD text
 * @returns LlmResult with fixed text (or original if LLM didn't change it)
 */
export async function runLlmFix(env: Env, mdText: string): Promise<LlmResult> {
  // Skip LLM if text is empty or very short
  if (!mdText || mdText.length < 10) {
    return { text: mdText, applied: false, model: CONFIG.GLM_MODEL };
  }

  const client = new OpenAI({
    apiKey: env.GLM_API_KEY,
    baseURL: CONFIG.GLM_BASE_URL,
  });

  logger.info(env, "llm-fix", `calling GLM ${CONFIG.GLM_MODEL}`, {
    inputLen: mdText.length,
  });

  try {
    const response = await withRetry(async () => {
      return await client.chat.completions.create({
        model: CONFIG.GLM_MODEL,
        messages: [
          { role: "system", content: LLM_FIX_SYSTEM_PROMPT },
          { role: "user", content: mdText },
        ],
        temperature: CONFIG.LLM_TEMPERATURE,
        max_tokens: CONFIG.LLM_MAX_TOKENS,
      });
    });

    const fixedText = response.choices[0]?.message?.content ?? mdText;
    const applied = fixedText !== mdText;

    logger.info(env, "llm-fix", "GLM fix success", {
      outputLen: fixedText.length,
      changed: applied,
    });

    return { text: fixedText, applied, model: CONFIG.GLM_MODEL };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(env, "llm-fix", `GLM fix failed (using raw VLM): ${msg}`, {
      retryable: isRetryableError(err),
    });
    // Non-fatal: return original text, let bot use raw VLM output
    return { text: mdText, applied: false, model: CONFIG.GLM_MODEL };
  }
}
