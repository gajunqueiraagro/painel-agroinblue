/**
 * DRE DA LAVOURA — a grade única, por safra, em custo operacional efetivo.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_lavoura` devolve cada linha já arredondada, por cultura e no
 * total, e esta tela RENDERIZA. As únicas contas são as duas divisões que o contrato deixa
 * explicitamente ao consumidor — `valor / area_ha` e `valor / producao` — e a soma nomeada
 * `valorTotalDoCentro`, que existe só porque `centros[].total` não traz `valor`.
 *
 * ⚠ ELA NASCE DO `AgriDreCulturaTab` (mesmo esqueleto de tabela) e convive com ele: o PR-02
 * aposenta a tela antiga e o Resultado do Painel. Até lá as duas respondem, e é de propósito —
 * é assim que se confere uma contra a outra.
 *
 * ⚠ A ORDEM DAS LINHAS É O DRE (padrão Conab), e ela mora AQUI, não no banco: `fn_dre_lavoura`
 * devolve um objeto de 15 chaves sem ordem, porque JSON não tem ordem. Quem sabe que "margem de
 * contribuição" vem depois do custo variável é a apresentação.
 */
import { Fragment, useMemo, useState, useEffect } from 'react';
import { Maximize2, Minimize2, AlertTriangle, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { supabase } from '@/integrations/supabase/client';
import { RateioDetalheModal, type RateioDetalhe, type TipoRateio } from '@/components/agri/RateioDetalheModal';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { useSafrasLavoura } from '@/hooks/useAreaPlantada';
import { useCliente } from '@/contexts/ClienteContext';
import {
  useDreLavoura, valorTotalDoCentro,
  type ChaveLinha, type DreCentro, type DreCultura, type DreLavoura, type DreValor,
} from '@/hooks/useDreLavoura';

/* ─────────────────────────── A RÉGUA DAS COLUNAS ───────────────────────────
   ⚠ px FIXOS, e `table-layout: fixed`: número não quebra e não encolhe. Porcentagem faria as
   colunas seguirem a janela, e "3.009.508,69" partido em duas linhas desalinha a coluna inteira.
   A coluna vazia do fim absorve a sobra — é ela que deixa a tabela caber sem esticar números. */
const W_CULTURA = 240;
const W_RS = 104;      // R$ por cultura
const W_HA = 76;       // R$/ha
const W_UN = 60;       // R$/unidade
const W_RS_TOTAL = 108;

/** Bloco do DRE que cada grupo expansível abre. */
type Bloco = DreCentro['bloco'];

/**
 * A ANATOMIA DE UMA LINHA, declarada — não quinze blocos de JSX.
 *
 * ⚠ QUINZE LINHAS ESCRITAS À MÃO DIVERGEM NA PRIMEIRA CORREÇÃO: bastaria um `text-destructive`
 * esquecido para uma delas mentir sobre o sinal. Aqui a diferença entre elas é DADO.
 */
interface DefLinha {
  chave: ChaveLinha;
  rotulo: string;
  /** `custo` pinta de vermelho, `receita` de verde, `neutro` não pinta. */
  tom: 'receita' | 'custo' | 'neutro';
  /** Subtotal: fundo, peso 600. `sinal` = a cor vem do próprio número, por cultura. */
  destaque?: 'subtotal' | 'sub' | null;
  corPorSinal?: boolean;
  /** Grupo que abre em centros. */
  bloco?: Bloco;
  /** Etiqueta cinza-âmbar depois do rótulo. */
  etiqueta?: string;
  /** Some no modo "dentro dos centros" — o rateio passa a viver dentro dos grupos. */
  someComRateioDentro?: boolean;
}

const LINHAS: DefLinha[] = [
  { chave: 'receita_bruta',          rotulo: 'Receita bruta',                   tom: 'receita' },
  { chave: 'deducoes',               rotulo: '(−) Deduções',                    tom: 'custo' },
  { chave: 'receita_liquida',        rotulo: '= Receita líquida',               tom: 'receita', destaque: 'subtotal' },
  { chave: 'custeio',                rotulo: '(−) Custeio da lavoura',          tom: 'custo', bloco: 'custeio' },
  { chave: 'pos_colheita',           rotulo: '(−) Pós-colheita',                tom: 'custo', bloco: 'pos_colheita' },
  { chave: 'rateio_compartilhado',   rotulo: '(−) Rateio compartilhado',        tom: 'custo', etiqueta: 'estimado', someComRateioDentro: true },
  { chave: 'custo_variavel',         rotulo: '= Custo variável',                tom: 'custo', destaque: 'sub' },
  { chave: 'margem_contribuicao',    rotulo: '= Margem de contribuição',        tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo',             rotulo: '(−) Custo fixo da lavoura',       tom: 'custo', bloco: 'fixo' },
  { chave: 'rateio_admin',           rotulo: '(−) Rateio administrativo',       tom: 'custo', etiqueta: 'estimado' },
  { chave: 'resultado_operacional',  rotulo: '= Resultado operacional',         tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros',                  rotulo: '(−) Despesas financeiras (juros)', tom: 'custo' },
  { chave: 'resultado_caixa',        rotulo: '= Resultado de caixa',            tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento',           rotulo: 'Investimento no período',         tom: 'neutro', bloco: 'investimento' },
  { chave: 'depreciacao',            rotulo: 'Depreciação (reservada · o custo operacional total = efetivo + depreciação nasce aqui)', tom: 'neutro' },
];

/** Onde entra a faixa "abaixo da linha de caixa". */
const APOS_CAIXA: ChaveLinha = 'resultado_caixa';

/** As chaves que o modal do Painel sabe abrir, e com que `tipo`. */
const TIPO_DO_MODAL: Partial<Record<ChaveLinha, 'admin'>> = { rateio_admin: 'admin' };

const corDoTom = (tom: DefLinha['tom']) =>
  (tom === 'receita' ? 'text-success' : tom === 'custo' ? 'text-destructive' : '');

/** ⚠ A COR DO SUBTOTAL VEM DO PRÓPRIO NÚMERO, célula a célula: numa safra o amendoim pode fechar
    positivo e a mandioca negativa, e uma cor só para a linha mentiria sobre uma das duas. */
const corDoSinal = (v: number | null) =>
  (v == null ? '' : v < 0 ? 'text-destructive' : 'text-success');

const traco = '—';
/** Com "R$" — para a faixa, os títulos e os `title`, onde não há cabeçalho declarando a unidade. */
const dinheiro = (v: number | null | undefined) => (v == null ? traco : formatMoeda(v));
/**
 * SEM "R$" — só dentro da grade, e a razão é a régua, medida no harness.
 *
 * ⚠ A UNIDADE JÁ ESTÁ NO CABEÇALHO: a segunda linha do thead é literalmente "R$ | R$/ha | R$/sc".
 * Repeti-la em cada célula não acrescenta informação e custa 17px por número — e a coluna tem
 * 104px, dos quais 90 são úteis. Medido: "R$ 2.925.162,25" ocupa 90,1px (estoura por 0,1px já no
 * dado real do NJ) e "R$ 12.345.678,90" ocupa 97,3px. Sem o prefixo, os mesmos números dão 73,1 e
 * 80,2 — e até 123.456.789,01 cabe, com 87,3. A régua de 104px do briefing só fecha assim.
 * ⚠ E ISTO NÃO É "NÚMERO CRU" (A19): dinheiro sem unidade é o que a regra proíbe, e aqui a
 * unidade é declarada uma vez, no alto da coluna, em vez de repetida mil vezes embaixo dela.
 */
const numeroDaCelula = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
/** ⚠ DIVISÃO É A ÚNICA CONTA QUE O CONTRATO DEIXA AQUI. Denominador zero vira traço, não Infinity. */
const porUnidade = (v: number | null | undefined, den: number) =>
  (v == null || !(den > 0) ? traco : formatNum(v / den, 2));

export function AgriDreLavouraTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  const { dre, carregando, erro } = useDreLavoura(clienteId, safraId || null);

  /* ⚠ TRÊS CONTROLES DE APRESENTAÇÃO, e nenhum deles refaz consulta: o payload já traz `direto`,
     `rateado` e `valor` em cada linha. Trocar de modo é escolher qual ler. */
  const [rateioDentro, setRateioDentro] = useState(false);
  const [mostrarUnitarios, setMostrarUnitarios] = useState(true);
  const [ampliado, setAmpliado] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  /* ─────────────────── O MODAL DO PAINEL, REUSADO COMO ESTÁ ───────────────────
   * ⚠ NENHUM MODAL NOVO: o `RateioDetalheModal` do Painel da Safra já responde às três chaves
   * que `fn_painel_rateio_detalhe` conhece — natureza (o centro), investimento e admin. O de
   * três abas que o briefing cogita NÃO EXISTE no repo (o do Painel tem duas: Rateio e
   * Lançamentos), e a FASE 0 manda reportar em vez de construir.
   * ⚠ UMA CONSULTA POR CLIQUE, como no Painel — e a mesma regra de lá: pool zero numa linha
   * que não é admin significa "não há o que repartir", e aí não se abre modal nenhum. Aqui o
   * caminho alternativo (o drawer) é do PR-02, então o clique simplesmente não abre.
   */
  const [rateio, setRateio] = useState<
    { dados: RateioDetalhe; tipo: TipoRateio; titulo: string } | null>(null);

  const abrir = (tipo: TipoRateio, chave: string, rotulo: string, cultura: string) => {
    if (!clienteId || !safraId) return;
    void (async () => {
      const { data } = await (supabase as any).rpc('fn_painel_rateio_detalhe', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_tipo: tipo, p_chave: chave,
      });
      const d = data as RateioDetalhe | null;
      if (!d || (tipo !== 'admin' && d.pool <= 0)) return;
      const s = safras.find(x => x.id === safraId);
      setRateio({
        dados: d, tipo,
        titulo: `${rotulo} · ${labelDaCultura(cultura)}`
          + (s ? ` · Safra ${s.codigo || s.nome}` : ''),
      });
    })();
  };

  /* ⚠ `Esc` SAI DO AMPLIAR — o botão flutuante é o caminho do mouse, e quem ampliou com o teclado
     espera sair por ele. Sem isto o operador fica preso numa tela sem cabeçalho. */
  useEffect(() => {
    if (!ampliado) return;
    const sai = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false); };
    window.addEventListener('keydown', sai);
    return () => window.removeEventListener('keydown', sai);
  }, [ampliado]);

  const culturas = dre?.culturas ?? [];
  const poolTotal = useMemo(
    () => Object.values(dre?.pool_compartilhado ?? {}).reduce((a, b) => a + b, 0),
    [dre]);

  const centrosDoBloco = (b: Bloco) => (dre?.centros ?? []).filter(c => c.bloco === b);

  /** O valor de um grupo no modo escolhido: `direto` em linha própria, `valor` com rateio dentro. */
  const valorDaLinha = (l: DreValor, def: DefLinha): number | null =>
    (rateioDentro || !def.bloco ? l.valor : (l.direto ?? l.valor));

  const colsPorCultura = mostrarUnitarios ? 3 : 1;

  if (!dre && !carregando && !erro) return null;

  return (
    <div className={cn('w-full space-y-2 p-3 animate-fade-in',
      /* ⚠ AMPLIAR É O MECANISMO DO FINANCEIRO (`modoIntensivo`), não um segundo: posição fixa por
         cima de tudo, e o cartão da tabela ganha a tela. O rótulo de saída é "Reduzir" porque é
         o par de "Ampliar" nesta tela; o Financeiro usa "Retornar" no dele. */
      ampliado && 'fixed inset-0 z-50 overflow-hidden bg-background p-2')}>
      {!ampliado && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <PageHeader titulo="DRE"
              subtitulo={`${clienteAtual?.nome ?? '—'} · por safra · custo operacional efetivo`} />
            <div className="flex flex-wrap items-center gap-2">
              {/* ⚠ PECUÁRIA E CONSOLIDADO NASCEM DESLIGADOS E VISÍVEIS: eles dizem para onde a
                  tela vai, e escondê-los faria a Lavoura parecer a única resposta possível. */}
              <div className="flex h-[22px] overflow-hidden rounded-md border">
                {(['Lavoura', 'Pecuária', 'Consolidado'] as const).map(a => (
                  <button key={a} type="button" disabled={a !== 'Lavoura'}
                    title={a === 'Lavoura' ? undefined : 'em breve'}
                    className={cn('px-2 text-[10px] font-medium transition-colors',
                      a === 'Lavoura' ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground disabled:opacity-50')}>
                    {a}
                  </button>
                ))}
              </div>
              <Select value={safraId} onValueChange={setSafraId}>
                <SelectTrigger className="h-[22px] w-[150px] text-[10px]">
                  <SelectValue placeholder="Safra" />
                </SelectTrigger>
                <SelectContent>
                  {safras.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-[12px]">
                      {s.codigo || s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setAmpliado(true)}
                title="Ampliar a grade (só a tabela)"
                className="inline-flex h-[22px] items-center gap-1 rounded-md border px-2 text-[10px] hover:bg-muted">
                <Maximize2 className="h-3 w-3" /> Ampliar
              </button>
            </div>
          </div>

          <Faixa dre={dre} />

          <div className="flex h-[18px] flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>
              {formatMoeda(poolTotal)} em custos comuns rateados por área — estimativa, não lançamento.
              {rateioDentro && <> {' · '}<span className="text-amber-700">●</span> ao lado do valor = tem rateio dentro.</>}
            </span>
            <span className="flex items-center gap-2">
              Rateio compartilhado:
              <span className="flex h-[22px] overflow-hidden rounded-md border">
                {([[false, 'em linha própria'], [true, 'dentro dos centros']] as const).map(([v, r]) => (
                  <button key={r} type="button" onClick={() => setRateioDentro(v)}
                    className={cn('px-2 text-[10px] font-medium transition-colors',
                      rateioDentro === v ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                    {r}
                  </button>
                ))}
              </span>
              <span className="flex items-center gap-1">
                <Checkbox checked={mostrarUnitarios}
                  onCheckedChange={c => setMostrarUnitarios(c === true)} />
                <Label className="text-[10px] font-normal">/ha e /sc</Label>
              </span>
            </span>
          </div>
        </>
      )}

      {ampliado && (
        <button type="button" onClick={() => setAmpliado(false)}
          title="Reduzir (Esc)"
          className="fixed right-3 top-3 z-[60] inline-flex h-[22px] items-center gap-1 rounded-md border bg-card px-2 text-[10px] shadow hover:bg-muted">
          <Minimize2 className="h-3 w-3" /> Reduzir
        </button>
      )}

      {/* ⚠ UM SCROLLPORT SÓ, e é o cartão: o cabeçalho gruda dentro dele (`sticky`) e a coluna
          Cultura gruda à esquerda. Duas barras fariam rolar a de dentro sem mover o cabeçalho. */}
      <div className="overflow-auto rounded-lg border border-border/60 bg-card"
        style={{ maxHeight: ampliado ? 'calc(100vh - 14px)' : 'calc(100vh - 212px)' }}>
        {erro ? (
          <div className="px-3 py-8 text-center text-[11px] text-destructive">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Não foi possível carregar o DRE — o dado continua no banco.
          </div>
        ) : carregando || !dre ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
          </div>
        ) : (
          <Grade dre={dre} culturas={culturas} abertos={abertos} setAbertos={setAbertos}
            rateioDentro={rateioDentro} mostrarUnitarios={mostrarUnitarios}
            colsPorCultura={colsPorCultura} centrosDoBloco={centrosDoBloco}
            valorDaLinha={valorDaLinha} abrir={abrir} />
        )}
      </div>

      {/* ⚠ SÓ APARECE COM SOBRA: `nao_apropriado` zero significa que toda cultura lançada está
          plantada nesta safra — e um aviso permanente ensinaria a ignorá-lo. */}
      {!!dre && dre.nao_apropriado.total > 0 && (
        <p className="text-[10px] text-amber-700">
          {formatMoeda(dre.nao_apropriado.total)} em lançamentos com cultura que não está plantada
          nesta safra — fora do DRE até ajustar.
        </p>
      )}

      {rateio && (
        <RateioDetalheModal aberto onFechar={() => setRateio(null)}
          titulo={rateio.titulo} dados={rateio.dados} tipo={rateio.tipo} />
      )}
    </div>
  );
}

/** As seis caixas do topo. */
function Faixa({ dre }: { dre: DreLavoura | null }) {
  if (!dre) return null;
  const t = dre.total;
  const res = t.linhas.resultado_caixa.valor;
  const resHa = t.linhas.resultado_caixa.por_ha ?? null;
  const caixas: { rotulo: string; valor: string; cor?: string; sub?: string }[] = [
    { rotulo: 'Área plantada', valor: `${formatNum(t.area_ha, 2)} ha` },
    { rotulo: 'Receita líquida', valor: dinheiro(t.linhas.receita_liquida.valor), cor: 'text-success' },
    { rotulo: 'Custo operacional efetivo', valor: dinheiro(t.custo_operacional), cor: 'text-destructive',
      sub: t.a_pagar.operacional > 0 ? `a pagar ${formatMoeda(t.a_pagar.operacional)}` : undefined },
    { rotulo: 'Resultado de caixa', valor: dinheiro(res), cor: corDoSinal(res) },
    { rotulo: 'Resultado por hectare', valor: resHa == null ? traco : `${formatNum(resHa, 2)}`, cor: corDoSinal(resHa) },
    { rotulo: 'Custos apropriados direto', valor: `${formatNum(t.pct_direto, 0)} %` },
  ];
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
      {caixas.map(c => (
        <div key={c.rotulo} className="min-w-0 rounded-md border border-border/60 bg-card px-2 py-1"
          style={{ height: 32 }}>
          <div className="truncate text-[10px] leading-none text-muted-foreground">{c.rotulo}</div>
          <div className={cn('mt-0.5 flex items-baseline gap-1 whitespace-nowrap leading-none')}>
            <span className={cn('truncate text-[14px] font-medium tabular-nums', c.cor)}>{c.valor}</span>
            {c.sub && <span className="truncate text-[10px] text-muted-foreground">{c.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════ A GRADE ═══════════════════════════════ */

/** O que um clique num valor precisa dizer para o modal do Painel. */
type AbrirRateio = (tipo: TipoRateio, chave: string, rotulo: string, cultura: string) => void;

interface PropsGrade {
  dre: DreLavoura;
  culturas: DreCultura[];
  abertos: Record<string, boolean>;
  setAbertos: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  rateioDentro: boolean;
  mostrarUnitarios: boolean;
  colsPorCultura: number;
  centrosDoBloco: (b: Bloco) => DreCentro[];
  valorDaLinha: (l: DreValor, def: DefLinha) => number | null;
  abrir: AbrirRateio;
}

/** Divisória entre grupos de coluna — a mesma nas duas linhas do cabeçalho e no corpo. */
const DIVISOR = '1px solid rgba(255,255,255,.22)';

function Grade({
  dre, culturas, abertos, setAbertos, rateioDentro, mostrarUnitarios,
  colsPorCultura, centrosDoBloco, valorDaLinha, abrir,
}: PropsGrade) {
  /* ⚠ A RÉGUA NASCE UMA VEZ E SERVE AO `<colgroup>` E À LARGURA MÍNIMA. Escrever as larguras no
     `<col>` e repeti-las no `style` de cada `<td>` é o caminho conhecido para as duas listas
     divergirem — com `table-layout: fixed` o `<colgroup>` já é a única autoridade. */
  const larguras = useMemo(() => {
    const cols: number[] = [W_CULTURA];
    culturas.forEach(() => {
      cols.push(W_RS);
      if (mostrarUnitarios) cols.push(W_HA, W_UN);
    });
    cols.push(W_RS_TOTAL);
    if (mostrarUnitarios) cols.push(W_HA);
    return cols;
  }, [culturas, mostrarUnitarios]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);
  const colsTotal = mostrarUnitarios ? 2 : 1;
  /** +1 da coluna vazia final, que absorve a sobra. */
  const nColunas = larguras.length + 1;

  const alterna = (k: string) => setAbertos(a => ({ ...a, [k]: !a[k] }));

  return (
    /* ⚠ `leading-none` NA TABELA INTEIRA, e é ele que faz a régua valer. Medido no harness: sem
       ele o `line-height` herdado (1,5) dá 16,5px de caixa de texto num `text-[11px]`, e a linha
       fechava em 18,5px com `height: 18` declarado — porque `height` em `<tr>` é MÍNIMO, não
       máximo. A filha ia a 18px no lugar de 15, e a segunda linha do cabeçalho a 17 no lugar de
       14. Com `leading-none` o conteúdo fica menor que a altura declarada em todas elas, e a
       altura declarada passa a ser a que manda. */
    <table className="border-collapse text-[11px] leading-none"
      style={{ tableLayout: 'fixed', width: '100%', minWidth: larguraMin }}>
      <colgroup>
        {larguras.map((w, i) => <col key={i} style={{ width: w }} />)}
        {/* ⚠ SEM `width`: é ela que absorve a sobra quando o cartão é mais largo que a soma. */}
        <col />
      </colgroup>

      {/* ⚠ `sticky` NO `<th>`, NUNCA NO `<thead>`: com `border-collapse` o navegador não gruda o
          grupo de linhas, e a régua subiria junto com o corpo. E o scrollport é o cartão de
          fora — quem rola é ele, por isso o `top` é 0 e 26. */}
      <thead>
        <tr style={{ height: 26 }}>
          <th rowSpan={2}
            className={cn(CINZA_CABECALHO, 'sticky left-0 top-0 z-30 px-[7px] text-left',
              'text-[10px] font-medium text-white')}>
            Cultura
          </th>
          {culturas.map(c => (
            <th key={c.cultura} colSpan={colsPorCultura}
              className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-right',
                'align-middle text-white')}
              style={{ borderLeft: DIVISOR }}>
              <span className="text-[10px] font-medium leading-none">{labelDaCultura(c.cultura)}</span>
              <span className="ml-1 whitespace-nowrap text-[10px] font-normal leading-none text-white">
                {formatNum(c.area_ha, 1)} ha
              </span>
            </th>
          ))}
          <th colSpan={colsTotal}
            className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-right text-white')}
            style={{ borderLeft: DIVISOR }}>
            <span className="text-[10px] font-medium leading-none">Total</span>
            <span className="ml-1 whitespace-nowrap text-[10px] font-normal leading-none text-white">
              {formatNum(dre.total.area_ha, 1)} ha
            </span>
          </th>
          <th rowSpan={2} className={cn(CINZA_CABECALHO, 'sticky top-0 z-20')} />
        </tr>
        <tr style={{ height: 14 }}>
          {culturas.map(c => (
            <ThUnidade key={c.cultura} cultura={c.cultura} mostrarUnitarios={mostrarUnitarios} />
          ))}
          <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
            style={{ top: 26, borderLeft: DIVISOR }}>R$</th>
          {mostrarUnitarios && (
            <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
              style={{ top: 26 }}>R$/ha</th>
          )}
        </tr>
      </thead>

      <tbody>
        {LINHAS.map(def => {
          if (def.someComRateioDentro && rateioDentro) return null;
          const filhas = def.bloco && abertos[def.bloco] ? centrosDoBloco(def.bloco) : [];
          return (
            <Fragment key={def.chave}>
              {def.chave === 'investimento' && (
                <tr>
                  <td colSpan={nColunas}
                    className="border-t border-border/60 px-[7px] text-[10px] text-muted-foreground"
                    style={{ height: 17 }}>
                    Abaixo da linha de caixa — não entra no resultado do período
                  </td>
                </tr>
              )}
              <LinhaDre def={def} dre={dre} culturas={culturas} rateioDentro={rateioDentro}
                mostrarUnitarios={mostrarUnitarios} aberto={!!(def.bloco && abertos[def.bloco])}
                onAlternar={def.bloco ? () => alterna(def.bloco as string) : undefined}
                valorDaLinha={valorDaLinha} abrir={abrir} />
              {filhas.map(ct => (
                <LinhaCentro key={`${def.chave}:${ct.centro}`} centro={ct} culturas={culturas}
                  rateioDentro={rateioDentro} mostrarUnitarios={mostrarUnitarios}
                  areaTotal={dre.total.area_ha} abrir={abrir} />
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** A segunda linha do cabeçalho de UMA cultura — separada porque a unidade é dela, não da tela. */
function ThUnidade({ cultura, mostrarUnitarios }: { cultura: string; mostrarUnitarios: boolean }) {
  const cls = cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white');
  return (
    <>
      <th className={cls} style={{ top: 26, borderLeft: DIVISOR }}>R$</th>
      {mostrarUnitarios && <>
        <th className={cls} style={{ top: 26 }}>R$/ha</th>
        {/* ⚠ A UNIDADE É DA CULTURA, não da tela: mandioca fecha em tonelada e amendoim em saca,
            e um "/sc" fixo faria a coluna da mandioca mentir sobre a própria grandeza. */}
        <th className={cls} style={{ top: 26 }}>R$/{unidadeCurtaDaCultura(cultura)}</th>
      </>}
    </>
  );
}

/* ─────────────────────── UMA LINHA DO DRE ─────────────────────── */

/** Fundo da linha — e ele tem de ser OPACO, porque a coluna Cultura gruda por cima do corpo. */
const fundoDaLinha = (d: DefLinha['destaque']) =>
  (d === 'subtotal' ? 'bg-muted' : d === 'sub' ? 'bg-muted/40' : 'bg-card');

/** Etiqueta pequena ao lado do rótulo — "estimado", "inclui rateio". */
function Etiqueta({ texto, cor }: { texto: string; cor?: string }) {
  return (
    <span className="ml-1 whitespace-nowrap rounded-[3px] border px-1 text-[9px] leading-[11px]"
      style={{ borderColor: cor ?? 'currentColor', color: cor }}>
      {texto}
    </span>
  );
}

const AMBAR = '#b45309';

function LinhaDre({
  def, dre, culturas, rateioDentro, mostrarUnitarios, aberto, onAlternar, valorDaLinha, abrir,
}: {
  def: DefLinha; dre: DreLavoura; culturas: DreCultura[];
  rateioDentro: boolean; mostrarUnitarios: boolean;
  aberto: boolean; onAlternar?: () => void;
  valorDaLinha: (l: DreValor, def: DefLinha) => number | null;
  abrir: AbrirRateio;
}) {
  const fundo = fundoDaLinha(def.destaque);
  const peso = def.destaque === 'subtotal' ? 'font-semibold'
    : def.destaque === 'sub' ? 'font-medium' : '';
  const corLinha = corDoTom(def.tom);
  const tot = dre.total.linhas[def.chave];

  return (
    <tr className={cn(fundo, peso)} style={{ height: 18 }}>
      <td className={cn('sticky left-0 z-10 truncate px-[7px] py-px', fundo,
        'border-r border-border/60', corLinha)}
        title={def.rotulo}>
        {onAlternar ? (
          /* ⚠ O CARET É BOTÃO, não um `<span onClick>`: a linha inteira não pode alternar
             (clicar no VALOR abre o modal), e um alvo de 11px precisa ser focável pelo teclado. */
          <button type="button" onClick={onAlternar}
            className="mr-px inline-block w-[11px] text-left text-[10px] text-muted-foreground">
            {aberto ? '▾' : '▸'}
          </button>
        ) : <span className="mr-px inline-block w-[11px]" />}
        {def.rotulo}
        {def.etiqueta && <Etiqueta texto={def.etiqueta} />}
        {def.bloco && rateioDentro && <Etiqueta texto="inclui rateio" cor={AMBAR} />}
      </td>

      {culturas.map(c => {
        const l = c.linhas[def.chave];
        const v = valorDaLinha(l, def);
        const rat = def.bloco && rateioDentro ? (l.rateado ?? 0) : 0;
        const cor = def.corPorSinal ? corDoSinal(v) : corLinha;
        const tipo = TIPO_DO_MODAL[def.chave];
        return (
          <Fragment key={c.cultura}>
            <Celula valor={v} cor={cor} destaque={def.destaque} rateado={rat}
              direto={l.direto} bordaEsquerda
              onAbrir={tipo ? () => abrir(tipo, '', def.rotulo, c.cultura) : undefined} />
            {mostrarUnitarios && <>
              <CelulaUnit texto={porUnidade(v, c.area_ha)} cor={cor} destaque={def.destaque} />
              <CelulaUnit texto={porUnidade(v, c.producao)} cor={cor} destaque={def.destaque} />
            </>}
          </Fragment>
        );
      })}

      {/* ⚠ A COLUNA TOTAL NÃO ABRE MODAL: `fn_painel_rateio_detalhe` recebe `p_cultura` e não
          aceita "todas" — abrir com uma cultura arbitrária mostraria o detalhe errado sob o
          número certo. Ela fica de leitura até o drill do PR-02. */}
      <Celula valor={valorDaLinha(tot, def)} cor={def.corPorSinal ? corDoSinal(valorDaLinha(tot, def)) : corLinha}
        destaque={def.destaque} rateado={def.bloco && rateioDentro ? (tot.rateado ?? 0) : 0}
        direto={tot.direto} bordaEsquerda />
      {mostrarUnitarios && (
        <CelulaUnit texto={porUnidade(valorDaLinha(tot, def), dre.total.area_ha)}
          cor={def.corPorSinal ? corDoSinal(valorDaLinha(tot, def)) : corLinha} destaque={def.destaque} />
      )}
      <td className={fundo} />
    </tr>
  );
}

/** Uma filha: o centro de custo dentro do grupo aberto. */
function LinhaCentro({ centro, culturas, rateioDentro, mostrarUnitarios, areaTotal, abrir }: {
  centro: DreCentro; culturas: DreCultura[];
  rateioDentro: boolean; mostrarUnitarios: boolean; areaTotal: number; abrir: AbrirRateio;
}) {
  /* ⚠ SOLO DESTACADO, e só ele: é a formação de área — o dinheiro que vira terra plantável e
     não volta nesta safra. O âmbar diz "leia esta linha antes de comparar o investimento". */
  const solo = centro.bloco === 'investimento' && /solo/i.test(centro.centro);
  const fundo = solo ? '' : 'bg-card';
  const estilo = solo ? { backgroundColor: '#fbf3e6' } : undefined;
  const tipo: TipoRateio = centro.bloco === 'investimento' ? 'investimento' : 'natureza';
  const totalCentro = rateioDentro ? valorTotalDoCentro(centro) : centro.total.direto;

  return (
    <tr className={fundo} style={{ height: 15, ...estilo }}>
      <td className={cn('sticky left-0 z-10 truncate border-r border-t border-dashed border-border/60',
        'px-[7px] py-px text-[10px]', fundo)}
        style={{ ...estilo, ...(solo ? { color: '#8a5a1e', fontWeight: 600 } : undefined) }}
        title={centro.centro}>
        <span className="mr-px inline-block w-[11px]" />{centro.centro}
      </td>

      {culturas.map(c => {
        const p = centro.por_cultura[c.cultura];
        const v = p ? (rateioDentro ? p.valor : p.direto) : null;
        return (
          <Fragment key={c.cultura}>
            <Celula filha valor={v} cor="" rateado={rateioDentro && p ? p.rateado : 0}
              direto={p?.direto} bordaEsquerda fundo={fundo} estilo={estilo}
              onAbrir={() => abrir(tipo, centro.centro, centro.centro, c.cultura)} />
            {mostrarUnitarios && <>
              <CelulaUnit filha texto={porUnidade(v, c.area_ha)} cor="" fundo={fundo} estilo={estilo} />
              <CelulaUnit filha texto={porUnidade(v, c.producao)} cor="" fundo={fundo} estilo={estilo} />
            </>}
          </Fragment>
        );
      })}

      <Celula filha valor={totalCentro} cor="" rateado={rateioDentro ? centro.total.rateado : 0}
        direto={centro.total.direto} bordaEsquerda fundo={fundo} estilo={estilo} />
      {mostrarUnitarios && (
        <CelulaUnit filha texto={porUnidade(totalCentro, areaTotal)} cor="" fundo={fundo} estilo={estilo} />
      )}
      <td className={cn('border-t border-dashed border-border/60', fundo)} style={estilo} />
    </tr>
  );
}

/* ─────────────────────── AS CÉLULAS ─────────────────────── */

/**
 * A célula de R$.
 *
 * ⚠ SEM `overflow: hidden` e com `nowrap`: a coluna é FIXA em px, e o que não coubesse seria
 * cortado no meio do número — um "3.009.508," que parece um valor menor. Sobrando, o número
 * transborda e é visível; faltando, o operador vê e a régua se ajusta. Só a coluna Cultura
 * trunca, porque ali o corte tem `title` para desfazer.
 */
function Celula({ valor, cor, destaque, rateado = 0, direto, bordaEsquerda, onAbrir, filha, fundo, estilo }: {
  valor: number | null; cor: string; destaque?: DefLinha['destaque'];
  rateado?: number; direto?: number; bordaEsquerda?: boolean;
  onAbrir?: () => void; filha?: boolean; fundo?: string; estilo?: React.CSSProperties;
}) {
  const clicavel = !!onAbrir && valor != null;
  return (
    <td className={cn('whitespace-nowrap px-[7px] py-px text-right tabular-nums',
      filha ? 'border-t border-dashed border-border/60 text-[10px]' : '', fundo, cor)}
      style={{ ...estilo, ...(bordaEsquerda ? { borderLeft: '1px solid hsl(var(--border) / .6)' } : {}) }}>
      <span className={cn(clicavel && 'cursor-pointer hover:underline hover:decoration-dotted')}
        onClick={onAbrir}>
        {numeroDaCelula(valor)}
      </span>
      {/* ⚠ O PONTO ÂMBAR É A ÚNICA PISTA DE QUE O NÚMERO MUDOU DE SIGNIFICADO no modo "dentro dos
          centros". Sem ele, Insumos saltaria de 1.121.599,85 para 1.172.900,53 sem explicação. */}
      {rateado > 0 && (
        <span title={`direto ${formatMoeda(direto ?? 0)} + rateio ${formatMoeda(rateado)}`}
          className="ml-1 inline-block h-[6px] w-[6px] rounded-full align-middle"
          style={{ backgroundColor: AMBAR }} />
      )}
    </td>
  );
}

/** A célula de /ha e /unidade — mais clara que a de R$, porque ela é derivada, não lançada. */
function CelulaUnit({ texto, cor, destaque, filha, fundo, estilo }: {
  texto: string; cor: string; destaque?: DefLinha['destaque'];
  filha?: boolean; fundo?: string; estilo?: React.CSSProperties;
}) {
  const sub = destaque === 'subtotal' || destaque === 'sub';
  return (
    <td className={cn('whitespace-nowrap px-[7px] py-px text-right text-[10px] tabular-nums',
      sub ? 'bg-muted' : 'bg-muted/40',
      filha ? 'border-t border-dashed border-border/60' : '',
      /* ⚠ 70% NAS LINHAS COMUNS, 100% NOS SUBTOTAIS: o unitário é leitura de apoio, e ao lado do
         valor cheio ele tem de ceder. No subtotal ele É o número que se lê. */
      sub ? cor : cor === 'text-success' ? 'text-success/70'
        : cor === 'text-destructive' ? 'text-destructive/70' : cor)}
      style={estilo}>
      {texto}
    </td>
  );
}
