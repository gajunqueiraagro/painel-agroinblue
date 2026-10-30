/**
 * O DANFE (O PDF DA NF-e) LIDO PELA POSICAO — FIN-NOTA-PDF-01. PURO: recebe os itens de texto de cada pagina (com a posicao e o
 * tamanho que o pdfjs da') e devolve a MESMA `NotaLida` do leitor do XML (`lerNFe`). Nada de segundo contrato: daqui para a
 * frente a nota do PDF segue o caminho da nota do XML (`proporLancamento`, `resolverEmitente`, `pendenteDaNota`).
 *
 * A REGRA DO DANFE: cada caixa tem o ROTULO em cima e o VALOR logo abaixo, na mesma coluna. A coluna de um rotulo vai do x dele ate'
 * o x do proximo rotulo da mesma linha; o valor e' o item mais alto dentro dessa coluna, ate' 14pt abaixo do rotulo. O texto do PDF
 * sai na ORDEM DO FLUXO (rotulos todos antes, valores depois, em muitos emissores): ler pela ordem seria adivinhar.
 *
 * ⚠ A CHAVE DE 44 DIGITOS CONFERE O LIDO: ela traz o CNPJ do emitente, o modelo, a serie, o numero e o ano/mes da emissao, e o
 *   ultimo digito e' o verificador (modulo 11). O que nao bate vira `divergencias` — a tela pinta o campo de vermelho e NADA cria.
 * ⚠ O NOME DO EMITENTE vem do canhoto ("RECEBEMOS DE <nome> OS PRODUTOS…"): o DANFE corta a razao social (ex.: "… LTD"); o nome
 *   inteiro e' da Receita, e quem o busca e' a tela (`consultarCnpj`).
 * ⚠ PDF SEM TEXTO (foto, escaneado) nao e' lido aqui: e' a etapa 2.
 */
import { soDigitos } from './formatos';
import { somarCentavos } from './centavos';
import type { AvisoNFe, DuplicataNFe, FinalidadeNota, NotaLida } from './tipos';

/** Um item de texto do pdfjs: `x`/`y` da linha de base (pontos, origem embaixo a' esquerda), largura e altura. */
export interface ItemDoDanfe { str: string; x: number; y: number; w: number; h: number }

/** O que foi lido, onde — para o amarelo da tela. Pagina conta de 1. */
export type CampoDaMarca =
  | 'emitente' | 'emitente_endereco' | 'emitente_cidade' | 'emitente_cnpj' | 'emitente_ie' | 'numero' | 'serie' | 'chave' | 'natureza'
  | 'protocolo' | 'destinatario' | 'destinatario_ie' | 'emissao' | 'duplicatas' | 'produtos' | 'desconto' | 'valor_nota' | 'itens';
export interface MarcaNoPdf { campo: CampoDaMarca; pagina: number; x: number; y: number; w: number; h: number }

/** O que a chave contradiz. */
export type CampoConferido = 'cnpj' | 'numero' | 'serie' | 'mes' | 'modelo' | 'digito';

export type MotivoDoPdf = 'pdf_sem_texto' | 'pdf_nao_e_danfe' | 'incompleta';
export const FRASE_PDF_SEM_TEXTO = 'PDF sem texto (foto ou escaneado): a leitura dele chega na etapa 2. Nada foi criado.';
export const FRASE_PDF_NAO_E_DANFE = 'O PDF não parece um DANFE (a nota fiscal eletrônica): nada foi lido.';
export const FRASE_NOTA_SEM_CHAVE = 'Nota sem chave de acesso.';

/** ITENS-NOTA-01 — os totais do quadro do imposto que a `NotaLida` nao tem (o rateio dos itens e o cabecalho da aba usam). */
export interface TotaisExtrasDoDanfe { seguroCent: number; outrasCent: number; ipiCent: number; stCent: number; tributosAproxCent: number | null }

export type ResultadoDoDanfe =
  | { ok: true; nota: NotaLida; avisos: AvisoNFe[]; marcas: MarcaNoPdf[]; divergencias: CampoConferido[]; extras: TotaisExtrasDoDanfe }
  | { ok: false; motivo: MotivoDoPdf; frase: string };

export type ItemNaPagina = ItemDoDanfe & { pagina: number };

