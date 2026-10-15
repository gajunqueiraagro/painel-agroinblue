/* OC-DOC-ESPECIE-ABATE-01 passo 4 — A LEITURA DO PDF DO ABATE, POR LAYOUT DE FRIGORIFICO.
   REGRAS (aprovadas pelo Gabriel em 15/10, uma a uma):
   1. O layout se reconhece por ANCORAS FIXAS (rotulos e titulo do documento) + lista EXPLICITA de CNPJ — nunca pelo nome.
      NENHUM ou MAIS DE UM layout reconhece o arquivo: so' anexa, e a faixa diz por que.
   2. TUDO OU NADA: reconhecido, falta qualquer campo obrigatorio do layout -> nada e' preenchido.
   3. A CONTA INTERNA DO PROPRIO PDF tem de fechar AO CENTAVO (bruto − despesas = liquido; kg / cab = media; soma dos produtos =
      total; cab e kg dos produtos = os do rodape). Nao fechou -> nada.
   4. ESPECIE TROCADA (um Romaneio solto com a especie Acerto): so' avisa.
   5. Sem CNPJ no texto (Acerto JBS, os dois Romaneios), o vinculo e' o CNPJ da CONTRAPARTE da OC, que tem de estar na lista do
      frigorifico; senao, como a regra 1.
   6. Preencher e' SUGESTAO e so' em campo VAZIO (`aplicarLeitura`); quem grava e' o Registrar.
   O que NAO esta' no PDF fica vazio: R$/@ na NF da JBS (a nota traz R$/kg; converter seria palpite), OP e lote no Romaneio da
   JBS. (A data do abate do Acerto da JBS e' o "Data:" do cabecalho — regra do Gabriel, ver o layout.) */
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import type { NfProdutor } from '@/lib/oc/formDocumentoAbate';
import { extrairDanfe } from '@/lib/oc/extrairDanfe';
import { acharChaveNFe } from '@/lib/oc/leitura/chaveNFe';
import { centavos, dataDoPdf, numeroDoPdf } from '@/lib/oc/leitura/numeroDoPdf';
import { SEPARADOR_DE_CELULA } from '@/lib/oc/leitura/montarLinhas';

/** Os CNPJs de cada frigorifico (so' digitos). Unidade nova entra AQUI quando houver PDF dela — nunca pela raiz nem pelo nome. */
type Frigorifico = 'minerva' | 'jbs';
export const CNPJS_DO_FRIGORIFICO: Record<Frigorifico, string[]> = {
  minerva: ['52168923000231'],
  jbs: ['02916265007768'],
};
type GrupoDoc = 'nf' | 'acerto' | 'romaneio';

export interface CamposLidos {
  numero?: string; serie?: string; chaveAcesso?: string; dataEmissao?: string;
  emitenteCnpj?: string | null; emitenteNome?: string | null;
  dataAbate?: string; vencimento?: string; ordemCompra?: string; loteFrigorifico?: string; op?: string;
  cab?: number; pesoKg?: number; precoArroba?: number; bruto?: number;
  funrural?: number; senar?: number; seguro?: number; rat?: number; liquido?: number;
  nfsProdutor?: NfProdutor[];
}

export type MotivoNaoLido = 'sem_texto' | 'desconhecido' | 'dois_layouts' | 'especie_trocada' | 'contraparte' | 'incompleto' | 'nao_fecha';
export type LeituraDoAbate =
  | { tipo: 'lido'; layout: string; rotulo: string; grupo: GrupoDoc; campos: CamposLidos; dados: Record<string, string> }
  | { tipo: 'nao_lido'; motivo: MotivoNaoLido; frase: string };

