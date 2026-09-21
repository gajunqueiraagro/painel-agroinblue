/**
 * As cargas de colheita de uma área plantada — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ A CHAVE É A ÁREA, NÃO O PASTO NEM O MÊS: `agri_colheita.safra_area_id` aponta para
 * `agri_safra_area`, então a carga pertence ao talhão daquela cultura naquela safra. Um pasto
 * com amendoim e milho tem duas listas — o seco de um não se soma ao do outro.
 * ⚠ UMA CARGA POR VEZ, NÃO EM LOTE. O romaneio chega avulso e se lança avulso; salvar a lista
 * inteira obrigaria a apagar e reinserir o que não mudou, e um erro no meio deixaria metade
 * gravada. Aqui cada gesto é uma linha: grava, devolve erro se falhar, recarrega.
 * ⚠ TABELA FORA DO `types.ts` (migration posterior ao regen): vale o idioma já usado em
 * `useAreaPlantada` — `supabase as any` no builder, resultado convertido no ato.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CargaPayload } from '@/lib/agri/colheita';

export interface ColheitaRow {
  id: string;
  safra_area_id: string;
  data_colheita: string;
  hora_chegada: string | null;
  /**
   * ⚠ DUAS COLUNAS DE PESO, E CADA MODELO COMERCIAL USA A SUA — PR-CARGA-MANDIOCA-PESO-P0-01.
   * `peso_fazenda_kg` é o peso de SAÍDA da saca estocável (amendoim): é ele que o `CargaModal`
   * grava e é dele que nascem as quebras de transporte e de secagem.
   * `peso_bruto_kg` é o peso da balança da ENTREGA DIRETA (mandioca): quem grava é a RPC
   * `agri_carga_mandioca_registrar`, e é dele que saem `peso_liquido_kg` e `toneladas`.
   * ⚠ ELAS NÃO SE SUBSTITUEM. Medido no proto: as 42 colheitas de mandioca têm as 42 com
   * `peso_bruto_kg` e ZERO com `peso_fazenda_kg`. Ler uma no lugar da outra devolve vazio — que
   * foi exatamente o defeito que este campo veio consertar.
   */
  peso_fazenda_kg: number | null;
  peso_bruto_kg: number | null;
  ticket_balanca: string | null;
  nf_produtor: string | null;
  filial: string | null;
  /** EL-02: NOT NULL no banco; a carga sempre tem um local. */
  local_estoque_id: string | null;
  peso_verde_kg: number | null;
  peso_seco_kg: number | null;
  umidade_pct: number | null;
  aflatoxina_ppb: number | null;
  sacas_boas: number | null;
  grao_roca_sacas: number | null;
  grao_roca_kg: number | null;
  renda_liquida_pct: number | null;
  taxa_secagem: number | null;
  valor_secagem: number | null;
  observacoes: string | null;
  /* ─────────── ENTREGA DIRETA (mandioca) — nulos na saca estocável ───────────
   * ⚠ ELES CONVIVEM NA MESMA TABELA, e é de propósito: uma carga é uma carga, e o que muda é o
   * MODELO COMERCIAL da cultura, não a entidade. `toneladas` preenchida é o que distingue —
   * `fn_dre_lavoura` e `fn_painel_safra` leem exatamente assim (`coalesce(toneladas, sacas…)`). */
  toneladas: number | null;
  desconto_kg: number | null;
  rendimento_g: number | null;
  preco_g: number | null;
  industria_id: string | null;
}

/**
 * O lançamento de VENDA de uma carga — o elo que a RPC gravou.
 *
 * ⚠ É POR `papel`, NUNCA POR DESCRIÇÃO. `agri_colheita_lancamentos` separa venda de ICMS, de
 * Funrural e dos três serviços; casar por texto quebraria no dia em que a frase mudasse.
 * ⚠ E SÓ O ATIVO: corrigir uma carga desativa o vínculo antigo e cria o novo. Ler os dois daria
 * dois valores para a mesma carga.
 */
export interface VendaDaCarga {
  lancamento_id: string;
  valor: number | null;
  status: string | null;
}

/* ⚠ `peso_bruto_kg` ENTROU AQUI JUNTO COM O CAMPO — PR-CARGA-MANDIOCA-PESO-P0-01, e a ordem
   importa: sem a coluna no `select`, trocar a leitura na tela não adiantaria nada. O `COLS` é a
   fronteira real do que a tela pode ler. */
const COLS = 'id, safra_area_id, data_colheita, hora_chegada, peso_fazenda_kg, peso_bruto_kg,'
  + ' ticket_balanca, nf_produtor, filial, local_estoque_id,'
  + ' peso_verde_kg, peso_seco_kg, umidade_pct, aflatoxina_ppb, sacas_boas,'
  + ' grao_roca_sacas, grao_roca_kg, renda_liquida_pct, taxa_secagem, valor_secagem,'
  + ' observacoes, toneladas, desconto_kg, rendimento_g, preco_g, industria_id';

