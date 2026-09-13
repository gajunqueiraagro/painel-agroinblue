/**
 * AS VENDAS DE GRÃO DE UM CONTRATO DE BARTER — a perna ENTREGUEI (PR-AGRI-BARTER-TELA-C).
 *
 * ⚠ UMA VENDA SÃO TRÊS TABELAS, e a ordem importa: `agri_operacoes_comerciais` é o cabeçalho,
 * `agri_oc_entregas` são as linhas por classe de aflatoxina e `agri_oc_partes` é o que vai ao
 * DRE. As três não têm FK entre si no Proto (medido em 13/09/2026: zero FOREIGN KEY nas três),
 * então quem garante a coerência é este arquivo — não o banco.
 *
 * ⚠ NÃO HÁ RPC PARA GRAVAR A VENDA, e isso tem consequência: cabeçalho, entregas e partes são
 * três viagens ao PostgREST, sem transação. Se a segunda falhar, sobra cabeçalho sem linha — e
 * por isso o gravador SEMPRE reporta o erro real em vez de dizer "salvo". A atomicidade é
 * dívida declarada, não descuido — e ela CONTINUA ABERTA: a fatia D veio, mexeu no motor de
 * materializar e não encostou na gravação. Ela já cobrou uma vez (13/09/2026): a venda de
 * 12.374,35 sc gravou cabeçalho e entrega, as partes falharam, e sobrou operação sem parte no
 * Proto. Salvar por cima corrigiu, porque o gravador substitui as filhas — mas quem descobriu
 * foi o operador, na tela.
 *
 * ⚠ A CONTRAPARTE VEM DO CONTRATO, NÃO DA TELA. `contraparte_fornecedor_id` é NOT NULL e o
 * parceiro do barter já está decidido na abertura; perguntar de novo abriria espaço para uma
 * venda apontar para outro fornecedor que não o dono da conta de permuta — e aí o saldo do
 * contrato somaria peras com maçãs.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendaEntrega {
  id: string;
  operacao_id: string;
  classe_aflatoxina: string | null;
  sacas: number | null;
  preco_saca: number | null;
  valor: number | null;
}

export interface VendaParte {
  id: string;
  operacao_id: string;
  natureza: string;
  descricao: string | null;
  valor: number;
  plano_conta_id: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  financeiro_lancamento_id: string | null;
}

export interface BarterVenda {
  id: string;
  cultura: string;
  safra_id: string | null;
  data_operacao: string;
  tipo_precificacao: string;
  valor_bruto: number | null;
  descontos: number | null;
  valor_liquido: number | null;
  status_comercial: string;
  observacoes: string | null;
  entregas: VendaEntrega[];
  partes: VendaParte[];
}

/** O que a tela manda gravar — o cabeçalho e as duas listas, de uma vez. */
export interface VendaPayload {
  cultura: string;
  safra_id: string | null;
  data_operacao: string;
  tipo_precificacao: string;
  observacoes: string | null;
  valor_bruto: number;
  descontos: number;
  valor_liquido: number;
  entregas: Array<{
    classe_aflatoxina: string;
    sacas: number;
    preco_saca: number;
    valor: number;
  }>;
  /** A classificação da receita no plano — os quatro níveis, como o materializador lê. */
  receita: {
    plano_conta_id: string | null;
    macro_custo: string | null;
    grupo_custo: string | null;
    centro_custo: string | null;
    subcentro: string | null;
  };
  /** A dedução (Senar e afins). Zero = não gravar parte de imposto. */
  deducao: { valor: number; descricao: string | null };
}

/**
 * A LINHA DE `agri_oc_partes` COMO ELA VAI AO BANCO — PR-AGRI-BARTER-FIX-INCLUSO-NULL.
 *
 * ⚠ ESTE TIPO EXISTE PARA O COMPILADOR COBRAR A CHAVE, e nasceu de um defeito real: as duas
 * partes eram objetos soltos com conjuntos de chaves DIFERENTES — a receita sem
 * `incluso_no_total`, a dedução com. Num insert em LOTE, o PostgREST monta a lista de colunas
 * pela UNIÃO das chaves de todos os objetos e manda NULL para quem não tem a sua; o default da
 * coluna não é consultado. A receita chegava com `incluso_no_total = null` numa coluna
 * NOT NULL, e a venda inteira era recusada.
 * ⚠ E POR ISSO O CAMPO NÃO É OPCIONAL AQUI. Com todos os campos obrigatórios, o array é
 * homogêneo POR CONSTRUÇÃO e a união de chaves é sempre a mesma lista. Um comentário pedindo
 * cuidado seria esquecido no próximo campo novo; o tipo não esquece.
 * ⚠ MEDIDO NO PROTO em 13/09/2026, em transação revertida: chave OMITIDA grava com o default
 * `true`; chave presente com NULL é RECUSADA com "null value in column "incluso_no_total" of
 * relation "agri_oc_partes" violates not-null constraint" — a mensagem exata da tela.
 */
