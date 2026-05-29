import type { Lancamento } from '@/types/cattle';
import type { FinRecord } from '../LancamentoZooModal';
import { formatMoeda } from '@/lib/calculos/formatters';
import { AlertTriangle, CheckCircle2, Plus, Info } from 'lucide-react';

interface Props {
  lancamento: Lancamento;
  compraForm: Lancamento;
  records: FinRecord[];
  loading: boolean;
  error: string | null;
}

export function CompraCustosOperacao({
  lancamento, compraForm, records, loading, error,
}: Props) {
  const quantidade = Number(compraForm.quantidade) || 0;
  const pesoMedio = Number(compraForm.pesoMedioKg) || 0;
  const pesoTotalKg = quantidade * pesoMedio;
  const valorZoot = Number(compraForm.valorTotal ?? lancamento.valorTotal) || 0;
  const valorFin = records.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const diferenca = valorZoot - valorFin;
  const percent = valorZoot > 0 ? Math.abs(diferenca / valorZoot * 100) : 0;

  const zootRsCab = quantidade > 0 ? valorZoot / quantidade : 0;
  const zootRsKg = pesoTotalKg > 0 ? valorZoot / pesoTotalKg : 0;
  const finRsCab = quantidade > 0 ? valorFin / quantidade : 0;
  const finRsKg = pesoTotalKg > 0 ? valorFin / pesoTotalKg : 0;

  if (loading) {
    return <div className="text-xs text-muted-foreground">Carregando…</div>;
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-md border border-red-200 bg-red-50 text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="text-xs leading-snug">{error}</div>
      </div>
    );
  }

  // Linhas-placeholder de componentes do desembolso.
  // OBRIGATÓRIO: aparecem MESMO QUANDO NÃO HÁ VÍNCULO.
  // Mostrar: R$ 0,00 + botão Vincular DISABLED. Visualizar arquitetura futura.
  const componentesPlaceholders = ['Frete', 'Comissão', 'Taxas e Impostos', 'Outros Custos'];

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* ESQUERDA: 2 tabelas */}
      <div className="col-span-8 space-y-3">

        {/* TABELA 1: Comparativo */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-[12px] font-bold text-slate-900 uppercase tracking-wide">
              Competência (Zootécnico) vs Caixa (Financeiro)
            </h2>
            <span className="text-[10px] text-slate-500">Diferença informativa · não bloqueia</span>
          </div>
          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-800 text-white text-[10px] uppercase font-bold tracking-wider">
              <div className="col-span-4 px-2.5 py-1">Componente</div>
              <div className="col-span-3 px-2.5 py-1 text-right border-l border-slate-700">Competência</div>
              <div className="col-span-3 px-2.5 py-1 text-right border-l border-slate-700">Caixa</div>
              <div className="col-span-2 px-2.5 py-1 text-right border-l border-slate-700">Δ</div>
            </div>
            {/* Valor da Movimentação */}
            <div className="grid grid-cols-12 border-b border-slate-100 bg-white">
              <div className="col-span-4 px-2.5 py-1.5 text-[12px] font-semibold text-slate-800">Valor da Movimentação</div>
              <div className="col-span-3 px-2.5 py-1.5 text-right text-[13px] font-bold tabular-nums border-l border-slate-100">{formatMoeda(valorZoot)}</div>
              <div className="col-span-3 px-2.5 py-1.5 text-right text-[13px] font-bold text-emerald-700 tabular-nums border-l border-slate-100">{formatMoeda(valorFin)}</div>
              <div className="col-span-2 px-2.5 py-1.5 text-right text-[11px] font-bold text-amber-700 tabular-nums border-l border-slate-100">{formatMoeda(diferenca)}</div>
            </div>
            {/* R$/cab */}
            <div className="grid grid-cols-12 border-b border-slate-100 bg-white">
              <div className="col-span-4 px-2.5 py-1 text-[11px] text-slate-600">R$ / cab</div>
              <div className="col-span-3 px-2.5 py-1 text-right text-[11px] tabular-nums border-l border-slate-100">{formatMoeda(zootRsCab)}</div>
              <div className="col-span-3 px-2.5 py-1 text-right text-[11px] tabular-nums border-l border-slate-100">{formatMoeda(finRsCab)}</div>
              <div className="col-span-2 px-2.5 py-1 text-right text-[11px] text-amber-700 tabular-nums border-l border-slate-100">{formatMoeda(zootRsCab - finRsCab)}</div>
            </div>
            {/* R$/kg */}
            <div className="grid grid-cols-12 border-b border-slate-100 bg-white">
              <div className="col-span-4 px-2.5 py-1 text-[11px] text-slate-600">R$ / kg</div>
              <div className="col-span-3 px-2.5 py-1 text-right text-[11px] tabular-nums border-l border-slate-100">{formatMoeda(zootRsKg)}</div>
              <div className="col-span-3 px-2.5 py-1 text-right text-[11px] tabular-nums border-l border-slate-100">{formatMoeda(finRsKg)}</div>
              <div className="col-span-2 px-2.5 py-1 text-right text-[11px] text-amber-700 tabular-nums border-l border-slate-100">{formatMoeda(zootRsKg - finRsKg)}</div>
            </div>
            {/* Diferença % */}
            <div className="grid grid-cols-12 bg-amber-50">
              <div className="col-span-10 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-900">Diferença Informativa</div>
              <div className="col-span-2 px-2.5 py-1 text-right text-[12px] font-bold text-amber-800 tabular-nums">{percent.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {/* TABELA 2: Composição do Desembolso */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-[12px] font-bold text-slate-900 uppercase tracking-wide">Composição do Desembolso</h2>
            <span className="text-[10px] text-slate-500">Vinculação por componente · fase futura</span>
          </div>
          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-800 text-white text-[10px] uppercase font-bold tracking-wider">
              <div className="col-span-5 px-2.5 py-1">Componente</div>
              <div className="col-span-3 px-2.5 py-1 text-right border-l border-slate-700">Valor</div>
              <div className="col-span-2 px-2.5 py-1 text-right border-l border-slate-700">R$/cab</div>
              <div className="col-span-2 px-2.5 py-1 text-center border-l border-slate-700">Ação</div>
            </div>

            {/* Fornecedor (vinculado) */}
            <div className="grid grid-cols-12 border-b border-slate-100 bg-white">
              <div className="col-span-5 px-2.5 py-1 text-[12px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <b>Fornecedor</b>
                <span className="text-slate-400 text-[10px]">(valor base)</span>
              </div>
              <div className="col-span-3 px-2.5 py-1 text-right text-[12px] font-bold tabular-nums border-l border-slate-100">{formatMoeda(valorFin)}</div>
              <div className="col-span-2 px-2.5 py-1 text-right text-[11px] tabular-nums border-l border-slate-100">{formatMoeda(finRsCab)}</div>
              <div className="col-span-2 px-2.5 py-1 text-center border-l border-slate-100">
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">Vinculado</span>
              </div>
            </div>

            {/* Placeholders OBRIGATÓRIOS: aparecem SEMPRE, com ou sem vínculo */}
            {componentesPlaceholders.map((nome, idx) => (
              <div
                key={nome}
                className={`grid grid-cols-12 ${idx === componentesPlaceholders.length - 1 ? 'border-b border-slate-200' : 'border-b border-slate-100'} bg-white hover:bg-slate-50`}
              >
                <div className="col-span-5 px-2.5 py-1 text-[12px] text-slate-700">{nome}</div>
                <div className="col-span-3 px-2.5 py-1 text-right text-[11px] text-slate-400 italic tabular-nums border-l border-slate-100">R$ 0,00</div>
                <div className="col-span-2 px-2.5 py-1 text-right text-[11px] text-slate-400 italic tabular-nums border-l border-slate-100">—</div>
                <div className="col-span-2 px-2.5 py-1 text-center border-l border-slate-100">
                  <button
                    type="button"
                    disabled
                    title="Disponível em fase futura"
                    className="text-[10px] px-1.5 py-0.5 bg-white text-purple-700 border border-purple-300 rounded inline-flex items-center gap-1 font-semibold opacity-60 cursor-not-allowed"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    Vincular
                  </button>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="grid grid-cols-12 bg-slate-100 font-bold">
              <div className="col-span-5 px-2.5 py-1.5 text-[12px] uppercase tracking-wide text-slate-800">Total Desembolso</div>
              <div className="col-span-3 px-2.5 py-1.5 text-right text-[13px] text-emerald-800 tabular-nums border-l border-slate-300">{formatMoeda(valorFin)}</div>
              <div className="col-span-2 px-2.5 py-1.5 text-right text-[11px] tabular-nums border-l border-slate-300">{formatMoeda(finRsCab)}</div>
              <div className="col-span-2 border-l border-slate-300" />
            </div>
          </div>
        </div>
      </div>

      {/* DIREITA: 3 cards */}
      <div className="col-span-4 space-y-2">
        <div className="rounded border border-blue-300 bg-blue-50/40 p-2.5">
          <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Custo Direto (Zootécnico)</div>
          <div className="text-[16px] font-bold text-blue-900 tabular-nums mt-0.5">{formatMoeda(valorZoot)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-slate-500">R$/cab:</span> <span className="font-semibold tabular-nums">{formatMoeda(zootRsCab)}</span></div>
            <div><span className="text-slate-500">R$/kg:</span> <span className="font-semibold tabular-nums">{formatMoeda(zootRsKg)}</span></div>
          </div>
        </div>

        <div className="rounded border border-emerald-300 bg-emerald-50/40 p-2.5">
          <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Custo Total (Caixa)</div>
          <div className="text-[16px] font-bold text-emerald-900 tabular-nums mt-0.5">{formatMoeda(valorFin)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-slate-500">R$/cab:</span> <span className="font-semibold tabular-nums">{formatMoeda(finRsCab)}</span></div>
            <div><span className="text-slate-500">R$/kg:</span> <span className="font-semibold tabular-nums">{formatMoeda(finRsKg)}</span></div>
          </div>
          <p className="mt-1.5 pt-1.5 border-t border-emerald-200 text-[10px] text-emerald-800/80 italic">
            Inclui despesas indiretas quando vinculadas.
          </p>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[10px] text-slate-700 leading-snug">
          <div className="font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Como funciona
          </div>
          <p>Zootécnico → DRE (competência). Financeiro → Caixa (conciliação). Coexistem; diferença é informativa.</p>
          <p className="mt-1">Cada linha de despesa terá ícone para abrir drawer de vinculação financeira em fase futura.</p>
        </div>
      </div>
    </div>
  );
}
