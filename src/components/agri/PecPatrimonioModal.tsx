/**
 * A VARIAÇÃO DO VALOR DO REBANHO — VARIACAO-REBANHO-MODAL-01-fix2 (mock v14).
 *
 * ⚠ NENHUMA COLUNA DE FICÇÃO, e é o princípio que reprovou o desenho anterior. O fix1 mostrava as
 * MESMAS oito colunas nas três abas e "travava" uma delas em cinza — ou seja, exibia um número que
 * não era o daquela ponta e pedia ao operador que o desconsiderasse. Agora cada aba mostra só o que
 * é real nela: a Produção tem UMA coluna de preço (a do início, a única que ela usa) e o Mercado não
 * tem coluna de início em cabeça nem em arroba, porque o rebanho não muda lá. A palavra "travado"
 * saiu do vocabulário da tela.
 *
 * ⚠ E A SOMA FECHA POR CONSTRUÇÃO: Δ(Produção) + Δ(Mercado) = Δ(Resumo), por categoria, por grupo e
 * no total. Os três saem dos MESMOS três valores do payload — `v0` (início a preço do início),
 * `v1_p0` (fim a preço do início) e `v1_p1` (fim a preço do fim). Sem o valor do MEIO as duas
 * variações seriam indistinguíveis.
 *
 * ⚠ A ARROBA É A DA CASA: `kgToArrobas` (`src/types/cattle.ts`), peso vivo ÷ 30. O ÷15 do
 * repositório é de CARCAÇA (abate) e não se aplica a estoque vivo. O DRE não serve de fonte — as
 * arrobas dele (`at_produzida`, `at_desfrutada`) são de FLUXO; aqui é ESTOQUE.
 *
 * ⚠ R$/@ DE GRUPO E DE TOTAL É PONDERADO (soma do valor ÷ soma das arrobas), nunca a média das
 * categorias: a média simples de preços se mexe quando a MISTURA do rebanho se mexe, e diria que o
 * mercado mudou onde só a composição mudou.
 *
 * ⚠ NÃO HÁ ABA "LANÇAMENTOS", e isso é dado, não omissão: patrimônio não tem lançamento. Ele sai do
 * fechamento do rebanho — a foto do mês.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { kgToArrobas, CATEGORIAS } from '@/types/cattle';
import type { PatrimonioPec, CategoriaPatrimonio } from '@/hooks/useDrePecuaria';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

/** ⚠ O NOME DE EXIBIÇÃO DA CASA, NUNCA O CÓDIGO: `CATEGORIAS` é a mesma lista dos lançamentos. */
const NOME_CAT = new Map(CATEGORIAS.map(c => [c.value as string, c.label]));
const nomeDe = (cod: string) => NOME_CAT.get(cod) ?? cod;

/** Jovens = mamotes e desmama; adultos = o resto. */
const JOVENS = new Set(['mamotes_m', 'mamotes_f', 'desmama_m', 'desmama_f']);

const NAVY = '#0C447C';
const CAB_TABELA = '#2C3E5C';
const AZUL_CLARO = '#E9EFF6';
const AZUL_FAIXA = '#D3E0ED';
const ZEBRA = '#F6F5F1';
const CINZA_TOTAL = '#D3D1C7';
const DIVISOR = '1px solid #888780';

const VERDE = 'text-emerald-700';
const VERMELHO = 'text-destructive';
const corSinal = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? VERDE : VERMELHO);

/** ⚠ AUSÊNCIA É TRAÇO, ZERO É NÚMERO — a sentinela do projeto. */
const traco = '—';
const n = (v: number | null | undefined, casas = 2) => (v == null ? '—' : formatNum(v, casas));
const comSinal = (v: number | null, casas = 2) =>
  (v == null ? '—' : `${v > 0 ? '+' : ''}${formatNum(v, casas)}`);
const pctDe = (v: number | null, base: number | null) =>
  (v == null || base == null || base === 0
    ? '—'
    : `${v / base > 0 ? '+' : ''}${formatNum((v / Math.abs(base)) * 100, 1)} %`);

