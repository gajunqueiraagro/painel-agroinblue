import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
/* ⚠ O campo de dinheiro E' o compartilhado (A19). Esta tela nao formatava nada: o
   valor do pagamento era um <Input> cru, e o operador digitava contra o saldo em
   aberto — que a linha ao lado ja mostrava formatado. */
import { CampoMoeda } from '@/components/ui/campo-moeda';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
/* ⚠ `DropdownMenu`, `MoreHorizontal` e `FileText` SAIRAM com a tabela: o menu por linha
   virou clique na linha, e o icone de documento foi para o detalhe como texto. */
import { RefreshCw, Plus, Undo2, Ban } from 'lucide-react';
import { parseNumericValue } from '@/lib/calculos/abate';
import { usePlanoContasOC, planoTipoOperacao } from '@/hooks/usePlanoContasOC';
import { classificarLotesCompra } from '@/hooks/useOperacaoLiquidacao';
import { produtoOCPrincipal, siglaCategoria } from '@/lib/financeiro/produtoOC';
import type {
  LiquidacaoApi, ObrigacaoLinha, FormaLiquidacao, GerarObrigacaoInput, RegistrarLiquidacaoInput,
} from '@/hooks/useOperacaoLiquidacao';

// Aba Liquidação da OC (PR-OC-LIQ-UI-01). Apresentação pura: todo saldo/estado/total vem
// derivado das views (o React nunca calcula financeiro). Consome só a LiquidacaoApi.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const round2 = (n: number) => Math.round(n * 100) / 100;

/* PR-OC-VOCABULARIO-PAGAMENTO-01 — a tela fala PAGAMENTO; "liquidacao" ficou nos
   identificadores (RPC, tabela, view, coluna derivada), onde e' o nome do contrato.
   ⚠ `quitada` -> "paga" muda JUNTO com o rotulo da Central (LIQ_LABEL): e' o MESMO
   estado da mesma view, e dois nomes para ele seria pior que um nome tecnico. */
const ESTADO_LABEL: Record<string, string> = {
  nao_liquidada: 'aberta', parcial: 'parcial', quitada: 'paga',
  sem_caixa: 'sem caixa', cancelada: 'cancelada', excedente: 'excedente',
};
const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  nao_liquidada: 'outline', parcial: 'secondary', quitada: 'default',
  sem_caixa: 'outline', cancelada: 'destructive', excedente: 'destructive',
};
const ORIGEM_LABEL: Record<string, string> = { negociacao: 'Negociação', documento: 'Documento', manual: 'Manual' };
const FORMAS: { value: FormaLiquidacao; label: string; naoMonetaria?: boolean }[] = [
  { value: 'dinheiro', label: 'Dinheiro' }, { value: 'pix', label: 'PIX' },
  { value: 'transferencia', label: 'Transferência' }, { value: 'boleto', label: 'Boleto' },
  { value: 'cheque', label: 'Cheque' }, { value: 'compensacao', label: 'Compensação', naoMonetaria: true },
  { value: 'permuta', label: 'Permuta', naoMonetaria: true }, { value: 'outro', label: 'Outro' },
];

type ModalState =
  | null
  | { type: 'gerar' }
  | { type: 'liquidar'; obr: ObrigacaoLinha }
  | { type: 'cancelar'; obr: ObrigacaoLinha }
  | { type: 'estornar'; liqId: string; label: string };

interface Props {
  api: LiquidacaoApi;
  operacaoPronta: boolean;
  darkSelectClass: string;
  somenteLeitura?: boolean;   // OPEN-01: abertura de operação existente — nenhuma ação de escrita
  onIrParaDocumentos?: () => void;
}

