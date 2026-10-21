/* OC-DOC-ESPECIE-ABATE-01 passo 2 — O DONO DOS CAMPOS DE CADA ESPECIE DE DOCUMENTO DA OC.
   A tela so' DESENHA o que esta lista devolve: nenhuma especie escreve campo por conta propria (preso por teste).
   ⚠ ABATE E VENDA TEM GRADE POR ESPECIE (OC-DOC-VENDA-01: a venda usa a MESMA aba do abate — "ja esta feito, e so copiar").
     A compra segue com as 4 especies e o formulario de hoje (`camposDaEspecie` devolve nulo para ela). Na venda, as especies que
     nao sao da grade (NF principal, complementar, recibo — o legado) tambem devolvem nulo: abrem no formulario de hoje.
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
  | 'ordemCompra' | 'loteFrigorifico' | 'op' | 'mediaKg' | 'valor'
  /* 7f — saida da fazenda */
  | 'dataSaida' | 'destinatario' | 'valorInformativo' | 'gtaCitada' | 'validade' | 'embarque' | 'femeas' | 'machos' | 'cabGta'
  | 'finalidade' | 'destino' | 'tipoGuia' | 'pagoEm' | 'tipoDeclaracao';

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
  const grupos = gruposDoSeletor(tipo);
  return grupos ? grupos.flatMap(g => g.especies) : ['nf_principal', 'nf_complementar', 'recibo', 'outro'];
}

/** A OC desta tipo usa a aba do abate (grade por especie, lista em blocos)? Abate e venda. */
export const usaGradePorEspecie = (tipo: TipoOperacaoOC | null | undefined): boolean => tipo === 'abate' || tipo === 'venda';

/** 7f — o seletor do abate em DOIS grupos, numa linha: os papeis do frigorifico e os da saida da fazenda ("Outro" fica na saida). */
export const GRUPOS_DO_SELETOR_ABATE: { rotulo: string; especies: EspecieDoc[] }[] = [
  { rotulo: 'ABATE', especies: ['nf_principal', 'npr', 'acerto', 'romaneio'] },
  { rotulo: 'SAÍDA', especies: ['nf_produtor', 'gta', 'guia', 'declaracao', 'outro'] },
];
/** OC-DOC-VENDA-01 — a venda: a SAIDA DA FAZENDA igual a' do abate e, no lugar do frigorifico, os documentos DA OPERACAO. */
export const GRUPOS_DO_SELETOR_VENDA: { rotulo: string; especies: EspecieDoc[] }[] = [
  { rotulo: 'OPERAÇÃO', especies: ['contrato', 'nf_entrada', 'comprovante'] },
  GRUPOS_DO_SELETOR_ABATE[1],
];
/** Os grupos do seletor por tipo de OC; nulo = sem grade (compra). */
export function gruposDoSeletor(tipo: TipoOperacaoOC | null | undefined): { rotulo: string; especies: EspecieDoc[] }[] | null {
  return tipo === 'abate' ? GRUPOS_DO_SELETOR_ABATE : tipo === 'venda' ? GRUPOS_DO_SELETOR_VENDA : null;
}
/** As especies do bloco "SAÍDA DA FAZENDA" da lista (o resto vai no primeiro bloco: "ABATE · FRIGORÍFICO" ou "DA OPERAÇÃO"). */
export const ESPECIES_DA_SAIDA: EspecieDoc[] = ['nf_produtor', 'gta', 'guia', 'declaracao', 'outro', 'recibo'];
/** Os dois blocos da lista, por tipo de OC: o primeiro e' o do frigorifico (abate) ou o da operacao (venda). */
export function blocosDaLista(tipo: TipoOperacaoOC | null | undefined): { chave: 'abate' | 'operacao' | 'saida'; rotulo: string }[] {
  return [tipo === 'venda' ? { chave: 'operacao', rotulo: 'DA OPERAÇÃO' } : { chave: 'abate', rotulo: 'ABATE · FRIGORÍFICO' },
    { chave: 'saida', rotulo: 'SAÍDA DA FAZENDA' }];
}

