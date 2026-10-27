/**
 * FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado), com o DANFE SINTETICO (as posicoes do real, dados de teste).
 * A PROVA DO BRIEFING, na bancada: NF 937 -> fornecedor nao cadastrado -> 4 parcelas de 491,64 (20/10/2026 a 20/01/2027) = 1.966,56,
 * o PDF anexado as 4 (a NF na parcela 1, ligada a todas); a segunda leitura da mesma nota barrada; a chave que nao confere barra.
 * E o pedido do Gabriel: lancamento aberto do mesmo fornecedor com o valor -> "Atualizar este" (so' com confirmacao).
 * ⚠ Nenhum banco: os gravadores e as consultas sao falsos; o que se prova e' o que a tela mostra e o que ela manda gravar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  lancamentosAbertosComValor: vi.fn(async (_c: string, _f: string, _v: readonly number[]): Promise<unknown[]> => []),
  iePorFazenda: vi.fn(async (): Promise<Record<string, string>> => ({ 'faz-1': '280000002' })),
  /* NOTA-FAZENDA-PELA-IE-01 — gravar a IE na fazenda (simula e grava) */
  inscreverEmFazendas: vi.fn((_cb: (c: string) => void) => () => undefined),
  aliasesDasFazendas: vi.fn(async (): Promise<Record<string, string[]>> => ({})),
  gravarIeDaFazenda: vi.fn(async (_f: string, _ie: string, _r: string | null, simular: boolean, _c: string)
    : Promise<{ ok: true; frase: string | null; trilhaId: string | null } | { ok: false; frase: string }> => (simular
      ? { ok: true, frase: 'Faz. Sintetica passa a ter a IE 280000002: as próximas notas com esta IE de destinatário já vêm com a fazenda.', trilhaId: null }
      : { ok: true, frase: null, trilhaId: 'trilha-1' })),
  desfazerIeDaFazenda: vi.fn(async (): Promise<string | null> => null),
  fornecedorPeloNome: vi.fn(async (): Promise<string | null> => null),
  notaJaRegistrada: vi.fn(async (): Promise<unknown[]> => []),
  ultimaClassificacaoDoFornecedor: vi.fn(async (): Promise<unknown> => null),
  fornecedorPeloDocumento: vi.fn(async (_c: string, _d: string): Promise<{ id: string; nome: string; ativo: boolean } | null> => null),
  usoDoFornecedor: vi.fn(async (_f: string): Promise<{ lancamentos: number; ultimo: string | null } | null> => ({ lancamentos: 3, ultimo: '2026-09-01' })),
  /* NOTA-JA-LANCADA-01 — nada ja' lancado, por padrao */
  notaJaLancada: vi.fn(async (_c: string, _e: unknown): Promise<LancamentoJaLancado[]> => []),
  /* NOTA-FORNECEDOR-COMPARAR-01 — o cadastro de hoje e a gravacao com trilha */
  cadastroParaComparar: vi.fn(async (_c: string, _f: string): Promise<Record<string, string | null> | null> => ({
    nome: 'Agro Sintetica Insumos Agropecuarios Ltda', nome_fantasia: null, cpf_cnpj: null, inscricao_estadual: null, logradouro: null, numero: null,
    complemento: null, bairro: null, cep: null, municipio: 'Campo Grande', uf: 'MS' })),
  atualizarCamposDoCadastro: vi.fn(async (_f: string, _c: Record<string, string>, _o: string, _r: string | null, _cli: string): Promise<{ ok: true; alteracaoId: string | null } | { ok: false; frase: string }> => ({ ok: true, alteracaoId: 'alt-1' })),
  desfazerCamposDoCadastro: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => consultas);
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
import type { OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  vi.clearAllMocks();
  consultas.camposQueOEmitenteCompleta.mockResolvedValue([]);
  consultas.lancamentosAbertosComValor.mockResolvedValue([]);
  consultas.notaJaLancada.mockResolvedValue([]);
});

const FAZENDAS: Fazenda[] = [{ id: 'faz-1', nome: 'Faz. Sintetica', owner_id: 'u1', cliente_id: 'cli', codigo: null },
  { id: 'faz-2', nome: 'Faz. Sintetica Dois', owner_id: 'u1', cliente_id: 'cli', codigo: null }];
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
const RECEITA = vi.fn(async (_cnpj: string): Promise<RespostaDoCnpj> => ({ ok: true, dados: {
  razaoSocial: 'AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA', fantasia: '', municipio: 'Campo Grande', uf: 'MS', logradouro: 'Rua das Flores', numero: '100',
  complemento: '', bairro: 'Centro', cep: '79000-000', matrizFilial: 'FILIAL',
} }));

function montarNota(opcoes: { paginas?: ItemDoDanfe[][]; fornecedores?: FornecedorV2[]; ocorrencias?: OcorrenciaDaNota[]; umaParcela?: boolean;
  /* NOTA-FAZENDA-PELA-IE-01 — as fazendas que a leitura conhece (padrao: a Faz. Sintetica COM a IE da nota) */
  fazendasDaLeitura?: { id: string; nome: string; ie: string | null; aliases?: string[] }[] } = {}): NotaParaLancar {
  const r = notaDoDanfe(opcoes.paginas ?? PAGINAS_DANFE_SINTETICO);
  if (r.ok === false) throw new Error(r.frase);
  /* nota de UMA parcela: a duplicata unica com o valor da nota */
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
  };
  const comoGravadores: Gravadores = g;
  return { g, comoGravadores };
}
const FORN: FornecedorV2 = {
  id: 'f1', nome: 'Agro Sintetica', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null,
  banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null, observacao_pagamento: null,
};

function abrir(nota: NotaParaLancar, extra: { fornecedores?: FornecedorV2[]; g?: Gravadores; onCriarLancamento?: (f: LancamentoV2Form) => Promise<string | null>; contas?: ContaBancariaV2[]; gj?: GravadoresDaJuncao } = {}) {
  const onCriarFornecedor = vi.fn(async (nome: string, _faz: string | null, _doc?: string): Promise<FornecedorV2 | null> => ({ ...FORN, id: 'forn-novo', nome }));
  const props = {
    onClose: vi.fn(), onCriado: vi.fn(), onAbrirNoLancamento: vi.fn(), onAbrirRegistrada: vi.fn(), onCriarFornecedor,
    /* ITENS-NOTA-01 — o gravador dos itens (o de verdade vai ao banco) */
    gravarItens: vi.fn(async (_c: string, _b: ArrayBuffer): Promise<string | null> => null),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaFiscalDialog open clienteId="cli" clienteNome="NJ" nota={nota} fazendas={FAZENDAS} contas={extra.contas ?? CONTAS} classificacoes={PLANO} safras={SAFRAS}
        fornecedores={extra.fornecedores ?? []} gravadores={extra.g} consultarReceita={RECEITA} onCriarLancamento={extra.onCriarLancamento} gravadoresDaJuncao={extra.gj} {...props} />
    </QueryClientProvider>,
  );
  return props;
}
async function escolherSubcentro(nome: string) {
  /* SELETOR-CONTA-POR-ATIVIDADE-01 — o subcentro da previa e' o `EscolherConta` (o gatilho e' o combobox do seletor do plano) */
  fireEvent.click(within(screen.getByTestId('nota-subcentro')).getByRole('combobox'));
  fireEvent.click(await screen.findByText(nome));
}

