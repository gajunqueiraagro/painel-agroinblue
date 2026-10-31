/**
 * FIN-NFE-XML-01d — "Novo a partir de XML": a lista de notas (tela A) e o Novo lançamento preenchido (tela B).
 *
 * ⚠ FIXTURES SINTETICAS do 01a (`src/lib/financeiro/nfe/__fixtures__/notas.ts`): nenhum dado real.
 * ⚠ O `LancamentoV2Dialog` E' MONTADO DE VERDADE; so' as bordas sao falsas (banco, cliente, modais filhos). O que se prova e'
 *   o que a tela MOSTRA e o que ela manda GRAVAR.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

const banco = vi.hoisted(() => ({
  rpc: vi.fn(async (..._a: unknown[]) => ({ data: null as unknown, error: null as unknown })),
  upload: vi.fn(async (..._a: unknown[]) => ({ data: {}, error: null })),
}));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains', 'update']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(),
      rpc: (...a: unknown[]) => banco.rpc(...a),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: (...a: unknown[]) => banco.upload(...a), remove: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
const consultas = vi.hoisted(() => ({
  iePorFazenda: vi.fn(async () => ({ 'f-pur': '28.987.654-3' } as Record<string, string>)),
  /* NOTA-FAZENDA-PELA-IE-01 — os apelidos das fazendas (nenhum, por padrao) */
  aliasesDasFazendas: vi.fn(async (): Promise<Record<string, string[]>> => ({})),
  /* P146 — as consultas que decidem devolvem `Consulta` ({ ok, valor } | { ok: false, motivo }) */
  fornecedorPeloNome: vi.fn(async (): Promise<Consulta<string | null>> => ({ ok: true, valor: null })),
  notaJaRegistrada: vi.fn(async (_c: string, _k: string): Promise<Consulta<unknown[]>> => ({ ok: true, valor: [] })),
  ultimaClassificacaoDoFornecedor: vi.fn(async () => null as unknown),
  gravarDocumentoNoCadastro: vi.fn(async () => null as string | null),
  /* NOTA-FORNECEDOR-COMPARAR-01 — o cadastro so' muda pela comparacao (o mesmo modal da previa) */
  completarCadastroPeloXml: vi.fn(async () => null as string | null),
  camposQueOEmitenteCompleta: vi.fn(async (): Promise<string[]> => []),
  cadastroParaComparar: vi.fn(async (): Promise<Record<string, string | null> | null> => ({ nome: 'Agropecuaria Exemplo', cpf_cnpj: null })),
  atualizarCamposDoCadastro: vi.fn(async (..._a: unknown[]): Promise<{ ok: true; alteracaoId: string | null } | { ok: false; frase: string }> => ({ ok: true, alteracaoId: 'alt1' })),
  desfazerCamposDoCadastro: vi.fn(async () => null as string | null),
  /* NOTA-FORNECEDOR-DUPLICA-01 — o CNPJ conferido no banco antes de criar (nenhum cadastro com ele, por padrao) */
  fornecedorPeloDocumento: vi.fn(async (): Promise<Consulta<{ id: string; nome: string; ativo: boolean } | null>> => ({ ok: true, valor: null })),
  /* NOTA-JA-LANCADA-01 — nada ja' lancado, por padrao */
  notaJaLancada: vi.fn(async (_c: string, _e: unknown): Promise<Consulta<{ id: string }[]>> => ({ ok: true, valor: [] })),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => consultas);
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
/* NOTA-NOVA-MODAL-REAL D2 — os dias de vencimento do cartão SINTÉTICO (o mais frequente: 10) */
const cartaoNoBanco = vi.hoisted(() => ({ diasDoCartao: vi.fn(async () => [{ dia: 10, lancamentos: 6, ultimo: '2026-09-10' }, { dia: 15, lancamentos: 1, ultimo: '2026-08-15' }]) }));
vi.mock('@/lib/financeiro/diasDoCartao', () => cartaoNoBanco);

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { NovoDeXmlDialog, comFornecedoresDeAgora, resumoDasDuplicatas } from './NovoDeXmlDialog';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { proporLancamento, FRASE_SEM_DUPLICATAS, type UltimaClassificacao } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente, type ResolucaoEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { arquivoXmlDaNota, pendenteDaNota, prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { documentoFormatado } from '@/lib/financeiro/nfe/formatos';
import { CTE, EMITENTE_CNPJ, chaveDe, montarNFe, utf8, type OpcoesNota } from '@/lib/financeiro/nfe/__fixtures__/notas';
import type { Consulta, OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';
import { TIPOS_ACEITOS } from '@/hooks/useLancamentoDocumentos';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'Banco do Brasil', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco do Brasil', agencia: null, numero_conta: null, conta_digito: null }];
const forn = (id: string, nome: string, cpf_cnpj: string | null, ativo = true) => ({ id, nome, cpf_cnpj, fazenda_id: null, ativo, tipo_recebimento: null }) as FornecedorV2;
const AGRO = forn('agro', 'Agropecuaria Exemplo', '11.222.333/0001-81');
const AGRO_SEM_DOC = forn('agro', 'Agropecuaria Exemplo', null);
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-nut', subcentro: 'Nutrição Engorda', centro_custo: 'Suplementação', grupo_custo: 'Nutrição', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
const ULTIMA: UltimaClassificacao = { plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda', macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação', escopo_negocio: 'pecuaria', data: '2026-08-14' };
const FAZ_IE = [{ id: 'f-pur', nome: 'Faz. Pureza', ie: '28.987.654-3' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito', ie: null }];

/** O pacote que a tela A entrega ao modal, montado pelos MESMOS donos. */
function doXmlDe(o: OpcoesNota, fornecedores: FornecedorV2[], extra: { idPeloNome?: string | null; ocorrencias?: OcorrenciaDaNota[]; ultima?: UltimaClassificacao | null } = {}): DoXml {
  const bytes = utf8(montarNFe(o));
  const lido = lerNFe(bytes);
  if (lido.ok === false) throw new Error(lido.motivo);
  const resolucao: ResolucaoEmitente = resolverEmitente(lido.nota.emitente, fornecedores, extra.idPeloNome ?? null);
  const p = proporLancamento({ nota: lido.nota, avisosDoLeitor: lido.avisos, fazendas: FAZ_IE, emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: extra.ultima === undefined ? ULTIMA : extra.ultima });
  if (p.ok === false) throw new Error(p.frase);
  return { proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, emitente: lido.nota.emitente, resolucao, ocorrencias: extra.ocorrencias ?? [], arquivo: arquivoXmlDaNota(bytes, 'NFe-12345.XML') };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.rpc.mockReset(); banco.rpc.mockImplementation(async () => ({ data: null, error: null }));
  banco.upload.mockClear();
  for (const f of Object.values(consultas)) f.mockClear();
  consultas.notaJaRegistrada.mockImplementation(async () => ({ ok: true, valor: [] }));
  consultas.fornecedorPeloNome.mockImplementation(async () => ({ ok: true, valor: null }));
  consultas.ultimaClassificacaoDoFornecedor.mockImplementation(async () => null);
  consultas.notaJaLancada.mockImplementation(async () => ({ ok: true, valor: [] }));
});

function montarModal(props: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>, fornecedores: FornecedorV2[] = [AGRO]) {
  definirFornecedoresDoLeitor(fornecedores);   /* FORN-SELETOR-PADRAO-01: o seletor lê do leitor único */
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string): Promise<boolean | string> => 'lanc-novo');
  const onClose = vi.fn();
  const onLancamentoCriado = vi.fn();
  const onCriarFornecedor = vi.fn(async (nome: string, _f: string, doc?: string) => forn('novo', nome, doc ?? null));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open onClose={onClose} onSave={onSave} lancamento={null} documentosAntesDeSalvar onLancamentoCriado={onLancamentoCriado}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={fornecedores} safras={[]}
        onCriarFornecedor={onCriarFornecedor} {...props} />
    </MemoryRouter></QueryClientProvider>,
  );
  return { ...r, onSave, onClose, onLancamentoCriado, onCriarFornecedor };
}
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
/** A nota NAO traz a conta de pagamento nem a descrição (NOTA-NOVA-MODAL-REAL: a descrição nasce vazia): o operador escolhe a conta e
 *  ESCREVE a descrição. Nos casos de Salvar, as duas entram como ele as faria. */
