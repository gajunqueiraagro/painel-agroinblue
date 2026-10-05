/**
 * O ACEITE DE ARQUIVO TEM UM DONO — UI-ARRASTAR-ARQUIVO-01a (Gabriel, 05/10/2026).
 *
 * Todo campo que recebe arquivo (clicado ou arrastado) pergunta AQUI se o arquivo serve. Nenhuma tela decide tipo, tamanho ou
 * quantidade por conta própria; os donos antigos (`motivoArquivoRecusado`, o `anexar` do documento do lançamento,
 * `motivoArquivoInvalido` da OC e o extrato do saldo) DELEGAM a esta função, cada um com a sua regra e as suas frases.
 *
 * ⚠ O TIPO: pelo MIME quando o navegador o informa; SEM MIME (vazio ou `application/octet-stream`), pela EXTENSÃO do nome. O XML
 *   de NF-e chega como `text/xml`, `application/xml` ou vazio (alguns navegadores não sabem o tipo de `.xml`) — e é aceito ONDE
 *   XML já é tipo permitido. MIME informado e fora da lista recusa, mesmo com extensão boa (era a regra de sempre).
 * ⚠ O ARQUIVO ACEITO SAI COM O TIPO PREENCHIDO: quando o tipo veio da extensão, o `File` devolvido é o mesmo conteúdo com o MIME
 *   canônico — quem sobe o arquivo (caminho pela extensão do MIME, `contentType`) segue sem mudar uma linha.
 * ⚠ O VEREDITO É DO LOTE E DE CADA ARQUIVO: a tela de UM arquivo usa `ok`/`motivo`; a de LOTE (boletos, XML) mostra o
 *   `porArquivo` na linha de cada um.
 */

export type TipoDeArquivo = 'pdf' | 'jpg' | 'png' | 'xml' | 'ofx' | 'xlsx' | 'xls' | 'csv' | 'txt';

/**
 * O CATÁLOGO: por tipo, as extensões, os MIME PRÓPRIOS e os MIME GENÉRICOS que o navegador costuma mandar no lugar deles.
 * ⚠ GENÉRICO SÓ VALE COM A EXTENSÃO DO TIPO (UI-ARRASTAR-ARQUIVO-01b): o OFX quase nunca chega com tipo próprio — vem vazio,
 *   `application/octet-stream` ou `text/plain`; o CSV vem como `text/plain` ou, no Windows com Excel instalado,
 *   `application/vnd.ms-excel` (que é o MIME próprio do .xls). Nesses casos a EXTENSÃO manda. Um `.pdf` com `text/plain`
 *   continua NÃO sendo PDF: `text/plain` não é genérico de PDF.
 */
const CATALOGO: Record<TipoDeArquivo, { extensoes: readonly string[]; mimes: readonly string[]; genericos: readonly string[] }> = {
  pdf: { extensoes: ['pdf'], mimes: ['application/pdf'], genericos: [] },
  jpg: { extensoes: ['jpg', 'jpeg'], mimes: ['image/jpeg'], genericos: [] },
  png: { extensoes: ['png'], mimes: ['image/png'], genericos: [] },
  xml: { extensoes: ['xml'], mimes: ['application/xml', 'text/xml'], genericos: [] },
  ofx: { extensoes: ['ofx'], mimes: ['application/x-ofx', 'application/ofx', 'application/vnd.intu.qfx'], genericos: ['text/plain'] },
  xlsx: { extensoes: ['xlsx'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], genericos: [] },
  xls: { extensoes: ['xls'], mimes: ['application/vnd.ms-excel'], genericos: [] },
  csv: { extensoes: ['csv'], mimes: ['text/csv', 'application/csv', 'text/comma-separated-values'], genericos: ['text/plain', 'application/vnd.ms-excel'] },
  txt: { extensoes: ['txt'], mimes: ['text/plain'], genericos: [] },
};
const TODOS: readonly TipoDeArquivo[] = ['pdf', 'jpg', 'png', 'xml', 'ofx', 'xlsx', 'xls', 'csv', 'txt'];
/** O que o navegador manda quando NÃO sabe o tipo. */
const SEM_MIME: readonly string[] = ['', 'application/octet-stream'];

