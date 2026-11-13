/**
 * LOTE-ETAPAS-01 (Gabriel 11/11 08:45, D1–D4; mock ui-validar/lote-etapas.html) — a regra do assistente "+ Novo lote" / "Editar
 * identidade", sem tela: Atividade → Categoria e sexo (filtrada pela atividade) → Situação (cria) ou Programa e sistema (recria,
 * engorda) → Raça e genética (mamotes ao pé da parida) → Nome do lote. Obrigatório SÓ atividade, categoria e raça, e o carimbo da parida
 * (PA/PP/VZ); o resto é "completar" e nunca trava. Plano = fatia 2. Quem grava é o banco (`fn_lote_cadastro_salvar`, `fn_lote_salvar`);
 * as mensagens daqui são as MESMAS da RPC, para o erro aparecer no campo antes de ir ao banco.
 */
import { casaNaBusca } from '@/lib/texto/busca';
import {
  CARIMBO_VALIDO, FRASE_CARIMBO_INVALIDO, CRUZAMENTOS_DOS_MAMOTES, ORDENS_DO_PARTO, SEMENS_DOS_MAMOTES, SEXOS_DOS_MAMOTES, SITUACOES_DA_CRIA,
  carimbosFaixa, codigoDoLote, codigoPorEtapas, ehParida, nomeNaLista,
  type CadastroDoLote, type CamposDoLote, type CruzamentoDosMamotes, type LoteDaLista, type OrdemDoParto, type SemenDosMamotes,
  type SexoDosMamotes, type SituacaoDaCria, type TipoDoCadastro, type TrocaDeCodigo,
} from '@/lib/lotes/tipos';

export type ChaveDoPasso = 'atividade' | 'categoria' | 'situacao' | 'raca' | 'nome';

export interface PassoDoAssistente {
  chave: ChaveDoPasso;
  titulo: string;
  pergunta: string;
  subtitulo: string;
  ajuda: { oQueE: string; porQue: string; comoFazer: string };
  /** o rótulo do cartão "Cadastrar nova…" (só nos passos de cartões) */
  cadastrarNova?: string;
  /** o nome da coisa, minúsculo ("categoria", "raça", "atividade") */
  coisa?: string;
}

export const PASSOS: readonly PassoDoAssistente[] = [
  { chave: 'atividade', titulo: 'Atividade', pergunta: 'Em que atividade o lote está?', coisa: 'atividade', cadastrarNova: 'Cadastrar nova atividade',
    subtitulo: 'Define quais opções aparecem nas próximas etapas.',
    ajuda: { oQueE: 'A 1ª parte do código do lote (a sigla).', porQue: 'O custo e os indicadores se separam por fase; a atividade abre as opções dela.',
      comoFazer: 'Mudou de fase depois (ex.: recria → engorda)? Edite a identidade na ficha: o código muda e o antigo fica no histórico.' } },
  { chave: 'categoria', titulo: 'Categoria e sexo', pergunta: 'Qual categoria?', coisa: 'categoria', cadastrarNova: 'Cadastrar nova categoria',
    subtitulo: 'O sexo vem junto da categoria. Só aparecem as categorias da atividade.',
    ajuda: { oQueE: 'A 2ª parte do código do lote.', porQue: 'Diz quem forma o lote e quais categorias do rebanho entram nele.',
      comoFazer: 'Escolha um cartão. A lista vem do cadastro do cliente, filtrada pela atividade; “Mostrar todas” traz as outras.' } },
  { chave: 'situacao', titulo: 'Situação', pergunta: 'Situação das matrizes',
    subtitulo: 'Hoje. Depois muda pelos manejos (diagnóstico, parto, desmama), sem trocar o nome do lote.',
    ajuda: { oQueE: 'Na cria, a situação das matrizes e a ordem de parto; em todas as atividades, o programa e o sistema (do cadastro do cliente).',
      porQue: 'Fica fora do código: o lote não muda de nome quando a situação muda.',
      comoFazer: 'Escolha o que já souber. Não trava: o que faltar aparece como “completar” na ficha.' } },
  { chave: 'raca', titulo: 'Raça e genética', pergunta: 'Raça e genética', coisa: 'raça', cadastrarNova: 'Cadastrar nova raça',
    subtitulo: 'Do gado do lote.',
    ajuda: { oQueE: 'A 3ª parte do código; na parida, o carimbo e a genética dos mamotes ao pé.',
      porQue: 'A raça separa os lotes da mesma categoria; o carimbo (mês.lote) é como o campeiro chama o lote da cria.',
      comoFazer: 'Escolha a raça. Parida (PA, PP ou VZ): o carimbo é obrigatório; sexo, cruzamento e sêmen, se souber.' } },
  { chave: 'nome', titulo: 'Nome do lote', pergunta: 'Nome do lote',
    subtitulo: 'O código é montado sozinho. O apelido é como a fazenda chama o lote.',
    ajuda: { oQueE: 'O código, o apelido, a anotação e a data de formação.', porQue: 'O apelido entra na busca e no mapa do rebanho; a anotação fica na ficha.',
      comoFazer: 'Confira a ficha embaixo: “completar” é o que ainda falta (não trava). Cabeças, peso, GMD e pasto vêm do fechamento.' } },
];

