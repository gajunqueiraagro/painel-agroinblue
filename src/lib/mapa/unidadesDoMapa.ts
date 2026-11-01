/**
 * MAPA-PIQUETES-03 (Gabriel 01/11/2026, regra soberana do MAPA; cadastro na opção A: as divisões continuam PASTOS + grupo) — a UNIDADE do
 * mapa é o pasto-pai e o grupo que nasceu dele (`pasto_grupos.pasto_origem_id`, 20261028117080), como UMA coisa só:
 *  - fase 'pai': nos meses em que o pai é vigente (até o `data_fim` dele) a unidade é o pai, com o fechamento dele;
 *  - fase 'grupo': nos meses dos piquetes, a unidade são os membros vigentes do grupo (Σ dos fechamentos, Σ das áreas);
 *  - nome, rótulo, cor e lotação são os da unidade; o id é o do PAI (o contorno é o polígono do pai, em todos os meses);
 *  - os polígonos dos membros viram DIVISÕES: linhas finas por dentro, sem rótulo nem cor (só a Validação os mostra como hoje).
 * Grupo montado à mão no cadastro (sem `pasto_origem_id`) não vira unidade: os pastos dele seguem um a um, como antes.
 * A área vem por uma função (`areaDe`): este arquivo não lê a área do cadastro (trava PASTO-AREA-OFICIAL-02a).
 */
import { isPastoAtivoNoMes } from '@/hooks/usePastos';
import type { FechamentoLido, ItemLido } from '@/lib/mapa/mapaDoMes';

export interface GrupoComOrigem { id: string; nome: string; pasto_origem_id: string | null; ativo: boolean }

/** O mínimo do pasto que a unidade olha (o `Pasto` do hook encaixa). */
export interface PastoDaUnidade {
  id: string;
  nome: string;
  fazenda_id: string;
  ativo: boolean;
  data_inicio: string | null;
  data_fim?: string | null;
  grupo_id?: string | null;
}

/** O mínimo do polígono (a `FazendaGeometria` encaixa). */
export interface PoligonoDaUnidade { id: string; pasto_id: string | null; tipo: string }

export interface Divisao<G> { pastoId: string; nome: string; areaHa: number; poligono: G | null }

export interface UnidadeDoMapa<P, G> {
  /** = o id do pai (o contorno é o polígono do pai). */
  id: string;
  pai: P;
  fase: 'pai' | 'grupo';
  /** Os pastos cujos fechamentos contam no mês (o pai, ou os membros vigentes). */
  pastoIds: string[];
  /** As divisões do mês (membros vigentes, em ordem natural de nome); vazio na fase 'pai'. */
  divisoes: Divisao<G>[];
  areaHa: number;
}

const vigente = (p: PastoDaUnidade, anoMes: string) => p.ativo && isPastoAtivoNoMes(p, anoMes);
const ordemNatural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

export interface ResultadoDasUnidades<P, G> {
  /** Os pastos que o mapa usa: os soltos como estão + UM por unidade vigente (o pai sem vigência própria — a da unidade); sem os membros. */
  pastos: P[];
  /** Os polígonos que o mapa desenha como pasto/área (sem os dos membros: esses viram divisões). */
  poligonos: G[];
  unidades: Map<string, UnidadeDoMapa<P, G>>;
  /** pasto (pai ou membro) → id da unidade: os fechamentos de todos contam na unidade. */
  unidadeDe: Map<string, string>;
}

export function unidadesDoMapa<P extends PastoDaUnidade, G extends PoligonoDaUnidade>(e: {
  pastos: readonly P[];
  grupos: readonly GrupoComOrigem[];
  poligonos: readonly G[];
  anoMes: string;
  areaDe: (p: P) => number;
}): ResultadoDasUnidades<P, G> {
  const porId = new Map(e.pastos.map((p) => [p.id, p]));
  const poligonoDe = new Map<string, G>();
  for (const g of e.poligonos) if (g.pasto_id) poligonoDe.set(g.pasto_id, g);

  const unidades = new Map<string, UnidadeDoMapa<P, G>>();
  const unidadeDe = new Map<string, string>();
  const membrosDeUnidade = new Set<string>();
  for (const gr of e.grupos) {
    const pai = gr.pasto_origem_id ? porId.get(gr.pasto_origem_id) : undefined;
    if (!pai) continue;
    const membros = e.pastos.filter((p) => p.grupo_id === gr.id && p.id !== pai.id);
    for (const m of membros) { membrosDeUnidade.add(m.id); unidadeDe.set(m.id, pai.id); }
    unidadeDe.set(pai.id, pai.id);
    const membrosNoMes = membros.filter((m) => vigente(m, e.anoMes)).sort((a, b) => ordemNatural(a.nome, b.nome));
    if (vigente(pai, e.anoMes)) {
      unidades.set(pai.id, { id: pai.id, pai, fase: 'pai', pastoIds: [pai.id], divisoes: [], areaHa: e.areaDe(pai) });
    } else if (membrosNoMes.length > 0) {
      const divisoes = membrosNoMes.map((m) => ({ pastoId: m.id, nome: m.nome, areaHa: e.areaDe(m), poligono: poligonoDe.get(m.id) ?? null }));
      unidades.set(pai.id, {
        id: pai.id, pai, fase: 'grupo', pastoIds: membrosNoMes.map((m) => m.id), divisoes,
        areaHa: Math.round(divisoes.reduce((s, d) => s + d.areaHa, 0) * 100) / 100,
      });
    }
  }

  const pastos: P[] = [];
  for (const p of e.pastos) {
    if (membrosDeUnidade.has(p.id)) continue;
    const u = unidades.get(p.id);
    // a unidade vigente leva o pai SEM a vigência própria (na fase 'grupo' o pai já encerrou; quem diz se a unidade existe no mês é ela)
    pastos.push(u ? { ...p, data_inicio: null, data_fim: null } : p);
  }
  const poligonos = e.poligonos.filter((g) => !(g.pasto_id && membrosDeUnidade.has(g.pasto_id)));
  return { pastos, poligonos, unidades, unidadeDe };
}

