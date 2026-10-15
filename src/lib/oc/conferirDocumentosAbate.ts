/* OC-DOC-ESPECIE-ABATE-01 passo 3 — A CONFERENCIA ENTRE OS DOCUMENTOS DO ABATE. Pura, so' leitura: a tela so' desenha o resultado.
   Compara os TOTAIS da OC por especie (NF = principal + complementares):
     1. Bruto:   NF = Acerto
     2. Liquido: NF = Acerto = NPR
     3. Cab:     NF = Acerto = Romaneio
     4. Peso kg: NF = Acerto = Romaneio
   ⚠ SEM TOLERANCIA: valores em centavos, cab inteiro, kg com 2 casas; qualquer diferenca ≠ 0 e' divergencia.
   ⚠ VAZIO NUNCA E' "CONFERE" (regra das sentinelas do CLAUDE.md): o valor de um documento e' vazio quando ele NAO TEM COMPONENTE
     (R$ 0 digitado e' dado); cab e kg sao vazios quando a coluna e' nula. Item sem dois lados com dado fica "não conferido".
   ⚠ TRES ESTADOS, nunca confundidos: CINZA (nenhum item comparado), VERDE (ao menos um comparado e todos bateram), VERMELHO
     (algum comparado diverge). Documento cancelado fica fora. A especie que nao existe na OC e' "falta", em cinza, e nao e' erro. */
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import { formatCasas } from '@/lib/calculos/numeroBR';

/** O que a conferencia le de cada documento (a view ja' entrega tudo). */
export interface DocConferencia {
  documentoId: string;
  especie: EspecieDoc;
  cancelado: boolean;
  qtdComponentes: number;
  totalAcrescimos: number;
  totalRetencoesSemCaixa: number;
  liquidoProprio?: number;
  valorLiquido: number;
  cab?: number | null;
  pesoKg?: number | null;
  /* 7f — para a conferencia da saida da fazenda (NF produtor citada, GTA citada). */
  numero?: string | null;
  serie?: string | null;
  dados?: Record<string, unknown> | null;
}

export type GrupoConferencia = 'nf' | 'acerto' | 'npr' | 'romaneio';
export type ItemConferencia = 'bruto' | 'liquido' | 'cab' | 'kg';
export type EstadoConferencia = 'neutro' | 'verde' | 'vermelho';

export const ROTULO_GRUPO: Record<GrupoConferencia, string> = { nf: 'NF', acerto: 'Acerto', npr: 'NPR', romaneio: 'Romaneio' };
export const ROTULO_ITEM: Record<ItemConferencia, string> = { bruto: 'Bruto', liquido: 'Líquido', cab: 'Cab', kg: 'Peso' };
const ORDEM_GRUPOS: GrupoConferencia[] = ['nf', 'acerto', 'npr', 'romaneio'];
/** Quais especies entram em cada item. */
const GRUPOS_DO_ITEM: Record<ItemConferencia, GrupoConferencia[]> = {
  bruto: ['nf', 'acerto'], liquido: ['nf', 'acerto', 'npr'], cab: ['nf', 'acerto', 'romaneio'], kg: ['nf', 'acerto', 'romaneio'],
};
const ITENS: ItemConferencia[] = ['bruto', 'liquido', 'cab', 'kg'];

export function grupoDaEspecie(e: EspecieDoc): GrupoConferencia | null {
  if (e === 'nf_principal' || e === 'nf_complementar') return 'nf';
  if (e === 'acerto' || e === 'npr' || e === 'romaneio') return e;
  return null;
}

/* Unidade inteira de cada item: centavos, cabecas, centesimos de kg. */
const inteiro = (item: ItemConferencia, v: number) => (item === 'cab' ? Math.round(v) : Math.round(v * 100));
const deInteiro = (item: ItemConferencia, n: number) => (item === 'cab' ? n : n / 100);

/** O numero do item, escrito: valores com 2 casas; cab inteiro; kg sem casas quando inteiro. */
export function escreverItem(item: ItemConferencia, v: number): string {
  if (item === 'cab') return formatCasas(v, 0);
  if (item === 'kg') return Number.isInteger(v) ? formatCasas(v, 0) : formatCasas(v, 2);
  return formatCasas(v, 2);
}

