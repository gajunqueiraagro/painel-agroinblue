// ============================================================================
// importLancamentosView — PR-IMPORT-EXCEL-LANC-01. Selectors PUROS da
// importação de lançamentos por planilha.
//
// Responsabilidades: levantar os valores distintos de cada campo que mapeia
// para uma lista do sistema, PRÉ-RESOLVER o que a máquina consegue, e derivar
// a prévia (o que entra, o que fica de fora e por quê) com os totais.
//
// PURO: sem React, sem supabase, sem efeito. Recebe catálogos já carregados.
// NÃO grava — a gravação é o passo 4, fora deste módulo.
//
// REGRA HERDADA (financeiro_subcentro_aliases): resolução por igualdade
// normalizada apenas. PROIBIDO fuzzy, LIKE, ILIKE. A única tolerância é
// lower/trim/sem-acento, idêntica ao lookup do servidor.
// ============================================================================
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import {
  resolverContaPorTexto,
  type ContaResolvivel,
} from '@/v2/lib/mesa/resolverConta';
import {
  TIPO_ENTRADAS, TIPO_SAIDAS, TIPO_TRANSFERENCIAS,
  type LancamentoExcelRow,
} from '@/v2/lib/excelPreview/parserLancamentos';

// ─── Tipos de apoio ─────────────────────────────────────────────────

/** Alias de subcentro já carregado do banco (financeiro_subcentro_aliases). */
export interface SubcentroAliasRef {
  id: string;
  cliente_id: string | null;   // null = alias global
  alias_text: string;
  plano_conta_id: string;
  subcentro: string;           // resolvido via join com financeiro_plano_contas
}

/** Mês fechado, por (fazenda_id, ano_mes) — de financeiro_fechamentos. */
export type ChaveFechamento = string;   // `${fazenda_id}|${ano_mes}`

export const chaveFechamento = (fazendaId: string, anoMes: string): ChaveFechamento =>
  `${fazendaId}|${anoMes}`;

/** Uma entrada do painel de de-para: valor distinto do Excel → registro do sistema. */
export interface DeParaItem<TValor = string> {
  /** Texto exatamente como veio da planilha (é o futuro alias_text). */
  texto: string;
  /** Quantas linhas usam este texto. */
  qtd: number;
  /** Resolução atual. null = pendente. */
  valor: TValor | null;
  /** Como chegou aqui — governa o selo na tela e o que será persistido. */
  origem: 'alias' | 'cadastro' | 'manual' | 'pendente';
  /** Rótulo legível do registro resolvido (para exibir sem novo lookup). */
  rotulo: string | null;
  /**
   * Para onde o APELIDO apontava antes de o operador trocar. Só é preenchido
   * quando a pré-resolução veio de alias; serve para a tela mostrar de onde o
   * texto saiu, antes da confirmação. Não influencia gravação nenhuma.
   */
  anterior?: string | null;
  /**
   * PR-IMPORT-EXCEL-LANC-04 — terceira saída do de-para: o texto existe na planilha
   * mas NÃO corresponde a nada no sistema e nem deveria (caso real: "terceiros" na
   * coluna de conta bancária, que não é conta).
   *
   * Descartado deixa de contar como pendência e é reversível. NÃO vira apelido:
   * descarte é decisão DESTA sessão. Gravar "não é nada" numa tabela cujo contrato
   * é "este texto significa X" distorceria o significado dela — e, no caso do
   * subcentro, é impossível: plano_conta_id é NOT NULL.
   */
  descartado?: boolean;
}

export type DeParaMap = Record<string, DeParaItem>;

export interface CatalogosImport {
  classificacoes: ClassificacaoItem[];
  fazendas: Fazenda[];
  fornecedores: FornecedorV2[];
  contas: ContaResolvivel[];
  aliasesSubcentro: SubcentroAliasRef[];
  /** fornecedorId → aliases (coluna jsonb de financeiro_fornecedores). */
  aliasesFornecedor: Readonly<Record<string, string[]>>;
  /** Chaves de (fazenda, ano_mes) fechados. */
  fechados: ReadonlySet<ChaveFechamento>;
  /** B-22d — cadastro de safras do cliente, para o quinto campo do de-para. */
  safras: SafraRef[];
}

/** O que o de-para precisa de uma safra do cadastro. */
export interface SafraRef {
  id: string;
  nome: string;
  codigo?: string | null;
}

// ─── Normalização (única tolerância permitida) ──────────────────────

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Levantamento de distintos ──────────────────────────────────────

