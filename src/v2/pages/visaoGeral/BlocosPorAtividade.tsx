/**
 * VISAO-GERAL-02 — por último na Visão Geral, um bloco por ATIVIDADE LIGADA do cliente (`atividadesDaVisao.ts`, fonte do Code 6), com o
 * filtro em pílulas (mock aprovado, 03/11/2026). Cada número vem da fonte da tela dona; o que não tem fonte diz "em breve"; sem dado, "—".
 *   · Pecuária: cabeças, lotação, GMD e @ produzidas (os indicadores do rebanho oficial que a Visão Geral já carrega, com a meta pela
 *     MESMA fonte; sem meta → só o realizado); custo variável e margem por @ pela DRE pecuária (`porArroba`, a régua da tela DRE).
 *   · Agricultura: a safra do mês (cadastro de safras), área plantada e fase (talhões da safra), colhido e em estoque por cultura
 *     (`fn_estoque_graos_resumo`, a tela Estoque de grãos), custo e receita (`fn_dre_lavoura`, a DRE agrícola). Estimativa: em breve.
 *   · Silvicultura: a área (o bloco Área); talhões, idade, volume e custo: em breve (não há cadastro).
 * Os blocos de Agricultura carregam as próprias consultas e só montam quando a atividade aparece.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { safraDoMes } from './agriculturaDaVisao';
import { useEstoqueGraosResumo } from '@/hooks/useEstoqueGraos';
import { useDreLavoura } from '@/hooks/useDreLavoura';
import { unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import type { AtividadeDoCliente, GrupoAtividade } from './atividadesDaVisao';

export interface Numero { valor: string | null; detalhe?: string | null; tom?: 'neutro' | 'positivo' | 'negativo' }

function Celula({ titulo, n }: { titulo: string; n: Numero }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground truncate">{titulo}</div>
      <div className="text-[15px] font-semibold text-foreground tabular-nums truncate">{n.valor ?? '—'}</div>
      <div className={cn('text-[11px] h-4 truncate', n.tom === 'negativo' ? 'text-amber-700' : n.tom === 'positivo' ? 'text-emerald-700' : 'text-muted-foreground')}>
        {n.detalhe ?? ''}
      </div>
    </div>
  );
}

function Bloco({ titulo, sub, abrir, onAbrir, celulas, testid }: {
  titulo: string; sub?: string; abrir: string; onAbrir?: () => void; celulas: { titulo: string; n: Numero }[]; testid: string;
}) {
  return (
    <section className="bg-card rounded-xl border border-border/40 p-4" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {titulo}{sub ? <span className="font-normal text-muted-foreground"> · {sub}</span> : null}
        </h3>
        {onAbrir && <button type="button" className="shrink-0 text-[12px] text-primary hover:underline" onClick={onAbrir}>{abrir} ›</button>}
      </div>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {celulas.map((c) => <Celula key={c.titulo} titulo={c.titulo} n={c.n} />)}
      </div>
    </section>
  );
}

const EM_BREVE: Numero = { valor: null, detalhe: 'em breve' };

export interface DadosPecuaria {
  sub?: string;
  cabecas: Numero; lotacao: Numero; gmd: Numero; arrobas: Numero; custoMargemArroba: Numero;
}


/** "1.234 sc 60kg · 56 t": cada cultura na sua unidade (saca e tonelada não se somam). */
const porCultura = (itens: { cultura: string; v: number }[]) =>
  itens.filter((i) => i.v > 0).map((i) => `${formatNum(i.v, 0)} ${unidadeCurtaDaCultura(i.cultura)}`).join(' · ') || null;