export interface LadoItem { grupo: GrupoConferencia; valor: number; }
export interface ResultadoItem {
  item: ItemConferencia;
  /** Os grupos presentes na OC com dado neste item, na ordem NF, Acerto, NPR, Romaneio. */
  lados: LadoItem[];
  comparado: boolean;
  /** Pares que divergem, sempre contra o primeiro lado. */
  divergencias: { a: LadoItem; b: LadoItem; diferenca: number }[];
}

export interface ResultadoConferencia {
  estado: EstadoConferencia;
  itens: ResultadoItem[];
  /** Grupos presentes na OC. */
  presentes: GrupoConferencia[];
  /** Grupos que nao existem na OC (dos quatro). */
  faltam: GrupoConferencia[];
  /** Grupos presentes sem dado em NENHUM item. */
  semValores: GrupoConferencia[];
  /** Itens que nao tiveram dois lados com dado. */
  naoConferidos: ItemConferencia[];
  /** Retencoes da NF (informativo na frase verde), quando a NF tem valor. */
  retencoesNF: number | null;
  /** Os textos das divergencias, na ordem dos itens. */
  textosDivergencia: string[];
  /** 7f — a saida da fazenda. */
  saida: ConferenciaSaida;
}

/* ── 7f · SAIDA DA FAZENDA ────────────────────────────────────────────────────────────────────────────────────────────
   GTA: a soma das cabecas das GTAs = as cabecas da OC (soma dos lotes). NF produtor: as NFs citadas na NF do frigorifico
   (`dados.nfs_produtor`) estao todas registradas como NF produtor. Vazio nunca vira "confere": sem GTA com cab, ou sem as
   cabecas da OC, a GTA nao e' conferida; sem NF do frigorifico citando NFs, a NF produtor nao e' conferida. */
export interface ConferenciaSaida {
  gta: { cabs: number[]; total: number; cabOC: number; confere: boolean } | null;
  nfProdutor: { citadas: string[]; registradas: string[]; faltam: string[] } | null;
  /** As GTAs registradas, normalizadas ("Q-745856"). */
  gtasRegistradas: string[];
}
/** Numero de nota so' com digitos e sem zero a' esquerda ("009.444.790" = "9444790"). */
export const numeroDeNota = (s: unknown): string => (typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\D/g, '').replace(/^0+/, '') : '');
/** A GTA de um documento GTA: serie + numero ("Q-745856"). */
export const gtaDoDocumento = (d: Pick<DocConferencia, 'serie' | 'numero'>): string | null => {
  const n = (d.numero ?? '').replace(/\D/g, '').replace(/^0+/, ''); const sr = (d.serie ?? '').trim().toUpperCase();
  return n && sr ? `${sr}-${n}` : null;
};
/** "Q-745856", "Q- 745856", "745856/Q" -> "Q-745856". */
export function gtaCanonica(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim().toUpperCase();
  const a = t.match(/^([A-Z])\s*-?\s*(\d{4,})$/); if (a) return `${a[1]}-${a[2].replace(/^0+/, '')}`;
  const b = t.match(/^(\d{4,})\s*\/\s*([A-Z])$/); return b ? `${b[2]}-${b[1].replace(/^0+/, '')}` : null;
}
function conferirSaida(docs: DocConferencia[], cabDaOC: number | null | undefined): ConferenciaSaida {
  const vivos = docs.filter(d => !d.cancelado);
  const gtas = vivos.filter(d => d.especie === 'gta');
  const cabs = gtas.map(d => d.cab).filter((x): x is number => x != null).map(Number);
  const gta = cabs.length && cabs.length === gtas.length && cabDaOC != null
    ? { cabs, total: cabs.reduce((a, b) => a + b, 0), cabOC: cabDaOC, confere: cabs.reduce((a, b) => a + b, 0) === cabDaOC }
    : null;
  const nfsFrig = vivos.filter(d => d.especie === 'nf_principal' || d.especie === 'nf_complementar');
  const citadas = [...new Set(nfsFrig.flatMap(d => {
    const l = d.dados?.nfs_produtor;
    return Array.isArray(l) ? l.map(x => numeroDeNota(x != null && typeof x === 'object' && 'numero' in x ? x.numero : '')).filter(Boolean) : [];
  }))];
  const registradas = vivos.filter(d => d.especie === 'nf_produtor').map(d => numeroDeNota(d.numero)).filter(Boolean);
  const nfProdutor = citadas.length ? { citadas, registradas, faltam: citadas.filter(n => !registradas.includes(n)) } : null;
  const gtasRegistradas = gtas.map(gtaDoDocumento).filter((x): x is string => x != null);
  return { gta, nfProdutor, gtasRegistradas };
}
/** As partes da faixa da saida: verde ("GTA 18 + 18 = 36 cab", "NF produtor 2 de 2"), vermelha (GTA ≠ OC) e o que falta. */
export function partesDaSaida(s: ConferenciaSaida): { verde: string[]; verdeCurto: string[]; vermelho: string[]; falta: string[] } {
  const verde: string[] = []; const verdeCurto: string[] = []; const vermelho: string[] = []; const falta: string[] = [];
  if (s.gta) {
    const conta = `GTA ${s.gta.cabs.map(c => formatCasas(c, 0)).join(' + ')}`;
    if (s.gta.confere) { verde.push(`${conta} = ${formatCasas(s.gta.total, 0)} cab`); verdeCurto.push(`GTA ${formatCasas(s.gta.total, 0)} cab`); }
    else vermelho.push(`${conta} = ${formatCasas(s.gta.total, 0)} ≠ ${formatCasas(s.gta.cabOC, 0)} cab da OC`);
  }
  if (s.nfProdutor) {
    const n = s.nfProdutor.citadas.length - s.nfProdutor.faltam.length;
    if (s.nfProdutor.faltam.length === 0) {
      verde.push(`NF produtor ${n} de ${s.nfProdutor.citadas.length}`); verdeCurto.push(`NF prod. ${n}/${s.nfProdutor.citadas.length}`);
    }
    else falta.push(`falta NF produtor ${s.nfProdutor.faltam.join(', ')}`);
  }
  return { verde, verdeCurto, vermelho, falta };
}

