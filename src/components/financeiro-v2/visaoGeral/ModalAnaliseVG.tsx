/**
 * FIN-VISAO-GERAL-01 PR 4 (SPEC §4, §6, §7; mock v8) — o MODAL DE ANÁLISE da Visão Geral. Cobre a barra lateral, tamanho fixo.
 *   · Abre do clique num total ou grupo (card ou grade), na ABA e no nível clicados; cabeçalho: abas Raiz | grupos (posição fixa).
 *   · Esquerda: o resumo da aba (donut, valor, meta, vs meta, período, seguindo o seletor) e a tabela dos filhos da aba com o seletor
 *     `mês | Média do período | Acumulado` e a UNIDADE (só as que o banco diz que valem) → Realizado · Meta · Dif. R$ · %.
 *   · Direita: o gráfico do item (caminho clicável, ‹ › entre irmãos, KPIs) e a tabela dos SUBCENTROS do item (P100: nunca repete a
 *     da esquerda — Custeio · total → todos os subcentros do Custeio; Pecuária → os da Pecuária; um centro → os dele), com a régua
 *     "vs meta" e o "N lanç. ›", que abre a GAVETA DE LANÇAMENTOS (PR 5, `GavetaVG`) na lateral direita do modal, no nó da linha.
 *     Clicar num subcentro põe ele no gráfico (o caminho mostra a cadeia inteira); o centro se escolhe pelo caminho e pelas setas.
 *   · Sem meta: "—". A TELA NUNCA SOMA: todo número vem pronto da `fn_vg_analise`; aqui só se escreve e se desenha.
 *   · REGRA SOBERANA: nada muda de altura ou posição ao trocar aba, item, mês, critério, unidade ou nível — toda lista rola por dentro
 *     do próprio quadro, e o número anterior fica até o novo chegar (nada pisca).
 *   · PR 5 — a gaveta segue o mês e o critério do modal (a mesma janela); Esc fecha a gaveta antes do modal; o lançamento abre no
 *     modal padrão (por cima, pela página) e, salvo, a página sobe a `versao`: modal e gaveta releem o que mostram, no mesmo lugar.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import {
  COR, MESES_ABR, brl, corDoGrupo, corVariacao, mes0De, mil1, n0, pct1, rotuloMes, type AlvoAnaliseVG, type LadoVG,
} from '@/lib/financeiro/visaoGeral';
import { GavetaVG } from '@/components/financeiro-v2/visaoGeral/GavetaVG';
import { alturaTexto, curvaMonotona, larguraTexto, posicionar, trechos, type Caixa, type Ponto } from '@/lib/financeiro/graficoAnaliseVG';
import {
  avisosDaLista, carregarGavetaVG, filtrosDaLista, recarregarGavetaVG, type FiltrosListaVG, type GavetaVG as DadosGavetaVG, type LancamentoGavetaVG,
} from '@/lib/financeiro/visaoGeralGaveta';
import {
  COR_FAIXA, ROTULO_FAIXA, andarEntreIrmaos, carregarAnaliseVG, chaveCaminho, escolherNaDireita, escolherNaEsquerda,
  TITULO_NIVEL_ESQ, estadoInicialAnalise, irParaAba, irParaCaminho, mesmoCaminho, pctVar, posicaoNaRegua, subirNaEsquerda,
  type AnaliseVG, type CaminhoVG, type ContextoAnaliseVG, type CriterioVG, type EstadoAnaliseVG, type LinhaAnaliseVG, type UnidadeVG,
} from '@/lib/financeiro/visaoGeralAnalise';

const COR_META = '#b45309';
const corDoLado = (lado: LadoVG) => (lado === 'saida' ? COR.saida : COR.entrada);
/** a cor de um nó: o grupo pela ordem das abas (a mesma do card e da grade); abaixo, pela posição na própria lista */
const corDaLinha = (d: AnaliseVG, l: { caminho: CaminhoVG; grupo: string | null }, i: number) =>
  corDoGrupo(d.lado, l.caminho.length === 1 ? Math.max(0, d.abas.findIndex((a) => a.grupo === l.grupo)) : i);

