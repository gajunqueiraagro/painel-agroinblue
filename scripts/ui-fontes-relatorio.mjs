/**
 * UI-FONTES-REGUA-01 (Gabriel 25/11 07:41) — o RELATÓRIO das telas fora da régua de fonte, para a limpeza que o Gabriel fará depois.
 * Junta o `--relatorio-fontes ARQ.jsonl` do `check:ui-cortes` (uma linha por elemento, rodada a rodada) num markdown: por tela da bancada,
 * cada elemento com o tipo, o tamanho medido e o limite. Não conserta nada.
 *
 *   node scripts/ui-fontes-relatorio.mjs ENTRADA.jsonl SAIDA.md
 */
import fs from 'node:fs';

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) { console.error('uso: node scripts/ui-fontes-relatorio.mjs ENTRADA.jsonl SAIDA.md'); process.exit(2); }
const linhas = fs.readFileSync(entrada, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/* um elemento = (tela, tipo, medida, a peça — tag + data-testid, sem o texto —, px): as linhas de uma lista viram UMA entrada com a
   contagem e um exemplo do texto; as cenas e os tamanhos em que apareceu */
const peca = (e) => e.replace(/ ".*$/, '');
const porChave = new Map();
for (const l of linhas) {
  const k = [l.tela, l.tipo, l.medida, peca(l.elemento), l.px].join('|');
  const a = porChave.get(k) ?? { ...l, elemento: peca(l.elemento), exemplo: (l.elemento.match(/ "(.*)"$/) ?? [])[1] ?? '', textos: new Set(), cenas: new Set(), tamanhos: new Set() };
  a.textos.add(l.elemento); a.cenas.add(l.cena); a.tamanhos.add(l.tamanho); porChave.set(k, a);
}
const itens = [...porChave.values()];
const porTela = new Map();
for (const a of itens) porTela.set(a.tela, [...(porTela.get(a.tela) ?? []), a]);
const telas = [...porTela.keys()].sort((x, y) => porTela.get(y).length - porTela.get(x).length || x.localeCompare(y));
const porTipo = new Map();
for (const a of itens) { const t = `${a.tipo} (${a.medida})`; porTipo.set(t, (porTipo.get(t) ?? 0) + 1); }
const esc = (t) => String(t).replace(/\|/g, '\\|');

const out = [];
out.push(`# Régua de fonte — telas fora da régua (UI-FONTES-REGUA-01)`, '');
out.push(`${itens.length} elementos fora da régua em ${telas.length} telas da bancada (${linhas.length} medições brutas).`, '');
out.push('Régua: linha de tabela ≤ 11 · campo/botão/aba ≤ 11 · rótulo/cabeçalho/data ≤ 10 · título de modal ≤ 13 · altura de campo/botão ≤ 28 · valor em destaque ≤ 16.', '');
out.push('## Por tipo', '', '| Tipo | Elementos |', '|---|---:|');
for (const [t, n] of [...porTipo].sort((a, b) => b[1] - a[1])) out.push(`| ${esc(t)} | ${n} |`);
out.push('', '## Por tela (a que tem mais primeiro)', '');
for (const t of telas) {
  const xs = porTela.get(t).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.px - a.px);
  out.push(`### ${t} — ${xs.length}`, '', '| Elemento | Exemplo (nº) | Tipo | Medido | Régua | Cenas |', '|---|---|---|---:|---:|---|');
  for (const a of xs) {
    const cenas = [...a.cenas]; const c = cenas.slice(0, 3).join(', ') + (cenas.length > 3 ? ` +${cenas.length - 3}` : '');
    out.push(`| ${esc(a.elemento)} | ${esc(a.exemplo)}${a.textos.size > 1 ? ` (${a.textos.size})` : ''} | ${esc(a.tipo)}${a.medida === 'altura' ? ' (altura)' : ''} | ${a.px}px | ${a.limite}px | ${esc(c)} |`);
  }
  out.push('');
}
fs.writeFileSync(saida, out.join('\n'));
console.log(`ui-fontes-relatorio: ${itens.length} elementos, ${telas.length} telas → ${saida}`);