function distintos(
  rows: LancamentoExcelRow[],
  campo: (r: LancamentoExcelRow) => string | null,
): Array<{ texto: string; qtd: number }> {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const t = campo(r)?.trim();
    if (!t || t === '-') continue;
    acc.set(t, (acc.get(t) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([texto, qtd]) => ({ texto, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.texto.localeCompare(b.texto, 'pt-BR'));
}

// ─── Pré-resolução por campo ────────────────────────────────────────

/**
 * Subcentro. Ordem idêntica à do servidor (fn_classificacao_populate_staging):
 *   1. alias do cliente · 2. alias global · 3. lookup direto no plano.
 */
export function preResolverSubcentro(
  texto: string,
  cat: Pick<CatalogosImport, 'classificacoes' | 'aliasesSubcentro'>,
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);

  const doCliente = cat.aliasesSubcentro.find(
    (a) => a.cliente_id !== null && normalizar(a.alias_text) === alvo,
  );
  if (doCliente) return { valor: doCliente.subcentro, origem: 'alias', rotulo: doCliente.subcentro };

  const global = cat.aliasesSubcentro.find(
    (a) => a.cliente_id === null && normalizar(a.alias_text) === alvo,
  );
  if (global) return { valor: global.subcentro, origem: 'alias', rotulo: global.subcentro };

  const direto = cat.classificacoes.find((c) => normalizar(c.subcentro) === alvo);
  if (direto) return { valor: direto.subcentro, origem: 'cadastro', rotulo: direto.subcentro };

  return { valor: null, origem: 'pendente', rotulo: null };
}

/**
 * Fazenda. Sem memória própria por decisão do briefing — testa as DUAS chaves
 * do cadastro (codigo_importacao e codigo), que podem divergir entre si
 * (V2Fazendas atualiza só codigo_importacao). O que não resolver fica na sessão.
 */
export function preResolverFazenda(
  texto: string,
  fazendas: Fazenda[],
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);
  const achou = fazendas.find((f) =>
    (f.codigo_importacao ? normalizar(f.codigo_importacao) === alvo : false) ||
    (f.codigo ? normalizar(f.codigo) === alvo : false) ||
    normalizar(f.nome) === alvo);
  return achou
    ? { valor: achou.id, origem: 'cadastro', rotulo: achou.nome }
    : { valor: null, origem: 'pendente', rotulo: null };
}

/**
 * Fornecedor. Nome exato normalizado (mesma régua do servidor) + aliases do cadastro.
 * Os aliases vêm SEPARADOS porque loadFornecedores (useFinanceiroV2) não seleciona a
 * coluna `aliases`; o hook busca o mapa à parte e injeta aqui. Sem cast.
 */
export function preResolverFornecedor(
  texto: string,
  fornecedores: FornecedorV2[],
  aliasesPorFornecedor: Readonly<Record<string, string[]>>,
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);

  const porAlias = fornecedores.find((f) =>
    (aliasesPorFornecedor[f.id] ?? []).some((a) => normalizar(String(a)) === alvo));
  if (porAlias) return { valor: porAlias.id, origem: 'alias', rotulo: porAlias.nome };

  const porNome = fornecedores.find((f) => normalizar(f.nome) === alvo);
  if (porNome) return { valor: porNome.id, origem: 'cadastro', rotulo: porNome.nome };

  return { valor: null, origem: 'pendente', rotulo: null };
}

/** Conta bancária. Delega ao resolvedor soberano (camada 0 = alias jsonb do cadastro). */
export function preResolverConta(
  texto: string,
  contas: ContaResolvivel[],
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const r = resolverContaPorTexto(texto, contas);
  if (!r) return { valor: null, origem: 'pendente', rotulo: null };
  return {
    valor: r.id,
    origem: r.estrategia === 'alias' ? 'alias' : 'cadastro',
    rotulo: r.nome_exibicao,
  };
}

// ─── Montagem dos quatro painéis ────────────────────────────────────

export interface DeParaCompleto {
  subcentro: DeParaMap;
  fazenda: DeParaMap;
  fornecedor: DeParaMap;
  conta: DeParaMap;
  /** B-22d — o quinto campo do mesmo motor. */
  safra: DeParaMap;
}

/**
 * O separador da CHAVE COMPOSTA conta+safra — B-22d.
 *
 * ⚠ O PLANO DO CLIENTE PODE SEPARAR O QUE O NOSSO JUNTA. No NJ, a coluna Conta
 * diz "Manutenção de Máquinas" e a Safra diz se é pecuária ou agricultura — o
 * mesmo texto de conta vira dois subcentros diferentes. Sem a chave composta, o
 * operador contorna concatenando no Excel, e a planilha passa a carregar uma
 * fórmula que ninguém mais entende seis meses depois.
 * ⚠ `⟂` PORQUE ESTÁ LIVRE: medido no Proto, os 19 aliases existentes não o
 * contêm, e ele não aparece em texto de plano de contas nenhum. Um separador que
 * apareça no dado transformaria uma conta legítima em chave partida.
 * ⚠ NÃO É COLUNA NOVA: `alias_text` é `text` sem limite e o índice único é sobre
 * `lower(trim(alias_text))` — a chave composta é só outro texto, e convive com a
 * simples sem colisão.
 */
export const SEP_CHAVE_COMPOSTA = ' ⟂ ';

/** A chave do de-para de subcentro: composta quando a conta é ambígua. */
export const chaveSubcentro = (contaTexto: string, safraTexto: string | null): string =>
  safraTexto ? `${contaTexto}${SEP_CHAVE_COMPOSTA}${safraTexto}` : contaTexto;

