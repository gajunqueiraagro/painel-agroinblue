// UI-SEM-CORTE-01 — a bancada do `check:ui-cortes`: as telas reais, com o banco, o cliente e o leitor de fornecedores simulados
// (mocks/). Nao instancia cliente Supabase; nao fala com ambiente algum.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const m = (f: string) => path.join(AQUI, 'mocks', f);
export default defineConfig({
  root: AQUI, base: './', envDir: AQUI, plugins: [react()], logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: m('supabase.ts') },
    { find: /^@\/contexts\/ClienteContext$/, replacement: m('cliente.ts') },
    { find: /^@\/contexts\/AuthContext$/, replacement: m('auth.ts') },
    { find: /^@\/contexts\/FazendaContext$/, replacement: m('fazenda.ts') },
    { find: /^@\/hooks\/useFornecedoresDoCliente$/, replacement: m('leitor.ts') },
    { find: '@', replacement: path.resolve(RAIZ, 'src') } ] },
  css: { postcss: RAIZ },
  server: { fs: { allow: [RAIZ] } },
});
