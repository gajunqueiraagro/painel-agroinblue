/**
 * FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado), com o DANFE SINTETICO (as posicoes do real, dados de teste).
 * A PROVA DO BRIEFING, na bancada: NF 937 -> fornecedor nao cadastrado -> 4 parcelas de 491,64 (20/10/2026 a 20/01/2027) = 1.966,56,
 * o PDF anexado as 4 (a NF na parcela 1, ligada a todas); a segunda leitura da mesma nota barrada; a chave que nao confere barra.
 * E o pedido do Gabriel: lancamento aberto do mesmo fornecedor com o valor -> "Atualizar este" (so' com confirmacao).
 * ⚠ Nenhum banco: os gravadores e as consultas sao falsos; o que se prova e' o que a tela mostra e o que ela manda gravar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClassificacaoItem, ContaBancariaV2, FornecedorV2, LancamentoV2Form, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => {
  /* a cadeia que responde vazio (as culturas da safra leem `agri_safra_area`) */
  const cadeia = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'or']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  /* P138 — a safra da competência é do BANCO (`_fn_safra_da_competencia`): a partir de 01/07/2026, 26/27 (Soja na lavoura, Pec na pecuária) */
  const rpc = vi.fn(async (nome: string, a: { p_escopo?: string; p_data?: string } = {}) => ({ error: null,
    data: nome !== '_fn_safra_da_competencia' || (a.p_data ?? '') < '2026-07-01' ? null
      : a.p_escopo === 'agricultura' ? 's-soja' : a.p_escopo === 'pecuaria' ? 's-pec' : null }));
  return { supabase: { from: () => cadeia(), rpc, storage: { from: () => ({}) } } };
});
const consultas = vi.hoisted(() => ({
  camposQueOEmitenteCompleta: vi.fn(async (_c: string, _f: string, _e: unknown): Promise<string[]> => []),
  completarCadastroPeloXml: vi.fn(async (_c: string, _f: string, _e: { ie: string | null; endereco?: { municipio: string | null; uf: string | null } | null }): Promise<string | null> => null),
  gravarDocumentoNoCadastro: vi.fn(async (): Promise<string | null> => null),
  /* P146 — as consultas que decidem devolvem `Consulta` ({ ok, valor } | { ok: false, motivo }) */
  lancamentosAbertosComValor: vi.fn(async (_c: string, _f: string, _v: readonly number[]): Promise<Consulta<unknown[]>> => ({ ok: true, valor: [] })),
  iePorFazenda: vi.fn(async (): Promise<Record<string, string>> => ({ 'faz-1': '280000002' })),
  /* nota já lançada (29/10) — "No sistema hoje": a fazenda, o subcentro e o fornecedor de cada achado (padrão: a leitura respondeu vazia) */
  comoEstaoHoje: vi.fn(async (_c: string, _ids: readonly string[]): Promise<Consulta<{ id: string; fazendaId: string | null; subcentro: string | null;
    favorecidoId: string | null; planoContaId: string | null; safraId: string | null }[]>> => ({ ok: true, valor: [] })),
  /* NOTA-FAZENDA-PELA-IE-01 — gravar a IE na fazenda (simula e grava) */
  inscreverEmFazendas: vi.fn((_cb: (c: string) => void) => () => undefined),
  aliasesDasFazendas: vi.fn(async (): Promise<Record<string, string[]>> => ({})),
  gravarIeDaFazenda: vi.fn(async (_f: string, _ie: string, _r: string | null, simular: boolean, _c: string)
    : Promise<{ ok: true; frase: string | null; trilhaId: string | null } | { ok: false; frase: string }> => (simular
      ? { ok: true, frase: 'Faz. Sintetica passa a ter a IE 280000002: as próximas notas com esta IE de destinatário já vêm com a fazenda.', trilhaId: null }
      : { ok: true, frase: null, trilhaId: 'trilha-1' })),
  desfazerIeDaFazenda: vi.fn(async (): Promise<string | null> => null),
  fornecedorPeloNome: vi.fn(async (): Promise<Consulta<string | null>> => ({ ok: true, valor: null })),
  notaJaRegistrada: vi.fn(async (): Promise<Consulta<unknown[]>> => ({ ok: true, valor: [] })),
  ultimaClassificacaoDoFornecedor: vi.fn(async (): Promise<unknown> => null),
  fornecedorPeloDocumento: vi.fn(async (_c: string, _d: string): Promise<Consulta<{ id: string; nome: string; ativo: boolean } | null>> => ({ ok: true, valor: null })),
  usoDoFornecedor: vi.fn(async (_f: string): Promise<{ lancamentos: number; ultimo: string | null } | null> => ({ lancamentos: 3, ultimo: '2026-09-01' })),
  /* P128b — completar com a nota: a prévia é a própria função com `simular`; por padrão aceita tudo e devolve as linhas do pedido */
  completarComANota: vi.fn(async (_c: string, pedido: readonly Record<string, unknown>[], o: { juntar: boolean; chave: string | null; simular: boolean; valorNotaCent?: number | null })
    : Promise<Consulta<ResultadoCompletar>> => ({ ok: true, valor: { ok: true, recusas: [], efeitoDre: [], operacao: o.simular ? null : 'op-1',
      financiamentoId: o.juntar && !o.simular ? 'fin-1' : null,
      linhas: pedido.map((x) => ({ id: String(x.id), descricao: null, situacao: 'programada', parcelaN: null, campos: {} })) } })),
  registrarNaOperacao: vi.fn(async (_op: string, _c: readonly string[], _d: readonly string[]): Promise<string | null> => null),
  desfazerCompletar: vi.fn(async (_op: string): Promise<string | null> => null),
  cancelarCriados: vi.fn(async (_ids: readonly string[], _p: string): Promise<number> => 0),
  /* NOTA-JA-LANCADA-01 — nada ja' lancado, por padrao */
  notaJaLancada: vi.fn(async (_c: string, _e: unknown): Promise<Consulta<LancamentoJaLancado[]>> => ({ ok: true, valor: [] })),
  /* NOTA-FORNECEDOR-COMPARAR-01 — o cadastro de hoje e a gravacao com trilha */
  cadastroParaComparar: vi.fn(async (_c: string, _f: string): Promise<Record<string, string | null> | null> => ({
    nome: 'Agro Sintetica Insumos Agropecuarios Ltda', nome_fantasia: null, cpf_cnpj: null, inscricao_estadual: null, logradouro: null, numero: null,
    complemento: null, bairro: null, cep: null, municipio: 'Campo Grande', uf: 'MS' })),
  atualizarCamposDoCadastro: vi.fn(async (_f: string, _c: Record<string, string>, _o: string, _r: string | null, _cli: string): Promise<{ ok: true; alteracaoId: string | null } | { ok: false; frase: string }> => ({ ok: true, alteracaoId: 'alt-1' })),
  desfazerCamposDoCadastro: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => consultas);
/* Ajuste 12 — a aba Itens da nota já lançada: os itens fiscais (guardados ou do arquivo) num hook só; o teste diz o que ele responde */
const itensTela = vi.hoisted(() => ({ responder: (_o: { arquivo: File | null }): { nota: unknown; carregando: boolean } => ({ nota: null, carregando: false }) }));
vi.mock('@/hooks/useItensDaNota', () => ({ useItensDaNotaDaTela: (o: { arquivo: File | null }) => itensTela.responder(o) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
const leitura = vi.hoisted(() => ({ lerNota: vi.fn() }));
vi.mock('@/lib/financeiro/nfe/lerNota', () => leitura);
/* P95 — o tamanho das paginas do PDF da chave digitada (o leitor de verdade carrega o pdfjs) */
vi.mock('@/lib/financeiro/nfe/lerNotaPdf', () => ({ itensDoPdf: vi.fn(async () => ({ paginas: [[]], tamanhos: [{ largura: 595.28, altura: 841.89 }] })) }));
/* P74 — os dias de vencimento do cartão (a RPC de verdade vai ao banco): o Elo sintético vence no dia 10 */
const cartaoNoBanco = vi.hoisted(() => ({ diasDoCartao: vi.fn(async (_c: string): Promise<{ dia: number; lancamentos: number; ultimo: string }[]> => []) }));
vi.mock('@/lib/financeiro/diasDoCartao', () => cartaoNoBanco);

import { NotaFiscalDialog, fraseDoCompletar, quantidadeCurta, type NotaParaLancar } from './NotaFiscalDialog';
import { NovoDeXmlDialog, arquivoPdfDaNota } from './NovoDeXmlDialog';
import type { Gravadores } from './criarDaNota';
import type { RespostaDoCnpj } from '@/lib/fornecedores/consultaCnpj';
import type { PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';
import type { DocumentoPendente, ParcelaGravada } from '@/lib/financeiro/documentosPendentes';
import { FRASE_NOTA_SEM_CHAVE, FRASE_PDF_SEM_TEXTO, digitoDaChave, notaDoDanfe, type ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import { FRASE_CHAVE_INVALIDA, lidoDaChave, notaDaChaveDigitada } from '@/lib/financeiro/nfe/chaveDigitada';
import { proporLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { PAGINAS_DANFE_SINTETICO, danfeSinteticoAvulsa, danfeSinteticoSemDuplicata } from '@/lib/financeiro/nfe/__fixtures__/danfeSintetico';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import type { DocumentoDaParcela, GravadoresDaJuncao } from '@/lib/financeiro/juntarParcelas';
import type { Consulta, OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';
import type { ResultadoCompletar } from '@/lib/financeiro/nfe/notaCompletar';
import { toast } from 'sonner';
import { itensDoXml } from '@/lib/financeiro/nfe/itensDaNota';
import { XML_ITENS_SINTETICO } from '@/lib/financeiro/nfe/__fixtures__/xmlItensSintetico';
import { prefillDaNota } from '@/lib/financeiro/nfePrefill';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  vi.clearAllMocks();
  consultas.camposQueOEmitenteCompleta.mockResolvedValue([]);
  consultas.lancamentosAbertosComValor.mockResolvedValue({ ok: true, valor: [] });
  consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [] });
  /* P128b — a recusa de um teste (J2/J3) não vaza para o próximo: a prévia volta a aceitar tudo */
  consultas.completarComANota.mockImplementation(async (_c, pedido, o) => ({ ok: true, valor: { ok: true, recusas: [], efeitoDre: [],
    operacao: o.simular ? null : 'op-1', financiamentoId: o.juntar && !o.simular ? 'fin-1' : null,
    linhas: pedido.map((x) => ({ id: String(x.id), descricao: null, situacao: 'programada', parcelaN: null, campos: {} })) } }));
});

const FAZENDAS: Fazenda[] = [{ id: 'faz-1', nome: 'Faz. Sintetica', owner_id: 'u1', cliente_id: 'cli', codigo: null },
  { id: 'faz-2', nome: 'Faz. Sintetica Dois', owner_id: 'u1', cliente_id: 'cli', codigo: 'FSD' }];
const CONTAS: ContaBancariaV2[] = [{ id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'faz-1', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null, aliases: null }];
const SAFRAS: Safra[] = [{ id: 's-soja', nome: 'Safra 26/27 Soja', ativa: true, codigo: '26/27-SOJ', escopo_negocio: 'agricultura' },
  { id: 's-pec', nome: '26/27 Pecuária', ativa: true, codigo: '26/27-Pec', escopo_negocio: 'pecuaria' }];
const PLANO: ClassificacaoItem[] = [
  { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-ins', subcentro: 'Insumos Lavoura', centro_custo: 'Insumos', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
  { id: 'pl-ent', subcentro: 'Venda de Bezerros', centro_custo: 'Vendas', grupo_custo: 'Receita', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];
const CNPJ = '11222333000424';
const comDvDaChave = (c43: string) => `${c43}${digitoDaChave(c43)}`;
const RECEITA = vi.fn(async (_cnpj: string): Promise<RespostaDoCnpj> => ({ ok: true, dados: {
  razaoSocial: 'AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA', fantasia: '', municipio: 'Campo Grande', uf: 'MS', logradouro: 'Rua das Flores', numero: '100',
  complemento: '', bairro: 'Centro', cep: '79000-000', matrizFilial: 'FILIAL',
} }));

function montarNota(opcoes: { paginas?: ItemDoDanfe[][]; fornecedores?: FornecedorV2[]; ocorrencias?: OcorrenciaDaNota[]; umaParcela?: boolean; semDuplicata?: boolean;
  /* P163-2 — o PDF escaneado que não trouxe itens legíveis (a NF 31776 da Vera) */
  semItens?: boolean;
  /* NOTA-FAZENDA-PELA-IE-01 — as fazendas que a leitura conhece (padrao: a Faz. Sintetica COM a IE da nota) */
  fazendasDaLeitura?: { id: string; nome: string; ie: string | null; aliases?: string[] }[] } = {}): NotaParaLancar {
  const r = notaDoDanfe(opcoes.paginas ?? PAGINAS_DANFE_SINTETICO);
  if (r.ok === false) throw new Error(r.frase);
  /* nota de UMA parcela: a duplicata unica com o valor da nota */
  /* P162 — nota SEM duplicata (o molde do NJ: só a emissão, o pagamento é de outro dia) */
  if (opcoes.semDuplicata) { r.nota.duplicatas = []; r.nota.somaDuplicatasCent = 0; }
  if (opcoes.semItens) r.nota.itens = [];
  if (opcoes.umaParcela) { r.nota.duplicatas = [{ numero: '001', vencimento: '2026-10-20', valorCent: r.nota.totais.notaCent }]; r.nota.somaDuplicatasCent = r.nota.totais.notaCent; }
  const resolucao = resolverEmitente(r.nota.emitente, opcoes.fornecedores ?? [], null);
  const p = proporLancamento({ nota: r.nota, avisosDoLeitor: r.avisos, fazendas: opcoes.fazendasDaLeitura ?? [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: null });
  if (p.ok === false) throw new Error(p.frase);
  const bytes = new TextEncoder().encode('%PDF-1.4 sintetico').buffer;
  const arquivo = arquivoPdfDaNota(bytes, '000.000.937.pdf');
  return {
    arquivo, bytes,
    lido: { ok: true, origem: 'pdf', nota: r.nota, avisos: r.avisos, marcas: r.marcas, divergencias: r.divergencias, tamanhos: [{ largura: 841.89, altura: 595.28 }] },
    doXml: { proposta: p.proposta, emitenteNome: r.nota.emitente.nome, emitenteDocumento: r.nota.emitente.documento, emitente: r.nota.emitente, resolucao,
      ocorrencias: opcoes.ocorrencias ?? [], arquivo },
  };
}

function gravadoresFalsos() {
  const parcelas: ParcelaGravada[] = [1, 2, 3, 4].map((numero) => ({ numero, lancamentoId: `lanc-${numero}` }));
  const g = {
    gravar: vi.fn(async (_p: PayloadParcelamento, _c: string): Promise<string | null> => 'fin-1'),
    parcelas: vi.fn(async (_id: string): Promise<ParcelaGravada[]> => parcelas),
    documentosDoParcelamento: vi.fn(async (_c: string, _p: readonly ParcelaGravada[], pend: readonly DocumentoPendente[]) => pend.map((x) => ({ ...x, gravado: true }))),
    documentosDoLancamento: vi.fn(async (_c: string, _l: string, pend: readonly DocumentoPendente[]) => pend.map((x) => ({ ...x, gravado: true }))),
    numeroNoLancamento: vi.fn(async (_c: string, _ids: readonly string[], _n: string): Promise<string | null> => null),
    parcelarExistente: vi.fn(async (_l: string, _p: PayloadParcelamento): Promise<string | null> => 'fin-velho'),
    lancamento: vi.fn(async (_f: LancamentoV2Form): Promise<string | null> => 'lanc-unico'),
    trocarFornecedor: vi.fn(async (_c: string, _ids: readonly string[], _f: string, _m: string): Promise<string | null> => null),
    vincular: vi.fn(async (_c: string, _doc: string, _ids: readonly string[]): Promise<string | null> => null),
  };
  const comoGravadores: Gravadores = g;
  return { g, comoGravadores };
}
const FORN: FornecedorV2 = {
  id: 'f1', nome: 'Agro Sintetica', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null,
  banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null, observacao_pagamento: null,
};

function abrirSemEsperar(nota: NotaParaLancar, extra: { fornecedores?: FornecedorV2[]; g?: Gravadores; onCriarLancamento?: (f: LancamentoV2Form) => Promise<string | null>; contas?: ContaBancariaV2[]; gj?: GravadoresDaJuncao; partindoDe?: string | null } = {}) {
  const onCriarFornecedor = vi.fn(async (nome: string, _faz: string | null, _doc?: string): Promise<FornecedorV2 | null> => ({ ...FORN, id: 'forn-novo', nome }));
  const props = {
    onClose: vi.fn(), onCriado: vi.fn(), onAbrirNoLancamento: vi.fn(), onAbrirRegistrada: vi.fn(), onCriarFornecedor,
    /* ITENS-NOTA-01 — o gravador dos itens (o de verdade vai ao banco) */
    gravarItens: vi.fn(async (_c: string, _b: ArrayBuffer): Promise<string | null> => null),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaFiscalDialog open clienteId="cli" clienteNome="NJ" nota={nota} fazendas={FAZENDAS} contas={extra.contas ?? CONTAS} classificacoes={PLANO} safras={SAFRAS}
        fornecedores={extra.fornecedores ?? []} gravadores={extra.g} consultarReceita={RECEITA} onCriarLancamento={extra.onCriarLancamento} gravadoresDaJuncao={extra.gj} partindoDe={extra.partindoDe} {...props} />
    </QueryClientProvider>,
  );
  return props;
}
/* Ajuste 11 (29/10 14:12) — enquanto a busca "nota já lançada" roda, o modal é o ESQUELETO da tela nova; o teste olha a tela depois da resposta */
async function abrir(...args: Parameters<typeof abrirSemEsperar>) {
  const props = abrirSemEsperar(...args);
  await waitFor(() => expect(screen.queryByTestId('nota-procurando')).toBeNull());
  return props;
}
async function escolherSubcentro(nome: string) {
  /* mock da nota já lançada (29/10) — o seletor da que NASCE mora na aba "Lançamento"; sem parcela a criar, no "Para todas" do "Como vai ficar" */
  const abas = screen.queryByTestId('nota-abas-ja');
  if (!screen.queryByTestId('nota-subcentro') && abas) fireEvent.click(within(abas).getByText(/Lançamento/));
  if (!screen.queryByTestId('nota-subcentro') && abas) fireEvent.click(within(abas).getByText(/Como vai ficar/));
  /* SELETOR-CONTA-POR-ATIVIDADE-01 — o subcentro da previa e' o `EscolherConta` (o gatilho e' o combobox do seletor do plano) */
  fireEvent.click(within(await screen.findByTestId('nota-subcentro')).getByRole('combobox'));
  fireEvent.click(await screen.findByText(nome));
}

describe('N1 — a nota lida, como no mock', () => {
  it('quantidade curta e a frase do completar', () => {
    expect([quantidadeCurta('2.0000'), quantidadeCurta('1.5000'), quantidadeCurta('10')]).toEqual(['2', '1,5', '10']);
    expect(fraseDoCompletar(['inscricao_estadual', 'logradouro', 'numero', 'municipio', 'uf'])).toBe('IE, endereço e cidade');
  });
});

/* ═══ NOTA-FAZENDA-PELA-IE-01 — a fazenda pela nota: a IE do destinatario; sem IE gravada, o nome no endereco ("FAZ SINTETICA, S/N") ═══ */
describe('N3 — o que barra', () => {
  /* P128a (decisao b) — a nota ja' anexada a um LANCAMENTO nao barra: e' o ponto de partida, a busca dos irmaos roda igual */
  /* NOTA-AVULSA-890-01 — a NF-e avulsa (serie 890–899): a chave traz o CNPJ do ORGAO emissor; o emitente e' o CPF do produtor */
  it('venda comum: sem aviso de remessa', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });   /* a tela da nota já lançada (a nova passa ao Novo lançamento) */
    await abrir(montarNota({ fornecedores: [FORN] }));
    expect(screen.queryByTestId('nota-aviso-remessa')).toBeNull();
  });
});

describe('N5 — NOTA-NOVA-MODAL-REAL: o "+ Da nota" com um PDF só abre direto — a que NÃO está no sistema no Novo lançamento; a já lançada na tela da nota', () => {
  const soltarUmPdf = (onAbrirNota: ReturnType<typeof vi.fn>, onAbrirLancamento: ReturnType<typeof vi.fn>) => {
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'faz-1', nome: 'Faz. Sintetica' }]} fornecedores={[]}
      onAbrirLancamento={onAbrirLancamento} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    const pdf = new File([new TextEncoder().encode('%PDF-1.4 x')], '000.000.937.pdf', { type: 'application/pdf' });
    Object.defineProperty(pdf, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4 x').buffer });
    fireEvent.change(screen.getByTestId('xml-input'), { target: { files: [pdf] } });
  };
  it('a nota que NÃO está no sistema abre o Novo lançamento (nunca a tela intermediária), com o PDF como application/pdf e a descrição vazia', async () => {
    leitura.lerNota.mockResolvedValue(montarNota().lido);
    const onAbrirNota = vi.fn();
    const onAbrirLancamento = vi.fn();
    soltarUmPdf(onAbrirNota, onAbrirLancamento);
    await waitFor(() => expect(onAbrirLancamento).toHaveBeenCalledTimes(1));
    expect(onAbrirNota).not.toHaveBeenCalled();
    const [doXml] = onAbrirLancamento.mock.calls[0];
    expect(doXml.arquivo.type).toBe('application/pdf');
    expect(doXml.proposta.parcelamento).toEqual({ tipo: 'parcelado', parcelas: 4, primeiroVencimento: '2026-10-20' });
    expect(doXml.proposta.fazendaId).toBe('faz-1');
    expect(prefillDaNota(doXml).descricao).toBe('');
  });
  it('a nota JÁ lançada abre a tela da nota (as abas), nunca o Novo lançamento', async () => {
    leitura.lerNota.mockResolvedValue(montarNota().lido);
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const onAbrirNota = vi.fn();
    const onAbrirLancamento = vi.fn();
    soltarUmPdf(onAbrirNota, onAbrirLancamento);
    await waitFor(() => expect(onAbrirNota).toHaveBeenCalledTimes(1));
    expect(onAbrirLancamento).not.toHaveBeenCalled();
    expect(onAbrirNota.mock.calls[0][0].arquivo.type).toBe('application/pdf');
  });
});

/* ═══ NOTA-NOVA-MODAL-REAL (Gabriel 30/10) — A TELA DA NOTA NUNCA CRIA ══════════════════════════════════════════════════════════════
   A nota que NÃO está no sistema não fica aqui: passa ao Novo lançamento de sempre com SÓ o que a nota leu (o mesmo `prefillDaNota` da lista;
   descrição vazia), e só o Salvar dele grava. "Como foi pago?", "Criar N parcelas", "Atualizar este / Atualizar e parcelar" saíram; o "duplica"
   também passa ao Novo lançamento (o motivo na observação). Substituem os testes da tela intermediária (N1, N2, N3, N4, N6, N7, N8, N10, P74,
   P95-prévia, P101, P146 e os "Criar 4 parcelas" da NOTA-JA-LANCADA-01). Valores SINTÉTICOS. */
describe('NOTA-NOVA-MODAL-REAL — a tela da nota nunca cria: a nota nova passa ao Novo lançamento', () => {
  const nadaGravado = (g: ReturnType<typeof gravadoresFalsos>['g'], props: { onCriado: ReturnType<typeof vi.fn> }) => {
    expect([g.gravar, g.lancamento, g.documentosDoParcelamento, g.documentosDoLancamento, g.parcelarExistente, g.numeroNoLancamento, props.onCriado]
      .map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  };
  const passou = async (props: { onAbrirNoLancamento: ReturnType<typeof vi.fn> }) => {
    await waitFor(() => expect(props.onAbrirNoLancamento).toHaveBeenCalledTimes(1));
    return props.onAbrirNoLancamento.mock.calls[0][0];
  };

  it('nada achado: passa UMA vez ao Novo lançamento com o que a nota leu — fornecedor pelo CNPJ, fazenda pela IE, as 4 duplicatas, nº 000.000.000, Nota Fiscal, o PDF — e a descrição VAZIA; nada gravado; "Como foi pago?" e "Criar" nunca aparecem', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrirSemEsperar(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    const prefill = await passou(props);
    expect(prefill).toMatchObject({ favorecido_id: 'f1', fazenda_id: 'faz-1', numero_documento: '000.000.937', tipo_documento: 'Nota Fiscal',
      status_transacao: 'programado', data_vencimento: '2026-10-20', valor: 1966.56, descricao: '' });
    expect(prefill.doXml.proposta.duplicatas.map((d: { vencimento: string }) => d.vencimento)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20']);
    expect(prefill.doXml.arquivo.type).toBe('application/pdf');
    /* nada escolhido aqui: nem conta, nem subcentro decidido pela tela (a tela nem apareceu) */
    expect(prefill.conta_bancaria_id).toBeUndefined();
    expect(screen.queryByTestId('nota-como-foi-pago')).toBeNull();
    expect(screen.queryByTestId('nota-criar')).toBeNull();
    expect(screen.getByTestId('nota-procurando')).toBeTruthy();   /* o esqueleto fica enquanto passa: nada pisca */
    nadaGravado(g, props);
  });
  it('nota de UMA parcela: passa ao Novo lançamento com o vencimento da duplicata; SEM duplicata: o vencimento VAZIO (nunca a emissão, que ninguém escolheu)', async () => {
    const um = abrirSemEsperar(montarNota({ fornecedores: [FORN], umaParcela: true }));
    expect((await passou(um)).data_vencimento).toBe('2026-10-20');
    cleanup();
    const sem = abrirSemEsperar(montarNota({ fornecedores: [FORN], semDuplicata: true }));
    expect((await passou(sem)).data_vencimento).toBe('');
  });
  it('a fazenda chega pela IE; sem IE gravada, pelo endereço ("confira") — o Novo lançamento a mostra em âmbar com a origem', async () => {
    const pelaIe = abrirSemEsperar(montarNota({ fornecedores: [FORN] }));
    const a = await passou(pelaIe);
    expect([a.fazenda_id, a.doXml.proposta.origens.fazenda]).toEqual(['faz-1', 'IE 280000002']);
    cleanup();
    const SEM_IE = [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: null }, { id: 'faz-2', nome: 'Faz. Sintetica Dois', ie: null }];
    const peloEndereco = abrirSemEsperar(montarNota({ fornecedores: [FORN], fazendasDaLeitura: SEM_IE }));
    const b = await passou(peloEndereco);
    expect([b.fazenda_id, b.doXml.proposta.origens.fazenda]).toEqual(['faz-1', 'pelo endereço, confira']);
  });
  it('só lançamentos CANCELADOS desta nota: ela não está lançada — passa ao Novo lançamento (cancelado não conta)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [
      jaLancado(1, '2026-10-20', 'programado', { id: 'canc-1', cancelado: true, parcelas: [], por: ['chave'] }),
      jaLancado(2, '2026-11-20', 'programado', { id: 'canc-2', cancelado: true, parcelas: [], por: ['chave'] }),
    ] });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrirSemEsperar(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await passou(props);
    nadaGravado(g, props);
  });
  it('D1: a nota nova não procura os lançamentos abertos do fornecedor nem oferece "Atualizar este / Atualizar e parcelar" — passa ao Novo lançamento', async () => {
    consultas.lancamentosAbertosComValor.mockClear();
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrirSemEsperar(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await passou(props);
    expect(consultas.lancamentosAbertosComValor).not.toHaveBeenCalled();
    expect(screen.queryByTestId('nota-atualizar-faixa')).toBeNull();
    nadaGravado(g, props);
  });
  it('pela CHAVE digitada (sem emissão nem valor), nada achado: passa ao Novo lançamento com valor 0,00 e competência vazia — o operador preenche lá', async () => {
    const r = notaDaChaveDigitada(comDvDaChave('5026091122233300042455001000000937121753829'));
    if (r.ok === false) throw new Error(r.frase);
    const lido = lidoDaChave(r.nota, [{ largura: 595.28, altura: 841.89 }]);
    const resolucao = resolverEmitente(r.nota.emitente, [FORN], null);
    const p = proporLancamento({ nota: r.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: null });
    if (p.ok === false) throw new Error(p.frase);
    const bytes = new TextEncoder().encode('%PDF-1.4 escaneado').buffer;
    const arquivo = arquivoPdfDaNota(bytes, 'nota-sintetica.pdf');
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrirSemEsperar({ arquivo, bytes, lido, doXml: { proposta: p.proposta, emitenteNome: '', emitenteDocumento: CNPJ, emitente: r.nota.emitente, resolucao, ocorrencias: [], arquivo } },
      { fornecedores: [FORN], g: comoGravadores });
    const prefill = await passou(props);
    expect([prefill.valor, prefill.data_competencia, prefill.descricao, prefill.favorecido_id]).toEqual([0, '', '', 'f1']);
    nadaGravado(g, props);
  });
  it('a nota já lançada: o "duplica" (⋯) pede o motivo e ABRE o Novo lançamento com a nota e o motivo na observação — nada gravado daqui', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    fireEvent.keyDown(screen.getByTestId('nota-mais'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-mais-criar-novo'));
    fireEvent.click(await screen.findByTestId('nota-criar-duplicando'));
    expect(screen.getByTestId('nota-criar-duplicando').textContent).toBe('Novo lançamento (duplica)');
    expect(screen.getByTestId('nota-mesmo-assim-confirmar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('nota-mesmo-assim-motivo'), { target: { value: 'outra compra igual no mesmo dia' } });
    fireEvent.click(screen.getByTestId('nota-mesmo-assim-confirmar'));
    const prefill = await passou(props);
    expect([prefill.observacao, prefill.descricao, prefill.numero_documento]).toEqual(['Criado mesmo com a nota parecendo já lançada: outra compra igual no mesmo dia', '', '000.000.937']);
    nadaGravado(g, props);
  });
  it('porta 2 (Ler a NF do Editar): o lançamento aberto NÃO achado pela nota — a frase; não passa ao Novo lançamento (criaria a compra em dobro) e nada se cria daqui', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, partindoDe: 'aberto-no-editar' });
    expect((await screen.findByTestId('nota-porta2-nao-achado')).textContent).toContain('O lançamento aberto não foi achado por esta nota');
    expect(props.onAbrirNoLancamento).not.toHaveBeenCalled();
    expect(screen.queryByTestId('nota-criar')).toBeNull();
    nadaGravado(g, props);
  });
  it('a nota registrada numa OC: barrada, o link para a que existe; a busca não roda e NÃO passa ao Novo lançamento', async () => {
    const onde: OcorrenciaDaNota = { origem: 'oc', documentoId: 'd1', lancamentoId: null, operacaoId: 'op9', operacaoTipo: 'compra', numero: '000.000.937', descricao: 'NF 937 · compra', data: '2026-09-15', valor: 491.64 };
    const props = await abrir(montarNota({ ocorrencias: [onde], fornecedores: [FORN] }));
    expect(consultas.notaJaLancada).not.toHaveBeenCalled();
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('Nota já registrada neste cliente');
    fireEvent.click(screen.getByTestId('nota-abrir-registrada'));
    expect(props.onAbrirRegistrada).toHaveBeenCalledWith(onde);
    expect(props.onAbrirNoLancamento).not.toHaveBeenCalled();
  });
  it('a chave não confere (nº, ou o CNPJ da nota comum): barrada na tela, o vermelho; NÃO passa ao Novo lançamento — e a lista recusa a linha antes de abrir', async () => {
    const paginas = PAGINAS_DANFE_SINTETICO.map((p) => p.map((it) => (it.str === 'Nº 000.000.937' ? { ...it, str: 'Nº 000.000.938' } : it)));
    const props = await abrir(montarNota({ paginas, fornecedores: [FORN] }));
    expect(screen.getByTestId('nota-chave').textContent).toBe('chave não confere: nº');
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('A chave não confere com o lido (nº). Nada será criado.');
    expect(props.onAbrirNoLancamento).not.toHaveBeenCalled();
    cleanup();
    const props2 = await abrir(montarNota({ paginas: danfeSinteticoAvulsa({ serie: '10' }) }));
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('A chave não confere com o lido (CNPJ). Nada será criado.');
    expect(props2.onAbrirNoLancamento).not.toHaveBeenCalled();
    cleanup();
    /* a lista: a linha recusada com a MESMA frase; nem a tela da nota nem o Novo lançamento abrem */
    leitura.lerNota.mockResolvedValue(montarNota({ paginas }).lido);
    const onAbrirNota = vi.fn(); const onAbrirLancamento = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'faz-1', nome: 'Faz. Sintetica' }]} fornecedores={[FORN]}
      onAbrirLancamento={onAbrirLancamento} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    const pdf = new File([new TextEncoder().encode('%PDF-1.4 x')], '000.000.938.pdf', { type: 'application/pdf' });
    Object.defineProperty(pdf, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4 x').buffer });
    fireEvent.change(screen.getByTestId('xml-input'), { target: { files: [pdf] } });
    expect((await screen.findByTestId('xml-recusa')).textContent).toBe('A chave não confere com o lido (nº). Nada será criado.');
    expect([onAbrirNota.mock.calls.length, onAbrirLancamento.mock.calls.length]).toEqual([0, 0]);
  });
  it('nota AVULSA (série 890): não trava — passa ao Novo lançamento; o aviso da remessa de entrega futura vai nos avisos da nota (o Novo lançamento os mostra)', async () => {
    const props = abrirSemEsperar(montarNota({ paginas: danfeSinteticoAvulsa() }));
    const prefill = await passou(props);
    expect(prefill.doXml.proposta.avisos).toContain('Remessa de entrega futura: confira se a nota da venda futura (originária) já foi lançada — esta pode ser só a entrega. A nota cita a originária nº 123.456.');
  });
  it('a nota já anexada a um lançamento NÃO barra: a busca roda; nada achado, passa ao Novo lançamento', async () => {
    const onde: OcorrenciaDaNota = { origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l9', operacaoId: null, operacaoTipo: null, numero: '000.000.937', descricao: 'NF 937 · compra', data: '2026-09-15', valor: 491.64 };
    const props = abrirSemEsperar(montarNota({ ocorrencias: [onde], fornecedores: [FORN] }));
    await passou(props);
    expect(consultas.notaJaLancada).toHaveBeenCalled();
  });
  it('a busca "nota já lançada" FALHOU: a frase e "Tentar de novo"; não passa ao Novo lançamento até verificar — respondendo vazio, passa', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: false, motivo: 'tempo esgotado' });
    const props = await abrir(montarNota({ fornecedores: [FORN] }));
    await waitFor(() => expect(screen.getByTestId('nota-bloqueio').textContent)
      .toContain('Não consegui verificar se esta nota já foi lançada (tempo esgotado). Nada será criado até verificar.'));
    expect(props.onAbrirNoLancamento).not.toHaveBeenCalled();
    expect(screen.getByTestId('nota-abrir-no-lancamento')).toBeDisabled();
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [] });
    fireEvent.click(screen.getByTestId('nota-tentar-de-novo'));
    await passou(props);
  });
  it('enquanto a busca não responde: o esqueleto, nenhum quadro da tela antiga; não achou = o esqueleto FICA e passa ao Novo lançamento (nada pisca)', async () => {
    let responder: (v: Consulta<LancamentoJaLancado[]>) => void = () => undefined;
    consultas.notaJaLancada.mockImplementation(() => new Promise((ok) => { responder = ok; }));
    const props = abrirSemEsperar(montarNota({ fornecedores: [FORN] }));
    expect(await screen.findByTestId('nota-procurando')).toBeTruthy();
    const ANTIGOS = ['nota-bloco-parcelas', 'nota-bloco-lancamento', 'nota-bloco-itens', 'nota-ja-lancada', 'nota-caminhos', 'nota-como-foi-pago'];
    const vistos = new Set<string>();
    const olhar = new MutationObserver(() => { for (const t of ANTIGOS) if (document.querySelector(`[data-testid="${t}"]`)) vistos.add(t); });
    olhar.observe(document.body, { childList: true, subtree: true });
    await act(async () => { responder({ ok: true, valor: [] }); });
    await passou(props);
    olhar.disconnect();
    expect([...vistos]).toEqual([]);
    expect(screen.getByTestId('nota-procurando')).toBeTruthy();
  });
  it('numa janela estreita (< 1000px) a nota nova passa igual', async () => {
    const largura = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 760, configurable: true, writable: true });
    try {
      const props = abrirSemEsperar(montarNota({ fornecedores: [FORN] }));
      await passou(props);
    } finally { Object.defineProperty(window, 'innerWidth', { value: largura, configurable: true, writable: true }); }
  });
});

