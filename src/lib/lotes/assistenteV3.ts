/**
 * LOTE-PADRAO-V3 · L2 (mock lote-padrao-v3.html aprovado 12/11 13:31; ordem de parto Chat 14:10; NJ só a categoria fixa Chat 14:35) — a
 * regra do assistente v3, sem tela: Atividade → Categoria (as 7 FIXAS, pela fase) → Raça e genética → Situação → Ordem de parto →
 * Programa → Onde → Nome. Situação e ordem de parto só nas fêmeas da cria; recria e engorda pulam (o trilho mostra "não se aplica").
 * Obrigatório só atividade, categoria, raça e, na parida, o carimbo; o resto nunca trava. Quem grava é a `fn_lote_salvar` (117590) — as
 * frases daqui são as dela. O Plano (passo 8 do mock) é a L5: não entra aqui.
 */
import { CARIMBO_VALIDO, FRASE_CARIMBO_INVALIDO, SEMENS_DOS_MAMOTES, SEXOS_DOS_MAMOTES, carimbosFaixa, codigoPorEtapas, nomeNaLista,
  type CadastroDoLote, type CamposDoLote, type LoteDaLista, type SemenDosMamotes, type SexoDosMamotes, sexoDosMamotes, semenDosMamotes,
} from '@/lib/lotes/tipos';
import {
  CATEGORIAS_FIXAS, CRIA_AO_PE, ENTRADAS, METODOS, ORDENS_V3, PRENHA_DE, PRENHEZ, PROGRAMAS, SISTEMAS, cadastroDaCategoria, idadeMedia,
  marcadoresLimpos, nomeDaCategoria, nomeDe, siglaDaCategoria, temReproducao,
  type CategoriaFixa, type CriaAoPe, type EntradaNovilha, type FaseV3, type Lista, type MetodoReproducao, type OrdemDoPartoV3,
  type PrenhaDe, type Prenhez, type ProgramaDoLote, type SistemaDoLote,
} from '@/lib/lotes/padraoV3';
import { carimbosDoLote, faseDaAtividade, safraDe, siglaDe } from '@/lib/lotes/assistente';

export type ChaveV3 = 'atividade' | 'categoria' | 'raca' | 'situacao' | 'ordem' | 'programa' | 'onde' | 'nome';

export interface PassoV3 {
  chave: ChaveV3;
  titulo: string;
  subtitulo: string;
  ajuda: { oQueE: string; porQue: string; comoFazer: string };
}

