import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStaticHandler } from './httpServer.js';
import { createHealthHandler } from './health.js';
import { createWsServer } from './wsServer.js';
import { resolveDataDir } from './persistence/paths.js';
import { RoomManager } from './roomManager.js';

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, '..', 'client');

const roomManager = new RoomManager(resolveDataDir());
roomManager.loadPersistedRooms();
roomManager.startExpirySweep();
const staticHandler = createStaticHandler(CLIENT_DIR);
const healthHandler = createHealthHandler(roomManager);

const server = createServer((req, res) => {
  if (req.url === '/healthz') return healthHandler(req, res);
  return staticHandler(req, res);
});
const wss = createWsServer(roomManager);

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`Splendor server listening on port ${PORT}`);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  roomManager.stopExpirySweep();
  for (const client of wss.clients) client.close(1001, 'Server restarting');

  wss.close(() => {
    server.close(() => {
      console.log('Shutdown complete.');
      process.exit(0);
    });
  });

  // Safety net: force-exit if something (e.g. a client ignoring the close frame) hangs.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
