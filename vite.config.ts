/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/** Dev-only: lets the running game POST PNG captures to disk (used for automated visual checks). */
function debugCapture(): Plugin {
  return {
    name: 'omf-debug-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__debug/capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        // (the game's own page only: another site open in the browser must not write files here)
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const name = String(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'capture').replace(/[^\w.-]/g, '_');
        const dir = process.env.OMF_CAPTURE_DIR ?? path.resolve('.captures');
        fs.mkdirSync(dir, { recursive: true });
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const file = path.join(dir, /\.(png|jpg)$/.test(name) ? name : `${name}.png`);
          fs.writeFileSync(file, Buffer.concat(chunks));
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ file }));
        });
      });
    },
  };
}

/**
 * Dev-only: LAN games between the dev server's tabs (src/net/lan.ts, the desktop app does it over the network): games
 * are hosted on the server, found and joined there, and the messages pass through it.
 */
function lanRelay(): Plugin {
  return {
    name: 'omf-lan-relay',
    apply: 'serve',
    configureServer(server) {
      interface Client {
        send(event: string, payload?: unknown): void;
        socket?: unknown;
      }
      const key = (c: Client) => c.socket ?? c;
      const hosts = new Map<unknown, { client: Client; name: string; version: string; address: string }>();
      const conns = new Map<number, [Client, Client]>();
      let ids = 0;
      let hostIds = 0;
      const tell = (c: Client, m: Record<string, unknown>) => c.send('omf:lan', m);
      const busy = (c: Client) => [...conns.values()].some(([a]) => key(a) === key(c));
      const drop = (id: number, from: Client | null, reason: string) => {
        const pair = conns.get(id);
        if (!pair) return;
        conns.delete(id);
        for (const c of pair) if (!from || key(c) !== key(from)) tell(c, { op: 'close', id, reason });
      };
      server.ws.on('omf:lan', (m: Record<string, unknown>, client: Client) => {
        const req = m.req;
        switch (m.op) {
          case 'host':
            hosts.set(key(client), { client, name: String(m.name ?? ''), version: String(m.version ?? ''), address: `dev:${++hostIds}` });
            tell(client, { op: 'hosted', req });
            break;
          case 'unhost':
            hosts.delete(key(client));
            break;
          case 'scan':
            tell(client, {
              op: 'games', req,
              games: [...hosts.values()].filter((h) => key(h.client) !== key(client))
                .map((h) => ({ name: h.name, address: h.address, version: h.version, busy: busy(h.client) })),
            });
            break;
          case 'join': {
            const host = [...hosts.values()].find((h) => h.address === m.address);
            if (!host) {
              tell(client, { op: 'error', req, reason: 'No game is hosted there.' });
              break;
            }
            const id = ++ids;
            conns.set(id, [host.client, client]);
            tell(host.client, { op: 'open', id });
            tell(client, { op: 'joined', req, id });
            break;
          }
          case 'send': {
            const pair = conns.get(Number(m.id));
            const to = pair?.find((c) => key(c) !== key(client));
            if (to) tell(to, { op: 'data', id: m.id, text: String(m.text ?? '') });
            break;
          }
          case 'close':
            drop(Number(m.id), client, 'closed');
            break;
        }
      });
      // (a tab closed or reloaded: its game and its connections go)
      server.ws.on('vite:client:disconnect', (_: unknown, client: Client) => {
        hosts.delete(key(client));
        for (const [id, pair] of [...conns]) if (pair.some((c) => key(c) === key(client))) drop(id, client, 'closed');
      });
    },
  };
}

/** The version shown by the game (the main menu's corner, the loading screen). */
const VERSION = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version as string;

export default defineConfig({
  // Relative base so the same build works on any web path and inside the desktop (Tauri) shell.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [debugCapture(), lanRelay()],
  server: {
    // Android's emulator / physical device has to reach Vite over the LAN during `tauri android dev`.
    host: process.env.TAURI_DEV_HOST || '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Big generated and working folders (screen recordings, the art packs, the original game, the desktop build) are
    // not the app's source: watching their tens of thousands of files kept the dev server busy.
    watch: {
      ignored: ['**/.captures/**', '**/hd-pack/**', '**/newart-pack/**', '**/rework-pack/**', '**/menu-pack/**', '**/omf21cd/**', '**/src-tauri/target/**', '**/dist/**'],
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    // Two pages: the game, and OMF Studio (the modding tool) next to it (they share the code and the storage).
    rollupOptions: {
      input: { main: path.resolve('index.html'), studio: path.resolve('studio.html') },
    },
  },
  test: {
    // The game logic runs against the real data: CI machines can be several times slower than a desktop.
    testTimeout: 15000,
  },
});