type Medida = Record<ItemConferencia, number | null>;

/** Os totais de cada grupo presente; `null` = vazio naquele item. */
function totaisPorGrupo(docs: DocConferencia[]): Map<GrupoConferencia, Medida & { retencoes: number | null }> {
  const m = new Map<GrupoConferencia, Medida & { retencoes: number | null }>();
  const somar = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
  for (const d of docs) {
    if (d.cancelado) continue;
    const g = grupoDaEspecie(d.especie);
    if (!g) continue;
    const atual = m.get(g) ?? { bruto: null, liquido: null, cab: null, kg: null, retencoes: null };
    const temValor = d.qtdComponentes > 0;
    m.set(g, {
      bruto: somar(atual.bruto, temValor ? Number(d.totalAcrescimos) : null),
      liquido: somar(atual.liquido, temValor ? Number(d.liquidoProprio ?? d.valorLiquido) : null),
      retencoes: somar(atual.retencoes, temValor ? Number(d.totalRetencoesSemCaixa) : null),
      cab: somar(atual.cab, d.cab == null ? null : Number(d.cab)),
      kg: somar(atual.kg, d.pesoKg == null ? null : Number(d.pesoKg)),
    });
  }
  return m;
}

export function textoDivergencia(item: ItemConferencia, a: LadoItem, b: LadoItem, diferenca: number): string {
  const un = item === 'cab' ? ' cab' : item === 'kg' ? ' kg' : '';
  return `${ROTULO_ITEM[item]} ${ROTULO_GRUPO[a.grupo]} ${escreverItem(item, a.valor)} ≠ ${ROTULO_GRUPO[b.grupo]} `
    + `${escreverItem(item, b.valor)} · diferença ${escreverItem(item, diferenca)}${un}`;
}

