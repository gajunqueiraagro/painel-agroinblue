/**
 * INFRA-FICHAS-PATR-01 — a FICHA de cada infraestrutura (o que se guarda em `fazenda_infraestruturas.ficha`) e o bem do Patrimônio que
 * nasce dela. Puro: sem React e sem rede.
 * - Os campos e a FORMA de cada um são os do banco (`_fn_infra_ficha_campos`): texto, número (> 0), inteiro (≥ 1), sim/não, lados (1|2).
 *   O banco confere a forma; as OPÇÕES daqui são sugestão (botões) e "Outro…" deixa digitar — o banco nunca trava pela lista.
 *   Os exemplos de `fichasDaInfra.exemplos.json` têm as MESMAS chaves; o teste SQL os grava no banco (paridade pelos dois lados).
 * - D2 (Gabriel 01/11): a categoria do Patrimônio de cada tipo, entre as que existem (Instalações, Rede de água, Benfeitorias, Máquinas,
 *   Cercas). D6: a vida útil por material é SUGESTÃO (pedido INFRA-FICHAS-PATRIMONIO.md; concreto 20 e madeira 15 confirmados); vale o
 *   que ficar na prévia. Material fora da tabela = a vida útil da categoria (null aqui).
 */
import type { TipoInfra } from '@/lib/mapa/infraestrutura';
import { definicaoDoTipo } from '@/lib/mapa/infraestrutura';
import { formatNum } from '@/lib/calculos/formatters';

export type FormaDoCampo = 'texto' | 'numero' | 'inteiro' | 'simnao' | 'lados';
export type ValorDaFicha = string | number | boolean;
export type Ficha = Record<string, ValorDaFicha>;

export interface CampoDaFicha {
  chave: string;
  rotulo: string;
  forma: FormaDoCampo;
  /** as opções-padrão (texto); sem elas, campo livre */
  opcoes?: readonly string[];
  unidade?: string;
  casas?: number;
}

interface DefinicaoDaFicha {
  campos: readonly CampoDaFicha[];
  /** o código da categoria do Patrimônio (D2) */
  categoria: string;
  /** a vida útil sugerida em anos (D6); null = a da categoria */
  vidaUtil: (f: Ficha) => number | null;
}

const MATERIAL = (opcoes: readonly string[]): CampoDaFicha => ({ chave: 'material', rotulo: 'Material', forma: 'texto', opcoes });
const COBERTO: CampoDaFicha = { chave: 'coberto', rotulo: 'Coberto', forma: 'simnao' };
const COMPRIMENTO: CampoDaFicha = { chave: 'comprimento_m', rotulo: 'Comprimento', forma: 'numero', unidade: 'm', casas: 1 };
const AREA_CONSTRUIDA: CampoDaFicha = { chave: 'area_construida_m2', rotulo: 'Área construída', forma: 'numero', unidade: 'm²', casas: 0 };
const MATERIAL_CONSTRUCAO = MATERIAL(['Alvenaria', 'Madeira', 'Metálico', 'Misto']);

/** a vida útil pela tabela do material (ou de outro campo): o valor escolhido, sem diferenciar maiúscula */
function porTabela(chave: string, tabela: Record<string, number>, senao: number | null = null) {
  return (f: Ficha): number | null => {
    const v = f[chave];
    if (typeof v !== 'string') return senao;
    const achado = Object.entries(tabela).find(([k]) => k.toLowerCase() === v.trim().toLowerCase());
    return achado ? achado[1] : senao;
  };
}
const fixa = (anos: number) => () => anos;

