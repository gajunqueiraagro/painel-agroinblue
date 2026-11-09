import { useFaixaDoFechamento } from '@/hooks/useFaixaDoFechamento';
import { MasterLockBanner } from '@/components/MasterLockBanner';
import { FaixaDoFechamento } from '@/components/fechamento/FaixaDoFechamento';
import type { EtapaDoFechamento } from '@/lib/fechamento/faixaDoFechamento';
import { porcentagensDoMapa, porcentagensDoMapaEstreito, LIMITE_ESTREITO } from '@/lib/mapa/larguraDoMapa';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePeriodoDaTela, type PeriodoControlado } from '@/hooks/usePeriodoDaTela';
import { usePastos, type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { useFechamento, type FechamentoPasto } from '@/hooks/useFechamento';
import { pastosDoFechamentoNoMes, useLoteDoMes } from '@/hooks/useLoteDoMes';
import { useModalDoPasto } from '@/hooks/useModalDoPasto';
import { useFazenda } from '@/contexts/FazendaContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, ArrowLeft } from 'lucide-react';
import { MESES_COLS } from '@/lib/calculos/labels';
import { exportMapaPastosXlsx } from '@/lib/exportMapaPastos';
import { exportMapaPastosPdf } from '@/lib/exportMapaPastosPdf';
import { calcUA, calcUAHa, calcPesoMedioPonderado } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { tipoUsoLabel } from '@/lib/calculos/labels';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated, MAX_ROWS } from '@/lib/supabase/fetchAllPaginated';
import { toast } from 'sonner';
import { isOperacionalPecuaria, grupoDoTipoUso, corDoTipoUso, tintDoTipoUso } from '@/lib/pastos/tiposUso';
import { useCliente } from '@/contexts/ClienteContext';
import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { companheirosDoLote, uaHaDoMes } from '@/lib/fechamento/lotacaoDoLote';
import { useCadastrosDoLote } from '@/hooks/useCadastrosDoLote';
import { mapaDoCadastro } from '@/lib/lotes/lista';
import { lotesDoPasto, programaDoPasto } from '@/lib/mapa/programaDoPasto';
import { isPastoDivergencia, DIV_CURTA } from '@/lib/classificacaoArea';
import { categoriasDasLinhas, subLinhasPorPiquete, type ItemDoMapa } from '@/lib/mapa/linhasDoMapa';

export interface PastoMapaRow {
  pasto: Pasto;
  fechamentoId: string | null;
  lote: string | null;
  /** MAPA-REBANHO-02 — os lotes do pasto no mês (os `lote_id` dos itens com cabeça) e o programa deles (fonte única; null = "—") */
  loteIds: string[];
  programa: string | null;
  tipoUso: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null; peso_atualizado: boolean }>;
  totalCabecas: number;
  pesoMedio: number | null;
  uaTotal: number;
  uaHa: number | null;
  pesoAtualizado: boolean;
  /** MAPA-REBANHO-R2 — a sub-linha do piquete (card lançado por piquetes): o PAI dela; nulo = a linha é o pasto (só estas entram nos totais) */
  piqueteDe: Pasto | null;
  /** L3 — os pastos com quem este divide o lote no mês (rotação "Também esteve em"); vazio = o lote é só dele */
  comPastos?: string[];
}

export interface MapaTotais {
  catTotals: Map<string, { quantidade: number; pesoTotal: number; qtdComPeso: number }>;
  totalCab: number;
  areaTotal: number;
  pesoMedioGeral: number | null;
  uaTotal: number;
  uaHaGeral: number | null;
  qualidadeMedia: number | null;
}

export interface AtividadeResumo {
  tipo: string;
  area: number;
  cabecas: number;
  pesoMedio: number | null;
  uaHa: number | null;
  qtdPastos: number;
}

const CAT_SIGLAS: Record<string, string> = {
  mamotes_m: 'MM', desmama_m: 'DM', garrotes: 'G', bois: 'B', touros: 'T',
  mamotes_f: 'MF', desmama_f: 'DF', novilhas: 'N', vacas: 'V',
};

// PR-UI-PASTO-CORES-01 — getAtividadeBadgeClasses/getRowTintBg saíram daqui para
// tiposUso.ts (corDoTipoUso/tintDoTipoUso), que já é o dono do vocabulário visual.
// Eram locais e não exportadas: uma segunda tela teria de copiar o switch, e cor nova
// entraria numa cópia só. Aparência inalterada — só mudou de onde vem.