/**
 * Textos de conta que aparecem no arquivo com MAIS DE UMA safra.
 *
 * ⚠ A CONDIÇÃO É OBSERVÁVEL, e é o que a torna possível: comparar o `escopo_negocio`
 * do subcentro candidato seria circular — o candidato só existe depois do
 * mapeamento que esta função serve para desdobrar. "Mesma conta, safras
 * diferentes" se vê no arquivo, antes de resolver qualquer coisa.
 * ⚠ O CUSTO ACEITO: desdobra também quando as duas safras iriam ao mesmo
 * subcentro. Acontece só quando há duas safras de fato, o operador responde uma
 * vez a mais, e a memória guarda os dois pares — na planilha seguinte, nenhuma
 * pergunta. (`financeiro_safras` tem `escopo_negocio`, então a detecção precisa
 * existe se um dia isto incomodar.)
 */
export function contasAmbiguas(rows: LancamentoExcelRow[]): ReadonlySet<string> {
  const safrasPorConta = new Map<string, Set<string>>();
  for (const r of rows) {
    const conta = r.conta_plano_texto?.trim();
    const safra = r.safra_texto?.trim();
    if (!conta || !safra) continue;
    const set = safrasPorConta.get(conta) ?? new Set<string>();
    set.add(safra);
    safrasPorConta.set(conta, set);
  }
  const out = new Set<string>();
  for (const [conta, safras] of safrasPorConta) if (safras.size > 1) out.add(conta);
  return out;
}

function montarMapa(
  itens: Array<{ texto: string; qtd: number }>,
  resolver: (texto: string) => Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'>,
): DeParaMap {
  const out: DeParaMap = {};
  for (const { texto, qtd } of itens) {
    const r = resolver(texto);
    out[texto] = { texto, qtd, ...r, anterior: r.origem === 'alias' ? r.rotulo : null };
  }
  return out;
}

export function montarDePara(
  rows: LancamentoExcelRow[],
  cat: CatalogosImport,
): DeParaCompleto {
  /* ⚠ A CHAVE DE SUBCENTRO É COMPOSTA SÓ ONDE PRECISA. Conta que aparece com uma
     safra só (ou sem safra) segue com a chave simples de sempre — o desdobro é
     exceção, e o fluxo sem ambiguidade não ganha uma pergunta sequer. */
  const ambiguas = contasAmbiguas(rows);
  return {
    subcentro: montarMapa(
      distintos(rows, (r) => {
        const conta = r.conta_plano_texto?.trim();
        if (!conta) return null;
        return ambiguas.has(conta) ? chaveSubcentro(conta, r.safra_texto?.trim() ?? null) : conta;
      }),
      (t) => preResolverSubcentro(t, cat)),
    fazenda: montarMapa(distintos(rows, (r) => r.fazenda_texto), (t) =>
      preResolverFazenda(t, cat.fazendas)),
    fornecedor: montarMapa(distintos(rows, (r) => r.fornecedor_texto), (t) =>
      preResolverFornecedor(t, cat.fornecedores, cat.aliasesFornecedor)),
    conta: montarMapa(distintos(rows, (r) => r.conta_bancaria_texto), (t) =>
      preResolverConta(t, cat.contas)),
    safra: montarMapa(distintos(rows, (r) => r.safra_texto), (t) =>
      preResolverSafra(t, cat.safras)),
  };
}

/**
 * Safra por NOME ou CÓDIGO exato, normalizado — B-22d.
 *
 * ⚠ SEM MEMÓRIA DE APELIDO, e é decisão declarada: `financeiro_safras` não tem
 * coluna `aliases` como `financeiro_fornecedores`, e o vocabulário é pequeno e
 * controlado (seis safras no maior cliente do Proto, contra centenas de
 * fornecedores). Sem casar, a linha fica pendente e o operador escolhe da lista
 * — a escolha vale para o arquivo. Se um dia incomodar, a coluna `aliases` é
 * migration aditiva e o quinto campo passa a memorizar como os outros quatro,
 * sem tocar em mais nada: o motor já é o mesmo.
 */
export function preResolverSafra(
  texto: string,
  safras: SafraRef[],
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);
  const achou = safras.find((sf) =>
    normalizar(sf.nome) === alvo || (sf.codigo ? normalizar(sf.codigo) === alvo : false));
  return achou
    ? { valor: achou.id, origem: 'cadastro', rotulo: achou.nome }
    : { valor: null, origem: 'pendente', rotulo: null };
}

/** Quantos ainda faltam resolver, por painel e no total. */
export function contarPendentes(dp: DeParaCompleto) {
  // Descartado NÃO é pendência: é decisão tomada.
  const p = (m: DeParaMap) =>
    Object.values(m).filter((i) => i.valor === null && !i.descartado).length;
  const subcentro = p(dp.subcentro);
  const fazenda = p(dp.fazenda);
  const fornecedor = p(dp.fornecedor);
  const conta = p(dp.conta);
  const safra = p(dp.safra);
  return { subcentro, fazenda, fornecedor, conta, safra,
    total: subcentro + fazenda + fornecedor + conta + safra };
}

// ─── Prévia ─────────────────────────────────────────────────────────

