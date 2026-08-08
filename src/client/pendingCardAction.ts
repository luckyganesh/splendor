export type PendingCardAction =
  | { kind: 'reserve-faceup'; tier: 1 | 2 | 3; slot: number }
  | { kind: 'reserve-deck'; tier: 1 | 2 | 3 }
  | { kind: 'purchase-faceup'; tier: 1 | 2 | 3; slot: number }
  | { kind: 'purchase-reserved'; cardId: string };

export function confirmCancelButtons(): string {
  return `
    <div class="card-actions card-actions-confirm">
      <button data-action="confirm-card-action">Confirm</button>
      <button data-action="cancel-card-action" class="secondary">Cancel</button>
    </div>`;
}