describe('N9 — NOTA-FORNECEDOR-DUPLICA-01: o cadastro sem CNPJ e o CNPJ ja\' cadastrado', () => {
  /* NOTA-NOVA-MODAL-REAL — o bloco Fornecedor vive na tela da nota JÁ lançada (a nota nova passa ao Novo lançamento): aqui, achada nas 4 */
  beforeEach(() => { consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO }); });
  const SEM_DOC: FornecedorV2 = { ...FORN, id: 'semdoc', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: null };
  /* Ajuste 10 (Gabriel 29/10 14:12) — na nota JÁ LANÇADA a atualização do cadastro do fornecedor continua: o mesmo botão, a mesma comparação, a
     mesma gravação (`atualizarCamposDoCadastro`) da tela antiga, dentro do bloco Fornecedor ao lado da Nota */
  it('nota já lançada: "Completar com o CNPJ" e "sem CNPJ" no bloco Fornecedor; grava pela mesma comparação de antes', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    await abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
    await screen.findByTestId('nota-abas-ja');
    const bloco = screen.getByTestId('nota-bloco-fornecedor');
    expect((await within(bloco).findByTestId('nota-sem-cnpj')).textContent).toContain('sem CNPJ');
    fireEvent.click(within(bloco).getByTestId('nota-completar-fornecedor'));
    await screen.findByTestId('comparar-cadastro');
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(consultas.atualizarCamposDoCadastro).toHaveBeenCalled());
    expect(consultas.atualizarCamposDoCadastro.mock.calls.at(-1)?.[0]).toBe('semdoc');
  });
  it('achado pelo NOME entre os sem CNPJ: "sem CNPJ · 3 lanç. · último", "Completar com o CNPJ" (nao cadastra outro); depois, "cadastrado"', async () => {
    await abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('achado pelo nome · sem CNPJ');
    expect(screen.queryByTestId('nota-cadastrar-fornecedor')).toBeNull();
    expect((await screen.findByTestId('nota-sem-cnpj')).textContent).toContain('sem CNPJ · 3 lanç. · último 01/09/2026');
    fireEvent.click(screen.getByTestId('nota-completar-fornecedor'));
    /* NOTA-FORNECEDOR-COMPARAR-01 — abre a comparacao; o CNPJ (vazio hoje) vem marcado; dois cliques: "Atualizar N" e "Confirmar" */
    await screen.findByTestId('comparar-cadastro');
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    expect(consultas.atualizarCamposDoCadastro).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(consultas.atualizarCamposDoCadastro).toHaveBeenCalled());
    const [forn, campos] = consultas.atualizarCamposDoCadastro.mock.calls[0];
    expect(forn).toBe('semdoc');
    expect(campos.cpf_cnpj).toBe('11.222.333/0004-24');
    expect(consultas.gravarDocumentoNoCadastro).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('cadastrado'));
  });
  it('"Cadastrar outro" e\' escolha do operador: so\' entao aparece "Cadastrar com estes dados"', async () => {
    await abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
    fireEvent.click(screen.getByTestId('nota-cadastrar-outro'));
    expect(await screen.findByTestId('nota-cadastrar-fornecedor')).toBeTruthy();
  });
  it('o CNPJ ja\' e\' de um cadastro (conferido no banco antes de criar): a frase e "Usar este"; nada criado', async () => {
    consultas.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: true, valor: { id: 'ja', nome: 'Cadastro Sintetico Existente', ativo: true } });
    const props = await abrir(montarNota());
    fireEvent.click(screen.getByTestId('nota-cadastrar-fornecedor'));
    expect((await screen.findByTestId('nota-conflito')).textContent).toContain('Cadastro Sintetico Existente');
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('CNPJ já cadastrado');
    expect(props.onCriarFornecedor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('nota-usar-este'));
    await waitFor(() => expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('cadastrado'));
    expect(screen.queryByTestId('nota-cadastrar-fornecedor')).toBeNull();
  });
  it('a nota reaberta RELE^ com a lista de agora: o cadastro criado depois da leitura vira "cadastrado" (nao oferece criar de novo)', async () => {
    const lidaAntes = montarNota();                       // lida quando ainda nao havia cadastro
    expect(lidaAntes.doXml.resolucao.achadoPor).toBeNull();
    await abrir(lidaAntes, { fornecedores: [FORN] });           // o cadastro com o CNPJ existe agora
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('achado pelo CNPJ');
    expect(screen.queryByTestId('nota-cadastrar-fornecedor')).toBeNull();
  });
  /* NOTA-FORNECEDOR-CNPJ-ACHADO-01 (o caso da Elos, sintetico): o cadastro ganhou o CNPJ (com mascara, como todos no banco) pela
     comparacao da nota anterior; a lista da tela chega relida — a previa da nota seguinte casa pelo CNPJ e nao oferece completar */
  it('a lista chega relida com o CNPJ (mascarado) gravado: de "sem CNPJ · Completar" para "achado pelo CNPJ", sem o botão', () => {
    const tela = (fornecedores: FornecedorV2[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <NotaFiscalDialog open clienteId="cli" clienteNome="NJ" nota={nota} fazendas={FAZENDAS} contas={CONTAS} classificacoes={PLANO} safras={SAFRAS}
          fornecedores={fornecedores} consultarReceita={RECEITA} onClose={vi.fn()} onCriado={vi.fn()} onAbrirNoLancamento={vi.fn()} onAbrirRegistrada={vi.fn()}
          onCriarFornecedor={vi.fn(async () => null)} gravarItens={vi.fn(async () => null)} />
      </QueryClientProvider>
    );
    const nota = montarNota({ fornecedores: [SEM_DOC] });
    const r = render(tela([SEM_DOC]));
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('achado pelo nome · sem CNPJ');
    expect(screen.getByTestId('nota-completar-fornecedor').textContent).toBe('Completar com o CNPJ');
    r.rerender(tela([{ ...SEM_DOC, cpf_cnpj: '11.222.333/0004-24' }]));
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('achado pelo CNPJ');
    expect(screen.queryByTestId('nota-completar-fornecedor')).toBeNull();
    expect(screen.queryByTestId('nota-sem-cnpj')).toBeNull();
  });
});