type Aba = 'resumo' | 'producao' | 'mercado';

/** Uma categoria já nas unidades da tela — tudo derivado do payload por soma, subtração e divisão. */
interface Cat {
  cod: string; nome: string; jovem: boolean;
  q0: number; q1: number;
  at0: number; at1: number;
  pk0: number | null; pk1: number | null;
  v0: number; v1p0: number; v1p1: number;
  dProd: number; dMerc: number; dTotal: number;
}

/**
 * @ de uma ponta: cabeças × peso médio, em arrobas da casa.
 *
 * ⚠ ZERO CABEÇAS É ZERO ARROBA, NÃO AUSÊNCIA. Uma categoria que não existia no início vem com
 * `q = 0` e `peso = null`: "não há peso médio de nenhum animal" é verdade, mas o estoque dela é
 * ZERO, e isso se sabe. Tratar como ausência fazia o total propagar `null` e o número grande da aba
 * abrir em "— @" por causa de uma categoria vazia. Medido no NJ jul/22-jun/23, categoria `bois`.
 */
const arrobas = (q: number, pm: number | null) => (q === 0 ? 0 : pm == null ? 0 : kgToArrobas(q * pm));
const porAt = (valor: number, at: number) => (at === 0 ? null : valor / at);

function montar(cats: readonly CategoriaPatrimonio[]): Cat[] {
  return cats.map(c => {
    const at0 = arrobas(c.q0, c.pm0);
    const at1 = arrobas(c.q1, c.pm1);
    return {
      cod: c.categoria, nome: nomeDe(c.categoria), jovem: JOVENS.has(c.categoria),
      q0: c.q0, q1: c.q1, at0, at1,
      /* ⚠ O PREÇO DO INÍCIO TEM DUAS FONTES, nesta ordem: o valor do início dividido pelas @ do
         início; e, quando a categoria NASCEU no período (não havia @ no início), o valor do fim a
         preço do início dividido pelas @ do fim — que é o mesmo preço, aplicado ao rebanho do fim.
         Sem a segunda, a coluna de preço da aba Produção ficaria vazia justamente nas categorias
         que mais produziram. */
      pk0: porAt(c.v0, at0) ?? porAt(c.v1_p0, at1),
      pk1: porAt(c.v1_p1, at1),
      v0: c.v0, v1p0: c.v1_p0, v1p1: c.v1_p1,
      dProd: c.vpb, dMerc: c.efeito, dTotal: c.vpb + c.efeito,
    };
  /* ⚠ CATEGORIA ZERADA NAS DUAS PONTAS SOME: uma linha de zeros não responde pergunta nenhuma e
     empurra para fora da tela as que respondem. */
  }).filter(c => c.q0 !== 0 || c.q1 !== 0);
}

/** A soma de um conjunto — e o R$/@ dela é PONDERADO. */
function somar(cs: readonly Cat[], nome: string): Cat {
  const s = (f: (c: Cat) => number) => cs.reduce((a, c) => a + f(c), 0);
  const at0 = s(c => c.at0); const at1 = s(c => c.at1);
  const v0 = s(c => c.v0); const v1p0 = s(c => c.v1p0); const v1p1 = s(c => c.v1p1);
  return {
    cod: nome, nome, jovem: false,
    q0: s(c => c.q0), q1: s(c => c.q1), at0, at1,
    pk0: porAt(v0, at0) ?? porAt(v1p0, at1), pk1: porAt(v1p1, at1),
    v0, v1p0, v1p1,
    dProd: s(c => c.dProd), dMerc: s(c => c.dMerc), dTotal: s(c => c.dTotal),
  };
}

/**
 * AS COLUNAS DE CADA ABA — em proporção, para nada cortar nem rolar na horizontal.
 *
 * ⚠ `bloco` abre um bloco de leitura, e o divisor de 1px o separa do anterior. Os blocos são
 * "quantas cabeças", "quantas arrobas", "a que preço" e "quanto vale": cada um é uma pergunta, e o
 * par início/fim dentro dele é a resposta.
 */
