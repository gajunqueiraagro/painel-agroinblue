/**
 * Hook for financeiro_lancamentos_v2 CRUD with pagination and filters.
 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sincronizarVinculosDoLancamento, recomputarStatusExtrato } from '@/lib/financeiro/conciliacaoSync';
import { isTituloOC, detectarViolacoesEstruturaisOC } from '@/lib/financeiro/protecaoTituloOC';
import { STATUS_FINANCEIRO_INICIAL, type StatusFiltroFinanceiro } from '@/lib/financeiro/statusFinanceiro';
import { reportarErro, normalizarErro, ErroUsuarioSeguro } from '@/lib/erroOperacional';


export interface LancamentoV2 {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  conta_bancaria_id: string | null;
  data_competencia: string;
  data_pagamento: string | null;
  // PR-FIN-DATAS-01 — eixo de vencimento (aditivo). Data em que a obrigação é devida
  // (pagar/receber). Nullable: meta/planejamento/legado. Ainda NÃO lido/escrito por
  // nenhum consumidor — só existe no contrato de tipos.
  data_vencimento: string | null;
  valor: number;
  sinal: number;
  tipo_operacao: string;
  status_transacao: string | null;
  descricao: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  escopo_negocio: string | null;
  observacao: string | null;
  ano_mes: string;
  documento: string | null;
  historico: string | null;
  numero_documento: string | null;
  favorecido_id: string | null;
  conta_destino_id: string | null;
  origem_lancamento: string;
  lote_importacao_id: string | null;
  forma_pagamento: string | null;
  dados_pagamento: string | null;
  cancelado: boolean;
  // Vínculo de conciliação bancária (match com item de extrato). Read-only aqui —
  // usado para derivar o estado 'Conciliado' na grade e vetar reclassificação em lote.
  conciliado_em: string | null;
  editado_manual: boolean;
  created_at: string;
  updated_at: string;
  /** FK para `lancamentos.id` quando o registro foi gerado a partir de uma
   *  movimentação zootécnica (compra/abate/venda). Read-only — usado para
   *  indicador visual e roteamento para LancamentoZooModal. */
  movimentacao_rebanho_id: string | null;
  safra_id?: string | null;
}

export interface Safra {
  id: string;
  nome: string;
  descricao?: string | null;
  ativa: boolean;
}

export interface LancamentoV2Form {
  fazenda_id: string;
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null;
  data_competencia: string;
  data_pagamento?: string | null;
  // PR-FIN-DATAS-01 — eixo de vencimento (aditivo, OPCIONAL). Nenhum writer/onSave escreve
  // este campo nesta etapa; existe só para o contrato futuro sem forçar alteração de consumidores.
  data_vencimento?: string | null;
  valor: number;
  tipo_operacao: string;
  status_transacao?: string;
  descricao?: string;
  macro_custo?: string;
  grupo_custo?: string;
  centro_custo?: string;
  subcentro?: string;
  escopo_negocio?: string;
  observacao?: string;
  numero_documento?: string | null;
  tipo_documento?: string | null;
  favorecido_id?: string | null;
  forma_pagamento?: string | null;
  dados_pagamento?: string | null;
  safra_id?: string | null;
}

/**
 * PR-H1 — classificação oficial da conta bancária (vocabulário CURTO).
 * Schema enforce via CHECK constraint em
 * financeiro_contas_bancarias.tipo_conta. NULL é tolerado apenas para
 * registros legados (coluna permanece nullable até backfill 100%).
 *
 *   cc      = conta corrente, caixa físico, dinheiro
 *   inv     = investimento, corretora, CDB, aplicação
 *   cartao  = cartão de crédito/débito
 */
export type TipoConta = 'cc' | 'inv' | 'cartao';

export interface ContaBancariaV2 {
  id: string;
  nome_conta: string;
  banco: string | null;
  fazenda_id: string;
  tipo_conta: TipoConta | null;
  codigo_conta: string | null;
  nome_exibicao: string | null;
  agencia: string | null;
  numero_conta: string | null;
  conta_digito: string | null;
}

export interface FornecedorV2 {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string | null;   // PR-FORNECEDOR-FAZENDA-01: fazenda opcional
  ativo: boolean;
  tipo_recebimento: string | null;
  pix_tipo_chave: string | null;
  pix_chave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  cpf_cnpj_pagamento: string | null;
  nome_favorecido: string | null;
  observacao_pagamento: string | null;
}

// PR-FIN-GRADE-DATAS-03 — dimensão temporal soberana da grade. 'financeira' = COALESCE(data_pagamento,
//   data_vencimento) (contrato de PR-FIN-OC-CONTRATO-01); as demais recortam pela coluna homônima.
//   Ausência do campo em FiltrosV2 é tratada como 'financeira' (default preserva o comportamento atual).
export type DimensaoDataFinanceiro = 'financeira' | 'competencia' | 'vencimento' | 'pagamento';

export interface FiltrosV2 {
  fazenda_id?: string;
  ano?: string;
  mes?: string;           // single month or 'todos'
  meses?: string[];       // multi-month select
  conta_bancaria_id?: string;
  conta_destino_id?: string;
  tipo_operacao?: string;
  status_transacoes?: StatusFiltroFinanceiro[];   // PR-FIN-STATUS-UX-03A-1 — multisseleção; vazio/ausente = Todos
  macro_custo?: string;
  grupo_custo?: string;
  centro_custo?: string;
  subcentro?: string;
  dimensao?: DimensaoDataFinanceiro;   // PR-FIN-GRADE-DATAS-03 — default 'financeira'
}

export interface ClassificacaoItem {
  subcentro: string;
  centro_custo: string;
  grupo_custo: string;
  macro_custo: string;
  tipo_operacao: string;
  escopo_negocio: string;
}

const DEFAULT_PAGE_SIZE = 30;

// PR-FIN-FILTRO-PGTO-01 — recorte temporal SOBERANO por data_pagamento (a dimensão exibida em PGTO),
//   nunca por ano_mes (que o motor da OC deriva da competência). Faixa [1º dia do mês, 1º dia do mês
//   seguinte) sobre a coluna date — vira o ano corretamente e sem comparação textual de datas.
function faixaMes(ano: number, mes: number): [string, string] {
  const mm = String(mes).padStart(2, '0');
  const ini = `${ano}-${mm}-01`;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;
  return [ini, fim];
}

