/**
 * FOLHA-VERA-PACOTE-01 F3 (parte pura) — o PACOTE DA FOLHA de um empregador numa competência: os relatórios analíticos (um por
 * estabelecimento/fazenda) + a Relação de Trabalhadores do FGTS + a GFD + o DARF + o recibo da DCTFWeb. Daqui sai a CONFERÊNCIA (o que
 * confere, o que difere, o que falta) e, por estabelecimento, o FGTS, o INSS e o IRRF que viram lançamento (a RPC do F3 grava).
 * PURO. ⚠ Nada aqui grava nem decide fazenda: o estabelecimento é o CAEPF da relação; o banco acha a fazenda dele.
 *
 * As regras (decisões do Gabriel, 27/11):
 * - O analítico se liga ao estabelecimento PELOS CÓDIGOS dos funcionários (a matrícula "<empresa>-<código>" da relação), nunca pelo nome.
 * - D3 (a): o pacote incompleto aplica o resto; o que falta vira pendência — "falta a folha de <matrícula>" (está na guia do FGTS, não está
 *   em nenhum analítico) e "falta a guia …" (documento que não veio).
 * - D2 (a): os TERCEIROS do DARF (Salário-Educação + INCRA) entram no INSS de cada estabelecimento, rateados pela BASE DO FGTS dele; o
 *   último estabelecimento leva os centavos (a soma fecha com o DARF ao centavo).
 * - O FGTS de cada estabelecimento é o da RELAÇÃO (o que a guia cobra; o FGTS Digital arredonda por trabalhador e difere do analítico em
 *   centavos), o INSS dos segurados e o IRRF são os das pessoas do analítico dele.
 */
import type { FolhaAnaliticaLida } from './lerFolhaAnalitica';
import type { DarfLido, DctfwebLida, GfdLida, RelacaoFgtsLida } from './lerGuiasDaFolha';

export interface DocumentosDoPacote {
  analiticas: FolhaAnaliticaLida[];
  relacao: RelacaoFgtsLida | null;
  gfd: GfdLida | null;
  darf: DarfLido | null;
  dctfweb: DctfwebLida | null;
}
export type Situacao = 'confere' | 'difere' | 'falta';
export interface ConferenciaDoPacote { chave: string; rotulo: string; situacao: Situacao; frase: string }
export interface PorEstabelecimento {
  caepf: string;
  /** o nome no cabeçalho do analítico ligado (null = nenhum analítico deste estabelecimento) */
  empresa: string | null;
  funcionarios: number;
  liquido: number;
  fgts: number;
  baseFgts: number;
  inssSegurados: number;
  terceiros: number;
  irrf: number;
}
export interface PendenciaDoPacote { tipo: 'falta_folha' | 'falta_documento' | 'sem_estabelecimento'; frase: string }
export interface PacoteConferido {
  competencia: string;
  conferencias: ConferenciaDoPacote[];
  estabelecimentos: PorEstabelecimento[];
  pendencias: PendenciaDoPacote[];
  /** tudo confere e nada falta: o pacote pode ir sem olhar (F5) */
  limpo: boolean;
}
export type LeituraDoPacote = { ok: true; pacote: PacoteConferido } | { ok: false; frase: string };

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const competenciaBR = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const somaC = <T>(xs: readonly T[], f: (x: T) => number) => xs.reduce((s, x) => s + centavos(f(x)), 0);

function comparar(chave: string, rotulo: string, a: number | null, b: number | null, nomeA: string, nomeB: string): ConferenciaDoPacote {
  if (a === null || b === null) return { chave, rotulo, situacao: 'falta', frase: `Sem ${a === null ? nomeA : nomeB} para comparar.` };
  return centavos(a) === centavos(b)
    ? { chave, rotulo, situacao: 'confere', frase: `${nomeA} e ${nomeB}: ${brl(a)}.` }
    : { chave, rotulo, situacao: 'difere', frase: `${nomeA} ${brl(a)} × ${nomeB} ${brl(b)} (diferença ${brl(reais(centavos(a) - centavos(b)))}).` };
}

/** Os terceiros rateados pela base do FGTS (D2): o último leva os centavos. */
export function ratearPelaBase(total: number, bases: readonly number[]): number[] {
  const soma = bases.reduce((s, b) => s + centavos(b), 0);
  if (soma === 0) return bases.map((_, i) => (i === bases.length - 1 ? total : 0));
  const partes = bases.map((b) => Math.round((centavos(total) * centavos(b)) / soma));
  partes[partes.length - 1] = centavos(total) - partes.slice(0, -1).reduce((s, x) => s + x, 0);
  return partes.map(reais);
}

