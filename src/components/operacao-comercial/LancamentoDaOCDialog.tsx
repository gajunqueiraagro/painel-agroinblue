/**
 * A OC ABRE O MODAL DO FINANCEIRO — OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026).
 * "Programar recebimento/pagamento" e "Nova despesa" da OC em conta corrente abrem o MESMO `LancamentoV2Dialog` da lista de
 * Lançamentos, em MODO OC: pré-preenchido, travado no que é da operação e gravando por `oc_lancar_pelo_modal`.
 * ⚠ ESTE ARQUIVO SÓ HOSPEDA (o molde é o `LancamentoDaParcelaDialog`): catálogos, a fazenda da operação e o pré-preenchimento.
 *   O que trava, o que vai ao banco e as frases são do dono, `src/lib/oc/lancarPeloModal.ts`.
 * ⚠ A CLASSIFICAÇÃO DO PRINCIPAL VEM DO BANCO: uma simulação de abertura (a própria RPC, com `p_simular`) diz a conta da OC —
 *   nenhuma regra de "lote de maior valor" é copiada aqui.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';
import { SUBCENTRO_OBRIGACAO_COMPRA, SUBCENTRO_DESPESA_VENDA } from '@/hooks/useOperacaoLiquidacao';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  lancarPeloModal, rotuloDaOrigemOC, tipoDoLancamentoOC, TRAVAS_DO_MODO_OC, STATUS_DO_MODO_OC,
  type NaturezaDoModalOC, type OrigemOC, type RetornoLancarPeloModal, type TipoDaOC,
} from '@/lib/oc/lancarPeloModal';

const tipoDaOC = (t: string | null | undefined): TipoDaOC | null => (t === 'venda' || t === 'compra' || t === 'abate' ? t : null);

export function LancamentoDaOCDialog({ natureza, operacaoId, versao, tipoOperacao, contraparteId, descricaoDaOC, sugerido, aoFechar, aoLancar, aoFalhar }: {
  /** Nulo = fechado. */
  natureza: NaturezaDoModalOC | null;
  operacaoId: string | null;
  versao: number | null;
  tipoOperacao: string | null;
  contraparteId: string | null;
  /** "Venda 140 Novilhas" — a identidade da operação na faixa de origem e na descrição sugerida. */
  descricaoDaOC: string;
  /** O saldo em aberto (o valor sugerido do principal). Nulo = sem sugestão. */
  sugerido: number | null;
  aoFechar: () => void;
  aoLancar: (retorno: RetornoLancarPeloModal) => void | Promise<void>;
  /** O modal não pôde abrir (a operação não foi lida, ou o banco recusou já na abertura): a frase vai para quem chamou. */
  aoFalhar: (frase: string) => void;
}) {
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const comps = useComponentesFinanceiros();
  const tipo = tipoDaOC(tipoOperacao);
  const aberto = !!natureza && !!operacaoId && versao != null && !!tipo;
  /** O que só o banco sabe, lido a cada abertura: a fazenda da operação e, no principal, a conta dela. */
  const [lido, setLido] = useState<{ fazendaId: string; subcentro: string | null; planoContaId: string | null } | null>(null);

  /* os catálogos não se carregam sozinhos (a lição do Espelho): sem eles os seletores abrem vazios */
  useEffect(() => {
    if (!aberto) return;
    void fin.loadContas(); void fin.loadClassificacoes(); void fin.loadFornecedores(); void fin.loadSafras();
  }, [aberto, fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  useEffect(() => {
    if (!aberto || !operacaoId || versao == null || !natureza) { setLido(null); return; }
    let vivo = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma do repo: tabela da OC fora de types.ts
      const { data, error } = await (supabase as any).from('zoo_operacoes_comerciais').select('fazenda_id').eq('id', operacaoId).maybeSingle();
      if (!vivo) return;
      const fazendaId = typeof data?.fazenda_id === 'string' ? data.fazenda_id : '';
      if (error || !fazendaId) { aoFalhar('Não foi possível ler a operação. Recarregue e tente de novo.'); return; }
      if (natureza !== 'principal') { setLido({ fazendaId, subcentro: null, planoContaId: null }); return; }
      /* a conta do principal: a simulação de UM centavo, só para o banco dizer a classificação (nada grava) */
      const r = await lancarPeloModal({
        operacaoId, versao, natureza: 'principal', componente: null, planoContaId: null, favorecidoId: null,
        parcelas: [{ valor: 0.01, vencimento: hojeLocal(), conta_id: null }],
        forma: null, dadosPagamento: null, documento: null, observacao: null, descricao: null, simular: true,
      });
      if (!vivo) return;
      if (r.ok !== true) { aoFalhar(r.ok === false ? r.erro : 'Não foi possível abrir.'); return; }
      setLido({ fazendaId, subcentro: r.retorno.classificacao.subcentro, planoContaId: r.retorno.classificacao.planoContaId });
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `aoFalhar` é de quem chama; reler a cada render dele repetiria a simulação
  }, [aberto, operacaoId, versao, natureza]);

  const catalogosProntos = fin.contasBancarias.length > 0 && fin.classificacoes.length > 0;

  /* ⚠ O PRÉ-PREENCHIMENTO NASCE UMA VEZ POR ABERTURA: o modal refaz o formulário quando `prefill` ou `lockedFields` mudam de
     identidade, e um catálogo que chegasse depois apagaria o que o operador já digitou. Por isso ele é ESTADO, montado quando
     a operação e os catálogos estão prontos, e só volta a nulo ao fechar. */
  const lockedFields = useMemo(() => (natureza ? [...TRAVAS_DO_MODO_OC[natureza]] : undefined), [natureza]);
  const [prefill, setPrefill] = useState<React.ComponentProps<typeof LancamentoV2Dialog>['prefill']>(undefined);
  useEffect(() => {
    if (!aberto || !natureza || !tipo) { setPrefill(undefined); return; }
    if (prefill || !lido || !catalogosProntos) return;
    const principal = natureza === 'principal';
    const subcentro = principal ? (lido.subcentro ?? '') : (tipo === 'compra' ? SUBCENTRO_OBRIGACAO_COMPRA : SUBCENTRO_DESPESA_VENDA);
    const linha = fin.classificacoes.find(c => (principal && lido.planoContaId ? c.id === lido.planoContaId : c.subcentro === subcentro));
    setPrefill({
      fazenda_id: lido.fazendaId,
      tipo_operacao: tipoDoLancamentoOC(natureza, tipo),
      status_transacao: STATUS_DO_MODO_OC,
      data_competencia: hojeLocal(),
      valor: principal && sugerido && sugerido > 0 ? sugerido : undefined,
      descricao: principal ? `${descricaoDaOC} · ${tipo === 'compra' ? 'Pagamento' : 'Recebimento'}` : '',
      favorecido_id: principal ? (contraparteId ?? undefined) : undefined,
      subcentro: linha?.subcentro ?? subcentro,
      macro_custo: linha?.macro_custo ?? '',
      grupo_custo: linha?.grupo_custo ?? '',
      centro_custo: linha?.centro_custo ?? '',
      plano_conta_id: linha?.id ?? (principal ? lido.planoContaId ?? undefined : undefined),
      escopo_negocio: 'pecuaria', cultura: '', fase: '',
    });
  }, [aberto, natureza, tipo, lido, catalogosProntos, prefill, fin.classificacoes, sugerido, descricaoDaOC, contraparteId]);

  const { porNatureza } = comps;
  const itens = useMemo(() => porNatureza('obrigacao').map(c => ({ codigo: c.codigo, nome: c.nome })), [porNatureza]);
  const origemOC = useMemo((): OrigemOC | null => {
    if (!natureza || !tipo || !operacaoId || versao == null) return null;
    return {
      operacaoId, versao, natureza, tipoOperacao: tipo, rotulo: rotuloDaOrigemOC(operacaoId, descricaoDaOC), itens,
      onVoltar: aoFechar, aoLancar,
    };
  }, [natureza, tipo, operacaoId, versao, descricaoDaOC, itens, aoFechar, aoLancar]);

  return (
    <LancamentoV2Dialog
      open={aberto && !!prefill}
      carregando={!catalogosProntos}
      origemOC={origemOC}
      prefill={prefill}
      lockedFields={lockedFields}
      fazendas={fazendas}
      contas={fin.contasBancarias}
      classificacoes={fin.classificacoes}
      fornecedores={fin.fornecedores}
      safras={fin.safras}
      onCriarFornecedor={fin.criarFornecedor}
      onClose={aoFechar}
      /* ⚠ NUNCA É CHAMADO NO MODO OC (o Salvar sai antes, por `oc_lancar_pelo_modal`); recusar aqui é a rede. */
      onSave={async () => false}
    />
  );
}
