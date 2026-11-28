/**
 * FINANC-VINCULO-OBRIGATORIO-01 FASE 1 (Gabriel 27/11, mock `financ-vinculo-obrigatorio-01.html` aprovado com ajuste) — o lançamento de
 * FINANCIAMENTO (Entrada de Financiamento · Amortização · Juros) sem contrato é PENDÊNCIA até vincular. A regra é UMA, a do banco (lote 114540,
 * `_fn_lancamento_sem_contrato`): aqui só leitura e a escolha de QUAL gravador que já existe usar.
 *   V1 — a parcela EM ABERTO de valor exatamente igual (o banco só a devolve quando é UMA) → a parcela; senão, o contrato escolhido;
 *   V2 — a lista de todas as pendências do cliente, com o filtro por ano (`fn_financiamento_vinculos_pendentes`);
 *   V3 — "Agora não" só fecha: a pendência fica.
 * Nenhum contrato nasce escolhido: o de parcela exata só se REALÇA.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizarParaBusca } from '@/lib/texto/busca';

export type TipoDoVinculo = 'captacao' | 'amortizacao' | 'juros';
const TIPOS: readonly TipoDoVinculo[] = ['captacao', 'amortizacao', 'juros'];

export interface ParcelaExata {
  parcelaId: string; financiamentoId: string; numeroContrato: string | null; numeroParcela: number | null; vencimento: string | null; papel: 'principal' | 'juros';
}
export type VinculoPendente = { pendente: false } | { pendente: true; tipo: TipoDoVinculo; subcentro: string | null; parcelaExata: ParcelaExata | null };

export interface PendenciaDeVinculo {
  lancamentoId: string; data: string | null; valor: number; tipo: TipoDoVinculo; subcentro: string | null; fornecedor: string | null; descricao: string | null;
}
export interface AnoDasPendencias { ano: number; n: number; valor: number }

export interface ContratoParaVincular {
  id: string; numero: string | null; descricao: string | null; credorId: string | null; credor: string | null; dataContrato: string | null; valorContratado: number | null;
  status: string | null;
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const tipo = (v: unknown): TipoDoVinculo | null => TIPOS.find((t) => t === v) ?? null;

export const ROTULO_DO_TIPO: Record<TipoDoVinculo, string> = { captacao: 'Entrada (liberação)', amortizacao: 'Amortização', juros: 'Juros' };

/** a resposta da `fn_lancamento_vinculo_pendente` (peça torta = nula: a tela não mostra aviso inventado) */
export function lerVinculoPendente(bruto: unknown): VinculoPendente | null {
  const o = obj(bruto);
  if (!o || typeof o.pendente !== 'boolean') return null;
  if (!o.pendente) return { pendente: false };
  const t = tipo(o.tipo);
  if (!t) return null;
  const e = obj(o.parcela_exata);
  const parcelaId = txt(e?.parcela_id); const financiamentoId = txt(e?.financiamento_id);
  const papel = e?.papel === 'juros' ? 'juros' : 'principal';
  return {
    pendente: true, tipo: t, subcentro: txt(o.subcentro),
    parcelaExata: e && parcelaId && financiamentoId
      ? { parcelaId, financiamentoId, numeroContrato: txt(e.numero_contrato), numeroParcela: num(e.numero_parcela), vencimento: txt(e.data_vencimento), papel }
      : null,
  };
}

export function lerPendenciasDeVinculo(bruto: unknown): { anos: AnoDasPendencias[]; itens: PendenciaDeVinculo[] } | null {
  const o = obj(bruto);
  if (!o || !Array.isArray(o.itens) || !Array.isArray(o.anos)) return null;
  const itens: PendenciaDeVinculo[] = [];
  for (const b of o.itens) {
    const i = obj(b); const id = txt(i?.lancamento_id); const t = tipo(i?.tipo); const valor = num(i?.valor);
    if (!i || !id || !t || valor === null) return null;
    itens.push({ lancamentoId: id, data: txt(i.data), valor, tipo: t, subcentro: txt(i.subcentro), fornecedor: txt(i.fornecedor), descricao: txt(i.descricao) });
  }
  const anos: AnoDasPendencias[] = [];
  for (const b of o.anos) {
    const a = obj(b); const ano = num(a?.ano); const n = num(a?.n); const valor = num(a?.valor);
    if (ano === null || n === null || valor === null) return null;
    anos.push({ ano, n, valor });
  }
  return { anos, itens };
}

