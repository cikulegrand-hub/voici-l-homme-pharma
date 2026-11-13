import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from './settings.service';
import * as zlib from 'zlib';

export interface ParsedPdfImage {
  width: number;
  height: number;
  stream: Buffer;
  isJpeg: boolean;
  smask?: Buffer;
}

export interface DocumentHeaderOptions {
  format: 'a4' | 'ticket';
  documentTitle?: string;
  documentSubtitle?: string;
  showCustomHeader?: boolean;
}

export interface DocumentFooterOptions {
  format?: 'a4' | 'ticket';
  customFooter?: string;
  showLegalNotice?: boolean;
}

@Injectable()
export class DocumentHeaderService {
  private readonly logger = new Logger('DocumentHeaderService');

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Retourne l'identité actuelle de l'officine depuis le service de paramétrage.
   */
  getPharmacyIdentity() {
    return this.settingsService.getPharmacyIdentity();
  }

  /**
   * Retourne les modèles d'impression actuels depuis le service de paramétrage.
   */
  getPrintTemplates() {
    return this.settingsService.getPrintTemplates();
  }

  /**
   * Échappe une chaîne pour insertion sûre dans du HTML.
   */
  escapeHtml(text?: string | null): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Génère le bloc HTML d'en-tête standardisé selon le format (A4 ou Ticket 80 mm).
   */
  renderHtmlHeader(options: DocumentHeaderOptions): string {
    const identity = this.settingsService.getPharmacyIdentity();
    const printTemplates = this.settingsService.getPrintTemplates();
    const isTicket = options.format === 'ticket';

    const hasLogo = Boolean(identity.logoUrl && identity.logoUrl.trim().length > 0);
    const pharmacyName = this.escapeHtml(identity.name || "Voici l'Homme Pharma");
    const address = this.escapeHtml(identity.address || '');
    const phone = this.escapeHtml(identity.phone || '');
    const email = this.escapeHtml(identity.email || '');
    const rccm = this.escapeHtml(identity.rccm || '');
    const idNat = this.escapeHtml(identity.idNat || '');
    const nif = this.escapeHtml(identity.nif || (identity as any).taxNumber || '');

    const contactParts = [
      phone ? `Tél : ${phone}` : '',
      email ? `Email : ${email}` : '',
    ].filter(Boolean);

    const legalParts = [
      rccm ? `RCCM : ${rccm}` : '',
      idNat ? `ID.NAT : ${idNat}` : '',
      nif ? `NIF : ${nif}` : '',
    ].filter(Boolean);

    if (isTicket) {
      // FORMAT TICKET 80 MM : logo centré, réduit, noir et blanc si thermique
      const logoHtml = hasLogo
        ? `<div class="vhp-ticket-logo-box" style="text-align: center; margin-bottom: 6px;">
            <img src="${identity.logoUrl}" alt="Logo Officine" style="max-height: 48px; max-width: 130px; object-fit: contain; filter: grayscale(100%) contrast(120%); display: inline-block;" />
           </div>`
        : '';

      const customTicketHeader =
        options.showCustomHeader !== false && printTemplates.ticketHeader
          ? `<div class="vhp-ticket-custom-header" style="font-size: 10px; font-style: italic; margin-top: 4px; text-align: center; border-top: 1px dotted #888; padding-top: 3px;">
              ${this.escapeHtml(printTemplates.ticketHeader).replace(/\n/g, '<br>')}
             </div>`
          : '';

      const docTitleHtml = options.documentTitle
        ? `<div class="vhp-ticket-doc-title" style="font-size: 12px; font-weight: 800; text-align: center; text-transform: uppercase; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #000;">
            ${this.escapeHtml(options.documentTitle)}
            ${options.documentSubtitle ? `<div style="font-size: 10px; font-weight: normal; margin-top: 2px;">${this.escapeHtml(options.documentSubtitle)}</div>` : ''}
           </div>`
        : '';

      return `
        <div class="vhp-document-header vhp-header-ticket" style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          ${logoHtml}
          <div class="vhp-pharmacy-name" style="font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 2px;">${pharmacyName}</div>
          <div class="vhp-header-meta" style="font-size: 10px; color: #111; line-height: 1.3;">
            ${address ? `<div>${address}</div>` : ''}
            ${contactParts.length ? `<div>${contactParts.join(' | ')}</div>` : ''}
            ${legalParts.length ? `<div>${legalParts.join(' | ')}</div>` : ''}
          </div>
          ${customTicketHeader}
          ${docTitleHtml}
        </div>
      `.trim();
    }

    // FORMAT A4 : logo en haut à gauche, informations de la pharmacie à droite
    const leftLogoBlock = hasLogo
      ? `<div class="vhp-header-left" style="flex: 0 0 auto; max-width: 45%; display: flex; align-items: center;">
          <img src="${identity.logoUrl}" alt="${pharmacyName}" style="max-height: 75px; max-width: 220px; object-fit: contain; display: block;" />
         </div>`
      : `<div class="vhp-header-left vhp-logo-fallback" style="flex: 0 0 auto; max-width: 40%; font-size: 15px; font-weight: 800; color: #116149; text-transform: uppercase; letter-spacing: 0.5px;">
          ${pharmacyName}
         </div>`;

    const rightInfoBlock = `
      <div class="vhp-header-right" style="flex: 1 1 auto; text-align: right; padding-left: 20px;">
        <div class="vhp-pharmacy-name" style="font-size: 17px; font-weight: 800; color: #116149; text-transform: uppercase; margin: 0 0 3px; letter-spacing: 0.5px;">${pharmacyName}</div>
        <div class="vhp-pharmacy-subtitle" style="font-size: 10px; color: #4b5563; margin-bottom: 4px;">Officine Pharmaceutique Agréée — République Démocratique du Congo</div>
        <div class="vhp-header-coords" style="font-size: 11px; color: #1f2937; line-height: 1.35;">
          ${address ? `<div>${address}</div>` : ''}
          ${contactParts.length ? `<div>${contactParts.join(' &bull; ')}</div>` : ''}
          ${legalParts.length ? `<div style="color: #4b5563; font-size: 10px; margin-top: 2px;">${legalParts.join(' &bull; ')}</div>` : ''}
        </div>
        ${
          options.documentTitle
            ? `<div class="vhp-doc-badge" style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb;">
                <div style="font-size: 13px; font-weight: 800; color: #111827; text-transform: uppercase;">${this.escapeHtml(options.documentTitle)}</div>
                ${options.documentSubtitle ? `<div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${this.escapeHtml(options.documentSubtitle)}</div>` : ''}
               </div>`
            : ''
        }
      </div>
    `;

    const customInvoiceHeader =
      options.showCustomHeader !== false && printTemplates.invoiceHeader
        ? `<div class="vhp-invoice-custom-header" style="font-size: 12px; font-weight: 600; text-align: center; margin-top: 8px; border-top: 1px solid #116149; padding-top: 4px; color: #116149;">
            ${this.escapeHtml(printTemplates.invoiceHeader).replace(/\n/g, '<br>')}
           </div>`
        : '';

    return `
      <div class="vhp-document-header vhp-header-a4" style="border-bottom: 2px solid #116149; padding-bottom: 10px; margin-bottom: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          ${leftLogoBlock}
          ${rightInfoBlock}
        </div>
        ${customInvoiceHeader}
      </div>
    `.trim();
  }