interface EntregaPayload {
  cliente_id: string;
  operacao_id: string;
  classe_aflatoxina: string;
  sacas: number;
  preco_saca: number;
  valor: number;
  colheita_id: string | null;
}

interface PartePayload {
  cliente_id: string;
  operacao_id: string;
  natureza: string;
  descricao: string | null;
  valor: number;
  plano_conta_id: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  /** NUNCA nulo: a coluna é NOT NULL, e null explícito ignora o default. */
  incluso_no_total: boolean;
}

const COLS_OP = 'id, cultura, safra_id, data_operacao, tipo_precificacao, valor_bruto,'
  + ' descontos, valor_liquido, status_comercial, observacoes';
const COLS_ENT = 'id, operacao_id, classe_aflatoxina, sacas, preco_saca, valor';
const COLS_PAR = 'id, operacao_id, natureza, descricao, valor, plano_conta_id, macro_custo,'
  + ' grupo_custo, centro_custo, subcentro, financeiro_lancamento_id';

export const NATUREZA_RECEITA = 'receita_venda';
/**
 * ⚠ `imposto`, NÃO `desconto`. O CHECK do banco aceita os dois (medido: receita_venda,
 * custo_insumo, desconto, imposto, frete), e a diferença é real: o Senar é contribuição
 * compulsória sobre a receita bruta, não abatimento comercial negociado com o comprador. No
 * dia em que houver desconto de verdade — quebra de qualidade, por exemplo — ele terá a sua
 * própria natureza, e as duas coisas não estarão no mesmo balde.
 */
export const NATUREZA_DEDUCAO = 'imposto';

