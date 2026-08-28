import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// PR-OC-UI-FIN-HOOKS — hook orquestrador (leitura + escrita) do modelo financeiro de 3 níveis da
//   Operação Comercial. Consome EXCLUSIVAMENTE os contratos soberanos publicados em 20260803190000:
//   views vw_oc_operacao_compromissos_resumo / vw_oc_compromissos_resumo / vw_oc_parcelas_materializacao
//   (todos os totais/flags/modo derivados no banco — React NUNCA soma), e as RPCs
//   oc_criar_compromisso / oc_programar_compromisso / oc_materializar_programacao. A versão da operação
//   é lida de zoo_operacoes_comerciais (a view não a expõe). Molde manual replicado de
//   useOperacaoLiquidacao.ts (useState + carregar + toast + await carregar; sem react-query).
//   Views/RPCs ainda não constam de types.ts → única exceção de cast é (supabase as any).from/.rpc
//   (eslint-disable pontual). O retorno das RPCs é tratado como unknown e VALIDADO por mapeadores
//   explícitos (isRecord/id string) antes de qualquer sucesso. Writers NUNCA retornam null; lançam
//   OcCompromissoError tipado (code + Error).

// ── Uniões literais (CHECKs conhecidos do backend) ──────────────────────────────────────────────
export type ModoOperacao = 'nova_vazia' | 'novo_modelo' | 'legado' | 'misto_inconsistente';
export type CompromissoStatus = 'aberto' | 'programado' | 'cancelado';
export type ProgramacaoStatus = 'ativa' | 'renegociada' | 'cancelada';
export type ParcelaStatus = 'prevista' | 'materializada' | 'paga' | 'cancelada';

// ── Erro público tipado dos writers ──────────────────────────────────────────────────────────────
export type OcCompromissoErrorCode =
  | 'versao_conflito'
  | 'sem_permissao'
  | 'operacao_inexistente'
  | 'regra_negocio'
  | 'erro_desconhecido';

export class OcCompromissoError extends Error {
  readonly code: OcCompromissoErrorCode;
  constructor(code: OcCompromissoErrorCode, message: string) {
    super(message);
    this.name = 'OcCompromissoError';
    this.code = code;
    // garante instanceof após transpilação de classes que estendem Error
    Object.setPrototypeOf(this, OcCompromissoError.prototype);
  }
}

// ── Tipos PÚBLICOS normalizados (a tela consome estes; totais soberanos já vêm number, default 0) ─
export interface ResumoOperacaoCompromissos {
  operacaoId: string | null;
  clienteId: string | null;
  nCompromissos: number;
  obrigacaoTotal: number;
  totalProgramado: number;
  totalMaterializado: number;
  totalLiquidado: number;
  saldoFinanceiro: number;
  temCompromissos: boolean;
  temPartesLegadas: boolean;
  modo: ModoOperacao;
  temDivergencia: boolean;
}

export interface CompromissoResumo {
  compromissoId: string | null;
  operacaoId: string | null;
  clienteId: string | null;
  natureza: string | null;
  componente: string | null;
  favorecidoId: string | null;
  planoContaId: string | null;
  loteId: string | null;
  status: CompromissoStatus;
  valorCompromisso: number;
  totalProgramado: number;
  saldoAProgramar: number;
  totalMaterializado: number;
  saldoAMaterializar: number;
  totalLiquidadoMonetario: number;
  totalLiquidadoNaoMonetario: number;
  totalLiquidado: number;
  saldoFinanceiro: number;
  programacaoAtivaId: string | null;
  temProgramacaoAtiva: boolean;
  temDivergencia: boolean;
}

