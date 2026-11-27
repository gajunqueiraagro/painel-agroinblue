/**
 * A CONTA DE CADA ITEM DA NOTA — FIN-CLASSIF-DIVIDIDA-01b (mock aprovado 22/10 08h21, vista 1 "Itens -> conta"). A vista "Contas" da aba
 * Itens da nota: cada item ganha a sua conta (o seletor do plano, com busca; a sugestao quando ha'; sem ela, a conta de hoje do
 * lancamento), o resumo soma POR CONTA e "Dividir o lancamento em N contas" chama `fn_lancamento_dividir_pelos_itens` (motivo
 * obrigatorio; o banco soma, divide e recusa com a frase pronta). Item sem conta impede, com a frase. Sem rolagem ate' ~18 itens: a
 * tabela tem a fonte dos itens (8,5px, linha 14px) e o quadro rola dentro so' alem disso.
 * NOTA-ITENS-SUGESTAO (Gabriel 27/11, mock `nota-itens-sugestao-modal-real.html` aprovado 10:47) — com `sugestoes` (a escada ÚNICA do banco,
 * lote 114360) a tabela ganha "Obra ou manutenção?" (o item de construção/cerca/água/elétrica fica SEM conta até a resposta) e "Origem da
 * sugestão", e embaixo o "Total por conta" (com "a decidir"); no NOVO, "Juntar tudo numa conta ▾" + "Usar divisão (N contas)" (1 lançamento
 * com partes, a divisão que já existe).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EscolherConta } from '@/components/shared/EscolherConta';
import type { Atividade } from '@/lib/financeiro/ultimaAtividade';
import { QUADRO_REGUA } from '@/components/ui/regua-tabela';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ItemFiscal } from '@/lib/financeiro/nfe/itensDaNota';
import type { ItemSugerido } from '@/lib/financeiro/nfe/sugestaoDosItens';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { porContaDosItens, porQueNaoDivideOsItens } from '@/lib/financeiro/divisaoDaClassificacao';
import { cn } from '@/lib/utils';

/** As cores das contas na ordem (a barra, o ponto do item e o resumo usam a MESMA). */
export const CORES_DAS_CONTAS = ['#1f4e8c', '#d97706', '#0f766e', '#9333ea', '#be123c', '#4d7c0f'];
/** a cor do que espera a resposta obra × manutenção */
const COR_A_DECIDIR = '#b45309';
const TH = 'h-[16px] px-1 py-0 text-[8.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap';
const TD = 'h-[14px] px-1 py-0 text-[8.5px] leading-none';
/* a linha do total: a mesma letra; a altura da linha (14px) declarada, para o texto nao "quebrar" no gate */
const TDT = 'h-[14px] px-1 py-0 text-[8.5px] leading-[14px]';
/* o gatilho do seletor de conta cabe na linha de 14px */
const GATILHO = 'h-[12px] rounded-sm px-1 text-[8px] leading-none [&_svg]:h-2 [&_svg]:w-2';
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export type RespostaDaPergunta = 'obra' | 'manutencao';

/* SELETOR-CONTA-POR-ATIVIDADE-01 — o `EscolherConta`: a atividade primeiro (a da conta do item, senao a do lancamento), a busca filtrada */
function ContaDoItem({ valor, classificacoes, tipoOperacao, onEscolher, nItem, disabled, atividadeSugerida }: {
  valor: string; classificacoes: ClassificacaoItem[]; tipoOperacao: string; onEscolher: (planoContaId: string) => void; nItem: number; disabled?: boolean;
  atividadeSugerida: Atividade | null;
}) {
  return (
    <div data-testid={`conta-do-item-${nItem}`}>
      <EscolherConta valor={valor} onEscolher={(c) => onEscolher(c.id)} classificacoes={classificacoes} tipoOperacao={tipoOperacao} disabled={disabled}
        atividadeSugerida={atividadeSugerida} triggerClassName={GATILHO} itemClassName="text-[10.5px]" />
    </div>
  );
}

