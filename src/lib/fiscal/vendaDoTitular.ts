/**
 * NOTA-TIPO-ABATE-01 (Gabriel 27/11 17:39, erro grave) — a NF de ENTRADA emitida pelo comprador (tpNF 0: o frigorífico, a fecularia) em que o
 * DESTINATÁRIO é um titular do cliente é a VENDA do titular: entra como RECEITA, nunca como despesa. O tipo sai do PAPEL do titular + tpNF
 * (a mesma regra da lista da Receita, `classeDaNota` → "Sua venda"); a sugestão de conta nunca vence o tipo.
 * Antes de lançar, casa com o abate/venda já lançado na Operação Comercial (mesmo comprador, ±10 dias): a receita não pode entrar duas vezes.
 * Só leitura (RLS do cliente). Falhou = `ok: false` (quem chama não decide "não é venda" por falha).
 */
import { supabase } from '@/integrations/supabase/client';
import { motivoDoErro, type Consulta } from '@/lib/financeiro/nfeConsultas';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fiscais e da OC fora dos tipos gerados
const db = () => supabase as any;
const soDigitos = (s: unknown) => (typeof s === 'string' ? s.replace(/\D/g, '') : '');
export const JANELA_DO_ABATE_DIAS = 10;

/** é venda do titular? NF de entrada (do ponto de vista do emitente) com um titular do cliente no destinatário. PURA. */
export function ehVendaDoTitular(nota: { tipoNota: 'entrada' | 'saida'; destinatario: { documento: string } }, documentosDosTitulares: ReadonlySet<string>): boolean {
  const dest = soDigitos(nota.destinatario.documento);
  return nota.tipoNota === 'entrada' && dest.length > 0 && documentosDosTitulares.has(dest);
}

/** os CPF/CNPJ dos titulares (produtores) do cliente, só dígitos */
export async function documentosDosTitulares(clienteId: string): Promise<Consulta<Set<string>>> {
  try {
    const r = await db().from('fiscal_titulares').select('documento').eq('cliente_id', clienteId);
    if (r.error) return { ok: false, motivo: motivoDoErro(r.error) };
    return { ok: true, valor: new Set((Array.isArray(r.data) ? r.data : []).map((x: unknown) => soDigitos(x && typeof x === 'object' ? Reflect.get(x, 'documento') : '')).filter((d: string) => d.length > 0)) };
  } catch (e) { return { ok: false, motivo: motivoDoErro(e) }; }
}

export interface VendaNaOc { operacaoId: string; data: string; valor: number | null }
/** o abate/venda da OC com o MESMO comprador (o emitente da nota) a ±10 dias da emissão; o mais perto da data */
export async function vendaNaOcProxima(clienteId: string, compradorDocumento: string, emissao: string): Promise<Consulta<VendaNaOc | null>> {
  try {
    const doc = soDigitos(compradorDocumento);
    if (!doc || !/^\d{4}-\d{2}-\d{2}/.test(emissao)) return { ok: true, valor: null };
    const f = await db().from('financeiro_fornecedores').select('id, cpf_cnpj').eq('cliente_id', clienteId);
    if (f.error) return { ok: false, motivo: motivoDoErro(f.error) };
    const ids = (Array.isArray(f.data) ? f.data : []).filter((x: unknown) => soDigitos(x && typeof x === 'object' ? Reflect.get(x, 'cpf_cnpj') : '') === doc)
      .map((x: unknown) => String(Reflect.get(x as object, 'id')));
    if (ids.length === 0) return { ok: true, valor: null };
    const base = Date.parse(`${emissao.slice(0, 10)}T00:00:00Z`);
    const de = new Date(base - JANELA_DO_ABATE_DIAS * 86_400_000).toISOString().slice(0, 10);
    const ate = new Date(base + JANELA_DO_ABATE_DIAS * 86_400_000).toISOString().slice(0, 10);
    const o = await db().from('zoo_operacoes_comerciais').select('id, data_operacao, data_abate, valor_total')
      .eq('cliente_id', clienteId).in('contraparte_id', ids).is('cancelado_em', null)
      .or(`and(data_abate.gte.${de},data_abate.lte.${ate}),and(data_operacao.gte.${de},data_operacao.lte.${ate})`);
    if (o.error) return { ok: false, motivo: motivoDoErro(o.error) };
    const achadas = (Array.isArray(o.data) ? o.data : []).map((x: unknown) => {
      const d = String(Reflect.get(x as object, 'data_abate') ?? Reflect.get(x as object, 'data_operacao') ?? '');
      const v = Number(Reflect.get(x as object, 'valor_total'));
      return { operacaoId: String(Reflect.get(x as object, 'id')), data: d, valor: Number.isFinite(v) ? v : null };
    }).sort((a: VendaNaOc, b: VendaNaOc) => Math.abs(Date.parse(a.data) - base) - Math.abs(Date.parse(b.data) - base));
    return { ok: true, valor: achadas[0] ?? null };
  } catch (e) { return { ok: false, motivo: motivoDoErro(e) }; }
}

/** a conta é de ENTRADA? (o tipo do plano manda: a sugestão de despesa nunca vale para uma venda). Lê pelo carregador dono do plano. */
export async function planoEhDeEntrada(clienteId: string, planoContaId: string): Promise<Consulta<boolean>> {
  try {
    const contas = await loadContasDoPlanoDoCliente(clienteId, { incluirInativos: true });
    const c = contas.find((x) => x.id === planoContaId);
    return { ok: true, valor: !!c && /entrada/i.test(c.tipo_operacao) };
  } catch (e) { return { ok: false, motivo: motivoDoErro(e) }; }
}

export const fraseDaVendaNaOc = (v: VendaNaOc) =>
  `É a sua venda (o comprador emitiu a NF de entrada): o abate/venda de ${v.data.slice(8, 10)}/${v.data.slice(5, 7)}/${v.data.slice(0, 4)} já está na Operação Comercial — ligue a nota lá; não lance de novo.`;
