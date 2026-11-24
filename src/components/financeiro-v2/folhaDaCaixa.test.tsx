/**
 * FOLHA-NA-CAIXA-01 — a prévia do recibo do contador MONTADA (banco e divisor em memória; dado INVENTADO). Prende: a prévia é a RPC
 * com simular (md5 do documento inteiro, um pedaço por pessoa); o Aprovar grava UMA vez e sobe cada pedaço no caminho devolvido; o
 * upload que falha repete no MESMO caminho sem reaplicar; "Criar" refaz a prévia com criar:true; sem lançamento apaga o Aprovar com o
 * motivo; o já aplicado oferece o Desfazer (prévia com motivo, depois de verdade).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, renderHook, act, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { FolhaDaCaixaDialog } from './FolhaDaCaixaDialog';
import type { FolhaCaixaApi } from '@/lib/folha/folhaCaixaApi';
import type { FolhaLida } from '@/lib/folha/lerFolha';
import type { RespostaDaFolha } from '@/lib/folha/folhaNaCaixa';
import { md5 } from '@/lib/arquivo/md5';
import { useFolhaDaCaixa } from '@/hooks/useFolhaDaCaixa';

const FOLHA: FolhaLida = {
  layout: 'sci', tipo: '13_1', competencia: '2026-11', empregadores: ['11122233344'], total: 1530,
  pessoas: [
    { codigo: '12', nome: 'FULANA FICTICIA', cei: '11122233344', paginas: [1], valor: 730 },
    { codigo: '15', nome: 'BELTRANO FICTICIO', cei: '11122233344', paginas: [2], valor: 800 },
  ],
};
const BYTES = new TextEncoder().encode('%PDF documento inteiro').buffer;
const PEDACO = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])];
const dividir = vi.fn(async (_b: Uint8Array, _g: number[][]) => ({ ok: true as const, arquivos: PEDACO }));
const VAZIA: RespostaDaFolha = { jaAplicado: false, automaticos: [], criar: [], pendencias: [], semRecibo: [], semFuncionario: [], soma: 1530, documentos: [] };
const casa = (k: number, antes: number) => ({ paginas: FOLHA.pessoas[k].paginas, nome: FOLHA.pessoas[k].nome, lancamentoId: `l${k}`, antes, depois: FOLHA.pessoas[k].valor,
  nomeConfere: 'exato' as const, casouPor: 'funcionario' as const, acao: 'casar' as const, descricaoAntes: 'Folha Pagamento - 13', descricao: 'Folha Pagamento - 13',
  vencimentoAntes: '2026-12-05', vencimento: '2026-12-05', status: 'previsto', segunda: null });
const docs = [{ documentoId: 'd0', storagePath: 'cli/x-p1.pdf', nome: 'FULANA FICTICIA', paginas: [1], lancamentoId: 'l0' },
  { documentoId: 'd1', storagePath: 'cli/x-p2.pdf', nome: 'BELTRANO FICTICIO', paginas: [2], lancamentoId: 'l1' }];

let api: { [K in keyof FolhaCaixaApi]: Mock<FolhaCaixaApi[K]> };
beforeEach(() => {
  dividir.mockClear();
  api = {
    aplicar: vi.fn<FolhaCaixaApi['aplicar']>(async (_c, _e, _d, _i, simular) => ({ ok: true, dados: simular
      ? { ...VAZIA, automaticos: [casa(0, 3192), casa(1, 900)], semRecibo: [{ lancamentoId: 'l9', nome: 'OUTRO FICTICIO', valor: 500 }] }
      : { ...VAZIA, automaticos: [casa(0, 3192), casa(1, 900)], documentos: docs } })),
    desfazer: vi.fn<FolhaCaixaApi['desfazer']>(async () => ({ ok: true, dados: { valores: 2, criados: 0, documentos: 2 } })),
    subir: vi.fn<FolhaCaixaApi['subir']>(async () => ({ ok: true, dados: true })),
  };
});
const montar = (aoAplicado = vi.fn()) => {
  render(<FolhaDaCaixaDialog entrada={{ clienteId: 'cli', entradaId: null, bytes: BYTES, nomeDoArquivo: 'recibos.pdf', folha: FOLHA }} clienteNome="Cliente Teste"
    aoFechar={() => {}} aoAplicado={aoAplicado} api={api} dividir={dividir} />);
  return aoAplicado;
};
const celulas = (k: number) => within(screen.getByTestId(`linha-folha-${k}`)).getAllByRole('cell').map((c) => c.textContent);

describe('FOLHA-NA-CAIXA-01 — a prévia por funcionário', () => {
  it('a prévia: simular, o md5 do documento inteiro, um pedaço por pessoa; cada linha com lançamento, vencimento, antes e recibo; soma = documento', async () => {
    montar();
    await waitFor(() => expect(api.aplicar).toHaveBeenCalledTimes(1));
    expect(dividir.mock.calls[0][1]).toEqual([[1], [2]]);
    const [cli, entrada, doc, itens, simular] = api.aplicar.mock.calls[0];
    expect([cli, entrada, simular]).toEqual(['cli', null, true]);
    expect(doc).toMatchObject({ md5: md5(BYTES), tipo: '13_1', competencia: '2026-11', total: 1530 });
    expect(itens.map((i) => i.arquivo.md5)).toEqual([md5(PEDACO[0]), md5(PEDACO[1])]);
    await waitFor(() => expect(screen.getByTestId('linha-folha-0')).toBeTruthy());
    /* Nome Próprio só na tela (Gabriel 13:18); ao banco vai o nome como veio do PDF */
    expect(itens.map((i) => i.nome)).toEqual(['FULANA FICTICIA', 'BELTRANO FICTICIO']);
    expect(celulas(0)).toEqual(['1', 'Fulana Ficticia', 'atualiza o valor', 'Folha Pagamento - 13', '05/12/2026', '3.192,00', '730,00', 'guarda a página']);
    expect(screen.getByTestId('soma').textContent).toBe('soma R$ 1.530,00 = documento');
    expect(screen.getByTestId('sem-recibo').textContent).toMatch(/Outro Ficticio 500,00/);
    expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled();
  });

  it('Aprovar grava UMA vez e sobe cada pedaço no caminho devolvido; o que falha sobe de novo no MESMO caminho, sem reaplicar', async () => {
    api.subir.mockImplementation(async (path) => (path === 'cli/x-p2.pdf' && api.subir.mock.calls.length < 3 ? { ok: false, erro: 'O PDF não subiu.' } : { ok: true, dados: true }));
    const aoAplicado = montar();
    await waitFor(() => expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('aprovar-folha'));
    await waitFor(() => expect(api.subir).toHaveBeenCalledTimes(2));
    expect(api.aplicar.mock.calls[1][4]).toBe(false);
    expect(api.subir.mock.calls.map((c) => [c[0], c[1]])).toEqual([['cli/x-p1.pdf', PEDACO[0]], ['cli/x-p2.pdf', PEDACO[1]]]);
    expect(aoAplicado).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('subida-1').textContent).toBe('não subiu'));
    expect(screen.getByTestId('subida-0').textContent).toBe('guardado');
    fireEvent.click(screen.getByTestId('subir-de-novo-1'));
    await waitFor(() => expect(screen.getByTestId('subida-1').textContent).toBe('guardado'));
    expect(api.subir.mock.calls[2][0]).toBe('cli/x-p2.pdf');
    expect(api.aplicar).toHaveBeenCalledTimes(2);
  });

  it('sem lançamento: o Aprovar apaga e diz por quê; "Criar" refaz a prévia com criar:true e libera', async () => {
    api.aplicar.mockImplementation(async (_c, _e, _d, itens) => ({ ok: true, dados: itens[1].criar
      ? { ...VAZIA, automaticos: [casa(0, 3192)], criar: [{ nome: 'BELTRANO FICTICIO', valor: 800, descricao: 'Folha Pagamento - 13', vencimento: '2026-12-05' }] }
      : { ...VAZIA, automaticos: [casa(0, 3192)], pendencias: [{ paginas: [2], nome: 'BELTRANO FICTICIO', valor: 800, pendencia: 'sem_lancamento' }] } }));
    montar();
    await waitFor(() => expect(screen.getByTestId('acontece-1').textContent).toBe('sem lançamento'));
    expect(screen.getByTestId('aprovar-folha')).toBeDisabled();
    expect(screen.getByTestId('frase-da-folha').textContent).toMatch(/1 recibo\(s\) sem lançamento/);
    fireEvent.click(screen.getByTestId('criar-1'));
    await waitFor(() => expect(screen.getByTestId('acontece-1').textContent).toBe('cria o lançamento'));
    expect(api.aplicar.mock.calls[1][3].map((i) => i.criar ?? false)).toEqual([false, true]);
    expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled();
  });

  it('o hook também se guarda: com pendência, o aprovar não grava (nem que a tela chame)', async () => {
    api.aplicar.mockResolvedValue({ ok: true, dados: { ...VAZIA, automaticos: [casa(0, 3192)], pendencias: [{ paginas: [2], nome: 'B', valor: 800, pendencia: 'ambiguo' }] } });
    const entrada = { clienteId: 'cli', entradaId: null, bytes: BYTES, nomeDoArquivo: 'r.pdf', folha: FOLHA };
    const { result } = renderHook(() => useFolhaDaCaixa(entrada, { api, dividir }));
    await waitFor(() => expect(result.current.fase).toBe('previa'));
    expect(result.current.motivo).toMatch(/mais de um/);
    let gravou = true;
    await act(async () => { gravou = await result.current.aprovar(); });
    expect(gravou).toBe(false);
    expect(api.aplicar.mock.calls.every((c) => c[4] === true)).toBe(true);
  });

  it('já aplicado: sem Aprovar; Desfazer pede o motivo, mostra o que volta e só então desfaz', async () => {
    api.aplicar.mockResolvedValue({ ok: true, dados: { ...VAZIA, jaAplicado: true, soma: null } });
    montar();
    await waitFor(() => expect(screen.getByTestId('frase-da-folha').textContent).toBe('Este documento já foi aplicado.'));
    expect(screen.queryByTestId('aprovar-folha')).toBeNull();
    fireEvent.click(screen.getByTestId('desfazer-folha'));
    expect(screen.getByTestId('prever-desfazer')).toBeDisabled();
    expect(screen.getByTestId('confirmar-desfazer-folha')).toBeDisabled();
    fireEvent.change(screen.getByTestId('motivo-desfazer-folha'), { target: { value: 'recibo errado' } });
    fireEvent.click(screen.getByTestId('prever-desfazer'));
    await waitFor(() => expect(screen.getByTestId('o-que-volta').textContent).toBe('volta o valor de 2 · cancela 0 criado(s) · 2 documento(s)'));
    expect(api.desfazer.mock.calls[0]).toEqual(['cli', md5(BYTES), 'recibo errado', true]);
    fireEvent.click(screen.getByTestId('confirmar-desfazer-folha'));
    await waitFor(() => expect(api.desfazer).toHaveBeenCalledTimes(2));
    expect(api.desfazer.mock.calls[1]).toEqual(['cli', md5(BYTES), 'recibo errado', false]);
  });

  it('o 13º inteiro que DIVIDE: a 1ª pelo recibo (descrição e vencimento novos, o antes no title) e a 2ª continua prevista', async () => {
    api.aplicar.mockResolvedValue({ ok: true, dados: { ...VAZIA, automaticos: [
      { ...casa(0, 3192), acao: 'dividir', descricao: '13º Salário 1ª Parcela 2026', vencimento: '2026-11-30',
        segunda: { descricao: '13º Salário 2ª Parcela 2026', valor: 2462, vencimento: '2026-12-18' } }, casa(1, 900)] } });
    montar();
    await waitFor(() => expect(screen.getByTestId('acontece-0').textContent).toBe('vira a 1ª parcela'));
    expect(screen.getByTestId('descricao-0').getAttribute('title')).toBe('Folha Pagamento - 13 → 13º Salário 1ª Parcela 2026');
    expect(screen.getByTestId('vencimento-0').getAttribute('title')).toBe('05/12/2026 → 30/11/2026');
    expect(within(screen.getByTestId('segunda-0')).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['', '↳ a 2ª parcela fica prevista', '2ª parcela', '13º Salário 2ª Parcela 2026', '18/12/2026', '', '2.462,00', '']);
    expect(screen.queryByTestId('segunda-1')).toBeNull();
    expect(screen.getByTestId('vencimento-1').getAttribute('title')).toBeNull();
  });

  it('a recusa do banco vai à faixa como veio (nunca toast) e nada sobe', async () => {
    api.aplicar.mockImplementation(async (_c, _e, _d, _i, simular) => (simular ? { ok: true, dados: { ...VAZIA, automaticos: [casa(0, 3192), casa(1, 900)] } }
      : { ok: false, erro: 'O mês 11/2026 está fechado: nada foi gravado.' }));
    montar();
    await waitFor(() => expect(screen.getByTestId('aprovar-folha')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('aprovar-folha'));
    await waitFor(() => expect(screen.getByTestId('frase-da-folha').textContent).toBe('O mês 11/2026 está fechado: nada foi gravado.'));
    expect(api.subir).not.toHaveBeenCalled();
  });
});
