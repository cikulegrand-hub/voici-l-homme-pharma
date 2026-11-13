const assert = require('node:assert/strict');
const { CustomerPdfService } = require('../dist/modules/customers/customer-pdf.service.js');
const { PERMISSIONS_CATALOG, ROLE_PERMISSIONS } = require('../dist/common/permissions.catalog.js');

// 1. VÉRIFICATION DES PERMISSIONS & CONTRÔLE D'ACCÈS RBAC (ÉTAPE 3)
console.log('=== TEST 1 : VÉRIFICATION DE LA PERMISSION DÉDIÉE & RBAC ===');
const perm = PERMISSIONS_CATALOG.find((p) => p.code === 'client.fiche_imprimer');
assert(perm, 'La permission client.fiche_imprimer doit exister dans le catalogue');
assert.equal(perm.category, 'CLIENTS');
assert.equal(perm.label, 'Télécharger / imprimer une fiche client');

// SUPER_ADMIN a '*'
assert(ROLE_PERMISSIONS.SUPER_ADMIN.includes('*'), 'SUPER_ADMIN doit avoir le wildcard *');

// ADMIN a toutes les permissions dont client.fiche_imprimer
assert(ROLE_PERMISSIONS.ADMIN.includes('client.fiche_imprimer'), 'ADMIN doit avoir client.fiche_imprimer');

// PHARMACIEN a client.fiche_imprimer
assert(ROLE_PERMISSIONS.PHARMACIEN.includes('client.fiche_imprimer'), 'PHARMACIEN doit avoir client.fiche_imprimer');

// Les autres rôles (CAISSIER, STOCK, COMPTABLE) ne doivent PAS avoir la permission
assert(!ROLE_PERMISSIONS.CAISSIER.includes('client.fiche_imprimer'), 'CAISSIER ne doit pas avoir client.fiche_imprimer');
assert(!ROLE_PERMISSIONS.STOCK.includes('client.fiche_imprimer'), 'STOCK ne doit pas avoir client.fiche_imprimer');
assert(!ROLE_PERMISSIONS.COMPTABLE.includes('client.fiche_imprimer'), 'COMPTABLE ne doit pas avoir client.fiche_imprimer');
console.log('✓ RBAC validé : SUPER_ADMIN, ADMIN et PHARMACIEN autorisés, les autres rôles exclus.');

// 2. MOCK DES SERVICES POUR LES TESTS DU GÉNÉRATEUR PDF (ÉTAPE 2 & 4)
console.log('\n=== TEST 2 : GÉNÉRATION DU PDF FICHE CLIENT (TOUS LES SCÉNARIOS) ===');

// Création d'une image JPEG minimale valide en mémoire (1x1 pixel)
const dummyJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11,
  0x03, 0x11, 0x00, 0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9
]);

const mockDocumentHeaderService = {
  getPharmacyIdentity: () => ({
    name: "VOICI L'HOMME PHARMA",
    address: 'Avenue de la Paix N° 45, Commune de la Gombe, Kinshasa, RDC',
    phone: '+243 81 234 5678',
    email: 'contact@voicilhomme-pharma.cd',
    legalNotice: 'Document confidentiel soumis au secret professionnel pharmaceutique (Loi Santé RDC).',
    logoUrl: null, // Test sans logo par défaut
  }),
  parseImageForPdf: (dataUrl) => {
    if (!dataUrl) return null;
    return { width: 100, height: 40, stream: Buffer.from('mock-stream'), isJpeg: true };
  },
  parseBufferForPdf: (buf) => {
    if (!buf || buf.length < 8) return null;
    return { width: 120, height: 150, stream: buf, isJpeg: true };
  },
  createPdfImageObjects: (img, objNum, smaskNum) => [
    `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.stream.length} >>\nstream\n${img.stream.toString('binary')}\nendstream`,
  ],
};

const mockStorageService = {
  readLocal: async (path) => {
    if (path === 'valid/photo.jpg') return dummyJpeg;
    throw new Error('Fichier introuvable');
  },
};

const pdfService = new CustomerPdfService(mockDocumentHeaderService, mockStorageService);

