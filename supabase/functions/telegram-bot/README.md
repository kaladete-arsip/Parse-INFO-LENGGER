# Telegram Bot — Supabase Edge Function

Bot Telegram untuk otomatis download IG post + VLM OCR.

## Setup

### 1. Prerequisites

- Supabase project (free, https://supabase.com)
- Telegram bot token (dari @BotFather)
- Gemini API key (https://aistudio.google.com/apikey)
- (Optional) OpenRouter API key (fallback, https://openrouter.ai)

### 2. Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 3. Link project

```bash
cd Parse-INFO-LENGGER
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Deploy function

```bash
supabase functions deploy telegram-bot
```

### 5. Set secrets

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=1234567890:AAHxxx
supabase secrets set GEMINI_API_KEY=AIzaSyxxx
supabase secrets set USER_CHAT_ID=123456789
# Optional fallback:
supabase secrets set OPENROUTER_API_KEY=sk-or-xxx
```

### 6. Set Telegram webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot"
```

Verify:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 7. Test

Kirim ke bot di Telegram:
```
/help          — show commands
/status        — bot health
https://www.instagram.com/p/DdlDfVvxg4E/  — download + OCR + reply .md
```

## Workflow

```
User kirim IG URL ke Telegram
  ↓
Bot fetch IG post page (no login needed)
  ↓
Bot extract full res image URL (1080px, no crop)
  ↓
Bot download image
  ↓
Bot send to Gemini 3 Flash VLM → text
  ↓
Bot reply Telegram:
  • Preview text (first 500 chars)
  • .md file attachment
  • Original photo (for reference)
```

## Files

```
supabase/functions/telegram-bot/
├── index.ts       # Main entry: Deno.serve() + webhook handler
├── ig.ts          # IG post fetcher + full res URL extractor
├── ocr.ts         # Gemini VLM + OpenRouter fallback
└── telegram.ts    # Send message + document + photo
```

## Architecture

- **Platform**: Supabase Edge Functions (Deno runtime)
- **No login**: IG post page accessible without login
- **Full res**: Extract scontent URL without c216 crop (1080px)
- **VLM**: Gemini 3 Flash (free 1500/day) + OpenRouter fallback
- **Parser**: Not included yet — user uploads .md to web UI for Excel conversion

## Next steps

- [ ] Add parser to bot (auto-parse → Excel + clean.md)
- [ ] Save to Supabase DB (status=draft)
- [ ] IG login (dummy account) for full cron automation (15:00 WIB)
- [ ] Scheduled function for cron auto-download
