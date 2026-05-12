/**
 * V2VisaoGeralRebanho — Tela Rebanho/Visão Geral (section 'rebanho-home').
 *
 * Fase 3 do Marco "9 Cards de Movimentação": dados reais via useMovimentacoesAgregadas.
 * Modal Jan-Dez por card é a Fase 4 (próximo commit).
 *
 * Lente global controla qual métrica os 9 cards exibem simultaneamente.
 * Cards onde a lente não se aplica aparecem atenuados com '—'.
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useMovimentacoesAgregadas,
  type Lente,
  type TipoMov,
  type CardData,
} from '@/v2/hooks/useMovimentacoesAgregadas';
import { MovimentacaoHistoricoModal } from '@/v2/components/MovimentacaoHistoricoModal';

interface Props {
  ano: number;
  mes: number; // 1..12
  viewMode: 'mes' | 'periodo';
}

interface CardConfig {
  id: TipoMov;
  label: string;
  grupo: 'entradas' | 'saidas';
  /** Σ Entradas, Σ Saídas, Desfrute — borda destacada. */
  destaque?: boolean;
  /** Lentes em que o card mostra dado real; outras renderizam '—' atenuado. */
  lentesAplicaveis: Lente[];
  /** Para Mortes, "sobe = ruim": inverter cor das variações. */
  invertCor?: boolean;
}

const CARDS: CardConfig[] = [
  { id: 'nascimentos',   label: 'Nascimentos', grupo: 'entradas',
    lentesAplicaveis: ['cab'] },
  { id: 'compras',       label: 'Compras', grupo: 'entradas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'soma_entradas', label: 'Σ Entradas', grupo: 'entradas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'valor_total'] },
  { id: 'vendas',        label: 'Vendas', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'abates',        label: 'Abates', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
  { id: 'consumos',      label: 'Consumos', grupo: 'saidas',
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media'] },
  { id: 'mortes',        label: 'Mortes', grupo: 'saidas', invertCor: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media'] },
  { id: 'soma_saidas',   label: 'Σ Saídas', grupo: 'saidas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'valor_total'] },
  { id: 'desfrute',      label: 'Desfrute', grupo: 'saidas', destaque: true,
    lentesAplicaveis: ['cab', 'arroba_total', 'arroba_media', 'preco_arroba', 'valor_total'] },
];

const LENTES: { id: Lente; label: string }[] = [
  { id: 'cab',          label: 'Cabeças' },
  { id: 'arroba_total', label: '@ Totais' },
  { id: 'arroba_media', label: '@ Média' },
  { id: 'preco_arroba', label: 'R$/@' },
  { id: 'valor_total',  label: 'R$ Total' },
];

// ─── Formatadores ────────────────────────────────────────────────────────────

function formatar(v: number | null, tipo: TipoMov, lente: Lente): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (tipo === 'desfrute' && lente === 'cab') {
    return `${v.toFixed(1).replace('.', ',')}%`;
  }
  switch (lente) {
    case 'cab':
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);
    case 'arroba_total':
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v)} @`;
    case 'arroba_media':
      return `${v.toFixed(1).replace('.', ',')} @/cab`;
    case 'preco_arroba':
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', maximumFractionDigits: 2,
      }).format(v);
    case 'valor_total':
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
      }).format(v);
  }
}

function pctDelta(curr: number | null, base: number | null): number | null {
  if (curr == null || base == null) return null;
  if (base === 0 || !Number.isFinite(base)) return null;
  return ((curr - base) / Math.abs(base)) * 100;
}

function fmtDelta(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1).replace('.', ',')}%`;
}

/** Cor da variação. invertCor=true (Mortes): subir é ruim. */
function corDelta(d: number | null, invert = false): string {
  if (d == null || !Number.isFinite(d) || Math.abs(d) < 0.05) return 'text-muted-foreground';
  const positivo = invert ? d < 0 : d > 0;
  return positivo ? 'text-emerald-600' : 'text-rose-600';
}

// ─── Helper de cor do modal (Mortes em vermelho) ─────────────────────────────

