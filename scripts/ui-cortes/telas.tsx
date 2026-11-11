/**
 * UI-SEM-CORTE-01 — as telas da bancada do `check:ui-cortes`, por `?tela=`: os componentes REAIS, com dados SINTETICOS.
 *   mesclar · fornecedores · fornecedor-cadastro · contrato · lancamento (`&m=novo|editar`)
 * Cada tela registra o banco simulado em `globalThis.__bancoBancada` (mocks/supabase.ts) antes de montar.
 */
import React from 'react';
import { opcoesDoAtalho } from '@/v2/lib/atalhosProducao';

import { ChuvasTab } from '@/pages/ChuvasTab';
import { PainelPeriodoTab } from '@/components/financeiro-v2/PainelPeriodoTab';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { MesclarFornecedoresDialog } from '@/components/financeiro-v2/MesclarFornecedoresDialog';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { FinV2FornecedoresTab } from '@/pages/FinV2FornecedoresTab';
import FinanciamentoDetalhe from '@/pages/FinanciamentoDetalhe';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { proporLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { arquivoXmlDaNota, prefillDaNota } from '@/lib/financeiro/nfePrefill';
import { montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';
import { TRAVAS_DO_MODO_OC } from '@/lib/oc/lancarPeloModal';
import contrato from './dados/contrato.json';
import consorcio from './dados/consorcio.json';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import contratoCadastro from './dados/contrato-cadastro.json';
import { CadastroDeContratoDialog } from '@/components/financiamentos/CadastroDeContratoDialog';
import { ConsorcioDialog } from '@/components/financiamentos/ConsorcioDialog';
import { LANCAMENTOS } from './dados/financeiro';
import { totaisDaListaV2 } from '@/lib/financeiro/totaisDaListaV2';
import { CriarTransferenciaDialog } from '@/components/conciliacao/CriarTransferenciaDialog';
import { CriarTransferenciasLoteDialog } from '@/components/conciliacao/CriarTransferenciasLoteDialog';
import { ForaDaVigenciaDialog } from '@/components/recorrencias/ForaDaVigenciaDialog';
import { lerForaDaVigencia } from '@/hooks/useRecorrencias';
import { ConciliacaoBancariaTab } from '@/pages/ConciliacaoBancariaTab';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';
import { ExtratoDoSistemaDialog } from '@/components/conciliacao/ExtratoDoSistemaDialog';
import * as CONC from './dados/conciliacao';
import { FAZENDAS_VG as FAZENDAS_VG02, bancoVG02 } from './dados/visaoGeral02';
import { V2Home } from '@/v2/pages/V2Home';
import * as ESP from './dados/espelho';
import type { SugestaoDeTransferencia } from '@/lib/conciliacao/transferenciaDoExtrato';
import { volumeNJ } from './dados/volumeNJ';
import { buscarFornecedores } from '@/lib/fornecedores/buscaDeFornecedor';
import { FinanceiroV2Tab } from '@/pages/FinanceiroV2Tab';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ValorInexistente } from '@/components/shared/ValorInexistente';
import { GRUPOS, LEITOR, LINHAS, LISTA, RECENTES, SEM_CADASTRO, USO } from './dados/fornecedores';
import { CasarBlocoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { CasarComBancoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { SugestoesCasarModal } from '@/components/financeiro-v2/SugestoesCasarModal';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';
import { sugerirCasamentos, type CandidatoSugestao, type Sugestao } from '@/lib/conciliacao/sugestoesCasamento';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { DialogoDesfazerCompromisso } from '@/components/compra/DialogoDesfazerCompromisso';
import { DialogoAtualizarCompromisso } from '@/components/compra/DialogoAtualizarCompromisso';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { ModalNegociarLote } from '@/components/abate/ModalNegociarLote';
import { linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';
import { CompraModalShell } from '@/components/compra/CompraModalShell';
import { AvisoPendenciasCliente } from '@/components/consultor/AvisoPendenciasCliente';
import { NovaPendenciaDialog } from '@/components/consultor/NovaPendenciaDialog';
import { ResumoClientesPainel } from '@/components/consultor/ResumoClientesPainel';
import * as OC from './dados/oc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AbaContaCorrenteOC } from '@/components/venda/AbaContaCorrenteOC';
import { lerContaCorrente } from '@/lib/oc/contaCorrente';
import { AcessosTab } from '@/pages/AcessosTab';
import { ContasPagarReceberTab } from '@/components/financeiro-v2/ContasPagarReceberTab';
import V2Recorrencias from '@/v2/pages/V2Recorrencias';
import * as REC from './dados/recorrencias';
import * as MAPA from './dados/mapaPastos';
import MODULO03 from '@/lib/mapa/__fixtures__/modulo03StaTereza.json';
import P6_PUREZA from '@/lib/mapa/__fixtures__/p6Pureza.json';
import PRACA_P06 from '@/lib/mapa/__fixtures__/pracaP06Pureza.json';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import { mapaGlobal } from './dados/mapaGlobal';
import { MapaGeoPastosTab } from '@/pages/MapaGeoPastosTab';
import { rotuloDoTipo } from '@/lib/mapa/tiposDeArea';
import * as CONTAS_BANC from './dados/contas';
import * as VG from './dados/visaoGeral';
import * as DRE from './dados/dre';
import { AgriDreLavouraTab } from '@/pages/AgriDreLavouraTab';
import { BarraSecao } from '@/v2/components/BarraSecao';
import AuthPage from '@/pages/AuthPage';
import DefinirSenhaPage from '@/pages/DefinirSenhaPage';
import { AlterarSenhaDialog } from '@/components/AlterarSenhaDialog';
import { VisaoGeralFinanceiro } from '@/v2/pages/VisaoGeralFinanceiro';
import { FiltrosBarraVG } from '@/components/financeiro-v2/visaoGeral/FiltrosBarraVG';
import { filtrosVG } from '@/lib/financeiro/visaoGeral';
import { FinV2ContasTab } from '@/pages/FinV2ContasTab';
import { V2Sidebar, LARGURA_DA_LATERAL } from '@/v2/components/V2Sidebar';
import { ClienteSelector } from '@/components/ClienteSelector';
import { FazendaSelector } from '@/components/FazendaSelector';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConciliarDiferencaModal } from '@/components/conciliacao/ConciliarDiferencaModal';
import { lerSimulacao } from '@/lib/conciliacao/conciliarDiferenca';
import { PlanejamentoFinanceiroTab } from '@/pages/PlanejamentoFinanceiroTab';
import { PainelConsultorTab } from '@/pages/PainelConsultorTab';
import { V2PlanejamentoVisaoGeral } from '@/v2/pages/V2PlanejamentoVisaoGeral';
import V2FechamentoPeriodo from '@/v2/pages/V2FechamentoPeriodo';
import * as META from './dados/metaP109';
import { FinV2PlanoContasTab } from '@/pages/FinV2PlanoContasTab';
import { EvolucaoDoAnoTab } from '@/pages/EvolucaoDoAnoTab';
import { EvolucaoMesTab } from '@/pages/EvolucaoMesTab';
import { SeletorDePeriodo } from '@/components/ui/seletor-de-periodo';
import { Segmentado } from '@/components/ui/segmentado';
import type { Intervalo } from '@/lib/periodo/intervaloDeDatas';
import { PLANO as PLANO_DE_CONTAS, DIVIDENDOS as DIVIDENDOS_DO_PLANO } from './dados/planoContas';
import * as LOTES_BANCADA from './dados/lotes';

/* Gabriel 29/10 08:26 — os parcelados do LR na nota já lançada (SINTÉTICOS): as 4 do sistema e a prévia da `fn_nota_completar` como o banco a faz */
/* UI-PERIODO-01b — as safras SINTÉTICAS do cadastro (as duas atividades, julho a junho, 26/27 e 25/26) para o componente de período */
const SAFRAS_DA_BANCADA = [['p27', '26/27-Pec', 'pecuaria', '2026'], ['l27', '26/27-Lav', 'agricultura', '2026'], ['p26', '25/26-Pec', 'pecuaria', '2025'], ['l26', '25/26-Lav', 'agricultura', '2025']]
  .map(([id, codigo, escopo, a]) => ({ id, nome: codigo, codigo, escopo_negocio: escopo, data_inicio: `${a}-07-01`, data_fim: `${Number(a) + 1}-06-30`, ativa: true, cliente_id: 'cli' }));
const DESCRICOES_DO_LR: Record<string, string[]> = {
  lr: ['Parcela 1 - None', 'Parcela 2 - None', 'Parcela 3 - Engate rapido sintetico do trator', 'Parcela 4 - None'],
  lr2: ['Reforma sintetica da ponte do retiro', 'Parcela 2 - None', 'Parcela 3 - None', 'Parcela 4 - None'],
};
const VENC_DO_LR = ['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'];
const LR_DA_NOTA = (v: string) => (DESCRICOES_DO_LR[v] ?? []).map((descricao, i) => ({ id: `jl-lr${i}`, vencimento: VENC_DO_LR[i], pagamento: i < 3 ? VENC_DO_LR[i] : null,
  competencia: VENC_DO_LR[i], descricao, valor_cent: 49164, status: i < 3 ? 'realizado' : 'programado', conciliado: i === 0, financiamento_id: null,
  conta_bancaria_id: 'sic', numero_documento: 'NF 937', fornecedor_id: 'agro-s', fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj',
  parcelas: [], por: ['numero'], parcela_n: i + 1 }));
const NOMES_DO_LR: Record<string, string> = { 'agro-s': 'Agro Sintetica Insumos Agropecuarios Ltda', 'f-pur': 'Faz. Sintetica', sic: 'Sicredi Lavoura',
  'pl-vet': 'Sanidade Animal — Vacinas e Medicamentos Veterinários' };
/* Gabriel 29/10 10:38 — `v=gulart`: a nota de UMA parcela já lançada 1 de 1, PROGRAMADA (o molde Gulart & Cia, SINTÉTICO; a nota sem duplicata, R$ 9.583,00) */
const GULART_DA_NOTA = () => [{ id: 'jl-g1', vencimento: '2026-10-10', pagamento: null, competencia: '2026-09-30', descricao: 'Compra cantina sintetica', valor_cent: 958300,
  status: 'programado', conciliado: false, financiamento_id: null, conta_bancaria_id: 'sic', numero_documento: '000.000.937', fornecedor_id: 'agro-s',
  fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj', parcelas: [], por: ['numero'], parcela_n: 1 }];
/* Caso 3 (Gabriel 29/10 11:33) — `v=m2`: a nota À VISTA no CARTÃO em 10 (o molde da M2 Tratores NF 14.222, SINTÉTICO; a nota sem duplicata de
   R$ 9.583,00 = 10 × 958,30): 3 achadas — 2 no cartão, 1 na c/c, safras diferentes; "Parc.7" e "Parcela 8 - None" na descrição */
const M2_DA_NOTA = () => [['2026-08-10', 'Manutencao Maquinas Agricultura sintetica 1/3', 'elo', 'realizado'], ['2026-09-10', 'Manutencao Maquinas - Parc.7 2/3', 'elo', 'realizado'],
  ['2026-10-10', 'Parcela 8 - None 3/3', 'sic', 'programado']].map(([vencimento, descricao, conta, status], i) => ({ id: `jl-m2${i}`, vencimento,
  pagamento: status === 'realizado' ? vencimento : null, competencia: '2026-07-06', descricao, valor_cent: 95830, status, conciliado: false, financiamento_id: null,
  conta_bancaria_id: conta, numero_documento: '000.000.937', fornecedor_id: 'agro-s', fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj',
  parcelas: [], por: ['numero'] }));
/* a prévia da `fn_nota_completar` como o banco a faz, a partir dos achados da variante (as pagas: valor, vencimento e conta com o cadeado) */
/* NOTA-PAGA-A-VISTA-01 (Gabriel 31/10) — `v=avista`: a nota de 4 duplicatas (4 × 491,64) paga À VISTA num lançamento só, com o valor da nota
   inteira (R$ 1.966,56), realizado, descrição comprida (o pior caso). SINTÉTICO. */
const AVISTA_DA_NOTA = () => [{ id: 'jl-av', vencimento: '2026-10-10', pagamento: '2026-10-10', competencia: '2026-10-10',
  descricao: 'Brincos de identificação sintéticos — pago à vista no Itaú Personalite, descrição comprida para o pior caso', valor_cent: 196656,
  status: 'realizado', conciliado: false, financiamento_id: null, conta_bancaria_id: 'sic', numero_documento: '937', fornecedor_id: 'agro-s',
  fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj', parcelas: [], por: ['numero'] }];
/* NOTA-ATUALIZA-PREVISTO-01 — `v=previsto`: o molde do caso da Vera (NF 69.134): a nota SEM duplicata e, no sistema, um PREVISTO de R$ 1.000,00
   achado pelo número (linha "só no sistema"); a cena escolhe "É esta" e 70%. SINTÉTICO. */
const PREVISTO_DA_NOTA = (): any[] => [{ id: 'jl-prev', vencimento: '2026-11-05', pagamento: null, competencia: '2026-10-05',
  descricao: 'Supermercado sintetico da fazenda (70%)', valor_cent: 100000, status: 'previsto', conciliado: false, financiamento_id: null,
  numero_documento: null, fornecedor_id: 'agro-s', fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj', parcelas: [], por: ['numero'] }];
function completarDoLr(v: string, a: any) {
  const doLr: any[] = (v === 'gulart' || v === 'gulartlongo') ? GULART_DA_NOTA() : v === 'm2' ? M2_DA_NOTA() : v === 'avista' ? AVISTA_DA_NOTA() : v === 'previsto' ? PREVISTO_DA_NOTA() : LR_DA_NOTA(v);
  const linhas = (a?.p_lancamentos ?? []).map((x: any) => {
    const i = doLr.findIndex((l) => l.id === x.id); const l = doLr[i]; const paga = l?.status === 'realizado';
    const hoje: Record<string, unknown> = { descricao: l?.descricao ?? null, favorecido_id: 'agro-s', fazenda_id: 'f-pur', conta_bancaria_id: 'sic', plano_conta_id: 'pl-vet',
      numero_documento: l?.numero_documento ?? null, data_competencia: l?.competencia ?? null, safra_id: null, valor: (l?.valor_cent ?? 0) / 100, data_vencimento: l?.vencimento ?? null };
    const campos: Record<string, unknown> = {};
    for (const [c, h] of Object.entries(hoje)) {
      const cad = paga && ['valor', 'data_vencimento', 'conta_bancaria_id'].includes(c) ? 'paga: valor, data e conta não mudam' : null;
      const fica = cad ? h : c in x ? x[c] : h;
      campos[c] = { hoje: h, fica, muda: fica !== h, hoje_nome: NOMES_DO_LR[String(h)] ?? null, fica_nome: NOMES_DO_LR[String(fica)] ?? null, cadeado: cad };
    }
    return { id: x.id, descricao: l?.descricao ?? null, situacao: l?.conciliado ? 'conciliada' : paga ? 'realizada' : 'programada', parcela_n: i + 1, campos };
  });
  const grupos = new Map<string, { mes_de: string; subcentro_de: string; mes_para: string; subcentro_para: string; valor: number; lancamentos: number }>();
  for (const l of linhas) {
    const c: any = l.campos; const de = String(c.data_competencia.hoje).slice(0, 7); const para = String(c.data_competencia.fica).slice(0, 7);
    if (de === para) continue;
    const g0 = grupos.get(de + para) ?? { mes_de: de, subcentro_de: NOMES_DO_LR['pl-vet'], mes_para: para, subcentro_para: NOMES_DO_LR['pl-vet'], valor: 0, lancamentos: 0 };
    g0.valor = Math.round((g0.valor + Number(c.valor.fica)) * 100) / 100; g0.lancamentos += 1; grupos.set(de + para, g0);
  }
  return { ok: true, recusas: [], linhas, efeito_dre: [...grupos.values()] };
}

/* FIN-V2-DESEMPENHO-01b — a `fn_fin_v2_lista_pagina` da bancada: a página pedida do conjunto SINTÉTICO, com o total e os totais
   do conjunto inteiro (a regra do topo, `totaisDaListaV2`). Sem filtro: a bancada mede a tela, não o predicado. */
function paginaDaBancada(base0: any[], a: any) {
  /* TABELA-ALTURA-FIXA-01 — `&linhas=N`: o recorte de um filtro que acha so' N lancamentos (6, 1, 0): o quadro nao encolhe */
  const corte = new URLSearchParams(location.search).get('linhas');
  /* FIN-CLASSIF-DIVIDIDA-01c — `&div=1`: duas linhas DIVIDIDAS — a 1a filtrada por uma das contas (a parte "de R$ total", "1 de 2 contas"),
     a 2a inteira ("dividido"); o maior valor do mock, R$ 9.583,00. SINTETICO. */
  const base = new URLSearchParams(location.search).get('div') !== '1' ? base0 : base0.map((l, k) => (k === 0
    ? { ...l, valor: -9583, sinal: -1, tipo_operacao: '2-Saídas', valor_parte: 1055, partes_total: 2, partes_casadas: 1 }
    : k === 1 ? { ...l, valor_parte: Math.abs(Number(l.valor)), partes_total: 2, partes_casadas: 2 } : l));
  const caixa = base.filter((l) => l.sem_movimentacao_caixa !== true).slice(0, corte === null ? undefined : Number(corte));
  const por = Number(a?.p_por_pagina) || 200, pag = Number(a?.p_pagina) || 0;
  return {
    versao: 'bancada', pagina: pag, por_pagina: por, total_linhas: caixa.length,
    linhas: caixa.slice(pag * por, (pag + 1) * por).map((l) => ({ ...l, conciliado: false })),
    totais: (({ entradas, saidas, transferencias, entradasSemCaixa, saidasSemCaixa }) => ({ entradas, saidas, transferencias,
      entradas_sem_caixa: entradasSemCaixa, saidas_sem_caixa: saidasSemCaixa }))(totaisDaListaV2(base, null)),
    sem_caixa: { linhas: base.length - caixa.length, total: 0 },
    /* FIN-V2-FILTRO-FORNECEDOR-01 — o uso por fornecedor no recorte (sem o filtro de fornecedor) */
    fornecedores: caixa.reduce((m: Record<string, number>, l) => { if (l.favorecido_id) m[l.favorecido_id] = (m[l.favorecido_id] ?? 0) + 1; return m; }, {}),
  };
}

const q = new URLSearchParams(location.search);
const tela = q.get('tela') ?? 'mesclar';
const m = q.get('m') ?? 'novo';
const v = q.get('v') ?? '';
/* UI-TEXTO-LONGO-01 — `&desc=curto|longo`: a MESMA tela com uma descrição curta ou com 300 caracteres (o caso do sêmen bovino). O gate
   compara as alturas das duas (modal, resumo lateral, lista de parcelas). Texto sintético. */
const desc = q.get('desc');
const DESC_CURTA = 'Sal mineral';
const DESC_LONGA = ('Sêmen Bovino - SAV EXEMPLO 1234/ 5678 · touro de teste com nome comprido · ').repeat(5).slice(0, 300);
const g = globalThis as any;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const raiz = createRoot(document.getElementById('root')!);
/* UI-SIDEBAR-ESTREITA-01 — `&lateral=1` poe a barra lateral DE VERDADE (V2Sidebar com os seletores) no lugar do bloco azul. O nome do
   cliente e o da fazenda escolhidos vem de `&cli=` e `&faz=` (`Global` = o global); `&submenu=<grupo>` acende o grupo com a gaveta
   aberta. Sem os parametros, nomes SINTETICOS do pior caso (cliente e fazenda maiores que os reais). */
const LATERAL = q.get('lateral');
const CLI = q.get('cli') ?? 'Cliente Exemplo Nome Longo Agropecuária';
const FAZ = q.get('faz') ?? 'Fazenda Exemplo Nome Longo Retiro';
if (LATERAL) {
  const clientes = [{ id: 'cli', nome: CLI, perfil: 'admin_agroinblue' }, { id: 'cli2', nome: 'Cliente Exemplo Dois', perfil: 'admin_agroinblue' }];
  g.__clienteBancada = { clienteAtual: clientes[0], clientes, isAdmin: true, perfil: 'admin_agroinblue', loading: false,
    setClienteAtual: () => {}, resumoClientes: false, setResumoClientes: () => {} };
  const fazendas = [{ id: 'f1', nome: FAZ === 'Global' ? 'Faz. Exemplo' : FAZ, cliente_id: 'cli' }, { id: 'f2', nome: 'Faz. Exemplo Dois', cliente_id: 'cli' }];
  const atual = FAZ === 'Global' ? { id: '__global__', nome: 'Global', owner_id: '' } : fazendas[0];
  g.__fazendaBancada = { fazendas, fazendaAtual: atual, isGlobal: atual.id === '__global__', fazendaId: atual.id, setFazendaAtual: () => {} };
}
/* CPR-LARGURA-01 — `&semlateral=1`: sem a barra lateral, como o app no Ampliar (o shell a esconde: `intensivo`) */
const Lateral = () => q.get('semlateral') ? null : LATERAL ? (
  <TooltipProvider><V2Sidebar activeSection="financeiro-lanc" onNavigate={() => {}} drawerAtivo={q.get('submenu')} onDrawerToggle={() => {}}
    clienteSelector={<ClienteSelector />} fazendaSelector={q.get('umafaz') ? undefined : <FazendaSelector />} /></TooltipProvider>
) : <div style={{ width: LARGURA_DA_LATERAL, flexShrink: 0, background: '#1e3a5f' }} />;
/* a casca do V2 atras: a barra lateral (a largura do dono, `LARGURA_DA_LATERAL`) e a barra do topo de 96px. FORN-01b — `&barra=32` = a
   barra REAL de hoje (a `BarraSecao`, `h-8`, PR-BARRA-UNICA-01a), para as telas medidas contra o app: Fornecedores e Recorrencias;
   `data-casca` marca o rolador da PAGINA (o `check:ui-desloca` nao o conta como lista) */
const BARRA = Number(q.get('barra') ?? 96);
const Casca = ({ children }: { children?: React.ReactNode }) => (
  <div style={{ display: 'flex', height: '100vh' }}><Lateral />
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><div style={{ height: BARRA, flexShrink: 0, background: BARRA === 32 ? '#1e3a5f' : '#e9edf2' }} />
      <div data-casca="" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div></div></div>);
/* P153 — a resposta da `fn_conciliacao_historico_buscar` na bancada, SINTÉTICA no pior caso: 8 achados (o quadro mostra 6 e rola),
   textos maiores que as colunas, valores no teto, e o fornecedor que o banco não escreve (a faixa amarela). */
const HISTORICO_ACHADOS = {
  total: 8,
  achados: Array.from({ length: 8 }, (_, i) => ({
    /* P153b: todos os status (metade em aberto, sem pagamento; um de outra conta; um conciliado), Comp. · Venc., e a fazenda pelo código */
    lancamento_id: `h${i}`, data_pagamento: i % 2 === 0 ? null : `2031-0${(i % 9) + 1}-1${i % 9}`,
    data_vencimento: `2031-0${(i % 9) + 1}-1${i % 9}`, data_competencia: `2031-0${(i % 9) + 1}-01`,
    status_transacao: i % 2 === 0 ? (['previsto', 'programado', 'agendado', 'previsto'][i / 2]) : 'realizado', conciliado: i === 3,
    fazenda_codigo: 'PUR',
    banco: 'PAGAMENTO DE BOLETO - FORNECEDOR SINTÉTICO COM O NOME BEM COMPRIDO',
    descricao: 'Compra de Insumos para Suplementação do Rebanho de Engorda · Pedido 4521', fornecedor_id: 'f1',
    fornecedor: 'Cooperativa Agropecuária Exemplo dos Produtores Rurais do Vale Ltda', plano_conta_id: 'p1', centro: 'Pecuária Engorda',
    subcentro: 'Nutrição Engorda Suplementação Mineral e Proteinada', fazenda_id: 'fz1', fazenda: 'Fazenda Sintética do Exemplo Comprido',
    conta_bancaria_id: i === 2 || i === 5 ? 'itau' : 'bb', conta: 'Banco Exemplo com o Nome Comprido · Conta Movimento', valor: -99999999.99, onde: ['banco'],
  })),
  resumo: { fornecedor_id: 'f1', fornecedor: 'Cooperativa Agropecuária Exemplo dos Produtores Rurais do Vale Ltda', vezes: 8, desde: '2031-01-10' },
};
const montar = (n: React.ReactNode) => raiz.render(<QueryClientProvider client={qc}><MemoryRouter><Casca>{n}</Casca></MemoryRouter></QueryClientProvider>);
/* P79 — a tela cujo filtro mora na URL (`useFiltroUrl` lê `window.location`) monta no roteador do NAVEGADOR, como no app: no de memória
   dois cliques seguidos não se somariam */
const montarNaUrl = (n: React.ReactNode) => raiz.render(<QueryClientProvider client={qc}><BrowserRouter><Casca>{n}</Casca></BrowserRouter></QueryClientProvider>);

g.__fornecedoresBancada = LEITOR;
const bancoDeFornecedores = {
  from: (t: string, e: any) => {
    if (t === 'financeiro_fornecedores') {
      if (e.in.id) return e.in.id.map((id: string) => LINHAS[id] ?? LISTA.find((x: any) => x.id === id)).filter(Boolean);
      if (e.eq.ativo === false) return LISTA.filter((x: any) => x.ativo === false);
      if (e.eq.ativo === true) return LISTA.filter((x: any) => x.ativo !== false);
      return LISTA;
    }
    if (t === 'fornecedor_mesclagem_log') return RECENTES;
    /* FORN-01b — `&aviso=1`: um inativo (nao mesclado) que ainda tem lancamentos — a faixa nomeia ele (nome SINTETICO) */
    if (t === 'financeiro_lancamentos_v2' && q.get('aviso') && e.eq['financeiro_fornecedores.ativo'] === false)
      return Array.from({ length: 6 }, (_, i) => ({ id: `li${i}`, favorecido_id: 'x3', valor: 6479.33, financeiro_fornecedores: { id: 'x3', nome: String(LISTA.find((x: any) => x.id === 'x3')?.nome), ativo: false, fundido_em_id: null } }));
    if (t === 'financeiro_lancamentos_v2' && 'favorecido_id' in e.is) return [
      { id: 'p1', descricao: 'Pagamento de frete de gado para a Fazenda Exemplo — viagem de retorno' }, { id: 'p2', descricao: 'Pagamento de frete de gado para a Fazenda Exemplo — viagem de retorno' },
      { id: 'p3', descricao: 'Manutenção de cerca' }];
    return [];
  },
  rpc: (fn: string, a: any) => fn === 'fn_fornecedor_repetidos' ? GRUPOS : fn === 'fn_fornecedor_uso' ? USO[a.p_fornecedor] ?? { lancamentos: 0 }
    : fn === 'fn_fornecedor_buscar' ? buscarNaBancada(a) : fn === 'fn_fornecedor_sem_cadastro' ? SEM_CADASTRO
    : fn === 'fn_fornecedor_sem_cadastro_recentes' ? [] : fn === 'fn_fornecedor_lista' ? listaNaBancada(a) : null,
};
/* FORN-LISTA-01 — a RPC da lista, respondida pela bancada (a busca pela PROPRIA funcao da tela; ordem so' pelo nome; a regra do banco e'
   provada pelo teste SQL). Pior caso de proposito: cidade longa, 99.999 lancamentos, data cheia. */
/* FORN-01b — `&n=2356`: a lista do tamanho da real (2.356 ativos), para a paginação "1–50 de 2.356 · Página 1 de 48" */
const N_LISTA = Number(q.get('n') ?? 0);
const LISTA_GRANDE: any[] = N_LISTA > LISTA.length ? [...LISTA, ...Array.from({ length: N_LISTA - LISTA.length }, (_, i) => ({ id: `n${i}`, cliente_id: 'cli',
  nome: `Fornecedor Sintético ${String(i + 1).padStart(4, '0')} Comércio de Produtos Agropecuários`, nome_fantasia: i % 2 ? `Fantasia Sintética ${i + 1}` : null,
  cpf_cnpj: i % 3 ? null : '12.345.678/0001-90', ativo: true, created_at: '2026-01-01T10:00:00Z' }))] : (LISTA as any[]);
function listaNaBancada(a: any) {
  const casam: any[] = a.p_busca ? buscarFornecedores(LISTA_GRANDE, a.p_busca, 'todos') : LISTA_GRANDE;
  const sit = (f: any) => (f.fundido_em_id ? 'mesclado' : f.ativo === false ? 'inativo' : 'ativo');
  const contagens = { ativos: casam.filter((f) => sit(f) === 'ativo').length, inativos: casam.filter((f) => sit(f) === 'inativo').length,
    mesclados: casam.filter((f) => sit(f) === 'mesclado').length, todos: casam.length };
  const s = casam.filter((f) => a.p_situacao === 'todos' || sit(f) === String(a.p_situacao).slice(0, -1))
    .sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
  const l = a.p_ids ? s.filter((f) => a.p_ids.includes(f.id)) : s;
  const de = a.p_offset ?? 0;
  const itens = l.slice(de, de + (a.p_limite ?? l.length)).map((f, i) => ({ ...f, municipio: f.municipio ?? (i % 2 ? 'Presidente Prudente' : null),
    uf: f.uf ?? (i % 2 ? 'SP' : null), lancamentos: i === 0 ? 99999 : (i * 7) % 23, ultimo_uso: i % 3 === 2 ? null : '2026-10-20', situacao: sit(f),
    dono_nome: f.fundido_em_id ? String(LINHAS[f.fundido_em_id]?.nome ?? '') : null }));
  return { total: l.length, contagens, documentos: s.map((f) => [f.id, f.cpf_cnpj ?? null]), itens };
}
/* FORN-BUSCA-UNICA-01 — a RPC da busca única, respondida pela PROPRIA funcao da tela (o espelho e' provado pelo teste SQL) */
function buscarNaBancada(a: any) {
  const achados = buscarFornecedores(LISTA as any[], a.p_busca ?? '', a.p_situacao ?? 'ativos');
  const de = a.p_offset ?? 0;
  const itens = (a.p_limite == null ? achados.slice(de) : achados.slice(de, de + a.p_limite)).map((f: any) => ({ ...f, uso: 0 }));
  return { total: achados.length, itens };
}

if (tela === 'mesclar') {
  g.__bancoBancada = bancoDeFornecedores;
  montar(<MesclarFornecedoresDialog aberto aoFechar={() => {}} clienteId="cli" inicial={q.get('vazio') ? undefined : { manter: 'b', absorver: ['c', 'm'] }} />);
} else if (tela === 'fornecedores') {
  g.__bancoBancada = bancoDeFornecedores;
  /* FORN-01b — com `&barra=32` a tela entra como no app: sem o `p-3` da bancada, na secao de altura do V2 (`SECOES_APP_SHELL`) */
  montar(BARRA === 32 ? <div className="flex h-full min-h-0 w-full min-w-0 flex-col"><FinV2FornecedoresTab /></div> : <div className="p-3"><FinV2FornecedoresTab /></div>);
} else if (tela === 'financeiro') {
  /* FORN-BUSCA-UNICA-01 — a lista do Financeiro V2 (filtros + tabela), com o filtro de fornecedor da busca única */
  /* FIN-MODAL-FAZENDA-TRAVA-01 — `&v=volume`: o volume do NJ, sintético (2.356 ativos + 861 mesclados, ~3.000 lançamentos, 5 fazendas no Global) */
  if (q.get('n')) g.__nLanc = Number(q.get('n'));
  /* P94 — `&fantasma=1`: a sessão chega com a memória DESTE cliente apontando para cadastros que não existem (fornecedor, fazenda, conta)
     e com o instantâneo da OC (Competência + sem caixa): a tela abre com os avisos e os chips na faixa dos totais */
  if (q.get('fantasma')) {
    sessionStorage.setItem('financeirov2_filtros_ativos:cli', JSON.stringify({ fornecedorFiltro: 'forn-de-outro-cliente', fazendaId: 'faz-de-outro-cliente' }));
    sessionStorage.setItem('financeirov2_return_filters:cli', JSON.stringify({ dataPor: 'competencia', mostrarSemCaixa: true, anosSelecionados: ['2026'],
      fornecedorFiltro: 'forn-de-outro-cliente', fazendaId: 'faz-de-outro-cliente', contaOrigem: 'conta-de-outro-cliente' }));
  }
  const VOL = v === 'volume' ? volumeNJ() : null;
  if (VOL) { g.__fornecedoresBancada = VOL.fornecedores; g.__fazendaBancada = { fazendas: VOL.fazendas, fazendaAtual: { id: '__global__', nome: 'Global', owner_id: '' },
    isGlobal: true, fazendaId: '__global__', setFazendaAtual: () => {} }; }
  /* DOC-ANEXO-E-IMPORT-01 F2 — os documentos das linhas (o clipe e o popover): lf0 com 3 (boleto · comprovante · recibo, nomes longos = o pior
     caso do popover), lf1 com 1 (abre direto), lf2 com a mesma NF em PDF + XML (1 linha) + 1 boleto. SINTÉTICOS. */
  const docDoClipe = (id: string, lanc: string, especie: string, nome: string, data: string, extra: Record<string, unknown> = {}) => ({
    documento_id: id, lancamento_id: lanc, cliente_id: 'cli', origem: 'lancamento', operacao_id: null, especie, numero: null, serie: null,
    chave_acesso: null, nome, tipo: 'application/pdf', url: `cli/${lanc}/${id}.pdf`, data_emissao: data, valor_documento: null, emitente_id: null,
    emitente_nome: null, emitente_documento: null, observacao: null, cancelado: false, cancelado_motivo: null, versao: 1, ligado_a_qtd: 1,
    uploaded_em: '2026-10-02T12:00:00Z', ...extra });
  const DOCS_DO_CLIPE = [
    docDoClipe('dc1', 'lf0', 'boleto', 'Boleto da associação de produtores — mensalidade de setembro de 2026.pdf', '2026-09-11'),
    docDoClipe('dc2', 'lf0', 'comprovante', 'Comprovante de pagamento Banco Alfa 18-09-2026.pdf', '2026-09-18'),
    docDoClipe('dc3', 'lf0', 'recibo', 'Recibo do escritório de contabilidade set-2026.pdf', '2026-09-18'),
    docDoClipe('dc4', 'lf1', 'nf', 'NF 000.000.518.pdf', '2026-10-03', { numero: '518' }),
    docDoClipe('dc5', 'lf2', 'nf', 'NF 000.000.519.pdf', '2026-10-05', { numero: '519' }),
    docDoClipe('dc6', 'lf2', 'nf', 'NF 000.000.519.xml', '2026-10-05', { numero: '519', tipo: 'application/xml', url: 'cli/lf2/dc6.xml' }),
    docDoClipe('dc7', 'lf2', 'boleto', 'Boleto parcela 1.pdf', '2026-10-20'),
  ];
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_lancamentos_v2' ? (e.in.id ? [] : VOL ? VOL.lancamentos : LANCAMENTOS)
      : t === 'vw_lancamento_documentos' && !VOL ? DOCS_DO_CLIPE.filter((d) => e.eq.lancamento_id == null || d.lancamento_id === e.eq.lancamento_id)
      : t === 'financeiro_fornecedores' ? (VOL ? VOL.fornecedores : LISTA)
      : t === 'financeiro_safras' ? [{ id: 's-pec', nome: 'Pecuária 25/26', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', ativa: true },
        { id: 's-lav', nome: 'Mandioca 25/26', codigo: '25/26-MAND', escopo_negocio: 'agricultura', ativa: true }]
      : t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f1', ativo: true, ordem_exibicao: 1 }] : [],
    rpc: (fn: string, a: any) => fn === 'get_anos_financeiro_v2' ? [{ ano: '2026' }] : fn === 'fn_parcelas_dos_lancamentos' ? {}
      : fn === 'fn_fin_v2_lista_pagina' ? paginaDaBancada(VOL ? VOL.lancamentos : LANCAMENTOS, a) : null,
  };
  /* TABELA-ALTURA-FIXA-01 — com `&barra=32` a tela entra como no app (medido em 22/10: Lançamentos abre sem a sub-barra "Financeiro"):
     a barra da secao (32) e a secao que rola, sem o `p-3` da bancada */
  montar(BARRA === 32 ? <div className="w-full min-w-0"><FinanceiroV2Tab filtroAnoInicial="2026" /></div>
    : <div className="p-3 h-full"><FinanceiroV2Tab filtroAnoInicial="2026" /></div>);
} else if (tela === 'valor-inexistente') {
  /* P94 — os seletores da barra de Lançamentos com o valor fora das opções, na largura da barra (12 faixas): a frase vermelha cabe
     rolando no lugar, sem "…" e sem crescer o campo */
  const sel = 'h-6 text-[10px] bg-white border-[#C9D4E2]';
  const X = 'ffffffff-0000-0000-0000-000000000001';
  montar(
    <div className="p-3">
      <div className="grid grid-cols-12 gap-1 items-end" data-testid="barra-inexistente">
        <div className="col-span-2 min-w-0"><SearchableSelect value={X} onValueChange={() => {}} options={[{ value: 'f1', label: 'Faz. Exemplo' }]} allValue="__all__" allLabel="Todas" triggerClassName={sel} valorInexistente /></div>
        <div className="col-span-2 min-w-0"><ContaBancariaSelect value={X} onValueChange={() => {}} contas={[{ id: 'bb', nome_conta: 'Banco Alfa', nome_exibicao: null, tipo_conta: 'cc' }]} placeholder="Todas" prependItems={[{ value: '__all__', label: 'Todas' }]} className={sel} valorInexistente /></div>
        <div className="col-span-2 min-w-0"><SearchableSelect value="Subcentro de outro cliente" onValueChange={() => {}} options={[]} placeholder="Todos" valorInexistente /></div>
        <div className="col-span-2 min-w-0"><FavorecidoSelect value={X} onChange={() => {}} fornecedores={[]} situacao="todos" nomeInteiro limpavel rotuloDoVazio="Todos" placeholder="Todos"
          linhaDoDocumento={false} size="compact" triggerClassName="bg-white border-[#C9D4E2] !text-[9px]" valorInexistente /></div>
        <div className="col-span-2 min-w-0"><Select value={X} onValueChange={() => {}}><SelectTrigger className={`${sel} !border-destructive !text-destructive`}><SelectValue><ValorInexistente onLimpar={() => {}} /></SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Todas</SelectItem></SelectContent></Select></div>
      </div>
    </div>);
} else if (tela === 'fornecedor-cadastro') {
  g.__bancoBancada = { from: () => [], rpc: () => null };
  const linha = { ...LINHAS.b, inscricao_municipal: '1234567', cep: '79002-000', complemento: 'Sala 1001 Bloco B', bairro: 'Jardim dos Estados', telefone: '(67) 3333-4444',
    celular: '(67) 99999-8888', contato_nome: 'Maria Exemplo dos Santos', tipo_recebimento: 'Transferência Bancária', banco: '748 · Banco Exemplo', agencia: '0901', conta: '123456-7',
    tipo_conta: 'Corrente', nome_favorecido: 'Luiz Fernando Exemplo da Silva Ltda', cpf_cnpj_pagamento: '54.442.418/0001-88', observacao: 'Fornecedor de insumos; prazo 30 dias' };
  montar(<FornecedorFormDialog open onClose={() => {}} editing={linha as any} allFornecedores={[]} fazendas={[{ id: 'f1', nome: 'Faz. Exemplo' }] as any} clienteId="cli" onSaved={() => {}}
    lerCadastro={async () => []} lerLinha={async () => linha}
    lerUso={async () => ({ cadastradoEm: '2026-01-05T10:00:00Z', lancamentos: 6, comprasParceladas: 1, documentos: 4, ultimoLancamento: '2026-09-30' } as any)} />);
} else if (tela === 'contrato') {
  /* FIN-CONTRATO-TELA-FONTE-01 — `&v=titulo` (título de 120 caracteres), `&v=parcelamento` (compra parcelada com conta longa nas parcelas),
     `&v=consorcio` (o detalhe entrega ao modal do consórcio); sem `v`, o financiamento de sempre. Tudo SINTÉTICO. */
  const base: any = contrato;
  const CONTA_LONGA = 'Banco Exemplo Cooperativo de Crédito Rural · Agência Centro · conta corrente 0012345-6';
  const d: any = v === 'titulo'
    ? { ...base, fin: { ...base.fin, descricao: ('Custeio pecuário de reforma de pastagem e aquisição de máquinas para a fazenda exemplo ').repeat(2).slice(0, 120) } }
    : v === 'parcelamento'
      ? { ...base, fin: { ...base.fin, natureza: 'parcelamento', descricao: 'Compra de sal mineral em 15 parcelas' },
          situacao: { ...base.situacao, natureza: 'parcelamento', parcelas: base.situacao.parcelas.map((x: any) => ({ ...x, conta_nome: CONTA_LONGA,
            competencia: x.data_vencimento, valor_principal: x.valor_total, valor_juros: 0, lancamento_id: x.lancamento_id ?? x.lancamento_juros_id,
            tipo_documento: 'Nota Fiscal', numero_documento: '000012345' })) } }
      : base;
  const c: any = consorcio;
  if (v === 'consorcio') d.fin = { ...base.fin, id: c.tela.contrato.id, natureza: 'consorcio' };
  /* FIN-FINANC-LAYOUT-02 — `&v=curto`: o mesmo crédito com 3 parcelas (a 1ª paga, a 2ª sem lançamento nenhum, a 3ª a vencer), valores de
     milhares: o contrato CURTO do gate, ao lado do de 15 parcelas. SINTÉTICO. */
  if (v === 'curto') {
    const [a, b, cc]: any[] = base.situacao.parcelas.slice(5, 8);
    const sit = [
      { ...a, numero: 1, valor_principal: 40000, valor_juros: 1404.03, valor_total: 41404.03, situacao: 'paga', pago_em: '2026-07-24', valor_pago: 41404.03, prazo: { dias: 2, tipo: 'antes' } },
      { ...b, numero: 2, valor_principal: 40000, valor_juros: 936.02, valor_total: 40936.02, lancamento_id: null, lancamento_juros_id: null, situacao: 'vencida', prazo: { dias: 41, tipo: 'vencida' } },
      { ...cc, numero: 3, valor_principal: 40000, valor_juros: 468.01, valor_total: 40468.01, prazo: { dias: 324, tipo: 'a_vencer' } },
    ];
    d.situacao = { ...base.situacao, parcelas: sit, cartoes: { ...base.situacao.cartoes, parcelas: 3, pagas: 1, pago: 41404.03, a_vencer_qtde: 1, a_vencer: 40468.01,
      vencido_qtde: 1, vencido: 40936.02, soma_principal: 120000, soma_total: 122808.06, juros_previstos: 2808.06, valor_contrato: 120000 } };
    d.parcelas = base.parcelas.slice(5, 8).map((x: any, i: number) => ({ ...x, id: sit[i].id, numero_parcela: i + 1, lancamento_id: sit[i].lancamento_id, lancamento_juros_id: sit[i].lancamento_juros_id }));
    d.fin = { ...base.fin, total_parcelas: 3, valor_total: 120000, descricao: 'Custeio Exemplo curto' };
  }
  /* FIN-PARCELA-VALOR-ZERO-01 — `&zero=1`: a 1ª parcela sem nada a pagar e não paga, vencida no calendário (o banco manda `sem_valor`) */
  if (q.get('zero') === '1') d.situacao = { ...d.situacao, parcelas: d.situacao.parcelas.map((x: any, i: number) => (i === 0
    ? { ...x, valor_principal: 0, valor_juros: 0, valor_total: 0, valor_pago: 0, situacao: 'pendente', sem_valor: true, pago_em: null, prazo: null, lancamento_id: null, lancamento_juros_id: null }
    : x)) };
  /* FIN-FINANC-LAYOUT-02 (a) — `&lib=formas`: as liberações nas três situações da tabela nova — em conta casada com desconto (tarifa/IOF:
     bruto 238.425,00, entrou 236.890,12), em conta a casar, direto ao fornecedor (com o nome) e liquidação do anterior. SINTÉTICO. */
  const LIB_FORMAS = q.get('lib') === 'formas';
  if (LIB_FORMAS) {
    const L = (id: string, data: string, valor: number, forma: string, extra: any = {}) => ({ id, data, valor, forma, lancamento_id: null, fornecedor_id: null,
      contrato_liquidado_id: null, destinacao_id: null, observacao: null, cancelado_em: null, ...extra });
    d.liberacoes = [
      L('lb-1', '2026-07-30', 238425, 'conta', { lancamento_id: 'lc-lib-1' }),
      L('lb-2', '2026-08-31', 42075, 'conta'),
      L('lb-3', '2026-09-01', 280500, 'fornecedor', { fornecedor_id: 'fo-maq', destinacao_id: 'a6489445-256f-4802-8d88-a6f97985539a' }),
      L('lb-4', '2026-09-15', 1150000, 'liquidacao', { contrato_liquidado_id: 'fin-ant' }),
    ];
    const T = (l: any, entrou: number | null, aid: number) => ({ id: l.id, data: l.data, forma: l.forma, valor: l.valor, destinacao_id: l.destinacao_id,
      destino: l.destinacao_id ? 'Armazém Exemplo' : null, lancamento_id: l.lancamento_id, entrou, a_identificar: aid, excedente: 0 });
    d.tela = { ...d.tela, liberacoes: [T(d.liberacoes[0], 236890.12, 1534.88), T(d.liberacoes[1], 0, 42075), T(d.liberacoes[2], null, 0), T(d.liberacoes[3], null, 0)],
      liberacoes_total: { qtde: 4, liberado: 1711000, entrou: 236890.12, a_identificar: 43609.88, excedente: 0 } };
  }
  /* PARC-DOCS-TABELA-01 — `&np=N`: a compra parcelada com N parcelas de R$ 344,00 (o caso real tem 2), todas com lançamento, e
     `&docs=1` uma nota da compra ligada a elas (a lista de documentos da aba ocupa a sua linha). Tudo SINTÉTICO. */
  const NP = Number(q.get('np') ?? 0);
  if (v === 'parcelamento' && NP > 0) {
    const t0: any = d.situacao.parcelas[0], p0: any = base.parcelas[0];
    const venc = (i: number) => { const dt = new Date(Date.UTC(2026, 9 + i, 9)); return dt.toISOString().slice(0, 10); };
    d.parcelas = Array.from({ length: NP }, (_x, i) => ({ ...p0, id: `pp-${i + 1}`, numero_parcela: i + 1, data_vencimento: venc(i), valor_principal: 344, valor_juros: 0,
      valor_total: 344, lancamento_id: `lp-${i + 1}`, lancamento_juros_id: null, status: 'pendente' }));
    d.situacao = { ...d.situacao, parcelas: Array.from({ length: NP }, (_x, i) => ({ ...t0, id: `pp-${i + 1}`, numero: i + 1, data_vencimento: venc(i), competencia: venc(i),
      valor_principal: 344, valor_juros: 0, valor_total: 344, lancamento_id: `lp-${i + 1}`, lancamento_juros_id: null, situacao: 'pendente', prazo: { dias: 17 + 28 * i, tipo: 'a_vencer' },
      conta_nome: CONTA_LONGA, tipo_documento: 'Nota Fiscal', numero_documento: '000012345' })),
      cartoes: { ...d.situacao.cartoes, parcelas: NP, a_vencer_qtde: NP, vencido_qtde: 0, vencido: 0, soma_principal: 344 * NP, soma_total: 344 * NP, a_vencer: 344 * NP, juros_previstos: 0, valor_contrato: 344 * NP } };
    d.fin = { ...d.fin, total_parcelas: NP, valor_total: 344 * NP, descricao: 'Max Prata Exemplo FR 500 ML · compra sintética de medicamento veterinário' };
  }
  const DOCS_DA_COMPRA = q.get('docs') === '1' ? Array.from({ length: Math.max(NP, 1) }, (_x, i) => ({ cliente_id: 'cli', lancamento_id: `lp-${i + 1}`, origem: 'lancamento',
    operacao_id: null, tamanho_bytes: 1, uploaded_em: '2026-10-01T12:00:00Z', uploaded_por: 'u1', observacao: null, cancelado: false, cancelado_em: null, cancelado_motivo: null,
    versao: 1, ligado_a_qtd: Math.max(NP, 1), emitente_id: null, emitente_nome: 'DISTRIBUIDORA SINTÉTICA DE PRODUTOS VETERINÁRIOS DO CENTRO OESTE LTDA', emitente_documento: '11222333000181',
    documento_id: 'd-nf-compra', nome: 'NF 12345.pdf', tipo: 'application/pdf', url: 'c/l/nf.pdf', especie: 'nf', numero: '12345', serie: null, chave_acesso: null,
    data_emissao: '2026-10-01', valor_documento: 344 * Math.max(NP, 1) })) : [];
  /* P102 — o Editar obrigação da compra parcelada (o "Editar" do detalhe): os lançamentos das N parcelas e a prévia do "Voltar para à vista"
     (pronta; `&volta=paga`: a parcela 2 paga, a recusa do banco). SINTÉTICO. */
  const LANC_DA_COMPRA = (d.parcelas ?? []).map((x: any, i: number) => ({ id: x.lancamento_id ?? `lp-${i + 1}`, cliente_id: 'cli', fazenda_id: d.fin.fazenda_id ?? null,
    valor: x.valor_total, data_vencimento: x.data_vencimento, data_competencia: x.data_vencimento, data_pagamento: null, status_transacao: 'programado',
    forma_pagamento: 'Boleto', conta_bancaria_id: null, financiamento_id: d.fin.id, numero_parcela: x.numero_parcela, safra_id: null, cultura: null, fase: null,
    plano_conta_id: null, descricao: `${d.fin.descricao} ${i + 1}/${(d.parcelas ?? []).length}`, cancelado: false }));
  /* a fazenda e a conta do contrato da bancada existem nas listas (sem elas o Editar obrigação mostrava o id cru, o que o app real não faz) */
  if (NP > 0) g.__fazendaBancada = { fazendas: [{ id: d.fin.fazenda_id, nome: 'Faz. Exemplo', cliente_id: 'cli' }], fazendaAtual: null, isGlobal: true, fazendaId: '__global__',
    setFazendaAtual: () => {} };
  const CONTAS_DO_CONTRATO = [{ id: d.fin.conta_bancaria_id, nome_conta: 'Banco Exemplo Cooperativo', nome_exibicao: 'Banco Exemplo Cooperativo', banco: 'Exemplo',
    tipo_conta: 'cc', fazenda_id: d.fin.fazenda_id, codigo_conta: null, agencia: '0001', numero_conta: '12345', conta_digito: '6', ativa: true, aliases: null }];
  const ANTES_DA_VOLTA = LANC_DA_COMPRA.map((l: any, i: number) => ({ numero: i + 1, lancamento_id: l.id, vencimento: l.data_vencimento, valor: l.valor }));
  const VOLTA = q.get('volta') === 'paga'
    ? { ok: false, simulado: true, financiamento_id: d.fin.id, antes: ANTES_DA_VOLTA, recusa: { motivo: 'ha_paga', parcela: 2, frase: `A parcela 2/${ANTES_DA_VOLTA.length} já foi paga em 09/11/2026: desfaça o pagamento antes.` } }
    : { ok: true, simulado: true, financiamento_id: d.fin.id, lancamento_id: LANC_DA_COMPRA[0]?.id ?? 'lp-1', valor: ANTES_DA_VOLTA.reduce((s: number, x: any) => s + Number(x.valor), 0),
        vencimento: ANTES_DA_VOLTA[0]?.vencimento ?? null, competencia: ANTES_DA_VOLTA[0]?.vencimento ?? null, descricao: d.fin.descricao, canceladas: Math.max(ANTES_DA_VOLTA.length - 1, 0),
        original_guardado: false, antes: ANTES_DA_VOLTA };
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financiamentos' ? (LIB_FORMAS && e?.in?.id ? [{ id: 'fin-ant', numero_contrato: '40/00123-4' }] : [d.fin]) : t === 'financiamento_parcelas' ? d.parcelas : t === 'financiamento_liberacoes' ? d.liberacoes ?? []
      : t === 'financeiro_lancamentos_v2' ? (LIB_FORMAS ? [{ id: 'lc-lib-1', descricao: 'Liberação financiamento Moderfrota exemplo', data_pagamento: '2026-07-30', data_vencimento: '2026-07-30', conta_destino_id: null, conta_bancaria_id: d.fin.conta_bancaria_id }] : LANC_DA_COMPRA)
      : t === 'financeiro_contas_bancarias' ? CONTAS_DO_CONTRATO
      : t === 'financeiro_fornecedores' && LIB_FORMAS ? [{ id: 'fo-maq', nome: 'Máquinas Agrícolas Exemplo Ltda' }]
      : t === 'financiamento_destinacoes' ? d.destinacoes ?? [] : t === 'financiamento_documentos' ? d.documentos ?? []
      : t === 'vw_lancamento_documentos' ? DOCS_DA_COMPRA.filter((x) => (e?.eq?.especie == null || x.especie === e.eq.especie) && (e?.eq?.lancamento_id == null || x.lancamento_id === e.eq.lancamento_id)) : [],
    rpc: (fn: string) => fn === 'fn_financiamento_situacao' ? d.situacao : fn === 'fn_contrato_tela' ? d.tela ?? null : fn === 'fn_financiamento_captacoes_livres' ? []
      : fn === 'fn_consorcio_tela' ? c.tela : fn === 'fn_consorcio_cronograma' ? c.cronograma
      : fn === 'fn_parcelamento_voltar_a_vista' ? VOLTA : null,
  };
  montar(<FinanciamentoDetalhe id={d.fin.id} />);
} else if (tela === 'casar-bloco') {
  /* CONC-BLOCO-SINAL-MISTO-01 — o bloco da Conferência com saída E entrada (PIX −2.893,37 + reembolso +89,71 contra −2.309,64 e −494,02;
     SINTÉTICO). `&v=recusa`: o banco recusa (Mais antigo primeiro com sinal misto) e a tela mostra a frase e as somas da seleção. */
  const HIST = 'PIX ENVIADO · DESTINO ADMINISTRADORA DE CONSORCIOS EXEMPLO SINTETICA LTDA · CONTA 0000-0 · AUTENTICACAO 0000000000000000000';
  const EXT = [{ extrato_id: 'x1', data: '2031-06-19', historico: HIST, valor: -2893.37 }, { extrato_id: 'x2', data: '2031-06-23', historico: 'PIX RECEBIDO · REEMBOLSO SINTETICO', valor: 89.71 }];
  const LAN = [{ lancamento_id: 'y1', data: '2031-06-17', descricao: 'Consórcio Exemplo · Parc 1/80 · fundo comum e reserva', fornecedor: 'Administradora Exemplo Sintética', valor_assinado: -2309.64 },
    { lancamento_id: 'y2', data: '2031-06-17', descricao: 'Taxa adm. e seguro · Parc 1/80', fornecedor: 'Administradora Exemplo Sintética', valor_assinado: -494.02 }];
  const OK = { ok: true, simulado: true, regra: 'exato', matriz: [
    { extrato_id: 'x1', lancamento_id: 'y1', valor_aplicado: 2309.64 }, { extrato_id: 'x1', lancamento_id: 'y2', valor_aplicado: 583.73 },
    { extrato_id: 'x2', lancamento_id: 'y1', valor_aplicado: -89.71 }],
    resumo: { soma_extratos: 2803.66, soma_lancamentos: 2803.66, diferenca: 0, soma_extratos_com_sinal: -2803.66, soma_lancamentos_com_sinal: -2803.66,
      diferenca_com_sinal: 0, sinal_misto: true, quitados: [{ lancamento_id: 'y1' }, { lancamento_id: 'y2' }], parcial: null } };
  const recusa = v === 'recusa';
  /* FIN-POS-FIXADO-01b — `&v=pos`: o bloco com a parcela de contrato pós-fixado recusa com a frase do banco. */
  const pos = v === 'pos';
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn !== 'fn_conciliar_bloco' ? null
    : recusa ? { __erro: 'direcao_mista: Mais antigo primeiro aceita só saídas ou só entradas; para saída + reembolso use Soma exata.' }
    : pos ? { __erro: 'parcela_pos: Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.' } : OK };
  montar(<CasarBlocoModal open onClose={() => {}} extratos={EXT} lancamentos={LAN} nomeConta="Banco Exemplo" regraInicial={recusa ? 'mais_antigo_primeiro' : 'exato'} onConciliado={() => {}} />);
} else if (tela === 'campos-moeda') {
  /* UI-CAMPO-MOEDA-01 — os campos de valor de LARGURA FIXA dos modais que a bancada não monta, com as MESMAS classes e o MESMO
     invólucro de cada um (a regra `valor` do gate põe 999.999.999,99 em cada um e mede) */
  const nada = () => undefined;
  montar(
    <div className="space-y-3 p-4 text-[11px]">
      <div data-campo="boitel">Boitel (BoitelBlocosModais)<div className="mt-1 flex items-center gap-1">
        <CampoMoeda valor={null} onChange={nada} className="h-8 w-[130px] px-2 text-[12px] tabular-nums text-right bg-card" /></div></div>
      <div data-campo="lance">Lance (CadastroDeContratoDialog)<div className="w-[124px]"><CampoMoeda className={REGUA_CAMPO} valor={null} onChange={nada} /></div></div>
      <div data-campo="livre">Parcelas livres (CadastroDeContratoDialog)<div className="grid grid-cols-[30px_130px_140px_140px_20px] items-center gap-2 text-[10px]">
        <span>1</span><span>—</span><CampoMoeda className={REGUA_CAMPO} valor={null} onChange={nada} /><CampoMoeda className={REGUA_CAMPO} valor={null} onChange={nada} /><span /></div></div>
      <div data-campo="edicao">Editar parcelas (EdicaoDoContrato)<table className="table-fixed border-collapse"><colgroup><col style={{ width: 70 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /></colgroup>
        <tbody><tr><td>1</td><td>—</td><td className="px-1"><CampoMoeda className={REGUA_CAMPO} valor={null} onChange={nada} /></td><td className="px-1"><CampoMoeda className={REGUA_CAMPO} valor={null} onChange={nada} /></td></tr></tbody></table></div>
    </div>,
  );
} else if (tela === 'negociar-lote') {
  /* FIN-VALOR-CALC-01b — o Negociar lote do caso do Gabriel (23/10 09h32), com dado SINTÉTICO: Bois, 136 cab, Realizado, carcaça
     40.676 kg no lote → 2.711,7333 @ × R$ 360,00 = preço base R$ 976.224,00. `&aba=bonus` abre direto na aba dos bônus. */
  const lote: LoteAbate = { id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 136, pesoMedioKg: 540 };
  /* P92 — `&v=99mi | teto | acima`: o resumo com números grandes (dado SINTÉTICO). Carcaça de 15 kg no lote = 1 @, então o "por @" é o
     próprio total (as duas colunas de número no mesmo tamanho). `teto`: cada linha em R$ 999.999.999,99 (o teto do campo); `acima`: três
     bônus no teto e dois descontos no teto (R$ 2.999.999.999,97 e − R$ 1.999.999.999,98: dez dígitos, a fonte desce até caber). */
  const v = q.get('v');
  const grande = (n: number, acima: boolean): LinhaAbate => ({ ...linhaVazia('l1'), pesoCarcacaKg: 15, pesoCarcacaFonte: 'total',
    precoFonte: 'total', valorBaseOverride: n,
    bonusPrecoce: { valor: n, fonte: 'reais' }, bonusQualidade: { valor: acima ? n : null, fonte: acima ? 'reais' : null },
    bonusListaTrace: { valor: acima ? n : null, fonte: acima ? 'reais' : null },
    descontoQualidade: { valor: n, fonte: 'reais' }, outrosDescontos: { valor: acima ? n : null, fonte: acima ? 'reais' : null },
    funrural: { valor: n, fonte: 'reais' } });
  const linha: LinhaAbate = v === '99mi' ? grande(99999999.99, false) : v === 'teto' ? grande(999999999.99, false)
    : v === 'acima' ? grande(999999999.99, true)
    : { ...linhaVazia('l1'), pesoCarcacaKg: 40676, pesoCarcacaFonte: 'total', precoArroba: 360, precoFonte: 'arroba' };
  montar(<ModalNegociarLote lote={lote} linha={linha} cenario="realizado" onAplicar={() => {}} onFechar={() => {}} />);
} else if (tela === 'consorcio') {
  /* FIN-CONSORCIO-02 — o cadastro do consórcio: a tela e o gerador vêm do banco simulado (dado SINTÉTICO, `dados/consorcio.json`, lido do
     banco num bloco revertido); `&novo=1` abre o cadastro novo (sem tela do banco: só o gerador) */
  const d: any = consorcio;
  /* FIN-CONSORCIO-03 — `&fc=pct`: o fundo comum do termo (1,1625% por parcela) e o gerador com o restante nas adiadas */
  const pct = q.get('fc') === 'pct';
  /* FIN-CONSORCIO-04 — `&modo=faixas`: o consórcio gravado pelas faixas do termo (o 002122, as respostas do banco no modo faixas);
     `&n=200`: 200 parcelas em 6 faixas; o gerador simulado responde pelo modo que a tela manda (faixas | regras) */
  const fx = q.get('modo') === 'faixas', n200 = q.get('n') === '200';
  const regrasDaTela = n200 ? d.regras_200 : fx ? d.regras_faixas : pct ? { ...d.tela.contrato.regras, fundo_comum: { modo: 'pct_parcela', valor: 1.1625 } } : d.tela.contrato.regras;
  const telaC = { ...d.tela, contrato: { ...d.tela.contrato, carta: regrasDaTela.carta ?? d.tela.contrato.carta, regras: regrasDaTela } };
  const cronRegras = pct ? d.cronograma_fundo_pct : d.cronograma;
  const cronFaixas = n200 ? d.cronograma_200 : d.cronograma_faixas;
  const modoPedido = (p: unknown) => (typeof p === 'object' && p !== null && 'modo' in p ? p.modo : null);
  g.__bancoBancada = { from: () => [], rpc: (fn: string, a: Record<string, unknown>) => fn === 'fn_consorcio_tela' ? telaC
    : fn === 'fn_consorcio_cronograma' ? (modoPedido(a.p) === 'faixas' ? cronFaixas : n200 ? d.cronograma_200 : cronRegras) : null };
  montar(<ConsorcioDialog aberto aoFechar={() => {}} financiamentoId={q.get('novo') ? null : d.tela.contrato.id} />);
} else if (tela === 'cadastro-contrato') {
  /* FIN-CONTRATO-SALVAR-01 — o cadastro de contrato de crédito: `&m=novo` (vazio) ou `&m=editar` (um contrato antigo SINTÉTICO, como os da
     Santa Rita: sem periodicidade, sem sistema, sem plano dos juros) */
  const d: any = contratoCadastro;
  /* FIN-CONTRATO-CRONOGRAMA-01 — a aba Condições com o cronograma do banco, todos SINTÉTICOS: `&v=sr` (Personalizado, 5 anuais, 2 pagas;
     o principal não fecha por R$ 0,02), `&v=rrcc` (SAC anual pós, a 1ª paga, as 5 ajustadas), `&v=regerar` (o rrcc com a prévia do
     regerar), `&v=120` (120 mensais), `&v=desc` (descrição de 120 caracteres), `&v=sac60` (novo: o banco gera SAC 60 mensais) */
  const somaMeses = (iso: string, k: number) => { const dt = new Date(`${iso}T12:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + k); return dt.toISOString().slice(0, 10); };
  const linhasSint = (n: number, d1: string, passo: number, principal: number, jurosDe: (i: number) => number, pagas: number, ajustadas: boolean) =>
    Array.from({ length: n }, (_x, i) => ({ id: `p-sint-${i + 1}`, numero: i + 1, venc: somaMeses(d1, i * passo), principal, juros: jurosDe(i), paga: i < pagas, ajustada: ajustadas }));
  const cenario = v === 'sr' ? { contrato: { valor_total: 534107.87, sistema_amortizacao: 'livre', periodicidade: null, tipo_taxa: null, data_primeira_parcela: '2025-05-15', total_parcelas: 5 },
      linhas: linhasSint(5, '2025-05-15', 12, 106821.57, (i) => [53983.43, 33767.64, 31726.01, 21150.67, 10575.34][i], 2, false) }
    : v === 'rrcc' || v === 'regerar' || v === 'desc' ? { contrato: { valor_total: 600022.5, sistema_amortizacao: 'sac', periodicidade: 'anual', tipo_taxa: 'pos', data_primeira_parcela: '2026-08-15', total_parcelas: 5,
        ...(v === 'desc' ? { descricao: ('Custeio pecuário de reforma de pastagem e aquisição de máquinas para a fazenda exemplo ').repeat(2).slice(0, 120) } : {}) },
      linhas: linhasSint(5, '2026-08-15', 12, 120004.5, (i) => [116304.73, 35665.34, 26749, 17832.67, 8916.33][i], 1, true) }
    : v === '120' ? { contrato: { valor_total: 999999999.99, sistema_amortizacao: 'price', periodicidade: 'mensal', tipo_taxa: 'pre', data_primeira_parcela: '2026-01-10', total_parcelas: 120 },
      linhas: linhasSint(120, '2026-01-10', 1, 8333333.33, (i) => 99999999.99 - i * 100000, 10, false) }
    : null;
  const contratoDoCenario = cenario ? { ...d.contrato, ...cenario.contrato } : d.contrato;
  const situacaoDoCenario = cenario ? {
    parcelas: cenario.linhas.map((l) => ({ id: l.id, numero: l.numero, data_vencimento: l.venc, valor_principal: l.principal, valor_juros: l.juros, valor_total: l.principal + l.juros,
      situacao: l.paga ? 'paga' : 'pendente', pago_em: l.paga ? l.venc : null, valor_pago: l.paga ? l.principal + l.juros : 0, lancamento_id: `l-${l.id}`, lancamento_juros_id: `j-${l.id}`,
      fonte: 'lancamento', diverge: false })),
    cartoes: { valor_contrato: contratoDoCenario.valor_total, pago: 0, a_vencer: 0, vencido: 0, pagas: cenario.linhas.filter((l) => l.paga).length, parcelas: cenario.linhas.length,
      juros_previstos: 0, soma_principal: 0, soma_total: 0, divergentes: 0 },
  } : null;
  const fotoSint = (ls: NonNullable<typeof cenario>['linhas'], mais: number) => ls.map((l) => ({ id: l.id, numero_parcela: l.numero, data_vencimento: l.venc, valor_principal: l.principal,
    valor_juros: l.paga ? l.juros : Math.round((l.juros + mais) * 100) / 100, valor_total: l.principal + l.juros, status: l.paga ? 'pago' : 'pendente', ajustada: l.ajustada && mais === 0 }));
  const cronSac60 = { recusa: null, parcelas: 60, parcelas_so_juros: 0, principal_total: 300000, juros_total: 95312.5, total: 395312.5, vencimento_final: '2031-06-10',
    linhas: Array.from({ length: 60 }, (_x, i) => ({ numero: i + 1, vencimento: somaMeses('2026-07-10', i), principal: 5000, juros: Math.round((300000 - i * 5000) * 0.0098 * 100) / 100,
      total: 5000 + Math.round((300000 - i * 5000) * 0.0098 * 100) / 100, saldo_apos: 300000 - (i + 1) * 5000 })) };
  g.__bancoBancada = {
    from: (t: string) => t === 'financiamentos' ? [contratoDoCenario]
      : t === 'financiamento_parcelas' ? (cenario ? cenario.linhas.map((l) => ({ id: l.id, numero_parcela: l.numero, data_vencimento: l.venc, status: l.paga ? 'pago' : 'pendente', ajustada: l.ajustada }))
        : d.vencimentos.map((v: string, i: number) => ({ data_vencimento: v, status: 'pendente', numero_parcela: i + 1 })))
      : t === 'financeiro_plano_contas' ? d.planos : [],
    rpc: (fn: string) => fn === 'fn_financiamento_cronograma' ? (v === 'sac60' ? cronSac60 : d.cronograma)
      : fn === 'fn_financiamento_situacao' ? situacaoDoCenario
      : fn === 'fn_financiamento_parcelas_regerar' && cenario ? { simulado: true, recusa: null, antes: fotoSint(cenario.linhas, 0), depois: fotoSint(cenario.linhas, 1234.56),
          base: { saldo: 480018, guardado: 0, principal: 480018, parcelas: 4, sistema: 'sac', taxa_aa: 12.5, periodicidade: 'anual' }, diferenca_do_saldo: 0 }
      : null,
  };
  montar(<CadastroDeContratoDialog aberto aoFechar={() => {}} financiamentoId={m === 'editar' ? contratoDoCenario.id : null} prefill={m === 'editar' ? undefined : { natureza: 'financiamento' }} />);
} else if (tela === 'cpr') {
  /* FIN-POS-FIXADO-01a — Contas a Pagar e Receber com os dois estimados: uma ocorrência de recorrência a confirmar, os juros
     futuros de um contrato pós-fixado, e uma linha com as duas origens. SINTÉTICO; datas em torno de hoje. */
  const hj = new Date(); const dia = (d: number) => { const x = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  /* P106 — a tela abre SEMPRE em "Mês atual" (nada se restaura): `&v=futuro` e `&v=encerrado` são abertos pelo gate clicando "Mês
     futuro" / "Mês anterior". Os dias daqui se medem a partir de hoje; `ate1o(k)` = dias de hoje até o dia 1º do mês hoje+k */
  const ate1o = (k: number) => Math.round((new Date(hj.getFullYear(), hj.getMonth() + k, 1).getTime() - new Date(hj.getFullYear(), hj.getMonth(), hj.getDate()).getTime()) / 86_400_000);
  /* no `futuro` as contas do período andam junto com o 1º do mês seguinte (como no período de antes, de hoje+10: as de +2 a +9 caem
     ANTES dele, a de +12 dentro); o vencido não anda */
  const desl = v === 'futuro' ? ate1o(1) - 10 : 0;
  const lin = (id: string, d: number, valor: number, descricao: string, o: Record<string, unknown> = {}) => ({
    id, cliente_id: 'cli', fazenda_id: 'f1', data_vencimento: dia(d < 0 ? d : d + desl), data_competencia: dia(d < 0 ? d : d + desl), data_pagamento: null, status_transacao: 'programado',
    tipo_operacao: '2-Saídas', valor, sinal: -1, conta_bancaria_id: 'bb', conta_destino_id: null, descricao, favorecido_nome: 'Banco Cooperativo Exemplo de Crédito',
    subcentro: 'Juros de Financiamento Pecuária', macro_custo: 'Despesas Financeiras', cancelado: false, sem_movimentacao_caixa: false, ...o });
  const LINHAS_CPR = [
    lin('rec-1', 2, 435.75, 'Internet Fazenda Exemplo', { subcentro: 'Comunicação e Energia Pecuária' }),
    lin('juros-2', 5, 35665.34, 'Juros 2/5 · 8.233.040 · Giro Rural', { financiamento_id: 'fin-1' }),
    lin('amort-2', 5, 120004.5, 'Amortização 2/5 · 8.233.040 · Giro Rural', { subcentro: 'Amortização de Financiamento', financiamento_id: 'fin-1' }),
    lin('ambas', 9, 999999999.99, 'Lançamento com as duas origens de estimativa', { subcentro: 'Juros de Financiamento Pecuária' }),
    lin('avulsa', 12, 1500, 'Sal mineral', { subcentro: 'Nutrição Engorda', tipo_documento: 'nf', numero_documento: '999999999' }),
    /* P152 — uma PAGA antes do vencimento (fica no dia do pagamento, linha mais clara, Pgto. em azul) e uma parcela de parcelamento
       (selo P, "i/N" do contrato) com NF anexada (o "NF" que abre a aba Documentos) */
    lin('paga-1', 3, 2533.79, 'Manutenção do trator da sede com troca de embreagem', { status_transacao: 'realizado', data_pagamento: dia(0),
      financiamento_id: 'parc-1', subcentro: 'Manutenção Máquinas Pecuária' }),
    lin('parc-1', 7, 990, 'Parcela de óleo lubrificante', { financiamento_id: 'parc-2', subcentro: 'Manutenção Máquinas Pecuária' }),
    /* CPR-AJUSTES-20-10 — um VENCIDO (entra hoje, com o selo e o aviso) e uma ENTRADA no mesmo dia de uma saída (a ordem do dia) */
    lin('vencido-1', -4, 290000, 'Transferência para aplicação em CDB com o nome longo do banco', { subcentro: 'Transferência entre contas' }),
    lin('entrada-1', 12, 21000, 'Venda de bezerros desmamados', { tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'bb', subcentro: 'Venda de Desmama Machos' }),
    /* CPR-AJUSTES-20-10c — `&v=encerrado`: dois vencidos em aberto DENTRO de um período já encerrado (o grupo "Saem hoje", depois do
       Fim do período) — um a pagar com o nome longo e um a receber */
    ...(v === 'encerrado' ? [
      lin('venc-enc-1', Math.min(-1, ate1o(-1) + 9), 112.82, 'Segurança do Trabalho com o laudo técnico anual das instalações da sede', { status_transacao: 'previsto' }),
      lin('venc-enc-2', Math.min(-1, ate1o(-1) + 14), 500, 'Venda de couro do abate', { tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'bb', subcentro: 'Outras Receitas' }),
    ] : []),
  ];
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'vw_financeiro_lancamentos_v2_doc' ? LINHAS_CPR
      : t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f1', ativo: true, ordem_exibicao: 1, tipo_conta: 'conta_corrente' }]
      : t === 'financeiro_recorrencias' ? [{ id: 'reg-1' }]
      /* UI-PERIODO-01b — as safras do cadastro (Pecuária e Lavoura, jul–jun): o "Esta safra · Última safra" do Escolher datas */
      : t === 'financeiro_safras' ? SAFRAS_DA_BANCADA
      /* P152 — o `recorrencia_id` dos ids visíveis (o selo R) */
      : t === 'financeiro_lancamentos_v2' && e.in.id ? [{ id: 'rec-1', recorrencia_id: 'reg-1' }, { id: 'ambas', recorrencia_id: 'reg-1' }]
      : t === 'vw_lancamento_documentos' ? [{ lancamento_id: 'parc-1', especie: 'nf', numero: '177472', cancelado: false, chave_acesso: null }]
      : t === 'financeiro_lancamentos_v2' && e.in.recorrencia_id ? [{ id: 'rec-1', recorrencia_id: 'reg-1', valor: 435.75, data_vencimento: dia(2), status_transacao: 'programado', valor_do_mes_em: null },
          { id: 'ambas', recorrencia_id: 'reg-1', valor: 1, data_vencimento: dia(9), status_transacao: 'programado', valor_do_mes_em: null }]
      : [],
    rpc: (fn: string) => fn === 'fn_juros_estimados_do_cliente' ? [{ lancamento_id: 'juros-2' }, { lancamento_id: 'ambas' }]
      : fn === 'fn_parcelas_dos_lancamentos' ? { 'parc-1': [3, 10] } : null,
  };
  /* CPR-AJUSTES-20-10b — `&v=futuro`: um período que começa depois de hoje (o bloco "Vencidos em aberto · entram no saldo" antes
     do Caixa inicial, e nenhum dia de hoje). P106: o gate clica "Mês futuro" / "Mês anterior" (o retorno de sessão não restaura mais
     o período) */
  montar(<div className="h-full"><ContasPagarReceberTab onIntensiveToggle={() => {}} /></div>);
} else if (tela === 'contas') {
  /* CAD-CONTAS-BANCARIAS-01 — Financeiro › Contas bancárias: a lista (`&n=longo` = o pior caso), o modal da conta (`&v=editar&aba=dados|gerente|
     saldo|importacao`, aberto pela 1ª linha) e a nova conta (`&v=nova`). SINTÉTICO (`dados/contas.ts`). */
  const listaBase = q.get('n') === 'longo' ? CONTAS_BANC.CONTAS_LONGAS : CONTAS_BANC.CONTAS;
  /* CARTAO-LANCAMENTO-01 — `&cartao=1`: o cartão SINTÉTICO (k9) com os dias digitados (fecha 3, vence 10) — o modal abre nele */
  const lista = q.get('cartao') === '1' ? listaBase.map((c: any) => (c.id === 'k9' ? { ...c, dia_fechamento: 3, dia_vencimento: 10 } : c)) : listaBase;
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_contas_bancarias' ? (e.in.id ? lista.filter((c: any) => e.in.id.includes(c.id)) : lista)
      : t === 'bancos_referencia' ? CONTAS_BANC.BANCOS
      : t === 'financeiro_saldos_bancarios_v2' ? [{ saldo_final: 30943.91, saldo_data: '2026-08-31' }] : [],
    rpc: (fn: string, a: any) => fn === 'fn_conta_bancaria_painel' ? CONTAS_BANC.PAINEL
      : fn === 'fn_nomes_dos_autores' ? [{ user_id: 'u1', nome: 'Usuário Exemplo', email: null, situacao: 'membro ativo' }]
      : fn === 'fn_conciliacao_status_ano' ? CONTAS_BANC.reguaDoAno(Number(a.p_ano))
      : fn === 'fn_cartao_dias_de_vencimento' ? [{ dia: 10, lancamentos: 12, ultimo: '2026-10-10' }] : null,
  };
  montar(<div className="h-full"><FinV2ContasTab /></div>);
  const abre = q.get('v');
  if (abre) setTimeout(() => {
    /* CARTAO-LANCAMENTO-01 — `&cartao=1` abre a linha do cartão (a tela ordena a lista: a 1ª linha não é a 1ª do banco) */
    const doCartao = q.get('cartao') === '1' ? [...document.querySelectorAll('[data-testid="linha-conta"]')].find((tr) => (tr.textContent ?? '').includes('Cartão Corporativo Exemplo')) : null;
    const alvo = abre === 'nova' ? document.querySelector('[data-testid="nova-conta"]') : doCartao ?? document.querySelector('[data-testid="linha-conta"]');
    (alvo as HTMLElement | null)?.click();
    const aba = q.get('aba');
    if (aba) setTimeout(() => (document.querySelector(`[data-testid="aba-conta-${aba}"]`) as HTMLElement | null)?.click(), 200);
  }, 400);
} else if (tela === 'visao-geral-02') {
  /* VISAO-GERAL-02 — a Visão Geral nova (V2Home) com o banco SINTÉTICO (`dados/visaoGeral02.ts`), out/2026. `&fz=fA` = uma fazenda;
     sem ele, o Global com as 3. Cliente admin (vê a meta). */
  const fz = q.get('fz');
  const GLOBAL = { id: '__global__', nome: 'Global', owner_id: '' };
  const uma = FAZENDAS_VG02.find((f) => f.id === fz);
  /* VISAO-GERAL-04 — `&muitas=1`: mais 4 fazendas com pecuária e sem dado (miniaturas "sem mapa"), para provar que a coluna da direita não
     cresce além da esquerda (as miniaturas rolam no card) */
  const extras = q.get('muitas') === '1' ? ['fD', 'fE', 'fF', 'fG'].map((id, i) => ({ id, nome: `Faz. Exemplo ${i + 4}`, codigo: `EX${i + 4}`, cliente_id: 'cli',
    tem_pecuaria: true, status_operacional: 'ativa' })) : [];
  const comPec = [...FAZENDAS_VG02.filter((f) => f.tem_pecuaria), ...extras];
  g.__fazendaBancada = { fazendas: [...FAZENDAS_VG02, ...extras], fazendasComPecuaria: comPec, fazendaAtual: uma ?? GLOBAL,
    isGlobal: !uma, fazendaId: uma ? uma.id : '__global__', setFazendaAtual: () => {}, loading: false };
  g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente Exemplo', perfil: 'admin_agroinblue' }, clientes: [{ id: 'cli', nome: 'Cliente Exemplo' }],
    isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  g.__bancoBancada = bancoVG02;
  montarNaUrl(
    <div className="h-full overflow-auto" data-casca>
      <BarraSecao area="Início" secao="Visão Geral" />
      <V2Home ano="2026" mes="10" viewMode="mes" onViewModeChange={() => {}} onIrPara={() => {}} onMesChange={() => {}} />
    </div>);
} else if (tela === 'visao-geral') {
  /* FIN-VISAO-GERAL-01 PR 3 — Financeiro › Visão Geral: a BARRA REAL (`BarraSecao` com Contas · Fazenda · Safra · Atividade) e a tela, com
     hoje = 22/10/2026. Banco SINTÉTICO (`dados/visaoGeral.ts`); `globalThis.__vgReal` (posto pelo ensaio, nunca no repo) troca a
     resposta da `fn_vg_tela` por uma do banco de verdade. `&modo=sai|ent` abre no modo; `&mes=AAAA-MM` clica o mês. */
  /* P71 — a fazenda de nome mais longo que o maior real (proto 23/10: 18 letras): 33 e 43 letras */
  g.__fazendaBancada = { fazendas: [{ id: 'f1', nome: 'Fazenda Exemplo Nome Longo Retiro', cliente_id: 'cli' }, { id: 'f2', nome: 'Faz. Exemplo Dois', cliente_id: 'cli' },
    { id: 'f3', nome: 'Fazenda Exemplo Nome Muito Longo Retiro Sul', cliente_id: 'cli' }],
    fazendaAtual: null, isGlobal: true, fazendaId: '__global__', setFazendaAtual: () => {} };
  /* PR 5 — `&contas=2`: duas contas escolhidas (o aviso "A lista filtra uma conta por vez" no rodapé da gaveta). Vai DEPOIS da carga
     dos filtros: ela zera a escolha ao trocar de cliente (`useCarregarFiltrosVG`) */
  const duasContas = q.get('contas') === '2';
  /* PR 5b — `&fatura=1`: toda folha com um pagamento de fatura do cartão que a gaveta não conta (a 5ª frase, a mais longa) */
  const comFatura = q.get('fatura') === '1';
  const gavetaVG = (a: any) => { const r = VG.gaveta(a); return comFatura && r.lista ? { ...r, lista: { ...r.lista, faturas_cartao: 1 } } : r; };
  g.__bancoBancada = { from: () => [], rpc: (fn: string, a: any) => fn === 'fn_vg_filtros'
      ? (duasContas && setTimeout(() => filtrosVG.mudar({ contas: ['c1', 'c2'] }), 0), g.__vgFiltrosReal ?? VG.FILTROS)
    : fn === 'fn_vg_tela' ? (g.__vgReal ?? VG.tela({ ...a, varia: q.get('vg_grupos') === 'varia' })) : fn === 'fn_vg_analise' ? VG.analise({ ...a, grande: q.get('vg_grande') === '1', centros13: q.get('vg_centros') === '13' }) : fn === 'fn_vg_gaveta' || fn === 'fn_vg_gaveta_ordenada' ? gavetaVG(a) : null };
  montarNaUrl(
    <div className="flex h-full flex-col">
      <BarraSecao area="Financeiro" secao="Visão Geral" atalho={<FiltrosBarraVG />} />
      <div className="min-h-0 flex-1"><VisaoGeralFinanceiro hoje="2026-10-22" onAnalisar={(x) => { g.__vgIntencao = x; }}
        inicial={{ modo: (q.get('modo') as any) ?? undefined, faixa: (q.get('faixa') as any) ?? undefined, de: q.get('de') ?? undefined,
          ate: q.get('ate') ?? undefined, sel: q.get('mes') ?? undefined }} /></div>
    </div>);
} else if (tela === 'meta') {
  /* P109 — as 4 telas que leem a meta da `fn_meta_linhas` (`&t=fluxo|pc100|vgplan|fech`), com o caso real do NJ 2026 (só os números;
     `dados/metaP109.ts`): Global ou uma fazenda (`&fz=f5`), e `&v=grande` (todo valor ×400). Cada uma mostra o rótulo do regime. */
  const T = q.get('t') ?? 'fluxo';
  const ESCALA = v === 'grande' ? 400 : 1;
  const FZ = META.FAZENDAS.find((f) => f.id === q.get('fz')) ?? null;
  const REAL_2025 = META.realizado2025(ESCALA);
  g.__fazendaBancada = { fazendas: META.FAZENDAS, fazendasComPecuaria: META.FAZENDAS.filter((f) => f.tem_pecuaria), loading: false,
    fazendaAtual: FZ ?? { id: '__global__', nome: 'Global', owner_id: '' }, isGlobal: !FZ, fazendaId: FZ?.id ?? '__global__', setFazendaAtual: () => {} };
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_plano_contas' ? META.PLANO : t === 'financeiro_dividendos' ? META.DIVIDENDOS
      : t === 'fazendas' ? META.FAZENDAS : t === 'planejamento_financeiro' ? META.planejamento(ESCALA, e.eq.fazenda_id)
      : t === 'vw_fin_classificacao_por_parte' ? REAL_2025.filter((l) => e.eq.fazenda_id == null || l.fazenda_id === e.eq.fazenda_id) : [],
    rpc: (fn: string, a: any) => fn === 'fn_meta_linhas' ? META.metaLinhas(ESCALA, a.p_regime) : null,
  };
  montar(T === 'fluxo' ? <div className="h-full p-3"><PlanejamentoFinanceiroTab ano={2026} /></div>
    : T === 'pc100' ? <div className="h-full"><PainelConsultorTab filtroGlobal={{ ano: '2026', mes: 10 }} /></div>
    : T === 'vgplan' ? <div className="h-full"><V2PlanejamentoVisaoGeral ano={2026} mes={10} /></div>
    : <div className="h-full"><V2FechamentoPeriodo periodo={{ periodoInicio: '2026-01', periodoFim: '2026-10' }} onPeriodoChange={() => {}} /></div>);
} else if (tela === 'evolucao-ano') {
  /* PROD-EVOLUCAO-01a — Produção › Evolução no Ano (nível 1), meses SINTÉTICOS no pior caso de largura (`mocks/evolucao.ts`); `&faz=1` uma fazenda */
  g.__bancoBancada = { from: () => [], rpc: () => null };
  montar(<div className="h-full"><EvolucaoDoAnoTab /></div>);
} else if (tela === 'dre') {
  /* DRE-LEVE-01 — Executivo › DRE (a página inteira: as faixas de filtro e a grade), dado SINTÉTICO (`dados/dre.ts`): a Pecuária com os
     números do mock e a Lavoura do teste da grade; `&v=grande` = todo valor ×10 (o pior caso de largura). O período vem da URL (`f_de`). */
  const ESCALA_DRE = v === 'grande' ? 10 : 1;
  g.__bancoBancada = {
    from: (t: string) => (t === 'financeiro_safras' ? DRE.SAFRAS : []),
    rpc: (fn: string, a: any) => fn === 'fn_dre_pecuaria' ? DRE.drePecuaria(a, ESCALA_DRE)
      : fn === 'fn_dre_lavoura' ? DRE.dreLavoura(ESCALA_DRE)
      /* DRE-VARIACAO-EXPLICA-01 1b: o modal da variação (`&fim=cadastro` = o D3) */
      : fn === 'fn_dre_pecuaria_patrimonio' ? DRE.patrimonio(a, ESCALA_DRE, q.get('fim') === 'cadastro') : null,
  };
  montarNaUrl(<div className="h-full"><AgriDreLavouraTab /></div>);
} else if (tela === 'evolucao-mes') {
  /* PROD-EVOLUCAO-01b — Produção › Evolução por Categoria (nível 2, o mês), linhas SINTÉTICAS no pior caso (`mocks/evolucaoMes.ts`):
     `&tipos=3` só compra/abate/venda · `&aberto=1` sem Fechamento · `&vazio=1` sem linha */
  g.__bancoBancada = { from: () => [], rpc: () => null };
  montar(<div className="h-full"><EvolucaoMesTab anoInicial={2026} mesInicial={9} onVoltar={() => {}} /></div>);
} else if (tela === 'entrada' || tela === 'definir-senha') {
  /* ACESSO-CONVITE-01 PR 1 — a tela de entrada (sem "Criar conta"; "Esqueci minha senha") e a página do link do e-mail
     (`&token_hash=…&type=invite|recovery|email_change`, só verificada no clique). Tela inteira, sem a casca do V2. */
  g.__bancoBancada = { from: () => [], rpc: () => null };
  raiz.render(<MemoryRouter>{tela === 'entrada' ? <AuthPage /> : <DefinirSenhaPage />}</MemoryRouter>);
} else if (tela === 'trocar-senha') {
  /* ACESSO-CONVITE-01 PR 1 — o "Trocar senha" (o mesmo gatilho da barra do topo; o cenário abre o modal) */
  g.__bancoBancada = { from: () => [], rpc: () => null };
  montar(<div className="p-4"><AlterarSenhaDialog /></div>);
} else if (tela === 'recorrencias') {
  /* REC-COLUNAS-01 — Financeiro › Recorrências (a lista do mês), com o pior texto de cada coluna curta. SINTÉTICO (`dados/recorrencias.ts`). */
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_recorrencias' ? REC.REGRAS
      : t === 'financeiro_contas_bancarias' ? REC.CONTAS_REC
      : t === 'financeiro_lancamentos_v2' && e.eq.cancelado === false && !e.in.recorrencia_id ? REC.OCORRENCIAS
      : [],
    rpc: (fn: string) => fn === 'fn_recorrencias_a_gerar' ? REC.A_GERAR : null,
  };
  montar(<div className="h-full"><V2Recorrencias /></div>);
} else if (tela === 'mapa-geo') {
  const UNIDADE = q.get('unidade') === '1';   // MAPA-PIQUETES-03
  /* MAPA-EDITAR-POLIGONO-03: `&laco=1` — o polígono aberto na edição chega com a linha cruzando ela mesma (uma "gravata" na caixa dele),
     como o "APP triângulo" do KMZ; a barra mostra a frase, o destaque e o "Corrigir automaticamente" */
  const gravataDe = (g: { type: string; coordinates: unknown }) => {
    const anel = g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0]) ? g.coordinates[0] : [];
    const xs = anel.map((p: number[]) => p[0]), ys = anel.map((p: number[]) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { type: 'Polygon', coordinates: [[[x0, y0], [x1, y1], [x1, y0], [x0, y1], [x0, y0]]] };
  };
  /* MAPA-EDITAR-POLIGONO-09: `&amontoado=1` — o polígono chega com um ponto a ~0,2 m do 1º (no mesmo lado, sem cruzar): a barra mostra o
     aviso de pontos amontoados e o "Corrigir automaticamente" com todas as opções (o caso da Pureza › 6B→P6 que empurrava o "Prévia e gravar") */
  const amontoadoDe = (g: { type: string; coordinates: unknown }) => {
    const anel: number[][] = g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0]) ? g.coordinates[0] : [];
    if (anel.length < 4) return g;
    const [a, b] = [anel[0], anel[1]];
    const t = 0.2 / (Math.hypot((b[0] - a[0]) * 107000, (b[1] - a[1]) * 111000) || 1);
    return { type: 'Polygon', coordinates: [[a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ...anel.slice(1)]] };
  };
  const formaNaEdicao = (g: { type: string; coordinates: unknown }) => q.get('laco') === '1' ? gravataDe(g) : q.get('amontoado') === '1' ? amontoadoDe(g) : g;
  /* MAPA-PRACA-ESTAVEL-01 (homologação 02/11 21:54, Agnaldo › Sta. Tereza › Modulo 03): `&modulo03=1` — o P_01 ganha a FORMA do Modulo 03
     (18 pontos com lados curtos e o furo no meio, lida do proto só leitura), levada para o canto do P_01; nenhum outro dado do cliente */
  /* PIQUETE-PRO-01: com `&p6=1` a sede e o curral sintéticos do P_01 saem (caíam dentro do P6, que no proto não os tem); o P6 (e a Praça P_06 no furo dele) levados para o canto do P_01 SEM mudar a área: a longitude é corrigida pelo cosseno da
     latitude nova (sem isso o P6 da bancada media 96,7 ha no lugar dos 95,59 do proto) */
  const moverP6 = (p: number[]): number[] => {
    const a0 = P6_PUREZA.coordinates[0];
    const lon0 = Math.min(...a0.map(x => x[0])), lat0 = Math.max(...a0.map(x => x[1]));
    const lat = p[1] + (-19.63 - lat0);
    return [-54.03 + (p[0] - lon0) * Math.cos((p[1] * Math.PI) / 180) / Math.cos((lat * Math.PI) / 180), lat];
  };
  const PRACA_DO_P6 = { id: 'gp6', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'praca_alimentacao', nome_original: 'Praça P_06', cor: null,
    geojson: { type: 'Polygon', coordinates: PRACA_P06.coordinates.map(a => a.map(moverP6)) }, created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' };
  const comModulo03 = <T extends { id: string; geojson: unknown }>(g: T): T => {
    /* PIQUETE-POLIGONO-01: `&p6=1` — a FORMA do P6 da Pureza (com o furo da praça antiga; lida do proto só leitura), no lugar do P_01 */
    const forma = q.get('p6') === '1' ? P6_PUREZA : q.get('modulo03') === '1' ? MODULO03 : null;
    if (!forma || g.id !== 'g1') return g;
    const aneis = forma.coordinates;
    const [dx, dy] = [-54.03 - Math.min(...aneis[0].map(p => p[0])), -19.63 - Math.max(...aneis[0].map(p => p[1]))];
    if (forma === P6_PUREZA) return { ...g, geojson: { type: 'Polygon', coordinates: aneis.map(a => a.map(moverP6)) } };
    return { ...g, geojson: { type: 'Polygon', coordinates: aneis.map(a => a.map(p => [p[0] + dx, p[1] + dy])) } };
  };
  /* MAPA-02a — Produção › Geo Pastos, o mapa de pastos em tela cheia (mock aprovado mock-mapa-pastos-v2). SINTÉTICO (`dados/mapaPastos.ts`):
     abre no último mês com fechamento de pastos (set/2026; fix1 A: o banco falso ignora `order`/`limit`, a lista vem do mais novo); um pasto sem fechamento no mês, um vazio, um pequeno (rótulo no hover) e o nome mais longo. */
  g.__fazendaBancada = { fazendas: [MAPA.FAZENDA], fazendasComPecuaria: [MAPA.FAZENDA], fazendaAtual: MAPA.FAZENDA, isGlobal: false, fazendaId: 'f1', setFazendaAtual: () => {} };
  g.__bancoBancada = {
    // MAPA-EDITAR-POLIGONO-02: a edição lê o polígono na hora (`.eq('id', …).maybeSingle()`), com a versão
    // MAPA-PIQUETES-02: `&piquetes=1` traz dois polígonos sem classificação (as divisões que viram piquetes)
    from: (t: string, e: any) => t === 'fazenda_geometrias'
        ? ((geos) => (e.eq.id ? geos.filter(g => g.id === e.eq.id).map(g => ({ ...g, versao: 1, geojson: formaNaEdicao(g.geojson) }))
          // MAPA-CRIAR-PIQUETES-01 2b: `versoesDosPoligonos` lê `.select('id, versao').in('id', …)` (a versão fresca do Mover linha / Juntar)
          : e.in.id ? geos.filter(g => e.in.id.includes(g.id)).map(g => ({ ...g, versao: 1 }))
          : geos))([...(q.get('piquetes') ? [...MAPA.GEOMETRIAS, ...MAPA.PIQUETES_SOLTOS] : MAPA.GEOMETRIAS), ...(UNIDADE ? MAPA.UNIDADE_POLIGONOS : []), ...(q.get('praca') === '1' ? MAPA.PRACA_SOBRE_PASTO : []), ...(q.get('galpao') === '1' ? [MAPA.GALPAO_GEOMETRIA] : []), ...(q.get('p6') === '1' ? [PRACA_DO_P6] : [])].filter(x => q.get('p6') !== '1' || (x.id !== 'gi1' && x.id !== 'gi2'))
            /* MAPA-PIQUETE-SUBAREA-01: `&semcontorno=1` — o P_09 SEM o contorno dele (o caso Modulo 05 da Sta. Tereza): o mapa o desenha pelos piquetes */
            .filter(x => q.get('semcontorno') !== '1' || x.id !== 'gu-c').map(comModulo03))
      // MAPA-CRIAR-PIQUETES-01: `&grupo=1` — o P_01 já originou o grupo P_01 com P_01A e P_01B SEM desenho (o caso P6 da Pureza)
      // PIQUETE-POLIGONO-01: `&p6=1` — o P_01 se chama P6 (o nome sugerido dos piquetes é P6-A, P6-B)
      : t === 'pastos' ? [...MAPA.dadosDosCartoes(q.get('cartoes')).pastos.map(x => (q.get('p6') === '1' && x.id === 'p1' ? { ...x, nome: 'P6' } : x)), ...(UNIDADE ? MAPA.UNIDADE_PASTOS : []),
          ...(q.get('grupo') === '1' ? ['P_01A', 'P_01B'].map((nome, i) => ({ ...MAPA.PASTOS[0], id: `p1${'ab'[i]}`, nome, grupo_id: 'gx', data_inicio: '2026-11-01', observacoes: null })) : [])]
      // MAPA-PIQUETES-03: `&unidade=1` — o grupo que nasceu de um pasto (o elo); MAPA-CRIAR-PIQUETES-01: `&grupo=1` — o do P_01
      : t === 'pasto_grupos' ? [...(UNIDADE ? MAPA.UNIDADE_GRUPOS : []), ...(q.get('grupo') === '1' ? [{ id: 'gx', nome: 'P_01', pasto_origem_id: 'p1', cliente_id: 'cli' }] : [])]
      : t === 'categorias_rebanho' ? MAPA.CATEGORIAS
      // MAPA-PERF-01: os itens vêm EMBUTIDOS no fechamento (o banco falso não faz o embed; a linha já o traz)
      : t === 'fechamento_pastos' ? [...MAPA.FECHAMENTOS, ...(UNIDADE ? MAPA.UNIDADE_FECHAMENTOS : [])].sort((a, b) => b.ano_mes.localeCompare(a.ano_mes))
        .map(f => ({ ...f, fechamento_pasto_itens: [...MAPA.dadosDosCartoes(q.get('cartoes')).itens, ...(UNIDADE ? MAPA.UNIDADE_ITENS : [])].filter(i => i.fechamento_id === f.id) }))
      : t === 'fechamento_pasto_itens' ? MAPA.dadosDosCartoes(q.get('cartoes')).itens.filter((i) => !e.in.fechamento_id || e.in.fechamento_id.includes(i.fechamento_id))
      // MAPA-02f-b: a infraestrutura e os bens do Patrimônio (sintéticos)
      // MEDIR-NO-MAPA-01: `&galpao=1` — o Galpao Agricultura (a forma do Retiro Agricultura) e um cocho ao lado
      : t === 'fazenda_infraestruturas' ? [...MAPA.INFRA, ...(q.get('galpao') === '1' ? MAPA.GALPAO_INFRA : [])]
      : t === 'patrimonio_bens' ? MAPA.BENS
      // MAPA-ATIVIDADE-LAVOURA-01: a lavoura do P5A (a safra vem embutida na linha)
      : t === 'agri_safra_area' ? MAPA.LAVOURA
      : [],
    // MAPA-AREA-TIPO-01: a prévia do escritor da classificação (sintética: de "Sem classificação" para o tipo pedido)
    rpc: (fn: string, a: any) => fn === 'fn_mapa_geometria_classificar'
      ? { ok: true, simulado: true, de: { rotulo: 'Sem classificação' }, para: { rotulo: a?.p_tipo === 'pasto' ? 'Pasto' : rotuloDoTipo(a?.p_tipo ?? '') } }
      // MAPA-02f-b: a prévia sintética das funções da infraestrutura e o nome de quem criou
      : fn === 'fn_infra_salvar'
        ? { ok: true, simulado: !!a?.p_simular, rotulo: 'Cocho', forma: 'Point', pasto: a?.p_infra?.pasto_id ? { id: a.p_infra.pasto_id, nome: 'P_01' } : null, bem: null, avisos: [] }
      : fn === 'fn_infra_desativar' ? { ok: true, simulado: !!a?.p_simular }
      // MAPA-AREA-TIPOS-02: a prévia sintética da estrutura com valor da área (o polígono em várias partes, o pior caso da frase)
      : fn === 'fn_mapa_estrutura_da_area' ? { ok: true, simulado: true, ja_existe: false, tipo: 'sede_casa', rotulo: 'Sede / casa', area_ha: 0.05, partes: 3 }
      // INFRA-FICHAS-PATR-01: a prévia sintética do criar bem (a resposta do escritor do Patrimônio, com um aviso longo)
      : fn === 'fn_infra_criar_bem' ? { ok: true, simulado: !!a?.p_simular, bem: { ok: true, simulado: true, categoria: { codigo: a?.p_bem?.categoria_codigo, nome: 'Rede de água e bebedouros' },
          vida_util_meses: a?.p_bem?.vida_util_meses ?? 180, residual_pct: 0, avisos: ['O bem nasce sem valor: ligue as notas fiscais no Patrimônio para ele depreciar.'] } }
      : fn === 'fn_nomes_dos_autores' ? [{ user_id: 'u1', nome: 'Gabriel Junqueira', email: null, situacao: 'membro ativo' }]
      : fn === 'fn_piquetes_concluir' ? MAPA.previaDosPiquetes(a ?? {})   // MAPA-PIQUETES-02: a prévia sintética
      // MAPA-CRIAR-PIQUETES-01: a prévia sintética do "Criar piquetes" (caso novo, ou o grupo que já existe com `&grupo=1`)
      /* PIQUETE-POLIGONO-01: com `&p6=1` a prévia sintética usa a área de cada polígono desenhado (a conta do banco) e o nome P6; o mês é o escolhido */
      : fn === 'fn_piquetes_criar' && q.get('p6') === '1' ? ((pq: { nome: string; pasto_id: string | null; geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null }[]) => {
          const areas = pq.map(x => (x.geojson ? Math.round(areaDoBancoHa(x.geojson) * 100) / 100 : 0));
          const soma = Math.round(areas.reduce((t, v) => t + v, 0) * 100) / 100;
          const mes = String(a?.p_mes ?? '2026-11-01');
          const mm = `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
          const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 0);
          const br = (v: number) => v.toFixed(2).replace('.', ',');
          return { ok: true, simulado: !!a?.p_simular, caso: 'novo', contorno: { id: 'g1', criado: false, area_ha: soma },
            piquetes: pq.map((x, i) => ({ nome: x.nome, area_ha: areas[i], liga: 'novo', pasto_id: null })), soma_ha: soma, dif_contorno_ha: 0,
            concluir: { frase: `P6 vira o grupo P6 com ${pq.length} piquetes (${br(soma)} ha) a partir de ${mm}; P6 fica encerrado em ${String(fim.getDate()).padStart(2, '0')}/${String(fim.getMonth() + 1).padStart(2, '0')}/${fim.getFullYear()}.` },
            ligar: null };
        })(a?.p_piquetes ?? [])
      : fn === 'fn_piquetes_criar' ? ((pq: { nome: string; pasto_id: string | null }[]) => ({
          ok: true, simulado: !!a?.p_simular, caso: q.get('grupo') === '1' ? 'grupo_existente' : 'novo', contorno: { id: 'g1', criado: false, area_ha: 41.6 },
          piquetes: pq.map(x => ({ nome: x.nome, area_ha: Math.round(4160 / pq.length) / 100, liga: x.pasto_id ? 'existente' : 'novo', pasto_id: x.pasto_id })),
          soma_ha: 41.6, dif_contorno_ha: 0,
          concluir: q.get('grupo') === '1' ? null : { frase: `P_01 vira o grupo P_01 com ${pq.length} piquetes (41,60 ha) a partir de 11/2026; P_01 fica encerrado em 31/10/2026.` },
          ligar: q.get('grupo') === '1' ? { frase: 'As 2 divisões P_01A, P_01B de P_01 ganham o desenho; nenhum pasto é criado e a área oficial não muda.', sem_desenho: null } : null,
        }))(a?.p_piquetes ?? [])
      /* MAPA-CRIAR-PIQUETES-01 fatia 2b — o caminho de volta (as respostas seguem os `v_res` das migrations 20261028115230/240/250): só com `&unidade=1`
         (P_09 Retiro de Cima → P_09A + P_09B, grupo `gu`); áreas na casa dos milhares para esticar as colunas */
      : fn === 'fn_piquetes_mover_linha' ? {
          ok: true, simulado: !!a?.p_simular, mes: a?.p_mes ?? '2026-11-01', gesto_id: 'gs1', lote: null,
          itens: [
            { pasto_id: 'pua', nome: 'P_09A', situacao: 'mudou', motivo: null, area_antes: 1234.56, area_mapa: 1331.07, dif_ha: 96.51, dif_pct: 7.8 },
            { pasto_id: 'pub', nome: 'P_09B', situacao: 'mudou', motivo: null, area_antes: 987.65, area_mapa: 891.14, dif_ha: -96.51, dif_pct: -9.8 },
          ],
          soma_antes_ha: 2222.21, soma_depois_ha: 2222.21, dif_soma_ha: 0, area_muda: true,
          frase: 'A linha entre P_09A e P_09B se move; a área oficial das duas passa a valer a do mapa a partir de 11/2026 (P_09A 1.331,07 ha, P_09B 891,14 ha; a soma não muda).',
        }
      : fn === 'fn_piquetes_juntar' ? {
          ok: true, simulado: !!a?.p_simular, mes: a?.p_mes ?? '2026-11-01',
          fica: { id: 'pua', nome: 'P_09A', area_antes_ha: 1234.56, area_depois_ha: 2222.21 },
          sai: { id: 'pub', nome: 'P_09B', area_antes_ha: 987.65, encerra_em: '2026-10-31' },
          grupo: { nome: 'P_09 Retiro de Cima', divisoes: 2 },
          frase: 'P_09A absorve P_09B: passa de 1.234,56 ha para 2.222,21 ha a partir de 11/2026; P_09B encerra em 31/10/2026 e o histórico dele fica.',
        }
      : fn === 'fn_piquetes_desfazer' ? {
          ok: true, simulado: !!a?.p_simular, modo: 'criados',
          pai: { id: 'pu', nome: 'P_09 Retiro de Cima', volta_a_valer: true },
          divisoes: [{ id: 'pua', nome: 'P_09A', fica_inativo: true }, { id: 'pub', nome: 'P_09B', fica_inativo: true }],
          poligonos: [{ id: 'gu-a', nome: 'P_09A', destino: 'apagar' }, { id: 'gu-b', nome: 'P_09B', destino: 'soltar' }],
          areas: [],
          frase: 'P_09 Retiro de Cima volta a valer inteiro (2.222,21 ha); P_09A e P_09B ficam inativos e o desenho de P_09A sai do mapa.',
        }
      /* PIQUETE-VIGENCIA-01: o "Mudar mês de início" do pai P_09 (os piquetes começam em 09/2026): antes de 09 antecipa, depois adia; `&fechado=1` =
         a recusa do mês fechado com o HINT (o link do Reabrir); o desfazer da última mudança com a frase mais longa */
      : fn === 'fn_piquetes_mudar_inicio' && q.get('fechado') === '1' ? {
          __codigo: 'P0001', __hint: 'fechamento:2026-10',
          __erro: 'Os piquetes de P_09 Retiro de Cima não mudam para 11/2026: o fechamento de 10/2026 está fechado (reabra o mês no Fechamento antes); P_09A recebe lote antes de 11/2026. Nada foi gravado.',
        }
      /* bug do P17 (06/11 17:13): as respostas no formato REAL (grupo, pai.fim_depois, lotação; a GRAVAÇÃO sem frase/meses/pastos); `&caso=p17` = os
         nomes e as áreas reais do P17 da Pureza (a tabela de 5 colunas com o nome mais longo) */
      : fn === 'fn_piquetes_mudar_inicio' && a?.p_simular === false ? { ok: true, simulado: false, trilha_id: 't-bancada', de: '2026-09-01', para: String(a?.p_mes) }
      : fn === 'fn_piquetes_mudar_inicio' ? ((mes: string, p17: boolean) => {
          const ant = mes < '2026-09-01';
          const pastos = p17 ? ['P17-A', 'P17-B', 'P17-C', 'P17-D'].map((nome, i) => ({ id: `p17${i}`, nome })) : [{ id: 'pua', nome: 'P_09A' }, { id: 'pub', nome: 'P_09B' }];
          const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 0);
          return {
            ok: true, simulado: true, direcao: ant ? 'antecipar' : 'adiar', de: '2026-09-01', para: mes,
            meses: ant ? ['2026-08'] : (mes >= '2026-11-01' ? ['2026-09', '2026-10'] : ['2026-09']),
            grupo: { id: 'gu', nome: 'P_09 Retiro de Cima' },
            pai: { id: 'pu', nome: 'P_09 Retiro de Cima', fim_antes: '2026-08-31', fim_depois: `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}` },
            area_pai_ha: p17 ? 108.8 : 2222.21,
            lotacao: p17 ? { kg: 0, ua: 0, cabecas: 0, piquete: 'P17-A', ua_ha_grupo: 0, area_grupo_ha: 108.83, ua_ha_piquete: 0, area_piquete_ha: 24.11 }
              : { kg: ant ? 456789 : 0, ua: ant ? 1015.1 : 0, cabecas: ant ? 1234 : 0, piquete: 'P_09A', ua_ha_grupo: ant ? 0.46 : 0, area_grupo_ha: 2222.21, ua_ha_piquete: ant ? 0.79 : 0, area_piquete_ha: 1331.07 },
            pastos, cards: ant ? [{ id: 'c1' }] : [], cabecas_antes: ant ? 1234 : 0, card_vai_para: pastos[0].nome,
            frase: 'a frase do banco (com ponto decimal): a tela monta a dela',
          };
        })(String(a?.p_mes ?? '2026-11-01'), q.get('caso') === 'p17')
      : fn === 'fn_piquetes_mudar_inicio_desfazer' && a?.p_simular === false ? { ok: true, simulado: false, trilha_id: 't-bancada-2', desfez: 't1', de: '2026-11-01', para: '2026-09-01', cards: 0, cabecas: 0 }
      : fn === 'fn_piquetes_mudar_inicio_desfazer' ? {
          ok: true, simulado: !!a?.p_simular, direcao: 'antecipar', meses: ['2026-09', '2026-10'], de: '2026-11-01', para: '2026-09-01', trilha_id: 't1',
          gravada_em: '2026-11-05T21:18:00Z', motivo_do_gesto: 'teste', pai: { id: 'pu', nome: 'P_09 Retiro de Cima' }, cards: 0, cabecas: 0,
          frase: 'Desfaz a mudança de 05/11/2026 18:18: os piquetes (P_09A, P_09B) voltam a começar em 09/2026; P_09 Retiro de Cima volta a valer até 31/08/2026; 0 card(s) (0 cab) voltam a P_09 Retiro de Cima.',
        }
      : null,
  };
  montar(<div className="flex h-full min-h-0 flex-col"><MapaGeoPastosTab /></div>);
} else if (tela === 'mapa-global') {
  /* MAPA-GLOBAL-01 — Produção › Geo Pastos com a barra lateral em Global (mock aprovado mock-geo-global-v1). SINTÉTICO (`dados/mapaGlobal.ts`):
     `n=2` ou `n=5` (o nome mais longo, uma fazenda sem fechamento no mês e uma sem mapa). Abre em set/2026 (o mês anterior ao de hoje). */
  const GL = mapaGlobal(Number(q.get('n') ?? '2'));
  g.__fazendaBancada = { fazendas: GL.FAZENDAS, fazendasComPecuaria: GL.FAZENDAS, fazendaAtual: { id: '__global__', nome: 'Global', owner_id: '', cliente_id: '' },
    isGlobal: true, fazendaId: '__global__', setFazendaAtual: () => {}, loading: false };
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'fazenda_geometrias' ? GL.GEOMETRIAS
      : t === 'pastos' ? GL.PASTOS
      : t === 'categorias_rebanho' ? GL.CATEGORIAS
      : t === 'fechamento_pastos' ? GL.FECHAMENTOS.map(f => ({ ...f, fechamento_pasto_itens: GL.ITENS.filter(i => i.fechamento_id === f.id) }))
      : t === 'fechamento_pasto_itens' ? GL.ITENS.filter((i) => !e.in.fechamento_id || e.in.fechamento_id.includes(i.fechamento_id))
      : [],
    rpc: () => null,
  };
  montar(<div className="flex h-full min-h-0 flex-col"><MapaGeoPastosTab /></div>);
} else if (tela === 'chuvas-lancar') {
  /* CHUVAS-LANCAR-01 — Produção › Chuvas › lançar (a planilha do ano de UMA fazenda), banco SINTÉTICO: 2026 (jan → out, dias de chuva
     espalhados; o pior caso de largura, 93,0 mm) e 2024–2025 (as linhas do histórico). `&global=1` = o Global (a escolha da estação). */
  const FZ_CH = { id: 'fch', nome: 'Faz. Exemplo Chuva', codigo: 'EXC', cliente_id: 'cli', tem_pecuaria: true };
  const global = q.get('global') === '1';
  g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' }, clientes: [{ id: 'cli', nome: 'Cliente Exemplo' }], isAdmin: true, loading: false };
  g.__fazendaBancada = { fazendas: [FZ_CH], fazendasComPecuaria: [FZ_CH], loading: false, setFazendaAtual: () => {},
    fazendaAtual: global ? { id: '__global__', nome: 'Global', owner_id: '' } : FZ_CH, isGlobal: global, fazendaId: global ? '__global__' : FZ_CH.id };
  const CHUVAS_SINT: Record<string, unknown>[] = [];
  let nCh = 0;
  for (const ano of [2024, 2025, 2026]) for (let m = 1; m <= (ano === 2026 ? 10 : 12); m++) {
    const chuvoso = m <= 3 || m >= 10;
    for (let d = 1; d <= 28; d += chuvoso ? 3 : 9) {
      nCh++;
      const mm = Math.round(((nCh * 37) % 230) / 10 * (chuvoso ? 2.5 : 0.6) * 10) / 10;
      if (mm <= 0) continue;
      CHUVAS_SINT.push({ id: `ch${nCh}`, fazenda_id: FZ_CH.id, cliente_id: 'cli', data: `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        milimetros: ano === 2026 && m === 1 && d === 1 ? 93 : mm, observacao: null });
    }
  }
  g.__bancoBancada = { from: (t: string) => (t === 'chuvas' ? CHUVAS_SINT : []), rpc: () => null };
  montar(<div className="flex h-full min-h-0 flex-col"><ChuvasTab mode="operacional" /></div>);
} else if (tela === 'barra-pecuaria') {
  /* PEC-ABAS-01 — a barra do topo das telas da Pecuária com as abas (o `Segmentado` do shell) e a volta ("‹ Voltar", reservado):
     `&aba=<secao>` marca a aba; `&de=<secao>` = veio de outra aba (a volta aparece). */
  const de = q.get('de');
  const opcoes = opcoesDoAtalho(() => true);
  const escolhida = opcoes.find((o) => o.valor === (q.get('aba') ?? 'lancamentos-zoot')) ?? opcoes[0];
  const aba = escolhida.valor;
  montar(<div className="h-full">
    <BarraSecao area="Produção" secao={escolhida.rotulo} reservarVoltar
      voltar={de ? { rotulo: 'Voltar', onVoltar: () => {} } : undefined}
      atalho={<Segmentado altura={22} valor={aba} onEscolher={() => {}} opcoes={opcoes} className="bg-card" />} />
  </div>);
} else if (tela === 'periodo') {
  /* UI-PERIODO-01 — o componente único de período (mock ui-validar/periodo.html, aprovado 04/11 09:33) numa barra de tela, com o
     "hoje" fixo (04/11/2026) e as safras SINTÉTICAS do cadastro (pecuária jul–jun, lavoura set–ago: a data vem do cadastro).
     `&modo=datas|mes|ano`, `&ativ=pec|duas`, `&abrir=1` abre o popup; `&cpr=1` = os 3 botões da CPR + "Escolher datas". */
  const modo = q.get('modo') === 'mes' ? 'mes' : q.get('modo') === 'ano' ? 'ano' : 'datas';
  const atividades: ('pecuaria' | 'agricultura')[] = q.get('ativ') === 'duas' ? ['pecuaria', 'agricultura'] : q.get('ativ') === 'nenhuma' ? [] : ['pecuaria'];
  g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' }, clientes: [{ id: 'cli', nome: 'Cliente Exemplo' }], isAdmin: true, loading: false };
  const SAFRAS_SINT = [
    { id: 'p27', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', data_inicio: '2026-07-01', data_fim: '2027-06-30', cliente_id: 'cli', ativa: true },
    { id: 'p26', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', data_inicio: '2025-07-01', data_fim: '2026-06-30', cliente_id: 'cli', ativa: true },
    { id: 'l27', codigo: '26/27-Lav', escopo_negocio: 'agricultura', data_inicio: '2026-09-01', data_fim: '2027-08-31', cliente_id: 'cli', ativa: true },
    { id: 'l26', codigo: '25/26-Lav', escopo_negocio: 'agricultura', data_inicio: '2025-09-01', data_fim: '2026-08-31', cliente_id: 'cli', ativa: true },
  ];
  g.__bancoBancada = { from: (t: string) => (t === 'financeiro_safras' ? SAFRAS_SINT : []), rpc: () => null };
  function BarraComPeriodo() {
    const [valor, setValor] = React.useState<Intervalo | null>(q.get('cpr') === '1' ? null : { de: '2026-10-01', ate: '2026-10-31' });
    return (
      <div className="p-3">
        <div className="flex h-[34px] items-center gap-1.5 rounded-md border border-[#D9DEE5] bg-white px-2.5" data-testid="barra-periodo">
          <span className="text-[11px] text-muted-foreground">Período</span>
          {q.get('cpr') === '1' && <Segmentado valor="atual" onEscolher={() => {}} altura={24}
            opcoes={[{ valor: 'anterior', rotulo: 'Mês anterior' }, { valor: 'atual', rotulo: 'Mês atual' }, { valor: 'futuro', rotulo: 'Mês futuro' }]} />}
          <SeletorDePeriodo hoje="2026-11-04" valor={valor} onChange={setValor} modo={modo} atividades={atividades} anoMaisAntigo={2020}
            rotuloVazio="Escolher datas"
            /* DRE-LAYOUT-04 — o calendário compacto do DRE (`&dre=1`): por mês, sem mês solto e sem "Redefinir" (o DRE não passa `padrao`) */
            {...(q.get('dre') === '1' ? { compacto: true, porMes: true, atalhosOcultos: ['este-mes', 'mes-passado'] }
              : { padrao: { de: '2026-10-01', ate: '2026-10-31' } })} />
        </div>
      </div>
    );
  }
  montar(<BarraComPeriodo />);
  if (q.get('abrir') === '1') setTimeout(() => document.querySelector<HTMLElement>('[data-testid="seletor-de-periodo"]')?.click(), 300);
} else if (tela === 'painel-periodo') {
  /* UI-PERIODO-01 — Financeiro › Painel por período (a faixa de filtros), banco SINTÉTICO: duas contas e as safras do cadastro; sem lançamento */
  g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' }, clientes: [{ id: 'cli', nome: 'Cliente Exemplo' }], isAdmin: true, loading: false };
  g.__fazendaBancada = { fazendas: [], fazendaAtual: { id: '__global__', nome: 'Global', owner_id: '' }, isGlobal: true, fazendaId: '__global__', setFazendaAtual: () => {}, loading: false };
  const CONTAS_PP = [{ id: 'c1', nome_conta: 'Conta Corrente Principal', nome_exibicao: 'Conta Corrente Principal', ativa: true, cliente_id: 'cli' },
    { id: 'c2', nome_conta: 'Aplicação Automática', nome_exibicao: 'Aplicação Automática', ativa: true, cliente_id: 'cli' }];
  const SAFRAS_PP = [{ id: 'p27', nome: '26/27-Pec', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', data_inicio: '2026-07-01', data_fim: '2027-06-30', ativa: true, cliente_id: 'cli' },
    { id: 'l27', nome: '26/27-Lav', codigo: '26/27-Lav', escopo_negocio: 'agricultura', data_inicio: '2026-07-01', data_fim: '2027-06-30', ativa: true, cliente_id: 'cli' },
    ...SAFRAS_DA_BANCADA.filter((x) => x.id.endsWith('26'))];
  g.__bancoBancada = { from: (t: string) => (t === 'financeiro_contas_bancarias' ? CONTAS_PP : t === 'financeiro_safras' ? SAFRAS_PP : []), rpc: () => null };
  montar(<div className="h-full overflow-auto p-3"><PainelPeriodoTab /></div>);
  if (q.get('abrir') === '1') setTimeout(() => document.querySelector<HTMLElement>('[data-testid="painel-periodo"]')?.click(), 600);
} else if (tela === 'acessos') {
  /* ACESSOS-PERFIL-01 — a lista (nome e e-mail pela fonte unica), o "Novo acesso" e o "Editar acesso" (`&v=editar`). SINTETICO. */
  const MEMBROS = [
    { id: 'm1', user_id: 'u-fin', perfil: 'financeiro', ativo: true }, { id: 'm2', user_id: 'u-adm', perfil: 'admin_agroinblue', ativo: true },
    { id: 'm3', user_id: 'u1', perfil: 'gestor_cliente', ativo: true }, { id: 'm4', user_id: 'u-longo', perfil: 'gestor_cliente', ativo: true },
    { id: 'm5', user_id: 'u-sem', perfil: 'campo', ativo: true }];
  const NOMES = [
    { user_id: 'u-fin', nome: 'Fulana Financeira Exemplo', email: 'financeiro@fazendaexemplo.com.br', situacao: 'membro ativo' },
    { user_id: 'u-adm', nome: 'Administrador Exemplo', email: 'admin@exemplo.com', situacao: 'consultor' },
    { user_id: 'u1', nome: 'Eu Mesmo da Bancada', email: 'bancada@exemplo.com', situacao: 'membro ativo' },
    { user_id: 'u-longo', nome: 'Maria Aparecida dos Santos Pereira de Albuquerque Exemplo', email: 'maria.aparecida.santos.pereira.albuquerque@agropecuariaexemplo.com.br', situacao: 'membro ativo' },
    { user_id: 'u-sem', nome: 'usuário removido (0e422659)', email: null, situacao: 'removido' }];
  g.__bancoBancada = { from: (t: string) => t === 'cliente_membros' ? MEMBROS : t === 'fazenda_membros' ? [{ user_id: 'u-fin', fazenda_id: 'f1' }, { user_id: 'u-longo', fazenda_id: 'f1' }] : [],
    rpc: (fn: string) => fn === 'fn_nomes_dos_autores' ? NOMES : null };
  montar(<AcessosTab />);
  if (v === 'editar') setTimeout(() => (document.querySelectorAll('[data-testid="editar-membro"]')[1] as HTMLElement | undefined)?.click(), 300);
} else if (tela === 'oc') {
  /* UI-SEM-CORTE-02 — os tres modais da OC, aba a aba (`&v=venda|abate|compra&aba=`), com dados SINTETICOS (`dados/oc.ts`); o mes
     da operacao FECHADO no P1 (a faixa "Reabrir mês" no rodape). */
  const aba = q.get('aba') ?? '';
  const fechado = q.get('p1') !== 'aberto';
  /* OC-CC-BOTAO-BUSCAR-DESLOCA-01 — `&cc=1`: a OC em CONTA CORRENTE (o `oc_conta_corrente` responde o envelope sintetico, com o
     principal ja' programado ate' o valor da operacao: o motivo e os dois botoes na faixa das sub-abas, como no print de 14h36). */
  const comCC = q.get('cc') === '1';
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'get_status_pilares_fechamento'
    ? { p1_mapa_pastos: { status: fechado ? 'oficial' : 'aberto' }, p2_valor_rebanho: { status: 'aberto' } }
    : comCC && fn === 'oc_conta_corrente' ? OC.envelopeContaCorrente(q.get('coberto') !== '0') : null };
  const p: any = v === 'abate' ? OC.propsAbate(aba) : v === 'compra' ? OC.propsCompra(aba) : OC.propsVenda(aba);
  if (v === 'compra' && fechado) p.mesFechadoMsg = OC.MES_FECHADO;
  /* OC-DOC-VENDA-01 — `&docs=1`: a aba Documentos com documentos (abate x venda) e a nota repetida */
  if (q.get('docs') === '1') p.documentosApi = { ...p.documentosApi, documentos: OC.documentosDaOC(v), notaRepetida: OC.notaRepetidaLonga,
    lotes: [{ loteId: 'l1', ordem: 1, categoria: 'bois', qtd: 75 }, { loteId: 'l2', ordem: 2, categoria: 'bois', qtd: 75 }] };
  /* o MESMO DialogContent do `LancamentosTab` (o shell manda na propria altura) */
  montar(<Dialog open><DialogContent className="max-w-5xl max-h-none p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
    {v === 'abate' ? <AbateModalShell {...p} /> : v === 'compra' ? <CompraModalShell {...p} /> : <VendaModalShell {...p} />}
  </DialogContent></Dialog>);
} else if (tela === 'pendencias') {
  /* UI-SEM-CORTE-02 — o ⚑ do cliente aberto (modal de altura fixa), a Nova pendência e o Resumo dos clientes. */
  const fonte: any = OC.fontePendencias();
  const Abre = () => { React.useEffect(() => { (document.querySelector('[data-testid="aviso-pendencias-botao"]') as HTMLElement | null)?.click(); }, []); return null; };
  if (v === 'nova') montar(<NovaPendenciaDialog open onOpenChange={() => {}} clientes={[{ id: 'cli', nome: 'Cliente Bancada' }]} clienteFixo="cli" criar={async () => null} />);
  else if (v === 'resumo') montar(<ResumoClientesPainel fonte={fonte} />);
  else montar(<div className="bg-primary p-2"><AvisoPendenciasCliente cliente={{ id: 'cli', nome: 'Cliente Bancada' }} onVerNoResumo={() => {}} fonte={fonte} /><Abre /></div>);
} else if (tela === 'oc-cc') {
  /* OC-RECEB-PARCIAL-01 — a conta corrente da venda com o recebimento parcial DIVIDIDO (Receb. 1/2 conciliado + 2/2 programado,
     a faixa "Falta receber …, já programado.") e o "Buscar recebimento no Financeiro" com os dois grupos (`&v=buscar`, nome longo).
     Dados SINTETICOS na forma do `oc_conta_corrente`. */
  const cc = lerContaCorrente(OC.envelopeContaCorrente());
  /* OC-CORRECOES-01 C3 — as tres datas, favorecido, conta bancaria; do comprador tambem os que a regra exclui (apagados, com o motivo) */
  const comum = { subcentro: 'Venda de Desmama Fêmeas', semContaBancaria: false, conciliado: false };
  const itens = [
    { ...comum, lancamentoId: 'm1', data: '2026-09-20', competencia: '2026-09-03', vencimento: '2026-09-20', pagamento: '2026-09-20', valor: 50000,
      descricao: 'Pix do comprador Exemplo da Silva', favorecido: 'Exemplo da Silva Agropecuária Ltda', contaBancaria: 'Banco do Brasil',
      mesmoFavorecido: true, status: 'realizado', motivoExcluido: null },
    { ...comum, lancamentoId: 'x1', data: '2026-09-30', competencia: '2026-09-03', vencimento: '2026-09-30', pagamento: null, valor: 215000,
      descricao: 'Venda 118 Vacas - 1/3', favorecido: 'Exemplo da Silva Agropecuária Ltda', contaBancaria: 'Banco do Brasil',
      mesmoFavorecido: true, status: 'programado', motivoExcluido: 'já está nesta operação (1/1)' },
    { ...comum, lancamentoId: 'x2', data: '2026-10-30', competencia: '2026-09-03', vencimento: '2026-10-30', pagamento: null, valor: 1375000.55,
      descricao: 'Venda 118 Vacas - 2/3', favorecido: 'Exemplo da Silva Agropecuária Ltda', contaBancaria: 'Cooperativa de Crédito Sicredi Exemplo',
      mesmoFavorecido: true, status: 'programado', motivoExcluido: 'ligado a outra operação comercial' },
    { ...comum, lancamentoId: 'o1', data: '2026-09-10', competencia: '2026-09-10', vencimento: '2026-09-10', pagamento: '2026-09-10', valor: 5000,
      descricao: 'Pix recebido de terceiro com um nome muito comprido que nao cabe na coluna', favorecido: 'Terceiro Exemplo',
      contaBancaria: 'Banco do Brasil', mesmoFavorecido: false, status: 'realizado', motivoExcluido: null },
    /* OC-BUSCAR-RECEBIMENTO-01 — os ANTIGOS do caso real (2021, fora da janela da OC): só aparecem com "procurar em todo o histórico" */
    { ...comum, lancamentoId: 'h1', data: '2021-04-24', competencia: '2021-04-24', vencimento: '2021-04-24', pagamento: '2021-04-24', valor: 180000,
      descricao: 'Abate 060 Vacas · Recebimento do frigorífico com a descrição longa de sempre', favorecido: 'Exemplo da Silva Agropecuária Ltda',
      contaBancaria: 'Cooperativa de Crédito Sicredi Exemplo', mesmoFavorecido: true, status: 'conciliado', conciliado: true, motivoExcluido: null },
    { ...comum, lancamentoId: 'h2', data: '2021-05-20', competencia: '2021-05-20', vencimento: '2021-05-20', pagamento: '2021-05-20', valor: 1375000.55,
      descricao: 'Abate 027 Vacas · Recebimento', favorecido: 'Exemplo da Silva Agropecuária Ltda', contaBancaria: 'Banco do Brasil',
      mesmoFavorecido: true, status: 'realizado', motivoExcluido: null },
  ];
  const nada = async () => null;
  const api: any = { contaCorrente: cc, loading: false, erro: null, ocupado: false, recarregar: async () => {}, sincronizarEntregas: nada,
    listarVinculaveis: async () => ({ erro: null, itens }), vincularRecebimento: nada, explicarSaldo: nada, desfazerExplicacao: nada,
    simularExplicacao: async () => ({ previa: null, erro: null }), lerRolCancelamento: async () => ({ rol: null, erro: null }),
    listarLotes: async () => [], listarContas: async () => [] };
  const Abre = () => { React.useEffect(() => { if (v === 'buscar') setTimeout(() => (Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent === '+ Buscar recebimento no Financeiro') as HTMLElement | undefined)?.click(), 50); }, []); return null; };
  /* no "Buscar" a pagina atras do dialogo fica escondida: o X do dialogo sobre o texto da pagina e' sobreposicao da bancada, nao da tela */
  montar(<div className="bg-background p-2" style={v === 'buscar' ? { visibility: 'hidden' } : undefined}>
    <AbaContaCorrenteOC api={api} somenteLeitura={false} /><Abre /></div>);
} else if (tela === 'oc-dialogo') {
  /* OC-DESFAZER-PREVISTO-01b — os tres estados do mock (460x344): bloqueio por realizado/conciliado, agendado com confirmacao e
     o Atualizar com a data proposta ja passada. Dados SINTETICOS; o banco e' o simulado do proprio dialogo (rpc/api). */
  const LANC = '2448e772-1111-4222-8333-944444444444';
  const OP = '1645ba75-0000-4000-8000-000000000000';
  const IDENT = 'Abate 036 N · novilhas · 36 cab';
  const ROL = ['estornar o título de R$ 213.645,23 (venc. 16/10/2026)', 'cancelar a programação', 'cancelar o compromisso'];
  const retorno = (agendados: unknown[]) => ({ ok: true, simulado: true, estorno_id: 'e1', compromisso_id: 'c1', titulos_estornados: [],
    agendados, programacoes_canceladas: 1, operacao_id: OP, operacao_versao: 19 });
  if (v === 'atualizar') {
    const api = {
      simulando: false, reprogramando: false,
      simular: async () => ({ ok: true, valorAntigo: 228400, valorNovo: 213645.23, vencimentoProposto: '2026-10-15', agendados: [], bloqueios: [],
        rol: [{ tipo: 'parcela', descricao: 'Cancela a parcela 1/1 de R$ 228.400,00 (prevista).', id: 'p1' },
          { tipo: 'compromisso', descricao: 'O compromisso passa de R$ 228.400,00 para R$ 213.645,23.', id: 'c1' },
          { tipo: 'parcela_nova', descricao: 'Nova parcela única de R$ 213.645,23 com vencimento em 15/10/2026.', id: null }] }),
      reprogramar: async () => null,
    } as any;
    montar(<DialogoAtualizarCompromisso api={api} loteId="l1" rotulo="Novilhas · 36 cab" versao={18} identidade={IDENT} operacaoId={OP}
      tipoOperacao="abate" onFechar={() => {}} onAtualizado={() => {}} />);
  } else {
    const rpc = async () => v === 'bloqueio'
      ? { data: null, error: { code: 'P0001', message: 'O lançamento de R$ 213.150,75 de 13/07/2026 já foi pago ou conciliado. Desfaça o pagamento no lançamento antes.',
          details: LANC, hint: JSON.stringify({ lancamento_id: LANC, data: '2026-07-13', valor: 213150.75, status: 'realizado', sinal: '1', conciliado: true, sequencia: 1, total: 1 }) } }
      : { data: retorno(v === 'agendado' ? [{ lancamento_id: LANC, sequencia: 1, total: 1, valor: 213645.23, data: '2026-10-16', sinal: '1' }] : []), error: null };
    montar(<DialogoDesfazerCompromisso operacaoId={OP} compromissoId="c1" versao={19} identidade={IDENT} rol={ROL} tipoOperacao="abate"
      onFechar={() => {}} onDesfeito={() => {}} onAbrirLancamento={() => {}} rpc={rpc as any} />);
  }
} else if (tela === 'estacao' && (v === 'nota' || v === 'notadif' || v === 'notaja')) {
  /* CONC-CRIAR-COM-NOTA-01 — o "Criar lançamento" da estação com a NF (o XML SINTÉTICO de sempre: nº 12.345, R$ 16.238,00, emitida em
     30/09/2026), que o roteiro solta no "Ler a NF" do Documentos (`globalThis.__nfBancada`). `nota`: o extrato do mesmo valor (preenche e cria
     pela RPC); `notadif`: o extrato de R$ 16.000,00 (cria com o da nota e abre o Casar com a diferença); `notaja`: a nota já lançada, realizada
     e sem vínculo (o Casar com ela levada, o nº da NF na linha). Tudo SINTÉTICO. */
  const valor = v === 'notadif' ? -16000 : -16238;
  g.__nfBancada = montarNFe({ duplicatas: null });
  const FORN = { id: 'agro', nome: 'Agropecuaria Exemplo Ltda', nome_fantasia: 'Casa do Campo', cpf_cnpj: '11.222.333/0001-81', fazenda_id: null, ativo: true };
  g.__fornecedoresBancada = [FORN];
  /* a última classificação do fornecedor (a sugestão da nota) e o plano dela */
  const ULTIMA = { id: 'lanc-criado', plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação',
    escopo_negocio: 'pecuaria', data_competencia: '2026-08-14', favorecido_id: 'agro', tipo_operacao: '2-Saídas', cancelado: false };
  const JA = { id: 'lanc-ja', vencimento: '2026-11-10', pagamento: '2026-11-10', competencia: '2026-09-30', descricao: 'Compra de insumos sintéticos da nota',
    valor_cent: 1623800, status: 'realizado', conciliado: false, numero_documento: '000012345', fornecedor_id: 'agro', fornecedor_nome: FORN.nome,
    fornecedor_por: 'cnpj', parcelas: [{ n: 1, dif_cent: 0, dif_dias: 0 }], por: ['numero'], conta_bancaria_id: 'bb', cancelado: false };
  g.__bancoBancada = {
    from: (t: string) => t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Exemplo', fazenda_id: 'f1', tipo_conta: 'conta_corrente', ativa: true }]
      : t === 'financeiro_fornecedores' ? [FORN] : t === 'financeiro_lancamentos_v2' ? [ULTIMA]
      : t === 'financeiro_plano_contas' ? [{ id: 'pl-nut', cliente_id: 'cli', tipo_operacao: '2-Saídas', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição',
        centro_custo: 'Suplementação', subcentro: 'Nutrição Engorda', escopo_negocio: 'pecuaria', ativo: true, ordem_exibicao: 1 }] : [],
    rpc: (fn: string) => fn === 'fn_nota_ja_lancada' ? (v === 'notaja' ? [JA] : [])
      : fn === 'fn_criar_lancamento_de_extrato' ? { ok: true, lancamento_id: 'novo', cbi_id: 'cbi' }
      : fn === 'fn_espelho_casar' ? (v === 'notadif' ? { ok: false, motivo: 'soma_nao_bate', no_extrato: valor, soma: -16238, diferenca: -16238 - valor }
        : { ok: true, no_extrato: valor, soma: valor })
      : fn === 'fin_documento_registrar' ? { documento_id: 'doc-1' }
      : fn === 'fin_documento_editar' ? { documento_id: 'doc-1' }
      : fn === 'fn_candidatos_conciliacao' || fn === 'fn_conciliacao_historico_buscar' ? [] : null,
  };
  montar(<EstacaoConciliar contaBancariaId="bb" aoFechar={() => {}} aoMudar={() => {}}
    movimento={{ id: 'ext-1', data_movimento: '2026-10-05', descricao: 'COMPRA DEBITO AGROPECUARIA EXEMPLO', documento: null, valor,
      valorConciliado: 0, valorAberto: valor, situacao: 'nao_conciliado', lancamentoId: null, vinculos: 0,
      lancamentoDescricao: null, lancamentoFavorecido: null }} />);
} else if (tela === 'estacao') {
  /* P153 — a estação "Conciliar movimento do extrato" (do Palco do mês) com o "Procurar no histórico": sem candidato (o caso que abriu
     a frente), SINTÉTICO. `&v=semnome`: o banco não trouxe o nome (Bradesco "PIX ENVIADO" — D1: o campo vazio e a frase). */
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_conciliacao_historico_buscar' ? HISTORICO_ACHADOS
    : fn === 'fn_candidatos_conciliacao' ? [] : null };
  montar(<EstacaoConciliar contaBancariaId="bb" aoFechar={() => {}} aoMudar={() => {}}
    movimento={{ id: 'ext-1', data_movimento: '2031-10-05', descricao: v === 'semnome' ? 'PIX ENVIADO'
      : 'PAGAMENTO DE BOLETO - FORNECEDOR SINTÉTICO COM O NOME BEM COMPRIDO DE EXEMPLO AGROPECUÁRIA LTDA', documento: null, valor: -99999999.99,
      valorConciliado: 0, valorAberto: -99999999.99, situacao: 'nao_conciliado', lancamentoId: null, vinculos: 0,
      lancamentoDescricao: null, lancamentoFavorecido: null }} />);
} else if (tela === 'sugestoes-casar') {
  /* P159c — "Sugestões para casar" (mock `mock-sugestoes-casar-v1.html`), SINTÉTICO no pior caso: o nome da conta comprido no título, o
     histórico do banco com a moldura ("Pagamento de Boleto - NOME"), o valor no teto, a sugestão de 1, a soma de 3 com as filhas, a de
     valor diferente e a vencida de mês anterior, com textos maiores que as colunas. `&v=vazio`: nenhuma sugestão. */
  const NOME_F = 'Fornecedor Sintético com o Nome Bem Comprido de Exemplo Agropecuária Ltda';
  const cs = (id: string, venc: string, valor: number, o: Partial<CandidatoSugestao> = {}): CandidatoSugestao => ({ lancamento_id: id, valor_assinado: valor,
    data_vencimento: venc, competencia: venc.slice(0, 8) + '01', descricao: 'Bainha para Inseminação Artificial · Bovinos e Novilhas do Lote Sintético 2/3',
    fornecedor: NOME_F, favorecido_id: 'f1', status_transacao: 'programado', ja_conciliado: false, ...o });
  const SUGS: Sugestao[] = v === 'vazio' ? [] : [
    { tipo: 'mesmo_valor_nome', motivo: 'mesmo valor · nome', diasDiff: 4, vencido: false, valorDiferente: false,
      lancamentos: [cs('u1', '2031-10-09', -99999999.99)] },
    { tipo: 'soma', motivo: 'soma de 3 · fornecedores diferentes', diasDiff: 26, vencido: true, valorDiferente: false,
      lancamentos: [cs('s1', '2031-09-12', -33333333.33, { status_transacao: 'previsto' }), cs('s2', '2031-10-01', -33333333.33, { fornecedor: 'Outro Fornecedor Sintético' }),
        cs('s3', '2031-10-15', -33333333.33, { status_transacao: 'agendado' })] },
    { tipo: 'nome_valor', motivo: 'nome · valor diferente · vencido set', diasDiff: 23, vencido: true, valorDiferente: true,
      lancamentos: [cs('n1', '2031-09-12', -12345678.9)] },
  ];
  if (v === 'rural' || v === 'ruralmuitas') {
    /* CONC-SUGESTOES-TABELA-01 — o caso do Gabriel (04/11 06:36), SINTÉTICO: BB 16/10/2026, "PAGAMENTO DE BOLETO - FORNECEDOR RURAL", −1.265,22.
       As sugestões (o mesmo fornecedor com valor diferente; a soma de 2) e o histórico (em aberto e pago), com o pagamento, a fazenda e a NF
       de cada um lidos pelos ids (`lerComplementoDasLinhas`). Nomes e números inventados. */
    const FR = 'Fornecedor Rural Sintético Ltda';
    const c = (id: string, venc: string, valor: number, o: Partial<CandidatoSugestao> = {}): CandidatoSugestao => ({ lancamento_id: id, valor_assinado: valor,
      data_vencimento: venc, competencia: '2026-10-01', descricao: 'Sal mineral proteinado para recria e engorda — lote de outubro', fornecedor: FR,
      favorecido_id: 'fr', status_transacao: 'programado', ja_conciliado: false, ...o });
    const SUGS_R: Sugestao[] = [
      { tipo: 'mesmo_fornecedor', motivo: 'mesmo fornecedor · valor difere: programado 1.300,00', diasDiff: 1, vencido: false, valorDiferente: true,
        lancamentos: [c('r1', '2026-10-15', -1300)] },
      { tipo: 'soma', motivo: 'soma de 2 · 4 dias', diasDiff: 4, vencido: false, valorDiferente: false,
        lancamentos: [c('r2', '2026-10-12', -632.61, { descricao: 'Sal mineral 1/2' }), c('r3', '2026-10-20', -632.61, { descricao: 'Sal mineral 2/2', status_transacao: 'previsto' })] },
      /* `ruralmuitas` (AJUSTE 07:55): 14 sugestões a mais, com textos maiores que as colunas — a lista rola só DENTRO dela */
      ...(v === 'ruralmuitas' ? Array.from({ length: 14 }, (_, i): Sugestao => ({ tipo: 'nome_valor', motivo: `nome · valor diferente · candidato sintético ${i + 1}`,
        diasDiff: i, vencido: false, valorDiferente: true,
        lancamentos: [c(`m${i}`, `2026-10-${String(1 + i).padStart(2, '0')}`, -(1000 + i * 37.5), {
          descricao: `Lançamento sintético de nome bem comprido para medir o corte da coluna de descrição ${i + 1}`,
          fornecedor: `Fornecedor Sintético de Nome Bem Comprido Agropecuária e Comércio ${i + 1} Ltda` })] })) : []),
    ];
    const COMPL = [
      { id: 'r1', data_pagamento: null, fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.123.456' },
      { id: 'r2', data_pagamento: null, fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.123.457' },
      { id: 'r3', data_pagamento: null, fazenda_id: 'fz1', tipo_documento: null, numero_documento: null },
      { id: 'h1', data_pagamento: null, fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.123.458' },
      { id: 'h2', data_pagamento: '2026-09-16', fazenda_id: 'fz1', tipo_documento: 'Nota Fiscal', numero_documento: '000.120.001' },
    ];
    const lin = (o: Record<string, unknown>) => ({ lancamento_id: 'x', data_pagamento: null, data_vencimento: '2026-10-18', data_competencia: '2026-10-01',
      status_transacao: 'programado', conciliado: false, banco: null, descricao: 'Sal mineral proteinado', fornecedor_id: 'fr', fornecedor: FR,
      plano_conta_id: 'p1', centro: 'Nutrição', subcentro: 'Suplementação', fazenda_id: 'fz1', fazenda: 'Fazenda Exemplo Retiro', fazenda_codigo: 'RET',
      conta_bancaria_id: 'bb', conta: 'Banco do Brasil', valor: -1265.22, onde: ['fornecedor'], ...o });
    const HIST_R = { total: v === 'ruralmuitas' ? 16 : 2, resumo: null, achados: [
      ...(v === 'ruralmuitas' ? Array.from({ length: 14 }, (_, i) => lin({ lancamento_id: `hm${i}`, data_vencimento: `2026-09-${String(1 + i).padStart(2, '0')}`,
        descricao: `Histórico sintético de nome comprido para medir o corte ${i + 1}`, valor: -(900 + i * 41.3),
        ...(i % 3 === 0 ? { status_transacao: 'realizado', data_pagamento: `2026-09-${String(2 + i).padStart(2, '0')}`, conciliado: true } : {}) })) : []),
      lin({ lancamento_id: 'h1' }),
      lin({ lancamento_id: 'h2', status_transacao: 'realizado', data_pagamento: '2026-09-16', data_vencimento: '2026-09-15', data_competencia: '2026-09-01',
        valor: -1240.5, conciliado: true, banco: 'PAGAMENTO DE BOLETO - FORNECEDOR RURAL' }),
    ] };
    const EXT_R = { data: '2026-10-16', historico: 'PAGAMENTO DE BOLETO - FORNECEDOR RURAL', valor: -1265.22 };
    g.__bancoBancada = { from: (t: string) => (t === 'financeiro_lancamentos_v2' ? COMPL : t === 'fazendas' ? [{ id: 'fz1', nome: 'Fazenda Exemplo Retiro', codigo: 'RET' }] : []),
      rpc: (fn: string) => fn === 'fn_conciliacao_historico_buscar' ? HIST_R : null };
    montar(<SugestoesCasarModal open onClose={() => {}} onCasar={() => {}} onCasarSelecionados={() => {}} sugestoes={SUGS_R} clienteId="cli"
      onCriarIgual={() => {}} onCasarDoHistorico={() => {}} contaBancariaId="bb" nomeConta="Banco do Brasil" extrato={EXT_R} />);
  } else if (v === 'guariroba') {
    /* P153b — O CASO que abriu a frente, SINTÉTICO: BB 07/10, "PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA", −142,72; a sugestão nova
       ("mesmo fornecedor · valor difere: previsto 500,00", calculada pelo motor de verdade) e o histórico com os quatro casos: em aberto
       da mesma conta (Casar), em aberto de outra conta (Casar e trocar conta), pago (Criar igual) e conciliado de outra conta (o selo). */
    const AGUA: CandidatoSugestao = { lancamento_id: 'agua', valor_assinado: -500, data_vencimento: '2031-10-09', competencia: '2031-10-01',
      descricao: 'Agua e Esgoto - Escritorio', fornecedor: 'Aguas Guariroba SA', favorecido_id: 'gua', status_transacao: 'previsto', ja_conciliado: false };
    const EXT = { data: '2031-10-07', historico: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA', valor: -142.72 };
    const lin = (o: Record<string, unknown>) => ({ lancamento_id: 'x', data_pagamento: null, data_vencimento: '2031-10-09', data_competencia: '2031-10-01',
      status_transacao: 'previsto', conciliado: false, banco: null, descricao: 'Agua e Esgoto - Escritorio', fornecedor_id: 'gua',
      fornecedor: 'Aguas Guariroba SA', plano_conta_id: 'p1', centro: 'Administração', subcentro: 'Água e Esgoto', fazenda_id: 'fz1',
      fazenda: 'Administrativo', fazenda_codigo: 'ADM', conta_bancaria_id: 'bb', conta: 'Banco do Brasil', valor: -500, onde: ['fornecedor'], ...o });
    const HIST = { total: 4, resumo: null, achados: [
      lin({ lancamento_id: 'g1' }),
      lin({ lancamento_id: 'g2', data_vencimento: '2031-10-10', conta_bancaria_id: 'itau', conta: 'Itaú Personalité', descricao: 'Agua e Esgoto - Sede' }),
      lin({ lancamento_id: 'g3', status_transacao: 'realizado', data_pagamento: '2031-09-08', data_vencimento: '2031-09-09', data_competencia: '2031-09-01',
        valor: -136.53, conciliado: true, banco: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA' }),
      lin({ lancamento_id: 'g4', status_transacao: 'realizado', data_pagamento: '2031-08-08', data_vencimento: '2031-08-09', data_competencia: '2031-08-01',
        conta_bancaria_id: 'itau', conta: 'Itaú Personalité', valor: -98.1, conciliado: true }),
    ] };
    g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_conciliacao_historico_buscar' ? HIST : null };
    montar(<SugestoesCasarModal open onClose={() => {}} onCasar={() => {}} sugestoes={sugerirCasamentos(EXT, [AGUA])} clienteId="cli"
      onCriarIgual={() => {}} onCasarDoHistorico={() => {}} contaBancariaId="bb" nomeConta="Banco do Brasil" extrato={EXT} />);
  } else {
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_conciliacao_historico_buscar' ? HISTORICO_ACHADOS : null };
  montar(<SugestoesCasarModal open onClose={() => {}} onCasar={() => {}} sugestoes={SUGS} clienteId="cli" onCriarIgual={() => {}}
    onCasarDoHistorico={() => {}} contaBancariaId="bb"
    nomeConta="Banco Exemplo com o Nome Comprido · Conta Movimento Agrícola 0000-0 / 00000-0 Sintética"
    extrato={{ data: '2031-10-05', historico: `PAGAMENTO DE BOLETO - ${NOME_F.toUpperCase()}`, valor: -99999999.99 }} />);
  }
} else if (tela === 'casar-1x1') {
  /* UI-SEM-CORTE-02 — o Casar com o banco 1:1 (o rendimento de R$ 0,01 da Vera, sintetico): o banco simulado diz que nao fecha. */
  if (v === 'pos') {
    /* FIN-POS-FIXADO-01b — a parcela 2 de um contrato pós-fixado (sintética): principal + juros estimado levados, o dono diz o juro real. */
    g.__bancoBancada = {
      from: (t: string) => t === 'financiamento_parcelas' ? [{ id: 'p2', lancamento_id: 'yp' }] : [],
      rpc: (fn: string) => fn === 'fn_juros_estimados_do_cliente' ? [{ lancamento_id: 'yj', financiamento_id: 'f', parcela_id: 'p2' }]
        : fn === 'fn_financiamento_parcela_pos_pagar' ? { ok: true, simulado: true, no_extrato: -99999999.99, soma: -99999999.99,
          parcela: { id: 'p2', numero: 2, principal_id: 'yp', juros_id: 'yj', principal: 88888888.88, juros_estimado: 9999999.99, encargos: 0, juro_real: 11111111.11 } }
        : null };
    montar(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco Exemplo Personalité" clienteId="cli"
      extrato={{ extrato_id: 'x1', data: '2027-08-15', historico: 'DEBITO PARCELA CREDITO RURAL · CONTRATO SINTETICO 0.000.000 · PARCELA 2/5', valor: -99999999.99 }}
      iniciais={[{ lancamento_id: 'yp', descricao: 'Amortização 2/5 · 0.000.000 · Custeio Pecuário Sintético', fornecedor: 'Banco Exemplo', valor_assinado: -88888888.88, data_vencimento: '2027-08-15', status_transacao: 'programado' },
        { lancamento_id: 'yj', descricao: 'Juros 2/5 · 0.000.000 · Custeio Pecuário Sintético', fornecedor: 'Banco Exemplo', valor_assinado: -9999999.99, data_vencimento: '2027-08-15', status_transacao: 'programado' }]}
      onConciliado={() => {}} />);
  } else if (v === 'trocar') {
    /* P153b (D3) — "Casar e trocar a conta": o em aberto de outra conta levado do histórico, com a confirmação curta (valores no teto) */
    g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_espelho_casar' ? { ok: true, simulado: true, no_extrato: -99999999.99, soma: -99999999.99,
      trocas_conta: [{ lancamento_id: 'yt', de_id: 'itau', de: 'Banco Exemplo Itaú Personalité · Conta Movimento Sintética', para_id: 'bb', para: 'Banco Exemplo Personalité' }] } : null };
    montar(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco Exemplo Personalité"
      extrato={{ extrato_id: 'x1', data: '2031-10-07', historico: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA · CONTA SINTÉTICA DO ESCRITÓRIO', valor: -99999999.99 }}
      iniciais={[{ lancamento_id: 'yt', descricao: 'Agua e Esgoto - Escritorio da Sede Administrativa', fornecedor: 'Aguas Guariroba SA', valor_assinado: -88888888.88,
        usarValorDoBanco: true, data_vencimento: '2031-10-09', status_transacao: 'previsto',
        trocarConta: { de: 'Banco Exemplo Itaú Personalité · Conta Movimento Sintética', para: 'Banco Exemplo Personalité' } }]}
      onConciliado={() => {}} />);
  } else if (v === 'certo') {
    /* CONC-VALOR-CERTO-ACEITA-01 — valor certo com extrato maior: a pergunta do banco no rodapé e o "Ligar com o valor do extrato" (valores no teto). */
    g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_espelho_casar' ? { ok: true, simulado: true, no_extrato: -99999999.99, soma: -99999999.99,
      pergunta: { lancamento_id: 'yc', valor_extrato: 99999999.99, valor_previsto: 88888888.88,
        frase: 'Este mês veio R$ 99.999.999,99 (previsto R$ 88.888.888,88). Ligar com o valor do extrato?' } } : null };
    montar(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco Exemplo Personalité"
      extrato={{ extrato_id: 'x1', data: '2027-08-15', historico: 'PAGAMENTO BOLETO · ALUGUEL SINTETICO DA SEDE · IMOBILIARIA EXEMPLO LTDA', valor: -99999999.99 }}
      iniciais={[{ lancamento_id: 'yc', descricao: 'Aluguel da sede · agosto', fornecedor: 'Imobiliária Exemplo', valor_assinado: -99999999.99, data_vencimento: '2027-08-15', status_transacao: 'programado' }]}
      onConciliado={() => {}} />);
  } else {
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_espelho_casar' ? { ok: false, motivo: 'soma_nao_bate', no_extrato: 0.01, soma: 0, diferenca: -0.01 } : null };
  montar(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco Exemplo Personalité"
    extrato={{ extrato_id: 'x1', data: '2025-06-30', historico: 'REND PAGO APLIC AUT MAIS · RENDIMENTO SINTETICO DA APLICACAO AUTOMATICA', valor: 0.01 }}
    iniciais={v === 'levado' ? [{ lancamento_id: 'y1', descricao: 'Rendimento de aplicação · junho', fornecedor: 'Banco Exemplo', valor_assinado: 0.01, data_vencimento: '2025-06-30', status_transacao: 'programado' }] : []}
    onConciliado={() => {}} />);
  }
} else if (tela === 'criar-transferencia') {
  /* P139 — "Criar transferência" pela linha do extrato (e o lote). SINTETICO, valores no teto e historicos longos. A resposta da porta
     (`fn_transferencia_do_extrato` com p_simular) no formato do banco: v=espelho (um, escolhido), v=empate (dois a 1 dia), v=gemea (o aviso
     com "Criar mesmo assim"/"Ignorar como duplicada"), v=existente (casar com a ja' lancada), v=lote (o lote com 6 linhas). */
  const CONTAS_T = [
    { id: 'cc', nome_conta: 'Conta Movimento', nome_exibicao: 'Banco Exemplo Cooperativo de Crédito Rural · Conta Movimento', banco: 'Exemplo', agencia: null, numero_conta: null, tipo_conta: 'cc' },
    { id: 'inv', nome_conta: 'Invest', nome_exibicao: 'Banco Exemplo · Investimento Fácil Automático', banco: 'Exemplo', agencia: null, numero_conta: null, tipo_conta: 'inv' },
    { id: 'cb', nome_conta: 'Outra', nome_exibicao: 'Outro Banco Sintético · Conta Corrente PJ', banco: 'Outro', agencia: null, numero_conta: null, tipo_conta: 'cc' },
  ];
  const HIST = 'RESG AUTOMATICO INVESTIMENTO FACIL · APLICACAO SINTETICA DE EXEMPLO · CONTRATO 0000000';
  const esp = (id: string, data: string, dist: number) => ({ id, data, descricao: 'APLICACAO AUTOMATICA INVEST FACIL · MOVIMENTO SINTETICO DE EXEMPLO', valor: '-99999999.99', distancia: dist });
  const base = { ok: true, simulado: true, acao: 'criar', extrato_id: 'e1', valor: '99999999.99', data: '2027-08-15', origem: 'inv', destino: 'cc',
    espelhos: [esp('m1', '2027-08-17', 2)], espelho_id: 'm1', gemeas: [], existente: null };
  const sim = v === 'empate' ? { ...base, espelho_id: null, espelhos: [esp('m1', '2027-08-14', 1), esp('m2', '2027-08-16', 1)] }
    : v === 'gemea' ? { ...base, gemeas: [{ id: 'g1', descricao: 'Resg/vencto Cdb · historico da outra importacao', data: '2027-08-15', valor: '99999999.99' }] }
    : v === 'existente' ? { ...base, acao: 'casar_existente', espelhos: [], espelho_id: null,
      existente: { id: 'l4', descricao: 'Transferência entre contas · lançada antes, sem vínculo', data: '2027-08-15', meia_ponta: true } }
    : base;
  g.__bancoBancada = {
    from: (t: string) => t === 'financeiro_contas_bancarias' ? CONTAS_T : [],
    rpc: (fn: string, a: any) => fn === 'fn_transferencia_do_extrato' ? sim
      : fn === 'fn_transferencias_do_extrato_lote' ? { ok: true, simulado: true, transferencias: a.p_itens.length, espelhos: 3,
        itens: a.p_itens.map((it: any, i: number) => ({ ...base, extrato_id: it.extrato_id, acao: it.outra_conta ? (i === 4 ? 'casar_existente' : 'criar') : 'escolher_conta',
          espelho_id: i % 2 === 0 ? 'm1' : null, gemeas: i === 3 ? sim.gemeas.length ? sim.gemeas : [{ id: 'g1', descricao: 'x', data: '2027-08-15' }] : [],
          existente: i === 4 ? { id: 'l4', descricao: 'lançada', data: '2027-08-15', meia_ponta: false } : null })) }
      : null,
  };
  const MOV = { extrato_id: 'e1', data: '2027-08-15', historico: HIST, valor: 99999999.99, conta_id: 'cc' };
  const SUG: SugestaoDeTransferencia = { extratoId: 'e1', contaSugerida: 'inv', contaNome: 'Banco Exemplo · Investimento Fácil Automático', motivo: 'aplicacao_automatica', candidatas: 1 };
  if (v === 'lote') {
    const movs = Array.from({ length: 6 }, (_, i) => ({ extrato_id: `e${i + 1}`, data: `2027-08-${String(10 + i).padStart(2, '0')}`, historico: `${HIST} · ${i + 1}`,
      valor: i % 2 ? -99999999.99 : 99999999.99, conta_id: 'cc' }));
    montar(<CriarTransferenciasLoteDialog aberto clienteId="cli" movimentos={movs}
      sugestoes={new Map([['e1', SUG], ['e2', { ...SUG, extratoId: 'e2', contaSugerida: 'cb' }], ['e4', { ...SUG, extratoId: 'e4' }], ['e5', { ...SUG, extratoId: 'e5', contaSugerida: 'cb' }]])}
      onFechar={() => {}} onGravado={() => {}} />);
  } else {
    montar(<CriarTransferenciaDialog aberto clienteId="cli" movimento={MOV} sugestao={SUG} onFechar={() => {}} onGravado={() => {}} onIgnorarDuplicada={() => {}} />);
  }
} else if (tela === 'fora-da-vigencia') {
  /* P154 — a prévia dos previstos FORA da vigência (a regra encurtada ou cancelada), com dado SINTÉTICO no pior caso: 12 previstos (um
     com o "valor do mês"), os que não se mexem (programado, conciliado, mês fechado), valores no teto. `&v=cancelar` (o cancelar da lista),
     `&v=vazia` (nada a cancelar), `&v=carregando`, `&v=erro` (a recusa do banco no rodapé). */
  const mes = (k: number) => { const d = new Date(2031, 8 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const venc = (k: number) => { const d = new Date(2031, 9 + k, 5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`; };
  const cancela = Array.from({ length: 12 }, (_, k) => ({ id: `c${k}`, competencia: mes(k), vencimento: venc(k), valor: '99999999.99',
    status: 'previsto', valor_do_mes: k === 3 }));
  const naoMexe = [
    { id: 'n1', competencia: mes(-1), vencimento: venc(-1), valor: '99999999.99', status: 'programado', valor_do_mes: false, motivo: 'programado: só à mão' },
    { id: 'n2', competencia: mes(-2), vencimento: venc(-2), valor: '99999999.99', status: 'conciliado', valor_do_mes: false, motivo: 'conciliado: só à mão' },
    { id: 'n3', competencia: mes(12), vencimento: venc(12), valor: '99999999.99', status: 'previsto', valor_do_mes: false, motivo: 'mês fechado' },
  ];
  const vazia = v === 'vazia';
  const resposta = { ok: true, simulado: true, modo: v === 'cancelar' || vazia ? 'cancelada' : 'encurtada', corte: v === 'cancelar' || vazia ? '2031-09' : null,
    qtde: vazia ? 0 : 12, soma: vazia ? '0' : '1199999999.88', regra_cancelada: false, cancela: vazia ? [] : cancela, nao_mexe: vazia ? [] : naoMexe };
  montar(<ForaDaVigenciaDialog modo={v === 'cancelar' || vazia ? 'cancelar' : 'encurtada'}
    descricao="Folha de Pagamento · Colaborador Sintético com o Nome Bem Comprido de Exemplo · Fazenda Exemplo"
    previa={v === 'carregando' ? null : lerForaDaVigencia(resposta)} carregando={v === 'carregando'}
    erro={v === 'erro' ? 'Os lançamentos mudaram durante a gravação (11 de 12). Nada foi gravado.' : null}
    aoConfirmar={async () => {}} aoFechar={() => {}} />);
} else if (tela === 'palco-do-mes') {
  /* P124 (CONC-LOTE-SUGESTOES-01) — a Conciliação do mês com o lote: 30 movimentos SINTÉTICOS no pior caso (descrições longas, valores
     no teto), as sugestões do motor simulado (exata, a conferir com e sem empate, sem sugestão) e 4 já conciliados. O gate clica
     "Buscar sugestões do mês"; `&v=recusa` faz o gravador recusar um par. */
  const desc = (i: number) => `PIX - ENVIADO - ${String(2 + (i % 27)).padStart(2, '0')}/10 11:${String(10 + i).padStart(2, '0')} COLABORADOR SINTÉTICO COM O NOME BEM COMPRIDO ${i}`;
  const MOVS = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, data_movimento: `2031-10-${String(1 + (i % 28)).padStart(2, '0')}`,
    descricao: desc(i), documento: null, valor: i === 0 ? -99999999.99 : i === 7 ? 99999999.99 : -(1000 + i * 37.11) }));
  const conciliados = new Set(['m3', 'm9', 'm15', 'm21']);
  const cand = (i: number, o: Record<string, unknown> = {}) => ({ id: `l${i}`, descricao: `Folha de Pagamento · Lançamento Sintético com Descrição Longa ${i}`,
    favorecido: `Fornecedor Sintético de Nome Muito Comprido ${i} Ltda`, numero_documento: null, data_referencia: '2031-10-05', vencimento: '2031-10-05',
    valor: String(Math.abs(MOVS[i].valor)), status: i % 3 === 0 ? 'programado' : 'previsto', ja_conciliado: '0', saldo: String(Math.abs(MOVS[i].valor)),
    delta_valor: '0', delta_dias: 3, score: 90, pre_marcado: true, ambiguo: false, indisponivel: false, ...o });
  g.__bancoBancada = {
    from: (t: string) => t === 'extrato_bancario_v2' ? MOVS
      : t === 'conciliacao_bancaria_itens' ? [...conciliados].map((id) => ({ extrato_id: id, valor_aplicado: Math.abs(MOVS[Number(id.slice(1))].valor),
          lancamento_id: `v-${id}`, financeiro_lancamentos_v2: { descricao: 'Tarifa Pacote de Serviços com Descrição Longa', financeiro_fornecedores: { nome: 'Banco Exemplo S.A.' } } }))
      : [],
    rpc: (fn: string, a: any) => {
      if (fn === 'fn_candidatos_conciliacao') {
        const i = Number(String(a.p_extrato_id).slice(1));
        return i % 5 === 1 ? [] : i % 5 === 2 ? [cand(i, { pre_marcado: false, score: 70, delta_valor: '-99999.99', delta_dias: 61 })]
          : i % 5 === 3 ? [cand(i, { pre_marcado: false, ambiguo: true, score: 90 })] : [cand(i)];
      }
      if (fn === 'fn_vincular_extrato_lancamento') return v === 'recusa' ? { __erro: 'sobre_aplicacao: valor excede o aberto do movimento' } : { ok: true };
      return null;
    },
  };
  montar(<PalcoDoMes clienteId="cli" contaId="bb" contaNome="Banco Exemplo com o Nome Comprido · Conta Movimento" ano={2031} mes={10} aoFechar={() => {}} />);
} else if (tela === 'conciliacao' || tela === 'extrato-do-sistema') {
  /* P141 (CONC-LAYOUT-01) — a aba Conciliação (Saldos | Resumo | Status) e o "Extrato do sistema" do ↗, com as linhas do DONO no pior
     caso (`dados/conciliacao.ts`, SINTÉTICO). `&v=sem`: os mesmos números sem nenhum OFX/PDF (o deslocamento compara as duas páginas).
     `&v=carregando`: o modal antes de o dono responder. P166: `&v=ok|pendencia|pendente` a faixa do status nos outros casos e
     `&v=nj` os nomes no tamanho real (`dados/conciliacao.ts`). */
  const semArquivos = v === 'sem';
  g.__bancoBancada = {
    from: (t: string) => t === 'financeiro_contas_bancarias' ? (v === 'nj' ? CONC.CONTAS_TAMANHO_REAL : CONC.CONTAS)
      : t === 'financeiro_importacoes_v2' ? (semArquivos ? [] : CONC.IMPORTACOES)
      : t === 'financeiro_saldo_documentos' ? (semArquivos ? [] : CONC.DOCUMENTOS) : [],
    rpc: (fn: string, a: any) => fn === 'fn_conciliacao_resumo_mes'
      ? (v === 'carregando' ? new Promise(() => {}) : CONC.resumoDoMes(a.p_conta_ids ?? null, v))
      : fn === 'fn_conciliacao_status_ano' ? [{ ano_mes: '2031-09', nivel: 'total', status: 'nao_conciliado', motivos: [], avisos: [] }]
      /* P159a — o Espelho da conta escolhida (`dados/espelho.ts`): o Casar lançamentos (Extrato, Sistema, Evolução) e a Conferência */
      : fn === 'fn_extratos_espelhados' ? ESP.espelho(v) : null,
  };
  g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  /* P159b — montada COMO NO APP (`V2Index`, seção do app-shell: coluna flex que dá a altura até a lista). Num bloco solto quem rolava era
     a moldura da bancada, e o cabeçalho da Evolução "não ficava preso" só aqui. */
  if (tela === 'conciliacao') montar(<div className="flex h-full min-h-0 w-full min-w-0 flex-col"><ConciliacaoBancariaTab initialAno="2031" initialMes="09" /></div>);
  else montar(<ExtratoDoSistemaDialog aberto clienteId="cli" contaId="cc1" contaNome={CONC.CONTAS[0].nome_conta} anoMes="2031-09" onFechar={() => {}} />);
} else if (tela === 'conciliar') {
  /* CONC-SEM-TRAVA-01 (tela) — o modal "Conciliar" no formato da resposta de `fn_conc_simular_diferenca` provada no caso real (OC
     0731374f, Banco do Brasil), com NOMES SINTETICOS: v=sobra (Pix 30/06 R$ 375.000 x Receb. 1/3), v=falta (Pix 30/07 R$ 290.000 x
     Receb. 2/3), v=igual, e v=teto (valores no teto, descricoes longas, 5 lancamentos levados -> "+2"). */
  const COMPRADOR = 'PIX RECEBIDO · COMPRADOR SINTETICO EXEMPLO DA SILVA AGROPECUARIA LTDA';
  const teto = v === 'teto';
  const ext = v === 'falta' ? [{ id: 'e2', data: '2026-07-30', descricao: COMPRADOR, valor: 290000 }]
    : [{ id: 'e1', data: '2026-06-30', descricao: COMPRADOR, valor: teto ? 99999999.99 : 375000 }];
  const lan = v === 'falta' ? [{ id: 'r2', data: '2026-07-30', descricao: 'Venda 118 Vacas - 2/3', valor: 375000, parcela: '2/3' }]
    : v === 'igual' ? [{ id: 'r1', data: '2026-06-30', descricao: 'Venda 118 Vacas - 1/3', valor: 375000, parcela: '1/3' }]
    : teto ? Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, data: '2026-06-30',
        descricao: `Venda de 150 Novilhas e Vacas de Descarte com Nome Muito Comprido · Recebimento ${i + 1}/9`, valor: 11111111.11, parcela: `${i + 1}/9` }))
    : [{ id: 'r1', data: '2026-06-30', descricao: 'Venda 118 Vacas - 1/3', valor: 215000, parcela: '1/3' }];
  const somaE = ext.reduce((x, e) => x + e.valor, 0); const somaL = lan.reduce((x, l) => x + l.valor, 0);
  const dif = Math.round((somaE - somaL) * 100) / 100;
  const brlB = (n: number) => `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const resposta = v === 'igual'
    ? { ok: true, sentido: 'igual', soma_extratos: somaE, soma_lancamentos: somaL, diferenca: 0, frase: 'Confere com o banco.', opcoes: [] }
    : v === 'falta'
    ? { ok: true, sentido: 'a_menos', soma_extratos: somaE, soma_lancamentos: somaL, diferenca: dif, data_extrato: '2026-07-30', ocs: [{ operacao_id: 'oc' }],
        frase: `O banco tem ${brlB(somaE)} e os lançamentos ${brlB(somaL)}. Escolha o que fazer com a falta.`,
        opcoes: [
          { codigo: 'juntar_extrato', frase: `Juntar outro movimento do banco de ${brlB(dif)}, do mesmo comprador.`, sugestoes: [
            { extrato_id: 'p85', descricao: COMPRADOR, data: '2026-07-30', valor: 85000, fecha_exato: true, mesmo_favorecido: true },
            { extrato_id: 'p50', descricao: COMPRADOR, data: '2026-07-28', valor: 50000, fecha_exato: false, mesmo_favorecido: true }] },
          { codigo: 'ligar_com_falta', frase: `Ligar o que entrou e deixar ${brlB(dif)} em aberto no Receb. 2/3.`, previa: { recebido: 290000, em_aberto: 85000, vencimento: '2026-07-30' } },
          { codigo: 'desconto_na_oc', frase: `Lançar ${brlB(dif)} de desconto ou abatimento na operação comercial.`, previa: { desconto: 85000, lancamento: 'Venda 118 Vacas - 2/3', recebido: 290000 } },
        ] }
    : { ok: true, sentido: 'a_mais', soma_extratos: somaE, soma_lancamentos: somaL, diferenca: dif, data_extrato: '2026-06-30', ocs: [{ operacao_id: 'oc' }],
        frase: `O banco tem ${brlB(somaE)} e os lançamentos ${brlB(somaL)}. Escolha o destino da sobra.`,
        opcoes: [
          { codigo: 'acrescentar_lancamento', frase: `Acrescentar o lançamento que falta (${brlB(dif)}).`, sugestoes: [
            { lancamento_id: 'r3', descricao: teto ? 'Venda de 150 Novilhas e Vacas de Descarte com Nome Muito Comprido · Recebimento 9/9' : 'Venda 150 Novilhas/Vacas · Recebimento', data: '2026-06-30', valor: dif, parcela: teto ? '9/9' : '3/3', fecha_exato: true },
            { lancamento_id: 'r4', descricao: 'Venda 40 Bezerros · Recebimento', data: '2026-07-15', valor: 98000, parcela: '1/2', fecha_exato: false },
            { lancamento_id: 'r5', descricao: 'Venda 12 Touros · Recebimento', data: '2026-08-01', valor: 61000, parcela: null, fecha_exato: false }] },
          { codigo: 'sobra_na_oc', frase: `Lançar a sobra de ${brlB(dif)} na conta corrente da operação comercial.`, previa: { operacao_id: 'oc', valor: dif, saldo_depois: teto ? -99999999.99 : -590000 } },
          { codigo: 'criar_diferenca', frase: `Criar o lançamento da diferença de ${brlB(dif)}.`, previa: { valor: dif, data: '2026-06-30', subcentro: 'Venda de Fêmeas Adultas', favorecido_origem: 'extrato' } },
        ] };
  const api = { simular: async () => lerSimulacao(resposta), executar: async () => null,
    buscar: async () => [{ id: 'b1', descricao: 'Venda 150 Novilhas/Vacas · Recebimento', data: '2026-06-30', valor: 160000, parcela: '3/3', fechaExato: true }] };
  montar(<ConciliarDiferencaModal open onClose={() => {}} extratos={ext} lancamentos={lan} onConciliado={() => {}} api={api as any} />);
} else if (tela === 'nota-pdf') {
  /* FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado). O PDF e' SINTETICO: desenhado pelo jspdf a partir do DANFE
     sintetico (as posicoes do real, dados de teste) e LIDO pelo caminho de verdade (`lerNota` -> pdfjs -> `notaDoDanfe`).
     `v=` ''        nao cadastrado, sem subcentro (o "Falta:")  ·  `cadastrado` fornecedor achado + a sugestao do subcentro + "Atualizar este"
         `registrada` a mesma nota ja' no cliente (barrada)       ·  `diverge` a chave nao confere com o numero
         `longo`     o pior caso: razao social e produtos de 120 caracteres, 12 parcelas e 14 itens (as tabelas rolam dentro do quadro)
         FIN-NOTA-PDF-01b: `lavoura` subcentro de lavoura sugerido (Safra e Cultura do ultimo lancamento)  ·  `semdup` a nota SEM duplicata
         (o molde do caso de 21/10: "Criar lancamento", vencimento = emissao em ambar)  ·  `parcelar` a confirmacao do "Atualizar e parcelar" */
  const montarNotaPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const { PAGINAS_DANFE_SINTETICO, danfeSinteticoSemDuplicata, danfeSinteticoAvulsa } = await import('@/lib/financeiro/nfe/__fixtures__/danfeSintetico');
    const { lerNota } = await import('@/lib/financeiro/nfe/lerNota');
    const { NotaFiscalDialog } = await import('@/components/financeiro-v2/NotaFiscalDialog');
    const { arquivoPdfDaNota } = await import('@/components/financeiro-v2/NovoDeXmlDialog');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [841.89, 595.28] });
    /* P95 — `pelachave`: o PDF ESCANEADO (so' imagem, nenhum texto) seguido pela chave digitada (sintetica): a previa com o chip e a
       emissao e o valor em ambar; `irmas`: a nota sem duplicata achada em 4 parcelas soltas ("… - k/4"), a frase com soma e diferenca */
    if (v === 'pelachave') { doc.setFillColor(214, 211, 204); doc.rect(40, 40, 760, 515, 'F'); }
    else for (const it of (v === 'semdup' || v === 'emparcela' || v === 'irmas' || v === 'gulart' || v === 'gulartlongo' || v === 'm2' || v === 'previsto' ? danfeSinteticoSemDuplicata() : v === 'avulsa' ? danfeSinteticoAvulsa() : PAGINAS_DANFE_SINTETICO)[0]) {
      const str = v === 'diverge' && it.str === 'Nº 000.000.937' ? 'Nº 000.000.938' : it.str;
      doc.setFontSize(Math.max(4, it.h * 1.15));
      doc.text(str, it.x, 595.28 - it.y);
    }
    const bytes: ArrayBuffer = doc.output('arraybuffer');
    let lido: any;
    if (v === 'pelachave') {
      const { notaDaChaveDigitada, lidoDaChave } = await import('@/lib/financeiro/nfe/chaveDigitada');
      const r = notaDaChaveDigitada('5026 0911 2223 3300 0424 5501 0000 0009 3712 1753 8298');
      if (r.ok === false) { raiz.render(<div>{r.frase}</div>); return; }
      lido = lidoDaChave(r.nota, [{ largura: 841.89, altura: 595.28 }]);
    } else lido = await lerNota(bytes);
    if (!lido.ok) { raiz.render(<div>{lido.frase}</div>); return; }
    if (v === 'gulartlongo') {
      lido.nota.emitente.nome = 'COOPERATIVA AGROINDUSTRIAL SINTETICA DOS PRODUTORES RURAIS DO CENTRO OESTE LTDA';
      lido.nota.emitente.endereco = { ...(lido.nota.emitente.endereco ?? {}), logradouro: 'RODOVIA BR SINTETICA 163 KM 512 SAIDA PARA O DISTRITO INDUSTRIAL', municipio: 'SAO GABRIEL DO OESTE SINTETICO', uf: 'MS' };
    }
    if (v === 'longo') {
      const NOME = 'COOPERATIVA AGROINDUSTRIAL SINTETICA DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA';
      lido.nota.emitente.nome = NOME;
      lido.nota.itens = Array.from({ length: 14 }, (_, i) => ({ descricao: `PRODUTO SINTETICO DE NOME COMPRIDO ${i + 1} PARA MEDIR O CORTE DA COLUNA DE PRODUTO DA TABELA`,
        quantidade: '1234.0000', unidade: 'UN', valorCent: 99999999, unitarioCent: 8103, detalhe: 'Lote: 000/00 D.Val: 01/01/30' }));
      lido.nota.duplicatas = Array.from({ length: 12 }, (_, i) => ({ numero: String(i + 1).padStart(3, '0'), vencimento: `20${27 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}-20`, valorCent: 99999999 }));
      lido.nota.somaDuplicatasCent = 99999999 * 12;
      lido.nota.totais = { ...lido.nota.totais, notaCent: 99999999 * 12, descontoCent: 99999999 };
    }
    const forn = { id: 'agro-s', nome: v === 'gulartlongo' ? 'Cooperativa Agroindustrial Sintetica dos Produtores Rurais do Centro Oeste Ltda' : 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null } as any;
    const fornecedores = ['cadastrado', 'registrada', 'lavoura', 'semdup', 'parcelar', 'emparcela', 'pelachave', 'irmas', 'lr', 'lr2', 'gulart', 'gulartlongo', 'm2', 'avista'].includes(v) ? [forn] : [];
    const resolucao = resolverEmitente(lido.nota.emitente, fornecedores, null);
    const ultima = v === 'cadastrado' || v === 'parcelar' ? { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' }
      : v === 'lavoura' ? { plano_conta_id: 'pl-lav', subcentro: 'Insumos Lavoura — Defensivos e Fertilizantes', macro_custo: 'Custeio Produtivo', grupo_custo: 'Custeio Lavoura', centro_custo: 'Insumos', escopo_negocio: 'agricultura', data: '2026-08-14', safra_id: 's-soja', cultura: 'soja' }
      : null;
    const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao,
      favorecidoId: resolucao.propostoId, ultima });
    const arquivo = arquivoPdfDaNota(bytes, '000.000.937.pdf');
    const ocorrencias = v === 'registrada' ? [{ origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l9', operacaoId: null, operacaoTipo: null, numero: '000.000.937',
      descricao: 'NF 937 · compra registrada antes', data: '2026-09-15', valor: 1966.56 }] : [];
    const CANCELADOS_DA_NOTA = ['programado', 'agendado'].map((st, i) => ({ id: `jl-canc-${i}`, vencimento: `2026-0${8 + i}-10`, pagamento: null,
      competencia: '2026-08-10', descricao: `Lançamento antigo desta nota, cancelado antes de refazer pelo Novo lançamento — descrição comprida ${i + 1}`,
      valor_cent: i ? 49164 : 196656, status: st, conciliado: false, financiamento_id: null, numero_documento: i ? 'NF_000.000.937' : '937',
      fornecedor_id: 'sem-cnpj', fornecedor_nome: 'Cooperativa Agroindustrial Sintetica dos Produtores Rurais de Exemplo SA', fornecedor_por: 'nome',
      parcelas: [], por: ['numero', 'chave'], cancelado: true }));
    g.__bancoBancada = {
      from: (t: string) => {
        if (t === 'financeiro_fornecedores') return [{ nome_fantasia: null, inscricao_estadual: null, tipo_pessoa: 'PJ', logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, uf: null, cep: null, telefone: null }];
        /* P96a — `v=irmas`: a 4/4 com a NF DIGITADA À MÃO (valor da parcela, emissão do vencimento) — a faixa "Usar a nota lida". SINTÉTICA. */
        if (t === 'financeiro_lancamento_documentos' && v === 'irmas') return [{ id: 'doc-irma-3', lancamento_id: 'jl-irma-3', versao: 2, especie: 'nf',
          numero: '3241', chave_acesso: null, valor_documento: 2395.74, data_emissao: '2027-01-10' }];
        /* Gabriel 29/10 10:38 — "No sistema hoje": a fazenda, o subcentro e o fornecedor de cada achado (SINTÉTICOS; o mesmo para todos os ids da bancada) */
        if (t === 'financeiro_lancamentos_v2' && v === 'm2') return ['jl-m20', 'jl-m21', 'jl-m22'].map((id, i) => ({ id, fazenda_id: 'f-pur',
          subcentro: 'Manutenção de Máquinas Agrícolas', favorecido_id: 'agro-s', plano_conta_id: 'pl-lav', safra_id: i === 2 ? 's-soja-25' : 's-soja' }));
        if (t === 'financeiro_lancamentos_v2' && ['jalancada', 'cancelados', 'emparcela', 'irmas', 'diferenca', 'lr', 'lr2', 'gulart', 'gulartlongo', 'avista', 'previsto'].includes(v)) return ['jl-prev', 'jl-0', 'jl-1', 'jl-2', 'jl-irma', 'jl-d0', 'jl-d1', 'jl-d2', 'jl-d3', 'jl-d4',
          'jl-irma-0', 'jl-irma-1', 'jl-irma-2', 'jl-irma-3', 'jl-p1', 'jl-lr0', 'jl-lr1', 'jl-lr2', 'jl-lr3', 'jl-g1', 'jl-av']
          .map((id) => ({ id, fazenda_id: 'f-pur', subcentro: 'Sanidade Animal — Vacinas e Medicamentos Veterinários', favorecido_id: 'agro-s', plano_conta_id: 'pl-vet' }));
        if (t === 'financeiro_lancamentos_v2' && (v === 'cadastrado' || v === 'parcelar')) return [{ id: 'l-ext', data_vencimento: '2026-10-20', data_competencia: '2026-10-20',
          descricao: 'PAGTO BOLETO AGRO SINTETICA INSUMOS — lançamento criado do extrato bancário com histórico comprido', valor: 491.64, financiamento_id: null, numero_documento: null }];
        return [];
      },
      /* NOTA-JA-LANCADA-01 — `v=jalancada`: 3 das 4 parcelas ja' lancadas (2 pagas, 1 programada, conciliada uma) num cadastro SEM CNPJ
         de nome comprido; a serie-irma de 1 centavo a mais; a 4a falta. Dados SINTETICOS. */
      rpc: (fn: string, a?: any) => fn === 'fn_nota_ja_lancada' && (v === 'jalancada' || v === 'cancelados') ? [
        /* NOTA-CONTAS-NA-CRIACAO-01 D — `v=cancelados`: os mesmos, e mais 2 CANCELADOS desta nota no fim (selo cinza) */
        ...(v === 'cancelados' ? CANCELADOS_DA_NOTA : []),
        ...[['2026-10-20', 'realizado'], ['2026-11-20', 'realizado'], ['2026-12-20', 'programado']].map(([venc, st], i) => ({
          id: `jl-${i}`, vencimento: venc, pagamento: st === 'realizado' ? venc : null, competencia: '2026-09-15',
          descricao: `Medicamentos Bovinos Sinteticos com descricao bem comprida para o pior caso ${i + 1}/4`, valor_cent: 49164, status: st,
          conciliado: i === 0, financiamento_id: 'fin-x', numero_documento: null, fornecedor_id: 'sem-cnpj',
          fornecedor_nome: 'Cooperativa Agroindustrial Sintetica dos Produtores Rurais de Exemplo SA', fornecedor_por: 'nome',
          parcelas: [{ n: i + 1, dif_cent: 0, dif_dias: 0 }], por: ['valor'] })),
        { id: 'jl-irma', vencimento: '2026-10-20', valor_cent: 49165, status: 'realizado', conciliado: true, fornecedor_id: 'sem-cnpj',
          fornecedor_nome: 'Cooperativa Sintetica', fornecedor_por: 'nome', parcelas: [{ n: 1, dif_cent: 1, dif_dias: 0 }], por: ['valor'] },
      ]
        /* NOTA-CONTAS-NA-CRIACAO-01 C — `v=emparcela`: a nota SEM duplicata ja' lancada como UMA parcela de 4 (valor x 4 = a nota), achada
           pelo numero escrito de outro jeito ("NF_000.000.937"). Dados SINTETICOS. */
        /* D — `v=socancelados`: so' cancelados (a nota NAO esta' lancada; o rodape diz quantos) */
        : fn === 'fn_nota_ja_lancada' && v === 'socancelados' ? CANCELADOS_DA_NOTA
        /* P95 — `v=irmas`: 4 parcelas soltas no cartao (a nota sem duplicata, R$ 9.583,00), o numero so' em duas; somam R$ 0,02 a menos
           que a nota. SINTETICAS. */
        : fn === 'fn_nota_ja_lancada' && v === 'irmas' ? [239576, 239573, 239575, 239574].map((valor_cent, i) => ({ id: `jl-irma-${i}`, vencimento: `2026-${String(10 + i).padStart(2, '0')}-10`.replace('2026-13', '2027-01'),
          pagamento: null, competencia: '2026-09-15', descricao: `Medicamentos Bovinos Sinteticos no cartão, lançado à mão com descrição comprida - ${i + 1}/4`, valor_cent,
          status: i < 2 ? 'realizado' : 'agendado', conciliado: false, financiamento_id: null, numero_documento: i >= 2 ? 'NF_000.000.937' : null, fornecedor_id: 'agro-s',
          fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda', fornecedor_por: 'cnpj', parcelas: [], por: i >= 2 ? ['numero', 'fracao'] : ['fracao'], fracao_n: 4 }))
        /* P128a — `v=diferenca`: a nota no sistema com DIFERENCA (o molde Ferri & Prado: o dia 4 depois, a 3ª com R$ 0,34 a mais), a 1ª
           conciliada, a 2ª com a nota já anexada (+1 arquivo), a 4ª programada e um irmão do parcelamento que SOBRA ("só no sistema"). SINTÉTICOS. */
        : fn === 'fn_nota_ja_lancada' && v === 'diferenca' ? [
          ...[['2026-10-24', 49164, 'realizado'], ['2026-11-24', 49164, 'realizado'], ['2026-12-24', 49198, 'programado'], ['2027-01-24', 49164, 'programado'], ['2027-02-24', 49164, 'programado']]
            .map(([venc, valor_cent, st], i) => ({ id: `jl-d${i}`, vencimento: venc, pagamento: st === 'realizado' ? venc : null, competencia: '2026-09-15',
              descricao: `Medicamentos Bovinos Sinteticos com descricao bem comprida para o pior caso ${i + 1}/5`, valor_cent, status: st, conciliado: i === 0,
              financiamento_id: 'fin-d', numero_documento: i === 0 ? 'NF 937' : null, fornecedor_id: 'agro-s', fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda',
              fornecedor_por: 'cnpj', parcelas: [], por: i === 0 ? ['numero'] : i === 1 ? ['chave'] : ['parcelamento'], parcela_n: i + 1,
              tem_esta_nota: i === 1, documentos: i === 1 ? 2 : i === 0 ? 1 : 0 })),
        ]
        /* Gabriel 29/10 08:26 — `v=lr` / `v=lr2`: os parcelados do LR (SINTÉTICOS, o mesmo desenho): 4 soltas SEM "k/N", 3 pagas (a 1ª conciliada) e
           1 programada, sem parcelamento. `lr`: "Parcela N - None" e uma com texto; `lr2`: a 1ª escrita à mão. A prévia é a do banco, simulada aqui. */
        : fn === 'fn_nota_ja_lancada' && (v === 'lr' || v === 'lr2') ? LR_DA_NOTA(v)
        /* Gabriel 29/10 10:38 — `v=gulart`: a nota de UMA parcela já lançada 1 de 1, PROGRAMADA (o molde Gulart & Cia, SINTÉTICO) */
        : fn === 'fn_nota_ja_lancada' && (v === 'gulart' || v === 'gulartlongo') ? GULART_DA_NOTA()
        : fn === 'fn_nota_ja_lancada' && v === 'm2' ? M2_DA_NOTA()
        : fn === 'fn_nota_ja_lancada' && v === 'avista' ? AVISTA_DA_NOTA()
        : fn === 'fn_nota_ja_lancada' && v === 'previsto' ? PREVISTO_DA_NOTA()
        : fn === 'fn_nota_completar' && (v === 'lr' || v === 'lr2' || v === 'gulart' || v === 'gulartlongo' || v === 'm2' || v === 'avista' || v === 'previsto') ? completarDoLr(v, a)
        : fn === 'fn_nota_ja_lancada' && v === 'emparcela' ? [{ id: 'jl-p1', vencimento: '2026-10-20', pagamento: null, competencia: '2026-09-15',
          descricao: 'Medicamentos Bovinos Sinteticos — lançado à mão como uma parcela da nota', valor_cent: 49164, status: 'agendado', conciliado: false,
          financiamento_id: null, numero_documento: 'NF_000.000.937', fornecedor_id: 'agro-s', fornecedor_nome: 'Agro Sintetica Insumos Agropecuarios Ltda',
          fornecedor_por: 'cnpj', parcelas: [], por: ['numero'] }]
        /* P96a — a prévia da junção das 4 (a função do banco simulada): o efeito no DRE de passar a competência para a emissão */
        : fn === 'fn_parcelamento_juntar_lancamentos' && v === 'irmas' ? { ok: true, simulado: true, parcelas: 4, soma: 9582.98, descricao: 'Medicamentos Bovinos Sinteticos',
          safra_nova_codigo: '25/26-Pec', lista: [], efeito_por_mes: [{ mes: '2026-09', valor: 9582.98, parcelas: 4 }, { mes: '2026-10', valor: -2395.76, parcelas: -1 },
            { mes: '2026-11', valor: -2395.73, parcelas: -1 }, { mes: '2026-12', valor: -2395.75, parcelas: -1 }, { mes: '2027-01', valor: -2395.74, parcelas: -1 }] }
        /* P74 — os dias de vencimento do cartão SINTÉTICO (o mais frequente: 10) */
        : fn === 'fn_cartao_dias_de_vencimento' ? [{ dia: 10, lancamentos: 409, ultimo: '2026-10-10' }]
        : null,
    };
    const receita = async () => ({ ok: true as const, dados: { razaoSocial: v === 'longo' ? lido.nota.emitente.nome : 'AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA', fantasia: '',
      municipio: 'Campo Grande', uf: 'MS', logradouro: 'Rua das Flores', numero: '100', complemento: 'Sala 1', bairro: 'Centro', cep: '79000-000', matrizFilial: 'FILIAL' } });
    const PLANO = [
      { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
      { id: 'pl-vet', subcentro: 'Sanidade Animal — Vacinas e Medicamentos Veterinários', centro_custo: 'Sanidade', grupo_custo: 'Custeio Pecuário', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
      { id: 'pl-lav', subcentro: 'Insumos Lavoura — Defensivos e Fertilizantes', centro_custo: 'Insumos', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
    ] as any;
    const SAFRAS_N = [{ id: 's-soja', nome: 'Safra 26/27 Soja — Retiro Agricultura Sintético', ativa: true, codigo: '26/27-SOJ', escopo_negocio: 'agricultura' },
      /* Caso 3 — a safra da que ficou na c/c (a de antes) */
      { id: 's-soja-25', nome: 'Safra 25/26 Soja — Retiro Agricultura Sintético', ativa: true, codigo: '25/26-SOJ', escopo_negocio: 'agricultura' }] as any;
    const CONTAS_N = [{ id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null },
      /* P74 — um cartão SINTÉTICO para o "Cartão em N×" */
      { id: 'elo', nome_conta: 'Cartão Elo Exemplo', banco: null, fazenda_id: 'f-pur', tipo_conta: 'cartao', codigo_conta: null, nome_exibicao: 'Cartão Elo Exemplo', agencia: null, numero_conta: null, conta_digito: null }] as any;
    montar(<NotaFiscalDialog open onClose={() => {}} clienteId="cli" clienteNome="Cliente Exemplo"
      nota={{ arquivo, bytes, lido, doXml: { proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, emitente: lido.nota.emitente, resolucao, ocorrencias, arquivo } as any }}
      fazendas={[{ id: 'f-pur', nome: 'Faz. Sintetica', codigo: 'PUR' }] as any} contas={CONTAS_N} classificacoes={PLANO} safras={SAFRAS_N} fornecedores={fornecedores}
      onCriarFornecedor={async () => null} onCriarLancamento={async () => null} onAbrirNoLancamento={() => {}} onAbrirRegistrada={() => {}} onCriado={() => {}} consultarReceita={receita as any} />);
  };
  void montarNotaPdf();
} else if (tela === 'novo-da-nota') {
  /* P95 — "Novo a partir da nota" no pior caso de texto: uma nota lida, uma pela CHAVE DIGITADA (emissao e valor "—"), duas recusadas com
     o campo "Digitar a chave" (nome de arquivo comprido; PDF escaneado e nota sem chave) e o aviso do arquivo repetido. Dados SINTETICOS. */
  const montarNovoDaNota = async () => {
    const { jsPDF } = await import('jspdf');
    const { PAGINAS_DANFE_SINTETICO } = await import('@/lib/financeiro/nfe/__fixtures__/danfeSintetico');
    const { lerNota } = await import('@/lib/financeiro/nfe/lerNota');
    const { notaDaChaveDigitada, lidoDaChave } = await import('@/lib/financeiro/nfe/chaveDigitada');
    const { FRASE_NOTA_SEM_CHAVE, FRASE_PDF_SEM_TEXTO } = await import('@/lib/financeiro/nfe/danfe');
    const { NovoDeXmlDialog, arquivoPdfDaNota, fraseJaNaLista } = await import('@/components/financeiro-v2/NovoDeXmlDialog');
    const { notaDaNfseMunicipal } = await import('@/lib/financeiro/nfe/danfse');
    const { nfsePresidentePrudente } = await import('@/lib/financeiro/nfe/__fixtures__/nfseMunicipalSintetica');
    const nfseMunicipal: any = notaDaNfseMunicipal(nfsePresidentePrudente());
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [841.89, 595.28] });
    for (const it of PAGINAS_DANFE_SINTETICO[0]) { doc.setFontSize(Math.max(4, it.h * 1.15)); doc.text(it.str, it.x, 595.28 - it.y); }
    const bytes: ArrayBuffer = doc.output('arraybuffer');
    const lido: any = await lerNota(bytes);
    if (!lido.ok) { raiz.render(<div>{lido.frase}</div>); return; }
    const forn: any = { id: 'agro-s', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null };
    const fazendas = [{ id: 'f-pur', nome: 'Faz. Sintetica', ie: '280000002' }];
    const linha = (id: string, nome: string, l: any) => {
      const resolucao = resolverEmitente(l.nota.emitente, [forn], null);
      const p: any = proporLancamento({ nota: l.nota, avisosDoLeitor: l.avisos, fazendas, emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: null });
      const arquivo = arquivoPdfDaNota(bytes, nome);
      const doXml: any = { proposta: p.proposta, emitenteNome: l.nota.emitente.nome, emitenteDocumento: l.nota.emitente.documento, emitente: l.nota.emitente, resolucao, ocorrencias: [], arquivo };
      return { id, arquivoNome: nome, arquivoTamanho: bytes.byteLength, nota: l.nota, avisos: l.avisos, fazenda: p.proposta.fazendaId ? { ...fazendas[0], aliases: null } : null,
        recusa: null, lancada: false, doXml, jaLancados: 0, paraLancar: { arquivo, bytes, lido: l, doXml },
        /* como `montarLinhaDaNota` (NOTA-NOVA-MODAL-REAL: a tela lê `l.pelaChave`): sem isto a linha da chave digitada saía como lida — o nome
           do cadastro cortado com o title vazio (o nome da nota, que a chave não traz) e a emissão e o valor no lugar do "—" */
        pelaChave: l.pelaChave === true };
    };
    const r: any = notaDaChaveDigitada('5026 0911 2223 3300 0424 5501 0000 0009 3712 1753 8298');
    const LONGO = 'NOTA FISCAL ESCANEADA DO FORNECEDOR SINTETICO DE NOME BEM COMPRIDO 000.000.938 - copia digitalizada em baixa resolucao.pdf';
    const recusada = (id: string, nome: string, frase: string): any => ({ id, arquivoNome: nome, arquivoTamanho: 1000 + id.length, doXml: null, nota: null, avisos: [], fazenda: null,
      lancada: false, recusa: frase, paraDigitar: { arquivo: arquivoPdfDaNota(bytes, nome), bytes } });
    const linhas: any[] = [
      linha('l-lida', '000.000.937.pdf', lido),
      linha('l-chave', '000.000.939.pdf', lidoDaChave(r.nota, [{ largura: 841.89, altura: 595.28 }])),
      /* NFSE-MUNICIPAL-01 — a NFS-e da prefeitura sem chave nacional (sintetica, o layout de Presidente Prudente): o chip "sem chave · confira" */
      linha('l-nfse', 'NFSe-6001-servico.pdf', nfseMunicipal),
      recusada('l-escaneado', LONGO, FRASE_PDF_SEM_TEXTO),
      recusada('l-semchave', '46.995.pdf', FRASE_NOTA_SEM_CHAVE),
    ];
    montar(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'f-pur', nome: 'Faz. Sintetica' }]} fornecedores={[forn]}
      onAbrirLancamento={() => {}} onAbrirNota={() => {}} lancadas={new Set()} linhasIniciais={linhas} avisoInicial={`${fraseJaNaLista(LONGO)} ${fraseJaNaLista('46.995.pdf')}`} />);
  };
  void montarNovoDaNota();
} else if (tela === 'trocar-fornecedor') {
  /* FORN-TROCAR-LOTE-01 — o "Trocar fornecedor" da lista: o resumo de 4.851 lancamentos SINTETICOS saindo de 40 fornecedores de nome
     longo (a lista rola dentro do quadro), com os avisos (conciliados, meses fechados, OC) — o pior caso de texto */
  const montarTroca = async () => {
    const { TrocarFornecedorDialog } = await import('@/components/financeiro-v2/TrocarFornecedorDialog');
    const origens = Array.from({ length: 40 }, (_, i) => ({ id: `o${i}`, nome: `Fornecedor Sintetico de Nome Bem Comprido Numero ${i + 1} Comercio de Insumos Agropecuarios Ltda`, lancamentos: 300 - i * 7, soma: 99999.99 - i }));
    g.__bancoBancada = { rpc: (fn: string) => fn === 'fn_lancamentos_trocar_favorecido' ? { ok: true, simulado: true, sem_destino: true, lancamentos: 4851, soma: 1234567.89,
      origens, meses_fechados: [{ fazenda: 'Faz. Exemplo', ano_mes: '2024-03' }, { fazenda: 'Faz. Exemplo Dois', ano_mes: '2024-04' }], meses_fechados_lancamentos: 37,
      conciliados: 1234, ligados_a_oc: 12, ja_no_destino: 0, cancelados: 3, operacao_id: null } : null };
    raiz.render(<TrocarFornecedorDialog clienteId="cli" ids={['x']} onClose={() => {}} />);
  };
  void montarTroca();
} else if (tela === 'plano-contas') {
  /* P172 — Cadastros › Plano de Contas (dado SINTÉTICO, `dados/planoContas.ts`); `&perfil=cliente` = o cliente (só leitura, sem ações) */
  if (q.get('perfil') === 'cliente') g.__clienteBancada = { clienteAtual: { id: 'cli', nome: 'Cliente Bancada' }, clientes: [{ id: 'cli', nome: 'Cliente Bancada' }],
    isAdmin: false, perfil: 'financeiro', loading: false, setClienteAtual: () => {}, resumoClientes: false, setResumoClientes: () => {} };
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_plano_contas' ? PLANO_DE_CONTAS.filter((x) => e.eq.ativo !== true || x.ativo)
      : t === 'financeiro_dividendos' ? DIVIDENDOS_DO_PLANO : [],
    rpc: (fn: string) => fn.startsWith('fn_subcentro_cliente_') ? { antes: { lancamentos_vivos: 12 }, depois: {}, recusa: null, lancamentos_tocados: 7 } : null,
  };
  montar(<FinV2PlanoContasTab onAbrirDividendos={() => {}} />);
} else if (tela === 'patrimonio') {
  /* PATR-01 PR B — Cadastros › Patrimônio: a tela real com a API em memória (`dados/patrimonio.ts`, SINTÉTICO); o modal do bem se abre
     pelo clique na linha (os cenários do gate) */
  const montarPatrimonio = async () => {
    const { PatrimonioTela } = await import('@/components/patrimonio/PatrimonioTela');
    const { PatrimonioApiProvider } = await import('@/hooks/usePatrimonio');
    const { API_PATRIMONIO, FAZENDAS_PATRIMONIO } = await import('./dados/patrimonio');
    g.__fazendaBancada = { fazendas: FAZENDAS_PATRIMONIO, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };
    montar(<PatrimonioApiProvider api={API_PATRIMONIO}><PatrimonioTela /></PatrimonioApiProvider>);
  };
  void montarPatrimonio();
} else if (tela === 'produtores') {
  /* FISCAL onda 1 (a) — Cadastros › Produtores: a tela real com a API em memória (`dados/produtores.ts`, SINTÉTICO); a prévia de cada
     gravação se monta a partir do pedido e nada grava */
  const montarProdutores = async () => {
    const { ProdutoresTela } = await import('@/components/fiscal/ProdutoresTela');
    const { ProdutoresApiProvider } = await import('@/hooks/useProdutores');
    const { API_PRODUTORES, FAZENDAS_PRODUTORES } = await import('./dados/produtores');
    g.__fazendaBancada = { fazendas: FAZENDAS_PRODUTORES, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };
    montar(<ProdutoresApiProvider api={API_PRODUTORES}><ProdutoresTela /></ProdutoresApiProvider>);
  };
  void montarProdutores();
} else if (tela === 'pastos') {
  /* FECH-ROTACAO-01 fatia 2 — Cadastros › Pastos (a tela REAL) com o modo "Grupos": dado SINTÉTICO, nomes de exemplo; um grupo de 3
     piquetes (P10A/B/C), um de nome longo com 4 pastos, um inativo e pastos soltos. O banco responde a prévia do `fn_pasto_grupo_salvar`
     a partir do pedido (a frase do banco, a área somada), sem gravar nada. */
  /* PASTOS-CAD-02 — `globalThis.__casoPastos`: o caso REAL injetado SÓ pelo script de foto (`fotoPastosFicha.mjs --caso <json>`, arquivo fora do
     repositório): a fazenda, os pastos, o mapa, a lotação e a matrícula. Sem ele, o dado SINTÉTICO de sempre (nada de cliente no repositório). */
  const CASO: any = g.__casoPastos ?? null;
  const FAZ = CASO ? CASO.fazenda : { id: 'f1', nome: 'Faz. Exemplo Sintética', codigo: 'EXS', cliente_id: 'cli', tem_pecuaria: true };
  g.__fazendaBancada = { fazendas: [FAZ], fazendaAtual: FAZ, isGlobal: false, fazendaId: FAZ.id };
  /* o `canEdit('pastos')` lê o perfil de `clienteAtual` (o padrão da bancada não traz): sem ele a tela abre só para leitura */
  const CLI = { id: 'cli', nome: 'Cliente Bancada', perfil: 'admin_agroinblue' };
  g.__clienteBancada = { clienteAtual: CLI, clientes: [CLI], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  const pasto = (id: string, nome: string, area: number | null, tipo: string, grupo: string | null, ativo = true, ordem = 0) => ({
    id, fazenda_id: 'f1', cliente_id: 'cli', nome, lote_padrao: null, area_produtiva_ha: area, tipo_uso: tipo, qualidade: null, entra_conciliacao: true,
    ativo, observacoes: null, ordem_exibicao: ordem, data_inicio: null, data_fim: null, grupo_id: grupo, created_at: '2026-01-01', updated_at: '2026-01-01' });
  const PASTOS = [
    pasto('p10a', 'P10A', 21.4, 'recria', 'g1', true, 1), pasto('p10b', 'P10B', 22.9, 'recria', 'g1', true, 2), pasto('p10c', 'P10C', 20, 'recria', 'g1', true, 3),
    pasto('ta1', 'T-A1 Piquete da terminação', 10.25, 'engorda', 'g2', true, 4), pasto('ta2', 'T-A2 Piquete da terminação', 11.5, 'engorda', 'g2', true, 5),
    pasto('ta3', 'T-A3 Piquete da terminação', 12, 'engorda', 'g2', true, 6), pasto('ta4', 'T-A4 Piquete da terminação', 9.75, 'engorda', 'g2', true, 7),
    pasto('p11', 'P11', 35.5, 'cria', null, true, 8), pasto('p13', 'P13 Retiro do córrego de baixo', 1234.56, 'cria', null, true, 9),
    pasto('p14', 'P14', 18, 'vedado', null, true, 10), pasto('p15', 'P15 velho', 9, 'recria', null, false, 11),
    /* PASTO-FICHA-01 PR B — o PAI do grupo P10 (a origem do grupo): na lista ele vem com os piquetes P10A/B/C embaixo e a área = a soma */
    pasto('p10', 'P10', 65.1, 'recria', null, true, 0),
  ];
  /* PASTO-FICHA-01 PR B — o que a ficha acrescenta (SINTÉTICO): forrageira, implantação, avaliação, suporte e lotação do mês fechado */
  const FORR: Record<string, [string, string | null]> = {
    p10: ['fo1', '2019-03-01'], p10a: ['fo1', '2019-03-01'], p11: ['fo2', '2008-01-01'], p13: ['fo3', null], ta1: ['fo4', '2023-11-01'], p14: ['fo2', '2015-10-01'],
  };
  for (const x of PASTOS) { const f = FORR[x.id]; Object.assign(x, { forrageira_principal_id: f?.[0] ?? null, forrageira_implantada_em: f?.[1] ?? null }); }
  if (CASO) PASTOS.splice(0, PASTOS.length, ...CASO.pastos);
  const MES_HOJE = new Date().toISOString().slice(0, 7);
  const [aH, mH] = MES_HOJE.split('-').map(Number);
  const MES_FECHADO = `${mH === 1 ? aH - 1 : aH}-${String(mH === 1 ? 12 : mH - 1).padStart(2, '0')}`;
  const FICHA_BANCADA = {
    catalogo: [
      ...[['fo1', 'Braquiarão — Marandu'], ['fo2', 'Humidícola — comum'], ['fo3', 'Mombaça'], ['fo4', 'Capim-elefante — BRS Capiaçu, de corte e silagem'],
        ['fo5', 'Estilosantes Campo Grande']].map(([id, nome], i) => ({ id, nome, lista: 'forrageira', grupo: 'Braquiárias', cliente_id: null, apelidos: [], ordem: i })),
      ...['Plano (0–3%)', 'Suave ondulado (3–8%)', 'Ondulado (8–20%)'].map((nome, i) => ({ id: `re${i}`, nome, lista: 'relevo', grupo: 'Relevo', cliente_id: null, apelidos: [], ordem: i })),
      ...['Arenoso', 'Médio', 'Argiloso'].map((nome, i) => ({ id: `tx${i}`, nome, lista: 'textura_solo', grupo: 'Textura', cliente_id: null, apelidos: [], ordem: i })),
      ...['Boa', 'Moderada', 'Ruim'].map((nome, i) => ({ id: `dr${i}`, nome, lista: 'drenagem', grupo: 'Drenagem', cliente_id: null, apelidos: [], ordem: i })),
      ...['Natural — árvores / capões', 'Artificial — sombrite'].map((nome, i) => ({ id: `so${i}`, nome, lista: 'sombra', grupo: 'Sombra', cliente_id: null, apelidos: [], ordem: i })),
      ...['Pasto', 'Pasto intensivo / irrigado', 'Confinamento'].map((nome, i) => ({ id: `si${i}`, nome, lista: 'sistema_pasto', grupo: 'pasto', cliente_id: null, apelidos: [], ordem: i })),
    ],
    cards: PASTOS.flatMap((x) => [{ ano_mes: MES_FECHADO, status: 'fechado', pasto_id: x.id }, { ano_mes: MES_HOJE, status: 'aberto', pasto_id: x.id }]),
    avaliacoes: [
      { pasto_id: 'p10', data_avaliacao: '2026-08-14', degradacao: 'leve' }, { pasto_id: 'p11', data_avaliacao: '2025-03-02', degradacao: 'moderada' },
      { pasto_id: 'p13', data_avaliacao: '2026-09-20', degradacao: 'forte' }, { pasto_id: 'ta1', data_avaliacao: '2026-10-01', degradacao: 'sem' },
      { pasto_id: 'p10a', data_avaliacao: '2026-08-14', degradacao: 'muito forte' },
    ],
    potencial: [{ pasto_id: 'p10', potencial_ua_ha: 1.6 }, { pasto_id: 'p11', potencial_ua_ha: 1.1 }, { pasto_id: 'p13', potencial_ua_ha: 0.8 }, { pasto_id: 'ta1', potencial_ua_ha: 2.4 }],
    lotacao: [{ pasto_id: 'p10', ua_ha: 1.42 }, { pasto_id: 'p11', ua_ha: 1.25 }, { pasto_id: 'p13', ua_ha: 0.55 }, { pasto_id: 'ta1', ua_ha: 1.95 }, { pasto_id: 'p14', ua_ha: 0.9 }],
  };
  const GRUPOS = [
    { id: 'g1', fazenda_id: 'f1', nome: 'P10', ativo: true, pasto_origem_id: 'p10' },
    { id: 'g2', fazenda_id: 'f1', nome: 'Terminação intensiva do retiro de cima', ativo: true },
    { id: 'g3', fazenda_id: 'f1', nome: 'Antigo rotacionado', ativo: false },
  ];
  const br = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  g.__bancoBancada = {
    from: (t: string, e: any) => (t === 'pastos' ? PASTOS : t === 'pasto_grupos' ? (CASO ? [] : GRUPOS)
      : t === 'fazenda_cadastros' && CASO ? [{ area_total_ha: CASO.matricula, matricula_conferida_em: CASO.conferida ? '2026-10-01' : null }]
      : t === 'catalogo_itens' ? FICHA_BANCADA.catalogo.filter((i) => !e?.eq?.lista || i.lista === e.eq.lista)
      : t === 'fechamento_pastos' ? FICHA_BANCADA.cards
      : t === 'pasto_condicoes' ? FICHA_BANCADA.avaliacoes.filter((a) => !e?.eq?.pasto_id || a.pasto_id === e.eq.pasto_id)
        .map((a, i) => ({ id: `av${i}`, cercas: 'bom', agua: 'regular', cochos: 'bom', invasoras: 'baixo', cupins: 'medio', erosao: 'sem', cobertura_pct: 85,
          suporte_aguas_ua_ha: 1.6, suporte_seca_ua_ha: 1.0, avaliador: 'Exemplo', observacoes: null, ...a }))
      : t === 'fazenda_infraestruturas' ? (e?.eq?.pasto_id === 'p10' ? [{ id: 'i1', tipo: 'bebedouro', nome: 'Bebedouro do P10', observacao: 'pilheta de alvenaria' },
        { id: 'i2', tipo: 'cocho', nome: 'Cocho coberto 1', observacao: '18 m lineares' }] : [])
      : t === 'patrimonio_bem_pastos' ? [{ pasto_id: 'p10' }] : []),
    rpc: (fn: string, a: any) => {
      if (CASO && fn === 'fn_pastos_potencial_no_mes') return [];
      if (CASO && fn === 'fn_lotacao_do_mes') return a.p_ano_mes === CASO.mes ? CASO.lotacao : [];
      if (CASO && fn === 'fn_pastos_area_comparar') return CASO.mapa;
      if (fn === 'fn_pastos_potencial_no_mes') return FICHA_BANCADA.potencial;
      if (fn === 'fn_lotacao_do_mes') return FICHA_BANCADA.lotacao;
      if (fn === 'fn_pasto_reformas') return a.p_pasto === 'p10' ? [{ bem_id: 'b1', data: '2019-03-01', descricao: 'Reforma do P10 (gradagem + Marandu)',
        area_no_pasto_ha: 64.3, custo_rs: 96450, rs_ha: 1500, contabil_rs: 41200 }] : [];
      /* PASTO-FICHA-01 PR B — a ficha (SINTÉTICA) do pasto pedido */
      if (fn === 'fn_pasto_ficha') {
        const x = PASTOS.find((y) => y.id === a.p_pasto) ?? PASTOS[0];
        const f = FORR[x.id];
        return { pasto: { ...x, posse: 'arrendada_de_terceiro', posse_contraparte_id: null, posse_desde: '2022-01-01', posse_ate: null, sistema_id: 'si0',
            relevo_id: 're1', textura_id: 'tx0', drenagem_id: 'dr0', sombra_id: 'so0', sombra_cobertura: 'parcial', manejo: 'rotacionado', ficha_versao: 3,
            forrageira_secundaria_id: x.id === 'p10' ? 'fo5' : null },
          nomes: { forrageira_principal: FICHA_BANCADA.catalogo.find((i) => i.id === f?.[0])?.nome ?? null, forrageira_secundaria: x.id === 'p10' ? 'Estilosantes Campo Grande' : null,
            relevo: 'Suave ondulado (3–8%)', textura: 'Arenoso', drenagem: 'Boa', sombra: 'Natural — árvores / capões', sistema: 'Pasto' },
          ano_mes: MES_HOJE, area: { oficial_ha: x.area_produtiva_ha, mapa_ha: x.id === 'p10' ? 66.3 : null, trava: null },
          ultima_avaliacao: FICHA_BANCADA.avaliacoes.find((v) => v.pasto_id === x.id) ?? null,
          potencial: FICHA_BANCADA.potencial.find((v) => v.pasto_id === x.id) ? { potencial_ua_ha: FICHA_BANCADA.potencial.find((v) => v.pasto_id === x.id)?.potencial_ua_ha, epoca: 'águas' } : null,
          ultima_reforma: x.id === 'p10' ? { bem_id: 'b1', data: '2019-03-01', descricao: 'Reforma do P10', idade_anos: 7 } : null };
      }
      if (fn === 'fn_pasto_lotacao_meses') {
        return Array.from({ length: 12 }, (_, i) => {
          const t = aH * 12 + (mH - 1) - 1 - i; const am = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
          const uaHa = Math.round((1.1 + ((i * 37) % 9) / 10) * 100) / 100; const sup = (t % 12) + 1 >= 5 && (t % 12) + 1 <= 10 ? 1.0 : 1.6;
          return { ano_mes: am, epoca: sup === 1.0 ? 'seca' : 'águas', area_ha: 64.3, cabecas: Math.round(uaHa * 64.3 / 0.9), ua: Math.round(uaHa * 64.3 * 100) / 100, ua_ha: uaHa, suporte_ua_ha: sup, acima: uaHa > sup };
        });
      }
      if (fn === 'fn_pasto_ficha_salvar' || fn === 'fn_pasto_criar') {
        return { ok: true, simulado: a.p_simular, sem_mudanca: false, versao: 3, area_ha: a.p_area_ha ?? null, vigente_desde: `${MES_HOJE}-01`,
          muda: Object.entries(a.p_campos ?? {}).slice(0, 6).map(([campo, v]) => ({ campo, antes: null, depois: v })) };
      }
      /* PASTO-AREA-OFICIAL-01 — o modo "Áreas" (SINTÉTICO): a área do mapa de cada pasto (a medição), um travado, um sem polígono, um já
         igual com a última mudança "do mapa" (desfazer) e o P11 que a PRÉVIA recusa (área da fazenda oficializada) */
      const AM = new Date().toISOString().slice(0, 7);
      const MAPA_AREA: Record<string, number | null> = { p10a: 19.87, p10b: 22.9, p10c: 23.41, ta1: 11.02, ta2: 11.5, ta3: 12.3, ta4: 8.9, p11: 50.12, p13: 1198.02, p14: null };
      const TRAVA: Record<string, string> = { ta1: `o pasto está fechado em ${AM.slice(5)}/${AM.slice(0, 4)}` };
      if (fn === 'fn_pastos_area_comparar') {
        return PASTOS.filter((x) => x.ativo).map((x) => {
          const mapa = MAPA_AREA[x.id] ?? null; const of = x.area_produtiva_ha;
          return { pasto_id: x.id, nome: x.nome, ativo: true, area_oficial_ha: of, area_mapa_ha: mapa, n_poligonos: mapa == null ? 0 : 1,
            dif_ha: mapa != null && of != null ? Math.round((mapa - of) * 100) / 100 : null,
            dif_pct: mapa != null && of ? Math.round((mapa - of) / of * 1000) / 10 : null,
            ultima_vigencia_id: x.id === 'ta2' ? 'vig-ta2' : null, ultima_origem: x.id === 'ta2' ? 'mapa' : null,
            ultima_desde: x.id === 'ta2' ? `${AM}-01` : null, ultima_anterior_ha: x.id === 'ta2' ? 12.75 : null, trava: TRAVA[x.id] ?? null };
        });
      }
      if (fn === 'fn_pasto_area_usar_mapa') {
        const itens = PASTOS.filter((x) => (a.p_pastos ?? []).includes(x.id)).map((x) => {
          const mapa = MAPA_AREA[x.id] ?? null; const of = x.area_produtiva_ha ?? 0; const recusa = x.id === 'p11';
          return { pasto_id: x.id, nome: x.nome, situacao: recusa ? 'recusa' : 'muda',
            motivo: recusa ? `A área não muda: a área de ${AM.slice(5)}/${AM.slice(0, 4)} da fazenda já foi oficializada.` : null,
            area_antes: of, area_mapa: mapa, dif_ha: mapa != null ? Math.round((mapa - of) * 100) / 100 : null,
            dif_pct: mapa != null && of ? Math.round((mapa - of) / of * 1000) / 10 : null, lotacao_mes: AM,
            ua_ha_antes: of ? Math.round(52 / of * 100) / 100 : null, ua_ha_depois: !recusa && mapa ? Math.round(52 / mapa * 100) / 100 : null };
        });
        const nr = itens.filter((i) => i.situacao === 'recusa').length;
        return { ok: nr === 0, simulado: a.p_simular, n_muda: itens.length - nr, n_igual: 0, n_recusa: nr, itens };
      }
      if (fn === 'fn_pasto_area_desfazer') {
        return { ok: true, simulado: a.p_simular, itens: [{ vigencia_id: 'vig-ta2', nome: 'T-A2 Piquete da terminação', area_ha: 11.5, volta_para: 12.75, recusa: null }] };
      }
      if (fn === 'fn_pasto_grupo_desativar') {
        const n = PASTOS.filter((x) => x.grupo_id === a.p_grupo_id).length;
        const nome = GRUPOS.find((x) => x.id === a.p_grupo_id)?.nome;
        return { ok: true, simulado: true, frase: `Desativa o grupo ${nome}: ${n} pastos voltam a ficar sem grupo, com o mesmo nome e a mesma área.`, saem: [] };
      }
      if (fn !== 'fn_pasto_grupo_salvar') return null;
      const ids: string[] = a.p_pasto_ids ?? [];
      const escolhidos = PASTOS.filter((x) => ids.includes(x.id));
      const antes = PASTOS.filter((x) => a.p_grupo_id && x.grupo_id === a.p_grupo_id);
      const area = escolhidos.reduce((s, x) => s + (x.area_produtiva_ha ?? 0), 0);
      const vira = (l: typeof PASTOS) => l.map((x) => ({ id: x.id, nome: x.nome, area_ha: x.area_produtiva_ha }));
      const entram = escolhidos.filter((x) => !antes.includes(x)); const saem = antes.filter((x) => !ids.includes(x.id));
      if (a.p_grupo_id && entram.length === 0 && saem.length === 0) return { ok: true, simulado: true, sem_mudanca: true, frase: `O grupo ${a.p_nome.trim()} já está assim.` };
      return { ok: true, simulado: true, frase: `${a.p_grupo_id ? 'O grupo' : 'Cria o grupo'} ${a.p_nome.trim()}: ${ids.length} pastos, ${br(area)} ha.`,
        entram: vira(entram), saem: vira(saem), area_ha: area };
    },
  };
  const montarPastos = async () => {
    const { PastosTab } = await import('@/pages/PastosTab');
    montar(<PastosTab />);
  };
  void montarPastos();
} else if (tela === 'mapa-pastos') {
  /* MAPA-REBANHO-02 — Produção › Mapa de pastos (a tela REAL), dado SINTÉTICO de out/2026 no formato do mock: 9 categorias, pastos de cria,
     recria e engorda, um lote com programa ("1ª inseminação"), um lote só texto e comprido (corta com o title), pastos vazios e a conta de
     ajuste do campeiro ("⚠ Div."). Os lotes pela `fn_lotes_da_fazenda` e o nome do programa pelo cadastro do lote, como na tela de verdade. */
  const FAZ = { id: 'f1', nome: 'Faz. Exemplo Sintética', codigo: 'EXS', cliente_id: 'cli', tem_pecuaria: true };
  g.__fazendaBancada = { fazendas: [FAZ], fazendaAtual: FAZ, isGlobal: false, fazendaId: FAZ.id };
  const CLI = { id: 'cli', nome: 'Cliente Bancada', perfil: 'admin_agroinblue' };
  g.__clienteBancada = { clienteAtual: CLI, clientes: [CLI], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  const COD = ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros', 'mamotes_f', 'desmama_f', 'novilhas', 'vacas'];
  const NOME = ['Mamotes M', 'Desmama M', 'Garrotes', 'Bois', 'Touros', 'Mamotes F', 'Desmama F', 'Novilhas', 'Vacas'];
  const CATS = COD.map((c, i) => ({ id: `c-${c}`, codigo: c, nome: NOME[i], ordem_exibicao: i + 1, ativo: true }));
  const pasto = (id: string, nome: string, area: number, tipo: string, ordem: number) => ({
    id, fazenda_id: 'f1', cliente_id: 'cli', nome, lote_padrao: null, area_produtiva_ha: area, tipo_uso: tipo, qualidade: null, entra_conciliacao: true,
    ativo: true, observacoes: null, ordem_exibicao: ordem, data_inicio: null, data_fim: null, grupo_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' });
  /* [id, nome, área, uso, lote do mês, lote cadastrado, {categoria: [cab, kg]}, qualidade] */
  const LINHAS: [string, string, number, string, string | null, string | null, Record<string, [number, number]>, number | null][] = [
    ['a1', 'A-01', 31.4, 'cria', 'Cria-Prec-1', 'l-cri1', { mamotes_m: [12, 88.5], mamotes_f: [9, 81.25], novilhas: [30, 402.13] }, 6],
    ['a2', 'A-02', 25.0, 'cria', 'Cria-Prec-1', 'l-cri1', { mamotes_m: [8, 92], mamotes_f: [12, 79.5], novilhas: [20, 410] }, 6],
    ['a3', 'A-03', 58.2, 'cria', 'Nov-Ins-01', 'l-ins', { mamotes_m: [7, 95], mamotes_f: [5, 90], novilhas: [41, 355.75], vacas: [22, 470.5] }, 6],
    ['a4', 'A-04', 33.9, 'recria', 'Desm-F-01', 'l-df', { desmama_f: [26, 288.4] }, 6],
    ['a5', 'A-05', 30.1, 'recria', 'Desm-F-01', 'l-df', { desmama_f: [33, 291.6] }, 6],
    ['a6', 'A-06', 67.0, 'recria', 'Nov-Rec', 'l-nov', { novilhas: [70, 398.2] }, 6],
    ['a7', 'A-07', 64.8, 'recria', 'DM-Rec', 'l-dm', { desmama_m: [78, 281.33] }, null],
    ['a8', 'A-08', 61.0, 'recria', null, null, {}, null],
    ['a9', 'A-09', 70.2, 'recria', null, null, {}, null],
    ['b1', 'B-01', 30.5, 'cria', 'Leiteiras e vacas de descarte do retiro', null, { mamotes_m: [4, 85], garrotes: [3, 302.1], mamotes_f: [9, 80], novilhas: [5, 390], vacas: [11, 455.9] }, null],
    ['b2', 'B-02', 41.7, 'engorda', 'Engorda', 'l-eng', { bois: [18, 455.8], touros: [2, 610.25], vacas: [5, 440] }, 7],
    ['dv', '⚠️ Divergência do Campeiro', 0, 'divergencia', null, null, {}, null],
  ];
  /* MAPA-REBANHO-R2 — o caso da PUR (SINTÉTICO): o P7 lançado POR PIQUETES (7A e 7B, que no cadastro vêm ANTES do P7) e o P5 com piquete
     no cadastro mas lançado inteiro. A tela mostra o P7 somando, o 7A e o 7B recuados logo abaixo dele, e o P5 sem sub-linha; nenhum piquete solto. */
  const PIQUETES = [{ ...pasto('7a', '7A', 18.5, 'recria', 0), grupo_id: 'g7' }, { ...pasto('7b', '7B', 21.0, 'recria', 0), grupo_id: 'g7' },
    { ...pasto('p5a', 'P5-A', 12, 'recria', 0), grupo_id: 'g5' }];
  const PAIS = [{ ...pasto('p7', 'P7', 39.5, 'recria', 0), grupo_id: 'g7' }, { ...pasto('p5', 'P5', 12, 'recria', 0), grupo_id: 'g5' }];
  const GRUPOS = [{ id: 'g7', nome: 'P7', pasto_origem_id: 'p7', ativo: true, cliente_id: 'cli' }, { id: 'g5', nome: 'P5', pasto_origem_id: 'p5', ativo: true, cliente_id: 'cli' }];
  const PASTOS = [...LINHAS.map(([id, nome, area, uso], i) => pasto(id, nome, area, uso, i + 1)), ...PIQUETES.slice(0, 2), ...PAIS, PIQUETES[2]];
  const CARDS = LINHAS.map(([id, , , uso, lote], i) => ({ id: `fc-${id}`, pasto_id: id, fazenda_id: 'f1', cliente_id: 'cli', ano_mes: '2026-10',
    status: i < 3 ? 'fechado' : 'rascunho', responsavel_nome: null, lote_mes: lote, tipo_uso_mes: uso, qualidade_mes: LINHAS[i][7], observacao_mes: null,
    created_at: '2026-10-01', updated_at: '2026-10-01' }));
  for (const [id, uso] of [['p7', 'recria'], ['p5', 'recria']]) CARDS.push({ ...CARDS[3], id: `fc-${id}`, pasto_id: id, lote_mes: null, tipo_uso_mes: uso, qualidade_mes: null });
  const ITENS_R2 = [['p7', '7a', 'novilhas', 24, 352.4], ['p7', '7a', 'desmama_f', 10, 280], ['p7', '7b', 'novilhas', 31, 360.1], ['p5', null, 'novilhas', 15, 340]]
    .map(([pid, piq, cod, q, kg]) => ({ id: `i-${pid}-${piq}-${cod}`, fechamento_id: `fc-${pid}`, categoria_id: `c-${cod}`, quantidade: q, peso_medio_kg: kg,
      lote: null, lote_id: null, observacoes: null, origem_dado: 'manual', peso_atualizado: false, piquete_id: piq }));
  const ITENS = [...ITENS_R2, ...LINHAS.flatMap(([id, , , , , loteId, cats]) => Object.entries(cats).map(([cod, [q, kg]]) => ({ id: `i-${id}-${cod}`, fechamento_id: `fc-${id}`,
    categoria_id: `c-${cod}`, quantidade: q, peso_medio_kg: kg, lote: null, lote_id: loteId, observacoes: null, origem_dado: 'manual', peso_atualizado: id === 'a1' })))];
  /* L3 (Gabriel 09/11, o caso Monterrey set/26 — SINTÉTICO, nos números do banco): `&v=rotacao` — o card do P_02 (49,3 ha) com 187 vacas e o
     lote que também esteve no P_01 (50,2 ha, card vazio). A `fn_lotacao_do_mes` daqui faz o rateio por área do banco: 1,11 UA/ha nos dois. */
  const ROTACAO = v === 'rotacao';
  const ALOC: { fechamento_id: string; lote: string; pasto_id: string }[] = [];
  const LOTACAO: Record<string, unknown>[] = [];
  if (ROTACAO) {
    PASTOS.push(pasto('p01', 'P_01', 50.2, 'cria', 20), pasto('p02', 'P_02', 49.3, 'cria', 21));
    for (const id of ['p01', 'p02']) CARDS.push({ ...CARDS[3], id: `fc-${id}`, pasto_id: id, lote_mes: null, tipo_uso_mes: 'cria', qualidade_mes: null });
    ITENS.push({ id: 'i-p02-vacas', fechamento_id: 'fc-p02', categoria_id: 'c-vacas', quantidade: 187, peso_medio_kg: 265.7, lote: null, lote_id: null,
      observacoes: null, origem_dado: 'manual', peso_atualizado: false, piquete_id: null });
    ALOC.push({ fechamento_id: 'fc-p02', lote: '', pasto_id: 'p02' }, { fechamento_id: 'fc-p02', lote: '', pasto_id: 'p01' });
    const ua = 187 * 265.7 / 450;
    for (const [id, area] of [['p01', 50.2], ['p02', 49.3]] as const) {
      const f = area / 99.5;
      LOTACAO.push({ pasto_id: id, grupo_id: null, area_ha: area, cabecas: 187 * f, kg: 187 * 265.7 * f, ua: ua * f, kg_ha: 187 * 265.7 / 99.5, ua_ha: ua / 99.5,
        recebe_de_outro_card: id === 'p01' });
    }
  }
  const lote = (id: string, codigo: string, programa: string | null) => ({ id, codigo, codigos_antigos: [], nome_campeiro: null, situacao: 'ativo',
    formado_em: '2026-01-01', encerrado_em: null, categoria_id: 'k-cat', raca_id: 'k-raca', atividade_id: 'k-ativ', numero: 1, sistema_id: null,
    programa_id: programa, destino_id: null, safra: null, carimbo: null, idade_media_meses: null, meta_peso_kg: null, meta_gmd_kg: null, meta_data: null,
    versao: 1, ano_mes_dado: '2026-10', cabecas: 0, peso_medio_kg: null, gmd_kg: null, pastos: [], lancamentos: 0, conferir: null });
  const LOTES = [lote('l-cri1', 'CRI-PRE-01', null), lote('l-ins', 'CRI-NOV-01', 'k-prog-ins'), lote('l-df', 'REC-DF-01', null),
    lote('l-nov', 'REC-NOV-01', null), lote('l-dm', 'REC-DM-01', null), lote('l-eng', 'ENG-BOI-01', null)];
  const CADASTROS = [{ id: 'k-prog-ins', tipo: 'programa', sigla: null, nome: '1ª inseminação', categorias_rebanho: [], ordem: 1, ativo: true }];
  g.__bancoBancada = {
    from: (t: string, e: { eq: Record<string, unknown> }) => (
      t === 'pastos' ? PASTOS
      : t === 'pasto_grupos' ? GRUPOS
      : t === 'fechamento_pastos' ? CARDS.filter((c) => !e.eq.ano_mes || c.ano_mes === e.eq.ano_mes)
      : t === 'fechamento_pasto_itens' ? ITENS.filter((i) => !e.eq.fechamento_id || i.fechamento_id === e.eq.fechamento_id)
      : t === 'categorias_rebanho' ? CATS
      : t === 'rebanho_lote_cadastros' ? CADASTROS
      : t === 'fechamento_alocacoes' ? ALOC
      : []),
    rpc: (fn: string) => (fn === 'fn_lotes_da_fazenda' ? LOTES : fn === 'fn_lotacao_do_mes' ? LOTACAO : null),
  };
  const montarMapa = async () => {
    const { MapaPastosTab } = await import('@/pages/MapaPastosTab');
    montar(<MapaPastosTab periodo={{ ano: '2026', mes: 10 }} onPeriodoChange={() => {}} />);
  };
  void montarMapa();
} else if (tela === 'fechamento-grupo') {
  /* FECH-ROTACAO-01 fatia 3 — Fechamento de pastos (a tela REAL) com um grupo de pastejo, dado SINTÉTICO de out/2026: o grupo P10
     (P10A com o lote no grupo inteiro, P10B só recebe, P10C vedado), a rotação avulsa P11 → P12 Retiro, e um pasto solto. A lotação
     responde pela mesma regra da `fn_lotacao_do_mes` (rateio por área), calculada aqui a partir dos cards e das alocações. */
  const FAZ = { id: 'f1', nome: 'Faz. Exemplo Sintética', codigo: 'EXS', cliente_id: 'cli', tem_pecuaria: true };
  g.__fazendaBancada = { fazendas: [FAZ], fazendaAtual: FAZ, isGlobal: false, fazendaId: FAZ.id };
  const CLI = { id: 'cli', nome: 'Cliente Bancada', perfil: 'admin_agroinblue' };
  g.__clienteBancada = { clienteAtual: CLI, clientes: [CLI], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  const pasto = (id: string, nome: string, area: number, tipo: string, grupo: string | null, ordem: number) => ({
    id, fazenda_id: 'f1', cliente_id: 'cli', nome, lote_padrao: null, area_produtiva_ha: area, tipo_uso: tipo, qualidade: null, entra_conciliacao: true,
    ativo: true, observacoes: null, ordem_exibicao: ordem, data_inicio: null, data_fim: null, grupo_id: grupo, created_at: '2026-01-01', updated_at: '2026-01-01' });
  const PASTOS = [pasto('p10a', 'P10A', 21.4, 'recria', 'g1', 1), pasto('p10b', 'P10B', 22.9, 'recria', 'g1', 2), pasto('p10c', 'P10C', 20, 'recria', 'g1', 3),
    pasto('p11', 'P11', 35.5, 'cria', null, 4), pasto('p12', 'P12 Retiro do córrego de baixo', 18, 'cria', null, 5), pasto('t1', 'T-1', 12, 'engorda', null, 6)];
  const card = (id: string, pastoId: string, extra: Record<string, unknown> = {}) => ({ id, pasto_id: pastoId, fazenda_id: 'f1', cliente_id: 'cli', ano_mes: '2026-10',
    status: 'rascunho', responsavel_nome: null, lote_mes: null, tipo_uso_mes: null, qualidade_mes: null, observacao_mes: null, created_at: '2026-10-01', updated_at: '2026-10-01', ...extra });
  const CARDS = [card('fa', 'p10a', { lote_mes: 'L1', tipo_uso_mes: 'recria' }), card('fb', 'p10b'), card('fc', 'p10c', { tipo_uso_mes: 'vedado' }),
    card('f11', 'p11', { tipo_uso_mes: 'cria' }), card('f12', 'p12'), card('ft', 't1', { tipo_uso_mes: 'engorda', status: 'fechado' })];
  /* FECH-PASTO-UNIDADE-01 — `&v=piquetes`: o P6 dividido em P6-A e P6-B (grupo com origem no P6): a grade mostra UM card, o do P6, com o
     selo "2 piquetes"; os piquetes não têm card; no Mapa, os polígonos dos piquetes pintam e abrem o P6 */
  const COM_PIQUETES = v === 'piquetes';
  if (COM_PIQUETES) {
    PASTOS.push(pasto('p6', 'P6', 95.6, 'cria', null, 7), { ...pasto('p6a', 'P6-A', 48.1, 'cria', 'g6', 8), data_inicio: '2026-10-01' },
      { ...pasto('p6b', 'P6-B', 47.5, 'cria', 'g6', 9), data_inicio: '2026-10-01' });
    CARDS.push(card('f6', 'p6', { tipo_uso_mes: 'cria' }));
    /* R1 (Gabriel 08/11 19:18, PUR out/26): o P19A com 4 piquetes — o selo na linha do nome cortava "P19A" em "P…" (agora "97,5 ha · 4 piq.") */
    PASTOS.push(pasto('p19a', 'P19A', 97.5, 'cria', null, 10),
      ...['A', 'B', 'C', 'D'].map((l, i) => ({ ...pasto(`p19a${l}`, `P19A-${l}`, 24.4, 'cria', 'g19', 11 + i), data_inicio: '2026-10-01' })));
    CARDS.push(card('f19', 'p19a', { tipo_uso_mes: 'cria' }));
  }
  const CATS = [{ id: 'c-bois', codigo: 'bois', nome: 'Bois', ordem_exibicao: 1 }, { id: 'c-vacas', codigo: 'vacas', nome: 'Vacas', ordem_exibicao: 2 }];
  const item = (f: string, cat: string, q: number, peso: number) => ({ id: `${f}-${cat}`, fechamento_id: f, categoria_id: cat, quantidade: q, peso_medio_kg: peso,
    lote: null, observacoes: null, origem_dado: 'manual', peso_atualizado: false });
  const ITENS: (ReturnType<typeof item> & { lote_id?: string; piquete_id?: string })[] = [item('fa', 'c-bois', 100, 450), item('f11', 'c-vacas', 60, 400), item('ft', 'c-bois', 20, 300)];
  /* FECH-PASTO-UNIDADE-01 F2 — `&v=piquetes7`: o modal do pasto COM piquetes, nas medidas do caso real (PUR out/26): o P7 (97,5 ha) em
     7A 24,76 · 7B 25,11 · 7C 24,35 · 7D 23,32, lançado POR PIQUETES em out/26 e com set/26 também por piquetes (o mês anterior somado, com
     o lote de cada piquete); o P5 (P5-A 101 · P5-B 86,1) com o card vazio (abre em "Pasto inteiro"). As 9 categorias de verdade (a grade
     inteira, Machos e Fêmeas). Nomes e cabeças SINTÉTICOS. */
  const COM_PIQUETES7 = v === 'piquetes7';
  if (COM_PIQUETES7) {
    CATS.splice(0, CATS.length, ...[['mamotes_m', 'Mamotes M'], ['desmama_m', 'Desmama M'], ['garrotes', 'Garrotes'], ['bois', 'Bois'], ['touros', 'Touros'],
      ['mamotes_f', 'Mamotes F'], ['desmama_f', 'Desmama F'], ['novilhas', 'Novilhas'], ['vacas', 'Vacas']].map(([codigo, nome], i) => ({ id: `c-${codigo}`, codigo, nome, ordem_exibicao: i + 1 })));
    PASTOS.push(pasto('p7', 'P7', 97.54, 'cria', null, 7),
      ...[['7a', '7A', 24.76], ['7b', '7B', 25.11], ['7c', '7C', 24.35], ['7d', '7D', 23.32]].map(([id, nome, ha], i) =>
        ({ ...pasto(`p${id}`, String(nome), Number(ha), 'cria', 'g7', 8 + i), data_inicio: '2026-10-01' })),
      pasto('p5', 'P5', 187.1, 'cria', null, 12),
      { ...pasto('p5a', 'P5-A', 101, 'cria', 'g5', 13), data_inicio: '2026-10-01' }, { ...pasto('p5b', 'P5-B', 86.1, 'cria', 'g5', 14), data_inicio: '2026-10-01' });
    CARDS.push(card('f7', 'p7', { tipo_uso_mes: 'cria', qualidade_mes: 6 }), card('f7-9', 'p7', { ano_mes: '2026-09', status: 'fechado', tipo_uso_mes: 'cria' }),
      card('f5', 'p5', { tipo_uso_mes: 'cria' }));
    const piq = (f: string, cat: string, q: number, peso: number, p: string, lote?: string) => ({ ...item(f, `c-${cat}`, q, peso), id: `${f}-${cat}-${p}`, piquete_id: p, ...(lote ? { lote_id: lote } : {}) });
    ITENS.push(piq('f7', 'vacas', 40, 450, 'p7a'), piq('f7', 'mamotes_f', 14, 32, 'p7a'), piq('f7', 'vacas', 34, 445, 'p7b'), piq('f7', 'mamotes_f', 14, 31, 'p7b'),
      piq('f7', 'mamotes_m', 46, 31, 'p7c'), piq('f7', 'novilhas', 22, 290, 'p7d'),
      piq('f7-9', 'vacas', 74, 450, 'p7a', 'l-dm6'), piq('f7-9', 'mamotes_f', 28, 30, 'p7b'), piq('f7-9', 'mamotes_m', 46, 30, 'p7c'), piq('f7-9', 'novilhas', 22, 285, 'p7d', 'l-px2'));
  }
  /* FECH-TOPO-02 — `&mes=9`: set/26 com os MESMOS cards, todos FECHADOS (o mês fechado do print: "Mês fechado" e o "Preço do rebanho →") */
  const MES_DA_BANCADA = q.get('mes') === '9' ? 9 : 10;
  if (MES_DA_BANCADA === 9) {
    CARDS.push(...CARDS.map((c) => ({ ...c, id: `${c.id}-9`, ano_mes: '2026-09', status: 'fechado' })));
    ITENS.push(...ITENS.map((i) => ({ ...i, id: `${i.id}-9`, fechamento_id: `${i.fechamento_id}-9` })));
  }
  /* LOTES-03 F1 — `&v=lotes`: o P10A com 2 categorias com cabeça e lote (o campo Lote do modal); sem o `v`, o cenário de sempre */
  /* L1 (Gabriel 09/11) — `&cria=1`: o P10A inteiro (as 2 categorias) no lote da cria SEM carimbo (l-vp4): "sem carimbo · definir" no campo Lote, no seletor e no popup */
  const COM_CRIA = q.get('cria') === '1';
  const COM_LOTES = v === 'lotes' || COM_CRIA;
  if (COM_LOTES) {
    Object.assign(ITENS[0], { lote_id: COM_CRIA ? 'l-vp4' : 'l-dm6' });
    ITENS.push({ ...item('fa', 'c-vacas', 30, 420), lote_id: COM_CRIA ? 'l-vp4' : 'l-px2' });
  }
  /* MAPA-LOTES-01 (C2) — `&v=mapa`: o Fechamento abre na vista Mapa (a escolha guardada); os polígonos SINTÉTICOS de 5 dos 6 pastos
     (o P12 fica sem desenho: vai para a faixa) e a área total por baixo */
  const quadrado = (id: string, pastoId: string | null, tipo: string, x: number, y: number, w: number, h: number) => ({ id, fazenda_id: 'f1', cliente_id: 'cli',
    pasto_id: pastoId, tipo, nome_original: id, cor: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    geojson: { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] } });
  const GEOS = [quadrado('g-total', null, 'area_total', -47.905, -15.805, 0.03, 0.02),
    quadrado('g-p10a', 'p10a', 'pasto', -47.904, -15.804, 0.006, 0.008), quadrado('g-p10b', 'p10b', 'pasto', -47.898, -15.804, 0.006, 0.008),
    quadrado('g-p10c', 'p10c', 'pasto', -47.892, -15.804, 0.006, 0.008), quadrado('g-p11', 'p11', 'pasto', -47.904, -15.795, 0.01, 0.008),
    quadrado('g-t1', 't1', 'pasto', -47.893, -15.795, 0.005, 0.006)];
  if (v === 'mapa') { try { window.localStorage.setItem('fechamento-pastos:vista', 'mapa'); } catch { /* sem armazenamento */ } }
  if (COM_PIQUETES) GEOS.push(quadrado('g-p6a', 'p6a', 'pasto', -47.887, -15.804, 0.005, 0.008), quadrado('g-p6b', 'p6b', 'pasto', -47.882, -15.804, 0.005, 0.008));
  const ALOC = [{ fechamento_id: 'fa', lote: '', pasto_id: 'p10a' }, { fechamento_id: 'fa', lote: '', pasto_id: 'p10b' },
    { fechamento_id: 'f11', lote: '', pasto_id: 'p11' }, { fechamento_id: 'f11', lote: '', pasto_id: 'p12' }];
  const lotacao = () => {
    const area = (id: string) => PASTOS.find((x) => x.id === id)?.area_produtiva_ha ?? 0;
    const porPasto = new Map<string, { cab: number; kg: number; ua: number; recebe: boolean }>();
    for (const c of CARDS) porPasto.set(c.pasto_id, { cab: 0, kg: 0, ua: 0, recebe: false });
    for (const c of CARDS) {
      const its = ITENS.filter((i) => i.fechamento_id === c.id);
      if (!its.length) continue;
      const cab = its.reduce((s, i) => s + i.quantidade, 0); const kg = its.reduce((s, i) => s + i.quantidade * i.peso_medio_kg, 0);
      const ua = its.reduce((s, i) => s + (i.peso_medio_kg > 0 ? i.quantidade * i.peso_medio_kg / 450 : i.quantidade), 0);
      const S = ALOC.filter((a) => a.fechamento_id === c.id).map((a) => a.pasto_id); const dest = S.length ? S : [c.pasto_id];
      const A = dest.reduce((s, id) => s + area(id), 0);
      for (const id of dest) {
        const f = dest.length === 1 ? 1 : area(id) / A; const atual = porPasto.get(id) ?? { cab: 0, kg: 0, ua: 0, recebe: false };
        porPasto.set(id, { cab: atual.cab + cab * f, kg: atual.kg + kg * f, ua: atual.ua + ua * f, recebe: atual.recebe || id !== c.pasto_id });
      }
    }
    return [...porPasto].map(([id, v]) => ({ pasto_id: id, grupo_id: PASTOS.find((x) => x.id === id)?.grupo_id ?? null, area_ha: area(id), cabecas: v.cab, kg: v.kg, ua: v.ua,
      kg_ha: v.kg / area(id), ua_ha: v.ua / area(id), recebe_de_outro_card: v.recebe }));
  };
  /* o filtro do `eq`/`in` só nas colunas que a linha tem (a linha sem a coluna passa, como antes) */
  const filtrar = <T extends Record<string, unknown>>(linhas: T[], e: { eq: Record<string, unknown>; in?: Record<string, unknown[]> }) => linhas.filter((r) =>
    Object.entries(e.eq).every(([k, x]) => !(k in r) || r[k] === x) && Object.entries(e.in ?? {}).every(([k, xs]) => !(k in r) || xs.includes(r[k])));
  g.__bancoBancada = {
    from: (t: string, e: { eq: Record<string, unknown>; in?: Record<string, unknown[]> }) => (
      /* F2 `&v=piquetes7`: os leitores do modal filtram por grupo/origem/pasto (`in`/`eq`); sem a variante, a resposta de sempre */
      t === 'pastos' ? (COM_PIQUETES7 ? filtrar(PASTOS, e) : PASTOS) : t === 'pasto_grupos' ? (COM_PIQUETES7 ? filtrar : (l: unknown[]) => l)([{ id: 'g1', fazenda_id: 'f1', nome: 'P10', ativo: true, pasto_origem_id: null },
        ...(COM_PIQUETES ? [{ id: 'g6', fazenda_id: 'f1', nome: 'P6', ativo: true, pasto_origem_id: 'p6' }, { id: 'g19', fazenda_id: 'f1', nome: 'P19A', ativo: true, pasto_origem_id: 'p19a' }] : []),
        ...(COM_PIQUETES7 ? [{ id: 'g7', fazenda_id: 'f1', nome: 'P7', ativo: true, pasto_origem_id: 'p7' }, { id: 'g5', fazenda_id: 'f1', nome: 'P5', ativo: true, pasto_origem_id: 'p5' }] : [])], e)
      : t === 'fechamento_pastos' ? CARDS.filter((c) => (!e.eq.ano_mes || c.ano_mes === e.eq.ano_mes) && (!COM_PIQUETES7 || !e.eq.pasto_id || c.pasto_id === e.eq.pasto_id))
      : t === 'fechamento_pasto_itens' ? ITENS.filter((i) => !e.eq.fechamento_id || i.fechamento_id === e.eq.fechamento_id)
      : t === 'categorias_rebanho' ? CATS : t === 'fechamento_alocacoes' ? ALOC
      : t === 'fazenda_geometrias' ? GEOS
      : (COM_LOTES || COM_PIQUETES7) && t === 'rebanho_lote_cadastros' ? LOTES_BANCADA.CADASTROS
      /* FECH-REABRIR-JUNTO-01 — `&v=trava`: o Valor do Rebanho de out/26 VALIDADO (o caso EXP R_04): o modal abre com o aviso e o "Reabrir e editar" */
      : v === 'trava' && t === 'valor_rebanho_realizado_validado' ? [{ fazenda_id: 'f1', ano_mes: '2026-10', status: 'validado' }]
      : []),
    rpc: (fn: string, a: Record<string, unknown>) => (fn === 'fn_lotacao_do_mes' ? lotacao()
      /* F2 `&v=piquetes7`: a área de cada piquete NO MÊS (a leitura da casa) */
      : COM_PIQUETES7 && fn === 'fn_pastos_area_do_mes' ? PASTOS.map((x) => ({ pasto_id: x.id, ano_mes: a.p_de, area_ha: x.area_produtiva_ha, fonte: 'vigencia' }))
      : COM_LOTES || COM_PIQUETES7 ? LOTES_BANCADA.bancoDeLotes().rpc(fn, a) : null),
  };
  const montarFechamento = async () => {
    const { FechamentoTab } = await import('@/pages/FechamentoTab');
    /* FECH-TOPO-COMPACTO-01 — `v=topo`: o topo com TODOS os botões (os três que só aparecem com o hospedeiro que navega) */
    const navegar = () => {};
    /* FECH-TOPO-02 acerto 1: a vista Mapa (v=mapa) com o MESMO hospedeiro do topo — antes só o `v=topo` navegava e a foto do mapa saía
       sem GMD e Mapa (na tela real eles estão nas duas vistas) */
    montar(v === 'topo' || v === 'mapa'
      ? <FechamentoTab filtroAnoInicial="2026" filtroMesInicial={MES_DA_BANCADA} onNavigateToConferenciaGmd={navegar} onNavigateToMapaPastos={navegar}
          onNavigateToValorRebanho={navegar} />
      : <FechamentoTab filtroAnoInicial="2026" filtroMesInicial={MES_DA_BANCADA} />);
  };
  void montarFechamento();
} else if (tela === 'valor-rebanho') {
  /* REVALIDAR-BG-SET26 — Valor do Rebanho (a tela REAL), dado SINTÉTICO de 2026: jul validado e fechado, ago com a cadeia quebrada,
     set invalidado e aberto (o caso da BG), out sem snapshot. O aviso do snapshot é um ESTADO da faixa de 22px do topo: trocar de mês
     não move a régua, a tabela nem os gráficos (o desloca prova). `v=sempreco`: o Revalidar desabilitado com o porquê. */
  const FAZ = { id: 'f1', nome: 'Faz. Exemplo Sintética', codigo: 'EXS', cliente_id: 'cli', tem_pecuaria: true };
  g.__fazendaBancada = { fazendas: [FAZ], fazendaAtual: FAZ, isGlobal: false, fazendaId: FAZ.id };
  const CLI = { id: 'cli', nome: 'Cliente Bancada', perfil: 'admin_agroinblue' };
  g.__clienteBancada = { clienteAtual: CLI, clientes: [CLI], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  const VAL = [['2026-07', 'validado'], ['2026-08', 'cadeia_quebrada'], ['2026-09', 'invalidado']].map(([m, st]) => ({ fazenda_id: 'f1', cliente_id: 'cli', ano_mes: m, status: st,
    valor_total: 3_300_000, cabecas: 980, peso_medio_kg: 310, arrobas_total: 10_100, preco_arroba_medio: 320, valor_cabeca_medio: 3370 }));
  const FECH = [['2026-07', 'fechado'], ['2026-08', 'fechado'], ['2026-09', 'aberto']].map(([m, st]) => ({ fazenda_id: 'f1', cliente_id: 'cli', ano_mes: m, status: st,
    valor_total: 3_300_000, peso_total_kg: 303_800, fechado_em: '2026-10-08T21:53:41Z' }));
  const CARDS = ['2026-07', '2026-08', '2026-09'].map((m, i) => ({ id: `fp${i}`, pasto_id: 'p1', fazenda_id: 'f1', cliente_id: 'cli', ano_mes: m, status: 'fechado' }));
  g.__bancoBancada = {
    from: (t: string, e: { eq: Record<string, unknown> }) => (
      t === 'valor_rebanho_realizado_validado' ? VAL.filter((r) => !e.eq.ano_mes || r.ano_mes === e.eq.ano_mes)
      : t === 'valor_rebanho_fechamento' ? FECH.filter((r) => !e.eq.ano_mes || r.ano_mes === e.eq.ano_mes)
      : t === 'fechamento_pastos' ? CARDS.filter((c) => !e.eq.ano_mes || c.ano_mes === e.eq.ano_mes)
      : []),
    rpc: () => null,
  };
  const montarValor = async () => {
    const { ValorRebanhoTab } = await import('@/pages/ValorRebanhoTab');
    montar(<ValorRebanhoTab lancamentos={[]} saldosIniciais={[]} filtroAnoInicial="2026" filtroMesInicial={9} />);
  };
  void montarValor();
} else if (tela === 'lotes') {
  /* LOTES-03 F1 — Produção › Lotes (a tela REAL), dado SINTÉTICO (dados/lotes.ts): a lista, o assistente "+ Novo lote" e a ficha.
     `&v=vazio` = a fazenda sem nenhum lote */
  const FAZ = { id: 'f1', nome: 'Faz. Pureza Sintética', codigo: 'PUR', cliente_id: 'cli', tem_pecuaria: true };
  g.__fazendaBancada = { fazendas: [FAZ], fazendaAtual: FAZ, isGlobal: false, fazendaId: FAZ.id };
  const CLI = { id: 'cli', nome: 'Cliente Bancada', perfil: 'admin_agroinblue' };
  g.__clienteBancada = { clienteAtual: CLI, clientes: [CLI], isAdmin: true, perfil: 'admin_agroinblue', loading: false };
  g.__bancoBancada = LOTES_BANCADA.bancoDeLotes(v === 'vazio');
  const montarLotes = async () => {
    const { LotesTab } = await import('@/pages/LotesTab');
    montar(<LotesTab />);
  };
  void montarLotes();
} else if (tela === 'documentos-do-mes') {
  /* FECH-DOCS-02 — o "Documentos do mês" (dado SINTÉTICO): `&n=` documentos no mês (11 e 25 no gate), tipos do catálogo, nomes do
     WhatsApp (o pior caso do corte), out/2026; as setas trocam para nov (0 documentos) e set (3). O topo do diálogo é preso: trocar de
     mês só mexe no rodapé. */
  const N = Number(q.get('n') ?? '11');
  const TIPOS = ['Mapa de rebanho', 'Nascimentos', 'Entradas', 'Vendas', 'Transferências', 'Mortes', 'Desmama', 'Engorda e reclassificação',
    'Pesagem', 'Abate e romaneio', 'Manejo sanitário e vacinação', 'Reprodução (IATF e diagnóstico)', 'Suplementação e trato', 'Chuvas',
    'Estoque de insumos', 'Relatório do campeiro', 'Outro'].map((nome, k) => ({ id: `t${k}`, nome, grupo: k < 10 ? 'Rebanho' : k < 13 ? 'Manejo' : k < 16 ? 'Campo' : 'Outros', ordem: (k + 1) * 10 }));
  const doc = (k: number, mes: string) => ({ id: `d-${mes}-${k}`, tipo_id: `t${(k * 5) % 17}`, ano_mes: mes, versao: 1, url: k % 9 === 4 ? null : `cli/f1/${mes}/d${k}.pdf`,
    nome: k % 3 === 0 ? `WhatsApp Image 2026-10-${String((k % 28) + 1).padStart(2, '0')} at 14.32.${String(k).padStart(2, '0')} (1).jpeg` : `Doc ${k + 1}.pdf`,
    tamanho_bytes: k % 4 === 0 ? 12_345_678 : 345_678, uploaded_em: `2026-10-${String((k % 28) + 1).padStart(2, '0')}T12:00:00Z` });
  const DOCS = [...Array.from({ length: N }, (_, k) => doc(k, '2026-10')), ...Array.from({ length: 3 }, (_, k) => doc(k, '2026-09'))];
  g.__bancoBancada = {
    from: (t: string, e: { eq: Record<string, unknown> }) => (t === 'catalogo_itens' ? TIPOS
      : t === 'pecuaria_fechamento_documentos' ? DOCS.filter((d) => d.ano_mes === e.eq.ano_mes) : []),
  };
  const montarDocs = async () => {
    const { DocumentosDoMesDialog } = await import('@/components/pecuaria/DocumentosDoMesDialog');
    const { useDocumentosDoMes } = await import('@/hooks/useDocumentosDoMes');
    function Hospedeiro() {
      const [mes, setMes] = React.useState('2026-10');
      const api = useDocumentosDoMes('cli', 'f1', mes);
      return <DocumentosDoMesDialog aberto aoFechar={() => {}} fazendaNome="Faz. Exemplo Sintética do Retiro" anoMes={mes} aoTrocarMes={setMes} api={api} />;
    }
    montar(<Hospedeiro />);
  };
  void montarDocs();
} else if (tela === 'comparar-cadastro') {
  /* NOTA-FORNECEDOR-COMPARAR-01 — o "Atualizar o cadastro" (comparar antes de gravar), dados SINTETICOS e longos:
     `v=` ''  o cadastro sem CNPJ, nome digitado a' mao (diferente), cidade igual · `errado` o cadastro com OUTRO CNPJ (o aviso e os botoes) */
  const montarComparar = async () => {
    const { CompararCadastroDialog } = await import('@/components/financeiro-v2/CompararCadastroDialog');
    const hoje = v === 'errado'
      ? { nome: 'Posto Exemplo Combustiveis e Lubrificantes da Regiao Centro Oeste Sintetico Ltda', cpf_cnpj: '11.444.777/0001-61', municipio: 'Campo Grande', uf: 'MS' }
      : { nome: 'Pec.3M-Esc. Garças Cooperativa Agroindustrial Sintetica dos Produtores de Exemplo', cpf_cnpj: null, municipio: 'Campo Grande', uf: 'MS' };
    const proposta = { nome: 'COOPERATIVA AGROINDUSTRIAL SINTETICA DOS PRODUTORES RURAIS DE EXEMPLO E REGIAO LTDA', nome_fantasia: 'COOP EXEMPLO',
      cpf_cnpj: '11.222.333/0004-24', inscricao_estadual: '283456789', logradouro: 'Rodovia Sintetica BR-000 Km 12, Galpao 3', numero: 'S/N', bairro: 'Distrito Industrial',
      cep: '79000-000', municipio: 'Campo Grande', uf: 'MS' };
    raiz.render(<CompararCadastroDialog hoje={hoje} proposta={proposta} rotuloOrigem="Da nota (Receita)" uso={{ lancamentos: 9999, ultimo: '2026-10-20' }}
      emitente={{ documento: '11222333000424', nomes: [proposta.nome, proposta.nome_fantasia] }} onConfirmar={async () => null} onClose={() => {}}
      onEscolherOutro={() => {}} onCadastrarNovo={() => {}} />);
  };
  void montarComparar();
} else if (tela === 'itens-nota') {
  /* ITENS-NOTA-01 — os itens da nota fora do lancamento, com dado SINTETICO (a nota de 3 itens do teste, repetida):
     `v=` ''         o dialogo da aba Documentos da OC, PIOR CASO: 40 itens, metade com descricao de 120 caracteres (o corpo rola no quadro)
         `guardadas` "Itens das notas ja' guardadas" (o backfill): 30 candidatas, 4 sem arquivo no armazenamento; o Simular le^ de verdade */
  const montarItens = async () => {
    const { itensDoXml } = await import('@/lib/financeiro/nfe/itensDaNota');
    const { XML_ITENS_SINTETICO } = await import('@/lib/financeiro/nfe/__fixtures__/xmlItensSintetico');
    const bytes = new TextEncoder().encode(XML_ITENS_SINTETICO).buffer;
    if (v === 'guardadas') {
      const { ItensDasNotasGuardadasDialog } = await import('@/components/financeiro-v2/ItensDasNotasGuardadasDialog');
      const chave = (k: number) => `5026091122233300042455001${String(k).padStart(9, '0')}1000000010`;
      const docs = Array.from({ length: 30 }, (_, k) => ({ chave_acesso: chave(k), numero: String(1000 + k).padStart(9, '0'), url: k % 7 === 3 ? `cli/sumiu-${k}.pdf` : `cli/nota-${k}.xml` }));
      const nfe = utf8(montarNFe({}));   /* a NF-e SINTETICA completa (6 itens) — o arquivo que o Simular le^ de verdade */
      g.__arquivosBancada = Object.fromEntries(docs.filter((d) => d.url.endsWith('.xml')).map((d) => [d.url, nfe]));
      g.__bancoBancada = {
        from: (t: string) => t === 'financeiro_lancamento_documentos' ? docs.slice(0, 18) : t === 'zoo_operacao_documentos' ? docs.slice(18) : [],
        rpc: (fn: string, a: any) => fn === 'fn_nota_fiscal_gravar' ? { acao: 'criada', itens: a.p_itens.length, soma_cent: a.p_nota.totais.nota_cent, nota_cent: a.p_nota.totais.nota_cent, confere: true, simulado: true } : null,
      };
      raiz.render(<ItensDasNotasGuardadasDialog clienteId="cli" onClose={() => {}} />);
      return;
    }
    const { ItensDaNotaDialog } = await import('@/components/financeiro-v2/ItensDaNotaDialog');
    const base: any = itensDoXml(bytes);
    const LONGA = 'DEFENSIVO AGRICOLA SINTETICO DE NOME MUITO COMPRIDO PARA O PIOR CASO DA BANCADA COM EMBALAGEM DE 20 LITROS E LOTE ';
    const itens = Array.from({ length: 40 }, (_, k) => ({ ...base.itens[k % 3], nItem: k + 1, descricao: k % 2 ? `${LONGA}${k}`.slice(0, 120) : base.itens[k % 3].descricao }));
    const soma = (f: (i: any) => number) => itens.reduce((s, i) => s + f(i), 0);
    const lidos = { ...base, itens, totais: { ...base.totais, produtosCent: soma((i) => i.produtoCent), descontoCent: soma((i) => i.descontoCent),
      freteCent: soma((i) => i.freteCent), seguroCent: soma((i) => i.seguroCent), outrasCent: soma((i) => i.outrasCent), notaCent: soma((i) => i.liquidoCent) } };
    const cabecalho = { chave: '50260911222333000424550010000032411000000010', origem: 'xml', numero: '3241', serie: '1', emissao: '2026-09-29', natureza: 'VENDA',
      regime: '3', emitenteDocumento: '11222333000424', emitenteNome: 'COOPERATIVA AGROINDUSTRIAL SINTETICA DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA' };
    raiz.render(<ItensDaNotaDialog clienteId="cli" chave={cabecalho.chave} onClose={() => {}} carregar={async () => ({ cabecalho, lidos } as any)} />);
  };
  void montarItens();
} else if (tela === 'documento-nota') {
  /* P127 + P128c — o "Novo documento" do Editar lançamento que LÊ A NOTA solta no Arquivo. O cenário solta o XML SINTÉTICO exposto aqui
     (`__xmlDaBancada`: NF 74974 no molde do print, R$ 408,77, 1 duplicata, 1 item, emitente com nome comprido) ou um PDF que não se lê.
     O lançamento diz outra emissão, outro valor e outro favorecido: a faixa mostra as três divergências lado a lado. */
  const montarDoc = async () => {
    const { FormDocumento } = await import('@/components/financeiro-v2/AbaDocumentosLancamento');
    g.__xmlDaBancada = montarNFe({ numero: '74974', vNF: '408.77', duplicatas: [['001', '2026-09-24', '408.77']],
      nomeEmitente: 'COMERCIO SINTETICO DE PARAFUSOS E FERRAMENTAS INDUSTRIAIS DO CENTRO OESTE LTDA',
      itens: [['PARAFUSO SINTETICO SEXTAVADO M8 X 40 ZINCADO', '100.0000', 'UN', '408.77']] });
    const api: any = { documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
      registrar: async () => ({ id: 'x', origem: 'lancamento', operacaoId: null }), editar: async () => true, cancelar: async () => true,
      anexar: async () => true, urlAssinada: async () => null, recarregar: async () => {} };
    /* P164 — `v=confere`: o lançamento diz o valor da nota (e não tem emitente): a nota CONFERE e a faixa diz, pela prévia do banco falso (a
       `fn_nota_completar` com `p_simular`), o que o lançamento fica — nº, tipo e competência */
    const confere = q.get('v') === 'confere';
    /* P167 — `v=cancelar`: editar a NF ligada a 6 parcelas e abrir "Cancelar nota" (a confirmação no RODAPÉ, à vista); `v=repetida`: a mesma NF
       (o mesmo XML) já registrada aqui — a faixa "Esta NF já está registrada…" com "Abrir a que já existe" */
    const DOC_BANCADA = { id: 'doc-bancada', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf 74974', numero: '000.074.974',
      serie: '1', chaveAcesso: null, dataEmissao: '2026-09-30', valorDocumento: 408.77, url: 'x', tipo: 'application/xml', tamanhoBytes: 1, observacao: null,
      emitenteId: null, emitenteNome: 'COMERCIO SINTETICO DE PARAFUSOS E FERRAMENTAS INDUSTRIAIS DO CENTRO OESTE LTDA', emitenteDocumento: null, cancelado: false,
      canceladoMotivo: null, versao: 1, ligadoAQtd: 6 };
    if (q.get('v') === 'repetida') api.documentos = [DOC_BANCADA];
    if (confere) g.__bancoBancada = { from: () => [], rpc: (fn: string, a: any) => (fn !== 'fn_nota_completar' ? null : { ok: true, recusas: [], efeito_dre: [],
      linhas: (a.p_lancamentos ?? []).map((x: any) => ({ id: x.id, descricao: null, situacao: 'conciliada', parcela_n: null, campos: {
        numero_documento: { hoje: '74974', fica: x.numero_documento, muda: true, hoje_nome: null, fica_nome: null, cadeado: null },
        tipo_documento: { hoje: null, fica: x.tipo_documento, muda: true, hoje_nome: null, fica_nome: null, cadeado: null },
        data_competencia: { hoje: '2026-08-24', fica: x.data_competencia, muda: true, hoje_nome: null, fica_nome: null, cadeado: null } } })) }) };
    montar(<FormDocumento api={api} documento={q.get('v') === 'cancelar' ? DOC_BANCADA : null} clienteId="cli" onFechar={() => {}} onAbrirExistente={() => {}}
      sugestao={confere ? { numero: '74974', dataEmissao: '2026-08-24', valor: 408.77, emitenteId: null }
        : { numero: '74974', dataEmissao: '2026-08-24', valor: 400, emitenteId: LEITOR[0]?.id ?? null }}
      completarPelaNota={confere ? { lancamentoId: 'lanc-bancada', onCompletado: () => {} } : undefined}
      onVerOQueANotaMuda={async () => null} />);
  };
  void montarDoc();
} else if (tela === 'previa-completar') {
  /* P128b — a PRÉVIA CAMPO A CAMPO do "Completar com a nota", no molde da Casa da Cerca (5 parcelas: 1 conciliada, 3 pagas, 1 programada) com
     nomes SINTÉTICOS compridos. O banco falso faz o papel da `fn_nota_completar` com `p_simular`: o que o pedido traz muda, o resto é "igual",
     conta/valor/vencimento das pagas têm cadeado. `cam=2`: o caminho 2 (Venc./Valor da nota na programada); `v=recusa`: o mês fechado. */
  const montarPrevia = async () => {
    const { PreviaCompletar } = await import('@/components/financeiro-v2/PreviaCompletar');
    const { baseDaDescricao } = await import('@/lib/financeiro/nfe/notaCompletar');
    const cam2 = q.get('cam') === '2';
    const SIT = ['conciliada', 'realizada', 'realizada', 'realizada', 'programada'];
    const NOMES: Record<string, string> = { f0: 'Comercio Sintetico de Arames e Mourões do Centro Oeste Ltda', f1: 'Cercas Sinteticas Rurais Ltda',
      z0: 'Fazenda Sintetica Boa Vista do Rio Comprido', z1: 'Fazenda Sintetica Boa Vista', c0: 'Banco Sintetico 0001-2 c/c 99999-9', c1: 'Caixa Sintetica',
      p0: 'Manutenção de Cercas e Benfeitorias', p1: 'Investimento em Benfeitorias Rurais', s0: '2030/31', s1: '2031/32' };
    const HOJE: Record<string, unknown> = { descricao: 'CERCAS SINTETICAS - parcela', favorecido_id: 'f0', fazenda_id: 'z0', conta_bancaria_id: 'c0',
      plano_conta_id: 'p0', numero_documento: '', data_competencia: '2031-05-02', safra_id: 's0' };
    g.__bancoBancada = { from: () => [], rpc: (fn: string, a: any) => {
      if (fn !== 'fn_nota_completar') return null;
      if (q.get('v') === 'recusa') return { ok: false, recusas: [{ frase: 'O mês 05/2031 está fechado: reabra antes de mudar a competência de «Cercas Sinteticas Rurais Ltda - parcela 1/5».' }], linhas: [], efeito_dre: [] };
      const linhas = (a.p_lancamentos ?? []).map((x: any, k: number) => {
        const paga = SIT[k] !== 'programada';
        const campos: Record<string, unknown> = {};
        /* P163 v4 — `v=difere`: a 3/5 numa fazenda diferente (a coluna Fazenda aparece; as outras opcionais, iguais, não) */
        const hojeDela: Record<string, unknown> = q.get('v') === 'difere' && k === 2 ? { ...HOJE, fazenda_id: 'z1' } : HOJE;
        for (const [c, h] of Object.entries(hojeDela)) {
          const fica = c in x ? x[c] : h;
          const cad = paga && c === 'conta_bancaria_id' ? `${SIT[k]}: conta, valor e vencimento não mudam` : null;
          campos[c] = { hoje: h, fica: cad ? h : fica, muda: !cad && fica !== h, hoje_nome: NOMES[String(h)] ?? null, fica_nome: NOMES[String(fica)] ?? null, cadeado: cad };
        }
        const venc = `2031-${String(5 + k).padStart(2, '0')}-20`;
        campos.data_vencimento = { hoje: venc, fica: x.data_vencimento ?? venc, muda: !paga && !!x.data_vencimento && x.data_vencimento !== venc, cadeado: paga ? 'paga' : null };
        campos.valor = { hoje: 631.98, fica: x.valor ?? 631.98, muda: !paga && x.valor !== undefined && x.valor !== 631.98, cadeado: paga ? 'paga' : null };
        return { id: x.id, descricao: `CERCAS SINTETICAS - parcela ${k + 1}/5`, situacao: SIT[k], parcela_n: k + 1, campos };
      });
      /* o efeito no DRE como o banco o calcula: só onde o subcentro ou o mês mudam (P163-1 — era fixo, e dizia "vão para Investimento" com o
         Subcentro desmarcado) */
      const grupos = new Map<string, { mes_de: string; subcentro_de: string; mes_para: string; subcentro_para: string; valor: number; lancamentos: number }>();
      for (const l of linhas) {
        const c: any = l.campos;
        const sub_de = NOMES[String(c.plano_conta_id.hoje)]; const sub_para = NOMES[String(c.plano_conta_id.fica)];
        const mes_de = String(c.data_competencia.hoje).slice(0, 7); const mes_para = String(c.data_competencia.fica ?? c.data_competencia.hoje).slice(0, 7);
        if (sub_de === sub_para && mes_de === mes_para) continue;
        const k = [mes_de, sub_de, mes_para, sub_para].join('|');
        const g0 = grupos.get(k) ?? { mes_de, subcentro_de: sub_de, mes_para, subcentro_para: sub_para, valor: 0, lancamentos: 0 };
        g0.valor += Number(c.valor.fica); g0.lancamentos += 1; grupos.set(k, g0);
      }
      return { ok: true, recusas: [], linhas, efeito_dre: [...grupos.values()].map((x) => ({ ...x, valor: Math.round(x.valor * 100) / 100 })) };
    } };
    const alvos = [1, 2, 3, 4, 5].map((k) => ({ id: `l${k}`, programada: k === 5, notaValorCent: 63200, notaVencimento: `2031-${String(5 + k).padStart(2, '0')}-21`,
      pagamento: k < 5 ? `2031-${String(4 + k).padStart(2, '0')}-20` : null }));
    /* P163 v4 — as opções dos seletores do "Para todas" (a coluna opcional que aparece mede o seletor, não uma célula vazia); os mesmos ids de NOMES */
    const conta = (id: string) => ({ id, nome_conta: NOMES[id], nome_exibicao: NOMES[id], banco: null, fazenda_id: 'z0', tipo_conta: null, codigo_conta: null, agencia: null, numero_conta: null, conta_digito: null });
    const OPCOES: any = {
      fornecedores: ['f0', 'f1'].map((id) => ({ id, nome: NOMES[id], cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null })),
      fazendas: ['z0', 'z1'].map((id) => ({ id, nome: NOMES[id] })), contas: ['c0', 'c1'].map(conta),
      classificacoes: ['p0', 'p1'].map((id) => ({ id, subcentro: NOMES[id], centro_custo: 'Benfeitorias', grupo_custo: 'Infraestrutura', macro_custo: 'Investimentos', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' })),
      safras: ['s0', 's1'].map((id) => ({ id, nome: NOMES[id], codigo: NOMES[id], escopo_negocio: 'pecuaria', ativa: true })) };
    /* P163 v4 — o "para todas" igual ao de hoje (fornecedor, fazenda, conta, subcentro): como no mock, só Comp., Descrição e Nº mudam */
    montar(<PreviaCompletar open opcoes={OPCOES} onFechar={() => {}} clienteId="cli" alvos={alvos} rotulos={Object.fromEntries(alvos.map((x, k) => [x.id, `${k + 1}/5`]))}
      cabecalho="NF 000.004.875 · Cercas Sinteticas Rurais Ltda · R$ 3.160,00" valorNotaCent={316000}
      todasIniciais={{ descricaoBase: baseDaDescricao('Cercas Sinteticas Rurais Ltda - 2/5'), favorecidoId: 'f0', fazendaId: 'z0', contaId: 'c0', planoContaId: 'p0',
        numeroDocumento: 'NF 000.004.875', competencia: '2031-06-02', safraId: null }}
      atualizarNaoPagas={cam2} juntar={!cam2} chave="50310611222333000181550010000048751123456780" onConfirmar={async () => null} />);
  };
  void montarPrevia();
} else if (tela === 'lancamento') {
  /* com `desc`, a edição é parcela de uma compra parcelada SEM número de contrato: o rodapé fala dela (a descrição do contrato é a longa) */
  /* ACESSOS-PERFIL-01 — a aba Auditoria: eventos de dois membros e um sem autor (com e sem `via`), nomes pela fonte única. */
  const AUDIT = [
    { id: 'a1', acao: 'editou', usuario_id: 'u-outro', created_at: '2026-10-12T14:05:00Z', dados_anteriores: { valor: 1000, descricao: 'Sal' }, dados_novos: { valor: 1345.5, descricao: DESC_LONGA }, via: null },
    { id: 'a2', acao: 'editou', usuario_id: null, created_at: '2026-10-11T10:00:00Z', dados_anteriores: { status_transacao: 'previsto' }, dados_novos: { status_transacao: 'programado' }, via: 'sistema:fn_recorrencia_gerar' },
    { id: 'a3', acao: 'editou', usuario_id: null, created_at: '2026-09-11T10:00:00Z', dados_anteriores: { valor: 900 }, dados_novos: { valor: 1000 }, via: null },
    { id: 'a4', acao: 'editou', usuario_id: 'u1', created_at: '2026-09-10T15:00:00Z', dados_anteriores: { observacao: null }, dados_novos: { observacao: 'conferido' }, via: null },
    /* P116 — o Salvar sem mudança (só `updated_at`: some), o "sistema" sem rotina (correção por migration: "sistema · manutenção"), a forma
       de pagamento (antes "ajuste técnico") e o "criou" do gatilho (a criação; a linha do registro não duplica) */
    { id: 'a5', acao: 'editou', usuario_id: 'u1', created_at: '2026-09-10T15:00:19Z', dados_anteriores: { updated_at: 'x' }, dados_novos: { updated_at: 'y' }, via: null },
    { id: 'a6', acao: 'editou', usuario_id: null, created_at: '2026-09-09T12:00:00Z', dados_anteriores: { tipo_operacao: '2-Saídas' }, dados_novos: { tipo_operacao: '1-Entradas' }, via: 'sistema' },
    { id: 'a7', acao: 'editou', usuario_id: 'u-outro', created_at: '2026-09-08T12:00:00Z', dados_anteriores: { forma_pagamento: 'Pix' }, dados_novos: { forma_pagamento: 'Cartão de crédito' }, via: null },
    { id: 'a8', acao: 'criou', usuario_id: 'u1', created_at: '2026-09-01T09:12:47Z', dados_anteriores: null, dados_novos: { descricao: DESC_LONGA }, via: null }]
    /* P116 — `aud=um`: uma pessoa só (a coluna do autor aparece mesmo assim, 62px) */
    .map((e) => (q.get('aud') === 'um' ? { ...e, usuario_id: 'u1', via: null } : e));
  /* DOC-NOTA-XML-PDF-01 — `docs=nota`: a aba Documentos com a MESMA nota em PDF e XML (uma linha, selos PDF e XML), uma nota so' em XML
     (abre os itens) e um boleto; emitente de nome longo. Dados SINTETICOS. */
  const CH = '50311011222333000181550020000157861123456789';
  const docBase = { cliente_id: 'cli', lancamento_id: 'lanc-milho', origem: 'lancamento', operacao_id: null, tamanho_bytes: 1, uploaded_em: '2026-05-10T12:00:00Z',
    uploaded_por: 'u1', observacao: null, cancelado: false, cancelado_em: null, cancelado_motivo: null, versao: 1, ligado_a_qtd: 1, emitente_id: 'agro',
    emitente_nome: 'COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA', emitente_documento: '11222333000181' };
  /* P121b — `&nota=11`: a parcela 2/5 SEM número próprio e a NF da compra ligada, com 11 dígitos (o pior caso do Resumo: o número inteiro + o selo) */
  const DOCS_NOTA = q.get('nota') === '11' ? [{ ...docBase, documento_id: 'd-n11', nome: 'NF.pdf', tipo: 'application/pdf', url: 'c/l/n.pdf', especie: 'nf',
    numero: '12.345.678.901', serie: null, chave_acesso: null, data_emissao: '2026-05-08', valor_documento: 1000 }]
    : q.get('docs') !== 'nota' && q.get('div') !== '1' ? [] : [
    { ...docBase, documento_id: 'd-pdf', nome: 'NF 15786.pdf', tipo: 'application/pdf', url: 'c/l/a.pdf', especie: 'nf', numero: '15786', serie: null, chave_acesso: CH, data_emissao: '2026-05-08', valor_documento: 102000 },
    { ...docBase, documento_id: 'd-xml', nome: 'NFe15786.xml', tipo: 'text/xml', url: 'c/l/b.xml', especie: 'nf', numero: '000.015.786', serie: '2', chave_acesso: CH, data_emissao: '2026-05-08', valor_documento: 102000 },
    { ...docBase, documento_id: 'd-xml2', nome: 'NFe15790.xml', tipo: 'text/xml', url: 'c/l/c.xml', especie: 'nf', numero: '000.015.790', serie: '2', chave_acesso: CH.slice(0, 34) + '1579011234', data_emissao: '2026-05-09', valor_documento: 1250.4 },
    { ...docBase, documento_id: 'd-bol', nome: 'boleto.pdf', tipo: 'application/pdf', url: 'c/l/d.pdf', especie: 'boleto', numero: '15786', serie: null, chave_acesso: null, data_emissao: '2026-05-10', valor_documento: 102000 },
  ];
  /* FIN-CLASSIF-DIVIDIDA-01b — `div=1`: o lancamento (Sal, R$ 1.345,50) DIVIDIDO pelos itens da nota em 2 contas, a ultima operacao que se
     desfaz e a nota guardada com 18 itens (descricao longa) — a aba Geral mostra as partes; a aba Itens, a vista "Contas". SINTETICO. */
  const DIV = q.get('div') === '1';
  const CENT_DOS_ITENS = [30000, 25000, 25000, 20000, 20000, ...Array.from({ length: 12 }, () => 1100), 1350];
  const NOTA_DIV = { id: 'nf-div', cliente_id: 'cli', chave_acesso: CH, origem: 'xml', regime: '3', numero: '3241', serie: '1', emissao: '2026-09-29',
    natureza: 'VENDA DE MERCADORIA', emitente_documento: '11222333000181', emitente_nome: 'INDUSTRIA SINTETICA DE MATERIAL ELETRICO E POSTES LTDA',
    lido_em: '2026-10-01T10:00:00Z', totais: { produtos_cent: 134550, nota_cent: 134550 } };
  const ITENS_DIV = CENT_DOS_ITENS.map((c, k) => ({ nota_id: 'nf-div', n_item: k + 1, codigo: `78912345${String(1000 + k)}`, unidade: 'UN', quantidade: '1.0000',
    unitario: String(c / 100), descricao: `MATERIAL SINTETICO ${k + 1} CABO FLEXIVEL ISOLADO 1KV ${k % 2 ? 'PRETO' : 'AZUL'} ROLO COM 100 METROS`,
    produto_cent: c, liquido_cent: c, desconto_cent: 0, frete_cent: 0, seguro_cent: 0, outras_cent: 0 }));
  const PARTES_DIV = [
    { ordem: 1, valor: 1200, percentual: 89.18617614, plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', origem: 'nota', nota_itens: [1, 2, 3, 4, 5] },
    { ordem: 2, valor: 145.5, percentual: 10.81382386, plano_conta_id: 'pl-ins', subcentro: 'Insumos Lavoura Milho', centro_custo: 'Insumos', escopo_negocio: 'agricultura', origem: 'nota', nota_itens: Array.from({ length: 13 }, (_, k) => k + 6) },
  ];
  /* P104 — `salsolta`: a 6/6 de uma compra lançada em 6 parcelas SOLTAS (o caso da NF 46.994, SINTÉTICO): as 5 irmãs do mesmo fornecedor */
  const IRMAS_SOLTAS = [1, 2, 3, 4, 5, 6].map((k) => ({ id: k === 6 ? 'lanc-1' : `irma-${k}`, descricao: `Tinta sintetica de nome comprido para medir - ${k}/6`,
    valor: k === 1 ? 620.85 : k === 2 ? 620.80 : 620.83,
    /* P143 — a tabela das irmãs: vencimento, pagamento e status (as 3 primeiras pagas, a 4ª vencida) */
    data_vencimento: `2026-${String(4 + k).padStart(2, '0')}-10`, data_pagamento: k <= 3 ? `2026-${String(4 + k).padStart(2, '0')}-10` : null,
    status_transacao: k <= 3 ? 'realizado' : 'programado', conta_bancaria_id: 'elo' }));
  /* P143-DATAS-01 — `salduas`: DUAS compras iguais seguidas, 12 × 69,90 no cartão (SINTÉTICO): a antiga começou em set/25 (a 6/12…12/12 de
     fev a ago/26), a nova em set/26 (só a 1/12). `&qual=antiga` abre a 6/12; sem ele, a 1/12 da nova */
  const ANTIGA = q.get('qual') === 'antiga';
  const IRMAS_DUAS = [...[6, 7, 8, 9, 10, 11, 12].map((k) => ({ id: ANTIGA && k === 6 ? 'lanc-1' : `antiga-${k}`, k, venc: `2026-${String(k - 4).padStart(2, '0')}-20` })),
    { id: ANTIGA ? 'nova-1' : 'lanc-1', k: 1, venc: '2026-09-20' }].map((x) => ({ id: x.id, descricao: `Assinatura sintetica Parc ${String(x.k).padStart(2, '0')}/12`,
    valor: 69.9, data_vencimento: x.venc, data_pagamento: x.venc, status_transacao: 'realizado', conta_bancaria_id: 'elo' }));
  /* P143 (o caso "Parcela 3 - None" da NF 4964, SINTÉTICO) — `salnota`: a descrição sem "k/N"; as irmãs pela MESMA nota do mesmo fornecedor */
  const IRMAS_DA_NOTA = [
    { id: 'nota-1', descricao: 'Manutencao sintetica de cercas da fazenda exemplo', numero_documento: '4964 / 1', data_vencimento: '2026-08-12', data_pagamento: '2026-08-12', status_transacao: 'realizado' },
    { id: 'nota-2', descricao: 'Manutencao sintetica de cercas', numero_documento: '4964', data_vencimento: '2026-09-11', data_pagamento: '2026-09-11', status_transacao: 'realizado' },
    { id: 'lanc-1', descricao: 'Parcela 3 - None', numero_documento: '4964', data_vencimento: '2026-10-11', data_pagamento: null, status_transacao: 'programado' },
  ].map((x) => ({ ...x, valor: 500, conta_bancaria_id: 'elo' }));
  /* P143 — `salparcela`: o contrato da compra em 4 (`&pp=14`: em 14, a lista rola dentro do bloco), pela leitura de sempre (SINTÉTICO) */
  const PP = Number(q.get('pp') ?? 4);
  const SITUACAO_DA_COMPRA = { parcelas: Array.from({ length: PP }, (_x, i) => ({ id: `pp-${i + 1}`, numero: i + 1,
      data_vencimento: `${2026 + Math.floor((8 + i) / 12)}-${String(((8 + i) % 12) + 1).padStart(2, '0')}-10`, valor_principal: 821.22, valor_juros: 0, valor_total: 821.22,
      situacao: i === 0 ? 'paga' : i === 1 ? 'vencida' : 'pendente', pago_em: i === 0 ? '2026-09-10' : null, valor_pago: i === 0 ? 821.22 : 0,
      lancamento_id: i === 0 ? 'lanc-1' : `lp-${i + 1}`, lancamento_juros_id: null, fonte: 'lancamento', diverge: false,
      conta_nome: 'Cartão Exemplo de Nome Comprido para Medir a Coluna', documentos: [], boletos: 0 })),
    cartoes: { valor_contrato: 821.22 * PP, pago: 821.22, a_vencer: 821.22 * (PP - 2), vencido: 821.22, adiado: 0, adiado_qtde: 0, pagas: 1, parcelas: PP,
      juros_previstos: 0, soma_principal: 821.22 * PP, soma_total: 821.22 * PP, divergentes: 0 } };
  const PARCELA_DA_COMPRA = v === 'salparcela' || v === 'salparcelapaga';
  g.__bancoBancada = { from: (t: string, e: any) => v === 'salsolta' && t === 'financeiro_lancamentos_v2' && e?.eq?.favorecido_id ? IRMAS_SOLTAS
      /* CARTAO-LANCAMENTO-01 — `cartaoavista`: o cadastro do cartão SINTÉTICO com os dias digitados (fecha 3, vence 10); `&dias=sem`, sem */
      : v === 'cartaoavista' && t === 'financeiro_contas_bancarias' ? (q.get('dias') === 'sem' ? [{ id: 'elo', dia_fechamento: null, dia_vencimento: null }] : [{ id: 'elo', dia_fechamento: 3, dia_vencimento: 10 }])
      : v === 'salnota' && t === 'financeiro_lancamentos_v2' && e?.eq?.favorecido_id ? IRMAS_DA_NOTA
      : v === 'salduas' && t === 'financeiro_lancamentos_v2' && e?.eq?.favorecido_id ? IRMAS_DUAS
      : PARCELA_DA_COMPRA && t === 'financiamento_parcelas' ? [{ financiamento_id: 'fin-sint', status: 'pendente' }]
      : PARCELA_DA_COMPRA && t === 'financiamentos' ? [{ natureza: 'parcelamento', status: 'ativo' }]
      : t === 'audit_log' ? AUDIT : t === 'vw_lancamento_documentos' ? DOCS_NOTA
      : DIV && t === 'financeiro_lancamento_partes' ? PARTES_DIV : DIV && t === 'financeiro_lancamento_divisoes' ? [{ id: 'op-div', acao: 'dividir_nota' }]
      : DIV && t === 'nota_fiscal' ? [NOTA_DIV] : DIV && t === 'nota_fiscal_itens' ? ITENS_DIV : [], rpc: (fn: string, a: any) =>
    /* P138 — a safra da competência é do banco: aqui, pelas datas das safras SINTÉTICAS da bancada (a mesma regra) */
    fn === '_fn_safra_da_competencia' ? (SAFRAS.find((s: any) => s.escopo_negocio === a?.p_escopo && a?.p_data >= s.data_inicio && a?.p_data <= s.data_fim)?.id ?? null)
    : PARCELA_DA_COMPRA && fn === 'fn_financiamento_situacao' ? SITUACAO_DA_COMPRA
    /* P143 — a prévia do "Juntar num parcelamento" das 6 soltas (SINTÉTICO) */
    : v === 'salsolta' && fn === 'fn_parcelamento_juntar_lancamentos' ? { ok: true, simulado: true, parcelas: 6, soma: 3724.97,
        descricao: 'Tinta sintetica de nome comprido para medir', efeito_por_mes: [],
        lista: IRMAS_SOLTAS.map((x, i) => ({ numero: i + 1, lancamento_id: x.id, descricao: x.descricao, vencimento: x.data_vencimento, valor: x.valor, status: x.status_transacao })) }
    : v === 'salnota' && fn === 'fn_parcelamento_juntar_lancamentos' ? { ok: true, simulado: true, parcelas: 3, soma: 1500,
        descricao: 'Manutencao sintetica de cercas da fazenda exemplo', efeito_por_mes: [],
        lista: IRMAS_DA_NOTA.map((x, i) => ({ numero: i + 1, lancamento_id: x.id, descricao: x.descricao, vencimento: x.data_vencimento, valor: x.valor, status: x.status_transacao })) }
    : fn === 'fn_nomes_dos_autores' ? [
      { user_id: 'u-outro', nome: 'Beltrano Gestor da Silva', email: 'beltrano@exemplo.com', situacao: 'ex-membro' },
      { user_id: 'u1', nome: 'Eu Mesmo da Bancada', email: 'bancada@exemplo.com', situacao: 'membro ativo' }]
    : (desc && fn === 'fn_lancamento_financiamento') ? {
    lancamento: { tipo_operacao: '2-Saídas', data: '2026-10-10', valor: 1345.5, descricao: DESC_LONGA },
    atual: { tipo: 'parcela', financiamento_id: 'fin-sint', numero_contrato: null, descricao: DESC_LONGA, parcela: 3, papel: 'principal', vinculo_id: null },
    parcelas: [], liberacoes: [] }
    /* P74 — os dias de vencimento do cartão SINTÉTICO (o mais frequente: 10) */
    : fn === 'fn_cartao_dias_de_vencimento' ? [{ dia: 10, lancamentos: 409, ultimo: '2026-10-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-10-13' }]
    /* P74b — a volta para à vista da compra em 4 (pronta; `salparcelapaga`: a parcela 2 paga, a recusa do banco). SINTÉTICO. */
    : fn === 'fn_parcelamento_voltar_a_vista' ? (() => {
      const antes = [1, 2, 3, 4].map((numero) => ({ numero, lancamento_id: `lp-${numero}`, vencimento: `2026-${String(8 + numero).padStart(2, '0')}-10`, valor: 821.22 }));
      return v === 'salparcelapaga'
        ? { ok: false, simulado: true, financiamento_id: 'fin-sint', antes, recusa: { motivo: 'ha_paga', parcela: 2, frase: 'A parcela 2/4 já foi paga em 15/10/2026: desfaça o pagamento antes.' } }
        : { ok: true, simulado: true, financiamento_id: 'fin-sint', lancamento_id: 'lanc-1', valor: 3284.88, vencimento: '2026-08-10', competencia: '2026-08-10',
            descricao: DESC_LONGA, canceladas: 3, original_guardado: true, antes };
    })() : null };

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Exemplo' }, { id: 'f-exp', nome: 'Faz. Exemplo Dois' }] as any;
const CONTAS = [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco Alfa', agencia: null, numero_conta: null, conta_digito: null },
  { id: 'sic', nome_conta: 'Banco Beta Lavoura', banco: 'Beta', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco Beta Lavoura', agencia: null, numero_conta: null, conta_digito: null },
  /* P74 — um cartão SINTÉTICO (o "Parcelar este lançamento" sugere o 1º vencimento pelo dia dele) */
  { id: 'elo', nome_conta: 'Cartão Elo Exemplo', banco: null, fazenda_id: 'f-pur', tipo_conta: 'cartao', codigo_conta: null, nome_exibicao: 'Cartão Elo Exemplo', agencia: null, numero_conta: null, conta_digito: null }];
const AGRO = { id: 'agro', nome: 'Agropecuaria Exemplo Comércio de Insumos Ltda', cpf_cnpj: '11.222.333/0001-81', fazenda_id: null, ativo: true, tipo_recebimento: null } as any;
const CLASSIF = [
  { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-milho', subcentro: 'Venda de Milho', centro_custo: 'Vendas Lavoura', grupo_custo: 'Receita Lavoura', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'agricultura' },
  { id: 'pl-ins', subcentro: 'Insumos Lavoura Milho', centro_custo: 'Insumos', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
  { id: 'pl-ent', subcentro: 'Venda de Bezerros', centro_custo: 'Vendas', grupo_custo: 'Receita', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
] as any;
const SAFRAS = [{ id: 's-mil', nome: 'Safra 25/26 Milho', codigo: '25/26-Lav', escopo_negocio: 'agricultura', ativa: true, data_inicio: '2025-07-01', data_fim: '2026-06-30' },
  { id: 's-pec', nome: '25/26 Pecuária', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', ativa: true, data_inicio: '2025-07-01', data_fim: '2026-06-30' }] as any;
const base = { cliente_id: 'cli', fazenda_id: 'f-pur', ano_mes: '2026-05', observacao: null, lote_importacao_id: null, dados_pagamento: null,
  cancelado: false, conciliado_em: null, editado_manual: false, created_by: 'u1', created_at: '2026-05-10T12:00:00Z', updated_at: '2026-05-10T12:00:00Z', origem_lancamento: 'manual' };
const MILHO = { ...base, id: 'lanc-milho', conta_bancaria_id: null, conta_destino_id: 'sic', data_competencia: '2026-05-10', data_pagamento: '2026-05-20',
  data_vencimento: '2026-05-20', valor: 102000, sinal: 1, tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'Milho Grão',
  macro_custo: 'Receita Operacional', grupo_custo: 'Receita Lavoura', centro_custo: 'Vendas Lavoura', subcentro: 'Venda de Milho', escopo_negocio: 'agricultura',
  numero_documento: '000123', tipo_documento: 'Nota Fiscal', favorecido_id: 'agro', forma_pagamento: 'PIX', plano_conta_id: 'pl-milho', safra_id: 's-mil',
  cultura: v === 'rateio' ? '' : 'milho' } as any;
const SAL = { ...base, id: 'lanc-1', conta_bancaria_id: 'bb', conta_destino_id: null, data_competencia: '2026-09-10', data_pagamento: null,
  data_vencimento: '2026-10-10', valor: 1345.5, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'programado', descricao: 'Sal mineral',
  macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', subcentro: 'Nutrição Engorda', escopo_negocio: 'pecuaria',
  numero_documento: '000123', tipo_documento: 'Nota Fiscal', favorecido_id: 'agro', forma_pagamento: 'Boleto', plano_conta_id: 'pl-nut', safra_id: 's-pec', fase: '' } as any;

const props: any = {};
if (m === 'editar') props.lancamento = (v === 'sal') ? SAL : MILHO;
/* P74 — `salcartao`: a compra à vista no cartão (o caso da NF 778.618, valores do caso, dados SINTÉTICOS) para o "Parcelar este lançamento";
   `salpago`: a mesma, já paga (o botão apagado com a frase) */
/* P74b — `salparcela`: a parcela 1/4 de uma compra parcelada (a volta para à vista); `salparcelapaga`: a mesma, com a 2/4 paga */
if (m === 'editar' && (v === 'salparcela' || v === 'salparcelapaga')) props.lancamento = { ...SAL, conta_bancaria_id: 'elo', valor: 821.22, data_competencia: '2026-08-10',
  data_vencimento: '2026-09-10', descricao: `${DESC_LONGA} 1/4`, financiamento_id: 'fin-sint', origem_tipo: 'parcela_principal' };
if (m === 'editar' && v === 'salparcela' && q.get('nota') === '11') props.lancamento = { ...props.lancamento, numero_documento: null, tipo_documento: null,
  descricao: 'Ração sintética para engorda 2/5' };
/* P104 — `salsolta`: a parcela 6/6 lançada solta (o bloco não oferece parcelar) */
if (m === 'editar' && v === 'salsolta') props.lancamento = { ...SAL, conta_bancaria_id: 'elo', valor: 620.83, data_competencia: '2026-10-10', data_vencimento: '2026-10-10',
  descricao: 'Tinta sintetica de nome comprido para medir - 6/6', status_transacao: 'agendado' };
/* P143-DATAS-01 — `salduas`: a 1/12 da compra nova (set/26) ou, com `&qual=antiga`, a 6/12 da antiga (fev/26) */
if (m === 'editar' && v === 'salduas') props.lancamento = { ...SAL, conta_bancaria_id: 'elo', valor: 69.9, data_competencia: q.get('qual') === 'antiga' ? '2026-01-26' : '2026-08-26',
  data_vencimento: q.get('qual') === 'antiga' ? '2026-02-20' : '2026-09-20', data_pagamento: q.get('qual') === 'antiga' ? '2026-02-20' : '2026-09-20',
  descricao: `Assinatura sintetica Parc ${q.get('qual') === 'antiga' ? '06' : '01'}/12`, status_transacao: 'realizado' };
/* P143 — `salnota`: "Parcela 3 - None" da NF 4964 (SINTÉTICO): sem "k/N", as irmãs saem pela nota */
if (m === 'editar' && v === 'salnota') props.lancamento = { ...SAL, conta_bancaria_id: 'elo', valor: 500, data_competencia: '2026-07-13', data_vencimento: '2026-10-11',
  descricao: 'Parcela 3 - None', numero_documento: '4964', status_transacao: 'programado' };
/* P143 — `&forma=…`: a forma GRAVADA fora da lista (o "valor atual" do Editar; o bug do 150a759d) */
if (m === 'editar' && q.get('forma') && props.lancamento) props.lancamento = { ...props.lancamento, forma_pagamento: q.get('forma') };
if (m === 'editar' && (v === 'salcartao' || v === 'salpago')) props.lancamento = { ...SAL, conta_bancaria_id: 'elo', valor: 3284.88, data_competencia: '2026-08-10',
  data_vencimento: '2026-08-10', forma_pagamento: 'Cartão', ...(v === 'salpago' ? { status_transacao: 'realizado', data_pagamento: '2026-08-12' } : {}) };
/* CARTAO-LANCAMENTO-01 — `cartaoavista`: a compra à vista no cartão (mock v2: R$ 312,40 em 30/10; dados SINTÉTICOS) — o vencimento da fatura,
   a frase e a forma "Cartão de crédito" automática */
if (v === 'cartaoavista' && m === 'novo') props.prefill = { tipo_operacao: '2-Saídas', status_transacao: 'previsto', data_competencia: '2026-10-30', valor: 312.4,
  descricao: 'Combustível posto exemplo', fazenda_id: 'f-pur', conta_bancaria_id: q.get('conta') ?? 'elo' };   // `&conta=bb`: a mesma compra numa conta comum (a base do desloca)
if (v === 'rateio' && m === 'novo') props.prefill = { tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura', subcentro: 'Insumos Lavoura Milho', plano_conta_id: 'pl-ins',
  macro_custo: 'Custeio Produtivo', grupo_custo: 'Custeio Lavoura', centro_custo: 'Insumos', cultura: '', fazenda_id: 'f-pur', data_competencia: '2026-05-10', valor: 5000 };
/* P121 — `&resumo=longo`: o caso "Nomes bem longos" do mock (SINTÉTICO) sobre o `v=sal` — favorecido, fazenda, conta, centro e subcentro
   longos e o valor de 7 dígitos. O Resumo do lançamento não rola e não muda de altura (o desloca compara com o `v=sal` curto). */
if (m === 'editar' && q.get('resumo') === 'longo') {
  AGRO.nome = 'Cooperativa Agroindustrial dos Produtores Rurais do Vale do Rio Paraná e Região Ltda';
  FAZENDAS[0].nome = 'Faz. Santa Maria da Boa Esperança';
  CONTAS[0].nome_conta = 'Itaú Personalite Investimentos';
  CONTAS[0].nome_exibicao = 'Itaú Personalite Investimentos';
  CLASSIF[0] = { ...CLASSIF[0], subcentro: 'Peças, Pneus e Manutenção de Tratores e Implementos Pecuária', centro_custo: 'Manutenção de Máquinas e Implementos Agrícolas' };
  props.lancamento = { ...SAL, valor: 1234567.89, subcentro: CLASSIF[0].subcentro, centro_custo: CLASSIF[0].centro_custo,
    descricao: 'Peças de reposição para trator e implementos, conforme pedido de compra 4521 e orçamento aprovado' };
}
const NOME_LONGO ='COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA FILIAL CAMPO GRANDE';
if (v === 'xmlnome') {
  const SEM_DOC = { id: 'agro-nd', nome: NOME_LONGO, cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null } as any;
  const bytes = utf8(montarNFe({ nomeEmitente: NOME_LONGO, duplicatas: [['001', '2026-10-30', '3247.60'], ['002', '2026-11-29', '3247.60'], ['003', '2026-12-29', '3247.60'], ['004', '2027-01-28', '3247.60'], ['005', '2027-02-27', '3247.60']] }));
  const lido: any = lerNFe(bytes);
  const resolucao = resolverEmitente(lido.nota.emitente, [SEM_DOC], 'agro-nd');
  const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Exemplo', ie: null }], emitente: resolucao,
    favorecidoId: resolucao.propostoId, ultima: { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' } });
  props.prefill = { ...prefillDaNota({ proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, resolucao,
    ocorrencias: [], arquivo: arquivoXmlDaNota(bytes, 'NFe-12345.XML') } as any), conta_bancaria_id: 'bb' };
  props.fornecedores = [SEM_DOC];
  props.documentosAntesDeSalvar = true;
}
/* ITENS-NOTA-FONTE-01 — `xml18`: 18 itens com descricao longa (o molde da nota de 18 itens); `xml14`: 14 itens com codigo de 14 digitos
   (o molde da nota de 14 itens). Dados SINTETICOS; a aba "Itens da nota" tem de mostrar as 18 linhas sem rolar a partir de 1126x579. */
if (v === 'xml18' || v === 'xml14') {
  const n = v === 'xml18' ? 18 : 14;
  const itens: [string, string, string, string, string?][] = Array.from({ length: n }, (_, i) => [
    v === 'xml18' ? `MATERIAL ELETRICO SINTETICO REFERENCIA ${i + 1} CABO FLEXIVEL 2,5MM ROLO 100M COR ${['AZUL', 'PRETO', 'VERDE'][i % 3]}` : `PECA SINTETICA ${i + 1} KIT REPARO`,
    String(i + 1) + '.0000', 'UN', `${(100 + i * 37).toFixed(2)}`, v === 'xml14' ? `78912345${String(100000 + i)}` : undefined]);
  const vNF = itens.reduce((t, x) => t + Number(x[3]), 0).toFixed(2);
  const bytes = utf8(montarNFe({ itens, vNF, duplicatas: [['001', '2026-10-30', vNF]] }));
  const lido: any = lerNFe(bytes);
  const resolucao = resolverEmitente(lido.nota.emitente, [AGRO], null);
  const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Exemplo', ie: null }], emitente: resolucao,
    favorecidoId: resolucao.propostoId, ultima: null });
  props.prefill = prefillDaNota({ proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, resolucao,
    ocorrencias: [], arquivo: arquivoXmlDaNota(bytes, 'NFe-sintetica.XML') } as any);
  props.documentosAntesDeSalvar = true;
}
if (v === 'xml') {
  const bytes = utf8(montarNFe({ duplicatas: [['001', '2026-10-30', '8119.00'], ['002', '2026-11-29', '8119.00']] }));
  const lido: any = lerNFe(bytes);
  const resolucao = resolverEmitente(lido.nota.emitente, [AGRO], null);
  const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Exemplo', ie: null }], emitente: resolucao,
    favorecidoId: resolucao.propostoId, ultima: { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' } });
  props.prefill = prefillDaNota({ proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, resolucao,
    ocorrencias: [{ origem: 'lancamento', documento_id: 'd1', lancamento_id: 'l9', operacao_id: null, operacao_tipo: null, numero: '12345', serie: '1', descricao: 'Compra anterior', data: '2026-09-30', valor: 16238 }],
    arquivo: arquivoXmlDaNota(bytes, 'NFe-12345.XML') } as any);
  props.documentosAntesDeSalvar = true;
}
/* CRIAR-DO-EXTRATO-01 — o "Criar lançamento pela diferença" (extrato) e o Conciliar com referência do Excel (planilha): a faixa de UMA
   linha no topo da Geral; `ref=longo` = histórico de 300 caracteres (a altura tem de ser a da faixa curta). `semvenc` = editar um
   realizado SEM vencimento (o rótulo acende "Vencimento * · Informe o vencimento." ao salvar). Histórico e valores sintéticos. */
if (v === 'extrato' || v === 'planilha') {
  const hist = q.get('ref') === 'longo' ? ('REND PAGO APLIC AUT MAIS CONTA INVESTIMENTO EXEMPLO ' + 'HISTORICO LONGO DO BANCO '.repeat(12)).slice(0, 300) : 'REND PAGO APLIC AUT MAIS';
  props.prefill = { fazenda_id: 'f-pur', conta_destino_id: 'bb', data_pagamento: '2025-09-05', data_competencia: '2025-09-05', data_vencimento: '2025-09-05',
    valor: 1.09, tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'REND PAGO APLIC AUT MAIS' };
  props.referenciaOperacionalInfo = v === 'extrato'
    ? { origem: 'extrato', conta_nome: 'Banco Alfa', produto_texto: hist, valor: 1.09, data_referencia: '2025-09-05', observacao: 'Movimento do extrato bancário' }
    : { origem: 'planilha', fornecedor_texto: 'Fornecedor Exemplo da Planilha', fazenda_texto: 'Faz. Exemplo', plano_texto: 'Receitas Financeiras',
        produto_texto: hist, observacao: 'Observação da planilha de referência', valor: 1.09, data_referencia: '2025-09-05' };
  if (v === 'extrato') props.ocultarParcelamento = true;
}
if (v === 'semvenc' && m === 'editar') props.lancamento = { ...MILHO, data_vencimento: null };
/* P138 — `&safra=sem`: o lançamento gravado SEM safra (o campo mostra "Sem safra" e embaixo "sugestão: <safra> · Usar", pela competência) */
if (m === 'editar' && q.get('safra') === 'sem' && props.lancamento) props.lancamento = { ...props.lancamento, safra_id: null };
if (v === 'oc' || v === 'ocdesp') {
  const nat = v === 'oc' ? 'principal' : 'obrigacao';
  props.origemOC = { operacaoId: 'a1b2c3d4-0000-4000-8000-000000000000', versao: 8, natureza: nat, tipoOperacao: 'venda', rotulo: 'OC #a1b2c3d4 · Venda 140 Novilhas',
    itens: [{ codigo: 'frete', nome: 'Frete' }], onVoltar: () => {}, aoLancar: async () => {}, dataDaEntrega: '2026-10-03' };
  props.lockedFields = [...(TRAVAS_DO_MODO_OC as any)[nat]];
  props.prefill = nat === 'principal'
    ? { fazenda_id: 'f-pur', tipo_operacao: '1-Entradas', status_transacao: 'programado', data_competencia: '2026-10-05', valor: 5000, descricao: 'Venda 140 Novilhas · Recebimento',
      favorecido_id: 'agro', subcentro: 'Venda de Bezerros', macro_custo: 'Receita Operacional', grupo_custo: 'Receita', centro_custo: 'Vendas', plano_conta_id: 'pl-ent', escopo_negocio: 'pecuaria', cultura: '', fase: '', conta_bancaria_id: 'bb' }
    : { fazenda_id: 'f-pur', tipo_operacao: '2-Saídas', status_transacao: 'programado', data_competencia: '2026-10-05', valor: 300, descricao: 'Frete da venda',
      subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', plano_conta_id: 'pl-nut', escopo_negocio: 'pecuaria', cultura: '', fase: '', conta_bancaria_id: 'bb' };
}
if (desc) {
  const d = desc === 'longo' ? DESC_LONGA : DESC_CURTA;
  if (props.lancamento) props.lancamento = { ...props.lancamento, descricao: d };
  else props.prefill = { ...(props.prefill ?? {}), descricao: d };
}
/* FIN-MODAL-FAZENDA-TRAVA-01 — `&v=volume`: o VOLUME do NJ (21/10/2026), sintético — 2.356 fornecedores ativos + 861 mesclados (com
   apelidos e documento), 5 fazendas, e o campo Fazenda nascendo vazio (o Global). Mede abrir e escolher a fazenda. */
let FAZ_VOL: any = null;
if (v === 'volume') {
  const PAL = ['Agro', 'Comercial', 'Transportes', 'Cooperativa', 'Posto', 'Mecânica', 'Veterinária', 'Insumos', 'Rural', 'Pecuária'];
  const vol = Array.from({ length: 2356 + 861 }, (_, i) => {
    const mescl = i >= 2356;
    return { id: `fv${i}`, nome: `${PAL[i % 10]} Exemplo ${PAL[(i * 7) % 10]} ${i} Ltda`, nome_fantasia: i % 3 ? `Fantasia ${i}` : null,
      cpf_cnpj: i % 4 ? String(10000000000000 + i * 7919).slice(0, 14) : null, fazenda_id: null, ativo: !mescl,
      fundido_em_id: mescl ? `fv${i % 2356}` : null, tipo_recebimento: null,
      aliases: i % 5 ? [`APELIDO ${i}`, `OUTRO NOME ${i}`] : [], aliases_norm: i % 5 ? [`apelido ${i}`, `outro nome ${i}`] : [] };
  });
  props.fornecedores = vol;
  g.__fornecedoresBancada = vol;
  FAZ_VOL = [{ id: 'f-pur', nome: 'Faz. Pureza' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito' }, { id: 'f-ter', nome: 'Faz. Sta. Tereza' },
    { id: 'f-ret', nome: 'Retiro Agricultura' }, { id: 'f-adm', nome: 'Administrativo' }];
  props.fazendas = FAZ_VOL;
  props.prefill = { tipo_operacao: '2-Saídas', valor: 100 };
}
if (v === 'ref') props.referenciaOperacionalInfo = { fornecedor_texto: 'AGROPECUARIA EXEMPLO LTDA', fazenda_texto: 'EXEMPLO', plano_texto: 'Nutrição Engorda',
  centro_texto: 'Suplementação', produto_texto: 'Sal mineral', valor: -1345.5, data_referencia: '10/09/2026' };

  /* P117 — o fornecedor do lançamento é uma FILIAL com a cidade mais longa do caso (Presidente Prudente/SP): a linha fixa sob o campo diz
     "CNPJ · Cidade/UF" e não empurra nem corta nada; `&cidade=sem` = o cadastro sem cidade (só o CNPJ). SINTÉTICO. */
  if (v !== 'volume') {
    const semCidade = q.get('cidade') === 'sem';
    g.__fornecedoresBancada = [...(g.__fornecedoresBancada ?? []).filter((f: any) => f.id !== 'agro'),
      { ...AGRO, municipio: semCidade ? null : 'Presidente Prudente', uf: semCidade ? null : 'SP' }];
  }
  const renderizar = () => raiz.render(<QueryClientProvider client={qc}><MemoryRouter><Casca />
    <LancamentoV2Dialog open onClose={() => {}} onSave={async () => 'x'} fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF}
      fornecedores={[AGRO]} safras={SAFRAS} onCriarFornecedor={async () => null}
      /* P128a (porta 2) — o "Ler a NF" do Documentos do Editar (na bancada, a prévia não abre) */
      onLerNotaFiscal={async () => null} {...props} />
  </MemoryRouter></QueryClientProvider>);
  /* NOTA-NOVA-MODAL-REAL (Gabriel 30/10) — a nota que NÃO está no sistema abre DIRETO aqui, pelo `prefillDaNota` (o caminho da lista): `notapdf`
     o PDF sintético (4 duplicatas) · `notachave` só a chave digitada (sem valor nem data) · `notacartao` a nota sem duplicata paga no cartão
     Elo (a conta já escolhida; o cenário escolhe Parcelada 10× no Pagamento). O PDF é desenhado pelo jspdf e LIDO pelo caminho de verdade. */
  /* NOTA-NFSE-LEITURA-02 (Gabriel 08/11, a forma da NF 402) — `notanfse`: o DANFSe nacional sintético (sem IE, IBS/CBS, 3 linhas de serviço)
     de uma filial cuja OUTRA filial é a cadastrada (a faixa nova), a fazenda pelo histórico do fornecedor e a descrição curta do serviço */
  if (v === 'notanfse') {
    void (async () => {
      const { jsPDF } = await import('jspdf');
      const { danfseSintetico } = await import('@/lib/financeiro/nfe/__fixtures__/danfseSintetico');
      const { lerNota } = await import('@/lib/financeiro/nfe/lerNota');
      const { arquivoPdfDaNota } = await import('@/components/financeiro-v2/NovoDeXmlDialog');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [595.28, 841.89] });
      for (const it of danfseSintetico({ bruto: '2.900,00', issApurado: '71,05', liquido: '2.900,00', ibsCbs: true, semIe: true,
        descricao: ['TROCA BOMBA ALIMENTADORA DA CARREGADEIRA W130', '02 DESLOCAMENTOS', 'CARREGADEIRA W130'] })[0]) {
        doc.setFontSize(Math.max(4, it.h * 1.15)); doc.text(it.str, it.x, 841.89 - it.y);
      }
      const bytes: ArrayBuffer = doc.output('arraybuffer');
      const lido: any = await lerNota(bytes);
      if (!lido.ok) { raiz.render(<div>{lido.frase}</div>); return; }
      const FILIAL = { ...AGRO, id: 'oficina-2', nome: 'Oficina Sintetica de Teste Ltda', cpf_cnpj: '11.222.333/0002-62' };
      props.fornecedores = [FILIAL];
      const resolucao = resolverEmitente(lido.nota.emitente, [FILIAL], 'oficina-2');
      const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: FAZENDAS.map((f: any) => ({ ...f, ie: null })), emitente: resolucao,
        favorecidoId: resolucao.propostoId, ultima: null, fazendaDoHistorico: 'f-pur' });
      if (!p.ok) { raiz.render(<div>{p.frase}</div>); return; }
      props.prefill = prefillDaNota({ proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento,
        emitente: lido.nota.emitente, resolucao, ocorrencias: [], arquivo: arquivoPdfDaNota(bytes, 'NF_57.pdf') } as any);
      props.documentosAntesDeSalvar = true;
      renderizar();
    })();
  } else if (v === 'notapdf' || v === 'notachave' || v === 'notacartao') {
    void (async () => {
      const { jsPDF } = await import('jspdf');
      const { PAGINAS_DANFE_SINTETICO, danfeSinteticoSemDuplicata } = await import('@/lib/financeiro/nfe/__fixtures__/danfeSintetico');
      const { lerNota } = await import('@/lib/financeiro/nfe/lerNota');
      const { arquivoPdfDaNota } = await import('@/components/financeiro-v2/NovoDeXmlDialog');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [841.89, 595.28] });
      if (v === 'notachave') { doc.setFillColor(214, 211, 204); doc.rect(40, 40, 760, 515, 'F'); }
      else for (const it of (v === 'notacartao' ? danfeSinteticoSemDuplicata() : PAGINAS_DANFE_SINTETICO)[0]) { doc.setFontSize(Math.max(4, it.h * 1.15)); doc.text(it.str, it.x, 595.28 - it.y); }
      const bytes: ArrayBuffer = doc.output('arraybuffer');
      let lido: any;
      if (v === 'notachave') {
        const { notaDaChaveDigitada, lidoDaChave } = await import('@/lib/financeiro/nfe/chaveDigitada');
        const r = notaDaChaveDigitada('5026 0911 2223 3300 0424 5501 0000 0009 3712 1753 8298');
        if (r.ok === false) { raiz.render(<div>{r.frase}</div>); return; }
        lido = lidoDaChave(r.nota, [{ largura: 841.89, altura: 595.28 }]);
      } else lido = await lerNota(bytes);
      if (!lido.ok) { raiz.render(<div>{lido.frase}</div>); return; }
      const FORN_S = { ...AGRO, id: 'agro-s', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: '11.222.333/0004-24' };
      props.fornecedores = [FORN_S];
      const resolucao = resolverEmitente(lido.nota.emitente, [FORN_S], null);
      const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Exemplo', ie: '280000002' }], emitente: resolucao,
        favorecidoId: resolucao.propostoId, ultima: { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' } });
      props.prefill = { ...prefillDaNota({ proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, emitente: lido.nota.emitente,
        resolucao, ocorrencias: [], arquivo: arquivoPdfDaNota(bytes, '000.000.937.pdf') } as any), ...(v === 'notacartao' ? { conta_bancaria_id: 'elo' } : {}) };
      props.documentosAntesDeSalvar = true;
      renderizar();
    })();
  } else renderizar();
}
