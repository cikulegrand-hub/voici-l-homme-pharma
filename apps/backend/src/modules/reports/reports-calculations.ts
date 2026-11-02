export interface RevenueTotals { cdf: number; usd: number; }
export interface SaleAmounts { cdf: number; usd: number; }
export interface SaleCostLine { revenueCdf: number; quantity: number; unitCostCdf: number; }

export function sumNetRevenue(sales: SaleAmounts, credits: SaleAmounts): RevenueTotals {
  return { cdf: sales.cdf - credits.cdf, usd: sales.usd - credits.usd };
}

export function calculateGrossMargin(lines: SaleCostLine[]): number {
  return lines.reduce((sum, line) => sum + line.revenueCdf - line.quantity * line.unitCostCdf, 0);
}