interface MapaPastosTabProps extends PeriodoControlado {
  onBack?: () => void;
  /** FECH-FAIXA-01 — as etapas da faixa do fechamento que abrem as outras telas do mês (sem a função, só texto) */
  etapasDoFechamento?: Partial<Record<EtapaDoFechamento, () => void>>;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

export function MapaPastosTab({ onBack, filtroAnoInicial, filtroMesInicial, periodo, onPeriodoChange, etapasDoFechamento }: MapaPastosTabProps = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const {
    fechamentos, loadFechamentos, loadItens, setPesoAtualizadoPasto,
    criarFechamento, fecharPasto, copiarMesAnterior,
  } = useFechamento();

  const curYear = new Date().getFullYear();
  const [anosDisp, setAnosDisp] = useState<string[]>(() => {
    const set = new Set<string>();
    for (let y = curYear; y >= curYear - 3; y--) set.add(String(y));
    return Array.from(set).sort().reverse();
  });

  useEffect(() => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await fetchAllPaginated<{ id: string; ano_mes: string }>({
          query: () =>
            supabase
              .from('fechamento_pastos')
              .select('id, ano_mes')
              .eq('fazenda_id', fazendaAtual.id)
              .order('id', { ascending: true }),
          getKey: (r) => r.id,
          maxRows: MAX_ROWS,
          context: 'MapaPastosTab/anos-disponiveis',
          shouldAbort: () => cancelled,
        });
        if (cancelled) return;
        const anos = new Set<string>();
        for (let y = curYear; y >= curYear - 3; y--) anos.add(String(y));
        data.forEach(r => {
          if (r.ano_mes) anos.add(r.ano_mes.substring(0, 4));
        });
        setAnosDisp(Array.from(anos).sort().reverse());
      } catch (e) {
        // Mecanismo preservado: antes, erro chegava como data=null e o efeito
        // apenas retornava, mantendo os 4 anos default do dropdown. O helper
        // lanca, entao o catch reproduz esse silencio — sem toast novo.
        console.error('[MapaPastosTab] anos disponiveis:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [fazendaAtual?.id, curYear]);

  /* FECH-MES-SELECIONADO-01 — com `periodo` (o ano/mês do shell) a tela não guarda mês próprio; sem ele, o de sempre. */
  const anoInicial = filtroAnoInicial || String(curYear);
  const mesDefault = filtroMesInicial || (Number(anoInicial) === curYear ? curYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 : 12);
  const { ano: anoFiltro, setAno: setAnoFiltro, mes: mesFiltro, setMes: setMesFiltro } =
    usePeriodoDaTela({ periodo, onPeriodoChange }, { ano: anoInicial, mes: mesDefault });

  useEffect(() => {
    if (filtroAnoInicial !== undefined) setAnoFiltro(filtroAnoInicial);
  }, [filtroAnoInicial]);
  useEffect(() => {
    if (filtroMesInicial !== undefined) setMesFiltro(filtroMesInicial);
  }, [filtroMesInicial]);
  const anoMes = `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`;
  /* FECH-FAIXA-01 — a faixa do fechamento do mês (as mesmas leituras nas três telas) */
  const faixaDoMes = useFaixaDoFechamento(anoMes);

  const [rows, setRows] = useState<PastoMapaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const tableModuleRef = useRef<HTMLDivElement | null>(null);

  const updateLayoutBounds = useCallback(() => {
    const node = tableModuleRef.current;
    if (!node) return;

    const topOffset = Math.max(node.getBoundingClientRect().top, 0);
    node.style.setProperty('--mapa-pastos-top-offset', `${topOffset}px`);
  }, []);

  useEffect(() => { loadFechamentos(anoMes); }, [anoMes, loadFechamentos]);

  useEffect(() => {
    updateLayoutBounds();
    const rafId = window.requestAnimationFrame(updateLayoutBounds);
    window.addEventListener('resize', updateLayoutBounds);
    window.visualViewport?.addEventListener('resize', updateLayoutBounds);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateLayoutBounds);
      window.visualViewport?.removeEventListener('resize', updateLayoutBounds);
    };
  }, [updateLayoutBounds]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(updateLayoutBounds);
    return () => window.cancelAnimationFrame(rafId);
  }, [updateLayoutBounds, loading, rows.length, anoFiltro, mesFiltro]);

  useEffect(() => {
    const build = async () => {
      /* MAPA-REBANHO-R2 — o PASTO é a linha: os pastos do mês pela MESMA regra dos cards do Fechamento (piquete fora; antes o filtro
         daqui era próprio e listava cada piquete como pasto, na ordem do nome: 7A antes do P7) */
      const pastosAtivos = pastosDoFechamentoNoMes(pastos, anoMes);
      if (pastosAtivos.length === 0) { setRows([]); return; }
      setLoading(true);

      const fechMap = new Map(fechamentos.map(f => [f.pasto_id, f]));
      const allItems = await Promise.all(fechamentos.map(f => loadItens(f.id)));
      const itemsByFechId = new Map(fechamentos.map((f, i) => [f.id, allItems[i]]));
      const pastoPorId = new Map(pastos.map(p => [p.id, p]));

      const linhaDe = (pasto: Pasto, fech: FechamentoPasto | undefined, items: readonly ItemDoMapa[], piqueteDe: Pasto | null, lote: string | null, loteIds: string[]): PastoMapaRow => {
        /* o pasto SOMA todas as linhas do card (por piquetes há uma linha por piquete em cada categoria) */
        const catMap = categoriasDasLinhas(items);
        const tipoUso = fech?.tipo_uso_mes ?? null;
        const qualidade = piqueteDe ? null : fech?.qualidade_mes ?? null;

        const totalCab = Array.from(catMap.values()).reduce((s, v) => s + v.quantidade, 0);

        const pesoMedio = calcPesoMedioPonderado(
          Array.from(catMap.values()).map(v => ({ quantidade: v.quantidade, pesoKg: v.peso_medio_kg }))
        );

        let uaTotal = 0;
        catMap.forEach(v => { uaTotal += calcUA(v.quantidade, v.peso_medio_kg); });
        const uaHa = calcUAHa(uaTotal, pasto.area_produtiva_ha);

        const itensComQtd = Array.from(catMap.values()).filter(v => v.quantidade > 0);
        const pesoAtualizado = itensComQtd.length > 0 && itensComQtd.every(v => v.peso_atualizado);

        return { pasto, fechamentoId: fech?.id ?? null, lote, loteIds, programa: null, tipoUso, qualidade, categorias: catMap, totalCabecas: totalCab, pesoMedio, uaTotal, uaHa, pesoAtualizado, piqueteDe };
      };

      const result: PastoMapaRow[] = pastosAtivos.flatMap(pasto => {
        const fech = fechMap.get(pasto.id);
        const items = fech ? itemsByFechId.get(fech.id) || [] : [];
        const doPasto = linhaDe(pasto, fech, items, null, fech?.lote_mes ?? null, lotesDoPasto(items));
        /* lançado por piquetes: cada piquete numa sub-linha recuada logo abaixo do pai (a área é a do piquete; o lote, o das linhas dele) */
        const subs = subLinhasPorPiquete(items, id => pastoPorId.get(id)?.nome ?? null).map(s => {
          const piquete = pastoPorId.get(s.piqueteId);
          const base: Pasto = piquete ?? { ...pasto, id: `${pasto.id}:${s.piqueteId || 'sem-piquete'}`, nome: s.nome, area_produtiva_ha: null };
          const textos = [...new Set(s.itens.filter(i => i.quantidade > 0).map(i => i.lote).filter((t): t is string => !!t))];
          return linhaDe(base, fech, s.itens, pasto, textos.length === 1 ? textos[0] : null, lotesDoPasto(s.itens));
        });
        return [doPasto, ...subs];
      });

      setRows(result);
      setLoading(false);
    };
    build();
  }, [fechamentos, pastos, loadItens]);

