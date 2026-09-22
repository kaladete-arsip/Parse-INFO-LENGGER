/**
 * Generate xlsx file from RowData[] using ExcelJS.
 *
 * Returns an ArrayBuffer (works in both Node.js and browser).
 *
 * Style mirrors the 2026-06-19_2026-06-20.xlsx template:
 *   - Font: Helvetica Neue, size 10
 *   - Header: bold, yellow fill (FFC000 / indexed 9), thin border, row height 20.25
 *   - Data rows: non-bold, no fill, thin border, row height 20.25
 */

import ExcelJS from "exceljs";
import { COLUMNS, HEADER_ROW_HEIGHT, ROW_HEIGHT, RowData } from "./template";

export async function generateXlsx(rows: RowData[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Z.ai";
  wb.created = new Date();
  const ws = wb.addWorksheet("Sheet 1", {
    views: [{ showGridLines: true }],
  });

  // Set column widths
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Header row
  const headerRow = ws.getRow(1);
  headerRow.height = HEADER_ROW_HEIGHT;
  COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Helvetica Neue", size: 10, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC000" }, // yellow-orange, mirrors indexed 9 in template
    };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = thinBorder();
  });
  headerRow.commit();

  // Data rows
  rows.forEach((rowData, rIdx) => {
    const rowNum = rIdx + 2;
    const row = ws.getRow(rowNum);
    row.height = ROW_HEIGHT;
    COLUMNS.forEach((col, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = (rowData as Record<string, string | null>)[col.key] ?? null;
      cell.font = { name: "Helvetica Neue", size: 10, bold: false };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      cell.border = thinBorder();
    });
    row.commit();
  });

  // Convert to ArrayBuffer (browser- and Node-compatible)
  const buf = await wb.xlsx.writeBuffer();
  // wb.xlsx.writeBuffer() returns ExcelJS.Buffer which is ArrayBuffer-like
  return buf as ArrayBuffer;
}

function thinBorder() {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
  return {
    top: side as ExcelJS.Border,
    bottom: side as ExcelJS.Border,
    left: side as ExcelJS.Border,
    right: side as ExcelJS.Border,
  };
}
