/**
 * Hook para gerenciar preços META por categoria de rebanho.
 * Fonte única de precificação para o cenário META.
 * Tabelas: meta_valor_rebanho_precos, meta_valor_rebanho_status
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { toast } from 'sonner';

export interface MetaPrecoCategoria {
  categoria: string;
  preco_arroba: number;
}

export interface MetaPrecoStatus {
  status: 'rascunho' | 'parcial' | 'validado';
  validado_por?: string | null;
  validado_em?: string | null;
}

/**
 * ⚠ TODA OPERACAO EXIGE FAZENDA. O status de validacao passou a ser gravado por
 * FAZENDA-mes em PR-META-VALIDACAO-STATUS-02 — antes era por cliente-mes, e
 * validar uma fazenda marcava o mes como pronto para o cliente inteiro,
 * silenciando as outras. Custou R$ 5,2 mi ausentes por sete meses na NJ.
 *
 * ⚠ A GUARDA VIVE AQUI, e nao so na tela, porque a tela tem DOIS pontos de
 * montagem: V2Index:991 (que bloqueia Global) e Index:838 (que so passou a
 * bloquear em 8f370a9a). O hook nao pode depender de quem o monta — um ponto
 * de montagem futuro nao vai lembrar desta regra.
 *
 * ⚠ Sem fazenda, DESISTIR EM SILENCIO: sem erro, sem toast, sem estado
 * parcial. O hook sem fazenda nao tem o que responder, e um `.eq('fazenda_id',
 * undefined)` devolveria vazio fingindo que nada foi validado.
 * ⚠ NUNCA gravar `fazenda_id` undefined ou null. O banco tambem barra (NOT NULL
 * desde a migracao), mas o erro tem de morrer antes de chegar la.
 */
