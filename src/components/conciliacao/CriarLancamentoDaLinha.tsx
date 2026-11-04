import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, notificarLancamentosMudaram, type LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { useCliente } from '@/contexts/ClienteContext';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import type { MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';
import type { ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';
import { notaParaAPrevia } from '@/components/financeiro-v2/NovoDeXmlDialog';
import { notaJaLancada } from '@/lib/financeiro/nfeConsultas';
import { casarJaLancados, parcelasParaCasar, type LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { prefillDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { FRASE_SEM_DUPLICATAS } from '@/lib/financeiro/nfe/proporLancamento';
import { fechaAoCentavo } from '@/lib/conciliacao/tolerancia';

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

/**
 * CONC-CRIAR-COM-NOTA-01 — o levado que o "Casar com o banco" de hoje recebe (o `LevadoInicial` dele, sem importá-lo: o modal do casar já
 * monta este componente, e o tipo de lá aqui faria o ciclo). Com o nº da NF: a linha do levado o mostra (Gabriel 04/11 06:28).
 */
export interface LevadoDaNota {
  lancamento_id: string; descricao: string | null; fornecedor: string | null; valor_assinado: number;
  data_vencimento: string | null; status_transacao: string | null; numero_documento: string | null;
  trocarConta?: { de: string | null; para: string | null };
}

/**
 * A NOTA LIDA no Criar pelo extrato vira o `prefill` do MESMO modal pelo caminho do "+ Da nota" (`prefillDaNota`: fornecedor, nº, tipo do
 * documento, competência = EMISSÃO, classificação sugerida e a NF pendente), e por cima o que o EXTRATO dita: as contas, o pagamento, o
 * vencimento (= o pagamento), o tipo e o status. ⚠ UM PAGAMENTO SÓ: as duplicatas da nota saem (o extrato é um movimento; o modal do extrato
 * nem mostra o parcelamento). ⚠ O VALOR É O DA NOTA quando ela difere do extrato: o salvar cria sem vínculo e o "Casar com o banco" mostra a
 * diferença e os ajustes (Gabriel 04/11 06:28, escolha 1).
 */
export function prefillDoExtratoComNota<T extends { fazenda_id?: string; conta_bancaria_id?: string; conta_destino_id?: string; tipo_operacao: string; descricao?: string }>(
  doExtrato: T, doXml: DoXml, dataMov: string,
) {
  /* o aviso "sem duplicatas · preencha o vencimento" não vale aqui: o vencimento é o pagamento do extrato */
  const daNota = prefillDaNota({ ...doXml, proposta: { ...doXml.proposta, duplicatas: [], parcelamento: { tipo: 'unico', vencimento: dataMov },
    avisos: doXml.proposta.avisos.filter((a) => a !== FRASE_SEM_DUPLICATAS) } });
  return {
    ...daNota,
    fazenda_id: daNota.fazenda_id || doExtrato.fazenda_id,
    conta_bancaria_id: doExtrato.conta_bancaria_id,
    conta_destino_id: doExtrato.conta_destino_id,
    tipo_operacao: doExtrato.tipo_operacao,
    status_transacao: 'realizado',
    data_pagamento: dataMov,
    data_vencimento: dataMov,
    data_competencia: daNota.data_competencia || dataMov,
    /* NOTA-NOVA-MODAL-REAL — a descrição nunca sai dos itens: fica a do extrato, como no Criar de sempre */
    descricao: doExtrato.descricao,
  };
}

/**
 * A nota lida já está no sistema? A MESMA regra da prévia (`fn_nota_ja_lancada` + `casarJaLancados`): os ALVOS dela. Os conciliados não se
 * casam de novo (esta nota já está paga e no banco). `null` = a nota não está lançada (ou só cancelada) — preenche e cria.
 */
export function oQueFazerComANota(achados: readonly LancamentoJaLancado[], parcelas: ReturnType<typeof parcelasParaCasar>, notaCent: number):
  { caminho: 'criar' } | { caminho: 'casar'; alvos: LancamentoJaLancado[] } | { caminho: 'conciliada'; alvos: LancamentoJaLancado[] } {
  const ja = casarJaLancados(parcelas, achados, notaCent);
  const alvos = ja?.alvos.filter((l) => !l.cancelado) ?? [];
  if (!alvos.length) return { caminho: 'criar' };
  const abertos = alvos.filter((l) => !l.conciliado);
  return abertos.length ? { caminho: 'casar', alvos: abertos } : { caminho: 'conciliada', alvos };
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
  /**
   * P153 — o "Criar igual" do "Procurar no histórico": fornecedor, subcentro (a conta do plano), fazenda e descrição de um lançamento
   * de antes. ⚠ SÓ ENTRA NO `prefill` — o operador vê e edita; nada é gravado sem o Salvar. Valor, data e conta continuam os do
   * MOVIMENTO (travados). Sem modelo, o Criar de sempre.
   */
  modelo?: ModeloDoHistorico;
  aoFechar: () => void;
  /** Recebe o id quando a criação foi sem vínculo, para a estação marcá-lo. */
  aoCriado: (idCriado?: string) => void | Promise<void>;
  /**
   * CONC-CRIAR-COM-NOTA-01 (Gabriel 04/11 06:28) — o "Casar com o banco" de HOJE, aberto pelo hospedeiro com estes levados: a NF lida JÁ
   * ESTÁ lançada (casar, nunca criar em dobro), ou a nota difere do extrato (o criado com o valor da nota; lá estão o "Corrigir o valor do
   * lançamento" e o "Criar lançamento pela diferença"). Ausente (ou `semVinculo`) = o Criar não lê a NF.
   */
  aoCasarComBanco?: (levados: LevadoDaNota[]) => void;
}

export function CriarLancamentoDaLinha({ movimento, contaBancariaId, valorSugerido, semVinculo, modelo, aoFechar, aoCriado, aoCasarComBanco }: Props) {
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

  /* CONC-CRIAR-COM-NOTA-01 — a nota lida no Documentos (o `prefill` passa a ser o dela + o do extrato; o modal se rehidrata por ele) */
  const [daNota, setDaNota] = useState<DoXml | null>(null);
  const doExtrato = useMemo(() => ({
    fazenda_id: contaQ.data?.fazenda_id ?? undefined,
    /* Entrada cai na conta de DESTINO, saída sai da de ORIGEM — a mesma regra que
       a RPC aplica no INSERT. As duas concordam porque saem do mesmo sinal. */
    conta_bancaria_id: ehEntrada ? undefined : (contaBancariaId ?? undefined),
    conta_destino_id: ehEntrada ? (contaBancariaId ?? undefined) : undefined,
    data_pagamento: dataMov,
    data_competencia: dataMov,
    /* CRIAR-DO-EXTRATO-01 — realizado com data de pagamento: o vencimento nasce igual a ela (nunca vazio). */
    data_vencimento: dataMov,
    valor: valorSugerido != null && valorSugerido > 0
      ? Math.round(valorSugerido * 100) / 100
      : Math.abs(movimento.valor),
    tipo_operacao: ehEntrada ? '1-Entradas' : '2-Saídas',
    status_transacao: 'realizado',
    descricao: movimento.descricao ?? undefined,
    numero_documento: movimento.documento ?? undefined,
    /* P153 — o modelo por cima: a fazenda dele vence a da conta; a descrição dele vence o texto do banco */
    ...(modelo ? {
      fazenda_id: modelo.fazenda_id ?? contaQ.data?.fazenda_id ?? undefined,
      descricao: modelo.descricao ?? movimento.descricao ?? undefined,
      favorecido_id: modelo.favorecido_id,
      plano_conta_id: modelo.plano_conta_id,
      subcentro: modelo.subcentro,
      centro_custo: modelo.centro_custo,
    } : {}),
  }), [contaQ.data, contaBancariaId, ehEntrada, dataMov, movimento, valorSugerido, modelo]);
  const prefill = useMemo(() => (daNota ? prefillDoExtratoComNota(doExtrato, daNota, dataMov) : doExtrato), [daNota, doExtrato, dataMov]);

  /* O criado (e o Casar que vem depois dele) só se avisam ao FECHAR o modal: os documentos pendentes sobem DEPOIS do `onSave`, no id
     devolvido, e fechar a estação antes disso perderia o arquivo (FIN-NFE-PARCELAS-01: falhou = o modal fica com "Tentar de novo"). */
  const criado = useRef<{ id: string } | null>(null);
  const casarDepois = useRef<LevadoDaNota[] | null>(null);
  const fechar = async () => {
    const c = criado.current; const casar = casarDepois.current;
    criado.current = null; casarDepois.current = null;
    if (c) await aoCriado(semVinculo ? c.id : undefined);
    aoFechar();
    if (casar && aoCasarComBanco) aoCasarComBanco(casar);
  };

  const nomeDaConta = (id: string | null | undefined) => {
    const c = id ? contasBancarias.find((x) => x.id === id) : undefined;
    return c ? (c.nome_exibicao || c.nome_conta || null) : null;
  };

  /**
   * CONC-CRIAR-COM-NOTA-01 — o "Ler a NF" do Documentos: o MESMO leitor da prévia (`notaParaAPrevia`) e a MESMA busca de "já lançada".
   * Já lançada = o Casar com o banco de hoje com os alvos (o nº da NF na linha); conciliada = a frase, nada criado; senão = preenche.
   * Devolve a frase do que impediu, ou `null`.
   */
  const lerNota = async (arquivo: File): Promise<string | null> => {
    const cli = clienteAtual?.id;
    if (!cli) return 'Sem cliente escolhido.';
    const r = await notaParaAPrevia(cli, arquivo, fornecedores, fazendas);
    if (r.ok === false) return r.frase;
    const { lido, doXml } = r.nota;
    const n = lido.nota; const p = doXml.proposta;
    if (doXml.ocorrencias.some((o) => o.origem === 'oc')) return 'Esta nota já está registrada numa operação comercial (OC). Nada foi criado.';
    const parcelas = parcelasParaCasar(p.duplicatas, n.totais.notaCent, p.duplicatas[0]?.vencimento ?? n.emissao);
    const busca = await notaJaLancada(cli, {
      parcelas, numero: p.numeroDocumento || n.numero, chave: n.chave, emitenteDocumento: n.emitente.documento, nomes: [n.emitente.nome, n.emitente.fantasia],
    });
    /* P146 — a consulta que falha nunca vira "não está lançada" */
    if (busca.ok === false) return `Não consegui verificar se esta nota já está lançada (${busca.motivo}). Nada foi preenchido: tente de novo.`;
    const o = oQueFazerComANota(busca.valor, parcelas, n.totais.notaCent);
    if (o.caminho === 'conciliada') return `Esta nota já está lançada e conciliada (${o.alvos.length === 1 ? '1 lançamento' : `${o.alvos.length} lançamentos`}). Confira se este extrato é outro pagamento. Nada foi criado.`;
    if (o.caminho === 'casar') {
      if (!aoCasarComBanco) return 'Esta nota já está lançada: case pelo "Casar com o banco".';
      const sinal = Math.sign(movimento.valor || 1);
      const levados: LevadoDaNota[] = o.alvos.map((l) => ({
        lancamento_id: l.id, descricao: l.descricao, fornecedor: l.fornecedorNome, valor_assinado: sinal * (l.valorCent / 100),
        data_vencimento: l.vencimento, status_transacao: l.status, numero_documento: l.numeroDocumento || p.numeroDocumento || null,
        ...(l.contaBancariaId && contaBancariaId && l.contaBancariaId !== contaBancariaId
          ? { trocarConta: { de: nomeDaConta(l.contaBancariaId), para: nomeDaConta(contaBancariaId) } } : {}),
      }));
      aoFechar();
      aoCasarComBanco(levados);
      return null;
    }
    setDaNota(doXml);
    return null;
  };

  /**
   * ⚠ O QUE VAI AO BANCO É UM SUBCONJUNTO DELIBERADO DO FORMULÁRIO. Valor, contas,
   * data de pagamento, tipo e status NÃO são enviados: a RPC os lê do próprio
   * movimento. Mandá-los daqui abriria espaço para a tela discordar do banco —
   * e são exatamente os campos travados na tela, então não há o que perder.
   * Macro, grupo, centro e escopo também ficam de fora: o gatilho
   * `trg_resolve_classificacao_plano` os resolve a partir do subcentro.
   */
  const salvar = async (form: LancamentoV2Form): Promise<boolean | string> => {
    /* CONC-CRIAR-COM-NOTA-01 (escolha 1) — a nota difere do extrato: cria COM O VALOR DA NOTA, sem vínculo (o writer comum, o form
       inteiro, como o `semVinculo`), e ao fechar abre o Casar com o banco com ele levado — lá a diferença em colunas e os dois ajustes */
    if (!semVinculo && daNota && !fechaAoCentavo(Math.abs(form.valor) - Math.abs(movimento.valor))) {
      const id = await criarLancamentoComId(form, { origem: 'conciliacao', silent: true });
      if (!id) { toast.error('Não foi possível criar o lançamento.'); return false; }
      if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      criado.current = { id };
      casarDepois.current = [{
        lancamento_id: id, descricao: form.descricao || movimento.descricao,
        fornecedor: fornecedores.find((f) => f.id === form.favorecido_id)?.nome ?? daNota.emitenteNome,
        valor_assinado: Math.sign(movimento.valor || 1) * Math.abs(form.valor), data_vencimento: form.data_vencimento || null,
        status_transacao: form.status_transacao || null, numero_documento: form.numero_documento || null,
      }];
      return id;
    }
    if (semVinculo) {
      /* ⚠ AQUI O FORM VAI INTEIRO, e a diferença com o caminho de baixo é o
         motivo: a RPC lê valor, contas, data e tipo do próprio movimento, então
         não precisa recebê-los; o writer comum não conhece movimento nenhum, e
         sem eles criaria um lançamento sem valor nem conta. Os campos são os
         mesmos que a tela mostra travados — vêm do `prefill`. */
      const id = await criarLancamentoComId(form, { origem: 'conciliacao', silent: true });
      if (!id) { toast.error('Não foi possível criar o lançamento.'); return false; }
      toast.success('Lançamento criado e marcado na seleção — o vínculo vem ao confirmar o grupo.');
      /* CONC-CRIAR-COM-NOTA-01 (Fatia A) — o id volta ao modal (os documentos pendentes sobem nele); a estação sabe ao fechar */
      criado.current = { id };
      return id;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_criar_lancamento_de_extrato', {
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
    /* CONC-CRIAR-COM-NOTA-01 (Fatia A) — a RPC devolve o `lancamento_id`: ele volta ao modal, que sobe os documentos pendentes nele */
    const id: unknown = data && typeof data === 'object' ? Reflect.get(data, 'lancamento_id') : null;
    criado.current = { id: typeof id === 'string' ? id : '' };
    return typeof id === 'string' && id ? id : true;
  };

  return (
    <LancamentoV2Dialog
      open
      onClose={() => { void fechar(); }}
      onSave={salvar}
      /* CONC-CRIAR-COM-NOTA-01 (Fatia A) — a aba Documentos do Novo: os pendentes sobem no id que o `salvar` devolve (D1 = a) */
      documentosAntesDeSalvar
      onLerNotaNoNovo={!semVinculo && aoCasarComBanco ? lerNota : undefined}
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
        origem: 'extrato',
        conta_nome: contasBancarias.find(c => c.id === contaBancariaId)?.nome_exibicao
          || contasBancarias.find(c => c.id === contaBancariaId)?.nome_conta || null,
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
