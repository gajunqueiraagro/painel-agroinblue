/* MAPA-PRACA-ESTAVEL-01 — a prova da praça (homologação 02/11 21:54, Agnaldo › Sta. Tereza › Modulo 03, reprovada):
 *   (1) o centro da praça e um vértice ARRASTAM (o centro anda, as cercas acompanham);
 *   (2) a barra abre em LOSANGO mesmo com rascunho guardado de outra sessão (círculo 25 m · 8);
 *   (3) 10 cliques seguidos no mapa (no meio das divisões, perto dos lados curtos, na borda) não mudam cercas, nomes, ordem da lista nem a
 *       largura da barra; nenhuma dica aberta cobre a lista;
 * Uso: `node scripts/ui-cortes/reproduzirPraca.mjs [--fotos <pasta>] [--modulo03]` — sai com 1 se algo pular. Bancada SINTÉTICA. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const FOTOS = arg('--fotos');
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });
const URL_ = `tela=mapa-geo${process.argv.includes('--modulo03') ? '&modulo03=1' : ''}`;

const servidor = await createServer({ configFile: path.join(AQUI, 'vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
const falhas = [];
const foto = async (p, nome) => { if (FOTOS) await p.screenshot({ path: path.join(FOTOS, `${nome}.png`) }); };

/* o estado que NÃO pode mudar com clique: as cercas (pontos), os nomes na ordem da lista, a largura da barra, a barra de botões */
const estado = (p) => p.evaluate(() => {
  const linhas = [...document.querySelectorAll('[data-testid="piquetes-linha"]')].map(tr => {
    const td = tr.querySelectorAll('td');
    return `${td[0]?.textContent}|${td[1]?.querySelector('input')?.value ?? td[1]?.textContent}|${td[2]?.textContent}`;
  });
  const barra = document.querySelector('[data-testid="barra-piquetes"]')?.getBoundingClientRect();
  const praca = document.querySelector('[data-testid="piquetes-praca-botao"]')?.textContent ?? '';
  const alcas = [...document.querySelectorAll('.piquete-alca')].map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; }).sort();
  return { linhas, barra: barra ? `${Math.round(barra.width)}x${Math.round(barra.height)}` : '', praca, alcas: alcas.join(' ') };
});
/* dicas abertas que cobrem a lista ou o ponto do clique */
const dicasSobre = (p, x, y) => p.evaluate(([cx, cy]) => {
  const lista = document.querySelector('[data-testid="piquetes-lista"]')?.getBoundingClientRect();
  const cobre = (r, q) => q && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
  return [...document.querySelectorAll('[role="tooltip"], .leaflet-tooltip, [data-dica-do-mapa]')].filter(e => e.getBoundingClientRect().width > 0)
    .flatMap(e => { const r = e.getBoundingClientRect(); const ponto = { left: cx - 4, right: cx + 4, top: cy - 4, bottom: cy + 4 };
      return [...(cobre(r, lista) ? [`dica "${e.textContent?.slice(0, 40)}" sobre a lista`] : []), ...(cobre(r, ponto) ? [`dica "${e.textContent?.slice(0, 40)}" sobre o clique`] : [])]; });
}, [x, y]);