/** Motivos de exclusão. Ordem de precedência = ordem de avaliação em avaliarLinha. */
export type MotivoExclusao =
  | 'transferencia'
  | 'fazenda_nao_resolvida'
  | 'mes_fechado'
  | 'subcentro_nao_resolvido'
  | 'campo_obrigatorio_descartado'
  /** B-22a — equivalente a lançamento que já existe (nível D1). */
  | 'ja_existe'
  /** B-22b — a coluna ID traz um lançamento que não é deste cliente ou não existe. */
  | 'id_desconhecido'
  /** B-22b — lançamento de origem travada (OC/contrato): campos não se forçam. */
  | 'origem_travada'
  /** B-41 — a linha casou com mais de um lançamento, ou mais de uma linha disputa
   *  o mesmo. Fica de fora PENDENTE: escolher por conta própria seria chutar. */
  | 'casamento_ambiguo';

export const MOTIVO_LABEL: Record<MotivoExclusao, string> = {
  transferencia: 'Transferência — não é criada por esta importação',
  fazenda_nao_resolvida: 'Fazenda não resolvida',
  mes_fechado: 'Mês fechado para esta fazenda',
  subcentro_nao_resolvido: 'Conta do plano ainda não mapeada',
  campo_obrigatorio_descartado: 'Fazenda ou conta do plano descartada — sem esses dois a linha não existe',
  casamento_ambiguo: 'Casou com mais de um lançamento existente — escolha qual, ou informe o ID',
  ja_existe: 'Já existe lançamento equivalente — inclua manualmente se for outro',
  id_desconhecido: 'A coluna ID aponta para um lançamento que não é deste cliente',
  origem_travada: 'Lançamento da Operação Comercial — a classificação se ajusta lá, não aqui',
};

/**
 * O que a linha vai FAZER — B-22b.
 *
 * ⚠ O MODO NASCE DA COLUNA ID, e não de uma escolha do operador: linha com id de
 * lançamento vivo do cliente ATUALIZA aquele lançamento; linha sem id CRIA. É o
 * fluxo real do NJ — importa o OFX, lança tudo cru e conciliado, e o Excel
 * depois classifica o que já existe. Sem isso, o Excel duplicaria cada linha do
 * mês que já virou lançamento.
 */
export type ModoLinha = 'criar' | 'atualizar';

/** O que a prévia precisa saber sobre um lançamento que a planilha quer atualizar. */
export interface AlvoAtualizacao {
  id: string;
  /** Origem travada (OC/contrato): a classificação não se força por aqui. */
  travado: boolean;
  subcentroAtual: string | null;
  descricaoAtual: string | null;
  /** B-22d — a safra atual, para que célula vazia não a apague. */
  safraAtual: string | null;
}

/**
 * Por onde a linha chegou ao modo ATUALIZAR — governa só o resumo da prévia.
 * `id`: a coluna técnica trouxe o lançamento. `casamento`: a linha não tinha id
 * e casou com um lançamento existente pela régua abaixo.
 */
export type OrigemModo = 'id' | 'casamento';

/** Um lançamento vivo que uma linha sem id pode estar querendo classificar. */
export interface CandidatoCasamento extends AlvoAtualizacao {
  contaBancariaId: string | null;
  valor: number;
  /** data_pagamento do lançamento; null nunca casa. */
  data: string | null;
}

/**
 * A CHAVE DO CASAMENTO — conta bancária, valor absoluto com 2 casas, e data.
 *
 * ⚠ É A MESMA RÉGUA DE `fn_vincular_exatos_mes`, e a semelhança é deliberada:
 * mesma conta, mesmo valor, mesma data, único dos DOIS lados. Lá ela casa
 * movimento de extrato com lançamento; aqui casa linha de planilha com
 * lançamento. A pergunta é a mesma — "estas duas coisas são o mesmo fato?".
 *
 * ⚠ E É O SEGUNDO LUGAR ONDE ELA MORA, o que esta casa normalmente proíbe. Sem
 * migration não há como perguntar ao banco, e o briefing pediu esta régua pelo
 * nome. Fica declarado: mudar a tolerância de um lado sem o outro faz a prévia
 * prometer um casamento que o vínculo não reconhece. O lugar certo é uma função
 * no banco, quando houver migration.
 *
 * Retorna null quando falta peça — e faltar peça é NÃO CASAR, nunca casar por
 * aproximação.
 */
export function chaveCasamento(
  contaBancariaId: string | null | undefined,
  valor: number | null | undefined,
  data: string | null | undefined,
): string | null {
  if (!contaBancariaId || !data) return null;
  const v = Number(valor);
  if (!Number.isFinite(v) || v === 0) return null;
  /* ⚠ O MÓDULO VEM ANTES DO ARREDONDAMENTO. `r2` arredonda meio centavo para
     cima em direção a +∞, então -100,005 viraria 100,00 e +100,005 viraria
     100,01: a mesma quantia geraria chaves diferentes só por causa do sinal, e o
     par deixaria de casar. Tomar o módulo primeiro faz o sinal não influir. */
  return `${contaBancariaId}|${r2(Math.abs(v)).toFixed(2)}|${data.slice(0, 10)}`;
}

/**
 * A DATA QUE A LINHA OFERECE AO CASAMENTO: pagamento, e vencimento como recurso.
 *
 * ⚠ A ORDEM É O ARGUMENTO. Do lado do sistema a chave usa `data_pagamento`, que
 * é quando o dinheiro andou; a planilha do cliente nem sempre traz essa coluna,
 * e nesses arquivos o vencimento é a única data de caixa disponível. Tentar o
 * vencimento contra o pagamento do lançamento é aproximação assumida: casa
 * quando as duas coincidem, e simplesmente não casa quando não coincidem —
 * nunca inventa par.
 */
