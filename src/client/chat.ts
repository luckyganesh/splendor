import type { ChatMessage } from '../shared/types.js';
import type { GameSocket } from './socket.js';

// This panel is a persistent DOM subtree, deliberately kept OUTSIDE the
// full-innerHTML re-render in main.ts/render.ts. Game-state broadcasts happen
// on every player's turn; if chat lived inside that re-rendered tree, typing
// a message would get wiped mid-keystroke every time anyone else moved.

let myPlayerId: string | null = null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function messageRowHtml(message: ChatMessage): string {
  const mine = message.playerId === myPlayerId;
  return `
    <div class="chat-row ${mine ? 'chat-row-mine' : ''}">
      <div class="chat-meta"><span class="chat-name">${escapeHtml(message.playerName)}</span><span class="chat-time">${formatTime(message.ts)}</span></div>
      <div class="chat-text">${escapeHtml(message.text)}</div>
    </div>`;
}

export function initChat(socket: GameSocket, getMyPlayerId: () => string | null) {
  const log = document.getElementById('chat-log')!;
  const form = document.getElementById('chat-form') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLInputElement;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    socket.send({ type: 'chat', text });
    input.value = '';
  });

  function show() {
    myPlayerId = getMyPlayerId();
  }

  function setHistory(messages: ChatMessage[]) {
    myPlayerId = getMyPlayerId();
    log.innerHTML = messages.map(messageRowHtml).join('');
    log.scrollTop = log.scrollHeight;
  }

  function appendMessage(message: ChatMessage) {
    myPlayerId = getMyPlayerId();
    log.insertAdjacentHTML('beforeend', messageRowHtml(message));
    log.scrollTop = log.scrollHeight;
  }

  return { show, setHistory, appendMessage };
}
