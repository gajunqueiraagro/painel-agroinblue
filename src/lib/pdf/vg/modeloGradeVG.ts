/**
 * P90 (Gabriel 23/10/2026 11h05) — o MODELO do PDF da grade ampliada da Visão Geral (o mesmo conteúdo do modal: cabeçalho com cliente,
 * período, contas, chips ligados e o resumo do mês; depois a grade). Puro e sem motor (não importa o react-pdf): só ESCREVE os números
 * que a `fn_vg_tela` mandou — a mesma escrita da grade da tela (R$ ou R$ mil pela mesma regra; a série do critério escolhido).
 */
import {
  brl, mil1, n0, pct1, rotuloMes, rotuloDoCriterio, serieDoCriterio, MESES_ABR, mes0De, anoDe,
  type CriterioTelaVG, type LinhaVG, type TelaVG,
} from '@/lib/financeiro/visaoGeral';

export type TomVG = 'ent' | 'sai' | 'pos' | 'neg' | 'neutro';
export interface LinhaDaFolhaVG { rotulo: string; nivel: 'forte' | 'grupo' | 'miuda' | 'saldo'; celulas: { texto: string; tom: TomVG; previsto: boolean }[]; total: string; media: string; pct: string; tom: TomVG }
export interface ModeloGradeVG {
  arquivo: string;
  cabecalho: { clienteNome: string; contaNome: string; periodo: string; linha2: string };
  resumo: { rotulo: string; valor: string; tom: TomVG }[];
  unidade: string;
  meses: { rotulo: string; previsto: boolean; escolhido: boolean }[];
  linhas: LinhaDaFolhaVG[];
}

const tomDe = (l: LinhaVG, v: number | null | undefined): TomVG =>
  l.tipo === 'saldo' || l.tipo === 'resultado' ? (v == null ? 'neutro' : v < 0 ? 'neg' : 'pos') : l.tipo === 'cartao' ? 'neutro' : l.lado === 'saida' ? 'sai' : 'ent';

export function montarModeloGradeVG(o: {
  tela: TelaVG; sel: string; criterio: CriterioTelaVG; clienteNome: string; rotuloContas: string; recorte: string[]; chipsLigados: string[]; emissao: string;
}): ModeloGradeVG {
  const { tela, sel, criterio } = o;
  const meses = tela.meses;
  const k = meses.findIndex((m) => m.am === sel);
  /* a MESMA regra da grade da tela: R$ mil quando há mais de 14 meses ou valor na casa do milhão (nas três séries) */
  const maior = Math.max(0, ...tela.linhas.flatMap((l) => [...l.valores, ...(l.valores_acum ?? []), ...(l.valores_media ?? [])].map((v) => Math.abs(v ?? 0))));
  const comp = meses.length > 14 || maior >= 1_000_000;
  const fmt = (v: number | null | undefined) => (comp ? mil1(v) : n0(v));
  const linha = (chave: string) => tela.linhas.find((l) => l.chave === chave);
  const total = (lado: 'entrada' | 'saida') => tela.linhas.find((l) => l.tipo === 'total' && l.lado === lado);
  const noMes = (l: LinhaVG | undefined) => (l && k >= 0 ? l.valores[k] ?? null : null);
  const res = noMes(linha('resultado')), sf = noMes(linha('saldo_final'));
  const de = meses[0]?.am ?? sel, ate = meses[meses.length - 1]?.am ?? sel;
  return {
    arquivo: `visao-geral-${o.clienteNome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${sel}`,
    cabecalho: {
      clienteNome: o.clienteNome,
      contaNome: o.rotuloContas,
      periodo: `${rotuloMes(de)} – ${rotuloMes(ate)} · mês ${rotuloMes(sel)}`,
      linha2: [...o.recorte, `Realizado + ${o.chipsLigados.length ? o.chipsLigados.join(', ') : 'nenhum não realizado'}`,
        `Valores: ${criterio === 'mes' ? 'mês' : rotuloDoCriterio(criterio, de, sel)}`, `Emitido em ${o.emissao}`].join('   ·   '),
    },
    resumo: [
      { rotulo: `Entradas ${rotuloMes(sel)}`, valor: brl(noMes(total('entrada'))), tom: 'ent' },
      { rotulo: `Saídas ${rotuloMes(sel)}`, valor: brl(noMes(total('saida'))), tom: 'sai' },
      { rotulo: `Resultado ${rotuloMes(sel)}`, valor: brl(res), tom: res == null ? 'neutro' : res < 0 ? 'neg' : 'pos' },
      ...(tela.sem_saldo ? [] : [{ rotulo: `Saldo final ${rotuloMes(sel)}`, valor: brl(sf), tom: (sf == null ? 'neutro' : sf < 0 ? 'neg' : 'pos') as TomVG }]),
    ],
    unidade: `R$${comp ? ' mil' : ''} · ${criterio === 'mes' ? 'realizado + previsto' : criterio === 'media' ? 'média até o mês' : 'acumulado até o mês'}`,
    meses: meses.map((m, i) => ({ rotulo: `${MESES_ABR[mes0De(m.am)].toUpperCase()}${i === 0 || mes0De(m.am) === 0 ? `/${String(anoDe(m.am)).slice(2)}` : ''}`, previsto: m.previsto, escolhido: m.am === sel })),
    linhas: tela.linhas.map((l) => {
      const serie = serieDoCriterio(l, criterio);
      return {
        rotulo: l.rotulo,
        nivel: l.tipo === 'saldo' ? 'saldo' : l.tipo === 'grupo' ? 'grupo' : l.tipo === 'transf' || l.tipo === 'cartao' ? 'miuda' : 'forte',
        celulas: meses.map((m, i) => ({ texto: fmt(serie[i]), tom: tomDe(l, serie[i]), previsto: m.previsto })),
        total: l.total == null ? '' : fmt(l.total),
        media: l.tipo === 'saldo' ? '' : fmt(l.media),
        pct: l.tipo === 'grupo' || l.tipo === 'transf' ? pct1(l.pct) : '',
        tom: tomDe(l, l.total),
      };
    }),
  };
}