export function dataDoCasamento(row: LancamentoExcelRow): string | null {
  return row.data_pagamento ?? row.data_vencimento ?? null;
}

/**
 * O CASAMENTO DAS LINHAS SEM ID — o passo que faltava para o arquivo do cliente.
 *
 * ⚠ O FLUXO REAL É ESTE: todo mês o cliente manda o Excel do sistema DELE, com o
 * plano dele e sem id nenhum nosso. O modo-ID (B-22b) só serve quando o próprio
 * operador preenche o modelo que baixou daqui. Sem este passo, o arquivo do
 * cliente duplicaria cada linha do mês que a conciliação já lançou.
 *
 * ⚠ ÚNICO DOS DOIS LADOS, e é isso que torna o casamento seguro: a chave precisa
 * aparecer UMA vez entre os candidatos E UMA vez entre as linhas da planilha.
 * Dois boletos iguais no mesmo dia — caso real — dariam dois candidatos para uma
 * linha, e escolher qualquer um seria chutar em silêncio sobre dinheiro. Vira
 * ambíguo, e o operador decide.
 *
 * ⚠ E SÓ LINHAS SEM ID entram aqui: id na planilha é declaração explícita do
 * operador e vence qualquer casamento inferido.
 */
export function casarLinhasSemId(
  rows: readonly LancamentoExcelRow[],
  dp: DeParaCompleto,
  candidatos: readonly CandidatoCasamento[],
): Map<number, CandidatoCasamento | 'ambiguo'> {
  /* ⚠ QUEM JÁ FOI RECLAMADO POR ID SAI DA MESA. Se alguma linha da planilha
     aponta explicitamente para um lançamento, ele é daquela linha — deixá-lo
     como candidato faria duas linhas do mesmo arquivo disputarem o mesmo
     lançamento, e a segunda o atualizaria por cima da primeira. */
  const reclamadosPorId = new Set(
    rows.map((r) => (r.id_lancamento ?? '').trim()).filter(Boolean),
  );

  /* Candidatos por chave. Chave repetida = mais de um lançamento igual. */
  const porChave = new Map<string, CandidatoCasamento[]>();
  for (const c of candidatos) {
    if (reclamadosPorId.has(c.id)) continue;
    const k = chaveCasamento(c.contaBancariaId, c.valor, c.data);
    if (!k) continue;
    const l = porChave.get(k);
    if (l) l.push(c); else porChave.set(k, [c]);
  }

  /* Linhas sem id, com a conta já resolvida pelo de-para — sem conta resolvida
     não há chave, e a linha segue para o fluxo de criação. */
  const chaveDaLinha = new Map<number, string>();
  const usosDaChave = new Map<string, number>();
  rows.forEach((r, i) => {
    if ((r.id_lancamento ?? '').trim()) return;
    const itConta = valorDe(dp.conta, r.conta_bancaria_texto);
    const k = chaveCasamento(itConta?.valor ?? null, r.valor, dataDoCasamento(r));
    if (!k) return;
    chaveDaLinha.set(i, k);
    usosDaChave.set(k, (usosDaChave.get(k) ?? 0) + 1);
  });

  const out = new Map<number, CandidatoCasamento | 'ambiguo'>();
  for (const [i, k] of chaveDaLinha) {
    const cands = porChave.get(k);
    if (!cands || cands.length === 0) continue;            // sem par: vai criar
    /* Ambíguo dos dois lados pela mesma razão: sobra escolha, e escolher por
       conta própria seria decidir no lugar do operador sobre dinheiro. */
    if (cands.length > 1 || (usosDaChave.get(k) ?? 0) > 1) { out.set(i, 'ambiguo'); continue; }
    out.set(i, cands[0]);
  }
  return out;
}

/**
 * O veredito da régua de duplicidade do BANCO — `classificar_nivel_duplicidade`.
 *
 * ⚠ A RÉGUA É UMA SÓ E É DE LÁ. Ela pesa data de pagamento, valor (com faixa de
 * 20% para divergência significativa), descrição, subcentro, nº de documento,
 * tipo e conta. Reimplementá-la aqui criaria o segundo lugar onde a mesma
 * pergunta é respondida — e os dois divergiriam na primeira mudança de peso.
 * ⚠ D1 É DESCARTE, D2/D3 SÃO AVISO: só o idêntico sai por padrão. Grau de
 * suspeita não decide sozinho — quem decide é quem conhece a operação.
 */
export type NivelDuplicidade = 'D1' | 'D2' | 'D3';

export const DUPLICIDADE_LABEL: Record<NivelDuplicidade, string> = {
  D1: 'Idêntico a um lançamento existente',
  D2: 'Muito parecido com um lançamento existente',
  D3: 'Parecido com um lançamento existente',
};