/* ── O TEXTO ──────────────────────────────────────────────────────────────────────────────── */
interface Texto { linhas: string[]; corrido: string; comQuebras: string }
const celulas = (l: string) => l.split(SEPARADOR_DE_CELULA).map(c => c.trim());
const digitos = (s: string) => s.replace(/\D/g, '');
/** A celula logo depois de uma celula igual ao rotulo, na primeira linha que o tem. */
function depoisDe(t: Texto, rotulo: string): string | undefined {
  for (const l of t.linhas) {
    const c = celulas(l);
    const i = c.indexOf(rotulo);
    if (i >= 0 && i + 1 < c.length) return c[i + 1];
  }
  return undefined;
}
/** A linha que comeca pela celula `rotulo`. */
const linhaQueComeca = (t: Texto, rotulo: string) => t.linhas.map(celulas).find(c => c[0] === rotulo);
/** O numero sozinho na linha logo depois da linha que tem a celula `rotulo` (o PDF da JBS desenha o valor um pouco abaixo).
 *  ⚠ So' a linha de baixo: na linha do "Bruto das Mercadorias:" a celula seguinte e' o R$/@ medio, nao o bruto. */
function numeroAbaixoDe(t: Texto, rotulo: string): number | undefined {
  for (let i = 0; i < t.linhas.length; i++) {
    const c = celulas(t.linhas[i]);
    if (!c.includes(rotulo)) continue;
    const prox = t.linhas[i + 1] != null ? celulas(t.linhas[i + 1]) : [];
    if (prox.length === 1) { const n = numeroDoPdf(prox[0]); if (n != null) return n; }
    return undefined;
  }
  return undefined;
}
const re1 = (t: string, re: RegExp) => t.match(re)?.[1];
const num = (s: string | undefined) => (s == null ? undefined : numeroDoPdf(s) ?? undefined);
const data = (s: string | undefined) => (s == null ? undefined : dataDoPdf(s) ?? undefined);
const temTodos = (t: Texto, ancoras: string[]) => ancoras.every(a => t.corrido.includes(a));
const igualCent = (a: number, b: number) => centavos(a) === centavos(b);
const somaCent = (xs: number[]) => xs.reduce((s, x) => s + centavos(x), 0);

/* ── OS LAYOUTS ───────────────────────────────────────────────────────────────────────────── */
type Ler = (t: Texto) => { ok: true; campos: CamposLidos; dados?: Record<string, string> } | { ok: false; motivo: 'incompleto' | 'nao_fecha'; detalhe: string };
interface Layout {
  id: string; rotulo: string; frigorifico: Frigorifico; grupo: GrupoDoc;
  /** true = o CNPJ do frigorifico vem do proprio texto (chave da NF, "CNPJ:" do acerto); false = da contraparte (regra 5). */
  cnpjNoTexto: boolean;
  reconhece: (t: Texto) => boolean;
  obrigatorios: (keyof CamposLidos)[];
  ler: Ler;
}
const cnpjDaChave = (t: Texto) => { const c = acharChaveNFe(t.comQuebras); return c ? c.slice(6, 20) : null; };
const daLista = (f: Frigorifico, cnpj: string | null) => cnpj != null && CNPJS_DO_FRIGORIFICO[f].some(x => x === cnpj);

/** Cabecalho de NF comum aos dois (o que vem da chave e' soberano: numero, serie, emitente, emissao). */
function cabecalhoDaNf(t: Texto): CamposLidos {
  const d = extrairDanfe(t.comQuebras);
  return {
    numero: d.numero ?? undefined, serie: d.serie ?? undefined, chaveAcesso: d.chaveAcesso ?? undefined,
    dataEmissao: d.dataEmissao ?? undefined, emitenteCnpj: d.emitenteCnpj, emitenteNome: d.emitenteNome,
    bruto: d.valorTotal ?? undefined,
  };
}
/** As linhas de produto do DANFE: a celula do NCM do gado (0102xxxx) ancora as outras. */
function produtosDaNf(t: Texto) {
  return t.linhas.map(celulas).flatMap(c => {
    const k = c.findIndex(x => /^0102\d{4}$/.test(x));
    if (k < 0) return [];
    return [{ cb: k === 3 ? num(c[2]) : undefined, un: c[k + 3], quant: num(c[k + 4]), unit: num(c[k + 5]), total: num(c[k + 6]) }];
  });
}
/** A linha dos volumes ("QUANTIDADE | ESPÉCIE | … | PESO LÍQUIDO" e os valores embaixo). */
function volumesDaNf(t: Texto) {
  const i = t.linhas.findIndex(l => celulas(l)[0] === 'QUANTIDADE' && l.includes('PESO LÍQUIDO'));
  if (i < 0 || !t.linhas[i + 1]) return {};
  const c = celulas(t.linhas[i + 1]);
  return { quantidade: num(c[0]), pesoLiquido: num(c[c.length - 1]) };
}

