/**
 * MAPA-02a — a FONTE ÚNICA do mês do mapa de pastos (D1): os pastos VIGENTES no mês (`pastosAtivosNoMes`) e o fechamento DAQUELE mês
 * (`fechamento_pastos` + `fechamento_pasto_itens`; os nomes das categorias vêm do `usePastos`). A montagem é `montarMapaDoMes`.
 * Substitui o `usePastoOcupacao` (o último fechamento de cada pasto, de qualquer mês) e as duas leituras de categorias do Gestor e da
 * Operação. Lê só o que precisa: os fechamentos da fazenda até o mês e os itens dos 12 meses da janela.
 * ⚠ Leitura que termina depois de o mês/fazenda mudar não escreve (OC-ABRIR-LENTO-01). Erro não vai a toast: fica em `erro`.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated, fetchAllPaginatedEmLotes, MAX_ROWS } from '@/lib/supabase/fetchAllPaginated';
import { pastosAtivosNoMes, type CategoriaRebanho, type Pasto } from '@/hooks/usePastos';
import {
  dozeMesesAte, montarMapaDoMes, ocupacoesDoMes, type DadosDoPastoNoMes, type FechamentoLido, type ItemLido, type PastoOcupacao,
} from '@/lib/mapa/mapaDoMes';

export interface MapaDoMes {
  /** Por pasto VIGENTE no mês. */
  dados: Map<string, DadosDoPastoNoMes>;
  /** No formato da aba Operação (só quem tem fechamento no mês). */
  ocupacoes: Map<string, PastoOcupacao>;
  /** Os pastos vigentes no mês (ativos + vigência). */
  vigentes: Pasto[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

export function useMapaDoMes(fazendaId: string | undefined, anoMes: string, pastos: Pasto[], categorias: CategoriaRebanho[]): MapaDoMes {
  const [lidos, setLidos] = useState<{ chave: string; fechamentos: FechamentoLido[]; itens: ItemLido[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);
  const chave = `${fazendaId ?? ''}|${anoMes}`;

  useEffect(() => {
    if (!fazendaId || !/^\d{4}-\d{2}$/.test(anoMes)) { setLidos(null); return; }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      try {
        const { data: fechamentos } = await fetchAllPaginated<FechamentoLido & { fazenda_id?: string }>({
          query: () => supabase
            .from('fechamento_pastos')
            .select('id, pasto_id, ano_mes, tipo_uso_mes, status, fazenda_id')
            .eq('fazenda_id', fazendaId)
            .lte('ano_mes', anoMes)
            .order('id', { ascending: true }),
          getKey: r => r.id,
          maxRows: MAX_ROWS,
          context: 'useMapaDoMes/fechamentos',
          shouldAbort: () => cancelado,
        });
        if (cancelado) return;
        const janela = new Set(dozeMesesAte(anoMes));
        const daFazenda = fechamentos.filter(f => (f.fazenda_id == null || f.fazenda_id === fazendaId) && f.ano_mes <= anoMes);
        const idsDaJanela = daFazenda.filter(f => janela.has(f.ano_mes)).map(f => f.id);
        const itens: ItemLido[] = idsDaJanela.length === 0 ? [] : await fetchAllPaginatedEmLotes<ItemLido>(idsDaJanela, 150, {
          query: lote => supabase
            .from('fechamento_pasto_itens')
            .select('id, fechamento_id, quantidade, peso_medio_kg, categoria_id')
            .in('fechamento_id', lote)
            .order('id', { ascending: true }),
          getKey: r => (r as ItemLido & { id?: string }).id ?? `${r.fechamento_id}|${r.categoria_id}`,
          maxRows: MAX_ROWS,
          context: 'useMapaDoMes/itens',
          shouldAbort: () => cancelado,
        });
        if (cancelado) return;
        const idsSet = new Set(idsDaJanela);
        setLidos({ chave, fechamentos: daFazenda, itens: itens.filter(i => idsSet.has(i.fechamento_id)) });
      } catch (e) {
        if (cancelado) return;
        console.error('[useMapaDoMes]', e);
        setErro('Não foi possível ler os fechamentos do mês.');
        setLidos(null);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [fazendaId, anoMes, chave, rodada]);

  const vigentes = useMemo(
    () => pastosAtivosNoMes(pastos.filter(p => !fazendaId || p.fazenda_id === fazendaId), anoMes),
    [pastos, fazendaId, anoMes],
  );
  const nomes = useMemo(() => new Map(categorias.map(c => [c.id, c.nome])), [categorias]);

  const dados = useMemo(() => {
    if (!lidos || lidos.chave !== chave) return new Map<string, DadosDoPastoNoMes>();
    return montarMapaDoMes({
      anoMes, vigentes, fechamentos: lidos.fechamentos, itens: lidos.itens, nomeDaCategoria: id => nomes.get(id) ?? 'Sem nome',
    });
  }, [lidos, chave, anoMes, vigentes, nomes]);

  const ocupacoes = useMemo(() => ocupacoesDoMes(dados), [dados]);

  return { dados, ocupacoes, vigentes, carregando, erro, recarregar: () => setRodada(r => r + 1) };
}
