/**
 * Hook oficial do PC-100 para carregar saldo de caixa mensal por cliente.
 *
 * REGRA DE ESCOPO (inviolável):
 *   Caixa é por CLIENTE, NUNCA por fazenda.
 *   A tabela financeiro_saldos_bancarios_v2 agrega saldos de todas as
 *   contas bancárias do cliente independente da fazenda selecionada.
 *   Em modo Individual e Global o resultado é idêntico.
 *
 * FONTE OFICIAL: financeiro_saldos_bancarios_v2
 *   - saldo_final por (cliente_id, conta_bancaria_id, ano_mes)
 *   - integridade: saldo_final(N) === saldo_inicial(N+1) garantida por
 *     trigger tr_financeiro_saldos_v2_propagate_next_initial
 *   - sem fallback para tabela legada financeiro_saldos_bancarios
 *
 * SHAPE DE RETORNO:
 *   serieAno    length 13 — 0=Dez(ano-1), 1..12=Jan..Dez(ano)
 *   serieAnoAnt length 13 — 0=Dez(ano-2), 1..12=Jan..Dez(ano-1)
 *
 * Meses sem registro → NaN (não 0). Isso evita contaminar deltas.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ehContaDeCaixa } from '@/lib/financeiro/tipoConta';

interface UseSaldoCaixaMensalArgs {
  clienteId: string | null | undefined;
  ano:       number;
  enabled?:  boolean;
}

interface SaldoCaixaMensalResult {
  serieAno:     number[];   // length 13
  serieAnoAnt:  number[];   // length 13
  loading:      boolean;
}

/**
 * Carrega saldos agregados (SUM(saldo_final)) por ano_mes para o cliente
 * em uma janela de 25 meses: Dez(ano-2) + Jan..Dez(ano-1) + Dez(ano-1) +
 * Jan..Dez(ano). Cobre serieAno e serieAnoAnt em uma única query.
 */
async function fetchSaldoCaixaJanela(
  clienteId: string,
  ano: number,
): Promise<Map<string, number>> {
  // Gera lista de ano_mes alvo: Dez(ano-2) até Dez(ano)
  const alvos: string[] = [];
  for (let y = ano - 2; y <= ano; y++) {
    for (let m = 1; m <= 12; m++) {
      alvos.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }

  /**
   * ⚠ A CONTA DE PERMUTA NÃO ENTRA NO CAIXA — PR-AGRI-BARTER-PERMUTA-SEPARADA. Ela registra o
   * que se deve e se tem a receber em grão com a cooperativa; somá-la aqui faria o saldo do
   * banco crescer com valor que não está em banco nenhum. A régua é `ehContaDeCaixa`, uma só
   * para todo o front.
   * ⚠ A LISTA DE EXCLUSÃO VEM DO CADASTRO, não do saldo: a tabela de saldos guarda
   * `conta_bancaria_id` e não sabe o tipo. São os ids que se buscam, e só eles.
   * ⚠ MEDIDO EM 13/09/2026: zero contas de permuta no Proto — então hoje esta consulta volta
   * vazia e nada muda. Ela existe para o dia em que a primeira for criada, que é o dia em que
   * o número silenciosamente mudaria.
   */
  const { data: contasFora } = await supabase
    .from('financeiro_contas_bancarias')
    .select('id, tipo_conta')
    .eq('cliente_id', clienteId);
  const idsForaDoCaixa = new Set(
    (contasFora ?? []).filter(c => !ehContaDeCaixa(c.tipo_conta)).map(c => c.id));

  // Single query agregada — soma todas as contas do cliente por ano_mes
  // RLS já filtra por cliente_id; cancelado/conciliacao não se aplicam aqui.
  const { data, error } = await supabase
    .from('financeiro_saldos_bancarios_v2')
    .select('ano_mes, saldo_final, conta_bancaria_id')
    .eq('cliente_id', clienteId)
    .in('ano_mes', alvos);

  if (error) throw error;

  // Agrega no client (Supabase JS não tem GROUP BY direto)
  const mapa = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.ano_mes || row.saldo_final == null) continue;
    if (row.conta_bancaria_id && idsForaDoCaixa.has(row.conta_bancaria_id)) continue;
    const v = Number(row.saldo_final);
    if (!Number.isFinite(v)) continue;
    mapa.set(row.ano_mes, (mapa.get(row.ano_mes) ?? 0) + v);
  }
  return mapa;
}

/** Monta serie length 13: índice 0 = Dez(refAno-1), 1..12 = Jan..Dez(refAno). */
function montarSerie13(
  mapa: Map<string, number>,
  refAno: number,
): number[] {
  const out: number[] = new Array(13).fill(NaN);
  // índice 0 = Dez do ano anterior à refAno
  const dezAnt = `${refAno - 1}-12`;
  if (mapa.has(dezAnt)) out[0] = mapa.get(dezAnt)!;
  // índices 1..12 = Jan..Dez do refAno
  for (let m = 1; m <= 12; m++) {
    const key = `${refAno}-${String(m).padStart(2, '0')}`;
    if (mapa.has(key)) out[m] = mapa.get(key)!;
  }
  return out;
}

export function useSaldoCaixaMensal({
  clienteId,
  ano,
  enabled = true,
}: UseSaldoCaixaMensalArgs): SaldoCaixaMensalResult {
  const queryEnabled = enabled && !!clienteId && Number.isFinite(ano);

  const query = useQuery({
    queryKey: ['saldo-caixa-mensal', clienteId, ano],
    queryFn: async () => {
      if (!clienteId) return new Map<string, number>();
      return fetchSaldoCaixaJanela(clienteId, ano);
    },
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5min
    gcTime:    10 * 60 * 1000, // 10min
  });

  const mapa = query.data ?? new Map<string, number>();

  return {
    serieAno:    montarSerie13(mapa, ano),
    serieAnoAnt: montarSerie13(mapa, ano - 1),
    loading:     query.isLoading,
  };
}
