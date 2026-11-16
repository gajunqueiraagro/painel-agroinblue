/**
 * LANC-PATRIMONIO-VINCULO-01 — a API do pedaço "Patrimônio" do Editar lançamento. INJETÁVEL (prop), como a `PatrimonioApi`: a bancada
 * sintética do gate de tela passa uma em memória.
 *   · ler: as partes do lançamento (`vw_fin_classificacao_por_parte`, security_invoker → RLS por tenant) + os vínculos VIVOS
 *     (`patrimonio_bem_lancamentos`) com o código/nome do bem.
 *   · bens/categorias: os mesmos leitores do Patrimônio (`fn_patrimonio_lista`, `patrimonio_categorias` com `contas_sugeridas`).
 *   · ligar/desligar: as RPCs de hoje (`fn_patrimonio_bem_ligar` / `_desligar`) pela `apiDoBanco` do Patrimônio.
 *   · criarELigar: a `fn_patrimonio_bem_criar_e_ligar` (116270): ou nasce o bem já ligado, ou nada nasce; `p_simular` = prévia.
 * ⚠ `(supabase as any)`: tabelas/RPCs fora do `types.ts` (a única exceção do zero-cast).
 */
import { supabase } from '@/integrations/supabase/client';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { fraseDoErro, type AtividadeBem, type BemDaLista } from './patrimonio';
import { apiDoBanco, type ItemDoVinculo, type PreviaLigar, type Resultado } from './patrimonioApi';
import type { CategoriaComContas, ParteDoLancamento, PatrimonioDoLancamentoLido, VinculoDoLancamento } from './patrimonioDoLancamento';

type Linha = Record<string, unknown>;
const ehLinha = (v: unknown): v is Linha => typeof v === 'object' && v !== null && !Array.isArray(v);
const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? v.filter(ehLinha) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0);
const numOuNulo = (v: unknown): number | null => (v == null || v === '' ? null : num(v));
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** O bem novo como o "Criar o bem" manda (o `p_bem` da `fn_patrimonio_bem_salvar`; sem `id`). */
export interface BemNovo { cliente_id: string; fazenda_id: string; categoria_id: string; descricao: string; atividade: AtividadeBem }
/** A prévia/resposta do "Criar e ligar". */
export interface RespostaCriar { ok: boolean; codigo: string | null; id: string | null; ligar: PreviaLigar | null; vida_util_meses: number | null; residual_pct: number | null }

export interface PatrimonioDoLancamentoApi {
  ler(lancamentoId: string, clienteId: string): Promise<Resultado<PatrimonioDoLancamentoLido>>;
  bens(clienteId: string): Promise<Resultado<BemDaLista[]>>;
  categorias(clienteId: string): Promise<CategoriaComContas[]>;
  ligar(bemId: string, itens: ItemDoVinculo[], confirmarRepetidas: boolean, simular: boolean): Promise<Resultado<PreviaLigar>>;
  desligar(bemId: string, itens: ItemDoVinculo[], motivo: string): Promise<Resultado<Linha>>;
  criarELigar(bem: BemNovo, itens: ItemDoVinculo[], confirmarRepetidas: boolean, simular: boolean): Promise<Resultado<RespostaCriar>>;
}

export function parteDaLinha(r: Linha, deContrato: boolean): ParteDoLancamento {
  return {
    parte_ordem: num(r.parte_ordem) || 1, partes_total: num(r.partes_total) || 1, valor: num(r.valor), plano_conta_id: txt(r.plano_conta_id),
    macro_custo: txt(r.macro_custo), centro_custo: txt(r.centro_custo), subcentro: txt(r.subcentro), escopo_negocio: txt(r.escopo_negocio),
    status_transacao: txt(r.status_transacao), cancelado: r.cancelado === true, fazenda_id: txt(r.fazenda_id),
    data_pagamento: txt(r.data_pagamento), data_competencia: txt(r.data_competencia), descricao: txt(r.descricao), de_contrato: deContrato,
  };
}

/** A prévia do ligar (o mesmo leitor da `apiDoBanco.ligar`, para a resposta aninhada do criar). */
export function previaDaLinha(d: Linha): PreviaLigar {
  return {
    ok: d.ok !== false, soma: num(d.soma_aquisicao), n_ligar: num(d.n_ligar ?? d.n_ligados), n_recusas: num(d.n_recusas), n_repetidas: num(d.n_repetidas),
    itens: linhas(d.itens).map((i) => ({ lancamento_id: String(i.lancamento_id), parte_ordem: num(i.parte_ordem) || 1, situacao: txt(i.situacao) ?? '',
      motivo: txt(i.motivo), repetida: i.repetida === true, valor: numOuNulo(i.valor), descricao: txt(i.descricao) })),
    contratos: linhas(d.contratos).map((c) => ({ financiamento_id: String(c.financiamento_id), descricao: txt(c.descricao), n_parcelas: num(c.n_parcelas),
      n_faltam: num(c.n_faltam), valor_total: num(c.valor_total),
      faltam: linhas(c.faltam).map((f) => ({ lancamento_id: String(f.lancamento_id), parte_ordem: num(f.parte_ordem) || 1 })) })),
  };
}