  /**
   * Génère le pied de page commun standardisé selon le format (A4 ou Ticket).
   */
  renderHtmlFooter(options?: DocumentFooterOptions): string {
    const identity = this.settingsService.getPharmacyIdentity();
    const printTemplates = this.settingsService.getPrintTemplates();
    const isTicket = options?.format === 'ticket';

    const legalNotice = this.escapeHtml(
      identity.legalNotice ||
        (identity as any).invoiceLegalNotice ||
        "Document officiel d'officine établi selon les dispositions réglementaires du Ministère de la Santé Publique et de la DGI / RDC.",
    );

    const footerText = this.escapeHtml(
      options?.customFooter ||
        (isTicket ? printTemplates.ticketFooter : printTemplates.invoiceFooter) ||
        identity.invoiceFooter ||
        (identity as any).receiptFooterText ||
        'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.',
    );

    if (isTicket) {
      return `
        <div class="vhp-document-footer vhp-footer-ticket" style="font-size: 9px; color: #333; text-align: center; margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="font-weight: 700; margin-bottom: 3px;">${footerText}</div>
          <div style="font-size: 8px; color: #666;">${legalNotice}</div>
        </div>
      `.trim();
    }

    return `
      <div class="vhp-document-footer vhp-footer-a4" style="font-size: 9px; color: #4b5563; text-align: center; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="font-weight: 600; margin-bottom: 3px; color: #111;">${footerText}</div>
        <div style="font-size: 8.5pt; color: #6b7280; line-height: 1.4;">${legalNotice}</div>
      </div>
    `.trim();
  }

  /**
   * Parse un logo ou une image (Buffer JPEG ou PNG) pour insertion PDF native sans dépendance externe.
   */
  parseBufferForPdf(buf?: Buffer | null): ParsedPdfImage | null {
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 8) return null;

