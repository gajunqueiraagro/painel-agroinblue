/**
 * Sem par no sistema — [ENRIQUECER-GRAVAR-01] (133c item 4). DUMB.
 *
 * ⚠ É A VISÃO INVERSA: lançamentos vivos do mês que NENHUMA linha da planilha referencia.
 * O resto da Mesa pergunta "esta linha é qual lançamento?"; aqui a pergunta é "este
 * lançamento, de onde veio?" — e a resposta costuma ser duplicata de importação.
 *
 * ⚠ SEM TETO DE CONTAGEM. O chip antigo mostrava "1000", que era o limite da consulta e não
 * um número; o operador lia mil órfãos onde havia uma query truncada. `fn_classificacao_
 * sistema_nao_explicado` devolve a lista inteira, e é ela que a tela conta.
 *
 * ⚠ NADA DE LOTE AQUI, e é decisão: cancelar em massa o que a planilha não explica apagaria,
 * na primeira vez que a planilha viesse incompleta, o mês inteiro. Uma linha por vez, com
 * motivo escrito.
 *
 * ⚠ E O BOTÃO SÓ EXISTE ONDE HÁ O QUE DUPLICAR — 133h item 5. "Cancelar como duplicado"
 * estava em TODA linha, e a lista é justamente a das sobras: oferecer o cancelamento como
 * ação padrão de uma lista de sobras convida a usá-lo como faxina. Agora ele aparece quando
 * a tela consegue APONTAR o par (mesmo valor, mesma conta, ±5 dias — `temCandidatoDuplicata`);
 * onde não há par, sobra "Abrir no Financeiro", que é olhar antes de decidir.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtBRL, fmtData } from './fmt';
import { temCandidatoDuplicata } from '@/v2/lib/mesa/enriquecimentoView';
import type { LancamentoNaoExplicado } from '@/v2/hooks/useSistemaNaoExplicado';

export interface EnriquecimentoSemParSistemaProps {
  linhas: readonly LancamentoNaoExplicado[];
  carregando?: boolean;
  /** Cancela com motivo. Quem grava é o `excluirLancamento` do hook oficial. */
  onCancelar: (lancId: string, motivo: string) => Promise<boolean>;
  /** `undefined` esconde o botão — a tela não promete navegação que ninguém sabe fazer. */
  onAbrirNoFinanceiro?: () => void;
}

export function EnriquecimentoSemParSistema({
  linhas, carregando, onCancelar, onAbrirNoFinanceiro,
}: EnriquecimentoSemParSistemaProps) {
  /* O id em cancelamento e o motivo digitado. Um por vez: cancelar é irreversível pela
     tela, e um formulário aberto por linha convidaria a confirmar o errado. */
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  /* ⚠ O CONJUNTO É CALCULADO UMA VEZ, não por linha: são N² comparações, e refazê-las a
     cada render de cada linha é o que transforma 200 órfãos em uma tela travada. */
  const comCandidato = useMemo(
    () => new Set(linhas.filter((l) => temCandidatoDuplicata(l, linhas)).map((l) => l.lanc_id)),
    [linhas]);

  async function confirmar(lancId: string) {
    const m = motivo.trim();
    if (!m) return;
    setGravando(true);
    try {
      const ok = await onCancelar(lancId, m);
      if (ok) { setCancelandoId(null); setMotivo(''); }
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card md:flex-1">
      <div className="flex shrink-0 items-baseline justify-between border-b bg-card px-2 py-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Lançamentos do mês sem linha na planilha
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{linhas.length}</span>
      </div>

      {carregando ? (
        <p className="py-6 text-center text-[11px] text-muted-foreground">Procurando…</p>
      ) : linhas.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          Todo lançamento do mês tem uma linha na planilha. Nada a conferir aqui.
        </p>
      ) : (
        /* ⚠ UM SCROLLPORT SÓ, e é este — A21. */
        <div className="min-h-0 flex-1 overflow-y-auto">
          {linhas.map((l) => (
            <div key={l.lanc_id} className="border-b border-border/50 px-3 py-1">
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: '76px minmax(0,1fr) 110px auto' }}>
                <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                  {fmtData(l.data_pagamento)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium leading-[1.3]"
                    title={l.descricao ?? ''}>
                    {l.descricao || l.favorecido_nome || '—'}
                  </span>
                  {/* ⚠ O SUBCENTRO É O QUE SEPARA "sobra explicável" DE "sobra a resolver"
                      — 133c-a. Dos 201 do mês medido, 40 estão sem; são esses que pedem
                      trabalho. "sem subcentro" é ausência declarada, não um traço mudo. */}
                  <span className="block truncate text-[10px] leading-[1.3] text-muted-foreground"
                    title={`${l.conta_nome ?? '—'} · doc ${l.documento ?? '—'} · ${l.subcentro ?? 'sem subcentro'}`}>
                    {l.conta_nome ?? '—'} · doc {l.documento || '—'} ·{' '}
                    <span className={l.subcentro ? '' : 'text-amber-700 dark:text-amber-400'}>
                      {l.subcentro || 'sem subcentro'}
                    </span>
                  </span>
                </span>
                <span className="text-right text-[11px] font-medium tabular-nums">{fmtBRL(l.valor)}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {onAbrirNoFinanceiro && (
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                      onClick={onAbrirNoFinanceiro}>
                      Abrir no Financeiro
                    </Button>
                  )}
                  {comCandidato.has(l.lanc_id) && (
                    <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px]"
                      disabled={gravando}
                      title="Há outro lançamento de mesmo valor e conta a até 5 dias daqui."
                      onClick={() => { setCancelandoId(cancelandoId === l.lanc_id ? null : l.lanc_id); setMotivo(''); }}>
                      Cancelar como duplicado
                    </Button>
                  )}
                </span>
              </div>

              {cancelandoId === l.lanc_id && (
                /* ⚠ MOTIVO OBRIGATÓRIO, e o botão diz isso enquanto estiver vazio. Cancelar
                   sem motivo é apagar dinheiro do mês sem deixar rastro de por quê — e
                   `cancelado_motivo` é o que o próximo a olhar vai ler. */
                <div className="mt-1 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/20">
                  <span className="shrink-0 text-[10px] text-amber-900 dark:text-amber-200">Motivo:</span>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="ex.: duplicata da importação de 12/08"
                    className="h-6 flex-1 text-[11px]"
                    onKeyDown={(e) => { if (e.key === 'Enter') void confirmar(l.lanc_id); }} />
                  <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
                    disabled={!motivo.trim() || gravando}
                    title={!motivo.trim() ? 'Escreva o motivo para habilitar.' : undefined}
                    onClick={() => { void confirmar(l.lanc_id); }}>
                    {gravando ? 'Cancelando…' : 'Confirmar'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]"
                    onClick={() => { setCancelandoId(null); setMotivo(''); }}>
                    Não
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
