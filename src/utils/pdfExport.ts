import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type PdfValue = string | number | boolean | null | undefined;

interface PdfExportOptions {
  orientation?: "portrait" | "landscape";
  subtitle?: string;
  columnWidths?: number[];
}

const BRANDING = {
  supermarketName: "YOUR SUPERMARKET NAME",
  tagline: "Inventory Management System",
  logoPlaceholder: "LOGO",
};

export function exportToPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: PdfValue[][],
  options: PdfExportOptions = {},
): void {
  const { orientation = "landscape", subtitle, columnWidths } = options;

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const generatedAt = new Date().toLocaleString();

  // Brand header
  doc.setFillColor(31, 41, 55);
  doc.rect(0, 0, pageWidth, 32, "F");

  // Logo placeholder
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, 7, 19, 18, 2, 2, "S");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(BRANDING.logoPlaceholder, 23.5, 17.5, {
    align: "center",
  });

  // Supermarket name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(BRANDING.supermarketName, 39, 14);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(BRANDING.tagline, 39, 21);

  // Report title
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 14, 43);

  // Subtitle
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, 14, 50);
  }

  // Generation information
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${generatedAt}`, pageWidth - 14, 43, { align: "right" });

  // Table
  autoTable(doc, {
    startY: subtitle ? 57 : 53,
    head: [headers],
    body: rows.map((row) =>
      row.map((value) =>
        value === null || value === undefined ? "" : String(value),
      ),
    ),
    margin: {
      top: 15,
      right: 14,
      bottom: 20,
      left: 14,
    },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "middle",
      textColor: [55, 65, 81],
    },
    headStyles: {
      fillColor: [55, 65, 81],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: columnWidths
      ? Object.fromEntries(
          columnWidths.map((width, index) => [index, { cellWidth: width }]),
        )
      : {},
    didDrawPage: () => {
      // Footer separator
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

      // Footer text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);

      doc.text(BRANDING.supermarketName, 14, pageHeight - 9);

      doc.text(
        `Page ${doc.getCurrentPageInfo().pageNumber} of ${doc.getNumberOfPages()}`,
        pageWidth - 14,
        pageHeight - 9,
        { align: "right" },
      );
    },
  });

  doc.save(filename);
}
