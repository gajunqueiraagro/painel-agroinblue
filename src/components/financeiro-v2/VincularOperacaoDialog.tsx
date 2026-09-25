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
import { TOM_SELO, Selo, Secao, Par } from '@/components/financeiro-v2/modalVinculoOC';
import {
  buscarCandidatasVinculo, vincularLancamentoOC, situacaoDaCandidata, candidataInicial,
  compromissoDoItem, rotuloComponente, resumoDoVinculo, textoDoAviso, rotuloOC, dataBr, mensagemDeErro, ehRecusa, ehVinculo,
  type RespostaCandidatas, type RespostaVinculo, type OperacaoCandidata, type VinculoRecusado,
} from '@/lib/oc/vincularLancamento';

interface Props {
  open: boolean;
  lancamentoId: string;
  clienteId: string;
  onClose: () => void;
  /** Depois de gravar: o chamador fecha o que precisa (o detalhe do lancamento). */
  onVinculado?: () => void;
}

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_ORIGEM: Record<string, string> = {
  manual: 'Manual', ofx: 'OFX', extrato: 'Extrato', importacao_incremental: 'Importação',
  importacao_historica: 'Importação histórica', movimentacao_rebanho: 'Modal antigo do rebanho',
  conciliacao: 'Conciliação', mesa_excel: 'Mesa (Excel)', mesa_split: 'Mesa (divisão)',
};

