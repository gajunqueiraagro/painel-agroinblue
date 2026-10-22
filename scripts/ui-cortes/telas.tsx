/**
 * UI-SEM-CORTE-01 — as telas da bancada do `check:ui-cortes`, por `?tela=`: os componentes REAIS, com dados SINTETICOS.
 *   mesclar · fornecedores · fornecedor-cadastro · contrato · lancamento (`&m=novo|editar`)
 * Cada tela registra o banco simulado em `globalThis.__bancoBancada` (mocks/supabase.ts) antes de montar.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
import { volumeNJ } from './dados/volumeNJ';
import { buscarFornecedores } from '@/lib/fornecedores/buscaDeFornecedor';
import { FinanceiroV2Tab } from '@/pages/FinanceiroV2Tab';
import { GRUPOS, LEITOR, LINHAS, LISTA, RECENTES, SEM_CADASTRO, USO } from './dados/fornecedores';
import { CasarBlocoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { CasarComBancoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { DialogoDesfazerCompromisso } from '@/components/compra/DialogoDesfazerCompromisso';
import { DialogoAtualizarCompromisso } from '@/components/compra/DialogoAtualizarCompromisso';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
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
import { V2Sidebar, LARGURA_DA_LATERAL } from '@/v2/components/V2Sidebar';
import { ClienteSelector } from '@/components/ClienteSelector';
import { FazendaSelector } from '@/components/FazendaSelector';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConciliarDiferencaModal } from '@/components/conciliacao/ConciliarDiferencaModal';
import { lerSimulacao } from '@/lib/conciliacao/conciliarDiferenca';

/* FIN-V2-DESEMPENHO-01b — a `fn_fin_v2_lista_pagina` da bancada: a página pedida do conjunto SINTÉTICO, com o total e os totais
   do conjunto inteiro (a regra do topo, `totaisDaListaV2`). Sem filtro: a bancada mede a tela, não o predicado. */