describe('N1 — a nota lida, como no mock', () => {
  it('Nota, Fornecedor (não cadastrado, nome da Receita), Parcelas, Itens e o "Falta:"', async () => {
    abrir(montarNota());
    expect(screen.getByTestId('nota-chave').textContent).toBe('chave confere: CNPJ, nº, série e mês');
    expect(screen.getByTestId('nota-numero').textContent).toContain('000.000.937');
    const forn = screen.getByTestId('nota-bloco-fornecedor');
    expect(forn.textContent).toContain('não cadastrado neste cliente');
    await waitFor(() => expect(forn.textContent).toContain('Agro Sintetica Insumos Agropecuarios Ltda'));
    expect(forn.textContent).toContain('completo pela Receita');
    expect(forn.textContent).toContain('11.222.333/0004-24');
    const parcelas = screen.getAllByTestId('nota-parcela').map((l) => l.textContent);
    expect(parcelas).toEqual(['1/420/10/2026491,64', '2/420/11/2026491,64', '3/420/12/2026491,64', '4/420/01/2027491,64']);
    expect(screen.getByTestId('nota-parcelas-total').textContent).toBe('1.966,56');
    expect(screen.getAllByTestId('nota-item')).toHaveLength(3);
    expect(screen.getByTestId('nota-bloco-itens').textContent).toContain('1.966,56');
    expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: fornecedor, subcentro');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
    expect(screen.getByTestId('nota-criar').textContent).toBe('Criar 4 parcelas');
  });
  it('quantidade curta e a frase do completar', () => {
    expect([quantidadeCurta('2.0000'), quantidadeCurta('1.5000'), quantidadeCurta('10')]).toEqual(['2', '1,5', '10']);
    expect(fraseDoCompletar(['inscricao_estadual', 'logradouro', 'numero', 'municipio', 'uf'])).toBe('IE, endereço e cidade');
  });
});

