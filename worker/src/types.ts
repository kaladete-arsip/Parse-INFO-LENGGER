/**
 * Shared types for Lengger Bot Worker.
 */

/** Cloudflare Worker environment bindings + secrets. */
export interface Env {
  // Secrets (set via `wrangler secret put`)
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  USER_CHAT_ID: string;
  GEMINI_API_KEY: string;
  GLM_API_KEY: string;
  // Future v1.2 (IG auto-scrape)
  IG_USERNAME?: string;
  IG_PASSWORD?: string;
  // Bindings (from wrangler.toml)
  BOT_KV: KVNamespace;
}

/** Result of a VLM OCR call. */
export interface VlmResult {
  text: string;
  confidence: number; // 0-100, estimated
  model: string;
}

/** Result of an LLM typo-fix call. */
export interface LlmResult {
  text: string;
  applied: boolean; // true if LLM actually modified the text
  model: string;
}

/** Result of the full OCR + fix pipeline. */
export interface PipelineResult {
  mdText: string;
  vlm: VlmResult;
  llm?: LlmResult;
  source: "manual" | "cron" | "link";
  timestamp: number;
}

/** Telegram update shape (simplified — only fields we use). */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
    photo?: Array<{ file_id: string; file_size?: number; width?: number; height?: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string };
    reply_to_message?: {
      message_id: number;
      photo?: Array<{ file_id: string }>;
      document?: { file_id: string; file_name?: string };
    };
  };
}

/** Quota tracking entry (stored in KV). */
export interface QuotaEntry {
  gemini: number;
  glm: number;
  telegram: number;
  date: string; // YYYY-MM-DD
}

/** Last run log (stored in KV). */
export interface LastRun {
  status: "success" | "failure";
  detail: string;
  timestamp: number; // epoch ms
}

/** Telegram getFile API response (simplified). */
export interface TelegramGetFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path: string; // e.g. "photos/file_1.jpg"
  };
}
