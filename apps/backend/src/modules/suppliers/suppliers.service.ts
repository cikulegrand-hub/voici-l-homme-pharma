import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@vhp/shared';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  CreatePurchaseOrderDto,
  ReceiveOrderDto,
  PurchaseOrderQueryDto,
} from './dto/suppliers.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CumpService } from '../stock/cump.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService implements OnModuleInit {
  private readonly logger = new Logger('SuppliersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cumpService: CumpService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit() {
    await this.ensureSeedSupplier();
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

  private async getCurrentExchangeRate(pharmacyId: string): Promise<number> {
    const rate = await this.prisma.exchange_rates.findFirst({
      where: {
        pharmacy_id: pharmacyId,
        base_currency: 'USD',
        target_currency: 'CDF',
        effective_date: { lte: new Date() },
      },
      orderBy: { effective_date: 'desc' },
    });
    if (!rate || Number(rate.rate) <= 0) {
      throw new BadRequestException(
        'Aucun taux de change USD/CDF en vigueur n’est configuré pour cette officine.',
      );
    }
    return Number(rate.rate);
  }

  private async nextPurchaseOrderNumber(tx: Prisma.TransactionClient, pharmacyId: string, year: number): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO purchase_order_sequences (pharmacy_id, order_year, next_number)
      VALUES (${pharmacyId}::uuid, ${year}, 1)
      ON CONFLICT (pharmacy_id, order_year) DO NOTHING
    `;
    const sequence = await tx.$queryRaw<{ next_number: number }[]>`
      SELECT next_number
      FROM purchase_order_sequences
      WHERE pharmacy_id = ${pharmacyId}::uuid AND order_year = ${year}
      FOR UPDATE
    `;
    if (!sequence[0]) {
      throw new BadRequestException('Impossible de verrouiller la séquence des bons de commande.');
    }
    await tx.$executeRaw`
      UPDATE purchase_order_sequences
      SET next_number = next_number + 1
      WHERE pharmacy_id = ${pharmacyId}::uuid AND order_year = ${year}
    `;
    return `BC-${year}-${String(Number(sequence[0].next_number)).padStart(5, '0')}`;
  }

  private async ensureSeedSupplier() {
    try {
      const count = await this.prisma.suppliers.count();
      if (count === 0) {
        const pharmacy = await this.prisma.pharmacies.findFirst({ where: { code: 'OFF-KIN-001' } });
        if (pharmacy) {
          await this.prisma.suppliers.create({
            data: {
              id: '77777777-7777-7777-7777-777777777771',
              pharmacy_id: pharmacy.id,
              name: 'Laborex RDC',
              contact_name: 'M. K. Kabongo',
              phone: '+243 81 100 20 30',
              email: 'commandes@laborex.cd',
              address: 'Av. de l’Échangeur, Limete, Kinshasa',
              payment_terms: 'Délai 48h, paiement 30 jours',
              lead_time_days: 2,
              is_active: true,
            },
          });
        }
      }
    } catch {
      // Ignorer si la base est occupée au premier démarrage
    }
  }

  // ==========================================
  // ACH-01 : GESTION DES FOURNISSEURS
  // ==========================================

  async createSupplier(dto: CreateSupplierDto, pharmacyId = '11111111-1111-1111-1111-111111111111', authorId?: string): Promise<Supplier> {
    const created = await this.prisma.suppliers.create({
      data: {
        pharmacy_id: pharmacyId,
        name: dto.name.trim(),
        contact_name: dto.contactName?.trim() || undefined,
        phone: dto.phone?.trim() || undefined,
        email: dto.email?.trim() || undefined,
        address: dto.address?.trim() || undefined,
        payment_terms: dto.paymentTerms?.trim() || undefined,
        lead_time_days: dto.leadTimeDays ?? 2,
        is_active: true,
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Gestionnaire Stock',
      action: 'FOURNISSEUR_CREE',
      entityName: 'SUPPLIER',
      entityId: created.id,
      newValues: { name: created.name, phone: created.phone },
    });

    return this.mapToSupplier(created);
  }

  async listSuppliers(pharmacyId = '11111111-1111-1111-1111-111111111111', _userId?: string): Promise<Supplier[]> {
    const list = await this.prisma.suppliers.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { name: 'asc' },
    });

    return list.map((s) => this.mapToSupplier(s));
  }

  async getSupplierById(id: string, pharmacyId = '11111111-1111-1111-1111-111111111111', _userId?: string): Promise<Supplier> {
    const s = await this.prisma.suppliers.findUnique({ where: { id } });
    if (!s || s.pharmacy_id !== pharmacyId || !s.is_active) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
    return this.mapToSupplier(s);
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, pharmacyId = '11111111-1111-1111-1111-111111111111', authorId?: string): Promise<Supplier> {
    await this.getSupplierById(id, pharmacyId);

    const updated = await this.prisma.suppliers.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        contact_name: dto.contactName !== undefined ? dto.contactName.trim() : undefined,
        phone: dto.phone !== undefined ? dto.phone.trim() : undefined,
        email: dto.email !== undefined ? dto.email.trim() : undefined,
        address: dto.address !== undefined ? dto.address.trim() : undefined,
        payment_terms: dto.paymentTerms !== undefined ? dto.paymentTerms.trim() : undefined,
        lead_time_days: dto.leadTimeDays !== undefined ? dto.leadTimeDays : undefined,
        updated_at: new Date(),
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Gestionnaire Stock',
      action: 'FOURNISSEUR_MODIFIE',
      entityName: 'SUPPLIER',
      entityId: updated.id,
      newValues: { name: updated.name },
    });

    return this.mapToSupplier(updated);
  }

  // ==========================================
  // ACH-02 & ACH-04 : BONS DE COMMANDE
  // ==========================================

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    userId: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<PurchaseOrder> {
    await this.getSupplierById(dto.supplierId, pharmacyId);
    const validUserId = await this.resolveValidUserId(userId);
    const year = new Date().getFullYear();
    const exchangeRate = await this.getCurrentExchangeRate(pharmacyId);

    const totalAmountCdf = dto.items.reduce(
      (sum, item) => sum + item.orderedQuantity * item.unitPriceCdf,
      0,
    );
    const totalAmountUsd = Number((totalAmountCdf / exchangeRate).toFixed(2));

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextPurchaseOrderNumber(tx, pharmacyId, year);
      return tx.purchase_orders.create({
        data: {
          pharmacy_id: pharmacyId,
          supplier_id: dto.supplierId,
          order_number: orderNumber,
          status: 'BROUILLON',
          total_amount_cdf: totalAmountCdf,
          total_amount_usd: totalAmountUsd,
          created_by: validUserId,
          notes: dto.notes?.trim() || undefined,
          expected_delivery_date: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          purchase_order_items: {
            create: dto.items.map((it) => ({
              product_id: it.productId,
              ordered_quantity: it.orderedQuantity,
              received_quantity: 0,
              unit_price_cdf: it.unitPriceCdf,
              unit_price_usd: it.unitPriceUsd || Number((it.unitPriceCdf / exchangeRate).toFixed(2)),
            })),
          },
        },
        include: {
          purchase_order_items: { include: { products: true } },
          suppliers: true,
        },
      });
    });

    this.auditService.logAction({
      userId: validUserId,
      userName: 'Gestionnaire Stock',
      action: 'BON_DE_COMMANDE_CREE',
      entityName: 'PURCHASE_ORDER',
      entityId: order.id,
      newValues: { orderNumber: order.order_number, totalAmountCdf, supplierId: dto.supplierId },
    });

    return this.mapToPurchaseOrder(order);
  }

  async listPurchaseOrders(
    queryDto: PurchaseOrderQueryDto = {},
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    _userId?: string,
  ): Promise<PurchaseOrder[]> {
    const where: any = { pharmacy_id: pharmacyId };
    if (queryDto.supplierId) where.supplier_id = queryDto.supplierId;
    if (queryDto.status) where.status = queryDto.status;

    const orders = await this.prisma.purchase_orders.findMany({
      where,
      include: {
        purchase_order_items: { include: { products: true } },
        suppliers: true,
        users: { select: { full_name: true, username: true } },
      },
      orderBy: { created_at: 'desc' },
      take: queryDto.limit || 50,
      skip: queryDto.page ? (queryDto.page - 1) * (queryDto.limit || 50) : 0,
    });

    return orders.map((o) => this.mapToPurchaseOrder(o));
  }

  async getPurchaseOrderById(id: string, pharmacyId = '11111111-1111-1111-1111-111111111111', _userId?: string): Promise<PurchaseOrder> {
    const order = await this.prisma.purchase_orders.findUnique({
      where: { id },
      include: {
        purchase_order_items: { include: { products: true } },
        suppliers: true,
        users: { select: { full_name: true, username: true } },
      },
    });

    if (!order || order.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Bon de commande introuvable.');
    }

    return this.mapToPurchaseOrder(order);
  }

  async updateOrderStatus(
    orderId: string,
    status: PurchaseOrderStatus,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
    authorId?: string,
  ): Promise<PurchaseOrder> {
    const order = await this.getPurchaseOrderById(orderId, pharmacyId, authorId);

    if (order.status === 'RECU' || order.status === 'ANNULE') {
      throw new BadRequestException(`Impossible de modifier le statut d’une commande ${order.status.toLowerCase()}.`);
    }

    const updated = await this.prisma.purchase_orders.update({
      where: { id: orderId },
      data: { status: status as any, updated_at: new Date() },
      include: {
        purchase_order_items: { include: { products: true } },
        suppliers: true,
      },
    });

    this.auditService.logAction({
      userId: authorId || 'system',
      userName: 'Gestionnaire Stock',
      action: 'STATUT_COMMANDE_MODIFIE',
      entityName: 'PURCHASE_ORDER',
      entityId: orderId,
      newValues: { oldStatus: order.status, newStatus: status },
    });

    return this.mapToPurchaseOrder(updated);
  }

  // ==========================================
  // ACH-04 & STK-01 : RÉCEPTION TRANSACTIONNELLE (TOTALE OU PARTIELLE)
  // ==========================================

  async receiveOrder(
    orderId: string,
    dto: ReceiveOrderDto,
    userId: string,
    pharmacyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<any> {
    const validUserId = await this.resolveValidUserId(userId);
    const exchangeRate = await this.getCurrentExchangeRate(pharmacyId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const order = await this.prisma.purchase_orders.findUnique({
      where: { id: orderId },
      include: { purchase_order_items: { include: { products: true } } },
    });

    if (!order || order.pharmacy_id !== pharmacyId) {
      throw new NotFoundException('Bon de commande introuvable.');
    }

    if (order.status === 'RECU' || order.status === 'ANNULE') {
      throw new BadRequestException(`Impossible de réceptionner une commande ${order.status.toLowerCase()}.`);
    }

    // Idempotence check
    if (dto.idempotencyKey) {
      const existingReceipt = await this.prisma.goods_receipts.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          purchase_order_id: orderId,
          idempotency_key: dto.idempotencyKey,
        },
      });
      if (existingReceipt) {
        this.logger.log(`Réception de commande idempotente rejouée : ${dto.idempotencyKey}`);
        return this.getPurchaseOrderById(orderId, pharmacyId);
      }
    }

    // Validation des dates de péremption
    for (const line of dto.lines) {
      const exp = new Date(line.expiryDate);
      if (exp <= today) {
        throw new BadRequestException(
          `Impossible de réceptionner le lot ${line.lotNumber} : il est déjà périmé.`,
        );
      }
    }

    const receiptNumber = `REC-BC-${Date.now().toString().slice(-6)}`;
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      // Verrouiller les lignes du bon pendant toute la réception afin d'éviter
      // les doubles réceptions concurrentes et les dépassements de commande.
      const lockedItems = await tx.$queryRaw<
        { id: string; product_id: string; ordered_quantity: number; received_quantity: number }[]
      >`
        SELECT id, product_id, ordered_quantity, received_quantity
        FROM purchase_order_items
        WHERE order_id = ${orderId}::uuid
        FOR UPDATE
      `;

      const itemById = new Map(lockedItems.map((item) => [item.id, item]));
      const itemByProduct = new Map<string, (typeof lockedItems)[number]>();
      for (const item of lockedItems) {
        if (!itemByProduct.has(item.product_id)) itemByProduct.set(item.product_id, item);
      }

      const receivedByItem = new Map<string, number>();
      for (const line of dto.lines) {
        const item = (line.purchaseOrderItemId ? itemById.get(line.purchaseOrderItemId) : undefined)
          || itemByProduct.get(line.productId);
        if (!item || item.product_id !== line.productId) {
          throw new BadRequestException(
            `La ligne de réception du produit ${line.productId} ne correspond pas à ce bon de commande.`,
          );
        }

        const alreadyReceived = receivedByItem.get(item.id) || 0;
        const remaining = item.ordered_quantity - item.received_quantity - alreadyReceived;
        if (line.receivedQuantity > remaining) {
          throw new BadRequestException(
            `Réception impossible pour le produit ${line.productId} : ${line.receivedQuantity} demandées, ${Math.max(0, remaining)} restantes sur le bon.`,
          );
        }
        receivedByItem.set(item.id, alreadyReceived + line.receivedQuantity);
      }

      // 1. Créer le bordereau de réception (goods_receipts)
      const receipt = await tx.goods_receipts.create({
        data: {
          pharmacy_id: pharmacyId,
          purchase_order_id: orderId,
          receipt_number: receiptNumber,
          received_by: validUserId,
          idempotency_key: dto.idempotencyKey || undefined,
          supplier_invoice_number: dto.supplierInvoiceNumber || undefined,
          notes: dto.notes || `Réception sur bon de commande ${order.order_number}`,
        },
      });

      // 2. Traiter chaque ligne réceptionnée
      for (const line of dto.lines) {
        let lot = await tx.product_lots.findUnique({
          where: {
            product_id_lot_number: {
              product_id: line.productId,
              lot_number: line.lotNumber.trim(),
            },
          },
        });

        if (lot) {
          lot = await tx.product_lots.update({
            where: { id: lot.id },
            data: {
              current_quantity: { increment: line.receivedQuantity },
              purchase_price_cdf: line.actualPurchasePriceCdf,
              purchase_price_usd: line.actualPurchasePriceUsd || Number((line.actualPurchasePriceCdf / exchangeRate).toFixed(2)),
              ...(line.storageLocation ? { storage_location: line.storageLocation } : {}),
            },
          });
        } else {
          lot = await tx.product_lots.create({
            data: {
              product_id: line.productId,
              lot_number: line.lotNumber.trim(),
              expiry_date: new Date(line.expiryDate),
              purchase_price_cdf: line.actualPurchasePriceCdf,
              purchase_price_usd: line.actualPurchasePriceUsd || Number((line.actualPurchasePriceCdf / exchangeRate).toFixed(2)),
              initial_quantity: line.receivedQuantity,
              current_quantity: line.receivedQuantity,
              is_quarantined: false,
              storage_location: line.storageLocation,
            },
          });
        }

        // Ligne de réception
        await tx.goods_receipt_lines.create({
          data: {
            receipt_id: receipt.id,
            purchase_order_item_id: line.purchaseOrderItemId || undefined,
            product_id: line.productId,
            lot_id: lot.id,
            ordered_quantity: line.receivedQuantity,
            received_quantity: line.receivedQuantity,
            unit_purchase_price_cdf: line.actualPurchasePriceCdf,
            unit_purchase_price_usd: line.actualPurchasePriceUsd || Number((line.actualPurchasePriceCdf / exchangeRate).toFixed(2)),
          },
        });

        // Mouvement de stock inaltérable (STK-06)
        await tx.stock_movements.create({
          data: {
            pharmacy_id: pharmacyId,
            lot_id: lot.id,
            user_id: validUserId,
            type: 'RECEPTION_FOURNISSEUR',
            quantity: line.receivedQuantity,
            direction: 'IN',
            unit_cost_cdf: line.actualPurchasePriceCdf,
            reason: `Réception bon de commande ${order.order_number} (Lot ${line.lotNumber})`,
            reference_id: receipt.id,
          },
        });

        // Mise à jour CUMP selon RG-14
        await this.cumpService.updateCumpOnReception(tx, line.productId, line.receivedQuantity, line.actualPurchasePriceCdf);

        // Mettre à jour la ligne du bon de commande (received_quantity)
        const orderItem = (line.purchaseOrderItemId
          ? order.purchase_order_items.find((it) => it.id === line.purchaseOrderItemId)
          : order.purchase_order_items.find((it) => it.product_id === line.productId));
        if (orderItem) {
          await tx.purchase_order_items.update({
            where: { id: orderItem.id },
            data: { received_quantity: { increment: line.receivedQuantity } },
          });
        }
      }

      // 3. Déterminer si le bon est totalement ou partiellement reçu
      const refreshedItems = await tx.purchase_order_items.findMany({
        where: { order_id: orderId },
      });

      const allReceived = refreshedItems.every((it) => it.received_quantity >= it.ordered_quantity);
      const newStatus: PurchaseOrderStatus = allReceived ? 'RECU' : 'PARTIELLEMENT_RECU';

      const updatedOrder = await tx.purchase_orders.update({
        where: { id: orderId },
        data: {
          status: newStatus as any,
          received_date: allReceived ? new Date() : undefined,
          updated_at: new Date(),
        },
        include: {
          purchase_order_items: { include: { products: true } },
          suppliers: true,
          users: { select: { full_name: true, username: true } },
        },
      });

      return this.mapToPurchaseOrder(updatedOrder);
      }, { timeout: 15000 });
    } catch (error) {
      if (dto.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingReceipt = await this.prisma.goods_receipts.findFirst({
          where: {
            pharmacy_id: pharmacyId,
            purchase_order_id: orderId,
            idempotency_key: dto.idempotencyKey,
          },
        });
        if (existingReceipt) {
          return this.getPurchaseOrderById(orderId, pharmacyId, validUserId);
        }
      }
      throw error;
    }

    this.auditService.logAction({
      userId: validUserId,
      userName: 'Magasinier',
      action: 'RECEPTION_COMMANDE_FOURNISSEUR',
      entityName: 'PURCHASE_ORDER',
      entityId: order.id,
      newValues: { orderNumber: order.order_number, linesReceived: dto.lines.length },
    }).catch((e) => this.logger.warn(`Erreur audit log reception: ${e.message}`));

    const nearExpiryWarnings: { lotNumber: string; expiryDate: string; daysUntilExpiry: number; message: string }[] = [];
    for (const line of dto.lines) {
      const days = Math.floor((new Date(line.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0 && days <= 30) {
        nearExpiryWarnings.push({
          lotNumber: line.lotNumber,
          expiryDate: line.expiryDate,
          daysUntilExpiry: days,
          message: `Péremption trop proche pour le lot ${line.lotNumber} (${days} j).`,
        });
      }
    }

    return { ...result, nearExpiryWarnings, orderStatus: result.status };
  }

  // ==========================================
  // ACH-02 : EXPORT PDF DU BON DE COMMANDE
  // ==========================================

  async exportPurchaseOrderPdf(orderId: string, pharmacyId = '11111111-1111-1111-1111-111111111111', _userId?: string): Promise<Buffer> {
    const order = await this.getPurchaseOrderById(orderId, pharmacyId, _userId);
    const pharmacy = await this.prisma.pharmacies.findUnique({ where: { id: pharmacyId } });

    // Génération d'un document PDF 1.4 binaire standardisé
    return this.generatePurchaseOrderPdfBuffer(order, pharmacy);
  }

  private generatePurchaseOrderPdfBuffer(order: PurchaseOrder, pharmacy: any): Buffer {
    const lines = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    ];

    const pharmacyName = pharmacy?.name || "VOICI L'HOMME PHARMA";
    const pharmacyCity = pharmacy?.city || 'Kinshasa, RDC';
    const supplierName = order.supplierName || 'Fournisseur';

    // Construction du flux de texte PDF
    let contentStream = 'BT /F1 16 Tf 50 780 Td (' + pharmacyName + ') Tj ET\n';
    contentStream += 'BT /F1 10 Tf 50 765 Td (' + pharmacyCity + ' - Officine Pharmaceutique Agréée) Tj ET\n';
    contentStream += 'BT /F1 14 Tf 50 725 Td (BON DE COMMANDE FOURNISSEUR N° ' + order.orderNumber + ') Tj ET\n';
    contentStream += 'BT /F1 10 Tf 50 705 Td (Date: ' + order.orderDate.slice(0, 10) + ' | Statut: ' + order.status + ') Tj ET\n';
    contentStream += 'BT /F1 10 Tf 50 680 Td (Fournisseur : ' + supplierName + ') Tj ET\n';
    contentStream += 'BT /F1 10 Tf 50 650 Td (------------------------------------------------------------------------------------------------------) Tj ET\n';
    contentStream += 'BT /F1 9 Tf 50 635 Td (Article / Produit                  | DCI                  | Qte Cdee | Prix Unit. CDF | Total CDF) Tj ET\n';
    contentStream += 'BT /F1 10 Tf 50 625 Td (------------------------------------------------------------------------------------------------------) Tj ET\n';

    let y = 605;
    for (const item of order.items) {
      const pName = (item.productName || 'Produit').slice(0, 28).padEnd(30, ' ');
      const pDci = (item.dci || '').slice(0, 18).padEnd(20, ' ');
      const qty = String(item.orderedQuantity).padStart(6, ' ');
      const price = String(item.unitPriceCdf).padStart(12, ' ');
      const total = String(item.orderedQuantity * item.unitPriceCdf).padStart(12, ' ');

      contentStream += `BT /F1 9 Tf 50 ${y} Td (${pName} | ${pDci} | ${qty} | ${price} | ${total}) Tj ET\n`;
      y -= 20;
    }

    contentStream += `BT /F1 10 Tf 50 ${y} Td (------------------------------------------------------------------------------------------------------) Tj ET\n`;
    y -= 25;
    contentStream += `BT /F1 12 Tf 50 ${y} Td (TOTAL COMMANDE : ${order.totalAmountCdf.toLocaleString()} CDF  /  ${order.totalAmountUsd.toLocaleString()} USD) Tj ET\n`;
    y -= 50;
    contentStream += `BT /F1 10 Tf 50 ${y} Td (Visa et Cachet du Pharmacien Titulaire Responsable :) Tj ET\n`;

    const streamLength = Buffer.byteLength(contentStream);
    lines.push(`5 0 obj << /Length ${streamLength} >> stream\n${contentStream}\nendstream\nendobj`);

    // Table de références croisées (XREF)
    const pdfBody = lines.join('\n') + '\n';
    const xrefOffset = Buffer.byteLength(pdfBody);
    const xref = [
      'xref',
      '0 6',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000244 00000 n ',
      '0000000325 00000 n ',
      'trailer << /Size 6 /Root 1 0 R >>',
      'startxref',
      String(xrefOffset),
      '%%EOF',
    ].join('\n');

    return Buffer.from(pdfBody + xref);
  }

  // ==========================================
  // MAPPER INTERNE
  // ==========================================

  private mapToSupplier(dbSupplier: any): Supplier {
    return {
      id: dbSupplier.id,
      pharmacyId: dbSupplier.pharmacy_id,
      name: dbSupplier.name,
      contactName: dbSupplier.contact_name ?? undefined,
      phone: dbSupplier.phone ?? undefined,
      email: dbSupplier.email ?? undefined,
      address: dbSupplier.address ?? undefined,
      paymentTerms: dbSupplier.payment_terms ?? undefined,
      leadTimeDays: dbSupplier.lead_time_days,
      isActive: dbSupplier.is_active,
      createdAt: dbSupplier.created_at ? dbSupplier.created_at.toISOString() : undefined,
    };
  }

  private mapToPurchaseOrder(dbOrder: any): PurchaseOrder {
    return {
      id: dbOrder.id,
      pharmacyId: dbOrder.pharmacy_id,
      supplierId: dbOrder.supplier_id,
      supplierName: dbOrder.suppliers?.name || undefined,
      orderNumber: dbOrder.order_number,
      status: dbOrder.status as PurchaseOrderStatus,
      items: dbOrder.purchase_order_items?.map((it: any) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.products?.name || undefined,
        dci: it.products?.dci || undefined,
        dosage: it.products?.dosage || undefined,
        orderedQuantity: it.ordered_quantity,
        receivedQuantity: it.received_quantity,
        unitPriceCdf: Number(it.unit_price_cdf),
        unitPriceUsd: Number(it.unit_price_usd),
        totalAmountCdf: Number(it.ordered_quantity) * Number(it.unit_price_cdf),
      })) ?? [],
      totalAmountCdf: Number(dbOrder.total_amount_cdf),
      totalAmountUsd: Number(dbOrder.total_amount_usd),
      createdBy: dbOrder.created_by,
      createdByName: dbOrder.users?.full_name || dbOrder.users?.username || undefined,
      orderDate: dbOrder.order_date.toISOString(),
      expectedDeliveryDate: dbOrder.expected_delivery_date ? dbOrder.expected_delivery_date.toISOString() : undefined,
      receivedDate: dbOrder.received_date ? dbOrder.received_date.toISOString() : undefined,
      notes: dbOrder.notes ?? undefined,
      createdAt: dbOrder.created_at ? dbOrder.created_at.toISOString() : undefined,
    };
  }
}