export const PASSOS_V3: readonly PassoV3[] = [
  { chave: 'atividade', titulo: 'Atividade', subtitulo: 'Lista fixa: cria, recria ou engorda. Abre as opções das próximas etapas.',
    ajuda: { oQueE: 'A 1ª parte do código do lote.', porQue: 'O custo e os indicadores se separam por fase.',
      comoFazer: 'Mudou de fase depois? Edite na ficha: o código muda e o antigo fica no histórico.' } },
  { chave: 'categoria', titulo: 'Categoria', subtitulo: 'A do mapa do rebanho. Só aparecem as da atividade.',
    ajuda: { oQueE: 'A 2ª parte do código: a categoria do rebanho (lista fixa, igual para todos os clientes).',
      porQue: 'É a mesma do mapa do rebanho e do fechamento: o lote e o mapa falam a mesma língua.',
      comoFazer: 'Vaca parida, prenha, primípara, descarte não são categoria: são a situação, a ordem de parto e o programa, nas etapas seguintes.' } },
  { chave: 'raca', titulo: 'Raça e genética', subtitulo: 'Das matrizes / do gado. Cruzada: marque a composição.',
    ajuda: { oQueE: 'A 3ª parte do código; a composição (se cruzada) e o nascimento.', porQue: 'A idade média sai do nascimento, nunca se digita.',
      comoFazer: 'Escolha a raça do cadastro do cliente. Nascimento de/até: a idade aparece sozinha.' } },
  { chave: 'situacao', titulo: 'Situação', subtitulo: 'Só fêmeas da cria · duas perguntas: cria ao pé e prenhez.',
    ajuda: { oQueE: 'Hoje: com ou sem bezerro ao pé, e prenha ou não.', porQue: 'Fica fora do código: o lote não muda de nome com o manejo.',
      comoFazer: 'Parida pede o carimbo dos bezerros (7.1, 7R…). Prenha: de quê, a raça e o mês do parto, se souber.' } },
  { chave: 'ordem', titulo: 'Ordem de parto', subtitulo: 'Só fêmeas da cria.',
    ajuda: { oQueE: 'Quantos partos as matrizes já tiveram.', porQue: 'Separa primípara de multípara nos indicadores sem mudar o código.',
      comoFazer: 'Escolha uma. Não sabe? Deixe em branco: aparece como "completar" na ficha.' } },
  { chave: 'programa', titulo: 'Programa', subtitulo: 'Para que serve o lote.',
    ajuda: { oQueE: 'Reprodução, recria, terminação, descarte ou venda (lista fixa).', porQue: 'Diz o destino do lote; o método só na reprodução.',
      comoFazer: 'Reprodução: escolha o método. Novilhas: a entrada (superprecoce, precoce, convencional).' } },
  { chave: 'onde', titulo: 'Onde (sistema)', subtitulo: 'Como o lote é criado.',
    ajuda: { oQueE: 'Pasto, pasto + suplemento, TIP, semiconfinamento ou confinamento.', porQue: 'Separa o custo e o ganho por sistema.',
      comoFazer: 'Escolha um. Mudou de sistema? Edite na ficha.' } },
  { chave: 'nome', titulo: 'Nome', subtitulo: 'O código é montado sozinho. O apelido é como a fazenda chama o lote.',
    ajuda: { oQueE: 'O apelido, os marcadores, a anotação e a data de formação.', porQue: 'Apelido e marcadores entram na busca e nos filtros.',
      comoFazer: 'Marcadores são etiquetas livres (Gêmeos, Leiteiras, Retiro…): nunca substituem as listas fixas.' } },
];

/** O que o assistente v3 escolheu. Atividade e raça são do cadastro do cliente (ids); a categoria é o código FIXO do rebanho. */
export interface EscolhaV3 {
  atividadeId: string | null;
  categoria: CategoriaFixa | null;
  racaId: string | null;
}

/** O resto (texto do campo; datas 'aaaa-mm-dd'). */
export interface PerfilV3 {
  composicao: string[];
  nascidoDe: string;
  nascidoAte: string;
  criaAoPe: CriaAoPe | null;
  prenhez: Prenhez | null;
  /** o digitado no "+ carimbo" (ainda não na lista) */
  carimbo: string;
  carimbos: string[];
  /** as cabeças de cada carimbo, na ordem da lista (nulo = não sabe) */
  carimbosCab: (number | null)[];
  mamotesSexo: SexoDosMamotes | null;
  mamotesSemen: SemenDosMamotes | null;
  paiRacaId: string | null;
  prenhaDe: PrenhaDe | null;
  prenhaRacaId: string | null;
  partoPrevisto: string;
  ordemParto: OrdemDoPartoV3 | null;
  programa: ProgramaDoLote | null;
  metodo: MetodoReproducao | null;
  entrada: EntradaNovilha | null;
  sistema: SistemaDoLote | null;
  nomeCampeiro: string;
  /** o digitado no "+ marcador" */
  marcador: string;
  marcadores: string[];
  anotacao: string;
  formadoEm: string;
}

const daLista = <T extends string>(lista: Lista<T>, v: string | null | undefined): T | null => lista.find(x => x[0] === v)?.[0] ?? null;
const categoriaFixa = (v: string | null | undefined): CategoriaFixa | null => CATEGORIAS_FIXAS.find(c => c[0] === v)?.[0] ?? null;

