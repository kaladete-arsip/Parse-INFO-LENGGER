/**
 * Telegram report — send a short daily report to the user's Telegram chat.
 *
 * In dev (no TELEGRAM_BOT_TOKEN): just log + store in meta.json (web UI shows it).
 * In prod (with token + chat_id): real Telegram Bot API call.
 */

// `fetch` is a global in Bun and modern Node. No import needed.

interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

function readConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    chatId: process.env.TELEGRAM_CHAT_ID || undefined,
  };
}

export interface SendResult {
  sent: boolean;       // true if actually sent to Telegram
  delivered: boolean;  // true if no error (sent OR mocked OK)
  error?: string;
}

/**
 * Send (or mock) the daily report.
 *
 * Report format (per user request):
 *   "hari ini 22 september ada 6 lokasi"
 */
export async function sendTelegramReport(
  date: string,    // ISO YYYY-MM-DD
  locationCount: number,
  extraInfo?: string
): Promise<{ reportText: string; result: SendResult }> {
  const [yyyy, mm, dd] = date.split("-");
  const months = [
    "januari", "februari", "maret", "april", "mei", "juni",
    "juli", "agustus", "september", "oktober", "november", "desember",
  ];
  const monthName = months[parseInt(mm, 10) - 1] || " ?";
  const reportText = `hari ini ${parseInt(dd, 10)} ${monthName} ada ${locationCount} lokasi${extraInfo ? `\n${extraInfo}` : ""}`;

  const cfg = readConfig();
  if (!cfg.botToken || !cfg.chatId) {
    // Mock mode — log and return OK
    console.log(`[telegram] (mock) ${reportText.replace(/\n/g, " | ")}`);
    return {
      reportText,
      result: { sent: false, delivered: true },
    };
  }

  // Real Telegram Bot API call
  try {
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: reportText,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        reportText,
        result: { sent: false, delivered: false, error: `Telegram ${res.status}: ${text.slice(0, 200)}` },
      };
    }
    return {
      reportText,
      result: { sent: true, delivered: true },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      reportText,
      result: { sent: false, delivered: false, error: msg },
    };
  }
}