  /* MAPA-REBANHO-R2 — os totais e o resumo contam só os PASTOS (a sub-linha do piquete já está dentro do pai) */
  const pastosDasLinhas = useMemo(() => rows.filter(r => !r.piqueteDe), [rows]);

  const totais: MapaTotais = useMemo(() => {
    const catTotals = new Map<string, { quantidade: number; pesoTotal: number; qtdComPeso: number }>();
    categorias.forEach(c => catTotals.set(c.id, { quantidade: 0, pesoTotal: 0, qtdComPeso: 0 }));

    pastosDasLinhas.forEach(row => {
      row.categorias.forEach((val, catId) => {
        const t = catTotals.get(catId);
        if (t) {
          t.quantidade += val.quantidade;
          if (val.peso_medio_kg && val.quantidade > 0) {
            t.pesoTotal += val.peso_medio_kg * val.quantidade;
            t.qtdComPeso += val.quantidade;
          }
        }
      });
    });

    const totalCab = pastosDasLinhas.reduce((s, r) => s + r.totalCabecas, 0);
    // areaTotal pecuária-only: exclui agricultura/ambiental/infra. Corrige uaHaGeral automaticamente.
    const areaTotal = pastosDasLinhas
      .filter(r => isOperacionalPecuaria(r.tipoUso))
      .reduce((s, r) => s + (r.pasto.area_produtiva_ha || 0), 0);

    const pesoMedioGeral = calcPesoMedioPonderado(
      pastosDasLinhas.filter(r => r.totalCabecas > 0).map(r => ({ quantidade: r.totalCabecas, pesoKg: r.pesoMedio }))
    );

    const uaTotal = pastosDasLinhas.reduce((s, r) => s + r.uaTotal, 0);
    const uaHaGeral = calcUAHa(uaTotal, areaTotal);

    const comQualidade = pastosDasLinhas.filter(r => isOperacionalPecuaria(r.tipoUso) && r.qualidade !== null && r.qualidade > 0);
    const qualidadeMedia = comQualidade.length > 0
      ? comQualidade.reduce((s, r) => s + (r.qualidade || 0), 0) / comQualidade.length
      : null;

    return { catTotals, totalCab, areaTotal, pesoMedioGeral, uaTotal, uaHaGeral, qualidadeMedia };
  }, [pastosDasLinhas, categorias]);

  const resumoAtividades: AtividadeResumo[] = useMemo(() => {
    const map = new Map<string, { area: number; cabecas: number; pesoTotal: number; qtdComPeso: number; uaTotal: number; qtdPastos: number }>();
    pastosDasLinhas.forEach(row => {
      const tipo = row.tipoUso || 'não definido';
      const entry = map.get(tipo) || { area: 0, cabecas: 0, pesoTotal: 0, qtdComPeso: 0, uaTotal: 0, qtdPastos: 0 };
      entry.area += row.pasto.area_produtiva_ha || 0;
      entry.cabecas += row.totalCabecas;
      if (row.pesoMedio && row.totalCabecas > 0) {
        entry.pesoTotal += row.pesoMedio * row.totalCabecas;
        entry.qtdComPeso += row.totalCabecas;
      }
      entry.uaTotal += row.uaTotal;
      entry.qtdPastos += 1;
      map.set(tipo, entry);
    });

    return Array.from(map.entries()).map(([tipo, d]) => ({
      tipo,
      area: d.area,
      cabecas: d.cabecas,
      pesoMedio: d.qtdComPeso > 0 ? d.pesoTotal / d.qtdComPeso : null,
      uaHa: calcUAHa(d.uaTotal, d.area),
      qtdPastos: d.qtdPastos,
    })).sort((a, b) => b.cabecas - a.cabecas);
  }, [pastosDasLinhas]);

