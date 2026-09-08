import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Parcela {
  id: string;
  numero_parcela: number;
  valor_principal: number;
  valor_juros: number;
  data_vencimento: string;
  data_pagamento?: string | null;
  status?: string;
  observacao?: string | null;
  lancamento_id?: string | null;
  lancamento_juros_id?: string | null;
}

interface Financiamento {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  descricao: string;
  total_parcelas: number;
  tipo_financiamento?: string;
  status?: string;
  plano_conta_parcela_id: string | null;
  conta_bancaria_id: string | null;
  numero_contrato?: string | null;
  credor_id?: string | null;
  data_contrato?: string | null;
  /** PR-PARC-05 — decide se a coluna/campo de Juros existe. Parcelamento nao tem juros. */
  natureza?: string | null;
}

interface Props {
  parcela: Parcela | null;
  financiamento: Financiamento;
  onClose: () => void;
  modo?: 'registrar' | 'editar';
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* Idioma canonico de campo travado (AbaLiquidacaoOC / CompraModalShell). */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';
const CAMPO = 'h-8';                                   // A16 — tudo na mesma altura
const ROTULO = 'text-[10px] font-normal text-muted-foreground';
/* ⚠ O DROPDOWN TEM A LARGURA DO CAMPO. Sem `position="popper"` o Radix mede a caixa
   pelo item mais longo e ela estoura para fora do modal de 448px; com ele, a variavel
   `--radix-select-trigger-width` existe e a caixa nasce do tamanho do gatilho. */
const SELECT_POPPER = 'w-[var(--radix-select-trigger-width)]';

/* Vocabulario de tela — os identificadores gravados continuam pendente/pago/cancelado. */
type Situacao = 'pendente' | 'pago' | 'cancelado';
/* ⚠ GUARDA, NAO CAST (regra zero-cast). O `onValueChange` entrega `string`; `as any`
   calaria o compilador sem olhar o valor. */
const ehSituacao = (v: string): v is Situacao =>
  v === 'pendente' || v === 'pago' || v === 'cancelado';

const SITUACAO_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  pago: 'Paga',
  cancelado: 'Cancelada',
};

