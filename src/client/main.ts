import type { Color, GameStateView, TokenColor } from '../shared/types.js';
import type { ServerMessage } from '../shared/protocol.js';
import { initChat } from './chat.js';
import { renderMyPanel, renderOpponents } from './components/playerPanel.js';
import { renderPendingModal, renderToast } from './components/interactions.js';
import { renderRulesModal } from './components/rules.js';
import { renderLobbyEntry, renderWaitingRoom } from './lobby.js';
import type { PendingCardAction } from './pendingCardAction.js';
import { canAffordCost, renderGame } from './render.js';
import { GameSocket } from './socket.js';
import { captureDomSnapshot, planTransitions, runTransitions } from './transitions.js';

const STORAGE_KEY = 'splendor:identity';

interface StoredIdentity {
  roomCode: string;
  playerId: string;
  secret: string;
}

interface AppState {
  screen: 'entry' | 'room';
  roomCode: string | null;
  myPlayerId: string | null;
  secret: string | null;
  lastState: GameStateView | null;
  status: 'connecting' | 'open' | 'closed';
  error: { code: string; message: string } | null;
  tokenSelection: Color[];
  discardSelection: Partial<Record<TokenColor, number>>;
  pendingCardAction: PendingCardAction | null;
  pendingTakeTwo: Color | null;
  showRules: boolean;
}

const app: AppState = {
  screen: 'entry',
  roomCode: null,
  myPlayerId: null,
  secret: null,
  lastState: null,
  status: 'connecting',
  error: null,
  tokenSelection: [],
  discardSelection: {},
  pendingCardAction: null,
  pendingTakeTwo: null,
  showRules: false,
};

const socket = new GameSocket();
const root = document.getElementById('app')!;
const gameDock = document.getElementById('game-dock')!;
const opponentsDock = document.getElementById('opponents-dock')!;
const myPanelDock = document.getElementById('my-panel-dock')!;
const chat = initChat(socket, () => app.myPlayerId);

function saveIdentity() {
  if (app.roomCode && app.myPlayerId && app.secret) {
    const identity: StoredIdentity = { roomCode: app.roomCode, playerId: app.myPlayerId, secret: app.secret };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  }
}

function clearIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}

function returnToEntry() {
  clearIdentity();
  app.screen = 'entry';
  app.roomCode = null;
  app.myPlayerId = null;
  app.secret = null;
  app.lastState = null;
  app.error = null;
  app.tokenSelection = [];
  app.discardSelection = {};
  app.pendingCardAction = null;
  app.pendingTakeTwo = null;
  document.body.classList.remove('in-room');
  gameDock.classList.add('hidden');
  opponentsDock.classList.add('hidden');
  myPanelDock.classList.add('hidden');
  render();
}

function loadIdentity(): StoredIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredIdentity;
  } catch {
    return null;
  }
}

function render() {
  if (app.screen === 'entry' || !app.lastState) {
    root.innerHTML = renderLobbyEntry(app.status) + renderToast(app.error) + renderRulesModal(app.showRules);
    bindEntryForms();
    return;
  }

  if (app.lastState.phase === 'lobby') {
    opponentsDock.classList.add('hidden');
    myPanelDock.classList.add('hidden');
    const isHost = app.lastState.players[0]?.id === app.myPlayerId;
    const canStart = app.lastState.players.length >= 2 && app.lastState.players.length <= 4;
    root.innerHTML =
      renderWaitingRoom(app.lastState.roomCode, app.lastState.players, isHost, canStart) +
      renderRulesModal(app.showRules);
    return;
  }

  const state = app.lastState;
  const me = state.players.find((p) => p.id === app.myPlayerId) ?? null;
  const canAffordReserved = (cardId: string) => {
    if (!me) return false;
    const reserved = me.reservedCards.find((r) => r.card?.id === cardId);
    return reserved?.card ? canAffordCost(reserved.card.cost, me.bonuses, me.tokens) : false;
  };

  root.innerHTML =
    renderGame(state, {
      myPlayerId: app.myPlayerId,
      tokenSelection: app.tokenSelection,
      pendingCardAction: app.pendingCardAction,
      pendingTakeTwo: app.pendingTakeTwo,
      error: app.error,
      showRules: app.showRules,
    }) + renderPendingModal(state.pendingAction, app.myPlayerId, me?.tokens ?? null, app.discardSelection, state);

  opponentsDock.classList.remove('hidden');
  myPanelDock.classList.remove('hidden');
  opponentsDock.innerHTML = renderOpponents(state, app.myPlayerId);
  myPanelDock.innerHTML = renderMyPanel(state, app.myPlayerId, canAffordReserved, app.pendingCardAction);
}

