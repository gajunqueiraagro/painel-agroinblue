import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

/**
 * CriarLancamentoDaLinha — o movimento sem candidato deixa de ser beco sem saída.
 * FIN-CONCIL-CRIAR-DA-LINHA-01 (B-32) e CRIAR-MODAL-COMPLETO-01 (B-32b).
 *
 * ⚠ A CASCA É O MODAL FINANCEIRO DE VERDADE, e é o que este arquivo existe para
 * fazer: `LancamentoV2Dialog`, o mesmo de Novo/Editar Lançamento. O formulário
 * próprio da primeira versão foi reprovado com razão — tinha `Select` de rolagem
 * onde a casa inteira usa busca digitável, e não oferecia safra, nota fiscal nem
 * forma de pagamento. Reusar o modal traz os quatro seletores certos de graça
 * (`ProdutoAutocomplete`, `FavorecidoSelect`, `FazendaSelect`,
 * `PlanoSubcentroSelect`) porque são os dele.
 *
 * ⚠ A GRAVAÇÃO NÃO É A DO MODAL, E ESSA É A REGRA DURA. O `onSave` daqui NÃO
 * chama o writer usual (`criarLancamentoComId`) seguido de um vínculo: chama
 * `fn_criar_lancamento_de_extrato`, que insere o lançamento E o vínculo na MESMA
 * transação. O caminho de duas chamadas já existe nesta casa, em
 * `ConciliarExtratoDialog:350-380`, e o `catch` de lá descreve o preço quando a
 * segunda falha: "Lançamento criado, mas erro ao vincular ao extrato […] Use o
 * botão Conciliar para vincular manualmente." É o bug histórico do
 * lançar-da-linha, e aqui ele é impossível por construção.
 *
 * ⚠ O QUE O EXTRATO DITA VEM TRAVADO — `lockedFields` + o box de origem, o mesmo
 * padrão do título de OC. Valor, data de pagamento, contas e tipo são fato do
 * banco; a competência fica editável, com default na data do movimento, porque o
 * mês do FATO não é o do recebimento numa venda ou num abate.
 *
 * ⚠ SEM PARCELAS NEM RECORRÊNCIA (`ocultarParcelamento`): o movimento é UM
 * pagamento que já aconteceu. Gerar títulos futuros a partir dele criaria
 * cobranças que ninguém pagou e que nenhum movimento cobre.
 */
interface Props {
  movimento: MovimentoConciliacao;
  /** Conta do extrato — dá a fazenda por padrão, sem perguntar. */
  contaBancariaId: string | null;
  aoFechar: () => void;
  aoCriado: () => void | Promise<void>;
}

