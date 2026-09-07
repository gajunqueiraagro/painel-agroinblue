/**
 * A prévia da conciliação do mês — [CONCIL-MES-01] (envelope 130), mock A.
 *
 * ⚠ VER ANTES DE GRAVAR. O botão que este diálogo substitui criava um lançamento cru para
 * cada movimento do extrato, sem prévia: na Sicredi Pessoal do NJ em ago/2026 seriam 107
 * crus por cima de 31 lançamentos que já existiam sem vínculo — 31 duplicatas. Aqui o
 * operador vê o que entra cru, o que o banco substitui, o que sobra sem par e se o saldo
 * fecha, e só então confirma.
 *
 * ⚠ A CONTA DA PRÉVIA É A DA RPC, sempre. Nada aqui recalcula totais nem decide o que
 * substitui: `fn_extrato_conciliar_mes` percorre o mesmo caminho em simulação e em
 * gravação. Uma segunda conta no front divergiria da primeira mudança da regra.
 *
 * ⚠ A21 — CABEÇALHO, TOPO, ABAS E RESUMO FIXOS; SÓ A LISTA ROLA. A cadeia é
 * `h-[92vh]` → `flex-col` → `flex-1 min-h-0` → `overflow-y-auto` num scrollport só.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useConciliarMes, type PreviaConciliarMes } from '@/hooks/useConciliarMes';

type Aba = 'crus' | 'substituidos' | 'sem_par' | 'ja';

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ⚠ SINAL E COR DE UMA FONTE SÓ — a mesma decisão da Mesa (129d): duas funções para a
   mesma pergunta divergem no dia em que alguém troca uma delas. */
const corValor = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400');
const comSinal = (v: number) => `${v < 0 ? '−' : '+'}${formatMoeda(Math.abs(v))}`;

/** Par rótulo-valor do resumo lateral — idioma do A17. */
function LinhaResumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={`truncate text-right font-medium tabular-nums ${cor ?? ''}`}>{valor}</span>
    </div>
  );
}

