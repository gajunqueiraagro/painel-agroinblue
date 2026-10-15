/* OC-DOC-ESPECIE-ABATE-01 passo 2 — O DONO DOS CAMPOS DE CADA ESPECIE DE DOCUMENTO DA OC.
   A tela so' DESENHA o que esta lista devolve: nenhuma especie escreve campo por conta propria (preso por teste).
   ⚠ SO' O ABATE TEM GRADE POR ESPECIE. Compra e venda seguem com as 4 especies e o formulario de hoje
     (`camposDaEspecie` devolve nulo para elas).
   ⚠ ONDE CADA CAMPO GRAVA (um lugar so', como no passo 1):
     valores (bruto, Funrural, SENAR, Seguro, RAT, retencoes do acerto, valor da NPR / do "outro") -> COMPONENTES;
     cab, peso_kg, data_abate, vencimento -> colunas; ordem_compra, lote_frigorifico, preco_arroba, op, nf_referida (NPR) e
     nfs_produtor (NF, a lista) -> `dados`.
   ⚠ O QUE SOMA NO VALOR DA OPERACAO E' DO BANCO (`_oc_documento_soma_no_valor`); os calculados daqui (@, retencoes, liquido,
     media) sao SO' PARA EXIBIR. */
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';

export type TipoOperacaoOC = 'compra' | 'venda' | 'abate' | string;

/** A chave de cada campo da grade. O formulario guarda o texto de cada um sob esta chave. */
export type ChaveCampo =
  | 'numero' | 'serie' | 'dataEmissao' | 'dataAbate' | 'vencimento' | 'lote'
  | 'emitente' | 'chaveAcesso'
  | 'cab' | 'pesoKg' | 'arrobas' | 'precoArroba' | 'bruto'
  | 'funrural' | 'senar' | 'seguro' | 'rat' | 'retencoes' | 'incentivo' | 'liquido'
  | 'nfRefNumero' | 'nfRefValor' | 'nfsProdutor' | 'nfsProdutorValor' | 'observacao'
  | 'ordemCompra' | 'loteFrigorifico' | 'op' | 'mediaKg' | 'valor';

export interface CampoDef {
  chave: ChaveCampo;
  rotulo: string;
  /** Quantas das 5 colunas da grade o campo ocupa. */
  colunas: 1 | 2 | 3 | 5;
  obrigatorio?: boolean;
  /** Derivado na tela, so' para exibir: fundo cinza, borda tracejada, sem digitacao. */
  calculado?: boolean;
  /** Numero: alinhado a' direita. */
  numerico?: boolean;
}

/** As especies que a OC oferece, na ordem do seletor. */
export function especiesDaOC(tipo: TipoOperacaoOC): EspecieDoc[] {
  return tipo === 'abate'
    ? ['nf_principal', 'npr', 'acerto', 'romaneio', 'outro']
    : ['nf_principal', 'nf_complementar', 'recibo', 'outro'];
}

/** Rotulo curto do seletor do abate. */
export const ROTULO_SEGMENTO: Partial<Record<EspecieDoc, string>> = {
  nf_principal: 'NF', npr: 'NPR', acerto: 'Acerto', romaneio: 'Romaneio', outro: 'Outro',
};

const c = (chave: ChaveCampo, rotulo: string, colunas: CampoDef['colunas'] = 1, extra: Partial<CampoDef> = {}): CampoDef =>
  ({ chave, rotulo, colunas, ...extra });

const NF: CampoDef[][] = [
  [c('numero', 'Número', 1, { obrigatorio: true }), c('serie', 'Série', 1, { obrigatorio: true }),
   c('dataEmissao', 'Emissão', 1, { obrigatorio: true }), c('dataAbate', 'Data do abate'), c('lote', 'Lote')],
  [c('emitente', 'Emitente', 3, { obrigatorio: true }), c('chaveAcesso', 'Chave de acesso', 2)],
  [c('cab', 'Cab', 1, { obrigatorio: true, numerico: true }), c('pesoKg', 'Carcaça kg', 1, { obrigatorio: true, numerico: true }),
   c('arrobas', '@', 1, { calculado: true, numerico: true }), c('precoArroba', 'R$/@', 1, { numerico: true }),
   c('bruto', 'Bruto R$', 1, { obrigatorio: true, numerico: true })],
  /* passo 4: o RAT (JBS) tem tipo proprio, e o liquido desce para a linha 5 (decisao do Gabriel, 15/10). */
  [c('funrural', 'Funrural', 1, { numerico: true }), c('senar', 'SENAR', 1, { numerico: true }), c('seguro', 'Seguro', 1, { numerico: true }),
   c('rat', 'RAT', 1, { numerico: true }), c('retencoes', 'Retenções R$', 1, { calculado: true, numerico: true })],
  [c('liquido', 'Líquido R$', 1, { calculado: true, numerico: true }), c('nfsProdutor', 'NF produtor'),
   c('nfsProdutorValor', 'Valor NF produtor', 1, { numerico: true }), c('observacao', 'Observação', 2)],
];

