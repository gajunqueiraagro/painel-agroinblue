/**
 * PROD-EVOLUCAO-01b — Produção › Evolução do rebanho, NÍVEL 2: o mês por categoria, para CONFERIR (mock v4, Gabriel 30/10 17:13).
 *
 * Abre no mês clicado na Evolução no Ano (ou no último mês fechado), com a volta "‹ Evolução no Ano" e as setas de mês — conserta a tela de hoje,
 * PRESA no mês corrente desde o c01a10e3 (10/09). As 9 categorias sempre, na ordem do Fechamento, com subtotal de Machos e de Fêmeas. Cada tipo
 * de movimento do mês com cabeças e kg/cab (o tipo sem movimento fica escondido, com o aviso embaixo); o kg lançado pinta âmbar a partir de 15% e
 * vermelho a partir de 25% de diferença do kg/cab final da categoria no Fechamento. Linha "Confere". Painel da direita: "Conferir pesos" (cada
 * lançamento do mês, do maior desvio para o menor, ✎ abre) e "Composição".
 * ⚠ Números: as MESMAS contas da Evolução por Categoria de hoje (`montarMesPorCategoria`); a régua da casa; número nunca corta.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useEvolucaoDoMes } from '@/hooks/useEvolucaoDoMes';
import {
  TIPOS_DO_MES, kgCabFinal, kgPorCab, desvio, tomDoDesvio, montarMesPorCategoria, pesosAConferir, categoriaCurta, tipoCurto, type LinhaDoMes,
} from '@/lib/producao/evolucaoMes';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { Segmentado } from '@/components/ui/segmentado';
import { QUADRO_REGUA, TD_REGUA, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';

const MESES = MESES_COLS.map((m) => m.label);
const fmt = (v: number | null | undefined, casas = 0): string => {
  if (v == null) return '—';
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return v < 0 && Number(s.replace(/\./g, '').replace(',', '.')) !== 0 ? `−${s}` : s;
};
/* fix1 (Gabriel 31/10, item 2): VAZIO = VAZIO — célula sem movimento (zero ou sem dado) fica em branco; o "Confere" usa o `fmt` */
const vazio = (v: number | null | undefined, casas = 0): string => (v == null || v === 0 ? '' : fmt(v, casas));
/* fix1 (item 1): o kg/cab é secundário — fonte bem menor e mais clara que as cabeças */
const KG_SECUNDARIO = 'text-[8.5px] text-muted-foreground/80';
/* fix1 (item 3): zebra leve entre as categorias; os subtotais ficam com o fundo próprio */
const ZEBRA = ['bg-card', 'bg-[#f7f8fa]'];
const TOM = { vermelho: 'bg-[#fde1e1] text-[#a3161c] font-semibold', ambar: 'bg-[#fff1d6] text-[#8a4b00] font-semibold' } as const;
const ROTULO_TIPO: Record<string, string> = Object.fromEntries([...TIPOS_DO_MES.map((t) => [t.tipo, t.rotulo]), ['reclassificacao', 'Evolução']]);

export interface Props {
  /** o mês que a Evolução no Ano mandou (null = o último mês fechado) */
  anoInicial?: number;
  mesInicial?: number | null;
  onVoltar?: () => void;
  onAbrirFechamento?: (ano: number, mes: number) => void;
  /** ✎ de "Conferir pesos": abre o lançamento (com OC, a OC) */
  onEditarLancamento?: (id: string) => void;
  /** a célula de um movimento: os lançamentos do mês, do tipo e da categoria */
  onAbrirLancamentos?: (o: { ano: number; mes: number; tipo: FluxoTipo | 'reclassificacao'; categoria: string | null; cenario: 'realizado' | 'meta' }) => void;
}

