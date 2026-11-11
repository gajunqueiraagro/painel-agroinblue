/**
 * LOTES-03 F1 — a regra do assistente "+ Novo lote" (mock lotes-03-assistente.html, aprovado 06/11 15:45), sem tela:
 * os 5 passos, até onde se pode ir, o código montando, a contagem de lotes por cadastro, a busca e a validação do "Cadastrar nova…".
 * Quem grava é o banco (`fn_lote_cadastro_salvar`, `fn_lote_salvar`); as mensagens daqui são as MESMAS da RPC, para o erro aparecer no
 * campo antes de ir ao banco.
 */
import { casaNaBusca } from '@/lib/texto/busca';
import { CARIMBO_VALIDO, FRASE_CARIMBO_INVALIDO, codigoDoLote, type CadastroDoLote, type CamposDoLote, type LoteDaLista, type TipoDoCadastro, type TrocaDeCodigo } from '@/lib/lotes/tipos';

export type ChaveDoPasso = 'categoria' | 'raca' | 'atividade' | 'numero' | 'perfil';

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
  opcional?: boolean;
}

export const PASSOS: readonly PassoDoAssistente[] = [
  { chave: 'atividade', titulo: 'Atividade', pergunta: 'Em que atividade o lote está?', coisa: 'atividade', cadastrarNova: 'Cadastrar nova atividade',
    subtitulo: 'Fase de produção. Separa o custo e os indicadores por fase (cria, recria, engorda).',
    ajuda: { oQueE: 'A 1ª parte do código do lote (a sigla).', porQue: 'O custo e os indicadores se separam por fase.',
      comoFazer: 'Mudou de fase depois (ex.: recria → engorda)? Edite a identidade na ficha: o código muda e o antigo fica no histórico.' } },
  { chave: 'categoria', titulo: 'Categoria', pergunta: 'Qual é a categoria do lote?', coisa: 'categoria', cadastrarNova: 'Cadastrar nova categoria',
    subtitulo: 'Quem forma o lote. Define quais categorias do rebanho podem ser lançadas nele.',
    ajuda: { oQueE: 'A 2ª parte do código do lote.', porQue: 'Diz quem forma o lote e quais categorias do rebanho entram nele.',
      comoFazer: 'Escolha um cartão. A lista vem do cadastro do cliente: cadastre a que faltar em “Cadastrar nova categoria”.' } },
  { chave: 'raca', titulo: 'Raça', pergunta: 'Qual é a raça?', coisa: 'raça', cadastrarNova: 'Cadastrar nova raça',
    subtitulo: 'Raça predominante do lote. Lote cruzado: use Mestiço ou cadastre a sigla do cruzamento.',
    ajuda: { oQueE: 'A 3ª parte do código do lote.', porQue: 'Separa os lotes da mesma categoria pela raça.',
      comoFazer: 'Escolha um cartão ou cadastre a raça que faltar.' } },
  { chave: 'numero', titulo: 'Número', pergunta: 'Número do lote',
    subtitulo: 'Sai sozinho: o próximo livre desta combinação na fazenda. Dá para trocar.',
    ajuda: { oQueE: 'A 4ª parte do código.', porQue: 'Contado por fazenda e por combinação atividade · categoria · raça; número de lote encerrado não volta, para o histórico não confundir.',
      comoFazer: 'Confira o código e os lotes que já existem nesta combinação. Para outro número, digite no quadro do nº (1 a 99, livre). Na cria, digite o carimbo do mês (7.1, 7R): o lote aparece por ele e o nº fica por dentro. O nome do campeiro é opcional.' } },
  { chave: 'perfil', titulo: 'Perfil e metas', pergunta: 'Perfil e metas', opcional: true,
    subtitulo: 'Para montar a estratégia do lote. Pode pular e preencher depois na ficha.',
    ajuda: { oQueE: 'Sistema, programa, destino, safra e metas.', porQue: 'Orientam o plano nutricional, a sanidade, a estação de monta e a escala de abates.',
      comoFazer: 'Escolha o que já souber. Cabeças, peso, GMD, pasto e custo não se digitam: vêm do fechamento.' } },
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

/** O passo mais adiante que se pode abrir: os 3 de cartão na ordem do código (atividade, categoria, raça); com os 3, o número e o perfil. */
export function ultimoPassoAlcancavel(e: Escolha): number {
  if (!e.atividadeId) return 0;
  if (!e.categoriaId) return 1;
  if (!e.racaId) return 2;
  return 4;
}

export function podeAvancar(e: Escolha, passo: number): boolean {
  const k = PASSOS[passo]?.chave;
  if (k === 'categoria' || k === 'raca' || k === 'atividade') return escolhidoNoPasso(e, k) != null;
  return passo < PASSOS.length;
}

export const siglaDe = (cadastros: readonly CadastroDoLote[], id: string | null): string | null =>
  (id ? cadastros.find(c => c.id === id)?.sigla ?? null : null);
export const nomeDe = (cadastros: readonly CadastroDoLote[], id: string | null): string | null =>
  (id ? cadastros.find(c => c.id === id)?.nome ?? null : null);

/** O código no trilho: "REC-DF-__-__" enquanto falta parte. */
export function codigoMontando(cadastros: readonly CadastroDoLote[], e: Escolha, numero: number | null): string {
  const completo = e.categoriaId && e.racaId && e.atividadeId;
  return codigoDoLote(siglaDe(cadastros, e.categoriaId), siglaDe(cadastros, e.racaId), siglaDe(cadastros, e.atividadeId), completo ? numero : null);
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

/** Os lotes que já existem nesta combinação na fazenda (o quadro do passo 4), em ordem de número. */
export function lotesDaCombinacao(lotes: readonly LoteDaLista[], e: Escolha): LoteDaLista[] {
  return lotes.filter(l => l.situacao !== 'cancelado' && l.categoriaId === e.categoriaId && l.racaId === e.racaId && l.atividadeId === e.atividadeId)
    .sort((a, b) => a.numero - b.numero);
}

/** Na edição com a MESMA combinação, o número continua o do lote; senão, o próximo livre (lido do banco). */
export function mesmaCombinacao(editar: LoteDaLista | null | undefined, e: Escolha): boolean {
  return !!editar && editar.categoriaId === e.categoriaId && editar.racaId === e.racaId && editar.atividadeId === e.atividadeId;
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
  if (comSigla && !/^[A-Z0-9]{2,3}$/.test(sigla)) return { campo: 'sigla', mensagem: 'A sigla precisa de 2 ou 3 letras ou números.' };
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

/** O perfil do passo 5 (ids do cadastro, texto do campo, data em 'aaaa-mm-dd'). */
export interface Perfil {
  nomeCampeiro: string;
  formadoEm: string;
  sistemaId: string | null;
  programaId: string | null;
  destinoId: string | null;
  safra: string;
  carimbo: string;
  idadeMediaMeses: number | null;
  metaPesoKg: number | null;
  metaGmdKg: number | null;
  metaData: string;
}

export function perfilInicial(hoje: string, editar?: LoteDaLista | null): Perfil {
  if (editar) {
    return {
      nomeCampeiro: editar.nomeCampeiro ?? '', formadoEm: editar.formadoEm, sistemaId: editar.sistemaId, programaId: editar.programaId,
      destinoId: editar.destinoId, safra: editar.safra ?? '', carimbo: editar.carimbo ?? '', idadeMediaMeses: editar.idadeMediaMeses,
      metaPesoKg: editar.metaPesoKg, metaGmdKg: editar.metaGmdKg, metaData: editar.metaData ?? '',
    };
  }
  return { nomeCampeiro: '', formadoEm: hoje, sistemaId: null, programaId: null, destinoId: null, safra: safraDe(hoje), carimbo: '',
    idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: '' };
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
  if (ativ === 'CRI' || ativ === 'CR') return true;
  const cat = cadastros.find(c => c.id === e.categoriaId);
  return !!cat && cat.categoriasRebanho.some(id => idsDosMamotes.includes(id));
}

/** L1 — marca cada lote que leva carimbo, pela MESMA regra do assistente (atividade CRI/CR ou categoria de mamotes). */
export function marcarDaCria(lotes: readonly LoteDaLista[], cadastros: readonly CadastroDoLote[], idsDosMamotes: readonly string[]): LoteDaLista[] {
  return lotes.map(l => ({ ...l, daCria: aceitaCarimbo(cadastros, { atividadeId: l.atividadeId, categoriaId: l.categoriaId, racaId: l.racaId }, idsDosMamotes) }));
}

export function validarPerfil(p: Perfil, hoje: string): { campo: keyof Perfil; mensagem: string } | null {
  if (p.nomeCampeiro.trim().length > 40) return { campo: 'nomeCampeiro', mensagem: 'O nome do campeiro passa de 40 letras.' };
  if (!p.formadoEm) return { campo: 'formadoEm', mensagem: 'Formado em: escolha a data.' };
  if (p.formadoEm > hoje) return { campo: 'formadoEm', mensagem: 'Formado em: a data não pode ser depois de hoje.' };
  if (p.safra.trim() && !/^[0-9]{2}\/[0-9]{2}$/.test(p.safra.trim())) return { campo: 'safra', mensagem: 'Safra: no formato 26/27.' };
  if (p.carimbo.trim() && !CARIMBO_VALIDO.test(p.carimbo.trim())) return { campo: 'carimbo', mensagem: FRASE_CARIMBO_INVALIDO };
  if (p.idadeMediaMeses != null && (p.idadeMediaMeses < 0 || p.idadeMediaMeses > 400 || !Number.isInteger(p.idadeMediaMeses))) return { campo: 'idadeMediaMeses', mensagem: 'Idade média: em meses, só o número.' };
  if ((p.metaPesoKg != null && p.metaPesoKg <= 0) || (p.metaGmdKg != null && p.metaGmdKg <= 0)) return { campo: p.metaPesoKg != null && p.metaPesoKg <= 0 ? 'metaPesoKg' : 'metaGmdKg', mensagem: 'A meta precisa ser maior que zero.' };
  return null;
}

/** LOTES-04 — o nº digitado no passo 4 ('' = automático): 1 a 99 e livre na combinação da fazenda (a mesma frase da RPC). */
export function validarNumero(digitado: string, existentes: readonly LoteDaLista[], idEditando: string | null): string | null {
  if (!digitado) return null;
  const n = Number(digitado);
  if (!/^[0-9]{1,2}$/.test(digitado) || n < 1) return 'O nº vai de 1 a 99.';
  const dono = existentes.find(l => l.numero === n && l.id !== idEditando);
  return dono ? `O nº ${String(n).padStart(2, '0')} já é do lote ${dono.codigo}. Escolha outro.` : null;
}

/** LOTES-05 (Gabriel 08/11) — o carimbo no passo Nº da cria: vazio vale (o lote aparece pelo código); errado trava o Avançar. */
export function validarCarimbo(carimbo: string): string | null {
  const t = carimbo.trim();
  return t && !CARIMBO_VALIDO.test(t) ? FRASE_CARIMBO_INVALIDO : null;
}

/** O `p_campos` de `fn_lote_salvar`: ao criar, tudo; ao editar, só o que mudou (a RPC mantém o resto).
 *  `numero` = o nº digitado (LOTES-04); sem ele, o banco usa o próximo livre (ou o do lote, na mesma combinação). */
export function camposParaSalvar(e: Escolha, p: Perfil, editar?: LoteDaLista | null, numero?: number | null): CamposDoLote {
  const novo: CamposDoLote = {
    categoria_id: e.categoriaId ?? undefined, raca_id: e.racaId ?? undefined, atividade_id: e.atividadeId ?? undefined,
    nome_campeiro: p.nomeCampeiro.trim(), formado_em: p.formadoEm,
    sistema_id: p.sistemaId ?? '', programa_id: p.programaId ?? '', destino_id: p.destinoId ?? '',
    safra: p.safra.trim(), carimbo: p.carimbo.trim(),
    idade_media_meses: p.idadeMediaMeses == null ? '' : String(p.idadeMediaMeses),
    meta_peso_kg: p.metaPesoKg == null ? '' : String(p.metaPesoKg), meta_gmd_kg: p.metaGmdKg == null ? '' : String(p.metaGmdKg),
    meta_data: p.metaData,
  };
  if (!editar) return numero == null ? novo : { ...novo, numero };
  const antes = camposParaSalvar({ categoriaId: editar.categoriaId, racaId: editar.racaId, atividadeId: editar.atividadeId }, perfilInicial(editar.formadoEm, editar));
  const so: CamposDoLote = {};
  for (const k of CHAVES_DO_LOTE) {
    if (novo[k] !== antes[k]) Object.assign(so, { [k]: novo[k] });
  }
  const mesmoNumero = numero === editar.numero && !so.categoria_id && !so.raca_id && !so.atividade_id;
  return numero == null || mesmoNumero ? so : { ...so, numero };
}

const CHAVES_DO_LOTE: readonly (keyof CamposDoLote)[] = ['categoria_id', 'raca_id', 'atividade_id', 'nome_campeiro', 'formado_em', 'sistema_id',
  'programa_id', 'destino_id', 'safra', 'carimbo', 'idade_media_meses', 'meta_peso_kg', 'meta_gmd_kg', 'meta_data'];