export default function ModalBaixaParcela({ parcela, financiamento, onClose, modo = 'registrar' }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // ── Registrar (baixa) ──
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [contaBancariaId, setContaBancariaId] = useState(financiamento.conta_bancaria_id ?? '');

  // ── Editar ──
  const [dataVencimento, setDataVencimento] = useState('');
  const [principal, setPrincipal] = useState(0);
  const [juros, setJuros] = useState(0);
  const [status, setStatus] = useState<'pendente' | 'pago' | 'cancelado'>('pendente');
  const [observacao, setObservacao] = useState('');

  // Dirty check (só no modo editar)
  const [lastParcelaId, setLastParcelaId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<{
    data_vencimento: string;
    valor_principal: number;
    valor_juros: number;
    status: string;
    data_pagamento: string;
    observacao: string;
    conta_bancaria_id: string;
  } | null>(null);

  useEffect(() => {
    if (!parcela) return;
    if (parcela.id === lastParcelaId) return;
    setLastParcelaId(parcela.id);

    const dv = parcela.data_vencimento;
    const dp = parcela.data_pagamento ?? '';
    const st = (parcela.status ?? 'pendente') as 'pendente' | 'pago' | 'cancelado';
    const obs = parcela.observacao ?? '';
    const p = Number(parcela.valor_principal) || 0;
    const j = Number(parcela.valor_juros) || 0;

    setDataVencimento(dv);
    setPrincipal(p);
    setJuros(j);
    setStatus(st);
    setObservacao(obs);

    // Default da Data Pagamento: se a parcela já estava paga, preserva a data registrada;
    // caso contrário, usa a data de vencimento da própria parcela (não a data de hoje).
    setDataPagamento(dp || dv);

    // Conta bancária: para parcela paga, ler a conta real do lançamento financeiro vinculado
    // (financeiro_lancamentos_v2.conta_bancaria_id via parcela.lancamento_id). Default do
    // financiamento serve apenas como fallback visual enquanto o fetch resolve / quando
    // não há lançamento vinculado.
    const fallbackConta = financiamento.conta_bancaria_id ?? '';
    setContaBancariaId(fallbackConta);
    setBaseline({
      data_vencimento: dv,
      valor_principal: p,
      valor_juros: j,
      status: st,
      data_pagamento: dp,
      observacao: obs,
      conta_bancaria_id: fallbackConta,
    });

    if (st === 'pago' && parcela.lancamento_id) {
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('conta_bancaria_id')
          .eq('id', parcela.lancamento_id!)
          .maybeSingle();
        if (cancelled) return;
        const contaReal = (data?.conta_bancaria_id as string | null | undefined) ?? fallbackConta;
        setContaBancariaId(contaReal);
        setBaseline(prev => prev ? { ...prev, conta_bancaria_id: contaReal } : prev);
      })();
      return () => { cancelled = true; };
    }
  }, [parcela, lastParcelaId, financiamento.conta_bancaria_id]);

  const valorTotal = principal + juros;
  const isEditar = modo === 'editar';
  const ehParcelamento = financiamento.natureza === 'parcelamento';

  const { data: contas = [] } = useQuery({
    queryKey: ['baixa-contas', financiamento.cliente_id],
    enabled: !!parcela,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        // PR-H2 — tipo_conta para agrupamento no ContaBancariaSelect.
        .select('id, nome_conta, nome_exibicao, tipo_conta')
        .eq('cliente_id', financiamento.cliente_id)
        .eq('ativa', true)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const dirty = isEditar && !!baseline && (
    dataVencimento !== baseline.data_vencimento ||
    principal !== baseline.valor_principal ||
    juros !== baseline.valor_juros ||
    status !== baseline.status ||
    (status === 'pago' ? dataPagamento : '') !== (baseline.status === 'pago' ? baseline.data_pagamento : '') ||
    (status === 'pago' && contaBancariaId !== (baseline.conta_bancaria_id ?? '')) ||
    observacao !== baseline.observacao
  );

  const handleRequestClose = () => {
    if (isEditar && dirty) { setConfirmClose(true); return; }
    onClose();
  };

  // ── Validação (editar) ──
  const erros: Record<string, string> = {};
  if (isEditar) {
    if (!dataVencimento) erros.data_vencimento = 'Obrigatório';
    if (principal < 0 || Number.isNaN(principal)) erros.valor_principal = 'Deve ser ≥ 0';
    if (juros < 0 || Number.isNaN(juros)) erros.valor_juros = 'Deve ser ≥ 0';
    if (status === 'pago' && !dataPagamento) erros.data_pagamento = 'Obrigatório quando pago';
    if (status === 'pago' && !contaBancariaId) erros.conta_bancaria_id = 'Obrigatório quando pago';
  }
  const temErros = Object.keys(erros).length > 0;

  // ══════════════════════════════════════════
  // REGISTRAR — usa parcelaMirror (um lançamento por contrato, plano correto)
  // ══════════════════════════════════════════
  const handleConfirmRegistrar = async () => {
    if (!parcela) return;
    if (!contaBancariaId) { toast.error('Selecione a conta bancária.'); return; }
    if (!dataPagamento) { toast.error('Informe a data de pagamento.'); return; }
    const tipo = financiamento.tipo_financiamento;
    if (tipo !== 'pecuaria' && tipo !== 'agricultura') {
      toast.error('Tipo de financiamento inválido. Edite o financiamento antes de registrar.');
      return;
    }
    setSaving(true);
    try {

      // 1. Remover lançamento legado inválido (origem_lancamento='financiamento') se existir
      // Rastrear IDs efetivos: se legado removido, zerar; senão usar state atual
      let lancamentoIdEfetivo: string | null = parcela.lancamento_id ?? null;
      let lancamentoJurosIdEfetivo: string | null = parcela.lancamento_juros_id ?? null;

      if (parcela.lancamento_id) {
        const { data: oldLanc } = await supabase
          .from('financeiro_lancamentos_v2')
          .select('id, origem_lancamento')
          .eq('id', parcela.lancamento_id)
          .maybeSingle();
        if (oldLanc?.origem_lancamento === 'financiamento') {
          await supabase.from('financeiro_lancamentos_v2').delete().eq('id', oldLanc.id);
          await supabase.from('financiamento_parcelas').update({ lancamento_id: null, lancamento_juros_id: null }).eq('id', parcela.id);
          lancamentoIdEfetivo = null;
          lancamentoJurosIdEfetivo = null;
        }
      }

      // 2. Criar/garantir mirror via IDs oficiais (idempotente por lancamento_id/lancamento_juros_id)
      // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
      // const { lancamentoIdPrincipal, lancamentoIdJuros } = await criarMirrorParcela(supabase as any, {
      //   id: parcela.id,
      //   cliente_id: financiamento.cliente_id,
      //   fazenda_id: financiamento.fazenda_id,
      //   data_vencimento: dataPagamento,
      //   valor_principal: parcela.valor_principal,
      //   valor_juros: parcela.valor_juros,
      //   lancamento_id: lancamentoIdEfetivo,
      //   lancamento_juros_id: lancamentoJurosIdEfetivo,
      // }, {
      //   id: financiamento.id,
      //   cliente_id: financiamento.cliente_id,
      //   fazenda_id: financiamento.fazenda_id,
      //   tipo_financiamento: tipo,
      //   descricao: financiamento.descricao ?? null,
      //   numero_contrato: financiamento.numero_contrato ?? null,
      //   credor_id: financiamento.credor_id ?? null,
      //   data_contrato: financiamento.data_contrato ?? null,
      // });
      // PR-FIN-DATAS-VENCIMENTO-02B: o bloco que atualizava ano_mes foi removido.
      // Ele era inalcancavel — os dois ids locais eram sempre null, entao o
      // update nunca chegava a ser emitido — e, se fosse, o trigger 02E o
      // descartaria: ano_mes deriva de data_competencia, nao do pagamento.

      // 4. Atualizar parcela
      const { error: errParc } = await supabase
        .from('financiamento_parcelas')
        .update({ status: 'pago', data_pagamento: dataPagamento, valor_principal: parcela.valor_principal, valor_juros: parcela.valor_juros, updated_at: new Date().toISOString() })
        .eq('id', parcela.id);
      if (errParc) throw errParc;

      // Aciona motor oficial de reconciliacao financeira (uma chamada por funcao,
      // no estado final da parcela). Motor le parcela e reconcilia espelhos em
      // financeiro_lancamentos_v2 (cria/atualiza/cancela conforme estado).
      // Cast em supabase: fn_reconciliar_parcela_financiamento criada no banco;
      // tipos gerados ainda nao incluem (regeneracao em frente separada).
      // PR-K-bis: passa p_conta_bancaria_id explicito quando operador escolheu
      // conta na baixa. Fallback (null) -> RPC pega financiamentos.conta_bancaria_id.
      const { error: motorError } = await (supabase as any).rpc(
        'fn_reconciliar_parcela_financiamento',
        {
          p_parcela_id: parcela.id,
          p_dry_run: false,
          p_recalcula_vt: true,
          p_conta_bancaria_id: contaBancariaId || null,
        },
      );
      if (motorError) {
        toast.error(
          'Parcela salva, mas sincronizacao financeira falhou: ' + motorError.message,
        );
      }

      toast.success('Parcela registrada com sucesso!');
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financiamentos-lista', financiamento.cliente_id] });
      qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financeiro-data'] });
      qc.invalidateQueries({ queryKey: ['financeiro-lancamentos'] });
      qc.invalidateQueries({ queryKey: ['fluxoCaixaModalLancs'] });
      qc.invalidateQueries({ queryKey: ['parcela-lancamentos-oficiais'] });
      onClose();
    } catch (e: any) {
      toast.error('Erro ao registrar pagamento: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  // ══════════════════════════════════════════
  // EDITAR — alteração direta da parcela + mirror
  // ══════════════════════════════════════════
  const handleSalvarEdicao = async () => {
    if (!parcela || !baseline) return;
    if (temErros) { toast.error('Corrija os erros antes de salvar'); return; }

    setSaving(true);
    try {
      const valoresMudaram = principal !== baseline.valor_principal || juros !== baseline.valor_juros;
      const dataMudou = dataVencimento !== baseline.data_vencimento;
      const statusMudou = status !== baseline.status;

      const { error: errParc } = await supabase
        .from('financiamento_parcelas')
        .update({
          data_vencimento: dataVencimento,
          valor_principal: principal,
          valor_juros: juros,
          valor_total: valorTotal,
          status,
          data_pagamento: status === 'pago' ? dataPagamento : null,
          observacao: observacao.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parcela.id);
      if (errParc) throw errParc;

      const dataPagamentoMudou = (status === 'pago' ? dataPagamento : '') !== (baseline.status === 'pago' ? baseline.data_pagamento : '');
      const contaMudou = status === 'pago' && contaBancariaId !== (baseline.conta_bancaria_id ?? '');
      const indoParaPago = statusMudou && status === 'pago';
      const saindoDePago = statusMudou && baseline.status === 'pago' && status !== 'pago';
      const ehPagoComMudancas = status === 'pago' && (valoresMudaram || dataMudou || dataPagamentoMudou);

      const tipo = financiamento.tipo_financiamento;
      const tipoValido = tipo === 'pecuaria' || tipo === 'agricultura';


      if (status === 'cancelado' || saindoDePago) {
        // CORREÇÃO: cancelar parcela deve cancelar (marcar cancelado=true) o lançamento espelho
        // em financeiro_lancamentos_v2 — não apenas desvincular o ponteiro da parcela.
        if (status === 'cancelado') {
          if (parcela.lancamento_id) {
            await supabase
              .from('financeiro_lancamentos_v2')
              .update({
                cancelado: true,
                cancelado_em: new Date().toISOString(),
                sem_movimentacao_caixa: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', parcela.lancamento_id);
          }
          if (parcela.lancamento_juros_id) {
            await supabase
              .from('financeiro_lancamentos_v2')
              .update({
                cancelado: true,
                cancelado_em: new Date().toISOString(),
                sem_movimentacao_caixa: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', parcela.lancamento_juros_id);
          }
        }
        await supabase
          .from('financiamento_parcelas')
          .update({ lancamento_id: null, lancamento_juros_id: null } as any)
          .eq('id', parcela.id);
        // Se saindoDePago e não cancelado, e ainda há valor → recria mirror programado para o novo vencimento.
        if (status !== 'cancelado' && tipoValido && (principal > 0 || juros > 0)) {
          // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
          // await criarMirrorParcela(supabase as any, {
          //   id: parcela.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   data_vencimento: dataVencimento,
          //   valor_principal: principal,
          //   valor_juros: juros,
          //   lancamento_id: null,
          // }, {
          //   id: financiamento.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   tipo_financiamento: tipo,
          //   descricao: financiamento.descricao ?? null,
          //   numero_contrato: financiamento.numero_contrato ?? null,
          //   credor_id: financiamento.credor_id ?? null,
          //   data_contrato: financiamento.data_contrato ?? null,
          // });
        }
      } else if (indoParaPago || ehPagoComMudancas) {
        // Recria mirror com novos valores/data e marca como realizado.
        // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
        // await deletarMirrorParcela(supabase as any, parcela.id);
        if (tipoValido && (principal > 0 || juros > 0)) {
          // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
          // const { lancamentoIdPrincipal: newLancId, lancamentoIdJuros: newJurosId } =
          //   await criarMirrorParcela(supabase as any, {
          //   id: parcela.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   data_vencimento: dataPagamento || dataVencimento,
          //   valor_principal: principal,
          //   valor_juros: juros,
          //   lancamento_id: null,
          // }, {
          //   id: financiamento.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   tipo_financiamento: tipo,
          //   descricao: financiamento.descricao ?? null,
          //   numero_contrato: financiamento.numero_contrato ?? null,
          //   credor_id: financiamento.credor_id ?? null,
          //   data_contrato: financiamento.data_contrato ?? null,
          // });
          if (dataPagamento) {
            // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
            // await atualizarStatusMirror(
            //   supabase as any,
            //   newLancId,
            //   newJurosId,
            //   dataPagamento,
            //   contaBancariaId,
            // );
          }
        }
      } else if (valoresMudaram || dataMudou) {
        // Pendente com valores/data alterados — recria mirror programado.
        // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
        // await deletarMirrorParcela(supabase as any, parcela.id);
        if (tipoValido && (principal > 0 || juros > 0)) {
          // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
          // await criarMirrorParcela(supabase as any, {
          //   id: parcela.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   data_vencimento: dataVencimento,
          //   valor_principal: principal,
          //   valor_juros: juros,
          //   lancamento_id: null,
          // }, {
          //   id: financiamento.id,
          //   cliente_id: financiamento.cliente_id,
          //   fazenda_id: financiamento.fazenda_id,
          //   tipo_financiamento: tipo,
          //   descricao: financiamento.descricao ?? null,
          //   numero_contrato: financiamento.numero_contrato ?? null,
          //   credor_id: financiamento.credor_id ?? null,
          //   data_contrato: financiamento.data_contrato ?? null,
          // });
        }
      } else if (contaMudou) {
        // Apenas a conta bancária mudou — atualiza in-place os lançamentos vinculados
        // (principal e juros) sem deletar/recriar. atualizarStatusMirror já cobre ambos.
        if (parcela.lancamento_id || parcela.lancamento_juros_id) {
          // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
          // await atualizarStatusMirror(
          //   supabase as any,
          //   parcela.lancamento_id ?? null,
          //   parcela.lancamento_juros_id ?? null,
          //   dataPagamento,
          //   contaBancariaId,
          // );
        }
      }

      // Aciona motor oficial de reconciliacao financeira (uma chamada por funcao,
      // apos todos os branches de cancelamento/limpeza terem manipulado o estado).
      // Motor le o estado FINAL da parcela e reconcilia espelhos em
      // financeiro_lancamentos_v2 (cria/atualiza/cancela conforme estado).
      // Cast em supabase: fn_reconciliar_parcela_financiamento criada no banco;
      // tipos gerados ainda nao incluem (regeneracao em frente separada).
      // PR-K-bis: passa p_conta_bancaria_id explicito quando operador escolheu
      // conta na baixa. Fallback (null) -> RPC pega financiamentos.conta_bancaria_id.
      const { error: motorError } = await (supabase as any).rpc(
        'fn_reconciliar_parcela_financiamento',
        {
          p_parcela_id: parcela.id,
          p_dry_run: false,
          p_recalcula_vt: true,
          p_conta_bancaria_id: contaBancariaId || null,
        },
      );
      if (motorError) {
        toast.error(
          'Parcela salva, mas sincronizacao financeira falhou: ' + motorError.message,
        );
      }

      toast.success('Parcela atualizada');
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financiamentos-lista', financiamento.cliente_id] });
      qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financeiro-data'] });
      qc.invalidateQueries({ queryKey: ['financeiro-lancamentos'] });
      qc.invalidateQueries({ queryKey: ['fluxoCaixaModalLancs'] });
      qc.invalidateQueries({ queryKey: ['parcela-lancamentos-oficiais'] });
      onClose();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  if (!parcela) return null;

  return (
    <>
      <Dialog open={!!parcela} onOpenChange={(v) => { if (!v) handleRequestClose(); }}>
        {/* ⚠ ENVELOPE DAS CASCAS PROPRIAS (o mesmo do ObrigacaoDialog e do CompraModalShell):
            `p-0 gap-0 overflow-hidden` e X nativo escondido — sem `gap-0` o DialogContent
            injeta `gap-4` entre cabecalho, corpo e rodape. */}
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
          <div className="bg-primary text-primary-foreground px-6 py-2.5">
            <DialogTitle className="text-lg font-bold leading-tight">
              Parcela {parcela.numero_parcela}/{financiamento.total_parcelas}
            </DialogTitle>
            {/* O contrato no subtitulo: aberto por dentro da tela do contrato, o modal
                perdia a referencia de QUAL contrato se estava mexendo. */}
            <p className="mt-1 text-xs text-white/80 truncate" title={financiamento.descricao}>
              {financiamento.descricao}
            </p>
          </div>

          {/* REGISTRAR */}
          {modo === 'registrar' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Data do pagamento</Label>
                {/* 136a item 2 — o último calendário nativo desta tela. O modo editar já
                    abria o calendário azul; aqui o operador ainda via o do navegador, com
                    "Limpar/Hoje" que não são nossos e o fuso que devolve o dia anterior. */}
                <DatePicker value={dataPagamento} onChange={setDataPagamento} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Principal</Label>
                  <Input type="number" step="0.01" value={principal} onChange={e => setPrincipal(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Juros</Label>
                  <Input type="number" step="0.01" value={juros} onChange={e => setJuros(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Total</Label>
                  <Input type="text" value={fmt(valorTotal)} readOnly className="bg-muted font-semibold" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Conta bancária</Label>
                {/* PR-H2 — ContaBancariaSelect compartilhado. */}
                <ContaBancariaSelect
                  value={contaBancariaId}
                  onValueChange={setContaBancariaId}
                  contas={contas}
                  placeholder="Selecione"
                />
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" />
              </div>
            </div>
          )}

          {/* EDITAR */}
          {isEditar && (
            <div className="p-4 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className={ROTULO}>Vencimento *</Label>
                  <DatePicker value={dataVencimento} onChange={setDataVencimento} />
                  {erros.data_vencimento && <p className="text-[10px] text-destructive mt-0.5">{erros.data_vencimento}</p>}
                </div>
                <div>
                  <Label className={ROTULO}>Situação *</Label>
                  <Select value={status} onValueChange={(v) => { if (ehSituacao(v)) setStatus(v); }}>
                    <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" className={SELECT_POPPER}>
                      <SelectItem value="pendente">{SITUACAO_LABEL.pendente}</SelectItem>
                      <SelectItem value="pago">{SITUACAO_LABEL.pago}</SelectItem>
                      <SelectItem value="cancelado">{SITUACAO_LABEL.cancelado}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ⚠ SEM COLUNA DE JUROS NO PARCELAMENTO — a grade encolhe para 2 colunas.
                  Esconder a celula mantendo `grid-cols-3` deixaria um terco vazio, e buraco
                  em grade le-se como campo que faltou carregar. */}
              <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <div>
                  <Label className={ROTULO}>Principal *</Label>
                  <CampoMoeda valor={principal} onChange={n => setPrincipal(n ?? 0)}
                    placeholder="R$ 0,00" className={`${CAMPO} text-right font-mono tabular-nums`} />
                  {erros.valor_principal && <p className="text-[10px] text-destructive mt-0.5">{erros.valor_principal}</p>}
                </div>
                {!ehParcelamento && (
                  <div>
                    <Label className={ROTULO}>Juros *</Label>
                    <CampoMoeda valor={juros} onChange={n => setJuros(n ?? 0)}
                      placeholder="R$ 0,00" className={`${CAMPO} text-right font-mono tabular-nums`} />
                    {erros.valor_juros && <p className="text-[10px] text-destructive mt-0.5">{erros.valor_juros}</p>}
                  </div>
                )}
                <div>
                  <Label className={ROTULO}>Total</Label>
                  <Input readOnly tabIndex={-1} value={fmt(valorTotal)}
                    className={`${CAMPO} text-right font-mono tabular-nums ${CAMPO_TRAVADO}`} />
                </div>
              </div>

              {/* ⚠ OS DOIS CAMPOS DO PAGAMENTO EXISTEM SEMPRE, DESABILITADOS ATE' A PARCELA
                  SER PAGA. Antes eles APARECIAM ao trocar a situacao: o modal mudava de
                  altura debaixo do cursor e o rodape saia do lugar. Desabilitado tambem e'
                  honesto — fora de "Paga" a conta nao e' lida pelo gravador. */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className={ROTULO}>Pago em {status === 'pago' && '*'}</Label>
                  <DatePicker value={dataPagamento} onChange={setDataPagamento} disabled={status !== 'pago'} />
                  {erros.data_pagamento && <p className="text-[10px] text-destructive mt-0.5">{erros.data_pagamento}</p>}
                </div>
                <div>
                  <Label className={ROTULO}>Conta bancária {status === 'pago' && '*'}</Label>
                  <ContaBancariaSelect
                    value={contaBancariaId}
                    onValueChange={setContaBancariaId}
                    contas={contas}
                    placeholder="Selecione"
                    disabled={status !== 'pago'}
                    className={CAMPO}
                  />
                  {erros.conta_bancaria_id && <p className="text-[10px] text-destructive mt-0.5">{erros.conta_bancaria_id}</p>}
                </div>
              </div>

              <div>
                <Label className={ROTULO}>Observação</Label>
                <Input className={CAMPO} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="opcional" />
              </div>
            </div>
          )}

          <DialogFooter className="border-t px-4 py-2.5 sm:justify-end">
            <Button variant="outline" size="sm" className={CAMPO} onClick={handleRequestClose} disabled={saving}>Cancelar</Button>
            {isEditar ? (
              <Button size="sm" className={`${CAMPO} bg-cta text-cta-foreground hover:bg-cta-hover font-semibold`}
                onClick={handleSalvarEdicao} disabled={saving || temErros}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            ) : (
              <Button size="sm" className={`${CAMPO} bg-cta text-cta-foreground hover:bg-cta-hover font-semibold`}
                onClick={handleConfirmRegistrar} disabled={saving}>
                {saving ? 'Salvando…' : 'Confirmar pagamento'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há alterações não salvas. Fechar agora vai descartá-las.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmClose(false); onClose(); }}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
