/**
 * FIN-GUARDA-CHUVA G2 — as chamadas da LINHA DE CRÉDITO (118060). A tela só chama o banco: prévia (`p_simular = true`) antes de
 * gravar, a gravação com o mesmo pedido, o cancelar (prévia e gravação) e a leitura da tela da linha. Erro do banco vira frase
 * (P0001 já vem em português; 42501 = "sem acesso"), nunca o objeto cru.
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lerPreviaDaLinha, lerTelaDaLinha, pedidoDaLinha, type FormDaLinha, type PreviaDaLinha, type TelaDaLinha } from '@/lib/financiamentos/linhaDeCredito';

export function fraseDoErroDaLinha(e: unknown): string {
  const m = typeof e === 'object' && e !== null ? Reflect.get(e, 'message') : e;
  const texto = typeof m === 'string' ? m : String(m ?? '');
  return texto.replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, '').trim() || 'Não foi possível gravar.';
}

/** Os dois lados declaram os dois campos: o tsconfig.app.json é `strict: false` e lá o TS NÃO estreita a união pelo `ok`. */
export type Resultado<T> = { ok: true; valor: T; erro?: undefined } | { ok: false; erro: string; valor?: undefined };

export function useLinhaDeCredito(clienteId: string | null) {
  const salvar = useCallback(async (id: string | null, form: FormDaLinha, simular: boolean, motivo: string | null,
    nomeDoCredor: (id: string) => string | null): Promise<Resultado<PreviaDaLinha>> => {
    if (!clienteId) return { ok: false, erro: 'Escolha o cliente.' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_linha_credito_salvar', {
      p_cliente_id: clienteId, p_id: id, p_dados: pedidoDaLinha(form), p_motivo: motivo, p_simular: simular,
    });
    if (error) return { ok: false, erro: fraseDoErroDaLinha(error) };
    const p = lerPreviaDaLinha(data, nomeDoCredor);
    return p ? { ok: true, valor: p } : { ok: false, erro: 'Não consegui ler a resposta do banco.' };
  }, [clienteId]);

  const cancelar = useCallback(async (id: string, motivo: string, simular: boolean): Promise<Resultado<{ ok: boolean; recusa: string | null }>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_linha_credito_cancelar', { p_id: id, p_motivo: motivo, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErroDaLinha(error) };
    const ok = typeof data === 'object' && data !== null && Reflect.get(data, 'ok') === true;
    const recusa = typeof data === 'object' && data !== null ? Reflect.get(data, 'recusa') : null;
    const frase = typeof recusa === 'object' && recusa !== null ? Reflect.get(recusa, 'frase') : null;
    return { ok: true, valor: { ok, recusa: typeof frase === 'string' ? frase : null } };
  }, []);

  const lerTela = useCallback(async (id: string, hoje: string): Promise<Resultado<TelaDaLinha>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_linha_credito_tela', { p_id: id, p_hoje: hoje });
    if (error) return { ok: false, erro: fraseDoErroDaLinha(error) };
    const t = lerTelaDaLinha(data);
    return t ? { ok: true, valor: t } : { ok: false, erro: 'Não consegui ler a linha de crédito.' };
  }, []);

  return { salvar, cancelar, lerTela };
}
