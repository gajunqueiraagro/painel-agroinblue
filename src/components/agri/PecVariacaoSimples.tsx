/**
 * AS DUAS ABAS DA VARIAÇÃO DO ESTOQUE — DRE-VARIACAO-SIMPLES-01 (mock ui-validar/variacao-simples.html; o topo do Resumo
 * pelo mock FINAL v4 `variacao-v4.html`, Chat 11/11 07:08: a frase saiu; 4 cards grandes em cima e a tabela de 3 linhas embaixo).
 *   Resumo: 4 cards (arrobas no pasto · sem efeito de mercado · efeito de mercado · valor do rebanho) · de onde veio a variação,
 *   linha por linha (quantidade · composição do rebanho · mercado, o preço médio em 3 degraus) · extrato das @ · onde aparece no
 *   DRE · um gráfico grande de cada vez.
 *   Por categoria: P8 gado jovem × adulto com subtotais e a nota do mix.
 * As contas moram em `variacaoSimples.ts`; aqui é só desenho. Fonte única: `fn_dre_pecuaria_patrimonio`
 * (mais as linhas do DRE da MESMA coluna, que viajam com o clique em `InsumosDidaticos`).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { Segmentado } from '@/components/ui/segmentado';
import { TH_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO } from '@/components/ui/regua-tabela';
import { MiniChart } from '@/components/rebanho/MiniChartDoValor';
import type { PatrimonioPec } from '@/hooks/useDrePecuaria';
import type { InsumosDidaticos } from '@/pages/PecDrePanel';
import { seriesDoVR } from '@/components/agri/variacaoExplica';
import {
  degrausDoPreco, extratoDasArrobas, mesCurto, notaDoMix, periodoCurto, porCategoria,
  type CatDaVariacao, type LinhaDaVariacao,
} from '@/components/agri/variacaoSimples';

const UP = 'text-emerald-700';
const DN = 'text-destructive';
const tomDe = (v: number | null) => (v == null || Math.round(v) === 0 ? '' : v > 0 ? UP : DN);
const sinal = (v: number, casas = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNum(Math.abs(v), casas)}`;
const traco = '—';
const pctTxt = (v: number | null) => (v == null ? traco : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNum(Math.abs(v), 1)}%`);
const pctDe = (d: number, base: number) => (base === 0 ? null : (d / Math.abs(base)) * 100);

const rsSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}R$ ${formatNum(Math.abs(v), 0)}`;
const rsAt = (v: number | null) => (v == null ? traco : `R$ ${formatNum(v, 2)}/@`);
/** "R$ 26,26 mi" · "R$ 477 mil" — o valor do rebanho no rodapé do card */
const rsCurto = (v: number) => (Math.abs(v) >= 1_000_000 ? `R$ ${formatNum(v / 1_000_000, 2)} mi` : `R$ ${formatNum(Math.round(v / 1_000), 0)} mil`);

/** Um card grande do topo (mock v4): o título, o número grande e a linha de baixo (rótulo · valor). */
function CardGrande({ testid, titulo, cor, grande, tomGrande, rotBaixo, valorBaixo, tomBaixo }: {
  testid: string; titulo: string; cor: string; grande: ReactNode; tomGrande?: string;
  rotBaixo: string; valorBaixo: ReactNode; tomBaixo?: string;
}) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-col rounded-md border bg-card px-3 py-1" style={{ borderTop: `3px solid ${cor}` }}>
      <h4 className="text-[11px] font-semibold leading-[14px] text-foreground/80">{titulo}</h4>
      <div data-card="grande" className={cn('whitespace-nowrap text-[19px] font-bold leading-[23px] tabular-nums', tomGrande)}>{grande}</div>
      <div className="mt-auto flex items-baseline justify-between gap-2 border-t pt-0.5">
        <span className="min-w-0 text-[9.5px] leading-[12px] text-muted-foreground">{rotBaixo}</span>
        <b data-card="baixo" className={cn('flex-none whitespace-nowrap text-[12px] tabular-nums', tomBaixo)}>{valorBaixo}</b>
      </div>
    </div>
  );
}