export function escolhaV3Inicial(editar?: LoteDaLista | null): EscolhaV3 {
  return editar ? { atividadeId: editar.atividadeId, categoria: categoriaFixa(editar.categoriaFixa), racaId: editar.racaId }
    : { atividadeId: null, categoria: null, racaId: null };
}

export function perfilV3Inicial(hoje: string, editar?: LoteDaLista | null): PerfilV3 {
  if (!editar) {
    return { composicao: [], nascidoDe: '', nascidoAte: '', criaAoPe: null, prenhez: null, carimbo: '', carimbos: [], carimbosCab: [],
      mamotesSexo: null, mamotesSemen: null, paiRacaId: null, prenhaDe: null, prenhaRacaId: null, partoPrevisto: '', ordemParto: null,
      programa: null, metodo: null, entrada: null, sistema: null, nomeCampeiro: '', marcador: '', marcadores: [], anotacao: '', formadoEm: hoje };
  }
  const carimbos = carimbosDoLote(editar);
  const cab = editar.carimbosCab ?? [];
  return {
    composicao: [...(editar.composicaoRacas ?? [])], nascidoDe: editar.nascidoDe ?? '', nascidoAte: editar.nascidoAte ?? '',
    criaAoPe: daLista(CRIA_AO_PE, editar.criaAoPe), prenhez: daLista(PRENHEZ, editar.prenhez), carimbo: '', carimbos,
    carimbosCab: carimbos.map((_, i) => cab[i] ?? null),
    mamotesSexo: sexoDosMamotes(editar.mamotesSexo), mamotesSemen: semenDosMamotes(editar.mamotesSemen), paiRacaId: editar.bezerrosPaiRacaId ?? null,
    prenhaDe: daLista(PRENHA_DE, editar.prenhaDe), prenhaRacaId: editar.prenhaRacaId ?? null, partoPrevisto: editar.partoPrevisto ?? '',
    ordemParto: daLista(ORDENS_V3, editar.ordemParto), programa: daLista(PROGRAMAS, editar.programaLote),
    metodo: daLista(METODOS, editar.metodoReproducao), entrada: daLista(ENTRADAS, editar.entradaNovilha), sistema: daLista(SISTEMAS, editar.sistemaLote),
    nomeCampeiro: editar.nomeCampeiro ?? '', marcador: '', marcadores: [...(editar.marcadores ?? [])], anotacao: editar.anotacao ?? '',
    formadoEm: editar.formadoEm,
  };
}

/** A fase pela sigla da atividade escolhida (C/R/E e as de antes). */
export const faseV3 = (cadastros: readonly CadastroDoLote[], e: EscolhaV3): FaseV3 | null => faseDaAtividade(siglaDe(cadastros, e.atividadeId));

/** O passo vale para este lote? Situação e ordem de parto só nas fêmeas da cria (o resto, sempre). */
export function passoSeAplica(chave: ChaveV3, fase: FaseV3 | null, c: CategoriaFixa | null): boolean {
  return chave === 'situacao' || chave === 'ordem' ? temReproducao(fase, c) : true;
}

/** O passo seguinte (ou anterior) que se aplica; fora da lista = o próprio. */
export function passoVizinho(i: number, dir: 1 | -1, fase: FaseV3 | null, c: CategoriaFixa | null): number {
  for (let j = i + dir; j >= 0 && j < PASSOS_V3.length; j += dir) if (passoSeAplica(PASSOS_V3[j].chave, fase, c)) return j;
  return i;
}

/** Parida = cria ao pé "parida" numa fêmea da cria: pede o carimbo e os bezerros. */
export const paridaV3 = (fase: FaseV3 | null, e: EscolhaV3, p: Pick<PerfilV3, 'criaAoPe'>): boolean => temReproducao(fase, e.categoria) && p.criaAoPe === 'parida';
export const prenhaV3 = (fase: FaseV3 | null, e: EscolhaV3, p: Pick<PerfilV3, 'prenhez'>): boolean => temReproducao(fase, e.categoria) && p.prenhez === 'prenha';

