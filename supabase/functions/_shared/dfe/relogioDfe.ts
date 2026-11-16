/**
 * NOTAS-RECEITA-A1-01 · F3.0 — o RELÓGIO da Distribuição DF-e por titular (regras puras; o estado mora em `fiscal_dfe_controle`).
 * Regras da SEFAZ (NT 2014.002; medidas na FASE 0):
 *  · 138 com ultNSU < maxNSU → pedir de novo JÁ, a partir do ultNSU devolvido (50 documentos por resposta);
 *  · 138 com ultNSU = maxNSU, ou 137 (nada novo) → próxima busca só daqui a 1 hora;
 *  · 656 (consumo indevido) → bloqueio de 1 hora; o NSU não anda;
 *  · outro cStat (472/593 certificado de outro documento, erro) → para, não marca hora, o NSU não anda;
 *  · consulta por chave (consChNFe) → no máximo 20 por hora por titular.
 * Tudo em ISO/UTC; `agora` vem de fora (teste fixa o tempo).
 */

export const UMA_HORA_MS = 60 * 60 * 1000;
export const CHAVES_POR_HORA = 20;

export interface EstadoDoRelogio { ultNsu: bigint; maxNsu: bigint; naoAntesDe: string | null; ultimoCstat: string | null }
export type PodeBuscar = { pode: true } | { pode: false; ate: string };

export function podeBuscar(e: Pick<EstadoDoRelogio, 'naoAntesDe'>, agora: Date): PodeBuscar {
  if (e.naoAntesDe === null) return { pode: true };
  const ate = Date.parse(e.naoAntesDe);
  if (Number.isNaN(ate)) return { pode: true };
  return agora.getTime() >= ate ? { pode: true } : { pode: false, ate: new Date(ate).toISOString() };
}

export interface DepoisDaResposta { estado: EstadoDoRelogio; continuar: boolean; parouPorErro: boolean }
/** o estado depois de UMA resposta da distribuição por NSU (distNSU) */
export function depoisDaResposta(
  e: EstadoDoRelogio, r: { cStat: string; ultNsu: bigint | null; maxNsu: bigint | null }, agora: Date,
): DepoisDaResposta {
  const daquiUmaHora = new Date(agora.getTime() + UMA_HORA_MS).toISOString();
  if (r.cStat === '138') {
    if (r.ultNsu === null || r.maxNsu === null) return { estado: { ...e, ultimoCstat: r.cStat }, continuar: false, parouPorErro: true };
    /* o NSU nunca volta: resposta com ultNSU menor que o guardado não rebobina */
    const ult = r.ultNsu > e.ultNsu ? r.ultNsu : e.ultNsu;
    const max = r.maxNsu > ult ? r.maxNsu : ult;
    const acabou = ult >= max;
    return { estado: { ultNsu: ult, maxNsu: max, naoAntesDe: acabou ? daquiUmaHora : null, ultimoCstat: r.cStat }, continuar: !acabou, parouPorErro: false };
  }
  if (r.cStat === '137') {
    const ult = r.ultNsu !== null && r.ultNsu > e.ultNsu ? r.ultNsu : e.ultNsu;
    const max = r.maxNsu !== null && r.maxNsu > ult ? r.maxNsu : ult;
    return { estado: { ultNsu: ult, maxNsu: max, naoAntesDe: daquiUmaHora, ultimoCstat: r.cStat }, continuar: false, parouPorErro: false };
  }
  if (r.cStat === '656') return { estado: { ...e, naoAntesDe: daquiUmaHora, ultimoCstat: r.cStat }, continuar: false, parouPorErro: false };
  return { estado: { ...e, ultimoCstat: r.cStat }, continuar: false, parouPorErro: true };
}

/** quantas consultas por chave ainda cabem nesta hora (as feitas = os instantes ISO das consultas por chave do titular) */
export function chavesQueCabem(feitas: readonly string[], agora: Date): number {
  const desde = agora.getTime() - UMA_HORA_MS;
  const naHora = feitas.filter((t) => { const x = Date.parse(t); return !Number.isNaN(x) && x > desde && x <= agora.getTime(); }).length;
  return Math.max(0, CHAVES_POR_HORA - naHora);
}
