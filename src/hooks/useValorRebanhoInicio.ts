/**
 * O RETRATO DE 1º DE JANEIRO — o card "Início" da Evolução Patrimonial.
 *
 * ⚠ ELE LÊ A MESMA REGRA DO P0 DO DRE, e não uma parecida: fechamento de dezembro do ano anterior
 * quando existe; senão o `zoot_mensal_cache` do primeiro mês do ano (o cadastro materializado). Se
 * a tela tivesse fonte própria, o mesmo 1º de janeiro teria dois valores — um no DRE e outro aqui —
 * e nenhum dos dois estaria errado sozinho. Medido no SR 2021: as duas fontes dão o MESMO retrato,
 * 3.607 cabeças e 35.201,84 @; é quando elas divergem que ter uma regra só importa.
 *
 * ⚠ O PREÇO DO FALLBACK VEM DO FECHAMENTO DE JANEIRO, por categoria, com `max(preco_kg)` — que é
 * exatamente o que a CTE `pk_ini` de `fn_dre_pecuaria` faz. ⚠ E `max` NÃO É MÉDIA: a dívida está
 * registrada como PK-INI-PONDERADO-01 no CLAUDE.md. Copiei o defeito de propósito — corrigi-lo só
 * aqui faria esta tela divergir do DRE, que é o oposto do que este hook existe para garantir.
 *
 * ⚠ NENHUM CÁLCULO NOVO: soma, divisão e a arroba da casa. O que não há vira `null`, nunca zero.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { kgToArrobas } from '@/types/cattle';

export interface CategoriaInicio {
  categoria: string;
  quantidade: number;
  pesoMedioKg: number | null;
  precoKg: number | null;
  valor: number;
}

export interface RebanhoInicio {
  categorias: CategoriaInicio[];
  cabecas: number;
  arrobas: number;
  valor: number;
  /** De onde o retrato veio — a faixa do card diz isto em voz alta. */
  origem: 'fechamento' | 'cadastro' | 'vazio';
  /** O mês do fechamento que serviu de base, para a faixa: "2020-12". */
  mesBase: string;
}

const VAZIO = (mesBase: string): RebanhoInicio =>
  ({ categorias: [], cabecas: 0, arrobas: 0, valor: 0, origem: 'vazio', mesBase });

