import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InternalGameState } from '../../engine/setup.js';
import type { ActivityEntry, BotDifficulty, ChatMessage } from '../../shared/types.js';

export interface RoomSnapshot {
  schemaVersion: 1;
  roomCode: string;
  createdAt: string;
  updatedAt: string;
  hostPlayerId: string;
  players: { id: string; name: string; secretHash: string; isBot?: boolean; botDifficulty?: BotDifficulty }[];
  engineState: InternalGameState | null;
  // Optional: older snapshots (pre-chat feature) won't have this field.
  chatLog?: ChatMessage[];
  // Optional: older snapshots (pre-bots) won't have this field.
  botNameBags?: Partial<Record<BotDifficulty, string[]>>;
  // Optional: older snapshots (pre-activity-log feature) won't have this field.
  activityLog?: ActivityEntry[];
}

function isValidSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    s.schemaVersion === 1 &&
    typeof s.roomCode === 'string' &&
    typeof s.createdAt === 'string' &&
    typeof s.updatedAt === 'string' &&
    typeof s.hostPlayerId === 'string' &&
    Array.isArray(s.players)
  );
}

export function writeSnapshot(dataDir: string, snapshot: RoomSnapshot) {
  const finalPath = join(dataDir, `${snapshot.roomCode}.json`);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(snapshot));
  renameSync(tmpPath, finalPath);
}

export function deleteSnapshot(dataDir: string, roomCode: string) {
  try {
    unlinkSync(join(dataDir, `${roomCode}.json`));
  } catch {
    // already gone, or was never persisted — fine either way
  }
}

export function loadAllSnapshots(dataDir: string): RoomSnapshot[] {
  const snapshots: RoomSnapshot[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return snapshots;
  }

  for (const entry of entries) {
    if (entry.endsWith('.tmp')) {
      try {
        unlinkSync(join(dataDir, entry));
      } catch {
        // best-effort cleanup of a crash-interrupted write
      }
      continue;
    }
    if (!entry.endsWith('.json')) continue;

    const fullPath = join(dataDir, entry);
    try {
      const parsed: unknown = JSON.parse(readFileSync(fullPath, 'utf8'));
      if (!isValidSnapshot(parsed)) throw new Error('Missing required snapshot fields');
      snapshots.push(parsed);
    } catch (e) {
      console.warn(`Skipping unreadable room snapshot ${entry}:`, (e as Error).message);
      try {
        renameSync(fullPath, `${fullPath}.corrupt-${Date.now()}`);
      } catch {
        // if even the rename fails, leave the file in place and move on
      }
    }
  }

  return snapshots;
}
