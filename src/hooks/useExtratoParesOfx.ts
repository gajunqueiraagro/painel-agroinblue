/**
 * useExtratoParesOfx — identifica movimentos OFX com "par" em OUTRA conta
 * do mesmo cliente no mesmo mês (transferência provável).
 *
 * Critério de par OFX cross-account:
 *   - mesmo cliente
 *   - conta_bancaria_id diferente
 *   - valor abs igual (tol 0.01)
 *   - tipo_movimento oposto (credito/debito)
 *   - data ±1 dia
 *   - cancelado_em IS NULL (em ambos)
 *
 * PR-A2 — Relaxamento de status:
 *   Buscamos TODOS os status do mês (exceto cancelado). Detectamos par
 *   normalmente, mas só adicionamos ao Set o(s) lado(s) com status
 *   PENDENTE ('nao_conciliado' ou 'parcial'). Caso operacional comum:
 *   uma ponta já foi conciliada manualmente, a outra continua órfã —
 *   o lado órfão merece o badge "Transferência provável". A regra
 *   antiga (exigia pendência em ambos) perdia 100% desses casos.
 *
 * Não cria/altera dado. Retorna Set<extrato_id> dos IDs PENDENTES que
 * têm par. Escopo: cliente+mês — compartilhado entre todas as contas
 * da tela.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Params {
  clienteId: string | null;
  anoMes: string | null; // 'YYYY-MM'
  enabled?: boolean;
}

type ExtratoStatusFull = 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';

interface MovRef {
  id: string;
  data_movimento: string;
  valor: number;
  tipo_movimento: 'credito' | 'debito';
  conta_bancaria_id: string;
  status: ExtratoStatusFull;
  orfao_definitivo: boolean | null;
}

/** Detector V2 — aresta OFX↔OFX (transferência provável) com lados explícitos. */
export interface ParOfx {
  saidaId: string;
  entradaId: string;
  contaOrigemId: string;
  contaDestinoId: string;
  valor: number;
  dataSaida: string;
  dataEntrada: string;
  confianca: 'forte' | 'ambigua';
}

const TOL = 0.01;
const UM_DIA_MS = 86_400_000;

/** Status considerados pendência — únicos elegíveis para entrar no Set. */
function isPendente(status: ExtratoStatusFull): boolean {
  return status === 'nao_conciliado' || status === 'parcial';
}

export function useExtratoParesOfx({ clienteId, anoMes, enabled = true }: Params) {
  const queryKey = ['extrato-pares-ofx', clienteId, anoMes] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: !!clienteId && !!anoMes && enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<MovRef[]> => {
      // anoMes vem como 'YYYY-MM' — converter para range em data_movimento.
      // Schema extrato_bancario_v2 não tem coluna ano_mes; filtrar via data_movimento.
      const partes = (anoMes as string).split('-');
      const anoStr = partes[0];
      const mesStr = partes[1];
      if (!anoStr || !mesStr) return [];

      const ano = Number(anoStr);
      const mes = Number(mesStr);
      if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return [];

      // Primeiro dia do mês seguinte — exclusivo no .lt — funciona p/ qualquer mês
      const proxMes = mes === 12 ? 1 : mes + 1;
      const proxAno = mes === 12 ? ano + 1 : ano;
      const dataInicio = `${anoStr}-${mesStr}-01`;
      const dataFimExc = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;

      // PR-A2 — buscar TODOS os status (exceto cancelado). Filtro por
      // pendência acontece NO Set (após detectar par), não na query.
      // Cast `'extrato_bancario_v2' as any` é o padrão do projeto para
      // essa tabela (ver useExtratoBancario.ts:51, useImportacaoExtrato.ts).
      const { data, error } = await supabase
        .from('extrato_bancario_v2' as any)
        .select('id, data_movimento, valor, tipo_movimento, conta_bancaria_id, status, orfao_definitivo')
        .eq('cliente_id', clienteId as string)
        .gte('data_movimento', dataInicio)
        .lt('data_movimento', dataFimExc)
        .is('cancelado_em', null);
      if (error) throw error;
      return (data as unknown as MovRef[]) ?? [];
    },
  });

  const { pares, paresOfx } = useMemo<{ pares: ParOfx[]; paresOfx: Set<string> }>(() => {
    const set = new Set<string>();
    const movs = data || [];
    if (movs.length < 2) return { pares: [], paresOfx: set };

    // Arestas brutas (guardam refs aos movs p/ derivar pendência e confiança).
    const arestas: { saida: MovRef; entrada: MovRef }[] = [];

    // O(N²) é seguro: N ≤ algumas dezenas por mês.
    // Critério (inalterado): conta diferente, tipo oposto, |valor| igual (tol),
    // data ±1 dia. Detector V2 adiciona: órfão definitivo não gera aresta.
    for (let i = 0; i < movs.length; i++) {
      const a = movs[i];
      for (let j = i + 1; j < movs.length; j++) {
        const b = movs[j];
        if (a.conta_bancaria_id === b.conta_bancaria_id) continue;
        if (a.tipo_movimento === b.tipo_movimento) continue;
        if (Math.abs(Math.abs(a.valor) - Math.abs(b.valor)) > TOL) continue;
        const diasDif = Math.abs(
          new Date(a.data_movimento).getTime() - new Date(b.data_movimento).getTime(),
        ) / UM_DIA_MS;
        if (diasDif > 1) continue;
        // Detector V2 — movimento marcado órfão definitivo não é transferência.
        if (a.orfao_definitivo === true || b.orfao_definitivo === true) continue;

        // saída = débito (sai da origem); entrada = crédito (entra no destino).
        const saida = a.tipo_movimento === 'debito' ? a : b;
        const entrada = a.tipo_movimento === 'debito' ? b : a;
        arestas.push({ saida, entrada });
      }
    }

    // Confiança: ofx_id que participa de >1 aresta vira 'ambigua'.
    const participacao = new Map<string, number>();
    for (const ar of arestas) {
      participacao.set(ar.saida.id, (participacao.get(ar.saida.id) ?? 0) + 1);
      participacao.set(ar.entrada.id, (participacao.get(ar.entrada.id) ?? 0) + 1);
    }

    const pares: ParOfx[] = arestas.map((ar) => {
      const ambigua =
        (participacao.get(ar.saida.id) ?? 0) > 1 ||
        (participacao.get(ar.entrada.id) ?? 0) > 1;
      return {
        saidaId: ar.saida.id,
        entradaId: ar.entrada.id,
        contaOrigemId: ar.saida.conta_bancaria_id,
        contaDestinoId: ar.entrada.conta_bancaria_id,
        valor: Math.abs(ar.saida.valor),
        dataSaida: ar.saida.data_movimento,
        dataEntrada: ar.entrada.data_movimento,
        confianca: ambigua ? 'ambigua' : 'forte',
      };
    });

    // paresOfx — comportamento PRESERVADO: só os lados PENDENTES entram no Set
    // (avaliados independentemente; Set deduplica). Caso comum: ponta A já
    // conciliada, ponta B órfã → só B recebe o badge "Transferência provável".
    for (const ar of arestas) {
      if (isPendente(ar.saida.status)) set.add(ar.saida.id);
      if (isPendente(ar.entrada.status)) set.add(ar.entrada.id);
    }

    return { pares, paresOfx: set };
  }, [data]);

  return { paresOfx, pares, loading: isLoading, error: error as Error | null };
}