/** As opcoes do Tipo da guia e da declaracao (gravadas em `dados.tipo_guia` / `dados.tipo_declaracao`). */
/* 7f-fix1: `curto` = a coluna Tipo da lista; `contagem` = [singular, plural] da linha de contagem do topo. Um lugar so'. */
export interface TipoDoDocumento { valor: string; rotulo: string; curto: string; contagem: [string, string] }
export const TIPOS_DE_GUIA: TipoDoDocumento[] = [
  { valor: 'fundersul', rotulo: 'Fundersul', curto: 'Fundersul', contagem: ['Fundersul', 'Fundersul'] },
  { valor: 'taxa_iagro', rotulo: 'Taxa Iagro', curto: 'Taxa Iagro', contagem: ['taxa Iagro', 'taxas Iagro'] },
  { valor: 'dare_icms', rotulo: 'DARE/ICMS', curto: 'DARE/ICMS', contagem: ['DARE/ICMS', 'DARE/ICMS'] },
  { valor: 'outra', rotulo: 'Outra', curto: 'Guia', contagem: ['outra guia', 'outras guias'] },
];
export const TIPOS_DE_DECLARACAO: TipoDoDocumento[] = [
  { valor: 'modelo_b', rotulo: 'Modelo B', curto: 'Modelo B', contagem: ['Modelo B', 'Modelo B'] },
  { valor: 'carta_garantia', rotulo: 'Carta de garantia', curto: 'Carta garantia', contagem: ['carta garantia', 'cartas garantia'] },
  { valor: 'outra', rotulo: 'Outra', curto: 'Decl.', contagem: ['outra declaração', 'outras declarações'] },
];

/** O tipo gravado em `dados.tipo_guia` / `dados.tipo_declaracao`; nulo sem tipo (ou tipo fora da lista) e nas outras especies. */
export function tipoDoDocumento(especie: EspecieDoc, dados: Record<string, unknown> | null | undefined): TipoDoDocumento | null {
  const lista = especie === 'guia' ? TIPOS_DE_GUIA : especie === 'declaracao' ? TIPOS_DE_DECLARACAO : null;
  const chave = especie === 'guia' ? 'tipo_guia' : 'tipo_declaracao';
  const v = lista && dados ? dados[chave] : null;
  return typeof v === 'string' ? lista!.find(t => t.valor === v) ?? null : null;
}