export function VincularOperacaoDialog({ open, lancamentoId, clienteId, onClose, onVinculado }: Props) {
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

  /* Carga: candidatas + item sugerido + pre-selecao (so' valor exato). */
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setResp(null); setErroCarga(null); setSim(null); setErroSim(null); setMotivo('');
    setOcSel(null); setCompromissoSel(null); setParcelaSel(null); setCriarNovo(false); setEscolhaPedida(null);
    setCarregando(true);
    buscarCandidatasVinculo(lancamentoId)
      .then(r => {
        if (cancelado) return;
        setResp(r);
        const comps = r.regra?.componentes ?? [];
        const item = r.componente_sugerido?.codigo ?? (comps.length === 1 ? comps[0] : null);
        setComponente(item);
        setOcSel(candidataInicial(r.candidatas ?? [], item, r.lancamento?.valor ?? 0));
      })
      .catch(e => { if (!cancelado) setErroCarga(mensagemDeErro(e)); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [open, lancamentoId]);

  const candidatas = resp?.candidatas ?? [];
  const lanc = resp?.lancamento;
  const valorLanc = lanc?.valor ?? 0;
  const oc = useMemo(() => candidatas.find(c => c.operacao_id === ocSel) ?? null, [candidatas, ocSel]);

  /* Trocar de OC ou de item zera as escolhas que dependem deles. */
  const escolherOC = (id: string) => { setOcSel(id); setCompromissoSel(null); setParcelaSel(null); setCriarNovo(false); setEscolhaPedida(null); };
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
          {/* corpo: unico que rola */}
          <div className="min-h-0 overflow-y-auto px-4 py-3 space-y-4">
            {carregando && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando operações candidatas…
              </div>
            )}
            {erroCarga && <p className="text-[11px] text-destructive">{erroCarga}</p>}
            {resp && !resp.elegivel && (
              <p className="text-[11px] text-destructive" data-testid="vinc-inelegivel">
                Este lançamento não pode ser vinculado ({resp.motivo}).
              </p>
            )}

            {lanc && (
              <Secao titulo="Lançamento" extra={
                <span className="flex gap-1">
                  {lanc.conciliado && <Selo tom="verde">Conciliado</Selo>}
                  {lanc.movimentacao_rebanho_id && <Selo tom="ambar">Modal antigo</Selo>}
                </span>
              }>
                <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 px-2.5 py-2">
                  <div className="col-span-2"><Par rotulo="Descrição" valor={lanc.descricao ?? '—'} /></div>
                  <Par rotulo="Valor" valor={<span className="font-medium tabular-nums">{brl(lanc.valor)}</span>} />
                  <Par rotulo="Subcentro" valor={lanc.subcentro ?? '—'} />
                  <Par rotulo="Favorecido" valor={lanc.favorecido_nome ?? '—'} />
                  <Par rotulo="Competência" valor={dataBr(lanc.data_competencia)} />
                  <Par rotulo="Pagamento" valor={dataBr(lanc.data_pagamento)} />
                  <Par rotulo="Fazenda" valor={lanc.fazenda_nome ?? '—'} />
                  <Par rotulo="Origem" valor={ROTULO_ORIGEM[lanc.origem_lancamento ?? ''] ?? lanc.origem_lancamento ?? '—'} />
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">Item da OC</span>
                  <Select value={componente ?? undefined} onValueChange={escolherItem} disabled={permitidos.length <= 1}>
                    <SelectTrigger className="h-[26px] w-[200px] text-[11px]" data-testid="vinc-item">
                      <SelectValue placeholder="Escolha o item" />
                    </SelectTrigger>
                    <SelectContent>
                      {permitidos.map(c => <SelectItem key={c} value={c} className="text-[11px]">{rotuloComponente(c)}</SelectItem>)}
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

            {resp?.elegivel && (
              <Secao titulo="Operações candidatas" extra={<span className="text-[10px] text-muted-foreground">{candidatas.length} na janela de 60 dias</span>}>
                {candidatas.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma operação do mesmo tipo, cliente e fazenda perto destas datas.</p>
                ) : (
                  <table className="w-full border-collapse text-[10.5px]" data-testid="vinc-candidatas">
                    <thead>
                      <tr className="border-b text-left text-[10px] text-muted-foreground">
                        <th className="w-6 py-1" />
                        <th className="py-1 font-normal">OC</th>
                        <th className="py-1 font-normal">Tipo</th>
                        <th className="py-1 font-normal">Data</th>
                        <th className="py-1 font-normal text-right">Dist.</th>
                        <th className="py-1 font-normal">Fazenda</th>
                        <th className="py-1 font-normal">Contraparte</th>
                        <th className="py-1 font-normal text-right">Acordado</th>
                        <th className="py-1 font-normal">Compromisso do item</th>
                        <th className="py-1 font-normal">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidatas.map(c => (
                        <LinhaCandidata key={c.operacao_id} c={c} componente={componente} valorLanc={valorLanc}
                          selecionada={c.operacao_id === ocSel} onEscolher={() => escolherOC(c.operacao_id)}
                          escolha={c.operacao_id === ocSel ? escolhaPedida : null}
                          compromissoSel={compromissoSel} parcelaSel={parcelaSel}
                          onCompromisso={id => { setCompromissoSel(id); setParcelaSel(null); setCriarNovo(false); }}
                          onParcela={setParcelaSel}
                          onCriarNovo={() => { setCompromissoSel(null); setParcelaSel(null); setCriarNovo(true); }} />
                      ))}
                    </tbody>
                  </table>
                )}
                {erroSim && <p className="text-[11px] text-destructive">{erroSim}</p>}
              </Secao>
            )}

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
              {!oc && <p className="text-muted-foreground">Escolha uma operação para ver o efeito antes de confirmar.</p>}
              {oc && simulando && <p className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculando…</p>}
              {oc && !simulando && recusa && (
                <p className={recusa.motivo === 'titulo_oc_liquidado' ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}>
                  {recusa.motivo === 'titulo_oc_liquidado'
                    ? `O título da OC já está ${recusa.titulo_oc?.status_transacao ?? 'realizado'} (${brl(recusa.titulo_oc?.valor)}). Os dois são dinheiro real: desfaça um deles antes.`
                    : recusa.motivo === 'escolher_parcela' ? 'Escolha a parcela na lista à esquerda.' : 'Escolha o compromisso na lista à esquerda.'}
                </p>
              )}
              {oc && !simulando && ehVinculo(sim) && (
                <>
                  <dl className="space-y-1">
                    {resumoDoVinculo(sim).map(l => (
                      <div key={l.rotulo} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground shrink-0">{l.rotulo}</dt>
                        <dd className={cn('text-right', l.tom === 'ambar' && 'text-amber-800 dark:text-amber-300 font-medium')}>{l.valor}</dd>
                      </div>
                    ))}
                  </dl>
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

function LinhaCandidata({ c, componente, valorLanc, selecionada, onEscolher, escolha, compromissoSel, parcelaSel, onCompromisso, onParcela, onCriarNovo }: {
  c: OperacaoCandidata; componente: string | null; valorLanc: number; selecionada: boolean; onEscolher: () => void;
  escolha: VinculoRecusado | null; compromissoSel: string | null; parcelaSel: string | null;
  onCompromisso: (id: string) => void; onParcela: (id: string) => void; onCriarNovo: () => void;
}) {
  const sit = situacaoDaCandidata(c, componente, valorLanc);
  const comp = compromissoDoItem(c, componente);
  return (
    <>
      <tr
        data-oc={c.operacao_id} data-selecionavel={sit.selecionavel ? 'sim' : 'nao'}
        onClick={() => { if (sit.selecionavel) onEscolher(); }}
        title={sit.title}
        className={cn('border-b', sit.selecionavel ? 'cursor-pointer hover:bg-accent/50' : 'cursor-not-allowed opacity-60',
          selecionada && 'bg-primary/5')}
      >
        <td className="py-1">
          <span role="radio" aria-checked={selecionada} aria-disabled={!sit.selecionavel}
            className={cn('inline-block h-3 w-3 rounded-full border', selecionada ? 'border-primary bg-primary' : 'border-muted-foreground/50')} />
        </td>
        <td className="py-1 font-medium whitespace-nowrap">{rotuloOC(c)}</td>
        <td className="py-1 capitalize">{c.tipo_operacao}</td>
        <td className="py-1 whitespace-nowrap">{dataBr(c.data_referencia)}</td>
        <td className="py-1 text-right tabular-nums">{c.distancia_dias}d</td>
        <td className="py-1">{c.mesma_fazenda ? 'mesma' : (c.fazenda_nome ? 'outra' : '—')}</td>
        <td className="py-1 max-w-[140px] truncate">{c.contraparte_nome ?? '—'}</td>
        <td className="py-1 text-right tabular-nums">{brl(c.valor_acordado)}</td>
        <td className="py-1 max-w-[180px] truncate">
          {comp ? `${comp.descricao ?? rotuloComponente(comp.componente)} · ${brl(comp.valor_total)}` : 'nenhum (será criado)'}
        </td>
        <td className="py-1"><Selo tom={sit.tom} title={sit.title}>{sit.rotulo}</Selo></td>
      </tr>
      {selecionada && escolha && (
        <tr className="border-b bg-amber-50/40 dark:bg-amber-950/20" data-testid="vinc-escolha">
          <td />
          <td colSpan={9} className="py-1.5">
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
