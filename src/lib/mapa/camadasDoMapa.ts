/**
 * MAPA-02a — as CAMADAS do mapa de pastos (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`): a cor de cada pasto por camada e a
 * legenda de cada uma; as áreas que não são pasto pintam pelo `fazenda_geometrias.tipo` em qualquer camada.
 * As faixas de lotação vêm de `faixasLotacao.ts` (a régua é uma só).
 * MAPA-ATIVIDADE-LAVOURA-01 (Gabriel 01/11): o pasto FORA da pecuária no mês (lavoura, eucalipto, reserva/APP, benfeitorias) pinta pela
 * cor da FAMÍLIA em TODA camada — nunca "vazio" nem "sem fechamento" — e a legenda ganha as famílias presentes (D2/D3).
 */
import { COR_DA_FAIXA, COR_SEM_FECHAMENTO, ROTULO_DA_FAIXA, type FaixaLotacao } from '@/lib/mapa/faixasLotacao';
import { ORDEM_DAS_FAMILIAS, ROTULO_DA_FAMILIA, type FamiliaForaDaPecuaria } from '@/lib/mapa/usoDoPasto';
import { definicaoDoTipoDeArea, ROTULO_DA_FAMILIA_DE_AREA, type FamiliaDeArea } from '@/lib/mapa/tiposDeArea';
import { tipoUsoLabel } from '@/lib/calculos/labels';

/** O rótulo da atividade do mês: o da casa (`tipoUsoLabel`); o que ele não conhece (ex.: 'vedado'), com a 1ª letra maiúscula. */
export function rotuloDaAtividade(tipo: string | null | undefined): string {
  if (!tipo) return 'Sem atividade';
  const r = tipoUsoLabel(tipo);
  return r === tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ') : r;
}

export type CamadaDoMapa = 'situacao' | 'kg_ha' | 'atividade' | 'cabecas' | 'tipo_area' | 'area';

/** `curto` = o nome no botão Camadas (152px desde o MAPA-GLOBAL-01, para caber o "← Global"), quando o inteiro não cabe; o inteiro fica no menu, no title e na legenda. */
export const CAMADAS: { valor: CamadaDoMapa; rotulo: string; curto?: string }[] = [
  { valor: 'situacao', rotulo: 'Situação da lotação', curto: 'Situação' },
  { valor: 'kg_ha', rotulo: 'Lotação (kg/ha)', curto: 'Lotação' },
  { valor: 'atividade', rotulo: 'Atividade' },
  { valor: 'cabecas', rotulo: 'Cabeças' },
  /* o nome inteiro não cabe no botão de 152 px ("Camadas: Tipo de área" cortava 4 px): o curto vai no botão, o inteiro no menu e no title */
  { valor: 'tipo_area', rotulo: 'Tipo de área', curto: 'Tipo área' },
  /* MAPA-ROTULO-POR-CAMADA-01: a área de cada pasto (a oficial do cadastro), cor neutra por faixa de tamanho */
  { valor: 'area', rotulo: 'Área (ha)' },
];

/** MAPA-ROTULO-POR-CAMADA-01 — as faixas de tamanho da camada "Área (ha)" (limite inferior em ha) e a rampa neutra (azul-acinzentado). */
export const FAIXAS_DE_AREA: readonly { de: number; rotulo: string; cor: string }[] = [
  { de: 0, rotulo: '< 10 ha', cor: '#E3E8EF' },
  { de: 10, rotulo: '10–25', cor: '#C3CDDA' },
  { de: 25, rotulo: '25–50', cor: '#9DACC0' },
  { de: 50, rotulo: '50–100', cor: '#7488A3' },
  { de: 100, rotulo: '100+ ha', cor: '#4E6584' },
];
export function corDaFaixaDeArea(ha: number | null | undefined): string {
  if (ha == null || !(ha > 0)) return COR_SEM_FECHAMENTO;
  let cor = FAIXAS_DE_AREA[0].cor;
  for (const f of FAIXAS_DE_AREA) if (ha >= f.de) cor = f.cor;
  return cor;
}

/** As camadas do mock que ainda não existem (desabilitadas, com o selo "em breve"). */
export const CAMADAS_EM_BREVE: { grupo: string; itens: string[] }[] = [
  { grupo: 'Manejo (com movimentação por dia)', itens: ['Dias desde o último pastejo', 'Dias vazios', 'Dias de pastejo restantes'] },
  { grupo: 'Índices do satélite', itens: ['Vigor do capim (NDVI)', 'Oferta de forragem (kg MS/ha)'] },
];

