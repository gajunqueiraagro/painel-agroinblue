/**
 * EditReclassificacaoSheet — Edição de lançamento de Reclassificação (Evoluir Categoria).
 *
 * Reutiliza os componentes oficiais:
 *   - ReclassificacaoFormFields
 *   - ReclassificacaoResumoPanel
 *   - useReclassificacaoState
 *
 * Reclassificação NÃO gera lançamento financeiro.
 *
 * Padrão de edit (idêntico ao V1 LancamentosTab):
 *   - useReclassificacaoState com onAdicionar dummy
 *   - useEffect inicial hidrata o state com valores do lancamento
 *   - ReclassificacaoResumoPanel recebe onRequestRegister custom que monta
 *     payload e chama onSalvar(id, dados) — não usa state.handleSubmit
 *
 * Não altera banco. Não altera payload. Não altera hooks.
 * Não recria lógica de categoria, sugestões ou validações.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type Lancamento,
  type Categoria,
  kgToArrobas,
} from '@/types/cattle';
import { parseDecimalInput } from '@/hooks/useFormattedNumber';
import { ReclassificacaoFormFields, useReclassificacaoState } from '@/components/ReclassificacaoForm';
import { ReclassificacaoResumoPanel } from '@/components/ReclassificacaoResumoPanel';
import { EditLancamentoSheet } from './EditLancamentoSheet';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => Promise<void>;
  onRemover?: () => Promise<void>;
  podeRemover?: boolean;
  p1Oficial?: boolean;
  temAlteracaoEstrutural?: (lanc: Lancamento, dados: Partial<Lancamento>) => boolean;
}

export function EditReclassificacaoSheet({
  lancamento, open, onOpenChange, onSalvar, onRemover, podeRemover = true,
  p1Oficial = false, temAlteracaoEstrutural,
}: Props) {
  // useReclassificacaoState exige onAdicionar (modo criação). Em edit nunca é chamado.
  const reclassState = useReclassificacaoState({
    onAdicionar: async () => undefined,
    dataInicial: lancamento.data,
    lancamentos: [],
  });

  const [hidrated, setHidrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [p1BloqueioMsg, setP1BloqueioMsg] = useState<string | null>(null);

  // Hidrata state do hook com valores do lancamento ao abrir o sheet.
  // Re-hidrata se o lancamento (id) mudar entre aberturas.
  useEffect(() => {
    if (!open) {
      setHidrated(false);
      return;
    }
    if (hidrated) return;
    reclassState.setCategoriaOrigem(lancamento.categoria as Categoria);
    if (lancamento.categoriaDestino) {
      reclassState.setCategoriaDestino(lancamento.categoriaDestino as Categoria);
    }
    reclassState.setData(lancamento.data);
    reclassState.setQuantidade(String(lancamento.quantidade));
    reclassState.setPesoKg(lancamento.pesoMedioKg ? String(lancamento.pesoMedioKg) : '');
    reclassState.setPesoAutoFilled(true);
    reclassState.setStatusOp(
      lancamento.cenario === 'meta'
        ? 'meta'
        : ((lancamento.statusOperacional as 'realizado' | 'programado') || 'realizado'),
    );
    setHidrated(true);
  }, [open, hidrated, lancamento, reclassState]);

  const handleSalvar = async () => {
    const isMeta = reclassState.statusOp === 'meta';
    const pesoMedioKg = parseDecimalInput(reclassState.pesoKg);
    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data: reclassState.data,
      tipo: 'reclassificacao',
      categoria: reclassState.categoriaOrigem,
      categoriaDestino: reclassState.categoriaDestino,
      quantidade: Number(reclassState.quantidade),
      pesoMedioKg: pesoMedioKg ?? undefined,
      pesoMedioArrobas: pesoMedioKg !== undefined ? kgToArrobas(pesoMedioKg) : undefined,
      cenario: isMeta ? 'meta' : 'realizado',
      statusOperacional: isMeta ? null : 'realizado',
    };

    if (p1Oficial && temAlteracaoEstrutural && temAlteracaoEstrutural(lancamento, dados as Partial<Lancamento>)) {
      setP1BloqueioMsg('Alteração não salva. Este mês está fechado no Mapa de Pastos. Campos zootécnicos estruturais não podem ser alterados após o fechamento.');
      return;
    }
    setP1BloqueioMsg(null);

    setSaving(true);
    try {
      await onSalvar(lancamento.id, dados);
      toast.success('Reclassificação atualizada.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao salvar reclassificação: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemover = async () => {
    if (!onRemover) return;
    setSaving(true);
    try {
      await onRemover();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Falha ao excluir: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const canRegister = !!(
    Number(reclassState.quantidade) > 0 &&
    reclassState.categoriaOrigem !== reclassState.categoriaDestino
  );

  return (
    <EditLancamentoSheet
      open={open}
      onOpenChange={onOpenChange}
      titulo="Editar Reclassificação"
      subtitulo="Evoluir Categoria — não gera lançamento financeiro."
      banners={
        <>
          {p1Oficial && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
              <p className="text-[9px] text-destructive font-medium">
                🔒 Mês fechado (P1 oficial). Campos estruturais bloqueados.
              </p>
            </div>
          )}
          {p1BloqueioMsg && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              <p className="text-[10px] text-destructive font-semibold mb-0.5">⚠️ Alteração não salva</p>
              <p className="text-[9px] text-destructive/90">{p1BloqueioMsg}</p>
            </div>
          )}
        </>
      }
      bloco1={
        <div className="space-y-2">
          <ReclassificacaoFormFields state={reclassState} />
          <ReclassificacaoResumoPanel
            quantidade={Number(reclassState.quantidade) || 0}
            pesoKg={parseDecimalInput(reclassState.pesoKg) || 0}
            origemLabel={reclassState.origemLabel}
            destinoLabel={reclassState.destinoLabel}
            pesoMedioOrigem={reclassState.origemInfo?.pesoMedioKg ?? null}
            statusOp={reclassState.statusOp}
            onRequestRegister={handleSalvar}
            submitting={saving}
            canRegister={canRegister}
            isEditing={true}
            onCancelEdit={() => onOpenChange(false)}
            onDelete={podeRemover && onRemover ? handleRemover : undefined}
          />
        </div>
      }
    />
  );
}
