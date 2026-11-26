/**
 * CONC-SUGESTOES-V2 — ajustes do Gabriel 26/11 07:45 e a regra de financiamento (07:07 / 07:09).
 *
 * (1) O MINI-MODAL de uma sugestão (só leitura): descrição inteira, fornecedor, plano, conta, NF/contrato; na PARCELA o contrato, o credor,
 *     o nº da cédula, k/N, o vencimento, principal/juros previstos e o saldo devedor. Tudo LIDO (lançamento, plano pelo carregador único,
 *     contrato e o saldo do dono `fn_financiamento_situacao`) — nada calculado aqui.
 * (3) A coluna NF/DOC mostra o nº do CONTRATO na parcela: a mesma leitura dos contratos das parcelas (`lerContratosDasParcelas`).
 * ⚠ Falhou = `null` (P146): a tela diz "não consegui ler", nunca mostra vazio como se não houvesse.
 */
import { supabase } from '@/integrations/supabase/client';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';
import { lerSituacaoDoBanco } from '@/hooks/useSituacaoDoContrato';
import type { ParcelaDoLancamento } from '@/lib/conciliacao/parcelaNoCasar';

/** O contrato de uma parcela de financiamento/consórcio (o que a linha e o mini-modal mostram). */
export interface ContratoDaParcela {
  parcelaId: string;
  financiamentoId: string;
  contrato: string | null;
  numeroContrato: string | null;
  credorId: string | null;
  credor: string | null;
  numero: number | null;
  total: number | null;
  vencimento: string | null;
  principal: number | null;
  juros: number | null;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Os contratos das parcelas (uma leitura das parcelas, uma dos contratos, uma dos credores). */
export async function lerContratosDasParcelas(parcelaIds: readonly string[]): Promise<Map<string, ContratoDaParcela> | null> {
  const ids = [...new Set(parcelaIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const { data: ps, error: e1 } = await (supabase as any).from('financiamento_parcelas')
      .select('id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros').in('id', ids);
    if (e1 || !Array.isArray(ps)) { if (e1) console.error('[contratosDasParcelas]', e1); return null; }
    const fids = [...new Set(ps.map((p: { financiamento_id: string }) => p.financiamento_id))];
    const { data: fs, error: e2 } = fids.length
      ? await (supabase as any).from('financiamentos').select('id, descricao, numero_contrato, total_parcelas, credor_id').in('id', fids)
      : { data: [], error: null };
    if (e2 || !Array.isArray(fs)) { if (e2) console.error('[contratosDasParcelas]', e2); return null; }
    const cids = [...new Set(fs.map((f: { credor_id: string | null }) => f.credor_id).filter((x: string | null): x is string => !!x))];
    const { data: cs, error: e3 } = cids.length
      ? await (supabase as any).from('financeiro_fornecedores').select('id, nome').in('id', cids)
      : { data: [], error: null };
    if (e3 || !Array.isArray(cs)) { if (e3) console.error('[contratosDasParcelas]', e3); return null; }
    const credores = new Map<string, string | null>(cs.map((c: { id: string; nome: unknown }) => [c.id, texto(c.nome)]));
    const contratos = new Map<string, { descricao: unknown; numero_contrato: unknown; total_parcelas: unknown; credor_id: string | null }>(
      fs.map((f: { id: string; descricao: unknown; numero_contrato: unknown; total_parcelas: unknown; credor_id: string | null }) => [f.id, f]));
    const saida = new Map<string, ContratoDaParcela>();
    for (const p of ps) {
      const f = contratos.get(p.financiamento_id);
      saida.set(p.id, {
        parcelaId: p.id, financiamentoId: p.financiamento_id,
        contrato: texto(f?.descricao), numeroContrato: texto(f?.numero_contrato),
        credorId: f?.credor_id ?? null, credor: f?.credor_id ? credores.get(f.credor_id) ?? null : null,
        numero: numero(p.numero_parcela), total: numero(f?.total_parcelas),
        vencimento: texto(p.data_vencimento), principal: numero(p.valor_principal), juros: numero(p.valor_juros),
      });
    }
    return saida;
  } catch (e) {
    console.error('[contratosDasParcelas]', e);
    return null;
  }
}

/** O que o mini-modal mostra de um lançamento. */
export interface DetalheDoLancamento {
  descricao: string | null;
  fornecedor: string | null;
  plano: string | null;
  conta: string | null;
  documento: string | null;
  vencimento: string | null;
  valor: number | null;
}

/** "Centro › Subcentro" da conta do plano (o carregador único do plano do cliente). */
export function rotuloDoPlano(c: { centro_custo: string; subcentro: string | null } | null | undefined): string | null {
  if (!c) return null;
  return c.subcentro ? `${c.centro_custo} › ${c.subcentro}` : c.centro_custo;
}

export async function lerDetalheDoLancamento(clienteId: string, lancamentoId: string): Promise<DetalheDoLancamento | null> {
  try {
    const { data: l, error } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('id, descricao, favorecido_id, plano_conta_id, conta_efetiva_id, tipo_documento, numero_documento, data_vencimento, valor')
      .eq('id', lancamentoId).eq('cliente_id', clienteId).maybeSingle();
    if (error || !l) { if (error) console.error('[detalheDoLancamento]', error); return null; }
    const [forn, conta, plano] = await Promise.all([
      l.favorecido_id ? (supabase as any).from('financeiro_fornecedores').select('nome').eq('id', l.favorecido_id).maybeSingle() : Promise.resolve({ data: null }),
      l.conta_efetiva_id ? (supabase as any).from('financeiro_contas_bancarias').select('nome_exibicao, nome_conta').eq('id', l.conta_efetiva_id).maybeSingle() : Promise.resolve({ data: null }),
      l.plano_conta_id ? loadContasDoPlanoDoCliente(clienteId).then((cs) => cs.find((c) => c.id === l.plano_conta_id) ?? null) : Promise.resolve(null),
    ]);
    const doc = texto(l.numero_documento);
    return {
      descricao: texto(l.descricao), fornecedor: texto(forn.data?.nome),
      plano: rotuloDoPlano(plano), conta: texto(conta.data?.nome_exibicao) ?? texto(conta.data?.nome_conta),
      documento: doc ? `${texto(l.tipo_documento) ?? 'Doc.'} ${doc}` : null,
      vencimento: texto(l.data_vencimento), valor: numero(l.valor),
    };
  } catch (e) {
    console.error('[detalheDoLancamento]', e);
    return null;
  }
}

/** O saldo devedor do contrato — do dono (`fn_financiamento_situacao` → a chave `saldo`). Nulo = o banco não mandou (a tela diz "—"). */
export async function lerSaldoDevedor(financiamentoId: string, hoje: string): Promise<number | null> {
  try {
    const s = await lerSituacaoDoBanco(financiamentoId, hoje, false);
    return s.saldo?.saldo ?? null;
  } catch (e) {
    console.error('[saldoDevedor]', e);
    return null;
  }
}

/**
 * REGRA DE FINANCIAMENTO (b) — de quais parcelas são os lançamentos levados, e o papel de cada um (amortização = `lancamento_id`,
 * juros = `lancamento_juros_id`). Falhou = `null`: o "Casar com o banco" segue o caminho de sempre (sem a pergunta do motivo).
 */
export async function lerParcelasDosLancamentos(ids: readonly string[]): Promise<Map<string, ParcelaDoLancamento> | null> {
  const lista = [...new Set(ids.filter(Boolean))];
  if (!lista.length) return new Map();
  try {
    const em = lista.join(',');
    const { data, error } = await (supabase as any).from('financiamento_parcelas')
      .select('id, financiamento_id, numero_parcela, data_vencimento, lancamento_id, lancamento_juros_id')
      .or(`lancamento_id.in.(${em}),lancamento_juros_id.in.(${em})`);
    if (error || !Array.isArray(data)) { if (error) console.error('[parcelasDosLancamentos]', error); return null; }
    const m = new Map<string, ParcelaDoLancamento>();
    for (const p of data) {
      const rotulo = p.numero_parcela != null ? `parcela ${p.numero_parcela}` : null;
      const temAmortizacao = !!p.lancamento_id;
      if (p.lancamento_id && lista.includes(p.lancamento_id)) m.set(p.lancamento_id, { parcelaId: p.id, papel: 'amortizacao', vencimento: texto(p.data_vencimento), rotulo, temAmortizacao });
      if (p.lancamento_juros_id && lista.includes(p.lancamento_juros_id)) m.set(p.lancamento_juros_id, { parcelaId: p.id, papel: 'juros', vencimento: texto(p.data_vencimento), rotulo, temAmortizacao });
    }
    return m;
  } catch (e) {
    console.error('[parcelasDosLancamentos]', e);
    return null;
  }
}
