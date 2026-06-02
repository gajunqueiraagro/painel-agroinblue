/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2.
 *
 * Frame 4-col: grid grid-cols-[1fr_1fr_1fr_1fr] gap-3
 *   Col 1: inputs dos custos zoo (frete/comissão/funrural/outros)
 *   Col 2: resumo zoo (Bruto → deduções → Líquido + R$/cab + R$/kg)
 *   Col 3: Financeiro Vinculado — LEITURA PURA (PR 2B.1)
 *   Col 4: Conferência (Zoo Líquido × Financeiro × Diferença) — leitura pura
 *
 * - Leitura SEMPRE de `calc` (buildVendaCalculation, motor único) +
 *   `records`/`contasMap` (load no modal pai por movimentacao_rebanho_id).
 * - Edição (Col 1) via `comercial` (VendaComercialState), comunicada ao pai
 *   por onComercialChange. Persistência inalterada: doSaveVendaZoo já lê
 *   `vendaComercial`.
 * - ZERO escrita em financeiro_lancamentos_v2 (2B.1 = read-only).
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

// Status conservadores: travado se QUALQUER parcela estiver em agendado/realizado/conciliada.
// Substituível só se TODAS estiverem em programado/previsto/meta.
const STATUS_TRAVADOS = new Set(['agendado', 'realizado']);
const STATUS_SUBSTITUIVEIS = new Set(['programado', 'previsto', 'meta']);

const STATUS_LABEL: Record<string, { label: string; icon: string }> = {
  realizado:  { label: 'Realizado',  icon: '✓' },
  agendado:   { label: 'Agendado',   icon: '⏳' },
  programado: { label: 'Programado', icon: '📋' },
  previsto:   { label: 'Previsto',   icon: '📋' },
  meta:       { label: 'Meta',       icon: '🎯' },
};

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

  // ─── Derivações Financeiro Vinculado (read-only) ───────────────────────
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

  // Selo conservador: travado se QUALQUER parcela travada.
  const algumTravado = temFin && records.some(r =>
    STATUS_TRAVADOS.has(r.status_transacao ?? '') || r.conciliado_em != null
  );
  // Substituível só se TODAS as parcelas forem programado/previsto/meta.
  const todasSubstituiveis = temFin && records.every(r =>
    STATUS_SUBSTITUIVEIS.has(r.status_transacao ?? '')
  );
  const travado = algumTravado;
  const substituivel = !algumTravado && todasSubstituiveis;

  // Agregado por status (Col 3 — história)
  const statusCounts: Record<string, number> = {};
  for (const r of records) {
    const s = r.status_transacao ?? 'previsto';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }
  const statusEntries = Object.entries(statusCounts).sort(
    (a, b) => b[1] - a[1]
  );

  // Conta resolvida (primeira parcela com conta_bancaria_id)
  const primeiraConta = records.find(r => r.conta_bancaria_id != null);
  const nomeConta = primeiraConta?.conta_bancaria_id
    ? (contasMap.get(primeiraConta.conta_bancaria_id) ?? 'sem conta')
    : 'sem conta';

  // Data mais antiga
  const dataPgtoOrdenada = records
    .map(r => r.data_pagamento)
    .filter((d): d is string => !!d)
    .sort()[0];
  const dataPgtoLabel = dataPgtoOrdenada
    ? formatarData(dataPgtoOrdenada)
    : '—';

  // Faixa de severidade da diferença (precedência: %>1% vence tudo)
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

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3">
      {/* ── Col 1: Custos da Venda (inputs) ──────────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-1.5 min-w-0">
        <ColTitle>Custos da Venda</ColTitle>
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
        <p className="text-[10px] text-slate-500 italic pt-0.5 leading-tight">
          Se ambos os Funrural forem informados, o valor em R$ prevalece.
        </p>
      </div>

      {/* ── Col 2: Resumo Zoo (read-only) ───────────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5 min-w-0">
        <ColTitle>Resumo Zoo</ColTitle>
        <Linha label="Valor Bruto" value={fmt(calc.valorBruto)} header />
        <Linha label="(-) Frete" value={fmt(calc.freteVal)} muted />
        <Linha label="(-) Comissão" value={fmt(calc.comissaoVal)} muted />
        <Linha label="(-) Funrural" value={fmt(calc.funruralTotal)} muted />
        <Linha label="(-) Outros Custos" value={fmt(calc.outrosCustosVal)} muted />
        <div className="border-t border-slate-300 my-1" />
        <Linha label="Valor Líquido" value={fmt(zooLiquido)} bold />
        <Linha label="R$/cab líquido" value={fmt(calc.liqCabeca)} small />
        <Linha label="R$/kg líquido" value={fmt(calc.liqKg)} small />
      </div>

      {/* ── Col 3: Financeiro Vinculado (leitura pura) ──────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5 min-w-0">
        <ColTitle>Financeiro Vinculado</ColTitle>
        {loading && (
          <p className="text-[11px] text-slate-500 italic leading-tight pt-1">
            Carregando…
          </p>
        )}
        {!loading && !temFin && (
          <p className="text-[11px] text-slate-500 italic leading-tight pt-1">
            Sem financeiro vinculado
          </p>
        )}
        {!loading && temFin && (
          <>
            <Linha
              label={`${records.length} lançamento${records.length === 1 ? '' : 's'}`}
              value=""
              header
            />
            {statusEntries.map(([status, n]) => {
              const meta = STATUS_LABEL[status] ?? { label: status, icon: '•' };
              return (
                <Linha
                  key={status}
                  label={`${meta.icon} ${meta.label}`}
                  value={`${n}`}
                  small
                />
              );
            })}
            <div className="border-t border-slate-300 my-1" />
            <Linha label="Total" value={fmt(totalFin)} bold />
            <Linha label="R$/cab" value={fmt(finRsCab)} small />
            <Linha label="R$/kg" value={fmt(finRsKg)} small />
            <Linha label="Data pgto" value={dataPgtoLabel} small />
            <Linha label="Conta" value={nomeConta} small />
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
          </>
        )}
      </div>

      {/* ── Col 4: Conferência (Zoo × Financeiro) ───────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5 min-w-0">
        <ColTitle>Conferência</ColTitle>
        <Linha label="Zoo Líquido" value={fmt(zooLiquido)} header />
        {!loading && !temFin && (
          <>
            <Linha label="Financeiro" value="—" muted />
            <p className="text-[10px] text-slate-500 italic leading-tight pt-1">
              Aguardando geração do financeiro (Fase 2C).
            </p>
          </>
        )}
        {!loading && temFin && (
          <>
            <Linha label="Financeiro" value={fmt(totalFin)} muted />
            <div className="border-t border-slate-300 my-1" />
            <Linha label="Diferença" value={fmtSigned(diferenca)} bold />
            <Linha label="Dif. R$/cab" value={fmtSigned(difCab)} small />
            <Linha label="Dif. R$/kg" value={fmtSigned(difKg)} small />
            <div
              className={`mt-1 px-1.5 py-1 rounded border text-[10px] leading-tight italic ${severidadeCls[severidade]}`}
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
  /** linha topo (header) — fonte semibold */
  header?: boolean;
  /** deduções — texto suave */
  muted?: boolean;
  /** destaque (Líquido / Total) — bold sem oversize */
  bold?: boolean;
  /** R$/cab e R$/kg — menores */
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

/** Formata YYYY-MM-DD → DD/MM. Aceita ISO timestamp também. */
function formatarData(iso: string): string {
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}
