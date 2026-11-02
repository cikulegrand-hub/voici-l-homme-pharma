import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface NextInvoiceNumberResult {
  invoiceNumber: string;
  sequenceNumber: number;
  fiscalYear: number;
}

@Injectable()
export class InvoiceNumberService {
  /**
   * Génère le prochain numéro de facture séquentiel sans trou (RG-05, VTE-10)
   * Utilise un UPDATE ... RETURNING avec verrou de ligne exclusif (SELECT FOR UPDATE)
   * pour résister parfaitement aux appels concurrents simultanés.
   */
  async getNextInvoiceNumber(
    tx: Prisma.TransactionClient,
    pharmacyId: string,
    fiscalYear?: number,
  ): Promise<NextInvoiceNumberResult> {
    const year = fiscalYear || new Date().getFullYear();

    // 1. Tenter l'incrémentation atomique avec RETURNING
    const updateResult: { last_number: number }[] = await tx.$queryRaw`
      UPDATE invoice_sequences
      SET last_number = last_number + 1,
          updated_at = NOW()
      WHERE pharmacy_id = ${pharmacyId}::uuid
        AND fiscal_year = ${year}
      RETURNING last_number;
    `;

    let sequenceNumber = 1;

    if (updateResult && updateResult.length > 0) {
      sequenceNumber = updateResult[0].last_number;
    } else {
      // 2. Première facture pour cet exercice fiscal : insertion sécurisée
      await tx.$executeRaw`
        INSERT INTO invoice_sequences (pharmacy_id, fiscal_year, last_number, updated_at)
        VALUES (${pharmacyId}::uuid, ${year}, 1, NOW())
        ON CONFLICT (pharmacy_id, fiscal_year)
        DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = NOW();
      `;

      const fetchResult: { last_number: number }[] = await tx.$queryRaw`
        SELECT last_number
        FROM invoice_sequences
        WHERE pharmacy_id = ${pharmacyId}::uuid
          AND fiscal_year = ${year};
      `;

      sequenceNumber = fetchResult[0]?.last_number || 1;
    }

    const formattedNumber = `FAC-${year}-${String(sequenceNumber).padStart(6, '0')}`;

    return {
      invoiceNumber: formattedNumber,
      sequenceNumber,
      fiscalYear: year,
    };
  }
}

