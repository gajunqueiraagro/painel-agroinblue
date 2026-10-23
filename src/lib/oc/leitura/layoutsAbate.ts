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
import type { Incentivo, NfProdutor } from '@/lib/oc/formDocumentoAbate';
import { formatCasas } from '@/lib/calculos/numeroBR';
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
/* 7f (OC-DOC-SAIDA-FAZENDA-01): os documentos da SAIDA DA FAZENDA — a NFP-e do produtor, a e-GTA e as declaracoes (Modelo B,
   Carta de garantia). Nao sao do frigorifico: o vinculo e' o proprio texto (titulo + chave / codigos), nunca a contraparte. */
type GrupoDoc = 'nf' | 'acerto' | 'romaneio' | 'nf_produtor' | 'gta' | 'declaracao';

export interface CamposLidos {
  numero?: string; serie?: string; chaveAcesso?: string; dataEmissao?: string;
  emitenteCnpj?: string | null; emitenteNome?: string | null;
  dataAbate?: string; vencimento?: string; ordemCompra?: string; loteFrigorifico?: string; op?: string;
  cab?: number; pesoKg?: number; precoArroba?: number; bruto?: number;
  funrural?: number; senar?: number; seguro?: number; rat?: number; liquido?: number;
  nfsProdutor?: NfProdutor[];
  /* 7f — saida da fazenda. `gtas`: as GTAs citadas ("Q-745856"); `valorNota`: o valor da NFP-e (vai como componente informativo). */
  dataSaida?: string; destinatario?: string; gtas?: string[]; valorNota?: number;
  femeas?: number; machos?: number; finalidade?: string; destino?: string; validade?: string; embarque?: string;
  tipoDeclaracao?: string;
  /** Passo 7e: creditos do documento (o incentivo PROAPE-PRECOCE/MS da Minerva), um por linha do PDF. */
  incentivos?: Incentivo[];
}

export type MotivoNaoLido = 'sem_texto' | 'desconhecido' | 'dois_layouts' | 'especie_trocada' | 'contraparte' | 'incompleto' | 'nao_fecha';
/** P85 (Gabriel 23/10/2026): o frigorifico LIDO do proprio PDF (razao social e CNPJ) — o que a faixa mostra; o nome do layout nunca. */
export interface FrigorificoLido { nome: string | null; cnpj: string | null }
export type LeituraDoAbate =
  | { tipo: 'lido'; layout: string; rotulo: string; grupo: GrupoDoc; campos: CamposLidos; dados: Record<string, unknown>; avisos: string[];
      /** P85 (b) — o que se diz sem alarme (a diferenca de centavos de arredondamento do proprio PDF) */
      notas: string[]; frigorifico: FrigorificoLido | null }
  | { tipo: 'nao_lido'; motivo: MotivoNaoLido; frase: string;
      /** P85 (a) — a especie em que o PDF SE LE (a escolhida era outra): a tela troca e le^ de novo */
      especieSugerida?: EspecieDoc };

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
/* `avisos`: o que a faixa escreve em ambar sem impedir a leitura. `dispensados`: obrigatorio que o PROPRIO PDF nao permite preencher
   (datas diferentes entre os lotes do acerto) — fica vazio e avisado, nunca inventado. */
type Ler = (t: Texto) => { ok: true; campos: CamposLidos; dados?: Record<string, unknown>; avisos?: string[]; notas?: string[]; dispensados?: (keyof CamposLidos)[] }
  | { ok: false; motivo: 'incompleto' | 'nao_fecha'; detalhe: string };
