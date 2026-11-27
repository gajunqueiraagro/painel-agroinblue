/**
 * A CONTA DE CADA ITEM DA NOTA — FIN-CLASSIF-DIVIDIDA-01b (mock aprovado 22/10 08h21, vista 1 "Itens -> conta"). Cada item ganha a sua conta
 * (o seletor do plano, com busca), o resumo soma POR CONTA e "Dividir o lancamento em N contas" chama `fn_lancamento_dividir_pelos_itens`
 * (motivo obrigatorio; o banco soma, divide e recusa com a frase pronta).
 * NOTA-ITENS-SUGESTAO (mock aprovado 27/11 10:47) — com `sugestoes` (a escada ÚNICA do banco) a tabela ganha o atalho obra × manutenção, a
 * origem da sugestão e o "Total por conta"; no NOVO, "Juntar tudo numa conta ▾" + "Usar divisão (N contas)" (1 lançamento com partes).
 * SUGESTAO-ITENS-02 (Gabriel 27/11, mock `sugestao-itens-02-classificar.html` aprovado, fonte 12/11) — NUNCA TRAVAR O OPERADOR:
 *   · a classificação mora no modal "Classificar itens" (`variante="modal"`: tamanho fixo, descrição inteira, a Conta larga com o nome inteiro,
 *     fonte da régua 12/11, cabeçalho e Total fixos, a tabela rola por dentro); a aba Itens fica só com o resumo (`ResumoDasContasDosItens`);
 *   · "Obra/reforma · Manutenção" é ATALHO opcional que preenche a conta; a conta é SEMPRE editável pelo plano inteiro;
 *   · item sem conta (sem sugestão, ou o atalho não usado) = conta vazia com aviso pequeno, SEM bloquear: no "Usar divisão" ele vai na conta
 *     do lançamento;
 *   · "Juntar tudo numa conta ▾": as sugeridas no topo + "Escolher outra conta…" (o plano inteiro, o cursor na busca); TODOS os itens vão.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
/** a cor do item sem conta */
const COR_SEM_CONTA = '#94a3b8';
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/* a régua de cada variante: a aba (a fonte dos itens, 8,5px) e o modal "Classificar itens" (12/11, Gabriel 27/11) */
type Regua = { th: string; td: string; tdt: string; gatilho: string; atalho: string; linhaTotal: number; cabTotal: number };
const REGUA: Record<'aba' | 'modal', Regua> = {
  aba: {
    th: 'h-[16px] px-1 py-0 text-[8.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap',
    td: 'h-[14px] px-1 py-0 text-[8.5px] leading-none',
    tdt: 'h-[14px] px-1 py-0 text-[8.5px] leading-[14px]',
    gatilho: 'h-[12px] rounded-sm px-1 text-[8px] leading-none [&_svg]:h-2 [&_svg]:w-2',
    atalho: 'h-[12px] text-[8px]',
    linhaTotal: 15, cabTotal: 16,
  },
  modal: {
    th: 'h-[26px] px-2 py-0 text-[11px] font-semibold text-primary-foreground normal-case tracking-normal whitespace-nowrap',
    td: 'h-[32px] px-2 py-0 text-[12px] leading-none',
    tdt: 'h-[28px] px-2 py-0 text-[12px] leading-[28px]',
    gatilho: 'h-[26px] rounded px-2 text-[12px] leading-none',
    atalho: 'h-[24px] text-[11px]',
    linhaTotal: 29, cabTotal: 26,
  },
};

export type RespostaDaPergunta = 'obra' | 'manutencao';

/* SELETOR-CONTA-POR-ATIVIDADE-01 — o `EscolherConta`: a atividade primeiro (a da conta do item, senao a do lancamento), a busca filtrada */
function ContaDoItem({ valor, classificacoes, tipoOperacao, onEscolher, nItem, disabled, atividadeSugerida, gatilho }: {
  valor: string; classificacoes: ClassificacaoItem[]; tipoOperacao: string; onEscolher: (planoContaId: string) => void; nItem: number; disabled?: boolean;
  atividadeSugerida: Atividade | null; gatilho: string;
}) {
  return (
    <div data-testid={`conta-do-item-${nItem}`}>
      <EscolherConta valor={valor} onEscolher={(c) => onEscolher(c.id)} classificacoes={classificacoes} tipoOperacao={tipoOperacao} disabled={disabled}
        atividadeSugerida={atividadeSugerida} triggerClassName={gatilho} itemClassName="text-[10.5px]" />
    </div>
  );
}

