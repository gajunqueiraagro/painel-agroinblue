/**
 * VG-CENTAVO-ACUMULADO D1a (Gabriel 31/10/2026) — o VALOR de um lançamento é gravado em CENTAVOS (2 casas), nunca com a fração que veio
 * da planilha (float do Excel, 3–15 casas) ou de uma conta (desconto do abate). `financeiro_lancamentos_v2.valor` é `numeric` sem escala:
 * a fração ficava gravada e cada nó da `fn_vg_analise` a arredondava por mês, e as linhas somavam centavos que o total não tinha
 * (FASE 0: visao-20261030-2330-VG-CENTAVO-fase0). Gravam por aqui o importador, o abate, a venda e a compra do rebanho; a trava do banco
 * (um gatilho que recusa valor NOVO ou que MUDA com fração, 114070) é frente própria.
 * Meio centavo vai para longe do zero, como o `round(…, 2)` do banco.
 */
import { round2 } from '@/lib/calculos/numeroBR';

export const valorDoLancamento = (v: number): number => (v < 0 ? -round2(-v) : round2(v));