export function conferirDocumentosAbate(docs: DocConferencia[], opcoes: { cabDaOC?: number | null } = {}): ResultadoConferencia {
  const totais = totaisPorGrupo(docs);
  const presentes = ORDEM_GRUPOS.filter(g => totais.has(g));
  const faltam = ORDEM_GRUPOS.filter(g => !totais.has(g));
  const itens: ResultadoItem[] = ITENS.map(item => {
    const lados: LadoItem[] = GRUPOS_DO_ITEM[item]
      .filter(g => totais.has(g) && totais.get(g)![item] != null)
      .map(g => ({ grupo: g, valor: totais.get(g)![item]! }));
    const comparado = lados.length >= 2;
    const divergencias = comparado
      ? lados.slice(1)
        .map(b => ({ a: lados[0], b, n: inteiro(item, lados[0].valor) - inteiro(item, b.valor) }))
        .filter(x => x.n !== 0)
        .map(x => ({ a: x.a, b: x.b, diferenca: Math.abs(deInteiro(item, x.n)) }))
      : [];
    return { item, lados, comparado, divergencias };
  });
  const semValores = presentes.filter(g => ITENS.every(i => totais.get(g)![i] == null));
  const naoConferidos = itens.filter(i => !i.comparado).map(i => i.item);
  const textosDivergencia = itens.flatMap(i => i.divergencias.map(d => textoDivergencia(i.item, d.a, d.b, d.diferenca)));
  const algumComparado = itens.some(i => i.comparado);
  const saida = conferirSaida(docs, opcoes.cabDaOC);
  const ps = partesDaSaida(saida);
  const estado: EstadoConferencia = textosDivergencia.length > 0 || ps.vermelho.length > 0 ? 'vermelho'
    : algumComparado || ps.verde.length > 0 ? 'verde' : 'neutro';
  return {
    estado, itens, presentes, faltam, semValores, naoConferidos,
    retencoesNF: totais.get('nf')?.retencoes ?? null, textosDivergencia, saida,
  };
}

/* ── O QUE A TELA ESCREVE ──────────────────────────────────────────────────────────────────────────────────────── */

/** "A, B e C". */
export const juntar = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

export interface FaixaConferencia {
  estado: EstadoConferencia;
  /** O texto principal (uma linha). */
  texto: string;
  /** "falta: NPR, Romaneio" — cinza, no fim; nulo sem falta. */
  falta: string | null;
  /** O texto inteiro, para o `title`. */
  titulo: string;
}

/** A faixa de 24px da lista do abate. */
export function faixaDaConferencia(r: ResultadoConferencia): FaixaConferencia {
  const ps = partesDaSaida(r.saida);
  const faltaPartes = [...(r.faltam.length ? [`falta: ${r.faltam.map(g => ROTULO_GRUPO[g]).join(', ')}`] : []), ...ps.falta];
  const falta = faltaPartes.length ? faltaPartes.join(' · ') : null;
  let texto: string;
  let titulo: string;
  const divergencias = [...r.textosDivergencia, ...ps.vermelho];
  if (r.estado === 'vermelho') {
    const mais = divergencias.length - 1;
    texto = `${divergencias[0]}${mais > 0 ? ` (+${mais})` : ''}`;
    titulo = divergencias.join('\n');
  } else if (r.estado === 'verde' && !r.itens.some(i => i.comparado)) {
    /* so' a saida da fazenda conferiu */
    texto = `✓ ${ps.verdeCurto.join(' · ')}`;
    titulo = `✓ ${ps.verde.join(' · ')}`;
  } else if (r.estado === 'verde') {
    /* 7f-fix1: TEXTO DO SISTEMA NAO CORTA. A faixa diz so' os numeros, curtos; quem bate com quem ("Bruto NF = Acerto",
       "GTA 18 + 18 = 36 cab", "NF produtor 2 de 2") vai inteiro no `title`. */
    const partes: string[] = ['✓ Confere']; const curtas: string[] = [];
    const it = (i: ItemConferencia) => r.itens.find(x => x.item === i)!;
    const dois = (txt: string, curto = txt) => { partes.push(txt); curtas.push(curto); };
    if (it('cab').comparado) dois(`${escreverItem('cab', it('cab').lados[0].valor)} cab`);
    if (it('kg').comparado) dois(`${escreverItem('kg', it('kg').lados[0].valor)} kg`);
    if (it('bruto').comparado) {
      dois(`Bruto ${it('bruto').lados.map(l => ROTULO_GRUPO[l.grupo]).join(' = ')} ${escreverItem('bruto', it('bruto').lados[0].valor)}`,
        `Bruto ${escreverItem('bruto', it('bruto').lados[0].valor)}`);
      if (r.retencoesNF != null) dois(`Retenções ${formatCasas(r.retencoesNF, 2)}`);
    }
    if (it('liquido').comparado) {
      dois(`Líquido ${it('liquido').lados.map(l => ROTULO_GRUPO[l.grupo]).join(' = ')} ${escreverItem('liquido', it('liquido').lados[0].valor)}`,
        `Líquido ${escreverItem('liquido', it('liquido').lados[0].valor)}`);
    }
    partes.push(...ps.verde); curtas.push(...ps.verdeCurto);
    if (r.naoConferidos.length) {
      partes.push(`não conferido: ${juntar(r.naoConferidos.map(i => ROTULO_ITEM[i]))}`);
      curtas.push(`não conf.: ${r.naoConferidos.map(i => ROTULO_ITEM[i].toLowerCase()).join(', ')}`);
    }
    texto = `✓ ${curtas.join(' · ')}`;
    titulo = partes.join(' · ');
  } else {
    texto = r.semValores.length
      ? `Nada a conferir · ${juntar(r.semValores.map(g => ROTULO_GRUPO[g]))} sem valores`
      : 'Nada a conferir';
    titulo = texto;
  }
  return { estado: r.estado, texto, falta, titulo: falta ? `${titulo}\n${falta}` : titulo };
}

