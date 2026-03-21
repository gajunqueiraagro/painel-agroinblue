import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { Lancamento, SaldoInicial, Categoria } from '@/types/cattle';
import { addToQueue, isOnline } from '@/lib/offlineQueue';
import { toast } from 'sonner';

const STORAGE_KEY = 'gado-lancamentos';
const SALDO_KEY = 'gado-saldo-inicial';

export function useLancamentos() {
  const { fazendaAtual } = useFazenda();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [saldosIniciais, setSaldosIniciais] = useState<SaldoInicial[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrated, setMigrated] = useState(false);

  const fazendaId = fazendaAtual?.id;

  const loadData = useCallback(async () => {
    if (!fazendaId) { setLancamentos([]); setSaldosIniciais([]); setLoading(false); return; }
    setLoading(true);

    const [lancRes, saldoRes] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('fazenda_id', fazendaId).order('data', { ascending: false }),
      supabase.from('saldos_iniciais').select('*').eq('fazenda_id', fazendaId),
    ]);

    if (lancRes.data) {
      // Fetch profile names for audit
      const userIds = new Set<string>();
      lancRes.data.forEach((l: any) => {
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

      setLancamentos(lancRes.data.map((l: any) => ({
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
        notaFiscal: l.nota_fiscal ?? undefined,
        tipoPeso: l.tipo_peso ?? 'vivo',
        createdAt: l.created_at,
        updatedAt: l.updated_at,
        createdBy: l.created_by ?? undefined,
        updatedBy: l.updated_by ?? undefined,
        createdByNome: l.created_by ? profileMap[l.created_by] : undefined,
        updatedByNome: l.updated_by ? profileMap[l.updated_by] : undefined,
      })));
    }

    if (saldoRes.data) {
      setSaldosIniciais(saldoRes.data.map(s => ({
        ano: s.ano,
        categoria: s.categoria as Categoria,
        quantidade: s.quantidade,
      })));
    }

    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Migrate localStorage data on first load
  useEffect(() => {
    if (!fazendaId || migrated) return;
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

  const adicionarLancamento = async (lancamento: Omit<Lancamento, 'id'>) => {
    if (!fazendaId) return;
    const { data, error } = await supabase.from('lancamentos').insert({
      fazenda_id: fazendaId,
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
    }).select().single();

    if (!error && data) {
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
      }, ...prev]);
    }
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
    if (dados.notaFiscal !== undefined) update.nota_fiscal = dados.notaFiscal;
    if (dados.tipoPeso !== undefined) update.tipo_peso = dados.tipoPeso;

    const { error } = await supabase.from('lancamentos').update(update).eq('id', id);
    if (!error) {
      setLancamentos(prev => prev.map(l => l.id === id ? { ...l, ...dados } : l));
    }
  };

  const removerLancamento = async (id: string) => {
    const { error } = await supabase.from('lancamentos').delete().eq('id', id);
    if (!error) {
      setLancamentos(prev => prev.filter(l => l.id !== id));
    }
  };

  const setSaldoInicial = async (ano: number, categoria: SaldoInicial['categoria'], quantidade: number) => {
    if (!fazendaId) return;

    if (quantidade > 0) {
      const { error } = await supabase.from('saldos_iniciais').upsert({
        fazenda_id: fazendaId,
        ano,
        categoria,
        quantidade,
      }, { onConflict: 'fazenda_id,ano,categoria' });
      if (!error) {
        setSaldosIniciais(prev => {
          const filtered = prev.filter(s => !(s.ano === ano && s.categoria === categoria));
          return [...filtered, { ano, categoria, quantidade }];
        });
      }
    } else {
      await supabase.from('saldos_iniciais')
        .delete()
        .eq('fazenda_id', fazendaId)
        .eq('ano', ano)
        .eq('categoria', categoria);
      setSaldosIniciais(prev => prev.filter(s => !(s.ano === ano && s.categoria === categoria)));
    }
  };

  return {
    lancamentos,
    saldosIniciais,
    adicionarLancamento,
    editarLancamento,
    removerLancamento,
    setSaldoInicial,
    loading,
  };
}
