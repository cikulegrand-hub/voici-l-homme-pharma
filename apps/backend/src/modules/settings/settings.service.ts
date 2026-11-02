import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpdatePharmacyIdentityDto,
  UpdateFinancialRulesDto,
  UpdateAlertThresholdsDto,
  UpdatePrintTemplatesDto,
  SimulateImportDto,
  ExecuteImportDto,
  BackupDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger('SettingsService');
  private readonly defaultPharmacyId = '11111111-1111-1111-1111-111111111111';

  // Paramètres en cache mémoire avec valeurs par défaut réglementaires
  private pharmacyIdentity: UpdatePharmacyIdentityDto = {
    name: 'Voici l’Homme Pharma',
    address: 'Av. de l’Église, Q. Résidentiel, Commune de Limete, Kinshasa, RDC',
    phone: '+243 81 234 56 78',
    email: 'contact@voicilhommepharma.cd',
    rccm: 'CD/KIN/RCCM/14-B-2345',
    idNat: '01-83-N12345P',
    taxNumber: 'A0912345B',
    logoUrl: undefined,
    receiptFooterText:
      'Tout médicament vendu ne peut être repris ni échangé sans accord préalable du pharmacien responsable.',
    invoiceLegalNotice:
      'Facture officielle d’officine établie selon les dispositions du Ministère de la Santé Publique et de la DGI / RDC.',
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
      { code: 'TVA_16', name: 'TVA Standard 16%', rate: 16.0, isActive: true },
      { code: 'EXONERE', name: 'Exonéré (Médicaments essentiels)', rate: 0.0, isActive: true },
    ],
    cashierDiscountCapPercent: 5.0,
    pharmacistDiscountCapPercent: 15.0,
  };

  private alertThresholds: UpdateAlertThresholdsDto = {
    expiryWarningDaysLevel1: 30, // STK-09
    expiryWarningDaysLevel2: 60,
    expiryWarningDaysLevel3: 90,
    sessionInactivityTimeoutMinutes: 15, // AUT-03
  };

  private printTemplates: UpdatePrintTemplatesDto = {
    ticketHeader: 'PHARMACIE VOICI L’HOMME\nKinshasa - Limete\nTél : +243 81 234 56 78',
    ticketFooter: 'Merci pour votre confiance. Bon rétablissement !',
    showLogoOnTicket: true,
    invoiceLegalNotice:
      'Facture acquittée. Tout litige relève de la compétence exclusive des tribunaux de Kinshasa.',
  };

  private backupHistory: BackupDto[] = [];

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
          } else if (rec.key === 'backup_history' && Array.isArray(val)) {
            this.backupHistory = val;
          }
        } catch {
          // ignorer le record corrompu
        }
      }

      this.logger.log('Paramètres de l’officine chargés depuis PostgreSQL.');
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
    this.pharmacyIdentity = { ...this.pharmacyIdentity, ...dto };

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
          tax_number: dto.taxNumber,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec persistance DB identity : ${err.message}`);
    }

    // 3. Audit complet (AUD-01)
    this.auditService.logAction({
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
    this.financialRules = { ...this.financialRules, ...dto };

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

    this.auditService.logAction({
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
    switch (role) {
      case 'ADMIN':
        return 20.0;
      case 'PHARMACIEN':
        return this.financialRules.pharmacistDiscountCapPercent;
      case 'CAISSIER':
        return this.financialRules.cashierDiscountCapPercent;
      default:
        return 0.0;
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

    this.auditService.logAction({
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

    this.auditService.logAction({
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

  /**
   * Étape 1 : Simulation pure sans écriture en base
   */
  async simulateImport(dto: SimulateImportDto) {
    const { type, rows } = dto;
    if (!rows || !Array.isArray(rows)) {
      throw new BadRequestException('Le format des données à importer est invalide (tableau requis).');
    }

    const validRows: any[] = [];
    const rejectedRows: { rowNumber: number; data: any; reason: string }[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 1;
      const error = this.validateImportRow(type, row);

      if (error) {
        rejectedRows.push({
          rowNumber: rowNum,
          data: row,
          reason: error,
        });
      } else {
        validRows.push({
          ...row,
          _rowNumber: rowNum,
        });
      }
    }

    return {
      type,
      totalRows: rows.length,
      validCount: validRows.length,
      rejectedCount: rejectedRows.length,
      validRows,
      rejectedRows,
    };
  }

  /**
   * Étape 2 : Exécution définitive transactionnelle
   */
  async executeImport(dto: ExecuteImportDto, authorId = 'admin-user-id') {
    const { type, rows } = dto;
    if (!rows || rows.length === 0) {
      throw new BadRequestException('Aucune ligne validée à importer.');
    }

    let insertedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (type === 'products') {
        for (const row of rows) {
          await tx.products.create({
            data: {
              pharmacy_id: this.defaultPharmacyId,
              name: row.name,
              dci: row.dci || row.name,
              dosage: row.dosage || null,
              galenic_form: row.galenicForm || row.galenic_form || null,
              selling_price_cdf: Number(row.sellingPriceCdf || 0),
              selling_price_usd: Number(row.sellingPriceUsd || 0),
              min_alert_threshold: Number(row.minAlertThreshold || 10),
              is_active: true,
            },
          });
          insertedCount++;
        }
      } else if (type === 'suppliers') {
        for (const row of rows) {
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
      } else if (type === 'customers') {
        for (const row of rows) {
          const code = row.code || `CLI-${Date.now().toString().slice(-6)}-${insertedCount}`;
          await tx.customers.create({
            data: {
              pharmacy_id: this.defaultPharmacyId,
              code,
              full_name: row.fullName || row.full_name || row.name,
              phone: row.phone || null,
              email: row.email || null,
              address: row.address || null,
              is_active: true,
            },
          });
          insertedCount++;
        }
      } else if (type === 'stock') {
        for (const row of rows) {
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

    this.auditService.logAction({
      userId: authorId,
      userName: 'Administrateur',
      action: 'IMPORT_INITIAL_EXECUTE',
      entityName: type.toUpperCase(),
      entityId: `import_${Date.now()}`,
      newValues: { type, count: insertedCount },
    });

    return {
      success: true,
      type,
      importedCount: insertedCount,
      message: `${insertedCount} enregistrement(s) importé(s) avec succès.`,
    };
  }

  private validateImportRow(type: string, row: any): string | null {
    if (!row || typeof row !== 'object') return 'Ligne vide ou corrompue.';

    if (type === 'products') {
      if (!row.name || String(row.name).trim() === '') return 'Nom de spécialité obligatoire.';
      if (row.sellingPriceCdf != null && Number(row.sellingPriceCdf) < 0) {
        return 'Le prix de vente CDF ne peut être négatif.';
      }
    } else if (type === 'stock') {
      if (!row.productName || String(row.productName).trim() === '') return 'Nom du médicament requis.';
      if (!row.lotNumber || String(row.lotNumber).trim() === '') return 'Numéro de lot obligatoire.';
      if (!row.expiryDate || isNaN(Date.parse(row.expiryDate))) return 'Date de péremption invalide (format AAAA-MM-JJ).';
      if (!row.quantity || Number(row.quantity) <= 0) return 'La quantité en stock doit être supérieure à 0.';
    } else if (type === 'suppliers') {
      if (!row.name || String(row.name).trim() === '') return 'Nom du fournisseur obligatoire.';
    } else if (type === 'customers') {
      const name = row.fullName || row.full_name || row.name;
      if (!name || String(name).trim() === '') return 'Nom complet du client obligatoire.';
    }

    return null;
  }

  // ---------- 6. SAUVEGARDE & RESTAURATION PILOTABLES (PAR-08) ----------

  async createBackup(authorId = 'admin-user-id', authorName = 'Administrateur'): Promise<BackupDto> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_vhp_${timestamp}.json`;

    // 1. Collecte des données
    const [pharmacies, settings, products, lots, suppliers, customers, exchangeRates] = await Promise.all([
      this.prisma.pharmacies.findMany({ where: { id: this.defaultPharmacyId } }),
      this.prisma.settings.findMany({ where: { pharmacy_id: this.defaultPharmacyId } }),
      this.prisma.products.findMany({ where: { pharmacy_id: this.defaultPharmacyId } }),
      this.prisma.product_lots.findMany({
        where: { products: { pharmacy_id: this.defaultPharmacyId } },
      }),
      this.prisma.suppliers.findMany({ where: { pharmacy_id: this.defaultPharmacyId } }),
      this.prisma.customers.findMany({ where: { pharmacy_id: this.defaultPharmacyId } }),
      this.prisma.exchange_rates.findMany({
        where: { pharmacy_id: this.defaultPharmacyId },
        take: 100,
        orderBy: { effective_date: 'desc' },
      }),
    ]);

    const backupPayload = {
      meta: {
        createdAt: new Date().toISOString(),
        version: '1.0',
        pharmacyId: this.defaultPharmacyId,
        createdBy: authorName,
      },
      data: {
        pharmacies,
        settings,
        products,
        lots,
        suppliers,
        customers,
        exchangeRates,
      },
    };

    const serialized = JSON.stringify(backupPayload);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    const sizeKb = (sizeBytes / 1024).toFixed(1);

    const backupRecord: BackupDto = {
      id: `bkp_${Date.now()}`,
      filename,
      sizeBytes,
      sizeFormatted: `${sizeKb} Ko`,
      createdAt: new Date().toISOString(),
      createdBy: authorName,
      status: 'SUCCES',
      tableCounts: {
        produits: products.length,
        lots: lots.length,
        fournisseurs: suppliers.length,
        clients: customers.length,
        taux: exchangeRates.length,
      },
    };

    this.backupHistory.unshift(backupRecord);

    try {
      await this.prisma.settings.upsert({
        where: {
          pharmacy_id_key: {
            pharmacy_id: this.defaultPharmacyId,
            key: 'backup_history',
          },
        },
        create: {
          pharmacy_id: this.defaultPharmacyId,
          key: 'backup_history',
          value: this.backupHistory as any,
        },
        update: {
          value: this.backupHistory as any,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Échec enregistrement backup_history : ${err.message}`);
    }

    this.auditService.logAction({
      userId: authorId,
      userName: authorName,
      action: 'SAUVEGARDE_MANUELLE_CREEE',
      entityName: 'BACKUP',
      entityId: backupRecord.id,
      newValues: { filename, size: backupRecord.sizeFormatted },
    });

    return backupRecord;
  }

  getBackupHistory(): BackupDto[] {
    return [...this.backupHistory];
  }
}