/**
 * Os fechamentos do mês vistos pela UNIDADE: o do pai e os dos membros passam a ser da unidade; os do mesmo mês viram UM (os itens
 * somam). Status: 'fechado' só se todos estão fechados; senão o primeiro que não está. Atividade: a do primeiro que não é vedado (todos
 * vedados = 'vedado'). Pasto fora de unidade: como estava.
 */
export function fechamentosDaUnidade(fechamentos: readonly FechamentoLido[], itens: readonly ItemLido[], unidadeDe: ReadonlyMap<string, string>):
  { fechamentos: FechamentoLido[]; itens: ItemLido[] } {
  if (unidadeDe.size === 0) return { fechamentos: [...fechamentos], itens: [...itens] };
  const soltos: FechamentoLido[] = [];
  const juntos = new Map<string, FechamentoLido[]>();
  for (const f of fechamentos) {
    const u = unidadeDe.get(f.pasto_id);
    if (!u) { soltos.push(f); continue; }
    const k = `${u}|${f.ano_mes}`;
    juntos.set(k, [...(juntos.get(k) ?? []), f]);
  }
  const novoId = new Map<string, string>();
  const unidos: FechamentoLido[] = [];
  for (const [k, lista] of juntos) {
    const [u, mes] = k.split('|');
    const id = lista.length === 1 ? lista[0].id : `unidade:${k}`;
    for (const f of lista) novoId.set(f.id, id);
    const naoFechado = lista.find((f) => f.status !== 'fechado');
    const naoVedado = lista.find((f) => f.tipo_uso_mes !== 'vedado');
    unidos.push({ id, pasto_id: u, ano_mes: mes, status: naoFechado ? naoFechado.status : 'fechado',
      tipo_uso_mes: naoVedado ? naoVedado.tipo_uso_mes : 'vedado' });
  }
  return {
    fechamentos: [...soltos, ...unidos],
    itens: itens.map((i) => { const n = novoId.get(i.fechamento_id); return n && n !== i.fechamento_id ? { ...i, fechamento_id: n } : i; }),
  };
}

/** O que a frase olha numa divisão. `poligono: null` = a divisão ainda sem desenho (caso P6: o contorno é do pai, 6A e 6B sem polígono). */
export interface DivisaoNaFrase { nome: string; areaHa: number; poligono?: unknown }
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const semDesenho = (divisoes: readonly DivisaoNaFrase[]) => divisoes.filter((d) => d.poligono === null).map((d) => d.nome);

/**
 * A linha do painel (1 casa; vazio = sem divisões no mês):
 *  - todas desenhadas: "4 divisões: 7A 24,8 · 7B 25,1 · 7C 24,4 · 7D 23,3 = 97,5 ha";
 *  - nenhuma desenhada (o mapa mostra só o contorno do pai): "2 divisões sem desenho: 6A, 6B";
 *  - parte desenhada: a frase inteira + " · sem desenho: 7C".
 */
export function fraseDasDivisoes(divisoes: readonly DivisaoNaFrase[]): string {
  if (divisoes.length === 0) return '';
  const faltam = semDesenho(divisoes);
  const plural = divisoes.length === 1 ? 'divisão' : 'divisões';
  if (faltam.length === divisoes.length) return `${divisoes.length} ${plural} sem desenho: ${faltam.join(', ')}`;
  const soma = divisoes.reduce((s, d) => s + d.areaHa, 0);
  const inteira = `${divisoes.length} ${plural}: ${divisoes.map((d) => `${d.nome} ${n1(d.areaHa)}`).join(' · ')} = ${n1(soma)} ha`;
  return faltam.length > 0 ? `${inteira} · sem desenho: ${faltam.join(', ')}` : inteira;
}

/**
 * O painel tem 2 linhas para a frase (fora de tabela, nunca "…"): longa demais vira "12 divisões = 450,3 ha" (+ " · 3 sem desenho", ou
 * "12 divisões sem desenho" quando nenhuma tem) e a lista inteira vai ao `title`.
 */
export function divisoesNoPainel(divisoes: readonly DivisaoNaFrase[], maxCaracteres = 84): { texto: string; title: string } {
  const inteira = fraseDasDivisoes(divisoes);
  if (inteira.length <= maxCaracteres) return { texto: inteira, title: inteira };
  const faltam = semDesenho(divisoes).length;
  if (faltam === divisoes.length) return { texto: `${divisoes.length} divisões sem desenho`, title: inteira };
  const soma = n1(divisoes.reduce((s, d) => s + d.areaHa, 0));
  return { texto: `${divisoes.length} divisões = ${soma} ha${faltam > 0 ? ` · ${faltam} sem desenho` : ''}`, title: inteira };
}