describe('N2 — a prova: cadastrar, escolher o subcentro, criar 4 parcelas com o PDF nas 4', () => {
  it('fornecedor pelo nome da Receita; payload 4 × 491,64 mensal; a NF (PDF) na parcela 1 e ligada às 4', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota(), { g: comoGravadores });
    await waitFor(() => expect(RECEITA).toHaveBeenCalledWith(CNPJ));
    await waitFor(() => expect(screen.getByTestId('nota-bloco-fornecedor').textContent).toContain('completo pela Receita'));
    fireEvent.click(screen.getByTestId('nota-cadastrar-fornecedor'));
    await waitFor(() => expect(props.onCriarFornecedor).toHaveBeenCalledWith('AGRO SINTETICA INSUMOS AGROPECUARIOS LTDA', 'faz-1', '11.222.333/0004-24'));
    await waitFor(() => expect(consultas.completarCadastroPeloXml).toHaveBeenCalled());
    const emitente = consultas.completarCadastroPeloXml.mock.calls[0][2];
    expect([emitente.ie, emitente.endereco?.municipio, emitente.endereco?.uf]).toEqual(['280000001', 'Campo Grande', 'MS']);
    await waitFor(() => expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: subcentro'));
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-criar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const payload = g.gravar.mock.calls[0][0];
    expect(payload).toMatchObject({
      cliente_id: 'cli', fazenda_id: 'faz-1', valor_total: 1966.56, total_parcelas: 4, data_primeira_parcela: '2026-10-20', intervalo_meses: 1,
      data_competencia: '2026-09-15', tipo_operacao: '2-Saídas', plano_conta_id: 'pl-nut', favorecido_id: 'forn-novo', tipo_financiamento: 'pecuaria',
      /* P138 — fora da lavoura o payload vai SEM safra: o banco grava a da competencia na criacao (`trg_safra_da_competencia`) */
      safra_id: null, conta_bancaria_id: null,
    });
    expect(payload.parcelas).toBeUndefined();
    expect(g.parcelas).toHaveBeenCalledWith('fin-1');
    const [, parcelas, pendentes] = g.documentosDoParcelamento.mock.calls[0];
    expect(parcelas).toHaveLength(4);
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0].parcela).toBeNull();
    expect(pendentes[0].arquivo?.type).toBe('application/pdf');
    expect(pendentes[0].arquivo?.name).toBe('000.000.937.pdf');
    expect(pendentes[0].payload).toMatchObject({ especie: 'nf', numero: '000.000.937', serie: '10', chaveAcesso: '50260911222333000424550100000009371217538298', dataEmissao: '2026-09-15', valorDocumento: 1966.56 });
    expect(props.onClose).toHaveBeenCalled();
    expect(props.gravarItens).toHaveBeenCalledTimes(1);
    expect(props.gravarItens.mock.calls[0][0]).toBe('cli');
    expect(props.gravarItens.mock.calls[0][1].byteLength).toBeGreaterThan(0);
  });
  it('FIN-NOTA-PDF-01b — subcentro de lavoura: Safra (sugerida pela data) e Cultura (sem resposta até escolher); safra e cultura gravadas', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    /* NOTA-PREVIA-ATIVIDADE-01 — sem subcentro: a Atividade e a Safra pela data, as duas em "—" (nada de "só lavoura") */
    expect(screen.getByTestId('nota-atividade-valor').textContent).toBe('—');
    await escolherSubcentro('Insumos Lavoura');
    expect(screen.getByTestId('nota-safra').textContent).toContain('Safra * · Lavoura');
    await waitFor(() => expect(screen.getByTestId('nota-safra').textContent).toContain('Safra 26/27 Soja'));
    expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: cultura');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId('nota-cultura-gatilho'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Soja' }));
    await waitFor(() => expect(screen.getByTestId('nota-criar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(g.gravar).toHaveBeenCalled());
    expect(g.gravar.mock.calls[0][0]).toMatchObject({ plano_conta_id: 'pl-ins', safra_id: 's-soja', cultura: 'soja', total_parcelas: 4 });
  });
  /* NOTA-PREVIA-ATIVIDADE-01 (o caso da Elos, sintetico): o subcentro de PECUARIA nao vira lavoura na tela — a atividade aparece (so'
     leitura) e a safra pela data. P138: e' a do BANCO (a tela pergunta), e quem a grava e' o banco: o payload vai sem safra */
  it('subcentro de pecuária: "Atividade · Pecuária" e a safra 26/27-Pec pela data (do banco) — o banco a grava; sem os campos de lavoura', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-atividade-valor').textContent).toBe('Pecuária'));
    await waitFor(() => expect(screen.getByTestId('nota-safra-pela-data-valor').textContent).toBe('26/27-Pec'));
    expect(screen.queryByTestId('nota-safra')).toBeNull();
    expect(screen.queryByTestId('nota-cultura')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('nota-criar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(g.gravar).toHaveBeenCalled());
    expect(g.gravar.mock.calls[0][0]).toMatchObject({ plano_conta_id: 'pl-nut', safra_id: null, cultura: null });
  });
  it('"Todas (rateia)" é uma resposta: a cultura vai nula (rateia), sem o "Falta:"', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await escolherSubcentro('Insumos Lavoura');
    fireEvent.keyDown(await screen.findByTestId('nota-cultura-gatilho'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Todas (rateia)' }));
    await waitFor(() => expect(screen.getByTestId('nota-criar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(g.gravar).toHaveBeenCalled());
    expect(g.gravar.mock.calls[0][0]).toMatchObject({ safra_id: 's-soja', cultura: null });
  });
});

/* ═══ NOTA-FAZENDA-PELA-IE-01 — a fazenda pela nota: a IE do destinatario; sem IE gravada, o nome no endereco ("FAZ SINTETICA, S/N") ═══ */
describe('N10 — a fazenda pela nota', () => {
  const SEM_IE = [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: null }, { id: 'faz-2', nome: 'Faz. Sintetica Dois', ie: null }];
  it('pela IE: "Fazenda · pela IE" e nada a gravar', async () => {
    abrir(montarNota({ fornecedores: [FORN] }));
    expect(screen.getByTestId('nota-fazenda-origem').textContent).toBe('Fazenda · pela IE');
    await waitFor(() => expect(consultas.iePorFazenda).toHaveBeenCalled());
    expect(screen.queryByTestId('nota-gravar-ie')).toBeNull();
  });
  it('sem IE gravada: a fazenda pelo endereço ("confira", âmbar) e "Gravar a IE … nesta fazenda" — campo · hoje · da nota, a prévia, grava', async () => {
    consultas.iePorFazenda.mockResolvedValue({});
    abrir(montarNota({ fornecedores: [FORN], fazendasDaLeitura: SEM_IE }));
    const origem = screen.getByTestId('nota-fazenda-origem');
    expect(origem.textContent).toBe('Fazenda · pelo endereço, confira');
    expect(origem.className).toContain('text-amber-800');
    fireEvent.click(await screen.findByTestId('nota-gravar-ie'));
    expect(screen.getByTestId('nota-gravar-ie').textContent).toBe('Gravar a IE 280000002 nesta fazenda');
    const modal = await screen.findByTestId('gravar-ie-fazenda');
    expect(within(modal).getByTestId('gravar-ie-linha').textContent).toBe('Inscrição estadual(vazia)280000002');
    await waitFor(() => expect(screen.getByTestId('gravar-ie-previa').textContent).toContain('passa a ter a IE 280000002'));
    expect(consultas.gravarIeDaFazenda).toHaveBeenCalledWith('faz-1', '280000002', expect.anything(), true, 'cli');
    fireEvent.click(screen.getByTestId('gravar-ie-confirmar'));
    await waitFor(() => expect(consultas.gravarIeDaFazenda).toHaveBeenCalledWith('faz-1', '280000002', expect.anything(), false, 'cli'));
    await waitFor(() => expect(screen.queryByTestId('nota-gravar-ie')).toBeNull());
    consultas.iePorFazenda.mockResolvedValue({ 'faz-1': '280000002' });
  });
  it('a fazenda já tem OUTRA IE: só o aviso — nunca oferece trocar', async () => {
    consultas.iePorFazenda.mockResolvedValue({ 'faz-1': '281111119' });
    abrir(montarNota({ fornecedores: [FORN], fazendasDaLeitura: SEM_IE }));
    expect((await screen.findByTestId('nota-ie-diverge')).textContent).toBe('Faz. Sintetica tem outra IE (281111119) · a nota traz 280000002');
    expect(screen.queryByTestId('nota-gravar-ie')).toBeNull();
    consultas.iePorFazenda.mockResolvedValue({ 'faz-1': '280000002' });
  });
});

describe('N3 — o que barra', () => {
  it('a segunda leitura da mesma nota: barrada, com o link para a que já existe', () => {
    const onde: OcorrenciaDaNota = { origem: 'lancamento', documentoId: 'd1', lancamentoId: 'l9', operacaoId: null, operacaoTipo: null, numero: '000.000.937', descricao: 'NF 937 · compra', data: '2026-09-15', valor: 491.64 };
    const props = abrir(montarNota({ ocorrencias: [onde], fornecedores: [FORN] }));
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('Nota já registrada neste cliente');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
    fireEvent.click(screen.getByTestId('nota-abrir-registrada'));
    expect(props.onAbrirRegistrada).toHaveBeenCalledWith(onde);
  });
  it('a chave não confere com o número lido: o campo vermelho, nada é criado', () => {
    const paginas = PAGINAS_DANFE_SINTETICO.map((p) => p.map((it) => (it.str === 'Nº 000.000.937' ? { ...it, str: 'Nº 000.000.938' } : it)));
    abrir(montarNota({ paginas, fornecedores: [FORN] }));
    expect(screen.getByTestId('nota-chave').textContent).toBe('chave não confere: nº');
    expect(screen.getByTestId('nota-numero').innerHTML).toContain('text-red-700');
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('A chave não confere');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
  });
  /* NOTA-AVULSA-890-01 — a NF-e avulsa (serie 890–899): a chave traz o CNPJ do ORGAO emissor; o emitente e' o CPF do produtor */
  it('nota AVULSA (série 890): não trava; "CPF" no rótulo, sem vermelho; e o aviso da remessa de entrega futura', () => {
    abrir(montarNota({ paginas: danfeSinteticoAvulsa() }));
    expect(screen.getByTestId('nota-chave').textContent).toBe('chave confere: nº, série e mês · nota avulsa');
    expect(screen.queryByTestId('nota-bloqueio')).toBeNull();
    const doc = screen.getByTestId('nota-documento-emitente');
    expect(doc.textContent).toBe('CPF111.444.777-35');
    expect(doc.innerHTML).not.toContain('text-red-700');
    expect(screen.getByTestId('nota-aviso-remessa').textContent).toBe('Remessa de entrega futura: confira se a nota da venda futura (originária) já foi lançada — esta pode ser só a entrega. A nota cita a originária nº 123.456.');
  });
  it('a nota COMUM com o CNPJ da chave trocado continua barrada (e o vermelho no documento)', () => {
    abrir(montarNota({ paginas: danfeSinteticoAvulsa({ serie: '10' }) }));
    expect(screen.getByTestId('nota-chave').textContent).toBe('chave não confere: CNPJ');
    expect(screen.getByTestId('nota-documento-emitente').innerHTML).toContain('text-red-700');
    expect(screen.getByTestId('nota-bloqueio').textContent).toContain('A chave não confere com o lido (CNPJ). Nada será criado.');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
  });
  it('venda comum: sem aviso de remessa', () => {
    abrir(montarNota({ fornecedores: [FORN] }));
    expect(screen.queryByTestId('nota-aviso-remessa')).toBeNull();
  });
});

describe('N4 — "Atualizar este": o lançamento aberto do mesmo fornecedor com o valor da parcela', () => {
  it('mostra qual, pede confirmação, anexa a NF às parcelas dele e grava o número só onde está vazio', async () => {
    consultas.lancamentosAbertosComValor.mockResolvedValue([
      { id: 'l-ext', vencimento: '2026-10-20', competencia: '2026-09-15', descricao: 'Compra do extrato', valorCent: 49164, financiamentoId: 'fin-velho', numeroDocumento: null },
    ]);
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    expect(screen.getByTestId('nota-bloco-fornecedor').textContent).toContain('cadastrado');
    const faixa = await screen.findByTestId('nota-atualizar-faixa');
    expect(faixa.textContent).toContain('20/10/2026 · Compra do extrato · R$ 491,64');
    expect(consultas.lancamentosAbertosComValor).toHaveBeenCalledWith('cli', 'f1', [196656, 49164, 49164, 49164, 49164]);
    fireEvent.click(screen.getByTestId('nota-atualizar-este'));
    expect(g.documentosDoParcelamento).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('nota-confirmar-atualizar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.gravar).not.toHaveBeenCalled();
    expect(g.parcelas).toHaveBeenCalledWith('fin-velho');
    expect(g.documentosDoParcelamento.mock.calls[0][2][0].arquivo?.type).toBe('application/pdf');
    expect(g.numeroNoLancamento).toHaveBeenCalledWith('cli', ['lanc-1', 'lanc-2', 'lanc-3', 'lanc-4'], '937');
  });
});

describe('N5 — o "+ Da nota": um PDF só, lido, abre a nota direto', () => {
  it('lerNota (PDF) -> onAbrirNota com a nota, o arquivo como application/pdf', async () => {
    const nota = montarNota();
    leitura.lerNota.mockResolvedValue(nota.lido);
    const onAbrirNota = vi.fn();
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'faz-1', nome: 'Faz. Sintetica' }]} fornecedores={[]}
      onAbrirLancamento={vi.fn()} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    const pdf = new File([new TextEncoder().encode('%PDF-1.4 x')], '000.000.937.pdf', { type: 'application/pdf' });
    Object.defineProperty(pdf, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4 x').buffer });
    fireEvent.change(screen.getByTestId('xml-input'), { target: { files: [pdf] } });
    await waitFor(() => expect(onAbrirNota).toHaveBeenCalled());
    const [paraLancar] = onAbrirNota.mock.calls[0];
    expect(paraLancar.arquivo.type).toBe('application/pdf');
    expect(paraLancar.doXml.proposta.parcelamento).toEqual({ tipo: 'parcelado', parcelas: 4, primeiroVencimento: '2026-10-20' });
    expect(paraLancar.doXml.proposta.fazendaId).toBe('faz-1');
  });
});

describe('N6 — FIN-NOTA-PDF-01b: nota de UMA parcela e nota SEM duplicata criam UM lançamento no próprio modal', () => {
  it('uma parcela: "Criar lançamento" com o vencimento da duplicata; a nota anexada ao lançamento', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores });
    expect(screen.getByTestId('nota-criar').textContent).toBe('Criar lançamento');
    expect(screen.getByTestId('nota-vencimento').textContent).toContain('da duplicata');
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-criar')).toBeEnabled());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(g.lancamento).toHaveBeenCalled());
    expect(g.lancamento.mock.calls[0][0]).toMatchObject({ valor: 1966.56, data_vencimento: '2026-10-20', status_transacao: 'programado', plano_conta_id: 'pl-nut',
      favorecido_id: 'f1', fazenda_id: 'faz-1', numero_documento: '937', tipo_documento: 'Nota Fiscal' });
    expect(g.gravar).not.toHaveBeenCalled();
    expect(g.documentosDoLancamento.mock.calls[0][1]).toBe('lanc-unico');
    expect(g.documentosDoLancamento.mock.calls[0][2][0].arquivo?.type).toBe('application/pdf');
  });
  it('sem duplicata (o molde do caso de 21/10): vencimento = emissão, em âmbar, editável', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { g: comoGravadores });
    expect(screen.getByTestId('nota-vencimento').textContent).toContain('nota sem duplicata: confira o vencimento');
    expect((within(screen.getByTestId('nota-vencimento')).getByRole('textbox') as HTMLInputElement).value).toBe('29/09/2026');
    await escolherSubcentro('Nutrição Engorda');
    fireEvent.click(await screen.findByTestId('nota-criar'));
    await waitFor(() => expect(g.lancamento).toHaveBeenCalled());
    expect(g.lancamento.mock.calls[0][0]).toMatchObject({ valor: 9583, data_vencimento: '2026-09-29', numero_documento: '3241' });
  });
});