/** Os 4 cards do topo (mock v4, P2–P5). Os números saem de `degrausDoPreco` — o vpb e o efeito da RPC. */
function CardsDoTopo({ t, p0, p1 }: { t: LinhaDaVariacao; p0: string; p1: string }) {
  const d = degrausDoPreco(t);
  const dV = d.total.v1 - d.total.v0;
  const pctP1 = d.p0 == null || d.p1 == null ? null : pctDe(d.p1 - d.p0, d.p0);
  return (
    <div className="grid shrink-0 grid-cols-4 gap-1.5">
      <CardGrande testid="variacao-card-arrobas" titulo="Arrobas no pasto" cor="#24508f"
        grande={<span className="flex items-baseline gap-1.5"><span>{formatNum(Math.round(d.quantidade.at0), 0)}</span><span className="text-[12px] font-normal text-muted-foreground">→</span><span>{formatNum(Math.round(d.quantidade.at1), 0)} @</span></span>}
        rotBaixo={`${mesCurto(p0)} → ${mesCurto(p1)}`}
        valorBaixo={`${sinal(Math.round(d.quantidade.dAt))} @ · ${pctTxt(pctDe(d.quantidade.dAt, d.quantidade.at0))}`} tomBaixo={tomDe(d.quantidade.dAt)} />
      <CardGrande testid="variacao-card-producao" titulo="Sem efeito de mercado" cor="#24508f"
        grande={rsSinal(d.producao)} tomGrande={tomDe(d.producao)}
        rotBaixo="VBP" valorBaixo="linhas 1 + 2" />
      <CardGrande testid="variacao-card-mercado" titulo="Efeito de mercado" cor="#c2410c"
        grande={rsSinal(d.mercado.vale)} tomGrande={tomDe(d.mercado.vale)}
        rotBaixo="R$/@ médio hoje" valorBaixo={<>{rsAt(d.p1)} <span className={cn('text-[10px]', tomDe(pctP1))}>{pctTxt(pctP1)}</span></>} />
      <CardGrande testid="variacao-card-valor" titulo="Valor do rebanho" cor="#1e2a3d"
        grande={rsSinal(dV)} tomGrande={tomDe(dV)}
        rotBaixo={`${rsCurto(d.total.v0)} → ${rsCurto(d.total.v1)}`} valorBaixo={pctTxt(pctDe(dV, d.total.v0))} tomBaixo={tomDe(dV)} />
    </div>
  );
}

/** As larguras da tabela de 3 linhas (P1 do mock v2); "O que mudou" é a coluna que estica. */
const COLS_P1 = [24, null, 104, 18, 104, 128, 112] as const;
const H_LINHA_P1 = 26;

/**
 * P1 (mock v2) — DE ONDE VEIO A VARIAÇÃO, LINHA POR LINHA. Quantidade · tipo de gado (mistura + ágio) · mercado, e o total; o
 * preço médio ponderado da @ em 3 degraus. As contas: `degrausDoPreco` (1 + 2 = vpb da RPC; 3 = efeito da RPC).
 */
