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
}

interface Props {
  parcela: Parcela | null;
  financiamento: Financiamento;
  onClose: () => void;
  modo?: 'registrar' | 'editar';
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
    setBaseline({ data_vencimento: dv, valor_principal: p, valor_juros: j, status: st, data_pagamento: dp, observacao: obs });

    // Default da Data Pagamento: se a parcela já estava paga, preserva a data registrada;
    // caso contrário, usa a data de vencimento da própria parcela (não a data de hoje).
    setDataPagamento(dp || dv);
    setContaBancariaId(financiamento.conta_bancaria_id ?? '');
  }, [parcela, lastParcelaId, financiamento.conta_bancaria_id]);

  const valorTotal = principal + juros;
  const isEditar = modo === 'editar';

  const { data: contas = [] } = useQuery({
    queryKey: ['baixa-contas', financiamento.cliente_id],
    enabled: !!parcela,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao')
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
    (status === 'pago' && contaBancariaId !== (financiamento.conta_bancaria_id ?? '')) ||
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
      const { criarMirrorParcela, atualizarStatusMirror } = await import('@/lib/financiamentos/parcelaMirror');

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
      const { lancamentoIdPrincipal, lancamentoIdJuros } = await criarMirrorParcela(supabase as any, {
        id: parcela.id,
        cliente_id: financiamento.cliente_id,
        fazenda_id: financiamento.fazenda_id,
        data_vencimento: dataPagamento,
        valor_principal: parcela.valor_principal,
        valor_juros: parcela.valor_juros,
        lancamento_id: lancamentoIdEfetivo,
        lancamento_juros_id: lancamentoJurosIdEfetivo,
      }, {
        id: financiamento.id,
        cliente_id: financiamento.cliente_id,
        fazenda_id: financiamento.fazenda_id,
        tipo_financiamento: tipo,
        descricao: financiamento.descricao ?? null,
        numero_contrato: financiamento.numero_contrato ?? null,
        credor_id: financiamento.credor_id ?? null,
        data_contrato: financiamento.data_contrato ?? null,
      });

      // 3. Setar status realizado + conta bancária + data real de pagamento via IDs oficiais
      const anoMes = dataPagamento.slice(0, 7);
      await atualizarStatusMirror(supabase as any, lancamentoIdPrincipal, lancamentoIdJuros, dataPagamento, contaBancariaId);
      // Atualizar ano_mes para refletir o mês efetivo de pagamento
      const idsParaAtualizar = [lancamentoIdPrincipal, lancamentoIdJuros].filter(Boolean) as string[];
      if (idsParaAtualizar.length > 0) {
        await supabase.from('financeiro_lancamentos_v2').update({ ano_mes: anoMes }).in('id', idsParaAtualizar);
      }

      // 4. Atualizar parcela
      const { error: errParc } = await supabase
        .from('financiamento_parcelas')
        .update({ status: 'pago', data_pagamento: dataPagamento, valor_principal: parcela.valor_principal, valor_juros: parcela.valor_juros, updated_at: new Date().toISOString() })
        .eq('id', parcela.id);
      if (errParc) throw errParc;

      toast.success('Parcela registrada com sucesso!');
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financiamentos-lista', financiamento.cliente_id] });
      qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamento.id] });
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
      const indoParaPago = statusMudou && status === 'pago';
      const saindoDePago = statusMudou && baseline.status === 'pago' && status !== 'pago';
      const ehPagoComMudancas = status === 'pago' && (valoresMudaram || dataMudou || dataPagamentoMudou);

      const tipo = financiamento.tipo_financiamento;
      const tipoValido = tipo === 'pecuaria' || tipo === 'agricultura';

      const { deletarMirrorParcela, criarMirrorParcela, atualizarStatusMirror } =
        await import('@/lib/financiamentos/parcelaMirror');

      if (status === 'cancelado' || saindoDePago) {
        // Remove mirror e desvincula a parcela.
        await deletarMirrorParcela(supabase as any, parcela.id);
        await supabase
          .from('financiamento_parcelas')
          .update({ lancamento_id: null })
          .eq('id', parcela.id);
        // Se saindoDePago e não cancelado, e ainda há valor → recria mirror programado para o novo vencimento.
        if (status !== 'cancelado' && tipoValido && (principal > 0 || juros > 0)) {
          await criarMirrorParcela(supabase as any, {
            id: parcela.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            data_vencimento: dataVencimento,
            valor_principal: principal,
            valor_juros: juros,
            lancamento_id: null,
          }, {
            id: financiamento.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            tipo_financiamento: tipo,
            descricao: financiamento.descricao ?? null,
            numero_contrato: financiamento.numero_contrato ?? null,
            credor_id: financiamento.credor_id ?? null,
            data_contrato: financiamento.data_contrato ?? null,
          });
        }
      } else if (indoParaPago || ehPagoComMudancas) {
        // Recria mirror com novos valores/data e marca como realizado.
        await deletarMirrorParcela(supabase as any, parcela.id);
        await supabase
          .from('financiamento_parcelas')
          .update({ lancamento_id: null })
          .eq('id', parcela.id);
        if (tipoValido && (principal > 0 || juros > 0)) {
          const { lancamentoIdPrincipal: newLancId, lancamentoIdJuros: newJurosId } =
            await criarMirrorParcela(supabase as any, {
            id: parcela.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            data_vencimento: dataPagamento || dataVencimento,
            valor_principal: principal,
            valor_juros: juros,
            lancamento_id: null,
          }, {
            id: financiamento.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            tipo_financiamento: tipo,
            descricao: financiamento.descricao ?? null,
            numero_contrato: financiamento.numero_contrato ?? null,
            credor_id: financiamento.credor_id ?? null,
            data_contrato: financiamento.data_contrato ?? null,
          });
          if (dataPagamento) {
            await atualizarStatusMirror(
            supabase as any,
            newLancId,
            newJurosId,
            dataPagamento,
            contaBancariaId,
          );
          }
        }
      } else if (valoresMudaram || dataMudou) {
        // Pendente com valores/data alterados — recria mirror programado.
        await deletarMirrorParcela(supabase as any, parcela.id);
        await supabase
          .from('financiamento_parcelas')
          .update({ lancamento_id: null })
          .eq('id', parcela.id);
        if (tipoValido && (principal > 0 || juros > 0)) {
          await criarMirrorParcela(supabase as any, {
            id: parcela.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            data_vencimento: dataVencimento,
            valor_principal: principal,
            valor_juros: juros,
            lancamento_id: null,
          }, {
            id: financiamento.id,
            cliente_id: financiamento.cliente_id,
            fazenda_id: financiamento.fazenda_id,
            tipo_financiamento: tipo,
            descricao: financiamento.descricao ?? null,
            numero_contrato: financiamento.numero_contrato ?? null,
            credor_id: financiamento.credor_id ?? null,
            data_contrato: financiamento.data_contrato ?? null,
          });
        }
      }

      toast.success('Parcela atualizada');
      qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamento.id] });
      qc.invalidateQueries({ queryKey: ['financiamentos-lista', financiamento.cliente_id] });
      qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamento.id] });
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
        <DialogContent className={`max-w-md ${isEditar ? 'border-primary/60 border-2' : ''}`}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              {isEditar ? `Editar Parcela #${parcela.numero_parcela}` : `Registrar pagamento — Parcela ${parcela.numero_parcela}/${financiamento.total_parcelas}`}
            </DialogTitle>
            {isEditar && <div className="text-[10px] text-primary font-semibold uppercase">Modo edição</div>}
          </DialogHeader>

          {/* REGISTRAR */}
          {modo === 'registrar' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Data do pagamento</Label>
                <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
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
                <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {contas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" />
              </div>
            </div>
          )}

          {/* EDITAR */}
          {isEditar && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Data de vencimento *</Label>
                <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} />
                {erros.data_vencimento && <p className="text-[10px] text-destructive mt-0.5">{erros.data_vencimento}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Principal *</Label>
                  <Input type="number" step="0.01" value={principal} onChange={e => setPrincipal(Number(e.target.value))} />
                  {erros.valor_principal && <p className="text-[10px] text-destructive mt-0.5">{erros.valor_principal}</p>}
                </div>
                <div>
                  <Label className="text-xs">Juros *</Label>
                  <Input type="number" step="0.01" value={juros} onChange={e => setJuros(Number(e.target.value))} />
                  {erros.valor_juros && <p className="text-[10px] text-destructive mt-0.5">{erros.valor_juros}</p>}
                </div>
                <div>
                  <Label className="text-xs">Total</Label>
                  <Input type="text" value={fmt(valorTotal)} readOnly className="bg-muted font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Status *</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {status === 'pago' && (
                  <div>
                    <Label className="text-xs">Data pagamento *</Label>
                    <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                    {erros.data_pagamento && <p className="text-[10px] text-destructive mt-0.5">{erros.data_pagamento}</p>}
                  </div>
                )}
              </div>
              {status === 'pago' && (
                <div>
                  <Label className="text-xs">Conta bancária *</Label>
                  <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {contas.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome_exibicao || c.nome_conta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {erros.conta_bancaria_id && <p className="text-[10px] text-destructive mt-0.5">{erros.conta_bancaria_id}</p>}
                </div>
              )}
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleRequestClose} disabled={saving}>Cancelar</Button>
            {isEditar ? (
              <Button onClick={handleSalvarEdicao} disabled={saving || temErros}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            ) : (
              <Button onClick={handleConfirmRegistrar} disabled={saving}>
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
