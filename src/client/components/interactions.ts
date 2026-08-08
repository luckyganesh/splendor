import type { Color, GameStateView, PendingAction, TokenColor } from '../../shared/types.js';
import { COLOR_META } from '../colors.js';
import { gemToken } from '../gems.js';
import { requirementHtml } from './nobles.js';

export function renderTokenSelectionBar(selected: Color[]): string {
  if (selected.length === 0) return '';
  return `
    <div class="action-bar">
      <button data-action="confirm-take">Confirm</button>
      <button data-action="cancel-take" class="secondary">Cancel</button>
    </div>`;
}

export function renderTakeTwoConfirmBar(): string {
  return `
    <div class="action-bar">
      <button data-action="confirm-take-two">Confirm</button>
      <button data-action="cancel-take-two" class="secondary">Cancel</button>
    </div>`;
}

export function renderPassBar(): string {
  return `<div class="action-bar"><button data-action="pass" class="secondary">Pass turn (no legal move)</button></div>`;
}

export function renderPendingModal(
  pendingAction: PendingAction | null,
  myPlayerId: string | null,
  myTokens: Record<TokenColor, number> | null,
  discardSelection: Partial<Record<TokenColor, number>>,
  state: GameStateView,
): string {
  if (!pendingAction) return '';

  if (pendingAction.type === 'must_discard') {
    if (pendingAction.playerId !== myPlayerId || !myTokens) {
      return `<div class="modal-backdrop"><div class="modal">Waiting for a player to discard down to 10 tokens...</div></div>`;
    }
    const chosen = Object.values(discardSelection).reduce((a, b) => a + (b ?? 0), 0);
    const atLimit = chosen >= pendingAction.excess;
    const colors: TokenColor[] = ['white', 'blue', 'green', 'red', 'black', 'gold'];
    const rows = colors
      .filter((c) => myTokens[c] > 0)
      .map((c) => {
        const n = discardSelection[c] ?? 0;
        return `
          <div class="discard-row">
            ${gemToken(c, 'sm', n)}
            <span class="discard-label">${COLOR_META[c].label}</span>
            <span class="discard-count">${n}/${myTokens[c]}</span>
            <button data-action="discard-minus" data-color="${c}" ${n <= 0 ? 'disabled' : ''}>-</button>
            <button data-action="discard-plus" data-color="${c}" ${n >= myTokens[c] || atLimit ? 'disabled' : ''}>+</button>
          </div>`;
      })
      .join('');
    return `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>Discard down to 10 tokens</h3>
          <p>You must discard ${pendingAction.excess} token(s). Selected: ${chosen}/${pendingAction.excess}</p>
          <div class="discard-list">${rows}</div>
          <button data-action="confirm-discard" ${chosen === pendingAction.excess ? '' : 'disabled'}>Confirm discard</button>
        </div>
      </div>`;
  }

  // must_choose_noble
  if (pendingAction.playerId !== myPlayerId) {
    return `<div class="modal-backdrop"><div class="modal">Waiting for a player to choose a noble...</div></div>`;
  }
  const options = state.nobles.filter((n) => pendingAction.options.includes(n.id));
  const tiles = options
    .map(
      (n) => `
      <button class="noble noble-choice" data-action="choose-noble" data-noble-id="${n.id}">
        <div class="noble-points">${n.points}</div>
        <div class="noble-req">${requirementHtml(n.requirement)}</div>
      </button>`,
    )
    .join('');
  return `
    <div class="modal-backdrop">
      <div class="modal">
        <h3>Choose a noble to visit you</h3>
        <div class="nobles">${tiles}</div>
      </div>
    </div>`;
}

export function renderToast(error: { code: string; message: string } | null): string {
  if (!error) return '';
  return `<div class="toast">${escapeHtml(error.message)}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
