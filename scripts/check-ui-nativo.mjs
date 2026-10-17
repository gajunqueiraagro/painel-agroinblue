#!/usr/bin/env node
/**
 * check-ui-nativo — impede que controle NATIVO volte no lugar do design system.
 *
 * ⚠ POR QUE EXISTE. Em 06/09/2026 a linha da parcela nasceu com `<input type="date">` e
 * `<select>` crus. O nativo abre o calendário e o menu do SISTEMA OPERACIONAL: outro
 * idioma visual, outro formato de data por locale, outra fonte em cada máquina. Já tinha
 * sido corrigido uma vez (PR-OC-DATA-PADRAO-01) e voltou — por isso virou gate.
 * ⚠ "NÃO CABE EM 10px" NÃO É EXCEÇÃO: ajusta-se o componente (o `DatePicker` tem
 * `size="compact"`), nunca se volta ao nativo.
 *
 * ⚠ BASELINE, COMO O TSC. O repo tem 0 `type="date"` e 14 `<select>` herdados, em 8
 * arquivos [17 em 9 ate' o passo 8 do FIN-FINANC-28, que trocou conta e subcentro do Modo Rapido e o plano dos apelidos]. Falhar por eles pararia todo PR e o gate
 * seria desligado na primeira semana —
 * que é como um gate morre. Ele falha por ocorrência NOVA: arquivo fora da lista abaixo, ou
 * arquivo da lista com MAIS ocorrências do que a baseline registra. Reduzir é sempre aceito
 * e a baseline deve ser atualizada no mesmo PR.
 *
 * ⚠ SELETOR DE ENTIDADE SEM BUSCA (FIN-FINANC-28 passo 8, Gabriel 17/10/2026) — BASELINE ZERO. Conta, plano/subcentro,
 * fazenda e fornecedor/credor se escolhem pelo seletor DA CASA COM BUSCA (`SearchableSelect`, `ContaBancariaSelect`,
 * `FazendaSelect`, `FavorecidoSelect`). Reprova: (a) `comBusca={false}` nos dois seletores da casa; (b) `<Select>` ou
 * `<select>` cujas opções saem de um `.map(` sobre uma lista dessas entidades. Os dois componentes da casa ficam fora (eles
 * SÃO o seletor). O detector se AUTO-TESTA antes de varrer: se parar de achar o caso conhecido, sai com código 2.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * arquivo → [nDate, nSelect]. Só diminui.
 *
 * ⚠ REMEDIDO EM 08/09/2026: 42 → 39 arquivos, 25 → 20 `<select>`. Três saíram porque o
 * seletor de conta virou um só (`ContaBancariaSelect`); a quarta entrada era do
 * `EnriquecimentoToolbar`, apagado no 133b e esquecido aqui — baseline que sobrevive ao
 * arquivo permite o que não existe mais.
 * ⚠ E O CABEÇALHO ACIMA MENTIA desde a primeira medição: dizia "47 `type=\"date\"` em 39
 * arquivos" enquanto o mapa registrava 44 em 30. O número de `<select>` era o único certo.
 */
const BASELINE = new Map(Object.entries({
  "src/components/financeiro-v2/ModoRapidoGrid.tsx": [
    0,
    2
  ],
  "src/pages/AnaliseTrimestralTab.tsx": [
    0,
    3
  ],
  "src/pages/AuditoriaDesfrutes.tsx": [
    0,
    2
  ],
  "src/pages/LayoutLab.tsx": [
    0,
    2
  ],
  "src/v2/components/importacao/ImportLancDeParaPanel.tsx": [
    0,
    1
  ],
  "src/v2/pages/V2Fazendas.tsx": [
    0,
    1
  ],
  "src/v2/pages/V2MesaOperacional.tsx": [
    0,
    1
  ],
  "src/v3/components/V3TopBar.tsx": [
    0,
    2
  ]
}));

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { arquivos(p, acc); continue; }
    if (/\.tsx$/.test(nome) && !/\.test\./.test(nome)) acc.push(p);
  }
  return acc;
}

/** Conta fora de comentários — uma menção em `⚠ nunca use <input type="date">` não conta. */
function contar(texto) {
  const semComentario = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const date = (semComentario.match(/type="date"/g) || []).length;
  const select = (semComentario.match(/<select[\s>]/g) || []).length;
  return { date, select };
}

/** As listas de entidade: o nome da coleção que alimenta o `.map(` das opções. */
const ENTIDADE = /(contas|fornecedores|fazendas|fazOperacionais|fazenda\w*Options|planos?Query|planos|subcentro\w*|credores|classificacoes)/i;
const CASA = new Set(['src/components/shared/FazendaSelect.tsx', 'src/components/shared/ContaBancariaSelect.tsx']);