/** O que o assistente já escolheu (ids do cadastro). */
export interface Escolha {
  categoriaId: string | null;
  racaId: string | null;
  atividadeId: string | null;
}

const PARTE: Record<'categoria' | 'raca' | 'atividade', keyof Escolha> = { categoria: 'categoriaId', raca: 'racaId', atividade: 'atividadeId' };

export function escolhidoNoPasso(e: Escolha, passo: ChaveDoPasso): string | null {
  return passo === 'categoria' || passo === 'raca' || passo === 'atividade' ? e[PARTE[passo]] : null;
}

/** A fase pela sigla da atividade do cliente (CRI/REC/ENG; CR/RE/EN de antes do LOTES-04); outra sigla = sem fase (nada se filtra). */
export type Fase = 'cria' | 'recria' | 'engorda';
export function faseDaAtividade(sigla: string | null): Fase | null {
  /* LOTE-CODIGO-CURTO-01 (Gabriel 12/11): C/R/E no cadastro; CRI/REC/ENG e CR/RE/EN de antes seguem valendo */
  return sigla === 'C' || sigla === 'CRI' || sigla === 'CR' ? 'cria' : sigla === 'R' || sigla === 'REC' || sigla === 'RE' ? 'recria'
    : sigla === 'E' || sigla === 'ENG' || sigla === 'EN' ? 'engorda' : null;
}

/** D3 — as categorias do rebanho de cada fase: a categoria do lote entra se tiver UMA delas. */
const REBANHO_DA_FASE: Record<Fase, readonly string[]> = {
  cria: ['vacas', 'novilhas', 'touros', 'mamotes_m', 'mamotes_f'],
  recria: ['desmama_m', 'desmama_f', 'garrotes', 'novilhas'],
  engorda: ['bois', 'garrotes', 'novilhas', 'vacas'],
};

/** D3 (Gabriel 11/11 08:45) — a categoria filtrada pela atividade, derivada das categorias do rebanho dela (sem coluna nova).
 *  Sem fase (atividade do cliente fora de CRI/REC/ENG) = todas. A escolhida sempre fica (editar um lote que já era de outra). */
export function categoriasDaAtividade(categorias: readonly CadastroDoLote[], fase: Fase | null,
  rebanho: readonly { id: string; codigo: string }[], escolhida: string | null): CadastroDoLote[] {
  if (!fase) return [...categorias];
  const ids = new Set(rebanho.filter(r => REBANHO_DA_FASE[fase].includes(r.codigo)).map(r => r.id));
  return categorias.filter(c => c.id === escolhida || c.categoriasRebanho.some(id => ids.has(id)));
}

/** A linha de baixo do cartão da categoria, em UMA linha (Chat 11/11 14:45: nunca cortar): mamotes M + F = "mamotes", desmama M + F =
 *  "desmama"; mais de 2 = as 2 primeiras e "+N" (a lista inteira vai no title). */
