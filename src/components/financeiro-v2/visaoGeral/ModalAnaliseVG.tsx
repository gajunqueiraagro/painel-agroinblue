/**
 * FIN-VISAO-GERAL-01 PR 4 (SPEC §4, §6, §7; mock v8) — o MODAL DE ANÁLISE da Visão Geral. Cobre a barra lateral, tamanho fixo.
 *   · Abre do clique num total ou grupo (card ou grade), na ABA e no nível clicados; cabeçalho: abas Raiz | grupos (posição fixa).
 *   · Esquerda: o resumo da aba (donut, valor, meta, vs meta, período, seguindo o seletor) e a tabela dos filhos da aba com o seletor
 *     `mês | Média do período | Acumulado` e a UNIDADE (só as que o banco diz que valem) → Realizado · Meta · Dif. R$ · %.
 *   · Direita: o gráfico do item (caminho clicável, ‹ › entre irmãos, KPIs) e a tabela do nível de baixo, com a régua "vs meta" e o
 *     "N lanç. ›" (por ora só registra a intenção — a gaveta é frente própria).
 *   · Sem meta: "—". A TELA NUNCA SOMA: todo número vem pronto da `fn_vg_analise`; aqui só se escreve e se desenha.
 *   · REGRA SOBERANA: nada muda de altura ou posição ao trocar aba, item, mês, critério, unidade ou nível — toda lista rola por dentro
 *     do próprio quadro, e o número anterior fica até o novo chegar (nada pisca).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import {
  COR, MESES_ABR, brl, corDoGrupo, corVariacao, mes0De, mil1, n0, pct1, rotuloMes, type AlvoAnaliseVG, type LadoVG,
} from '@/lib/financeiro/visaoGeral';
import {
  COR_FAIXA, ROTULO_FAIXA, andarEntreIrmaos, carregarAnaliseVG, chaveCaminho, descer, escolherNaDireita, escolherNaEsquerda,
  estadoInicialAnalise, irParaAba, irParaCaminho, mesmoCaminho, pctVar, posicaoNaRegua,
  type AnaliseVG, type CaminhoVG, type ContextoAnaliseVG, type CriterioVG, type EstadoAnaliseVG, type LinhaAnaliseVG, type UnidadeVG,
} from '@/lib/financeiro/visaoGeralAnalise';

const COR_META = '#b45309';
const corDoLado = (lado: LadoVG) => (lado === 'saida' ? COR.saida : COR.entrada);
/** a cor de um nó: o grupo pela ordem das abas (a mesma do card e da grade); abaixo, pela posição na própria lista */
const corDaLinha = (d: AnaliseVG, l: { caminho: CaminhoVG; grupo: string | null }, i: number) =>
  corDoGrupo(d.lado, l.caminho.length === 1 ? Math.max(0, d.abas.findIndex((a) => a.grupo === l.grupo)) : i);

