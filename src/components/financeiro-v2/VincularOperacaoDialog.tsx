/**
 * "VINCULAR A OPERACAO COMERCIAL" — VINCULAR-LANC-OC-01 (mock v1 aprovado pelo Gabriel).
 *
 * O lancamento continua o mesmo: valor, pagamento e conciliacao nao mudam. Ele passa a ser o
 * titulo de um item da OC escolhida — e, se a OC ja tinha gerado um titulo aberto para aquele
 * item, este o SUBSTITUI (nunca soma).
 * ⚠ QUEM DECIDE E' O BANCO. As candidatas e a ordem vem de `oc_candidatas_vinculo`; o aside
 * "O que vai acontecer" vem de `oc_vincular_lancamento` com `p_simular` — o mesmo caminho da
 * gravacao, desfeito. Esta tela so' mostra e escolhe.
 * ⚠ ESCALA DE MODAL DA A18 (docs/PADROES-UI.md): cabecalho 36px navy, secao 12px, linhas
 * 10,5-11px, aside ~270px, rodape 32px navy com botoes de 22px.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { TOM_SELO, Selo, Secao } from '@/components/financeiro-v2/modalVinculoOC';
import {
  buscarCandidatasVinculo, vincularLancamentoOC, situacaoDaCandidata, candidataInicial,
  compromissoDoItem, compromissoExato, linhaDaCandidata, rotuloComponente, resumoDoVinculo, textoDoAviso, rotuloOC, dataBr, mensagemDeErro, ehRecusa, ehVinculo,
  fraseDaParcela, fraseDoParcial,
  blocosDeCandidatas, fraseDaJanela, rotuloMostrarFora, fraseForaDoLimite, fraseOutroTipo, avisoForaDaJanela, seloOutraFazenda, fraseDoInelegivel,
  type RespostaCandidatas, type RespostaVinculo, type OperacaoCandidata, type VinculoRecusado,
} from '@/lib/oc/vincularLancamento';

interface Props {
  open: boolean;
  lancamentoId: string;
  clienteId: string;
  onClose: () => void;
  /** Depois de gravar: o chamador fecha o que precisa (o detalhe do lancamento). */
  onVinculado?: () => void;
  /**
   * A OC que ja' vem escolhida — OC-VENDA-FINANCEIRO-COMPLETO-01a ("+ Buscar despesa no Financeiro", aberto de DENTRO da OC).
   * ⚠ SO' VALE SE O BANCO A DEVOLVER COMO CANDIDATA: a lista e a ordem seguem de `oc_candidatas_vinculo`. Fora da lista, a
   *   escolha volta a ser a de sempre (`candidataInicial`) — a tela nunca escolhe o que o banco nao ofereceu.
   * ⚠ AUSENTE = o comportamento de antes, sem mudanca nenhuma (Financeiro V2).
   */
  operacaoIdPreEscolhida?: string | null;
}

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_ORIGEM: Record<string, string> = {
  manual: 'Manual', ofx: 'OFX', extrato: 'Extrato', importacao_incremental: 'Importação',
  importacao_historica: 'Importação histórica', movimentacao_rebanho: 'Modal antigo do rebanho',
  conciliacao: 'Conciliação', mesa_excel: 'Mesa (Excel)', mesa_split: 'Mesa (divisão)',
};

