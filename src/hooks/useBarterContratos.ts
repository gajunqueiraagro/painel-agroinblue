/**
 * OS CONTRATOS DE BARTER DO CLIENTE — PR-AGRI-BARTER-TELA-A.
 *
 * ⚠ ABRIR CONTRATO É RPC, NÃO INSERT. `agri_barter_abrir_contrato` cria a conta de permuta do
 * parceiro (ou reusa a que existe) e grava o contrato já ligado a ela, na mesma transação.
 * Inserir direto na tabela pela tela criaria contrato sem conta — e contrato sem conta não
 * materializa, o que só se descobriria na hora de levar o barter ao DRE.
 * ⚠ TABELAS FORA DO `types.ts` (migrations posteriores ao último regen): vale o idioma da
 * casa — `(supabase as any)` no builder, resultado convertido no ato.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BarterContrato {
  id: string;
  nome: string;
  descricao: string | null;
  status: string;
  /**
   * A CULTURA DO BARTER — AGRI-BARTER-04.
   *
   * ⚠ O CONTRATO DECLARA A CULTURA PORQUE O INSUMO NÃO SABE. A venda diz "amendoim"; a semente
   * e o adubo chegam sem dizer para que lavoura vão, e sem esta coluna os 26 lançamentos de
   * insumo caíam em "Não apropriado" no DRE por cultura, com a receita sozinha do outro lado.
   * ⚠ E NÃO É A SAFRA VOLTANDO PELA PORTA DOS FUNDOS: o contrato continua sem safra, porque ele
   * atravessa safras. Cultura e safra são perguntas diferentes — o barter é de amendoim do
   * começo ao fim, mas o insumo entra numa safra e o grão sai na seguinte.
   */
  cultura: string | null;
  data_abertura: string;
  parceiro_fornecedor_id: string;
  conta_permuta_id: string | null;
  fazenda_id: string | null;
}

/** O contrato com o que a lista precisa mostrar — nomes, nunca ids. */
export interface ContratoNaLista extends BarterContrato {
  parceiroNome: string;
  contaPermutaNome: string | null;
}

export interface AberturaContrato {
  ok: boolean;
  contrato_id?: string;
  conta_permuta_id?: string;
  /** `true` só quando a conta NASCEU agora; `false` quando a do parceiro foi reusada. */
  conta_criada?: boolean;
}

const COLS = 'id, nome, descricao, status, cultura, data_abertura, parceiro_fornecedor_id,'
  + ' conta_permuta_id, fazenda_id';