export function ConciliarMesDialog({
  open, onOpenChange, clienteId, contaId, contaNome, ano, mes,
  arquivosOfx, saldoSistemaHoje, aoConcluir,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  ano: number;
  mes: number;
  /** Quantos OFX desta conta — vem de `useImportacoesDaConta`, não é recontado aqui. */
  arquivosOfx: number;
  /**
   * O "Saldo no sistema" que o card já mostra, passado por prop.
   * ⚠ NÃO RECALCULAR — 130. O card tem a sua conta (posição contra posição, FIN-SALDO-
   * POSICAO-01); refazê-la aqui daria dois números para a mesma pergunta na mesma tela.
   */
  saldoSistemaHoje: number | null;
  aoConcluir: () => void | Promise<void>;
}) {
  const api = useConciliarMes();
  const [previa, setPrevia] = useState<PreviaConciliarMes | null>(null);
  const [aba, setAba] = useState<Aba>('crus');
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  useEffect(() => {
    if (!open || !clienteId || !contaId) return;
    let vivo = true;
    void api.simular(clienteId, contaId, anoMes).then(p => { if (vivo) setPrevia(p); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `api` muda a cada render; a chave é (open, conta, mês)
  }, [open, clienteId, contaId, anoMes]);

  const nCrus = previa?.crus.length ?? 0;
  const nSubs = previa?.substituidos.length ?? 0;
  const nSemPar = previa?.semPar.length ?? 0;
  const nadaAFazer = !!previa && nCrus === 0 && nSubs === 0;

  /* A diferença do saldo do sistema contra o extrato — o número que explica por que o mês
     não fecha hoje. `null` quando falta um dos dois: "não sei" não vira zero. */
  const difSistema = useMemo(() => {
    const dig = previa?.saldo.finalDigitado;
    if (saldoSistemaHoje == null || dig == null) return null;
    return saldoSistemaHoje - dig;
  }, [saldoSistemaHoje, previa]);

  const confirmar = async () => {
    if (!clienteId || !contaId) return;
    const r = await api.gravar(clienteId, contaId, anoMes);
    if (!r) { toast.error(api.erro ?? 'Falha ao conciliar o mês.'); return; }
    toast.success(
      `${r.crus.length} criado${r.crus.length === 1 ? '' : 's'} · ${r.substituidos.length} substituído${r.substituidos.length === 1 ? '' : 's'} · ${r.semPar.length} sem par no banco`);
    await aoConcluir();
    onOpenChange(false);
  };

  /** Agrupa por dia, como o mock pede — a faixa é sticky dentro do scrollport. */
  const porDia = <T,>(itens: T[], data: (t: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const i of itens) {
      const k = (data(i) ?? '').slice(0, 10);
      const atual = m.get(k); if (atual) atual.push(i); else m.set(k, [i]);
    }
    return [...m];
  };

  const rotuloBotao = nCrus > 0
    ? `Criar ${nCrus} lançamento${nCrus === 1 ? '' : 's'} cru${nCrus === 1 ? '' : 's'} e conciliar`
    : `Conciliar ${nSubs} lançamento${nSubs === 1 ? '' : 's'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0.5 bg-primary px-4 py-2.5">
          <DialogTitle className="text-[14px] font-semibold text-primary-foreground">
            Conciliar {MESES[mes - 1]}/{ano} — {contaNome || 'conta'}
          </DialogTitle>
          <p className="text-[11px] text-primary-foreground/85">
            {arquivosOfx} arquivo{arquivosOfx === 1 ? '' : 's'} OFX · {previa?.movimentosExtrato ?? '—'} movimentos
          </p>
        </DialogHeader>

        {api.simulando && !previa ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o mês no banco…
          </div>
        ) : !previa ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-destructive">
            {api.erro ?? 'Não foi possível ler o mês.'}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 md:[grid-template-columns:1fr_300px]">
            <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
              {/* ═══ TOPO: os quatro números ═══════════════════════════════════ */}
              <div className="grid shrink-0 grid-cols-2 gap-2 border-b bg-muted/40 px-3 py-2 sm:grid-cols-4">
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo final no extrato</div>
                  <div className="text-[20px] font-medium leading-tight tabular-nums">
                    {previa.saldo.finalDigitado == null ? '—' : formatMoeda(previa.saldo.finalDigitado)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo do sistema hoje</div>
                  <div className="text-[20px] font-medium leading-tight tabular-nums">
                    {saldoSistemaHoje == null ? '—' : formatMoeda(saldoSistemaHoje)}
                  </div>
                  {difSistema != null && Math.abs(difSistema) > 0.01 && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
                      {comSinal(difSistema)} contra o extrato
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo após conciliar</div>
                  <div className="text-[20px] font-medium leading-tight tabular-nums">
                    {previa.saldo.finalCalculado == null ? '—' : formatMoeda(previa.saldo.finalCalculado)}
                  </div>
                  {/* ⚠ TRÊS ESTADOS, NÃO DOIS — a sentinela da casa: `null` é "não sei",
                      e não pode virar "não confere". */}
                  {previa.saldo.confere === true && (
                    <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">confere</div>
                  )}
                  {previa.saldo.confere === false && previa.saldo.finalDigitado != null && previa.saldo.finalCalculado != null && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
                      {comSinal(previa.saldo.finalCalculado - previa.saldo.finalDigitado)}
                    </div>
                  )}
                  {previa.saldo.confere == null && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">sem saldo do mês</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Movimentos do banco</div>
                  <div className="text-[20px] font-medium leading-tight tabular-nums">{previa.movimentosExtrato}</div>
                  <div className="text-[11px] text-muted-foreground">{previa.jaConciliados} já conciliados</div>
                </div>
              </div>

              {/* ═══ ABAS ══════════════════════════════════════════════════════ */}
              <div className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-1.5">
                {([
                  ['crus', `Entram crus do banco ${nCrus}`],
                  ['substituidos', `O banco substitui do sistema ${nSubs}`],
                  ['sem_par', `Ficam no sistema sem par no banco ${nSemPar}`],
                  ['ja', `Já conciliados ${previa.jaConciliados}`],
                ] as const).map(([id, rot]) => (
                  <button type="button" key={id} onClick={() => setAba(id)}
                    className={`rounded-full border px-2 py-px text-[10px] ${
                      aba === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                    {rot}
                  </button>
                ))}
              </div>

              {/* ═══ A LISTA — o único scrollport ══════════════════════════════ */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {aba === 'ja' ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    {previa.jaConciliados} movimento{previa.jaConciliados === 1 ? '' : 's'} já
                    {previa.jaConciliados === 1 ? ' tinha' : ' tinham'} vínculo e não {previa.jaConciliados === 1 ? 'é tocado' : 'são tocados'}.
                  </p>
                ) : aba === 'crus' ? (
                  porDia(previa.crus, c => c.dataBanco).map(([dia, itens]) => (
                    <div key={dia}>
                      <div className="sticky top-0 z-[2] border-b bg-muted px-3 py-1 text-[10px] font-medium">{dataBr(dia)}</div>
                      {itens.map(c => (
                        <div key={c.extratoId} className="flex items-center gap-2 border-b border-border/60 px-3 py-[7px]">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium" title={c.historicoBanco ?? undefined}>
                              {c.historicoBanco ?? '—'}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {contaNome}{c.documentoBanco ? ` · doc ${c.documentoBanco}` : ''}
                              {' · '}
                              <span className="text-amber-700 dark:text-amber-300">
                                {c.ambiguo ? '2 candidatos no sistema, entrou cru' : 'sem subcentro, sem fornecedor'}
                              </span>
                            </div>
                          </div>
                          <div className={`shrink-0 text-[12px] font-medium tabular-nums ${corValor(c.valorBanco)}`}>
                            {comSinal(c.valorBanco)}
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">cru</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : aba === 'substituidos' ? (
                  porDia(previa.substituidos, s => s.dataBanco).map(([dia, itens]) => (
                    <div key={dia}>
                      <div className="sticky top-0 z-[2] border-b bg-muted px-3 py-1 text-[10px] font-medium">{dataBr(dia)}</div>
                      {itens.map(s => (
                        <div key={s.extratoId} className="flex items-center gap-2 border-b border-border/60 px-3 py-[7px]">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium" title={s.historicoBanco ?? undefined}>
                              {s.historicoBanco ?? '—'}
                            </div>
                            {/* ⚠ SÓ O QUE MUDA. Repetir o que ficou igual faria o operador
                                caçar a diferença no meio do que não mudou. */}
                            <div className="truncate text-[10px] text-muted-foreground">
                              {s.descricao ?? '—'}
                              {' · previsto '}{dataBr(s.antes.dataPagamento ?? s.antes.dataVencimento)}
                              {s.antes.valor != null ? ` ${formatMoeda(s.antes.valor)}` : ''}
                              {', o banco pagou '}{dataBr(s.dataBanco)}
                            </div>
                          </div>
                          <div className={`shrink-0 text-[12px] font-medium tabular-nums ${corValor(s.valorBanco)}`}>
                            {comSinal(s.valorBanco)}
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">substituído</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  porDia(previa.semPar, s => s.data).map(([dia, itens]) => (
                    <div key={dia}>
                      <div className="sticky top-0 z-[2] border-b bg-muted px-3 py-1 text-[10px] font-medium">{dataBr(dia)}</div>
                      {itens.map(s => (
                        <div key={s.lancamentoId} className="flex items-center gap-2 border-b border-border/60 px-3 py-[7px]">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium" title={s.descricao ?? undefined}>
                              {s.descricao ?? '—'}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {contaNome}{s.subcentro ? ` · ${s.subcentro}` : ''}{s.statusTransacao ? ` · ${s.statusTransacao}` : ''}
                            </div>
                          </div>
                          <div className={`shrink-0 text-[12px] font-medium tabular-nums ${corValor(s.valor)}`}>
                            {comSinal(s.valor)}
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">sem par</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ═══ RESUMO LATERAL ═══════════════════════════════════════════════ */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
              <div className="rounded-lg border bg-card text-[11px]">
                <div className="border-b bg-accent/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                  O que vai acontecer
                </div>
                <div className="space-y-1 px-3 py-2">
                  <LinhaResumo rotulo={`Entram crus (${nCrus})`} valor={comSinal(previa.crusTotal)} cor={corValor(previa.crusTotal)} />
                  <LinhaResumo rotulo={`Substituídos (${nSubs})`} valor={comSinal(previa.substituidosTotal)} cor={corValor(previa.substituidosTotal)} />
                  <LinhaResumo rotulo={`Sem par (${nSemPar})`} valor={comSinal(previa.semParTotal)} cor={corValor(previa.semParTotal)} />
                  <LinhaResumo rotulo={`Já conciliados (${previa.jaConciliados})`} valor="—" />
                </div>
              </div>

              <div className="rounded-lg border bg-card text-[11px]">
                <div className="border-b bg-accent/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">Saldo</div>
                <div className="space-y-1 px-3 py-2">
                  <LinhaResumo rotulo="Inicial" valor={previa.saldo.inicial == null ? '—' : formatMoeda(previa.saldo.inicial)} />
                  <LinhaResumo rotulo="Movimentos do banco"
                    valor={previa.saldo.movimentosExtrato == null ? '—' : comSinal(previa.saldo.movimentosExtrato)} />
                  <LinhaResumo rotulo="Final calculado" valor={previa.saldo.finalCalculado == null ? '—' : formatMoeda(previa.saldo.finalCalculado)} />
                  <LinhaResumo rotulo="Final digitado" valor={previa.saldo.finalDigitado == null ? '—' : formatMoeda(previa.saldo.finalDigitado)}
                    cor={previa.saldo.confere === true ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                {nadaAFazer ? (
                  'Nada a fazer: todos os movimentos já têm vínculo.'
                ) : (
                  <>
                    O banco é a verdade. Serão criados <b className="text-foreground">{nCrus}</b> lançamentos
                    crus, iguais ao extrato: data, valor e histórico do banco, sem subcentro e sem
                    fornecedor. <b className="text-foreground">{nSubs}</b> lançamentos que já existiam
                    recebem data e valor do banco. Nada é apagado.
                    {/* ⚠ A FRASE DO "PODE SER DESFEITO" NÃO ENTRA AINDA — 130 item 5. O
                        desfazer por arquivo NÃO alcança os crus hoje; prometer isso seria a
                        tela afirmando um caminho que não existe. */}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t px-3">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]"
            onClick={() => onOpenChange(false)}>
            Fechar sem alterar
          </Button>
          {previa && !nadaAFazer && (
            <Button type="button" size="sm"
              className="h-7 bg-[#f3c84a] text-[11px] font-medium text-foreground hover:bg-[#e8bd3e]"
              disabled={api.gravando}
              onClick={() => { void confirmar(); }}>
              {api.gravando ? 'Conciliando…' : rotuloBotao}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
