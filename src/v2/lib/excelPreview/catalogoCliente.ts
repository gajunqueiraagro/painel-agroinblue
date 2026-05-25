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
  tipo_conta: string | null;
}

export interface Fazenda {
  id: string;
  nome: string;
  codigo: string | null;
  status_operacional: string | null;
}

// PR4.2 — natureza inferida do tipo_operacao histórico do cliente.
export type NaturezaSubcentro = 'entrada' | 'saida' | 'transferencia';

// PR4.3 — origem do subcentro no catálogo híbrido (oficial + histórico).
// 'oficial'   = só no plano oficial (qt_uso = 0)
// 'historico' = só no histórico (legado, fora do plano atual)
// 'ambos'     = no plano + usado (caso normal)
export type OrigemSubcentro = 'oficial' | 'historico' | 'ambos';

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
  // PR4.3 — origem hierárquica + escopo de negócio (do plano oficial)
  origem: OrigemSubcentro;
  escopo_negocio: string | null;
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

// PR4.3 — linha do plano oficial (financeiro_plano_contas).
// cliente_id NULL = global soberano; cliente_id = X = custom do cliente.
interface PlanoOficialRow {
  subcentro: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  tipo_operacao: string | null;
  escopo_negocio: string | null;
  cliente_id: string | null;
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

      const [contasRes, fazendasRes, fornecedoresRes, histRes, planoRes] = await Promise.all([
        sb
          .from('financeiro_contas_bancarias')
          // PR-H2 — tipo_conta para agrupamento no ContaBancariaSelect.
          .select('id, nome_conta, nome_exibicao, banco, agencia, numero_conta, conta_digito, fazenda_id, tipo_conta')
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

        // PR4.3 — plano oficial (global soberano + custom do cliente)
        sb
          .from('financeiro_plano_contas')
          .select('subcentro, macro_custo, grupo_custo, centro_custo, tipo_operacao, escopo_negocio, cliente_id')
          .or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)
          .eq('ativo', true)
          .not('subcentro', 'is', null),
      ]);

      if (contasRes.error) throw contasRes.error;
      if (fazendasRes.error) throw fazendasRes.error;
      if (fornecedoresRes.error) throw fornecedoresRes.error;
      if (histRes.error) throw histRes.error;
      if (planoRes.error) throw planoRes.error;

      const hist = ((histRes.data ?? []) as unknown) as HistoricoRow[];
      const plano = ((planoRes.data ?? []) as unknown) as PlanoOficialRow[];

      // PR4.3 — catálogo híbrido em 2 fases:
      //   FASE 1: inicializa pelo plano oficial (origem='oficial', qt_uso=0)
      //   FASE 2: enriquece pelo histórico — promove a 'ambos' OU cria 'historico'
      // Naturezas: plano oficial fornece a autoritativa; histórico só ADICIONA ao Set.
      const mapSub = new Map<string, SubcentroUsado>();

      // FASE 1 — Plano oficial (soberano: global + custom do cliente, dedup)
      plano.forEach((p) => {
        if (!p.subcentro) return;
        const key = `${p.subcentro}|${p.macro_custo ?? ''}|${p.grupo_custo ?? ''}|${p.centro_custo ?? ''}`;
        if (mapSub.has(key)) return;  // dedupe global + custom da mesma chave

        const naturezas = new Set<NaturezaSubcentro>();
        const natOficial = tipoOperacaoToNatureza(p.tipo_operacao);
        if (natOficial) naturezas.add(natOficial);

        mapSub.set(key, {
          subcentro: p.subcentro,
          macro_custo: p.macro_custo,
          grupo_custo: p.grupo_custo,
          centro_custo: p.centro_custo,
          qt_uso: 0,
          qt_uso_entrada: 0,
          qt_uso_saida: 0,
          qt_uso_transferencia: 0,
          naturezas,
          origem: 'oficial',
          escopo_negocio: p.escopo_negocio,
        });
      });

      // FASE 2 — Enriquecimento histórico
      hist.forEach((r) => {
        if (!r.subcentro) return;
        const key = `${r.subcentro}|${r.macro_custo ?? ''}|${r.grupo_custo ?? ''}|${r.centro_custo ?? ''}`;
        const natObservada = tipoOperacaoToNatureza(r.tipo_operacao);

        const cur = mapSub.get(key);
        if (cur) {
          // Já existe (do plano oficial) → promove a 'ambos', incrementa contadores
          cur.origem = 'ambos';
          cur.qt_uso++;
          if (natObservada === 'entrada') cur.qt_uso_entrada++;
          else if (natObservada === 'saida') cur.qt_uso_saida++;
          else if (natObservada === 'transferencia') cur.qt_uso_transferencia++;
          if (natObservada) cur.naturezas.add(natObservada);
        } else {
          // Não existe no plano → legado/fora do plano oficial
          const naturezas = new Set<NaturezaSubcentro>();
          if (natObservada) naturezas.add(natObservada);
          mapSub.set(key, {
            subcentro: r.subcentro,
            macro_custo: r.macro_custo,
            grupo_custo: r.grupo_custo,
            centro_custo: r.centro_custo,
            qt_uso: 1,
            qt_uso_entrada: natObservada === 'entrada' ? 1 : 0,
            qt_uso_saida: natObservada === 'saida' ? 1 : 0,
            qt_uso_transferencia: natObservada === 'transferencia' ? 1 : 0,
            naturezas,
            origem: 'historico',
            escopo_negocio: null,
          });
        }
      });

      // Ordenação geral mantida (por qt_uso total) — específica por natureza
      // fica no consumer (MesaPareamentoModal/subcentrosParticionados).
      // Oficiais sem uso (qt_uso=0) caem no fim, mas aparecem na busca.
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
