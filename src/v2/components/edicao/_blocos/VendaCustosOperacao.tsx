/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2.
 *
 * Layout 4 CARDS (PR 2B.5): Custos da Venda | Resumo Zoo | Financeiro Vinculado | Conferência.
 * Cada card é um container independente; os Resumo/Financeiro/Conferência espelham
 * a estrutura de linhas (Bruto → 4 deduções → Líquido + R$/cab + R$/kg) para leitura
 * vertical natural lado-a-lado. Financeiro/Diferença só preenchem Líquido/R$/cab/R$/kg
 * (financeiro sem detalhamento por componente — Bruto e deduções = "—").
 *
 * - Leitura SEMPRE de `calc` + `records`/`contasMap` (load no modal pai).
 * - Edição (Card 1) via `comercial` (VendaComercialState) — handlers idênticos
 *   às fases anteriores. Persistência inalterada (doSaveVendaZoo já lê
 *   `vendaComercial`).
 * - Inputs MEMOIZADOS (React.memo) + handlers estáveis (useCallback) — proteção
 *   de foco preservada das fases 2B.3/2B.4.
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
    <div className="grid grid-cols-[0.95fr_1fr_1.15fr_0.9fr] gap-3">
      {/* ── Card 1: Custos da Venda ───────────────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-1.5 min-w-0">
        <ColTitle>Custos da Venda</ColTitle>
        <CampoInput label="Frete" suffix="R$">
          <InputCelula value={comercial.frete} onChange={setFrete} suffix="R$" />
        </CampoInput>
        <CampoInput label="Comissão" suffix="%">
          <InputCelula value={comercial.comissaoPct} onChange={setComissao} suffix="%" />
        </CampoInput>
        <CampoInput label="Funrural" suffix="% / R$">
          <div className="grid grid-cols-[0.6fr_1fr] gap-1 min-w-0">
            <InputCelula value={comercial.funruralPct} onChange={setFunPct} suffix="%" />
            <InputCelula value={comercial.funruralReais} onChange={setFunReais} suffix="R$" />
          </div>
        </CampoInput>
        <CampoInput label="Outros Custos" suffix="R$">
          <InputCelula value={comercial.outrosCustos} onChange={setOutros} suffix="R$" />
        </CampoInput>
        <p className="text-[10px] text-slate-500 italic pt-0.5 leading-tight">
          Se ambos os Funrural forem informados, o valor em R$ prevalece.
        </p>
      </div>

      {/* ── Card 2: Resumo Zoo ────────────────────────────────── */}
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

      {/* ── Card 3: Financeiro Vinculado ──────────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5 min-w-0">
        <ColTitle>Financeiro Vinculado</ColTitle>
        <Linha label="Valor Bruto" value={DASH} muted />
        <Linha label="(-) Frete" value={DASH} muted />
        <Linha label="(-) Comissão" value={DASH} muted />
        <Linha label="(-) Funrural" value={DASH} muted />
        <Linha label="(-) Outros Custos" value={DASH} muted />
        <div className="border-t border-slate-300 my-1" />
        <Linha label="Valor Líquido" value={finCell(totalFin)} bold />
        <Linha label="R$/cab líquido" value={finCell(finRsCab)} small />
        <Linha label="R$/kg líquido" value={finCell(finRsKg)} small />
        <p className="text-[10px] text-slate-500 italic pt-0.5 leading-tight">
          Financeiro sem detalhamento por componente.
        </p>

        {loading && (
          <p className="text-[11px] text-slate-500 italic leading-tight pt-1">Carregando…</p>
        )}
        {!loading && !temFin && (
          <p className="text-[11px] text-slate-500 italic leading-tight pt-1">
            Aguardando geração do financeiro (Fase 2C).
          </p>
        )}
        {!loading && temFin && (
          <div className="pt-1 mt-1 border-t border-slate-200 space-y-0.5 text-[10px] leading-tight">
            <div className="font-semibold text-slate-800">
              {records.length} lançamento{records.length === 1 ? '' : 's'}
            </div>
            {statusEntries.map(([status, n]) => {
              const meta = STATUS_LABEL[status] ?? { label: status, icon: '•' };
              return (
                <div key={status} className="text-slate-600 truncate">
                  {meta.icon} {meta.label}{' '}
                  <span className="tabular-nums font-semibold text-slate-800">{n}</span>
                </div>
              );
            })}
            <div className="text-slate-600 truncate">
              Data pgto <span className="tabular-nums font-medium text-slate-800">{dataPgtoLabel}</span>
            </div>
            <div className="text-slate-600 truncate" title={nomeConta}>
              Conta <span className="font-medium text-slate-800">{nomeConta}</span>
            </div>
            <button
              type="button"
              disabled
              aria-disabled="true"
              tabIndex={-1}
              className="text-[10px] text-slate-400 underline-offset-2 underline cursor-default leading-tight bg-transparent border-0 p-0"
              title="Detalhe das parcelas — em breve."
            >
              Ver {records.length} lançamento{records.length === 1 ? '' : 's'} vinculado{records.length === 1 ? '' : 's'}
            </button>
            {(travado || substituivel) && (
              <div
                className={`px-1.5 py-1 rounded border text-[10px] leading-tight italic ${
                  travado
                    ? 'text-amber-800 bg-amber-50 border-amber-300'
                    : 'text-emerald-800 bg-emerald-50 border-emerald-300'
                }`}
              >
                {travado
                  ? '🔒 Financeiro travado — lançamento já realizado/agendado.'
                  : '✏️ Financeiro substituível — pode ser atualizado pelo Zoo.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Card 4: Conferência ───────────────────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5 min-w-0">
        <ColTitle>Conferência</ColTitle>
        <Linha label="Valor Bruto" value={DASH} muted />
        <Linha label="(-) Frete" value={DASH} muted />
        <Linha label="(-) Comissão" value={DASH} muted />
        <Linha label="(-) Funrural" value={DASH} muted />
        <Linha label="(-) Outros Custos" value={DASH} muted />
        <div className="border-t border-slate-300 my-1" />
        <Linha label="Valor Líquido" value={difCell(diferenca)} difBold />
        <Linha label="R$/cab líquido" value={difCell(difCab)} small />
        <Linha label="R$/kg líquido" value={difCell(difKg)} small />

        {!loading && !temFin && (
          <p className="text-[11px] text-slate-500 italic leading-tight pt-1">
            Sem financeiro para comparar.
          </p>
        )}
        {!loading && temFin && (
          <div
            className={`mt-1 px-1.5 py-1 rounded border text-[10px] leading-tight italic ${severidadeCls[severidade]}`}
            title={`${(pctDif * 100).toFixed(2)}%`}
          >
            {mensagemDif}
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

/**
 * Célula de input MEMOIZADA — protege contra perda de foco no re-render do
 * componente a cada tecla. Combinada com handlers estáveis (useCallback no
 * pai), o React mantém o nó DOM do input entre renders.
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

function ColTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 pb-0.5 truncate">
      {children}
    </div>
  );
}

function CampoInput({ label, suffix, children }: { label: string; suffix?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase text-slate-500 font-medium">{label}</span>
        {suffix && <span className="text-[9px] text-slate-400">{suffix}</span>}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

interface LinhaProps {
  label: string;
  value: string;
  /** linha topo (Valor Bruto / Total) — fonte semibold */
  header?: boolean;
  /** deduções — texto suave */
  muted?: boolean;
  /** destaque (Líquido / Total) — bold sem oversize */
  bold?: boolean;
  /** destaque azul (Diferença Líquido) */
  difBold?: boolean;
  /** R$/cab e R$/kg — menores */
  small?: boolean;
}

function Linha({ label, value, header, muted, bold, difBold, small }: LinhaProps) {
  const baseCls = 'flex items-baseline justify-between gap-2 leading-tight py-0.5 min-w-0';
  const labelCls = [
    'text-[11px] truncate',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-600',
    bold && 'font-semibold text-slate-900',
    difBold && 'font-semibold text-slate-900',
    small && 'text-[10px] text-slate-600',
  ].filter(Boolean).join(' ');
  const valueCls = [
    'tabular-nums text-[11px] whitespace-nowrap overflow-hidden text-ellipsis text-right',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-700',
    bold && 'font-bold text-blue-900',
    difBold && 'font-bold text-blue-900',
    small && 'text-[10px] text-slate-700',
  ].filter(Boolean).join(' ');
  return (
    <div className={baseCls}>
      <span className={labelCls}>{label}</span>
      <span className={valueCls} title={value}>{value}</span>
    </div>
  );
}

function formatarData(iso: string): string {
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}
