import type { TokenColor } from '../shared/types.js';
import { COLOR_META } from './colors.js';

let uid = 0;
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

function wrap(color: TokenColor, gradientId: string, shape: string, highlight: string): string {
  const m = COLOR_META[color];
  return `
    <svg viewBox="0 0 32 32" class="gem-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${m.light}" />
          <stop offset="100%" stop-color="${m.dark}" />
        </linearGradient>
      </defs>
      ${shape.replace(/__FILL__/g, `url(#${gradientId})`)}
      ${highlight}
    </svg>`;
}

// Each gem type is traditionally given a different cut — matching that (rather
// than one shape recolored five times) is closer to how the physical tokens
// actually look.

// Diamond: brilliant cut — faceted crown + pointed pavilion.
function diamondShape(gid: string): string {
  return wrap(
    'white',
    gid,
    `<polygon points="16,3 23,9 29,9 20,29 12,29 3,9 9,9" fill="__FILL__" stroke="rgba(0,0,0,0.45)" stroke-width="1" stroke-linejoin="round"/>
     <polyline points="9,9 16,29" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" fill="none"/>
     <polyline points="23,9 16,29" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" fill="none"/>
     <polyline points="9,9 23,9" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" fill="none"/>`,
    `<polygon points="16,3 20,9 12,9" fill="rgba(255,255,255,0.65)"/>`,
  );
}

// Sapphire: smooth oval cabochon cut.
function sapphireShape(gid: string): string {
  return wrap(
    'blue',
    gid,
    `<ellipse cx="16" cy="16" rx="12.5" ry="14.5" fill="__FILL__" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`,
    `<ellipse cx="12" cy="10" rx="4.5" ry="3" fill="rgba(255,255,255,0.5)" transform="rotate(-25 12 10)"/>`,
  );
}

// Emerald: the classic rectangular "emerald cut" with clipped corners.
function emeraldShape(gid: string): string {
  return wrap(
    'green',
    gid,
    `<polygon points="11,3 21,3 29,11 29,21 21,29 11,29 3,21 3,11" fill="__FILL__" stroke="rgba(0,0,0,0.45)" stroke-width="1" stroke-linejoin="round"/>
     <rect x="7" y="10" width="18" height="12" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
     <rect x="10.5" y="13.5" width="11" height="5" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>`,
    `<polygon points="11,3 21,3 17,8 15,8" fill="rgba(255,255,255,0.55)"/>`,
  );
}

// Ruby: round brilliant cut with radiating facets.
function rubyShape(gid: string): string {
  const lines = Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 4) * i;
    const x2 = 16 + 13 * Math.cos(angle);
    const y2 = 16 + 13 * Math.sin(angle);
    return `<line x1="16" y1="16" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(0,0,0,0.22)" stroke-width="0.8"/>`;
  }).join('');
  return wrap(
    'red',
    gid,
    `<circle cx="16" cy="16" r="13" fill="__FILL__" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>${lines}`,
    `<ellipse cx="12" cy="11" rx="4" ry="2.6" fill="rgba(255,255,255,0.5)" transform="rotate(-30 12 11)"/>`,
  );
}

// Onyx: smooth hexagonal cabochon (onyx is opaque, so it's polished, not faceted).
function onyxShape(gid: string): string {
  return wrap(
    'black',
    gid,
    `<polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="__FILL__" stroke="rgba(0,0,0,0.6)" stroke-width="1" stroke-linejoin="round"/>`,
    `<ellipse cx="13" cy="10" rx="5" ry="2.4" fill="rgba(255,255,255,0.28)" transform="rotate(-20 13 10)"/>`,
  );
}

// Gold: a coin, not a gem — the wild token is visually distinct in the physical game too.
function goldShape(gid: string): string {
  return wrap(
    'gold',
    gid,
    `<circle cx="16" cy="16" r="13" fill="__FILL__" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>
     <circle cx="16" cy="16" r="9.5" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="1" stroke-dasharray="2 2"/>
     <path d="M16 10 L17.6 14.4 L22 16 L17.6 17.6 L16 22 L14.4 17.6 L10 16 L14.4 14.4 Z" fill="rgba(255,255,255,0.65)"/>`,
    '',
  );
}

const SHAPE_BUILDERS: Record<TokenColor, (gid: string) => string> = {
  white: diamondShape,
  blue: sapphireShape,
  green: emeraldShape,
  red: rubyShape,
  black: onyxShape,
  gold: goldShape,
};

export function gemIconSvg(color: TokenColor): string {
  return SHAPE_BUILDERS[color](nextId(`gem-${color}`));
}

export function gemToken(color: TokenColor, size: 'sm' | 'md' | 'lg', count?: number): string {
  const label = count === undefined ? '' : `<span class="gem-count">${count}</span>`;
  return `<span class="gem-token gem-token-${size}" title="${COLOR_META[color].label}">${gemIconSvg(color)}${label}</span>`;
}
