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
  g.__bancoBancada = {
    from: (t: string) => t === 'financiamentos' ? [d.contrato] : t === 'financiamento_parcelas' ? d.vencimentos.map((v: string, i: number) => ({ data_vencimento: v, status: 'pendente', numero_parcela: i + 1 }))
      : t === 'financeiro_plano_contas' ? d.planos : [],
    rpc: (fn: string) => fn === 'fn_financiamento_cronograma' ? d.cronograma : null,
  };
  montar(<CadastroDeContratoDialog aberto aoFechar={() => {}} financiamentoId={m === 'editar' ? d.contrato.id : null} prefill={m === 'editar' ? undefined : { natureza: 'financiamento' }} />);
} else if (tela === 'lancamento') {
  /* com `desc`, a edição é parcela de uma compra parcelada SEM número de contrato: o rodapé fala dela (a descrição do contrato é a longa) */
  g.__bancoBancada = { from: () => [], rpc: (fn: string) => (desc && fn === 'fn_lancamento_financiamento') ? {
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
