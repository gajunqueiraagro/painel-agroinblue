/** BPO-GUIA-01 — o guia "Como funciona": as regras puras e o modal (passos, o passo 6 só do admin, a prévia antes de ligar). Sintético. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const chamadas: { fn: string; a: Record<string, unknown> }[] = [];
vi.mock('@/integrations/supabase/client', () => {
  const tabelas: Record<string, unknown[]> = {
    cliente_membros: [{ user_id: 'u1', perfil: 'gestor_cliente', ativo: true }, { user_id: 'u2', perfil: 'campo', ativo: true }],
    financeiro_aprovadores: [], financeiro_bpo_config: [], profiles: [{ id: 'u1', nome: 'Gestor Sintético', email: 'g@x' }],
  };
  const q = (t: string) => { const o = { select: () => o, eq: () => o, in: () => o, limit: () => o, then: (r: (v: unknown) => unknown) => r({ data: tabelas[t] ?? [], error: null }) }; return o; };
  return { supabase: { from: (t: string) => q(t), rpc: (fn: string, a: Record<string, unknown>) => { chamadas.push({ fn, a }); return Promise.resolve({ data: { ok: true, simulado: a.p_simular, aguardando_ao_ligar: 7 }, error: null }); } } };
});
vi.mock('@/hooks/useLarguraDaJanela', () => ({ useLarguraDaJanela: () => 1366 }));

import { GuiaDaAprovacao } from './GuiaDaAprovacao';
import { alternarDia, candidatosAAprovador, foraDosDiasDePagamento, fraseDaPreviaDoLigar, textoDosDias } from '@/lib/financeiro/guiaDaAprovacao';

beforeEach(() => { chamadas.length = 0; });

describe('as regras do guia', () => {
  it('os dias de pagamento: texto, aviso fora do dia (só aviso) e alternar', () => {
    expect(textoDosDias([])).toBe('todos os dias');
    expect(textoDosDias([1, 3, 5])).toBe('seg, qua e sex');
    expect(textoDosDias([2])).toBe('só ter');
    expect(foraDosDiasDePagamento('2026-11-18', [1, 3, 5])).toBe(false);   // quarta
    expect(foraDosDiasDePagamento('2026-11-19', [1, 3, 5])).toBe(true);    // quinta
    expect(foraDosDiasDePagamento('2026-11-19', [])).toBe(false);          // sem dias = livre
    expect(alternarDia([1, 5], 3)).toEqual([1, 3, 5]);
    expect(alternarDia([1, 3, 5], 3)).toEqual([1, 5]);
  });
  it('candidatos a aprovador: só gestor/financeiro ATIVO (a regra da fn_bpo_aprovador_gravar), com o nome e o "já aprova"', () => {
    const c = candidatosAAprovador(
      [{ user_id: 'a', perfil: 'gestor_cliente', ativo: true }, { user_id: 'b', perfil: 'financeiro', ativo: false }, { user_id: 'c', perfil: 'campo', ativo: true }],
      [{ id: 'a', nome: 'Ana' }], [{ user_id: 'a' }]);
    expect(c).toEqual([{ userId: 'a', rotulo: 'Ana', perfil: 'gestor_cliente', jaAprova: true }]);
  });
  it('a frase da prévia', () => {
    expect(fraseDaPreviaDoLigar({ aguardando: 14, desde: '2026-11-19', aprovador: 'Ana', dias: [1, 3] }))
      .toBe('14 saídas em aberto desde 19/11/2026 · aprova Ana · seg e qua');
  });
});

describe('o modal', () => {
  it('cliente: 5 passos, "Entendi" no último; o passo 6 não existe', () => {
    const onFechar = vi.fn();
    render(<GuiaDaAprovacao aberto onFechar={onFechar} ehAdmin={false} clienteId="cli" ligado={false} onLigou={() => {}} />);
    expect(screen.getByTestId('guia-passos').querySelectorAll('button')).toHaveLength(5);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId('guia-avancar'));
    expect(screen.getByTestId('guia-passo-5')).toBeTruthy();
    expect(screen.getByTestId('guia-avancar').textContent).toBe('Entendi');
    fireEvent.click(screen.getByTestId('guia-avancar'));
    expect(onFechar).toHaveBeenCalledWith(true);   // "Não mostrar de novo" nasce marcado
    expect(chamadas).toHaveLength(0);
  });
  it('BPO-GUIA-01 (23/11): os 4 papéis — quem lança, quem aprova, a OPERADORA que agenda o aprovado e o banco; no caminho, a operadora agenda', () => {
    render(<GuiaDaAprovacao aberto onFechar={() => {}} ehAdmin={false} clienteId="cli" ligado={false} onLigou={() => {}} />);
    const papeis = screen.getByTestId('guia-papeis');
    expect(papeis.children).toHaveLength(4);
    expect(papeis.children[2].textContent).toBe('OperadoraAgenda o aprovadoSó o aprovado vira Agendado.');
    fireEvent.click(screen.getByTestId('guia-avancar'));
    fireEvent.click(screen.getByTestId('guia-avancar'));
    expect(screen.getByTestId('guia-passo-3').textContent).toContain('AgendadoOperadora agenda');
  });
  it('admin, passo 6: sem aprovador não liga; com ele, PRÉVIA (simular) e só depois "Ligar" grava', async () => {
    const onLigou = vi.fn();
    render(<GuiaDaAprovacao aberto passoInicial={5} onFechar={() => {}} ehAdmin clienteId="cli" ligado={false} onLigou={onLigou} />);
    expect(screen.getByTestId('guia-passos').querySelectorAll('button')).toHaveLength(6);
    expect(screen.getByTestId('guia-avancar').textContent).toBe('Prévia e ligar');
    fireEvent.click(screen.getByTestId('guia-avancar'));
    expect(await screen.findByTestId('guia-erro')).toBeTruthy();
    expect(chamadas).toHaveLength(0);
    fireEvent.click(screen.getByText('Seg'));   // um dia de pagamento (só para a frase)
    /* o aprovador: o único candidato já vem escolhido quando "já aprova"; aqui não aprova, então escolhe-se pelo seletor */
    await waitFor(() => expect(screen.queryByText('Lendo os gestores…')).toBeNull());
    const gatilho = screen.getByText('Quem aprova').parentElement?.querySelector('button');
    if (!gatilho) throw new Error('sem o seletor do aprovador');
    fireEvent.click(gatilho);
    await screen.findByTestId('searchable-select-painel');
    fireEvent.click(screen.getByTitle('Gestor Sintético').closest('button') ?? screen.getByTitle('Gestor Sintético'));
    fireEvent.click(screen.getByTestId('guia-avancar'));
    expect(await screen.findByTestId('guia-previa')).toBeTruthy();
    expect(chamadas.every((c) => c.a.p_simular === true)).toBe(true);
    expect(screen.getByTestId('guia-previa').textContent).toContain('7 saídas em aberto');
    expect(screen.getByTestId('guia-avancar').textContent).toBe('Ligar');
    fireEvent.click(screen.getByTestId('guia-avancar'));
    await waitFor(() => expect(onLigou).toHaveBeenCalled());
    expect(chamadas.filter((c) => c.a.p_simular === false).map((c) => c.fn)).toEqual(['fn_bpo_aprovador_gravar', 'fn_bpo_config_gravar']);
    expect(chamadas.find((c) => c.fn === 'fn_bpo_config_gravar' && c.a.p_simular === false)?.a.p_dias).toEqual([1]);
  });
});
