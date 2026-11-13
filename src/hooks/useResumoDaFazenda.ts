/**
 * FAZENDA-CADASTRO-01 · F1b — o que a tela do cadastro lê além do próprio cadastro (só leitura, tudo que já existe):
 * partida do rebanho (`saldos_iniciais`), último fechamento (`zoot_mensal_cache`, REBANHO-LEITURA-01) e a lotação dele (`fn_lotacao_do_mes`,
 * área própria — D7), chuva do ano (`chuvas`, Q3), a sede (`fazenda_infraestruturas` 'sede_casa'), o desenho da fazenda ou dos pastos
 * (`fazenda_geometrias` 'area_fazenda' / `fn_pastos_area_comparar`, Q4) e o histórico do cadastro (`audit_log` do `trg_trilha_cadastro`).
 * Leitura que falha diz o que não leu (P146); leituras independentes saem juntas; tela que saiu não escreve.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Pasto } from '@/hooks/usePastos';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { lotacaoPropria, ultimoFechamentoPorFazenda } from '@/lib/fazendas/listaDeFazendas';
import { historicoDoCadastro, pontoDaSede, type MudancaDoCadastro } from '@/lib/fazendas/cadastroDaFazenda';

export interface ResumoDaFazenda {
  partida: { anoMes: string; cabecas: number } | null;
  fechamento: { anoMes: string; cabecas: number; lotacao: number | null; inicioDoAno: number | null } | null;
  chuva: { ano: number; mm: number; dias: number } | null;
  sede: { texto: string } | null;
  /** Q4: o desenho da FAZENDA quando existe; senão a soma dos pastos desenhados (área do mapa), com quantos de quantos */
  desenho: { tipo: 'fazenda'; ha: number } | { tipo: 'pastos'; ha: number; desenhados: number; de: number } | null;
  historico: MudancaDoCadastro[];
  carregando: boolean;
  erro: string | null;
}
const VAZIO: ResumoDaFazenda = { partida: null, fechamento: null, chuva: null, sede: null, desenho: null, historico: [], carregando: false, erro: null };

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const semTipo = supabase as any;