export function AbaLiquidacaoOC({ api, operacaoPronta, darkSelectClass, somenteLeitura, onIrParaDocumentos }: Props) {
  const [modal, setModal] = useState<ModalState>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const detalhe = useMemo(
    () => api.obrigacoes.find(o => o.obrigacaoId === detalheId) ?? null,
    [api.obrigacoes, detalheId],
  );

  // Refetch soberano ao ATIVAR a aba: este componente monta quando a aba Liquidação passa a
  // ativa (branch condicional no CompraModalShell), então o resumo/obrigações refletem
  // mudanças feitas em outras abas — ex.: negociação salva/fechada mudando a base — sem
  // depender do "Atualizar" manual. `recarregar` (=carregar) é estável, só muda com
  // operacaoId/clienteId/enabled; nada é recalculado no React (só releitura das views).
  useEffect(() => { api.recarregar(); }, [api.recarregar]);

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border bg-card p-6 text-center text-[12px] text-muted-foreground">
        Salve a operação na aba <strong>Compra</strong> e conclua a negociação para registrar pagamentos.
      </div>
    );
  }

  const r = api.resumo;
  const fluxoLabel = api.naturezaFluxo === 'pagar' ? 'A pagar' : api.naturezaFluxo === 'receber' ? 'A receber' : '—';

  /* CONFRONTO obrigacao x pago. O VEREDITO E' DA VIEW: `estadoLiquidacao` ja saiu de
     `_oc_estado_liquidacao`, que aplica a tolerancia canonica de R$ 0,01. Aqui so se
     escolhe a palavra e a cor. Base indefinida nao confronta nada.
     `saldoOperacao` e' `base - pago`, entao no excedente ele vem negativo. */
  const confronto = r == null || r.base == null ? null
    : r.estadoLiquidacao === 'quitada' ? { ok: true, texto: 'quitado' }
    : r.estadoLiquidacao === 'excedente' ? { ok: false, texto: `excede ${brl(-(r.saldoOperacao ?? 0))}` }
    : { ok: false, texto: `faltam ${brl(r.saldoOperacao ?? 0)}` };

  return (
    <div className="space-y-2">
      {/* ── TOPO: OBRIGACAO x PAGO ────────────────────────────────────────────────
          ⚠ NENHUM DESTES NUMEROS E' SOMADO AQUI. `base`, `totalLiquidadoValido`,
          `saldoOperacao` e `estadoLiquidacao` vem prontos de vw_oc_operacao_liquidacao —
          o cabecalho deste arquivo diz que o React nunca calcula financeiro, e continua
          valendo.
          ⚠ A TOLERANCIA DE R$ 0,01 NAO E' REESCRITA AQUI. Ela mora em
          `_oc_estado_liquidacao` (`abs(base - liquidado) <= 0.01 -> 'liquidada'`), e a
          view ja devolve o veredito em `estadoLiquidacao`. Repetir a conta no React seria
          a segunda copia da mesma regra — o defeito que ja custou correcao nesta frente. */}
      {/* A21 — titulo e numeros do topo NAO rolam. Ver o bloco equivalente em
          AbaDocumentosOC; aqui o cartao e' `p-2` pelo mesmo motivo o `-mt-2 pt-2`. */}
      <div className="sticky top-0 z-10 -mt-2 rounded-b-md border-b bg-card pt-2 pb-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground min-w-0 truncate">Pagamentos · {fluxoLabel}</span>
          <div className="flex items-center gap-2 shrink-0">
            {api.obrigacoes.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {api.obrigacoes.length} obrigaç{api.obrigacoes.length > 1 ? 'ões' : 'ão'}
              </span>
            )}
            <Badge variant={ESTADO_VARIANT[r?.estadoLiquidacao ?? ''] ?? 'outline'} className="text-[10px]">
              {ESTADO_LABEL[r?.estadoLiquidacao ?? ''] ?? (r?.estadoLiquidacao ?? '—')}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground leading-none">Obrigação</div>
            <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
              {r?.base == null ? <span className="text-muted-foreground">—</span> : brl(r.base)}
            </div>
            {/* De onde a base saiu — a resposta para "por que este numero?". */}
            {r?.baseOrigem && <div className="mt-0.5 text-[9px] text-muted-foreground">{r.baseOrigem}</div>}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground leading-none">Pago</div>
            <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
              {brl(r?.totalLiquidadoValido ?? 0)}
              {confronto && (
                <span className={`ml-2 text-[11px] font-normal ${confronto.ok
                  ? 'text-emerald-700 dark:text-emerald-500'
                  : 'text-amber-700 dark:text-amber-500'}`}>{confronto.texto}</span>
              )}
            </div>
            {/* Permuta e compensacao saiu de coluna, mas nao pode sumir: e' dinheiro que
                NAO passou pelo caixa. So aparece quando existe. */}
            {(r?.totalLiquidadoNaoMonetario ?? 0) > 0 && (
              <div className="mt-0.5 text-[9px] text-muted-foreground">
                inclui {brl(r!.totalLiquidadoNaoMonetario)} em permuta ou compensação
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-muted-foreground">Obrigações financeiras</div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => api.recarregar()} disabled={api.loading}>
            <RefreshCw className={`h-3 w-3 ${api.loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          {!somenteLeitura && (
            <Button type="button" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setModal({ type: 'gerar' })} disabled={api.saving}>
              <Plus className="h-3 w-3" /> Gerar obrigação
            </Button>
          )}
        </div>
      </div>

      {/* ── LISTA A18 ─────────────────────────────────────────────────────────────
          Eram TREZE colunas com `min-w-[900px]` numa coluna de conteudo de ~812px: a
          rolagem horizontal era garantida por construcao, e a barra sobreposta do macOS
          cobria a ultima linha. Em duas alturas o problema deixa de existir.
          ⚠ IDENTIDADE = `descricao`. Nao e' substituto pobre de "Touros · 14 cab": o
          sistema preenche esse campo pelo padrao {Compra|Venda|Abate} {qtd 3 digitos}
          {sigla} — "Compra 003 DM" JA E' a identidade do lote, na forma canonica que o
          proprio projeto definiu. `ObrigacaoLinha` nao carrega lote_id, categoria nem
          quantidade; levar isso ate aqui e' PR-OC-OBRIGACAO-LOTE-01. Vazia, cai no
          componente (frete, comissao), como a coluna Componente fazia. */}
      <div className="rounded-md border bg-card divide-y">
        {api.loading && api.obrigacoes.length === 0 && (
          <div className="px-3.5 py-4 text-center text-[11px] text-muted-foreground">Carregando…</div>
        )}
        {!api.loading && api.obrigacoes.length === 0 && (
          <div className="px-3.5 py-4 text-center text-[11px] text-muted-foreground">
            Nenhuma obrigação. Use <strong>Gerar obrigação</strong>.
          </div>
        )}
        {api.obrigacoes.map(o => {
          const identidade = o.descricao.trim() || o.componente;
          /* ⚠ SEM MOVIMENTACAO DE CAIXA E SEM TITULO nao tem saldo a cobrar — a tabela
             antiga ja imprimia "—" nesse caso, e dizer "falta pagar" seria cobrar o que
             nao se paga. Cancelada tambem nao cobra nada. */
          const cobravel = !o.cancelada && (!o.semMovimentacaoCaixa || !!o.tituloId);
          const falta = cobravel && o.saldoAberto > 0.01 ? o.saldoAberto : null;
          return (
            <button key={o.obrigacaoId} type="button"
              onClick={() => setDetalheId(o.obrigacaoId)}
              className={`flex w-full items-center gap-3 px-3.5 py-[7px] text-left hover:bg-muted/30 ${o.cancelada ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1 leading-[1.35]">
                <div className="text-[12px] font-medium text-foreground truncate">{identidade}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {o.favorecidoNome || 'sem favorecido'}
                  {' · '}
                  {/* Havendo saldo, o que falta OCUPA O LUGAR do vencimento: entre "vence
                      em 28/02" e "falta pagar R$ 1.500", quem opera precisa do segundo. */}
                  {falta != null
                    ? <span className="text-amber-700 dark:text-amber-500">falta pagar {brl(falta)}</span>
                    : <>venc. {fmtData(o.dataVencimento)}</>}
                </div>
              </div>
              <div className="text-[12px] font-medium tabular-nums shrink-0">{brl(o.valorNominal)}</div>
              <Badge variant={ESTADO_VARIANT[o.estado] ?? 'outline'} className="text-[9px] shrink-0">
                {ESTADO_LABEL[o.estado] ?? o.estado}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* ⚠ DETALHE EM MODAL, nao abaixo da lista. Com varias obrigacoes, o bloco embaixo
          fica longe da linha que o abriu e nao se identifica — foi o mesmo conserto de
          22e0d2bf nos compromissos. */}
      {detalhe && (
        <DetalheObrigacaoDialog
          api={api} obr={detalhe} somenteLeitura={somenteLeitura}
          onIrParaDocumentos={onIrParaDocumentos}
          onClose={() => setDetalheId(null)}
          onLiquidar={() => setModal({ type: 'liquidar', obr: detalhe })}
          onCancelarObrigacao={() => setModal({ type: 'cancelar', obr: detalhe })}
          onEstornar={(liqId, label) => setModal({ type: 'estornar', liqId, label })}
        />
      )}

      {modal?.type === 'gerar' && (
        <GerarObrigacaoDialog api={api} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'liquidar' && (
        <RegistrarLiquidacaoDialog api={api} darkSelectClass={darkSelectClass} obr={modal.obr} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'cancelar' && (
        <MotivoDialog
          titulo="Cancelar obrigação"
          descricao={`Cancelamento lógico de ${modal.obr.componente} ${modal.obr.sequenciaParcela}/${modal.obr.quantidadeParcelas}. O histórico e as liquidações são preservados. Se o título estiver realizado/agendado, o cancelamento é bloqueado.`}
          confirmLabel="Cancelar obrigação"
          saving={api.saving}
          onConfirm={async (motivo) => { const ok = await api.cancelarObrigacao(modal.obr.obrigacaoId, motivo); if (ok) setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'estornar' && (
        <MotivoDialog
          titulo="Estornar pagamento"
          descricao={`Estorno append-only de ${modal.label}. O registro é preservado; saldo e estado são recalculados pelas views.`}
          confirmLabel="Estornar"
          saving={api.saving}
          onConfirm={async (motivo) => { const ok = await api.estornarLiquidacao(modal.liqId, motivo); if (ok) setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* DETALHE DA OBRIGACAO — em MODAL (PR-OC-LIQUIDACAO-A18-01).
   Recolhe o que saiu da lista: origem, documento, parcela, a quebra entre dinheiro e
   permuta, e o titulo. Nenhum desses seis identifica uma linha; todos importam depois de
   escolhida.
   ⚠ AS ACOES VIERAM PARA CA junto com o detalhe. Antes havia um menu por linha; com a
   linha virando alvo de clique, dois gestos no mesmo lugar disputariam o mesmo pixel. */
function DetalheObrigacaoDialog({ api, obr, somenteLeitura, onIrParaDocumentos, onClose, onLiquidar, onCancelarObrigacao, onEstornar }: {
  api: LiquidacaoApi; obr: ObrigacaoLinha; somenteLeitura?: boolean;
  onIrParaDocumentos?: () => void; onClose: () => void;
  onLiquidar: () => void; onCancelarObrigacao: () => void;
  onEstornar: (liqId: string, label: string) => void;
}) {
  const eventos = obr.tituloId ? (api.liquidacoesPorTitulo[obr.tituloId] ?? []) : [];
  const identidade = obr.descricao.trim() || obr.componente;
  const podeLiquidar = !obr.cancelada && !!obr.tituloId && obr.estado !== 'quitada';
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-2">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-[14px]">{identidade}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto min-h-0 space-y-2 pr-1">
          {/* Pares rotulo-valor em coluna (A17): sao grandezas que se comparam. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
            <Par rotulo="Origem" valor={ORIGEM_LABEL[obr.origem] ?? obr.origem} />
            <Par rotulo="Parcela" valor={`${obr.sequenciaParcela}/${obr.quantidadeParcelas}`} />
            <Par rotulo="Favorecido" valor={obr.favorecidoNome || '—'} />
            <Par rotulo="Vencimento" valor={fmtData(obr.dataVencimento)} />
            <Par rotulo="Valor da obrigação" valor={brl(obr.valorNominal)} />
            {/* ⚠ "—" e' o estado real de obrigacao sem caixa e sem titulo: nao ha saldo a
                cobrar. Imprimir R$ 0,00 diria que esta paga, que e' outra coisa. */}
            <Par rotulo="Saldo em aberto" valor={obr.semMovimentacaoCaixa && !obr.tituloId ? '—' : brl(obr.saldoAberto)} />
            {/* Os dois totais que deixaram de ser coluna. So aparecem quando existem —
                "R$ 0,00 em permuta" nao informa nada. */}
            {obr.totalLiquidadoMonetario > 0 && <Par rotulo="Em dinheiro" valor={brl(obr.totalLiquidadoMonetario)} />}
            {obr.totalLiquidadoNaoMonetario > 0 && <Par rotulo="Permuta e compensação" valor={brl(obr.totalLiquidadoNaoMonetario)} />}
            {obr.documentoId && (
              <div className="col-span-2 flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Documento</span>
                <span className="min-w-0 truncate text-right">
                  {obr.documentoLabel}
                  {onIrParaDocumentos && (
                    <button type="button" className="ml-2 text-primary hover:underline" onClick={onIrParaDocumentos}>abrir</button>
                  )}
                </span>
              </div>
            )}
            {obr.tituloId && (
              <div className="col-span-2 flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Título financeiro</span>
                <span className="font-mono text-[10px] text-muted-foreground">{obr.tituloId.slice(0, 8)}</span>
              </div>
            )}
          </div>

          {/* PAGAMENTOS — mesma cura A18: duas alturas, sem cabecalho de coluna. */}
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground">Pagamentos</div>
              {!somenteLeitura && podeLiquidar && (
                <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onLiquidar}>
                  <Plus className="h-3 w-3" /> Registrar
                </Button>
              )}
            </div>
            {eventos.length === 0
              ? <div className="text-[11px] text-muted-foreground py-1">
                  Sem pagamentos{obr.tituloId ? '' : ' (obrigação sem título financeiro)'}.
                </div>
              : (
                <div className="mt-1 rounded-md border divide-y">
                  {eventos.map(ev => {
                    const formaLabel = FORMAS.find(f => f.value === ev.forma)?.label ?? ev.forma;
                    const naoMon = ev.forma === 'permuta' || ev.forma === 'compensacao';
                    const complemento = ev.descricao || (ev.permutaTipoBem ? `permuta: ${ev.permutaTipoBem}` : null);
                    return (
                      <div key={ev.id} className={`flex items-center gap-3 px-3.5 py-[7px] ${ev.estornado ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 flex-1 leading-[1.35]">
                          <div className={`text-[12px] font-medium text-foreground truncate ${ev.estornado ? 'line-through' : ''}`}>
                            {brl(ev.valor)} · {formaLabel}
                            {naoMon && <span className="ml-1 text-[9px] font-normal text-muted-foreground">não monetária</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {[fmtData(ev.data), complemento].filter(x => x && x !== '—').join(' · ') || '—'}
                          </div>
                        </div>
                        {ev.estornado
                          ? <Badge variant="destructive" className="text-[9px] shrink-0">estornado</Badge>
                          : !somenteLeitura && (
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                              title="Estornar pagamento" aria-label="Estornar pagamento"
                              onClick={() => onEstornar(ev.id, `${formaLabel} ${brl(ev.valor)}`)}><Undo2 className="h-3.5 w-3.5" /></Button>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          {!somenteLeitura && !obr.cancelada
            ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                onClick={onCancelarObrigacao}><Ban className="h-3.5 w-3.5 mr-1" /> Cancelar obrigação</Button>
            : <span />}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="min-w-0 truncate text-right tabular-nums">{valor}</span>
    </div>
  );
}

// PR-OC-FIN-CONTRATO-OBRIGACAO-01 (+ corretivo classificação automática, opção a completa) —
//   geração da(s) obrigação(ões) PRINCIPAL(is) integrais e classificadas. Sexo único ⇒ 1 obrigação;
//   operação mista ⇒ N obrigações (uma por classificação/sexo), cada uma com sua classificação e
//   valor derivado dos seus lotes (fórmula oficial); a SOMA = valor_acordado (exata). Classificação
//   AUTOMÁTICA (sem seleção manual), resolvida no plano real (2-Saídas + subcentro). Favorecido
//   default = contraparte. Bloqueia quando já há principal ativa, sem categoria/plano, valor não
//   derivável ou soma incoerente. Envio em UMA única chamada à RPC.
function GerarObrigacaoDialog({ api, onClose }: { api: LiquidacaoApi; onClose: () => void }) {
  const plano = usePlanoContasOC(api.clienteId ?? undefined);
  const fluxo = api.naturezaFluxo;
  const tipoOC: 'compra' | 'venda' | 'abate' | null =
    api.tipoOperacao === 'compra' ? 'compra'
    : api.tipoOperacao === 'venda' ? 'venda'
    : api.tipoOperacao === 'abate' ? 'abate' : null;
  const planoTipo = tipoOC ? planoTipoOperacao(tipoOC, 'principal') : null;   // compra → '2-Saídas'
  const compPrincipal = api.componentes.find(c => c.natureza === 'principal');

  // Referência da base negociada e obrigações principais ativas.
  const base = api.resumo?.base ?? null;
  const principaisAtivas = api.obrigacoes.filter(o => o.natureza === 'principal' && !o.cancelada);
  const totalPrincipal = principaisAtivas.reduce((s, o) => s + o.valorNominal, 0);
  const diferenca = base != null ? base - totalPrincipal : null;
  const jaExistePrincipal = totalPrincipal > 0;
  const incompativel = jaExistePrincipal && base != null && Math.abs(totalPrincipal - base) > 0.005;

  const [favorecidoId, setFavorecidoId] = useState<string>(api.contraparteId ?? '');
  const [primeiroVenc, setPrimeiroVenc] = useState('');
  const [descricao, setDescricao] = useState('');

  useEffect(() => { if (api.contraparteId) setFavorecidoId(prev => prev || api.contraparteId!); }, [api.contraparteId]);

  // CLASSIFICAÇÃO AUTOMÁTICA (sem seleção manual): os lotes são agrupados por classificação
  // financeira (sexo→subcentro) pela regra oficial; sexo único ⇒ 1 obrigação, misto ⇒ N. O valor
  // de cada grupo vem da fórmula oficial de valor por lote; o plano_conta_id real é resolvido por
  // (tipo_operacao '2-Saídas' + subcentro). A soma dos grupos é ancorada em valor_acordado.
  const baseValida = base != null && base > 0;
  const acordado = api.valorAcordado;
  const classificacao = useMemo(() => classificarLotesCompra(api.lotes), [api.lotes]);
  const preparo = useMemo(() => {
    if (classificacao.status !== 'ok') return { status: 'classif' as const };
    if (!planoTipo) return { status: 'sem_tipo' as const };
    if (plano.loading) return { status: 'carregando' as const };
    if (acordado == null || acordado <= 0) return { status: 'sem_acordado' as const };
    // PR-FIN-OC-COMPOSICAO-02 — um item por LOTE; plano resolvido pela classificação gerencial (subcentro).
    //   DM e G (mesmo subcentro Machos) permanecem itens/obrigações distintos.
    const resolvidos = classificacao.itens.map(it => ({
      item: it, cand: plano.rows.filter(r => r.tipo_operacao === planoTipo && r.subcentro === it.subcentro),
    }));
    const semPlano = Array.from(new Set(resolvidos.filter(r => r.cand.length === 0).map(r => r.item.subcentro)));
    if (semPlano.length) return { status: 'sem_plano' as const, subcentros: semPlano };
    const ambiguo = Array.from(new Set(resolvidos.filter(r => r.cand.length > 1).map(r => r.item.subcentro)));
    if (ambiguo.length) return { status: 'ambiguo' as const, subcentros: ambiguo };
    // Rateio: só prossegue se a soma bruta dos LOTES coincidir com valor_acordado a menos de
    // arredondamento (senão a diferença NÃO é mascarada — bloqueia e reporta).
    const somaBruta = resolvidos.reduce((s, r) => s + r.item.valorBruto, 0);
    if (Math.abs(round2(somaBruta) - acordado) > 0.01) {
      return { status: 'soma_incoerente' as const, soma: round2(somaBruta), acordado };
    }
    // Valores por LOTE: arredonda todos menos o último; o último absorve o resíduo de centavos
    // para garantir Σ = valor_acordado EXATO (exigência da RPC, sem tolerância).
    const n = resolvidos.length;
    let acc = 0;
    const itens = resolvidos.map((r, i) => {
      const valor = i < n - 1 ? round2(r.item.valorBruto) : round2(acordado - acc);
      acc += valor;
      return { item: r.item, plano: r.cand[0], valor };
    });
    return { status: 'ok' as const, itens };
  }, [classificacao, planoTipo, plano.rows, plano.loading, acordado]);

  const podeSubmeter = !!fluxo && !!compPrincipal && preparo.status === 'ok'
    && !!favorecidoId && !!primeiroVenc && !jaExistePrincipal && !api.saving;

  const submit = async () => {
    if (!podeSubmeter || preparo.status !== 'ok' || !fluxo || !compPrincipal || !tipoOC) return;
    // PR-FIN-OC-COMPOSICAO-02 — uma obrigação principal POR LOTE (identidade por lote_id, nunca por sexo).
    //   Produto DERIVADO estruturalmente (qtd/categoria do lote + parcela); fornecedor não entra.
    const inputs: GerarObrigacaoInput[] = preparo.itens.map(it => ({
      naturezaFluxo: fluxo, natureza: 'principal', componente: compPrincipal.codigo,
      loteId: it.item.lote.id,                              // identidade e vínculo estrutural por lote
      valor: it.valor,                                      // valor do lote (soma = valor_acordado)
      descricao: produtoOCPrincipal(tipoOC, it.item.lote.qtd ?? 0, it.item.lote.categoria, 1, 1),
      favorecidoId: favorecidoId || null,
      documentoId: null,
      // classificação gerencial resolvida automaticamente (registro real do plano de contas)
      macroCusto: it.plano.macro_custo, grupoCusto: it.plano.grupo_custo, centroCusto: it.plano.centro_custo,
      subcentro: it.plano.subcentro, planoContaId: it.plano.id,
      semMovimentacaoCaixa: false, materializar: true,
      quantidadeParcelas: 1, primeiroVencimento: primeiroVenc || null, intervaloDias: 0,
    }));
    const ok = await api.gerarObrigacoes(inputs);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-2">
        <DialogHeader className="shrink-0"><DialogTitle>Gerar obrigação financeira</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-[12px] overflow-y-auto min-h-0 pr-1">
          {/* RESUMO DE REFERÊNCIA — base integral (Negociação) × obrigações principais ativas */}
          <div className="col-span-2 rounded-md border bg-muted/30 p-2 text-[11px] space-y-0.5">
            <div className="flex justify-between"><span className="text-muted-foreground">Valor negociado (Negociação)</span><strong className="tabular-nums">{base != null ? brl(base) : '—'}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Obrigações principais ativas</span><span className="tabular-nums">{brl(totalPrincipal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Diferença</span><span className="tabular-nums">{diferenca != null ? brl(diferenca) : '—'}</span></div>
            {incompativel && (
              <div className="text-destructive font-medium pt-0.5">Obrigação incompatível com a negociação. Saneamento necessário.</div>
            )}
            {!incompativel && jaExistePrincipal && (
              <div className="text-muted-foreground pt-0.5">Obrigação principal já existente para esta operação.</div>
            )}
            {!baseValida && (
              <div className="text-destructive font-medium pt-0.5">Base negociada ausente ou inválida.</div>
            )}
          </div>

          {/* CLASSIFICAÇÃO FINANCEIRA — automática por lote (1 ou N obrigações), não editável */}
          <div className="col-span-2 rounded-md border bg-muted/30 p-2 text-[11px] space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Classificação financeira (automática)</div>
            {preparo.status === 'ok' ? (
              <div className="space-y-0.5">
                {preparo.itens.map(it => (
                  <div key={it.item.lote.id} className="flex justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      <span className="text-primary">{it.item.lote.qtd ?? '—'} {siglaCategoria(it.item.lote.categoria)}</span>
                      {' · '}{[it.plano.macro_custo, it.plano.grupo_custo, it.plano.centro_custo, it.plano.subcentro].filter(Boolean).join(' → ')}
                    </span>
                    <span className="tabular-nums shrink-0">{brl(it.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 border-t pt-0.5 font-semibold">
                  <span>Total{preparo.itens.length > 1 ? ` · ${preparo.itens.length} obrigações` : ''}</span>
                  <span className="tabular-nums">{brl(preparo.itens.reduce((s, it) => s + it.valor, 0))}</span>
                </div>
              </div>
            ) : (
              <div className="text-destructive font-medium">
                {classificacao.status === 'sem_categoria' && 'Operação sem lote com categoria negociada válida. Cadastre os lotes na negociação antes de gerar a obrigação.'}
                {classificacao.status === 'categoria_invalida' && `Categoria sem correspondência de classificação: ${classificacao.categorias.join(', ')}. Geração bloqueada.`}
                {classificacao.status === 'valor_nao_derivavel' && `Valor não derivável dos lotes (categorias: ${classificacao.categorias.join(', ')}). Informe critério e valor na negociação.`}
                {preparo.status === 'carregando' && 'Carregando classificação…'}
                {preparo.status === 'sem_acordado' && 'Valor negociado (valor_acordado) ausente ou inválido. Feche a negociação antes de gerar a obrigação.'}
                {preparo.status === 'sem_plano' && `Não há plano de contas ativo (2-Saídas) para: ${preparo.subcentros.join('; ')}. Geração bloqueada.`}
                {preparo.status === 'ambiguo' && `Há mais de um plano ativo para: ${preparo.subcentros.join('; ')}. Geração bloqueada.`}
                {preparo.status === 'soma_incoerente' && `Soma dos lotes (${brl(preparo.soma)}) diverge do valor negociado (${brl(preparo.acordado)}) além de arredondamento. Saneie a negociação antes de gerar.`}
              </div>
            )}
          </div>

          {/* OBRIGAÇÃO — valor integral (bloqueado), favorecido, vencimento */}
          <div>
            <Label className="text-[11px]">Fluxo</Label>
            <Input readOnly value={fluxo === 'pagar' ? 'A pagar' : fluxo === 'receber' ? 'A receber' : '—'} className="h-8 text-[12px] bg-muted" />
          </div>
          <div>
            <Label className="text-[11px]">Valor total (integral)</Label>
            <Input readOnly value={acordado != null ? brl(acordado) : '—'} className="h-8 text-[12px] text-right tabular-nums bg-muted" title="Bloqueado: soma das obrigações principais = valor integral negociado" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">Favorecido *</Label>
            <SearchableSelect
              value={favorecidoId || '__none__'}
              onValueChange={(v) => setFavorecidoId(v === '__none__' ? '' : v)}
              options={api.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
              placeholder="Selecione o favorecido"
              allLabel="— selecione —" allValue="__none__" dense
              className="[&>button]:h-8 [&>button]:text-[12px]"
            />
          </div>
          <div>
            <Label className="text-[11px]">1º vencimento *</Label>
            {/* A20 — DatePicker do sistema. SEM `compact`: o default do componente ja e'
                `h-8 text-[12px]`, exatamente a altura desta grade de modal; compact e'
                para grade densa de linha, que nao e' o caso aqui. */}
            <DatePicker value={primeiroVenc} onChange={setPrimeiroVenc} className="h-8 text-[12px]" />
          </div>
          <div>
            <Label className="text-[11px]">Parcelas</Label>
            <Input readOnly value="1 / 1" className="h-8 text-[12px] text-right tabular-nums bg-muted" />
          </div>
          <div className="col-span-2"><Label className="text-[11px]">Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="text-[12px]" placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!podeSubmeter}>{api.saving ? 'Gerando…' : 'Gerar obrigação integral'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarLiquidacaoDialog({ api, darkSelectClass, obr, onClose }: { api: LiquidacaoApi; darkSelectClass: string; obr: ObrigacaoLinha; onClose: () => void }) {
  const [data, setData] = useState('');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState<FormaLiquidacao>('pix');
  const [descricao, setDescricao] = useState('');
  const [permutaTipo, setPermutaTipo] = useState('');
  const [permutaDesc, setPermutaDesc] = useState('');
  const isPermuta = forma === 'permuta';
  const valorNum = parseNumericValue(valor);
  const excedeSaldo = valorNum > obr.saldoAberto + 0.01;
  const podeSubmeter = !!data && valorNum > 0 && !excedeSaldo && !api.saving && !!obr.tituloId
    && (!isPermuta || (!!permutaTipo && valorNum > 0));

  const submit = async () => {
    if (!podeSubmeter || !obr.tituloId) return;
    const input: RegistrarLiquidacaoInput = {
      financeiroLancamentoId: obr.tituloId, data, valor: valorNum, forma,
      descricao: descricao || undefined,
      permutaTipoBem: isPermuta ? permutaTipo : undefined,
      permutaDescricaoBem: isPermuta ? (permutaDesc || undefined) : undefined,
      permutaValorAtribuido: isPermuta ? valorNum : undefined,
    };
    const ok = await api.registrarLiquidacao(input);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-2">
        <DialogHeader className="shrink-0"><DialogTitle>Registrar pagamento · {obr.componente} {obr.sequenciaParcela}/{obr.quantidadeParcelas}</DialogTitle></DialogHeader>
        <div className="text-[11px] text-muted-foreground shrink-0">Saldo em aberto: <strong className="text-foreground tabular-nums">{brl(obr.saldoAberto)}</strong></div>
        <div className="grid grid-cols-2 gap-2 text-[12px] overflow-y-auto min-h-0 pr-1">
          <div><Label className="text-[11px]">Data</Label>
            <DatePicker value={data} onChange={setData} className="h-8 text-[12px]" /></div>
          <div><Label className="text-[11px]">Forma</Label>
            <Select value={forma} onValueChange={(v) => setForma(v as FormaLiquidacao)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent className={darkSelectClass}>
                {FORMAS.map(f => <SelectItem key={f.value} value={f.value} className="text-[12px]">{f.label}{f.naoMonetaria ? ' · não monetária' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className="text-[11px]">Valor</Label>
            {/* PONTE string<->number, e SO isso: `valor` segue string porque
                `parseNumericValue` e o gate `excedeSaldo` leem dela; a formatacao e' toda
                do campo. Vazio e' AUSENCIA e nao zero — sem a distincao, digitar "0,00"
                limparia o campo. */}
            <CampoMoeda valor={valor.trim() === '' ? null : parseNumericValue(valor)}
              onChange={(n) => setValor(n == null ? '' : String(n))} placeholder="R$ 0,00"
              className={`h-8 text-[12px] text-right tabular-nums ${excedeSaldo ? 'border-destructive' : ''}`} />
            {excedeSaldo && <div className="text-[10px] text-destructive mt-0.5">Valor excede o saldo aberto.</div>}
          </div>
          {isPermuta && (
            <>
              <div><Label className="text-[11px]">Tipo do bem</Label>
                <Input value={permutaTipo} onChange={(e) => setPermutaTipo(e.target.value)} placeholder="Ex.: insumo" className="h-8 text-[12px]" /></div>
              <div><Label className="text-[11px]">Descrição do bem</Label>
                <Input value={permutaDesc} onChange={(e) => setPermutaDesc(e.target.value)} placeholder="Opcional" className="h-8 text-[12px]" /></div>
            </>
          )}
          <div className="col-span-2"><Label className="text-[11px]">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" className="h-8 text-[12px]" /></div>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!podeSubmeter}>{api.saving ? 'Registrando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MotivoDialog({ titulo, descricao, confirmLabel, saving, onConfirm, onClose }: {
  titulo: string; descricao: string; confirmLabel: string; saving: boolean;
  onConfirm: (motivo: string) => void; onClose: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4" /> {titulo}</AlertDialogTitle>
          <AlertDialogDescription className="text-[12px]">{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Label className="text-[11px]">Motivo <span className="text-destructive">*</span></Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="text-[12px]" placeholder="Obrigatório" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={!motivo.trim() || saving} onClick={(e) => { e.preventDefault(); onConfirm(motivo.trim()); }}>
            {saving ? 'Processando…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
