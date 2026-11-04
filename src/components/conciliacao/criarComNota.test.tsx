/**
 * CONC-CRIAR-COM-NOTA-01 (Gabriel 03/11 22:04 e 04/11 06:28) — o "Criar lançamento" da linha do extrato aceita a NF, nos modais que já existem.
 * Fatia A: a aba Documentos do Novo pelo extrato (D1 = a: cria, depois o arquivo sobe no id que o `salvar` devolve; a estação só sabe AO FECHAR).
 * Fatia B: o "Ler a NF" do Documentos lê a nota e PREENCHE (competência = emissão; o extrato manda nas contas, no pagamento e no status);
 * nota ≠ extrato = cria com o valor da nota e abre o "Casar com o banco" de hoje; nota já lançada = o Casar de hoje com ela levada (o nº da NF
 * na linha); já conciliada = a frase, nada criado. Nota e fornecedor SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';
import type { LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { proporLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';
import type { DoXml } from '@/lib/financeiro/nfePrefill';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';

/** O que o `salvar` lê do formulário (o modal é falso aqui: entrega só isto). */
type FormDoTeste = Partial<LancamentoV2Form> & { valor: number };
interface PropsDoModal {
  prefill?: Record<string, unknown>;
  documentosAntesDeSalvar?: boolean;
  onLerNotaNoNovo?: (arquivo: File) => Promise<string | null>;
  onSave: (f: FormDoTeste) => Promise<boolean | string>;
  onClose: () => void;
}

const M = vi.hoisted(() => {
  const m: { props: PropsDoModal | null; rpc: ReturnType<typeof vi.fn>; criarComId: ReturnType<typeof vi.fn>; ler: ReturnType<typeof vi.fn>;
    busca: ReturnType<typeof vi.fn> } = { props: null, rpc: vi.fn(), criarComId: vi.fn(), ler: vi.fn(), busca: vi.fn() };
  return m;
});

vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => M.rpc(...a) } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { fazenda_id: 'faz-da-conta' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({
    contasBancarias: [{ id: 'conta-extrato', nome_conta: 'Banco Exemplo' }, { id: 'outra', nome_conta: 'Outro Banco' }],
    fornecedores: [], classificacoes: [], safras: [],
    loadContas: async () => {}, loadFornecedores: async () => {}, loadClassificacoes: async () => {}, loadSafras: async () => {},
    criarFornecedor: async () => null, criarLancamentoComId: (...a: unknown[]) => M.criarComId(...a),
  }),
  notificarLancamentosMudaram: () => {},
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: (p: PropsDoModal) => { M.props = p; return null; },
}));
vi.mock('@/components/financeiro-v2/NovoDeXmlDialog', () => ({ notaParaAPrevia: (...a: unknown[]) => M.ler(...a) }));
vi.mock('@/lib/financeiro/nfeConsultas', () => ({ notaJaLancada: (...a: unknown[]) => M.busca(...a) }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CriarLancamentoDaLinha, prefillDoExtratoComNota, oQueFazerComANota, type LevadoDaNota } from './CriarLancamentoDaLinha';
import { CasarComBancoModal } from '@/components/financeiro-v2/CasarComBancoModal';

/* a nota SINTÉTICA: nº 123456, emitida em 01/10/2026, R$ 16.238,00 em DUAS duplicatas (o extrato é UM pagamento: elas saem) */
function notaSintetica(): { doXml: DoXml; lido: { nota: unknown } } {
  const r = lerNFe(utf8(montarNFe({ numero: '123456', dhEmi: '2026-10-01T10:00:00-04:00',
    duplicatas: [['001', '2026-10-31', '8119.00'], ['002', '2026-11-30', '8119.00']] })));
  if (!r.ok) throw new Error('fixture');
  const resolucao = resolverEmitente(r.nota.emitente, [], null);
  const p = proporLancamento({ nota: r.nota, avisosDoLeitor: r.avisos, fazendas: [{ id: 'f-1', nome: 'Faz. Exemplo', ie: null }], emitente: resolucao,
    favorecidoId: 'forn-nota', ultima: null });
  if (!p.ok) throw new Error('fixture');
  return {
    doXml: { proposta: p.proposta, emitenteNome: r.nota.emitente.nome, emitenteDocumento: r.nota.emitente.documento, resolucao, ocorrencias: [],
      arquivo: new File(['<nfe/>'], 'nf-123456.xml', { type: 'application/xml' }) },
    lido: { nota: r.nota },
  };
}

const mov = (valor: number): MovimentoConciliacao => ({
  id: 'ext-1', data_movimento: '2026-10-05', descricao: 'COMPRA DEBITO EXEMPLO', documento: null, valor, valorConciliado: 0, valorAberto: valor,
  situacao: 'nao_conciliado', lancamentoId: null, vinculos: 0, lancamentoDescricao: null, lancamentoFavorecido: null,
});

const achado = (o: Partial<LancamentoJaLancado>): LancamentoJaLancado => ({
  id: 'lanc-ja', vencimento: '2026-11-10', pagamento: '2026-11-10', competencia: '2026-10-01', descricao: 'Compra exemplo', valorCent: 1623800,
  status: 'realizado', conciliado: false, financiamentoId: null, contaBancariaId: 'conta-extrato', numeroDocumento: '000123456',
  fornecedorId: 'forn-nota', fornecedorNome: 'Fornecedor Sintetico', fornecedorPor: 'cnpj', parcelas: [{ n: 1, difCent: 0, difDias: 0 }],
  por: ['numero'], cancelado: false, ...o,
});

const form = (valor: number): FormDoTeste => ({
  fazenda_id: 'f-1', descricao: 'COMPRA DEBITO EXEMPLO', numero_documento: '123456', data_vencimento: '2026-10-05', status_transacao: 'realizado', valor,
});

const H = { fechou: vi.fn(), criado: vi.fn(), casar: vi.fn() };
function abrir(valor: number, o: { semVinculo?: boolean; semCasar?: boolean } = {}) {
  return render(<CriarLancamentoDaLinha movimento={mov(valor)} contaBancariaId="conta-extrato" semVinculo={o.semVinculo}
    aoFechar={H.fechou} aoCriado={H.criado} aoCasarComBanco={o.semCasar ? undefined : H.casar} />);
}
const ler = async () => {
  const lerNota = M.props?.onLerNotaNoNovo;
  if (!lerNota) throw new Error('sem o Ler a NF');
  let frase: string | null = null;
  await act(async () => { frase = await lerNota(new File(['x'], 'nf.pdf')); });
  return frase;
};

beforeEach(() => {
  M.props = null;
  M.rpc.mockReset().mockResolvedValue({ data: { ok: true, lancamento_id: 'criado-rpc' }, error: null });
  M.criarComId.mockReset().mockResolvedValue('criado-writer');
  const n = notaSintetica();
  M.ler.mockReset().mockResolvedValue({ ok: true, nota: { arquivo: n.doXml.arquivo, bytes: new ArrayBuffer(0), lido: n.lido, doXml: n.doXml } });
  M.busca.mockReset().mockResolvedValue({ ok: true, valor: [] });
  H.fechou.mockReset(); H.criado.mockReset(); H.casar.mockReset();
});

describe('Fatia A — os documentos antes de salvar, no id que o salvar devolve', () => {
  it('o modal liga a aba Documentos e o salvar devolve o lancamento_id da RPC; a estação só sabe ao FECHAR (depois dos documentos)', async () => {
    abrir(-16238);
    expect(M.props?.documentosAntesDeSalvar).toBe(true);
    const r = await M.props?.onSave(form(16238));
    expect(r).toBe('criado-rpc');
    expect(M.rpc.mock.calls[0][0]).toBe('fn_criar_lancamento_de_extrato');
    expect(H.criado).not.toHaveBeenCalled();
    expect(H.fechou).not.toHaveBeenCalled();
    await act(async () => { M.props?.onClose(); });
    expect(H.criado).toHaveBeenCalledWith(undefined);
    expect(H.fechou).toHaveBeenCalledTimes(1);
  });

  it('sem vínculo (a seleção da estação): devolve o id do writer, e ao fechar a estação o recebe para marcar', async () => {
    abrir(-16238, { semVinculo: true });
    expect(await M.props?.onSave(form(16238))).toBe('criado-writer');
    await act(async () => { M.props?.onClose(); });
    expect(H.criado).toHaveBeenCalledWith('criado-writer');
  });

  it('Cancelar sem criar: fecha, sem avisar criação', async () => {
    abrir(-16238);
    await act(async () => { M.props?.onClose(); });
    expect(H.criado).not.toHaveBeenCalled();
    expect(H.fechou).toHaveBeenCalledTimes(1);
  });
});

describe('Fatia B — o "Ler a NF" no Novo pelo extrato', () => {
  it('só na linha do extrato com o Casar à mão: nem na seleção (sem vínculo) nem sem o hospedeiro do Casar', () => {
    abrir(-16238);
    expect(M.props?.onLerNotaNoNovo).toBeTypeOf('function');
    abrir(-16238, { semVinculo: true });
    expect(M.props?.onLerNotaNoNovo).toBeUndefined();
    abrir(-16238, { semCasar: true });
    expect(M.props?.onLerNotaNoNovo).toBeUndefined();
  });

  it('a nota que não está lançada PREENCHE: fornecedor, nº e competência da nota; contas, pagamento, vencimento, tipo e status do extrato', async () => {
    abrir(-16238);
    expect(await ler()).toBeNull();
    await waitFor(() => expect(M.props?.prefill).toHaveProperty('doXml'));
    expect(M.props?.prefill).toMatchObject({
      favorecido_id: 'forn-nota', numero_documento: '000.123.456', tipo_documento: 'Nota Fiscal', data_competencia: '2026-10-01',
      conta_bancaria_id: 'conta-extrato', data_pagamento: '2026-10-05', data_vencimento: '2026-10-05', tipo_operacao: '2-Saídas',
      status_transacao: 'realizado', valor: 16238, descricao: 'COMPRA DEBITO EXEMPLO',
    });
    expect(H.casar).not.toHaveBeenCalled();
  });

  it('nota igual ao extrato: o Criar grava pela RPC de sempre (lançamento + vínculo numa transação)', async () => {
    abrir(-16238);
    await ler();
    await waitFor(() => expect(M.props?.prefill).toHaveProperty('doXml'));
    expect(await M.props?.onSave(form(16238))).toBe('criado-rpc');
    expect(M.criarComId).not.toHaveBeenCalled();
    await act(async () => { M.props?.onClose(); });
    expect(H.casar).not.toHaveBeenCalled();
  });

  it('nota ≠ extrato (escolha 1): cria com o valor da nota, SEM vínculo, e ao fechar abre o Casar com ele levado (o nº da NF na linha)', async () => {
    abrir(-16000);
    await ler();
    await waitFor(() => expect(M.props?.prefill).toHaveProperty('doXml'));
    expect(await M.props?.onSave(form(16238))).toBe('criado-writer');
    expect(M.rpc).not.toHaveBeenCalled();
    expect(H.casar).not.toHaveBeenCalled();
    await act(async () => { M.props?.onClose(); });
    expect(H.casar).toHaveBeenCalledTimes(1);
    expect(H.casar.mock.calls[0][0]).toEqual([expect.objectContaining({ lancamento_id: 'criado-writer', valor_assinado: -16238, numero_documento: '123456' })]);
  });

  it('a nota JÁ LANÇADA (realizada, sem vínculo): nada se preenche nem cria — fecha e abre o Casar com ela, o nº da NF e a troca de conta', async () => {
    M.busca.mockResolvedValue({ ok: true, valor: [achado({ contaBancariaId: 'outra' })] });
    abrir(-16238);
    expect(await ler()).toBeNull();
    expect(H.fechou).toHaveBeenCalledTimes(1);
    expect(H.casar.mock.calls[0][0]).toEqual([expect.objectContaining({
      lancamento_id: 'lanc-ja', valor_assinado: -16238, numero_documento: '000123456', status_transacao: 'realizado',
      trocarConta: { de: 'Outro Banco', para: 'Banco Exemplo' },
    })]);
    expect(M.props?.prefill).not.toHaveProperty('doXml');
  });

  it('a nota já lançada E CONCILIADA: a frase, nada casado nem preenchido', async () => {
    M.busca.mockResolvedValue({ ok: true, valor: [achado({ conciliado: true, status: 'conciliado' })] });
    abrir(-16238);
    expect(await ler()).toMatch(/já está lançada e conciliada/);
    expect(H.casar).not.toHaveBeenCalled();
    expect(H.fechou).not.toHaveBeenCalled();
  });

  it('P146 — a busca de "já lançada" que FALHA nunca vira "não lançada": a frase, nada preenchido', async () => {
    M.busca.mockResolvedValue({ ok: false, motivo: 'tempo esgotado' });
    abrir(-16238);
    expect(await ler()).toMatch(/Não consegui verificar/);
    expect(M.props?.prefill).not.toHaveProperty('doXml');
  });
});

describe('as regras puras', () => {
  it('o extrato é UM pagamento: as duplicatas saem (à vista, vencimento = o pagamento) e a fazenda sem IE cai na da conta', () => {
    const { doXml } = notaSintetica();
    expect(doXml.proposta.duplicatas.length).toBe(2);
    const p = prefillDoExtratoComNota({ fazenda_id: 'faz-da-conta', conta_bancaria_id: 'c', tipo_operacao: '2-Saídas', descricao: 'D' }, doXml, '2026-10-05');
    expect(p.doXml.proposta.parcelamento).toEqual({ tipo: 'unico', vencimento: '2026-10-05' });
    expect(p.doXml.proposta.duplicatas).toEqual([]);
    expect(p.fazenda_id).toBe('faz-da-conta');
  });

  it('o caminho da nota: nada achado = criar; achado vivo = casar; só conciliados = conciliada; só cancelados = criar', () => {
    const parc = [{ n: 1, vencimento: '2026-10-01', valorCent: 1623800 }];
    expect(oQueFazerComANota([], parc, 1623800).caminho).toBe('criar');
    expect(oQueFazerComANota([achado({})], parc, 1623800).caminho).toBe('casar');
    expect(oQueFazerComANota([achado({ conciliado: true })], parc, 1623800).caminho).toBe('conciliada');
    expect(oQueFazerComANota([achado({ cancelado: true })], parc, 1623800).caminho).toBe('criar');
  });
});

describe('o Casar com o banco de hoje mostra o nº da NF na linha (Gabriel 04/11 06:28)', () => {
  const EXT = { extrato_id: 'ext-1', data: '2026-10-05', historico: 'COMPRA DEBITO EXEMPLO', valor: -16238 };
  const LEV: LevadoDaNota = { lancamento_id: 'lanc-ja', descricao: 'Compra exemplo', fornecedor: 'Fornecedor Sintetico', valor_assinado: -16238,
    data_vencimento: '2026-11-10', status_transacao: 'realizado', numero_documento: '000123456' };
  it('com o nº: a coluna NF (000.123.456), a linha a 9,5px numa linha só; sem o nº, a linha de sempre', () => {
    M.rpc.mockResolvedValue({ data: { ok: true, no_extrato: -16238, soma: -16238 }, error: null });
    const { unmount } = render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} iniciais={[LEV]} contaBancariaId="conta-extrato" onConciliado={() => {}} />);
    expect(screen.getByTestId('levado-nf').textContent).toBe('000.123.456');
    expect(screen.getByTestId('levado-identificacao').className).toMatch(/whitespace-nowrap/);
    unmount();
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} iniciais={[{ ...LEV, numero_documento: null }]} contaBancariaId="conta-extrato" onConciliado={() => {}} />);
    expect(screen.queryByTestId('levado-nf')).toBeNull();
  });
});