interface Layout {
  /** Nulo nos documentos da saida da fazenda (7f): o vinculo e' o proprio texto. */
  id: string; rotulo: string; frigorifico: Frigorifico | null; grupo: GrupoDoc;
  /** true = o CNPJ do frigorifico vem do proprio texto (chave da NF, "CNPJ:" do acerto); false = da contraparte (regra 5). */
  cnpjNoTexto: boolean;
  reconhece: (t: Texto) => boolean;
  obrigatorios: (keyof CamposLidos)[];
  ler: Ler;
  /** P85 (c) — o frigorifico escrito no PDF (so' nos layouts que o trazem no texto) */
  frigorificoDoTexto?: (t: Texto) => FrigorificoLido;
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
/* Passo 7e: a montagem das linhas cola dois numeros vizinhos numa celula quando o espaco entre eles e' curto ("359,4700 122.411,52",
   medido na NF 8815). Na linha de PRODUTO a celula so' se reparte quando TODAS as partes sao numero com virgula decimal — "1 295,39"
   (milhar com espaco) nao se reparte. */
const NUMERO_COM_VIRGULA = /^\d{1,3}(\.\d{3})*,\d+$/;
const celulasDoProduto = (l: string) => celulas(l).flatMap(x => {
  const partes = x.split(/\s+/);
  return partes.length > 1 && partes.every(p => NUMERO_COM_VIRGULA.test(p)) ? partes : [x];
});
/** As linhas de produto do DANFE: a celula do NCM ancora as outras. `ncm` = o padrao da celula (gado 0102xxxx). */
function linhasDeProduto(t: Texto, ncm: RegExp) {
  return t.linhas.map(celulasDoProduto).flatMap(c => {
    const k = c.findIndex(x => ncm.test(x));
    if (k < 0) return [];
    return [{ descricao: c[k - 1] ?? '', cb: k === 3 ? num(c[2]) : undefined, un: c[k + 3], quant: num(c[k + 4]), unit: num(c[k + 5]), total: num(c[k + 6]) }];
  });
}
const produtosDaNf = (t: Texto) => linhasDeProduto(t, /^0102\d{4}$/);
/** Passo 7e: na NF da Minerva o incentivo PROAPE-PRECOCE/MS e' linha de produto com NCM 00000000 (regra do Gabriel, 15/10). */
const incentivosDaNf = (t: Texto) => linhasDeProduto(t, /^0{8}$/);
const fmt2 = (n: number) => formatCasas(n, 2);
const brlDeCent = (c: number) => `R$ ${formatCasas(c / 100, 2)}`;
export const fraseDoIncentivo = (total: number) => `Incentivo ${fmt2(total)} incluído`;
export const FRASE_NF_SEM_FUNRURAL = 'NF sem Funrural destacado';
/** A linha dos volumes ("QUANTIDADE | ESPÉCIE | … | PESO LÍQUIDO" e os valores embaixo). */
function volumesDaNf(t: Texto) {
  const i = t.linhas.findIndex(l => celulas(l)[0] === 'QUANTIDADE' && l.includes('PESO LÍQUIDO'));
  if (i < 0 || !t.linhas[i + 1]) return {};
  const c = celulas(t.linhas[i + 1]);
  return { quantidade: num(c[0]), pesoLiquido: num(c[c.length - 1]) };
}

const NF_MINERVA: Layout = {
  id: 'nf_minerva', rotulo: 'NF Minerva', frigorifico: 'minerva', grupo: 'nf', cnpjNoTexto: true,
  frigorificoDoTexto: t => { const d = extrairDanfe(t.comQuebras); return { nome: d.emitenteNome, cnpj: d.emitenteCnpj }; },
  /* Passo 7e: a chave (com DV valido) e' da Minerva e o texto tem a referencia da NF do produtor e o SENAR. "Inf. Contribuinte:" nao
     e' ancora (uma impressao da NF 8815 nao o traz), nem "FUNR R$" (a NF pode vir sem Funrural destacado). */
  reconhece: t => daLista('minerva', cnpjDaChave(t)) && temTodos(t, ['REF NOTA FISCAL DE PRODUTOR', 'SENAR R$']),
  /* Funrural e Seguro NAO sao obrigatorios: "FUNR R$ %" (vazio) e' campo vazio, nunca zero. */
  obrigatorios: ['chaveAcesso', 'dataEmissao', 'cab', 'pesoKg', 'bruto'],
  ler: t => {
    const cab0 = cabecalhoDaNf(t);
    const prods = produtosDaNf(t);
    const incs = incentivosDaNf(t);
    const vol = volumesDaNf(t);
    const ret = (rot: string) => num(re1(t.corrido, new RegExp(`${rot} R\\$ ([\\d .]+,\\d{2})`)));
    /* A referencia pode citar varias NFs do produtor ("9412557, 9412508 … VR : 217 567,08"): o VR e' de todas, e fica com a SOMA
       (em `dados.nfs_produtor_valor`), sem repartir; com uma so', e' o valor dela. */
    const dados: Record<string, unknown> = {};
    const nfs: NfProdutor[] = [...t.corrido.matchAll(/NOTA FISCAL DE PRODUTOR ([\d, ]+?) EMITIDA EM (\d{2}\/\d{2}\/\d{4}) VR : ([\d .]+,\d{2})/g)]
      .flatMap(m => {
        const numeros = m[1].split(',').map(x => x.trim()).filter(Boolean);
        const vr = numeroDoPdf(m[3]);
        if (numeros.length > 1 && vr != null) dados.nfs_produtor_valor = vr;
        return numeros.map(n => ({ numero: n, data: dataDoPdf(m[2]), valor: numeros.length === 1 ? vr : null }));
      });
    const emAr = prods.filter(p => p.un === 'Ar');
    const totalNota = cab0.bruto;
    const campos: CamposLidos = {
      ...cab0, cab: vol.quantidade, pesoKg: vol.pesoLiquido,
      precoArroba: emAr.length === 1 ? emAr[0].unit : undefined,
      funrural: ret('FUNR'), senar: ret('SENAR'), seguro: ret('SEGURO'),
      dataAbate: data(re1(t.corrido, /DATA ABATE:\s*(\d{2}\/\d{2}\/\d{4})/)),
      nfsProdutor: nfs.length ? nfs : undefined,
    };
    if (prods.length === 0 || prods.some(p => p.total == null)) return { ok: false, motivo: 'incompleto', detalhe: 'produtos da nota' };
    if (incs.some(p => p.total == null)) return { ok: false, motivo: 'incompleto', detalhe: 'incentivos da nota' };
    /* Bruto R$ = so' o gado; o total da nota = gado + incentivos (a conta interna, ao centavo). */
    const gado = somaCent(prods.map(p => p.total ?? 0));
    const incentivo = somaCent(incs.map(p => p.total ?? 0));
    if (totalNota != null && gado + incentivo !== centavos(totalNota))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma dos produtos ≠ total da nota' };
    campos.bruto = totalNota == null ? undefined : gado / 100;
    if (incs.length) campos.incentivos = incs.map(p => ({ descricao: p.descricao, valor: p.total ?? 0 }));
    if (emAr.length && campos.pesoKg != null && somaCent(emAr.map(p => (p.quant ?? 0) * 15)) !== centavos(campos.pesoKg))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'arrobas × 15 ≠ peso líquido' };
    const avisos: string[] = [];
    if (campos.funrural == null) avisos.push(FRASE_NF_SEM_FUNRURAL);
    if (incs.length) avisos.push(fraseDoIncentivo(incentivo / 100));
    return { ok: true, campos, dados, avisos };
  },
};

