/**
 * VISAO-GERAL-02 — os blocos por ATIVIDADE da Visão Geral vêm das atividades LIGADAS do cliente, da fonte ÚNICA do MAPA-ATIVIDADES-01
 * (Code 6): `fn_cliente_atividades_liberadas(p_cliente)`. Nunca de uma lista fixa.
 * ⚠ CLIENTE SEM ATIVIDADE CADASTRADA (`cadastrado = false`) OU LEITURA QUE FALHOU: os blocos saem das famílias que TÊM área no bloco
 *   "Área no mês" (a regra do Code 6: falhar nunca vira "sem atividade"), com aviso no console.
 * O grupo do bloco é o `grupo_menu` da família (pecuaria | agricultura | silvicultura); família sem grupo (ex.: "outra") não tem bloco.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type GrupoAtividade = 'pecuaria' | 'agricultura' | 'silvicultura';

export interface AtividadeDoCliente { id: string; nome: string; grupo: GrupoAtividade; ordem: number }

export interface AtividadesLidas { cadastrado: boolean; atividades: AtividadeDoCliente[] }

const ehGrupo = (v: unknown): v is GrupoAtividade => v === 'pecuaria' || v === 'agricultura' || v === 'silvicultura';
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Lê a resposta da função (jsonb) sem cast: só as atividades LIGADAS e com grupo de menu, na ordem do cadastro. */
export function lerAtividades(v: unknown): AtividadesLidas {
  if (!ehObjeto(v)) return { cadastrado: false, atividades: [] };
  const lista = Array.isArray(v.atividades) ? v.atividades : [];
  const atividades: AtividadeDoCliente[] = [];
  for (const a of lista) {
    if (!ehObjeto(a) || a.ativo !== true || !ehGrupo(a.grupo_menu)) continue;
    atividades.push({ id: String(a.id ?? ''), nome: String(a.nome ?? ''), grupo: a.grupo_menu, ordem: Number(a.ordem ?? 0) });
  }
  atividades.sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome, 'pt-BR'));
  return { cadastrado: v.cadastrado === true, atividades };
}

const ROTULO_PADRAO: Record<GrupoAtividade, string> = { pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura' };

/** Os blocos da tela: as atividades ligadas; sem cadastro ou com falha, uma por família com área (na ordem pecuária → agricultura →
 *  silvicultura). */
export function blocosDaVisao(lidas: AtividadesLidas | null, gruposComArea: readonly GrupoAtividade[]): AtividadeDoCliente[] {
  if (lidas && lidas.cadastrado) return lidas.atividades;
  const ordem: GrupoAtividade[] = ['pecuaria', 'agricultura', 'silvicultura'];
  return ordem.filter((g) => gruposComArea.includes(g)).map((g, i) => ({ id: `area-${g}`, nome: ROTULO_PADRAO[g], grupo: g, ordem: i }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a função do Code 6 ainda não está no `types.ts` (a exceção do zero-cast, num lugar só)
const semTipo: any = supabase;

export function useAtividadesDoCliente(clienteId: string | null | undefined) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['vg-atividades-do-cliente', clienteId ?? ''],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async (): Promise<AtividadesLidas> => {
      const { data: r, error: e } = await semTipo.rpc('fn_cliente_atividades_liberadas', { p_cliente: clienteId });
      if (e) throw e;
      return lerAtividades(r);
    },
  });
  if (error) console.warn('[Visão Geral] atividades do cliente: a leitura falhou; os blocos saem das famílias com área.', error);
  return { lidas: error ? null : (data ?? null), carregando: isLoading };
}
