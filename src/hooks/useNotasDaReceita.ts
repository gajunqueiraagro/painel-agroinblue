/**
 * NOTAS-RECEITA-A1-01 · F3.4 MÍNIMA — a leitura da lista "Notas da Receita" (só SELECT, pela RLS de hoje: `tenant_ok(cliente_id)`).
 * O XML (pesado) NÃO vem na lista: só quando alguém pede "Lançar" ou "PDF" (`lerXmlDaReceita`).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerLinhasRecebidas, montarLista, type NotaNaLista } from '@/lib/fiscal/notasDaReceita';

export interface DadosDaReceita {
  lista: NotaNaLista[];
  titulares: { id: string; nome: string }[];
  ultimaBusca: string | null;
  proximaBusca: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fiscais novas fora dos tipos gerados
const db = () => supabase as any;

export async function lerNotasDaReceita(clienteId: string): Promise<DadosDaReceita> {
  const [r, t, c] = await Promise.all([
    db().from('fiscal_dfe_recebidos')
      .select('id, titular_id, chave, situacao, emitente_documento, emitente_nome, emissao, valor_cent, nota_id, recebido_em, resumo')
      .eq('cliente_id', clienteId).order('emissao', { ascending: false }).limit(2000),
    db().from('fiscal_titulares').select('id, nome').eq('cliente_id', clienteId),
    db().from('fiscal_dfe_controle').select('ultima_busca_em, nao_antes_de').eq('cliente_id', clienteId),
  ]);
  if (r.error || t.error || c.error) throw new Error('Não consegui ler as notas da Receita.');
  const linhas = lerLinhasRecebidas(r.data);
  const chaves = [...new Set(linhas.map((l) => l.chave))];
  const noSistema = new Set<string>();
  for (let i = 0; i < chaves.length; i += 200) {
    const parte = chaves.slice(i, i + 200);
    const n = await db().from('nota_fiscal').select('chave_acesso').eq('cliente_id', clienteId).in('chave_acesso', parte);
    if (n.error) throw new Error('Não consegui conferir quais notas já estão no sistema.');
    for (const x of n.data ?? []) if (typeof x.chave_acesso === 'string') noSistema.add(x.chave_acesso.replace(/\D/g, ''));
  }
  const titulares = ((t.data ?? []) as { id: string; nome: string | null }[]).map((x) => ({ id: x.id, nome: x.nome ?? '—' }));
  const controle = (c.data ?? []) as { ultima_busca_em: string | null; nao_antes_de: string | null }[];
  const ultimas = controle.map((x) => x.ultima_busca_em).filter((x): x is string => !!x).sort();
  const proximas = controle.map((x) => x.nao_antes_de).filter((x): x is string => !!x).sort();
  return {
    lista: montarLista(linhas, new Map(titulares.map((x) => [x.id, x.nome])), noSistema),
    titulares,
    ultimaBusca: ultimas.at(-1) ?? null,
    proximaBusca: proximas[0] ?? null,
  };
}

export async function lerXmlDaReceita(id: string): Promise<string> {
  const { data, error } = await db().from('fiscal_dfe_recebidos').select('xml').eq('id', id).maybeSingle();
  if (error || !data || typeof data.xml !== 'string' || !data.xml) throw new Error('Esta nota ainda não tem o XML completo.');
  return data.xml;
}

export const chaveDasNotasDaReceita = (clienteId: string | null) => ['notas-da-receita', clienteId];

export function useNotasDaReceita(clienteId: string | null) {
  return useQuery({
    queryKey: chaveDasNotasDaReceita(clienteId),
    queryFn: () => lerNotasDaReceita(clienteId as string),
    enabled: !!clienteId,
    staleTime: 60_000,
  });
}
