import { pastosAtivosNoMes } from '@/hooks/usePastos';
import { isPastoDivergencia } from '@/lib/classificacaoArea';

/**
 * FECH-GLOBAL-RESUMO-01 (Gabriel, 12/10/2026) — o Fechamento Área em "Global": uma linha por fazenda e o caminho para os pastos.
 *
 * ⚠ NENHUMA REGRA NOVA. Cada número é o que a tela POR FAZENDA (`FechamentoTab`) mostra, pelo mesmo critério:
 *   · pastos do mês = `pastosAtivosNoMes(pastos, anoMes)` (o dono da vigência); a contagem e a área deixam o pseudo-pasto de
 *     divergência de fora (não é pasto), o STATUS o inclui — como o `pastosAtivos` de lá;
 *   · mês FECHADO = todo pasto do mês tem card com status 'fechado' e há ao menos um pasto (o `allClosed` do selo "Mês fechado");
 *     "a fechar" = pastos do mês sem card fechado (o `pendentesCount` do "Fechar N pasto(s)");
 *   · cabeças = soma dos itens dos cards dos pastos do mês (a linha "Pasto" da conciliação, `reconciliacaoFechIds`).
 *   ESPELHO DECLARADO: quem mexer num critério de lá confere este arquivo.
 * ⚠ SEM FONTE, "—": campo que não tem dono único fica nulo aqui e a tela escreve "—"; nunca zero inventado.
 */

export interface FazendaDoResumo { id: string; nome: string; tem_pecuaria?: boolean; status_operacional?: string | null }
export interface PastoDoResumo {
  id: string; fazenda_id: string; ativo: boolean; tipo_uso: string; area_produtiva_ha: number | null;
  data_inicio?: string | null; data_fim?: string | null;
}
export interface CardDoResumo { id: string; fazenda_id: string; pasto_id: string; ano_mes: string; status: string }

export type SituacaoDoMes = 'fechado' | 'aberto' | 'sem_pastos';
export type StatusNaFita = 'fechado' | 'rascunho' | 'vazio';

export interface LinhaDoResumoGlobal {
  fazendaId: string;
  nome: string;
  /** Só o que o cadastro diz (`tem_pecuaria`); sem a marca, nulo ("—"). */
  atividade: string | null;
  pastos: number;
  areaHa: number;
  mes: { situacao: SituacaoDoMes; aFechar: number };
  /** O mês fechado mais recente da janela lida, e os cards dos pastos daquele mês (para somar as cabeças). Nulo = nenhum. */
  ultimo: { anoMes: string; cardIds: string[] } | null;
}

export interface ResumoGlobal {
  linhas: LinhaDoResumoGlobal[];
  /** Pela fita: 1..12 do ano pedido. */
  statusPorMes: Record<number, StatusNaFita>;
  fechamentoDoMes: { fechadas: number; comPastos: number };
  totais: { pastos: number; areaHa: number };
}

export const ehFazendaAtiva = (f: FazendaDoResumo): boolean => f.status_operacional !== 'inativa';

function agrupar<T>(itens: readonly T[], chave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of itens) {
    const k = chave(i);
    const l = m.get(k);
    if (l) l.push(i); else m.set(k, [i]);
  }
  return m;
}

/** O mês de UMA fazenda, pelo critério da tela por fazenda. `cardsDoMes` = os cards daquela fazenda naquele mês. */
export function mesDaFazenda(pastosDaFazenda: readonly PastoDoResumo[], cardsDoMes: readonly CardDoResumo[], anoMes: string) {
  const doMes = pastosAtivosNoMes([...pastosDaFazenda], anoMes);
  /* `getFechamento` de lá: o PRIMEIRO card do pasto no mês. */
  const cardDoPasto = new Map<string, CardDoResumo>();
  for (const c of cardsDoMes) if (!cardDoPasto.has(c.pasto_id)) cardDoPasto.set(c.pasto_id, c);
  let fechados = 0;
  const cardIds: string[] = [];
  for (const p of doMes) {
    const c = cardDoPasto.get(p.id);
    if (c) cardIds.push(c.id);
    if (c?.status === 'fechado') fechados++;
  }
  const situacao: SituacaoDoMes = doMes.length === 0 ? 'sem_pastos' : fechados === doMes.length ? 'fechado' : 'aberto';
  return { doMes, situacao, aFechar: doMes.length - fechados, cardIds, temCard: cardIds.length > 0 };
}

const mesesDaJanela = (ano: number): string[] => {
  const l: string[] = [];
  for (const a of [ano - 1, ano]) for (let m = 1; m <= 12; m++) l.push(`${a}-${String(m).padStart(2, '0')}`);
  return l;
};

