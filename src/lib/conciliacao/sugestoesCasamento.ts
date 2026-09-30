/**
 * O MOTOR DE SUGESTÕES DE CASAMENTO — PR-CONC-SUGESTOES-CASAR-01. UM MOTOR, DOIS CONSUMIDORES.
 *
 * ⚠ O QUE SAIU DA PRÉVIA DA IMPORTAÇÃO SAIU VERBATIM (`useImportacaoExtrato.ts`): `diasEntre`, `LancamentoCandidato`,
 * `calcularScore`, `GrupoEncontrado`/`tryGroupingMatch` e `calcularScoreAgrupado`, byte a byte, só com `export` na
 * frente. A prévia continua chamando-os com os MESMOS parâmetros — este PR não muda o comportamento dela.
 * ⚠ O QUE É NOVO mora embaixo: a comparação por NOME (aceita o nome cortado pelo banco e o fornecedor com lixo depois do
 * ";") e `sugerirCasamentos`, que a Conferência usa no "Ver sugestões" de um extrato sem par.
 * Funções PURAS: sem React, sem supabase. O único estado de fora é o relógio do orçamento da soma.
 */
import { normalizarTexto } from '@/lib/financeiro/extratoHash';
import { dataAncoraLancamento } from '@/lib/financeiro/dataAncora';

export function diasEntre(a: string, b: string): number {
  const d1 = new Date(a + 'T00:00:00').getTime();
  const d2 = new Date(b + 'T00:00:00').getTime();
  return Math.round((d1 - d2) / 86400000);
}

export interface LancamentoCandidato {
  id: string;
  data_pagamento: string | null;
  data_vencimento: string | null;
  data_competencia: string | null;
  valor: number;
  sinal: number;
  descricao: string | null;
  favorecido_id: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  status_transacao: string | null;
  numero_documento: string | null;
  fazenda_id: string | null;
  conta_bancaria_id: string | null;
}

/**
 * Score 0-100 de match entre movimento do extrato e lançamento financeiro.
 * Pré-condição: |valor| do extrato == |valor| do lançamento (tol 0.01).
 *   - 70 pontos: valor exato
 *   - +20:        diferença de data ≤ 3 dias
 *   - +10:        descrição/fornecedor similar
 */
