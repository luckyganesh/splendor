import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStaticHandler } from './httpServer.js';
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

const server = createServer(staticHandler);
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
