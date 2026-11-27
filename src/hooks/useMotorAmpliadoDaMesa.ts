/**
 * CONC-SUGESTOES-V2 B — o motor AMPLIADO de cada movimento sem par da mesa (a Conferência): 4 por vez, a tela pinta aos poucos
 * ("procurando…" na linha até a resposta). Só LEITURA; nada casa daqui.
 * ⚠ Até `ATE` linhas roda sozinho ao abrir (o custo é uma chamada por linha); acima disso só com `buscar()` (gesto) — a mesma regra
 *   do passo Casar do painel (`SUGESTOES_AO_ABRIR_ATE`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motorAmpliadoDoMes, type RespostaDoAmpliado } from '@/lib/conciliacao/motorAmpliado';

export const MOTOR_DA_MESA_AO_ABRIR_ATE = 60;

export function useMotorAmpliadoDaMesa(clienteId: string | null, extratoIds: readonly string[], ligado = true) {
  const [porLinha, setPorLinha] = useState<ReadonlyMap<string, RespostaDoAmpliado>>(new Map());
  const [buscando, setBuscando] = useState(false);
  const chave = useMemo(() => [...extratoIds].sort().join(','), [extratoIds]);
  const vez = useRef(0);

  const buscar = useCallback(async () => {
    const ids = chave ? chave.split(',') : [];
    if (!clienteId || !ids.length) { setPorLinha(new Map()); return; }
    const minha = ++vez.current;
    setBuscando(true);
    setPorLinha(new Map());
    await motorAmpliadoDoMes(clienteId, ids, (id, r) => {
      if (vez.current !== minha) return;
      setPorLinha((m) => { const n = new Map(m); n.set(id, r); return n; });
    });
    if (vez.current === minha) setBuscando(false);
  }, [clienteId, chave]);

  useEffect(() => {
    const n = chave ? chave.split(',').length : 0;
    if (ligado && n > 0 && n <= MOTOR_DA_MESA_AO_ABRIR_ATE) void buscar();
    else setPorLinha(new Map());
    return () => { vez.current += 1; };
  }, [buscar, chave, ligado]);

  return { porLinha, buscando, buscar };
}
