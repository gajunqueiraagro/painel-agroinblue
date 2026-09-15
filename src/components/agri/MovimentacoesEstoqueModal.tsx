/**
 * MOVIMENTAÇÕES DO ESTOQUE — o histórico da quebra, com estorno e correção (F2.1).
 *
 * ⚠ ELE É O ÚNICO LUGAR ONDE A BAIXA CANCELADA APARECE. As três leituras de saldo filtram `ativo`,
 * então uma quebra cancelada some do estoque — o que é certo — e ficaria invisível, o que não é.
 * Sem esta lista, cancelar seria indistinguível de nunca ter registrado.
 * ⚠ E É POR ISSO QUE A CANCELADA NÃO SOME DAQUI, só se risca: "documento se cancela, nunca se
 * apaga" (PARTE 6 dos padrões) aplicada ao estoque. A linha riscada é a prova de que a baixa
 * existiu e de quem a desfez.
 *
 * ⚠ A LISTA É A18 — linha de duas alturas, sem `<table>` e sem cabeçalho de coluna. Identidade em
 * cima, contexto embaixo, estado e ações à direita: cinco larguras que numa tabela disputariam a
 * mesma linha.
 *
 * ⚠ NENHUM SALDO SE CALCULA AQUI. O bloco de topo soma as quantidades ATIVAS desta lista para
 * dizer quanto de quebra há — isso é a própria lista falando de si. O saldo do estoque continua
 * vindo de `fn_estoque_graos`, e é a tela atrás que o mostra.
 */
import { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';
import { X, Pencil, Ban, AlertTriangle, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import { MOTIVOS } from '@/components/agri/QuebraModal';
import type { EstoqueMovimentacao } from '@/hooks/useEstoqueGraos';

/** O que a edição devolve — só o descritivo. Quantidade e classe não se editam. */
export interface QuebraEdicaoPayload {
  id: string;
  data: string;
  motivo: string;
  observacoes: string | null;
}

/* ⚠ O MESMO MAPA DO `QuebraModal`, importado — não uma segunda lista. Ele é o `CHECK` da tabela
   escrito em português, e dois vocabulários para o mesmo domínio é como o cinza do cabeçalho
   acabou em quatro arquivos. Um motivo que o mapa não conheça volta cru, que é melhor que sumir. */
const labelDoMotivo = (v: string) => MOTIVOS.find(m => m.valor === v)?.rotulo ?? v;

const dataBR = (iso: string | null) => (iso && iso.length >= 10 ? formatIsoToBr(iso.slice(0, 10)) : '—');

export function MovimentacoesEstoqueModal({
  aberto, onFechar, movimentacoes, carregando, erro, cultura, safraRotulo,
  onCancelar, onEditar, salvando,
}: {
  aberto: boolean;
  onFechar: () => void;
  movimentacoes: readonly EstoqueMovimentacao[];
  carregando: boolean;
  erro: Error | null;
  cultura: string;
  safraRotulo: string;
  onCancelar: (id: string, motivo: string) => void;
  onEditar: (p: QuebraEdicaoPayload) => void;
  salvando: boolean;
}) {
  /** O id em cancelamento, e o motivo digitado. `null` = ninguém sendo cancelado. */
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  /** O id em edição, com os três campos descritivos. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edData, setEdData] = useState('');
  const [edMotivo, setEdMotivo] = useState('');
  const [edObs, setEdObs] = useState('');

  const unidade = unidadeCurtaDaCultura(cultura);

  /* ⚠ MESMA REGRA DO HISTÓRICO DE VENDAS: cancelada é arquivo, não pauta. Aqui elas vinham
     MISTURADAS com as ativas, não abaixo de um total — pior ainda, porque a riscada aparecia no
     meio da leitura. Começa fechado sempre, pelo mesmo motivo de lá. */
  const [verCanceladas, setVerCanceladas] = useState(false);

  const topo = useMemo(() => {
    const ativas = movimentacoes.filter(m => m.ativo);
    return {
      quebraAtiva: ativas.reduce((a, m) => a + m.quantidade, 0),
      ativas: ativas.length,
      canceladas: movimentacoes.length - ativas.length,
    };
  }, [movimentacoes]);

  /* ⚠ A LISTA VISÍVEL, e o `topo` continua contando TODAS — o cabeçalho diz "2 ativas · 3
     canceladas" mesmo com as três escondidas, que é o que torna o interruptor descobrível. */
  const canceladas = useMemo(() => movimentacoes.filter(m => !m.ativo), [movimentacoes]);
  const visiveis = useMemo(
    () => (verCanceladas ? movimentacoes : movimentacoes.filter(m => m.ativo)),
    [movimentacoes, verCanceladas]);

  const abrirEdicao = (m: EstoqueMovimentacao) => {
    setCancelandoId(null);
    setEditandoId(m.id);
    setEdData(m.data.slice(0, 10));
    setEdMotivo(m.motivo);
    setEdObs(m.observacoes ?? '');
  };

  const abrirCancelamento = (id: string) => {
    setEditandoId(null);
    setCancelandoId(id);
    setMotivoCancel('');
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Movimentações · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              Tudo que saiu do estoque sem dinheiro, incluindo o que foi cancelado.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ O BLOCO DE TOPO NÃO ROLA — A21. Ele é o que o operador confere enquanto percorre a
            lista; rolar junto seria perder de vista o número que a lista explica.
            ⚠ A ROLAGEM MORA NA LISTA, não neste container: `sticky` se ancora no scrollport mais
            próximo, e se fosse o corpo do modal o bloco subiria junto. */}
        {/* ⚠⚠ `min-w-0` AQUI É A CORREÇÃO INTEIRA, e a causa não era a que se suporia. `DialogContent`
            é um **grid** (`ui/dialog.tsx:49`), e item de grid nasce com `min-width: auto` — ele se
            recusa a encolher abaixo da largura mínima do conteúdo. Com `whitespace-nowrap` na
            linha 2 da cancelada, o mínimo virou o texto inteiro: MEDIDO no harness com o CSS do
            build, o corpo ficou com 873,6px dentro de um modal de 672px.
            ⚠ E FOI ISSO QUE SUMIU COM OS ÍCONES. Eles sempre existiram e sempre renderizaram: a
            coluna de ações terminava em 877,6px, o modal termina em 696px, e o `overflow-hidden`
            do `DialogContent` — que existe para o "L" branco dos cantos — os cortava. Não era
            hover-only nem ausência de render; era clipping.
            ⚠ E ERA TAMBÉM POR ISSO QUE O `truncate` NÃO DISPARAVA: `text-overflow` só corta quando
            há um limite, e o container nunca teve um. Medido depois: 670px de corpo, ícones em
            674px (dentro), e a linha 2 com `clientWidth` 556 contra `scrollWidth` 760 — cortando.
            ⚠ A LISTA LEVA O MESMO `min-w-0` porque ela é o próximo elo: sem ele, o item flex de
            dentro repetiria a recusa um nível abaixo. */}
        <div className="min-w-0 space-y-2 px-3 py-2">
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px]">
            <div className="min-w-0">
              <div className="text-[11px] font-normal leading-none text-muted-foreground">Quebra ativa</div>
              <div className="mt-1 truncate whitespace-nowrap text-[20px] font-medium leading-none tabular-nums">
                {formatNum(topo.quebraAtiva, 2)} <span className="text-[11px] text-muted-foreground">{unidade}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-normal leading-none text-muted-foreground">Movimentações</div>
              <div className="mt-1 truncate whitespace-nowrap text-[20px] font-medium leading-none tabular-nums">
                {movimentacoes.length}
              </div>
              <div className="mt-1 truncate whitespace-nowrap text-[11px] text-muted-foreground">
                {topo.ativas} ativa{topo.ativas === 1 ? '' : 's'} · {topo.canceladas} cancelada{topo.canceladas === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="max-h-[52vh] min-w-0 overflow-y-auto rounded-md border">
            {/* ⚠ OS TRÊS ESTADOS SEPARADOS, como nas outras listas de grão: uma falha de leitura
                renderizada como "nenhuma movimentação" afirmaria que nunca se baixou nada. */}
            {erro ? (
              <div className="px-2 py-6 text-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar o histórico.
                </span>
                <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
                  A lista não foi lida — o dado continua no banco.
                </div>
              </div>
            ) : carregando ? (
              <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </span>
              </div>
            ) : movimentacoes.length === 0 ? (
              <div className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Nenhuma movimentação nesta safra.
              </div>
            ) : visiveis.map(m => {
              /* ⚠ O TEXTO INTEIRO VAI PARA O `title`, porque a linha agora CORTA. Reticências sem
                 como ler o resto seria esconder o motivo do estorno — que é justamente o que o
                 histórico existe para mostrar. */
              const l1 = `Quebra · ${labelDaClasse(m.classe)} · ${formatNum(m.quantidade, 2)} ${unidade} · ${labelDoMotivo(m.motivo)}`;
              const l2 = [
                dataBR(m.data),
                m.autor || '—',
                m.observacoes || null,
                !m.ativo
                  ? `cancelada em ${dataBR(m.cancelado_em)} por ${m.cancelado_por || '—'}${m.motivo_cancelamento ? `: ${m.motivo_cancelamento}` : ''}`
                  : null,
              ].filter(Boolean).join(' · ');
              return (
              <div key={m.id} className="border-t border-slate-100 first:border-t-0">
                <div className={cn('flex items-start gap-2 px-2 py-1.5',
                  !m.ativo && 'bg-muted/30 text-muted-foreground line-through')}>
                  <div className="min-w-0 flex-1">
                    {/* ⚠ LINHA 1 — A IDENTIDADE (12px/500): o que, de que classe, quanto e por quê. */}
                    <div className="truncate text-[12px] font-medium" title={l1}>
                      {/* ⚠ A BOLINHA DA CANCELADA NÃO GRITA: a cor da classe é sinal operacional —
                          "este é o grão bom" —, e numa linha estornada ela apontaria para uma
                          decisão que foi desfeita. Cinza, como o resto da linha. */}
                      <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                        m.ativo ? corDaClasse(m.classe) : 'bg-muted-foreground/40')} />
                      Quebra · {labelDaClasse(m.classe)} ·{' '}
                      <span className="tabular-nums">{formatNum(m.quantidade, 2)}</span> {unidade} ·{' '}
                      {labelDoMotivo(m.motivo)}
                    </div>
                    {/* ⚠ LINHA 2 — O CONTEXTO (10px muted): quando, quem, e o que se escreveu. */}
                    <div className="truncate text-[10px] text-muted-foreground" title={l2}>
                      {dataBR(m.data)} · {m.autor || '—'}
                      {m.observacoes && ` · ${m.observacoes}`}
                      {/* ⚠ O ESTORNO CONTA A PRÓPRIA HISTÓRIA na mesma linha: quando, por quem e
                          por quê. Sem isto, "Cancelada" seria um carimbo sem explicação. */}
                      {!m.ativo && (
                        <> · cancelada em {dataBR(m.cancelado_em)} por {m.cancelado_por || '—'}
                          {m.motivo_cancelamento ? `: ${m.motivo_cancelamento}` : ''}</>
                      )}
                    </div>
                  </div>
                  {/* ⚠ A PÍLULA DIZ O ESTADO e os ícones dizem o que fazer — 14px, `gap` 11px,
                      com `title` E `aria-label`, como manda o A18.
                      ⚠ CANCELADA NÃO TEM AÇÃO: editar uma baixa estornada seria reescrever a
                      história, e o banco recusa (`MOVIMENTACAO_CANCELADA_NAO_EDITA`). Esconder os
                      ícones diz isso antes de o operador tentar. */}
                  <div className="flex shrink-0 items-center gap-[11px] no-underline">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium no-underline',
                      m.ativo ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                      {m.ativo ? 'Ativa' : 'Cancelada'}
                    </span>
                    {m.ativo && (
                      <>
                        <button type="button" onClick={() => abrirEdicao(m)}
                          title="Editar data, motivo e observações" aria-label="Editar movimentação"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => abrirCancelamento(m.id)}
                          title="Cancelar esta quebra" aria-label="Cancelar movimentação"
                          className="rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {cancelandoId === m.id && (
                  <ConfirmarComMotivo className="mx-2 mb-2"
                    titulo="Cancelar esta quebra (lógico — continua no histórico)"
                    motivo={motivoCancel} onMotivoChange={setMotivoCancel}
                    onVoltar={() => setCancelandoId(null)}
                    confirmando={salvando}
                    onConfirmar={() => onCancelar(m.id, motivoCancel.trim())} />
                )}

                {editandoId === m.id && (
                  <div className="mx-2 mb-2 space-y-2 rounded-md border bg-muted/20 p-2">
                    {/* ⚠ QUANTIDADE E CLASSE SÓ COMO TEXTO, e a frase explica a saída: mudar a
                        quantidade de uma baixa gravada reescreveria o saldo do passado sem deixar
                        rastro de qual era. O caminho é cancelar e registrar de novo — aí o
                        histórico guarda as duas linhas. */}
                    <p className="text-[10px] text-muted-foreground">
                      {labelDaClasse(m.classe)} · <span className="tabular-nums">{formatNum(m.quantidade, 2)}</span> {unidade}.
                      {' '}Para corrigir quantidade ou classe, cancele e registre de novo.
                    </p>
                    {/* ⚠ A MESMA ANATOMIA DO `QuebraModal` — rótulo 10px em cima, controle `h-8`
                        embaixo, DatePicker SEM `compact`. */}
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <Label className="text-[10px]">Data da quebra <span className="text-destructive">*</span></Label>
                        <DatePicker value={edData} onChange={setEdData} className="mt-0.5" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Motivo <span className="text-destructive">*</span></Label>
                        <Select value={edMotivo} onValueChange={setEdMotivo}>
                          <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                            <SelectValue placeholder="Escolha" />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTIVOS.map(o => (
                              <SelectItem key={o.valor} value={o.valor} className="text-[12px]">
                                {o.rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">Observações</Label>
                      <Input value={edObs} onChange={e => setEdObs(e.target.value)}
                        placeholder="O que aconteceu — opcional" className="mt-0.5 h-8 text-[12px]" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                        onClick={() => setEditandoId(null)}>
                        Voltar
                      </Button>
                      <Button type="button" variant="acao" size="sm" className="h-6 gap-1 text-[11px]"
                        disabled={!edData || !edMotivo || salvando}
                        title={!edData ? 'Informe a data da quebra.'
                          : !edMotivo ? 'Escolha o motivo da quebra.' : 'Salvar a correção'}
                        onClick={() => onEditar({
                          id: m.id, data: edData, motivo: edMotivo,
                          observacoes: edObs.trim() || null,
                        })}>
                        <Save className="h-3 w-3" /> Salvar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            {/* ⚠ O INTERRUPTOR FECHA A LISTA, e só existe com cancelada: sem nenhuma ele
                afirmaria que há algo escondido onde não há. */}
            {canceladas.length > 0 && !erro && !carregando && (
              <div className="border-t border-slate-100 px-2 py-1 text-[11px] text-muted-foreground">
                {canceladas.length} cancelada{canceladas.length === 1 ? '' : 's'}
                {' · '}
                <button type="button" onClick={() => setVerCanceladas(o => !o)}
                  className="rounded font-medium text-primary underline-offset-2 hover:underline">
                  {verCanceladas ? 'ocultar' : 'mostrar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
