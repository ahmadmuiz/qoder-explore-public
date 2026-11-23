export const TREASURY_CATEGORIES = [
  'MM_CALL',
  'TIME_DEPOSIT',
  'REPO',
  'GOV_BOND',
  'CORP_BOND',
  'FX_SPOT',
  'FX_FORWARD',
  'FX_SWAP',
  'IRS',
  'CORPORATE_LOAN',
  'SYNDICATED_LOAN',
  'PROJECT_FINANCE',
  'TRADE_FINANCE',
] as const;

export type TreasuryCategory = (typeof TREASURY_CATEGORIES)[number];

export const TREASURY_DOC_TYPES = [
  'DEAL_LETTER',
  'TRADE_CONFIRMATION',
  'SETTLEMENT_ADVICE',
  'REPO_CONFIRMATION',
  'CUSTODY_STATEMENT',
  'BOND_TRADE_CONFIRMATION',
  'FX_CONFIRMATION',
  'RATE_FIXING',
  'PAYMENT_ADVICE',
  'LOAN_AGREEMENT',
  'DRAWDOWN_NOTICE',
  'LC_APPLICATION',
  'SHIPPING_DOCUMENTS',
] as const;

export type TreasuryDocType = (typeof TREASURY_DOC_TYPES)[number];

export const TREASURY_BREAK_TYPES = [
  'MISSING_SUPPORTING_DOCUMENT',
  'DOC_NOTIONAL_MISMATCH',
  'DOC_RATE_MISMATCH',
  'DOC_PRICE_MISMATCH',
  'DOC_DATE_MISMATCH',
  'DOC_MATURITY_MISMATCH',
  'DOC_COUNTERPARTY_MISMATCH',
  'DOC_CURRENCY_MISMATCH',
  'DOC_FX_RATE_MISMATCH',
  'MISSING_CASHFLOW',
  'CASHFLOW_AMOUNT_MISMATCH',
  'SETTLEMENT_DATE_MISMATCH',
  'UNSETTLED_CASHFLOW',
  'DUPLICATE_DEAL',
  'CUSTODY_POSITION_MISMATCH',
] as const;

export type TreasuryBreakType = (typeof TREASURY_BREAK_TYPES)[number];

export const CATEGORY_LABELS: Record<TreasuryCategory, string> = {
  MM_CALL: 'Money market call',
  TIME_DEPOSIT: 'Time deposit',
  REPO: 'Repurchase agreement',
  GOV_BOND: 'Government bond',
  CORP_BOND: 'Corporate bond',
  FX_SPOT: 'FX spot',
  FX_FORWARD: 'FX forward',
  FX_SWAP: 'FX swap',
  IRS: 'Interest rate swap',
  CORPORATE_LOAN: 'Corporate loan',
  SYNDICATED_LOAN: 'Syndicated loan',
  PROJECT_FINANCE: 'Project finance',
  TRADE_FINANCE: 'Trade finance',
};

export const CATEGORY_SHORT: Record<TreasuryCategory, string> = {
  MM_CALL: 'MM call',
  TIME_DEPOSIT: 'Deposit',
  REPO: 'Repo',
  GOV_BOND: 'Gov bond',
  CORP_BOND: 'Corp bond',
  FX_SPOT: 'FX spot',
  FX_FORWARD: 'FX fwd',
  FX_SWAP: 'FX swap',
  IRS: 'IRS',
  CORPORATE_LOAN: 'Corp loan',
  SYNDICATED_LOAN: 'Syndicated',
  PROJECT_FINANCE: 'Project fin',
  TRADE_FINANCE: 'Trade fin',
};

