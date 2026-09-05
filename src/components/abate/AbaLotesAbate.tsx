/**
 * A grade de lotes do abate — PRÓPRIA, e o motivo importa.
 *
 * ⚠ NÃO É `AbaNegociacaoLotes`, e não deve virar uma variante dela. Aquela grade serve
 * compra, venda, boitel e recebimento, e mostra o que essas quatro têm: categoria,
 * quantidade, peso, critério e valor. O cartão do abate mostra carcaça, rendimento e
 * líquido por arroba — grandezas que só existem depois do frigorífico pesar. Uma variante
 * por modo dentro do componente compartilhado colocaria as telas em homologação a um
 * `if` de distância de qualquer mexida no abate.
 *
 * ⚠ O CADASTRO DO LOTE, ESSE, É COMPARTILHADO: `LoteDialog` vem de `AbaNegociacaoLotes`.
 * O que é um lote (categoria, quantidade, peso) é a mesma pergunta nas quatro operações;
 * o que se faz com ele é que muda.
 *
 * ⚠ NENHUM NÚMERO É SOMADO AQUI A PARTIR DE CAMPO CRU. Cada lote passa por
 * `buildAbateCalculation` e o topo soma as PARCELAS que a lib devolveu. Recalcular a
 * cascata na tela criaria a segunda conta para a mesma pergunta — e a primeira vez que
 * discordasse da do cartão, ninguém saberia qual manda.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Ban, Plus, ChevronRight, AlertTriangle } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { LoteDialog } from '@/components/compra/AbaNegociacaoLotes';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { paraCalculo, linhaVazia, totaisDoAbate, type LoteAbate } from '@/components/abate/calculoDoLote';
import { ModalNegociarLote } from '@/components/abate/ModalNegociarLote';
import type { LinhaAbate, CenarioAbate } from '@/hooks/useOperacaoAbate';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import { subcentroAbatePorCategoria } from '@/hooks/useOperacaoLiquidacao';

const n2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg2 = (n: number) => `${n2(n)} kg`;
/** Valor negativo é SEMPRE vermelho, em toda a tela — regra do envelope. */
const CLS_NEG = 'text-destructive';

/**
 * Há negociação deste lote neste cenário?
 *
 * ⚠ ESPELHA A GUARDA DO BANCO, de propósito: `oc_salvar_abate` (NOVA 5) recusa lote sem
 * preço e sem carcaça (peso OU rendimento), porque sem os dois não há cálculo. Perguntar
 * a mesma coisa aqui faz a tela dizer "a negociar" exatamente nos lotes que a RPC
 * recusaria — em vez de mostrar uma cascata de zeros que parece negociada.
 */
function temNegociacao(l: LinhaAbate | undefined): boolean {
  if (!l) return false;
  return l.precoArroba != null && (l.pesoCarcacaKg != null || l.rendimentoCarcacaPct != null);
}

/** Uma linha do bloco-resumo. `forte` marca Bruto e Líquido. */
function LinhaSum({ rotulo, valor, cor, forte, vazio }: {
  rotulo: string; valor: number; cor?: string; forte?: boolean; vazio?: boolean;
}) {
  return (
    <>
      <div className={`${forte ? 'text-[13px] font-semibold text-foreground border-t pt-1 mt-0.5' : `text-[11px] ${cor ?? 'text-muted-foreground'}`}`}>
        {rotulo}
      </div>
      <div className={`text-right tabular-nums ${forte ? 'text-[13px] font-semibold text-foreground border-t pt-1 mt-0.5' : `text-[11px] ${cor ?? 'text-foreground'}`}`}>
        {vazio ? '—' : formatMoeda(valor)}
      </div>
    </>
  );
}

/** O bloco-resumo de seis linhas — o mesmo no cartão e (no 96c) no rodapé do modal. */
export function BlocoResumoLote({ c, vazio }: { c: AbateCalculation; vazio?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 rounded-md bg-muted/40 px-2 py-1.5 leading-[1.3]">
      <LinhaSum vazio={vazio}
        rotulo={vazio ? 'Base' : `Base (${n2(c.totalArrobas)} @ × ${formatMoeda(c.precoArroba)})`}
        valor={c.valorBase} />
      <LinhaSum vazio={vazio} rotulo="(+) Bônus" valor={c.totalBonus} cor={vazio ? undefined : 'text-emerald-600'} />
      <LinhaSum vazio={vazio} rotulo="(−) Descontos" valor={-c.totalDescontos} cor={vazio ? undefined : CLS_NEG} />
      <LinhaSum vazio={vazio} rotulo="Bruto" valor={c.valorBruto} forte />
      <LinhaSum vazio={vazio} rotulo="(−) Funrural e impostos" valor={-c.funruralTotal} cor={vazio ? undefined : CLS_NEG} />
      <LinhaSum vazio={vazio} rotulo="Líquido do lote" valor={c.valorLiquido} forte />
    </div>
  );
}

