/**
 * O MODAL DO GRÁFICO DO DRE DA PECUÁRIA — DRE-CASCATA-MODAL-01 (mock `docs/mocks/dre_cascata_modal_leitura_mock_v5.html`).
 *
 * ⚠ O BOTÃO "Gráfico" DEIXOU DE TROCAR A GRADE PELA CASCATA: ele abre este modal por cima da grade, com
 * duas abas — "Cascata do ano" (a `PecCascataView`, a mesma de antes, com as correções de cor e fonte) e
 * "Leitura dos anos" (uma coluna por ano do seletor do DRE). O estado continua na URL (`f_vista=grafico`):
 * o link que abria a cascata abre o modal.
 *
 * ⚠ A LARGURA É A DO CONTEÚDO (988 = 960 + 2 × 14), sem sobra lateral — decisão do Gabriel no mock v5.
 *
 * ⚠ NENHUM INDICADOR É CALCULADO NA TELA QUANDO HÁ CHAVE: tudo sai de `fn_dre_pecuaria` (a coluna da
 * grade), de `fn_dre_pecuaria_patrimonio` (a ponte do rebanho) e do cache só para o GMD. As razões moram
 * em `indicadoresDoAno` (`pecLeituraAnos.ts`), a mesma função que a cascata lê.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { colunaDoAnoAnterior, type ColunaPec } from '@/components/agri/drePecRegua';
import { PecCascataView, LARGURA_CASCATA } from '@/components/agri/PecCascataView';
import { PonteDoLucro, TITULO_SEM_COMPARACAO_PAINEL } from '@/components/agri/PecPainelLeitura';
import type { Comparacao } from '@/lib/dre/leitura';
import type { DrePecLinhas } from '@/hooks/useDrePecuaria';
import {
  indicadoresDoAno, variacaoNoAno, ehParcial, passosDaPonte, posicionarPonte, rsDoCentroDeVenda,
  razao, SUBCENTROS_SO_RS, COR_PONTE, type IndicadoresAno, type PassoPonte, type UnidadePonte,
} from '@/components/agri/pecLeituraAnos';
import { anoMesAntes, useDrePecuariaLista, useDrePecuariaPatrimonioLista, type MovimentosPec, type PeriodoPec } from '@/hooks/useDrePecuaria';
import { useGmdPeriodos, useVendaGeralPorSubcentro, mesesDoPeriodo } from '@/hooks/useLeituraAnosPec';

const NAVY = '#1D3A5D';
const VERDE_HEX = '#15803d';
const VERMELHO_HEX = '#b91c1c';
const ZEBRA_A = '#F5F4F0';
const ZEBRA_B = '#FFFFFF';
const SECAO = '#E8E6DF';
const traco = '—';

const LARG_MODAL = LARGURA_CASCATA + 28;
/** A coluna dos rótulos da tabela e a margem esquerda do gráfico do movimento — a MESMA régua. */
const L_ROTULO = 222;

type NAnos = 2 | 3 | 5;
type Aba = 'cascata' | 'ponte' | 'leitura';

/** DRE-PAINEL-03 — a aba "O que mudou": a ponte do lucro operacional da COLUNA COMPARADA (o "Comparar com" do topo) ao período. */
export interface PonteDoGrafico {
  atual: DrePecLinhas;
  /** a coluna comparada (ano anterior, Meta ou Média 12m); `null` = sem comparação ligada → a aba fica apagada */
  base: DrePecLinhas | null;
  comparacao: Comparacao;
  rotuloBase: string;
  rotuloAtual: string;
}
/* a MESMA frase da aba apagada do painel da direita (DRE-PAINEL-03b) */
export const TITULO_SEM_COMPARACAO = TITULO_SEM_COMPARACAO_PAINEL;
const LARGURA_DA_PONTE = 720;
type AbaMov = 'global' | 'nascimentos' | 'compras' | 'desfrute' | 'mortes';

const n0 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 0));
const n2 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
const s0 = (v: number | null | undefined) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 0)}`);
const s2 = (v: number | null | undefined) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 2)}`);
const pct1 = (f: number | null | undefined) => (f == null ? traco : `${formatNum(f * 100, 1)}%`);
const spct1 = (f: number | null | undefined) => (f == null ? traco : `${f > 0 ? '+' : ''}${formatNum(f * 100, 1)}%`);
/** Cor pelo sinal: sobe verde, desce vermelho. `inverte` para custo e ágio, onde subir é ruim. */
const corDe = (v: number | null | undefined, inverte = false) =>
  (v == null || v === 0 ? '' : (v > 0) !== inverte ? 'text-emerald-700' : 'text-destructive');
const abrevMil = (v: number, un: string) =>
  (Math.abs(v) >= 1000 ? `${formatNum(v / 1000, 0)} mil ${un}` : `${formatNum(v, 0)} ${un}`);

/** O passo "bonito" da grade de um eixo: 1, 2, 2,5 ou 5 × potência de 10, com ~5 linhas.
    ⚠ O 2,5 EXISTE POR MEDIÇÃO: sem ele o rebanho do NJ (~106 mil @) ganhava passo de 50 mil e topo em 150 mil
    — um terço do gráfico vazio em cima. */
