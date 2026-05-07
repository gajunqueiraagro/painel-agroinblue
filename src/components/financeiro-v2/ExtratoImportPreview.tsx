/**
 * ExtratoImportPreview — modal de importação de extrato OFX/CSV.
 *
 * Fluxo:
 *   1. Selecionar arquivo (.ofx / .csv) e conta bancária.
 *   2. Gerar preview (parser + checagem de duplicatas via hash).
 *   3. Confirmar → insere em extrato_bancario_v2 (status='nao_conciliado').
 *
 * NÃO cria lançamento financeiro automaticamente.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useImportacaoExtrato, type MovimentoPreview, type CandidatoPossivel } from '@/hooks/useImportacaoExtrato';
import { useBaixaViaExtrato } from '@/hooks/useBaixaViaExtrato';
import { ConfirmarBaixaAgrupadaDialog } from './ConfirmarBaixaAgrupadaDialog';
import { RevisarMatchDialog } from './RevisarMatchDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Info, CheckCircle2 } from 'lucide-react';

interface BadgeStatus {
  label: string;
  cls: string;
}
function badgeFromMovimento(m: MovimentoPreview): BadgeStatus {
  if (m.duplicado) return { label: 'duplicado', cls: 'bg-muted text-muted-foreground' };
  if (m.matchAgrupado) {
    return {
      label: `agrupado ${m.quantidadeItensMatch} itens (${m.scoreMatch})`,
      cls: 'bg-blue-100 text-blue-700',
    };
  }
  if (m.scoreMatch >= 80) return { label: `match forte (${m.scoreMatch})`, cls: 'bg-emerald-100 text-emerald-700' };
  if (m.scoreMatch >= 50) return { label: `provável (${m.scoreMatch})`, cls: 'bg-amber-100 text-amber-700' };
  return { label: 'sem match', cls: 'bg-red-100 text-red-700' };
}

/** Status do match elegível para conversão Agendado/Programado → Realizado. */
function podeConverterStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase();
  return s === 'agendado' || s === 'programado';
}

/**
 * Lookup do id do extrato persistido — APENAS leitura, sem INSERT.
 *
 * Por que lookup-only?
 *   - INSERT individual em extrato_bancario_v2 fora do batch da importação
 *     conflita com RLS (cliente_membros) e não é necessário: o batch da
 *     importação já cobre o caso normal. Se o movimento ainda não foi
 *     importado, o erro instrui o usuário a confirmar a importação.
 *
 * Guards:
 *   - clienteId obrigatório (do contexto oficial).
 *   - lookup por (cliente_id, hash_movimento) — chave única na tabela.
 */
async function obterExtratoId(
  clienteId: string | null | undefined,
  m: MovimentoPreview,
): Promise<string> {
  if (!clienteId) {
    throw new Error('Cliente não selecionado — recarregue a tela e tente novamente.');
  }
  const { data, error } = await supabase
    .from('extrato_bancario_v2' as any)
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('hash_movimento', m.hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      'Este movimento ainda não foi salvo. ' +
      'Clique em "Salvar extrato" no rodapé antes de baixar lançamentos individualmente.',
    );
  }
  return (data as { id: string }).id;
}

