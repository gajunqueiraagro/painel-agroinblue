/**
 * V2VisaoGeralRebanho — Tela Rebanho/Visão Geral (section 'rebanho-home').
 *
 * Fase 2 do Marco "9 Cards de Movimentação": estrutura visual sem dados reais.
 * Lente global controla qual métrica os 9 cards exibem simultaneamente.
 * Cards onde a lente não se aplica aparecem atenuados com '—'.
 *
 * Próximas fases:
 *  - Fase 3: plugar dados via useMovimentacoesAgregadas (ano/anoAnt/meta)
 *  - Fase 4: modal Jan-Dez por card (MovimentacaoHistoricoModal)
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type Lente = 'cab' | 'arroba_total' | 'arroba_media' | 'preco_arroba' | 'valor_total';

export type TipoMov =
  | 'nascimentos' | 'compras' | 'soma_entradas'
  | 'vendas' | 'abates' | 'consumos' | 'mortes' | 'soma_saidas' | 'desfrute';

interface CardConfig {
  id: TipoMov;
  label: string;
  grupo: 'entradas' | 'saidas';
  /** Σ Entradas, Σ Saídas, Desfrute — borda destacada. */
  destaque?: boolean;
  /** Lentes em que o card mostra dado real; outras renderizam '—' atenuado. */
  lentesAplicaveis: Lente[];
}

const CARDS: CardConfig[] = [
  { id: 'nascimentos',  label: 'Nascimentos', grupo: 'entradas',
    lentesAplicaveis: ['cab'] },
  { id: 'compras',      label: 'Compras', grupo: 'entradas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'soma_entradas', label: 'Σ Entradas', grupo: 'entradas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'valor_total'] },
  { id: 'vendas',       label: 'Vendas', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'abates',       label: 'Abates', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'consumos',     label: 'Consumos', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media'] },
  { id: 'mortes',       label: 'Mortes', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media'] },
  { id: 'soma_saidas',  label: 'Σ Saídas', grupo: 'saidas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'valor_total'] },
  { id: 'desfrute',     label: 'Desfrute', grupo: 'saidas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'valor_total'] },
];

const LENTES: { id: Lente; label: string }[] = [
  { id: 'cab',          label: 'Cabeças' },
  { id: 'arroba_total', label: '@ Totais' },
  { id: 'arroba_media', label: '@ Média' },
  { id: 'preco_arroba', label: 'R$/@' },
  { id: 'valor_total',  label: 'R$ Total' },
];

export default function V2VisaoGeralRebanho() {
  const [lente, setLente] = useState<Lente>('cab');

  const entradas = CARDS.filter(c => c.grupo === 'entradas');
  const saidas = CARDS.filter(c => c.grupo === 'saidas');

  return (
    <div className="px-4 py-4 space-y-6 max-w-7xl mx-auto">
      {/* FILTRO DE LENTE */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-2">Lente:</span>
        <div className="inline-flex bg-muted rounded-lg p-1 gap-1">
          {LENTES.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLente(l.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                lente === l.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* ENTRADAS */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Entradas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {entradas.map(c => <CardKpi key={c.id} cfg={c} lente={lente} />)}
        </div>
      </section>

      {/* SAÍDAS */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Saídas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {saidas.slice(0, 4).map(c => <CardKpi key={c.id} cfg={c} lente={lente} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {saidas.slice(4).map(c => <CardKpi key={c.id} cfg={c} lente={lente} />)}
        </div>
      </section>
    </div>
  );
}

function CardKpi({ cfg, lente }: { cfg: CardConfig; lente: Lente }) {
  const aplicavel = cfg.lentesAplicaveis.includes(lente);

  return (
    <Card className={cn(
      'p-4 transition-shadow',
      aplicavel && 'hover:shadow-md cursor-pointer',
      cfg.destaque && 'border-primary/30',
      !aplicavel && 'opacity-50',
    )}>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 truncate">
        {cfg.label}
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {aplicavel ? '—' : <span className="text-muted-foreground">—</span>}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
        <div>— vs mês ant.</div>
        <div>— vs ano ant.</div>
        <div>— vs META</div>
      </div>
    </Card>
  );
}