export interface CelulaConferencia { texto: string; tom: 'verde' | 'vermelho' | 'neutro'; /** o texto inteiro, quando `texto` e' curto */ titulo?: string; }

/** A celula "Conferência" de um documento da lista. */
export function conferenciaDoDocumento(r: ResultadoConferencia, especie: EspecieDoc, cancelado = false,
  doc?: Pick<DocConferencia, 'numero' | 'serie' | 'dados'>): CelulaConferencia {
  if (cancelado) return { texto: '', tom: 'neutro' };
  /* 7f — a linha de cada NF produtor: citada na NF do frigorifico? e a GTA que ela cita esta' registrada? */
  if (especie === 'nf_produtor' && r.saida.nfProdutor) {
    const n = numeroDeNota(doc?.numero);
    const gta = typeof doc?.dados?.gta === 'string' ? gtaCanonica(doc.dados.gta) : null;
    const comGta = gta && r.saida.gtasRegistradas.includes(gta) ? ` · GTA ${gta}` : '';
    /* 7f-fix1: curto na celula ("✓ GTA Q-745856"); "citada na NF" vai no `title`. */
    return r.saida.nfProdutor.citadas.includes(n)
      ? { texto: gta && comGta ? `✓ GTA ${gta}` : '✓ citada', tom: 'verde', titulo: `citada na NF do frigorífico${comGta}` }
      : { texto: 'não citada', tom: 'neutro', titulo: 'não citada na NF do frigorífico' };
  }
  if (especie === 'gta' && r.saida.gta) {
    return r.saida.gta.confere ? { texto: `✓ soma ${formatCasas(r.saida.gta.total, 0)} cab = OC`, tom: 'verde' }
      : { texto: `≠ OC: ${formatCasas(r.saida.gta.total, 0)} de ${formatCasas(r.saida.gta.cabOC, 0)} cab`, tom: 'vermelho' };
  }
  const g = grupoDaEspecie(especie);
  if (g === 'nf') return { texto: 'soma no valor da OC', tom: 'neutro' };
  if (!g) return { texto: 'informativo · não soma', tom: 'neutro' };
  if (r.semValores.includes(g)) return { texto: 'sem valores', tom: 'neutro' };
  const meus = r.itens.filter(i => i.lados.some(l => l.grupo === g));
  const divergenciasMinhas = meus.flatMap(i => i.divergencias.filter(d => d.a.grupo === g || d.b.grupo === g).map(d => ({ i: i.item, d })));
  const comparadosMeus = meus.filter(i => i.comparado);
  if (g === 'acerto') {
    const comNF = divergenciasMinhas.filter(x => x.d.a.grupo === 'nf' || x.d.b.grupo === 'nf');
    if (comNF.length) {
      const x = comNF[0];
      return { texto: `≠ NF: ${ROTULO_ITEM[x.i].toLowerCase()} ${escreverItem(x.i, x.d.diferenca)}`, tom: 'vermelho' };
    }
    if (divergenciasMinhas.length) return { texto: `≠ ${ROTULO_GRUPO[outro(divergenciasMinhas[0].d, g)]}: ${ROTULO_ITEM[divergenciasMinhas[0].i].toLowerCase()} ${escreverItem(divergenciasMinhas[0].i, divergenciasMinhas[0].d.diferenca)}`, tom: 'vermelho' };
    if (comparadosMeus.some(i => i.lados.some(l => l.grupo === 'nf'))) return { texto: '✓ bate com a NF', tom: 'verde' };
    return { texto: 'não conferido', tom: 'neutro' };
  }
  if (g === 'npr') {
    const liq = r.itens.find(i => i.item === 'liquido')!;
    if (!liq.lados.some(l => l.grupo === 'npr')) return { texto: 'sem valores', tom: 'neutro' };
    if (!liq.comparado) return { texto: 'não conferido', tom: 'neutro' };
    const d = liq.divergencias.find(x => x.a.grupo === 'npr' || x.b.grupo === 'npr');
    return d ? { texto: `≠ líquido: ${escreverItem('liquido', d.diferenca)}`, tom: 'vermelho' } : { texto: '✓ = líquido', tom: 'verde' };
  }
  /* romaneio */
  if (divergenciasMinhas.length) {
    const x = divergenciasMinhas[0];
    return { texto: `≠ ${x.i === 'cab' ? 'cab' : 'kg'} ${escreverItem(x.i, x.d.diferenca)}`, tom: 'vermelho' };
  }
  if (!comparadosMeus.length) return { texto: 'não conferido', tom: 'neutro' };
  const cab = r.itens.find(i => i.item === 'cab')!.lados.find(l => l.grupo === 'romaneio')?.valor;
  const kg = r.itens.find(i => i.item === 'kg')!.lados.find(l => l.grupo === 'romaneio')?.valor;
  return cab && kg != null
    ? { texto: `✓ média ${formatCasas(kg / cab, 2)} kg`, tom: 'verde' }
    : { texto: '✓ bate', tom: 'verde' };
}

