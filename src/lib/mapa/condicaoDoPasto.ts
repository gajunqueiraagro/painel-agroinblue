/**
 * PASTO-CONDICAO-01 (Gabriel 03/11, D1–D7) — a CONDIÇÃO do pasto é uma situação COM DATA, por mês (degradada · em reforma · em
 * recuperação · zona de erosão), com histórico. Mora em `pasto_condicao_periodos` (117130); a regra do mês ("vale no mês?") é do banco
 * (`fn_pasto_condicoes_da_fazenda` devolve `no_mes`): a tela não a repete. Só INFORMA (D2): área, lotação e o uso do mês seguem o Fechamento.
 * Aqui: os rótulos, as cores (as do mock aprovado), a ordem de força (o pasto com duas pinta pela mais forte e diz "+1"), a leitura da
 * resposta do banco e a legenda com a contagem. Puro.
 */

export type TipoDeCondicao = 'em_reforma' | 'erosao' | 'degradada' | 'em_recuperacao';

/** A ordem de força (a mais forte primeiro): pinta o pasto e abre a lista. */
export const CONDICOES_POR_FORCA: readonly TipoDeCondicao[] = ['em_reforma', 'erosao', 'degradada', 'em_recuperacao'];

/** O rótulo inteiro — o MESMO do banco (`_fn_pasto_condicao_rotulo`); a trava é o teste. */
export const ROTULO_DA_CONDICAO: Record<TipoDeCondicao, string> = {
  degradada: 'Área degradada',
  em_reforma: 'Em reforma',
  em_recuperacao: 'Em recuperação',
  erosao: 'Zona de erosão',
};

/** O rótulo curto (o Segmentado do diálogo e a 2ª linha do rótulo no mapa). */
export const ROTULO_CURTO_DA_CONDICAO: Record<TipoDeCondicao, string> = {
  degradada: 'Degradada',
  em_reforma: 'Em reforma',
  em_recuperacao: 'Em recuperação',
  erosao: 'Erosão',
};

/** A ordem do Segmentado e do menu (a do pedido do Gabriel, não a de força). */
export const CONDICOES_NA_ESCOLHA: readonly TipoDeCondicao[] = ['degradada', 'em_reforma', 'em_recuperacao', 'erosao'];

/** As cores do mock aprovado (layout-20261102-2120-PASTO-CONDICAO-01-mock.html). */
export const COR_DA_CONDICAO: Record<TipoDeCondicao, string> = {
  em_reforma: '#8C7B6B',
  erosao: '#B8483A',
  degradada: '#C08A3E',
  em_recuperacao: '#7FB069',
};
export const COR_SEM_CONDICAO = '#E4E7EB';

export function ehTipoDeCondicao(v: unknown): v is TipoDeCondicao {
  return v === 'degradada' || v === 'em_reforma' || v === 'em_recuperacao' || v === 'erosao';
}

