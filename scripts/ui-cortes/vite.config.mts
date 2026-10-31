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
    /* PROD-EVOLUCAO-01a — a Evolução no Ano recebe meses sintéticos no pior caso de largura (a conta é a da `montarEvolucao`, testada) */
    { find: /^@\/hooks\/useEvolucaoDoAno$/, replacement: m('evolucao.ts') },
    /* PROD-EVOLUCAO-01b — o mês por categoria recebe linhas sintéticas no pior caso de largura (a conta é a da `montarMesPorCategoria`) */
    { find: /^@\/hooks\/useEvolucaoDoMes$/, replacement: m('evolucaoMes.ts') },
    /* MAPA-02b (D4) — o fundo do mapa é neutro e local: nenhum tile do Google nem do OSM nos gates */
    { find: /^@\/lib\/mapa\/camadaDoFundo$/, replacement: m('fundo.ts') },
    { find: '@', replacement: path.resolve(RAIZ, 'src') } ] },
  css: { postcss: RAIZ },
  server: { fs: { allow: [RAIZ] } },
});
