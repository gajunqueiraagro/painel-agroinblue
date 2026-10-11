/**
 * FIN-DETALHE-CABECALHO-ALINHADO-01 — a RÉGUA da tabela de parcelas da tela do contrato (`FinanciamentoDetalhe`).
 *
 * UMA lista por coluna: largura, rótulo e alinhamento. O `colgroup` e o cabeçalho saem DAQUI, do mesmo registro — o th
 * alinha como o conteúdo da coluna (texto à esquerda, número à direita) e nunca tem largura própria.
 *
 * ⚠ A TABELA NÃO ESTICA COLUNA NENHUMA COM A JANELA, SALVO UMA: a Conta (`largura: null`) fica com o resto e corta com o
 *   inteiro no `title`. Todas as outras têm a largura do PIOR TEXTO, medida no navegador a 10px (11/10/2026):
 *     Nº     "20/20" 29,6px + 16 de padding = 45,6 -> 48 (com 40, "10/20" vazava 5,6px para a coluna da competência)
 *     datas  "10/08/23" 46,3px + 16 = 62,3 -> 64 (com 54 a data vazava 8,3px e encostava na data vizinha)
 *     Prazo  "vence em 2912 dias" 97,6px + 16 = 113,6 -> 116 (caso real do NJ: financiamento longo; com 108 vazava 5,6px);
 *            "vencida há 9999 dias" (103px) ainda vazaria 3px — 27 anos de atraso não têm caso
 *   A Conta a 1.127 fica com 145px (129 úteis) no financiamento: o pior nome real do NJ e da Santa Rita que cabia antes
 *   ("Cartão BB - Ourocard Visa", 128,1px) continua cabendo, com 0,9px; só "Permuta · Cooperativa …" (240px) corta, e já cortava.
 */

export type ChaveDaColuna =
  | 'numero' | 'competencia' | 'vencimento' | 'pagamento' | 'prazo' | 'conta'
  | 'principal' | 'juros' | 'total' | 'situacao' | 'nota' | 'boleto' | 'linkDosJuros' | 'lapis';

export interface ColunaDasParcelas {
  chave: ChaveDaColuna;
  rotulo: string;
  /** px; `null` = a única coluna que fica com o resto */
  largura: number | null;
  /** como o CONTEÚDO da coluna alinha: texto à esquerda, número à direita, ícone ao centro */
  alinha: AlinhamentoDaColuna;
}

export type AlinhamentoDaColuna = 'esquerda' | 'direita' | 'centro';

export const LARGURA_DA_DATA = 64;

const col = (chave: ChaveDaColuna, rotulo: string, largura: number | null, alinha: AlinhamentoDaColuna = 'esquerda'): ColunaDasParcelas =>
  ({ chave, rotulo, largura, alinha });

/** As colunas, na ordem da tela. Parcelamento: Valor, Nota fiscal e Boleto; crédito: Principal, Juros, Total e o link dos juros. */
export function colunasDasParcelas(ehParcelamento: boolean): ColunaDasParcelas[] {
  const inicio = [
    col('numero', 'Nº', 48),
    col('competencia', 'Comp.', LARGURA_DA_DATA),
    col('vencimento', 'Venc.', LARGURA_DA_DATA),
    col('pagamento', 'Pgto.', LARGURA_DA_DATA),
    col('prazo', 'Prazo', 116),
    col('conta', 'Conta', null),
  ];
  return ehParcelamento
    ? [
      ...inicio,
      col('total', 'Valor (R$)', 88, 'direita'),
      col('situacao', 'Situação', 88),
      col('nota', 'Nota fiscal', 118),
      col('boleto', 'Boleto', 46, 'centro'),
      col('lapis', '', 24),
    ]
    : [
      ...inicio,
      col('principal', 'Principal', 84, 'direita'),
      col('juros', 'Juros', 76, 'direita'),
      col('total', 'Total (R$)', 88, 'direita'),
      col('situacao', 'Situação', 88),
      col('linkDosJuros', '', 40),
      col('lapis', '', 24),
    ];
}

/** A classe de alinhamento da coluna — a MESMA para o cabeçalho e para a célula (`text-right` no número, `text-center` no ícone). */
export const CLASSE_DO_ALINHAMENTO: Record<AlinhamentoDaColuna, 'text-left' | 'text-right' | 'text-center'> = {
  esquerda: 'text-left',
  direita: 'text-right',
  centro: 'text-center',
};

export function alinhamentoDoCabecalho(coluna: ColunaDasParcelas): 'text-left' | 'text-right' | 'text-center' {
  return CLASSE_DO_ALINHAMENTO[coluna.alinha];
}
