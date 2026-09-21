import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mensagemDoErro } from '@/lib/supabase/mensagemDoErro';
import { addMonths, format } from 'date-fns';
import { montarPayloadConta } from '@/lib/financeiro/contaPayload';
import { loadPlanoContasCompleto, planoToClassificacoes } from '@/lib/financeiro/planoContasBuilder';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoValor } from '@/components/shared/ClassificacaoLancamento';
import { montarPayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';

/* ── Types ── */
export interface ParcelaPreview {
  numero: number;
  data_vencimento: string;
  valor_principal: number;
  valor_juros: number;
}

export type FrequenciaParcela = 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export type NaturezaContrato = 'financiamento' | 'parcelamento' | 'emprestimo';

export interface FinanciamentoForm {
  /**
   * PR-PARC-02 — a natureza do contrato. O banco ja distingue os tres
   * (chk_financiamentos_natureza) e o motor
   * `fn_reconciliar_parcela_financiamento` manda o principal do parcelamento
   * para `plano_conta_parcela_id` sem gerar juros. Aqui e' onde o operador
   * escolhe.
   */
  natureza: NaturezaContrato;
  descricao: string;
  numero_contrato: string;
  /** Escopo do contrato na tela — decide 16020/7010 ou 16010/12010. */
  tipo_financiamento: 'pecuaria' | 'agricultura';
  credor_id: string;
  conta_bancaria_id: string;
  valor_total: number;
  valor_entrada: number;
  data_contrato: string;
  data_primeira_parcela: string;
  total_parcelas: number;
  taxa_juros_anual: number;
  frequencia_parcela: FrequenciaParcela;
  observacao: string;
  plano_conta_captacao_id: string;
  plano_conta_parcela_id: string;
  gerar_lancamento_captacao: boolean;
  /**
   * A FAZENDA — e ela só existe no PARCELAMENTO. PAR-01c.
   *
   * ⚠ NO FINANCIAMENTO E NO EMPRESTIMO A FAZENDA CONTINUA SENDO O ADMINISTRATIVO, fixada pelo
   * gravador e não escolhida (ver `fazendaDoContrato` abaixo). O parcelamento é outra coisa: é
   * uma despesa operacional paga em N vezes — IPTU de uma fazenda, seguro de um maquinário —, e
   * mandá-la para o Administrativo tiraria N lançamentos do rateio da fazenda que os gastou.
   * Vazio aqui só acontece antes de o operador escolher; o gravador recusa.
   */
  fazenda_id: string;
  /**
   * A forma de pagamento da parcela — e ela é do LANÇAMENTO, não do contrato. PAR-01c.
   *
   * ⚠ `financiamentos` NÃO TEM ESTA COLUNA: quem a tem é cada parcela, que nasce linha de
   * `financeiro_lancamentos_v2`. Ela viaja no payload e a RPC a repassa para as N parcelas.
   * ⚠ O VOCABULÁRIO É O DO V2 (`lib/financeiro/formasPagamentoV2`), oito itens, porque é a
   * MESMA coluna que o modal do financeiro grava — a tela que vai EDITAR essa parcela é aquela,
   * e oferecer aqui um vocabulário diferente faria a parcela nascer com uma forma que a outra
   * tela não sabe mostrar.
   * ⚠ NÃO É `lib/financeiro/formasPagamento` (a da OC, com Cheque): outra tabela, outra coluna.
   * ⚠ VAZIO GRAVA NULO — ausência, não a palavra "nenhuma".
   */
  forma_pagamento: string;
}

const INITIAL: FinanciamentoForm = {
  natureza: 'financiamento',
  descricao: '',
  numero_contrato: '',
  tipo_financiamento: 'pecuaria',
  credor_id: '',
  conta_bancaria_id: '',
  valor_total: 0,
  valor_entrada: 0,
  data_contrato: '',
  data_primeira_parcela: '',
  total_parcelas: 12,
  taxa_juros_anual: 0,
  frequencia_parcela: 'mensal',
  observacao: '',
  plano_conta_captacao_id: '',
  plano_conta_parcela_id: '',
  gerar_lancamento_captacao: false,
  fazenda_id: '',
  forma_pagamento: '',
};

const MESES_POR_FREQUENCIA: Record<FrequenciaParcela, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function useFinanciamentoCadastro() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id ?? '';

  // Financiamentos sempre pertencem à fazenda Administrativo
  const { data: fazendaAdmId } = useQuery({
    queryKey: ['fazenda-adm', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('fazendas')
        .select('id')
        .eq('cliente_id', clienteId)
        .ilike('nome', '%admin%')
        .limit(1)
        .single();
      return data?.id ?? null;
    },
  });
  const [form, setForm] = useState<FinanciamentoForm>({ ...INITIAL });
  const [parcelas, setParcelas] = useState<ParcelaPreview[]>([]);
  const [saving, setSaving] = useState(false);
  /**
   * A CLASSIFICAÇÃO DO PARCELAMENTO — o value de `<ClassificacaoLancamento>`.
   *
   * ⚠ FORA DO `FinanciamentoForm` DE PROPÓSITO, pelo mesmo motivo que `parcelas`: é o estado de
   * um COMPONENTE controlado, com dez campos que se cruzam por regra própria, e não um campo do
   * contrato. Inchá-lo no form faria o gravador de EDIÇÃO (`FinanciamentoDetalhe.saveEdit`)
   * receber dez chaves que ele não grava.
   * ⚠ DESTE OBJETO SÓ QUATRO CAMPOS VÃO PARA A RPC — plano, safra, cultura e fase. Os outros
   * seis (macro, grupo, centro, subcentro, escopo, atividade) são DERIVADOS do plano pelos
   * triggers do v2; mandá-los seria oferecer ao banco uma segunda opinião sobre o que ele já
   * sabe calcular.
   */
  /**
   * A FAZENDA DO CONTRATO — e a regra do Administrativo ficou ESCOPADA. PAR-01c.
   *
   * ⚠ A REGRA ACIMA NÃO FOI REVOGADA, FOI DELIMITADA: financiamento e empréstimo continuam
   * nascendo no Administrativo, fixados aqui e sem campo na tela. O que mudou é que o
   * PARCELAMENTO deixou de ser arrastado junto — ele é N despesas classificadas, não captação
   * administrativa, e o único parcelamento real da base está numa fazenda de pecuária.
   * ⚠ NÃO CAI PARA O ADMINISTRATIVO quando o parcelamento está sem fazenda: o gravador recusa.
   * Um fallback silencioso mandaria as parcelas para a fazenda errada sem ninguém ver.
   */
  const fazendaId = form.natureza === 'parcelamento'
    ? (form.fazenda_id || null)
    : (fazendaAdmId ?? null);

  const [classificacao, setClassificacao] = useState<ClassificacaoValor>({
    atividade: null, safra_id: '', cultura: '', fase: '', subcentro: '',
    macro_custo: '', grupo_custo: '', centro_custo: '', escopo_negocio: '',
    plano_conta_id: null,
  });

  /* ── Lookups ── */
  const { data: fornecedores = [] } = useQuery({
    queryKey: ['fin-fornecedores', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  /* ⚠ CARTAO E CAIXA ENTRAM (PR-PARC-05c item 1). O filtro `IN ('cc','inv')` nasceu da
     CAPTACAO — "cartão não recebe captação" (PR-H1) — mas este campo nao e' o da captacao:
     e' `conta_bancaria_id`, "de onde SAEM as parcelas". Parcelamento no cartao e' o caso
     real e corriqueiro (Seguro Rural no Cartão BB - Visa Infinite, medido no proto), e com
     o filtro velho a conta do contrato simplesmente NAO APARECIA na lista: o seletor abria
     vazio e o resumo dizia "—" para um contrato que tem conta. Dado existente aparentando
     ausencia — o que as sentinelas proibem.
     ⚠ A CHAVE MUDOU DE NOME junto com o escopo. `fin-contas-bancarias` continuaria servindo
     cache da lista ESTREITA para quem pedisse a larga. */
  const { data: contas = [] } = useQuery({
    queryKey: ['fin-contas-parcelas', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        // PR-H2 — tipo_conta para agrupamento no ContaBancariaSelect.
        .select('id, nome_conta, nome_exibicao, banco, tipo_conta')
        .eq('cliente_id', clienteId)
        .eq('ativa', true)
        .in('tipo_conta', ['cc', 'inv', 'cartao', 'caixa'])
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const { data: planosEntrada = [] } = useQuery({
    queryKey: ['fin-plano-captacao', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo')
        .eq('ativo', true)
        .eq('macro_custo', 'Entrada Financeira')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const { data: planosSaida = [] } = useQuery({
    queryKey: ['fin-plano-amortizacao', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo')
        .eq('ativo', true)
        .eq('macro_custo', 'Saída Financeira')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  /**
   * PR-PARC-02 — 1d — CLASSIFICAÇÃO DA PARCELA DO PARCELAMENTO.
   *
   * ⚠ NÃO É A LISTA DE AMORTIZAÇÃO. Um parcelamento não amortiza dívida: ele
   * divide uma DESPESA em N vezes, e cada parcela vira um lançamento no
   * subcentro da despesa (IPTU em Tributos, seguro em Custeio Produção). Por
   * isso a lista aqui é a de saídas OPERACIONAIS, e `Saída Financeira` —
   * exatamente o que a amortização usa — fica de fora.
   *
   * ⚠ LITERAIS MEDIDOS NO BANCO PROTO, não supostos (types.ts tipa as duas
   * colunas apenas como `string | null`): `tipo_operacao` = '2-Saídas' e
   * `macro_custo` = 'Saída Financeira' / 'Transferências' — os três com acento.
   * A grafia de `Saída Financeira` é a mesma que a query de amortização acima
   * já usa.
   */
  const { data: planosParcelamento = [] } = useQuery({
    queryKey: ['fin-plano-parcelamento', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo')
        .eq('ativo', true)
        .eq('tipo_operacao', '2-Saídas')
        .neq('macro_custo', 'Saída Financeira')
        .neq('macro_custo', 'Transferências')
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  /**
   * O PLANO DE CONTAS INTEIRO, na forma que `<ClassificacaoLancamento>` consome. PAR-01c.
   *
   * ⚠ NÃO É A `planosParcelamento` ACIMA, e as duas convivem por razões diferentes: aquela é
   * uma lista já peneirada para um `<Select>` simples, com quatro colunas; o cluster precisa do
   * `ClassificacaoItem` completo (grupo, escopo, tipo_operacao, ordem) porque é ele que cruza
   * atividade × subcentro × safra.
   * ⚠ REUSA AS FUNÇÕES SOBERANAS, não uma query nova: `loadPlanoContasCompleto` +
   * `planoToClassificacoes` são exatamente as que o `useFinanceiroV2` chama. Escrever aqui um
   * segundo `select` do plano seria criar a segunda fonte que este PR existe para evitar.
   * ⚠ SEM O ENRIQUECIMENTO COM OS COMBOS LEGADOS, e isso é deliberado. O `useFinanceiroV2`
   * acrescenta as combinações que só existem em lançamentos antigos, para que a lista FILTRE o
   * que já foi gravado. Aqui se está CRIANDO: oferecer uma conta que não existe mais no plano
   * faria nascer, hoje, um lançamento numa classificação aposentada.
   */
  const { data: classificacoes = [] } = useQuery<ClassificacaoItem[]>({
    queryKey: ['fin-classificacoes-plano', clienteId],
    enabled: !!clienteId,
    queryFn: async () => planoToClassificacoes(await loadPlanoContasCompleto(clienteId)),
  });

  /**
   * As safras ativas — a mesma consulta do `useFinanceiroV2.loadSafras`, colunas incluídas.
   * ⚠ `codigo` E `escopo_negocio` NÃO SÃO ENFEITE: sem eles `safraSugerida` não tem como sugerir
   * (a regra é temporada + escopo), e o cluster abriria sempre sem sugestão nenhuma.
   */
  const { data: safras = [] } = useQuery<Safra[]>({
    queryKey: ['fin-safras-ativas', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: financeiro_safras fora de types.ts
      const { data } = await (supabase as any).from('financeiro_safras')
        .select('id, nome, descricao, ativa, codigo, escopo_negocio')
        .eq('cliente_id', clienteId)
        .eq('ativa', true)
        .order('ordem_exibicao', { ascending: true })
        .order('nome', { ascending: true });
      return (data as Safra[]) ?? [];
    },
  });

  /* ── Geração de parcelas ── */
  const gerarParcelas = useCallback(() => {
    const { valor_total, valor_entrada, total_parcelas, taxa_juros_anual, data_primeira_parcela, frequencia_parcela, natureza } = form;
    if (!valor_total || !total_parcelas || !data_primeira_parcela) return;

    const mesesPorParcela = MESES_POR_FREQUENCIA[frequencia_parcela] ?? 1;
    const base = (valor_total - valor_entrada) / total_parcelas;

    /* PR-PARC-02 — 1c — PARCELAMENTO NÃO TEM JUROS. A taxa é forçada a 0 AQUI,
       na origem do cálculo, e não escondendo o campo na tela: o campo escondido
       continuaria com o valor que o operador digitou antes de trocar a natureza,
       e as parcelas nasceriam com juros que ninguém vê. */
    const taxaAnual = natureza === 'parcelamento' ? 0 : taxa_juros_anual;

    // Juros compostos: anual → mensal → período
    const taxaMensal = taxaAnual > 0
      ? Math.pow(1 + taxaAnual / 100, 1 / 12) - 1
      : 0;
    const taxaPeriodo = taxaMensal > 0
      ? Math.pow(1 + taxaMensal, mesesPorParcela) - 1
      : 0;
    const juros = base * taxaPeriodo;

    const baseDate = new Date(data_primeira_parcela + 'T12:00:00');

    const novas: ParcelaPreview[] = Array.from({ length: total_parcelas }, (_, i) => ({
      numero: i + 1,
      data_vencimento: format(addMonths(baseDate, i * mesesPorParcela), 'yyyy-MM-dd'),
      valor_principal: Math.round(base * 100) / 100,
      valor_juros: Math.round(juros * 100) / 100,
    }));
    setParcelas(novas);
  }, [form]);

  const updateParcela = useCallback((idx: number, field: keyof ParcelaPreview, value: any) => {
    setParcelas(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }, []);

  const totalParcelas = useMemo(
    () => parcelas.reduce((s, p) => s + p.valor_principal + p.valor_juros, 0),
    [parcelas],
  );

  /* ── Salvar ── */
  const salvar = useCallback(async (destinacoes?: Array<{
    descricao: string; tipo: string; valor: number;
    fornecedor_id: string; conta_bancaria_id: string;
    plano_conta_id: string; gerar_lancamento: boolean; observacao: string;
  }>): Promise<boolean> => {
    if (!clienteId || !user) {
      toast.error('Sessão inválida');
      return false;
    }
    if (!form.descricao.trim()) {
      toast.error('Preencha a descrição');
      return false;
    }
    if (!form.data_contrato || !form.data_primeira_parcela) {
      toast.error('Preencha as datas');
      return false;
    }
    if (parcelas.length === 0) {
      toast.error('Gere as parcelas antes de salvar');
      return false;
    }
    /* PR-PARC-02 — 1c — no parcelamento a classificação da parcela é o ÚNICO
       destino contábil do contrato: sem captação, é ela que diz em que
       subcentro a despesa cai. Vazia, o contrato nasce mudo.
       ⚠ A CONTA AGORA VEM DO CLUSTER — PAR-01c. O campo `plano_conta_parcela_id` do form deixou
       de ser preenchido por um `<Select>` próprio e passou a ser o `plano_conta_id` que o
       `<ClassificacaoLancamento>` resolve; a tela o mantém em sincronia. A regra que ele guarda
       — parcelamento sem conta nasce mudo — continua valendo, e é a mesma linha. */
    if (form.natureza === 'parcelamento' && !form.plano_conta_parcela_id) {
      toast.error('Escolha a classificação da parcela');
      return false;
    }

    /* ═══ PARCELAMENTO: O BANCO É QUEM ESCREVE — PAR-01c ═══════════════════════════════════
       ⚠ AQUI MORRE O CAMINHO CLIENT-SIDE DA PARCELA. Abaixo desta chave, o gravador antigo
       insere `financiamentos`, depois `financiamento_parcelas`, e desfaz o primeiro com um
       DELETE quando o segundo falha — um rollback à mão, sem transação, que deixa contrato órfão
       se a aba fechar no meio. E, desde a Opção A, ele NÃO cria o lançamento de cada parcela: o
       `criarMirrorParcela` está comentado, e o parcelamento nascia com parcelas que nenhum
       lançamento espelhava. A RPC faz os três inserts numa transação só.
       ⚠ O RAMO DE FINANCIAMENTO/EMPRÉSTIMO NÃO PASSA POR AQUI: captação, juros e destinações
       continuam no caminho de baixo, intocados. Só o parcelamento trocou de gravador. */
    if (form.natureza === 'parcelamento') {
      if (!fazendaId) {
        toast.error('Escolha a fazenda do parcelamento');
        return false;
      }
      setSaving(true);
      try {
        /* ⚠ A COMPETÊNCIA É A DATA DO CONTRATO, e é decisão, não falta de campo: a tela não tem
           campo de competência e o único parcelamento real da base tem competência igual ao
           contrato. Fica FIXA em todas as parcelas — quem escalona é o vencimento. */
        /* ⚠ A MONTAGEM SAIU DAQUI — PAR-02. As 19 chaves eram montadas inline neste ponto,
           quando só esta tela chamava a RPC. O "parcelada" do modal do financeiro passou a
           chamar a MESMA função, e duas montagens divergiriam na primeira chave nova. O que
           cada chave recebe é o mesmo, byte a byte; só mudou de arquivo.
           ⚠ `plano_conta_id` CONTINUA VINDO DE `form.plano_conta_parcela_id`, não do cluster:
           é a coluna que o contrato grava, e o efeito de espelho a mantém igual ao cluster. O
           modal passa o dele; por isso o montador recebe o valor em vez de escolher. */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { data, error } = await (supabase as any).rpc('fn_parcelamento_cadastrar', {
          p_payload: montarPayloadParcelamento(
            clienteId,
            {
              fazendaId,
              descricao: form.descricao,
              valorTotal: form.valor_total,
              totalParcelas: form.total_parcelas,
              dataPrimeiraParcela: form.data_primeira_parcela,
              dataCompetencia: form.data_contrato,
              intervaloMeses: MESES_POR_FREQUENCIA[form.frequencia_parcela] ?? 1,
              favorecidoId: form.credor_id || null,
              formaPagamento: form.forma_pagamento || null,
              contaBancariaId: form.conta_bancaria_id || null,
              tipoFinanciamento: form.tipo_financiamento,
              numeroContrato: form.numero_contrato.trim() || null,
              observacao: form.observacao || null,
            },
            {
              plano_conta_id: form.plano_conta_parcela_id,
              safra_id: classificacao.safra_id || null,
              cultura: classificacao.cultura || null,
              fase: classificacao.fase || null,
            },
          ),
        });
        if (error) throw error;
        toast.success('Parcelamento cadastrado');
        return !!data;
      } catch (e) {
        /* A mensagem crua da RPC — ela escreve em português de operador justamente para chegar
           assim ("Sem acesso ao cliente informado", "plano, fazenda, competencia e primeira
           parcela obrigatorios"). Traduzir aqui criaria um segundo texto para a mesma regra.
           ⚠ E ELA NÃO CHEGAVA. O teste era `e instanceof Error`, que é FALSO para o erro do
           PostgREST no destructuring: ele é objeto plano, e a biblioteca só constrói
           `PostgrestError` sob `.throwOnError()`. As frases acima nunca apareceram em tela. */
        toast.error(mensagemDoErro(e, 'Falha ao cadastrar o parcelamento'));
        return false;
      } finally {
        setSaving(false);
      }
    }

    setSaving(true);
    try {
      /* PR-PARC-02 — 1c — o parcelamento não capta e não cobra juros. As três
         decisões abaixo eram tomadas no GRAVADOR, não na tela: esconder o campo
         não apaga o valor que ficou no state, e o que chega ao banco é o que
         vale.
         ⚠ AS TRÊS VIRARAM DESNECESSÁRIAS AQUI — PAR-01c, e o compilador foi quem disse. O
         parcelamento retorna no bloco da RPC, acima; deste ponto em diante `natureza` só pode
         ser 'financiamento' ou 'emprestimo', e o TS passou a acusar TS2367 ("no overlap") na
         comparação. Os ternários eram guardas contra um caso que não chega mais.
         ⚠ A REGRA NÃO SUMIU, MUDOU DE DONO: quem garante que o parcelamento nasce sem juros,
         sem captação e sem entrada é a RPC, que grava `taxa_juros`, `taxa_juros_mensal` e
         `valor_entrada` em 0 e `gerar_lancamento_captacao` em false — no banco, não na tela. */
      const taxaAnual = form.taxa_juros_anual;
      const gerarCaptacao = form.gerar_lancamento_captacao;
      const planoCaptacaoId = form.plano_conta_captacao_id || null;

      // Conversão juros compostos: anual → mensal
      const taxaMensal = taxaAnual > 0
        ? (Math.pow(1 + taxaAnual / 100, 1 / 12) - 1) * 100
        : 0;

      // 1 – Insert financiamento
      const { data: fin, error: errFin } = await supabase
        .from('financiamentos')
        .insert({
          cliente_id: clienteId,
          fazenda_id: fazendaId,
          natureza: form.natureza,
          descricao: form.descricao.trim(),
          numero_contrato: form.numero_contrato.trim() || null,
          tipo_financiamento: form.tipo_financiamento,
          credor_id: form.credor_id || null,
          conta_bancaria_id: form.conta_bancaria_id || null,
          valor_total: form.valor_total,
          valor_entrada: form.valor_entrada,
          taxa_juros_mensal: Math.round(taxaMensal * 10000) / 10000,
          total_parcelas: form.total_parcelas,
          data_contrato: form.data_contrato,
          data_primeira_parcela: form.data_primeira_parcela,
          plano_conta_captacao_id: planoCaptacaoId,
          plano_conta_parcela_id: form.plano_conta_parcela_id || null,
          gerar_lancamento_captacao: gerarCaptacao,
          observacao: form.observacao || null,
          status: 'ativo',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (errFin || !fin) throw new Error(errFin?.message ?? 'Erro ao salvar financiamento');

      // 2 – Insert parcelas
      const parcelasInsert = parcelas.map(p => ({
        financiamento_id: fin.id,
        cliente_id: clienteId,
        numero_parcela: p.numero,
        data_vencimento: p.data_vencimento,
        valor_principal: p.valor_principal,
        valor_juros: p.valor_juros,
        status: 'pendente' as const,
      }));

      const { data: parcelasSalvas, error: errParcelas } = await supabase
        .from('financiamento_parcelas')
        .insert(parcelasInsert)
        .select('id, data_vencimento, valor_principal, valor_juros');

      if (errParcelas) {
        await supabase.from('financiamentos').delete().eq('id', fin.id);
        throw new Error(errParcelas.message);
      }

      // Espelha cada parcela em financeiro_lancamentos_v2 e planejamento_financeiro
      // DESATIVADO (Opção A — eliminar espelhos auto em planejamento_financeiro):
      // if (parcelasSalvas && parcelasSalvas.length > 0 && (fin.tipo_financiamento === 'pecuaria' || fin.tipo_financiamento === 'agricultura')) {
      //   const { criarMirrorParcela } = await import('@/lib/financiamentos/parcelaMirror');
      //   await Promise.all(parcelasSalvas.map((p: any) =>
      //     criarMirrorParcela(supabase as any, {
      //       id: p.id,
      //       cliente_id: clienteId,
      //       fazenda_id: fazendaId,
      //       data_vencimento: p.data_vencimento,
      //       valor_principal: Number(p.valor_principal) || 0,
      //       valor_juros: Number(p.valor_juros) || 0,
      //     }, {
      //       id: fin.id,
      //       cliente_id: clienteId,
      //       fazenda_id: fazendaId,
      //       tipo_financiamento: fin.tipo_financiamento as 'pecuaria' | 'agricultura',
      //     }),
      //   ));
      // }

      // 3 – Lançamento de captação (opcional)
      if (gerarCaptacao && planoCaptacaoId) {
        const anoMes = format(new Date(form.data_contrato + 'T12:00:00'), 'yyyy-MM');
        // PR-K — conta_*_id via helper soberano: captação é entrada,
        // conta vai em conta_destino_id (não conta_bancaria_id).
        const contasCap = montarPayloadConta('1-Entradas', form.conta_bancaria_id || null);
        const { data: lancCap, error: errLanc } = await supabase
          .from('financeiro_lancamentos_v2')
          .insert({
            cliente_id: clienteId,
            fazenda_id: fazendaId,
            financiamento_id: fin.id,
            conta_bancaria_id: contasCap.conta_bancaria_id,
            conta_destino_id: contasCap.conta_destino_id,
            favorecido_id: form.credor_id || null,
            tipo_operacao: '1-Entradas',
            sinal: 1,
            valor: form.valor_total,
            data_competencia: form.data_contrato,
            data_pagamento: form.data_contrato,
            ano_mes: anoMes,
            origem_lancamento: 'financiamento',
            origem_tipo: 'financiamento_captacao',
            plano_conta_id: planoCaptacaoId,
            descricao: `Captação: ${form.descricao.trim()}`,
            status_transacao: 'realizado',
            sem_movimentacao_caixa: false,
            cancelado: false,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (errLanc) {
          console.error('Erro ao gerar lançamento de captação:', errLanc);
          toast.warning('Financiamento salvo, mas o lançamento de captação falhou.');
        } else if (lancCap?.id) {
          await supabase
            .from('financiamentos')
            .update({ lancamento_captacao_id: lancCap.id })
            .eq('id', fin.id);
        }
      }

      // 4 – Destinações (opcional)
      if (destinacoes && destinacoes.length > 0) {
        const destInsert = destinacoes.map(d => ({
          financiamento_id: fin.id,
          cliente_id: clienteId,
          descricao: d.descricao,
          tipo: d.tipo,
          valor: d.valor,
          fornecedor_id: d.fornecedor_id || null,
          conta_bancaria_id: d.conta_bancaria_id || null,
          plano_conta_id: d.plano_conta_id || null,
          gerar_lancamento: d.gerar_lancamento,
          observacao: d.observacao || null,
        }));

        const { data: destSalvas, error: errDest } = await supabase
          .from('financiamento_destinacoes')
          .insert(destInsert)
          .select('id, tipo, valor, plano_conta_id, conta_bancaria_id, descricao, gerar_lancamento');

        if (errDest) {
          toast.warning('Financiamento salvo, mas houve erro ao salvar destinações: ' + errDest.message);
        } else if (destSalvas) {
          for (const dest of destSalvas) {
            if (!dest.gerar_lancamento) continue;

            const isEntrada = dest.tipo === 'conta_propria';
            const tipoOperacao = isEntrada ? '1-Entradas' : '2-Saídas';
            const sinal = isEntrada ? 1 : -1;
            const semCaixa = dest.tipo !== 'conta_propria';
            const anoMes = format(new Date(form.data_contrato + 'T12:00:00'), 'yyyy-MM');
            // PR-K — conta_*_id via helper soberano (hardening preventivo:
            // 0 registros existentes mas o caminho pode rodar). Entrada
            // ('conta_propria') vai em conta_destino_id; saída vai em
            // conta_bancaria_id.
            const contasDest = montarPayloadConta(tipoOperacao, dest.conta_bancaria_id || null);

            const { data: lancDest, error: errLancDest } = await supabase
              .from('financeiro_lancamentos_v2')
              .insert({
                cliente_id: clienteId,
                fazenda_id: fazendaId,
                conta_bancaria_id: contasDest.conta_bancaria_id,
                conta_destino_id: contasDest.conta_destino_id,
                tipo_operacao: tipoOperacao,
                sinal: sinal,
                valor: dest.valor,
                data_competencia: form.data_contrato,
                ano_mes: anoMes,
                origem_lancamento: 'financiamento',
                origem_tipo: 'financiamento_destinacao',
                plano_conta_id: dest.plano_conta_id || null,
                descricao: `${dest.descricao} — ${form.descricao.trim()}`,
                status_transacao: 'realizado',
                cancelado: false,
                sem_movimentacao_caixa: semCaixa,
                created_by: user.id,
              })
              .select('id')
              .single();

            if (errLancDest) {
              console.error('Erro ao gerar lançamento da destinação:', errLancDest);
              toast.warning(`Destinação "${dest.descricao}" salva, mas lançamento falhou.`);
              continue;
            }

            await supabase
              .from('financiamento_destinacoes')
              .update({ lancamento_id: lancDest.id, updated_at: new Date().toISOString() })
              .eq('id', dest.id);
          }
        }
      }

      /* PR-PARC-04 — "obrigacao", e nao "financiamento": desde a natureza, o mesmo
         gravador atende parcelamento, financiamento e emprestimo. E' o UNICO toast do
         salvar — o modal nao emite o seu. */
      toast.success('Obrigação criada');
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [clienteId, fazendaId, user, form, parcelas, classificacao]);

  return {
    form, setForm,
    parcelas, setParcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    fornecedores, contas,
    planosEntrada, planosSaida, planosParcelamento,
    /* PAR-01c — o cluster de classificação do parcelamento e as duas listas que ele consome. */
    classificacao, setClassificacao,
    classificacoes, safras,
    clienteId,
  };
}
