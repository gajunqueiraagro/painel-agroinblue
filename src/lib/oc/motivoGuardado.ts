/**
 * O MOTIVO PEDIDO UMA VEZ SÓ — OC-DESFAZER-PREVISTO-01b (Gabriel, 20/10/2026).
 *
 * ⚠ O CASO: no "Desfazer compromisso" da OC 1645ba75 o operador digitou o motivo, o banco recusou, ele fechou, reabriu — e o
 *   diálogo pediu o motivo de novo (o `abrirEstorno` zerava o campo). Repetiu várias vezes.
 * O motivo digitado fica guardado por OPERAÇÃO + GESTO + ALVO (o compromisso no desfazer, o lote no atualizar) enquanto a
 * página vive: fechar e reabrir o diálogo, ou trocar de aba da OC, não o apaga. O gesto que GRAVA o consome (`esquecerMotivo`).
 * ⚠ Guarda só texto que o operador escreveu; nada vai ao banco daqui.
 */
import { useCallback, useState } from 'react';

const guardados = new Map<string, string>();

export type GestoComMotivo = 'desfazer' | 'atualizar';

export const chaveDoMotivo = (operacaoId: string | null | undefined, gesto: GestoComMotivo, alvoId: string) =>
  `${operacaoId ?? 'sem-operacao'}:${gesto}:${alvoId}`;

export function motivoGuardado(chave: string): string {
  return guardados.get(chave) ?? '';
}

export function guardarMotivo(chave: string, motivo: string): void {
  if (motivo === '') guardados.delete(chave); else guardados.set(chave, motivo);
}

export function esquecerMotivo(chave: string): void {
  guardados.delete(chave);
}

/** O campo do motivo, já guardado: começa no que estava escrito (ou na sugestão), e cada tecla guarda. */
export function useMotivoGuardado(chave: string, sugestao: string | null = null): [string, (m: string) => void] {
  const [motivo, setMotivo] = useState(() => motivoGuardado(chave) || (sugestao ?? ''));
  const mudar = useCallback((m: string) => { guardarMotivo(chave, m); setMotivo(m); }, [chave]);
  return [motivo, mudar];
}
