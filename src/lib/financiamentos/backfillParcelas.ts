import { supabase } from '@/integrations/supabase/client';
import { criarMirrorParcela, type FinanciamentoInput, type ParcelaInput } from './parcelaMirror';

/**
 * Varre parcelas pendentes de financiamentos ativos do cliente e cria os mirrors.
 *
 * Estratégia em 2 passos para respeitar o UNIQUE constraint
 * (fazenda_id, ano, mes, centro_custo, subcentro, cenario) de planejamento_financeiro:
 *
 *   1. Para cada parcela: chama criarMirrorParcela para inserir/garantir os 2 lançamentos
 *      em financeiro_lancamentos_v2 (1 linha por parcela × 2 subcentros = sem conflito).
 *      Eventuais erros de planejamento inseridos aqui são ignorados (são resolvidos no passo 2).
 *
 *   2. Depois DELETE + INSERT agregado em planejamento_financeiro:
 *      agrupa as parcelas por (fazenda_id, ano, mes, subcentro) e soma valor_principal/juros.
 *      Resulta em 1 registro por grupo → UNIQUE respeitado.
 *
 * Idempotente: rodar múltiplas vezes produz o mesmo resultado final.
 */
export interface BackfillReport {
  processadas: number;
  criadas: number;
  puladas: number;
  erros: number;
  planejamentoGrupos: number;
}

interface ClassificacaoPlanej {
  macro_custo: string;
  grupo_custo: string;
  subcentro: string;
  escopo_negocio: string;
}

const AMORT: Record<'pecuaria' | 'agricultura', ClassificacaoPlanej> = {
  pecuaria: {
    macro_custo: 'Saída Financeira',
    grupo_custo: 'Amortizações',
    subcentro: 'Amortização Financiamento Pecuária',
    escopo_negocio: 'administrativo',
  },
  agricultura: {
    macro_custo: 'Saída Financeira',
    grupo_custo: 'Amortizações',
    subcentro: 'Amortização Financiamento Agricultura',
    escopo_negocio: 'administrativo',
  },
};

const JUROS: Record<'pecuaria' | 'agricultura', ClassificacaoPlanej> = {
  pecuaria: {
    macro_custo: 'Custeio Produção',
    grupo_custo: 'Juros de Financiamento Pecuária',
    subcentro: 'Juros de Financiamento Pecuária',
    escopo_negocio: 'pecuaria',
  },
  agricultura: {
    macro_custo: 'Custeio Produção',
    grupo_custo: 'Juros de Financiamento Agricultura',
    subcentro: 'Juros de Financiamento Agricultura',
    escopo_negocio: 'agricultura',
  },
};

interface AggKey {
  fazenda_id: string;
  cliente_id: string;
  ano: number;
  mes: number;
  tipo: 'pecuaria' | 'agricultura';
}

interface AggValue extends AggKey {
  principal: number;
  juros: number;
}

