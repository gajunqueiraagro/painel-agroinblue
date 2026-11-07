/**
 * LOTES-03 F1 (Gabriel 06/11/2026, mock lotes-03-assistente.html) — o contrato da tela de Lotes com o banco.
 * O lote guarda só identidade e estratégia; cabeças, peso, GMD e pasto vêm do fechamento (`fn_lotes_da_fazenda`), nunca se gravam.
 * Escritas: `fn_lote_cadastro_salvar`, `fn_lote_salvar`, `fn_lote_situacao` (todas com `p_simular`; trilha em `audit_log`).
 */
export type TipoDoCadastro = 'categoria' | 'raca' | 'atividade' | 'sistema' | 'programa' | 'destino';

/** Uma linha de `rebanho_lote_cadastros`. `sigla` só em categoria, raça e atividade; `categoriasRebanho` só na categoria. */
export interface CadastroDoLote {
  id: string;
  tipo: TipoDoCadastro;
  sigla: string | null;
  nome: string;
  categoriasRebanho: string[];
  ordem: number;
  ativo: boolean;
}

export type SituacaoDoLote = 'ativo' | 'encerrado' | 'cancelado';

/** Uma linha de `fn_lotes_da_fazenda(p_fazenda, p_ano_mes)`. Os números do fechamento são nulos sem lançamento ("—"). */
export interface LoteDaLista {
  id: string;
  codigo: string;
  codigosAntigos: string[];
  nomeCampeiro: string | null;
  situacao: SituacaoDoLote;
  formadoEm: string;          // 'aaaa-mm-dd'
  encerradoEm: string | null;
  categoriaId: string;
  racaId: string;
  atividadeId: string;
  numero: number;
  sistemaId: string | null;
  programaId: string | null;
  destinoId: string | null;
  safra: string | null;
  carimbo: string | null;
  idadeMediaMeses: number | null;
  metaPesoKg: number | null;
  metaGmdKg: number | null;
  metaData: string | null;
  versao: number;
  /** do fechamento (fonte única) */
  anoMesDado: string | null;
  cabecas: number | null;
  pesoMedioKg: number | null;
  gmdKg: number | null;
  pastos: string[];
  lancamentos: number;
}

/** Os campos que `fn_lote_salvar` aceita em `p_campos` (só as chaves que vierem mudam). */
export interface CamposDoLote {
  categoria_id?: string;
  raca_id?: string;
  atividade_id?: string;
  numero?: number;
  nome_campeiro?: string;
  formado_em?: string;
  sistema_id?: string;
  programa_id?: string;
  destino_id?: string;
  safra?: string;
  carimbo?: string;
  idade_media_meses?: string;
  meta_peso_kg?: string;
  meta_gmd_kg?: string;
  meta_data?: string;
}

/** O código CAT-RAÇA-ATIV-NN (D5 hífen); parte ainda não escolhida = "__". */
export function codigoDoLote(cat: string | null, raca: string | null, ativ: string | null, numero: number | null): string {
  const p = (s: string | null) => s ?? '__';
  return `${p(cat)}-${p(raca)}-${p(ativ)}-${numero == null ? '__' : String(numero).padStart(2, '0')}`;
}
