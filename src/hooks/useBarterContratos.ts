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
    await queryClient.invalidateQueries({ queryKey: chave });
    return { ok: true, abertura: (r ?? {}) as AberturaContrato };
  };

  return { contratos: data ?? [], carregando: isLoading, abrir };
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
