/**
 * ExtratoListaTab — visualização tabular dos movimentos importados em
 * extrato_bancario_v2 para uma conta + mês.
 *
 * Filtros por props (controlados pela tela hospedeira):
 *   - contaBancariaId
 *   - anoMes ('YYYY-MM')
 *
 * Ações por linha:
 *   - "Conciliar"  → abre ConciliarExtratoDialog
 *   - "Ignorar"    → marca status='ignorado' no movimento
 *
 * NÃO altera lançamentos. NÃO cria lançamentos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useExtratoBancario, type ExtratoMovimento } from '@/hooks/useExtratoBancario';
import { ConciliarExtratoDialog, type ExtratoMovimentoRef } from './ConciliarExtratoDialog';
import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useFinanceiroV2, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useConciliacaoBancariaItens } from '@/hooks/useConciliacaoBancariaItens';
import { useExcelLinhasAux } from '@/hooks/useExcelLinhasAux';
import {
  enriquecerMovimentos,
  type MovimentoEnriquecido,
} from '@/lib/financeiro/extratoEnriquecer';

interface Props {
  contaBancariaId: string | null;
  anoMes: string | null; // 'YYYY-MM' ou null = sem filtro
}

const STATUS_BADGE: Record<ExtratoMovimento['status'], { label: string; cls: string }> = {
  nao_conciliado: { label: 'Não conciliado', cls: 'bg-red-100 text-red-700' },
  parcial:        { label: 'Parcial',        cls: 'bg-amber-100 text-amber-700' },
  conciliado:     { label: 'Conciliado',     cls: 'bg-emerald-100 text-emerald-700' },
  ignorado:       { label: 'Ignorado',       cls: 'bg-muted text-muted-foreground' },
};

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoListaTab({ contaBancariaId, anoMes }: Props) {
  const dataInicio = anoMes ? `${anoMes}-01` : undefined;
  const dataFim = useMemo(() => {
    if (!anoMes) return undefined;
    const [y, m] = anoMes.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    return `${anoMes}-${String(ultimo).padStart(2, '0')}`;
  }, [anoMes]);

  const { movimentos, loading, refetch } = useExtratoBancario({
    contaBancariaId: contaBancariaId ?? undefined,
    dataInicio,
    dataFim,
    enabled: !!contaBancariaId,
  });

  // Hooks para o caminho "Criar lançamento" a partir de OFX órfão.
  const { fazendas } = useFazenda();
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
  const { insert: insertVinculo, listarPorExtratos } = useConciliacaoBancariaItens();
  const { listarPorContaMes } = useExcelLinhasAux();
  const { clienteAtual } = useCliente();

  // PR3 — IDs dos movimentos da página atual (estável por valor).
  const movIds = useMemo(() => movimentos.map((m) => m.id), [movimentos]);

  // PR3 — query batch: vínculos existentes de TODOS os movimentos da página.
  const { data: vinculosByExtratoId } = useQuery({
    queryKey: ['cbi-batch', contaBancariaId, anoMes, movIds.join(',')],
    enabled: movIds.length > 0,
    queryFn: () => listarPorExtratos(movIds),
    staleTime: 30_000,
  });

  // PR3 — refs Excel pendentes do mês na conta (sugestões).
  const { data: refsExcelPendentes } = useQuery({
    queryKey: ['excel-aux', clienteAtual?.id, contaBancariaId, anoMes, 'pendente'],
    enabled: !!clienteAtual?.id && !!contaBancariaId && !!anoMes,
    queryFn: async () => {
      const todas = await listarPorContaMes(contaBancariaId!, anoMes!, clienteAtual!.id);
      return todas.filter((r) => r.status === 'pendente');
    },
    staleTime: 30_000,
  });

  // PR3 — lançamentos órfãos do mês na conta (sem vínculo em cbi).
  const { data: lancamentosOrfaosDoMes } = useQuery({
    queryKey: ['lancs-orfaos', clienteAtual?.id, contaBancariaId, anoMes],
    enabled: !!clienteAtual?.id && !!contaBancariaId && !!anoMes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financeiro_lancamentos_v2' as any)
        .select(`
          id, data_pagamento, valor, sinal, descricao,
          conta_bancaria_id, conta_destino_id,
          conciliacao_bancaria_itens!left(id)
        `)
        .eq('cliente_id', clienteAtual!.id)
        .or(`conta_bancaria_id.eq.${contaBancariaId},conta_destino_id.eq.${contaBancariaId}`)
        .eq('ano_mes', anoMes!)
        .eq('cancelado', false)
        .eq('status_transacao', 'realizado')
        .eq('sem_movimentacao_caixa', false);
      if (error) throw error;
      // PostgREST não consegue inferir o tipo do embed conciliacao_bancaria_itens
      // (tabela acessada via .from(... as any) no projeto) — converter via
      // `unknown` é o padrão sugerido pelo próprio TS quando os tipos não se
      // sobrepõem (TS2352). Não é `as any`, é cast em 2 etapas, idiomático.
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        data_pagamento: string | null;
        valor: number | null;
        sinal: number | null;
        descricao: string | null;
        conta_bancaria_id: string | null;
        conta_destino_id: string | null;
        conciliacao_bancaria_itens: Array<{ id: string }> | null;
      }>;
      return rows
        .filter(
          (l) =>
            !l.conciliacao_bancaria_itens ||
            l.conciliacao_bancaria_itens.length === 0,
        )
        .filter((l): l is typeof l & { data_pagamento: string } => !!l.data_pagamento)
        .map((l) => ({
          id: l.id,
          data_pagamento: l.data_pagamento,
          valor: Math.abs(Number(l.valor) || 0),
          sinal: Number(l.sinal),
          descricao: l.descricao,
          conta_bancaria_id: l.conta_bancaria_id,
          conta_destino_id: l.conta_destino_id,
        }));
    },
    staleTime: 30_000,
  });

  // PR3 — enriquecimento client-side (loading-safe).
  const enriquecidoLoading =
    !vinculosByExtratoId || !refsExcelPendentes || !lancamentosOrfaosDoMes;

  const enriquecidos = useMemo<MovimentoEnriquecido[]>(() => {
    if (!vinculosByExtratoId || !refsExcelPendentes || !lancamentosOrfaosDoMes) {
      // Render sem enriquecimento — placeholder neutro até queries chegarem.
      return movimentos.map((m) => ({
        ...m,
        statusEnriquecido: m.status === 'ignorado' ? 'ignorado' : 'orfao_sem_pista',
        vinculos: [],
        valorAplicado: 0,
        valorPendente: Math.abs(m.valor),
        qtCandidatosSistema: 0,
        qtRefsExcel: 0,
        candidatosSistemaIds: [],
        refsExcelIds: [],
      }));
    }
    return enriquecerMovimentos({
      movimentos,
      vinculosByExtratoId,
      refsExcelPendentes,
      lancamentosOrfaosDoMes,
    });
  }, [movimentos, vinculosByExtratoId, refsExcelPendentes, lancamentosOrfaosDoMes]);

  const [conciliando, setConciliando] = useState<ExtratoMovimentoRef | null>(null);
  const [ignorandoId, setIgnorandoId] = useState<string | null>(null);
  const [movCriando, setMovCriando] = useState<ExtratoMovimento | null>(null);

  // Carrega as listas necessárias para o LancamentoV2Dialog uma vez no mount.
  // Os 3 loaders são useCallback estáveis no useFinanceiroV2.
  useEffect(() => {
    loadContas();
    loadFornecedores();
    loadClassificacoes();
  }, [loadContas, loadFornecedores, loadClassificacoes]);

  const handleIgnorar = async (mov: ExtratoMovimento) => {
    setIgnorandoId(mov.id);
    const { error } = await supabase
      .from('extrato_bancario_v2' as any)
      .update({ status: 'ignorado' })
      .eq('id', mov.id);
    setIgnorandoId(null);
    if (error) {
      toast.error('Erro ao ignorar: ' + error.message);
      return;
    }
    toast.success('Movimento marcado como ignorado');
    refetch();
  };

  const handleCriarFromExtrato = async (
    form: LancamentoV2Form,
    _id?: string,
  ): Promise<boolean> => {
    if (!movCriando) return false;
    const id = await criarLancamentoComId(form, { origem: 'extrato' });
    if (!id) return false; // hook já mostrou toast de erro — modal fica aberto pra retry
    try {
      await insertVinculo({
        extrato_id: movCriando.id,
        lancamento_id: id,
        valor_aplicado: Math.abs(movCriando.valor),
        cliente_id: movCriando.cliente_id,
      });
      toast.success('Lançamento criado e conciliado');
      setMovCriando(null);
      refetch();
      return true;
    } catch (e: any) {
      // Lançamento já está em financeiro_lancamentos_v2 — fechar modal pra evitar
      // duplicação acidental se operador re-clicar Salvar. Operador re-tenta o
      // vínculo via botão "Conciliar" (que agora filtra valor/sinal corretamente).
      toast.error(
        'Lançamento criado, mas erro ao vincular ao extrato: '
        + (e?.message ?? e)
        + '. Use o botão Conciliar para vincular manualmente.',
      );
      setMovCriando(null);
      refetch();
      return true;
    }
  };

  if (!contaBancariaId) {
    return (
      <div className="text-center text-xs text-muted-foreground py-6">
        Selecione uma conta para visualizar o extrato importado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        {loading ? 'Carregando...' : `${movimentos.length} movimento(s) no período.`}
      </div>

      <div className="border rounded overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="text-[10px]">Data</TableHead>
              <TableHead className="text-[10px]">Descrição</TableHead>
              <TableHead className="text-[10px]">Documento</TableHead>
              <TableHead className="text-[10px] text-right">Valor</TableHead>
              <TableHead className="text-[10px]">Status</TableHead>
              <TableHead className="text-[10px] w-[170px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  Nenhum movimento importado para esta conta/período.
                </TableCell>
              </TableRow>
            )}
            {enriquecidos.map(m => {
              const badge = STATUS_BADGE[m.status];
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-[11px] font-mono">{fmtData(m.data_movimento)}</TableCell>
                  <TableCell className="text-[11px] max-w-[260px]" title={m.descricao || ''}>
                    <div className="truncate">{m.descricao || '-'}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {enriquecidoLoading && (
                        <span className="text-[10px] text-muted-foreground">...</span>
                      )}
                      {!enriquecidoLoading && m.statusEnriquecido === 'parcial' && (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] h-5 px-1.5"
                        >
                          Parcial: falta {formatMoeda(m.valorPendente)}
                        </Badge>
                      )}
                      {!enriquecidoLoading &&
                        m.vinculos.length > 0 &&
                        m.statusEnriquecido !== 'parcial' && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] h-5 px-1.5"
                          >
                            Já vinculado ({formatMoeda(m.valorAplicado)})
                          </Badge>
                        )}
                      {!enriquecidoLoading &&
                        m.qtCandidatosSistema > 0 &&
                        m.vinculos.length === 0 && (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-300 text-[10px] h-5 px-1.5"
                          >
                            Sistema {m.qtCandidatosSistema}
                          </Badge>
                        )}
                      {!enriquecidoLoading &&
                        m.qtRefsExcel > 0 &&
                        m.vinculos.length === 0 && (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 text-yellow-700 border-yellow-300 text-[10px] h-5 px-1.5"
                          >
                            Excel {m.qtRefsExcel}
                          </Badge>
                        )}
                      {!enriquecidoLoading && m.statusEnriquecido === 'orfao_sem_pista' && (
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-700 border-red-300 text-[10px] h-5 px-1.5"
                        >
                          Sem pista
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">{m.documento || '-'}</TableCell>
                  <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatMoeda(m.valor)}
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado'}
                        onClick={() => setConciliando({
                          id: m.id,
                          cliente_id: m.cliente_id,
                          conta_bancaria_id: m.conta_bancaria_id,
                          data_movimento: m.data_movimento,
                          descricao: m.descricao,
                          documento: m.documento,
                          valor: m.valor,
                          status: m.status,
                        })}
                      >
                        Conciliar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        disabled={m.status === 'ignorado' || m.status === 'conciliado'}
                        onClick={() => setMovCriando(m)}
                      >
                        Criar lançamento
                      </Button>
                      {m.status !== 'ignorado' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-2 text-muted-foreground"
                          disabled={ignorandoId === m.id}
                          onClick={() => handleIgnorar(m)}
                        >
                          Ignorar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <LancamentoV2Dialog
        open={!!movCriando}
        onClose={() => setMovCriando(null)}
        onSave={handleCriarFromExtrato}
        fazendas={fazendas}
        contas={contasBancarias}
        classificacoes={classificacoes}
        fornecedores={fornecedores}
        onCriarFornecedor={criarFornecedor}
        prefill={movCriando ? {
          data_pagamento: movCriando.data_movimento,
          data_competencia: movCriando.data_movimento,
          valor: Math.abs(movCriando.valor),
          tipo_operacao: movCriando.valor < 0 ? '2-Saídas' : '1-Entradas',
          status_transacao: 'realizado',
          conta_bancaria_id: movCriando.conta_bancaria_id,
          descricao: movCriando.descricao ?? undefined,
          numero_documento: movCriando.documento ?? undefined,
        } : undefined}
        lockedFields={['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao']}
      />

      <ConciliarExtratoDialog
        open={!!conciliando}
        onClose={() => setConciliando(null)}
        movimento={conciliando}
        vinculosPreCarregados={
          conciliando ? (vinculosByExtratoId?.get(conciliando.id) ?? null) : null
        }
        onConciliado={() => { setConciliando(null); refetch(); }}
      />
    </div>
  );
}