/** "Obra/reforma | Manutenção" na linha do item (o `Segmentado` da casa não cabe em 12px: o mesmo navy de selecionado) */
function PerguntaDoItem({ nItem, resposta, onResponder, disabled }: { nItem: number; resposta: RespostaDaPergunta | null; onResponder: (r: RespostaDaPergunta) => void; disabled?: boolean }) {
  const op = (r: RespostaDaPergunta, rotulo: string) => (
    <button type="button" disabled={disabled} onClick={() => onResponder(r)} aria-pressed={resposta === r} data-testid={`pergunta-${nItem}-${r}`}
      className={cn('flex h-full items-center whitespace-nowrap px-1 text-[8px] leading-none', r === 'manutencao' && 'border-l', resposta === r ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
      {rotulo}
    </button>
  );
  return (
    <span className="inline-flex h-[12px] overflow-hidden rounded-sm border" data-testid={`pergunta-do-item-${nItem}`}>
      {op('obra', 'Obra/reforma')}{op('manutencao', 'Manutenção')}
    </span>
  );
}

export function ContasDosItens({ itens, classificacoes, tipoOperacao, contaDeHoje, sugeridas, gravando, somenteLeitura, onDividir, atividadeSugerida = null, aoSalvar = false,
  pendente = null, onMudou, sugestoes, onJuntar, onEscolhas }: {
  itens: readonly Pick<ItemFiscal, 'nItem' | 'descricao' | 'liquidoCent'>[];
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;
  /** a conta de hoje do lancamento (o ponto de partida de todo item sem sugestao) */
  contaDeHoje: string | null;
  /** a conta sugerida de cada item (a escada do banco; o item que pergunta fica de fora) */
  sugeridas: ReadonlyMap<number, string>;
  gravando: boolean;
  somenteLeitura?: boolean;
  /** pede o motivo e chama o banco (quem chama e' o modal) */
  onDividir: (mapa: ReadonlyMap<number, string>) => void;
  /** a atividade do lancamento: a barra do seletor nasce nela quando o item ainda nao tem conta */
  atividadeSugerida?: Atividade | null;
  /** NOTA-CONTAS-NA-CRIACAO-01 A — no NOVO lancamento: o botao deixa a divisao PENDENTE ("… ao salvar"); quem grava e' o Salvar */
  aoSalvar?: boolean;
  /** P165 — a conta por item MUDADA e ainda nao dividida mora no modal (a aba que sai desmonta esta vista): volta com ela */
  pendente?: ReadonlyMap<number, string> | null;
  /** P165 — avisa o modal a cada troca: o mapa quando difere do de partida, nulo quando volta a ele (o Salvar pergunta antes de gravar) */
  onMudou?: (mapa: ReadonlyMap<number, string> | null) => void;
  /** NOTA-ITENS-SUGESTAO — a sugestão de cada item (origem, pergunta obra × manutenção). Ausente = a vista de antes */
  sugestoes?: readonly ItemSugerido[];
  /** NOTA-ITENS-SUGESTAO (só no NOVO) — "Juntar tudo numa conta": a conta escolhida vira a do lançamento, sem divisão */
  onJuntar?: (planoContaId: string) => void;
  /** Q3 — as contas que o OPERADOR escolheu (a resposta da pergunta, a conta trocada): viram regra do item depois do Salvar */
  onEscolhas?: (escolhas: ReadonlyMap<number, string>) => void;
}) {
  const sugestaoDe = useMemo(() => new Map((sugestoes ?? []).map((s) => [s.nItem, s])), [sugestoes]);
  const inicial = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of itens) {
      /* o item que PERGUNTA não nasce na conta de hoje: espera a resposta */
      if (sugestaoDe.get(i.nItem)?.pergunta) continue;
      const c = sugeridas.get(i.nItem) ?? contaDeHoje;
      if (c) m.set(i.nItem, c);
    }
    return m;
  }, [itens, sugeridas, contaDeHoje, sugestaoDe]);
  const [mapa, setMapa] = useState<ReadonlyMap<number, string>>(pendente ?? inicial);
  const [respostas, setRespostas] = useState<ReadonlyMap<number, RespostaDaPergunta>>(new Map());
  const [escolhas, setEscolhas] = useState<ReadonlyMap<number, string>>(new Map());
  /* o ponto de partida mudou DE CONTEUDO (a divisao gravada, a sugestao lida): a vista volta a ele — nunca na montagem, que traz o
     pendente, nem quando so' a identidade dos itens muda num render do modal */
  const chaveDoInicial = [...inicial].map(([n, c]) => `${n}:${c}`).join('|');
  const chaveAnterior = useRef(chaveDoInicial);
  useEffect(() => {
    if (chaveAnterior.current === chaveDoInicial) return;
    chaveAnterior.current = chaveDoInicial;
    setMapa(inicial);
  }, [chaveDoInicial, inicial]);
  const onMudouRef = useRef(onMudou);
  onMudouRef.current = onMudou;
  useEffect(() => {
    const mudou = mapa.size !== inicial.size || [...mapa].some(([n, c]) => inicial.get(n) !== c);
    onMudouRef.current?.(mudou ? mapa : null);
  }, [mapa, inicial]);
  const onEscolhasRef = useRef(onEscolhas);
  onEscolhasRef.current = onEscolhas;
  useEffect(() => { onEscolhasRef.current?.(escolhas); }, [escolhas]);

  const escolher = (nItem: number, plano: string) => {
    setMapa((m) => new Map(m).set(nItem, plano));
    setEscolhas((e) => new Map(e).set(nItem, plano));
  };
  const responder = (nItem: number, r: RespostaDaPergunta) => {
    const p = sugestaoDe.get(nItem)?.pergunta;
    if (!p) return;
    setRespostas((x) => new Map(x).set(nItem, r));
    escolher(nItem, r === 'obra' ? p.obra.planoContaId : p.manutencao.planoContaId);
  };

  const comSugestao = !!sugestoes;
  const porConta = porContaDosItens(itens, mapa);
  const aDecidir = itens.filter((i) => sugestaoDe.get(i.nItem)?.pergunta && !mapa.get(i.nItem));
  const recusaBase = porQueNaoDivideOsItens(itens, mapa);
  const recusa = aDecidir.length
    ? `${itens.length} itens em ${porConta.length} ${porConta.length === 1 ? 'conta' : 'contas'} · ${aDecidir.length} ${aDecidir.length === 1 ? 'espera' : 'esperam'} obra ou manutenção (${aDecidir.length === 1 ? 'item' : 'itens'} ${aDecidir.map((i) => i.nItem).join(', ')})`
    : recusaBase;
  const cor = (plano: string) => CORES_DAS_CONTAS[Math.max(0, porConta.findIndex((c) => c.planoContaId === plano)) % CORES_DAS_CONTAS.length];
  const nome = (plano: string) => classificacoes.find((c) => c.id === plano)?.subcentro ?? '—';
  const somaCent = itens.reduce((s, i) => s + i.liquidoCent, 0);
  const deHoje = contaDeHoje ? nome(contaDeHoje) : null;
  const aDecidirCent = aDecidir.reduce((s, i) => s + i.liquidoCent, 0);
  /* Q2 — "Juntar tudo numa conta" abre na conta de MAIOR valor */
  const contasParaJuntar = [...porConta].sort((a, b) => b.liquidoCent - a.liquidoCent);
  const nContas = Math.max(2, porConta.length + (aDecidir.length ? 1 : 0));
  /* NADA SE DESLOCA (UI-SEM-DESLOCAR-01): responder a pergunta troca a linha "a decidir" por uma conta (ou some numa que já está): o total
     reserva as linhas de partida (as contas sugeridas + uma por item que pergunta) e o que está embaixo não anda */
  const linhasReservadas = useMemo(() => new Set(inicial.values()).size + itens.filter((i) => sugestaoDe.get(i.nItem)?.pergunta).length, [inicial, itens, sugestaoDe]);
  const W = comSugestao ? { obra: 126, conta: 176, origem: 140 } : null;
  const colunas = W
    ? <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: W.obra }} /><col style={{ width: W.conta }} /><col style={{ width: W.origem }} /></colgroup>
    : <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 250 }} /></colgroup>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" data-testid="contas-dos-itens">
      {/* ── o resumo POR CONTA numa faixa so' (a altura vai para os itens: 18 sem rolar a partir de 1126x579): a barra fina; as contas
          (nome · R$ · %) ou, quando nao anda, a frase; e o botao ─────────────────────────────────────────────────────────────── */}
      <div className="shrink-0 rounded-lg border bg-card px-2 py-1" data-testid="contas-resumo">
        <div className="flex h-[6px] overflow-hidden rounded-sm bg-muted" data-testid="contas-barra">
          {porConta.map((c) => <span key={c.planoContaId} className="h-full" style={{ width: `${c.percentual}%`, background: cor(c.planoContaId) }} title={`${nome(c.planoContaId)} · ${pct(c.percentual)}`} />)}
          {aDecidirCent > 0 && somaCent > 0 && <span className="h-full" style={{ width: `${(aDecidirCent * 100) / somaCent}%`, background: COR_A_DECIDIR }} title={`a decidir · ${pct((aDecidirCent * 100) / somaCent)}`} />}
        </div>
        <div className="mt-1 flex h-[20px] min-w-0 items-center gap-2 text-[9.5px] leading-none">
          {recusa ? (
            <span className="min-w-0 flex-1 uma-linha-que-rola text-amber-800" data-testid="contas-frase" title={recusa}>{recusa}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="contas-frase"
              title={`Soma dos itens R$ ${reais(somaCent)} em ${porConta.length} contas${deHoje ? ` · hoje o lançamento está em 1 conta (${deHoje})` : ''}`}>
              {porConta.map((c) => (
                <span key={c.planoContaId} className="flex min-w-0 shrink items-center gap-1" data-testid="contas-resumo-conta"
                  title={`${nome(c.planoContaId)} · R$ ${reais(c.liquidoCent)} · ${pct(c.percentual)} · ${c.itens} ${c.itens === 1 ? 'item' : 'itens'}`}>
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor(c.planoContaId) }} />
                  <span className="min-w-0 truncate">{nome(c.planoContaId)}</span>
                  <b className="shrink-0 whitespace-nowrap tabular-nums">R$ {reais(c.liquidoCent)} · {pct(c.percentual)}</b>
                </span>
              ))}
            </span>
          )}
          {aoSalvar && onJuntar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-[20px] w-[150px] shrink-0 px-2 text-[10px]" disabled={gravando || somenteLeitura || !contasParaJuntar.length}
                  data-testid="contas-juntar">Juntar tudo numa conta ▾</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-testid="contas-juntar-menu">
                {contasParaJuntar.map((c) => (
                  <DropdownMenuItem key={c.planoContaId} onSelect={() => {
                    setMapa(new Map(itens.map((i) => [i.nItem, c.planoContaId])));
                    onJuntar(c.planoContaId);
                  }}>{nome(c.planoContaId)} · R$ {reais(c.liquidoCent)}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button type="button" size="sm" className={cn('h-[20px] shrink-0 px-2 text-[10px]', aoSalvar && onJuntar ? 'w-[150px]' : 'w-[190px]')}
            disabled={!!recusa || gravando || somenteLeitura} title={aDecidir.length ? `Responda obra ou manutenção (${aDecidir.length === 1 ? 'item' : 'itens'} ${aDecidir.map((i) => i.nItem).join(', ')}).` : undefined}
            onClick={() => onDividir(mapa)} data-testid="contas-dividir">
            {gravando ? (aoSalvar ? 'Salvando…' : 'Dividindo…')
              : aoSalvar && onJuntar ? `Usar divisão (${nContas} contas)`
              : aoSalvar ? `Dividir em ${nContas} contas ao salvar` : `Dividir o lançamento em ${nContas} contas`}
          </Button>
        </div>
      </div>

      {/* ── os itens: Nº · Descrição · Líquido · [Obra ou manutenção?] · Conta · [Origem] ─────────────────────────────────── */}
      <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')} data-testid="contas-quadro">
        <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
          {colunas}
          <thead><tr>
            <th className={cn(TH, 'text-right')}>Nº</th><th className={cn(TH, 'text-left')}>Descrição na nota</th>
            <th className={cn(TH, 'text-right')}>Líquido</th>
            {comSugestao && <th className={cn(TH, 'text-left')}>Obra ou manutenção?</th>}
            <th className={cn(TH, 'text-left')}>Conta</th>
            {comSugestao && <th className={cn(TH, 'text-left')}>Origem da sugestão</th>}
          </tr></thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="contas-rolagem">
          <table className="w-full table-fixed border-collapse">
            {colunas}
            <tbody>
              {itens.map((i) => {
                const c = mapa.get(i.nItem) ?? '';
                const s = sugestaoDe.get(i.nItem);
                const esperando = !!s?.pergunta && !c;
                const origem = escolhas.has(i.nItem) ? (s?.pergunta ? 'você escolheu' : 'você trocou') : s?.origem ?? (s ? '—' : null);
                return (
                  <tr key={i.nItem} className="border-b border-border/50 even:bg-muted/30" data-testid="contas-linha">
                    <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>{i.nItem}</td>
                    <td className={cn(TD, 'truncate')} title={i.descricao}>{i.descricao}</td>
                    <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{reais(i.liquidoCent)}</td>
                    {comSugestao && (
                      <td className={TD}>
                        {s?.pergunta
                          ? <PerguntaDoItem nItem={i.nItem} resposta={respostas.get(i.nItem) ?? null} onResponder={(r) => responder(i.nItem, r)} disabled={somenteLeitura || gravando} />
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className={TD}>
                      <div className="flex min-w-0 items-center gap-1">
                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: c ? cor(c) : esperando ? COR_A_DECIDIR : 'transparent', outline: c || esperando ? undefined : '1px dashed #d97706' }} />
                        <div className="min-w-0 flex-1">
                          {esperando
                            ? <span className="block truncate italic text-amber-800" data-testid={`conta-do-item-${i.nItem}`}
                                title={s?.pergunta ? `Obra/reforma = ${s.pergunta.obra.subcentro} · Manutenção = ${s.pergunta.manutencao.subcentro}` : undefined}>responda obra ou manutenção</span>
                            : <ContaDoItem nItem={i.nItem} valor={c} classificacoes={classificacoes} tipoOperacao={tipoOperacao} disabled={somenteLeitura || gravando}
                                atividadeSugerida={atividadeSugerida} onEscolher={(p) => escolher(i.nItem, p)} />}
                        </div>
                      </div>
                    </td>
                    {comSugestao && (
                      <td className={cn(TD, 'truncate text-muted-foreground')} title={s?.porque || origem || undefined} data-testid={`origem-do-item-${i.nItem}`}>{origem}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* ── o TOTAL POR CONTA (com o que espera a resposta) ─────────────────────────────────────────────────────────────── */}
        {comSugestao && (
          <div className="shrink-0 border-t" data-testid="contas-total-por-conta" style={{ minHeight: 16 + linhasReservadas * 15 + 14 + 1 }}>
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 260 }} /><col style={{ width: 50 }} /><col style={{ width: 80 }} /><col style={{ width: 60 }} /><col /></colgroup>
              <thead className="bg-primary"><tr>
                <th className={cn(TH, 'text-left')}>Total por conta</th><th className={cn(TH, 'text-right')}>Itens</th>
                <th className={cn(TH, 'text-right')}>Líquido</th><th className={cn(TH, 'text-right')}>% nota</th><th className={TH} />
              </tr></thead>
              <tbody>
                {porConta.map((c) => (
                  <tr key={c.planoContaId} className="border-b border-border/50" data-testid="contas-total-linha">
                    <td className={cn(TDT, 'truncate')} title={nome(c.planoContaId)}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cor(c.planoContaId) }} />{nome(c.planoContaId)}</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{c.itens}</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{reais(c.liquidoCent)}</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{pct(c.percentual)}</td><td className={TDT} />
                  </tr>
                ))}
                {aDecidir.length > 0 && (
                  <tr className="border-b border-border/50" data-testid="contas-total-a-decidir">
                    <td className={cn(TDT, 'text-amber-800')}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COR_A_DECIDIR }} />a decidir · obra ou manutenção</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{aDecidir.length}</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{reais(aDecidirCent)}</td>
                    <td className={cn(TDT, 'text-right tabular-nums')}>{somaCent > 0 ? pct((aDecidirCent * 100) / somaCent) : '—'}</td><td className={TDT} />
                  </tr>
                )}
                <tr data-testid="contas-total-da-nota">
                  <td className={cn(TDT, 'font-semibold')}>Total da nota</td>
                  <td className={cn(TDT, 'text-right font-semibold tabular-nums')}>{itens.length}</td>
                  <td className={cn(TDT, 'text-right font-semibold tabular-nums')}>{reais(somaCent)}</td>
                  <td className={cn(TDT, 'text-right font-semibold tabular-nums')}>100%</td><td className={TDT} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