function paginaDaBancada(base: any[], a: any) {
  const caixa = base.filter((l) => l.sem_movimentacao_caixa !== true);
  const por = Number(a?.p_por_pagina) || 200, pag = Number(a?.p_pagina) || 0;
  return {
    versao: 'bancada', pagina: pag, por_pagina: por, total_linhas: caixa.length,
    linhas: caixa.slice(pag * por, (pag + 1) * por).map((l) => ({ ...l, conciliado: false })),
    totais: (({ entradas, saidas, transferencias, entradasSemCaixa, saidasSemCaixa }) => ({ entradas, saidas, transferencias,
      entradas_sem_caixa: entradasSemCaixa, saidas_sem_caixa: saidasSemCaixa }))(totaisDaListaV2(base, null)),
    sem_caixa: { linhas: base.length - caixa.length, total: 0 },
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
const Lateral = () => LATERAL ? (
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
const montar = (n: React.ReactNode) => raiz.render(<QueryClientProvider client={qc}><MemoryRouter><Casca>{n}</Casca></MemoryRouter></QueryClientProvider>);

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
  const VOL = v === 'volume' ? volumeNJ() : null;
  if (VOL) { g.__fornecedoresBancada = VOL.fornecedores; g.__fazendaBancada = { fazendas: VOL.fazendas, fazendaAtual: { id: '__global__', nome: 'Global', owner_id: '' },
    isGlobal: true, fazendaId: '__global__', setFazendaAtual: () => {} }; }
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_lancamentos_v2' ? (e.in.id ? [] : VOL ? VOL.lancamentos : LANCAMENTOS)
      : t === 'financeiro_fornecedores' ? (VOL ? VOL.fornecedores : LISTA)
      : t === 'financeiro_safras' ? [{ id: 's-pec', nome: 'Pecuária 25/26', codigo: '25/26-Pec', escopo_negocio: 'pecuaria', ativa: true },
        { id: 's-lav', nome: 'Mandioca 25/26', codigo: '25/26-MAND', escopo_negocio: 'agricultura', ativa: true }]
      : t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f1', ativo: true, ordem_exibicao: 1 }] : [],
    rpc: (fn: string, a: any) => fn === 'get_anos_financeiro_v2' ? [{ ano: '2026' }] : fn === 'fn_parcelas_dos_lancamentos' ? {}
      : fn === 'fn_fin_v2_lista_pagina' ? paginaDaBancada(VOL ? VOL.lancamentos : LANCAMENTOS, a) : null,
  };
  montar(<div className="p-3 h-full"><FinanceiroV2Tab filtroAnoInicial="2026" /></div>);
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
  g.__bancoBancada = {
    from: (t: string) => t === 'financiamentos' ? [d.fin] : t === 'financiamento_parcelas' ? d.parcelas : t === 'financiamento_liberacoes' ? d.liberacoes ?? []
      : t === 'financiamento_destinacoes' ? d.destinacoes ?? [] : t === 'financiamento_documentos' ? d.documentos ?? [] : [],
    rpc: (fn: string) => fn === 'fn_financiamento_situacao' ? d.situacao : fn === 'fn_contrato_tela' ? d.tela ?? null : fn === 'fn_financiamento_captacoes_livres' ? []
      : fn === 'fn_consorcio_tela' ? c.tela : fn === 'fn_consorcio_cronograma' ? c.cronograma : null,
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
  const lin = (id: string, d: number, valor: number, descricao: string, o: Record<string, unknown> = {}) => ({
    id, cliente_id: 'cli', fazenda_id: 'f1', data_vencimento: dia(d), data_competencia: dia(d), data_pagamento: null, status_transacao: 'programado',
    tipo_operacao: '2-Saídas', valor, sinal: -1, conta_bancaria_id: 'bb', conta_destino_id: null, descricao, favorecido_nome: 'Banco Cooperativo Exemplo de Crédito',
    subcentro: 'Juros de Financiamento Pecuária', macro_custo: 'Despesas Financeiras', cancelado: false, sem_movimentacao_caixa: false, ...o });
  const LINHAS_CPR = [
    lin('rec-1', 2, 435.75, 'Internet Fazenda Exemplo', { subcentro: 'Comunicação e Energia Pecuária' }),
    lin('juros-2', 5, 35665.34, 'Juros 2/5 · 8.233.040 · Giro Rural'),
    lin('amort-2', 5, 120004.5, 'Amortização 2/5 · 8.233.040 · Giro Rural', { subcentro: 'Amortização de Financiamento' }),
    lin('ambas', 9, 999999999.99, 'Lançamento com as duas origens de estimativa', { subcentro: 'Juros de Financiamento Pecuária' }),
    lin('avulsa', 12, 1500, 'Sal mineral', { subcentro: 'Nutrição Engorda' }),
    /* CPR-AJUSTES-20-10 — um VENCIDO (entra hoje, com o selo e o aviso) e uma ENTRADA no mesmo dia de uma saída (a ordem do dia) */
    lin('vencido-1', -4, 290000, 'Transferência para aplicação em CDB com o nome longo do banco', { subcentro: 'Transferência entre contas' }),
    lin('entrada-1', 12, 21000, 'Venda de bezerros desmamados', { tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'bb', subcentro: 'Venda de Desmama Machos' }),
    /* CPR-AJUSTES-20-10c — `&v=encerrado`: dois vencidos em aberto DENTRO de um período já encerrado (o grupo "Saem hoje", depois do
       Fim do período) — um a pagar com o nome longo e um a receber */
    ...(v === 'encerrado' ? [
      lin('venc-enc-1', -20, 112.82, 'Segurança do Trabalho com o laudo técnico anual das instalações da sede', { status_transacao: 'previsto' }),
      lin('venc-enc-2', -15, 500, 'Venda de couro do abate', { tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'bb', subcentro: 'Outras Receitas' }),
    ] : []),
  ];
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'vw_financeiro_lancamentos_v2_doc' ? LINHAS_CPR
      : t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f1', ativo: true, ordem_exibicao: 1, tipo_conta: 'conta_corrente' }]
      : t === 'financeiro_recorrencias' ? [{ id: 'reg-1' }]
      : t === 'financeiro_lancamentos_v2' && e.in.recorrencia_id ? [{ id: 'rec-1', recorrencia_id: 'reg-1', valor: 435.75, data_vencimento: dia(2), status_transacao: 'programado', valor_do_mes_em: null },
          { id: 'ambas', recorrencia_id: 'reg-1', valor: 1, data_vencimento: dia(9), status_transacao: 'programado', valor_do_mes_em: null }]
      : [],
    rpc: (fn: string) => fn === 'fn_juros_estimados_do_cliente' ? [{ lancamento_id: 'juros-2' }, { lancamento_id: 'ambas' }]
      : fn === 'fn_parcelas_dos_lancamentos' ? {} : null,
  };
  /* CPR-AJUSTES-20-10b — `&v=futuro`: um período que começa depois de hoje (o bloco "Vencidos em aberto · entram no saldo" antes
     do Caixa inicial, e nenhum dia de hoje), aberto pelo mesmo retorno de sessão que a tela já lê */
  if (v === 'futuro') sessionStorage.setItem('cpr_retorno_do_contrato', JSON.stringify({ atalho: 'datas', datas: { de: dia(10), ate: dia(40) } }));
  if (v === 'encerrado') sessionStorage.setItem('cpr_retorno_do_contrato', JSON.stringify({ atalho: 'datas', datas: { de: dia(-40), ate: dia(-10) }, segmento: 'ambos' }));
  montar(<div className="h-full"><ContasPagarReceberTab onIntensiveToggle={() => {}} /></div>);
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
    const { PAGINAS_DANFE_SINTETICO, danfeSinteticoSemDuplicata } = await import('@/lib/financeiro/nfe/__fixtures__/danfeSintetico');
    const { lerNota } = await import('@/lib/financeiro/nfe/lerNota');
    const { NotaFiscalDialog } = await import('@/components/financeiro-v2/NotaFiscalDialog');
    const { arquivoPdfDaNota } = await import('@/components/financeiro-v2/NovoDeXmlDialog');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [841.89, 595.28] });
    for (const it of (v === 'semdup' ? danfeSinteticoSemDuplicata() : PAGINAS_DANFE_SINTETICO)[0]) {
      const str = v === 'diverge' && it.str === 'Nº 000.000.937' ? 'Nº 000.000.938' : it.str;
      doc.setFontSize(Math.max(4, it.h * 1.15));
      doc.text(str, it.x, 595.28 - it.y);
    }
    const bytes: ArrayBuffer = doc.output('arraybuffer');
    const lido: any = await lerNota(bytes);
    if (!lido.ok) { raiz.render(<div>{lido.frase}</div>); return; }
    if (v === 'longo') {
      const NOME = 'COOPERATIVA AGROINDUSTRIAL SINTETICA DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA';
      lido.nota.emitente.nome = NOME;
      lido.nota.itens = Array.from({ length: 14 }, (_, i) => ({ descricao: `PRODUTO SINTETICO DE NOME COMPRIDO ${i + 1} PARA MEDIR O CORTE DA COLUNA DE PRODUTO DA TABELA`,
        quantidade: '1234.0000', unidade: 'UN', valorCent: 99999999, unitarioCent: 8103, detalhe: 'Lote: 000/00 D.Val: 01/01/30' }));
      lido.nota.duplicatas = Array.from({ length: 12 }, (_, i) => ({ numero: String(i + 1).padStart(3, '0'), vencimento: `20${27 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}-20`, valorCent: 99999999 }));
      lido.nota.somaDuplicatasCent = 99999999 * 12;
      lido.nota.totais = { ...lido.nota.totais, notaCent: 99999999 * 12, descontoCent: 99999999 };
    }
    const forn = { id: 'agro-s', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null } as any;
    const fornecedores = ['cadastrado', 'registrada', 'lavoura', 'semdup', 'parcelar'].includes(v) ? [forn] : [];
    const resolucao = resolverEmitente(lido.nota.emitente, fornecedores, null);
    const ultima = v === 'cadastrado' || v === 'parcelar' ? { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' }
      : v === 'lavoura' ? { plano_conta_id: 'pl-lav', subcentro: 'Insumos Lavoura — Defensivos e Fertilizantes', macro_custo: 'Custeio Produtivo', grupo_custo: 'Custeio Lavoura', centro_custo: 'Insumos', escopo_negocio: 'agricultura', data: '2026-08-14', safra_id: 's-soja', cultura: 'soja' }
      : null;
    const p: any = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'f-pur', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao,
      favorecidoId: resolucao.propostoId, ultima });
    const arquivo = arquivoPdfDaNota(bytes, '000.000.937.pdf');
    const ocorrencias = v === 'registrada' ? [{ origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l9', operacaoId: null, operacaoTipo: null, numero: '000.000.937',
      descricao: 'NF 937 · compra registrada antes', data: '2026-09-15', valor: 1966.56 }] : [];
    g.__bancoBancada = {
      from: (t: string) => {
        if (t === 'financeiro_fornecedores') return [{ nome_fantasia: null, inscricao_estadual: null, tipo_pessoa: 'PJ', logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, uf: null, cep: null, telefone: null }];
        if (t === 'financeiro_lancamentos_v2' && (v === 'cadastrado' || v === 'parcelar')) return [{ id: 'l-ext', data_vencimento: '2026-10-20', data_competencia: '2026-10-20',
          descricao: 'PAGTO BOLETO AGRO SINTETICA INSUMOS — lançamento criado do extrato bancário com histórico comprido', valor: 491.64, financiamento_id: null, numero_documento: null }];
        return [];
      },
      rpc: () => null,
    };
    const receita = async () => ({ ok: true as const, dados: { razaoSocial: v === 'longo' ? lido.nota.emitente.nome : 'AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA', fantasia: '',
      municipio: 'Campo Grande', uf: 'MS', logradouro: 'Rua das Flores', numero: '100', complemento: 'Sala 1', bairro: 'Centro', cep: '79000-000', matrizFilial: 'FILIAL' } });
    const PLANO = [
      { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
      { id: 'pl-vet', subcentro: 'Sanidade Animal — Vacinas e Medicamentos Veterinários', centro_custo: 'Sanidade', grupo_custo: 'Custeio Pecuário', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
      { id: 'pl-lav', subcentro: 'Insumos Lavoura — Defensivos e Fertilizantes', centro_custo: 'Insumos', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
    ] as any;
    const SAFRAS_N = [{ id: 's-soja', nome: 'Safra 26/27 Soja — Retiro Agricultura Sintético', ativa: true, codigo: '26/27-SOJ', escopo_negocio: 'agricultura' }] as any;
    const CONTAS_N = [{ id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null }] as any;
    montar(<NotaFiscalDialog open onClose={() => {}} clienteId="cli" clienteNome="Cliente Exemplo"
      nota={{ arquivo, bytes, lido, doXml: { proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, emitente: lido.nota.emitente, resolucao, ocorrencias, arquivo } as any }}
      fazendas={[{ id: 'f-pur', nome: 'Faz. Sintetica' }] as any} contas={CONTAS_N} classificacoes={PLANO} safras={SAFRAS_N} fornecedores={fornecedores}
      onCriarFornecedor={async () => null} onCriarLancamento={async () => null} onAbrirNoLancamento={() => {}} onAbrirRegistrada={() => {}} onCriado={() => {}} consultarReceita={receita as any} />);
  };
  void montarNotaPdf();
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
} else if (tela === 'lancamento') {
  /* com `desc`, a edição é parcela de uma compra parcelada SEM número de contrato: o rodapé fala dela (a descrição do contrato é a longa) */
  /* ACESSOS-PERFIL-01 — a aba Auditoria: eventos de dois membros e um sem autor (com e sem `via`), nomes pela fonte única. */
  const AUDIT = [
    { id: 'a1', acao: 'editou', usuario_id: 'u-outro', created_at: '2026-10-12T14:05:00Z', dados_anteriores: { valor: 1000, descricao: 'Sal' }, dados_novos: { valor: 1345.5, descricao: DESC_LONGA }, via: null },
    { id: 'a2', acao: 'editou', usuario_id: null, created_at: '2026-10-11T10:00:00Z', dados_anteriores: { status_transacao: 'previsto' }, dados_novos: { status_transacao: 'programado' }, via: 'sistema:fn_recorrencia_gerar' },
    { id: 'a3', acao: 'editou', usuario_id: null, created_at: '2026-09-11T10:00:00Z', dados_anteriores: { valor: 900 }, dados_novos: { valor: 1000 }, via: null },
    { id: 'a4', acao: 'editou', usuario_id: 'u1', created_at: '2026-09-10T15:00:00Z', dados_anteriores: { observacao: null }, dados_novos: { observacao: 'conferido' }, via: null }];
  g.__bancoBancada = { from: (t: string) => t === 'audit_log' ? AUDIT : [], rpc: (fn: string) => fn === 'fn_nomes_dos_autores' ? [
      { user_id: 'u-outro', nome: 'Beltrano Gestor da Silva', email: 'beltrano@exemplo.com', situacao: 'ex-membro' },
      { user_id: 'u1', nome: 'Eu Mesmo da Bancada', email: 'bancada@exemplo.com', situacao: 'membro ativo' }]
    : (desc && fn === 'fn_lancamento_financiamento') ? {
    lancamento: { tipo_operacao: '2-Saídas', data: '2026-10-10', valor: 1345.5, descricao: DESC_LONGA },
    atual: { tipo: 'parcela', financiamento_id: 'fin-sint', numero_contrato: null, descricao: DESC_LONGA, parcela: 3, papel: 'principal', vinculo_id: null },
    parcelas: [], liberacoes: [] } : null };

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Exemplo' }, { id: 'f-exp', nome: 'Faz. Exemplo Dois' }] as any;
const CONTAS = [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco Alfa', agencia: null, numero_conta: null, conta_digito: null },
  { id: 'sic', nome_conta: 'Banco Beta Lavoura', banco: 'Beta', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco Beta Lavoura', agencia: null, numero_conta: null, conta_digito: null }];
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
if (v === 'rateio' && m === 'novo') props.prefill = { tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura', subcentro: 'Insumos Lavoura Milho', plano_conta_id: 'pl-ins',
  macro_custo: 'Custeio Produtivo', grupo_custo: 'Custeio Lavoura', centro_custo: 'Insumos', cultura: '', fazenda_id: 'f-pur', data_competencia: '2026-05-10', valor: 5000 };
const NOME_LONGO = 'COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA FILIAL CAMPO GRANDE';
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
if (v === 'oc' || v === 'ocdesp') {
  const nat = v === 'oc' ? 'principal' : 'obrigacao';
  props.origemOC = { operacaoId: 'a1b2c3d4-0000-4000-8000-000000000000', versao: 8, natureza: nat, tipoOperacao: 'venda', rotulo: 'OC #a1b2c3d4 · Venda 140 Novilhas',
    itens: [{ codigo: 'frete', nome: 'Frete' }], onVoltar: () => {}, aoLancar: async () => {} };
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

  raiz.render(<QueryClientProvider client={qc}><MemoryRouter><Casca />
    <LancamentoV2Dialog open onClose={() => {}} onSave={async () => 'x'} fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF}
      fornecedores={[AGRO]} safras={SAFRAS} onCriarFornecedor={async () => null} {...props} />
  </MemoryRouter></QueryClientProvider>);
}
