/** LOTES-03 F1 — a ficha mínima: números do fechamento, só Resumo e Histórico, gravações pela RPC com a versão, recusa do banco na faixa. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const notificar = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useLotesDaFazenda', () => ({ notificarLotesMudaram: notificar }));
const eventos = vi.hoisted(() => ({ lista: [] as unknown[] }));
vi.mock('@/hooks/useHistoricoDoLote', () => ({
  useHistoricoDoLote: () => ({ eventos: eventos.lista, carregando: false, erro: null, recarregar: vi.fn() }),
}));
const toastOk = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastOk, error: vi.fn() } }));

import { FichaDoLote, diasAte, projecaoDoLote, fraseDoErro } from './FichaDoLote';
import type { CadastroDoLote, LoteDaLista } from '@/lib/lotes/tipos';

const LOTE: LoteDaLista = {
  id: 'l1', codigo: 'DF-NE-RC-05', codigosAntigos: [], nomeCampeiro: 'L05 - DF Nel. SP', situacao: 'ativo', formadoEm: '2026-09-30', encerradoEm: null,
  categoriaId: 'df', racaId: 'ne', atividadeId: 'rc', numero: 5, sistemaId: 'sc', programaId: null, destinoId: null, safra: '26/27', carimbo: null,
  idadeMediaMeses: 9, metaPesoKg: 380, metaGmdKg: 0.85, metaData: null, versao: 4, anoMesDado: '2026-10', cabecas: 80, pesoMedioKg: 320, gmdKg: 0.84,
  pastos: ['CONF.01'], lancamentos: 1, conferir: null,
};
const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string | null, nome: string): CadastroDoLote => ({ id, tipo, sigla, nome, categoriasRebanho: [], ordem: 0, ativo: true });
const CADASTROS = [cad('df', 'categoria', 'DF', 'Desmama fêmea'), cad('ne', 'raca', 'NE', 'Nelore'), cad('rc', 'atividade', 'RC', 'Recria'), cad('sc', 'sistema', null, 'Confinamento')];

const montar = (l: LoteDaLista = LOTE, onFechar = vi.fn()) => render(
  <FichaDoLote open lote={l} clienteId="c" fazendaId="f" fazendaCodigo="PUR" cadastros={CADASTROS} onFechar={onFechar} onEditarIdentidade={vi.fn()} />);

beforeEach(() => { rpc.mockReset(); notificar.mockReset(); toastOk.mockReset(); eventos.lista = []; });

describe('FichaDoLote', () => {
  it('117440: lote marcado "conferir" mostra o motivo na faixa; Conferido grava conferir vazio com a versão e avisa', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    montar({ ...LOTE, conferir: 'o nome diz N1; o lançado é N2' });
    expect(screen.getByTestId('ficha-conferir').textContent).toBe('Conferir: o nome diz N1; o lançado é N2');
    fireEvent.click(screen.getByTestId('ficha-conferido'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_lote_salvar', { p_id: 'l1', p_fazenda: null, p_campos: { conferir: '' }, p_versao: 4, p_motivo: 'conferido', p_simular: false }));
    expect(notificar).toHaveBeenCalledWith('f');
  });
  it('117440: lote sem "conferir" não mostra a linha nem o botão', () => {
    montar();
    expect(screen.queryByTestId('ficha-conferir')).toBeNull();
    expect(screen.queryByTestId('ficha-conferido')).toBeNull();
  });
  it('a faixa do sistema lê o fechamento (sem custo na F1) e só há Resumo e Histórico', () => {
    montar();
    const kpis = screen.getByTestId('ficha-kpis');
    expect(within(kpis).getByText('80')).toBeTruthy();
    expect(within(kpis).getByText('25.600')).toBeTruthy();     // peso total 80 × 320
    expect(within(kpis).queryByText(/Custo/)).toBeNull();
    for (const aba of ['Nutrição', 'Sanidade', 'Reprodução', 'Destino e abates']) expect(screen.queryByText(aba)).toBeNull();
    expect(screen.getByText('Resumo')).toBeTruthy();
    expect(screen.getByText('Histórico')).toBeTruthy();
  });

  it('cancelar com lançamento: a frase do banco aparece na faixa e nada se avisa', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Não dá para cancelar: DF-NE-RC-05 tem 1 lançamento no fechamento. Use Encerrar lote.' } });
    montar();
    fireEvent.click(screen.getByTestId('ficha-cancelar'));
    await waitFor(() => expect(screen.getByTestId('ficha-faixa').textContent).toContain('Use Encerrar lote.'));
    expect(rpc).toHaveBeenCalledWith('fn_lote_situacao', expect.objectContaining({ p_id: 'l1', p_situacao: 'cancelado', p_versao: 4, p_simular: false }));
    expect(notificar).not.toHaveBeenCalled();
  });

  it('cancelar sem lançamento: fecha a ficha, avisa as telas e oferece Desfazer (volta a ativo com a versão nova)', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const fechar = vi.fn();
    montar({ ...LOTE, cabecas: null, lancamentos: 0 }, fechar);
    fireEvent.click(screen.getByTestId('ficha-cancelar'));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    expect(notificar).toHaveBeenCalledWith('f');
    const opcoes = toastOk.mock.calls[0][1];
    opcoes.action.onClick();
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('fn_lote_situacao', expect.objectContaining({ p_situacao: 'ativo', p_versao: 5 })));
  });

  it('encerrar com cabeças no fechamento pergunta antes; "mesmo assim" grava com a versão', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    montar();
    fireEvent.click(screen.getByTestId('ficha-encerrar'));
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Encerrar mesmo assim (fim do mês)'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_lote_situacao', expect.objectContaining({ p_situacao: 'encerrado', p_versao: 4 })));
    expect(notificar).toHaveBeenCalledWith('f');
  });

  it('perfil no bloco: Salvar manda só o que mudou, com a versão; safra fora do formato fica no campo e não grava', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    montar();
    fireEvent.click(screen.getByTestId('perfil-editar'));
    const safra = screen.getByDisplayValue('26/27');
    fireEvent.change(safra, { target: { value: '2627' } });
    fireEvent.click(screen.getByTestId('perfil-salvar'));
    expect(screen.getByTestId('perfil-erro').textContent).toBe('Safra: no formato 26/27.');
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue('2627'), { target: { value: '27/28' } });
    fireEvent.click(screen.getByTestId('perfil-salvar'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_lote_salvar', { p_id: 'l1', p_fazenda: null, p_campos: { safra: '27/28' }, p_versao: 4, p_motivo: null, p_simular: false }));
    expect(notificar).toHaveBeenCalledWith('f');
  });

  it('Histórico: Desfazer grava o ANTES pela mesma RPC, com o motivo "desfazer: …"', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    eventos.lista = [{ id: 'a1', criadoEm: '2026-11-06T17:45:00-03:00', usuarioId: 'u', via: null, acao: 'editou', resumo: 'motivo: lote editado', autor: 'Gabriel',
      antes: { sistema_id: 'sc', codigo: 'DF-NE-RC-05' }, depois: { sistema_id: null, codigo: 'DF-NE-RC-05' } }];
    montar();
    fireEvent.click(screen.getByText('Histórico'));
    const linha = screen.getByTestId('linha-historico');
    expect(linha.textContent).toContain('06/11/2026');
    expect(linha.textContent).toContain('Confinamento');
    fireEvent.click(within(linha).getByTestId('historico-desfazer'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_lote_salvar', expect.objectContaining({ p_campos: { sistema_id: 'sc' }, p_versao: 4, p_motivo: 'desfazer: sistema' })));
  });
});

describe('as contas da ficha', () => {
  it('projeção pelo GMD do fechamento até a data alvo; sem meta/data = nula', () => {
    expect(diasAte('2026-12-15', '2026-11-06')).toBe(39);
    expect(diasAte('2026-10-01', '2026-11-06')).toBe(0);
    expect(projecaoDoLote({ pesoMedioKg: 320, gmdKg: 0.84, metaPesoKg: 380, metaData: '2026-12-15' }, '2026-11-06')).toEqual({ pesoNaData: 320 + 0.84 * 39, chega: false });
    expect(projecaoDoLote({ pesoMedioKg: 320, gmdKg: 0.84, metaPesoKg: 340, metaData: '2026-12-15' }, '2026-11-06')?.chega).toBe(true);
    expect(projecaoDoLote({ pesoMedioKg: 320, gmdKg: null, metaPesoKg: 380, metaData: '2026-12-15' }, '2026-11-06')).toBeNull();
  });
  it('a frase do erro: a do banco quando P0001/40001; a da casa para o resto', () => {
    expect(fraseDoErro({ code: 'P0001', message: 'Já existe o lote X.' })).toBe('Já existe o lote X.');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fraseDoErro({ code: '500', message: 'internal' })).toBe('Não consegui gravar o lote. Nada foi gravado.');
  });
});
