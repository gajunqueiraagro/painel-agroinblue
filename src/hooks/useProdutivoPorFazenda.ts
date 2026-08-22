/**
 * Indicadores produtivos por FAZENDA — cabecas, GMD, UA media, producao
 * biologica e as duas pernas do desfrute em arrobas.
 *
 * FONTES:
 *   vw_zoot_fazenda_mensal  -> cabecas_final, gmd_kg_cab_dia, ua_media,
 *                              peso_inicio_kg
 *   zoot_mensal_cache       -> producao_biologica (somar por fazenda)
 *   lancamentos             -> @ VENDIDAS (abate/venda/consumo)
 *
 * NAO LER area_produtiva_ha NEM lotacao_ua_ha da view: ela usa area propria,
 * divergente do snapshot oficial (Pureza jul/2026: view 4.726 ha contra
 * snapshot 3.595 ha produtiva). A lotacao da view (0,73) nao reconcilia com
 * o UA/ha do Global (0,86). Area vem de areaPorFazendaMes e a lotacao e
 * recalculada na tela.
 *
 * DESFRUTE EM @ — definicao propria desta tabela, NAO o desfruteIndicador do
 * PC-100, que e em CABECAS:
 *   @ iniciais = peso_inicio_kg / 30
 *   @ vendidas = regra oficial da arroba, copiada de usePainelConsultorData:
 *                abate -> quantidade x peso_carcaca_kg / 15
 *                venda/consumo -> quantidade x peso_medio_kg / 30
 * O hook devolve as DUAS pernas; o percentual e calculado na tela, para que o
 * Total possa dividir somas em vez de promediar percentuais.
 *
 * MODO: isPeriodo=false le so `ateMes`; isPeriodo=true agrega Jan->ateMes —
 * MEDIA dos meses COM dado para cabecas, gmd, ua_media e @ iniciais, e SOMA
 * para @ produzidas e @ vendidas. Mesma assimetria dos tiles: arroba acumula,
 * o resto e media. Mes sem dado e AUSENCIA, nao zero: divisor por fazenda.
 *
 * CABECAS no PERIODO e MEDIA DE MEDIAS MENSAIS, nao media dos finais — ver o
 * comentario em `cabecas` abaixo. No MES e o saldo FINAL, que e o que o PC-100
 * usa (`cabFinSerie13`, usePainelConsultorData:1602 e :1617).
 *
 * GMD no PERIODO usa `computePeriodGmd`, a MESMA funcao do PC-100 — cujo
 * cabecalho diz "Usada pelo PainelConsultor e pela V2Home. Nao duplicar".
 * Numerador: `gmd_numerador_kg` da view, conferido IDENTICO a
 * `producao_biologica` do zoot_mensal_cache nos 7 meses da Santa Rita
 * (22/08/2026) — que e o `prodKg` que o PC-100 consome
 * (buildMonthlyDataFromView:172). Usar a view evita somar por categoria e
 * dispensa consulta nova.
 *
 * CASTS: `zoot_mensal_cache` NAO esta em src/integrations/supabase/types.ts.
 * `vw_zoot_fazenda_mensal` esta, mas o client nao resolve view sem
 * relationship e o repo ja a le com `as any` (useZootMensal, ResumoTab).
 * `lancamentos` esta nos types e e lida SEM cast.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TIPOS_DESFRUTE_OFICIAL, computePeriodGmd } from '@/lib/calculos/painelConsultorIndicadores';

export interface ProdutivoPorFazenda {
  fazenda_id: string;
  cabecas: number;
  gmd: number | null;
  ua_media: number;
  arrobas: number;
  arrIniciais: number;
  arrVendidas: number;
  /* Serie mensal de UA, indice 0 = Jan, `null` em mes sem linha. O valor
     colapsado `ua_media` CONTINUA existindo e nao mudou — quem precisa da
     lotacao do periodo cruza esta serie com a serie de area, mes a mes,
     porque media de razoes nao e razao de medias quando a area varia. */
  uaPorMes: (number | null)[];
}

/* @ do mes = producao biologica / 30 — mesma regra do PC-100. */
const KG_POR_ARROBA = 30;
/* Carcaca: 15 kg por arroba. Regra oficial, copiada de usePainelConsultorData. */
const KG_POR_ARROBA_CARCACA = 15;

const mm = (m: number) => String(m).padStart(2, '0');