/** "Obra/reforma | Manutenção" — ATALHO opcional (SUGESTAO-ITENS-02): preenche a conta; nunca obriga */
function AtalhoDoItem({ nItem, resposta, onResponder, disabled, classe }: { nItem: number; resposta: RespostaDaPergunta | null; onResponder: (r: RespostaDaPergunta) => void;
  disabled?: boolean; classe: string }) {
  const op = (r: RespostaDaPergunta, rotulo: string) => (
    <button type="button" disabled={disabled} onClick={() => onResponder(r)} aria-pressed={resposta === r} data-testid={`pergunta-${nItem}-${r}`}
      className={cn('flex h-full items-center whitespace-nowrap px-1.5 leading-none', r === 'manutencao' && 'border-l', resposta === r ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
      {rotulo}
    </button>
  );
  return (
    <span className={cn('inline-flex overflow-hidden rounded-sm border', classe)} data-testid={`pergunta-do-item-${nItem}`}>
      {op('obra', 'Obra/reforma')}{op('manutencao', 'Manutenção')}
    </span>
  );
}

type ItemDaVista = Pick<ItemFiscal, 'nItem' | 'descricao' | 'liquidoCent'> & Partial<Pick<ItemFiscal, 'quantidade' | 'unidade'>>;

/** quantidade + unidade para a coluna Qtd ("20 SC", "30,16 T") */
function qtdDoItem(i: ItemDaVista): string {
  const q = Number(i.quantidade);
  if (!i.quantidade || !Number.isFinite(q)) return '—';
  return `${q.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${i.unidade ? ` ${i.unidade}` : ''}`;
}

/** o ponto de partida da conta de cada item (a vista e o resumo da aba leem a MESMA regra) */
export function contasDePartidaDosItens(itens: readonly Pick<ItemFiscal, 'nItem'>[], sugeridas: ReadonlyMap<number, string>, contaDeHoje: string | null,
  todasNaConta: string | null, comSugestao: boolean): ReadonlyMap<number, string> {
  const m = new Map<number, string>();
  if (todasNaConta) { for (const i of itens) m.set(i.nItem, todasNaConta); return m; }
  for (const i of itens) {
    /* com a sugestão, o item sem ela (ou o que tem só o atalho) nasce SEM conta: o aviso pequeno, sem travar (SUGESTAO-ITENS-02) */
    const c = sugeridas.get(i.nItem) ?? (comSugestao ? null : contaDeHoje);
    if (c) m.set(i.nItem, c);
  }
  return m;
}

export function ContasDosItens({ itens, classificacoes, tipoOperacao, contaDeHoje, sugeridas, gravando, somenteLeitura, onDividir, atividadeSugerida = null, aoSalvar = false,
  pendente = null, onMudou, sugestoes, onJuntar, onEscolhas, todasNaConta = null, variante = 'aba', onFechar }: {
  itens: readonly ItemDaVista[];
  classificacoes: ClassificacaoItem[];
  tipoOperacao: string;
  /** a conta de hoje do lancamento (sem sugestão: o ponto de partida; no "Usar divisão": a conta do item que ficou sem conta) */
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
  /** NOTA-ITENS-SUGESTAO — a sugestão de cada item (origem, atalho obra × manutenção). Ausente = a vista de antes */
  sugestoes?: readonly ItemSugerido[];
  /** NOTA-ITENS-SUGESTAO (só no NOVO) — "Juntar tudo numa conta": a conta escolhida vira a do lançamento, sem divisão */
  onJuntar?: (planoContaId: string) => void;
  /** Q3 — as contas que o OPERADOR escolheu (o atalho, a conta trocada): viram regra do item depois do Salvar */
  onEscolhas?: (escolhas: ReadonlyMap<number, string>) => void;
  /** SUGESTAO-ITENS-BUG-01 — sem divisão ativa, a conta do lançamento (a da Geral) É a de todos os itens; "Usar divisão" some */
  todasNaConta?: string | null;
  /** SUGESTAO-ITENS-02 — 'modal' = o "Classificar itens" (12/11, colunas largas, Cancelar no rodapé) */
  variante?: 'aba' | 'modal';
  /** o Cancelar do modal */
  onFechar?: () => void;
}) {
  const R = REGUA[variante];
  const noModal = variante === 'modal';
  const sugestaoDe = useMemo(() => new Map((sugestoes ?? []).map((s) => [s.nItem, s])), [sugestoes]);
  const comSugestao = !!sugestoes;
  const inicial = useMemo(() => contasDePartidaDosItens(itens, sugeridas, contaDeHoje, todasNaConta, comSugestao),
    [itens, sugeridas, contaDeHoje, todasNaConta, comSugestao]);
  const [mapa, setMapa] = useState<ReadonlyMap<number, string>>(pendente ?? inicial);
  const [respostas, setRespostas] = useState<ReadonlyMap<number, RespostaDaPergunta>>(new Map());
  const [escolhas, setEscolhas] = useState<ReadonlyMap<number, string>>(new Map());
  const [outraConta, setOutraConta] = useState(false);
  const indoParaOutra = useRef(false);
  /* "Escolher outra conta…": o seletor de sempre, já aberto (o clique no gatilho dele ao montar; nada muda no componente compartilhado) */
  const jaAbriuOutra = useRef(false);
  const abrirAoMontar = (el: HTMLDivElement | null) => {
    if (!el || jaAbriuOutra.current) return;
    jaAbriuOutra.current = true;
    const g = el.querySelector('[role="combobox"]');
    if (g instanceof HTMLElement && g.getAttribute('aria-expanded') !== 'true') g.click();
  };
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
  const juntar = (planoContaId: string) => {
    setMapa(new Map(itens.map((i) => [i.nItem, planoContaId])));
    setOutraConta(false);
    onJuntar?.(planoContaId);
  };

  const porConta = porContaDosItens(itens, mapa);
  const semConta = itens.filter((i) => !mapa.get(i.nItem));
  /* NUNCA TRAVAR: o item sem conta vai, na divisão, para a conta do lançamento */
  const mapaParaDividir = useMemo(() => {
    const m = new Map(mapa);
    if (contaDeHoje) for (const i of itens) if (!m.get(i.nItem)) m.set(i.nItem, contaDeHoje);
    return m;
  }, [mapa, itens, contaDeHoje]);
  const recusa = porQueNaoDivideOsItens(itens, mapaParaDividir);
  const cor = (plano: string) => CORES_DAS_CONTAS[Math.max(0, porConta.findIndex((c) => c.planoContaId === plano)) % CORES_DAS_CONTAS.length];
  const nome = (plano: string) => classificacoes.find((c) => c.id === plano)?.subcentro ?? '—';
  const somaCent = itens.reduce((s, i) => s + i.liquidoCent, 0);
  const deHoje = contaDeHoje ? nome(contaDeHoje) : null;
  const semContaCent = semConta.reduce((s, i) => s + i.liquidoCent, 0);
  /* Q2 — "Juntar tudo numa conta" abre na conta de MAIOR valor */
  const contasParaJuntar = [...porConta].sort((a, b) => b.liquidoCent - a.liquidoCent);
  const nContas = Math.max(2, porContaDosItens(itens, mapaParaDividir).length);
  /* todos os itens na conta do lançamento e nada mudado: não há divisão a usar (o botão some; volta se o operador trocar um item) */
  const semDivisaoPedida = !!todasNaConta && porConta.length <= 1 && !semConta.length;
  /* NADA SE DESLOCA: o total reserva as linhas de partida (as contas sugeridas + uma por item sem conta) */
  const linhasReservadas = useMemo(() => new Set(inicial.values()).size + itens.filter((i) => !inicial.get(i.nItem)).length, [inicial, itens]);
  /* sem a conta do lançamento não há para onde ir: aí vale a recusa de sempre ("Faltam N…") */
  const fraseSemConta = semConta.length && contaDeHoje
    ? `${semConta.length} ${semConta.length === 1 ? 'item sem conta: vai' : 'itens sem conta: vão'} na conta do lançamento${deHoje ? ` (${deHoje})` : ''} — não trava o salvar`
    : null;
  const colunas = noModal
    ? <colgroup><col style={{ width: 34 }} /><col style={{ width: 226 }} /><col style={{ width: 64 }} /><col style={{ width: 92 }} />
        {comSugestao && <col style={{ width: 180 }} />}<col />{comSugestao && <col style={{ width: 196 }} />}</colgroup>
    : comSugestao
      ? <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 126 }} /><col style={{ width: 176 }} /><col style={{ width: 140 }} /></colgroup>
      : <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 250 }} /></colgroup>;

  const botaoJuntar = aoSalvar && onJuntar && (
    <div className="flex shrink-0 items-center gap-2">
      {outraConta && (
        <div className={noModal ? 'w-[300px]' : 'w-[200px]'} data-testid="contas-juntar-outra" ref={abrirAoMontar}>
          <EscolherConta valor="" classificacoes={classificacoes} tipoOperacao={tipoOperacao} atividadeSugerida={atividadeSugerida}
            onEscolher={(c) => juntar(c.id)} triggerClassName={R.gatilho} itemClassName="text-[10.5px]" />
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className={cn('shrink-0 px-2', noModal ? 'h-[28px] w-[200px] text-[12px]' : 'h-[20px] w-[150px] text-[10px]')}
            disabled={gravando || somenteLeitura} data-testid="contas-juntar">Juntar tudo numa conta ▾</Button>
        </DropdownMenuTrigger>
        {/* o menu que fecha devolve o foco ao gatilho: no "Escolher outra conta…" o foco fica na busca do plano que abriu */}
        <DropdownMenuContent align="end" data-testid="contas-juntar-menu" onCloseAutoFocus={(e) => { if (indoParaOutra.current) { indoParaOutra.current = false; e.preventDefault(); } }}>
          {contasParaJuntar.map((c) => (
            <DropdownMenuItem key={c.planoContaId} onSelect={() => juntar(c.planoContaId)}>{nome(c.planoContaId)} · R$ {reais(c.liquidoCent)}</DropdownMenuItem>
          ))}
          {contasParaJuntar.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => { indoParaOutra.current = true; jaAbriuOutra.current = false; setOutraConta(true); }} data-testid="contas-juntar-outra-conta">Escolher outra conta… (o plano inteiro)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  const botaoDividir = (
    <Button type="button" size="sm" className={cn('shrink-0 px-2', noModal ? 'h-[28px] w-[200px] text-[12px]' : aoSalvar && onJuntar ? 'h-[20px] w-[150px] text-[10px]' : 'h-[20px] w-[190px] text-[10px]',
      /* sem divisão pedida (os itens seguem a Geral) o botão some — no lugar reservado, nada se desloca */
      semDivisaoPedida && 'invisible')} aria-hidden={semDivisaoPedida ? true : undefined}
      disabled={!!recusa || gravando || somenteLeitura} onClick={() => onDividir(mapaParaDividir)} data-testid="contas-dividir">
      {gravando ? (aoSalvar ? 'Salvando…' : 'Dividindo…')
        : aoSalvar && onJuntar ? `Usar divisão (${nContas} contas)`
        : aoSalvar ? `Dividir em ${nContas} contas ao salvar` : `Dividir o lançamento em ${nContas} contas`}
    </Button>
  );

  return (
    <div className={cn('flex h-full min-h-0 flex-col', noModal ? 'gap-2' : 'gap-1.5')} data-testid="contas-dos-itens">
      {/* ── o topo: no modal, a instrução + Juntar; na aba, a barra fina + a frase + os botões ──────────────────────────────────── */}
      {noModal ? (
        <div className="flex h-[30px] shrink-0 items-center gap-2 text-[12px]">
          <span className="min-w-0 flex-1 whitespace-nowrap" data-testid="contas-frase">
            {recusa && !fraseSemConta ? recusa : 'A sugestão vem pronta; troque à vontade (o plano de contas inteiro). Obra/manutenção é só atalho.'}
          </span>
          {botaoJuntar}
        </div>
      ) : (
        <div className="shrink-0 rounded-lg border bg-card px-2 py-1" data-testid="contas-resumo">
          <div className="flex h-[6px] overflow-hidden rounded-sm bg-muted" data-testid="contas-barra">
            {porConta.map((c) => <span key={c.planoContaId} className="h-full" style={{ width: `${c.percentual}%`, background: cor(c.planoContaId) }} title={`${nome(c.planoContaId)} · ${pct(c.percentual)}`} />)}
            {semContaCent > 0 && somaCent > 0 && <span className="h-full" style={{ width: `${(semContaCent * 100) / somaCent}%`, background: COR_SEM_CONTA }} title={`sem conta · ${pct((semContaCent * 100) / somaCent)}`} />}
          </div>
          <div className="mt-1 flex h-[20px] min-w-0 items-center gap-2 text-[9.5px] leading-none">
            {fraseSemConta || (recusa ? recusa : comSugestao ? `${itens.length} itens em ${porConta.length} contas · confira o total por conta` : null) ? (
              <span className={cn('min-w-0 flex-1 uma-linha-que-rola', recusa || fraseSemConta ? 'text-amber-800' : 'text-muted-foreground')} data-testid="contas-frase"
                title={fraseSemConta ?? recusa ?? undefined}>
                {fraseSemConta ?? recusa ?? `${itens.length} itens em ${porConta.length} contas · confira o total por conta`}
              </span>
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
            {botaoJuntar}
            {botaoDividir}
          </div>
        </div>
      )}

      {/* ── os itens: Nº · Descrição · [Qtd] · Líquido · [Atalho] · Conta · [Origem]; cabeçalho e Total fixos, o corpo rola ───────── */}
      <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')} data-testid="contas-quadro">
        <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
          {colunas}
          <thead><tr>
            <th className={cn(R.th, 'text-right')}>Nº</th><th className={cn(R.th, 'text-left')}>{noModal ? 'Descrição do item' : 'Descrição na nota'}</th>
            {noModal && <th className={cn(R.th, 'text-right')}>Qtd</th>}
            <th className={cn(R.th, 'text-right')}>{noModal ? 'Valor' : 'Líquido'}</th>
            {comSugestao && <th className={cn(R.th, 'text-left')}>{noModal ? 'Atalho (opcional)' : 'Obra ou manutenção?'}</th>}
            <th className={cn(R.th, 'text-left')}>Conta</th>
            {comSugestao && <th className={cn(R.th, 'text-left')}>Origem da sugestão</th>}
          </tr></thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="contas-rolagem">
          <table className="w-full table-fixed border-collapse">
            {colunas}
            <tbody>
              {itens.map((i) => {
                const c = mapa.get(i.nItem) ?? '';
                const s = sugestaoDe.get(i.nItem);
                const origem = escolhas.has(i.nItem) ? (s?.pergunta && respostas.has(i.nItem) ? 'você escolheu (atalho)' : 'você trocou')
                  : c && inicial.get(i.nItem) !== c ? 'você trocou'
                  : todasNaConta && c === todasNaConta ? (s?.subcentro && s.planoContaId !== todasNaConta ? `a do lançamento (sugestão: ${s.subcentro})` : 'a do lançamento')
                  : s?.origem ?? (s ? 'sem sugestão' : null);
                return (
                  <tr key={i.nItem} className="border-b border-border/50 even:bg-muted/30" data-testid="contas-linha">
                    <td className={cn(R.td, 'text-right tabular-nums text-muted-foreground')}>{i.nItem}</td>
                    <td className={cn(R.td, 'truncate')} title={i.descricao}>{i.descricao}</td>
                    {noModal && <td className={cn(R.td, 'whitespace-nowrap text-right tabular-nums')}>{qtdDoItem(i)}</td>}
                    <td className={cn(R.td, 'whitespace-nowrap text-right tabular-nums')}>{reais(i.liquidoCent)}</td>
                    {comSugestao && (
                      <td className={R.td}>
                        {s?.pergunta
                          ? <AtalhoDoItem nItem={i.nItem} resposta={respostas.get(i.nItem) ?? null} onResponder={(r) => responder(i.nItem, r)} disabled={somenteLeitura || gravando} classe={R.atalho} />
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className={R.td}>
                      <div className={cn('flex min-w-0 items-center gap-1', !c && 'rounded bg-amber-50 ring-1 ring-amber-300')}
                        title={!c ? 'Sem sugestão — escolha a conta (sem ela, vai na conta do lançamento).' : undefined}>
                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: c ? cor(c) : COR_SEM_CONTA }} />
                        <div className="min-w-0 flex-1">
                          <ContaDoItem nItem={i.nItem} valor={c} classificacoes={classificacoes} tipoOperacao={tipoOperacao} disabled={somenteLeitura || gravando}
                            atividadeSugerida={atividadeSugerida} gatilho={R.gatilho} onEscolher={(p) => escolher(i.nItem, p)} />
                        </div>
                      </div>
                    </td>
                    {comSugestao && (
                      <td className={cn(R.td, 'truncate text-muted-foreground')} title={s?.porque || origem || undefined} data-testid={`origem-do-item-${i.nItem}`}>{origem}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* ── o TOTAL POR CONTA (com o que está sem conta) ─────────────────────────────────────────────────────────────────── */}
        {comSugestao && (
          <div className="shrink-0 border-t" data-testid="contas-total-por-conta" style={{ minHeight: R.cabTotal + linhasReservadas * R.linhaTotal + R.linhaTotal }}>
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: noModal ? 70 : 50 }} /><col style={{ width: noModal ? 120 : 80 }} /><col style={{ width: noModal ? 80 : 60 }} /></colgroup>
              <thead className="bg-primary"><tr>
                <th className={cn(R.th, 'text-left')}>Total por conta</th><th className={cn(R.th, 'text-right')}>Itens</th>
                <th className={cn(R.th, 'text-right')}>Líquido</th><th className={cn(R.th, 'text-right')}>% nota</th>
              </tr></thead>
              <tbody>
                {porConta.map((c) => (
                  <tr key={c.planoContaId} className="border-b border-border/50" data-testid="contas-total-linha">
                    <td className={cn(R.tdt, 'truncate')} title={nome(c.planoContaId)}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cor(c.planoContaId) }} />{nome(c.planoContaId)}</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{c.itens}</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{reais(c.liquidoCent)}</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{pct(c.percentual)}</td>
                  </tr>
                ))}
                {semConta.length > 0 && (
                  <tr className="border-b border-border/50" data-testid="contas-total-sem-conta">
                    <td className={cn(R.tdt, 'text-amber-800')}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COR_SEM_CONTA }} />sem conta (vai na conta do lançamento)</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{semConta.length}</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{reais(semContaCent)}</td>
                    <td className={cn(R.tdt, 'text-right tabular-nums')}>{somaCent > 0 ? pct((semContaCent * 100) / somaCent) : '—'}</td>
                  </tr>
                )}
                <tr className="bg-muted/40" data-testid="contas-total-da-nota">
                  <td className={cn(R.tdt, 'font-semibold')}>Total da nota</td>
                  <td className={cn(R.tdt, 'text-right font-semibold tabular-nums')}>{itens.length}</td>
                  <td className={cn(R.tdt, 'text-right font-semibold tabular-nums')}>{reais(somaCent)}</td>
                  <td className={cn(R.tdt, 'text-right font-semibold tabular-nums')}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── o rodapé do modal: o aviso pequeno do que está sem conta (não trava) + Cancelar + Usar divisão ─────────────────────── */}
      {noModal && (
        <div className="flex h-[40px] shrink-0 items-center gap-2 text-[12px]">
          <span className="min-w-0 flex-1 whitespace-nowrap text-amber-800" data-testid="contas-aviso-sem-conta">{fraseSemConta ?? ''}</span>
          <Button type="button" size="sm" variant="outline" className="h-[28px] shrink-0 px-3 text-[12px]" onClick={onFechar} data-testid="contas-cancelar">Cancelar</Button>
          {botaoDividir}
        </div>
      )}
    </div>
  );
}

/**
 * SUGESTAO-ITENS-02 — a aba Itens › Contas fica só com o RESUMO: "N itens em X contas · K sem conta", o Total por conta (a régua da aba) e o
 * botão "Classificar itens ▸" (o modal). `mapa` = a conta de cada item como vale hoje (a divisão pendente/gravada, a Geral, ou a sugestão).
 */
export function ResumoDasContasDosItens({ itens, mapa, classificacoes, onClassificar, desabilitado }: {
  itens: readonly Pick<ItemFiscal, 'nItem' | 'liquidoCent'>[];
  mapa: ReadonlyMap<number, string>;
  classificacoes: ClassificacaoItem[];
  onClassificar: () => void;
  desabilitado?: boolean;
}) {
  const porConta = porContaDosItens(itens, mapa);
  const semConta = itens.filter((i) => !mapa.get(i.nItem));
  const somaCent = itens.reduce((s, i) => s + i.liquidoCent, 0);
  const semContaCent = semConta.reduce((s, i) => s + i.liquidoCent, 0);
  const nome = (plano: string) => classificacoes.find((c) => c.id === plano)?.subcentro ?? '—';
  const th = 'h-[22px] px-2 py-0 text-[10px] font-semibold text-primary-foreground whitespace-nowrap';
  const td = 'h-[24px] px-2 py-0 text-[11px] leading-[24px]';
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="contas-dos-itens">
      <div className="flex h-[28px] shrink-0 items-center gap-2 text-[11px]">
        <span className="whitespace-nowrap" data-testid="contas-frase">
          {itens.length} itens em {porConta.length} {porConta.length === 1 ? 'conta' : 'contas'}{semConta.length ? ` · ${semConta.length} sem conta` : ''}
        </span>
        <Button type="button" size="sm" className="ml-auto h-[26px] shrink-0 px-3 text-[11px] font-semibold" onClick={onClassificar} disabled={desabilitado}
          data-testid="classificar-itens">Classificar itens ▸</Button>
      </div>
      <div className={cn(QUADRO_REGUA, 'shrink-0')} data-testid="contas-total-por-conta">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 60 }} /><col style={{ width: 110 }} /><col style={{ width: 70 }} /></colgroup>
          <thead className="bg-primary"><tr>
            <th className={cn(th, 'text-left')}>Total por conta</th><th className={cn(th, 'text-right')}>Itens</th>
            <th className={cn(th, 'text-right')}>Líquido</th><th className={cn(th, 'text-right')}>% nota</th>
          </tr></thead>
          <tbody>
            {porConta.map((c, k) => (
              <tr key={c.planoContaId} className="border-b border-border/50" data-testid="contas-total-linha">
                <td className={cn(td, 'truncate')} title={nome(c.planoContaId)}>
                  <i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORES_DAS_CONTAS[k % CORES_DAS_CONTAS.length] }} />{nome(c.planoContaId)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{c.itens}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{reais(c.liquidoCent)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{pct(c.percentual)}</td>
              </tr>
            ))}
            {semConta.length > 0 && (
              <tr className="border-b border-border/50" data-testid="contas-total-sem-conta">
                <td className={cn(td, 'text-amber-800')}><i className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COR_SEM_CONTA }} />sem conta (escolha no item)</td>
                <td className={cn(td, 'text-right tabular-nums')}>{semConta.length}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{reais(semContaCent)}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{somaCent > 0 ? pct((semContaCent * 100) / somaCent) : '—'}</td>
              </tr>
            )}
            <tr className="bg-muted/40" data-testid="contas-total-da-nota">
              <td className={cn(td, 'font-semibold')}>Total da nota</td>
              <td className={cn(td, 'text-right font-semibold tabular-nums')}>{itens.length}</td>
              <td className={cn(td, 'text-right font-semibold tabular-nums')}>{reais(somaCent)}</td>
              <td className={cn(td, 'text-right font-semibold tabular-nums')}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * SUGESTAO-ITENS-02 — a aba Itens › Contas com sugestão: o RESUMO + "Classificar itens ▸", que abre o modal (a `ContasDosItens` na variante
 * 'modal'). O que o operador mudou no modal e não usou fica guardado aqui (fechar e reabrir volta com ele, P165) e o resumo o mostra.
 */
export function ClassificarItens(props: Omit<ComponentProps<typeof ContasDosItens>, 'variante' | 'onFechar'>) {
  const { itens, sugeridas, contaDeHoje, todasNaConta = null, sugestoes, classificacoes, onMudou, pendente: pendenteDeFora, onDividir, onJuntar, gravando, somenteLeitura } = props;
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState<ReadonlyMap<number, string> | null>(pendenteDeFora ?? null);
  const partida = useMemo(() => contasDePartidaDosItens(itens, sugeridas, contaDeHoje, todasNaConta, !!sugestoes),
    [itens, sugeridas, contaDeHoje, todasNaConta, sugestoes]);
  const mudou = (m: ReadonlyMap<number, string> | null) => { setPendente(m); onMudou?.(m); };
  return (
    <>
      <ResumoDasContasDosItens itens={itens} mapa={pendente ?? partida} classificacoes={classificacoes} onClassificar={() => setAberto(true)}
        desabilitado={gravando || somenteLeitura} />
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex h-[min(660px,calc(100vh-16px))] w-[min(1180px,calc(100vw-16px))] max-w-none flex-col gap-2 p-4" data-testid="classificar-itens-modal">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-[13px]">Classificar itens · {itens.length} itens</DialogTitle>
            <DialogDescription className="sr-only">A conta de cada item da nota.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <ContasDosItens {...props} variante="modal" pendente={pendente} onMudou={mudou} onFechar={() => setAberto(false)}
              onDividir={(m) => { setAberto(false); onDividir(m); }}
              onJuntar={onJuntar ? (c) => { setAberto(false); setPendente(null); onJuntar(c); } : undefined} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
