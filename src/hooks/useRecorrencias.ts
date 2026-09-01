import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

/**
 * useRecorrencias — as regras de repetição e o que elas já produziram.
 * FIN-RECORRENCIA-01, Tempo 1.
 *
 * ⚠ A ÂNCORA SÃO DUAS DATAS, E NÃO HÁ CAMPO DE DESLOCAMENTO. `data_inicio` é a
 * competência do primeiro lançamento e `primeiro_vencimento` é o vencimento real
 * dele; a distância entre as duas é o que a geração preserva mês a mês. Uma
 * terceira cópia — um `offset_meses` gravado — poderia discordar das duas, e
 * seria o segundo lugar onde a mesma verdade mora.
 *
 * ⚠ O ESTADO É DERIVADO, NUNCA COLUNA. `proximaCompetencia` sai da marca d'água,
 * `situacao` sai de `ativo` mais a comparação da marca com `data_fim`, e
 * `gerados` é contagem. Gravá-los criaria três campos que envelhecem sozinhos —
 * exatamente o que esta casa já caçou cinco vezes nesta frente.
 */

export type SituacaoRecorrencia = 'ativa' | 'concluida' | 'cancelada';

export interface Recorrencia {
  id: string;
  descricao: string;
  favorecidoId: string | null;
  favorecidoNome: string | null;
  contaBancariaId: string;
  subcentro: string;
  safraId: string | null;
  formaPagamento: string | null;
  observacao: string | null;
  valorBase: number;
  tipoOperacao: string | null;
  diaVencimento: number;
  dataInicio: string;
  primeiroVencimento: string;
  dataFim: string;
  ativo: boolean;
  ultimoLancamentoGerado: string | null;
  fazendaId: string;
  /** Derivados — leitura, não coluna. */
  proximaCompetencia: string | null;
  situacao: SituacaoRecorrencia;
  gerados: number;
}

/**
 * ⚠ O DESLOCAMENTO É LIDO, NÃO GRAVADO — a mesma conta que a RPC faz, para a
 * tela poder narrar o que vai acontecer. Meses inteiros entre os dois meses das
 * datas âncora; negativo é válido e significa pagamento adiantado.
 */
export function deslocamentoMeses(dataInicio: string, primeiroVencimento: string): number {
  const [ai, mi] = dataInicio.slice(0, 7).split('-').map(Number);
  const [av, mv] = primeiroVencimento.slice(0, 7).split('-').map(Number);
  return (av - ai) * 12 + (mv - mi);
}

const MES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * O RESUMO VIVO — a explicação do deslocamento em português.
 *
 * ⚠ ELE É A ÚNICA EXPLICAÇÃO QUE O OPERADOR RECEBE, e por isso existe: sem campo
 * de offset na tela, a relação entre as três datas fica implícita. A frase a
 * torna explícita ANTES de gravar — "consumo de setembro, pago em 10 de outubro;
 * repete até fev/27" — e quem lê confere a intenção, não a mecânica.
 */
export function resumoVivo(
  dataInicio: string, primeiroVencimento: string, dataFim: string, diaVencimento: number,
): string | null {
  if (!dataInicio || !primeiroVencimento || !dataFim) return null;
  const [, mi] = dataInicio.slice(0, 7).split('-').map(Number);
  const desl = deslocamentoMeses(dataInicio, primeiroVencimento);
  const [af, mf] = dataFim.slice(0, 7).split('-').map(Number);
  const consumo = MES_EXT[mi - 1];
  const pago = desl === 0
    ? `pago em ${diaVencimento} do mesmo mês`
    : desl === 1
      ? `pago em ${diaVencimento} do mês seguinte`
      : desl > 1
        ? `pago em ${diaVencimento}, ${desl} meses depois`
        : `pago em ${diaVencimento}, ${Math.abs(desl)} ${Math.abs(desl) === 1 ? 'mês' : 'meses'} antes`;
  return `Consumo de ${consumo}, ${pago}; repete até ${MES_CURTO[mf - 1]}/${String(af).slice(2)}.`;
}