export const BREAK_LABELS: Record<TreasuryBreakType, string> = {
  MISSING_SUPPORTING_DOCUMENT: 'Missing supporting document',
  DOC_NOTIONAL_MISMATCH: 'Document notional mismatch',
  DOC_RATE_MISMATCH: 'Document rate mismatch',
  DOC_PRICE_MISMATCH: 'Document price mismatch',
  DOC_DATE_MISMATCH: 'Document date mismatch',
  DOC_MATURITY_MISMATCH: 'Document maturity mismatch',
  DOC_COUNTERPARTY_MISMATCH: 'Document counterparty mismatch',
  DOC_CURRENCY_MISMATCH: 'Document currency mismatch',
  DOC_FX_RATE_MISMATCH: 'Document FX rate mismatch',
  MISSING_CASHFLOW: 'Missing cashflow leg',
  CASHFLOW_AMOUNT_MISMATCH: 'Cashflow amount mismatch',
  SETTLEMENT_DATE_MISMATCH: 'Settlement date mismatch',
  UNSETTLED_CASHFLOW: 'Unsettled cashflow',
  DUPLICATE_DEAL: 'Duplicate deal',
  CUSTODY_POSITION_MISMATCH: 'Custody position mismatch',
};

export const DOC_LABELS: Record<TreasuryDocType, string> = {
  DEAL_LETTER: 'Deal letter',
  TRADE_CONFIRMATION: 'Trade confirmation',
  SETTLEMENT_ADVICE: 'Settlement advice',
  REPO_CONFIRMATION: 'Repo confirmation',
  CUSTODY_STATEMENT: 'Custody statement',
  BOND_TRADE_CONFIRMATION: 'Bond trade confirmation',
  FX_CONFIRMATION: 'FX confirmation',
  RATE_FIXING: 'Rate fixing advice',
  PAYMENT_ADVICE: 'Payment advice',
  LOAN_AGREEMENT: 'Loan agreement',
  DRAWDOWN_NOTICE: 'Drawdown notice',
  LC_APPLICATION: 'LC application',
  SHIPPING_DOCUMENTS: 'Shipping documents',
};

export interface CategorySpec {
  desk: string;
  portfolio: string;
  instruments: string[];
  requiredDocs: TreasuryDocType[];
  directions: string[];
  currencies: string[];
  notionalRange: [number, number];
  rateRange?: [number, number];
  priceRange?: [number, number];
  couponRange?: [number, number];
  tenorRange: [number, number];
}

