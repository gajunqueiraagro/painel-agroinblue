import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { Lancamento, Categoria } from '@/types/cattle';
import { CATEGORIAS } from '@/types/cattle';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import type { VendaCalculation, TipoPrecoVenda, VendaParcela } from '@/lib/calculos/venda';

type VendaStatusMode = 'realizado' | 'programado' | 'meta';

/**
 * Estado comercial canônico da Venda V2. Inputs SOMENTE — derivados ficam no
 * VendaCalculation (motor único). Persiste no detalhes_snapshot, camelCase.
 */
export interface VendaComercialState {
  tipoVenda: 'desmama' | 'gado_adulto';
  tipoPreco: TipoPrecoVenda;
  precoInput: string;
  frete: string;
  comissaoPct: string;
  outrosCustos: string;
  funruralPct: string;
  funruralReais: string;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: VendaParcela[];
}

export const EMPTY_VENDA_COMERCIAL: VendaComercialState = {
  tipoVenda: 'gado_adulto',
  tipoPreco: 'por_kg',
  precoInput: '',
  frete: '',
  comissaoPct: '',
  outrosCustos: '',
  funruralPct: '',
  funruralReais: '',
  formaReceb: 'avista',
  qtdParcelas: '1',
  parcelas: [],
};

interface Props {
  lancamento: Lancamento;
  form: Lancamento;
  onFormChange: Dispatch<SetStateAction<Lancamento>>;
  comercial: VendaComercialState;
  onComercialChange: Dispatch<SetStateAction<VendaComercialState>>;
  statusMode: VendaStatusMode;
  onStatusModeChange: Dispatch<SetStateAction<VendaStatusMode>>;
  canEditMeta: boolean;
  nomeFazendaOrigem: string;
  fornecedorId: string | null;
  onFornecedorChange: (id: string | null, nome: string | null) => void;
  textoLegado?: string;
  snapshotNome?: string;
  clienteId: string;
  observacao?: string;
  onObservacaoChange?: (v: string) => void;
  /** Saída do motor único — exibida no resumo, NÃO recalculada aqui. */
  calc: VendaCalculation;
}

const TIPO_PRECO_LABEL: Record<TipoPrecoVenda, string> = {
  por_arroba: 'R$/@',
  por_kg: 'R$/kg',
  por_cab: 'R$/cabeça',
  por_total: 'Valor total',
};

