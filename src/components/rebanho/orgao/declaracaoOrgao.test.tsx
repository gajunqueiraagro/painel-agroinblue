/**
 * REBANHO-ORGAO-01 (F3) — a tela "Declaração ao órgão" MONTADA com a API em memória (dado FICTÍCIO). Prende: sem comprovante a coluna IAGRO
 * é "—" e "Marcar como declarado" fica apagado com o motivo; soltar o Comprovante grava as LINHAS e o arquivo na pasta do cliente; o PDF
 * que não é do órgão não grava nada; editar uma célula grava o editado e o ↺ volta ao sugerido; declarar congela a proposta; desfazer pede
 * motivo; a fazenda sem UF fica fora (e a tela diz).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { DeclaracaoOrgao } from './DeclaracaoOrgaoTab';
import { declaracaoDaLinha, type DeclaracaoApi, type DeclaracaoGravada } from '@/lib/rebanho/orgao/declaracaoApi';
import type { LerLinhasDoPdf } from '@/hooks/useDeclaracaoOrgao';
import { COMPROVANTE_FICTICIO, PDF_QUALQUER } from '@/lib/rebanho/orgao/__fixtures__/iagroFicticio';

const ETAPAS = [
  { id: 'et-nov', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-11-01', fim: '2026-11-30', prorrogado_ate: null, ativo: true },
  { id: 'et-bru', uf: 'MS', orgao: 'IAGRO', tipo: 'brucelose', inicio: '2026-07-01', fim: '2026-12-31', prorrogado_ate: null, ativo: true },
];
const FATOS = {
  cliente_id: 'cli', desde: '2026-05-04', ate: '2026-11-30',
  fazendas: [{ id: 'A', nome: 'Fazenda Alfa', uf: 'MS' }, { id: 'B', nome: 'Fazenda Beta', uf: 'MS' }],
  nascimentos: [{ id: 'n1', fazenda_id: 'A', data: '2026-07-01', categoria: 'mamotes_f', cab: 6 }, { id: 'n2', fazenda_id: 'A', data: '2026-07-01', categoria: 'mamotes_m', cab: 5 }],
  reclassificacoes: [], mortes_consumo: [], ajustes: [], movimentos: [],
  rebanho_hoje: [{ fazenda_id: 'A', ano_mes: '2026-11', categoria: 'mamotes_f', cab: 21 }, { fazenda_id: 'A', ano_mes: '2026-11', categoria: 'vacas', cab: 90 }],
};

let linhas: Record<string, unknown>[];
let lerPdf: Mock<LerLinhasDoPdf>;
let api: { [K in keyof DeclaracaoApi]: Mock<DeclaracaoApi[K]> };
const gravadas = (): DeclaracaoGravada[] => linhas.flatMap((l) => { const d = declaracaoDaLinha(l); return d ? [d] : []; });

beforeEach(() => {
  linhas = [];
  lerPdf = vi.fn<LerLinhasDoPdf>(async () => [...COMPROVANTE_FICTICIO]);
  api = {
    etapas: vi.fn<DeclaracaoApi['etapas']>(async () => ({ ok: true, dados: ETAPAS })),
    fazendas: vi.fn<DeclaracaoApi['fazendas']>(async () => ({ ok: true, dados: [
      { id: 'A', nome: 'Fazenda Alfa', uf: 'MS' }, { id: 'B', nome: 'Fazenda Beta', uf: 'MS' }, { id: 'C', nome: 'Fazenda Gama', uf: null }] })),
    declaracoes: vi.fn<DeclaracaoApi['declaracoes']>(async () => ({ ok: true, dados: { desta: gravadas(), ultimaDeclarada: '2026-05-04' } })),
    fatos: vi.fn<DeclaracaoApi['fatos']>(async () => ({ ok: true, dados: FATOS })),
    gravar: vi.fn<DeclaracaoApi['gravar']>(async (fazendaId, etapaId, campos, versao) => {
      let l = linhas.find((x) => x.fazenda_id === fazendaId);
      if (l && versao !== l.versao) return { ok: false, erro: 'Outra pessoa mudou esta declaração: abra de novo. Nada foi gravado.' };
      if (!l) { l = { id: `d-${fazendaId}`, fazenda_id: fazendaId, etapa_id: etapaId, status: 'rascunho', editados: {}, versao: 0 }; linhas.push(l); }
      Object.assign(l, campos, { versao: Number(l.versao) + 1 });
      return { ok: true, dados: { id: String(l.id), versao: Number(l.versao) } };
    }),
    declarar: vi.fn<DeclaracaoApi['declarar']>(async (id, proposta) => {
      const l = linhas.find((x) => x.id === id);
      if (!l) return { ok: false, erro: 'x' };
      Object.assign(l, { status: 'declarada', proposta, declarada_em: '2026-11-24T12:00:00Z', versao: Number(l.versao) + 1 });
      return { ok: true, dados: { versao: Number(l.versao) } };
    }),
    desfazer: vi.fn<DeclaracaoApi['desfazer']>(async (id) => {
      const l = linhas.find((x) => x.id === id);
      if (l) Object.assign(l, { status: 'rascunho', declarada_em: null, versao: Number(l.versao) + 1 });
      return { ok: true, dados: true };
    }),
    egtas: vi.fn<DeclaracaoApi['egtas']>(async () => ({ ok: true, dados: { grava: 0, jaEstava: 0, recusa: [] } })),
    subirPdf: vi.fn<DeclaracaoApi['subirPdf']>(async () => ({ ok: true, dados: true })),
  };
});

const montar = () => render(<DeclaracaoOrgao clienteId="cli" clienteNome="Cliente Teste" api={api} lerPdf={lerPdf} hoje="2026-11-24" />);
const soltar = async () => {
  const input = await screen.findByTestId('input-pdf-orgao');
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'saldo.pdf', { type: 'application/pdf' })] } });
};
const linha = (s: string, k: number) => screen.getByTestId(`linha-${s}-${k}`);
const celulas = (el: HTMLElement) => within(el).getAllByRole('cell').map((c) => c.textContent);

describe('REBANHO-ORGAO-01 F3 — a tela da declaração', () => {
  it('abre na etapa da vez (prazo e dias), as fazendas da UF em abas, a sem UF fora; sem comprovante: IAGRO "—" e declarar apagado com o motivo', async () => {
    montar();
    expect((await screen.findByTestId('prazo')).textContent).toBe('prazo 30/11 · faltam 6 dias');
    expect(screen.getByRole('button', { name: 'Fazenda Alfa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fazenda Beta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fazenda Gama' })).toBeNull();
    await waitFor(() => expect(api.fatos).toHaveBeenCalledWith('cli', '2026-05-04', '2026-11-30'));
    expect(screen.getByTestId('fonte').textContent).toMatch(/desde a última declaração \(04\/05\/2026\).*1 fazenda\(s\) fora/);
    expect(celulas(linha('F', 0))[2]).toBe('—');
    expect(screen.getByTestId('chip-divergencias').textContent).toBe('sem comprovante lido');
    expect(screen.getByTestId('marcar-declarado')).toBeDisabled();
    expect(screen.getByTestId('motivo-do-botao').textContent).toBe('leia o comprovante do órgão');
  });

  it('soltar o Comprovante: grava as LINHAS e o arquivo na pasta <cliente>/orgao/<etapa>/<fazenda>; a coluna IAGRO enche e o passo 1 fica feito', async () => {
    montar();
    await soltar();
    await waitFor(() => expect(api.gravar).toHaveBeenCalledTimes(1));
    expect(api.subirPdf.mock.calls[0][0]).toBe('cli/orgao/et-nov/A/saldo.pdf');
    const [faz, etapa, campos, versao] = api.gravar.mock.calls[0];
    expect([faz, etapa, versao]).toEqual(['A', 'et-nov', null]);
    expect(campos).toMatchObject({ saldo: { linhas: [...COMPROVANTE_FICTICIO] }, saldo_arquivo: 'cli/orgao/et-nov/A/saldo.pdf' });
    await waitFor(() => expect(celulas(linha('F', 0))[2]).toBe('15'));
    expect(celulas(linha('M', 3))[2]).toBe('4');
    expect(screen.getByTestId('passo-saldo').textContent).toMatch(/Comprovante 23\/11 11:37 · lido/);
    /* o sistema não separa novilha/vaca: o bloco 13-24…37+ das fêmeas com a Dif. do bloco */
    expect(screen.getByTestId('sistema-F-1').getAttribute('rowspan')).toBe('3');
  });

  it('o PDF que não é do órgão: a frase e NADA grava (nem sobe)', async () => {
    lerPdf.mockResolvedValue([...PDF_QUALQUER]);
    montar();
    await soltar();
    await waitFor(() => expect(screen.getByTestId('frase-da-declaracao').textContent).toMatch(/Nada foi gravado/));
    expect(api.subirPdf).not.toHaveBeenCalled();
    expect(api.gravar).not.toHaveBeenCalled();
  });

  it('editar uma célula grava o editado (com a versão); o ↺ volta ao sugerido', async () => {
    montar();
    await soltar();
    await waitFor(() => expect(celulas(linha('F', 0))[2]).toBe('15'));
    const campo = within(screen.getByTestId('nasc-F')).getByRole('textbox');
    fireEvent.change(campo, { target: { value: '9' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(api.gravar).toHaveBeenCalledTimes(2));
    expect(api.gravar.mock.calls[1][2]).toEqual({ editados: { F: { nascimentos: 9 } } });
    expect(api.gravar.mock.calls[1][3]).toBe(1);
    await waitFor(() => expect(screen.getByTestId('nasc-F-voltar').className).not.toMatch(/invisible/));
    fireEvent.click(screen.getByTestId('nasc-F-voltar'));
    await waitFor(() => expect(api.gravar).toHaveBeenCalledTimes(3));
    expect(api.gravar.mock.calls[2][2]).toEqual({ editados: {} });
  });

  it('declarar congela a proposta (linhas e sistema); depois, desfazer pede o motivo', async () => {
    montar();
    await soltar();
    await waitFor(() => expect(screen.getByTestId('marcar-declarado')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('marcar-declarado'));
    await waitFor(() => expect(api.declarar).toHaveBeenCalledTimes(1));
    const [id, proposta, , versao] = api.declarar.mock.calls[0];
    expect([id, versao]).toEqual(['d-A', 1]);
    expect(proposta).toMatchObject({ referencia: '2026-11-30', desde: '2026-05-04' });
    expect(Object.keys(proposta)).toEqual(['referencia', 'desde', 'linhas', 'sistema']);
    fireEvent.click(await screen.findByTestId('desfazer-declarado'));
    const motivo = screen.getByTestId('motivo-desfazer');
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
    fireEvent.change(motivo, { target: { value: 'errei a faixa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(api.desfazer).toHaveBeenCalledWith('d-A', 'errei a faixa'));
  });
});