const reais = (v: number | null | undefined) =>
  v == null || isNaN(v) ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function BlocoAgricultura({ clienteId, anoMes, sub, onAbrir }: { clienteId: string | null; anoMes: string; sub?: string; onAbrir?: () => void }) {
  const { safras } = useSafrasLavoura(clienteId);
  const safra = useMemo(() => safraDoMes(safras, anoMes), [safras, anoMes]);
  const { talhoes } = useTalhoesDaSafra(clienteId, safra?.id ?? null);
  const { culturas } = useEstoqueGraosResumo(clienteId, safra?.id ?? null, true);
  const { dre } = useDreLavoura(clienteId, safra?.id ?? null);
  const area = talhoes.length ? talhoes.reduce((s, t) => s + t.area_plantada_ha, 0) : null;
  const plantados = talhoes.filter((t) => t.status === 'plantada').length;
  const fase = talhoes.length === 0 ? null
    : plantados === talhoes.length ? `${talhoes.length} talhões · plantada`
      : plantados === 0 ? `${talhoes.length} talhões · em abertura` : `${plantados} de ${talhoes.length} talhões plantados`;
  const nomesCulturas = [...new Set(talhoes.map((t) => t.cultura))].join(', ') || null;
  return (
    <Bloco testid="vg-bloco-agricultura" titulo="Agricultura" sub={sub} abrir="DRE agrícola" onAbrir={onAbrir} celulas={[
      { titulo: 'Safra', n: { valor: safra ? (safra.codigo ?? safra.nome) : null, detalhe: nomesCulturas } },
      { titulo: 'Área plantada', n: { valor: area === null ? null : `${formatNum(area, 0)} ha`, detalhe: fase } },
      { titulo: 'Colhido', n: { valor: porCultura(culturas.map((c) => ({ cultura: c.cultura, v: c.colhido }))), detalhe: '% da estimativa: em breve' } },
      { titulo: 'Em estoque', n: { valor: porCultura(culturas.map((c) => ({ cultura: c.cultura, v: c.saldo }))) } },
      { titulo: 'Custo · receita', n: { valor: dre ? `${reais(dre.total.custo_operacional) ?? '—'} · ${reais(dre.total.linhas.receita_bruta.valor) ?? '—'}` : null, detalhe: 'da DRE agrícola' } },
    ]} />
  );
}

export function BlocosPorAtividade({ atividades, pecuaria, silviculturaHa, clienteId, anoMes, subPorGrupo, onAbrir }: {
  atividades: readonly AtividadeDoCliente[];
  pecuaria: DadosPecuaria;
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
      className={cn('rounded-full border px-3 py-1 text-[12px] transition-colors',
        filtro === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50')}>
      {rotulo}
    </button>
  );
  return (
    <div ref={area} className="space-y-3" data-testid="vg-atividades"
      style={filtro !== 'todas' && alturaTodas ? { minHeight: alturaTodas } : undefined}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-muted-foreground mr-1">Atividades do cliente</span>
        {pilula('todas', 'Todas')}
        {atividades.map((a) => pilula(a.id, a.nome))}
      </div>
      {/* os blocos TROCAM de propósito ao escolher uma atividade (`data-desloca-livre`); as pílulas acima continuam medidas */}
      <div className="space-y-3" data-desloca-livre>
      {visiveis.map((a) => a.grupo === 'pecuaria' ? (
        <Bloco key={a.id} testid="vg-bloco-pecuaria" titulo={a.nome} sub={subPorGrupo?.pecuaria} abrir="Fechamento" onAbrir={() => onAbrir('pecuaria')} celulas={[
          { titulo: 'Cabeças', n: pecuaria.cabecas },
          { titulo: 'Lotação', n: pecuaria.lotacao },
          { titulo: 'GMD', n: pecuaria.gmd },
          { titulo: '@ produzidas no ano', n: pecuaria.arrobas },
          { titulo: 'Custo variável · margem por @', n: pecuaria.custoMargemArroba },
        ]} />
      ) : a.grupo === 'agricultura' ? (
        <BlocoAgricultura key={a.id} clienteId={clienteId} anoMes={anoMes} sub={subPorGrupo?.agricultura} onAbrir={() => onAbrir('agricultura')} />
      ) : (
        <Bloco key={a.id} testid="vg-bloco-silvicultura" titulo={a.nome} sub={subPorGrupo?.silvicultura} abrir="Geo pastos" onAbrir={() => onAbrir('silvicultura')} celulas={[
          { titulo: 'Área', n: { valor: silviculturaHa === null ? null : `${formatNum(silviculturaHa, 0)} ha`, detalhe: 'talhões: em breve' } },
          { titulo: 'Idade média', n: EM_BREVE },
          { titulo: 'Volume estimado', n: EM_BREVE },
          { titulo: 'Próximo corte', n: EM_BREVE },
          { titulo: 'Custo acumulado', n: EM_BREVE },
        ]} />
      ))}
      </div>
    </div>
  );
}