export function ModalAnaliseVG({ alvo, ctx, rotuloContas, onFechar, onLancamentos }: {
  alvo: AlvoAnaliseVG; ctx: ContextoAnaliseVG; rotuloContas: string; onFechar: () => void;
  /** "N lanç. ›" — por ora só a INTENÇÃO (a gaveta de lançamentos é frente própria) */
  onLancamentos?: (caminho: CaminhoVG, e: EstadoAnaliseVG) => void;
}) {
  const [e, setE] = useState<EstadoAnaliseVG>(() => estadoInicialAnalise(alvo.lado, alvo.grupo, alvo.am));
  const [d, setD] = useState<AnaliseVG | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [intencao, setIntencao] = useState<CaminhoVG | null>(null);
  const ctxChave = JSON.stringify(ctx);

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
  }, [ctxChave, JSON.stringify(e)]);

  const lado = e.lado;
  const raizRotulo = lado === 'saida' ? 'Saídas' : 'Entradas';
  const lancar = (c: CaminhoVG) => { setIntencao(c); onLancamentos?.(c, e); };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content aria-describedby={undefined} data-testid="modal-analise"
          className="fixed left-1/2 top-1/2 z-50 flex h-[calc(100vh-16px)] max-h-[940px] w-[calc(100vw-16px)] max-w-[1520px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-[#f4f6f9] text-[10px] shadow-2xl"
          data-intencao-lancamentos={intencao ? chaveCaminho(intencao) : undefined}>
          <DialogPrimitive.Title className="sr-only">Análise de {raizRotulo.toLowerCase()}</DialogPrimitive.Title>
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
              {d ? `${rotuloMes(d.periodo.de)} – ${rotuloMes(d.periodo.ate_mes)}` : ''} · {rotuloContas}
            </span>
            <DialogPrimitive.Close aria-label="Fechar" data-testid="analise-fechar"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#8a98ab] text-white hover:bg-white/10"><X className="h-3.5 w-3.5" /></DialogPrimitive.Close>
          </div>

          {erro && <div className="shrink-0 bg-[#fdecea] px-3 py-1 text-[10px] text-[#b3261e]" data-testid="analise-erro">{erro}</div>}

          <div className="grid min-h-0 flex-1 gap-2 p-2" style={{ gridTemplateColumns: 'minmax(380px, 0.8fr) minmax(0, 1.2fr)' }}>
            {/* ESQUERDA */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <Resumo d={d} e={e} rotuloContas={rotuloContas} />
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white" data-testid="analise-tabela">
                <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 px-2">
                  <span className="truncate text-[11px] font-bold" title={d?.tabela.total?.rotulo}>
                    {e.aba === null ? 'Grupos' : 'Atividades'} · {d?.tabela.total?.rotulo ?? ''}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Segmentado<CriterioVG> altura={20} fonte={9.5} valor={e.criterio} onEscolher={(c) => setE({ ...e, criterio: c })} opcoes={[
                      { valor: 'mes', rotulo: rotuloMes(e.am) }, { valor: 'media', rotulo: 'Média do período' }, { valor: 'acumulado', rotulo: 'Acumulado' }]} />
                    <SeletorUnidade d={d} valor={e.unidade} onEscolher={(u) => setE({ ...e, unidade: u })} />
                  </div>
                </div>
                <CabecalhoTabela colunas={COLS_ESQ} rotulos={[e.aba === null ? 'GRUPO' : 'ATIVIDADE', rotuloCriterio(e), 'META', 'DIF. R$', '%']} />
                {d?.tabela.total && <LinhaEsquerda d={d} l={d.tabela.total} i={-1} forte ativa={mesmoCaminho(e.foco, d.tabela.total.caminho)}
                  onClick={() => setE(escolherNaEsquerda(e, d.tabela.total!.caminho))} />}
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="analise-tabela-lista">
                  {d?.tabela.linhas.map((l, i) => (
                    <LinhaEsquerda key={chaveCaminho(l.caminho)} d={d} l={l} i={i} ativa={e.foco.length > (e.aba ? 1 : 0) && mesmoCaminho(e.foco.slice(0, l.caminho.length), l.caminho)}
                      onClick={() => setE(escolherNaEsquerda(e, l.caminho))} />
                  ))}
                </div>
              </section>
            </div>

            {/* DIREITA */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <section className="flex min-h-[150px] flex-1 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white px-2 pb-1 pt-1.5" data-testid="analise-grafico">
                <div className="grid h-[26px] shrink-0 items-center gap-1.5" style={{ gridTemplateColumns: '22px minmax(0, 1fr) 22px' }}>
                  <BotaoSeta rotulo="Anterior" testid="analise-anterior" desligado={(d?.grafico.irmaos.length ?? 0) < 2}
                    onClick={() => d && setE(andarEntreIrmaos(e, d.grafico.irmaos, -1))}>‹</BotaoSeta>
                  <div className="uma-linha-que-rola flex min-w-0 items-center gap-1" data-testid="analise-caminho">
                    {(d?.grafico.caminho ?? []).map((p, j, arr) => j < arr.length - 1 ? (
                      <button key={chaveCaminho(p.caminho)} type="button" className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground hover:text-[#1f5fa8]"
                        onClick={() => setE(irParaCaminho(e, p.caminho))} data-testid={`analise-caminho-${j}`}>{p.rotulo} ›</button>
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

              <section className="flex h-[clamp(150px,44%,270px)] shrink-0 flex-col overflow-hidden rounded-md border border-[#dfe4ea] bg-white" data-testid="analise-foco">
                <div className="flex h-[26px] shrink-0 items-center justify-between gap-2 px-2">
                  <span className="truncate text-[11px] font-bold" title={d?.foco.total?.rotulo}>{ROTULO_NIVEL[e.foco.length + 1] ?? 'Itens'} · {d?.foco.total?.rotulo ?? ''}</span>
                  <Regua lado={lado} razao={d?.grafico.item?.razao ?? null} />
                </div>
                <CabecalhoTabela colunas={COLS_DIR} rotulos={[(ROTULO_NIVEL[e.foco.length + 1] ?? 'ITEM').toUpperCase(), rotuloCriterio(e), 'META', 'DIF. R$', '%', 'LANÇ.']} />
                {d?.foco.total && <LinhaDireita d={d} l={d.foco.total} forte ativa={!e.grafico} onClick={() => setE({ ...e, grafico: null })} onLanc={lancar} />}
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="analise-foco-lista">
                  {d?.foco.linhas.map((l, i) => (
                    <LinhaDireita key={chaveCaminho(l.caminho)} d={d} l={l} i={i} ativa={mesmoCaminho(e.grafico, l.caminho)}
                      onClick={() => setE(escolherNaDireita(e, l.caminho))} onLanc={lancar}
                      onDescer={l.caminho.length < 4 ? () => setE(descer(e, l.caminho)) : undefined} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

const ROTULO_NIVEL: Record<number, string> = { 1: 'Grupos', 2: 'Atividades', 3: 'Centros', 4: 'Subcentros' };
const rotuloCriterio = (e: EstadoAnaliseVG) => (e.criterio === 'mes' ? rotuloMes(e.am).toUpperCase() : e.criterio === 'media' ? 'MÉDIA/MÊS' : 'ACUMULADO');
const COLS_ESQ = 'minmax(0,1fr) 92px 92px 84px 44px';
const COLS_DIR = 'minmax(0,1fr) 92px 92px 84px 44px 58px';

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

function CabecalhoTabela({ colunas, rotulos }: { colunas: string; rotulos: string[] }) {
  return (
    <div className="grid h-[18px] shrink-0 items-center gap-1 bg-[#2f3d4f] px-2 text-[8.5px] font-semibold tracking-[0.03em] text-white" style={{ gridTemplateColumns: colunas }}>
      {rotulos.map((r, i) => <span key={i} className={cn('whitespace-nowrap', i > 0 && 'text-right', r === 'META' && 'text-[#ffd08a]')}>{r}</span>)}
    </div>
  );
}

/** valor, meta, Dif. R$ e % — os quatro do banco; sem meta (ou unidade que não vale), "—" */
function Numeros({ d, l, forte }: { d: AnaliseVG; l: LinhaAnaliseVG; forte?: boolean }) {
  const cv = corVariacao(d.lado, l.pct);
  return (
    <>
      <span className={cn('whitespace-nowrap text-right tabular-nums', forte && 'font-bold')} style={{ color: corDoLado(d.lado) }}>{brl(l.valor)}</span>
      <span className="whitespace-nowrap text-right tabular-nums" style={{ color: COR_META }}>{brl(l.meta)}</span>
      <span className="whitespace-nowrap text-right font-semibold tabular-nums" style={{ color: cv }}>{brl(l.dif)}</span>
      <span className="whitespace-nowrap text-right font-semibold tabular-nums" style={{ color: cv }}>{pctVar(l.pct)}</span>
    </>
  );
}

function LinhaEsquerda({ d, l, i, forte, ativa, onClick }: { d: AnaliseVG; l: LinhaAnaliseVG; i: number; forte?: boolean; ativa: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-testid={forte ? 'analise-tabela-total' : `analise-tabela-linha-${i}`} aria-pressed={ativa}
      className={cn('grid w-full items-center gap-1 border-b border-[#eef1f5] px-2 text-left', forte ? 'h-[21px] border-b-[#cfd6df] text-[10.5px] font-bold' : 'h-[18px] text-[9.5px]',
        ativa ? 'bg-[#e8eef7]' : forte ? 'bg-[#f7f8fa]' : 'hover:bg-muted/40')} style={{ gridTemplateColumns: COLS_ESQ }}>
      <span className="flex min-w-0 items-center gap-1.5">
        <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: forte ? corDoLado(d.lado) : corDaLinha(d, l, i) }} />
        <span className="truncate" title={l.rotulo}>{l.rotulo}{forte ? ' · total' : ''}</span>
      </span>
      <Numeros d={d} l={l} forte={forte} />
    </button>
  );
}

function LinhaDireita({ d, l, i = -1, forte, ativa, onClick, onLanc, onDescer }: {
  d: AnaliseVG; l: LinhaAnaliseVG; i?: number; forte?: boolean; ativa: boolean; onClick: () => void; onLanc: (c: CaminhoVG) => void; onDescer?: () => void;
}) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(ev) => { if (ev.key === 'Enter') onClick(); }} aria-pressed={ativa}
      data-testid={forte ? 'analise-foco-total' : `analise-foco-linha-${i}`} title={forte ? undefined : `Ver a evolução de ${l.rotulo} no gráfico`}
      className={cn('grid w-full cursor-pointer items-center gap-1 border-b border-[#eef1f5] px-2', forte ? 'h-[21px] border-b-[#cfd6df] text-[10.5px] font-bold' : 'h-[18px] text-[9.5px]',
        ativa ? 'bg-[#e8eef7]' : forte ? 'bg-[#f7f8fa]' : 'hover:bg-muted/40')} style={{ gridTemplateColumns: COLS_DIR }}>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate" title={l.rotulo}>{l.rotulo}{forte ? ' · total' : ''}</span>
        {onDescer && (
          <button type="button" className="shrink-0 rounded px-1 text-[9px] text-[#1f5fa8] hover:bg-[#e8eef7]" title={`Abrir ${l.rotulo}`} aria-label={`Abrir ${l.rotulo}`}
            onClick={(ev) => { ev.stopPropagation(); onDescer(); }} data-testid={`analise-descer-${i}`}>abrir ›</button>
        )}
      </span>
      <Numeros d={d} l={l} forte={forte} />
      <span className="flex justify-end">
        <button type="button" className="h-[15px] w-[54px] whitespace-nowrap rounded-[3px] border border-[#cfd6df] bg-white text-[9px] font-normal hover:border-[#1f5fa8] hover:text-[#1f5fa8]"
          onClick={(ev) => { ev.stopPropagation(); onLanc(l.caminho); }} data-testid={forte ? 'analise-lanc-total' : `analise-lanc-${i}`}>{l.qtd} lanç. ›</button>
      </span>
    </div>
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
    <section className="flex h-[86px] shrink-0 items-center gap-3 rounded-md border border-[#dfe4ea] bg-white px-2.5" data-testid="analise-resumo">
      <Donut d={d} centro={r ? (e.aba === null ? `${mil1(r.valor_rs)} mil` : pct1(r.pct_da_raiz)) : ''} legenda={e.aba === null ? raiz : `DAS ${raiz}`} />
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

/** donut das fatias que o banco mandou (a parte de cada filho, em %); o centro: o total (raiz) ou a parte da aba na raiz */
function Donut({ d, centro, legenda }: { d: AnaliseVG | null; centro: string; legenda: string }) {
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
      <text x={C} y={C} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#1b2430" data-testid="analise-donut-centro">{centro}</text>
      <text x={C} y={C + 9} textAnchor="middle" fontSize={6} fill={COR.muted}>{legenda}</text>
    </svg>
  );
}

function Kpis({ d, e }: { d: AnaliseVG | null; e: EstadoAnaliseVG }) {
  const k = d?.grafico.kpis ?? null;
  const lado = e.lado;
  return (
    <div className="flex h-[30px] shrink-0 items-center justify-between gap-3">
      <div className="flex gap-3">
        <Kpi rotulo={rotuloMes(e.am).toUpperCase()} testid="analise-kpi-mes"><span style={{ color: corDoLado(lado) }}>{brl(k?.mes)}</span></Kpi>
        <Kpi rotulo="MÉDIA/MÊS" testid="analise-kpi-media"><span>{brl(k?.media)}</span></Kpi>
        <Kpi rotulo="VS META" testid="analise-kpi-vsmeta"><span style={{ color: corVariacao(lado, k?.vs_meta) }}>{pctVar(k?.vs_meta)}</span></Kpi>
        <Kpi rotulo="TENDÊNCIA" testid="analise-kpi-tendencia"><span style={{ color: corVariacao(lado, k?.tendencia) }}>{pctVar(k?.tendencia)}</span></Kpi>
      </div>
      <div className="hidden items-center gap-2 text-[8.5px] text-muted-foreground xl:flex" data-testid="analise-legenda">
        <span className="flex items-center gap-1"><i className="h-2 w-2" style={{ background: lado === 'saida' ? COR.barraSai : COR.barraEnt }} />realizado</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2" style={{ background: lado === 'saida' ? COR.barraSaiP : COR.barraEntP }} />previsto</span>
        <span className="flex items-center gap-1"><i className="w-3.5 border-t-2" style={{ borderColor: lado === 'saida' ? COR.mediaSai : COR.mediaEnt }} />média acumulada</span>
        <span className="flex items-center gap-1"><i className="w-3.5 border-t-2 border-dotted" style={{ borderColor: COR.meta }} />meta</span>
      </div>
    </div>
  );
}

const passoBonito = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

/** o gráfico do item: colunas por mês (realizado cheio, previsto claro), a média acumulada (curva) e a meta (pontilhado laranja) — os
    pontos são os do banco, na unidade escolhida; clicar numa coluna escolhe o mês */
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
    const L = 44, Rm = 6, T = 8, B = 14, iw = W - L - Rm, ih = H - T - B, n = serie.length, slot = iw / n;
    const vals = serie.flatMap((p) => [p.realizado, p.previsto, p.total, p.media, p.meta]).filter((x): x is number => x != null);
    const mx = Math.max(1, ...vals), mn = Math.min(0, ...vals);
    const passo = passoBonito((mx - mn) / 4 || 1);
    const topo = Math.ceil(mx / passo) * passo, base = Math.floor(mn / passo) * passo;
    const Y = (v: number) => T + ih - ((v - base) / (topo - base || 1)) * ih;
    /* escrita curta do eixo e da coluna: R$ mil ("k") quando a escala passa de 10 mil; senão o inteiro */
    const curto = (v: number) => (Math.max(Math.abs(topo), Math.abs(base)) >= 10000 ? `${mil1(v)}k` : n0(v));
    const X = (k: number) => L + (k + 0.5) * slot;
    const bw = Math.max(3, Math.min(26, slot * 0.6));
    const els: JSX.Element[] = [];
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
      if (p.total && bw >= 9 && Math.abs(Y(p.total) - Y(0)) > 30) {
        els.push(<text key={`v${k}`} x={X(k) + 2.5} y={Y(0) - 3} fontSize={7} fill="#fff" transform={`rotate(-90 ${X(k) + 2.5} ${Y(0) - 3})`}>{curto(p.total)}</text>);
      }
      els.push(<text key={`m${k}`} x={X(k)} y={H - 3} fontSize={8} textAnchor="middle" fill={ehSel ? '#1b2430' : COR.muted} fontWeight={ehSel ? 700 : 400}>{MESES_ABR[mes0De(p.am)]}</text>);
    });
    const linha = (chave: 'media' | 'meta') => serie.map((p, k) => (p[chave] == null ? null : [X(k), Y(p[chave]!)] as [number, number])).filter((x): x is [number, number] => !!x);
    const md = linha('media');
    if (md.length > 1) els.push(<polyline key="md" points={md.map((q) => q.join(',')).join(' ')} fill="none" stroke={saida ? COR.mediaSai : COR.mediaEnt} strokeWidth={1.6} data-testid="analise-linha-media" />);
    const mt = linha('meta');
    if (mt.length > 1) els.push(<polyline key="mt" points={mt.map((q) => q.join(',')).join(' ')} fill="none" stroke={COR.meta} strokeWidth={1.6} strokeDasharray="2 3" data-testid="analise-linha-meta" />);
    serie.forEach((p, k) => els.push(
      <rect key={`c${k}`} x={L + k * slot} y={T} width={slot} height={ih + B} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSel(p.am)} data-testid={`analise-coluna-${p.am}`}>
        <title>{`${rotuloMes(p.am)}: ${brl(p.total)}${p.meta != null ? ` · meta ${brl(p.meta)}` : ''}`}</title>
      </rect>));
    svg = <svg width={W} height={H} className="block">{els}</svg>;
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

/** a régua "vs meta" do item do gráfico: as quatro faixas (cortes do banco) e a marca na razão valor/meta que o banco mandou */
function Regua({ lado, razao }: { lado: LadoVG; razao: number | null }) {
  const pos = posicaoNaRegua(lado, razao);
  const nomes = ROTULO_FAIXA[lado];
  const larg = { boa: 36, ideal: 18, risco: 18, critica: 28 } as const;
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-muted-foreground" data-testid="analise-regua">
      vs meta
      <div className="relative flex h-3 w-[150px] rounded-[3px] text-center text-[7.5px] leading-3">
        {(['boa', 'ideal', 'risco', 'critica'] as const).map((f) => (
          <span key={f} className="block overflow-hidden whitespace-nowrap first:rounded-l-[3px] last:rounded-r-[3px]"
            style={{ width: `${larg[f]}%`, background: COR_FAIXA[f].fundo, color: COR_FAIXA[f].texto }}>{nomes[f]}</span>
        ))}
        {pos != null && <span className="absolute -top-[3px] h-[18px] w-[2px] bg-[#1b2430]" style={{ left: `${pos}%` }} data-testid="analise-regua-marca" />}
      </div>
    </div>
  );
}
