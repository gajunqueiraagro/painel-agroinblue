import {
  COL_COMPETENCIA, COL_VALOR, COL_TIPO, COL_CONTA_BANCARIA, COL_DESCRICAO, COL_DOCUMENTO,
  TIPO_ENTRADAS, TIPO_SAIDAS,
} from '@/v2/lib/excelPreview/parserLancamentos';
import type { LinhaPreenchida } from '@/v2/lib/importLanc/modeloPlanilha';

/**
 * Movimentos do extrato → linhas do modelo canônico. FIN-ENRIQUECER-EXCEL-01.
 *
 * ⚠ AS CHAVES SÃO OS CABEÇALHOS CANÔNICOS, tirados dos mesmos `COL_*` que o
 * PARSER usa para reconhecer as colunas na volta (`parserLancamentos.ts:77-97`,
 * primeiro alias de cada lista). Escrever os textos à mão aqui criaria o
 * segundo lugar onde o nome da coluna mora, e a planilha que sai deixaria de
 * ser lida pela que entra na primeira renomeação.
 *
 * ⚠ SÓ O QUE O EXTRATO SABE. Conta do plano, Fazenda, Fornecedor e Safra saem
 * VAZIAS — são exatamente o que o operador vai completar fora, e é para isso que
 * o arquivo existe. Preencher com palpite pouparia digitação e custaria a
 * classificação errada por descuido de quem confia no que já veio escrito.
 */

/** `2026-08-19` → `19/08/2026`, o formato que o parser lê de volta. */
const dataBr = (iso: string): string =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';

/**
 * ⚠ VÍRGULA DECIMAL E MILHAR COM PONTO — é o que o Excel brasileiro espera e o
 * que o parser aceita. `toFixed` sozinho devolveria `1250.00`, que o Excel de
 * cá lê como mil duzentos e cinquenta mil.
 */
const valorBr = (v: number): string =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MovimentoParaPlanilha {
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
}

export function linhasDoExtrato(
  movimentos: readonly MovimentoParaPlanilha[],
  contaNome: string,
): LinhaPreenchida[] {
  return movimentos.map((m) => ({
    /* ⚠ COMPETÊNCIA NASCE NA DATA DO MOVIMENTO E É PARA SER CORRIGIDA. O
       pagamento é fato do banco; a competência é o mês do FATO, e numa venda ou
       num abate recebido depois ela é outra. A coluna vem preenchida com o
       palpite mais provável, não com uma verdade. */
    [COL_COMPETENCIA[0]]: dataBr(m.data_movimento),
    /* ⚠ MÓDULO. O sentido vai na coluna Tipo, e é a lei do modelo: valor
       negativo com Tipo de saída somaria o sinal duas vezes. */
    [COL_VALOR[0]]: valorBr(m.valor),
    [COL_TIPO[0]]: m.valor < 0 ? TIPO_SAIDAS : TIPO_ENTRADAS,
    [COL_CONTA_BANCARIA[0]]: contaNome,
    [COL_DESCRICAO[0]]: m.descricao ?? '',
    [COL_DOCUMENTO[0]]: m.documento ?? '',
  }));
}