/** A lista de carimbos: a escolhida + o digitado, se for válido e ainda não estiver nela. */
export function carimbosV3(p: Pick<PerfilV3, 'carimbo' | 'carimbos'>): string[] {
  const d = p.carimbo.trim().toUpperCase();
  return d && CARIMBO_VALIDO.test(d) && !p.carimbos.includes(d) ? [...p.carimbos, d] : [...p.carimbos];
}

/** Põe um carimbo na lista (a cabeça dele começa vazia); repetido ou inválido = nada muda. */
export function comCarimbo(p: PerfilV3, bruto: string): PerfilV3 {
  const c = bruto.trim().toUpperCase();
  if (!CARIMBO_VALIDO.test(c) || p.carimbos.includes(c)) return { ...p, carimbo: CARIMBO_VALIDO.test(c) ? '' : p.carimbo };
  return { ...p, carimbo: '', carimbos: [...p.carimbos, c], carimbosCab: [...p.carimbosCab, null] };
}
/** Tira o carimbo e a cabeça dele (as posições seguem casadas). */
export function semCarimbo(p: PerfilV3, c: string): PerfilV3 {
  const i = p.carimbos.indexOf(c);
  return i < 0 ? p : { ...p, carimbos: p.carimbos.filter((_, j) => j !== i), carimbosCab: p.carimbosCab.filter((_, j) => j !== i) };
}

/** O passo mais adiante que se abre: atividade → categoria → raça; com as três, todos. */
export function alcanceV3(e: EscolhaV3): number {
  if (!e.atividadeId) return 0;
  if (!e.categoria) return 1;
  if (!e.racaId) return 2;
  return PASSOS_V3.length - 1;
}

export const FRASE_FALTA_CARIMBO_V3 = 'Parida: informe o carimbo (mês.lote, ex.: 7.1).';

/** O que trava ESTE passo (null = pode seguir). Só atividade, categoria, raça, o carimbo da parida e datas impossíveis travam. */
export function faltaNoPassoV3(e: EscolhaV3, p: PerfilV3, i: number, fase: FaseV3 | null, hoje: string): string | null {
  const k = PASSOS_V3[i]?.chave;
  if (k === 'atividade' && !e.atividadeId) return 'Escolha a atividade';
  if (k === 'categoria' && !e.categoria) return 'Escolha a categoria';
  if (k === 'raca') {
    if (!e.racaId) return 'Escolha a raça';
    const n = erroDoNascimento(p, hoje);
    if (n) return n;
  }
  if (k === 'situacao') return erroDoCarimbo(e, p, fase);
  if (k === 'nome') {
    if (!e.atividadeId || !e.categoria || !e.racaId) return 'Falta atividade, categoria ou raça';
    return erroDoNascimento(p, hoje) ?? erroDoCarimbo(e, p, fase) ?? erroDoNome(p, hoje)?.mensagem ?? null;
  }
  return null;
}

/** O carimbo (passo Situação): digitado fora de mês.lote, ou parida sem nenhum. */
export function erroDoCarimbo(e: EscolhaV3, p: PerfilV3, fase: FaseV3 | null): string | null {
  if (!paridaV3(fase, e, p)) return null;
  if (p.carimbo.trim() && !CARIMBO_VALIDO.test(p.carimbo.trim().toUpperCase())) return FRASE_CARIMBO_INVALIDO;
  return carimbosV3(p).length === 0 ? FRASE_FALTA_CARIMBO_V3 : null;
}

/** As frases do banco para o nascimento. */
export function erroDoNascimento(p: Pick<PerfilV3, 'nascidoDe' | 'nascidoAte'>, hoje: string): string | null {
  if ((p.nascidoDe && p.nascidoDe > hoje) || (p.nascidoAte && p.nascidoAte > hoje)) return 'Nascimento: a data não pode ser depois de hoje.';
  if (p.nascidoDe && p.nascidoAte && p.nascidoAte < p.nascidoDe) return 'Nascimento: o "até" vem depois do "de".';
  return null;
}

