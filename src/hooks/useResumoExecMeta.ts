/**
 * useResumoExecMeta
 *
 * Hook dedicado ao Modal de Resumo Executivo / Aprovação do Cenário META.
 * Carrega dados consolidados (planejamento, lançamentos do ano anterior,
 * saldos, financiamentos, zootécnico META/Real) sem reaproveitar outros hooks
 * para garantir isolamento e evitar regressões.
 *
 * TODO (produção): a policy RLS atual em meta_aprovacoes é FOR ALL TO public.
 * Antes do deploy de produção, restringir por (cliente_id, role) usando
 * políticas específicas para SELECT/INSERT/UPDATE.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Tipos ──────────────────────────────────────────────────────────────

export interface MetaVersaoRef {
  id: string;
  nome: string | null;
  created_at: string;
}

export type StatusAprovacao = 'em_revisao' | 'aprovado' | 'reprovado' | 'substituido';

export interface MetaAprovacao {
  id: string;
  cliente_id: string;
  fazenda_id: string;
  ano: number;
  versao_id: string;
  status: StatusAprovacao;
  aprovado_por: string | null;
  aprovado_email: string | null;
  aprovado_em: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumoExecMetaAlerta {
  tipo: 'critico' | 'aviso';
  mensagem: string;
}

export interface UseResumoExecMetaResult {
  loading: boolean;

  ultimaVersao: MetaVersaoRef | null;
  aprovacaoAtual: MetaAprovacao | null;
  statusAprovacao: StatusAprovacao | null;

  // Indicadores financeiros
  receitaMeta: number;
  desembolsoMeta: number;
  resultadoMeta: number;
  margemMeta: number;
  saldoInicial: number;
  saldoInicialAusente: boolean;
  saldoFinalProjetado: number;
  dividaInicial: number;
  amortizacoesMeta: number;
  jurosMeta: number;
  dividaFinalProjetada: number;

  // Comparativos com ano anterior
  financRealAnoAnterior: Map<string, number> | null;
  variacaoReceita: number | null;
  variacaoDesembolso: number | null;
  variacaoResultado: number | null;

  // DRE / agregados
  financMetaPorMacro: Map<string, number>;
  financMetaMensal: Map<string, number[]>;       // macro → [12]
  financGrupoPorMacro: Map<string, Map<string, number>>;

  // Fluxo mensal acumulado (saldo)
  fluxoMensalAcumulado: number[];                 // 12 meses

  // Zootécnico
  rebanhoInicialMeta: number;
  rebanhoFinalMeta: number;
  abatesMeta: number;
  vendasMeta: number;
  abatesMensaisMeta: number[];                    // 12 meses
  precoMedioArroba: number | null;

  rebanhoInicialReal: number | null;
  rebanhoFinalReal: number | null;
  abatesReal: number | null;
  vendasReal: number | null;

  // Validação
  alertas: ResumoExecMetaAlerta[];
  temAlertaCritico: boolean;

  aprovar: (observacao?: string) => Promise<void>;
  reload: () => void;
}

const ZERO_VAL: UseResumoExecMetaResult = {
  loading: true,
  ultimaVersao: null,
  aprovacaoAtual: null,
  statusAprovacao: null,
  receitaMeta: 0,
  desembolsoMeta: 0,
  resultadoMeta: 0,
  margemMeta: 0,
  saldoInicial: 0,
  saldoInicialAusente: false,
  saldoFinalProjetado: 0,
  dividaInicial: 0,
  amortizacoesMeta: 0,
  jurosMeta: 0,
  dividaFinalProjetada: 0,
  financRealAnoAnterior: null,
  variacaoReceita: null,
  variacaoDesembolso: null,
  variacaoResultado: null,
  financMetaPorMacro: new Map(),
  financMetaMensal: new Map(),
  financGrupoPorMacro: new Map(),
  fluxoMensalAcumulado: new Array(12).fill(0),
  rebanhoInicialMeta: 0,
  rebanhoFinalMeta: 0,
  abatesMeta: 0,
  vendasMeta: 0,
  abatesMensaisMeta: new Array(12).fill(0),
  precoMedioArroba: null,
  rebanhoInicialReal: null,
  rebanhoFinalReal: null,
  abatesReal: null,
  vendasReal: null,
  alertas: [],
  temAlertaCritico: false,
  aprovar: async () => { /* placeholder */ },
  reload: () => { /* placeholder */ },
};