export function resumoDoRebanho(nomes: readonly { codigo: string; nome: string }[]): string {
  const partes: string[] = [];
  for (const r of nomes) {
    const p = r.codigo.startsWith('mamotes') ? 'mamotes' : r.codigo.startsWith('desmama') ? 'desmama' : r.nome.toLowerCase();
    if (!partes.includes(p)) partes.push(p);
  }
  const ordem = [...partes.filter(p => p !== 'mamotes'), ...partes.filter(p => p === 'mamotes')];
  return ordem.length > 2 ? `${ordem.slice(0, 2).join(' + ')} +${ordem.length - 2}` : ordem.join(' + ');
}

/** O passo mais adiante que se pode abrir: atividade, depois categoria; com as duas, situação e raça; com a raça, o nome. */
export function ultimoPassoAlcancavel(e: Escolha): number {
  if (!e.atividadeId) return 0;
  if (!e.categoriaId) return 1;
  if (!e.racaId) return 3;
  return 4;
}

/** O que falta para seguir (ou salvar) neste passo; null = pode. Só atividade, categoria, raça e o carimbo da parida travam. */
export function faltaNoPasso(e: Escolha, p: Perfil, passo: number, cria: boolean): string | null {
  const k = PASSOS[passo]?.chave;
  if (k === 'atividade' && !e.atividadeId) return 'Escolha a atividade';
  if (k === 'categoria' && !e.categoriaId) return 'Escolha a categoria';
  if (k === 'raca' || k === 'nome') {
    if (!e.racaId) return 'Escolha a raça';
    if (cria && p.carimbo.trim() && !CARIMBO_VALIDO.test(p.carimbo.trim().toUpperCase())) return FRASE_CARIMBO_INVALIDO;
    if (cria && ehParida(p.situacaoCria) && listaDeCarimbos(p).length === 0) return 'Falta o carimbo dos mamotes';
  }
  if (k === 'nome' && (!e.atividadeId || !e.categoriaId)) return 'Falta atividade ou categoria';
  return null;
}

export const siglaDe = (cadastros: readonly CadastroDoLote[], id: string | null): string | null =>
  (id ? cadastros.find(c => c.id === id)?.sigla ?? null : null);
export const nomeDe = (cadastros: readonly CadastroDoLote[], id: string | null): string | null =>
  (id ? cadastros.find(c => c.id === id)?.nome ?? null : null);

/** O código no trilho. Lote NOVO (e lote 'etapas'): ATIV-CAT-RAÇA[-carimbo], -02 se repetir entre os lotes da fazenda (`codigoPorEtapas`).
 *  Lote de antes (código ATIV-CAT-RAÇA-NN): o mesmo código enquanto a identidade não muda; mudou = "-__" (o nº sai do banco ao salvar). */
export function codigoDoAssistente(cadastros: readonly CadastroDoLote[], e: Escolha, carimbos: readonly string[], lotes: readonly LoteDaLista[],
  editar?: LoteDaLista | null): string {
  const s = (id: string | null) => siglaDe(cadastros, id);
  if (editar && editar.codigoRegra !== 'etapas') {
    const mesma = editar.categoriaId === e.categoriaId && editar.racaId === e.racaId && editar.atividadeId === e.atividadeId;
    return mesma ? editar.codigo : codigoDoLote(s(e.categoriaId), s(e.racaId), s(e.atividadeId), null);
  }
  if (editar && editar.categoriaId === e.categoriaId && editar.racaId === e.racaId && editar.atividadeId === e.atividadeId
    && mesmaLista(carimbosDoLote(editar), carimbos)) return editar.codigo;
  return codigoPorEtapas(s(e.atividadeId), s(e.categoriaId), s(e.racaId), carimbosFaixa(carimbos), lotes, editar?.id ?? null);
}