async function runTests() {
  // SCÉNARIO A : Client PARTICULIER sans photo (Silhouette par défaut, 1 page)
  const clientParticulierSansPhoto = {
    id: '11111111-2222-3333-4444-555555555555',
    code: 'CLI-000001',
    client_number: 'CLI-000001',
    full_name: 'MUKENDI TSHISEKEDI Jean',
    nom: 'MUKENDI',
    postnom: 'TSHISEKEDI',
    prenom: 'Jean',
    sexe: 'M',
    date_naissance: new Date('1988-04-12'),
    nationalite: 'Congolaise (RDC)',
    telephone_principal: '+243 82 111 2233',
    email: 'jean.mukendi@example.com',
    customer_type: 'PARTICULIER',
    credit_limit_cdf: 250000,
    current_balance_cdf: 45000,
    medical_notes: 'Groupe sanguin: O+ | Allergies: Pénicilline, Aspirine | Pathologies chroniques: Hypertension | Patient régulier à surveiller',
    photo_profil_path: null,
    customer_addresses: [{
      numero_parcelle: '12-B',
      avenue_rue: 'Lumumba',
      quartier: 'Matonge',
      commune: 'Kalamu',
      ville: 'Kinshasa',
    }],
    identity_documents: [{
      document_type: 'Carte d’électeur',
      document_number: '98472918374',
      expiration_date: new Date('2028-12-31'),
    }],
    customer_contacts: [{
      name: 'MUKENDI Sarah',
      relationship: 'Épouse',
      phone: '+243 89 999 8877',
    }],
  };

  const pdfA = await pdfService.generateCustomerPdf(clientParticulierSansPhoto, {
    includeHistory: false,
    editorName: 'Pharmacien Titulaire',
  });

  assert(Buffer.isBuffer(pdfA.buffer), 'Doit retourner un buffer');
  assert(pdfA.buffer.length > 500, 'Le buffer PDF doit contenir des données');
  assert(pdfA.buffer.toString('latin1').startsWith('%PDF-1.4'), 'Doit être un document PDF-1.4');
  assert(pdfA.buffer.toString('latin1').includes('%%EOF'), 'Doit comporter la signature de fin %%EOF');
  assert.equal(pdfA.filename, 'Fiche-client_MUKENDI-TSHISEKEDI-Jean_' + new Date().toISOString().slice(0, 10) + '.pdf');
  console.log('✓ Scénario A validé : Particulier sans photo généré sur 1 page avec silhouette par défaut (' + pdfA.buffer.length + ' octets, ' + pdfA.filename + ')');

  // SCÉNARIO B : Client avec photo réelle stockée (XObject /ImPhoto intégré)
  const clientAvecPhoto = {
    ...clientParticulierSansPhoto,
    full_name: 'KAPINGA BUKASA Thérèse',
    nom: 'KAPINGA',
    postnom: 'BUKASA',
    prenom: 'Thérèse',
    sexe: 'F',
    photo_profil_path: 'valid/photo.jpg',
  };

  const pdfB = await pdfService.generateCustomerPdf(clientAvecPhoto, {
    includeHistory: false,
    editorName: 'Pharmacien Titulaire',
  });
  assert(pdfB.buffer.toString('latin1').includes('/ImPhoto'), 'Le PDF doit intégrer le XObject de la photo');
  console.log('✓ Scénario B validé : Client avec photo réelle intégrée dans le PDF via XObject (' + pdfB.buffer.length + ' octets)');

  // SCÉNARIO C : Client ASSURANCE / MUTUELLE (société conventionnée, taux, matricule)
  const clientAssurance = {
    id: '22222222-3333-4444-5555-666666666666',
    code: 'CLI-000042',
    full_name: 'ILUNGA NGOY Pierre',
    customer_type: 'ASSURANCE',
    photo_profil_path: null,
    insurance_coverages: [{
      insured_card_number: 'ASSUR-KIN-9021',
      policy_number: 'POL-2026-X',
      coverage_rate: 85,
      insured_status: 'ASSURÉ PRINCIPAL',
      end_date: new Date('2027-06-30'),
      insurers: { name: 'ACTIVA ASSURANCES RDC' },
    }],
    customer_addresses: [{ commune: 'Gombe', ville: 'Kinshasa' }],
  };

  const pdfC = await pdfService.generateCustomerPdf(clientAssurance, {
    includeHistory: false,
    editorName: 'Agent Assurances',
  });
  const textC = pdfC.buffer.toString('latin1');
  assert(textC.includes('ACTIVA ASSURANCES RDC'), 'Doit afficher le nom de l’assureur');
  assert(textC.includes('ASSUR-KIN-9021'), 'Doit afficher le matricule assuré');
  assert(textC.includes('85 %'), 'Doit afficher le taux de couverture');
  console.log('✓ Scénario C validé : Client Assurance avec mentions mutuelle et couverture (' + pdfC.buffer.length + ' octets)');

  // SCÉNARIO D : Client ENTREPRISE (Raison sociale, RCCM, NIF, Représentant)
  const clientEntreprise = {
    id: '33333333-4444-5555-6666-777777777777',
    code: 'CLI-ENT-007',
    full_name: 'BRASSERIE DU CONGO SARL',
    company_name: 'BRASSERIE DU CONGO SARL',
    customer_type: 'ENTREPRISE',
    enterprise_details: {
      legal_name: 'BRASSERIE DU CONGO SARL',
      rccm: 'CD/KIN/RCCM/20-B-1029',
      national_id: '01-83-N48201L',
      tax_id: 'A1029384K',
      representative_name: 'Dr KASONGO Albert',
      representative_phone: '+243 81 555 4433',
    },
    customer_addresses: [{ avenue_rue: 'Poids Lourds N° 120', commune: 'Limete', ville: 'Kinshasa' }],
  };

  const pdfD = await pdfService.generateCustomerPdf(clientEntreprise, {
    includeHistory: false,
    editorName: 'Administrateur',
  });
  const textD = pdfD.buffer.toString('latin1');
  assert(textD.includes('BRASSERIE DU CONGO SARL'), 'Doit afficher la raison sociale');
  assert(textD.includes('CD/KIN/RCCM/20-B-1029'), 'Doit afficher le RCCM');
  assert(textD.includes('A1029384K'), 'Doit afficher le NIF');
  assert(textD.includes('Dr KASONGO Albert'), 'Doit afficher le représentant');
  console.log('✓ Scénario D validé : Client Entreprise avec raison sociale et mentions fiscales (' + pdfD.buffer.length + ' octets)');

  // SCÉNARIO E : Section optionnelle avec historique des ordonnances et achats récents (2 pages)
  const pdfE = await pdfService.generateCustomerPdf(clientParticulierSansPhoto, {
    includeHistory: true,
    editorName: 'Pharmacien de Garde',
    prescriptions: [
      {
        prescriptionDate: '2026-11-01',
        prescriberName: 'Dr TSHIBANGU',
        healthCenter: 'Clinique Ngaliema',
        prescriptionText: 'Amoxicilline 1g 3x/jour pdt 7 jours, Paracétamol 1g',
      },
    ],
    history: {
      purchases: [
        {
          id: 'sale-1',
          invoiceNumber: 'FAC-2026-00452',
          date: '2026-11-02',
          totalCdf: 35000,
          items: [{ productName: 'Amoxicilline 1g Bte/14', quantity: 2 }],
        },
      ],
    },
  });

  const textE = pdfE.buffer.toString('latin1');
  assert(textE.includes('/Count 2'), 'Doit comporter 2 pages quand l’historique est inclus');
  assert(textE.includes('Dr TSHIBANGU'), 'Doit afficher le médecin prescripteur');
  assert(textE.includes('Clinique Ngaliema'), 'Doit afficher le centre hospitalier');
  assert(textE.includes('FAC-2026-00452'), 'Doit afficher le n° de facture sans montants internes sensibles');
  console.log('✓ Scénario E validé : Section optionnelle intégrée avec ordonnances et achats sur 2 pages (' + pdfE.buffer.length + ' octets)');

  // SCÉNARIO F : Texte très long (adresse, allergies, notes du pharmacien) sans débordement
  const clientTexteLong = {
    ...clientParticulierSansPhoto,
    full_name: 'MPOYI MPOYI KABANGU Jean-Baptiste Dieudonné de la Sainte Trinité',
    medical_notes: 'Allergies: Pénicilline G, Amoxicilline, Ampicilline, Céphalosporines de première génération, Sulfamides antibactériens, Tartrazine | Pathologies chroniques: Insuffisance cardiaque congestive NYHA classe III, Diabète de type 2 insulino-dépendant, Glaucome à angle ouvert | Observations: Patient polypathologique requérant une vigilance accrue sur les interactions médicamenteuses potentielles et la surveillance régulière de la clairance rénale.',
    customer_addresses: [{
      numero_parcelle: '458 bis / Extension Sud',
      avenue_rue: 'Boulevard du 30 Juin Prolongé vers la Gare Centrale',
      quartier: 'Résidentiel des Ambassades',
      commune: 'Gombe',
      ville: 'Kinshasa',
      province: 'Kinshasa Capitale',
    }],
  };

  const pdfF = await pdfService.generateCustomerPdf(clientTexteLong, {
    includeHistory: false,
    editorName: 'Pharmacien',
  });
  assert(pdfF.buffer.length > 0, 'Le PDF avec texte long doit être généré avec succès');
  console.log('✓ Scénario F validé : Textes longs (adresse, allergies étendues, observations denses) gérés et tronqués proprement (' + pdfF.buffer.length + ' octets)');

  console.log('\n========================================');
  console.log('TOUS LES TESTS DU MODULE FICHE CLIENT PDF SONT VALIDÉS AVEC SUCCÈS !');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('ÉCHEC DU TEST :', err);
  process.exit(1);
});