/* ═══ NOTA-JA-LANCADA-01 — o molde do caso de 22/10 (NJ, NF 111): 3 parcelas pagas + 1 programada num cadastro SEM CNPJ com nome
   parecido. A NF 937 sintetica: 4 x 491,64 (20/10/2026 a 20/01/2027). A busca (o banco) e' falsa: devolve os lancamentos achados. */
const LINEAGRO_SEM_CNPJ = 'forn-parecido';
const jaLancado = (n: number, venc: string, status: string, extra: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
  id: `velho-${n}`, vencimento: venc, pagamento: status === 'realizado' ? venc : null, competencia: '2026-09-15', descricao: `Insumos Sinteticos ${n}/4`,
  valorCent: 49164, status, conciliado: status === 'realizado', financiamentoId: 'fin-antigo', contaBancariaId: 'sic', numeroDocumento: null,
  fornecedorId: LINEAGRO_SEM_CNPJ, fornecedorNome: 'Agro Sintetica Insumos SA', fornecedorPor: 'nome',
  parcelas: [{ n, difCent: 0, difDias: 0 }], por: ['valor'], cancelado: false, ...extra,
});
const QUATRO = [jaLancado(1, '2026-10-20', 'realizado'), jaLancado(2, '2026-11-20', 'realizado'), jaLancado(3, '2026-12-20', 'realizado', { valorCent: 49165, parcelas: [{ n: 3, difCent: 1, difDias: 0 }] }),
  jaLancado(4, '2027-01-20', 'programado')];

