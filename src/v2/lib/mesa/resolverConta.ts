// ============================================================================
// PR6.1D-1 — Resolução soberana de "Conta" do Excel para o cadastro.
//
// Helper consumido por:
// - PR6.1D-3 (filtro "Apenas conta-da-sessao" nas pills de escopo)
// - PR6.1D-4 (badges de conta nas linhas Excel/OFX)
// - PR6.2 futuro (resolver conta_bancaria_id do lançamento promovido a
//   financeiro_lancamentos_v2 — vem da linha Excel, NUNCA da sessão)
// - PR7 futuro (detecção de ambiguidade via score)
//
// Função PURA — sem efeitos, sem promises, sem leitura de stores/contextos.
// Pattern: idêntico ao validarAprovacao do PR6.1C-1 (helper soberano em
// lib, multi-consumidor).
//
// Vocabulário arquitetural: "camada" / "matching progressivo" / "residual".
// Aqui não há ausência de dado mascarada — há resolução de aliases textuais
// via camadas progressivas, cada uma com score próprio.
// ============================================================================
import type { Database } from '@/integrations/supabase/types';

export type ContaBancariaRow =
  Database['public']['Tables']['financeiro_contas_bancarias']['Row'];

// Tipo estrutural mínimo — apenas os 6 campos que o resolvedor lê.
// Aceita ContaBancariaRow (schema, usado pela mutation) e a ContaBancaria do
// catálogo (sugestaoEngine); ambos satisfazem este Pick.
export type ContaResolvivel = Pick<
  ContaBancariaRow,
  'id' | 'nome_conta' | 'nome_exibicao' | 'banco' | 'agencia' | 'numero_conta'
> & { aliases?: string[] | null };

export type EstrategiaResolucao =
  | 'alias'
  | 'agencia_numero'
  | 'substring_exibicao'
  | 'substring_banco';

export interface ContaResolvida {
  id: string;
  nome_exibicao: string;
  estrategia: EstrategiaResolucao;
  score: number;
}

const SCORE_POR_ESTRATEGIA: Record<EstrategiaResolucao, number> = {
  alias: 100, // explícito (cadastro do usuário — match exato normalizado)
  agencia_numero: 100, // canônico (regex Ag+CC)
  substring_exibicao: 70, // semântico (nome do cadastro)
  substring_banco: 40, // residual (banco do cadastro)
};

const TAMANHO_MINIMO_TEXTO = 3;
const TAMANHO_MINIMO_TERMO_SUBSTRING = 3;

/**
 * Resolve uma string de "Conta" vinda de linha Excel (ex.:
 * "Itaú BBA Ag. 8541 C/C 50189 9") para o registro do cadastro de contas
 * bancárias do cliente.
 *
 * Resolução em camadas progressivas — a primeira que casa vence, e o score
 * indica o nível de confiança para uso futuro (PR7 ambiguidade, PR6.2
 * promoção, detecção de colisões).
 *
 *   1. agencia_numero (score 100) — regex extrai "Ag. NNNN C/C NNNN" do
 *      contaTexto e compara com cb.agencia + cb.numero_conta. Estratégia
 *      canônica. Contas com agencia+numero reais sempre passam por aqui
 *      (BB, Itaú, Sicredi).
 *
 *   2. substring_exibicao (score 70) — normaliza ambos (lowercase, sem
 *      acentos) e verifica se cb.nome_exibicao está contido em contaTexto.
 *      Cobre contas sem agencia+numero canônico (Bradesco, Caixa, Cartões)
 *      que usam pseudo-número "cc-XXX" no cadastro.
 *
 *   3. substring_banco (score 40) — usa cb.banco como termo de busca.
 *      Camada residual: útil quando nome_exibicao é genérico mas o nome do
 *      banco aparece literal no Excel.
 *
 * Termos com menos de 3 caracteres são ignorados (evita matches espúrios
 * com "BB", "cc" etc. dentro de palavras maiores).
 *
 * Retorna null se nada bater.
 *
 * Observação de tipagem: nome_exibicao no schema é nullable, mas o retorno
 * sempre traz uma string não-vazia. Quando nome_exibicao é null no cadastro,
 * usamos nome_conta (campo NOT NULL do schema) na resposta. Camada 2
 * filtra contas sem nome_exibicao porque a estratégia depende dele.
 */
