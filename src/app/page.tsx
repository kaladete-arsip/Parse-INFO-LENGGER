"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Image as ImageIcon,
  ScanText,
  X,
  Sparkles,
  Bot,
  Play,
  Save,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { parseMd, type RowData } from "@/lib/budaya/md-parser";
import { runOcrBatch, looksLikeInfoLengger, type OcrProgress } from "@/lib/budaya/ocr";

interface ParsedPreview {
  filename: string;
  tanggalList: string[];
  rows: RowData[];
  warnings: string[];
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Shared state — fed by either "File" tab or "OCR" tab
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [activeTab, setActiveTab] = useState<"file" | "ocr" | "excel" | "bot">("file");

  // File-upload tab state
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isGeneratingMd, setIsGeneratingMd] = useState(false);
  const [isDownloadingSource, setIsDownloadingSource] = useState(false);
  const [isExcelParsing, setIsExcelParsing] = useState(false);
  const [isGeneratingExcelMd, setIsGeneratingExcelMd] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  // OCR tab state
  const [ocrImages, setOcrImages] = useState<File[]>([]);
  const [ocrPreviews, setOcrPreviews] = useState<string[]>([]);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrText, setOcrText] = useState<string>("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);

  // Bot Daily tab state
  interface BotDayMeta {
    date: string;
    runAt: string;
    photoCount: number;
    locationCount: number;
    telegramReport: string;
    hasFinal: boolean;
    finalSavedAt?: string;
    source: string;
  }
  interface BotDayDetail {
    ok: boolean;
    meta: BotDayMeta;
    rawMd: string | null;
    finalMd: string | null;
    photos: string[];
  }
  const [botDays, setBotDays] = useState<BotDayMeta[]>([]);
  const [botSelectedDate, setBotSelectedDate] = useState<string | null>(null);
  const [botDayDetail, setBotDayDetail] = useState<BotDayDetail | null>(null);
  const [botFinalText, setBotFinalText] = useState<string>("");
  const [botIsTriggering, setBotIsTriggering] = useState(false);
  const [botIsLoadingDays, setBotIsLoadingDays] = useState(false);
  const [botIsLoadingDetail, setBotIsLoadingDetail] = useState(false);
  const [botIsSavingFinal, setBotIsSavingFinal] = useState(false);
  const [botIsConvertingXlsx, setBotIsConvertingXlsx] = useState(false);

  // Revoke object URLs on unmount / when replaced
  useEffect(() => {
    return () => {
      ocrPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [ocrPreviews]);

  const onDownloadSource = useCallback(async () => {
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
    setIsDownloadingSource(true);
    try {
      const res = await fetch("/source.zip");
      if (!res.ok) {
        toast({
          title: "Source zip belum tersedia",
          description:
            "Jalankan `bun run build:source` untuk generate /public/source.zip, atau set NEXT_PUBLIC_GITHUB_REPO.",
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
        description: "lengger-ledger-converter.zip — versi terbaru.",
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

  // ---------- File upload handler (existing flow) ----------
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
    const { normalizeInput } = await import("@/lib/budaya/normalize-input");
    const { mdText, format } = normalizeInput(raw, file.name);
    setFileName(file.name);
    setFileContent(mdText);
    const result = parseMd(mdText, file.name);
    setPreview({
      filename: file.name,
      tanggalList: result.tanggalList,
      rows: result.rows,
      warnings: result.warnings,
    });
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

  // ---------- OCR tab handlers ----------
  const addImages = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => {
        const t = f.type.toLowerCase();
        return (
          t.startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)
        );
      });
      if (arr.length === 0) {
        toast({
          title: "Tidak ada gambar valid",
          description: "Format didukung: PNG, JPEG, GIF, WebP, BMP.",
          variant: "destructive",
        });
        return;
      }
      // Revoke old previews
      ocrPreviews.forEach((url) => URL.revokeObjectURL(url));
      const newPreviews = arr.map((f) => URL.createObjectURL(f));
      setOcrImages((prev) => [...prev, ...arr]);
      setOcrPreviews((prev) => [...prev, ...newPreviews]);
      // Reset previous OCR result when adding new images
      setOcrText("");
      setOcrConfidence(null);
    },
    [ocrPreviews]
  );

  const onImageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addImages(e.target.files);
      }
      // reset so selecting the same file again still triggers change
      if (imageInputRef.current) imageInputRef.current.value = "";
    },
    [addImages]
  );

  const onImageDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingImage(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addImages(e.dataTransfer.files);
      }
    },
    [addImages]
  );

  const removeImage = useCallback(
    (index: number) => {
      setOcrImages((prev) => prev.filter((_, i) => i !== index));
      setOcrPreviews((prev) => {
        const url = prev[index];
        if (url) URL.revokeObjectURL(url);
        return prev.filter((_, i) => i !== index);
      });
    },
    []
  );

  const clearImages = useCallback(() => {
    ocrPreviews.forEach((url) => URL.revokeObjectURL(url));
    setOcrImages([]);
    setOcrPreviews([]);
    setOcrText("");
    setOcrConfidence(null);
    setOcrProgress(null);
  }, [ocrPreviews]);

  const runOcrOnImages = useCallback(async () => {
    if (ocrImages.length === 0) {
      toast({
        title: "Belum ada gambar",
        description: "Tambahkan minimal 1 gambar untuk OCR.",
        variant: "destructive",
      });
      return;
    }
    setIsOcrRunning(true);
    setOcrProgress({ status: "Memulai...", progress: 0 });
    setOcrText("");
    setOcrConfidence(null);

    try {
      const result = await runOcrBatch(ocrImages, "ind+eng", (p) => {
        setOcrProgress(p);
      });
      setOcrText(result.text);
      const avgConf =
        result.items.length > 0
          ? result.items.reduce((sum, it) => sum + it.confidence, 0) /
            result.items.length
          : 0;
      setOcrConfidence(avgConf);

      const looksValid = looksLikeInfoLengger(result.text);
      toast({
        title: result.text.length > 0 ? "OCR selesai" : "OCR hasil kosong",
        description: `${result.items.length} gambar diproses · confidence ${avgConf.toFixed(
          1
        )}%${
          !looksValid && result.text.length > 0
            ? " · ⚠ teks tidak terdeteksi sebagai Info Lengger"
            : ""
        }`,
        variant: result.text.length > 0 ? "default" : "destructive",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown OCR error";
      toast({
        title: "OCR gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  }, [ocrImages]);

  // Feed OCR text into the existing parser pipeline
  const useOcrAsMd = useCallback(() => {
    if (!ocrText.trim()) {
      toast({
        title: "Teks OCR kosong",
        description: "Jalankan OCR dulu atau ketik manual.",
        variant: "destructive",
      });
      return;
    }
    // Build a sensible filename from the first image name
    const baseName =
      ocrImages.length > 0
        ? ocrImages[0].name.replace(/\.[^.]+$/, "")
        : "ocr-result";
    const derivedName = `${baseName}.md`;
    setFileName(derivedName);
    setFileContent(ocrText);
    const result = parseMd(ocrText, derivedName);
    setPreview({
      filename: derivedName,
      tanggalList: result.tanggalList,
      rows: result.rows,
      warnings: result.warnings,
    });
    toast({
      title: "Teks OCR dipakai sebagai input",
      description: `${result.rows.length} entri terdeteksi. Scroll ke bawah untuk preview.`,
    });
  }, [ocrText, ocrImages]);

  // Download OCR text as .md file — user can edit offline, then re-upload
  // via the "File .md / .csv" tab and convert to .xlsx using the existing pipeline.
  const downloadOcrAsMd = useCallback(() => {
    if (!ocrText.trim()) {
      toast({
        title: "Teks OCR kosong",
        description: "Jalankan OCR dulu atau ketik manual sebelum download.",
        variant: "destructive",
      });
      return;
    }
    // Build a sensible filename from the first image name (or fallback to "ocr-result")
    const baseName =
      ocrImages.length > 0
        ? ocrImages[0].name.replace(/\.[^.]+$/, "")
        : "ocr-result";
    const outName = `${baseName}.md`;
    const blob = new Blob([ocrText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "File .md terunduh",
      description: `${outName} (${ocrText.length.toLocaleString()} karakter). Edit di editor favoritmu, lalu upload via tab "File .md / .csv" untuk convert ke .xlsx.`,
    });
  }, [ocrText, ocrImages]);

  // ---------- Convert & reset handlers ----------
  const onConvert = useCallback(async () => {
    if (!preview || !fileName) return;
    setIsConverting(true);
    try {
      const { generateXlsx } = await import("@/lib/budaya/xlsx-generator");

      // If fileContent exists (from RAW): re-parse for fresh xlsx
      // If null (from Excel): use preview.rows directly (already parsed from Excel)
      let rows = preview.rows;
      let warnings: string[] = [];
      if (fileContent) {
        const { normalizeInput } = await import("@/lib/budaya/normalize-input");
        const { mdText } = normalizeInput(fileContent, fileName);
        const parsed = parseMd(mdText, fileName);
        rows = parsed.rows;
        warnings = parsed.warnings;
      }

      if (rows.length === 0) {
        toast({
          title: "Konversi gagal",
          description: "Tidak ada entri terdeteksi. Cek format input (mis. harus ada header 'Info Lengger' atau '<n>_<lokasi>').",
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
        description: `${rows.length} baris diproses${
          warnCount > 0 ? ` · ${warnCount} catatan` : ""
        }. File ${outName} diunduh.`,
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

  // Download raw-clean.md (single file, all days concatenated)
  const onDownloadRawCleanMd = useCallback(async () => {
    if (!fileContent || !fileName) return;
    setIsGeneratingMd(true);
    try {
      const { generateCleanMdSingleFile } = await import("@/lib/budaya/clean-md-generator");
      const mdText = generateCleanMdSingleFile(fileContent, fileName);
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });

      const baseName = fileName.replace(/\.(md|csv)$/i, "");
      const outName = `${baseName}-raw-clean.md`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Raw clean MD terunduh",
        description: `${outName} — 1 file .md (semua tanggal, format Info Lengger standar).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Generate raw clean MD gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingMd(false);
    }
  }, [fileContent, fileName]);

  // Upload edited Excel → parse → preview
  const handleExcelUpload = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx")) {
      toast({
        title: "Format tidak didukung",
        description: "File harus berekstensi .xlsx",
        variant: "destructive",
      });
      return;
    }
    setIsExcelParsing(true);
    try {
      const { parseXlsx } = await import("@/lib/budaya/xlsx-parser");
      const { rows, warnings } = await parseXlsx(file);

      if (rows.length === 0) {
        toast({
          title: "Excel kosong",
          description: "Tidak ada baris data terdeteksi.",
          variant: "destructive",
        });
        return;
      }

      setFileName(file.name);
      setFileContent(null); // Excel is binary, not text
      const tanggalList = [...new Set(rows.map((r) => r.Tanggal).filter(Boolean))] as string[];
      setPreview({
        filename: file.name,
        tanggalList,
        rows: rows as RowData[],
        warnings,
      });

      toast({
        title: "Excel terbaca",
        description: `${rows.length} baris diparsing dari Excel.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Baca Excel gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsExcelParsing(false);
    }
  }, []);

  const onExcelInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) await handleExcelUpload(f);
      if (excelInputRef.current) excelInputRef.current.value = "";
    },
    [handleExcelUpload]
  );

  // Download weekly .xlsx ZIP (1 file per ISO week, Senin-Minggu)
  const onDownloadWeeklyXlsx = useCallback(async () => {
    if (!preview || !fileName) return;
    setIsGeneratingWeekly(true);
    try {
      const { generateWeeklyXlsxZip } = await import("@/lib/budaya/weekly-xlsx-generator");
      const baseName = fileName.replace(/\.(md|csv|xlsx)$/i, "");
      const arrayBuffer = await generateWeeklyXlsxZip(preview.rows, baseName);
      const blob = new Blob([arrayBuffer], { type: "application/zip" });
      const outName = `${baseName}-weekly.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Weekly Excel ZIP terunduh",
        description: `${outName} — 1 file .xlsx per minggu (ISO week). Edit tiap minggu, lalu upload via tab Excel.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Generate weekly Excel gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingWeekly(false);
    }
  }, [preview, fileName]);

  // Download clean.md ZIP from edited Excel
  const onDownloadExcelCleanMd = useCallback(async () => {
    if (!preview || !fileName) return;
    setIsGeneratingExcelMd(true);
    try {
      const { generateCleanMdZipFromRows } = await import("@/lib/budaya/clean-md-generator");
      const arrayBuffer = await generateCleanMdZipFromRows(preview.rows, fileName);
      const blob = new Blob([arrayBuffer], { type: "application/zip" });

      const baseName = fileName.replace(/\.xlsx$/i, "");
      const outName = `${baseName}-clean-md.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Clean MD ZIP terunduh",
        description: `${outName} — berisi 1 file .md per tanggal (dengan data dari Excel yang sudah diedit).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Generate clean MD gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingExcelMd(false);
    }
  }, [preview, fileName]);

  const onReset = useCallback(() => {
    setFileName(null);
    setFileContent(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (excelInputRef.current) excelInputRef.current.value = "";
  }, []);

  // ---------- Bot Daily tab handlers ----------
  // All bot API calls go to the mini-service on port 3031 via the Caddy
  // gateway, using ?XTransformPort=3031 (per sandbox networking rules).
  const fetchBotDays = useCallback(async () => {
    setBotIsLoadingDays(true);
    try {
      const res = await fetch("/api/days?XTransformPort=3031");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBotDays(data.days ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Gagal memuat daftar hari bot",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBotIsLoadingDays(false);
    }
  }, []);

  const fetchBotDayDetail = useCallback(async (date: string) => {
    setBotIsLoadingDetail(true);
    setBotDayDetail(null);
    try {
      const res = await fetch(`/api/day/${date}?XTransformPort=3031`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBotDayDetail(data);
      // Initialize the final-md editor with final if exists, else empty (user clicks "Init dari Raw")
      setBotFinalText(data.finalMd ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: `Gagal memuat detail ${date}`,
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBotIsLoadingDetail(false);
    }
  }, []);

  const onSelectBotDay = useCallback(
    (date: string) => {
      setBotSelectedDate(date);
      fetchBotDayDetail(date);
    },
    [fetchBotDayDetail]
  );

  const onTriggerBotRun = useCallback(async () => {
    setBotIsTriggering(true);
    try {
      const res = await fetch("/api/run?XTransformPort=3031", { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast({
        title: "Pipeline selesai",
        description: `${data.meta?.date}: ${data.meta?.locationCount} lokasi terdeteksi. File ${data.meta?.date}-raw.md siap.`,
      });
      await fetchBotDays();
      // Auto-select the just-run date
      if (data.meta?.date) {
        onSelectBotDay(data.meta.date);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Pipeline gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBotIsTriggering(false);
    }
  }, [fetchBotDays, onSelectBotDay]);

  const onSaveBotFinal = useCallback(async () => {
    if (!botSelectedDate || !botFinalText.trim()) return;
    setBotIsSavingFinal(true);
    try {
      const res = await fetch(`/api/day/${botSelectedDate}/final?XTransformPort=3031`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: botFinalText,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({
        title: "Final MD tersimpan",
        description: `${botSelectedDate}-final.md disimpan di storage.`,
      });
      // Refresh the day detail + day list (to update hasFinal badge)
      await fetchBotDayDetail(botSelectedDate);
      await fetchBotDays();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Save final gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBotIsSavingFinal(false);
    }
  }, [botSelectedDate, botFinalText, fetchBotDayDetail, fetchBotDays]);

  const onConvertBotXlsx = useCallback(async () => {
    if (!botSelectedDate || !botFinalText.trim()) return;
    setBotIsConvertingXlsx(true);
    try {
      // Send the final md text in the body (so server uses latest edits, not stale storage)
      const res = await fetch(`/api/day/${botSelectedDate}/convert-xlsx?XTransformPort=3031`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: botFinalText,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.base64) throw new Error("No base64 in response");
      // Decode base64 → blob → download
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `${botSelectedDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Excel terunduh",
        description: `${data.filename} · ${data.rowsCount} baris · ${data.warnings?.length ?? 0} catatan parsing.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Convert to Excel gagal",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBotIsConvertingXlsx(false);
    }
  }, [botSelectedDate, botFinalText]);

  // Fetch bot days when the bot tab is first activated
  useEffect(() => {
    if (activeTab === "bot" && botDays.length === 0) {
      fetchBotDays();
    }
  }, [activeTab, botDays.length, fetchBotDays]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100">
              <FileSpreadsheet className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Lengger Ledger Converter
              </h1>
              <p className="text-xs text-muted-foreground">
                Info Lengger .md/.csv/foto &rarr; Excel template (.xlsx) ·
                dengan OCR
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex gap-1">
              <ScanText className="h-3 w-3" /> OCR
            </Badge>
            <Badge variant="outline" className="hidden sm:inline-flex">
              v2 · auto-parse + OCR
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open("/PLAN.md", "_blank")}
              title="Lihat plan implementasi (PLAN.md) — Cloudflare Workers + Telegram bot"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Plan</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onDownloadSource}
              disabled={isDownloadingSource}
              title="Download source code (.zip) — termasuk PLAN.md + worklog.md"
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
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "file" | "ocr" | "excel" | "bot")}
        >
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="file" className="gap-1.5">
              <FileText className="h-4 w-4" /> RAW
            </TabsTrigger>
            <TabsTrigger value="ocr" className="gap-1.5">
              <ScanText className="h-4 w-4" /> Foto OCR
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </TabsTrigger>
            <TabsTrigger value="bot" className="gap-1.5">
              <Bot className="h-4 w-4" /> Bot Daily
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: File upload ============ */}
          <TabsContent value="file">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  1. Upload file .md atau .csv
                </CardTitle>
                <CardDescription>
                  Drag &amp; drop atau klik untuk memilih. Auto-detect 3 format:
                  <strong> plain MD</strong> (Info Lengger),
                  <strong> CSV scraping</strong> (RAW IG),
                  <strong> FB scraping</strong> (
                  <code>POST #N</code> + <code>--- RAW POST ---</code>).
                  Parser otomatis mengisi: tanggal (multi-day), Jam (15:30 /
                  19:30 jika &quot;MBENGI TOK&quot;), rombongan (di-normalisasi{" "}
                  <code>&amp;</code> &rarr; <code>;</code>), lokasi, nama
                  individu &amp; peran (placeholder <code>...?</code> di-drop),
                  aktivitas_budaya, Gagrak (Sindenan/Bedhenan).
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
          </TabsContent>

          {/* ============ TAB 2: OCR from photo ============ */}
          <TabsContent value="ocr">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanText className="h-4 w-4 text-amber-700" />
                  1. Upload foto &rarr; OCR &rarr; text
                </CardTitle>
                <CardDescription>
                  Upload 1+ foto caption Info Lengger (screenshot IG/FB).
                  OCR berjalan 100% di browser pakai{" "}
                  <strong>Tesseract.js</strong> (gratis, no API key,
                  privacy-friendly). Bahasa: Indonesian + English. Setelah
                  OCR selesai, ada 2 opsi:
                  <strong> (1) &quot;Pakai sebagai input &rarr; parse&quot;</strong>{" "}
                  untuk langsung parse ke preview tabel, atau
                  <strong> (2) &quot;Download as .md&quot;</strong> untuk simpan
                  file .md — edit offline, lalu upload ulang via tab{" "}
                  <em>&quot;File .md / .csv&quot;</em> untuk convert ke .xlsx.
                  <br />
                  <span className="text-xs text-amber-700">
                    ⚠ Saat pertama pakai, browser download language data
                    (~5MB, di-cache). Akurasi OCR ~70-90% — selalu edit hasil
                    sebelum convert.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Image dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingImage(true);
                  }}
                  onDragLeave={() => setIsDraggingImage(false)}
                  onDrop={onImageDrop}
                  onClick={() => imageInputRef.current?.click()}
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    isDraggingImage
                      ? "border-amber-500 bg-amber-50"
                      : "border-muted-foreground/25 hover:border-amber-400 hover:bg-amber-50/40"
                  }`}
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp"
                    multiple
                    className="hidden"
                    onChange={onImageInputChange}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                      <ImageIcon className="h-5 w-5 text-amber-700" />
                    </div>
                    <p className="text-sm font-medium">
                      Drag &amp; drop 1+ foto di sini
                    </p>
                    <p className="text-xs text-muted-foreground">
                      atau klik untuk pilih · PNG / JPG / WebP / BMP / GIF ·
                      multi-image supported
                    </p>
                  </div>
                </div>

                {/* Image thumbnails */}
                {ocrImages.length > 0 && (
                  <div className="flex flex-wrap gap-3 items-start">
                    {ocrPreviews.map((url, i) => (
                      <div
                        key={i}
                        className="relative group rounded-md border overflow-hidden bg-muted/30"
                      >
                        {/* Using native <img> for blob URL preview — Next Image not needed here */}
                        <img
                          src={url}
                          alt={ocrImages[i].name}
                          className="h-24 w-24 object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(i);
                          }}
                          className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80 transition"
                          aria-label={`Hapus gambar ${i + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                          {ocrImages[i].name}
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearImages}
                      className="gap-1.5 text-xs"
                    >
                      <RotateCcw className="h-3 w-3" /> Clear all
                    </Button>
                  </div>
                )}

                {/* Run OCR button */}
                {ocrImages.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={runOcrOnImages}
                      disabled={isOcrRunning}
                      className="gap-2"
                    >
                      {isOcrRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {isOcrRunning
                        ? "Menjalankan OCR..."
                        : `Run OCR (${ocrImages.length} gambar)`}
                    </Button>
                    {ocrConfidence !== null && ocrConfidence > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Confidence: {ocrConfidence.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                )}

                {/* OCR progress bar */}
                {isOcrRunning && ocrProgress && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="truncate pr-3">{ocrProgress.status}</span>
                      <span>{(ocrProgress.progress * 100).toFixed(0)}%</span>
                    </div>
                    <Progress
                      value={ocrProgress.progress * 100}
                      className="h-2"
                    />
                  </div>
                )}

                {/* OCR result textarea */}
                {ocrText && !isOcrRunning && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        2. Hasil OCR (editable)
                      </label>
                      <span className="text-xs text-muted-foreground">
                        Perbaiki dulu sebelum dipakai sebagai input parser
                      </span>
                    </div>
                    <Textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      rows={12}
                      className="font-mono text-xs leading-relaxed"
                      placeholder="Hasil OCR akan muncul di sini..."
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={useOcrAsMd}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Pakai sebagai input &rarr; parse
                      </Button>
                      <Button
                        onClick={downloadOcrAsMd}
                        variant="outline"
                        className="gap-2"
                        title="Download hasil OCR sebagai file .md — bisa di-edit offline lalu di-upload ulang via tab File"
                      >
                        <Download className="h-4 w-4" />
                        Download as .md
                      </Button>
                      {!looksLikeInfoLengger(ocrText) && (
                        <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Teks tidak terdeteksi sebagai Info Lengger
                          (tapi tetap bisa dipakai)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 <strong>Tip:</strong> Klik <strong>Download as .md</strong>{" "}
                      untuk simpan hasil OCR sebagai file .md. Edit di editor
                      favoritmu (VS Code, Notepad, dll.), lalu upload via tab{" "}
                      <strong>&quot;File .md / .csv&quot;</strong> di atas untuk
                      convert ke .xlsx lewat pipeline yang sudah jalan.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ TAB 3: Upload Excel (edited) ============ */}
          <TabsContent value="excel">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-amber-700" />
                  Upload Excel yang sudah diedit
                </CardTitle>
                <CardDescription>
                  Upload file <code>.xlsx</code> yang sudah Anda edit (isi peristiwa,
                  kategori, bukti dari flyer). Parser akan baca Excel kembali dan
                  generate clean.md ZIP dengan data yang sudah lengkap.
                  <br />
                  <span className="text-xs text-amber-700">
                    Workflow: RAW &rarr; Excel (auto) &rarr; edit Excel (manual, isi dari flyer)
                    &rarr; upload Excel &rarr; clean.md ZIP (dengan data lengkap)
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onClick={() => excelInputRef.current?.click()}
                  className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors border-muted-foreground/25 hover:border-amber-400 hover:bg-amber-50/40"
                >
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={onExcelInputChange}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                      {isExcelParsing ? (
                        <Loader2 className="h-5 w-5 text-amber-700 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 text-amber-700" />
                      )}
                    </div>
                    {isExcelParsing ? (
                      <p className="text-sm font-medium">Membaca Excel...</p>
                    ) : fileName && activeTab === "excel" ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileSpreadsheet className="h-4 w-4" />
                          {fileName}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Klik untuk ganti file
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          Drag &amp; drop file .xlsx di sini
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
          </TabsContent>

          {/* ============ TAB 4: Bot Daily ============ */}
          <TabsContent value="bot" className="space-y-4">
            {/* Top: trigger button + status badges */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-amber-700" />
                  Bot Harian — YYYY-MM-DD-raw.md otomatis
                </CardTitle>
                <CardDescription>
                  Bot otomatis tiap hari 15:00 WIB: ambil foto &rarr; VLM
                  OCR &rarr; LLM croscek typo &rarr; simpan{" "}
                  <code>YYYY-MM-DD-raw.md</code> + foto asli ke storage.
                  Telegram masuk:{" "}
                  <em>&quot;hari ini DD bulan ada N lokasi&quot;</em>. Anda
                  croscek final buat nambah narasi.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={onTriggerBotRun}
                  disabled={botIsTriggering}
                  className="gap-2"
                >
                  {botIsTriggering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {botIsTriggering
                    ? "Menjalankan..."
                    : "Trigger Run (hari ini)"}
                </Button>
                <Button
                  onClick={() => fetchBotDays()}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={botIsLoadingDays}
                >
                  {botIsLoadingDays ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
                <Badge variant="outline" className="text-xs gap-1">
                  <Calendar className="h-3 w-3" /> Cron: 15:00 WIB
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {botDays.length} hari diproses
                </Badge>
              </CardContent>
            </Card>

            {/* Date list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {botIsLoadingDays && botDays.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Memuat daftar hari...
                  </CardContent>
                </Card>
              ) : botDays.length === 0 ? (
                <Card className="col-span-full border-dashed">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada hari diproses. Klik{" "}
                    <strong>&quot;Trigger Run&quot;</strong> untuk menjalankan
                    pipeline hari ini.
                  </CardContent>
                </Card>
              ) : (
                botDays.map((day) => (
                  <Card
                    key={day.date}
                    className={`cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition ${
                      botSelectedDate === day.date
                        ? "border-amber-500 bg-amber-50/50"
                        : ""
                    }`}
                    onClick={() => onSelectBotDay(day.date)}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono">
                          {day.date}
                        </CardTitle>
                        {day.hasFinal ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            final
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            raw
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>
                          {day.locationCount} lokasi &middot;{" "}
                          {day.photoCount} foto
                        </span>
                      </div>
                      <div
                        className="text-muted-foreground truncate"
                        title={day.telegramReport}
                      >
                        📱 {day.telegramReport.split("\n")[0]}
                      </div>
                      <div className="text-muted-foreground">
                        Sumber: {day.source}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Detail panel */}
            {botSelectedDate && botIsLoadingDetail && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Memuat detail {botSelectedDate}...
                </CardContent>
              </Card>
            )}

            {botSelectedDate && botDayDetail && !botIsLoadingDetail && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-700" />
                      {botSelectedDate} &mdash; detail
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBotSelectedDate(null)}
                      className="h-7 px-2"
                    >
                      <X className="h-3.5 w-3.5" /> Tutup
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    Foto asli + raw md (auto VLM + LLM) + editor final md
                    (tambah narasi Anda).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Telegram report banner */}
                  <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
                    📱 <strong>Telegram report:</strong>{" "}
                    {botDayDetail.meta?.telegramReport}
                  </div>

                  {/* Photos */}
                  <div>
                    <label className="text-sm font-medium">
                      Foto asli (simpan di storage)
                    </label>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {botDayDetail.photos.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Tidak ada foto tersimpan.
                        </p>
                      ) : (
                        botDayDetail.photos.map((p) => (
                          <a
                            key={p}
                            href={`/api/photo/${botSelectedDate}/${p}?XTransformPort=3031`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-md border overflow-hidden hover:border-amber-400 transition"
                          >
                            {/* Native <img> for blob URL preview — Next Image not needed for cross-port gateway */}
                            <img
                              src={`/api/photo/${botSelectedDate}/${p}?XTransformPort=3031`}
                              alt={p}
                              className="h-32 w-auto object-contain bg-muted/30"
                            />
                          </a>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Raw md (read-only) */}
                  <div>
                    <label className="text-sm font-medium">
                      Raw MD (auto-generated &mdash; VLM OCR + LLM typo fix)
                    </label>
                    <Textarea
                      value={botDayDetail.rawMd ?? ""}
                      readOnly
                      rows={10}
                      className="mt-2 font-mono text-xs leading-relaxed bg-muted/20"
                    />
                  </div>

                  {/* Final md editor */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        Final MD (editor &mdash; tambah narasi Anda)
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {botDayDetail.finalMd
                          ? "Sudah ada final — edit lalu Save"
                          : "Belum ada final — klik \"Init dari Raw\" untuk mulai"}
                      </span>
                    </div>
                    <Textarea
                      value={botFinalText}
                      onChange={(e) => setBotFinalText(e.target.value)}
                      rows={14}
                      className="mt-2 font-mono text-xs leading-relaxed"
                      placeholder="Klik 'Init dari Raw' untuk copy raw md ke sini, lalu tambah narasi Anda..."
                    />
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setBotFinalText(botDayDetail.rawMd ?? "")
                        }
                        className="gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Init dari Raw
                      </Button>
                      <Button
                        onClick={onSaveBotFinal}
                        disabled={botIsSavingFinal || !botFinalText.trim()}
                        size="sm"
                        className="gap-1.5"
                      >
                        {botIsSavingFinal ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        {botIsSavingFinal ? "Menyimpan..." : "Save Final"}
                      </Button>
                      <Button
                        onClick={onConvertBotXlsx}
                        disabled={
                          botIsConvertingXlsx || !botFinalText.trim()
                        }
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        {botIsConvertingXlsx ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        {botIsConvertingXlsx
                          ? "Mengonversi..."
                          : "Convert to Excel"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* ============ Shared preview ============ */}
        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {preview.filename ? "2" : "2"}. Preview hasil parsing
              </CardTitle>
              <CardDescription>
                <span className="font-medium">{preview.filename}</span> ·{" "}
                {preview.rows.length} baris terdeteksi
                {preview.tanggalList.length > 0
                  ? ` · tanggal: ${preview.tanggalList.join(", ")}`
                  : ""}
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
                      <th className="px-2 py-1.5 text-left font-medium border-b">kode_desa</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">Nama_Kecamatan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">kode_kecamatan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_kabupaten</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">kode_kabupaten</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">nama_provinsi</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">tipe_sumber</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">tanggal_capture</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">tingkat_verifikasi</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">status_consent</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">kelengkapan</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b">catatan_gap</th>
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
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.kode_desa)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.Nama_Kecamatan)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.kode_kecamatan)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.nama_kabupaten)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.kode_kabupaten)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.nama_provinsi)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.tipe_sumber)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.tanggal_capture)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.tingkat_verifikasi)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.status_consent)}</td>
                          <td className="px-2 py-1.5 border-b align-top">{empty(r.kelengkapan)}</td>
                          <td className="px-2 py-1.5 border-b align-top max-w-[20rem] overflow-hidden text-ellipsis">{empty(r.catatan_gap)}</td>
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
                <Button
                  onClick={onDownloadWeeklyXlsx}
                  disabled={isGeneratingWeekly}
                  variant="outline"
                  className="gap-2"
                  title="Download ZIP berisi 1 .xlsx per minggu (ISO week, Senin-Minggu)"
                >
                  {isGeneratingWeekly ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isGeneratingWeekly ? "Generating..." : "Weekly .xlsx ZIP"}
                </Button>
                {fileContent && (
                  <Button
                    onClick={onDownloadRawCleanMd}
                    disabled={isGeneratingMd}
                    variant="outline"
                    className="gap-2"
                    title="Download raw clean.md (1 file, semua tanggal, format standar)"
                  >
                    {isGeneratingMd ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {isGeneratingMd ? "Generating..." : "Download raw-clean.md"}
                  </Button>
                )}
                <Button
                  onClick={onDownloadExcelCleanMd}
                  disabled={isGeneratingExcelMd}
                  variant="outline"
                  className="gap-2"
                  title="Download clean.md ZIP (1 file per tanggal, dengan data dari Excel/source)"
                >
                  {isGeneratingExcelMd ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isGeneratingExcelMd ? "Generating..." : "Download clean.md ZIP"}
                </Button>
                <Button variant="outline" onClick={onReset} className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <span className="text-xs text-muted-foreground ml-auto inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Kolom <code>TanggalSelesai</code>, <code>peristiwa</code>,{" "}
                  <code>Kategori</code>, <code>bukti</code>, <code>catatan</code>{" "}
                  dikosongkan untuk diisi manual.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!preview && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">
                Pilih sumber input di atas:
              </p>
              <ul className="list-disc pl-5 text-xs space-y-1.5">
                <li>
                  <strong>Tab &quot;File .md / .csv&quot;</strong> — upload file
                  teks Info Lengger (single/multi-day, CSV scraping IG, atau FB
                  scraping dengan <code>POST #N</code>).
                </li>
                <li>
                  <strong>Tab &quot;Foto &rarr; OCR&quot;</strong> — upload 1+
                  foto caption Info Lengger, OCR ke text, edit hasil, lalu
                  pakai sebagai input parser. Bahasa Indonesian + English.
                </li>
              </ul>

              <div className="space-y-2 pt-2">
                <p className="font-medium text-foreground">
                  Format input teks (file atau hasil OCR) yang didukung:
                </p>

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
                  <p><strong>Aturan khusus parser:</strong></p>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                    <li><code>MBENGI TOK</code> / <code>MBENGI THOK</code> &rarr; Jam = <code>19:30</code> (sesi malam saja). Default tanpa marker = <code>15:30</code> (pasca Asar).</li>
                    <li>Rombongan dengan <code>&amp;</code> (multiple groups) &rarr; di-normalisasi jadi <code>;</code>.</li>
                    <li>Individu placeholder <code>...?</code> / <code>Bu ...?</code> / <code>...</code> &rarr; di-drop (kosong).</li>
                    <li>Gagrak: Pentas Lengger + Sinden &rarr; <code>Sindenan</code>. Pentas Lengger tanpa Sinden &rarr; <code>Bedhenan</code>. Non-Lengger (Tayub/Warok/Jaranan/Topeng Ireng) &rarr; kosong.</li>
                    <li>Baris <code>Sumber : ...</code> di mana saja di MD &rarr; mengisi kolom <code>sumber</code> untuk semua baris di section itu.</li>
                    <li>Multi-day: tiap header <code>Info Lengger &lt;date&gt;</code> men-set tanggal untuk entri di bawahnya sampai header berikutnya.</li>
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="font-medium text-foreground">Tentang OCR (Tesseract.js):</p>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                    <li>100% client-side — tidak ada foto yang dikirim ke server.</li>
                    <li>Bahasa: Indonesian + English (default, cocok untuk caption IG/FB).</li>
                    <li>Saat pertama pakai, browser download language data ~5MB (di-cache untuk pakai berikutnya).</li>
                    <li>Akurasi OCR tergantung kualitas foto. Selalu edit hasil sebelum convert ke .xlsx.</li>
                    <li>Multi-image: upload beberapa foto sekaligus, hasil OCR digabung otomatis.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <span>
            Lengger Ledger Converter + OCR · auto-parse md/csv/fb/foto &rarr;
            xlsx
          </span>
          <span>Built with Next.js · ExcelJS · Tesseract.js</span>
        </div>
      </footer>
    </div>
  );
}