export interface CondicaoDoPasto {
  id: string;
  pastoId: string;
  tipo: TipoDeCondicao;
  rotulo: string;
  /** 'AAAA-MM' */
  mesInicio: string;
  /** 'AAAA-MM'; null = em aberto */
  mesFim: string | null;
  observacao: string | null;
  /** vale no mês pedido ao banco (a regra é dele) */
  noMes: boolean;
  criadoPor: string | null;
  criadoEm: string | null;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
function texto(v: unknown): string | null { return typeof v === 'string' && v !== '' ? v : null; }

/** A resposta do leitor; `null` = resposta inesperada (nunca vira "sem condição"). */
export function lerCondicoes(dado: unknown): CondicaoDoPasto[] | null {
  if (!Array.isArray(dado)) return null;
  const lidas: CondicaoDoPasto[] = [];
  for (const l of dado) {
    if (typeof l !== 'object' || l === null) return null;
    const id = texto(Reflect.get(l, 'id')); const pastoId = texto(Reflect.get(l, 'pasto_id'));
    const tipo = Reflect.get(l, 'tipo'); const ini = texto(Reflect.get(l, 'mes_inicio')); const fim = texto(Reflect.get(l, 'mes_fim'));
    if (!id || !pastoId || !ehTipoDeCondicao(tipo) || !ini || !MES.test(ini) || (fim != null && !MES.test(fim))) return null;
    lidas.push({
      id, pastoId, tipo, rotulo: texto(Reflect.get(l, 'rotulo')) ?? ROTULO_DA_CONDICAO[tipo], mesInicio: ini, mesFim: fim,
      observacao: texto(Reflect.get(l, 'observacao')), noMes: Reflect.get(l, 'no_mes') === true,
      criadoPor: texto(Reflect.get(l, 'criado_por')), criadoEm: texto(Reflect.get(l, 'criado_em')),
    });
  }
  return lidas;
}

/** 'AAAA-MM' → 'MM/AAAA' (o formato das frases do banco). */
export function mesBr(mes: string | null): string {
  return mes && MES.test(mes) ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : '';
}

/** "desde 03/2026 · até 06/2026" · "desde 03/2026 · em aberto". */
export function textoDoPeriodo(c: Pick<CondicaoDoPasto, 'mesInicio' | 'mesFim'>): string {
  return `desde ${mesBr(c.mesInicio)} · ${c.mesFim ? `até ${mesBr(c.mesFim)}` : 'em aberto'}`;
}

/**
 * As condições que valem no mês para um polígono do mapa: as do pasto e (D5) as das DIVISÕES dele — a unidade mostra a condição se
 * qualquer pasto do grupo a tiver. Tipos sem repetir, pela força. `principal` pinta; `outras` = quantas mais ("+1").
 */
export function condicaoNoMes(condicoes: readonly CondicaoDoPasto[], pastoIds: readonly string[]): {
  principal: TipoDeCondicao | null; tipos: TipoDeCondicao[]; outras: number;
} {
  const ids = new Set(pastoIds);
  const vistos = new Set(condicoes.filter(c => c.noMes && ids.has(c.pastoId)).map(c => c.tipo));
  const tipos = CONDICOES_POR_FORCA.filter(t => vistos.has(t));
  return { principal: tipos[0] ?? null, tipos, outras: Math.max(0, tipos.length - 1) };
}

/** A 2ª linha do rótulo do pasto na camada "Condição": "em reforma", "degradada · +1"; sem condição, "sem condição". */
export function rotuloDaCondicaoNoMapa(tipos: readonly TipoDeCondicao[]): { sub: string; titulo: string } {
  if (tipos.length === 0) return { sub: 'sem condição', titulo: 'Sem condição no mês' };
  const sub = `${ROTULO_CURTO_DA_CONDICAO[tipos[0]].toLowerCase()}${tipos.length > 1 ? ` · +${tipos.length - 1}` : ''}`;
  return { sub, titulo: tipos.map(t => ROTULO_DA_CONDICAO[t]).join(' · ') };
}

/** A legenda da camada, com a contagem de pastos por condição no mês (cada pasto conta em todas as que tem). */
export function legendaDaCondicao(contagem: ReadonlyMap<TipoDeCondicao | 'nenhuma', number>): { cor: string; rotulo: string }[] {
  const n = (k: TipoDeCondicao | 'nenhuma') => contagem.get(k) ?? 0;
  return [
    ...CONDICOES_POR_FORCA.map(t => ({ cor: COR_DA_CONDICAO[t], rotulo: `${ROTULO_DA_CONDICAO[t]} (${n(t)})` })),
    { cor: COR_SEM_CONDICAO, rotulo: `Sem condição (${n('nenhuma')})` },
  ];
}

/** Conta por condição os polígonos de pasto (cada um com os seus ids: o pasto e as divisões). */
export function contarCondicoes(condicoes: readonly CondicaoDoPasto[], poligonos: readonly (readonly string[])[]): Map<TipoDeCondicao | 'nenhuma', number> {
  const m = new Map<TipoDeCondicao | 'nenhuma', number>();
  for (const ids of poligonos) {
    const { tipos } = condicaoNoMes(condicoes, ids);
    if (tipos.length === 0) m.set('nenhuma', (m.get('nenhuma') ?? 0) + 1);
    for (const t of tipos) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/** O histórico do painel: a vigente no mês primeiro, depois do mais novo para o mais velho. */
export function historicoDaCondicao(condicoes: readonly CondicaoDoPasto[], pastoIds: readonly string[]): CondicaoDoPasto[] {
  const ids = new Set(pastoIds);
  return condicoes.filter(c => ids.has(c.pastoId))
    .sort((a, b) => Number(b.noMes) - Number(a.noMes) || b.mesInicio.localeCompare(a.mesInicio) || a.tipo.localeCompare(b.tipo));
}

/** A resposta da prévia do `fn_pasto_condicao_marcar`: os que entram e os recusados, com a frase do banco. */
export interface PreviaDaMarcacao { ok: boolean; entram: string[]; recusas: { pastoId: string; motivo: string }[] }

export function lerPreviaDaMarcacao(dado: unknown): PreviaDaMarcacao | null {
  if (typeof dado !== 'object' || dado === null) return null;
  const pastos = Reflect.get(dado, 'pastos'); const recusas = Reflect.get(dado, 'recusas');
  if (!Array.isArray(pastos) || !Array.isArray(recusas)) return null;
  const entram: string[] = [];
  for (const p of pastos) { const id = typeof p === 'object' && p !== null ? texto(Reflect.get(p, 'pasto_id')) : null; if (!id) return null; entram.push(id); }
  const rs: { pastoId: string; motivo: string }[] = [];
  for (const r of recusas) {
    const id = typeof r === 'object' && r !== null ? texto(Reflect.get(r, 'pasto_id')) : null;
    const motivo = typeof r === 'object' && r !== null ? texto(Reflect.get(r, 'motivo')) : null;
    if (!id || !motivo) return null;
    rs.push({ pastoId: id, motivo });
  }
  return { ok: Reflect.get(dado, 'ok') === true && rs.length === 0, entram, recusas: rs };
}

/** O mês 'AAAA-MM' de um ano e mês (1–12). */
export function anoMesDe(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}
