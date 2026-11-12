/**
 * VISAO-GERAL-02 — por último na Visão Geral, um bloco por ATIVIDADE LIGADA do cliente (`atividadesDaVisao.ts`, fonte do Code 6), com o
 * filtro em pílulas (mock aprovado, 03/11/2026). Cada número vem da fonte da tela dona.
 * VISAO-GERAL-03: a escala da Geo pastos › Global (título 11 px, número 14 px, rótulo 9,5 px; as pílulas são os chips de lá, 20 px, 10 px).
 * VISAO-GERAL-05 (Gabriel 04/11 07:29, "espaçados demais"): cada atividade é UMA linha compacta (a altura de ~2 linhas de tabela) — o
 * nome à esquerda, os indicadores lado a lado na largura do conteúdo (nada de colunas de 1/5 da tela) e, embaixo de cada valor, a
 * comparação pequena ("▲ x% meta · ▼ y% ano ant.", verde quando é bom, vermelho quando não). Indicador sem dado não aparece; nunca
 * "em breve". As contas e as fontes moram em `indicadoresDaAtividade.ts`; esta peça só desenha. Os blocos de Agricultura carregam as
 * próprias consultas e só montam quando a atividade aparece.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { safraAnterior, safraDoMes } from './agriculturaDaVisao';
import { useEstoqueGraosResumo } from '@/hooks/useEstoqueGraos';
import { useDreLavoura } from '@/hooks/useDreLavoura';
import { Kpi } from '@/components/mapa-geo/GeoPastosGlobal';
import { Comparacao } from './Comparacao';
import { comDado, indicadoresAgricultura, indicadoresSilvicultura, type IndicadorAtividade } from './indicadoresDaAtividade';
import type { AtividadeDoCliente, GrupoAtividade } from './atividadesDaVisao';

/* VISAO-GERAL-05 (07:31) — cada indicador é o `Kpi` da Geo pastos (a mesma peça da faixa de cima): número 24 px em negrito com a unidade
   ao lado, o rótulo embaixo, a comparação embaixo do rótulo. Largura pelo conteúdo (`flex-none`); a fonte no `title`. */
function Indicador({ i }: { i: IndicadorAtividade }) {
  return <Kpi className="px-2" rotulo={i.rotulo} valor={i.valor} unidade={i.unidade ?? null} title={i.fonte} testid={`vg-ind-${i.id}`}
    variacao={<Comparacao i={i} />} />;
}

function LinhaDaAtividade({ titulo, sub, abrir, onAbrir, indicadores, testid }: {
  titulo: string; sub?: string; abrir: string; onAbrir?: () => void; indicadores: readonly IndicadorAtividade[]; testid: string;
}) {
  const itens = comDado(indicadores);
  /* VISAO-GERAL-04 (mock aprovado 08/11, V7) — UMA linha na régua: o nome numa coluna de 120 px e os indicadores em colunas iguais na
     largura toda; abaixo de 1024 px o nome sobe para a linha de cima e os indicadores ficam com a largura inteira */
  return (
    <section className="grid grid-cols-[repeat(var(--n),minmax(0,1fr))] items-stretch gap-1.5 rounded-lg border border-border bg-card p-1.5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] lg:grid-cols-[120px_repeat(var(--n),minmax(0,1fr))]"
      style={{ '--n': Math.max(itens.length, 1) } as CSSProperties} data-testid={testid}>
      {/* o nome, o detalhe e o link empilhados à esquerda (o link ao lado dos números empurrava a linha para duas a 1.280) */}
      <div className="col-span-full min-w-0 px-1 lg:col-span-1">
        <h3 className="whitespace-nowrap text-[11px] font-semibold leading-[18px]">{titulo}</h3>
        <div className="h-[12px] whitespace-nowrap text-[9.5px] leading-[12px] text-muted-foreground">{sub ?? ''}</div>
        {onAbrir && <button type="button" className="mt-1 whitespace-nowrap text-[10px] text-primary hover:underline" onClick={onAbrir}>{abrir} ›</button>}
      </div>
      {itens.map((i) => <Indicador key={i.id} i={i} />)}
      {itens.length === 0 && <span className="self-center text-[9.5px] text-muted-foreground">Sem números neste mês.</span>}
    </section>
  );
}

