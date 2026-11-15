/**
 * OPENFINANCE-PILOTO-01 — o que uma FONTE de extrato entrega à prévia, antes do hash e da dedupe.
 *
 * O arquivo (OFX/CSV, lido por `lerArquivoDeExtrato` no `useImportacaoExtrato`) e o Open Finance (`fonteDoOpenFinance`)
 * entregam o MESMO formato; daí para frente a prévia, a dedupe, o casamento e a gravação (`fn_extrato_importar_arquivo`)
 * são um caminho só. Fonte nova = mais um produtor deste objeto, nunca outra prévia.
 */
import type { MovimentoBruto } from './parseOFX';

/** Vai como está ao `tipo_arquivo` do lote (`financeiro_importacoes_v2`), como sempre foram 'OFX' e 'CSV'. */
export type FormatoDoExtrato = 'OFX' | 'CSV' | 'OPEN_FINANCE';

export interface FonteDoExtrato {
  formato: FormatoDoExtrato;
  movimentos: MovimentoBruto[];
  /** Linhas que a fonte trouxe e que não são movimento (o CSV sem valor; o Open Finance com valor zero). */
  linhasInformativas: number;
  /** O saldo que a FONTE declara. `null` quando ela não diz — nunca zero no lugar. */
  saldoDeclarado: number | null;
  saldoDeclaradoData: string | null;
  /** O período que a fonte declara cobrir. `null` quando ela não diz. */
  periodoDeclaradoInicio: string | null;
  periodoDeclaradoFim: string | null;
}
