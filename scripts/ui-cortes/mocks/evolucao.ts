/* PROD-EVOLUCAO-01a — o hook da Evolução no Ano na bancada: meses SINTÉTICOS no PIOR caso de largura (a regra do item, Gabriel 30/10 17:16:
 * nenhum número cortado) — saldo de 5 dígitos, peso vivo em t de 7 caracteres, fluxos negativos de 4 dígitos, GMD negativo e 3,181, Δ de 4 dígitos.
 * A conta dos números é a da `montarEvolucao` (testada); aqui só o que ela recebe. `&faz=1` = uma fazenda (a transferência vira externa);
 * `&meta=aprovada` tira a etiqueta "rascunho". */
import type { MesDaEvolucao } from '@/lib/producao/evolucaoAno';

const q = new URLSearchParams(globalThis.location?.search ?? '');
const FECHADOS = 9;
const mes = (m: number, escala: number): MesDaEvolucao => {
  const fechado = m <= FECHADOS;
  const saldo = Math.round(19_876 * escala - m * 37);
  return {
    mes: m, fechado, saldoInicio: saldo + 37, saldoFinal: saldo,
    pesoInicioKg: (saldo + 37) * 299.6, pesoFinalKg: saldo * 300.1,
    cab: { nascimento: m === 3 ? 2_876 : 212 * m, compra: m % 2 ? 1_234 : 0, transferencia_entrada: 345, abate: 990 + m, venda: m === 6 ? 999 : 0, consumo: 12, morte: 87, transferencia_saida: 345 },
    kg: { nascimento: 212 * m * 32, compra: 1_234 * 295, transferencia_entrada: 345 * 310, abate: 990 * 520, venda: 999 * 410, consumo: 12 * 450, morte: 87 * 280, transferencia_saida: 345 * 310 },
    kgCarcacaAbate: 990 * 290, evolEntrou: 1_321, evolSaiu: 1_321, kgEvolEntrou: 1_321 * 360, kgEvolSaiu: 1_321 * 360,
    pesoMedioFinal: m === 3 ? 372 : 273.6 + m, gmd: m === 3 ? 3.181 : m === 5 ? -0.498 : 0.734, producaoBio: m === 5 ? -148_000 : 417_000,
    cabInicio: saldo + 37, cabFinal: saldo, dias: 30, uaMedia: saldo * 300.1 / 450, areaPecuaria: 6_123.45,
  };
};
const REAL = Array.from({ length: 10 }, (_, i) => mes(i + 1, 1)); // out aberto, nov–dez sem dado
const META = Array.from({ length: 12 }, (_, i) => ({ ...mes(i + 1, 0.97), fechado: true, cab: { ...mes(i + 1, 0.97).cab, abate: 41 } }));

export function useEvolucaoDoAno(_ano: number) {
  return { mesesReal: REAL, mesesMeta: META, isGlobal: q.get('faz') !== '1', metaRascunho: q.get('meta') !== 'aprovada', carregando: false };
}
export const mesesDaEvolucao = () => [];
