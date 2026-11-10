/**
 * VISAO-GERAL-02 — os cartões do topo da Visão Geral (mock aprovado, 03/11/2026). Cada cartão é um BOTÃO para a tela dona do número
 * (o "Abrir … ›" fica no `title`), e o número chega pronto da fonte dessa tela. Sem valor = "—", nunca zero.
 * VISAO-GERAL-03 (Gabriel 04/11 06:28, "fontes e cards grandes demais"): o cartão é o `Kpi` da Geo pastos › Global — rótulo 9,5 px,
 * número 14 px, o detalhe ao lado do número —, todos numa faixa só. Nenhum tamanho próprio aqui.
 * VISAO-GERAL-05 (07:31): a hierarquia do número (o Kpi: valor 24 px em negrito + unidade; rótulo e detalhe embaixo; a comparação ▲ meta ·
 * ▼ ano ant. embaixo do rótulo).
 */
import { Kpi } from '@/components/mapa-geo/GeoPastosGlobal';
import { Comparacao } from './Comparacao';

export interface CartaoVG {
  id: string;
  titulo: string;
  valor: string | null;
  detalhe?: string | null;
  /** VISAO-GERAL-05 — a unidade menor ao lado do número ("ha", "cab", "UA/ha") e a variação contra a meta e o ano anterior (%) */
  unidade?: string | null;
  meta?: number | null;
  /** VG-RESULTADO-RS-01 — a diferença em R$ contra a meta, no lugar do % (o Resultado com valor ou meta ≤ 0) */
  metaEmReais?: number | null;
  anoAnt?: number | null;
  /** VG-RESULTADO-RS-01 — o mesmo contra o ano anterior */
  anoAntEmReais?: number | null;
  tomDetalhe?: 'neutro' | 'positivo' | 'negativo';
  abrir: string;
  onAbrir?: () => void;
}

export function CartoesDoTopo({ cartoes, carregando }: { cartoes: readonly CartaoVG[]; carregando?: boolean }) {
  return (
    /* VISAO-GERAL-03 (Gabriel 08/11 09:04): os cinco na MESMA régua, numa linha só e do mesmo tamanho (o "Resultado do ano" não ocupa mais
       a linha inteira); o cartão compacto (`Kpi compacto`) */
    <section aria-label="Resumo" className="grid flex-none grid-cols-5 gap-1.5" data-testid="vg-cartoes">
      {cartoes.map((c) => (
        <button key={c.id} type="button" onClick={c.onAbrir} disabled={!c.onAbrir} title={`${c.abrir} ›`} data-testid={`vg-cartao-${c.id}`}
          className="flex min-w-0 text-left disabled:cursor-default [&>div]:hover:border-[#2B6CB0]">
          <Kpi compacto rotulo={c.titulo} valor={carregando && c.valor == null ? '…' : (c.valor ?? '—')} unidade={c.valor == null ? null : c.unidade ?? null}
            variacao={<>
              {/* o detalhe ("+R$ 380K no mês", "61,5% de 7.450 ha") na linha de baixo, antes da comparação: no rótulo ele passava do card */}
              {c.detalhe && <span className="text-muted-foreground">{c.detalhe}</span>}
              {c.detalhe && (c.meta != null || c.metaEmReais != null || c.anoAnt != null || c.anoAntEmReais != null) && <span className="text-muted-foreground"> · </span>}
              <Comparacao i={{ meta: c.meta ?? null, metaEmReais: c.metaEmReais ?? null, anoAnt: c.anoAnt ?? null, anoAntEmReais: c.anoAntEmReais ?? null }} />
            </>} />
        </button>
      ))}
    </section>
  );
}