export function useResumoDaFazenda(
  clienteId: string | null | undefined, fazendaId: string | null | undefined, pastos: readonly Pasto[], mesRef: string, versao: number,
): ResumoDaFazenda {
  const [r, setR] = useState<ResumoDaFazenda>(VAZIO);
  const daFazenda = pastos.filter(p => p.fazenda_id === fazendaId);
  const arrendadosChave = daFazenda.filter(p => p.posse === 'arrendada_de_terceiro').map(p => p.id).sort().join(',');
  /* os pastos da área (sem piquete, ativos): o "de N" do desenho */
  const idsDaAreaChave = daFazenda.filter(p => p.ativo !== false && !p.pai_id && p.tipo_uso !== 'divergencia').map(p => p.id).sort().join(',');

  useEffect(() => {
    if (!clienteId || !fazendaId || fazendaId === '__global__') { setR(VAZIO); return; }
    let vivo = true;
    setR(x => ({ ...x, carregando: true }));
    (async () => {
      const ano = Number(mesRef.slice(0, 4));
      const [saldo, cache, chuva, sede, geoFaz, comparar, trilha] = await Promise.all([
        semTipo.from('saldos_iniciais').select('ano, mes, quantidade').eq('fazenda_id', fazendaId).gt('quantidade', 0),
        semTipo.from('zoot_mensal_cache').select('fazenda_id, ano_mes, saldo_inicial, saldo_final, fonte_oficial_mes')
          .eq('fazenda_id', fazendaId).eq('cenario', 'realizado').gte('ano_mes', `${ano - 1}-01`),
        semTipo.from('chuvas').select('data, milimetros').eq('fazenda_id', fazendaId).gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`),
        semTipo.from('fazenda_infraestruturas').select('geometria').eq('fazenda_id', fazendaId).eq('tipo', 'sede_casa').eq('ativo', true).limit(1),
        semTipo.from('fazenda_geometrias').select('geojson').eq('fazenda_id', fazendaId).eq('tipo', 'area_fazenda'),
        semTipo.rpc('fn_pastos_area_comparar', { p_fazenda: fazendaId, p_ano_mes: mesRef }),
        semTipo.from('audit_log').select('created_at, usuario_id, via, acao, resumo, dados_anteriores, dados_novos')
          .eq('tabela_origem', 'fazenda_cadastros').eq('fazenda_id', fazendaId).order('created_at', { ascending: false }).limit(30),
      ]);
      if (!vivo) return;
      const falhas: string[] = [];
      const falhou = (res: { error: unknown }, oQue: string) => {
        if (res.error) { falhas.push(oQue); console.error(`[cadastro da fazenda] ${oQue}`, res.error); return true; }
        return false;
      };

      /* partida = o 1º (ano, mês) com cabeça; as cabeças desse mês */
      let partida: ResumoDaFazenda['partida'] = null;
      if (!falhou(saldo, 'o rebanho inicial')) {
        const linhas: { ano: number; mes: number | null; quantidade: number }[] = saldo.data ?? [];
        const chave = (l: { ano: number; mes: number | null }) => l.ano * 12 + (l.mes || 1);
        const menor = linhas.reduce<number | null>((m, l) => (m == null || chave(l) < m ? chave(l) : m), null);
        if (menor != null) {
          const doMes = linhas.filter(l => chave(l) === menor);
          partida = { anoMes: `${doMes[0].ano}-${String(doMes[0].mes || 1).padStart(2, '0')}`, cabecas: doMes.reduce((s, l) => s + Number(l.quantidade), 0) };
        }
      }

      let fechamento: ResumoDaFazenda['fechamento'] = null;
      if (!falhou(cache, 'o último fechamento')) {
        const u = ultimoFechamentoPorFazenda(cache.data ?? []).get(fazendaId);
        if (u) {
          const lot = await semTipo.rpc('fn_lotacao_do_mes', { p_fazenda_id: fazendaId, p_ano_mes: u.anoMes });
          if (!vivo) return;
          const arrendados = new Set(arrendadosChave ? arrendadosChave.split(',') : []);
          const lp = falhou(lot, 'a lotação') ? { lotacao: null }
            : lotacaoPropria((lot.data ?? []).map((x: { pasto_id: string; area_ha: unknown; ua: unknown }) =>
              ({ pasto_id: x.pasto_id, area_ha: num(x.area_ha), ua: num(x.ua) })), arrendados);
          fechamento = { anoMes: u.anoMes, cabecas: u.cabecas, lotacao: lp.lotacao, inicioDoAno: u.inicioDoAno };
        }
      }

      const chuvaAno = falhou(chuva, 'a chuva') ? null : (() => {
        const ls: { milimetros: unknown }[] = chuva.data ?? [];
        const comChuva = ls.filter(l => (num(l.milimetros) ?? 0) > 0);
        return { ano, mm: comChuva.reduce((s, l) => s + (num(l.milimetros) ?? 0), 0), dias: comChuva.length };
      })();

      const sedePonto = falhou(sede, 'a sede') ? null : pontoDaSede(sede.data?.[0]?.geometria);

      let desenho: ResumoDaFazenda['desenho'] = null;
      const geos: { geojson: GeoJSON.Geometry | null }[] = falhou(geoFaz, 'o desenho da fazenda') ? [] : geoFaz.data ?? [];
      const haFazenda = geos.reduce((s, g) => s + (g.geojson ? areaEmHectares(g.geojson) : 0), 0);
      if (haFazenda > 0) desenho = { tipo: 'fazenda', ha: haFazenda };
      else if (!falhou(comparar, 'a área do mapa dos pastos')) {
        const ids = new Set(idsDaAreaChave ? idsDaAreaChave.split(',') : []);
        const ls: { pasto_id: string; area_mapa_ha: unknown }[] = (comparar.data ?? []).filter((l: { pasto_id: string }) => ids.has(l.pasto_id));
        const comMapa = ls.filter(l => num(l.area_mapa_ha) != null);
        if (ls.length > 0) desenho = { tipo: 'pastos', ha: comMapa.reduce((s, l) => s + (num(l.area_mapa_ha) ?? 0), 0), desenhados: comMapa.length, de: ls.length };
      }

      let historico: MudancaDoCadastro[] = [];
      if (!falhou(trilha, 'o histórico')) {
        const ls = trilha.data ?? [];
        const ids = [...new Set<string>(ls.map((l: { usuario_id: string | null }) => l.usuario_id).filter(Boolean))];
        const nomes = new Map<string, string>();
        if (ids.length > 0) {
          const ps = await semTipo.from('profiles').select('user_id, nome').in('user_id', ids);
          if (!vivo) return;
          for (const p of ps.data ?? []) if (p.nome) nomes.set(p.user_id, p.nome);
        }
        historico = historicoDoCadastro(ls, nomes);
      }

      setR({
        partida, fechamento, chuva: chuvaAno, sede: sedePonto ? { texto: sedePonto.texto } : null, desenho, historico, carregando: false,
        erro: falhas.length > 0 ? `Não consegui ler ${falhas.join(', ')}. Mostro "—" no lugar.` : null,
      });
    })();
    return () => { vivo = false; };
  }, [clienteId, fazendaId, mesRef, versao, arrendadosChave, idsDaAreaChave]);

  return r;
}
