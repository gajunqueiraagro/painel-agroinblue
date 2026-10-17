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
/*
 * ⚠ UI-MODAL-BLOCOS-01 (Gabriel 17/10/2026) — A RÉGUA DOS MODAIS DE FORMULÁRIO, COM BASELINE (só pode cair). Em arquivo que tem
 * `DialogContent`, contam: (a) classe com `uppercase` ou `tracking-` (rótulo e título em maiúsculas/espaçados — vetado); (b)
 * `<CampoMoeda` sem `className` (cai no tamanho padrão do input: os campos grandes do cadastro); (c) `<CampoMoeda` cujo rótulo logo
 * antes fala em "%" (percentual no campo de moeda: "R$ 0,00" numa taxa). Também se AUTO-TESTA antes de varrer.
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
/** UI-MODAL-BLOCOS-01 passo 0, medido em 17/10/2026: 425 ocorrências em 62 arquivos. */
const BASELINE_MODAL_JSON = {
  "src/components/BoitelPlanningDialog.tsx": [9, 0, 0],
  "src/components/ConfirmacaoRegistroDialog.tsx": [8, 0, 0],
  "src/components/EvolucaoAssistidaDialog.tsx": [3, 0, 0],
  "src/components/FechamentoPastoDialog.tsx": [2, 0, 0],
  "src/components/FinanceiroEditDialog.tsx": [6, 0, 0],
  "src/components/LancamentoDetalhe.tsx": [18, 0, 0],
  "src/components/MapaRebanhoImportDialog.tsx": [6, 0, 0],
  "src/components/abate/AbateDetalhesDialog.tsx": [2, 0, 0],
  "src/components/abate/ModalNegociarLote.tsx": [6, 0, 0],
  "src/components/agri/AnaliseProducaoModal.tsx": [11, 0, 0],
  "src/components/agri/BarterListaModal.tsx": [2, 0, 0],
  "src/components/agri/BarterVendaModal.tsx": [2, 0, 0],
  "src/components/agri/CargaMandiocaModal.tsx": [12, 0, 0],
  "src/components/agri/CargaModal.tsx": [6, 0, 0],
  "src/components/agri/VendaGraosModal.tsx": [4, 0, 0],
  "src/components/compra/AbaCompromissosOC.tsx": [5, 0, 0],
  "src/components/compra/AbaLiquidacaoOC.tsx": [2, 0, 0],
  "src/components/compra/AbaNegociacaoLotes.tsx": [2, 0, 0],
  "src/components/compra/CompraModalShell.tsx": [5, 0, 0],
  "src/components/compra/DialogoAtualizarCompromisso.tsx": [2, 0, 0],
  "src/components/compra/DialogoExcluirLoteOC.tsx": [2, 0, 0],
  "src/components/conciliacao/ConciliarMesDialog.tsx": [8, 0, 0],
  "src/components/conciliacao/EstacaoConciliar.tsx": [5, 0, 0],
  "src/components/conciliacao/PalcoDoMes.tsx": [3, 0, 0],
  "src/components/conciliacao/TabelaExtratoDoMes.tsx": [2, 0, 0],
  "src/components/financeiro-v2/ConciliarExtratoDialog.tsx": [6, 0, 0],
  "src/components/financeiro-v2/ConferenciaImportacaoDialog.tsx": [2, 0, 0],
  "src/components/financeiro-v2/ContratoDialog.tsx": [12, 0, 0],
  "src/components/financeiro-v2/DecisaoDerivadosDialog.tsx": [2, 0, 0],
  "src/components/financeiro-v2/DesvincularOperacaoDialog.tsx": [2, 0, 0],
  "src/components/financeiro-v2/FornecedorFormDialog.tsx": [2, 0, 0],
  "src/components/financeiro-v2/LancamentoLeituraDialog.tsx": [4, 0, 0],
  "src/components/financeiro-v2/LancamentoV2Dialog.tsx": [6, 0, 0],
  "src/components/financeiro-v2/MesclarFornecedoresDialog.tsx": [8, 0, 0],
  "src/components/financeiro-v2/ReclassificarItemDialog.tsx": [2, 0, 0],
  "src/components/financeiro-v2/VincularOperacaoDialog.tsx": [2, 0, 0],
  "src/components/financeiro/FluxoAuditoriaModal.tsx": [2, 0, 0],
  "src/components/financeiro/ResumoExecMetaModal.tsx": [10, 0, 0],
  "src/components/financiamentos/BuscarNoContrato.tsx": [1, 0, 0],
  "src/components/financiamentos/DarBaixa.tsx": [0, 1, 0],
  "src/components/financiamentos/ObrigacaoDialog.tsx": [4, 0, 0],
  "src/components/lucroRural/TelaAtualizarLr.tsx": [1, 0, 0],
  "src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx": [1, 0, 0],
  "src/components/ui/command.tsx": [1, 0, 0],
  "src/components/venda/AbaContaCorrenteOC.tsx": [1, 0, 0],
  "src/components/venda/BoitelBlocosModais.tsx": [6, 0, 0],
  "src/components/venda/VendaDetalhesDialog.tsx": [1, 0, 0],
  "src/pages/AgriBarterTab.tsx": [2, 0, 0],
  "src/pages/AuditoriaDuplicidadeTab.tsx": [2, 0, 0],
  "src/pages/ConciliacaoBancariaTab.tsx": [11, 0, 0],
  "src/pages/ContaBoitelTab.tsx": [26, 0, 0],
  "src/pages/FechamentoTab.tsx": [10, 0, 0],
  "src/pages/FinV2ContasTab.tsx": [12, 0, 0],
  "src/pages/FinV2SafrasTab.tsx": [12, 0, 0],
  "src/pages/LancamentosTab.tsx": [9, 0, 0],
  "src/pages/PastosTab.tsx": [10, 0, 0],
  "src/pages/PlanejamentoFinanceiroTab.tsx": [6, 0, 0],
  "src/pages/resumo-op/ResOpDashboard.tsx": [36, 0, 0],
  "src/v2/components/mesa/MesaPareamentoModal.tsx": [24, 0, 0],
  "src/v2/pages/V2Fazendas.tsx": [39, 0, 0],
  "src/v2/pages/V2Home.tsx": [4, 0, 0],
  "src/v2/pages/V2PlanejamentoVisaoGeral.parts/LinhaExecutivaExecutivoModal.tsx": [12, 0, 0]
};
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

