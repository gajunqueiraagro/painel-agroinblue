/**
 * BlocoConferenciaMensalRebanhoFechamento.tsx — FASE 3 / PR3.3C
 *
 * Slide B do par Movimentações: prancha de conferência operacional.
 * Mostra a tabela Jan→Dez completa do rebanho (Saldo Início, movimentos,
 * Saldo Final) por mês, com totais. Auditoria operacional.
 *
 * Slide A (narrativa) = BlocoMovimentacoesRebanhoFechamento.
 * Os dois consomem o mesmo useMovimentacoesAgregadas (cache compartilhado
 * pela queryKey idêntica — sem custo extra de queries).
 *
 * Evolução: faixa executiva resumida abaixo da tabela (Nascimentos,
 * Compras, Abates, Vendas, Consumo, Mortes) consumindo lentes oficiais
 * do hook — zero recálculo local. Container mantém mesma altura via
 * flex layout (tabela flex-1 min-h-0, faixa shrink-0).
 */
import { useMemo } from 'react';
import { Baby, Beef, DollarSign, ShoppingCart, Skull, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMovimentacoesAgregadas,
  type TipoMov,
  type Lente,
  type CardData,
} from '@/v2/hooks/useMovimentacoesAgregadas';
import {
  fmtCab,
  MESES_CURTOS,
  buildLinhas,
  corSinal,
  DeltaTag,
  calcDeltaPct,
} from './BlocoMovimentacoesRebanhoFechamento';

interface Props {
  ano: number;
  mes: number;
  viewMode: 'mes' | 'periodo';
  isGlobal: boolean;
}

// ─── Faixa Executiva Resumida ────────────────────────────────────────
// Consome apenas porTipo do hook oficial. Zero cálculo aqui — soma já
// está em mesAtual/meta/mesAnoAnt por lente.

interface MetricaTrio {
  valor: number | null;
  meta: number | null;
  anoAnt: number | null;
}

interface LinhaResumo {
  tipo: TipoMov;
  label: string;
  Icone: LucideIcon;
  corLabel: string;
  /** Para Qtde (lente cab) — true se menor é melhor (Mortes). */
  qtdeEhDespesa: boolean;
  /** Quando true, renderiza colunas de Preço @ e Valor R$. */
  comFinanceiro: boolean;
  /** Para Compras: preço alto e valor alto = ruim → true. Demais: false. */
  precoEhDespesa: boolean;
  valorEhDespesa: boolean;
}

const LINHAS_GLOBAIS: ReadonlyArray<LinhaResumo> = [
  { tipo: 'nascimentos', label: 'Nascimentos', Icone: Baby,         corLabel: 'text-emerald-700', qtdeEhDespesa: false, comFinanceiro: false, precoEhDespesa: false, valorEhDespesa: false },
  { tipo: 'compras',     label: 'Compras',     Icone: ShoppingCart, corLabel: 'text-sky-700',     qtdeEhDespesa: false, comFinanceiro: true,  precoEhDespesa: true,  valorEhDespesa: true  },
  { tipo: 'abates',      label: 'Abates',      Icone: Beef,          corLabel: 'text-orange-700',  qtdeEhDespesa: false, comFinanceiro: true,  precoEhDespesa: false, valorEhDespesa: false },
  { tipo: 'vendas',      label: 'Vendas',      Icone: DollarSign,    corLabel: 'text-emerald-700', qtdeEhDespesa: false, comFinanceiro: true,  precoEhDespesa: false, valorEhDespesa: false },
  { tipo: 'consumos',    label: 'Consumo',     Icone: Utensils,      corLabel: 'text-cyan-700',    qtdeEhDespesa: false, comFinanceiro: false, precoEhDespesa: false, valorEhDespesa: false },
  { tipo: 'mortes',      label: 'Mortes',      Icone: Skull,         corLabel: 'text-red-700',     qtdeEhDespesa: true,  comFinanceiro: false, precoEhDespesa: false, valorEhDespesa: false },
];

function fmtMoeda(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);
}

function tri(card: CardData | undefined, lente: Lente): MetricaTrio {
  return {
    valor:  card?.mesAtual[lente]  ?? null,
    meta:   card?.meta[lente]      ?? null,
    anoAnt: card?.mesAnoAnt[lente] ?? null,
  };
}

// Desktop-first: MOVIMENTO mais estreita, cabecas/preco/valor mais largas
// para evitar wrap dos deltas. Sum fixos = 640px + label max 140 = 780px.
const GRID_FAIXA =
  'grid grid-cols-[minmax(110px,140px)_72px_60px_60px_96px_60px_60px_112px_60px_60px] gap-1 items-center';

