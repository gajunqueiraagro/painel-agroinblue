/**
 * useValorEmProjecao — quais lançamentos de venda têm VALOR ainda provisório.
 *
 * PR-OC-VENDA-VALOR-A-VALIDAR-01.
 *
 * ⚠ DERIVADO DO FATO, SEM FLAG. Não há coluna "é projeção" e não deve haver: um valor é
 * projeção enquanto o boitel da operação tiver SOMENTE o cenário `projetado`. No dia em
 * que o realizado for gravado, a marca apaga sozinha — ninguém liga nem desliga, e não
 * existe estado a sincronizar.
 *
 * O caminho, verificado no banco:
 *     lancamentos.id
 *       -> zoo_operacao_movimentacoes.movimentacao_id
 *       -> operacao_id
 *       -> zoo_operacao_boitel.cenario
 *
 * ⚠ DUAS CONSULTAS EM LOTE, e nunca uma por linha: os ids da página visível vão juntos.
 * Uma lista de 200 vendas faria 400 idas ao servidor pelo caminho ingênuo.
 *
 * ⚠ A SAIDA CONTINUA REALIZADA. O gado saiu de verdade e o status não muda — a marca é
 * sobre o NÚMERO, não sobre o fato. Ver o comentário no ponto de uso.
 *
 * ⚠ NA DUVIDA, NAO MARCA. Falha de leitura devolve conjunto vazio: marcar por engano
 * diria "este valor é provisório" sobre dinheiro fechado, que é pior que não marcar.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useValorEmProjecao(lancamentoIds: string[]): Set<string> {
  const [emProjecao, setEmProjecao] = useState<Set<string>>(new Set());

  /* A chave estabiliza o efeito por CONTEUDO: a lista é recriada a cada render da tabela,
     e depender do array faria a consulta repetir para sempre. */
  const chave = lancamentoIds.slice().sort().join(',');

  useEffect(() => {
    const ids = chave ? chave.split(',') : [];
    if (ids.length === 0) { setEmProjecao(new Set()); return; }
    let cancelado = false;

    (async () => {
      try {
        // 1) dos lançamentos visíveis, quais pertencem a uma OC — e a qual.
        const { data: movs, error: e1 } = await (supabase as any)
          .from('zoo_operacao_movimentacoes')
          .select('movimentacao_id, operacao_id')
          .in('movimentacao_id', ids);
        if (e1) throw e1;
        if (cancelado) return;

        const porOperacao = new Map<string, string[]>();
        for (const m of (movs ?? []) as { movimentacao_id: string; operacao_id: string }[]) {
          const lista = porOperacao.get(m.operacao_id) ?? [];
          lista.push(m.movimentacao_id);
          porOperacao.set(m.operacao_id, lista);
        }
        if (porOperacao.size === 0) { setEmProjecao(new Set()); return; }

        // 2) dessas operações, quais têm planejamento de boitel e em que cenários.
        const { data: linhas, error: e2 } = await (supabase as any)
          .from('zoo_operacao_boitel')
          .select('operacao_id, cenario')
          .in('operacao_id', [...porOperacao.keys()]);
        if (e2) throw e2;
        if (cancelado) return;

        const cenarios = new Map<string, Set<string>>();
        for (const b of (linhas ?? []) as { operacao_id: string; cenario: string }[]) {
          const s = cenarios.get(b.operacao_id) ?? new Set<string>();
          s.add(b.cenario);
          cenarios.set(b.operacao_id, s);
        }

        const marcados = new Set<string>();
        for (const [operacaoId, lancIds] of porOperacao) {
          const s = cenarios.get(operacaoId);
          /* Sem boitel nenhum: não é projeção — é venda comum, valor acordado.
             Com o realizado gravado: deixou de ser projeção. */
          if (!s || s.size === 0 || s.has('realizado')) continue;
          for (const id of lancIds) marcados.add(id);
        }
        setEmProjecao(marcados);
      } catch {
        /* Silencioso e vazio: ver a nota do cabeçalho. Um erro de leitura não pode
           produzir marca, e também não deve interromper a lista. */
        if (!cancelado) setEmProjecao(new Set());
      }
    })();

    return () => { cancelado = true; };
  }, [chave]);

  return emProjecao;
}
