// Situação operacional derivada em read-time a partir da linha da view
// vw_classificacao_staging_preview. NÃO altera match_status (pareamento técnico).
// match_status = como casou; situação operacional = prontidão para o operador.

export type SituacaoOperacional =
  | 'todos'
  | 'incompleto'
  | 'pronto'
  | 'aplicado'
  | 'sem_par';

const temValor = (v: unknown): boolean =>
  v != null && String(v).trim() !== '';

export interface SituacaoInput {
  aplicado: boolean | null;
  lanc_id: string | null;
  lanc_macro_atual: string | null;
  lanc_centro_atual: string | null;
  lanc_subcentro_atual: string | null;
}

export function getSituacaoOperacional(
  row: SituacaoInput,
): Exclude<SituacaoOperacional, 'todos'> {
  // 'aplicado' SEMPRE vence — estado terminal. Mesmo com macro+centro+subcentro
  // preenchidos, se aplicado=true o resultado é 'aplicado', nunca 'pronto'.
  // (esta ordem é deliberada; não reordenar — evita regressão futura)
  if (row.aplicado === true) return 'aplicado';
  if (row.lanc_id == null) return 'sem_par';
  if (
    temValor(row.lanc_macro_atual) &&
    temValor(row.lanc_centro_atual) &&
    temValor(row.lanc_subcentro_atual)
  ) {
    return 'pronto';
  }
  return 'incompleto';
}
