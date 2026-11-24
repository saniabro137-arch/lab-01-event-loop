
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

function rooms(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url === '/api/rooms') {
      req.url = '/api/rooms.json';
    }
    next();
  });
}

export default defineConfig({
  plugins: [
    {
      name: 'rooms-api',
      configureServer: rooms,
      configurePreviewServer: rooms,
    },
  ],
  build: {
    rollupOptions: {
      input: {
        lab01: resolve('index.html'),
        lab02: resolve('lab02.html'),
        lab03: resolve('lab03.html'),
      },
    },
  },
});
