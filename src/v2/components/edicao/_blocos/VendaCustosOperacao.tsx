/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2.
 *
 * Frame: grid grid-cols-[11fr_9fr] gap-3 (mesmo da aba Dados). Esquerda =
 * inputs compactos dos custos zoo; direita = resumo em linhas flex (sem
 * tabela full-width). Story First preservado: Bruto → deduções → Líquido.
 *
 * - Leitura SEMPRE de `calc` (buildVendaCalculation, motor único).
 * - Edição via `comercial` (VendaComercialState), comunicada ao pai por
 *   onComercialChange. NÃO toca persistência: save é em doSaveVendaZoo
 *   do modal, que já lê `vendaComercial`.
 * - Sem `records`/FinRecord (financeiro = Fase 2B).
 * - Sem guard de mês fechado: custos são econômicos, fora de
 *   CAMPOS_ESTRUTURAIS_VENDA.
 */
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { VendaCalculation } from '@/lib/calculos/venda';
import type { VendaComercialState } from './VendaDadosZootecnicos';

interface Props {
  calc: VendaCalculation;
  comercial: VendaComercialState;
  onComercialChange: Dispatch<SetStateAction<VendaComercialState>>;
  canEditMeta?: boolean;
}

export function VendaCustosOperacao({
  calc,
  comercial,
  onComercialChange,
}: Props) {
  const fmt = (v: number) => (v > 0 ? formatMoeda(v) : 'R$ 0,00');

  return (
    <div className="grid grid-cols-[11fr_9fr] gap-3">
      {/* ─── ESQUERDA: inputs compactos dos custos ────────────────── */}
      <div className="rounded border border-slate-300 p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 pb-0.5">
          Custos da Venda
        </div>
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
        <p className="text-[10px] text-slate-500 italic pt-0.5">
          Se ambos os Funrural forem informados, o valor em R$ prevalece.
        </p>
      </div>

      {/* ─── DIREITA: resumo em linhas flex (sem tabela full-width) ── */}
      <div className="rounded border border-slate-300 p-3 space-y-0.5">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600 pb-0.5">
          Resumo
        </div>
        <Linha label="Valor Bruto" value={fmt(calc.valorBruto)} header />
        <Linha label="(-) Frete" value={fmt(calc.freteVal)} muted />
        <Linha label="(-) Comissão" value={fmt(calc.comissaoVal)} muted />
        <Linha label="(-) Funrural" value={fmt(calc.funruralTotal)} muted />
        <Linha label="(-) Outros Custos" value={fmt(calc.outrosCustosVal)} muted />
        <div className="border-t border-slate-300 my-1" />
        <Linha label="Valor Líquido Esperado" value={fmt(calc.valorLiquido)} bold />
        <Linha label="R$/cab líquido" value={fmt(calc.liqCabeca)} small />
        <Linha label="R$/kg líquido" value={fmt(calc.liqKg)} small />
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

interface LinhaProps {
  label: string;
  value: string;
  /** linha topo (VALOR BRUTO) — fonte semibold */
  header?: boolean;
  /** deduções — texto suave */
  muted?: boolean;
  /** Líquido — destaque leve (bold, sem oversize) */
  bold?: boolean;
  /** R$/cab e R$/kg — menores */
  small?: boolean;
}

function Linha({ label, value, header, muted, bold, small }: LinhaProps) {
  const baseCls = 'flex items-baseline justify-between leading-tight py-0.5';
  const labelCls = [
    'text-[12px]',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-600',
    bold && 'font-semibold text-slate-900',
    small && 'text-[11px] text-slate-600',
  ].filter(Boolean).join(' ');
  const valueCls = [
    'tabular-nums text-[12px]',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-700',
    bold && 'font-bold text-blue-900',
    small && 'text-[11px] text-slate-700',
  ].filter(Boolean).join(' ');
  return (
    <div className={baseCls}>
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{value}</span>
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