/* P128b — "Revisar e completar" → a prévia campo a campo → gravar (a prévia confere com o banco antes de liberar o botão) */
/* Gabriel 29/10 10:38 — UM botão: o "Aplicar: …" do rodapé grava de qualquer aba (a prévia "Como vai ficar" fica montada e confere antes) */
async function completarPelaPrevia() {
  const pv = await screen.findByTestId('previa-completar');
  await waitFor(() => expect(screen.getByTestId('nota-completar-revisar')).toBeEnabled());
  fireEvent.click(screen.getByTestId('nota-completar-revisar'));
  return pv;
}
/* a nota já lançada abre em "No sistema hoje"; a tabela da ação por parcela é a aba "Parcelas × sistema" */
async function naAbaParcelas() {
  fireEvent.click(within(await screen.findByTestId('nota-abas-ja')).getByText(/Parcelas × sistema/));
  return screen.findByTestId('nota-ja-lancada');
}
const pedidoGravado = () => {
  const c = consultas.completarComANota.mock.calls.find((x) => x[2].simular === false);
  if (!c) throw new Error('não gravou');
  return { pedido: c[1], opcoes: c[2] };
};

describe('NOTA-JA-LANCADA-01 — a nota que ja\' esta\' lancada', () => {
  it('reconhece as 4 (3 pagas + 1 programada, cadastro sem CNPJ parecido): o bloco no lugar das parcelas; "Revisar e completar" grava pela prévia; nada e\' criado', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    const bloco = await naAbaParcelas();
    expect(within(bloco).getAllByTestId('nota-ja-lancada-linha')).toHaveLength(4);
    expect(screen.queryByTestId('nota-criar')).toBeNull();
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('4 de 4 parcelas desta nota já estão lançadas');
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent).toBe('Nada é gravado antes de você clicar.');
    /* P128a (decisao c) — a 3/4 tem 1 centavo a mais no sistema: o valor em vermelho, nunca corrigido; as outras sem vermelho */
    const valores = within(bloco).getAllByTestId('nota-ja-lancada-valor-sistema');
    expect(valores.map((v) => v.className.includes('text-destructive'))).toEqual([false, false, true, false]);
    expect(within(bloco).getAllByTestId('nota-ja-lancada-situacao').map((x) => x.textContent)).toEqual(['conciliada', 'conciliada', 'conciliada', 'programada']);
    const pedido = consultas.notaJaLancada.mock.calls[0][1] as { parcelas: { n: number; vencimento: string; valorCent: number }[]; chave: string };
    expect(pedido.parcelas).toEqual([1, 2, 3, 4].map((n, i) => ({ n, vencimento: ['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'][i], valorCent: 49164 })));
    expect(pedido.chave).toBe('50260911222333000424550100000009371217538298');
    expect(screen.getByTestId('nota-completar-revisar').textContent).toMatch(/^Aplicar: vincular \d+$/);
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    /* P128b — uma gravação só: os 4, sem juntar (já são um parcelamento); depois a nota; o que nasceu registrado na operação */
    const gravado = pedidoGravado();
    expect([gravado.pedido.map((x) => x.id), gravado.opcoes.juntar]).toEqual([['velho-1', 'velho-2', 'velho-3', 'velho-4'], false]);
    /* P167-B2 — o valor da nota vai ao banco (que recusa quando o que fica passa dele) */
    expect(gravado.opcoes.valorNotaCent).toBe(196656);
    expect(consultas.registrarNaOperacao).toHaveBeenCalledWith('op-1', [], expect.any(Array));
    const [, parcelas, pendentes] = g.documentosDoParcelamento.mock.calls[0];
    expect(parcelas.map((x) => x.lancamentoId)).toEqual(['velho-1', 'velho-2', 'velho-3', 'velho-4']);
    expect(pendentes[0].parcela).toBeNull();
    expect(pendentes[0].arquivo?.type).toBe('application/pdf');
    expect(g.numeroNoLancamento.mock.calls[0][1]).toEqual(['velho-1', 'velho-2', 'velho-3', 'velho-4']);
    expect(g.gravar).not.toHaveBeenCalled();
    expect(g.lancamento).not.toHaveBeenCalled();
    expect(g.trocarFornecedor).not.toHaveBeenCalled();
    expect(props.gravarItens).toHaveBeenCalledTimes(1);
  });
  it('achou 3 de 4: a que falta aparece em ambar; completar cria SO\' a 4/4 (valor e vencimento da nota) antes e anexa a nota as 4', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO.slice(0, 3) });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('3 de 4 parcelas desta nota já estão lançadas');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('1 só na nota');
    const linhas = within(screen.getByTestId('nota-ja-lancada')).getAllByTestId('nota-ja-lancada-linha');
    expect(linhas.map((l) => l.getAttribute('data-situacao'))).toEqual(['conciliada', 'conciliada', 'conciliada', 'so_na_nota']);
    /* mock da nota já lançada (29/10): a que falta diz "não existe no sistema" e a Ação é "Criar" */
    expect([within(linhas[3]).getByTestId('nota-ja-lancada-nao-existe').textContent, within(linhas[3]).getByTestId('nota-acao').textContent])
      .toEqual(['não existe no sistema', 'Criar▾']);
    await escolherSubcentro('Nutrição Engorda');
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    /* P128b — a que falta nasce ANTES e entra na mesma gravação (e no registro da operação, para o desfazer) */
    expect(pedidoGravado().pedido.map((x) => x.id)).toEqual(['velho-1', 'velho-2', 'velho-3', 'lanc-unico']);
    expect(consultas.registrarNaOperacao).toHaveBeenCalledWith('op-1', ['lanc-unico'], expect.any(Array));
    expect(g.lancamento).toHaveBeenCalledTimes(1);
    /* P128b-N1 — a que falta nasce com a conta das irmãs (as 3 estão no Sicredi): a Conta da prévia começou nela */
    expect(g.lancamento.mock.calls[0][0]).toMatchObject({ valor: 491.64, data_vencimento: '2027-01-20', favorecido_id: 'f1', plano_conta_id: 'pl-nut', conta_bancaria_id: 'sic' });
    expect(g.documentosDoParcelamento.mock.calls[0][1].map((x) => x.lancamentoId)).toEqual(['velho-1', 'velho-2', 'velho-3', 'lanc-unico']);
    expect(g.gravar).not.toHaveBeenCalled();
  });
  /* P128b-N1 (Gabriel 28/10 16:04; o caso da Alta Paulista 4/4, nascida sem conta) — irmãs em contas DIFERENTES (ou alguma sem conta):
     "conta" entra no "Falta:" e o "Revisar e completar" fica apagado até escolher; escolhida, libera */
  it('N1 irmãs em contas diferentes: "Falta: conta" e nada se cria até escolher a conta', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [QUATRO[0], { ...QUATRO[1], contaBancariaId: 'outra' }, QUATRO[2]] });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: conta'));
    expect(screen.getByTestId('nota-completar-revisar')).toBeDisabled();
  });
  it('N1 uma irmã sem conta: também "Falta: conta" (nunca nasce vazia calada)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [QUATRO[0], { ...QUATRO[1], contaBancariaId: null }, QUATRO[2]] });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: conta'));
    expect(screen.getByTestId('nota-completar-revisar')).toBeDisabled();
  });
  /* P167 (NOTA-COMPRA-ERRADA-01) — a nota que a compra JÁ TEM (o PDF de antes, sem chave: achado pelo emitente + nº) só se LIGA às parcelas;
     nunca nasce um segundo documento da mesma nota (o 32ffd9af do NJ) */
  it('P167 a compra já tem esta nota: o anexar LIGA o documento que existe (nada de outro registro da mesma nota)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO.map((x, i) => (i === 0 ? { ...x, notaDocumentoId: 'doc-antigo' } : x)) });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.vincular).toHaveBeenCalledWith('cli', 'doc-antigo', ['velho-1', 'velho-2', 'velho-3', 'velho-4']);
    expect(g.documentosDoParcelamento).not.toHaveBeenCalled();
  });
  /* P167 — a soma das parcelas que recebem a nota nunca passa da nota: a frase no rodapé, o "Revisar e completar" apagado, nada gravado */
  it('P167 as parcelas somam mais que a nota: recusa com a frase, nada gravado', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [...QUATRO, { ...QUATRO[0], id: 'velho-5', parcelas: [], por: ['numero'] }] });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    expect((await screen.findByTestId('nota-recusa-compra')).textContent)
      .toBe('⚠ As parcelas que receberiam a nota somam R$ 2.458,21, mais que a nota (R$ 1.966,56). Nada será gravado — confira se todas são desta compra.');
    expect(screen.getByTestId('nota-completar-revisar')).toBeDisabled();
  });
  it('P167 duas compras do mesmo fornecedor: a outra compra fica de fora (o chip diz) e não recebe a nota', async () => {
    const outra = QUATRO.map((x, i) => ({ ...x, id: `outra-${i + 1}`, financiamentoId: 'fin-outra', parcelas: [], por: ['soma' as const, 'fracao' as const] }));
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [...QUATRO.map((x) => ({ ...x, por: ['valor' as const, 'numero' as const] })), ...outra] });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    expect((await screen.findByTestId('nota-outra-compra')).textContent).toBe('4 de outra compra (fica de fora)');
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().pedido.map((x) => x.id)).toEqual(['velho-1', 'velho-2', 'velho-3', 'velho-4']);
    expect(g.documentosDoParcelamento.mock.calls[0][1].map((x) => x.lancamentoId)).toEqual(['velho-1', 'velho-2', 'velho-3', 'velho-4']);
  });
  /* P128b — a caixinha "Trocar o fornecedor" saiu: o fornecedor é a COLUNA da prévia (marcada), gravado pela função única com o antes */
  it('fornecedor diferente: a coluna Fornecedor da prévia leva o da nota aos 4 (a função única), nunca a troca em lote', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, fornecedores: [FORN] });
    await naAbaParcelas();
    expect(screen.queryByTestId('nota-trocar-fornecedor')).toBeNull();
    /* P163-D1 — o Fornecedor começa DESMARCADO: só vai às 4 quando a pessoa marca a linha */
    fireEvent.click(within(screen.getByTestId('nota-abas-ja')).getByText(/Como vai ficar/));
    const pv = await screen.findByTestId('previa-completar');
    /* P163 v4 — a coluna Fornecedor aparece porque o da nota DIFERE do de hoje (o cadastro parecido) */
    expect((await within(pv).findByTestId('previa-coluna-favorecido')).getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(within(pv).getByTestId('previa-coluna-favorecido'));
    await waitFor(() => expect(screen.getByTestId('nota-completar-revisar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-completar-revisar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().pedido.map((x) => x.favorecido_id)).toEqual(['f1', 'f1', 'f1', 'f1']);
    expect(g.trocarFornecedor).not.toHaveBeenCalled();
  });
  /* P128a — o "Criar mesmo assim" virou o 3º CAMINHO ("Criar um lançamento novo", com o aviso vermelho de que duplica) */
  /* P163-2 — no "duplica" o ⋯ fica no mesmo lugar e leva de volta a completar (as abas da nota já lançada voltam; nada é criado) */
  it('no "Criar novo (duplica)", o ⋯ "Voltar a completar com a nota" devolve as abas e o "Como vai ficar"', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { g, comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    fireEvent.keyDown(screen.getByTestId('nota-mais'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-mais-criar-novo'));
    expect(await screen.findByTestId('nota-criar-duplicando')).toBeInTheDocument();
    expect(screen.queryByTestId('nota-abas-ja')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('nota-mais'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-mais-voltar-completar'));
    expect(await screen.findByTestId('nota-completar-revisar')).toBeInTheDocument();
    expect(screen.queryByTestId('nota-criar-duplicando')).toBeNull();
    expect(g.gravar).not.toHaveBeenCalled();
  });
  /* NOTA-CONTAS-NA-CRIACAO-01 C (P75) — o molde do Agnaldo (23/10): a nota de UMA parcela (1.966,56) ja' lancada como 491,64 com o numero
     escrito de outro jeito ("NF_000.000.937"): achada pelo numero, e' "?/4" — nunca "falta" a nota inteira */
  it('C — achada em PARCELA (valor x 4 = a nota): "?/4" com a conta no title, a frase "achada 1 de 4" e nada de criar a que falta', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [jaLancado(1, '2026-10-20', 'agendado', { parcelas: [], por: ['numero'], numeroDocumento: 'NF_000.000.937', financiamentoId: null })] });
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }));
    const bloco = await naAbaParcelas();
    const linhas = within(bloco).getAllByTestId('nota-ja-lancada-linha');
    expect(linhas).toHaveLength(1);
    const parc = within(linhas[0]).getByTestId('nota-ja-lancada-parc');
    expect(parc.textContent).toBe('?/4');
    expect(parc.getAttribute('title')).toBe('parcela ? de 4 da nota: 4 × R$ 491,64 = R$ 1.966,56 (qual das 4, a nota não diz)');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('1 de 4 parcelas desta nota já estão lançadas (R$ 491,64 cada)');
    expect(screen.queryByTestId('nota-criar-faltam')).toBeNull();
    expect(screen.getByTestId('nota-completar-revisar').textContent).toMatch(/^Aplicar: vincular \d+$/);
  });
  /* NOTA-CONTAS-NA-CRIACAO-01 D (P76) — os lancamentos antigos da nota foram CANCELADOS (o caso de 23/10): aparecem cinza, no fim, com o
     selo, e nunca contam */
  const CANCELADOS = [jaLancado(1, '2026-10-20', 'programado', { id: 'canc-1', cancelado: true, parcelas: [], por: ['chave'] }),
    jaLancado(2, '2026-11-20', 'agendado', { id: 'canc-2', cancelado: true, parcelas: [], por: ['numero', 'chave'] })];
  it('D — com os vivos: os 2 cancelados no FIM, com o selo "cancelado" (nunca o status antigo); a frase e o Anexar contam so\' os 4', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [...CANCELADOS, ...QUATRO] });
    await abrir(montarNota({ fornecedores: [FORN] }));
    const bloco = await naAbaParcelas();
    expect(within(bloco).getAllByTestId('nota-ja-lancada-linha')).toHaveLength(4);
    const linhas = within(bloco).getAllByRole('row').slice(2);   // as 2 linhas do cabeçalho (Na nota · No sistema hoje · O que acontece)
    expect(linhas.slice(4).map((r) => r.getAttribute('data-testid'))).toEqual(['nota-ja-lancada-cancelado', 'nota-ja-lancada-cancelado']);
    expect(within(linhas[4]).getByTestId('nota-selo-cancelado').textContent).toBe('cancelado');
    expect(linhas[4].textContent).not.toContain('programado');
    expect(linhas[5].textContent).not.toContain('agendado');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('4 de 4 parcelas desta nota já estão lançadas');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('2 cancelados (não contam)');
    expect(screen.getByTestId('nota-completar-revisar').textContent).toMatch(/^Aplicar: vincular \d+$/);
  });
  /* P128a (porta 2) — a previa aberta pelo Documentos do Editar lancamento, partindo dele */
  it('porta 2: o lançamento aberto achado é "este lançamento" na tabela; "No Novo lançamento" some (o lugar fica)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    await abrir(montarNota({ fornecedores: [FORN] }), { partindoDe: 'velho-2' });
    const bloco = await naAbaParcelas();
    const linhas = within(bloco).getAllByTestId('nota-ja-lancada-linha');
    expect(linhas.map((l) => l.hasAttribute('data-este'))).toEqual([false, true, false, false]);
    expect(linhas[1].textContent).toContain('este lançamento');
    const novo = screen.getByTestId('nota-abrir-no-lancamento');
    expect([novo.className.includes('invisible'), novo.hasAttribute('disabled')]).toEqual([true, true]);
  });
});