export type CodigoDeRecusa = 'vazio' | 'tipo' | 'tamanho' | 'varios';

export interface RegraDeAceite {
  tipos: readonly TipoDeArquivo[];
  tamanhoMaxBytes?: number;
  /** Aceita mais de um arquivo por vez. Padrão: um só. */
  varios?: boolean;
  /** As frases de quem usa, quando um teste ou a tela prendem um texto. Sem elas, as do dono. */
  frases?: Partial<Record<CodigoDeRecusa, string | ((arquivo: File | null) => string)>>;
}

/** `arquivo` é o que segue adiante (com o tipo preenchido quando aceito); `original` é o que o operador entregou. */
export interface VereditoDoArquivo { arquivo: File; original: File; motivo: string | null; codigo: CodigoDeRecusa | null }
export type Aceite =
  | { ok: true; motivo: null; codigo: null; arquivos: File[]; porArquivo: VereditoDoArquivo[] }
  | { ok: false; motivo: string; codigo: CodigoDeRecusa; arquivos: File[]; porArquivo: VereditoDoArquivo[] };

const extensaoDoNome = (nome: string): string => {
  const i = nome.lastIndexOf('.');
  return i < 0 ? '' : nome.slice(i + 1).toLowerCase();
};

/**
 * O tipo do arquivo pelo catálogo. `null` = nenhum tipo conhecido.
 *   1. sem MIME (vazio ou `application/octet-stream`): a EXTENSÃO;
 *   2. a extensão aponta um tipo e o MIME é próprio OU genérico DAQUELE tipo: esse tipo (o `.ofx` em `text/plain`, o `.csv`
 *      em `application/vnd.ms-excel`);
 *   3. senão, o tipo que tem aquele MIME como próprio (arquivo sem extensão, ou com a extensão trocada).
 */
export function tipoDoArquivo(arquivo: Pick<File, 'name' | 'type'>): TipoDeArquivo | null {
  const mime = (arquivo.type ?? '').toLowerCase();
  const ext = extensaoDoNome(arquivo.name ?? '');
  const pelaExtensao = ext ? (TODOS.find(t => CATALOGO[t].extensoes.includes(ext)) ?? null) : null;
  if (SEM_MIME.includes(mime)) return pelaExtensao;
  if (pelaExtensao && (CATALOGO[pelaExtensao].mimes.includes(mime) || CATALOGO[pelaExtensao].genericos.includes(mime))) return pelaExtensao;
  return TODOS.find(t => CATALOGO[t].mimes.includes(mime)) ?? null;
}

const NOMES: Record<TipoDeArquivo, string> = {
  pdf: 'PDF', jpg: 'imagem', png: 'imagem', xml: 'XML', ofx: 'OFX', xlsx: 'Excel', xls: 'Excel', csv: 'CSV', txt: 'TXT',
};
/** "PDF, imagem ou XML" — os tipos da regra, em português, sem repetir "imagem". */
export function tiposPorExtenso(tipos: readonly TipoDeArquivo[]): string {
  const nomes = [...new Set(tipos.map(t => NOMES[t]))];
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}
const SIGLAS: Record<TipoDeArquivo, string> = {
  pdf: 'PDF', jpg: 'JPG', png: 'PNG', xml: 'XML', ofx: 'OFX', xlsx: 'XLSX', xls: 'XLS', csv: 'CSV', txt: 'TXT',
};
/** "PDF, JPG, PNG ou XML" — os tipos da regra pela sigla, para a frase de recusa e a ajuda. */
export function tiposPorSigla(tipos: readonly TipoDeArquivo[]): string {
  const nomes = [...new Set(tipos.map(t => SIGLAS[t]))];
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}
/**
 * "Formato não aceito. Envie PDF, JPG, PNG ou XML." — a frase de recusa dos documentos, SEMPRE montada dos tipos da regra: a
 * tela nunca escreve à mão o que aceita (a frase antiga dizia "PDF, JPG ou PNG" onde XML já entrava).
 */