const ACERTO: CampoDef[][] = [
  /* "Ordem compra / Pedido": o numero da compra no frigorifico (a Ordem de compra da Minerva = o Pedido da JBS). */
  [c('ordemCompra', 'Ordem compra / Pedido', 1, { obrigatorio: true }), c('loteFrigorifico', 'Lote frigorífico'),
   c('dataAbate', 'Data do abate', 1, { obrigatorio: true }), c('vencimento', 'Vencimento'), c('lote', 'Lote')],
  [c('cab', 'Cab', 1, { obrigatorio: true, numerico: true }), c('pesoKg', 'Carcaça kg', 1, { obrigatorio: true, numerico: true }),
   c('arrobas', '@', 1, { calculado: true, numerico: true }), c('precoArroba', 'R$/@', 1, { numerico: true }),
   c('bruto', 'Bruto R$', 1, { obrigatorio: true, numerico: true })],
  /* passo 7e: o credito do acerto (o incentivo PROAPE-PRECOCE/MS) tem campo; as retencoes passam a ser Bruto + Incentivo − Liquido. */
  [c('retencoes', 'Retenções R$', 1, { calculado: true, numerico: true }), c('incentivo', 'Incentivo R$', 1, { numerico: true }),
   c('liquido', 'Líquido R$', 1, { obrigatorio: true, numerico: true }), c('observacao', 'Observação', 2)],
];

const NPR: CampoDef[][] = [
  [c('numero', 'Número', 1, { obrigatorio: true }), c('dataEmissao', 'Emissão'), c('vencimento', 'Vencimento', 1, { obrigatorio: true }),
   c('valor', 'Valor R$', 1, { obrigatorio: true, numerico: true }), c('nfRefNumero', 'NF referida')],
  [c('observacao', 'Observação', 3)],
];

const ROMANEIO: CampoDef[][] = [
  [c('dataAbate', 'Data do abate', 1, { obrigatorio: true }), c('op', 'OP'), c('loteFrigorifico', 'Lote frigorífico'),
   c('cab', 'Cab', 1, { numerico: true }), c('pesoKg', 'Peso total kg', 1, { numerico: true })],
  /* passo 7e: o Romaneio e' POR LOTE (regra do Gabriel, 15/10): o lote e' obrigatorio. */
  [c('mediaKg', 'Média kg', 1, { calculado: true, numerico: true }), c('lote', 'Lote', 1, { obrigatorio: true }), c('observacao', 'Observação', 3)],
];

/* "Outro" = os campos de hoje do formulario (numero, serie, emissao, valor, emitente, chave, observacao). No abate ele e'
   INFORMATIVO: a lista o mostra em cinza e o banco nao o soma. */
const OUTRO: CampoDef[][] = [
  [c('numero', 'Número'), c('serie', 'Série'), c('dataEmissao', 'Emissão'), c('valor', 'Valor R$', 1, { numerico: true }), c('lote', 'Lote')],
  [c('emitente', 'Emitente', 3), c('chaveAcesso', 'Chave de acesso', 2)],
  [c('observacao', 'Observação', 3)],
];

/**
 * As linhas da grade (5 colunas) de uma especie. NULO = esta OC usa o formulario de hoje (compra e venda).
 * No abate: NF complementar usa a grade da NF; recibo (legado) a do "outro".
 */
export function camposDaEspecie(tipo: TipoOperacaoOC, especie: EspecieDoc): CampoDef[][] | null {
  if (tipo !== 'abate') return null;
  switch (especie) {
    case 'nf_principal': case 'nf_complementar': return NF;
    case 'acerto': return ACERTO;
    case 'npr': return NPR;
    case 'romaneio': return ROMANEIO;
    default: return OUTRO;
  }
}

/* ── DERIVADOS, SO' PARA EXIBIR ─────────────────────────────────────────────────── */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** @ = kg / 15 (2 casas). Nulo sem kg. */
export const arrobasDoPeso = (kg: number | null): number | null => (kg == null || kg <= 0 ? null : r2(kg / 15));

/** Retencoes da NF = Funrural + SENAR + Seguro + RAT + as outras retencoes que o documento ja' tinha. */
export const retencoesDaNF = (funrural: number | null, senar: number | null, seguro: number | null, outras = 0, rat: number | null = null): number =>
  r2((funrural ?? 0) + (senar ?? 0) + (seguro ?? 0) + (rat ?? 0) + outras);

/** Retencoes do acerto = Bruto + Incentivo − Liquido (o liquido vem impresso; sem incentivo, Bruto − Liquido). Nulo sem bruto e liquido. */
export const retencoesDoAcerto = (bruto: number | null, liquido: number | null, incentivo = 0): number | null =>
  (bruto == null || liquido == null ? null : r2(bruto + incentivo - liquido));

/** Media do romaneio = peso total / cab. */
export const mediaDoRomaneio = (cab: number | null, pesoKg: number | null): number | null =>
  (cab == null || cab <= 0 || pesoKg == null ? null : r2(pesoKg / cab));

/** % de uma retencao sobre o bruto, para o rotulo ("Funrural · 1,32%"). */
export const pctDoBruto = (v: number | null, bruto: number | null): number | null =>
  (v == null || bruto == null || bruto <= 0 ? null : r2((v / bruto) * 100));