/* ═══ NOTA-FORNECEDOR-COMPARAR-01 — "Completar cadastro" mostra como esta' e o que muda; so' o marcado e' gravado ═══ */
describe('NOTA-FORNECEDOR-COMPARAR-01 — comparar antes de atualizar o cadastro', () => {
  /* NOTA-NOVA-MODAL-REAL — o bloco Fornecedor vive na tela da nota JÁ lançada (a nota nova passa ao Novo lançamento): aqui, achada nas 4 */
  beforeEach(() => { consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO }); });
  const SEM_DOC: FornecedorV2 = { ...FORN, id: 'semdoc', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: null };
  const abrirComparar = async (hoje: Record<string, string | null>) => {
    consultas.cadastroParaComparar.mockResolvedValue(hoje);
    await abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
    await screen.findByTestId('nota-sem-cnpj');
    fireEvent.click(screen.getByTestId('nota-completar-fornecedor'));
    return screen.findByTestId('comparar-cadastro');
  };
  const linha = (rotulo: string) => screen.getAllByTestId('comparar-linha').find((l) => l.firstElementChild?.textContent === rotulo);
  it('o nome digitado a mao ("Pec.3M-Esc. Garças") vem DESMARCADO e nao muda; o CNPJ vazio vem marcado; "igual" sem caixa', async () => {
    await abrirComparar({ nome: 'Pec.3M-Esc. Garças Agro Sintetica', nome_fantasia: null, cpf_cnpj: null, inscricao_estadual: null, municipio: 'Campo Grande', uf: 'MS' });
    expect(linha('Razão social')?.getAttribute('data-estado')).toBe('diferente');
    expect(linha('CNPJ/CPF')?.getAttribute('data-estado')).toBe('vazio');
    expect(linha('Cidade/UF')?.getAttribute('data-estado')).toBe('igual');
    expect(within(linha('Cidade/UF') as HTMLElement).queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(consultas.atualizarCamposDoCadastro).toHaveBeenCalled());
    const campos = consultas.atualizarCamposDoCadastro.mock.calls[0][1];
    expect(campos.nome).toBeUndefined();
    expect(campos.municipio).toBeUndefined();
    expect(campos.cpf_cnpj).toBe('11.222.333/0004-24');
  });
  it('marcar a razao social: entra no que vai ao banco; desmarcar o CNPJ: sai', async () => {
    await abrirComparar({ nome: 'Pec.3M-Esc. Garças Agro Sintetica', cpf_cnpj: null, municipio: 'Campo Grande', uf: 'MS' });
    fireEvent.click(screen.getByTestId('comparar-marcar-razao'));
    fireEvent.click(screen.getByTestId('comparar-marcar-cnpj'));
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(consultas.atualizarCamposDoCadastro).toHaveBeenCalled());
    const campos = consultas.atualizarCamposDoCadastro.mock.calls[0][1];
    expect(campos.nome).toBe('AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA');
    expect(campos.cpf_cnpj).toBeUndefined();
  });
  it('o cadastro nao parece o certo (nome sem palavra em comum): a frase no topo e "Cadastrar novo" volta ao cadastrar', async () => {
    await abrirComparar({ nome: 'Posto Exemplo Combustiveis', cpf_cnpj: null, municipio: null, uf: null });
    expect(screen.getByTestId('comparar-aviso').textContent).toContain('não parece o do emitente');
    fireEvent.click(screen.getByTestId('comparar-cadastrar-novo'));
    expect(screen.queryByTestId('comparar-cadastro')).toBeNull();
    expect(await screen.findByTestId('nota-cadastrar-fornecedor')).toBeTruthy();
    expect(consultas.atualizarCamposDoCadastro).not.toHaveBeenCalled();
  });
  it('a recusa do banco (CNPJ de outro ativo) fica escrita no modal; nada muda na previa', async () => {
    consultas.atualizarCamposDoCadastro.mockResolvedValueOnce({ ok: false, frase: 'Este CNPJ já é de outro cadastro ativo. Nada foi gravado.' });
    await abrirComparar({ nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: null, municipio: 'Campo Grande', uf: 'MS' });
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(screen.getByTestId('comparar-frase').textContent).toContain('já é de outro cadastro ativo'));
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('achado pelo nome · sem CNPJ');
  });
});

/* P95 (DANFE-CHAVE-EM-GRUPOS-01) — o molde do caso de 23/10: a nota de UMA parcela paga no cartao em N parcelas lancadas SOLTAS ("… - k/N"),
   o numero so' em algumas; o banco devolve as IRMAS (`fracao`, `fracao_n`). Valores sinteticos: 4 parcelas que somam 4 centavos a menos. */
describe('P95 — a nota achada em N parcelas soltas (as irmas da fracao)', () => {
  const VENC = ['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10'];
  const irma = (n: number, valorCent: number, por: LancamentoJaLancado['por']) => jaLancado(n, VENC[n - 1], 'realizado',
    { id: `irma-${n}`, descricao: `Tinta sintetica - ${n}/4`, valorCent, parcelas: [], por, fracaoN: 4, financiamentoId: null });
  const IRMAS = [irma(1, 49165, ['fracao']), irma(2, 49160, ['fracao']), irma(3, 49164, ['numero', 'fracao']), irma(4, 49163, ['numero', 'fracao'])];
  it('as 4 na lista com "k/4" (a descricao diz qual), a frase com a soma, a nota e a diferenca; nada a criar', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: IRMAS });
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }));
    const bloco = await naAbaParcelas();
    const parcs = within(bloco).getAllByTestId('nota-ja-lancada-parc').map((x) => x.textContent);
    expect(parcs).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent)
      .toBe('4 lançamentos soltos desta nota · soma R$ 1.966,52 × nota R$ 1.966,56 (diferença R$ 0,04) · achados pelo nº da nota · 4 conciliadas');
    expect(screen.queryByTestId('nota-criar-faltam')).toBeNull();
    /* P128b — as 4 soltas achadas inteiras: a prévia JUNTA e padroniza numa gravação só */
    expect([screen.getByTestId('nota-juntar-caixa').getAttribute('data-state'), screen.getByTestId('nota-completar-revisar').textContent]).toEqual(['checked', 'Aplicar: vincular 4']);
  });
});

/* P96a — JUNTAR AS N SOLTAS como parcelas desta nota (o molde do P95: 4 irmãs, soma 1.966,52 × nota 1.966,56). A função do banco é falsa:
   simular devolve o efeito por mês; gravar devolve ok. A nota se anexa pelo MESMO caminho do "Anexar". */