export function useValorRebanhoInicio(
  ano: number,
  fazendaId: string | undefined,
  clienteId?: string | null,
) {
  const [dados, setDados] = useState<RebanhoInicio | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(ano)) { setDados(null); return; }
    /**
     * ⚠ O GLOBAL LÊ A FONTE DO DRE, NÃO SOMA AS FAZENDAS AQUI — COMPACTO-03. Somar seria a
     * terceira versão do mesmo 1º de janeiro, ao lado do fechamento e do cache. A
     * `fn_dre_pecuaria_patrimonio` com `p_fazenda` nulo já agrega o cliente, e é dela que o modal
     * da variação e o DRE tiram os números — medido no SR 2021: 3.607 cab, 35.201,84 @,
     * R$ 8.643.826,74.
     * ⚠ A QUEBRA POR CATEGORIA VEM DE `categorias[]`, não de `movimentos.inicio`: medido, este
     * traz só `cabecas`, `arrobas` e `valor` — é o total. As duas leituras são do MESMO payload.
     */
    if (fazendaId === '__global__') {
      if (!clienteId) { setDados(null); return; }
      let vivoG = true;
      setCarregando(true);
      (async () => {
        try {
          const { data } = await (supabase as any).rpc('fn_dre_pecuaria_patrimonio', {
            p_cliente: clienteId, p_fazenda: null,
            p_de: `${ano}-01`, p_ate: `${ano}-01`,
          });
          if (!vivoG) return;
          const o = (data ?? {}) as Record<string, unknown>;
          const cats = Array.isArray(o.categorias) ? o.categorias : [];
          const mov = (o.movimentos ?? {}) as Record<string, unknown>;
          const ini = (mov.inicio ?? {}) as Record<string, unknown>;
          const linhas: CategoriaInicio[] = cats.map((x: Record<string, unknown>) => {
            const q = Number(x.q0) || 0;
            const pm = x.pm0 == null ? null : Number(x.pm0);
            const pk = x.pk0 == null ? null : Number(x.pk0);
            return { categoria: String(x.categoria), quantidade: q, pesoMedioKg: pm, precoKg: pk,
              valor: Number(x.v0) || 0 };
          }).filter((l: CategoriaInicio) => l.quantidade !== 0);
          if (!vivoG) return;
          setDados(linhas.length === 0 && !Number(ini.cabecas) ? VAZIO(`${ano - 1}-12`) : {
            categorias: linhas.sort((a, b) => a.categoria.localeCompare(b.categoria)),
            /* ⚠ O TOTAL VEM DE `movimentos.inicio`, não da soma das linhas: é o número que o DRE
               mostra, e recalcular abriria divergência no primeiro arredondamento. */
            cabecas: Number(ini.cabecas) || 0,
            arrobas: Number(ini.arrobas) || 0,
            valor: Number(ini.valor) || 0,
            origem: 'fechamento', mesBase: `${ano - 1}-12`,
          });
        } catch {
          if (vivoG) setDados(VAZIO(`${ano - 1}-12`));
        } finally {
          if (vivoG) setCarregando(false);
        }
      })();
      return () => { vivoG = false; };
    }
    if (!fazendaId) { setDados(null); return; }
    let vivo = true;
    const dez = `${ano - 1}-12`;
    const jan = `${ano}-01`;
    setCarregando(true);
    (async () => {
      try {
        const { data: fech } = await (supabase as any)
          .from('valor_rebanho_fechamento_itens')
          .select('categoria, quantidade, peso_medio_kg, preco_kg')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', dez);
        if (!vivo) return;

        const linhas: CategoriaInicio[] = [];
        if (Array.isArray(fech) && fech.length > 0) {
          for (const r of fech) {
            const q = Number(r.quantidade) || 0;
            const pm = r.peso_medio_kg == null ? null : Number(r.peso_medio_kg);
            const pk = r.preco_kg == null ? null : Number(r.preco_kg);
            linhas.push({ categoria: String(r.categoria), quantidade: q, pesoMedioKg: pm, precoKg: pk,
              valor: q * (pm ?? 0) * (pk ?? 0) });
          }
          if (vivo) setDados(agregar(linhas, 'fechamento', dez));
          return;
        }

        /* Sem fechamento de dezembro: o cadastro materializado do primeiro mês do ano. */
        const [{ data: cache }, { data: precos }] = await Promise.all([
          (supabase as any).from('zoot_mensal_cache')
            .select('categoria_codigo, saldo_inicial, peso_medio_inicial')
            .eq('fazenda_id', fazendaId).eq('ano_mes', jan).eq('cenario', 'realizado'),
          (supabase as any).from('valor_rebanho_fechamento_itens')
            .select('categoria, preco_kg').eq('fazenda_id', fazendaId).eq('ano_mes', jan),
        ]);
        if (!vivo) return;

        const pkPorCat = new Map<string, number>();
        for (const p of (Array.isArray(precos) ? precos : [])) {
          const k = String(p.categoria); const v = Number(p.preco_kg);
          if (Number.isFinite(v)) pkPorCat.set(k, Math.max(pkPorCat.get(k) ?? -Infinity, v));
        }
        for (const r of (Array.isArray(cache) ? cache : [])) {
          const q = Number(r.saldo_inicial) || 0;
          const pm = r.peso_medio_inicial == null ? null : Number(r.peso_medio_inicial);
          const pk = pkPorCat.get(String(r.categoria_codigo)) ?? null;
          linhas.push({ categoria: String(r.categoria_codigo), quantidade: q, pesoMedioKg: pm,
            precoKg: pk, valor: q * (pm ?? 0) * (pk ?? 0) });
        }
        if (vivo) setDados(linhas.length > 0 ? agregar(linhas, 'cadastro', jan) : VAZIO(dez));
      } catch {
        if (vivo) setDados(VAZIO(dez));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [ano, fazendaId, clienteId]);

  return { inicio: dados, carregando };
}

/** ⚠ CATEGORIA ZERADA SOME: uma linha de zeros não responde pergunta nenhuma. */
function agregar(linhas: CategoriaInicio[], origem: 'fechamento' | 'cadastro', mesBase: string): RebanhoInicio {
  const vivas = linhas.filter(l => l.quantidade !== 0);
  const cabecas = vivas.reduce((a, l) => a + l.quantidade, 0);
  const kg = vivas.reduce((a, l) => a + l.quantidade * (l.pesoMedioKg ?? 0), 0);
  const valor = vivas.reduce((a, l) => a + l.valor, 0);
  return {
    categorias: vivas.sort((a, b) => a.categoria.localeCompare(b.categoria)),
    cabecas, arrobas: kgToArrobas(kg), valor, origem, mesBase,
  };
}
