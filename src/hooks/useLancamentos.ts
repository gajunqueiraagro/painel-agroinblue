import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { Lancamento, SaldoInicial, Categoria } from '@/types/cattle';
import type { StatusOperacional } from '@/lib/statusOperacional';
import { addToQueue, isOnline } from '@/lib/offlineQueue';
import { toast } from 'sonner';

const STORAGE_KEY = 'gado-lancamentos';
const SALDO_KEY = 'gado-saldo-inicial';
const LANCAMENTOS_PAGE_SIZE = 1000;

async function fetchLancamentosPaginated(params: {
  cenario: 'realizado' | 'meta';
  clienteId?: string;
  fazendaId?: string;
  fazendaIds?: string[];
}) {
  const { cenario, clienteId, fazendaId, fazendaIds } = params;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('lancamentos')
      .select('*')
      .eq('cancelado', false)
      .eq('cenario', cenario);

    if (clienteId) {
      query = query.eq('cliente_id', clienteId);
    }

    if (fazendaIds && fazendaIds.length > 0) {
      query = query.in('fazenda_id', fazendaIds);
    } else if (fazendaId) {
      query = query.eq('fazenda_id', fazendaId);
    }

    const { data, error } = await query
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + LANCAMENTOS_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < LANCAMENTOS_PAGE_SIZE) break;
    from += LANCAMENTOS_PAGE_SIZE;
  }

  return rows;
}