interface Col { chave: string; rot: string; pc: number; bloco?: boolean }
const COLS: Record<Aba, readonly Col[]> = {
  resumo: [
    { chave: 'nome', rot: '', pc: 17 },
    { chave: 'q0', rot: 'Cab. início', pc: 8, bloco: true }, { chave: 'q1', rot: 'Cab. fim', pc: 8 },
    { chave: 'at0', rot: '@ início', pc: 10, bloco: true }, { chave: 'at1', rot: '@ fim', pc: 10 },
    { chave: 'pk0', rot: 'R$/@ início', pc: 9, bloco: true }, { chave: 'pk1', rot: 'R$/@ fim', pc: 9 },
    { chave: 'v0', rot: 'Valor início', pc: 14, bloco: true }, { chave: 'v1p1', rot: 'Valor fim', pc: 15 },
  ],
  /* ⚠ UM PREÇO SÓ, e é o do início: na Produção o valor muda apenas pelas arrobas. Uma segunda
     coluna de preço repetiria o mesmo número e voltaria a ser ficção. */
  producao: [
    { chave: 'nome', rot: '', pc: 19 },
    { chave: 'q0', rot: 'Cab. início', pc: 9, bloco: true }, { chave: 'q1', rot: 'Cab. fim', pc: 9 },
    { chave: 'at0', rot: '@ início', pc: 11, bloco: true }, { chave: 'at1', rot: '@ fim', pc: 11 },
    { chave: 'pk0', rot: 'R$/@ do início', pc: 11, bloco: true },
    { chave: 'v0', rot: 'Valor início', pc: 15, bloco: true }, { chave: 'v1p0', rot: 'Valor fim', pc: 15 },
  ],
  /* ⚠ SÓ NÚMERO DE FIM em cabeça e arroba: o rebanho do Mercado é um só, o do fim. */
  mercado: [
    { chave: 'nome', rot: '', pc: 21 },
    { chave: 'q1', rot: 'Cabeças fim', pc: 11, bloco: true },
    { chave: 'at1', rot: 'Arrobas fim', pc: 12, bloco: true },
    { chave: 'pk0', rot: 'R$/@ início', pc: 11, bloco: true }, { chave: 'pk1', rot: 'R$/@ fim', pc: 11 },
    { chave: 'v1p0', rot: 'Valor a pr. início', pc: 17, bloco: true },
    { chave: 'v1p1', rot: 'Valor a pr. fim', pc: 17 },
  ],
};

/** Quais colunas ganham Variação e % — só as que de fato variam naquela aba. */
const VARIAM: Record<Aba, ReadonlySet<string>> = {
  resumo: new Set(['q1', 'at1', 'pk1', 'v1p1']),
  producao: new Set(['q1', 'at1', 'v1p0']),
  mercado: new Set(['pk1', 'v1p1']),
};

const valorDe = (c: Cat, chave: string): number | null => {
  switch (chave) {
    case 'q0': return c.q0; case 'q1': return c.q1;
    case 'at0': return c.at0; case 'at1': return c.at1;
    case 'pk0': return c.pk0; case 'pk1': return c.pk1;
    case 'v0': return c.v0; case 'v1p0': return c.v1p0; case 'v1p1': return c.v1p1;
    default: return null;
  }
};
const casasDe = (chave: string) => (chave.startsWith('q') ? 0 : 2);

/** A variação de uma coluna: o par início→fim daquela aba. */
function variacaoDe(t: Cat, chave: string, aba: Aba): { d: number | null; base: number | null } {
  if (chave === 'q1') return { d: t.q1 - t.q0, base: t.q0 };
  if (chave === 'at1') return { d: t.at1 - t.at0, base: t.at0 };
  if (chave === 'pk1') return { d: t.pk1 == null || t.pk0 == null ? null : t.pk1 - t.pk0, base: t.pk0 };
  if (chave === 'v1p0') return { d: t.dProd, base: t.v0 };
  if (chave === 'v1p1') {
    return aba === 'mercado' ? { d: t.dMerc, base: t.v1p0 } : { d: t.dTotal, base: t.v0 };
  }
  return { d: null, base: null };
}

