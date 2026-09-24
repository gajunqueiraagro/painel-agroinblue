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
const FUNDO_TOT_MOV = '#D6D4CC';
const FUNDO_GRUPO_MOV = '#E8E6DF';
const ZEBRA_MOV = '#F5F4F0';

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
/** ⚠ O EIXO EM "10 mil": 40px de margem não cabem "10.423", e o exato está em cima da barra. */
const abrevEixo = (v: number) => (Math.abs(v) >= 1000 ? `${formatNum(v / 1000, 0)} mil` : formatNum(v, 0));

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

/**
 * A ABA "MOVIMENTOS" — mock v18b.
 *
 * ⚠ O R$/@ É O REAL DE CADA LINHA, e isso muda a regra do fix3. Lá tudo era valorado ao preço do
 * REBANHO no mês do movimento, o que dava um número coerente entre si e falso em cada linha: a
 * arroba produzida não custa o preço de mercado, ela custa o CUSTEIO; a vendida não vale o preço
 * do rebanho, vale o que a nota diz. Agora cada linha traz o seu:
 *   Produzidas e Nascimentos  custeio do período ÷ @ produzidas (a conta do PC-100: custo variável
 *                             + custo fixo, sem juros, agrícola nem investimento)
 *   Compradas                 reposição ÷ @ compradas
 *   Vendas e abates           vendas ÷ @ desfrutadas, em @ VIVA
 *   Mortes, Transferências    o valor do lançamento — que a RPC não devolve, então "—"
 *   Ajustes                   "—" sempre: resíduo não tem preço
 *
 * ⚠ E POR ISSO O VALOR NÃO SOMA DE PONTA A PONTA, o que a nota do rodapé diz em voz alta: as
 * pontas estão a preço de REBANHO e os movimentos a CUSTO ou preço real. Cabeças e arrobas somam;
 * reais, não. Esconder isso faria o operador procurar um erro que não existe.
 *
 * ⚠ CABEÇA VEM DA RPC OU NÃO VEM: "Produzidas" é ganho de PESO e não move cabeça nenhuma — ali o
 * traço é a resposta certa, não um dado que falta.
 */
