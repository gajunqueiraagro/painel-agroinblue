/**
 * "Isto é uma transferência" — [ENRIQUECER-EXPLICA-02] (133i-b item 1).
 *
 * ⚠ A RPC ACEITA AS DUAS PONTAS, e é isso que a distingue da `fn_fatura_aplicar`, que só
 * aceitava saída (`s.sinal <> '-1'` → recusa). Aqui a própria conta sai da mesma régua do
 * Conciliar — `CASE tipo WHEN '1-Entradas' THEN conta_destino_id ELSE conta_bancaria_id` —
 * e a conta escolhida entra do outro lado. O front não decide origem nem destino: manda o
 * lançamento e a outra conta, e o banco monta o par.
 *
 * ⚠ SIMULA ANTES, SEMPRE. O gesto reescreve o tipo e a classificação de um lançamento que
 * já está conciliado; a simulação devolve origem, destino e o que havia antes, e é isso que
 * a confirmação mostra. Uma RPC com `p_simular` que ninguém simula é um guard desperdiçado.
 *
 * ⚠ O ERRO DO BANCO VAI CRU PARA QUEM CHAMA — regra 8 do 133h. As mensagens são frases
 * prontas ('ja e transferencia', 'a outra conta tem de ser diferente da conta do
 * lancamento'), e reescrevê-las aqui só criaria uma segunda versão da mesma verdade.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SimulacaoTransferencia {
  ok: boolean;
  lancamento_id: string;
  valor: number | null;
  tipo_antes: string | null;
  conta_origem_id: string | null;
  conta_destino_id: string | null;
  subcentro_antes: string | null;
}

const msg = (e: unknown): string => {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
};

export function useTransferenciaAplicar() {
  const [ocupado, setOcupado] = useState(false);

  async function chamar(lancamentoId: string, contaOutraId: string, simular: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_transferencia_aplicar', {
      p_lancamento_id: lancamentoId,
      p_conta_outra_id: contaOutraId,
      p_simular: simular,
    });
    if (error) throw error;
    return data as SimulacaoTransferencia;
  }

  /** Devolve a simulação, ou lança com a mensagem do banco. */
  async function simular(lancamentoId: string, contaOutraId: string): Promise<SimulacaoTransferencia> {
    setOcupado(true);
    try { return await chamar(lancamentoId, contaOutraId, true); }
    finally { setOcupado(false); }
  }

  async function aplicar(lancamentoId: string, contaOutraId: string): Promise<SimulacaoTransferencia> {
    setOcupado(true);
    try { return await chamar(lancamentoId, contaOutraId, false); }
    finally { setOcupado(false); }
  }

  return { simular, aplicar, ocupado, msgErro: msg };
}
