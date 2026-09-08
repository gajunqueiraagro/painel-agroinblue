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
 * ⚠ BASELINE, COMO O TSC. O repo tem 44 `type="date"` e 20 `<select>` herdados, em 30 e 10
 * arquivos (39 no total; um arquivo tem os dois). Falhar por eles pararia todo PR e o gate
 * seria desligado na primeira semana —
 * que é como um gate morre. Ele falha por ocorrência NOVA: arquivo fora da lista abaixo, ou
 * arquivo da lista com MAIS ocorrências do que a baseline registra. Reduzir é sempre aceito
 * e a baseline deve ser atualizada no mesmo PR.
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
  "src/components/AbateFinanceiroPanel.tsx": [1, 0],
  "src/components/BoitelPlanningDialog.tsx": [2, 0],
  "src/components/CompraFinanceiroPanel.tsx": [1, 0],
  "src/components/FinanceiroEditDialog.tsx": [1, 0],
  "src/components/LancamentoDetalhe.tsx": [1, 0],
  "src/components/MorteLoteMetaDialog.tsx": [1, 0],
  "src/components/ReclassificacaoForm.tsx": [1, 0],
  "src/components/VendaFinanceiroPanel.tsx": [1, 0],
  "src/components/abate/AbateDetalhesDialog.tsx": [4, 0],
  "src/components/compra/CompraDetalhesDialog.tsx": [1, 0],
  "src/components/edit/EditCompraForm.tsx": [1, 0],
  "src/components/edit/EditConsumoSheet.tsx": [1, 0],
  "src/components/edit/EditTransferenciaSheet.tsx": [1, 0],
  "src/components/financeiro-v2/AuditoriaBancariaSoberana.tsx": [0, 3],
  "src/components/financeiro-v2/ContratoDialog.tsx": [2, 0],
  "src/components/financeiro-v2/ModoRapidoGrid.tsx": [2, 4],
  "src/components/mapa-geo/MovimentarLoteDialog.tsx": [1, 0],
  "src/components/recorrencias/GerarLancamentosDialog.tsx": [1, 0],
  "src/components/venda/VendaDetalhesDialog.tsx": [1, 0],
  "src/pages/AnaliseTrimestralTab.tsx": [0, 3],
  "src/pages/AuditoriaDesfrutes.tsx": [0, 2],
  "src/pages/AuditoriaTab.tsx": [2, 0],
  "src/pages/CadernoImportTab.tsx": [1, 0],
  "src/pages/ChuvasTab.tsx": [1, 0],
  "src/pages/ContaBoitelTab.tsx": [1, 0],
  "src/pages/FinV2SubcentroAliasesTab.tsx": [0, 1],
  "src/pages/FinanceiroV2Tab.tsx": [1, 0],
  "src/pages/FinanciamentoCadastro.tsx": [3, 0],
  "src/pages/LancamentosTab.tsx": [3, 0],   // 5 -> 3 em 114c-4: o campo Data do modal antigo virou DatePicker (os 3 restantes são de venda/parcelas)
  "src/pages/LayoutLab.tsx": [0, 2],
  "src/v2/components/edicao/_blocos/CompraDadosZootecnicos.tsx": [1, 0],
  "src/v2/components/edicao/_blocos/VendaDadosZootecnicos.tsx": [1, 0],
  "src/v2/components/importacao/ImportLancDeParaPanel.tsx": [0, 1],
  "src/v2/components/mesa/MesaPareamentoModal.tsx": [2, 0],
  "src/v2/pages/V2Fazendas.tsx": [0, 1],
  "src/v2/pages/V2MesaOperacional.tsx": [0, 1],
  "src/v3/components/V3TopBar.tsx": [0, 2],
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

const raiz = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';
const atual = new Map();
for (const f of arquivos(raiz)) {
  const { date, select } = contar(readFileSync(f, 'utf8'));
  if (date || select) atual.set(f.replace(/^.*?src\//, 'src/'), { date, select });
}

if (process.argv.includes('--baseline')) {
  const obj = {};
  for (const [f, c] of [...atual].sort()) obj[f] = [c.date, c.select];
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}

const novos = [];
for (const [f, c] of atual) {
  const base = BASELINE.get(f) ?? [0, 0];
  if (c.date > base[0]) novos.push(`${f}: ${c.date} \`type="date"\` (baseline ${base[0]})`);
  if (c.select > base[1]) novos.push(`${f}: ${c.select} \`<select>\` nativo (baseline ${base[1]})`);
}

if (novos.length === 0) {
  console.log(`check-ui-nativo: nenhum controle nativo novo (baseline: ${BASELINE.size} arquivos herdados).`);
  process.exit(0);
}
console.error('check-ui-nativo: controle NATIVO onde o design system tem componente.\n');
for (const n of novos) console.error(`  ${n}`);
console.error('\nUse `DatePicker` (size="compact" quando a linha for densa) e `Select` de @/components/ui.');
console.error('Reduzir a baseline é sempre bem-vindo — atualize-a no mesmo PR.');
process.exit(1);
