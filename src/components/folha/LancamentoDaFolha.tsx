/**
 * FOLHA-01 · PR B (telas) — o "abrir ↗" do Histórico e das Pendências: o MODAL DE HOJE do lançamento (`LancamentoV2Dialog`), aberto POR CIMA
 * da Folha. O mesmo caminho das Contas a pagar/receber: a linha vem da TABELA (`buscarLancamentoPorId`), nunca de uma view; os catálogos
 * carregam antes (sem eles o modal não abre). Só monta quando se abre: a Folha não paga a carga do financeiro à toa.
 * ⚠ SALVAR OU CANCELAR VOLTA À FOLHA no mesmo lugar (NAV-VOLTA-ORIGEM-01: a tela de baixo nunca desmonta) e relê a folha.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRelerFolha } from '@/hooks/useFolha';

export function LancamentoDaFolha({ lancamentoId, aoFechar, onAbrirFuncionario }: {
  lancamentoId: string; aoFechar: () => void; onAbrirFuncionario?: (funcionarioId: string) => void;
}) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const reler = useRelerFolha();
  const [prontos, setProntos] = useState(false);
  const [lanc, setLanc] = useState<LancamentoV2 | null>(null);
  useEffect(() => {
    let vivo = true;
    void Promise.all([fin.loadContas(), fin.loadClassificacoes(), fin.loadFornecedores(), fin.loadSafras()])
      .then(() => fin.buscarLancamentoPorId(lancamentoId))
      .then(l => { if (!vivo) return; if (l) { setLanc(l); setProntos(true); } else { toast.error('Não consegui abrir o lançamento.'); aoFechar(); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre UMA vez por id; os carregadores do hook não mudam
  }, [lancamentoId]);

  const cancelar = async (id: string, motivo?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('fn_cancelar_lancamento_auditoria', { p_lancamento_id: id, ...(motivo ? { p_motivo: motivo } : {}) });
    if (error) { toast.error(error.message || 'Não foi possível cancelar o lançamento.'); return false; }
    await reler();
    toast.success('Lançamento cancelado. Ele sai da lista e fica na auditoria.');
    return true;
  };

  if (!lanc) return null;
  return (
    <LancamentoV2Dialog open carregando={!prontos} onClose={aoFechar} lancamento={lanc}
      onSave={async (form, id) => {
        const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
        if (ok) await reler();
        return ok;
      }}
      onDelete={cancelar}
      onTrocarLancamento={id => { void (async () => { const l = await fin.buscarLancamentoPorId(id); if (l) setLanc(l); })(); }}
      fazendas={fazendas} contas={fin.contasBancarias} classificacoes={fin.classificacoes} fornecedores={fin.fornecedores} safras={fin.safras}
      onCriarFornecedor={fin.criarFornecedor} onAbrirFuncionario={onAbrirFuncionario} />
  );
}
