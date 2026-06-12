/**
 * ComposicaoFinanceira — pizza (Fechamento) + tabela de linhas Entradas/Saídas,
 * extraída VERBATIM do BlocoResumoExecutivo (PR-BOLETIM-2.1A, refactor puro).
 *
 * Mode-aware (preserva o runtime exato de hoje):
 *   - 'fechamento'   → <section> sub-card (pizzas + tabelas) — = subCard de antes.
 *   - 'planejamento' → só as tabelas (sem wrapper, sem pizza) — = {!isFechamento && tabelasJsx}.
 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { fmtBRL, DeltaBadge } from './resumoExecutivoUI';
import type {
  BlocoResumoExecutivoData,
  LinhaExecutiva,
} from '@/v2/lib/blocoResumoExecutivoTypes';

export type LinhaModalKey =
  | 'receitaPecuaria' | 'receitaAgricultura' | 'outrasReceitas' | 'entradasFinanceiras'
  | 'custeioPecuaria' | 'custeioAgricultura'
  | 'jurosPecuaria' | 'jurosAgricultura'
  | 'investimentoPecuaria' | 'investimentoAgricultura'
  | 'reposicaoBovinos'
  | 'amortizacaoPecuaria' | 'amortizacaoAgricultura'
  | 'dividendos' | 'deducoesReceita';

// Classe utilitária para a coluna META 2026 — identidade laranja do
// Planejamento (espelha COR_META=#f97316 = orange-500). Aplicada no header
// da coluna e em todos os valores. REAL 2025 e Δ% NÃO usam esta classe.
const META_COLUNA = 'text-orange-500 dark:text-orange-400';

// Classe utilitária para a coluna REAL 2026 no modo Fechamento — azul
// (espelha variant 'sky' dos cards). Aplicada no header e nos valores.
const REAL_ANO_CORRENTE_COLUNA = 'text-sky-700 dark:text-sky-300';
// Coluna Real da tabela de SAÍDAS no Fechamento: vermelho (saída de caixa).
const REAL_SAIDA_COLUNA = 'text-red-600 dark:text-red-400';

interface PizzaItem { nome: string; valor: number; cor: string }

// Paleta mais suave (tons 400-500 em vez de 500-700) — menos saturada,
// visualmente mais agradavel para leitura executiva.
const CORES_PIZZA_ENTRADAS = ['#60a5fa', '#4ade80', '#fbbf24', '#a78bfa'];
const CORES_PIZZA_SAIDAS = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#22d3ee', '#a78bfa', '#f472b6', '#9ca3af'];

function PizzaCompacta({ titulo, data, total }: { titulo: string; data: PizzaItem[]; total: number }) {
  // Container leve: sem border/shadow. Apenas layout flex+grid.
  // total === 0 → sem dados, placeholder discreto.
  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </h4>
        <div className="flex items-center justify-center min-h-[160px]">
          <span className="text-[11px] text-muted-foreground italic">Sem dados</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h4>
      <div className="flex items-center gap-2">
        <div className="w-40 h-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="valor"
                nameKey="nome"
                cx="50%"
                cy="50%"
                outerRadius={72}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.cor} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [fmtBRL(v), name]}
                contentStyle={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: 'hsl(var(--background) / 0.85)',
                  border: '1px solid hsl(var(--border) / 0.5)',
                  borderRadius: 6,
                  boxShadow: '0 1px 4px hsl(var(--foreground) / 0.05)',
                  backdropFilter: 'blur(4px)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 flex flex-col gap-0.5 text-[11px] leading-tight min-w-0">
          {data.map((d) => {
            const pct = (d.valor / total) * 100;
            return (
              <div key={d.nome} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ background: d.cor }}
                />
                <span className="truncate min-w-0">{d.nome}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LinhaRow({
  linha,
  destaque = false,
  onClick,
  modo = 'planejamento',
  inverterSemantica = false,
  realSaida = false,
}: {
  linha: LinhaExecutiva;
  destaque?: boolean;
  onClick?: () => void;
  modo?: 'planejamento' | 'fechamento';
  inverterSemantica?: boolean;
  /** Tabela de Saídas no Fechamento: coluna Real em vermelho (saída de caixa). */
  realSaida?: boolean;
}) {
  const isFechamento = modo === 'fechamento';
  const realAC = linha.realAnoCorrente ?? 0;
  const deltaAC = linha.deltaAnoCorrente ?? 0;
  return (
    <div
      onClick={onClick}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center py-[2px] border-b border-border/30 last:border-0',
        // Modo Fechamento: rows mais compactas (leading-none remove
        // entrelinhas; py reduzido). TOTAL ENTRADAS / TOTAL SAÍDAS
        // mantêm py-[4px] e font-bold via destaque.
        isFechamento && !destaque && 'leading-none py-[1px]',
        isFechamento && destaque && 'leading-none py-[3px]',
        destaque && 'bg-muted/40 font-bold border-b-2 border-foreground/20',
        !isFechamento && destaque && 'py-[4px]',
        onClick && 'cursor-pointer hover:bg-muted/40 transition-colors',
      )}
    >
      <div className={cn('text-[11px] truncate', destaque ? 'text-foreground uppercase tracking-wide' : 'text-foreground')}>
        {linha.label}
      </div>
      {isFechamento ? (
        <>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', realSaida ? REAL_SAIDA_COLUNA : REAL_ANO_CORRENTE_COLUNA)}>
            {fmtBRL(realAC)}
          </div>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', META_COLUNA)}>
            {fmtBRL(linha.meta)}
          </div>
          <div className="text-right">
            <DeltaBadge delta={deltaAC} inverterSemantica={inverterSemantica} />
          </div>
        </>
      ) : (
        <>
          <div className={cn('text-[11px] tabular-nums text-right', destaque ? 'text-foreground/80' : 'text-muted-foreground')}>
            {fmtBRL(linha.real)}
          </div>
          <div className={cn('text-[11px] tabular-nums text-right font-semibold', META_COLUNA)}>
            {fmtBRL(linha.meta)}
          </div>
          <div className="text-right">
            <DeltaBadge delta={linha.delta} />
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  data: BlocoResumoExecutivoData;
  modo?: 'planejamento' | 'fechamento';
  onLinhaClick?: (key: LinhaModalKey) => void;
};

export function ComposicaoFinanceira({ data, modo = 'planejamento', onLinhaClick }: Props) {
  // Pares [linha, key] — a key vai pro callback onLinhaClick.
  // Adicionar/remover linhas → manter sincronizado com CONFIG_MODAIS_LINHA
  // no V2PlanejamentoVisaoGeral.tsx.
  const linhasEntrada: Array<[LinhaExecutiva, LinhaModalKey]> = [
    [data.receitaPecuaria, 'receitaPecuaria'],
    [data.receitaAgricultura, 'receitaAgricultura'],
    [data.outrasReceitas, 'outrasReceitas'],
    [data.entradasFinanceiras, 'entradasFinanceiras'],
  ];

  const linhasSaida: Array<[LinhaExecutiva, LinhaModalKey]> = [
    [data.custeioPecuaria, 'custeioPecuaria'],
    [data.custeioAgricultura, 'custeioAgricultura'],
    [data.jurosPecuaria, 'jurosPecuaria'],
    [data.jurosAgricultura, 'jurosAgricultura'],
    [data.investimentoPecuaria, 'investimentoPecuaria'],
    [data.investimentoAgricultura, 'investimentoAgricultura'],
    [data.reposicaoBovinos, 'reposicaoBovinos'],
    [data.amortizacaoPecuaria, 'amortizacaoPecuaria'],
    [data.amortizacaoAgricultura, 'amortizacaoAgricultura'],
    [data.dividendos, 'dividendos'],
    [data.deducoesReceita, 'deducoesReceita'],
  ];

  const isFechamento = modo === 'fechamento';

  // Pizzas de composição (Bloco 2 — Fechamento). Zero cálculo: usa
  // realAnoCorrente já presente em cada LinhaExecutiva. Filtra zeros para
  // não poluir o pie com fatias vazias.
  const pizzaEntradas: PizzaItem[] = isFechamento
    ? linhasEntrada
        .map(([l], i) => ({
          nome: l.label,
          valor: Math.max(0, l.realAnoCorrente ?? 0),
          cor: CORES_PIZZA_ENTRADAS[i % CORES_PIZZA_ENTRADAS.length],
        }))
        .filter((d) => d.valor > 0)
    : [];
  const pizzaSaidas: PizzaItem[] = isFechamento
    ? linhasSaida
        .map(([l], i) => ({
          nome: l.label,
          valor: Math.max(0, l.realAnoCorrente ?? 0),
          cor: CORES_PIZZA_SAIDAS[i % CORES_PIZZA_SAIDAS.length],
        }))
        .filter((d) => d.valor > 0)
    : [];
  const totalEntradasReal = Math.max(0, data.totalEntradas.realAnoCorrente ?? 0);
  const totalSaidasReal = Math.max(0, data.totalSaidas.realAnoCorrente ?? 0);

  const tabelas = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1">
          Entradas
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
          <div></div>
          {isFechamento ? (
            <>
              <div className={cn('text-right', REAL_ANO_CORRENTE_COLUNA)}>REAL 2026</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          ) : (
            <>
              <div className="text-right">REAL 2025</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          )}
          <div className="text-right">Δ%</div>
        </div>
        <LinhaRow linha={data.totalEntradas} destaque modo={modo} />
        {linhasEntrada.map(([l, key]) => (
          <LinhaRow
            key={key}
            linha={l}
            onClick={onLinhaClick ? () => onLinhaClick(key) : undefined}
            modo={modo}
          />
        ))}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1">
          Saídas
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_70px] gap-1 items-center pb-1 border-b border-border text-[10px] font-semibold uppercase text-muted-foreground">
          <div></div>
          {isFechamento ? (
            <>
              <div className={cn('text-right', REAL_SAIDA_COLUNA)}>REAL 2026</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          ) : (
            <>
              <div className="text-right">REAL 2025</div>
              <div className={cn('text-right', META_COLUNA)}>META 2026</div>
            </>
          )}
          <div className="text-right">Δ%</div>
        </div>
        <LinhaRow linha={data.totalSaidas} destaque modo={modo} inverterSemantica={isFechamento} realSaida={isFechamento} />
        {linhasSaida.map(([l, key]) => (
          <LinhaRow
            key={key}
            linha={l}
            onClick={onLinhaClick ? () => onLinhaClick(key) : undefined}
            modo={modo}
            inverterSemantica={isFechamento}
            realSaida={isFechamento}
          />
        ))}
      </div>
    </div>
  );

  if (isFechamento) {
    return (
      <section className="bg-card border border-border rounded-lg p-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <PizzaCompacta titulo="Entradas" data={pizzaEntradas} total={totalEntradasReal} />
          <PizzaCompacta titulo="Saídas" data={pizzaSaidas} total={totalSaidasReal} />
        </div>
        {tabelas}
      </section>
    );
  }
  return <>{tabelas}</>;
}
