/**
 * FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado), com o DANFE SINTETICO (as posicoes do real, dados de teste).
 * A PROVA DO BRIEFING, na bancada: NF 937 -> fornecedor nao cadastrado -> 4 parcelas de 491,64 (20/10/2026 a 20/01/2027) = 1.966,56,
 * o PDF anexado as 4 (a NF na parcela 1, ligada a todas); a segunda leitura da mesma nota barrada; a chave que nao confere barra.
 * E o pedido do Gabriel: lancamento aberto do mesmo fornecedor com o valor -> "Atualizar este" (so' com confirmacao).
 * ⚠ Nenhum banco: os gravadores e as consultas sao falsos; o que se prova e' o que a tela mostra e o que ela manda gravar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: vi.fn(), storage: { from: () => ({}) } } }));
const consultas = vi.hoisted(() => ({
  camposQueOEmitenteCompleta: vi.fn(async (_c: string, _f: string, _e: unknown): Promise<string[]> => []),
  completarCadastroPeloXml: vi.fn(async (_c: string, _f: string, _e: { ie: string | null; endereco?: { municipio: string | null; uf: string | null } | null }): Promise<string | null> => null),
  gravarDocumentoNoCadastro: vi.fn(async (): Promise<string | null> => null),
  lancamentosAbertosComValor: vi.fn(async (_c: string, _f: string, _v: readonly number[]): Promise<unknown[]> => []),
  iePorFazenda: vi.fn(async (): Promise<Record<string, string>> => ({ 'faz-1': '280000002' })),
  fornecedorPeloNome: vi.fn(async (): Promise<string | null> => null),
  notaJaRegistrada: vi.fn(async (): Promise<unknown[]> => []),
  ultimaClassificacaoDoFornecedor: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => consultas);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
const leitura = vi.hoisted(() => ({ lerNota: vi.fn() }));
vi.mock('@/lib/financeiro/nfe/lerNota', () => leitura);

import { NotaFiscalDialog, fraseDoCompletar, quantidadeCurta, type NotaParaLancar } from './NotaFiscalDialog';
import { NovoDeXmlDialog, arquivoPdfDaNota } from './NovoDeXmlDialog';
import type { Gravadores } from './criarDaNota';
import type { RespostaDoCnpj } from '@/lib/fornecedores/consultaCnpj';
import type { PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';
import type { DocumentoPendente, ParcelaGravada } from '@/lib/financeiro/documentosPendentes';
import { notaDoDanfe, type ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import { proporLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { PAGINAS_DANFE_SINTETICO } from '@/lib/financeiro/nfe/__fixtures__/danfeSintetico';
import type { OcorrenciaDaNota } from '@/lib/financeiro/nfeConsultas';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  vi.clearAllMocks();
  consultas.camposQueOEmitenteCompleta.mockResolvedValue([]);
  consultas.lancamentosAbertosComValor.mockResolvedValue([]);
});

const FAZENDAS: Fazenda[] = [{ id: 'faz-1', nome: 'Faz. Sintetica', owner_id: 'u1', cliente_id: 'cli', codigo: null }];
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

function montarNota(opcoes: { paginas?: ItemDoDanfe[][]; fornecedores?: FornecedorV2[]; ocorrencias?: OcorrenciaDaNota[] } = {}): NotaParaLancar {
  const r = notaDoDanfe(opcoes.paginas ?? PAGINAS_DANFE_SINTETICO);
  if (r.ok === false) throw new Error(r.frase);
  const resolucao = resolverEmitente(r.nota.emitente, opcoes.fornecedores ?? [], null);
  const p = proporLancamento({ nota: r.nota, avisosDoLeitor: r.avisos, fazendas: [{ id: 'faz-1', nome: 'Faz. Sintetica', ie: '280000002' }], emitente: resolucao, favorecidoId: resolucao.propostoId, ultima: null });
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
  };
  const comoGravadores: Gravadores = g;
  return { g, comoGravadores };
}
const FORN: FornecedorV2 = {
  id: 'f1', nome: 'Agro Sintetica', cpf_cnpj: '11.222.333/0004-24', fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null,
  banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null, observacao_pagamento: null,
};

function abrir(nota: NotaParaLancar, extra: { fornecedores?: FornecedorV2[]; g?: Gravadores } = {}) {
  const onCriarFornecedor = vi.fn(async (nome: string, _faz: string | null, _doc?: string): Promise<FornecedorV2 | null> => ({ ...FORN, id: 'forn-novo', nome }));
  const props = {
    onClose: vi.fn(), onCriado: vi.fn(), onAbrirNoLancamento: vi.fn(), onAbrirRegistrada: vi.fn(), onCriarFornecedor,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaFiscalDialog open clienteId="cli" clienteNome="NJ" nota={nota} fazendas={FAZENDAS} contas={[]} classificacoes={PLANO}
        fornecedores={extra.fornecedores ?? []} gravadores={extra.g} consultarReceita={RECEITA} {...props} />
    </QueryClientProvider>,
  );
  return props;
}
async function escolherSubcentro(nome: string) {
  fireEvent.click(within(screen.getByTestId('nota-subcentro')).getByRole('button', { name: /Selecione o subcentro/ }));
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
  });
  it('subcentro de lavoura: não cria aqui (safra e cultura são do Novo lançamento)', async () => {
    abrir(montarNota({ fornecedores: [FORN] }));
    await escolherSubcentro('Insumos Lavoura');
    await waitFor(() => expect(screen.getByTestId('nota-no-lancamento').textContent).toContain('safra'));
    expect(screen.getByTestId('nota-abrir-no-lancamento')).toBeTruthy();
    expect(screen.queryByTestId('nota-criar')).toBeNull();
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
