import { ReportKey } from '@vhp/shared';

export interface ReportDefinition {
  key: ReportKey;
  label: string;
  supportsPagination: boolean;
  supportsCategoryFilter: boolean;
  supportsUserFilter: boolean;
  supportsCurrency: boolean;
}

/**
 * Source unique des rapports exposés par RPT-08.
 * Les cartes du dashboard référenceront ces mêmes clés afin de garantir RPT-10.
 */
export const REPORT_DEFINITIONS: Readonly<Record<ReportKey, ReportDefinition>> = {
  'sales-journal': {
    key: 'sales-journal', label: 'Journal des ventes', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  'stock-movements': {
    key: 'stock-movements', label: 'Mouvements de stock', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  'valued-inventory': {
    key: 'valued-inventory', label: 'Inventaire valorisé', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: false, supportsCurrency: true,
  },
  expiries: {
    key: 'expiries', label: 'Péremptions', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: false, supportsCurrency: true,
  },
  receivables: {
    key: 'receivables', label: 'Dettes et créances', supportsPagination: true,
    supportsCategoryFilter: false, supportsUserFilter: false, supportsCurrency: true,
  },
  expenses: {
    key: 'expenses', label: 'Dépenses', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  'seller-performance': {
    key: 'seller-performance', label: 'Performance par vendeur', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  'best-sellers': {
    key: 'best-sellers', label: 'Meilleures ventes', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  'low-rotation': {
    key: 'low-rotation', label: 'Faible rotation', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: false, supportsCurrency: true,
  },
  'stock-entries-exits': {
    key: 'stock-entries-exits', label: 'Entrées et sorties de stock', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
  treasury: {
    key: 'treasury', label: 'Trésorerie par devise', supportsPagination: true,
    supportsCategoryFilter: true, supportsUserFilter: true, supportsCurrency: true,
  },
};

export function getReportDefinition(key: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS[key as ReportKey];
}