const outro = (d: { a: LadoItem; b: LadoItem }, g: GrupoConferencia) => (d.a.grupo === g ? d.b.grupo : d.a.grupo);

/**
 * A conferencia AO VIVO do formulario: o que esta' sendo digitado (o documento virtual `doc`) contra os documentos ja'
 * registrados da OC (sem o que esta' em edicao). So' os itens da especie em digitacao; nulo quando nada foi comparado.
 */
export function conferenciaAoVivo(registrados: DocConferencia[], doc: DocConferencia): CelulaConferencia | null {
  const g = grupoDaEspecie(doc.especie);
  if (!g) return null;
  const r = conferirDocumentosAbate([...registrados.filter(d => d.documentoId !== doc.documentoId), doc]);
  const partes: string[] = [];
  let diverge = false;
  for (const i of r.itens) {
    const meu = i.lados.find(l => l.grupo === g);
    if (!meu || !i.comparado) continue;
    for (const l of i.lados) {
      if (l.grupo === g) continue;
      const n = inteiro(i.item, meu.valor) - inteiro(i.item, l.valor);
      if (n === 0) partes.push(`${ROTULO_ITEM[i.item]} ${escreverItem(i.item, meu.valor)} = ${ROTULO_GRUPO[l.grupo]} ✓`);
      else {
        diverge = true;
        partes.push(textoDivergencia(i.item, meu, l, Math.abs(deInteiro(i.item, n))));
      }
    }
  }
  if (!partes.length) return null;
  return { texto: partes.join(' · '), tom: diverge ? 'vermelho' : 'verde' };
}
