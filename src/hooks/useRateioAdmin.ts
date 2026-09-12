/**
 * A chave de rateio administrativo por ano — AGRI-RATEIO-TELA-01.
 *
 * ⚠ TABELA FORA DO `types.ts` (migration AGRI-04A, posterior ao regen): mesmo idioma dos
 * vizinhos — `supabase as any` no builder, resultado convertido no ato.
 * ⚠ O HOOK CARREGA DUAS COISAS: a chave do ano aberto e a LISTA DE ANOS que já têm chave. A
 * segunda é o que permite o card dizer quais anos estão preenchidos sem clicar em cada um.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AtividadeRateio } from '@/lib/agri/rateioAdmin';

export interface RateioAdminRow {
  id: string;
  ano: number;
  atividade: AtividadeRateio;
  percentual: number;
}

export function useRateioAdmin(clienteId: string | null | undefined, ano: number) {
  const [linhas, setLinhas] = useState<RateioAdminRow[]>([]);
  const [anosComChave, setAnosComChave] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(false);
  /**
   * ⚠ A QUE CARGA AS LINHAS PERTENCEM — AGRI-RATEIO-SAVE-01.
   *
   * Sem isto a tela não distingue "o ano 2026 tem chave vazia" de "as linhas ainda são do ano
   * anterior". Era metade do defeito: ao trocar de ano existe um render com os dados velhos e
   * `carregando` ainda falso, e quem hidratar o formulário nesse instante escreve o ano errado
   * em cima do que o operador está vendo.
   */
  const [chaveCarregada, setChaveCarregada] = useState('');

  const carregarAnos = useCallback(async () => {
    if (!clienteId) { setAnosComChave([]); return; }
    const db = supabase as any;
    const { data } = await db.from('agri_rateio_admin')
      .select('ano')
      .eq('cliente_id', clienteId);
    setAnosComChave([...new Set(((data ?? []) as Array<{ ano: number }>).map(r => r.ano))]);
  }, [clienteId]);

  const carregar = useCallback(async () => {
    if (!clienteId) { setLinhas([]); return; }
    setCarregando(true);
    const db = supabase as any;
    const { data } = await db.from('agri_rateio_admin')
      .select('id, ano, atividade, percentual')
      .eq('cliente_id', clienteId)
      .eq('ano', ano);
    setLinhas((data as RateioAdminRow[]) ?? []);
    setChaveCarregada(`${clienteId}|${ano}`);
    setCarregando(false);
  }, [clienteId, ano]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarAnos(); }, [carregarAnos]);

  /**
   * Grava as três linhas do ano — AGRI-RATEIO-SAVE-01.
   *
   * ⚠ AS TRÊS SEMPRE, inclusive as de percentual zero: a chave é o conjunto, e uma atividade
   * ausente da tabela é ambígua — ninguém sabe se é zero declarado ou linha que faltou gravar.
   *
   * ⚠ ESTA FUNÇÃO JÁ FALHOU CALADA UMA VEZ, e a reescrita é toda sobre isso. A versão
   * anterior decidia entre UPDATE e INSERT olhando `linhas` — o estado CAPTURADO no closure.
   * Se ele estivesse vazio quando não devia (a carga ainda em voo, um render antigo, o
   * `useCallback` de uma dependência anterior), o INSERT batia na UNIQUE
   * (cliente_id, ano, atividade) e voltava 23505. O erro subia, sim — mas por um toast que
   * dura três segundos, e quem já foi conferir o resultado não o vê. Resultado medido: a
   * tabela ficou VAZIA depois de um "Salvar" que pareceu dar certo.
   *
   * ⚠ TRÊS MUDANÇAS, E CADA UMA MATA UMA FORMA DE FALHAR:
   *   1. `upsert` com `onConflict` EXPLÍCITO — o banco decide inserir ou atualizar pela
   *      UNIQUE, e o estado local deixa de participar da decisão. Sem `onConflict` nomeado o
   *      PostgREST não sabe qual restrição usar; com ele, a operação é idempotente.
   *   2. `.select()` DEPOIS DA ESCRITA — sem linha devolvida, NÃO houve gravação, mesmo sem
   *      `error`. É o idioma que o cadastro de Safras já usa ("sem evidência de linha afetada
   *      → não mostrar sucesso falso"), e é o que pega a falha silenciosa de verdade.
   *   3. UMA CHAMADA PARA AS TRÊS LINHAS, não três chamadas em fila: um erro no meio do laço
   *      deixava a chave pela metade — 70% gravado, 25% e 5% não —, e uma chave parcial é
   *      pior que nenhuma, porque soma 70 e parece deliberada.
   */
  const salvar = useCallback(async (
    valores: Array<{ atividade: AtividadeRateio; percentual: number }>,
  ): Promise<{ ok: boolean; erro?: string }> => {
    if (!clienteId) return { ok: false, erro: 'Sem cliente selecionado.' };
    const db = supabase as any;
    const linhasParaGravar = valores.map(v => ({
      cliente_id: clienteId,
      ano,
      atividade: v.atividade,
      percentual: v.percentual,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await db.from('agri_rateio_admin')
      .upsert(linhasParaGravar, { onConflict: 'cliente_id,ano,atividade' })
      .select('id');

    /**
     * ⚠ O DIAGNÓSTICO INTEIRO, NÃO SÓ A MENSAGEM. `error.message` do PostgREST às vezes é
     * genérico ("new row violates row-level security policy") e quem resolve é o `code`
     * (23505 da UNIQUE, 42501 do RLS, PGRST205 de tabela fora do cache do schema). Sem o
     * código, o próximo relato de falha volta a dizer só "não salvou" — que foi exatamente
     * onde este bug empacou.
     */
    if (error) {
      const partes = [error.code, error.message, error.details, error.hint].filter(Boolean);
      return { ok: false, erro: partes.join(' · ') || 'Erro desconhecido do banco.' };
    }
    /* ⚠ SEM LINHA DEVOLVIDA NÃO HOUVE GRAVAÇÃO, mesmo sem `error` — e é o caso que o operador
       leu como sucesso. A contagem entra na mensagem porque "confirmou 2 de 3" e "confirmou 0
       de 3" são defeitos diferentes, e adivinhar qual foi custa outro dia. */
    if (!data || data.length < linhasParaGravar.length) {
      return {
        ok: false,
        erro: `O banco confirmou ${data?.length ?? 0} de ${linhasParaGravar.length} linhas. Nada foi dado como salvo.`,
      };
    }
    await carregar();
    await carregarAnos();
    return { ok: true };
  }, [clienteId, ano, carregar, carregarAnos]);

  return { linhas, anosComChave, carregando, chaveCarregada, salvar };
}