function DeOndeVeio({ t, produzido, vendido, datas }: {
  t: LinhaDaVariacao; produzido: number; vendido: number; datas: { inicio: string; fim: string };
}) {
  const d = degrausDoPreco(t);
  const at = (v: number) => `${formatNum(Math.round(v), 0)} @`;
  const difPreco = (a: number | null, b: number | null) =>
    (a == null || b == null ? traco : `${b - a > 0 ? '+' : b - a < 0 ? '−' : ''}R$ ${formatNum(Math.abs(b - a), 2)} · ${pctTxt(pctDe(b - a, a))}`);
  const subQuant = d.quantidade.dAt === 0 ? 'não mudou'
    : d.quantidade.dAt < 0 ? (vendido > produzido ? 'diminuiu · vendeu mais do que produziu' : 'diminuiu')
      : (produzido > vendido ? 'aumentou · produziu mais do que vendeu' : 'aumentou');
  const subTipo = d.p0 == null || d.pMeio == null || Math.abs(d.pMeio - d.p0) < 0.005 ? 'categorias e ágios · a mistura não mudou o preço médio'
    : d.pMeio > d.p0 ? 'categorias e ágios · mais gado de @ mais cara · preço do início' : 'categorias e ágios · mais gado de @ mais barata · preço do início';
  const linhas: { n: string; chave: string; rot: string; sub: string; antes: string; depois: string; dif: string; difTom: number | null; vale: number; forte?: boolean }[] = [
    { n: '1', chave: 'quantidade', rot: 'Quantidade de arrobas', sub: subQuant, antes: at(d.quantidade.at0), depois: at(d.quantidade.at1),
      dif: `${sinal(Math.round(d.quantidade.dAt))} @ · ${pctTxt(pctDe(d.quantidade.dAt, d.quantidade.at0))}`, difTom: d.quantidade.dAt, vale: d.quantidade.vale },
    { n: '2', chave: 'tipo', rot: 'Composição do rebanho', sub: subTipo, antes: rsAt(d.p0), depois: rsAt(d.pMeio),
      dif: difPreco(d.p0, d.pMeio), difTom: d.p0 == null || d.pMeio == null ? null : d.pMeio - d.p0, vale: d.tipo.vale },
    { n: '3', chave: 'mercado', rot: 'Mercado', sub: 'o mesmo gado de hoje, preço de hoje', antes: rsAt(d.pMeio), depois: rsAt(d.p1),
      dif: difPreco(d.pMeio, d.p1), difTom: d.pMeio == null || d.p1 == null ? null : d.p1 - d.pMeio, vale: d.mercado.vale, forte: true },
  ];
  const dV = d.total.v1 - d.total.v0;
  return (
    <div data-testid="variacao-de-onde" className="shrink-0 rounded-md border bg-card px-3 py-1.5">
      <div className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-foreground/80">
        De onde veio a variação, linha por linha
        <span className="ml-auto truncate text-[9.5px] font-normal text-muted-foreground">
          {datas.inicio} a {datas.fim} · preço médio ponderado da @ em 3 degraus
        </span>
      </div>
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>{COLS_P1.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}</colgroup>
        <thead className="bg-primary">
          <tr>{['#', 'O que mudou', 'antes', '', 'depois', 'diferença', 'vale'].map((c, i) => (
            <th key={i} className={cn(TH_REGUA, i <= 1 ? 'text-left' : 'text-right')}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.chave} data-degrau={l.chave} className="border-t" style={{ height: H_LINHA_P1 }}>
              <td className="px-1 text-[10px] text-muted-foreground">{l.n}</td>
              <td className="min-w-0 px-1 py-0">
                <div className="truncate text-[10.5px] font-semibold leading-[13px]" title={l.rot}>{l.rot}</div>
                <div className="truncate text-[9.5px] leading-[12px] text-muted-foreground" title={l.sub}>{l.sub}</div>
              </td>
              <td className={TD_REGUA_NUM}>{l.antes}</td>
              <td className="px-0 text-center text-[10px] text-muted-foreground">→</td>
              <td className={cn(TD_REGUA_NUM, l.forte && 'font-semibold')}>{l.depois}</td>
              <td className={cn(TD_REGUA_NUM, tomDe(l.difTom))}>{l.dif}</td>
              <td data-vale="" className={cn(TD_REGUA_NUM, 'font-semibold', tomDe(l.vale))}>{rsSinal(l.vale)}</td>
            </tr>
          ))}
          <tr data-degrau="total" className="border-t bg-muted font-bold" style={{ height: 22 }}>
            <td className="px-1" />
            <td className={TD_REGUA_TEXTO}>Valor do rebanho</td>
            <td className={TD_REGUA_NUM}>{`R$ ${formatNum(d.total.v0, 0)}`}</td>
            <td className="px-0 text-center text-[10px] text-muted-foreground">→</td>
            <td className={TD_REGUA_NUM}>{`R$ ${formatNum(d.total.v1, 0)}`}</td>
            <td className={cn(TD_REGUA_NUM, tomDe(dV))}>{pctTxt(pctDe(dV, d.total.v0))}</td>
            <td data-vale="" className={cn(TD_REGUA_NUM, tomDe(d.total.vale))}>{rsSinal(d.total.vale)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1 text-[9.5px] leading-[13px] text-muted-foreground">
        No DRE: <b>1 + 2 = Variação por produção ({rsSinal(d.producao)})</b>, entra no VBP · <b>3 = Efeito de mercado ({rsSinal(d.mercado.vale)})</b>,
        no Resultado econômico. Preço médio ponderado de hoje: <b>{rsAt(d.p1)}</b>.
      </div>
    </div>
  );
}

type Grafico = 'valor' | 'arrobas' | 'preco';
/** o mínimo do Chat (11/11 05:52) para o gráfico do Resumo */
const ALTURA_MIN_GRAFICO = 170;
/** O gráfico grande do Resumo (v4, Chat 11/11 08:35): a linha passa pelo mês do cadastro, eixo "jan fev mar…", sem a legenda da base. */
const GRANDE = { ligarFalhas: true, semLegendaDaBase: true, chaveEixo: 'eixo', fonteEixo: 9, margemDireita: 14 } as const;