function bindEntryForms() {
  const createForm = root.querySelector('form[data-form="create"]') as HTMLFormElement | null;
  const joinForm = root.querySelector('form[data-form="join"]') as HTMLFormElement | null;

  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const hostName = (new FormData(createForm).get('hostName') as string).trim();
    if (!hostName) return;
    socket.send({ type: 'create_room', hostName });
  });

  joinForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(joinForm);
    const roomCode = (data.get('roomCode') as string).trim().toUpperCase();
    const playerName = (data.get('playerName') as string).trim();
    if (!roomCode || !playerName) return;
    socket.send({ type: 'join_room', roomCode, playerName });
  });
}

function showError(code: string, message: string) {
  app.error = { code, message };
  render();
  setTimeout(() => {
    if (app.error?.message === message) {
      app.error = null;
      render();
    }
  }, 4000);
}

socket.onStatusChange = (status) => {
  app.status = status;
  if (status === 'open') {
    const identity = loadIdentity();
    if (identity) {
      socket.send({ type: 'rejoin', roomCode: identity.roomCode, playerId: identity.playerId, secret: identity.secret });
    }
  }
  render();
};

socket.onMessage = (message: ServerMessage) => {
  switch (message.type) {
    case 'room_created':
    case 'joined': {
      app.roomCode = message.roomCode;
      app.myPlayerId = message.playerId;
      app.secret = message.secret;
      app.screen = 'room';
      saveIdentity();
      document.body.classList.add('in-room');
      gameDock.classList.remove('hidden');
      chat.show();
      render();
      return;
    }
    case 'chat_history': {
      chat.setHistory(message.messages);
      return;
    }
    case 'chat': {
      chat.appendMessage(message.message);
      return;
    }
    case 'state': {
      const prevState = app.lastState;
      const nextState = message.state;
      const events =
        prevState && prevState.phase === 'in_progress' && nextState.phase === 'in_progress'
          ? planTransitions(prevState, nextState)
          : [];
      const before = events.length > 0 ? captureDomSnapshot(app.myPlayerId) : null;

      app.lastState = nextState;
      app.tokenSelection = [];
      app.discardSelection = {};
      app.pendingCardAction = null;
      app.pendingTakeTwo = null;
      render();
      if (before) runTransitions(events, before, app.myPlayerId);
      return;
    }
    case 'error': {
      if (message.code === 'REJOIN_FAILED' || message.code === 'ROOM_NOT_FOUND') {
        clearIdentity();
      }
      showError(message.code, message.message);
      return;
    }
  }
};