/**
 * A pílula do lote: negociado ou a negociar.
 *
 * ⚠ ELA NÃO DIZ MAIS O CENÁRIO. Dizer "Realizado" no cartão sugeria que aquele lote
 * estava num cenário próprio; o cenário é da LEITURA e vive no cabeçalho do card, uma vez
 * só. O que o cartão precisa responder é outra coisa: já tem preço e carcaça, ou não.
 */
function Pilula({ negociado }: { negociado: boolean }) {
  return negociado
    ? <span className="whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700">Negociado</span>
    : <span className="whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-700">A negociar</span>;
}

/** Uma coluna do bloco de topo: rótulo, valor grande, sub-linhas e o "evidente". */
function ColunaTopo({ rotulo, valor, unidade, linhaAt, subs, evidente, extra }: {
  rotulo: string; valor: string; unidade?: string; linhaAt?: string;
  subs?: string[]; evidente?: string; extra?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground leading-none">{rotulo}</div>
      <div className="mt-1 text-[20px] font-medium leading-tight tabular-nums truncate">
        {valor}{unidade && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{unidade}</span>}
      </div>
      {/* ⚠ ALINHADO À ESQUERDA, na mesma margem do valor: a arroba é outra leitura do
          MESMO número de cima, não um segundo dado. */}
      {linhaAt && <div className="text-[12px] font-medium text-foreground tabular-nums">{linhaAt}</div>}
      {subs?.map(s => <div key={s} className="text-[11px] text-muted-foreground tabular-nums truncate">{s}</div>)}
      {evidente && <div className="mt-0.5 text-[14px] font-semibold text-foreground tabular-nums">{evidente}</div>}
      {extra}
    </div>
  );
}

