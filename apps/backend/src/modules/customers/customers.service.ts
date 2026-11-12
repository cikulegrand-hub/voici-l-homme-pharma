import { BadRequestException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from '@vhp/shared';
import { ErrorCode } from '../../common/error-codes.enum';
import { throwError } from '../../common/error.utils';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, CreatePrescriptionDto, CustomerQueryDto, SettleDebtDto, UpdateCustomerDto, CreateQuickCustomerDto } from './dto/customers.dto';
import { PrescriptionStorageService } from './prescription-storage.service';
import { ExchangeRateResolver } from '../cash/exchange-rate.resolver';

type Actor = { id: string; pharmacyId: string; role: string; fullName?: string };

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storage: PrescriptionStorageService,
    private readonly exchangeRateResolver: ExchangeRateResolver,
  ) {}

  async createCustomer(dto: CreateCustomerDto, actor: Actor, quick = false): Promise<Customer> {
    this.validateProfile(dto, false, quick);
    const phone = dto.telephonePrincipal || dto.phone;
    const phoneAlreadyUsed = phone ? Boolean(await this.prisma.customers.findFirst({ where: { pharmacy_id: actor.pharmacyId, is_active: true, OR: [{ phone }, { telephone_principal: phone }] }, select: { id: true } })) : false;

    // Pré-vérification des doublons EN DEHORS de la transaction pour réduire sa durée
    await this.assertDuplicates(dto, actor.pharmacyId, this.prisma);

    const customer = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.$queryRaw<{ allocated: number }[]>`
        INSERT INTO customer_sequences (pharmacy_id, next_number) VALUES (${actor.pharmacyId}::uuid, 2)
        ON CONFLICT (pharmacy_id) DO UPDATE SET next_number = customer_sequences.next_number + 1
        RETURNING next_number - 1 AS allocated`;
      const allocated = Number(sequence[0]?.allocated || 1);
      const clientNumber = `CLI-${String(allocated).padStart(6, '0')}`;
      const customer = await tx.customers.create({
        data: {
          pharmacy_id: actor.pharmacyId,
          code: clientNumber,
          client_number: clientNumber,
          full_name: dto.fullName.trim(), phone: dto.phone, email: dto.email,
          company_name: dto.companyName, address: dto.address,
          customer_type: dto.customerType as any, credit_limit_cdf: dto.creditLimitCdf,
          current_balance_cdf: 0, medical_notes: dto.medicalNotes, is_active: true,
          nom: dto.nom, postnom: dto.postnom, prenom: dto.prenom,
          sexe: dto.sexe, date_naissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
          nationalite: dto.nationalite, telephone_principal: dto.telephonePrincipal || dto.phone,
          telephone_secondaire: dto.telephoneSecondaire, consentement_donnees: dto.consentementDonnees,
          consentement_at: dto.consentementDonnees ? new Date() : undefined, consentement_par: actor.id, created_by: actor.id,
          customer_addresses: dto.addressDetails ? { create: this.addressData(dto.addressDetails) } : undefined,
          identity_documents: dto.identityDocuments?.length ? { create: dto.identityDocuments.map((d) => this.documentData(d, actor.pharmacyId)) } : undefined,
          customer_contacts: dto.contacts?.length ? { create: dto.contacts } : undefined,
          enterprise_details: dto.enterprise ? { create: { legal_name: dto.enterprise.legalName, rccm: dto.enterprise.rccm, national_id: dto.enterprise.nationalId, tax_id: dto.enterprise.taxId, representative_name: dto.enterprise.representativeName, representative_function: dto.enterprise.representativeFunction, representative_phone: dto.enterprise.representativePhone, representative_document_number: dto.enterprise.representativeDocumentNumber } } : undefined,
        },
        include: { identity_documents: true, customer_addresses: true, customer_contacts: true, insurance_coverages: { include: { insurers: true } }, enterprise_details: true },
      });
      if (dto.customerType === 'ASSURANCE' && dto.insurance) {
        const insurerId = await this.resolveInsurer(dto.insurance, actor.pharmacyId, tx);
        await tx.insurance_coverages.create({ data: { ...this.insuranceData(dto.insurance, actor.pharmacyId, customer.id), insurer_id: insurerId } });
      }
      return tx.customers.findUnique({ where: { id: customer.id }, include: { identity_documents: true, customer_addresses: true, customer_contacts: true, insurance_coverages: { include: { insurers: true } }, enterprise_details: true } });
    }, { maxWait: 10000, timeout: 30000 });
    await this.audit(actor, 'CLIENT_CREE', 'CUSTOMER', customer.id, undefined, { customerType: customer.customer_type });
    return { ...this.mapCustomer(customer, 0, actor), ...(phoneAlreadyUsed ? { warnings: ['Ce téléphone est déjà utilisé par un autre client.'] } : {}) } as any;
  }

  async createQuickCustomer(dto: CreateQuickCustomerDto, actor: Actor): Promise<Customer> {
    return this.createCustomer({
      fullName: dto.fullName,
      phone: dto.phone,
      customerType: 'PARTICULIER',
      creditLimitCdf: 0,
      consentementDonnees: dto.consentementDonnees,
    } as CreateCustomerDto, actor, true);
  }

  async listCustomers(actor: Actor, query: CustomerQueryDto): Promise<Customer[]> {
    const where: any = { pharmacy_id: actor.pharmacyId, is_active: true };
    if (query.customerType) {
      where.customer_type = query.customerType;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { telephone_principal: { contains: search, mode: 'insensitive' } },
        { company_name: { contains: search, mode: 'insensitive' } },
        { nom: { contains: search, mode: 'insensitive' } },
        { prenom: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = query.skip !== undefined ? Number(query.skip) : undefined;
    const take = query.take !== undefined ? Number(query.take) : undefined;

    const customers = await this.prisma.customers.findMany({
      where,
      orderBy: { full_name: 'asc' },
      skip,
      take,
      include: {
        identity_documents: true,
        customer_addresses: true,
        customer_contacts: true,
        insurance_coverages: { include: { insurers: true } },
        enterprise_details: true,
      },
    });

    const result: Customer[] = customers.map((customer: any) => {
      const balance = Number(customer.current_balance_cdf) || 0;
      return this.mapCustomer(customer, balance, actor);
    });
    return result;
  }

  async getCustomerById(id: string, actor?: Actor): Promise<Customer> {
    const customer = actor?.pharmacyId
      ? await this.getCustomerEntity(id, actor.pharmacyId)
      : await this.prisma.customers.findFirst({ where: { id, is_active: true } });
    if (!customer) throwError(ErrorCode.CLIENT_NOT_FOUND, 'Client introuvable.', HttpStatus.NOT_FOUND);
    return this.mapCustomer(customer, await this.calculateBalance(id, customer.pharmacy_id), actor);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto, actor: Actor): Promise<Customer> {
    const existing = await this.prisma.customers.findFirst({
      where: { id, pharmacy_id: actor.pharmacyId, is_active: true },
      include: {
        identity_documents: true,
        customer_addresses: true,
        customer_contacts: true,
        insurance_coverages: true,
        enterprise_details: true,
      },
    });
    if (!existing) throwError(ErrorCode.CLIENT_NOT_FOUND, 'Client introuvable.', HttpStatus.NOT_FOUND);
    this.validateProfile(dto, true);
    await this.assertDuplicates(dto, actor.pharmacyId, this.prisma, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.customers.update({
        where: { id },        data: {
          full_name: dto.fullName?.trim(),
          phone: dto.telephonePrincipal || dto.phone,
          email: dto.email,
          company_name: dto.companyName,
          address: dto.address,
          customer_type: dto.customerType as any,
          credit_limit_cdf: dto.creditLimitCdf,
          medical_notes: dto.medicalNotes,
          nom: dto.nom,
          postnom: dto.postnom,
          prenom: dto.prenom,
          sexe: dto.sexe,
          date_naissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
          nationalite: dto.nationalite,
          telephone_principal: dto.telephonePrincipal || dto.phone,
          telephone_secondaire: dto.telephoneSecondaire,
          ...(dto.consentementDonnees ? { consentement_donnees: true, consentement_at: new Date(), consentement_par: actor.id } : {}),
        },
      });

      if (dto.addressDetails) {
        await tx.customer_addresses.upsert({
          where: { customer_id_is_primary: { customer_id: id, is_primary: true } },
          create: { customer_id: id, ...this.addressData(dto.addressDetails) },
          update: this.addressData(dto.addressDetails),
        });
      }

      if (dto.identityDocuments?.length) {
        const primaryDoc = dto.identityDocuments.find((d) => d.documentNumber?.trim());
        if (primaryDoc) {
          const existingDoc = await tx.identity_documents.findFirst({ where: { customer_id: id } });
          if (existingDoc) {
            await tx.identity_documents.update({
              where: { id: existingDoc.id },
              data: this.documentData(primaryDoc, actor.pharmacyId),
            });
          } else {
            await tx.identity_documents.create({
              data: { ...this.documentData(primaryDoc, actor.pharmacyId), customer_id: id },
            });
          }
        }
      }

      if (dto.contacts?.length) {
        const primaryContact = dto.contacts.find((c) => c.name?.trim());
        if (primaryContact) {
          const existingContact = await tx.customer_contacts.findFirst({ where: { customer_id: id } });
          if (existingContact) {
            await tx.customer_contacts.update({
              where: { id: existingContact.id },
              data: {
                name: primaryContact.name,
                phone: primaryContact.phone,
                relationship: primaryContact.relationship,
                address: primaryContact.address,
              },
            });
          } else {
            await tx.customer_contacts.create({
              data: {
                customer_id: id,
                name: primaryContact.name,
                phone: primaryContact.phone,
                relationship: primaryContact.relationship,
                address: primaryContact.address,
              },
            });
          }
        }
      }

      if (dto.customerType === 'ENTREPRISE' && dto.enterprise) {
        await tx.enterprise_details.upsert({
          where: { customer_id: id },
          create: {
            customer_id: id,
            legal_name: dto.enterprise.legalName,
            rccm: dto.enterprise.rccm,
            national_id: dto.enterprise.nationalId,
            tax_id: dto.enterprise.taxId,
            representative_name: dto.enterprise.representativeName,
            representative_function: dto.enterprise.representativeFunction,
            representative_phone: dto.enterprise.representativePhone,
            representative_document_number: dto.enterprise.representativeDocumentNumber,
          },
          update: {
            legal_name: dto.enterprise.legalName,
            rccm: dto.enterprise.rccm,
            national_id: dto.enterprise.nationalId,
            tax_id: dto.enterprise.taxId,
            representative_name: dto.enterprise.representativeName,
            representative_function: dto.enterprise.representativeFunction,
            representative_phone: dto.enterprise.representativePhone,
            representative_document_number: dto.enterprise.representativeDocumentNumber,
          },
        });
      }

      if (dto.customerType === 'ASSURANCE' && dto.insurance) {
        const insurerId = await this.resolveInsurer(dto.insurance, actor.pharmacyId, tx);
        const existingCoverage = await tx.insurance_coverages.findFirst({ where: { customer_id: id } });
        if (existingCoverage) {
          await tx.insurance_coverages.update({
            where: { id: existingCoverage.id },
            data: { ...this.insuranceData(dto.insurance, actor.pharmacyId, id), insurer_id: insurerId },
          });
        } else {
          await tx.insurance_coverages.create({
            data: { ...this.insuranceData(dto.insurance, actor.pharmacyId, id), insurer_id: insurerId },
          });
        }
      }

      return tx.customers.findUnique({
        where: { id },
        include: {
          identity_documents: true,
          customer_addresses: true,
          customer_contacts: true,
          insurance_coverages: { include: { insurers: true } },
          enterprise_details: true,
        },
      });
    }, { maxWait: 10000, timeout: 30000 });

    await this.audit(actor, 'CLIENT_MODIFIE', 'CUSTOMER', id, { identity: existing.identity_documents, address: existing.customer_addresses }, { identity: dto.identityDocuments, address: dto.addressDetails, insurance: dto.insurance });
    return this.mapCustomer(updated, await this.calculateBalance(id, actor.pharmacyId), actor);
  }

  async deactivateCustomer(id: string, actor: Actor) { await this.getCustomerEntity(id, actor.pharmacyId); await this.prisma.customers.update({ where: { id }, data: { is_active: false } }); await this.audit(actor, 'CLIENT_DESACTIVE', 'CUSTOMER', id); return { success: true }; }

  async listInsurers(actor: Actor) { return this.prisma.insurers.findMany({ where: { pharmacy_id: actor.pharmacyId, is_active: true }, orderBy: { name: 'asc' } }); }

  async revealIdentityNumber(documentId: string, actor: Actor) {
    if (!['ADMIN', 'PHARMACIEN'].includes(actor.role)) throw new ForbiddenException('Action non disponible');
    const document = await this.prisma.identity_documents.findFirst({ where: { id: documentId, pharmacy_id: actor.pharmacyId } });
    if (!document) throw new NotFoundException('Pièce d’identité introuvable.');
    await this.audit(actor, 'CONSULTATION_NUMERO_PIECE', 'IDENTITY_DOCUMENT', document.id, undefined, { customerId: document.customer_id });
    return { number: document.document_number };
  }

  async getIdentityScan(documentId: string, actor: Actor) {
    if (!['ADMIN', 'PHARMACIEN'].includes(actor.role)) throw new ForbiddenException('Action non disponible');
    const document = await this.prisma.identity_documents.findFirst({ where: { id: documentId, pharmacy_id: actor.pharmacyId } });
    if (!document || !document.file_front_path) throw new NotFoundException('Scan de pièce indisponible.');
    const signed = await this.storage.createSignedUrl(document.file_front_path);
    await this.audit(actor, 'CONSULTATION_SCAN_PIECE', 'IDENTITY_DOCUMENT', document.id, undefined, { expiresAt: signed.expiresAt, customerId: document.customer_id });
    return { ...signed, storageMode: this.storage.usesLocalStorage() ? 'local' : 'supabase' };
  }

  async getIdentityDocumentFile(documentId: string, actor: Actor) {
    if (!['ADMIN', 'PHARMACIEN'].includes(actor.role)) throw new ForbiddenException('Action non disponible');
    const document = await this.prisma.identity_documents.findFirst({ where: { id: documentId, pharmacy_id: actor.pharmacyId } });
    if (!document || !document.file_front_path) throw new NotFoundException('Scan de pièce indisponible.');
    const file = await this.storage.readLocal(document.file_front_path);
    await this.audit(actor, 'CONSULTATION_SCAN_PIECE', 'IDENTITY_DOCUMENT', document.id, undefined, { local: true });
    return { file, storageFilePath: document.file_front_path };
  }

  async uploadProfilePhoto(customerId: string, file: Express.Multer.File | undefined, actor: Actor) {
    if (!file) throw new BadRequestException('Veuillez sélectionner une photo du client.');
    await this.getCustomerEntity(customerId, actor.pharmacyId);
    const current = await this.prisma.customers.findFirst({ where: { id: customerId, pharmacy_id: actor.pharmacyId }, select: { photo_profil_path: true } });
    const path = await this.storage.uploadProfilePhoto(customerId, file);
    await this.prisma.customers.update({ where: { id: customerId }, data: { photo_profil_path: path, photo_profil_ajoutee_le: new Date(), photo_profil_ajoutee_par: actor.id } });
    if (current?.photo_profil_path) await this.storage.deleteStoredFile(current.photo_profil_path);
    await this.audit(actor, 'PHOTO_CLIENT_AJOUTEE', 'CUSTOMER', customerId, undefined, { hasPhoto: true });
    return { hasPhoto: true };
  }

  async getProfilePhoto(customerId: string, actor: Actor) {
    const customer = await this.getCustomerEntity(customerId, actor.pharmacyId);
    if (!customer.photo_profil_path) throw new NotFoundException('Aucune photo n’est enregistrée pour ce client.');
    if (!['ADMIN', 'PHARMACIEN', 'CAISSIER'].includes(actor.role)) throw new ForbiddenException('Vous n’êtes pas autorisé à consulter la photo du client.');
    const signed = await this.storage.createProfilePhotoSignedUrl(customer.photo_profil_path);
    await this.audit(actor, 'CONSULTATION_PHOTO_CLIENT', 'CUSTOMER', customerId, undefined, { expiresAt: signed.expiresAt });
    return { ...signed, storageMode: this.storage.usesLocalStorage() ? 'local' : 'supabase' };
  }

  async getProfilePhotoFile(customerId: string, actor: Actor) {
    const customer = await this.getCustomerEntity(customerId, actor.pharmacyId);
    if (!customer.photo_profil_path) throw new NotFoundException('Aucune photo n’est enregistrée pour ce client.');
    if (actor.role !== 'ADMIN' && actor.role !== 'PHARMACIEN' && actor.role !== 'CAISSIER') throw new ForbiddenException('Vous n’êtes pas autorisé à consulter la photo du client.');
    const file = await this.storage.readLocal(customer.photo_profil_path);
    await this.audit(actor, 'CONSULTATION_PHOTO_CLIENT', 'CUSTOMER', customerId, undefined, { local: true });
    return { file, storageFilePath: customer.photo_profil_path };
  }

  async removeProfilePhoto(customerId: string, actor: Actor) {
    if (!['ADMIN', 'PHARMACIEN'].includes(actor.role)) throw new ForbiddenException('Seuls l’Administrateur et le Pharmacien peuvent retirer la photo du client.');
    const customer = await this.getCustomerEntity(customerId, actor.pharmacyId);
    await this.prisma.customers.update({ where: { id: customerId }, data: { photo_profil_path: null, photo_profil_ajoutee_le: null, photo_profil_ajoutee_par: null } });
    if (customer.photo_profil_path) await this.storage.deleteStoredFile(customer.photo_profil_path);
    await this.audit(actor, 'PHOTO_CLIENT_RETIRÉE', 'CUSTOMER', customerId, { hasPhoto: true }, { hasPhoto: false });
    return { hasPhoto: false };
  }

  async checkCreditAvailability(customerId: string, amountToBorrowCdf: number, pharmacyId?: string): Promise<boolean> {
    const customer = pharmacyId
      ? await this.getCustomerEntity(customerId, pharmacyId)
      : await this.prisma.customers.findUnique({ where: { id: customerId } });
    if (!customer?.is_active) throwError(ErrorCode.CLIENT_NOT_FOUND, 'Client introuvable.', HttpStatus.NOT_FOUND);
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
        select: {
          id: true,
          invoice_number: true,
          created_at: true,
          total_amount_cdf: true,
          sale_payments: { select: { payment_method: true, amount_in_cdf: true } },
          sale_items: {
            select: {
              id: true,
              quantity: true,
              unit_price_cdf: true,
              total_line_cdf: true,
              products: { select: { name: true, dci: true, dosage: true, galenic_form: true } },
              product_lots: { select: { lot_number: true, expiry_date: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.customer_payments.findMany({
        where: { customer_id: customerId, pharmacy_id: actor.pharmacyId },
        include: {
          customer_payment_allocations: {
            select: {
              sale_id: true,
              amount_cdf: true,
              sales: { select: { invoice_number: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return {
      purchases: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoice_number,
        date: sale.created_at,
        totalCdf: Number(sale.total_amount_cdf),
        creditCdf: sale.sale_payments
          .filter((p) => p.payment_method === 'CREDIT_CLIENT')
          .reduce((sum, p) => sum + Number(p.amount_in_cdf), 0),
        items: sale.sale_items?.map((it) => ({
          id: it.id,
          productName: it.products?.name || 'Médicament',
          dci: it.products?.dci,
          dosage: it.products?.dosage,
          galenicForm: it.products?.galenic_form,
          lotNumber: it.product_lots?.lot_number,
          expiryDate: it.product_lots?.expiry_date ? it.product_lots.expiry_date.toISOString().split('T')[0] : undefined,
          quantity: it.quantity,
          unitPriceCdf: Number(it.unit_price_cdf),
          totalLineCdf: Number(it.total_line_cdf),
        })) || [],
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amountPaidCdf: Number(payment.amount_paid_cdf),
        currency: payment.currency,
        method: payment.payment_method,
        receiptReference: payment.receipt_reference,
        createdAt: payment.created_at,
        allocations: payment.customer_payment_allocations.map((allocation) => ({
          saleId: allocation.sale_id,
          invoiceNumber: allocation.sales?.invoice_number || 'Facture',
          amountCdf: Number(allocation.amount_cdf),
        })),
      })),
    };
  }

  async settleDebt(customerId: string, dto: SettleDebtDto, actor: Actor) {
    const existing = await this.prisma.customer_payments.findFirst({ where: { pharmacy_id: actor.pharmacyId, idempotency_key: dto.idempotencyKey }, include: { customer_payment_allocations: true } });
    if (existing) return await this.paymentResult(existing, actor.pharmacyId);

    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customers.findFirst({ where: { id: customerId, pharmacy_id: actor.pharmacyId, is_active: true } });
      if (!customer) throwError(ErrorCode.CLIENT_NOT_FOUND, 'Client introuvable.', HttpStatus.NOT_FOUND);
      const conversion = await this.toCdf(dto.amountPaidCdf, dto.currency, actor.pharmacyId, tx);
      const amountCdf = conversion.amountCdf;
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
          exchange_rate_id: conversion.rateId,
          exchange_rate_applied: conversion.rate,
          idempotency_key: dto.idempotencyKey, receipt_reference: receiptReference, notes: dto.notes,
          customer_payment_allocations: { create: allocations },
        }, include: { customer_payment_allocations: true },
      });
      await tx.customers.update({ where: { id: customerId }, data: { current_balance_cdf: { decrement: amountCdf } } });
      if (dto.paymentMethod === 'ESPECES') {
        if (dto.currency === 'USD') {
          await tx.cash_sessions.update({
            where: { id: session.id },
            data: { expected_amount_usd: { increment: dto.amountPaidCdf } },
          });
        } else {
          await tx.cash_sessions.update({
            where: { id: session.id },
            data: { expected_amount_cdf: { increment: amountCdf } },
          });
        }
      }
      return payment;
    }, { maxWait: 10000, timeout: 30000 });
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
    const customer = await this.prisma.customers.findFirst({ where: { id, pharmacy_id: pharmacyId, is_active: true }, include: { identity_documents: true, customer_addresses: true, customer_contacts: true, insurance_coverages: { include: { insurers: true } }, enterprise_details: true } });
    if (!customer) throwError(ErrorCode.CLIENT_NOT_FOUND, 'Client introuvable.', HttpStatus.NOT_FOUND);
    return customer;
  }

  private validateProfile(dto: CreateCustomerDto, updating = false, quick = false) {
    const phone = dto.telephonePrincipal || dto.phone;
    const missing: string[] = [];
    if (!dto.fullName?.trim()) missing.push('le nom complet');
    if (!quick && !phone?.trim()) missing.push('le téléphone principal');
    if (!dto.consentementDonnees && !updating) missing.push('le consentement à la collecte des données');
    if (quick && dto.customerType !== 'PARTICULIER') missing.push('un client particulier pour la création rapide');
    if (quick && Number(dto.creditLimitCdf || 0) !== 0) missing.push('un plafond nul pour un client particulier rapide');
    if (quick) return;
    if (dto.customerType === 'ASSURANCE') {
      if (!dto.identityDocuments?.some((d) => d.documentNumber?.trim())) missing.push('le numéro de la pièce d’identité');
      if (!dto.addressDetails?.ville || !dto.addressDetails?.commune || !dto.addressDetails?.quartier) missing.push('l’adresse complète (ville, commune et quartier)');
      if (!dto.contacts?.length) missing.push('une personne de contact');
      if (!dto.insurance?.insurerId && !dto.insurance?.insurerName) missing.push('l’organisme assureur');
      if (!dto.insurance?.insuredCardNumber) missing.push('le numéro d’assuré');
      if (!dto.insurance?.endDate) missing.push('la date de fin de validité de l’assurance');
    }
    if (dto.customerType === 'ENTREPRISE') {
      if (!dto.enterprise?.legalName) missing.push('la raison sociale');
      if (!dto.enterprise?.representativeName || !dto.enterprise?.representativeDocumentNumber) missing.push('le représentant et son numéro de pièce d’identité');
      if (!dto.addressDetails && !dto.address) missing.push('l’adresse du siège');
    }
    if (missing.length) throw new BadRequestException(`Informations obligatoires manquantes : ${missing.join(', ')}.`);
  }

  private async assertDuplicates(dto: CreateCustomerDto, pharmacyId: string, tx: any, excludeId?: string) {
    const document = dto.identityDocuments?.find((d) => d.documentNumber?.trim());
    if (document) {
      const found = await tx.identity_documents.findFirst({ where: { pharmacy_id: pharmacyId, document_type: document.documentType, document_number: document.documentNumber, ...(excludeId ? { customer_id: { not: excludeId } } : {}) }, select: { customer_id: true } });
      if (found) throw new BadRequestException({ message: 'Un client avec cette pièce d’identité existe déjà dans cette officine.', existingCustomerId: found.customer_id });
    }
    if (dto.insurance?.insuredCardNumber && (dto.insurance.insurerId || dto.insurance.insurerName)) {
      const insurerId = dto.insurance.insurerId || (await tx.insurers.findFirst({ where: { pharmacy_id: pharmacyId, name: dto.insurance.insurerName }, select: { id: true } }))?.id;
      if (insurerId) {
        const found = await tx.insurance_coverages.findFirst({ where: { pharmacy_id: pharmacyId, insurer_id: insurerId, insured_card_number: dto.insurance.insuredCardNumber, ...(excludeId ? { customer_id: { not: excludeId } } : {}) }, select: { customer_id: true } });
        if (found) throw new BadRequestException({ message: 'Un client avec ce numéro d’assuré existe déjà chez cet organisme.', existingCustomerId: found.customer_id });
      }
    }
  }

  private addressData(address: any) { return { province: address.province, ville: address.ville, commune: address.commune, quartier: address.quartier, avenue_rue: address.avenueRue, numero_parcelle: address.numeroParcelle, point_de_repere: address.pointDeRepere, latitude: address.latitude, longitude: address.longitude, is_primary: true }; }
  private documentData(document: any, pharmacyId: string) { return { pharmacy_id: pharmacyId, document_type: document.documentType, document_number: document.documentNumber.trim(), issue_date: document.issueDate ? new Date(document.issueDate) : undefined, expiration_date: document.expirationDate ? new Date(document.expirationDate) : undefined, file_front_path: document.fileFrontPath, file_back_path: document.fileBackPath, is_primary: document.isPrimary ?? false }; }
  private insuranceData(insurance: any, pharmacyId: string, customerId: string) { return { pharmacy_id: pharmacyId, customer_id: customerId, policy_number: insurance.policyNumber, insured_card_number: insurance.insuredCardNumber, insured_status: insurance.insuredStatus || 'ASSURE_PRINCIPAL', principal_insured_name: insurance.principalInsuredName, relationship_to_principal: insurance.relationshipToPrincipal, subscribing_employer: insurance.subscribingEmployer, coverage_rate: insurance.coverageRate, ceiling: insurance.ceiling, start_date: insurance.startDate ? new Date(insurance.startDate) : undefined, end_date: insurance.endDate ? new Date(insurance.endDate) : undefined }; }
  private async resolveInsurer(insurance: any, pharmacyId: string, tx: any) { if (insurance.insurerId) return insurance.insurerId; const insurer = await tx.insurers.upsert({ where: { pharmacy_id_name: { pharmacy_id: pharmacyId, name: insurance.insurerName } }, create: { pharmacy_id: pharmacyId, name: insurance.insurerName, is_active: true }, update: { is_active: true } }); return insurer.id; }

  private async toCdf(amount: number, currency: string, pharmacyId: string, tx: any): Promise<{ amountCdf: number; rateId?: string; rate?: number }> {
    if (currency === 'CDF') return { amountCdf: amount };
    const rate = await this.exchangeRateResolver.getRateAt(pharmacyId, new Date(), 'USD', 'CDF', tx);
    return { amountCdf: Math.round(amount * Number(rate.rate) * 100) / 100, rateId: rate.id, rate: Number(rate.rate) };
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

  private mapCustomer(customer: any, balance: number, actor?: Actor): Customer {
    const privileged = actor?.role === 'ADMIN' || actor?.role === 'PHARMACIEN';
    const documents = (customer.identity_documents || []).map((d: any) => ({ id: d.id, type: d.document_type, number: privileged ? d.document_number : this.maskValue(d.document_number), fullNumber: privileged ? d.document_number : undefined, issueDate: d.issue_date, expirationDate: d.expiration_date, hasScan: Boolean(d.file_front_path || d.file_back_path), isPrimary: d.is_primary }));
    const coverage = customer.insurance_coverages?.[0];
    const insuranceStatus = customer.customer_type !== 'ASSURANCE' ? undefined : !coverage ? 'INCOMPLETE' : !coverage.end_date ? 'INCOMPLETE' : new Date(coverage.end_date) < new Date() ? 'EXPIRED' : 'VALID';
    const enterprise = customer.enterprise_details ? {
      legalName: customer.enterprise_details.legal_name,
      rccm: customer.enterprise_details.rccm ?? undefined,
      nationalId: customer.enterprise_details.national_id ?? undefined,
      taxId: customer.enterprise_details.tax_id ?? undefined,
      representativeName: customer.enterprise_details.representative_name,
      representativeFunction: customer.enterprise_details.representative_function ?? undefined,
      representativePhone: customer.enterprise_details.representative_phone,
      representativeDocumentNumber: customer.enterprise_details.representative_document_number ?? undefined,
    } : undefined;
    return {
      id: customer.id,
      code: customer.client_number || customer.code,
      fullName: customer.full_name,
      phone: customer.telephone_principal || customer.phone || undefined,
      email: customer.email ?? undefined,
      companyName: customer.company_name ?? undefined,
      customerType: customer.customer_type,
      creditLimitCdf: Number(customer.credit_limit_cdf),
      currentBalanceCdf: balance,
      medicalNotes: privileged ? (customer.medical_notes ?? undefined) : undefined,
      nom: customer.nom,
      postnom: customer.postnom,
      prenom: customer.prenom,
      sexe: customer.sexe ?? undefined,
      dateNaissance: customer.date_naissance ? (customer.date_naissance instanceof Date ? customer.date_naissance.toISOString().split('T')[0] : String(customer.date_naissance).slice(0, 10)) : undefined,
      nationalite: customer.nationalite ?? undefined,
      hasProfilePhoto: Boolean(customer.photo_profil_path),
      address: customer.customer_addresses?.[0],
      contacts: customer.customer_contacts || [],
      identityDocuments: documents,
      insurance: coverage ? { insurerName: coverage.insurers?.name, insuredCardNumber: privileged ? coverage.insured_card_number : this.maskValue(coverage.insured_card_number), status: insuranceStatus, endDate: coverage.end_date } : undefined,
      insuranceStatus,
      enterprise,
      createdAt: customer.created_at,
    } as any;
  }

  private maskValue(value?: string | null) { if (!value) return undefined; return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`; }
  private normalize(value: unknown) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

  private mapPrescription(prescription: any) {
    return { id: prescription.id, customerId: prescription.customer_id, prescriberName: prescription.prescriber_name, healthCenter: prescription.health_center ?? undefined, prescriptionDate: prescription.prescription_date.toISOString().slice(0, 10), prescriptionText: prescription.prescription_text ?? undefined, createdAt: prescription.created_at };
  }

  private audit(actor: Actor, action: string, entityName: string, entityId: string, oldValues?: Record<string, unknown>, newValues?: Record<string, unknown>) {
    return this.auditService.logAction({ pharmacyId: actor.pharmacyId, userId: actor.id, userName: actor.fullName, action, entityName, entityId, oldValues, newValues });
  }
}