describe('P96a + P128b — juntar as soltas e completar pela prévia campo a campo', () => {
  const VENC = ['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10'];
  const irma = (n: number, valorCent: number) => jaLancado(n, VENC[n - 1], 'realizado',
    { id: `irma-${n}`, descricao: `Tinta sintetica - ${n}/4`, valorCent, parcelas: [], por: ['fracao'], fracaoN: 4, financiamentoId: null });
  const IRMAS = [irma(1, 49165), irma(2, 49160), irma(3, 49164), irma(4, 49163)];
  const EFEITO = [{ mes: '2026-09', valor: 1475.0, parcelas: 3 }, { mes: '2026-10', valor: -491.65, parcelas: -1 },
    { mes: '2026-11', valor: -491.6, parcelas: -1 }, { mes: '2026-12', valor: -491.64, parcelas: -1 }];
  const falsos = (o: { recusaComCompetencia?: boolean; docs?: DocumentoDaParcela[] } = {}) => {
    const juntar = vi.fn(async (_c: string, _ids: readonly string[], comp: string | null, simular: boolean): Promise<unknown> => {
      if (comp && o.recusaComCompetencia) return { ok: false, recusa: { motivo: 'mes_fechado', frase: 'O mês 10/2026 está fechado: reabra antes de mudar a competência.' } };
      return { ok: true, simulado: simular, parcelas: 4, soma: 1966.52, descricao: 'Tinta sintetica', efeito_por_mes: comp ? EFEITO : [], lista: [] };
    });
    const editarDocumento = vi.fn(async (_c: string, _d: string, _v: number, _campos: Record<string, string>) => {});
    const documentos = vi.fn(async (_c: string, _ids: readonly string[]) => o.docs ?? []);
    const gj: GravadoresDaJuncao = { juntar, documentos, editarDocumento };
    return { gj, juntar, editarDocumento };
  };

  /* URGENTE 29/10 + Gabriel 08:26 — o caso do LR (sintético): 4 soltas SEM "k/N" ("Parcela 2 - None"…), 3 pagas e 1 programada. JUNTAR É O
     PADRÃO; a "Parcelas × sistema" mostra todas como estão e o que acontece; a sem informação leva a descrição da nota, a escrita fica + "i/N" */
  const DO_LR = [jaLancado(1, '2026-10-20', 'realizado', { descricao: 'Reforma sintetica' }), jaLancado(2, '2026-11-20', 'realizado', { descricao: 'Parcela 2 - None' }),
    jaLancado(3, '2026-12-20', 'realizado', { descricao: 'Parcela 3 - None' }), jaLancado(4, '2027-01-20', 'programado', { descricao: 'Parcela 4 - hilux sintetica' })]
    .map((l, i): LancamentoJaLancado => ({ ...l, financiamentoId: null, por: i === 1 ? ['valor'] : ['numero'] }));   // a 2ª achada só pelo valor: a "parecida"
  it('LR1 as 4 soltas sem "k/N": "Juntar as 4" vem marcado; cada linha diz o que acontece (🔒 nas pagas); a gravação junta e só a sem informação troca', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: DO_LR });
    const { comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, gj: falsos().gj });
    expect((await screen.findByTestId('nota-juntar-caixa')).getAttribute('data-state')).toBe('checked');
    await naAbaParcelas();
    const efeitos = screen.getAllByTestId('nota-ja-lancada-efeito');
    /* a escrita ganha só o "k/N"; a sem informação ("Parcela 2 - None") leva a descrição da nota */
    /* o Efeito curto na célula, o inteiro no title (de 1024 para cima a tabela cabe, nada corta) */
    expect(efeitos.map((e) => e.textContent)).toEqual(['entra como 1/4', 'entra como 2/4', 'entra como 3/4', 'entra como 4/4']);
    expect(efeitos.map((e) => (e.getAttribute('title') ?? '').split(' · documento hoje:')[0].replace(' · valor, data e conta não mudam', ''))).toEqual(['ganha nº e nota · "… 1/4" · entra na compra como 1/4', 'ganha nº e nota · descrição da nota · entra na compra como 2/4',
      'ganha nº e nota · descrição da nota · entra na compra como 3/4', 'ganha nº e nota · "… 4/4" · entra na compra como 4/4']);
    expect(efeitos.map((e) => !!within(e).queryByTestId('nota-ja-lancada-cadeado'))).toEqual([true, true, true, false]);
    expect(screen.getAllByTestId('nota-ja-lancada-descricao').map((e) => e.textContent)).toEqual(['Reforma sintetica', 'Parcela 2 - None', 'Parcela 3 - None', 'Parcela 4 - hilux sintetica']);
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const { pedido, opcoes } = pedidoGravado();
    expect(opcoes.juntar).toBe(true);
    const d = pedido.map((x) => String(x.descricao));
    expect([d[0], d[3]]).toEqual(['Reforma sintetica 1/4', 'Parcela 4 - hilux sintetica 4/4']);
    expect([d[1].endsWith(' 2/4'), d[2].endsWith(' 3/4'), d.some((x) => x.includes('None'))]).toEqual([true, true, false]);
  });
  it('LR2 desmarcar "Juntar" grava sem juntar; a nota com outro número de duplicatas não junta e DIZ por quê', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: DO_LR });
    const { comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, gj: falsos().gj });
    fireEvent.click(await screen.findByTestId('nota-juntar-caixa'));
    await naAbaParcelas();
    expect([screen.getAllByTestId('nota-ja-lancada-efeito')[0].textContent, screen.getAllByTestId('nota-ja-lancada-efeito')[0].getAttribute('title')?.split(' · documento hoje:')[0]])
      .toEqual(['recebe a nota', 'ganha nº e nota · "… 1/4" · valor, data e conta não mudam']);
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().opcoes.juntar).toBe(false);
    cleanup();
    /* 3 achadas + a 4ª que nasce agora completam as 4: junta (a criada entra pela mesma gravação); "Não criar" a 4ª: não junta e DIZ */
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: DO_LR.slice(0, 3) });
    await abrir(montarNota({ fornecedores: [FORN] }), { g: gravadoresFalsos().comoGravadores, gj: falsos().gj });
    expect((await screen.findByTestId('nota-juntar-caixa')).getAttribute('data-state')).toBe('checked');
    await naAbaParcelas();
    expect(screen.getAllByTestId('nota-ja-lancada-efeito')[3].getAttribute('title')).toContain('nasce programada');
    const acaoDa4 = screen.getAllByTestId('nota-acao')[3];
    expect(acaoDa4.textContent).toBe('Criar▾');
    fireEvent.keyDown(acaoDa4, { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-acao-deixar'));
    /* o Resultado é uma linha: a frase curta, a inteira no title */
    const frase = await screen.findByTestId('nota-juntar-frase');
    expect([frase.textContent, frase.getAttribute('title')]).toEqual(['⚠ não junta (faltam ou sobram)', 'Não junto: a nota tem 4 duplicatas e achei 3 no sistema (confira as que faltam).']);
    expect(screen.getAllByTestId('nota-ja-lancada-efeito')[3].textContent).toBe('não é criada');
    expect(screen.getByTestId('nota-completar-revisar').textContent).toBe('Aplicar: vincular 3');
  });
  /* mock da nota já lançada (29/10) — "Deixar como está" na linha: a parcela não recebe a nota, sai do pedido e do anexar; não junta e DIZ */
  it('LR3 "Deixar como está" numa achada: sai do pedido e do anexar; o Resultado conta; não junta (a frase); o Aplicar diz quantas', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: DO_LR });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, gj: falsos().gj });
    await screen.findByTestId('nota-juntar-caixa');
    await naAbaParcelas();
    const acoes = screen.getAllByTestId('nota-acao');
    expect(acoes.map((x) => x.textContent)).toEqual(['Vincular▾', 'É esta▾', 'Vincular▾', 'Vincular▾']);
    expect(screen.getAllByTestId('nota-ja-lancada-linha').map((x) => x.hasAttribute('data-parecida'))).toEqual([false, true, false, false]);
    const acaoDa2 = acoes[1];
    fireEvent.keyDown(acaoDa2, { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-acao-deixar'));
    expect(screen.getAllByTestId('nota-ja-lancada-efeito')[1].getAttribute('title')?.split(' · documento hoje:')[0]).toBe('fica como está (não recebe a nota)');
    expect(screen.getByTestId('nota-resultado').textContent).toContain('1 fica');
    expect([screen.getByTestId('nota-juntar-frase').textContent, screen.getByTestId('nota-juntar-frase').getAttribute('title')])
      .toEqual(['⚠ não junta (uma fica como está)', 'Não junto: 1 parcela fica como está (não recebe a nota).']);
    expect(screen.getByTestId('nota-completar-revisar').textContent).toBe('Aplicar: vincular 3');
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const { pedido, opcoes } = pedidoGravado();
    expect([pedido.map((x) => x.id), opcoes.juntar]).toEqual([['velho-1', 'velho-3', 'velho-4'], false]);
    expect(JSON.stringify([g.vincular.mock.calls, g.documentosDoLancamento.mock.calls, g.documentosDoParcelamento.mock.calls]).includes('velho-2')).toBe(false);
  });
  /* Gabriel 29/10 10:38 — o caso Gulart (1 de 1, programada; SINTÉTICO): o achado aparece COMO ESTÁ em "No sistema hoje" (fazenda, conta,
     subcentro, status) e na "Parcelas × sistema"; UM botão diz o que faz e grava; nada de segunda tela por cima */
  const GULART = jaLancado(1, '2026-10-10', 'programado', { id: 'gulart-1', descricao: 'Compra cantina sintetica', valorCent: 196656, financiamentoId: null,
    por: ['numero'], parcelas: [], competencia: '2026-09-30' });
  it('G1 1 de 1: "No sistema hoje (1)" mostra o achado inteiro; a Parcelas × sistema tem a linha; "Aplicar: vincular 1" grava sem segunda tela', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [GULART] });
    consultas.comoEstaoHoje.mockResolvedValueOnce({ ok: true, valor: [{ id: 'gulart-1', fazendaId: 'faz-2', subcentro: 'Benefícios sinteticos', favorecidoId: null, planoContaId: 'pl-nut', safraId: null }] });
    const { comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj: falsos().gj });
    expect(within(await screen.findByTestId('nota-abas-ja')).getByText(/No sistema hoje/).textContent).toContain('No sistema hoje (1)');
    const linha = await screen.findByTestId('nota-hoje-linha');
    /* acerto 1 — a fazenda pelo CÓDIGO; o nome só no title */
    await waitFor(() => expect(within(linha).getByTestId('nota-hoje-fazenda').textContent).toBe('FSD'));
    expect(within(linha).getByTestId('nota-hoje-fazenda').getAttribute('title')).toBe('Faz. Sintetica Dois');
    expect(['nota-hoje-descricao', 'nota-hoje-conta', 'nota-hoje-subcentro', 'nota-hoje-valor', 'nota-hoje-status'].map((t) => within(linha).getByTestId(t).textContent))
      .toEqual(['Compra cantina sintetica', 'Sicredi Lavoura', 'Benefícios sinteticos', '1.966,56', 'programada']);
    expect(consultas.comoEstaoHoje.mock.calls.at(-1)?.[1]).toEqual(['gulart-1']);
    expect((await naAbaParcelas()) && screen.getAllByTestId('nota-ja-lancada-linha')).toHaveLength(1);
    expect(screen.getByTestId('nota-ja-lancada-col-acao').style.width).toBe('74px');   // sem a linha à vista, a coluna Ação de sempre
    expect(screen.queryByTestId('nota-caminhos')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('nota-completar-revisar')).toBeEnabled());
    expect(screen.getByTestId('nota-completar-revisar').textContent).toBe('Aplicar: vincular 1');
    fireEvent.click(screen.getByTestId('nota-completar-revisar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().pedido.map((x) => x.id)).toEqual(['gulart-1']);
    expect(screen.queryByRole('dialog', { name: /O que a nota muda/ })).toBeNull();
  });
  /* Ajuste 7 (29/10 14:02) — ver a nota: "Abrir" (o visualizador em tela cheia, com a barra do mock), clicar na miniatura também, e "Nova aba" */
  it('G3 "Abrir" e a miniatura abrem o visualizador (−/+, largura, página, girar, n/N, nova aba); "Nova aba" abre o arquivo', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [GULART] });
    const abriu = vi.spyOn(window, 'open').mockImplementation(() => null);
    const criarUrl = vi.fn(() => 'blob:nota');
    Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() });
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: gravadoresFalsos().comoGravadores, gj: falsos().gj });
    expect(screen.getByTestId('nota-selo-arquivo').textContent).toBe('PDF lido');
    fireEvent.click(screen.getByTestId('nota-abrir-visualizador'));
    const v = await screen.findByTestId('visualizador-documento');
    expect(['visualizador-menos', 'visualizador-mais', 'visualizador-largura', 'visualizador-pagina', 'visualizador-girar', 'visualizador-pagina-n', 'visualizador-nova-aba']
      .every((t) => within(v).queryByTestId(t))).toBe(true);
    fireEvent.click(within(v).getByTestId('visualizador-nova-aba'));
    expect(abriu).toHaveBeenCalledWith('blob:nota', '_blank', 'noopener');
    abriu.mockRestore();
  });
  it('G2 a leitura de "No sistema hoje" falhou: a frase diz (nunca "—" calado no lugar da fazenda)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [GULART] });
    consultas.comoEstaoHoje.mockResolvedValueOnce({ ok: false, motivo: 'sem conexão com o servidor' });
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: gravadoresFalsos().comoGravadores, gj: falsos().gj });
    expect((await screen.findByTestId('nota-hoje-falhou')).textContent).toBe('Não consegui ler fazenda, subcentro e fornecedor (sem conexão com o servidor).');
  });
  /* Caso 3 (Gabriel 29/10 11:33, o molde da M2 Tratores NF 14.222; SINTÉTICO) — a nota À VISTA no CARTÃO em 10: 3 achadas (2 no cartão, 1 na c/c),
     "Parc.7" e "Parcela 8" na descrição. A tela diz "achei 3 — faltam 7", PERGUNTA a posição (descrição × ordem das faturas), e só então numera
     pela posição (6/10…), cria as 7 no cartão das irmãs e junta as 10 */
  const NO_CARTAO = [
    jaLancado(1, '2026-08-10', 'realizado', { id: 'm2-6', descricao: 'Manutencao sintetica 1/3', valorCent: 19666, contaBancariaId: 'elo-m2' }),
    jaLancado(2, '2026-09-10', 'realizado', { id: 'm2-7', descricao: 'Manutencao sintetica - Parc.7 2/3', valorCent: 19666, contaBancariaId: 'elo-m2' }),
    jaLancado(3, '2026-10-10', 'programado', { id: 'm2-8', descricao: 'Parcela 8 - None 3/3', valorCent: 19666, contaBancariaId: 'sic' }),
  ].map((l): LancamentoJaLancado => ({ ...l, financiamentoId: null, por: ['numero'], parcelas: [], conciliado: false }));
  const ELO_M2: ContaBancariaV2 = { id: 'elo-m2', nome_conta: 'Cartão Sintetico Lavoura', banco: null, fazenda_id: 'faz-1', tipo_conta: 'cartao', codigo_conta: null,
    nome_exibicao: 'Cartão Sintetico Lavoura', agencia: null, numero_conta: null, conta_digito: null, aliases: null };
  it('C3 no cartão em 10: "achei 3 — faltam 7"; pergunta a posição; pela descrição: 6/7/8 no lugar, 7 nascem no cartão das irmãs, numera k/10 e junta', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: NO_CARTAO });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj: falsos().gj, contas: [...CONTAS, ELO_M2] });
    await naAbaParcelas();
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('à vista no cartão em 10 parcelas e achei 3');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('faltam 7: diga a posição delas no cartão para seguir.');
    expect(screen.getByTestId('nota-completar-revisar')).toBeDisabled();
    expect(screen.getByTestId('nota-cartao-falta-posicao')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('nota-cartao-pergunta')).getByText(/pela descrição: 6, 7, 8/));
    await waitFor(() => expect(screen.getAllByTestId('nota-ja-lancada-linha')).toHaveLength(10));
    expect(screen.getAllByTestId('nota-ja-lancada-parc').map((x) => x.textContent)).toEqual(['1/10', '2/10', '3/10', '4/10', '5/10', '6/10', '7/10', '8/10', '9/10', '10/10']);
    expect(screen.getByTestId('nota-juntar-caixa').getAttribute('data-state')).toBe('checked');
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-completar-revisar').textContent).toBe('Aplicar: vincular 3 e criar 7'));
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const criadas = g.lancamento.mock.calls.map(([f]) => [f.conta_bancaria_id, f.data_vencimento, String(f.descricao).slice(-5).trim()]);
    expect(criadas).toEqual([['elo-m2', '2026-03-10', '1/10'], ['elo-m2', '2026-04-10', '2/10'], ['elo-m2', '2026-05-10', '3/10'], ['elo-m2', '2026-06-10', '4/10'],
      ['elo-m2', '2026-07-10', '5/10'], ['elo-m2', '2026-11-10', '9/10'], ['elo-m2', '2026-12-10', '10/10']]);
    const { pedido, opcoes } = pedidoGravado();
    expect(opcoes.juntar).toBe(true);
    const d = new Map(pedido.map((x) => [x.id, String(x.descricao)]));
    expect([d.get('m2-6'), d.get('m2-7'), d.get('m2-8')?.endsWith(' 8/10'), d.get('m2-8')?.includes('None')]).toEqual(['Manutencao sintetica 6/10', 'Manutencao sintetica - Parc.7 7/10', true, false]);
  });
  /* P128b — o "Juntar" do P96a agora é a MESMA gravação única da prévia campo a campo (padroniza e junta; o antes guardado) */
  it('J1 as 4 soltas: a prévia padroniza ("base i/4", nº, competência = emissão) e JUNTA numa gravação só; a nota vai às 4', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: IRMAS });
    const { g, comoGravadores } = gravadoresFalsos();
    const { gj, juntar } = falsos();
    const props = await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const { pedido, opcoes } = pedidoGravado();
    expect(opcoes.juntar).toBe(true);
    expect(pedido.map((x) => x.id)).toEqual(['irma-1', 'irma-2', 'irma-3', 'irma-4']);
    expect(pedido.map((x) => String(x.descricao).slice(-4))).toEqual([' 1/4', ' 2/4', ' 3/4', ' 4/4']);
    expect(pedido.every((x) => x.data_competencia === '2026-09-15' && x.numero_documento === '000.000.937' && x.tipo_documento === 'Nota Fiscal')).toBe(true);   // P164: sem "NF", com o tipo
    expect(juntar).not.toHaveBeenCalled();   // a junção é a do banco, dentro da gravação única
    const [, parcelas] = g.documentosDoParcelamento.mock.calls[0];
    expect(parcelas.map((x) => x.lancamentoId)).toEqual(['irma-1', 'irma-2', 'irma-3', 'irma-4']);
  });
  it('J2 a recusa do banco na prévia (mês fechado): a frase pronta e o gravar apagado; nada gravado', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: IRMAS });
    consultas.completarComANota.mockResolvedValue({ ok: true, valor: { ok: false, recusas: ['O mês 09/2026 está fechado: reabra antes de mudar «Tinta».'],
      linhas: [], efeitoDre: [], operacao: null, financiamentoId: null } });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj: falsos().gj });
    /* a recusa da prévia fica no rodapé do modal (o botão único apaga) */
    expect((await screen.findByTestId('nota-previa-impede')).textContent).toBe('⚠ O mês 09/2026 está fechado: reabra antes de mudar «Tinta».');
    expect(screen.getByTestId('nota-completar-revisar')).toBeDisabled();
    expect(consultas.completarComANota.mock.calls.some((x) => x[2].simular === false)).toBe(false);
  });
  it('J3 a gravação recusada DEPOIS de criar a que falta: a recém-criada é CANCELADA (nada pela metade) e a frase fica na prévia', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO.slice(0, 3) });
    consultas.completarComANota.mockImplementation(async (_c, pedido, o) => (o.simular
      ? { ok: true, valor: { ok: true, recusas: [], efeitoDre: [], operacao: null, financiamentoId: null,
          linhas: pedido.map((x) => ({ id: String(x.id), descricao: null, situacao: 'programada', parcelaN: null, campos: {} })) } }
      : { ok: false, motivo: '«Insumos» está pago: conta, valor e vencimento não mudam. Nada foi gravado.' }));
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    await escolherSubcentro('Nutrição Engorda');
    const pv = await completarPelaPrevia();
    /* o erro da gravação fica no rodapé do modal (a prévia não tem mais o dela) */
    void pv;
    expect((await screen.findByTestId('nota-previa-impede')).textContent).toBe('⚠ «Insumos» está pago: conta, valor e vencimento não mudam. Nada foi gravado.');
    expect(consultas.cancelarCriados).toHaveBeenCalledWith(['lanc-unico'], expect.stringContaining('Nada foi gravado'));
    expect(g.documentosDoParcelamento).not.toHaveBeenCalled();
    expect(props.onCriado).not.toHaveBeenCalled();
  });
  it('J5 a NF digitada à mão numa das 4 diverge: a frase e "Usar a nota lida" — troca SÓ com a confirmação (valor e emissão, com a versão)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: IRMAS });
    const { comoGravadores } = gravadoresFalsos();
    const doc: DocumentoDaParcela = { id: 'doc-4', lancamentoId: 'irma-4', versao: 2, especie: 'nf', numero: '937', chave: null, valorCent: 49164, emissao: '2026-10-10' };
    const { gj, editarDocumento } = falsos({ docs: [doc] });
    await abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    await naAbaParcelas();
    expect((await screen.findByTestId('nota-nf-digitada-frase')).textContent)
      .toBe('A 4/4 tem uma NF digitada à mão: R$ 491,64, emissão 10/10/2026 — a nota lida é R$ 1.966,56, emissão 15/09/2026');
    fireEvent.click(screen.getByTestId('nota-usar-nota-lida'));
    const conf = await screen.findByTestId('nota-lida-confirmar');
    expect(editarDocumento).not.toHaveBeenCalled();
    expect(within(conf).getByTestId('nota-lida-texto').textContent).toContain('O que foi digitado fica na Auditoria do documento.');
    fireEvent.click(within(conf).getByTestId('nota-lida-gravar'));
    await waitFor(() => expect(editarDocumento).toHaveBeenCalledWith('cli', 'doc-4', 2, { valor_documento: '1966.56', data_emissao: '2026-09-15' }));
  });
});

