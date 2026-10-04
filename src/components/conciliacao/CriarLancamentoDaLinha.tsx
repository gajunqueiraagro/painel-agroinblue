import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, notificarLancamentosMudaram, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { useCliente } from '@/contexts/ClienteContext';
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
export const TIPO_TRANSFERENCIA = '3-Transferências';
type CampoTravado = 'valor' | 'data_pagamento' | 'conta_bancaria_id' | 'conta_destino_id' | 'tipo_operacao';

/**
 * CONC-CRIAR-TRANSFERENCIA-01 — os tipos que o Criar oferece para um movimento do banco: o do sinal OU Transferências
 * (homologação do Gabriel, 01/10: "PAGTO FATURA MASTER" e "INTEGR.CAPITAL" são transferências e o Criar só permitia Saída).
 * Nunca o tipo contrário ao sinal — a RPC recusa do mesmo jeito (`tipo_incoerente`).
 */
export function tiposDoExtrato(valor: number): string[] {
  return valor >= 0 ? ['1-Entradas', TIPO_TRANSFERENCIA] : ['2-Saídas', TIPO_TRANSFERENCIA];
}

/**
 * O que o extrato trava: valor, data de pagamento e A CONTA DELE (a de origem na saída, a de destino na entrada). O tipo e a
 * outra conta são do operador. ⚠ O CAMINHO `semVinculo` NÃO MUDA (fora do escopo deste PR): continua tudo travado, tipo
 * incluso — ele grava pelo writer comum e não pela RPC que monta a transferência.
 */
export function travasDoExtrato(valor: number, semVinculo: boolean): CampoTravado[] {
  if (semVinculo) return ['valor', 'data_pagamento', 'conta_bancaria_id', 'conta_destino_id', 'tipo_operacao'];
  return ['valor', 'data_pagamento', valor >= 0 ? 'conta_destino_id' : 'conta_bancaria_id'];
}

/**
 * Os dois parâmetros novos de `fn_criar_lancamento_de_extrato`. Fora da transferência vão NULOS (o comportamento de antes);
 * em transferência, a OUTRA conta é a do lado que o extrato não dita: o destino na saída do banco, a origem na entrada.
 */
export function parametrosDoTipo(
  form: Pick<LancamentoV2Form, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id'>, valor: number,
): { p_tipo_operacao: string | null; p_outra_conta: string | null } {
  if (form.tipo_operacao !== TIPO_TRANSFERENCIA) return { p_tipo_operacao: null, p_outra_conta: null };
  return { p_tipo_operacao: TIPO_TRANSFERENCIA, p_outra_conta: (valor >= 0 ? form.conta_bancaria_id : form.conta_destino_id) || null };
}

/** A recusa da RPC vem como "codigo: frase" — o operador lê a frase (ex.: ja_existe_transferencia). */
export function fraseDaRecusaCriar(msg: string): string {
  const m = /^([a-z_]+): ([\s\S]+)$/.exec(msg);
  return m ? m[2] : msg;
}

interface Props {
  movimento: MovimentoConciliacao;
  /** Conta do extrato — dá a fazenda por padrão, sem perguntar. */
  contaBancariaId: string | null;
  /**
   * O que ainda falta para fechar o movimento, quando a estação já tem seleção.
   *
   * ⚠ O VALOR CHEIO SÓ ESTÁ CERTO QUANDO NÃO HÁ NADA MARCADO. Num PIX de
   * 2.581,67 com oito lançamentos já selecionados somando 2.549,14, quem clica
   * "Criar" quer o que sobra — 32,53 —, e o modal abria com o valor cheio,
   * obrigando o operador a apagar e digitar a subtração que ele fez de cabeça.
   * Ausente ou não-positivo: o cheio, que é o comportamento de sempre.
   */
  valorSugerido?: number;
  /**
   * B-CRIAR-DIFERENCA — criar SEM vincular, para o novo entrar no grupo.
   *
   * ⚠ A FUNÇÃO ATÔMICA NASCEU PARA O MOVIMENTO SEM SELEÇÃO, onde o lançamento
   * novo fecha tudo sozinho — e ali ela continua soberana. No meio de uma
   * seleção ela não serve: cria o vínculo avulso, e o grupo dos demais passa a
   * divergir do valor cheio (`soma_diverge`), travando exatamente o fluxo que o
   * operador estava fazendo.
   *
   * ⚠ E ISTO NÃO É O PAR PROIBIDO. O que o B-32b vetou foi criar-e-vincular em
   * duas chamadas; aqui só se CRIA. O vínculo de todos nasce depois, numa
   * gravação só, pelo grupo que soma o cheio.
   */
  semVinculo?: boolean;
  aoFechar: () => void;
  /** Recebe o id quando a criação foi sem vínculo, para a estação marcá-lo. */
  aoCriado: (idCriado?: string) => void | Promise<void>;
}

