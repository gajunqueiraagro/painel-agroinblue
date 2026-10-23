/**
 * FIN-VISAO-GERAL-01 PR 5 — o lançamento clicado na GAVETA abre no modal PADRÃO do financeiro (`LancamentoV2Dialog`), SEMPRE pelo
 * `lancamento_id` (a parte 2+ da classificação dividida tem a chave "id#2", que não é o id do lançamento).
 *   · A linha vem do banco na hora de abrir, inteira (`lerLancamentoDaLinha`); os CATÁLOGOS (contas, classificações, fornecedores,
 *     safras) carregam na primeira abertura — sem eles o modal abre com o favorecido e a conta em branco (ver o `PainelPeriodoTab`) —
 *     e, enquanto não chegam, o modal fica no esqueleto com o Salvar travado (`carregando`).
 *   · Salvou: o `editarLancamento` avisa o canal de lançamentos com o id salvo (P73), e o dividir/voltar para uma conta do próprio
 *     modal também; a página ouve o canal e sobe a versão (Visão Geral, modal de análise e gaveta releem o que mostram). Aqui não há
 *     um segundo aviso — seria a mesma releitura duas vezes. Fechar volta para a gaveta no mesmo lugar: ela nunca desmontou (o modal
 *     padrão é irmão dela).
 */
import { useEffect, useRef, useState } from 'react';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { lerLancamentoDaLinha } from '@/lib/financeiro/partesDaClassificacao';

export function LancamentoDaGavetaVG({ lancamentoId, onFechar }: { lancamentoId: string | null; onFechar: () => void }) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [lanc, setLanc] = useState<LancamentoV2 | null>(null);
  const [catalogos, setCatalogos] = useState(false);
  const pediu = useRef(false);

  useEffect(() => {
    if (!lancamentoId || pediu.current) return;
    pediu.current = true;
    void Promise.all([fin.loadContas(), fin.loadClassificacoes(), fin.loadFornecedores(), fin.loadSafras()]).finally(() => setCatalogos(true));
  }, [lancamentoId, fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  useEffect(() => {
    if (!lancamentoId) { setLanc(null); return; }
    let vivo = true;
    lerLancamentoDaLinha<LancamentoV2>(lancamentoId).then((l) => { if (vivo) { if (l) setLanc(l); else onFechar(); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentoId]);

  return (
    <LancamentoV2Dialog
      open={!!lancamentoId && !!lanc}
      carregando={!catalogos}
      onClose={onFechar}
      onSave={(form, id) => (id ? fin.editarLancamento(id, form) : fin.criarLancamento(form))}
      lancamento={lanc}
      fazendas={fazendas}
      contas={fin.contasBancarias}
      classificacoes={fin.classificacoes}
      fornecedores={fin.fornecedores}
      safras={fin.safras}
      onCriarFornecedor={fin.criarFornecedor}
    />
  );
}