/** O passo Nome: apelido, anotação, data de formação e marcadores (as frases do banco). */
export function erroDoNome(p: PerfilV3, hoje: string): { campo: 'nomeCampeiro' | 'anotacao' | 'formadoEm' | 'marcadores'; mensagem: string } | null {
  if (p.nomeCampeiro.trim().length > 40) return { campo: 'nomeCampeiro', mensagem: 'O apelido passa de 40 letras.' };
  if (p.anotacao.trim().length > 120) return { campo: 'anotacao', mensagem: 'A anotação passa de 120 letras.' };
  if (!p.formadoEm) return { campo: 'formadoEm', mensagem: 'Formado em: escolha a data.' };
  if (p.formadoEm > hoje) return { campo: 'formadoEm', mensagem: 'Formado em: a data não pode ser depois de hoje.' };
  const todos = [...p.marcadores, p.marcador].map(m => m.trim()).filter(Boolean);
  if (new Set(todos).size > 10 || todos.some(m => m.length > 32)) return { campo: 'marcadores', mensagem: 'Marcadores: até 10, cada um com até 32 letras.' };
  return null;
}

/** O código no trilho: ATIV-CAT-RAÇA[-faixa dos carimbos], -02 se repetir (espelho da `_fn_lote_codigo_etapas`). A sigla da categoria é a
 *  do cadastro que o banco vai usar (`siglaDaCategoria`). Editar sem mudar identidade nem carimbos = o mesmo código. */
export function codigoV3(cadastros: readonly CadastroDoLote[], idsDoRebanho: ReadonlyMap<string, string>, e: EscolhaV3, carimbos: readonly string[],
  lotes: readonly LoteDaLista[], editar?: LoteDaLista | null): string {
  if (editar) {
    const cat = e.categoria ? cadastroDaCategoria(cadastros, idsDoRebanho, e.categoria)?.id ?? null : null;
    const antes = carimbosDoLote(editar);
    if (cat === editar.categoriaId && e.racaId === editar.racaId && e.atividadeId === editar.atividadeId
      && antes.length === carimbos.length && antes.every((c, i) => c === carimbos[i])) return editar.codigo;
  }
  return codigoPorEtapas(siglaDe(cadastros, e.atividadeId), siglaDaCategoria(cadastros, idsDoRebanho, e.categoria), siglaDe(cadastros, e.racaId),
    carimbosFaixa(carimbos), lotes, editar?.id ?? null);
}

/** O `p_campos` da `fn_lote_salvar`: ao criar, tudo; ao editar, só o que mudou. O que não se aplica vai VAZIO (o banco limpa): fora das
 *  fêmeas da cria, situação, ordem e bezerros; fora da parida, os bezerros; fora da prenha, de quê/raça/parto; fora da reprodução, o
 *  método; fora das novilhas, a entrada. A idade vai calculada do nascimento (nunca digitada). */