export function useColheita(safraAreaIds: readonly string[]) {
  const [linhas, setLinhas] = useState<ColheitaRow[]>([]);
  const [vendaPorCarga, setVendaPorCarga] = useState<Map<string, VendaDaCarga>>(new Map());
  const [industriaPorId, setIndustriaPorId] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(false);
  /* Mesma chave estável de `useAreasPorPastoNaJanela`: o array muda de identidade a cada
     render do painel, e recarregar por isso piscaria a lista. */
  const chave = [...safraAreaIds].sort().join(',');

  const carregar = useCallback(async () => {
    if (!chave) { setLinhas([]); return; }
    setCarregando(true);
    const db = supabase as any;
    const { data } = await db.from('agri_colheita')
      .select(COLS)
      .in('safra_area_id', chave.split(','))
      .eq('ativo', true)
      .order('data_colheita', { ascending: true });
    const rows = (data as ColheitaRow[]) ?? [];
    setLinhas(rows);

    /**
     * O VALOR E O STATUS DA CARGA — duas consultas, e nenhuma soma.
     *
     * ⚠ DUAS EM VEZ DE UM EMBED: o `select` aninhado do PostgREST depende da relação estar no
     * `types.ts` gerado, e `agri_colheita_lancamentos` nasceu depois da última geração — o embed
     * resolveria para `SelectQueryError` e o TS não acusaria, porque o builder é `as any`. Duas
     * leituras simples respondem o mesmo e falham alto.
     * ⚠ SÓ PARA CARGA DE ENTREGA DIRETA: sem `toneladas` não há RPC, não há vínculo, e as duas
     * consultas nem saem. O amendoim continua com o custo de antes.
     */
    const idsEntrega = rows.filter(r => r.toneladas != null).map(r => r.id);
    if (idsEntrega.length === 0) {
      setVendaPorCarga(new Map());
      setIndustriaPorId(new Map());
      setCarregando(false);
      return;
    }
    const { data: elos } = await db.from('agri_colheita_lancamentos')
      .select('colheita_id, lancamento_id')
      .in('colheita_id', idsEntrega)
      .eq('papel', 'venda')
      .eq('ativo', true);
    const pares = (elos ?? []) as Array<{ colheita_id: string; lancamento_id: string }>;
    const mapa = new Map<string, VendaDaCarga>();
    if (pares.length > 0) {
      const { data: lancs } = await db.from('financeiro_lancamentos_v2')
        .select('id, valor, status_transacao')
        .in('id', pares.map(p => p.lancamento_id));
      const porId = new Map<string, { valor: number | null; status: string | null }>();
      for (const l of (lancs ?? []) as Array<{ id: string; valor: number | null; status_transacao: string | null }>) {
        porId.set(l.id, { valor: l.valor, status: l.status_transacao });
      }
      for (const p of pares) {
        const l = porId.get(p.lancamento_id);
        mapa.set(p.colheita_id, {
          lancamento_id: p.lancamento_id, valor: l?.valor ?? null, status: l?.status ?? null,
        });
      }
    }
    setVendaPorCarga(mapa);

    /* ⚠ O NOME DA INDÚSTRIA VEM DE UMA CONSULTA PRÓPRIA pelo mesmo motivo do embed acima. */
    const idsInd = Array.from(new Set(rows.map(r => r.industria_id).filter((x): x is string => !!x)));
    if (idsInd.length > 0) {
      const { data: forns } = await db.from('financeiro_fornecedores')
        .select('id, nome, nome_favorecido').in('id', idsInd);
      const mf = new Map<string, string>();
      for (const f of (forns ?? []) as Array<{ id: string; nome: string | null; nome_favorecido: string | null }>) {
        mf.set(f.id, f.nome_favorecido || f.nome || '—');
      }
      setIndustriaPorId(mf);
    } else {
      setIndustriaPorId(new Map());
    }
    setCarregando(false);
  }, [chave]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Grava UMA carga — insere quando `id` é nulo, atualiza quando não é.
   *
   * ⚠ O `safra_area_id` VAI NO UPDATE TAMBÉM, e não só no insert. Até o
   * PR-TALHAO-NO-MODAL-12 o talhão era o contexto da tela e nunca mudava numa edição; agora
   * ele é campo do modal, e sem esta linha mover a carga de talhão diria "Carga atualizada" e
   * não moveria nada — o pior defeito que esta tela pode ter, porque o operador não tem como
   * desconfiar. Reinserir o mesmo valor quando não mudou é inofensivo.
   */
  const salvarCarga = useCallback(async (
    safraAreaId: string,
    id: string | null,
    payload: CargaPayload,
    clienteId: string,
  ): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const { error } = id
      ? await db.from('agri_colheita').update({ ...payload, safra_area_id: safraAreaId }).eq('id', id)
      : await db.from('agri_colheita')
        .insert({ ...payload, cliente_id: clienteId, safra_area_id: safraAreaId });
    /* ⚠ O ERRO DO BANCO VAI INTEIRO PARA A TELA. "Não foi possível salvar" sozinho manda o
       operador adivinhar; a mensagem do PostgREST diz qual coluna recusou. */
    if (error) return { ok: false, erro: error.message };
    await carregar();
    return { ok: true };
  }, [carregar]);

  /**
   * ⚠ EXCLUSÃO É LÓGICA, não `delete`: `ativo = false`. A carga é documento — ticket de
   * balança e nota do produtor existem no papel da cooperativa, e apagar a linha do banco
   * tiraria do sistema o que continua existindo no arquivo do produtor.
   */
  const excluirCarga = useCallback(async (id: string): Promise<{ ok: boolean; erro?: string }> => {
    const db = supabase as any;
    const { error } = await db.from('agri_colheita').update({ ativo: false }).eq('id', id);
    if (error) return { ok: false, erro: error.message };
    await carregar();
    return { ok: true };
  }, [carregar]);

  return { linhas, vendaPorCarga, industriaPorId, carregando, carregar, salvarCarga, excluirCarga };
}