const DESCRICAO_DO_OPERADOR = 'Sal e ração da engorda';
const comConta = (d: DoXml) => ({ ...prefillDaNota(d), conta_bancaria_id: 'bb', descricao: DESCRICAO_DO_OPERADOR });
/* PASSO 8 do FIN-FINANC-28: conta e fazenda sao o seletor da casa COM BUSCA (gatilho = botao); os outros seguem combobox. */
const gatilhoDeBusca = () => Array.from(document.querySelectorAll('button')).filter((b) => Array.from(b.children).some((c) => c.tagName === 'SPAN' && c.classList.contains('truncate') && c.classList.contains('text-left')));
const combo = (texto: string) => [...screen.getAllByRole('combobox'), ...gatilhoDeBusca()].some((c) => (c.textContent ?? '').includes(texto));

/* ═══ TELA A ═══════════════════════════════════════════════════════════════════════ */
function arquivo(nome: string, conteudo: string): File {
  const bytes = utf8(conteudo);
  const f = new File([bytes], nome, { type: '' });
  Object.defineProperty(f, 'arrayBuffer', { value: async () => bytes });
  return f;
}
function montarLista(fornecedores: FornecedorV2[] = [AGRO], lancadas: ReadonlySet<string> = new Set()) {
  const onAbrir = vi.fn();
  const r = render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={FAZENDAS} fornecedores={fornecedores} onAbrirLancamento={onAbrir} lancadas={lancadas} />);
  return { ...r, onAbrir };
}
const soltar = (arquivos: File[]) => fireEvent.change(screen.getByTestId('xml-input'), { target: { files: arquivos } });

