/**
 * MAPA-PIQUETES-02 — a tela dos piquetes: "É piquete de…" põe na espera (nada grava); o painel da espera só acende o "Concluir" com 2+
 * (o motivo ao lado); o diálogo mostra a PRÉVIA do banco (números como vieram), a recusa do banco dentro dele (sem Gravar), e o Gravar
 * chama a RPC com p_simular = false e avisa quem chamou.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const estado = vi.hoisted(() => ({ chamadas: [] as Record<string, unknown>[], resposta: null as unknown, erro: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (fn: string, a: Record<string, unknown>) => { estado.chamadas.push({ fn, ...a }); return Promise.resolve({ data: estado.erro ? null : (a.p_simular ? estado.resposta : { ok: true, simulado: false, grupo_id: 'g-novo' }), error: estado.erro }); } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConcluirPiquetesDialog, PiquetesEmEspera, pastosQuePodemSerPai } from './PiquetesDoPoligono';
import type { Pasto } from '@/hooks/usePastos';

const pasto = (id: string, nome: string, o: Partial<Pasto> = {}): Pasto => ({
  id, fazenda_id: 'f', nome, lote_padrao: null, area_produtiva_ha: 92.6, tipo_uso: 'cria', qualidade: null, entra_conciliacao: true,
  ativo: true, observacoes: null, ordem_exibicao: 0, data_inicio: null, data_fim: null, grupo_id: null, created_at: '', updated_at: '', ...o,
});
const PIQ = [{ geometriaId: 'g1', nome: '1A', paiId: 'r01' }, { geometriaId: 'g2', nome: '1B', paiId: 'r01' }];
const PREVIA = {
  ok: true, simulado: true, mes: '2026-11-01', pai: { id: 'r01', nome: 'R_01', area_oficial_ha: 92.6, encerra_em: '2026-10-31' },
  piquetes: [{ geometria_id: 'g1', nome: '1A', area_ha: 23.63 }, { geometria_id: 'g2', nome: '1B', area_ha: 69.27 }],
  soma_ha: 92.9, dif_ha: 0.3, dif_pct: 0.3, grupo: { nome: 'R_01', area_ha: 92.9 }, frase: '',
};

beforeEach(() => { estado.chamadas = []; estado.resposta = PREVIA; estado.erro = null; });

describe('quem pode ser pai', () => {
  it('só ativo, sem fim de vigência e fora de grupo', () => {
    const lista = pastosQuePodemSerPai([pasto('a', 'R_01'), pasto('b', 'Velho', { data_fim: '2025-12-31' }), pasto('c', 'Em grupo', { grupo_id: 'x' }),
      pasto('d', 'Inativo', { ativo: false })]);
    expect(lista.map((p) => p.nome)).toEqual(['R_01']);
  });
});

describe('o painel da espera', () => {
  it('com 1 piquete o Concluir fica apagado e diz por quê; com 2 abre o diálogo do pai', () => {
    const onConcluir = vi.fn();
    const { rerender } = render(<PiquetesEmEspera espera={[PIQ[0]]} pastos={[pasto('r01', 'R_01')]} onTirar={() => {}} onConcluir={onConcluir} />);
    const botao = screen.getByRole('button', { name: 'Concluir piquetes de R_01' });
    expect(botao).toBeDisabled();
    expect(screen.getByText('Marque pelo menos 2 polígonos.')).toBeTruthy();
    rerender(<PiquetesEmEspera espera={PIQ} pastos={[pasto('r01', 'R_01')]} onTirar={() => {}} onConcluir={onConcluir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir piquetes de R_01' }));
    expect(onConcluir).toHaveBeenCalledWith('r01', PIQ);
  });
  it('o × tira da espera', () => {
    const onTirar = vi.fn();
    render(<PiquetesEmEspera espera={PIQ} pastos={[pasto('r01', 'R_01')]} onTirar={onTirar} onConcluir={() => {}} />);
    fireEvent.click(screen.getByLabelText('Tirar 1B da espera'));
    expect(onTirar).toHaveBeenCalledWith('g2');
  });
});

describe('o diálogo', () => {
  const abrir = (onGravado = vi.fn()) => render(<ConcluirPiquetesDialog aberto paiId="r01" nomeDoPai="R_01" piquetes={PIQ}
    hoje={new Date(2026, 10, 1)} onFechar={() => {}} onGravado={onGravado} />);

  it('pede a prévia (p_simular = true, o mês atual) e mostra os números do banco; datas dd/mm/aaaa', async () => {
    abrir();
    await waitFor(() => expect(document.querySelector('tr[data-piquete="1A"]')).toBeTruthy());
    expect(estado.chamadas[0]).toEqual({ fn: 'fn_piquetes_concluir', p_pasto_pai: 'r01', p_geometrias: ['g1', 'g2'], p_mes: '2026-11-01', p_simular: true, p_contorno: null });
    expect(document.querySelector('tr[data-piquete="1A"]')?.textContent).toContain('23,63');
    expect(document.querySelector('tr[data-linha="soma"]')?.textContent).toContain('92,90');
    expect(document.querySelector('tr[data-linha="oficial"]')?.textContent).toContain('92,60');
    expect(document.querySelector('tr[data-linha="diferenca"]')?.textContent).toContain('+0,30 (+0,3%)');
    /* FECH-PASTO-UNIDADE-01: o pai não se encerra mais — segue sendo o pasto e o card */
    expect(screen.getByTestId('previa-pai').textContent).toContain('R_01 segue sendo o pasto e o card de cada mês');
    expect(screen.getByTestId('previa-pai').textContent).not.toContain('encerrado');
  });
  it('trocar o mês pede outra prévia', async () => {
    abrir();
    await waitFor(() => expect(estado.chamadas.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: '10/2026' }));
    await waitFor(() => expect(estado.chamadas.length).toBe(2));
    expect(estado.chamadas[1].p_mes).toBe('2026-10-01');
  });
  it('a recusa do banco aparece inteira, dentro do diálogo, e o Gravar fica apagado', async () => {
    estado.erro = { code: 'P0001', message: 'Os piquetes não começam em 11/2026: o pasto está fechado em 11/2026. Reabra o mês ou escolha um mês depois. Nada foi gravado.' };
    abrir();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('o pasto está fechado em 11/2026'));
    expect(screen.getByRole('button', { name: 'Gravar' })).toBeDisabled();
  });
  it('falha que não é recusa vira a frase da casa (nunca prévia vazia)', async () => {
    estado.erro = { code: '57014', message: 'canceling statement due to statement timeout' };
    abrir();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não consegui concluir: o banco demorou demais para responder.'));
  });
  it('Gravar chama a RPC com p_simular = false e avisa quem chamou', async () => {
    const onGravado = vi.fn();
    abrir(onGravado);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gravar' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(onGravado).toHaveBeenCalledWith('r01'));
    expect(estado.chamadas.at(-1)).toEqual({ fn: 'fn_piquetes_concluir', p_pasto_pai: 'r01', p_geometrias: ['g1', 'g2'], p_mes: '2026-11-01', p_simular: false, p_contorno: null });
  });
  /* MAPA-PIQUETES-04: o pai sem polígono leva o contorno (a união) nas DUAS chamadas; a união que não fecha recusa antes do banco */
  const CONTORNO: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] };
  it('com o contorno: a prévia e o Gravar mandam o p_contorno', async () => {
    render(<ConcluirPiquetesDialog aberto paiId="r01" nomeDoPai="R_01" piquetes={PIQ} hoje={new Date(2026, 10, 1)} onFechar={() => {}}
      onGravado={vi.fn()} contorno={{ ok: true, valor: CONTORNO }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gravar' })).not.toBeDisabled());
    expect(estado.chamadas[0].p_contorno).toEqual(CONTORNO);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(estado.chamadas.at(-1)?.p_simular).toBe(false));
    expect(estado.chamadas.at(-1)?.p_contorno).toEqual(CONTORNO);
  });
  it('a união que não fecha: a frase dela no diálogo, nenhuma chamada ao banco, Gravar apagado', async () => {
    render(<ConcluirPiquetesDialog aberto paiId="r01" nomeDoPai="R_01" piquetes={PIQ} hoje={new Date(2026, 10, 1)} onFechar={() => {}}
      onGravado={vi.fn()} contorno={{ ok: false, motivo: 'O contorno não fecha: 1B não encosta nos outros.' }} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('O contorno não fecha: 1B não encosta nos outros. Nada foi gravado.'));
    expect(estado.chamadas).toEqual([]);
    expect(screen.getByRole('button', { name: 'Gravar' })).toBeDisabled();
  });
});
