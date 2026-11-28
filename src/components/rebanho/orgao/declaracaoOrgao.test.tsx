/**
 * REBANHO-ORGAO-01 (F3 v3) — a tela "Declaração ao órgão" MONTADA com a API em memória (dado FICTÍCIO). Prende o mock v3:
 *   · abre na etapa da vez (Ano + mês) e na 1ª fazenda a declarar; o seletor diz o status (a declarar · declarada · sem rebanho); sem UF fica fora;
 *   · sem comprovante: a coluna do órgão é "—" e "Marcar como declarado" fica apagado;
 *   · soltar o Comprovante grava as LINHAS e o arquivo; o SISTEMA é o da MESMA DATA do saldo (o nascido depois não entra, e a tela avisa);
 *   · o PDF que não é do órgão não grava nada; editar grava o editado e o ↺ volta;
 *   · a diferença com causa abre o modal (a causa do sistema; nunca sugere morte);
 *   · marcar como declarado (o modal, comprovante opcional) congela a proposta na data do saldo → só leitura; desfazer pede motivo;
 *   · a etapa encerrada abre só leitura, sem pedir fatos; a fazenda sem rebanho mostra o vazio DENTRO do quadro e os cards ficam.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { DeclaracaoOrgao } from './DeclaracaoOrgaoTab';
import { declaracaoDaLinha, type DeclaracaoApi, type DeclaracaoGravada } from '@/lib/rebanho/orgao/declaracaoApi';
import type { LerLinhasDoPdf } from '@/hooks/useDeclaracaoOrgao';
import { COMPROVANTE_FICTICIO, PDF_QUALQUER } from '@/lib/rebanho/orgao/__fixtures__/iagroFicticio';

const ETAPAS = [
  { id: 'et-mai', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-05-01', fim: '2026-05-31', prorrogado_ate: '2026-06-02', ativo: true },
  { id: 'et-nov', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-11-01', fim: '2026-11-30', prorrogado_ate: null, ativo: true },
  { id: 'et-bru', uf: 'MS', orgao: 'IAGRO', tipo: 'brucelose', inicio: '2026-07-01', fim: '2026-12-31', prorrogado_ate: null, ativo: true },
];
const FATOS = {
  cliente_id: 'cli', desde: '2026-05-04', ate: '2026-11-30',
  fazendas: [{ id: 'A', nome: 'Fazenda Alfa', uf: 'MS' }, { id: 'B', nome: 'Fazenda Beta', uf: 'MS' }],
  nascimentos: [{ id: 'n1', fazenda_id: 'A', data: '2026-07-01', categoria: 'mamotes_f', cab: 6 }, { id: 'n2', fazenda_id: 'A', data: '2026-07-01', categoria: 'mamotes_m', cab: 5 },
    { id: 'n3', fazenda_id: 'A', data: '2026-11-27', categoria: 'mamotes_f', cab: 4 }],   // depois do saldo (23/11): não entra
  reclassificacoes: [], mortes_consumo: [], movimentos: [],
  ajustes: [{ id: 'a1', fazenda_id: 'A', data: '2026-09-30', sentido: 'saida', categoria: 'vacas', cab: 5 }],
  rebanho_hoje: [{ fazenda_id: 'A', ano_mes: '2026-11', categoria: 'mamotes_f', cab: 25 }, { fazenda_id: 'A', ano_mes: '2026-11', categoria: 'vacas', cab: 85 }],
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
      { id: 'A', nome: 'Fazenda Alfa', uf: 'MS', temPecuaria: true }, { id: 'B', nome: 'Fazenda Beta', uf: 'MS', temPecuaria: true },
      { id: 'C', nome: 'Fazenda Gama', uf: null, temPecuaria: true }] })),
    declaracoes: vi.fn<DeclaracaoApi['declaracoes']>(async () => ({ ok: true, dados: { desta: gravadas(), ultimaDeclarada: '2026-05-04' } })),
    fatos: vi.fn<DeclaracaoApi['fatos']>(async () => ({ ok: true, dados: FATOS })),
    gravar: vi.fn<DeclaracaoApi['gravar']>(async (fazendaId, etapaId, campos, versao) => {
      let l = linhas.find((x) => x.fazenda_id === fazendaId);
      if (l && versao !== l.versao) return { ok: false, erro: 'Outra pessoa mudou esta declaração: abra de novo. Nada foi gravado.' };
      if (!l) { l = { id: `d-${fazendaId}`, fazenda_id: fazendaId, etapa_id: etapaId, status: 'rascunho', editados: {}, versao: 0 }; linhas.push(l); }
      Object.assign(l, campos, { versao: Number(l.versao) + 1 });
      return { ok: true, dados: { id: String(l.id), versao: Number(l.versao) } };
    }),
    declarar: vi.fn<DeclaracaoApi['declarar']>(async (id, proposta, comprovante) => {
      const l = linhas.find((x) => x.id === id);
      if (!l) return { ok: false, erro: 'x' };
      Object.assign(l, { status: 'declarada', proposta, comprovante_arquivo: comprovante, declarada_em: '2026-11-24T12:00:00Z', versao: Number(l.versao) + 1 });
      return { ok: true, dados: { versao: Number(l.versao) } };
    }),
    desfazer: vi.fn<DeclaracaoApi['desfazer']>(async (id) => {
      const l = linhas.find((x) => x.id === id);
      if (l) Object.assign(l, { status: 'rascunho', declarada_em: null, versao: Number(l.versao) + 1 });
      return { ok: true, dados: true };
    }),
    egtas: vi.fn<DeclaracaoApi['egtas']>(async () => ({ ok: true, dados: { grava: 0, jaEstava: 0, recusa: [] } })),
    subirPdf: vi.fn<DeclaracaoApi['subirPdf']>(async () => ({ ok: true, dados: true })),
    urlDoArquivo: vi.fn<DeclaracaoApi['urlDoArquivo']>(async () => ({ ok: true, dados: 'https://exemplo.test/x.pdf' })),
  };
});

const montar = () => render(<DeclaracaoOrgao clienteId="cli" clienteNome="Cliente Teste" api={api} lerPdf={lerPdf} hoje="2026-11-24" />);
const soltar = async () => {
  const input = await screen.findByTestId('input-pdf-orgao');
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'saldo.pdf', { type: 'application/pdf' })] } });
};
const linha = (s: string, k: number) => screen.getByTestId(`linha-${s}-${k}`);
const celulas = (el: HTMLElement) => within(el).getAllByRole('cell').map((c) => c.textContent);
const comSaldo = async () => { montar(); await soltar(); await waitFor(() => expect(celulas(linha('F', 0))[2]).toBe('15')); };

describe('REBANHO-ORGAO-01 F3 v3 — a tela da declaração', () => {
  it('abre na etapa da vez (2026 · novembro) e na 1ª fazenda a declarar; sem comprovante o órgão é "—" e marcar fica apagado', async () => {
    montar();
    expect((await screen.findByTestId('prazo')).textContent).toBe('prazo 30/11 · faltam 6 dias');
    expect(within(screen.getByTestId('seletor-ano')).getByRole('button').textContent).toMatch(/2026/);
    expect(screen.getByRole('button', { name: 'novembro' }).className).toMatch(/bg-primary/);
    await waitFor(() => expect(api.fatos).toHaveBeenCalledWith('cli', '2026-05-04', '2026-11-30'));
    expect(within(screen.getByTestId('seletor-fazenda')).getAllByRole('button')[0].textContent).toMatch(/Fazenda Alfa/);
    expect(screen.getByTestId('status-da-fazenda').textContent).toBe('a declarar');
    await waitFor(() => expect(celulas(linha('F', 0))[2]).toBe('—'));   // a conta do sistema aparece; o órgão é "—" (nunca 0)
    expect(screen.getByTestId('chip-divergencias').textContent).toBe('sem comprovante lido');
    expect(screen.getByTestId('marcar-declarado')).toBeDisabled();
    expect(screen.getByText('1 fora da UF')).toBeTruthy();
  });

  it('soltar o Comprovante: grava as LINHAS e o arquivo; o sistema é o de 23/11 (o nascido em 27/11 não entra) e a tela avisa', async () => {
    await comSaldo();
    expect(api.subirPdf.mock.calls[0][0]).toBe('cli/orgao/et-nov/A/saldo.pdf');
    const [faz, etapa, campos, versao] = api.gravar.mock.calls[0];
    expect([faz, etapa, versao]).toEqual(['A', 'et-nov', null]);
    expect(campos).toMatchObject({ saldo: { linhas: [...COMPROVANTE_FICTICIO] }, saldo_arquivo: 'cli/orgao/et-nov/A/saldo.pdf' });
    expect(celulas(linha('M', 3))[2]).toBe('4');
    expect(screen.getByTestId('passo-saldo').textContent).toMatch(/Comprovante 23\/11\/2026 11:37 · lido/);
    expect(screen.getByTestId('sistema-F-0').textContent).toBe('21');                      // 25 no fim do mês − 4 nascidos em 27/11
    expect(screen.getByTestId('sistema-F-1').getAttribute('rowspan')).toBe('3');          // o bloco que o sistema não separa
    expect(screen.getByTestId('tabela-evolucao').textContent).toMatch(/1 lançamento\(s\) depois de 23\/11\/2026 · órgão em 23\/11\/2026 × sistema em 23\/11\/2026/);
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
    await comSaldo();
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

  it('a diferença com causa: ⓘ abre o modal com a causa do sistema e a regra de não sugerir morte', async () => {
    await comSaldo();
    fireEvent.click(screen.getByTestId('causa-F-1'));
    const m = await screen.findByTestId('modal-causa');
    expect(m.textContent).toMatch(/Fêmea de 13 a 24 meses a acima de 36 meses · não fecha/);
    expect(m.textContent).toMatch(/contagem sem registro/);
    expect(m.textContent).toMatch(/Ajuste de contagem de vacas \(−5\) em 30\/09\/2026/);
    expect(m.textContent).toMatch(/não sugere morte/);
  });

  it('marcar como declarado (o modal; comprovante opcional) congela a proposta NA DATA DO SALDO → só leitura; desfazer pede o motivo', async () => {
    await comSaldo();
    fireEvent.click(screen.getByTestId('marcar-declarado'));
    fireEvent.click(await screen.findByTestId('confirmar-declarado'));
    await waitFor(() => expect(api.declarar).toHaveBeenCalledTimes(1));
    const [id, proposta, comprovante, versao] = api.declarar.mock.calls[0];
    expect([id, comprovante, versao]).toEqual(['d-A', null, 1]);
    expect(proposta).toMatchObject({ referencia: '2026-11-23', desde: '2026-05-04' });
    expect(Object.keys(proposta)).toEqual(['referencia', 'desde', 'linhas', 'sistema']);
    expect((await screen.findByTestId('faixa-so-leitura')).textContent).toMatch(/declarada em 24\/11\/2026/);
    expect(screen.getByTestId('status-da-fazenda').textContent).toBe('declarada');
    expect(screen.queryByTestId('input-pdf-orgao')).toBeNull();
    expect(within(screen.getByTestId('nasc-F')).queryByRole('textbox')).toBeNull();   // os números congelados, sem campo
    fireEvent.click(screen.getByTestId('desfazer-declarado'));
    const confirmar = screen.getByRole('button', { name: 'Confirmar cancelamento' });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Motivo do cancelamento (obrigatório)'), { target: { value: 'errei a faixa' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.desfazer).toHaveBeenCalledWith('d-A', 'errei a faixa'));
  });

  it('a etapa encerrada (maio) abre só leitura, sem pedir fatos dela; a fazenda sem rebanho mostra o vazio DENTRO do quadro e os cards ficam', async () => {
    montar();
    await waitFor(() => expect(api.fatos).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'maio' }));
    await waitFor(() => expect(screen.getByTestId('prazo').textContent).toBe('etapa encerrada em 02/06/2026 · só leitura'));
    await waitFor(() => expect(screen.getByTestId('faixa-so-leitura').textContent).toMatch(/sem declaração marcada no sistema/));
    expect(screen.queryByTestId('input-pdf-orgao')).toBeNull();
    expect(api.fatos).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'novembro' }));
    fireEvent.click(within(screen.getByTestId('seletor-fazenda')).getAllByRole('button')[0]);
    fireEvent.click(await screen.findByText('Fazenda Beta'));
    await waitFor(() => expect(screen.getByTestId('status-da-fazenda').textContent).toBe('sem rebanho'));
    expect(screen.getByTestId('quadro-vazio').textContent).toMatch(/Sem rebanho nesta etapa/);
    for (const c of ['sugestao', 'diferencas', 'brucelose']) expect(screen.getByTestId(c)).toBeTruthy();
    expect(screen.getByTestId('chip-divergencias').textContent).toBe('sem rebanho nesta etapa');
  });
});