export function calcularScore(
  movDataISO: string,
  movDescricao: string,
  lanc: LancamentoCandidato,
  fornNome: string | null,
): number {
  let score = 70;
  const ancScore = dataAncoraLancamento(lanc);
  if (ancScore) {
    const diff = Math.abs(diasEntre(movDataISO, ancScore));
    if (diff <= 3) score += 20;
  }
  const movN = normalizarTexto(movDescricao);
  const lancN = normalizarTexto(lanc.descricao);
  const fornN = normalizarTexto(fornNome);
  if (movN && (
    (lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
    (fornN && movN.includes(fornN))
  )) {
    score += 10;
  }
  return score;
}

/**
 * Heurística gulosa para encontrar combinação de até `maxItens` lançamentos
 * cuja soma de |valor| seja ≈ `target` (tol 0.05).
 *
 * Estratégia:
 *   - Pool ordenado por proximidade da data do movimento (heurística forte).
 *   - DFS limitado por profundidade e tempo (timeoutMs).
 *   - Poda: candidatos cujo |valor| > restante+0.05 são pulados.
 *   - Quando encontra solução, mantém a com MENOS itens (ties: mais próxima da data).
 *
 * Retorna `null` se não houver combinação viável dentro do orçamento.
 */
export interface GrupoEncontrado {
  itens: LancamentoCandidato[];
  somaAbs: number;
}
export function tryGroupingMatch(
  target: number,
  pool: LancamentoCandidato[],
  movDataISO: string,
  maxItens: number,
  timeoutMs: number,
): GrupoEncontrado | null {
  if (pool.length === 0 || target <= 0) return null;

  // Ordena por proximidade da data — primeiros são candidatos mais prováveis.
  const ordenado = [...pool].sort((a, b) => {
    const ancA = dataAncoraLancamento(a);
    const ancB = dataAncoraLancamento(b);
    const da = ancA ? Math.abs(diasEntre(movDataISO, ancA)) : 999;
    const db = ancB ? Math.abs(diasEntre(movDataISO, ancB)) : 999;
    return da - db;
  });

  const start = Date.now();
  let melhor: GrupoEncontrado | null = null;
  const atual: LancamentoCandidato[] = [];

  function dfs(startIdx: number, restante: number, depth: number) {
    if (Date.now() - start > timeoutMs) return;
    if (Math.abs(restante) < 0.05) {
      if (melhor === null || atual.length < melhor.itens.length) {
        const somaAbs = target - restante; // = soma acumulada dos itens
        melhor = { itens: [...atual], somaAbs: Math.abs(somaAbs) };
      }
      return;
    }
    if (depth >= maxItens) return;
    if (restante < -0.05) return; // ultrapassou demais
    // Poda: se já temos solução com K itens, parar quando atual.length+1 >= K
    if (melhor !== null && atual.length + 1 >= melhor.itens.length) return;

    for (let i = startIdx; i < ordenado.length; i++) {
      if (Date.now() - start > timeoutMs) return;
      const v = Math.abs(Number(ordenado[i].valor) || 0);
      if (v > restante + 0.05) continue;
      atual.push(ordenado[i]);
      dfs(i + 1, restante - v, depth + 1);
      atual.pop();
    }
  }

  dfs(0, target, 0);
  return melhor;
}

/**
 * Score para match agrupado. Teto = 89 (nunca supera match 1:1 max=100).
 *
 * Bônus:
 *   +20 — Δ data média do grupo até a data do movimento ≤ 3 dias
 *   +10 — >50% dos itens têm fornecedor/descrição similar ao movimento
 *   +10 — todos os itens compartilham mesma `macro_custo` (coerência)
 *   +10 — span (max-min) entre datas do grupo ≤ 3 dias (compactness)
 *
 * Penalidades:
 *   -10 — grupo com > 5 itens (preferir grupos pequenos)
 *   -10 — múltiplas macros (mistura de naturezas)
 *    -5 — span > 7 dias entre as datas do grupo
 *
 * Base = 50. Após bônus/penalidades, teto duro em 89.
 */
export function calcularScoreAgrupado(
  movDataISO: string,
  movDescricao: string,
  itens: LancamentoCandidato[],
  fornByLancId: Map<string, string>,
): number {
  if (itens.length === 0) return 0;
  let score = 50;

  // ── Δ data média ──
  const datas = itens.map((l) => dataAncoraLancamento(l)).filter((d): d is string => !!d);
  let span = 0;
  if (datas.length > 0) {
    const ts = datas.map((d) => new Date(d + 'T00:00:00').getTime());
    const mediaTs = ts.reduce((s, x) => s + x, 0) / ts.length;
    const movTs = new Date(movDataISO + 'T00:00:00').getTime();
    const diasMedios = Math.abs((mediaTs - movTs) / 86400000);
    if (diasMedios <= 3) score += 20;
    span = (Math.max(...ts) - Math.min(...ts)) / 86400000;
  }

  // ── descrição/fornecedor similar ──
  const movN = normalizarTexto(movDescricao);
  if (movN) {
    let similares = 0;
    for (const l of itens) {
      const lancN = normalizarTexto(l.descricao);
      const fornN = normalizarTexto(l.favorecido_id ? fornByLancId.get(l.id) ?? null : null);
      if ((lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
          (fornN && movN.includes(fornN))) {
        similares++;
      }
    }
    if (similares / itens.length > 0.5) score += 10;
  }

  // ── coerência de macro_custo ──
  const macros = new Set(itens.map((l) => l.macro_custo).filter((m): m is string => !!m));
  if (macros.size === 1) score += 10;
  if (macros.size > 1) score -= 10;

  // ── compactness das datas ──
  if (datas.length > 0) {
    if (span <= 3) score += 10;
    else if (span > 7) score -= 5;
  }

  // ── tamanho do grupo ──
  if (itens.length > 5) score -= 10;

  return Math.max(0, Math.min(89, score));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   DAQUI PARA BAIXO É NOVO — PR-CONC-SUGESTOES-CASAR-01.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * O NOME NO HISTÓRICO DO BANCO — a comparação que a prévia não tinha.
 *
 * ⚠ O `includes` da prévia (`calcularScore`) pede o nome INTEIRO dentro do histórico, e o banco quase nunca o traz
 * inteiro: "PIX ENVIADO 14:32 GUSTAVO MAIA" não contém "Gustavo Maia Rezende"; "FERNANDO HENRIQUE ZANDONA" corta o
 * "Zandonadi" que o cadastro tem; e o cadastro traz lixo depois do ";" ("Fernando Henrique Zandonadi; Gasto
 * Recorrente..."). A comparação aqui é por PALAVRAS:
 *   - do histórico sai o RUÍDO DO BANCO (PIX, TED, hora, data, número solto);
 *   - do fornecedor saem as PALAVRAS DE LIGAÇÃO (DE, DA, LTDA, ME...) e tudo depois do ";";
 *   - casa com 2+ palavras (de 3+ letras) do fornecedor no histórico, OU 1 palavra DISTINTIVA (5+ letras);
 *   - a ÚLTIMA palavra do histórico pode ser o COMEÇO (4+ letras) de uma do fornecedor — é onde o banco corta.
 * ⚠ A FORÇA É O NÚMERO DE PALAVRAS: com dois "Gustavo" de mesmo valor, o "Gustavo Maia" (2 palavras) vem antes do
 *   "Gustavo Fernando" (1). É isso que ordena, não a ordem do banco.
 */
const RUIDO_DO_BANCO = new Set(['PIX', 'AGENDAMENTO', 'ENVIADO', 'RECEBIDO', 'PAGAMENTO', 'BOLETO', 'TED', 'DOC', 'TRANSF']);
const LIGACAO_DO_NOME = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'LTDA', 'SA', 'S/A', 'ME', 'EIRELI', 'CIA']);
/**
 * PALAVRAS GENÉRICAS — contam na força, mas NÃO fazem o nome casar sozinhas (decisão do Gabriel, 30/09). Medido no
 * NJ · BB · set/26: das 126 sugestões "nome · valor diferente", a maioria vinha de UMA palavra comum — BRASIL (25),
 * SEGUROS (19), SILVA (8), RURAL (5), SANTOS, GERAIS. Com elas, o nome só casa se houver mais uma palavra distintiva.
 */
export const PALAVRAS_GENERICAS = new Set([
  'BRASIL', 'BANCO', 'SEGURO', 'SEGUROS', 'SEGURADORA', 'RURAL', 'GERAIS', 'NACIONAL', 'CENTRAL', 'COMERCIO',
  'COMERCIAL', 'PRODUTOS', 'SERVICOS', 'DISTRIBUIDORA', 'INDUSTRIA', 'AGRO', 'AGROPECUARIA', 'COMPANHIA', 'SILVA',
  'SANTOS', 'SOUZA', 'SOUSA', 'OLIVEIRA', 'PEREIRA', 'LIMA', 'COSTA', 'FERREIRA', 'RODRIGUES', 'ALVES', 'GOMES',
  'NASCIMENTO',
]);

/** As palavras do histórico, sem o ruído do banco, sem hora (hh:mm), data (dd/mm[/aa]) e número solto. */
export function palavrasDoHistorico(historico: string | null | undefined): string[] {
  const t = normalizarTexto(historico)
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  return t.split(/[^A-Z0-9]+/).filter((p) => p && !/^\d+$/.test(p) && !RUIDO_DO_BANCO.has(p));
}

/** As palavras do nome do fornecedor: só o que vem antes do ";", sem as palavras de ligação. */
export function palavrasDoFornecedor(fornecedor: string | null | undefined): string[] {
  const antes = (fornecedor ?? '').split(';')[0];
  const t = normalizarTexto(antes);
  if (!t) return [];
  const semSA = t.replace(/\bS\/A\b/g, ' ');
  return semSA.split(/[^A-Z0-9]+/).filter((p) => p && !/^\d+$/.test(p) && !LIGACAO_DO_NOME.has(p));
}

/**
 * Quantas palavras do fornecedor aparecem no histórico (0 = não casa). Devolve 0 quando a regra não fecha: 1 palavra
 * só vale se tiver 5+ letras, e é preciso ao menos UMA palavra que não seja genérica (`PALAVRAS_GENERICAS`).
 */
export function forcaDoNome(historico: string | null | undefined, fornecedor: string | null | undefined): number {
  const hist = palavrasDoHistorico(historico);
  const forn = palavrasDoFornecedor(fornecedor);
  if (hist.length === 0 || forn.length === 0) return 0;
  const noHist = new Set(hist);
  const ultima = hist[hist.length - 1];
  const achadas = new Set<string>();
  for (const p of forn) {
    if (p.length < 3) continue;
    if (noHist.has(p)) { achadas.add(p); continue; }
    /* ⚠ O PEDAÇO CORTADO NÃO PODE SER GENÉRICO: "ALVORADA COM DE PROD AGRO" casava com "Agroinblue" porque AGRO é o
       começo de AGROINBLUE — medido no NJ · BB · set/26. Palavra genérica não identifica ninguém, cortada ou inteira. */
    if (ultima.length >= 4 && !PALAVRAS_GENERICAS.has(ultima) && p.length > ultima.length && p.startsWith(ultima)) achadas.add(p);
  }
  const distintivas = [...achadas].filter((p) => !PALAVRAS_GENERICAS.has(p));
  if (distintivas.length === 0) return 0;
  if (achadas.size >= 2) return achadas.size;
  if (distintivas[0].length >= 5) return 1;
  return 0;
}

/** O que o motor precisa de um candidato do sistema — o `sistema_candidatos` de `fn_extratos_espelhados` o cobre. */
export interface CandidatoSugestao {
  lancamento_id: string;
  data_vencimento: string | null;
  competencia: string | null;
  valor_assinado: number;
  descricao: string | null;
  fornecedor: string | null;
  favorecido_id: string | null;
  status_transacao: string | null;
  ja_conciliado?: boolean;
}

export interface ExtratoParaSugerir { data: string | null; historico: string | null; valor: number; }

/** Na ordem em que aparecem: o mais provável primeiro. */
export type TipoSugestao = 'mesmo_valor_nome' | 'mesmo_valor' | 'soma' | 'nome_valor' | 'nome_soma' | 'soma_mista';
/* ⚠ A SOMA DE FORNECEDORES DIFERENTES VEM POR ÚLTIMO — nunca acima de uma pista de nome (decisão do Gabriel, 30/09). */
const ORDEM_DO_TIPO: Record<TipoSugestao, number> = {
  mesmo_valor_nome: 0, mesmo_valor: 1, soma: 2, nome_valor: 3, nome_soma: 4, soma_mista: 5,
};

export interface Sugestao {
  lancamentos: CandidatoSugestao[];
  tipo: TipoSugestao;
  /** O texto do selo: "mesmo valor · nome", "soma de 2 · 14 dias", "nome · valor diferente · vencido ago". */
  motivo: string;
  /** Maior distância, em dias, entre o banco e um lançamento da sugestão. */
  diasDiff: number;
  /** Algum lançamento vence em mês ANTERIOR ao do movimento do banco. */
  vencido: boolean;
  /** O valor (ou a soma) não é o do banco: o selo é âmbar, "conferir antes de casar". */
  valorDiferente: boolean;
}

export interface OpcoesSugestao {
  /** Orçamento TOTAL da busca por soma, em ms. A contagem por linha usa pouco; o modal, ~30. */
  orcamentoMs?: number;
  /** Teto da lista. */
  maximo?: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TOL_VALOR = 0.01;
const TOL_SOMA = 0.05;

/** O candidato na forma que o motor da prévia lê (`dataAncoraLancamento` cai no vencimento e depois na competência). */
function comoLancamento(c: CandidatoSugestao): LancamentoCandidato {
  return {
    id: c.lancamento_id, data_pagamento: null, data_vencimento: c.data_vencimento, data_competencia: c.competencia,
    valor: Math.abs(Number(c.valor_assinado) || 0), sinal: Number(c.valor_assinado) < 0 ? -1 : 1,
    descricao: c.descricao, favorecido_id: c.favorecido_id, macro_custo: null, grupo_custo: null, centro_custo: null,
    subcentro: null, status_transacao: c.status_transacao, numero_documento: null, fazenda_id: null, conta_bancaria_id: null,
  };
}

/**
 * AS SUGESTÕES PARA UM MOVIMENTO DO BANCO SEM PAR, a mais provável primeiro, no máximo 10.
 *   E1 — mesmo valor (tol 0,01); com o nome no histórico, sobe para o topo ("mesmo valor · nome").
 *   E2 — soma que dá o valor (tol 0,05). Dentro do MESMO fornecedor, 2 a 8 lançamentos, azul. Entre fornecedores
 *        DIFERENTES, no máximo 3 e SEMPRE âmbar ("soma de N · fornecedores diferentes"), por último na lista.
 *        ⚠ NASCE DE MEDIÇÃO (NJ · BB · set/26): com 2..8 no geral, 62 somas misturavam fornecedores e 54 tinham 4+
 *        itens — o Camargo de −5.665,00 "fechava" com seis seguros e um consórcio, em azul, acima da Amanda. Com 38
 *        candidatos e 8 itens, soma exata por coincidência é a regra, não a exceção.
 *   E3 — o nome casa mas o valor não: um lançamento ("nome · valor diferente") ou todos os daquele fornecedor
 *        ("nome · soma diferente"). Âmbar: é pista, não prova — o operador confere antes de casar.
 * ⚠ SÓ O QUE PODE CASAR: sinal igual ao do banco (entrada com entrada) e nada já conciliado.
 * ⚠ "vencido <mês>" em tudo que vence em mês ANTERIOR ao do movimento: o operador casa um atrasado sabendo.
 * ⚠ A SOMA É A `tryGroupingMatch` DA PRÉVIA, a mesma função, com orçamento de tempo: nunca trava a tela.
 */
export function sugerirCasamentos(
  extrato: ExtratoParaSugerir,
  candidatos: readonly CandidatoSugestao[],
  opcoes: OpcoesSugestao = {},
): Sugestao[] {
  const orcamentoMs = opcoes.orcamentoMs ?? 30;
  const maximo = opcoes.maximo ?? 10;
  const valorBanco = Number(extrato.valor) || 0;
  const alvo = Math.abs(valorBanco);
  if (alvo < TOL_VALOR || !extrato.data) return [];
  const dataBanco = extrato.data;
  const mesBanco = dataBanco.slice(0, 7);
  const sinalBanco = Math.sign(valorBanco);

  const pool = candidatos.filter((c) => !c.ja_conciliado && Math.sign(Number(c.valor_assinado) || 0) === sinalBanco);
  const lancs = new Map(pool.map((c) => [c.lancamento_id, comoLancamento(c)]));
  const dias = (c: CandidatoSugestao) => {
    const anc = dataAncoraLancamento(lancs.get(c.lancamento_id)!);
    return anc ? Math.abs(diasEntre(dataBanco, anc)) : 999;
  };
  const mesVencido = (itens: CandidatoSugestao[]) => {
    const antes = itens.map((c) => c.data_vencimento).filter((d): d is string => !!d && d.slice(0, 7) < mesBanco).sort();
    return antes.length ? MESES[Number(antes[0].slice(5, 7)) - 1] : null;
  };
  const forca = new Map(pool.map((c) => [c.lancamento_id, forcaDoNome(extrato.historico, c.fornecedor)]));

  const saida: (Sugestao & { forca: number })[] = [];
  const vistas = new Set<string>();
  const pos = (tipo: TipoSugestao, itens: CandidatoSugestao[], base: string, valorDiferente: boolean) => {
    const chave = itens.map((c) => c.lancamento_id).sort().join('|');
    if (vistas.has(chave)) return;
    vistas.add(chave);
    const venc = mesVencido(itens);
    saida.push({
      lancamentos: itens, tipo, valorDiferente, vencido: !!venc,
      motivo: venc ? `${base} · vencido ${venc}` : base,
      diasDiff: Math.max(...itens.map(dias)),
      forca: Math.max(...itens.map((c) => forca.get(c.lancamento_id) ?? 0)),
    });
  };

  // ── E1: mesmo valor ──
  const iguais = new Set<string>();
  for (const c of pool) {
    if (Math.abs(Math.abs(Number(c.valor_assinado)) - alvo) > TOL_VALOR) continue;
    iguais.add(c.lancamento_id);
    const comNome = (forca.get(c.lancamento_id) ?? 0) > 0;
    pos(comNome ? 'mesmo_valor_nome' : 'mesmo_valor', [c], comNome ? 'mesmo valor · nome' : 'mesmo valor', false);
  }

  // ── E2: soma de 2..8 que dá o valor — primeiro dentro do mesmo fornecedor ──
  const prazo = Date.now() + orcamentoMs;
  const menores = pool.filter((c) => !iguais.has(c.lancamento_id) && Math.abs(Number(c.valor_assinado)) < alvo - TOL_SOMA);
  const chaveForn = (c: CandidatoSugestao) => c.favorecido_id ?? (c.fornecedor ? `nome:${normalizarTexto(c.fornecedor)}` : null);
  const porFornecedor = new Map<string, CandidatoSugestao[]>();
  for (const c of menores) {
    const k = chaveForn(c);
    if (!k) continue;
    porFornecedor.set(k, [...(porFornecedor.get(k) ?? []), c]);
  }
  const porId = new Map(pool.map((c) => [c.lancamento_id, c]));
  const tentarSoma = (grupo: CandidatoSugestao[], maxItens: number) => {
    const resta = prazo - Date.now();
    if (grupo.length < 2 || resta <= 0) return;
    const achado = tryGroupingMatch(alvo, grupo.map((c) => lancs.get(c.lancamento_id)!), dataBanco, maxItens, resta);
    if (!achado || achado.itens.length < 2) return;
    const itens = achado.itens.map((l) => porId.get(l.id)!);
    const chaves = new Set(itens.map(chaveForn));
    if (chaves.size === 1 && !chaves.has(null)) {
      pos('soma', itens, `soma de ${itens.length} · ${Math.max(...itens.map(dias))} dias`, false);
    } else {
      pos('soma_mista', itens, `soma de ${itens.length} · fornecedores diferentes`, true);
    }
  };
  for (const grupo of porFornecedor.values()) tentarSoma(grupo, 8);
  /* No geral, os 30 mais perto da data — o mesmo corte da prévia —, mas com no máximo 3: acima disso é coincidência. */
  tentarSoma([...menores].sort((a, b) => dias(a) - dias(b)).slice(0, 30), 3);

  // ── E3: o nome casa, o valor não ──
  const doNome = pool.filter((c) => (forca.get(c.lancamento_id) ?? 0) > 0 && !iguais.has(c.lancamento_id));
  for (const c of doNome) pos('nome_valor', [c], 'nome · valor diferente', true);
  const nomePorFornecedor = new Map<string, CandidatoSugestao[]>();
  for (const c of doNome) {
    const k = c.favorecido_id ?? `nome:${normalizarTexto(c.fornecedor)}`;
    nomePorFornecedor.set(k, [...(nomePorFornecedor.get(k) ?? []), c]);
  }
  for (const grupo of nomePorFornecedor.values()) {
    if (grupo.length < 2) continue;
    const itens = [...grupo].sort((a, b) => dias(a) - dias(b)).slice(0, 8);
    const soma = itens.reduce((s, c) => s + Math.abs(Number(c.valor_assinado)), 0);
    if (Math.abs(soma - alvo) <= TOL_SOMA) continue; // a soma exata já é E2
    pos('nome_soma', itens, 'nome · soma diferente', true);
  }

  saida.sort((a, b) => ORDEM_DO_TIPO[a.tipo] - ORDEM_DO_TIPO[b.tipo] || b.forca - a.forca || a.diasDiff - b.diasDiff);
  return saida.slice(0, maximo).map(({ forca: _f, ...s }) => s);
}
