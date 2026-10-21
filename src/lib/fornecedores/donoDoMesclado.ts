/**
 * FORN-01b (Gabriel, 21/10/2026) — no Mesclar, escolher um cadastro JÁ MESCLADO traz o DONO atual dele (o fim da cadeia de
 * `fundido_em_id`), com o aviso "X foi unido em Y; usando Y" — antes a tela aceitava o mesclado e o banco travava ("já foi mesclado em
 * outro fornecedor"). A cadeia pode ter mais de um salto (até 6, como em `cadastroDaCasaBanco`).
 */
import { supabase } from '@/integrations/supabase/client';

export interface CadastroDaCadeia { id: string; nome: string; fundido_em_id: string | null }
export interface Troca { de: string; nomeDe: string; para: string; nomePara: string }

/** O fim da cadeia a partir de `id`, pelos cadastros conhecidos; nulo se a cadeia some ou dá volta. */
export function fimDaCadeia(conhecidos: ReadonlyMap<string, CadastroDaCadeia>, id: string): CadastroDaCadeia | null {
  let x = conhecidos.get(id);
  const vistos = new Set<string>();
  for (let k = 0; x?.fundido_em_id && k < 6; k++) {
    if (vistos.has(x.id)) return null;
    vistos.add(x.id);
    x = conhecidos.get(x.fundido_em_id);
  }
  return x && !x.fundido_em_id ? x : null;
}

export const fraseDaTroca = (t: Troca): string => `${t.nomeDe} foi unido em ${t.nomePara}; usando ${t.nomePara}.`;

/** Troca cada id mesclado pelo dono atual (lido do banco); os outros ficam como vieram. Devolve os ids na mesma ordem, sem repetir. */
export async function trocarMescladosPeloDono(clienteId: string, ids: readonly string[]): Promise<{ ids: string[]; trocas: Troca[] }> {
  const conhecidos = new Map<string, CadastroDaCadeia>();
  let faltam = [...new Set(ids)];
  for (let volta = 0; volta < 7 && faltam.length; volta++) {
    const { data, error } = await supabase.from('financeiro_fornecedores').select('id, nome, fundido_em_id').eq('cliente_id', clienteId).in('id', faltam);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) conhecidos.set(r.id, { id: r.id, nome: r.nome, fundido_em_id: r.fundido_em_id ?? null });
    faltam = [...new Set([...conhecidos.values()].map((r) => r.fundido_em_id).filter((x): x is string => !!x && !conhecidos.has(x)))];
  }
  const saida: string[] = []; const trocas: Troca[] = [];
  for (const id of ids) {
    const c = conhecidos.get(id);
    const dono = c?.fundido_em_id ? fimDaCadeia(conhecidos, id) : null;
    const fica = dono ? dono.id : id;
    if (dono && c) trocas.push({ de: id, nomeDe: c.nome, para: dono.id, nomePara: dono.nome });
    if (!saida.includes(fica)) saida.push(fica);
  }
  return { ids: saida, trocas };
}
