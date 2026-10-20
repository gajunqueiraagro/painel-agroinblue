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
import { buscarFornecedores } from '@/lib/fornecedores/buscaDeFornecedor';
import { FinanceiroV2Tab } from '@/pages/FinanceiroV2Tab';
import { GRUPOS, LEITOR, LINHAS, LISTA, RECENTES, USO } from './dados/fornecedores';
import { CasarBlocoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { CasarComBancoModal } from '@/components/financeiro-v2/CasarComBancoModal';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { CompraModalShell } from '@/components/compra/CompraModalShell';
import { AvisoPendenciasCliente } from '@/components/consultor/AvisoPendenciasCliente';
import { NovaPendenciaDialog } from '@/components/consultor/NovaPendenciaDialog';
import { ResumoClientesPainel } from '@/components/consultor/ResumoClientesPainel';
import * as OC from './dados/oc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AcessosTab } from '@/pages/AcessosTab';
import { ContasPagarReceberTab } from '@/components/financeiro-v2/ContasPagarReceberTab';

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
/* a casca do V2 atras: barra lateral de 176px e barra do topo de 96px */
const Casca = ({ children }: { children?: React.ReactNode }) => (
  <div style={{ display: 'flex', height: '100vh' }}><div style={{ width: 176, flexShrink: 0, background: '#1e3a5f' }} />
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><div style={{ height: 96, flexShrink: 0, background: '#e9edf2' }} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div></div></div>);
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
    if (t === 'financeiro_lancamentos_v2' && 'favorecido_id' in e.is) return [
      { id: 'p1', descricao: 'Pagamento de frete de gado para a Fazenda Exemplo — viagem de retorno' }, { id: 'p2', descricao: 'Pagamento de frete de gado para a Fazenda Exemplo — viagem de retorno' },
      { id: 'p3', descricao: 'Manutenção de cerca' }];
    return [];
  },
  rpc: (fn: string, a: any) => fn === 'fn_fornecedor_repetidos' ? GRUPOS : fn === 'fn_fornecedor_uso' ? USO[a.p_fornecedor] ?? { lancamentos: 0 }
    : fn === 'fn_fornecedor_buscar' ? buscarNaBancada(a) : null,
};
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
  montar(<div className="p-3"><FinV2FornecedoresTab /></div>);
} else if (tela === 'financeiro') {
  /* FORN-BUSCA-UNICA-01 — a lista do Financeiro V2 (filtros + tabela), com o filtro de fornecedor da busca única */
  g.__bancoBancada = {
    from: (t: string, e: any) => t === 'financeiro_lancamentos_v2' ? (e.in.id ? [] : LANCAMENTOS)
      : t === 'financeiro_fornecedores' ? LISTA
      : t === 'financeiro_contas_bancarias' ? [{ id: 'bb', nome_conta: 'Banco Alfa', banco: 'BB', fazenda_id: 'f1', ativo: true, ordem_exibicao: 1 }] : [],
    rpc: (fn: string) => fn === 'get_anos_financeiro_v2' ? [{ ano: '2026' }] : fn === 'fn_parcelas_dos_lancamentos' ? {} : null,
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
  montar(<div className="h-full"><ContasPagarReceberTab onIntensiveToggle={() => {}} /></div>);
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
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'get_status_pilares_fechamento'
    ? { p1_mapa_pastos: { status: fechado ? 'oficial' : 'aberto' }, p2_valor_rebanho: { status: 'aberto' } } : null };
  const p: any = v === 'abate' ? OC.propsAbate(aba) : v === 'compra' ? OC.propsCompra(aba) : OC.propsVenda(aba);
  if (v === 'compra' && fechado) p.mesFechadoMsg = OC.MES_FECHADO;
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
  } else {
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => fn === 'fn_espelho_casar' ? { ok: false, motivo: 'soma_nao_bate', no_extrato: 0.01, soma: 0, diferenca: -0.01 } : null };
  montar(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco Exemplo Personalité"
    extrato={{ extrato_id: 'x1', data: '2025-06-30', historico: 'REND PAGO APLIC AUT MAIS · RENDIMENTO SINTETICO DA APLICACAO AUTOMATICA', valor: 0.01 }}
    iniciais={v === 'levado' ? [{ lancamento_id: 'y1', descricao: 'Rendimento de aplicação · junho', fornecedor: 'Banco Exemplo', valor_assinado: 0.01, data_vencimento: '2025-06-30', status_transacao: 'programado' }] : []}
    onConciliado={() => {}} />);
  }
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
if (v === 'ref') props.referenciaOperacionalInfo = { fornecedor_texto: 'AGROPECUARIA EXEMPLO LTDA', fazenda_texto: 'EXEMPLO', plano_texto: 'Nutrição Engorda',
  centro_texto: 'Suplementação', produto_texto: 'Sal mineral', valor: -1345.5, data_referencia: '10/09/2026' };

  raiz.render(<QueryClientProvider client={qc}><MemoryRouter><Casca />
    <LancamentoV2Dialog open onClose={() => {}} onSave={async () => 'x'} fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF}
      fornecedores={[AGRO]} safras={SAFRAS} onCriarFornecedor={async () => null} {...props} />
  </MemoryRouter></QueryClientProvider>);
}