export function PecPonteTabela({ m, insumos, efeito, p0, p1 }: {
  m: MovimentosPec | null;
  /** Os números do DRE da coluna clicada — ver `InsumosDidaticos`. */
  insumos: { reposicao: number | null; custeio: number | null; atProduzida: number | null; vendas: number | null };
  /** ⚠ DO PRÓPRIO PAYLOAD, do MESMO período que o modal pediu. */
  efeito: number;
  p0: string; p1: string;
}) {
  const passos = useMemo(() => montarPassos(m), [m]);
  const ajuste = passos.find(x => x.chave === 'ajustes');
  const dVal = m ? m.fim.valor - m.inicio.valor : null;

  /* ⚠ A CONCILIAÇÃO FECHA COM A GRADE, E É A RAZÃO DO RODAPÉ EXISTIR:
       (v1 − v0) − efeito_mercado − reposição = vpb_operacional − reposição
     que é exatamente a linha "Variação do estoque" do Resumido. */
  const variacaoDre = dVal == null || insumos.reposicao == null
    ? null : dVal - efeito - insumos.reposicao;

  /** O R$/@ real de cada movimento. `null` = não há preço a saber, e sai em traço. */
  const divid = (num: number | null, den: number | null) =>
    (num == null || den == null || den === 0 || num === 0 ? null : num / den);
  const precoDe = (chave: string): number | null => {
    if (!m) return null;
    switch (chave) {
      case 'produzidas': case 'nascimentos': return divid(insumos.custeio, insumos.atProduzida);
      case 'compradas': return divid(insumos.reposicao, m.compradas.arrobas);
      case 'vendas_abates': return divid(insumos.vendas, m.vendas_abates.arrobas);
      /* ⚠ MORTES E TRANSFERÊNCIAS EM TRAÇO POR FALTA DE DADO, não por regra: o bloco `movimentos`
         traz o valor delas ao preço do REBANHO (o critério do fix3), e o que esta coluna pede é o
         valor LANÇADO. Medido: 722 das 1.646 mortes do banco não têm valor nenhum
         (MORTE-VALOR-OBRIGATORIO-01), então mesmo com o campo a maioria continuaria em traço. */
      default: return null;
    }
  };

  const LARG = [150, 60, 80, 90, 120] as const;
  const cel = (txt: string, cor?: string, forte?: boolean, fs = 10) => (
    <td className={cn('truncate px-1.5 py-0 text-right tabular-nums', cor, forte && 'font-medium')}
      style={{ fontSize: fs, lineHeight: 1 }}>{txt}</td>
  );

  /** Uma parcela: cabeças, arrobas, o preço real e o valor que os dois dão. */
  const linhaMov = (x: Passo) => {
    const pk = precoDe(x.chave);
    const valor = pk == null ? null : x.p.arrobas * pk;
    const sinal = x.dir === -1 ? -1 : 1;
    const cor = x.dir === -1 ? VERMELHO : VERDE;
    const cab = x.chave === 'produzidas' ? null : x.p.cabecas;
    return (
      <tr key={x.chave} style={{ height: 13, backgroundColor: ZEBRA_MOV }}>
        <td className="truncate py-0 pr-1.5 text-left italic text-muted-foreground"
          style={{ fontSize: 9, lineHeight: 1, paddingLeft: 16 }} title={x.title}>{x.rotulo}</td>
        {cel(cab == null || cab === 0 ? traco : sinalInt(sinal * cab), cor, false, 9)}
        {cel(sinalInt(sinal * x.p.arrobas), cor, false, 9)}
        {cel(pk == null ? traco : dec(pk), undefined, false, 9)}
        {cel(valor == null ? traco : sinalInt(sinal * valor), cor, false, 9)}
      </tr>
    );
  };

  /** ⚠ O GRUPO SOMA SÓ O QUE TEM NÚMERO: uma parcela sem preço não entra no valor, e o total do
     grupo deixa de ser a soma das linhas visíveis — mas somar um `null` como zero afirmaria que
     aquela morte não custou nada. */
  const linhaGrupo = (rot: string, lista: readonly Passo[], sinal: 1 | -1) => {
    if (lista.length === 0) return null;
    const cor = sinal === -1 ? VERMELHO : VERDE;
    const cab = lista.reduce((a, x) => a + x.p.cabecas, 0);
    const at = lista.reduce((a, x) => a + x.p.arrobas, 0);
    const vals = lista.map(x => { const pk = precoDe(x.chave); return pk == null ? null : x.p.arrobas * pk; });
    const valor = vals.some(v => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
    return (
      <tr style={{ height: 16, backgroundColor: FUNDO_GRUPO_MOV }}>
        <td className="truncate px-1.5 py-0 text-left font-medium" style={{ fontSize: 10, lineHeight: 1 }}>{rot}</td>
        {cel(cab === 0 ? traco : sinalInt(sinal * cab), cor, true)}
        {cel(sinalInt(sinal * at), cor, true)}
        {cel(traco, undefined, true)}
        {cel(valor == null ? traco : sinalInt(sinal * valor), cor, true)}
      </tr>
    );
  };

  /** Uma ponta: o estoque a preço de rebanho. */
  const linhaPonta = (x: Passo | undefined, mes: string) => {
    if (!x) return null;
    const pk = porAt(x.p.valor, x.p.arrobas);
    return (
      <tr style={{ height: 16, backgroundColor: FUNDO_TOT_MOV }}>
        <td className="truncate px-1.5 py-0 text-left font-medium" style={{ fontSize: 10, lineHeight: 1 }}>
          {x.chave === 'inicio' ? 'Total inicial' : 'Total final'} · {rotuloMes(mes)}
        </td>
        {cel(int(x.p.cabecas), undefined, true)}
        {cel(int(x.p.arrobas), undefined, true)}
        {cel(dec(pk), undefined, true)}
        {cel(int(x.p.valor), undefined, true)}
      </tr>
    );
  };

  const linhaConcil = (rot: string, valor: number | null, forte?: boolean) => (
    <tr style={{ height: 12, backgroundColor: '#EEF3F8' }}>
      <td colSpan={4} className={cn('truncate px-1.5 py-0 text-left', forte ? 'font-medium' : 'text-muted-foreground')}
        style={{ fontSize: 9, lineHeight: 1 }}>{rot}</td>
      {cel(valor == null ? traco : sinalInt(valor), forte ? undefined : corSinal(valor), forte, 9)}
    </tr>
  );

  if (!m) return null;
  const entradas = passos.filter(x => x.dir === 1);
  const saidas = passos.filter(x => x.dir === -1);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: LARG.reduce((a, w) => a + w, 0) }}>
          <colgroup>{LARG.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr style={{ height: 16 }}>
              {['', 'Cabeças', 'Arrobas', 'R$/@ real', 'Valor (R$)'].map((r, i) => (
                <th key={i} className={cn('sticky top-0 z-10 truncate px-1.5 py-0 font-semibold text-white',
                  i === 0 ? 'text-left' : 'text-right')}
                  style={{ backgroundColor: CAB_TABELA, fontSize: 9, lineHeight: 1 }}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhaPonta(passos.find(x => x.chave === 'inicio'), p0)}
            {linhaGrupo('Entradas', entradas, 1)}
            {entradas.map(x => linhaMov(x))}
            {linhaGrupo('Saídas', saidas, -1)}
            {saidas.map(x => linhaMov(x))}
            {ajuste && (
              <tr style={{ height: 16, backgroundColor: FUNDO_GRUPO_MOV }}>
                <td className="truncate px-1.5 py-0 text-left font-medium"
                  style={{ fontSize: 10, lineHeight: 1 }} title={ajuste.title}>Ajustes</td>
                {cel(traco, undefined, true)}
                {cel(sinalInt(ajuste.p.arrobas), corSinal(ajuste.p.arrobas), true)}
                {cel(traco, undefined, true)}
                {cel(traco, undefined, true)}
              </tr>
            )}
            {linhaPonta(passos.find(x => x.chave === 'fim'), p1)}
            {/* ⚠ AS QUATRO LINHAS DE CONCILIAÇÃO SÃO O ELO COM A GRADE, e sem elas o modal
                mostraria um número que não é o da linha clicada. */}
            {linhaConcil('Variação do valor (a preços de cada data)', dVal)}
            {linhaConcil('(−) Efeito de mercado', -efeito)}
            {linhaConcil('(−) Reposição (compras)', insumos.reposicao == null ? null : -insumos.reposicao)}
            {linhaConcil('= Variação do estoque (linha do DRE)', variacaoDre, true)}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 text-[9px] leading-[12px] text-muted-foreground">
        Cabeças e arrobas somam do início ao fim; o valor não — as pontas estão a preço de rebanho e
        os movimentos a custo ou preço real.
      </div>
    </>
  );
}

/** A aba "Gráfico": a ponte de arrobas em SVG. */
export function PecPonteGrafico({ m, p0 = '', p1 = '' }: {
  m: MovimentosPec | null; p0?: string; p1?: string;
}) {
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
  /* ⚠ 420 x 150 E CENTRALIZADO — mock v18. O desenho não precisa da largura do modal: ele tem oito
     posições e um eixo, e esticá-lo até 880 só afastava as barras umas das outras. Com 420 a ponte
     se lê de uma vez, e o que sobra dos lados é margem. */
  const W = 420, MARG_ESQ = 40, MARG_DIR = 6;
  const H = 150, PAD_TOPO = 14, PAD_BASE = 26;
  const FAIXA = W - MARG_ESQ - MARG_DIR;
  const passo = grafico ? FAIXA / grafico.barras.length : 0;
  const escalaY = (v: number) => {
    if (!grafico || grafico.topo === grafico.chao) return H - PAD_BASE;
    return PAD_TOPO + (grafico.topo - v) / (grafico.topo - grafico.chao) * (H - PAD_TOPO - PAD_BASE);
  };

  if (!m) return null;
  return (
    <>

              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-md border bg-card p-2">
                <div className="text-[10px] font-medium" style={{ color: '#0C447C' }}>
                  Evolução das arrobas · {rotuloMes(p0)} → {rotuloMes(p1)}
                </div>
                {grafico && (
                  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none" role="img" aria-label="Ponte de arrobas">
                    {[0, 0.25, 0.5, 0.75, 1].map(fr => {
                      const v = grafico.chao + (grafico.topo - grafico.chao) * fr;
                      return (
                        <g key={fr}>
                          <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(v)} y2={escalaY(v)}
                            stroke="#ECEAE4" strokeWidth={0.5} />
                          {/* ⚠ O EIXO É ABREVIADO ("10 mil") porque 40px não cabem "10.423": o
                              número exato de cada barra está em cima dela. */}
                          <text x={MARG_ESQ - 4} y={escalaY(v) + 2.5} fontSize={7.5} textAnchor="end"
                            fill="#8A8880">{abrevEixo(v)}</text>
                        </g>
                      );
                    })}
                    {/* ⚠ A LINHA DO ZERO É A LEI DA RAZÃO NO DESENHO: sem ela a altura de uma barra
                        deixa de ser lida contra uma origem, e a proporção some. */}
                    <line x1={MARG_ESQ} x2={W - MARG_DIR} y1={escalaY(0)} y2={escalaY(0)}
                      stroke="#2C2C2A" strokeWidth={0.7} />
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
                      const cx = MARG_ESQ + i * passo, larg = Math.min(passo - 14, 26);
                      const x = cx + (passo - larg) / 2;
                      const y = escalaY(b.ate), alt = Math.max(escalaY(b.de) - escalaY(b.ate), 1);
                      const val = b.x.chave === 'ajustes' ? b.x.p.arrobas
                        : b.x.dir === 0 ? b.x.p.arrobas : b.x.dir * b.x.p.arrobas;
                      return (
                        <g key={b.x.chave}>
                          {i > 0 && (
                            <line x1={cx - passo + (passo + larg) / 2} x2={x}
                              y1={escalaY(b.flutua ? b.de : b.ate)} y2={escalaY(b.flutua ? b.de : b.ate)}
                              stroke="#B9B6AC" strokeWidth={0.5} strokeDasharray="3 2" />
                          )}
                          <rect x={x} y={y} width={larg} height={alt} fill={b.x.cor} rx={1}>
                            <title>{`${b.x.rotulo}: ${formatNum(val, 0)} @`}</title>
                          </rect>
                          <text x={x + larg / 2} y={y - 2.5} fontSize={7.5} textAnchor="middle"
                            fill={b.x.dir === 1 ? '#2E7D57' : b.x.dir === -1 ? '#B23A3A' : '#3A3833'}>
                            {b.x.dir === 0 && b.x.chave !== 'ajustes' ? int(val) : sinalInt(val)}
                          </text>
                          {b.x.rotulo.replace(/^\([+−±]\)\s*/, '').split(' ').reduce<string[]>((ls, w) => {
                            const u = ls[ls.length - 1];
                            if (u && (u + ' ' + w).length <= 12) ls[ls.length - 1] = u + ' ' + w;
                            else ls.push(w);
                            return ls;
                          }, []).slice(0, 2).map((linha, j) => (
                            <text key={j} x={x + larg / 2} y={H - PAD_BASE + 9 + j * 7.5} fontSize={7}
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