function BlocoAgricultura({ clienteId, anoMes, titulo, sub, onAbrir }: {
  clienteId: string | null; anoMes: string; titulo: string; sub?: string; onAbrir?: () => void;
}) {
  const { safras } = useSafrasLavoura(clienteId);
  const safra = useMemo(() => safraDoMes(safras, anoMes), [safras, anoMes]);
  const anterior = useMemo(() => safraAnterior(safras, safra), [safras, safra]);
  const { talhoes } = useTalhoesDaSafra(clienteId, safra?.id ?? null);
  const { talhoes: talhoesAnt } = useTalhoesDaSafra(clienteId, anterior?.id ?? null);
  const { culturas } = useEstoqueGraosResumo(clienteId, safra?.id ?? null, true);
  const { dre } = useDreLavoura(clienteId, safra?.id ?? null);
  const { dre: dreAnt } = useDreLavoura(clienteId, anterior?.id ?? null);
  const soma = (ts: readonly { area_plantada_ha: number }[]) => (ts.length ? ts.reduce((s, t) => s + t.area_plantada_ha, 0) : null);
  const indicadores = indicadoresAgricultura({
    dre: dre ?? null, dreAnt: anterior ? dreAnt ?? null : null,
    areaPlantada: soma(talhoes), areaPlantadaAnt: anterior ? soma(talhoesAnt) : null,
    colhido: culturas.map((c) => ({ cultura: c.cultura, v: c.colhido })),
  });
  const daSafra = safra ? `safra ${safra.codigo ?? safra.nome}` : null;
  return <LinhaDaAtividade testid="vg-bloco-agricultura" titulo={titulo} sub={[daSafra, sub].filter(Boolean).join(' · ') || undefined}
    abrir="DRE agrícola" onAbrir={onAbrir} indicadores={indicadores} />;
}

export function BlocosPorAtividade({ atividades, pecuaria, silviculturaHa, clienteId, anoMes, subPorGrupo, onAbrir }: {
  atividades: readonly AtividadeDoCliente[];
  pecuaria: readonly IndicadorAtividade[];
  silviculturaHa: number | null;
  clienteId: string | null;
  anoMes: string;
  subPorGrupo?: Partial<Record<GrupoAtividade, string>>;
  onAbrir: (g: GrupoAtividade) => void;
}) {
  const [filtro, setFiltro] = useState<string>('todas');
  /* ESPAÇO RESERVADO ("nada pula ao selecionar"): filtrar uma atividade encolheria a página, e quem estava no fim dela veria tudo
     pular quando o navegador puxa a rolagem de volta. Com uma atividade escolhida, a área guarda a altura que tinha em "Todas". */
  const area = useRef<HTMLDivElement>(null);
  const [alturaTodas, setAlturaTodas] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || filtro !== 'todas') return;
    setAlturaTodas(el.offsetHeight);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setAlturaTodas(el.offsetHeight));
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [filtro, atividades.length]);
  if (atividades.length === 0) return null;
  const visiveis = filtro === 'todas' ? atividades : atividades.filter((a) => a.id === filtro);
  const pilula = (id: string, rotulo: string) => (
    <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
      className={cn('inline-flex h-[20px] flex-none items-center whitespace-nowrap rounded-full border px-2 text-[10px]',
        filtro === id ? 'border-[#1B2A44] bg-[#1B2A44] text-white' : 'border-border bg-card hover:bg-muted')}>
      {rotulo}
    </button>
  );
  return (
    <div ref={area} className="space-y-1.5" data-testid="vg-atividades"
      style={filtro !== 'todas' && alturaTodas ? { minHeight: alturaTodas } : undefined}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] font-semibold">Atividades do cliente</span>
        {pilula('todas', 'Todas')}
        {atividades.map((a) => pilula(a.id, a.nome))}
      </div>
      {/* os blocos TROCAM de propósito ao escolher uma atividade (`data-desloca-livre`); as pílulas acima continuam medidas.
          VISAO-GERAL-04: uma atividade por linha, cada uma na largura toda */}
      <div className="flex flex-col gap-1.5" data-desloca-livre>
      {visiveis.map((a) => a.grupo === 'pecuaria' ? (
        <LinhaDaAtividade key={a.id} testid="vg-bloco-pecuaria" titulo={a.nome} sub={subPorGrupo?.pecuaria} abrir="Fechamento"
          onAbrir={() => onAbrir('pecuaria')} indicadores={pecuaria} />
      ) : a.grupo === 'agricultura' ? (
        <BlocoAgricultura key={a.id} clienteId={clienteId} anoMes={anoMes} titulo={a.nome} sub={subPorGrupo?.agricultura}
          onAbrir={() => onAbrir('agricultura')} />
      ) : (
        <LinhaDaAtividade key={a.id} testid="vg-bloco-silvicultura" titulo={a.nome} sub={subPorGrupo?.silvicultura} abrir="Geo pastos"
          onAbrir={() => onAbrir('silvicultura')} indicadores={indicadoresSilvicultura(silviculturaHa)} />
      ))}
      </div>
    </div>
  );
}
