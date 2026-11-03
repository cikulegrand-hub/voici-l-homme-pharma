import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from '@vhp/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, CreatePrescriptionDto, CustomerQueryDto, SettleDebtDto } from './dto/customers.dto';
import { PrescriptionStorageService } from './prescription-storage.service';

type Actor = { id: string; pharmacyId: string; role: string; fullName?: string };

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storage: PrescriptionStorageService,
  ) {}

  async createCustomer(dto: CreateCustomerDto, actor: Actor): Promise<Customer> {
    const customer = await this.prisma.$transaction(async (tx) => {
      const count = await tx.customers.count({ where: { pharmacy_id: actor.pharmacyId } });
      return tx.customers.create({
        data: {
          pharmacy_id: actor.pharmacyId,
          code: `CLI-${String(count + 1).padStart(4, '0')}`,
          full_name: dto.fullName.trim(), phone: dto.phone, email: dto.email,
          company_name: dto.companyName, address: dto.address,
          customer_type: dto.customerType as any, credit_limit_cdf: dto.creditLimitCdf,
          current_balance_cdf: 0, medical_notes: dto.medicalNotes, is_active: true,
        },
      });
    });
    await this.audit(actor, 'CLIENT_CREE', 'CUSTOMER', customer.id, undefined, { customerType: customer.customer_type });
    return this.mapCustomer(customer, 0);
  }

  async listCustomers(actor: Actor, query: CustomerQueryDto): Promise<Customer[]> {
    const where: any = { pharmacy_id: actor.pharmacyId, is_active: true };
    if (query.customerType) where.customer_type = query.customerType;
    if (query.search?.trim()) {
      where.OR = ['full_name', 'code', 'phone', 'company_name'].map((field) => ({
        [field]: { contains: query.search.trim(), mode: 'insensitive' },
      }));
    }
    const customers = await this.prisma.customers.findMany({ where, orderBy: { full_name: 'asc' } });
    const result: Customer[] = [];
    for (const customer of customers) {
      const balance = await this.calculateBalance(customer.id, actor.pharmacyId);
      result.push(this.mapCustomer(customer, balance));
    }
    return result;
  }

  async getCustomerById(id: string, actor?: Actor): Promise<Customer> {
    const customer = actor?.pharmacyId
      ? await this.getCustomerEntity(id, actor.pharmacyId)
      : await this.prisma.customers.findFirst({ where: { id, is_active: true } });
    if (!customer) throw new NotFoundException('Client introuvable.');
    return this.mapCustomer(customer, await this.calculateBalance(id, customer.pharmacy_id));
  }

  async checkCreditAvailability(customerId: string, amountToBorrowCdf: number, pharmacyId?: string): Promise<boolean> {
    const customer = pharmacyId
      ? await this.getCustomerEntity(customerId, pharmacyId)
      : await this.prisma.customers.findUnique({ where: { id: customerId } });
    if (!customer?.is_active) throw new NotFoundException('Client introuvable.');
    const balance = await this.calculateBalance(customerId, customer.pharmacy_id);
    if (balance + amountToBorrowCdf > Number(customer.credit_limit_cdf)) {
      throw new BadRequestException(`Le plafond de crédit est dépassé : solde ${balance} CDF, plafond ${Number(customer.credit_limit_cdf)} CDF.`);
    }
    return true;
  }

  async getCustomerHistory(customerId: string, actor: Actor) {
    await this.getCustomerEntity(customerId, actor.pharmacyId);
    const [sales, payments] = await Promise.all([
      this.prisma.sales.findMany({
        where: { customer_id: customerId, pharmacy_id: actor.pharmacyId, status: 'VALIDEE' },
        select: { id: true, invoice_number: true, created_at: true, total_amount_cdf: true, sale_payments: { select: { payment_method: true, amount_in_cdf: true } } },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.customer_payments.findMany({
        where: { customer_id: customerId, pharmacy_id: actor.pharmacyId },
        include: { customer_payment_allocations: { select: { sale_id: true, amount_cdf: true } } }, orderBy: { created_at: 'desc' },
      }),
    ]);
    return {
      purchases: sales.map((sale) => ({ id: sale.id, invoiceNumber: sale.invoice_number, date: sale.created_at, totalCdf: Number(sale.total_amount_cdf), creditCdf: sale.sale_payments.filter((p) => p.payment_method === 'CREDIT_CLIENT').reduce((sum, p) => sum + Number(p.amount_in_cdf), 0) })),
      payments: payments.map((payment) => ({ id: payment.id, amountPaidCdf: Number(payment.amount_paid_cdf), currency: payment.currency, method: payment.payment_method, receiptReference: payment.receipt_reference, createdAt: payment.created_at, allocations: payment.customer_payment_allocations.map((allocation) => ({ saleId: allocation.sale_id, amountCdf: Number(allocation.amount_cdf) })) })),
    };
  }

  async settleDebt(customerId: string, dto: SettleDebtDto, actor: Actor) {
    const existing = await this.prisma.customer_payments.findFirst({ where: { pharmacy_id: actor.pharmacyId, idempotency_key: dto.idempotencyKey }, include: { customer_payment_allocations: true } });
    if (existing) return await this.paymentResult(existing, actor.pharmacyId);

    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customers.findFirst({ where: { id: customerId, pharmacy_id: actor.pharmacyId, is_active: true } });
      if (!customer) throw new NotFoundException('Client introuvable.');
      const amountCdf = await this.toCdf(dto.amountPaidCdf, dto.currency, actor.pharmacyId, tx);
      const session = await tx.cash_sessions.findFirst({ where: { id: dto.cashSessionId, pharmacy_id: actor.pharmacyId, user_id: actor.id, status: 'OUVERTE' } });
      if (!session) throw new BadRequestException('Une session de caisse ouverte de l’utilisateur est requise pour ce règlement.');

      const invoices = await tx.sales.findMany({
        where: { pharmacy_id: actor.pharmacyId, customer_id: customerId, status: 'VALIDEE', sale_payments: { some: { payment_method: 'CREDIT_CLIENT' } } },
        include: { sale_payments: true, customer_payment_allocations: true }, orderBy: { created_at: 'asc' },
      });
      let remaining = amountCdf;
      const allocations: { sale_id: string; amount_cdf: number }[] = [];
      for (const invoice of invoices) {
        const credit = invoice.sale_payments.filter((p) => p.payment_method === 'CREDIT_CLIENT').reduce((sum, p) => sum + Number(p.amount_in_cdf), 0);
        const alreadyAllocated = invoice.customer_payment_allocations.reduce((sum, a) => sum + Number(a.amount_cdf), 0);
        const due = Math.max(0, credit - alreadyAllocated);
        const allocated = Math.min(due, remaining);
        if (allocated > 0) allocations.push({ sale_id: invoice.id, amount_cdf: allocated });
        remaining -= allocated;
        if (remaining <= 0) break;
      }
      if (!allocations.length || remaining > 0) throw new BadRequestException('Le montant dépasse le solde dû du client.');
      const receiptReference = `RCL-${new Date().getFullYear()}-${Date.now()}`;
      const payment = await tx.customer_payments.create({
        data: {
          pharmacy_id: actor.pharmacyId, customer_id: customerId, cash_session_id: session.id, user_id: actor.id,
          amount_paid_cdf: amountCdf, currency: dto.currency, payment_method: dto.paymentMethod,
          amount_paid: dto.amountPaidCdf,
          idempotency_key: dto.idempotencyKey, receipt_reference: receiptReference, notes: dto.notes,
          customer_payment_allocations: { create: allocations },
        }, include: { customer_payment_allocations: true },
      });
      await tx.customers.update({ where: { id: customerId }, data: { current_balance_cdf: { decrement: amountCdf } } });
      if (dto.paymentMethod === 'ESPECES') await tx.cash_sessions.update({ where: { id: session.id }, data: { expected_amount_cdf: { increment: amountCdf } } });
      return payment;
    });
    await this.audit(actor, 'REGLEMENT_CREANCE_CLIENT', 'CUSTOMER_PAYMENT', result.id, undefined, { customerId, amountCdf: Number(result.amount_paid_cdf), idempotencyKey: dto.idempotencyKey });
    return await this.paymentResult(result, actor.pharmacyId);
  }

  async getAccountStatement(customerId: string, actor: Actor) {
    const customer = await this.getCustomerEntity(customerId, actor.pharmacyId);
    const [history, balance] = await Promise.all([this.getCustomerHistory(customerId, actor), this.calculateBalance(customerId, actor.pharmacyId)]);
    return { customer: this.mapCustomer(customer, balance), currentBalanceCdf: balance, availableCreditCdf: Math.max(0, Number(customer.credit_limit_cdf) - balance), ...history, generatedAt: new Date().toISOString() };
  }

  async createPrescription(dto: CreatePrescriptionDto, file: Express.Multer.File | undefined, actor: Actor) {
    await this.getCustomerEntity(dto.customerId, actor.pharmacyId);
    let path = dto.storageFilePath;
    if (file) {
      this.storage.validateImage(file);
      path = await this.storage.upload(dto.customerId, file);
    } else if (!path) {
      throw new BadRequestException('Une image d’ordonnance ou un chemin de fichier valide est requis.');
    }
    const prescription = await this.prisma.prescriptions.create({
      data: {
        customer_id: dto.customerId,
        prescriber_name: dto.prescriberName,
        health_center: dto.healthCenter,
        prescription_date: new Date(dto.prescriptionDate),
        storage_file_path: path,
        prescription_text: dto.prescriptionText,
        verified_by: actor.id,
        verified_at: new Date(),
      },
    });
    await this.audit(actor, 'ORDONNANCE_ENREGISTREE', 'PRESCRIPTION', prescription.id, undefined, { customerId: dto.customerId });
    return this.mapPrescription(prescription);
  }

  async getPrescriptionsByCustomer(customerId: string, actor: Actor) {
    await this.getCustomerEntity(customerId, actor.pharmacyId);
    const where: any = { customer_id: customerId, customers: { pharmacy_id: actor.pharmacyId } };
    if (actor.role === 'CAISSIER') where.verified_by = actor.id;
    const list = await this.prisma.prescriptions.findMany({ where, orderBy: { created_at: 'desc' } });
    await this.audit(actor, 'CONSULTATION_ORDONNANCE', 'PRESCRIPTION', customerId, undefined, { count: list.length });
    return list.map((prescription) => this.mapPrescription(prescription));
  }

  async getPrescriptionSignedUrl(prescriptionId: string, actor: Actor) {
    const prescription = await this.prisma.prescriptions.findFirst({ where: { id: prescriptionId, customers: { pharmacy_id: actor.pharmacyId } } });
    if (!prescription) throw new NotFoundException('Ordonnance introuvable.');
    if (actor.role === 'CAISSIER' && prescription.verified_by !== actor.id) throw new ForbiddenException('Un caissier ne peut pas consulter les images d’ordonnances des autres utilisateurs.');
    const signed = await this.storage.createSignedUrl(prescription.storage_file_path);
    await this.audit(actor, 'CONSULTATION_IMAGE_ORDONNANCE', 'PRESCRIPTION', prescription.id, undefined, { expiresAt: signed.expiresAt });
    return { ...signed, storageMode: this.storage.usesLocalStorage() ? 'local' : 'supabase' };
  }

  async getPrescriptionFile(prescriptionId: string, actor: Actor) {
    const prescription = await this.prisma.prescriptions.findFirst({ where: { id: prescriptionId, customers: { pharmacy_id: actor.pharmacyId } } });
    if (!prescription) throw new NotFoundException('Ordonnance introuvable.');
    if (actor.role === 'CAISSIER' && prescription.verified_by !== actor.id) throw new ForbiddenException('Un caissier ne peut pas consulter les images d’ordonnances des autres utilisateurs.');
    const file = await this.storage.readLocal(prescription.storage_file_path);
    await this.audit(actor, 'CONSULTATION_IMAGE_ORDONNANCE', 'PRESCRIPTION', prescription.id, undefined, { local: true });
    return { file, storageFilePath: prescription.storage_file_path };
  }

  async getPrivacyNotice(actor: Actor) {
    const setting = await this.prisma.settings.findUnique({ where: { pharmacy_id_key: { pharmacy_id: actor.pharmacyId, key: 'cli.privacy_notice' } } });
    return { text: (setting?.value as any)?.text || 'Vos données de santé sont confidentielles et traitées uniquement pour votre prise en charge pharmaceutique.', updatedAt: setting?.updated_at ?? null };
  }

  private async calculateBalance(customerId: string, pharmacyId: string): Promise<number> {
    const invoices = await this.prisma.sales.findMany({ where: { pharmacy_id: pharmacyId, customer_id: customerId, status: 'VALIDEE', sale_payments: { some: { payment_method: 'CREDIT_CLIENT' } } }, include: { sale_payments: true, customer_payment_allocations: true } });
    return invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.sale_payments.filter((p) => p.payment_method === 'CREDIT_CLIENT').reduce((value, p) => value + Number(p.amount_in_cdf), 0) - invoice.customer_payment_allocations.reduce((value, p) => value + Number(p.amount_cdf), 0)), 0);
  }

  private async getCustomerEntity(id: string, pharmacyId: string) {
    const customer = await this.prisma.customers.findFirst({ where: { id, pharmacy_id: pharmacyId, is_active: true } });
    if (!customer) throw new NotFoundException('Client introuvable.');
    return customer;
  }

  private async toCdf(amount: number, currency: string, pharmacyId: string, tx: any): Promise<number> {
    if (currency === 'CDF') return amount;
    const rate = await tx.exchange_rates.findFirst({ where: { pharmacy_id: pharmacyId, base_currency: 'USD', target_currency: 'CDF', effective_date: { lte: new Date() } }, orderBy: { effective_date: 'desc' } });
    if (!rate) throw new BadRequestException('Aucun taux USD/CDF en vigueur pour convertir le règlement.');
    return Math.round(amount * Number(rate.rate) * 100) / 100;
  }

  private async paymentResult(payment: any, pharmacyId: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id: payment.customer_id },
      select: { full_name: true, code: true, current_balance_cdf: true },
    });
    const allocations = await Promise.all(
      payment.customer_payment_allocations.map(async (allocation: any) => {
        const sale = await this.prisma.sales.findUnique({
          where: { id: allocation.sale_id },
          select: { invoice_number: true, created_at: true },
        });
        return {
          saleId: allocation.sale_id,
          invoiceNumber: sale?.invoice_number || 'N/A',
          saleDate: sale?.created_at,
          amountCdf: Number(allocation.amount_cdf),
        };
      }),
    );
    return {
      id: payment.id,
      receiptReference: payment.receipt_reference,
      amountPaidCdf: Number(payment.amount_paid_cdf),
      currency: payment.currency,
      paymentMethod: payment.payment_method,
      createdAt: payment.created_at,
      customerId: payment.customer_id,
      customerName: customer?.full_name,
      customerCode: customer?.code,
      remainingBalanceCdf: Number(customer?.current_balance_cdf || 0),
      allocations,
      pharmacyId,
    };
  }

  private mapCustomer(customer: any, balance: number): Customer {
    return { id: customer.id, code: customer.code, fullName: customer.full_name, phone: customer.phone ?? undefined, email: customer.email ?? undefined, companyName: customer.company_name ?? undefined, customerType: customer.customer_type, creditLimitCdf: Number(customer.credit_limit_cdf), currentBalanceCdf: balance, medicalNotes: customer.medical_notes ?? undefined };
  }

  private mapPrescription(prescription: any) {
    return { id: prescription.id, customerId: prescription.customer_id, prescriberName: prescription.prescriber_name, healthCenter: prescription.health_center ?? undefined, prescriptionDate: prescription.prescription_date.toISOString().slice(0, 10), prescriptionText: prescription.prescription_text ?? undefined, createdAt: prescription.created_at };
  }

  private audit(actor: Actor, action: string, entityName: string, entityId: string, oldValues?: Record<string, unknown>, newValues?: Record<string, unknown>) {
    return this.auditService.logAction({ pharmacyId: actor.pharmacyId, userId: actor.id, userName: actor.fullName, action, entityName, entityId, oldValues, newValues });
  }
}
