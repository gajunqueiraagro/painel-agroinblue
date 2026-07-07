/**
 * EnriquecimentoCandidatosDrawer — drawer da Mesa nova para resolver uma linha
 * 'candidatos_proximos' ou 'sem_match'. DUAS seções SEPARADAS (PR-DRAWER-1TO1-01):
 *
 *   1) MATCH 1:1 (topo) — fonte fn_classificacao_candidatos_proximos (valor = Excel).
 *      Só para linha 'candidatos_proximos'. Ação por candidato: "Escolher candidato"
 *      (fn_classificacao_resolver_proximos). Candidato de valor igual destacado.
 *   2) COMPOR POR SOMA (abaixo) — fonte fn_classificacao_candidatos_grupo, filtrada aos
 *      PARCIAIS (valor < Excel; o valor-igual é 1:1, não compõe). Seleção múltipla +
 *      soma/diferença ao vivo. Ação: "Agrupar selecionados" (fn_classificacao_resolver_grupo).
 *
 * A UI NUNCA mistura candidato 1:1 com candidato de composição, e NÃO re-declara a janela
 * (fonte única = RPCs). O sistema nunca decide sozinho.
 */
import { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useClassificacaoCandidatosProximos, type CandidatoProximo } from '@/v2/hooks/useClassificacaoCandidatosProximos';
import { useClassificacaoCandidatosGrupo } from '@/v2/hooks/useClassificacaoCandidatosGrupo';

export interface ContextoExcelProx {
  linha: number | null;
  data: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  fornecedor: string | null;
}

interface Props {
  stagingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextoExcel: ContextoExcelProx | null;
  excelValor: number | null;
  statusLinha: string | null;
  /** 1:1 (resolver_proximos). O pai trata toast/guard e fecha o drawer. */
  onEscolher: (lancId: string) => void;
  /** N:1 (resolver_grupo). O pai trata toast/guard e fecha o drawer. */
  onAgrupar: (lancIds: string[]) => void;
  isResolvendo?: boolean;
  isAgrupando?: boolean;
  /** lanc_id → linhas Excel que já o usaram (singular OU grupo) — ocultados, com o motivo. */
  lancIdsUsados?: Map<string, number[]>;
}

const TOL = 0.005;
const abs = (v: number | null | undefined) => Math.abs(Number(v) || 0);

function fmtData(s: string | null): string {
  if (!s) return '-';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}
function truncUuid(uuid: string | null): string {
  return uuid ? uuid.slice(0, 8) : '-';
}
function distCls(d: number | null): string {
  if (d == null) return 'bg-muted text-muted-foreground';
  if (d <= 1) return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
  if (d <= 3) return 'bg-amber-100 text-amber-800 border border-amber-300';
  return 'bg-orange-100 text-orange-800 border border-orange-300';
}

// Separa visíveis/ocultos por USO, acumulando as LINHAS Excel que usaram os ocultos.
function partilharPorUso(
  cands: CandidatoProximo[] | undefined,
  usados?: Map<string, number[]>,
): { visiveis: CandidatoProximo[]; ocultos: number; linhas: number[] } {
  const lista = cands ?? [];
  if (!usados || usados.size === 0) return { visiveis: lista, ocultos: 0, linhas: [] };
  const visiveis: CandidatoProximo[] = [];
  const linhasSet = new Set<number>();
  for (const c of lista) {
    const usadoPor = usados.get(c.lanc_id);
    if (usadoPor && usadoPor.length) usadoPor.forEach((l) => linhasSet.add(l));
    else visiveis.push(c);
  }
  return { visiveis, ocultos: lista.length - visiveis.length, linhas: [...linhasSet].sort((a, b) => a - b) };
}

function OcultosNota({ ocultos, linhas }: { ocultos: number; linhas: number[] }) {
  if (ocultos <= 0) return null;
  const plural = ocultos === 1 ? '' : 's';
  return (
    <div className="text-[10px] text-muted-foreground italic pb-1">
      {ocultos} oculto{plural}
      {linhas.length > 0 ? ` — já usado${plural} pelas linhas ${linhas.join(', ')}` : ' (já usado nesta sessão)'}.
    </div>
  );
}