export function ResumoDaVariacao({ patrimonio, cats, insumos, datas }: {
  patrimonio: PatrimonioPec;
  cats: readonly CatDaVariacao[];
  insumos: InsumosDidaticos;
  datas: { inicio: string; fim: string };
}) {
  const { total: T } = useMemo(() => porCategoria(cats), [cats]);
  const ex = useMemo(() => extratoDasArrobas(T.at0, T.at1, patrimonio.movimentos, datas), [T, patrimonio, datas]);
  const [grafico, setGrafico] = useState<Grafico>('valor');
  /* o eixo do gráfico grande em "jan fev mar…" (v4, Chat 11/11 08:35), o 1º ponto é o mês de P0 */
  const s = useMemo(() => {
    const v = seriesDoVR(patrimonio.meses);
    const eixo = <T extends object>(pts: T[]) => pts.map((p, i) => ({ ...p, eixo: mesCurto(patrimonio.meses[i]?.ano_mes ?? '').slice(0, 3) }));
    return { valor: eixo(v.valor), arrobas: eixo(v.arrobas), preco: eixo(v.preco) };
  }, [patrimonio.meses]);
  const at = (v: number) => `${formatNum(Math.round(v), 0)} @`;
  const rep = insumos.reposicao ?? 0;
  /* P7 — o gráfico OCUPA A ALTURA QUE SOBRA (ajuste do Chat 11/11 05:52: modal sem rolagem): a área se mede e o MiniChart recebe o número */
  const areaRef = useRef<HTMLDivElement>(null);
  const [alturaArea, setAlturaArea] = useState(ALTURA_MIN_GRAFICO);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setAlturaArea(Math.floor(el.clientHeight));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* o MiniChart põe o título (~14px) em cima e a legenda (~18px, nos 3 gráficos: a base do Início também tem legenda) embaixo;
     medido no gate de 11/11: com 16 a área passava 9px */
  /* sem o título (o segmentado já diz qual) e sem a legenda da base; só o Valor tem legenda (~16px); + os 4px da margem de cima */
  const alturaGrafico = Math.max(80, alturaArea - (grafico === 'valor' ? 22 : 6));

  /* P6 — as linhas do DRE da coluna clicada; a Reposição só quando ≠ 0, para o "= VBP" fechar (decisão do Gabriel 10/11) */
  const dre: { rot: string; v: number | null; nota: string; eq?: boolean; tom?: boolean; chave: string }[] = [
    { chave: 'receita_liquida', rot: 'Receita líquida (vendas)', v: insumos.receitaLiquida, nota: 'dinheiro que entrou' },
    { chave: 'producao', rot: 'Variação por produção', v: T.producao, tom: true,
      nota: T.dAt === 0 ? 'as mesmas @' : `${formatNum(Math.round(Math.abs(T.dAt)), 0)} @ ${T.dAt > 0 ? 'a mais' : 'a menos'}` },
    ...(rep !== 0 ? [{ chave: 'reposicao', rot: '(−) Reposição', v: -rep, nota: 'compra de gado' }] : []),
    { chave: 'vbp', rot: '= VBP (o que a fazenda produziu)', v: insumos.vbp, nota: '', eq: true },
    { chave: 'custos', rot: '… custos, despesas e juros …', v: null, nota: '' },
    { chave: 'mercado', rot: 'Efeito de mercado', v: T.mercado, tom: true,
      nota: T.mercado === 0 ? '' : T.mercado > 0 ? 'arroba valorizou' : 'arroba desvalorizou' },
    { chave: 'resultado_com_mercado', rot: '= Resultado econômico', v: insumos.resultadoComMercado, nota: 'com o mercado', eq: true },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" data-testid="variacao-resumo">
      {/* mock v4: os 4 cards grandes em cima e a tabela de 3 linhas embaixo (a frase saiu) */}
      <CardsDoTopo t={T} p0={patrimonio.p0} p1={patrimonio.p1} />
      <DeOndeVeio t={T} produzido={ex.produzido} vendido={ex.vendido} datas={datas} />

      {/* ⚠ EXTRATO · DRE · GRÁFICO NUMA GRADE SÓ. Janela alta: o gráfico desce para a linha de baixo, nas duas colunas, e fica com o
          que sobra (mín. 170px). Janela até 820px de altura (1366×768, 1126×579): com os 4 cards e a tabela de 3 linhas (mock v4) não
          sobram 170px embaixo — medido 135 em 1366×768 —, e ele vira a 3ª coluna ao lado do extrato e do DRE. O modal nunca rola. */}
      <div className={cn('grid min-h-0 flex-1 gap-1.5 grid-cols-[1fr_1.25fr] grid-rows-[auto_minmax(170px,1fr)]',
        '[@media(max-height:820px)]:grid-cols-[1fr_1fr_1fr] [@media(max-height:820px)]:grid-rows-[minmax(0,1fr)]')}>
        {/* P5 */}
        <div data-testid="variacao-extrato" className="min-w-0 rounded-md border bg-card px-3 py-1.5">
          <div className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-foreground/80">
            Por que as arrobas mudaram <span className="ml-auto text-[9.5px] font-normal text-muted-foreground">como um extrato</span>
          </div>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup><col /><col style={{ width: 64 }} /></colgroup>
            <tbody>
              {ex.linhas.map(l => (
                <tr key={l.chave} data-extrato={l.chave} className={cn('border-t', l.total && 'bg-muted/60 font-semibold')}>
                  <td className={TD_REGUA_TEXTO} title={l.rotulo}>{l.rotulo}</td>
                  <td className={cn(TD_REGUA_NUM, !l.total && tomDe(l.arrobas))}>
                    {l.total ? formatNum(Math.round(l.arrobas), 0) : sinal(Math.round(l.arrobas))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[9.5px] leading-[13px] text-muted-foreground">
            Produzido = ganho de peso + nascimentos = <b>{at(ex.produzido)}</b> · vendido = <b>{at(ex.vendido)}</b>.
          </div>
        </div>

        {/* P6 */}
        <div data-testid="variacao-no-dre" className="min-w-0 rounded-md border bg-card px-3 py-1.5">
          <div className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-foreground/80">
            <span className="whitespace-nowrap">Onde isso aparece no DRE</span>
            <span className="ml-auto whitespace-nowrap text-[9.5px] font-normal text-muted-foreground">{periodoCurto(patrimonio.p0, patrimonio.p1)}</span>
          </div>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            {/* ⚠ JANELA BAIXA: a coluna das notas some (o DRE fica com 1/3 da largura, ao lado do gráfico) para os rótulos caberem inteiros */}
            <colgroup><col /><col style={{ width: 80 }} /><col className="w-[118px] [@media(max-height:820px)]:w-0" /></colgroup>
            <tbody>
              {dre.map(l => (
                <tr key={l.chave} data-dre={l.chave} className={cn('border-t', l.eq && 'bg-muted/60 font-semibold')}>
                  <td className={TD_REGUA_TEXTO} title={l.rot}>{l.rot}</td>
                  <td className={cn(TD_REGUA_NUM, l.tom && tomDe(l.v))}>
                    {l.chave === 'custos' ? '' : l.v == null ? traco : l.tom ? sinal(l.v) : `${l.v < 0 ? '−' : ''}${formatNum(Math.abs(l.v), 0)}`}
                  </td>
                  <td className={cn(TD_REGUA_TEXTO, 'text-[9.5px] text-muted-foreground [@media(max-height:820px)]:hidden')} title={l.nota}>{l.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[9.5px] leading-[13px] text-muted-foreground">
            A produção entra no VBP; a sorte do mercado fica separada, no resultado econômico.
          </div>
        </div>

      {/* P7 — um gráfico grande de cada vez, o do Valor do rebanho */}
      <div data-testid="variacao-grafico" className="col-span-2 flex min-h-0 min-w-0 flex-col rounded-md border bg-card px-3 py-1.5 [@media(max-height:820px)]:col-span-1">
        <div className="mb-0.5 flex shrink-0 items-center gap-2 text-[11px] font-semibold text-foreground/80">
          <span className="[@media(max-height:820px)]:hidden">Mês a mês</span>
          <Segmentado<Grafico> className="ml-auto" altura={22} valor={grafico} onEscolher={setGrafico}
            opcoes={[{ valor: 'valor', rotulo: 'Valor do rebanho' }, { valor: 'arrobas', rotulo: 'Arrobas' }, { valor: 'preco', rotulo: 'Preço médio da @' }]} />
        </div>
        {/* mock v4 (b): margem interna — o gráfico não encosta nas bordas do bloco */}
        <div ref={areaRef} data-testid="variacao-grafico-area" className="min-h-0 flex-1 overflow-hidden px-3 pt-1">
          {patrimonio.meses.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{traco}</div>
          ) : grafico === 'valor' ? (
            <MiniChart {...GRANDE} altura={alturaGrafico} title="" unit="currency" color="hsl(var(--primary))"
              serie2 rotulo1="valor real" rotulo2="sem mercado (preço do início)" data={s.valor} />
          ) : grafico === 'arrobas' ? (
            <MiniChart {...GRANDE} altura={alturaGrafico} title="" unit="arroba" color="hsl(142, 71%, 45%)" data={s.arrobas} />
          ) : (
            <MiniChart {...GRANDE} altura={alturaGrafico} title="" unit="currency" color="hsl(217, 91%, 60%)" data={s.preco} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/** As larguras medidas da P8 (soma 830): o nome com "…" + title; número nunca corta. */
const COLS_P8 = [190, 66, 66, 62, 72, 72, 56, 82, 82, 82] as const;
const CAB_P8 = ['Categoria', '@ início', '@ fim', 'Δ @', 'R$/@ início', 'R$/@ fim', 'Δ %', 'Produção', 'Mercado', 'Total'];

export function PorCategoriaDaVariacao({ cats }: { cats: readonly CatDaVariacao[] }) {
  const { grupos, total } = useMemo(() => porCategoria(cats), [cats]);
  const nota = useMemo(() => notaDoMix(total, grupos.flatMap(g => g.cats)), [total, grupos]);
  const n = (v: number | null, c = 0) => (v == null ? traco : formatNum(v, c));
  const linha = (l: LinhaDaVariacao, tipo: 'grupo' | 'cat' | 'total', key: string) => (
    <tr key={key} data-linha={tipo} className={cn('border-t', tipo === 'grupo' && 'bg-muted/60 font-semibold', tipo === 'total' && 'bg-muted font-bold')}>
      <td className={TD_REGUA_TEXTO} title={l.nome} style={tipo === 'cat' ? { paddingLeft: 14 } : undefined}>{l.nome}</td>
      <td className={TD_REGUA_NUM}>{n(l.at0)}</td>
      <td className={TD_REGUA_NUM}>{n(l.at1)}</td>
      <td className={cn(TD_REGUA_NUM, tomDe(l.dAt))}>{sinal(Math.round(l.dAt))}</td>
      <td className={TD_REGUA_NUM}>{n(l.pk0, 2)}</td>
      <td className={TD_REGUA_NUM}>{n(l.pk1, 2)}</td>
      <td className={cn(TD_REGUA_NUM, tomDe(l.dPkPct))}>{pctTxt(l.dPkPct)}</td>
      <td className={cn(TD_REGUA_NUM, tomDe(l.producao))}>{sinal(l.producao)}</td>
      <td className={cn(TD_REGUA_NUM, tomDe(l.mercado))}>{sinal(l.mercado)}</td>
      <td className={cn(TD_REGUA_NUM, tomDe(l.total))}>{sinal(l.total)}</td>
    </tr>
  );
  return (
    <div data-testid="variacao-por-categoria" className="rounded-md border bg-card px-3 py-2">
      <div className="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-foreground/80">
        Por categoria
        <span className="ml-auto truncate text-[9.5px] font-normal text-muted-foreground">
          produção ao preço do início · mercado = @ de hoje × diferença de preço
        </span>
      </div>
      <div>
        <table className="border-collapse" style={{ tableLayout: 'fixed', width: COLS_P8.reduce((a, w) => a + w, 0) }}>
          <colgroup>{COLS_P8.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead className="bg-primary">
            <tr>{CAB_P8.map((c, i) => <th key={c} className={cn(TH_REGUA, i === 0 ? 'text-left' : 'text-right')}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {cats.length === 0 ? (
              <tr><td colSpan={COLS_P8.length} className={cn(TD_REGUA_TEXTO, 'text-center text-muted-foreground')}>{traco}</td></tr>
            ) : (
              <>
                {grupos.flatMap(g => [linha(g.subtotal, 'grupo', g.titulo), ...g.cats.map((c, i) => linha(c, 'cat', `${g.titulo}:${i}`))])}
                {linha(total, 'total', 'total')}
              </>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div data-testid="variacao-nota-mix" className="mt-1 text-[9.5px] leading-[13px] text-muted-foreground">{nota}</div>}
    </div>
  );
}