function calcVar(atual: number, anterior: number | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function useResumoExecMeta(
  clienteId: string,
  fazendaId: string,
  ano: number,
): UseResumoExecMetaResult {
  const [state, setState] = useState<UseResumoExecMetaResult>(ZERO_VAL);
  const [reloadKey, setReloadKey] = useState(0);

  // Refs estáveis para evitar arrays em deps.
  const aprovarRef = useRef<(observacao?: string) => Promise<void>>(async () => { /* set abaixo */ });
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!clienteId || !fazendaId || !ano) {
      setState({ ...ZERO_VAL, loading: false });
      return;
    }

    const anoAnterior = ano - 1;
    const dezAnoAnterior = `${anoAnterior}-12`;
    const inicioAno = `${ano}-01-01`;
    const fimAno = `${ano}-12-31`;

    setState(s => ({ ...s, loading: true }));

    (async () => {
      try {
        const [
          versRes,
          aproRes,
          planMetaRes,
          finRealAntRes,
          saldoIniRes,
          parcelasRes,
          dividaRes,
          zootMetaRes,
          zootRealRes,
          precoArrobaRes,
        ] = await Promise.all([
          // A) última versão
          supabase
            .from('meta_versoes' as any)
            .select('id, nome, created_at')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', ano)
            .order('created_at', { ascending: false }).limit(1),
          // B) aprovação atual
          supabase
            .from('meta_aprovacoes' as any)
            .select('*')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', ano)
            .order('created_at', { ascending: false }).limit(1),
          // C) financeiro META
          supabase
            .from('planejamento_financeiro' as any)
            .select('macro_custo, grupo_custo, mes, valor_planejado')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', ano)
            .eq('cenario', 'meta'),
          // D) financeiro realizado ano anterior
          supabase
            .from('financeiro_lancamentos_v2')
            .select('macro_custo, valor')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId)
            .eq('cenario', 'realizado').eq('cancelado', false).eq('sem_movimentacao_caixa', false)
            .like('ano_mes', `${anoAnterior}-%`),
          // E) saldo inicial caixa
          supabase
            .from('financeiro_saldos_bancarios_v2')
            .select('saldo_final')
            .eq('cliente_id', clienteId).eq('ano_mes', dezAnoAnterior),
          // F1) parcelas do ano
          supabase
            .from('financiamento_parcelas' as any)
            .select('valor_principal, valor_juros, financiamentos!inner(cliente_id, status)')
            .eq('financiamentos.cliente_id', clienteId).eq('financiamentos.status', 'ativo')
            .gte('data_vencimento', inicioAno).lte('data_vencimento', fimAno),
          // F2) dívida inicial
          supabase
            .from('financiamentos' as any)
            .select('saldo_devedor')
            .eq('cliente_id', clienteId).eq('status', 'ativo'),
          // G) zoot META
          supabase
            .from('zoot_mensal_cache' as any)
            .select('mes, categoria_codigo, saldo_inicial, saldo_final, entradas_compra, saidas_abate, saidas_venda, peso_medio_final')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', ano).eq('cenario', 'meta'),
          // H) zoot Real ano anterior
          supabase
            .from('zoot_mensal_cache' as any)
            .select('mes, saldo_inicial, saldo_final, saidas_abate, saidas_venda')
            .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', anoAnterior).eq('cenario', 'realizado'),
          // I) preço meta arrobas
          supabase
            .from('meta_preco_mercado' as any)
            .select('preco_arroba')
            .eq('cliente_id', clienteId).eq('ano', ano),
        ]);

        if (cancelled) return;

        // ── A) versão ──
        const ultVerRow = (versRes.data as any[] | null)?.[0] ?? null;
        const ultimaVersao: MetaVersaoRef | null = ultVerRow
          ? { id: ultVerRow.id, nome: ultVerRow.nome ?? null, created_at: ultVerRow.created_at }
          : null;

        // ── B) aprovação ──
        const aprovacaoAtual = ((aproRes.data as any[] | null)?.[0] ?? null) as MetaAprovacao | null;
        const statusAprovacao = aprovacaoAtual?.status ?? null;

        // ── C) financeiro META ──
        const planMetaRows = (planMetaRes.data as any[] | null) ?? [];
        const financMetaPorMacro = new Map<string, number>();
        const financMetaMensal = new Map<string, number[]>();
        const financGrupoPorMacro = new Map<string, Map<string, number>>();
        for (const r of planMetaRows) {
          const macro = r.macro_custo || '—';
          const grupo = r.grupo_custo || '—';
          const mes = Number(r.mes);
          const valor = Number(r.valor_planejado) || 0;
          financMetaPorMacro.set(macro, (financMetaPorMacro.get(macro) || 0) + valor);
          if (!financMetaMensal.has(macro)) financMetaMensal.set(macro, new Array(12).fill(0));
          if (mes >= 1 && mes <= 12) {
            const arr = financMetaMensal.get(macro)!;
            arr[mes - 1] += valor;
          }
          if (!financGrupoPorMacro.has(macro)) financGrupoPorMacro.set(macro, new Map());
          const gMap = financGrupoPorMacro.get(macro)!;
          gMap.set(grupo, (gMap.get(grupo) || 0) + valor);
        }

        // ── D) realizado ano anterior ──
        const finRealRows = (finRealAntRes.data as any[] | null) ?? [];
        let financRealAnoAnterior: Map<string, number> | null = null;
        if (finRealRows.length > 0) {
          financRealAnoAnterior = new Map<string, number>();
          for (const r of finRealRows) {
            const macro = r.macro_custo || '—';
            financRealAnoAnterior.set(macro, (financRealAnoAnterior.get(macro) || 0) + (Number(r.valor) || 0));
          }
        }

        // ── E) saldo inicial caixa ──
        const saldoRows = (saldoIniRes.data as any[] | null) ?? [];
        const saldoInicial = saldoRows.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
        const saldoInicialAusente = saldoRows.length === 0;

        // ── F) financiamentos ──
        const parcelaRows = (parcelasRes.data as any[] | null) ?? [];
        const amortizacoesMeta = parcelaRows.reduce((s, r) => s + (Number(r.valor_principal) || 0), 0);
        const jurosMeta = parcelaRows.reduce((s, r) => s + (Number(r.valor_juros) || 0), 0);
        const dividaRows = (dividaRes.data as any[] | null) ?? [];
        const dividaInicial = dividaRows.reduce((s, r) => s + (Number(r.saldo_devedor) || 0), 0);

        // ── G) zoot META ──
        const zootMetaRows = (zootMetaRes.data as any[] | null) ?? [];
        let rebanhoInicialMeta = 0, rebanhoFinalMeta = 0, abatesMeta = 0, vendasMeta = 0;
        const abatesMensaisMeta = new Array(12).fill(0);
        for (const r of zootMetaRows) {
          if (Number(r.mes) === 1) rebanhoInicialMeta += Number(r.saldo_inicial) || 0;
          if (Number(r.mes) === 12) rebanhoFinalMeta += Number(r.saldo_final) || 0;
          abatesMeta += Number(r.saidas_abate) || 0;
          vendasMeta += Number(r.saidas_venda) || 0;
          const m = Number(r.mes);
          if (m >= 1 && m <= 12) abatesMensaisMeta[m - 1] += Number(r.saidas_abate) || 0;
        }

        // ── H) zoot Real ano anterior ──
        const zootRealRows = (zootRealRes.data as any[] | null) ?? [];
        let rebanhoInicialReal: number | null = null;
        let rebanhoFinalReal: number | null = null;
        let abatesReal: number | null = null;
        let vendasReal: number | null = null;
        if (zootRealRows.length > 0) {
          rebanhoInicialReal = 0; rebanhoFinalReal = 0; abatesReal = 0; vendasReal = 0;
          for (const r of zootRealRows) {
            if (Number(r.mes) === 1) rebanhoInicialReal += Number(r.saldo_inicial) || 0;
            if (Number(r.mes) === 12) rebanhoFinalReal += Number(r.saldo_final) || 0;
            abatesReal += Number(r.saidas_abate) || 0;
            vendasReal += Number(r.saidas_venda) || 0;
          }
        }

        // ── I) preço meta arrobas ──
        const precoRows = (precoArrobaRes.data as any[] | null) ?? [];
        let precoMedioArroba: number | null = null;
        if (precoRows.length > 0) {
          const valid = precoRows.map(r => Number(r.preco_arroba) || 0).filter(v => v > 0);
          if (valid.length > 0) precoMedioArroba = valid.reduce((s, v) => s + v, 0) / valid.length;
        }

        // ── Indicadores derivados ──
        const receitaMeta = financMetaPorMacro.get('1-Entradas') ?? 0;
        const desembolsoMeta = financMetaPorMacro.get('2-Saídas') ?? 0;
        const resultadoMeta = receitaMeta - desembolsoMeta;
        const margemMeta = receitaMeta > 0 ? (resultadoMeta / receitaMeta) * 100 : 0;
        const saldoFinalProjetado = saldoInicial + receitaMeta - desembolsoMeta;
        const dividaFinalProjetada = Math.max(0, dividaInicial - amortizacoesMeta);

        // Fluxo mensal acumulado
        const entradasMensais = financMetaMensal.get('1-Entradas') ?? new Array(12).fill(0);
        const saidasMensais = financMetaMensal.get('2-Saídas') ?? new Array(12).fill(0);
        const fluxoMensalAcumulado = new Array(12).fill(0);
        let acumulado = saldoInicial;
        for (let i = 0; i < 12; i++) {
          acumulado += (entradasMensais[i] || 0) - (saidasMensais[i] || 0);
          fluxoMensalAcumulado[i] = acumulado;
        }

        // Comparativos
        const variacaoReceita = financRealAnoAnterior
          ? calcVar(receitaMeta, financRealAnoAnterior.get('1-Entradas'))
          : null;
        const variacaoDesembolso = financRealAnoAnterior
          ? calcVar(desembolsoMeta, financRealAnoAnterior.get('2-Saídas'))
          : null;
        const variacaoResultado = financRealAnoAnterior
          ? calcVar(resultadoMeta,
              (financRealAnoAnterior.get('1-Entradas') ?? 0) - (financRealAnoAnterior.get('2-Saídas') ?? 0))
          : null;

        // Alertas
        const alertas: ResumoExecMetaAlerta[] = [];
        if (!ultimaVersao) alertas.push({ tipo: 'critico', mensagem: 'Nenhuma versão salva. Salve o planejamento antes de aprovar.' });
        if (planMetaRows.length === 0) alertas.push({ tipo: 'critico', mensagem: 'Planejamento META sem lançamentos.' });
        if (receitaMeta === 0) alertas.push({ tipo: 'critico', mensagem: 'Receita META zerada.' });
        if (zootMetaRows.length === 0) alertas.push({ tipo: 'critico', mensagem: 'Dados zootécnicos META ausentes.' });
        if (saldoInicialAusente) alertas.push({ tipo: 'critico', mensagem: 'Saldo inicial de caixa ausente.' });

        if (
          aprovacaoAtual?.status === 'aprovado'
          && ultimaVersao
          && aprovacaoAtual.versao_id !== ultimaVersao.id
        ) {
          alertas.push({ tipo: 'aviso', mensagem: 'META aprovada em versão anterior. Nova versão exige nova aprovação.' });
        }
        if (fluxoMensalAcumulado.some(v => v < 0)) {
          const n = fluxoMensalAcumulado.filter(v => v < 0).length;
          alertas.push({ tipo: 'aviso', mensagem: `Caixa projetado negativo em ${n} mês(es).` });
        }
        if (financRealAnoAnterior === null) alertas.push({ tipo: 'aviso', mensagem: 'Histórico do ano anterior indisponível para comparação.' });
        if (precoMedioArroba === null) alertas.push({ tipo: 'aviso', mensagem: 'Preço META de arrobas não configurado.' });

        const temAlertaCritico = alertas.some(a => a.tipo === 'critico');

        if (cancelled) return;

        setState({
          loading: false,
          ultimaVersao,
          aprovacaoAtual,
          statusAprovacao,
          receitaMeta, desembolsoMeta, resultadoMeta, margemMeta,
          saldoInicial, saldoInicialAusente, saldoFinalProjetado,
          dividaInicial, amortizacoesMeta, jurosMeta, dividaFinalProjetada,
          financRealAnoAnterior,
          variacaoReceita, variacaoDesembolso, variacaoResultado,
          financMetaPorMacro, financMetaMensal, financGrupoPorMacro,
          fluxoMensalAcumulado,
          rebanhoInicialMeta, rebanhoFinalMeta, abatesMeta, vendasMeta,
          abatesMensaisMeta, precoMedioArroba,
          rebanhoInicialReal, rebanhoFinalReal, abatesReal, vendasReal,
          alertas, temAlertaCritico,
          aprovar: aprovarRef.current,
          reload,
        });
      } catch (e) {
        console.error('[useResumoExecMeta] erro ao carregar:', e);
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [clienteId, fazendaId, ano, reloadKey, reload]);

  // Função aprovar — usa stateRef para acessar dados atuais sem entrar em deps.
  aprovarRef.current = useCallback(async (observacao?: string) => {
    const cur = stateRef.current;
    if (!cur.ultimaVersao) return;
    if (cur.temAlertaCritico) return;

    try {
      // Buscar aprovação ativa (status='aprovado')
      const { data: ativaRows } = await supabase
        .from('meta_aprovacoes' as any)
        .select('id')
        .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('ano', ano)
        .eq('status', 'aprovado');
      const ativos = (ativaRows as any[] | null) ?? [];
      if (ativos.length > 0) {
        await supabase
          .from('meta_aprovacoes' as any)
          .update({ status: 'substituido', updated_at: new Date().toISOString() })
          .in('id', ativos.map(r => r.id));
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('meta_aprovacoes' as any)
        .insert({
          cliente_id: clienteId,
          fazenda_id: fazendaId,
          ano,
          versao_id: cur.ultimaVersao.id,
          status: 'aprovado',
          aprovado_por: user?.id ?? null,
          aprovado_email: user?.email ?? null,
          aprovado_em: new Date().toISOString(),
          observacao: observacao?.trim() || null,
        });
      if (error) throw error;
      reload();
    } catch (e) {
      console.error('[useResumoExecMeta] erro ao aprovar:', e);
      throw e;
    }
  }, [clienteId, fazendaId, ano, reload]);

  // Mantém a referência viva no objeto retornado.
  return { ...state, aprovar: aprovarRef.current, reload };
}