export function resolverContaPorTexto(
  contaTexto: string | null | undefined,
  contas: readonly ContaResolvivel[],
): ContaResolvida | null {
  if (!contaTexto || typeof contaTexto !== 'string') return null;
  const texto = contaTexto.trim();
  if (texto.length < TAMANHO_MINIMO_TEXTO) return null;
  if (contas.length === 0) return null;

  // Normalização reusada pelas camadas 0, 2 e 3.
  const normalizar = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const textoNorm = normalizar(texto);

  // === Camada 0: alias explícito (match exato normalizado) ===
  // Cadastro do usuário em financeiro_contas_bancarias.aliases (jsonb).
  // Prioridade máxima e match EXATO (não substring) → sem falso positivo.
  const hitAlias = contas.find(
    (c) =>
      Array.isArray(c.aliases) &&
      c.aliases.some((a) => normalizar(String(a)) === textoNorm),
  );
  if (hitAlias) {
    return {
      id: hitAlias.id,
      nome_exibicao: hitAlias.nome_exibicao ?? hitAlias.nome_conta,
      estrategia: 'alias',
      score: SCORE_POR_ESTRATEGIA.alias,
    };
  }

  // === Camada 1: agencia + numero_conta via regex ===
  // Aceita: "Ag. 8541 C/C 50189 9", "Ag 8541 CC 50189-9", "AG. 8974 C/C 25367"
  const matchAgNum = texto.match(/Ag\.?\s*(\d+)[\s-]*C\/?C\s*(\d+)/i);
  if (matchAgNum) {
    const [, agExcel, numExcel] = matchAgNum;
    const hit = contas.find(
      (c) =>
        c.agencia != null &&
        c.numero_conta != null &&
        c.agencia.trim() === agExcel.trim() &&
        c.numero_conta.trim() === numExcel.trim(),
    );
    if (hit) {
      return {
        id: hit.id,
        nome_exibicao: hit.nome_exibicao ?? hit.nome_conta,
        estrategia: 'agencia_numero',
        score: SCORE_POR_ESTRATEGIA.agencia_numero,
      };
    }
  }

  // === Camada 2: nome_exibicao por substring normalizada ===
  const hitExib = contas.find((c) => {
    if (!c.nome_exibicao) return false;
    const exibNorm = normalizar(c.nome_exibicao);
    return (
      exibNorm.length >= TAMANHO_MINIMO_TERMO_SUBSTRING &&
      textoNorm.includes(exibNorm)
    );
  });
  if (hitExib) {
    return {
      id: hitExib.id,
      // Camada 2 só passa quando nome_exibicao é truthy — narrowing acima.
      nome_exibicao: hitExib.nome_exibicao ?? hitExib.nome_conta,
      estrategia: 'substring_exibicao',
      score: SCORE_POR_ESTRATEGIA.substring_exibicao,
    };
  }

  // === Camada 3: banco por substring normalizada ===
  const hitBanco = contas.find((c) => {
    if (!c.banco) return false;
    const bancoNorm = normalizar(c.banco);
    return (
      bancoNorm.length >= TAMANHO_MINIMO_TERMO_SUBSTRING &&
      textoNorm.includes(bancoNorm)
    );
  });
  if (hitBanco) {
    return {
      id: hitBanco.id,
      nome_exibicao: hitBanco.nome_exibicao ?? hitBanco.nome_conta,
      estrategia: 'substring_banco',
      score: SCORE_POR_ESTRATEGIA.substring_banco,
    };
  }

  return null;
}