export function useBarterContratos(clienteId: string | null | undefined) {
  const queryClient = useQueryClient();
  const chave = ['barter-contratos', clienteId ?? ''];

  const { data, isLoading } = useQuery({
    queryKey: chave,
    enabled: !!clienteId,
    queryFn: async (): Promise<ContratoNaLista[]> => {
      const db = supabase as any;
      const { data: linhas, error } = await db.from('agri_barter_contratos')
        .select(COLS)
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      const contratos = (linhas ?? []) as BarterContrato[];

      /* ⚠ DOIS LOOKUPS, NÃO UM JOIN ANINHADO: o `select` com relação do PostgREST depende do
         `types.ts`, que não conhece `agri_barter_contratos` — viria `SelectQueryError` e o nome
         sairia mudo em runtime, sem erro. É o mesmo impasse já resolvido assim em
         `useTalhoesDaSafra`. */
      const fornIds = Array.from(new Set(contratos.map(c => c.parceiro_fornecedor_id).filter(Boolean)));
      const contaIds = Array.from(new Set(contratos.map(c => c.conta_permuta_id).filter(Boolean)));
      const forn = new Map<string, string>();
      const contas = new Map<string, string>();
      if (fornIds.length > 0) {
        const { data: fs } = await db.from('financeiro_fornecedores').select('id, nome').in('id', fornIds);
        for (const f of (fs ?? []) as Array<{ id: string; nome: string }>) forn.set(f.id, f.nome);
      }
      if (contaIds.length > 0) {
        const { data: cs } = await db.from('financeiro_contas_bancarias')
          .select('id, nome_exibicao').in('id', contaIds);
        for (const c of (cs ?? []) as Array<{ id: string; nome_exibicao: string | null }>) {
          contas.set(c.id, c.nome_exibicao ?? '');
        }
      }
      return contratos.map(c => ({
        ...c,
        parceiroNome: forn.get(c.parceiro_fornecedor_id) ?? '—',
        contaPermutaNome: c.conta_permuta_id ? (contas.get(c.conta_permuta_id) ?? null) : null,
      }));
    },
  });

  /**
   * Abre o contrato pela RPC.
   *
   * ⚠ O ERRO DO BANCO CHEGA INTEIRO À TELA. As guardas da função falam em português
   * ("Sem usuario autenticado", "Fornecedor % nao encontrado"), e traduzi-las aqui só
   * acrescentaria uma segunda mensagem para manter em dia.
   */
  const abrir = async (
    parceiroFornecedorId: string, nome: string,
    fazendaId: string | null, descricao: string | null, cultura: string | null,
    dataAbertura: string | null,
  ): Promise<{ ok: boolean; erro?: string; abertura?: AberturaContrato }> => {
    /**
     * ⚠ A CULTURA VAI NA PRÓPRIA RPC — AGRI-BARTER-04. Ela ganhou um 5º parâmetro
     * `p_cultura` e grava na mesma transação que cria a conta de permuta e o contrato. Um
     * `update` depois, que foi como isto nasceu, abria a janela de o contrato existir sem
     * cultura caso a segunda viagem falhasse — e contrato sem cultura é o insumo caindo em
     * "Não apropriado" no DRE.
     * ⚠ E A ASSINATURA DE QUATRO FOI DROPADA no banco: chamar com quatro argumentos nomeados
     * hoje não acha função nenhuma. Por isso a cultura não é opcional aqui.
     */
    const { data: r, error } = await (supabase as any).rpc('agri_barter_abrir_contrato', {
      p_parceiro_fornecedor_id: parceiroFornecedorId,
      p_nome: nome,
      p_fazenda_id: fazendaId,
      p_descricao: descricao,
      p_cultura: cultura,
    });
    if (error) return { ok: false, erro: error.message };
    const abertura = (r ?? {}) as AberturaContrato;

    /**
     * ⚠ A DATA VAI NUM UPDATE, e não pela RPC — item 4 do polish. `agri_barter_abrir_contrato`
     * tem cinco parâmetros e nenhum é a data; a coluna `data_abertura` tem default
     * `CURRENT_DATE`, e por isso todo contrato nascia com a data de HOJE. Um barter assinado em
     * abril lançado em setembro ficava com setembro, e é a data de abertura que ancora a
     * competência do insumo sem `data_recebimento`.
     * ⚠ SÓ ATUALIZA QUANDO O OPERADOR MUDOU: mandar a data de hoje explicitamente seria
     * reescrever o default com o mesmo valor e gastar uma viagem para nada.
     * ⚠ E FALHAR AQUI NÃO PERDE O CONTRATO: ele já existe, com a conta de permuta. O retorno é
     * `ok` com um aviso, como na cultura antes de ela ir para a RPC — dizer "não foi possível
     * abrir" sobre um contrato aberto faria o operador criar o segundo.
     */
    if (dataAbertura && abertura.contrato_id) {
      const { error: errData } = await (supabase as any).from('agri_barter_contratos')
        .update({ data_abertura: dataAbertura }).eq('id', abertura.contrato_id);
      if (errData) {
        await queryClient.invalidateQueries({ queryKey: chave });
        return {
          ok: true, abertura,
          erro: `O contrato foi aberto, mas a data não gravou (${errData.message}). Ele ficou com a data de hoje.`,
        };
      }
    }
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true, abertura };
  };

  /**
   * EDITA UM CONTRATO EXISTENTE — item 1b do RESUMO-2.
   *
   * ⚠ NÃO HÁ RPC DE UPDATE, e medi antes de escrever: `pg_proc` tem três funções
   * `agri_barter_*` — abrir, materializar e estornar. O update vai direto na tabela, que é o
   * que as policies permitem (as quatro são abertas).
   * ⚠ A CULTURA FICA DE FORA DE PROPÓSITO. Ela já foi para os 28 lançamentos materializados;
   * trocá-la aqui deixaria o contrato dizendo "milho" e o DRE mostrando amendoim, sem nada
   * reconciliar os dois. Mudar cultura de contrato materializado é frente própria.
   * ⚠ E A DATA É O MOTIVO DE ISTO EXISTIR: o 23/24 nasceu com 13/09/2026 porque a coluna tem
   * `default CURRENT_DATE` e a RPC não recebe data. Sem edição, o único conserto seria SQL.
   */
  const editar = async (
    id: string,
    dados: { nome: string; descricao: string | null; data_abertura: string; fazenda_id: string },
  ): Promise<{ ok: boolean; erro?: string }> => {
    const { error } = await (supabase as any).from('agri_barter_contratos')
      .update(dados).eq('id', id);
    if (error) return { ok: false, erro: error.message };
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true };
  };

  return { contratos: data ?? [], carregando: isLoading, abrir, editar };
}