/** LOTE-CARIMBOS-01 — a lista do lote (o 1º carimbo sozinho, nos lotes lidos antes da 117580). */
export const carimbosDoLote = (l: Pick<LoteDaLista, 'carimbo' | 'carimbos'>): string[] =>
  l.carimbos?.length ? [...l.carimbos] : l.carimbo ? [l.carimbo] : [];
const mesmaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** A lista do assistente: a escolhida + o que está digitado no campo, se for um carimbo válido que ainda não está nela. */
export function listaDeCarimbos(p: Pick<Perfil, 'carimbo' | 'carimbos'>): string[] {
  const digitado = p.carimbo.trim().toUpperCase();
  return digitado && CARIMBO_VALIDO.test(digitado) && !p.carimbos.includes(digitado) ? [...p.carimbos, digitado] : [...p.carimbos];
}

/** A legenda embaixo do código (Chat 11/11 14:45: na ordem do código). */
export function legendaDoCodigo(editar?: LoteDaLista | null): string {
  return editar && editar.codigoRegra !== 'etapas' ? 'atividade · categoria · raça · nº' : 'atividade · categoria · raça · carimbo';
}

const CAMPO_DO_TIPO: Partial<Record<TipoDoCadastro, keyof LoteDaLista>> = {
  categoria: 'categoriaId', raca: 'racaId', atividade: 'atividadeId', sistema: 'sistemaId', programa: 'programaId', destino: 'destinoId',
};

/** Quantos lotes ATIVOS usam o cadastro (o número do cartão). */
export function lotesQueUsam(lotes: readonly LoteDaLista[], c: Pick<CadastroDoLote, 'id' | 'tipo'>, soAtivos = true): number {
  const campo = CAMPO_DO_TIPO[c.tipo];
  if (!campo) return 0;
  return lotes.filter(l => (!soAtivos || l.situacao === 'ativo') && l.situacao !== 'cancelado' && l[campo] === c.id).length;
}

/** A busca do passo: sigla ou nome, sem acento nem maiúscula. */
export function filtrarCadastros(cadastros: readonly CadastroDoLote[], tipo: TipoDoCadastro, termo: string): CadastroDoLote[] {
  return cadastros.filter(c => c.tipo === tipo && c.ativo && (casaNaBusca(c.sigla, termo) || casaNaBusca(c.nome, termo)));
}

/** A sigla como se digita: maiúscula, só letras e números, até 3. */
export const siglaDigitada = (bruto: string): string => bruto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);

/** LOTE-SIGLA-EDITAR-01 — a prévia curta no bloco: "2 lotes mudam: DES-ANG-CRI-01 → DF-ANG-CRI-01 · …" ('' sem lote). */
export function fraseDaTroca(trocas: readonly TrocaDeCodigo[]): string {
  if (trocas.length === 0) return '';
  const n = trocas.length;
  return `${n} lote${n > 1 ? 's mudam' : ' muda'}: ${trocas.map(t => `${t.antes} → ${t.depois}`).join(' · ')}`;
}

/** A mesma prévia na linha dos botões, sem cortar: o 1º lote e "+N" (a lista inteira vai no `title`, pela `fraseDaTroca`). */
export function fraseCurtaDaTroca(trocas: readonly TrocaDeCodigo[]): string {
  if (trocas.length === 0) return '';
  const n = trocas.length;
  return `${n} lote${n > 1 ? 's mudam' : ' muda'}: ${trocas[0].antes} → ${trocas[0].depois}${n > 1 ? ` · +${n - 1}` : ''}`;
}

export interface ErroNoCampo { campo: 'sigla' | 'nome' | 'categorias'; mensagem: string }