// Meses normalizados do recorte (multi ou único); [] quando "Todos os meses".
function mesesDoRecorte(filtros: FiltrosV2): string[] {
  if (filtros.meses && filtros.meses.length > 0 && !filtros.meses.includes('todos')) return filtros.meses;
  if (filtros.mes && filtros.mes !== 'todos') return [filtros.mes];
  return [];
}

// PR-FIN-OC-CONTRATO-01 — data financeira DERIVADA = COALESCE(data_pagamento, data_vencimento):
//   pagamento efetivo quando há; senão o vencimento (título OC aberto). Ramo OR server-side (PostgREST):
//   (pago na faixa) OU (não pago E vencimento na faixa). Legado (data_pagamento preenchida) cai sempre no
//   1º ramo → comportamento idêntico ao de hoje. Sem carregar a base para filtrar client-side.
//   IMPORTANTE: o pagamento é soberano — se há pagamento fora da faixa, a linha NÃO entra pelo vencimento
//   (o 2º ramo exige data_pagamento IS NULL). Ex.: pag=10/09, venc=10/08, recorte=agosto → fora.
function ramoDerivado(ini: string, fim: string): string {
  return `and(data_pagamento.gte.${ini},data_pagamento.lt.${fim}),`
       + `and(data_pagamento.is.null,data_vencimento.gte.${ini},data_vencimento.lt.${fim})`;
}

// PR-FIN-GRADE-DATAS-03 — segmento OR de UMA faixa [ini,fim) para a dimensão selecionada.
//   'financeira' delega ao ramoDerivado (contrato acima); as demais recortam pela coluna homônima.
//   gte/lt sobre coluna NULL não corresponde → linhas sem a data da dimensão ficam fora (contrato do PR).
function ramoDimensao(dimensao: DimensaoDataFinanceiro, ini: string, fim: string): string {
  switch (dimensao) {
    case 'competencia': return `and(data_competencia.gte.${ini},data_competencia.lt.${fim})`;
    case 'vencimento':  return `and(data_vencimento.gte.${ini},data_vencimento.lt.${fim})`;
    case 'pagamento':   return `and(data_pagamento.gte.${ini},data_pagamento.lt.${fim})`;
    case 'financeira':
    default:            return ramoDerivado(ini, fim);
  }
}

// PR-FIN-GRADE-DATAS-03 — "Todos os anos + Todos os meses": sem faixa, mas a dimensão continua soberana.
//   A linha só permanece se a data da dimensão for não-NULL (financeira = pagamento OU vencimento não-NULL).
function aplicarNaoNuloDimensao<Q extends { or: (f: string) => Q; not: (c: string, op: string, v: unknown) => Q }>(
  query: Q, dimensao: DimensaoDataFinanceiro,
): Q {
  switch (dimensao) {
    case 'competencia': return query.not('data_competencia', 'is', null);
    case 'vencimento':  return query.not('data_vencimento', 'is', null);
    case 'pagamento':   return query.not('data_pagamento', 'is', null);
    case 'financeira':
    default:            return query.or('data_pagamento.not.is.null,data_vencimento.not.is.null');
  }
}

// PR-FIN-GRADE-DATAS-03 — data da dimensão para um lançamento (client-side). 'financeira' = COALESCE.
export function dataDaDimensao(l: LancamentoV2, dimensao: DimensaoDataFinanceiro): string | null {
  switch (dimensao) {
    case 'competencia': return l.data_competencia ?? null;
    case 'vencimento':  return l.data_vencimento ?? null;
    case 'pagamento':   return l.data_pagamento ?? null;
    case 'financeira':
    default:            return l.data_pagamento ?? l.data_vencimento ?? null;
  }
}

// Resíduo client-side APENAS para "Todos os anos + meses específicos": "mês em qualquer ano" não é
//   expressável como faixa contínua. Usa a data da dimensão selecionada; linhas sem essa data ficam fora.
function residualDimensaoTodosAnos(filtros: FiltrosV2): ((l: LancamentoV2) => boolean) | null {
  const isTodosAnos = !filtros.ano || filtros.ano === '__todos__';
  const meses = mesesDoRecorte(filtros);
  if (!isTodosAnos || meses.length === 0) return null;
  const dimensao = filtros.dimensao ?? 'financeira';
  const set = new Set(meses.map(m => m.padStart(2, '0')));
  return (l) => { const d = dataDaDimensao(l, dimensao); return !!d && set.has(d.substring(5, 7)); };
}

