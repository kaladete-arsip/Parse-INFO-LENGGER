/**
 * Telegram helpers — send message, send document, reply.
 */

const API = "https://api.telegram.org";

export async function sendText(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  // Split if > 4096 chars
  const chunks = splitText(text, 4096);
  for (const chunk of chunks) {
    await fetch(`${API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
      }),
    });
  }
}

export async function sendDocument(
  botToken: string,
  chatId: string,
  content: string,
  filename: string
): Promise<void> {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", blob, filename);

  await fetch(`${API}/bot${botToken}/sendDocument`, {
    method: "POST",
    body: formData,
  });
}

export async function sendPhoto(
  botToken: string,
  chatId: string,
  imageBuffer: ArrayBuffer,
  caption: string
): Promise<void> {
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("photo", blob, "ig-post.jpg");
  formData.append("caption", caption);

  await fetch(`${API}/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: formData,
  });
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