describe('tela A — a lista de notas', () => {
  it('2 validas + 1 recusada: 3 linhas, rodape certo, e o botao da recusada apagado com o motivo', async () => {
    montarLista();
    soltar([
      arquivo('a.xml', montarNFe()),
      arquivo('b.xml', montarNFe({ numero: '777', vNF: '1345.50', duplicatas: [['001', '2026-11-05', '672.75'], ['002', '2026-12-05', '672.75']] })),
      arquivo('cte.xml', CTE),
    ]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(3));
    const linhas = screen.getAllByTestId('xml-linha');
    expect(linhas.map((l) => l.getAttribute('data-situacao'))).toEqual(['nova', 'nova', 'recusada']);
    expect(linhas[0].textContent).toContain('000.012.345');
    /* P95 — a emissao na lista em dd/mm/aaaa (a regra da casa; o gate de tela da lista entrou com o P95) */
    expect(linhas[0].textContent).toContain('30/09/2026');
    expect(linhas[0].textContent).toContain('AGROPECUARIA EXEMPLO LTDA');
    expect(linhas[0].textContent).toContain('11.222.333/0001-81');
    expect(linhas[0].textContent).toContain('Faz. Pureza');
    expect(linhas[0].textContent).toContain('16.238,00');
    expect(linhas[0].textContent).toContain('2 × 8.119,00 · 05/11 e 05/12');
    expect(linhas[0].textContent).toContain('autorizada · nova');
    expect(linhas[1].textContent).toContain('2 × 672,75 · 05/11 e 05/12');
    expect(within(linhas[2]).getByTestId('xml-recusa').textContent).toBe('É um conhecimento de transporte (CT-e), não uma nota.');
    const apagado = within(linhas[2]).getByRole('button', { name: 'Abrir lançamento' });
    expect(apagado.hasAttribute('disabled')).toBe(true);
    expect(apagado.getAttribute('title')).toBe('É um conhecimento de transporte (CT-e), não uma nota.');
    expect(screen.getByTestId('xml-rodape').textContent).toBe('2 notas lidas · 1 recusada17.583,50');
    expect(screen.getByText('Dados lidos do arquivo; a autenticidade da assinatura não é verificada.')).toBeTruthy();
  });

  it('pergunta ao banco se a nota ja esta registrada, pela CHAVE — a registrada numa OC: a linha diz "já registrada" sem bloquear', async () => {
    consultas.notaJaRegistrada.mockImplementation(async () => ({ ok: true, valor: [{ origem: 'oc', documentoId: 'd1', lancamentoId: null, operacaoId: 'op1', operacaoTipo: 'compra', numero: '12345', descricao: 'Sal mineral', data: '2026-09-30', valor: 16238 }] }));
    const { onAbrir } = montarLista();
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(consultas.notaJaRegistrada).toHaveBeenCalledWith('cli', chaveDe(EMITENTE_CNPJ, '55', '12345'));
    expect(screen.getByTestId('xml-situacao').textContent).toBe('já registrada');
    const abrir = screen.getByTestId('xml-abrir-lancamento');
    expect(abrir.hasAttribute('disabled')).toBe(false);
    fireEvent.click(abrir);
    expect(onAbrir).toHaveBeenCalledTimes(1);
    const d: DoXml = onAbrir.mock.calls[0][0];
    expect(d.ocorrencias).toHaveLength(1);
    /* o arquivo que sobe: .xml e application/xml EXPLICITOS, qualquer que seja o tipo que o navegador deu (aqui, vazio) */
    expect([d.arquivo.name, d.arquivo.type]).toEqual(['a.xml', 'application/xml']);
  });

  /* P146 — a consulta que FALHA nao vira "nada achado": a linha fica "não verificada", nao abre (nem previa, nem Novo lancamento) e
     "Tentar de novo" refaz as consultas com o mesmo lido */
  it('P146 — "já registrada" falhou: a linha "não verificada" (o motivo no title), sem "Abrir lançamento"; "Tentar de novo" respondendo vira nova', async () => {
    consultas.notaJaRegistrada.mockImplementation(async () => ({ ok: false, motivo: 'tempo esgotado' }));
    const { onAbrir } = montarLista();
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    const sit = screen.getByTestId('xml-situacao');
    expect(sit.textContent).toBe('não verificada');
    expect(sit.getAttribute('title')).toBe('Não consegui verificar se a nota já está registrada (tempo esgotado). Nada será lançado até verificar.');
    expect(screen.queryByTestId('xml-abrir-lancamento')).toBeNull();
    expect(consultas.notaJaLancada).not.toHaveBeenCalled();
    consultas.notaJaRegistrada.mockImplementation(async () => ({ ok: true, valor: [] }));
    fireEvent.click(screen.getByTestId('xml-tentar-de-novo'));
    await waitFor(() => expect(screen.getByTestId('xml-situacao').textContent).toBe('autorizada · nova'));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('P146 — "nota já lançada" e "fornecedor pelo nome" falharam: os dois motivos na mesma frase, e a linha não abre', async () => {
    consultas.fornecedorPeloNome.mockImplementation(async () => ({ ok: false, motivo: 'sem rede' }));
    consultas.notaJaLancada.mockImplementation(async () => ({ ok: false, motivo: 'tempo esgotado' }));
    montarLista([AGRO_SEM_DOC]);   // o cadastro sem documento: a nota pergunta pelo NOME
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(screen.getByTestId('xml-situacao').getAttribute('title'))
      .toBe('Não consegui verificar o fornecedor pelo nome (sem rede); se a nota já foi lançada (tempo esgotado). Nada será lançado até verificar.');
    expect(screen.queryByTestId('xml-abrir-lancamento')).toBeNull();
  });

  it('fornecedor: pelo documento nao vai ao banco; sem documento no cadastro, pergunta pelo NOME ao resolvedor', async () => {
    montarLista([AGRO]);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(consultas.fornecedorPeloNome).not.toHaveBeenCalled();
    expect(consultas.ultimaClassificacaoDoFornecedor).toHaveBeenCalledWith('cli', 'agro');
  });
  it('fornecedor achado pelo nome: o pacote leva "pelo nome" e o cadastro sem documento', async () => {
    consultas.fornecedorPeloNome.mockImplementation(async () => ({ ok: true, valor: 'agro' }));
    const { onAbrir } = montarLista([AGRO_SEM_DOC]);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(consultas.fornecedorPeloNome).toHaveBeenCalledWith('cli', 'AGROPECUARIA EXEMPLO LTDA');
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    const d: DoXml = onAbrir.mock.calls[0][0];
    expect([d.resolucao.achadoPor, d.resolucao.cadastroSemDocumento, d.proposta.favorecidoId]).toEqual(['nome', true, 'agro']);
  });

  it('nota em que o cliente e o EMITENTE (IE do emitente = IE de uma fazenda): recusada com a frase', async () => {
    consultas.iePorFazenda.mockImplementationOnce(async () => ({ 'f-pur': '283456789' }));
    montarLista();
    soltar([arquivo('venda.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(screen.getByTestId('xml-recusa').textContent).toBe('Nota de venda entra pela Operação Comercial.');
    expect(screen.getByTestId('xml-rodape').textContent).toBe('0 notas lidas · 1 recusada0,00');
  });

  it('a mesma nota solta duas vezes entra uma so; linha lancada nesta sessao fica "lançada" e o botao vira "abrir de novo"', async () => {
    const { rerender, onAbrir } = montarLista();
    soltar([arquivo('a.xml', montarNFe()), arquivo('a-copia.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    const linhaId: string = onAbrir.mock.calls[0][1];
    rerender(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={FAZENDAS} fornecedores={[AGRO]} onAbrirLancamento={onAbrir} lancadas={new Set([linhaId])} />);
    expect(screen.getByTestId('xml-situacao').textContent).toBe('lançada');
    expect(screen.getByTestId('xml-abrir-lancamento').textContent).toBe('abrir de novo');
  });

  it('o resumo das duplicatas, nos quatro casos', () => {
    const r = (o: OpcoesNota) => resumoDasDuplicatas(doXmlDe(o, [AGRO]).proposta);
    expect(r({})).toBe('2 × 8.119,00 · 05/11 e 05/12');
    expect(r({ duplicatas: null })).toBe('sem duplicatas');
    expect(r({ duplicatas: [['001', '2026-10-30', '5000.00'], ['002', '2026-11-29', '5000.00'], ['003', '2026-12-29', '6238.00']] })).toBe('3 · parcelas livres');
    expect(r({ duplicatas: [['001', '2026-10-30', '16238.00']] })).toBe('1 × 16.238,00 · 30/10');
  });
});

/* ═══ TELA B ═══════════════════════════════════════════════════════════════════════ */
describe('tela B — o Novo lançamento preenchido pela nota', () => {
  it('o prefill inteiro no DOM, com a pilula e as origens', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('pilula-do-xml').textContent).toBe('do XML · NF 000.012.345');
    expect(screen.getByDisplayValue('30/09/2026')).toBeInTheDocument();      // competencia = emissao
    expect(screen.getByDisplayValue('05/11/2026')).toBeInTheDocument();      // 1o vencimento = 1a duplicata
    expect(screen.getByDisplayValue('16.238,00')).toBeInTheDocument();
    for (const t of ['Saídas', 'Programado', 'Agropecuaria Exemplo', 'Faz. Pureza', 'Nutrição Engorda']) expect(`${t}:${combo(t)}`).toBe(`${t}:true`);
    expect(screen.getByTestId('origem-xml-tipo').textContent).toBe('Saída · do XML');
    expect(screen.getByTestId('origem-xml-competencia').textContent).toBe('emissão');
    expect(screen.getByTestId('origem-xml-valor').textContent).toBe('do XML');
    expect(screen.getByText('Fornecedor * · pelo CNPJ')).toBeTruthy();
    expect(screen.getByText('Fazenda * · IE 289876543')).toBeTruthy();
    /* a descrição é do operador: nasce vazia e nunca é "do XML" */
    expect(screen.getByText('Produto / descrição *')).toBeTruthy();
    expect(screen.getByTestId('origem-xml-subcentro').textContent).toBe('Classificação sugerida: Nutrição Engorda · último · 14/08/26 deste fornecedor');
    /* fornecedor achado pelo documento, unico e ativo: nenhuma faixa de fornecedor, nenhum aviso */
    expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull();
    expect(screen.queryByTestId('xml-aviso')).toBeNull();
  });

  it('editar um campo tira o ambar DELE (e so dele); voltar ao valor da nota o devolve', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO])) });
    const valor = await screen.findByDisplayValue('16.238,00');
    expect(valor.className).toContain('border-amber-300');
    fireEvent.change(valor, { target: { value: '16.000,00' } });
    expect(screen.queryByTestId('origem-xml-valor')).toBeNull();
    expect(screen.getByDisplayValue('16.000,00').className).not.toContain('border-amber-300');
    expect(screen.getByTestId('origem-xml-tipo')).toBeTruthy();
    expect(screen.getByTestId('origem-xml-competencia')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('16.000,00'), { target: { value: '16.238,00' } });
    expect(screen.getByTestId('origem-xml-valor').textContent).toBe('do XML');
  });

  it('PARCELADA: o Salvar manda ao writer de hoje exatamente o que a tela mostra — 2 parcelas, 1o vencimento, valor, competencia, fornecedor, fazenda', async () => {
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null } : { data: null, error: null }));
    const m = montarModal({ prefill: comConta(doXmlDe({}, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    expect(botaoSalvar().textContent).toBe('Criar 2 Parcelas');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_parcelamento_cadastrar')).toBe(true));
    const payload = (banco.rpc.mock.calls.find((c) => c[0] === 'fn_parcelamento_cadastrar')?.[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect(payload).toMatchObject({
      cliente_id: 'cli', fazenda_id: 'f-pur', valor_total: 16238, total_parcelas: 2, data_primeira_parcela: '2026-11-05',
      data_competencia: '2026-09-30', favorecido_id: 'agro', forma_pagamento: 'Boleto', plano_conta_id: 'pl-nut',
    });
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
    expect(m.onSave).not.toHaveBeenCalled();
  });

  /* PARC-LIVRES-01 — a nota que motivou o PR, MONTADA EM MEMORIA: 110.000,00 em sete duplicatas (entrada + seis a cada 28 dias). */
  const SETE: [string, string, string][] = [
    ['001', '2026-05-23', '33000.00'], ['002', '2026-06-19', '12833.34'], ['003', '2026-07-17', '12833.34'], ['004', '2026-08-14', '12833.33'],
    ['005', '2026-09-11', '12833.33'], ['006', '2026-10-09', '12833.33'], ['007', '2026-11-06', '12833.33'],
  ];
  const abrirPagamento = () => {
    const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''))!;
    fireEvent.mouseDown(aba); fireEvent.click(aba);
  };

  it('PARCELAS LIVRES: as sete duplicatas entram como estao na nota e o Salvar manda a LISTA ao writer (soma 110.000,00)', async () => {
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null } : { data: null, error: null }));
    const m = montarModal({ prefill: comConta(doXmlDe({ duplicatas: SETE }, [AGRO])) });
    await screen.findByDisplayValue('110.000,00');
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Criar 7 Parcelas'));
    abrirPagamento();
    await waitFor(() => expect(screen.getByTestId('rodape-n').textContent).toBe('7 parcelas'));
    expect(screen.getByTestId('rodape-soma').textContent).toBe('110.000,00');
    expect(screen.getByTestId('rodape-compra').textContent).toBe('110.000,00');
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.getByTestId('recado-de-parcelas').textContent).toBe('A nota trouxe 7 parcelas com valores ou datas próprias: entram como estão na nota.');
    expect(screen.queryByTestId('motivo-das-parcelas')).toBeNull();
    expect(botaoSalvar().disabled).toBe(false);
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_parcelamento_cadastrar')).toBe(true));
    const payload = (banco.rpc.mock.calls.find((c) => c[0] === 'fn_parcelamento_cadastrar')?.[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect(payload).toMatchObject({ valor_total: 110000, total_parcelas: 7, data_primeira_parcela: '2026-05-23' });
    expect(payload.parcelas).toEqual([
      { numero: 1, data_vencimento: '2026-05-23', valor: 33000 }, { numero: 2, data_vencimento: '2026-06-19', valor: 12833.34 },
      { numero: 3, data_vencimento: '2026-07-17', valor: 12833.34 }, { numero: 4, data_vencimento: '2026-08-14', valor: 12833.33 },
      { numero: 5, data_vencimento: '2026-09-11', valor: 12833.33 }, { numero: 6, data_vencimento: '2026-10-09', valor: 12833.33 },
      { numero: 7, data_vencimento: '2026-11-06', valor: 12833.33 },
    ]);
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
  });

  it('PARCELAS LIVRES: trocar 12.833,33 por 12.333,33 apaga o Salvar com o motivo ao lado e NADA vai ao banco; "A compra vale" muda o Valor e reacende', async () => {
    montarModal({ prefill: comConta(doXmlDe({ duplicatas: SETE }, [AGRO])) });
    await screen.findByDisplayValue('110.000,00');
    abrirPagamento();
    await waitFor(() => expect(screen.getAllByTestId('valor-da-parcela')).toHaveLength(7));
    const campo = screen.getAllByTestId('valor-da-parcela')[3];
    fireEvent.change(campo, { target: { value: '12.333,33' } }); fireEvent.blur(campo);
    expect(screen.getByTestId('diferenca').textContent).toBe('▼\u00a0−500,00');
    expect(screen.getByTestId('motivo-das-parcelas').textContent).toBe('A soma das parcelas não fecha com a compra.');
    expect(botaoSalvar().disabled).toBe(true);
    fireEvent.click(botaoSalvar());
    expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_parcelamento_cadastrar')).toBe(false);
    fireEvent.click(screen.getByTestId('compra-vale'));
    await waitFor(() => expect(screen.getByTestId('rodape-compra').textContent).toBe('109.500,00'));
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.queryByTestId('motivo-das-parcelas')).toBeNull();
    expect(botaoSalvar().disabled).toBe(false);
  });

  it('"Igual todo mês" (o de hoje): o payload NAO leva a chave `parcelas`', async () => {
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null } : { data: null, error: null }));
    montarModal({ prefill: comConta(doXmlDe({}, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    abrirPagamento();
    await waitFor(() => expect(screen.getByTestId('grade-de-parcelas').getAttribute('data-modo')).toBe('mensal'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_parcelamento_cadastrar')).toBe(true));
    const mensal = (banco.rpc.mock.calls.find((c) => c[0] === 'fn_parcelamento_cadastrar')?.[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect('parcelas' in mensal).toBe(false);
  });

  it('A VISTA (nota sem duplicatas): vencimento VAZIO, o aviso escrito, o Salvar RECUSA até o vencimento; o payload = o que a tela mostra; o XML sobe como application/xml', async () => {
    const d = doXmlDe({ duplicatas: null }, [AGRO]);
    const m = montarModal({ prefill: comConta(d) });
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-aviso').textContent).toBe(FRASE_SEM_DUPLICATAS);
    expect(botaoSalvar().textContent).toBe('Criar Lançamento');
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fin_documento_registrar' ? { data: { documento_id: 'doc-1' }, error: null } : { data: null, error: null }));
    /* CRIAR-DO-EXTRATO-01 — sem vencimento o Salvar não grava: o rótulo diz por quê; o operador informa e grava */
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe('Informe o vencimento.'));
    expect(screen.getByTestId('rotulo-vencimento').className).toContain('text-destructive');
    expect(m.onSave).not.toHaveBeenCalled();
    const campoVenc = within(screen.getByTestId('rotulo-vencimento').parentElement!).getByPlaceholderText('dd/mm/aaaa');
    fireEvent.change(campoVenc, { target: { value: '30/10/2026' } });
    fireEvent.keyDown(campoVenc, { key: 'Enter' });
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({
      tipo_operacao: '2-Saídas', status_transacao: 'programado', valor: 16238, data_competencia: '2026-09-30', data_vencimento: '2026-10-30',
      data_pagamento: null, favorecido_id: 'agro', fazenda_id: 'f-pur', numero_documento: '000.012.345', tipo_documento: 'Nota Fiscal',
      forma_pagamento: 'Boleto', plano_conta_id: 'pl-nut', descricao: DESCRICAO_DO_OPERADOR,
    });
    /* o documento NF pendente vai ao banco com a chave, o numero, a serie, a emissao e o valor da NOTA… */
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fin_documento_registrar')).toBe(true));
    const reg = banco.rpc.mock.calls.find((c) => c[0] === 'fin_documento_registrar')?.[1] as { p_lancamento_id: string; p_payload: Record<string, unknown> };
    expect(reg.p_lancamento_id).toBe('lanc-novo');
    expect(reg.p_payload).toMatchObject({ especie: 'nf', numero: '000.012.345', serie: '1', chave_acesso: chaveDe(EMITENTE_CNPJ, '55', '12345'), data_emissao: '2026-09-30', valor_documento: 16238, emitente_id: 'agro' });
    /* …e o arquivo: caminho .xml, tipo application/xml */
    await waitFor(() => expect(banco.upload).toHaveBeenCalledTimes(1));
    const [caminho, arq] = banco.upload.mock.calls[0] as [string, File];
    expect(caminho).toMatch(/^cli\/lanc-novo\/doc-1-\d+\.xml$/);
    expect([arq.name, arq.type]).toEqual(['NFe-12345.xml', 'application/xml']);
    expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1);
  });

  it('aba Pagamento: "Parcelada · 2x" em ambar, a grade em "Igual todo mês" com as duas duplicatas da nota e "= valor da nota"; a forma veio do XML', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''))!;
    fireEvent.mouseDown(aba); fireEvent.click(aba);
    await waitFor(() => expect(screen.getByTestId('grade-de-parcelas')).toBeTruthy());
    expect(screen.getByTestId('origem-xml-parcelamento').textContent).toBe('Parcelada · 2x · 1º venc. 05/11/26');
    expect(screen.getByTestId('origem-xml-forma').textContent).toBe('do XML');
    expect(combo('Boleto')).toBe(true);
    const grade = screen.getByTestId('grade-de-parcelas');
    expect(grade.getAttribute('data-modo')).toBe('mensal');
    expect(screen.getAllByTestId('linha-da-parcela').map((l) => l.textContent)).toEqual([
      '105/11/20268.119,00duplicata da nota', '205/12/20268.119,00duplicata da nota',
    ]);
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.getByTestId('recado-de-parcelas').textContent).toBe('= valor da nota');
  });

  it('aba Pagamento, duplicatas fora do padrao: entram DIRETO em "Parcelas livres", como estao na nota, com a frase (PARC-LIVRES-01)', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({ duplicatas: [['001', '2026-10-30', '8119.00'], ['002', '2026-11-29', '8119.00']] }, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''))!;
    fireEvent.mouseDown(aba); fireEvent.click(aba);
    await waitFor(() => expect(screen.getByTestId('grade-de-parcelas')).toBeTruthy());
    expect(screen.getByTestId('grade-de-parcelas').getAttribute('data-modo')).toBe('livres');
    expect(combo('Parcelada')).toBe(true);
    expect(screen.getAllByTestId('cel-de-onde-veio').map((c) => c.textContent)).toEqual(['duplicata da nota', 'duplicata da nota']);
    expect(screen.getAllByTestId('valor-da-parcela').map((c) => (c as HTMLInputElement).value)).toEqual(['8.119,00', '8.119,00']);
    expect(screen.getByTestId('rodape-soma').textContent).toBe('16.238,00');
    expect(screen.getByTestId('diferenca').textContent).toBe('0,00 ✓');
    expect(screen.getByTestId('recado-de-parcelas').textContent).toBe('A nota trouxe 2 parcelas com valores ou datas próprias: entram como estão na nota.');
    expect(screen.getByTestId('origem-xml-parcelamento').textContent).toBe('Parcelas livres · 2 · como na nota');
  });

  it('fazenda NAO identificada pela IE: o campo nasce VAZIO, mesmo com a lista filtrada numa fazenda — e o aviso diz por que', async () => {
    const semFazenda = (() => {
      const d = doXmlDe({}, [AGRO]);
      return { ...d, proposta: { ...d.proposta, fazendaId: null, avisos: ['Fazenda não identificada pela inscrição estadual.'], origens: { ...d.proposta.origens, fazenda: undefined } } };
    })();
    montarModal({ prefill: prefillDaNota(semFazenda), defaultFazendaId: 'f-exp' });
    await screen.findByDisplayValue('16.238,00');
    expect(combo('Faz. Sto. Expedito')).toBe(false);
    expect(screen.getByText('Selecione a fazenda do lançamento.')).toBeTruthy();
    expect(screen.getByTestId('xml-aviso').textContent).toBe('Fazenda não identificada pela inscrição estadual.');
    expect(screen.getByText('Fazenda *')).toBeTruthy();
  });

  it('a conta de pagamento NAO vem da nota: fica vazia, e sem ela o Salvar segue apagado', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO])) });
    await screen.findByDisplayValue('16.238,00');
    expect(combo('Banco do Brasil')).toBe(false);
    expect(botaoSalvar().hasAttribute('disabled')).toBe(true);
  });

  it('o documento pendente da nota (puro): chave, numero, serie, emissao, valor e o .xml', () => {
    const d = doXmlDe({}, [AGRO]);
    const p = pendenteDaNota(d, 'agro');
    expect(p.parcela).toBeNull();
    expect(p.payload).toEqual({ especie: 'nf', nome: 'nf 000.012.345', numero: '000.012.345', serie: '1', chaveAcesso: chaveDe(EMITENTE_CNPJ, '55', '12345'),
      dataEmissao: '2026-09-30', valorDocumento: 16238, emitenteId: 'agro', emitenteNome: null, emitenteDocumento: null });
    expect([p.arquivo?.name, p.arquivo?.type]).toEqual(['NFe-12345.xml', 'application/xml']);
    /* sem cadastro, o emitente vai escrito */
    expect(pendenteDaNota(d, null).payload).toMatchObject({ emitenteId: null, emitenteNome: 'AGROPECUARIA EXEMPLO LTDA', emitenteDocumento: '11.222.333/0001-81' });
    /* as travas de front deixam o XML passar */
    expect(TIPOS_ACEITOS).toContain('application/xml');
    expect(extensaoDoArquivo(d.arquivo)).toBe('xml');
  });

  it('duplicatas fora do padrao: o lancamento nasce parcelado em livres — "Criar 2 Parcelas", sem aviso de recusa', async () => {
    const d = doXmlDe({ duplicatas: [['001', '2026-10-30', '8119.00'], ['002', '2026-11-29', '8119.00']] }, [AGRO]);
    montarModal({ prefill: prefillDaNota(d) });
    await screen.findByDisplayValue('16.238,00');
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Criar 2 Parcelas'));
    expect(screen.queryByTestId('xml-aviso')).toBeNull();
  });

  it('nota ja registrada: AVISA, diz onde, e "seguir mesmo assim" tira o aviso — o Salvar nunca fica bloqueado', async () => {
    const oc: OcorrenciaDaNota = { origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l1', operacaoId: null, operacaoTipo: null, numero: '12345', descricao: 'Sal mineral', data: '2026-09-30', valor: 16238 };
    montarModal({ prefill: comConta(doXmlDe({}, [AGRO], { ocorrencias: [oc] })) });
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-aviso-registrada').textContent).toBe('Nota já registrada. NF 000.012.345 · Sal mineral · 30/09/26abrir|seguir mesmo assim');
    expect(botaoSalvar().hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByTestId('xml-seguir-mesmo-assim'));
    expect(screen.queryByTestId('xml-aviso-registrada')).toBeNull();
  });
});

