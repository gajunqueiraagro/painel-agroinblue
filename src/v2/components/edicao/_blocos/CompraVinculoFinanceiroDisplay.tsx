import type { FinRecord } from '../LancamentoZooModal';
import { formatMoeda } from '@/lib/calculos/formatters';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, ExternalLink,
  CheckCircle2, XCircle,
} from 'lucide-react';

interface Props {
  records: FinRecord[];
  contasMap: Map<string, string>;
  loading: boolean;
  error: string | null;
  valorZootecnico: number;
  quantidade: number;
  pesoTotalKg: number;
}

export function CompraVinculoFinanceiroDisplay({
  records, contasMap, loading, error,
  valorZootecnico,
}: Props) {

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

  const valorVinculado = records.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const diferenca = valorZootecnico - valorVinculado;
  const percentDiferenca = valorZootecnico > 0 ? (diferenca / valorZootecnico) * 100 : 0;
  const semVinculo = records.length === 0;

  const status = (() => {
    if (semVinculo) return { label: 'NÃO VINCULADO', tone: 'muted' as const };
    const algumConciliado = records.some(r => r.conciliado_em != null);
    if (algumConciliado) return { label: 'REALIZADO (CONCILIADO)', tone: 'blue' as const };
    const todosRealizados = records.every(r => r.status_transacao === 'realizado');
    if (todosRealizados) return { label: 'REALIZADO', tone: 'red' as const };
    const algumAgendado = records.some(r => r.status_transacao === 'agendado');
    if (algumAgendado) return { label: 'AGENDADO', tone: 'amber' as const };
    return { label: 'PROGRAMADO', tone: 'amber' as const };
  })();

  const isRealizado = status.tone === 'red' || status.tone === 'blue';
  const dataLabel = isRealizado ? 'Data de Pagamento' : 'Data Prevista';
  const contaLabel = isRealizado ? 'Conta/Caixa' : 'Conta Prevista';

  const dataPrevista = records[0]?.data_pagamento ?? records[0]?.data_competencia ?? null;
  const primeiraConta = records[0]?.conta_bancaria_id ?? null;
  const contaPrevista = primeiraConta ? (contasMap.get(primeiraConta) ?? '—') : '—';
  const realizado = !semVinculo && records.every(r => r.status_transacao === 'realizado');

  return (
    <div className="flex-1 flex flex-col">

      {/* PR-V2E.2: trio mantido em 1 linha com Diferença mais estreita.
          Fontes 15→12px + leading-none + whitespace-nowrap para valores R$
          grandes (ex.: R$ 319.460,00) não quebrarem em coluna direita 45%.
          Labels com truncate. Se ainda quebrar em runtime: REPORTAR,
          não tentar 2 linhas neste PR. */}
      <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-2 mb-2">
        <div className="rounded bg-slate-50 border border-slate-200 px-2 py-1.5">
          <div className="text-[9px] uppercase text-slate-500 font-semibold truncate">Zootécnico</div>
          <div className="text-[12px] font-bold text-slate-800 tabular-nums leading-none whitespace-nowrap mt-0.5">
            {formatMoeda(valorZootecnico)}
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">Competência</div>
        </div>
        <div className="rounded bg-emerald-50 border border-emerald-300 px-2 py-1.5">
          <div className="text-[9px] uppercase text-emerald-700 font-semibold truncate">Vinculado</div>
          <div className="text-[12px] font-bold text-emerald-700 tabular-nums leading-none whitespace-nowrap mt-0.5">
            {formatMoeda(valorVinculado)}
          </div>
          <div className="text-[9px] text-emerald-700/70 mt-0.5">Caixa</div>
        </div>
        <div className={`rounded border px-2 py-1.5 ${
          Math.abs(diferenca) < 0.01
            ? 'bg-slate-50 border-slate-200'
            : 'bg-amber-50 border-amber-300'
        }`}>
          <div className={`text-[9px] uppercase font-semibold truncate ${
            Math.abs(diferenca) < 0.01 ? 'text-slate-500' : 'text-amber-700'
          }`}>
            Diferença
          </div>
          <div className={`text-[12px] font-bold tabular-nums leading-none whitespace-nowrap mt-0.5 ${
            Math.abs(diferenca) < 0.01 ? 'text-slate-500' : 'text-amber-700'
          }`}>
            {Math.abs(diferenca) < 0.01 ? 'R$ 0,00' : formatMoeda(diferenca)}
          </div>
          <div className={`text-[9px] mt-0.5 ${
            Math.abs(diferenca) < 0.01 ? 'text-slate-500' : 'text-amber-700/70'
          }`}>
            {valorZootecnico > 0 ? `${Math.abs(percentDiferenca).toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>

      {/* KVs em grid [110px_1fr] — sem coluna estreita que quebre */}
      {!semVinculo && (
        <div className="border-t border-slate-100 pt-2 space-y-1 text-[11px]">
          <div className="grid grid-cols-[110px_1fr] items-center">
            <span className="text-slate-500">Status:</span>
            <Badge variant="outline" className={`w-fit text-[10px] font-bold tracking-wide ${
              status.tone === 'red' ? 'border-red-300 bg-red-50 text-red-900' :
              status.tone === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-900' :
              status.tone === 'blue' ? 'border-blue-300 bg-blue-50 text-blue-900' :
              'border-muted-foreground/30'
            }`}>
              {status.label}
            </Badge>
          </div>
          <div className="grid grid-cols-[110px_1fr_110px_1fr] items-center gap-1">
            <span className="text-slate-500">Parcelas:</span>
            <span className="font-semibold tabular-nums">
              {records.length} parcela{records.length > 1 ? 's' : ''}
            </span>
            <span className="text-slate-500">{dataLabel}:</span>
            <span className="font-semibold tabular-nums">
              {dataPrevista ? new Date(dataPrevista).toLocaleDateString('pt-BR') : '—'}
            </span>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-center">
            <span className="text-slate-500">{contaLabel}:</span>
            <span className="font-semibold truncate" title={contaPrevista}>
              {contaPrevista}
            </span>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-center">
            <span className="text-slate-500">Realizado:</span>
            <span className={`font-semibold flex items-center gap-1 ${
              realizado ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {realizado ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {realizado ? 'Sim' : 'Não'}
            </span>
          </div>
        </div>
      )}

      {semVinculo && (
        <div className="text-[11px] text-slate-500 italic mt-2">
          Financeiro não vinculado.
        </div>
      )}

      {!semVinculo && (
        <a className="mt-auto pt-1.5 text-[11px] text-blue-700 hover:underline font-medium flex items-center gap-1 self-end cursor-pointer">
          Ver detalhes do financeiro
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}

    </div>
  );
}
