/**
 * MAPA-IMPRESSAO-01 — o que cada polígono é NA FOLHA e como se pinta (D5, Gabriel 03/11: na impressão a APP é verde-água e a reserva tem
 * hachura; as cores do app NÃO mudam agora). O pasto vai pela família do uso do mês (`usoDoMes`, a mesma do Gestor); a área pelo
 * `fazenda_geometrias.tipo` (os 23 do banco caem nas classes abaixo; tipo desconhecido = "Outras áreas", nunca some).
 */
import { grupoDoTipoUso } from '@/lib/pastos/tiposUso';

export type ClasseDaFolha =
  | 'pastagem' | 'lavoura' | 'silvicultura' | 'reserva' | 'app' | 'agua' | 'estruturas' | 'estradas' | 'sem_uso' | 'outras' | 'limite';

export interface EstiloDaClasse {
  rotulo: string;
  /** preenchimento e opacidade sobre a imagem / sobre o papel (sem satélite) */
  cor: string;
  opImagem: number;
  opPapel: number;
  borda: string;
  bordaPapel: string;
  hachura?: boolean;
  /** só o contorno, tracejado (o limite da fazenda) */
  contorno?: boolean;
}

export const ESTILOS: Record<ClasseDaFolha, EstiloDaClasse> = {
  pastagem: { rotulo: 'Pastagem', cor: '#3E9E5F', opImagem: 0.18, opPapel: 0.32, borda: '#FFF6C8', bordaPapel: '#2F6B44' },
  lavoura: { rotulo: 'Lavoura', cor: '#D9A441', opImagem: 0.3, opPapel: 0.4, borda: '#FFE6A8', bordaPapel: '#8A6418' },
  silvicultura: { rotulo: 'Silvicultura', cor: '#7A5C3A', opImagem: 0.35, opPapel: 0.4, borda: '#E8D3B5', bordaPapel: '#5A4128' },
  reserva: { rotulo: 'Reserva legal', cor: '#2F5A2A', opImagem: 0.45, opPapel: 0.5, borda: '#B9E39A', bordaPapel: '#2F5A2A', hachura: true },
  app: { rotulo: 'APP', cor: '#2E8C86', opImagem: 0.45, opPapel: 0.45, borda: '#9EE6E0', bordaPapel: '#1F6E69' },
  agua: { rotulo: 'Água e várzea', cor: '#4A7FB5', opImagem: 0.45, opPapel: 0.45, borda: '#BFD9F2', bordaPapel: '#2F5F8F' },
  estruturas: { rotulo: 'Estruturas e benfeitorias', cor: '#9AA3AE', opImagem: 0.6, opPapel: 0.6, borda: '#E4E8EC', bordaPapel: '#5F6873' },
  estradas: { rotulo: 'Estradas e corredores', cor: '#C9C2B4', opImagem: 0.75, opPapel: 0.8, borda: '#EDE7DA', bordaPapel: '#8C8576' },
  sem_uso: { rotulo: 'Área sem uso', cor: '#C9A27A', opImagem: 0.45, opPapel: 0.45, borda: '#F0DCC5', bordaPapel: '#8A6A48' },
  outras: { rotulo: 'Outras áreas', cor: '#B8BEC6', opImagem: 0.4, opPapel: 0.35, borda: '#E4E8EC', bordaPapel: '#7A828C' },
  limite: { rotulo: 'Limite da fazenda', cor: '#FFFFFF', opImagem: 0, opPapel: 0, borda: '#FFFFFF', bordaPapel: '#1F2A44', contorno: true },
};

/** A ordem da legenda (e de desenho: o limite por baixo, o pasto por cima). */
export const ORDEM_DAS_CLASSES: readonly ClasseDaFolha[] = [
  'limite', 'pastagem', 'lavoura', 'silvicultura', 'reserva', 'app', 'agua', 'estruturas', 'estradas', 'sem_uso', 'outras',
];

const POR_TIPO: Record<string, ClasseDaFolha> = {
  area_total: 'limite', area_fazenda: 'limite',
  reserva_legal: 'reserva', app: 'app',
  varzea_brejo: 'agua', represa_acude: 'agua', lagoa: 'agua',
  benfeitoria: 'estruturas', armazem_graos: 'estruturas', silo_secador: 'estruturas', oficina: 'estruturas', casa_funcionario: 'estruturas',
  escritorio: 'estruturas', patio: 'estruturas', curral: 'estruturas', confinamento: 'estruturas', manga: 'estruturas',
  embarcadouro_brete: 'estruturas', praca_alimentacao: 'estruturas', cascalheira: 'estruturas', descarte: 'estruturas',
  estrada: 'estradas', pista: 'estradas',
  area_sem_uso: 'sem_uso',
};

/** A classe de uma ÁREA (polígono que não é pasto) pelo tipo gravado. */
export const classeDaArea = (tipo: string): ClasseDaFolha => POR_TIPO[tipo] ?? 'outras';

/** A classe de um PASTO pelo uso do mês (reserva/APP cadastradas como pasto vão para a classe delas). */
export function classeDoPasto(uso: string | null | undefined): ClasseDaFolha {
  if (uso === 'reserva') return 'reserva';
  if (uso === 'app') return 'app';
  switch (grupoDoTipoUso(uso ?? '')) {
    case 'pecuaria': return 'pastagem';
    case 'agricultura': return 'lavoura';
    case 'silvicultura': return 'silvicultura';
    case 'infraestrutura': return 'estruturas';
    default: return uso ? 'outras' : 'pastagem';
  }
}
