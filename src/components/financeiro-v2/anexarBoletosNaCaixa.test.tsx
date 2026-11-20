/**
 * BOLETO D1d (Gabriel 17/11 14:23, mock-boleto-d1d-v1) — a coluna "Na caixa" do "Anexar vários boletos", montada de verdade:
 * D1 a prévia do banco aparece ANTES de gravar (só simula); depois de anexar os documentos, entra e liga só o que a prévia disse;
 * D2 a parcela com OUTRO boleto: anexa só o documento, o rodapé manda trocar na caixa ("Substituir"), nunca troca calado;
 * falha na caixa não desfaz o documento (frase no rodapé, botão "Fechar"); sem `naCaixa` (parcelas da prévia) nada muda.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const LINHAS: Record<string, string> = {
  'boleto_a.pdf': '34191.09008 04881.820049 19646.100008 8 16110000300650', // 26/10/26
  'boleto_b.pdf': '34191.09008 04882.240049 19646.100008 6 17370000300650', // 01/03/27
};
vi.mock('@/lib/financeiro/parser/extractPdfText', () => ({
  extractPdfText: (f: File) => Promise.resolve(
    LINHAS[f.name] ? { text: `Linha ${LINHAS[f.name]}`, pageCount: 1, hasTextLayer: true } : { text: '', pageCount: 1, hasTextLayer: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { respostaDeEntrar } from '@/lib/financeiro/boleto/caixaApi';
import { acharBoletoNoTexto } from '@/lib/financeiro/linhaDigitavel';
import type { ParcelaApi } from '@/lib/financeiro/boleto/boletoDaParcela';
import type { LeituraDoArquivo } from '@/lib/financeiro/boleto/lerBoleto';

const PARCELAS = ['2026-10-05', '2027-03-05'].map((vencimento, i) => ({ numero: i + 1, vencimento, valor: 3006.5, temBoleto: false }));
const LANC = new Map([[1, 'lanc-1'], [2, 'lanc-2']]);
const pdf = (nome: string) => new File(['%PDF'], nome, { type: 'application/pdf' });
const soltar = (arquivos: File[]) => fireEvent.change(screen.getByTestId('input-boletos'), { target: { files: arquivos } });
const SEM = { documento: null, nome: null, confira: false };
/** o leitor da caixa falso: devolve a linha REAL pelo nome (os bytes do File de teste não importam) */
const lerPeloNome = (nome: string) => async (): Promise<LeituraDoArquivo> =>
  ({ ok: true, leitura: { boleto: LINHAS[nome] ? acharBoletoNoTexto(LINHAS[nome]) : null, beneficiario: SEM, pagador: SEM } });

/** a caixa falsa: `existe` = o título já está na caixa; `ligados` = o boleto vivo já ligado ao lançamento */
let existe: Record<string, string> = {};
let ligados: Record<string, string> = {};
let falhaAoLigar = false;
let api: { [K in keyof ParcelaApi]: Mock<ParcelaApi[K]> };
beforeEach(() => {
  existe = {}; ligados = {}; falhaAoLigar = false;
  api = {
    entrar: vi.fn<ParcelaApi['entrar']>(async (_c, l, simular) => {
      const id = existe[String(l.arquivo_nome)];
      return { ok: true, dados: respostaDeEntrar({
        ok: true, simulado: simular, ja_existe: !!id, id: id ?? (simular ? null : `novo-${String(l.arquivo_nome)}`),
        storage_path: simular || id ? null : 'cli/boletos/x.pdf', frase: id ? 'Este boleto já está no sistema.' : null,
        boleto: { codigo_barras: '3'.repeat(44), situacao: 'novo' }, situacao: { lancamentos: [], avisos: [] }, candidatos: [], avisos: [],
      }) };
    }),
    subirArquivo: vi.fn<ParcelaApi['subirArquivo']>(async () => ({ ok: true, dados: true })),
    ligar: vi.fn<ParcelaApi['ligar']>(async () => (falhaAoLigar
      ? { ok: true, dados: { ok: false, motivo: 'recusa', frase: 'O lançamento está cancelado.', outroBoletoId: null } }
      : { ok: true, dados: { ok: true } })),
    boletoDoLancamento: vi.fn<ParcelaApi['boletoDoLancamento']>(async (l) => ({ ok: true, dados: ligados[l] ?? null })),
  };
});

function montar(onConfirmar = vi.fn().mockResolvedValue(null), onFechar = vi.fn()) {
  /* o conteúdo do File de teste É o nome: o leitor falso acha a linha por ele */
  const naCaixa = { clienteId: 'cli', lancamentos: LANC, api, ler: (b: ArrayBuffer) => lerPeloNome(new TextDecoder().decode(b))() };
  render(<AnexarBoletosDialog parcelas={PARCELAS} naCaixa={naCaixa} onConfirmar={onConfirmar} onFechar={onFechar} />);
  return { onConfirmar, onFechar };
}
/** o conteúdo do arquivo de teste É o nome: o leitor falso acha a linha por ele */
const pdfLido = (nome: string) => {
  const f = new File([nome], nome, { type: 'application/pdf' });
  // jsdom não implementa File.arrayBuffer — shim só do que o leitor usa.
  Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(nome).buffer });
  return f;
};
const selos = () => screen.getAllByTestId('selo-na-caixa').map((s) => s.textContent);