describe('tela B — a faixa do fornecedor', () => {
  it('achado pelo NOME, cadastro sem CNPJ: a faixa, "comparar e atualizar o cadastro" (sem caixa que grava ao salvar) e "trocar fornecedor"', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO_SEM_DOC], { idPeloNome: 'agro' })) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Fornecedor achado pelo nome · "Agropecuaria Exemplo" · cadastro sem CNPJ · o XML traz 11.222.333/0001-81comparar e atualizar o cadastrotrocar fornecedor');
    expect(screen.queryByTestId('xml-gravar-documento')).toBeNull();
    expect(screen.getByTestId('xml-faixa-fornecedor').querySelector('input[type="checkbox"]')).toBeNull();
    expect(screen.getByText('Fornecedor * · pelo nome')).toBeTruthy();
    fireEvent.click(screen.getByTestId('xml-trocar-fornecedor'));
    expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull();
  });
  it('razao social MUITO longa: a faixa nao alarga o modal — o nome encolhe (inteiro no title), a caixa e "trocar" ficam, resumo e rodape seguem na grade', async () => {
    /* ⚠ O jsdom NAO MEDE: o que prende e' o CONTRATO de largura (medido na bancada a 1.000, 1.126 e 1.440: faixa de 750px e 24px, resumo
       e "Criar N Parcelas" dentro da janela). Antes a grade era `1fr` e a coluna crescia ate' o texto inteiro do aviso (1.274px). */
    const LONGO = 'COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO MATO GROSSO DO SUL E REGIAO CENTRO OESTE LTDA FILIAL CAMPO GRANDE';
    const longo = forn('agro', LONGO, null);
    montarModal({ prefill: comConta(doXmlDe({ nomeEmitente: LONGO, duplicatas: [['001', '2026-10-30', '8119.00'], ['002', '2026-11-29', '8119.00']] }, [longo], { idPeloNome: 'agro' })) }, [longo]);
    await screen.findByDisplayValue('16.238,00');
    const faixa = screen.getByTestId('xml-faixa-fornecedor');
    /* a frase inteira continua sendo o texto e o title da faixa */
    expect(faixa.getAttribute('title')).toBe(`Fornecedor achado pelo nome · "${LONGO}" · cadastro sem CNPJ · o XML traz 11.222.333/0001-81`);
    for (const c of ['h-6', 'min-w-0', 'overflow-hidden']) expect(faixa.className.split(' ')).toContain(c);
    const nome = screen.getByTestId('xml-nome-do-fornecedor');
    expect(nome.getAttribute('title')).toBe(LONGO);
    expect(nome.className).toMatch(/\btruncate\b/);
    expect(nome.className).toMatch(/shrink-\[10\]/);
    /* os gestos nao encolhem: sempre a' vista, a' direita */
    expect(screen.getByTestId('xml-comparar-cadastro').parentElement!.className).toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId('xml-trocar-fornecedor').className).toMatch(/\bshrink-0\b/);
    /* a raiz: a coluna principal da grade tem minimo ZERO, e a coluna do corpo tambem */
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('grid-cols-[minmax(0,1fr)_240px]');
    expect(dialogo.className).not.toMatch(/grid-cols-\[1fr_240px\]/);
    expect(screen.getByRole('tablist').parentElement!.className).toMatch(/\bmin-w-0\b/);
    expect(screen.getByTestId('corpo-do-lancamento').className).toMatch(/\bmin-w-0\b/);
    /* o resumo e o rodape continuam na grade (coluna 2 e a linha do rodape) */
    expect(dialogo.querySelector('aside')).not.toBeNull();
    expect(botaoSalvar().textContent).toBe('Criar 2 Parcelas');
    /* a "Classificação sugerida" tem o mesmo cuidado */
    const cls = screen.getByTestId('origem-xml-subcentro');
    for (const c of ['h-6', 'min-w-0', 'overflow-hidden']) expect(cls.className.split(' ')).toContain(c);
  });

  it('o Salvar NUNCA grava o cadastro: o CNPJ so entra pela comparacao (campo · hoje · da nota) confirmada', async () => {
    const m = montarModal({ prefill: { ...comConta(doXmlDe({ duplicatas: null }, [AGRO_SEM_DOC], { idPeloNome: 'agro' })), data_vencimento: '2026-10-30' } }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
    expect(consultas.gravarDocumentoNoCadastro).not.toHaveBeenCalled();
    expect(consultas.completarCadastroPeloXml).not.toHaveBeenCalled();
    expect(consultas.atualizarCamposDoCadastro).not.toHaveBeenCalled();
  });

  it('"comparar e atualizar o cadastro": abre o MESMO modal da previa (hoje x da nota), o CNPJ vazio vem marcado e so grava ao confirmar', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO_SEM_DOC], { idPeloNome: 'agro' })) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    fireEvent.click(screen.getByTestId('xml-comparar-cadastro'));
    const modal = await screen.findByTestId('comparar-cadastro');
    expect(consultas.fornecedorPeloDocumento).toHaveBeenCalledWith('cli', EMITENTE_CNPJ);
    expect(consultas.cadastroParaComparar).toHaveBeenCalledWith('cli', 'agro');
    const cnpj = within(modal).getAllByTestId('comparar-linha').find((l) => (l.textContent ?? '').includes('11.222.333/0001-81'))!;
    expect(cnpj.getAttribute('data-estado')).toBe('vazio');
    /* o nome igual nao e' oferecido; nada gravado antes de confirmar (dois cliques no mesmo botao) */
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    expect(consultas.atualizarCamposDoCadastro).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('comparar-atualizar'));
    await waitFor(() => expect(consultas.atualizarCamposDoCadastro).toHaveBeenCalledTimes(1));
    const [fornecedor, campos, origem] = consultas.atualizarCamposDoCadastro.mock.calls[0];
    expect([fornecedor, origem]).toEqual(['agro', 'nota']);
    expect(campos).toMatchObject({ cpf_cnpj: '11.222.333/0001-81' });
    expect(campos).not.toHaveProperty('nome');
    await waitFor(() => expect(screen.queryByTestId('comparar-cadastro')).toBeNull());
    expect(screen.getByTestId('xml-cadastro-atualizado').textContent).toBe('cadastro atualizado');
  });

  it('o CNPJ ja e de OUTRO cadastro: a comparacao nem abre — a faixa do conflito oferece "usar este"', async () => {
    consultas.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: true, valor: { id: 'outro', nome: 'Agro Outro', ativo: true } });
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO_SEM_DOC], { idPeloNome: 'agro' })) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    fireEvent.click(screen.getByTestId('xml-comparar-cadastro'));
    await screen.findByTestId('xml-conflito');
    expect(screen.queryByTestId('comparar-cadastro')).toBeNull();
    expect(consultas.cadastroParaComparar).not.toHaveBeenCalled();
  });

  it('achado pelo CNPJ: a faixa so aparece quando a nota completa algo; o Salvar nao preenche o cadastro calado', async () => {
    consultas.camposQueOEmitenteCompleta.mockResolvedValue(['municipio']);
    const m = montarModal({ prefill: { ...comConta(doXmlDe({ duplicatas: null }, [AGRO])), data_vencimento: '2026-10-30' } }, [AGRO]);
    await screen.findByDisplayValue('16.238,00');
    await waitFor(() => expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Fornecedor achado pelo CNPJ · "Agropecuaria Exemplo" · a nota traz dados que o cadastro não temcomparar e atualizar o cadastro'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
    expect(consultas.completarCadastroPeloXml).not.toHaveBeenCalled();
    consultas.camposQueOEmitenteCompleta.mockResolvedValue([]);
  });

  it('achado pelo CNPJ e nada a completar: nenhuma faixa', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO])) }, [AGRO]);
    await screen.findByDisplayValue('16.238,00');
    await waitFor(() => expect(consultas.camposQueOEmitenteCompleta).toHaveBeenCalled());
    expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull();
  });

  it('DOIS cadastros ativos com o mesmo CNPJ: o operador escolhe na faixa', async () => {
    const b = forn('agro2', 'Agro Exemplo Filial', '11222333000181');
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO, b], { ultima: null })) }, [AGRO, b]);
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Dois cadastros com o CNPJ 11.222.333/0001-81 · escolha:Agropecuaria ExemploAgro Exemplo Filial');
    expect(combo('Agro Exemplo Filial')).toBe(false);
    fireEvent.click(screen.getByTestId('xml-escolher-agro2'));
    expect(combo('Agro Exemplo Filial')).toBe(true);
    expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull();
  });

  it('so INATIVO: propoe e avisa', async () => {
    const inativo = forn('agro', 'Agropecuaria Exemplo', '11.222.333/0001-81', false);
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [inativo])) }, [inativo]);
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Fornecedor "Agropecuaria Exemplo" está inativo no cadastro · achado pelo CNPJtrocar fornecedor');
  });

  it('NAO encontrado: oferece criar com o nome e o CNPJ do XML (formato dos cadastros)', async () => {
    const m = montarModal({ prefill: prefillDaNota(doXmlDe({}, [], { ultima: null })) }, []);
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Fornecedor não encontrado no cadastro · "AGROPECUARIA EXEMPLO LTDA" · CNPJ 11.222.333/0001-81criar fornecedor com estes dados');
    fireEvent.click(screen.getByTestId('xml-criar-fornecedor'));
    await waitFor(() => expect(m.onCriarFornecedor).toHaveBeenCalledWith('AGROPECUARIA EXEMPLO LTDA', 'f-pur', '11.222.333/0001-81'));
  });
  it('NOTA-FORNECEDOR-DUPLICA-01 — o CNPJ ja\' e\' de um cadastro (conferido no banco antes): a frase pronta, nada criado, e "usar este"', async () => {
    consultas.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: true, valor: { id: 'agro-ja', nome: 'Agropecuaria Exemplo (cadastro antigo)', ativo: true } });
    const m = montarModal({ prefill: prefillDaNota(doXmlDe({}, [], { ultima: null })) }, []);
    await screen.findByDisplayValue('16.238,00');
    fireEvent.click(screen.getByTestId('xml-criar-fornecedor'));
    expect((await screen.findByTestId('xml-conflito')).textContent).toBe('Este CNPJ já é de "Agropecuaria Exemplo (cadastro antigo)" (ativo). Nada foi criado.');
    expect(m.onCriarFornecedor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('xml-usar-este'));
    await waitFor(() => expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull());
  });
});

