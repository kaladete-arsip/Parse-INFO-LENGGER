/**
 * XLSX Parser — read edited .xlsx back to RowData[].
 *
 * Workflow: user downloads Excel (26 cols) → edits offline (isi peristiwa,
 * kategori, bukti dari flyer) → uploads edited .xlsx → this parser reads
 * it back to RowData[] → clean.md generator produces ZIP with user's data.
 *
 * Uses ExcelJS (same library as xlsx-generator) for browser-side reading.
 */

import ExcelJS from "exceljs";
import { COLUMNS, type RowData } from "./template";

/**
 * Parse an .xlsx file (uploaded by user) → RowData[].
 *
 * The .xlsx must have:
 *   - Row 1: column headers (matching COLUMNS[].header)
 *   - Rows 2+: data
 *
 * @param file — the uploaded .xlsx File object
 * @returns { rows: RowData[], warnings: string[] }
 */
export async function parseXlsx(
  file: File
): Promise<{ rows: RowData[]; warnings: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) {
    return { rows: [], warnings: ["File Excel tidak memiliki worksheet."] };
  }

  // Read header row (row 1) → map header text → column key
  const headerRow = ws.getRow(1);
  const headerMap: Record<number, string> = {};
  for (let col = 1; col <= COLUMNS.length; col++) {
    const cellValue = headerRow.getCell(col).value?.toString()?.trim();
    if (cellValue) {
      const colDef = COLUMNS.find(
        (c) => c.header === cellValue || c.key === cellValue
      );
      if (colDef) {
        headerMap[col] = colDef.key;
      }
    }
  }

  // Read data rows (row 2+)
  const rows: RowData[] = [];
  const warnings: string[] = [];
  const maxRow = ws.rowCount;

  for (let rowNum = 2; rowNum <= maxRow; rowNum++) {
    const row = ws.getRow(rowNum);
    const rowData: Record<string, string | null> = {};

    let hasAnyValue = false;
    for (const [col, key] of Object.entries(headerMap)) {
      const cellValue = row.getCell(parseInt(col)).value;
      const strValue =
        cellValue !== null && cellValue !== undefined
          ? cellValue.toString().trim()
          : "";
      rowData[key] = strValue || null;
      if (strValue) hasAnyValue = true;
    }

    if (!hasAnyValue) continue; // skip empty rows

    rows.push(rowData as RowData);
  }

  if (rows.length === 0) {
    warnings.push("Tidak ada baris data terdeteksi di Excel.");
  }

  return { rows, warnings };
}
