/**
 * P116 — a aba Auditoria do lançamento diz QUEM (Gabriel 27/10/2026; caso do Agnaldo, NF 778.618 1/4). Banco MOCKADO; dados SINTÉTICOS.
 *   Q1 uma pessoa só: a coluna do autor aparece mesmo assim (62px), com o primeiro nome
 *   Q2 o "criou" do gatilho é a criação: a linha montada do registro não duplica
 *   Q3 o Salvar sem mudança não aparece e a contagem do topo não o conta
 *   Q4 lançamento antigo (sem "criou" no audit_log): a criação vem do registro
 *   Q5 conciliação sem autor: "sistema · <rotina>" pela `via` da trilha da conciliação
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const estado = vi.hoisted(() => ({
  audit: [] as Array<Record<string, unknown>>,
  concil: [] as Array<Record<string, unknown>>,
  nomes: [{ user_id: 'u-agn', nome: 'Agnaldo Cedenho', email: null, situacao: 'membro ativo' }],
}));

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    for (const m of ['eq', 'in', 'order']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(ok({ data: nome === 'audit_log' ? estado.audit : nome === 'conciliacao_audit_log' ? estado.concil : [], error: null }));
    return q;
  };
  const rpc = (fn: string) => Promise.resolve({ data: fn === 'fn_nomes_dos_autores' ? estado.nomes : null, error: null });
  return { supabase: { from: tabela, rpc } };
});

import { AbaAuditoriaLancamento } from './AbaAuditoriaLancamento';

const criou = { id: 'e1', acao: 'criou', usuario_id: 'u-agn', created_at: '2026-10-23T09:12:47Z', via: null, dados_anteriores: null,
  dados_novos: { descricao: 'PRODUCE FR 1 L, LONTAL POUR ON FR 1 L · 10 itens 1/4', valor: 821.22 } };
const pagou = { id: 'e2', acao: 'editou', usuario_id: 'u-agn', created_at: '2026-10-23T15:16:35Z', via: null,
  dados_anteriores: { data_pagamento: null, status_transacao: 'programado', updated_at: 'a' },
  dados_novos: { data_pagamento: '2026-09-10', status_transacao: 'realizado', updated_at: 'b', updated_by: 'u-agn', editado_manual: true } };
const salvouIgual = { id: 'e3', acao: 'editou', usuario_id: 'u-agn', created_at: '2026-10-23T15:16:55Z', via: null,
  dados_anteriores: { valor: 821.22, updated_at: 'b' }, dados_novos: { valor: 821.22, updated_at: 'c' } };

const montar = () => render(
  <AbaAuditoriaLancamento lancamentoId="l-1" criadoPor="u-agn" criadoEm="2026-10-23T09:12:47Z" descricao="descrição de hoje" catalogos={{}} />);

beforeEach(() => { estado.audit = [criou, pagou, salvouIgual]; estado.concil = []; });

describe('P116 — quem fez, na aba Auditoria do lançamento', () => {
  it('Q1+Q2+Q3: uma pessoa só ainda mostra o autor; "criou" uma vez; o Salvar sem mudança some e não conta', async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId('trilha-autor')).toHaveLength(2));
    expect(screen.getAllByTestId('trilha-autor').map((x) => x.textContent)).toEqual(['Agnaldo', 'Agnaldo']);
    expect(screen.getAllByTestId('trilha-autor')[0].className).toContain('w-[62px]');
    expect(screen.getAllByText('criou')).toHaveLength(1);
    expect(screen.getByText('PRODUCE FR 1 L, LONTAL POUR ON FR 1 L · 10 itens 1/4')).toBeTruthy();
    expect(screen.queryByText('descrição de hoje')).toBeNull();
    expect(screen.getByText('alterou pagamento e situação')).toBeTruthy();
    expect(screen.queryByText('ajuste técnico')).toBeNull();
    expect(screen.getByText('2 eventos')).toBeTruthy();
  });

  it('Q4: sem "criou" no audit_log (lançamento antigo), a criação vem do registro', async () => {
    estado.audit = [pagou];
    montar();
    await waitFor(() => expect(screen.getByText('criou')).toBeTruthy());
    expect(screen.getByText('descrição de hoje')).toBeTruthy();
  });

  it('Q5: evento da conciliação sem autor diz a rotina pela `via`', async () => {
    estado.audit = [criou];
    estado.concil = [{ id: 'c1', acao: 'warning_mes_fechado', actor_user_id: null, created_at: '2026-10-24T10:00:00Z', extrato_id: null,
      motivo: null, payload_antes: null, payload_depois: null, via: 'sistema:manutenção' }];
    montar();
    await waitFor(() => expect(screen.getAllByTestId('trilha-autor').map((x) => x.textContent)).toContain('sistema · manutenção'));
  });
});
