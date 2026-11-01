/**
 * MAPA-ATIVIDADE-LAVOURA-01 — o USO do pasto no mês e se ele é PECUÁRIA (Gabriel 01/11). Puro.
 * - Pecuária = a lista da TELA (`isOperacionalPecuaria` de `tiposUso.ts`: cria, recria, engorda, vedado, reforma_pecuaria). D5 (Gabriel
 *   01/11 16:37): sem espelho da lista do banco com trava frágil. ⚠ PENDÊNCIA (Code 1): o banco (`_fn_tipos_uso_pecuaria`) também tem
 *   'tip'; quando o 'tip' entrar em `tiposUso.ts`, o mapa passa a contá-lo sozinho, sem mudança aqui.
 * - O uso do mês = o `tipo_uso_mes` do fechamento do mês; sem fechamento (ou sem o campo), o `tipo_uso` do cadastro (D1).
 * - Fora da pecuária, a FAMÍLIA decide a cor e o rótulo no mapa (D3): lavoura, eucalipto, reserva/APP, benfeitorias; o resto é "outro".
 */
import { grupoDoTipoUso, isOperacionalPecuaria } from '@/lib/pastos/tiposUso';

/** O uso do mês (D1): o do fechamento; sem ele, o do cadastro. */
export function usoDoMes(tipoUsoMes: string | null | undefined, tipoUsoCadastro: string | null | undefined): string | null {
  return tipoUsoMes || tipoUsoCadastro || null;
}

/** O pasto conta como pecuária no mês. Uso desconhecido (nem fechamento nem cadastro) conta como antes: pecuária. */
export function ehUsoPecuaria(uso: string | null | undefined): boolean {
  return !uso || isOperacionalPecuaria(uso);
}

export type FamiliaForaDaPecuaria = 'lavoura' | 'silvicultura' | 'ambiental' | 'benfeitorias' | 'outro';

/** A família de um uso FORA da pecuária (null = é pecuária). */
export function familiaForaDaPecuaria(uso: string | null | undefined): FamiliaForaDaPecuaria | null {
  if (ehUsoPecuaria(uso)) return null;
  const g = grupoDoTipoUso(uso);
  if (g === 'agricultura') return 'lavoura';
  if (g === 'silvicultura') return 'silvicultura';
  if (g === 'ambiental') return 'ambiental';
  if (g === 'infraestrutura') return 'benfeitorias';
  return 'outro';
}

export const ROTULO_DA_FAMILIA: Record<FamiliaForaDaPecuaria, string> = {
  lavoura: 'Lavoura',
  silvicultura: 'Eucalipto',
  ambiental: 'Reserva legal / APP',
  benfeitorias: 'Benfeitorias',
  outro: 'Outro uso',
};

/** A ordem das famílias na legenda. */
export const ORDEM_DAS_FAMILIAS: readonly FamiliaForaDaPecuaria[] = ['lavoura', 'silvicultura', 'ambiental', 'benfeitorias', 'outro'];