describe('N7 — o caso de 21/10 16h49: NADA ESCOLHIDO NO MODAL SE PERDE no caminho para o Novo lançamento', () => {
  it('conta e fazenda escolhidas (e subcentro, fornecedor, vencimento, documento, itens, o PDF) chegam ao Novo lançamento', async () => {
    const props = abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }));
    fireEvent.click(within(screen.getByTestId('nota-bloco-lancamento')).getByRole('button', { name: /Nenhuma/ }));
    fireEvent.click(await screen.findByText('Sicredi Lavoura'));
    fireEvent.click(within(screen.getByTestId('nota-bloco-lancamento')).getByRole('button', { name: /Faz\. Sintetica/ }));
    fireEvent.click(await screen.findByText('Faz. Sintetica Dois'));
    await escolherSubcentro('Nutrição Engorda');
    fireEvent.click(screen.getByTestId('nota-abrir-no-lancamento'));
    expect(props.onAbrirNoLancamento).toHaveBeenCalledTimes(1);
    const prefill = props.onAbrirNoLancamento.mock.calls[0][0];
    expect(prefill).toMatchObject({
      conta_bancaria_id: 'sic', fazenda_id: 'faz-2', status_transacao: 'programado', plano_conta_id: 'pl-nut', subcentro: 'Nutrição Engorda',
      favorecido_id: 'f1', data_vencimento: '2026-09-29', valor: 9583, numero_documento: '3241', tipo_documento: 'Nota Fiscal', data_competencia: '2026-09-29',
    });
    /* P133 — a descrição é só dos produtos; o número da nota vai no documento (numero_documento acima) */
    expect(prefill.descricao).not.toContain('NF 3.241');
    expect(prefill.descricao).toContain('POSTE DE CONCRETO SINTETICO 9M');
    expect(prefill.doXml.arquivo.type).toBe('application/pdf');
    expect(prefill.doXml.proposta.favorecidoId).toBe('f1');
  });
});

