/**
 * buscaDeFornecedor — FORN-BUSCA-UNICA-01 (Gabriel 19/10/2026). A REGRA ÚNICA de "este fornecedor casa com o que foi digitado, e em
 * que ordem". Todo seletor e filtro de fornecedor da tela passa por `buscarFornecedores`; o que busca no servidor (Cadastros ›
 * Fornecedores, Mesa) chama `fn_fornecedor_buscar`, que é o ESPELHO DECLARADO desta função no banco.
 *
 * ⚠ OS DOIS LADOS SÃO PRESOS PELO MESMO ARQUIVO DE CASOS: `buscaDeFornecedor.casos.json`. O vitest roda esta função contra ele, e
 *   o teste SQL `supabase/tests/forn_busca_unica_01_test.sql` é GERADO dele (`node scripts/gerar-teste-busca-fornecedor.mjs`) e roda
 *   a RPC; um vitest confere que o SQL gerado está em dia com o arquivo. Mudar a regra de um lado sem o outro derruba um dos dois.
 *
 * A REGRA (nesta ordem):
 *   NORMALIZAÇÃO — `normalizarNome` (sem acento, minúsculas, espaços juntados); no banco, `_fn_normalizar_texto` (o vazio é NULL lá,
 *     '' aqui). DÍGITOS DA BUSCA — `digitosDaBusca` (só dígitos com ponto, barra, traço ou espaço); no banco,
 *     `_fn_fornecedor_busca_digitos`. DÍGITOS DO DOCUMENTO — `soDigitos`; no banco, `regexp_replace(…, '\D', '', 'g')`.
 *   CASA quando o termo normalizado está DENTRO da razão social, da fantasia ou de um apelido (`aliases_norm`: os nomes e documentos
 *     dos absorvidos e os textos aprendidos), ou — busca só de número — os dígitos estão dentro do documento ou de um apelido que é
 *     documento (só dígitos e pontuação). FORN-FILIAL-01: casa também quando alguma palavra do termo começa uma palavra da CIDADE
 *     (municipio/UF) e todas começam uma palavra da razão social, da fantasia ou da cidade — "zeta tres" acha a filial de Três Lagoas.
 *     Busca vazia casa com todos.
 *   SITUAÇÃO — 'ativos' (padrão): só o ativo de verdade (ativo e não mesclado); 'inativos': só o inativo ou mesclado; 'todos'.
 *   ORDEM — ativo de verdade primeiro → começa com o termo (razão social, fantasia ou documento) → mais uso → razão social
 *     normalizada → id (comparação por código, a do `COLLATE "C"` no banco).
 */
/** Movida verbatim de `fornecedorTexto.ts` (FORN-BUSCA-UNICA-01). */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A busca digitada é NÚMERO (só dígitos, com ou sem ponto, barra, traço e espaço)? Devolve os dígitos, ou nulo. */
export function digitosDaBusca(busca: string): string | null {
  const semPontuacao = busca.replace(/[.\-/\s]/g, '');
  return semPontuacao !== '' && /^\d+$/.test(semPontuacao) ? semPontuacao : null;
}


export type SituacaoDaBusca = 'ativos' | 'inativos' | 'todos';

export interface FornecedorBuscavel {
  id: string;
  nome: string;
  nome_fantasia?: string | null;
  cpf_cnpj?: string | null;
  ativo?: boolean | null;
  fundido_em_id?: string | null;
  aliases_norm?: readonly string[] | null;
  /** FORN-FILIAL-01 — a cidade da filial (a busca também acha por ela) */
  municipio?: string | null;
  uf?: string | null;
  /** Quanto este fornecedor é usado (quem chama diz o quê: lançamentos no recorte, no banco…). Ausente = 0. */
  uso?: number | null;
}