export function AbaLotesAbate({
  lotes, linhas, cenario, cenariosExistentes, onCenarioChange,
  lotesApi, categoriasDisponiveis, somenteLeitura, onLinhaChange,
}: {
  lotes: LoteAbate[];
  linhas: Map<string, LinhaAbate>;
  cenario: CenarioAbate;
  cenariosExistentes: CenarioAbate[];
  onCenarioChange: (c: CenarioAbate) => void;
  lotesApi: CompraLotesApi;
  categoriasDisponiveis: { value: string; label: string }[];
  somenteLeitura?: boolean;
  /** O rascunho do pai — quem persiste é o rodapé do shell. */
  onLinhaChange: (loteId: string, proxima: LinhaAbate) => void;
}) {
  /* Qual lote está aberto no cadastro. `null` = nenhum. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /* Qual lote está aberto na negociação. `null` = nenhum. */
  const [negociandoId, setNegociandoId] = useState<string | null>(null);
  /* Qual lote está para ser excluído. `null` = nenhum. */
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const calculos = useMemo(() => {
    const m = new Map<string, AbateCalculation>();
    lotes.forEach(l => m.set(l.id, buildAbateCalculation(paraCalculo(linhas.get(l.id) ?? linhaVazia(l.id), l))));
    return m;
  }, [lotes, linhas]);

  const t = useMemo(() => totaisDoAbate(lotes, calculos), [lotes, calculos]);

  const porCab = (v: number) => (t.cabecas > 0 ? formatMoeda(v / t.cabecas) : '—');
  const porArroba = (v: number) => (t.arrobas > 0 ? formatMoeda(v / t.arrobas) : '—');
  const algumNegociado = lotes.some(l => temNegociacao(linhas.get(l.id)));

  /* ABERTURA DIRETA, como na grade compartilhada: adicionar CRIA e ABRE no mesmo gesto.
     `adicionarLote` sozinho deixaria um lote sem categoria e sem peso, que a própria
     `oc_salvar_lotes` recusa — um lote fantasma que o operador não teria como preencher. */
  /* ⚠ HERDADO DO FORMULARIO QUE MORREU — o aviso veio junto, verbatim. Categoria fora do
     mapa de sexo nao gera lancamento classificado, e a venda, no mesmo ponto, cai em
     subcentro vazio: e' o defeito que a Mesa de Revisao existe para consertar depois.
     Perder este aviso ao trocar de tela seria trocar uma protecao por um layout. */
  const semSubcentro = lotes.filter(l => !subcentroAbatePorCategoria(l.categoria ?? ''));

  const abrirNovo = () => setEditandoId(lotesApi.adicionarLote());
  const emEdicao = editandoId ? lotesApi.lotes.find(l => l.idLocal === editandoId) ?? null : null;
  const negociando = negociandoId ? lotes.find(l => l.id === negociandoId) ?? null : null;
  const removendo = removendoId ? lotes.find(l => l.id === removendoId) ?? null : null;

  return (
    <div className="rounded-md border bg-card shadow-sm min-w-0">
      <div className="flex h-[38px] items-center gap-2.5 border-b px-3">
        <span className="text-[15px] font-medium text-foreground">Lotes</span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {lotes.length} · {t.cabecas} cab
        </span>
        {/* ⚠ UM SELETOR SÓ, E ELE MANDA NA ABA INTEIRA. O chip por cartão dizia que cada
            lote tinha o seu cenário, o que nunca foi verdade: o cenário é da leitura, não
            do lote — trocar aqui troca os quatro cartões, o topo e o resumo lateral. */}
        <div className="ml-auto flex gap-0.5 rounded-full border p-0.5">
          {(['projetado', 'realizado'] as CenarioAbate[]).map(c2 => (
            <button key={c2} type="button" onClick={() => onCenarioChange(c2)}
              title={cenariosExistentes.includes(c2) ? undefined : 'Ainda não há dados neste cenário'}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${c2 === cenario
                ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
              {c2 === 'projetado' ? 'Projetado' : 'Realizado'}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" className="h-7 shrink-0 gap-1 px-2.5 text-[11px]"
          disabled={somenteLeitura} onClick={abrirNovo}>
          <Plus className="h-3.5 w-3.5" /> Adicionar lote
        </Button>
      </div>

      {/* ── BLOCO DE TOPO ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5 border-b px-3.5 py-[11px] lg:grid-cols-4">
        <ColunaTopo rotulo="Animais" valor={String(t.cabecas)}
          unidade={`cab · ${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}`}
          subs={[`peso vivo ${kg2(t.pesoVivo)} total`]}
          evidente={`${n2(t.pesoMedio)} kg média`} />
        <ColunaTopo rotulo="Carcaça total" valor={n2(t.carcaca)} unidade="kg"
          linhaAt={`${n2(t.arrobas)} @`}
          subs={[`${n2(t.carcacaCab)} kg/cab · ${n2(t.arrobaCab)} @/cab`]}
          evidente={`RC ${n2(t.rc)}%`} />
        <ColunaTopo rotulo="Valor bruto (R$)" valor={n2(t.bruto)}
          subs={[`${porCab(t.bruto)}/cab`]} evidente={`${porArroba(t.bruto)}/@`} />
        <ColunaTopo rotulo="Valor líquido NF (R$)" valor={n2(t.liquido)}
          subs={[`${porCab(t.liquido)}/cab`]} evidente={`${porArroba(t.liquido)}/@`}
          extra={
            <div className="mt-1">
              <Pilula negociado={algumNegociado} />
            </div>
          } />
      </div>

      {/* ── OS LOTES, QUATRO POR FILEIRA ──────────────────────────────────────
          ⚠ A grade é a única coisa que rola. Com mais de quatro lotes ela quebra em
          fileiras de quatro; `minmax(0,1fr)` é o que permite às colunas encolherem — sem
          ele o `nowrap` das linhas do cartão (A22) estoura a grade para fora do card. */}
      {lotes.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-[12px] text-muted-foreground">
          Nenhum lote nesta operação. Use “Adicionar lote” para informar os animais abatidos.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 overflow-auto p-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {lotes.map(lote => {
            const linha = linhas.get(lote.id);
            const c = calculos.get(lote.id)!;
            const negociado = temNegociacao(linha);
            const form = lotesApi.lotes.find(l => l.idLocal === lote.id);
            const observacaoDoLote = form?.observacao?.trim() || null;
            /* "pelo total" avisa que o preço veio como base do lote, não por arroba —
               é o que explica um R$/@ quebrado como 361,46. */
            const peloTotal = linha?.precoFonte === 'total';
            return (
              <div key={lote.id} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border/60 bg-card px-2.5 py-2">
                <div className="truncate whitespace-nowrap text-[12px] font-medium text-foreground">
                  {lote.categoriaLabel} · {lote.quantidade} cab
                </div>
                <div><Pilula negociado={negociado} /></div>
                {observacaoDoLote && (
                  <div className="truncate whitespace-nowrap text-[11px] text-muted-foreground">
                    {/* ⚠ SEM PREFIXO "OC": o campo é livre e o operador já escreve
                        "OC 7914" nele — prefixar aqui produziria "OC OC 7914". Uma string
                        só, porque interpolar no JSX cria nós separados e o texto deixa de
                        ser encontrável como frase, inclusive por leitor de tela. */}
                    {`${observacaoDoLote}${peloTotal ? ' · pelo total' : ''}`}
                  </div>
                )}
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {n2(c.carcacaCalc * c.quantidade)} kg
                </div>
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">{n2(c.totalArrobas)} @</div>
                <div className="whitespace-nowrap text-[11px] font-semibold text-foreground">
                  {/* Sem peso vivo não há rendimento — e o traço diz isso, em vez de 0,0%. */}
                  {lote.pesoMedioKg > 0 && c.rendCalc > 0 ? `RC ${formatNum(c.rendCalc, 1)}%` : 'RC —'}
                </div>

                <div className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">Líquido do lote</div>
                {negociado ? (<>
                  <div className="whitespace-nowrap text-[15px] font-semibold tabular-nums">{formatMoeda(c.valorLiquido)}</div>
                  <div className="whitespace-nowrap text-[11px] font-semibold tabular-nums">{formatMoeda(c.liqArroba)}/@</div>
                  <div className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
                    {lote.quantidade > 0 ? `${formatMoeda(c.valorLiquido / lote.quantidade)}/cab` : '—'}
                  </div>
                </>) : (
                  <div className="whitespace-nowrap text-[12px] font-semibold text-amber-700">—</div>
                )}

                {/* ⚠ `mt-auto` GRUDA AS AÇÕES NO FUNDO: sem ele, cartões de alturas
                    diferentes (um com observação, outro sem) deixam os botões em alturas
                    diferentes na mesma fileira, e o olho tem de procurar cada um. */}
                <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                  <Button type="button" size="sm" variant={negociado ? 'secondary' : 'default'}
                    className="h-6 min-w-0 flex-1 px-2 text-[11px]"
                    onClick={() => setNegociandoId(lote.id)}>
                    Negociar ›
                  </Button>
                  <button type="button" title="Editar lote" aria-label="Editar lote"
                    disabled={somenteLeitura} onClick={() => setEditandoId(lote.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button type="button" title="Excluir lote" aria-label="Excluir lote"
                    disabled={somenteLeitura} onClick={() => setRemovendoId(lote.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-muted-foreground hover:text-destructive disabled:opacity-40">
                    <Ban className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {removendo && (
        <Dialog open onOpenChange={(o) => { if (!o) setRemovendoId(null); }}>
          <DialogContent className="max-w-sm">
            {/* ⚠ CONFIRMA NOMEANDO O LOTE. Excluir sem perguntar apaga a negociação junto
                (o abate do lote cai por CASCATA), e "removi o lote errado" não tem desfazer
                nesta tela. O nome é o que permite ao operador ver que é o lote certo. */}
            <DialogTitle className="text-[14px]">Excluir lote</DialogTitle>
            <DialogDescription className="text-[11px]">
              {removendo.categoriaLabel} · {removendo.quantidade} cab — a negociação deste lote
              também é perdida. A exclusão só vale depois de salvar a negociação.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRemovendoId(null)}>Voltar</Button>
              <Button type="button" onClick={() => { lotesApi.removerLote(removendo.id); setRemovendoId(null); }}>
                Excluir lote
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {negociando && (
        <ModalNegociarLote
          lote={negociando}
          linha={linhas.get(negociando.id)}
          cenario={cenario}
          somenteLeitura={somenteLeitura}
          onAplicar={(proxima) => onLinhaChange(negociando.id, proxima)}
          onFechar={() => setNegociandoId(null)}
        />
      )}

      {emEdicao && (
        <LoteDialog
          lote={emEdicao}
          categoriasDisponiveis={categoriasDisponiveis}
          /* Mesma resolução da grade compartilhada (AbaNegociacaoLotes:220): o slug vira
             rótulo pelo catálogo, e sem catálogo mostra o slug em vez de vazio. */
          rotuloCategoria={(slug: string) =>
            categoriasDisponiveis.find(c => c.value === slug)?.label || slug || 'Sem categoria'}
          fisicoRO={false}
          /* ⚠ SEM CRITÉRIO E SEM VALOR no abate: o valor do lote nasce da carcaça, do
             preço da @ e dos bônus, na negociação — `oc_salvar_abate` soma os líquidos em
             `valor_acordado`. Pedir um valor aqui seria um segundo número para a mesma
             pergunta, e o operador não teria como saber qual vale. */
          semValor
          comObservacao
          somenteLeitura={!!somenteLeitura}
          onAplicar={(patch) => { lotesApi.editarLote(emEdicao.idLocal, patch); setEditandoId(null); }}
          onAplicarEAdicionar={(patch) => { lotesApi.editarLote(emEdicao.idLocal, patch); abrirNovo(); }}
          onFechar={() => setEditandoId(null)}
        />
      )}
    </div>
  );
}