/** A validação do "Cadastrar nova…"/✎ — as mesmas frases de `fn_lote_cadastro_salvar`. */
export function validarCadastro(e: {
  tipo: TipoDoCadastro; sigla: string; nome: string; categorias: readonly string[];
  existentes: readonly CadastroDoLote[]; idEditando: string | null;
}): ErroNoCampo | null {
  const comSigla = e.tipo === 'categoria' || e.tipo === 'raca' || e.tipo === 'atividade';
  const sigla = e.sigla.trim().toUpperCase();
  const nome = e.nome.trim();
  /* LOTE-CODIGO-CURTO-01 — a atividade com 1 a 3 (C cria · R recria · E engorda); categoria e raça 2 a 3 (as frases da RPC, 117550) */
  if (e.tipo === 'atividade' && !/^[A-Z0-9]{1,3}$/.test(sigla)) return { campo: 'sigla', mensagem: 'A sigla da atividade precisa de 1 a 3 letras ou números.' };
  if (comSigla && e.tipo !== 'atividade' && !/^[A-Z0-9]{2,3}$/.test(sigla)) return { campo: 'sigla', mensagem: 'A sigla precisa de 2 ou 3 letras ou números.' };
  const outros = e.existentes.filter(c => c.tipo === e.tipo && c.ativo && c.id !== e.idEditando);
  const dup = comSigla ? outros.find(c => c.sigla === sigla) : undefined;
  if (dup) return { campo: 'sigla', mensagem: `A sigla ${sigla} já é “${dup.nome}”. Escolha outra ou use a existente.` };
  if (!nome) return { campo: 'nome', mensagem: 'Falta o nome.' };
  if (nome.length > 32) return { campo: 'nome', mensagem: 'O nome passa de 32 letras.' };
  const dupNome = outros.find(c => c.nome.toLowerCase() === nome.toLowerCase());
  if (dupNome) return { campo: 'nome', mensagem: `“${dupNome.nome}” já está no cadastro.` };
  if (e.tipo === 'categoria' && e.categorias.length === 0) return { campo: 'categorias', mensagem: 'Marque pelo menos uma categoria do rebanho.' };
  return null;
}

/** O que o assistente guarda além da identidade (texto do campo, data em 'aaaa-mm-dd'). Sistema, programa, destino, safra, idade e
 *  metas não se digitam aqui (a ficha edita): vêm do lote e voltam iguais. */
export interface Perfil {
  nomeCampeiro: string;
  formadoEm: string;
  sistemaId: string | null;
  programaId: string | null;
  destinoId: string | null;
  safra: string;
  /** o que está digitado no campo "+ carimbo" (ainda não na lista) */
  carimbo: string;
  /** LOTE-CARIMBOS-01 — a lista */
  carimbos: string[];
  idadeMediaMeses: number | null;
  metaPesoKg: number | null;
  metaGmdKg: number | null;
  metaData: string;
  /* LOTE-ETAPAS-01 */
  anotacao: string;
  situacaoCria: SituacaoDaCria | null;
  ordemParto: OrdemDoParto | null;
  mamotesSexo: SexoDosMamotes | null;
  mamotesCruzamento: CruzamentoDosMamotes | null;
  mamotesSemen: SemenDosMamotes | null;
}

export function perfilInicial(hoje: string, editar?: LoteDaLista | null): Perfil {
  if (editar) {
    return {
      nomeCampeiro: editar.nomeCampeiro ?? '', formadoEm: editar.formadoEm, sistemaId: editar.sistemaId, programaId: editar.programaId,
      destinoId: editar.destinoId, safra: editar.safra ?? '', carimbo: '', carimbos: carimbosDoLote(editar), idadeMediaMeses: editar.idadeMediaMeses,
      metaPesoKg: editar.metaPesoKg, metaGmdKg: editar.metaGmdKg, metaData: editar.metaData ?? '',
      anotacao: editar.anotacao ?? '', situacaoCria: editar.situacaoCria ?? null, ordemParto: editar.ordemParto ?? null,
      mamotesSexo: editar.mamotesSexo ?? null, mamotesCruzamento: editar.mamotesCruzamento ?? null, mamotesSemen: editar.mamotesSemen ?? null,
    };
  }
  return { nomeCampeiro: '', formadoEm: hoje, sistemaId: null, programaId: null, destinoId: null, safra: safraDe(hoje), carimbo: '', carimbos: [],
    idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: '',
    anotacao: '', situacaoCria: null, ordemParto: null, mamotesSexo: null, mamotesCruzamento: null, mamotesSemen: null };
}

