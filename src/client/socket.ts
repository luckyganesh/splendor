import type { ClientMessage, ServerMessage } from '../shared/protocol.js';

export class GameSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private explicitlyClosed = false;

  onMessage: (message: ServerMessage) => void = () => {};
  onStatusChange: (status: 'connecting' | 'open' | 'closed') => void = () => {};

  connect() {
    this.explicitlyClosed = false;
    this.openSocket();
  }

  private openSocket() {
    this.onStatusChange('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.onStatusChange('open');
    });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      this.onMessage(message);
    });

    ws.addEventListener('close', () => {
      this.onStatusChange('closed');
      if (!this.explicitlyClosed) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 10_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    this.explicitlyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }
}
