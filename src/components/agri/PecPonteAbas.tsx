/**
 * A PONTE DE ARROBAS — as abas "Movimentos" e "Gráfico" do modal da variação.
 *
 * ⚠ ELA ERA UM MODAL SEPARADO ATÉ O MODAL-UNICO-01, e deixou de ser por decisão do Gabriel: a
 * mesma linha do DRE abria duas janelas diferentes conforme o MODO da grade, com um botão ligando
 * uma à outra. Agora é um modal só, e a ponte são duas de suas cinco abas. O conteúdo não mudou
 * uma coluna — o que saiu foi o envelope (o Dialog, o cabeçalho navy e o rodapé), que agora é do
 * modal que as hospeda.
 *
 * ⚠ E ELA CONTINUA EXISTINDO PORQUE A LINHA DO RESUMIDO É COMPOSTA. "Variação do estoque" ali é
 * `vpb_operacional − reposicao` (ver `compor` em `drePecRegua`), e o modal por categoria explica
 * só `vpb_operacional`: no NJ 25/26 ele mostraria −193.238 debaixo de um número de −2.059.646. A
 * ponte de arrobas concilia os dois, e o rodapé mostra a conta inteira — por isso o Detalhado, onde
 * a linha é pura, continua abrindo o modal por categoria.
 *
 * ⚠ A PONTE TEM OITO MOVIMENTOS, NÃO QUATRO, e isso foi medido antes de desenhar: sem nascimento e
 * sem as duas transferências o resíduo da Pureza em 25/26 seria −10.846 @; com eles, −22,01. As
 * arrobas de `fn_dre_pecuaria` não servem aqui — `at_desfrutada` está em @ de CARCAÇA (÷15) e o
 * estoque em @ VIVA (÷30), e mortes não existem lá. A fonte é o bloco `movimentos` da
 * `fn_dre_pecuaria_patrimonio` (PATRIMONIO-MOVIMENTOS-01), em peso vivo.
 *
 * ⚠ AJUSTES É BARRA CINZA E RESÍDUO DECLARADO: `@1 − (@0 + entradas − saídas)`. Com ele a
 * identidade fecha exata. Ele absorve reclassificação de categoria, arredondamento mensal do cache
 * e os lançamentos sem peso. Acima de 1% do estoque inicial o `title` traz o percentual.
 *
 * ⚠ E A LINHA DE AJUSTES NÃO TEM R$/@, de propósito. O valor dos MOVIMENTOS é a @ ao preço do mês
 * do movimento e o das PONTAS é a preço da ponta; o ajuste em reais absorve também a diferença
 * entre os dois critérios, e por isso pode ter sinal oposto ao das arrobas — medido no NJ 25/26,
 * +R$ 1.487.256,52 contra −95,90 @. Dividir um pelo outro daria −15.508 R$/@, que não é preço de
 * coisa nenhuma. "—" é a sentinela certa: não há preço a saber, e não é zero.
 */
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import type { MovimentosPec, ParcelaMov } from '@/hooks/useDrePecuaria';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

const NAVY = '#0C447C';
const CAB_TABELA = '#2C3E5C';
const AZUL_CLARO = '#E9EFF6';
const CINZA_AJUSTE = '#8A8880';

const VERDE = 'text-emerald-700';
const VERMELHO = 'text-destructive';
/** ⚠ TODO NÚMERO COM SINAL GANHA COR, sem exceção — decisão do Gabriel no mock v4. */
const corSinal = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? VERDE : VERMELHO);

const traco = '—';
const int = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 0));
const dec = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
const sinalInt = (v: number | null) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 0)}`);
const sinalDec = (v: number | null) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 2)}`);
const pct = (v: number | null, base: number | null) =>
  (v == null || base == null || base === 0 ? traco
    : `${v / base > 0 ? '+' : ''}${formatNum((v / Math.abs(base)) * 100, 1)} %`);
/** R$ em milhões, para a frase de leitura. */
const mi = (v: number) => `${formatNum(v / 1_000_000, 1)} mi`;

/** R$/@ de uma linha: o valor dela dividido pelas arrobas dela. */
const porAt = (valor: number, at: number) => (at === 0 ? null : valor / at);

interface Passo {
  chave: string;
  rotulo: string;
  /** +1 entra, −1 sai, 0 é ponta ou ajuste (que tem sinal próprio). */
  dir: 1 | -1 | 0;
  p: ParcelaMov;
  /** Ajustes não tem preço; o resto tem. */
  semPreco?: boolean;
  cor: string;
  title?: string;
}