export function ModalAnaliseVG({ alvo, ctx, rotuloContas, recorte = '', versao = 0, inicial, onFechar, onLancamentos, onAbrirLancamento, onVerNaLista }: {
  alvo: AlvoAnaliseVG; ctx: ContextoAnaliseVG; rotuloContas: string; onFechar: () => void;
  /** fazenda · atividade da tela (o contexto da gaveta) */
  recorte?: string;
  /** sobe quando um lançamento foi salvo: modal e gaveta releem o que mostram (sem F5, sem perder o lugar) */
  versao?: number;
  /** a volta da lista de Lançamentos: o modal e a gaveta onde estavam */
  inicial?: { estado: EstadoAnaliseVG; gaveta: CaminhoVG | null };
  /** "N lanç. ›" — a gaveta abriu neste nó (quem chama pode guardar o lugar) */
  onLancamentos?: (caminho: CaminhoVG, e: EstadoAnaliseVG) => void;
  /** clique num lançamento da gaveta — SEMPRE o `lancamento_id` (a parte 2+ da divisão tem a chave "id#2") */
  onAbrirLancamento?: (lancamentoId: string, l: LancamentoGavetaVG) => void;
  /** "Ver na lista de Lançamentos ›" — os filtros equivalentes e o lugar para voltar */
  onVerNaLista?: (f: FiltrosListaVG, volta: { estado: EstadoAnaliseVG; gaveta: CaminhoVG }) => void;
}) {
  const [e, setE] = useState<EstadoAnaliseVG>(() => inicial?.estado ?? estadoInicialAnalise(alvo.lado, alvo.grupo, alvo.am));
  const [d, setD] = useState<AnaliseVG | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ctxChave = JSON.stringify(ctx);
  /* PR 5 — a gaveta: o nó (a janela é a do modal: mês e critério) e o que o banco devolveu, página a página */
  const [gaveta, setGaveta] = useState<CaminhoVG | null>(inicial?.gaveta ?? null);
  const [dg, setDg] = useState<DadosGavetaVG | null>(null);
  const [gCarregando, setGCarregando] = useState(false);
  const [gErro, setGErro] = useState<string | null>(null);
  const gChave = gaveta ? JSON.stringify([gaveta, e.lado, e.am, e.criterio]) : '';
  const paginasRef = useRef(1);
  const ultimaChaveG = useRef('');

  useEffect(() => {
    let vivo = true;
    carregarAnaliseVG(ctx, e).then((x) => {
      if (!vivo) return;
      setErro(null);
      /* a unidade que o novo foco não aceita volta para R$ (o banco diz quais valem) */
      if (x.unidades.some((u) => u.id === e.unidade && !u.valida)) { setE((s) => ({ ...s, unidade: 'rs' })); return; }
      setD(x);
    }).catch((err: Error) => { if (vivo) setErro(err.message); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxChave, JSON.stringify(e), versao]);

  /* a gaveta: troca de nó, mês ou critério pede a 1ª página; o salvar de um lançamento (versao) relê as páginas já abertas */
  useEffect(() => {
    if (!gaveta) { setDg(null); ultimaChaveG.current = ''; return; }
    let vivo = true;
    const mesmoNo = ultimaChaveG.current === gChave + ctxChave;
    ultimaChaveG.current = gChave + ctxChave;
    if (!mesmoNo) paginasRef.current = 1;
    setGCarregando(true);
    const pedido = { lado: e.lado, caminho: gaveta, am: e.am, criterio: e.criterio };
    (mesmoNo ? recarregarGavetaVG(ctx, pedido, paginasRef.current) : carregarGavetaVG(ctx, pedido)).then((x) => {
      if (!vivo) return;
      setGErro(null); setDg(x);
    }).catch((err: Error) => { if (vivo) setGErro(err.message); }).finally(() => { if (vivo) setGCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gChave, ctxChave, versao]);

  const maisDaGaveta = () => {
    if (!gaveta || !dg || gCarregando) return;
    setGCarregando(true);
    carregarGavetaVG(ctx, { lado: e.lado, caminho: gaveta, am: e.am, criterio: e.criterio }, dg.pagina + 1).then((x) => {
      paginasRef.current = x.pagina;
      setDg((atual) => (atual ? { ...x, linhas: [...atual.linhas, ...x.linhas] } : x));
    }).catch((err: Error) => setGErro(err.message)).finally(() => setGCarregando(false));
  };

  const lado = e.lado;
  const raizRotulo = lado === 'saida' ? 'Saídas' : 'Entradas';
  /* P100 v4 — o nível que a esquerda mostra (do banco; enquanto não chega, o da seleção) e se há para onde subir ("‹") */
  const nivelEsq: CaminhoVG = d?.tabela.nivel ?? (e.foco.length >= 3 ? e.foco.slice(0, 2) : e.foco);
  const podeSubir = nivelEsq.length > (e.aba ? 1 : 0);
  const tituloEsq = `${TITULO_NIVEL_ESQ[Math.min(nivelEsq.length, 2)]} · ${d?.tabela.total?.rotulo ?? ''}`;
  /* a seleção é um centro: a coluna "Centro" da direita some */
  const comCentro = e.foco.length < 3;
  const lancar = (c: CaminhoVG) => { setGaveta(c); onLancamentos?.(c, e); };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content aria-describedby={undefined} data-testid="modal-analise"
          className="fixed left-1/2 top-1/2 z-50 flex h-[calc(100vh-16px)] max-h-[940px] w-[calc(100vw-16px)] max-w-[1520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-[#f4f6f9] text-[10px] shadow-2xl"
          data-gaveta={gaveta ? chaveCaminho(gaveta) : undefined}
          onEscapeKeyDown={(ev) => { if (gaveta) { ev.preventDefault(); setGaveta(null); } }}>
          <DialogPrimitive.Title className="sr-only">Análise de {raizRotulo.toLowerCase()}</DialogPrimitive.Title>
          {/* abaixo de 1000px a Visão Geral não tem desenho (rola de lado): o modal também — largura mínima de 984px, nada cortado.
              PR 5: quem rola é esta caixa (não o modal), para a gaveta ficar presa à borda direita da janela */}
          <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden" data-testid="analise-rolagem-lateral">
          <div className="flex h-full min-w-[984px] flex-col">
          {/* CABEÇALHO — abas na ordem do banco (a lista não muda ao clicar: a posição de cada uma é fixa) */}
          <div className="flex h-9 shrink-0 items-center gap-2 bg-[#2f3d4f] px-2.5 text-white">
            <div className="uma-linha-que-rola flex min-w-0 flex-1 items-center gap-1" data-testid="analise-abas">
              <AbaBotao ativa={e.aba === null} forte onClick={() => setE(irParaAba(e, null))} testid="analise-aba-raiz">{raizRotulo}</AbaBotao>
              <span className="mx-1 h-[18px] w-px shrink-0 bg-[#7d8ba1]" />
              {(d?.abas ?? []).map((a) => (
                <AbaBotao key={a.grupo} ativa={e.aba === a.grupo} onClick={() => setE(irParaAba(e, a.grupo))} testid={`analise-aba-${a.grupo}`}>{a.rotulo}</AbaBotao>
              ))}
            </div>
            <span className="shrink-0 whitespace-nowrap text-[10px] text-[#d5dce6]" data-testid="analise-contexto">
              {rotuloMes(ctx.de.slice(0, 7))} – {rotuloMes(ctx.ate.slice(0, 7))} · {rotuloContas}
            </span>
            <DialogPrimitive.Close aria-label="Fechar" data-testid="analise-fechar"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#8a98ab] text-white hover:bg-white/10"><X className="h-3.5 w-3.5" /></DialogPrimitive.Close>
          </div>

          {erro && <div className="shrink-0 bg-[#fdecea] px-3 py-1 text-[10px] text-[#b3261e]" data-testid="analise-erro">{erro}</div>}

          <div className="grid min-h-0 flex-1 gap-2 p-2" style={{ gridTemplateColumns: 'minmax(400px, 0.9fr) minmax(0, 1.1fr)' }}>
            {/* ESQUERDA */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <Resumo d={d} e={e} rotuloContas={rotuloContas} />
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white" data-testid="analise-tabela" data-desloca="">
                <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 px-2">
                  {/* P100 v4 — "‹ Centros · Pecuária": o "‹" tem lugar reservado (apagado quando não há para onde subir) */}
                  <div className="flex min-w-0 items-center gap-1">
                    <button type="button" aria-label="Voltar um nível" title="Voltar um nível" disabled={!podeSubir} data-testid="analise-tabela-subir"
                      onClick={() => setE(subirNaEsquerda(e, nivelEsq))}
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border border-[#cfd6df] bg-white text-[12px] leading-none disabled:invisible">‹</button>
                    <span className="uma-linha-que-rola min-w-0 text-[11px] font-bold" title={tituloEsq} data-testid="analise-tabela-titulo">{tituloEsq}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Segmentado<CriterioVG> altura={20} fonte={9.5} valor={e.criterio} onEscolher={(c) => setE({ ...e, criterio: c })} opcoes={[
                      { valor: 'mes', rotulo: <span className="inline-block w-[36px] text-center">{rotuloMes(e.am)}</span>, title: 'O mês escolhido' },
                      { valor: 'media', rotulo: 'Média', title: 'Média do período: do início do período até o mês escolhido' },
                      { valor: 'acumulado', rotulo: 'Acum.', title: 'Acumulado: a soma do início do período até o mês escolhido' }]} />
                    <SeletorUnidade d={d} valor={e.unidade} onEscolher={(u) => setE({ ...e, unidade: u })} />
                  </div>
                </div>
                {/* a tabela: cabeçalho e a linha do total presos (thead), as linhas rolam por dentro; o nome longo termina em "…" com o title */}
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="analise-tabela-lista">
                  <table className="w-full table-fixed border-collapse">
                    <Colunas larguras={LARG_ESQ} />
                    <thead className="sticky top-0 z-[1] bg-white">
                      <Cabecalho rotulos={[['GRUPO', 'ATIVIDADE', 'CENTRO'][Math.min(nivelEsq.length, 2)], rotuloCriterio(e), 'META', 'DIF. R$', '%']} />
                      {d?.tabela.total && <LinhaEsquerda d={d} l={d.tabela.total} i={-1} forte ativa={mesmoCaminho(e.foco, d.tabela.total.caminho)}
                        onClick={() => setE(escolherNaEsquerda(e, d.tabela.total!.caminho))} />}
                    </thead>
                    <tbody>
                      {d?.tabela.linhas.map((l, i) => (
                        <LinhaEsquerda key={chaveCaminho(l.caminho)} d={d} l={l} i={i} ativa={mesmoCaminho(e.foco, l.caminho)}
                          onClick={() => setE(escolherNaEsquerda(e, l.caminho))} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* DIREITA */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <section className="flex min-h-[150px] flex-1 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white px-2 pb-1 pt-1.5" data-testid="analise-grafico" data-desloca="">
                <div className="grid h-[26px] shrink-0 items-center gap-1.5" style={{ gridTemplateColumns: '22px minmax(0, 1fr) 22px' }}>
                  <BotaoSeta rotulo="Anterior" testid="analise-anterior" desligado={(d?.grafico.irmaos.length ?? 0) < 2}
                    onClick={() => d && setE(andarEntreIrmaos(e, d.grafico.irmaos, -1))}>‹</BotaoSeta>
                  {/* P100 — o caminho com respiro: "Saídas › Custeio › Pecuária › Mão de Obra" (o › em cinza, um espaço de cada lado) */}
                  <div className="uma-linha-que-rola flex min-w-0 items-center" data-testid="analise-caminho">
                    {(d?.grafico.caminho ?? []).map((p, j, arr) => j < arr.length - 1 ? (
                      <Fragment key={chaveCaminho(p.caminho)}>
                        <button type="button" className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground hover:text-[#1f5fa8]"
                          onClick={() => setE(irParaCaminho(e, p.caminho))} data-testid={`analise-caminho-${j}`}>{p.rotulo}</button>
                        <span aria-hidden className="shrink-0 whitespace-pre text-[10px] text-[#9aa5b4]" data-testid="analise-caminho-sep">{' › '}</span>
                      </Fragment>
                    ) : (
                      <span key={chaveCaminho(p.caminho)} className="shrink-0 whitespace-nowrap text-[12.5px] font-bold" data-testid="analise-caminho-atual">
                        {p.rotulo}{p.caminho.length === (e.aba ? 1 : 0) ? ' · total' : ''}
                      </span>
                    ))}
                  </div>
                  <BotaoSeta rotulo="Próximo" testid="analise-proximo" desligado={(d?.grafico.irmaos.length ?? 0) < 2}
                    onClick={() => d && setE(andarEntreIrmaos(e, d.grafico.irmaos, 1))}>›</BotaoSeta>
                </div>
                <Kpis d={d} e={e} />
                <GraficoItem d={d} e={e} onSel={(am) => setE({ ...e, am })} />
              </section>

              <section className="flex h-[clamp(150px,44%,270px)] shrink-0 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white" data-testid="analise-foco" data-desloca="">
                <div className="flex h-[26px] shrink-0 items-center justify-between gap-2 px-2">
                  <span className="uma-linha-que-rola min-w-0 text-[11px] font-bold" title={`Subcentros · ${d?.foco.total?.rotulo ?? ''}`} data-testid="analise-foco-titulo">Subcentros · {d?.foco.total?.rotulo ?? ''}</span>
                  <Regua lado={lado} razao={d?.grafico.item?.razao ?? null} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="analise-foco-lista">
                  <table className="w-full table-fixed border-collapse">
                    <Colunas larguras={comCentro ? LARG_DIR : LARG_DIR.slice(1)} />
                    {/* a coluna "Centro" some quando a seleção é um centro (de propósito): o cabeçalho da direita é livre no gate de deslocamento */}
                    <thead className="sticky top-0 z-[1] bg-white" data-desloca-livre="">
                      <Cabecalho rotulos={['SUBCENTRO', ...(comCentro ? ['CENTRO'] : []), rotuloCriterio(e), 'META', 'DIF. R$', '%', 'LANÇ.']} />
                      {d?.foco.total && <LinhaDireita d={d} l={d.foco.total} forte comCentro={comCentro} ativa={!e.grafico} onClick={() => setE({ ...e, grafico: null })} onLanc={lancar} />}
                    </thead>
                    <tbody>
                      {d?.foco.linhas.map((l, i) => (
                        <LinhaDireita key={chaveCaminho(l.caminho)} d={d} l={l} i={i} comCentro={comCentro} ativa={mesmoCaminho(e.grafico, l.caminho)}
                          onClick={() => setE(escolherNaDireita(e, l.caminho))} onLanc={lancar} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
          </div>
          </div>
          {gaveta && (
            <GavetaVG g={dg} caminho={gaveta} carregando={gCarregando} erro={gErro}
              contexto={[rotuloContas, recorte].filter(Boolean).join(' · ')} avisos={avisosDaLista(ctx, dg)}
              onIr={setGaveta} onFechar={() => setGaveta(null)} onMais={maisDaGaveta}
              onAbrirLancamento={(l) => onAbrirLancamento?.(l.lancamento_id, l)}
              onVerNaLista={() => dg && onVerNaLista?.(filtrosDaLista(ctx, dg, gaveta), { estado: e, gaveta })} />
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

const rotuloCriterio = (e: EstadoAnaliseVG) => (e.criterio === 'mes' ? rotuloMes(e.am).toUpperCase() : e.criterio === 'media' ? 'MÉDIA/MÊS' : 'ACUMULADO');

function AbaBotao({ ativa, forte, onClick, testid, children }: { ativa: boolean; forte?: boolean; onClick: () => void; testid: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={ativa}
      className={cn('h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-2.5 text-[10.5px] font-semibold',
        ativa ? 'border-white bg-white text-[#1b2430]' : 'border-[#7d8ba1] bg-transparent text-[#e1e7ef] hover:bg-white/10', forte && 'font-extrabold tracking-[0.02em]')}>
      {children}
    </button>
  );
}

function BotaoSeta({ rotulo, testid, desligado, onClick, children }: { rotulo: string; testid: string; desligado: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={rotulo} data-testid={testid} disabled={desligado} onClick={onClick}
      className="flex h-[22px] w-[22px] items-center justify-center rounded border border-[#cfd6df] bg-white text-[13px] leading-none disabled:opacity-40">{children}</button>
  );
}

/* as colunas (px; o nome leva o resto) — as mesmas no cabeçalho, no total e nas linhas: uma tabela só.
   P100 item 5: cada coluna numérica tem a largura do PIOR caso na fonte do total (negrito, 9,5px, tabular) + 8px de folga —
   "R$ 99.999.999,99" (valor e meta), "−R$ 99.999.999,99" (Dif.), "+999,9%" e o botão "99999 lanç. ›"; a sobra é do nome ("…" + title).
   A direita: subcentro (o resto) · centro (curto, cinza, "…" + title; some quando a seleção é um centro) · os números · lanç. */
/* P113 — o "%" a 54px: "+999,9%" no negrito do total pede ~43px de conteúdo + 8 do padding; com 46 ele saía 4,8px da célula
   (o gate numero-vaza do P92 acusou na régua de saídas) */
const LARG_ESQ = [92, 92, 98, 54];
const LARG_DIR = [50, 92, 92, 98, 54, 66];
function Colunas({ larguras }: { larguras: number[] }) {
  return <colgroup><col />{larguras.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
}

function Cabecalho({ rotulos }: { rotulos: string[] }) {
  return (
    <tr className="h-[18px] bg-[#2f3d4f] text-[7.5px] font-semibold tracking-[0.03em] text-white">
      {/* o 1º com o MESMO recuo do corpo (px-1.5): nada cortado à esquerda */}
      {rotulos.map((r, i) => <th key={i} className={cn('whitespace-nowrap font-semibold', i > 0 ? 'px-1 text-right' : 'px-1.5 text-left', r === 'META' && 'text-[#ffd08a]')}>{r}</th>)}
    </tr>
  );
}

/** valor, meta, Dif. R$ e % — os quatro do banco; sem meta (ou unidade que não vale), "—" */
function Numeros({ d, l, forte }: { d: AnaliseVG; l: LinhaAnaliseVG; forte?: boolean }) {
  const cv = corVariacao(d.lado, l.pct);
  const td = 'whitespace-nowrap px-1 text-right tabular-nums';
  return (
    <>
      <td className={cn(td, forte && 'font-bold')} style={{ color: corDoLado(d.lado) }}>{brl(l.valor)}</td>
      <td className={td} style={{ color: COR_META }}>{brl(l.meta)}</td>
      <td className={cn(td, 'font-semibold')} style={{ color: cv }}>{brl(l.dif)}</td>
      <td className={cn(td, 'font-semibold')} style={{ color: cv }}>{pctVar(l.pct)}</td>
    </>
  );
}

const linhaCls = (forte: boolean | undefined, ativa: boolean) => cn('cursor-pointer border-b border-[#eef1f5] tabular-nums',
  forte ? 'h-[21px] border-b-[#cfd6df] text-[9.5px] font-bold' : 'h-[18px] text-[8.5px]', ativa ? 'bg-[#e8eef7]' : forte ? 'bg-[#f7f8fa]' : 'bg-white hover:bg-muted/40');

function LinhaEsquerda({ d, l, i, forte, ativa, onClick }: { d: AnaliseVG; l: LinhaAnaliseVG; i: number; forte?: boolean; ativa: boolean; onClick: () => void }) {
  const nome = `${l.rotulo}${forte ? ' · total' : ''}`;
  return (
    <tr onClick={onClick} data-testid={forte ? 'analise-tabela-total' : `analise-tabela-linha-${i}`} aria-selected={ativa} className={linhaCls(forte, ativa)}>
      <td className="px-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: forte ? corDoLado(d.lado) : corDaLinha(d, l, i) }} />
          <span className="truncate" title={nome}>{nome}</span>
        </span>
      </td>
      <Numeros d={d} l={l} forte={forte} />
    </tr>
  );
}

function LinhaDireita({ d, l, i = -1, forte, comCentro, ativa, onClick, onLanc }: {
  d: AnaliseVG; l: LinhaAnaliseVG; i?: number; forte?: boolean; comCentro: boolean; ativa: boolean; onClick: () => void; onLanc: (c: CaminhoVG) => void;
}) {
  const nome = `${l.rotulo}${forte ? ' · total' : ''}`;
  return (
    <tr onClick={onClick} aria-selected={ativa} data-testid={forte ? 'analise-foco-total' : `analise-foco-linha-${i}`} className={linhaCls(forte, ativa)}>
      <td className="truncate px-1.5" title={nome}>{nome}</td>
      {comCentro && <td className="truncate px-1 text-[7.5px] font-normal text-muted-foreground" title={l.centro ?? undefined} data-testid={forte ? undefined : `analise-foco-centro-${i}`}>{forte ? '' : l.centro ?? ''}</td>}
      <Numeros d={d} l={l} forte={forte} />
      <td className="px-1.5 text-right">
        <button type="button" className="h-[15px] whitespace-nowrap rounded-[3px] border border-[#cfd6df] bg-white px-1 text-[8px] font-normal tabular-nums hover:border-[#1f5fa8] hover:text-[#1f5fa8]"
          onClick={(ev) => { ev.stopPropagation(); onLanc(l.caminho); }} data-testid={forte ? 'analise-lanc-total' : `analise-lanc-${i}`}>{l.qtd} lanç. ›</button>
      </td>
    </tr>
  );
}

function SeletorUnidade({ d, valor, onEscolher }: { d: AnaliseVG | null; valor: UnidadeVG; onEscolher: (u: UnidadeVG) => void }) {
  const [aberto, setAberto] = useState(false);
  const atual = d?.unidades.find((u) => u.id === valor)?.rotulo ?? 'R$';
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="analise-unidade" title="Unidade"
          className="flex h-5 w-[118px] shrink-0 items-center justify-between rounded border border-[#cfd6df] bg-white px-1.5 text-[9.5px]">
          <span className="truncate" title={atual}>{atual}</span><ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[150px] p-1" data-testid="analise-unidade-lista">
        {(d?.unidades ?? []).map((u) => (
          <button key={u.id} type="button" disabled={!u.valida} onClick={() => { onEscolher(u.id); setAberto(false); }} data-testid={`analise-unidade-${u.id}`}
            title={u.valida ? undefined : 'Sem denominador para este nível'}
            className={cn('flex h-[22px] w-full items-center rounded px-2 text-left text-[10px] disabled:cursor-default disabled:text-muted-foreground/60',
              u.id === valor ? 'bg-[#e8eef7] font-semibold' : 'hover:bg-muted/50')}>{u.rotulo}</button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Resumo({ d, e, rotuloContas }: { d: AnaliseVG | null; e: EstadoAnaliseVG; rotuloContas: string }) {
  const r = d?.resumo ?? null;
  const lado = e.lado;
  const raiz = lado === 'saida' ? 'SAÍDAS' : 'ENTRADAS';
  const per = d ? (e.criterio === 'mes' ? rotuloMes(e.am) : `${rotuloMes(d.periodo.de)}–${rotuloMes(e.am)} (${d.meses_janela}m)`) : '';
  return (
    <section className="flex h-[86px] shrink-0 items-center gap-3 rounded-md border border-[#dfe4ea] bg-white px-2.5" data-testid="analise-resumo" data-desloca="">
      <Donut d={d} centro={r ? (e.aba === null ? valorNoFuro(r.valor_rs) : pct1(r.pct_da_raiz)) : ''} inteiro={r && e.aba === null ? brl(r.valor_rs) : undefined}
        legenda={e.aba === null ? raiz : `DAS ${raiz}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[8.5px] font-semibold tracking-[0.04em] text-muted-foreground" title={`${r?.rotulo ?? ''} · ${rotuloCriterio(e)} · ${rotuloContas}`}>
          {(r?.rotulo ?? '').toUpperCase()} · {rotuloCriterio(e)}{e.criterio !== 'mes' ? ` ${per.toUpperCase()}` : ''} · {rotuloContas.toUpperCase()}
        </span>
        <span className="whitespace-nowrap text-[19px] font-bold tabular-nums" style={{ color: corDoLado(lado) }} data-testid="analise-resumo-valor">{brl(r?.valor)}</span>
        <div className="flex gap-3.5">
          <Kpi rotulo={e.criterio === 'mes' ? `META ${rotuloMes(e.am).toUpperCase()}` : e.criterio === 'media' ? 'META/MÊS' : 'META ACUMULADA'} testid="analise-resumo-meta">
            <span style={{ color: COR_META }}>{brl(r?.meta)}</span></Kpi>
          <Kpi rotulo="VS META" testid="analise-resumo-vsmeta">
            <span style={{ color: corVariacao(lado, r?.pct) }}>{r?.pct == null ? '—' : `${pctVar(r.pct)} · ${brl(r.dif)}`}</span></Kpi>
          <Kpi rotulo="PERÍODO" testid="analise-resumo-periodo"><span>{per}</span></Kpi>
        </div>
      </div>
    </section>
  );
}

function Kpi({ rotulo, testid, children, direita }: { rotulo: string; testid: string; children: React.ReactNode; direita?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-px', direita && 'items-end')}>
      <small className="whitespace-nowrap text-[8px] tracking-[0.04em] text-muted-foreground">{rotulo}</small>
      <b className="whitespace-nowrap text-[10.5px] tabular-nums" data-testid={testid}>{children}</b>
    </div>
  );
}

/** P100 item 5 — o valor no furo do donut, curto: "15,6 mi" / "999 mil" / "850" (o inteiro vai no title); a fonte ainda encolhe para
    caber nos 34px do furo — nunca vaza */
const FURO = 34;
const valorNoFuro = (v: number | null | undefined) => {
  if (v == null) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  const f = (x: number, c: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  return a >= 1e6 ? `${s}${f(a / 1e6, 1)} mi` : a >= 1e3 ? `${s}${f(Math.round(a / 1e3), 0)} mil` : `${s}${f(Math.round(a), 0)}`;
};
/** donut das fatias que o banco mandou (a parte de cada filho, em %); o centro: o total (raiz) ou a parte da aba na raiz */
function Donut({ d, centro, legenda, inteiro }: { d: AnaliseVG | null; centro: string; legenda: string; inteiro?: string }) {
  const fonte = Math.min(9.5, FURO / Math.max(1, larguraTexto(centro, 1)));
  const R = 30, r = 20, C = 36;
  let a0 = -Math.PI / 2;
  const fatias = (d?.resumo?.fatias ?? []).filter((f) => (f.pct ?? 0) > 0);
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0" data-testid="analise-donut">
      <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="#eef1f5" strokeWidth={R - r} />
      {d && fatias.map((f, i) => {
        const a1 = a0 + (Math.min(99.99, f.pct ?? 0) / 100) * Math.PI * 2;
        const grande = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a: number, rr: number) => `${C + rr * Math.cos(a)} ${C + rr * Math.sin(a)}`;
        const path = `M${p(a0, R)} A${R} ${R} 0 ${grande} 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 ${grande} 0 ${p(a0, r)} Z`;
        const cor = corDaLinha(d, f, i);
        a0 = a1;
        return <path key={chaveCaminho(f.caminho)} d={path} fill={cor}><title>{`${f.rotulo}: ${pct1(f.pct)}`}</title></path>;
      })}
      <text x={C} y={C} textAnchor="middle" fontSize={fonte} fontWeight={700} fill="#1b2430" data-testid="analise-donut-centro" data-cabe-em={FURO}>
        {centro}{inteiro && <title>{inteiro}</title>}</text>
      <text x={C} y={C + 9} textAnchor="middle" fontSize={6} fill={COR.muted}>{legenda}</text>
    </svg>
  );
}

function Kpis({ d, e }: { d: AnaliseVG | null; e: EstadoAnaliseVG }) {
  const k = d?.grafico.kpis ?? null;
  const lado = e.lado;
  /* P103 — no ACUMULADO (111954) as colunas e a meta são acumuladas mês a mês e não há linha da média: os KPIs são o acumulado até o
     mês, a meta acumulada e o vs meta (do banco) */
  const acum = e.criterio === 'acumulado';
  return (
    <div className="flex h-[30px] shrink-0 items-center justify-between gap-3">
      {acum ? (
        <div className="flex gap-3">
          <Kpi rotulo={`ACUMULADO ATÉ ${rotuloMes(e.am).toUpperCase()}`} testid="analise-kpi-mes"><span style={{ color: corDoLado(lado) }}>{brl(k?.mes)}</span></Kpi>
          <Kpi rotulo="META ACUMULADA" testid="analise-kpi-meta"><span style={{ color: COR_META }}>{brl(k?.meta)}</span></Kpi>
          <Kpi rotulo="VS META" testid="analise-kpi-vsmeta"><span style={{ color: corVariacao(lado, k?.vs_meta) }}>{pctVar(k?.vs_meta)}</span></Kpi>
        </div>
      ) : (
        <div className="flex gap-3">
          <Kpi rotulo={rotuloMes(e.am).toUpperCase()} testid="analise-kpi-mes"><span style={{ color: corDoLado(lado) }}>{brl(k?.mes)}</span></Kpi>
          <Kpi rotulo="MÉDIA/MÊS" testid="analise-kpi-media"><span>{brl(k?.media)}</span></Kpi>
          <Kpi rotulo="VS META" testid="analise-kpi-vsmeta"><span style={{ color: corVariacao(lado, k?.vs_meta) }}>{pctVar(k?.vs_meta)}</span></Kpi>
          <Kpi rotulo="TENDÊNCIA" testid="analise-kpi-tendencia"><span style={{ color: corVariacao(lado, k?.tendencia) }}>{pctVar(k?.tendencia)}</span></Kpi>
        </div>
      )}
      <div className="hidden items-center gap-2 text-[8.5px] text-muted-foreground xl:flex" data-testid="analise-legenda">
        <span className="flex items-center gap-1"><i className="h-2 w-2" style={{ background: lado === 'saida' ? COR.barraSai : COR.barraEnt }} />{acum ? 'realizado acum.' : 'realizado'}</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2" style={{ background: lado === 'saida' ? COR.barraSaiP : COR.barraEntP }} />{acum ? 'previsto acum.' : 'previsto'}</span>
        {!acum && <span className="flex items-center gap-1"><i className="w-3.5 border-t-2" style={{ borderColor: lado === 'saida' ? COR.mediaSai : COR.mediaEnt }} />média acumulada</span>}
        <span className="flex items-center gap-1"><i className="w-3.5 border-t-2 border-dotted" style={{ borderColor: COR.meta }} />{acum ? 'meta acumulada' : 'meta'}</span>
      </div>
    </div>
  );
}

const passoBonito = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

/** o gráfico do item: colunas por mês (realizado cheio, previsto claro), a média acumulada (curva) e a meta (pontilhado laranja) — os
    pontos são os do banco, na unidade escolhida; clicar numa coluna escolhe o mês.
    P100 — o VALOR DA COLUNA no meio da altura dela (vertical, 6px); coluna baixa demais para o texto: logo acima dela. As LINHAS são
    curvas monotônicas (passam pelos pontos do banco, sem "barriga" entre dois meses), com marcador em cada mês e o valor escrito: a
    média acima do marcador (vinho), a meta em laranja (acima; se colidir, abaixo). Nenhum rótulo encosta em outro nem sai da área do
    gráfico (`posicionar`): sem lugar, não se escreve — o valor segue no title da coluna. */
const FONTE_COLUNA = 6;
const FONTE_PONTO = 6.5;
function GraficoItem({ d, e, onSel }: { d: AnaliseVG | null; e: EstadoAnaliseVG; onSel: (am: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [[W, H], setTam] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setTam([el.clientWidth, el.clientHeight]);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const serie = d?.grafico.serie ?? [];
  const saida = e.lado === 'saida';
  let svg: JSX.Element | null = null;
  if (W > 0 && H > 0 && serie.length) {
    const vals = serie.flatMap((p) => [p.realizado, p.previsto, p.total, p.media, p.meta]).filter((x): x is number => x != null);
    const mx = Math.max(1, ...vals), mn = Math.min(0, ...vals);
    const passo = passoBonito((mx - mn) / 4 || 1);
    const topo = Math.ceil(mx / passo) * passo, base = Math.floor(mn / passo) * passo;
    /* escrita curta do eixo, da coluna e dos pontos: R$ mil ("k") quando a escala passa de 10 mil; senão o inteiro */
    const curto = (v: number) => (Math.max(Math.abs(topo), Math.abs(base)) >= 10000 ? `${mil1(v)}k` : n0(v));
    /* P103 — a margem do eixo cabe o MAIOR rótulo dele (no acumulado o eixo chega a "100.000,0k"): nunca menos de 44px */
    const L = Math.max(44, Math.ceil(Math.max(larguraTexto(curto(topo), 8), larguraTexto(curto(base), 8))) + 6);
    const Rm = 6, T = 8, B = 14, iw = W - L - Rm, ih = H - T - B, n = serie.length, slot = iw / n;
    const Y = (v: number) => T + ih - ((v - base) / (topo - base || 1)) * ih;
    const X = (k: number) => L + (k + 0.5) * slot;
    const bw = Math.max(3, Math.min(26, slot * 0.6));
    const area: Caixa = { x: L, y: T, w: iw, h: ih };
    const postos: Caixa[] = [];
    const els: JSX.Element[] = [];
    const rotulos: JSX.Element[] = [];
    for (let v = base; v <= topo + passo / 2; v += passo) {
      els.push(<line key={`g${v}`} x1={L} x2={L + iw} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? '#9aa5b4' : '#eef1f5'} />);
      els.push(<text key={`t${v}`} x={L - 4} y={Y(v) + 3} fontSize={8} textAnchor="end" fill={COR.muted}>{curto(v)}</text>);
    }
    serie.forEach((p, k) => {
      const ehSel = p.am === e.am;
      if (ehSel) els.push(<rect key={`s${k}`} x={L + k * slot} y={T} width={slot} height={ih} fill="#e8eef7" />);
      const r = p.realizado ?? 0, pv = p.previsto ?? 0;
      if (r) els.push(<rect key={`r${k}`} x={X(k) - bw / 2} y={Math.min(Y(r), Y(0))} width={bw} height={Math.abs(Y(r) - Y(0))} fill={saida ? COR.barraSai : COR.barraEnt} />);
      /* o previsto empilhado sobre o realizado até o TOTAL que o banco mandou (a tela não soma) */
      if (pv && p.total != null) els.push(<rect key={`p${k}`} x={X(k) - bw / 2} y={Math.min(Y(p.total), Y(r))} width={bw} height={Math.abs(Y(p.total) - Y(r))} fill={saida ? COR.barraSaiP : COR.barraEntP} data-testid={`analise-previsto-${p.am}`} />);
      els.push(<text key={`m${k}`} x={X(k)} y={H - 3} fontSize={8} textAnchor="middle" fill={ehSel ? '#1b2430' : COR.muted} fontWeight={ehSel ? 700 : 400}>{MESES_ABR[mes0De(p.am)]}</text>);
    });
    /* as linhas: curva monotônica por trecho (mês sem ponto quebra a linha) e o marcador em cada mês */
    const pontos = (chave: 'media' | 'meta') => serie.map((p, k) => (p[chave] == null ? null : [X(k), Y(p[chave]!)] as Ponto));
    const corMedia = saida ? COR.mediaSai : COR.mediaEnt;
    const md = pontos('media'), mt = pontos('meta');
    const tm = trechos(md), tt = trechos(mt);
    if (tm.some((t) => t.length > 1)) els.push(<path key="md" d={tm.map(curvaMonotona).join(' ')} fill="none" stroke={corMedia} strokeWidth={1.6} data-testid="analise-linha-media" />);
    if (tt.some((t) => t.length > 1)) els.push(<path key="mt" d={tt.map(curvaMonotona).join(' ')} fill="none" stroke={COR.meta} strokeWidth={1.6} strokeDasharray="2 3" data-testid="analise-linha-meta" />);
    serie.forEach((p, k) => {
      ([['media', md[k], corMedia], ['meta', mt[k], COR.meta]] as const).forEach(([qual, q, cor]) => {
        if (!q) return;
        els.push(<circle key={`${qual}${k}`} cx={q[0]} cy={q[1]} r={1.9} fill="#fff" stroke={cor} strokeWidth={1.2}
          data-testid={`analise-ponto-${qual}-${p.am}`} data-valor={p[qual]!} />);
      });
    });
    /* os rótulos: primeiro os dos pontos (média acima; meta acima, ou abaixo se colidir), depois o da coluna (no meio dela; sem
       lugar no meio — coluna baixa ou um ponto em cima —, logo acima da coluna) */
    const rotuloPonto = (qual: 'media' | 'meta', k: number, q: Ponto, cor: string, v: number) => {
      const t = curto(v), w = larguraTexto(t, FONTE_PONTO), h = alturaTexto(FONTE_PONTO);
      const x = Math.min(Math.max(q[0] - w / 2, L), L + iw - w);
      const acima: Caixa = { x, y: q[1] - 2.5 - h, w, h }, abaixo: Caixa = { x, y: q[1] + 2.5, w, h };
      const i = posicionar([acima, abaixo], postos, area);
      if (i < 0) return;
      const c = i === 0 ? acima : abaixo;
      rotulos.push(<text key={`l${qual}${k}`} x={c.x + w / 2} y={c.y + h / 2} fontSize={FONTE_PONTO} textAnchor="middle" dominantBaseline="central" fill={cor} fontWeight={600}
        stroke="#fff" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke"
        data-rotulo={qual} data-lugar={i === 0 ? 'acima' : 'abaixo'} data-testid={`analise-rotulo-${qual}-${serie[k].am}`}>{t}</text>);
    };
    serie.forEach((p, k) => {
      if (md[k] && p.media != null) rotuloPonto('media', k, md[k]!, corMedia, p.media);
      if (mt[k] && p.meta != null) rotuloPonto('meta', k, mt[k]!, COR.meta, p.meta);
    });
    serie.forEach((p, k) => {
      if (!p.total) return;
      const t = curto(p.total), comp = larguraTexto(t, FONTE_COLUNA), w = alturaTexto(FONTE_COLUNA);
      const yTopo = Math.min(Y(p.total), Y(0)), yBase = Math.max(Y(p.total), Y(0)), alt = yBase - yTopo;
      const meio: Caixa = { x: X(k) - w / 2, y: (yTopo + yBase) / 2 - comp / 2, w, h: comp };
      const acima: Caixa = { x: X(k) - w / 2, y: yTopo - 2 - comp, w, h: comp };
      const cabe = bw >= w && alt >= comp + 4;
      const i = posicionar(cabe ? [meio, acima] : [acima], postos, area);
      if (i < 0) return;
      const c = cabe && i === 0 ? meio : acima;
      const dentroDaColuna = c === meio;
      /* no previsto (claro) o branco some: o texto vai escuro */
      const cor = !dentroDaColuna ? '#1b2430' : (p.previsto ?? 0) > (p.realizado ?? 0) ? '#5b1f1d' : '#fff';
      const cx = c.x + w / 2, cy = c.y + comp / 2;
      rotulos.push(<text key={`v${k}`} x={cx} y={cy} fontSize={FONTE_COLUNA} textAnchor="middle" dominantBaseline="central" fill={cor}
        transform={`rotate(-90 ${cx} ${cy})`} data-rotulo="coluna" data-lugar={dentroDaColuna ? 'meio' : 'acima'}
        data-testid={`analise-rotulo-coluna-${p.am}`}>{t}</text>);
    });
    serie.forEach((p, k) => els.push(
      <rect key={`c${k}`} x={L + k * slot} y={T} width={slot} height={ih + B} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSel(p.am)} data-testid={`analise-coluna-${p.am}`}>
        <title>{`${rotuloMes(p.am)}: ${brl(p.total)}${p.media != null ? ` · média ${brl(p.media)}` : ''}${p.meta != null ? ` · meta ${brl(p.meta)}` : ''}`}</title>
      </rect>));
    svg = <svg width={W} height={H} className="block" data-testid="analise-grafico-svg">{els}<g style={{ pointerEvents: 'none' }}>{rotulos}</g></svg>;
  }
  return (
    <div ref={ref} className="relative min-h-0 flex-1" data-testid="analise-grafico-desenho">
      {svg}
      {d && serie.length === 0 && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground" data-testid="analise-grafico-vazio">
          {d.grafico.item && !d.grafico.item.unidade_valida ? 'Sem denominador nesta unidade para este item' : 'Sem lançamentos no período'}
        </span>
      )}
    </div>
  );
}

/** a régua "vs meta" do item do gráfico: as quatro faixas (cortes do banco) e a marca na razão valor/meta que o banco mandou.
    P103 — a MARCA fica FORA da faixa (um triângulo acima apontando para baixo e outro abaixo apontando para cima): nunca cobre o
    rótulo. Os rótulos são curtos (`ROTULO_FAIXA`) e cabem em toda faixa — o gate de cortes mede cada um */
function Regua({ lado, razao }: { lado: LadoVG; razao: number | null }) {
  const pos = posicaoNaRegua(lado, razao);
  const nomes = ROTULO_FAIXA[lado];
  const larg = { boa: 36, ideal: 18, risco: 18, critica: 28 } as const;
  const tri = 'absolute h-0 w-0 -translate-x-1/2 border-x-[4px] border-x-transparent';
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-muted-foreground" data-testid="analise-regua">
      vs meta
      <div className="relative flex h-3 w-[180px] rounded-[3px] text-center text-[7.5px] leading-3">
        {(['boa', 'ideal', 'risco', 'critica'] as const).map((f) => (
          <span key={f} className="block overflow-hidden whitespace-nowrap first:rounded-l-[3px] last:rounded-r-[3px]" data-testid={`analise-regua-faixa-${f}`}
            style={{ width: `${larg[f]}%`, background: COR_FAIXA[f].fundo, color: COR_FAIXA[f].texto }}>{nomes[f]}</span>
        ))}
        {pos != null && <>
          <span className={cn(tri, '-top-[5px] border-t-[5px] border-t-[#1b2430]')} style={{ left: `${pos}%` }} data-testid="analise-regua-marca" />
          <span className={cn(tri, '-bottom-[5px] border-b-[5px] border-b-[#1b2430]')} style={{ left: `${pos}%` }} data-testid="analise-regua-marca-baixo" />
        </>}
      </div>
    </div>
  );
}
