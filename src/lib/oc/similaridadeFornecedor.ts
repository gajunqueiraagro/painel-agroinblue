/**
 * Semelhança de nome de fornecedor — trigramas, no NAVEGADOR.
 *
 * ⚠ POR QUE NÃO NO BANCO. A lista de fornecedores ativos do cliente **já está em
 * memória**: `useOperacaoLiquidacao` a carrega inteira, paginada, para alimentar os
 * seletores. Buscar no banco seria ir buscar o que já está na mão.
 * Medido no proto, cliente com 2.569 fornecedores (6.771 linhas varridas):
 *   `similarity()` com limiar 0,3 → **95,4 ms**, Seq Scan, sem índice.
 * Um índice GIN de trigrama resolveria a varredura, mas cobra em toda escrita da
 * tabela — e a pergunta certa não é "como acelerar a consulta", é "por que consultar".
 * Aqui a mesma resposta sai em microssegundos, sem ida ao servidor e sem índice novo.
 *
 * ⚠ COMPATÍVEL COM `pg_trgm`, DE PROPÓSITO — não é uma métrica caseira. Reproduz a
 * definição da extensão para que o limiar signifique a mesma coisa dos dois lados, e
 * para que migrar a busca para o banco um dia não mude o resultado:
 *   - minúsculas; tudo que não é letra ou dígito vira separador;
 *   - cada palavra ganha **dois espaços à frente e um atrás**;
 *   - similaridade = |trigramas em comum| / |união dos trigramas|.
 * A diferença conhecida: `pg_trgm` também remove acentos quando `unaccent` está em
 * jogo. Aqui os acentos são removidos SEMPRE — "CACULA" e "CAÇULA" precisam casar, e
 * nome de fornecedor digitado à mão raramente traz o acento da nota.
 */

export interface CandidatoFornecedor {
  id: string;
  nome: string;
  cpfCnpj: string | null;
  similaridade: number;
}

/* ⚠ CONCORDANCIA COM O POSTGRES, MEDIDA — não suposta. Comparando esta função com
 *  `similarity()` no proto, alvo "VINICIUS FERNANDES CACULA":
 *      Mauricio Fernandes         pg 0,3235   js 0,3235
 *      Rodo Fernandes             pg 0,3226   js 0,3226
 *      Vinicius Marini Ferreira   pg 0,3158   js 0,3158
 *      Claudemir Fernandes        pg 0,3143   js 0,3143
 *      Vinicius Fernandes Caçula  pg 0,7931   js 1,0000   ← a diferença dos acentos
 *  Idêntico até a quarta casa onde não há acento; mais forte onde há, que é o desejado:
 *  o "ç" do cadastro contra o "C" da nota não pode enfraquecer o acerto. */

/** Limiar 0,45 — mais alto que o 0,3 do teste no banco, e a razão é o custo do erro.
 *  Sugerir um fornecedor errado faz o operador GRAVAR um CNPJ no cadastro alheio, que é
 *  pior que não sugerir nada: ele cria o novo e segue. Com 0,3 entram nomes que só
 *  compartilham um sobrenome comum — na medição acima, 0,3 traria QUATRO nomes errados
 *  e 0,45 traz só o certo. Ajustar aqui, num lugar só. */
export const LIMIAR_SEMELHANCA = 0.45;

/** Teto de opções exibidas. Lista longa vira ruído e empurra a decisão de volta para o
 *  operador, que é justamente quem a sugestão deveria ajudar. */
export const MAX_CANDIDATOS = 4;

function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Trigramas no formato do pg_trgm: cada palavra vira "  palavra ". */
function trigramas(s: string): Set<string> {
  const out = new Set<string>();
  for (const palavra of normalizar(s).split(' ').filter(Boolean)) {
    const p = `  ${palavra} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

export function similaridade(a: string, b: string): number {
  const A = trigramas(a), B = trigramas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comuns = 0;
  for (const t of A) if (B.has(t)) comuns++;
  return comuns / (A.size + B.size - comuns);
}

/** Só dígitos — para comparar documento sem depender da máscara. */
export const soDigitosDoc = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Raiz do CNPJ (8 primeiros dígitos): mesma empresa, filial diferente. */
export const raizCnpj = (s: string | null | undefined) => soDigitosDoc(s).slice(0, 8);

/**
 * Candidatos a "é este fornecedor", ordenados.
 * ⚠ SEM DOCUMENTO VEM PRIMEIRO: são os que a nota tem o que completar — 96% do cadastro
 * hoje. Quem já tem CNPJ diferente aparece depois, e escolhê-lo dispara o aviso de
 * conflito em vez de sobrescrever.
 */
export function candidatosPorNome(
  nomeDaNota: string,
  fornecedores: { id: string; nome: string; cpfCnpj?: string | null }[],
): CandidatoFornecedor[] {
  return fornecedores
    .map(f => ({ id: f.id, nome: f.nome, cpfCnpj: f.cpfCnpj ?? null, similaridade: similaridade(nomeDaNota, f.nome) }))
    .filter(c => c.similaridade >= LIMIAR_SEMELHANCA)
    .sort((a, b) =>
      (a.cpfCnpj ? 1 : 0) - (b.cpfCnpj ? 1 : 0) || b.similaridade - a.similaridade)
    .slice(0, MAX_CANDIDATOS);
}
