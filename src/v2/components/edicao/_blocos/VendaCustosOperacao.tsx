/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2.
 *
 * Layout MATRIZ (PR 2B.2):
 *   [1] MATRIZ comparativa Zoo × Financeiro × Diferença (linha-a-linha)
 *   [2+3] Fallback lado-a-lado (decidido por anti-scroll):
 *         Esquerda = bloco operacional (status / data / conta / selo / severidade)
 *         Direita  = bloco "Editar custos da venda" (mesmos inputs do 2A)
 *
 * - Leitura SEMPRE de `calc` + `records`/`contasMap` (load no modal pai).
 * - Edição (inputs) via `comercial` (VendaComercialState) — handlers idênticos
 *   ao 2A, só re-locados. Persistência inalterada (doSaveVendaZoo já lê
 *   `vendaComercial`).
 * - ZERO escrita em financeiro_lancamentos_v2 (2B = read-only).
 *   Botões de ação (gerar/atualizar) ficam para Fase 2C.
 */
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // ─── Derivações (preservadas do PR 2B.1; sem renomear / sem recalcular) ──
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

  // Helpers de célula da matriz
  const finCell = (v: number) => (temFin ? fmt(v) : DASH);
  const difCell = (v: number) => (temFin ? fmtSigned(v) : DASH);

  return (
    <div className="space-y-3">
      {/* ── [1] MATRIZ — Zoo × Financeiro × Diferença ──────────── */}
      <div className="rounded border border-slate-300 p-3 min-w-0">
        <Matriz>
          <MatrizHeader />
          <MatrizLinha label="Valor Bruto" zoo={fmt(calc.valorBruto)} fin={DASH} dif={DASH} header />
          <MatrizLinha label="(-) Frete" zoo={fmt(calc.freteVal)} fin={DASH} dif={DASH} muted />
          <MatrizLinha label="(-) Comissão" zoo={fmt(calc.comissaoVal)} fin={DASH} dif={DASH} muted />
          <MatrizLinha label="(-) Funrural" zoo={fmt(calc.funruralTotal)} fin={DASH} dif={DASH} muted />
          <MatrizLinha label="(-) Outros Custos" zoo={fmt(calc.outrosCustosVal)} fin={DASH} dif={DASH} muted />
          <div className="col-span-4 border-t border-slate-300 my-1" />
          <MatrizLinha label="Valor Líquido" zoo={fmt(zooLiquido)} fin={finCell(totalFin)} dif={difCell(diferenca)} bold />
          <MatrizLinha label="R$/cab líquido" zoo={fmt(calc.liqCabeca)} fin={finCell(finRsCab)} dif={difCell(difCab)} small />
          <MatrizLinha label="R$/kg líquido" zoo={fmt(calc.liqKg)} fin={finCell(finRsKg)} dif={difCell(difKg)} small />
        </Matriz>
      </div>

      {/* ── [2+3] Fallback lado-a-lado: operacional E inputs ──── */}
      <div className="grid grid-cols-[3fr_2fr] gap-3">
        {/* [2] Operacional + selo + severidade */}
        <div className="rounded border border-slate-300 p-3 space-y-1 min-w-0">
          <ColTitle>Financeiro Vinculado</ColTitle>
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
              <Linha
                label={`${records.length} lançamento${records.length === 1 ? '' : 's'}`}
                value=""
                header
              />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {statusEntries.map(([status, n]) => {
                  const meta = STATUS_LABEL[status] ?? { label: status, icon: '•' };
                  return (
                    <span
                      key={status}
                      className="text-[10px] text-slate-600 whitespace-nowrap"
                    >
                      {meta.icon} {meta.label} <span className="tabular-nums font-semibold text-slate-800">{n}</span>
                    </span>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-x-3">
                <Linha label="Data pgto" value={dataPgtoLabel} small />
                <Linha label="Conta" value={nomeConta} small />
              </div>
              {(travado || substituivel) && (
                <div
                  className={`mt-1 px-1.5 py-1 rounded border text-[10px] leading-tight italic ${
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
              <div
                className={`mt-1 px-1.5 py-1 rounded border text-[10px] leading-tight italic ${severidadeCls[severidade]}`}
                title={`${(pctDif * 100).toFixed(2)}%`}
              >
                {mensagemDif}
              </div>
            </>
          )}
        </div>

        {/* [3] Editar custos da venda */}
        <div className="rounded border border-slate-300 p-3 space-y-1.5 min-w-0">
          <ColTitle>Editar custos da venda</ColTitle>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            <Campo label="Frete" suffix="R$">
              <Input
                type="text"
                inputMode="decimal"
                value={comercial.frete}
                onChange={e => onComercialChange(c => ({ ...c, frete: e.target.value }))}
                placeholder="0,00"
                className="h-6 text-[12px] px-1.5 tabular-nums"
              />
            </Campo>
            <Campo label="Comissão" suffix="%">
              <Input
                type="text"
                inputMode="decimal"
                value={comercial.comissaoPct}
                onChange={e => onComercialChange(c => ({ ...c, comissaoPct: e.target.value }))}
                placeholder="0,00"
                className="h-6 text-[12px] px-1.5 tabular-nums"
              />
            </Campo>
            <Campo label="Funrural" suffix="%">
              <Input
                type="text"
                inputMode="decimal"
                value={comercial.funruralPct}
                onChange={e => onComercialChange(c => ({ ...c, funruralPct: e.target.value }))}
                placeholder="0,00"
                className="h-6 text-[12px] px-1.5 tabular-nums"
              />
            </Campo>
            <Campo label="Funrural" suffix="R$">
              <Input
                type="text"
                inputMode="decimal"
                value={comercial.funruralReais}
                onChange={e => onComercialChange(c => ({ ...c, funruralReais: e.target.value }))}
                placeholder="0,00"
                className="h-6 text-[12px] px-1.5 tabular-nums"
              />
            </Campo>
            <Campo label="Outros Custos" suffix="R$">
              <Input
                type="text"
                inputMode="decimal"
                value={comercial.outrosCustos}
                onChange={e => onComercialChange(c => ({ ...c, outrosCustos: e.target.value }))}
                placeholder="0,00"
                className="h-6 text-[12px] px-1.5 tabular-nums"
              />
            </Campo>
          </div>
          <p className="text-[10px] text-slate-500 italic leading-tight pt-0.5">
            Se ambos os Funrural forem informados, o valor em R$ prevalece.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

function Matriz({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-baseline">
      {children}
    </div>
  );
}

function MatrizHeader() {
  return (
    <>
      <div />
      <ColHeader>Zoo / Competência</ColHeader>
      <ColHeader>Financeiro Vinculado</ColHeader>
      <ColHeader>Diferença</ColHeader>
    </>
  );
}

function ColHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 text-right truncate">
      {children}
    </div>
  );
}

interface MatrizLinhaProps {
  label: string;
  zoo: string;
  fin: string;
  dif: string;
  header?: boolean;
  muted?: boolean;
  bold?: boolean;
  small?: boolean;
}

function MatrizLinha({ label, zoo, fin, dif, header, muted, bold, small }: MatrizLinhaProps) {
  const labelCls = [
    'text-[11px] truncate leading-tight',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-600',
    bold && 'font-semibold text-slate-900',
    small && 'text-[10px] text-slate-600',
  ].filter(Boolean).join(' ');
  const cellCls = (kind: 'zoo' | 'fin' | 'dif') => [
    'tabular-nums text-right whitespace-nowrap overflow-hidden text-ellipsis leading-tight',
    'text-[11px]',
    header && kind === 'zoo' && 'font-semibold text-slate-900',
    muted && 'text-slate-700',
    bold && kind === 'zoo' && 'font-semibold text-slate-900',
    bold && kind === 'fin' && 'font-semibold text-slate-900',
    bold && kind === 'dif' && 'font-bold text-blue-900',
    small && 'text-[10px] text-slate-700',
  ].filter(Boolean).join(' ');
  return (
    <>
      <span className={labelCls}>{label}</span>
      <span className={cellCls('zoo')} title={zoo}>{zoo}</span>
      <span className={cellCls('fin')} title={fin}>{fin}</span>
      <span className={cellCls('dif')} title={dif}>{dif}</span>
    </>
  );
}

function ColTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 pb-0.5 truncate">
      {children}
    </div>
  );
}

interface LinhaProps {
  label: string;
  value: string;
  header?: boolean;
  muted?: boolean;
  bold?: boolean;
  small?: boolean;
}

function Linha({ label, value, header, muted, bold, small }: LinhaProps) {
  const baseCls = 'flex items-baseline justify-between gap-2 leading-tight py-0.5 min-w-0';
  const labelCls = [
    'text-[11px] truncate',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-600',
    bold && 'font-semibold text-slate-900',
    small && 'text-[10px] text-slate-600',
  ].filter(Boolean).join(' ');
  const valueCls = [
    'tabular-nums text-[11px] whitespace-nowrap overflow-hidden text-ellipsis text-right',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-700',
    bold && 'font-bold text-blue-900',
    small && 'text-[10px] text-slate-700',
  ].filter(Boolean).join(' ');
  return (
    <div className={baseCls}>
      <span className={labelCls}>{label}</span>
      <span className={valueCls} title={value}>{value}</span>
    </div>
  );
}

function Campo({ label, suffix, children }: { label: string; suffix?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="text-[10px] uppercase text-slate-500 font-medium">{label}</Label>
        {suffix && <span className="text-[9px] text-slate-400">{suffix}</span>}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function formatarData(iso: string): string {
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}
