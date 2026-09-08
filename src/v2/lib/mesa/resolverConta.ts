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
> & {
  /**
   * Apelidos da conta — coluna `aliases`, `jsonb`.
   *
   * ⚠ `unknown`, E NÃO `string[] | null` — 133g item 8. A coluna é jsonb e não promete
   * forma nenhuma; a camada 0 abaixo já valida em runtime (`Array.isArray` + `String(a)`),
   * então a promessa no tipo era a única parte frágil. Com `string[]`, todo caller que
   * tivesse a coluna crua precisava de um cast ou de uma segunda validação — e a saída
   * fácil de ambos era não passar os apelidos, que é como `ContaBancariaV2` chegou aqui
   * SEM eles e o cartão do BB foi parar na conta corrente de mesma agência.
   */
  aliases?: unknown;
};

export type EstrategiaResolucao =
  | 'alias'
  /** 133b — o texto da planilha É o nome do cadastro, normalizado. Match EXATO. */
  | 'nome_exato'
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
  nome_exato: 100, // canônico (o texto é o próprio nome do cadastro)
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
 *   0b. nome_exato (score 100) — o texto da planilha, normalizado, é IGUAL a
 *      nome_exibicao ou nome_conta do cadastro. Não há o que confirmar.
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
  // Normalização reusada pelas camadas 0, 2 e 3.
/* ⚠ NORMALIZAÇÃO ÚNICA — subiu para o módulo em 133b, porque `classificarConta` precisa
 da MESMA: duas normalizações diferentes fariam o resolvedor e o classificador discordarem
 sobre o mesmo texto. */
const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();


export function resolverContaPorTexto(
  contaTexto: string | null | undefined,
  contas: readonly ContaResolvivel[],
): ContaResolvida | null {
  if (!contaTexto || typeof contaTexto !== 'string') return null;
  const texto = contaTexto.trim();
  if (texto.length < TAMANHO_MINIMO_TEXTO) return null;
  if (contas.length === 0) return null;

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

  /* === Camada 0b: nome do cadastro IGUAL ao texto (normalizado) — 133b ===
     ⚠ EXATO, NUNCA CONTIDO, e é isso que a separa das camadas 2/3 que saíram: quando o
     texto da planilha É o nome da conta, não há o que confirmar. Sem esta camada, um
     "Sicredi Lavoura" escrito exatamente como o cadastro cairia em `ambiguo`, porque
     "Cartão Sicredi Lavoura" também CONTÉM aquele texto — e a tela passaria a perguntar
     justamente no caso em que ela sabe a resposta.
     ⚠ `nome_exibicao` E `nome_conta`: o cliente escreve o nome que vê, e nem todo cadastro
     tem nome de exibição. */
  const hitNome = contas.find((c) => {
    for (const campo of [c.nome_exibicao, c.nome_conta]) {
      if (campo && normalizar(campo) === textoNorm) return true;
    }
    return false;
  });
  if (hitNome) {
    return {
      id: hitNome.id,
      nome_exibicao: hitNome.nome_exibicao ?? hitNome.nome_conta,
      estrategia: 'nome_exato',
      score: SCORE_POR_ESTRATEGIA.nome_exato,
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

  /* ⚠ AS CAMADAS 2 E 3 DEIXARAM DE RESOLVER SOZINHAS — [ENRIQUECER-TELA-01] (133b).
     Elas usavam `.find()`: o PRIMEIRO cadastro cujo `nome_exibicao` (ou banco) aparecia
     dentro do texto vencia, sem olhar se havia outros. Foi assim que
     "Cartão Sicredi Lavoura Ag. 0903…" resolveu para a CONTA CORRENTE "Sicredi Lavoura" —
     o nome dela está contido no texto do cartão —, e 57 lançamentos de cartão foram parar
     em conta corrente (medido pelo Gabriel em 07/09).
     ⚠ SUBSTRING VIROU SUGESTÃO, NÃO VEREDITO. Quem quer a sugestão chama
     `classificarConta`, que devolve `confirmar` (um candidato) ou `ambiguo` (dois ou mais)
     e obriga a tela a mostrar a conta antes de gravar. Esta função passou a responder só o
     que é CERTO: apelido ou agência+número.
     ⚠ QUEM CHAMAVA CONTINUA COMPILANDO: o retorno segue `ContaResolvida | null`; o que
     mudou é que o `null` agora aparece onde antes vinha um palpite. É o conserto. */
  return null;
}

/** O quanto se sabe sobre a conta de um texto da planilha — 133b. */
export type CertezaConta = 'resolvido' | 'confirmar' | 'ambiguo' | 'sem_candidato';

export interface ClassificacaoConta {
  certeza: CertezaConta;
  /** Preenchido em `resolvido` e em `confirmar` (a sugestão pré-selecionada). */
  sugestao: ContaResolvida | null;
  /** Todos os cadastros que casam por substring, do mais longo para o mais curto. */
  candidatos: ContaResolvida[];
}

/**
 * O veredito completo — a função que a tela de de-para usa.
 *
 * ⚠ O MAIS LONGO QUE CASA VEM PRIMEIRO, e é isso que faz "Cartão Sicredi Lavoura" ganhar
 * de "Sicredi Lavoura" quando os dois estão cadastrados: o nome mais específico é o que o
 * operador quis dizer. Mas ele ainda assim NÃO resolve sozinho — vira `ambiguo`, porque
 * havia mais de um, e é o operador quem escolhe.
 * ⚠ CASA NOS DOIS SENTIDOS: o texto pode conter o cadastro ("…Sicredi Lavoura Ag…" ⊃
 * "Sicredi Lavoura") ou o cadastro conter o texto ("Cartão BB - Ourocard Visa" ⊃
 * "Ourocard"). Só um dos lados deixaria metade dos casos reais de fora.
 */
export function classificarConta(texto: string, contas: readonly ContaResolvivel[]): ClassificacaoConta {
  const certo = resolverContaPorTexto(texto, contas);
  if (certo) return { certeza: 'resolvido', sugestao: certo, candidatos: [certo] };

  const textoNorm = normalizar(texto);
  if (!textoNorm) return { certeza: 'sem_candidato', sugestao: null, candidatos: [] };

  const casam = contas.filter((c) => {
    for (const campo of [c.nome_exibicao, c.nome_conta, c.banco]) {
      if (!campo) continue;
      const n = normalizar(campo);
      if (n.length < TAMANHO_MINIMO_TERMO_SUBSTRING) continue;
      if (textoNorm.includes(n) || n.includes(textoNorm)) return true;
    }
    return false;
  });

  const candidatos: ContaResolvida[] = casam
    .map((c) => ({
      id: c.id,
      nome_exibicao: c.nome_exibicao ?? c.nome_conta,
      estrategia: 'substring_exibicao' as const,
      score: SCORE_POR_ESTRATEGIA.substring_exibicao,
    }))
    .sort((a, b) => b.nome_exibicao.length - a.nome_exibicao.length);

  if (candidatos.length === 0) return { certeza: 'sem_candidato', sugestao: null, candidatos: [] };
  if (candidatos.length === 1) return { certeza: 'confirmar', sugestao: candidatos[0], candidatos };
  return { certeza: 'ambiguo', sugestao: candidatos[0], candidatos };
}