export interface LinhaPrevia {
  /** Posição no array de `rows` — a chave do dedup e da reinclusão.
      ⚠ NÃO É `row.linha`, que é o número da linha no Excel: o filtro da prévia
      reordena e recorta a lista, e só o índice de origem sobrevive a isso. */
  indice: number;
  row: LancamentoExcelRow;
  /** ano_mes derivado da COMPETÊNCIA — é o trigger do banco que manda. */
  anoMes: string;
  fazendaId: string | null;
  fazendaNome: string | null;
  subcentro: string | null;
  favorecidoId: string | null;
  contaBancariaId: string | null;
  /** B-22d — safra resolvida do cadastro; `null` = sem safra na planilha. */
  safraId: string | null;
  entra: boolean;
  motivo: MotivoExclusao | null;
  /** `atualizar` quando a coluna ID traz um lançamento vivo deste cliente, ou
   *  quando a linha sem id casou com um lançamento existente (B-41). */
  modo: ModoLinha;
  /** Por onde chegou ao modo atualizar; `null` quando o modo é criar. */
  origemModo: OrigemModo | null;
  /**
   * ⚠ QUEM ATUALIZAR, JÁ RESOLVIDO. O gravador lê daqui em vez de reler a coluna
   * ID da planilha: com o casamento, nem toda linha que atualiza tem id escrito,
   * e um gravador que só sabe ler a planilha criaria de novo o que a prévia
   * prometeu atualizar.
   */
  alvoId: string | null;
  /** Veredito da régua do banco; `null` = nada parecido encontrado. */
  duplicidade: NivelDuplicidade | null;
  /**
   * O operador mandou entrar mesmo sendo D1.
   *
   * ⚠ POR LINHA, E NÃO POR CAMPO — o `alternarDescarte` que já existia opera
   * sobre um VALOR do de-para ("todo lançamento cujo texto de conta é X"), e
   * duplicidade não é propriedade de um texto: é desta linha contra aquele
   * lançamento. Duas parcelas iguais no mesmo dia são o caso real em que uma é
   * duplicata e a outra não.
   */
  reincluida: boolean;
}

/**
 * ano_mes SEMPRE da data_competencia — espelha
 * trg_00_ano_mes_from_competencia: `NEW.ano_mes := to_char(NEW.data_competencia,'YYYY-MM')`.
 * data_pagamento NÃO governa o mês, e por isso não governa o teste de fechamento.
 */
export function anoMesDaCompetencia(dataCompetencia: string): string {
  return dataCompetencia.slice(0, 7);
}

function valorDe(m: DeParaMap, texto: string | null): DeParaItem | null {
  if (!texto) return null;
  return m[texto.trim()] ?? null;
}

