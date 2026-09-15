/**
 * VENDAS E ENTREGAS — o histórico do que saiu do estoque com contrapartida (F3).
 *
 * ⚠ ELE É O IRMÃO DO `MovimentacoesEstoqueModal`, e a estrutura foi COPIADA, não importada: mesmo
 * cabeçalho, mesmo topo A18, mesma linha de duas alturas, mesmo riscado, mesmo `ConfirmarComMotivo`.
 * Importar criaria um componente com dois modos e um `if` em cada linha; copiar deixa os dois
 * livres para divergir onde o assunto difere — e aqui difere bastante: há dinheiro, há lançamento
 * no Financeiro e há uma operação (o barter) que esta tela mostra mas NÃO governa.
 *
 * ⚠⚠ O BARTER APARECE E NÃO SE MEXE. O "Entregue" do estoque é a soma de venda avulsa COM entrega
 * de barter; esconder metade faria a conta não fechar na tela. Mas o barter tem contrato, insumos
 * e conta de permuta — cancelar ali é outro gesto, e a RPC recusa aqui com `VENDA_NAO_AVULSA_*`.
 * Então ele vem sem ícones, com a pílula dizendo o que é.
 * ⚠ E SEM LINK PARA O CONTRATO — decisão do Gabriel (15/09). Não existe rota para abrir um
 * contrato de barter por id: o `AgriBarterTab` abre por estado local (`setAbertoId`), e um link
 * daqui exigiria um `contratoBarterIdAlvo` atravessando o `V2Index`, como o `financiamentoIdAlvo`
 * já faz. Ficou anotado como frente [BARTER-ABRIR-POR-ID], fora deste PR.
 *
 * ⚠ CANCELAR AQUI MEXE NO FINANCEIRO. `agri_venda_avulsa_cancelar` cancela o lançamento junto —
 * sem isso o grão voltaria ao estoque e a receita continuaria no caixa, duas telas discordando
 * sobre a mesma venda. E ela RECUSA o que não pode desfazer: lançamento pago ou conciliado é
 * assunto do Financeiro.
 */
import { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';
import { X, Pencil, Ban, AlertTriangle, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse } from '@/lib/agri/barterVenda';
import type { VendaGrao } from '@/hooks/useEstoqueGraos';

/** O que a edição devolve — só o descritivo. Sacas e preço não se editam. */
export interface VendaEdicaoPayload {
  id: string;
  data: string;
  comprador_id: string | null;
  observacoes: string | null;
}

const dataBR = (iso: string | null) => (iso && iso.length >= 10 ? formatIsoToBr(iso.slice(0, 10)) : '—');

/**
 * ⚠ A SITUAÇÃO DO LANÇAMENTO EM UMA PALAVRA, e ela vem do Financeiro, não de um segundo cadastro:
 * `status_transacao` é o campo de lá. "Cancelado" ganha precedência porque um lançamento cancelado
 * que ainda diga "Programado" faria o operador esperar um dinheiro que não vem.
 */
const situacaoLancamento = (v: VendaGrao) => {
  if (!v.lancamento) return null;
  if (v.lancamento.cancelado) return 'Lançamento cancelado';
  const s = v.lancamento.status;
  return s === 'realizado' ? 'Realizado' : s === 'programado' ? 'Programado' : s || null;
};

export function VendasGraosModal({
  aberto, onFechar, vendas, carregando, erro, cultura, safraRotulo, clienteId,
  onCancelar, onEditar, salvando,
}: {
  aberto: boolean;
  onFechar: () => void;
  vendas: readonly VendaGrao[];
  carregando: boolean;
  erro: Error | null;
  cultura: string;
  safraRotulo: string;
  clienteId: string;
  onCancelar: (id: string, motivo: string) => void;
  onEditar: (p: VendaEdicaoPayload) => void;
  salvando: boolean;
}) {
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edData, setEdData] = useState('');
  const [edComprador, setEdComprador] = useState('');
  const [edObs, setEdObs] = useState('');

  const unidade = unidadeCurtaDaCultura(cultura);

  const topo = useMemo(() => {
    const ativas = vendas.filter(v => v.ativo);
    return {
      entregue: ativas.reduce((a, v) => a + v.sacas, 0),
      ativas: ativas.length,
      canceladas: vendas.length - ativas.length,
    };
  }, [vendas]);

  const abrirEdicao = (v: VendaGrao) => {
    setCancelandoId(null);
    setEditandoId(v.id);
    setEdData(v.data.slice(0, 10));
    setEdComprador(v.comprador_id ?? '');
    setEdObs(v.observacoes ?? '');
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Vendas e entregas · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              Tudo que saiu do estoque com dinheiro ou permuta, incluindo o que foi cancelado.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ `min-w-0` — `DialogContent` é grid, e item de grid não encolhe abaixo do conteúdo. Foi
            isso que clipou os ícones do histórico de quebra (df1b32a0); aqui as linhas são ainda
            mais longas. */}
        <div className="min-w-0 space-y-2 px-3 py-2">
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px]">
            <div className="min-w-0">
              <div className="text-[11px] font-normal leading-none text-muted-foreground">Entregue ativo</div>
              <div className="mt-1 truncate whitespace-nowrap text-[20px] font-medium leading-none tabular-nums">
                {formatNum(topo.entregue, 2)} <span className="text-[11px] text-muted-foreground">{unidade}</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-normal leading-none text-muted-foreground">Vendas</div>
              <div className="mt-1 truncate text-[20px] font-medium leading-none tabular-nums">{vendas.length}</div>
              <div className="mt-1 truncate whitespace-nowrap text-[11px] text-muted-foreground">
                {topo.ativas} ativa{topo.ativas === 1 ? '' : 's'} · {topo.canceladas} cancelada{topo.canceladas === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="max-h-[52vh] min-w-0 overflow-y-auto rounded-md border">
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
            ) : vendas.length === 0 ? (
              <div className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Nenhuma venda ou entrega nesta safra.
              </div>
            ) : vendas.map(v => {
              const avulsa = v.tipo === 'venda_avulsa';
              const l1 = `${avulsa ? 'Venda avulsa' : 'Barter'} · ${formatNum(v.sacas, 2)} ${unidade} · ${formatMoeda(v.bruto)}${v.comprador ? ` · ${v.comprador}` : ''}`;
              /* ⚠ A CONTA DO DOCUMENTO NA LINHA 2 — F3.1. Antes a linha dizia um valor só, e o
                 operador não tinha como saber se aquele número era o que ele ia RECEBER: a venda
                 tem bruto, dedução e líquido, e é o líquido que vira parcela no Financeiro.
                 ⚠ SÓ APARECE QUANDO HÁ DEDUÇÃO: numa venda sem Senar nem desconto, "bruto = líquido"
                 seria uma linha gasta para não dizer nada. */
              const temDeducao = v.senar > 0 || v.deducoes > 0;
              const conta = temDeducao
                ? `bruto ${formatMoeda(v.bruto)}${v.senar > 0 ? ` − senar ${formatMoeda(v.senar)}` : ''}${v.deducoes > 0 ? ` − descontos ${formatMoeda(v.deducoes)}` : ''} = líquido ${formatMoeda(v.liquido)}`
                : null;
              /* ⚠ AS PARCELAS SÃO OS LANÇAMENTOS DE RECEITA, não um campo próprio: cada parcela É
                 um lançamento, e contar outra coisa aqui seria um segundo número de parcelas. */
              const recibos = v.lancamentos.filter(li => li.natureza === 'receita_venda');
              const parcelas = recibos.length > 0
                ? `${recibos.length} parcela${recibos.length > 1 ? 's' : ''}: ${recibos
                    .map(li => `${dataBR(li.data_vencimento)} ${li.cancelado ? 'Cancelado' : li.data_pagamento ? 'Pago' : 'Programado'}`)
                    .join(', ')}`
                : null;
              /* ⚠ AS CLASSES ENTRAM RESUMIDAS na linha 2 — "ate_20 3.219,65, roca 620,64". A venda
                 pode ter três, e três linhas por venda transformariam a lista num extrato. */
              const classes = v.itens.map(i => `${labelDaClasse(i.classe)} ${formatNum(i.sacas, 2)}`).join(', ');
              const l2 = [
                dataBR(v.data), v.autor || '—', classes || null,
                conta, parcelas,
                /* ⚠ A SITUAÇÃO ISOLADA SÓ SOBREVIVE SEM PARCELAS: com a lista de vencimentos ao
                   lado, repetir "Realizado" seria dizer duas vezes o mesmo. */
                parcelas ? null : situacaoLancamento(v),
                v.observacoes || null,
                !v.ativo
                  ? `cancelada em ${dataBR(v.cancelado_em)} por ${v.cancelado_por || '—'}${v.motivo_cancelamento ? `: ${v.motivo_cancelamento}` : ''}`
                  : null,
              ].filter(Boolean).join(' · ');

              return (
                <div key={v.id} className="border-t border-slate-100 first:border-t-0">
                  <div className={cn('flex items-start gap-2 px-2 py-1.5',
                    !v.ativo && 'bg-muted/30 text-muted-foreground line-through')}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium" title={l1}>{l1}</div>
                      <div className="truncate text-[10px] text-muted-foreground" title={l2}>{l2}</div>
                    </div>
                    {/* ⚠ COLUNA DE AÇÕES `shrink-0` e largura própria: texto longo nunca a empurra
                        para fora do modal — a lição do df1b32a0. */}
                    <div className="flex shrink-0 items-center gap-[11px] no-underline">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium no-underline',
                        !v.ativo ? 'bg-muted text-muted-foreground'
                          : avulsa ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary')}>
                        {!v.ativo ? 'Cancelada' : avulsa ? 'Venda' : 'Barter'}
                      </span>
                      {/* ⚠ SÓ A AVULSA ATIVA TEM AÇÃO: o barter se governa no Barter, e a cancelada
                          não se reescreve. Esconder diz isso antes de o operador tentar. */}
                      {v.ativo && avulsa && (
                        <>
                          <button type="button" onClick={() => abrirEdicao(v)}
                            title="Editar data, comprador e observações" aria-label="Editar venda"
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button"
                            onClick={() => { setEditandoId(null); setCancelandoId(v.id); setMotivoCancel(''); }}
                            title="Cancelar esta venda" aria-label="Cancelar venda"
                            className="rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {cancelandoId === v.id && (
                    <ConfirmarComMotivo className="mx-2 mb-2"
                      titulo="Cancelar esta venda (lógico — cancela o lançamento junto)"
                      motivo={motivoCancel} onMotivoChange={setMotivoCancel}
                      onVoltar={() => setCancelandoId(null)}
                      confirmando={salvando}
                      /* ⚠ FECHA AO CONFIRMAR — defeito visto na homologação: o painel ficava aberto
                         embaixo de uma linha já riscada, pedindo um motivo para um cancelamento que
                         já aconteceu. Fechar aqui é otimista de propósito: se a RPC recusar, o toast
                         diz, e o operador reabre pelo ícone — melhor que deixar um formulário morto
                         na tela em todo caso de sucesso. */
                      onConfirmar={() => { onCancelar(v.id, motivoCancel.trim()); setCancelandoId(null); }} />
                  )}

                  {editandoId === v.id && (
                    <div className="mx-2 mb-2 space-y-2 rounded-md border bg-muted/20 p-2">
                      {/* ⚠ SACAS, PREÇO E TOTAL SÓ COMO TEXTO — e a frase diz a saída. Mudar a
                          quantidade de uma venda gravada reescreveria saldo E receita do passado
                          sem rastro de quais eram. */}
                      <p className="text-[10px] text-muted-foreground">
                        <span className="tabular-nums">{formatNum(v.sacas, 2)}</span> {unidade} ·{' '}
                        <span className="tabular-nums">{formatMoeda(v.bruto)}</span>
                        {temDeducao ? ` · líquido ${formatMoeda(v.liquido)}` : ''}
                        {classes ? ` · ${classes}` : ''}.
                        {' '}Para corrigir sacas ou preço, cancele e registre de novo.
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
                          <DatePicker value={edData} onChange={setEdData} className="mt-0.5" />
                        </div>
                        <div>
                          {/* ⚠ `label=""` — o `FornecedorSelect` tem rótulo por default (a5b1fc58). */}
                          <Label className="text-[10px]">Comprador</Label>
                          <div className="mt-0.5">
                            <FornecedorSelect fornecedorId={edComprador || null}
                              onFornecedorChange={id => setEdComprador(id ?? '')}
                              clienteId={clienteId} label="" placeholder="Escolha" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px]">Observações</Label>
                        <Input value={edObs} onChange={e => setEdObs(e.target.value)}
                          placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                          onClick={() => setEditandoId(null)}>
                          Voltar
                        </Button>
                        <Button type="button" variant="acao" size="sm" className="h-6 gap-1 text-[11px]"
                          disabled={!edData || salvando}
                          title={!edData ? 'Informe a data da venda.' : 'Salvar a correção'}
                          onClick={() => onEditar({
                            id: v.id, data: edData,
                            comprador_id: edComprador || null,
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
