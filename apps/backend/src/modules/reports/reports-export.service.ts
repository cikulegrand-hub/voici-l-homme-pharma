import { Injectable } from '@nestjs/common';
import { ReportResult } from '@vhp/shared';

@Injectable()
export class ReportsExportService {
  export(result: ReportResult, format: 'csv' | 'xlsx' | 'pdf'): { buffer: Buffer; contentType: string; extension: string } {
    result = this.sanitize(result);
    if (format === 'csv') {
      return {
        buffer: Buffer.from(this.csv(result), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    }
    if (format === 'xlsx') {
      return {
        buffer: Buffer.from(this.excelXml(result), 'utf8'),
        contentType: 'application/vnd.ms-excel',
        extension: 'xls',
      };
    }
    return {
      buffer: this.pdf(result),
      contentType: 'application/pdf',
      extension: 'pdf',
    };
  }

  /** Exports contain business columns only; internal UUIDs and nested ORM objects never leave the API. */
  private sanitize(result: ReportResult): ReportResult {
    const allowed = this.exportColumns(result.reportKey).map((column) => column.key);
    return {
      ...result,
      data: (result.data || []).map((row: any) => Object.fromEntries(allowed.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]))),
    };
  }

  private csv(result: ReportResult): string {
    const rows = (result.data || []) as Array<Record<string, unknown>>;
    const columns = this.exportColumns(result.reportKey);
    const lines = [
      ['Établissement', "VOICI L'HOMME PHARMA"].map((value) => this.csvCell(value)).join(';'),
      ['Rapport', this.getReportLabel(result.reportKey)].map((value) => this.csvCell(value)).join(';'),
      ['Période', this.periodLabel(result)].map((value) => this.csvCell(value)).join(';'),
      ['Généré le', this.generatedDate()].map((value) => this.csvCell(value)).join(';'),
      ['Nombre de lignes', String(rows.length)].map((value) => this.csvCell(value)).join(';'),
      ['Totaux', this.totalsLabel(result)].map((value) => this.csvCell(value)).join(';'),
      '',
      columns.map((column) => this.csvCell(column.label)).join(';'),
    ];
    if (rows.length === 0) lines.push(this.csvCell('Aucune donnée ne correspond aux filtres sélectionnés.'));
    for (const row of rows) {
      lines.push(columns.map((column) => this.csvCell(this.scalar(row[column.key]))).join(';'));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  private exportColumns(key: string): Array<{ key: string; label: string }> {
    const labels: Record<string, Record<string, string>> = {
      'sales-journal': { invoiceNumber: 'N° facture', createdAt: 'Date', customer: 'Client', seller: 'Vendeur', currency: 'Devise', totalAmountCdf: 'Total CDF', totalAmountUsd: 'Total USD', status: 'Statut' },
      'stock-movements': { createdAt: 'Date', type: 'Type', direction: 'Sens', productName: 'Produit', lotNumber: 'N° lot', quantity: 'Quantité', unitCostCdf: 'Coût unitaire CDF', valueCdf: 'Valeur CDF', user: 'Utilisateur', reason: 'Motif' },
      'stock-entries-exits': { createdAt: 'Date', type: 'Type', direction: 'Sens', productName: 'Produit', lotNumber: 'N° lot', quantity: 'Quantité', unitCostCdf: 'Coût unitaire CDF', valueCdf: 'Valeur CDF', user: 'Utilisateur', reason: 'Motif' },
      'valued-inventory': { productName: 'Produit', dci: 'DCI', quantity: 'Quantité', cumpCdf: 'CUMP CDF', valueCdf: 'Valeur CDF' },
      expiries: { productName: 'Produit', lotNumber: 'N° lot', expiryDate: 'Péremption', quantity: 'Stock restant', valueCdf: 'Valeur à risque CDF' },
      expenses: { createdAt: 'Date', category: 'Catégorie', description: 'Description', amountCdf: 'Montant CDF', amountUsd: 'Montant USD', reversedAt: 'Contre-passée le' },
      'best-sellers': { productName: 'Produit', quantity: 'Quantité vendue', revenueCdf: 'Chiffre d’affaires CDF' },
      receivables: { customerName: 'Client', invoiceNumber: 'N° facture', balanceCdf: 'Solde dû CDF', daysOverdue: 'Jours de retard' },
      treasury: { currency: 'Devise', receipts: 'Encaissements', expenses: 'Décaissements', balance: 'Solde net', debit: 'Débit', credit: 'Crédit' },
      'seller-performance': { seller: 'Vendeur', salesCount: 'Nombre de ventes', revenueCdf: 'Chiffre d’affaires CDF' },
      'low-rotation': { productName: 'Produit', stockQuantity: 'Stock disponible', soldQuantity: 'Quantité vendue', stockValueCdf: 'Valeur du stock CDF' },
    };
    return Object.entries(labels[key] || {}).map(([columnKey, label]) => ({ key: columnKey, label }));
  }

  private generatedDate(): string {
    return new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa' });
  }

  private periodLabel(result: ReportResult): string {
    const filters = result.filters as any;
    if (filters?.from || filters?.to) return `${filters.from || 'début'} → ${filters.to || 'fin'}`;
    return 'Filtres sélectionnés';
  }

  private totalsLabel(result: ReportResult): string {
    const byCurrency = (result.totals as any)?.byCurrency || {};
    return Object.entries(byCurrency)
      .flatMap(([currency, values]) => Object.entries(values as Record<string, unknown>).filter(([, value]) => typeof value === 'number').map(([key, value]) => `${key}: ${Number(value).toLocaleString('fr-FR')} ${currency}`))
      .join(' | ') || 'Aucun total';
  }

  private excelXml(result: ReportResult): string {
    const rows = (result.data || []) as Array<Record<string, unknown>>;
    const columns = this.exportColumns(result.reportKey);
    const header = columns
      .map((column) => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${this.xml(column.label)}</Data></Cell>`)
      .join('');
    const body = rows.length
      ? rows
          .map(
            (row) =>
              `<Row>${columns
                .map((column) => {
                  const val = row[column.key];
                  const isNum = typeof val === 'number';
                  const type = isNum ? 'Number' : 'String';
                  return `<Cell><Data ss:Type="${type}">${this.xml(this.scalar(val))}</Data></Cell>`;
                })
                .join('')}</Row>`,
          )
          .join('')
      : '<Row><Cell><Data ss:Type="String">Aucune donnée disponible</Data></Cell></Row>';

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
    </Style>
    <Style ss:ID="HeaderStyle">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${this.xml(result.reportKey)}">
    <Table>
      <Row><Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}"><Data ss:Type="String">VOICI L'HOMME PHARMA — ${this.xml(this.getReportLabel(result.reportKey))}</Data></Cell></Row>
      <Row><Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}"><Data ss:Type="String">Période : ${this.xml(this.periodLabel(result))} | Généré le : ${this.xml(this.generatedDate())} | Lignes : ${(result.data || []).length}</Data></Cell></Row>
      <Row><Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}"><Data ss:Type="String">Totaux : ${this.xml(this.totalsLabel(result))}</Data></Cell></Row>
    </Table>
    <Table>
      <Row>${header}</Row>
      ${body}
    </Table>
  </Worksheet>
</Workbook>`;
  }

  private pdf(result: ReportResult): Buffer {
    const rawRows = (result.data || []) as Array<Record<string, unknown>>;
    const formattedLines = this.formatRowsForReport(result.reportKey, rawRows);
    const linesPerPage = 27;
    const totalPages = Math.max(1, Math.ceil(formattedLines.length / linesPerPage));

    const objects: string[] = [];
    const font1Obj = 3;
    const font2Obj = 4;
    const pageObjStart = 5;

    const pageKids: string[] = [];
    for (let p = 0; p < totalPages; p++) {
      pageKids.push(`${pageObjStart + p * 2} 0 R`);
    }

    // Obj 1: Catalog
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    // Obj 2: Pages
    objects.push(`<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${totalPages} >>`);
    // Obj 3: Font Regular
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    // Obj 4: Font Bold
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    const generatedDate = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa' });

    for (let p = 0; p < totalPages; p++) {
      const pageIndex = p + 1;
      const pageRows = formattedLines.slice(p * linesPerPage, (p + 1) * linesPerPage);
      const contentObjNum = pageObjStart + p * 2 + 1;

      // Page object
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1Obj} 0 R /F2 ${font2Obj} 0 R >> >> /Contents ${contentObjNum} 0 R >>`,
      );

      // Commands
      const cmds: string[] = [];
      // Header Banner
      cmds.push(`BT /F2 13 Tf 40 802 Td (${this.pdfText("VOICI L'HOMME PHARMA")}) Tj ET`);
      cmds.push(`BT /F2 10 Tf 40 784 Td (${this.pdfText(`Rapport : ${this.getReportLabel(result.reportKey)}`)}) Tj ET`);
      cmds.push(
        `BT /F1 8 Tf 40 768 Td (${this.pdfText(`Période : ${this.periodLabel(result)} | Généré le : ${generatedDate} | Enregistrements : ${rawRows.length}`)}) Tj ET`,
      );
      cmds.push(`BT /F1 7 Tf 40 756 Td (${this.pdfText(`Totaux : ${this.totalsLabel(result)}`)}) Tj ET`);
      cmds.push(`BT /F1 8 Tf 480 802 Td (${this.pdfText(`Page ${pageIndex} / ${totalPages}`)}) Tj ET`);

      // Top separator line
      cmds.push('40 748 m 555 748 l S');
      cmds.push(`BT /F2 7 Tf 40 734 Td (${this.pdfText(this.formatHeaderForReport(result.reportKey))}) Tj ET`);

      // Table rows
      let currentY = 718;
      if (pageRows.length === 0) {
        cmds.push(`BT /F1 9 Tf 40 ${currentY} Td (${this.pdfText('Aucun enregistrement trouvé pour cette période.')}) Tj ET`);
      } else {
        for (const line of pageRows) {
          cmds.push(`BT /F1 8 Tf 40 ${currentY} Td (${this.pdfText(line)}) Tj ET`);
          currentY -= 22;
        }
      }

      // Bottom separator line
      cmds.push('40 42 m 555 42 l S');
      cmds.push(`BT /F1 7 Tf 40 28 Td (${this.pdfText('Document confidentiel réservé à l’usage interne de l’officine.')}) Tj ET`);
      cmds.push(`BT /F1 7 Tf 490 28 Td (${this.pdfText(`Page ${pageIndex} / ${totalPages}`)}) Tj ET`);

      const streamContent = cmds.join('\n');
      objects.push(`<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream`);
    }

    let output = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(output, 'latin1'));
      output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
      .join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    return Buffer.from(output, 'latin1');
  }

  private formatHeaderForReport(reportKey: string): string {
    const headers: Record<string, string> = {
      'sales-journal': 'N° facture | Date | Client | Vendeur | Total CDF | Statut',
      'stock-movements': 'Date | Type | Produit | Lot | Quantité | Valeur CDF',
      'stock-entries-exits': 'Date | Type | Produit | Lot | Quantité | Valeur CDF',
      'valued-inventory': 'Produit | DCI | Quantité | CUMP CDF | Valeur CDF',
      expiries: 'Produit | Lot | Péremption | Stock | Valeur à risque',
      expenses: 'Date | Catégorie | Description | Montant CDF / USD',
      'best-sellers': 'Produit | Quantité vendue | Chiffre d’affaires',
      receivables: 'Client | Facture | Solde dû | Retard',
      treasury: 'Devise | Encaissements | Décaissements | Solde net',
      'seller-performance': 'Vendeur | Nombre de ventes | Chiffre d’affaires',
      'low-rotation': 'Produit | Stock | Quantité vendue | Valeur du stock',
    };
    return headers[reportKey] || 'Données du rapport';
  }

  private formatRowsForReport(reportKey: string, rows: Array<Record<string, unknown>>): string[] {
    if (!rows || rows.length === 0) return [];

    switch (reportKey) {
      case 'sales-journal':
        return rows.map((r, i) => {
          const inv = String(r.invoiceNumber || r.id || '').padEnd(16);
          const date = String(r.createdAt || '').slice(0, 16);
          const client = String(r.customer || 'Comptoir').slice(0, 18).padEnd(18);
          const cdf = Number(r.totalAmountCdf || 0).toLocaleString('fr-FR') + ' CDF';
          const stat = String(r.status || 'VALIDE');
          return `${String(i + 1).padStart(3)}. ${inv} | ${date} | ${client} | ${cdf} | ${stat}`;
        });

      case 'stock-movements':
        return rows.map((r, i) => {
          const date = String(r.createdAt || '').slice(0, 16);
          const type = String(r.type || '').padEnd(12);
          const prod = String(r.productName || '').slice(0, 20).padEnd(20);
          const lot = String(r.lotNumber || '—').padEnd(10);
          const qty = String(r.quantity || 0).padStart(5);
          const val = Number(r.valueCdf || 0).toLocaleString('fr-FR') + ' CDF';
          return `${String(i + 1).padStart(3)}. ${date} | ${type} | ${prod} | Lot: ${lot} | Qté: ${qty} | ${val}`;
        });

      case 'valued-inventory':
        return rows.map((r, i) => {
          const prod = String(r.productName || '').slice(0, 24).padEnd(24);
          const dci = String(r.dci || '—').slice(0, 16).padEnd(16);
          const qty = String(r.quantity || 0).padStart(6);
          const cump = Number(r.cumpCdf || 0).toLocaleString('fr-FR') + ' CDF';
          const val = Number(r.valueCdf || 0).toLocaleString('fr-FR') + ' CDF';
          return `${String(i + 1).padStart(3)}. ${prod} | ${dci} | Qté: ${qty} | CUMP: ${cump} | Total: ${val}`;
        });

      case 'expiries':
        return rows.map((r, i) => {
          const prod = String(r.productName || '').slice(0, 24).padEnd(24);
          const lot = String(r.lotNumber || '—').padEnd(10);
          const exp = String(r.expiryDate || '—').slice(0, 10);
          const qty = String(r.quantity || 0).padStart(5);
          const val = Number(r.valueCdf || 0).toLocaleString('fr-FR') + ' CDF';
          return `${String(i + 1).padStart(3)}. ${prod} | Lot: ${lot} | Exp: ${exp} | Qté: ${qty} | Val: ${val}`;
        });

      case 'expenses':
        return rows.map((r, i) => {
          const date = String(r.createdAt || '').slice(0, 10);
          const cat = String(r.category || 'Général').slice(0, 16).padEnd(16);
          const desc = String(r.description || '').slice(0, 24).padEnd(24);
          const cdf = Number(r.amountCdf || 0).toLocaleString('fr-FR') + ' CDF';
          const usd = Number(r.amountUsd || 0).toFixed(2) + ' $';
          return `${String(i + 1).padStart(3)}. ${date} | ${cat} | ${desc} | ${cdf} / ${usd}`;
        });

      case 'best-sellers':
        return rows.map((r, i) => {
          const prod = String(r.productName || '').slice(0, 30).padEnd(30);
          const qty = String(r.quantity || 0).padStart(6);
          const rev = Number(r.revenueCdf || 0).toLocaleString('fr-FR') + ' CDF';
          return `${String(i + 1).padStart(3)}. ${prod} | Qté Vendue: ${qty} | Chiffre d'Affaires: ${rev}`;
        });

      case 'receivables':
        return rows.map((r, i) => {
          const client = String(r.customerName || '').slice(0, 24).padEnd(24);
          const inv = String(r.invoiceNumber || '—').padEnd(14);
          const bal = Number(r.balanceCdf || 0).toLocaleString('fr-FR') + ' CDF';
          const days = String(r.daysOverdue || 0) + ' j';
          return `${String(i + 1).padStart(3)}. ${client} | Fact: ${inv} | Créance: ${bal} | Retard: ${days}`;
        });

      case 'treasury':
        return rows.map((r, i) => {
          const cur = String(r.currency || 'CDF');
          const rec = Number(r.receipts || 0).toLocaleString('fr-FR');
          const exp = Number(r.expenses || 0).toLocaleString('fr-FR');
          const bal = Number(r.balance || 0).toLocaleString('fr-FR');
          return `${String(i + 1).padStart(3)}. Devise: ${cur} | Encaissements: ${rec} | Décaissements: ${exp} | Solde Net: ${bal}`;
        });

      case 'seller-performance':
        return rows.map((r, i) => `${String(i + 1).padStart(3)}. ${String(r.seller || '—').slice(0, 28).padEnd(28)} | Ventes: ${String(r.salesCount || 0).padStart(5)} | CA: ${Number(r.revenueCdf || 0).toLocaleString('fr-FR')} CDF`);

      case 'low-rotation':
        return rows.map((r, i) => `${String(i + 1).padStart(3)}. ${String(r.productName || '—').slice(0, 28).padEnd(28)} | Stock: ${String(r.stockQuantity || 0).padStart(5)} | Vendu: ${String(r.soldQuantity || 0).padStart(5)} | Valeur: ${Number(r.stockValueCdf || 0).toLocaleString('fr-FR')} CDF`);

      default:
        return rows.map((row, i) => {
          const summary = Object.values(row)
            .map((v) => this.scalar(v))
            .filter(Boolean)
            .join(' | ')
            .slice(0, 85);
          return `${String(i + 1).padStart(3)}. ${summary}`;
        });
    }
  }

  private getReportLabel(key: string): string {
    const labels: Record<string, string> = {
      'sales-journal': 'Journal des Ventes',
      'stock-movements': 'Mouvements de Stock',
      'valued-inventory': 'Inventaire Valorisé',
      expiries: 'Péremptions & Alertes',
      expenses: 'Dépenses & Décaissements',
      'best-sellers': 'Top Médicaments Ventes',
      receivables: 'Créances & Recouvrement',
      treasury: 'Position de Trésorerie',
      'seller-performance': 'Performance Vendeurs',
      'low-rotation': 'Faible Rotation & Dormants',
    };
    return labels[key] || key.toUpperCase();
  }

  private scalar(value: unknown): string {
    return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private csvCell(value: unknown): string {
    return `"${this.scalar(value).replace(/"/g, '""')}"`;
  }

  private xml(value: unknown): string {
    return this.scalar(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private pdfText(value: string): string {
    return value
      .replace(/[\r\n]/g, ' ')
      .replace(/[\\()]/g, (character) => `\\${character}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // strip accents for basic Helvetica Font Type 1
  }
}
