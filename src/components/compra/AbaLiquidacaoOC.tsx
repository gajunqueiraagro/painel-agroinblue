import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import type {
  LiquidacaoApi, ObrigacaoLinha, FormaLiquidacao, GerarObrigacaoInput, RegistrarLiquidacaoInput,
} from '@/hooks/useOperacaoLiquidacao';

// Aba Liquidação da OC (PR-OC-LIQ-UI-01). Apresentação pura: todo saldo/estado/total vem
// derivado das views (o React nunca calcula financeiro). Consome só a LiquidacaoApi.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

const ESTADO_LABEL: Record<string, string> = {
  nao_liquidada: 'aberta', parcial: 'parcial', quitada: 'quitada',
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
        Salve a operação na aba <strong>Compra</strong> e conclua a negociação para liquidar.
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
          <div className="text-[12px] font-semibold text-muted-foreground">Resumo da liquidação · {fluxoLabel}</div>
          <Badge variant={ESTADO_VARIANT[r?.estadoLiquidacao ?? ''] ?? 'outline'} className="text-[10px]">
            {ESTADO_LABEL[r?.estadoLiquidacao ?? ''] ?? (r?.estadoLiquidacao ?? '—')}
          </Badge>
        </div>
        <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
          <ResumoItem rotulo={`Base${r?.baseOrigem ? ` (${r.baseOrigem})` : ''}`} valor={r?.base == null ? '—' : brl(r.base)} />
          <ResumoItem rotulo="Obrigações" valor={String(api.obrigacoes.length)} />
          <ResumoItem rotulo="Liq. monetária" valor={brl(r?.totalLiquidadoMonetario ?? 0)} />
          <ResumoItem rotulo="Liq. não monetária" valor={brl(r?.totalLiquidadoNaoMonetario ?? 0)} />
          <ResumoItem rotulo="Saldo aberto" valor={r?.saldoOperacao == null ? '—' : brl(r.saldoOperacao)} destaque />
          <ResumoItem rotulo="Total liquidado" valor={brl(r?.totalLiquidadoValido ?? 0)} />
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
        <table className="w-full text-[11px] min-w-[900px]">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
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
                    {o.descricao && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{o.descricao}</div>}
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
                  <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{o.tituloId ? o.tituloId.slice(0, 8) : '—'}</td>
                  <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-[12px]">
                        <DropdownMenuItem disabled={!podeLiquidar || somenteLeitura} onClick={() => setModal({ type: 'liquidar', obr: o })}>Registrar liquidação</DropdownMenuItem>
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
        <GerarObrigacaoDialog api={api} darkSelectClass={darkSelectClass} onClose={() => setModal(null)} />
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
          titulo="Estornar liquidação"
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
        <div className="text-[11px] font-semibold text-muted-foreground">Liquidações</div>
        {!somenteLeitura && !obr.cancelada && obr.tituloId && obr.estado !== 'quitada' && (
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onLiquidar}><Plus className="h-3 w-3" /> Registrar</Button>
        )}
      </div>
      {eventos.length === 0
        ? <div className="text-[11px] text-muted-foreground py-1">Sem liquidações{obr.tituloId ? '' : ' (obrigação sem título financeiro)'}.</div>
        : (
          <table className="w-full text-[11px]">
            <thead className="text-[10px] uppercase text-muted-foreground"><tr>
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

function GerarObrigacaoDialog({ api, darkSelectClass, onClose }: { api: LiquidacaoApi; darkSelectClass: string; onClose: () => void }) {
  const [chaveBase] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}`));
  const [origem, setOrigem] = useState<'manual' | 'documento'>('manual');
  const [documentoId, setDocumentoId] = useState<string>('');
  const [compSel, setCompSel] = useState<string>(''); // "natureza:codigo"
  const [favorecidoId, setFavorecidoId] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [qtdParcelas, setQtdParcelas] = useState('1');
  const [primeiroVenc, setPrimeiroVenc] = useState('');
  const [intervalo, setIntervalo] = useState('30');
  const [semCaixa, setSemCaixa] = useState(false);
  const [materializar, setMaterializar] = useState(true);

  const fluxo = api.naturezaFluxo;
  const podeSubmeter = !!compSel && parseNumericValue(valor) > 0 && !!fluxo && !api.saving
    && (origem === 'manual' || !!documentoId);

  const submit = async () => {
    if (!podeSubmeter || !fluxo) return;
    const [natureza, componente] = compSel.split(':');
    const input: GerarObrigacaoInput = {
      naturezaFluxo: fluxo, natureza, componente,
      valor: parseNumericValue(valor),
      descricao: descricao || undefined,
      favorecidoId: favorecidoId || null,
      documentoId: origem === 'documento' ? (documentoId || null) : null,
      semMovimentacaoCaixa: semCaixa,
      materializar: semCaixa ? false : materializar,
      quantidadeParcelas: Math.max(1, Math.trunc(parseNumericValue(qtdParcelas) || 1)),
      primeiroVencimento: primeiroVenc || null,
      intervaloDias: Math.max(0, Math.trunc(parseNumericValue(intervalo) || 0)),
      chaveBase,
    };
    const ok = await api.gerarObrigacoes(input);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-2">
        <DialogHeader className="shrink-0"><DialogTitle>Gerar obrigação financeira</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-[12px] overflow-y-auto min-h-0 pr-1">
          <div>
            <Label className="text-[11px]">Origem</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as 'manual' | 'documento')}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent className={darkSelectClass}>
                <SelectItem value="manual" className="text-[12px]">Manual</SelectItem>
                <SelectItem value="documento" className="text-[12px]">Documento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Fluxo</Label>
            <Input readOnly value={fluxo === 'pagar' ? 'A pagar' : fluxo === 'receber' ? 'A receber' : '—'} className="h-8 text-[12px] bg-muted" />
          </div>
          {origem === 'documento' && (
            <div className="col-span-2">
              <Label className="text-[11px]">Documento</Label>
              <Select value={documentoId} onValueChange={setDocumentoId}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione o documento" /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  {api.documentos.map(d => <SelectItem key={d.id} value={d.id} className="text-[12px]">{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-[11px]">Natureza / componente</Label>
            <Select value={compSel} onValueChange={setCompSel}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione o componente" /></SelectTrigger>
              <SelectContent className={`${darkSelectClass} max-h-[50vh]`}>
                {api.componentes.map(c => (
                  <SelectItem key={`${c.natureza}:${c.codigo}`} value={`${c.natureza}:${c.codigo}`} className="text-[12px]">
                    {c.natureza} · {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">Favorecido</Label>
            <SearchableSelect
              value={favorecidoId || '__all__'}
              onValueChange={(v) => setFavorecidoId(v === '__all__' ? '' : v)}
              options={api.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
              placeholder="Opcional (padrão = contraparte da operação)"
              allLabel="Padrão da operação" allValue="__all__" dense
              className="[&>button]:h-8 [&>button]:text-[12px]"
            />
          </div>
          <div>
            <Label className="text-[11px]">Valor por parcela</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="h-8 text-[12px] text-right tabular-nums" />
          </div>
          <div>
            <Label className="text-[11px]">Qtd. parcelas</Label>
            <Input inputMode="numeric" value={qtdParcelas} onChange={(e) => setQtdParcelas(e.target.value)} className="h-8 text-[12px] text-right tabular-nums" />
          </div>
          <div>
            <Label className="text-[11px]">1º vencimento</Label>
            <Input type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div>
            <Label className="text-[11px]">Intervalo (dias)</Label>
            <Input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} disabled={(parseNumericValue(qtdParcelas) || 1) <= 1} className="h-8 text-[12px] text-right tabular-nums" />
          </div>
          <div className="col-span-2"><Label className="text-[11px]">Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="text-[12px]" placeholder="Opcional" />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={semCaixa} onChange={(e) => setSemCaixa(e.target.checked)} />
            Retenção sem movimentação de caixa (não gera título bancário)
          </label>
          <label className={`col-span-2 flex items-center gap-2 text-[11px] ${semCaixa ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={semCaixa ? false : materializar} disabled={semCaixa} onChange={(e) => setMaterializar(e.target.checked)} />
            Materializar título financeiro (despesa com desembolso)
          </label>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!podeSubmeter}>{api.saving ? 'Gerando…' : 'Gerar'}</Button>
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
        <DialogHeader className="shrink-0"><DialogTitle>Registrar liquidação · {obr.componente} {obr.sequenciaParcela}/{obr.quantidadeParcelas}</DialogTitle></DialogHeader>
        <div className="text-[11px] text-muted-foreground shrink-0">Saldo aberto: <strong className="text-foreground tabular-nums">{brl(obr.saldoAberto)}</strong></div>
        <div className="grid grid-cols-2 gap-2 text-[12px] overflow-y-auto min-h-0 pr-1">
          <div><Label className="text-[11px]">Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-[12px]" /></div>
          <div><Label className="text-[11px]">Forma</Label>
            <Select value={forma} onValueChange={(v) => setForma(v as FormaLiquidacao)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent className={darkSelectClass}>
                {FORMAS.map(f => <SelectItem key={f.value} value={f.value} className="text-[12px]">{f.label}{f.naoMonetaria ? ' · não monetária' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className="text-[11px]">Valor</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={`h-8 text-[12px] text-right tabular-nums ${excedeSaldo ? 'border-destructive' : ''}`} />
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
