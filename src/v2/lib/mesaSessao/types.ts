/**
 * Tipos da Mesa de Pareamento — fonte única.
 *
 * REGRA DE ARQUITETURA (travada no PR5):
 *   Tipos de domínio NUNCA importam de componentes React.
 *   Este arquivo é a fonte única dos tipos compartilhados entre o
 *   modal (MesaPareamentoModal.tsx) e a camada de persistência
 *   (mutations.ts, useMesaSessao.ts).
 */
import type { LoteExcel } from '@/v2/lib/excelPreview/types';

// ============================================================================
// Tipos de domínio da Mesa (movidos de MesaPareamentoModal.tsx no PR5)
// ============================================================================

export type MesaDecisao = 'pendente' | 'aprovado' | 'rejeitado' | 'excel_orfao';

export interface ParCorrecao {
  contaId: string | null;
  contaRotulo: string | null;
  fazendaId: string | null;
  fazendaNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorMarcadoNovo: boolean;
  dataCompetencia: string | null;
  subcentro: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  produto: string | null;
  descricao: string | null;
  corrigidoEm: string;
}

export interface ParEstado {
  excelKey: string;
  ofxIdAtivo: string | null;
  ofxIdSugeridoOriginal: string | null;
  decisao: MesaDecisao;
  correcao: ParCorrecao | null;
}

export interface AprovacaoLocal {
  aprovadoEm: string;
  origem_aprovacao: 'sugestao_direta' | 'corrigido';
  contaId: string | null;
  contaRotulo: string | null;
  fazendaId: string | null;
  fazendaNome: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorMarcadoNovo: boolean;
  dataCompetencia: string | null;
  subcentro: string;
  macro: string | null;
  grupo: string | null;
  centro: string | null;
  produto: string | null;
  descricao: string | null;
  ofxIdVinculado: string | null;
}

// ============================================================================
// Tipos de persistência (rows do banco + status)
// ============================================================================

export type MesaSessaoStatus = 'em_andamento' | 'finalizada';
export type MesaOfxValidacaoStatus = 'pendente' | 'ofx_orfao_validado';
export type SalvamentoStatus = 'salvo' | 'salvando' | 'erro' | 'pendente';

export interface MesaSessaoRow {
  id: string;
  cliente_id: string;
  conta_bancaria_id: string;
  ano_mes: string;
  status: MesaSessaoStatus;
  excel_lotes_json: LoteExcel[];
  ofx_extratos_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface MesaParRow {
  id: string;
  sessao_id: string;
  excel_key: string;
  ofx_id_ativo: string | null;
  ofx_id_sugerido_original: string | null;
  decisao: MesaDecisao;
  correcao_json: ParCorrecao | null;
  aprovacao_json: AprovacaoLocal | null;
  updated_at: string;
}

export interface MesaOfxValidacaoRow {
  id: string;
  sessao_id: string;
  ofx_id: string;
  status: MesaOfxValidacaoStatus;
  updated_at: string;
}

/**
 * PR6.1B — Resultado discriminado de criarOuRecuperarSessao.
 * Sessão Mesa é imutável: existindo sessão com mesmos arquivos, continua;
 * com arquivos diferentes, UI decide (Commit 3).
 */
export type ResultadoCriarOuRecuperar =
  | { tipo: 'criada'; sessao: MesaSessaoRow }
  | { tipo: 'existente_igual'; sessao: MesaSessaoRow }
  | { tipo: 'divergencia'; sessaoExistente: MesaSessaoRow; hashNovo: string };

export interface SessaoCompleta {
  sessao: MesaSessaoRow;
  pares: MesaParRow[];
  ofxValidacoes: MesaOfxValidacaoRow[];
}
