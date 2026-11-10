/**
 * MAPA-REBANHO-R2 (Gabriel 08/11 19:18, regra soberana FECH-PASTO-UNIDADE-01) — as linhas do Mapa do rebanho:
 *   · o PASTO é a linha: os pastos do mês pela MESMA regra dos cards do Fechamento (`pastosDoFechamentoNoMes`); piquete nunca é linha solta;
 *   · o piquete só aparece como SUB-LINHA recuada sob o pai, quando o card do pai foi lançado por piquetes (`modoDasLinhas`), e o pai SOMA
 *     todas as linhas do card (antes a grade guardava uma linha por categoria e o card por piquetes perdia as outras);
 *   · a ordem é a do pai (as sub-linhas vêm logo abaixo dele, em ordem natural: 7A, 7B… 10A).
 * Tela, PDF e Excel usam as MESMAS linhas; os totais e o resumo contam só os pastos (`piqueteDe` nulo).
 */
import { SEM_PIQUETE } from '@/lib/fechamento/porPiquetes';

export interface ItemDoMapa {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  peso_atualizado: boolean;
  piquete_id?: string | null;
}

export interface CategoriaNoMapa { quantidade: number; peso_medio_kg: number | null; peso_atualizado: boolean }

/** por categoria: as cabeças de TODAS as linhas somadas; o peso médio ponderado pelas linhas com peso; "peso atualizado" só se todas as
 *  linhas com cabeça estão atualizadas */
export function categoriasDasLinhas(itens: readonly ItemDoMapa[]): Map<string, CategoriaNoMapa> {
  const soma = new Map<string, { q: number; qp: number; kg: number; atual: boolean }>();
  for (const i of itens) {
    const s = soma.get(i.categoria_id) ?? { q: 0, qp: 0, kg: 0, atual: true };
    s.q += i.quantidade;
    if ((i.peso_medio_kg ?? 0) > 0 && i.quantidade > 0) { s.qp += i.quantidade; s.kg += i.quantidade * (i.peso_medio_kg ?? 0); }
    if (i.quantidade > 0 && !i.peso_atualizado) s.atual = false;
    soma.set(i.categoria_id, s);
  }
  const out = new Map<string, CategoriaNoMapa>();
  for (const [cat, s] of soma) out.set(cat, { quantidade: s.q, peso_medio_kg: s.qp > 0 ? Math.round((s.kg / s.qp) * 100) / 100 : null, peso_atualizado: s.atual });
  return out;
}

export interface SubLinhaDoPiquete<T extends ItemDoMapa> {
  /** o id do piquete; `SEM_PIQUETE` = as linhas sem piquete de um card que também tem piquete */
  piqueteId: string;
  nome: string;
  itens: T[];
}

const ordemNatural = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });

/** as sub-linhas do card: nenhuma se o card é do pasto inteiro; por piquetes, uma por piquete com linha (e "Sem piquete" se sobrar cabeça
 *  sem piquete), em ordem natural */
export function subLinhasPorPiquete<T extends ItemDoMapa>(itens: readonly T[], nomeDoPiquete: (id: string) => string | null): SubLinhaDoPiquete<T>[] {
  /* o critério do `modoDasLinhas` (porPiquetes.ts): o card foi lançado por piquetes se ALGUMA linha tem piquete */
  if (!itens.some(i => !!i.piquete_id)) return [];
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    const k = i.piquete_id || SEM_PIQUETE;
    if (k === SEM_PIQUETE && i.quantidade <= 0) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const comNome = [...grupos].filter(([k]) => k !== SEM_PIQUETE).map(([k, l]) => ({ piqueteId: k, nome: nomeDoPiquete(k) ?? '—', itens: l })).sort(ordemNatural);
  const sem = grupos.get(SEM_PIQUETE);
  return sem ? [...comNome, { piqueteId: SEM_PIQUETE, nome: 'Sem piquete', itens: sem }] : comNome;
}

/** o nome no PDF e no Excel: a sub-linha vem recuada com "·" (a fonte do PDF tem o ponto médio) */
export function nomeNaSaida(nome: string, ehPiquete: boolean): string {
  return ehPiquete ? `   · ${nome}` : nome;
}
