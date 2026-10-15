/**
 * ZOOT-MES-FECHADO-MODAL-01 — chama `aoVoltar` quando a janela volta a ter foco (ou a aba volta a ficar visível).
 * É o que destrava um modal aberto depois que o mês foi reaberto em OUTRA tela ou aba, sem F5 e sem fechar o modal.
 * Não guarda nada: quem lê continua sendo o dono da leitura (o `refetch` dele); isto só diz QUANDO reler.
 */
import { useEffect, useRef } from 'react';

export function useAoVoltarAoFoco(aoVoltar: () => void, ativo = true): void {
  const ref = useRef(aoVoltar);
  ref.current = aoVoltar;
  useEffect(() => {
    if (!ativo) return;
    const aoFocar = () => ref.current();
    const aoMudarVisibilidade = () => { if (document.visibilityState === 'visible') ref.current(); };
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [ativo]);
}