// Linha densa comum de um candidato (data · distância · valor · conta · fornecedor · doc).
function CandidatoCorpo({ c }: { c: CandidatoProximo }) {
  return (
    <>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        <span className="font-mono">{fmtData(c.data_pagamento)}</span>
        <span className={`font-semibold px-1.5 rounded ${distCls(c.distancia_dias)}`} title="Distância em dias">
          {c.distancia_dias != null ? `${c.distancia_dias}d` : '—'}
        </span>
        <span className="font-mono tabular-nums font-semibold">{c.valor != null ? formatMoeda(c.valor) : '-'}</span>
        <span>{c.tipo_operacao ?? '-'}</span>
        <span className="text-muted-foreground font-mono" title={c.lanc_id}>{truncUuid(c.lanc_id)}</span>
      </div>
      <div className="text-[10px] flex flex-col gap-0.5">
        <span><span className="text-muted-foreground">Conta:</span> {c.conta_bancaria_nome ?? c.conta_destino_nome ?? '-'}</span>
        <span><span className="text-muted-foreground">Fornecedor:</span> {c.favorecido_nome ?? <span className="italic text-muted-foreground">∅ vazio</span>}</span>
        {c.documento && <span><span className="text-muted-foreground">Documento:</span> {c.documento}</span>}
      </div>
    </>
  );
}

