/**
 * O LANÇAMENTO DA PARCELA, NO MODAL DO FINANCEIRO — PARC-LIVRES-01 passo 4.
 * O lápis e o "Ver" da tela do contrato abrem o MESMO `LancamentoV2Dialog` da lista de Lançamentos, para aquele lançamento: é
 * nele que se paga, se edita e se vê a conciliação. Ao salvar, avisa o canal do Financeiro — o contrato relê sozinho.
 */
import { useEffect, useState } from 'react';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, notificarLancamentosMudaram, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';

export function LancamentoDaParcelaDialog({ lancamentoId, clienteId, aoFechar }: {
  lancamentoId: string | null; clienteId: string | null | undefined; aoFechar: () => void;
}) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [linha, setLinha] = useState<LancamentoV2 | null>(null);

  /* os catálogos não se carregam sozinhos (a lição do Espelho): sem eles os seletores abrem vazios */
  useEffect(() => {
    if (!lancamentoId) return;
    void fin.loadContas(); void fin.loadClassificacoes(); void fin.loadFornecedores(); void fin.loadSafras();
  }, [lancamentoId, fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  useEffect(() => {
    if (!lancamentoId) { setLinha(null); return; }
    let vivo = true;
    void (async () => { const l = await fin.buscarLancamentoPorId(lancamentoId); if (vivo) setLinha(l ?? null); })();
    return () => { vivo = false; };
  }, [lancamentoId, fin.buscarLancamentoPorId]);

  const catalogosProntos = fin.contasBancarias.length > 0 && fin.classificacoes.length > 0;
  return (
    <LancamentoV2Dialog
      open={!!lancamentoId && !!linha}
      carregando={!catalogosProntos}
      lancamento={linha}
      fazendas={fazendas}
      contas={fin.contasBancarias}
      classificacoes={fin.classificacoes}
      fornecedores={fin.fornecedores}
      safras={fin.safras}
      onCriarFornecedor={fin.criarFornecedor}
      onClose={aoFechar}
      onSave={async (form, id) => {
        const ok = id ? await fin.editarLancamento(id, form) : false;
        if (ok) { aoFechar(); if (clienteId) notificarLancamentosMudaram(clienteId); }
        return ok;
      }}
    />
  );
}