export interface ParcelaMaterializacao {
  parcelaId: string | null;
  operacaoId: string | null;
  clienteId: string | null;
  compromissoId: string | null;
  compromissoStatus: CompromissoStatus | null;
  programacaoId: string | null;
  programacaoStatus: ProgramacaoStatus | null;
  sequencia: number;
  valor: number;
  vencimento: string | null;
  contaBancariaId: string | null;
  forma: string | null;
  status: ParcelaStatus;
  parteId: string | null;
  tituloId: string | null;
  tituloStatusTransacao: string | null;
  tituloValor: number | null;
  totalLiquidadoTitulo: number;
  saldoTitulo: number;
  materializada: boolean;
  vinculoIntegro: boolean;
  temDivergencia: boolean;
}

// ── Payloads dos writers (chaves EXATAS das RPCs — enviadas verbatim em p_payload) ───────────────
export interface CriarCompromissoPayload {
  natureza: 'principal' | 'obrigacao';
  componente: string;
  valor_total: number;
  subcentro: string;
  favorecido_id?: string | null;
  lote_id?: string | null;
  descricao?: string | null;
}
export interface ProgramarParcelaInput {
  sequencia: number;
  valor: number;
  vencimento?: string | null;
  conta_bancaria_id?: string | null;
  forma?: string | null;
}
export interface ProgramarCompromissoPayload {
  condicoes?: string | null;
  parcelas: ProgramarParcelaInput[];
}
/* PR-OC-FIN-PARCELAS-01 — acrescentar parcelas a programacao ATIVA.
   ⚠ SEM `sequencia`: quem numera e' o SERVIDOR, a partir de max+1 da propria
   programacao. Mandar sequencia daqui seria adivinhar um numero que o writer
   descarta — por isso o tipo nao a oferece. */
export interface AcrescentarParcelaInput {
  valor: number;
  vencimento?: string | null;
  conta_bancaria_id?: string | null;
  forma?: string | null;
}
export interface AcrescentarParcelasPayload {
  parcelas: AcrescentarParcelaInput[];
}

// ── Resultados dos writers (IDs OBRIGATÓRIOS no sucesso — validados; nunca nulláveis) ─────────────
export interface CriarCompromissoResultado { operacaoVersao: number; compromissoId: string; }
export interface ProgramarCompromissoResultado { operacaoVersao: number; programacaoId: string; parcelaIds: string[]; }
export interface AcrescentarParcelasResultado { operacaoVersao: number; programacaoId: string; parcelaIds: string[]; somaProgramada: number; }
export interface MaterializarResultado { operacaoVersao: number; parcelaId: string; parteId: string; tituloId: string; }

export interface OcCompromissosApi {
  resumoOperacao: ResumoOperacaoCompromissos | null;
  compromissos: CompromissoResumo[];
  parcelas: ParcelaMaterializacao[];
  versao: number | null;
  loading: boolean;
  saving: boolean;
  // writers: NUNCA retornam null; lançam OcCompromissoError tipado em falha.
  criarCompromisso: (versaoEsperada: number, payload: CriarCompromissoPayload) => Promise<CriarCompromissoResultado>;
  programarCompromisso: (versaoEsperada: number, compromissoId: string, payload: ProgramarCompromissoPayload) => Promise<ProgramarCompromissoResultado>;
  acrescentarParcelas: (versaoEsperada: number, compromissoId: string, payload: AcrescentarParcelasPayload) => Promise<AcrescentarParcelasResultado>;
  materializarParcela: (versaoEsperada: number, programacaoId: string, parcelaId: string) => Promise<MaterializarResultado>;
  recarregar: () => Promise<void>;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  enabled: boolean;
}