  const handleTogglePesoAtualizado = useCallback(async (row: PastoMapaRow, value: boolean) => {
    if (!row.fechamentoId) return;
    const fechamentoId = row.fechamentoId;
    const prev = row.pesoAtualizado;
    // Otimista: alterna pesoAtualizado da linha e propaga para cada categoria do catMap.
    setRows(curr => curr.map(r => {
      if (r.fechamentoId !== fechamentoId) return r;
      const novoCat = new Map(r.categorias);
      novoCat.forEach((v, k) => novoCat.set(k, { ...v, peso_atualizado: value }));
      return { ...r, pesoAtualizado: value, categorias: novoCat };
    }));
    const { ok, error } = await setPesoAtualizadoPasto(fechamentoId, value);
    if (!ok) {
      // Reverte e mostra a mensagem do banco (guard de P2 vem como RAISE).
      setRows(curr => curr.map(r => {
        if (r.fechamentoId !== fechamentoId) return r;
        const novoCat = new Map(r.categorias);
        novoCat.forEach((v, k) => novoCat.set(k, { ...v, peso_atualizado: prev }));
        return { ...r, pesoAtualizado: prev, categorias: novoCat };
      }));
      toast.error(error?.message || 'Erro ao atualizar marca de peso');
    }
  }, [setPesoAtualizadoPasto]);

  /* MAPA-LOTES-01 fatia 1 — o MESMO modal do Fechamento pelo gancho único: com o grupo de pastejo do mês (`lote`) e a área do mês;
     sem card no mês, cria pelo mesmo `fn_obter_ou_criar_fechamento_pasto` do Fechamento. O fechar relê o mês (sem F5). */
  const fazendaDoMes = fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;
  const pastosDoMes = useMemo(() => pastosDoFechamentoNoMes(pastos, anoMes), [pastos, anoMes]);
  const loteDoMes = useLoteDoMes(fazendaDoMes, anoMes, pastosDoMes, fechamentos);
  const modalDoPasto = useModalDoPasto({
    anoMes, fechamentos, categorias, lote: loteDoMes,
    acoes: { criarFechamento, fecharPasto, copiarMesAnterior },
    aoFechar: () => { loadFechamentos(anoMes); },
    rotuloDaFazenda: (id) => (fazendaAtual?.id === id ? fazendaAtual.codigo ?? '' : ''),
  });
  const abrirPasto = modalDoPasto.abrir;

  /* MAPA-REBANHO-02 — a coluna "Programa": o programa do lote pela fonte única (os lotes do mês pela `fn_lotes_da_fazenda` e o nome pelo
     cadastro do lote), nunca digitado aqui; as linhas da tela, do Excel e do PDF são as MESMAS (`linhas`) */
  const { clienteAtual } = useCliente();
  const { lotes: lotesDoMes } = useLotesDaFazenda(fazendaDoMes, anoMes);
  const { cadastros: cadastrosDoLote } = useCadastrosDoLote(clienteAtual?.id ?? null);
  /* L3 (Gabriel 09/11 07:51, Monterrey set/26) — lote em 2+ pastos: a UA/ha é a do banco (UA do lote ÷ SOMA das áreas, a mesma nos pastos;
     `fn_lotacao_do_mes`), a regra do pasto com piquetes; as cabeças ficam UMA vez, no card de quem lançou. Tela, Excel e PDF. */
  const rowsDoMes = useMemo(() => {
    const pastoDoCard = new Map(fechamentos.map(f => [f.id, f.pasto_id]));
    const com = companheirosDoLote(loteDoMes.alocacoesDoMes, pastoDoCard);
    const nome = new Map(pastos.map(p => [p.id, p.nome]));
    return rows.map(r => r.piqueteDe ? r : ({ ...r, uaHa: uaHaDoMes(loteDoMes.lotacaoDoMes.get(r.pasto.id), r.uaHa),
      comPastos: (com.get(r.pasto.id) ?? []).map(id => nome.get(id) ?? '').filter(Boolean) }));
  }, [rows, fechamentos, pastos, loteDoMes.alocacoesDoMes, loteDoMes.lotacaoDoMes]);
  const linhas = useMemo(() => {
    const nomes = mapaDoCadastro(cadastrosDoLote);
    return rowsDoMes.map(r => ({ ...r, programa: programaDoPasto(r.loteIds, lotesDoMes, nomes) }));
  }, [rowsDoMes, lotesDoMes, cadastrosDoLote]);

  const getUaHaColor = (uaHa: number | null) => {
    if (!uaHa) return '';
    if (uaHa > 3) return 'text-red-600 font-bold';
    if (uaHa > 2) return 'text-yellow-600 font-semibold';
    return 'text-green-600';
  };

  const getQualidadeColor = (q: number | null) => {
    if (!q) return '';
    if (q >= 8) return 'bg-green-500/20 text-green-700';
    if (q >= 5) return 'bg-yellow-500/20 text-yellow-700';
    return 'bg-red-500/20 text-red-700';
  };

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda.</div>;

