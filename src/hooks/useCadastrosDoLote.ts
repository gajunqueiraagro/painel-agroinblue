/**
 * LOTES-03 F1 — os cadastros do lote do cliente (categoria, raça, atividade, sistema, programa, destino) e as categorias do rebanho.
 * Lê `rebanho_lote_cadastros` (RLS por tenant + `.eq('cliente_id')`, só ativos, na ordem) e grava SÓ pela `fn_lote_cadastro_salvar`.
 * Erro do banco: a frase da RPC (P0001) vai para a tela; o texto cru, para o console (OC-ABRIR-LENTO-01).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CadastroDoLote, TipoDoCadastro, TrocaDeCodigo } from '@/lib/lotes/tipos';

export interface CategoriaDoRebanho { id: string; nome: string; codigo: string }

export const FRASE_ERRO_CADASTROS = 'Não consegui ler os cadastros do lote.';
export const FRASE_ERRO_GRAVAR = 'Não consegui gravar o cadastro. Tente de novo.';

const TIPOS: readonly TipoDoCadastro[] = ['categoria', 'raca', 'atividade', 'sistema', 'programa', 'destino'];
const ehTipo = (v: unknown): v is TipoDoCadastro => typeof v === 'string' && TIPOS.some(t => t === v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number => (typeof v === 'number' ? v : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Uma linha do banco → `CadastroDoLote` (null se a linha não tem o formato). */
export function cadastroDaLinha(l: unknown): CadastroDoLote | null {
  if (typeof l !== 'object' || l === null) return null;
  const id = texto(Reflect.get(l, 'id')); const tipo = Reflect.get(l, 'tipo'); const nome = texto(Reflect.get(l, 'nome'));
  if (!id || !ehTipo(tipo) || !nome) return null;
  return { id, tipo, nome, sigla: texto(Reflect.get(l, 'sigla')), categoriasRebanho: ids(Reflect.get(l, 'categorias_rebanho')),
    ordem: numero(Reflect.get(l, 'ordem')), ativo: Reflect.get(l, 'ativo') !== false };
}

/** LOTE-SIGLA-EDITAR-01 — os lotes que mudam de código (`lotes` da resposta da RPC); o que não tiver o formato fica fora. */
export function trocasDaResposta(data: unknown): TrocaDeCodigo[] {
  const lotes = typeof data === 'object' && data !== null ? Reflect.get(data, 'lotes') : null;
  if (!Array.isArray(lotes)) return [];
  return lotes.flatMap((l: unknown) => {
    if (typeof l !== 'object' || l === null) return [];
    const id = texto(Reflect.get(l, 'id')); const antes = texto(Reflect.get(l, 'antes')); const depois = texto(Reflect.get(l, 'depois'));
    return id && antes && depois ? [{ id, antes, depois }] : [];
  });
}

/* toda instância do mesmo cliente relê quando um cadastro muda (a lista de Lotes e o assistente) */
const inscritos = new Map<string, Set<() => void>>();
function notificarCadastrosMudaram(clienteId: string, exceto: () => void): void {
  for (const cb of [...(inscritos.get(clienteId) ?? [])]) if (cb !== exceto) cb();
}

/** A frase do erro do banco: a da RPC quando ela fala (P0001 / 42501), senão a genérica. */
export function fraseDoErro(erro: unknown, generica: string): string {
  if (typeof erro !== 'object' || erro === null) return generica;
  const code = texto(Reflect.get(erro, 'code')); const msg = texto(Reflect.get(erro, 'message'));
  if (code === '42501') return 'Sem acesso a este cliente.';
  if (code === 'P0001' && msg) return msg;
  return generica;
}

export interface CadastroParaSalvar {
  tipo: TipoDoCadastro; id: string | null; sigla: string | null; nome: string; categorias: string[]; ativo: boolean;
}
/** ok = gravou (`id` o do cadastro; `trocas` = os lotes que mudaram de código); senão `mensagem` = a frase pronta para o campo. */
export interface ResultadoDoCadastro { ok: boolean; id: string; mensagem: string; trocas: TrocaDeCodigo[] }

export function useCadastrosDoLote(clienteId: string | null) {
  const [cadastros, setCadastros] = useState<CadastroDoLote[]>([]);
  const [categoriasDoRebanho, setCategoriasDoRebanho] = useState<CategoriaDoRebanho[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!clienteId) { setCadastros([]); return; }
    setCarregando(true);
    const [cad, reb] = await Promise.all([
      (supabase as any).from('rebanho_lote_cadastros').select('id, tipo, sigla, nome, categorias_rebanho, ordem, ativo')
        .eq('cliente_id', clienteId).eq('ativo', true).order('ordem'),
      supabase.from('categorias_rebanho').select('id, nome, codigo, ordem_exibicao').eq('ativo', true).order('ordem_exibicao'),
    ]);
    setCarregando(false);
    if (cad.error || reb.error) {
      console.error('[useCadastrosDoLote]', cad.error ?? reb.error);
      setErro(FRASE_ERRO_CADASTROS);
      return;
    }
    setErro(null);
    const linhas: unknown[] = Array.isArray(cad.data) ? cad.data : [];
    setCadastros(linhas.map(cadastroDaLinha).filter((c): c is CadastroDoLote => c !== null));
    setCategoriasDoRebanho((reb.data ?? []).map(r => ({ id: r.id, nome: r.nome ?? '', codigo: r.codigo ?? '' })));
  }, [clienteId]);

  useEffect(() => { void recarregar(); }, [recarregar]);
  const euRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!clienteId) return;
    const cb = () => { void recarregar(); };
    euRef.current = cb;
    const subs = inscritos.get(clienteId) ?? new Set<() => void>();
    subs.add(cb); inscritos.set(clienteId, subs);
    return () => { subs.delete(cb); };
  }, [clienteId, recarregar]);

  /** `simular` = só a prévia (o banco devolve os lotes que mudariam de código; nada grava). */
  const chamar = useCallback(async (c: CadastroParaSalvar, simular: boolean): Promise<ResultadoDoCadastro> => {
    if (!clienteId) return { ok: false, id: '', mensagem: FRASE_ERRO_GRAVAR, trocas: [] };
    const { data, error } = await (supabase as any).rpc('fn_lote_cadastro_salvar', {
      p_cliente: clienteId, p_tipo: c.tipo, p_id: c.id, p_sigla: c.sigla, p_nome: c.nome, p_categorias: c.categorias,
      p_ativo: c.ativo, p_simular: simular,
    });
    if (error) {
      console.error('[fn_lote_cadastro_salvar]', error);
      return { ok: false, id: '', mensagem: fraseDoErro(error, FRASE_ERRO_GRAVAR), trocas: [] };
    }
    if (simular) return { ok: true, id: c.id ?? '', mensagem: '', trocas: trocasDaResposta(data) };
    const id = typeof data === 'object' && data !== null ? texto(Reflect.get(data, 'id')) : null;
    await recarregar();
    notificarCadastrosMudaram(clienteId, euRef.current);
    return id ? { ok: true, id, mensagem: '', trocas: trocasDaResposta(data) } : { ok: false, id: '', mensagem: FRASE_ERRO_GRAVAR, trocas: [] };
  }, [clienteId, recarregar]);
  const salvarCadastro = useCallback((c: CadastroParaSalvar) => chamar(c, false), [chamar]);
  const simularCadastro = useCallback((c: CadastroParaSalvar) => chamar(c, true), [chamar]);

  return { cadastros, categoriasDoRebanho, carregando, erro, recarregar, salvarCadastro, simularCadastro };
}
