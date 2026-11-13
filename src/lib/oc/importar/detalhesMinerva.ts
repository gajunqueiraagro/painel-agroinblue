/* IMPORTAR-ABATE-01 (F1) — O QUE O LEITOR DO ABATE (layoutsAbate) NAO DEVOLVE E A IMPORTACAO PRECISA, NOS PDFs DA MINERVA.
   ⚠ POR QUE AQUI E NAO NO `layoutsAbate`: os `campos`/`dados` de la' vao gravados no documento pelo formulario do Code 5
     (aplicarLeitura -> oc_documento_registrar) e os testes os comparam por igualdade; acrescentar chaves mudaria o que aquela tela grava.
     Este modulo so' LE (as mesmas linhas de `montarLinhas`); a NPR entra nos layouts comuns quando o Code 5 a quiser no formulario.
   O que le^:
   - ACERTO: as FAIXAS de preco do "Resumo de Abate" (uma linha = um lote da OC, regra do gabarito 5d255b74), a tabela de
     Classificacao (dentição × acabamento) e as despesas linha a linha (SENAR, Funrural, RAT, seguro) + "Funrural pela folha".
   - ROMANEIO: um animal por linha (Seq, as duas meias-carcacas, Sisbov, peso total, cronologia/dentição, acabamento).
   - NPR: numero "9019 / A", vencimento por extenso, valor, emissao e a NF de entrada referida. */
import { SEPARADOR_DE_CELULA } from '@/lib/oc/leitura/montarLinhas';
import { centavos, dataDoPdf, numeroDoPdf } from '@/lib/oc/leitura/numeroDoPdf';

const celulas = (l: string) => l.split(SEPARADOR_DE_CELULA).map(c => c.trim());
const num = (s: string | undefined) => (s == null ? undefined : numeroDoPdf(s) ?? undefined);
const digitos = (s: string) => s.replace(/\D/g, '');

/* ── ACERTO ───────────────────────────────────────────────────────────────────────────────── */
export interface FaixaDoAcerto { ordemCompra: string; lote: string; descricao: string; cab: number; kg: number; precoArroba: number; total: number }
/** `acabamento` nulo = o papel não diz (a carcaça desclassificada — Trat.Frio — vem sem acabamento: SM-LT06, Minerva José Bonifácio) */
export interface LinhaDaClassificacao { cab: number; maturidade: string; acabamento: string | null; precoArroba: number | null }
/** "Desclassificação": a carcaça que saiu da faixa normal e por quê (ex.: Trat.Frio · CISTICERCOSE · 461 A/B) */
export interface Desclassificacao { classificacao: string; motivo: string; carcaca: string }
export type TipoDeDespesa = 'senar' | 'funrural' | 'rat' | 'seguro' | 'outra';
export interface DespesaDoAcerto { tipo: TipoDeDespesa; descricao: string; valor: number }
/** IMPORTAR-ABATE-01 proposta A: o que vem DEPOIS de "Total Despesas" e soma no líquido (Fortunceres: "INCENTIVO PROAPE-PRECOCE/MS") */
export interface CreditoDoAcerto { descricao: string; valor: number }
/** O R$/@ da faixa por partes (Fortunceres: "Valor @ | R$ Idade | R$ Prog." = 385,25 + 5,00 + 5,7788); só quando todas as linhas dizem o mesmo */
export interface ComposicaoDoPreco { base: number; idade: number; programa: number }
export interface DetalhesDoAcerto {
  faixas: FaixaDoAcerto[]; classificacao: LinhaDaClassificacao[]; despesas: DespesaDoAcerto[]; desclassificacao: Desclassificacao[];
  creditos: CreditoDoAcerto[]; composicaoDoPreco: ComposicaoDoPreco | null;
  /** "A CONTRIBUICAO DO FUNRURAL SERA SOBRE A FOLHA DE PAGAMENTO" — o Funrural NAO e' retido (Lei 8.212, art. 25 §13) */
  funruralPelaFolha: boolean;
}

export const tipoDaDespesa = (texto: string): TipoDeDespesa => {
  const t = texto.toUpperCase();
  if (t.includes('SENAR')) return 'senar';
  if (t.includes('FUNRURAL') || /\bFUNR\b/.test(t)) return 'funrural';
  if (/\bRAT\b|GILRAT/.test(t)) return 'rat';
  if (t.includes('SEGURO')) return 'seguro';
  return 'outra';
};