describe('BOLETO D1d — a coluna "Na caixa"', () => {
  it('D1: mostra a prévia (entra e liga · já na caixa) SÓ simulando; nada liga antes do Anexar', async () => {
    existe = { 'boleto_b.pdf': 'b-77' };
    montar();
    soltar([pdfLido('boleto_a.pdf'), pdfLido('boleto_b.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['entra e liga', 'já na caixa · liga']));
    expect(screen.getByText('Na caixa')).toBeTruthy();
    expect(api.entrar.mock.calls.every((c) => c[2] === true)).toBe(true);
    expect(api.ligar).not.toHaveBeenCalled();
    expect(api.subirArquivo).not.toHaveBeenCalled();
  });

  it('depois de anexar os documentos: entra o novo, liga o existente (G1), cada um à SUA parcela, e fecha', async () => {
    existe = { 'boleto_b.pdf': 'b-77' };
    const { onConfirmar, onFechar } = montar();
    soltar([pdfLido('boleto_a.pdf'), pdfLido('boleto_b.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['entra e liga', 'já na caixa · liga']));
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    /* o documento vem ANTES da caixa */
    expect(onConfirmar.mock.invocationCallOrder[0]).toBeLessThan(api.ligar.mock.invocationCallOrder[0]);
    expect(api.entrar.mock.calls.filter((c) => c[2] === false).map((c) => c[1].arquivo_nome)).toEqual(['boleto_a.pdf']);
    expect(api.ligar.mock.calls.map((c) => [c[0], c[1]])).toEqual([['novo-boleto_a.pdf', ['lanc-1']], ['b-77', ['lanc-2']]]);
  });

  it('D2: a parcela com OUTRO boleto → selo âmbar, o rodapé manda "Substituir" na caixa; anexa o documento e NÃO liga', async () => {
    ligados = { 'lanc-1': 'outro-9' };
    const { onConfirmar, onFechar } = montar();
    soltar([pdfLido('boleto_a.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['outro boleto']));
    expect(screen.getByTestId('aviso-outro-boleto').textContent).toMatch(/1 parcela já tem outro boleto.*Substituir/);
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(api.ligar).not.toHaveBeenCalled();
    expect(api.entrar.mock.calls.some((c) => c[2] === false)).toBe(false);
  });

  it('sem linha digitável: "não confere", anexa só o documento e não pergunta à caixa', async () => {
    const { onConfirmar } = montar();
    /* o escaneado casa pelo número no nome (parcela 2) */
    soltar([pdfLido('escaneado-02.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['não confere']));
    expect(screen.getByTestId('na-caixa').getAttribute('title')).toMatch(/sem linha digitável: anexa só o documento/);
    expect(api.entrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    expect(onConfirmar.mock.calls[0][0].map((i: { parcela: number }) => i.parcela)).toEqual([2]);
    expect(api.ligar).not.toHaveBeenCalled();
  });

  it('falha ao ligar NÃO desfaz o documento: a frase fica no rodapé e o botão vira "Fechar"', async () => {
    falhaAoLigar = true;
    const { onFechar } = montar();
    soltar([pdfLido('boleto_a.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['entra e liga']));
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(screen.getByTestId('fechar-anexados')).toBeTruthy());
    expect(screen.getByTestId('pendencia-boletos').textContent).toMatch(/Os documentos foram anexados\. boleto_a\.pdf: O boleto está na caixa, mas não foi ligado à parcela: O lançamento está cancelado\./);
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.queryByTestId('anexar-boletos')).toBeNull();
  });

  it('o documento falhou: a caixa NÃO é chamada (nada liga sem o documento)', async () => {
    const onConfirmar = vi.fn().mockResolvedValue('Não gravados — parcela 1: falha');
    montar(onConfirmar);
    soltar([pdfLido('boleto_a.pdf')]);
    await waitFor(() => expect(selos()).toEqual(['entra e liga']));
    fireEvent.click(screen.getByTestId('anexar-boletos'));
    await waitFor(() => expect(screen.getByTestId('pendencia-boletos').textContent).toMatch(/Não gravados/));
    expect(api.ligar).not.toHaveBeenCalled();
    expect(api.entrar.mock.calls.some((c) => c[2] === false)).toBe(false);
  });

  it('sem `naCaixa` (as parcelas da prévia, ainda não gravadas): sem a coluna, como antes', async () => {
    render(<AnexarBoletosDialog parcelas={PARCELAS} onConfirmar={vi.fn().mockResolvedValue(null)} onFechar={() => {}} />);
    soltar([pdf('boleto_a.pdf')]);
    await waitFor(() => expect(screen.queryByText('lendo…')).toBeNull());
    expect(screen.queryByText('Na caixa')).toBeNull();
    expect(screen.queryByTestId('na-caixa')).toBeNull();
  });
});