export function conferirPacote(d: DocumentosDoPacote): LeituraDoPacote {
  const comps = [...d.analiticas.map((a) => a.competencia), d.relacao?.competencia, d.gfd?.competencia, d.darf?.periodo, d.dctfweb?.periodo]
    .filter((c): c is string => !!c);
  if (!comps.length) return { ok: false, frase: 'O pacote está vazio.' };
  if (new Set(comps).size > 1) return { ok: false, frase: `Os documentos são de competências diferentes (${[...new Set(comps)].map(competenciaBR).join(', ')}).` };
  const competencia = comps[0];
  const conferencias: ConferenciaDoPacote[] = [];
  const pendencias: PendenciaDoPacote[] = [];
  const faltaDoc = (nome: string) => pendencias.push({ tipo: 'falta_documento', frase: `Falta ${nome} de ${competenciaBR(competencia)}.` });
  if (!d.analiticas.length) faltaDoc('o relatório analítico da folha');
  if (!d.relacao) faltaDoc('a relação de trabalhadores do FGTS');
  if (!d.gfd) faltaDoc('a guia do FGTS (GFD)');
  if (!d.darf) faltaDoc('o DARF');
  if (!d.dctfweb) faltaDoc('o recibo da DCTFWeb');

  /* cada documento confere consigo mesmo */
  for (const a of d.analiticas) conferencias.push({ chave: `analitica:${a.empresa}`, rotulo: `Folha ${a.empresa}`, situacao: a.confere ? 'confere' : 'difere',
    frase: a.confere ? `${a.pessoas.length} funcionários conferem com o resumo geral.` : a.naoConfere.join(' ') });
  const proprios: Array<{ k: string; rotulo: string; doc: { confere: boolean; naoConfere: string[] } | null }> = [
    { k: 'gfd', rotulo: 'GFD', doc: d.gfd }, { k: 'darf', rotulo: 'DARF', doc: d.darf }, { k: 'dctfweb', rotulo: 'DCTFWeb', doc: d.dctfweb },
    { k: 'relacao', rotulo: 'Relação do FGTS', doc: d.relacao },
  ];
  for (const { k, rotulo, doc } of proprios) {
    if (doc && !doc.confere) conferencias.push({ chave: `${k}:proprio`, rotulo, situacao: 'difere', frase: doc.naoConfere.join(' ') });
  }

  /* o analítico ↔ o estabelecimento, pelos códigos */
  const ests = d.relacao?.estabelecimentos ?? [];
  const analiticaDoEst = new Map<string, FolhaAnaliticaLida>();
  for (const a of d.analiticas) {
    const cods = new Set(a.pessoas.map((p) => p.codigo));
    const melhor = [...ests].map((e) => ({ e, n: e.trabalhadores.filter((t) => cods.has(t.codigo)).length })).sort((x, y) => y.n - x.n)[0];
    if (!melhor || melhor.n === 0) pendencias.push({ tipo: 'sem_estabelecimento', frase: `A folha ${a.empresa} não casa com nenhum estabelecimento da guia do FGTS.` });
    else analiticaDoEst.set(melhor.e.caepf, a);
  }
  /* quem está na guia do FGTS e não está em nenhum analítico (e o contrário) */
  const naFolha = new Set(d.analiticas.flatMap((a) => a.pessoas.map((p) => p.codigo)));
  for (const e of ests) for (const t of e.trabalhadores) {
    if (!naFolha.has(t.codigo)) pendencias.push({ tipo: 'falta_folha', frase: `Falta a folha da matrícula ${t.matricula} (está na guia do FGTS: base ${brl(t.base)}, FGTS ${brl(t.fgts)}).` });
  }
  const naGuia = new Set(ests.flatMap((e) => e.trabalhadores.map((t) => t.codigo)));
  if (d.relacao) for (const a of d.analiticas) for (const p of a.pessoas) {
    if ((p.fgts ?? 0) > 0 && !naGuia.has(p.codigo)) pendencias.push({ tipo: 'falta_folha', frase: `O funcionário ${p.codigo} da folha ${a.empresa} não está na guia do FGTS.` });
  }

  /* as guias entre si */
  if (d.gfd || d.relacao) conferencias.push(comparar('fgts:guia', 'FGTS: GFD × relação', d.gfd?.valor ?? null, d.relacao?.totalGuia ?? null, 'a GFD', 'a relação'));
  if (d.gfd && d.relacao) {
    const n = ests.reduce((s, e) => s + e.trabalhadores.length, 0);
    if (n !== d.gfd.trabalhadores) conferencias.push({ chave: 'fgts:trabalhadores', rotulo: 'FGTS: trabalhadores', situacao: 'difere', frase: `A GFD diz ${d.gfd.trabalhadores} trabalhadores; a relação traz ${n}.` });
  }
  if (d.darf || d.dctfweb) conferencias.push(comparar('darf:dctfweb', 'DARF × DCTFWeb', d.darf?.valor ?? null, d.dctfweb?.total ?? null, 'o DARF', 'a DCTFWeb'));
  const doDarf = (tipo: string) => (d.darf ? reais(somaC(d.darf.composicao.filter((c) => c.tipo === tipo), (c) => c.total)) : null);
  const inssFolha = d.analiticas.length ? reais(somaC(d.analiticas, (a) => a.soma.inss)) : null;
  const irrfFolha = d.analiticas.length ? reais(somaC(d.analiticas, (a) => a.soma.irrf)) : null;
  if (d.darf || d.analiticas.length) {
    conferencias.push(comparar('inss:folha', 'INSS dos segurados: DARF × folhas', doDarf('inss_segurados'), inssFolha, 'o DARF', 'as folhas'));
    conferencias.push(comparar('irrf:folha', 'IRRF: DARF × folhas', doDarf('irrf'), irrfFolha, 'o DARF', 'as folhas'));
  }

  /* por estabelecimento: FGTS da relação, INSS e IRRF das pessoas, terceiros pela base (D2) */
  const terceiros = ratearPelaBase(doDarf('terceiros') ?? 0, ests.map((e) => e.somaBase));
  const estabelecimentos: PorEstabelecimento[] = ests.map((e, i) => {
    const a = analiticaDoEst.get(e.caepf) ?? null;
    return {
      caepf: e.caepf, empresa: a?.empresa ?? null, funcionarios: a?.pessoas.length ?? 0, liquido: a?.soma.liquido ?? 0,
      fgts: e.totalFgts ?? e.somaFgts, baseFgts: e.somaBase, inssSegurados: a?.soma.inss ?? 0, terceiros: terceiros[i] ?? 0, irrf: a?.soma.irrf ?? 0,
    };
  });
  const limpo = pendencias.length === 0 && conferencias.every((c) => c.situacao === 'confere');
  return { ok: true, pacote: { competencia, conferencias, estabelecimentos, pendencias, limpo } };
}