const NF_MINERVA: Layout = {
  id: 'nf_minerva', rotulo: 'NF Minerva', frigorifico: 'minerva', grupo: 'nf', cnpjNoTexto: true,
  reconhece: t => daLista('minerva', cnpjDaChave(t)) && temTodos(t, ['Inf. Contribuinte:', 'FUNR R$']),
  obrigatorios: ['chaveAcesso', 'dataEmissao', 'cab', 'pesoKg', 'bruto', 'funrural'],
  ler: t => {
    const cab0 = cabecalhoDaNf(t);
    const prods = produtosDaNf(t);
    const vol = volumesDaNf(t);
    const ret = (rot: string) => num(re1(t.corrido, new RegExp(`${rot} R\\$ ([\\d .]+,\\d{2})`)));
    const nfs: NfProdutor[] = [...t.corrido.matchAll(/NOTA FISCAL DE PRODUTOR (\d+) EMITIDA EM (\d{2}\/\d{2}\/\d{4}) VR : ([\d .]+,\d{2})/g)]
      .map(m => ({ numero: m[1], data: dataDoPdf(m[2]), valor: numeroDoPdf(m[3]) }));
    const emAr = prods.filter(p => p.un === 'Ar');
    const campos: CamposLidos = {
      ...cab0, cab: vol.quantidade, pesoKg: vol.pesoLiquido,
      precoArroba: emAr.length === 1 ? emAr[0].unit : undefined,
      funrural: ret('FUNR'), senar: ret('SENAR'), seguro: ret('SEGURO'),
      dataAbate: data(re1(t.corrido, /DATA ABATE:\s*(\d{2}\/\d{2}\/\d{4})/)),
      nfsProdutor: nfs.length ? nfs : undefined,
    };
    if (prods.length === 0 || prods.some(p => p.total == null)) return { ok: false, motivo: 'incompleto', detalhe: 'produtos da nota' };
    if (campos.bruto != null && somaCent(prods.map(p => p.total ?? 0)) !== centavos(campos.bruto))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma dos produtos ≠ total da nota' };
    if (emAr.length && campos.pesoKg != null && somaCent(emAr.map(p => (p.quant ?? 0) * 15)) !== centavos(campos.pesoKg))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'arrobas × 15 ≠ peso líquido' };
    return { ok: true, campos };
  },
};