export const fraseDeFormatoNaoAceito = (tipos: readonly TipoDeArquivo[]): string => `Formato não aceito. Envie ${tiposPorSigla(tipos)}.`;
/** "PDF, JPG, PNG ou XML, até 10 MB" — a ajuda escrita junto do campo, vinda da regra. */
export function ajudaDaRegra(regra: RegraDeAceite): string {
  return `${tiposPorSigla(regra.tipos)}${regra.tamanhoMaxBytes != null ? `, até ${tamanhoPorExtenso(regra.tamanhoMaxBytes)}` : ''}`;
}

/** "10 MB" / "512 KB" — o limite como a tela o escreve. */
export function tamanhoPorExtenso(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function frase(regra: RegraDeAceite, codigo: CodigoDeRecusa, arquivo: File | null): string {
  const propria = regra.frases?.[codigo];
  if (typeof propria === 'function') return propria(arquivo);
  if (typeof propria === 'string' && propria.trim()) return propria;
  if (codigo === 'tipo') return `Só ${tiposPorExtenso(regra.tipos)}.`;
  if (codigo === 'tamanho') return `Arquivo acima de ${tamanhoPorExtenso(regra.tamanhoMaxBytes ?? 0)}.`;
  if (codigo === 'varios') return 'Solte um arquivo só.';
  return 'Nenhum arquivo.';
}

/** O mesmo arquivo com o MIME canônico do tipo, quando o navegador não o informou. */
function comTipo(arquivo: File, tipo: TipoDeArquivo): File {
  if (!SEM_MIME.includes((arquivo.type ?? '').toLowerCase())) return arquivo;
  return new File([arquivo], arquivo.name, { type: CATALOGO[tipo].mimes[0], lastModified: arquivo.lastModified });
}

export function aceitarArquivo(arquivos: ArrayLike<File> | null | undefined, regra: RegraDeAceite): Aceite {
  const lista = arquivos ? Array.from(arquivos) : [];
  const porArquivo: VereditoDoArquivo[] = lista.map((arquivo) => {
    const tipo = tipoDoArquivo(arquivo);
    if (!tipo || !regra.tipos.includes(tipo)) return { arquivo, original: arquivo, codigo: 'tipo', motivo: frase(regra, 'tipo', arquivo) };
    if (regra.tamanhoMaxBytes != null && arquivo.size > regra.tamanhoMaxBytes) return { arquivo, original: arquivo, codigo: 'tamanho', motivo: frase(regra, 'tamanho', arquivo) };
    return { arquivo: comTipo(arquivo, tipo), original: arquivo, codigo: null, motivo: null };
  });
  const aceitos = porArquivo.filter(v => v.motivo === null).map(v => v.arquivo);
  const recusar = (codigo: CodigoDeRecusa, motivo: string): Aceite => ({ ok: false, motivo, codigo, arquivos: aceitos, porArquivo });
  if (lista.length === 0) return recusar('vazio', frase(regra, 'vazio', null));
  if (!regra.varios && lista.length > 1) return recusar('varios', frase(regra, 'varios', null));
  const primeira = porArquivo.find(v => v.motivo !== null);
  if (primeira?.motivo && primeira.codigo) return recusar(primeira.codigo, primeira.motivo);
  return { ok: true, motivo: null, codigo: null, arquivos: aceitos, porArquivo };
}

/** O `accept` do seletor do sistema para a regra: os MIME e as extensões dos tipos. */
export function acceptDaRegra(regra: RegraDeAceite): string {
  const partes: string[] = [];
  for (const t of regra.tipos) { partes.push(...CATALOGO[t].mimes); }
  for (const t of regra.tipos) { partes.push(...CATALOGO[t].extensoes.map(e => `.${e}`)); }
  return [...new Set(partes)].join(',');
}

/** "PDF, imagem ou XML · até 10 MB" — o que a área escreve depois do convite. */
export function resumoDaRegra(regra: RegraDeAceite): string {
  const limite = regra.tamanhoMaxBytes != null ? ` · até ${tamanhoPorExtenso(regra.tamanhoMaxBytes)}${regra.varios ? ' cada' : ''}` : '';
  return `${tiposPorExtenso(regra.tipos)}${limite}${regra.varios ? ' · vários de uma vez' : ''}`;
}
