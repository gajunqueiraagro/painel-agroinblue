/**
 * L3 (Gabriel 09/11 07:51, Raul · Monterrey · set/26) — a lotação de um lote em 2+ pastos (rotação "Também esteve em") é a MESMA regra do
 * pasto com piquetes: as UA do lote ÷ a SOMA das áreas, a mesma em cada pasto, e as cabeças contam UMA vez (ficam no card de quem lançou).
 * A conta é do banco (`fn_lotacao_do_mes`: cada pasto recebe a parte do lote pela área dele, então UA/ha = UA do lote ÷ soma das áreas);
 * a tela só lê. Sem alocação (ou sem a leitura do banco), vale a conta do próprio card.
 */
import type { AlocacaoDoMes, LotacaoDoPasto } from '@/lib/fechamento/loteNoGrupo';

/** a UA/ha do pasto no mês: a do banco quando ele tem UA no mês; senão, a do próprio card */
export function uaHaDoMes(lotacao: LotacaoDoPasto | undefined, uaHaDoCard: number | null): number | null {
  return lotacao?.uaHa != null && lotacao.ua > 0 ? lotacao.uaHa : uaHaDoCard;
}

/** os outros pastos com quem cada pasto divide um lote no mês (o pasto do card + os alocados do mesmo lote) */
export function companheirosDoLote(alocacoes: readonly AlocacaoDoMes[], pastoDoCard: ReadonlyMap<string, string>): Map<string, string[]> {
  const porLote = new Map<string, Set<string>>();
  for (const a of alocacoes) {
    const chave = `${a.fechamentoId}|${a.lote}`;
    const s = porLote.get(chave) ?? new Set<string>();
    const doCard = pastoDoCard.get(a.fechamentoId);
    if (doCard) s.add(doCard);
    s.add(a.pastoId);
    porLote.set(chave, s);
  }
  const mapa = new Map<string, string[]>();
  for (const s of porLote.values()) {
    if (s.size < 2) continue;
    for (const id of s) {
      const atuais = mapa.get(id) ?? [];
      for (const outro of s) if (outro !== id && !atuais.includes(outro)) atuais.push(outro);
      mapa.set(id, atuais);
    }
  }
  return mapa;
}