export const CATEGORY_SPECS: Record<TreasuryCategory, CategorySpec> = {
  MM_CALL: {
    desk: 'Money Market',
    portfolio: 'Liquidity buffer',
    instruments: ['IDR call placement', 'IDR call borrowing'],
    requiredDocs: ['DEAL_LETTER', 'TRADE_CONFIRMATION', 'SETTLEMENT_ADVICE'],
    directions: ['PLACE', 'TAKE'],
    currencies: ['IDR'],
    notionalRange: [5_000_000_000, 400_000_000_000],
    rateRange: [400, 620],
    tenorRange: [1, 30],
  },
  TIME_DEPOSIT: {
    desk: 'Money Market',
    portfolio: 'Liquidity buffer',
    instruments: ['IDR time deposit', 'USD time deposit'],
    requiredDocs: ['DEAL_LETTER', 'TRADE_CONFIRMATION', 'SETTLEMENT_ADVICE'],
    directions: ['PLACE', 'TAKE'],
    currencies: ['IDR', 'USD'],
    notionalRange: [10_000_000_000, 750_000_000_000],
    rateRange: [450, 680],
    tenorRange: [30, 365],
  },
  REPO: {
    desk: 'Securities Finance',
    portfolio: 'HQLA portfolio',
    instruments: ['SBN repo', 'FR-series repo', 'ORI-series repo'],
    requiredDocs: ['REPO_CONFIRMATION', 'SETTLEMENT_ADVICE', 'CUSTODY_STATEMENT'],
    directions: ['REPO', 'REVERSE_REPO'],
    currencies: ['IDR'],
    notionalRange: [20_000_000_000, 1_000_000_000_000],
    rateRange: [450, 650],
    tenorRange: [7, 90],
  },
  GOV_BOND: {
    desk: 'Securities',
    portfolio: 'HQLA portfolio',
    instruments: ['FR0086', 'FR0090', 'FR0096', 'ORI025', 'SBSN PBS038', 'SBSN PBS045'],
    requiredDocs: ['BOND_TRADE_CONFIRMATION', 'SETTLEMENT_ADVICE', 'CUSTODY_STATEMENT'],
    directions: ['BUY', 'SELL'],
    currencies: ['IDR'],
    notionalRange: [10_000_000_000, 1_500_000_000_000],
    couponRange: [475, 775],
    priceRange: [92, 112],
    tenorRange: [365, 3650],
  },
  CORP_BOND: {
    desk: 'Securities',
    portfolio: 'Banking book',
    instruments: ['AA corporate bond', 'A corporate bond', 'BBB corporate bond', 'Sustainable bond'],
    requiredDocs: ['BOND_TRADE_CONFIRMATION', 'SETTLEMENT_ADVICE', 'CUSTODY_STATEMENT'],
    directions: ['BUY', 'SELL'],
    currencies: ['IDR', 'USD'],
    notionalRange: [5_000_000_000, 500_000_000_000],
    couponRange: [600, 1050],
    priceRange: [88, 110],
    tenorRange: [365, 3650],
  },
  FX_SPOT: {
    desk: 'Treasury FX',
    portfolio: 'FX book',
    instruments: ['USD/IDR', 'SGD/IDR', 'EUR/IDR', 'JPY/IDR'],
    requiredDocs: ['FX_CONFIRMATION', 'SETTLEMENT_ADVICE'],
    directions: ['BUY', 'SELL'],
    currencies: ['USD', 'SGD', 'EUR', 'JPY'],
    notionalRange: [500_000_000, 500_000_000_000],
    tenorRange: [0, 2],
  },
  FX_FORWARD: {
    desk: 'Treasury FX',
    portfolio: 'FX book',
    instruments: ['USD/IDR forward', 'EUR/IDR forward', 'SGD/IDR forward'],
    requiredDocs: ['FX_CONFIRMATION', 'SETTLEMENT_ADVICE'],
    directions: ['BUY', 'SELL'],
    currencies: ['USD', 'SGD', 'EUR'],
    notionalRange: [1_000_000_000, 750_000_000_000],
    tenorRange: [30, 365],
  },
  FX_SWAP: {
    desk: 'Treasury FX',
    portfolio: 'FX book',
    instruments: ['USD/IDR FX swap', 'EUR/IDR FX swap', 'SGD/IDR FX swap'],
    requiredDocs: ['FX_CONFIRMATION', 'SETTLEMENT_ADVICE'],
    directions: ['BUY_SELL', 'SELL_BUY'],
    currencies: ['USD', 'SGD', 'EUR'],
    notionalRange: [1_000_000_000, 1_000_000_000_000],
    tenorRange: [7, 180],
  },
  IRS: {
    desk: 'Rates',
    portfolio: 'Hedging book',
    instruments: ['IDR fixed vs IndONIA', 'IDR fixed vs JIBOR', 'Cross-currency IRS'],
    requiredDocs: ['TRADE_CONFIRMATION', 'RATE_FIXING', 'PAYMENT_ADVICE'],
    directions: ['PAY_FIXED', 'RECEIVE_FIXED'],
    currencies: ['IDR', 'USD'],
    notionalRange: [10_000_000_000, 2_000_000_000_000],
    rateRange: [450, 750],
    tenorRange: [365, 3650],
  },
  CORPORATE_LOAN: {
    desk: 'Corporate Finance',
    portfolio: 'Corporate lending',
    instruments: ['Term loan', 'Working capital loan', 'Revolving credit facility'],
    requiredDocs: ['LOAN_AGREEMENT', 'DRAWDOWN_NOTICE', 'PAYMENT_ADVICE'],
    directions: ['DRAW', 'REPAY'],
    currencies: ['IDR', 'USD'],
    notionalRange: [50_000_000_000, 2_000_000_000_000],
    rateRange: [650, 1150],
    tenorRange: [180, 2555],
  },
  SYNDICATED_LOAN: {
    desk: 'Corporate Finance',
    portfolio: 'Syndicated lending',
    instruments: ['Syndicated term loan', 'Club deal facility'],
    requiredDocs: ['LOAN_AGREEMENT', 'DRAWDOWN_NOTICE', 'PAYMENT_ADVICE'],
    directions: ['DRAW', 'REPAY'],
    currencies: ['IDR', 'USD'],
    notionalRange: [250_000_000_000, 5_000_000_000_000],
    rateRange: [700, 1250],
    tenorRange: [365, 3650],
  },
  PROJECT_FINANCE: {
    desk: 'Corporate Finance',
    portfolio: 'Infrastructure lending',
    instruments: ['Project finance facility', 'Infrastructure mezzanine'],
    requiredDocs: ['LOAN_AGREEMENT', 'DRAWDOWN_NOTICE', 'PAYMENT_ADVICE'],
    directions: ['DRAW', 'REPAY'],
    currencies: ['IDR', 'USD'],
    notionalRange: [500_000_000_000, 8_000_000_000_000],
    rateRange: [750, 1350],
    tenorRange: [1095, 5475],
  },
  TRADE_FINANCE: {
    desk: 'Trade Finance',
    portfolio: 'Trade assets',
    instruments: ['LC at sight', 'Usance LC', 'SKBDN', 'Bank guarantee'],
    requiredDocs: ['LC_APPLICATION', 'TRADE_CONFIRMATION', 'SHIPPING_DOCUMENTS'],
    directions: ['ISSUE', 'ADVISE'],
    currencies: ['USD', 'IDR', 'EUR'],
    notionalRange: [1_000_000_000, 300_000_000_000],
    rateRange: [35, 120],
    tenorRange: [30, 180],
  },
};

