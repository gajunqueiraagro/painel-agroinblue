import type { Lancamento, Categoria } from '@/types/cattle';
import { CATEGORIAS } from '@/types/cattle';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Tag, Layers, Home, MapPin, Hash, Weight, Scale, DollarSign, AlertTriangle } from 'lucide-react';
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
  // Valor zootécnico: campo do form quando existir, senão lancamento.valorTotal
  // (sem fallback para financeiro)
  const valorMovimentacao = Number(form.valorTotal ?? lancamento.valorTotal) || 0;
  const precoCabeca = qtd > 0 ? valorMovimentacao / qtd : 0;
  const precoKg = pesoTotal > 0 ? valorMovimentacao / pesoTotal : 0;

  // Fornecedor — cascata visual de display (não muda payload)
  const fornecedorDisplay =
    snapshotNome ??
    (lancamento.fornecedorNomeSnapshot as string | undefined) ??
    lancamento.fazendaOrigem ??
    (lancamento.compradorFornecedor as string | undefined) ??
    null;

  return (
    <div className="space-y-4">
      {/* Linha 1: Data · Tipo · Categoria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Field icon={Calendar} label="Data da Compra">
          <Input
            type="date"
            value={form.data}
            onChange={e => onFormChange(f => ({ ...f, data: e.target.value }))}
            className="font-medium"
          />
        </Field>
        <Field icon={Tag} label="Tipo">
          <div className="px-3 py-2 rounded-md bg-muted text-sm font-medium">Compra</div>
        </Field>
        <Field icon={Layers} label="Categoria">
          <Select
            value={form.categoria}
            onValueChange={v => onFormChange(f => ({ ...f, categoria: v as Categoria }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Linha 2: Fornecedor (col-span-2) · Destino */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <Field icon={Home} label="Fornecedor">
            <FornecedorSelect
              fornecedorId={fornecedorId}
              onFornecedorChange={onFornecedorChange}
              clienteId={clienteId}
              textoLegado={textoLegado}
              snapshotNome={snapshotNome}
              modoResolucaoLegado="permitir"
              label=""
              placeholder={fornecedorDisplay ?? "Selecione ou cadastre fornecedor"}
            />
          </Field>
        </div>
        <Field icon={MapPin} label="Fazenda Destino">
          <div className="px-3 py-2 rounded-md bg-muted text-sm font-medium truncate">
            {nomeFazendaDestino || '—'}
          </div>
        </Field>
      </div>

      {/* Linha 3: Quantidade · Peso Médio · Peso Total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Field icon={Hash} label="Quantidade" suffix="cabeças">
          <Input
            type="number"
            value={form.quantidade}
            onChange={e => onFormChange(f => ({ ...f, quantidade: Number(e.target.value) }))}
            min="1"
            className="text-base font-semibold tabular-nums"
          />
        </Field>
        <Field icon={Weight} label="Peso Médio" suffix="kg/cab">
          <Input
            type="number"
            value={form.pesoMedioKg || ''}
            onChange={e => onFormChange(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))}
            className="text-base font-semibold tabular-nums"
          />
        </Field>
        <Field icon={Scale} label="Peso Total" suffix="kg">
          <div className="px-3 py-2 rounded-md bg-muted text-base font-semibold tabular-nums">
            {pesoTotal > 0 ? pesoTotal.toLocaleString('pt-BR') : '—'}
          </div>
        </Field>
      </div>

      {/* Card destacado: Preço por Cabeça · Preço por Kg · Valor da Movimentação */}
      <div className="rounded-lg border-2 border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-2.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Metric label="Preço por Cabeça" value={precoCabeca > 0 ? formatMoeda(precoCabeca) : '—'} />
          <Metric label="Preço por Kg" value={precoKg > 0 ? formatMoeda(precoKg) : '—'} />
          <Metric label="Valor da Movimentação" value={valorMovimentacao > 0 ? formatMoeda(valorMovimentacao) : '—'} highlight />
        </div>
        {valorMovimentacao === 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Valor da movimentação não informado.</span>
          </div>
        )}
      </div>

      {/* Status Operacional */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Status Operacional
        </Label>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          {(canEditMeta ? ['meta'] as const : ['programado', 'realizado'] as const).map(s => (
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
              className={`flex-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                statusMode === s
                  ? s === 'meta'
                    ? 'bg-amber-500/10 border-amber-400 text-amber-900 dark:text-amber-100'
                    : s === 'realizado'
                      ? 'bg-emerald-500/10 border-emerald-400 text-emerald-900 dark:text-emerald-100'
                      : 'bg-blue-500/10 border-blue-400 text-blue-900 dark:text-blue-100'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {s === 'meta' ? 'Programado (META)' : s === 'realizado' ? 'Realizado' : 'Programado'}
            </button>
          ))}
        </div>
      </div>

      {/* Observações */}
      {onObservacaoChange && (
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Observações
          </Label>
          <Textarea
            value={observacao ?? ''}
            onChange={e => onObservacaoChange(e.target.value)}
            placeholder="Observações sobre a compra…"
            className="mt-1 min-h-[48px]"
          />
        </div>
      )}
    </div>
  );
}

// ── helpers locais ─────────────────────────────────────────────────────

function Field({
  icon: Icon, label, suffix, children,
}: { icon: React.ElementType; label: string; suffix?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-blue-700/70 dark:text-blue-300/70" />
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {suffix && <span className="text-[10px] text-muted-foreground ml-auto">{suffix}</span>}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <DollarSign className={`h-3.5 w-3.5 ${highlight ? 'text-blue-700' : 'text-muted-foreground'}`} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className={`tabular-nums font-semibold ${highlight ? 'text-base text-blue-900 dark:text-blue-100' : 'text-sm'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}