/** Só os dígitos de um documento ('' sem documento). Espelho: `regexp_replace(coalesce(x, ''), '\D', '', 'g')`. */
export function digitosDoDocumento(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** O fornecedor já pronto para ser comparado (calculado uma vez por lista, não por tecla). */
export interface Preparado<F extends FornecedorBuscavel> {
  f: F;
  nomeNorm: string;
  fantasiaNorm: string;
  digitos: string;
  apelidos: string[];
  apelidosDoc: string[];
  /** FORN-FILIAL-01 — "presidente prudente sp" (municipio e UF normalizados); '' sem cidade */
  cidadeNorm: string;
  ativoDeVerdade: boolean;
  uso: number;
}

export function prepararParaBusca<F extends FornecedorBuscavel>(lista: readonly F[]): Preparado<F>[] {
  return lista.map((f) => {
    const apelidos = (f.aliases_norm ?? []).map((a) => normalizarNome(a)).filter((a) => a !== '');
    return {
      f,
      nomeNorm: normalizarNome(f.nome),
      fantasiaNorm: normalizarNome(f.nome_fantasia),
      digitos: digitosDoDocumento(f.cpf_cnpj),
      apelidos,
      apelidosDoc: apelidos.map((a) => digitosDaBusca(a)).filter((d): d is string => d !== null),
      cidadeNorm: normalizarNome([f.municipio, f.uf].filter(Boolean).join(' ')),
      ativoDeVerdade: f.ativo !== false && !f.fundido_em_id,
      uso: f.uso ?? 0,
    };
  });
}

function passaNaSituacao(p: { ativoDeVerdade: boolean }, situacao: SituacaoDaBusca): boolean {
  if (situacao === 'todos') return true;
  return situacao === 'ativos' ? p.ativoDeVerdade : !p.ativoDeVerdade;
}

/** Casa? (sem olhar a situação) */
export function casaComOTermo(p: Pick<Preparado<FornecedorBuscavel>, 'nomeNorm' | 'fantasiaNorm' | 'digitos' | 'apelidos' | 'apelidosDoc' | 'cidadeNorm'>, busca: string): boolean {
  const q = normalizarNome(busca);
  if (!q) return true;
  if (p.nomeNorm.includes(q) || p.fantasiaNorm.includes(q) || p.apelidos.some((a) => a.includes(q))) return true;
  /* FORN-FILIAL-01 — com a CIDADE: ao menos uma palavra COMEÇA uma palavra da cidade, e todas começam uma palavra da razão social, da
     fantasia ou da cidade ("zeta tres" → "Três Lagoas"; o "g" solto não casa com "Lagoas"). Sem palavra na cidade a regra não entra (o
     "fornecedor 1" segue casando só o termo inteiro). No banco: `strpos(' ' || cn, ' ' || w) > 0` e
     `strpos(' ' || nn || ' ' || fnn || ' ' || cn, ' ' || w) > 0`. */
  const palavras = q.split(' ').filter(Boolean);
  const comecaPalavra = (texto: string, w: string) => ` ${texto}`.includes(` ${w}`);
  if (p.cidadeNorm && palavras.some((w) => comecaPalavra(p.cidadeNorm, w))) {
    const juntos = `${p.nomeNorm} ${p.fantasiaNorm} ${p.cidadeNorm}`;
    if (palavras.every((w) => comecaPalavra(juntos, w))) return true;
  }
  const d = digitosDaBusca(busca);
  return d !== null && (p.digitos.includes(d) || p.apelidosDoc.some((a) => a.includes(d)));
}

function comecaComOTermo(p: Pick<Preparado<FornecedorBuscavel>, 'nomeNorm' | 'fantasiaNorm' | 'digitos'>, busca: string): boolean {
  const q = normalizarNome(busca);
  if (!q) return false;
  if (p.nomeNorm.startsWith(q) || p.fantasiaNorm.startsWith(q)) return true;
  const d = digitosDaBusca(busca);
  return d !== null && p.digitos.startsWith(d);
}

const porCodigo = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A busca sobre preparados: os que casam, na ordem da regra. */
export function buscarPreparados<F extends FornecedorBuscavel, P extends Preparado<F>>(
  preparados: readonly P[], busca: string, situacao: SituacaoDaBusca = 'ativos',
): P[] {
  const comeca = new Map<P, boolean>();
  const casam = preparados.filter((p) => passaNaSituacao(p, situacao) && casaComOTermo(p, busca));
  casam.forEach((p) => comeca.set(p, comecaComOTermo(p, busca)));
  return casam.sort((a, b) =>
    Number(b.ativoDeVerdade) - Number(a.ativoDeVerdade)
    || Number(comeca.get(b)) - Number(comeca.get(a))
    || b.uso - a.uso
    || porCodigo(a.nomeNorm, b.nomeNorm)
    || porCodigo(a.f.id, b.f.id));
}

/** A busca sobre uma lista crua (prepara e busca). */
export function buscarFornecedores<F extends FornecedorBuscavel>(lista: readonly F[], busca: string, situacao: SituacaoDaBusca = 'ativos'): F[] {
  return buscarPreparados(prepararParaBusca(lista), busca, situacao).map((p) => p.f);
}

/** A situação escrita no item da lista: nada no ativo, "inativo", ou "mesclado em <dono>" (o dono pelo id, quando a lista o tem). */
export function situacaoDoItem(f: FornecedorBuscavel, nomeDoDono?: (id: string) => string | null | undefined): string | null {
  if (f.fundido_em_id) {
    const dono = nomeDoDono?.(f.fundido_em_id);
    return dono ? `mesclado em ${dono}` : 'mesclado';
  }
  return f.ativo === false ? 'inativo' : null;
}