function getCorPrincipal(tipo: TipoMov): 'azul' | 'vermelho' {
  if (tipo === 'mortes') return 'vermelho';
  return 'azul';
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function V2VisaoGeralRebanho({ ano, mes, viewMode }: Props) {
  const [lente, setLente] = useState<Lente>('cab');
  const [modalAberto, setModalAberto] = useState<TipoMov | null>(null);

  const { porTipo, loading } = useMovimentacoesAgregadas({ ano, mes, viewMode });

  const abrirModal = (tipo: TipoMov) => {
    const cfg = CARDS.find(c => c.id === tipo);
    if (!cfg?.lentesAplicaveis.includes(lente)) return; // não abre em card atenuado
    setModalAberto(tipo);
  };

  const entradas = CARDS.filter(c => c.grupo === 'entradas');
  const saidas = CARDS.filter(c => c.grupo === 'saidas');

  // Dados do modal (quando aberto). Modal recebe CardData inteiro + decide
  // internamente qual lente/viewMode renderizar.
  const cfgModal = modalAberto ? CARDS.find(c => c.id === modalAberto) : null;
  const cardModalData = modalAberto && porTipo?.[modalAberto] ? porTipo[modalAberto] : null;

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
        {loading && (
          <span className="text-xs text-muted-foreground ml-3">Carregando…</span>
        )}
      </div>

      {/* ENTRADAS */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Entradas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {entradas.map(c => (
            <CardKpi key={c.id} cfg={c} lente={lente} data={porTipo?.[c.id]} onClick={() => abrirModal(c.id)} />
          ))}
        </div>
      </section>

      {/* SAÍDAS */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Saídas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {saidas.slice(0, 4).map(c => (
            <CardKpi key={c.id} cfg={c} lente={lente} data={porTipo?.[c.id]} onClick={() => abrirModal(c.id)} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {saidas.slice(4).map(c => (
            <CardKpi key={c.id} cfg={c} lente={lente} data={porTipo?.[c.id]} onClick={() => abrirModal(c.id)} />
          ))}
        </div>
      </section>

      {/* MODAL Jan-Dez — uma instância, renderiza só quando aberto */}
      {modalAberto && cfgModal && cardModalData && (
        <MovimentacaoHistoricoModal
          open={true}
          onClose={() => setModalAberto(null)}
          titulo={cfgModal.label}
          tipo={modalAberto}
          data={cardModalData}
          lenteInicial={lente}
          lentesAplicaveis={cfgModal.lentesAplicaveis}
          mesAtual={mes}
          anoAtual={ano}
          viewModeInicial={viewMode}
          corPrincipal={getCorPrincipal(modalAberto)}
        />
      )}
    </div>
  );
}

function CardKpi({ cfg, lente, data, onClick }: {
  cfg: CardConfig;
  lente: Lente;
  data?: CardData;
  onClick?: () => void;
}) {
  const aplicavel = cfg.lentesAplicaveis.includes(lente);

  const valor       = aplicavel && data ? data.mesAtual[lente]  : null;
  const valorMesAnt = aplicavel && data ? data.mesAnt[lente]    : null;
  const valorAnoAnt = aplicavel && data ? data.mesAnoAnt[lente] : null;
  const valorMeta   = aplicavel && data ? data.meta[lente]      : null;

  const deltaMes  = pctDelta(valor, valorMesAnt);
  const deltaAno  = pctDelta(valor, valorAnoAnt);
  const deltaMeta = pctDelta(valor, valorMeta);

  return (
    <Card
      onClick={aplicavel ? onClick : undefined}
      className={cn(
        'p-4 transition-shadow',
        aplicavel && 'hover:shadow-md cursor-pointer',
        cfg.destaque && 'border-primary/30',
        !aplicavel && 'opacity-50',
      )}
    >
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 truncate">
        {cfg.label}
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {aplicavel
          ? formatar(valor, cfg.id, lente)
          : <span className="text-muted-foreground">—</span>}
      </div>
      <div className="text-[10px] mt-2 space-y-0.5">
        <div className={corDelta(deltaMes, cfg.invertCor)}>
          {fmtDelta(deltaMes)} vs mês ant.
        </div>
        <div className={corDelta(deltaAno, cfg.invertCor)}>
          {fmtDelta(deltaAno)} vs ano ant.
        </div>
        <div className={corDelta(deltaMeta, cfg.invertCor)}>
          {fmtDelta(deltaMeta)} vs META
        </div>
      </div>
    </Card>
  );
}