  return (
    <TooltipProvider>
      <div
        ref={tableModuleRef}
        className="flex min-h-0 flex-col overflow-x-visible overflow-y-hidden bg-background"
        style={{
          height: '100%',
          maxHeight: '100%',
        }}
      >
        <div className="sticky top-0 flex-shrink-0 bg-background border-b border-border/50 shadow-sm px-3 py-1.5 z-30">
          {/* FECH-FAIXA-01 — a faixa do fechamento: a 1ª linha, no MESMO lugar nas três telas */}
          {/* mt-0.5: o cabeçalho daqui tem 6px de folga (os outros 8) — a faixa fica no MESMO lugar (40px) nas três telas */}
          {/* VR-PRECO-EDITAR-01 ampliado — a trava do MÊS na linha da faixa */}
          <div className="mb-1.5 mt-0.5 flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><FaixaDoFechamento estado={faixaDoMes} atual="mapa" abrir={etapasDoFechamento} /></div>{fazendaDoMes && <MasterLockBanner anoMes={anoMes} naFaixa />}</div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {!filtroAnoInicial && (
              <Select value={anoFiltro} onValueChange={setAnoFiltro}>
                <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              )}
              {!filtroMesInicial && (
              <Select value={String(mesFiltro)} onValueChange={v => setMesFiltro(Number(v))}>
                <SelectTrigger className="w-20 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_COLS.map((m, i) => (
                    <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
              <Badge variant="secondary" className="text-xs h-6">{formatNum(totais.totalCab, 0)} cab</Badge>
              {totais.uaHaGeral !== null && (
                <Badge variant="outline" className="text-xs h-6">{formatNum(totais.uaHaGeral, 2)} UA/ha</Badge>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {/* Import removido em 19/08/2026: a entrada de fechamento é Rebanho → Fechamento
                  Pastos, card por card. Esta tela é espelho. lib/importMapaPastos.ts e
                  components/ImportMapaPastos.tsx ficaram ÓRFÃOS de propósito — se a decisão se
                  confirmar, saem num PR de faxina; não reconectar sem decisão explícita.
                  Excel e PDF ficam: são saída, não entrada. */}
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => exportMapaPastosXlsx(linhas, categorias, totais, resumoAtividades, anoMes, fazendaAtual?.nome || 'Fazenda')}
                disabled={rows.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1" />Excel
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                onClick={() => exportMapaPastosPdf(linhas, categorias, totais, resumoAtividades, anoMes, fazendaAtual?.nome || 'Fazenda')}
                disabled={rows.length === 0}>
                <FileText className="h-3.5 w-3.5 mr-1" />PDF
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">Carregando mapa...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">Nenhum pasto ativo para conciliação.</div>
        ) : (
          <MapaTable
            rows={linhas}
            categorias={categorias}
            totais={totais}
            getUaHaColor={getUaHaColor}
            getQualidadeColor={getQualidadeColor}
            onTogglePesoAtualizado={handleTogglePesoAtualizado}
            onAbrirPasto={abrirPasto}
          />
        )}
      </div>

      {modalDoPasto.modal}

    </TooltipProvider>
  );
}

const MACHOS_CODES = new Set(['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros']);
const FEMEAS_CODES = new Set(['mamotes_f', 'desmama_f', 'novilhas', 'vacas']);

/* MAPA-REBANHO-02 opção B — a fonte da tabela abaixo de 1000px: toda célula 8,5px (com os textos a 9px faltavam 5px a 135%); quem está
   dentro da célula herda */
const FONTE_ESTREITA = '[&_td]:!text-[8.5px] [&_th]:!text-[8.5px] [&_td_*]:![font-size:inherit] [&_th_*]:![font-size:inherit] '
  /* e a folga das 4 colunas de texto (e do selo da atividade) cai para 2px: os números já estão sem folga */
  + '[&_td[data-texto]]:!px-[2px] [&_td[data-texto]_span]:!px-[2px]';

function isMacho(cat: CategoriaRebanho) { return MACHOS_CODES.has(cat.codigo); }
function isFemea(cat: CategoriaRebanho) { return FEMEAS_CODES.has(cat.codigo); }

// Block separator: stronger border between Programa|MM (MAPA-REBANHO-02; era Lote|MM), T|MF, V|Total, Total|Peso
function isBlockSeparator(catIdx: number, categorias: CategoriaRebanho[]) {
  if (catIdx === 0) return true; // Programa → first cat
  const prev = categorias[catIdx - 1];
  const cur = categorias[catIdx];
  if (!prev || !cur) return false;
  // T→MF boundary
  if (isMacho(prev) && isFemea(cur)) return true;
  return false;
}