/** Rotulo curto do seletor do abate. */
export const ROTULO_SEGMENTO: Partial<Record<EspecieDoc, string>> = {
  nf_principal: 'NF', npr: 'NPR', acerto: 'Acerto', romaneio: 'Romaneio', outro: 'Outro',
  nf_produtor: 'NF produtor', gta: 'GTA', guia: 'Guia', declaracao: 'Declaração',
  contrato: 'Contrato', nf_entrada: 'NF entrada', comprovante: 'Comprovante',
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

/* ── 7f · SAIDA DA FAZENDA ─────────────────────────────────────────────────────────────────────────────────── */
const NF_PRODUTOR: CampoDef[][] = [
  [c('numero', 'Número', 1, { obrigatorio: true }), c('serie', 'Série'), c('dataEmissao', 'Emissão', 1, { obrigatorio: true }),
   c('dataSaida', 'Saída da fazenda'), c('lote', 'Lote')],
  [c('destinatario', 'Destinatário', 3), c('chaveAcesso', 'Chave de acesso', 2)],
  [c('cab', 'Cab', 1, { obrigatorio: true, numerico: true }), c('valorInformativo', 'Valor da nota R$', 1, { numerico: true }),
   c('gtaCitada', 'GTA citada'), c('observacao', 'Observação', 2)],
];
const GTA: CampoDef[][] = [
  [c('serie', 'Série', 1, { obrigatorio: true }), c('numero', 'Número', 1, { obrigatorio: true }),
   c('dataEmissao', 'Emissão', 1, { obrigatorio: true }), c('validade', 'Validade'), c('embarque', 'Embarque')],
  [c('femeas', 'Fêmeas', 1, { numerico: true }), c('machos', 'Machos', 1, { numerico: true }),
   c('cabGta', 'Cab', 1, { calculado: true, numerico: true }), c('finalidade', 'Finalidade'), c('destino', 'Destino')],
];
const GUIA: CampoDef[][] = [
  [c('tipoGuia', 'Tipo', 1, { obrigatorio: true }), c('numero', 'Identificação'), c('dataEmissao', 'Emissão'),
   c('vencimento', 'Vencimento', 1, { obrigatorio: true }), c('valorInformativo', 'Valor R$', 1, { obrigatorio: true, numerico: true })],
  [c('pagoEm', 'Pago em'), c('observacao', 'Observação', 3)],
];
const DECLARACAO: CampoDef[][] = [
  [c('tipoDeclaracao', 'Tipo', 1, { obrigatorio: true }), c('numero', 'Número'), c('dataEmissao', 'Data', 1, { obrigatorio: true }),
   c('cab', 'Cab', 1, { numerico: true })],
  [c('observacao', 'Observação', 3)],
];

/* ── OC-DOC-VENDA-01 · A VENDA ─────────────────────────────────────────────────────────────────────────────────
   A NF do produtor e' a NOTA DA VENDA: a mesma grade do abate (o leitor da NFP-e preenche os mesmos campos), com o valor
   obrigatorio — na venda ele SOMA (decisao do Gabriel, 21/10; a natureza do componente sai do tipo em `formDocumentoAbate`). */
const NF_PRODUTOR_VENDA: CampoDef[][] = [
  NF_PRODUTOR[0], NF_PRODUTOR[1],
  [c('cab', 'Cab', 1, { obrigatorio: true, numerico: true }), c('valorInformativo', 'Valor da nota R$', 1, { obrigatorio: true, numerico: true }),
   c('gtaCitada', 'GTA citada'), c('observacao', 'Observação', 2)],
];
/* Da operacao: informativos (nao somam). */
const CONTRATO: CampoDef[][] = [
  [c('numero', 'Nº contrato / pedido', 1, { obrigatorio: true }), c('dataEmissao', 'Data', 1, { obrigatorio: true }),
   c('valorInformativo', 'Valor R$', 1, { numerico: true }), c('lote', 'Lote')],
  [c('observacao', 'Observação', 5)],
];
const NF_ENTRADA: CampoDef[][] = [
  [c('numero', 'Número', 1, { obrigatorio: true }), c('serie', 'Série'), c('dataEmissao', 'Emissão', 1, { obrigatorio: true }),
   c('valorInformativo', 'Valor da nota R$', 1, { numerico: true }), c('lote', 'Lote')],
  [c('emitente', 'Emitente (comprador)', 3), c('chaveAcesso', 'Chave de acesso', 2)],
  [c('observacao', 'Observação', 5)],
];
const COMPROVANTE: CampoDef[][] = [
  [c('numero', 'Identificação'), c('dataEmissao', 'Data', 1, { obrigatorio: true }), c('valorInformativo', 'Valor R$', 1, { numerico: true }),
   c('lote', 'Lote')],
  [c('observacao', 'Observação', 5)],
];

/* "Outro" = os campos de hoje do formulario (numero, serie, emissao, valor, emitente, chave, observacao). No abate ele e'
   INFORMATIVO: a lista o mostra em cinza e o banco nao o soma. */
const OUTRO: CampoDef[][] = [
  [c('numero', 'Número'), c('serie', 'Série'), c('dataEmissao', 'Emissão'), c('valor', 'Valor R$', 1, { numerico: true }), c('lote', 'Lote')],
  [c('emitente', 'Emitente', 3), c('chaveAcesso', 'Chave de acesso', 2)],
  [c('observacao', 'Observação', 3)],
];

/**
 * As linhas da grade (5 colunas) de uma especie. NULO = esta OC usa o formulario de hoje (compra; na venda, o legado).
 * No abate: NF complementar usa a grade da NF; recibo (legado) a do "outro".
 */
export function camposDaEspecie(tipo: TipoOperacaoOC, especie: EspecieDoc): CampoDef[][] | null {
  if (tipo === 'venda') {
    switch (especie) {
      case 'nf_produtor': return NF_PRODUTOR_VENDA;
      case 'gta': return GTA;
      case 'guia': return GUIA;
      case 'declaracao': return DECLARACAO;
      case 'outro': return OUTRO;
      case 'contrato': return CONTRATO;
      case 'nf_entrada': return NF_ENTRADA;
      case 'comprovante': return COMPROVANTE;
      default: return null;   // nf_principal, nf_complementar, recibo: o formulario de hoje
    }
  }
  if (tipo !== 'abate') return null;
  switch (especie) {
    case 'nf_principal': case 'nf_complementar': return NF;
    case 'acerto': return ACERTO;
    case 'npr': return NPR;
    case 'romaneio': return ROMANEIO;
    case 'nf_produtor': return NF_PRODUTOR;
    case 'gta': return GTA;
    case 'guia': return GUIA;
    case 'declaracao': return DECLARACAO;
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
