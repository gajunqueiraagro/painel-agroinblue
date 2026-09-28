/**
 * A CASCATA DO DRE DA PECUÁRIA — DRE-CASCATA-GRAFICO-01 (mock v3).
 *
 * ⚠ ELA RESPONDE A MESMA PERGUNTA DA GRADE, em outra forma: as quinze barras são as quinze linhas
 * do Resumido, na mesma ordem, com o mesmo valor — inclusive as duas compostas, que vêm de
 * `valorDaLinha` do próprio painel. Recalcular a composição aqui daria duas verdades no primeiro
 * arredondamento. Nenhum indicador novo, nenhuma conta nova: só acumular.
 *
 * ⚠ E A FAIXA DE CONTEXTO NÃO SAI DO DRE. As arrobas do rebanho NÃO existem no bloco `patrimonio`
 * de `fn_dre_pecuaria` — ele tem cabeças e valores, e nenhuma medida de peso (medido na FASE 0).
 * Elas vêm de `fn_dre_pecuaria_patrimonio`, uma chamada por ano escolhido (~380 ms), que é a
 * mesma fonte do modal da variação. Assim a faixa e o modal nunca discordam.
 *
 * ⚠ SVG PRÓPRIO, e não `BarrasCompactas`: uma ponte precisa de barra FLUTUANTE (que sai do
 * acumulado, não do zero), de tracejada ligando um passo ao seguinte e de faixa negativa. O
 * componente compacto da casa desenha barras a partir do zero — é outro gráfico.
 */
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { LINHAS_PEC_RESUMIDO, type ColunaPec } from '@/components/agri/drePecRegua';
import { valorDaLinha } from '@/pages/PecDrePanel';
import { useDrePecuariaPatrimonio } from '@/hooks/useDrePecuaria';
import { indicadoresDoAno } from '@/components/agri/pecLeituraAnos';

const NAVY = '#0C447C';
const CAB_TABELA = '#2C3E5C';
const AZUL_CLARO = '#E9EFF6';
const SUBTOTAL = '#2C3E5C';
const SOMA = '#639922';
const SUBTRAI = '#E24B4A';
/* ⚠ O CINZA DO INVESTIMENTO — DRE-DESTAQUE-01. Ele nao e' soma nem subtracao da cascata: e'
   informacao ao lado dela. Cor neutra para o olho nao o somar. */
const INFORMATIVA = '#8A8880';

const VERDE = 'text-emerald-700';
const VERMELHO = 'text-destructive';
const corSinal = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? VERDE : VERMELHO);
/* ⚠ ÁGIO É CUSTO A MAIS: positivo sai VERMELHO e deságio VERDE — DRE-CASCATA-MODAL-01, a mesma regra da
   leitura dos anos. Pelo sinal comum, pagar mais caro na reposição aparecia como boa notícia. */
const corAgio = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? VERMELHO : VERDE);

const traco = '—';
const n0 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 0));
const n2 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
const sinal0 = (v: number | null) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 0)}`);
const sinal2 = (v: number | null) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 2)}`);
const pct = (v: number | null, base: number | null) =>
  (v == null || base == null || base === 0 ? traco
    : `${v / base > 0 ? '+' : ''}${formatNum((v / Math.abs(base)) * 100, 1)} %`);

/**
 * ABREVIAÇÃO DO EIXO E DOS RÓTULOS — a regra do histórico.
 *
 * ⚠ `mi` A PARTIR DE UM MILHÃO E `k` ABAIXO, e o piso do "k" importa: sem ele, 900 vira "0,9 k" e
 * um número pequeno fica menos legível do que era por extenso.
 */