function MapaTable({ rows, categorias, totais, getUaHaColor, getQualidadeColor, onTogglePesoAtualizado, onAbrirPasto }: {
  rows: PastoMapaRow[];
  categorias: CategoriaRebanho[];
  totais: MapaTotais;
  getUaHaColor: (v: number | null) => string;
  getQualidadeColor: (v: number | null) => string;
  onTogglePesoAtualizado: (row: PastoMapaRow, value: boolean) => void;
  /** clicar no NOME abre o modal do pasto (a linha inteira nao e' clicavel) */
  onAbrirPasto: (pasto: Pasto) => void;
}) {
  /* MAPA-REBANHO-02 (Gabriel 08/11 08:43, mock docs/mocks/mapa-rebanho-lote.html) — a tabela ocupa a LARGURA TODA da área (como antes),
     com as colunas em PORCENTAGEM, na proporção do que o conteúdo pede (medido no caso real 3M e PUR out/26, em px: Pasto 89 · Atividade
     73 · Lote 124 · Programa 84 · categoria ≤35 · Total 37 · Peso 39 · ✓ Peso 41 · Área 34 · UA/ha 33 · Qual 27 = 888 px):
       · a 1.240 (área 1.096 px) nada corta;
       · a 1.024 (880 px) os números cabem (categoria 36 px) e os textos mais compridos (Pasto, Lote, Programa) cortam com "…" e o title;
       · a 135% (775 px) faltam 113 px: a decisão está com o Gabriel (rolagem lateral, fonte menor ou abreviar).
     As categorias dividem o que sobra. Antes (07/11) eram px somando 760, centrados: estreita, e Lote e Programa cortavam. */
  /* as porcentagens moram em `larguraDoMapa` (a MESMA fonte do PDF) */
  /* opção B (Gabriel 08/11 10:00): abaixo de 1000px de janela, a fonte menor e as colunas medidas nela */
  const estreito = useLarguraDaJanela() < LIMITE_ESTREITO;
  const colWidths = useMemo(() => (estreito ? porcentagensDoMapaEstreito : porcentagensDoMapa)(categorias.length).map(p => `${p}%`), [categorias, estreito]);

  // Determine last macho and last femea index for V|Total separator
  const lastFemeaIdx = useMemo(() => {
    for (let i = categorias.length - 1; i >= 0; i--) {
      if (isFemea(categorias[i])) return i;
    }
    return -1;
  }, [categorias]);

  // Header/footer backgrounds per group
  const hdrBg = 'hsl(220 14% 82%)'; // darker grey for header
  const hdrBgMacho = 'hsl(213 35% 86%)'; // subtle blue-grey
  const hdrBgFemea = 'hsl(340 25% 88%)'; // subtle rosé
  const ftBg = 'hsl(220 14% 85%)';
  const ftBgMacho = 'hsl(213 35% 88%)';
  const ftBgFemea = 'hsl(340 25% 90%)';

  // Text colors for body values
  const txtMacho = 'hsl(213 55% 30%)'; // dark blue
  const txtFemea = 'hsl(340 40% 35%)'; // dark rosé/wine

  // Block separator border style
  const blockBorder = '2px solid hsl(220 13% 75%)';
  const normalBorder = '1px solid hsl(var(--border) / 0.4)';

  const getCatBorderLeft = (catIdx: number) => {
    if (isBlockSeparator(catIdx, categorias)) return blockBorder;
    return undefined;
  };

  // Total column gets block separator on left (after last femea)
  const totalLeftBorder = blockBorder;
  // Peso column gets block separator on left (after Total)
  const pesoLeftBorder = blockBorder;

  const renderColGroup = () => (
    <colgroup>
      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
    </colgroup>
  );

  // Compute peso médio per category from totais (for the new "Peso Kg" row)
  const pesosPorCategoria = useMemo(() => {
    const map = new Map<string, number | null>();
    categorias.forEach(cat => {
      const t = totais.catTotals.get(cat.id);
      if (t && t.qtdComPeso > 0) {
        map.set(cat.id, t.pesoTotal / t.qtdComPeso);
      } else {
        map.set(cat.id, null);
      }
    });
    return map;
  }, [categorias, totais]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden border-t border-border/30 bg-background">
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        <div className="flex h-full min-h-0 w-full flex-col">
          {/* ── TABLE (THEAD sticky + TBODY + TFOOT) ── */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-3">
            {/* opção B — estreito: a tabela a 8,5px (o que está DENTRO da célula herda) e as colunas de texto (`data-texto`) com folga de 2px */}
            <table className={`w-full border-separate border-spacing-0 text-[11px] ${estreito ? FONTE_ESTREITA : ''}`} style={{ tableLayout: 'fixed' }}
              data-estreito={estreito ? '' : undefined}>
              {renderColGroup()}
              <thead>
                <tr className="h-7">
                  <th className="sticky left-0 top-0 z-50 px-1.5 py-0.5 text-left text-[11px] font-semibold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Pasto</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[11px] font-bold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Atividade</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[10px] font-bold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Lote</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[10px] font-bold border-b whitespace-nowrap" style={{ backgroundColor: hdrBg, borderRightStyle: 'solid', borderRightWidth: 2, borderRightColor: 'hsl(220 13% 75%)', borderBottomWidth: 1, borderBottomColor: 'hsl(220 13% 75%)' }}
                    title="O programa do lote (cadastro do lote)">Programa</th>
                  {categorias.map((cat, idx) => {
                    const bg = isMacho(cat) ? hdrBgMacho : isFemea(cat) ? hdrBgFemea : hdrBg;
                    const leftBdr = getCatBorderLeft(idx);
                    return (
                      <th key={cat.id} className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[11px] font-bold border-b border-r whitespace-nowrap" style={{ backgroundColor: bg, borderColor: 'hsl(220 13% 75%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {CAT_SIGLAS[cat.codigo] || cat.codigo}
                      </th>
                    );
                  })}
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[11px] font-semibold border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>Total</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[11px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>Peso</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[10px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }} title="Peso atualizado/conferido pelo operador">✓ Peso</th>
                  <th className="sticky top-0 z-40 px-0.5 py-0.5 text-center text-[11px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Área</th>
                  <th className="sticky top-0 z-40 px-px py-0.5 text-center text-[10px] font-medium border-b border-r whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>UA/ha</th>
                  <th className="sticky top-0 z-40 px-px py-0.5 text-center text-[10px] font-medium border-b whitespace-nowrap" style={{ backgroundColor: hdrBg, borderColor: 'hsl(220 13% 75%)' }}>Qual.</th>
                </tr>
                {/* ── BANDA STICKY TOTAL / MÉDIA (top:28, abaixo do header) ── */}
                <tr className="font-bold h-7">
                  <td colSpan={4} className="px-1.5 py-0.5 text-[11px] border-r" style={{ position: 'sticky', top: 28, left: 0, zIndex: 45, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)' }}>TOTAL / MÉDIA</td>
                  {categorias.map((cat, catIdx) => {
                    const t = totais.catTotals.get(cat.id);
                    const pesoMed = t && t.qtdComPeso > 0 ? t.pesoTotal / t.qtdComPeso : null;
                    const bg = isMacho(cat) ? ftBgMacho : isFemea(cat) ? ftBgFemea : ftBg;
                    const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                    const leftBdr = getCatBorderLeft(catIdx);
                    return (
                      <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: bg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {t && t.quantidade > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default font-bold" style={color ? { color } : undefined}>{formatNum(t.quantidade, 0)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{cat.nome}: {formatNum(t.quantidade, 0)} cab</p>
                              {pesoMed && <p>Peso médio: {formatNum(pesoMed, 2)} kg</p>}
                            </TooltipContent>
                          </Tooltip>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-0.5 py-0.5 text-center text-[11px] font-extrabold border-r" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>{formatNum(totais.totalCab, 0)}</td>
                  <td className="px-px py-0.5 text-center text-[9.5px] italic border-r tabular-nums" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>{totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}</td>
                  <td className="px-0.5 py-0.5 text-center border-r" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)' }} />
                  <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)' }}>{formatNum(totais.areaTotal, 1)}</td>
                  <td className={`px-0.5 py-0.5 text-center text-[10px] italic border-r ${getUaHaColor(totais.uaHaGeral)}`} style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderColor: 'hsl(220 13% 75%)', borderTop: '2px solid hsl(220 13% 75%)' }}>
                    {totais.uaHaGeral ? formatNum(totais.uaHaGeral, 2) : '—'}
                  </td>
                  <td className="px-0.5 py-0.5 text-center text-[11px]" style={{ position: 'sticky', top: 28, zIndex: 35, backgroundColor: ftBg, borderTop: '2px solid hsl(220 13% 75%)' }}>
                    {totais.qualidadeMedia ? (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${getQualidadeColor(totais.qualidadeMedia)}`}>
                        {formatNum(totais.qualidadeMedia, 1)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
                {/* ── BANDA STICKY PESO KG (top:56, abaixo da TOTAL/MÉDIA) ── */}
                <tr className="h-6">
                  <td colSpan={4} className="px-1.5 py-0.5 text-[10px] font-semibold border-r italic text-muted-foreground" style={{ position: 'sticky', top: 56, left: 0, zIndex: 25, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)' }}>Peso Kg</td>
                  {categorias.map((cat, catIdx) => {
                    const pesoMed = pesosPorCategoria.get(cat.id);
                    const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                    const leftBdr = getCatBorderLeft(catIdx);
                    return (
                      <td key={cat.id} className="px-0 py-0.5 text-center text-[9.5px] italic tabular-nums border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)', ...(leftBdr ? { borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' } : {}) }}>
                        {pesoMed ? (
                          <span style={color ? { color } : undefined}>{formatNum(pesoMed, 2)}</span>
                        ) : <span className="opacity-20">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-0 py-0.5 text-center text-[9.5px] italic tabular-nums border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }}>
                    {totais.pesoMedioGeral ? formatNum(totais.pesoMedioGeral, 2) : '—'}
                  </td>
                  <td className="border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)', borderLeftWidth: 2, borderLeftColor: 'hsl(220 13% 75%)' }} />
                  <td className="border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)' }} />
                  <td className="border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)' }} />
                  <td className="border-r" style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)', borderColor: 'hsl(220 13% 80%)' }} />
                  <td style={{ position: 'sticky', top: 56, zIndex: 20, backgroundColor: 'hsl(220 14% 92%)' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // Tint suave por atividade (substitui zebra). Mesmo bgStyle vai para o td sticky de Pasto.
                  const bgStyle = { backgroundColor: tintDoTipoUso(row.tipoUso) };
                  const isAgri = grupoDoTipoUso(row.tipoUso) === 'agricultura';
                  /* MAPA-REBANHO-02 — a "Divergência do Campeiro" vira "⚠ Div." (o nome inteiro no title), no Pasto e na Atividade */
                  const ehDiv = isPastoDivergencia(row.pasto.tipo_uso) || isPastoDivergencia(row.tipoUso);
                  const pai = row.piqueteDe;
                  return (
                    <tr key={row.pasto.id} className="h-6" style={bgStyle} data-testid={pai ? 'linha-do-piquete' : 'linha-do-pasto'}>
                      {/* MAPA-REBANHO-R2 — a sub-linha do piquete vem recuada, sem negrito, e abre o PAI (o card é do pasto) */}
                      <td data-texto className={`sticky left-0 z-10 py-0.5 border-r border-border/30 whitespace-nowrap overflow-hidden text-ellipsis ${pai ? 'pl-4 pr-1.5 text-[10px] font-normal text-muted-foreground' : 'px-1.5 text-[11px] font-semibold'}`} style={bgStyle}>
                        <button type="button" onClick={() => onAbrirPasto(pai ?? row.pasto)}
                          title={pai ? `${row.pasto.nome} — piquete do ${pai.nome} · abrir o ${pai.nome}` : ehDiv ? `${row.pasto.nome} · abrir` : `Abrir ${row.pasto.nome}`}
                          className="max-w-full cursor-pointer truncate text-left hover:underline" data-testid={pai ? 'abrir-pai-do-piquete' : 'abrir-pasto'}>
                          {pai ? `· ${row.pasto.nome}` : ehDiv ? DIV_CURTA : row.pasto.nome}
                        </button>
                      </td>
                      <td data-texto className="px-1 py-0.5 text-[11px] border-r border-border/30 whitespace-nowrap overflow-hidden text-ellipsis">
                        {!pai && (
                          <span className={`inline-flex items-center px-1 py-px rounded border text-[10px] font-medium ${corDoTipoUso(row.tipoUso)}`}
                            title={tipoUsoLabel(row.tipoUso)}>
                            {ehDiv && isPastoDivergencia(row.tipoUso) ? DIV_CURTA : tipoUsoLabel(row.tipoUso)}
                          </span>
                        )}
                      </td>
                      {/* o Lote é texto livre: o comprido corta com o nome inteiro no title (só nesta coluna) */}
                      <td data-texto className="px-1 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-0 border-r border-border/30" title={row.lote || (row.comPastos?.length ? `O lote de ${row.comPastos.join(', ')} também esteve aqui no mês` : '')}>
                        {row.lote || (row.comPastos?.length ? <span data-testid="lote-com">com {row.comPastos.join(', ')}</span> : <span className="opacity-20">—</span>)}
                      </td>
                      {/* o Programa (nome do cadastro) corta como o Lote: "…" e o nome inteiro no title (o gate de cortes achou o corte seco) */}
                      <td data-texto className="px-1 py-0.5 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-0" style={{ borderRight: blockBorder }}
                        title={row.programa || ''} data-testid="programa-do-pasto">
                        {row.programa || <span className="opacity-20">—</span>}
                      </td>
                      {categorias.map((cat, catIdx) => {
                        const val = row.categorias.get(cat.id);
                        const qty = val?.quantidade || 0;
                        const peso = val?.peso_medio_kg;
                        const leftBdr = getCatBorderLeft(catIdx);
                        const color = isMacho(cat) ? txtMacho : isFemea(cat) ? txtFemea : undefined;
                        return (
                          <td key={cat.id} className="px-0.5 py-0.5 text-center text-[11px] border-r border-border/30" style={leftBdr ? { borderLeft: leftBdr } : undefined}>
                            {isAgri ? null : qty > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-semibold cursor-default" style={color ? { color } : undefined}>{formatNum(qty, 0)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{cat.nome}: {formatNum(qty, 0)} cab</p>
                                  {peso && <p>Peso médio: {formatNum(peso, 2)} kg</p>}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="opacity-15">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-0.5 py-0.5 text-center text-[11px] font-bold border-r border-border/30 bg-primary/5" style={{ borderLeft: totalLeftBorder }}>
                        {isAgri ? null : row.totalCabecas ? formatNum(row.totalCabecas, 0) : <span className="opacity-15">—</span>}
                      </td>
                      <td className="px-0 py-0.5 text-center text-[9.5px] italic border-r border-border/30 tabular-nums text-muted-foreground" style={{ borderLeft: pesoLeftBorder }}>
                        {isAgri ? null : row.pesoMedio ? formatNum(row.pesoMedio, 2) : <span className="opacity-15">—</span>}
                      </td>
                      <td className="px-0.5 py-0.5 text-center border-r border-border/30">
                        {isAgri || pai ? null : (
                          <input
                            type="checkbox"
                            checked={row.pesoAtualizado}
                            disabled={!row.fechamentoId}
                            onChange={(e) => onTogglePesoAtualizado(row, e.target.checked)}
                            className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label={`Peso atualizado em ${row.pasto.nome}`}
                          />
                        )}
                      </td>
                      <td className="px-0.5 py-0.5 text-center text-[10px] italic border-r border-border/30 text-muted-foreground">{row.pasto.area_produtiva_ha ? formatNum(row.pasto.area_produtiva_ha, 1) : <span className="opacity-15">—</span>}</td>
                      <td className={`px-0.5 py-0.5 text-center text-[10px] italic border-r border-border/30 ${getUaHaColor(row.uaHa)}`}
                        title={row.comPastos?.length ? `Lotação do lote com ${row.comPastos.join(', ')}: UA ÷ soma das áreas` : undefined} data-testid="ua-ha-da-linha">{isAgri ? null : row.uaHa ? formatNum(row.uaHa, 1) : <span className="opacity-15">—</span>}</td>
                      <td className="px-0.5 py-0.5 text-center text-[11px]">
                        {row.qualidade ? (
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${getQualidadeColor(row.qualidade)}`}>
                            {row.qualidade}
                          </span>
                        ) : <span className="opacity-15">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}