export const FICHAS: Record<TipoInfra, DefinicaoDaFicha> = {
  cocho: {
    campos: [MATERIAL(['Concreto', 'Madeira', 'Plástico', 'Metal', 'Pneu']), COMPRIMENTO,
      { chave: 'lados', rotulo: 'Lados de acesso', forma: 'lados' }, COBERTO,
      { chave: 'uso', rotulo: 'Uso', forma: 'texto', opcoes: ['Sal mineral', 'Proteinado / ração', 'Volumoso / confinamento'] }],
    categoria: 'instalacoes',
    vidaUtil: porTabela('material', { Concreto: 20, Madeira: 15, Metal: 15, Plástico: 10, Pneu: 5 }),
  },
  bebedouro: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Australiano', 'Pilheta', 'Boia / automático'] },
      MATERIAL(['Concreto', 'Alvenaria', 'Plástico', 'Metal']),
      { chave: 'capacidade_l', rotulo: 'Capacidade', forma: 'numero', unidade: 'L', casas: 0 },
      { chave: 'abastecimento', rotulo: 'Abastecimento', forma: 'texto', opcoes: ['Rede', 'Poço', 'Represa'] }],
    categoria: 'rede_agua',
    vidaUtil: porTabela('material', { Concreto: 20, Alvenaria: 20, Metal: 15, Plástico: 10 }),
  },
  saleiro: {
    campos: [MATERIAL(['Madeira', 'Concreto']), COBERTO, COMPRIMENTO],
    categoria: 'instalacoes',
    vidaUtil: porTabela('material', { Madeira: 10, Concreto: 20 }),
  },
  caixa_dagua: {
    campos: [MATERIAL(['Concreto', 'Fibra', 'Plástico', 'Metal']),
      { chave: 'capacidade_l', rotulo: 'Capacidade', forma: 'numero', unidade: 'L', casas: 0 },
      { chave: 'elevada', rotulo: 'Elevada', forma: 'simnao' }],
    categoria: 'rede_agua',
    vidaUtil: porTabela('material', { Concreto: 20, Fibra: 15, Plástico: 15, Metal: 15 }),
  },
  poco: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Artesiano', 'Semiartesiano', 'Cacimba'] },
      { chave: 'profundidade_m', rotulo: 'Profundidade', forma: 'numero', unidade: 'm', casas: 0 },
      { chave: 'vazao_m3h', rotulo: 'Vazão', forma: 'numero', unidade: 'm³/h', casas: 1 },
      /* a bomba é bem próprio (Máquinas, 10 anos): aqui só se descreve; ligar ao bem dela fica para depois */
      { chave: 'bomba', rotulo: 'Bomba', forma: 'texto' }],
    categoria: 'rede_agua',
    vidaUtil: fixa(20),
  },
  represa_acude: {
    campos: [{ chave: 'finalidade', rotulo: 'Finalidade', forma: 'texto', opcoes: ['Dessedentação do gado', 'Irrigação', 'Reserva de água'] }],
    categoria: 'rede_agua',
    vidaUtil: fixa(25),
  },
  curral: {
    campos: [{ chave: 'area_m2', rotulo: 'Área', forma: 'numero', unidade: 'm²', casas: 0 }, MATERIAL(['Madeira', 'Concreto', 'Metal']),
      { chave: 'divisoes', rotulo: 'Nº de divisões', forma: 'inteiro' }],
    categoria: 'instalacoes',
    vidaUtil: porTabela('material', { Madeira: 15, Concreto: 25, Metal: 25 }),
  },
  tronco_brete: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Tronco de contenção', 'Tronco hidráulico', 'Brete', 'Embarcadouro'] },
      MATERIAL(['Madeira', 'Metal'])],
    categoria: 'instalacoes',
    vidaUtil: porTabela('material', { Madeira: 15, Metal: 20 }),
  },
  balanca: {
    campos: [{ chave: 'capacidade_kg', rotulo: 'Capacidade', forma: 'numero', unidade: 'kg', casas: 0 },
      { chave: 'marca_modelo', rotulo: 'Marca / modelo', forma: 'texto' }, { chave: 'eletronica', rotulo: 'Eletrônica', forma: 'simnao' }],
    categoria: 'maquinas',
    vidaUtil: fixa(10),
  },
  porteira: {
    campos: [MATERIAL(['Madeira', 'Metal']), { chave: 'largura_m', rotulo: 'Largura', forma: 'numero', unidade: 'm', casas: 1 }],
    categoria: 'cercas',
    vidaUtil: porTabela('material', { Madeira: 10, Metal: 15 }),
  },
  cerca: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Arame liso', 'Arame farpado', 'Elétrica', 'Tela'] },
      { chave: 'fios', rotulo: 'Nº de fios', forma: 'inteiro' },
      { chave: 'mourao', rotulo: 'Mourão', forma: 'texto', opcoes: ['Madeira', 'Concreto', 'Eucalipto tratado'] }],
    categoria: 'cercas',
    vidaUtil: porTabela('modelo', { Elétrica: 10 }, 15),
  },
  sede_casa: { campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO], categoria: 'benfeitorias', vidaUtil: fixa(25) },
  galpao: { campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO], categoria: 'benfeitorias', vidaUtil: fixa(25) },
  energia: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Rede', 'Poste', 'Transformador'] },
      { chave: 'potencia_kva', rotulo: 'Potência', forma: 'numero', unidade: 'kVA', casas: 0 }],
    categoria: 'instalacoes',
    vidaUtil: fixa(20),
  },
  /* MAPA-AREA-TIPOS-02 — as estruturas que nascem de uma área do mapa. A vida útil fora da tabela do pedido segue a da categoria
     (edificação 25; instalação 20) como sugestão. */
  armazem_graos: {
    campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO, { chave: 'capacidade_t', rotulo: 'Capacidade', forma: 'numero', unidade: 't', casas: 0 }],
    categoria: 'benfeitorias', vidaUtil: fixa(25),
  },
  silo_secador: {
    campos: [{ chave: 'modelo', rotulo: 'Tipo', forma: 'texto', opcoes: ['Silo', 'Secador', 'Silo secador'] },
      { chave: 'capacidade_t', rotulo: 'Capacidade', forma: 'numero', unidade: 't', casas: 0 }],
    categoria: 'instalacoes', vidaUtil: fixa(20),
  },
  oficina: { campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO], categoria: 'benfeitorias', vidaUtil: fixa(25) },
  casa_funcionario: { campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO], categoria: 'benfeitorias', vidaUtil: fixa(25) },
  escritorio: { campos: [AREA_CONSTRUIDA, MATERIAL_CONSTRUCAO], categoria: 'benfeitorias', vidaUtil: fixa(25) },
  confinamento: {
    campos: [{ chave: 'area_m2', rotulo: 'Área', forma: 'numero', unidade: 'm²', casas: 0 },
      { chave: 'capacidade_cab', rotulo: 'Capacidade (cab.)', forma: 'inteiro' }, COBERTO],
    categoria: 'instalacoes', vidaUtil: fixa(20),
  },
};

