/**
 * ConciliarExtratoDialog — vínculo manual extrato↔lançamentos.
 *
 * Recebe um movimento de extrato e busca candidatos em financeiro_lancamentos_v2:
 *   - mesmo cliente
 *   - mesma conta_bancaria_id (origem ou destino)
 *   - status_transacao = 'realizado'
 *   - cancelado = false
 *   - data_pagamento ±7 dias do data_movimento
 *
 * Usuário marca lançamentos e ajusta `valor_aplicado` por linha.
 * Insere em conciliacao_bancaria_itens via useConciliacaoBancariaItens.
 *
 * NÃO cria lançamento novo. NÃO altera lançamento existente.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useConciliacaoBancariaItens } from '@/hooks/useConciliacaoBancariaItens';
import { useFinanceiroV2, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { useExcelLinhasAux, type ExcelLinhaAux } from '@/hooks/useExcelLinhasAux';
import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

export interface ExtratoMovimentoRef {
  id: string;
  cliente_id: string;
  conta_bancaria_id: string;
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
  status: 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';
}

interface CandidatoLancamento {
  id: string;
  data_competencia: string;
  data_pagamento: string | null;
  valor: number;
  sinal: number;
  descricao: string | null;
  numero_documento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  movimento: ExtratoMovimentoRef | null;
  onConciliado?: () => void;
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  const r = new Date(d.getTime() + n * 86400000);
  return r.toISOString().slice(0, 10);
}

function fmtData(s: string | null): string {
  if (!s) return '-';
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ConciliarExtratoDialog({ open, onClose, movimento, onConciliado }: Props) {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const { insert: insertVinculo } = useConciliacaoBancariaItens();
  // PR2 — hooks para o fluxo "Usar como base" (referência operacional → criar
  // lançamento via LancamentoV2Dialog oficial, padrão idêntico ao ExtratoListaTab).
  const {
    contasBancarias,
    fornecedores,
    classificacoes,
    loadContas,
    loadFornecedores,
    loadClassificacoes,
    criarLancamentoComId,
    criarFornecedor,
  } = useFinanceiroV2();
  const { buscarSugestoesPorMovimento, marcarAplicada } = useExcelLinhasAux();

  const [candidatos, setCandidatos] = useState<CandidatoLancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, number>>(new Map());

  // PR2 — sugestões de referência operacional + estado da seleção
  const [sugestoes, setSugestoes] = useState<ExcelLinhaAux[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [referenciaSelected, setReferenciaSelected] = useState<ExcelLinhaAux | null>(null);

  // PR2 — pré-carrega listas necessárias ao LancamentoV2Dialog.
  // useCallback estáveis no useFinanceiroV2 (confirmado nos commits anteriores).
  useEffect(() => {
    loadContas();
    loadFornecedores();
    loadClassificacoes();
  }, [loadContas, loadFornecedores, loadClassificacoes]);

  // PR2 — busca sugestões por movimento (TRAVA 10: janela ±3 dias direto).
  useEffect(() => {
    if (!open || !movimento || !clienteAtual?.id) {
      setSugestoes([]);
      return;
    }
    let cancelled = false;
    setLoadingSugestoes(true);
    buscarSugestoesPorMovimento(
      clienteAtual.id,
      movimento.conta_bancaria_id,
      movimento.data_movimento,
      movimento.valor,
    ).then((rows) => {
      if (cancelled) return;
      setSugestoes(rows);
      setLoadingSugestoes(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, movimento?.id, movimento?.conta_bancaria_id, movimento?.data_movimento, movimento?.valor, clienteAtual?.id]);

  useEffect(() => {
    if (!open || !movimento || !clienteAtual?.id) return;
    setLoading(true);
    setMarcados(new Map());
    const dataIni = addDays(movimento.data_movimento, -7);
    const dataFim = addDays(movimento.data_movimento, +7);
    const valorAbs = Math.abs(movimento.valor);
    const sinalEsperado = movimento.valor < 0 ? -1 : 1;

    supabase
      .from('financeiro_lancamentos_v2')
      .select('id, data_competencia, data_pagamento, valor, sinal, descricao, numero_documento, conta_bancaria_id, conta_destino_id')
      .eq('cliente_id', clienteAtual.id)
      .eq('cancelado', false)
      .eq('status_transacao', 'realizado')
      .or(`conta_bancaria_id.eq.${movimento.conta_bancaria_id},conta_destino_id.eq.${movimento.conta_bancaria_id}`)
      .gte('data_pagamento', dataIni)
      .lte('data_pagamento', dataFim)
      .eq('sinal', sinalEsperado)
      .gte('valor', valorAbs - 0.01)
      .lte('valor', valorAbs + 0.01)
      .order('data_pagamento', { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao buscar candidatos: ' + error.message); setCandidatos([]); }
        else setCandidatos((data ?? []) as CandidatoLancamento[]);
        setLoading(false);
      });
  }, [open, movimento, clienteAtual?.id]);

  const valorMov = movimento ? Math.abs(movimento.valor) : 0;
  const totalSelecionado = useMemo(() => {
    let s = 0;
    for (const v of marcados.values()) s += Math.abs(Number(v) || 0);
    return s;
  }, [marcados]);
  const restante = Math.max(0, valorMov - totalSelecionado);

  const toggleMarcado = (l: CandidatoLancamento) => {
    setMarcados(prev => {
      const next = new Map(prev);
      if (next.has(l.id)) {
        next.delete(l.id);
      } else {
        // valor_aplicado default = valor signed do lançamento (módulo)
        next.set(l.id, Math.abs(Number(l.valor) || 0));
      }
      return next;
    });
  };

  const setValorAplicado = (id: string, raw: string) => {
    const n = Number(raw.replace(',', '.'));
    setMarcados(prev => {
      const next = new Map(prev);
      if (Number.isFinite(n) && n > 0) next.set(id, n);
      return next;
    });
  };

  const handleVincular = async () => {
    if (!movimento || !clienteAtual?.id) return;
    if (marcados.size === 0) { toast.error('Selecione ao menos um lançamento'); return; }
    if (totalSelecionado <= 0) { toast.error('Total aplicado deve ser maior que zero'); return; }
    if (totalSelecionado > valorMov + 0.01) {
      toast.error('Total aplicado excede o valor do movimento do extrato');
      return;
    }
    setSalvando(true);
    try {
      for (const [lancId, valorAplicado] of marcados.entries()) {
        await insertVinculo({
          extrato_id: movimento.id,
          lancamento_id: lancId,
          valor_aplicado: valorAplicado,
          cliente_id: clienteAtual.id,
        });
      }
      toast.success(`${marcados.size} vínculo(s) criado(s)`);
      onConciliado?.();
      onClose();
    } catch (e: any) {
      toast.error('Erro ao vincular: ' + (e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  // PR2 — handler do fluxo "Usar como base" (referência operacional → criar
  // lançamento + vincular ao extrato + marcar referência aplicada).
  // Mesmo padrão de retry/erro do ExtratoListaTab.handleCriarFromExtrato.
  const handleSalvarFromReferencia = async (
    form: LancamentoV2Form,
    _id?: string,
  ): Promise<boolean> => {
    if (!movimento || !referenciaSelected) return false;

    // PATCH 2 — Revalidação anti-duplicação: confirma que a referência ainda
    // está pendente ANTES de criar lançamento. Cobre cenário de 2 dialogs
    // abertos em paralelo. Janela de microssegundos entre SELECT e INSERT
    // aceita como dívida técnica (RPC com FOR UPDATE em PR futuro).
    const refCheck = await supabase
      .from('excel_linhas_aux' as any)
      .select('status')
      .eq('id', referenciaSelected.id)
      .maybeSingle();

    if (refCheck.error) {
      toast.error('Erro ao validar referência: ' + refCheck.error.message);
      return false;
    }
    const statusAtual = (refCheck.data as { status?: string } | null)?.status;
    if (statusAtual !== 'pendente') {
      toast.error('Esta referência já foi utilizada em outro lançamento.');
      const refId = referenciaSelected.id;
      setReferenciaSelected(null);
      setSugestoes((prev) => prev.filter((r) => r.id !== refId));
      return false;
    }

    const id = await criarLancamentoComId(form, { origem: 'referencia_operacional' });
    if (!id) return false; // hook já mostrou toast de erro — modal fica aberto pra retry

    const refId = referenciaSelected.id;
    try {
      await insertVinculo({
        extrato_id: movimento.id,
        lancamento_id: id,
        valor_aplicado: Math.abs(movimento.valor),
        cliente_id: movimento.cliente_id,
      });
      await marcarAplicada(refId, id, movimento.id);
      toast.success('Lançamento criado e conciliado via referência operacional');
      setReferenciaSelected(null);
      setSugestoes((prev) => prev.filter((r) => r.id !== refId));
      onConciliado?.();
      // PATCH 4 — NÃO fechar ConciliarExtratoDialog automaticamente.
      // Operador permanece no movimento (agora conciliado) e fecha manualmente.
      return true;
    } catch (e: any) {
      // Lançamento já criado — fechar LancamentoV2Dialog pra evitar duplicação
      // se operador re-clicar Salvar. Vínculo pode ser refeito via "Conciliar".
      toast.error(
        'Lançamento criado, mas erro ao vincular ao extrato: '
        + (e?.message ?? e)
        + '. Use o botão Conciliar para vincular manualmente.',
      );
      setReferenciaSelected(null);
      setSugestoes((prev) => prev.filter((r) => r.id !== refId));
      onConciliado?.();
      return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-2">
        <DialogHeader>
          <DialogTitle>Conciliar movimento do extrato</DialogTitle>
          <DialogDescription>
            Vincule este movimento a um ou mais lançamentos financeiros realizados.
            O extrato passa a 'parcial' ou 'conciliado' conforme a soma dos valores aplicados.
          </DialogDescription>
        </DialogHeader>

        {/* PR2.1 — Container único de scroll entre Header e Footer.
            flex-1 min-h-0 overflow-auto: garante que tudo (card OFX + tabela
            candidatos + rodapé totais + sugestões) compartilhe o mesmo scroll
            e que DialogFooter fique sempre visível. min-h-0 é crítico em
            flex child — sem ele o overflow não funciona em browsers. */}
        <div className="flex-1 min-h-0 overflow-auto pr-1 space-y-3">

        {movimento && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between gap-4">
              <span><strong>Data:</strong> {fmtData(movimento.data_movimento)}</span>
              <span className={`font-semibold tabular-nums ${movimento.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {formatMoeda(movimento.valor)}
              </span>
            </div>
            <div><strong>Descrição:</strong> {movimento.descricao || '-'}</div>
            <div><strong>Documento:</strong> {movimento.documento || '-'}</div>
          </div>
        )}

        <div className="border rounded">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-[10px]">Pgto</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                <TableHead className="text-[10px]">Doc.</TableHead>
                <TableHead className="text-[10px] text-right">Valor</TableHead>
                <TableHead className="text-[10px] text-right w-[110px]">Aplicar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : candidatos.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nenhum lançamento candidato (±7 dias, mesma conta, status realizado).</TableCell></TableRow>
              ) : candidatos.map(l => {
                const marcado = marcados.has(l.id);
                const valorSigned = (Number(l.valor) || 0) * (l.sinal >= 0 ? 1 : -1);
                return (
                  <TableRow key={l.id} className={marcado ? 'bg-blue-50/40' : ''}>
                    <TableCell><Checkbox checked={marcado} onCheckedChange={() => toggleMarcado(l)} /></TableCell>
                    <TableCell className="text-[11px] font-mono">{fmtData(l.data_pagamento)}</TableCell>
                    <TableCell className="text-[11px] max-w-[260px] truncate" title={l.descricao || ''}>{l.descricao || '-'}</TableCell>
                    <TableCell className="text-[11px] font-mono text-muted-foreground">{l.numero_documento || '-'}</TableCell>
                    <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${valorSigned < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatMoeda(valorSigned)}
                    </TableCell>
                    <TableCell className="text-[11px] text-right">
                      {marcado ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={marcados.get(l.id) ?? ''}
                          onChange={e => setValorAplicado(l.id, e.target.value)}
                          className="h-6 text-[11px] text-right tabular-nums"
                        />
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs gap-2 flex-wrap pt-2">
          <span><strong>Selecionados:</strong> {marcados.size}</span>
          <span><strong>Aplicado:</strong> <span className="tabular-nums">{formatMoeda(totalSelecionado)}</span></span>
          <span><strong>Movimento:</strong> <span className="tabular-nums">{formatMoeda(valorMov)}</span></span>
          <span className={restante > 0.005 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
            Restante: {formatMoeda(restante)}
          </span>
        </div>

        {/* PR2 — Sugestões Referência Operacional (TRAVA 8: separadas dos
            candidatos oficiais; TRAVA 9: linha aplicada some daqui mas fica
            visível na aba ReferenciasOperacionaisTab com badge verde). */}
        {sugestoes.length > 0 && (
          <div className="mt-3 border-t border-dashed pt-3">
            <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Sugestões Referência Operacional ({sugestoes.length})
            </div>
            <div className="space-y-1.5">
              {sugestoes.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-start justify-between gap-2 rounded border bg-blue-50/30 px-2 py-1.5 text-[11px]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-muted-foreground">{fmtData(ref.data_referencia)}</span>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase font-normal">
                        {ref.origem}
                      </Badge>
                      {ref.fornecedor_texto && (
                        <span className="font-semibold truncate">{ref.fornecedor_texto}</span>
                      )}
                      {ref.fazenda_texto && (
                        <span className="text-muted-foreground">· {ref.fazenda_texto}</span>
                      )}
                      <span className={`ml-auto tabular-nums font-semibold ${ref.valor != null && ref.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {ref.valor != null ? formatMoeda(ref.valor) : '-'}
                      </span>
                    </div>
                    {ref.plano_texto && (
                      <div className="text-muted-foreground mt-0.5">Plano: {ref.plano_texto}</div>
                    )}
                    {ref.observacao && (
                      <div className="text-muted-foreground mt-0.5 truncate" title={ref.observacao}>
                        {ref.observacao}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] px-2 flex-shrink-0"
                    onClick={() => setReferenciaSelected(ref)}
                  >
                    Usar como base
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>
        {/* /scroll container PR2.1 */}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
          <Button onClick={handleVincular} disabled={salvando || marcados.size === 0}>
            {salvando ? 'Vinculando...' : `Vincular (${marcados.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* PR2 — Modal oficial pra criar lançamento a partir da referência
          operacional. Mesmo padrão de ExtratoListaTab.handleCriarFromExtrato. */}
      <LancamentoV2Dialog
        open={!!referenciaSelected}
        onClose={() => setReferenciaSelected(null)}
        onSave={handleSalvarFromReferencia}
        fazendas={fazendas}
        contas={contasBancarias}
        classificacoes={classificacoes}
        fornecedores={fornecedores}
        onCriarFornecedor={criarFornecedor}
        prefill={(referenciaSelected && movimento) ? {
          data_pagamento: movimento.data_movimento,
          data_competencia: movimento.data_movimento,
          valor: Math.abs(movimento.valor),
          tipo_operacao: movimento.valor < 0 ? '2-Saídas' : '1-Entradas',
          status_transacao: 'realizado',
          conta_bancaria_id: movimento.conta_bancaria_id,
          descricao: [
            referenciaSelected.fornecedor_texto,
            referenciaSelected.plano_texto,
            referenciaSelected.fazenda_texto,
            referenciaSelected.observacao,
          ].filter(Boolean).join(' · ') || (movimento.descricao ?? undefined),
          numero_documento: movimento.documento ?? undefined,
        } : undefined}
        lockedFields={['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao']}
      />
    </Dialog>
  );
}