export function useProdutivoPorFazenda(
  clienteId: string | undefined,
  ano: number,
  ateMes: number,
  isPeriodo: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: ['produtivo-por-fazenda', clienteId, ano, ateMes, isPeriodo],
    queryFn: async (): Promise<ProdutivoPorFazenda[]> => {
      const mesIni = isPeriodo ? 1 : ateMes;
      const meses: number[] = [];
      for (let m = mesIni; m <= ateMes; m++) meses.push(m);

      const [vwRes, cacheRes, lancRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('vw_zoot_fazenda_mensal' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('fazenda_id, mes, cabecas_inicio, cabecas_final, dias_mes, gmd_kg_cab_dia, gmd_numerador_kg, ua_media, peso_inicio_kg') as any)
          .eq('cliente_id', clienteId!)
          .eq('ano', ano)
          .in('mes', meses)
          .eq('cenario', 'realizado'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('zoot_mensal_cache' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('fazenda_id, producao_biologica') as any)
          .eq('cliente_id', clienteId!)
          .eq('ano', ano)
          .in('mes', meses)
          .eq('cenario', 'realizado'),
        supabase
          .from('lancamentos')
          .select('fazenda_origem, tipo, quantidade, peso_medio_kg, peso_carcaca_kg')
          .eq('cliente_id', clienteId!)
          .eq('cancelado', false)
          .eq('status_operacional', 'realizado')
          /* cenario = 'realizado', igual a usePainelConsultorData. O briefing pedia
             <> 'meta', que aceitaria um terceiro cenario (projecao, simulacao) que a
             fonte canonica descarta — e o desfrute desta tabela divergiria do resto
             da tela por essa porta. Alinhado de proposito. */
          .eq('cenario', 'realizado')
          .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
          .gte('data', `${ano}-${mm(mesIni)}-01`)
          .lte('data', `${ano}-${mm(ateMes)}-31`),
      ]);
      if (vwRes.error) throw vwRes.error;
      if (cacheRes.error) throw cacheRes.error;
      if (lancRes.error) throw lancRes.error;

      /* producao_biologica vem por CATEGORIA: somar por fazenda antes de dividir.
         SEMPRE acumulada no periodo — producao soma, nao promedia. */
      type LinhaCache = { fazenda_id: string | null; producao_biologica: number | null };
      const bioPorFazenda = new Map<string, number>();
      for (const row of (cacheRes.data ?? []) as LinhaCache[]) {
        if (!row.fazenda_id) continue;
        bioPorFazenda.set(
          row.fazenda_id,
          (bioPorFazenda.get(row.fazenda_id) ?? 0) + (Number(row.producao_biologica) || 0),
        );
      }

      /* @ vendidas por fazenda de ORIGEM. Tambem acumulada no periodo. */
      type LinhaLanc = {
        fazenda_origem: string | null;
        tipo: string | null;
        quantidade: number | null;
        peso_medio_kg: number | null;
        peso_carcaca_kg: number | null;
      };
      const vendPorFazenda = new Map<string, number>();
      for (const r of (lancRes.data ?? []) as LinhaLanc[]) {
        if (!r.fazenda_origem) continue;
        const qtd = Number(r.quantidade) || 0;
        let arr = 0;
        if (r.tipo === 'abate') {
          const pc = Number(r.peso_carcaca_kg) || 0;
          if (pc > 0) arr = (qtd * pc) / KG_POR_ARROBA_CARCACA;
        } else {
          const pmk = Number(r.peso_medio_kg) || 0;
          if (pmk > 0) arr = (qtd * pmk) / KG_POR_ARROBA;
        }
        if (arr > 0) {
          vendPorFazenda.set(r.fazenda_origem, (vendPorFazenda.get(r.fazenda_origem) ?? 0) + arr);
        }
      }

      /* Da view, o que e MEDIA no periodo: divisor por fazenda, contando so os
         meses em que aquela fazenda tem linha. GMD tem divisor PROPRIO — mes sem
         GMD nao deve diluir a media dos meses que tem. */
      type LinhaVw = {
        fazenda_id: string | null;
        mes: number | null;
        cabecas_inicio: number | null;
        cabecas_final: number | null;
        dias_mes: number | null;
        gmd_kg_cab_dia: number | null;
        gmd_numerador_kg: number | null;
        ua_media: number | null;
        peso_inicio_kg: number | null;
      };
      type Acc = {
        cab: number; ua: number; arrIni: number;
        n: number; gmdSoma: number; gmdN: number;
        /* Divisor PROPRIO para a media mensal, igual ao do GMD: o PC-100
           descarta mes com media <= 0 (`filter(v => !isNaN(v) && v > 0)`,
           usePainelConsultorData:1609-1611), e um mes zerado nao pode
           diluir a media dos meses que tem rebanho. */
        medSoma: number; medN: number;
        /* Series de 12 posicoes (indice 0 = Jan), no formato que
           `computePeriodGmd` exige. Mes sem linha fica em zero: prodBio 0 nao
           soma, cabMedia 0 e descartada pelo `cm > 0` da funcao, e dias 0 nao
           acumula — entao o resultado no indice `ateMes-1` cobre exatamente
           Jan..ateMes, sem meses futuros contaminarem. */
        prodBio12: number[]; cabMedia12: number[]; dias12: number[];
        ua12: (number | null)[];
      };
      const acc = new Map<string, Acc>();
      for (const row of (vwRes.data ?? []) as LinhaVw[]) {
        if (!row.fazenda_id) continue;
        let a = acc.get(row.fazenda_id);
        if (!a) {
          a = {
            cab: 0, ua: 0, arrIni: 0, n: 0, gmdSoma: 0, gmdN: 0, medSoma: 0, medN: 0,
            prodBio12: Array(12).fill(0), cabMedia12: Array(12).fill(0), dias12: Array(12).fill(0),
            ua12: Array(12).fill(null),
          };
          acc.set(row.fazenda_id, a);
        }
        a.cab += Number(row.cabecas_final) || 0;
        const mediaMes = ((Number(row.cabecas_inicio) || 0) + (Number(row.cabecas_final) || 0)) / 2;
        if (mediaMes > 0) { a.medSoma += mediaMes; a.medN += 1; }
        const idx = (Number(row.mes) || 0) - 1;
        if (idx >= 0 && idx < 12) {
          a.prodBio12[idx] = Number(row.gmd_numerador_kg) || 0;
          a.cabMedia12[idx] = mediaMes;
          a.dias12[idx] = Number(row.dias_mes) || 0;
          /* null, nao 0: mes sem UA e AUSENCIA. Zero entraria como lotacao
             zero e derrubaria a media do periodo. */
          a.ua12[idx] = row.ua_media == null ? null : Number(row.ua_media);
        }
        a.ua += Number(row.ua_media) || 0;
        a.arrIni += (Number(row.peso_inicio_kg) || 0) / KG_POR_ARROBA;
        a.n += 1;
        if (row.gmd_kg_cab_dia != null) { a.gmdSoma += Number(row.gmd_kg_cab_dia); a.gmdN += 1; }
      }

      const out: ProdutivoPorFazenda[] = [];
      for (const [fazenda_id, a] of acc) {
        if (a.n === 0) continue;
        out.push({
          fazenda_id,
          /* Media de medias mensais, nao media dos finais: e a regra do
             cabMediaAcumulada do PC-100 (usePainelConsultorData:1607-1615),
             que promedia `cabMediaMes = (cabIni + cabFin) / 2`. Medido em
             22/08 na Santa Rita, Jan-Jul/2026 — media dos finais dava 3.817
             contra 3.909 do indicador, e a linha divergia do Total com uma
             fazenda so.
             No MES o divisor e 1 e o valor tem de ser o saldo FINAL, que e o
             que o PC-100 usa fora do periodo — dai o ramo, e nao uma formula
             so. Medido: julho/2026 = 3.316 nos dois. */
          cabecas: isPeriodo
            ? (a.medN > 0 ? a.medSoma / a.medN : 0)
            : a.cab / a.n,
          /* GMD acumulado, nao media simples: e a regra do computePeriodGmd do
             PC-100. Media simples trata julho e janeiro como iguais; o acumulado
             pesa pelo rebanho e pelos dias de cada mes. Medido em 22/08 na Santa
             Rita, Jan-Jul/2026 — 0,3803 na media simples contra 0,3872 do
             acumulado, 1,81% de diferenca, e ela cresce com a variacao do
             rebanho (4.545 -> 3.208 cab no periodo).
             No MES a funcao nao se aplica: o valor e o gmd_kg_cab_dia do proprio
             mes, e a view ja o calcula como prodBio/cabMedia/dias — a MESMA
             formula pontual do PC-100 (useHistoricoIndicador:899-902).
             Conferido: julho/2026 = 0,2619 nos dois. Por isso o ramo.
             NaN vira null: GMD ausente e AUSENCIA, nao zero — fazenda sem
             fechamento nao ganhou 0 kg/dia. */
          gmd: (() => {
            if (!isPeriodo) return a.gmdN > 0 ? a.gmdSoma / a.gmdN : null;
            const serie = computePeriodGmd(a.prodBio12, a.cabMedia12, a.dias12);
            const v = serie[ateMes - 1];
            return v == null || isNaN(v) ? null : v;
          })(),
          ua_media: a.ua / a.n,
          uaPorMes: a.ua12,
          arrIniciais: a.arrIni / a.n,
          arrobas: (bioPorFazenda.get(fazenda_id) ?? 0) / KG_POR_ARROBA,
          arrVendidas: vendPorFazenda.get(fazenda_id) ?? 0,
        });
      }
      return out;
    },
    enabled: enabled && !!clienteId && Number.isFinite(ano) && Number.isFinite(ateMes),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
