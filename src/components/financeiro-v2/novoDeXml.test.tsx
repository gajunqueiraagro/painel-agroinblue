/**
 * FIN-NFE-XML-01d — "Novo a partir de XML": a lista de notas (tela A) e o Novo lançamento preenchido (tela B).
 *
 * ⚠ FIXTURES SINTETICAS do 01a (`src/lib/financeiro/nfe/__fixtures__/notas.ts`): nenhum dado real.
 * ⚠ O `LancamentoV2Dialog` E' MONTADO DE VERDADE; so' as bordas sao falsas (banco, cliente, modais filhos). O que se prova e'
 *   o que a tela MOSTRA e o que ela manda GRAVAR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
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
  fornecedorPeloNome: vi.fn(async () => null as string | null),
  notaJaRegistrada: vi.fn(async (_c: string, _k: string) => [] as unknown[]),
  ultimaClassificacaoDoFornecedor: vi.fn(async () => null as unknown),
  gravarDocumentoNoCadastro: vi.fn(async () => null as string | null),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => consultas);
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { NovoDeXmlDialog, resumoDasDuplicatas } from './NovoDeXmlDialog';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { proporLancamento, FRASE_SEM_DUPLICATAS, type UltimaClassificacao } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente, type ResolucaoEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { arquivoXmlDaNota, pendenteDaNota, prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { CTE, EMITENTE_CNPJ, chaveDe, montarNFe, utf8, type OpcoesNota } from '@/lib/financeiro/nfe/__fixtures__/notas';
import type { OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';
import { TIPOS_ACEITOS } from '@/hooks/useLancamentoDocumentos';
import { extensaoDoArquivo } from '@/lib/oc/caminhoDocumento';

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
  return { proposta: p.proposta, emitenteNome: lido.nota.emitente.nome, emitenteDocumento: lido.nota.emitente.documento, resolucao, ocorrencias: extra.ocorrencias ?? [], arquivo: arquivoXmlDaNota(bytes, 'NFe-12345.XML') };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.rpc.mockReset(); banco.rpc.mockImplementation(async () => ({ data: null, error: null }));
  banco.upload.mockClear();
  for (const f of Object.values(consultas)) f.mockClear();
  consultas.notaJaRegistrada.mockImplementation(async () => []);
  consultas.fornecedorPeloNome.mockImplementation(async () => null);
  consultas.ultimaClassificacaoDoFornecedor.mockImplementation(async () => null);
});

function montarModal(props: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>, fornecedores: FornecedorV2[] = [AGRO]) {
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
/** A nota NAO traz a conta de pagamento: o operador a escolhe. Nos casos de Salvar, a escolha entra como ele a faria. */
const comConta = (d: DoXml) => ({ ...prefillDaNota(d), conta_bancaria_id: 'bb' });
const combo = (texto: string) => screen.getAllByRole('combobox').some((c) => (c.textContent ?? '').includes(texto));

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
    expect(linhas[0].textContent).toContain('30/09/26');
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

  it('pergunta ao banco se a nota ja esta registrada, pela CHAVE — e a linha diz "já registrada" sem bloquear', async () => {
    consultas.notaJaRegistrada.mockImplementation(async () => [{ origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l1', operacaoId: null, operacaoTipo: null, numero: '12345', descricao: 'Sal mineral', data: '2026-09-30', valor: 16238 }]);
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

  it('fornecedor: pelo documento nao vai ao banco; sem documento no cadastro, pergunta pelo NOME ao resolvedor', async () => {
    montarLista([AGRO]);
    soltar([arquivo('a.xml', montarNFe())]);
    await waitFor(() => expect(screen.getAllByTestId('xml-linha')).toHaveLength(1));
    expect(consultas.fornecedorPeloNome).not.toHaveBeenCalled();
    expect(consultas.ultimaClassificacaoDoFornecedor).toHaveBeenCalledWith('cli', 'agro');
  });
  it('fornecedor achado pelo nome: o pacote leva "pelo nome" e o cadastro sem documento', async () => {
    consultas.fornecedorPeloNome.mockImplementation(async () => 'agro');
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
    await screen.findByDisplayValue('NF 12.345 · SAL MINERAL 80 P SC 30KG, RACAO ENGORDA 18% SC 40KG · 6 itens');
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
    expect(screen.getByText('Produto / Descrição * · do XML')).toBeTruthy();
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

  it('A VISTA (nota sem duplicatas): vencimento VAZIO, o aviso escrito, e o payload do Salvar = o que a tela mostra; o XML sobe como application/xml', async () => {
    const d = doXmlDe({ duplicatas: null }, [AGRO]);
    const m = montarModal({ prefill: comConta(d) });
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-aviso').textContent).toBe(FRASE_SEM_DUPLICATAS);
    expect(botaoSalvar().textContent).toBe('Criar Lançamento');
    banco.rpc.mockImplementation(async (nome: unknown) => (nome === 'fin_documento_registrar' ? { data: { documento_id: 'doc-1' }, error: null } : { data: null, error: null }));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({
      tipo_operacao: '2-Saídas', status_transacao: 'programado', valor: 16238, data_competencia: '2026-09-30', data_vencimento: null,
      data_pagamento: null, favorecido_id: 'agro', fazenda_id: 'f-pur', numero_documento: '12345', tipo_documento: 'Nota Fiscal',
      forma_pagamento: 'Boleto', plano_conta_id: 'pl-nut', descricao: 'NF 12.345 · SAL MINERAL 80 P SC 30KG, RACAO ENGORDA 18% SC 40KG · 6 itens',
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
      '105/11/268.119,00duplicata da nota', '205/12/268.119,00duplicata da nota',
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
  it('achado pelo NOME, cadastro sem CNPJ: a faixa, a caixa marcada por padrao e "trocar fornecedor"', async () => {
    montarModal({ prefill: prefillDaNota(doXmlDe({}, [AGRO_SEM_DOC], { idPeloNome: 'agro' })) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    expect(screen.getByTestId('xml-faixa-fornecedor').textContent).toBe('Fornecedor achado pelo nome · "Agropecuaria Exemplo" · cadastro sem CNPJ · o XML traz 11.222.333/0001-81Gravar o CNPJ neste cadastro ao salvartrocar fornecedor');
    expect((screen.getByTestId('xml-gravar-documento') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Fornecedor * · pelo nome')).toBeTruthy();
    fireEvent.click(screen.getByTestId('xml-trocar-fornecedor'));
    expect(screen.queryByTestId('xml-faixa-fornecedor')).toBeNull();
  });

  it('o CNPJ so e gravado no cadastro DEPOIS de o lancamento nascer; se o Salvar falha, nao grava', async () => {
    const d = doXmlDe({ duplicatas: null }, [AGRO_SEM_DOC], { idPeloNome: 'agro' });
    const m = montarModal({ prefill: comConta(d) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    expect(consultas.gravarDocumentoNoCadastro).not.toHaveBeenCalled();
    m.onSave.mockImplementationOnce(async () => false);
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(consultas.gravarDocumentoNoCadastro).not.toHaveBeenCalled();
    expect(m.onLancamentoCriado).not.toHaveBeenCalled();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(consultas.gravarDocumentoNoCadastro).toHaveBeenCalledTimes(1));
    expect(consultas.gravarDocumentoNoCadastro).toHaveBeenCalledWith('cli', 'agro', EMITENTE_CNPJ);
    /* a ordem: primeiro o lancamento, depois o cadastro */
    expect(m.onSave.mock.invocationCallOrder[1]).toBeLessThan(consultas.gravarDocumentoNoCadastro.mock.invocationCallOrder[0]);
  });

  it('caixa DESMARCADA: o lancamento nasce e o cadastro nao e tocado', async () => {
    const m = montarModal({ prefill: comConta(doXmlDe({ duplicatas: null }, [AGRO_SEM_DOC], { idPeloNome: 'agro' })) }, [AGRO_SEM_DOC]);
    await screen.findByDisplayValue('16.238,00');
    fireEvent.click(screen.getByTestId('xml-gravar-documento'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onLancamentoCriado).toHaveBeenCalledTimes(1));
    expect(consultas.gravarDocumentoNoCadastro).not.toHaveBeenCalled();
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