/** As faixas, a classificacao e as despesas do acerto da Minerva. Nulo se nao houver nenhuma faixa (nao e' acerto Minerva). */
export function detalhesDoAcertoMinerva(linhas: readonly string[]): DetalhesDoAcerto | null {
  const cs = linhas.map(celulas);
  const faixas: FaixaDoAcerto[] = [];
  const classificacao: LinhaDaClassificacao[] = [];
  const despesas: DespesaDoAcerto[] = [];
  const desclassificacao: Desclassificacao[] = [];
  const creditos: CreditoDoAcerto[] = [];
  const composicoes: ComposicaoDoPreco[] = [];
  let comComposicao = false, depoisDasDespesas = false;
  let ordem = '', lote = '';
  let secao: 'nada' | 'resumo' | 'classif' | 'acertos' | 'desclassif' = 'nada';
  for (const c of cs) {
    const c0 = c[0] ?? '';
    const oc = c0.match(/^Ordem Compra - (\d+)/);
    if (oc) { ordem = oc[1]; secao = 'nada'; continue; }
    const lt = c0.match(/^Lote - (\d+)$/);
    if (lt) { lote = lt[1]; continue; }
    if (c0.startsWith('Resumo de Abate')) { secao = 'resumo'; continue; }
    if (c0 === 'TOTAL Animais') { secao = 'nada'; continue; }
    if (c0 === 'Classificação' && secao !== 'desclassif') { secao = 'classif'; comComposicao = c.includes('R$ Idade') && c.includes('R$ Prog.'); continue; }
    if (c0 === 'Desclassificação') { secao = 'desclassif'; continue; }
    if (secao === 'desclassif') {
      if (c.length === 3 && c0 !== 'Classificação') desclassificacao.push({ classificacao: c0, motivo: c[1], carcaca: c[2] });
      else if (c.length < 3 && c0 !== 'Classificação') secao = 'nada';
      continue;
    }
    if (c0.startsWith('Acertos no Pagamento')) { secao = 'acertos'; depoisDasDespesas = false; continue; }
    if (c0 === 'Total Despesas' || c0 === 'Total Créditos' || c0 === 'Total Geral') {
      if (c0 === 'Total Despesas') depoisDasDespesas = true; else secao = 'nada';
      continue;
    }
    if (secao === 'resumo' && c.length === 5) {
      const cab = num(c[1]), kg = num(c[2]), preco = num(c[3]), total = num(c[4]);
      if (cab != null && kg != null && preco != null && total != null)
        faixas.push({ ordemCompra: ordem, lote, descricao: c0.replace(/^\d+ - /, ''), cab, kg, precoArroba: preco, total });
      continue;
    }
    /* "Classificação | Cabeças | Peso Inicial | Peso Final | Maturidade | Acabamento | Valor @ [| R$ Idade]": a coluna "R$ Idade" vem em
       umas unidades e não em outras, e a carcaça desclassificada vem SEM acabamento — lê pela maturidade ("N Dentes"): o que vem depois
       dela é o acabamento se não for número, e o primeiro número é o Valor @ */
    if (secao === 'classif' && c.length >= 6) {
      /* a composição do preço: as 3 últimas células da linha (a coluna "Acabamento Angus" do cabeçalho vem em 2 células na linha) */
      if (comComposicao && num(c[1]) != null) {
        const [base, idade, programa] = c.slice(-3).map(num);
        if (base != null && idade != null && programa != null) composicoes.push({ base, idade, programa });
      }
      const cab = num(c[1]);
      const iMat = c.findIndex((x, i) => i >= 2 && /Dentes?$/.test(x));
      if (cab != null && iMat > 0) {
        const depois = c[iMat + 1];
        const semAcabamento = depois == null || num(depois) != null;
        classificacao.push({
          cab, maturidade: c[iMat], acabamento: semAcabamento ? null : depois,
          precoArroba: num(c[semAcabamento ? iMat + 1 : iMat + 2]) ?? null,
        });
      }
      continue;
    }
    if (secao === 'acertos' && /^OC: \d+ - /.test(c0) && c.length >= 2) {
      const descricao = c0.replace(/^OC: \d+ - /, '').trim();
      const valor = num(c[c.length - 1]);
      if (valor != null) {
        if (depoisDasDespesas) creditos.push({ descricao, valor });
        else despesas.push({ tipo: tipoDaDespesa(descricao), descricao, valor });
      }
    }
  }
  if (faixas.length === 0) return null;
  const corrido = linhas.join(' ').toUpperCase();
  const c0 = composicoes[0];
  const composicaoDoPreco = c0 && composicoes.every(x => x.base === c0.base && x.idade === c0.idade && x.programa === c0.programa) ? c0 : null;
  return { faixas, classificacao, despesas, desclassificacao, creditos, composicaoDoPreco, funruralPelaFolha: /FUNRURAL SERA SOBRE A FOLHA/.test(corrido) };
}