/** arquivo → [caixa alta/espaçado, CampoMoeda sem classe, percentual em CampoMoeda]. Só diminui. */
const BASELINE_MODAL = new Map(Object.entries(BASELINE_MODAL_JSON));

function reguaDoModal(texto) {
  const s = semComentarios(texto);
  if (!/<DialogContent\b/.test(s)) return null;
  const caixa = (s.match(/\buppercase\b|\btracking-(?:wide|wider|widest|\[)/g) || []).length;
  let semClasse = 0; let percentual = 0;
  for (const m of s.matchAll(/<CampoMoeda\b[^]*?\/>/g)) {
    if (!/\bclassName=/.test(m[0])) semClasse += 1;
    const antes = s.slice(Math.max(0, m.index - 140), m.index);
    if (/(rotulo|label|Label)[^<]*%|%[^<]*<\/Label>/.test(antes)) percentual += 1;
  }
  return [caixa, semClasse, percentual];
}

/* Auto-teste da régua: os três casos conhecidos têm de ser achados, e o campo certo não. */
{
  const ruim = `<DialogContent><div className="text-[9px] uppercase tracking-wide">X</div><Campo rotulo="Taxa (% a.a.)"><CampoMoeda valor={a} onChange={b} /></Campo></DialogContent>`;
  const bom = `<DialogContent><Campo rotulo="Valor"><CampoMoeda className={CAMPO} valor={a} onChange={b} /></Campo></DialogContent>`;
  const r = reguaDoModal(ruim); const b = reguaDoModal(bom);
  if (!r || r[0] !== 2 || r[1] !== 1 || r[2] !== 1 || !b || b.join() !== '0,0,0' || reguaDoModal('<div className="uppercase" />') !== null) {
    console.error('check-ui-nativo: o detector da régua dos modais NÃO achou o caso conhecido (auto-teste). Nada foi varrido.');
    process.exit(2);
  }
}

const raiz = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'src';
const regua = new Map();
const atual = new Map();
const semBusca = [];
for (const f of arquivos(raiz)) {
  const texto = readFileSync(f, 'utf8');
  const { date, select } = contar(texto);
  const rel = f.replace(/^.*?src\//, 'src/');
  if (date || select) atual.set(rel, { date, select });
  if (!CASA.has(rel)) for (const a of seletoresSemBusca(texto)) semBusca.push(`${rel}: ${a}`);
  const rg = reguaDoModal(texto);
  if (rg && rg.some((n) => n > 0)) regua.set(rel, rg);
}

if (process.argv.includes('--baseline')) {
  const obj = {};
  for (const [f, c] of [...atual].sort()) obj[f] = [c.date, c.select];
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}
if (process.argv.includes('--baseline-modal')) {
  const obj = {};
  for (const [f, c] of [...regua].sort()) obj[f] = c;
  console.log(JSON.stringify(obj));
  process.exit(0);
}

const novos = [...semBusca];
const NOMES_REGUA = ['classe em caixa alta/espaçada', '<CampoMoeda> sem className', 'percentual em <CampoMoeda>'];
for (const [f, c] of regua) {
  const base = BASELINE_MODAL.get(f) ?? [0, 0, 0];
  c.forEach((n, i) => { if (n > base[i]) novos.push(`${f}: ${n} ${NOMES_REGUA[i]} no modal (baseline ${base[i]})`); });
}
const totalRegua = [...regua.values()].reduce((s, c) => s + c[0] + c[1] + c[2], 0);
for (const [f, c] of atual) {
  const base = BASELINE.get(f) ?? [0, 0];
  if (c.date > base[0]) novos.push(`${f}: ${c.date} \`type="date"\` (baseline ${base[0]})`);
  if (c.select > base[1]) novos.push(`${f}: ${c.select} \`<select>\` nativo (baseline ${base[1]})`);
}

if (novos.length === 0) {
  console.log(`check-ui-nativo: nenhum controle nativo novo (baseline: ${BASELINE.size} arquivos herdados) e nenhum seletor de entidade sem busca (baseline 0); régua dos modais: ${totalRegua} ocorrências em ${regua.size} arquivos (só pode cair).`);
  process.exit(0);
}
console.error('check-ui-nativo: controle NATIVO onde o design system tem componente.\n');
for (const n of novos) console.error(`  ${n}`);
console.error('\nUse `DatePicker` (size="compact" quando a linha for densa) e `Select` de @/components/ui.');
console.error('Seletor de conta, plano, fazenda ou fornecedor: o da casa COM BUSCA (SearchableSelect, ContaBancariaSelect, FazendaSelect, FavorecidoSelect).');
console.error('Reduzir a baseline é sempre bem-vindo — atualize-a no mesmo PR.');
process.exit(1);
