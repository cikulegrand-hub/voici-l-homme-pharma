import { Injectable, inject, signal } from '@angular/core';
import { SettingsApiService } from '../api/services/settings-api.service';
import { PharmacyIdentity, PrintTemplates } from '@vhp/shared';

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

@Injectable({
  providedIn: 'root',
})
export class DocumentHeaderService {
  private readonly settingsApi = inject(SettingsApiService);

  private readonly defaultIdentity: PharmacyIdentity = {
    name: "Voici l'Homme Pharma",
    address: "Av. de l'Église, Q. Résidentiel, Commune de Limete, Kinshasa, RDC",
    phone: '+243 81 234 56 78',
    email: 'contact@voicilhommepharma.cd',
    rccm: 'CD/KIN/RCCM/14-B-2345',
    idNat: '01-83-N12345P',
    nif: 'A0912345B',
    legalNotice:
      "Facture officielle d'officine établie selon les dispositions du Ministère de la Santé Publique et de la DGI / RDC.",
    invoiceFooter:
      'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.',
  };

  private readonly defaultPrintTemplates: PrintTemplates = {
    ticketHeader: "PHARMACIE VOICI L'HOMME\nKinshasa - Limete\nTél : +243 81 234 56 78",
    ticketFooter: 'Merci pour votre confiance. Bon rétablissement !',
    showLogoOnTicket: true,
    invoiceHeader: "Facture d'achat - Client Officine",
    invoiceFooter: 'Merci pour votre confiance.',
    showLogoOnInvoice: true,
  };

  readonly identity = signal<PharmacyIdentity>(this.defaultIdentity);
  readonly printTemplates = signal<PrintTemplates>(this.defaultPrintTemplates);

  constructor() {
    this.refreshSettings();
  }

  /**
   * Recharge les paramètres d'identité et modèles d'impression depuis le serveur.
   */
  refreshSettings(): void {
    this.settingsApi.getSettings().subscribe({
      next: (res) => {
        if (res.identity) {
          this.identity.set({ ...this.defaultIdentity, ...res.identity });
        }
        if (res.printTemplates) {
          this.printTemplates.set({ ...this.defaultPrintTemplates, ...res.printTemplates });
        }
      },
      error: () => {
        // En cas d'erreur ou offline, tente au moins de récupérer l'identité
        this.settingsApi.getIdentity().subscribe({
          next: (id) => this.identity.set({ ...this.defaultIdentity, ...id }),
          error: () => {
            // Conserve les valeurs par défaut
          },
        });
      },
    });
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
    const identity = this.identity();
    const printTemplates = this.printTemplates();
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
      // FORMAT TICKET 80 MM : logo centré, réduit, noir et blanc thermique
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
    const identity = this.identity();
    const printTemplates = this.printTemplates();
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
   * Utilitaire d'impression pour document HTML dans un iframe masqué.
   */
  printHtml(htmlContent: string, title = 'Impression'): void {
    let iframe = document.getElementById('vhp-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'vhp-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        const win = window.open('', '_blank');
        if (win) {
          win.document.open();
          win.document.write(htmlContent);
          win.document.close();
          win.focus();
          win.print();
        }
      }
    }, 250);
  }
}