export function useMetaValorRebanhoPrecos(anoMes: string, fazendaId?: string) {
  const { user } = useAuth();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const [precos, setPrecos] = useState<MetaPrecoCategoria[]>([]);
  const [statusMes, setStatusMes] = useState<MetaPrecoStatus>({ status: 'rascunho' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isValidado = statusMes.status === 'validado';

  const loadData = useCallback(async () => {
    if (!anoMes || !clienteId || !fazendaId) return;
    setLoading(true);
    try {
      const [{ data: precosData, error: e1 }, { data: st, error: e2 }] = await Promise.all([
        supabase.from('meta_valor_rebanho_precos' as any).select('*').eq('cliente_id', clienteId).eq('ano_mes', anoMes),
        supabase.from('meta_valor_rebanho_status' as any).select('*').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      setPrecos(
        ((precosData as any[]) || []).map((p: any) => ({
          categoria: p.categoria,
          preco_arroba: Number(p.preco_arroba) || 0,
        }))
      );

      if (st) {
        setStatusMes({
          status: (st as any).status as any,
          validado_por: (st as any).validado_por,
          validado_em: (st as any).validado_em,
        });
      } else {
        setStatusMes({ status: 'rascunho' });
      }
    } catch (e: any) {
      console.error('Erro ao carregar preços META:', e);
    } finally {
      setLoading(false);
    }
    /* ⚠ `fazendaId` PRECISA estar nas deps. As guardas deste hook desistem sem
       fazenda, e `useCallback` congela o valor do render em que foi criado — na
       primeira renderizacao o FazendaContext ainda nao resolveu e `fazendaId` e'
       undefined. Sem ele aqui o callback nunca era recriado, `loadData` desistia
       para sempre e a tabela de precos ficava vazia: todas as categorias em
       0,00. Foi o defeito de 475a571e — e NAO tinha a ver com a tabela de
       precos, cujas queries nunca sairam de `cliente_id`. */
  }, [anoMes, clienteId, fazendaId]);

  useEffect(() => { loadData(); }, [loadData]);

  const salvar = useCallback(async (
    items: MetaPrecoCategoria[],
    novoStatus: 'rascunho' | 'parcial' | 'validado',
  ) => {
    if (!anoMes || !clienteId) return;
    setSaving(true);
    try {
      await supabase.from('meta_valor_rebanho_precos' as any).delete().eq('cliente_id', clienteId).eq('ano_mes', anoMes);

      const rows = items
        .filter(i => i.preco_arroba > 0)
        .map(i => ({
          cliente_id: clienteId,
          ano_mes: anoMes,
          categoria: i.categoria,
          preco_arroba: i.preco_arroba,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('meta_valor_rebanho_precos' as any).insert(rows);
        if (error) throw error;
      }

      const { error: sErr } = await supabase.from('meta_valor_rebanho_status' as any).upsert({
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        ano_mes: anoMes,
        status: novoStatus,
        validado_por: novoStatus === 'validado' ? user?.id || null : null,
        validado_em: novoStatus === 'validado' ? new Date().toISOString() : null,
      }, { onConflict: 'fazenda_id,ano_mes' });
      if (sErr) throw sErr;

      const labels = { rascunho: 'Rascunho salvo', parcial: 'Salvo como parcial', validado: 'Preços META validados' };
      toast.success(labels[novoStatus]);
      await loadData();
    } catch (e: any) {
      console.error('Erro ao salvar preços META:', e);
      toast.error('Erro ao salvar: ' + e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [anoMes, clienteId, fazendaId, user, loadData]);

  const reabrir = useCallback(async () => {
    if (!anoMes || !clienteId || !fazendaId) return;
    try {
      const { error } = await supabase.from('meta_valor_rebanho_status' as any).update({
        status: 'rascunho',
        validado_por: null,
        validado_em: null,
      }).eq('fazenda_id', fazendaId).eq('ano_mes', anoMes);
      if (error) throw error;
      toast.success('Mês reaberto para edição');
      await loadData();
    } catch (e: any) {
      toast.error('Erro ao reabrir: ' + e.message);
    }
  }, [anoMes, clienteId, fazendaId, loadData]);

  const copiarMesAnterior = useCallback(async (anoMesAtual: string): Promise<MetaPrecoCategoria[] | null> => {
    if (!clienteId) return null;
    const [aStr, mStr] = anoMesAtual.split('-');
    let aNum = parseInt(aStr);
    let mNum = parseInt(mStr);
    mNum -= 1;
    if (mNum < 1) { mNum = 12; aNum -= 1; }
    const mesAnterior = `${aNum}-${String(mNum).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('meta_valor_rebanho_precos' as any)
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('ano_mes', mesAnterior);
    if (error) { toast.error('Erro ao buscar mês anterior: ' + error.message); return null; }
    if (!data || data.length === 0) { toast.warning('Nenhum preço META no mês anterior.'); return null; }

    return (data as any[]).map((p: any) => ({
      categoria: p.categoria,
      preco_arroba: Number(p.preco_arroba) || 0,
    }));
  }, [clienteId]);

  // Load all months status for year (for month ruler)
  const [statusAno, setStatusAno] = useState<Record<string, string>>({});
  
  /* A REGUA E' DO CLIENTE, nao da fazenda selecionada — decisao de Gabriel. E' o
     que faz o defeito aparecer: em 05/05/2026 seis meses da NJ foram validados
     so com a Pureza, e a regua verde escondia que faltava a Sto. Expedito.
     Agora aquele caso sairia AMARELO.

       verde     todas as fazendas COM PLANO META do mes validadas
       amarelo   ao menos uma validada, faltando outra
       neutro    nenhuma validada

     ⚠ O DENOMINADOR E' "COM PLANO META", nao "com pecuaria". A Faz. Sta. Luzia
     tem `tem_pecuaria = true` e ZERO linhas de plano meta — e' silvicultura.
     Conta-la deixaria todo mes da NJ amarelo para sempre, e a regua viraria
     ruido em vez de sinal. O conjunto sai de `vw_zoot_categoria_mensal` com
     `cenario = 'meta'`, que e' onde o plano de fato existe.

     ⚠ UMA consulta a mais por ANO, dentro deste callback — nao por render. A
     tela ja consultava aqui; o custo e' a segunda query da mesma chamada. */
  const loadStatusAno = useCallback(async (ano: string) => {
    if (!clienteId) return;
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const [{ data, error }, { data: planoData }] = await Promise.all([
      supabase
        .from('meta_valor_rebanho_status' as any)
        .select('ano_mes, status, fazenda_id')
        .eq('cliente_id', clienteId)
        .in('ano_mes', meses),
      supabase
        .from('vw_zoot_categoria_mensal' as any)
        .select('ano_mes, fazenda_id')
        .eq('cliente_id', clienteId)
        .eq('cenario', 'meta')
        .in('ano_mes', meses),
    ]);
    if (error) return;

    /* Quantas fazendas TEM plano em cada mes, e quantas foram validadas nele.
       Set por mes: a view devolve uma linha por categoria, entao a mesma
       fazenda aparece varias vezes no mesmo mes. */
    const comPlano: Record<string, Set<string>> = {};
    ((planoData as any[]) || []).forEach((r: any) => {
      if (!r.fazenda_id) return;
      (comPlano[r.ano_mes] ??= new Set()).add(r.fazenda_id);
    });
    const validadas: Record<string, Set<string>> = {};
    ((data as any[]) || []).forEach((r: any) => {
      if (r.status !== 'validado' || !r.fazenda_id) return;
      (validadas[r.ano_mes] ??= new Set()).add(r.fazenda_id);
    });

    const map: Record<string, string> = {};
    for (const m of meses) {
      const total = comPlano[m]?.size ?? 0;
      /* So conta validacao de fazenda que TEM plano: uma validacao orfa nao
         deve pintar o mes de verde. */
      const ok = [...(validadas[m] ?? [])].filter(f => comPlano[m]?.has(f)).length;
      if (total === 0 || ok === 0) continue;          // neutro: sem marca
      map[m] = ok >= total ? 'validado' : 'parcial';
    }
    setStatusAno(map);
  }, [clienteId]);

  return {
    precos,
    statusMes,
    loading,
    saving,
    isValidado,
    salvar,
    reabrir,
    copiarMesAnterior,
    statusAno,
    loadStatusAno,
  };
}
