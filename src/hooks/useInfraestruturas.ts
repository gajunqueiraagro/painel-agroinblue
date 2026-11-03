/**
 * MAPA-02f-b — a infraestrutura da fazenda (os ATIVOS de `fazenda_infraestruturas`) e os bens do Patrimônio da fazenda (para ligar).
 * Leitura direta (RLS tenant_ok); escrita SÓ pelas funções do banco: `fn_infra_salvar` (prévia por padrão) e `fn_infra_desativar`.
 * A recusa do banco vem pronta (P0001); 42501 pela `fraseDo42501` (a causa real, nunca escondida) e edição simultânea (40001) vira frase da casa; nunca toast.
 * ⚠ `(supabase as any)`: as tabelas e funções da 02f-a ainda não estão no types.ts (a exceção da regra, até regenerar).
 * ⚠ Leitura que chega depois de a fazenda mudar não escreve (OC-ABRIR-LENTO-01).
 * INFRA-FICHAS-PATR-01: lê a `ficha` e cria o bem do Patrimônio pela `fn_infra_criar_bem` (cria e liga numa transação; prévia por padrão).
 * ⚠ ORDEM: a coluna `ficha` e a função nascem na migration 20261028117100 — esta tela só vai ao ar DEPOIS dela aplicada.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { argumentoDaInfra, type CamposDaInfra, type InfraLida } from '@/lib/mapa/infraestrutura';
import { lerFicha } from '@/lib/mapa/fichasDaInfra';
import { fraseDo42501 } from '@/lib/mapa/fraseDaPermissao';

export interface BemDaFazenda { id: string; codigo: string | null; descricao: string; situacao: string; categoria: string | null }
export interface Resposta { ok: boolean; dado: unknown; motivo: string | null }

function frase(error: { code?: string; message?: string }): string {
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code === '42501') return fraseDo42501(error.message);
  if (error.code === '40001') return 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
  return 'Não consegui gravar agora. Tente de novo.';
}

function lerBens(dado: unknown): BemDaFazenda[] {
  if (!Array.isArray(dado)) return [];
  return dado.flatMap(l => {
    if (typeof l !== 'object' || l === null) return [];
    const id = Reflect.get(l, 'id'); const descricao = Reflect.get(l, 'descricao');
    if (typeof id !== 'string' || typeof descricao !== 'string') return [];
    const codigo = Reflect.get(l, 'codigo'); const situacao = Reflect.get(l, 'situacao'); const cat = Reflect.get(l, 'categoria');
    const categoria = typeof cat === 'object' && cat !== null ? Reflect.get(cat, 'codigo') : null;
    return [{ id, descricao, codigo: typeof codigo === 'string' ? codigo : null, situacao: typeof situacao === 'string' ? situacao : '',
      categoria: typeof categoria === 'string' ? categoria : null }];
  });
}

function lerInfras(dado: unknown): InfraLida[] {
  if (!Array.isArray(dado)) return [];
  return dado.flatMap(l => {
    if (typeof l !== 'object' || l === null) return [];
    const id = Reflect.get(l, 'id'); const tipo = Reflect.get(l, 'tipo'); const fazenda = Reflect.get(l, 'fazenda_id');
    if (typeof id !== 'string' || typeof tipo !== 'string' || typeof fazenda !== 'string') return [];
    const s = (k: string) => { const v = Reflect.get(l, k); return typeof v === 'string' ? v : null; };
    const versao = Reflect.get(l, 'versao');
    return [{ id, tipo, fazenda_id: fazenda, geometria: Reflect.get(l, 'geometria'), nome: s('nome'), pasto_id: s('pasto_id'), bem_id: s('bem_id'),
      observacao: s('observacao'), ficha: lerFicha(Reflect.get(l, 'ficha')), geometria_id: s('geometria_id'), versao: typeof versao === 'number' ? versao : 1, criado_em: s('criado_em') ?? '', criado_por: s('criado_por') }];
  });
}

export function useInfraestruturas(fazendaId: string | undefined) {
  const [lidas, setLidas] = useState<{ fazendaId: string; infras: InfraLida[]; bens: BemDaFazenda[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    if (!fazendaId) return;
    let vivo = true;
    setErro(null);
    (async () => {
      /* MAPA-AREA-TIPOS-02: a leitura que lança (rede, cliente sem a tabela) vira `erro`, nunca rejeição solta */
      try {
      const [i, b] = await Promise.all([
        (supabase as any).from('fazenda_infraestruturas')
          .select('id, fazenda_id, tipo, geometria, nome, pasto_id, bem_id, observacao, ficha, geometria_id, versao, criado_em, criado_por')
          .eq('fazenda_id', fazendaId).eq('ativo', true).order('criado_em', { ascending: true }),
        (supabase as any).from('patrimonio_bens')
          .select('id, codigo, descricao, situacao, categoria:patrimonio_categorias(codigo)')
          .eq('fazenda_id', fazendaId).order('descricao', { ascending: true }),
      ]);
      if (!vivo) return;
      if (i.error || b.error) {
        console.error('[useInfraestruturas]', i.error ?? b.error);
        setErro('Não foi possível ler a infraestrutura da fazenda.');
        return;
      }
      setLidas({ fazendaId, infras: lerInfras(i.data), bens: lerBens(b.data) });
      } catch (e) {
        if (!vivo) return;
        console.error('[useInfraestruturas]', e);
        setErro('Não foi possível ler a infraestrutura da fazenda.');
      }
    })();
    return () => { vivo = false; };
  }, [fazendaId, rodada]);

  const recarregar = useCallback(() => setRodada(r => r + 1), []);

  const salvar = useCallback(async (campos: CamposDaInfra, simular: boolean, motivo?: string): Promise<Resposta> => {
    const { data, error } = await (supabase as any).rpc('fn_infra_salvar', { p_infra: argumentoDaInfra(campos), p_simular: simular, p_motivo: motivo?.trim() || null });
    if (error) { if (error.code !== 'P0001') console.error('[useInfraestruturas] salvar', error); return { ok: false, dado: null, motivo: frase(error) }; }
    return { ok: true, dado: data, motivo: null };
  }, []);

  const desativar = useCallback(async (id: string, motivo: string, simular: boolean): Promise<Resposta> => {
    const { data, error } = await (supabase as any).rpc('fn_infra_desativar', { p_id: id, p_motivo: motivo, p_simular: simular });
    if (error) { if (error.code !== 'P0001') console.error('[useInfraestruturas] desativar', error); return { ok: false, dado: null, motivo: frase(error) }; }
    return { ok: true, dado: data, motivo: null };
  }, []);

  /** INFRA-FICHAS-PATR-01: cria o bem do Patrimônio a partir da infraestrutura e liga (o `p_bem` leva `categoria_codigo`) */
  const criarBem = useCallback(async (infraId: string, versao: number, bem: Record<string, unknown>, simular: boolean): Promise<Resposta> => {
    const { data, error } = await (supabase as any).rpc('fn_infra_criar_bem', { p_infra_id: infraId, p_versao: versao, p_bem: bem, p_simular: simular });
    if (error) { if (error.code !== 'P0001') console.error('[useInfraestruturas] criar bem', error); return { ok: false, dado: null, motivo: frase(error) }; }
    return { ok: true, dado: data, motivo: null };
  }, []);

  /** MAPA-AREA-TIPOS-02: a estrutura com valor de uma ÁREA do mapa vira infraestrutura (`fn_mapa_estrutura_da_area`; prévia por padrão) */
  const estruturaDaArea = useCallback(async (geometriaId: string, simular: boolean): Promise<Resposta> => {
    const { data, error } = await (supabase as any).rpc('fn_mapa_estrutura_da_area', { p_geometria: geometriaId, p_simular: simular });
    if (error) { if (error.code !== 'P0001') console.error('[useInfraestruturas] estrutura da área', error); return { ok: false, dado: null, motivo: frase(error) }; }
    return { ok: true, dado: data, motivo: null };
  }, []);

  const atual = lidas && lidas.fazendaId === fazendaId ? lidas : null;
  return { infras: atual?.infras ?? [], bens: atual?.bens ?? [], erro, recarregar, salvar, desativar, criarBem, estruturaDaArea };
}
