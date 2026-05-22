import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContaBancaria {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  conta_digito: string | null;
  fazenda_id: string | null;
}

export interface Fazenda {
  id: string;
  nome: string;
  codigo: string | null;
  status_operacional: string | null;
}

// PR4.2 — natureza inferida do tipo_operacao histórico do cliente.
export type NaturezaSubcentro = 'entrada' | 'saida' | 'transferencia';

export interface SubcentroUsado {
  subcentro: string;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  qt_uso: number;
  // PR4.2 — contadores por natureza + set de naturezas vistas
  qt_uso_entrada: number;
  qt_uso_saida: number;
  qt_uso_transferencia: number;
  naturezas: Set<NaturezaSubcentro>;
}

export interface FornecedorOficial {
  id: string;
  nome: string;
  nome_normalizado: string | null;
  aliases: string[] | null;
  fazenda_id: string | null;
}

export interface CatalogoCliente {
  contas: ContaBancaria[];
  fazendas: Fazenda[];
  subcentros: SubcentroUsado[];
  fornecedores: FornecedorOficial[];
  // índice auxiliar: fornecedor → subcentro mais usado (heurística histórica)
  subcentroPorFornecedor: Map<
    string,
    { subcentro: string; macro: string | null; grupo: string | null; centro: string | null }
  >;
}

interface HistoricoRow {
  favorecido_id: string | null;
  subcentro: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  tipo_operacao: string | null;
}

// PR4.2 — mapping do enum financeiro_lancamentos_v2.tipo_operacao para
// a natureza canônica do subcentro.
function tipoOperacaoToNatureza(t: string | null): NaturezaSubcentro | null {
  if (!t) return null;
  if (t === '1-Entradas') return 'entrada';
  if (t === '2-Saídas') return 'saida';
  if (t === '3-Transferências') return 'transferencia';
  return null;
}