export function respostaDoCriar(d: unknown): RespostaCriar {
  const r = ehLinha(d) ? d : {};
  const bem = ehLinha(r.bem) ? r.bem : {};
  return {
    ok: r.ok === true, codigo: txt(r.codigo), id: txt(r.id), ligar: ehLinha(r.ligar) ? previaDaLinha(r.ligar) : null,
    vida_util_meses: numOuNulo(bem.vida_util_meses), residual_pct: numOuNulo(bem.residual_pct),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas/RPCs fora do `types.ts` (a exceção do zero-cast)
const tabela = (nome: string) => (supabase as any).from(nome);

export const apiDoLancamentoDoBanco: PatrimonioDoLancamentoApi = {
  async ler(lancamentoId, clienteId) {
    const [p, v] = await Promise.all([
      tabela('vw_fin_classificacao_por_parte').select('parte_ordem, partes_total, valor, plano_conta_id, macro_custo, centro_custo, subcentro, escopo_negocio, status_transacao, cancelado, fazenda_id, data_pagamento, data_competencia, descricao, financiamento_id, origem_tipo')
        .eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).order('parte_ordem'),
      tabela('patrimonio_bem_lancamentos').select('bem_id, parte_ordem').eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).is('desligado_em', null),
    ]);
    if (p.error || v.error) { console.error('[patrimonio do lançamento]', p.error ?? v.error); return { ok: false, erro: 'Não consegui ler o Patrimônio deste lançamento.' }; }
    const ps = linhas(p.data); const vs = linhas(v.data);
    const finIds = [...new Set(ps.map((x) => txt(x.financiamento_id)).filter((x): x is string => !!x))];
    const contratos = new Set<string>();
    if (finIds.length) {
      const { data } = await tabela('financiamentos').select('id, natureza').in('id', finIds);
      for (const f of linhas(data)) if (f.natureza === 'parcelamento' || f.natureza === 'consorcio') contratos.add(String(f.id));
    }
    const bemIds = [...new Set(vs.map((x) => String(x.bem_id)))];
    const bens = new Map<string, Linha>();
    if (bemIds.length) {
      const { data } = await tabela('patrimonio_bens').select('id, codigo, descricao').eq('cliente_id', clienteId).in('id', bemIds);
      for (const b of linhas(data)) bens.set(String(b.id), b);
    }
    const vinculos: VinculoDoLancamento[] = vs.map((x) => {
      const b = bens.get(String(x.bem_id));
      return { bem_id: String(x.bem_id), codigo: (b && txt(b.codigo)) ?? '—', descricao: (b && txt(b.descricao)) ?? '', parte_ordem: num(x.parte_ordem) || 1 };
    });
    const partes = ps.map((x) => parteDaLinha(x, x.origem_tipo === 'parcela_principal' && contratos.has(String(x.financiamento_id))));
    return { ok: true, dados: { partes, vinculos } };
  },
  async bens(clienteId) {
    return apiDoBanco.lista(clienteId, null, hojeLocal());
  },
  async categorias(clienteId) {
    const { data, error } = await tabela('patrimonio_categorias').select('*').eq('ativo', true).order('ordem');
    if (error) { console.error('[patrimonio do lançamento]', error); return []; }
    return linhas(data).filter((r) => r.cliente_id == null || r.cliente_id === clienteId).map((r) => ({
      id: String(r.id), cliente_id: txt(r.cliente_id), codigo: txt(r.codigo) ?? '', nome: txt(r.nome) ?? '',
      vida_util_anos: numOuNulo(r.vida_util_anos), residual_pct: num(r.residual_pct), deprecia: r.deprecia === true,
      tem_mercado: r.tem_mercado === true, base_mercado: r.base_mercado === 'terra' ? 'terra' : r.base_mercado === 'bem' ? 'bem' : null,
      tem_pastos: r.tem_pastos === true, ordem: num(r.ordem), ativo: r.ativo === true, prefixo: txt(r.prefixo), contas_sugeridas: textos(r.contas_sugeridas),
    }));
  },
  ligar: (bemId, itens, confirmar, simular) => apiDoBanco.ligar(bemId, itens, confirmar, simular),
  desligar: (bemId, itens, motivo) => apiDoBanco.desligar(bemId, itens, motivo),
  async criarELigar(bem, itens, confirmar, simular) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
    const { data, error } = await (supabase as any).rpc('fn_patrimonio_bem_criar_e_ligar', {
      p_bem: { ...bem, situacao: 'em_formacao', origem_valor: 'lancamentos' }, p_itens: itens, p_confirmar_repetidas: confirmar, p_simular: simular,
    });
    if (error) return { ok: false, erro: fraseDoErro(error, 'Não consegui criar o bem. Tente de novo.') };
    return { ok: true, dados: respostaDoCriar(data) };
  },
};
