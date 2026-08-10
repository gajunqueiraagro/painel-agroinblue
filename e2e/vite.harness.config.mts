// Config isolado da bancada 2C-4.
//
// Usa `build`, que NAO passa pelo guard de alvo do vite.config.ts da aplicacao —
// e a bancada nao instancia cliente Supabase algum, entao nao existe ambiente a
// acessar. O config da aplicacao permanece intocado.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');

export default defineConfig({
  root: RAIZ,
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(RAIZ, 'src') } },
  build: {
    outDir: path.resolve(AQUI, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(AQUI, 'harness.html') },
  },
});
