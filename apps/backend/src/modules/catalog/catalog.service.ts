import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Product,
  ProductCategory,
  GalenicForm,
  ProductAutocompleteItem,
  PriceHistoryEntry,
  PaginatedResult,
} from '@vhp/shared';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateGalenicFormDto,
  UpdateProductPriceDto,
  ProductQueryDto,
  AddBarcodeDto,
} from './dto/catalog.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface InternalProduct extends Product {
  category?: ProductCategory;
}

const DEFAULT_GALENIC_FORMS = [
  'Comprimé',
  'Gélule',
  'Sirop',
  'Suspension buvable',
  'Injectable',
  'Pommade',
  'Collyre',
  'Suppositoire',
  'Ovule',
  'Solution pour perfusion',
  'Sachet',
  'Aérosol',
  'Crème',
  'Gel',
  'Lotion',
  'Ampoule',
  'Patch',
];

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureSeedProducts();
  }

  private async resolveValidUserId(userId?: string): Promise<string> {
    const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUuid) {
      const user = await this.prisma.users.findUnique({ where: { id: userId } });
      if (user) return user.id;
    }
    const admin = await this.prisma.users.findFirst({ where: { username: 'admin' } });
    return admin?.id || '22222222-2222-2222-2222-222222222221';
  }

  private async ensureSeedProducts() {
    try {
      const productCount = await this.prisma.products.count();
      if (productCount === 0) {
        const pharmacy = await this.prisma.pharmacies.findFirst({ where: { code: 'OFF-KIN-001' } });
        if (!pharmacy) return;

        let catAntalgique = await this.prisma.product_categories.findFirst({
          where: { name: { contains: 'Antalgiques' } },
        });
        if (!catAntalgique) {
          catAntalgique = await this.prisma.product_categories.create({
            data: {
              pharmacy_id: pharmacy.id,
              name: 'Antalgiques & Antipyrétiques',
              description: 'Soulagement de la douleur et de la fièvre',
            },
          });
        }

        let catAntibio = await this.prisma.product_categories.findFirst({
          where: { name: { contains: 'Antibiotiques' } },
        });
        if (!catAntibio) {
          catAntibio = await this.prisma.product_categories.create({
            data: {
              pharmacy_id: pharmacy.id,
              name: 'Antibiotiques',
              description: 'Traitements antibactériens',
            },
          });
        }

        // 1. Doliprane 1000 mg
        const doliprane = await this.prisma.products.create({
          data: {
            id: '44444444-4444-4444-4444-444444444441',
            pharmacy_id: pharmacy.id,
            category_id: catAntalgique.id,
            name: 'Doliprane 1000 mg',
            dci: 'Paracétamol',
            dosage: '1000 mg',
            galenic_form: 'Comprimé',
            laboratory: 'Sanofi',
            selling_price_cdf: 3420.0,
            selling_price_usd: 1.2,
            tax_rate: 0.0,
            min_alert_threshold: 20,
            requires_prescription: false,
            is_controlled_substance: false,
            is_cold_chain: false,
            is_active: true,
          },
        });

        await this.prisma.product_barcodes.create({
          data: {
            pharmacy_id: pharmacy.id,
            product_id: doliprane.id,
            barcode: '3582910012345',
            is_primary: true,
          },
        });

        // 2. Amoxicilline 500 mg
        const amox = await this.prisma.products.create({
          data: {
            id: '44444444-4444-4444-4444-444444444442',
            pharmacy_id: pharmacy.id,
            category_id: catAntibio.id,
            name: 'Amoxicilline 500 mg',
            dci: 'Amoxicilline',
            dosage: '500 mg',
            galenic_form: 'Gélule',
            laboratory: 'Sandoz',
            selling_price_cdf: 9975.0,
            selling_price_usd: 3.5,
            tax_rate: 0.0,
            min_alert_threshold: 15,
            requires_prescription: true,
            is_controlled_substance: false,
            is_cold_chain: false,
            is_active: true,
          },
        });

        await this.prisma.product_barcodes.create({
          data: {
            pharmacy_id: pharmacy.id,
            product_id: amox.id,
            barcode: '3582910098765',
            is_primary: true,
          },
        });
      }
    } catch {
      // Ignorer si la base est occupée au premier démarrage
    }
  }

  // ==========================================
  // CAT-04 : GESTION DES CATÉGORIES
  // ==========================================

  async createCategory(dto: CreateCategoryDto, pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<ProductCategory> {
    const existing = await this.prisma.product_categories.findFirst({
      where: { pharmacy_id: pharmacyId, name: { equals: dto.name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`La catégorie "${dto.name}" existe déjà.`);
    }

    const created = await this.prisma.product_categories.create({
      data: {
        pharmacy_id: pharmacyId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
    });

    return {
      id: created.id,
      name: created.name,
      description: created.description ?? undefined,
    };
  }

  async listCategories(pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<ProductCategory[]> {
    const categories = await this.prisma.product_categories.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { name: 'asc' },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? undefined,
    }));
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<ProductCategory> {
    const category = await this.prisma.product_categories.findUnique({ where: { id } });
    if (!category || category.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Catégorie introuvable.');
    }

    if (dto.name && dto.name.trim() !== category.name) {
      const duplicate = await this.prisma.product_categories.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Une autre catégorie porte déjà le nom "${dto.name}".`);
      }
    }

    const updated = await this.prisma.product_categories.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        description: dto.description !== undefined ? dto.description.trim() : undefined,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
    };
  }

  async deleteCategory(id: string, pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<void> {
    const category = await this.prisma.product_categories.findUnique({ where: { id } });
    if (!category || category.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Catégorie introuvable.');
    }

    const linkedProducts = await this.prisma.products.count({
      where: { category_id: id },
    });
    if (linkedProducts > 0) {
      throw new BadRequestException(
        `Impossible de supprimer cette catégorie car ${linkedProducts} produit(s) y sont rattachés.`,
      );
    }

    await this.prisma.product_categories.delete({ where: { id } });
  }

  // ==========================================
  // CAT-04 : FORMES GALÉNIQUES ADMINISTRABLES
  // ==========================================

  async listGalenicForms(pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<string[]> {
    const setting = await this.prisma.settings.findUnique({
      where: {
        pharmacy_id_key: {
          pharmacy_id: pharmacyId,
          key: 'galenic_forms',
        },
      },
    });

    if (setting && Array.isArray(setting.value)) {
      return setting.value as string[];
    }

    // Récupérer les formes distinctes utilisées dans les produits
    const distinctInDb = await this.prisma.products.findMany({
      where: { pharmacy_id: pharmacyId, galenic_form: { not: null } },
      select: { galenic_form: true },
      distinct: ['galenic_form'],
    });

    const combined = Array.from(
      new Set([
        ...DEFAULT_GALENIC_FORMS,
        ...distinctInDb.map((p) => p.galenic_form as string).filter(Boolean),
      ]),
    ).sort();

    return combined;
  }

  async createGalenicForm(
    dto: CreateGalenicFormDto,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    authorId?: string,
  ): Promise<string[]> {
    const currentList = await this.listGalenicForms(pharmacyId);
    const formName = dto.name.trim();

    if (currentList.some((f) => f.toLowerCase() === formName.toLowerCase())) {
      throw new ConflictException(`La forme galénique "${formName}" existe déjà.`);
    }

    const updatedList = [...currentList, formName].sort();

    await this.prisma.settings.upsert({
      where: {
        pharmacy_id_key: {
          pharmacy_id: pharmacyId,
          key: 'galenic_forms',
        },
      },
      update: {
        value: updatedList,
        updated_at: new Date(),
      },
      create: {
        pharmacy_id: pharmacyId,
        key: 'galenic_forms',
        value: updatedList,
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Utilisateur habilité',
      action: 'FORME_GALENIQUE_CREEE',
      entityName: 'SETTING',
      entityId: 'galenic_forms',
      newValues: { name: formName },
    });

    return updatedList;
  }

  // ==========================================
  // CAT-01 à CAT-03 : CRÉATION ET GESTION PRODUITS
  // ==========================================

  async createProduct(
    dto: CreateProductDto,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    authorId?: string,
  ): Promise<InternalProduct> {
    // Validation d'unicité globale des codes-barres (CAT-03)
    if (dto.barcodes && dto.barcodes.length > 0) {
      for (const rawBarcode of dto.barcodes) {
        const barcode = rawBarcode.trim();
        if (!barcode) continue;
        const existingBarcode = await this.prisma.product_barcodes.findFirst({
          where: { pharmacy_id: pharmacyId, barcode },
          include: { products: true },
        });
        if (existingBarcode) {
          throw new ConflictException(
            `Le code-barres "${barcode}" est déjà attribué au produit "${existingBarcode.products.name}".`,
          );
        }
      }
    }

    const created = await this.prisma.products.create({
      data: {
        pharmacy_id: pharmacyId,
        category_id: dto.categoryId || undefined,
        name: dto.name.trim(),
        dci: dto.dci.trim(),
        dosage: dto.dosage?.trim() || undefined,
        galenic_form: dto.galenicForm?.trim() || undefined,
        laboratory: dto.laboratory?.trim() || undefined,
        selling_price_cdf: dto.sellingPriceCdf,
        selling_price_usd: dto.sellingPriceUsd,
        tax_rate: dto.taxRate ?? 0,
        min_alert_threshold: dto.minAlertThreshold ?? 10,
        max_threshold: dto.maxThreshold ?? undefined,
        security_stock: dto.securityStock ?? undefined,
        storage_location: dto.storageLocation?.trim() || undefined,
        requires_prescription: dto.requiresPrescription ?? false,
        is_controlled_substance: dto.isControlledSubstance ?? false,
        is_cold_chain: dto.isColdChain ?? false,
        is_active: true,
      },
    });

    const cleanBarcodes: string[] = [];
    if (dto.barcodes && dto.barcodes.length > 0) {
      const uniqueBarcodes = Array.from(new Set(dto.barcodes.map((b) => b.trim()).filter(Boolean)));
      if (uniqueBarcodes.length > 0) {
        await this.prisma.product_barcodes.createMany({
          data: uniqueBarcodes.map((b, idx) => ({
            pharmacy_id: pharmacyId,
            product_id: created.id,
            barcode: b,
            is_primary: idx === 0,
          })),
          skipDuplicates: true,
        });
        cleanBarcodes.push(...uniqueBarcodes);
      }
    }

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Pharmacien',
      action: 'PRODUIT_CREE',
      entityName: 'PRODUCT',
      entityId: created.id,
      newValues: {
        name: created.name,
        dci: created.dci,
        sellingPriceCdf: Number(created.selling_price_cdf),
        sellingPriceUsd: Number(created.selling_price_usd),
      },
    });

    return this.mapToInternalProduct(created, cleanBarcodes, dto.sellingUnit || 'Boîte', 0);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    userId?: string,
    hasPricePermission = false,
  ): Promise<InternalProduct> {
    const current = await this.prisma.products.findUnique({
      where: { id },
      include: { product_barcodes: true },
    });

    if (!current || current.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const oldPriceCdf = Number(current.selling_price_cdf);
    const oldPriceUsd = Number(current.selling_price_usd);
    const priceChanged =
      (dto.sellingPriceCdf !== undefined && dto.sellingPriceCdf !== oldPriceCdf) ||
      (dto.sellingPriceUsd !== undefined && dto.sellingPriceUsd !== oldPriceUsd);

    if (priceChanged && !hasPricePermission) {
      throw new ForbiddenException(
        'Accès refusé : la permission prix.modifier est requise pour modifier les prix de vente.',
      );
    }

    // Gestion des codes-barres s'ils sont fournis
    if (dto.barcodes) {
      const cleanList = Array.from(new Set(dto.barcodes.map((b) => b.trim()).filter(Boolean)));
      for (const bc of cleanList) {
        const existingBc = await this.prisma.product_barcodes.findFirst({
          where: {
            pharmacy_id: pharmacyId,
            barcode: bc,
            product_id: { not: id },
          },
          include: { products: true },
        });
        if (existingBc) {
          throw new ConflictException(
            `Le code-barres "${bc}" est déjà associé au produit "${existingBc.products.name}".`,
          );
        }
      }

      await this.prisma.product_barcodes.deleteMany({
        where: { product_id: id },
      });

      if (cleanList.length > 0) {
        await this.prisma.product_barcodes.createMany({
          data: cleanList.map((b, idx) => ({
            pharmacy_id: pharmacyId,
            product_id: id,
            barcode: b,
            is_primary: idx === 0,
          })),
        });
      }
    }

    const updated = await this.prisma.products.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        dci: dto.dci !== undefined ? dto.dci.trim() : undefined,
        dosage: dto.dosage !== undefined ? dto.dosage.trim() : undefined,
        galenic_form: dto.galenicForm !== undefined ? dto.galenicForm.trim() : undefined,
        laboratory: dto.laboratory !== undefined ? dto.laboratory.trim() : undefined,
        category_id: dto.categoryId !== undefined ? dto.categoryId || null : undefined,
        selling_price_cdf: dto.sellingPriceCdf !== undefined ? dto.sellingPriceCdf : undefined,
        selling_price_usd: dto.sellingPriceUsd !== undefined ? dto.sellingPriceUsd : undefined,
        tax_rate: dto.taxRate !== undefined ? dto.taxRate : undefined,
        min_alert_threshold: dto.minAlertThreshold !== undefined ? dto.minAlertThreshold : undefined,
        max_threshold: dto.maxThreshold !== undefined ? dto.maxThreshold : undefined,
        security_stock: dto.securityStock !== undefined ? dto.securityStock : undefined,
        storage_location: dto.storageLocation !== undefined ? dto.storageLocation.trim() : undefined,
        requires_prescription: dto.requiresPrescription !== undefined ? dto.requiresPrescription : undefined,
        is_controlled_substance: dto.isControlledSubstance !== undefined ? dto.isControlledSubstance : undefined,
        is_cold_chain: dto.isColdChain !== undefined ? dto.isColdChain : undefined,
        updated_at: new Date(),
      },
      include: {
        product_barcodes: true,
        product_categories: true,
        product_lots: {
          where: { is_quarantined: false, current_quantity: { gt: 0 } },
        },
      },
    });

    if (priceChanged) {
      const validUserId = await this.resolveValidUserId(userId);
      await this.prisma.price_history.create({
        data: {
          product_id: id,
          old_price_cdf: oldPriceCdf,
          new_price_cdf: dto.sellingPriceCdf ?? oldPriceCdf,
          old_price_usd: oldPriceUsd,
          new_price_usd: dto.sellingPriceUsd ?? oldPriceUsd,
          reason: 'Modification fiche produit',
          changed_by: validUserId,
        },
      });

      this.auditService.logAction({
        userId: userId || 'system',
        userName: 'Pharmacien',
        action: 'PRIX_MODIFIE',
        entityName: 'PRODUCT',
        entityId: id,
        oldValues: { sellingPriceCdf: oldPriceCdf, sellingPriceUsd: oldPriceUsd },
        newValues: { sellingPriceCdf: dto.sellingPriceCdf, sellingPriceUsd: dto.sellingPriceUsd },
      });
    }

    this.auditService.logAction({
      userId: userId || 'system',
      userName: 'Pharmacien',
      action: 'PRODUIT_MODIFIE',
      entityName: 'PRODUCT',
      entityId: id,
      newValues: { name: updated.name, dci: updated.dci },
    });

    const totalStock = updated.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
    const barcodes = updated.product_barcodes.map((b) => b.barcode);
    return this.mapToInternalProduct(updated, barcodes, dto.sellingUnit || 'Boîte', totalStock);
  }

  async getProductById(
    id: string,
    includeInactive = false,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<InternalProduct> {
    const product = await this.prisma.products.findUnique({
      where: { id },
      include: {
        product_barcodes: true,
        product_categories: true,
        product_lots: {
          where: {
            is_quarantined: false,
            current_quantity: { gt: 0 },
          },
        },
      },
    });

    if (!product || product.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    if (!product.is_active && !includeInactive) {
      throw new NotFoundException('Produit désactivé.');
    }

    const totalStock = product.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
    const barcodes = product.product_barcodes.map((b) => b.barcode);

    return this.mapToInternalProduct(product, barcodes, 'Boîte', totalStock);
  }

  // ==========================================
  // CAT-05 & PERF-01 : RECHERCHE INSTANTANÉE AVEC TOLÉRANCE AUX FAUTES (pg_trgm) ET PAGINATION
  // ==========================================

  async searchProducts(
    queryDto: ProductQueryDto = {},
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<PaginatedResult<InternalProduct>> {
    const q = queryDto.q?.trim() || '';
    const page = Math.max(1, Number(queryDto.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(queryDto.limit) || 20));
    const skip = (page - 1) * limit;

    let candidateIds: string[] | null = null;

    if (q) {
      // 1. Recherche tolérante aux fautes via pg_trgm similarity et ILIKE
      try {
        const rawResults: { id: string }[] = await this.prisma.$queryRawUnsafe(
          `
          SELECT DISTINCT p.id,
                 GREATEST(
                   similarity(p.name, $1),
                   similarity(p.dci, $1),
                   CASE WHEN p.name ILIKE $2 THEN 0.8 ELSE 0 END,
                   CASE WHEN p.dci ILIKE $2 THEN 0.7 ELSE 0 END,
                   CASE WHEN b.barcode ILIKE $2 THEN 1.0 ELSE 0 END
                 ) as score
          FROM products p
          LEFT JOIN product_barcodes b ON b.product_id = p.id
          WHERE p.pharmacy_id = $3::uuid
            AND (
              p.name ILIKE $2
              OR p.dci ILIKE $2
              OR b.barcode ILIKE $2
              OR similarity(p.name, $1) > 0.25
              OR similarity(p.dci, $1) > 0.25
            )
          ORDER BY score DESC
          LIMIT 200;
          `,
          q,
          `%${q}%`,
          pharmacyId,
        );

        candidateIds = rawResults.map((r) => r.id);
      } catch {
        // Fallback standard si pg_trgm rencontre une contrainte
        const standardMatches = await this.prisma.products.findMany({
          where: {
            pharmacy_id: pharmacyId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { dci: { contains: q, mode: 'insensitive' } },
              { product_barcodes: { some: { barcode: { contains: q, mode: 'insensitive' } } } },
            ],
          },
          select: { id: true },
          take: 200,
        });
        candidateIds = standardMatches.map((m) => m.id);
      }
    }

    // Construction du filtre Prisma
    const whereClause: any = {
      pharmacy_id: pharmacyId,
    };

    if (queryDto.isActive !== undefined) {
      whereClause.is_active = queryDto.isActive;
    } else {
      whereClause.is_active = true;
    }

    if (queryDto.categoryId) {
      whereClause.category_id = queryDto.categoryId;
    }

    if (queryDto.requiresPrescription !== undefined) {
      whereClause.requires_prescription = queryDto.requiresPrescription;
    }

    if (queryDto.isControlled !== undefined) {
      whereClause.is_controlled_substance = queryDto.isControlled;
    }

    if (queryDto.isColdChain !== undefined) {
      whereClause.is_cold_chain = queryDto.isColdChain;
    }

    if (candidateIds !== null) {
      whereClause.id = { in: candidateIds };
    }

    const [total, products] = await Promise.all([
      this.prisma.products.count({ where: whereClause }),
      this.prisma.products.findMany({
        where: whereClause,
        include: {
          product_barcodes: true,
          product_categories: true,
          product_lots: {
            where: {
              is_quarantined: false,
              current_quantity: { gt: 0 },
            },
          },
        },
        skip,
        take: limit,
        orderBy: queryDto.sortBy ? { [queryDto.sortBy]: queryDto.sortOrder || 'asc' } : { name: 'asc' },
      }),
    ]);

    const data = products.map((p) => {
      const totalStock = p.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
      const barcodes = p.product_barcodes.map((b) => b.barcode);
      return this.mapToInternalProduct(p, barcodes, 'Boîte', totalStock);
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ==========================================
  // AUTOCOMPLÉTION LÉGÈRE POUR LA CAISSE (CAT-05, PERF-01)
  // ==========================================

  async autocomplete(
    query: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<ProductAutocompleteItem[]> {
    const cleanQuery = query?.trim() || '';
    if (!cleanQuery) return [];

    let candidateIds: string[] = [];

    try {
      const rawResults: { id: string }[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT DISTINCT p.id,
               GREATEST(
                 similarity(p.name, $1),
                 similarity(p.dci, $1),
                 CASE WHEN p.name ILIKE $2 THEN 0.8 ELSE 0 END,
                 CASE WHEN p.dci ILIKE $2 THEN 0.7 ELSE 0 END,
                 CASE WHEN b.barcode ILIKE $2 THEN 1.0 ELSE 0 END
               ) as score
        FROM products p
        LEFT JOIN product_barcodes b ON b.product_id = p.id
        WHERE p.pharmacy_id = $3::uuid
          AND p.is_active = true
          AND (
            p.name ILIKE $2
            OR p.dci ILIKE $2
            OR b.barcode ILIKE $2
            OR similarity(p.name, $1) > 0.25
            OR similarity(p.dci, $1) > 0.25
          )
        ORDER BY score DESC
        LIMIT 10;
        `,
        cleanQuery,
        `%${cleanQuery}%`,
        pharmacyId,
      );

      candidateIds = rawResults.map((r) => r.id);
    } catch {
      const fallback = await this.prisma.products.findMany({
        where: {
          pharmacy_id: pharmacyId,
          is_active: true,
          OR: [
            { name: { contains: cleanQuery, mode: 'insensitive' } },
            { dci: { contains: cleanQuery, mode: 'insensitive' } },
            { product_barcodes: { some: { barcode: { contains: cleanQuery, mode: 'insensitive' } } } },
          ],
        },
        select: { id: true },
        take: 10,
      });
      candidateIds = fallback.map((f) => f.id);
    }

    if (candidateIds.length === 0) return [];

    const products = await this.prisma.products.findMany({
      where: { id: { in: candidateIds } },
      include: {
        product_barcodes: true,
        product_lots: {
          where: { is_quarantined: false, current_quantity: { gt: 0 } },
        },
      },
    });

    return products.map((p) => {
      const totalStock = p.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
      return {
        id: p.id,
        name: p.name,
        dci: p.dci,
        dosage: p.dosage ?? undefined,
        galenicForm: p.galenic_form ?? undefined,
        sellingUnit: 'Boîte',
        sellingPriceCdf: Number(p.selling_price_cdf),
        sellingPriceUsd: Number(p.selling_price_usd),
        totalStock,
        requiresPrescription: p.requires_prescription,
        isControlledSubstance: p.is_controlled_substance,
        isColdChain: p.is_cold_chain,
        barcodes: p.product_barcodes.map((b) => b.barcode),
      };
    });
  }

  // ==========================================
  // CAT-03 : GESTION MULTI-CODES-BARRES
  // ==========================================

  async addBarcode(
    productId: string,
    dto: AddBarcodeDto,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<InternalProduct> {
    const cleanBarcode = dto.barcode.trim();
    if (!cleanBarcode) {
      throw new BadRequestException('Le code-barres ne peut être vide.');
    }

    const product = await this.prisma.products.findUnique({ where: { id: productId } });
    if (!product || product.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const existingBarcode = await this.prisma.product_barcodes.findFirst({
      where: { pharmacy_id: pharmacyId, barcode: cleanBarcode },
      include: { products: true },
    });

    if (existingBarcode) {
      throw new ConflictException(
        `Le code-barres "${cleanBarcode}" est déjà associé au produit "${existingBarcode.products.name}".`,
      );
    }

    await this.prisma.product_barcodes.create({
      data: {
        pharmacy_id: pharmacyId,
        product_id: productId,
        barcode: cleanBarcode,
        is_primary: dto.isPrimary ?? false,
      },
    });

    return this.getProductById(productId, true, pharmacyId);
  }

  async removeBarcode(
    productId: string,
    barcodeId: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<InternalProduct> {
    const barcodeEntry = await this.prisma.product_barcodes.findUnique({
      where: { id: barcodeId },
    });

    if (!barcodeEntry || barcodeEntry.product_id !== productId || barcodeEntry.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Code-barres introuvable sur ce produit.');
    }

    await this.prisma.product_barcodes.delete({ where: { id: barcodeId } });

    return this.getProductById(productId, true, pharmacyId);
  }

  // ==========================================
  // CAT-06 : HISTORIQUE DES CHANGEMENTS DE PRIX
  // ==========================================

  async updatePrice(
    id: string,
    dto: UpdateProductPriceDto,
    userId: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<InternalProduct> {
    const product = await this.getProductById(id, true, pharmacyId);
    const oldCdf = product.sellingPriceCdf;
    const oldUsd = product.sellingPriceUsd;

    const updated = await this.prisma.products.update({
      where: { id },
      data: {
        selling_price_cdf: dto.newPriceCdf,
        selling_price_usd: dto.newPriceUsd,
        updated_at: new Date(),
      },
      include: {
        product_barcodes: true,
        product_categories: true,
        product_lots: {
          where: { is_quarantined: false, current_quantity: { gt: 0 } },
        },
      },
    });

    const validUserId = await this.resolveValidUserId(userId);
    await this.prisma.price_history.create({
      data: {
        product_id: id,
        old_price_cdf: oldCdf,
        new_price_cdf: dto.newPriceCdf,
        old_price_usd: oldUsd,
        new_price_usd: dto.newPriceUsd,
        reason: dto.reason.trim(),
        changed_by: validUserId,
      },
    });

    this.auditService.logAction({
      userId,
      userName: 'Pharmacien',
      action: 'PRIX_MODIFIE',
      entityName: 'PRODUCT',
      entityId: id,
      oldValues: { sellingPriceCdf: oldCdf, sellingPriceUsd: oldUsd },
      newValues: {
        sellingPriceCdf: dto.newPriceCdf,
        sellingPriceUsd: dto.newPriceUsd,
        reason: dto.reason,
      },
    });

    const totalStock = updated.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
    const barcodes = updated.product_barcodes.map((b) => b.barcode);
    return this.mapToInternalProduct(updated, barcodes, product.sellingUnit, totalStock);
  }

  async getPriceHistory(productId: string): Promise<PriceHistoryEntry[]> {
    const history = await this.prisma.price_history.findMany({
      where: { product_id: productId },
      include: { users: { select: { full_name: true, username: true } } },
      orderBy: { created_at: 'desc' },
    });

    return history.map((entry) => ({
      id: entry.id,
      productId: entry.product_id,
      oldPriceCdf: Number(entry.old_price_cdf),
      newPriceCdf: Number(entry.new_price_cdf),
      oldPriceUsd: Number(entry.old_price_usd),
      newPriceUsd: Number(entry.new_price_usd),
      changedBy: entry.changed_by,
      changedByName: entry.users?.full_name || entry.users?.username || 'Utilisateur',
      reason: entry.reason ?? '',
      changedAt: entry.created_at.toISOString(),
    }));
  }

  // ==========================================
  // CAT-08 : DÉSACTIVATION / RÉACTIVATION SANS SUPPRESSION (RG-06)
  // ==========================================

  async deactivateProduct(id: string, authorId?: string, pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<InternalProduct> {
    const product = await this.prisma.products.findUnique({ where: { id } });
    if (!product || product.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const updated = await this.prisma.products.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
      include: {
        product_barcodes: true,
        product_categories: true,
        product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } } },
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Pharmacien',
      action: 'PRODUIT_DESACTIVE',
      entityName: 'PRODUCT',
      entityId: id,
      newValues: { isActive: false },
    });

    const totalStock = updated.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
    const barcodes = updated.product_barcodes.map((b) => b.barcode);
    return this.mapToInternalProduct(updated, barcodes, 'Boîte', totalStock);
  }

  async activateProduct(id: string, authorId?: string, pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<InternalProduct> {
    const product = await this.prisma.products.findUnique({ where: { id } });
    if (!product || product.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const updated = await this.prisma.products.update({
      where: { id },
      data: { is_active: true, updated_at: new Date() },
      include: {
        product_barcodes: true,
        product_categories: true,
        product_lots: { where: { is_quarantined: false, current_quantity: { gt: 0 } } },
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Pharmacien',
      action: 'PRODUIT_REACTIVE',
      entityName: 'PRODUCT',
      entityId: id,
      newValues: { isActive: true },
    });

    const totalStock = updated.product_lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
    const barcodes = updated.product_barcodes.map((b) => b.barcode);
    return this.mapToInternalProduct(updated, barcodes, 'Boîte', totalStock);
  }

  // ==========================================
  // CAT-07 : IMPORT / EXPORT (RÉUTILISATION PATTERN SIMULATION/VALIDATION DE PAR)
  // ==========================================

  async exportCsv(pharmacyId = '11111111-1111-1111-1111-111111111111'): Promise<string> {
    const result = await this.searchProducts({ limit: 10000, isActive: undefined }, pharmacyId);
    const headers =
      'ID,Nom,DCI,Dosage,Forme_Galenique,Unite_Vente,Prix_CDF,Prix_USD,TVA,Seuil_Alerte,Sur_Ordonnance,Controle,Froid,Actif,Codes_Barres\n';
    const rows = result.data
      .map(
        (p) =>
          `"${p.id}","${p.name}","${p.dci}","${p.dosage || ''}","${p.galenicForm || ''}","${p.sellingUnit}","${p.sellingPriceCdf}","${p.sellingPriceUsd}","${p.taxRate}","${p.minAlertThreshold}","${p.requiresPrescription}","${p.isControlledSubstance}","${p.isColdChain}","${p.isActive}","${p.barcodes.join(';')}"`,
      )
      .join('\n');
    return headers + rows;
  }

  async simulateImport(
    csvContent: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<{
    totalRows: number;
    validRows: number;
    rejectedRows: { rowNumber: number; data: any; reason: string }[];
    preview: any[];
  }> {
    const lines = csvContent.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      throw new BadRequestException('Fichier CSV vide ou dépourvu de lignes de données.');
    }

    const rejectedRows: { rowNumber: number; data: any; reason: string }[] = [];
    const validData: any[] = [];
    const seenBarcodes = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.replace(/"/g, '').trim());
      const rowData = {
        name: parts[0] || '',
        dci: parts[1] || '',
        dosage: parts[2] || '',
        galenicForm: parts[3] || 'Comprimé',
        sellingUnit: parts[4] || 'Boîte',
        sellingPriceCdf: Number(parts[5]),
        sellingPriceUsd: Number(parts[6]) || 0,
        taxRate: Number(parts[7]) || 0,
        minAlertThreshold: Number(parts[8]) || 10,
        requiresPrescription: parts[9] === 'true' || parts[9] === '1',
        isControlledSubstance: parts[10] === 'true' || parts[10] === '1',
        isColdChain: parts[11] === 'true' || parts[11] === '1',
        barcodes: parts[12] ? parts[12].split(';').map((b) => b.trim()).filter(Boolean) : [],
      };

      if (!rowData.name) {
        rejectedRows.push({ rowNumber: i + 1, data: rowData, reason: 'Nom commercial manquant (CAT-01).' });
        continue;
      }

      if (!rowData.dci) {
        rejectedRows.push({ rowNumber: i + 1, data: rowData, reason: 'DCI obligatoire manquante (CAT-01).' });
        continue;
      }

      if (isNaN(rowData.sellingPriceCdf) || rowData.sellingPriceCdf < 0) {
        rejectedRows.push({ rowNumber: i + 1, data: rowData, reason: 'Prix CDF invalide ou négatif.' });
        continue;
      }

      // Vérification des codes-barres
      let barcodeConflict = false;
      for (const bc of rowData.barcodes) {
        if (seenBarcodes.has(bc)) {
          rejectedRows.push({
            rowNumber: i + 1,
            data: rowData,
            reason: `Code-barres en double dans le fichier : "${bc}".`,
          });
          barcodeConflict = true;
          break;
        }
        seenBarcodes.add(bc);

        const dbBc = await this.prisma.product_barcodes.findFirst({
          where: { pharmacy_id: pharmacyId, barcode: bc },
          include: { products: true },
        });
        if (dbBc) {
          rejectedRows.push({
            rowNumber: i + 1,
            data: rowData,
            reason: `Code-barres déjà existant en base : "${bc}" sur le produit "${dbBc.products.name}".`,
          });
          barcodeConflict = true;
          break;
        }
      }

      if (barcodeConflict) continue;

      validData.push(rowData);
    }

    return {
      totalRows: lines.length - 1,
      validRows: validData.length,
      rejectedRows,
      preview: validData.slice(0, 10),
    };
  }

  async executeImport(
    csvContent: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    authorId?: string,
  ): Promise<{ importedCount: number; rejectedCount: number }> {
    const simulation = await this.simulateImport(csvContent, pharmacyId);
    let importedCount = 0;

    for (const item of simulation.preview) {
      try {
        await this.createProduct(
          {
            name: item.name,
            dci: item.dci,
            dosage: item.dosage,
            galenicForm: item.galenicForm,
            sellingUnit: item.sellingUnit,
            sellingPriceCdf: item.sellingPriceCdf,
            sellingPriceUsd: item.sellingPriceUsd || Number((item.sellingPriceCdf / 2850).toFixed(2)),
            taxRate: item.taxRate,
            minAlertThreshold: item.minAlertThreshold,
            requiresPrescription: item.requiresPrescription,
            isControlledSubstance: item.isControlledSubstance,
            isColdChain: item.isColdChain,
            barcodes: item.barcodes,
          },
          pharmacyId,
          authorId,
        );
        importedCount += 1;
      } catch {
        // Ignorer les lignes rejetées
      }
    }

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Pharmacien',
      action: 'CATALOGUE_IMPORTE',
      entityName: 'CATALOG',
      entityId: pharmacyId,
      newValues: { importedCount, rejectedCount: simulation.rejectedRows.length },
    });

    return {
      importedCount,
      rejectedCount: simulation.rejectedRows.length,
    };
  }

  // ==========================================
  // MAPPER INTERNE
  // ==========================================

  private mapToInternalProduct(
    dbProduct: any,
    barcodes: string[],
    sellingUnit: string,
    totalStock: number,
  ): InternalProduct {
    return {
      id: dbProduct.id,
      pharmacyId: dbProduct.pharmacy_id,
      name: dbProduct.name,
      dci: dbProduct.dci,
      dosage: dbProduct.dosage ?? undefined,
      galenicForm: dbProduct.galenic_form ?? undefined,
      laboratory: dbProduct.laboratory ?? undefined,
      categoryId: dbProduct.category_id ?? undefined,
      category: dbProduct.product_categories
        ? {
            id: dbProduct.product_categories.id,
            name: dbProduct.product_categories.name,
            description: dbProduct.product_categories.description ?? undefined,
          }
        : undefined,
      sellingPriceCdf: Number(dbProduct.selling_price_cdf),
      sellingPriceUsd: Number(dbProduct.selling_price_usd),
      taxRate: Number(dbProduct.tax_rate),
      minAlertThreshold: dbProduct.min_alert_threshold,
      maxThreshold: dbProduct.max_threshold ?? undefined,
      securityStock: dbProduct.security_stock ?? undefined,
      storageLocation: dbProduct.storage_location ?? undefined,
      requiresPrescription: dbProduct.requires_prescription,
      isControlledSubstance: dbProduct.is_controlled_substance,
      isColdChain: dbProduct.is_cold_chain,
      barcodes,
      totalStock,
      sellingUnit,
      isActive: dbProduct.is_active,
    };
  }
}