export function camposV3(e: EscolhaV3, p: PerfilV3, fase: FaseV3 | null, hoje: string, editar?: LoteDaLista | null, faseAntes?: FaseV3 | null): CamposDoLote {
  const repro = temReproducao(fase, e.categoria);
  const parida = paridaV3(fase, e, p); const prenha = prenhaV3(fase, e, p);
  const carimbos = parida ? carimbosV3(p) : [];
  const cab = parida ? carimbos.map((_, i) => p.carimbosCab[i] ?? null) : [];
  const idade = idadeMedia(p.nascidoDe, p.nascidoAte, hoje);
  const novo: CamposDoLote = {
    atividade_id: e.atividadeId ?? undefined, categoria_rebanho: e.categoria ?? undefined, raca_id: e.racaId ?? undefined,
    composicao_racas: [...p.composicao], nascido_de: p.nascidoDe, nascido_ate: p.nascidoAte,
    idade_media_meses: idade == null ? '' : String(idade),
    cria_ao_pe: repro ? p.criaAoPe ?? '' : '', prenhez: repro ? p.prenhez ?? '' : '',
    ordem_parto: repro ? p.ordemParto ?? '' : '',
    carimbos, carimbos_cab: cab.some(x => x != null) ? cab : [],
    mamotes_sexo: parida ? p.mamotesSexo ?? '' : '', mamotes_semen: parida ? p.mamotesSemen ?? '' : '',
    bezerros_pai_raca_id: parida ? p.paiRacaId ?? '' : '',
    prenha_de: prenha ? p.prenhaDe ?? '' : '', prenha_raca_id: prenha ? p.prenhaRacaId ?? '' : '',
    parto_previsto: prenha ? p.partoPrevisto : '',
    programa_lote: p.programa ?? '', metodo_reproducao: p.programa === 'reproducao' ? p.metodo ?? '' : '',
    entrada_novilha: e.categoria === 'novilhas' ? p.entrada ?? '' : '', sistema_lote: p.sistema ?? '',
    nome_campeiro: p.nomeCampeiro.trim(), marcadores: marcadoresLimpos([...p.marcadores, p.marcador]), anotacao: p.anotacao.trim(),
    formado_em: p.formadoEm,
  };
  if (!editar) return { ...novo, safra: safraDe(hoje) };
  const antes = camposV3(escolhaV3Inicial(editar), perfilV3Inicial(editar.formadoEm, editar), faseAntes ?? fase, hoje);
  const so: CamposDoLote = {};
  for (const k of CHAVES_V3) {
    if (JSON.stringify(novo[k]) !== JSON.stringify(antes[k])) Object.assign(so, { [k]: novo[k] });
  }
  return so;
}

const CHAVES_V3: readonly (keyof CamposDoLote)[] = ['atividade_id', 'categoria_rebanho', 'raca_id', 'composicao_racas', 'nascido_de', 'nascido_ate',
  'idade_media_meses', 'cria_ao_pe', 'prenhez', 'ordem_parto', 'carimbos', 'carimbos_cab', 'mamotes_sexo', 'mamotes_semen', 'bezerros_pai_raca_id',
  'prenha_de', 'prenha_raca_id', 'parto_previsto', 'programa_lote', 'metodo_reproducao', 'entrada_novilha', 'sistema_lote', 'nome_campeiro',
  'marcadores', 'anotacao', 'formado_em'];

/** O que o trilho escreve embaixo de cada passo, por extenso (nunca sigla sozinha); null = nada ainda. */
export function valorDoPassoV3(chave: ChaveV3, cadastros: readonly CadastroDoLote[], e: EscolhaV3, p: PerfilV3, fase: FaseV3 | null, hoje: string): string | null {
  const nome = (id: string | null) => (id ? cadastros.find(c => c.id === id)?.nome ?? null : null);
  if (!passoSeAplica(chave, fase, e.categoria)) return 'não se aplica';
  switch (chave) {
    case 'atividade': return nome(e.atividadeId);
    case 'categoria': return nomeDaCategoria(e.categoria);
    case 'raca': {
      if (!e.racaId) return null;
      const idade = idadeMedia(p.nascidoDe, p.nascidoAte, hoje);
      return [nome(e.racaId), p.composicao.length ? p.composicao.map(nome).filter(Boolean).join(' + ') : null, idade == null ? null : `~${idade} meses`]
        .filter(Boolean).join(' · ');
    }
    /* no trilho (uma linha, nunca "…"): só cria ao pé e prenhez; os carimbos já estão no código embaixo e nas etiquetas do Nome */
    case 'situacao': return [nomeDe(CRIA_AO_PE, p.criaAoPe), nomeDe(PRENHEZ, p.prenhez)].filter(Boolean).join(' · ') || null;
    case 'ordem': return nomeDe(ORDENS_V3, p.ordemParto);
    /* no trilho, só o programa (uma linha, nunca "…"); o método e a entrada vão por extenso nas etiquetas do Nome (`programaPorExtenso`) */
    case 'programa': return nomeDe(PROGRAMAS, p.programa);
    case 'onde': return nomeDe(SISTEMAS, p.sistema);
    case 'nome': return p.nomeCampeiro.trim() || null;
  }
}

