/**
 * VendaCustosOperacao — aba "Custos da Operação" do modal de Venda V2 (Fase 2A).
 *
 * Story First: TABELA DE LEITURA no topo (Bruto → deduções → Líquido) +
 * GRID COMPACTO de inputs embaixo. Sem rolagem, sem altura extra do modal,
 * densidade idêntica à 1ª aba.
 *
 * - Leitura SEMPRE de `calc` (buildVendaCalculation, motor único).
 * - Edição via `comercial` (VendaComercialState), comunicada ao pai por
 *   onComercialChange. NÃO toca persistência: o save é feito em
 *   doSaveVendaZoo do modal, que já lê `vendaComercial`.
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
    <div className="space-y-2">
      {/* RESUMO — tabela compacta (Bruto → deduções → Líquido) */}
      <div className="rounded border border-slate-300 overflow-hidden">
        <table className="w-full text-[12px] tabular-nums">
          <tbody>
            <Row label="VALOR BRUTO DA VENDA" value={fmt(calc.valorBruto)} header />
            <Row label="(-) Frete" value={fmt(calc.freteVal)} muted />
            <Row label="(-) Comissão" value={fmt(calc.comissaoVal)} muted />
            <Row label="(-) Funrural" value={fmt(calc.funruralTotal)} muted />
            <Row label="(-) Outros Custos" value={fmt(calc.outrosCustosVal)} muted last />
            <Row label="VALOR LÍQUIDO ESPERADO" value={fmt(calc.valorLiquido)} bold divider />
            <Row label="R$/cab líquido" value={fmt(calc.liqCabeca)} small />
            <Row label="R$/kg líquido" value={fmt(calc.liqKg)} small />
          </tbody>
        </table>
      </div>

      {/* INPUTS — grid 2-col compacto */}
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
        {/* Nota discreta na 2ª coluna alinhada com os Funrurais */}
        <div className="text-[10px] text-slate-500 italic self-end pb-1">
          Se ambos os Funrural forem informados, o valor em R$ prevalece.
        </div>
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: string;
  /** linha topo (VALOR BRUTO) — fundo levemente destacado */
  header?: boolean;
  /** linhas de dedução — texto suave */
  muted?: boolean;
  /** linha do Líquido — destaque leve (bold, sem oversize) */
  bold?: boolean;
  /** R$/cab e R$/kg líquido — menores */
  small?: boolean;
  /** sem borda inferior */
  last?: boolean;
  /** divisória mais grossa antes (separa deduções do líquido) */
  divider?: boolean;
}

function Row({ label, value, header, muted, bold, small, last, divider }: RowProps) {
  const baseCls = 'px-2 py-1 leading-tight';
  const trCls = [
    !last && 'border-b border-slate-200',
    divider && 'border-t-2 border-t-slate-400',
    header && 'bg-slate-50',
    bold && 'bg-blue-50/70',
  ].filter(Boolean).join(' ');
  const labelCls = [
    baseCls,
    'text-left',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-600',
    bold && 'font-semibold text-slate-900',
    small && 'text-[11px] text-slate-600',
  ].filter(Boolean).join(' ');
  const valueCls = [
    baseCls,
    'text-right tabular-nums',
    header && 'font-semibold text-slate-900',
    muted && 'text-slate-700',
    bold && 'font-bold text-blue-900',
    small && 'text-[11px] text-slate-700',
  ].filter(Boolean).join(' ');
  return (
    <tr className={trCls}>
      <td className={labelCls}>{label}</td>
      <td className={valueCls}>{value}</td>
    </tr>
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