export function useCatalogoCliente(clienteId: string | null) {
  return useQuery<CatalogoCliente>({
    queryKey: ['catalogo-cliente', clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CatalogoCliente> => {
      if (!clienteId) throw new Error('clienteId obrigatório');

      // Cast em supabase: typed client narrow demais em queries multi-coluna
      // de leitura; cast preserva runtime e tipos da UI (interfaces locais).
      const sb = supabase as any;

      const [contasRes, fazendasRes, fornecedoresRes, histRes] = await Promise.all([
        sb
          .from('financeiro_contas_bancarias')
          .select('id, nome_conta, nome_exibicao, banco, agencia, numero_conta, conta_digito, fazenda_id')
          .eq('cliente_id', clienteId)
          .eq('ativa', true)
          .order('ordem_exibicao', { ascending: true })
          .order('nome_exibicao', { ascending: true }),

        sb
          .from('fazendas')
          .select('id, nome, codigo, status_operacional')
          .eq('cliente_id', clienteId)
          .order('nome'),

        sb
          .from('financeiro_fornecedores')
          .select('id, nome, nome_normalizado, aliases, fazenda_id')
          .eq('cliente_id', clienteId)
          .eq('ativo', true),

        sb
          .from('financeiro_lancamentos_v2')
          .select('favorecido_id, subcentro, macro_custo, grupo_custo, centro_custo, tipo_operacao')
          .eq('cliente_id', clienteId)
          .eq('cancelado', false)
          .not('subcentro', 'is', null)
          .order('id', { ascending: false })
          .limit(50000),
      ]);

      if (contasRes.error) throw contasRes.error;
      if (fazendasRes.error) throw fazendasRes.error;
      if (fornecedoresRes.error) throw fornecedoresRes.error;
      if (histRes.error) throw histRes.error;

      const hist = ((histRes.data ?? []) as unknown) as HistoricoRow[];

      // PR4.2 — agrega subcentros usados acumulando natureza (entrada/saida/transferência)
      // derivada de tipo_operacao histórico. Chave: subcentro+macro+grupo+centro.
      const mapSub = new Map<string, SubcentroUsado>();
      hist.forEach((r) => {
        if (!r.subcentro) return;
        const key = `${r.subcentro}|${r.macro_custo ?? ''}|${r.grupo_custo ?? ''}|${r.centro_custo ?? ''}`;
        const natureza = tipoOperacaoToNatureza(r.tipo_operacao);
        const cur = mapSub.get(key);
        if (cur) {
          cur.qt_uso++;
          if (natureza === 'entrada') cur.qt_uso_entrada++;
          else if (natureza === 'saida') cur.qt_uso_saida++;
          else if (natureza === 'transferencia') cur.qt_uso_transferencia++;
          if (natureza) cur.naturezas.add(natureza);
        } else {
          const naturezas = new Set<NaturezaSubcentro>();
          if (natureza) naturezas.add(natureza);
          mapSub.set(key, {
            subcentro: r.subcentro,
            macro_custo: r.macro_custo,
            grupo_custo: r.grupo_custo,
            centro_custo: r.centro_custo,
            qt_uso: 1,
            qt_uso_entrada: natureza === 'entrada' ? 1 : 0,
            qt_uso_saida: natureza === 'saida' ? 1 : 0,
            qt_uso_transferencia: natureza === 'transferencia' ? 1 : 0,
            naturezas,
          });
        }
      });
      // Ordenação geral mantida (por qt_uso total) — específica por natureza
      // fica no consumer (MesaPareamentoModal/subcentrosParticionados).
      const subcentros = Array.from(mapSub.values()).sort((a, b) => b.qt_uso - a.qt_uso);

      // índice fornecedor → subcentro mais usado
      const contagemPorFornecedor = new Map<
        string,
        Map<string, { count: number; macro: string | null; grupo: string | null; centro: string | null }>
      >();
      hist.forEach((r) => {
        if (!r.favorecido_id || !r.subcentro) return;
        let inner = contagemPorFornecedor.get(r.favorecido_id);
        if (!inner) {
          inner = new Map<string, { count: number; macro: string | null; grupo: string | null; centro: string | null }>();
          contagemPorFornecedor.set(r.favorecido_id, inner);
        }
        const cur = inner.get(r.subcentro);
        if (cur) {
          cur.count++;
        } else {
          inner.set(r.subcentro, {
            count: 1,
            macro: r.macro_custo,
            grupo: r.grupo_custo,
            centro: r.centro_custo,
          });
        }
      });

      const subcentroPorFornecedor = new Map<
        string,
        { subcentro: string; macro: string | null; grupo: string | null; centro: string | null }
      >();
      contagemPorFornecedor.forEach((inner, fornId) => {
        let melhor:
          | { subcentro: string; count: number; macro: string | null; grupo: string | null; centro: string | null }
          | null = null;
        inner.forEach((v, subc) => {
          if (!melhor || v.count > melhor.count) {
            melhor = {
              subcentro: subc,
              count: v.count,
              macro: v.macro,
              grupo: v.grupo,
              centro: v.centro,
            };
          }
        });
        if (melhor) {
          // Narrow defensivo: TS não infere após o forEach
          const m = melhor as {
            subcentro: string;
            count: number;
            macro: string | null;
            grupo: string | null;
            centro: string | null;
          };
          subcentroPorFornecedor.set(fornId, {
            subcentro: m.subcentro,
            macro: m.macro,
            grupo: m.grupo,
            centro: m.centro,
          });
        }
      });

      return {
        contas: ((contasRes.data ?? []) as unknown) as ContaBancaria[],
        fazendas: ((fazendasRes.data ?? []) as unknown) as Fazenda[],
        subcentros,
        fornecedores: ((fornecedoresRes.data ?? []) as unknown) as FornecedorOficial[],
        subcentroPorFornecedor,
      };
    },
  });
}