export function useBarterVenda(
  clienteId: string | null | undefined,
  contratoId: string | null,
  contratoFazendaId: string | null,
  parceiroFornecedorId: string | null,
) {
  const queryClient = useQueryClient();
  const chave = ['barter-vendas', contratoId ?? ''];

  const { data, isLoading } = useQuery({
    queryKey: chave,
    enabled: !!contratoId,
    queryFn: async (): Promise<BarterVenda[]> => {
      const db = supabase as any;
      const { data: ops, error } = await db.from('agri_operacoes_comerciais')
        .select(COLS_OP)
        .eq('contrato_barter_id', contratoId)
        .eq('ativo', true)
        .order('data_operacao', { ascending: true });
      if (error) throw error;
      const operacoes = (ops ?? []) as Array<Omit<BarterVenda, 'entregas' | 'partes'>>;
      if (operacoes.length === 0) return [];

      /* ⚠ DOIS `in()`, NÃO UM JOIN ANINHADO — a mesma razão de `useBarterContratos`: o
         `types.ts` não conhece estas tabelas, e a relação do PostgREST resolveria para
         `SelectQueryError`, que sai MUDO em runtime. */
      const ids = operacoes.map(o => o.id);
      const [{ data: ents }, { data: pars }] = await Promise.all([
        db.from('agri_oc_entregas').select(COLS_ENT).in('operacao_id', ids),
        db.from('agri_oc_partes').select(COLS_PAR).in('operacao_id', ids),
      ]);
      const entregas = (ents ?? []) as VendaEntrega[];
      const partes = (pars ?? []) as VendaParte[];
      return operacoes.map(o => ({
        ...o,
        entregas: entregas.filter(e => e.operacao_id === o.id),
        partes: partes.filter(p => p.operacao_id === o.id),
      }));
    },
  });

  /**
   * Grava a venda inteira — cabeçalho, entregas e partes.
   *
   * ⚠ AS FILHAS SÃO SUBSTITUÍDAS, NÃO CASADAS LINHA A LINHA. Uma entrega não tem identidade
   * própria: ela é "a linha da classe X desta venda", no máximo quatro. Casar por id para
   * poupar dois DELETEs seria complexidade sem ganho.
   * ⚠ E A ORDEM É INSERIR ANTES DE APAGAR. Se o INSERT falhar depois de um DELETE, a venda
   * perde as linhas e diz "salvo" — o pior defeito possível. Fazendo o contrário, uma falha no
   * meio deixa linha DUPLICADA, que o operador enxerga na hora e pode corrigir. Errar para o
   * lado visível.
   */
  const salvar = async (
    id: string | null, p: VendaPayload,
  ): Promise<{ ok: boolean; erro?: string }> => {
    if (!clienteId || !contratoId) return { ok: false, erro: 'Sem cliente ou contrato.' };
    if (!parceiroFornecedorId) {
      return { ok: false, erro: 'O contrato está sem parceiro — reabra o contrato.' };
    }
    const db = supabase as any;

    const cabecalho = {
      cultura: p.cultura,
      safra_id: p.safra_id,
      data_operacao: p.data_operacao,
      tipo_precificacao: p.tipo_precificacao,
      observacoes: p.observacoes,
      valor_bruto: p.valor_bruto,
      descontos: p.descontos,
      valor_liquido: p.valor_liquido,
    };

    let operacaoId = id;
    if (operacaoId) {
      const { error } = await db.from('agri_operacoes_comerciais')
        .update(cabecalho).eq('id', operacaoId);
      if (error) return { ok: false, erro: error.message };
    } else {
      const { data: nova, error } = await db.from('agri_operacoes_comerciais')
        .insert({
          ...cabecalho,
          cliente_id: clienteId,
          contrato_barter_id: contratoId,
          contraparte_fornecedor_id: parceiroFornecedorId,
          fazenda_id: contratoFazendaId,
          tipo_operacao: 'venda_grao',
          condicao_pagamento: 'barter',
        })
        .select('id').single();
      if (error) return { ok: false, erro: error.message };
      operacaoId = (nova as { id: string }).id;
    }

    /* ── ENTREGAS ── */
    const { data: entAntigas } = await db.from('agri_oc_entregas')
      .select('id').eq('operacao_id', operacaoId);
    const idsEntAntigas = ((entAntigas ?? []) as Array<{ id: string }>).map(e => e.id);
    if (p.entregas.length > 0) {
      /* ⚠ TIPADO PELO MESMO MOTIVO DAS PARTES: num insert em lote o PostgREST usa a UNIÃO
         das chaves e manda NULL para o objeto que não tem a sua. Aqui as linhas saem todas de
         um `map` e já eram homogêneas — o tipo garante que continuem quando alguém acrescentar
         um campo condicional. */
      const linhas: EntregaPayload[] = p.entregas.map(e => ({
        cliente_id: clienteId,
        operacao_id: operacaoId,
        classe_aflatoxina: e.classe_aflatoxina,
        sacas: e.sacas,
        preco_saca: e.preco_saca,
        valor: e.valor,
        /* ⚠ NULO DE PROPÓSITO: a venda é por classe, e as sacas de uma classe vêm de várias
           cargas (dez na 23/24). Apontar para uma delas seria inventar o vínculo. E `null`
           aqui é legítimo — a coluna ACEITA nulo. */
        colheita_id: null,
      }));
      const { error } = await db.from('agri_oc_entregas').insert(linhas);
      if (error) return { ok: false, erro: `Entregas: ${error.message}` };
    }
    if (idsEntAntigas.length > 0) {
      const { error } = await db.from('agri_oc_entregas').delete().in('id', idsEntAntigas);
      if (error) {
        await queryClient.invalidateQueries({ queryKey: chave });
        return { ok: false, erro: `As entregas novas gravaram, mas as antigas não saíram (${error.message}). Confira as linhas duplicadas.` };
      }
    }

    /* ── PARTES ── */
    /**
     * ⚠ A PARTE DE RECEITA CARREGA O BRUTO, e a dedução é uma parte À PARTE. Decisão do
     * Gabriel em 13/09/2026, contra a alternativa de gravar o líquido: o resultado tem de
     * mostrar os TRÊS números — receita bruta, o que a cooperativa reteve e o que sobrou —, e
     * um líquido gravado de uma vez esconde para sempre o segundo. Quem lê o DRE não tem como
     * perguntar "quanto foi de Senar?" a um número que já veio abatido.
     *
     * ⚠ E O MOTOR LÊ AS DUAS. `agri_barter_materializar_contrato` varre TODAS as partes da OC e
     * decide o sinal pela natureza: `receita_venda` entra ('1' / 1-Entradas),
     * `imposto`/`desconto`/`frete` saem ('-1' / 2-Saídas). É o que faz o bruto aqui ser
     * correto — a dedução vira saída no DRE e o resultado fecha no líquido.
     * ⚠ QUEM MEXER NA NATUREZA MEXE NOS DOIS LADOS: gravar uma natureza que o laço não nomeia
     * faria a parte virar saída pelo `else`, que é o padrão seguro, mas com a descrição
     * genérica. As quatro conhecidas têm nome próprio na função (migration
     * 20260928120000_agri_barter_03d_materializar_imposto.sql).
     */
    /**
     * ⚠ AS DUAS PARTES TÊM A MESMA FORMA, e é isso que as faz caber num insert em lote. A
     * dedução não tem plano de contas próprio hoje — os quatro níveis vão `null`, e `null`
     * numa coluna que ACEITA nulo é a verdade ("não classificado"), não o problema. O problema
     * era a chave AUSENTE numa coluna NOT NULL.
     * ⚠ DENTRO DO TOTAL as duas: com a receita em bruto, a dedução é um componente VIVO da
     * operação, não um lembrete do que já foi abatido. Quem somar as partes soma por natureza —
     * receita positiva, imposto/desconto/frete negativos —, que é o sinal que o materializador
     * dá ao lançamento. Nada lê esta coluna hoje; ela fica declarando a intenção.
     */
    const novasPartes: PartePayload[] = [{
      cliente_id: clienteId, operacao_id: operacaoId,
      natureza: NATUREZA_RECEITA,
      descricao: `Venda ${p.cultura}`,
      valor: p.valor_bruto,
      plano_conta_id: p.receita.plano_conta_id,
      macro_custo: p.receita.macro_custo,
      grupo_custo: p.receita.grupo_custo,
      centro_custo: p.receita.centro_custo,
      subcentro: p.receita.subcentro,
      incluso_no_total: true,
    }];
    /* ⚠ PARTE DE VALOR ZERO NÃO SE GRAVA. Sem Senar, a linha de imposto não existe — uma parte
       de R$ 0,00 apareceria em toda leitura futura sem dizer nada, e o DRE ganharia um
       lançamento de zero no DRE, já que o materializador leva as deduções como saída. */
    if (p.deducao.valor > 0) {
      novasPartes.push({
        cliente_id: clienteId, operacao_id: operacaoId,
        natureza: NATUREZA_DEDUCAO,
        descricao: p.deducao.descricao,
        valor: p.deducao.valor,
        plano_conta_id: null,
        macro_custo: null,
        grupo_custo: null,
        centro_custo: null,
        subcentro: null,
        incluso_no_total: true,
      });
    }
    const { data: parAntigas } = await db.from('agri_oc_partes')
      .select('id').eq('operacao_id', operacaoId);
    const idsParAntigas = ((parAntigas ?? []) as Array<{ id: string }>).map(x => x.id);
    const { error: errPar } = await db.from('agri_oc_partes').insert(novasPartes);
    if (errPar) return { ok: false, erro: `Partes: ${errPar.message}` };
    if (idsParAntigas.length > 0) {
      const { error } = await db.from('agri_oc_partes').delete().in('id', idsParAntigas);
      if (error) {
        await queryClient.invalidateQueries({ queryKey: chave });
        return { ok: false, erro: `As partes novas gravaram, mas as antigas não saíram (${error.message}). Confira as linhas duplicadas.` };
      }
    }

    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true };
  };

  /**
   * ⚠ EXCLUSÃO LÓGICA no cabeçalho, FÍSICA nas filhas. A operação é documento — tem NF e
   * acerto da cooperativa atrás dela —, mas entrega e parte só existem em função dela: deixá-las
   * vivas apontando para uma venda inativa faria qualquer soma futura por `operacao_id` contar
   * o que já não vale.
   */
  const excluir = async (venda: BarterVenda): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const { error } = await db.from('agri_operacoes_comerciais')
      .update({ ativo: false, status_comercial: 'cancelado' }).eq('id', venda.id);
    if (error) return { ok: false, erro: error.message };
    await db.from('agri_oc_entregas').delete().eq('operacao_id', venda.id);
    await db.from('agri_oc_partes').delete().eq('operacao_id', venda.id);
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true };
  };

  const vendas = data ?? [];

  /**
   * O que o contrato ENTREGOU — a soma das receitas líquidas.
   *
   * ⚠ É O LÍQUIDO QUE FECHA O SALDO, não o bruto: o Senar fica com a cooperativa e nunca
   * chega ao produtor, então contá-lo como entregue inflaria o crédito dele no barter.
   */
  const totalEntregue = vendas.reduce((s, v) => s + (Number(v.valor_liquido) || 0), 0);

  /** Alguma venda já virou lançamento? Enquanto virar, não se edita. */
  const materializada = (v: BarterVenda) => v.partes.some(p => !!p.financeiro_lancamento_id);

  return {
    vendas, carregando: isLoading, salvar, excluir, totalEntregue, materializada,
  };
}