/**
 * OS PASSOS DA PONTE — a lista que a tabela e o gráfico percorrem, na mesma ordem.
 *
 * ⚠ UMA FONTE PARA AS DUAS ABAS: se cada uma montasse a sua, a primeira transferência que sumisse
 * numa e ficasse na outra passaria despercebida até alguém somar as colunas na mão.
 *
 * ⚠ NO GLOBAL AS TRANSFERÊNCIAS SE ANULAM E SOMEM: entre fazendas do mesmo cliente o que sai de
 * uma entra na outra, e duas barras de mesma altura em sentidos opostos só ocupam espaço. Some
 * quando o LÍQUIDO é zero, não quando a tela é a Global — uma transferência para fora do cliente
 * apareceria, e deve.
 */
export function montarPassos(m: MovimentosPec | null): Passo[] {
  if (!m) return [];
  const liquidoTransf = m.transf_entrada.arrobas - m.transf_saida.arrobas;
  const mostraTransf = liquidoTransf !== 0;
  const ajPct = m.inicio.arrobas > 0
    ? Math.abs(m.ajustes.arrobas) / m.inicio.arrobas * 100 : null;
  const base: Passo[] = [
    { chave: 'inicio', rotulo: 'Total de arrobas iniciais', dir: 0, p: m.inicio, cor: '#9AA6B2' },
    { chave: 'produzidas', rotulo: '(+) Produzidas', dir: 1, p: m.produzidas, cor: '#2E7D57' },
    { chave: 'nascimentos', rotulo: '(+) Nascimentos', dir: 1, p: m.nascimentos, cor: '#2E7D57' },
    { chave: 'compradas', rotulo: '(+) Compradas', dir: 1, p: m.compradas, cor: '#2E7D57' },
    ...(mostraTransf
      ? [{ chave: 'transf_entrada', rotulo: '(+) Transf. entrada', dir: 1 as const,
           p: m.transf_entrada, cor: '#2E7D57' }] : []),
    { chave: 'vendas_abates', rotulo: '(−) Vendidas e abatidas', dir: -1, p: m.vendas_abates, cor: '#B23A3A' },
    { chave: 'mortes', rotulo: '(−) Mortes', dir: -1, p: m.mortes, cor: '#B23A3A' },
    ...(mostraTransf
      ? [{ chave: 'transf_saida', rotulo: '(−) Transf. saída', dir: -1 as const,
           p: m.transf_saida, cor: '#B23A3A' }] : []),
    { chave: 'ajustes', rotulo: '(±) Ajustes', dir: 0, p: m.ajustes, cor: CINZA_AJUSTE, semPreco: true,
      title: ajPct != null && ajPct > 1
        ? `reclassificação de categoria e arredondamento mensal — ${formatNum(ajPct, 1)} % do estoque inicial`
        : 'reclassificação de categoria e arredondamento mensal' },
    { chave: 'fim', rotulo: 'Total de arrobas finais', dir: 0, p: m.fim, cor: '#9AA6B2' },
  ];
  /* ⚠ MOVIMENTO QUE NÃO ACONTECEU SOME DA TABELA E DO GRÁFICO — mas as PONTAS e o AJUSTE ficam
     sempre: a ponta zerada é informação (o rebanho começou do nada) e o ajuste em zero é a prova
     de que a ponte fechou sem resíduo. */
  return base.filter(x => x.dir === 0 || x.p.arrobas !== 0 || x.p.cabecas !== 0);
}

