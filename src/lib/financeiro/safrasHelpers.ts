// PR-SAFRA-UI-01 — helpers puros do cadastro de Safras (financeiro_safras).
//   Sem dependência de React/Supabase: lógica testável de validação, ordenação,
//   rótulos de escopo, indicador "Em uso" e mapeamento amigável de erros.
//   `ordem_exibicao` honra o schema real: integer NOT NULL DEFAULT 0 (Opção A).

export type EscopoNegocio = 'pecuaria' | 'agricultura' | 'administrativo';

/** Linha soberana de financeiro_safras consumida pela tela.
 *  `ordem_exibicao` é `number` (schema NOT NULL, default 0) — nunca null. */
export interface FinanceiroSafra {
  id: string;
  cliente_id: string;
  nome: string;
  codigo: string | null;
  escopo_negocio: EscopoNegocio | null;
  ordem_exibicao: number;
  descricao: string | null;
  observacoes: string | null;
  ativa: boolean;
}

export const ESCOPO_LABEL: Record<EscopoNegocio, string> = {
  pecuaria: 'Pecuária',
  agricultura: 'Agricultura',
  administrativo: 'Administrativo',
};

/** Rótulo de escopo para exibição. NULL/legado → "Não definido". */
export function escopoLabel(e: string | null | undefined): string {
  if (e === 'pecuaria' || e === 'agricultura' || e === 'administrativo') return ESCOPO_LABEL[e];
  return 'Não definido';
}

/** Ajuda por escopo, exibida sob o Select do formulário. */
export const ESCOPO_AJUDA: Record<EscopoNegocio, string> = {
  pecuaria: 'Pecuária — ciclos, operações e análises pecuárias.',
  agricultura: 'Agricultura — safras agrícolas e análises relacionadas.',
  administrativo: 'Administrativo — receitas e despesas administrativas por exercício.',
};

/**
 * Ordenação determinística (frontend):
 *   1) ordem_exibicao crescente;
 *   2) empate → nome crescente com localeCompare pt-BR.
 * Sem semântica de NULL (Opção A: ordem é sempre inteiro).
 */
export function ordenarSafras<T extends { ordem_exibicao: number; nome: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.ordem_exibicao !== b.ordem_exibicao) return a.ordem_exibicao - b.ordem_exibicao;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

export type OrdemParse = { ok: true; value: number } | { ok: false; erro: string };

/**
 * Interpreta o input de "Ordem de exibição" honrando o schema NOT NULL DEFAULT 0:
 *   - vazio → 0 (default oficial; nunca NULL);
 *   - inteiro >= 0 → o número;
 *   - negativo, decimal ou não-numérico → erro.
 */
export function parseOrdemExibicao(raw: string): OrdemParse {
  const s = raw.trim();
  if (s === '') return { ok: true, value: 0 };
  if (!/^\d+$/.test(s)) {
    return { ok: false, erro: 'Ordem de exibição deve ser um número inteiro maior ou igual a zero.' };
  }
  return { ok: true, value: parseInt(s, 10) };
}

export interface SafraFormInput {
  nome: string;
  codigo: string;
  escopo_negocio: EscopoNegocio | '';
  ordemRaw: string;
  descricao: string;
  observacoes: string;
  ativa: boolean;
}

/** Payload validado (sem cliente_id) — campos soberanos editáveis da Safra. */
export interface SafraPayload {
  nome: string;
  codigo: string;
  escopo_negocio: EscopoNegocio;
  ordem_exibicao: number;
  descricao: string | null;
  observacoes: string | null;
  ativa: boolean;
}

export type ValidacaoSafra = { ok: true; payload: SafraPayload } | { ok: false; erro: string };

/**
 * Regras de criação/edição:
 *   - nome obrigatório (trim; não aceita só espaços);
 *   - código obrigatório (trim; preserva capitalização/símbolos);
 *   - escopo obrigatório (só validado ao salvar);
 *   - ordem via parseOrdemExibicao (vazio → 0);
 *   - descrição/observações vazias → NULL.
 */
export function validarSafra(input: SafraFormInput): ValidacaoSafra {
  const nome = input.nome.trim();
  if (!nome) return { ok: false, erro: 'Informe o nome da Safra.' };
  const codigo = input.codigo.trim();
  if (!codigo) return { ok: false, erro: 'Informe o código da Safra.' };
  if (input.escopo_negocio !== 'pecuaria' && input.escopo_negocio !== 'agricultura' && input.escopo_negocio !== 'administrativo') {
    return { ok: false, erro: 'Selecione o escopo do negócio.' };
  }
  const ordem = parseOrdemExibicao(input.ordemRaw);
  if (!ordem.ok) return { ok: false, erro: ordem.erro };
  return {
    ok: true,
    payload: {
      nome,
      codigo,
      escopo_negocio: input.escopo_negocio,
      ordem_exibicao: ordem.value,
      descricao: input.descricao.trim() || null,
      observacoes: input.observacoes.trim() || null,
      ativa: input.ativa,
    },
  };
}

/** Conjunto de IDs de Safra "em uso" a partir de linhas de safra_id de lançamentos. */
export function buildEmUsoSet(rows: Array<{ safra_id: string | null }> | null | undefined): Set<string> {
  const s = new Set<string>();
  (rows || []).forEach((r) => { if (r.safra_id) s.add(r.safra_id); });
  return s;
}

/**
 * Mensagem amigável para erro de salvamento. Trata unicidade PostgreSQL 23505
 * priorizando o nome da constraint / campo. Nunca expõe SQL/JSON/constraint ao usuário.
 * Retorna null quando não há erro.
 */
export function mapErroSalvarSafra(
  error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): string | null {
  if (!error) return null;
  if (error.code === '23505') {
    const hay = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    if (hay.includes('nome')) return 'Já existe uma Safra com este nome.';
    if (hay.includes('codigo') || hay.includes('código')) return 'Já existe uma Safra com este código.';
    return 'Já existe uma Safra com estes dados.';
  }
  return 'Erro ao salvar a Safra.';
}
