import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpdatePharmacyIdentityDto,
  UpdateFinancialRulesDto,
  UpdateAlertThresholdsDto,
  UpdatePrintTemplatesDto,
  SimulateImportDto,
  ExecuteImportDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger('SettingsService');
  private readonly defaultPharmacyId = '11111111-1111-1111-1111-111111111111';

  // Paramètres en cache mémoire avec valeurs par défaut réglementaires
  private pharmacyIdentity: UpdatePharmacyIdentityDto = {
    name: "Voici l'Homme Pharma",
    address: "Av. de l'Église, Q. Résidentiel, Commune de Limete, Kinshasa, RDC",
    phone: '+243 81 234 56 78',
    email: 'contact@voicilhommepharma.cd',
    rccm: 'CD/KIN/RCCM/14-B-2345',
    idNat: '01-83-N12345P',
    nif: 'A0912345B',
    taxNumber: 'A0912345B',
    logoUrl: undefined,
    invoiceFooter:
      'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.',
    receiptFooterText:
      'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.',
    legalNotice:
      "Facture officielle d'officine établie selon les dispositions du Ministère de la Santé Publique et de la DGI / RDC.",
    invoiceLegalNotice:
      "Facture officielle d'officine établie selon les dispositions du Ministère de la Santé Publique et de la DGI / RDC.",
  };

  private financialRules: UpdateFinancialRulesDto = {
    defaultCurrency: 'CDF',
    activeCurrencies: ['CDF', 'USD'],
    cdfDecimals: 0,
    usdDecimals: 2,
    cdfRoundingRule: 'ENTIER',
    usdRoundingRule: 'DECIMAL_2',
    activePaymentMethods: ['ESPECES', 'MOBILE_MONEY', 'CARTE_BANCAIRE', 'VIREMENT', 'CREDIT_CLIENT'],
    taxes: [
      { code: 'TVA_16', label: 'TVA Standard 16%', name: 'TVA Standard 16%', rate: 16.0, isDefault: false, isActive: false },
      { code: 'EXONERE', label: 'Exonéré (Médicaments essentiels)', name: 'Exonéré (Médicaments essentiels)', rate: 0.0, isDefault: true, isActive: true },
    ],
    discountCapsByRole: {
      ADMIN: 100,
      PHARMACIEN: 10,
      CAISSIER: 5,
      STOCK: 0,
      COMPTABLE: 0,
    },
    cashierDiscountCapPercent: 5,
    pharmacistDiscountCapPercent: 10,
  };

  private alertThresholds: UpdateAlertThresholdsDto = {
    expiryWarningDays: [30, 60, 90],
    inactivityTimeoutMinutes: 15,
    lowStockDefaultThreshold: 10,
  };

  private printTemplates: UpdatePrintTemplatesDto = {
    ticketHeader: "PHARMACIE VOICI L'HOMME\nKinshasa - Limete\nTél : +243 81 234 56 78",
    ticketFooter: 'Merci pour votre confiance. Bon rétablissement !',
    showLogoOnTicket: true,
    invoiceHeader: "Facture d'achat - Client Officine",
    invoiceFooter: 'Merci pour votre confiance.',
    showLogoOnInvoice: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadAllSettingsFromDatabase();
  }

  private async loadAllSettingsFromDatabase(): Promise<void> {
    try {
      const records = await this.prisma.settings.findMany({
        where: { pharmacy_id: this.defaultPharmacyId },
      });

      for (const rec of records) {
        try {
          const val = rec.value as any;
          if (rec.key === 'pharmacy_identity') {
            this.pharmacyIdentity = { ...this.pharmacyIdentity, ...val };
          } else if (rec.key === 'financial_rules') {
            this.financialRules = { ...this.financialRules, ...val };
          } else if (rec.key === 'alert_thresholds') {
            this.alertThresholds = { ...this.alertThresholds, ...val };
          } else if (rec.key === 'print_templates') {
            this.printTemplates = { ...this.printTemplates, ...val };
          }
        } catch {
          // ignorer le record corrompu
        }
      }

      this.logger.log("Paramètres de l'officine chargés depuis PostgreSQL.");
    } catch (err: any) {
      this.logger.warn(`Initialisation settings en cache mémoire : ${err.message}`);
    }
  }

  // ---------- 1. IDENTITÉ DE L'OFFICINE (PAR-01) ----------

  getPharmacyIdentity(): UpdatePharmacyIdentityDto {
    return { ...this.pharmacyIdentity };
  }

  async updatePharmacyIdentity(
    dto: UpdatePharmacyIdentityDto,
    authorId = 'admin-user-id',
  ): Promise<UpdatePharmacyIdentityDto> {
    const before = { ...this.pharmacyIdentity };
    const nif = dto.nif || dto.taxNumber;
    const invoiceFooter = dto.invoiceFooter || dto.receiptFooterText;
    const legalNotice = dto.legalNotice || dto.invoiceLegalNotice;

    this.pharmacyIdentity = {
      ...this.pharmacyIdentity,
      ...dto,
      ...(nif ? { nif, taxNumber: nif } : {}),
      ...(invoiceFooter ? { invoiceFooter, receiptFooterText: invoiceFooter } : {}),
      ...(legalNotice ? { legalNotice, invoiceLegalNotice: legalNotice } : {}),
    };

    try {
      // 1. Sauvegarde dans la table settings
      await this.prisma.settings.upsert({
        where: {
          pharmacy_id_key: {
            pharmacy_id: this.defaultPharmacyId,
            key: 'pharmacy_identity',
          },
        },
        create: {
          pharmacy_id: this.defaultPharmacyId,
          key: 'pharmacy_identity',
          value: this.pharmacyIdentity as any,
        },
        update: {
          value: this.pharmacyIdentity as any,
          updated_at: new Date(),
        },
      });

      // 2. Synchronisation de la table pharmacies
      await this.prisma.pharmacies.updateMany({
        where: { id: this.defaultPharmacyId },
        data: {
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          email: dto.email,
          tax_number: nif,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec persistance DB identity : ${err.message}`);
    }

    // 3. Audit complet (AUD-01)
    await this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'MODIFICATION_IDENTITE_PHARMACIE',
      entityName: 'SETTINGS',
      entityId: 'pharmacy_identity',
      oldValues: before as any,
      newValues: this.pharmacyIdentity as any,
    });

    return { ...this.pharmacyIdentity };
  }

  async updateLogo(logoUrl: string, authorId = 'admin-user-id'): Promise<{ logoUrl: string }> {
    this.pharmacyIdentity.logoUrl = logoUrl;
    await this.updatePharmacyIdentity(this.pharmacyIdentity, authorId);
    return { logoUrl };
  }

  // ---------- 2. RÈGLES FINANCIÈRES & ARRONDI (PAR-02, RG-07, RG-08) ----------

  getFinancialRules(): UpdateFinancialRulesDto {
    return { ...this.financialRules };
  }

  async updateFinancialRules(
    dto: UpdateFinancialRulesDto,
    authorId = 'admin-user-id',
  ): Promise<UpdateFinancialRulesDto> {
    const before = { ...this.financialRules };

    const discountCaps = {
      ...this.financialRules.discountCapsByRole,
      ...dto.discountCapsByRole,
    };
    if (dto.cashierDiscountCapPercent != null) {
      discountCaps['CAISSIER'] = dto.cashierDiscountCapPercent;
    }
    if (dto.pharmacistDiscountCapPercent != null) {
      discountCaps['PHARMACIEN'] = dto.pharmacistDiscountCapPercent;
    }

    const normalizedTaxes = dto.taxes?.map((t) => ({
      code: t.code,
      label: t.label || t.name || t.code,
      name: t.name || t.label || t.code,
      rate: t.rate,
      isDefault: t.isDefault ?? t.isActive ?? false,
      isActive: t.isActive ?? t.isDefault ?? true,
    })) || this.financialRules.taxes;

    this.financialRules = {
      ...this.financialRules,
      ...dto,
      taxes: normalizedTaxes,
      discountCapsByRole: discountCaps,
      cashierDiscountCapPercent: discountCaps['CAISSIER'] ?? 5,
      pharmacistDiscountCapPercent: discountCaps['PHARMACIEN'] ?? 10,
    };

    try {
      await this.prisma.settings.upsert({
        where: {
          pharmacy_id_key: {
            pharmacy_id: this.defaultPharmacyId,
            key: 'financial_rules',
          },
        },
        create: {
          pharmacy_id: this.defaultPharmacyId,
          key: 'financial_rules',
          value: this.financialRules as any,
        },
        update: {
          value: this.financialRules as any,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec persistance DB financial_rules : ${err.message}`);
    }

    await this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'MODIFICATION_REGLES_FINANCIERES',
      entityName: 'SETTINGS',
      entityId: 'financial_rules',
      oldValues: before as any,
      newValues: this.financialRules as any,
    });

    return { ...this.financialRules };
  }

  /**
   * RG-07 & RG-08 : Applique la règle d'arrondi paramétrée par devise
   */
  roundAmount(amount: number, currency: 'CDF' | 'USD'): number {
    if (currency === 'CDF') {
      const rule = this.financialRules.cdfRoundingRule;
      if (rule === 'CINQUANTE') {
        return Math.round(amount / 50) * 50;
      }
      if (rule === 'CENT') {
        return Math.round(amount / 100) * 100;
      }
      return Math.round(amount); // ENTIER par défaut
    }

    // USD : standard à 2 décimales
    return Number(amount.toFixed(this.financialRules.usdDecimals ?? 2));
  }

  getDiscountCapForRole(role: string): number {
    const caps = this.financialRules.discountCapsByRole;
    if (caps && caps[role] != null) {
      return caps[role];
    }
    // Valeurs de secours
    switch (role) {
      case 'ADMIN':
        return 100;
      case 'PHARMACIEN':
        return 10;
      case 'CAISSIER':
        return 5;
      default:
        return 0;
    }
  }

  // ---------- 3. SEUILS D'ALERTES & SÉCURITÉ (PAR-04, AUT-03, STK-09) ----------

  getAlertThresholds(): UpdateAlertThresholdsDto {
    return { ...this.alertThresholds };
  }

  async updateAlertThresholds(
    dto: UpdateAlertThresholdsDto,
    authorId = 'admin-user-id',
  ): Promise<UpdateAlertThresholdsDto> {
    const before = { ...this.alertThresholds };
    this.alertThresholds = { ...this.alertThresholds, ...dto };

    try {
      await this.prisma.settings.upsert({
        where: {
          pharmacy_id_key: {
            pharmacy_id: this.defaultPharmacyId,
            key: 'alert_thresholds',
          },
        },
        create: {
          pharmacy_id: this.defaultPharmacyId,
          key: 'alert_thresholds',
          value: this.alertThresholds as any,
        },
        update: {
          value: this.alertThresholds as any,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec persistance DB alert_thresholds : ${err.message}`);
    }

    await this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'MODIFICATION_SEUILS_ALERTES',
      entityName: 'SETTINGS',
      entityId: 'alert_thresholds',
      oldValues: before as any,
      newValues: this.alertThresholds as any,
    });

    return { ...this.alertThresholds };
  }

  // ---------- 4. MODÈLES D'IMPRESSION (PAR-05, PAR-06) ----------

  getPrintTemplates(): UpdatePrintTemplatesDto {
    return { ...this.printTemplates };
  }

  async updatePrintTemplates(
    dto: UpdatePrintTemplatesDto,
    authorId = 'admin-user-id',
  ): Promise<UpdatePrintTemplatesDto> {
    const before = { ...this.printTemplates };
    this.printTemplates = { ...this.printTemplates, ...dto };

    try {
      await this.prisma.settings.upsert({
        where: {
          pharmacy_id_key: {
            pharmacy_id: this.defaultPharmacyId,
            key: 'print_templates',
          },
        },
        create: {
          pharmacy_id: this.defaultPharmacyId,
          key: 'print_templates',
          value: this.printTemplates as any,
        },
        update: {
          value: this.printTemplates as any,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec persistance DB print_templates : ${err.message}`);
    }

    await this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'MODIFICATION_TEMPLATES_IMPRESSION',
      entityName: 'SETTINGS',
      entityId: 'print_templates',
      oldValues: before as any,
      newValues: this.printTemplates as any,
    });

    return { ...this.printTemplates };
  }

  // ---------- 5. IMPORT INITIAL EN DEUX TEMPS (PAR-07) ----------

  /** Mappe les headers CSV français vers les noms de champs internes */
  private mapCsvRow(importType: string, row: Record<string, any>): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
      mapped[normalizedKey] = value;
    }

    if (importType === 'PRODUITS') {
      return {
        name: mapped['nom'] ?? mapped['name'] ?? '',
        dci: mapped['dci'] ?? mapped['nom'] ?? '',
        galenicForm: mapped['forme'] ?? mapped['galenic_form'] ?? mapped['galenicform'] ?? null,
        dosage: mapped['dosage'] ?? null,
        unitSale: mapped['unite_vente'] ?? mapped['unitsale'] ?? null,
        sellingPriceCdf: Number(mapped['prix_vente_cdf'] ?? mapped['sellingpricecdf'] ?? mapped['selling_price_cdf'] ?? 0),
        sellingPriceUsd: Number(mapped['prix_vente_usd'] ?? mapped['sellingpriceusd'] ?? mapped['selling_price_usd'] ?? 0),
        taxRate: Number(mapped['tva'] ?? mapped['tax'] ?? 0),
        barcode: mapped['code_barre'] ?? mapped['barcode'] ?? null,
        minAlertThreshold: Number(mapped['seuil_alerte'] ?? mapped['min_alert_threshold'] ?? 10),
      };
    }
    if (importType === 'STOCK') {
      return {
        productName: mapped['produit_nom'] ?? mapped['product_name'] ?? mapped['productname'] ?? '',
        lotNumber: mapped['numero_lot'] ?? mapped['lot_number'] ?? mapped['lotnumber'] ?? '',
        expiryDate: mapped['date_peremption'] ?? mapped['expiry_date'] ?? mapped['expirydate'] ?? '',
        quantity: Number(mapped['quantite'] ?? mapped['quantity'] ?? 0),
        purchasePriceCdf: Number(mapped['prix_achat_cdf'] ?? mapped['purchase_price_cdf'] ?? 0),
        purchasePriceUsd: Number(mapped['prix_achat_usd'] ?? mapped['purchase_price_usd'] ?? 0),
      };
    }
    if (importType === 'FOURNISSEURS') {
      return {
        name: mapped['nom'] ?? mapped['name'] ?? '',
        contact: mapped['contact'] ?? null,
        phone: mapped['telephone'] ?? mapped['phone'] ?? null,
        email: mapped['email'] ?? null,
        address: mapped['adresse'] ?? mapped['address'] ?? null,
      };
    }
    if (importType === 'CLIENTS') {
      return {
        code: mapped['code'] ?? null,
        name: mapped['nom'] ?? mapped['name'] ?? '',
        fullName: mapped['nom'] ?? mapped['name'] ?? '',
        type: mapped['type'] ?? 'PARTICULIER',
        phone: mapped['telephone'] ?? mapped['phone'] ?? null,
        creditLimit: Number(mapped['plafond_credit_cdf'] ?? mapped['credit_limit'] ?? 0),
      };
    }
    return mapped;
  }

  private resolveImportType(dto: { importType?: string; type?: string }): 'PRODUITS' | 'STOCK' | 'FOURNISSEURS' | 'CLIENTS' {
    const raw = (dto.importType || dto.type || '').trim().toUpperCase();
    if (raw === 'PRODUCTS' || raw === 'PRODUITS') return 'PRODUITS';
    if (raw === 'STOCK') return 'STOCK';
    if (raw === 'SUPPLIERS' || raw === 'FOURNISSEURS') return 'FOURNISSEURS';
    if (raw === 'CUSTOMERS' || raw === 'CLIENTS') return 'CLIENTS';
    return 'PRODUITS';
  }

  /**
   * Étape 1 : Simulation pure sans écriture en base
   */
  async simulateImport(dto: SimulateImportDto) {
    const importType = this.resolveImportType(dto);
    const { rows } = dto;
    if (!rows || !Array.isArray(rows)) {
      throw new BadRequestException('Le format des données à importer est invalide (tableau requis).');
    }

    const validRows: any[] = [];
    const rejectedRows: { row: number; rowNumber: number; data: any; reason: string }[] = [];

    for (let index = 0; index < rows.length; index++) {
      const rawRow = rows[index];
      const rowNum = index + 1;
      const mappedRow = this.mapCsvRow(importType, rawRow);
      const error = this.validateImportRow(importType, mappedRow);

      if (error) {
        rejectedRows.push({
          row: rowNum,
          rowNumber: rowNum,
          data: rawRow,
          reason: error,
        });
      } else {
        validRows.push({
          ...mappedRow,
          _rowNumber: rowNum,
        });
      }
    }

    return {
      importType,
      type: importType.toLowerCase(),
      totalRows: rows.length,
      validCount: validRows.length,
      rejectedCount: rejectedRows.length,
      rejectedRows,
      validRows,
      sampleValid: validRows.slice(0, 5),
    };
  }

  /**
   * Étape 2 : Exécution définitive transactionnelle
   */
  async executeImport(dto: ExecuteImportDto, authorId = 'admin-user-id') {
    const importType = this.resolveImportType(dto);
    const { rows } = dto;
    if (!rows || rows.length === 0) {
      throw new BadRequestException('Aucune ligne validée à importer.');
    }

    let insertedCount = 0;

    // Mapper chaque row avant insertion
    const mappedRows = rows.map((r) => this.mapCsvRow(importType, r));

    await this.prisma.$transaction(async (tx) => {
      if (importType === 'PRODUITS') {
        for (const row of mappedRows) {
          await tx.products.create({
            data: {
              pharmacy_id: this.defaultPharmacyId,
              name: row.name,
              dci: row.dci || row.name,
              dosage: row.dosage || null,
              galenic_form: row.galenicForm || null,
              selling_price_cdf: Number(row.sellingPriceCdf || 0),
              selling_price_usd: Number(row.sellingPriceUsd || 0),
              min_alert_threshold: Number(row.minAlertThreshold || 10),
              is_active: true,
            },
          });
          insertedCount++;
        }
      } else if (importType === 'FOURNISSEURS') {
        for (const row of mappedRows) {
          await tx.suppliers.create({
            data: {
              pharmacy_id: this.defaultPharmacyId,
              name: row.name,
              phone: row.phone || null,
              email: row.email || null,
              address: row.address || null,
              is_active: true,
            },
          });
          insertedCount++;
        }
      } else if (importType === 'CLIENTS') {
        for (const row of mappedRows) {
          const code = row.code || `CLI-${Date.now().toString().slice(-6)}-${insertedCount}`;
          await tx.customers.create({
            data: {
              pharmacy_id: this.defaultPharmacyId,
              code,
              full_name: row.fullName || row.name,
              phone: row.phone || null,
              email: row.email || null,
              address: row.address || null,
              is_active: true,
            },
          });
          insertedCount++;
        }
      } else if (importType === 'STOCK') {
        for (const row of mappedRows) {
          // Trouver le produit correspondant par nom ou dci
          const product = await tx.products.findFirst({
            where: {
              pharmacy_id: this.defaultPharmacyId,
              OR: [{ name: row.productName }, { dci: row.productName }],
            },
          });

          if (product) {
            await tx.product_lots.create({
              data: {
                product_id: product.id,
                lot_number: row.lotNumber || `LOT-INIT-${insertedCount}`,
                expiry_date: new Date(row.expiryDate),
                initial_quantity: Number(row.quantity),
                current_quantity: Number(row.quantity),
                purchase_price_cdf: Number(row.purchasePriceCdf || 0),
                purchase_price_usd: Number(row.purchasePriceUsd || 0),
              },
            });
            insertedCount++;
          }
        }
      }
    });

    await this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'IMPORT_INITIAL_EXECUTE',
      entityName: importType,
      entityId: `import_${Date.now()}`,
      newValues: { importType, count: insertedCount },
    });

    return {
      success: true,
      insertedCount,
      importedCount: insertedCount,
      message: `${insertedCount} enregistrement(s) importé(s) avec succès.`,
    };
  }

  private validateImportRow(importType: string, row: any): string | null {
    if (!row || typeof row !== 'object') return 'Ligne vide ou corrompue.';

    if (importType === 'PRODUITS') {
      if (!row.name || String(row.name).trim() === '') return 'Nom de spécialité obligatoire.';
      if (row.sellingPriceCdf != null && Number(row.sellingPriceCdf) < 0) {
        return 'Le prix de vente CDF ne peut être négatif.';
      }
    } else if (importType === 'STOCK') {
      if (!row.productName || String(row.productName).trim() === '') return 'Nom du médicament requis.';
      if (!row.lotNumber || String(row.lotNumber).trim() === '') return 'Numéro de lot obligatoire.';
      if (!row.expiryDate || isNaN(Date.parse(row.expiryDate))) return 'Date de péremption invalide (format AAAA-MM-JJ).';
      if (!row.quantity || Number(row.quantity) <= 0) return 'La quantité en stock doit être supérieure à 0.';
    } else if (importType === 'FOURNISSEURS') {
      if (!row.name || String(row.name).trim() === '') return 'Nom du fournisseur obligatoire.';
    } else if (importType === 'CLIENTS') {
      const name = row.fullName || row.name;
      if (!name || String(name).trim() === '') return 'Nom complet du client obligatoire.';
    }

    return null;
  }
}