/*
 * ⚠ AQUI MORAVA `useFornecedoresDoCliente`, e ele saiu porque ESTAVA ERRADO — não porque
 * ficou sem uso. Lia `financeiro_fornecedores` sem `.eq('ativo', true)` e sem teto, e o
 * dropdown do modal despejava a lista inteira: 3.390 linhas no maior cliente do Proto, 838
 * delas inativas (medido em 13/09/2026). O parceiro do barter agora sai do `FornecedorSelect`
 * compartilhado, que filtra ativo e busca no servidor.
 * ⚠ E A LIÇÃO É A REGRA QUE FOI QUEBRADA: seletor de entidade se REUSA, não se escreve. Uma
 * segunda leitura de fornecedores era, por construção, uma segunda definição de "quem pode
 * ser parceiro" — e a que esquece o `ativo` é a que chega na tela do operador.
 */

/**
 * OS TOTAIS DE CADA CONTRATO, PARA A LISTA — item 2 do RESUMO-2.
 *
 * ⚠ DUAS CONSULTAS PARA TODOS OS CONTRATOS, não duas POR contrato. Reusar `useBarterInsumos` e
 * `useBarterVenda` numa lista de N linhas faria 2N viagens ao banco — o N+1 clássico, que só
 * aparece quando o cliente tem vinte contratos e a tela demora sem motivo visível.
 * ⚠ O ENTREGUE É O LÍQUIDO, como no detalhe: o Senar fica com a cooperativa e nunca chega ao
 * produtor. Se a lista somasse o bruto, o saldo dela discordaria do saldo do contrato aberto —
 * duas respostas para a mesma pergunta, a um clique de distância.
 */
export interface TotaisContrato {
  recebido: number;
  entregue: number;
  saldo: number;
}

export function useTotaisPorContrato(clienteId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['barter-totais-contratos', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async (): Promise<Map<string, TotaisContrato>> => {
      const db = supabase as any;
      const [{ data: ins }, { data: ops }] = await Promise.all([
        db.from('agri_oc_insumos').select('contrato_barter_id, valor')
          .eq('cliente_id', clienteId).eq('ativo', true),
        db.from('agri_operacoes_comerciais').select('contrato_barter_id, valor_liquido')
          .eq('cliente_id', clienteId).eq('ativo', true),
      ]);
      const mapa = new Map<string, TotaisContrato>();
      const pega = (id: string) => {
        const a = mapa.get(id) ?? { recebido: 0, entregue: 0, saldo: 0 };
        mapa.set(id, a);
        return a;
      };
      for (const i of (ins ?? []) as Array<{ contrato_barter_id: string; valor: number }>) {
        if (i.contrato_barter_id) pega(i.contrato_barter_id).recebido += Number(i.valor) || 0;
      }
      for (const o of (ops ?? []) as Array<{ contrato_barter_id: string | null; valor_liquido: number | null }>) {
        if (o.contrato_barter_id) pega(o.contrato_barter_id).entregue += Number(o.valor_liquido) || 0;
      }
      for (const t of mapa.values()) t.saldo = t.entregue - t.recebido;
      return mapa;
    },
  });
  return data ?? new Map<string, TotaisContrato>();
}
