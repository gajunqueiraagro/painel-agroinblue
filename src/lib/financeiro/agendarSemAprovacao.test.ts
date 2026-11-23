/** BPO-APROVACAO-01 P3 — agendar sem aprovação: a tela pergunta antes de gravar (a frase ao lado do botão). Dados sintéticos. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const respostas: Record<string, { data: unknown; error: unknown }> = {};
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const q = { select: () => q, eq: () => q, limit: () => Promise.resolve(respostas[tabela] ?? { data: [], error: null }) };
    return q;
  };
  return { supabase: { from: (t: string) => consulta(t) } };
});

import { agendarSeriaRecusado, vaiAgendar } from './aprovacao';

beforeEach(() => { for (const k of Object.keys(respostas)) delete respostas[k]; });

describe('vaiAgendar — a mesma condição do gatilho', () => {
  it('só a MUDANÇA para agendado, só saída', () => {
    expect(vaiAgendar('agendado', 'programado', '2-Saídas')).toBe(true);
    expect(vaiAgendar('agendado', null, '2-Saídas')).toBe(true);           // lançamento novo já agendado
    expect(vaiAgendar('agendado', 'agendado', '2-Saídas')).toBe(false);     // já estava: o gatilho não age
    expect(vaiAgendar('agendado', 'programado', '1-Entradas')).toBe(false);
    expect(vaiAgendar('programado', 'previsto', '2-Saídas')).toBe(false);
  });
});

describe('agendarSeriaRecusado', () => {
  it('BPO desligado (ou sem config, ou a leitura falhou): nunca recusa — o banco decide', async () => {
    expect(await agendarSeriaRecusado('cli', 'l1')).toBe(false);
    respostas.financeiro_bpo_config = { data: [{ ativo: false }], error: null };
    expect(await agendarSeriaRecusado('cli', 'l1')).toBe(false);
    respostas.financeiro_bpo_config = { data: null, error: { message: 'x' } };
    expect(await agendarSeriaRecusado('cli', 'l1')).toBe(false);
  });
  it('BPO ligado: sem aprovação recusa; aprovado passa; o NOVO (sem id) sempre recusa', async () => {
    respostas.financeiro_bpo_config = { data: [{ ativo: true }], error: null };
    expect(await agendarSeriaRecusado('cli', 'l1')).toBe(true);
    respostas.financeiro_aprovacoes = { data: [{ id: 'a1' }], error: null };
    expect(await agendarSeriaRecusado('cli', 'l1')).toBe(false);
    expect(await agendarSeriaRecusado('cli', null)).toBe(true);
  });
});
