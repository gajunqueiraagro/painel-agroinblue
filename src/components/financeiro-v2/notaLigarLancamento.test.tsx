/**
 * NOTA-LIGAR-LANCAMENTO-01 P1–P3 (Gabriel 11/11) — o "Novo documento" que LÊ a nota mostra, em dados SINTÉTICOS no molde do caso NJ:
 * a nota de outra filial do mesmo CNPJ raiz (e "Trocar para a filial da nota" pela troca com prévia), o quadro das duplicatas com quem paga
 * cada uma (este lançamento · liberação do contrato) e a participação sugerida (15%), guardada no Registrar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/lib/financeiro/itensDaNotaBanco', async (orig) => ({ ...(await orig<typeof import('@/lib/financeiro/itensDaNotaBanco')>()), gravarItensSemTravar: vi.fn(async () => null) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const banco = vi.hoisted(() => ({
  notaJaLancada: vi.fn(async (): Promise<Consulta<LancamentoJaLancado[]>> => ({ ok: true, valor: [] })),
  liberacoesDiretasDoFornecedor: vi.fn(async (): Promise<Consulta<LiberacaoDireta[]>> => ({ ok: true,
    valor: [{ id: 'lib-1', data: '2026-10-01', valorCent: 23_842_500, contrato: 'CT-1/26' }] })),
  definirParticipacao: vi.fn(async (_c: string, _d: readonly string[], _p: number): Promise<string | null> => null),
  fornecedorPeloDocumento: vi.fn(async (_c: string, _d: string): Promise<Consulta<{ id: string; nome: string; ativo: boolean } | null>> =>
    ({ ok: true, valor: { id: 'f15', nome: 'Maquinas Sinteticas Ltda', ativo: true } })),
  completarCadastroPeloXml: vi.fn(async (): Promise<string | null> => null),
  completarComANota: vi.fn(async () => ({ ok: false, motivo: 'fora do teste' })),
}));
vi.mock('@/lib/financeiro/nfeConsultas', async (orig) => ({ ...(await orig<object>()), ...banco }));
const troca = vi.hoisted(() => ({
  simularTroca: vi.fn(async () => ({ ok: true, recusa: null, lancamentos: 1, soma: 42075, origens: [], mesesFechados: [], mesesFechadosLancamentos: 0,
    conciliados: 0, ligadosAOc: 0, jaNoDestino: 0, cancelados: 0, operacaoId: null })),
  aplicarTroca: vi.fn(async (_c: string, _ids: readonly string[], _d: string, _m: string) => ({ ok: true, recusa: null, lancamentos: 1, soma: 42075, origens: [],
    mesesFechados: [], mesesFechadosLancamentos: 0, conciliados: 0, ligadosAOc: 0, jaNoDestino: 0, cancelados: 0, operacaoId: 'op-1' })),
}));
vi.mock('@/lib/financeiro/trocarFornecedor', async (orig) => ({ ...(await orig<object>()), ...troca }));

import { FormDocumento, type CompletarPelaNota, type SugestaoDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { NotaXLancamentoQuadro } from '@/components/financeiro-v2/NotaXLancamentoQuadro';
import type { DocumentoCriado, LancDocPayload, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { montarNFe, utf8 } from '@/lib/financeiro/nfe/__fixtures__/notas';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import type { LiberacaoDireta } from '@/lib/financeiro/nfe/notaXLancamento';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';

/* o emitente da fixture é 11.222.333/0001-81; o lançamento está na filial 0014-94 (mesma razão social) */
const FORNECEDORES = [
  { id: 'f15', nome: 'Maquinas Sinteticas Ltda', cpf_cnpj: '11.222.333/0001-81', ativo: true },
  { id: 'f14', nome: 'Maquinas Sinteticas Ltda', cpf_cnpj: '11.222.333/0014-94', ativo: true },
];
const NOTA = { numero: '73007', vNF: '280500.00', duplicatas: [['001', '2026-09-02', '42075.00'], ['002', '2026-10-01', '238425.00']] satisfies [string, string, string][],
  itens: [['PLANTADEIRA SINTETICA 12 LINHAS', '1.0000', 'UN', '280500.00']] satisfies [string, string, string, string][] };
const SUGESTAO: SugestaoDocumento = { numero: null, dataEmissao: '2026-09-01', valor: 42075, emitenteId: 'f14', vencimento: '2026-09-02' };