const KG_HA = ['#E8F3E2', '#C2E2B0', '#94CC7E', '#5FB05A', '#2F8A3E', '#1A5E2A'];
const CABECAS = ['#FDE7C8', '#F8C27D', '#EF9440', '#D2611E', '#9E3D10'];
const ATIVIDADE: Record<string, string> = { cria: '#D98E3B', recria: '#3E86C6', engorda: '#8E5BB5' };
const ATIVIDADE_OUTRA = '#6E8B6A';

export const COR_TIPO_AREA = {
  pasto: '#3E9E5F',
  area_sem_uso: '#C9A27A',
  ambiental: '#46663A',
  estrutura: '#9AA3AE',
} as const;

/**
 * MAPA-ATIVIDADE-LAVOURA-01 — as cores das famílias fora da pecuária, as mesmas em toda camada.
 * D2: a LAVOURA é bege-terra/palha escuro, longe do amarelo do "sublotado" (#E2B53E), do verde do "ideal" (#3E9E5F) e do bege claro da
 * "área sem uso" (#C9A27A). Reserva/APP é a cor ambiental de sempre; benfeitorias um cinza-violeta (o cinza puro é o "vazio").
 */
export const COR_FORA_DA_PECUARIA: Record<FamiliaForaDaPecuaria, string> = {
  lavoura: '#8A6A3B',
  silvicultura: '#2E6E62',
  ambiental: COR_TIPO_AREA.ambiental,
  benfeitorias: '#7B6F8E',
  outro: '#A88BC4',
};

export interface PastoNaCamada {
  /** MAPA-ATIVIDADE-LAVOURA-01: a família do uso do mês quando NÃO é pecuária (null/ausente = pecuária) */
  foraDaPecuaria?: FamiliaForaDaPecuaria | null;
  /** MAPA-ROTULO-POR-CAMADA-01: a área oficial do pasto (a camada "Área (ha)" pinta por faixa de tamanho, qualquer que seja o uso) */
  areaHa?: number | null;
  temFechamento: boolean;
  kgHa: number | null;
  cabecas: number | null;
  faixa: FaixaLotacao | null;
  atividade: string | null;
}

/** A cor do pasto na camada. Sem fechamento no mês: a cor do "sem dado" em toda camada de rebanho. */
export function corDoPasto(camada: CamadaDoMapa, p: PastoNaCamada): string {
  if (camada === 'area') return corDaFaixaDeArea(p.areaHa);
  if (p.foraDaPecuaria) return COR_FORA_DA_PECUARIA[p.foraDaPecuaria];
  if (camada === 'tipo_area') return COR_TIPO_AREA.pasto;
  if (!p.temFechamento) return COR_SEM_FECHAMENTO;
  if (camada === 'situacao') return p.faixa ? COR_DA_FAIXA[p.faixa] : COR_SEM_FECHAMENTO;
  if (camada === 'kg_ha') return !p.kgHa ? COR_DA_FAIXA.vazio : KG_HA[Math.min(5, Math.floor(p.kgHa / 120))];
  if (camada === 'cabecas') return !p.cabecas ? COR_DA_FAIXA.vazio : CABECAS[Math.min(4, Math.floor(p.cabecas / 40))];
  if (!p.cabecas) return COR_DA_FAIXA.vazio;
  return p.atividade ? ATIVIDADE[p.atividade] ?? ATIVIDADE_OUTRA : ATIVIDADE_OUTRA;
}

/**
 * MAPA-AREA-TIPOS-02 (D4, Gabriel 02/11) — a cor da área pela FAMÍLIA do tipo (o catálogo `tiposDeArea.ts`): Estruturas no cinza-violeta
 * das benfeitorias (o cinza puro é o "Vazio" das camadas de rebanho), Água azul-claro (longe do azul da recria), Ambiental o verde-escuro
 * de sempre, Outros o bege da área sem uso. Sem classificação continua no cinza.
 */
export const COR_DA_FAMILIA_DE_AREA: Record<FamiliaDeArea, string> = {
  estruturas: '#7B6F8E',
  /* Gabriel 02/11 11:11: estruturas de pecuária (curral, confinamento, manga, embarcadouro, praça) em rosa-amadeirado, longe do laranja da
     cria, do vermelho da carga alta e do bege da lavoura */
  estruturas_pecuaria: '#A35D6A',
  agua: '#5FA3C4',
  ambiental: COR_TIPO_AREA.ambiental,
  outros: COR_TIPO_AREA.area_sem_uso,
};

/** A cor de uma área que não é pasto (qualquer camada). `area_total` não pinta: só o contorno. */
export function corDaArea(tipo: string): string {
  const def = definicaoDoTipoDeArea(tipo);
  return def ? COR_DA_FAMILIA_DE_AREA[def.familia] : COR_TIPO_AREA.estrutura;
}

export interface ItemDaLegenda { cor: string; rotulo: string }

