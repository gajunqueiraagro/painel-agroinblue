/**
 * MAPA-IMPORT-01a — a regra ÚNICA de vínculo do polígono do mapa (KML/GeoJSON) com o pasto, pelo nome. A prévia do modal e a gravação
 * usam esta função; nenhuma outra cópia.
 * Chave do nome (os dois lados passam por ela):
 *   - acento, cedilha, caixa e espaços: `normalizarParaBusca` (P134);
 *   - o que vem depois de " - " não conta ("P27 - Mombaça" = "P_27");
 *   - separadores _ - . e espaço não contam; "pasto" seguido do número vale "p" ("Pasto 7" = "P7");
 *   - zero à esquerda não conta ("P07" = "P_07" = "P 7" = "p7").
 * Só pastos ATIVOS (da fazenda, quando ela é dada). Mais de um candidato = SEM vínculo (nunca chuta) e os candidatos voltam para a
 * escolha na tela.
 */
import { normalizarParaBusca } from '@/lib/texto/busca';

export interface PastoParaCasar {
  id: string;
  nome: string;
  ativo: boolean;
  fazenda_id?: string | null;
}

export interface CasamentoDoNome {
  /** O pasto, só quando há exatamente um candidato. */
  pastoId: string | null;
  /** Um candidato só. */
  clara: boolean;
  candidatos: { id: string; nome: string }[];
}

export function chaveDoNomeDePasto(nome: string | null | undefined): string {
  let s = normalizarParaBusca(nome);
  const corte = s.search(/ [-–—] /);
  if (corte > 0) s = s.slice(0, corte);
  s = s.replace(/[_\-.\s]+/g, '');
  s = s.replace(/^pasto(?=\d)/, 'p');
  return s.replace(/\d+/g, d => d.replace(/^0+(?=\d)/, ''));
}

export function casarNomePasto(
  nomeDoPoligono: string | null | undefined,
  pastos: readonly PastoParaCasar[],
  fazendaId?: string | null,
): CasamentoDoNome {
  const alvo = chaveDoNomeDePasto(nomeDoPoligono);
  if (!alvo) return { pastoId: null, clara: false, candidatos: [] };
  const candidatos = pastos
    .filter(p => p.ativo && (!fazendaId || p.fazenda_id == null || p.fazenda_id === fazendaId))
    .filter(p => chaveDoNomeDePasto(p.nome) === alvo)
    .map(p => ({ id: p.id, nome: p.nome }));
  const clara = candidatos.length === 1;
  return { pastoId: clara ? candidatos[0].id : null, clara, candidatos };
}
