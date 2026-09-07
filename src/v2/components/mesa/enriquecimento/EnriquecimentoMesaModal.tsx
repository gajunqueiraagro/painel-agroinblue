// ============================================================================
// EnriquecimentoMesaModal — a Mesa de Revisão ampla (MESA-ENR-UX-01, envelope 129).
//
// ⚠ A MOLDURA NÃO ROLA. Cabeçalho, bloco de topo, cabeçalho das colunas e rodapé são
// fixos; rolam DUAS coisas e só elas: a lista da esquerda e a tabela de campos da direita
// (A21). A cadeia que sustenta isso é `h-[92vh]` → `flex-col` → `flex-1 min-h-0` no corpo
// → `min-h-0` em cada card → `overflow-y-auto` só nos dois scrollports. Tirar qualquer
// `min-h-0` faz o filho crescer e a moldura voltar a rolar — foi assim nas duas vezes em
// que o `sticky` "existia e não grudava".
//
// ⚠ COMPONENTE BURRO. Recebe os mesmos prop-bags que a aba usa (lista/detalhe/actions) e
// mais o que só a superfície ampla tem: agrupamento, filtros com contagem e "aplicar ao
// grupo". Nada é buscado nem calculado aqui além de agrupar e somar o que já veio.
// ============================================================================
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { EnriquecimentoListaProps } from './EnriquecimentoLista';
import type { EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import type { EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { MesaCamposTabela } from './MesaCamposTabela';
import type { EnriqRowVM } from './types';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Como a lista da esquerda é organizada. 'lista' = ordem original, sem grupos. */
type Agrupamento = 'lista' | 'fornecedor' | 'subcentro';
/** Os quatro recortes do mock. 'todas' quando nenhum chip está ligado. */
type FiltroEstado = 'todas' | 'revisar' | 'sem_vinculo' | 'divergentes' | 'exatas';

/** O subcentro que a linha exibe como contexto — o proposto, que é o que se revisa. */
const subcentroDa = (r: EnriqRowVM) => r.edicao.subcentro ?? '— sem subcentro';

/**
 * ⚠ O RECORTE SAI DO ESTADO QUE O ADAPTER JÁ CALCULOU, não de uma regra nova aqui:
 * `estado` distingue revisar / sem_vinculo / aplicado, e `status` distingue exato de
 * divergente. Recalcular no front seria a segunda resposta para "o que falta revisar".
 */
function passaNoFiltro(r: EnriqRowVM, f: FiltroEstado): boolean {
  switch (f) {
    case 'revisar': return r.estado === 'revisar';
    case 'sem_vinculo': return r.estado === 'sem_vinculo';
    case 'divergentes': return r.status === 'divergente';
    case 'exatas': return r.status === 'exato';
    default: return true;
  }
}

export interface EnriquecimentoMesaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo da sessão ativa (mesmo label do seletor da toolbar). '—' quando não há. */
  sessaoLabel: string | null;
  lista: EnriquecimentoListaProps;
  detalhe: EnriquecimentoDetalheProps;
  actions: EnriquecimentoActionsProps;
  /**
   * Leva Fornecedor, Fazenda e Subcentro da linha atual às demais do grupo marcadas
   * "revisar" — 129. Recebe os ids das linhas alvo; quem grava é o pai, com a MESMA RPC
   * do Salvar, uma chamada por linha.
   * ⚠ SAFRA NÃO VAI JUNTO, e o botão diz isso: `fn_classificacao_apply_row` não grava
   * `safra_id`. Prometer os quatro e entregar três seria pior que entregar três.
   */
  onAplicarAoGrupo?: (ids: string[]) => Promise<void>;
  aplicandoGrupo?: boolean;
}

export function EnriquecimentoMesaModal({
  open, onOpenChange, sessaoLabel, lista, detalhe, actions, onAplicarAoGrupo, aplicandoGrupo,
}: EnriquecimentoMesaModalProps) {
  const [agrupamento, setAgrupamento] = useState<Agrupamento>('lista');
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');

  const rows = lista.rows;
  const contagens = useMemo(() => ({
    revisar: rows.filter(r => r.estado === 'revisar').length,
    sem_vinculo: rows.filter(r => r.estado === 'sem_vinculo').length,
    divergentes: rows.filter(r => r.status === 'divergente').length,
    exatas: rows.filter(r => r.status === 'exato').length,
  }), [rows]);

  const visiveis = useMemo(() => rows.filter(r => passaNoFiltro(r, filtro)), [rows, filtro]);

  /** Os grupos, na ordem em que aparecem na lista — sem reordenar o que veio do adapter. */
  const grupos = useMemo(() => {
    if (agrupamento === 'lista') return [{ nome: null as string | null, linhas: visiveis }];
    const chave = (r: EnriqRowVM) => (agrupamento === 'fornecedor' ? r.fornecedor : subcentroDa(r));
    const mapa = new Map<string, EnriqRowVM[]>();
    for (const r of visiveis) {
      const k = chave(r) || '—';
      const atual = mapa.get(k);
      if (atual) atual.push(r); else mapa.set(k, [r]);
    }
    return Array.from(mapa, ([nome, linhas]) => ({ nome, linhas }));
  }, [visiveis, agrupamento]);

  const selecionada = rows.find(r => r.id === lista.selecionadoId) ?? null;
  /* As outras linhas do grupo da selecionada que ainda pedem revisão — o alvo do
     "aplicar ao grupo". Exatas e já revisadas ficam de fora, como o envelope manda. */
  const alvosDoGrupo = useMemo(() => {
    if (!selecionada || agrupamento === 'lista') return [];
    const chave = (r: EnriqRowVM) => (agrupamento === 'fornecedor' ? r.fornecedor : subcentroDa(r));
    const k = chave(selecionada);
    return rows.filter(r => r.id !== selecionada.id && chave(r) === k && r.estado === 'revisar' && !r.aplicado);
  }, [rows, selecionada, agrupamento]);

  const chip = (id: FiltroEstado, rotulo: string, n: number) => (
    <button type="button" key={id}
      onClick={() => setFiltro(filtro === id ? 'todas' : id)}
      className={`rounded-full border px-2 py-px text-[10px] ${
        filtro === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
      {rotulo} · {n}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠ `h-[92vh]` E `max-h-[92vh]` JUNTOS: o primeiro dá a altura que a cadeia flex
          precisa para existir; o segundo impede que o conteúdo a estoure. Em 1440×900 são
          828px, e o esqueleto (44 + corpo + 44) cabe sem rolar a moldura. */}
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="h-11 shrink-0 flex-row items-center gap-2.5 space-y-0 bg-primary px-4">
          <DialogTitle className="text-[14px] font-semibold text-primary-foreground">
            Mesa de revisão · Enriquecimento
          </DialogTitle>
          <span className="min-w-0 truncate text-[11px] text-primary-foreground/85" title={sessaoLabel ?? undefined}>
            {sessaoLabel ?? '—'}
          </span>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 md:[grid-template-columns:340px_1fr]">
          {/* ═══ ESQUERDA: as linhas da sessão ═══════════════════════════════════ */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
            {/* ⚠ DUAS LINHAS, NÃO UMA. Medido: em 340px o título, a contagem e o seletor
                de três posições não cabem lado a lado — "Linhas da sessão" quebrava em três
                linhas e o cabeçalho crescia. Título e contagem em cima, seletor embaixo. */}
            <div className="shrink-0 space-y-1 border-b px-3 py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide">Linhas da sessão</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {contagens.revisar} a revisar · {contagens.exatas} exatas
                </span>
              </div>
              <div className="flex rounded-full border p-0.5">
                {([['lista', 'Lista'], ['fornecedor', 'Fornecedor'], ['subcentro', 'Subcentro']] as const).map(([id, rot]) => (
                  <button type="button" key={id} onClick={() => setAgrupamento(id)}
                    className={`flex-1 rounded-full px-2 py-px text-[10px] ${
                      agrupamento === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    {rot}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-1.5">
              {chip('revisar', 'A revisar', contagens.revisar)}
              {chip('sem_vinculo', 'Sem vínculo', contagens.sem_vinculo)}
              {chip('divergentes', 'Divergentes', contagens.divergentes)}
              {chip('exatas', 'Exatas', contagens.exatas)}
            </div>

            {/* ⚠ O ÚNICO SCROLLPORT DESTE LADO. Um `max-h` interno aqui criaria a segunda
                barra que o A21 proíbe — e rolar a de dentro não moveria o cabeçalho. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visiveis.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-muted-foreground">Nenhuma linha neste recorte.</p>
              ) : grupos.map(({ nome, linhas }) => (
                <div key={nome ?? '__lista__'}>
                  {nome !== null && (
                    /* ⚠ FUNDO OPACO E `z` ACIMA — A21. Transparente é pior que não fixar:
                        as linhas passariam por baixo do total que se está conferindo. */
                    <div className="sticky top-0 z-[2] flex items-center gap-1.5 border-b bg-muted px-3 py-1 text-[10px] font-medium">
                      <span className="min-w-0 truncate">{nome}</span>
                      <span className="shrink-0 font-normal text-muted-foreground">· {linhas.length} linhas</span>
                      <span className="ml-auto shrink-0 tabular-nums">
                        {brl(linhas.reduce((acc, r) => acc + (r.valorNum ?? 0), 0))}
                      </span>
                    </div>
                  )}
                  {linhas.map(r => {
                    const sel = r.id === lista.selecionadoId;
                    const pill = r.estado === 'sem_vinculo'
                      ? { t: 'sem vínculo', c: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' }
                      : r.estado === 'revisar'
                        ? { t: 'revisar', c: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' }
                        : { t: r.aplicado ? 'aplicada' : 'exata', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' };
                    return (
                      <button type="button" key={r.id} onClick={() => lista.onSelecionar(r.id)}
                        className={`grid w-full items-center gap-1.5 border-b border-border/60 py-1 pr-3 text-left ${
                          sel ? 'border-l-[3px] border-l-primary bg-primary/[0.08] pl-[17px]' : 'pl-5'}`}
                        style={{ gridTemplateColumns: '52px minmax(0,1fr) 86px' }}>
                        <span className="text-[10px] text-muted-foreground">{r.data}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-medium" title={r.fornecedor}>{r.fornecedor}</span>
                          <span className="block truncate text-[10px] text-muted-foreground" title={subcentroDa(r)}>
                            {subcentroDa(r)}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[11px] font-medium tabular-nums">{r.valor}</span>
                          <span className={`inline-block rounded-full px-1.5 text-[9px] ${pill.c}`}>{pill.t}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ DIREITA: a linha selecionada ════════════════════════════════════ */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
            {!selecionada ? (
              /* ⚠ `flex-1` NO VAZIO TAMBÉM: sem ele o parágrafo mede o próprio texto e o
                 rodapé sobe para debaixo dele, no meio do card. Medido na tela. */
              <p className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[11px] text-muted-foreground">
                Selecione uma linha à esquerda para revisar.
              </p>
            ) : (
              <>
                <div className="grid shrink-0 grid-cols-4 gap-2 border-b bg-muted px-3 py-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Linha</div>
                    <div className="text-[18px] font-medium leading-tight">{actions.posicao}</div>
                    <div className="truncate text-[10px] text-muted-foreground" title={selecionada.fornecedor}>
                      {selecionada.fornecedor} · {selecionada.data}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Valor</div>
                    <div className="text-[18px] font-medium leading-tight tabular-nums">{selecionada.valor}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {selecionada.comparativo.find(c => c.campo === 'Valor')?.resultado ?? '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">Resolução</div>
                    <div className="truncate text-[13px] font-medium leading-tight">
                      {selecionada.proveniencia.origem ?? '—'}
                      {selecionada.proveniencia.motorVersion != null ? ` · motor v${selecionada.proveniencia.motorVersion}` : ''}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">{subcentroDa(selecionada)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">O que muda</div>
                    {/* ⚠ A CONTA VEM DO COMPARATIVO, que é onde os toms já foram decididos:
                        contar "campos que mudam" de outro jeito daria dois números para a
                        mesma pergunta na mesma tela. */}
                    <div className={`text-[13px] font-medium leading-tight ${selecionada.mudaAlgo ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                      {(() => {
                        const n = selecionada.comparativo.filter(c => c.tom === 'muda' || c.tom === 'difere').length;
                        return n === 0 ? 'nada muda' : `${n} campo${n > 1 ? 's' : ''}`;
                      })()}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {selecionada.comparativo.filter(c => c.tom === 'muda' || c.tom === 'difere')
                        .map(c => c.campo).join(' · ') || '—'}
                    </div>
                  </div>
                </div>

                <MesaCamposTabela
                  row={selecionada}
                  classificacoes={detalhe.classificacoes}
                  fornecedores={detalhe.fornecedores}
                  fazendas={detalhe.fazendas}
                  clienteId={detalhe.clienteId}
                  safras={detalhe.safras}
                  contas={detalhe.contas}
                  onEditar={detalhe.onEditar}
                  onCriarFornecedor={detalhe.onCriarFornecedor}
                />
              </>
            )}

            {/* ═══ RODAPÉ FIXO ══════════════════════════════════════════════════ */}
            {/* ⚠ O RODAPÉ NÃO PODE CORTAR BOTÃO. Medido: em viewport de 1168 o painel
                direito fica com ~750px, e a barra do mock não cabia — "Salvar e próximo"
                saía pela borda (overflowX de 62px). `gap-1.5`, `px-2` e `whitespace-nowrap`
                em tudo, com o contador em `truncate`: quem cede é o texto, nunca o botão.
                Em 1440 sobra folga; em 1168 encaixa. */}
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-t px-2">
              <Button size="sm" variant="ghost" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onAnterior} disabled={!actions.canAnterior}>◀ Anterior</Button>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onProximo} disabled={!actions.canProximo}>Próximo ▶</Button>
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onReverter} disabled={actions.reverterDisabled || actions.isBusy}>↺ Reverter</Button>
              <div className="flex-1" />
              <label className="flex min-w-0 shrink items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                <input type="checkbox" className="shrink-0" checked={actions.revisado}
                  disabled={actions.aplicarTodosDisabled || actions.isBusy}
                  onChange={e => actions.onRevisado(e.target.checked)} />
                <span className="truncate">Revisado · {actions.posicao}</span>
              </label>
              {onAplicarAoGrupo && (
                <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                  disabled={alvosDoGrupo.length === 0 || !!aplicandoGrupo || actions.isBusy}
                  title={agrupamento === 'lista'
                    ? 'Agrupe por fornecedor ou subcentro para aplicar ao grupo.'
                    : alvosDoGrupo.length === 0
                      ? 'Nenhuma outra linha deste grupo pede revisão.'
                      : 'Leva Fornecedor, Fazenda e Subcentro desta linha às outras do grupo. A safra NÃO vai junto — o Salvar ainda não grava safra.'}
                  onClick={() => { void onAplicarAoGrupo(alvosDoGrupo.map(r => r.id)); }}>
                  {aplicandoGrupo ? 'Aplicando…' : `Ao grupo (${alvosDoGrupo.length})`}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onAplicarTodos}
                disabled={actions.aplicarTodosDisabled || !actions.revisado || actions.isBusy}
                title="Acelerador: aplica todos os Exatos pendentes DA SESSÃO, sem sobrescrever classificações existentes. Marque 'Revisado' para habilitar.">
                Exatos ({actions.nAplicaveis})
              </Button>
              <Button size="sm" variant="outline" className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={actions.onSalvar} disabled={actions.salvarDisabled || actions.isBusy}>Salvar</Button>
              <Button size="sm" className="h-7 shrink-0 whitespace-nowrap bg-[#f3c84a] px-2.5 text-[11px] font-medium text-foreground hover:bg-[#e8bd3e]"
                onClick={actions.onSalvarProximo} disabled={actions.salvarDisabled || actions.isBusy}>
                Salvar e próximo
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
