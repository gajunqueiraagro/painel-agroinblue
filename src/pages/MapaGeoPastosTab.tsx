import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { usePastoGeometrias, type PoligonoParaGravar } from '@/hooks/usePastoGeometrias';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { Upload, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { KmlUploadDialog } from '@/components/mapa-geo/KmlUploadDialog';
import { usePastos } from '@/hooks/usePastos';
import { useMapaDoMes } from '@/hooks/useMapaDoMes';
import { useUltimoMesComFechamento } from '@/hooks/useUltimoMesComFechamento';
import { mesDeAbertura } from '@/lib/mapa/mapaDoMes';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { usePeriodoDaTela, type PeriodoControlado } from '@/hooks/usePeriodoDaTela';
import { MESES_COLS } from '@/lib/calculos/labels';
import { MapaGestorView } from '@/components/mapa-geo/MapaGestorView';
import { MapaOperacaoView } from '@/components/mapa-geo/MapaOperacaoView';
import { ValidacaoPoligonosView } from '@/components/mapa-geo/ValidacaoPoligonosView';

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
 */
export function MapaGeoPastosTab({ periodo, onPeriodoChange }: PeriodoControlado = {}) {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const {
    geometrias, loading: geoLoading, salvarGeometrias, removerGeometrias, loadGeometrias,
    atualizarGeometria, excluirGeometrias, vincularPasto,
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

  const mapaDoMes = useMapaDoMes(fazendaId, anoMes, pastos, categorias);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gestor');
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

  if (isGlobal) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Selecione uma fazenda para ver o mapa.
      </div>
    );
  }

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
        geometrias={geometrias}
        pastos={pastos}
        anoMes={anoMes}
        dadosDoMes={mapaDoMes.dados}
        carregandoMes={mapaDoMes.carregando}
        erroDoMes={mapaDoMes.erro}
        geoLoading={geoLoading}
        onImportar={() => setUploadOpen(true)}
        onRenderedChange={onRenderedChange}
        seletorDeMes={seletorDeMes}
        trocaDeVista={trocaDeVista}
      />
    </div>
  ) : (
    <>
      {barraSimples}
      <div className="min-h-0 flex-1 p-1.5 sm:p-2">
        {viewMode === 'operacao' && (
          <MapaOperacaoView
            geometrias={geometrias}
            pastos={pastos}
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
            onLink={vincularPasto}
            onRefresh={loadGeometrias}
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="mapa-geo-tela">
      {content}
      {dialogo}
    </div>
  );
}