export function EvolucaoMesTab({ anoInicial, mesInicial, onVoltar, onAbrirFechamento, onEditarLancamento, onAbrirLancamentos }: Props) {
  const [ano, setAno] = useState(anoInicial ?? new Date().getFullYear());
  const [mesEscolhido, setMes] = useState<number | null>(mesInicial ?? null);
  const [cenario, setCenario] = useState<'realizado' | 'meta'>('realizado');
  /* fix1 (item 4): o painel abre SEMPRE em "Composição"; "Conferir pesos" é a 2ª aba */
  const [aba, setAba] = useState<'pesos' | 'composicao'>('composicao');
  /* sem mês dito, o último fechado; sem nenhum fechado, o mês de hoje */
  const prov = useEvolucaoDoMes(ano, mesEscolhido ?? 1, cenario);
  const mes = mesEscolhido ?? prov.ultimoFechado ?? new Date().getMonth() + 1;
  const d = useEvolucaoDoMes(ano, mes, cenario);

  const m = useMemo(() => montarMesPorCategoria(d.rowsDoMes, d.categorias, cenario), [d.rowsDoMes, d.categorias, cenario]);
  const anterior = useMemo(() => montarMesPorCategoria(d.rowsDoMesAnterior, d.categorias, cenario), [d.rowsDoMesAnterior, d.categorias, cenario]);
  const pesos = useMemo(() => pesosAConferir(d.lancamentos, d.fechado ? m.referencia : new Map()), [d.lancamentos, d.fechado, m.referencia]);
  const total = m.linhas.find((l) => l.id === 'total')!;
  const totalAnt = anterior.linhas.find((l) => l.id === 'total');
  const aConferir = pesos.filter((p) => p.tom).length;
  const rotuloMes = `${MESES[mes - 1]}/${String(ano).slice(2)}`;
  const rotuloAnt = mes > 1 ? `${MESES[mes - 2].toLowerCase()}/${String(ano).slice(2)}` : null;
  const irPara = (delta: number) => {
    let a = ano; let n = mes + delta;
    if (n < 1) { n = 12; a -= 1; } else if (n > 12) { n = 1; a += 1; }
    setAno(a); setMes(n);
  };
  const tiposVis = TIPOS_DO_MES.filter((t) => m.tiposVisiveis.includes(t.tipo));
  const entradasCab = TIPOS_DO_MES.filter((t) => t.lado === 'entrada').reduce((s, t) => s + total.tipos[t.tipo].cab, 0);
  const saidasCab = TIPOS_DO_MES.filter((t) => t.lado === 'saida').reduce((s, t) => s + total.tipos[t.tipo].cab, 0);
  /* o card mostra o kg/cab do lado (cabe sempre); a lista dos tipos vai no `title` — fora de tabela nada termina em "…" */
  const kgCabDoLado = (lado: 'entrada' | 'saida') => {
    const ts = TIPOS_DO_MES.filter((t) => t.lado === lado);
    return kgPorCab({ cab: ts.reduce((s, t) => s + total.tipos[t.tipo].cab, 0), kg: ts.reduce((s, t) => s + total.tipos[t.tipo].kg, 0) });
  };
  const subDoLado = (lado: 'entrada' | 'saida') => { const k = kgCabDoLado(lado); return k == null ? '' : `${fmt(k, 1)} kg/cab`; };
  const detalhe = (lado: 'entrada' | 'saida') => TIPOS_DO_MES.filter((t) => t.lado === lado && total.tipos[t.tipo].cab > 0)
    .map((t) => `${t.rotulo.toLowerCase()} ${fmt(total.tipos[t.tipo].cab)}`).join(' · ') || 'nenhuma';

  /* uma célula de kg/cab: o desvio só nas linhas de categoria com Fechamento */
  const celKg = (l: LinhaDoMes, v: number | null, ref: number | null) => {
    const tom = l.nivel === 'categoria' && d.fechado ? tomDoDesvio(desvio(v, ref)) : null;
    return <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', KG_SECUNDARIO, tom && TOM[tom])}>{vazio(v, 1)}</td>;
  };
  const celCab = (l: LinhaDoMes, v: number, abrir?: () => void) => (
    <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap',
      abrir && v !== 0 && 'cursor-pointer underline decoration-dotted decoration-[#8aa0bf] underline-offset-2')}
      onClick={abrir && v !== 0 ? abrir : undefined}>{l.temDado ? vazio(v) : ''}</td>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 px-4 py-2" data-testid="evolucao-do-mes">
      {/* BARRA — a volta, o mês com as setas, o cenário e o Fechamento */}
      <div className="flex h-[34px] shrink-0 items-center gap-3 rounded-md border border-border bg-card px-2 text-[10px] whitespace-nowrap">
        <button type="button" className="h-[24px] rounded-md border border-border px-2 font-semibold text-[#1e2d47]" onClick={onVoltar} data-testid="evolucao-mes-voltar">‹ Evolução no Ano</button>
        <span className="inline-flex h-[24px] items-center overflow-hidden rounded-md border border-border">
          <button type="button" className="h-full px-2" onClick={() => irPara(-1)} aria-label="mês anterior">‹</button>
          <span className="flex h-full min-w-[64px] items-center justify-center bg-primary px-2 font-semibold text-primary-foreground tabular-nums" data-testid="evolucao-mes-rotulo">{rotuloMes}</span>
          <button type="button" className="h-full px-2" onClick={() => irPara(1)} aria-label="mês seguinte">›</button>
        </span>
        <span className="text-muted-foreground">Cenário</span>
        <Segmentado valor={cenario} onEscolher={setCenario} altura={24} opcoes={[{ valor: 'realizado', rotulo: 'Realizado' }, { valor: 'meta', rotulo: 'Meta' }]} />
        <button type="button" className="ml-auto h-[24px] rounded-md border border-border px-2 font-semibold" onClick={() => onAbrirFechamento?.(ano, mes)}>Fechamento ↗</button>
      </div>

      {/* CARDS */}
      <div className="grid h-[52px] shrink-0 grid-cols-6 gap-1.5">
        <Card titulo={`Saldo inicial · ${rotuloMes.toLowerCase()}`} valor={fmt(total.inicio.cab)} unidade="cab" sub={rotuloAnt ? `fechamento de ${rotuloAnt}` : 'saldo inicial do ano'} />
        <Card titulo="Entradas externas" valor={`+${fmt(entradasCab)}`} unidade="cab" sub={subDoLado('entrada')} dica={detalhe('entrada')} />
        <Card titulo="Saídas externas" valor={fmt(-saidasCab)} unidade="cab" sub={subDoLado('saida')} dica={detalhe('saida')} />
        <Card titulo="Evolução de categoria" valor={fmt(total.entrou.cab)} unidade="cab" sub={total.entrou.cab ? `${fmt(kgPorCab(total.entrou), 1)} kg/cab` : ''} />
        <Card titulo={`Saldo final · ${rotuloMes.toLowerCase()}`} valor={fmt(total.final.cab)} unidade="cab" sub={`${fmt(kgCabFinal(total), 1)} kg/cab`} />
        <Card titulo={`GMD · ${rotuloMes.toLowerCase()}`} valor={fmt(total.gmd, 3)} unidade="kg/dia"
          sub={rotuloAnt ? `${rotuloAnt}: ${fmt(totalAnt?.gmd, 3)}` : ''} alerta={aConferir ? `${aConferir} ${aConferir === 1 ? 'peso' : 'pesos'} a conferir` : undefined} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_368px] gap-2.5">
        {/* A TABELA DO MÊS POR CATEGORIA */}
        <div className={cn(QUADRO_REGUA, 'min-h-0')}>
          <div className="flex h-[24px] shrink-0 items-center gap-3 border-b border-border px-2 text-[10px]">
            <span className="font-semibold">Rebanho por categoria</span>
            <span className="truncate text-muted-foreground">{rotuloMes.toLowerCase()} · cabeças e kg/cab de cada movimento · as 9 categorias</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto" data-testid="evolucao-mes-tabela">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 84 }} />
                <col style={{ width: 44 }} /><col style={{ width: 40 }} />
                {tiposVis.map((t) => [<col key={`${t.tipo}c`} style={{ width: 36 }} />, <col key={`${t.tipo}k`} style={{ width: 40 }} />])}
                <col style={{ width: 36 }} /><col style={{ width: 40 }} /><col style={{ width: 36 }} /><col style={{ width: 40 }} />
                <col style={{ width: 46 }} /><col style={{ width: 40 }} />
                <col style={{ width: 54 }} /><col style={{ width: 46 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-primary">
                <tr>
                  {/* com muitos tipos a tabela passa da largura (1126): a Categoria fica presa à esquerda e só os números rolam — número nunca corta */}
                  <th className={cn(TH_REGUA, 'sticky left-0 z-20 bg-primary pl-2 text-left')} rowSpan={2}>Categoria</th>
                  <th className={cn(TH_REGUA, 'text-center')} colSpan={2}>Início</th>
                  {tiposVis.map((t) => (
                    <th key={t.tipo} className={cn(TH_REGUA, 'text-center', t.lado === 'entrada' ? 'bg-[#1f6b3a]' : 'bg-[#7f1d1d]')} colSpan={2}>{t.rotulo}</th>
                  ))}
                  <th className={cn(TH_REGUA, 'bg-[#3b2f73] text-center')} colSpan={2}>Entrou</th>
                  <th className={cn(TH_REGUA, 'bg-[#3b2f73] text-center')} colSpan={2}>Saiu</th>
                  <th className={cn(TH_REGUA, 'text-center')} colSpan={2}>Final</th>
                  <th className={cn(TH_REGUA, 'text-center')} colSpan={2}>Produção</th>
                </tr>
                <tr>
                  {['Cab', 'kg'].map((x) => <th key={`i${x}`} className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>{x}</th>)}
                  {tiposVis.flatMap((t) => ['Cab', 'kg'].map((x) => <th key={`${t.tipo}${x}`} className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>{x}</th>))}
                  {['Cab', 'kg', 'Cab', 'kg', 'Cab', 'kg'].map((x, i) => <th key={`e${i}`} className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>{x}</th>)}
                  <th className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>kg</th>
                  <th className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>GMD</th>
                </tr>
              </thead>
              <tbody>
                {m.linhas.map((l) => {
                  const zebra = ZEBRA[m.linhas.filter((x) => x.nivel === 'categoria').indexOf(l) % 2] ?? 'bg-card';
                  const ref = m.referencia.get(l.id) ?? null;
                  const abrir = (tipo: FluxoTipo | 'reclassificacao') => () => onAbrirLancamentos?.({ ano, mes, tipo, categoria: l.nivel === 'categoria' ? l.id : null, cenario });
                  return (
                    <tr key={l.id} data-linha={l.id} className={cn(l.nivel === 'subtotal' ? 'bg-[#e8eef6] font-bold' : l.nivel === 'total' ? 'bg-[#d5dfec] font-bold' : zebra)}>
                      <td className={cn(TD_REGUA, 'sticky left-0 z-[1] pl-2', l.nivel === 'subtotal' ? 'bg-[#e8eef6]' : l.nivel === 'total' ? 'bg-[#d5dfec]' : zebra)}>
                        <span className="block truncate" data-reticencias-com-title="" title={l.rotulo}>{l.rotulo}</span></td>
                      {celCab(l, l.inicio.cab)}
                      {celKg(l, l.temDado ? kgPorCab(l.inicio) : null, null)}
                      {tiposVis.map((t) => [
                        <Frag key={`${t.tipo}c`}>{celCab(l, l.tipos[t.tipo].cab, abrir(t.tipo))}</Frag>,
                        <Frag key={`${t.tipo}k`}>{celKg(l, kgPorCab(l.tipos[t.tipo]), ref)}</Frag>,
                      ])}
                      {celCab(l, l.entrou.cab, abrir('reclassificacao'))}
                      {celKg(l, kgPorCab(l.entrou), ref)}
                      {celCab(l, l.saiu.cab, abrir('reclassificacao'))}
                      {celKg(l, kgPorCab(l.saiu), null)}
                      <td className={cn(TD_REGUA, 'text-right font-bold tabular-nums whitespace-nowrap')}>{l.temDado ? vazio(l.final.cab) : ''}</td>
                      {celKg(l, d.fechado ? kgCabFinal(l) : null, null)}
                      <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap')}>{d.fechado && l.temDado ? vazio(l.producaoKg) : ''}</td>
                      <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', l.gmd != null && l.gmd < 0 && 'text-[#c0262d]')}>{d.fechado && l.temDado ? vazio(l.gmd, 3) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* CONFERE e os tipos escondidos */}
            <div className="sticky left-0 border-t border-border bg-[#f6f4fc] px-2 py-1 text-[10px] tabular-nums" data-testid="evolucao-mes-confere">
              Confere: {fmt(m.confere.inicio)} + {fmt(m.confere.entradas)} − {fmt(m.confere.saidas)} + {fmt(m.confere.entrou)} − {fmt(m.confere.saiu)} = {fmt(m.confere.calculado)}{' '}
              {m.confere.bate ? <span className="font-semibold text-[#15803d]">✓</span>
                : <span className="font-semibold text-[#c0262d]">≠ {fmt(m.confere.final)} no saldo final (diferença {fmt(m.confere.final - m.confere.calculado)})</span>}
              {m.tiposEscondidos.length > 0 && (
                <span className="text-muted-foreground"> · sem movimento em {rotuloMes.toLowerCase()} (colunas escondidas): {m.tiposEscondidos.map((t) => ROTULO_TIPO[t].toLowerCase()).join(', ')}</span>
              )}
            </div>
            <div className="sticky left-0 px-2 py-1 text-[10px] text-muted-foreground">
              <span className="mr-1 rounded-full bg-[#fff4e0] px-1.5 text-[9.5px] font-semibold text-[#a15c00]">pesos</span>
              kg de cada movimento = o peso lançado; a cor compara com o kg/cab final da categoria no Fechamento:{' '}
              <span className={cn('rounded px-1', TOM.ambar)}>âmbar ≥ 15%</span> · <span className={cn('rounded px-1', TOM.vermelho)}>vermelho ≥ 25%</span>
              {!d.fechado && <span> · {rotuloMes.toLowerCase()} ainda sem Fechamento: sem kg final, produção e GMD.</span>}
            </div>
          </div>
        </div>

        {/* O PAINEL DA DIREITA — Conferir pesos | Composição */}
        <div className={cn(QUADRO_REGUA, 'min-h-0')}>
          <div className="flex h-[26px] shrink-0 border-b border-border text-[10px]">
            {(['composicao', 'pesos'] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAba(a)} className={cn('px-2.5', aba === a ? 'font-bold shadow-[inset_0_-2px_0_hsl(var(--primary))]' : 'text-muted-foreground')}>
                {/* a largura é a do NEGRITO nas duas abas (cópia invisível embaixo): marcar uma não desloca a outra (gate desloca 31/10) */}
                <span className="inline-grid">
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-bold">{a === 'pesos' ? `Conferir pesos · ${pesos.length}` : 'Composição'}</span>
                  <span className="col-start-1 row-start-1">{a === 'pesos' ? `Conferir pesos · ${pesos.length}` : 'Composição'}</span>
                </span>
              </button>
            ))}
          </div>
          {aba === 'pesos' ? (
            <div className="min-h-0 flex-1 overflow-auto" data-testid="evolucao-mes-pesos">
              {d.erroLancamentos && <p className="px-2 py-2 text-[10px] text-destructive">{d.erroLancamentos}</p>}
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} data-dia-mes="">
                {/* fix1 (item 4, medido no gate de 31/10): data dd/mm SEM o ano (o mês está na barra; exceção declarada `data-dia-mes`) 38 · Tipo curto 50 ·
                    cab "1.234" 36 · kg e ref "5.000,0" a 8,5px 38 · dif "+999%" 42 · ✎ 18; a Categoria (curta, "Mam. M → Desm. M" pede 94px) fica com o
                    resto — por isso o painel passou de 352 para 368px. Nada termina em "…" (gate `inteiroDe`). */}
                <colgroup><col style={{ width: 38 }} /><col style={{ width: 50 }} /><col /><col style={{ width: 36 }} /><col style={{ width: 38 }} /><col style={{ width: 38 }} /><col style={{ width: 42 }} /><col style={{ width: 18 }} /></colgroup>
                <thead className="sticky top-0 z-10 bg-primary">
                  <tr>{['Data', 'Tipo', 'Categoria', 'Cab', 'Kg', 'Ref.', 'Dif.', ''].map((h, i) => <th key={i} className={cn(TH_REGUA, i < 3 ? 'text-left' : 'text-right', i === 0 && 'pl-2')}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {pesos.map((p) => {
                    const cat = d.categorias.find((c) => c.codigo === p.categoria)?.nome ?? p.categoria;
                    const dest = p.categoria_destino ? d.categorias.find((c) => c.codigo === p.categoria_destino)?.nome ?? p.categoria_destino : null;
                    const rotuloCat = dest ? `${cat} → ${dest}` : cat;
                    const catCurta = p.categoria_destino ? `${categoriaCurta(p.categoria)} → ${categoriaCurta(p.categoria_destino)}` : categoriaCurta(p.categoria);
                    return (
                      <tr key={p.id} data-peso={p.id}>
                        <td className={cn(TD_REGUA, 'pl-2 tabular-nums whitespace-nowrap text-muted-foreground')} title={format(parseISO(p.data), 'dd/MM/yyyy')}>{format(parseISO(p.data), 'dd/MM')}</td>
                        <td className={TD_REGUA}><span className="block truncate" data-inteiro="" title={ROTULO_TIPO[p.tipo] ?? p.tipo}>{tipoCurto(p.tipo)}</span></td>
                        <td className={TD_REGUA}><span className="block truncate" data-inteiro="" title={rotuloCat}>{catCurta}</span></td>
                        <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap')}>{fmt(p.quantidade)}</td>
                        <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', KG_SECUNDARIO, p.tom && TOM[p.tom])}>{vazio(p.peso_medio_kg, 1)}</td>
                        <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', KG_SECUNDARIO)}>{vazio(p.referencia, 1)}</td>
                        <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', p.desvio != null && (p.desvio < 0 ? 'text-[#c0262d]' : 'text-[#1d4ed8]'))}
                          title={p.desvio == null ? undefined : `${p.desvio > 0 ? '+' : ''}${fmt(p.desvio * 100, 0)}% sobre ${fmt(p.referencia, 1)} kg/cab`}>
                          {textoDoDesvio(p.desvio)}
                        </td>
                        <td className={cn(TD_REGUA, 'text-center')}>
                          <button type="button" title="Abrir o lançamento para corrigir" aria-label="Abrir o lançamento" onClick={() => onEditarLancamento?.(p.id)}>✎</button>
                        </td>
                      </tr>
                    );
                  })}
                  {pesos.length === 0 && <tr><td colSpan={8} className={cn(TD_REGUA, 'pl-2 text-muted-foreground')}>Nenhum lançamento com peso em {rotuloMes.toLowerCase()}.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <Composicao linhas={m.linhas.filter((l) => l.nivel === 'categoria')} total={total.final.cab} />
          )}
        </div>
      </div>
    </div>
  );
}

/** a diferença em %: de 1.000% para cima a célula diz ">999%" (o valor inteiro no `title`) — a coluna é medida para "+999%" */
export const textoDoDesvio = (d: number | null): string => {
  if (d == null) return '';
  if (d >= 9.995) return '>999%';
  return `${d > 0 ? '+' : ''}${fmt(d * 100, 0)}%`;
};

function Frag({ children }: { children: React.ReactNode }) { return <>{children}</>; }

function Card({ titulo, valor, unidade, sub, alerta, dica }: { titulo: string; valor: string; unidade: string; sub: string; alerta?: string; dica?: string }) {
  return (
    <div className="grid min-w-0 grid-rows-[12px_18px_12px] overflow-hidden rounded-md border border-border bg-card px-2 py-0.5">
      <span className="truncate text-[9.5px] text-muted-foreground" title={titulo}>{titulo}</span>
      <span className="whitespace-nowrap tabular-nums"><span className="text-[14px] font-bold leading-[18px]">{valor}</span> <span className="text-[9.5px] font-semibold text-muted-foreground">{unidade}</span></span>
      {/* fix1 (item 1): a linha do kg/cab do card é secundária (menor e mais clara); o alerta segue no tamanho dele */}
      {alerta
        ? <span className="truncate text-[9.5px] font-semibold text-[#c0262d]" title={`${sub} · ${alerta}`}>{alerta}</span>
        : <span className={cn('truncate', KG_SECUNDARIO)} title={dica ?? sub}>{sub}</span>}
    </div>
  );
}

/** Composição do rebanho no fim do mês: donut em cima, tabela embaixo (cabeças, % e kg/cab final). */
const CORES = ['#1d3a5d', '#2f5d8a', '#4f86b8', '#7fb0d8', '#b3d4ee', '#7c2d12', '#b45309', '#d97706', '#fbbf24'];
function Composicao({ linhas, total }: { linhas: LinhaDoMes[]; total: number }) {
  let acc = 0;
  const R = 46; const C = 2 * Math.PI * R;
  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 py-2" data-testid="evolucao-mes-composicao">
      <svg viewBox="0 0 120 120" className="mx-auto block h-[120px] w-[120px]" role="img" aria-label="composição do rebanho">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#eef0f3" strokeWidth="18" />
        {total > 0 && linhas.map((l, i) => {
          const f = l.final.cab / total; const seg = (
            <circle key={l.id} cx="60" cy="60" r={R} fill="none" stroke={CORES[i % CORES.length]} strokeWidth="18"
              strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-acc * C} transform="rotate(-90 60 60)" />
          ); acc += f; return seg;
        })}
        <text x="60" y="58" textAnchor="middle" className="fill-current text-[13px] font-bold">{fmt(total)}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-current text-[9.5px] opacity-60">cabeças</text>
      </svg>
      <table className="mt-2 w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup><col /><col style={{ width: 46 }} /><col style={{ width: 44 }} /><col style={{ width: 48 }} /></colgroup>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id}>
              <td className={TD_REGUA}><span className="flex min-w-0 items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CORES[i % CORES.length] }} />
                <span className="truncate" data-reticencias-com-title="" title={l.rotulo}>{l.rotulo}</span></span></td>
              <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap')}>{l.temDado ? vazio(l.final.cab) : ''}</td>
              <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap text-muted-foreground')}>{total > 0 && l.temDado && l.final.cab ? `${fmt((l.final.cab / total) * 100, 1)}%` : ''}</td>
              <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', KG_SECUNDARIO)}>{vazio(kgCabFinal(l), 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
