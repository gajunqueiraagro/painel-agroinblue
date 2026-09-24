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

/** Uma linha rótulo-à-esquerda / valor-à-direita dos cards (A17/A18). */
function Par({ rot, val, cor }: { rot: string; val: string; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 whitespace-nowrap leading-tight">
      <span className="truncate text-[10px] text-muted-foreground">{rot}</span>
      <span className={cn('shrink-0 text-[10px] font-medium tabular-nums', cor)}>{val}</span>
    </div>
  );
}
/** ⚠ O % VAI NUMA LINHA SÓ DELE, à direita: ao lado do valor, ele quebrava a linha a 1440. */
function PctLinha({ txt, cor }: { txt: string; cor?: string }) {
  return <div className={cn('text-right text-[10px] leading-tight tabular-nums', cor)}>{txt}</div>;
}

function Card({ titulo, grande, corGrande, pct, children }: {
  titulo: string; grande: string; corGrande?: string; pct?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
      <div className="truncate px-2 py-1 text-[11px] font-medium"
        style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>
        {titulo}
      </div>
      <div className="flex-1 px-2 py-1.5">
        <div className={cn('truncate text-[16px] font-medium leading-none tabular-nums', corGrande)}>{grande}</div>
        {pct !== undefined && (
          <div className={cn('mt-0.5 text-[12px] leading-none tabular-nums', corGrande)}>{pct}</div>
        )}
        <div className="mt-1.5 space-y-0.5">{children}</div>
      </div>
    </div>
  );
}

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
  const dAtJ = tJov.at1 - tJov.at0;
  const dAtA = tAdu.at1 - tAdu.at0;
  const dPk = T.pk1 == null || T.pk0 == null ? null : T.pk1 - T.pk0;
  const dPkJ = tJov.pk1 == null || tJov.pk0 == null ? null : tJov.pk1 - tJov.pk0;
  const dPkA = tAdu.pk1 == null || tAdu.pk0 == null ? null : tAdu.pk1 - tAdu.pk0;

  /* ─── OS CARDS DO TOPO ─── */
  /* ⚠ OS OPERADORES `+ + =` SÃO O CONTEÚDO, não enfeite: eles dizem que as quatro caixas formam uma
     conta, e é a conta inteira do modal numa linha. */
  const cardsResumo = (
    <div className="flex items-stretch gap-1.5">
      <Card titulo={`Valia em ${rotuloMes(p0)}`} grande={`R$ ${n(T.v0, 0)}`}>
        <Par rot="Cabeças" val={n(T.q0, 0)} />
        <Par rot="Arrobas" val={n(T.at0, 0)} />
        <Par rot="R$/@ médio" val={n(T.pk0)} />
      </Card>
      <div className="flex shrink-0 items-center text-[14px] text-muted-foreground">+</div>
      <Card titulo="Produção" grande={`R$ ${comSinal(T.dProd, 0)}`} corGrande={corSinal(T.dProd)}
        pct={pctDe(T.dProd, T.v0)}>
        <Par rot="Arrobas a mais" val={`${comSinal(dAt, 0)} @`} cor={corSinal(dAt)} />
        <PctLinha txt={pctDe(dAt, T.at0)} cor={corSinal(dAt)} />
        <Par rot="ao preço do início" val={`${n(T.pk0)} R$/@`} />
      </Card>
      <div className="flex shrink-0 items-center text-[14px] text-muted-foreground">+</div>
      <Card titulo="Mercado" grande={`R$ ${comSinal(T.dMerc, 0)}`} corGrande={corSinal(T.dMerc)}
        pct={pctDe(T.dMerc, T.v1p0)}>
        <Par rot={dPk != null && dPk < 0 ? 'Arroba caiu' : 'Arroba subiu'}
          val={`${comSinal(dPk)} R$/@`} cor={corSinal(dPk)} />
        <PctLinha txt={pctDe(dPk, T.pk0)} cor={corSinal(dPk)} />
        <Par rot="sobre o rebanho do fim" val={`${n(T.at1, 0)} @`} />
      </Card>
      <div className="flex shrink-0 items-center text-[14px] text-muted-foreground">=</div>
      <Card titulo={`Vale em ${rotuloMes(p1)}`} grande={`R$ ${n(T.v1p1, 0)}`}>
        <Par rot="Cabeças" val={n(T.q1, 0)} />
        <Par rot="Arrobas" val={n(T.at1, 0)} />
        <Par rot="R$/@ médio" val={n(T.pk1)} />
      </Card>
    </div>
  );

  const cardsProducao = (
    <div className="flex items-stretch gap-1.5">
      <Card titulo="Variação por produção" grande={`${comSinal(dAt, 0)} @`} corGrande={corSinal(dAt)}
        pct={pctDe(dAt, T.at0)}>
        <Par rot="Arrobas no início" val={n(T.at0, 0)} />
        <Par rot="Arrobas no fim" val={n(T.at1, 0)} />
        <Par rot="Valor da produção" val={`R$ ${comSinal(T.dProd, 0)}`} cor={corSinal(T.dProd)} />
        <PctLinha txt={pctDe(T.dProd, T.v0)} cor={corSinal(T.dProd)} />
      </Card>
      <Card titulo="Onde a produção aconteceu" grande={`${comSinal(dAt, 0)} @`} corGrande={corSinal(dAt)}>
        <Par rot="Jovens" val={`${comSinal(dAtJ, 0)} @`} cor={corSinal(dAtJ)} />
        <PctLinha txt={pctDe(dAtJ, tJov.at0)} cor={corSinal(dAtJ)} />
        <Par rot="Adultos" val={`${comSinal(dAtA, 0)} @`} cor={corSinal(dAtA)} />
        <PctLinha txt={pctDe(dAtA, tAdu.at0)} cor={corSinal(dAtA)} />
      </Card>
    </div>
  );

  const cardsMercado = (
    <div className="flex items-stretch gap-1.5">
      <Card titulo="Efeito de mercado" grande={`${comSinal(dPk)} R$/@`} corGrande={corSinal(dPk)}
        pct={pctDe(dPk, T.pk0)}>
        <Par rot="R$/@ no início" val={n(T.pk0)} />
        <Par rot="R$/@ no fim" val={n(T.pk1)} />
        <Par rot="Valor do efeito" val={`R$ ${comSinal(T.dMerc, 0)}`} cor={corSinal(T.dMerc)} />
        <PctLinha txt={pctDe(T.dMerc, T.v1p0)} cor={corSinal(T.dMerc)} />
      </Card>
      <Card titulo="O preço por grupo" grande={`${comSinal(dPk)} R$/@`} corGrande={corSinal(dPk)}>
        <Par rot="Jovens" val={`${n(tJov.pk0)} → ${n(tJov.pk1)}`} />
        <PctLinha txt={pctDe(dPkJ, tJov.pk0)} cor={corSinal(dPkJ)} />
        <Par rot="Adultos" val={`${n(tAdu.pk0)} → ${n(tAdu.pk1)}`} />
        <PctLinha txt={pctDe(dPkA, tAdu.pk0)} cor={corSinal(dPkA)} />
      </Card>
    </div>
  );

  const nota = aba === 'resumo'
    ? 'As duas pontas são reais. Produção + Mercado = a variação, ao centavo.'
    : aba === 'producao'
      ? 'Um preço só por categoria, o do início. O valor muda apenas pelas arrobas.'
      : 'O rebanho do fim, valorado ao preço do início e ao do fim. A diferença é só o preço.';

  /** As três linhas de fecho de um grupo: o total, a variação e o %. */
  const linhasDeTotal = (t: Cat, fundo: string, fecha: boolean) => ([
    <tr key={`${t.cod}:t`} style={{ backgroundColor: fundo, height: 20, borderTop: '1px solid #9a988f' }}>
      {cols.map(c => (
        <td key={c.chave} title={c.chave === 'nome' ? t.nome : undefined}
          className={cn('truncate px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
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
            className={cn('truncate px-1.5 py-0.5 text-[11px] tabular-nums',
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
            className={cn('truncate px-1.5 py-0.5 text-[11px] tabular-nums',
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
        <tr style={{ backgroundColor: AZUL_FAIXA, height: 20 }}>
          <td colSpan={cols.length} className="truncate px-1.5 py-0.5 text-[11px] font-medium"
            style={{ color: NAVY }}>{titulo}</td>
        </tr>
        {lista.map((c, i) => (
          <tr key={c.cod} style={{ backgroundColor: i % 2 === 1 ? ZEBRA : undefined, height: 20 }}>
            {cols.map(col => (
              <td key={col.chave} title={col.chave === 'nome' ? c.nome : undefined}
                className={cn('truncate px-1.5 py-0.5 text-[11px] tabular-nums',
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
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        {/* ⚠ AS ABAS MORAM NO CABEÇALHO, à direita — e a ordem é [Resumo][Produção][Mercado], que é a
            ordem da conta: o total primeiro, depois as duas parcelas que o explicam. */}
        <div className="flex items-start justify-between gap-3 px-4 py-2.5 text-white" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">Variação do valor do rebanho</h2>
            <div className="mt-0.5 truncate text-[11px] text-white/80">
              {[clienteNome, fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}`
                : `${periodo.de} → ${periodo.ate}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {([['resumo', 'Resumo'], ['producao', 'Produção'], ['mercado', 'Mercado']] as const).map(([v, r]) => (
              <button key={v} type="button" onClick={() => setAba(v)}
                className={cn('rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  aba === v ? 'bg-white text-[#0C447C]' : 'text-white/80 hover:bg-white/10')}>
                {r}
              </button>
            ))}
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="ml-1 text-white/80 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ⚠ ALTURA FIXA, IGUAL NAS TRÊS ABAS, e é o que impede o modal de pular quando o operador
            troca de aba para comparar. O que sobra ou falta é absorvido pela tabela, que é a única
            que rola — UM SCROLLPORT SÓ (A21). */}
        <div className="flex flex-col gap-2 bg-muted/30 p-3" style={{ height: 520 }}>
          {carregando || !patrimonio ? (
            <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : (
            <>
              <div className="shrink-0">
                {aba === 'resumo' ? cardsResumo : aba === 'producao' ? cardsProducao : cardsMercado}
              </div>

              {aba === 'resumo' && (
                <div className="shrink-0 text-[10px] leading-snug text-muted-foreground">
                  O rebanho valia <strong className="font-medium tabular-nums">R$ {n(T.v0, 0)}</strong> e
                  vale <strong className="font-medium tabular-nums">R$ {n(T.v1p1, 0)}</strong> ({pctDe(T.dTotal, T.v0)}).
                  Dessa diferença, <strong className="font-medium tabular-nums">R$ {comSinal(T.dProd, 0)}</strong> vieram
                  de produzir <strong className="font-medium tabular-nums">{comSinal(dAt, 0)}</strong> arrobas,
                  e <strong className="font-medium tabular-nums">R$ {comSinal(T.dMerc, 0)}</strong> vieram
                  de a arroba {dPk != null && dPk < 0 ? 'cair' : 'subir'}{' '}
                  <strong className="font-medium tabular-nums">{comSinal(dPk)}</strong> R$/@.
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup>{cols.map(c => <col key={c.chave} style={{ width: `${c.pc}%` }} />)}</colgroup>
                  <thead>
                    <tr style={{ height: 22 }}>
                      {cols.map(c => (
                        <th key={c.chave} title={c.rot}
                          className={cn('sticky top-0 z-10 truncate px-1.5 py-0.5 text-[10px] font-semibold text-white',
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

              <div className="shrink-0 px-0.5 text-[10px] leading-snug text-muted-foreground">{nota}</div>
            </>
          )}
        </div>

        <div className="px-4 py-1.5 text-[10px] text-white/80" style={{ backgroundColor: NAVY }}>
          Valores estimados · preços do valor do rebanho de cada mês · arrobas = kg vivo ÷ 30
        </div>
      </DialogContent>
    </Dialog>
  );
}