describe('N8 — FIN-NOTA-PDF-01b: "Atualizar e parcelar" (o à vista existente vira 1/4 + 3 novas)', () => {
  it('aberto de R$ 1.966,56: a RPC recebe o existente e a lista 4 × 491,64; a nota em todas as parcelas', async () => {
    consultas.lancamentosAbertosComValor.mockResolvedValue([
      { id: 'l-avista', vencimento: '2026-09-20', competencia: '2026-09-15', descricao: 'Compra do extrato', valorCent: 196656, financiamentoId: null, numeroDocumento: null, pago: false },
    ]);
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    const botao = await screen.findByTestId('nota-atualizar-este');
    expect(botao.textContent).toBe('Atualizar e parcelar');
    await escolherSubcentro('Nutrição Engorda');
    fireEvent.click(screen.getByTestId('nota-atualizar-este'));
    expect((await screen.findByTestId('nota-confirmar-texto')).textContent).toContain('vira a parcela 1/4');
    fireEvent.click(screen.getByTestId('nota-confirmar-atualizar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    const [alvo, payload] = g.parcelarExistente.mock.calls[0];
    expect(alvo).toBe('l-avista');
    expect(payload.parcelas).toEqual([1, 2, 3, 4].map((numero, i) => ({ numero, data_vencimento: ['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'][i], valor: 491.64 })));
    expect(payload).toMatchObject({ valor_total: 1966.56, plano_conta_id: 'pl-nut', favorecido_id: 'f1' });
    expect(g.gravar).not.toHaveBeenCalled();
    expect(g.parcelas).toHaveBeenCalledWith('fin-velho');
    expect(g.documentosDoParcelamento.mock.calls[0][2][0].arquivo?.type).toBe('application/pdf');
    expect(props.gravarItens).toHaveBeenCalledTimes(1);
  });
  it('PAGO com valor diferente da parcela 1: a diferença em R$ e a decisão (o valor pago cobre a nota: só anexar)', async () => {
    consultas.lancamentosAbertosComValor.mockResolvedValue([
      { id: 'l-pago', vencimento: '2026-09-20', competencia: '2026-09-15', descricao: 'Pago no extrato', valorCent: 196656, financiamentoId: null, numeroDocumento: null, pago: true },
    ]);
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await escolherSubcentro('Nutrição Engorda');
    fireEvent.click(await screen.findByTestId('nota-atualizar-este'));
    const texto = ((await screen.findByTestId('nota-confirmar-texto')).textContent ?? '').replace(/\u00a0/g, ' ');
    expect(texto).toContain('Já está pago com R$ 1.966,56; a parcela 1 da nota é R$ 491,64 (diferença R$ 1.474,92). O valor pago não muda.');
    expect(screen.queryByTestId('nota-confirmar-atualizar')).toBeNull();
    fireEvent.click(screen.getByTestId('nota-so-anexar'));
    await waitFor(() => expect(g.documentosDoLancamento).toHaveBeenCalled());
    expect(g.parcelarExistente).not.toHaveBeenCalled();
  });
});

describe('N9 — NOTA-FORNECEDOR-DUPLICA-01: o cadastro sem CNPJ e o CNPJ ja\' cadastrado', () => {
  const SEM_DOC: FornecedorV2 = { ...FORN, id: 'semdoc', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: null };
  it('achado pelo NOME entre os sem CNPJ: "sem CNPJ · 3 lanç. · último", "Completar com o CNPJ" (nao cadastra outro); depois, "cadastrado"', async () => {
    abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
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
    abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
    fireEvent.click(screen.getByTestId('nota-cadastrar-outro'));
    expect(await screen.findByTestId('nota-cadastrar-fornecedor')).toBeTruthy();
  });
  it('o CNPJ ja\' e\' de um cadastro (conferido no banco antes de criar): a frase e "Usar este"; nada criado', async () => {
    consultas.fornecedorPeloDocumento.mockResolvedValueOnce({ id: 'ja', nome: 'Cadastro Sintetico Existente', ativo: true });
    const props = abrir(montarNota());
    fireEvent.click(screen.getByTestId('nota-cadastrar-fornecedor'));
    expect((await screen.findByTestId('nota-conflito')).textContent).toContain('Cadastro Sintetico Existente');
    expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('CNPJ já cadastrado');
    expect(props.onCriarFornecedor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('nota-usar-este'));
    await waitFor(() => expect(screen.getByTestId('nota-chip-fornecedor').textContent).toBe('cadastrado'));
    expect(screen.queryByTestId('nota-cadastrar-fornecedor')).toBeNull();
  });
  it('a nota reaberta RELE^ com a lista de agora: o cadastro criado depois da leitura vira "cadastrado" (nao oferece criar de novo)', () => {
    const lidaAntes = montarNota();                       // lida quando ainda nao havia cadastro
    expect(lidaAntes.doXml.resolucao.achadoPor).toBeNull();
    abrir(lidaAntes, { fornecedores: [FORN] });           // o cadastro com o CNPJ existe agora
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
  valorCent: 49164, status, conciliado: status === 'realizado', financiamentoId: 'fin-antigo', numeroDocumento: null,
  fornecedorId: LINEAGRO_SEM_CNPJ, fornecedorNome: 'Agro Sintetica Insumos SA', fornecedorPor: 'nome',
  parcelas: [{ n, difCent: 0, difDias: 0 }], por: ['valor'], cancelado: false, ...extra,
});
const QUATRO = [jaLancado(1, '2026-10-20', 'realizado'), jaLancado(2, '2026-11-20', 'realizado'), jaLancado(3, '2026-12-20', 'realizado', { valorCent: 49165, parcelas: [{ n: 3, difCent: 1, difDias: 0 }] }),
  jaLancado(4, '2027-01-20', 'programado')];

describe('NOTA-JA-LANCADA-01 — a nota que ja\' esta\' lancada', () => {
  it('reconhece as 4 (3 pagas + 1 programada, cadastro sem CNPJ parecido): o bloco no lugar das parcelas, "Anexar a nota a estes 4"; nada e\' criado', async () => {
    consultas.notaJaLancada.mockResolvedValue(QUATRO);
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    const bloco = await screen.findByTestId('nota-ja-lancada');
    expect(within(bloco).getAllByTestId('nota-ja-lancada-linha')).toHaveLength(4);
    expect(screen.queryByTestId('nota-criar')).toBeNull();
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent).toContain('4 de 4 parcelas');
    const pedido = consultas.notaJaLancada.mock.calls[0][1] as { parcelas: { n: number; vencimento: string; valorCent: number }[]; chave: string };
    expect(pedido.parcelas).toEqual([1, 2, 3, 4].map((n, i) => ({ n, vencimento: ['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'][i], valorCent: 49164 })));
    expect(pedido.chave).toBe('50260911222333000424550100000009371217538298');
    const botao = screen.getByTestId('nota-anexar-ja-lancados');
    expect(botao.textContent).toBe('Anexar a nota a estes 4');
    fireEvent.click(botao);
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
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
  it('achou 3 de 4: a que falta aparece em ambar; "Anexar e criar a que falta" cria SO\' a 4/4 (valor e vencimento da nota) e anexa a nota as 4', async () => {
    consultas.notaJaLancada.mockResolvedValue(QUATRO.slice(0, 3));
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await screen.findByTestId('nota-ja-lancada');
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent).toContain('faltam 4/4');
    expect(screen.getByTestId('nota-anexar-ja-lancados')).toBeDisabled();   // falta o subcentro para criar a que falta
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-anexar-ja-lancados')).toBeEnabled());
    expect(screen.getByTestId('nota-anexar-ja-lancados').textContent).toBe('Anexar e criar a que falta');
    fireEvent.click(screen.getByTestId('nota-anexar-ja-lancados'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.lancamento).toHaveBeenCalledTimes(1);
    expect(g.lancamento.mock.calls[0][0]).toMatchObject({ valor: 491.64, data_vencimento: '2027-01-20', favorecido_id: 'f1', plano_conta_id: 'pl-nut' });
    expect(g.documentosDoParcelamento.mock.calls[0][1].map((x) => x.lancamentoId)).toEqual(['velho-1', 'velho-2', 'velho-3', 'lanc-unico']);
    expect(g.gravar).not.toHaveBeenCalled();
  });
  it('fornecedor diferente: "Trocar o fornecedor" so\' marcando — desmarcado nao troca; marcado troca os 4 pela funcao do lote', async () => {
    consultas.notaJaLancada.mockResolvedValue(QUATRO);
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores, fornecedores: [FORN] });
    const caixa = await screen.findByTestId('nota-trocar-fornecedor');
    expect(caixa.textContent).toContain('Trocar o fornecedor para Agro Sintetica');
    fireEvent.click(within(caixa).getByRole('checkbox'));
    fireEvent.click(screen.getByTestId('nota-anexar-ja-lancados'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.trocarFornecedor).toHaveBeenCalledWith('cli', ['velho-1', 'velho-2', 'velho-3', 'velho-4'], 'f1', expect.stringContaining('fornecedor da'));
  });
  it('"Criar mesmo assim" pede o motivo; o parcelamento nasce com o motivo na observacao', async () => {
    consultas.notaJaLancada.mockResolvedValue(QUATRO);
    const { g, comoGravadores } = gravadoresFalsos();
    const props = abrir(montarNota({ fornecedores: [FORN] }), { g: comoGravadores });
    await screen.findByTestId('nota-ja-lancada');
    await escolherSubcentro('Nutrição Engorda');
    fireEvent.click(screen.getByTestId('nota-criar-mesmo-assim'));
    expect(screen.getByTestId('nota-mesmo-assim-confirmar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('nota-mesmo-assim-motivo'), { target: { value: 'outra compra igual no mesmo dia' } });
    fireEvent.click(screen.getByTestId('nota-mesmo-assim-confirmar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.gravar.mock.calls[0][0].observacao).toContain('outra compra igual no mesmo dia');
    expect(g.documentosDoParcelamento.mock.calls[0][1].map((x) => x.lancamentoId)).toEqual(['lanc-1', 'lanc-2', 'lanc-3', 'lanc-4']);
  });
  /* NOTA-CONTAS-NA-CRIACAO-01 C (P75) — o molde do Agnaldo (23/10): a nota de UMA parcela (1.966,56) ja' lancada como 491,64 com o numero
     escrito de outro jeito ("NF_000.000.937"): achada pelo numero, e' "?/4" — nunca "falta" a nota inteira */
  it('C — achada em PARCELA (valor x 4 = a nota): "?/4" com a conta no title, a frase "achada 1 de 4" e nada de criar a que falta', async () => {
    consultas.notaJaLancada.mockResolvedValue([jaLancado(1, '2026-10-20', 'agendado', { parcelas: [], por: ['numero'], numeroDocumento: 'NF_000.000.937', financiamentoId: null })]);
    abrir(montarNota({ fornecedores: [FORN], umaParcela: true }));
    const bloco = await screen.findByTestId('nota-ja-lancada');
    const linhas = within(bloco).getAllByTestId('nota-ja-lancada-linha');
    expect(linhas).toHaveLength(1);
    const parc = within(linhas[0]).getByTestId('nota-ja-lancada-parc');
    expect(parc.textContent).toBe('?/4');
    expect(parc.getAttribute('title')).toBe('parcela ? de 4 da nota: 4 × R$ 491,64 = R$ 1.966,56 (qual das 4, a nota não diz)');
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent).toBe('Esta nota parece já lançada em parcelas: achada 1 de 4 (R$ 491,64 cada). Nada será criado em dobro.');
    expect(screen.queryByTestId('nota-criar-faltam')).toBeNull();
    expect(screen.getByTestId('nota-anexar-ja-lancados').textContent).toBe('Anexar a nota a este');
  });
  /* NOTA-CONTAS-NA-CRIACAO-01 D (P76) — os lancamentos antigos da nota foram CANCELADOS (o caso de 23/10): aparecem cinza, no fim, com o
     selo, e nunca contam */
  const CANCELADOS = [jaLancado(1, '2026-10-20', 'programado', { id: 'canc-1', cancelado: true, parcelas: [], por: ['chave'] }),
    jaLancado(2, '2026-11-20', 'agendado', { id: 'canc-2', cancelado: true, parcelas: [], por: ['numero', 'chave'] })];
  it('D — com os vivos: os 2 cancelados no FIM, com o selo "cancelado" (nunca o status antigo); a frase e o Anexar contam so\' os 4', async () => {
    consultas.notaJaLancada.mockResolvedValue([...CANCELADOS, ...QUATRO]);
    abrir(montarNota({ fornecedores: [FORN] }));
    const bloco = await screen.findByTestId('nota-ja-lancada');
    expect(within(bloco).getAllByTestId('nota-ja-lancada-linha')).toHaveLength(4);
    const linhas = within(bloco).getAllByRole('row').slice(1);
    expect(linhas.slice(4).map((r) => r.getAttribute('data-testid'))).toEqual(['nota-ja-lancada-cancelado', 'nota-ja-lancada-cancelado']);
    expect(within(linhas[4]).getByTestId('nota-selo-cancelado').textContent).toBe('cancelado');
    expect(linhas[4].textContent).not.toContain('programado');
    expect(linhas[5].textContent).not.toContain('agendado');
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent).toContain('4 de 4 parcelas');
    expect(screen.getByTestId('nota-anexar-ja-lancados').textContent).toBe('Anexar a nota a estes 4');
  });
  it('D — so\' cancelados: a nota NAO esta\' lancada — "Criar 4 parcelas" e o rodape diz "Há 2 lançamentos cancelados desta nota (não contam)"', async () => {
    consultas.notaJaLancada.mockResolvedValue(CANCELADOS);
    abrir(montarNota({ fornecedores: [FORN] }));
    expect((await screen.findByTestId('nota-so-cancelados')).textContent).toBe(' Há 2 lançamentos cancelados desta nota (não contam).');
    expect(screen.queryByTestId('nota-ja-lancada')).toBeNull();
    expect(screen.getByTestId('nota-criar').textContent).toBe('Criar 4 parcelas');
  });
  it('nada achado: o de sempre ("Criar 4 parcelas"), sem o bloco', async () => {
    abrir(montarNota({ fornecedores: [FORN] }));
    await waitFor(() => expect(consultas.notaJaLancada).toHaveBeenCalled());
    expect(screen.queryByTestId('nota-ja-lancada')).toBeNull();
    expect(screen.getByTestId('nota-criar').textContent).toBe('Criar 4 parcelas');
  });
});

/* ═══ NOTA-FORNECEDOR-COMPARAR-01 — "Completar cadastro" mostra como esta' e o que muda; so' o marcado e' gravado ═══ */
describe('NOTA-FORNECEDOR-COMPARAR-01 — comparar antes de atualizar o cadastro', () => {
  const SEM_DOC: FornecedorV2 = { ...FORN, id: 'semdoc', nome: 'Agro Sintetica Insumos Agropecuarios Ltda', cpf_cnpj: null };
  const abrirComparar = async (hoje: Record<string, string | null>) => {
    consultas.cadastroParaComparar.mockResolvedValue(hoje);
    abrir(montarNota({ fornecedores: [SEM_DOC] }), { fornecedores: [SEM_DOC] });
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
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    abrir(montarNota({ fornecedores: [FORN], umaParcela: true }));
    const bloco = await screen.findByTestId('nota-ja-lancada');
    const parcs = within(bloco).getAllByTestId('nota-ja-lancada-parc').map((x) => x.textContent);
    expect(parcs).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(screen.getByTestId('nota-ja-lancada-frase').textContent)
      .toBe('Esta nota parece já lançada em parcelas: achadas 4 de 4 · soma R$ 1.966,52 · nota R$ 1.966,56 · diferença R$ 0,04. Nada será criado em dobro.');
    expect(screen.queryByTestId('nota-criar-faltam')).toBeNull();
    /* P96a — as 4 achadas inteiras: o gesto é JUNTAR (e anexar); "Só anexar a nota" fica na confirmação */
    expect(screen.getByTestId('nota-juntar-soltas').textContent).toBe('Juntar as 4 e anexar');
  });
});

/* P96a — JUNTAR AS N SOLTAS como parcelas desta nota (o molde do P95: 4 irmãs, soma 1.966,52 × nota 1.966,56). A função do banco é falsa:
   simular devolve o efeito por mês; gravar devolve ok. A nota se anexa pelo MESMO caminho do "Anexar". */
describe('P96a — juntar as parcelas soltas na prévia da nota', () => {
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
  const abrirJuntar = async () => {
    fireEvent.click(await screen.findByTestId('nota-juntar-soltas'));
    const dialogo = await screen.findByTestId('nota-juntar-confirmar');
    await waitFor(() => expect(within(dialogo).getByTestId('nota-juntar-efeito').textContent).not.toContain('Calculando'));
    return dialogo;
  };

  it('J1 a confirmação: o resumo, a competência MARCADA por padrão e o efeito no DRE; "Juntar" grava com a emissão e anexa a nota às 4', async () => {
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    const { g, comoGravadores } = gravadoresFalsos();
    const { gj, juntar } = falsos();
    const props = abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    const dialogo = await abrirJuntar();
    expect(juntar).toHaveBeenCalledWith('cli', ['irma-1', 'irma-2', 'irma-3', 'irma-4'], '2026-09-15', true);
    expect(juntar).toHaveBeenCalledWith('cli', ['irma-1', 'irma-2', 'irma-3', 'irma-4'], null, true);
    expect(within(dialogo).getByTestId('nota-juntar-texto').textContent).toContain('Soma R$\u00a01.966,52 · nota R$\u00a01.966,56 · diferença R$\u00a00,04');
    expect(within(within(dialogo).getByTestId('nota-juntar-competencia')).getByRole('checkbox').getAttribute('data-state')).toBe('checked');
    expect(within(dialogo).getByTestId('nota-juntar-efeito').textContent)
      .toBe('Efeito no DRE: setembro +R$ 1.475,00; outubro, novembro e dezembro −1 parcela cada.');
    expect(juntar.mock.calls.some((c) => c[3] === false)).toBe(false);
    fireEvent.click(within(dialogo).getByTestId('nota-juntar-gravar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(juntar).toHaveBeenCalledWith('cli', ['irma-1', 'irma-2', 'irma-3', 'irma-4'], '2026-09-15', false);
    const [, parcelas] = g.documentosDoParcelamento.mock.calls[0];
    expect(parcelas.map((x) => x.lancamentoId)).toEqual(['irma-1', 'irma-2', 'irma-3', 'irma-4']);
  });
  it('J2 desmarcada: grava SEM a competência (o DRE não muda)', async () => {
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    const { comoGravadores } = gravadoresFalsos();
    const { gj, juntar } = falsos();
    const props = abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    const dialogo = await abrirJuntar();
    fireEvent.click(within(within(dialogo).getByTestId('nota-juntar-competencia')).getByRole('checkbox'));
    expect(within(dialogo).getByTestId('nota-juntar-efeito').textContent).toBe('A competência de cada uma fica como está: o DRE não muda.');
    fireEvent.click(within(dialogo).getByTestId('nota-juntar-gravar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(juntar).toHaveBeenCalledWith('cli', ['irma-1', 'irma-2', 'irma-3', 'irma-4'], null, false);
  });
  it('J3 "Só anexar a nota": nada se junta, a nota vai às 4', async () => {
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    const { g, comoGravadores } = gravadoresFalsos();
    const { gj, juntar } = falsos();
    const props = abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    const dialogo = await abrirJuntar();
    fireEvent.click(within(dialogo).getByTestId('nota-juntar-so-anexar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(juntar.mock.calls.some((c) => c[3] === false)).toBe(false);
    expect(g.documentosDoParcelamento).toHaveBeenCalledTimes(1);
  });
  it('J4 a competência recusada pelo banco (mês fechado): a caixinha sai desmarcada e apagada, com a frase; juntar sem ela segue', async () => {
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    const { comoGravadores } = gravadoresFalsos();
    const { gj } = falsos({ recusaComCompetencia: true });
    abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
    const dialogo = await abrirJuntar();
    const caixa = within(within(dialogo).getByTestId('nota-juntar-competencia')).getByRole('checkbox');
    await waitFor(() => expect(caixa.getAttribute('data-state')).toBe('unchecked'));
    expect(caixa).toBeDisabled();
    expect(within(dialogo).getByTestId('nota-juntar-efeito').textContent).toBe('O mês 10/2026 está fechado: reabra antes de mudar a competência.');
    expect(within(dialogo).getByTestId('nota-juntar-gravar')).not.toBeDisabled();
  });
  it('J5 a NF digitada à mão numa das 4 diverge: a frase e "Usar a nota lida" — troca SÓ com a confirmação (valor e emissão, com a versão)', async () => {
    consultas.notaJaLancada.mockResolvedValue(IRMAS);
    const { comoGravadores } = gravadoresFalsos();
    const doc: DocumentoDaParcela = { id: 'doc-4', lancamentoId: 'irma-4', versao: 2, especie: 'nf', numero: '937', chave: null, valorCent: 49164, emissao: '2026-10-10' };
    const { gj, editarDocumento } = falsos({ docs: [doc] });
    abrir(montarNota({ fornecedores: [FORN], umaParcela: true }), { g: comoGravadores, gj });
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
  const lista = (onAbrirNota = vi.fn()) => {
    render(<NovoDeXmlDialog open onClose={() => {}} clienteId="cli" fazendas={[{ id: 'faz-1', nome: 'Faz. Sintetica' }]} fornecedores={[FORN]}
      onAbrirLancamento={vi.fn()} onAbrirNota={onAbrirNota} lancadas={new Set()} />);
    return onAbrirNota;
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
  it('chave valida (colada com espacos): a linha segue lida — o emitente do cadastro pelo CNPJ; emissao e valor "—"; a busca pelo numero e CNPJ', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_NOTA_SEM_CHAVE });
    const onAbrirNota = lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    digitar(CHAVE.replace(/(\d{4})/g, '$1 '));
    await waitFor(() => expect(screen.getByTestId('xml-linha').getAttribute('data-situacao')).not.toBe('recusada'));
    const celulas = within(screen.getByTestId('xml-linha')).getAllByRole('cell').map((c) => c.textContent);
    /* a chave nao traz a IE do destinatario: a fazenda nao vem (o operador escolhe na previa) */
    expect(celulas.slice(0, 6)).toEqual(['000.000.937', '—', 'Agro Sintetica', '11.222.333/0004-24', '—', '—']);
    expect(consultas.notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ parcelas: [], numero: '937', chave: CHAVE, emitenteDocumento: '11222333000424' }));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    const [paraLancar] = onAbrirNota.mock.calls[0];
    expect([paraLancar.lido.pelaChave, paraLancar.doXml.proposta.favorecidoId, paraLancar.arquivo.type]).toEqual([true, 'f1', 'application/pdf']);
  });
  it('nota avulsa (serie 890): o CNPJ da chave e\' do fisco — nao acha o fornecedor por ele', async () => {
    leitura.lerNota.mockResolvedValue({ ok: false, origem: 'pdf', frase: FRASE_NOTA_SEM_CHAVE });
    const onAbrirNota = lista();
    soltar(pdf());
    await screen.findByTestId('xml-recusa-digitar');
    digitar(AVULSA);
    await waitFor(() => expect(screen.getByTestId('xml-linha').getAttribute('data-situacao')).not.toBe('recusada'));
    expect(consultas.notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ emitenteDocumento: '' }));
    fireEvent.click(screen.getByTestId('xml-abrir-lancamento'));
    expect(onAbrirNota.mock.calls[0][0].doXml.proposta.favorecidoId).toBeNull();
  });

  it('a previa pela chave: o chip, emissao e valor em ambar e pedidos; criar leva o que foi digitado', async () => {
    const r = notaDaChaveDigitada(CHAVE);
    if (r.ok === false) throw new Error(r.frase);
    const lido = lidoDaChave(r.nota, [{ largura: 595.28, altura: 841.89 }]);
    const resolucao = resolverEmitente(r.nota.emitente, [FORN], null);
    const p = proporLancamento({ nota: r.nota, avisosDoLeitor: lido.avisos, fazendas: [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: null });
    if (p.ok === false) throw new Error(p.frase);
    const bytes = new TextEncoder().encode('%PDF-1.4 escaneado').buffer;
    const arquivo = arquivoPdfDaNota(bytes, 'nota-sintetica.pdf');
    const { g, comoGravadores } = gravadoresFalsos();
    /* a fazenda ja' escolhida (a chave nao a traz; o teste e' sobre a emissao e o valor) */
    const props = abrir({ arquivo, bytes, lido, doXml: { proposta: { ...p.proposta, fazendaId: 'faz-1' }, emitenteNome: '', emitenteDocumento: CNPJ, emitente: r.nota.emitente, resolucao, ocorrencias: [], arquivo } },
      { fornecedores: [FORN], g: comoGravadores });
    expect(screen.getByTestId('nota-chave').textContent).toBe('Pela chave digitada · confira');
    expect(screen.getByTestId('nota-numero').textContent).toContain('000.000.937');
    await escolherSubcentro('Nutrição Engorda');
    expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: vencimento, emissão, valor');
    const emissao = screen.getByTestId('nota-emissao-campo');
    fireEvent.change(emissao, { target: { value: '06/09/2026' } });
    fireEvent.blur(emissao);
    const valor = within(screen.getByTestId('nota-valor-campo')).getByPlaceholderText('0,00');
    fireEvent.change(valor, { target: { value: '1.234,50' } });
    fireEvent.blur(valor);
    await waitFor(() => expect(screen.queryByTestId('nota-falta')).toBeNull());
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(props.onCriado).toHaveBeenCalled());
    expect(g.lancamento.mock.calls[0][0]).toMatchObject({ valor: 1234.5, data_competencia: '2026-09-06', data_vencimento: '2026-09-06' });
  });
});

/**
 * P74 — NOTA-CARTAO-PARCELADO-01: "Como foi pago?" (Duplicatas da nota | À vista | Cartão em N×). Nota SEM duplicata sintética (R$ 9.583,00,
 * emissão 29/09/2026) paga num cartão sintético em 4 × 2.395,75, 1ª fatura sugerida pelo dia mais frequente do cartão (10) → 10/10/2026.
 *   P1 abre em À vista (sem duplicata; "Duplicatas da nota (0)" apagado com a frase) e em Duplicatas quando a nota as traz
 *   P2 o seletor do cartão só tem contas do tipo cartão · P3 a 1ª fatura sugerida em âmbar, com o rótulo; a conta origem "pelo cartão"
 *   P4 criar grava as 4 pelo parcelamento da nota (cartão, competência = emissão, as faturas) e o PDF nas 4
 *   P5 sem histórico no cartão: a 1ª fatura vazia e obrigatória · P6 a busca de "já lançada" procura as parcelas do cartão
 *   P7 "No Novo lançamento" leva o cartão e as parcelas
 */
const CARTAO: ContaBancariaV2 = { id: 'elo', nome_conta: 'Cartão Elo Sintetico', banco: null, fazenda_id: 'faz-1', tipo_conta: 'cartao', codigo_conta: null,
  nome_exibicao: 'Cartão Elo Sintetico', agencia: null, numero_conta: null, conta_digito: null, aliases: null };
const COM_CARTAO = [...CONTAS, CARTAO];
/* o campo de texto do DatePicker da 1ª fatura (sem cast: o tipo se prova em runtime) */
function campoDaFatura(): HTMLInputElement {
  const el = within(screen.getByTestId('nota-cartao-fatura').closest('div') ?? document.body).getByRole('textbox');
  if (!(el instanceof HTMLInputElement)) throw new Error('a 1ª fatura não é um campo de texto');
  return el;
}
async function escolherComo(rotulo: string) {
  fireEvent.click(screen.getByTestId('nota-como-foi-pago'));
  fireEvent.click(await screen.findByRole('option', { name: rotulo }));
  /* o Select do Radix devolve o foco ao gatilho DEPOIS de fechar: espera, senão o próximo popover fecha com esse foco */
  await waitFor(() => expect(screen.getByTestId('nota-como-foi-pago').textContent).toBe(rotulo));
  await waitFor(() => expect(screen.getByTestId('nota-como-foi-pago')).toHaveFocus());
}
async function noCartao(n: string) {
  await escolherComo('Cartão em N×');
  fireEvent.click(within(screen.getByTestId('nota-cartao')).getByRole('button', { name: /Selecione o cartão/ }));
  fireEvent.click(await screen.findByText('Cartão Elo Sintetico'));
  fireEvent.change(screen.getByTestId('nota-cartao-parcelas'), { target: { value: n } });
}

describe('P74 — a nota paga no cartão em N vezes', () => {
  beforeEach(() => { cartaoNoBanco.diasDoCartao.mockResolvedValue([{ dia: 10, lancamentos: 409, ultimo: '2026-09-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-09-13' }]); });

  it('P1 sem duplicata abre em À vista ("Duplicatas da nota (0)" apagado, com a frase); com duplicatas, em Duplicatas', () => {
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { contas: COM_CARTAO });
    expect(screen.getByTestId('nota-como-foi-pago').textContent).toBe('À vista');
    fireEvent.click(screen.getByTestId('nota-como-foi-pago'));
    const dup = screen.getByTestId('nota-como-duplicatas');
    expect(dup.textContent).toBe('Duplicatas da nota (0)');
    expect(dup.getAttribute('data-disabled')).not.toBeNull();
    expect(dup.getAttribute('title')).toBe('A nota não traz duplicatas.');
  });
  it('P1 com duplicatas abre em "Duplicatas da nota (4)"', () => {
    abrir(montarNota(), { contas: COM_CARTAO });
    expect(screen.getByTestId('nota-como-foi-pago').textContent).toBe('Duplicatas (4)');
  });
  it('P2/P3 o cartão: só contas do tipo cartão; a 1ª fatura sugerida em âmbar; a conta origem pelo cartão', async () => {
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { contas: COM_CARTAO });
    await escolherComo('Cartão em N×');
    fireEvent.click(within(screen.getByTestId('nota-cartao')).getByRole('button', { name: /Selecione o cartão/ }));
    expect(await screen.findByText('Cartão Elo Sintetico')).toBeTruthy();
    expect(screen.queryAllByText('Sicredi Lavoura')).toHaveLength(0);
    fireEvent.click(screen.getByText('Cartão Elo Sintetico'));
    await waitFor(() => expect(screen.getByTestId('nota-cartao-rotulo-fatura').textContent).toBe('1ª fatura · sugerido (Elo Sintetico, dia 10)'), { timeout: 4000 });
    expect(cartaoNoBanco.diasDoCartao).toHaveBeenCalledWith('elo');
    /* P105 — o DatePicker copia o valor para o texto dele num efeito PRÓPRIO, um passo depois do rótulo: espera o campo também (a leitura
       logo depois do rótulo caía com a máquina carregada — "expected '' to be '10/10/2026'" no vitest completo) */
    await waitFor(() => expect(campoDaFatura().value).toBe('10/10/2026'), { timeout: 4000 });
    expect(campoDaFatura().className).toContain('border-amber-400');
    expect(screen.getByTestId('nota-conta-pelo-cartao').textContent).toBe('Cartão Elo Sintetico');
  });
  it('P4 criar: as 4 parcelas pelo parcelamento da nota, no cartão, com o PDF nas 4', async () => {
    const { g, comoGravadores } = gravadoresFalsos();
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { g: comoGravadores, contas: COM_CARTAO });
    await noCartao('4');
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-criar').textContent).toBe('Criar 4 parcelas'), { timeout: 4000 });
    expect(screen.getByTestId('nota-rodape').textContent).toContain('O PDF fica anexado às 4 parcelas como a NF 3.241 · 4 saídas no Cartão Elo Sintetico, uma em cada fatura.');
    fireEvent.click(screen.getByTestId('nota-criar'));
    await waitFor(() => expect(g.gravar).toHaveBeenCalled());
    expect(g.lancamento).not.toHaveBeenCalled();
    expect(g.gravar.mock.calls[0][0]).toMatchObject({ valor_total: 9583, total_parcelas: 4, data_primeira_parcela: '2026-10-10', conta_bancaria_id: 'elo',
      data_competencia: '2026-09-29', plano_conta_id: 'pl-nut' });
    await waitFor(() => expect(g.documentosDoParcelamento).toHaveBeenCalled());
    expect(g.documentosDoParcelamento.mock.calls[0][1]).toHaveLength(4);
  });
  it('P5 sem histórico no cartão: a 1ª fatura vazia e obrigatória', async () => {
    cartaoNoBanco.diasDoCartao.mockResolvedValue([]);
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { contas: COM_CARTAO });
    await noCartao('4');
    await escolherSubcentro('Nutrição Engorda');
    await waitFor(() => expect(screen.getByTestId('nota-falta').textContent).toBe('⚠ Falta: 1ª fatura'));
    expect(screen.getByTestId('nota-cartao-rotulo-fatura').textContent).toBe('1ª fatura');
    expect(screen.getByTestId('nota-criar')).toBeDisabled();
  });
  it('P6 a busca de "nota já lançada" procura as parcelas do cartão', async () => {
    abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { contas: COM_CARTAO });
    await noCartao('4');
    await waitFor(() => expect(consultas.notaJaLancada.mock.calls.some(([, e]) => JSON.stringify(e).includes('"valorCent":239575'))).toBe(true));
  });
  it('P7 "No Novo lançamento" leva o cartão e as 4 parcelas', async () => {
    const props = abrir(montarNota({ paginas: danfeSinteticoSemDuplicata(), fornecedores: [FORN] }), { contas: COM_CARTAO });
    await noCartao('4');
    await waitFor(() => expect(screen.getByTestId('nota-conta-pelo-cartao').textContent).toBe('Cartão Elo Sintetico'), { timeout: 4000 });
    await waitFor(() => expect(campoDaFatura().value).toBe('10/10/2026'), { timeout: 4000 });
    fireEvent.click(screen.getByTestId('nota-abrir-no-lancamento'));
    const prefill = props.onAbrirNoLancamento.mock.calls[0][0];
    expect(prefill.conta_bancaria_id).toBe('elo');
    expect(prefill.doXml.proposta.duplicatas.map((d: { valorCent: number }) => d.valorCent)).toEqual([239575, 239575, 239575, 239575]);
  });
});

/** P101 — abaixo de 1000px a prévia vira três abas (a 750×483 sobravam 21px às parcelas): Arquivo | Nota e fornecedor | Parcelas e lançamento. */
describe('P101 — a prévia numa janela estreita', () => {
  const largura = window.innerWidth;
  const janela = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  afterEach(() => { janela(largura); });
  it('abaixo de 1000px: as abas, cada uma com os seus blocos; a partir de 1000px, as duas colunas de sempre', () => {
    janela(800);
    const { unmount } = render(<QueryClientProvider client={new QueryClient()}><NotaFiscalDialog open clienteId="cli" clienteNome="NJ" nota={montarNota()}
      fazendas={FAZENDAS} contas={CONTAS} classificacoes={PLANO} safras={SAFRAS} fornecedores={[]} consultarReceita={RECEITA}
      onClose={vi.fn()} onCriado={vi.fn()} onAbrirNoLancamento={vi.fn()} onAbrirRegistrada={vi.fn()} onCriarFornecedor={vi.fn(async () => null)} gravarItens={vi.fn(async () => null)} /></QueryClientProvider>);
    const abas = screen.getByTestId('nota-abas');
    const visiveis = () => ['nota-bloco-arquivo', 'nota-bloco-nota', 'nota-bloco-fornecedor', 'nota-bloco-parcelas', 'nota-bloco-lancamento'].filter((t) => screen.queryByTestId(t));
    expect(visiveis()).toEqual(['nota-bloco-nota', 'nota-bloco-fornecedor']);
    fireEvent.click(within(abas).getByText('Parcelas e lançamento'));
    expect(visiveis()).toEqual(['nota-bloco-parcelas', 'nota-bloco-lancamento']);
    fireEvent.click(within(abas).getByText('Arquivo'));
    expect(visiveis()).toEqual(['nota-bloco-arquivo']);
    expect(screen.getByTestId('nota-criar')).toBeTruthy();   // o rodapé fica em todas
    unmount();
    janela(1200);
    abrir(montarNota());
    expect(screen.queryByTestId('nota-abas')).toBeNull();
    expect(visiveis()).toEqual(['nota-bloco-arquivo', 'nota-bloco-nota', 'nota-bloco-fornecedor', 'nota-bloco-parcelas', 'nota-bloco-lancamento']);
  });
});