describe('o modal de sempre ganha o "Ler a NF" no Novo (inspeção do fonte: nenhum teste monta o LancamentoV2Dialog)', () => {
  const fonte = readFileSync(resolve(__dirname, '../financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
  it('a MESMA área do Editar, só no lançamento novo e antes de salvar, chamando o hospedeiro com o arquivo', () => {
    const bloco = fonte.slice(fonte.indexOf('{!lancamento?.id && onLerNotaNoNovo && !posSalvar && ('), fonte.indexOf('</section>', fonte.indexOf('onLerNotaNoNovo && !posSalvar')));
    expect(bloco).toContain('<AreaDeArquivo regra={REGRA_DA_NF_LIDA} testId="doc-ler-nf"');
    expect(bloco).toContain('void onLerNotaNoNovo(arquivo).then((frase) => setRecusaDaNotaLida(frase))');
  });
});

describe('a estação hospeda o Casar de hoje (inspeção do fonte)', () => {
  const fonte = readFileSync(resolve(__dirname, 'EstacaoConciliar.tsx'), 'utf8');
  it('o Criar recebe o hospedeiro do Casar, e o CasarComBancoModal abre com os levados da nota sobre o movimento desta estação', () => {
    expect(fonte).toContain('aoCasarComBanco={setCasarCom}');
    expect(fonte).toContain('<CasarComBancoModal open onClose={() => setCasarCom(null)} extrato={extratoDoCasar} iniciais={casarCom}');
    expect(fonte).toContain('({ extrato_id: movimento.id, data: movimento.data_movimento, historico: movimento.descricao, valor: movimento.valor })');
  });
});