if (!('arrayBuffer' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', { value(this: Blob) {
    return new Promise<ArrayBuffer>((ok, erro) => { const r = new FileReader(); r.onload = () => (r.result instanceof ArrayBuffer ? ok(r.result) : erro(new Error('não leu'))); r.onerror = () => erro(r.error); r.readAsArrayBuffer(this); });
  } });
}
function monta(completar?: CompletarPelaNota) {
  const registrar = vi.fn(async (_p: LancDocPayload): Promise<DocumentoCriado | null> => ({ id: 'doc-novo', origem: 'lancamento', operacaoId: null }));
  const api: LancamentoDocumentosApi = { documentos: [], confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar, editar: vi.fn(), cancelar: vi.fn(), anexar: vi.fn(async () => true), urlAssinada: vi.fn(), recarregar: vi.fn() };
  render(<FormDocumento api={api} documento={null} clienteId="cli" onFechar={vi.fn()} sugestao={SUGESTAO} completarPelaNota={completar} />);
  fireEvent.change(screen.getByTestId('doc-arquivo'), { target: { files: [new File([utf8(montarNFe(NOTA))], 'nf.xml', { type: '' })] } });
  return { registrar };
}
async function notaLida(): Promise<NotaLida> {
  const r = await lerNota(utf8(montarNFe(NOTA)));
  if (r.ok === false) throw new Error(r.frase);
  return r.nota;
}

beforeEach(() => {
  definirFornecedoresDoLeitor(FORNECEDORES);
  for (const f of [...Object.values(banco), ...Object.values(troca)]) f.mockClear();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('NOTA-LIGAR-LANCAMENTO-01 — o Novo documento que lê a nota', () => {
  it('P1 + P2: avisa a outra filial (os dois finais) e mostra quem paga cada duplicata — este lançamento e a liberação do contrato', async () => {
    monta();
    const filial = await screen.findByTestId('nota-filial');
    expect(filial.getAttribute('data-tipo')).toBe('outra-filial');
    expect(filial.textContent).toContain('A nota é da filial 0001-81 · o lançamento está na 0014-94.');
    /* sem o lançamento salvo, não há troca: só o recado */
    expect(screen.queryByTestId('nota-filial-trocar')).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId('nota-x-linha').map((l) => l.getAttribute('data-quem'))).toEqual(['este', 'liberacao']));
    const linhas = screen.getAllByTestId('nota-x-linha');
    expect(linhas[1].textContent).toContain('liberação do contrato CT-1/26 · 01/10/2026');
    expect(screen.getByTestId('nota-x-sem-dono').textContent).toBe('todas com quem pague');
    expect(banco.notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ parcelas: [
      { n: 1, vencimento: '2026-09-02', valorCent: 4_207_500 }, { n: 2, vencimento: '2026-10-01', valorCent: 23_842_500 }] }));
  });

  it('P1: no lançamento salvo, "Trocar para a filial da nota" faz a prévia, confirma pela troca e avisa o modal do lançamento', async () => {
    const onFornecedorTrocado = vi.fn();
    monta({ lancamentoId: 'lanc-1', onCompletado: vi.fn(), onFornecedorTrocado });
    fireEvent.click(await screen.findByTestId('nota-filial-trocar'));
    await waitFor(() => expect(troca.simularTroca).toHaveBeenCalledWith('cli', ['lanc-1'], 'f15'));
    expect(troca.aplicarTroca).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('nota-filial-confirmar'));
    await waitFor(() => expect(onFornecedorTrocado).toHaveBeenCalledWith('f15'));
    expect(troca.aplicarTroca).toHaveBeenCalledWith('cli', ['lanc-1'], 'f15', 'NF 000.073.007 é da filial 0001-81');
  });

  it('P3: a participação sugerida é 15% (42.075 ÷ 280.500), o operador muda, e o Registrar a guarda no documento', async () => {
    const { registrar } = monta({ lancamentoId: 'lanc-1', onCompletado: vi.fn() });
    const campo = within(await screen.findByTestId('nota-x-participacao')).getByRole('textbox');
    expect(campo).toHaveProperty('value', '15');
    fireEvent.focus(campo); fireEvent.change(campo, { target: { value: '20' } }); fireEvent.blur(campo);
    fireEvent.click(screen.getByTestId('doc-registrar'));
    await waitFor(() => expect(banco.definirParticipacao).toHaveBeenCalledWith('cli', ['doc-novo'], 20));
    expect(registrar).toHaveBeenCalled();
  });
});

