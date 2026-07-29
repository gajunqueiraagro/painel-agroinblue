import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';

// Liquidação da Operação Comercial (PR-OC-LIQ-UI-01). Consome EXCLUSIVAMENTE os contratos
//   homologados no PR-OC-LIQ-MODEL-01: views vw_oc_operacao_liquidacao / vw_oc_obrigacoes /
//   vw_oc_titulos_liquidacao (saldo/estado SEMPRE derivados nas views — React nunca calcula),
//   RPCs oc_gerar_obrigacoes / oc_cancelar_obrigacao / oc_registrar_liquidacao /
//   oc_estornar_liquidacao. Eventos de liquidação lidos de zoo_operacao_liquidacoes (sem view
//   dedicada). Não toca conciliação/extrato/NPR/sincronização/schema.

export type FormaLiquidacao =
  | 'dinheiro' | 'pix' | 'transferencia' | 'boleto' | 'cheque' | 'permuta' | 'compensacao' | 'outro';
export type NaturezaFluxo = 'pagar' | 'receber';

// Classificação AUTOMÁTICA do principal da compra na OC. Espelha EXATAMENTE a regra legada de
// gerarFinanceiroCompra.ts (categoria feminina → subcentro Fêmeas; demais categorias válidas →
// Machos), como fonte única no fluxo OC — sem seleção manual. Operação de sexo único gera UMA
// obrigação; operação mista gera N (uma por classificação), cada uma com valor derivado dos seus
// lotes pela fórmula oficial de valor. O plano_conta_id real é resolvido no componente por
// (tipo_operacao '2-Saídas' + subcentro). Frete/Comissão (subcentro dedicado) = escopo futuro.
export const SUBCENTRO_PRINCIPAL_COMPRA_FEMEAS = 'Investimento Compra Bovinos Fêmeas';
export const SUBCENTRO_PRINCIPAL_COMPRA_MACHOS = 'Investimento Compra Bovinos Machos';
const CATEGORIAS_FEMEAS_COMPRA = new Set<string>(['mamotes_f', 'desmama_f', 'novilhas', 'vacas']);
const CATEGORIAS_VALIDAS = new Set<string>(CATEGORIAS.map(c => c.value));

// Lote da negociação com os campos necessários à classificação e ao valor oficial.
export interface LoteOC {
  id: string;                 // PR-FIN-OC-COMPOSICAO-02 — identidade estrutural do lote (parte.lote_id)
  categoria: string;
  qtd: number | null;
  pesoMedioKg: number | null;
  criterio: string | null;   // 'kg' | 'cabeca' | 'total'
  valorInformado: number | null;
}

// VALOR OFICIAL do lote — fórmula idêntica a oc_salvar_lotes (backend) e useCompraLotes (front):
//   kg → qtd × peso_medio × valor/kg; cabeca → qtd × valor/cab; total → valor. Não derivável
//   (retorna null) quando falta critério ou valor_informado.
export function valorLoteOC(l: LoteOC): number | null {
  if (!l.criterio || l.valorInformado == null) return null;
  const q = l.qtd ?? 0, p = l.pesoMedioKg ?? 0, v = l.valorInformado;
  switch (l.criterio) {
    case 'kg': return q * p * v;
    case 'cabeca': return q * v;
    case 'total': return v;
    default: return null;
  }
}

const sexoDaCategoria = (c: string): 'macho' | 'femea' => (CATEGORIAS_FEMEAS_COMPRA.has(c) ? 'femea' : 'macho');
const subcentroDoSexo = (s: 'macho' | 'femea') => (s === 'femea' ? SUBCENTRO_PRINCIPAL_COMPRA_FEMEAS : SUBCENTRO_PRINCIPAL_COMPRA_MACHOS);

// PR-FIN-OC-COMPOSICAO-02 — um item POR LOTE (identidade comercial = lote/categoria). O sexo/subcentro
//   é só classificação GERENCIAL derivada; NUNCA chave de consolidação. valorBruto = valor oficial do lote.
export interface LoteClassificado { lote: LoteOC; sexo: 'macho' | 'femea'; subcentro: string; valorBruto: number; }
export type ClassificacaoLotes =
  | { status: 'ok'; itens: LoteClassificado[] }          // um item por LOTE (sem agrupar por sexo)
  | { status: 'sem_categoria' }
  | { status: 'categoria_invalida'; categorias: string[] }
  | { status: 'valor_nao_derivavel'; categorias: string[] };