/**
 * A TABELA DO TOPO — mock v16b.
 *
 * ⚠ É UMA TABELA SÓ, NÃO DUAS LADO A LADO, e a diferença é o ponto do desenho: as linhas das duas
 * metades são FISICAMENTE as mesmas, então "Arrobas" à esquerda e "+ Produção" à direita ficam
 * exatamente na mesma altura. Com dois `<table>` irmãos isso só valeria por coincidência de
 * régua — e deixaria de valer no primeiro número que mudasse de altura.
 *
 * ⚠ A METADE DIREITA É UMA CAMINHADA, não um resumo: valia · + produção · + mercado · vale. A
 * coluna "Rebanho" fecha DE CIMA PARA BAIXO e a última linha dela é o mesmo número do "Valor" do
 * fim, à esquerda. É assim que o leigo confere que a conta fecha, sem precisar somar nada.
 *
 * ⚠ E A COLUNA "ARROBAS × R$/@" FECHA NA CALCULADORA — fix5. O preço de cada linha é o DELA:
 * `valor_da_linha / arrobas_da_linha`, e não um preço emprestado de outra. O da Produção é o preço
 * de P0 PONDERADO PELO REBANHO DO FIM (246,73 no SR jan-ago/21) e não o R$/@ de dez/20 da metade
 * esquerda (245,55), que é ponderado pelo rebanho do INÍCIO: são dois preços médios do mesmo mês
 * sobre misturas de categoria diferentes. Emprestar o da esquerda fazia o produto dar 9.634.161
 * contra os 9.680.106 da linha — 45 mil de diferença numa coluna que o operador multiplica.
 */
/**
 * ⚠ AS LARGURAS SÃO AS MEDIDAS, NÃO AS DO MOCK, e a diferença foi medida célula a célula com um
 * `Range` sobre o conteúdo contra o `clientWidth` menos o padding — o método que o CLAUDE.md fixou
 * depois das três calibragens erradas da grade do DRE. As do mock (56/66/74/70/56/8/78/100/64/68)
 * foram desenhadas com números menores; no SR jan-ago/21 quatro colunas estouram:
 *   rótulo esq. "Valor (R$)"      48,2 numa caixa de 44
 *   rótulo dir. "Valia em dez/20" 76,4 numa caixa de 66
 *   Rebanho     "12.031.963"      57,3 numa caixa de 52
 *   Variação    "+1.036.279"      57,3 numa caixa de 56
 * A régua é a mesma da grade: pior texto + 8 de folga + 12 de padding. Soma 726px, contra 1112
 * disponíveis no modal — sobra de 386.
 */
const COLS_TOPO = [70, 72, 78, 78, 62, 8, 98, 104, 78, 78] as const;
const H_CAP = 16, H_CAB = 16, H_LIN = 16;