export function camposDaFicha(tipo: TipoInfra): readonly CampoDaFicha[] {
  return FICHAS[tipo].campos;
}

/** A categoria do Patrimônio do tipo (D2). O tronco HIDRÁULICO é equipamento (Máquinas), o resto do tronco é instalação. */
export function categoriaDoTipo(tipo: TipoInfra, f: Ficha): string {
  if (tipo === 'tronco_brete' && f.modelo === 'Tronco hidráulico') return 'maquinas';
  return FICHAS[tipo].categoria;
}

/** A vida útil sugerida em anos (D6); null = fica a da categoria. */
export function vidaUtilSugerida(tipo: TipoInfra, f: Ficha): number | null {
  return FICHAS[tipo].vidaUtil(f);
}

/** Metros lineares úteis do cocho = comprimento × lados (calculado, nunca gravado à parte). */
export function metrosUteis(f: Ficha): number | null {
  const c = f.comprimento_m; const l = f.lados;
  return typeof c === 'number' && c > 0 && (l === 1 || l === 2) ? c * l : null;
}

/** A ficha que vai ao banco: só os campos do tipo e só os preenchidos (texto aparado; número > 0; inteiro ≥ 1; lados 1|2). */
export function limparFicha(tipo: TipoInfra, f: Ficha): Ficha {
  const saida: Ficha = {};
  for (const c of FICHAS[tipo].campos) {
    const v = f[c.chave];
    if (c.forma === 'texto' && typeof v === 'string' && v.trim()) saida[c.chave] = v.trim().slice(0, 80);
    else if (c.forma === 'numero' && typeof v === 'number' && v > 0) saida[c.chave] = v;
    else if (c.forma === 'inteiro' && typeof v === 'number' && v >= 1) saida[c.chave] = Math.round(v);
    else if (c.forma === 'lados' && (v === 1 || v === 2)) saida[c.chave] = v;
    else if (c.forma === 'simnao' && typeof v === 'boolean') saida[c.chave] = v;
  }
  return saida;
}

/** A ficha lida do banco (só os valores das formas aceitas). */
export function lerFicha(dado: unknown): Ficha {
  if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) return {};
  const f: Ficha = {};
  for (const [k, v] of Object.entries(dado)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') f[k] = v;
  return f;
}

/** O valor do campo como a tela escreve ("12,0 m", "Sim"); vazio = ''. */
export function textoDoCampo(c: CampoDaFicha, v: ValorDaFicha | undefined): string {
  if (v === undefined || v === '') return '';
  if (c.forma === 'simnao') return v === true ? 'Sim' : v === false ? 'Não' : '';
  if (typeof v === 'number') return `${formatNum(v, c.forma === 'numero' ? c.casas ?? 0 : 0)}${c.unidade ? ` ${c.unidade}` : ''}`;
  return String(v);
}

function minuscula(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * A descrição do bem montada da ficha (editável na prévia): "Cocho de concreto coberto · 12 m · 2 lados (24 m úteis) · sal mineral ·
 * P_01". O tipo e o material abrem; sim/não viram adjetivo; números com unidade; os outros textos em minúscula; o pasto fecha.
 */
export function descricaoDaFicha(tipo: TipoInfra, f: Ficha, pasto: string | null): string {
  const rotulo = definicaoDoTipo(tipo)?.rotulo ?? tipo;
  const material = typeof f.material === 'string' && f.material.trim() ? ` de ${minuscula(f.material.trim())}` : '';
  const adjetivos = [f.coberto === true ? 'coberto' : '', f.elevada === true ? 'elevada' : '', f.eletronica === true ? 'eletrônica' : '']
    .filter(Boolean).join(' ');
  const partes: string[] = [`${rotulo}${material}${adjetivos ? ` ${adjetivos}` : ''}`];
  for (const c of FICHAS[tipo].campos) {
    const v = f[c.chave];
    if (c.chave === 'material' || c.forma === 'simnao' || v === undefined) continue;
    if (c.forma === 'lados' && typeof v === 'number') {
      const uteis = metrosUteis(f);
      partes.push(`${v} ${v === 1 ? 'lado' : 'lados'}${uteis != null ? ` (${formatNum(uteis, 0)} m úteis)` : ''}`);
    } else if (c.forma === 'inteiro' && typeof v === 'number') partes.push(`${v} ${minuscula(c.rotulo.replace(/^Nº de /, ''))}`);
    else if (typeof v === 'number') partes.push(textoDoCampo({ ...c, casas: Number.isInteger(v) ? 0 : c.casas }, v));
    else if (typeof v === 'string' && v.trim()) partes.push(minuscula(v.trim()));
  }
  if (pasto) partes.push(pasto);
  return partes.join(' · ');
}