describe('NOTA-JA-LANCADA-01 — o XML que parece ja\' lancado', () => {
  it('a linha diz "parece já lançada" e a nota abre na previa da nota (que oferece anexar), nao no Novo lançamento direto', async () => {
    consultas.notaJaLancada.mockImplementation(async () => ({ ok: true, valor: [{ id: 'velho' }] }));
    const onAbrirNota = vi.fn();
    const onAbrir = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={FAZENDAS} fornecedores={[AGRO]} onAbrirLancamento={onAbrir} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(screen.getByTestId('xml-situacao').textContent).toBe('parece já lançada');
    expect(onAbrirNota).toHaveBeenCalledTimes(1);
    expect(onAbrirNota.mock.calls[0][0].lido.origem).toBe('xml');
    const pedido = consultas.notaJaLancada.mock.calls[0][1] as { chave: string; parcelas: unknown[] };
    expect(pedido.chave).toBe(chaveDe(EMITENTE_CNPJ, '55', '12345'));
    expect(pedido.parcelas).toHaveLength(2);
  });
  /* P128a (decisao b) — a nota ja' anexada a um LANCAMENTO e' o ponto de partida: a busca dos irmaos roda e a nota abre na previa */
  it('a nota já anexada a um lançamento: "parece já lançada", a busca roda igual e abre a prévia da nota', async () => {
    consultas.notaJaRegistrada.mockImplementation(async () => ({ ok: true, valor: [{ origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l1', operacaoId: null, operacaoTipo: null, numero: '12345', descricao: 'Sal mineral', data: '2026-09-30', valor: 16238 }] }));
    const onAbrirNota = vi.fn();
    const onAbrir = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={FAZENDAS} fornecedores={[AGRO]} onAbrirLancamento={onAbrir} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(consultas.notaJaLancada).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('xml-situacao').textContent).toBe('parece já lançada');
    expect(onAbrirNota).toHaveBeenCalledTimes(1);
    expect(onAbrir).not.toHaveBeenCalled();
  });
  it('nada achado: o XML segue para o Novo lançamento, como sempre', async () => {
    const onAbrirNota = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={FAZENDAS} fornecedores={[AGRO]} onAbrirLancamento={() => {}} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(screen.getByTestId('xml-situacao').textContent).not.toBe('parece já lançada');
    expect(onAbrirNota).not.toHaveBeenCalled();
  });
});

describe('ITENS-NOTA-01 — a aba "Itens da nota (N)" do Novo lançamento pela nota', () => {
  const abaItens = () => screen.queryAllByRole('tab').find((t) => /Itens da nota/.test(t.textContent ?? ''));
  it('com a nota: a aba leva o N lido do proprio arquivo; ao criar, os itens vao ao banco pela RPC da nota (a mesma chave)', async () => {
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null } : { data: null, error: null }));
    const d = doXmlDe({}, [AGRO]);
    /* o jsdom nao tem `File.arrayBuffer` (o navegador tem): o mesmo jeito do `arquivo()` da tela A */
    const bytes = utf8(montarNFe({}));
    Object.defineProperty(d.arquivo, 'arrayBuffer', { value: async () => bytes });
    const m = montarModal({ prefill: comConta(d) });
    await waitFor(() => expect(abaItens()?.textContent).toMatch(/^Itens da nota \(\d+\)$/));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_nota_fiscal_gravar')).toBe(true));
    const args = banco.rpc.mock.calls.find((c) => c[0] === 'fn_nota_fiscal_gravar')?.[1] as { p_cliente: string; p_nota: { chave_acesso: string; origem: string }; p_simular: boolean };
    expect(args).toMatchObject({ p_cliente: 'cli', p_simular: false, p_nota: { chave_acesso: d.proposta.documento.chaveAcesso, origem: 'xml' } });
  });
  it('sem nota: a aba nao existe', async () => {
    montarModal({});
    await waitFor(() => expect(botaoSalvar()).toBeTruthy());
    expect(abaItens()).toBeUndefined();
  });
});

describe('sem XML, o modal e o de sempre', () => {
  it('nenhuma peca do XML e montada no Novo lançamento comum', async () => {
    montarModal({});
    await waitFor(() => expect(botaoSalvar()).toBeTruthy());
    for (const t of ['pilula-do-xml', 'xml-faixas', 'xml-faixa-fornecedor', 'xml-aviso', 'origem-xml-tipo', 'origem-xml-valor', 'recado-de-parcelas']) expect(screen.queryByTestId(t)).toBeNull();
    expect(document.body.innerHTML).not.toContain('border-amber-300 bg-amber-50 dark:bg-amber-950/30');
    expect(screen.getByText('Fornecedor *')).toBeTruthy();
  });
});

describe('NOTA-FORNECEDOR-DUPLICA-01 — a linha reaberta rele^ o fornecedor com a lista de agora', () => {
  it('lida sem cadastro; o cadastro com o CNPJ nasceu depois: ao abrir, ele e\' o proposto (e a NF pendente leva o emitente)', () => {
    const lida = doXmlDe({}, [], { ultima: null });
    expect(lida.resolucao.achadoPor).toBeNull();
    const agora = comFornecedoresDeAgora(lida, [AGRO]);
    expect([agora.resolucao.achadoPor, agora.proposta.favorecidoId, agora.proposta.documento.emitenteId]).toEqual(['documento', 'agro', 'agro']);
    expect(comFornecedoresDeAgora(agora, [AGRO])).toBe(agora);
  });
});

/* ═══ NOTA-CONTAS-NA-CRIACAO-01 A (P77) — a aba "Contas" dos Itens da nota no NOVO lancamento: a divisao fica PENDENTE na tela e o Salvar a
   grava junto com a criacao; recusada, nada fica valendo pela metade. O plano sintetico ganha uma segunda conta. ═══ */
describe('A — dividir pelos itens no NOVO lançamento', () => {
  const CLASSIF2: ClassificacaoItem[] = [...CLASSIF,
    { id: 'pl-san', subcentro: 'Sanidade Sintetica', centro_custo: 'Sanidade', grupo_custo: 'Sanidade', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' }];
  const SETE_A: [string, string, string][] = [['001', '2026-05-23', '33000.00'], ['002', '2026-06-19', '12833.34'], ['003', '2026-07-17', '12833.34'],
    ['004', '2026-08-14', '12833.33'], ['005', '2026-09-11', '12833.33'], ['006', '2026-10-09', '12833.33'], ['007', '2026-11-06', '12833.33']];
  /* a aba Itens nasce depois que o arquivo da nota e' lido: espera por ela */
  const aba = async (re: RegExp) => {
    const t = await waitFor(() => { const x = screen.getAllByRole('tab').find((y) => re.test(y.textContent ?? '')); if (!x) throw new Error(`sem a aba ${re}`); return x; });
    fireEvent.mouseDown(t); fireEvent.click(t);
  };
  const chamadas = (nome: string) => banco.rpc.mock.calls.filter((c) => c[0] === nome);
  /** os argumentos da 1a chamada da RPC, lidos sem cast */
  const argsDe = (nome: string): Record<string, unknown> => { const a: unknown = chamadas(nome)[0]?.[1]; return a && typeof a === 'object' ? Object.fromEntries(Object.entries(a)) : {}; };
  /* o jsdom nao le^ o `File` (sem `arrayBuffer`): o arquivo da nota devolve os MESMOS bytes, e os itens saem do leitor de verdade */
  const notaComItens = (o: OpcoesNota) => {
    const d = doXmlDe(o, [AGRO]);
    const bytes = utf8(montarNFe(o));
    Object.defineProperty(d.arquivo, 'arrayBuffer', { value: async () => bytes });
    return d;
  };
  /** Itens da nota → Contas; o item 1 vai para "Sanidade Sintetica" (os outros ficam na conta do lancamento); "Dividir em 2 contas ao salvar" */
  const dividirOItem1 = async () => {
    await aba(/Itens da nota/);
    fireEvent.click(await screen.findByRole('button', { name: 'Contas' }));
    fireEvent.click(within(await screen.findByTestId('conta-do-item-1')).getByRole('combobox'));
    fireEvent.click(await screen.findByText('Sanidade Sintetica'));
    const botao = screen.getByTestId('contas-dividir');
    expect(botao.textContent).toBe('Dividir em 2 contas ao salvar');
    fireEvent.click(botao);
  };
  const bancoQueAceita = (recusa: Record<string, string> = {}) => banco.rpc.mockImplementation(async (nome: unknown) => (
    typeof nome === 'string' && recusa[nome] ? { data: null, error: { message: recusa[nome] } }
      : nome === 'fin_documento_registrar' ? { data: { documento_id: 'doc-1' }, error: null }
        : nome === 'fn_parcelamento_cadastrar_dividido' || nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null }
          : { data: null, error: null }));

  it('a vista: pendente na tela (as partes na Geral, nada no banco); o Salvar cria, guarda os itens, anexa a nota e SO\' ENTAO divide', async () => {
    bancoQueAceita();
    const m = montarModal({ prefill: { ...comConta(notaComItens({ duplicatas: null })), data_vencimento: '2026-10-30' }, classificacoes: CLASSIF2 });
    await screen.findByDisplayValue('16.238,00');
    await dividirOItem1();
    expect(chamadas('fn_lancamento_dividir_pelos_itens')).toHaveLength(0);
    await aba(/Geral/);
    const bloco = await screen.findByTestId('bloco-classificacao');
    expect(bloco.textContent).toContain('dividida em 2 contas ao salvar');
    expect(within(bloco).getAllByTestId('parte-linha')).toHaveLength(2);
    expect(within(bloco).getByTestId('partes-total').textContent).toContain('16.238,00');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(m.onSave).toHaveBeenCalledTimes(1);
    const ordem = banco.rpc.mock.calls.map((c) => c[0]).filter((x) => ['fn_nota_fiscal_gravar', 'fin_documento_registrar', 'fn_lancamento_dividir_pelos_itens'].includes(String(x)));
    expect(ordem).toEqual(['fn_nota_fiscal_gravar', 'fin_documento_registrar', 'fn_lancamento_dividir_pelos_itens']);
    const pedido = argsDe('fn_lancamento_dividir_pelos_itens');
    expect(pedido.p_lancamento_id).toBe('lanc-novo');
    expect(pedido.p_simular).toBe(false);
    expect(pedido.p_motivo).toBe('dividido pelos itens da nota ao criar o lançamento');
    expect(pedido.p_mapa).toEqual(['pl-san', 'pl-nut', 'pl-nut', 'pl-nut', 'pl-nut', 'pl-nut'].map((plano_conta_id, k) => ({ n_item: k + 1, plano_conta_id })));
    expect(chamadas('fn_cancelar_lancamento_auditoria')).toHaveLength(0);
    expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1);
  });

  it('a vista, a divisao RECUSADA: o recem-criado e\' cancelado, a frase fica ao lado do botao e o modal continua aberto', async () => {
    bancoQueAceita({ fn_lancamento_dividir_pelos_itens: 'Outubro de 2026 está fechado no Financeiro.' });
    const m = montarModal({ prefill: { ...comConta(notaComItens({ duplicatas: null })), data_vencimento: '2026-10-30' }, classificacoes: CLASSIF2 });
    await screen.findByDisplayValue('16.238,00');
    await dividirOItem1();
    await aba(/Geral/);
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(chamadas('fn_cancelar_lancamento_auditoria')).toHaveLength(1));
    expect(argsDe('fn_cancelar_lancamento_auditoria').p_lancamento_id).toBe('lanc-novo');
    await waitFor(() => expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe(
      'Nada ficou valendo: a divisão não foi gravada (Outubro de 2026 está fechado no Financeiro.) e o lançamento recém-criado foi cancelado. Corrija e salve de novo.'));
    expect(m.onClose).not.toHaveBeenCalled();
    expect(m.onLancamentoCriado).not.toHaveBeenCalled();
  });

  it('parcelado: a divisao vai NA MESMA chamada do cadastro (os percentuais dos itens, soma 100); a de sempre nao e\' chamada', async () => {
    bancoQueAceita();
    const m = montarModal({ prefill: comConta(notaComItens({ duplicatas: SETE_A })), classificacoes: CLASSIF2 });
    await screen.findByDisplayValue('110.000,00');
    await dividirOItem1();
    await aba(/Geral/);
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Criar 7 Parcelas'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(chamadas('fn_parcelamento_cadastrar_dividido')).toHaveLength(1));
    expect(chamadas('fn_parcelamento_cadastrar')).toHaveLength(0);
    const { p_partes, p_motivo, p_payload } = argsDe('fn_parcelamento_cadastrar_dividido');
    const partes: unknown[] = Array.isArray(p_partes) ? p_partes : [];
    expect(partes.map((x) => (x && typeof x === 'object' ? Reflect.get(x, 'plano_conta_id') : null))).toEqual(['pl-san', 'pl-nut']);
    expect(Math.round(partes.reduce<number>((s, x) => s + (x && typeof x === 'object' ? Number(Reflect.get(x, 'percentual')) : 0), 0) * 1e6) / 1e6).toBe(100);
    expect(p_motivo).toBe('dividido pelos itens da nota ao criar o lançamento');
    expect(p_payload).toMatchObject({ total_parcelas: 7, valor_total: 110000 });
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
  });

  it('parcelado RECUSADO: "Nada foi criado" ao lado do botao (o banco desfez o cadastro inteiro); nenhum cadastro sem divisao', async () => {
    bancoQueAceita({ fn_parcelamento_cadastrar_dividido: 'A conta "Sanidade Sintetica" é de 1-Entradas e o lançamento é de 2-Saídas.' });
    const m = montarModal({ prefill: comConta(notaComItens({ duplicatas: SETE_A })), classificacoes: CLASSIF2 });
    await screen.findByDisplayValue('110.000,00');
    await dividirOItem1();
    await aba(/Geral/);
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Criar 7 Parcelas'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.getByTestId('erro-antes-de-salvar').textContent).toContain('Nada foi criado: A conta "Sanidade Sintetica" é de 1-Entradas'));
    expect(chamadas('fn_parcelamento_cadastrar')).toHaveLength(0);
    expect(m.onClose).not.toHaveBeenCalled();
  });

  it('a maior parte numa conta de OUTRA atividade: a safra da atividade de antes sai (o campo esta\' oculto; o Salvar a recusaria)', async () => {
    bancoQueAceita();
    const LAV: ClassificacaoItem = { id: 'pl-lav', subcentro: 'Insumos Lavoura Sintetica', centro_custo: 'Insumos', grupo_custo: 'Custeio Lavoura', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' };
    const SAFRA_PEC: Safra = { id: 's-pec', nome: 'Safra 26/27 Pecuária', ativa: true, codigo: '26/27-PEC', escopo_negocio: 'pecuaria' };
    const m = montarModal({ prefill: { ...comConta(notaComItens({ duplicatas: null })), data_vencimento: '2026-10-30', safra_id: 's-pec' }, classificacoes: [...CLASSIF2, LAV],
      safras: [SAFRA_PEC] });
    await screen.findByDisplayValue('16.238,00');
    await aba(/Itens da nota/);
    fireEvent.click(await screen.findByRole('button', { name: 'Contas' }));
    fireEvent.click(within(await screen.findByTestId('conta-do-item-1')).getByRole('combobox'));
    fireEvent.click(within(screen.getByTestId('conta-barra-atividade')).getByText('Lavoura'));
    fireEvent.click(await screen.findByText('Insumos Lavoura Sintetica'));
    fireEvent.click(screen.getByTestId('contas-dividir'));
    await aba(/Geral/);
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ plano_conta_id: 'pl-lav', safra_id: null });
  });
  it('"Voltar para 1 conta" desfaz a pendente na tela; quem nao divide salva como sempre (nenhuma RPC de divisao)', async () => {
    bancoQueAceita();
    const m = montarModal({ prefill: { ...comConta(notaComItens({ duplicatas: null })), data_vencimento: '2026-10-30' }, classificacoes: CLASSIF2 });
    await screen.findByDisplayValue('16.238,00');
    await dividirOItem1();
    await aba(/Geral/);
    fireEvent.click(await screen.findByTestId('divisao-na-criacao-voltar'));
    expect(screen.queryByTestId('partes-da-classificacao')).toBeNull();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onClose).toHaveBeenCalled());
    expect(chamadas('fn_lancamento_dividir_pelos_itens')).toHaveLength(0);
    expect(chamadas('fn_cancelar_lancamento_auditoria')).toHaveLength(0);
  });
});