// Classifica CADA lote individualmente: deriva sexo→subcentro (classificação gerencial) e o valor
// OFICIAL do lote, sem somar/agrupar. DM e G (ambos machos) permanecem itens distintos. Bloqueia
// (sem fallback) quando falta categoria, categoria fora do enum, ou valor de lote não derivável.
export function classificarLotesCompra(lotes: LoteOC[]): ClassificacaoLotes {
  const validos = lotes.filter(l => (l.categoria ?? '').trim().length > 0);
  if (validos.length === 0) return { status: 'sem_categoria' };
  const invalidas = Array.from(new Set(validos.map(l => l.categoria).filter(c => !CATEGORIAS_VALIDAS.has(c))));
  if (invalidas.length > 0) return { status: 'categoria_invalida', categorias: invalidas };
  const naoDeriv = Array.from(new Set(validos.filter(l => valorLoteOC(l) == null).map(l => l.categoria)));
  if (naoDeriv.length > 0) return { status: 'valor_nao_derivavel', categorias: naoDeriv };
  const itens: LoteClassificado[] = validos.map(l => {
    const sexo = sexoDaCategoria(l.categoria);
    return { lote: l, sexo, subcentro: subcentroDoSexo(sexo), valorBruto: valorLoteOC(l) ?? 0 };
  });
  return { status: 'ok', itens };
}

export interface ResumoLiquidacao {
  valorTotal: number;
  base: number | null;
  baseOrigem: string | null;
  totalLiquidadoValido: number;
  totalLiquidadoMonetario: number;
  totalLiquidadoNaoMonetario: number;
  saldoOperacao: number | null;
  estadoLiquidacao: string;
}

export interface ObrigacaoLinha {
  obrigacaoId: string;
  origem: 'negociacao' | 'documento' | 'manual';
  documentoId: string | null;
  natureza: string;
  componente: string;
  sequenciaParcela: number;
  quantidadeParcelas: number;
  valorNominal: number;
  dataVencimento: string | null;
  favorecidoId: string | null;
  semMovimentacaoCaixa: boolean;
  cancelada: boolean;
  tituloId: string | null;
  totalLiquidado: number;
  totalLiquidadoMonetario: number;
  totalLiquidadoNaoMonetario: number;
  saldoAberto: number;
  estado: string;
  // resolvidos (não financeiros)
  descricao: string;
  documentoLabel: string;
  favorecidoNome: string;
}

export interface LiquidacaoEvento {
  id: string;
  data: string | null;
  natureza: string;
  forma: FormaLiquidacao;
  valor: number;
  descricao: string | null;
  financeiroLancamentoId: string | null;
  estornado: boolean;
  estornoMotivo: string | null;
  permutaTipoBem: string | null;
  permutaValorAtribuido: number | null;
}

export interface DocumentoOpcao { id: string; label: string; }
export interface ComponenteCatalogo { natureza: string; codigo: string; nome: string; categoria: string | null; }

export interface GerarObrigacaoInput {
  naturezaFluxo: NaturezaFluxo;
  natureza: string;
  componente: string;
  // PR-FIN-OC-COMPOSICAO-02 — lote de origem: identidade e vínculo estrutural da obrigação. NULL para
  //   componentes GERAIS da OC (frete/comissão). Compõe a chave determinística por lote (nunca por sexo).
  loteId?: string | null;
  valor: number;          // valor POR parcela
  descricao?: string;
  favorecidoId?: string | null;
  documentoId?: string | null;
  documentoComponenteId?: string | null;
  // Classificação oficial (financeiro_plano_contas) — obrigatória; validada e resolvida no servidor.
  macroCusto?: string | null;
  grupoCusto?: string | null;
  centroCusto?: string | null;
  subcentro?: string | null;
  planoContaId?: string | null;
  semMovimentacaoCaixa: boolean;
  materializar: boolean;
  quantidadeParcelas: number;   // >= 1
  primeiroVencimento?: string | null;  // ISO
  intervaloDias: number;        // usado quando parcelas > 1
}

export interface RegistrarLiquidacaoInput {
  financeiroLancamentoId: string;
  data: string;
  valor: number;
  forma: FormaLiquidacao;
  descricao?: string;
  permutaTipoBem?: string;
  permutaDescricaoBem?: string;
  permutaValorAtribuido?: number;
}

