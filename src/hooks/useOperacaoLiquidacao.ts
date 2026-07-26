import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Liquidação da Operação Comercial (PR-OC-LIQ-UI-01). Consome EXCLUSIVAMENTE os contratos
//   homologados no PR-OC-LIQ-MODEL-01: views vw_oc_operacao_liquidacao / vw_oc_obrigacoes /
//   vw_oc_titulos_liquidacao (saldo/estado SEMPRE derivados nas views — React nunca calcula),
//   RPCs oc_gerar_obrigacoes / oc_cancelar_obrigacao / oc_registrar_liquidacao /
//   oc_estornar_liquidacao. Eventos de liquidação lidos de zoo_operacao_liquidacoes (sem view
//   dedicada). Não toca conciliação/extrato/NPR/sincronização/schema.

export type FormaLiquidacao =
  | 'dinheiro' | 'pix' | 'transferencia' | 'boleto' | 'cheque' | 'permuta' | 'compensacao' | 'outro';
export type NaturezaFluxo = 'pagar' | 'receber';

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
  loading: boolean;
  saving: boolean;
  gerarObrigacoes: (input: GerarObrigacaoInput) => Promise<boolean>;
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
interface OpMetaRow { tipo_operacao: string; versao: number; contraparte_id: string | null; }

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    if (!enabled || !operacaoId || !clienteId) {
      setResumo(null); setObrigacoes([]); setLiquidacoesPorTitulo({});
      setDocumentos([]); setComponentes([]); setFornecedores([]); setTipoOperacao(null); setContraparteId(null);
      return;
    }
    setLoading(true);
    try {
      const [res, obr, liq, partes, docs, comps, forns, opMeta] = await Promise.all([
        (supabase as any).from('vw_oc_operacao_liquidacao').select('*').eq('operacao_id', operacaoId).maybeSingle(),
        (supabase as any).from('vw_oc_obrigacoes').select('*').eq('operacao_id', operacaoId).order('sequencia_parcela'),
        (supabase as any).from('zoo_operacao_liquidacoes').select('id, data, natureza, forma, valor, descricao, financeiro_lancamento_id, estornado, estorno_motivo, permuta_tipo_bem, permuta_valor_atribuido').eq('operacao_id', operacaoId).order('data'),
        (supabase as any).from('zoo_operacao_partes').select('id, descricao').eq('operacao_id', operacaoId),
        (supabase as any).from('zoo_operacao_documentos').select('id, especie, numero, serie').eq('operacao_id', operacaoId).eq('cancelado', false),
        (supabase as any).from('zoo_componentes_financeiros').select('natureza, codigo, nome, categoria').eq('ativo', true).order('natureza').order('ordem_exibicao'),
        (supabase as any).from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId).order('nome'),
        (supabase as any).from('zoo_operacoes_comerciais').select('tipo_operacao, versao, contraparte_id').eq('id', operacaoId).maybeSingle(),
      ]);
      for (const r of [res, obr, liq, partes, docs, comps, forns, opMeta]) {
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

  const gerarObrigacoes = useCallback(async (input: GerarObrigacaoInput): Promise<boolean> => {
    if (!guard()) return false;
    setSaving(true);
    try {
      // Lê a versão fresca (oc_gerar_obrigacoes não a incrementa; evita 40001 por staleness).
      const opMeta = await (supabase as any).from('zoo_operacoes_comerciais').select('versao').eq('id', operacaoId).maybeSingle();
      if (opMeta.error) throw new Error(opMeta.error.message);
      const versao = (opMeta.data as { versao: number } | null)?.versao;
      if (versao === undefined || versao === null) throw new Error('Operação não encontrada.');

      const n = Math.max(1, Math.trunc(input.quantidadeParcelas));
      const obrigacoesPayload = Array.from({ length: n }, (_, i) => {
        const venc = input.primeiroVencimento
          ? (n > 1 ? addDaysIso(input.primeiroVencimento, input.intervaloDias * i) : input.primeiroVencimento)
          : null;
        return {
          natureza_fluxo: input.naturezaFluxo,
          natureza: input.natureza,
          componente: input.componente,
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
          // chave DETERMINÍSTICA (operacao+natureza+componente+sequência): repetição idêntica = idempotente;
          //   distingue sequências futuras (1/3, 2/3, 3/3). Sem semente aleatória.
          chave_idempotencia: `oc:${operacaoId}:${input.natureza}:${input.componente}:parcela:${i + 1}`,
        };
      });

      const { error } = await (supabase as any).rpc('oc_gerar_obrigacoes', {
        p_operacao_id: operacaoId, p_cliente_id: clienteId, p_versao_esperada: versao,
        p_payload: { obrigacoes: obrigacoesPayload },
      });
      if (error) throw new Error(error.message);
      toast.success(n > 1 ? `${n} obrigações geradas.` : 'Obrigação gerada.');
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
    tipoOperacao, naturezaFluxo, clienteId, contraparteId, loading, saving,
    gerarObrigacoes, cancelarObrigacao, registrarLiquidacao, estornarLiquidacao, recarregar: carregar,
  }), [resumo, obrigacoes, liquidacoesPorTitulo, documentos, componentes, fornecedores,
    tipoOperacao, naturezaFluxo, clienteId, contraparteId, loading, saving,
    gerarObrigacoes, cancelarObrigacao, registrarLiquidacao, estornarLiquidacao, carregar]);
}
