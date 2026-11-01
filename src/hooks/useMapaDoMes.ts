/**
 * MAPA-02a — a FONTE ÚNICA do mês do mapa de pastos (D1): os pastos VIGENTES no mês (`pastosAtivosNoMes`) e o fechamento DAQUELE mês
 * (`fechamento_pastos` + `fechamento_pasto_itens`; os nomes das categorias vêm do `usePastos`). A montagem é `montarMapaDoMes`.
 * Substitui o `usePastoOcupacao` (o último fechamento de cada pasto, de qualquer mês) e as duas leituras de categorias do Gestor e da
 * Operação. Lê só o que precisa: os fechamentos da fazenda até o mês e os itens dos 12 meses da janela.
 * MAPA-GLOBAL-01: o MESMO hook lê uma fazenda (o Gestor) ou várias de uma vez (o Global): `.in('fazenda_id', …)`, uma ida paginada
 * para os fechamentos e os itens em lotes de 150 — nunca uma leitura por fazenda.
 * MAPA-PERF-01 (Gabriel 31/10): só a JANELA usada (o mês escolhido + os 11 anteriores do histórico), só as colunas necessárias e os
 *   itens EMBUTIDOS na mesma consulta (`fechamento_pasto_itens(...)`, pela FK `fechamento_id`), uma consulta por mês, as 12 em paralelo; sem o histórico
 *   inteiro (a Pureza lia 6.781 fechamentos desde 2020 em 7 páginas + 7 lotes de itens, tudo em série). Consequência: o "último
 *   fechamento" do pasto sem fechamento no mês se acha dentro da janela; antes dela, o painel não o cita.
 * ⚠ Leitura que termina depois de o mês/fazenda mudar não escreve (OC-ABRIR-LENTO-01). Erro não vai a toast: fica em `erro`.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated, MAX_ROWS } from '@/lib/supabase/fetchAllPaginated';
import { pastosAtivosNoMes, type CategoriaRebanho, type Pasto } from '@/hooks/usePastos';
import {
  dozeMesesAte, montarMapaDoMes, ocupacoesDoMes, separarFechamentosEItens, type DadosDoPastoNoMes, type FechamentoComItens, type FechamentoLido,
  type ItemLido, type PastoOcupacao,
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

export function useMapaDoMes(fazenda: string | readonly string[] | undefined, anoMes: string, pastos: Pasto[], categorias: CategoriaRebanho[]): MapaDoMes {
  const idsChave = typeof fazenda === 'string' ? fazenda : fazenda ? [...fazenda].sort().join(',') : '';
  const fazendaIds = useMemo(() => (idsChave ? idsChave.split(',') : []), [idsChave]);
  const [lidos, setLidos] = useState<{ chave: string; fechamentos: FechamentoLido[]; itens: ItemLido[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);
  const chave = `${idsChave}|${anoMes}`;

  useEffect(() => {
    if (fazendaIds.length === 0 || !/^\d{4}-\d{2}$/.test(anoMes)) { setLidos(null); return; }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      try {
        const janela = dozeMesesAte(anoMes);
        // uma leitura por mês da janela, as 12 EM PARALELO: a RLS (`tenant_ok` por linha) custa ~1,5 ms por linha e, numa leitura só, a
        // Pureza (986 fechamentos) levava 2,3 s; dividida em 12 ao mesmo tempo, 0,55 s (medido no proto, 31/10). Erro em qualquer uma
        // derruba todas (o `erro` aparece; nunca vira lista vazia).
        const porMes = await Promise.all(janela.map(mes => fetchAllPaginated<FechamentoComItens>({
          query: () => supabase
            .from('fechamento_pastos')
            .select('id, pasto_id, ano_mes, tipo_uso_mes, status, fazenda_id, fechamento_pasto_itens(id, fechamento_id, quantidade, peso_medio_kg, categoria_id, lote)')
            .in('fazenda_id', fazendaIds)
            .eq('ano_mes', mes)
            .order('id', { ascending: true }),
          getKey: r => r.id,
          maxRows: MAX_ROWS,
          context: `useMapaDoMes/${mes}`,
          shouldAbort: () => cancelado,
        })));
        if (cancelado) return;
        setLidos({ chave, ...separarFechamentosEItens(porMes.flatMap(r => r.data), fazendaIds, janela) });
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
  }, [fazendaIds, anoMes, chave, rodada]);

  const vigentes = useMemo(
    () => pastosAtivosNoMes(pastos.filter(p => fazendaIds.includes(p.fazenda_id)), anoMes),
    [pastos, fazendaIds, anoMes],
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
