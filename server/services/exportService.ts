import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ReportTableData {
  title: string;
  subtitle: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, string | number>>;
  summary?: Array<{ label: string; value: string | number }>;
}

export async function generateExcelBuffer(report: ReportTableData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seth And Sons DryFruits';
  wb.created = new Date();

  const sheet = wb.addWorksheet(report.title.slice(0, 31));
  sheet.addRow([report.title]);
  sheet.addRow([report.subtitle]);
  sheet.addRow([]);

  sheet.columns = report.columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 20,
  }));

  const headerRow = sheet.getRow(4);
  headerRow.values = report.columns.map(c => c.header);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF183D32' },
  };

  for (const r of report.rows) {
    sheet.addRow(report.columns.map(c => r[c.key] ?? ''));
  }

  if (report.summary && report.summary.length > 0) {
    sheet.addRow([]);
    for (const s of report.summary) {
      const row = sheet.addRow([s.label, s.value]);
      row.font = { bold: true };
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function generateCsvString(report: ReportTableData): string {
  const esc = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    report.columns.map(c => esc(c.header)).join(','),
    ...report.rows.map(r => report.columns.map(c => esc(r[c.key] ?? '')).join(',')),
  ];
  return lines.join('\r\n');
}

export function generatePdfBuffer(report: ReportTableData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.rect(0, 0, doc.page.width, 78).fill('#183D32');
    doc.fillColor('#C8A96B').fontSize(18).text('Seth And Sons DryFruits', 40, 22);
    doc.fillColor('#F8F6F0').fontSize(11).text(report.title, 40, 46);

    doc.fillColor('#252923').fontSize(9).text(report.subtitle, 40, 92);
    doc.moveDown(1);

    // Summary block
    if (report.summary && report.summary.length > 0) {
      let y = 112;
      doc.fontSize(10).fillColor('#183D32').text('Summary Metrics', 40, y);
      y += 16;
      doc.fontSize(9).fillColor('#252923');
      for (const s of report.summary) {
        doc.text(`${s.label}: ${s.value}`, 48, y);
        y += 14;
      }
      doc.y = y + 10;
    } else {
      doc.y = 115;
    }

    // Table headers
    const startX = 40;
    const availWidth = doc.page.width - 80;
    const colWidth = availWidth / Math.max(1, report.columns.length);

    const drawHeader = (yPos: number) => {
      doc.rect(startX, yPos, availWidth, 20).fill('#183D32');
      doc.fillColor('#FFFFFF').fontSize(8);
      report.columns.forEach((col, i) => {
        doc.text(col.header, startX + i * colWidth + 4, yPos + 6, {
          width: colWidth - 8,
          ellipsis: true,
        });
      });
    };

    let y = doc.y;
    drawHeader(y);
    y += 24;

    doc.fontSize(8).fillColor('#252923');
    for (const row of report.rows.slice(0, 250)) {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
        drawHeader(y);
        y += 24;
        doc.fontSize(8).fillColor('#252923');
      }
      report.columns.forEach((col, i) => {
        doc.text(String(row[col.key] ?? ''), startX + i * colWidth + 4, y, {
          width: colWidth - 8,
          ellipsis: true,
        });
      });
      y += 18;
      doc.moveTo(startX, y - 3).lineTo(startX + availWidth, y - 3).strokeColor('#E9E4D9').stroke();
    }

    doc.end();
  });
}