export function avaliarLinha(
  row: LancamentoExcelRow,
  dp: DeParaCompleto,
  fechados: ReadonlySet<ChaveFechamento>,
  fazendaCabecalhoId: string | null,
  fazendaCabecalhoNome: string | null,
  duplicidade: NivelDuplicidade | null,
  reincluida: boolean,
  indice: number,
  alvos: ReadonlyMap<string, AlvoAtualizacao> | undefined,
  /** B-41 — o que o casamento decidiu para esta linha, quando ela não tem id. */
  casado?: CandidatoCasamento | 'ambiguo' | null,
): LinhaPrevia {
  const anoMes = anoMesDaCompetencia(row.data_competencia ?? '');

  const itFaz = valorDe(dp.fazenda, row.fazenda_texto);
  const fazendaId = itFaz?.valor ?? fazendaCabecalhoId;
  const fazendaNome = itFaz?.rotulo ?? fazendaCabecalhoNome;

  /* ⚠ A LINHA LÊ PELA MESMA CHAVE QUE O MAPA FOI MONTADO. Tentar a composta e,
     não achando, a simples: assim conta ambígua resolve pelo par e conta comum
     segue pelo texto sozinho, sem dois caminhos de código. */
  const chaveComposta = chaveSubcentro(row.conta_plano_texto ?? '', row.safra_texto?.trim() ?? null);
  const itSub = valorDe(dp.subcentro, chaveComposta) ?? valorDe(dp.subcentro, row.conta_plano_texto);
  const itForn = valorDe(dp.fornecedor, row.fornecedor_texto);
  const itConta = valorDe(dp.conta, row.conta_bancaria_texto);
  const itSafra = valorDe(dp.safra, row.safra_texto);

  /* ⚠ O ID SÓ VALE SE O LANÇAMENTO EXISTE E É DESTE CLIENTE. `alvos` vem da
     consulta que a prévia faz; id que não está lá é id errado — planilha de
     outro cliente, id digitado à mão, lançamento cancelado depois de gerado o
     arquivo. Nesses casos a linha NÃO vira criação silenciosa: para, com motivo,
     porque criar seria duplicar o que o operador queria corrigir. */
  const idPlanilha = (row.id_lancamento ?? '').trim();
  /* ⚠ O ID VENCE O CASAMENTO. Id na planilha é declaração explícita do operador;
     o casamento é inferência nossa, e inferência não sobrepõe declaração. */
  const alvoPorId = idPlanilha ? (alvos?.get(idPlanilha) ?? null) : null;
  const alvoCasado = !idPlanilha && casado && casado !== 'ambiguo' ? casado : null;
  const alvo = alvoPorId ?? alvoCasado;
  const modo: ModoLinha = idPlanilha || alvoCasado ? 'atualizar' : 'criar';
  const origemModo: OrigemModo | null = idPlanilha ? 'id' : alvoCasado ? 'casamento' : null;

  const base = {
    indice, row, anoMes, fazendaId, fazendaNome, duplicidade, reincluida, modo,
    origemModo,
    /* O alvo viaja RESOLVIDO na linha: o gravador não relê a planilha para
       descobrir quem atualizar, e o casamento não precisa de um segundo mapa. */
    alvoId: alvo?.id ?? null,
    subcentro: itSub?.valor ?? null,
    // Descartado em campo OPCIONAL vira simplesmente ausência: a linha entra sem
    // o dado. É o caso de uso que originou o descarte ("terceiros" na coluna de
    // conta bancária) — não é conta, e a despesa existe do mesmo jeito.
    favorecidoId: itForn?.valor ?? null,
    contaBancariaId: itConta?.valor ?? null,
    /* Safra é OPCIONAL: sem ela a linha entra, e o lançamento nasce sem safra —
       o mesmo tratamento de fornecedor e conta bancária. */
    safraId: itSafra?.valor ?? null,
  };

  /* ⚠ OS MOTIVOS DO MODO ATUALIZAÇÃO VÊM PRIMEIRO, e a ordem é o argumento:
     quando a linha aponta para um lançamento que não existe ou é travado, nada
     do que vem abaixo importa — nem transferência, nem mês fechado, nem de-para.
     A pergunta "o que fazer com esta linha" já está respondida. */
  if (modo === 'atualizar' && !alvo) {
    return { ...base, entra: false, motivo: 'id_desconhecido' };
  }
  if (alvo?.travado) {
    return { ...base, entra: false, motivo: 'origem_travada' };
  }
  /* ⚠ AMBÍGUO É PENDÊNCIA, NÃO EXCLUSÃO DEFINITIVA: a linha existe e tem par,
     só não se sabe qual. Fica de fora com motivo próprio para o operador poder
     resolver — informando o ID — em vez de descobrir uma duplicata depois. */
  if (casado === 'ambiguo') {
    return { ...base, entra: false, motivo: 'casamento_ambiguo' };
  }

  // Precedência: o motivo mais estrutural primeiro, para o operador ver a causa
  // raiz e não um sintoma. Transferência não é resolvível por de-para nenhum.
  if (row.tipo_operacao === TIPO_TRANSFERENCIAS) {
    return { ...base, entra: false, motivo: 'transferencia' };
  }
  // Descarte em campo OBRIGATÓRIO é diferente de descarte em campo opcional: sem
  // fazenda ou sem conta do plano a linha não pode existir. Motivo próprio, para
  // não mentir dizendo "não resolvida" quando foi decisão explícita do operador.
  if (itFaz?.descartado || itSub?.descartado) {
    return { ...base, entra: false, motivo: 'campo_obrigatorio_descartado' };
  }
  if (!fazendaId) {
    return { ...base, entra: false, motivo: 'fazenda_nao_resolvida' };
  }
  if (fechados.has(chaveFechamento(fazendaId, anoMes))) {
    return { ...base, entra: false, motivo: 'mes_fechado' };
  }
  if (!base.subcentro) {
    return { ...base, entra: false, motivo: 'subcentro_nao_resolvido' };
  }
  /* ⚠ O DEDUP É O ÚLTIMO DA FILA, e a ordem é o argumento: os motivos acima são
     estruturais — sem fazenda ou com mês fechado a linha não pode existir, seja
     ela duplicata ou não. Dizer "já existe" a uma linha que também está em mês
     fechado esconderia a causa que o operador precisa resolver primeiro.
     ⚠ E SÓ D1 BARRA. D2/D3 seguem entrando, com o aviso na tela: grau de
     suspeita não é veredito, e barrar por semelhança faria a importação perder
     silenciosamente a segunda parcela de um pagamento repetido. */
  if (duplicidade === 'D1' && !reincluida) {
    return { ...base, entra: false, motivo: 'ja_existe' };
  }
  return { ...base, entra: true, motivo: null };
}