export const REQUIRED_LEGS: Record<TreasuryCategory, number> = {
  MM_CALL: 1,
  TIME_DEPOSIT: 2,
  REPO: 2,
  GOV_BOND: 2,
  CORP_BOND: 2,
  FX_SPOT: 2,
  FX_FORWARD: 2,
  FX_SWAP: 2,
  IRS: 2,
  CORPORATE_LOAN: 2,
  SYNDICATED_LOAN: 2,
  PROJECT_FINANCE: 2,
  TRADE_FINANCE: 2,
};

export const PARTY_TYPES = ['BANK', 'CORPORATE', 'GOVERNMENT', 'BROKER', 'CUSTODIAN', 'MULTILATERAL'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export interface CounterpartySpec {
  code: string;
  name: string;
  partyType: PartyType;
  rating: string;
  country: string;
}

export const COUNTERPARTIES: CounterpartySpec[] = [
  { code: 'CP-BANK-001', name: 'Bank Nusantara Persada', partyType: 'BANK', rating: 'AA+', country: 'ID' },
  { code: 'CP-BANK-002', name: 'Bank Cakrawala Internasional', partyType: 'BANK', rating: 'AA', country: 'ID' },
  { code: 'CP-BANK-003', name: 'Bank Samudra Andalan', partyType: 'BANK', rating: 'AA-', country: 'ID' },
  { code: 'CP-BANK-004', name: 'Bank Merdeka Sentosa', partyType: 'BANK', rating: 'A+', country: 'ID' },
  { code: 'CP-BANK-005', name: 'Bank Pembangunan Daerah Nusantara', partyType: 'BANK', rating: 'A', country: 'ID' },
  { code: 'CP-BANK-006', name: 'Bank Asia Pasifik', partyType: 'BANK', rating: 'AA', country: 'SG' },
  { code: 'CP-BANK-007', name: 'Bank Sakura Global', partyType: 'BANK', rating: 'A+', country: 'JP' },
  { code: 'CP-BANK-008', name: 'Bank Rhine Capital', partyType: 'BANK', rating: 'AA-', country: 'DE' },
  { code: 'CP-BANK-009', name: 'Bank Hudson Trust', partyType: 'BANK', rating: 'A+', country: 'US' },
  { code: 'CP-BANK-010', name: 'Bank Albion Finance', partyType: 'BANK', rating: 'AA-', country: 'GB' },
  { code: 'CP-BANK-011', name: 'Bank Selat Malaka', partyType: 'BANK', rating: 'AA-', country: 'ID' },
  { code: 'CP-BANK-012', name: 'Bank Papua Sejahtera', partyType: 'BANK', rating: 'A', country: 'ID' },
  { code: 'CP-CORP-001', name: 'PT Energi Nusantara Abadi', partyType: 'CORPORATE', rating: 'AA', country: 'ID' },
  { code: 'CP-CORP-002', name: 'PT Telekomunikasi Cakrawala', partyType: 'CORPORATE', rating: 'AA-', country: 'ID' },
  { code: 'CP-CORP-003', name: 'PT Jalan Tol Andalan', partyType: 'CORPORATE', rating: 'A+', country: 'ID' },
  { code: 'CP-CORP-004', name: 'PT Pelabuhan Khatulistiwa', partyType: 'CORPORATE', rating: 'AA-', country: 'ID' },
  { code: 'CP-CORP-005', name: 'PT Semen Bumi Raya', partyType: 'CORPORATE', rating: 'A', country: 'ID' },
  { code: 'CP-CORP-006', name: 'PT Agrikultur Lestari', partyType: 'CORPORATE', rating: 'A-', country: 'ID' },
  { code: 'CP-CORP-007', name: 'PT Pertambangan Sejahtera', partyType: 'CORPORATE', rating: 'A', country: 'ID' },
  { code: 'CP-CORP-008', name: 'PT Properti Nusa Indah', partyType: 'CORPORATE', rating: 'BBB+', country: 'ID' },
  { code: 'CP-CORP-009', name: 'PT Logistik Samudra', partyType: 'CORPORATE', rating: 'A-', country: 'ID' },
  { code: 'CP-CORP-010', name: 'PT Kimia Nusantara', partyType: 'CORPORATE', rating: 'A', country: 'ID' },
  { code: 'CP-CORP-011', name: 'PT Manufaktur Garuda', partyType: 'CORPORATE', rating: 'BBB+', country: 'ID' },
  { code: 'CP-CORP-012', name: 'PT Air Bersih Perkotaan', partyType: 'CORPORATE', rating: 'AA-', country: 'ID' },
  { code: 'CP-CORP-013', name: 'PT Bandara Internasional Timur', partyType: 'CORPORATE', rating: 'A+', country: 'ID' },
  { code: 'CP-CORP-014', name: 'PT Ketenagalistrikan Nasional', partyType: 'CORPORATE', rating: 'AAA', country: 'ID' },
  { code: 'CP-CORP-015', name: 'PT Sawit Lestari Mandiri', partyType: 'CORPORATE', rating: 'A', country: 'ID' },
  { code: 'CP-CORP-016', name: 'PT Farmasi Sehat Nusantara', partyType: 'CORPORATE', rating: 'A-', country: 'ID' },
  { code: 'CP-GOV-001', name: 'Pemerintah Republik Indonesia', partyType: 'GOVERNMENT', rating: 'BBB', country: 'ID' },
  { code: 'CP-GOV-002', name: 'Kementerian Keuangan Republik Indonesia', partyType: 'GOVERNMENT', rating: 'BBB', country: 'ID' },
  { code: 'CP-GOV-003', name: 'Pemerintah Provinsi Nusantara', partyType: 'GOVERNMENT', rating: 'A', country: 'ID' },
  { code: 'CP-BRK-001', name: 'Mandiri Sekuritas Nusantara', partyType: 'BROKER', rating: 'AA-', country: 'ID' },
  { code: 'CP-BRK-002', name: 'Cakrawala Sekuritas', partyType: 'BROKER', rating: 'A+', country: 'ID' },
  { code: 'CP-BRK-003', name: 'Samudra Investasi', partyType: 'BROKER', rating: 'A', country: 'ID' },
  { code: 'CP-BRK-004', name: 'Asia Pacific Securities', partyType: 'BROKER', rating: 'AA-', country: 'SG' },
  { code: 'CP-CUS-001', name: 'Kustodian Sentral Efek Nusantara', partyType: 'CUSTODIAN', rating: 'AAA', country: 'ID' },
  { code: 'CP-CUS-002', name: 'Bank Kustodian Cakrawala', partyType: 'CUSTODIAN', rating: 'AA+', country: 'ID' },
  { code: 'CP-MLI-001', name: 'Multilateral Infrastructure Facility', partyType: 'MULTILATERAL', rating: 'AAA', country: 'INT' },
  { code: 'CP-MLI-002', name: 'Regional Development Bank Consortium', partyType: 'MULTILATERAL', rating: 'AA+', country: 'INT' },
];

export const FX_RATES: Record<string, number> = {
  IDR: 1,
  USD: 16_250,
  SGD: 12_050,
  EUR: 17_650,
  JPY: 108,
};

export function isTreasuryCategory(value: string): value is TreasuryCategory {
  return (TREASURY_CATEGORIES as readonly string[]).includes(value);
}