export function PecPatrimonioModal({
  aberto, fazendaNome, clienteNome, patrimonio, carregando, periodo, onFechar,
}: {
  aberto: boolean;
  fazendaNome: string;
  clienteNome: string;
  /** Qual linha do DRE abriu. ⚠ NÃO escolhe mais a aba: o modal abre SEMPRE no Resumo (mock v14). */
  qual: 'vpb' | 'efeito';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /** O período DA COLUNA clicada — ver `onAbrirDidatico` em `PecDrePanel`. */
  periodo: { de: string; ate: string };
  onFechar: () => void;
}) {
  /* ⚠ ABRE EM RESUMO, sempre. O Resumo responde "quanto meu rebanho valia e quanto vale"; as outras
     duas explicam a diferença, e não fazem sentido antes dela. */
  const [aba, setAba] = useState<Aba>('resumo');

  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  const cats = useMemo(() => montar(patrimonio?.categorias ?? []), [patrimonio]);
  const jovens = useMemo(() => cats.filter(c => c.jovem), [cats]);
  const adultos = useMemo(() => cats.filter(c => !c.jovem), [cats]);
  const tJov = useMemo(() => somar(jovens, 'Total jovens'), [jovens]);
  const tAdu = useMemo(() => somar(adultos, 'Total adultos'), [adultos]);
  const T = useMemo(() => somar(cats, 'Total do rebanho'), [cats]);

  const cols = COLS[aba];
  const variam = VARIAM[aba];
  const dAt = T.at1 - T.at0;
  /* ⚠ AS VARIAÇÕES POR GRUPO SAÍRAM COM OS TOPOS DE Produção E Mercado (mock v16b): elas só
     alimentavam aqueles dois cards. Os grupos continuam na TABELA, com os totais próprios. */
  const dPk = T.pk1 == null || T.pk0 == null ? null : T.pk1 - T.pk0;

  /* ─── A TABELA DO TOPO — a mesma nas três abas ─── */
  const cor = (v: number | null) => corSinal(v) || undefined;

  /** Uma célula da faixa: 10px, número à direita, cor opcional. */
  const cTopo = (txt: string, corTxt?: string, esq?: boolean, forte?: boolean) => (
    <td className={cn('truncate px-1.5 py-0 text-[10px] leading-none tabular-nums',
      esq ? 'text-left' : 'text-right', forte && 'font-medium', corTxt)}>{txt}</td>
  );
  const vazio = <td className="px-0" />;

  const passos = useMemo(() => caminhadaDoValor(T), [T]);
  const direita = passos.map((p, i) => ({
    rot: i === 0 ? `Valia em ${rotuloMes(p0)}` : i === 3 ? `Vale em ${rotuloMes(p1)}` : p.rot,
    leitura: p.arrobas == null ? traco
      : i === 3 ? pctDe(T.dTotal, T.v0)
        : `${n(p.arrobas, 0)} × ${n(p.preco)}`,
    rebanho: n(p.valor, 0),
    varTxt: p.variacao == null ? '' : comSinal(p.variacao, 0),
    varV: p.variacao,
  }));

  const esquerda: { rot: string; a: string; b: string; d: string; p: string; v: number | null }[] = [
    { rot: 'Cabeças', a: n(T.q0, 0), b: n(T.q1, 0), d: comSinal(T.q1 - T.q0, 0),
      p: pctDe(T.q1 - T.q0, T.q0), v: T.q1 - T.q0 },
    { rot: 'Arrobas', a: n(T.at0, 0), b: n(T.at1, 0), d: comSinal(dAt, 0),
      p: pctDe(dAt, T.at0), v: dAt },
    { rot: 'R$/@', a: n(T.pk0), b: n(T.pk1), d: comSinal(dPk), p: pctDe(dPk, T.pk0), v: dPk },
    { rot: 'Valor (R$)', a: n(T.v0, 0), b: n(T.v1p1, 0), d: comSinal(T.dTotal, 0),
      p: pctDe(T.dTotal, T.v0), v: T.dTotal },
  ];

  const topo = (
    <table className="border-collapse" style={{ tableLayout: 'fixed', width: COLS_TOPO.reduce((a, w) => a + w, 0) }}>
      <colgroup>{COLS_TOPO.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <tbody>
        <tr style={{ height: H_CAP }}>
          <td colSpan={5} className="truncate px-1.5 py-0 text-[10px] font-medium leading-none"
            style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>Rebanho</td>
          {vazio}
          <td colSpan={4} className="truncate px-1.5 py-0 text-[10px] font-medium leading-none"
            style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>De onde veio a variação</td>
        </tr>
        <tr style={{ height: H_CAB }}>
          {['', rotuloMes(p0), rotuloMes(p1), 'Dif.', 'Dif. %'].map((r, i) => (
            <th key={i} className={cn('truncate px-1.5 py-0 text-[9px] font-semibold leading-none text-white',
              i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>{r}</th>
          ))}
          {vazio}
          {['', 'Arrobas × R$/@', 'Rebanho', 'Variação'].map((r, i) => (
            <th key={i} className={cn('truncate px-1.5 py-0 text-[9px] font-semibold leading-none text-white',
              i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>{r}</th>
          ))}
        </tr>
        {esquerda.map((e, i) => {
          const d = direita[i];
          /* ⚠ A ÚLTIMA LINHA É TOTAL NAS DUAS METADES — é ela que mostra os dois números iguais. */
          const total = i === esquerda.length - 1;
          const fundo = total ? AZUL_CLARO : undefined;
          return (
            <tr key={e.rot} style={{ height: H_LIN, backgroundColor: fundo }}>
              {cTopo(e.rot, undefined, true, total)}
              {cTopo(e.a, undefined, false, total)}
              {cTopo(e.b, undefined, false, total)}
              {cTopo(e.d, cor(e.v), false, total)}
              {cTopo(e.p, cor(e.v), false, total)}
              <td className="px-0" style={{ backgroundColor: undefined }} />
              {cTopo(d.rot, undefined, true, total)}
              {cTopo(d.leitura, total ? cor(T.dTotal) : undefined, false, total)}
              {cTopo(d.rebanho, undefined, false, total)}
              {cTopo(d.varTxt, cor(d.varV), false, total)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const nota = aba === 'resumo'
    ? 'As duas pontas são reais. Produção + Mercado = a variação, ao centavo.'
    : aba === 'producao'
      ? 'Um preço só por categoria, o do início. O valor muda apenas pelas arrobas.'
      : 'O rebanho do fim, valorado ao preço do início e ao do fim. A diferença é só o preço.';

  /** As três linhas de fecho de um grupo: o total, a variação e o %. */
  const linhasDeTotal = (t: Cat, fundo: string, fecha: boolean) => ([
    <tr key={`${t.cod}:t`} style={{ backgroundColor: fundo, height: 22, borderTop: '1px solid #9a988f' }}>
      {cols.map(c => (
        <td key={c.chave} title={c.chave === 'nome' ? t.nome : undefined}
          className={cn('truncate px-1.5 py-0 text-[11px] font-medium leading-[1.3] tabular-nums',
            c.chave === 'nome' ? 'text-left' : 'text-right')}
          style={{ borderLeft: c.bloco ? DIVISOR : undefined }}>
          {c.chave === 'nome' ? t.nome : n(valorDe(t, c.chave), casasDe(c.chave))}
        </td>
      ))}
    </tr>,
    <tr key={`${t.cod}:v`} style={{ backgroundColor: fundo, height: 18 }}>
      {cols.map(c => {
        const { d } = variacaoDe(t, c.chave, aba);
        const mostra = variam.has(c.chave);
        return (
          <td key={c.chave}
            className={cn('truncate px-1.5 py-0 text-[10px] leading-none tabular-nums',
              c.chave === 'nome' ? 'pl-3.5 text-left text-muted-foreground' : 'text-right',
              mostra && corSinal(d))}
            style={{ borderLeft: c.bloco ? DIVISOR : undefined }}>
            {c.chave === 'nome' ? 'Variação' : mostra ? comSinal(d, casasDe(c.chave)) : ''}
          </td>
        );
      })}
    </tr>,
    <tr key={`${t.cod}:p`}
      style={{ backgroundColor: fundo, height: 18, borderBottom: fecha ? '1px solid #9a988f' : undefined }}>
      {cols.map(c => {
        const { d, base } = variacaoDe(t, c.chave, aba);
        const mostra = variam.has(c.chave);
        return (
          <td key={c.chave}
            className={cn('truncate px-1.5 py-0 text-[10px] leading-none tabular-nums',
              c.chave === 'nome' ? 'pl-3.5 text-left text-muted-foreground' : 'text-right',
              mostra && corSinal(d))}
            style={{ borderLeft: c.bloco ? DIVISOR : undefined }}>
            {c.chave === 'nome' ? '%' : mostra ? pctDe(d, base) : ''}
          </td>
        );
      })}
    </tr>,
  ]);

  /** ⚠ GRUPO SEM CATEGORIA SOME INTEIRO — faixa, linhas e total. Um bloco de zeros não responde nada. */
  const bloco = (titulo: string, lista: readonly Cat[], total: Cat) => {
    if (lista.length === 0) return null;
    return (
      <>
        <tr style={{ backgroundColor: AZUL_FAIXA, height: 18 }}>
          <td colSpan={cols.length} className="truncate px-1.5 py-0 text-[11px] font-medium leading-none"
            style={{ color: NAVY }}>{titulo}</td>
        </tr>
        {lista.map((c, i) => (
          <tr key={c.cod} style={{ backgroundColor: i % 2 === 1 ? ZEBRA : undefined, height: 22 }}>
            {cols.map(col => (
              <td key={col.chave} title={col.chave === 'nome' ? c.nome : undefined}
                className={cn('truncate px-1.5 py-0 text-[11px] leading-[1.3] tabular-nums',
                  col.chave === 'nome' ? 'text-left' : 'text-right')}
                style={{ borderLeft: col.bloco ? DIVISOR : undefined }}>
                {col.chave === 'nome' ? c.nome : n(valorDe(c, col.chave), casasDe(col.chave))}
              </td>
            ))}
          </tr>
        ))}
        {linhasDeTotal(total, AZUL_CLARO, false)}
      </>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA PELO CONTEÚDO, TETO EM 82vh — fix4. A altura FIXA de 520 no corpo fazia o modal
          medir 606px numa viewport de 579 (105%): ele nascia maior que a tela. Agora quem manda é o
          conteúdo, e só a TABELA rola quando não couber. O `minHeight` do corpo é o que mantém o
          tamanho ESTÁVEL ao trocar de aba — a exigência do fix2 continua valendo. */}
      <DialogContent className="flex max-h-[82vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ AS ABAS MORAM NO CABEÇALHO, à direita — e a ordem é [Resumo][Produção][Mercado], que é a
            ordem da conta: o total primeiro, depois as duas parcelas que o explicam. */}
        {/* ⚠ 44px DE CABEÇALHO, medido: 13px de título sobre 11px de subtítulo, com 5px de folga em
            cima e embaixo. Os 57px de antes vinham de um título de 15px e `py-2.5` — 13px num modal
            cujo corpo inteiro é 10 e 11px era o único texto grande da tela. */}
        <div className="flex items-start justify-between gap-3 px-3 py-[5px] text-white" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-[17px]">Variação do valor do rebanho</h2>
            <div className="truncate text-[11px] leading-[15px] text-white/80">
              {[clienteNome, fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}`
                : `${periodo.de} → ${periodo.ate}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {([['resumo', 'Resumo'], ['producao', 'Produção'], ['mercado', 'Mercado']] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => setAba(v)}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium leading-[18px] transition-colors',
                  aba === v ? 'bg-white text-[#0C447C]' : 'text-white/80 hover:bg-white/10')}>
                {r}
              </button>
            ))}
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="ml-0.5 text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ⚠ ALTURA FIXA, IGUAL NAS TRÊS ABAS, e é o que impede o modal de pular quando o operador
            troca de aba para comparar. O que sobra ou falta é absorvido pela tabela, que é a única
            que rola — UM SCROLLPORT SÓ (A21). */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted/30 p-2" style={{ minHeight: 300 }}>
          {carregando || !patrimonio ? (
            <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : (
            <>
              {/* ⚠ A MESMA TABELA NAS TRÊS ABAS — mock v16b. Antes cada aba tinha o topo dela, e
                  como elas não tinham a mesma altura o modal PULAVA ao trocar. Um topo só resolve
                  os dois problemas de uma vez: a caminhada do valor é a mesma pergunta em qualquer
                  aba, e a altura deixa de depender de qual está aberta. */}
              <div className="shrink-0">{topo}</div>
              <div className="shrink-0 text-[9px] leading-[12px] text-muted-foreground">
                Produção: as arrobas a mais, ainda ao preço de {rotuloMes(p0)}.
                Mercado: o rebanho do fim, do preço de {rotuloMes(p0)} para o de {rotuloMes(p1)}.
                {' '}R$/@ da Produção: preço de {rotuloMes(p0)} ponderado pelo rebanho de {rotuloMes(p1)}.
              </div>

              {/* ⚠ A FRASE DE LEITURA LONGA SAIU COM OS CARDS, e não é perda: ela repetia em prosa
                  os quatro números que a caminhada agora mostra em coluna, um embaixo do outro. Duas
                  frases e uma tabela para a mesma conta era o que fazia o modal crescer. */}
              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup>{cols.map(c => <col key={c.chave} style={{ width: `${c.pc}%` }} />)}</colgroup>
                  <thead>
                    <tr style={{ height: 20 }}>
                      {cols.map(c => (
                        <th key={c.chave} title={c.rot}
                          className={cn('sticky top-0 z-10 truncate px-1.5 py-0 text-[10px] font-semibold leading-none text-white',
                            c.chave === 'nome' ? 'text-left' : 'text-right')}
                          style={{ backgroundColor: CAB_TABELA, borderLeft: c.bloco ? DIVISOR : undefined }}>
                          {c.rot}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cats.length === 0 ? (
                      <tr style={{ height: 20 }}>
                        <td colSpan={cols.length} className="px-1.5 text-center text-[10px] text-muted-foreground">—</td>
                      </tr>
                    ) : (
                      <>
                        {bloco('Jovens', jovens, tJov)}
                        {bloco('Adultos', adultos, tAdu)}
                        {linhasDeTotal(T, CINZA_TOTAL, true)}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 px-0.5 text-[9px] leading-[12px] text-muted-foreground">{nota}</div>
            </>
          )}
        </div>

        <div className="shrink-0 truncate px-3 text-[9px] leading-[22px] text-white/80" style={{ backgroundColor: NAVY }}>
          Valores estimados · preços do valor do rebanho de cada mês · arrobas = kg vivo ÷ 30
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A CAMINHADA DO VALOR — as quatro linhas da metade direita do topo (mock v16b, fix5).
 *
 * ⚠ O PREÇO DE CADA LINHA É O DELA: `valor / arrobas`, e não um preço emprestado de outra. O da
 * Produção é o preço de P0 PONDERADO PELO REBANHO DO FIM e difere do R$/@ do início da metade
 * esquerda, que é ponderado pelo rebanho do INÍCIO — são dois preços médios do mesmo mês sobre
 * misturas de categoria diferentes. Medido no SR jan-ago/21: 246,73 contra 245,55, e emprestar o
 * da esquerda fazia o produto dar 9.634.161 no lugar dos 9.680.106 da linha.
 *
 * ⚠ E É ISSO QUE A COLUNA PROMETE: o operador multiplica o que lê e chega no que lê. O que sobra é
 * só o arredondamento — das duas casas do preço e das zero casas das arrobas.
 */
export interface PassoValor {
  rot: string;
  arrobas: number | null;
  preco: number | null;
  valor: number;
  /** `null` na primeira linha: não há variação antes de começar. */
  variacao: number | null;
}

export function caminhadaDoValor(t: {
  at0: number; at1: number; v0: number; v1p0: number; v1p1: number;
  dProd: number; dMerc: number; dTotal: number;
}): PassoValor[] {
  const preco = (valor: number, at: number) => (at === 0 ? null : valor / at);
  return [
    { rot: 'Valia', arrobas: t.at0 === 0 ? null : t.at0, preco: preco(t.v0, t.at0),
      valor: t.v0, variacao: null },
    { rot: '+ Produção', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p0, t.at1),
      valor: t.v1p0, variacao: t.dProd },
    { rot: '+ Mercado', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dMerc },
    { rot: 'Vale', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dTotal },
  ];
}