// Delegated on the whole document, not just #app: Buy/discard/choose-noble live in
// the docked panels outside #app, while take-tokens/pass stay on the board itself.
document.body.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'toggle-color': {
      const color = el.dataset.color as Color;
      const idx = app.tokenSelection.indexOf(color);
      if (idx >= 0) {
        app.tokenSelection.splice(idx, 1);
      } else if (app.tokenSelection.length < 3) {
        app.tokenSelection.push(color);
      }
      render();
      return;
    }
    case 'take-two-same': {
      app.pendingTakeTwo = el.dataset.color as Color;
      app.tokenSelection = [];
      render();
      return;
    }
    case 'confirm-take-two': {
      if (app.pendingTakeTwo) {
        socket.send({ type: 'take_two_same', color: app.pendingTakeTwo });
      }
      app.pendingTakeTwo = null;
      render();
      return;
    }
    case 'cancel-take-two': {
      app.pendingTakeTwo = null;
      render();
      return;
    }
    case 'confirm-take': {
      if (app.tokenSelection.length > 0) {
        socket.send({ type: 'take_tokens', colors: [...app.tokenSelection] });
      }
      return;
    }
    case 'cancel-take': {
      app.tokenSelection = [];
      render();
      return;
    }
    case 'reserve-faceup': {
      app.pendingCardAction = {
        kind: 'reserve-faceup',
        tier: Number(el.dataset.tier) as 1 | 2 | 3,
        slot: Number(el.dataset.slot),
      };
      render();
      return;
    }
    case 'reserve-deck': {
      app.pendingCardAction = { kind: 'reserve-deck', tier: Number(el.dataset.tier) as 1 | 2 | 3 };
      render();
      return;
    }
    case 'purchase-faceup': {
      app.pendingCardAction = {
        kind: 'purchase-faceup',
        tier: Number(el.dataset.tier) as 1 | 2 | 3,
        slot: Number(el.dataset.slot),
      };
      render();
      return;
    }
    case 'purchase-reserved': {
      app.pendingCardAction = { kind: 'purchase-reserved', cardId: el.dataset.cardId! };
      render();
      return;
    }
    case 'confirm-card-action': {
      const pending = app.pendingCardAction;
      if (!pending) return;
      switch (pending.kind) {
        case 'reserve-faceup':
          socket.send({
            type: 'reserve_card',
            source: { kind: 'faceup', tier: pending.tier, slot: pending.slot },
          });
          break;
        case 'reserve-deck':
          socket.send({ type: 'reserve_card', source: { kind: 'deck', tier: pending.tier } });
          break;
        case 'purchase-faceup':
          socket.send({
            type: 'purchase_card',
            source: { kind: 'faceup', tier: pending.tier, slot: pending.slot },
          });
          break;
        case 'purchase-reserved':
          socket.send({ type: 'purchase_card', source: { kind: 'reserved', cardId: pending.cardId } });
          break;
      }
      app.pendingCardAction = null;
      render();
      return;
    }
    case 'cancel-card-action': {
      app.pendingCardAction = null;
      render();
      return;
    }
    case 'pass': {
      socket.send({ type: 'pass' });
      return;
    }
    case 'discard-plus': {
      const color = el.dataset.color as TokenColor;
      const pending = app.lastState?.pendingAction;
      const excess = pending?.type === 'must_discard' ? pending.excess : Infinity;
      const chosen = Object.values(app.discardSelection).reduce((a, b) => a + (b ?? 0), 0);
      if (chosen >= excess) return;
      app.discardSelection[color] = (app.discardSelection[color] ?? 0) + 1;
      render();
      return;
    }
    case 'discard-minus': {
      const color = el.dataset.color as TokenColor;
      app.discardSelection[color] = Math.max(0, (app.discardSelection[color] ?? 0) - 1);
      render();
      return;
    }
    case 'confirm-discard': {
      const tokens: Partial<Record<TokenColor, number>> = {};
      for (const [color, n] of Object.entries(app.discardSelection)) {
        if (n && n > 0) tokens[color as TokenColor] = n;
      }
      socket.send({ type: 'discard_tokens', tokens });
      return;
    }
    case 'choose-noble': {
      socket.send({ type: 'choose_noble', nobleId: el.dataset.nobleId! });
      return;
    }
    case 'start-game': {
      socket.send({ type: 'start_game' });
      return;
    }
    case 'leave-room': {
      if (app.lastState?.phase === 'in_progress' && !window.confirm('Leave this game? You can rejoin later using the room code and your name.')) {
        return;
      }
      socket.send({ type: 'leave_room' });
      returnToEntry();
      return;
    }
    case 'open-rules': {
      app.showRules = true;
      render();
      return;
    }
    case 'close-rules': {
      app.showRules = false;
      render();
      return;
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && app.showRules) {
    app.showRules = false;
    render();
  }
});

render();
socket.connect();