function passoDoEixo(amplitude: number) {
  if (!(amplitude > 0)) return 1;
  const bruto = amplitude / 5;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** O piso negativo do eixo: a margem negativa com folga, sem arredondar para um passo inteiro — com −10 de
    margem e passo de 200, o eixo descia a −200 e metade do gráfico ficava vazia (medido no NJ jan–ago/24). */

export function PecGraficoModal({ aberto, onFechar, colunas, clienteId, clienteNome, ponte }: {
  aberto: boolean;
  onFechar: () => void;
  colunas: readonly ColunaPec[];
  clienteId: string | null | undefined;
  clienteNome?: string | null;
  /** DRE-PAINEL-03 — a aba "O que mudou" (sem ela, a aba fica apagada) */
  ponte?: PonteDoGrafico | null;
}) {
  const [aba, setAba] = useState<Aba>('cascata');
  /* DRE-PAINEL-03: a Cascata segue como padrão AO ABRIR (o estado não sobra da última vez) */
  useEffect(() => { if (aberto) setAba('cascata'); }, [aberto]);
  const semComparacao = !ponte?.base;
  /* desligaram o "Comparar com" com a aba aberta: volta à Cascata (a aba apagada não fica escolhida) */
  useEffect(() => { if (semComparacao && aba === 'ponte') setAba('cascata'); }, [semComparacao, aba]);
  const [anoCascata, setAnoCascata] = useState<string | null>(null);

  /* ⚠ OS ANOS DA LEITURA SÃO AS COLUNAS DE VALOR DO REALIZADO, DO CLIENTE INTEIRO, na ordem da grade (a
     mais antiga à esquerda). Meta e Δ não são ano; na visão "Por fazenda" sobra o Total — um ano só. */
  const anosDaGrade = useMemo(
    () => colunas.filter(c => c.tipo === 'valor' && c.cenario === 'realizado' && c.fazendaId == null),
    [colunas]);
  /* DRE-GRAFICOS-02 (mock aprovado 23/11 11:27) — A LEITURA TEM O SEU SELETOR: "Anos 2 · 3 · 5" (padrão 2), INDEPENDENTE da grade. O
     último ano é o período da tela; os anteriores são o MESMO recorte de meses k anos antes (`anoMesAntes`), lidos pelo MESMO hook e
     chave de cache da grade (`useDrePecuariaLista`: o ano que a grade já trouxe sai do cache; nenhum 2º cálculo) e montados pela MESMA
     regra de coluna (`colunaDoAnoAnterior`: ano sem dado = coluna "—"). */
  const [nAnos, setNAnos] = useState<NAnos>(2);
  const base = useMemo(() => anosDaGrade.find(c => c.atual) ?? anosDaGrade[anosDaGrade.length - 1] ?? null, [anosDaGrade]);
  const naLeitura = aberto && aba === 'leitura';
  const periodosLeitura = useMemo((): PeriodoPec[] => (naLeitura && base ? periodosDaLeitura(base, nAnos) : []), [naLeitura, base, nAnos]);
  const lidos = useDrePecuariaLista(clienteId, periodosLeitura);
  const anosLeitura = useMemo((): ColunaPec[] => (base
    ? [...lidos.map((a, i) => colunaDoAnoAnterior({ de: a.periodo.de, ate: a.periodo.ate, dre: a.dre, carregando: a.carregando }, nAnos - 1 - i, null, base.meses)), base]
    : []), [lidos, base, nAnos]);
  const anos = aba === 'leitura' ? anosLeitura : anosDaGrade;
  const primeiro = anos[0]?.nome, ultimo = anos[anos.length - 1]?.nome;

  const abrirAno = (chave: string) => { setAnoCascata(chave); setAba('cascata'); };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent style={{ maxWidth: LARG_MODAL, width: LARG_MODAL }}
        className="flex max-h-[calc(100vh-32px)] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex shrink-0 items-center gap-2.5 px-3.5 text-white" style={{ backgroundColor: NAVY, height: 36 }}>
          <h2 className="text-[13px] font-semibold leading-none">Gráficos do DRE pecuária</h2>
          <span className="whitespace-nowrap text-[11px] leading-none text-white/80">
            {[clienteNome, 'Todas as fazendas',
              primeiro && ultimo ? (primeiro === ultimo ? primeiro : `${primeiro} → ${ultimo}`) : null]
              .filter(Boolean).join(' · ')}
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="ml-auto text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-b px-3.5" style={{ height: 36 }}>
          <Segmentado altura={22} valor={aba} onEscolher={setAba}
            opcoes={[{ valor: 'cascata', rotulo: 'Cascata do ano' },
              { valor: 'ponte', rotulo: 'O que mudou', ...(semComparacao ? { desabilitada: true, title: TITULO_SEM_COMPARACAO } : {
                title: `Do lucro operacional de ${ponte?.rotuloBase ?? ''} ao de ${ponte?.rotuloAtual ?? ''}` }) },
              { valor: 'leitura', rotulo: 'Leitura dos anos' }]} />
          {aba === 'leitura' && (<>
            <span className="ml-3 text-[11px] text-muted-foreground">Anos</span>
            <span data-testid="leitura-n-anos"><Segmentado altura={22} valor={String(nAnos)} onEscolher={(v) => setNAnos(v === '5' ? 5 : v === '3' ? 3 : 2)}
              opcoes={[{ valor: '2', rotulo: '2' }, { valor: '3', rotulo: '3' }, { valor: '5', rotulo: '5' }]} /></span>
            <span className="ml-auto text-[11px] text-muted-foreground">clique num ano para abrir a cascata dele</span>
          </>)}
        </div>
        {/* ⚠ UM SCROLLPORT SÓ: o corpo inteiro rola, o cabeçalho e as abas ficam. */}
        {/* `key` pela aba: trocar de aba remonta o corpo e ele volta ao topo — a cascata não abre rolada no meio. */}
        <div key={aba} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-2.5">
          {aba === 'cascata' ? (
            <PecCascataView colunas={colunas} clienteId={clienteId}
              escolhido={anoCascata} onEscolher={setAnoCascata} />
          ) : aba === 'ponte' && ponte?.base ? (
            /* ⚠ LARGURA FIXA (UI-LARGURA-FIXA-01): a lista não estica no modal largo; a peça é a MESMA do painel da direita */
            <div className="flex flex-col gap-1" style={{ width: LARGURA_DA_PONTE }} data-testid="grafico-ponte">
              <div className="flex h-[16px] items-baseline justify-between text-[10px]">
                <span className="font-medium">
                  {ponte.comparacao === 'meta' ? `Da meta ao realizado de ${ponte.rotuloAtual}` : `Do lucro operacional de ${ponte.rotuloBase} ao de ${ponte.rotuloAtual}`}
                </span>
                <span className="text-muted-foreground">R$ mi</span>
              </div>
              <PonteDoLucro atual={ponte.atual} base={ponte.base} comparacao={ponte.comparacao} rotuloBase={ponte.rotuloBase} rotuloAtual={ponte.rotuloAtual} />
            </div>
          ) : (
            <LeituraDosAnos anos={anos} clienteId={clienteId} onAbrirAno={abrirAno} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** DRE-GRAFICOS-02 — os N−1 anos ANTES do período da tela, do mais antigo ao mais recente: o mesmo recorte de meses k anos antes */
export function periodosDaLeitura(base: Pick<ColunaPec, 'de' | 'ate'>, n: number): PeriodoPec[] {
  return Array.from({ length: Math.max(0, n - 1) }, (_, i): PeriodoPec => {
    const k = n - 1 - i;
    return { de: anoMesAntes(base.de, k), ate: anoMesAntes(base.ate, k), cenario: 'realizado' };
  });
}

/* ═══════════════════════════ A LEITURA DOS ANOS ═══════════════════════════ */

export function LeituraDosAnos({ anos, clienteId, onAbrirAno }: {
  anos: readonly ColunaPec[];
  clienteId: string | null | undefined;
  onAbrirAno: (chave: string) => void;
}) {
  const [abaMov, setAbaMov] = useState<AbaMov>('global');
  const [unidade, setUnidade] = useState<UnidadePonte>('at');

  const periodos = useMemo(() => anos.map(c => ({ de: c.de, ate: c.ate })), [anos]);
  const pats = useDrePecuariaPatrimonioLista(clienteId, periodos, true);
  const { gmds } = useGmdPeriodos(clienteId, periodos, true);
  const vendaGeral = useVendaGeralPorSubcentro(clienteId, periodos, abaMov === 'desfrute');

  /* ⚠ ANO SEM DADO É COLUNA DE "—", não coluna escondida — a regra da grade (`semDado`). */
  const ind = useMemo(() => anos.map(c => indicadoresDoAno(c.semDado ? null : c.linhas)), [anos]);
  const movs: (MovimentosPec | null)[] = anos.map((c, i) => (c.semDado ? null : pats[i]?.patrimonio?.movimentos ?? null));
  const carregandoPat = pats.some(p => p.carregando);
  const parcial = anos.map(c => ehParcial(c.meses));
  const algumParcial = parcial.some(Boolean);
  const rotuloAno = (c: ColunaPec, i: number) => `${c.nome}${parcial[i] ? '*' : ''}`;
  const recorteParcial = anos.find((c, i) => parcial[i]);

  return (
    <div className="flex flex-col gap-2.5" style={{ width: LARGURA_CASCATA }}>
      <div className="grid gap-5" style={{ gridTemplateColumns: '470px 470px' }}>
        <GraficoPrecoCusto anos={anos} ind={ind} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
        <GraficoRebanhoDesfrute anos={anos} ind={ind} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
      </div>

      <div className="rounded-md border pt-1.5">
        <div className="flex items-center gap-2.5 px-2 text-[11.5px] font-semibold">
          {`Movimento do rebanho (${unidade === 'at' ? 'mil @' : 'cab'})`}
          <Segmentado altura={22} valor={abaMov} onEscolher={setAbaMov} opcoes={[
            { valor: 'global', rotulo: 'Global' }, { valor: 'nascimentos', rotulo: 'Nascimentos' },
            { valor: 'compras', rotulo: 'Compras' }, { valor: 'desfrute', rotulo: 'Desfrute' },
            { valor: 'mortes', rotulo: 'Mortes' },
          ]} />
          {carregandoPat && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Segmentado className="ml-auto" altura={22} valor={unidade} onEscolher={setUnidade}
            opcoes={[{ valor: 'at', rotulo: '@' }, { valor: 'cab', rotulo: 'cab' }]} />
        </div>
        {abaMov === 'global' && (
          <div className="flex h-[16px] items-center gap-1 px-2 text-[10px] text-muted-foreground" data-testid="leitura-frase-movimento">
            <span className="min-w-0 truncate" title={FRASE_DO_MOVIMENTO}>{FRASE_DO_MOVIMENTO}</span>
            <span className="flex-none cursor-help" title="Ajuste de contagem = a diferença entre o que a contagem do fim achou e o que as entradas e saídas somam. Ganho de peso só existe em @.">ⓘ</span>
          </div>
        )}
        {abaMov === 'global' ? (
          <GraficoPonte anos={anos} movs={movs} ind={ind} unidade={unidade} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
        ) : (
          <DetalheMovimento aba={abaMov} anos={anos} movs={movs} ind={ind} unidade={unidade}
            rotulo={rotuloAno} parcial={parcial} vendaGeral={vendaGeral} onAbrirAno={onAbrirAno} />
        )}
      </div>

      <TabelaIndicadores anos={anos} ind={ind} movs={movs} gmds={gmds} unidade={unidade}
        parcial={parcial} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />

      <div className="text-[10px] text-muted-foreground" data-testid="leitura-frase-delta">
        Δ compara o último ano com o anterior, no mesmo recorte de meses. Verde = melhorou, vermelho = piorou.
      </div>
      {algumParcial && recorteParcial && (
        <div className="text-center text-[10px] text-muted-foreground">
          * recorte {rotuloMesesDe(recorteParcial)} ({recorteParcial.meses} meses). Valores do período marcados
          “{recorteParcial.meses}m”; estoques, preços, custo e margem por @ comparam direto.
        </div>
      )}
    </div>
  );
}

/* ─────────────── os dois gráficos de cima ─────────────── */

const G_W = 470, G_H = 162, G_ESQ = 40, G_DIR = 8, G_TOPO = 14, G_BASE = 26;

function cabecalhoGrafico(titulo: string, legenda: ReactNode) {
  return (
    <div className="flex items-center gap-2 px-2 text-[11.5px] font-semibold">
      {titulo}
      <span className="ml-auto flex items-center gap-2 text-[10px] font-normal text-foreground/80">{legenda}</span>
    </div>
  );
}
const itemLegenda = (cor: string, txt: string, linha = false) => (
  <span className="flex items-center">
    <i className="mr-1 inline-block" style={{ width: 9, height: linha ? 3 : 9, backgroundColor: cor }} />{txt}
  </span>
);

/** O rótulo do ano embaixo do gráfico — clicável: abre a cascata daquele ano. */
function RotuloAnoSvg({ x, y, texto, onClick }: { x: number; y: number; texto: string; onClick: () => void }) {
  return (
    <text x={x} y={y} fontSize={10.5} fill="#374151" textAnchor="middle" className="cursor-pointer hover:underline"
      onClick={onClick}>{texto}</text>
  );
}

/** "±X" com o sinal escrito (o − de verdade) — o "vs ano anterior" embaixo dos gráficos */
const comSinal = (v: number, casas: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNum(Math.abs(v), casas)}`;

/* DRE-GRAFICOS-02 — os dois gráficos de cima ganham uma 2ª linha embaixo do ano (o "vs ano anterior") */
const G_H2 = G_H + 14, G_BASE2 = G_BASE + 14;

/**
 * QUANTO VENDEMOS E QUANTO CUSTOU CADA ARROBA — DRE-GRAFICOS-02 (mock aprovado 23/11 11:27): UMA barra empilhada por ano — o custo de
 * produzir (vermelho, embaixo) e a sobra (verde, em cima); a barra inteira é o preço ("vendeu a X" no topo). Embaixo do ano: "sobra N% do
 * preço · ±X/@" contra o ano anterior (verde = a sobra cresceu). Custo maior que o preço: a barra é só o custo e um traço navy marca o
 * preço ("falta N% do preço"). Os números são os de `indicadoresDoAno` (a mesma fonte da Cascata); nada se calcula aqui além de preço − custo.
 */
export function GraficoPrecoCusto({ anos, ind, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const n = anos.length;
  const faixa = (G_W - G_ESQ - G_DIR) / Math.max(n, 1);
  /* com 4 ou 5 anos a faixa de cada ano não cabe a frase inteira embaixo do ano (o gate mediu): a forma curta */
  const curto = n >= 4;
  const topoBruto = Math.max(0, ...ind.flatMap(x => [x.pkDesf ?? 0, x.custoAt ?? 0]));
  const passo = passoDoEixo(topoBruto);
  const topo = Math.ceil((topoBruto * 1.12) / passo) * passo || passo;   // folga para o "vendeu a X" no topo
  const base = G_H2 - G_BASE2 + 4;
  const y = (v: number) => G_TOPO + (topo - v) / topo * (base - G_TOPO);
  const grade: number[] = [];
  for (let v = passo; v <= topo + 1e-9; v += passo) grade.push(v);
  const cx = (i: number) => G_ESQ + faixa * i + faixa / 2;
  const larg = Math.min(56, faixa * 0.5);
  return (
    <div className="rounded-md border pb-0.5 pt-1" data-testid="leitura-preco-custo">
      {cabecalhoGrafico('Quanto vendemos e quanto custou cada arroba (R$/@)', <>
        {itemLegenda(VERMELHO_HEX, 'custo de produzir')}{itemLegenda(VERDE_HEX, 'sobra (margem)')}
      </>)}
      <svg width={G_W} height={G_H2} viewBox={`0 0 ${G_W} ${G_H2}`}>
        {grade.map(v => (
          <g key={v}>
            <line x1={G_ESQ} x2={G_W - G_DIR} y1={y(v)} y2={y(v)} stroke="#f0efe9" />
            <text x={G_ESQ - 4} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{formatNum(v, 0)}</text>
          </g>
        ))}
        <line x1={G_ESQ} x2={G_W - G_DIR} y1={base} y2={base} stroke="#6B7280" />
        {anos.map((c, i) => {
          const x = ind[i];
          const preco = x.pkDesf, custo = x.custoAt;
          const sobra = preco != null && custo != null ? preco - custo : null;
          const sobraAnt = i > 0 && ind[i - 1].pkDesf != null && ind[i - 1].custoAt != null ? (ind[i - 1].pkDesf ?? 0) - (ind[i - 1].custoAt ?? 0) : null;
          const x0 = cx(i) - larg / 2;
          const topoBarra = Math.max(preco ?? 0, custo ?? 0);
          return (
            <g key={c.chave} data-ano={c.chave}>
              {custo != null && custo > 0 && (
                <rect x={x0} y={y(custo)} width={larg} height={base - y(custo)} fill={VERMELHO_HEX} opacity={0.85}>
                  <title>{`Custo por @ produzida: R$ ${formatNum(custo, 2)}/@`}</title>
                </rect>
              )}
              {sobra != null && sobra > 0 && preco != null && custo != null && (
                <rect x={x0} y={y(preco)} width={larg} height={y(custo) - y(preco)} fill={VERDE_HEX}>
                  <title>{`Sobra (preço − custo): R$ ${formatNum(sobra, 2)}/@`}</title>
                </rect>
              )}
              {preco != null && custo == null && (
                <rect x={x0} y={y(preco)} width={larg} height={base - y(preco)} fill={NAVY} opacity={0.75}>
                  <title>{`Preço médio de venda: R$ ${formatNum(preco, 2)}/@ (sem custo por @ no ano)`}</title>
                </rect>
              )}
              {sobra != null && sobra < 0 && preco != null && (
                <line x1={x0 - 3} x2={x0 + larg + 3} y1={y(preco)} y2={y(preco)} stroke={NAVY} strokeWidth={2} strokeDasharray="4 2">
                  <title>{`Preço médio de venda: R$ ${formatNum(preco, 2)}/@ — abaixo do custo`}</title>
                </line>
              )}
              {preco != null && (
                <text x={cx(i)} y={y(topoBarra) - 4} fontSize={9.5} fontWeight={600} fill={NAVY} textAnchor="middle">vendeu a {formatNum(preco, 0)}</text>
              )}
              {sobra != null && sobra > 0 && custo != null && preco != null && y(custo) - y(preco) >= 13 && (
                <text x={cx(i)} y={(y(custo) + y(preco)) / 2 + 3.5} fontSize={9.5} fontWeight={700} fill="#fff" textAnchor="middle">sobra {formatNum(sobra, 0)}</text>
              )}
              {custo != null && custo > 0 && base - y(custo) >= 13 && (
                <text x={cx(i)} y={(y(custo) + base) / 2 + 3.5} fontSize={9.5} fontWeight={700} fill="#fff" textAnchor="middle">custo {formatNum(custo, 0)}</text>
              )}
              {preco == null && custo == null && (
                <text x={cx(i)} y={base - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>
              )}
              <RotuloAnoSvg x={cx(i)} y={G_H2 - 21} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
              <text x={cx(i)} y={G_H2 - 7} fontSize={9.5} fill="#6b7280" textAnchor="middle" data-testid="leitura-sobra-do-ano">
                {sobra == null || !preco ? traco : `${sobra >= 0 ? 'sobra' : 'falta'} ${formatNum(Math.abs(sobra) / preco * 100, 0)}%${curto ? '' : ' do preço'}`}
                {sobra != null && sobraAnt != null && (
                  <tspan fontWeight={600} fill={sobra >= sobraAnt ? VERDE_HEX : VERMELHO_HEX}>{` · ${comSinal(sobra - sobraAnt, 0)}/@`}</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * REBANHO INICIAL × DESFRUTE — DRE-GRAFICOS-02: o MESMO tratamento do preço × custo. UMA barra por ano: o rebanho no 1º dia (cinza) e,
 * dentro dela, de baixo para cima, as cabeças vendidas e abatidas no período (verde); o desfrute vem em cab E em % do inicial. Embaixo do
 * ano: "desfrute P% · ±X pp" contra o ano anterior (verde = desfrutou mais). Desfrute maior que o inicial: o verde passa do cinza.
 */
export function GraficoRebanhoDesfrute({ anos, ind, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const n = anos.length;
  const faixa = (G_W - G_ESQ - G_DIR) / Math.max(n, 1);
  /* com 4 ou 5 anos a faixa de cada ano não cabe a frase inteira embaixo do ano (o gate mediu): a forma curta */
  const curto = n >= 4;
  const topoBruto = Math.max(0, ...ind.flatMap(x => [x.cabIni ?? 0, x.cabDesf ?? 0]));
  const passo = passoDoEixo(topoBruto);
  const topo = Math.ceil((topoBruto * 1.12) / passo) * passo || passo;
  const base = G_H2 - G_BASE2 + 4;
  const y = (v: number) => G_TOPO + (topo - v) / topo * (base - G_TOPO);
  const grade: number[] = [];
  for (let v = passo; v <= topo + 1e-9; v += passo) grade.push(v);
  const cx = (i: number) => G_ESQ + faixa * i + faixa / 2;
  const larg = Math.min(56, faixa * 0.5);
  return (
    <div className="rounded-md border pb-0.5 pt-1" data-testid="leitura-rebanho-desfrute">
      {cabecalhoGrafico('Rebanho inicial × desfrute (cab)', <>
        {itemLegenda('#cbd5e1', 'rebanho no 1º dia')}{itemLegenda(VERDE_HEX, 'vendidas e abatidas')}
      </>)}
      <svg width={G_W} height={G_H2} viewBox={`0 0 ${G_W} ${G_H2}`}>
        {grade.map(v => (
          <g key={v}>
            <line x1={G_ESQ} x2={G_W - G_DIR} y1={y(v)} y2={y(v)} stroke="#f0efe9" />
            <text x={G_ESQ - 4} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{formatNum(v, 0)}</text>
          </g>
        ))}
        <line x1={G_ESQ} x2={G_W - G_DIR} y1={base} y2={base} stroke="#6B7280" />
        {anos.map((c, i) => {
          const x = ind[i];
          const x0 = cx(i) - larg / 2;
          const pctAnt = i > 0 ? ind[i - 1].pctDesf : null;
          const alto = Math.max(x.cabIni ?? 0, x.cabDesf ?? 0);
          return (
            <g key={c.chave} data-ano={c.chave}>
              {x.cabIni != null && (
                <rect x={x0} y={y(x.cabIni)} width={larg} height={base - y(x.cabIni)} fill="#cbd5e1">
                  <title>{`Rebanho no 1º dia: ${formatNum(x.cabIni, 0)} cab`}</title>
                </rect>
              )}
              {x.cabDesf != null && x.cabDesf > 0 && (
                <rect x={x0} y={y(x.cabDesf)} width={larg} height={base - y(x.cabDesf)} fill={VERDE_HEX}>
                  <title>{`Vendidas e abatidas no período: ${formatNum(x.cabDesf, 0)} cab${x.pctDesf == null ? '' : ` (${pct1(x.pctDesf)} do inicial)`}`}</title>
                </rect>
              )}
              {x.cabIni != null && (
                <text x={cx(i)} y={y(alto) - 4} fontSize={9.5} fontWeight={600} fill="#475569" textAnchor="middle">início {formatNum(x.cabIni, 0)} cab</text>
              )}
              {x.cabDesf != null && x.cabDesf > 0 && base - y(x.cabDesf) >= 13 && (
                <text x={cx(i)} y={(y(x.cabDesf) + base) / 2 + 3.5} fontSize={9.5} fontWeight={700} fill="#fff" textAnchor="middle">
                  {`${formatNum(x.cabDesf, 0)} cab`}
                </text>
              )}
              {x.cabIni == null && x.cabDesf == null && (
                <text x={cx(i)} y={base - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>
              )}
              <RotuloAnoSvg x={cx(i)} y={G_H2 - 21} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
              <text x={cx(i)} y={G_H2 - 7} fontSize={9.5} fill="#6b7280" textAnchor="middle" data-testid="leitura-desfrute-do-ano">
                {x.pctDesf == null ? traco : curto ? pct1(x.pctDesf) : `desfrute ${pct1(x.pctDesf)}`}
                {x.pctDesf != null && pctAnt != null && (
                  <tspan fontWeight={600} fill={x.pctDesf >= pctAnt ? VERDE_HEX : VERMELHO_HEX}>{` · ${comSinal((x.pctDesf - pctAnt) * 100, 1)} pp`}</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────── o movimento do rebanho ─────────────── */

const M_W = LARGURA_CASCATA - 2, M_H = 218, M_TOPO = 42, M_BASE = 26;

/* DRE-GRAFICOS-02 — o Movimento (Global): número em cada barra, nome curto embaixo dela, o saldo do período embaixo do ano. A esquerda
   guarda SÓ o eixo (46px): os anos ganham a largura toda (com 5 anos, ~180px e 8–9 barras cada). */
const P_ESQ = 46, P_H = 244, P_TOPO = 30, P_BASE = 58;
export const NOME_CURTO_PONTE: Readonly<Record<string, string>> = {
  inicio: 'início', producao: 'peso', nascimentos: 'nasc.', compras: 'compra', transf: 'transf.', desfrute: 'venda', mortes: 'morte', dif: 'ajuste', fim: 'fim',
};
export const FRASE_DO_MOVIMENTO = 'Cada ano: o rebanho no início → o que entrou (ganho de peso, nascimentos, compras) → o que saiu (vendas e abates, mortes) → ajuste de contagem → o rebanho no fim.';
/** a largura (px) de um texto de 9,5px — a conta da alternância (mesma régua da cascata: ~5px por caractere) */
const largDoTexto = (t: string) => t.length * 5.2;

export function GraficoPonte({ anos, movs, ind, unidade, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; movs: readonly (MovimentosPec | null)[]; ind: readonly IndicadoresAno[];
  unidade: UnidadePonte; rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const colW = (M_W - P_ESQ) / Math.max(anos.length, 1);
  const pontes = movs.map((m, i) => posicionarPonte(passosDaPonte(m, unidade, ind[i].atProd != null)));
  const topoBruto = Math.max(0, ...pontes.flatMap(p => p.barras.map(b => b.ate)));
  const chaoBruto = Math.min(0, ...pontes.flatMap(p => p.barras.map(b => b.de)));
  const passo = passoDoEixo(topoBruto - chaoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo, chao = Math.floor(chaoBruto / passo) * passo;
  const y = (v: number) => P_TOPO + (topo - v) / (topo - chao) * (P_H - P_TOPO - P_BASE);
  const grade: number[] = [];
  for (let v = chao; v <= topo + 1e-9; v += passo) if (v !== 0) grade.push(v);
  const un = unidade === 'at' ? 'mil @' : 'cab';
  /* ⚠ CABEÇA VAI POR EXTENSO (o arredondamento de "mil" escondia bois); ARROBA EM MIL COM 1 CASA (o título diz "mil @") */
  const numero = (v: number) => (unidade === 'cab' ? formatNum(v, 0) : formatNum(v / 1000, 1));
  const daBarra = (b: { valor: number | null; tipo: string }) => (b.valor == null ? traco
    : b.tipo === 'ponta' ? numero(b.valor) : `${b.valor > 0 ? '+' : b.valor < 0 ? '−' : ''}${numero(Math.abs(b.valor))}`);
  const base = P_H - P_BASE;
  return (
    <svg width={M_W} height={P_H} viewBox={`0 0 ${M_W} ${P_H}`} data-testid="leitura-ponte">
      {grade.map(v => (
        <g key={v}>
          <line x1={P_ESQ} x2={M_W - 2} y1={y(v)} y2={y(v)} stroke="#f0efe9" />
          <text x={P_ESQ - 5} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{numero(v)}</text>
        </g>
      ))}
      <line x1={P_ESQ} x2={M_W - 2} y1={y(0)} y2={y(0)} stroke="#6B7280" />
      {anos.map((c, i) => {
        const { barras } = pontes[i];
        const x0 = P_ESQ + colW * i;
        const k = Math.max(barras.length, 1);
        const passoB = (colW - 12) / k;
        const larg = Math.max(6, Math.min(26, passoB - 4));
        const ini = barras.find(b => b.chave === 'inicio')?.valor ?? null;
        const fim = barras.find(b => b.chave === 'fim')?.valor ?? null;
        const dVar = ini == null || fim == null ? null : fim - ini;
        const meio = x0 + colW / 2;
        /* duas alturas quando dois vizinhos encostariam — a mesma regra do par da cascata */
        const textos = barras.map(daBarra), nomes = barras.map(b => NOME_CURTO_PONTE[b.chave] ?? b.chave);
        const alternaNum = textos.some((t, j) => j > 0 && (largDoTexto(t) + largDoTexto(textos[j - 1])) / 2 + 3 > passoB);
        const alternaNome = nomes.some((t, j) => j > 0 && (largDoTexto(t) + largDoTexto(nomes[j - 1])) / 2 + 3 > passoB);
        return (
          <g key={c.chave} data-ano={c.chave}>
            {!movs[i] && <text x={meio} y={y(0) - 6} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>}
            {barras.map((b, j) => {
              const bx = x0 + 6 + passoB * j + (passoB - larg) / 2;
              const alt = Math.max(y(b.de) - y(b.ate), b.valor == null ? 0 : 1.5);
              const cxb = bx + larg / 2;
              return (
                <g key={b.chave}>
                  {/* ⚠ O CONECTOR ANDA NO ACUMULADO DEPOIS DO PASSO ANTERIOR — é o que liga uma barra à seguinte. */}
                  {j > 0 && (
                    <line x1={bx - (passoB - larg)} x2={bx} y1={y(barras[j - 1].acc)} y2={y(barras[j - 1].acc)}
                      stroke="#9ca3af" strokeWidth={0.8} />
                  )}
                  <rect x={bx} y={y(b.ate)} width={larg} height={alt} fill={b.cor}>
                    <title>{`${rotulo(c, i)} · ${b.rotulo}: ${b.valor == null ? traco : formatNum(b.valor, 0)} ${unidade === 'at' ? '@' : 'cab'}`}</title>
                  </rect>
                  <text x={cxb} y={y(b.ate) - 4 - (alternaNum && j % 2 === 1 ? 11 : 0)} fontSize={9.5} fontWeight={600} textAnchor="middle"
                    fill={b.tipo === 'ponta' ? '#0F1729' : b.cor} data-numero-ponte>{textos[j]}</text>
                  <text x={cxb} y={base + 12 + (alternaNome && j % 2 === 1 ? 11 : 0)} fontSize={9.5} fill="#6B7280" textAnchor="middle"
                    data-nome-ponte>{nomes[j]}<title>{b.rotulo}</title></text>
                </g>
              );
            })}
            <RotuloAnoSvg x={meio} y={P_H - 19} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
            <text x={meio} y={P_H - 6} fontSize={9.5} fontWeight={600} textAnchor="middle" data-testid="leitura-saldo-do-ano"
              fill={dVar == null ? '#9ca3af' : dVar < 0 ? VERMELHO_HEX : VERDE_HEX}>
              {dVar == null ? traco : `${dVar > 0 ? '+' : dVar < 0 ? '−' : ''}${unidade === 'at' ? formatNum(Math.abs(dVar) / 1000, 2) : formatNum(Math.abs(dVar), 0)} ${un} no período`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * AS ABAS DE UM MOVIMENTO SÓ — Nascimentos, Compras, Desfrute, Mortes.
 *
 * ⚠ O DESFRUTE ABRE EM ABATE × VENDA × CONSUMO pela chave nova da RPC (`desfrute_por_tipo`, cabeças e
 * @ VIVA); o R$ vem dos grupos de centros do DRE — Abates (1010, 1020) e Venda Peso Vivo (1110-1155) —,
 * com R$/@ = R$ ÷ @ do tipo. Venda de tropa, consumo e hedge aparecem SÓ em R$ (decisão 7): a Venda
 * Geral não tem arroba própria.
 */
export function DetalheMovimento({ aba, anos, movs, ind, unidade, rotulo, parcial, vendaGeral, onAbrirAno }: {
  aba: Exclude<AbaMov, 'global'>;
  anos: readonly ColunaPec[]; movs: readonly (MovimentosPec | null)[]; ind: readonly IndicadoresAno[];
  unidade: UnidadePonte; rotulo: (c: ColunaPec, i: number) => string; parcial: readonly boolean[];
  vendaGeral: readonly { porSubcentro: Map<string, number> | null; carregando: boolean }[];
  onAbrirAno: (chave: string) => void;
}) {
  const v = (p: { cabecas: number; arrobas: number } | null | undefined) =>
    (p == null ? null : unidade === 'at' ? p.arrobas : p.cabecas);
  const un = unidade === 'at' ? '@' : 'cab';
  type Serie = { rotulo: string; cor: string; valores: (number | null)[] };
  const series: Serie[] = aba === 'nascimentos'
    ? [{ rotulo: 'Nascimentos', cor: COR_PONTE.nascimentos, valores: movs.map(m => v(m?.nascimentos)) }]
    : aba === 'compras'
      ? [{ rotulo: 'Compras', cor: COR_PONTE.compras, valores: movs.map(m => v(m?.compradas)) }]
      : aba === 'mortes'
        ? [{ rotulo: 'Mortes', cor: COR_PONTE.mortes, valores: movs.map(m => v(m?.mortes)) }]
        : [
          { rotulo: 'Abate', cor: '#9a3412', valores: movs.map(m => v(m?.desfrute_por_tipo?.abate)) },
          { rotulo: 'Venda', cor: '#ea580c', valores: movs.map(m => v(m?.desfrute_por_tipo?.venda)) },
          { rotulo: 'Consumo', cor: '#fdba74', valores: movs.map(m => v(m?.desfrute_por_tipo?.consumo)) },
        ];

  const colW = (M_W - L_ROTULO) / Math.max(anos.length, 1);
  const H = 150, TOPO = 16, BASE = 24;
  const topoBruto = Math.max(0, ...series.flatMap(s => s.valores.map(x => x ?? 0)));
  const passo = passoDoEixo(topoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo;
  const y = (x: number) => TOPO + (topo - x) / topo * (H - TOPO - BASE);
  const grade: number[] = [];
  for (let g = passo; g <= topo + 1e-9; g += passo) grade.push(g);
  const larg = Math.min(18, (colW - 24) / series.length - 4);

  /* As linhas da tabela do detalhe — cabeças e @ sempre; R$ e R$/@ onde houver. */
  type Linha = { rotulo: string; valores: (string | null)[]; cor?: (number | null)[]; periodo?: boolean; so?: boolean };
  const linhas: Linha[] = [];
  if (aba === 'nascimentos' || aba === 'mortes') {
    const k = aba === 'nascimentos' ? 'nascimentos' : 'mortes';
    linhas.push(
      { rotulo: `${series[0].rotulo} (cab)`, valores: movs.map(m => (m ? n0(m[k].cabecas) : null)), periodo: true },
      { rotulo: `${series[0].rotulo} (@)`, valores: movs.map(m => (m ? n0(m[k].arrobas) : null)), periodo: true },
    );
  } else if (aba === 'compras') {
    linhas.push(
      { rotulo: 'Compras (cab)', valores: movs.map(m => (m ? n0(m.compradas.cabecas) : null)), periodo: true },
      { rotulo: 'Compras (@)', valores: movs.map(m => (m ? n0(m.compradas.arrobas) : null)), periodo: true },
      { rotulo: 'Reposição (R$)', valores: ind.map(x => (x.rsComp == null ? null : n2(-x.rsComp))), periodo: true,
        cor: ind.map(x => (x.rsComp == null ? null : -x.rsComp)) },
      { rotulo: 'Preço médio de reposição (R$/@)', valores: ind.map(x => n2(x.pkComp)) },
    );
  } else {
    const tipos: Array<{ k: 'abate' | 'venda' | 'consumo'; rot: string; centro: string | null }> = [
      { k: 'abate', rot: 'Abate', centro: 'Abates' },
      { k: 'venda', rot: 'Venda (peso vivo)', centro: 'Venda Peso Vivo' },
      { k: 'consumo', rot: 'Consumo', centro: null },
    ];
    for (const t of tipos) {
      linhas.push({ rotulo: `${t.rot} (cab · @)`, periodo: true, valores: movs.map(m => {
        const p = m?.desfrute_por_tipo?.[t.k];
        return p ? `${n0(p.cabecas)} · ${n0(p.arrobas)}` : null;
      }) });
      if (t.centro) {
        const centro = t.centro;
        const rs = anos.map(c => (c.semDado ? null : rsDoCentroDeVenda(c.linhas, centro)));
        linhas.push({ rotulo: `${t.rot} (R$)`, periodo: true, valores: rs.map(x => (x == null ? null : n2(x))), cor: rs },
          { rotulo: `${t.rot} (R$/@)`, valores: rs.map((x, i) => n2(razao(x, movs[i]?.desfrute_por_tipo?.[t.k].arrobas || null))) });
      }
    }
    for (const s of SUBCENTROS_SO_RS) {
      const vals = vendaGeral.map(g => (g.porSubcentro ? g.porSubcentro.get(s.subcentro) ?? 0 : null));
      /* ⚠ CARREGANDO É "…", NÃO "—": o traço diria que o dado não existe. */
      linhas.push({ rotulo: `${s.rotulo} (só R$)`, so: true, periodo: true, cor: vals,
        valores: vals.map((x, i) => (x == null ? (vendaGeral[i]?.carregando ? '…' : null) : n2(x))) });
    }
    const conhecidos = new Set<string>(SUBCENTROS_SO_RS.map(s => s.subcentro));
    const outros = vendaGeral.map(g => (g.porSubcentro
      ? [...g.porSubcentro].filter(([k]) => !conhecidos.has(k)).reduce((a, [, x]) => a + x, 0) : null));
    if (outros.some(x => x != null && x !== 0)) {
      linhas.push({ rotulo: 'Outros da Venda Geral (só R$)', so: true, periodo: true,
        valores: outros.map(x => (x == null ? null : n2(x))), cor: outros });
    }
  }

  return (
    <div>
      <svg width={M_W} height={H} viewBox={`0 0 ${M_W} ${H}`}>
        {grade.map(g => (
          <g key={g}>
            <line x1={L_ROTULO} x2={M_W - 2} y1={y(g)} y2={y(g)} stroke="#f0efe9" />
            <text x={L_ROTULO - 6} y={y(g) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{abrevMil(g, un)}</text>
          </g>
        ))}
        <line x1={L_ROTULO} x2={M_W - 2} y1={y(0)} y2={y(0)} stroke="#6B7280" />
        <g>
          {series.map((s, k) => (
            <text key={s.rotulo} x={10} y={TOPO + 12 + k * 13} fontSize={10.5} fontWeight={600} fill={s.cor}>{s.rotulo}</text>
          ))}
        </g>
        {anos.map((c, i) => {
          const x0 = L_ROTULO + colW * i;
          const meio = x0 + colW / 2;
          const totalL = series.length * (larg + 4) - 4;
          return (
            <g key={c.chave}>
              {series.map((s, k) => {
                const val = s.valores[i];
                const bx = meio - totalL / 2 + k * (larg + 4);
                if (val == null) {
                  return <text key={s.rotulo} x={bx + larg / 2} y={y(0) - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>;
                }
                return (
                  <g key={s.rotulo}>
                    <rect x={bx} y={y(val)} width={larg} height={Math.max(y(0) - y(val), val > 0 ? 1.5 : 0)} fill={s.cor}>
                      <title>{`${rotulo(c, i)} · ${s.rotulo}: ${formatNum(val, 0)} ${un}`}</title>
                    </rect>
                    <text x={bx + larg / 2} y={y(val) - 3} fontSize={9.5} fontWeight={600} fill="#374151" textAnchor="middle">
                      {abrevMil(val, '').trim()}
                    </text>
                  </g>
                );
              })}
              <RotuloAnoSvg x={meio} y={H - 8} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
            </g>
          );
        })}
      </svg>
      <table className="w-full border-collapse border-t tabular-nums" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: L_ROTULO }} />{anos.map(c => <col key={c.chave} />)}</colgroup>
        <tbody>
          {linhas.map((l, li) => (
            <tr key={l.rotulo} style={{ height: 16, backgroundColor: li % 2 === 0 ? ZEBRA_A : ZEBRA_B }}>
              <td className={cn('whitespace-nowrap px-2 text-left text-[11px]', l.so && 'text-muted-foreground')}>{l.rotulo}</td>
              {anos.map((c, i) => (
                <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right text-[11px]',
                  l.cor ? corDe(l.cor[i]) : '')}>
                  {celPeriodo(l.valores[i], l.periodo && parcial[i] ? c.meses : null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A célula de um valor do período num ano parcial: o número com a marca "8m" antes. */
function celPeriodo(txt: string | null, meses: number | null) {
  const t = txt ?? traco;
  /* ⚠ AUSÊNCIA NÃO LEVA MARCA: "8m —" diria que há um valor de oito meses. */
  if (meses == null || txt == null || txt === traco || txt === '…') return t;
  return <><span className="mr-1 text-[9.5px] text-muted-foreground">{meses}m</span>{t}</>;
}

/* ─────────────── a tabela de indicadores ─────────────── */

interface LinhaTab {
  rotulo: ReactNode;
  cels: (string | null)[];
  cores?: string[];
  k?: boolean;
  sub?: boolean;
  periodo?: boolean;
  /** A sublinha herda o fundo da linha de cima — "sublinhas no mesmo fundo". */
  zebra?: 'a' | 'b';
  swatch?: string;
  cinza?: boolean;
}

/* DRE-GRAFICOS-02 — a tabela com colunas de LARGURA FIXA (UI-LARGURA-FIXA-01): não estica no modal largo, com 2 ou com 5 anos.
   194 + 146 + 92·N + 96 + 56 — com 5 anos, 952px (o conteúdo do modal tem 960). */
const T_IND = 194, T_UN = 146, T_ANO = 92, T_DQ = 96, T_DP = 56;

/** UMA LINHA DA TABELA: os números de cada ano (para o Δ), como escrever e o SENTIDO (1 = mais é melhor; −1 = menos é melhor; 0 = neutro) */
interface LinhaNum {
  rotulo: string; unidade: string; base: string; vals: (number | null)[]; casas: number; sentido: 1 | -1 | 0;
  /** 'pct' = fração escrita em %, o Δ em pp; 'passo' = com sinal (entra +, sai −) */
  forma?: 'pct' | 'passo';
  /** valor do período (leva a marca "8m" no ano parcial) */
  periodo?: boolean; forte?: boolean; cinza?: boolean; swatch?: string;
  /** a célula de um ano em traço mesmo com número (a produção sem cache) */
  tracos?: boolean[];
  /** a linha de aviso embaixo (o GMD parcial): texto por ano, sem Δ */
  aviso?: string[];
}

/** o Δ de uma linha: o último ano contra o anterior — quantidade (pp na fração) e % (com base absoluta); a cor pelo SENTIDO */
export function deltaDaLinha(l: Pick<LinhaNum, 'vals' | 'sentido' | 'forma'>): { qtd: number | null; pct: number | null; tom: 'melhor' | 'pior' | null } {
  const n = l.vals.length;
  if (n < 2) return { qtd: null, pct: null, tom: null };
  const ult = l.vals[n - 1], ant = l.vals[n - 2];
  if (ult == null || ant == null) return { qtd: null, pct: null, tom: null };
  const qtd = l.forma === 'pct' ? (ult - ant) * 100 : ult - ant;
  const pct = l.forma === 'pct' || ant === 0 ? null : (ult - ant) / Math.abs(ant);
  const tom = l.sentido === 0 || qtd === 0 ? null : (qtd * l.sentido > 0 ? 'melhor' : 'pior');
  return { qtd, pct, tom };
}

const escreve = (l: LinhaNum, v: number | null) => (v == null ? traco
  : l.forma === 'pct' ? `${formatNum(v * 100, 1)}%`
  : l.forma === 'passo' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNum(Math.abs(v), l.casas)}`
  : formatNum(v, l.casas));

export function TabelaIndicadores({ anos, ind, movs, gmds, unidade, parcial, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[]; movs: readonly (MovimentosPec | null)[];
  gmds: readonly (number | null)[]; unidade: UnidadePonte; parcial: readonly boolean[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const un = unidade === 'at' ? '@' : 'cab';
  /* O movimento: a união dos passos dos anos, na ordem da ponte (os MESMOS números do gráfico acima). */
  const passosPorAno = movs.map((m, i) => passosDaPonte(m, unidade, ind[i].atProd != null));
  const ordem = ['inicio', 'producao', 'nascimentos', 'compras', 'transf', 'desfrute', 'mortes', 'dif', 'fim'];
  const presentes = ordem.filter(k => passosPorAno.some(ps => ps.some(p => p.chave === k)));
  const modelo = (k: string): PassoPonte | undefined => passosPorAno.flatMap(ps => ps).find(p => p.chave === k);
  const NOME_NA_TABELA: Record<string, string> = {
    inicio: 'Estoque inicial', producao: 'Ganho de peso (produção)', nascimentos: 'Nascimentos', compras: 'Compras (reposição)',
    transf: 'Transferências (líquido)', desfrute: 'Vendas e abates (desfrute)', mortes: 'Mortes', dif: 'Ajuste de contagem', fim: 'Estoque final',
  };
  /* mais ganho, mais nascimento, mais venda = melhor; morte (negativa) menos = melhor; compra e ajuste não julgam */
  const SENTIDO: Record<string, 1 | -1 | 0> = { inicio: 1, producao: 1, nascimentos: 1, compras: 0, transf: 0, desfrute: -1, mortes: 1, dif: 0, fim: 1 };
  const movimento: LinhaNum[] = presentes.map(k => {
    const ponta = k === 'inicio' || k === 'fim';
    return {
      rotulo: NOME_NA_TABELA[k] ?? modelo(k)?.rotulo ?? k, unidade: un,
      base: k === 'inicio' ? 'no 1º dia' : k === 'fim' ? 'no último dia' : 'soma do período',
      /* ⚠ PASSO QUE NÃO APARECEU NESTE ANO VALE ZERO (a diferença zerada, a transferência que se anula); a PRODUÇÃO SEM CACHE é traço */
      vals: passosPorAno.map((ps, i) => (movs[i] ? (ps.find(x => x.chave === k)?.valor ?? (k === 'producao' ? null : 0)) : null)),
      casas: 0, sentido: SENTIDO[k] ?? 0, forma: ponta ? undefined : 'passo', periodo: !ponta, forte: k === 'fim', cinza: k === 'dif',
      swatch: modelo(k)?.cor,
    };
  });
  const vendas: LinhaNum[] = [
    { rotulo: 'Rebanho inicial', unidade: 'cab', base: 'no 1º dia', vals: ind.map(x => x.cabIni), casas: 0, sentido: 1 },
    { rotulo: 'Rebanho final', unidade: 'cab', base: 'no último dia', vals: ind.map(x => x.cabFim), casas: 0, sentido: 1 },
    { rotulo: 'Vendidas e abatidas', unidade: 'cab', base: 'soma do período', vals: ind.map(x => x.cabDesf), casas: 0, sentido: 1, periodo: true },
    { rotulo: 'Desfrute', unidade: '% do inicial', base: 'no período', vals: ind.map(x => x.pctDesf), casas: 1, sentido: 1, forma: 'pct', periodo: true, forte: true },
    { rotulo: 'Preço médio de venda', unidade: 'R$/@', base: 'média do período', vals: ind.map(x => x.pkDesf), casas: 2, sentido: 1, forte: true },
    { rotulo: 'Receita das vendas', unidade: 'R$', base: 'soma do período', vals: ind.map(x => x.receitaDesf), casas: 0, sentido: 1, periodo: true },
  ];
  const custo: LinhaNum[] = [
    { rotulo: 'Ganho médio diário (GMD)', unidade: 'kg/cab/dia', base: 'média', vals: gmds.map((g, i) => (anos[i].semDado ? null : g)), casas: 3, sentido: 1,
      /* ⚠ O AVISO DO GMD MORA NO PRÓPRIO INDICADOR — decisão 4: jan–ago não compara com ano cheio */
      ...(parcial.some(Boolean) ? { aviso: anos.map((c, i) => (parcial[i] ? rotuloMesesDe(c) : '')) } : {}) },
    { rotulo: 'Custeio de produção', unidade: 'R$', base: 'soma do período', vals: ind.map(x => (x.custeio == null ? null : -x.custeio)), casas: 0, sentido: 1, periodo: true },
    { rotulo: 'Custo por arroba produzida', unidade: 'R$/@', base: 'média do período', vals: ind.map(x => x.custoAt), casas: 2, sentido: -1, forte: true },
    { rotulo: 'Margem por arroba', unidade: 'R$/@', base: 'preço − custo', vals: ind.map(x => x.margemAt), casas: 2, sentido: 1, forte: true },
  ];
  const secoes: Array<{ titulo: string; linhas: LinhaNum[] }> = [
    { titulo: `Movimento do rebanho · em ${unidade === 'at' ? 'arrobas' : 'cabeças'}`, linhas: movimento },
    { titulo: 'Rebanho e vendas', linhas: vendas },
    { titulo: 'Custo e margem por arroba', linhas: custo },
  ];
  const lucro: LinhaNum = { rotulo: 'Lucro operacional', unidade: 'R$', base: 'soma do período', vals: ind.map(x => x.lucroOp), casas: 0, sentido: 1, periodo: true };
  const n = anos.length;
  const nCols = n + 4;
  const rotDelta = n >= 2 ? `Δ ${anos[n - 1].nome} × ${anos[n - 2].nome}` : 'Δ';
  const corTom = (t: 'melhor' | 'pior' | null) => (t === 'melhor' ? 'text-emerald-700' : t === 'pior' ? 'text-destructive' : 'text-muted-foreground');
  const celulas = (l: LinhaNum, escuro = false) => {
    const d = deltaDaLinha(l);
    return (<>
      {anos.map((c, i) => (
        <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right text-[11px]', l.forte && 'font-semibold', l.cinza && 'text-muted-foreground')}>
          {c.linhas == null && !c.semDado
            ? <span className={escuro ? 'text-white/70' : 'text-muted-foreground'}>…</span>
            : celPeriodo(c.semDado || l.tracos?.[i] ? null : escreve(l, l.vals[i]), l.periodo && parcial[i] ? c.meses : null)}
        </td>
      ))}
      <td className={cn('whitespace-nowrap px-2 text-right text-[10px]', escuro ? 'text-white' : corTom(d.tom))} data-delta-qtd>
        {d.qtd == null ? traco : `${d.qtd > 0 ? '+' : d.qtd < 0 ? '−' : ''}${formatNum(Math.abs(d.qtd), l.forma === 'pct' ? 1 : l.casas)}${l.forma === 'pct' ? ' pp' : ''}`}
      </td>
      <td className={cn('whitespace-nowrap px-1.5 text-right text-[10px]', escuro ? 'text-white' : corTom(d.tom))} data-delta-pct>
        {d.pct == null ? traco : `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${formatNum(Math.abs(d.pct) * 100, 1)}%`}
      </td>
    </>);
  };
  let z = 0;
  return (
    /* ⚠ SEM `overflow-hidden` AQUI, de propósito: ele faria desta caixa o scrollport do `sticky` e o cabeçalho rolaria junto. */
    <div className="self-start rounded-md border" data-testid="leitura-tabela">
      <table className="border-collapse tabular-nums" style={{ tableLayout: 'fixed', width: T_IND + T_UN + T_ANO * n + T_DQ + T_DP }}>
        <colgroup>
          <col style={{ width: T_IND }} /><col style={{ width: T_UN }} />
          {anos.map(c => <col key={c.chave} style={{ width: T_ANO }} />)}
          <col style={{ width: T_DQ }} /><col style={{ width: T_DP }} />
        </colgroup>
        <thead className="sticky z-10" style={{ top: -10 }}>
          <tr style={{ height: 22, backgroundColor: NAVY }}>
            <th className="rounded-tl-md px-2 text-left text-[11px] font-semibold text-white" style={{ backgroundColor: NAVY }}>Indicador</th>
            <th className="px-2 text-left text-[10px] font-semibold text-white" style={{ backgroundColor: NAVY }}>Unidade · base</th>
            {anos.map((c, i) => (
              <th key={c.chave} style={{ backgroundColor: NAVY }}
                className="cursor-pointer whitespace-nowrap px-2 text-right text-[11px] font-semibold text-white hover:underline"
                title={`Abrir a cascata de ${c.nome}`} onClick={() => onAbrirAno(c.chave)}>
                {rotulo(c, i)}
              </th>
            ))}
            <th colSpan={2} className="rounded-tr-md whitespace-nowrap px-2 text-right text-[10px] font-semibold text-white" style={{ backgroundColor: NAVY }}
              title="Compara o último ano com o anterior, no mesmo recorte de meses. Verde = melhorou, vermelho = piorou (pelo sentido do indicador)."
              data-testid="leitura-delta-cabecalho">{rotDelta}</th>
          </tr>
        </thead>
        <tbody>
          {secoes.map(sec => [
            <tr key={sec.titulo} style={{ height: 17, backgroundColor: SECAO }}>
              <td colSpan={nCols} className="border-t px-2 text-[10.5px] font-semibold text-foreground/80" style={{ borderColor: '#d6d4cc' }}>{sec.titulo}</td>
            </tr>,
            ...sec.linhas.flatMap((l) => {
              const zebra = z++ % 2 === 0 ? ZEBRA_A : ZEBRA_B;
              const linha = (
                <tr key={`${sec.titulo}-${l.rotulo}`} style={{ height: 16, backgroundColor: zebra }} data-indicador={l.rotulo}>
                  <td className={cn('truncate whitespace-nowrap px-2 text-left text-[11px]', l.forte && 'font-semibold', l.cinza && 'text-muted-foreground')} title={l.rotulo}>
                    {l.swatch && <i className="mr-1.5 inline-block rounded-[2px] align-[-1px]" style={{ width: 9, height: 9, backgroundColor: l.swatch }} />}
                    {l.rotulo}
                  </td>
                  <td className="truncate whitespace-nowrap px-2 text-left text-[10px] text-muted-foreground" title={`${l.unidade} · ${l.base}`}>{l.unidade} · {l.base}</td>
                  {celulas(l)}
                </tr>
              );
              if (!l.aviso) return [linha];
              return [linha, (
                <tr key={`${sec.titulo}-${l.rotulo}-aviso`} style={{ height: 13, backgroundColor: zebra }}>
                  <td colSpan={2} className="whitespace-nowrap pl-[18px] pr-2 text-left text-[9.5px] text-muted-foreground">período parcial: não compara com ano cheio</td>
                  {anos.map((c, i) => <td key={c.chave} className="whitespace-nowrap px-2 text-right text-[9.5px] text-muted-foreground">{l.aviso?.[i] ?? ''}</td>)}
                  <td /><td />
                </tr>
              )];
            }),
          ])}
          <tr style={{ height: 19, backgroundColor: NAVY }} data-indicador="Lucro operacional">
            <td className="px-2 text-left text-[11px] font-semibold text-white">= Lucro operacional</td>
            <td className="px-2 text-left text-[10px] text-white/80">R$ · soma do período</td>
            {anos.map((c, i) => {
              const v = ind[i].lucroOp;
              return (
                <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right text-[11px] font-semibold',
                  v == null || v === 0 ? 'text-white' : v > 0 ? 'text-green-300' : 'text-red-300')}>
                  {c.semDado || v == null ? traco : (
                    <>{parcial[i] && <span className="mr-1 text-[9.5px] font-normal text-white/70">{c.meses}m</span>}{formatNum(v, 0)}</>
                  )}
                </td>
              );
            })}
            {(() => {
              const d = deltaDaLinha(lucro);
              const cor = d.tom === 'melhor' ? 'text-green-300' : d.tom === 'pior' ? 'text-red-300' : 'text-white';
              return (<>
                <td className={cn('whitespace-nowrap px-2 text-right text-[10px] font-semibold', cor)} data-delta-qtd>
                  {d.qtd == null ? traco : `${d.qtd > 0 ? '+' : d.qtd < 0 ? '−' : ''}${formatNum(Math.abs(d.qtd), lucro.casas)}`}</td>
                <td className={cn('whitespace-nowrap px-1.5 text-right text-[10px] font-semibold', cor)} data-delta-pct>
                  {d.pct == null ? traco : `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${formatNum(Math.abs(d.pct) * 100, 1)}%`}</td>
              </>);
            })()}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "jan–ago" — o recorte de meses de uma coluna parcial, para o aviso do GMD. */
function rotuloMesesDe(c: ColunaPec) {
  const ms = mesesDoPeriodo(c.de, c.ate);
  if (ms.length === 0) return '';
  const m = (am: string) => MES3[Number(am.slice(5, 7)) - 1] ?? '?';
  return `${m(ms[0])}–${m(ms[ms.length - 1])}`;
}
