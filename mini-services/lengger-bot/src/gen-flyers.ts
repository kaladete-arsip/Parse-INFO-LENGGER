/**
 * Sample flyer generator — produces 5 days of "Info Lengger" announcement
 * flyers as HTML, then renders each to PNG via agent-browser.
 *
 * Output: sample-flyers/YYYY-MM-DD.png (one per date, 1080×1350 landscape-ish)
 *
 * These PNGs simulate "today's TikTok post" so the bot has real images to OCR
 * during daily cron runs. In production, the bot would download photos from
 * TikTok / IG instead.
 *
 * Run: `bun run gen-flyers` (from mini-services/lengger-bot/)
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEMPLATES_DIR = join(ROOT, "flyer-templates");
const OUTPUT_DIR = join(ROOT, "sample-flyers");

// ─────────────────────────────────────────────────────────────
// Sample flyer data — 5 days, 6 locations each
// All places are real villages/kecamatan/kabupaten in Wonosobo + surroundings
// (sourced from src/lib/data/wilayah/)
// ─────────────────────────────────────────────────────────────

interface FlyerEntry {
  dusun: string;
  desa: string;
  kecamatan: string;
  kabupaten: string;
  rombongan: string;
  sinden: string;
  lengger: string;
  aktivitas: string;
  jam: "15:30" | "19:30";
  mbenyiTtok?: boolean;
}

interface FlyerDay {
  date: string; // ISO YYYY-MM-DD
  dayName: string; // "Senin"
  entries: FlyerEntry[];
}

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function indonesianDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  // Use UTC getters since we constructed with Z; offset to WIB not needed for day name
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const FLYER_DATA: FlyerDay[] = [
  {
    date: "2026-09-22",
    dayName: "Senin",
    entries: [
      {
        dusun: "Krajan", desa: "Lengkong", kecamatan: "Mojoendung", kabupaten: "Kendal",
        rombongan: "GAGRAK SENI MOJO", sinden: "Bu Yati", lengger: "Antok; Bagong",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Kebon", desa: "Mangunsari", kecamatan: "Candisari", kabupaten: "Semarang",
        rombongan: "TURONGGO LARAS", sinden: "Bu Sumiyati", lengger: "Dani; Bayu",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Ngipik", desa: "Sumberrejo", kecamatan: "Bandungan", kabupaten: "Semarang",
        rombongan: "PUTRA MANDALA", sinden: "Bu Wiji", lengger: "Eko; Rizal",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Tegalsari", desa: "Tegalsari", kecamatan: "Wonosobo", kabupaten: "Wonosobo",
        rombongan: "BUDI LESTARI", sinden: "Bu Endang", lengger: "Faisal; Imam",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Karangsari", desa: "Lampersari", kecamatan: "Selomerto", kabupaten: "Wonosobo",
        rombongan: "GANDRUNG MANIS", sinden: "Bu Rasmini", lengger: "Hadi; Yoga",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Sidorejo", desa: "Sidorejo", kecamatan: "Kertek", kabupaten: "Wonosobo",
        rombongan: "RINJANI MUDA", sinden: "Bu Ningsih", lengger: "Putra; Bagus",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
    ],
  },
  {
    date: "2026-09-23",
    dayName: "Selasa",
    entries: [
      {
        dusun: "Gondang", desa: "Gondang", kecamatan: "Kajoran", kabupaten: "Magelang",
        rombongan: "WAHANA SUNDA", sinden: "Bu Lasmi", lengger: "Tarno; Wawan",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Kauman", desa: "Kalikabong", kecamatan: "Baturraden", kabupaten: "Banyumas",
        rombongan: "GAYAH SARI", sinden: "Bu Murti", lengger: "Asep; Dedi",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Banaran", desa: "Banaran", kecamatan: "Semarang Barat", kabupaten: "Semarang",
        rombongan: "KARYA MUDI", sinden: "Bu Sri", lengger: "Joko; Reza",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Poncokusumo", desa: "Poncokusumo", kecamatan: "Poncokusumo", kabupaten: "Malang",
        rombongan: "MAJAPAHIT", sinden: "Bu Darmi", lengger: "Galih; Indra",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Jatisari", desa: "Jatisari", kecamatan: "Kebumen", kabupaten: "Kebumen",
        rombongan: "WAHYU LARAS", sinden: "Bu Tuti", lengger: "Mulyono; Andik",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Pekalongan", desa: "Pekalongan", kecamatan: "Wonopringgo", kabupaten: "Pekalongan",
        rombongan: "BATIK SENI", sinden: "Bu Rina", lengger: "Surya; Bayu",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
    ],
  },
  {
    date: "2026-09-24",
    dayName: "Rabu",
    entries: [
      {
        dusun: "Sumberadi", desa: "Sumberadi", kecamatan: "Sleman", kabupaten: "Sleman",
        rombongan: "GAMBYOL MUDA", sinden: "Bu Wahyu", lengger: "Danis; Fajar",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Caturtulis", desa: "Caturtulis", kecamatan: "Kota Semarang", kabupaten: "Semarang",
        rombongan: "RINJANI SAKTI", sinden: "Bu Rina", lengger: "Andi; Budi",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Tlogo", desa: "Tlogo", kecamatan: "Tembalang", kabupaten: "Semarang",
        rombongan: "WAHYU SARI", sinden: "Bu Lasminah", lengger: "Yudi; Hadi",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Wonosari", desa: "Wonosari", kecamatan: "Galur", kabupaten: "Kulon Progo",
        rombongan: "WANITABAYU", sinden: "Bu Yayuk", lengger: "Wahyu; Adi",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Krapyak", desa: "Krapyak", kecamatan: "Kota Semarang", kabupaten: "Semarang",
        rombongan: "SARI WAHYU", sinden: "Bu Siti", lengger: "Eko; Surya",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Ceporan", desa: "Ceporan", kecamatan: "Godean", kabupaten: "Sleman",
        rombongan: "TURONGGO ASRI", sinden: "Bu Marfuah", lengger: "Andik; Catur",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
    ],
  },
  {
    date: "2026-09-25",
    dayName: "Kamis",
    entries: [
      {
        dusun: "Kembaran", desa: "Kembaran", kecamatan: "Baturraden", kabupaten: "Banyumas",
        rombongan: "KARYA BUDAYA", sinden: "Bu Endang", lengger: "Teguh; Yusuf",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Sawitan", desa: "Sawitan", kecamatan: "Kedu", kabupaten: "Magelang",
        rombongan: "PERSADA MUDA", sinden: "Bu Rusmi", lengger: "Bowo; Aris",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Bener", desa: "Bener", kecamatan: "Kajoran", kabupaten: "Magelang",
        rombongan: "WAHYU LESTARI", sinden: "Bu Yanti", lengger: "Guntur; Dimas",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Larangan", desa: "Larangan", kecamatan: "Kota Semarang", kabupaten: "Semarang",
        rombongan: "SENJA INDAH", sinden: "Bu Wulan", lengger: "Agus; Heru",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Balerejo", desa: "Balerejo", kecamatan: "Bandungan", kabupaten: "Semarang",
        rombongan: "GAGRUK MUDA", sinden: "Bu Ningsih", lengger: "Fahmi; Rizal",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
      {
        dusun: "Bugel", desa: "Bugel", kecamatan: "Wonosobo", kabupaten: "Wonosobo",
        rombongan: "PUTRI SIDIK", sinden: "Bu Mamiek", lengger: "Dedi; Tio",
        aktivitas: "Pentas Lengger", jam: "15:30",
      },
    ],
  },
  {
    date: "2026-09-26",
    dayName: "Jumat",
    entries: [
      {
        dusun: "Krajan", desa: "Mangunsari", kecamatan: "Candisari", kabupaten: "Semarang",
        rombongan: "GAGRUK SENI", sinden: "Bu Wiji", lengger: "Bagong; Cemplon",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Kepar", desa: "Kepar", kecamatan: "Wonosobo", kabupaten: "Wonosobo",
        rombongan: "SENENG LARAS", sinden: "Bu Yati", lengger: "Cahyo; Andre",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Tlogo", desa: "Tlogo", kecamatan: "Tembalang", kabupaten: "Semarang",
        rombongan: "WAHYU INDAH", sinden: "Bu Siti", lengger: "Aji; Bagas",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Sidomulyo", desa: "Sidomulyo", kecamatan: "Sumberrejo", kabupaten: "Semarang",
        rombongan: "ASIH WAHYU", sinden: "Bu Tuti", lengger: "Yoga; Aldi",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Pakinten", desa: "Pakinten", kecamatan: "Wonosobo", kabupaten: "Wonosobo",
        rombongan: "GANDRUNG ASRI", sinden: "Bu Sumi", lengger: "Imam; Rio",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
      {
        dusun: "Kedu", desa: "Kedu", kecamatan: "Kedu", kabupaten: "Magelang",
        rombongan: "MAJA KARTIKA", sinden: "Bu Darmi", lengger: "Bowo; Bayu",
        aktivitas: "Pentas Lengger", jam: "19:30", mbenyiTtok: true,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// HTML template — looks like a real Info Lengger flyer
// ─────────────────────────────────────────────────────────────

function buildFlyerHtml(day: FlyerDay): string {
  const dateDisplay = indonesianDate(day.date);
  const entriesHtml = day.entries.map((e, i) => {
    const num = i + 1;
    const jamLine = e.mbenyiTtok
      ? `MBENGI TOK — Jam: ${e.jam}`
      : `Jam: ${e.jam}`;
    return `
    <div class="entry">
      <div class="entry-num">${num}_</div>
      <div class="entry-body">
        <div class="loc">${e.dusun}, ${e.desa} Kec: ${e.kecamatan} Kab: ${e.kabupaten}</div>
        <div class="row"><span class="lbl">Rombongan:</span> ${e.rombongan}</div>
        <div class="row"><span class="lbl">Sinden:</span> ${e.sinden}</div>
        <div class="row"><span class="lbl">Lengger:</span> ${e.lengger}</div>
        <div class="row"><span class="lbl">Aktivitas:</span> ${e.aktivitas}</div>
        <div class="row jam">${jamLine}</div>
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1080, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    font-family: 'Trebuchet MS', 'Verdana', sans-serif;
    background: #fff8e7;
    padding: 32px 28px;
    color: #1a1a1a;
  }
  .header {
    background: #b91c1c;
    color: #fef3c7;
    padding: 20px 28px;
    text-align: center;
    border: 4px solid #7f1d1d;
    border-radius: 8px;
    margin-bottom: 24px;
  }
  .header h1 {
    font-size: 42px;
    font-weight: 900;
    letter-spacing: 2px;
  }
  .header .date {
    font-size: 26px;
    font-weight: 700;
    margin-top: 8px;
  }
  .header .account {
    font-size: 14px;
    margin-top: 8px;
    opacity: 0.85;
  }
  .entry {
    display: flex;
    gap: 14px;
    margin-bottom: 18px;
    background: #fff;
    border: 2px solid #92400e;
    border-radius: 6px;
    padding: 14px 16px;
  }
  .entry-num {
    font-size: 22px;
    font-weight: 900;
    color: #b91c1c;
    min-width: 40px;
    padding-top: 4px;
  }
  .entry-body { flex: 1; }
  .loc {
    font-size: 19px;
    font-weight: 700;
    color: #1e3a8a;
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .row {
    font-size: 16px;
    line-height: 1.45;
    color: #1a1a1a;
  }
  .row .lbl {
    display: inline-block;
    min-width: 110px;
    font-weight: 700;
    color: #374151;
  }
  .row.jam {
    font-weight: 700;
    color: #b91c1c;
    margin-top: 4px;
  }
  .footer {
    margin-top: 16px;
    text-align: center;
    font-size: 13px;
    color: #6b7280;
    border-top: 1px dashed #92400e;
    padding-top: 10px;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>INFO LENGGER</h1>
    <div class="date">${dateDisplay}</div>
    <div class="account">@wonosobonyawijiingseni · Komunitas Nyawiji Ing Seni</div>
  </div>
  ${entriesHtml}
  <div class="footer">
    Sumber: INFO LENGGER Nyawiji Ing Seni (@wonosobonyawijiingseni)
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Main — write HTML files, then screenshot each to PNG via agent-browser
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("[gen-flyers] Starting flyer generation");
  await mkdir(TEMPLATES_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const day of FLYER_DATA) {
    const htmlPath = join(TEMPLATES_DIR, `${day.date}.html`);
    const pngPath = join(OUTPUT_DIR, `${day.date}.png`);
    const html = buildFlyerHtml(day);

    await writeFile(htmlPath, html, "utf-8");
    console.log(`[gen-flyers] Wrote ${htmlPath}`);

    // Render to PNG via agent-browser: open page → wait for render → screenshot
    const fileUrl = `file://${htmlPath}`;
    try {
      console.log(`[gen-flyers] Screenshotting ${day.date} → ${pngPath}`);
      // Open the HTML file in headless Chrome, then take a full-page screenshot.
      // Wait 2500ms for fonts/layout to settle (500ms was too short — some PNGs came out blank).
      execSync(
        `agent-browser open "${fileUrl}" --viewport 1080x1500 && agent-browser wait 2500 && agent-browser screenshot "${pngPath}" --full`,
        { stdio: "inherit", timeout: 90000 }
      );
      if (existsSync(pngPath)) {
        const s = await stat(pngPath);
        if (s.size < 10000) {
          console.warn(`[gen-flyers] ⚠ ${pngPath} only ${s.size}B — likely blank; retrying with longer wait`);
          execSync(
            `agent-browser open "${fileUrl}" --viewport 1080x1500 && agent-browser wait 4000 && agent-browser screenshot "${pngPath}" --full`,
            { stdio: "inherit", timeout: 90000 }
          );
        }
        const finalSize = (await stat(pngPath)).size;
        console.log(`[gen-flyers] ✓ ${pngPath} (${finalSize}B)`);
      } else {
        console.warn(`[gen-flyers] ✗ PNG not created at ${pngPath}`);
      }
    } catch (err) {
      console.warn(`[gen-flyers] Screenshot failed for ${day.date}:`, err);
    }
  }

  console.log(`[gen-flyers] Done. ${FLYER_DATA.length} flyers generated in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("[gen-flyers] FATAL:", err);
  process.exit(1);
});
