/**
 * A prévia da conciliação do mês — [CONCIL-MES-01] (envelope 130), mock A.
 *
 * ⚠ VER ANTES DE GRAVAR. O botão que este diálogo substitui criava um lançamento cru para
 * cada movimento do extrato, sem prévia: na Sicredi Pessoal do NJ em ago/2026 seriam 107
 * crus por cima de 31 lançamentos que já existiam sem vínculo — 31 duplicatas. Aqui o
 * operador vê o que entra, o que fica para os outros passos e se o saldo fecha, e só
 * então confirma.
 *
 * ⚠ E ELE FAZ UMA COISA SÓ, DESDE PR-CONCILIACAO-CRUS-01: CRIAR LANÇAMENTO A PARTIR DO BANCO,
 * e apenas para os movimentos que o operador MARCAR. Antes o mesmo clique também casava
 * sozinho o movimento de candidato único (com régua de ±5 dias) e criava cru por cima dos
 * ambíguos. Eram três decisões num botão, duas delas irreversíveis na prática — desfazer um
 * cru exige achar cada um e cancelar a um. Casar agora é o passo 2a ("Vincular os exatos"), e
 * o ambíguo espera o agrupamento (2b).
 *
 * ⚠ O SEGUNDO BLOCO DO RESUMO EXISTE POR CAUSA DISSO. Num mês de 35 movimentos o botão pode
 * criar 6 e não tocar nos outros 29; sem dizer para onde esses 29 foram, o silêncio vira
 * desconfiança — e esta tela já ensinou o operador a desconfiar uma vez.
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
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import { useConciliarMes, type PreviaConciliarMes } from '@/hooks/useConciliarMes';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

type Aba = 'crus' | 'esperando' | 'ja';

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ⚠ SINAL E COR DE UMA FONTE SÓ — a mesma decisão da Mesa (129d): duas funções para a
   mesma pergunta divergem no dia em que alguém troca uma delas. */
const corValor = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400');
const comSinal = (v: number) => `${v < 0 ? '−' : '+'}${formatMoeda(Math.abs(v))}`;

/**
 * Par rótulo-valor do resumo lateral — idioma do A17.
 *
 * ⚠ QUEM ENCOLHE É O RÓTULO, E ISSO ESTAVA INVERTIDO — PR-CONCILIAR-MES-VER-OS-PARES-01. O
 * rótulo era `shrink-0` e o valor `truncate`: numa coluna de 300px, "Lançamentos sem par no
 * banco (38)" empurrava o número até ele virar "−R$ 140.45…". Cortava justamente o que o
 * operador foi ler — o rótulo ele já sabe, o número é a informação.
 * ⚠ E O `title` VEM JUNTO no rótulo: truncar sem tooltip troca um corte por outro.
 */
function LinhaResumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="min-w-0 truncate text-muted-foreground" title={rotulo}>{rotulo}</span>
      <span className={`shrink-0 whitespace-nowrap text-right font-medium tabular-nums ${cor ?? ''}`}>{valor}</span>
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
  /**
   * Quantos OFX ATIVOS DESTE MÊS — vem de `importacoesDoMes` sobre `useImportacoesDaConta`, não
   * é recontado aqui. ⚠ ERA O TOTAL DA CONTA (PR-IMPORTACOES-MES-01): o diálogo é de um mês, e o
   * total fazia três números discordarem na mesma tela — aqui, no botão "Ver importações" e na
   * lista do modal. O mês de um arquivo é o dos movimentos dele, não o da data de envio.
   */
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
  const nSemPar = previa?.semPar.length ?? 0;
  const nAguardando = previa?.aguardandoExatos.length ?? 0;
  const nadaAFazer = !!previa && nCrus === 0;

  /**
   * ⚠ QUAIS CRIAR — PR-CONCILIACAO-CRUS-01, e a escolha é por LINHA porque criar lançamento é
   * irreversível na prática: desfazer exige achar cada cru e cancelar um a um. Nasce vazio
   * (nada marcado), e o cabeçalho tem "marcar todos" para o caso de o operador querer o lote.
   */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /* Toda simulação nova zera a escolha: marcar sobre uma lista velha aprovaria outra coisa. */
  useEffect(() => { setMarcados(new Set()); }, [previa]);
  const alternar = (id: string) => setMarcados(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const todosMarcados = nCrus > 0 && marcados.size === nCrus;

  /* A diferença do saldo do sistema contra o extrato — o número que explica por que o mês
     não fecha hoje. `null` quando falta um dos dois: "não sei" não vira zero. */
  const difSistema = useMemo(() => {
    const dig = previa?.saldo.finalDigitado;
    if (saldoSistemaHoje == null || dig == null) return null;
    return saldoSistemaHoje - dig;
  }, [saldoSistemaHoje, previa]);

  const confirmar = async () => {
    if (!clienteId || !contaId || marcados.size === 0) return;
    const r = await api.gravar(clienteId, contaId, anoMes, [...marcados]);
    if (!r) { toast.error(api.erro ?? 'Falha ao criar os lançamentos.'); return; }
    toast.success(
      `${r.crus.length} lançamento${r.crus.length === 1 ? '' : 's'} criado${r.crus.length === 1 ? '' : 's'} a partir do banco.`);
    /* ⚠ AVISAR DEPOIS DA ESCRITA, E ANTES DE FECHAR — 132. A RPC gravou por fora de todo
       hook desta tela; sem a notificação, o card "Saldo no sistema" e a aba Conciliação
       ficavam com o número de antes até um F5. `aoConcluir` recarrega a lista do extrato;
       o registro alcança o resto. */
    if (clienteId) notificarLancamentosMudaram(clienteId);
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

  /**
   * ⚠ "DO QUE SOBROU" É O RECORTE, E ELE TEM DEFINIÇÃO: sobrou = ZERO candidatos no sistema.
   * O que tem um candidato vai para o passo 2a e o que tem dois ou mais vai para o 2b; só o
   * que não casa com nada precisa nascer aqui.
   * ⚠ O NÚMERO É O DOS MARCADOS, não o dos crus possíveis — o botão diz o que o clique FAZ.
   * Com a caixa por linha, `(6)` enquanto 3 estão marcados prometeria o dobro.
   */
  const rotuloBotao = `Criar lançamentos do que sobrou (${marcados.size})`;

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
                  <div className="text-[18px] font-medium leading-tight tabular-nums">
                    {previa.saldo.finalDigitado == null ? '—' : formatMoeda(previa.saldo.finalDigitado)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo do sistema hoje</div>
                  <div className="text-[18px] font-medium leading-tight tabular-nums">
                    {saldoSistemaHoje == null ? '—' : formatMoeda(saldoSistemaHoje)}
                  </div>
                  {/* ⚠ TOLERÂNCIA ZERO — PR-CONCILIACAO-TOLERANCIA-ZERO-02. */}
                  {difSistema != null && !saldoConfere(difSistema) && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
                      {comSinal(difSistema)} contra o extrato
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo após conciliar</div>
                  <div className="text-[18px] font-medium leading-tight tabular-nums">
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
                  <div className="text-[18px] font-medium leading-tight tabular-nums">{previa.movimentosExtrato}</div>
                  <div className="text-[11px] text-muted-foreground">{previa.jaConciliados} já conciliados</div>
                </div>
              </div>

              {/* ═══ ABAS ══════════════════════════════════════════════════════ */}
              <div className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-1.5">
                {/* ⚠ TRÊS ABAS, E A DO MEIO É NOVA — PR-CONCILIACAO-CRUS-01. Antes eram quatro,
                    misturando o que este botão FAZIA (criar cru, substituir) com o que ele
                    apenas relatava. Agora o botão faz uma coisa só, e as abas separam: o que
                    VAI SER CRIADO aqui, o que FICA para os outros passos, e o que já está
                    pronto. */}
                {([
                  ['crus', `A criar ${nCrus}`],
                  /* ⚠ O BADGE CONTA MOVIMENTOS DO BANCO, E SÓ ELES — PR-CONCILIAR-MES-VER-OS-PARES-01.
                     Ele somava os 38 LANÇAMENTOS do sistema aos 21 movimentos e exibia 59 — um número
                     maior que os 35 movimentos que o próprio cabeçalho anuncia, e que não era a
                     contagem de nada. Agora as três abas somam o mês: 5 + 21 + 9 = 35.
                     ⚠ OS LANÇAMENTOS CONTINUAM DENTRO DA ABA, na faixa que é deles e com o número
                     deles. O que sai da SOMA é a mistura de naturezas, não a informação. */
                  ['esperando', `Esperando ${nAguardando + (previa.ambiguos ?? 0)}`],
                  ['ja', `Já conciliados ${previa.jaConciliados}`],
                ] as const).map(([id, rot]) => (
                  <button type="button" key={id} onClick={() => setAba(id)}
                    className={`rounded-full border px-2 py-px text-[10px] ${
                      aba === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                    {rot}
                  </button>
                ))}

                {/* ⚠ "MARCAR TODOS" SÓ NA ABA EM QUE HÁ O QUE MARCAR — a mesma decisão da coluna
                    de caixas da prévia de importação: controle que não faz nada na aba errada é
                    ruído permanente. */}
                {aba === 'crus' && nCrus > 0 && (
                  <label className="ml-auto flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground"
                    title="Marcar os movimentos sem candidato nenhum no sistema — são os que podem virar lançamento novo.">
                    <input type="checkbox" className="h-3 w-3 cursor-pointer"
                      checked={todosMarcados}
                      onChange={(e) => setMarcados(e.target.checked ? new Set(previa.crus.map(c => c.extratoId)) : new Set())} />
                    marcar todos
                  </label>
                )}
              </div>

              {/* ═══ A LISTA — o único scrollport ══════════════════════════════ */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {aba === 'ja' ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    {previa.jaConciliados} movimento{previa.jaConciliados === 1 ? '' : 's'} já
                    {previa.jaConciliados === 1 ? ' tinha' : ' tinham'} vínculo e não {previa.jaConciliados === 1 ? 'é tocado' : 'são tocados'}.
                  </p>
                ) : aba === 'crus' ? (
                  nCrus === 0 ? (
                    <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                      Nenhum movimento do mês está sem candidato no sistema — não há lançamento a criar aqui.
                    </p>
                  ) : porDia(previa.crus, c => c.dataBanco).map(([dia, itens]) => (
                    <div key={dia}>
                      <div className="sticky top-0 z-[2] border-b bg-muted px-3 py-1 text-[10px] font-medium">{dataBr(dia)}</div>
                      {itens.map(c => (
                        /* ⚠ A LINHA INTEIRA É O ALVO DO CLIQUE (é um `<label>`), não só os 12px da
                           caixa — a mesma correção que o teste da grade do DRE pegou no `<td>`. */
                        <label key={c.extratoId}
                          className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-[7px] hover:bg-muted/40">
                          <input type="checkbox" className="h-3 w-3 shrink-0 cursor-pointer"
                            checked={marcados.has(c.extratoId)}
                            onChange={() => alternar(c.extratoId)} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium" title={c.historicoBanco ?? undefined}>
                              {c.historicoBanco ?? '—'}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {contaNome}{c.documentoBanco ? ` · doc ${c.documentoBanco}` : ''}
                              {' · '}
                              <span className="text-amber-700 dark:text-amber-300">
                                nada parecido no sistema · nasce sem subcentro e sem fornecedor
                              </span>
                            </div>
                          </div>
                          <div className={`shrink-0 text-[12px] font-medium tabular-nums ${corValor(c.valorBanco)}`}>
                            {comSinal(c.valorBanco)}
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-px text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">cru</span>
                        </label>
                      ))}
                    </div>
                  ))
                ) : (
                  /* ═══ ESPERANDO — três coisas diferentes, e é por isso que cada uma tem faixa
                       própria: duas são movimentos do BANCO e a terceira são LANÇAMENTOS do
                       sistema. Empilhá-las sem dizer qual é qual faria o operador somar peras
                       com maçãs para conferir o mês. */
                  <div>
                    <div className="border-b bg-muted/60 px-3 py-1 text-[10px] font-medium">
                      Têm par exato no sistema — esperando “Vincular os exatos” ({nAguardando})
                    </div>
                    {nAguardando === 0 ? (
                      <p className="px-3 py-3 text-center text-[10px] text-muted-foreground">Nenhum.</p>
                    ) : previa.aguardandoExatos.map(a => (
                      <div key={a.extratoId} className="flex items-center gap-2 border-b border-border/60 px-3 py-[7px]">
                        <div className="w-[56px] shrink-0 text-[10px] tabular-nums text-muted-foreground">{dataBr(a.dataBanco)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium" title={a.historicoBanco ?? undefined}>
                            {a.historicoBanco ?? '—'}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {contaNome}{a.documentoBanco ? ` · doc ${a.documentoBanco}` : ''}
                          </div>
                        </div>
                        <div className={`shrink-0 text-[12px] font-medium tabular-nums ${corValor(a.valorBanco)}`}>
                          {comSinal(a.valorBanco)}
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">1 candidato</span>
                      </div>
                    ))}

                    <div className="border-y bg-muted/60 px-3 py-1 text-[10px] font-medium">
                      Têm 2 ou mais candidatos — esperando o agrupamento ({previa.ambiguos})
                    </div>
                    {/* ⚠ SÓ O NÚMERO: a RPC devolve a lista dos ambíguos, mas o contrato deste hook
                        guarda apenas a contagem. Mostrar quais é o passo 2b, e é lá que o operador
                        escolhe — prometer a lista aqui seria abrir uma decisão nesta tela de novo. */}
                    <p className="px-3 py-3 text-center text-[10px] text-muted-foreground">
                      {previa.ambiguos === 0
                        ? 'Nenhum.'
                        : `${previa.ambiguos} movimento${previa.ambiguos === 1 ? '' : 's'} do banco ${previa.ambiguos === 1 ? 'casa' : 'casam'} com mais de um lançamento. Nada é criado nem vinculado por conta própria.`}
                    </p>

                    <div className="border-y bg-muted/60 px-3 py-1 text-[10px] font-medium">
                      Lançamentos do sistema sem par no banco ({nSemPar})
                    </div>
                    {nSemPar === 0 ? (
                      <p className="px-3 py-3 text-center text-[10px] text-muted-foreground">Nenhum.</p>
                    ) : porDia(previa.semPar, s => s.data).map(([dia, itens]) => (
                      <div key={dia}>
                        <div className="border-b bg-muted/30 px-3 py-1 text-[10px]">{dataBr(dia)}</div>
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
                    ))}
                  </div>
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
                  <LinhaResumo rotulo={`Entram como lançamento novo (${marcados.size})`}
                    valor={comSinal(previa.crus.filter(c => marcados.has(c.extratoId)).reduce((a, c) => a + c.valorBanco, 0))}
                    cor={corValor(previa.crusTotal)} />
                </div>
              </div>

              {/* ⚠ O SEGUNDO BLOCO É O QUE IMPEDE O OPERADOR DE ACHAR QUE PERDEU MOVIMENTO —
                  PR-CONCILIACAO-CRUS-01. Este botão passou a fazer UMA coisa, então num mês de
                  35 ele cria 6 e não toca nos outros 29. Sem dizer para onde esses 29 foram, o
                  silêncio vira desconfiança — e a tela já ensinou esse erro antes. */}
              <div className="rounded-lg border bg-card text-[11px]">
                <div className="border-b bg-muted/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  O que fica para os outros passos
                </div>
                {/* ⚠ DUAS NATUREZAS, DOIS SUB-BLOCOS — PR-CONCILIAR-MES-VER-OS-PARES-01. As quatro
                    linhas vinham empilhadas como se fossem a mesma coisa, e não são: três contam
                    MOVIMENTOS DO BANCO e uma conta LANÇAMENTOS DO SISTEMA. Somá-las com o olho —
                    que é o que uma lista sem título convida a fazer — dá um número que não existe,
                    e foi assim que o badge chegou a 59 num mês de 35.
                    ⚠ O TÍTULO DE CADA GRUPO É A CORREÇÃO, e não um enfeite: ele diz de que lado da
                    conciliação aquele número veio, que é a única coisa que impede a soma errada. */}
                <div className="space-y-1.5 px-3 py-2">
                  <div>
                    <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Movimentos do banco
                    </div>
                    <div className="space-y-1">
                      <LinhaResumo rotulo="Com par exato, esperando vincular" valor={`${nAguardando}`} />
                      <LinhaResumo rotulo="Com 2+ candidatos, esperando agrupar" valor={`${previa.ambiguos ?? 0}`} />
                      <LinhaResumo rotulo="Já conciliados" valor={`${previa.jaConciliados}`} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Lançamentos do sistema
                    </div>
                    <div className="space-y-1">
                      {/* ⚠ O ÚNICO COM DINHEIRO, e agora ele cabe inteiro: a contagem vai no rótulo e
                          o valor fica sozinho na direita, que é onde ele não disputa espaço. */}
                      <LinhaResumo rotulo={`Sem par no banco (${nSemPar})`}
                        valor={comSinal(previa.semParTotal)} cor={corValor(previa.semParTotal)} />
                    </div>
                  </div>
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
                {api.gravando ? (
                  <span className="tabular-nums">
                    Gravando em lotes de 30 — <b className="text-foreground">{api.gravados}</b> de {marcados.size}.
                    Cada lote é gravado por inteiro; se um falhar, os anteriores ficam.
                  </span>
                ) : nadaAFazer ? (
                  'Nada a criar: todo movimento do mês já tem vínculo ou tem candidato no sistema.'
                ) : (
                  <>
                    Serão criados <b className="text-foreground">{marcados.size}</b> lançamentos crus,
                    iguais ao extrato: data, valor e histórico do banco, sem subcentro e sem
                    fornecedor. Nenhum lançamento existente é alterado e nada é apagado.
                    {/* ⚠ E NÃO SE CASA NADA AQUI — PR-CONCILIACAO-CRUS-01. Dizer isso na tela é o
                        que separa este passo do "Vincular os exatos"; sem a frase, "conciliar o
                        mês" continua parecendo o botão que fazia tudo. */}
                    {' '}Vincular o que já existe é o passo seguinte.
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
          {/* ⚠ O ERRO DO BANCO FICA NA TELA, em vermelho, e não só num toast que some — 132.
              Foi um toast genérico que escondeu o `57014` de 07/09 e fez a gravação de 107
              movimentos parecer um defeito sem causa. */}
          {api.erro && (
            <span className="mr-auto min-w-0 flex-1 truncate text-[10px] text-red-600 dark:text-red-400"
              title={api.erro}>
              {api.erro}
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]"
            onClick={() => onOpenChange(false)}>
            Fechar sem alterar
          </Button>
          {previa && !nadaAFazer && (
            <>
              {/* ⚠ O MOTIVO FICA ESCRITO AO LADO — regra da OC: botão desabilitado diz por quê,
                  e a mesma frase governa o `disabled` e o `title`. Sem ela, o operador vê um
                  botão morto e não descobre que faltava marcar a linha. */}
              {marcados.size === 0 && !api.gravando && (
                <span className="text-[10px] text-muted-foreground">Marque as linhas que devem virar lançamento.</span>
              )}
              <Button type="button" size="sm"
                className="h-7 bg-[#f3c84a] text-[11px] font-medium text-foreground hover:bg-[#e8bd3e]"
                disabled={api.gravando || marcados.size === 0}
                title={marcados.size === 0 ? 'Marque as linhas que devem virar lançamento.' : undefined}
                onClick={() => { void confirmar(); }}>
                {api.gravando
                  /* ⚠ O NÚMERO SOBE PORQUE SÃO VÁRIAS CHAMADAS — 132. Um "Conciliando…" mudo
                     por 10 s num lote de 107 é indistinguível de uma tela travada. */
                  ? `Gravando… ${api.gravados} de ${marcados.size}`
                  : rotuloBotao}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
