import type { Color, GameStateView, Noble } from '../../shared/types.js';
import { gemToken } from '../gems.js';

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
      return `
      <div class="noble ${claimant ? 'noble-claimed' : ''}" title="${title}">
        <div class="noble-points">${n.points}</div>
        <div class="noble-req">${requirementHtml(n.requirement)}</div>
      </div>`;
    })
    .join('');
  return `<div class="nobles">${tiles}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
