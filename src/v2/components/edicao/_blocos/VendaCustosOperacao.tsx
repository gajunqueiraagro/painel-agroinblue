/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2.
 *
 * Layout MATRIZ-5-COL (PR 2B.3): Item | Editar Custos | Zoo | Financeiro | Diferença.
 * Inputs inline só nas linhas de dedução (Frete/Comissão/Funrural/Outros).
 * Abaixo, bloco operacional compacto + severidade.
 *
 * - Leitura SEMPRE de `calc` + `records`/`contasMap` (load no modal pai).
 * - Edição (inputs) via `comercial` (VendaComercialState) — handlers idênticos
 *   ao 2A/2B, só re-locados como célula da matriz. Persistência inalterada
 *   (doSaveVendaZoo já lê `vendaComercial`).
 * - Inputs MEMOIZADOS (React.memo) + handlers estáveis (useCallback) para
 *   evitar perda de foco no re-render da matriz a cada tecla.
 * - ZERO escrita em financeiro_lancamentos_v2 (2B = read-only).
 *   Botões de ação (gerar/atualizar) ficam para Fase 2C.
 */
import { memo, useCallback } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { VendaCalculation } from '@/lib/calculos/venda';
import type { VendaComercialState } from './VendaDadosZootecnicos';
import type { FinRecord } from '../LancamentoZooModal';

interface Props {
  calc: VendaCalculation;
  comercial: VendaComercialState;
  onComercialChange: Dispatch<SetStateAction<VendaComercialState>>;
  canEditMeta?: boolean;
  records: FinRecord[];
  contasMap: Map<string, string>;
  loading?: boolean;
}

const STATUS_TRAVADOS = new Set(['agendado', 'realizado']);
const STATUS_SUBSTITUIVEIS = new Set(['programado', 'previsto', 'meta']);

const STATUS_LABEL: Record<string, { label: string; icon: string }> = {
  realizado:  { label: 'Realizado',  icon: '✓' },
  agendado:   { label: 'Agendado',   icon: '⏳' },
  programado: { label: 'Programado', icon: '📋' },
  previsto:   { label: 'Previsto',   icon: '📋' },
  meta:       { label: 'Meta',       icon: '🎯' },
};

const DASH = '—';

