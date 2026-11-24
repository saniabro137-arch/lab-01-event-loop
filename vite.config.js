import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({build:{rollupOptions:{input:{lab01:resolve('index.html'),lab02:resolve('lab02.html')}}}});