// ── Tipos BRUTOS das views (nulabilidade do PostgREST; numeric/bigint chegam como string) ────────
type Numerico = string | number | null;
interface RowResumoOperacao {
  operacao_id: string | null; cliente_id: string | null;
  n_compromissos: Numerico; obrigacao_total: Numerico; total_programado: Numerico;
  total_materializado: Numerico; total_liquidado: Numerico; saldo_financeiro: Numerico;
  tem_compromissos: boolean | null; tem_partes_legadas: boolean | null; modo: string | null; tem_divergencia: boolean | null;
}
interface RowCompromisso {
  compromisso_id: string | null; operacao_id: string | null; cliente_id: string | null;
  natureza: string | null; componente: string | null; favorecido_id: string | null; plano_conta_id: string | null; lote_id: string | null;
  status: string | null; valor_compromisso: Numerico; total_programado: Numerico; saldo_a_programar: Numerico;
  total_materializado: Numerico; saldo_a_materializar: Numerico; total_liquidado_monetario: Numerico;
  total_liquidado_nao_monetario: Numerico; total_liquidado: Numerico; saldo_financeiro: Numerico;
  programacao_ativa_id: string | null; tem_programacao_ativa: boolean | null; tem_divergencia: boolean | null;
}
interface RowParcela {
  parcela_id: string | null; operacao_id: string | null; cliente_id: string | null;
  compromisso_id: string | null; compromisso_status: string | null; programacao_id: string | null; programacao_status: string | null;
  sequencia: Numerico; valor: Numerico; vencimento: string | null; conta_bancaria_id: string | null; forma: string | null; status: string | null;
  parte_id: string | null; titulo_id: string | null; titulo_status_transacao: string | null; titulo_valor: Numerico;
  total_liquidado_titulo: Numerico; saldo_titulo: Numerico; materializada: boolean | null; vinculo_integro: boolean | null; tem_divergencia: boolean | null;
}
interface RowOpVersao { versao: number | null; }

// ── Conversões de leitura (idioma provado; sem parseFloat; sem `as` p/ uniões) ───────────────────
const paraNumero = (v: Numerico): number => Number(v ?? 0);                       // total soberano → default 0
const paraNumeroOuNulo = (v: Numerico): number | null => (v == null ? null : Number(v));
const paraBool = (v: boolean | null): boolean => v ?? false;

function toModo(v: string | null): ModoOperacao {
  switch (v) {
    case 'novo_modelo': return 'novo_modelo';
    case 'legado': return 'legado';
    case 'misto_inconsistente': return 'misto_inconsistente';
    default: return 'nova_vazia';
  }
}
function toCompromissoStatus(v: string | null): CompromissoStatus {
  switch (v) { case 'programado': return 'programado'; case 'cancelado': return 'cancelado'; default: return 'aberto'; }
}
function toCompromissoStatusOpt(v: string | null): CompromissoStatus | null { return v == null ? null : toCompromissoStatus(v); }
function toProgramacaoStatus(v: string | null): ProgramacaoStatus | null {
  switch (v) { case 'ativa': return 'ativa'; case 'renegociada': return 'renegociada'; case 'cancelada': return 'cancelada'; default: return null; }
}
function toParcelaStatus(v: string | null): ParcelaStatus {
  switch (v) { case 'materializada': return 'materializada'; case 'paga': return 'paga'; case 'cancelada': return 'cancelada'; default: return 'prevista'; }
}

