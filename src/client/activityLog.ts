import type { ActivityEntry } from '../shared/types.js';

// Same persistent-DOM-subtree reasoning as chat.ts: this lives outside the
// full-innerHTML re-render so appending an entry never fights a chat keystroke
// or scroll position mid-turn.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function entryRowHtml(entry: ActivityEntry): string {
  return `
    <div class="activity-row">
      <span class="activity-time">${formatTime(entry.ts)}</span>
      <span class="activity-text">${escapeHtml(entry.text)}</span>
    </div>`;
}

export function initActivityLog() {
  const log = document.getElementById('activity-log')!;

  function setHistory(entries: ActivityEntry[]) {
    log.innerHTML = entries.map(entryRowHtml).join('');
    log.scrollTop = log.scrollHeight;
  }

  function appendEntry(entry: ActivityEntry) {
    log.insertAdjacentHTML('beforeend', entryRowHtml(entry));
    log.scrollTop = log.scrollHeight;
  }

  return { setHistory, appendEntry };
}