export function useLancamentos(cenario: 'realizado' | 'meta' = 'realizado') {
  const queryClient = useQueryClient();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [saldosIniciais, setSaldosIniciais] = useState<SaldoInicial[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrated, setMigrated] = useState(false);

  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id || fazendaAtual?.cliente_id;

  const invalidateZootQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['zoot-categoria-mensal'] }),
      queryClient.invalidateQueries({ queryKey: ['zoot-mensal'] }),
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-mensais'] }),
      queryClient.invalidateQueries({ queryKey: ['anos-disponiveis'] }),
    ]);
  }, [queryClient]);

  const loadData = useCallback(async () => {
    if (!fazendaId || (isGlobal && (!clienteId || fazendas.length === 0))) {
      setLancamentos([]);
      setSaldosIniciais([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const fazendaIds = fazendas.map(f => f.id).filter(id => id !== '__global__');

      const [lancData, saldoRes] = isGlobal
        ? await Promise.all([
            fetchLancamentosPaginated({ fazendaIds, clienteId, cenario }),
            supabase.from('saldos_iniciais').select('*').in('fazenda_id', fazendaIds).eq('cliente_id', clienteId!),
          ])
        : await Promise.all([
            fetchLancamentosPaginated({ fazendaId, clienteId, cenario }),
            supabase.from('saldos_iniciais').select('*').eq('fazenda_id', fazendaId).eq('cliente_id', clienteId!),
          ]);

      const userIds = new Set<string>();
      lancData.forEach((l: any) => {
        if (l.created_by) userIds.add(l.created_by);
        if (l.updated_by) userIds.add(l.updated_by);
      });

      let profileMap: Record<string, string> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, nome')
          .in('user_id', Array.from(userIds));
        if (profiles) {
          profiles.forEach(p => { profileMap[p.user_id] = p.nome || 'Sem nome'; });
        }
      }

      setLancamentos(lancData.map((l: any) => ({
        id: l.id,
        data: l.data,
        tipo: l.tipo as any,
        quantidade: l.quantidade,
        categoria: l.categoria as Categoria,
        categoriaDestino: l.categoria_destino as Categoria | undefined,
        fazendaOrigem: l.fazenda_origem ?? undefined,
        fazendaDestino: l.fazenda_destino ?? undefined,
        pesoMedioKg: l.peso_medio_kg ?? undefined,
        pesoMedioArrobas: l.peso_medio_arrobas ?? undefined,
        precoMedioCabeca: l.preco_medio_cabeca ?? undefined,
        observacao: l.observacao ?? undefined,
        precoArroba: l.preco_arroba ?? undefined,
        pesoCarcacaKg: l.peso_carcaca_kg ?? undefined,
        bonusPrecoce: l.bonus_precoce ?? undefined,
        bonusQualidade: l.bonus_qualidade ?? undefined,
        bonusListaTrace: l.bonus_lista_trace ?? undefined,
        descontoQualidade: l.desconto_qualidade ?? undefined,
        descontoFunrural: l.desconto_funrural ?? undefined,
        outrosDescontos: l.outros_descontos ?? undefined,
        acrescimos: l.acrescimos ?? undefined,
        deducoes: l.deducoes ?? undefined,
        valorTotal: l.valor_total ?? undefined,
        notaFiscal: l.numero_documento ?? undefined,
        tipoPeso: l.tipo_peso ?? 'vivo',
        cenario: l.cenario ?? 'realizado',
        statusOperacional: l.status_operacional ?? (l.cenario === 'meta' ? null : 'realizado'),
        dataVenda: l.data_venda ?? undefined,
        dataEmbarque: l.data_embarque ?? undefined,
        dataAbate: l.data_abate ?? undefined,
        tipoVenda: l.tipo_venda ?? undefined,
        detalhesSnapshot: l.detalhes_snapshot ?? undefined,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
        createdBy: l.created_by ?? undefined,
        updatedBy: l.updated_by ?? undefined,
        createdByNome: l.created_by ? profileMap[l.created_by] : undefined,
        updatedByNome: l.updated_by ? profileMap[l.updated_by] : undefined,
        fazendaId: l.fazenda_id,
        origemRegistro: l.origem_registro ?? undefined,
        loteImportacaoId: l.lote_importacao_id ?? undefined,
      })));

      if (saldoRes.data) {
      setSaldosIniciais(saldoRes.data.map(s => ({
          ano: s.ano,
          categoria: s.categoria as Categoria,
          quantidade: s.quantidade,
          pesoMedioKg: (s as any).peso_medio_kg ?? undefined,
          precoKg: (s as any).preco_kg ?? undefined,
          fazendaId: (s as any).fazenda_id ?? undefined,
        })));
      } else {
        setSaldosIniciais([]);
      }
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error);
      setLancamentos([]);
      setSaldosIniciais([]);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, isGlobal, fazendas, cenario, clienteId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Migrate localStorage data on first load
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || migrated) return;
    const migrateKey = `migrated-${fazendaId}`;
    if (localStorage.getItem(migrateKey)) { setMigrated(true); return; }

    const doMigrate = async () => {
      try {
        const storedLanc = localStorage.getItem(STORAGE_KEY);
        const storedSaldo = localStorage.getItem(SALDO_KEY);
        const localLanc: any[] = storedLanc ? JSON.parse(storedLanc) : [];
        const localSaldo: any[] = storedSaldo ? JSON.parse(storedSaldo) : [];

        if (localLanc.length > 0) {
          const inserts = localLanc.map(l => ({
            fazenda_id: fazendaId,
            cliente_id: clienteId!,
            data: l.data,
            tipo: l.tipo,
            quantidade: l.quantidade,
            categoria: l.categoria,
            categoria_destino: l.categoriaDestino || null,
            fazenda_origem: l.fazendaOrigem || null,
            fazenda_destino: l.fazendaDestino || null,
            peso_medio_kg: l.pesoMedioKg || null,
            peso_medio_arrobas: l.pesoMedioArrobas || null,
            preco_medio_cabeca: l.precoMedioCabeca || null,
            observacao: l.observacao || null,
          }));
          await supabase.from('lancamentos').insert(inserts);
        }

        if (localSaldo.length > 0) {
          const inserts = localSaldo.map(s => ({
            fazenda_id: fazendaId,
            cliente_id: clienteId!,
            ano: s.ano,
            categoria: s.categoria,
            quantidade: s.quantidade,
          }));
          await supabase.from('saldos_iniciais').insert(inserts);
        }

        localStorage.setItem(migrateKey, 'true');
        if (localLanc.length > 0 || localSaldo.length > 0) {
          await loadData();
        }
      } catch {}
      setMigrated(true);
    };

    doMigrate();
  }, [fazendaId, migrated, loadData]);

  const adicionarLancamento = async (lancamento: Omit<Lancamento, 'id'>): Promise<string | undefined> => {
    if (!fazendaId || fazendaId === '__global__') return undefined;

    const insertData = {
      data: lancamento.data,
      tipo: lancamento.tipo,
      quantidade: lancamento.quantidade,
      categoria: lancamento.categoria,
      categoria_destino: lancamento.categoriaDestino || null,
      fazenda_origem: lancamento.fazendaOrigem || null,
      fazenda_destino: lancamento.fazendaDestino || null,
      peso_medio_kg: lancamento.pesoMedioKg || null,
      peso_medio_arrobas: lancamento.pesoMedioArrobas || null,
      preco_medio_cabeca: lancamento.precoMedioCabeca || null,
      observacao: lancamento.observacao || null,
      preco_arroba: lancamento.precoArroba || null,
      peso_carcaca_kg: lancamento.pesoCarcacaKg || null,
      bonus_precoce: lancamento.bonusPrecoce || null,
      bonus_qualidade: lancamento.bonusQualidade || null,
      bonus_lista_trace: lancamento.bonusListaTrace || null,
      desconto_qualidade: lancamento.descontoQualidade || null,
      desconto_funrural: lancamento.descontoFunrural || null,
      outros_descontos: lancamento.outrosDescontos || null,
      acrescimos: lancamento.acrescimos || null,
      deducoes: lancamento.deducoes || null,
      valor_total: lancamento.valorTotal || null,
      numero_documento: lancamento.notaFiscal || null,
      tipo_peso: lancamento.tipoPeso || 'vivo',
      status_operacional: lancamento.statusOperacional === null ? null : (lancamento.statusOperacional || 'realizado'),
      data_venda: lancamento.dataVenda || null,
      data_embarque: lancamento.dataEmbarque || null,
      data_abate: lancamento.dataAbate || null,
      tipo_venda: lancamento.tipoVenda || null,
      detalhes_snapshot: lancamento.detalhesSnapshot || null,
    };

    if (!isOnline()) {
      addToQueue({
        id: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        action: 'insert',
        fazendaId,
        data: insertData,
      });
      setLancamentos(prev => [{
        id: `temp-${Date.now()}`,
        ...lancamento,
      }, ...prev]);
      toast.info('Lançamento salvo na fila offline');
      return undefined;
    }

    // Derive cenario from statusOperacional: null → meta, otherwise realizado
    const effectiveCenario = lancamento.statusOperacional === null ? 'meta' : cenario;

    const { data, error } = await supabase.from('lancamentos').insert({
      fazenda_id: fazendaId,
      cliente_id: clienteId!,
      cenario: effectiveCenario,
      ...insertData,
    }).select().single();

    if (error) {
      console.error('Erro ao salvar lançamento:', error);
      toast.error('Erro ao salvar lançamento: ' + error.message);
      return undefined;
    }

    if (data) {
      setLancamentos(prev => [{
        id: data.id,
        data: data.data,
        tipo: data.tipo as any,
        quantidade: data.quantidade,
        categoria: data.categoria as Categoria,
        categoriaDestino: data.categoria_destino as Categoria | undefined,
        fazendaOrigem: data.fazenda_origem ?? undefined,
        fazendaDestino: data.fazenda_destino ?? undefined,
        pesoMedioKg: data.peso_medio_kg ?? undefined,
        pesoMedioArrobas: data.peso_medio_arrobas ?? undefined,
        precoMedioCabeca: data.preco_medio_cabeca ?? undefined,
        observacao: data.observacao ?? undefined,
        precoArroba: data.preco_arroba ?? undefined,
        pesoCarcacaKg: data.peso_carcaca_kg ?? undefined,
        bonusPrecoce: data.bonus_precoce ?? undefined,
        bonusQualidade: data.bonus_qualidade ?? undefined,
        bonusListaTrace: data.bonus_lista_trace ?? undefined,
        descontoQualidade: data.desconto_qualidade ?? undefined,
        descontoFunrural: data.desconto_funrural ?? undefined,
        outrosDescontos: data.outros_descontos ?? undefined,
        acrescimos: data.acrescimos ?? undefined,
        deducoes: data.deducoes ?? undefined,
        valorTotal: data.valor_total ?? undefined,
        notaFiscal: data.numero_documento ?? undefined,
        tipoPeso: (data.tipo_peso as 'vivo' | 'morto') ?? 'vivo',
        cenario: (data as any).cenario ?? 'realizado',
        statusOperacional: (data.status_operacional as StatusOperacional) ?? ((data as any).cenario === 'meta' ? null : 'realizado'),
        dataVenda: (data as any).data_venda ?? undefined,
        dataEmbarque: (data as any).data_embarque ?? undefined,
        dataAbate: (data as any).data_abate ?? undefined,
        tipoVenda: (data as any).tipo_venda ?? undefined,
        detalhesSnapshot: (data as any).detalhes_snapshot ?? undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by ?? undefined,
        updatedBy: data.updated_by ?? undefined,
        fazendaId: data.fazenda_id,
        origemRegistro: (data as any).origem_registro ?? undefined,
        loteImportacaoId: (data as any).lote_importacao_id ?? undefined,
      }, ...prev]);
      await invalidateZootQueries();
      return data.id;
    }
    return undefined;
  };

  const editarLancamento = async (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => {
    const update: any = {};
    if (dados.data !== undefined) update.data = dados.data;
    if (dados.tipo !== undefined) update.tipo = dados.tipo;
    if (dados.quantidade !== undefined) update.quantidade = dados.quantidade;
    if (dados.categoria !== undefined) update.categoria = dados.categoria;
    if (dados.categoriaDestino !== undefined) update.categoria_destino = dados.categoriaDestino;
    if (dados.fazendaOrigem !== undefined) update.fazenda_origem = dados.fazendaOrigem;
    if (dados.fazendaDestino !== undefined) update.fazenda_destino = dados.fazendaDestino;
    if (dados.observacao !== undefined) update.observacao = dados.observacao;
    if (dados.pesoMedioKg !== undefined) update.peso_medio_kg = dados.pesoMedioKg;
    if (dados.pesoMedioArrobas !== undefined) update.peso_medio_arrobas = dados.pesoMedioArrobas;
    if (dados.precoMedioCabeca !== undefined) update.preco_medio_cabeca = dados.precoMedioCabeca;
    if (dados.precoArroba !== undefined) update.preco_arroba = dados.precoArroba;
    if (dados.pesoCarcacaKg !== undefined) update.peso_carcaca_kg = dados.pesoCarcacaKg;
    if (dados.bonusPrecoce !== undefined) update.bonus_precoce = dados.bonusPrecoce;
    if (dados.bonusQualidade !== undefined) update.bonus_qualidade = dados.bonusQualidade;
    if (dados.bonusListaTrace !== undefined) update.bonus_lista_trace = dados.bonusListaTrace;
    if (dados.descontoQualidade !== undefined) update.desconto_qualidade = dados.descontoQualidade;
    if (dados.descontoFunrural !== undefined) update.desconto_funrural = dados.descontoFunrural;
    if (dados.outrosDescontos !== undefined) update.outros_descontos = dados.outrosDescontos;
    if (dados.acrescimos !== undefined) update.acrescimos = dados.acrescimos;
    if (dados.deducoes !== undefined) update.deducoes = dados.deducoes;
    if (dados.valorTotal !== undefined) update.valor_total = dados.valorTotal;
    if (dados.notaFiscal !== undefined) update.numero_documento = dados.notaFiscal;
    if (dados.tipoPeso !== undefined) update.tipo_peso = dados.tipoPeso;
    if (dados.cenario !== undefined) update.cenario = dados.cenario;
    if (dados.statusOperacional !== undefined) {
      update.status_operacional = dados.statusOperacional;
      if (dados.cenario === undefined) {
        update.cenario = dados.statusOperacional === null
          ? 'meta'
          : 'realizado';
      }
    }
    if (dados.dataVenda !== undefined) update.data_venda = dados.dataVenda;
    if (dados.dataEmbarque !== undefined) update.data_embarque = dados.dataEmbarque;
    if (dados.dataAbate !== undefined) update.data_abate = dados.dataAbate;
    if (dados.tipoVenda !== undefined) update.tipo_venda = dados.tipoVenda;
    if (dados.detalhesSnapshot !== undefined) update.detalhes_snapshot = dados.detalhesSnapshot;

    const { error } = await supabase.from('lancamentos').update(update).eq('id', id);
    if (!error) {
      setLancamentos(prev => prev.map(l => l.id === id ? {
        ...l,
        ...dados,
        cenario: dados.cenario ?? (dados.statusOperacional !== undefined
          ? (dados.statusOperacional === null ? 'meta' : 'realizado')
          : l.cenario),
      } : l));
      await invalidateZootQueries();
    }
  };

  /** Count linked financial records for a movimentação */
  const countFinanceirosVinculados = async (id: string): Promise<number> => {
    const { count } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id', { count: 'exact', head: true })
      .eq('movimentacao_rebanho_id', id)
      .eq('cancelado', false);
    return count ?? 0;
  };

  const removerLancamento = async (id: string) => {
    // Soft delete: mark as cancelled + write audit log
    const { data: lancRow } = await supabase
      .from('lancamentos')
      .select('id, cliente_id, tipo, categoria, quantidade, data, transferencia_par_id')
      .eq('id', id)
      .single();

    // Get linked financial records before cancellation
    const { data: finVinculados } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id')
      .eq('movimentacao_rebanho_id', id)
      .eq('cancelado', false);

    const finIds = (finVinculados || []).map(f => f.id);

    // Cancel linked financial records (soft delete)
    if (finIds.length > 0) {
      await supabase
        .from('financeiro_lancamentos_v2')
        .update({
          cancelado: true,
          cancelado_em: new Date().toISOString(),
          cancelado_por: (await supabase.auth.getUser()).data.user?.id || null,
        })
        .in('id', finIds);
    }

    // Soft delete the movimentação
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase
      .from('lancamentos')
      .update({
        cancelado: true,
        cancelado_em: new Date().toISOString(),
        cancelado_por: userId || null,
      })
      .eq('id', id);

    if (!error) {
      const parId = (lancRow as any)?.transferencia_par_id;
      const isTransfer = lancRow && ['transferencia_saida', 'transferencia_entrada'].includes(lancRow.tipo);

      // For transfers: the DB trigger propagates cancellation from saída→entrada automatically.
      // But if we're deleting the entrada side, we must also cancel the saída side explicitly.
      if (isTransfer && parId) {
        const isEntrada = lancRow.tipo === 'transferencia_entrada';
        if (isEntrada) {
          // Cancel the saída side (which will also trigger re-propagation, but it's already cancelled)
          await supabase
            .from('lancamentos')
            .update({
              cancelado: true,
              cancelado_em: new Date().toISOString(),
              cancelado_por: userId || null,
            })
            .eq('id', parId)
            .eq('cancelado', false);
        }
        // For saída side: the trigger sync_transferencia_update already propagates cancelado to the entrada
      }

      // Write audit log
      if (lancRow?.cliente_id) {
        await supabase.from('audit_log_movimentacoes').insert({
          cliente_id: lancRow.cliente_id,
          usuario_id: userId || null,
          acao: 'exclusao_movimentacao',
          movimentacao_id: id,
          financeiro_ids: finIds.length > 0 ? finIds : null,
          detalhes: {
            tipo: lancRow.tipo,
            categoria: lancRow.categoria,
            quantidade: lancRow.quantidade,
            data: lancRow.data,
            financeiros_cancelados: finIds.length,
            transferencia_par_cancelado: isTransfer && parId ? parId : null,
          },
        });
      }
      // Remove both sides from local state
      const idsToRemove = new Set([id]);
      if (isTransfer && parId) idsToRemove.add(parId);
      setLancamentos(prev => prev.filter(l => !idsToRemove.has(l.id)));
      await invalidateZootQueries();
    }
    return !error;
  };

  const setSaldoInicial = async (ano: number, categoria: SaldoInicial['categoria'], quantidade: number, pesoMedioKg?: number, precoKg?: number) => {
    if (!fazendaId || fazendaId === '__global__') return;

    if (quantidade > 0 || (precoKg != null && precoKg > 0)) {
      const { error } = await supabase.from('saldos_iniciais').upsert({
        fazenda_id: fazendaId,
        cliente_id: clienteId!,
        ano,
        categoria,
        quantidade,
        peso_medio_kg: pesoMedioKg ?? null,
        preco_kg: precoKg ?? null,
      } as any, { onConflict: 'fazenda_id,ano,categoria' });
      if (!error) {
        setSaldosIniciais(prev => {
          const filtered = prev.filter(s => !(s.ano === ano && s.categoria === categoria));
          return [...filtered, { ano, categoria, quantidade, pesoMedioKg, precoKg }];
        });
        await invalidateZootQueries();
      }
    } else {
      await supabase.from('saldos_iniciais')
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .eq('categoria', categoria);
      setSaldosIniciais(prev => prev.filter(s => !(s.ano === ano && s.categoria === categoria)));
      await invalidateZootQueries();
    }
  };

  return {
    lancamentos,
    saldosIniciais,
    adicionarLancamento,
    editarLancamento,
    removerLancamento,
    countFinanceirosVinculados,
    setSaldoInicial,
    loadData,
    loading,
    isGlobal,
  };
}
