import { Injectable } from '@nestjs/common';
import { ReportResult } from '@vhp/shared';

@Injectable()
export class ReportsExportService {
  export(result: ReportResult, format: 'csv' | 'xlsx' | 'pdf'): { buffer: Buffer; contentType: string; extension: string } {
    if (format === 'csv') return { buffer: Buffer.from(this.csv(result), 'utf8'), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
    if (format === 'xlsx') return { buffer: Buffer.from(this.excelXml(result), 'utf8'), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
    return { buffer: this.pdf(result), contentType: 'application/pdf', extension: 'pdf' };
  }

  private csv(result: ReportResult): string {
    const rows = result.data as Array<Record<string, unknown>>;
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const lines = [columns.map((column) => this.csvCell(column)).join(';')];
    for (const row of rows) lines.push(columns.map((column) => this.csvCell(this.scalar(row[column]))).join(';'));
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  private excelXml(result: ReportResult): string {
    const rows = result.data as Array<Record<string, unknown>>;
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const header = columns.map((column) => `<Cell><Data ss:Type="String">${this.xml(column)}</Data></Cell>`).join('');
    const body = rows.map((row) => `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${this.xml(this.scalar(row[column]))}</Data></Cell>`).join('')}</Row>`).join('');
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${this.xml(result.reportKey)}"><Table><Row>${header}</Row>${body}</Table></Worksheet></Workbook>`;
  }

  private pdf(result: ReportResult): Buffer {
    const rows = result.data as Array<Record<string, unknown>>;
    const text = [`Rapport: ${result.reportKey}`, `Lignes: ${rows.length}`, ...rows.map((row) => Object.values(row).map((value) => this.scalar(value)).join(' | '))];
    const commands = text.map((line, index) => `BT /F1 9 Tf 40 ${760 - index * 20} Td (${this.pdfText(line)}) Tj ET`).join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(commands, 'latin1')} >>\nstream\n${commands}\nendstream`,
    ];
    let output = '%PDF-1.4\n'; const offsets = [0];
    for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(output, 'latin1')); output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
    const xref = Buffer.byteLength(output, 'latin1'); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'latin1');
  }

  private scalar(value: unknown): string { return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
  private csvCell(value: unknown): string { return `"${this.scalar(value).replace(/"/g, '""')}"`; }
  private xml(value: unknown): string { return this.scalar(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  private pdfText(value: string): string { return value.replace(/[\\()\r\n]/g, (character) => `\\${character === '\n' ? ' ' : character}`); }
}