/** A safra do dia (jul–jun): 06/11/2026 → "26/27"; 15/03/2027 → "26/27". */
export function safraDe(iso: string): string {
  const ano = Number(iso.slice(0, 4)); const mes = Number(iso.slice(5, 7));
  const ini = mes >= 7 ? ano : ano - 1;
  return `${String(ini % 100).padStart(2, '0')}/${String((ini + 1) % 100).padStart(2, '0')}`;
}

/** Carimbo só em lote de cria: atividade de sigla CRI (CR antes do LOTES-04) ou categoria que leva mamotes. */
export function aceitaCarimbo(cadastros: readonly CadastroDoLote[], e: Escolha, idsDosMamotes: readonly string[]): boolean {
  const ativ = siglaDe(cadastros, e.atividadeId);
  if (ativ === 'C' || ativ === 'CRI' || ativ === 'CR') return true;
  const cat = cadastros.find(c => c.id === e.categoriaId);
  return !!cat && cat.categoriasRebanho.some(id => idsDosMamotes.includes(id));
}

/** L1 — marca cada lote que leva carimbo, pela MESMA regra do assistente (atividade CRI/CR ou categoria de mamotes). */
export function marcarDaCria(lotes: readonly LoteDaLista[], cadastros: readonly CadastroDoLote[], idsDosMamotes: readonly string[]): LoteDaLista[] {
  return lotes.map(l => ({ ...l, daCria: aceitaCarimbo(cadastros, { atividadeId: l.atividadeId, categoriaId: l.categoriaId, racaId: l.racaId }, idsDosMamotes) }));
}

export function validarPerfil(p: Perfil, hoje: string): { campo: keyof Perfil; mensagem: string } | null {
  if (p.nomeCampeiro.trim().length > 40) return { campo: 'nomeCampeiro', mensagem: 'O apelido passa de 40 letras.' };
  if (p.anotacao.trim().length > 120) return { campo: 'anotacao', mensagem: 'A anotação passa de 120 letras.' };
  if (!p.formadoEm) return { campo: 'formadoEm', mensagem: 'Formado em: escolha a data.' };
  if (p.formadoEm > hoje) return { campo: 'formadoEm', mensagem: 'Formado em: a data não pode ser depois de hoje.' };
  if (p.carimbo.trim() && !CARIMBO_VALIDO.test(p.carimbo.trim().toUpperCase())) return { campo: 'carimbo', mensagem: FRASE_CARIMBO_INVALIDO };
  if (ehParida(p.situacaoCria) && listaDeCarimbos(p).length === 0) return { campo: 'carimbo', mensagem: 'Parida: informe o carimbo (mês.lote, ex.: 7.1).' };
  return null;
}

/** LOTES-05 (Gabriel 08/11) — o carimbo no passo Nº da cria: vazio vale (o lote aparece pelo código); errado trava o Avançar. */
export function validarCarimbo(carimbo: string): string | null {
  const t = carimbo.trim();
  return t && !CARIMBO_VALIDO.test(t) ? FRASE_CARIMBO_INVALIDO : null;
}

/** O `p_campos` de `fn_lote_salvar`: ao criar, tudo; ao editar, só o que mudou (a RPC mantém o resto). Fora da cria a situação e a ordem
 *  de parto vão vazias; fora da parida, os mamotes (a mojada não tem bezerro ao pé). O nº nunca vai: o banco decide. */
