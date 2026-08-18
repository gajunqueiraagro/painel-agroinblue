// ============================================================================
// persistirApelidos — PR-IMPORT-EXCEL-LANC-01, passo 4 (metade da memória).
//
// Grava os apelidos que o operador resolveu À MÃO nesta importação, para que a
// próxima já venha pré-preenchida. Três destinos, três mecanismos preexistentes:
//   · subcentro       → financeiro_subcentro_aliases (tabela), origem='importacao'
//   · fornecedor      → financeiro_fornecedores.aliases (jsonb)
//   · conta bancária  → financeiro_contas_bancarias.aliases (jsonb)
// Fazenda NÃO tem memória por decisão de escopo: codigo_importacao já é a fonte
// desse fato, e uma segunda memória seria segunda fonte (Título III).
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ REGRA INVIOLÁVEL — O APELIDO GOVERNA O FUTURO, NUNCA O PASSADO.          ║
// ║                                                                          ║
// ║ Trocar o destino de um apelido NÃO reclassifica nenhum lançamento já     ║
// ║ criado. Não existe UPDATE retroativo em financeiro_lancamentos_v2 aqui,  ║
// ║ e não deve passar a existir. O lançamento guarda a classificação que     ║
// ║ tinha quando foi gravado; o apelido só decide as PRÓXIMAS importações.   ║
// ║                                                                          ║
// ║ Se você veio "corrigir" isto achando que faltou propagar: não faltou.    ║
// ║ É deliberado. Propagar reescreveria histórico contábil já conferido.     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Conflito: apelido já usado apontando para outro registro → SAI do antigo e
// entra no novo. O painel mostra ao operador de onde saiu, antes de confirmar.
// ============================================================================
import { supabase } from '@/integrations/supabase/client';
import { normalizar, type DeParaMap } from './importLancamentosView';

export interface ResultadoApelidos {
  subcentro: number;
  fornecedor: number;
  conta: number;
  erros: string[];
}

/** Só o que o operador resolveu à mão vira memória. O resto já resolve sozinho. */
function novosDoOperador(mapa: DeParaMap): Array<{ texto: string; valor: string }> {
  return Object.values(mapa)
    .filter((i) => i.origem === 'manual' && i.valor !== null)
    .map((i) => ({ texto: i.texto, valor: i.valor as string }));
}

/**
 * Subcentro. A tabela tem UNIQUE (cliente_id, lower(trim(alias_text))), então o
 * conflito se resolve por UPDATE da MESMA linha — que é literalmente "remover do
 * antigo e gravar no novo" quando a chave é o texto.
 *
 * `financeiro_subcentro_aliases` está fora dos types gerados; mesmo idioma do
 * FinV2SubcentroAliasesTab, dono da tabela. Ver pendência de regeneração.
 */
async function persistirSubcentro(
  clienteId: string,
  mapa: DeParaMap,
  planoIdPorSubcentro: Readonly<Record<string, string>>,
  aliasIdPorTexto: Readonly<Record<string, string>>,
): Promise<{ n: number; erros: string[] }> {
  const erros: string[] = [];
  let n = 0;

  for (const { texto, valor } of novosDoOperador(mapa)) {
    const planoContaId = planoIdPorSubcentro[valor];
    if (!planoContaId) {
      erros.push(`Apelido "${texto}": subcentro "${valor}" sem plano de contas correspondente.`);
      continue;
    }
    const existenteId = aliasIdPorTexto[normalizar(texto)];
    try {
      if (existenteId) {
        // Conflito: o texto já era apelido de outro subcentro. Repontar, não duplicar.
        const { error } = await (supabase as any)
          .from('financeiro_subcentro_aliases')
          .update({ plano_conta_id: planoContaId, ativo: true, updated_at: new Date().toISOString() })
          .eq('id', existenteId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('financeiro_subcentro_aliases')
          .insert({
            cliente_id: clienteId,
            alias_text: texto,
            plano_conta_id: planoContaId,
            origem: 'importacao',
          });
        if (error) throw error;
      }
      n++;
    } catch (e: unknown) {
      erros.push(`Apelido "${texto}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { n, erros };
}

/**
 * Apelidos em coluna jsonb (fornecedor e conta bancária). Sem índice único, então
 * o conflito é resolvido explicitamente: o texto sai do array de quem o tinha e
 * entra no do novo dono. Sem isso a resolução por alias fica ambígua e degrada.
 */
async function persistirJsonb(
  tabela: 'financeiro_fornecedores' | 'financeiro_contas_bancarias',
  mapa: DeParaMap,
  aliasesAtuais: Readonly<Record<string, string[]>>,
): Promise<{ n: number; erros: string[] }> {
  const erros: string[] = [];
  let n = 0;

  // Cópia mutável: várias trocas na mesma sessão precisam enxergar as anteriores.
  const estado: Record<string, string[]> = {};
  for (const [id, arr] of Object.entries(aliasesAtuais)) estado[id] = [...arr];

  for (const { texto, valor } of novosDoOperador(mapa)) {
    const alvo = normalizar(texto);
    const gravar: string[] = [];

    // 1) Tirar o texto de qualquer outro registro que o reivindique.
    for (const [id, arr] of Object.entries(estado)) {
      if (id === valor) continue;
      if (arr.some((a) => normalizar(a) === alvo)) {
        estado[id] = arr.filter((a) => normalizar(a) !== alvo);
        gravar.push(id);
      }
    }

    // 2) Acrescentar ao novo dono, sem duplicar.
    const doAlvo = estado[valor] ?? [];
    if (!doAlvo.some((a) => normalizar(a) === alvo)) {
      estado[valor] = [...doAlvo, texto];
      gravar.push(valor);
    }

    for (const id of gravar) {
      try {
        const { error } = await (supabase as any)
          .from(tabela)
          .update({ aliases: estado[id] })
          .eq('id', id);
        if (error) throw error;
      } catch (e: unknown) {
        erros.push(`Apelido "${texto}" em ${tabela}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (gravar.length > 0) n++;
  }
  return { n, erros };
}

export async function persistirApelidos(params: {
  clienteId: string;
  subcentro: DeParaMap;
  fornecedor: DeParaMap;
  conta: DeParaMap;
  planoIdPorSubcentro: Readonly<Record<string, string>>;
  aliasIdPorTexto: Readonly<Record<string, string>>;
  aliasesFornecedor: Readonly<Record<string, string[]>>;
  aliasesConta: Readonly<Record<string, string[]>>;
}): Promise<ResultadoApelidos> {
  const sub = await persistirSubcentro(
    params.clienteId, params.subcentro, params.planoIdPorSubcentro, params.aliasIdPorTexto);
  const forn = await persistirJsonb(
    'financeiro_fornecedores', params.fornecedor, params.aliasesFornecedor);
  const cta = await persistirJsonb(
    'financeiro_contas_bancarias', params.conta, params.aliasesConta);

  return {
    subcentro: sub.n,
    fornecedor: forn.n,
    conta: cta.n,
    erros: [...sub.erros, ...forn.erros, ...cta.erros],
  };
}
