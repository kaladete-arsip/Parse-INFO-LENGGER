"use client";

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { parseMd, type RowData } from "@/lib/budaya/md-parser";

interface ParsedPreview {
  filename: string;
  tanggalList: string[];
  rows: RowData[];
  warnings: string[];
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDownloadingSource, setIsDownloadingSource] = useState(false);

  const onDownloadSource = useCallback(async () => {
    // If GitHub repo is configured, link directly to repo zip (works in static export)
    const githubRepo = process.env.NEXT_PUBLIC_GITHUB_REPO;
    if (githubRepo) {
      const url = `https://github.com/${githubRepo}/archive/refs/heads/main.zip`;
      window.open(url, "_blank");
      toast({
        title: "Mengarahkan ke GitHub",
        description: `Download zip dari ${url}`,
      });
      return;
    }
    // Otherwise, use /api/source (dev/standalone Next.js mode only — won't work in static export)
    setIsDownloadingSource(true);
    try {
      const res = await fetch("/api/source");
      if (!res.ok) {
        toast({
          title: "Download source gagal",
          description: `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lengger-ledger-converter.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Source code terunduh",
        description: "lengger-ledger-converter.zip — versi terbaru dari server.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Download source gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsDownloadingSource(false);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".csv")) {
      toast({
        title: "Format tidak didukung",
        description: "File harus berekstensi .md atau .csv",
        variant: "destructive",
      });
      return;
    }
    const raw = await file.text();
    // Auto-detect input format (FB scraping / CSV scraping / plain MD)
    const { normalizeInput } = await import("@/lib/budaya/normalize-input");
    const { mdText, format } = normalizeInput(raw, file.name);
    setFileName(file.name);
    setFileContent(mdText);
    const result = parseMd(mdText, file.name);
    setPreview(result);
    if (format === "fb") {
      toast({
        title: "Format FB scraping terdeteksi",
        description: `${result.rows.length} entri diparsing dari post FB.`,
      });
    } else if (format === "csv") {
      toast({
        title: "Format CSV scraping terdeteksi",
        description: `${result.rows.length} entri diparsing dari CSV.`,
      });
    }
  }, []);

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) await handleFile(f);
    },
    [handleFile]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) await handleFile(f);
    },
    [handleFile]
  );

  const onConvert = useCallback(async () => {
    if (!fileContent || !fileName) return;
    setIsConverting(true);
    try {
      // Client-side conversion: call parser + xlsx-generator directly in the browser.
      // No server needed — works in static export (GitHub Pages).
      const { generateXlsx } = await import("@/lib/budaya/xlsx-generator");
      const { parseMd } = await import("@/lib/budaya/md-parser");
      const { normalizeInput } = await import("@/lib/budaya/normalize-input");

      const { mdText } = normalizeInput(fileContent, fileName);
      const { rows, warnings } = parseMd(mdText, fileName);

      if (rows.length === 0) {
        toast({
          title: "Konversi gagal",
          description: "Tidak ada entri terdeteksi.",
          variant: "destructive",
        });
        return;
      }

      const arrayBuffer = await generateXlsx(rows);
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const baseName = fileName.replace(/\.(md|csv)$/i, "");
      const outName = `${baseName}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const warnCount = warnings.length;
      toast({
        title: "Konversi berhasil",
        description: `${rows.length} baris diproses${warnCount > 0 ? ` · ${warnCount} catatan` : ""}. File ${outName} diunduh.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Konversi gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  }, [fileContent, fileName]);

  const onReset = useCallback(() => {
    setFileName(null);
    setFileContent(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100">
              <FileSpreadsheet className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Lengger Ledger Converter</h1>
              <p className="text-xs text-muted-foreground">
                Info Lengger .md/.csv &rarr; Excel template (.xlsx)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              v1 · auto-parse
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onDownloadSource}
              disabled={isDownloadingSource}
              title="Download source code terbaru (.zip) langsung dari server"
            >
              {isDownloadingSource ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Code2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Source</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Upload file .md atau .csv</CardTitle>
            <CardDescription>
              Drag &amp; drop atau klik untuk memilih. Auto-detect 3 format:
              <strong> plain MD</strong> (Info Lengger), <strong>CSV scraping</strong> (RAW IG),
              <strong> FB scraping</strong> (file dengan <code>POST #N</code> + <code>--- RAW POST ---</code>).
              Parser otomatis mengisi: tanggal (multi-day), Jam (15:30 / 19:30 jika &quot;MBENGI TOK&quot;),
              rombongan (di-normalisasi <code>&amp;</code> → <code>;</code>), lokasi, nama individu &amp; peran
              (placeholder <code>...?</code> di-drop), aktivitas_budaya, Gagrak (Sindenan/Bedhenan).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? "border-amber-500 bg-amber-50"
                  : "border-muted-foreground/25 hover:border-amber-400 hover:bg-amber-50/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.csv,text/markdown,text/csv"
                className="hidden"
                onChange={onInputChange}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                  <Upload className="h-5 w-5 text-amber-700" />
                </div>
                {fileName ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      {fileName}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Klik untuk ganti file
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Drag &amp; drop file .md atau .csv di sini
                    </p>
                    <p className="text-xs text-muted-foreground">
                      atau klik untuk memilih
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Preview hasil parsing</CardTitle>
              <CardDescription>
                {preview.rows.length} baris terdeteksi
                {preview.tanggalList.length > 0 ? ` · tanggal: ${preview.tanggalList.join(", ")}` : ""}
                . Periksa sebelum export, lalu klik tombol di bawah.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {preview.warnings.length > 0 && (
                <Alert variant="default" className="border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <AlertTitle className="text-amber-900">
                    {preview.warnings.length} catatan parsing
                  </AlertTitle>
                  <AlertDescription className="text-amber-900">
                    <ul className="list-disc pl-5 mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                      {preview.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-h-[32rem] overflow-auto rounded-md border">
                <table className="min-w-full text-[11px] whitespace-nowrap">
                  <thead className="bg-muted/40 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium border-b sticky left-0 bg-muted/60 z-20">#</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Tanggal</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">TanggalSelesai</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Jam</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">peristiwa</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Kategori</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">aktivitas_budaya</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Gagrak</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_rombongan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Peran_Rombongan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_individu</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">peran_individu</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">sumber</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">bukti</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Lokasi</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_dusun/kampung</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_desa/Kelurahan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Nama_Kecamatan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_kabupaten</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_provinsi</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => {
                      const empty = (v?: string | null) =>
                        v ? (
                          v
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        );
                      return (
                        <tr key={i} className="hover:bg-muted/30 even:bg-muted/10">
                          <td className="px-2 py-1.5 border-b align-top sticky left-0 bg-background z-10">{i + 1}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Tanggal)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.TanggalSelesai)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Jam)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.peristiwa)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Kategori)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.aktivitas_budaya)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Gagrak)}</td>
                          <td className="px-2 py-1.5 border-b align-top max-w-[20rem] overflow-hidden text-ellipsis">{empty(r.nama_rombongan)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Peran_Rombongan)}</td>
                          <td className="px-2 py-1.5 border-b align-top max-w-[20rem] overflow-hidden text-ellipsis">{empty(r.nama_individu)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.peran_individu)}</td>
                          <td className="px-2 py-1.5 border-b align-top max-w-[18rem] overflow-hidden text-ellipsis" title={r.sumber ?? ""}>
                            {r.sumber ? (
                              <span className="text-muted-foreground">{r.sumber.slice(0, 50)}{r.sumber.length > 50 ? "…" : ""}</span>
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.bukti)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Lokasi)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r["nama_dusun/kampung"])}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r["nama_desa/Kelurahan"])}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Nama_Kecamatan)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.nama_kabupaten)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.nama_provinsi)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.catatan)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <Button onClick={onConvert} disabled={isConverting} className="gap-2">
                  {isConverting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isConverting ? "Mengonversi..." : "Convert & download .xlsx"}
                </Button>
                <Button variant="outline" onClick={onReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <span className="text-xs text-muted-foreground ml-auto inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Kolom <code>TanggalSelesai</code>, <code>peristiwa</code>,{" "}
                  <code>Kategori</code>, <code>bukti</code>, <code>catatan</code> dikosongkan
                  untuk diisi manual.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!preview && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">Format input yang didukung:</p>

              <div className="space-y-2">
                <p><strong>1. Plain MD</strong> — Info Lengger .md (single atau multi-day):</p>
                <pre className="bg-muted/40 p-3 rounded-md text-[11px] overflow-x-auto leading-relaxed">{`Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della

Info Lengger Minggu, 21 Juni 2026
1_Kasemen, Tlogomulyo Kec: Kertek Kab: Wonosobo
(Romb Agung Budoyo)
Lengger: Bu Dian, Gisha, Sani & Ayuk (Temanggung)`}</pre>
              </div>

              <div className="space-y-2">
                <p><strong>2. CSV scraping</strong> — RAW IG, tiap row = 1 post (boleh multi-line, di-quote):</p>
                <pre className="bg-muted/40 p-3 rounded-md text-[11px] overflow-x-auto leading-relaxed">{`post
"Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della"`}</pre>
              </div>

              <div className="space-y-2">
                <p><strong>3. FB scraping</strong> — file dengan <code>POST #N</code> + <code>--- RAW POST ---</code> blocks:</p>
                <pre className="bg-muted/40 p-3 rounded-md text-[11px] overflow-x-auto leading-relaxed">{`============================================================
POST #1
Author: ...
Post Date: 2026-06-14
============================================================
--- RAW POST ---
Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della`}</pre>
                <p className="text-xs">FB format auto-detected dari konten. Post tanpa <code>Info Lengger</code> header di-skip otomatis.</p>
              </div>

              <div className="space-y-2">
                <p><strong>Aturan khusus:</strong></p>
                <ul className="list-disc pl-5 text-xs space-y-1">
                  <li><code>MBENGI TOK</code> / <code>MBENGI THOK</code> → Jam = <code>19:30</code> (sesi malam saja). Default tanpa marker = <code>15:30</code> (pasca Asar).</li>
                  <li>Rombongan dengan <code>&amp;</code> (multiple groups) → di-normalisasi jadi <code>;</code>. Mis. <code>Sri Muda Rahayu &amp; Wahyu Margi Utomo</code> → <code>Sri Muda Rahayu; Wahyu Margi Utomo</code>.</li>
                  <li>Individu placeholder <code>...?</code> / <code>Bu ...?</code> / <code>...</code> → di-drop (kosong).</li>
                  <li>Gagrak: Pentas Lengger + Sinden → <code>Sindenan</code>. Pentas Lengger tanpa Sinden → <code>Bedhenan</code>. Non-Lengger (Tayub/Warok/Jaranan/Topeng Ireng) → kosong.</li>
                  <li>Baris <code>Sumber : ...</code> di mana saja di MD → mengisi kolom <code>sumber</code> untuk semua baris.</li>
                  <li>Multi-day: tiap header <code>Info Lengger &lt;date&gt;</code> men-set tanggal untuk entri di bawahnya sampai header berikutnya.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <span>Lengger Ledger Converter · auto-parse md/csv/fb → xlsx</span>
          <span>Built with Next.js · ExcelJS</span>
        </div>
      </footer>
    </div>
  );
}