    // 1. JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let pos = 2;
      while (pos < buf.length - 8) {
        if (buf[pos] !== 0xff) {
          pos++;
          continue;
        }
        const marker = buf[pos + 1];
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buf.readUInt16BE(pos + 5);
          const width = buf.readUInt16BE(pos + 7);
          if (width > 0 && height > 0) {
            return { width, height, stream: buf, isJpeg: true };
          }
        }
        const len = buf.readUInt16BE(pos + 2);
        pos += 2 + len;
      }
      return null;
    }

    // 2. PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      try {
        let pos = 8;
        let width = 0;
        let height = 0;
        let colorType = 0;
        const idats: Buffer[] = [];
        while (pos < buf.length) {
          const len = buf.readUInt32BE(pos);
          const type = buf.slice(pos + 4, pos + 8).toString('ascii');
          if (type === 'IHDR') {
            width = buf.readUInt32BE(pos + 8);
            height = buf.readUInt32BE(pos + 12);
            colorType = buf[pos + 17];
          } else if (type === 'IDAT') {
            idats.push(buf.slice(pos + 8, pos + 8 + len));
          }
          pos += 12 + len;
        }
        if (!width || !height || idats.length === 0) return null;
        const inflated = zlib.inflateSync(Buffer.concat(idats));
        const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
        if (!bpp) return null;

        const bytesPerLine = width * bpp;
        const raw = Buffer.alloc(width * height * bpp);
        let srcPos = 0;
        for (let y = 0; y < height; y++) {
          const filter = inflated[srcPos++];
          const lineStart = y * bytesPerLine;
          const prevLineStart = (y - 1) * bytesPerLine;
          for (let x = 0; x < bytesPerLine; x++) {
            const left = x >= bpp ? raw[lineStart + x - bpp] : 0;
            const up = y > 0 ? raw[prevLineStart + x] : 0;
            const upLeft = y > 0 && x >= bpp ? raw[prevLineStart + x - bpp] : 0;
            let val = inflated[srcPos++];
            if (filter === 1) val = (val + left) & 0xff;
            else if (filter === 2) val = (val + up) & 0xff;
            else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 0xff;
            else if (filter === 4) {
              const p = left + up - upLeft;
              const pa = Math.abs(p - left);
              const pb = Math.abs(p - up);
              const pc = Math.abs(p - upLeft);
              let pr = upLeft;
              if (pa <= pb && pa <= pc) pr = left;
              else if (pb <= pc) pr = up;
              val = (val + pr) & 0xff;
            }
            raw[lineStart + x] = val;
          }
        }

        if (colorType === 6) {
          const rgb = Buffer.alloc(width * height * 3);
          const alpha = Buffer.alloc(width * height);
          for (let i = 0, j = 0; i < width * height; i++) {
            rgb[j++] = raw[i * 4];
            rgb[j++] = raw[i * 4 + 1];
            rgb[j++] = raw[i * 4 + 2];
            alpha[i] = raw[i * 4 + 3];
          }
          return {
            width,
            height,
            stream: zlib.deflateSync(rgb),
            isJpeg: false,
            smask: zlib.deflateSync(alpha),
          };
        }

        return {
          width,
          height,
          stream: zlib.deflateSync(raw),
          isJpeg: false,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Parse un logo (base64 data URL JPEG ou PNG) pour insertion PDF native sans dépendance externe.
   */
  parseImageForPdf(dataUrl?: string): ParsedPdfImage | null {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return null;
    }
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return null;

    try {
      const buf = Buffer.from(match[2], 'base64');
      return this.parseBufferForPdf(buf);
    } catch {
      return null;
    }
  }

  /**
   * Nettoie et échappe une chaîne pour WinAnsiEncoding dans un flux PDF.
   */
  sanitizeForWinAnsi(text: string): string {
    const map: Record<string, string> = {
      é: '\xE9',
      è: '\xE8',
      ê: '\xEA',
      ë: '\xEB',
      à: '\xE0',
      â: '\xE2',
      ä: '\xE4',
      î: '\xEE',
      ï: '\xEF',
      ô: '\xF4',
      ö: '\xF6',
      ù: '\xF9',
      û: '\xFB',
      ü: '\xFC',
      ç: '\xE7',
      É: '\xC9',
      È: '\xC8',
      Ê: '\xCA',
      Ë: '\xCB',
      À: '\xC0',
      Â: '\xC2',
      Ä: '\xC4',
      Î: '\xCE',
      Ï: '\xCF',
      Ô: '\xD4',
      Ö: '\xD6',
      Ù: '\xD9',
      Û: '\xDB',
      Ü: '\xDC',
      Ç: '\xC7',
      '’': '\x27',
      '‘': '\x27',
      '“': '\x22',
      '”': '\x22',
      '«': '\xAB',
      '»': '\xBB',
      '–': '-',
      '—': '-',
      '°': '\xB0',
    };
    let out = '';
    for (const ch of String(text || '')) {
      if (map[ch]) out += map[ch];
      else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) out += ch;
      else out += '?';
    }
    return out.replace(/[()\\]/g, '\\$&');
  }

  /**
   * Retourne les objets PDF XObject pour un logo donné.
   */
  createPdfImageObjects(img: ParsedPdfImage, imgObjNum: number, smaskObjNum?: number): string[] {
    const objects: string[] = [];
    const smaskRef = img.smask && smaskObjNum ? ` /SMask ${smaskObjNum} 0 R` : '';
    const filter = img.isJpeg ? '/Filter /DCTDecode' : '/Filter /FlateDecode';

    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${filter}${smaskRef} /Length ${img.stream.length} >>\nstream\n${img.stream.toString('binary')}\nendstream`,
    );

    if (img.smask) {
      objects.push(
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.smask.length} >>\nstream\n${img.smask.toString('binary')}\nendstream`,
      );
    }

    return objects;
  }
}