export function VendaCustosOperacao({
  calc,
  comercial,
  onComercialChange,
  records,
  contasMap,
  loading,
}: Props) {
  const fmt = (v: number) => (v > 0 ? formatMoeda(v) : 'R$ 0,00');
  const fmtSigned = (v: number) => (v < 0 ? `-${formatMoeda(Math.abs(v))}` : formatMoeda(v));

  // ─── Handlers estáveis (useCallback) — proteção de foco dos inputs ──────
  const setFrete = useCallback(
    (v: string) => onComercialChange(c => ({ ...c, frete: v })),
    [onComercialChange],
  );
  const setComissao = useCallback(
    (v: string) => onComercialChange(c => ({ ...c, comissaoPct: v })),
    [onComercialChange],
  );
  const setFunPct = useCallback(
    (v: string) => onComercialChange(c => ({ ...c, funruralPct: v })),
    [onComercialChange],
  );
  const setFunReais = useCallback(
    (v: string) => onComercialChange(c => ({ ...c, funruralReais: v })),
    [onComercialChange],
  );
  const setOutros = useCallback(
    (v: string) => onComercialChange(c => ({ ...c, outrosCustos: v })),
    [onComercialChange],
  );

  // ─── Derivações (preservadas — sem renomear / sem recalcular) ──────────
  const totalFin = records.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const qtd = calc.quantidade;
  const pesoTotal = calc.pesoTotalKg;
  const finRsCab = qtd > 0 ? totalFin / qtd : 0;
  const finRsKg = pesoTotal > 0 ? totalFin / pesoTotal : 0;
  const zooLiquido = calc.valorLiquido;
  const temFin = records.length > 0;
  const diferenca = totalFin - zooLiquido;
  const difCab = qtd > 0 ? diferenca / qtd : 0;
  const difKg = pesoTotal > 0 ? diferenca / pesoTotal : 0;
  const pctDif = zooLiquido !== 0 ? Math.abs(diferenca) / Math.abs(zooLiquido) : 0;

  const algumTravado = temFin && records.some(r =>
    STATUS_TRAVADOS.has(r.status_transacao ?? '') || r.conciliado_em != null
  );
  const todasSubstituiveis = temFin && records.every(r =>
    STATUS_SUBSTITUIVEIS.has(r.status_transacao ?? '')
  );
  const travado = algumTravado;
  const substituivel = !algumTravado && todasSubstituiveis;

  const statusCounts: Record<string, number> = {};
  for (const r of records) {
    const s = r.status_transacao ?? 'previsto';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  const primeiraConta = records.find(r => r.conta_bancaria_id != null);
  const nomeConta = primeiraConta?.conta_bancaria_id
    ? (contasMap.get(primeiraConta.conta_bancaria_id) ?? 'sem conta')
    : 'sem conta';

  const dataPgtoOrdenada = records
    .map(r => r.data_pagamento)
    .filter((d): d is string => !!d)
    .sort()[0];
  const dataPgtoLabel = dataPgtoOrdenada ? formatarData(dataPgtoOrdenada) : DASH;

  type Severidade = 'cinza' | 'amarelo' | 'laranja' | 'vermelho';
  let severidade: Severidade = 'cinza';
  let mensagemDif = '✓ Diferença irrelevante';
  if (temFin) {
    if (pctDif > 0.01) {
      severidade = 'vermelho';
      mensagemDif = 'Diferença relevante (> 1%)';
    } else if (Math.abs(diferenca) > 1000) {
      severidade = 'laranja';
      mensagemDif = 'Diferença alta';
    } else if (Math.abs(diferenca) >= 100) {
      severidade = 'amarelo';
      mensagemDif = 'Diferença a conferir';
    }
  }
  const severidadeCls: Record<Severidade, string> = {
    cinza: 'text-slate-600 bg-slate-100 border-slate-300',
    amarelo: 'text-amber-800 bg-amber-50 border-amber-300',
    laranja: 'text-orange-800 bg-orange-50 border-orange-300',
    vermelho: 'text-red-800 bg-red-50 border-red-300',
  };

  const finCell = (v: number) => (temFin ? fmt(v) : DASH);
  const difCell = (v: number) => (temFin ? fmtSigned(v) : DASH);

  return (
    <div className="space-y-2">
      {/* ── MATRIZ 5-COL: Item | Editar Custos | Zoo | Fin | Diferença ── */}
      <div className="rounded border border-slate-300 p-3 min-w-0">
        <div className="grid grid-cols-[1.1fr_1.2fr_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-center">
          {/* Header */}
          <ColHeader>Item</ColHeader>
          <ColHeader>Editar Custos</ColHeader>
          <ColHeader>Zoo / Competência</ColHeader>
          <ColHeader>Financeiro Vinculado</ColHeader>
          <ColHeader>Diferença</ColHeader>

          {/* Valor Bruto (sem input) */}
          <LabelCell tone="header">Valor Bruto</LabelCell>
          <div />
          <ValueCell tone="header">{fmt(calc.valorBruto)}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>

          {/* Frete */}
          <LabelCell tone="muted">(-) Frete</LabelCell>
          <InputCelula value={comercial.frete} onChange={setFrete} suffix="R$" />
          <ValueCell tone="muted">{fmt(calc.freteVal)}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>

          {/* Comissão */}
          <LabelCell tone="muted">(-) Comissão</LabelCell>
          <InputCelula value={comercial.comissaoPct} onChange={setComissao} suffix="%" />
          <ValueCell tone="muted">{fmt(calc.comissaoVal)}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>

          {/* Funrural — 2 inputs lado a lado na mesma célula */}
          <LabelCell tone="muted">(-) Funrural</LabelCell>
          <div className="grid grid-cols-2 gap-1 min-w-0">
            <InputCelula value={comercial.funruralPct} onChange={setFunPct} suffix="%" />
            <InputCelula value={comercial.funruralReais} onChange={setFunReais} suffix="R$" />
          </div>
          <ValueCell tone="muted">{fmt(calc.funruralTotal)}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>

          {/* Outros Custos */}
          <LabelCell tone="muted">(-) Outros Custos</LabelCell>
          <InputCelula value={comercial.outrosCustos} onChange={setOutros} suffix="R$" />
          <ValueCell tone="muted">{fmt(calc.outrosCustosVal)}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>
          <ValueCell tone="muted">{DASH}</ValueCell>

          {/* Divisória */}
          <div className="col-span-5 border-t border-slate-300 my-1" />

          {/* Valor Líquido */}
          <LabelCell tone="bold">Valor Líquido</LabelCell>
          <div />
          <ValueCell tone="bold">{fmt(zooLiquido)}</ValueCell>
          <ValueCell tone="bold">{finCell(totalFin)}</ValueCell>
          <ValueCell tone="dif-bold">{difCell(diferenca)}</ValueCell>

          {/* R$/cab líquido */}
          <LabelCell tone="small">R$/cab líquido</LabelCell>
          <div />
          <ValueCell tone="small">{fmt(calc.liqCabeca)}</ValueCell>
          <ValueCell tone="small">{finCell(finRsCab)}</ValueCell>
          <ValueCell tone="small">{difCell(difCab)}</ValueCell>

          {/* R$/kg líquido */}
          <LabelCell tone="small">R$/kg líquido</LabelCell>
          <div />
          <ValueCell tone="small">{fmt(calc.liqKg)}</ValueCell>
          <ValueCell tone="small">{finCell(finRsKg)}</ValueCell>
          <ValueCell tone="small">{difCell(difKg)}</ValueCell>
        </div>
        <p className="text-[10px] text-slate-500 italic pt-2 leading-tight">
          Se ambos os Funrural forem informados, o valor em R$ prevalece.
        </p>
      </div>

      {/* ── Bloco operacional compacto (status + selo + severidade) ── */}
      <div className="rounded border border-slate-300 p-2 space-y-1 min-w-0">
        {loading && (
          <p className="text-[11px] text-slate-500 italic leading-tight">Carregando…</p>
        )}
        {!loading && !temFin && (
          <p className="text-[11px] text-slate-500 italic leading-tight">
            Aguardando geração do financeiro (Fase 2C).
          </p>
        )}
        {!loading && temFin && (
          <>
            {/* Linha 1: N lançamentos + breakdown status + data + conta — tudo em flex wrap */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px] leading-tight">
              <span className="font-semibold text-slate-800">
                {records.length} lançamento{records.length === 1 ? '' : 's'}
              </span>
              {statusEntries.map(([status, n]) => {
                const meta = STATUS_LABEL[status] ?? { label: status, icon: '•' };
                return (
                  <span key={status} className="text-slate-600 whitespace-nowrap">
                    {meta.icon} {meta.label}{' '}
                    <span className="tabular-nums font-semibold text-slate-800">{n}</span>
                  </span>
                );
              })}
              <span className="text-slate-600 whitespace-nowrap">
                · Data pgto <span className="tabular-nums font-medium text-slate-800">{dataPgtoLabel}</span>
              </span>
              <span className="text-slate-600 whitespace-nowrap truncate" title={nomeConta}>
                · Conta <span className="font-medium text-slate-800">{nomeConta}</span>
              </span>
            </div>

            {/* Linha 2 (condicional): selo travado/substituível */}
            {(travado || substituivel) && (
              <div
                className={`px-1.5 py-1 rounded border text-[10px] leading-tight italic ${
                  travado
                    ? 'text-amber-800 bg-amber-50 border-amber-300'
                    : 'text-emerald-800 bg-emerald-50 border-emerald-300'
                }`}
              >
                {travado
                  ? '🔒 Financeiro travado — lançamento já realizado/agendado. Alterações devem ser feitas no Financeiro.'
                  : '✏️ Financeiro substituível — pode ser atualizado pelo Zoo.'}
              </div>
            )}

            {/* Linha 3: severidade da diferença */}
            <div
              className={`px-1.5 py-1 rounded border text-[10px] leading-tight italic ${severidadeCls[severidade]}`}
              title={`${(pctDif * 100).toFixed(2)}%`}
            >
              {mensagemDif}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

/**
 * Célula de input MEMOIZADA — protege contra perda de foco no re-render da
 * matriz a cada tecla. Combinada com handlers estáveis (useCallback no pai),
 * o React mantém o nó DOM do input entre renders.
 */
interface InputCelulaProps {
  value: string;
  onChange: (v: string) => void;
  suffix: 'R$' | '%';
  placeholder?: string;
}
const InputCelula = memo(function InputCelula({
  value,
  onChange,
  suffix,
  placeholder = '0,00',
}: InputCelulaProps) {
  return (
    <div className="relative min-w-0">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-6 text-[12px] px-1.5 pr-6 tabular-nums"
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 pointer-events-none select-none">
        {suffix}
      </span>
    </div>
  );
});

function ColHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 pb-1 truncate text-right first:text-left">
      {children}
    </div>
  );
}

type CellTone = 'header' | 'muted' | 'bold' | 'small' | 'dif-bold';

function LabelCell({ tone = 'muted', children }: { tone?: CellTone; children: ReactNode }) {
  const cls = [
    'truncate leading-tight',
    'text-[11px]',
    tone === 'header' && 'font-semibold text-slate-900',
    tone === 'muted' && 'text-slate-600',
    tone === 'bold' && 'font-semibold text-slate-900',
    tone === 'small' && 'text-[10px] text-slate-600',
  ].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

function ValueCell({ tone = 'muted', children }: { tone?: CellTone; children: ReactNode }) {
  const cls = [
    'tabular-nums text-right whitespace-nowrap overflow-hidden text-ellipsis leading-tight',
    'text-[11px]',
    tone === 'header' && 'font-semibold text-slate-900',
    tone === 'muted' && 'text-slate-700',
    tone === 'bold' && 'font-semibold text-slate-900',
    tone === 'small' && 'text-[10px] text-slate-700',
    tone === 'dif-bold' && 'font-bold text-blue-900',
  ].filter(Boolean).join(' ');
  // title pro tooltip caso o valor seja truncado
  const titleStr = typeof children === 'string' ? children : undefined;
  return (
    <span className={cls} title={titleStr}>
      {children}
    </span>
  );
}

function formatarData(iso: string): string {
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}
