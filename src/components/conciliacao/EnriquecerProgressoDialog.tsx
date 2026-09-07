/**
 * O progresso da gravação do Enriquecer — [ENRIQUECER-PROGRESSO-01] (131).
 *
 * ⚠ SUBSTITUI UMA FILA DE TOASTS. Confirmar 492 linhas disparava um "Lançamento
 * atualizado" por linha, empilhados por minutos: o operador não via o que estava sendo
 * gravado, nem quanto faltava, nem o que foi recusado — e o resultado saía num parágrafo
 * abaixo do botão, depois que tudo acabara.
 *
 * ⚠ O ESTADO NÃO MORA AQUI. Ele vive no hook, que vive na tela: fechar este diálogo não
 * cancela nada, e reabrir mostra o ponto atual. Sair da Conciliação, sim, interrompe — e é
 * o que o rodapé diz, em vez de deixar o operador descobrir.
 *
 * ⚠ NENHUM TOAST DURANTE O LOTE. Um só no fim, e apenas se o modal estiver fechado: com
 * ele aberto o número já está na tela, e o toast seria a segunda voz dizendo o mesmo.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, AlertTriangle, X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { baixarCsv, csvCampo } from '@/lib/csv';
import type { ProgressoImportacao, ResultadoImportacao } from '@/v2/hooks/useImportLancamentosExcel';

const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function EnriquecerProgressoDialog({
  open, onOpenChange, progresso, resultado, gravando, onParar, onVerNoFinanceiro,
  arquivo, aba, linhasLidas, mes, ano, cliente,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  progresso: ProgressoImportacao;
  resultado: ResultadoImportacao | null;
  gravando: boolean;
  onParar: () => void;
  /** `undefined` esconde o botão — não há destino a prometer. */
  onVerNoFinanceiro?: () => void;
  arquivo: string | null;
  aba: string | null;
  linhasLidas: number;
  mes: number | null;
  ano: number | null;
  cliente: string;
}) {
  const terminou = !gravando && progresso.terminadoEm != null;
  const { total, feitas, atualizados, criados, semPar, recusados } = progresso;

  /* O tempo só corre enquanto grava; terminado, congela no que levou. */
  const segundos = useMemo(() => {
    if (!progresso.iniciadoEm) return 0;
    const fim = progresso.terminadoEm ?? Date.now();
    return Math.max(0, Math.round((fim - progresso.iniciadoEm) / 1000));
  }, [progresso.iniciadoEm, progresso.terminadoEm, feitas]);

  /* ⚠ OS ÚLTIMOS NOVE, novos embaixo — o feed inteiro fica no hook porque o CSV precisa
     dos recusados que já rolaram para fora da vista. */
  const visiveis = progresso.feed.slice(-9);
  const fimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [visiveis.length]);

  const baixar = () => {
    const linhas = ['linha,data,valor,descricao,motivo'];
    for (const e of progresso.feed) {
      if (e.tipo === 'ok') continue;
      linhas.push([e.linha, csvCampo(dataBr(e.data)), csvCampo(formatMoeda(e.valor)),
        csvCampo(e.titulo), csvCampo(e.contexto)].join(','));
    }
    baixarCsv('enriquecer_sem_par_e_recusados', linhas);
  };

  const titulo = terminou
    ? `${mes ? MESES[mes - 1] : '—'}/${ano ?? '—'} enriquecido — ${cliente}`
    : `Enriquecendo ${mes ? MESES[mes - 1] : '—'}/${ano ?? '—'} — ${cliente}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[760px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0.5 bg-primary px-4 py-2.5">
          <DialogTitle className="text-[14px] font-semibold text-primary-foreground">{titulo}</DialogTitle>
          <p className="truncate text-[11px] text-primary-foreground/85">
            {arquivo ?? '—'} · {linhasLidas} linhas lidas{aba ? ` · aba ${aba}` : ''}
          </p>
        </DialogHeader>

        {/* ═══ TOPO ══════════════════════════════════════════════════════════════ */}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-2 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-muted-foreground">Gravados</div>
            <div className="text-[20px] font-medium leading-tight tabular-nums">
              {atualizados + criados} <span className="text-[12px] text-muted-foreground">de {total}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Sem par no sistema</div>
            <div className="text-[20px] font-medium leading-tight tabular-nums text-amber-700 dark:text-amber-300">{semPar}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Recusados</div>
            <div className={`text-[20px] font-medium leading-tight tabular-nums ${recusados > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {recusados}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Tempo</div>
            <div className="text-[20px] font-medium leading-tight tabular-nums">{segundos}s</div>
          </div>
        </div>

        {/* Barra: 4px, largura = feitas/total. Sem total, fica vazia — não cheia. */}
        <div className="h-1 shrink-0 bg-muted">
          <div className="h-1 bg-primary transition-all"
            style={{ width: total > 0 ? `${Math.min(100, (feitas / total) * 100)}%` : '0%' }} />
        </div>

        <div className="flex shrink-0 items-baseline justify-between gap-2 px-4 py-1 text-[11px]">
          <span className="min-w-0 truncate text-muted-foreground">
            {progresso.agora ? `Agora: ${progresso.agora}` : terminou ? 'Concluído.' : '—'}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">linha {feitas} de {total}</span>
        </div>

        {/* ═══ FEED ══════════════════════════════════════════════════════════════ */}
        <div className="relative min-h-0 flex-1 overflow-y-auto border-t">
          {/* O gradiente que faz os antigos "sumirem por cima" — decoração, e por isso
              `pointer-events-none`: ele não pode roubar o clique da primeira linha. */}
          <div className="pointer-events-none sticky top-0 z-[2] -mb-[34px] h-[34px] bg-gradient-to-b from-background to-transparent" />
          {visiveis.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
              {gravando ? 'Começando…' : 'Nada gravado ainda.'}
            </p>
          ) : visiveis.map((e, i) => (
            <div key={`${e.linha}-${i}`} className="flex items-center gap-2 border-b border-border/50 px-4 py-[7px]">
              <span className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full ${
                e.tipo === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : e.tipo === 'sem_par' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                {e.tipo === 'ok' ? <Check className="h-2.5 w-2.5" />
                  : e.tipo === 'sem_par' ? <AlertTriangle className="h-2.5 w-2.5" />
                  : <X className="h-2.5 w-2.5" />}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{dataBr(e.data)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium" title={e.titulo}>{e.titulo}</span>
                <span className={`block truncate text-[10px] ${
                  e.tipo === 'sem_par' ? 'text-amber-700 dark:text-amber-300'
                  : e.tipo === 'recusado' ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'}`} title={e.contexto}>
                  {e.contexto || '—'}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-medium tabular-nums">{formatMoeda(e.valor)}</span>
            </div>
          ))}
          <div ref={fimRef} />
        </div>

        {/* ═══ RODAPÉ ════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 border-t px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {!terminou && (
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onParar}>
                Parar
              </Button>
            )}
            {onVerNoFinanceiro && (
              <Button type="button" size="sm" disabled={!terminou}
                className="h-7 bg-[#f3c84a] text-[11px] font-medium text-foreground hover:bg-[#e8bd3e]"
                onClick={onVerNoFinanceiro}>
                Ver no Financeiro
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]"
              disabled={!terminou || progresso.feed.every(e => e.tipo === 'ok')}
              title={progresso.feed.every(e => e.tipo === 'ok') ? 'Nada sem par nem recusado.' : 'CSV com linha, data, valor, descrição e motivo'}
              onClick={baixar}>
              Baixar sem par e recusados
            </Button>
            <div className="flex-1" />
            {terminou ? (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                {atualizados} atualizados · {semPar} sem par · {recusados} recusados · {segundos}s
                {progresso.interrompido && ` · interrompido em ${feitas} de ${total}`}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Pode fechar esta janela; a gravação continua enquanto você estiver na Conciliação.
              </span>
            )}
          </div>
          {terminou && resultado && (resultado.apelidos.subcentro + resultado.apelidos.fornecedor + resultado.apelidos.conta) > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Apelidos memorizados: {resultado.apelidos.subcentro} de conta contábil ·{' '}
              {resultado.apelidos.fornecedor} de fornecedor · {resultado.apelidos.conta} de conta bancária.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