export function VendaDadosZootecnicos({
  lancamento, form, onFormChange,
  comercial, onComercialChange,
  statusMode, onStatusModeChange,
  canEditMeta, nomeFazendaOrigem,
  fornecedorId, onFornecedorChange, textoLegado, snapshotNome, clienteId,
  observacao, onObservacaoChange,
  calc,
}: Props) {
  const qtd = Number(form.quantidade) || 0;
  const pesoMedio = Number(form.pesoMedioKg) || 0;
  const pesoTotal = qtd * pesoMedio;

  const statusOpcoes: VendaStatusMode[] = canEditMeta ? ['meta'] : ['programado', 'realizado'];

  // ─── Peso Médio kg (input formatado) ──────────────────────────────
  const [pesoMedioStr, setPesoMedioStr] = useState<string>(() =>
    form.pesoMedioKg !== undefined && form.pesoMedioKg !== null
      ? form.pesoMedioKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : ''
  );
  const lastSyncedPesoMedio = useRef<number | undefined>(form.pesoMedioKg);
  useEffect(() => {
    if (form.pesoMedioKg !== lastSyncedPesoMedio.current) {
      lastSyncedPesoMedio.current = form.pesoMedioKg;
      setPesoMedioStr(
        form.pesoMedioKg !== undefined && form.pesoMedioKg !== null
          ? form.pesoMedioKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : ''
      );
    }
  }, [form.pesoMedioKg]);
  const setPesoMedioFromInput = useCallback((v: string) => {
    setPesoMedioStr(v);
    const parsed = parseDecimalInput(v);
    lastSyncedPesoMedio.current = parsed;
    onFormChange(f => ({ ...f, pesoMedioKg: parsed }));
  }, [onFormChange]);
  const pesoMedioInput = useDecimalInput(pesoMedioStr, setPesoMedioFromInput, 2);
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2 flex-1 flex flex-col">
      {/* Linha 1: Data · Tipo · Categoria */}
      <div className="grid grid-cols-[110px_90px_220px] gap-1.5">
        <Campo label="Data">
          <Input
            type="date"
            value={form.data}
            onChange={e => onFormChange(f => ({ ...f, data: e.target.value }))}
            className="h-6 text-[13px] px-1.5"
          />
        </Campo>
        <Campo label="Tipo">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold flex items-center">Venda</div>
        </Campo>
        <Campo label="Categoria">
          <Select
            value={form.categoria}
            onValueChange={v => onFormChange(f => ({ ...f, categoria: v as Categoria }))}
          >
            <SelectTrigger className="h-6 text-[13px] px-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      {/* Linha 2: Origem (fazenda) · Comprador */}
      <div className="grid grid-cols-[3fr_7fr] gap-1.5">
        <Campo label="Origem">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold flex items-center truncate" title={nomeFazendaOrigem}>
            {nomeFazendaOrigem || '—'}
          </div>
        </Campo>
        <Campo label="Comprador">
          <FornecedorSelect
            fornecedorId={fornecedorId}
            onFornecedorChange={onFornecedorChange}
            clienteId={clienteId}
            textoLegado={textoLegado}
            snapshotNome={snapshotNome}
            modoResolucaoLegado="permitir"
            label=""
            placeholder="Selecione ou cadastre"
          />
        </Campo>
      </div>

      {/* Linha 3: Qtd · Peso Médio · Peso Total */}
      <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-1.5">
        <Campo label="Qtd" suffix="cab">
          <Input
            type="number"
            value={form.quantidade}
            onChange={e => onFormChange(f => ({ ...f, quantidade: Number(e.target.value) }))}
            min="1"
            className="h-6 text-[13px] px-1.5 tabular-nums"
          />
        </Campo>
        <Campo label="Peso Médio" suffix="kg">
          <Input
            type="text"
            inputMode="decimal"
            value={pesoMedioInput.displayValue}
            onChange={pesoMedioInput.onChange}
            onBlur={pesoMedioInput.onBlur}
            onFocus={pesoMedioInput.onFocus}
            placeholder="0,00"
            className="h-6 text-[13px] px-1.5 tabular-nums"
          />
        </Campo>
        <Campo label="Peso Total" suffix="kg">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold tabular-nums flex items-center">
            {pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR') : '—'}
          </div>
        </Campo>
      </div>

      {/* Linha 4 (Comercial): Tipo Venda · Tipo Preço · Preço Input */}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-1.5">
        <Campo label="Tipo Venda">
          <Select
            value={comercial.tipoVenda}
            onValueChange={v => onComercialChange(c => ({ ...c, tipoVenda: v as 'desmama' | 'gado_adulto' }))}
          >
            <SelectTrigger className="h-6 text-[13px] px-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gado_adulto">Gado Adulto</SelectItem>
              <SelectItem value="desmama">Desmama</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Tipo Preço">
          <Select
            value={comercial.tipoPreco}
            onValueChange={v => onComercialChange(c => ({ ...c, tipoPreco: v as TipoPrecoVenda }))}
          >
            <SelectTrigger className="h-6 text-[13px] px-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="por_arroba">{TIPO_PRECO_LABEL.por_arroba}</SelectItem>
              <SelectItem value="por_kg">{TIPO_PRECO_LABEL.por_kg}</SelectItem>
              <SelectItem value="por_cab">{TIPO_PRECO_LABEL.por_cab}</SelectItem>
              <SelectItem value="por_total">{TIPO_PRECO_LABEL.por_total}</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Preço" suffix={TIPO_PRECO_LABEL[comercial.tipoPreco]}>
          <Input
            type="text"
            inputMode="decimal"
            value={comercial.precoInput}
            onChange={e => onComercialChange(c => ({ ...c, precoInput: e.target.value }))}
            placeholder="0,00"
            className="h-6 text-[13px] px-1.5 tabular-nums"
          />
        </Campo>
      </div>

      {/* Custos / Deduções (compactos) */}
      <div className="grid grid-cols-5 gap-1.5">
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
      </div>

      {/* Card Resumo (derivado do motor único — nenhum cálculo local).
          PR-VENDA-V2-UI-01: 4 cards (R$/@ removido). Layout com gap maior e
          min-w-0 nos itens para evitar sobreposição com valores grandes. */}
      <div className="rounded border-2 border-blue-300 bg-blue-50/60 px-2.5 py-2">
        <div className="grid grid-cols-4 gap-x-3 gap-y-1 items-end">
          <PriceMetric label="R$/Kg" value={calc.rKg > 0 ? formatMoeda(calc.rKg) : '—'} />
          <PriceMetric label="R$/Cab" value={calc.rCab > 0 ? formatMoeda(calc.rCab) : '—'} />
          <PriceMetric label="Valor Bruto" value={calc.valorBruto > 0 ? formatMoeda(calc.valorBruto) : '—'} big />
          <PriceMetric label="Valor Líquido" value={calc.valorLiquido !== 0 ? formatMoeda(calc.valorLiquido) : '—'} big />
        </div>
      </div>

      {/* PR-VENDA-V2-UI-01: bloco Pagamento (formaReceb/qtdParcelas/parcelas)
          NÃO renderizado nesta fase — o card esquerdo foca em competência/zoo.
          Os campos PERMANECEM em VendaComercialState/EMPTY_VENDA_COMERCIAL e
          continuam sendo gravados em detalhesSnapshot pelo doSaveVendaZoo.
          Fase 2 trará pagamento no card direito (vínculo financeiro). */}

      {/* Status + Observações (rodapé) */}
      <div className="grid grid-cols-2 gap-3 mt-auto">
        <div>
          <Label className="text-[10px] uppercase text-slate-500 font-medium">Status</Label>
          <div className="flex gap-1.5 mt-0.5">
            {statusOpcoes.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onStatusModeChange(s);
                  onFormChange(f => ({
                    ...f,
                    statusOperacional: s === 'meta' ? null : s,
                    cenario: s === 'meta' ? 'meta' : 'realizado',
                  }));
                }}
                className={`flex-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                  statusMode === s
                    ? s === 'meta'
                      ? 'bg-amber-500/10 border-amber-400 text-amber-900'
                      : s === 'realizado'
                        ? 'bg-emerald-500/10 border-emerald-400 text-emerald-900'
                        : 'bg-blue-500/10 border-blue-400 text-blue-900'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {s === 'meta' ? 'Programado (META)' : s === 'realizado' ? 'Realizado' : 'Programado'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-slate-500 font-medium">Observações</Label>
          <Input
            value={observacao ?? ''}
            onChange={e => onObservacaoChange?.(e.target.value)}
            className="h-6 text-[11px] mt-0.5 px-1.5"
            placeholder="…"
          />
        </div>
      </div>
    </div>
  );
}

// ── helpers locais ────────────────────────────────────────────────────────

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

function PriceMetric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-blue-800/70 font-medium tracking-wide truncate">{label}</div>
      <div
        className={`tabular-nums font-bold text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis ${big ? 'text-[15px]' : 'text-[13px]'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
