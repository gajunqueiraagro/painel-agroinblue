/**
 * Modo Rápido — grid editável tipo Excel para lançamento em lote.
 * Navegação: Tab → próxima col, Enter → próxima linha, ↑↓ → nav vertical.
 * Nova linha herda campos da anterior. Subcentro preenche macro/centro automaticamente.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { LancamentoV2Form, ContaBancariaV2, ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { STATUS_LABEL as STATUS_LABEL_MAP } from '@/lib/statusOperacional';

interface RowData {
  id: string;
  data_competencia: string;
  data_pagamento: string;
  tipo_operacao: string;
  conta_bancaria_id: string;
  descricao: string;
  valor: string;
  subcentro: string;
  status_transacao: string;
  // Auto-filled
  macro_custo: string;
  centro_custo: string;
}

interface Props {
  fazendaId: string;
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  onSaveBatch: (forms: LancamentoV2Form[]) => Promise<boolean>;
  onDone: () => void;
}

const TIPOS = ['1-Entradas', '2-Saídas', '3-Transferências'];
const STATUS_LIST = ['meta', 'agendado', 'programado', 'realizado'];
const STATUS_UI_LABEL: Record<string, string> = { meta: STATUS_LABEL_MAP.meta, agendado: 'Agendado', programado: STATUS_LABEL_MAP.programado, realizado: STATUS_LABEL_MAP.realizado };

const COLS = ['data_competencia', 'data_pagamento', 'tipo_operacao', 'conta_bancaria_id', 'descricao', 'valor', 'subcentro', 'status_transacao'] as const;
type ColKey = typeof COLS[number];

let rowCounter = 0;
function newRowId() { return `row_${++rowCounter}_${Date.now()}`; }

function deriveStatus(dataPagamento: string): string {
  if (!dataPagamento) return 'meta';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dataPagamento + 'T00:00:00');
  if (d > today) return 'agendado';
  return 'programado';
}

function createEmptyRow(inherit?: Partial<RowData>): RowData {
  return {
    id: newRowId(),
    data_competencia: inherit?.data_competencia || '',
    data_pagamento: inherit?.data_pagamento || '',
    tipo_operacao: inherit?.tipo_operacao || '2-Saídas',
    conta_bancaria_id: inherit?.conta_bancaria_id || '',
    descricao: '',
    valor: '',
    subcentro: inherit?.subcentro || '',
    status_transacao: inherit?.status_transacao || 'meta',
    macro_custo: inherit?.macro_custo || '',
    centro_custo: inherit?.centro_custo || '',
  };
}

export function ModoRapidoGrid({ fazendaId, contas, classificacoes, onSaveBatch, onDone }: Props) {
  const [rows, setRows] = useState<RowData[]>(() => [createEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Map<string, string[]>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);

  // Subcentro → classification lookup
  const classMap = useMemo(() => {
    const m = new Map<string, ClassificacaoItem>();
    for (const c of classificacoes) m.set(c.subcentro, c);
    return m;
  }, [classificacoes]);

  // Unique subcentros for datalist
  const subcentroOptions = useMemo(() => classificacoes.map(c => c.subcentro), [classificacoes]);

  const updateRow = useCallback((rowId: string, col: ColKey, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [col]: value };

      // Auto-classify on subcentro change
      if (col === 'subcentro') {
        const cls = classMap.get(value);
        if (cls) {
          updated.macro_custo = cls.macro_custo;
          updated.centro_custo = cls.centro_custo;
          updated.tipo_operacao = cls.tipo_operacao;
        }
      }

      // Auto-status on date change
      if (col === 'data_pagamento') {
        updated.status_transacao = deriveStatus(value);
      }

      return updated;
    }));
  }, [classMap]);

  const addRow = useCallback(() => {
    setRows(prev => {
      const last = prev[prev.length - 1];
      return [...prev, createEmptyRow(last)];
    });
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== rowId);
      return filtered.length === 0 ? [createEmptyRow()] : filtered;
    });
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT';

    if (e.key === 'Enter') {
      e.preventDefault();
      // Move to next row, same column
      if (rowIdx === rows.length - 1) {
        addRow();
      }
      setTimeout(() => {
        const nextRow = gridRef.current?.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`) as HTMLElement;
        nextRow?.focus();
      }, 50);
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (isInput && (e.target as HTMLInputElement).type !== 'text') return;
      e.preventDefault();
      const next = gridRef.current?.querySelector(`[data-row="${rowIdx + 1}"][data-col="${colIdx}"]`) as HTMLElement;
      next?.focus();
    }

    if (e.key === 'ArrowUp' && !e.shiftKey) {
      if (isInput && (e.target as HTMLInputElement).type !== 'text') return;
      e.preventDefault();
      const prev = gridRef.current?.querySelector(`[data-row="${rowIdx - 1}"][data-col="${colIdx}"]`) as HTMLElement;
      prev?.focus();
    }
  }, [rows.length, addRow]);

  // Validate
  const validate = useCallback((): boolean => {
    const errs = new Map<string, string[]>();
    let valid = true;

    for (const row of rows) {
      // Skip completely empty rows
      if (!row.data_competencia && !row.valor && !row.descricao) continue;

      const rowErrs: string[] = [];
      if (!row.data_competencia) rowErrs.push('Data competência obrigatória');
      if (!row.valor || parseFloat(row.valor) <= 0) rowErrs.push('Valor obrigatório');

      if (rowErrs.length > 0) {
        errs.set(row.id, rowErrs);
        valid = false;
      }
    }

    setErrors(errs);
    return valid;
  }, [rows]);

  // Save batch
  const handleSave = useCallback(async () => {
    if (!validate()) {
      toast.error('Corrija os erros antes de salvar');
      return;
    }

    const forms: LancamentoV2Form[] = rows
      .filter(r => r.data_competencia && r.valor && parseFloat(r.valor) > 0)
      .map(r => ({
        fazenda_id: fazendaId,
        conta_bancaria_id: r.conta_bancaria_id || null,
        data_competencia: r.data_competencia,
        data_pagamento: r.data_pagamento || null,
        valor: Math.abs(parseFloat(r.valor)),
        tipo_operacao: r.tipo_operacao || '2-Saídas',
        status_transacao: r.status_transacao || 'meta',
        descricao: r.descricao,
        macro_custo: r.macro_custo,
        centro_custo: r.centro_custo,
        subcentro: r.subcentro,
      }));

    if (forms.length === 0) {
      toast.info('Nenhuma linha preenchida para salvar');
      return;
    }

    setSaving(true);
    const ok = await onSaveBatch(forms);
    setSaving(false);

    if (ok) {
      setRows([createEmptyRow()]);
      setErrors(new Map());
      onDone();
    }
  }, [rows, fazendaId, validate, onSaveBatch, onDone]);

  const filledCount = rows.filter(r => r.data_competencia && r.valor).length;

  const contasFazenda = contas.filter(c => c.fazenda_id === fazendaId);

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {filledCount} linha(s) preenchida(s) · {rows.length} total
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Linha
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || filledCount === 0} className="h-7 text-xs gap-1">
            <Save className="h-3 w-3" /> {saving ? 'Salvando...' : `Salvar Tudo (${filledCount})`}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="rounded-lg border overflow-x-auto bg-card">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[28px]">#</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[105px]">Dt. Comp.</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[105px]">Dt. Pgto.</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[100px]">Tipo</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[110px]">Conta</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground min-w-[140px]">Descrição</th>
              <th className="px-1 py-1.5 text-right font-bold text-muted-foreground w-[90px]">Valor</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground min-w-[160px]">Subcentro</th>
              <th className="px-1 py-1.5 text-left font-bold text-muted-foreground w-[90px]">Status</th>
              <th className="px-1 py-1.5 w-[30px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const rowErrors = errors.get(row.id);
              const hasError = !!rowErrors;

              return (
                <tr key={row.id} className={`border-b last:border-b-0 ${hasError ? 'bg-destructive/5' : 'hover:bg-muted/30'}`}>
                  <td className="px-1 py-0.5 text-muted-foreground font-mono text-center">
                    {rowIdx + 1}
                    {hasError && (
                      <span title={rowErrors?.join(', ')}><AlertCircle className="h-3 w-3 text-destructive inline ml-0.5" /></span>
                    )}
                  </td>
                  {/* Data Competência */}
                  <td className="px-0.5 py-0.5">
                    <input
                      type="date"
                      data-row={rowIdx}
                      data-col={0}
                      value={row.data_competencia}
                      onChange={e => updateRow(row.id, 'data_competencia', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 0)}
                      className="w-full h-7 px-1 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    />
                  </td>
                  {/* Data Pagamento */}
                  <td className="px-0.5 py-0.5">
                    <input
                      type="date"
                      data-row={rowIdx}
                      data-col={1}
                      value={row.data_pagamento}
                      onChange={e => updateRow(row.id, 'data_pagamento', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 1)}
                      className="w-full h-7 px-1 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    />
                  </td>
                  {/* Tipo Operação */}
                  <td className="px-0.5 py-0.5">
                    <select
                      data-row={rowIdx}
                      data-col={2}
                      value={row.tipo_operacao}
                      onChange={e => updateRow(row.id, 'tipo_operacao', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 2)}
                      className="w-full h-7 px-0.5 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    >
                      {TIPOS.map(t => <option key={t} value={t}>{t.replace(/^\d-/, '')}</option>)}
                    </select>
                  </td>
                  {/* Conta */}
                  <td className="px-0.5 py-0.5">
                    <select
                      data-row={rowIdx}
                      data-col={3}
                      value={row.conta_bancaria_id}
                      onChange={e => updateRow(row.id, 'conta_bancaria_id', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 3)}
                      className="w-full h-7 px-0.5 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    >
                      <option value="">—</option>
                      {contasFazenda.map(c => <option key={c.id} value={c.id}>{c.nome_conta}</option>)}
                    </select>
                  </td>
                  {/* Descrição */}
                  <td className="px-0.5 py-0.5">
                    <input
                      type="text"
                      data-row={rowIdx}
                      data-col={4}
                      value={row.descricao}
                      onChange={e => updateRow(row.id, 'descricao', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 4)}
                      placeholder="Descrição..."
                      className="w-full h-7 px-1 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none placeholder:text-muted-foreground/40"
                    />
                  </td>
                  {/* Valor */}
                  <td className="px-0.5 py-0.5">
                    <input
                      type="number"
                      data-row={rowIdx}
                      data-col={5}
                      value={row.valor}
                      onChange={e => updateRow(row.id, 'valor', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 5)}
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      className="w-full h-7 px-1 text-[11px] text-right font-mono bg-transparent border border-transparent focus:border-primary/40 rounded outline-none placeholder:text-muted-foreground/40"
                    />
                  </td>
                  {/* Subcentro */}
                  <td className="px-0.5 py-0.5">
                    <select
                      data-row={rowIdx}
                      data-col={6}
                      value={row.subcentro}
                      onChange={e => updateRow(row.id, 'subcentro', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 6)}
                      className="w-full h-7 px-0.5 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    >
                      <option value="">Selecione...</option>
                      {subcentroOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  {/* Status */}
                  <td className="px-0.5 py-0.5">
                    <select
                      data-row={rowIdx}
                      data-col={7}
                      value={row.status_transacao}
                      onChange={e => updateRow(row.id, 'status_transacao', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, rowIdx, 7)}
                      className="w-full h-7 px-0.5 text-[11px] bg-transparent border border-transparent focus:border-primary/40 rounded outline-none"
                    >
                      {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_UI_LABEL[s] || s}</option>)}
                    </select>
                  </td>
                  {/* Delete */}
                  <td className="px-0.5 py-0.5 text-center">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                      title="Remover linha"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

      </div>

      {/* Classification preview */}
      {rows.some(r => r.macro_custo) && (
        <div className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
          <strong>Classificação automática ativa</strong> — ao selecionar subcentro, macro_custo e centro_custo são preenchidos automaticamente.
        </div>
      )}
    </div>
  );
}
