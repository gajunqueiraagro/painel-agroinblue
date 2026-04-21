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
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Pencil } from 'lucide-react';

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
}

interface Financiamento {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  descricao: string;
  total_parcelas: number;
  tipo_financiamento?: string;
  status?: string; // 'ativo' | 'quitado' | 'cancelado'
  plano_conta_parcela_id: string | null;
  conta_bancaria_id: string | null;
}

interface Props {
  parcela: Parcela | null;
  financiamento: Financiamento;
  onClose: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null | undefined) => (d ? format(parseISO(d + 'T12:00:00'), 'dd/MM/yyyy') : '—');

const STATUS_LABELS: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', cancelado: 'Cancelado' };

export default function ModalBaixaParcela({ parcela, financiamento, onClose }: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<'visualizar' | 'editar'>('visualizar');
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // form state
  const [dataVencimento, setDataVencimento] = useState('');
  const [principal, setPrincipal] = useState(0);
  const [juros, setJuros] = useState(0);
  const [status, setStatus] = useState<'pendente' | 'pago' | 'cancelado'>('pendente');
  const [dataPagamento, setDataPagamento] = useState('');
  const [observacao, setObservacao] = useState('');

  // baseline for dirty check
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
    setModo('visualizar');
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
    setDataPagamento(dp);
    setObservacao(obs);
    setBaseline({
      data_vencimento: dv,
      valor_principal: p,
      valor_juros: j,
      status: st,
      data_pagamento: dp,
      observacao: obs,
    });
  }, [parcela, lastParcelaId]);

  const valorTotal = principal + juros;
  const finativo = (financiamento.status ?? 'ativo') === 'ativo';

  const dirty = !!baseline && (
    dataVencimento !== baseline.data_vencimento ||
    principal !== baseline.valor_principal ||
    juros !== baseline.valor_juros ||
    status !== baseline.status ||
    dataPagamento !== baseline.data_pagamento ||
    observacao !== baseline.observacao
  );

  const handleRequestClose = () => {
    if (modo === 'editar' && dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const voltarVisualizar = () => {
    if (!baseline) { setModo('visualizar'); return; }
    // Reset form para baseline
    setDataVencimento(baseline.data_vencimento);
    setPrincipal(baseline.valor_principal);
    setJuros(baseline.valor_juros);
    setStatus(baseline.status as 'pendente' | 'pago' | 'cancelado');
    setDataPagamento(baseline.data_pagamento);
    setObservacao(baseline.observacao);
    setModo('visualizar');
  };

  // ── Erros de validação ─────────────────────────────────
  const erros: Record<string, string> = {};
  if (modo === 'editar') {
    if (!dataVencimento) erros.data_vencimento = 'Obrigatório';
    if (principal < 0 || Number.isNaN(principal)) erros.valor_principal = 'Deve ser ≥ 0';
    if (juros < 0 || Number.isNaN(juros)) erros.valor_juros = 'Deve ser ≥ 0';
    if (status === 'pago' && !dataPagamento) erros.data_pagamento = 'Obrigatório quando pago';
  }
  const temErros = Object.keys(erros).length > 0;

  // ── Salvar alterações ──────────────────────────────────
  const salvarEdicao = async () => {
    if (!parcela || !baseline) return;
    if (temErros) {
      toast.error('Corrija os erros antes de salvar');
      return;
    }
    setSaving(true);
    try {
      const valoresMudaram = principal !== baseline.valor_principal || juros !== baseline.valor_juros;
      const dataMudou = dataVencimento !== baseline.data_vencimento;
      const statusMudou = status !== baseline.status;

      // 1) UPDATE na parcela
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

      // 2) Mirror: sempre que valores ou data mudaram, deleta e recria o mirror
      //    para refletir os novos valores em financeiro_lancamentos_v2 + planejamento_financeiro.
      //    Se status mudou para 'cancelado', apenas deleta.
      if (valoresMudaram || dataMudou || statusMudou) {
        const { deletarMirrorParcela, criarMirrorParcela, atualizarStatusMirror } =
          await import('@/lib/financiamentos/parcelaMirror');

        await deletarMirrorParcela(supabase as any, parcela.id);
        // Zera o lancamento_id pois o mirror antigo sumiu
        await supabase
          .from('financiamento_parcelas')
          .update({ lancamento_id: null })
          .eq('id', parcela.id);

        if (status !== 'cancelado' && (principal > 0 || juros > 0)) {
          const tipo = financiamento.tipo_financiamento;
          if (tipo === 'pecuaria' || tipo === 'agricultura') {
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
            });

            if (status === 'pago' && dataPagamento) {
              await atualizarStatusMirror(supabase as any, parcela.id, dataPagamento);
            }
          }
        }
      } else if (statusMudou && status === 'pago' && dataPagamento) {
        // só mudou status para pago, sem mexer em valores/data
        const { atualizarStatusMirror } = await import('@/lib/financiamentos/parcelaMirror');
        await atualizarStatusMirror(supabase as any, parcela.id, dataPagamento);
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
        <DialogContent className={`max-w-md ${modo === 'editar' ? 'border-primary/60 border-2' : ''}`}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-sm">
                {modo === 'editar' ? 'Editar Parcela' : 'Parcela'} #{parcela.numero_parcela}/{financiamento.total_parcelas}
              </DialogTitle>
              {modo === 'visualizar' && finativo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setModo('editar')}
                >
                  <Pencil className="h-3 w-3" /> Editar parcela
                </Button>
              )}
            </div>
            {modo === 'editar' && (
              <div className="text-[10px] text-primary font-semibold uppercase">Modo edição</div>
            )}
          </DialogHeader>

          {/* ── VISUALIZAR ─────────────────────────────────── */}
          {modo === 'visualizar' && (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <InfoLine label="Vencimento" value={fmtDate(parcela.data_vencimento)} />
                <InfoLine label="Status" value={STATUS_LABELS[status] ?? status} />
                <InfoLine label="Principal" value={fmt(principal)} />
                <InfoLine label="Juros" value={fmt(juros)} />
                <InfoLine label="Total" value={fmt(valorTotal)} strong />
                <InfoLine label="Data pagamento" value={fmtDate(parcela.data_pagamento ?? null)} />
              </div>
              {parcela.observacao && (
                <InfoLine label="Observação" value={parcela.observacao} block />
              )}
              {!finativo && (
                <p className="text-[10px] text-muted-foreground italic">
                  Contrato não está ativo — edição bloqueada.
                </p>
              )}
            </div>
          )}

          {/* ── EDITAR ─────────────────────────────────────── */}
          {modo === 'editar' && (
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

              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" />
              </div>
            </div>
          )}

          <DialogFooter>
            {modo === 'visualizar' ? (
              <Button variant="outline" onClick={onClose}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={voltarVisualizar} disabled={saving}>Cancelar</Button>
                <Button onClick={salvarEdicao} disabled={saving || temErros}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </>
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

function InfoLine({ label, value, strong, block }: { label: string; value: string; strong?: boolean; block?: boolean }) {
  return (
    <div className={block ? 'col-span-2' : ''}>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={strong ? 'font-bold' : 'font-medium'}>{value}</p>
    </div>
  );
}
