import type { Color, GameStateView, Noble } from '../../shared/types.js';
import { gemToken } from '../gems.js';
import { nobleAssetUrl } from '../nobleAssets.js';

export function requirementHtml(requirement: Noble['requirement']): string {
  return (Object.entries(requirement) as [Color, number][])
    .filter(([, n]) => n > 0)
    .map(([color, n]) => gemToken(color, 'md', n))
    .join('');
}

export function renderNobles(nobles: Noble[], players: GameStateView['players']): string {
  const tiles = nobles
    .map((n) => {
      const claimant = n.claimedBy ? players.find((p) => p.id === n.claimedBy) : null;
      const title = claimant ? `${escapeHtml(claimant.name)} has claimed this noble` : 'Noble';
      const assetUrl = nobleAssetUrl(n.id);
      return `
      <div class="noble ${assetUrl ? 'noble-asset' : ''} ${claimant ? 'noble-claimed' : ''}" title="${title}">
        ${assetUrl ? `<img class="noble-art" src="${assetUrl}" alt="Noble worth ${n.points} points" />` : `<div class="noble-points">${n.points}</div><div class="noble-req">${requirementHtml(n.requirement)}</div>`}
      </div>`;
    })
    .join('');
  return `<div class="nobles">${tiles}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