export interface LiquidacaoApi {
  resumo: ResumoLiquidacao | null;
  obrigacoes: ObrigacaoLinha[];
  liquidacoesPorTitulo: Record<string, LiquidacaoEvento[]>;
  documentos: DocumentoOpcao[];
  componentes: ComponenteCatalogo[];
  fornecedores: { id: string; nome: string }[];
  tipoOperacao: string | null;
  naturezaFluxo: NaturezaFluxo | null;
  clienteId: string | null;        // para a cascata de classificação (usePlanoContasOC)
  contraparteId: string | null;    // favorecido default (não altera a contraparte comercial)
  lotes: LoteOC[];                 // lotes negociados (classificação automática + valor oficial)
  valorAcordado: number | null;    // âncora exata da soma das obrigações principais (valor_acordado)
  loading: boolean;
  saving: boolean;
  gerarObrigacoes: (inputs: GerarObrigacaoInput[]) => Promise<boolean>;
  cancelarObrigacao: (parteId: string, motivo: string) => Promise<boolean>;
  registrarLiquidacao: (input: RegistrarLiquidacaoInput) => Promise<boolean>;
  estornarLiquidacao: (liquidacaoId: string, motivo: string) => Promise<boolean>;
  recarregar: () => void;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  enabled: boolean;
}

interface ResumoRow {
  valor_total: number; base: number | null; base_origem: string | null;
  total_liquidado_valido: number; total_liquidado_monetario: number; total_liquidado_nao_monetario: number;
  saldo_operacao: number | null; estado_liquidacao: string;
}
interface ObrigacaoRow {
  obrigacao_id: string; origem: 'negociacao' | 'documento' | 'manual'; documento_id: string | null;
  natureza: string; componente: string; sequencia_parcela: number; quantidade_parcelas: number;
  valor_nominal: number; data_vencimento: string | null; favorecido_id: string | null;
  sem_movimentacao_caixa: boolean; cancelada: boolean; titulo_id: string | null;
  total_liquidado: number; total_liquidado_monetario: number; total_liquidado_nao_monetario: number;
  saldo_aberto: number; estado: string;
}
interface LiqRow {
  id: string; data: string | null; natureza: string; forma: FormaLiquidacao; valor: number;
  descricao: string | null; financeiro_lancamento_id: string | null; estornado: boolean;
  estorno_motivo: string | null; permuta_tipo_bem: string | null; permuta_valor_atribuido: number | null;
}
interface ParteMetaRow { id: string; descricao: string | null; }
interface DocRow { id: string; especie: string | null; numero: string | null; serie: string | null; }
interface CompRow { natureza: string; codigo: string; nome: string | null; categoria: string | null; }
interface FornRow { id: string; nome: string | null; }
interface OpMetaRow { tipo_operacao: string; versao: number; contraparte_id: string | null; valor_acordado: number | null; }
interface LoteRow {
  id: string;
  categoria_negociada: string | null; qtd_negociada: number | null;
  peso_medio_negociado_kg: number | null; criterio_valor: string | null; valor_informado: number | null;
}