/** o filtro da lista de contratos do "Vincular a um contrato" (o texto acha nº, credor e descrição; sem acento e sem maiúscula) */
export function filtrarContratos(lista: readonly ContratoParaVincular[], f: { busca: string; credorId: string | null; soAtivos: boolean }): ContratoParaVincular[] {
  const norm = (s: string | null) => normalizarParaBusca(s);
  const b = norm(f.busca.trim());
  /* o nº se acha também sem os pontos ("6670010" acha "667.001.0") */
  const digitos = b.replace(/\D/g, '');
  const casa = (x: string | null) => norm(x).includes(b) || (digitos.length >= 3 && norm(x).replace(/\D/g, '').includes(digitos));
  return lista.filter((c) => (!f.soAtivos || c.status === 'ativo' || c.status === 'prorrogado')
    && (!f.credorId || c.credorId === f.credorId)
    && (!b || [c.numero, c.credor, c.descricao].some(casa)));
}

/** a parcela em aberto mais próxima do contrato (a amortização sem parcela de valor igual vai nela; a prévia do banco diz o que muda) */
export interface ParcelaAberta { id: string; numero: number | null; vencimento: string | null }
export function proximaParcelaAberta(parcelas: readonly { id: string; numero: number | null; dataVencimento: string | null; situacao: string | null }[]): ParcelaAberta | null {
  let prox: ParcelaAberta | null = null;
  for (const p of parcelas) {
    if (p.situacao === 'paga') continue;
    if (!prox || (p.dataVencimento && (!prox.vencimento || p.dataVencimento < prox.vencimento))) prox = { id: p.id, numero: p.numero, vencimento: p.dataVencimento };
  }
  return prox;
}

/** QUAL gravador que já existe recebe o vínculo (V1): nenhum gravador novo */
export type ComoVincular =
  | { via: 'parcela'; parcelaId: string; papel: 'principal' | 'juros' }
  | { via: 'encargo'; papel: 'juros' }
  | { via: 'liberacao' }
  | { via: 'nenhum'; frase: string };
export function comoVincular(p: { tipo: TipoDoVinculo; contratoId: string; exata: ParcelaExata | null; proxima: ParcelaAberta | null }): ComoVincular {
  if (p.tipo === 'captacao') return { via: 'liberacao' };
  if (p.exata && p.exata.financiamentoId === p.contratoId) return { via: 'parcela', parcelaId: p.exata.parcelaId, papel: p.exata.papel };
  if (p.tipo === 'juros') return { via: 'encargo', papel: 'juros' };
  if (p.proxima) return { via: 'parcela', parcelaId: p.proxima.id, papel: 'principal' };
  return { via: 'nenhum', frase: 'Este contrato não tem parcela em aberto para receber a amortização.' };
}

export async function consultarVinculoPendente(lancamentoId: string): Promise<VinculoPendente | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_lancamento_vinculo_pendente', { p_lancamento_id: lancamentoId });
  if (error) { console.error('[fn_lancamento_vinculo_pendente]', error); return null; }
  return lerVinculoPendente(data);
}

export async function consultarPendenciasDeVinculo(clienteId: string, ano: number | null): Promise<{ anos: AnoDasPendencias[]; itens: PendenciaDeVinculo[] } | string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_financiamento_vinculos_pendentes', { p_cliente_id: clienteId, p_ano: ano });
  if (error) { console.error('[fn_financiamento_vinculos_pendentes]', error); return 'Não consegui ler as pendências agora. Tente de novo.'; }
  return lerPendenciasDeVinculo(data) ?? 'As pendências vieram num formato que não sei ler.';
}

/** os contratos do cliente para a lista; o nome do credor vem do leitor ÚNICO de fornecedores (`nomes`, o `useFornecedoresDoCliente` da tela) */
export async function consultarContratosParaVincular(clienteId: string): Promise<Omit<ContratoParaVincular, 'credor'>[] | string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela lida pelo cliente
  const { data, error } = await (supabase as any).from('financiamentos').select('id, numero_contrato, descricao, credor_id, data_contrato, valor_total, status, natureza')
    .eq('cliente_id', clienteId).neq('natureza', 'parcelamento');
  if (error) { console.error('[financiamentos]', error); return 'Não consegui ler os contratos agora. Tente de novo.'; }
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  return linhas.map((l) => {
    const o = obj(l) ?? {};
    return { id: txt(o.id) ?? '', numero: txt(o.numero_contrato), descricao: txt(o.descricao), credorId: txt(o.credor_id),
      dataContrato: txt(o.data_contrato), valorContratado: num(o.valor_total), status: txt(o.status) };
  }).filter((c) => c.id)
    .sort((a, b) => (b.dataContrato ?? '').localeCompare(a.dataContrato ?? '') || (a.numero ?? '').localeCompare(b.numero ?? ''));
}