/** P101 — abaixo de 1000px a lista não passava da janela só porque perdia a coluna CNPJ (155px a mais a 750): o CNPJ vai no `title` do Emitente. */
describe('P101 — "Novo a partir da nota" numa janela estreita', () => {
  const largura = window.innerWidth;
  const janela = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  afterEach(() => { janela(largura); });
  it('abaixo de 1000px: sem a coluna CNPJ, o CNPJ no title do Emitente; a partir de 1000px, a coluna de sempre', async () => {
    janela(800);
    const { unmount } = montarLista();
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    const titulos = () => within(screen.getByTestId('xml-tabela')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(titulos()).not.toContain('CNPJ');
    expect(screen.getAllByTestId('xml-linha')[0].querySelector(`td[title*="${documentoFormatado(EMITENTE_CNPJ)}"]`)).not.toBeNull();
    unmount();
    janela(1200);
    montarLista();
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(titulos()).toContain('CNPJ');
  });
});

/* ═══ NOTA-NOVA-MODAL-REAL D2 (Gabriel 30/10) ══════════════════════════════════════════════════════════════════════
   A nota paga no CARTÃO EM N× nasce no Novo lançamento de sempre, antes de a tela intermediária sair: Parcelada + N× na aba Pagamento,
   a conta origem é o cartão e cada parcela cai na fatura certa (o dia mais frequente do cartão, no mês seguinte à emissão). O caso M2
   (cartão 10×), SINTÉTICO. */
describe('NOTA-NOVA-MODAL-REAL D2 — o cartão em N× no Novo lançamento (o caso M2, sintético)', () => {
  const ELO: ContaBancariaV2 = { id: 'elo', nome_conta: 'Cartão Elo', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: 'cartao', codigo_conta: null, nome_exibicao: 'Cartão Elo', agencia: null, numero_conta: null, conta_digito: null };
  it('nota sem duplicata no cartão Elo em 10×: a 1ª fatura sugerida (dia 10, mês seguinte à emissão); o Salvar manda as 10 ao writer de sempre, na conta do cartão', async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fn_parcelamento_cadastrar' ? { data: 'fin-1', error: null } : { data: null, error: null }));
    const m = montarModal({ contas: [...CONTAS, ELO], prefill: { ...prefillDaNota(doXmlDe({ duplicatas: null }, [AGRO])), conta_bancaria_id: 'elo', descricao: DESCRICAO_DO_OPERADOR } });
    await screen.findByDisplayValue('16.238,00');
    const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''))!;
    fireEvent.mouseDown(aba); fireEvent.click(aba);
    const modalidade = screen.getAllByRole('combobox').find((c) => (c.textContent ?? '').includes('À vista'))!;
    modalidade.focus(); fireEvent.keyDown(modalidade, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Parcelada' }));
    const n = await screen.findByRole('spinbutton');
    fireEvent.change(n, { target: { value: '10' } }); fireEvent.blur(n);
    await waitFor(() => expect(screen.getAllByTestId('linha-da-parcela')).toHaveLength(10));
    expect(cartaoNoBanco.diasDoCartao).toHaveBeenCalledWith('elo');
    expect(screen.getAllByTestId('cel-vencimento').map((c) => c.textContent)).toEqual(
      ['10/10/2026', '10/11/2026', '10/12/2026', '10/01/2027', '10/02/2027', '10/03/2027', '10/04/2027', '10/05/2027', '10/06/2027', '10/07/2027']);
    expect(screen.getByTestId('recado-de-parcelas').textContent).toBe('1ª fatura · sugerido (Elo, dia 10) · = valor da nota');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_parcelamento_cadastrar')).toBe(true));
    const payload = (banco.rpc.mock.calls.find((c) => c[0] === 'fn_parcelamento_cadastrar')?.[1] as { p_payload: Record<string, unknown> }).p_payload;
    expect(payload).toMatchObject({ valor_total: 16238, total_parcelas: 10, data_primeira_parcela: '2026-10-10', conta_bancaria_id: 'elo', descricao: DESCRICAO_DO_OPERADOR });
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
  });
  it('conta que NÃO é cartão: nada é sugerido (o 1º vencimento é do operador)', async () => {
    Element.prototype.hasPointerCapture = () => false;
    cartaoNoBanco.diasDoCartao.mockClear();
    montarModal({ prefill: { ...prefillDaNota(doXmlDe({ duplicatas: null }, [AGRO])), conta_bancaria_id: 'bb', descricao: DESCRICAO_DO_OPERADOR } });
    await screen.findByDisplayValue('16.238,00');
    const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''))!;
    fireEvent.mouseDown(aba); fireEvent.click(aba);
    const modalidade = screen.getAllByRole('combobox').find((c) => (c.textContent ?? '').includes('À vista'))!;
    modalidade.focus(); fireEvent.keyDown(modalidade, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Parcelada' }));
    await screen.findByRole('spinbutton');
    expect(cartaoNoBanco.diasDoCartao).not.toHaveBeenCalled();
    expect(screen.getByTestId('recado-de-parcelas').textContent).not.toContain('fatura');
  });
});