/* ── ROMANEIO ─────────────────────────────────────────────────────────────────────────────── */
/** `acabamento` nulo = o papel não diz (a carcaça desclassificada vem sem); `sisbov` nulo = a unidade não imprime o Sisbov */
export interface AnimalDoRomaneio { seq: number; pesoKg: number; acabamento: string | null; denticao: string; sisbov: string | null }
export interface DetalhesDoRomaneio { animais: AnimalDoRomaneio[]; porDenticao: { denticao: string; cab: number; kg: number }[]; porAcabamento: { acabamento: string | null; cab: number }[] }

/** Uma linha por animal: "Seq | meia1 Seq | meia1 kg | Destino | [Angus] | [Acabamento] | meia2 Seq | meia2 kg | Destino | [Sisbov] | Peso Total |
    Cronologia" — Angus, acabamento e Sisbov podem faltar (SM-LT06: sem Sisbov; a carcaça Trat.Frio sem acabamento). O acabamento é a célula
    de texto entre o 1º destino e a 2ª meia; o peso, a penúltima; a dentição, a última. */
export function detalhesDoRomaneioMinerva(linhas: readonly string[]): DetalhesDoRomaneio | null {
  const animais: AnimalDoRomaneio[] = [];
  for (const c of linhas.map(celulas)) {
    if (c.length < 9 || !/^\d+$/.test(c[0]) || !/Dentes?$/.test(c[c.length - 1])) continue;
    const peso = num(c[c.length - 2]);
    if (peso == null) continue;
    const sis = c.find(x => /^\d{14,15}$/.test(x)) ?? null;
    /* entre o 1º destino (c[3]) e a 2ª meia (o próximo número): o último texto que não é número nem "Angus"-sim/não é o acabamento */
    let acabamento: string | null = null;
    for (let i = 4; i < c.length - 2 && num(c[i]) == null; i++) acabamento = c[i];
    animais.push({ seq: Number(c[0]), pesoKg: peso, acabamento, denticao: c[c.length - 1], sisbov: sis });
  }
  if (animais.length === 0) return null;
  const porD = new Map<string, { cab: number; kgCent: number }>();
  const porA = new Map<string | null, number>();
  for (const a of animais) {
    const d = porD.get(a.denticao) ?? { cab: 0, kgCent: 0 };
    porD.set(a.denticao, { cab: d.cab + 1, kgCent: d.kgCent + centavos(a.pesoKg) });
    porA.set(a.acabamento, (porA.get(a.acabamento) ?? 0) + 1);
  }
  const ordemDente = (s: string) => Number(s.match(/\d+/)?.[0] ?? 99);
  return {
    animais,
    porDenticao: [...porD.entries()].sort((a, b) => ordemDente(a[0]) - ordemDente(b[0])).map(([denticao, v]) => ({ denticao, cab: v.cab, kg: v.kgCent / 100 })),
    porAcabamento: [...porA.entries()].sort((a, b) => b[1] - a[1]).map(([acabamento, cab]) => ({ acabamento, cab })),
  };
}

/* ── NPR ──────────────────────────────────────────────────────────────────────────────────── */
export interface NprLida { numero: string; vencimento: string; emissao: string | null; valor: number; nfReferida: string | null; emitenteCnpj: string | null }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "27 de Outubro de 2026" -> "2026-10-27" */
export function dataPorExtenso(s: string | undefined): string | null {
  const m = s?.match(/(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/);
  if (!m) return null;
  const mes = MESES.indexOf(m[2].toLowerCase());
  return mes < 0 ? null : `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function lerNprMinerva(linhas: readonly string[]): NprLida | null {
  const corrido = linhas.join(' ');
  if (!/NOTA PROMISS[ÓO]RIA RURAL/i.test(corrido)) return null;
  const cab = linhas.map(celulas).find(c => /^\d+ \/ [A-Z]$/.test(c[0] ?? ''));
  const numero = cab?.[0] ?? null;
  const vencimento = dataPorExtenso(cab?.find(x => x.startsWith('Vencimento:')));
  const valor = num(corrido.match(/R\$ ([\d.]+,\d{2})/)?.[1]);
  const emissao = dataPorExtenso(linhas.find(l => /^[A-ZÇÃÕÉÍ ]+, \d{1,2} de /.test(l)));
  const nf = corrido.match(/NOTA FISCAL DE ENTRADA N\.?\s*(\d+)/i)?.[1] ?? null;
  const cnpj = corrido.match(/CNPJ\.?:\s*([\d./-]{14,18})/)?.[1];
  if (!numero || !vencimento || valor == null) return null;
  return { numero, vencimento, emissao, valor, nfReferida: nf, emitenteCnpj: cnpj ? digitos(cnpj) : null };
}