// ── Validadores do retorno das RPCs (data: unknown → shape validado; sem `as`) ────────────────────
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function idStringNaoVazio(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function versaoRetornoValida(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function respostaInvalida(acao: string): OcCompromissoError {
  return new OcCompromissoError('erro_desconhecido', `Resposta inválida do servidor ao ${acao}.`);
}

function mapCriarCompromissoResultado(data: unknown): CriarCompromissoResultado {
  if (!isRecord(data)) throw respostaInvalida('criar compromisso');
  const versaoRet = data.operacao_versao;
  const compromisso = data.compromisso;
  if (!versaoRetornoValida(versaoRet)) throw respostaInvalida('criar compromisso');
  if (!isRecord(compromisso) || !idStringNaoVazio(compromisso.id)) throw respostaInvalida('criar compromisso');
  return { operacaoVersao: versaoRet, compromissoId: compromisso.id };
}
function mapProgramarCompromissoResultado(data: unknown): ProgramarCompromissoResultado {
  if (!isRecord(data)) throw respostaInvalida('programar compromisso');
  const versaoRet = data.operacao_versao;
  const programacao = data.programacao;
  const parcelas = data.parcelas;
  if (!versaoRetornoValida(versaoRet)) throw respostaInvalida('programar compromisso');
  if (!isRecord(programacao) || !idStringNaoVazio(programacao.id)) throw respostaInvalida('programar compromisso');
  if (!Array.isArray(parcelas) || parcelas.length === 0) throw respostaInvalida('programar compromisso');
  const parcelaIds: string[] = [];
  for (const p of parcelas) {
    if (!isRecord(p) || !idStringNaoVazio(p.id)) throw respostaInvalida('programar compromisso');
    parcelaIds.push(p.id);
  }
  return { operacaoVersao: versaoRet, programacaoId: programacao.id, parcelaIds };
}
/* Envelope proprio: `parcelas_criadas` traz SO as novas, e `soma_programada` e' a
   soma resultante que o writer calculou — a tela nao a recalcula. */
function mapAcrescentarParcelasResultado(data: unknown): AcrescentarParcelasResultado {
  if (!isRecord(data)) throw respostaInvalida('acrescentar parcelas');
  const versaoRet = data.operacao_versao;
  const programacaoId = data.programacao_id;
  const criadas = data.parcelas_criadas;
  if (!versaoRetornoValida(versaoRet)) throw respostaInvalida('acrescentar parcelas');
  if (!idStringNaoVazio(programacaoId)) throw respostaInvalida('acrescentar parcelas');
  if (!Array.isArray(criadas) || criadas.length === 0) throw respostaInvalida('acrescentar parcelas');
  const parcelaIds: string[] = [];
  for (const p of criadas) {
    if (!isRecord(p) || !idStringNaoVazio(p.id)) throw respostaInvalida('acrescentar parcelas');
    parcelaIds.push(p.id);
  }
  const soma = Number(data.soma_programada);
  return { operacaoVersao: versaoRet, programacaoId, parcelaIds, somaProgramada: Number.isFinite(soma) ? soma : 0 };
}

function mapMaterializarResultado(data: unknown): MaterializarResultado {
  if (!isRecord(data)) throw respostaInvalida('lançar parcela');
  const versaoRet = data.operacao_versao;
  const parcela = data.parcela;
  const parte = data.parte;
  const titulo = data.titulo;
  if (!versaoRetornoValida(versaoRet)) throw respostaInvalida('lançar parcela');
  if (!isRecord(parcela) || !idStringNaoVazio(parcela.id)) throw respostaInvalida('lançar parcela');
  if (!isRecord(parte) || !idStringNaoVazio(parte.id)) throw respostaInvalida('lançar parcela');
  if (!isRecord(titulo) || !idStringNaoVazio(titulo.id)) throw respostaInvalida('lançar parcela');
  return { operacaoVersao: versaoRet, parcelaId: parcela.id, parteId: parte.id, tituloId: titulo.id };
}

// SQLSTATE → OcCompromissoError (meio-termo aprovado): P0001/demais → mensagem soberana verbatim;
//   40001/42501/P0002 → texto guiado. `error` é o objeto do PostgREST (code + message).
/* EXPORTADA a partir do PR-OC-ESTORNO-FIN-01: `useOperacaoEstornoFinanceiro`
   precisa do MESMO mapa de erro. Duplica-lo faria a mesma RPC devolver textos
   diferentes conforme quem chamou — e o P0001 aqui repassa a mensagem do banco
   VERBATIM, que e' justamente o que um guard precisa dizer ao usuario. */
export function normalizarErroRpc(error: { code?: string | null; message: string }): OcCompromissoError {
  switch (error.code) {
    case '40001': return new OcCompromissoError('versao_conflito', 'Operação atualizada em outra sessão. Recarregue e tente novamente.');
    case '42501': return new OcCompromissoError('sem_permissao', 'Sem permissão para esta operação.');
    case 'P0002': return new OcCompromissoError('operacao_inexistente', 'Operação não encontrada.');
    case 'P0001': return new OcCompromissoError('regra_negocio', error.message);   // mensagem soberana do banco (verbatim)
    default: return new OcCompromissoError('erro_desconhecido', error.message);
  }
}

// Versão esperada: integer válido e >= 0 (versão mínima do contrato — operação nasce em 0).
//   Inválida/ausente → OcCompromissoError('versao_conflito') SEM chamar RPC. Nunca inventa 0.
function exigirVersaoValida(versaoEsperada: number): void {
  if (!Number.isInteger(versaoEsperada) || versaoEsperada < 0) {
    const err = new OcCompromissoError('versao_conflito', 'Versão da operação indisponível. Recarregue os dados e tente novamente.');
    toast.error(err.message);
    throw err;
  }
}

function mapResumoOperacao(r: RowResumoOperacao): ResumoOperacaoCompromissos {
  return {
    operacaoId: r.operacao_id, clienteId: r.cliente_id,
    nCompromissos: paraNumero(r.n_compromissos),
    obrigacaoTotal: paraNumero(r.obrigacao_total),
    totalProgramado: paraNumero(r.total_programado),
    totalMaterializado: paraNumero(r.total_materializado),
    totalLiquidado: paraNumero(r.total_liquidado),
    saldoFinanceiro: paraNumero(r.saldo_financeiro),
    temCompromissos: paraBool(r.tem_compromissos),
    temPartesLegadas: paraBool(r.tem_partes_legadas),
    modo: toModo(r.modo),
    temDivergencia: paraBool(r.tem_divergencia),
  };
}
function mapCompromisso(r: RowCompromisso): CompromissoResumo {
  return {
    compromissoId: r.compromisso_id, operacaoId: r.operacao_id, clienteId: r.cliente_id,
    natureza: r.natureza, componente: r.componente, favorecidoId: r.favorecido_id,
    planoContaId: r.plano_conta_id, loteId: r.lote_id, status: toCompromissoStatus(r.status),
    valorCompromisso: paraNumero(r.valor_compromisso), totalProgramado: paraNumero(r.total_programado),
    saldoAProgramar: paraNumero(r.saldo_a_programar), totalMaterializado: paraNumero(r.total_materializado),
    saldoAMaterializar: paraNumero(r.saldo_a_materializar),
    totalLiquidadoMonetario: paraNumero(r.total_liquidado_monetario),
    totalLiquidadoNaoMonetario: paraNumero(r.total_liquidado_nao_monetario),
    totalLiquidado: paraNumero(r.total_liquidado), saldoFinanceiro: paraNumero(r.saldo_financeiro),
    programacaoAtivaId: r.programacao_ativa_id, temProgramacaoAtiva: paraBool(r.tem_programacao_ativa),
    temDivergencia: paraBool(r.tem_divergencia),
  };
}
function mapParcela(r: RowParcela): ParcelaMaterializacao {
  return {
    parcelaId: r.parcela_id, operacaoId: r.operacao_id, clienteId: r.cliente_id,
    compromissoId: r.compromisso_id, compromissoStatus: toCompromissoStatusOpt(r.compromisso_status),
    programacaoId: r.programacao_id, programacaoStatus: toProgramacaoStatus(r.programacao_status),
    sequencia: paraNumero(r.sequencia), valor: paraNumero(r.valor), vencimento: r.vencimento,
    contaBancariaId: r.conta_bancaria_id, forma: r.forma, status: toParcelaStatus(r.status),
    parteId: r.parte_id, tituloId: r.titulo_id, tituloStatusTransacao: r.titulo_status_transacao,
    tituloValor: paraNumeroOuNulo(r.titulo_valor), totalLiquidadoTitulo: paraNumero(r.total_liquidado_titulo),
    saldoTitulo: paraNumero(r.saldo_titulo), materializada: paraBool(r.materializada),
    vinculoIntegro: paraBool(r.vinculo_integro), temDivergencia: paraBool(r.tem_divergencia),
  };
}

export function useOcCompromissos({ operacaoId, clienteId, enabled }: Params): OcCompromissosApi {
  const [resumoOperacao, setResumoOperacao] = useState<ResumoOperacaoCompromissos | null>(null);
  const [compromissos, setCompromissos] = useState<CompromissoResumo[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaMaterializacao[]>([]);
  const [versao, setVersao] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async (): Promise<void> => {
    if (!enabled || !operacaoId || !clienteId) {
      setResumoOperacao(null); setCompromissos([]); setParcelas([]); setVersao(null);
      return;
    }
    setLoading(true);
    try {
      const [resumoRes, compsRes, parcelasRes, opMetaRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: view fora de types.ts
        (supabase as any).from('vw_oc_operacao_compromissos_resumo').select('*').eq('operacao_id', operacaoId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: view fora de types.ts
        (supabase as any).from('vw_oc_compromissos_resumo').select('*').eq('operacao_id', operacaoId).order('natureza').order('componente'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: view fora de types.ts
        (supabase as any).from('vw_oc_parcelas_materializacao').select('*').eq('operacao_id', operacaoId).order('compromisso_id').order('sequencia'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela lida só p/ versao
        (supabase as any).from('zoo_operacoes_comerciais').select('versao').eq('id', operacaoId).maybeSingle(),
      ]);
      for (const r of [resumoRes, compsRes, parcelasRes, opMetaRes]) {
        if (r.error) throw new Error(r.error.message);
      }

      // .data é `any` (cliente supabase as any); atribuído a tipos das views SEM `as` (any é assignável).
      const resumoRow: RowResumoOperacao | null = resumoRes.data ?? null;
      const compsRows: RowCompromisso[] = compsRes.data ?? [];
      const parcelasRows: RowParcela[] = parcelasRes.data ?? [];
      const opMetaRow: RowOpVersao | null = opMetaRes.data ?? null;

      setResumoOperacao(resumoRow ? mapResumoOperacao(resumoRow) : null);
      setCompromissos(compsRows.map(mapCompromisso));
      setParcelas(parcelasRows.map(mapParcela));

      // Versão SEMPRE monotônica: nenhuma leitura reduz a maior versão já conhecida.
      const versaoLida = opMetaRow?.versao;
      if (versaoLida != null) setVersao((atual) => Math.max(atual ?? 0, Number(versaoLida)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar os compromissos.');
    } finally {
      setLoading(false);
    }
  }, [enabled, operacaoId, clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const criarCompromisso = useCallback(async (versaoEsperada: number, payload: CriarCompromissoPayload): Promise<CriarCompromissoResultado> => {
    if (!operacaoId || !clienteId) {
      const err = new OcCompromissoError('operacao_inexistente', 'Operação não iniciada.');
      toast.error(err.message); throw err;
    }
    exigirVersaoValida(versaoEsperada);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc('oc_criar_compromisso', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoEsperada, p_payload: payload,
      });
      if (error) throw normalizarErroRpc(error);
      const resultado = mapCriarCompromissoResultado(data);              // valida o shape ANTES do sucesso
      setVersao((atual) => Math.max(atual ?? 0, resultado.operacaoVersao));   // monotônica
      toast.success('Compromisso criado.');
      await carregar();
      return resultado;
    } catch (e) {
      const normalizado = e instanceof OcCompromissoError ? e : new OcCompromissoError('erro_desconhecido', e instanceof Error ? e.message : 'Falha ao criar compromisso.');
      toast.error(normalizado.message);
      if (normalizado.code === 'versao_conflito') await carregar();
      throw normalizado;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const programarCompromisso = useCallback(async (versaoEsperada: number, compromissoId: string, payload: ProgramarCompromissoPayload): Promise<ProgramarCompromissoResultado> => {
    if (!operacaoId || !clienteId) {
      const err = new OcCompromissoError('operacao_inexistente', 'Operação não iniciada.');
      toast.error(err.message); throw err;
    }
    exigirVersaoValida(versaoEsperada);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc('oc_programar_compromisso', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoEsperada, p_compromisso_id: compromissoId, p_payload: payload,
      });
      if (error) throw normalizarErroRpc(error);
      const resultado = mapProgramarCompromissoResultado(data);
      setVersao((atual) => Math.max(atual ?? 0, resultado.operacaoVersao));
      toast.success('Programação criada.');
      await carregar();
      return resultado;
    } catch (e) {
      const normalizado = e instanceof OcCompromissoError ? e : new OcCompromissoError('erro_desconhecido', e instanceof Error ? e.message : 'Falha ao programar compromisso.');
      toast.error(normalizado.message);
      if (normalizado.code === 'versao_conflito') await carregar();
      throw normalizado;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  /* Irma de `programarCompromisso`, mesmo idioma ponta a ponta: exige versao valida,
     normaliza o erro do banco, propaga a versao nova e recarrega. A diferenca esta no
     writer, nao aqui — este acrescenta a programacao ATIVA e nunca cria uma segunda. */
  const acrescentarParcelas = useCallback(async (versaoEsperada: number, compromissoId: string, payload: AcrescentarParcelasPayload): Promise<AcrescentarParcelasResultado> => {
    if (!operacaoId || !clienteId) {
      const err = new OcCompromissoError('operacao_inexistente', 'Operação não iniciada.');
      toast.error(err.message); throw err;
    }
    exigirVersaoValida(versaoEsperada);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc('oc_acrescentar_parcelas', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoEsperada, p_compromisso_id: compromissoId, p_payload: payload,
      });
      if (error) throw normalizarErroRpc(error);
      const resultado = mapAcrescentarParcelasResultado(data);
      setVersao((atual) => Math.max(atual ?? 0, resultado.operacaoVersao));
      toast.success('Parcelas acrescentadas.');
      await carregar();
      return resultado;
    } catch (e) {
      const normalizado = e instanceof OcCompromissoError ? e : new OcCompromissoError('erro_desconhecido', e instanceof Error ? e.message : 'Falha ao acrescentar parcelas.');
      toast.error(normalizado.message);
      if (normalizado.code === 'versao_conflito') await carregar();
      throw normalizado;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  const materializarParcela = useCallback(async (versaoEsperada: number, programacaoId: string, parcelaId: string): Promise<MaterializarResultado> => {
    if (!operacaoId || !clienteId) {
      const err = new OcCompromissoError('operacao_inexistente', 'Operação não iniciada.');
      toast.error(err.message); throw err;
    }
    exigirVersaoValida(versaoEsperada);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc('oc_materializar_programacao', {
        p_operacao_id: operacaoId, p_versao_esperada: versaoEsperada, p_programacao_id: programacaoId, p_parcela_id: parcelaId,
      });
      if (error) throw normalizarErroRpc(error);
      const resultado = mapMaterializarResultado(data);
      setVersao((atual) => Math.max(atual ?? 0, resultado.operacaoVersao));
      toast.success('Parcela lançada.');
      await carregar();
      return resultado;
    } catch (e) {
      const normalizado = e instanceof OcCompromissoError ? e : new OcCompromissoError('erro_desconhecido', e instanceof Error ? e.message : 'Falha ao lançar parcela.');
      toast.error(normalizado.message);
      if (normalizado.code === 'versao_conflito') await carregar();
      throw normalizado;
    } finally { setSaving(false); }
  }, [operacaoId, clienteId, carregar]);

  return useMemo(() => ({
    resumoOperacao, compromissos, parcelas, versao, loading, saving,
    criarCompromisso, programarCompromisso, acrescentarParcelas, materializarParcela, recarregar: carregar,
  }), [resumoOperacao, compromissos, parcelas, versao, loading, saving,
    criarCompromisso, programarCompromisso, acrescentarParcelas, materializarParcela, carregar]);
}