export function generateOrderInvoicePdf(params: {
  businessName: string;
  businessAddress: string;
  gstin: string;
  contactNumber: string;
  businessEmail: string;
  invoiceNumber: string;
  orderNumber: string;
  orderDate: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Array<{
    productName: string;
    quantity: number;
    unit: string;
    weightLabel?: string | null;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  shippingCharge: number;
  taxAmount: number;
  totalAmount: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Emerald Banner
    doc.rect(0, 0, doc.page.width, 96).fill('#183D32');
    doc.fillColor('#C8A96B').fontSize(20).text(params.businessName, 45, 24);
    doc.fillColor('#F8F6F0').fontSize(9).text(params.businessAddress, 45, 50);
    doc.text(`GSTIN: ${params.gstin}  |  Tel: ${params.contactNumber}  |  ${params.businessEmail}`, 45, 65);

    doc.fillColor('#183D32').fontSize(15).text('TAX INVOICE', 45, 114);
    doc.fillColor('#252923').fontSize(10);
    doc.text(`Invoice No: ${params.invoiceNumber}`, 45, 138);
    doc.text(`Order ID: ${params.orderNumber}`, 45, 154);
    doc.text(`Order Date: ${new Date(params.orderDate).toLocaleDateString('en-IN')}`, 45, 170);
    doc.text(`Payment: ${params.paymentMethod} (${params.paymentStatus.toUpperCase()})`, 45, 186);

    doc.fillColor('#183D32').fontSize(11).text('Bill & Ship To:', 330, 138);
    doc.fillColor('#252923').fontSize(10);
    doc.text(params.customerName, 330, 154);
    doc.text(params.customerPhone, 330, 170);
    doc.text(params.customerAddress, 330, 186, { width: 220 });

    // Table header
    let y = 238;
    doc.rect(45, y, 505, 22).fill('#183D32');
    doc.fillColor('#FFFFFF').fontSize(9);
    doc.text('Product', 52, y + 7);
    doc.text('Qty', 280, y + 7);
    doc.text('Rate (INR)', 355, y + 7);
    doc.text('Amount (INR)', 455, y + 7);
    y += 28;

    doc.fillColor('#252923').fontSize(9);
    for (const item of params.items) {
      const qtyText = item.weightLabel
        ? `${item.quantity} x ${item.weightLabel}`
        : `${item.quantity} ${item.unit === 'gram' ? 'g' : item.unit === 'ml' ? 'ml' : item.unit === 'piece' ? 'pc' : 'kg'}`;
      doc.text(item.productName, 52, y, { width: 215 });
      doc.text(qtyText, 280, y);
      doc.text(`Rs. ${item.unitPrice.toLocaleString('en-IN')}`, 355, y);
      doc.text(`Rs. ${item.subtotal.toLocaleString('en-IN')}`, 455, y);
      y += 22;
      doc.moveTo(45, y - 5).lineTo(550, y - 5).strokeColor('#E9E4D9').stroke();
    }

    y += 12;
    const summaryX = 340;
    doc.fontSize(10);
    doc.text('Subtotal:', summaryX, y);
    doc.text(`Rs. ${params.subtotal.toLocaleString('en-IN')}`, 455, y);
    y += 16;

    if (params.discountAmount > 0) {
      doc.text(`Discount${params.couponCode ? ` (${params.couponCode})` : ''}:`, summaryX, y);
      doc.text(`-Rs. ${params.discountAmount.toLocaleString('en-IN')}`, 455, y);
      y += 16;
    }

    doc.text('Shipping:', summaryX, y);
    doc.text(params.shippingCharge > 0 ? `Rs. ${params.shippingCharge}` : 'Complimentary', 455, y);
    y += 16;

    doc.text('GST (Taxes):', summaryX, y);
    doc.text(`Rs. ${params.taxAmount.toLocaleString('en-IN')}`, 455, y);
    y += 20;

    doc.rect(summaryX - 8, y - 4, 218, 24).fill('#F8F6F0');
    doc.fillColor('#183D32').fontSize(12).text('Grand Total:', summaryX, y + 2);
    doc.text(`Rs. ${params.totalAmount.toLocaleString('en-IN')}`, 455, y + 2);

    doc.fillColor('#888B83').fontSize(8).text(
      'Thank you for choosing Seth And Sons DryFruits — A Legacy of Quality & Taste.',
      45,
      doc.page.height - 60,
      { align: 'center', width: 505 }
    );

    doc.end();
  });
}