/** A aba "Movimentos": a evolução de arrobas e a conciliação com a linha do DRE. */
export function PecPonteTabela({ m, reposicao, efeito }: {
  m: MovimentosPec | null;
  /**
   * A REPOSIÇÃO DA COLUNA CLICADA — ela viaja com o clique, não é lida de novo.
   *
   * ⚠ SEM ELA A CONCILIAÇÃO NÃO FECHA, e com uma segunda leitura ela fecharia com o número
   * ERRADO: o da tela, não o da coluna. `null` é ausência de verdade (a coluna não tinha linha) e
   * o rodapé mostra traço em vez de fingir zero.
   */
  reposicao: number | null;
  /** ⚠ DO PRÓPRIO PAYLOAD, do MESMO período que o modal pediu. */
  efeito: number;
}) {
  const passos = useMemo(() => montarPassos(m), [m]);
  const entradas = passos.filter(x => x.dir === 1);
  const saidas = passos.filter(x => x.dir === -1);
  const somaEnt = entradas.reduce((a, x) => a + x.p.arrobas, 0);
  const somaSai = saidas.reduce((a, x) => a + x.p.arrobas, 0);
  const somaEntV = entradas.reduce((a, x) => a + x.p.valor, 0);
  const somaSaiV = saidas.reduce((a, x) => a + x.p.valor, 0);
  const ajuste = passos.find(x => x.chave === 'ajustes');

  const dAt = m ? m.fim.arrobas - m.inicio.arrobas : null;
  const pk0 = m ? porAt(m.inicio.valor, m.inicio.arrobas) : null;
  const pk1 = m ? porAt(m.fim.valor, m.fim.arrobas) : null;
  const dPk = pk0 == null || pk1 == null ? null : pk1 - pk0;
  const dVal = m ? m.fim.valor - m.inicio.valor : null;

  /* ⚠ A CONCILIAÇÃO FECHA COM A GRADE, E É A RAZÃO DO RODAPÉ EXISTIR:
       (v1 − v0) − efeito_mercado − reposição = vpb_operacional − reposição
     que é exatamente a linha "Variação do estoque" do Resumido. Medido no NJ 25/26:
       2.425.324,00 − 2.618.562,00 − 1.866.408,21 = −2.059.646,21, ao centavo. */
  const variacaoDre = dVal == null || reposicao == null ? null : dVal - efeito - reposicao;

  const produz = m ? m.produzidas.arrobas + m.nascimentos.arrobas + m.compradas.arrobas : 0;
  const vendeu = m ? m.vendas_abates.arrobas : 0;

  /* ─────────── A TABELA ─────────── */
  const LARG = ['46%', '17%', '16%', '21%'];
  const celula = (txt: string, cor?: string, forte?: boolean) => (
    <td className={cn('truncate px-2 py-0 text-right text-[11px] leading-[1.3] tabular-nums', cor, forte && 'font-medium')}>
      {txt}
    </td>
  );

  /**
   * ⚠ `solto` NÃO É ESTILO, É SIGNIFICADO. Uma linha recuada e em itálico se lê como parcela do
   * grupo acima, e a soma daquele grupo TEM de incluí-la. A de Ajustes não entra em "Saídas de
   * arrobas" — ela é um passo próprio da ponte, entre as saídas e o total final. Desenhada como
   * filha, ela fazia a subtração da tela não bater com o subtotal impresso logo acima: −46.094 de
   * saídas com uma quarta linha de −96 pendurada embaixo. Visto na homologação de 24/09.
   */
  const linhaMov = (x: Passo, solto = false) => {
    const v = x.dir === -1 ? -x.p.valor : x.p.valor;
    const at = x.dir === -1 ? -x.p.arrobas : x.p.arrobas;
    const preco = x.semPreco ? null : porAt(x.p.valor, x.p.arrobas);
    return (
      <tr key={x.chave} style={{ height: solto ? 22 : 20 }}>
        <td className={cn('truncate py-0 pr-2 text-left text-[11px] leading-[1.3]',
          solto ? 'px-2 font-medium' : 'pl-5 italic text-muted-foreground')}
          title={x.title}>{x.rotulo}</td>
        {celula(sinalInt(at), corSinal(at))}
        {celula(preco == null ? traco : dec(preco))}
        {celula(sinalInt(v), corSinal(v))}
      </tr>
    );
  };

  const linhaGrupo = (rot: string, at: number, valor: number, sinal: 1 | -1) => (
    <tr style={{ height: 22 }}>
      <td className="truncate px-2 py-0 text-left text-[11px] font-medium leading-[1.3]">{rot}</td>
      {celula(sinalInt(sinal * at), corSinal(sinal * at), true)}
      {celula(traco)}
      {celula(sinalInt(sinal * valor), corSinal(sinal * valor), true)}
    </tr>
  );

  const linhaPonta = (x: Passo | undefined, navy: boolean) => {
    if (!x) return null;
    const preco = porAt(x.p.valor, x.p.arrobas);
    return (
      <tr style={{ height: 22, backgroundColor: navy ? NAVY : AZUL_CLARO }}>
        <td className={cn('truncate px-2 py-0.5 text-left text-[11px] font-medium', navy && 'text-white')}>
          {x.rotulo}
        </td>
        <td className={cn('truncate px-2 py-0.5 text-right text-[11px] font-medium tabular-nums', navy && 'text-white')}>{int(x.p.arrobas)}</td>
        <td className={cn('truncate px-2 py-0.5 text-right text-[11px] tabular-nums', navy && 'text-white')}>{dec(preco)}</td>
        <td className={cn('truncate px-2 py-0.5 text-right text-[11px] font-medium tabular-nums', navy && 'text-white')}>{int(x.p.valor)}</td>
      </tr>
    );
  };

  const linhaConcil = (rot: string, valor: number | null, navy?: boolean) => (
    <tr style={{ height: 18, backgroundColor: navy ? NAVY : AZUL_CLARO }}>
      <td colSpan={3} className={cn('truncate px-2 py-0 text-left text-[10px] leading-none',
        navy ? 'font-medium text-white' : 'text-muted-foreground')}>{rot}</td>
      <td className={cn('truncate px-2 py-0 text-right text-[10px] leading-none tabular-nums',
        navy ? 'font-medium text-white' : corSinal(valor ?? null))}>
        {valor == null ? traco : sinalInt(valor)}
      </td>
    </tr>
  );

  if (!m) return null;
  return (
    <>

              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup>{LARG.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                  <thead>
                    <tr style={{ height: 20 }}>
                      {['', 'Qtde @', 'R$/@', 'Valor do estoque (R$)'].map((r, i) => (
                        <th key={i} className={cn('sticky top-0 z-10 truncate px-2 py-0 text-[10px] font-semibold leading-none text-white',
                          i === 0 ? 'text-left' : 'text-right')} style={{ backgroundColor: CAB_TABELA }}>
                          {r}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhaPonta(passos.find(x => x.chave === 'inicio'), false)}
                    {entradas.length > 0 && linhaGrupo('Entradas de arrobas', somaEnt, somaEntV, 1)}
                    {/* ⚠ ARROW, NUNCA `map(linhaMov)`: `Array.map` passa (item, ÍNDICE, array), e o
                        índice caía no segundo parâmetro `solto` — da segunda linha em diante o
                        recuo sumia e a parcela se lia como passo próprio. Visto na tela em 24/09. */}
                    {entradas.map(x => linhaMov(x))}
                    {saidas.length > 0 && linhaGrupo('Saídas de arrobas', somaSai, somaSaiV, -1)}
                    {saidas.map(x => linhaMov(x))}
                    {ajuste && linhaMov(ajuste, true)}
                    {linhaPonta(passos.find(x => x.chave === 'fim'), true)}
                    <tr style={{ height: 22, backgroundColor: AZUL_CLARO, borderTop: '1px solid #9a988f' }}>
                      <td className="truncate px-2 py-0 text-left text-[11px] font-medium leading-[1.3]">Diferença no período</td>
                      {celula(sinalInt(dAt), corSinal(dAt), true)}
                      {celula(sinalDec(dPk), corSinal(dPk), true)}
                      {celula(sinalInt(dVal), corSinal(dVal), true)}
                    </tr>
                    <tr style={{ height: 18, backgroundColor: AZUL_CLARO }}>
                      <td />
                      {celula(pct(dAt, m.inicio.arrobas), corSinal(dAt))}
                      {celula(pct(dPk, pk0), corSinal(dPk))}
                      {celula(pct(dVal, m.inicio.valor), corSinal(dVal))}
                    </tr>
                    {/* ⚠ AS QUATRO LINHAS DE CONCILIAÇÃO SÃO O ELO COM A GRADE, e sem elas o modal
                        mostraria um número que não é o da linha clicada. */}
                    {linhaConcil('Variação do valor (a preços de cada data)', dVal)}
                    {linhaConcil('(−) Efeito do preço (mercado)', -efeito)}
                    {linhaConcil('(−) Reposição comprada', reposicao == null ? null : -reposicao)}
                    {linhaConcil('= Variação do estoque (linha do DRE)', variacaoDre, true)}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 text-[10px] leading-[13px] text-muted-foreground">
                No início o estoque era de <strong className="font-medium tabular-nums">{int(m.inicio.arrobas)}</strong> @ a
                R$ <strong className="font-medium tabular-nums">{dec(pk0)}</strong> (R$ {mi(m.inicio.valor)}).
                Entraram <strong className="font-medium tabular-nums">{int(somaEnt)}</strong> @
                ({int(m.produzidas.arrobas)} produzidas e {int(m.compradas.arrobas)} compradas) e
                saíram <strong className="font-medium tabular-nums">{int(somaSai)}</strong> @
                ({int(m.vendas_abates.arrobas)} vendidas e {int(m.mortes.arrobas)} por morte).
                Terminou com <strong className="font-medium tabular-nums">{int(m.fim.arrobas)}</strong> @
                ({pct(dAt, m.inicio.arrobas)}), a R$ <strong className="font-medium tabular-nums">{dec(pk1)}</strong>
                {' '}({pct(dPk, pk0)}), valendo R$ <strong className="font-medium tabular-nums">{mi(m.fim.valor)}</strong>
                {' '}({pct(dVal, m.inicio.valor)}).{' '}
                {vendeu > produz
                  ? 'Vendeu mais arroba do que produziu e comprou: o estoque caiu, e o dinheiro está nas Vendas.'
                  : 'Produziu e comprou mais do que vendeu: o estoque cresceu.'}
              </div>

              {/* ⚠ O "Ver por categoria" SUMIU COM O MODAL SEPARADO — MODAL-UNICO-01. Ele existia
                  para saltar de uma janela para a outra; com as cinco abas no mesmo cabeçalho, a
                  visão por categoria está a um clique dali, e um link para a aba vizinha seria um
                  segundo caminho para o mesmo lugar. */}
              <div className="shrink-0 text-[9px] leading-[12px] text-muted-foreground">
                A diferença de R$ é a linha Variação do estoque do DRE; o efeito do preço fica em
                Efeito de mercado. Compras e vendas em dinheiro seguem nas linhas Reposição e Vendas.
              </div>
    </>
  );
}

/** A aba "Gráfico": a ponte de arrobas em SVG. */
export function PecPonteGrafico({ m }: { m: MovimentosPec | null }) {
  const passos = useMemo(() => montarPassos(m), [m]);
  const entradas = passos.filter(x => x.dir === 1);
  const saidas = passos.filter(x => x.dir === -1);
  const somaEnt = entradas.reduce((a, x) => a + x.p.arrobas, 0);
  const somaSai = saidas.reduce((a, x) => a + x.p.arrobas, 0);
  const ajuste = passos.find(x => x.chave === 'ajustes');

  /* ─────────── O GRÁFICO — ponte de arrobas ─────────── */
  const grafico = useMemo(() => {
    if (passos.length === 0) return null;
    /* Cada passo vira uma barra flutuante: as pontas saem do zero, os movimentos saem do
       acumulado. ⚠ A LEI DA RAZÃO: a ALTURA é proporcional ao VALOR, e o topo de uma barra de
       movimento é o acumulado depois dela. Sem isso a ponte vira um gráfico de barras qualquer. */
    let acc = 0;
    const barras = passos.map(x => {
      if (x.chave === 'inicio') { acc = x.p.arrobas; return { x, de: 0, ate: acc, flutua: false }; }
      if (x.chave === 'fim') return { x, de: 0, ate: x.p.arrobas, flutua: false };
      const delta = x.chave === 'ajustes' ? x.p.arrobas : x.dir * x.p.arrobas;
      const de = acc; acc += delta;
      return { x, de: Math.min(de, acc), ate: Math.max(de, acc), flutua: true };
    });
    const topo = Math.max(...barras.map(b => b.ate), 0);
    const chao = Math.min(...barras.map(b => b.de), 0);
    return { barras, topo, chao };
  }, [passos]);

  /* ⚠ A ALTURA É MEDIDA, NÃO ESCOLHIDA: o corpo do modal tem 468, menos os 24 de padding, os ~26
     da legenda com a conta e os 16 do card — sobram 380 para o desenho. Com os 210 de antes o card
     ficava METADE VAZIO e a ponte se espremia no topo (visto na tela em 24/09). */
  /* ⚠ O viewBox TEM LARGURA FIXA E O EIXO TEM MARGEM DE VERDADE — fix4. Antes ele era
     `n * 84` de largura com os rótulos do eixo em `x = 2`: esticado por `preserveAspectRatio="none"`,
     uma unidade valia menos de um pixel e os números do eixo saíam CORTADOS na borda esquerda
     (medido na homologação de 24/09). Com largura fixa de 880 — a do card a 1440 — uma unidade vale
     um pixel, e os 60 de margem são 60px de verdade. */
  const W = 880, MARG_ESQ = 60, MARG_DIR = 10;
  const H = 260, PAD_TOPO = 14, PAD_BASE = 30;
  const FAIXA = W - MARG_ESQ - MARG_DIR;
  const passo = grafico ? FAIXA / grafico.barras.length : 0;
  const escalaY = (v: number) => {
    if (!grafico || grafico.topo === grafico.chao) return H - PAD_BASE;
    return PAD_TOPO + (grafico.topo - v) / (grafico.topo - grafico.chao) * (H - PAD_TOPO - PAD_BASE);
  };

  if (!m) return null;
  return (
    <>

              <div className="flex min-h-0 flex-1 items-stretch rounded-md border bg-card p-2">
                {grafico && (
                  <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none" role="img" aria-label="Ponte de arrobas">
                    {[0, 0.25, 0.5, 0.75, 1].map(fr => {
                      const v = grafico.chao + (grafico.topo - grafico.chao) * fr;
                      return (
                        <g key={fr}>
                          <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(v)} y2={escalaY(v)}
                            stroke="#E3E1D9" strokeWidth={1} />
                          <text x={MARG_ESQ - 5} y={escalaY(v) + 3} fontSize={9} textAnchor="end"
                            fill="#8A8880">{formatNum(v, 0)}</text>
                        </g>
                      );
                    })}
                    {/* ⚠ A LINHA DO ZERO É PRETA E SÓ APARECE QUANDO HÁ NEGATIVO: sem negativo ela
                        coincide com a base da grade e seria um traço a mais dizendo o mesmo. */}
                    {grafico.chao < 0 && (
                      <>
                        <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(0)} y2={escalaY(0)}
                          stroke="#2C2C2A" strokeWidth={1} />
                        <text x={MARG_ESQ - 5} y={escalaY(0) + 3} fontSize={9} textAnchor="end" fill="#2C2C2A">0</text>
                      </>
                    )}
                    {grafico.barras.map((b, i) => {
                      const cx = MARG_ESQ + i * passo, larg = Math.min(passo * 0.58, 46);
                      const x = cx + (passo - larg) / 2;
                      const y = escalaY(b.ate), alt = Math.max(escalaY(b.de) - escalaY(b.ate), 1);
                      const val = b.x.chave === 'ajustes' ? b.x.p.arrobas
                        : b.x.dir === 0 ? b.x.p.arrobas : b.x.dir * b.x.p.arrobas;
                      return (
                        <g key={b.x.chave}>
                          {i > 0 && (
                            <line x1={cx - passo + (passo + larg) / 2} x2={x}
                              y1={escalaY(b.flutua ? b.de : b.ate)} y2={escalaY(b.flutua ? b.de : b.ate)}
                              stroke="#B9B6AC" strokeWidth={1} strokeDasharray="3 2" />
                          )}
                          <rect x={x} y={y} width={larg} height={alt} fill={b.x.cor} rx={1}>
                            <title>{`${b.x.rotulo}: ${formatNum(val, 0)} @`}</title>
                          </rect>
                          <text x={x + larg / 2} y={y - 3} fontSize={9} textAnchor="middle" fill="#3A3833">
                            {b.x.dir === 0 && b.x.chave !== 'ajustes' ? int(val) : sinalInt(val)}
                          </text>
                          {b.x.rotulo.replace(/^\([+−±]\)\s*/, '').split(' ').reduce<string[]>((ls, w) => {
                            const u = ls[ls.length - 1];
                            if (u && (u + ' ' + w).length <= 12) ls[ls.length - 1] = u + ' ' + w;
                            else ls.push(w);
                            return ls;
                          }, []).slice(0, 2).map((linha, j) => (
                            <text key={j} x={x + larg / 2} y={H - PAD_BASE + 12 + j * 9} fontSize={8.5}
                              textAnchor="middle" fill="#6B6862">{linha}</text>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
              <div className="flex shrink-0 items-baseline justify-between gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-3">
                  {([['Estoque', '#9AA6B2'], ['Entradas', '#2E7D57'], ['Saídas', '#B23A3A'],
                     ['Ajustes', CINZA_AJUSTE]] as const).map(([r, c]) => (
                    <span key={r} className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-[1px]" style={{ backgroundColor: c }} />{r}
                    </span>
                  ))}
                </span>
                <span className="truncate tabular-nums">
                  {int(m.inicio.arrobas)} + {int(somaEnt)} − {int(somaSai)}
                  {ajuste ? ` ${ajuste.p.arrobas < 0 ? '−' : '+'} ${formatNum(Math.abs(ajuste.p.arrobas), 0)}` : ''}
                  {' '}= {int(m.fim.arrobas)}
                </span>
              </div>
    </>
  );
}