export function EnriquecimentoCandidatosDrawer({
  stagingId, open, onOpenChange, contextoExcel, excelValor, statusLinha,
  onEscolher, onAgrupar, isResolvendo, isAgrupando, lancIdsUsados,
}: Props) {
  const ehProximos = statusLinha === 'candidatos_proximos';
  // Seção 1 (1:1) só faz sentido em 'candidatos_proximos' — não busca à toa.
  const prox = useClassificacaoCandidatosProximos(open && ehProximos ? stagingId : null);
  const grupo = useClassificacaoCandidatosGrupo(open ? stagingId : null);

  // Seleção PLURAL da SEÇÃO 2 (compor). Reset ao trocar de linha/fechar.
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  useEffect(() => { setSelecionados(new Set()); }, [stagingId, open]);
  const toggle = (lancId: string) => {
    setSelecionados((prev) => { const n = new Set(prev); n.has(lancId) ? n.delete(lancId) : n.add(lancId); return n; });
  };

  // Seção 1 — 1:1 (todos valor-igual, por definição da fn_proximos).
  const s1 = useMemo(() => partilharPorUso(prox.data, lancIdsUsados), [prox.data, lancIdsUsados]);

  // Seção 2 — compor: grupo FILTRADO aos parciais (valor < Excel; o valor-igual é 1:1).
  const parciais = useMemo(
    () => (grupo.data ?? []).filter((c) => abs(c.valor) < (excelValor ?? 0) - TOL),
    [grupo.data, excelValor],
  );
  const s2 = useMemo(() => partilharPorUso(parciais, lancIdsUsados), [parciais, lancIdsUsados]);

  const somaSel = useMemo(
    () => s2.visiveis.filter((c) => selecionados.has(c.lanc_id)).reduce((s, c) => s + abs(c.valor), 0),
    [s2.visiveis, selecionados],
  );
  const diff = somaSel - (excelValor ?? 0);
  const diffOk = Math.abs(diff) <= TOL;
  const n = selecionados.size;
  const podeAgrupar = n >= 2 && diffOk && !isAgrupando;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Candidatos — linha {contextoExcel?.linha ?? '-'}</SheetTitle>
          <SheetDescription className="text-[11px]">
            Duas formas de resolver: <strong>Match 1:1</strong> (um lançamento de valor igual) ou{' '}
            <strong>Compor por soma</strong> (vários que somem o valor do Excel). O sistema nunca decide sozinho.
          </SheetDescription>
        </SheetHeader>

        {contextoExcel && (
          <div className="mt-4 p-3 rounded-md bg-muted/50 border space-y-1 text-[11px]">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-1">Contexto Excel</div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Data:</span><span className="font-mono">{fmtData(contextoExcel.data)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Valor:</span><span className="font-mono tabular-nums font-semibold">{contextoExcel.valor != null ? formatMoeda(contextoExcel.valor) : '-'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tipo:</span><span>{contextoExcel.tipo_operacao ?? '-'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Fornecedor Excel:</span><span className="truncate text-right max-w-[260px]" title={contextoExcel.fornecedor ?? ''}>{contextoExcel.fornecedor ?? '-'}</span></div>
          </div>
        )}

        {/* ── SEÇÃO 1 — MATCH 1:1 (só em 'candidatos_proximos') ── */}
        {ehProximos && (
          <div className="mt-4">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 mb-2">
              Match 1:1 · valor igual ao Excel
            </div>
            {prox.isLoading && <div className="text-[11px] text-muted-foreground py-2 text-center">Carregando…</div>}
            {prox.error && <div className="text-[11px] text-red-700 py-2">Erro ao buscar candidatos 1:1.</div>}
            {!prox.isLoading && !prox.error && (prox.data?.length ?? 0) === 0 && (
              <div className="text-[11px] text-muted-foreground py-2 px-2 rounded-md bg-muted/40 border">Nenhum candidato de valor igual na janela.</div>
            )}
            <OcultosNota ocultos={s1.ocultos} linhas={s1.linhas} />
            <div className="space-y-2">
              {s1.visiveis.map((c) => {
                const valorIgual = Math.abs(abs(c.valor) - (excelValor ?? 0)) <= TOL;
                return (
                  <div key={c.lanc_id} className={`p-3 border rounded-md space-y-1 text-[11px] ${valorIgual ? 'border-emerald-400 bg-emerald-50/40' : 'bg-card'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium truncate flex-1 min-w-0" title={c.descricao ?? ''}>{c.descricao ?? '(sem descrição)'}</div>
                      {valorIgual && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">Valor igual</span>}
                    </div>
                    <CandidatoCorpo c={c} />
                    <Button size="sm" className="h-6 text-[11px] mt-1" disabled={isResolvendo} onClick={() => onEscolher(c.lanc_id)}>
                      {isResolvendo ? 'Escolhendo…' : 'Escolher candidato'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SEÇÃO 2 — COMPOR POR SOMA (parciais) ── */}
        <div className="mt-5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Compor por soma · vários lançamentos parciais que somam o Excel
          </div>
          {grupo.isLoading && <div className="text-[11px] text-muted-foreground py-2 text-center">Carregando…</div>}
          {grupo.error && <div className="text-[11px] text-red-700 py-2">Erro ao buscar candidatos de composição.</div>}
          {!grupo.isLoading && !grupo.error && parciais.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-2 px-2 rounded-md bg-muted/40 border">Nenhum lançamento parcial para compor a soma.</div>
          )}
          <OcultosNota ocultos={s2.ocultos} linhas={s2.linhas} />
          <div className="space-y-2">
            {s2.visiveis.map((c) => {
              const marcado = selecionados.has(c.lanc_id);
              return (
                <div key={c.lanc_id} className={`p-3 border rounded-md space-y-1 text-[11px] cursor-pointer transition-colors ${marcado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-accent/40'}`} onClick={() => toggle(c.lanc_id)}>
                  <div className="flex items-start gap-2">
                    <Checkbox checked={marcado} onCheckedChange={() => toggle(c.lanc_id)} className="mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate" title={c.descricao ?? ''}>{c.descricao ?? '(sem descrição)'}</div>
                        <span className="text-[9px] text-muted-foreground shrink-0">compõe soma</span>
                      </div>
                      <CandidatoCorpo c={c} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col sm:space-x-0">
          {n >= 1 && (
            <div className="w-full rounded-md border px-2 py-1 text-[11px] flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{n} selecionado{n === 1 ? '' : 's'} · soma</span>
              <span className="font-mono tabular-nums font-semibold">{formatMoeda(somaSel)}</span>
              <span className={`font-mono tabular-nums ${diffOk ? 'text-emerald-700' : 'text-rose-700'}`}>dif {diff >= 0 ? '+' : ''}{formatMoeda(diff)}</span>
            </div>
          )}
          <Button size="sm" className="w-full" disabled={!podeAgrupar} onClick={() => { if (n >= 2) onAgrupar([...selecionados]); }}>
            {isAgrupando ? 'Agrupando…' : `Agrupar selecionados${n >= 2 ? ` (${n})` : ''}`}
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