export async function backfillParcelasPendentes(clienteId: string): Promise<BackfillReport> {
  const report: BackfillReport = {
    processadas: 0, criadas: 0, puladas: 0, erros: 0, planejamentoGrupos: 0,
  };

  // 1) Query parcelas + financiamento via embed (evita produto cartesiano)
  const { data, error } = await supabase
    .from('financiamento_parcelas')
    .select('id, financiamento_id, cliente_id, data_vencimento, valor_principal, valor_juros, status, lancamento_id, financiamentos!inner(id, cliente_id, fazenda_id, tipo_financiamento, descricao, numero_contrato, credor_id, status)')
    .eq('cliente_id', clienteId)
    .eq('status', 'pendente');
  if (error) {
    console.error('[backfillParcelas] erro na query:', error);
    return report;
  }
  if (!data || data.length === 0) return report;

  // Filtra financiamentos ativos com tipo válido e fazenda_id definido
  const valid = (data as any[]).filter(row => {
    const fin = row.financiamentos;
    if (!fin || fin.status !== 'ativo') return false;
    if (fin.tipo_financiamento !== 'pecuaria' && fin.tipo_financiamento !== 'agricultura') return false;
    return true;
  });

  // 2) Cria/garante lançamentos por parcela (criarMirrorParcela é idempotente)
  for (const row of valid) {
    report.processadas++;
    const fin = row.financiamentos;
    const parcela: ParcelaInput = {
      id: row.id,
      cliente_id: row.cliente_id,
      fazenda_id: fin.fazenda_id ?? null,
      data_vencimento: row.data_vencimento,
      valor_principal: Number(row.valor_principal) || 0,
      valor_juros: Number(row.valor_juros) || 0,
      lancamento_id: row.lancamento_id,
    };
    const financiamento: FinanciamentoInput = {
      id: fin.id,
      cliente_id: fin.cliente_id,
      fazenda_id: fin.fazenda_id ?? null,
      tipo_financiamento: fin.tipo_financiamento,
      descricao: fin.descricao ?? null,
      numero_contrato: fin.numero_contrato ?? null,
      credor_id: fin.credor_id ?? null,
    };

    try {
      const result = await criarMirrorParcela(supabase as any, parcela, financiamento);
      if (result.lancamentoIdPrincipal || result.lancamentoIdJuros) {
        report.criadas++;
      } else {
        report.puladas++;
      }
    } catch (e: any) {
      report.erros++;
      console.error('[backfillParcelas] erro parcela', row.id, e);
    }
  }

  // 3) DELETE + INSERT agregado em planejamento_financeiro
  //    Remove qualquer linha origem='parcela_auto' antiga do cliente (incluindo as inseridas
  //    por criarMirrorParcela individualmente, que podem estar incompletas).
  const { error: delErr } = await (supabase
    .from('planejamento_financeiro' as any)
    .delete()
    .eq('cliente_id', clienteId)
    .eq('origem', 'parcela_auto') as any);
  if (delErr) {
    console.error('[backfillParcelas] erro deletando planejamento antigo:', delErr);
  }

  // Agrega parcelas por (fazenda_id, ano, mes, tipo)
  const agg = new Map<string, AggValue>();
  for (const row of valid) {
    const fin = row.financiamentos;
    const fazendaId = fin.fazenda_id;
    if (!fazendaId) continue;
    const ven = row.data_vencimento as string;
    const ano = Number(ven.substring(0, 4));
    const mes = Number(ven.substring(5, 7));
    const tipo = fin.tipo_financiamento as 'pecuaria' | 'agricultura';
    const key = `${fazendaId}|${ano}|${mes}|${tipo}`;
    const existing = agg.get(key);
    const principal = Number(row.valor_principal) || 0;
    const juros = Number(row.valor_juros) || 0;
    if (existing) {
      existing.principal += principal;
      existing.juros += juros;
    } else {
      agg.set(key, {
        fazenda_id: fazendaId,
        cliente_id: fin.cliente_id,
        ano, mes, tipo,
        principal, juros,
      });
    }
  }

  const inserts: any[] = [];
  for (const v of agg.values()) {
    if (v.principal > 0) {
      const cls = AMORT[v.tipo];
      inserts.push({
        cliente_id: v.cliente_id,
        fazenda_id: v.fazenda_id,
        ano: v.ano,
        mes: v.mes,
        centro_custo: 'Administração',
        macro_custo: cls.macro_custo,
        grupo_custo: cls.grupo_custo,
        subcentro: cls.subcentro,
        escopo_negocio: cls.escopo_negocio,
        tipo_custo: 'fixo',
        valor_base: Math.round(v.principal * 100) / 100,
        valor_planejado: Math.round(v.principal * 100) / 100,
        origem: 'parcela_auto',
        cenario: 'meta',
      });
    }
    if (v.juros > 0) {
      const cls = JUROS[v.tipo];
      inserts.push({
        cliente_id: v.cliente_id,
        fazenda_id: v.fazenda_id,
        ano: v.ano,
        mes: v.mes,
        centro_custo: 'Administração',
        macro_custo: cls.macro_custo,
        grupo_custo: cls.grupo_custo,
        subcentro: cls.subcentro,
        escopo_negocio: cls.escopo_negocio,
        tipo_custo: 'fixo',
        valor_base: Math.round(v.juros * 100) / 100,
        valor_planejado: Math.round(v.juros * 100) / 100,
        origem: 'parcela_auto',
        cenario: 'meta',
      });
    }
  }

  report.planejamentoGrupos = inserts.length;

  if (inserts.length > 0) {
    // Batch insert em blocos de 500 para evitar payload grande
    for (let i = 0; i < inserts.length; i += 500) {
      const chunk = inserts.slice(i, i + 500);
      const { error: insErr } = await (supabase
        .from('planejamento_financeiro' as any)
        .insert(chunk as any) as any);
      if (insErr) {
        console.error('[backfillParcelas] erro inserindo planejamento agregado:', insErr);
        report.erros++;
        break;
      }
    }
  }

  console.info('[backfillParcelas] report', report);
  return report;
}
