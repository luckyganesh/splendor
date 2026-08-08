import { renderRulesButton } from './components/rules.js';

export function renderLobbyEntry(status: 'connecting' | 'open' | 'closed'): string {
  return `
    <div class="lobby-entry">
      <h1>Splendor</h1>
      <p class="status">${status === 'open' ? '' : status === 'connecting' ? 'Connecting...' : 'Disconnected, retrying...'}</p>
      <p class="new-player-hint">New to Splendor? ${renderRulesButton()}</p>
      <div class="lobby-forms">
        <form data-form="create">
          <h2>Host a new game</h2>
          <input name="hostName" placeholder="Your name" maxlength="20" required />
          <button type="submit">Create room</button>
        </form>
        <form data-form="join">
          <h2>Join a game</h2>
          <input name="roomCode" placeholder="Room code" maxlength="8" required style="text-transform:uppercase" />
          <input name="playerName" placeholder="Your name" maxlength="20" required />
          <button type="submit">Join room</button>
        </form>
      </div>
    </div>`;
}

export function renderWaitingRoom(
  roomCode: string,
  players: { id: string; name: string; connected: boolean }[],
  isHost: boolean,
  canStart: boolean,
): string {
  const rows = players
    .map((p) => `<li class="${p.connected ? '' : 'player-offline'}">${escapeHtml(p.name)}</li>`)
    .join('');
  return `
    <div class="lobby-entry">
      <h1>Splendor</h1>
      <p>Room code: <strong class="room-code">${roomCode}</strong> — share this with your friends</p>
      <ul class="waiting-list">${rows}</ul>
      ${
        isHost
          ? `<button data-action="start-game" ${canStart ? '' : 'disabled'}>Start game</button>
             <p class="hint">${canStart ? '' : 'Need 2-4 players to start.'}</p>`
          : '<p class="hint">Waiting for the host to start the game...</p>'
      }
      <div class="waiting-room-actions">
        ${renderRulesButton()}
        <button data-action="leave-room" class="secondary leave-room-link">Leave room</button>
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