try {
  for (const comRascunho of [false, true]) {
    const p = await navegador.newPage({ viewport: { width: 1366, height: 768 } });
    const tag = comRascunho ? 'rascunho' : 'limpo';
    await p.goto(`${base}/index.html?${URL_}`); await p.waitForTimeout(1300);
    if (comRascunho) {
      /* um rascunho de OUTRA sessão: círculo 25 m · 8 (o que o Gabriel viu) — o padrão tem de continuar losango */
      await p.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes('piquetes')) localStorage.removeItem(k); }
      });
    }
    await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600);
    await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first().click(); await p.waitForTimeout(500);
    await p.locator('[data-testid="editar-piquetes"]').click();
    await p.locator('[data-testid="barra-piquetes"]').waitFor(); await p.waitForTimeout(900);
    if (comRascunho) {
      /* troca para círculo 8 (vira rascunho guardado), sai, e abre de novo: a barra abre em Losango e oferece o rascunho */
      await p.locator('[data-testid="piquetes-praca-botao"]').click(); await p.waitForTimeout(300);
      await p.getByRole('radio', { name: 'Círculo' }).or(p.locator('button', { hasText: 'Círculo' })).first().click(); await p.waitForTimeout(300);
      await p.locator('button', { hasText: /^8$/ }).first().click(); await p.waitForTimeout(300);
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      await p.locator('[data-testid="piquetes-cancelar"]').click(); await p.waitForTimeout(300);
      if (await p.locator('[data-testid="piquetes-continuar-editando"]').count()) {
        /* "Descartar o que foi feito?" — Continuar mantém; aqui o rascunho tem de ficar guardado: saímos sem descartar pelo Esc da página */
        await p.locator('[data-testid="piquetes-continuar-editando"]').click();
      }
      await p.reload(); await p.waitForTimeout(1300);
      await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600);
      await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first().click(); await p.waitForTimeout(500);
      await p.locator('[data-testid="editar-piquetes"]').click();
      await p.locator('[data-testid="barra-piquetes"]').waitFor(); await p.waitForTimeout(900);
      const t = await p.locator('[data-testid="piquetes-praca-botao"]').textContent();
      if (!/Losango/.test(t ?? '')) falhas.push(`[${tag}] ao abrir com rascunho guardado a barra diz "${t}" (devia ser Losango)`);
      if (await p.locator('[data-testid="piquetes-continuar-rascunho"]').count()) {
        await p.locator('[data-testid="piquetes-continuar-rascunho"]').click(); await p.waitForTimeout(600);
        const t2 = await p.locator('[data-testid="piquetes-praca-botao"]').textContent();
        console.log(`[${tag}] depois de Continuar o rascunho a barra diz "${t2}"`);
      }
    } else {
      const t = await p.locator('[data-testid="piquetes-praca-botao"]').textContent();
      if (!/Losango/.test(t ?? '')) falhas.push(`[${tag}] ao abrir a barra diz "${t}" (devia ser Losango)`);
    }
    await foto(p, `${tag}-0-aberto`);

    /* (1) arrastar o centro 60 px para a direita: o centro e as cercas andam */
    const centro = p.locator('.piquete-alca').filter({ has: p.locator('span[style*="rgba(245, 158, 11"]') }).first();
    const alcas = await p.locator('.piquete-alca').count();
    const caixas = await p.locator('.piquete-alca').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); const s = e.querySelector('span')?.getAttribute('style') ?? '';
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, centro: s.includes('245,158,11,.9') || s.includes('rgba(245,158,11') }; }));
    const c = caixas.find(k => k.centro);
    if (!c) falhas.push(`[${tag}] não achei a alça do centro (${alcas} alças)`);
    else {
      const antes = await estado(p);
      await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 30, c.y + 10, { steps: 6 }); await p.mouse.move(c.x + 60, c.y + 20, { steps: 6 }); await p.mouse.up();
      await p.waitForTimeout(500);
      const depois = await estado(p);
      const novo = await p.locator('.piquete-alca').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); const s = e.querySelector('span')?.getAttribute('style') ?? '';
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, centro: s.includes('rgba(245,158,11') }; }).find(k => k.centro));
      const andou = novo ? Math.hypot(novo.x - c.x, novo.y - c.y) : 0;
      if (andou < 40) falhas.push(`[${tag}] o centro da praça não andou com o arrasto (andou ${Math.round(andou)} px)`);
      if (antes.alcas === depois.alcas) falhas.push(`[${tag}] as cercas não acompanharam o centro`);
      void centro;
    }
    await foto(p, `${tag}-1-arrastou`);

    /* (3) 10 cliques seguidos no mapa: nada muda */
    const mapa = await p.locator('.leaflet-container').boundingBox();
    const ref = await estado(p);
    /* a caixa do pasto = a união das divisões (tracejadas); os cliques caem dentro delas e junto da borda */
    const r0 = await p.evaluate(() => {
      const rs = [...document.querySelectorAll('.leaflet-overlay-pane path[stroke-dasharray="6 4"]')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
      const [x0, y0, x1, y1] = [Math.min(...rs.map(r => r.left)), Math.min(...rs.map(r => r.top)), Math.max(...rs.map(r => r.right)), Math.max(...rs.map(r => r.bottom))];
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });
    void mapa;
    const pontos = [[0.45, 0.4], [0.3, 0.45], [0.6, 0.6], [0.06, 0.5], [0.5, 0.06], [0.88, 0.62], [0.5, 0.93], [0.3, 0.7], [0.7, 0.35], [0.55, 0.5]]
      .map(([fx, fy]) => [r0.x + fx * r0.w, r0.y + fy * r0.h]);
    for (let k = 0; k < pontos.length; k++) {
      const [x, y] = pontos[k];
      await p.mouse.click(x, y); await p.waitForTimeout(250);
      let e = await estado(p);
      /* clicar NUMA CERCA a seleciona (o gesto que a barra anuncia): as alças da cerca aparecem; o Esc solta e tudo volta igual */
      if (e.alcas !== ref.alcas && await p.locator('[data-testid="piquetes-frase-cerca"]').count()) {
        await foto(p, `${tag}-2-clique-${String(k + 1).padStart(2, '0')}-cerca`);
        await p.keyboard.press('Escape'); await p.waitForTimeout(200); e = await estado(p);
      }
      const mudou = ['linhas', 'barra', 'praca', 'alcas'].filter(c2 => e[c2] !== ref[c2] && !(c2 === 'linhas' && e.linhas.join() === ref.linhas.join()));
      if (mudou.length) falhas.push(`[${tag}] clique ${k + 1} (${Math.round(x)},${Math.round(y)}) mudou: ${mudou.join(', ')}${mudou.includes('linhas') ? ` — ${ref.linhas.join(' / ')} → ${e.linhas.join(' / ')}` : ''}`);
      const d = await dicasSobre(p, x, y);
      if (d.length) falhas.push(`[${tag}] clique ${k + 1}: ${d.join('; ')}`);
      await foto(p, `${tag}-2-clique-${String(k + 1).padStart(2, '0')}`);
    }
    /* (1b) aproximado (+ 3×), os CANTOS ganham alça e arrastam (a cerca do canto acompanha); o centro continua por cima */
    for (let z = 0; z < 3; z++) {
      const c0 = await p.locator('span[data-alca="centro"]').first().boundingBox();
      if (!c0) break;
      await p.mouse.move(c0.x + c0.width / 2, c0.y + c0.height / 2); await p.mouse.wheel(0, -240); await p.waitForTimeout(600);
    }
    const canto = await p.locator('span[data-alca="vertice"]').first().boundingBox().catch(() => null);
    if (!canto) falhas.push(`[${tag}] aproximado, os cantos da praça não ganharam alça`);
    else {
      const linhasAntes = (await estado(p)).linhas.join(' / ');
      const [cx, cy] = [canto.x + canto.width / 2, canto.y + canto.height / 2];
      await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 15, cy + 15, { steps: 5 }); await p.mouse.move(cx + 30, cy + 25, { steps: 5 }); await p.mouse.up();
      await p.waitForTimeout(400);
      const depois = await p.locator('span[data-alca="vertice"]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
      if (!depois.some(([x, y]) => Math.hypot(x - cx - 30, y - cy - 25) < 8)) falhas.push(`[${tag}] o canto da praça não foi para onde foi arrastado`);
      if ((await estado(p)).linhas.join(' / ') === linhasAntes) falhas.push(`[${tag}] arrastar o canto não mudou as áreas (a cerca não acompanhou)`);
      await foto(p, `${tag}-4-canto-arrastado`);
    }
    /* (4) "Lado de referência": só com a ferramenta ligada o clique na borda gira a cruz; um clique e ela desliga */
    if (await p.locator('[data-testid="piquetes-referencia"]').count()) {
      await p.locator('[data-testid="piquetes-referencia"]').click(); await p.waitForTimeout(200);
      const dica = await p.locator('[data-testid="piquetes-dica"]').textContent().catch(() => '');
      if (!/lado do pasto/.test(dica ?? '')) falhas.push(`[${tag}] a barra não anuncia o gesto do lado de referência (dica: "${dica}")`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      if (await p.locator('[data-testid="piquetes-referencia"][data-state="active"], [data-testid="piquetes-referencia"].bg-primary').count()) falhas.push(`[${tag}] o Esc não desligou o lado de referência`);
    }
    /* o hover no "Mais" não cobre a lista */
    if (await p.locator('[data-testid="piquetes-mais"]').count()) {
      await p.locator('[data-testid="piquetes-mais"]').hover(); await p.waitForTimeout(800);
      const b = await p.locator('[data-testid="piquetes-mais"]').boundingBox();
      const d = await dicasSobre(p, b.x - 999, b.y - 999);
      if (d.length) falhas.push(`[${tag}] hover no Mais: ${d.join('; ')}`);
      await foto(p, `${tag}-3-dica-mais`);
    }
    await p.close();
  }
} finally {
  await navegador.close(); await servidor.close();
}
if (falhas.length) { console.log(`PULOU (${falhas.length}):\n- ${falhas.join('\n- ')}`); process.exit(1); }
console.log('OK: a praça arrasta, abre em losango e 10 cliques não mudam nada');
