/**
 * SUGESTAO-ITENS-03 R4 (Gabriel 27/11, lote 114530) — a tela manda à escada a UNIDADE e a QUANTIDADE de cada item (comida no atacado/granel
 * = nutrição do rebanho, nunca cantina). Sem elas, a R4 só olha o texto e o fornecedor. Dados SINTÉTICOS.
 */
import { describe, it, expect, vi } from 'vitest';

const banco = vi.hoisted(() => ({ pedidos: [] as { fn: string; args: unknown }[] }));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({ notificarFornecedoresMudaram: () => undefined }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (fn: string, args: unknown) => { banco.pedidos.push({ fn, args }); return Promise.resolve({ data: { ok: true, itens: [] }, error: null }); } },
}));

import { sugestaoPelosItens } from './nfeConsultas';

describe('sugestaoPelosItens — a unidade e a quantidade vão à escada', () => {
  it('cada item leva unidade e quantidade (o que não veio vai nulo)', async () => {
    const r = await sugestaoPelosItens('cli', { emitenteDocumento: '11.222.333/0001-44', destIe: null, emissao: '2026-11-20', favorecidoId: null, itens: [
      { nItem: 1, codigo: 'Q1', descricao: 'QUIRELA DE MILHO A GRANEL', ncm: '11031300', unidade: 'T', quantidade: '30.16' },
      { nItem: 2, codigo: null, descricao: 'ARROZ 5KG', ncm: '10063021' }] });
    expect(r.ok).toBe(true);
    const p = banco.pedidos.find((x) => x.fn === 'fn_itens_sugerir_conta');
    expect(p && typeof p.args === 'object' && p.args ? Reflect.get(p.args, 'p_itens') : null).toEqual([
      { n_item: 1, codigo: 'Q1', descricao: 'QUIRELA DE MILHO A GRANEL', ncm: '11031300', unidade: 'T', quantidade: '30.16' },
      { n_item: 2, codigo: null, descricao: 'ARROZ 5KG', ncm: '10063021', unidade: null, quantidade: null }]);
  });
});