const NF_JBS: Layout = {
  id: 'nf_jbs', rotulo: 'NF JBS', frigorifico: 'jbs', grupo: 'nf', cnpjNoTexto: true,
  reconhece: t => daLista('jbs', cnpjDaChave(t)) && temTodos(t, ['DESCONTO DO FUNRURAL NO VALOR DE R$']),
  obrigatorios: ['chaveAcesso', 'dataEmissao', 'cab', 'pesoKg', 'bruto', 'funrural'],
  ler: t => {
    const cab0 = cabecalhoDaNf(t);
    const prods = produtosDaNf(t);
    const vol = volumesDaNf(t);
    const desconto = (rot: string) => num(re1(t.corrido, new RegExp(`DESCONTO (?:DO|DA|DE) ${rot} NO VALOR DE R\\$ ([\\d .]+,\\d{2})`)));
    const mNfs = t.corrido.match(/NF PRODUTOR NUMEROS\.\s*([\d/ ]+?)\s+DE\s+(\d{2}\/\d{2}\/\d{4})/);
    const nfs: NfProdutor[] = mNfs ? mNfs[1].split('/').map(n => n.trim()).filter(Boolean)
      .map(n => ({ numero: n, data: dataDoPdf(mNfs[2]), valor: null })) : [];
    const cabProdutos = prods.map(p => p.cb);
    const campos: CamposLidos = {
      ...cab0,
      cab: cabProdutos.every(n => n != null) && cabProdutos.length ? cabProdutos.reduce((s, n) => (s ?? 0) + (n ?? 0), 0) : undefined,
      pesoKg: vol.pesoLiquido,
      funrural: desconto('FUNRURAL'), senar: desconto('SENAR'), rat: desconto('RAT'),
      nfsProdutor: nfs.length ? nfs : undefined,
    };
    const dados: Record<string, string> = {};
    const poe = (k: string, rot: string) => { const v = depoisDe(t, rot); if (v && /^\d+$/.test(v)) dados[k] = v; };
    poe('ordem_compra', 'PEDIDO:'); poe('carga', 'CARGA:'); poe('instrucao', 'INSTRUÇÃO:'); poe('documento_frig', 'DOCUMENTO:');
    if (prods.length === 0 || prods.some(p => p.total == null || p.quant == null)) return { ok: false, motivo: 'incompleto', detalhe: 'produtos da nota' };
    if (campos.cab != null && (!Number.isInteger(campos.cab) || (vol.quantidade != null && vol.quantidade !== campos.cab)))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'cab dos produtos ≠ quantidade' };
    if (campos.pesoKg != null && somaCent(prods.map(p => p.quant ?? 0)) !== centavos(campos.pesoKg))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'kg dos produtos ≠ peso líquido' };
    if (campos.bruto != null && somaCent(prods.map(p => p.total ?? 0)) !== centavos(campos.bruto))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma dos produtos ≠ total da nota' };
    const fatura = num(re1(t.corrido, /\[\s*\d+\/\d+\s*-\s*\d{2}\/\d{2}\/\d{4}\s*-\s*([\d.]+,\d{2})\s*\]/));
    if (fatura != null && campos.bruto != null
      && centavos(campos.bruto) - somaCent([campos.funrural ?? 0, campos.senar ?? 0, campos.rat ?? 0]) !== centavos(fatura))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'total − descontos ≠ fatura' };
    return { ok: true, campos, dados };
  },
};

const ACERTO_MINERVA: Layout = {
  id: 'acerto_minerva', rotulo: 'Acerto Minerva', frigorifico: 'minerva', grupo: 'acerto', cnpjNoTexto: true,
  reconhece: t => daLista('minerva', digitos(re1(t.corrido, /CNPJ:\s*([\d./-]{14,18})/) ?? ''))
    && temTodos(t, ['Ordem Compra -', 'Resumo de Abate', 'Acertos no Pagamento', 'Total Geral']),
  obrigatorios: ['ordemCompra', 'dataAbate', 'cab', 'pesoKg', 'bruto', 'liquido'],
  ler: t => {
    const total = linhaQueComeca(t, 'TOTAL Animais');
    const despesas = num(linhaQueComeca(t, 'Total Despesas')?.[1]);
    const iIni = t.linhas.findIndex(l => l.startsWith('Resumo de Abate'));
    const iFim = t.linhas.findIndex(l => l.startsWith('TOTAL Animais'));
    const prods = iIni >= 0 && iFim > iIni ? t.linhas.slice(iIni + 1, iFim).map(celulas).filter(c => c.length === 5) : [];
    const campos: CamposLidos = {
      ordemCompra: re1(t.corrido, /Ordem Compra - (\d+)/), loteFrigorifico: re1(t.corrido, /Lote - (\d+)/),
      dataAbate: data(re1(t.corrido, /Data Abate - (\d{2}\/\d{2}\/\d{4})/)),
      vencimento: data(re1(t.corrido, /Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/)),
      cab: num(total?.[1]), pesoKg: num(total?.[2]), bruto: num(total?.[3]),
      precoArroba: prods.length === 1 ? num(prods[0][3]) : undefined,
      liquido: num(linhaQueComeca(t, 'Total Geral')?.[1]),
    };
    if (despesas == null) return { ok: false, motivo: 'incompleto', detalhe: 'Total Despesas' };
    if (campos.bruto != null && campos.liquido != null && centavos(campos.bruto) - centavos(despesas) !== centavos(campos.liquido))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'bruto − despesas ≠ total geral' };
    if (prods.length && campos.bruto != null && somaCent(prods.map(p => num(p[4]) ?? 0)) !== centavos(campos.bruto))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma do resumo ≠ total' };
    if (campos.cab != null && !Number.isInteger(campos.cab)) return { ok: false, motivo: 'nao_fecha', detalhe: 'cab não inteiro' };
    return { ok: true, campos };
  },
};