export function CriarLancamentoDaLinha({ movimento, contaBancariaId, aoFechar, aoCriado }: Props) {
  const { fazendas } = useFazenda();
  const {
    contasBancarias, fornecedores, classificacoes, safras,
    loadContas, loadFornecedores, loadClassificacoes, loadSafras, criarFornecedor,
  } = useFinanceiroV2();

  /* As mesmas cargas que o `ConciliarExtratoDialog` faz antes de montar o modal:
     ele não busca nada sozinho, recebe as listas por prop. */
  useEffect(() => {
    void loadContas(); void loadFornecedores(); void loadClassificacoes(); void loadSafras();
  }, [loadContas, loadFornecedores, loadClassificacoes, loadSafras]);

  /* ⚠ A FAZENDA VEM DA CONTA DO EXTRATO — medido: as 69 contas ativas do Proto
     têm `fazenda_id`, nenhuma nula. A RPC a exige, e perguntar o que o dado já
     sabe é trabalho que o operador não deveria ter. O `FazendaSelect` do modal
     continua editável: o default não é uma trava. */
  const contaQ = useQuery({
    queryKey: ['criar-linha-conta', contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_contas_bancarias').select('fazenda_id').eq('id', contaBancariaId).maybeSingle();
      return (data ?? null) as { fazenda_id: string | null } | null;
    },
  });

  const ehEntrada = movimento.valor >= 0;
  const dataMov = movimento.data_movimento.slice(0, 10);

  const prefill = useMemo(() => ({
    fazenda_id: contaQ.data?.fazenda_id ?? undefined,
    /* Entrada cai na conta de DESTINO, saída sai da de ORIGEM — a mesma regra que
       a RPC aplica no INSERT. As duas concordam porque saem do mesmo sinal. */
    conta_bancaria_id: ehEntrada ? undefined : (contaBancariaId ?? undefined),
    conta_destino_id: ehEntrada ? (contaBancariaId ?? undefined) : undefined,
    data_pagamento: dataMov,
    data_competencia: dataMov,
    valor: Math.abs(movimento.valor),
    tipo_operacao: ehEntrada ? '1-Entradas' : '2-Saídas',
    status_transacao: 'realizado',
    descricao: movimento.descricao ?? undefined,
    numero_documento: movimento.documento ?? undefined,
  }), [contaQ.data, contaBancariaId, ehEntrada, dataMov, movimento]);

  /**
   * ⚠ O QUE VAI AO BANCO É UM SUBCONJUNTO DELIBERADO DO FORMULÁRIO. Valor, contas,
   * data de pagamento, tipo e status NÃO são enviados: a RPC os lê do próprio
   * movimento. Mandá-los daqui abriria espaço para a tela discordar do banco —
   * e são exatamente os campos travados na tela, então não há o que perder.
   * Macro, grupo, centro e escopo também ficam de fora: o gatilho
   * `trg_resolve_classificacao_plano` os resolve a partir do subcentro.
   */
  const salvar = async (form: LancamentoV2Form): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_criar_lancamento_de_extrato', {
      p_extrato_id: movimento.id,
      p_fazenda_id: form.fazenda_id,
      p_subcentro: form.subcentro || null,
      p_descricao: form.descricao || null,
      p_observacao: form.observacao || null,
      p_favorecido_id: form.favorecido_id || null,
      p_numero_documento: form.numero_documento || null,
      p_data_competencia: form.data_competencia || null,
      p_safra_id: form.safra_id || null,
      p_tipo_documento: form.tipo_documento || null,
      p_forma_pagamento: form.forma_pagamento || null,
      /* `dados_pagamento` é `jsonb` na função. O form carrega texto livre (chave
         PIX, dados bancários), então vai como string JSON — nunca como objeto
         montado aqui, que seria inventar estrutura. */
      p_dados_pagamento: form.dados_pagamento ? JSON.stringify(form.dados_pagamento) : null,
      p_data_vencimento: form.data_vencimento || null,
    });
    /* A mensagem do Postgres nomeia o invariante violado — mês fechado, vínculo
       ativo, fazenda de outro cliente. Trocá-la por texto genérico tiraria do
       operador a única pista útil. Devolver `false` mantém o modal aberto para
       corrigir, que é o contrato do `onSave`. */
    if (error) { toast.error(error.message ?? 'O banco recusou a criação.'); return false; }
    toast.success('Lançamento criado e vinculado — o movimento fechou.');
    await aoCriado();
    aoFechar();
    return true;
  };

  return (
    <LancamentoV2Dialog
      open
      onClose={aoFechar}
      onSave={salvar}
      fazendas={fazendas}
      contas={contasBancarias}
      classificacoes={classificacoes}
      fornecedores={fornecedores}
      safras={safras}
      onCriarFornecedor={criarFornecedor}
      prefill={prefill}
      lockedFields={['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao']}
      ocultarParcelamento
      /* ⚠ O BOX DE ORIGEM, read-only — o padrão do título de OC. Ele diz de onde
         o lançamento nasceu, que é o que explica os campos travados ao lado. */
      referenciaOperacionalInfo={{
        produto_texto: movimento.descricao,
        valor: movimento.valor,
        data_referencia: movimento.data_movimento,
        observacao: movimento.documento
          ? `Movimento do extrato · doc ${movimento.documento}`
          : 'Movimento do extrato bancário',
      }}
    />
  );
}
