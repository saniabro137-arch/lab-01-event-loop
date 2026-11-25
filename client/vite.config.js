import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const target = 'http://127.0.0.1:3001';

function missingSprite(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split('?')[0] === '/lab3/missing.png') {
      res.statusCode = 404;
      res.end('Sprite not found');
      return;
    }
    next();
  });
}

const proxy = {
  '/api': {
    target,
    changeOrigin: true
  },
  '/health': {
    target,
    changeOrigin: true
  },
  '/ws': {
    target,
    ws: true,
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [
    {
      name: 'missing-sprite',
      configureServer: missingSprite,
      configurePreviewServer: missingSprite
    }
  ],
  server: {
    host: '0.0.0.0',
    proxy
  },
  preview: {
    host: '0.0.0.0',
    proxy
  },
  build: {
    rollupOptions: {
      input: {
        lab01: resolve('index.html'),
        lab02: resolve('lab02.html'),
        lab03: resolve('lab03.html'),
        lab04: resolve('lab04.html'),
        lab05: resolve('lab05.html')
      }
    }
  }
});