/** A legenda da camada. `atividades` = as atividades do mês presentes nos pastos de PECUÁRIA do mapa; `familias` = as famílias fora da
 *  pecuária presentes (MAPA-ATIVIDADE-LAVOURA-01), no fim, sem repetir um rótulo que a camada já tem. */
export function legendaDaCamada(camada: CamadaDoMapa, atividades: readonly string[], familias: readonly FamiliaForaDaPecuaria[] = []): ItemDaLegenda[] {
  const base = legendaDaPecuaria(camada, atividades);
  if (camada === 'area') return base; // a área pinta por tamanho, qualquer que seja o uso
  const presentes = ORDEM_DAS_FAMILIAS.filter(f => familias.includes(f))
    .map(f => ({ cor: COR_FORA_DA_PECUARIA[f], rotulo: ROTULO_DA_FAMILIA[f] }))
    .filter(i => !base.some(b => b.rotulo === i.rotulo && b.cor === i.cor));
  /* o "sem fechamento" fica por último em toda camada de rebanho */
  const fim = base.length && base[base.length - 1].cor === COR_SEM_FECHAMENTO ? base.length - 1 : base.length;
  return [...base.slice(0, fim), ...presentes, ...base.slice(fim)];
}

function legendaDaPecuaria(camada: CamadaDoMapa, atividades: readonly string[]): ItemDaLegenda[] {
  if (camada === 'area') return [...FAIXAS_DE_AREA.map(f => ({ cor: f.cor, rotulo: f.rotulo })), { cor: COR_SEM_FECHAMENTO, rotulo: 'Sem área no cadastro' }];
  const semFechamento = { cor: COR_SEM_FECHAMENTO, rotulo: 'Sem fechamento no mês' };
  if (camada === 'situacao') {
    return [
      { cor: COR_DA_FAIXA.ideal, rotulo: ROTULO_DA_FAIXA.ideal },
      { cor: COR_DA_FAIXA.sublotado, rotulo: ROTULO_DA_FAIXA.sublotado },
      { cor: COR_DA_FAIXA.carga_alta, rotulo: ROTULO_DA_FAIXA.carga_alta },
      { cor: COR_DA_FAIXA.vazio, rotulo: ROTULO_DA_FAIXA.vazio },
      semFechamento,
    ];
  }
  if (camada === 'kg_ha') {
    return [{ cor: COR_DA_FAIXA.vazio, rotulo: 'Vazio' }, { cor: KG_HA[0], rotulo: '< 120' },
      ...[120, 240, 360, 480, 600].map((v, i) => ({ cor: KG_HA[i + 1], rotulo: `${v}+` })), semFechamento];
  }
  if (camada === 'cabecas') {
    return [{ cor: COR_DA_FAIXA.vazio, rotulo: '0' }, { cor: CABECAS[0], rotulo: '1–39' },
      ...[40, 80, 120, 160].map((v, i) => ({ cor: CABECAS[i + 1], rotulo: `${v}+` })), semFechamento];
  }
  if (camada === 'atividade') {
    const vistas = [...new Set(atividades)].sort((a, b) => {
      const ordem = ['cria', 'recria', 'engorda'];
      const ia = ordem.indexOf(a); const ib = ordem.indexOf(b);
      return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || a.localeCompare(b);
    });
    const temOutra = vistas.some(a => !ATIVIDADE[a]);
    return [
      ...vistas.filter(a => ATIVIDADE[a]).map(a => ({ cor: ATIVIDADE[a], rotulo: rotuloDaAtividade(a) })),
      ...(temOutra ? [{ cor: ATIVIDADE_OUTRA, rotulo: 'Outras atividades' }] : []),
      { cor: COR_DA_FAIXA.vazio, rotulo: 'Sem animais' },
      semFechamento,
    ];
  }
  return [
    { cor: COR_TIPO_AREA.pasto, rotulo: 'Pasto' },
    { cor: COR_DA_FAMILIA_DE_AREA.estruturas, rotulo: ROTULO_DA_FAMILIA_DE_AREA.estruturas },
    { cor: COR_DA_FAMILIA_DE_AREA.estruturas_pecuaria, rotulo: ROTULO_DA_FAMILIA_DE_AREA.estruturas_pecuaria },
    { cor: COR_DA_FAMILIA_DE_AREA.agua, rotulo: ROTULO_DA_FAMILIA_DE_AREA.agua },
    { cor: COR_DA_FAMILIA_DE_AREA.ambiental, rotulo: 'Reserva legal / APP' },
    { cor: COR_DA_FAMILIA_DE_AREA.outros, rotulo: 'Outros (estrada, sem uso)' },
    { cor: COR_TIPO_AREA.estrutura, rotulo: 'Sem classificação' },
  ];
}