export function CriarLancamentoDaLinha({ movimento, contaBancariaId, valorSugerido, semVinculo, aoFechar, aoCriado }: Props) {
  const { fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const {
    contasBancarias, fornecedores, classificacoes, safras,
    loadContas, loadFornecedores, loadClassificacoes, loadSafras, criarFornecedor,
    criarLancamentoComId,
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
  /* Memoizados: o dialog reidrata o formulário quando `lockedFields` muda de identidade. */
  const travas = useMemo(() => travasDoExtrato(movimento.valor, !!semVinculo), [movimento.valor, semVinculo]);
  const tiposPermitidos = useMemo(() => tiposDoExtrato(movimento.valor), [movimento.valor]);
  const dataMov = movimento.data_movimento.slice(0, 10);

  const prefill = useMemo(() => ({
    fazenda_id: contaQ.data?.fazenda_id ?? undefined,
    /* Entrada cai na conta de DESTINO, saída sai da de ORIGEM — a mesma regra que
       a RPC aplica no INSERT. As duas concordam porque saem do mesmo sinal. */
    conta_bancaria_id: ehEntrada ? undefined : (contaBancariaId ?? undefined),
    conta_destino_id: ehEntrada ? (contaBancariaId ?? undefined) : undefined,
    data_pagamento: dataMov,
    data_competencia: dataMov,
    valor: valorSugerido != null && valorSugerido > 0
      ? Math.round(valorSugerido * 100) / 100
      : Math.abs(movimento.valor),
    tipo_operacao: ehEntrada ? '1-Entradas' : '2-Saídas',
    status_transacao: 'realizado',
    descricao: movimento.descricao ?? undefined,
    numero_documento: movimento.documento ?? undefined,
  }), [contaQ.data, contaBancariaId, ehEntrada, dataMov, movimento, valorSugerido]);

  /**
   * ⚠ O QUE VAI AO BANCO É UM SUBCONJUNTO DELIBERADO DO FORMULÁRIO. Valor, contas,
   * data de pagamento, tipo e status NÃO são enviados: a RPC os lê do próprio
   * movimento. Mandá-los daqui abriria espaço para a tela discordar do banco —
   * e são exatamente os campos travados na tela, então não há o que perder.
   * Macro, grupo, centro e escopo também ficam de fora: o gatilho
   * `trg_resolve_classificacao_plano` os resolve a partir do subcentro.
   */
  const salvar = async (form: LancamentoV2Form): Promise<boolean> => {
    if (semVinculo) {
      /* ⚠ AQUI O FORM VAI INTEIRO, e a diferença com o caminho de baixo é o
         motivo: a RPC lê valor, contas, data e tipo do próprio movimento, então
         não precisa recebê-los; o writer comum não conhece movimento nenhum, e
         sem eles criaria um lançamento sem valor nem conta. Os campos são os
         mesmos que a tela mostra travados — vêm do `prefill`. */
      const id = await criarLancamentoComId(form, { origem: 'conciliacao', silent: true });
      if (!id) { toast.error('Não foi possível criar o lançamento.'); return false; }
      toast.success('Lançamento criado e marcado na seleção — o vínculo vem ao confirmar o grupo.');
      await aoCriado(id);
      aoFechar();
      return true;
    }
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
      /* CONC-CRIAR-TRANSFERENCIA-01: o tipo e a outra conta — a RPC monta a transferência (18010, origem/destino pelo
         sinal) e o vínculo na MESMA transação. Fora da transferência vão nulos: o caminho de sempre. */
      ...parametrosDoTipo(form, movimento.valor),
    });
    /* A mensagem do Postgres nomeia o invariante violado — mês fechado, vínculo
       ativo, fazenda de outro cliente. Trocá-la por texto genérico tiraria do
       operador a única pista útil. Devolver `false` mantém o modal aberto para
       corrigir, que é o contrato do `onSave`. */
    if (error) { toast.error(error.message ? fraseDaRecusaCriar(error.message) : 'O banco recusou a criação.'); return false; }
    toast.success('Lançamento criado e vinculado — o movimento fechou.');
    /* CONC-SEM-F5-01 — gravou com a Conciliação montada: avisa o canal de lançamentos, e o dono relê sem F5. */
    if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
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
      lockedFields={travas}
      tiposOperacaoPermitidos={semVinculo ? undefined : tiposPermitidos}
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