const ACERTO_JBS: Layout = {
  id: 'acerto_jbs', rotulo: 'Acerto JBS', frigorifico: 'jbs', grupo: 'acerto', cnpjNoTexto: false,
  reconhece: t => temTodos(t, ['Acerto de Compra de Gado', 'Instrução:', 'Bruto das Mercadorias:', 'Total do Documento:']),
  obrigatorios: ['ordemCompra', 'dataAbate', 'cab', 'pesoKg', 'bruto', 'liquido'],
  ler: t => {
    const linhas = t.linhas.map(celulas);
    /* produto = 9 celulas com a UNIDADE na 4a (a linha do pagamento tambem tem 9 celulas e comeca por numero) */
    const prods = linhas.filter(c => c.length === 9 && /^\d+$/.test(c[0]) && /^(KG|CB|AR)$/i.test(c[3]));
    const descontos = linhas.filter(c => c.some(x => x.includes('( - )'))).map(c => num(c[c.length - 1]));
    const pagamentos = linhas.filter(c => c.length >= 3 && /^\d+$/.test(c[0]) && /^\d{2}\/\d{2}\/\d{4}$/.test(c[1]));
    const campos: CamposLidos = {
      ordemCompra: re1(t.corrido, /Pedido:[\s|]*(\d+)/),
      /* JBS fatura no dia do abate (Gabriel 15/10/2026): o "Data:" do cabecalho ("Documento: … | Instrução: … | Data: | dd/mm/aaaa")
         E' a data do abate. Vale SO' neste layout; a Minerva le^ "Data Abate -". */
      dataAbate: data(depoisDe(t, 'Data:')),
      cab: num(depoisDe(t, 'Total Qtde:')), pesoKg: num(depoisDe(t, 'Peso Líquido:')),
      precoArroba: num(depoisDe(t, 'Bruto das Mercadorias:')),
      bruto: numeroAbaixoDe(t, 'Bruto das Mercadorias:'), liquido: numeroAbaixoDe(t, 'Total do Documento:'),
      vencimento: pagamentos.length === 1 ? data(pagamentos[0][1]) : undefined,
    };
    const dados: Record<string, string> = {};
    const doc = re1(t.corrido, /Documento:\s*(\d+)/); if (doc) dados.documento_frig = doc;
    const ins = re1(t.corrido, /Instrução:\s*(\d+)/); if (ins) dados.instrucao = ins;
    if (descontos.some(d => d == null)) return { ok: false, motivo: 'incompleto', detalhe: 'descontos' };
    const ret = somaCent(descontos.map(d => d ?? 0));
    if (campos.bruto != null && campos.liquido != null && centavos(campos.bruto) - ret !== centavos(campos.liquido))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'bruto − descontos ≠ total do documento' };
    if (prods.length === 0) return { ok: false, motivo: 'incompleto', detalhe: 'produtos' };
    if (campos.bruto != null && somaCent(prods.map(p => num(p[8]) ?? 0)) !== centavos(campos.bruto))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma dos produtos ≠ bruto' };
    if (campos.cab != null && (!Number.isInteger(campos.cab) || prods.reduce((s, p) => s + (num(p[4]) ?? 0), 0) !== campos.cab))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'cab dos produtos ≠ total qtde' };
    if (campos.pesoKg != null && somaCent(prods.map(p => num(p[5]) ?? 0)) !== centavos(campos.pesoKg))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'kg dos produtos ≠ peso líquido' };
    if (pagamentos.length && campos.liquido != null && somaCent(pagamentos.map(p => num(p[2]) ?? 0)) !== centavos(campos.liquido))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'pagamentos ≠ total do documento' };
    return { ok: true, campos, dados };
  },
};

