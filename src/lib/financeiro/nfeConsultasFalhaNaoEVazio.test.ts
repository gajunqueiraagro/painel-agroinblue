/**
 * P146 (Gabriel 27/10/2026) — A CONSULTA QUE DECIDE NAO DEVOLVE "VAZIO" QUANDO FALHA. Antes, `notaJaLancada` (e as irmas) devolviam lista
 * vazia / nulo no erro, e a previa da nota tratava "nao consegui verificar" igual a "nao achei" e oferecia "Criar" (Neosolar, NF 65.089,
 * 27/10 11:01). Aqui: o banco responde erro (e a rede estoura) → `{ ok: false, motivo }`; o banco responde → `{ ok: true, valor }`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = vi.hoisted(() => ({ modo: 'ok' as 'ok' | 'erro' | 'estoura' }));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({ notificarFornecedoresMudaram: () => undefined }));
vi.mock('@/integrations/supabase/client', () => {
  const resposta = (data: unknown) => {
    if (banco.modo === 'estoura') return Promise.reject(new Error('Failed to fetch'));
    return Promise.resolve(banco.modo === 'erro' ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : { data, error: null });
  };
  const cadeia = (data: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
    b.then = (ok: (x: unknown) => unknown, ruim?: (e: unknown) => unknown) => resposta(data).then(ok, ruim);
    return b;
  };
  return { supabase: { rpc: () => resposta([]), from: () => cadeia([]) } };
});

import { fornecedorPeloDocumento, fornecedorPeloNome, lancamentosAbertosComValor, notaJaLancada, notaJaRegistrada } from './nfeConsultas';

const CHAVE = '31260512420339000398550010000650891380356881';
const CONSULTAS = {
  notaJaLancada: () => notaJaLancada('cli', { parcelas: [{ n: 1, vencimento: '2026-05-16', valorCent: 23999 }], numero: '000.065.089', chave: CHAVE,
    emitenteDocumento: '12420339000398', nomes: ['Neosolar Energia Ltda'] }),
  notaJaRegistrada: () => notaJaRegistrada('cli', CHAVE),
  lancamentosAbertosComValor: () => lancamentosAbertosComValor('cli', 'forn', [23999]),
  fornecedorPeloDocumento: () => fornecedorPeloDocumento('cli', '12.420.339/0003-98'),
  fornecedorPeloNome: () => fornecedorPeloNome('cli', 'Neosolar Energia Ltda'),
};

beforeEach(() => { banco.modo = 'ok'; vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('P146 — falhou nunca vira vazio', () => {
  for (const [nome, chamar] of Object.entries(CONSULTAS)) {
    it(`${nome}: o banco responde → ok; o banco dá erro → ok:false com o motivo; a rede estoura → ok:false`, async () => {
      expect((await chamar()).ok).toBe(true);
      banco.modo = 'erro';
      const r = await chamar();
      /* o motivo em FRASE PRONTA (OC-ABRIR-LENTO-01: o texto cru do banco vai ao console, nunca a' tela) */
      expect(r).toEqual({ ok: false, motivo: 'o banco demorou demais para responder' });
      banco.modo = 'estoura';
      expect(await chamar()).toEqual({ ok: false, motivo: 'sem conexão com o servidor' });
    });
  }
});