const NF_JBS: Layout = {
  id: 'nf_jbs', rotulo: 'NF JBS', frigorifico: 'jbs', grupo: 'nf', cnpjNoTexto: true,
  frigorificoDoTexto: t => { const d = extrairDanfe(t.comQuebras); return { nome: d.emitenteNome, cnpj: d.emitenteCnpj }; },
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
  /* Passo 7e — VARIOS LOTES E CREDITOS (medido no acerto LT11-12, 15/10): um BLOCO por lote ("Ordem Compra - N", "Lote - N | Data
     Abate -", o "Resumo de Abate", "TOTAL Animais | cab | kg | total", "Vencimento:") e um fecho comum: "Acertos no Pagamento" com as
     linhas "OC: N - <despesa>", "Total Despesas", as linhas "OC: N - <credito>", "Total Créditos" e "Total Geral".
     cab, kg e bruto (gado) = SOMA dos blocos; despesas = "Total Despesas"; creditos = "Total Créditos" (0 sem a secao).
     A CONTA, tudo ou nada: cada bloco = o seu resumo; as linhas de despesa = "Total Despesas"; as de credito = "Total Créditos";
     soma dos blocos = "VALOR TOTAL DO PRODUTO" (quando existe); bruto − despesas + creditos = "Total Geral".
     R$/@: com UM bloco, o impresso (o resumo de uma linha); com varios, a MEDIA PONDERADA = bruto do gado ÷ (kg ÷ 15), 2 casas.
     Vencimento e data do abate: os dos blocos; se diferirem entre os lotes, nao preenche e a faixa avisa.
     ⚠ P85 (b) (Gabriel 23/10/2026, o LT04 da Fortunceres: 351.302,67 + 4.986,37 = 356.289,04 e o PDF imprime 356.289,03) — a conta que
     NAO FECHA nao apaga mais a leitura: vale o que o PDF IMPRIME (os totais) e a diferenca e' dita. Ate' R$ 0,05 e' arredondamento do
     frigorifico (nota discreta); acima, aviso em ambar com a diferenca em R$ — o sistema explica, o operador decide. */
  frigorificoDoTexto: t => {
    const i = t.linhas.findIndex(l => /^CNPJ:/.test(l));
    const cnpj = re1(t.corrido, /CNPJ:\s*([\d./-]{14,18})/) ?? null;
    return { nome: i > 0 ? (celulas(t.linhas[0])[0] || null) : null, cnpj };
  },
  ler: t => {
    const avisos: string[] = [];
    const notas: string[] = [];
    /** a conta do PDF que nao fecha: a diferenca dita (centavos de arredondamento = nota; mais = aviso) */
    const conferir = (lido: number, impresso: number, oque: string) => {
      const d = Math.abs(lido - impresso);
      if (d === 0) return;
      if (d <= 5) notas.push(`diferença de ${brlDeCent(d)} de arredondamento no PDF (${oque})`);
      else avisos.push(`a conta do PDF não fecha (${oque}): diferença de ${brlDeCent(d)} · confira`);
    };
    const linhas = t.linhas.map(celulas);
    type Bloco = { ordem: string; lote: string; data?: string; venc?: string; prods: string[][]; total?: string[] };
    const blocos: Bloco[] = [];
    let atual: Bloco | null = null;
    let noResumo = false;
    for (const c of linhas) {
      const oc = (c[0] ?? '').match(/^Ordem Compra - (\d+)/);
      if (oc) { atual = { ordem: oc[1], lote: '', prods: [] }; blocos.push(atual); noResumo = false; continue; }
      if (!atual) continue;
      const lt = (c[0] ?? '').match(/^Lote - (\d+)$/);
      if (lt) { atual.lote = lt[1]; const d = c.join(' ').match(/Data Abate - (\d{2}\/\d{2}\/\d{4})/); if (d) atual.data = data(d[1]); continue; }
      if ((c[0] ?? '').startsWith('Resumo de Abate')) { noResumo = true; continue; }
      if (c[0] === 'TOTAL Animais') { atual.total = c; noResumo = false; continue; }
      if (noResumo && c.length === 5) { atual.prods.push(c); continue; }
      const v = (c[0] ?? '').match(/^Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/);
      if (v && atual.venc == null) atual.venc = data(v[1]);
    }
    if (blocos.length === 0 || blocos.some(bl => !bl.total)) return { ok: false, motivo: 'incompleto', detalhe: 'TOTAL Animais' };
    for (const bl of blocos) {
      const totalDoBloco = num(bl.total?.[3]);
      if (bl.prods.length && totalDoBloco != null)
        conferir(somaCent(bl.prods.map(p => num(p[4]) ?? 0)), centavos(totalDoBloco), `soma do resumo${blocos.length > 1 ? ` do lote ${bl.lote}` : ''} ≠ total`);
    }
    const cabs = blocos.map(bl => num(bl.total?.[1])), kgs = blocos.map(bl => num(bl.total?.[2])), brutos = blocos.map(bl => num(bl.total?.[3]));
    const soma = (xs: (number | undefined)[]) => (xs.some(x => x == null) ? undefined : somaCent(xs.map(x => x ?? 0)) / 100);
    /* As linhas do fecho: "OC: N - <texto> | valor", ate' o total de cada secao. */
    const iDesp = linhas.findIndex(c => c[0] === 'Total Despesas');
    const iCred = linhas.findIndex(c => c[0] === 'Total Créditos');
    const iIniAc = linhas.findIndex(c => (c[0] ?? '').startsWith('Acertos no Pagamento'));
    const linhaOC = (c: string[]) => /^OC: \d+ - /.test(c[0] ?? '') && c.length >= 2;
    const despLinhas = iIniAc >= 0 && iDesp > iIniAc ? linhas.slice(iIniAc + 1, iDesp).filter(linhaOC) : [];
    const credLinhas = iCred > iDesp && iDesp >= 0 ? linhas.slice(iDesp + 1, iCred).filter(linhaOC) : [];
    const despesas = num(linhas[iDesp]?.[1]);
    const creditos = iCred >= 0 ? num(linhas[iCred]?.[1]) : 0;
    const totalGeral = num(linhaQueComeca(t, 'Total Geral')?.[1]);
    const valorProduto = num(re1(t.corrido, /VALOR TOTAL DO PRODUTO R\$ ([\d.]+,\d{2})/));
    if (despesas == null) return { ok: false, motivo: 'incompleto', detalhe: 'Total Despesas' };
    if (creditos == null) return { ok: false, motivo: 'incompleto', detalhe: 'Total Créditos' };
    const bruto = soma(brutos), cab = soma(cabs), pesoKg = soma(kgs);
    if (despLinhas.length) conferir(somaCent(despLinhas.map(c => num(c[c.length - 1]) ?? 0)), centavos(despesas), 'despesas ≠ Total Despesas');
    conferir(somaCent(credLinhas.map(c => num(c[c.length - 1]) ?? 0)), centavos(creditos), 'créditos ≠ Total Créditos');
    if (bruto != null && valorProduto != null) conferir(centavos(bruto), centavos(valorProduto), 'soma dos lotes ≠ valor total do produto');
    if (bruto != null && totalGeral != null) conferir(centavos(bruto) - centavos(despesas) + centavos(creditos), centavos(totalGeral), 'bruto − despesas + créditos ≠ total geral');
    if (cab != null && !Number.isInteger(cab)) return { ok: false, motivo: 'nao_fecha', detalhe: 'cab não inteiro' };
    const unico = <T,>(xs: (T | undefined)[]) => { const u = [...new Set(xs.filter((x): x is T => x != null))]; return u.length === 1 && xs.every(x => x != null) ? u[0] : undefined; };
    const dataAbate = unico(blocos.map(bl => bl.data));
    const vencimento = unico(blocos.map(bl => bl.venc));
    const varios = blocos.length > 1;
    const campos: CamposLidos = {
      ordemCompra: blocos.map(bl => bl.ordem).join(' · '),
      loteFrigorifico: blocos.every(bl => bl.lote) ? blocos.map(bl => bl.lote).join(' · ') : undefined,
      dataAbate, vencimento, cab, pesoKg, bruto,
      precoArroba: !varios ? (blocos[0].prods.length === 1 ? num(blocos[0].prods[0][3]) : undefined)
        : bruto != null && pesoKg ? Math.round((bruto / (pesoKg / 15)) * 100) / 100 : undefined,
      liquido: totalGeral,
      incentivos: credLinhas.length
        ? credLinhas.map(c => ({ descricao: (c[0] ?? '').replace(/^OC: \d+ - /, '').trim(), valor: num(c[c.length - 1]) ?? 0 })) : undefined,
    };
    const dados: Record<string, unknown> = {};
    if (varios) dados.lotes_frigorifico = blocos.map((bl, i) => ({ lote: bl.lote, ordem_compra: bl.ordem, cab: cabs[i], kg: kgs[i], bruto: brutos[i] }));
    const dispensados: (keyof CamposLidos)[] = [];
    if (dataAbate == null && blocos.some(bl => bl.data)) { avisos.push('data do abate diferente entre os lotes: preencha'); dispensados.push('dataAbate'); }
    if (vencimento == null && blocos.some(bl => bl.venc)) avisos.push('vencimento diferente entre os lotes: preencha');
    if (creditos > 0) avisos.push(fraseDoIncentivo(creditos));
    return { ok: true, campos, dados, avisos, notas, dispensados };
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

/* ── 7f · SAIDA DA FAZENDA (OC-DOC-SAIDA-FAZENDA-01) ─────────────────────────────────────────────────────────────────
   Mesmas regras do passo 4: ancoras fixas, tudo ou nada e a conta interna do proprio PDF. Medidos nos PDFs reais da Vera (13/10):
   NFP-e de saida (SEFAZ-MS), e-GTA (IAGRO-MS), Declaracao do Produtor Modelo B e Carta de Garantia do Produtor. */

/** A GTA como o sistema a escreve: "Q-745856" (serie + numero). Aceita "Q- 745856", "745856/Q" e "Q 745856". */
export function gtaNormalizada(texto: string): string | null {
  const t = texto.replace(/\s+/g, ' ').trim();
  const a = t.match(/^([A-Z])\s*-?\s*(\d{4,})$/);
  if (a) return `${a[1]}-${a[2]}`;
  const b = t.match(/^(\d{4,})\s*\/\s*([A-Z])$/);
  return b ? `${b[2]}-${b[1]}` : null;
}
/** A celula logo abaixo de um rotulo, na MESMA coluna (cabecalho de grade do DANFE: rotulos numa linha, valores na seguinte). */
function abaixoNaColuna(t: Texto, rotulo: string, aPartirDe = 0): string | undefined {
  for (let i = aPartirDe; i < t.linhas.length - 1; i++) {
    const c = celulas(t.linhas[i]);
    const k = c.indexOf(rotulo);
    if (k >= 0) return celulas(t.linhas[i + 1])[k];
  }
  return undefined;
}

const NFPE_MS: Layout = {
  id: 'nfpe_ms', rotulo: 'NFP-e', frigorifico: null, grupo: 'nf_produtor', cnpjNoTexto: true,
  /* o titulo da NFP-e + uma chave com DV valido (a da SEFAZ-MS). */
  reconhece: t => temTodos(t, ['NOTA FISCAL DO PRODUTOR ELETRÔNICA - NFPe']) && acharChaveNFe(t.comQuebras) != null,
  obrigatorios: ['numero', 'dataEmissao', 'cab', 'valorNota'],
  ler: t => {
    const prods = produtosDaNf(t);
    const iDest = t.linhas.findIndex(l => l.trim() === 'DESTINATÁRIO');
    const dest = iDest >= 0 && t.linhas[iDest + 2] ? celulas(t.linhas[iDest + 2]) : [];
    const gta = t.corrido.match(/Nº GTA:\s*([A-Z])\s*-\s*\|?\s*(\d{4,})/);
    const total = num(abaixoNaColuna(t, 'VALOR TOTAL DA NOTA'));
    const campos: CamposLidos = {
      numero: depoisDe(t, 'Nº'), serie: depoisDe(t, 'SÉRIE:'), chaveAcesso: acharChaveNFe(t.comQuebras) ?? undefined,
      dataEmissao: data(abaixoNaColuna(t, 'DATA DE EMISSÃO')), dataSaida: data(abaixoNaColuna(t, 'DATA DE ENTRADA/SAÍDA')),
      destinatario: dest[0] ? [dest[0], dest[1]].filter(Boolean).join(' · ') : undefined,
      gtas: gta ? [`${gta[1]}-${gta[2]}`] : undefined, valorNota: total,
    };
    if (prods.length === 0 || prods.some(p => p.total == null || p.quant == null)) return { ok: false, motivo: 'incompleto', detalhe: 'produtos da nota' };
    const cab = prods.reduce((s, p) => s + (p.quant ?? 0), 0);
    if (!Number.isInteger(cab) || cab <= 0) return { ok: false, motivo: 'nao_fecha', detalhe: 'quantidade de cabeças não inteira' };
    campos.cab = cab;
    if (total != null && somaCent(prods.map(p => p.total ?? 0)) !== centavos(total))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'soma dos produtos ≠ total da nota' };
    if (prods.some(p => p.unit != null && p.quant != null && p.total != null && centavos(p.unit * p.quant) !== centavos(p.total)))
      return { ok: false, motivo: 'nao_fecha', detalhe: 'quantidade × valor unitário ≠ total do produto' };
    return { ok: true, campos };
  },
};

const EGTA_MS: Layout = {
  id: 'egta_ms', rotulo: 'e-GTA', frigorifico: null, grupo: 'gta', cnpjNoTexto: true,
  /* o titulo vem em celulas ("Guia de Trânsito Animal | ( | e-GTA | )"): as partes, mais o quadro Fêmea / Macho / Total. */
  reconhece: t => temTodos(t, ['Guia de Trânsito Animal', 'e-GTA', 'Fêmea | Macho | Total']),
  obrigatorios: ['serie', 'numero', 'dataEmissao', 'cab'],
  ler: t => {
    const linhas = t.linhas.map(celulas);
    const iCab = linhas.findIndex(c => c.includes('Série') && c.includes('Número'));
    const id = iCab >= 0 ? linhas[iCab + 1] ?? [] : [];
    const iFm = linhas.findIndex(c => c[0] === 'Fêmea' && c[1] === 'Macho' && c[2] === 'Total');
    const fm = iFm >= 0 ? linhas[iFm + 1] ?? [] : [];
    const estab = linhas.filter(c => c[0] === 'Estabelecimento:')[0] ?? [];
    const k2 = estab.lastIndexOf('Estabelecimento:');
    const femeas = num(fm[0]), machos = num(fm[1]), total = num(fm[2]);
    const campos: CamposLidos = {
      serie: id.length >= 2 ? id[id.length - 2] : undefined, numero: id.length >= 2 ? id[id.length - 1] : undefined,
      dataEmissao: data(depoisDe(t, 'Data:')), validade: data(depoisDe(t, 'Validade:')),
      embarque: data(re1(t.corrido, /Data\/Hora de Embarque:\s*(\d{2}\/\d{2}\/\d{4})/)),
      femeas, machos, cab: total, finalidade: depoisDe(t, 'FINALIDADE:'),
      destino: k2 > 0 ? estab[k2 + 1] : undefined,
    };
    if (femeas == null || machos == null || total == null) return { ok: false, motivo: 'incompleto', detalhe: 'Fêmea / Macho / Total' };
    if (femeas + machos !== total || !Number.isInteger(total) || total <= 0) return { ok: false, motivo: 'nao_fecha', detalhe: 'fêmeas + machos ≠ total' };
    return { ok: true, campos };
  },
};

/** As GTAs de um trecho ("745856/Q ,745874/Q", "745856/Q e 745874/Q"), normalizadas; nulo se alguma nao for GTA. */
function gtasDoTexto(trecho: string | undefined): string[] | null {
  if (!trecho) return null;
  const partes = trecho.split(/\s*(?:,|\be\b)\s*/).map(x => x.trim()).filter(Boolean);
  const l = partes.map(gtaNormalizada);
  return l.length && l.every(x => x != null) ? l.filter((x): x is string => x != null) : null;
}

const MODELO_B: Layout = {
  id: 'modelo_b', rotulo: 'Modelo B', frigorifico: null, grupo: 'declaracao', cnpjNoTexto: true,
  reconhece: t => temTodos(t, ['Declaração do Produtor', 'Modelo B']),
  obrigatorios: ['numero', 'dataEmissao'],
  ler: t => {
    const gtas = gtasDoTexto(re1(t.corrido, /GTA\(s\) série e número\s+(.+?)\s+constantes/));
    const campos: CamposLidos = {
      tipoDeclaracao: 'modelo_b', numero: re1(t.corrido, /Documento No\.\s*(\d+)/),
      dataEmissao: data(re1(t.corrido, /Data e Hora de Emissão:\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/)),
      gtas: gtas ?? undefined,
    };
    if (re1(t.corrido, /GTA\(s\) série e número\s+(.+?)\s+constantes/) && !gtas) return { ok: false, motivo: 'incompleto', detalhe: 'as GTAs citadas' };
    return { ok: true, campos };
  },
};

const CARTA_GARANTIA: Layout = {
  id: 'carta_garantia', rotulo: 'Carta de garantia', frigorifico: null, grupo: 'declaracao', cnpjNoTexto: true,
  reconhece: t => temTodos(t, ['Carta de Garantia do Produtor']),
  obrigatorios: ['dataEmissao', 'cab'],
  ler: t => {
    const gtas = gtasDoTexto(re1(t.corrido, /GTA\(s\) Nº:\s*(.+?)\./));
    const cab = num(re1(t.corrido, /destinados\s+(\d+)\s+animais/));
    const campos: CamposLidos = {
      tipoDeclaracao: 'carta_garantia', dataEmissao: data(re1(t.corrido, /Data Embarque:\s*(\d{2}\/\d{2}\/\d{4})/)),
      cab, gtas: gtas ?? undefined,
    };
    if (cab != null && (!Number.isInteger(cab) || cab <= 0)) return { ok: false, motivo: 'nao_fecha', detalhe: 'cab não inteiro' };
    return { ok: true, campos };
  },
};

export const LAYOUTS_DO_ABATE: readonly Layout[] = [NF_MINERVA, NF_JBS, ACERTO_MINERVA, ACERTO_JBS, ROMANEIO_MINERVA, ROMANEIO_JBS,
  NFPE_MS, EGTA_MS, MODELO_B, CARTA_GARANTIA];

/* ── A LEITURA ────────────────────────────────────────────────────────────────────────────── */
const ROTULO_DO_GRUPO: Record<GrupoDoc, string> = { nf: 'NF', acerto: 'Acerto', romaneio: 'Romaneio', nf_produtor: 'NF produtor', gta: 'GTA', declaracao: 'Declaração' };
/** P85 (a) — a especie em que cada grupo se le^ (a tela troca para ela quando o PDF e' de outra especie). */
const ESPECIE_DO_GRUPO: Record<GrupoDoc, EspecieDoc> = { nf: 'nf_principal', acerto: 'acerto', romaneio: 'romaneio', nf_produtor: 'nf_produtor', gta: 'gta', declaracao: 'declaracao' };
/** "52168923000231" -> "52.168.923/0002-31" (o que nao tem 14 digitos fica como veio). */
const cnpjComMascara = (c: string) => { const d = digitos(c); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c; };
export const grupoDaEspecie = (e: EspecieDoc): GrupoDoc | null =>
  (e === 'nf_principal' || e === 'nf_complementar' ? 'nf'
    : e === 'acerto' || e === 'romaneio' || e === 'nf_produtor' || e === 'gta' || e === 'declaracao' ? e : null);

const ROTULO_DO_CAMPO: Partial<Record<keyof CamposLidos, string>> = {
  chaveAcesso: 'a chave de acesso', dataEmissao: 'a emissão', cab: 'a quantidade de cabeças', pesoKg: 'o peso', bruto: 'o valor bruto',
  funrural: 'o Funrural', ordemCompra: 'a ordem de compra / pedido', dataAbate: 'a data do abate', liquido: 'o líquido',
  numero: 'o número', serie: 'a série', valorNota: 'o valor da nota',
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
  /* P85 (c) — o que a tela MOSTRA e' a especie e o frigorifico LIDO do PDF (razao social e CNPJ), nunca o nome do layout ("Minerva" e' o
     molde do PDF, nao o frigorifico); sem o frigorifico no texto, "Romaneio (frigorífico da OC)". Os da saida da fazenda: o de sempre. */
  const frig = L.frigorificoDoTexto?.(t) ?? null;
  const rotulo = L.frigorifico == null ? L.rotulo
    : `${ROTULO_DO_GRUPO[L.grupo]}${frig && (frig.nome || frig.cnpj) ? ` · ${[frig.nome, frig.cnpj ? cnpjComMascara(frig.cnpj) : null].filter(Boolean).join(' ')}` : ' (frigorífico da OC)'}`;
  const grupo = grupoDaEspecie(ctx.especie);
  if (grupo !== L.grupo)
    return { tipo: 'nao_lido', motivo: 'especie_trocada', frase: `Este PDF é ${rotulo}; a espécie escolhida é ${grupo ? ROTULO_DO_GRUPO[grupo] : 'outra'}`,
      especieSugerida: ESPECIE_DO_GRUPO[L.grupo] };
  if (!L.cnpjNoTexto && L.frigorifico && !daLista(L.frigorifico, ctx.cnpjContraparte ? digitos(ctx.cnpjContraparte) : null))
    return { tipo: 'nao_lido', motivo: 'contraparte', frase: `${rotulo}, mas a contraparte da operação não é desse frigorífico: arquivo anexado, preencha os campos` };
  const r = L.ler(t);
  /* `=== false`: com `strict: false` o `!r.ok` nao estreita a uniao. */
  if (r.ok === false) {
    return r.motivo === 'incompleto'
      ? { tipo: 'nao_lido', motivo: 'incompleto', frase: `${rotulo} reconhecido, mas falta ${r.detalhe} no PDF · nada preenchido` }
      : { tipo: 'nao_lido', motivo: 'nao_fecha', frase: `${rotulo} reconhecido, mas a conta do PDF não fecha (${r.detalhe}) · nada preenchido` };
  }
  if (r.ok !== true) return { tipo: 'nao_lido', motivo: 'incompleto', frase: FRASE_NAO_RECONHECIDO };
  const lido = r;
  const falta = L.obrigatorios.find(k => !(lido.dispensados ?? []).includes(k) && (lido.campos[k] == null || lido.campos[k] === ''));
  if (falta) return { tipo: 'nao_lido', motivo: 'incompleto', frase: `${rotulo} reconhecido, mas falta ${ROTULO_DO_CAMPO[falta] ?? falta} no PDF · nada preenchido` };
  /* P85 (c) — o frigorifico do PDF NAO e' o da OC: avisa (a leitura vale; quem decide e' o operador) */
  const outro = frig?.cnpj && ctx.cnpjContraparte && digitos(frig.cnpj) !== digitos(ctx.cnpjContraparte)
    ? [`o frigorífico do PDF (${cnpjComMascara(frig.cnpj)}) não é o da OC (${cnpjComMascara(ctx.cnpjContraparte)}) · confira`] : [];
  return { tipo: 'lido', layout: L.id, rotulo, grupo: L.grupo, campos: lido.campos, dados: lido.dados ?? {}, avisos: [...outro, ...(lido.avisos ?? [])],
    notas: lido.notas ?? [], frigorifico: frig };
}