/* P95 (DANFE-CHAVE-EM-GRUPOS-01 + DIGITAR A CHAVE) — o mesmo arquivo duas vezes; a chave digitada na linha recusada; a previa pela chave.
   Chaves SINTETICAS (o CNPJ 11.222.333/0004-24 do fixture; o DV recalculado). */
describe('P95 — o mesmo arquivo duas vezes e DIGITAR A CHAVE', () => {
  const comDv = (c43: string) => `${c43}${digitoDaChave(c43)}`;
  const CHAVE = comDv('5026091122233300042455001000000937121753829');
  const AVULSA = comDv('5026091122233300042455890000000937121753829');
  const NFCE = comDv('5026091122233300042465001000000937121753829');
  const pdf = (nome = 'nota-sintetica.pdf') => {
    const f = new File([new TextEncoder().encode('%PDF-1.4 escaneado')], nome, { type: 'application/pdf' });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4 escaneado').buffer });
    return f;
  };
  /* NOTA-NOVA-MODAL-REAL (D3) — a nota só pela chave, que NÃO está no sistema, abre direto o Novo lançamento (`onAbrirLancamento`) */
  const lista = (onAbrirLancamento = vi.fn()) => {
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'faz-1', nome: 'Faz. Sintetica' }]} fornecedores={[FORN]}
      onAbrirLancamento={onAbrirLancamento} onAbrirNota={vi.fn()} lancadas={new Set()} />);
    return onAbrirLancamento;
  };
  const soltar = (f: File) => fireEvent.change(screen.getByTestId('xml-input'), { target: { files: [f] } });
  const digitar = (v: string) => {
    fireEvent.change(screen.getByTestId('xml-digitar-chave'), { target: { value: v } });
    fireEvent.click(screen.getByTestId('xml-usar-chave'));
  };

  it('o mesmo arquivo solto duas vezes: UMA linha e o aviso "<nome> já está na lista."', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_NOTA_SEM_CHAVE });
    lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    soltar(pdf());
    await waitFor(() => expect(screen.getByTestId('xml-aviso').textContent).toBe('nota-sintetica.pdf já está na lista.'));
    expect(screen.getAllByTestId('xml-linha')).toHaveLength(1);
    expect(leitura.lerNota).toHaveBeenCalledTimes(1);
  });
  it('o campo so\' na nota sem chave e no PDF sem texto; DV errado = a frase da chave invalida, nada muda', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_PDF_SEM_TEXTO });
    lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    digitar(`${CHAVE.slice(0, 43)}${(Number(CHAVE[43]) + 1) % 10}`);
    await waitFor(() => expect(screen.getByTestId('xml-recusa').textContent).toBe(FRASE_CHAVE_INVALIDA));
    expect(screen.getByTestId('xml-linha').getAttribute('data-situacao')).toBe('recusada');
    digitar(NFCE);
    await waitFor(() => expect(screen.getByTestId('xml-recusa').textContent).toBe('Cupom (NFC-e) ainda não é lido; preencha à mão.'));
  });
  it('chave valida (colada com espacos): a linha segue lida — o emitente do cadastro pelo CNPJ; emissao e valor "—"; a busca pelo numero e CNPJ; "Abrir" leva DIRETO ao Novo lançamento, valor e data para o operador', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_NOTA_SEM_CHAVE });
    const onAbrirLancamento = lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    digitar(CHAVE.replace(/(\d{4})/g, '$1 '));
    await waitFor(() => expect(screen.getByTestId('xml-linha').getAttribute('data-situacao')).not.toBe('recusada'));
    const celulas = within(screen.getByTestId('xml-linha')).getAllByRole('cell').map((c) => c.textContent);
    /* a chave nao traz a IE do destinatario: a fazenda nao vem (o operador escolhe na previa) */
    expect(celulas.slice(0, 6)).toEqual(['000.000.937', '—', 'Agro Sintetica', '11.222.333/0004-24', '—', '—']);
    expect(consultas.notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ parcelas: [], numero: '000.000.937', chave: CHAVE, emitenteDocumento: '11222333000424' }));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    const [doXml] = onAbrirLancamento.mock.calls[0];
    expect([doXml.proposta.favorecidoId, doXml.arquivo.type]).toEqual(['f1', 'application/pdf']);
    /* a chave não traz valor nem emissão: o modal nasce com 0,00 e a competência vazia, para o operador preencher */
    const pre = prefillDaNota(doXml);
    expect([pre.valor, pre.data_competencia, pre.descricao]).toEqual([0, '', '']);
  });
  it('nota avulsa (serie 890): o CNPJ da chave e\' do fisco — nao acha o fornecedor por ele', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_NOTA_SEM_CHAVE });
    const onAbrirLancamento = lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    digitar(AVULSA);
    await waitFor(() => expect(screen.getByTestId('xml-linha').getAttribute('data-situacao')).not.toBe('recusada'));
    expect(consultas.notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ emitenteDocumento: '' }));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    expect(onAbrirLancamento.mock.calls[0][0].proposta.favorecidoId).toBeNull();
  });

});

/* P162 — "Ver o que a nota muda" oferecia DUPLICAR: a nota sem duplicata achada pelo nº com o MESMO valor, pago 10 dias depois da emissão,
   dava "0 de 1 · 1 só na nota · 1 só no sistema" e "criar a que falta"; a fazenda (de lançamento novo) travava; o subcentro sugerido (o último
   do fornecedor) ia por cima do lançamento. Valores SINTÉTICOS. */
describe('P162 — a nota de uma parcela já lançada não duplica', () => {
  it('"1 de 1", sem "Falta: fazenda", nada criado; o pedido não leva o subcentro sugerido (coluna desmarcada)', async () => {
    const nota = montarNota({ fornecedores: [FORN], semDuplicata: true, fazendasDaLeitura: [] });
    const notaCent = nota.lido.ok ? nota.lido.nota.totais.notaCent : 0;
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [jaLancado(1, '2031-08-10', 'realizado', { id: 'unico', valorCent: notaCent, parcelas: [],
      por: ['numero'], financiamentoId: null, fornecedorId: 'f1', fornecedorPor: 'cnpj', numeroDocumento: '937', descricao: 'Combustivel sintetico' })] });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(nota, { g: comoGravadores, fornecedores: [FORN] });
    await naAbaParcelas();
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).not.toContain('só na nota');
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).not.toContain('só no sistema');
    expect(screen.queryByTestId('nota-falta')).toBeNull();
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled(), { timeout: 3000 });
    const { pedido } = pedidoGravado();
    expect([pedido.map((x) => x.id), pedido.some((x) => 'plano_conta_id' in x)]).toEqual([['unico'], false]);
    expect(g.gravar).not.toHaveBeenCalled();
    expect(consultas.registrarNaOperacao).toHaveBeenCalledWith('op-1', [], expect.any(Array));
  });
});

/* P128b — o "Desfazer" do aviso: a MESMA operação inteira pela `fn_nota_completar_desfazer`; a recusa do banco ("mexido depois") vem pronta */
describe('P128b — o Desfazer do aviso', () => {
  const desfazerDoAviso = () => {
    const c = vi.mocked(toast.success).mock.calls.find((x) => typeof x[1] === 'object' && x[1] !== null && 'action' in x[1]);
    const acao = c?.[1]?.action;
    if (!acao || typeof acao !== 'object' || !('onClick' in acao)) throw new Error('sem Desfazer');
    return acao;
  };
  it('desfaz a operação gravada; ao voltar, a lista relê', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, fornecedores: [FORN] });
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalledTimes(1));
    const acao = desfazerDoAviso();
    expect(acao.label).toBe('Desfazer');
    Reflect.apply(acao.onClick, undefined, []);   // o clique no botão do aviso (o evento não importa)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Desfeito: tudo voltou como estava.'));
    expect(consultas.desfazerCompletar).toHaveBeenCalledWith('op-1');
    expect(props.onCriado).toHaveBeenCalledTimes(2);
  });
  it('a recusa do banco (mexido depois) vai como a frase pronta; nada relê', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    consultas.desfazerCompletar.mockResolvedValueOnce('«Insumos Sinteticos 2/4» foi mexido depois (descrição): desfaça à mão.');
    const { comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, fornecedores: [FORN] });
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalledTimes(1));
    Reflect.apply(desfazerDoAviso().onClick, undefined, []);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('«Insumos Sinteticos 2/4» foi mexido depois (descrição): desfaça à mão.'));
    expect(props.onCriado).toHaveBeenCalledTimes(1);
  });
});

/* P146 (Gabriel 27/10/2026) — a busca que FALHA não vira "nada achado": a prévia diz "Não consegui verificar…", trava o Criar (e o "No Novo
   lançamento") até "Tentar de novo" responder. O caso: Neosolar NF 65.089, 27/10 11:01 (10 parcelas criadas por cima de 6 já lançados). */
describe('P146 — consulta que falha trava o Criar', () => {
  /* Ajuste 11 (Gabriel 29/10 14:12) — NADA PISCA: enquanto a busca "nota já lançada" roda, o esqueleto da tela NOVA (abas desabilitadas, "procurando
     no sistema…", o botão travado), NENHUM quadro da tela antiga; achou = a tela da nota já lançada, direto; não achou = a nota nova, e o Criar libera */
  const QUADROS_DA_TELA_ANTIGA = ['nota-bloco-parcelas', 'nota-bloco-lancamento', 'nota-bloco-itens', 'nota-ja-lancada', 'nota-caminhos'];
  it('achou: a tela da nota já lançada entra DIRETO (a antiga nunca é desenhada no caminho)', async () => {
    let responder: (v: Consulta<LancamentoJaLancado[]>) => void = () => undefined;
    consultas.notaJaLancada.mockImplementation(() => new Promise((ok) => { responder = ok; }));
    abrirSemEsperar(montarNota({ fornecedores: [FORN] }), { g: gravadoresFalsos().comoGravadores });
    await screen.findByTestId('nota-procurando');
    const vistos = new Set<string>();
    const olhar = new MutationObserver(() => { for (const t of QUADROS_DA_TELA_ANTIGA) if (document.querySelector(`[data-testid="${t}"]`) && t !== 'nota-ja-lancada') vistos.add(t); });
    olhar.observe(document.body, { childList: true, subtree: true });
    await act(async () => { responder({ ok: true, valor: QUATRO }); });
    await screen.findByTestId('nota-aba-hoje');
    olhar.disconnect();
    expect([...vistos]).toEqual([]);
  });
  it('a conferência do CNPJ falhou ao cadastrar: nada é criado e a frase diz por quê', async () => {
    consultas.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: false, motivo: 'tempo esgotado' });
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });   /* o bloco Fornecedor da nota já lançada */
    const props = await abrir(montarNota());
    await waitFor(() => expect(screen.getByTestId('nota-cadastrar-fornecedor')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-cadastrar-fornecedor'));
    await waitFor(() => expect(screen.getByTestId('nota-erro').textContent)
      .toContain('Não consegui conferir o CNPJ no cadastro (tempo esgotado). Nada foi gravado — tente de novo.'));
    expect(props.onCriarFornecedor).not.toHaveBeenCalled();
  });
});