export function VincularOperacaoDialog({ open, lancamentoId, clienteId, onClose, onVinculado, operacaoIdPreEscolhida = null }: Props) {
  const [resp, setResp] = useState<RespostaCandidatas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [componente, setComponente] = useState<string | null>(null);
  const [ocSel, setOcSel] = useState<string | null>(null);
  const [compromissoSel, setCompromissoSel] = useState<string | null>(null);
  const [parcelaSel, setParcelaSel] = useState<string | null>(null);
  const [criarNovo, setCriarNovo] = useState(false);
  const [sim, setSim] = useState<RespostaVinculo | null>(null);
  /* A lista de "escolher compromisso/parcela" fica na tela depois da escolha: a simulacao seguinte
     ja' vem `ok`, e sem guardar a lista o operador nao teria como trocar de ideia. */
  const [escolhaPedida, setEscolhaPedida] = useState<VinculoRecusado | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSim, setErroSim] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  /* OC-VINCULAR-CANDIDATAS-01: as de fora da janela ficam recolhidas ate' o operador pedir. */
  const [mostrarFora, setMostrarFora] = useState(false);
  /* a linha que NÃO se escolhe diz por quê no painel, ao ser clicada (o motivo é o `title` do selo, do dono) */
  const [motivoDaLinha, setMotivoDaLinha] = useState<string | null>(null);

  /* Carga: candidatas + item sugerido + pre-selecao (so' valor exato). */
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setResp(null); setErroCarga(null); setSim(null); setErroSim(null); setMotivo('');
    setOcSel(null); setCompromissoSel(null); setParcelaSel(null); setCriarNovo(false); setEscolhaPedida(null); setMostrarFora(false); setMotivoDaLinha(null);
    setCarregando(true);
    buscarCandidatasVinculo(lancamentoId)
      .then(r => {
        if (cancelado) return;
        setResp(r);
        const comps = r.regra?.componentes ?? [];
        const item = r.componente_sugerido?.codigo ?? (comps.length === 1 ? comps[0] : null);
        setComponente(item);
        const inicial = operacaoIdPreEscolhida && (r.candidatas ?? []).some(c => c.operacao_id === operacaoIdPreEscolhida)
          ? operacaoIdPreEscolhida
          : candidataInicial(r.candidatas ?? [], item, r.lancamento?.valor ?? 0);
        setOcSel(inicial);
        /* VINCULAR-FIX-01: valor exato vence — o compromisso exato vai escolhido, mesmo de outro componente. */
        const ocInicial = (r.candidatas ?? []).find(c => c.operacao_id === inicial);
        setCompromissoSel(ocInicial ? compromissoExato(ocInicial)?.id ?? null : null);
      })
      .catch(e => { if (!cancelado) setErroCarga(mensagemDeErro(e)); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [open, lancamentoId, operacaoIdPreEscolhida]);

  const candidatas = resp?.candidatas ?? [];
  const lanc = resp?.lancamento;
  const valorLanc = lanc?.valor ?? 0;
  const oc = useMemo(() => candidatas.find(c => c.operacao_id === ocSel) ?? null, [candidatas, ocSel]);

  /* Trocar de OC ou de item zera as escolhas que dependem deles. */
  const escolherOC = (id: string) => {
    const c = candidatas.find(x => x.operacao_id === id);
    setMotivoDaLinha(null); setOcSel(id); setCompromissoSel(c ? compromissoExato(c)?.id ?? null : null);
    setParcelaSel(null); setCriarNovo(false); setEscolhaPedida(null);
  };
  const escolherItem = (c: string) => { setComponente(c); setCompromissoSel(null); setParcelaSel(null); setCriarNovo(false); setEscolhaPedida(null); };

  /* Simulacao: o "o que vai acontecer" e' a propria RPC, com `p_simular`. */
  useEffect(() => {
    if (!open || !oc || (!componente && !compromissoSel)) { setSim(null); return; }
    let cancelado = false;
    setSimulando(true); setErroSim(null);
    vincularLancamentoOC({
      operacaoId: oc.operacao_id, versao: oc.versao, lancamentoId,
      componente: compromissoSel ? null : componente, motivo: null,
      compromissoId: compromissoSel, parcelaId: parcelaSel, criarNovo, simular: true,
    })
      .then(r => {
        if (cancelado) return;
        setSim(r);
        if (ehRecusa(r) && (r.motivo === 'escolher_compromisso' || r.motivo === 'escolher_parcela')) setEscolhaPedida(r);
      })
      .catch(e => { if (!cancelado) { setSim(null); setErroSim(mensagemDeErro(e)); } })
      .finally(() => { if (!cancelado) setSimulando(false); });
    return () => { cancelado = true; };
  }, [open, oc, componente, compromissoSel, parcelaSel, criarNovo, lancamentoId]);

  const pronto = ehVinculo(sim) && !!oc;
  const motivoOk = motivo.trim().length > 0;
  const recusa: VinculoRecusado | null = ehRecusa(sim) ? sim : null;

  async function confirmar() {
    if (!oc || !pronto || !motivoOk) return;
    setGravando(true);
    try {
      const r = await vincularLancamentoOC({
        operacaoId: oc.operacao_id, versao: oc.versao, lancamentoId,
        componente: compromissoSel ? null : componente, motivo: motivo.trim(),
        compromissoId: compromissoSel, parcelaId: parcelaSel, criarNovo,
      });
      if (ehRecusa(r)) { setSim(r); toast.error('A operação mudou: escolha de novo.'); return; }
      /* FIN-V2-REFRESH-02: escrita por fora do hook avisa a lista, e so' no sucesso. */
      notificarLancamentosMudaram(clienteId);
      toast.success(`Lançamento vinculado à ${rotuloOC(oc)}.`);
      onClose();
      onVinculado?.();
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setGravando(false);
    }
  }

  const permitidos = resp?.regra?.componentes ?? [];
  const sug = resp?.componente_sugerido;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !gravando) onClose(); }}>
      <DialogContent
        className="w-[96vw] max-w-[1100px] h-[calc(100vh-32px)] max-h-none p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        {/* cabecalho 36px */}
        <div className="h-9 shrink-0 bg-primary text-primary-foreground px-4 flex items-center gap-3">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <DialogTitle className="shrink-0 text-[13px] font-semibold leading-none">Vincular à operação comercial</DialogTitle>
          <span className="min-w-0 truncate text-[10px] text-primary-foreground/80">
            O lançamento continua o mesmo — valor, pagamento e conciliação não mudam. Ele passa a pertencer à OC escolhida.
          </span>
          <button type="button" onClick={onClose} disabled={gravando} className="ml-auto shrink-0 text-white/80 hover:text-white"
            title="Fechar" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_270px]">
          {/* OC-VINCULAR-CANDIDATAS-01 — corpo SEM rolagem propria: o lancamento, o item e o motivo ficam parados e SO' A LISTA de
              candidatas rola, com o cabecalho dela fixo (a lista cresceu: outras fazendas, fora da janela, rascunhos). */}
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden px-4 py-3">
            {carregando && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando operações candidatas…
              </div>
            )}
            {erroCarga && <p className="text-[11px] text-destructive">{erroCarga}</p>}
            {resp && !resp.elegivel && (
              <p className="text-[11px] text-destructive" data-testid="vinc-inelegivel">
                {fraseDoInelegivel(resp.motivo)}
              </p>
            )}

            {lanc && (
              <Secao titulo="Lançamento" extra={
                <span className="flex gap-1">
                  {lanc.conciliado && <Selo tom="verde">Conciliado</Selo>}
                  {lanc.movimentacao_rebanho_id && <Selo tom="ambar">Modal antigo</Selo>}
                </span>
              }>
                {/* OC-VINCULAR-CANDIDATAS-01 (acerto b): o lançamento em DUAS linhas de 10px — o espaço vai para a lista. Só texto
                    longo corta (inteiro no `title`); valor e datas nunca. */}
                <div className="rounded-md border bg-muted/20 px-2 py-1 text-[10px] leading-[15px]" data-testid="vinc-lancamento">
                  <div className="flex items-baseline gap-3 whitespace-nowrap">
                    <Dado rotulo="Descrição" valor={lanc.descricao ?? '—'} corta className="min-w-0 flex-[2]" forte />
                    <Dado rotulo="Favorecido" valor={lanc.favorecido_nome ?? '—'} corta className="min-w-0 flex-1" />
                    <Dado rotulo="Valor" valor={brl(lanc.valor)} className="shrink-0 tabular-nums" forte />
                  </div>
                  <div className="flex items-baseline gap-3 whitespace-nowrap">
                    <Dado rotulo="Pagamento" valor={dataBr(lanc.data_pagamento)} className="shrink-0 tabular-nums" />
                    <Dado rotulo="Competência" valor={dataBr(lanc.data_competencia)} className="shrink-0 tabular-nums" />
                    <Dado rotulo="Fazenda" valor={lanc.fazenda_nome ?? '—'} corta className="min-w-0 flex-1" />
                    <Dado rotulo="Subcentro" valor={lanc.subcentro ?? '—'} corta className="min-w-0 flex-[2]" />
                    <Dado rotulo="Origem" valor={ROTULO_ORIGEM[lanc.origem_lancamento ?? ''] ?? lanc.origem_lancamento ?? '—'} className="shrink-0" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">Item da OC</span>
                  <Select value={componente ?? undefined} onValueChange={escolherItem} disabled={permitidos.length <= 1}>
                    <SelectTrigger className="h-[26px] w-[200px] text-[11px]" data-testid="vinc-item">
                      <SelectValue placeholder="Escolha o item" />
                    </SelectTrigger>
                    <SelectContent>
                      {permitidos.map(c => <SelectItem key={c} value={c}>{rotuloComponente(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {sug && componente === sug.codigo && (
                    <span className="text-[10px] text-muted-foreground">
                      {sug.fonte === 'subcentro' ? 'pelo subcentro' : `sugerido pela descrição${sug.rotulo ? ` (${sug.rotulo})` : ''}`}
                    </span>
                  )}
                </div>
              </Secao>
            )}

            {resp?.elegivel && (() => {
              const { naJanela, foraDaJanela } = blocosDeCandidatas(candidatas);
              const visiveis = mostrarFora ? [...naJanela, ...foraDaJanela] : naJanela;
              const rodape = [fraseForaDoLimite(resp), fraseOutroTipo(resp)].filter((x): x is string => !!x);
              return (
              <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="vinc-secao-candidatas">
                <div className="flex shrink-0 items-baseline gap-2">
                  <h3 className="text-[12px] font-medium">Operações candidatas</h3>
                  <span className="text-[10px] text-muted-foreground" data-testid="vinc-contagem">{fraseDaJanela(resp, naJanela.length)}</span>
                  {foraDaJanela.length > 0 && (
                    <button type="button" data-testid="vinc-mostrar-fora" aria-expanded={mostrarFora}
                      onClick={() => setMostrarFora(v => !v)}
                      className="ml-auto text-[10px] font-medium text-primary underline-offset-2 hover:underline">
                      {rotuloMostrarFora(resp, foraDaJanela.length, mostrarFora)}
                    </button>
                  )}
                </div>
                {candidatas.length === 0 ? (
                  <p className="shrink-0 text-[11px] text-muted-foreground" data-testid="vinc-sem-candidatas">
                    Nenhuma operação deste tipo perto destas datas.
                  </p>
                ) : (
                  /* o UNICO scrollport do corpo; o cabecalho da tabela fica fixo nele */
                  <div className="min-h-[52px] flex-1 overflow-y-auto rounded border" data-testid="vinc-lista">
                  <table className="w-full border-collapse text-[10.5px]" data-testid="vinc-candidatas">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b text-left text-[10px] text-muted-foreground">
                        <th className="w-6 py-1 pl-1" />
                        <th className="py-1 font-normal">Operação</th>
                        <th className="py-1 font-normal text-right">Dist.</th>
                        <th className="py-1 font-normal text-right">Acordado</th>
                        <th className="py-1 pl-2 font-normal">Compromisso do item</th>
                        <th className="py-1 pl-2 font-normal">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.length === 0 && (
                        <tr><td colSpan={6} className="py-1.5 pl-1 text-[10.5px] text-muted-foreground" data-testid="vinc-so-fora">
                          Nenhuma dentro da janela.
                        </td></tr>
                      )}
                      {visiveis.map(c => (
                        <LinhaCandidata key={c.operacao_id} c={c} componente={componente} valorLanc={valorLanc}
                          selecionada={c.operacao_id === ocSel} onEscolher={() => escolherOC(c.operacao_id)}
                          onExplicar={m => { setOcSel(null); setMotivoDaLinha(m); }}
                          escolha={c.operacao_id === ocSel ? escolhaPedida : null}
                          compromissoSel={compromissoSel} parcelaSel={parcelaSel}
                          onCompromisso={id => { setCompromissoSel(id); setParcelaSel(null); setCriarNovo(false); }}
                          onParcela={setParcelaSel}
                          onCriarNovo={() => { setCompromissoSel(null); setParcelaSel(null); setCriarNovo(true); }} />
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
                {/* o que continua FORA da lista, dito em uma linha cada (os numeros sao do banco) */}
                {rodape.map(f => (
                  <p key={f} className="shrink-0 truncate text-[10px] leading-tight text-muted-foreground" title={f} data-testid="vinc-rodape-lista">{f}</p>
                ))}
                {erroSim && <p className="shrink-0 text-[11px] text-destructive">{erroSim}</p>}
              </div>
              );
            })()}

            {resp?.elegivel && (
              <Secao titulo="Motivo">
                <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} data-testid="vinc-motivo"
                  placeholder="Por que este lançamento é desta operação (obrigatório — vai para a trilha da OC)"
                  className="min-h-0 text-[11px]" />
              </Secao>
            )}
          </div>

          {/* aside: o que vai acontecer */}
          <aside className="flex min-h-0 flex-col border-l bg-card text-[10px]" data-testid="vinc-resumo">
            <div className="shrink-0 border-b bg-accent/40 px-2.5 py-[5px] text-[10px] font-medium uppercase tracking-wide text-primary">
              O que vai acontecer
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
              {!oc && motivoDaLinha && (
                <p data-testid="vinc-motivo-da-linha" className={cn('rounded border px-1.5 py-1 leading-snug', TOM_SELO.ambar)}>{motivoDaLinha}</p>
              )}
              {!oc && !motivoDaLinha && <p className="text-muted-foreground">Escolha uma operação para ver o efeito antes de confirmar.</p>}
              {oc && simulando && <p className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculando…</p>}
              {oc && !simulando && recusa && (
                <p className={recusa.motivo === 'titulo_oc_liquidado' ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}>
                  {recusa.motivo === 'titulo_oc_liquidado'
                    ? `O título da OC já está ${recusa.titulo_oc?.status_transacao ?? 'realizado'} (${brl(recusa.titulo_oc?.valor)}). Os dois são dinheiro real: desfaça um deles antes.`
                    : recusa.motivo === 'escolher_parcela' ? 'Escolha a parcela na lista à esquerda.' : 'Escolha o compromisso na lista à esquerda.'}
                </p>
              )}
              {/* OC-VINCULAR-PARCELA-SEGUINTE-01 — o painel NUNCA fica vazio com a operação escolhida: se a simulação falhou,
                  a frase do banco aparece aqui também. */}
              {oc && !simulando && !sim && erroSim && (
                <p className="text-red-700 dark:text-red-300" data-testid="vinc-resumo-erro">Não foi possível calcular: {erroSim}</p>
              )}
              {oc && !simulando && ehVinculo(sim) && (
                <>
                  {/* OC-VINCULAR-RECEBIMENTO-PARCIAL-01: recebimento MENOR que a parcela — a frase do saldo ocupa o lugar da frase da
                      parcela (uma manchete só; as duas diriam o mesmo com números diferentes). */}
                  {fraseDoParcial(sim) ? (
                    <p className="font-medium leading-snug text-foreground" data-testid="vinc-parcial">{fraseDoParcial(sim)}</p>
                  ) : fraseDaParcela(sim) && (
                    <p className="font-medium leading-snug text-foreground" data-testid="vinc-parcela">{fraseDaParcela(sim)}</p>
                  )}
                  <dl className="space-y-1">
                    {resumoDoVinculo(sim).map(l => (
                      <div key={l.rotulo} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground shrink-0">{l.rotulo}</dt>
                        <dd className={cn('text-right', l.tom === 'ambar' && 'text-amber-800 dark:text-amber-300 font-medium')}>{l.valor}</dd>
                      </div>
                    ))}
                  </dl>
                  {oc && resp && avisoForaDaJanela(oc, resp) && (
                    <p data-testid="vinc-aviso-janela" className={cn('rounded border px-1.5 py-1 leading-snug', TOM_SELO.ambar)}>{avisoForaDaJanela(oc, resp)}</p>
                  )}
                  {sim.avisos.length > 0 && (
                    <ul className="space-y-1 border-t pt-2" data-testid="vinc-avisos">
                      {sim.avisos.map(textoDoAviso).map(a => (
                        <li key={a.codigo} data-aviso={a.codigo}
                          className={cn('rounded border px-1.5 py-1 leading-snug', a.tom === 'vermelho' ? TOM_SELO.vermelho : TOM_SELO.ambar)}>
                          {a.texto}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>

        {/* rodape 32px */}
        <div className="h-8 shrink-0 bg-primary px-2 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={gravando}
            className="h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white">Cancelar</Button>
          <div className="flex items-center gap-2">
            {oc && pronto && !motivoOk && <span className="text-[10px] text-white/80">Informe o motivo</span>}
            <Button type="button" variant="secondary" onClick={confirmar} data-testid="vinc-confirmar"
              disabled={!pronto || !motivoOk || gravando || simulando}
              className="h-[22px] px-[9px] text-[10px] gap-1">
              {gravando && <Loader2 className="h-3 w-3 animate-spin" />}
              {oc ? `Vincular à ${rotuloOC(oc)}` : 'Vincular'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Um dado do lançamento na faixa compacta: rótulo apagado + valor, numa linha; `corta` = texto livre (inteiro no `title`). */
function Dado({ rotulo, valor, corta, forte, className }: { rotulo: string; valor: string; corta?: boolean; forte?: boolean; className?: string }) {
  return (
    <span className={cn(corta && 'truncate', className)} title={corta ? `${rotulo}: ${valor}` : undefined}>
      <span className="text-muted-foreground">{rotulo}</span>{' '}
      <span className={cn(forte && 'font-medium')}>{valor}</span>
    </span>
  );
}

function LinhaCandidata({ c, componente, valorLanc, selecionada, onEscolher, onExplicar, escolha, compromissoSel, parcelaSel, onCompromisso, onParcela, onCriarNovo }: {
  c: OperacaoCandidata; componente: string | null; valorLanc: number; selecionada: boolean; onEscolher: () => void; onExplicar: (motivo: string) => void;
  escolha: VinculoRecusado | null; compromissoSel: string | null; parcelaSel: string | null;
  onCompromisso: (id: string) => void; onParcela: (id: string) => void; onCriarNovo: () => void;
}) {
  const sit = situacaoDaCandidata(c, componente, valorLanc);
  const comp = compromissoDoItem(c, componente);
  return (
    <>
      <tr
        data-oc={c.operacao_id} data-selecionavel={sit.selecionavel ? 'sim' : 'nao'}
        onClick={() => { if (sit.selecionavel) onEscolher(); else if (sit.title) onExplicar(sit.title); }}
        title={sit.title}
        className={cn('border-b', sit.selecionavel ? 'cursor-pointer hover:bg-accent/50' : 'cursor-not-allowed opacity-60',
          selecionada && 'bg-primary/5')}
      >
        <td className="py-1 pl-1">
          <span role="radio" aria-checked={selecionada} aria-disabled={!sit.selecionavel}
            className={cn('inline-block h-3 w-3 rounded-full border', selecionada ? 'border-primary bg-primary' : 'border-muted-foreground/50')} />
        </td>
        {/* VINCULAR-FIX-01: data · tipo · fazenda · cab · contraparte numa linha so' (sem "OC de"). */}
        <td className="py-1 font-medium w-full max-w-0 truncate" data-testid="vinc-linha" title={linhaDaCandidata(c)}>
          {seloOutraFazenda(c) && (
            <span data-testid="vinc-outra-fazenda" title={seloOutraFazenda(c) ?? undefined}
              className="mr-1 rounded border border-amber-300 bg-amber-50 px-1 text-[9.5px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {seloOutraFazenda(c)}
            </span>
          )}
          {linhaDaCandidata(c)}
        </td>
        <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap" data-testid="vinc-dist">{c.fora_da_janela ? `a ${c.distancia_dias} dias` : `${c.distancia_dias}d`}</td>
        <td className="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{brl(c.valor_acordado)}</td>
        <td className="py-1 pl-2 max-w-[180px] truncate">
          {comp ? `${comp.descricao ?? rotuloComponente(comp.componente)} · ${brl(comp.valor_total)}` : 'nenhum (será criado)'}
        </td>
        <td className="py-1 pl-2 whitespace-nowrap"><Selo tom={sit.tom} title={sit.title}>{sit.rotulo}</Selo></td>
      </tr>
      {selecionada && escolha && (
        <tr className="border-b bg-amber-50/40 dark:bg-amber-950/20" data-testid="vinc-escolha">
          <td />
          <td colSpan={5} className="py-1.5">
            <div className="text-[10px] text-muted-foreground mb-1">
              {escolha.motivo === 'escolher_parcela' ? 'O compromisso tem mais de uma parcela — qual este lançamento paga?' : 'A OC tem mais de um compromisso que cabe — qual é este?'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {escolha.motivo === 'escolher_compromisso' && (escolha.compromissos ?? []).map(k => (
                <button key={k.id} type="button" onClick={() => onCompromisso(k.id)} data-compromisso={k.id}
                  className={cn('rounded border px-2 py-0.5 text-[10.5px]', compromissoSel === k.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                  {k.descricao ?? rotuloComponente(k.componente ?? '')} · {brl(k.valor_total)}
                </button>
              ))}
              {escolha.motivo === 'escolher_parcela' && (escolha.parcelas ?? []).map(p => (
                <button key={p.id} type="button" onClick={() => onParcela(p.id)}
                  className={cn('rounded border px-2 py-0.5 text-[10.5px]', parcelaSel === p.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                  {p.sequencia}ª · {brl(p.valor)} · {dataBr(p.vencimento)}{p.titulo_status ? ` · ${p.titulo_status}` : ''}
                </button>
              ))}
              {escolha.pode_criar_novo && (
                <button type="button" onClick={onCriarNovo} data-testid="vinc-criar-novo"
                  className="rounded border border-dashed px-2 py-0.5 text-[10.5px] hover:bg-accent">
                  Criar compromisso novo
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
