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

/** ITENS-NOTA-01 — os totais do quadro do imposto que a `NotaLida` nao tem (o rateio dos itens e o cabecalho da aba usam). */
export interface TotaisExtrasDoDanfe { seguroCent: number; outrasCent: number; ipiCent: number; stCent: number; tributosAproxCent: number | null }

export type ResultadoDoDanfe =
  | { ok: true; nota: NotaLida; avisos: AvisoNFe[]; marcas: MarcaNoPdf[]; divergencias: CampoConferido[]; extras: TotaisExtrasDoDanfe }
  | { ok: false; motivo: MotivoDoPdf; frase: string };

type ItemNaPagina = ItemDoDanfe & { pagina: number };

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
function textoDosDadosAdicionais(d: { itens: readonly ItemNaPagina[] }): string | null {
  const rot = d.itens.find((o) => /^INFORMACOES COMPLEMENTARES/.test(normalizar(o.str)));
  if (!rot) return null;
  const abaixo = d.itens.filter((o) => o.pagina === rot.pagina && o.y < rot.y - 1 && o.y > rot.y - 120 && o.x >= rot.x - 5 && o.x < rot.x + 360)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const t = abaixo.map((o) => o.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

const TOL_LINHA = 1.5;
const ABAIXO_MAX = 14;

/** O leitor por posicao sobre todos os itens do documento. */
class Danfe {
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
    const rs = this.rotulos(rotulo, prefixo)
      .filter((r) => (faixa.acimaDe == null || r.y > faixa.acimaDe) && (faixa.abaixoDe == null || r.y < faixa.abaixoDe))
      .sort((a, b) => a.pagina - b.pagina || b.y - a.y);
    for (const r of rs) { const v = this.valorDe(r); if (v) return v; }
    return null;
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
const RE_NUMERO = /^N[º°O.]?\.?\s*:?\s*(\d{1,3}(?:\.\d{3}){0,2}|\d{1,9})$/;
const RE_SERIE = /^SERIE:?\s*(\d{1,3})$/;
const RE_DUPLICATA = /(?:NUM\.?:?\s*)?(\d{1,4}[A-Z]?)\s+(?:VENC\.?:?\s*)?(\d{2}\/\d{2}\/\d{4})\s+(?:VALOR:?\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g;

/** Le^ o DANFE. */
export function notaDoDanfe(paginas: readonly ItemDoDanfe[][]): ResultadoDoDanfe {
  const d = new Danfe(paginas);
  if (d.itens.length === 0) return { ok: false, motivo: 'pdf_sem_texto', frase: FRASE_PDF_SEM_TEXTO };

  /* A CHAVE: o item de 44 digitos (em grupos de 4 ou corrido). */
  const itemChave = d.itens.find((it) => RE_CHAVE.test(it.str.trim()));
  const ehDanfe = !!itemChave || d.itens.some((it) => normalizar(it.str) === 'DANFE');
  if (!ehDanfe) return { ok: false, motivo: 'pdf_nao_e_danfe', frase: FRASE_PDF_NAO_E_DANFE };
  if (!itemChave) return { ok: false, motivo: 'incompleta', frase: 'Nota sem chave de acesso.' };
  const chave = soDigitos(itemChave.str);
  d.marcar('chave', itemChave);
  const pg = itemChave.pagina;

  /* AS FAIXAS DA PRIMEIRA FOLHA: emitente acima do "DESTINATARIO / REMETENTE"; destinatario ate' a fatura/imposto. */
  const rotDest = d.rotulos('DESTINATARIO / REMETENTE', true).find((r) => r.pagina === pg) ?? d.rotulos('DESTINATARIO', true).find((r) => r.pagina === pg);
  const yDest = rotDest?.y ?? 0;
  const rotFatura = d.rotulos('FATURA', true).find((r) => r.pagina === pg && r.y < yDest);
  const rotImposto = d.rotulos('CALCULO DO IMPOSTO', true).find((r) => r.pagina === pg);
  const yImposto = rotImposto?.y ?? 0;
  const yFimDest = rotFatura?.y ?? yImposto;
  const rotProdutos = d.rotulos('DADOS DO PRODUTO', true).find((r) => r.pagina === pg) ?? d.rotulos('DADOS DOS PRODUTOS', true).find((r) => r.pagina === pg);
  const yProdutos = rotProdutos?.y ?? 0;

  /* NUMERO E SERIE: o "Nº" com mais digitos (o do quadro do DANFE, nao o do canhoto) e a "SERIE" ao lado dele. */
  const nums = d.itens.map((it) => ({ it, m: RE_NUMERO.exec(normalizar(it.str)) })).filter((x) => x.m)
    .sort((a, b) => soDigitos(b.m?.[1] ?? '').length - soDigitos(a.m?.[1] ?? '').length);
  const itNumero = nums[0]?.it ?? null;
  const numero = soDigitos(nums[0]?.m?.[1] ?? '').replace(/^0+(?=\d)/, '');
  d.marcar('numero', itNumero);
  const series = d.itens.map((it) => ({ it, m: RE_SERIE.exec(normalizar(it.str)) })).filter((x) => x.m)
    .sort((a, b) => (itNumero ? Math.hypot(a.it.x - itNumero.x, a.it.y - itNumero.y) - Math.hypot(b.it.x - itNumero.x, b.it.y - itNumero.y) : 0));
  const serie = series[0]?.m?.[1] ?? '';
  d.marcar('serie', series[0]?.it);

  /* EMITENTE. */
  const canhoto = d.itens.map((it) => ({ it, m: /RECEBEMOS DE (.+?) OS PRODUTOS/i.exec(it.str) })).find((x) => x.m);
  const nomeEmit = canhoto?.m?.[1]?.trim() ?? '';
  const itNomeEmit = d.itens.find((it) => it !== canhoto?.it && normalizar(it.str) === normalizar(nomeEmit)) ?? canhoto?.it;
  d.marcar('emitente', itNomeEmit);
  const itCnpjEmit = d.campo('CNPJ', { acimaDe: yDest }, true);
  d.marcar('emitente_cnpj', itCnpjEmit);
  const itIeEmit = d.campo('INSCRICAO ESTADUAL', { acimaDe: yDest });
  d.marcar('emitente_ie', itIeEmit);
  const itNatureza = d.campo('NATUREZA DA OPERACAO', { acimaDe: yDest });
  d.marcar('natureza', itNatureza);
  const itProtocolo = d.campo('PROTOCOLO DE AUTORIZACAO DE USO', { acimaDe: yDest }, true);
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
  const itNomeDest = d.campo('NOME / RAZAO SOCIAL', faixaDest, true);
  d.marcar('destinatario', itNomeDest);
  const itDocDest = d.campo('CNPJ / CPF', faixaDest, true) ?? d.campo('CNPJ', faixaDest, true);
  const itIeDest = d.campo('INSCRICAO ESTADUAL', faixaDest);
  d.marcar('destinatario_ie', itIeDest);
  const itEmissao = d.campo('DATA DA EMISSAO', faixaDest, true) ?? d.campo('DATA DE EMISSAO', faixaDest, true);
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
    }
  }

  /* TOTAIS (o quadro do calculo do imposto). */
  const faixaImp = { abaixoDe: yImposto + 1, acimaDe: yProdutos };
  const itProdutos = d.campo('VALOR TOTAL DOS PRODUTOS', faixaImp);
  const itFrete = d.campo('VALOR DO FRETE', faixaImp);
  const itDesconto = d.campo('DESCONTO', faixaImp) ?? d.campo('VALOR DO DESCONTO', faixaImp);
  const itTotal = d.campo('VALOR TOTAL DA NOTA', faixaImp);
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
  if (rotProdutos) {
    const rotDescr = d.itens.find((it) => it.pagina === pg && it.y < rotProdutos.y && it.y > rotProdutos.y - 15 && normalizar(it.str).startsWith('DESCRICAO'));
    if (rotDescr) {
      const cab = d.itens.filter((o) => o.pagina === pg && Math.abs(o.y - rotDescr.y) <= TOL_LINHA).sort((a, b) => a.x - b.x);
      const col = (pred: (n: string) => boolean) => { const i = cab.findIndex((c) => pred(normalizar(c.str))); return i < 0 ? null : { de: cab[i].x - 4, ate: (cab[i + 1]?.x ?? 1e9) - 4 }; };
      const cDesc = col((n) => n.startsWith('DESCRICAO'));
      const cUn = col((n) => n === 'UN.' || n === 'UN' || n.startsWith('UNID'));
      const cQtd = col((n) => n.startsWith('QTD') || n.startsWith('QUANT'));
      const cUnit = col((n) => n.startsWith('V.UNIT') || n.startsWith('VALOR UNIT') || n.startsWith('VLR. UNIT') || n.startsWith('V. UNIT'));
      const cTotal = col((n) => n.startsWith('V.TOTAL') || n.startsWith('VALOR TOTAL') || n.startsWith('VLR. TOTAL') || n.startsWith('V. TOTAL'));
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
      const rotFim = d.itens.filter((o) => o.pagina === pg && o.y < rotDescr.y && /^(DADOS ADICIONAIS|CALCULO DO ISSQN)/.test(normalizar(o.str))).sort((a, b) => b.y - a.y)[0];
      const naCol = (linha: ItemNaPagina[], c: { de: number; ate: number } | null) => (c ? linha.filter((o) => o.x >= c.de && o.x < c.ate) : []);
      /* a descricao fica inteira (tem espaco de proposito); o pedaco que comeca DEPOIS dela e passa da coluna onde comeca, se parte */
      const inicioDasColunas = cab.map((c) => c.x - 4);
      const atravessa = (o: ItemNaPagina) => inicioDasColunas.some((x) => x > o.x + 1 && x < o.x + o.w - 1);
      const fimDaDescricao = cDesc?.ate ?? 0;
      for (const linhaCrua of d.linhasEntre(pg, rotDescr.y - TOL_LINHA, rotFim?.y ?? 0)) {
        const linha = linhaCrua.flatMap((o) => (o.x >= fimDaDescricao && atravessa(o) ? partirPelosEspacos(o) : [o]));
        const total = centavosBr(naCol(linha, cTotal).map((o) => o.str).join('').trim());
        const descr = naCol(linha, cDesc).map((o) => o.str.trim()).join(' ').trim();
        if (total != null && descr) {
          const qtd = naCol(linha, cQtd).map((o) => o.str.trim()).join('');
          const txt = (c: { de: number; ate: number } | null) => naCol(linha, c).map((o) => o.str.trim()).join('') || null;
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
        } else if (descr && itens.length) {
          const ult = itens[itens.length - 1];
          ult.detalhe = ult.detalhe ? `${ult.detalhe} · ${descr}` : descr;
        }
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
  const protocoloNum = /(\d{15})/.exec(itProtocolo?.str ?? '')?.[1] ?? null;
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
    destinatario: { documento: soDigitos(itDocDest?.str) || null, nome: itNomeDest?.str.trim() || null, ie: ie(itIeDest) },
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
