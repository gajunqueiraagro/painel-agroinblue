/**
 * SM-ARRENDAMENTO-ENCERRAR-01 (Gabriel 30/10/2026: "1- 31/07/2024  2- A"; prévia OK 19:33) — a ÁREA dos leitores que somavam o
 * cadastro de HOJE passa a ser a do MÊS: só os pastos ativos e vigentes naquele mês (`pastosAtivosNoMes` / `isPastoAtivoNoMes`, o
 * espelho da `fn_pasto_vigente_no_mes`, a mesma regra que a view `vw_zoot_fazenda_mensal` usa desde a migration 20261028115130).
 * Nasce porque o arrendamento devolvido da Faz. Sta. Maria (600 ha, vigência até 31/07/2024) seguia no denominador da lotação até hoje.
 * Nenhuma regra nova: estas funções só SOMAM o que a regra da vigência já diz.
 */
import { pastosAtivosNoMes } from '@/hooks/usePastos';
import { calcAreaProdutivaPecuaria } from '@/lib/calculos/zootecnicos';

interface PastoComArea {
  ativo: boolean;
  area_produtiva_ha?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}

/** "AAAA-MM" de um ano e um mês (1..12). */
export function anoMesDe(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Σ da área dos pastos ativos e vigentes no mês (sem olhar o uso — quem pede o uso usa `calcAreaProdutivaPecuaria`). */
export function areaDosPastosNoMes(pastos: PastoComArea[], anoMes: string): number {
  return pastosAtivosNoMes(pastos, anoMes).reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0);
}

/** A área de cada mês de uma lista de meses ("AAAA-MM"), na mesma ordem. */
export function areaPorMes(pastos: PastoComArea[], anosMeses: string[]): number[] {
  return anosMeses.map((am) => areaDosPastosNoMes(pastos, am));
}

/**
 * PC-100 Meta (decisão P1, Gabriel 30/10/2026 19:33): o divisor é UM número por ano, a ÁREA MÉDIA DO ANO = a média das áreas de
 * pecuária vigentes nos 12 meses (`calcAreaProdutivaPecuaria` com o mês), nunca a de um mês só nem a do cadastro de hoje.
 * Mês sem pasto vigente entra como 0 na média (o pasto que começa em julho conta metade do ano).
 */
export function areaPecuariaMediaDoAno(pastos: Parameters<typeof calcAreaProdutivaPecuaria>[0], ano: number): number {
  let soma = 0;
  for (let mes = 1; mes <= 12; mes++) soma += calcAreaProdutivaPecuaria(pastos, anoMesDe(ano, mes));
  return soma / 12;
}