/* P163-2 (NOTA-ABAS-PREVIA-01, mock aprovado 28/10 11:51) — a nota JÁ LANÇADA em ABAS: 1 Nota e fornecedor · 2 Parcelas × sistema (N) · 3 Como vai
   ficar · 4 Itens da nota. O bloco "Lançamento" vira o "Para todas" da aba 3; os 3 cartões de caminho saíram ("atualizar" é a caixinha da aba 3,
   "criar novo (duplica)" mora no ⋯). A aba Itens está SEMPRE: sem itens legíveis, a frase e "Anexar o XML desta nota". */
/* o jsdom não tem `Blob.arrayBuffer` (o mesmo do documentoLeNota.test): lido pelo FileReader */
if (!('arrayBuffer' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { value(this: Blob) {
    return new Promise<ArrayBuffer>((ok, erro) => { const r = new FileReader(); r.onload = () => (r.result instanceof ArrayBuffer ? ok(r.result) : erro(new Error('não leu'))); r.onerror = () => erro(r.error); r.readAsArrayBuffer(this); });
  } });
}
describe('P163-2 — a nota já lançada em abas', () => {
  const abaJa = (nome: RegExp) => fireEvent.click(within(screen.getByTestId('nota-abas-ja')).getByText(nome));
  it('abre em "Parcelas × sistema"; "Nota e fornecedor" sem o bloco Lançamento; a aba vista ganha ✓; a aba 3 tem o "Para todas" e a prévia embutida', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    expect(within(screen.getByTestId('nota-abas-ja')).getByText(/Parcelas × sistema/).textContent).toContain('Parcelas × sistema');
    expect(within(screen.getByTestId('nota-abas-ja')).getByText(/No sistema hoje/).textContent).toContain('No sistema hoje (4)');
    expect(screen.queryByTestId('nota-caminhos')).toBeNull();
    /* mock da nota já lançada (29/10): Nota e Fornecedor FIXOS em cima, em toda aba; o Resultado fixo acima do rodapé */
    expect([!!screen.queryByTestId('nota-bloco-nota'), !!screen.queryByTestId('nota-bloco-fornecedor'), !!screen.queryByTestId('nota-resultado')]).toEqual([true, true, true]);
    abaJa(/Itens/);
    expect([!!screen.queryByTestId('nota-bloco-nota'), !!screen.queryByTestId('nota-ja-lancada'), !!screen.queryByTestId('nota-bloco-lancamento')]).toEqual([true, false, false]);
    expect(within(screen.getByTestId('nota-abas-ja')).getByText(/Parcelas × sistema/).textContent).toContain('✓');
    abaJa(/Lançamento/);
    expect(screen.getByTestId('nota-nada-a-criar').textContent).toContain('todas as parcelas da nota já estão no sistema');
    abaJa(/Parcelas × sistema/);
    fireEvent.click(screen.getByTestId('nota-completar-revisar'));
    const ficar = await screen.findByTestId('nota-aba-ficar');
    expect(within(ficar).getByTestId('previa-completar')).toBeTruthy();
    /* P163 v4 — o "Para todas" é a 1ª linha da grade; sem parcela que falte, o bloco Lançamento não aparece */
    expect(within(ficar).getByTestId('previa-para-todas').textContent).toContain('Aplicar a todas ↓');
    expect(screen.queryByTestId('nota-bloco-lancamento')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'O que a nota muda em cada parcela' })).toBeNull();
  });
  it('"atualizar as não pagas" é a caixinha da aba 3: marcada, a programada leva valor e vencimento da nota no pedido', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO.map((x, i) => (i === 3 ? { ...x, valorCent: 48000 } : x)) });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    fireEvent.click(screen.getByTestId('nota-completar-revisar'));
    const caixa = within(await screen.findByTestId('nota-atualizar-nao-pagas')).getByRole('checkbox');
    fireEvent.click(caixa);
    await waitFor(() => expect(consultas.completarComANota.mock.calls.some((c) => c[1].some((x) => 'data_vencimento' in x))).toBe(true));
  });
  it('a aba Itens SEMPRE: sem itens legíveis, a frase e "Anexar o XML desta nota" — o XML da MESMA nota traz os itens (guardados pela chave)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    const { comoGravadores } = gravadoresFalsos();
    const nota = montarNota({ fornecedores: [FORN], semItens: true });
    /* ajuste 12 — os itens fiscais vêm do XML anexado (a versão final); do PDF escaneado, nada */
    const lidosDoXml = itensDoXml(new TextEncoder().encode(XML_ITENS_SINTETICO).buffer);
    itensTela.responder = ({ arquivo }) => ({ nota: arquivo?.name === 'nota.xml' && lidosDoXml ? { lidos: lidosDoXml, cabecalho: { chave: nota.lido.nota.chave, origem: 'xml',
      numero: '937', serie: '10', emissao: '2026-09-15', natureza: 'VENDA', regime: '3', emitenteDocumento: CNPJ, emitenteNome: 'EMITENTE SINTETICO' } } : null, carregando: false });
    const props = await abrir(nota, { g: comoGravadores });
    await naAbaParcelas();
    abaJa(/Itens \(/);
    expect(screen.getByTestId('nota-sem-itens').textContent).toBe('A nota não trouxe itens legíveis.');
    expect(screen.queryByTestId('nota-bloco-itens')).toBeNull();   // a versão SIMPLES nunca, no caminho da já lançada
    /* outra nota: a frase, nada guardado */
    leitura.lerNota.mockResolvedValueOnce({ ok: true, origem: 'xml', nota: { ...nota.lido.nota, chave: '9'.repeat(44), itens: [{ descricao: 'X', quantidade: '1', unidade: 'UN', valorCent: 1 }] } });
    fireEvent.change(screen.getByTestId('nota-anexar-xml-arquivo'), { target: { files: [new File(['<x/>'], 'outra.xml', { type: 'application/xml' })] } });
    expect((await screen.findByText('Este XML é de outra nota (a chave não confere). Nada foi guardado.'))).toBeTruthy();
    expect(props.gravarItens).not.toHaveBeenCalled();
    /* a mesma nota: os itens aparecem e se guardam */
    leitura.lerNota.mockResolvedValueOnce({ ok: true, origem: 'xml', nota: { ...nota.lido.nota, itens: [{ descricao: 'TINTA SINTETICA 18L', quantidade: '4', unidade: 'GL', valorCent: 196656 }] } });
    fireEvent.change(screen.getByTestId('nota-anexar-xml-arquivo'), { target: { files: [new File(['<x/>'], 'nota.xml', { type: 'application/xml' })] } });
    /* a versão FINAL (Valores · Fiscal · Contas, a soma dos itens × a nota), nunca a tabela simples */
    await waitFor(() => expect(screen.getAllByTestId('itens-linha').length).toBeGreaterThan(0));
    expect([!!screen.queryByTestId('itens-prova'), !!screen.queryByTestId('nota-bloco-itens'), !!screen.queryByTestId('nota-item')]).toEqual([true, false, false]);
    expect(props.gravarItens).toHaveBeenCalledTimes(1);
    itensTela.responder = () => ({ nota: null, carregando: false });
  });
  it('ajuste 12: enquanto os itens carregam, a aba Itens é o esqueleto da versão final (nunca a simples)', async () => {
    itensTela.responder = () => ({ nota: null, carregando: true });
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO });
    await abrir(montarNota({ fornecedores: [FORN] }), { g: gravadoresFalsos().comoGravadores });
    abaJa(/Itens \(/);
    expect([!!screen.queryByTestId('nota-itens-carregando'), !!screen.queryByTestId('nota-bloco-itens'), !!screen.queryByTestId('nota-item')]).toEqual([true, false, false]);
    itensTela.responder = () => ({ nota: null, carregando: false });
  });
  it('a aba 2 diz o que DIFERE entre as achadas (descrição, competência, conta)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: QUATRO.map((x, i) => ({ ...x, competencia: i === 0 ? '2026-09-16' : '2026-09-15', contaBancariaId: i === 3 ? 'outra' : 'sic' })) });
    const { comoGravadores } = gravadoresFalsos();
    /* Caso 3 — a safra de cada uma vem da leitura de "No sistema hoje": a diferença é dita pelo NOME e por quantas */
    consultas.comoEstaoHoje.mockResolvedValueOnce({ ok: true, valor: QUATRO.map((x, i) => ({ id: x.id, fazendaId: 'faz-1', subcentro: null, favorecidoId: null, planoContaId: null,
      safraId: i === 3 ? 's-soja' : 's-pec' })) });
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    await waitFor(() => expect(screen.getByTestId('nota-ja-lancada-diferencas').textContent)
      .toBe('⚠ Diferente entre elas: descrição (4 jeitos), competência (15/09/2026, 16/09/2026), conta (3 em Sicredi Lavoura, 1 em outra conta), '
        + 'safra (3 em 26/27-Pec, 1 em 26/27-SOJ). Acerte marcando a coluna em "Como vai ficar".'));
  });
});

/* NOTA-PAGA-A-VISTA-01 (Gabriel 31/10 05:30; aqui SINTÉTICO) — a nota de 4 duplicatas (4 × 491,64 = 1.966,56) paga À VISTA num lançamento só
   do fornecedor, com o valor da nota inteira: antes, ele virava a 1/4 e as outras 3 "nasciam" (a soma passava da nota e nada se gravava) */
describe('NOTA-PAGA-A-VISTA-01 — a nota inteira paga à vista num lançamento', () => {
  const AVISTA = jaLancado(1, '2026-10-10', 'realizado', { id: 'avista', valorCent: 196656, financiamentoId: null, descricao: 'Insumos Sinteticos',
    parcelas: [], por: ['numero'] });
  it('V1 a linha do lançamento "Pago à vista", as 4 duplicatas "Já paga no lançamento acima"; sem a recusa da soma; grava só ligando (nada criado, sem "k/N")', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [AVISTA] });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    const linhas = within(screen.getByTestId('nota-ja-lancada')).getAllByTestId('nota-ja-lancada-linha');
    expect(linhas.map((x) => [within(x).getByTestId('nota-ja-lancada-parc').textContent, x.getAttribute('data-situacao'), within(x).getByTestId('nota-acao').textContent,
      within(x).getByTestId('nota-ja-lancada-efeito').textContent])).toEqual([
      ['à vista', 'conciliada', 'Pago à vista▾', 'recebe a nota'],
      ...[1, 2, 3, 4].map((k) => [`${k}/4`, 'so_na_nota', 'Já paga▾', 'não cria nada'])]);
    expect(screen.getByTestId('nota-ja-lancada-resumo').textContent).toContain('A nota inteira já está paga à vista num lançamento (R$ 1.966,56 ✓)');
    expect(screen.queryByTestId('nota-recusa-compra')).toBeNull();
    /* a barra Resultado em cinza "não junta (1 parcela)", nunca o âmbar "faltam ou sobram" (Gabriel 31/10 09:00) */
    expect(screen.queryByTestId('nota-juntar-frase')).toBeNull();
    expect(screen.getByTestId('nota-nao-junta').textContent).toBe('não junta (1 parcela)');
    /* o "Pago à vista" inteiro: a coluna Ação mais larga só quando há a linha à vista (as outras notas seguem com 74) */
    expect(screen.getByTestId('nota-ja-lancada-col-acao').style.width).toBe('92px');
    expect(linhas[0].querySelector('[data-testid="nota-ja-lancada-efeito"]')?.getAttribute('title')).toContain('recebe a nota e o PDF · valor, vencimento e pagamento não mudam');
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().pedido.map((x) => x.id)).toEqual(['avista']);
    expect(pedidoGravado().pedido[0]).not.toHaveProperty('descricao');
    expect(pedidoGravado().opcoes.juntar).toBe(false);
    expect(g.lancamento).not.toHaveBeenCalled();
  });
  it('V3 pelo "+ Adicionar documento" do lançamento já pago (a porta 2): o aberto é o à vista — anexa e vincula, sem forçar as parcelas', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [{ ...AVISTA, por: ['lancamento'] }] });
    const { g, comoGravadores } = gravadoresFalsos();
    const props = await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, partindoDe: 'avista' });
    await naAbaParcelas();
    const linhas = within(screen.getByTestId('nota-ja-lancada')).getAllByTestId('nota-ja-lancada-linha');
    expect(within(linhas[0]).getByTestId('nota-ja-lancada-efeito').textContent).toBe('este lançamento · recebe a nota');
    expect(linhas.slice(1).map((x) => within(x).getByTestId('nota-acao').textContent)).toEqual(['Já paga▾', 'Já paga▾', 'Já paga▾', 'Já paga▾']);
    expect(screen.queryByTestId('nota-recusa-compra')).toBeNull();
    await completarPelaPrevia();
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(pedidoGravado().pedido.map((x) => x.id)).toEqual(['avista']);
    expect(g.lancamento).not.toHaveBeenCalled();
  });
  it('V2 escolher "Criar" numa duplicata volta ao caso de antes: a soma passa da nota e a recusa aparece (o aviso continua valendo)', async () => {
    consultas.notaJaLancada.mockResolvedValue({ ok: true, valor: [AVISTA] });
    const { comoGravadores } = gravadoresFalsos();
    await abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await naAbaParcelas();
    const linhas = within(screen.getByTestId('nota-ja-lancada')).getAllByTestId('nota-ja-lancada-linha');
    fireEvent.keyDown(within(linhas[2]).getByTestId('nota-acao'), { key: 'Enter' });
    fireEvent.click(await screen.findByTestId('nota-acao-criar'));
    expect((await screen.findByTestId('nota-recusa-compra')).textContent).toContain('somam R$ 2.458,20, mais que a nota (R$ 1.966,56)');
    expect(screen.queryByTestId('nota-nao-junta')).toBeNull();   // a barra volta ao âmbar: o cinza "1 parcela" é só do caso à vista
    expect(screen.getByTestId('nota-juntar-frase').textContent).toContain('⚠ não junta');
  });
});
