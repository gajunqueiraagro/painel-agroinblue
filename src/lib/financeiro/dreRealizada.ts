// dreRealizada — AUTORIDADE ÚNICA de PERTENCIMENTO à DRE Realizada (FIN-FLAGS-01B).
//
// Este arquivo NÃO é regra financeira global. Ele responde a UMA pergunta e só ela:
// "este lançamento participa da DRE realizada?" — e a resposta é exclusivamente a flag
// oficial materializada no banco (financeiro_lancamentos_v2.compoe_dre, FIN-FLAGS-01A).
//
// Contrato (rígido, sem fallback):
//   compoe_dre === true      → participa da DRE
//   compoe_dre === false     → NÃO participa
//   compoe_dre === null      → NÃO participa
//   compoe_dre === undefined → NÃO participa
//
// NÃO consulta macro/grupo/centro/subcentro/tipo_operacao. NÃO reinclui por heurística.
// A DECISÃO DE EM QUAL LINHA da DRE o lançamento cai continua nos predicados de
// classificacao.ts / analiseHelpers.ts — este gate só decide ENTRA / NÃO ENTRA.
//
// Não importa nem altera lógica de Fluxo de Caixa, Rateio ou META.

/** Forma mínima estruturalmente exigida: apenas a flag oficial. */
export interface ComCompoeDre {
  compoe_dre?: boolean | null;
}

/**
 * Pertencimento à DRE Realizada = flag oficial `compoe_dre === true`.
 * `false`, `null` e `undefined` ficam fora, sem fallback.
 */
export function isLancamentoDRERealizada(lancamento: ComCompoeDre): boolean {
  return lancamento.compoe_dre === true;
}
