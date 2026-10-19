/**
 * Design System - Batatop App
 * Cores: Âmbar dourado, Terracota e Branco quente
 */

export const COLORS = {
  // Cores Primárias - Batatop Colors
  primary: '#E3A008', // Âmbar dourado (era amarelo puro #FFB800)
  secondary: '#C1440E', // Terracota/tijolo (era vermelho puro #E61E2A)
  accent: '#B5860A', // Dourado escuro para hover/press
  white: '#FFFFFF',

  // Backgrounds
  background: '#FFFFFF',
  backgroundLight: '#FDFCFA',
  backgroundElevated: '#F7F4EF',
  backgroundCard: '#ffffff',

  // Texto
  text: '#1F1B16',
  textSecondary: '#6B6157',
  textMuted: '#9C9188',
  textInverse: '#FFFFFF',
  textPrimary: '#E3A008',

  // Borders e Dividers
  border: '#ECE7E0',
  borderLight: '#F5F2ED',
  borderAccent: '#E3A008',

  // Status Colors
  success: '#27AE60',
  warning: '#F2C94C',
  error: '#EB5757',
  info: '#2D9CDB',

  // Tokens Checkout / Delivery
  primaryText: '#A16207',
  warningBg: '#FEF8EC',
  warningBorder: '#FCE8C3',
  warningText: '#8A6100',
  grayLight: '#F4F4F5',
  grayBorder: '#E4E4E7',
  grayText: '#71717A',
  darkBorder: '#18181B',
};

export const TYPOGRAPHY = {
  fontFamily: {
    regular: 'System',
    bold: 'System',
    semibold: 'System',
  },
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
};

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
};

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
};