/** A próxima competência: o mês seguinte à marca d'água, ou o início se nunca gerou. */
function proximaDaMarca(ultimo: string | null, dataInicio: string, dataFim: string): string | null {
  if (!ultimo) return dataInicio.slice(0, 7) + '-01';
  const [a, m] = ultimo.slice(0, 7).split('-').map(Number);
  const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  /* Passou do fim: não há próxima — a regra cumpriu o que prometeu. */
  return prox.slice(0, 7) > dataFim.slice(0, 7) ? null : prox;
}

export function useRecorrencias() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) { setRecorrencias([]); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('financeiro_recorrencias')
        .select('*, financeiro_fornecedores(nome)')
        .eq('cliente_id', clienteId)
        .order('descricao');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas cruas, fora de types.ts
      const rows: any[] = data ?? [];
      if (rows.length === 0) { setRecorrencias([]); return; }

      /* ⚠ UMA CONSULTA PARA O CONJUNTO, nunca uma por regra: a contagem do que
         cada uma gerou vem em lote pelos ids já carregados. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: gerados } = await (supabase as any)
        .from('financeiro_lancamentos_v2')
        .select('recorrencia_id')
        .in('recorrencia_id', rows.map(r => r.id))
        .eq('cancelado', false);
      const porRegra: Record<string, number> = {};
      for (const g of (gerados ?? []) as { recorrencia_id: string }[]) {
        porRegra[g.recorrencia_id] = (porRegra[g.recorrencia_id] ?? 0) + 1;
      }

      setRecorrencias(rows.map(r => {
        const prox = proximaDaMarca(r.ultimo_lancamento_gerado, r.data_inicio, r.data_fim);
        /* ⚠ CANCELADA VENCE CONCLUÍDA: uma regra desligada no meio do caminho não
           é uma regra que terminou o trabalho, e o operador precisa ver a
           diferença. */
        const situacao: SituacaoRecorrencia =
          !r.ativo ? 'cancelada' : prox === null ? 'concluida' : 'ativa';
        return {
          id: r.id,
          descricao: r.descricao,
          favorecidoId: r.favorecido_id ?? null,
          favorecidoNome: r.financeiro_fornecedores?.nome ?? null,
          contaBancariaId: r.conta_bancaria_id,
          subcentro: r.subcentro,
          safraId: r.safra_id ?? null,
          formaPagamento: r.forma_pagamento ?? null,
          observacao: r.observacao ?? null,
          valorBase: Number(r.valor_base ?? 0),
          tipoOperacao: r.tipo_operacao ?? null,
          diaVencimento: Number(r.dia_vencimento ?? 1),
          dataInicio: r.data_inicio,
          primeiroVencimento: r.primeiro_vencimento,
          dataFim: r.data_fim,
          ativo: r.ativo === true,
          ultimoLancamentoGerado: r.ultimo_lancamento_gerado ?? null,
          fazendaId: r.fazenda_id,
          proximaCompetencia: prox,
          situacao,
          gerados: porRegra[r.id] ?? 0,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { recorrencias, loading, recarregar: carregar, clienteId };
}

/**
 * PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA — só `p_simular` muda.
 *
 * ⚠ E é o ponto: uma prévia que responde por um caminho e grava por outro pode
 * prometer N e entregar M. Aqui a pergunta é literalmente a mesma; a diferença é
 * se o banco confirma a transação.
 */
export async function gerarRecorrencia(
  recorrenciaId: string, ate: string | null, simular: boolean,
): Promise<{ ok: boolean; gerados: number; de: string | null; ate: string | null; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_recorrencia_gerar', {
    p_recorrencia_id: recorrenciaId,
    p_ate: ate,
    p_simular: simular,
  });
  if (error) return { ok: false, gerados: 0, de: null, ate: null, erro: error.message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb da RPC
  const r: any = data ?? {};
  return { ok: r.ok !== false, gerados: Number(r.gerados ?? 0), de: r.de ?? null, ate: r.ate ?? null, erro: null };
}

/** Cancelar é `ativo = false` — e NÃO apaga o que já foi gerado. */
export async function cancelarRecorrencia(recorrenciaId: string): Promise<{ ok: boolean; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_recorrencia_cancelar', { p_recorrencia_id: recorrenciaId });
  return { ok: !error, erro: error?.message ?? null };
}
