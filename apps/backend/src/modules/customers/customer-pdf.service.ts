import { Injectable } from '@nestjs/common';
import { DocumentHeaderService, ParsedPdfImage } from '../settings/document-header.service';
import { PrescriptionStorageService } from './prescription-storage.service';

export interface CustomerPdfOptions {
  includeHistory?: boolean;
  editorName: string;
  prescriptions?: any[];
  history?: {
    purchases?: Array<{
      id: string;
      invoiceNumber: string;
      date: string | Date;
      totalCdf: number;
      items: Array<{
        productName: string;
        dci?: string;
        quantity: number;
      }>;
    }>;
  };
}

@Injectable()
export class CustomerPdfService {
  constructor(
    private readonly documentHeaderService: DocumentHeaderService,
    private readonly storage: PrescriptionStorageService,
  ) {}

  async generateCustomerPdf(customer: any, options: CustomerPdfOptions): Promise<{ buffer: Buffer; filename: string }> {
    const identity = this.documentHeaderService.getPharmacyIdentity();
    const logoImg = this.documentHeaderService.parseImageForPdf(identity.logoUrl);

    // Charger la photo du client depuis le stockage persistant si disponible
    let photoImg: ParsedPdfImage | null = null;
    if (customer.photo_profil_path) {
      try {
        const photoBuf = await this.storage.readLocal(customer.photo_profil_path);
        if (photoBuf) {
          photoImg = this.documentHeaderService.parseBufferForPdf(photoBuf);
        }
      } catch {
        // En cas d'erreur de lecture de la photo, on bascule sur la silhouette
        photoImg = null;
      }
    }

    const includeHistory = Boolean(options.includeHistory);
    const hasHistoryContent = includeHistory && (
      (options.prescriptions && options.prescriptions.length > 0) ||
      (options.history?.purchases && options.history.purchases.length > 0)
    );

    // Calcul du nombre de pages (1 page principale + 1 page optionnelle d'historique si nécessaire)
    const totalPages = hasHistoryContent ? 2 : 1;

    const objects: string[] = [];
    const fontRegular = 3;
    const fontBold = 4;
    const fontOblique = 5;
    const pageObjStart = 6;

    let nextObjNum = pageObjStart + totalPages * 2;

    // Numéros d'objets pour le logo
    let logoObjNum: number | undefined;
    let logoSmaskObjNum: number | undefined;
    if (logoImg) {
      logoObjNum = nextObjNum++;
      if (logoImg.smask) {
        logoSmaskObjNum = nextObjNum++;
      }
    }

    // Numéros d'objets pour la photo client
    let photoObjNum: number | undefined;
    let photoSmaskObjNum: number | undefined;
    if (photoImg) {
      photoObjNum = nextObjNum++;
      if (photoImg.smask) {
        photoSmaskObjNum = nextObjNum++;
      }
    }

    // Déclaration des XObjects dans les ressources PDF
    let xobjRes = '';
    if (logoImg && logoObjNum) {
      xobjRes += ` /ImLogo ${logoObjNum} 0 R`;
    }
    if (photoImg && photoObjNum) {
      xobjRes += ` /ImPhoto ${photoObjNum} 0 R`;
    }
    const resourcesString = `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontOblique} 0 R >>${xobjRes ? ` /XObject <<${xobjRes} >>` : ''} >>`;

    const pageKids: string[] = [];
    for (let p = 0; p < totalPages; p++) {
      pageKids.push(`${pageObjStart + p * 2} 0 R`);
    }

    // 1: Catalog
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    // 2: Pages
    objects.push(`<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${totalPages} >>`);
    // 3: Font Regular (Helvetica avec encodage standard)
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    // 4: Font Bold
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    // 5: Font Oblique
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

    const generatedDate = new Date().toLocaleString('fr-FR', {
      timeZone: 'Africa/Kinshasa',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // ── PAGE 1 : IDENTITÉ, DONNÉES CLINIQUES & STATUT ──
    {
      const contentObjNum = pageObjStart + 1;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${resourcesString} /Contents ${contentObjNum} 0 R >>`);

      const cmds: string[] = [];

      // En-tête partagé
      this.renderPdfHeader(cmds, identity, logoImg);

      // Titre du document
      cmds.push('0.067 0.380 0.286 rg'); // #116149 vert officiel VHP
      cmds.push(`BT /F2 15 Tf 40 730 Td (${this.pdfText('FICHE CLIENT')}) Tj ET`);
      cmds.push('0.2 0.2 0.2 rg');
      cmds.push(`BT /F1 8.5 Tf 40 718 Td (${this.pdfText(`Édition : ${generatedDate} | Réf. : ${customer.client_number || customer.code || 'CLI-000000'}`)}) Tj ET`);

      // ── CADRE PHOTO DU CLIENT (Haut-Droit) ──
      const photoBoxX = 465;
      const photoBoxY = 625;
      const photoBoxW = 90;
      const photoBoxH = 105;

      // Fond et bordure du cadre photo
      cmds.push('q');
      cmds.push('0.96 0.97 0.98 rg'); // fond gris très clair
      cmds.push('0.7 0.75 0.75 RG'); // bordure
      cmds.push('0.8 w');
      cmds.push(`${photoBoxX} ${photoBoxY} ${photoBoxW} ${photoBoxH} re B`);
      cmds.push('Q');

      if (photoImg && photoObjNum) {
        // Rendu de la photo réelle redimensionnée en conservant l'aspect ratio
        let dispW = photoBoxW - 4;
        let dispH = dispW / (photoImg.width / photoImg.height);
        if (dispH > photoBoxH - 4) {
          dispH = photoBoxH - 4;
          dispW = dispH * (photoImg.width / photoImg.height);
        }
        const imgX = photoBoxX + (photoBoxW - dispW) / 2;
        const imgY = photoBoxY + (photoBoxH - dispH) / 2;

        cmds.push('q');
        cmds.push(`${dispW.toFixed(2)} 0 0 ${dispH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm`);
        cmds.push('/ImPhoto Do');
        cmds.push('Q');
      } else {
        // Silhouette humaine par défaut stylisée en vectoriel
        cmds.push('q');
        cmds.push('0.75 0.78 0.8 rg');
        // Tête (cercle approché par rectangle/arc)
        const headCenterX = photoBoxX + photoBoxW / 2;
        const headCenterY = photoBoxY + 65;
        const headR = 15;
        cmds.push(`${(headCenterX - headR).toFixed(1)} ${(headCenterY - headR).toFixed(1)} ${(headR * 2).toFixed(1)} ${(headR * 2).toFixed(1)} re f`);
        // Épaules / Buste
        const bustX = photoBoxX + 18;
        const bustY = photoBoxY + 15;
        const bustW = photoBoxW - 36;
        const bustH = 28;
        cmds.push(`${bustX} ${bustY} ${bustW} ${bustH} re f`);
        // Libellé "Sans photo"
        cmds.push('0.5 0.5 0.5 rg');
        cmds.push(`BT /F3 7 Tf ${(photoBoxX + 22).toFixed(1)} ${(photoBoxY + 6).toFixed(1)} Td (${this.pdfText('Aucune photo')}) Tj ET`);
        cmds.push('Q');
      }

      // ── TYPE DE CLIENT & BADGE ──
      const typeLabel = customer.customer_type === 'ASSURANCE'
        ? 'CLIENT ASSURANCE / MUTUELLE'
        : customer.customer_type === 'ENTREPRISE'
        ? 'CLIENT ENTREPRISE CONVENTIONNÉE'
        : 'CLIENT PARTICULIER';

      cmds.push('q');
      cmds.push('0.93 0.96 0.95 rg'); // fond vert menthe très doux
      cmds.push('0.067 0.380 0.286 RG');
      cmds.push('0.6 w');
      cmds.push('40 690 300 18 re B');
      cmds.push('0.067 0.380 0.286 rg');
      cmds.push(`BT /F2 9 Tf 48 695 Td (${this.pdfText(typeLabel)}) Tj ET`);
      cmds.push('Q');

      // ── SECTION 1 : ÉTAT CIVIL & COORDONNÉES ──
      let curY = 670;
      this.renderSectionTitle(cmds, 40, curY, 410, '1. ÉTAT CIVIL & COORDONNÉES');
      curY -= 16;

      const fullName = customer.full_name || [customer.nom, customer.postnom, customer.prenom].filter(Boolean).join(' ') || 'Non renseigné';
      const sexe = customer.sexe === 'M' ? 'Masculin' : customer.sexe === 'F' ? 'Féminin' : 'Non précisé';
      const birthFormatted = customer.date_naissance
        ? `${new Date(customer.date_naissance).toLocaleDateString('fr-FR')} (${this.getCalculatedAge(customer.date_naissance)})`
        : 'Non renseignée';
      const nationalite = customer.nationalite || 'Congolaise (RDC)';

      const phonePrincipal = customer.telephone_principal || customer.phone || 'Non renseigné';
      const phoneSecondaire = customer.telephone_secondaire || '—';
      const email = customer.email || '—';

      const docIdentite = customer.identity_documents?.[0];
      const pieceIdentite = docIdentite
        ? `${docIdentite.document_type || 'Pièce'} : ${docIdentite.document_number}${docIdentite.expiration_date ? ` (Exp. ${new Date(docIdentite.expiration_date).toLocaleDateString('fr-FR')})` : ''}`
        : 'Aucune pièce enregistrée';

      const addr = customer.customer_addresses?.[0];
      const adresseText = addr
        ? [
            addr.numero_parcelle ? `N° ${addr.numero_parcelle}` : '',
            addr.avenue_rue ? `Av. ${addr.avenue_rue}` : '',
            addr.quartier ? `Q. ${addr.quartier}` : '',
            addr.commune ? `C. ${addr.commune}` : '',
            addr.ville || 'Kinshasa',
            addr.province ? `(${addr.province})` : '',
          ].filter(Boolean).join(', ')
        : (customer.address || 'Aucune adresse renseignée');

      this.renderKeyValue(cmds, 45, curY, 'Nom complet :', fullName, 220);
      this.renderKeyValue(cmds, 260, curY, 'Genre / Sexe :', sexe, 180);
      curY -= 14;

      this.renderKeyValue(cmds, 45, curY, 'Date de naissance :', birthFormatted, 220);
      this.renderKeyValue(cmds, 260, curY, 'Nationalité :', nationalite, 180);
      curY -= 14;

      this.renderKeyValue(cmds, 45, curY, 'Téléphone principal :', phonePrincipal, 220);
      this.renderKeyValue(cmds, 260, curY, 'Téléphone second. :', phoneSecondaire, 180);
      curY -= 14;

      this.renderKeyValue(cmds, 45, curY, 'Courriel :', email, 220);
      this.renderKeyValue(cmds, 260, curY, 'Pièce d’identité :', pieceIdentite, 280);
      curY -= 14;

      this.renderKeyValue(cmds, 45, curY, 'Adresse complète :', adresseText, 490);
      curY -= 20;

      // ── SECTION 2 : SPÉCIFICITÉS SELON TYPE (ASSURANCE / ENTREPRISE) ──
      if (customer.customer_type === 'ASSURANCE') {
        const cov = customer.insurance_coverages?.[0];
        const insurerName = cov?.insurers?.name || customer.company_name || 'Organisme non renseigné';
        const cardNum = cov?.insured_card_number || '—';
        const policyNum = cov?.policy_number || '—';
        const rate = cov?.coverage_rate ? `${cov.coverage_rate} %` : '—';
        const status = cov?.insured_status || 'ASSURÉ PRINCIPAL';
        const validity = cov?.end_date ? `Valide jusqu'au ${new Date(cov.end_date).toLocaleDateString('fr-FR')}` : 'Permanente / En cours';

        this.renderSectionTitle(cmds, 40, curY, 515, '2. PRISE EN CHARGE ASSURANCE & MUTUELLE');
        curY -= 16;

        this.renderKeyValue(cmds, 45, curY, 'Assureur / Mutuelle :', insurerName, 240);
        this.renderKeyValue(cmds, 290, curY, 'N° Carte / Assuré :', cardNum, 220);
        curY -= 14;

        this.renderKeyValue(cmds, 45, curY, 'Taux de couverture :', rate, 240);
        this.renderKeyValue(cmds, 290, curY, 'N° Police / Contrat :', policyNum, 220);
        curY -= 14;

        this.renderKeyValue(cmds, 45, curY, 'Statut de l’assuré :', status, 240);
        this.renderKeyValue(cmds, 290, curY, 'Validité prise en charge :', validity, 220);
        curY -= 20;
      } else if (customer.customer_type === 'ENTREPRISE') {
        const ent = customer.enterprise_details;
        const legalName = ent?.legal_name || customer.company_name || fullName;
        const rccm = ent?.rccm || '—';
        const idNat = ent?.national_id || '—';
        const nif = ent?.tax_id || '—';
        const repName = ent?.representative_name || '—';
        const repPhone = ent?.representative_phone || '—';

        this.renderSectionTitle(cmds, 40, curY, 515, '2. IDENTIFICATION LÉGALE DE L’ENTREPRISE');
        curY -= 16;

        this.renderKeyValue(cmds, 45, curY, 'Raison Sociale :', legalName, 240);
        this.renderKeyValue(cmds, 290, curY, 'RCCM :', rccm, 220);
        curY -= 14;

        this.renderKeyValue(cmds, 45, curY, 'Id. Nationale :', idNat, 240);
        this.renderKeyValue(cmds, 290, curY, 'N° Impôt (NIF) :', nif, 220);
        curY -= 14;

        this.renderKeyValue(cmds, 45, curY, 'Représentant :', repName, 240);
        this.renderKeyValue(cmds, 290, curY, 'Tél. Représentant :', repPhone, 220);
        curY -= 20;
      }

      // ── SECTION 3 : SANTÉ, ALLERGIES & PHARMACOVIGILANCE ──
      this.renderSectionTitle(cmds, 40, curY, 515, '3. SANTÉ & PHARMACOVIGILANCE (SÉCURITÉ DU PATIENT)');
      curY -= 16;

      const medNotes = customer.medical_notes || '';
      const allergiesMatch = medNotes.match(/Allergies:\s*([^|]+)/i);
      const allergiesText = allergiesMatch ? allergiesMatch[1].trim() : '';

      const chronicMatch = medNotes.match(/Pathologies chroniques:\s*([^|]+)/i);
      const chronicText = chronicMatch ? chronicMatch[1].trim() : '';

      const bloodMatch = medNotes.match(/Groupe sanguin:\s*([^|]+)/i);
      const bloodText = bloodMatch ? bloodMatch[1].trim() : '';

      if (allergiesText) {
        // Alerte visuelle pour allergies
        cmds.push('q');
        cmds.push('1.0 0.96 0.9 rg'); // fond ambré clair
        cmds.push('0.85 0.5 0.1 RG'); // bordure orange
        cmds.push('0.8 w');
        cmds.push(`45 ${(curY - 14).toFixed(1)} 505 18 re B`);
        cmds.push('0.7 0.25 0.0 rg');
        cmds.push(`BT /F2 8.5 Tf 52 ${(curY - 9).toFixed(1)} Td (${this.pdfText(`ALLERGIES CONNUES : ${allergiesText}`)}) Tj ET`);
        cmds.push('Q');
        curY -= 22;
      }

      this.renderKeyValue(cmds, 45, curY, 'Groupe sanguin :', bloodText || 'Non déterminé', 220);
      this.renderKeyValue(cmds, 260, curY, 'Terrain chronique :', chronicText || 'Aucune pathologie chronique signalée', 280);
      curY -= 14;

      const cleanNotes = medNotes
        .replace(/Groupe sanguin:\s*[^|]+\|?/i, '')
        .replace(/Allergies:\s*[^|]+\|?/i, '')
        .replace(/Pathologies chroniques:\s*[^|]+\|?/i, '')
        .replace(/État physiologique:\s*[^|]+\|?/i, '')
        .trim();

      this.renderKeyValue(cmds, 45, curY, 'Observations & Notes :', cleanNotes || 'Aucune note particulière.', 490);
      curY -= 20;

      // ── SECTION 4 : SITUATION FINANCIÈRE & CRÉANCES ──
      this.renderSectionTitle(cmds, 40, curY, 515, '4. SITUATION COMPTABLE & CRÉDITS COMPTOIR');
      curY -= 16;

      const creditLimit = Number(customer.credit_limit_cdf || 0);
      const balance = Number(customer.calculated_balance ?? customer.current_balance_cdf ?? 0);

      this.renderKeyValue(cmds, 45, curY, 'Plafond autorisé :', `${creditLimit.toLocaleString('fr-FR')} CDF`, 220);
      this.renderKeyValue(cmds, 260, curY, 'Solde dû actuel :', `${balance.toLocaleString('fr-FR')} CDF`, 220);
      curY -= 14;

      const statutPaiement = balance <= 0 ? 'Compte en règle (aucun impayé)' : `Créance en cours de ${balance.toLocaleString('fr-FR')} CDF`;
      this.renderKeyValue(cmds, 45, curY, 'État du compte :', statutPaiement, 490);
      curY -= 22;

      // ── CONTACTS D'URGENCE ──
      const contacts = customer.customer_contacts || [];
      if (contacts.length > 0) {
        this.renderSectionTitle(cmds, 40, curY, 515, '5. PERSONNES DE CONTACT / PROCHES');
        curY -= 16;
        for (const ct of contacts.slice(0, 2)) {
          const ctLabel = `${ct.name}${ct.relationship ? ` (${ct.relationship})` : ''}`;
          this.renderKeyValue(cmds, 45, curY, 'Contact :', ctLabel, 240);
          this.renderKeyValue(cmds, 290, curY, 'Tél. :', ct.phone, 220);
          curY -= 14;
        }
      }

      // Pied de page page 1
      this.renderPdfFooter(cmds, 1, totalPages, options.editorName, identity.legalNotice);

      const streamContent = cmds.join('\n');
      objects.push(`<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream`);
    }

    // ── PAGE 2 OPTIONNELLE : DERNIÈRES ORDONNANCES ET DERNIERS ACHATS ──
    if (totalPages === 2) {
      const contentObjNum = pageObjStart + 3;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${resourcesString} /Contents ${contentObjNum} 0 R >>`);

      const cmds: string[] = [];

      // En-tête simplifié sur la page 2
      cmds.push('BT /F2 10 Tf 40 805 Td (' + this.pdfText((identity.name || "VOICI L'HOMME PHARMA") + ' — Fiche Client') + ') Tj ET');
      cmds.push('BT /F1 8 Tf 40 793 Td (' + this.pdfText(`Client : ${customer.full_name || customer.code} | Historique détaillé au ${generatedDate}`) + ') Tj ET');
      cmds.push('40 785 m 555 785 l S');

      let curY = 765;

      // ── HISTORIQUE DES DERNIÈRES ORDONNANCES ──
      this.renderSectionTitle(cmds, 40, curY, 515, 'HISTORIQUE DES DERNIÈRES ORDONNANCES MÉDICALES');
      curY -= 16;

      const prescriptions = options.prescriptions || [];
      if (prescriptions.length === 0) {
        cmds.push(`BT /F3 8.5 Tf 45 ${curY} Td (${this.pdfText('Aucune ordonnance archivée pour ce client.')}) Tj ET`);
        curY -= 18;
      } else {
        // En-tête de tableau ordonnances
        cmds.push('q 0.95 0.95 0.95 rg 40 ' + (curY - 12) + ' 515 14 re f Q');
        cmds.push('BT /F2 7.5 Tf 45 ' + (curY - 8) + ' Td (Date | Prescripteur | Centre hospitalier | Posologie / Mention) Tj ET');
        curY -= 16;

        for (const p of prescriptions.slice(0, 8)) {
          const pDate = p.prescriptionDate ? new Date(p.prescriptionDate).toLocaleDateString('fr-FR') : '—';
          const pDoc = (p.prescriberName || 'Médecin').slice(0, 20);
          const pCenter = (p.healthCenter || '—').slice(0, 22);
          const pText = (p.prescriptionText || 'Prescription validée').slice(0, 45);

          cmds.push(`BT /F1 8 Tf 45 ${curY} Td (${this.pdfText(`${pDate} | Dr ${pDoc} | ${pCenter} | ${pText}`)}) Tj ET`);
          curY -= 14;
        }
        curY -= 10;
      }

      // ── HISTORIQUE DES DERNIERS ACHATS AU COMPTOIR (SANS MONTANTS INTERNES SENSIBLES) ──
      this.renderSectionTitle(cmds, 40, curY, 515, 'HISTORIQUE DES DERNIERS ACHATS & DÉLIVRANCES');
      curY -= 16;

      const purchases = options.history?.purchases || [];
      if (purchases.length === 0) {
        cmds.push(`BT /F3 8.5 Tf 45 ${curY} Td (${this.pdfText('Aucun achat récent répertorié.')}) Tj ET`);
        curY -= 18;
      } else {
        // En-tête de tableau achats
        cmds.push('q 0.95 0.95 0.95 rg 40 ' + (curY - 12) + ' 515 14 re f Q');
        cmds.push('BT /F2 7.5 Tf 45 ' + (curY - 8) + ' Td (Date | N° Facture | Médicaments délivrés | Total facturé) Tj ET');
        curY -= 16;

        for (const sale of purchases.slice(0, 10)) {
          const sDate = sale.date ? new Date(sale.date).toLocaleDateString('fr-FR') : '—';
          const sInv = sale.invoiceNumber || 'Facture';
          const itemsSummary = (sale.items || [])
            .map((it) => `${it.productName}${it.quantity > 1 ? ` (x${it.quantity})` : ''}`)
            .join(', ')
            .slice(0, 48) || 'Produits pharmaceutiques';
          const sTotal = `${Number(sale.totalCdf || 0).toLocaleString('fr-FR')} CDF`;

          cmds.push(`BT /F1 8 Tf 45 ${curY} Td (${this.pdfText(`${sDate} | ${sInv} | ${itemsSummary} | ${sTotal}`)}) Tj ET`);
          curY -= 14;
        }
      }

      // Pied de page page 2
      this.renderPdfFooter(cmds, 2, totalPages, options.editorName, identity.legalNotice);

      const streamContent = cmds.join('\n');
      objects.push(`<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream`);
    }

    // Objets d'images (Logo)
    if (logoImg && logoObjNum) {
      const imgObjs = this.documentHeaderService.createPdfImageObjects(logoImg, logoObjNum, logoSmaskObjNum);
      objects.push(...imgObjs);
    }

    // Objets d'images (Photo client)
    if (photoImg && photoObjNum) {
      const imgObjs = this.documentHeaderService.createPdfImageObjects(photoImg, photoObjNum, photoSmaskObjNum);
      objects.push(...imgObjs);
    }

    // Assemblage final du fichier PDF 1.4
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

    // Nom de fichier normalisé : Fiche-client_NOM-Prenom_AAAA-MM-JJ.pdf
    const clientNameNorm = (customer.full_name || `${customer.nom || ''}-${customer.prenom || ''}` || 'Client')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const dateIso = new Date().toISOString().slice(0, 10);
    const filename = `Fiche-client_${clientNameNorm || 'Client'}_${dateIso}.pdf`;

    return {
      buffer: Buffer.from(output, 'latin1'),
      filename,
    };
  }

  private renderPdfHeader(cmds: string[], identity: any, logoImg: ParsedPdfImage | null) {
    const pharmacyName = identity.name || "VOICI L'HOMME PHARMA";
    const address = identity.address || 'Kinshasa, République Démocratique du Congo';
    const phone = identity.phone ? `Tél. : ${identity.phone}` : '';
    const email = identity.email ? `Email : ${identity.email}` : '';
    const contacts = [phone, email].filter(Boolean).join(' | ');

    if (logoImg) {
      let dispW = Math.min(90, logoImg.width);
      let dispH = dispW / (logoImg.width / logoImg.height);
      if (dispH > 42) {
        dispH = 42;
        dispW = dispH * (logoImg.width / logoImg.height);
      }
      const imgX = 40;
      const imgY = 820 - dispH;
      cmds.push('q');
      cmds.push(`${dispW.toFixed(2)} 0 0 ${dispH.toFixed(2)} ${imgX.toFixed(2)} ${imgY.toFixed(2)} cm`);
      cmds.push('/ImLogo Do');
      cmds.push('Q');

      const textX = 40 + Math.ceil(dispW) + 14;
      cmds.push('0.067 0.380 0.286 rg'); // #116149
      cmds.push(`BT /F2 13 Tf ${textX} 805 Td (${this.pdfText(pharmacyName)}) Tj ET`);
      cmds.push('0.3 0.3 0.3 rg');
      cmds.push(`BT /F1 8 Tf ${textX} 792 Td (${this.pdfText(address)}) Tj ET`);
      if (contacts) {
        cmds.push(`BT /F1 7.5 Tf ${textX} 780 Td (${this.pdfText(contacts)}) Tj ET`);
      }
    } else {
      cmds.push('0.067 0.380 0.286 rg');
      cmds.push(`BT /F2 13 Tf 40 805 Td (${this.pdfText(pharmacyName)}) Tj ET`);
      cmds.push('0.3 0.3 0.3 rg');
      cmds.push(`BT /F1 8 Tf 40 792 Td (${this.pdfText(address)}) Tj ET`);
      if (contacts) {
        cmds.push(`BT /F1 7.5 Tf 40 780 Td (${this.pdfText(contacts)}) Tj ET`);
      }
    }

    // Ligne séparatrice sous l'en-tête
    cmds.push('0.85 0.85 0.85 RG');
    cmds.push('0.8 w');
    cmds.push('40 762 m 555 762 l S');
  }

  private renderSectionTitle(cmds: string[], x: number, y: number, w: number, title: string) {
    cmds.push('q');
    cmds.push('0.95 0.96 0.97 rg'); // fond gris/bleuté léger
    cmds.push(`${x} ${y - 4} ${w} 14 re f`);
    cmds.push('0.067 0.380 0.286 rg'); // texte vert officiel
    cmds.push(`BT /F2 8.5 Tf ${x + 6} ${y} Td (${this.pdfText(title)}) Tj ET`);
    cmds.push('Q');
  }

  private renderKeyValue(cmds: string[], x: number, y: number, key: string, value: string, maxValWidth: number) {
    cmds.push('0.25 0.25 0.25 rg');
    cmds.push(`BT /F2 8 Tf ${x} ${y} Td (${this.pdfText(key)}) Tj ET`);

    // Décalage dynamique selon la longueur de la clé
    const keyOffset = Math.max(90, key.length * 4.8);
    const valX = x + keyOffset;
    const maxChars = Math.floor(maxValWidth / 4.5);
    const safeValue = value && value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : (value || '—');

    cmds.push('0.1 0.1 0.1 rg');
    cmds.push(`BT /F1 8 Tf ${valX.toFixed(1)} ${y} Td (${this.pdfText(safeValue)}) Tj ET`);
  }

  private renderPdfFooter(cmds: string[], pageIndex: number, totalPages: number, editorName: string, legalNotice?: string) {
    cmds.push('0.85 0.85 0.85 RG');
    cmds.push('0.6 w');
    cmds.push('40 40 m 555 40 l S');

    cmds.push('0.35 0.35 0.35 rg');
    cmds.push(`BT /F1 7 Tf 40 28 Td (${this.pdfText(`Édité par : ${editorName || 'Utilisateur'} | Document confidentiel — Secret professionnel pharmaceutique`)}) Tj ET`);
    cmds.push(`BT /F1 7 Tf 510 28 Td (${this.pdfText(`Page ${pageIndex} / ${totalPages}`)}) Tj ET`);

    if (legalNotice) {
      cmds.push(`BT /F3 6.5 Tf 40 18 Td (${this.pdfText(legalNotice.slice(0, 110))}) Tj ET`);
    }
  }

  private getCalculatedAge(dateString: string | Date): string {
    const birth = new Date(dateString);
    if (isNaN(birth.getTime())) return '';
    const diffMs = Date.now() - birth.getTime();
    const ageDate = new Date(diffMs);
    const years = Math.abs(ageDate.getUTCFullYear() - 1970);
    return `${years} ans`;
  }

  private pdfText(value: string): string {
    return String(value || '')
      .replace(/[\r\n]/g, ' ')
      .replace(/[\\()]/g, (character) => `\\${character}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}