function docLabelOf(d: DocRow): string {
  const esp = (d.especie ?? '').replace('nf_', 'NF ').trim();
  const num = d.numero ? `nº ${d.numero}` : '';
  const ser = d.serie ? `/${d.serie}` : '';
  return [esp, num + ser].filter(Boolean).join(' ').trim() || '—';
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function useOperacaoLiquidacao({ operacaoId, clienteId, enabled }: Params): LiquidacaoApi {
  const [resumo, setResumo] = useState<ResumoLiquidacao | null>(null);
  const [obrigacoes, setObrigacoes] = useState<ObrigacaoLinha[]>([]);
  const [liquidacoesPorTitulo, setLiquidacoesPorTitulo] = useState<Record<string, LiquidacaoEvento[]>>({});
  const [documentos, setDocumentos] = useState<DocumentoOpcao[]>([]);
  const [componentes, setComponentes] = useState<ComponenteCatalogo[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [tipoOperacao, setTipoOperacao] = useState<string | null>(null);
  const [contraparteId, setContraparteId] = useState<string | null>(null);   // favorecido default (não altera a contraparte comercial)
  const [lotes, setLotes] = useState<LoteOC[]>([]);
  const [valorAcordado, setValorAcordado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId || !clienteId) {
      setResumo(null); setObrigacoes([]); setLiquidacoesPorTitulo({});
      setDocumentos([]); setComponentes([]); setFornecedores([]); setTipoOperacao(null); setContraparteId(null);
      setLotes([]); setValorAcordado(null);
      return;
    }
    setLoading(true);
    try {
      const [res, obr, liq, partes, docs, comps, forns, opMeta, lotesRes] = await Promise.all([
        (supabase as any).from('vw_oc_operacao_liquidacao').select('*').eq('operacao_id', operacaoId).maybeSingle(),
        (supabase as any).from('vw_oc_obrigacoes').select('*').eq('operacao_id', operacaoId).order('sequencia_parcela'),
        (supabase as any).from('zoo_operacao_liquidacoes').select('id, data, natureza, forma, valor, descricao, financeiro_lancamento_id, estornado, estorno_motivo, permuta_tipo_bem, permuta_valor_atribuido').eq('operacao_id', operacaoId).order('data'),
        (supabase as any).from('zoo_operacao_partes').select('id, descricao').eq('operacao_id', operacaoId),
        (supabase as any).from('zoo_operacao_documentos').select('id, especie, numero, serie').eq('operacao_id', operacaoId).eq('cancelado', false),
        (supabase as any).from('zoo_componentes_financeiros').select('natureza, codigo, nome, categoria').eq('ativo', true).order('natureza').order('ordem_exibicao'),
        (supabase as any).from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId).order('nome'),
        (supabase as any).from('zoo_operacoes_comerciais').select('tipo_operacao, versao, contraparte_id, valor_acordado').eq('id', operacaoId).maybeSingle(),
        (supabase as any).from('zoo_operacao_lotes').select('id, categoria_negociada, qtd_negociada, peso_medio_negociado_kg, criterio_valor, valor_informado').eq('operacao_id', operacaoId),
      ]);
      for (const r of [res, obr, liq, partes, docs, comps, forns, opMeta, lotesRes]) {
        if (r.error) throw new Error(r.error.message);
      }

      const descMap = new Map<string, string>();
      ((partes.data ?? []) as ParteMetaRow[]).forEach(p => descMap.set(p.id, p.descricao ?? ''));
      const docRows = (docs.data ?? []) as DocRow[];
      const docLabelMap = new Map<string, string>();
      docRows.forEach(d => docLabelMap.set(d.id, docLabelOf(d)));
      const fornRows = (forns.data ?? []) as FornRow[];
      const fornMap = new Map<string, string>();
      fornRows.forEach(f => fornMap.set(f.id, f.nome ?? ''));

      const r = res.data as ResumoRow | null;
      setResumo(r ? {
        valorTotal: Number(r.valor_total ?? 0), base: r.base === null ? null : Number(r.base), baseOrigem: r.base_origem,
        totalLiquidadoValido: Number(r.total_liquidado_valido ?? 0),
        totalLiquidadoMonetario: Number(r.total_liquidado_monetario ?? 0),
        totalLiquidadoNaoMonetario: Number(r.total_liquidado_nao_monetario ?? 0),
        saldoOperacao: r.saldo_operacao === null ? null : Number(r.saldo_operacao),
        estadoLiquidacao: r.estado_liquidacao,
      } : null);

      setObrigacoes(((obr.data ?? []) as ObrigacaoRow[]).map(o => ({
        obrigacaoId: o.obrigacao_id, origem: o.origem, documentoId: o.documento_id,
        natureza: o.natureza, componente: o.componente, sequenciaParcela: o.sequencia_parcela,
        quantidadeParcelas: o.quantidade_parcelas, valorNominal: Number(o.valor_nominal),
        dataVencimento: o.data_vencimento, favorecidoId: o.favorecido_id,
        semMovimentacaoCaixa: o.sem_movimentacao_caixa, cancelada: o.cancelada, tituloId: o.titulo_id,
        totalLiquidado: Number(o.total_liquidado), totalLiquidadoMonetario: Number(o.total_liquidado_monetario),
        totalLiquidadoNaoMonetario: Number(o.total_liquidado_nao_monetario), saldoAberto: Number(o.saldo_aberto),
        estado: o.estado,
        descricao: descMap.get(o.obrigacao_id) ?? '',
        documentoLabel: o.documento_id ? (docLabelMap.get(o.documento_id) ?? '—') : '',
        favorecidoNome: o.favorecido_id ? (fornMap.get(o.favorecido_id) ?? '') : '',
      })));

      const porTitulo: Record<string, LiquidacaoEvento[]> = {};
      ((liq.data ?? []) as LiqRow[]).forEach(l => {
        const ev: LiquidacaoEvento = {
          id: l.id, data: l.data, natureza: l.natureza, forma: l.forma, valor: Number(l.valor),
          descricao: l.descricao, financeiroLancamentoId: l.financeiro_lancamento_id, estornado: l.estornado,
          estornoMotivo: l.estorno_motivo, permutaTipoBem: l.permuta_tipo_bem,
          permutaValorAtribuido: l.permuta_valor_atribuido === null ? null : Number(l.permuta_valor_atribuido),
        };
        const k = l.financeiro_lancamento_id ?? '__sem_titulo__';
        (porTitulo[k] ??= []).push(ev);
      });
      setLiquidacoesPorTitulo(porTitulo);

      setDocumentos(docRows.map(d => ({ id: d.id, label: docLabelOf(d) })));
      setComponentes(((comps.data ?? []) as CompRow[]).map(c => ({ natureza: c.natureza, codigo: c.codigo, nome: c.nome ?? c.codigo, categoria: c.categoria })));
      setFornecedores(fornRows.map(f => ({ id: f.id, nome: f.nome ?? '' })));
      const opMetaRow = opMeta.data as OpMetaRow | null;   // idioma existente p/ tipar o retorno (supabase as any)
      setTipoOperacao(opMetaRow?.tipo_operacao ?? null);
      setContraparteId(opMetaRow?.contraparte_id ?? null);
      setValorAcordado(opMetaRow?.valor_acordado == null ? null : Number(opMetaRow.valor_acordado));
      setLotes(((lotesRes.data ?? []) as LoteRow[]).map(l => ({
        id: l.id,
        categoria: l.categoria_negociada ?? '',
        qtd: l.qtd_negociada == null ? null : Number(l.qtd_negociada),
        pesoMedioKg: l.peso_medio_negociado_kg == null ? null : Number(l.peso_medio_negociado_kg),
        criterio: l.criterio_valor,
        valorInformado: l.valor_informado == null ? null : Number(l.valor_informado),
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar a liquidação.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId, clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const guard = (): boolean => {
    if (!operacaoId || !clienteId) { toast.error('Operação não iniciada.'); return false; }
    return true;
  };

  const naturezaFluxo: NaturezaFluxo | null = tipoOperacao
    ? (tipoOperacao === 'compra' ? 'pagar' : 'receber')
    : null;

  // Recebe N obrigações (ex.: principal por classificação numa operação mista) e envia TODAS numa
  // ÚNICA chamada à RPC (sem writer paralelo, sem chamadas por classificação). A coerência de base
  // (Σ principais = valor_acordado) é validada pelo servidor.
  const gerarObrigacoes = useCallback(async (inputs: GerarObrigacaoInput[]): Promise<boolean> => {
    if (!guard()) return false;
    if (inputs.length === 0) return false;
    setSaving(true);
    try {
      // Lê a versão fresca (oc_gerar_obrigacoes não a incrementa; evita 40001 por staleness).
      const opMeta = await (supabase as any).from('zoo_operacoes_comerciais').select('versao').eq('id', operacaoId).maybeSingle();
      if (opMeta.error) throw new Error(opMeta.error.message);
      const versao = (opMeta.data as { versao: number } | null)?.versao;
      if (versao === undefined || versao === null) throw new Error('Operação não encontrada.');

      const obrigacoesPayload = inputs.flatMap((input) => {
        const n = Math.max(1, Math.trunc(input.quantidadeParcelas));
        // PR-FIN-OC-COMPOSICAO-02 — discriminador de identidade = LOTE (ou 'geral' p/ componente geral da OC).
        const loteKey = input.loteId ?? 'geral';
        return Array.from({ length: n }, (_, i) => {
          const venc = input.primeiroVencimento
            ? (n > 1 ? addDaysIso(input.primeiroVencimento, input.intervaloDias * i) : input.primeiroVencimento)
            : null;
          return {
            natureza_fluxo: input.naturezaFluxo,
            natureza: input.natureza,
            componente: input.componente,
            lote_id: input.loteId ?? null,
            valor: input.valor,
            data_vencimento: venc,
            sequencia_parcela: i + 1,
            quantidade_parcelas: n,
            descricao: input.descricao ?? null,
            favorecido_id: input.favorecidoId ?? null,
            documento_id: input.documentoId ?? null,
            documento_componente_id: input.documentoComponenteId ?? null,
            // classificação oficial (o servidor valida/resolve e é a autoridade sobre plano_conta_id)
            macro_custo: input.macroCusto ?? null,
            grupo_custo: input.grupoCusto ?? null,
            centro_custo: input.centroCusto ?? null,
            subcentro: input.subcentro ?? null,
            plano_conta_id: input.planoContaId ?? null,
            incluso_no_total: false,
            sem_movimentacao_caixa: input.semMovimentacaoCaixa,
            materializar: input.semMovimentacaoCaixa ? false : input.materializar,
            // chave DETERMINÍSTICA por LOTE (operacao:lote:natureza:componente:parcela):
            //   repetição idêntica = idempotente; lotes distintos = obrigações distintas (nunca por sexo).
            chave_idempotencia: `oc:${operacaoId}:${loteKey}:${input.natureza}:${input.componente}:parcela:${i + 1}`,
          };
        });
      });

      const { error } = await (supabase as any).rpc('oc_gerar_obrigacoes', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao,
        p_payload: { obrigacoes: obrigacoesPayload },
      });
      if (error) throw new Error(error.message);
      toast.success(obrigacoesPayload.length > 1 ? `${obrigacoesPayload.length} obrigações geradas.` : 'Obrigação gerada.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar obrigação.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const cancelarObrigacao = useCallback(async (parteId: string, motivo: string): Promise<boolean> => {
    if (!guard()) return false;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_cancelar_obrigacao', {
        p_parte_id: parteId, p_cliente_id: clienteId, p_motivo: motivo,
      });
      if (error) throw new Error(error.message);
      toast.success('Obrigação cancelada.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar obrigação.');
      return false;
    } finally { setSaving(false); }
  }, [clienteId, carregar]);

  const registrarLiquidacao = useCallback(async (input: RegistrarLiquidacaoInput): Promise<boolean> => {
    if (!guard()) return false;
    const nat = tipoOperacao === 'compra' ? 'pagamento' : 'recebimento';
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        data: input.data, natureza: nat, forma: input.forma, valor: input.valor,
        descricao: input.descricao ?? null, financeiro_lancamento_id: input.financeiroLancamentoId,
      };
      if (input.forma === 'permuta') {
        payload.permuta_tipo_bem = input.permutaTipoBem ?? null;
        payload.permuta_descricao_bem = input.permutaDescricaoBem ?? null;
        payload.permuta_valor_atribuido = input.permutaValorAtribuido ?? null;
      }
      const { error } = await (supabase as any).rpc('oc_registrar_liquidacao', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_payload: payload,
      });
      if (error) throw new Error(error.message);
      toast.success('Liquidação registrada.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao registrar liquidação.');
      return false;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, tipoOperacao, carregar]);

  const estornarLiquidacao = useCallback(async (liquidacaoId: string, motivo: string): Promise<boolean> => {
    if (!guard()) return false;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('oc_estornar_liquidacao', {
        p_liquidacao_id: liquidacaoId, p_cliente_id: clienteId, p_motivo: motivo,
      });
      if (error) throw new Error(error.message);
      toast.success('Liquidação estornada.');
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao estornar liquidação.');
      return false;
    } finally { setSaving(false); }
  }, [clienteId, carregar]);

  return useMemo(() => ({
    resumo, obrigacoes, liquidacoesPorTitulo, documentos, componentes, fornecedores,
    tipoOperacao, naturezaFluxo, clienteId, contraparteId, lotes, valorAcordado, loading, saving,
    gerarObrigacoes, cancelarObrigacao, registrarLiquidacao, estornarLiquidacao, recarregar: carregar,
  }), [resumo, obrigacoes, liquidacoesPorTitulo, documentos, componentes, fornecedores,
    tipoOperacao, naturezaFluxo, clienteId, contraparteId, lotes, valorAcordado, loading, saving,
    gerarObrigacoes, cancelarObrigacao, registrarLiquidacao, estornarLiquidacao, carregar]);
}
