/** BPO-APROVACAO-01 P2 — a leitura da resposta da `fn_aprovacao_enviar` e a frase da prévia. Dados sintéticos. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
import { fraseDoEnvio, lerResultadoDoEnvio } from './EnviarParaAprovacaoDialog';

describe('Enviar para aprovação — a prévia', () => {
  it('lê a resposta do banco (fora do contrato = zeros) e escreve a frase', () => {
    const r = lerResultadoDoEnvio({ ok: true, simulado: true, enviados: 3, aprovados_pelo_mesmo: 1, recusados: [{ id: 'a', motivo: 'já pago' }, { id: 'b', motivo: 'já na fila' }, { id: 'c', motivo: 'já pago' }] });
    expect(r).toEqual({ enviados: 3, aprovadosPeloMesmo: 1, recusas: [{ id: 'a', motivo: 'já pago' }, { id: 'b', motivo: 'já na fila' }, { id: 'c', motivo: 'já pago' }] });
    expect(fraseDoEnvio(r)).toBe('3 vão para a fila · 1 nasce aprovado (você aprova) · 3 ficam de fora: já pago, já na fila');
    expect(lerResultadoDoEnvio(null)).toEqual({ enviados: 0, aprovadosPeloMesmo: 0, recusas: [] });
    expect(fraseDoEnvio(lerResultadoDoEnvio({ enviados: 1 }))).toBe('1 vai para a fila');
    expect(fraseDoEnvio(lerResultadoDoEnvio({}))).toBe('Nada a enviar.');
  });
});
