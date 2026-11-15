/**
 * FIN-GUARDA-CHUVA G2 — o LEITOR ÚNICO das linhas de crédito do cliente (a lista de Financiamentos e o seletor do contrato leem
 * daqui). Traz as vivas e as canceladas (o seletor mostra a cancelada só quando é a do contrato). A chave `linhas-credito` é
 * invalidada por quem grava uma linha (o modal) e pela lista quando relê.
 * As colunas novas da 118060 (numero, cancelado_em) ainda não estão no types.ts gerado: a leitura usa o idioma documentado
 * `(supabase as any)` e confere cada campo (nada é presumido).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LinhaDoCadastro } from '@/lib/financiamentos/linhaDeCredito';

const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function lerLinhaDoCadastro(r: unknown): LinhaDoCadastro | null {
  if (typeof r !== 'object' || r === null) return null;
  const id = Reflect.get(r, 'id');
  if (typeof id !== 'string') return null;
  const credor = Reflect.get(r, 'financeiro_fornecedores');
  return {
    id,
    credorId: txt(Reflect.get(r, 'credor_id')),
    credorNome: typeof credor === 'object' && credor !== null ? txt(Reflect.get(credor, 'nome')) : null,
    numero: txt(Reflect.get(r, 'numero')),
    programa: txt(Reflect.get(r, 'programa')),
    descricao: txt(Reflect.get(r, 'descricao')),
    limite: num(Reflect.get(r, 'limite')),
    vigenciaInicio: txt(Reflect.get(r, 'vigencia_inicio')),
    vigenciaFim: txt(Reflect.get(r, 'vigencia_fim')),
    cancelada: Reflect.get(r, 'cancelado_em') !== null && Reflect.get(r, 'cancelado_em') !== undefined,
  };
}

export async function lerLinhasDeCredito(clienteId: string): Promise<LinhaDoCadastro[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: colunas da 118060 fora do types.ts
  const { data, error } = await (supabase as any).from('financiamento_linhas_credito')
    .select('id, credor_id, numero, programa, descricao, limite, vigencia_inicio, vigencia_fim, cancelado_em, financeiro_fornecedores!financiamento_linhas_credito_credor_id_fkey(nome)')
    .eq('cliente_id', clienteId);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((r: unknown) => { const l = lerLinhaDoCadastro(r); return l ? [l] : []; });
}

export function useLinhasDeCredito(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['linhas-credito', clienteId],
    enabled: !!clienteId,
    queryFn: () => lerLinhasDeCredito(clienteId ?? ''),
  });
}
