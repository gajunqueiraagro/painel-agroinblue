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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { RefreshCw, Plus, MoreHorizontal, FileText, Undo2, Ban } from 'lucide-react';
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

  return (
    <div className="space-y-2">
      {/* RESUMO COMPACTO — valores soberanos da view (React não soma) */}
      <div className="rounded-md border bg-card p-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-muted-foreground">Resumo dos pagamentos · {fluxoLabel}</div>
          <Badge variant={ESTADO_VARIANT[r?.estadoLiquidacao ?? ''] ?? 'outline'} className="text-[10px]">
            {ESTADO_LABEL[r?.estadoLiquidacao ?? ''] ?? (r?.estadoLiquidacao ?? '—')}
          </Badge>
        </div>
        <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
          <ResumoItem rotulo={`Base${r?.baseOrigem ? ` (${r.baseOrigem})` : ''}`} valor={r?.base == null ? '—' : brl(r.base)} />
          <ResumoItem rotulo="Obrigações" valor={String(api.obrigacoes.length)} />
          <ResumoItem rotulo="Em dinheiro" valor={brl(r?.totalLiquidadoMonetario ?? 0)} />
          <ResumoItem rotulo="Permuta e compensação" valor={brl(r?.totalLiquidadoNaoMonetario ?? 0)} />
          <ResumoItem rotulo="Saldo em aberto" valor={r?.saldoOperacao == null ? '—' : brl(r.saldoOperacao)} destaque />
          <ResumoItem rotulo="Total pago" valor={brl(r?.totalLiquidadoValido ?? 0)} />
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

      {/* TABELA DE OBRIGAÇÕES */}
      <div className="overflow-x-auto rounded-md border bg-card">
        {/* Densidade das irmas: tabela 10px, cabecalho 9px — o mesmo pente de
            AbaCompromissosOC e da lista de Documentos. So as TABELAS mudam; rotulo,
            botao e campo de modal seguem em 11/12px, que e' o tamanho que as irmas
            tambem usam fora da tabela. */}
        <table className="w-full text-[10px] min-w-[900px]">
          <thead className="bg-muted/50 text-[9px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Origem</th>
              <th className="px-2 py-1 text-left">Componente</th>
              <th className="px-2 py-1 text-left">Documento</th>
              <th className="px-2 py-1 text-center">Parc.</th>
              <th className="px-2 py-1 text-left">Venc.</th>
              <th className="px-2 py-1 text-left">Favorecido</th>
              <th className="px-2 py-1 text-right">Nominal</th>
              <th className="px-2 py-1 text-right">Liq. mon.</th>
              <th className="px-2 py-1 text-right">Liq. n/mon.</th>
              <th className="px-2 py-1 text-right">Saldo</th>
              <th className="px-2 py-1 text-center">Estado</th>
              <th className="px-2 py-1 text-right">Título</th>
              <th className="px-2 py-1 text-center w-8"></th>
            </tr>
          </thead>
          <tbody>
            {api.loading && api.obrigacoes.length === 0 && (
              <tr><td colSpan={13} className="px-2 py-6 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!api.loading && api.obrigacoes.length === 0 && (
              <tr><td colSpan={13} className="px-2 py-6 text-center text-muted-foreground">Nenhuma obrigação. Use <strong>Gerar obrigação</strong>.</td></tr>
            )}
            {api.obrigacoes.map(o => {
              const podeLiquidar = !o.cancelada && !!o.tituloId && o.estado !== 'quitada';
              const podeCancelar = !o.cancelada;
              return (
                <tr key={o.obrigacaoId}
                  className={`border-t hover:bg-muted/30 cursor-pointer ${detalheId === o.obrigacaoId ? 'bg-primary/5' : ''} ${o.cancelada ? 'opacity-60' : ''}`}
                  onClick={() => setDetalheId(detalheId === o.obrigacaoId ? null : o.obrigacaoId)}>
                  <td className="px-2 py-1"><Badge variant="outline" className="text-[9px]">{ORIGEM_LABEL[o.origem] ?? o.origem}</Badge></td>
                  <td className="px-2 py-1">
                    <div className="font-medium">{o.componente}</div>
                    {o.descricao && <div className="text-[9px] text-muted-foreground truncate max-w-[160px]">{o.descricao}</div>}
                  </td>
                  <td className="px-2 py-1">
                    {o.documentoId
                      ? <button type="button" className="text-primary hover:underline inline-flex items-center gap-0.5" onClick={(e) => { e.stopPropagation(); onIrParaDocumentos?.(); }}>
                          <FileText className="h-3 w-3" /> {o.documentoLabel}
                        </button>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums">{o.sequenciaParcela}/{o.quantidadeParcelas}</td>
                  <td className="px-2 py-1">{fmtData(o.dataVencimento)}</td>
                  <td className="px-2 py-1 truncate max-w-[120px]">{o.favorecidoNome || '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{brl(o.valorNominal)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{o.totalLiquidadoMonetario ? brl(o.totalLiquidadoMonetario) : '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{o.totalLiquidadoNaoMonetario ? brl(o.totalLiquidadoNaoMonetario) : '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{o.semMovimentacaoCaixa && !o.tituloId ? '—' : brl(o.saldoAberto)}</td>
                  <td className="px-2 py-1 text-center"><Badge variant={ESTADO_VARIANT[o.estado] ?? 'outline'} className="text-[9px]">{ESTADO_LABEL[o.estado] ?? o.estado}</Badge></td>
                  <td className="px-2 py-1 text-right font-mono text-[9px] text-muted-foreground">{o.tituloId ? o.tituloId.slice(0, 8) : '—'}</td>
                  <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-[12px]">
                        <DropdownMenuItem disabled={!podeLiquidar || somenteLeitura} onClick={() => setModal({ type: 'liquidar', obr: o })}>Registrar pagamento</DropdownMenuItem>
                        <DropdownMenuItem disabled={!podeCancelar || somenteLeitura} className="text-destructive" onClick={() => setModal({ type: 'cancelar', obr: o })}>Cancelar obrigação</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDetalheId(o.obrigacaoId)}>Ver detalhe</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* DETALHE — liquidações do título + estorno */}
      {detalhe && (
        <div className="rounded-md border bg-card p-2 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold">
              Detalhe · {detalhe.componente} {detalhe.sequenciaParcela}/{detalhe.quantidadeParcelas}
              {detalhe.tituloId && <span className="ml-2 font-mono text-[10px] text-muted-foreground">título {detalhe.tituloId.slice(0, 8)}</span>}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setDetalheId(null)}>Fechar</Button>
          </div>
          {detalhe.documentoId && (
            <div className="text-[11px] text-muted-foreground">
              Documento de origem: <strong className="text-foreground">{detalhe.documentoLabel}</strong>
              {onIrParaDocumentos && <button type="button" className="ml-2 text-primary hover:underline" onClick={onIrParaDocumentos}>abrir aba Documentos</button>}
            </div>
          )}
          <LiquidacoesDetalhe api={api} obr={detalhe} somenteLeitura={somenteLeitura} onEstornar={(liqId, label) => setModal({ type: 'estornar', liqId, label })} onLiquidar={() => setModal({ type: 'liquidar', obr: detalhe })} />
        </div>
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

function ResumoItem({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded border bg-muted/20 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground truncate">{rotulo}</div>
      <div className={`tabular-nums ${destaque ? 'font-bold text-foreground' : 'font-semibold'}`}>{valor}</div>
    </div>
  );
}

function LiquidacoesDetalhe({ api, obr, somenteLeitura, onEstornar, onLiquidar }: {
  api: LiquidacaoApi; obr: ObrigacaoLinha; somenteLeitura?: boolean; onEstornar: (liqId: string, label: string) => void; onLiquidar: () => void;
}) {
  const eventos = obr.tituloId ? (api.liquidacoesPorTitulo[obr.tituloId] ?? []) : [];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-muted-foreground">Pagamentos</div>
        {!somenteLeitura && !obr.cancelada && obr.tituloId && obr.estado !== 'quitada' && (
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onLiquidar}><Plus className="h-3 w-3" /> Registrar</Button>
        )}
      </div>
      {eventos.length === 0
        ? <div className="text-[11px] text-muted-foreground py-1">Sem pagamentos{obr.tituloId ? '' : ' (obrigação sem título financeiro)'}.</div>
        : (
          <table className="w-full text-[10px]">
            <thead className="text-[9px] uppercase text-muted-foreground"><tr>
              <th className="px-1 py-0.5 text-left">Data</th><th className="px-1 py-0.5 text-left">Forma</th>
              <th className="px-1 py-0.5 text-right">Valor</th><th className="px-1 py-0.5 text-left">Descrição</th>
              <th className="px-1 py-0.5 text-center">Situação</th><th className="px-1 py-0.5"></th>
            </tr></thead>
            <tbody>
              {eventos.map(ev => {
                const naoMon = ev.forma === 'permuta' || ev.forma === 'compensacao';
                return (
                  <tr key={ev.id} className={`border-t ${ev.estornado ? 'opacity-50 line-through' : ''}`}>
                    <td className="px-1 py-0.5">{fmtData(ev.data)}</td>
                    <td className="px-1 py-0.5">{ev.forma}{naoMon && <span className="ml-1 text-[9px] text-muted-foreground">(n/mon.)</span>}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{brl(ev.valor)}</td>
                    <td className="px-1 py-0.5 truncate max-w-[180px]">{ev.descricao || (ev.permutaTipoBem ? `permuta: ${ev.permutaTipoBem}` : '—')}</td>
                    <td className="px-1 py-0.5 text-center">{ev.estornado ? <Badge variant="destructive" className="text-[9px]">estornada</Badge> : <Badge variant="secondary" className="text-[9px]">válida</Badge>}</td>
                    <td className="px-1 py-0.5 text-right">
                      {!somenteLeitura && !ev.estornado && (
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="Estornar"
                          onClick={() => onEstornar(ev.id, `${ev.forma} ${brl(ev.valor)}`)}><Undo2 className="h-3 w-3" /></Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