export function useFinanceiroV2(pageSize: number = DEFAULT_PAGE_SIZE) {
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id;

  const [lancamentos, setLancamentos] = useState<LancamentoV2[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancariaV2[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorV2[]>([]);
  const [classificacoes, setClassificacoes] = useState<ClassificacaoItem[]>([]);
  const [safras, setSafras] = useState<Safra[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = pageSize;

  const loadContas = useCallback(async () => {
    if (!clienteId) return;
    const { data } = await supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, banco, fazenda_id, tipo_conta, codigo_conta, nome_exibicao, agencia, numero_conta, conta_digito')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao');
    setContasBancarias((data as ContaBancariaV2[]) || []);
  }, [clienteId]);

  const loadFornecedores = useCallback(async () => {
    if (!clienteId) return;
    // Fetch ALL fornecedores (active + inactive) for name resolution in listings
    // Inactive suppliers must still appear in historical lancamentos
    const all: FornecedorV2[] = [];
    const batchSize = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome, cpf_cnpj, fazenda_id, ativo, tipo_recebimento, pix_tipo_chave, pix_chave, banco, agencia, conta, tipo_conta, cpf_cnpj_pagamento, nome_favorecido, observacao_pagamento')
        .eq('cliente_id', clienteId)
        .order('nome')
        .range(from, from + batchSize - 1);
      if (!data || data.length === 0) break;
      all.push(...(data as FornecedorV2[]));
      if (data.length < batchSize) break;
      from += batchSize;
    }
    setFornecedores(all);
  }, [clienteId]);

  // PR-FORNECEDOR-FAZENDA-01: fazenda é OPCIONAL — fornecedor é entidade do cliente.
  // fazendaId null vai como null (NUNCA ''); lookups são por cliente_id+nome (sem fazenda).
  const criarFornecedor = useCallback(async (nome: string, fazendaId: string | null, cpfCnpj?: string) => {
    if (!clienteId) return null;
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, fazenda_id: fazendaId, nome, cpf_cnpj: cpfCnpj || null })
      .select('id, nome, cpf_cnpj, fazenda_id')
      .single();
    if (error) {
      reportarErro(error, 'criarFornecedor', toast.error);
      return null;
    }
    setFornecedores(prev => [...prev, data as FornecedorV2]);
    toast.success('Fornecedor criado');
    return data as FornecedorV2;
  }, [clienteId]);

  const loadClassificacoes = useCallback(async () => {
    if (!clienteId) return;

    const { loadPlanoContasCompleto, planoToClassificacoes, normalizeDividendoSubcentro } = await import('@/lib/financeiro/planoContasBuilder');
    const plano = await loadPlanoContasCompleto(clienteId);
    const planoCls = planoToClassificacoes(plano);

    // Enrich with distinct classification combos from actual lancamentos
    // so legacy records (not in plano) are still filterable
    const { data: lancCls } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('subcentro, centro_custo, grupo_custo, macro_custo, tipo_operacao, escopo_negocio')
      .eq('cliente_id', clienteId)
      .eq('cancelado', false)
      .not('subcentro', 'is', null);

    if (lancCls && lancCls.length > 0) {
      // Build set of canonical subcentros already in plano
      const planoSubcentros = new Set(planoCls.map(c => c.subcentro));
      const seen = new Set<string>();
      for (const l of lancCls) {
        if (!l.subcentro) continue;
        // Normalize legacy dividendo names to canonical form
        const canonical = normalizeDividendoSubcentro(l.subcentro) || l.subcentro;
        if (planoSubcentros.has(canonical) || seen.has(canonical)) continue;
        seen.add(canonical);
        planoCls.push({
          subcentro: canonical,
          centro_custo: l.centro_custo || '',
          grupo_custo: l.grupo_custo || '',
          macro_custo: l.macro_custo || '',
          tipo_operacao: l.tipo_operacao || '',
          escopo_negocio: l.escopo_negocio || '',
        });
      }
    }

    setClassificacoes(planoCls);
  }, [clienteId]);

  const loadSafras = useCallback(async () => {
    if (!clienteId) return;
    // types.ts ainda não conhece financeiro_safras (regen separado pós-PR-254).
    // UM cast local no queryBuilder, mesmo padrão dos `insert(row as any)`
    // já presentes neste hook para financeiro_lancamentos_v2.
    const { data } = await (supabase as any).from('financeiro_safras')
      .select('id, nome, descricao, ativa')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao', { ascending: true })
      .order('nome', { ascending: true });
    setSafras((data as Safra[]) || []);
  }, [clienteId]);

  const buildLancamentosQuery = useCallback((filtros: FiltrosV2) => {
    let query = supabase
      .from('financeiro_lancamentos_v2')
      .select('*')
      .eq('cliente_id', clienteId!)
      .eq('cancelado', false)
      .neq('status_transacao', 'conciliado')
      .neq('cenario', 'meta');

    if (filtros.fazenda_id) {
      query = query.eq('fazenda_id', filtros.fazenda_id);
    }

    // PR-FIN-GRADE-DATAS-03 — recorte temporal pela DIMENSÃO selecionada (default 'financeira' =
    //   COALESCE(data_pagamento, data_vencimento), contrato de PR-FIN-OC-CONTRATO-01), NUNCA por ano_mes.
    //   Faixas [1º dia, 1º dia do mês/ano seguinte) via ramoDimensao (OR server-side). Linha sem a data da
    //   dimensão → fora de qualquer faixa. "Todos os anos + meses" é resíduo client-side em
    //   fetchAllLancamentos (mês em qualquer ano não é faixa contínua); "Todos os anos + todos os meses"
    //   mantém a dimensão soberana exigindo a data não-NULL (aplicarNaoNuloDimensao).
    const dimensao: DimensaoDataFinanceiro = filtros.dimensao ?? 'financeira';
    const isTodosAnos = !filtros.ano || filtros.ano === '__todos__';
    const mesesRecorte = mesesDoRecorte(filtros);

    if (isTodosAnos) {
      if (mesesRecorte.length === 0) {
        // Todos os anos + todos os meses: sem faixa, mas a dimensão continua soberana (exige data não-NULL).
        query = aplicarNaoNuloDimensao(query, dimensao);
      }
      // Todos os anos + meses específicos: resíduo client-side (mês em qualquer ano) em fetchAllLancamentos.
    } else if (mesesRecorte.length > 0) {
      const anoNum = Number(filtros.ano);
      const faixas = mesesRecorte.map(m => faixaMes(anoNum, Number(m)));
      query = query.or(faixas.map(([ini, fim]) => ramoDimensao(dimensao, ini, fim)).join(','));
    } else {
      const anoNum = Number(filtros.ano);
      query = query.or(ramoDimensao(dimensao, `${anoNum}-01-01`, `${anoNum + 1}-01-01`));
    }

    const contaOrigemId = filtros.conta_bancaria_id?.trim();
    const contaDestinoId = filtros.conta_destino_id?.trim();

    if (contaOrigemId && contaDestinoId) {
      query = query
        .eq('tipo_operacao', '3-Transferências')
        .eq('conta_bancaria_id', contaOrigemId)
        .eq('conta_destino_id', contaDestinoId);
    } else {
      if (contaOrigemId) {
        query = query.eq('conta_bancaria_id', contaOrigemId);
      }
      if (contaDestinoId) {
        query = query.eq('conta_destino_id', contaDestinoId);
      }
      if (filtros.tipo_operacao) query = query.eq('tipo_operacao', filtros.tipo_operacao);
    }

    // PR-FIN-STATUS-UX-03A-1 — filtro Status multisseleção: cada opção mapeia 1:1 ao valor persistido
    //   (previsto/agendado/programado/realizado e o legado 'meta'). Vazio/ausente = Todos (sem restrição
    //   de status). A exclusão estrutural `.neq('conciliado')` (acima) permanece intocada.
    if (filtros.status_transacoes && filtros.status_transacoes.length > 0) {
      // PR-FIN-V2-STATUS-01 — 'conciliado' é DERIVADO (conciliado_em != null), não um status_transacao.
      //   Separa os status reais do filtro derivado; combina com OR quando ambos presentes.
      const temConciliado = filtros.status_transacoes.includes('conciliado');
      const statusReais = filtros.status_transacoes.filter(s => s !== 'conciliado');
      if (temConciliado && statusReais.length > 0) {
        query = query.or(`status_transacao.in.(${statusReais.join(',')}),conciliado_em.not.is.null`);
      } else if (temConciliado) {
        query = query.not('conciliado_em', 'is', null);
      } else {
        query = query.in('status_transacao', statusReais);
      }
    }
    if (filtros.macro_custo) query = query.eq('macro_custo', filtros.macro_custo);
    if (filtros.grupo_custo) query = query.eq('grupo_custo', filtros.grupo_custo);
    if (filtros.centro_custo) query = query.eq('centro_custo', filtros.centro_custo);
    if (filtros.subcentro) query = query.eq('subcentro', filtros.subcentro);

    return query;
  }, [clienteId]);

  const fetchAllLancamentos = useCallback(async (filtros: FiltrosV2): Promise<LancamentoV2[]> => {
    if (!clienteId) return [];

    const all: LancamentoV2[] = [];
    let from = 0;
    const batchSize = 1000;
    // PR-FIN-GRADE-DATAS-03 — resíduo pela data da dimensão só para "Todos os anos + meses" (ver hook util).
    const residual = residualDimensaoTodosAnos(filtros);

    while (true) {
      const { data, error } = await buildLancamentosQuery(filtros)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      const mapped = data as LancamentoV2[];

      // Instrumentação de '3-Transferências'. Antes despejava, POR LINHA e em
      // duas passadas, `id`, `conta_bancaria_id` e `conta_destino_id` — UUID de
      // lançamento e de conta bancária no console do navegador, em produção.
      // As duas passadas imprimiam os MESMOS objetos (`mapped` é `data` com
      // outro tipo), então uma delas era pura duplicação.
      // Sobra o agregado, que preserva o sinal investigado — transferência sem
      // conta de destino — sem identificar registro nenhum.
      const transferencias = mapped.filter((r) => r.tipo_operacao === '3-Transferências');
      if (transferencias.length > 0) {
        const semDestino = transferencias.filter((r) => !r.conta_destino_id).length;
        console.log(
          `[FinV2] load: ${transferencias.length} transferência(s), ${semDestino} sem conta_destino_id`,
        );
      }

      all.push(...(residual ? mapped.filter(residual) : mapped));
      if (data.length < batchSize) break;
      from += batchSize;
    }

    return all;
  }, [buildLancamentosQuery, clienteId]);

  const loadLancamentos = useCallback(async (filtros: FiltrosV2, pageNum: number = 0) => {
    if (!clienteId) return;
    // ano is optional now ('__todos__' means all years)

    setLoading(true);
    try {
      const data = await fetchAllLancamentos(filtros);
      setLancamentos(data);
      setTotal(data.length);
      setPage(pageNum);
    } catch (err: any) {
      reportarErro(err, 'carregarLancamentos', toast.error);
    } finally {
      setLoading(false);
    }
  }, [clienteId, PAGE_SIZE]);

  /** Fetch ALL lancamentos matching filters (no pagination) — used for export */
  const loadAllForExport = useCallback(async (filtros: FiltrosV2): Promise<LancamentoV2[]> => {
    try {
      return await fetchAllLancamentos(filtros);
    } catch (error) {
      // Comportamento preservado: falha de export não emite toast aqui.
      // Só o log deixa de despejar o objeto bruto.
      console.error(normalizarErro(error, 'loadAllForExport').diagnostico);
      return [];
    }
  }, [fetchAllLancamentos]);

  /** Derive escopo_negocio from official plano de contas (no keyword heuristic) */
  const deriveEscopoFromSubcentro = useCallback((subcentroValue: string | undefined | null): string | null => {
    if (!subcentroValue) return null;
    const cls = classificacoes.find(c => c.subcentro === subcentroValue);
    if (!cls) return null;
    return cls.escopo_negocio || null;
  }, [classificacoes]);

  const buildInsertRow = (form: LancamentoV2Form, userId: string, origem: string = 'manual') => {
    const anoMes = form.data_pagamento
      ? form.data_pagamento.substring(0, 7)
      : form.data_competencia.substring(0, 7);
    const sinal = (form.tipo_operacao || '').startsWith('1') ? 1 : -1;

    // Auto-derive escopo_negocio from plano de contas if not explicitly set
    const escopo = form.escopo_negocio || deriveEscopoFromSubcentro(form.subcentro) || null;

    return {
      cliente_id: clienteId!,
      fazenda_id: form.fazenda_id,
      conta_bancaria_id: form.conta_bancaria_id || null,
      conta_destino_id: form.conta_destino_id || null,
      data_competencia: form.data_competencia,
      data_vencimento: form.data_vencimento || null,   // PR-FIN-MODAL-VENCIMENTO-02B — grava o vencimento; nunca em data_pagamento
      data_pagamento: form.data_pagamento || null,
      valor: form.valor,
      sinal,
      tipo_operacao: form.tipo_operacao,
      status_transacao: form.status_transacao || STATUS_FINANCEIRO_INICIAL,   // PR-FIN-STATUS-UX-03A-1 — novo nasce 'previsto' (era 'meta')
      descricao: form.descricao || null,
      macro_custo: form.macro_custo || null,
      centro_custo: form.centro_custo || null,
      subcentro: form.subcentro || null,
      escopo_negocio: escopo,
      observacao: form.observacao || null,
      numero_documento: form.numero_documento || null,
      tipo_documento: form.tipo_documento || null,
      favorecido_id: form.favorecido_id || null,
      forma_pagamento: form.forma_pagamento || null,
      dados_pagamento: form.dados_pagamento || null,
      ano_mes: anoMes,
      origem_lancamento: origem,
      created_by: userId,
      sem_movimentacao_caixa: false,
      safra_id: form.safra_id || null,
    };
  };

  const criarLancamento = useCallback(async (form: LancamentoV2Form) => {
    if (!clienteId || !user) return false;

    const row = buildInsertRow(form, user.id);
    const { error } = await supabase.from('financeiro_lancamentos_v2').insert(row as any);

    if (error) {
      reportarErro(error, 'criarLancamento', toast.error);
      return false;
    }
    toast.success('Lançamento criado');
    return true;
  }, [clienteId, user]);

  /**
   * Versão-irmã de criarLancamento que retorna o ID do lançamento criado
   * (em vez de boolean). Não compartilha throws com criarLancamento.
   * Use quando precisar do ID para criar um vínculo subsequente (ex.: a
   * partir de movimento OFX, conciliacao_bancaria_itens).
   */
  const criarLancamentoComId = useCallback(async (
    form: LancamentoV2Form,
    opts?: { origem?: string; silent?: boolean },
  ): Promise<string | null> => {
    if (!clienteId || !user) return null;

    // PR-B — trava de intake: vias secundárias deferem a um OFX equivalente já existente
    // (mesma movimentação: cliente, conta, data, |valor|, sinal). Não cria duplicata;
    // retorna o id do OFX p/ o caller parear. NÃO afeta ofx/manual/movimentacao_rebanho/etc.
    const ORIGENS_DEFEREM_A_OFX = new Set(['mesa_excel', 'referencia_operacional', 'excel']);

    const origemAtual = opts?.origem ?? 'manual';
    if (ORIGENS_DEFEREM_A_OFX.has(origemAtual)) {
      const sinalChk = (form.tipo_operacao || '').startsWith('1') ? 1 : -1;
      const vChk = Math.abs(Number(form.valor) || 0);
      let q = supabase
        .from('financeiro_lancamentos_v2')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .eq('origem_lancamento', 'ofx')
        .eq('sinal', sinalChk)
        .eq('data_pagamento', form.data_pagamento)
        .gte('valor', vChk - 0.01).lte('valor', vChk + 0.01);
      q = form.conta_bancaria_id
        ? q.eq('conta_bancaria_id', form.conta_bancaria_id)
        : q.eq('conta_destino_id', form.conta_destino_id ?? '');
      const { data: jaExisteOfx } = await q.limit(1).maybeSingle();
      if (jaExisteOfx?.id) {
        if (!opts?.silent) toast.info('Movimento já lançado via OFX — pareado, não duplicado.');
        return jaExisteOfx.id as string;
      }
    }

    const row = buildInsertRow(form, user.id, opts?.origem ?? 'manual');
    const { data, error } = await supabase
      .from('financeiro_lancamentos_v2')
      .insert(row as any)
      .select('id')
      .single();

    if (error) {
      // `silent` suprime o toast, nunca o diagnóstico: o console continua registrando.
      reportarErro(error, 'criarLancamentoComId', opts?.silent ? () => {} : toast.error);
      return null;
    }
    if (!opts?.silent) toast.success('Lançamento criado');
    return data?.id ?? null;
  }, [clienteId, user]);

  const editarLancamento = useCallback(async (id: string, form: LancamentoV2Form) => {
    if (!clienteId || !user) return false;

    // PR-SAFE-0 — proteção de títulos originados da Operação Comercial. Detecção
    //   ESTRUTURAL (marcador de proveniência persistido + vínculo reverso em
    //   zoo_operacao_partes), nunca por texto de UI. Campos que compõem a obrigação
    //   são preservados; tentativa de alteração estrutural é recusada de forma observável.
    {
      const { data: atual, error: loadErr } = await (supabase as any)
        .from('financeiro_lancamentos_v2')
        .select('origem_lancamento, origem_tipo, valor, favorecido_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, data_competencia')
        .eq('id', id)
        .maybeSingle();
      if (loadErr || !atual) {
        // Sem erro do banco e sem linha: registro inexistente ou fora do escopo.
        // Nesse caso a mensagem original é preservada — já era segura.
        reportarErro(
          loadErr ?? new ErroUsuarioSeguro('Erro ao carregar o lançamento para edição'),
          'editarLancamento.load',
          toast.error,
        );
        return false;
      }
      let vinculoOC = false;
      if (!isTituloOC(atual)) {
        const { data: parteVinc } = await (supabase as any)
          .from('zoo_operacao_partes')
          .select('id')
          .eq('financeiro_lancamento_id', id)
          .limit(1)
          .maybeSingle();
        vinculoOC = !!parteVinc?.id;
      }

      if (isTituloOC(atual, vinculoOC)) {
        // Recusa OBSERVÁVEL de alteração de campos estruturais (compõem a obrigação).
        const viol = detectarViolacoesEstruturaisOC(form, atual);
        if (viol.length > 0) {
          toast.error(`Título da Operação Comercial: ${viol.join(', ')} não pode ser editado aqui. Ajuste pela Operação Comercial.`);
          return false;
        }

        // Payload RESTRITO — só campos permitidos; estruturais preservados por OMISSÃO
        //   (valor, classificação, tipo/sinal, origem, data_competencia e ano_mes da OC NÃO são
        //   tocados). data_pagamento e status_transacao permanecem editáveis.
        //   PR-OC-FIN-EDIT-FIX-01 — favorecido_id passa a ser editável (favorecido financeiro do
        //   título, distinto da contraparte comercial; o vínculo OC é por parte, não por favorecido).
        const restrito: Record<string, unknown> = {
          conta_bancaria_id: form.conta_bancaria_id || null,
          conta_destino_id: form.conta_destino_id || null,
          favorecido_id: form.favorecido_id || null,
          data_pagamento: form.data_pagamento || null,
          descricao: form.descricao || null,
          observacao: form.observacao || null,
          numero_documento: form.numero_documento || null,
          tipo_documento: form.tipo_documento || null,
          forma_pagamento: form.forma_pagamento || null,
          dados_pagamento: form.dados_pagamento || null,
          editado_manual: true,
          updated_by: user.id,
        };
        if (form.status_transacao) restrito.status_transacao = form.status_transacao;

        const { error } = await (supabase as any).from('financeiro_lancamentos_v2').update(restrito).eq('id', id);
        if (error) {
          reportarErro(error, 'editarLancamento.OC', toast.error);
          return false;
        }
        toast.success('Lançamento atualizado');
        return true;
      }
    }

    const anoMes = form.data_pagamento
      ? form.data_pagamento.substring(0, 7)
      : form.data_competencia.substring(0, 7);
    const sinal = (form.tipo_operacao || '').startsWith('1') ? 1 : -1;

    // Auto-derive escopo_negocio from plano de contas if not explicitly set
    const escopo = form.escopo_negocio || deriveEscopoFromSubcentro(form.subcentro) || null;

    // Resolve full hierarchy from plano de contas based on subcentro
    let resolvedMacro = form.macro_custo || null;
    let resolvedGrupo = form.grupo_custo || null;
    let resolvedCentro = form.centro_custo || null;
    const resolvedSubcentro = form.subcentro || null;

    if (resolvedSubcentro && classificacoes.length > 0) {
      // Try to resolve from plano de contas
      const match = classificacoes.find(c => c.subcentro === resolvedSubcentro);
      if (match) {
        resolvedMacro = match.macro_custo || resolvedMacro;
        resolvedGrupo = match.grupo_custo || resolvedGrupo;
        resolvedCentro = match.centro_custo || resolvedCentro;
      }
    }

    const updatePayload = {
      fazenda_id: form.fazenda_id,
      conta_bancaria_id: form.conta_bancaria_id || null,
      conta_destino_id: form.conta_destino_id || null,
      data_competencia: form.data_competencia,
      data_vencimento: form.data_vencimento || null,   // PR-FIN-MODAL-VENCIMENTO-02B — grava o vencimento; nunca em data_pagamento
      data_pagamento: form.data_pagamento || null,
      valor: form.valor,
      sinal,
      tipo_operacao: form.tipo_operacao,
      status_transacao: form.status_transacao || STATUS_FINANCEIRO_INICIAL,   // PR-FIN-STATUS-UX-03A-1 — novo nasce 'previsto' (era 'meta')
      descricao: form.descricao || null,
      macro_custo: resolvedMacro,
      grupo_custo: resolvedGrupo,
      centro_custo: resolvedCentro,
      subcentro: resolvedSubcentro,
      escopo_negocio: escopo,
      observacao: form.observacao || null,
      numero_documento: form.numero_documento || null,
      tipo_documento: form.tipo_documento || null,
      favorecido_id: form.favorecido_id || null,
      forma_pagamento: form.forma_pagamento || null,
      dados_pagamento: form.dados_pagamento || null,
      ano_mes: anoMes,
      editado_manual: true,
      updated_by: user.id,
      safra_id: form.safra_id || null,
    };

    // Antes imprimia `id` e os dois `conta_destino_id` — UUIDs. O que a
    // instrumentação investigava era se o destino sobrevive do form ao payload;
    // isso é presença, não identidade. `tipo_operacao` é literal de enum nosso.
    console.log(
      `[FinV2] editarLancamento: tipo=${form.tipo_operacao}`
      + ` destino_no_form=${!!form.conta_destino_id}`
      + ` destino_no_payload=${!!updatePayload.conta_destino_id}`,
    );

    const { error } = await supabase.from('financeiro_lancamentos_v2').update(updatePayload as any).eq('id', id);

    if (error) {
      reportarErro(error, 'editarLancamento', toast.error);
      return false;
    }

    // Post-save verification
    const { data: verify } = await supabase.from('financeiro_lancamentos_v2')
      .select('id, conta_destino_id, conta_bancaria_id, tipo_operacao')
      .eq('id', id)
      .single();
    // Antes imprimia a linha inteira relida do banco (id + duas contas, todos
    // UUID). O objetivo era confirmar que o destino persistiu — booleano basta.
    console.log(
      `[FinV2] POST-SAVE VERIFY: linha=${!!verify} destino_persistido=${!!verify?.conta_destino_id}`,
    );

    // PR4 — sync best-effort dos vínculos de conciliação bancária.
    // Se o novo valor do lançamento bate EXATO (±0.01) com o OFX vinculado,
    // atualiza valor_aplicado e recomputa status do extrato. Caso Allianz:
    // operador corrige Hilux 1.108,37 → 1.126,30 e o badge "Parcial" da lista
    // some sem ação adicional. Falha aqui NÃO bloqueia o save do lançamento.
    try {
      const valorAbs = Math.abs(Number(form.valor) || 0);
      await sincronizarVinculosDoLancamento(id, valorAbs);
    } catch (syncErr) {
      // Falha best-effort: não bloqueia o save. Só o diagnóstico sanitizado.
      console.warn(normalizarErro(syncErr, 'sincronizarVinculosDoLancamento').diagnostico);
    }

    toast.success('Lançamento atualizado');
    return true;
  }, [clienteId, user, classificacoes]);

  const excluirLancamento = useCallback(async (id: string) => {
    // PR-STATUS-SYNC-01: ANTES de cancelar, coletar os extratos com vínculo ATIVO
    // deste lançamento (após o cancelamento o trigger trg_cbi_desfazer_on_cancelamento
    // desfaz os cbi, e ninguém recomputa o status neste caminho).
    const { data: vincAntes } = await supabase
      .from('conciliacao_bancaria_itens' as any)
      .select('extrato_id')
      .eq('lancamento_id', id)
      .is('desfeito_em', null);
    const extratoIds = Array.from(new Set(
      ((vincAntes as unknown as { extrato_id: string }[]) ?? []).map((v) => v.extrato_id),
    ));

    // Universal soft delete: mark as cancelled regardless of origin
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({
        cancelado: true,
        cancelado_em: new Date().toISOString(),
        cancelado_por: user?.id ?? null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq('id', id);

    if (error) {
      reportarErro(error, 'excluirLancamento', toast.error);
      return false;
    }

    // PR-STATUS-SYNC-01: trigger desfez os cbi → recomputar status de cada extrato
    // afetado (uma vez cada; o recompute soma só vínculos vivos).
    for (const extratoId of extratoIds) {
      await recomputarStatusExtrato(extratoId);
    }

    toast.success('Lançamento excluído com sucesso');
    return true;
  }, [user]);

  const excluirLancamentosEmLote = useCallback(async (ids: string[]): Promise<{ excluidos: number; bloqueados: string[] }> => {
    if (ids.length === 0) return { excluidos: 0, bloqueados: [] };

    // PR-STATUS-SYNC-01: acumula os extratos com vínculo ATIVO dos lançamentos-alvo,
    // DEDUPLICADOS (recompute uma vez por extrato ao final, mesmo com dezenas de
    // lançamentos do mesmo extrato no lote).
    const extratosAfetados = new Set<string>();

    // Universal soft delete in batches of 100 - no origin-based blocking
    let totalExcluidos = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);

      // coletar ANTES do cancelamento deste batch (depois o trigger desfaz os cbi)
      const { data: vincAntes } = await supabase
        .from('conciliacao_bancaria_itens' as any)
        .select('extrato_id')
        .in('lancamento_id', batch)
        .is('desfeito_em', null);
      for (const v of ((vincAntes as unknown as { extrato_id: string }[]) ?? [])) {
        extratosAfetados.add(v.extrato_id);
      }

      const { error } = await supabase
        .from('financeiro_lancamentos_v2')
        .update({
          cancelado: true,
          cancelado_em: new Date().toISOString(),
          cancelado_por: user?.id ?? null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .in('id', batch);

      if (error) {
        // `break` preservado: as fatias anteriores JÁ foram excluídas e
        // `totalExcluidos` continua refletindo o parcial real.
        reportarErro(error, `excluirEmLote[offset=${i}]`, toast.error);
        break;
      }
      totalExcluidos += batch.length;
    }

    // PR-STATUS-SYNC-01: recomputar status de cada extrato afetado, UMA vez.
    for (const extratoId of extratosAfetados) {
      await recomputarStatusExtrato(extratoId);
    }

    return { excluidos: totalExcluidos, bloqueados: [] };
  }, [user]);

  /** Cancel (soft-delete) imported "realizado" lancamentos matching filters */
  const cancelarRealizadosImportados = useCallback(async (filtros: FiltrosV2): Promise<{ cancelados: number }> => {
    if (!clienteId) return { cancelados: 0 };

    // Fetch all matching the filters
    const all = await fetchAllLancamentos(filtros);

    // Filter: only realizado + imported (has lote_importacao_id)
    const alvo = all.filter(l =>
      l.status_transacao === 'realizado' &&
      !!l.lote_importacao_id &&
      !l.cancelado
    );

    if (alvo.length === 0) return { cancelados: 0 };

    let totalCancelados = 0;
    for (let i = 0; i < alvo.length; i += 100) {
      const batch = alvo.slice(i, i + 100).map(l => l.id);
      const { error } = await supabase
        .from('financeiro_lancamentos_v2')
        .update({ cancelado: true, cancelado_em: new Date().toISOString() } as any)
        .in('id', batch);
      if (error) {
        reportarErro(error, `cancelarEmLote[offset=${i}]`, toast.error);
        break;
      }
      totalCancelados += batch.length;
    }

    return { cancelados: totalCancelados };
  }, [clienteId, fetchAllLancamentos]);

  /**
   * PR-FIN-V2-AÇÕES-LOTE-01 — marca múltiplos lançamentos como 'realizado' em lote,
   * gravando a `data_pagamento` de cada item. Espelha o caminho de escrita do editar
   * single (status_transacao + data_pagamento + editado_manual/updated_by); NÃO toca
   * classificação, valor nem campos estruturais. Sem RPC/migration.
   *
   * A elegibilidade (previsto/agendado/programado, não conciliado/cancelado, conta OK)
   * é decidida no chamador (FinanceiroV2Tab); aqui só se aplica a lista já filtrada.
   * Itens podem trazer datas distintas (modo "usar vencimento"), então agrupa por
   * `data_pagamento` e emite um UPDATE por grupo. Item sem data é ignorado (realizado
   * exige data de pagamento).
   */
  const marcarRealizadoEmLote = useCallback(async (
    itens: { id: string; data_pagamento: string }[],
  ): Promise<{ atualizados: number }> => {
    if (!clienteId || !user || itens.length === 0) return { atualizados: 0 };

    const grupos = new Map<string, string[]>();
    for (const it of itens) {
      if (!it.data_pagamento) continue;
      const arr = grupos.get(it.data_pagamento);
      if (arr) arr.push(it.id);
      else grupos.set(it.data_pagamento, [it.id]);
    }

    let atualizados = 0;
    for (const [dataPgto, ids] of grupos) {
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const payload: Record<string, unknown> = {
          status_transacao: 'realizado',
          data_pagamento: dataPgto,
          editado_manual: true,
          updated_by: user.id,
        };
        const { error } = await (supabase as any)
          .from('financeiro_lancamentos_v2')
          .update(payload)
          .in('id', batch);
        if (error) {
          // `atualizados` devolve o parcial já persistido — não zerar.
          reportarErro(error, 'marcarRealizadoEmLote', toast.error);
          return { atualizados };
        }
        atualizados += batch.length;
      }
    }

    return { atualizados };
  }, [clienteId, user]);

  /** Cancel migration records for a specific year */
  const cancelarMigracao = useCallback(async (ano: string): Promise<{ cancelados: number; restantes: { origem: string; qtd: number }[] }> => {
    if (!clienteId) return { cancelados: 0, restantes: [] };

    // Fetch IDs of migration+realizado records for the year
    let allIds: string[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id')
        .eq('cliente_id', clienteId)
        .like('ano_mes', `${ano}-%`)
        .eq('cancelado', false)
        .eq('origem_lancamento', 'migracao')
        .eq('status_transacao', 'realizado')
        .range(from, from + PAGE - 1);
      if (error) { console.error(normalizarErro(error, 'listarMigracaoParaCancelar').diagnostico); break; }
      if (!data || data.length === 0) break;
      allIds = allIds.concat(data.map(d => d.id));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allIds.length === 0) return { cancelados: 0, restantes: [] };

    let totalCancelados = 0;
    for (let i = 0; i < allIds.length; i += 200) {
      const batch = allIds.slice(i, i + 200);
      const { error } = await supabase
        .from('financeiro_lancamentos_v2')
        .update({ cancelado: true, cancelado_em: new Date().toISOString() } as any)
        .in('id', batch);
      if (error) {
        reportarErro(error, `cancelarMigracaoEmLote[offset=${i}]`, toast.error);
        break;
      }
      totalCancelados += batch.length;
    }

    // Fetch remaining records summary
    const { data: remaining } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('origem_lancamento')
      .eq('cliente_id', clienteId)
      .like('ano_mes', `${ano}-%`)
      .eq('cancelado', false);

    const countByOrigem: Record<string, number> = {};
    (remaining || []).forEach((r: any) => {
      countByOrigem[r.origem_lancamento] = (countByOrigem[r.origem_lancamento] || 0) + 1;
    });
    const restantes = Object.entries(countByOrigem).map(([origem, qtd]) => ({ origem, qtd }));

    return { cancelados: totalCancelados, restantes };
  }, [clienteId]);

  const duplicarLancamento = useCallback(async (lanc: LancamentoV2) => {
    if (!clienteId || !user) return false;

    const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
      cliente_id: clienteId,
      fazenda_id: lanc.fazenda_id,
      conta_bancaria_id: lanc.conta_bancaria_id,
      conta_destino_id: lanc.conta_destino_id,
      data_competencia: lanc.data_competencia,
      data_pagamento: lanc.data_pagamento,
      valor: lanc.valor,
      sinal: lanc.sinal,
      tipo_operacao: lanc.tipo_operacao,
      status_transacao: STATUS_FINANCEIRO_INICIAL,   // PR-FIN-STATUS-UX-03A-1 — cópia nasce 'previsto' (era 'meta')
      descricao: lanc.descricao ? `(Cópia) ${lanc.descricao}` : '(Cópia)',
      macro_custo: lanc.macro_custo,
      centro_custo: lanc.centro_custo,
      subcentro: lanc.subcentro,
      escopo_negocio: lanc.escopo_negocio,
      observacao: lanc.observacao,
      numero_documento: lanc.numero_documento,
      tipo_documento: (lanc as any).tipo_documento,
      favorecido_id: lanc.favorecido_id,
      forma_pagamento: lanc.forma_pagamento,
      dados_pagamento: lanc.dados_pagamento,
      ano_mes: lanc.ano_mes,
      origem_lancamento: 'manual',
      created_by: user.id,
      sem_movimentacao_caixa: false,
    });

    if (error) {
      reportarErro(error, 'duplicarLancamento', toast.error);
      return false;
    }
    toast.success('Lançamento duplicado');
    return true;
  }, [clienteId, user]);

  const criarLancamentosEmLote = useCallback(async (forms: LancamentoV2Form[]) => {
    if (!clienteId || !user || forms.length === 0) return false;

    const rows = forms.map(form => buildInsertRow(form, user.id));

    // CONTRATO (não alterar sem revisar o toast de sucesso abaixo): um único
    // statement INSERT com N linhas é ATÔMICO — ou todas entram, ou nenhuma
    // entra e `error` vem preenchido. Não existe sucesso parcial aqui, e por
    // isso `${forms.length} lançamentos salvos` é um número confiável.
    const { error } = await supabase.from('financeiro_lancamentos_v2').insert(rows as any);

    if (error) {
      // Antes: `Erro ao salvar lote: ${error.message}` — despejava a mensagem
      // crua do PostgREST na tela (nome de constraint, SQL, valor da coluna).
      reportarErro(error, 'criarLancamentosEmLote', toast.error);
      return false;
    }
    toast.success(`${forms.length} lançamentos salvos`);
    return true;
  }, [clienteId, user]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Fetch distinct years from financeiro_lancamentos_v2 for the current client.
   * Fallback: range estático de 2019 até o ano atual. */
  const loadAnosDisponiveis = useCallback(async (): Promise<string[]> => {
    const currentYear = new Date().getFullYear();
    const fallback = (): string[] => {
      const arr: string[] = [];
      for (let y = currentYear; y >= 2019; y--) arr.push(String(y));
      return arr;
    };
    if (!clienteId) return fallback();

    const anos = new Set<string>();
    anos.add(String(currentYear));

    try {
      // 1) Tenta RPC oficial
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_anos_financeiro_v2' as any,
        { p_cliente_id: clienteId },
      );
      if (!rpcError && Array.isArray(rpcData)) {
        (rpcData as any[]).forEach((r: any) => {
          const a = Number(r?.ano);
          if (a && !isNaN(a)) anos.add(String(a));
        });
      }

      // 2) Garantia adicional: varre data_competencia direto da tabela
      //    (paginado para evitar limite de 1000 do Supabase)
      const PAGE = 1000;
      let from = 0;
      // Pega só min/max para evitar varrer tudo
      const { data: minRow } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('data_competencia')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .order('data_competencia', { ascending: true })
        .limit(1);
      const { data: maxRow } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('data_competencia')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .order('data_competencia', { ascending: false })
        .limit(1);
      const minY = minRow?.[0]?.data_competencia ? Number(String(minRow[0].data_competencia).substring(0, 4)) : null;
      const maxY = maxRow?.[0]?.data_competencia ? Number(String(maxRow[0].data_competencia).substring(0, 4)) : null;
      if (minY && maxY && !isNaN(minY) && !isNaN(maxY)) {
        for (let y = minY; y <= maxY; y++) anos.add(String(y));
      }

      if (anos.size <= 1) {
        // Nada relevante encontrado → fallback estático
        return fallback();
      }
      return Array.from(anos).sort((a, b) => Number(b) - Number(a));
    } catch (e) {
      console.warn(normalizarErro(e, 'loadAnosDisponiveis').diagnostico + ' — usando fallback estático');
      return fallback();
    }
  }, [clienteId]);

  // PR-VENDA-V2-FINVINC-ABRIR-POR-LANCAMENTO-B1: busca direta por id, sem
  // depender de filtros/paginação da lista. Read-only.
  const buscarLancamentoPorId = useCallback(
    async (id: string): Promise<LancamentoV2 | null> => {
      const { data, error } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) return null;
      return data as LancamentoV2;
    },
    [],
  );

  return {
    lancamentos,
    contasBancarias,
    fornecedores,
    classificacoes,
    safras,
    loading,
    total,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    loadContas,
    loadFornecedores,
    loadClassificacoes,
    buscarLancamentoPorId,
    loadSafras,
    criarFornecedor,
    loadLancamentos,
    loadAllForExport,
    criarLancamento,
    criarLancamentoComId,
    criarLancamentosEmLote,
    editarLancamento,
    excluirLancamento,
    excluirLancamentosEmLote,
    marcarRealizadoEmLote,
    duplicarLancamento,
    cancelarRealizadosImportados,
    cancelarMigracao,
    loadAnosDisponiveis,
    setPage,
  };
}