describe('NOTA-LIGAR-LANCAMENTO-01 — o quadro sozinho', () => {
  const LANC = { id: 'lanc-1', valorCent: 4_207_500, vencimento: '2026-09-02', competencia: null,
    fornecedor: { id: 'f14', nome: 'Maquinas Sinteticas Ltda', documento: '11.222.333/0014-94' } };
  it('a filial fora do cadastro: "Cadastrar esta filial" confere o CNPJ no banco, cria pelo hospedeiro com o CNPJ formatado e grava os dados da nota', async () => {
    banco.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: true, valor: null });
    const onCriar = vi.fn(async (_n: string, _d: string) => ({ id: 'nova', nome: 'Maquinas Sinteticas Ltda' }));
    const onCadastrado = vi.fn();
    render(<NotaXLancamentoQuadro clienteId="cli" nota={await notaLida()} notaFornecedorId={null} lancamento={LANC} participacaoPct={15} participacaoPadrao={15}
      onParticipacao={vi.fn()} onTrocado={vi.fn()} onCriarFornecedor={onCriar} onCadastrado={onCadastrado} />);
    expect(screen.getByTestId('nota-filial').getAttribute('data-tipo')).toBe('filial-fora-do-cadastro');
    fireEvent.click(screen.getByTestId('nota-filial-cadastrar'));
    await waitFor(() => expect(onCadastrado).toHaveBeenCalledWith('nova'));
    expect(onCriar).toHaveBeenCalledWith(expect.any(String), '11.222.333/0001-81');
    expect(banco.completarCadastroPeloXml).toHaveBeenCalledWith('cli', 'nova', expect.objectContaining({ documento: '11222333000181' }));
  });
  it('o CNPJ da nota JÁ está no banco (a lista estava velha): usa esse cadastro e NÃO cria outro', async () => {
    const onCriar = vi.fn(async (_n: string, _d: string) => ({ id: 'nova', nome: 'x' }));
    const onCadastrado = vi.fn();
    render(<NotaXLancamentoQuadro clienteId="cli" nota={await notaLida()} notaFornecedorId={null} lancamento={LANC} participacaoPct={null} participacaoPadrao={null}
      onParticipacao={vi.fn()} onTrocado={vi.fn()} onCriarFornecedor={onCriar} onCadastrado={onCadastrado} />);
    fireEvent.click(screen.getByTestId('nota-filial-cadastrar'));
    await waitFor(() => expect(onCadastrado).toHaveBeenCalledWith('f15'));
    expect(onCriar).not.toHaveBeenCalled();
  });
  it('a recusa da criação fica na linha (nunca some em silêncio)', async () => {
    banco.fornecedorPeloDocumento.mockResolvedValueOnce({ ok: true, valor: null });
    render(<NotaXLancamentoQuadro clienteId="cli" nota={await notaLida()} notaFornecedorId={null} lancamento={LANC} participacaoPct={null} participacaoPadrao={null}
      onParticipacao={vi.fn()} onTrocado={vi.fn()} onCriarFornecedor={async () => 'Escolha a fazenda do lançamento antes de cadastrar a filial.'} onCadastrado={vi.fn()} />);
    fireEvent.click(screen.getByTestId('nota-filial-cadastrar'));
    await waitFor(() => expect(screen.getByTestId('nota-filial').textContent).toContain('Escolha a fazenda do lançamento antes de cadastrar a filial.'));
  });
  it('a consulta que falha DIZ que falhou (P146), nunca "ninguém paga"; "tentar de novo" relê', async () => {
    banco.notaJaLancada.mockResolvedValueOnce({ ok: false, motivo: 'rede' });
    render(<NotaXLancamentoQuadro clienteId="cli" nota={await notaLida()} notaFornecedorId="f15" lancamento={{ ...LANC, fornecedor: null }} participacaoPct={null}
      participacaoPadrao={null} onParticipacao={vi.fn()} onTrocado={vi.fn()} onCadastrado={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('nota-x-sem-dono').textContent).toContain('Não consegui verificar'));
    expect(screen.getAllByTestId('nota-x-linha')[1].textContent).not.toContain('ninguém');
    fireEvent.click(screen.getByText('tentar de novo'));
    await waitFor(() => expect(screen.getByTestId('nota-x-sem-dono').textContent).toBe('todas com quem pague'));
  });
  it('o cabeçalho do quadro só fica preso quando o quadro rola (4ª duplicata em diante); até 3, quem rola é o modal (regra do gate: cabeçalho preso)', async () => {
    const nota = await notaLida();
    const { unmount } = render(<NotaXLancamentoQuadro clienteId="cli" nota={nota} notaFornecedorId="f15" lancamento={{ ...LANC, fornecedor: null }} participacaoPct={null}
      participacaoPadrao={null} onParticipacao={vi.fn()} onTrocado={vi.fn()} onCadastrado={vi.fn()} />);
    expect(screen.getByTestId('nota-x-lancamento-cabecalho').className).not.toContain('sticky');
    expect(screen.getByTestId('nota-x-lancamento-tabela').className).not.toContain('overflow-y-auto');
    unmount();
    const quatro = { ...nota, duplicatas: [1, 2, 3, 4].map((n) => ({ numero: `00${n}`, vencimento: `2026-0${n + 5}-02`, valorCent: 7_012_500 })) };
    render(<NotaXLancamentoQuadro clienteId="cli" nota={quatro} notaFornecedorId="f15" lancamento={{ ...LANC, fornecedor: null }} participacaoPct={null}
      participacaoPadrao={null} onParticipacao={vi.fn()} onTrocado={vi.fn()} onCadastrado={vi.fn()} />);
    expect(screen.getByTestId('nota-x-lancamento-cabecalho').className).toContain('sticky');
    expect(screen.getByTestId('nota-x-lancamento-tabela').className).toContain('overflow-y-auto');
    await waitFor(() => expect(screen.getAllByTestId('nota-x-linha')).toHaveLength(4));
  });
});
