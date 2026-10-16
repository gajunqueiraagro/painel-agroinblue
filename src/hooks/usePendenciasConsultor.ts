/**
 * RESUMO-CLIENTES-01 passo a — ler e gravar as pendências do consultor. A tabela é só do admin (RLS): para quem não é, a leitura volta
 * vazia e a gravação é recusada pelo banco. Um aviso em módulo faz o ⚑ e o painel relerem depois de qualquer gesto, sem F5.
 * ⚠ `(supabase as any).from`: a tabela nasceu depois do `types.ts` (regenerar tira o cast).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerPendencia, type CanalCobranca, type NovaPendencia, type Pendencia } from '@/lib/consultor/pendencias';

const ouvintes = new Set<() => void>();
export const avisarPendenciasMudaram = () => ouvintes.forEach(f => f());

export interface FontePendencias {
  listar: (clienteId: string | null) => Promise<{ ok: true; lista: Pendencia[] } | { ok: false; frase: string }>;
  criar: (n: NovaPendencia) => Promise<string | null>;
  cobrar: (id: string, canal: CanalCobranca) => Promise<string | null>;
  resolver: (id: string) => Promise<string | null>;
}

const tabela = () => (supabase as any).from('consultor_pendencias');
const frase = (e: unknown) => (typeof e === 'object' && e !== null && typeof Reflect.get(e, 'message') === 'string' ? String(Reflect.get(e, 'message')) : 'Não foi possível gravar.');

export const fonteDoBanco: FontePendencias = {
  listar: async (clienteId) => {
    let q = tabela().select('*').order('prazo', { ascending: true, nullsFirst: false }).limit(500);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    const { data, error } = await q;
    if (error) return { ok: false, frase: `Não foi possível ler as pendências. (${frase(error)})` };
    const linhas: unknown[] = Array.isArray(data) ? data : [];
    return { ok: true, lista: linhas.map(lerPendencia).filter((p): p is Pendencia => p !== null) };
  },
  criar: async (n) => {
    const { error } = await tabela().insert({
      cliente_id: n.clienteId, prazo: n.prazo, cobrar_de: n.cobrarDe.trim(), o_que: n.oQue.trim(),
      origem_tipo: n.origemTipo, origem_ref: n.origemTipo ? n.origemRef?.trim() || null : null,
    });
    return error ? frase(error) : null;
  },
  cobrar: async (id, canal) => {
    const { error } = await tabela().update({ status: 'cobrada', ultima_cobranca_em: hojeLocal(), ultima_cobranca_canal: canal }).eq('id', id);
    return error ? frase(error) : null;
  },
  resolver: async (id) => {
    const { error } = await tabela().update({ status: 'resolvida', resolvida_em: new Date().toISOString() }).eq('id', id);
    return error ? frase(error) : null;
  },
};

/** As pendências de um cliente (ou de todos, com `null`). `ativo` falso = não lê (quem não é admin, ou modal fechado). */
export function usePendenciasConsultor(clienteId: string | null, ativo: boolean, fonte: FontePendencias = fonteDoBanco) {
  const [lista, setLista] = useState<Pendencia[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const ler = useCallback(async () => {
    if (!ativo) { setLista([]); return; }
    setLendo(true);
    const r = await fonte.listar(clienteId);
    setLendo(false);
    if (r.ok === false) { setErro(r.frase); return; }
    setErro(null); setLista(r.lista);
  }, [ativo, clienteId, fonte]);
  useEffect(() => {
    void ler();
    ouvintes.add(ler);
    return () => { ouvintes.delete(ler); };
  }, [ler]);
  const gesto = (f: () => Promise<string | null>) => async () => {
    const e = await f();
    if (!e) avisarPendenciasMudaram();
    return e;
  };
  return {
    lista, erro, lendo, reler: ler,
    criar: (n: NovaPendencia) => gesto(() => fonte.criar(n))(),
    cobrar: (id: string, canal: CanalCobranca) => gesto(() => fonte.cobrar(id, canal))(),
    resolver: (id: string) => gesto(() => fonte.resolver(id))(),
  };
}
