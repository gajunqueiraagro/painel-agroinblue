import type { ReactNode } from 'react';
import type { Lancamento, Categoria } from '@/types/cattle';
import { CATEGORIAS } from '@/types/cattle';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Dispatch, SetStateAction } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

type CompraStatusMode = 'realizado' | 'programado' | 'meta';

interface Props {
  lancamento: Lancamento;
  form: Lancamento;
  onFormChange: Dispatch<SetStateAction<Lancamento>>;
  statusMode: CompraStatusMode;
  onStatusModeChange: Dispatch<SetStateAction<CompraStatusMode>>;
  canEditMeta: boolean;
  nomeFazendaDestino: string;
  fornecedorId: string | null;
  onFornecedorChange: (id: string | null, nome: string | null) => void;
  textoLegado?: string;
  snapshotNome?: string;
  clienteId: string;
  observacao?: string;
  onObservacaoChange?: (v: string) => void;
}

export function CompraDadosZootecnicos({
  lancamento, form, onFormChange, statusMode, onStatusModeChange,
  canEditMeta, nomeFazendaDestino,
  fornecedorId, onFornecedorChange, textoLegado, snapshotNome, clienteId,
  observacao, onObservacaoChange,
}: Props) {
  const qtd = Number(form.quantidade) || 0;
  const pesoMedio = Number(form.pesoMedioKg) || 0;
  const pesoTotal = qtd * pesoMedio;
  const valorMovimentacao = Number(form.valorTotal ?? lancamento.valorTotal) || 0;
  const precoCabeca = qtd > 0 ? valorMovimentacao / qtd : 0;
  const precoKg = pesoTotal > 0 ? valorMovimentacao / pesoTotal : 0;

  const statusOpcoes: CompraStatusMode[] = canEditMeta ? ['meta'] : ['programado', 'realizado'];

  return (
    <div className="space-y-2 flex-1 flex flex-col">
      {/* Linha 1: Data · Tipo · Categoria */}
      <div className="grid grid-cols-[110px_90px_1fr] gap-1.5">
        <Campo label="Data">
          <Input
            type="date"
            value={form.data}
            onChange={e => onFormChange(f => ({ ...f, data: e.target.value }))}
            className="h-6 text-[13px] px-1.5"
          />
        </Campo>
        <Campo label="Tipo">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold flex items-center">Compra</div>
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

      {/* Linha 2: Origem/Fornecedor · Destino */}
      <div className="grid grid-cols-[7fr_3fr] gap-1.5">
        <Campo label="Origem / Fornecedor">
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
        <Campo label="Destino">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold flex items-center truncate" title={nomeFazendaDestino}>
            {nomeFazendaDestino || '—'}
          </div>
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
            type="number"
            value={form.pesoMedioKg || ''}
            onChange={e => onFormChange(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))}
            className="h-6 text-[13px] px-1.5 tabular-nums"
          />
        </Campo>
        <Campo label="Peso Total" suffix="kg">
          <div className="h-6 px-1.5 rounded-md bg-muted text-[13px] font-semibold tabular-nums flex items-center">
            {pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR') : '—'}
          </div>
        </Campo>
      </div>

      {/* CardPreço inline */}
      <div className="rounded border-2 border-blue-300 bg-blue-50/60 px-2.5 py-1.5">
        <div className="grid grid-cols-3 gap-1.5 items-end">
          <PriceMetric label="R$/Cabeça" value={precoCabeca > 0 ? formatMoeda(precoCabeca) : '—'} />
          <PriceMetric label="R$/Kg" value={precoKg > 0 ? formatMoeda(precoKg) : '—'} />
          <div>
            <div className="text-[10px] uppercase text-blue-800/70 font-medium tracking-wide">Valor Total</div>
            <Input
              type="number"
              value={form.valorTotal ?? ''}
              onChange={e => onFormChange(f => ({
                ...f,
                valorTotal: e.target.value !== '' ? Number(e.target.value) : undefined,
              }))}
              placeholder="0,00"
              className="h-7 text-[11px] mt-0.5"
            />
          </div>
        </div>
      </div>

      {/* Linha final: Status + Observações (empurrada para a base) */}
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

// ── helpers locais ─────────────────────────────────────────────────────

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
    <div>
      <div className="text-[10px] uppercase text-blue-800/70 font-medium tracking-wide">{label}</div>
      <div className={`tabular-nums font-bold text-blue-900 ${big ? 'text-[16px]' : 'text-[14px]'}`}>{value}</div>
    </div>
  );
}