export function camposParaSalvar(e: Escolha, p: Perfil, cria: boolean, editar?: LoteDaLista | null, criaAntes?: boolean): CamposDoLote {
  const parida = cria && ehParida(p.situacaoCria);
  const novo: CamposDoLote = {
    categoria_id: e.categoriaId ?? undefined, raca_id: e.racaId ?? undefined, atividade_id: e.atividadeId ?? undefined,
    nome_campeiro: p.nomeCampeiro.trim(), formado_em: p.formadoEm,
    sistema_id: p.sistemaId ?? '', programa_id: p.programaId ?? '', destino_id: p.destinoId ?? '',
    safra: p.safra.trim(), carimbos: listaDeCarimbos(p),
    idade_media_meses: p.idadeMediaMeses == null ? '' : String(p.idadeMediaMeses),
    meta_peso_kg: p.metaPesoKg == null ? '' : String(p.metaPesoKg), meta_gmd_kg: p.metaGmdKg == null ? '' : String(p.metaGmdKg),
    meta_data: p.metaData,
    situacao_cria: cria ? p.situacaoCria ?? '' : '', ordem_parto: cria ? p.ordemParto ?? '' : '',
    mamotes_sexo: parida ? p.mamotesSexo ?? '' : '', mamotes_cruzamento: parida ? p.mamotesCruzamento ?? '' : '',
    mamotes_semen: parida ? p.mamotesSemen ?? '' : '', anotacao: p.anotacao.trim(),
  };
  if (!editar) return novo;
  const antes = camposParaSalvar({ categoriaId: editar.categoriaId, racaId: editar.racaId, atividadeId: editar.atividadeId },
    perfilInicial(editar.formadoEm, editar), criaAntes ?? cria);
  const so: CamposDoLote = {};
  for (const k of CHAVES_DO_LOTE) {
    if (JSON.stringify(novo[k]) !== JSON.stringify(antes[k])) Object.assign(so, { [k]: novo[k] });
  }
  return so;
}

const CHAVES_DO_LOTE: readonly (keyof CamposDoLote)[] = ['categoria_id', 'raca_id', 'atividade_id', 'nome_campeiro', 'formado_em', 'sistema_id',
  'programa_id', 'destino_id', 'safra', 'carimbos', 'idade_media_meses', 'meta_peso_kg', 'meta_gmd_kg', 'meta_data',
  'situacao_cria', 'ordem_parto', 'mamotes_sexo', 'mamotes_cruzamento', 'mamotes_semen', 'anotacao'];

/** A ficha do passo Nome: uma linha por etapa; vazio = null (a tela escreve "completar" em laranja, nunca trava). */
export interface LinhaDaFicha { rotulo: string; valor: string | null }
export function fichaDoAssistente(cadastros: readonly CadastroDoLote[], e: Escolha, p: Perfil, cria: boolean): LinhaDaFicha[] {
  const parte = (id: string | null) => (id ? [siglaDe(cadastros, id), nomeDe(cadastros, id)].filter(Boolean).join(' · ') : null);
  const situacao = [nomeNaLista(SITUACOES_DA_CRIA, p.situacaoCria), nomeNaLista(ORDENS_DO_PARTO, p.ordemParto)].filter(Boolean).join(' · ') || null;
  const programa = [nomeDe(cadastros, p.programaId), nomeDe(cadastros, p.sistemaId)].filter(Boolean).join(' · ') || null;
  /* Chat 12/11 09:20 — o programa vale em todas as atividades (a novilha em reprodução também) */
  const linhas: LinhaDaFicha[] = [
    { rotulo: 'Atividade', valor: parte(e.atividadeId) },
    { rotulo: 'Categoria e sexo', valor: parte(e.categoriaId) },
    ...(cria ? [{ rotulo: 'Situação', valor: situacao }] : []),
    { rotulo: 'Programa e sistema', valor: programa },
    { rotulo: 'Raça', valor: parte(e.racaId) },
  ];
  if (cria) {
    const mamotes = ehParida(p.situacaoCria)
      ? [listaDeCarimbos(p).length ? `carimbo${listaDeCarimbos(p).length > 1 ? 's' : ''} ${listaDeCarimbos(p).join(', ')}` : null, nomeNaLista(SEXOS_DOS_MAMOTES, p.mamotesSexo),
        nomeNaLista(CRUZAMENTOS_DOS_MAMOTES, p.mamotesCruzamento), nomeNaLista(SEMENS_DOS_MAMOTES, p.mamotesSemen)].filter(Boolean).join(' · ') || null
      : p.situacaoCria ? 'sem cria ao pé' : null;
    linhas.push({ rotulo: 'Mamotes ao pé', valor: mamotes });
  }
  return linhas;
}
