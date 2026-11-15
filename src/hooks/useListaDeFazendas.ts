/**
 * FAZENDA-CADASTRO-01 · F1a — o que a lista de fazendas lê, de uma vez, para o cliente inteiro (só leitura):
 * cadastro (`fazenda_cadastros`), desenhos dos pastos (`fazenda_geometrias`), quem tem rebanho inicial (`saldos_iniciais`),
 * o último fechamento (`zoot_mensal_cache` — REBANHO-LEITURA-01: a view saiu das telas) e a lotação dele (`fn_lotacao_do_mes`, área própria).
 * Leitura que falha NÃO vira lista vazia: a coluna dela mostra "—" e a faixa diz o que não se leu (P146).
 * Leitura que termina depois de a tela sair não escreve (OC-ABRIR-LENTO-01); as independentes saem juntas.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Pasto } from '@/hooks/usePastos';
import {
  lotacaoPropria, ultimoFechamentoPorFazenda, type CadastroDaFazenda, type FechamentoDaFazenda,
} from '@/lib/fazendas/listaDeFazendas';

export interface DadosDaListaDeFazendas {
  cadastros: Map<string, CadastroDaFazenda>;
  desenhados: Set<string>;
  comRebanhoInicial: Set<string>;
  fechamentos: Map<string, FechamentoDaFazenda>;
  carregando: boolean;
  /** o que não se conseguiu ler (frase pronta) */
  erro: string | null;
}

const VAZIO: DadosDaListaDeFazendas = {
  cadastros: new Map(), desenhados: new Set(), comRebanhoInicial: new Set(), fechamentos: new Map(), carregando: false, erro: null,
};

/** desde janeiro do ano passado: o "último fechamento" de quem fecha todo mês está aí, e o janeiro do ano dele (o saldo inicial do ano);
 *  quem não fecha desde então mostra "—" */
function mesInicial(hoje = new Date()): string {
  return `${hoje.getFullYear() - 1}-01`;
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const semTipo = supabase as any;

export function useListaDeFazendas(clienteId: string | null | undefined, pastos: readonly Pasto[], ativo: boolean): DadosDaListaDeFazendas {
  const [dados, setDados] = useState<DadosDaListaDeFazendas>(VAZIO);
  /* a lotação precisa saber quais pastos são arrendados: a chave muda só quando a posse muda */
  const arrendadosChave = pastos.filter(p => p.posse === 'arrendada_de_terceiro').map(p => p.id).sort().join(',');

  useEffect(() => {
    if (!ativo || !clienteId) { setDados(VAZIO); return; }
    let vivo = true;
    setDados(d => ({ ...d, carregando: true }));
    (async () => {
      const falhas: string[] = [];
      const [cad, geo, saldo, cache] = await Promise.all([
        semTipo.from('fazenda_cadastros')
          .select('fazenda_id, municipio, estado, car, nirf, ie, roteiro, area_total_ha').eq('cliente_id', clienteId),
        semTipo.from('fazenda_geometrias').select('pasto_id').eq('cliente_id', clienteId).not('pasto_id', 'is', null),
        semTipo.from('saldos_iniciais').select('fazenda_id').eq('cliente_id', clienteId).gt('quantidade', 0),
        semTipo.from('zoot_mensal_cache').select('fazenda_id, ano_mes, saldo_inicial, saldo_final, fonte_oficial_mes')
          .eq('cliente_id', clienteId).eq('cenario', 'realizado').gte('ano_mes', mesInicial()),
      ]);
      if (!vivo) return;

      const cadastros = new Map<string, CadastroDaFazenda>();
      if (cad.error) { falhas.push('o cadastro das fazendas'); console.error('[lista de fazendas] cadastro', cad.error); }
      for (const r of cad.data ?? []) {
        cadastros.set(r.fazenda_id, { fazenda_id: r.fazenda_id, municipio: r.municipio, estado: r.estado, car: r.car, nirf: r.nirf, ie: r.ie,
          roteiro: r.roteiro, area_total_ha: num(r.area_total_ha) });
      }
      if (geo.error) { falhas.push('os desenhos do mapa'); console.error('[lista de fazendas] desenhos', geo.error); }
      const desenhados = new Set<string>((geo.data ?? []).map((r: { pasto_id: string }) => r.pasto_id));
      if (saldo.error) { falhas.push('o rebanho inicial'); console.error('[lista de fazendas] saldo inicial', saldo.error); }
      const comRebanhoInicial = new Set<string>((saldo.data ?? []).map((r: { fazenda_id: string }) => r.fazenda_id));
      if (cache.error) { falhas.push('o rebanho do último fechamento'); console.error('[lista de fazendas] rebanho', cache.error); }
      const ultimos = ultimoFechamentoPorFazenda(cache.data ?? []);

      /* a lotação de cada fazenda no mês do último fechamento dela — juntas */
      const arrendados = new Set(arrendadosChave ? arrendadosChave.split(',') : []);
      const lots = await Promise.all([...ultimos.entries()].map(async ([fazendaId, u]) => {
        const r = await semTipo.rpc('fn_lotacao_do_mes', { p_fazenda_id: fazendaId, p_ano_mes: u.anoMes });
        return { fazendaId, r };
      }));
      if (!vivo) return;
      const fechamentos = new Map<string, FechamentoDaFazenda>();
      let lotFalhou = false;
      for (const { fazendaId, r } of lots) {
        const u = ultimos.get(fazendaId);
        if (!u) continue;
        if (r.error) { lotFalhou = true; console.error('[lista de fazendas] lotação', fazendaId, r.error); }
        const lp = r.error ? { lotacao: null, area: null }
          : lotacaoPropria((r.data ?? []).map((x: { pasto_id: string; area_ha: unknown; ua: unknown }) =>
            ({ pasto_id: x.pasto_id, area_ha: num(x.area_ha), ua: num(x.ua) })), arrendados);
        fechamentos.set(fazendaId, { anoMes: u.anoMes, cabecas: u.cabecas, lotacao: lp.lotacao, areaDaLotacao: lp.area, inicioDoAno: u.inicioDoAno });
      }
      if (lotFalhou) falhas.push('a lotação');

      setDados({
        cadastros, desenhados, comRebanhoInicial, fechamentos, carregando: false,
        erro: falhas.length > 0 ? `Não consegui ler ${falhas.join(', ')}. Mostro "—" nessas colunas.` : null,
      });
    })();
    return () => { vivo = false; };
  }, [clienteId, ativo, arrendadosChave]);

  return dados;
}