const abrev = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${formatNum(v / 1_000_000, a >= 10_000_000 ? 1 : 2)} mi`;
  if (a >= 1_000) return `${formatNum(v / 1_000, 0)} k`;
  return formatNum(v, 0);
};
/* `+ 0` normaliza o −0 que a subtração de uma linha zerada produz — a barra dos juros zerados mostrava "-0". */
const abrevSinal = (v: number) => `${v > 0 ? '+' : ''}${abrev(v + 0)}`;

/** Uma barra da cascata, já posicionada. */
export interface Barra {
  chave: string; rotulo: string; valor: number;
  /** Subtotal desenha do ZERO; passo flutua a partir do acumulado. */
  subtotal: boolean;
  /** Os dois que fecham blocos inteiros — em 500. */
  forte: boolean;
  de: number; ate: number; cor: string;
  /** Fora da conta: desenha, mas nao move o acumulado e nao tem subtotal depois. */
  informativa?: boolean;
}

/**
 * ⚠ AS LARGURAS DA FAIXA FORAM RECALIBRADAS NO DRE-CASCATA-MODAL-01 para a fonte de 11px (eram as do
 * fix4, em 10px, iguais às do modal da variação). A fonte cresceu por pedido do Gabriel e "ágio sobre
 * R$/@ do desfrute" deixou de caber em 148px; com a regra da casa, texto que não cabe não se corta.
 */
const COLS_REBANHO: readonly number[] = [80, 80, 86, 86, 68];
const COLS_MOV: readonly number[] = [178, 70, 84, 80, 104];

/**
 * ⚠ ELA MORA NO MODAL DO GRÁFICO DESDE O DRE-CASCATA-MODAL-01, na aba "Cascata do ano": deixou de ocupar
 * o cartão da grade. O ano escolhido pode vir de fora (`escolhido`/`onEscolher`) — é assim que o clique
 * num ano da "Leitura dos anos" abre a cascata daquele ano; sem as duas props ela guarda a escolha sozinha.
 */
export function PecCascataView({ colunas, clienteId, escolhido: escolhidoFora, onEscolher }: {
  colunas: readonly ColunaPec[];
  clienteId: string | null | undefined;
  escolhido?: string | null;
  onEscolher?: (chave: string) => void;
}) {
  /* ⚠ SÓ COLUNAS DE VALOR VIRAM CHIP: a de Δ é derivada das outras duas e não tem cascata própria —
     uma ponte de diferenças não acumula para lugar nenhum. */
  const anos = useMemo(() => colunas.filter(c => c.tipo === 'valor' && !c.semDado), [colunas]);
  /* ⚠ ABRE NO MAIS RECENTE, que é a coluna `atual` quando ela existe: é o período que a tela toda
     está mostrando, e abrir noutro faria o gráfico contradizer os cards acima dele. */
  const padrao = anos.find(c => c.atual)?.chave ?? anos[anos.length - 1]?.chave ?? '';
  const [escolhidoLocal, setEscolhidoLocal] = useState<string>('');
  const escolhido = escolhidoFora ?? escolhidoLocal;
  const setEscolhido = (c: string) => { setEscolhidoLocal(c); onEscolher?.(c); };
  const col = anos.find(c => c.chave === escolhido) ?? anos.find(c => c.chave === padrao) ?? anos[0];

  const { patrimonio, carregando } = useDrePecuariaPatrimonio(
    clienteId, null, col?.de ?? null, col?.ate ?? null, !!col);

  /* ─────────── AS QUINZE BARRAS ─────────── */
  const grafico = useMemo(() => montarBarras(col ?? null), [col]);

  /* ─────────── A FAIXA DE CONTEXTO ─────────── */
  const m = patrimonio?.movimentos ?? null;
  const at0 = m?.inicio.arrobas ?? null;
  const at1 = m?.fim.arrobas ?? null;
  const v0 = m?.inicio.valor ?? null;
  const v1 = m?.fim.valor ?? null;
  const q0 = m?.inicio.cabecas ?? null;
  const q1 = m?.fim.cabecas ?? null;
  const pk0 = at0 && at0 !== 0 && v0 != null ? v0 / at0 : null;
  const pk1 = at1 && at1 !== 0 && v1 != null ? v1 / at1 : null;
  const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a);

  /* ⚠ AS RAZÕES MORAM EM `indicadoresDoAno` desde o DRE-CASCATA-MODAL-01 — extraídas daqui sem mudar
     conta, e lidas também pela "Leitura dos anos". Uma definição de R$/@ para as duas abas. */
  const { atDesf, atComp, cabDesf, cabComp, receitaDesf: rsDesf, rsComp, pkDesf, pkComp, agio } =
    indicadoresDoAno(col?.linhas ?? null);

  const cel = (txt: string, cor?: string, esq?: boolean, forte?: boolean) => (
    <td className={cn('whitespace-nowrap px-1.5 py-0 text-[11px] leading-none tabular-nums',
      esq ? 'text-left' : 'text-right', forte && 'font-medium', cor)}>{txt}</td>
  );
  const cab = (rots: readonly string[]) => (
    <tr style={{ height: 18 }}>
      {rots.map((r, i) => (
        <th key={i} className={cn('whitespace-nowrap px-1.5 py-0 text-[10px] font-semibold leading-none text-white',
          i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>{r}</th>
      ))}
    </tr>
  );
  const capa = (txt: string, span: number) => (
    <tr style={{ height: 18 }}>
      <td colSpan={span} className="whitespace-nowrap px-1.5 py-0 text-[11px] font-medium leading-none"
        style={{ backgroundColor: AZUL_CLARO, color: NAVY }}>{txt}</td>
    </tr>
  );

  /* ─────────── O DESENHO ─────────── */
  /* ⚠ EM PIXELS REAIS — a regra do `preserveAspectRatio="none"` (CLAUDE.md, UI): a cascata passou a morar
     num modal de largura fixa, e o `viewBox` é exatamente o tamanho desenhado. Uma unidade vale um pixel,
     e a fonte de 10,5 é de 10,5. Antes o SVG esticava 1180 unidades até a largura do cartão. */
  const W = LARGURA_CASCATA, MARG_ESQ = 62, MARG_DIR = 10, H = 310, PAD_TOPO = 20, PAD_BASE = 46;
  const FAIXA = W - MARG_ESQ - MARG_DIR;
  const passoX = grafico ? FAIXA / grafico.barras.length : 0;
  const escalaY = (v: number) => {
    if (!grafico || grafico.topo === grafico.chao) return H - PAD_BASE;
    return PAD_TOPO + (grafico.topo - v) / (grafico.topo - grafico.chao) * (H - PAD_TOPO - PAD_BASE);
  };
  /* ⚠ A GRADE ANDA DE 1 OU 2 MILHÕES conforme a escala: com passo fixo, um cliente de 40 milhões
     ganharia quarenta linhas e o gráfico viraria uma malha. */
  const linhasGrade = useMemo(() => {
    if (!grafico) return [];
    const amplitude = grafico.topo - grafico.chao;
    if (amplitude <= 0) return [];
    const passo = amplitude > 12_000_000 ? 2_000_000 : 1_000_000;
    const fora: number[] = [];
    for (let v = Math.ceil(grafico.chao / passo) * passo; v <= grafico.topo; v += passo) fora.push(v);
    return fora;
  }, [grafico]);

  return (
    <div className="flex flex-col gap-2">
      {/* ⚠ OS CHIPS SÃO AS COLUNAS DA GRADE, com o rótulo do cabeçalho delas: trocar de vista não
          pode trocar o vocabulário do período. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {anos.map(c => (
          <button key={c.chave} type="button" onClick={() => setEscolhido(c.chave)}
            title={c.subLongo ?? c.sub}
            className={cn('shrink-0 rounded px-2 text-[11px] font-medium transition-colors',
              c.chave === col?.chave ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted')}
            style={{ height: 22 }}>
            {c.nome}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-start gap-2">
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: COLS_REBANHO.reduce((a, w) => a + w, 0) }}>
          <colgroup>{COLS_REBANHO.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <tbody>
            {capa('Rebanho', 5)}
            {cab(['', patrimonio?.p0 ? rotuloDeMes(patrimonio.p0) : '—',
              patrimonio?.p1 ? rotuloDeMes(patrimonio.p1) : '—', 'Dif.', 'Dif. %'])}
            {carregando ? (
              <tr style={{ height: 18 }}><td colSpan={5}
                className="px-1.5 text-[11px] leading-none text-muted-foreground">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin align-[-2px]" />Carregando…</td></tr>
            ) : ([
              { r: 'Cabeças', a: n0(q0), b: n0(q1), d: dif(q0, q1), f: sinal0, base: q0 },
              { r: 'Arrobas', a: n0(at0), b: n0(at1), d: dif(at0, at1), f: sinal0, base: at0 },
              { r: 'R$/@', a: n2(pk0), b: n2(pk1), d: dif(pk0, pk1), f: sinal2, base: pk0 },
              { r: 'Valor (R$)', a: n0(v0), b: n0(v1), d: dif(v0, v1), f: sinal0, base: v0 },
            ].map((l, i, ls) => {
              const total = i === ls.length - 1;
              return (
                <tr key={l.r} style={{ height: 18, backgroundColor: total ? AZUL_CLARO : undefined }}>
                  {cel(l.r, undefined, true, total)}
                  {cel(l.a, undefined, false, total)}
                  {cel(l.b, undefined, false, total)}
                  {cel(l.f(l.d), corSinal(l.d), false, total)}
                  {cel(pct(l.d, l.base), corSinal(l.d), false, total)}
                </tr>
              );
            }))}
          </tbody>
        </table>

        {/* ⚠ VISÃO DE CAIXA — DRE-CASCATA-MODAL-01: o desfrute ENTRA dinheiro (+, verde) e a reposição SAI
            (−, vermelha). Antes a tabela lia pelo rebanho (desfrute saindo em vermelho, compra entrando em
            verde), ao lado de uma cascata que é de dinheiro — as duas se contradiziam na mesma tela. */}
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: COLS_MOV.reduce((a, w) => a + w, 0) }}>
          <colgroup>{COLS_MOV.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <tbody>
            {capa('Movimentos do período', 5)}
            {cab(['', 'Cabeças', 'Arrobas', 'R$/@', 'Valor (R$)'])}
            <tr style={{ height: 18 }}>
              {cel('Desfrute (venda + abate)', undefined, true)}
              {cel(cabDesf == null ? traco : sinal0(cabDesf), VERDE)}
              {cel(atDesf == null ? traco : sinal0(atDesf), VERDE)}
              {cel(n2(pkDesf))}
              {cel(rsDesf == null ? traco : sinal0(rsDesf), VERDE)}
            </tr>
            <tr style={{ height: 18 }}>
              {cel('% do rebanho inicial', undefined, true)}
              {cel(cabDesf == null || !q0 ? traco : pct(cabDesf, q0), VERDE)}
              {cel(atDesf == null || !at0 ? traco : pct(atDesf, at0), VERDE)}
              {cel('')}{cel('')}
            </tr>
            <tr style={{ height: 18 }}>
              {cel('Reposição (compra)', undefined, true)}
              {cel(cabComp == null ? traco : sinal0(-cabComp), VERMELHO)}
              {cel(atComp == null ? traco : sinal0(-atComp), VERMELHO)}
              {cel(n2(pkComp))}
              {cel(rsComp == null || rsComp === 0 ? traco : sinal0(-rsComp), VERMELHO)}
            </tr>
            <tr style={{ height: 18 }}>
              {cel('ágio sobre R$/@ do desfrute', undefined, true)}
              {cel('')}{cel('')}
              {cel(agio == null ? traco : pct(agio, 1), corAgio(agio))}
              {cel('')}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded border bg-card" style={{ width: W, height: H }}>
        {!grafico ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Sem dado para desenhar a cascata neste período.
          </div>
        ) : (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cascata do resultado">
            {linhasGrade.map(v => (
              <g key={v}>
                <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(v)} y2={escalaY(v)}
                  stroke="#E3E1D9" strokeWidth={1} />
                <text x={MARG_ESQ - 5} y={escalaY(v) + 3.5} fontSize={10} textAnchor="end" fill="#8A8880">
                  {abrev(v)}
                </text>
              </g>
            ))}
            {/* ⚠ A LINHA DO ZERO SÓ EXISTE QUANDO HÁ NEGATIVO — sem ele ela é a base da grade. */}
            {grafico.chao < 0 && (
              <>
                <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(0)} y2={escalaY(0)}
                  stroke="#2C2C2A" strokeWidth={1} />
                <text x={MARG_ESQ - 5} y={escalaY(0) + 3.5} fontSize={10} textAnchor="end" fill="#2C2C2A">0</text>
              </>
            )}
            {grafico.barras.map((b, i) => {
              const cx = MARG_ESQ + i * passoX, larg = Math.min(passoX * 0.6, 44);
              const x = cx + (passoX - larg) / 2;
              const y = escalaY(b.ate), alt = Math.max(escalaY(b.de) - escalaY(b.ate), 1);
              /* ⚠ O RÓTULO VAI EMBAIXO DA BARRA QUANDO ELA DESCE E O VALOR É NEGATIVO, e nunca em
                 cima dos NOMES: com tudo acima, um passo negativo de barra curta punha o número
                 sobre o número da barra vizinha. */
              /* ⚠ E SE EMBAIXO ELE CAIR NA FAIXA DOS NOMES, SOBE para cima da barra — medido no NJ jan–ago/23:
                 o "−484 k" do investimento, abaixo de uma barra rente ao chão, cobria "Investimento no período". */
              const abaixo = !b.subtotal && b.valor < 0 && y + alt + 11 <= H - PAD_BASE + 2;
              const yTxt = abaixo ? y + alt + 11 : y - 4;
              return (
                <g key={b.chave}>
                  {i > 0 && (
                    <line x1={cx - passoX + (passoX + larg) / 2} x2={x}
                      y1={escalaY(b.subtotal ? b.ate : b.de)} y2={escalaY(b.subtotal ? b.ate : b.de)}
                      stroke="#B9B6AC" strokeWidth={1} strokeDasharray="3 2" />
                  )}
                  <rect x={x} y={y} width={larg} height={alt} fill={b.cor} rx={1}>
                    <title>{`${b.rotulo}: ${formatNum(b.valor, 2)}`}</title>
                  </rect>
                  <text x={x + larg / 2} y={yTxt} fontSize={10.5} textAnchor="middle"
                    fontWeight={b.forte ? 600 : 500} fill="#3A3833">
                    {b.subtotal ? abrev(b.valor) : abrevSinal(b.valor)}
                  </text>
                  {quebrarRotulo(b.rotulo, passoX).map((linha, j) => (
                    <text key={j} x={cx + passoX / 2} y={H - PAD_BASE + 14 + j * 11} fontSize={10}
                      textAnchor="middle" fontWeight={b.forte ? 600 : 400} fill="#4B4944">{linha}</text>
                  ))}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* ⚠ LEGENDA SEM OS QUADRADINHOS — DRE-CASCATA-MODAL-01: a palavra já vem na cor da barra. */}
      <div className="flex shrink-0 items-baseline justify-between gap-3 text-[11px]" style={{ width: W }}>
        <span className="flex items-center gap-3 font-medium">
          {LEGENDA.map(l => <span key={l.rotulo} style={{ color: l.cor }}>{l.rotulo}</span>)}
        </span>
        <span className={cn('whitespace-nowrap font-medium tabular-nums', corSinal(grafico?.lucro ?? null))}>
          Resultado econômico R$ {grafico ? formatNum(grafico.lucro, 2) : traco}
        </span>
      </div>
    </div>
  );
}

/** A largura do desenho da cascata — o miolo do modal do gráfico (988 − 2 × 14 de respiro). */
export const LARGURA_CASCATA = 960;

const LEGENDA: ReadonlyArray<{ rotulo: string; cor: string }> = [
  { rotulo: 'Subtotal', cor: SUBTOTAL }, { rotulo: 'Soma', cor: SOMA },
  { rotulo: 'Subtrai', cor: SUBTRAI }, { rotulo: 'Investimento', cor: INFORMATIVA },
];

/**
 * O NOME DA BARRA EM ATÉ TRÊS LINHAS QUE CABEM NA FAIXA DELA — DRE-CASCATA-MODAL-01.
 *
 * ⚠ O LIMITE SAI DA LARGURA DA FAIXA, não de treze letras fixas: com a fonte de 10px, "Margem de
 * contribuição" em duas linhas de treze passava da faixa de 58px e encostava no nome vizinho. ~5,6px
 * por caractere é a média medida do Inter a 10px (dígitos e minúsculas). A palavra maior que a faixa
 * fica inteira numa linha própria — cortar com reticência é proibido.
 */
export function quebrarRotulo(rotulo: string, faixa: number): string[] {
  const max = Math.max(6, Math.floor((faixa - 4) / 5.6));
  return rotulo.replace(/^[=(−)\s]+/, '').split(' ').reduce<string[]>((ls, w) => {
    const u = ls[ls.length - 1];
    if (u && (u + ' ' + w).length <= max) ls[ls.length - 1] = u + ' ' + w;
    else ls.push(w);
    return ls;
  }, []).slice(0, 3);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotuloDeMes(am: string) {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || traco);
}

/**
 * AS QUINZE BARRAS — a LEI DO GRÁFICO mora aqui, e é por isso que ela é função e não corpo do
 * componente: a altura de uma barra é `ate − de`, e `ate − de` tem de ser o MÓDULO do valor dela.
 * Numa escala linear isso é a proporcionalidade inteira, e dá para prová-la sem montar um SVG.
 *
 * ⚠ SUBTOTAL SAI DO ZERO, PASSO FLUTUA a partir do acumulado — é o que separa uma ponte de um
 * gráfico de barras. E o acumulado depois de um subtotal é o PRÓPRIO subtotal, nunca a soma dos
 * passos: ele vem pronto da RPC, e recalcular abriria uma segunda verdade no arredondamento.
 *
 * ⚠ O SINAL É O DA LINHA DO DRE, NÃO O DO NÚMERO: "(−) Deduções" subtrai mesmo quando a RPC manda
 * positivo. Ler o sinal do valor faria uma dedução negativa (um estorno) somar duas vezes.
 */
export function montarBarras(col: ColunaPec | null) {
  if (!col?.linhas) return null;
  let acc = 0;
  const barras: Barra[] = [];
  for (const def of LINHAS_PEC_RESUMIDO) {
    const v = valorDaLinha(col, def);
    if (v == null) continue;
    const subtotal = def.destaque === 'subtotal' || def.destaque === 'sub';
    const subtrai = def.rotulo.trimStart().startsWith('(−)');
    const delta = subtotal ? 0 : subtrai ? -v : v;
    const forte = def.chave === 'resultado_operacional' || def.chave === 'resultado_com_mercado';
    /**
     * ⚠ O INVESTIMENTO DESENHA MAS NAO ANDA — DRE-DESTAQUE-01. Ele flutua a partir do acumulado,
     * para mostrar QUANTO pesaria, e nao altera `acc`: a cascata fecha no resultado com mercado.
     * Payback longo e depreciacao nao cabem num periodo; somar aqui fazia um ano inteiro ser lido
     * pela lente de uma compra que dura dez.
     */
    if (def.chave === 'investimento') {
      const de = acc, ate = acc + delta;
      barras.push({ chave: def.chave, rotulo: def.rotulo, valor: delta, subtotal: false, forte: false,
        de: Math.min(de, ate), ate: Math.max(de, ate), cor: INFORMATIVA, informativa: true });
      continue;
    }
    if (subtotal) {
      acc = v;
      barras.push({ chave: def.chave, rotulo: def.rotulo, valor: v, subtotal: true, forte,
        de: Math.min(0, v), ate: Math.max(0, v), cor: SUBTOTAL });
    } else {
      const de = acc; acc += delta;
      barras.push({ chave: def.chave, rotulo: def.rotulo, valor: delta, subtotal: false, forte,
        de: Math.min(de, acc), ate: Math.max(de, acc), cor: delta >= 0 ? SOMA : SUBTRAI });
    }
  }
  if (barras.length === 0) return null;
  const topo = Math.max(...barras.map(b => b.ate), 0);
  const chao = Math.min(...barras.map(b => b.de), 0);
  /* ⚠ O NUMERO DO RODAPE E' O ULTIMO SUBTOTAL, nao a ultima barra: a ultima virou o investimento,
     que e' informativa. Sem isto o rodape passaria a anunciar o investimento como resultado. */
  const ultimoSubtotal = [...barras].reverse().find(b => b.subtotal);
  return { barras, topo, chao, lucro: ultimoSubtotal?.valor ?? 0 };
}