/** O programa com o método (reprodução) e a entrada (novilhas), por extenso. */
export const programaPorExtenso = (e: EscolhaV3, p: PerfilV3): string | null =>
  [nomeDe(PROGRAMAS, p.programa), p.programa === 'reproducao' ? nomeDe(METODOS, p.metodo) : null,
    e.categoria === 'novilhas' ? nomeDe(ENTRADAS, p.entrada) : null].filter(Boolean).join(' · ') || null;

/** As etiquetas do lote, por extenso (o "Como o lote aparece" do mock, P2): a ficha do passo Nome. Vazio = "completar" (nunca trava). */
export interface EtiquetaV3 { rotulo: string; valor: string | null }
export function etiquetasV3(cadastros: readonly CadastroDoLote[], e: EscolhaV3, p: PerfilV3, fase: FaseV3 | null, hoje: string): EtiquetaV3[] {
  const repro = temReproducao(fase, e.categoria);
  const nome = (id: string | null) => (id ? cadastros.find(c => c.id === id)?.nome ?? null : null);
  const bezerros = paridaV3(fase, e, p)
    ? [carimbosV3(p).join(', ') || null, nomeNaLista(SEXOS_DOS_MAMOTES, p.mamotesSexo), nomeNaLista(SEMENS_DOS_MAMOTES, p.mamotesSemen),
      p.paiRacaId ? `pai ${nome(p.paiRacaId)}` : null].filter(Boolean).join(' · ') || null
    : null;
  const prenha = prenhaV3(fase, e, p)
    ? [nomeDe(PRENHA_DE, p.prenhaDe), nome(p.prenhaRacaId), p.partoPrevisto ? `parto ${p.partoPrevisto.slice(5, 7)}/${p.partoPrevisto.slice(0, 4)}` : null]
      .filter(Boolean).join(' · ') || null
    : null;
  return [
    { rotulo: 'Atividade', valor: valorDoPassoV3('atividade', cadastros, e, p, fase, hoje) },
    { rotulo: 'Categoria', valor: valorDoPassoV3('categoria', cadastros, e, p, fase, hoje) },
    { rotulo: 'Raça e genética', valor: valorDoPassoV3('raca', cadastros, e, p, fase, hoje) },
    ...(repro ? [
      { rotulo: 'Situação', valor: [nomeDe(CRIA_AO_PE, p.criaAoPe), nomeDe(PRENHEZ, p.prenhez)].filter(Boolean).join(' · ') || null },
      ...(paridaV3(fase, e, p) ? [{ rotulo: 'Bezerros', valor: bezerros }] : []),
      ...(prenhaV3(fase, e, p) ? [{ rotulo: 'Prenha de', valor: prenha }] : []),
      { rotulo: 'Ordem de parto', valor: nomeDe(ORDENS_V3, p.ordemParto) },
    ] : []),
    { rotulo: 'Programa', valor: programaPorExtenso(e, p) },
    { rotulo: 'Onde', valor: nomeDe(SISTEMAS, p.sistema) },
    { rotulo: 'Marcadores', valor: marcadoresLimpos([...p.marcadores, p.marcador]).join(' · ') || '—' },
  ];
}

/** Qual assistente abre: lote NOVO e lote com categoria FIXA = o v3; lote de antes (categoria do cliente) = o de sempre, até a L6. */
export const usaV3 = (editar?: LoteDaLista | null): boolean => !editar || !!editar.categoriaFixa;