export interface TotaisPrevia {
  entram: { qtd: number; valor: number };
  ficamDeFora: { qtd: number; valor: number };
  porMotivo: Array<{ motivo: MotivoExclusao; qtd: number; valor: number }>;
  /**
   * B-41 — o resumo por BALDE, que responde a pergunta que o operador faz antes
   * de confirmar: "o que este arquivo vai fazer com o meu mês?".
   *
   * ⚠ SÓ O TOTAL DE ENTRADAS NÃO RESPONDE ISSO. 409 linhas entrando podem ser
   * 409 lançamentos novos — duplicando o mês — ou 409 classificações sobre o que
   * já existe. São resultados opostos e o número era o mesmo.
   */
  porBalde: {
    atualizamPorId: number;
    atualizamPorCasamento: number;
    ambiguos: number;
    criam: number;
    fora: number;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** PR-IMPORT-EXCEL-LANC-04 — recortes da prévia. */
export type FiltroPrevia = 'entra' | 'sai' | 'fora';

export const FILTRO_LABEL: Record<FiltroPrevia, string> = {
  entra: 'Entra',
  sai: 'Sai',
  fora: 'Fora',
};

/** Entra = elegível e 1-Entradas · Sai = elegível e 2-Saídas · Fora = excluída por qualquer motivo. */
export function aplicarFiltroPrevia(l: LinhaPrevia, f: FiltroPrevia): boolean {
  if (f === 'fora') return !l.entra;
  if (f === 'entra') return l.entra && l.row.tipo_operacao === TIPO_ENTRADAS;
  return l.entra && l.row.tipo_operacao === TIPO_SAIDAS;
}

export interface ResumoFiltro { qtd: number; valor: number; }

export function resumirPorFiltro(linhas: LinhaPrevia[]): Record<FiltroPrevia, ResumoFiltro> {
  const acc: Record<FiltroPrevia, ResumoFiltro> = {
    entra: { qtd: 0, valor: 0 }, sai: { qtd: 0, valor: 0 }, fora: { qtd: 0, valor: 0 },
  };
  for (const l of linhas) {
    const v = Math.abs(Number(l.row.valor) || 0);
    (['entra', 'sai', 'fora'] as FiltroPrevia[]).forEach((f) => {
      if (aplicarFiltroPrevia(l, f)) { acc[f].qtd++; acc[f].valor += v; }
    });
  }
  (['entra', 'sai', 'fora'] as FiltroPrevia[]).forEach((f) => { acc[f].valor = r2(acc[f].valor); });
  return acc;
}

export function montarPrevia(
  rows: LancamentoExcelRow[],
  dp: DeParaCompleto,
  fechados: ReadonlySet<ChaveFechamento>,
  fazendaCabecalhoId: string | null,
  fazendaCabecalhoNome: string | null,
  /** Veredito por ÍNDICE da linha na planilha. Ausente = dedup não consultado. */
  duplicidades?: ReadonlyMap<number, NivelDuplicidade>,
  /** Índices que o operador mandou entrar mesmo sendo D1. */
  reincluidas?: ReadonlySet<number>,
  /** Lançamentos vivos do cliente referidos pela coluna ID, por id. */
  alvos?: ReadonlyMap<string, AlvoAtualizacao>,
  /** B-41 — o casamento das linhas sem id, por índice. */
  casados?: ReadonlyMap<number, CandidatoCasamento | 'ambiguo'>,
): { linhas: LinhaPrevia[]; totais: TotaisPrevia } {
  const linhas = rows.map((r, i) =>
    avaliarLinha(r, dp, fechados, fazendaCabecalhoId, fazendaCabecalhoNome,
      duplicidades?.get(i) ?? null, reincluidas?.has(i) ?? false, i, alvos,
      casados?.get(i) ?? null));

  let qtdEntram = 0, valEntram = 0, qtdFora = 0, valFora = 0;
  const balde = { atualizamPorId: 0, atualizamPorCasamento: 0, ambiguos: 0, criam: 0, fora: 0 };
  const porMotivo = new Map<MotivoExclusao, { qtd: number; valor: number }>();

  for (const l of linhas) {
    const v = Math.abs(Number(l.row.valor) || 0);
    /* Os baldes contam a INTENÇÃO da linha, e por isso são exclusivos: ambíguo é
       ambíguo mesmo estando fora, e uma linha que atualiza não "cria". */
    if (l.motivo === 'casamento_ambiguo') balde.ambiguos++;
    else if (!l.entra) balde.fora++;
    else if (l.origemModo === 'id') balde.atualizamPorId++;
    else if (l.origemModo === 'casamento') balde.atualizamPorCasamento++;
    else balde.criam++;
    if (l.entra) { qtdEntram++; valEntram += v; continue; }
    qtdFora++; valFora += v;
    if (l.motivo) {
      const cur = porMotivo.get(l.motivo) ?? { qtd: 0, valor: 0 };
      porMotivo.set(l.motivo, { qtd: cur.qtd + 1, valor: cur.valor + v });
    }
  }

  return {
    linhas,
    totais: {
      entram: { qtd: qtdEntram, valor: r2(valEntram) },
      ficamDeFora: { qtd: qtdFora, valor: r2(valFora) },
      porMotivo: [...porMotivo.entries()]
        .map(([motivo, v]) => ({ motivo, qtd: v.qtd, valor: r2(v.valor) }))
        .sort((a, b) => b.qtd - a.qtd),
      porBalde: balde,
    },
  };
}

/**
 * Tipo de operação predominante por texto de conta do plano. O PlanoSubcentroSelect
 * filtra a subárvore por tipo; como o de-para é por TEXTO (não por linha), usamos o
 * tipo mais frequente entre as linhas que usam aquele texto. Empate → o primeiro visto.
 */
export function tipoPorContaPlano(rows: LancamentoExcelRow[]): Record<string, string> {
  const cont = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const t = r.conta_plano_texto?.trim();
    if (!t || !r.tipo_operacao) continue;
    const m = cont.get(t) ?? new Map<string, number>();
    m.set(r.tipo_operacao, (m.get(r.tipo_operacao) ?? 0) + 1);
    cont.set(t, m);
  }
  const out: Record<string, string> = {};
  for (const [texto, m] of cont.entries()) {
    let melhor: string | null = null;
    let max = -1;
    for (const [tipo, n] of m.entries()) if (n > max) { max = n; melhor = tipo; }
    if (melhor) out[texto] = melhor;
  }
  return out;
}
