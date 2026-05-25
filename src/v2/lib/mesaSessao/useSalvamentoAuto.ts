import { useEffect, useRef, useState, useCallback } from 'react';
import type { SalvamentoStatus } from './types';

interface UseSalvamentoAutoArgs {
  enabled: boolean;
  debounceMs?: number; // default 5000
  onSalvar: () => Promise<void>;
  /**
   * Dependência que dispara o auto-save quando muda (string serializável).
   * Ex.: hash do Map de pares.
   */
  watchKey: string;
}

export function useSalvamentoAuto({
  enabled,
  debounceMs = 5000,
  onSalvar,
  watchKey,
}: UseSalvamentoAutoArgs): {
  status: SalvamentoStatus;
  ultimoSalvamento: Date | null;
  salvarAgora: () => Promise<void>;
} {
  const [status, setStatus] = useState<SalvamentoStatus>('salvo');
  const [ultimoSalvamento, setUltimoSalvamento] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchKeyAnterior = useRef<string>(watchKey);

  // FIX: guarda onSalvar em ref para que executar não dependa dele diretamente.
  // onSalvar é inline no MesaPareamentoModal — nova referência a cada render.
  // Sem o ref, executar era recriado, o useEffect de debounce fazia cleanup
  // e limpava o timer antes de disparar. Status ficava preso em 'pendente'.
  const onSalvarRef = useRef(onSalvar);
  useEffect(() => {
    onSalvarRef.current = onSalvar;
  }, [onSalvar]);

  // FIX: deps = [] — executar é estável. Lê onSalvar sempre fresco via ref.
  const executar = useCallback(async () => {
    setStatus('salvando');
    try {
      await onSalvarRef.current();
      setStatus('salvo');
      setUltimoSalvamento(new Date());
    } catch (err) {
      console.error('[useSalvamentoAuto] onSalvar falhou:', err);
      setStatus('erro');
    }
  }, []);

  const salvarAgora = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await executar();
  }, [executar]);

  useEffect(() => {
    if (!enabled) return;
    if (watchKey === watchKeyAnterior.current) return;
    watchKeyAnterior.current = watchKey;
    setStatus('pendente');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void executar();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [watchKey, enabled, debounceMs, executar]);

  return { status, ultimoSalvamento, salvarAgora };
}
