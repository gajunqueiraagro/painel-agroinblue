/**
 * O QUE A LISTA LEMBRA ENTRE UMA VISITA E OUTRA — FIN-LISTA-FILTROS-01a.
 *
 * ⚠ A INVERSÃO QUE ISTO CORRIGE: até aqui a tela guardava o TEXTO DIGITADO nos combos
 * (`sessionStorage`, por instância) e NÃO guardava o valor ESCOLHIDO. O operador voltava e
 * encontrava "valdei" numa caixa de busca ao lado de um campo que dizia "Todos" — a memória
 * do gesto abandonado, e o esquecimento da decisão.
 *
 * ⚠ SÓ O ATIVO PERSISTE, e é a regra inteira: um filtro no padrão não é uma escolha, é a
 * ausência dela. Guardar `'__all__'` faria a tela "restaurar" um estado que ninguém pediu, e
 * — pior — impediria que um default futuro mudasse para quem já tem sessão.
 * ⚠ `sessionStorage` E NÃO `localStorage`, pela mesma razão do `ultimaAtividade`: herdar
 * amanhã um recorte de hoje faz o operador procurar lançamentos que o filtro está escondendo.
 */
export const CHAVE_FILTROS_LISTA = 'financeirov2_filtros_ativos';

/** O que vale a pena lembrar. Datas e paginação ficam de fora: são do momento, não da escolha. */
export interface FiltrosPersistiveis {
  [campo: string]: string | string[] | undefined;
}

/**
 * Devolve só os campos que DIFEREM do padrão. `{}` quando nada está filtrado — e `{}` é o
 * sinal de que não há o que guardar.
 */
export function apenasAtivos(
  atuais: FiltrosPersistiveis, padroes: FiltrosPersistiveis,
): FiltrosPersistiveis {
  const ativos: FiltrosPersistiveis = {};
  for (const campo of Object.keys(atuais)) {
    const v = atuais[campo];
    const p = padroes[campo];
    if (Array.isArray(v)) {
      /* Lista vazia é "sem filtro" em todos os multisseletores da tela (meses, status). */
      if (v.length > 0 && !mesmaLista(v, Array.isArray(p) ? p : [])) ativos[campo] = v;
      continue;
    }
    if (v === undefined || v === '' || v === p) continue;
    ativos[campo] = v;
  }
  return ativos;
}

function mesmaLista(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Verdadeiro quando não há nada guardado — o caso de "Limpar" e o de quem nunca filtrou. */
export function vazio(f: FiltrosPersistiveis): boolean {
  return Object.keys(f).length === 0;
}

export function guardarFiltros(ativos: FiltrosPersistiveis): void {
  try {
    if (vazio(ativos)) sessionStorage.removeItem(CHAVE_FILTROS_LISTA);
    else sessionStorage.setItem(CHAVE_FILTROS_LISTA, JSON.stringify(ativos));
  } catch { /* storage bloqueado — a memória é conforto, não contrato */ }
}

export function lerFiltros(): FiltrosPersistiveis | null {
  try {
    const raw = sessionStorage.getItem(CHAVE_FILTROS_LISTA);
    if (!raw) return null;
    /* Sem `as`: `JSON.parse` devolve `any`, e a anotação do destino é o que estreita o tipo.
       A guarda abaixo é de RUNTIME — o tipo não prova nada sobre o que veio do storage. */
    const f: FiltrosPersistiveis = JSON.parse(raw);
    if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
    return f;
  } catch { return null; }
}

export function esquecerFiltros(): void {
  try { sessionStorage.removeItem(CHAVE_FILTROS_LISTA); } catch { /* idem */ }
}