/** "Natureza da Operação" -> "NATUREZA DA OPERACAO" (sem acento, espacos simples). */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
/** "1.966,56" -> 196656; `null` se nao e' um valor brasileiro. */
export function centavosBr(s: string | null | undefined): number | null {
  const m = /^(?:R\$\s*)?(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2,4})$/.exec((s ?? '').trim());
  if (!m) return null;
  const inteiro = Number.parseInt(m[2].replace(/\./g, ''), 10);
  let cent = inteiro * 100 + Number.parseInt(m[3].slice(0, 2), 10);
  if (m[3].length > 2 && m[3].charCodeAt(2) >= 53) cent += 1;
  return m[1] === '-' && cent !== 0 ? -cent : cent;
}
/** "15/09/2026" -> "2026-09-15"; `null` se nao e' uma data. */
export function dataIso(s: string | null | undefined): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** O digito verificador da chave (modulo 11, pesos 2..9 da direita para a esquerda). */
export function digitoDaChave(primeiros43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = primeiros43.length - 1; i >= 0; i--) {
    soma += Number(primeiros43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** As partes da chave: cUF(2) AAMM(4) CNPJ(14) modelo(2) serie(3) numero(9) tpEmis(1) codigo(8) DV(1). */
export function partesDaChave(chave: string) {
  return {
    aamm: chave.slice(2, 6), cnpj: chave.slice(6, 20), modelo: chave.slice(20, 22), serie: chave.slice(22, 25),
    numero: chave.slice(25, 34), dv: chave.slice(43, 44),
  };
}

/**
 * NOTA-AVULSA-890-01 (Gabriel 22/10/2026) — serie 890 a 899 = NF-e AVULSA, emitida pelo FISCO (a Sefaz) em nome do produtor: a chave
 * carrega o CNPJ do ORGAO emissor, nao o CPF/CNPJ do produtor que o DANFE mostra como emitente.
 */
export function ehSerieAvulsa(serie: string | null | undefined): boolean {
  const s = Number(soDigitos(serie ?? '') || -1);
  return s >= 890 && s <= 899;
}

/** O que a chave contradiz no que foi lido. Vazio = confere. Nota avulsa (serie 890–899): o CNPJ da chave e' do orgao emissor e NAO
 *  se compara com o emitente; numero, serie, mes, modelo e digito continuam conferidos. */
export function conferirChave(nota: Pick<NotaLida, 'chave' | 'numero' | 'serie' | 'emissao' | 'emitente'>): CampoConferido[] {
  const c = nota.chave;
  if (!/^\d{44}$/.test(c)) return ['digito'];
  const p = partesDaChave(c);
  const fora: CampoConferido[] = [];
  if (digitoDaChave(c.slice(0, 43)) !== Number(p.dv)) fora.push('digito');
  if (p.modelo !== '55') fora.push('modelo');
  if (!ehSerieAvulsa(p.serie) && soDigitos(nota.emitente.documento).padStart(14, '0') !== p.cnpj) fora.push('cnpj');
  if (Number(soDigitos(nota.numero) || -1) !== Number(p.numero)) fora.push('numero');
  if (Number(soDigitos(nota.serie) || -1) !== Number(p.serie)) fora.push('serie');
  if (`${nota.emissao.slice(2, 4)}${nota.emissao.slice(5, 7)}` !== p.aamm) fora.push('mes');
  return fora;
}

/** NOTA-AVULSA-890-01 — o texto do quadro "Informações complementares" (abaixo do rotulo, na primeira pagina que o tem). */
export function textoDosDadosAdicionais(d: { itens: readonly ItemNaPagina[] }): string | null {
  const rot = d.itens.find((o) => /^INFORMACOES COMPLEMENTARES/.test(normalizar(o.str)));
  if (!rot) return null;
  const abaixo = d.itens.filter((o) => o.pagina === rot.pagina && o.y < rot.y - 1 && o.y > rot.y - 120 && o.x >= rot.x - 5 && o.x < rot.x + 360)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const t = abaixo.map((o) => o.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

const TOL_LINHA = 1.5;
const ABAIXO_MAX = 16;

/** O leitor por posicao sobre todos os itens do documento. P174: o DANFSe (`danfse.ts`) usa o mesmo. */
export class Danfe {
  readonly itens: ItemNaPagina[];
  readonly marcas: MarcaNoPdf[] = [];
  constructor(paginas: readonly ItemDoDanfe[][]) {
    this.itens = paginas.flatMap((p, i) => p.filter((it) => it.str.trim() !== '').map((it) => ({ ...it, pagina: i + 1 })));
  }
  marcar(campo: CampoDaMarca, it: ItemNaPagina | null | undefined) {
    if (it) this.marcas.push({ campo, pagina: it.pagina, x: it.x, y: it.y, w: it.w, h: it.h });
  }
  /** Os itens que sao este rotulo (igual, sem acento; ou comecando por ele quando `prefixo`). */
  rotulos(rotulo: string, prefixo = false): ItemNaPagina[] {
    const alvo = normalizar(rotulo);
    return this.itens.filter((it) => { const n = normalizar(it.str); return n === alvo || (prefixo && n.startsWith(alvo)); });
  }
  /** O valor abaixo do rotulo, na coluna dele. */
  valorDe(r: ItemNaPagina): ItemNaPagina | null {
    const vizinhos = this.itens.filter((o) => o.pagina === r.pagina && o !== r && Math.abs(o.y - r.y) <= TOL_LINHA && o.x > r.x + 1);
    const fim = vizinhos.length ? Math.min(...vizinhos.map((o) => o.x)) : Number.POSITIVE_INFINITY;
    const naColuna = this.itens.filter((o) => o.pagina === r.pagina && o.y < r.y - 2 && o.y >= r.y - ABAIXO_MAX && o.x >= r.x - 3 && o.x < fim - 1);
    if (!naColuna.length) return null;
    const topo = Math.max(...naColuna.map((o) => o.y));
    return naColuna.filter((o) => Math.abs(o.y - topo) <= TOL_LINHA).sort((a, b) => a.x - b.x)[0];
  }
  /** O primeiro rotulo (de cima para baixo) dentro da faixa de altura [abaixoDe, acimaDe] e o valor dele. */
  campo(rotulo: string, faixa: { acimaDe?: number; abaixoDe?: number } = {}, prefixo = false): ItemNaPagina | null {
    for (const r of this.rotulosNaFaixa(rotulo, faixa, prefixo)) { const v = this.valorDe(r); if (v) return v; }
    return null;
  }
  /**
   * NF-LEITOR-LAYOUTS-01 — o valor de um rotulo que tem de ser de um tipo (`aceita`): o da coluna, se for; senao o que passa por baixo
   * do MEIO do rotulo (o rotulo centrado do pdfmake: o valor comeca a' esquerda dele, e a coluna pegaria o vizinho — a chave, o CPF).
   * Sem nenhum, `null` — quem chama cai no `campo` de sempre.
   */
  valorQue(rotulo: string, faixa: { acimaDe?: number; abaixoDe?: number }, prefixo: boolean, aceita: (o: ItemNaPagina) => boolean): ItemNaPagina | null {
    for (const r of this.rotulosNaFaixa(rotulo, faixa, prefixo)) {
      const v = this.valorDe(r);
      if (v && aceita(v)) return v;
      const meio = r.x + r.w / 2;
      const sob = this.itens.filter((o) => o.pagina === r.pagina && o.y < r.y - 2 && o.y >= r.y - ABAIXO_MAX && o.x <= meio && o.x + o.w >= meio && aceita(o))
        .sort((a, b) => b.y - a.y)[0];
      if (sob) return sob;
    }
    return null;
  }
  /** O CNPJ/CPF de um rotulo (11 ou 14 digitos), pelo `valorQue`. */
  documento(rotulo: string, faixa: { acimaDe?: number; abaixoDe?: number } = {}, prefixo = false): ItemNaPagina | null {
    return this.valorQue(rotulo, faixa, prefixo, (o) => { const n = soDigitos(o.str).length; return n === 11 || n === 14; });
  }
  private rotulosNaFaixa(rotulo: string, faixa: { acimaDe?: number; abaixoDe?: number }, prefixo: boolean): ItemNaPagina[] {
    return this.rotulos(rotulo, prefixo)
      .filter((r) => (faixa.acimaDe == null || r.y > faixa.acimaDe) && (faixa.abaixoDe == null || r.y < faixa.abaixoDe))
      .sort((a, b) => a.pagina - b.pagina || b.y - a.y);
  }
  /** DANFE-CHAVE-EM-GRUPOS-01 — o item logo a' direita, na mesma linha (o valor de um rotulo escrito em item separado: "N°." | "46.994"). */
  aoLado(r: ItemNaPagina): ItemNaPagina | null {
    const fim = r.x + r.w;
    const dir = this.itens.filter((o) => o.pagina === r.pagina && o !== r && Math.abs(o.y - r.y) <= 2 && o.x >= fim - 1 && o.x - fim <= 80);
    return dir.sort((a, b) => a.x - b.x)[0] ?? null;
  }
  /** As linhas (itens da mesma altura, da esquerda para a direita) entre duas alturas, numa pagina. */
  linhasEntre(pagina: number, de: number, ate: number): ItemNaPagina[][] {
    const dentro = this.itens.filter((o) => o.pagina === pagina && o.y < de && o.y > ate);
    const linhas: ItemNaPagina[][] = [];
    for (const it of [...dentro].sort((a, b) => b.y - a.y)) {
      const l = linhas.find((x) => Math.abs(x[0].y - it.y) <= TOL_LINHA);
      if (l) l.push(it); else linhas.push([it]);
    }
    return linhas.map((l) => l.sort((a, b) => a.x - b.x));
  }
}

/**
 * FIN-NOTA-PDF-01b — o PEDACO QUE ATRAVESSA COLUNAS, partido pelo espaco: emissores (e o jsPDF da bancada) juntam valores vizinhos num
 * item so' ("3.194,3300 3.194,33" = V.UNIT e V.TOTAL); o x de cada parte e' estimado pela posicao do caractere na largura do item. So'
 * na TABELA DE ITENS (fora dela, os rotulos tem espaco de proposito).
 */
export function partirPelosEspacos<T extends ItemDoDanfe>(o: T): T[] {
  const t = o.str;
  if (!/\S\s+\S/.test(t) || o.w <= 0) return [o];
  const partes: T[] = [];
  for (const m of t.matchAll(/\S+/g)) {
    const i = m.index ?? 0;
    partes.push({ ...o, str: m[0], x: o.x + (o.w * i) / t.length, w: (o.w * m[0].length) / t.length });
  }
  return partes;
}

const RE_CHAVE = /^(\d{4}\s?){10}\d{4}$/;
/** NF-LEITOR-LAYOUTS-01 — a chave num item com o rotulo na frente ("Chave de Acesso: 3526 …") ou com mascara ("35-26/10-…-4"): 44 digitos que passam no DV. */
export function chaveDoItem(str: string): string | null {
  const t = normalizar(str).replace(/^CHAVE DE ACESSO(?: DA NF-?E)?\s*:?\s*/, '');
  if (!/^[\d\s.\-/]+$/.test(t)) return null;
  const d = soDigitos(t);
  return d.length === 44 && digitoDaChave(d.slice(0, 43)) === Number(d[43]) ? d : null;
}

/**
 * DANFE-CHAVE-EM-GRUPOS-01 (Gabriel 23/10/2026: "Sistema não está lendo essa NF") — a chave PICADA em itens: emissores (JasperReports +
 * iText) escrevem cada grupo de 4 digitos num item, com itens " " entre eles. Na mesma pagina e na mesma linha (|Δy| ≤ 2), em ordem de x,
 * os itens so' de digitos e espacos se juntam ate' 44 digitos; vale SO' com o digito verificador certo (modulo 11) — nunca adivinha.
 * Devolve os itens que formaram a chave (o amarelo cobre todos).
 */
export function chaveEmGrupos<T extends ItemDoDanfe & { pagina: number }>(itens: readonly T[]): { chave: string; itens: T[] } | null {
  const pedacos = itens.filter((o) => /^[\d\s]+$/.test(o.str) && soDigitos(o.str).length > 0 && soDigitos(o.str).length < 44);
  const vistos = new Set<T>();
  for (const p of pedacos) {
    if (vistos.has(p)) continue;
    const linha = pedacos.filter((o) => o.pagina === p.pagina && Math.abs(o.y - p.y) <= 2).sort((a, b) => a.x - b.x);
    for (const o of linha) vistos.add(o);
    for (let i = 0; i < linha.length; i++) {
      let digitos = '';
      const usados: T[] = [];
      for (let j = i; j < linha.length && digitos.length < 44; j++) { digitos += soDigitos(linha[j].str); usados.push(linha[j]); }
      if (digitos.length === 44 && digitoDaChave(digitos.slice(0, 43)) === Number(digitos[43])) return { chave: digitos, itens: usados };
    }
  }
  return null;
}
/** O numero do protocolo de autorizacao (15 digitos), corrido ou com pontos ("135.264.453.322.786" — NF-LEITOR-LAYOUTS-01). */
export function numeroDoProtocolo(s: string | null | undefined): string | null {
  const corrido = /(\d{15})/.exec(s ?? '');
  if (corrido) return corrido[1];
  const comPontos = /(?<![\d.])(\d{3}(?:\.\d{3}){4})(?![\d.]?\d)/.exec(s ?? '');
  return comPontos ? soDigitos(comPontos[1]) : null;
}
const RE_NUMERO = /^N[º°O.]?\.?\s*:?\s*(\d{1,3}(?:\.\d{3}){0,2}|\d{1,9})(?:\s+SERIE:?\s*\d{1,3})?$/;
const RE_SERIE = /^SERIE:?\s*(\d{1,3})$/;
const RE_DUPLICATA = /(?:NUM\.?:?\s*)?(\d{1,4}[A-Z]?)\s+(?:VENC\.?:?\s*)?(\d{2}\/\d{2}\/\d{4})\s+(?:VALOR:?\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g;

/** Le^ o DANFE. */
export function notaDoDanfe(paginas: readonly ItemDoDanfe[][]): ResultadoDoDanfe {
  const d = new Danfe(paginas);
  if (d.itens.length === 0) return { ok: false, motivo: 'pdf_sem_texto', frase: FRASE_PDF_SEM_TEXTO };

  /* A CHAVE: o item de 44 digitos (em grupos de 4 ou corrido); sem ele, a chave picada em itens na mesma linha (com o DV certo). */
  const itemChave = d.itens.find((it) => RE_CHAVE.test(it.str.trim())) ?? d.itens.find((it) => chaveDoItem(it.str) != null);
  const grupos = itemChave ? null : chaveEmGrupos(d.itens);
  const ehDanfe = !!itemChave || !!grupos || d.itens.some((it) => normalizar(it.str) === 'DANFE');
  if (!ehDanfe) return { ok: false, motivo: 'pdf_nao_e_danfe', frase: FRASE_PDF_NAO_E_DANFE };
  if (!itemChave && !grupos) return { ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE };
  const chave = itemChave ? (chaveDoItem(itemChave.str) ?? soDigitos(itemChave.str)) : grupos?.chave ?? '';
  for (const it of itemChave ? [itemChave] : grupos?.itens ?? []) d.marcar('chave', it);
  const pg = itemChave?.pagina ?? grupos?.itens[0]?.pagina ?? 1;

  /* AS FAIXAS DA PRIMEIRA FOLHA: emitente acima do "DESTINATARIO / REMETENTE"; destinatario ate' a fatura/imposto. */
  /* NF-LEITOR-LAYOUTS-01 — "Destinatário/Remetente" junto (sem ele, o "DESTINATARIO" pegaria o "Destinatário (FOB)" do frete) */
  const rotDest = d.rotulos('DESTINATARIO / REMETENTE', true).find((r) => r.pagina === pg) ?? d.rotulos('DESTINATARIO/REMETENTE', true).find((r) => r.pagina === pg)
    ?? d.rotulos('DESTINATARIO', true).find((r) => r.pagina === pg);
  const yDest = rotDest?.y ?? 0;
  const rotFatura = d.rotulos('FATURA', true).find((r) => r.pagina === pg && r.y < yDest);
  const rotImposto = d.rotulos('CALCULO DO IMPOSTO', true).find((r) => r.pagina === pg) ?? d.rotulos('CALCULO DE IMPOSTO', true).find((r) => r.pagina === pg);
  const yImposto = rotImposto?.y ?? 0;
  const yFimDest = rotFatura?.y ?? yImposto;
  const rotProdutos = d.rotulos('DADOS DO PRODUTO', true).find((r) => r.pagina === pg) ?? d.rotulos('DADOS DOS PRODUTOS', true).find((r) => r.pagina === pg)
    ?? d.rotulos('ITENS DA NOTA FISCAL', true).find((r) => r.pagina === pg);
  const yProdutos = rotProdutos?.y ?? 0;

  /* NUMERO E SERIE: o "Nº" com mais digitos (o do quadro do DANFE, nao o do canhoto) e a "SERIE" ao lado dele. */
  /* DANFE-CHAVE-EM-GRUPOS-01 — e o rotulo num item com o valor no item ao lado ("N°." | "46.994", "SÉRIE" | "001"): lido junto, marca o valor */
  const juntos = (rotulo: RegExp) => d.itens.filter((it) => rotulo.test(normalizar(it.str))).flatMap((it) => {
    const v = d.aoLado(it);
    return v ? [{ it: v, texto: `${normalizar(it.str)} ${normalizar(v.str)}` }] : [];
  });
  const candidatos = (rotulo: RegExp) => [...d.itens.map((it) => ({ it, texto: normalizar(it.str) })), ...juntos(rotulo)];
  const nums = candidatos(/^N[º°O]?\.?:?$/).map(({ it, texto }) => ({ it, m: RE_NUMERO.exec(texto) })).filter((x) => x.m)
    .sort((a, b) => soDigitos(b.m?.[1] ?? '').length - soDigitos(a.m?.[1] ?? '').length);
  const itNumero = nums[0]?.it ?? null;
  const numero = soDigitos(nums[0]?.m?.[1] ?? '').replace(/^0+(?=\d)/, '');
  d.marcar('numero', itNumero);
  const series = candidatos(/^SERIE:?$/).map(({ it, texto }) => ({ it, m: RE_SERIE.exec(texto) })).filter((x) => x.m)
    .sort((a, b) => (itNumero ? Math.hypot(a.it.x - itNumero.x, a.it.y - itNumero.y) - Math.hypot(b.it.x - itNumero.x, b.it.y - itNumero.y) : 0));
  const serie = series[0]?.m?.[1] ?? '';
  d.marcar('serie', series[0]?.it);

  /* EMITENTE. */
  const canhoto = d.itens.map((it) => ({ it, m: /RECEBEMOS DE\s+'?(.+?)'?,?\s+OS PRODUTOS?/i.exec(it.str) })).find((x) => x.m);
  const nomeEmit = canhoto?.m?.[1]?.trim() ?? '';
  /* NF-LEITOR-LAYOUTS-01 — o nome no quadro do emitente em 2 linhas ("AGRO EXEMPLO COMERCIO E" / "REPRESENTACOES LTDA"): a 2a linha logo
     abaixo, alinhada a' esquerda (mesmo x) ou centrada (mesmo meio); as duas juntas tem de dar o nome do canhoto. */
  const alvoNome = normalizar(nomeEmit);
  const mesmaColuna = (a: ItemNaPagina, b: ItemNaPagina) => Math.abs(a.x - b.x) <= 2 || Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) <= 3;
  let segunda: ItemNaPagina | undefined;
  for (const it of d.itens) {
    if (!alvoNome || it === canhoto?.it || !alvoNome.startsWith(`${normalizar(it.str)} `)) continue;
    segunda = d.itens.find((o) => o.pagina === it.pagina && o.y < it.y && o.y > it.y - 14 && mesmaColuna(it, o)
      && alvoNome === `${normalizar(it.str)} ${normalizar(o.str)}`);
    if (segunda) break;
  }
  const itNomeEmit = d.itens.find((it) => it !== canhoto?.it && normalizar(it.str) === normalizar(nomeEmit)) ?? (segunda ?? canhoto?.it);
  d.marcar('emitente', itNomeEmit);
  const itCnpjEmit = d.documento('CNPJ', { acimaDe: yDest }, true) ?? d.campo('CNPJ', { acimaDe: yDest }, true);
  d.marcar('emitente_cnpj', itCnpjEmit);
  const itIeEmit = d.campo('INSCRICAO ESTADUAL', { acimaDe: yDest });
  d.marcar('emitente_ie', itIeEmit);
  const itNatureza = d.campo('NATUREZA DA OPERACAO', { acimaDe: yDest }) ?? d.campo('NATUREZA DE OPERACAO', { acimaDe: yDest });
  d.marcar('natureza', itNatureza);
  /* DANFE-CHAVE-EM-GRUPOS-01 — ha' leiaute com o rotulo curto ("PROTOCOLO DE AUTORIZAÇÃO", sem o "DE USO") */
  /* NF-LEITOR-LAYOUTS-01 — e o rotulo longo ("Número do protocolo de Autorização de uso da NF-e"); e o valor AO LADO do rotulo quando
     o de baixo nao e' um protocolo */
  const itProtocoloAbaixo = d.campo('PROTOCOLO DE AUTORIZACAO DE USO', { acimaDe: yDest }, true) ?? d.campo('PROTOCOLO DE AUTORIZACAO', { acimaDe: yDest }, true)
    ?? d.campo('NUMERO DO PROTOCOLO', { acimaDe: yDest }, true);
  const rotProt = d.rotulos('PROTOCOLO DE AUTORIZACAO', true).find((r) => r.pagina === pg && r.y > yDest);
  const itProtocolo = numeroDoProtocolo(itProtocoloAbaixo?.str) ? itProtocoloAbaixo : (rotProt ? d.aoLado(rotProt) : null) ?? itProtocoloAbaixo;
  d.marcar('protocolo', itProtocolo);

  /* O ENDERECO DO EMITENTE: as linhas logo abaixo do nome, no quadro dele (a esquerda do "DANFE"). */
  const itDanfe = d.itens.find((it) => it.pagina === pg && normalizar(it.str) === 'DANFE');
  let logradouro: string | null = null; let numeroEnd: string | null = null; let bairro: string | null = null;
  let municipio: string | null = null; let uf: string | null = null; let cep: string | null = null; let telefone: string | null = null;
  if (itNomeEmit && itNomeEmit !== canhoto?.it) {
    const limite = itNatureza ? itNatureza.y + 8 : itNomeEmit.y - 70;
    const bloco = d.itens.filter((o) => o.pagina === itNomeEmit.pagina && o.y < itNomeEmit.y - 2 && o.y > limite
      && (!itDanfe || o.x + o.w < itDanfe.x) && o.x >= itNomeEmit.x - 120 && o.x <= itNomeEmit.x + itNomeEmit.w + 20)
      .sort((a, b) => b.y - a.y);
    const livres: ItemNaPagina[] = [];
    for (const o of bloco) {
      const t = o.str.trim();
      const mCep = /(\d{5})-?(\d{3})/.exec(t);
      const mCidade = /^(.+?)\s+-\s+([A-Z]{2})$/.exec(t);
      if (/^FONE/i.test(t)) telefone = soDigitos(t);
      else if (mCep && soDigitos(t).length === 8) cep = mCep[1] + mCep[2];
      else if (mCidade) { municipio = mCidade[1].trim(); uf = mCidade[2]; d.marcar('emitente_cidade', o); }
      else livres.push(o);
    }
    if (livres[0]) {
      const m = /^(.*?),\s*([^,]+)$/.exec(livres[0].str.trim());
      logradouro = m ? m[1].trim() : livres[0].str.trim();
      numeroEnd = m ? m[2].trim() : null;
      d.marcar('emitente_endereco', livres[0]);
    }
    if (livres[1]) bairro = livres[1].str.trim();
  }

  /* DESTINATARIO. */
  const faixaDest = { abaixoDe: yDest + 1, acimaDe: yFimDest };
  /* NF-LEITOR-LAYOUTS-01 — o nome tem letra (o rotulo centrado do pdfmake pegaria o CPF da coluna ao lado) */
  const temLetra = (o: ItemNaPagina) => /[A-Za-zÀ-ÿ]/.test(o.str);
  const ROTULOS_NOME_DEST = ['NOME / RAZAO SOCIAL', 'NOME/RAZAO SOCIAL', 'NOME RAZAO SOCIAL'];
  const itNomeDest = ROTULOS_NOME_DEST.reduce<ItemNaPagina | null>((achado, rot) => achado ?? d.valorQue(rot, faixaDest, true, temLetra), null)
    ?? ROTULOS_NOME_DEST.reduce<ItemNaPagina | null>((achado, rot) => achado ?? d.campo(rot, faixaDest, true), null);
  d.marcar('destinatario', itNomeDest);
  const itDocDest = d.documento('CNPJ / CPF', faixaDest, true) ?? d.documento('CNPJ', faixaDest, true)
    ?? d.campo('CNPJ / CPF', faixaDest, true) ?? d.campo('CNPJ', faixaDest, true);
  const itIeDest = d.campo('INSCRICAO ESTADUAL', faixaDest);
  d.marcar('destinatario_ie', itIeDest);
  const itEnderDest = d.campo('ENDERECO', faixaDest, true);
  const itEmissao = d.campo('DATA DA EMISSAO', faixaDest, true) ?? d.campo('DATA DE EMISSAO', faixaDest, true) ?? d.campo('DATA EMISSAO', faixaDest, true);
  d.marcar('emissao', itEmissao);
  const itSaida = d.campo('DATA DA ENTRADA / SAIDA', faixaDest, true) ?? d.campo('DATA DA SAIDA', faixaDest, true) ?? d.campo('DATA DE SAIDA', faixaDest, true);

  /* FATURA E DUPLICATAS. */
  const duplicatas: DuplicataNFe[] = [];
  let fatura: NotaLida['fatura'] = null;
  if (rotFatura) {
    const faixaFat = { abaixoDe: rotFatura.y + 1, acimaDe: yImposto };
    const orig = centavosBr(d.campo('VALOR ORIGINAL', faixaFat)?.str);
    const desc = centavosBr(d.campo('VALOR DO DESCONTO', faixaFat)?.str);
    const liq = centavosBr(d.campo('VALOR LIQUIDO', faixaFat)?.str);
    if (orig != null || liq != null) fatura = { origCent: orig ?? 0, descCent: desc ?? 0, liqCent: liq ?? 0 };
    for (const linha of d.linhasEntre(pg, rotFatura.y, yImposto)) {
      for (const it of linha) {
        const t = normalizar(it.str);
        let achou = false;
        for (const m of t.matchAll(RE_DUPLICATA)) {
          const venc = dataIso(m[2]); const valor = centavosBr(m[3]);
          if (venc && valor != null) { duplicatas.push({ numero: m[1], vencimento: venc, valorCent: valor }); achou = true; }
        }
        if (achou) d.marcar('duplicatas', it);
      }
      /* NF-LEITOR-LAYOUTS-01 — numero, vencimento e valor em itens separados: a linha junta */
      if (!linha.some((it) => normalizar(it.str).match(RE_DUPLICATA))) {
        const t = linha.map((it) => normalizar(it.str)).join(' ');
        for (const m of t.matchAll(RE_DUPLICATA)) {
          const venc = dataIso(m[2]); const valor = centavosBr(m[3]);
          if (venc && valor != null) { duplicatas.push({ numero: m[1], vencimento: venc, valorCent: valor }); for (const it of linha) d.marcar('duplicatas', it); }
        }
      }
    }
  }

  /* TOTAIS (o quadro do calculo do imposto). */
  const faixaImp = { abaixoDe: yImposto + 1, acimaDe: yProdutos };
  const itProdutos = d.campo('VALOR TOTAL DOS PRODUTOS', faixaImp) ?? d.campo('VALOR TOTAL PRODUTOS', faixaImp) ?? d.campo('VLR TOTAL PRODUTOS', faixaImp) ?? d.campo('VALOR PRODUTOS', faixaImp);
  const itFrete = d.campo('VALOR DO FRETE', faixaImp);
  const itDesconto = d.campo('DESCONTO', faixaImp) ?? d.campo('VALOR DO DESCONTO', faixaImp);
  const itTotal = d.campo('VALOR TOTAL DA NOTA', faixaImp) ?? d.campo('VLR TOTAL NOTA', faixaImp) ?? d.campo('VALOR TOTAL', faixaImp);
  const extras: TotaisExtrasDoDanfe = {
    seguroCent: centavosBr(d.campo('VALOR DO SEGURO', faixaImp)?.str) ?? 0,
    outrasCent: centavosBr(d.campo('OUTRAS DESPESAS', faixaImp, true)?.str) ?? 0,
    ipiCent: centavosBr(d.campo('VALOR DO IPI', faixaImp)?.str) ?? 0,
    stCent: centavosBr(d.campo('VALOR DO ICMS ST', faixaImp)?.str ?? d.campo('VALOR DO ICMS SUBST', faixaImp, true)?.str) ?? 0,
    tributosAproxCent: centavosBr(d.campo('VALOR APROX', faixaImp, true)?.str ?? d.campo('V. TOT. TRIB', faixaImp, true)?.str),
  };
  d.marcar('produtos', itProdutos); d.marcar('desconto', itDesconto); d.marcar('valor_nota', itTotal);

  /* ITENS: o cabecalho da tabela da' as colunas; linha com valor total e' produto, linha sem ele completa o de cima (lote…). */
  const itens: NotaLida['itens'] = [];
  /* NF-LEITOR-LAYOUTS-01 — a tabela dos itens em TODAS as folhas: a 1a pelo "DADOS DO PRODUTO"; as seguintes com o cabecalho da 1a */
  const tabelas = [...new Set(d.itens.map((o) => o.pagina))].sort((a, b) => a - b).flatMap((p) => (
    p === pg ? (rotProdutos ? [{ pagina: p, rot: rotProdutos }] : []) : p > pg ? [{ pagina: p, rot: null }] : []));
  let cabSalvo: ItemNaPagina[] | null = null;
  for (const tabela of tabelas) {
    let itensNestaFolha = 0;
    const folha = tabela.pagina; const rotTabela = tabela.rot;
    const rotDescr = rotTabela ? d.itens.find((it) => it.pagina === folha && it.y < rotTabela.y && it.y > rotTabela.y - 20 && normalizar(it.str).startsWith('DESCRICAO')) ?? null : null;
    /* NF-LEITOR-LAYOUTS-01 — o cabecalho em ate' 3 linhas ("VALOR" / "TOTAL"): os pedacos da mesma coluna (x sobreposto) viram um rotulo, de cima para baixo */
    const pedacosCab = rotTabela && rotDescr
      ? d.itens.filter((o) => o.pagina === folha && Math.abs(o.y - rotDescr.y) <= 7 && o.y < rotTabela.y - 2).sort((a, b) => b.y - a.y) : [];
    const grupos: ItemNaPagina[][] = [];
    for (const o of pedacosCab) {
      const g = grupos.find((x) => x.some((p) => o.x < p.x + p.w - 0.5 && p.x < o.x + o.w - 0.5 && p.y !== o.y));
      if (g && !g.some((p) => Math.abs(p.y - o.y) <= TOL_LINHA)) g.push(o); else grupos.push([o]);
    }
    const juntado = (g: ItemNaPagina[]): ItemNaPagina => {
      const x = Math.min(...g.map((p) => p.x));
      return { ...g[0], x, w: Math.max(...g.map((p) => p.x + p.w)) - x, str: g.map((p) => p.str.trim()).join(' ') };
    };
    /* NF-LEITOR-LAYOUTS-01 — as folhas seguintes (a continuacao do ACBr, a do savnf sem cabecalho) usam o da 1a */
    const cab = rotDescr ? grupos.map(juntado).sort((a, b) => a.x - b.x) : cabSalvo;
    if (!cab) continue;
    if (rotDescr) cabSalvo = cab;
    const yFimCab = pedacosCab.length ? Math.min(...pedacosCab.map((o) => o.y)) : Number.POSITIVE_INFINITY;
    const col = (pred: (n: string) => boolean) => { const i = cab.findIndex((c) => pred(normalizar(c.str))); return i < 0 ? null : { i, de: cab[i].x - 4, ate: (cab[i + 1]?.x ?? 1e9) - 4 }; };
    /* NF-LEITOR-LAYOUTS-01 — a coluna de um valor: a do cabecalho que ele SOBREPOE (o maior pedaco); sem nenhum, a do cabecalho mais perto.
       O cabecalho centrado (a descricao comeca antes dele) e o numero alinhado a' direita (passa do fim dele) caem na coluna certa. */
    const colunaDe = (o: ItemNaPagina) => {
      let melhor = -1; let sobre = 0; let perto = -1; let dist = Number.POSITIVE_INFINITY;
      cab.forEach((c, k) => {
        const s0 = Math.min(o.x + o.w, c.x + c.w) - Math.max(o.x, c.x);
        if (s0 > sobre) { sobre = s0; melhor = k; }
        const g = o.x + o.w < c.x ? c.x - (o.x + o.w) : o.x > c.x + c.w ? o.x - (c.x + c.w) : 0;
        if (g < dist) { dist = g; perto = k; }
      });
      return melhor >= 0 ? melhor : perto;
    };
    const cDesc = col((n) => n.startsWith('DESCRICAO'));
    const cUn = col((n) => n === 'UN.' || n === 'UN' || n === 'UND' || n.startsWith('UNID'));
    const cQtd = col((n) => n.startsWith('QTD') || n.startsWith('QUANT'));
    const cUnit = col((n) => n.startsWith('V.UNIT') || n.startsWith('VALOR UNIT') || n.startsWith('VLR. UNIT') || n.startsWith('V. UNIT') || n === 'PRECO');
    const cTotal = col((n) => n.startsWith('V.TOTAL') || n.startsWith('VALOR TOTAL') || n.startsWith('VLR. TOTAL') || n.startsWith('V. TOTAL') || n === 'PRECO TOTAL');
    /* ITENS-NOTA-01 — as colunas fiscais do item, quando o DANFE as tem */
    const cCod = col((n) => n.startsWith('CODIGO') || n.startsWith('COD.'));
    const cNcm = col((n) => n.startsWith('NCM'));
    const cCst = col((n) => n === 'CST' || n.startsWith('CST') || n.startsWith('CSOSN') || n.startsWith('O/CST') || n.startsWith('O/CSOSN'));
    const cCfop = col((n) => n.startsWith('CFOP'));
    const cBcIcms = col((n) => n.startsWith('BC.ICMS') || n.startsWith('B.CALC') || n.startsWith('BC ICMS') || n.startsWith('BASE CALC'));
    const cVIcms = col((n) => n.startsWith('V.ICMS') || n === 'VALOR ICMS' || n.startsWith('VLR.ICMS') || n.startsWith('V. ICMS'));
    const cVIpi = col((n) => n.startsWith('V.IPI') || n === 'VALOR IPI' || n.startsWith('VLR.IPI') || n.startsWith('V. IPI'));
    const cAIcms = col((n) => n.startsWith('%ICMS') || n.startsWith('ALIQ. ICMS') || n.startsWith('ALIQ.ICMS'));
    const cAIpi = col((n) => n.startsWith('%IPI') || n.startsWith('ALIQ. IPI') || n.startsWith('ALIQ.IPI'));
    const rotFim = d.itens.filter((o) => o.pagina === folha && o.y < (rotDescr?.y ?? Number.POSITIVE_INFINITY) && /^(DADOS ADICIONAIS|CALCULO DO ISSQN|INFORMACOES COMPLEMENTARES)/.test(normalizar(o.str))).sort((a, b) => b.y - a.y)[0];
    /* o que comeca antes da 1a coluna nao e' da tabela (o canhoto girado na margem, que a largura faria sobrepor a descricao) */
    const inicioDaTabela = Math.min(...cab.map((c) => c.x)) - 4;
    const naCol = (linha: ItemNaPagina[], c: { i: number; de: number; ate: number } | null) => (c ? linha.filter((o) => o.x >= inicioDaTabela && colunaDe(o) === c.i) : []);
    /* a descricao fica inteira (tem espaco de proposito); o pedaco que comeca DEPOIS dela e passa da coluna onde comeca, se parte */
    const inicioDasColunas = cab.map((c) => c.x - 4);
    const atravessa = (o: ItemNaPagina) => inicioDasColunas.some((x) => x > o.x + 1 && x < o.x + o.w - 1);
    const fimDaDescricao = cDesc?.ate ?? 0;
    for (const linhaCrua of d.linhasEntre(folha, Math.min(rotDescr?.y ?? Number.POSITIVE_INFINITY, yFimCab) - TOL_LINHA, rotFim?.y ?? 0)) {
      const linha = linhaCrua.flatMap((o) => (o.x >= fimDaDescricao && atravessa(o) ? partirPelosEspacos(o) : [o]));
      const total = centavosBr(naCol(linha, cTotal).map((o) => o.str).join('').trim());
      const descr = naCol(linha, cDesc).map((o) => o.str.trim()).join(' ').trim();
      if (total != null && descr) {
        const qtd = naCol(linha, cQtd).map((o) => o.str.trim()).join('');
        const txt = (c: { i: number; de: number; ate: number } | null) => naCol(linha, c).map((o) => o.str.trim()).join('') || null;
        itens.push({
          descricao: descr, quantidade: qtd.replace(/\./g, '').replace(',', '.'), unidade: naCol(linha, cUn).map((o) => o.str.trim()).join(''),
          valorCent: total, unitarioCent: centavosBr(naCol(linha, cUnit).map((o) => o.str.trim()).join('')), detalhe: null,
          fiscal: {
            codigo: txt(cCod), ncm: txt(cNcm), cst: txt(cCst), cfop: txt(cCfop),
            bcIcmsCent: centavosBr(txt(cBcIcms)), vIcmsCent: centavosBr(txt(cVIcms)), vIpiCent: centavosBr(txt(cVIpi)),
            aliqIcms: txt(cAIcms), aliqIpi: txt(cAIpi),
          },
        });
        for (const o of naCol(linha, cDesc)) d.marcar('itens', o);
        itensNestaFolha++;
      } else if (descr && itens.length && itensNestaFolha > 0) {
        const ult = itens[itens.length - 1];
        ult.detalhe = ult.detalhe ? `${ult.detalhe} · ${descr}` : descr;
      }
    }
  }

  /* TIPO: o digito no quadro "0-ENTRADA / 1-SAIDA". */
  const rotSaida = d.itens.find((it) => it.pagina === pg && /^1\s*-\s*SAIDA$/.test(normalizar(it.str)));
  const digitoTipo = rotSaida ? d.itens.find((it) => it.pagina === pg && /^[01]$/.test(it.str.trim()) && it.x > rotSaida.x && it.x < rotSaida.x + 90 && Math.abs(it.y - rotSaida.y) < 14) : null;

  const emissao = dataIso(itEmissao?.str) ?? '';
  const docEmit = soDigitos(itCnpjEmit?.str) || chave.slice(6, 20);
  const notaCent = centavosBr(itTotal?.str);
  if (!numero) return { ok: false, motivo: 'incompleta', frase: 'Nota sem número.' };
  if (!emissao) return { ok: false, motivo: 'incompleta', frase: 'Nota sem data de emissão.' };
  if (!nomeEmit) return { ok: false, motivo: 'incompleta', frase: 'Nota sem emitente.' };
  if (notaCent == null) return { ok: false, motivo: 'incompleta', frase: 'Nota sem valor total.' };

  const naturezaOperacao = itNatureza?.str.trim() ?? '';
  const nNat = normalizar(naturezaOperacao);
  const finalidade: FinalidadeNota = nNat.includes('DEVOLU') ? 'devolucao' : nNat.includes('COMPLEMENT') ? 'complementar' : 'normal';
  const protocoloNum = numeroDoProtocolo(itProtocolo?.str);
  const somaDuplicatasCent = somarCentavos(duplicatas.map((x) => x.valorCent));
  const ie = (it: ItemNaPagina | null) => { const s = soDigitos(it?.str); return s ? s : null; };

  const nota: NotaLida = {
    chave,
    modelo: '55',
    numero,
    serie,
    emissao,
    saidaEntrada: dataIso(itSaida?.str),
    tipoNota: digitoTipo?.str.trim() === '0' ? 'entrada' : 'saida',
    finalidade,
    naturezaOperacao,
    emitente: {
      documento: docEmit, nome: nomeEmit, fantasia: null, ie: ie(itIeEmit),
      endereco: { logradouro, numero: numeroEnd, complemento: null, bairro, municipio, uf, cep, telefone },
    },
    destinatario: { documento: soDigitos(itDocDest?.str) || null, nome: itNomeDest?.str.trim() || null, ie: ie(itIeDest), endereco: itEnderDest?.str.trim() || null },
    totais: {
      produtosCent: centavosBr(itProdutos?.str) ?? 0, freteCent: centavosBr(itFrete?.str) ?? 0,
      descontoCent: centavosBr(itDesconto?.str) ?? 0, notaCent,
    },
    fatura,
    duplicatas,
    somaDuplicatasCent,
    pagamentos: [],
    itens,
    /* O DANFE com protocolo impresso e' o de uma nota autorizada (o DANFE so' se imprime depois da autorizacao). */
    protocolo: protocoloNum ? { cStat: '100', numero: protocoloNum } : null,
    informacoesComplementares: textoDosDadosAdicionais(d),
    cfops: itens.map((i) => i.fiscal?.cfop ?? '').filter(Boolean),
  };

  const avisos: AvisoNFe[] = [];
  if (!nota.protocolo) avisos.push('sem_protocolo');
  if (duplicatas.length === 0) avisos.push('sem_duplicatas');
  else if (somaDuplicatasCent !== notaCent) avisos.push('duplicatas_diferem_da_nota');
  if (finalidade === 'complementar') avisos.push('complementar');
  if (finalidade === 'devolucao') avisos.push('devolucao');
  return { ok: true, nota, avisos, marcas: d.marcas, divergencias: conferirChave(nota), extras };
}
