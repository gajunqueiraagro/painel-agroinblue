import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { usePastoGeometrias, type FazendaGeometria, type PoligonoParaGravar } from '@/hooks/usePastoGeometrias';
import { GLOBAL_FAZENDA, useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { Upload, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useMapaDoMes } from '@/hooks/useMapaDoMes';
import { useUltimoMesComFechamento } from '@/hooks/useUltimoMesComFechamento';
import { mesDeAbertura, resumoDosPastos } from '@/lib/mapa/mapaDoMes';
import { pastosDoGlobal, resumoGlobal, situacaoDoPasto } from '@/lib/mapa/resumoGlobal';
import { useGeometriasDasFazendas, type GeometriaDoGlobal } from '@/hooks/useGeometriasDasFazendas';
import { ESTADO_INICIAL_DO_GLOBAL, GeoPastosGlobal, type EstadoDoGlobal } from '@/components/mapa-geo/GeoPastosGlobal';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { usePeriodoDaTela, type PeriodoControlado } from '@/hooks/usePeriodoDaTela';
import { MESES_COLS } from '@/lib/calculos/labels';
import { MapaGestorView } from '@/components/mapa-geo/MapaGestorView';
import { MapaOperacaoView } from '@/components/mapa-geo/MapaOperacaoView';
import { ValidacaoPoligonosView } from '@/components/mapa-geo/ValidacaoPoligonosView';
import type { TipoDeArea } from '@/lib/mapa/tiposDeArea';
/* MAPA-PIQUETES-03 — a unidade do mapa (pai + grupo que nasceu dele): os piquetes viram divisões em linha fina */
import { useGruposComOrigem } from '@/hooks/useGruposComOrigem';
import { unidadesDoMapa } from '@/lib/mapa/unidadesDoMapa';
import { areaNoMesOuHoje } from '@/lib/pastos/areaDoPastoNoMes';

export interface PastoMapData {
  pasto: any;
  geometria: any;
  totalCabecas: number;
  pesoMedio: number | null;
  uaTotal: number;
  uaHa: number | null;
  lote: string | null;
  qualidade: number | null;
  categorias: Map<string, { quantidade: number; peso_medio_kg: number | null; categoria_nome: string }>;
  ultimaCondicao: string | null;
}

type ViewMode = 'gestor' | 'operacao' | 'validacao';

const VISTAS: { valor: ViewMode; rotulo: string }[] = [
  { valor: 'gestor', rotulo: 'Gestor' },
  { valor: 'operacao', rotulo: 'Operação' },
  { valor: 'validacao', rotulo: 'Validação' },
];

/**
 * MAPA-02a — o mapa de pastos lê UM mês (D1): o ano/mês do shell (FECH-MES-SELECIONADO-01, o mesmo do Fechamento e do Mapa de Pastos),
 * que abre no ÚLTIMO MÊS COM FECHAMENTO DE PASTOS da fazenda (fix1 A, `useUltimoMesComFechamento` + `mesDeAbertura`; sem nenhum, o mês de
 * hoje). Os números do mês saem do `useMapaDoMes` (fonte única). O rebanho oficial não entra no mapa (fix1 E: conferir alocadas ×
 * oficial é papel do Fechamento de pastos).
 * MAPA-GLOBAL-01: com a barra lateral em Global, o resumo de todas as fazendas com pecuária (`GeoPastosGlobal`) no MESMO mês (D1),
 * pela MESMA fonte (`useMapaDoMes` com a lista de fazendas) e a MESMA regra do Gestor (D2). Abrir uma fazenda pelo Global (D6) não pula
 * para o último mês fechado (Q3) e mostra "← Global" no Gestor; a volta (pelo botão ou pela barra lateral) acha o Global como estava: o
 * estado mora aqui enquanto a tela Geo Pastos está aberta (Q4).
 */
export function MapaGeoPastosTab({ periodo, onPeriodoChange }: PeriodoControlado = {}) {
  const { isGlobal, fazendaAtual, fazendasComPecuaria, setFazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const {
    geometrias, loading: geoLoading, salvarGeometrias, removerGeometrias, loadGeometrias,
    atualizarGeometria, excluirGeometrias,
  } = usePastoGeometrias();

  const hoje = new Date();
  const anoDoRelogio = hoje.getFullYear();
  const mesAnterior = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
  const anoMesAnterior = hoje.getMonth() === 0 ? anoDoRelogio - 1 : anoDoRelogio;
  const { ano, mes, setAno, setMes, controlado } =
    usePeriodoDaTela({ periodo, onPeriodoChange }, { ano: String(anoMesAnterior), mes: mesAnterior });
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const irPara = useCallback((a: string, m: number) => {
    if (controlado && onPeriodoChange) onPeriodoChange(a, m);
    else { setAno(a); setMes(m); }
  }, [controlado, onPeriodoChange, setAno, setMes]);

  const fazendaId = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : undefined;

  /* MAPA-02a-fix1 (A): abre no último mês com fechamento de pastos da fazenda; sem nenhum, no mês de hoje. Uma vez por fazenda. */
  const ultimoComFechamento = useUltimoMesComFechamento(fazendaId);
  const abriuNaFazendaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fazendaId || !ultimoComFechamento.pronto || ultimoComFechamento.fazendaId !== fazendaId) return;
    if (abriuNaFazendaRef.current === fazendaId) return;
    abriuNaFazendaRef.current = fazendaId;
    const alvo = mesDeAbertura(ultimoComFechamento.mes, hojeLocal());
    if (alvo !== anoMes) irPara(alvo.slice(0, 4), Number(alvo.slice(5, 7)));
  }, [fazendaId, ultimoComFechamento.pronto, ultimoComFechamento.fazendaId, ultimoComFechamento.mes, anoMes, irPara]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gestor');
  /* MAPA-AREA-TIPOS-02: a infraestrutura que o Gestor abre ao vir da Validação ("Ficha e Patrimônio no Gestor") */
  const [infraInicial, setInfraInicial] = useState<string | null>(null);
  /* MAPA-AREA-TIPOS-02: como o pedido abre na Validação (Adicionar › Área = desenhar; a infraestrutura de área existente = escolher) */
  const [modoDoPedido, setModoDoPedido] = useState<'desenhar' | 'escolher'>('desenhar');
  /* MAPA-AREA-TIPO-01: o tipo pedido pelo Adicionar › Área, que a Validação usa no próximo polígono escolhido */
  const [tipoPedido, setTipoPedido] = useState<TipoDeArea | null>(null);

  /* MAPA-GLOBAL-01: as fazendas do Global = as com pecuária (fora o ADM); a MESMA leitura do mês, para todas de uma vez */
  const fazendasDoGlobal = useMemo(() => fazendasComPecuaria.filter(f => f.id !== GLOBAL_FAZENDA.id), [fazendasComPecuaria]);
  const idsDoGlobal = useMemo(() => fazendasDoGlobal.map(f => f.id), [fazendasDoGlobal]);
  const geosDoGlobal = useGeometriasDasFazendas(isGlobal ? idsDoGlobal : []);
  /* MAPA-PIQUETES-03 (Gabriel 01/11): a UNIDADE é o pasto-pai e o grupo que nasceu dele — nome, lote, lotação e cor dela, em todos os meses;
     os polígonos dos piquetes viram divisões (linhas finas, sem rótulo nem cor). A área da unidade = a do pai ou Σ dos piquetes do mês.
     A Validação segue com os polígonos e pastos crus (é onde se edita). */
  const fazendasDaLeitura = useMemo(() => (isGlobal ? idsDoGlobal : fazendaId ? [fazendaId] : []), [isGlobal, idsDoGlobal, fazendaId]);
  const { grupos: gruposComOrigem } = useGruposComOrigem(fazendasDaLeitura);
  const areaDoPastoNoMes = useCallback((p: { id: string; area_produtiva_ha?: number | null }) => areaNoMesOuHoje(p, anoMes), [anoMes]);
  const unidades = useMemo(() => unidadesDoMapa<Pasto, FazendaGeometria>({ pastos, grupos: gruposComOrigem, poligonos: geometrias, anoMes, areaDe: areaDoPastoNoMes }),
    [pastos, gruposComOrigem, geometrias, anoMes, areaDoPastoNoMes]);
  const unidadesDoGlobal = useMemo(() => unidadesDoMapa<Pasto, GeometriaDoGlobal>({ pastos, grupos: gruposComOrigem, poligonos: geosDoGlobal.geometrias, anoMes,
    areaDe: areaDoPastoNoMes }), [pastos, gruposComOrigem, geosDoGlobal.geometrias, anoMes, areaDoPastoNoMes]);
  /* o pasto da unidade leva a área da unidade (a do pai, ou Σ dos piquetes vigentes no mês) */
  const pastosDoMapa = useMemo(() => unidades.pastos.map(p => {
    const u = unidades.unidades.get(p.id);
    return u ? { ...p, area_produtiva_ha: u.areaHa } : p;
  }), [unidades]);
  const divisoesDoMapa = useMemo(() => new Map([...unidades.unidades].map(([id, u]) => [id, u.divisoes])), [unidades]);
  const mapaDoMes = useMapaDoMes(isGlobal ? idsDoGlobal : fazendaId, anoMes, pastosDoMapa, categorias, unidades.unidadeDe);

  const global = useMemo(() => {
    if (!isGlobal) return null;
    const comPoligono = new Set<string>();
    const fazendasComMapa = new Set<string>();
    const porFazenda = new Map<string, GeometriaDoGlobal[]>();
    for (const g of unidadesDoGlobal.poligonos) {
      fazendasComMapa.add(g.fazenda_id);
      if (g.tipo === 'pasto' && g.pasto_id) comPoligono.add(g.pasto_id);
      porFazenda.set(g.fazenda_id, [...(porFazenda.get(g.fazenda_id) ?? []), g]);
    }
    const entrada = {
      anoMes, fazendas: fazendasDoGlobal.map(f => ({ id: f.id, codigo: f.codigo ?? '', nome: f.nome })),
      vigentes: mapaDoMes.vigentes, comPoligono, fazendasComMapa, dados: mapaDoMes.dados,
    };
    return { ...resumoGlobal(entrada), pastos: pastosDoGlobal(entrada), porFazenda };
  }, [isGlobal, unidadesDoGlobal.poligonos, anoMes, fazendasDoGlobal, mapaDoMes.vigentes, mapaDoMes.dados]);
  const areaPorPasto = useMemo(() => new Map(mapaDoMes.vigentes.map(p => [p.id, p.area_produtiva_ha])), [mapaDoMes.vigentes]);
  const resumoDoFiltro = useCallback((ids: readonly string[]) => resumoDosPastos(ids, mapaDoMes.dados, id => areaPorPasto.get(id)),
    [mapaDoMes.dados, areaPorPasto]);
  const situacaoDe = useCallback((id: string) => situacaoDoPasto(mapaDoMes.dados.get(id)), [mapaDoMes.dados]);

  /* D6: o estado do Global (Q4: só enquanto esta tela está aberta) e a ida/volta */
  const estadoDoGlobalRef = useRef<EstadoDoGlobal>(ESTADO_INICIAL_DO_GLOBAL);
  const guardarEstadoDoGlobal = useCallback((e: EstadoDoGlobal) => { estadoDoGlobalRef.current = e; }, []);
  const trocaPeloGlobalRef = useRef<string | null>(null);
  const [veioDoGlobal, setVeioDoGlobal] = useState(false);
  const [pastoInicial, setPastoInicial] = useState<string | null>(null);
  useEffect(() => {
    const doGlobal = !!fazendaId && trocaPeloGlobalRef.current === fazendaId;
    setVeioDoGlobal(doGlobal);
    if (!doGlobal) setPastoInicial(null);
  }, [fazendaId]);
  const abrirFazenda = useCallback((id: string, opcoes?: { pastoId?: string; importar?: boolean }) => {
    const f = fazendasDoGlobal.find(x => x.id === id);
    if (!f) return;
    trocaPeloGlobalRef.current = id;
    abriuNaFazendaRef.current = id; // Q3: vindo do Global, o mês é o do Global (não pula para o último fechado)
    setPastoInicial(opcoes?.pastoId ?? null);
    setViewMode('gestor');
    if (opcoes?.importar) setUploadOpen(true);
    setFazendaAtual(f);
  }, [fazendasDoGlobal, setFazendaAtual]);
  const voltarAoGlobal = useCallback(() => { trocaPeloGlobalRef.current = null; setFazendaAtual(GLOBAL_FAZENDA); }, [setFazendaAtual]);

  const [expanded, setExpanded] = useState(false);
  const renderedCountRef = useRef(0);
  const [, setRenderedCount] = useState(0);
  const onRenderedChange = useCallback((n: number) => {
    renderedCountRef.current = n;
    setRenderedCount(n);
  }, []);

  const hasGeo = geometrias.length > 0;

  // MAPA-IMPORT-01b: o destino de cada polígono vem escolhido do modal (pasto, pasto novo, área); "Não importar" já ficou de fora.
  // A recusa do banco volta para o rodapé do modal (`aoRecusar`), sem toast por cima do Salvar.
  const handleKmlUpload = useCallback(async (itens: PoligonoParaGravar[], aoRecusar: (frase: string) => void) => {
    const success = await salvarGeometrias(itens, { aoRecusar });
    if (success) setUploadOpen(false);
    return success;
  }, [salvarGeometrias]);

  const anosDoSeletor = useMemo(() => {
    const s = new Set<string>([ano]);
    for (let y = anoDoRelogio; y >= anoDoRelogio - 3; y--) s.add(String(y));
    return [...s].sort().reverse();
  }, [ano, anoDoRelogio]);

  /* o seletor de ano/mês do Fechamento Área (os dois `Select` da casa), o mesmo mês do shell */
  const seletorDeMes = (
    <>
      <Select value={ano} onValueChange={a => irPara(a, mes)}>
        <SelectTrigger className="h-[24px] w-[66px] text-[11px] font-semibold" data-testid="mapa-ano"><SelectValue /></SelectTrigger>
        <SelectContent className="z-[1100]">{anosDoSeletor.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={String(mes)} onValueChange={v => irPara(ano, Number(v))}>
        <SelectTrigger className="h-[24px] w-[62px] text-[11px] font-semibold" data-testid="mapa-mes"><SelectValue /></SelectTrigger>
        <SelectContent className="z-[1100]">
          {MESES_COLS.map((m, i) => <SelectItem key={m.key} value={String(i + 1)}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );

  /* fix1 (5): a tela do mapa é um CONTEXTO DE EMPILHAMENTO PRÓPRIO (`isolate`): os z-index internos do Leaflet (400–1000) e dos vidros
     (500+) só competem aqui dentro, e o submenu lateral (z-50), o cabeçalho, os modais e os avisos do app ficam sempre por cima.
     Vale para o Global, o Gestor, a Operação e a Validação (todas nascem aqui). */
  if (isGlobal && global) {
    return (
      <div className="isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="mapa-geo-tela">
        <GeoPastosGlobal
          fazendas={global.fazendas} total={global.total} pastos={global.pastos} geometriasPorFazenda={global.porFazenda}
          situacaoDoPasto={situacaoDe} resumoDoFiltro={resumoDoFiltro}
          carregando={mapaDoMes.carregando || geosDoGlobal.carregando} erro={mapaDoMes.erro ?? geosDoGlobal.erro}
          seletorDeMes={seletorDeMes} estado={estadoDoGlobalRef.current} onEstado={guardarEstadoDoGlobal} onAbrirFazenda={abrirFazenda}
        />
      </div>
    );
  }

  const trocaDeVista = (
    <Segmentado valor={viewMode} onEscolher={setViewMode} opcoes={VISTAS} altura={24} />
  );

  /* Operação e Validação seguem com a barra de sempre (sem mudança nelas nesta fatia) */
  const barraSimples = (
    <div className="flex h-10 flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        {expanded && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setExpanded(false)}>
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <h2 className="whitespace-nowrap text-[11px] font-semibold text-foreground">
          {expanded && fazendaAtual ? fazendaAtual.nome : 'Mapa de pastos'}
        </h2>
        {viewMode === 'operacao' && <div className="flex items-center gap-1">{seletorDeMes}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => loadGeometrias()} title="Atualizar mapa">
          <RefreshCw className="h-3 w-3" />
        </Button>
        {!expanded && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setExpanded(true)} title="Expandir mapa">
            <Maximize2 className="h-3 w-3" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1 h-3 w-3" />
          {hasGeo ? 'Atualizar' : 'Importar'}
        </Button>
        {trocaDeVista}
      </div>
    </div>
  );

  const content = viewMode === 'gestor' ? (
    <div className="min-h-0 flex-1">
      <MapaGestorView
        geometrias={unidades.poligonos}
        pastos={pastosDoMapa}
        divisoes={divisoesDoMapa}
        anoMes={anoMes}
        dadosDoMes={mapaDoMes.dados}
        carregandoMes={mapaDoMes.carregando}
        erroDoMes={mapaDoMes.erro}
        geoLoading={geoLoading}
        onImportar={() => setUploadOpen(true)}
        onClassificarArea={(tipo, modo) => { setTipoPedido(tipo); setModoDoPedido(modo ?? 'desenhar'); setViewMode('validacao'); }}
        fazendaId={fazendaId}
        clienteId={fazendaAtual?.cliente_id ?? null}
        onRenderedChange={onRenderedChange}
        seletorDeMes={seletorDeMes}
        trocaDeVista={trocaDeVista}
        voltarAoGlobal={veioDoGlobal ? voltarAoGlobal : undefined}
        pastoInicialId={veioDoGlobal ? pastoInicial : null}
        infraInicialId={infraInicial}
        onInfraInicialUsada={() => setInfraInicial(null)}
      />
    </div>
  ) : (
    <>
      {barraSimples}
      <div className="min-h-0 flex-1 p-1.5 sm:p-2">
        {viewMode === 'operacao' && (
          <MapaOperacaoView
            geometrias={unidades.poligonos}
            pastos={pastosDoMapa}
            divisoes={divisoesDoMapa}
            categorias={categorias}
            ocupacoes={mapaDoMes.ocupacoes}
            dadosDoMes={mapaDoMes.dados}
            geoLoading={geoLoading}
            onUpload={() => setUploadOpen(true)}
            onRefresh={() => { loadGeometrias(); mapaDoMes.recarregar(); }}
            onRenderedChange={onRenderedChange}
          />
        )}
        {viewMode === 'validacao' && (
          <ValidacaoPoligonosView
            geometrias={geometrias}
            pastos={pastos}
            geoLoading={geoLoading}
            onUpdate={atualizarGeometria}
            onDelete={excluirGeometrias}
            onRefresh={loadGeometrias}
            tipoPedido={tipoPedido}
            onTipoPedidoUsado={() => setTipoPedido(null)}
            onAbrirInfraNoGestor={id => { setInfraInicial(id); setViewMode('gestor'); }}
            modoInicialDoPedido={modoDoPedido}
          />
        )}
      </div>
    </>
  );

  const dialogo = (
    <KmlUploadDialog
      open={uploadOpen}
      onOpenChange={setUploadOpen}
      onUpload={handleKmlUpload}
      onRemove={removerGeometrias}
      pastos={pastos}
      hasExistingMap={hasGeo}
      fazendaId={fazendaAtual?.id}
      fazendaCodigo={fazendaAtual?.codigo}
      fazendaNome={fazendaAtual?.nome}
    />
  );

  // Expanded mode — fixed overlay above everything except bottom nav
  if (expanded) {
    return (
      <>
        <div className="fixed inset-x-0 top-0 z-40 flex flex-col bg-background" style={{ bottom: 'var(--bottom-nav-safe, 64px)' }}>
          {content}
        </div>
        {dialogo}
      </>
    );
  }

  /* Normal mode — MAPA-02a (adendo do Gabriel): o mapa vai ATÉ A BASE DA JANELA. A altura vem do container flex do shell
     ('mapa-geo-pastos' em SECOES_APP_SHELL do V2Index; no Index antigo, o pai `flex-1 min-h-0 overflow-hidden`), nunca de altura
     fixa — o `calc(100dvh − topo − 64px)` de antes descontava a barra de baixo do celular também no desktop e sobrava uma faixa. */
  return (
    <div className="isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="mapa-geo-tela">
      {content}
      {dialogo}
    </div>
  );
}