interface Conta {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contaBancariaIdInicial?: string;
  onImported?: (resultado: { inseridos: number; importacaoId: string | null }) => void;
}

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoImportPreview({ open, onClose, contaBancariaIdInicial, onImported }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const { preview, loading, error, gerarPreview, confirmarImportacao, reset } = useImportacaoExtrato();
  const { baixarLancamentoViaExtrato } = useBaixaViaExtrato();

  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string>(contaBancariaIdInicial ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Conversão 1:1 (AlertDialog) e agrupada (Dialog).
  const [confirm1a1, setConfirm1a1] = useState<MovimentoPreview | null>(null);
  const [confirmAgrupado, setConfirmAgrupado] = useState<{ extratoId: string; movimento: MovimentoPreview } | null>(null);
  // Revisão manual: provável (50-79) e ver possíveis (sem match).
  const [revisar, setRevisar] = useState<{
    extratoId: string;
    movimento: MovimentoPreview;
    candidatos: CandidatoPossivel[];
    titulo: string;
  } | null>(null);
  const [convertindo, setConvertindo] = useState(false);
  // Hashes locais marcados como já-baixados para feedback visual sem refetch.
  const [hashesBaixados, setHashesBaixados] = useState<Set<string>>(new Set());
  // Flag: a importação já foi confirmada nesta sessão (extratos persistidos).
  // Antes disso, qualquer baixa individual mostra toast pedindo confirmação primeiro.
  const [importacaoConfirmada, setImportacaoConfirmada] = useState(false);

  // Carregar contas do cliente
  useEffect(() => {
    if (!open || !clienteId) return;
    supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao')
      .then(({ data }) => setContas((data ?? []) as Conta[]));
  }, [open, clienteId]);

  // Sincroniza conta inicial quando muda
  useEffect(() => {
    if (contaBancariaIdInicial) setContaId(contaBancariaIdInicial);
  }, [contaBancariaIdInicial]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      reset();
      setArquivo(null);
      setHashesBaixados(new Set());
      setImportacaoConfirmada(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGerar = async () => {
    if (!arquivo) { toast.error('Selecione um arquivo .ofx ou .csv'); return; }
    if (!contaId) { toast.error('Selecione a conta bancária'); return; }
    try {
      setImportacaoConfirmada(false);
      await gerarPreview({ arquivo, contaBancariaId: contaId });
    } catch (e: any) {
      toast.error('Erro ao gerar preview: ' + (e?.message ?? e));
    }
  };

  const handleLimparPreview = () => {
    reset();
    setImportacaoConfirmada(false);
    setHashesBaixados(new Set());
  };

  const handleConfirmar = async () => {
    if (!arquivo || !preview) return;
    try {
      const r = await confirmarImportacao({
        contaBancariaId: contaId,
        nomeArquivo: arquivo.name,
        formato: preview.formato,
      });
      toast.success(
        `Extrato salvo (${r.inseridos} movimento(s)). ` +
        `Agora revise os matches para vincular ou marcar realizados.`,
      );
      setImportacaoConfirmada(true);
      onImported?.(r);
      // NÃO fechar automaticamente — usuário precisa interagir com botões individuais.
    } catch (e: any) {
      toast.error('Erro ao confirmar: ' + (e?.message ?? e));
    }
  };

  /** Bloqueia ação individual antes da importação ter sido confirmada. */
  const exigirImportacaoConfirmada = (): boolean => {
    if (importacaoConfirmada) return true;
    toast.error(
      'Salve o extrato primeiro (botão "Salvar extrato" no rodapé) antes de baixar lançamentos individualmente.',
    );
    return false;
  };

  /** Conversão 1:1 confirmada — converte status e cria vínculo. */
  const executarConversao1a1 = async (m: MovimentoPreview) => {
    if (!clienteId || !m.lancamentoMatchId) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      const r = await baixarLancamentoViaExtrato({
        lancamentoId: m.lancamentoMatchId,
        extratoId,
        dataPagamentoReal: m.data,
        documentoBanco: m.documento ?? undefined,
      });
      setHashesBaixados((prev) => new Set(prev).add(m.hash));
      const partes: string[] = [];
      if (r.convertido) partes.push('lançamento marcado realizado');
      if (r.vinculado) partes.push('vínculo criado com extrato');
      toast.success(partes.length > 0 ? partes.join(' · ') : 'Já vinculado anteriormente');
      setConfirm1a1(null);
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Abre modal agrupado — usa o extrato já persistido (precisa de id real). */
  const abrirAgrupado = async (m: MovimentoPreview) => {
    if (!clienteId) return;
    if (!exigirImportacaoConfirmada()) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      setConfirmAgrupado({ extratoId, movimento: m });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Provável (50-79): abre revisão com o candidato 1:1 já escolhido pelo matcher. */
  const abrirRevisarAprovar = async (m: MovimentoPreview) => {
    if (!clienteId || !m.lancamentoMatchId) return;
    if (!exigirImportacaoConfirmada()) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      const cand: CandidatoPossivel = {
        id: m.lancamentoMatchId,
        data: m.data,
        fornecedor: m.fornecedorMatch,
        descricao: m.descricaoMatch,
        valor: m.valor,
        statusTransacao: m.statusMatch,
        diffValor: 0,
        diffDias: 0,
        numeroDocumento: null,
      };
      // Reforça com candidatosPossiveis (sem duplicar o já escolhido).
      const extras = m.candidatosPossiveis.filter((c) => c.id !== cand.id);
      setRevisar({
        extratoId,
        movimento: m,
        candidatos: [cand, ...extras],
        titulo: `Revisar e aprovar match provável (${m.scoreMatch})`,
      });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Sem match: abre revisão com lista de candidatos sugeridos (top-10). */
  const abrirVerPossiveis = async (m: MovimentoPreview) => {
    if (!clienteId) return;
    if (m.candidatosPossiveis.length === 0) {
      toast.error('Nenhum candidato compatível encontrado');
      return;
    }
    if (!exigirImportacaoConfirmada()) return;
    setConvertindo(true);
    try {
      const extratoId = await obterExtratoId(clienteId, m);
      setRevisar({
        extratoId,
        movimento: m,
        candidatos: m.candidatosPossiveis,
        titulo: 'Possíveis lançamentos para este movimento',
      });
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message ?? e));
    } finally {
      setConvertindo(false);
    }
  };

  /** Wrapper para "Marcar realizado" / "Vincular extrato" — checa importação confirmada. */
  const abrirConfirm1a1 = (m: MovimentoPreview) => {
    if (!exigirImportacaoConfirmada()) return;
    setConfirm1a1(m);
  };

  const totalValor = useMemo(() => {
    if (!preview) return 0;
    return preview.movimentos
      .filter(m => !m.duplicado)
      .reduce((s, m) => s + Math.abs(m.valor), 0);
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-3 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Importar extrato bancário (OFX/CSV)</DialogTitle>
          <DialogDescription>
            Selecione o arquivo e a conta. O sistema detecta duplicatas por hash do movimento.
            Movimentos importados ficam com status <strong>não conciliado</strong> — sem criar lançamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <Label className="text-xs">Arquivo (.ofx ou .csv)</Label>
            <Input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Conta bancária *</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_exibicao || c.nome_conta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button onClick={handleGerar} disabled={loading || !arquivo || !contaId}>
            {loading ? 'Processando...' : 'Gerar preview'}
          </Button>
          {preview && (
            <Button variant="outline" onClick={handleLimparPreview} disabled={loading}>
              Limpar preview
            </Button>
          )}
        </div>

        {preview && !importacaoConfirmada && preview.novos > 0 && (
          <div className="shrink-0 flex items-center gap-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px] text-amber-800">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">
              1º passo: salvar o extrato bancário. Isso não altera o financeiro.
            </span>
            <Button
              size="sm"
              onClick={handleConfirmar}
              disabled={loading}
              className="h-7 text-xs px-3 shrink-0"
            >
              {loading ? 'Salvando...' : `Salvar extrato (${preview.novos})`}
            </Button>
          </div>
        )}
        {importacaoConfirmada && (
          <div className="shrink-0 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50/70 px-2 py-1.5 text-[11px] text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">
              Extrato salvo. Agora revise os matches e confirme vínculos/baixas.
            </span>
            <span className="shrink-0 inline-flex items-center px-2 h-7 rounded bg-emerald-100 text-emerald-800 text-xs font-semibold">
              Extrato salvo ✓
            </span>
          </div>
        )}

        {error && (
          <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {preview && (
          <>
            <div className="flex items-center gap-2 flex-wrap text-xs shrink-0">
              <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 font-semibold">
                Formato: {preview.formato}
              </span>
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 font-semibold">
                {preview.matchDireto} match direto
              </span>
              {preview.matchAgrupados > 0 && (
                <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 font-semibold">
                  {preview.matchAgrupados} agrupado{preview.matchAgrupados !== 1 ? 's' : ''}
                </span>
              )}
              <span className="px-2 py-1 rounded bg-red-50 text-red-700 font-semibold">
                {preview.semMatch} sem match
              </span>
              <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-semibold">
                {preview.duplicados} duplicado{preview.duplicados !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground">
                Total {formatMoeda(totalValor)} (apenas novos)
              </span>
            </div>

            <div className="overflow-auto flex-1 min-h-[200px] border rounded">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-[10px]">Data</TableHead>
                    <TableHead className="text-[10px]">Descrição</TableHead>
                    <TableHead className="text-[10px]">Documento</TableHead>
                    <TableHead className="text-[10px] text-right">Valor</TableHead>
                    <TableHead className="text-[10px]">Tipo</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Match financeiro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.movimentos.map((m, i) => {
                    const badge = badgeFromMovimento(m);
                    const matchTitulo = m.fornecedorMatch || m.descricaoMatch;
                    return (
                      <TableRow key={i} className={m.duplicado ? 'opacity-50' : ''}>
                        <TableCell className="text-[11px] font-mono">{fmtData(m.data)}</TableCell>
                        <TableCell className="text-[11px] max-w-[240px] truncate" title={m.descricao}>
                          {m.descricao || '-'}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground">
                          {m.documento || '-'}
                        </TableCell>
                        <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {formatMoeda(m.valor)}
                        </TableCell>
                        <TableCell className="text-[11px]">{m.tipo === 'credito' ? '↑ Cred' : '↓ Déb'}</TableCell>
                        <TableCell className="text-[10px]">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[300px]">
                          {m.duplicado ? (
                            <span className="text-muted-foreground">—</span>
                          ) : m.matchAgrupado ? (
                            <div className="space-y-1">
                              <details className="group">
                                <summary className="cursor-pointer list-none text-blue-800 hover:underline">
                                  <span className="inline-block">
                                    {m.quantidadeItensMatch} lançamentos · {formatMoeda(m.valorSomado)}
                                    <span className="ml-1 text-[9px] text-blue-500 group-open:hidden">▶ ver</span>
                                    <span className="ml-1 text-[9px] text-blue-500 hidden group-open:inline">▼ ocultar</span>
                                  </span>
                                </summary>
                                <div className="mt-1 ml-2 pl-2 border-l border-blue-200 space-y-0.5 text-[10px]">
                                  {m.detalhesAgrupados.map((d) => {
                                    const st = (d.statusTransacao || '').toLowerCase();
                                    const stCls = st === 'realizado' ? 'bg-emerald-100 text-emerald-700'
                                      : st === 'agendado' ? 'bg-amber-100 text-amber-800'
                                      : st === 'programado' ? 'bg-blue-100 text-blue-700'
                                      : 'bg-muted text-muted-foreground';
                                    return (
                                      <div key={d.id} className="flex gap-2 items-baseline">
                                        <span className="font-mono text-muted-foreground shrink-0">{fmtData(d.data ?? '')}</span>
                                        <span className="flex-1 truncate" title={d.fornecedor || d.descricao || ''}>
                                          {d.fornecedor || d.descricao || '-'}
                                        </span>
                                        <span className={`tabular-nums shrink-0 ${d.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                          {formatMoeda(d.valor)}
                                        </span>
                                        <span className={`shrink-0 px-1.5 py-px rounded text-[8px] uppercase ${stCls}`}>{st || '—'}</span>
                                        {d.macroCusto && (
                                          <span className="text-muted-foreground italic shrink-0 text-[9px]" title={d.grupoCusto || undefined}>
                                            {d.macroCusto}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                              {hashesBaixados.has(m.hash) ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                  ✓ Baixado via OFX
                                </span>
                              ) : m.detalhesAgrupados.some((d) => podeConverterStatus(d.statusTransacao)) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  disabled={convertindo}
                                  onClick={() => abrirAgrupado(m)}
                                >
                                  ✓ Confirmar realizados
                                </Button>
                              )}
                            </div>
                          ) : m.matchEncontrado && matchTitulo ? (
                            <div className="space-y-1">
                              <span className="text-emerald-800 truncate block" title={matchTitulo}>{matchTitulo}</span>
                              {hashesBaixados.has(m.hash) ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                  ✓ Baixado via OFX
                                </span>
                              ) : (m.statusMatch || '').toLowerCase() === 'realizado' ? (
                                // Lançamento já está realizado: apenas vínculo (status NÃO muda).
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                    Já realizado
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] px-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                    disabled={convertindo}
                                    onClick={() => abrirConfirm1a1(m)}
                                  >
                                    Vincular extrato
                                  </Button>
                                </div>
                              ) : m.scoreMatch >= 80 && podeConverterStatus(m.statusMatch) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  disabled={convertindo}
                                  onClick={() => abrirConfirm1a1(m)}
                                >
                                  ✓ Marcar realizado
                                </Button>
                              ) : m.scoreMatch >= 50 && m.scoreMatch < 80 && m.lancamentoMatchId ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 border-amber-400 text-amber-800 hover:bg-amber-50"
                                  disabled={convertindo}
                                  onClick={() => abrirRevisarAprovar(m)}
                                >
                                  Revisar e aprovar
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-muted-foreground">—</span>
                              {!hashesBaixados.has(m.hash) && m.candidatosPossiveis.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 border-blue-300 text-blue-800 hover:bg-blue-50"
                                  disabled={convertindo}
                                  onClick={() => abrirVerPossiveis(m)}
                                >
                                  Ver possíveis ({m.candidatosPossiveis.length})
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter className="shrink-0 flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          {!importacaoConfirmada && (
            <span className="text-[10px] text-muted-foreground sm:mr-auto">
              Nenhum lançamento será criado ou alterado nesta etapa.
            </span>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} disabled={loading}>Fechar</Button>
            <Button
              onClick={handleConfirmar}
              disabled={loading || !preview || preview.novos === 0 || importacaoConfirmada}
            >
              {importacaoConfirmada
                ? 'Extrato salvo ✓'
                : (loading ? 'Salvando...' : `Salvar extrato (${preview?.novos ?? 0})`)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* AlertDialog: baixa 1:1 (Marcar realizado) ou apenas vínculo (Já realizado). */}
      <AlertDialog open={!!confirm1a1} onOpenChange={(v) => { if (!v) setConfirm1a1(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(confirm1a1?.statusMatch || '').toLowerCase() === 'realizado'
                ? 'Vincular extrato ao lançamento já realizado?'
                : 'Confirmar baixa do lançamento via OFX?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm1a1 && (
                (confirm1a1.statusMatch || '').toLowerCase() === 'realizado' ? (
                  <span>
                    O lançamento <strong>{confirm1a1.fornecedorMatch || confirm1a1.descricaoMatch || '(sem nome)'}</strong> já
                    está marcado como <strong>realizado</strong>. Apenas o vínculo com este movimento do extrato será criado.
                    Status, categoria, valor e classificação NÃO serão alterados.
                  </span>
                ) : (
                  <span>
                    O lançamento <strong>{confirm1a1.fornecedorMatch || confirm1a1.descricaoMatch || '(sem nome)'}</strong> será
                    marcado como <strong>realizado</strong> com data de pagamento {fmtData(confirm1a1.data)} e vinculado
                    a este movimento do extrato. Categoria, valor e classificação NÃO serão alterados.
                  </span>
                )
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertindo}
              onClick={() => confirm1a1 && executarConversao1a1(confirm1a1)}
            >
              {convertindo
                ? 'Processando...'
                : ((confirm1a1?.statusMatch || '').toLowerCase() === 'realizado' ? 'Vincular' : 'Marcar realizado')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de seleção para baixa agrupada */}
      {confirmAgrupado && (
        <ConfirmarBaixaAgrupadaDialog
          open={!!confirmAgrupado}
          onClose={() => setConfirmAgrupado(null)}
          extratoId={confirmAgrupado.extratoId}
          dataMovimentoExtrato={confirmAgrupado.movimento.data}
          documentoExtrato={confirmAgrupado.movimento.documento}
          itens={confirmAgrupado.movimento.detalhesAgrupados}
          onConcluido={() => {
            setHashesBaixados((prev) => new Set(prev).add(confirmAgrupado.movimento.hash));
            setConfirmAgrupado(null);
          }}
        />
      )}

      {/* Modal de revisão manual: provável / sem match (lista + side-by-side) */}
      {revisar && (
        <RevisarMatchDialog
          open={!!revisar}
          onClose={() => setRevisar(null)}
          extratoId={revisar.extratoId}
          movimentoOFX={{
            data: revisar.movimento.data,
            descricao: revisar.movimento.descricao,
            valor: revisar.movimento.valor,
            documento: revisar.movimento.documento,
          }}
          candidatos={revisar.candidatos}
          tituloCustom={revisar.titulo}
          onConcluido={() => {
            setHashesBaixados((prev) => new Set(prev).add(revisar.movimento.hash));
            setRevisar(null);
          }}
        />
      )}
    </Dialog>
  );
}