function semComentarios(texto) {
  return texto.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Seletores de entidade sem busca num arquivo: `comBusca={false}` e `<Select>`/`<select>` que mapeia lista de entidade. */
function seletoresSemBusca(texto) {
  const s = semComentarios(texto);
  const achados = [];
  for (const m of s.matchAll(/<(ContaBancariaSelect|FazendaSelect)\b[^]*?comBusca=\{false\}/g)) {
    if (!m[0].slice(1).includes('<')) achados.push(`${m[1]} com comBusca={false}`);
  }
  for (const m of s.matchAll(/<(Select|select)\b/g)) {
    const fecha = m[1] === 'Select' ? '</Select>' : '</select>';
    const fim = s.indexOf(fecha, m.index);
    if (fim < 0) continue;
    const bloco = s.slice(m.index, fim);
    for (const mm of bloco.matchAll(/\.map\(/g)) {
      const antes = bloco.slice(Math.max(0, mm.index - 60), mm.index);
      const nome = antes.match(/([\w$.?]+(?:\s*\?\?\s*\[\]\))?)\s*$/);
      if (nome && ENTIDADE.test(nome[1])) { achados.push(`<${m[1]}> com as opções de ${nome[1].trim()} sem busca`); break; }
    }
  }
  return achados;
}

/* Auto-teste: o caso conhecido tem de ser achado, e o seletor com busca e a lista que não é entidade não. */
{
  const caso = `<Select value={x} onValueChange={y}><SelectContent>{fazOperacionais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select>`;
  const nativo = `<select value={v}><option value="">—</option>{contasFazenda.map(c => <option key={c.id}>{c.nome}</option>)}</select>`;
  const plano = `<select>{(planoQuery.data ?? []).map((pc) => <option key={pc.id}>{pc.subcentro}</option>)}</select>`;
  const desligado = `<ContaBancariaSelect value={v} onValueChange={f} contas={c} comBusca={false} />`;
  const comBusca = `<SearchableSelect value={x} onValueChange={y} options={fazendas.map(f => ({ value: f.id, label: f.nome }))} />`;
  const status = `<Select value={s}><SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>`;
  const comentado = `{/* <Select>{fazendas.map(f => f)}</Select> */}`;
  const ok = seletoresSemBusca(caso).length === 1 && seletoresSemBusca(nativo).length === 1 && seletoresSemBusca(plano).length === 1
    && seletoresSemBusca(desligado).length === 1 && seletoresSemBusca(comBusca).length === 0 && seletoresSemBusca(status).length === 0
    && seletoresSemBusca(comentado).length === 0;
  if (!ok) {
    console.error('check-ui-nativo: o detector de seletor de entidade sem busca NÃO achou o caso conhecido (auto-teste). Nada foi varrido.');
    process.exit(2);
  }
}

const raiz = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';
const atual = new Map();
const semBusca = [];
for (const f of arquivos(raiz)) {
  const texto = readFileSync(f, 'utf8');
  const { date, select } = contar(texto);
  const rel = f.replace(/^.*?src\//, 'src/');
  if (date || select) atual.set(rel, { date, select });
  if (!CASA.has(rel)) for (const a of seletoresSemBusca(texto)) semBusca.push(`${rel}: ${a}`);
}

if (process.argv.includes('--baseline')) {
  const obj = {};
  for (const [f, c] of [...atual].sort()) obj[f] = [c.date, c.select];
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}

const novos = [...semBusca];
for (const [f, c] of atual) {
  const base = BASELINE.get(f) ?? [0, 0];
  if (c.date > base[0]) novos.push(`${f}: ${c.date} \`type="date"\` (baseline ${base[0]})`);
  if (c.select > base[1]) novos.push(`${f}: ${c.select} \`<select>\` nativo (baseline ${base[1]})`);
}

if (novos.length === 0) {
  console.log(`check-ui-nativo: nenhum controle nativo novo (baseline: ${BASELINE.size} arquivos herdados) e nenhum seletor de entidade sem busca (baseline 0).`);
  process.exit(0);
}
console.error('check-ui-nativo: controle NATIVO onde o design system tem componente.\n');
for (const n of novos) console.error(`  ${n}`);
console.error('\nUse `DatePicker` (size="compact" quando a linha for densa) e `Select` de @/components/ui.');
console.error('Seletor de conta, plano, fazenda ou fornecedor: o da casa COM BUSCA (SearchableSelect, ContaBancariaSelect, FazendaSelect, FavorecidoSelect).');
console.error('Reduzir a baseline é sempre bem-vindo — atualize-a no mesmo PR.');
process.exit(1);
