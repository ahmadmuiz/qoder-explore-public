import { Platform } from 'react-native';

export const colors = {
  bg: '#F5F2E8',
  surface: '#FFFDF7',
  surface2: '#F7F4EA',
  surface3: '#F1EEE2',
  line: '#E6E1D2',
  lineStrong: '#D8D2BF',
  ink: '#14251F',
  inkSoft: '#3D4F47',
  muted: '#6B7A72',
  muted2: '#8B968F',
  brand: '#0B3D32',
  brand2: '#0B5C4B',
  mint: '#D9ED9B',
  mintSoft: '#EDF5D1',
  danger: '#B42318',
  dangerSoft: '#FEECEB',
  warning: '#B45309',
  warningSoft: '#FEF3E2',
  info: '#2563EB',
  infoSoft: '#E9EFFD',
  violet: '#7C3AED',
  violetSoft: '#F2EBFE',
  success: '#0B7A55',
  white: '#FFFFFF',
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
};

export const shadow = {
  shadowColor: '#14251F',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.07,
  shadowRadius: 18,
  elevation: 3,
};

export const typeColors: Record<string, { color: string; bg: string; label: string }> = {
  DUPLICATE_PAYMENT: { color: '#B42318', bg: '#FEECEB', label: 'Duplicate payment' },
  AMOUNT_MISMATCH: { color: '#B45309', bg: '#FEF3E2', label: 'Amount mismatch' },
  MISSING_PAYMENT: { color: '#0B5C4B', bg: '#E8F3EE', label: 'Missing payment' },
  UNALLOCATED_PAYMENT: { color: '#2563EB', bg: '#E9EFFD', label: 'Unallocated payment' },
  NOMINAL_VARIANCE: { color: '#7C3AED', bg: '#F2EBFE', label: 'Nominal variance' },
  ORPHAN_RECEIPT: { color: '#475569', bg: '#F0F3F4', label: 'Orphan receipt' },
  DUPLICATE_RECEIPT: { color: '#C2410C', bg: '#FFF0E5', label: 'Duplicate receipt' },
};

export const severityColors: Record<string, string> = {
  CRITICAL: colors.danger,
  HIGH: colors.warning,
  MEDIUM: colors.info,
  LOW: colors.muted2,
};

export const resolutionOptions = [
  ['CONFIRMED_DUPLICATE', 'Confirmed duplicate'],
  ['REFUND_INITIATED', 'Refund initiated'],
  ['ADJUSTED', 'Ledger adjusted'],
  ['EVIDENCE_ACCEPTED', 'Evidence accepted'],
  ['WRITTEN_OFF', 'Written off'],
  ['FALSE_POSITIVE', 'False positive'],
  ['ESCALATED', 'Escalated to treasury'],
] as const;