const ROMANEIO_MINERVA: Layout = {
  id: 'romaneio_minerva', rotulo: 'Romaneio Minerva', frigorifico: 'minerva', grupo: 'romaneio', cnpjNoTexto: false,
  reconhece: t => temTodos(t, ['ROMANEIO DE ABATE', 'Ord. Prod.:', 'Qtd. Programada:', 'Média Total (KG):']),
  obrigatorios: ['dataAbate', 'cab', 'pesoKg'],
  ler: t => {
    const total = linhaQueComeca(t, 'Total');
    const media = num(depoisDe(t, 'Média Total (KG):'));
    const campos: CamposLidos = {
      loteFrigorifico: depoisDe(t, 'Lote:'), op: depoisDe(t, 'Ord. Prod.:'), dataAbate: data(depoisDe(t, 'Data Abate:')),
      cab: num(total?.[1]), pesoKg: num(total?.[2]),
    };
    const dados: Record<string, string> = {};
    const oc = depoisDe(t, 'Ordem Compra:'); if (oc && /^\d+$/.test(oc)) dados.ordem_compra = oc;
    if (media == null) return { ok: false, motivo: 'incompleto', detalhe: 'Média Total (KG)' };
    if (campos.cab != null && (!Number.isInteger(campos.cab) || campos.cab <= 0)) return { ok: false, motivo: 'nao_fecha', detalhe: 'cab não inteiro' };
    if (campos.cab && campos.pesoKg != null && !igualCent(Math.round((campos.pesoKg / campos.cab) * 100) / 100, media))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'peso ÷ cab ≠ média' };
    return { ok: true, campos, dados };
  },
};

const ROMANEIO_JBS: Layout = {
  id: 'romaneio_jbs', rotulo: 'Romaneio JBS', frigorifico: 'jbs', grupo: 'romaneio', cnpjNoTexto: false,
  reconhece: t => temTodos(t, ['Romaneio de Abate - cFBED340', 'Total Abatido']) && /Pedido:\s*\d+\s*-\s*Carga:\s*\d+/.test(t.corrido),
  obrigatorios: ['dataAbate', 'cab', 'pesoKg'],
  ler: t => {
    const totais = t.linhas.map(celulas).filter(c => c[0] === 'Total Abatido');
    const m = t.corrido.match(/Pedido:\s*(\d+)\s*-\s*Carga:\s*(\d+)/);
    /* o resumo traz "Total Abatido" varias vezes; a linha de 5 celulas e' a sem a coluna de % */
    const t0 = totais.find(c => c.length === 5);
    const campos: CamposLidos = {
      dataAbate: data(re1(t.corrido, /Data do Abate:\s*(\d{2}\/\d{2}\/\d{4})/)), cab: num(t0?.[1]), pesoKg: num(t0?.[2]),
    };
    const dados: Record<string, string> = m ? { ordem_compra: m[1], carga: m[2] } : {};
    const media = num(t0?.[3]);
    if (totais.some(c => num(c[1]) !== campos.cab || num(c[c.length === 6 ? 3 : 2]) !== campos.pesoKg))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'os totais abatidos não batem entre si' };
    if (campos.cab != null && (!Number.isInteger(campos.cab) || campos.cab <= 0)) return { ok: false, motivo: 'nao_fecha', detalhe: 'cab não inteiro' };
    if (media != null && campos.cab && campos.pesoKg != null
      && Math.round((campos.pesoKg / campos.cab) * 1000) !== Math.round(media * 1000))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'peso ÷ cab ≠ média' };
    return { ok: true, campos, dados };
  },
};

export const LAYOUTS_DO_ABATE: readonly Layout[] = [NF_MINERVA, NF_JBS, ACERTO_MINERVA, ACERTO_JBS, ROMANEIO_MINERVA, ROMANEIO_JBS];

