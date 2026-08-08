import type { TokenColor } from '../shared/types.js';

export interface ColorMeta {
  label: string;
  light: string;
  dark: string;
  fg: string;
}

export const COLOR_META: Record<TokenColor, ColorMeta> = {
  white: { label: 'Diamond', light: '#ffffff', dark: '#c7c6bd', fg: '#2a2a2a' },
  blue: { label: 'Sapphire', light: '#6fa4f0', dark: '#123a86', fg: '#ffffff' },
  green: { label: 'Emerald', light: '#5fcf8f', dark: '#0f6b39', fg: '#ffffff' },
  red: { label: 'Ruby', light: '#f0796a', dark: '#7c1810', fg: '#ffffff' },
  black: { label: 'Onyx', light: '#5a5a5a', dark: '#050505', fg: '#ffffff' },
  gold: { label: 'Gold (wild)', light: '#f6db85', dark: '#9a7212', fg: '#2a2a2a' },
};