export function montarResumoGlobal(entrada: {
  fazendas: readonly FazendaDoResumo[];
  pastos: readonly PastoDoResumo[];
  /** Cards de `${ano - 1}-01` a `${ano}-12` das fazendas da lista. */
  cards: readonly CardDoResumo[];
  ano: number;
  mes: number;
}): ResumoGlobal {
  const { ano, mes } = entrada;
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const ativas = entrada.fazendas.filter(f => f.id !== '__global__' && ehFazendaAtiva(f));
  const pastosPorFazenda = agrupar(entrada.pastos, p => p.fazenda_id);
  const cardsPorFazendaMes = agrupar(entrada.cards, c => `${c.fazenda_id}|${c.ano_mes}`);
  const janela = mesesDaJanela(ano);

  const linhas: LinhaDoResumoGlobal[] = ativas.map(f => {
    const ps = pastosPorFazenda.get(f.id) ?? [];
    const doMes = mesDaFazenda(ps, cardsPorFazendaMes.get(`${f.id}|${anoMes}`) ?? [], anoMes);
    const reais = doMes.doMes.filter(p => !isPastoDivergencia(p.tipo_uso));
    let areaHa = 0;
    for (const p of reais) areaHa += Number(p.area_produtiva_ha) || 0;
    let ultimo: LinhaDoResumoGlobal['ultimo'] = null;
    for (let i = janela.length - 1; i >= 0 && !ultimo; i--) {
      const m = mesDaFazenda(ps, cardsPorFazendaMes.get(`${f.id}|${janela[i]}`) ?? [], janela[i]);
      if (m.situacao === 'fechado') ultimo = { anoMes: janela[i], cardIds: m.cardIds };
    }
    return {
      fazendaId: f.id, nome: f.nome, atividade: f.tem_pecuaria === true ? 'Pecuária' : null,
      pastos: reais.length, areaHa, mes: { situacao: doMes.situacao, aFechar: doMes.aFechar }, ultimo,
    };
  });

  /* Abertas no mês primeiro; depois, o nome. */
  linhas.sort((a, b) => {
    const ab = a.mes.situacao === 'aberto' ? 0 : 1;
    const bb = b.mes.situacao === 'aberto' ? 0 : 1;
    return ab - bb || a.nome.localeCompare(b.nome, 'pt-BR');
  });

  /* A fita: verde = toda fazenda com pastos no mês está fechada; âmbar = alguma aberta e já há card no mês; senão, neutro. */
  const statusPorMes: Record<number, StatusNaFita> = {};
  for (let m = 1; m <= 12; m++) {
    const am = `${ano}-${String(m).padStart(2, '0')}`;
    let comPastos = 0, fechadas = 0, comCard = 0;
    for (const f of ativas) {
      const r = mesDaFazenda(pastosPorFazenda.get(f.id) ?? [], cardsPorFazendaMes.get(`${f.id}|${am}`) ?? [], am);
      if (r.situacao === 'sem_pastos') continue;
      comPastos++;
      if (r.situacao === 'fechado') fechadas++;
      if (r.temCard) comCard++;
    }
    statusPorMes[m] = comPastos > 0 && fechadas === comPastos ? 'fechado' : comCard > 0 ? 'rascunho' : 'vazio';
  }

  let pastos = 0, areaHa = 0, fechadas = 0, comPastos = 0;
  for (const l of linhas) {
    pastos += l.pastos; areaHa += l.areaHa;
    if (l.mes.situacao !== 'sem_pastos') comPastos++;
    if (l.mes.situacao === 'fechado') fechadas++;
  }
  return { linhas, statusPorMes, fechamentoDoMes: { fechadas, comPastos }, totais: { pastos, areaHa } };
}

/** As cabeças do último fechamento de cada fazenda: soma dos itens dos cards contados. Fazenda sem leitura fica fora do mapa. */
export function cabecasPorFazenda(
  linhas: readonly LinhaDoResumoGlobal[], itens: readonly { fechamento_id: string; quantidade: number }[],
): Map<string, number> {
  const porCard = new Map<string, number>();
  for (const i of itens) porCard.set(i.fechamento_id, (porCard.get(i.fechamento_id) ?? 0) + (Number(i.quantidade) || 0));
  const m = new Map<string, number>();
  for (const l of linhas) {
    if (!l.ultimo) continue;
    let soma = 0;
    for (const id of l.ultimo.cardIds) soma += porCard.get(id) ?? 0;
    m.set(l.fazendaId, soma);
  }
  return m;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
/** '2026-09' -> 'set/26' */
export function mesCurto(anoMes: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(anoMes);
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1].slice(2)}` : anoMes;
}

/**
 * O total do rebanho no resumo: a soma das cabeças do último fechamento de cada fazenda QUE TEM um.
 * `total` nulo = há fazenda com último fechamento cuja leitura não chegou (nunca soma parcial calada).
 * `mes` = o mês quando todas fecharam no MESMO mês; nulo quando os meses diferem (a tela diz "meses diferentes").
 */
export function totalDoRebanho(linhas: readonly LinhaDoResumoGlobal[], cabecas: ReadonlyMap<string, number>) {
  const comUltimo = linhas.filter(l => l.ultimo);
  if (comUltimo.length === 0) return { total: null, mes: null, fazendas: 0, mesesDiferentes: false };
  let total = 0;
  let completo = true;
  const meses = new Set<string>();
  for (const l of comUltimo) {
    meses.add(l.ultimo?.anoMes ?? '');
    const v = cabecas.get(l.fazendaId);
    if (v === undefined) completo = false; else total += v;
  }
  return {
    total: completo ? total : null,
    mes: meses.size === 1 ? [...meses][0] : null,
    fazendas: comUltimo.length,
    mesesDiferentes: meses.size > 1,
  };
}