/* NOTA-NOVA-MODAL-REAL — o Novo lançamento pela nota do PDF (e pela chave digitada) diz de onde veio, sem inventar */
describe('NOTA-NOVA-MODAL-REAL — a origem no Novo lançamento: "do PDF"; o que a nota não trouxe nunca é "da nota"', () => {
  const comoPdf = (d: DoXml): DoXml => ({ ...d, arquivo: new File(['%PDF-1.4 x'], '000.012.345.pdf', { type: 'application/pdf' }) });
  it('a nota do PDF: a pílula e as origens dizem "do PDF" (nunca "do XML")', async () => {
    montarModal({ prefill: prefillDaNota(comoPdf(doXmlDe({}, [AGRO]))) });
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('pilula-do-xml').textContent).toBe('do PDF · NF 000.012.345');
    expect(screen.getByTestId('origem-xml-tipo').textContent).toBe('Saída · do PDF');
    expect(screen.getByTestId('origem-xml-valor').textContent).toBe('do PDF');
  });
  it('só a chave (sem emissão nem valor): o 0,00 e a competência vazia NÃO ficam em âmbar "da nota" — são do operador', async () => {
    const d = comoPdf(doXmlDe({}, [AGRO]));
    montarModal({ prefill: prefillDaNota({ ...d, proposta: { ...d.proposta, valorCent: 0, competencia: '' } }) });
    await screen.findByTestId('pilula-do-xml');
    expect(screen.queryByTestId('origem-xml-valor')).toBeNull();
    expect(screen.queryByTestId('origem-xml-competencia')).toBeNull();
    expect(screen.getByTestId('origem-xml-tipo').textContent).toBe('Saída · do PDF');
  });
});