/* ── A LEITURA ────────────────────────────────────────────────────────────────────────────── */
const ROTULO_DO_GRUPO: Record<GrupoDoc, string> = { nf: 'NF', acerto: 'Acerto', romaneio: 'Romaneio' };
export const grupoDaEspecie = (e: EspecieDoc): GrupoDoc | null =>
  (e === 'nf_principal' || e === 'nf_complementar' ? 'nf' : e === 'acerto' || e === 'romaneio' ? e : null);

const ROTULO_DO_CAMPO: Partial<Record<keyof CamposLidos, string>> = {
  chaveAcesso: 'a chave de acesso', dataEmissao: 'a emissão', cab: 'a quantidade de cabeças', pesoKg: 'o peso', bruto: 'o valor bruto',
  funrural: 'o Funrural', ordemCompra: 'a ordem de compra / pedido', dataAbate: 'a data do abate', liquido: 'o líquido',
};

export const FRASE_SEM_TEXTO = 'PDF sem texto (imagem): só anexado, preencha os campos';
export const FRASE_NAO_RECONHECIDO = 'Formato não reconhecido: arquivo anexado, preencha os campos';

export function lerPdfDoAbate(
  pdf: { linhas: string[]; temTexto: boolean },
  ctx: { especie: EspecieDoc; cnpjContraparte: string | null },
): LeituraDoAbate {
  if (!pdf.temTexto) return { tipo: 'nao_lido', motivo: 'sem_texto', frase: FRASE_SEM_TEXTO };
  const t: Texto = { linhas: pdf.linhas, corrido: pdf.linhas.join(' '), comQuebras: pdf.linhas.join('\n') };
  const achados = LAYOUTS_DO_ABATE.filter(l => l.reconhece(t));
  if (achados.length === 0) return { tipo: 'nao_lido', motivo: 'desconhecido', frase: FRASE_NAO_RECONHECIDO };
  if (achados.length > 1)
    return { tipo: 'nao_lido', motivo: 'dois_layouts', frase: `Formato ambíguo (${achados.map(l => l.rotulo).join(' / ')}): arquivo anexado, preencha os campos` };
  const L = achados[0];
  const grupo = grupoDaEspecie(ctx.especie);
  if (grupo !== L.grupo)
    return { tipo: 'nao_lido', motivo: 'especie_trocada', frase: `Este PDF é ${L.rotulo}; a espécie escolhida é ${grupo ? ROTULO_DO_GRUPO[grupo] : 'outra'} · nada preenchido` };
  if (!L.cnpjNoTexto && !daLista(L.frigorifico, ctx.cnpjContraparte ? digitos(ctx.cnpjContraparte) : null))
    return { tipo: 'nao_lido', motivo: 'contraparte', frase: `${L.rotulo}, mas a contraparte da operação não é desse frigorífico: arquivo anexado, preencha os campos` };
  const r = L.ler(t);
  /* `=== false`: com `strict: false` o `!r.ok` nao estreita a uniao. */
  if (r.ok === false) {
    return r.motivo === 'incompleto'
      ? { tipo: 'nao_lido', motivo: 'incompleto', frase: `${L.rotulo} reconhecido, mas falta ${r.detalhe} no PDF · nada preenchido` }
      : { tipo: 'nao_lido', motivo: 'nao_fecha', frase: `${L.rotulo} reconhecido, mas a conta do PDF não fecha (${r.detalhe}) · nada preenchido` };
  }
  if (r.ok !== true) return { tipo: 'nao_lido', motivo: 'incompleto', frase: FRASE_NAO_RECONHECIDO };
  const lido = r;
  const falta = L.obrigatorios.find(k => lido.campos[k] == null || lido.campos[k] === '');
  if (falta) return { tipo: 'nao_lido', motivo: 'incompleto', frase: `${L.rotulo} reconhecido, mas falta ${ROTULO_DO_CAMPO[falta] ?? falta} no PDF · nada preenchido` };
  return { tipo: 'lido', layout: L.id, rotulo: L.rotulo, grupo: L.grupo, campos: lido.campos, dados: lido.dados ?? {} };
}