function FaixaExecutivaResumo({
  porTipo,
}: {
  porTipo: Record<TipoMov, CardData>;
}) {
  return (
    <div className="shrink-0 border-t border-border/40 pt-1.5 mt-1.5">
      {/* Header de grupos */}
      <div className={`${GRID_FAIXA} text-[9px] text-muted-foreground uppercase tracking-wider px-1`}>
        <div />
        <div className="col-span-3 text-center border-b border-border/30 pb-0.5">Cabeças</div>
        <div className="col-span-3 text-center border-b border-border/30 pb-0.5">Preço R$/@</div>
        <div className="col-span-3 text-center border-b border-border/30 pb-0.5">Valor R$</div>
      </div>
      {/* Sub-header de colunas */}
      <div className={`${GRID_FAIXA} text-[9px] text-muted-foreground tracking-wider px-1 pt-0.5 pb-1 border-b border-border/30`}>
        <div className="font-semibold">MOVIMENTO</div>
        <div className="text-right">Qtde</div>
        <div className="text-right">vs M</div>
        <div className="text-right">vs A-1</div>
        <div className="text-right">R$/@</div>
        <div className="text-right">vs M</div>
        <div className="text-right">vs A-1</div>
        <div className="text-right">Total</div>
        <div className="text-right">vs M</div>
        <div className="text-right">vs A-1</div>
      </div>
      {/* Linhas */}
      {LINHAS_GLOBAIS.map((linha) => {
        const card = porTipo[linha.tipo];
        const qtde = tri(card, 'cab');
        const preco = linha.comFinanceiro ? tri(card, 'preco_arroba') : null;
        const valor = linha.comFinanceiro ? tri(card, 'valor_total')  : null;

        const Icone = linha.Icone;
        return (
          <div
            key={linha.tipo}
            className={`${GRID_FAIXA} px-1 py-0.5 border-b border-border/20 last:border-0 hover:bg-muted/20`}
          >
            {/* Label */}
            <div className="flex items-center gap-1 min-w-0">
              <Icone className={`h-4 w-4 shrink-0 ${linha.corLabel}`} />
              <span className={`text-[14px] font-semibold truncate ${linha.corLabel}`}>
                {linha.label}
              </span>
            </div>

            {/* Qtde + deltas */}
            <div className="text-right tabular-nums text-[14px] font-bold whitespace-nowrap">
              {fmtCab(qtde.valor)}
            </div>
            <div className="text-right text-[12px] whitespace-nowrap">
              <DeltaTag delta={calcDeltaPct(qtde.valor, qtde.meta)} ehDespesa={linha.qtdeEhDespesa} />
            </div>
            <div className="text-right text-[12px] whitespace-nowrap">
              <DeltaTag delta={calcDeltaPct(qtde.valor, qtde.anoAnt)} ehDespesa={linha.qtdeEhDespesa} />
            </div>

            {/* Preço @ + deltas */}
            {preco ? (
              <>
                <div className="text-right tabular-nums text-[13px] font-semibold whitespace-nowrap">
                  {fmtMoeda(preco.valor)}
                </div>
                <div className="text-right text-[12px] whitespace-nowrap">
                  <DeltaTag delta={calcDeltaPct(preco.valor, preco.meta)}   ehDespesa={linha.precoEhDespesa} />
                </div>
                <div className="text-right text-[12px] whitespace-nowrap">
                  <DeltaTag delta={calcDeltaPct(preco.valor, preco.anoAnt)} ehDespesa={linha.precoEhDespesa} />
                </div>
              </>
            ) : (
              <>
                <div className="text-right text-muted-foreground/40">—</div>
                <div />
                <div />
              </>
            )}

            {/* Valor R$ + deltas */}
            {valor ? (
              <>
                <div className="text-right tabular-nums text-[13px] font-semibold whitespace-nowrap">
                  {fmtMoeda(valor.valor)}
                </div>
                <div className="text-right text-[12px] whitespace-nowrap">
                  <DeltaTag delta={calcDeltaPct(valor.valor, valor.meta)}   ehDespesa={linha.valorEhDespesa} />
                </div>
                <div className="text-right text-[12px] whitespace-nowrap">
                  <DeltaTag delta={calcDeltaPct(valor.valor, valor.anoAnt)} ehDespesa={linha.valorEhDespesa} />
                </div>
              </>
            ) : (
              <>
                <div className="text-right text-muted-foreground/40">—</div>
                <div />
                <div />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BlocoConferenciaMensalRebanhoFechamento({
  ano,
  mes,
  viewMode,
  isGlobal,
}: Props) {
  const { loading, porTipo, saldoInicialAnual } = useMovimentacoesAgregadas({
    ano,
    mes,
    viewMode,
    isGlobal,
  });

  // Saldo chain — mesma lógica do bloco narrativo (cache compartilhado pela queryKey).
  const { saldoInicial, saldoFinal } = useMemo(() => {
    const si: number[] = [0];
    const sf: number[] = [0];
    let cur = saldoInicialAnual;
    for (let m = 1; m <= 12; m++) {
      const ent = porTipo['soma_entradas']?.seriesJanDez.cab.real[m] ?? 0;
      const sai = porTipo['soma_saidas']?.seriesJanDez.cab.real[m] ?? 0;
      si.push(cur);
      sf.push(cur + ent - sai);
      cur = cur + ent - sai;
    }
    return { saldoInicial: si, saldoFinal: sf };
  }, [saldoInicialAnual, porTipo]);

  const colunas = Array.from({ length: 12 }, (_, i) => i + 1);
  const linhas  = buildLinhas(isGlobal);

  if (loading) {
    return (
      <div className="my-6 p-4 text-sm text-muted-foreground">
        Carregando conferência mensal…
      </div>
    );
  }

  // Wrapper inline (não usa ExecutiveSlide aqui): bloco renderiza em altura
  // NATURAL — sem h-[560px] fixo nem overflow interno. Pagina externa scrolla.
  // Visual identico ao ExecutiveSlide (header/body/footer + tokens shadcn).
  return (
    <section
      className={cn(
        'w-full max-w-[1280px] mx-auto my-6',
        'bg-card border border-border rounded-lg shadow-sm',
        'flex flex-col',
        'print:break-inside-avoid print:shadow-none print:max-w-full',
      )}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2.5 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground leading-tight truncate">
            Conferência Mensal — Movimentação do Rebanho
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
            {`Jan a ${String(mes).padStart(2, '0')}/${ano} · Auditoria operacional + Resumo executivo`}
          </p>
        </div>
      </header>

      {/* Conteudo — sem overflow interno. Tabela e Faixa empilhadas em altura natural. */}
      <div className="px-5 py-3 flex flex-col gap-2">
        {/* Tabela mensal — sem container scrollavel; pagina scrolla se exceder viewport. */}
        <div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/60">
                <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/60 min-w-[120px]">
                  Movimentação
                </th>
                {colunas.map(m => (
                  <th key={m} className="text-right px-2 py-1.5 font-semibold min-w-[52px]">
                    {MESES_CURTOS[m - 1]}
                  </th>
                ))}
                <th className="text-right px-2 py-1.5 font-semibold min-w-[64px] border-l border-border/60">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((row, idx) => {
                const isSaldoInicio = row.label === 'Saldo Início';
                const isSaldoFinal  = row.label === 'Saldo Final';
                const isSaldo = isSaldoInicio || isSaldoFinal;
                return (
                  <tr
                    key={idx}
                    className={isSaldo ? 'bg-muted/40 border-t border-border/40' : 'hover:bg-muted/20'}
                  >
                    <td className={`px-2 py-1 sticky left-0 ${isSaldo ? 'bg-muted/40 font-semibold' : 'bg-background'} ${corSinal(row.sinal)}`}>
                      {!isSaldo && (
                        <span className="mr-1 opacity-50">
                          {row.sinal === 'entrada' ? '+' : '–'}
                        </span>
                      )}
                      {row.label}
                    </td>
                    {colunas.map(m => {
                      const futuro = m > mes;
                      let v: number;
                      if (isSaldoInicio)     v = saldoInicial[m];
                      else if (isSaldoFinal)  v = saldoFinal[m];
                      else                    v = row.tipo ? (porTipo[row.tipo]?.seriesJanDez.cab.real[m] ?? 0) : 0;
                      return (
                        <td
                          key={m}
                          className={`text-right px-2 py-1 tabular-nums ${
                            futuro ? 'text-muted-foreground/30 bg-muted/10' : corSinal(row.sinal)
                          }`}
                        >
                          {futuro || v === 0
                            ? <span className="text-muted-foreground/30">—</span>
                            : fmtCab(v)}
                        </td>
                      );
                    })}
                    <td className={`text-right px-2 py-1 tabular-nums border-l border-border/60 ${isSaldo ? 'font-semibold' : ''} ${corSinal(row.sinal)}`}>
                      {(() => {
                        if (isSaldoInicio) return fmtCab(saldoInicial[1]);
                        if (isSaldoFinal)  return fmtCab(saldoFinal[mes]);
                        const tot = colunas
                          .filter(m => m <= mes)
                          .reduce((s, m) => s + (row.tipo ? (porTipo[row.tipo]?.seriesJanDez.cab.real[m] ?? 0) : 0), 0);
                        return tot !== 0
                          ? fmtCab(tot)
                          : <span className="text-muted-foreground/30">—</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Faixa executiva resumida (Resumo) — consome lentes oficiais. */}
        <FaixaExecutivaResumo porTipo={porTipo} />
      </div>

      {/* Footer */}
      <footer className="shrink-0 px-5 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        Saldos encadeados mês a mês · Meses futuros em cinza · Fonte: lançamentos realizados
      </footer>
    </section>
  );
}
