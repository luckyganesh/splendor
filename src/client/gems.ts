import type { TokenColor } from '../shared/types.js';
import { COLOR_META } from './colors.js';

const EMOJI: Record<TokenColor, string> = {
  white: '💎',
  blue: '🔷',
  green: '🟢',
  red: '❤️',
  black: '⚫',
  gold: '🟡',
};

export function gemIconSvg(color: TokenColor): string {
  return `<span class="gem-emoji" aria-hidden="true">${EMOJI[color]}</span>`;
}

export function gemToken(color: TokenColor, size: 'sm' | 'md' | 'lg', count?: number): string {
  const label = count === undefined ? '' : `<span class="gem-count">${count}</span>`;
  return `<span class="gem-token gem-token-${size}" title="${COLOR_META[color].label}">${gemIconSvg(color)}${label}</span>`;
}
