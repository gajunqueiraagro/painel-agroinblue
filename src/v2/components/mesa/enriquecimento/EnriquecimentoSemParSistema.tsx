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
import { temCandidatoDuplicata, precisaDeVoce } from '@/v2/lib/mesa/enriquecimentoView';
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
  /* 133h-b item 6 — os dois blocos: o que pede trabalho e o que já está explicado. */
  const { pedem, explicados } = useMemo(() => {
    const pedem: LancamentoNaoExplicado[] = [];
    const explicados: LancamentoNaoExplicado[] = [];
    for (const l of linhas) (precisaDeVoce(l, linhas) ? pedem : explicados).push(l);
    return { pedem, explicados };
  }, [linhas]);
  const [verExplicados, setVerExplicados] = useState(false);

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

  /**
   * Uma linha da lista — 133h-b item 6.
   *
   * ⚠ O MESMO DESENHO NOS DOIS BLOCOS, e só as AÇÕES mudam: "já explicado" não ganha botão
   * nenhum. Dois desenhos diferentes fariam o operador achar que são duas coisas.
   */
  function linhaDe(l: LancamentoNaoExplicado, comAcoes: boolean) {
    return (
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
              {/* ⚠ SEM AÇÃO NO BLOCO "JÁ EXPLICADOS" — 133h-b item 6: aqueles lançamentos
                  estão ali para o operador ver que a conta fecha, não para ele mexer. */}
              <span className="flex shrink-0 items-center gap-1">
                {comAcoes && onAbrirNoFinanceiro && (
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                    onClick={onAbrirNoFinanceiro}>
                    Abrir no Financeiro
                  </Button>
                )}
                {comAcoes && comCandidato.has(l.lanc_id) && (
                  <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px]"
                    disabled={gravando}
                    title="Há outro lançamento de mesmo valor e conta a até 5 dias daqui."
                    onClick={() => { setCancelandoId(cancelandoId === l.lanc_id ? null : l.lanc_id); setMotivo(''); }}>
                    Cancelar como duplicado
                  </Button>
                )}
              </span>
            </div>

            {comAcoes && cancelandoId === l.lanc_id && (
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
    );
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
        /* ⚠ UM SCROLLPORT SÓ, e é este — A21. */
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ═══ PRECISAM DE VOCÊ ═══════════════════════════════════════════════
              ⚠ 133h-b item 6 — A LISTA MISTURAVA DUAS COISAS. Dos 201 órfãos de um mês
              medido, 40 pediam trabalho; os outros 161 eram transferência, estorno, fatura
              e já classificados — que a planilha não explica POR DESIGN. Todos com a mesma
              cara e o mesmo botão, a lista parecia 201 problemas. */}
          <div className="flex items-baseline justify-between bg-muted px-2 py-0.5">
            <span className="text-[10px] font-medium">Precisam de você</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{pedem.length}</span>
          </div>
          {pedem.length === 0 ? (
            <p className="px-3 py-3 text-center text-[10px] text-muted-foreground">
              Nenhum lançamento do mês pede trabalho aqui.
            </p>
          ) : pedem.map((l) => linhaDe(l, true))}

          {/* ═══ JÁ EXPLICADOS ══════════════════════════════════════════════════
              ⚠ COLAPSADO E SEM AÇÃO: eles estão aqui para o operador saber que a conta
              fecha, não para ele fazer alguma coisa. Um botão de cancelar ao lado de 161
              linhas normais é um convite a usá-lo como faxina. */}
          {explicados.length > 0 && (
            <>
              <button type="button" onClick={() => setVerExplicados((v) => !v)}
                className="flex w-full items-baseline justify-between bg-muted px-2 py-0.5 text-left hover:bg-muted/70">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Já explicados · <span className="tabular-nums">{explicados.length}</span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {verExplicados ? 'ocultar' : 'mostrar'}
                </span>
              </button>
              {verExplicados && explicados.map((l) => linhaDe(l, false))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
