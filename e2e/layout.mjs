/**
 * V14 — mede geometria REAL no chromium e fotografa as quatro larguras.
 *
 * Sobreposição não é opinião: pega o bounding box de cada controle interativo e
 * verifica interseção de área par a par. Também confere que nada escapa do
 * viewport (corte) e que todo controle é clicável no seu centro (acessível).
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAGINA = 'http://127.0.0.1:5199/e2e/harness.html';
const SAIDA = process.argv[2];

const LARGURAS = [
  { nome: 'desktop-largo', w: 1920, h: 900 },
  { nome: 'notebook',      w: 1366, h: 800 },
  { nome: 'tablet',        w: 768,  h: 900 },
  { nome: 'celular',       w: 375,  h: 900 },
];
const CENARIOS = ['base', 'pendente', 'incluindo', 'vazio'];

const areaIntersec = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
};

const navegador = await chromium.launch();
const relatorio = [];
let falhas = 0;

for (const cen of CENARIOS) {
  for (const L of LARGURAS) {
    const ctx = await navegador.newContext({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.goto(`${PAGINA}?cenario=${cen}`);
    await pg.waitForSelector('[data-testid="controles-lista"]');

    // ADJACENCIA: Atividade e Aplicar precisam ser vizinhos imediatos, na mesma
    // fileira. "Ao lado" nao e opiniao: mesma linha (topos alinhados) e nenhum
    // outro controle interativo entre eles no eixo horizontal.
    const adjacencia = await pg.evaluate(() => {
      const at = document.querySelector('[data-testid="campo-atividade"]');
      const ap = document.querySelector('[data-testid="btn-aplicar"]');
      if (!at || !ap) return { ok: false, motivo: 'campo ou botao ausente' };
      const a = at.getBoundingClientRect();
      const b = ap.getBoundingClientRect();
      const mesmaLinha = Math.abs((a.y + a.height) - (b.y + b.height)) < 8;
      const aposAtividade = b.x >= a.x + a.width - 1;
      const folga = b.x - (a.x + a.width);
      const intrusos = Array.from(document.querySelectorAll('input,select,button'))
        .filter((e) => e !== at && e !== ap && !at.contains(e))
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && Math.abs((r.y + r.height) - (b.y + b.height)) < 8)
        .filter((r) => r.x >= a.x + a.width - 1 && r.x + r.width <= b.x + 1).length;
      return {
        ok: mesmaLinha && aposAtividade && intrusos === 0 && folga < 40,
        mesmaLinha, aposAtividade, folga: Math.round(folga), intrusos,
      };
    });

    const controles = await pg.$$eval('[data-testid^="btn-"], [data-testid="slot-exportar"]', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { id: e.getAttribute('data-testid'), x: r.x, y: r.y, width: r.width, height: r.height };
      }));

    const visiveis = controles.filter((c) => c.width > 0 && c.height > 0);
    const sobrepostos = [];
    for (let i = 0; i < visiveis.length; i++) {
      for (let j = i + 1; j < visiveis.length; j++) {
        // slot-exportar CONTEM o botao de exportar: conter nao e sobrepor
        const a = visiveis[i], b = visiveis[j];
        if (a.id === 'slot-exportar' || b.id === 'slot-exportar') continue;
        if (areaIntersec(a, b) > 1) sobrepostos.push([a.id, b.id, Math.round(areaIntersec(a, b))]);
      }
    }

    const cortados = visiveis.filter((c) => c.x < -0.5 || c.x + c.width > L.w + 0.5);
    const scrollX = await pg.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

    // Todo controle HABILITADO deve ser alcancavel: elementFromPoint no centro
    // cai nele. Botao desabilitado tem `pointer-events: none` por desenho — nao
    // ser clicavel e o comportamento correto, nao um defeito de layout. Ele
    // continua sendo cobrado quanto a visibilidade, corte e sobreposicao.
    const inalcancaveis = await pg.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="btn-"]'))
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .filter((e) => !(e instanceof HTMLButtonElement && e.disabled))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const alvo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !(alvo && (e === alvo || e.contains(alvo)));
        })
        .map((e) => e.getAttribute('data-testid')));

    // Desabilitado nao pode virar invisivel: continua ocupando espaco e visivel.
    const desabilitadosInvisiveis = await pg.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="btn-"]'))
        .filter((e) => e instanceof HTMLButtonElement && e.disabled)
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none';
        })
        .map((e) => e.getAttribute('data-testid')));

    const ok = sobrepostos.length === 0 && cortados.length === 0 && !scrollX
      && inalcancaveis.length === 0 && desabilitadosInvisiveis.length === 0 && adjacencia.ok;
    if (!ok) falhas++;
    relatorio.push({
      cenario: cen, largura: L.nome, viewport: `${L.w}x${L.h}`,
      controles: visiveis.length, sobrepostos, cortados: cortados.map((c) => c.id),
      scrollHorizontal: scrollX, inalcancaveis, desabilitadosInvisiveis, adjacencia, ok,
    });

    await pg.screenshot({ path: `${SAIDA}/${cen}__${L.nome}.png`, fullPage: true });
    await ctx.close();
  }
}
await navegador.close();

for (const r of relatorio) {
  console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.cenario.padEnd(10)} ${r.largura.padEnd(14)} ${r.viewport.padEnd(9)} `
    + `controles=${String(r.controles).padStart(2)} sobrepostos=${r.sobrepostos.length} `
    + `cortados=${r.cortados.length} scrollX=${r.scrollHorizontal} inalcancaveis=${r.inalcancaveis.length} `
    + `desab.invis=${r.desabilitadosInvisiveis.length} adjacente=${r.adjacencia.ok}(folga ${r.adjacencia.folga}px)`);
  if (!r.ok) console.log('   detalhe:', JSON.stringify({ s: r.sobrepostos, c: r.cortados, i: r.inalcancaveis, adj: r.adjacencia }));
}
console.log(`\n${relatorio.length - falhas}/${relatorio.length} combinacoes OK: sem sobreposicao, sem corte, sem scroll indevido, Atividade e Aplicar adjacentes`);
process.exit(falhas === 0 ? 0 : 1);
