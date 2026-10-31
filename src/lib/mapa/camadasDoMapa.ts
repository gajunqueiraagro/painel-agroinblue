/**
 * MAPA-02a — as CAMADAS do mapa de pastos (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`): a cor de cada pasto por camada e a
 * legenda de cada uma; as áreas que não são pasto pintam pelo `fazenda_geometrias.tipo` em qualquer camada.
 * As faixas de lotação vêm de `faixasLotacao.ts` (a régua é uma só).
 */
import { COR_DA_FAIXA, COR_SEM_FECHAMENTO, ROTULO_DA_FAIXA, type FaixaLotacao } from '@/lib/mapa/faixasLotacao';
import { tipoUsoLabel } from '@/lib/calculos/labels';

/** O rótulo da atividade do mês: o da casa (`tipoUsoLabel`); o que ele não conhece (ex.: 'vedado'), com a 1ª letra maiúscula. */
export function rotuloDaAtividade(tipo: string | null | undefined): string {
  if (!tipo) return 'Sem atividade';
  const r = tipoUsoLabel(tipo);
  return r === tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ') : r;
}

export type CamadaDoMapa = 'situacao' | 'kg_ha' | 'atividade' | 'cabecas' | 'tipo_area';

/** `curto` = o nome no botão Camadas (184px), quando o inteiro não cabe; o inteiro fica no menu, no title e na legenda. */
export const CAMADAS: { valor: CamadaDoMapa; rotulo: string; curto?: string }[] = [
  { valor: 'situacao', rotulo: 'Situação da lotação', curto: 'Situação' },
  { valor: 'kg_ha', rotulo: 'Lotação (kg/ha)' },
  { valor: 'atividade', rotulo: 'Atividade' },
  { valor: 'cabecas', rotulo: 'Cabeças' },
  { valor: 'tipo_area', rotulo: 'Tipo de área' },
];

/** As camadas do mock que ainda não existem (desabilitadas, com o selo "em breve"). */
export const CAMADAS_EM_BREVE: { grupo: string; itens: string[] }[] = [
  { grupo: 'Manejo (com movimentação por dia)', itens: ['Dias desde o último pastejo', 'Dias vazios', 'Dias de pastejo restantes'] },
  { grupo: 'Satélite', itens: ['Vigor do capim (NDVI)', 'Oferta de forragem (kg MS/ha)'] },
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

export interface PastoNaCamada {
  temFechamento: boolean;
  kgHa: number | null;
  cabecas: number | null;
  faixa: FaixaLotacao | null;
  atividade: string | null;
}

/** A cor do pasto na camada. Sem fechamento no mês: a cor do "sem dado" em toda camada de rebanho. */
export function corDoPasto(camada: CamadaDoMapa, p: PastoNaCamada): string {
  if (camada === 'tipo_area') return COR_TIPO_AREA.pasto;
  if (!p.temFechamento) return COR_SEM_FECHAMENTO;
  if (camada === 'situacao') return p.faixa ? COR_DA_FAIXA[p.faixa] : COR_SEM_FECHAMENTO;
  if (camada === 'kg_ha') return !p.kgHa ? COR_DA_FAIXA.vazio : KG_HA[Math.min(5, Math.floor(p.kgHa / 120))];
  if (camada === 'cabecas') return !p.cabecas ? COR_DA_FAIXA.vazio : CABECAS[Math.min(4, Math.floor(p.cabecas / 40))];
  if (!p.cabecas) return COR_DA_FAIXA.vazio;
  return p.atividade ? ATIVIDADE[p.atividade] ?? ATIVIDADE_OUTRA : ATIVIDADE_OUTRA;
}

/** A cor de uma área que não é pasto (qualquer camada). `area_total` não pinta: só o contorno. */
export function corDaArea(tipo: string): string {
  if (tipo === 'area_sem_uso') return COR_TIPO_AREA.area_sem_uso;
  if (tipo === 'reserva_legal' || tipo === 'app') return COR_TIPO_AREA.ambiental;
  return COR_TIPO_AREA.estrutura;
}

export interface ItemDaLegenda { cor: string; rotulo: string }

/** A legenda da camada. `atividades` = as atividades do mês presentes nos pastos do mapa. */
export function legendaDaCamada(camada: CamadaDoMapa, atividades: readonly string[]): ItemDaLegenda[] {
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
    { cor: COR_TIPO_AREA.area_sem_uso, rotulo: 'Área sem uso (terceiros)' },
    { cor: COR_TIPO_AREA.ambiental, rotulo: 'Reserva legal / APP' },
    { cor: COR_TIPO_AREA.estrutura, rotulo: 'Benfeitorias / estradas' },
  ];
}
