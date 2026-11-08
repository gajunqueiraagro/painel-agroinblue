import { useState, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { usePastos, pastosMudaramPorFora, type Pasto } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatNum } from '@/lib/calculos/formatters';
import { formatAnoMes } from '@/lib/dateUtils';
import { ERROS_REGENERAR, somarFamilias, type FalhaLote, type LoteRelatorio } from '@/lib/pastos/regenerarArea';
import { Button } from '@/components/ui/button';
import { FichaDoPasto } from '@/components/pastos/FichaDoPasto';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit2, MapPin, GripVertical, AlertTriangle, History, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { labelDoTipoUso, corDoTipoUso } from '@/lib/pastos/tiposUso';
import { ListaDosPastos } from '@/components/pastos/ListaDosPastos';
import { useFichaDosPastos } from '@/hooks/useFichaDosPastos';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { useAreaDosPastosNoMes } from '@/lib/pastos/areaDoPastoNoMes';
import { GruposDePastejo, useGruposDePastejo } from '@/components/pastos/GruposDePastejo';
import { AreasDosPastos } from '@/components/pastos/AreasDosPastos';
import { ArrumarPiquetesDialog, DesfazerPiquetesDialog, podeVirarPiquete, rodadaDoPai } from '@/components/pastos/ArrumarPiquetesDialog';
import { usePastoGeometrias } from '@/hooks/usePastoGeometrias';
import { useCliente } from '@/contexts/ClienteContext';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* PASTO-FICHA-01 PR B — o "Editar Pasto" de antes (PastoForm, com o UPDATE direto em `pastos`) SAIU: o "+ Novo" e o lápis abrem a
   FICHA do pasto (`FichaDoPasto`), que grava pelos escritores do banco com prévia. */
/* FECH-ROTACAO-01 fatia 2 — o nome do grupo de pastejo de cada pasto (id do grupo → nome), lido uma vez pela tela: a etiqueta mora
   na linha e no cartão sem atravessar os 3 GrupoTipo por prop. O nome do PASTO não muda (decisão 6). */
const NomeDoGrupoContext = createContext<ReadonlyMap<string, string>>(new Map());

function EtiquetaDoGrupo({ pasto }: { pasto: Pasto }) {
  const nome = useContext(NomeDoGrupoContext).get(pasto.grupo_id ?? '');
  if (!nome) return null;
  return (
    <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight max-w-[96px] shrink-0" title={nome} aria-label={`Grupo de pastejo ${nome}`} data-testid="pasto-etiqueta-grupo">
      <span className="uma-linha-que-rola min-w-0">{nome}</span>
    </Badge>
  );
}

function SortablePastoCard({
  pasto,
  onEdit,
  onToggle,
}: {
  pasto: Pasto;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pasto.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-3 flex flex-col gap-1.5 min-w-[120px] ${!pasto.ativo ? 'opacity-40' : ''}`}
    >
      {/* Topo: nome + switch ativo */}
      <div className="flex justify-between items-start gap-1">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {/* fora de tabela, sem "…" (UI-SEM-CORTE-01): o nome longo rola no lugar */}
          <span className="font-bold text-sm uma-linha-que-rola flex-1 min-w-0" title={pasto.nome}>{pasto.nome}</span>
        </div>
        <Switch checked={pasto.ativo} onCheckedChange={onToggle} className="scale-75 shrink-0" />
      </div>

      {/* Área */}
      <span className="text-xs text-muted-foreground">
        {pasto.area_produtiva_ha != null ? `${pasto.area_produtiva_ha} ha` : '—'}
      </span>

      {/* Rodapé: editar + badge conciliação */}
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0.5">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        {/* No modo manual o destino não aparecia em lugar nenhum: arrastava-se um pasto
            sem saber se era Cria ou Vedado. */}
        <Badge variant="outline" className={`text-[9px] px-1 py-0 leading-tight ${corDoTipoUso(pasto.tipo_uso)}`}>
          {labelDoTipoUso(pasto.tipo_uso)}
        </Badge>
        <EtiquetaDoGrupo pasto={pasto} />
        {pasto.observacoes && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">Obs</Badge>
        )}
      </div>
    </div>
  );
}

/**
 * PR-FIX-PASTOS-RODAPE-01 — lê a área da MATRÍCULA do cadastro da fazenda.
 *
 * Antes daqui saía a soma das SEIS colunas de família de fazenda_cadastros. Elas não
 * são editáveis por tela nenhuma desde o 77cec994 — o dono do produto as classificou
 * como lixo, e a CadastrosTab legada perdeu os campos no 26217942. Eram números
 * congelados que ninguém mantém, e o rodapé acusava divergência contra dado morto:
 * na Retiro Agricultura dizia "68,67 ha a menos nos pastos" enquanto a aba Cadastro,
 * ao lado, mostrava diferença zero.
 *
 * A referência viva é `area_total_ha`, digitada na aba Cadastro desde o 3576814f.
 *
 * Validação de forma em runtime porque a linha vem sem tipo (types.ts defasado).
 * null quando não há cadastro ou o valor não é numérico: ausência de dado NÃO é
 * zero, e o rodapé precisa distinguir "matrícula não informada" de "zero hectares".
 */
function lerMatriculaCadastro(bruto: unknown): number | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const linha: Record<string, unknown> = Object.fromEntries(Object.entries(bruto));
  const v = Number(linha['area_total_ha']);
  return Number.isFinite(v) ? v : null;
}

/**
 * PR-FIX-PASTOS-RODAPE-02 — a matrícula foi CONFERIDA contra o documento?
 *
 * As 12 fazendas herdaram em area_total_ha o resíduo do cálculo antigo, e
 * matricula_conferida_em está NULL em todas. Sem esta leitura o rodapé pintava
 * "confere" de verde comparando contra número que ninguém conferiu — exatamente o
 * defeito que a coluna foi criada para impedir na aba Cadastro (20260904120000).
 *
 * Mesma disciplina de validação em runtime: a linha vem sem tipo.
 */
function lerMatriculaConferida(bruto: unknown): boolean {
  if (typeof bruto !== 'object' || bruto === null) return false;
  const linha: Record<string, unknown> = Object.fromEntries(Object.entries(bruto));
  const v = linha['matricula_conferida_em'];
  return typeof v === 'string' && v.trim() !== '';
}

export function PastosTab({ hostBarra }: { hostBarra?: HTMLElement | null } = {}) {
  const { pastos, loading, criarPasto, toggleAtivo, reorderPastos } = usePastos();
  const { isGlobal, fazendaAtual } = useFazenda();
  const { canEdit } = usePermissions();
  /* FECH-PASTO-UNIDADE-01 F2b (D1 a · D4 a) — "É piquete de outro pasto…" e o desfazer, no cadastro do pasto; só o admin (o banco recusa os outros) */
  const { isAdmin } = useCliente();
  const { geometrias: geometriasDaFazenda } = usePastoGeometrias();
  const [arrumarDe, setArrumarDe] = useState<Pasto | null>(null);
  const [desfazerDe, setDesfazerDe] = useState<{ rodada: string; nome: string } | null>(null);
  const [rodadaDoEditado, setRodadaDoEditado] = useState<string | null>(null);
  const paisDaFazenda = useMemo(() => new Set(pastos.flatMap((p) => (p.pai_id ? [p.pai_id] : []))), [pastos]);

  /* PR-AREA-REGENERAR-01J — o lote de regeneracao de area mora AQUI, no cadastro de
     pastos, e nao no fechamento de um mes: ele varre TODOS os meses da fazenda. */
  const [confirmLoteOpen, setConfirmLoteOpen] = useState(false);
  const [lotePreparando, setLotePreparando] = useState(false);
  const [loteMeses, setLoteMeses] = useState<string[]>([]);
  const [loteProgresso, setLoteProgresso] = useState(0);
  const [loteRodando, setLoteRodando] = useState(false);
  const [loteRelatorio, setLoteRelatorio] = useState<LoteRelatorio | null>(null);
  /* a FICHA aberta: `pastoId` nulo = pasto novo */
  const [ficha, setFicha] = useState<{ pastoId: string | null } | null>(null);
  const editado = useMemo(() => (ficha?.pastoId ? pastos.find(p => p.id === ficha.pastoId) : undefined), [ficha, pastos]);
  /* F2b (Code 4): o pai criado pelo gesto tem rodada na trilha → o "Voltar a pastos soltos…" (agora no cabeçalho da FICHA) */
  useEffect(() => {
    let vivo = true;
    setRodadaDoEditado(null);
    if (isAdmin && editado && paisDaFazenda.has(editado.id)) void rodadaDoPai(editado.id).then((r) => { if (vivo) setRodadaDoEditado(r); });
    return () => { vivo = false; };
  }, [isAdmin, editado, paisDaFazenda]);
  const [showInativos, setShowInativos] = useState(false);
  const [criandoDivergencia, setCriandoDivergencia] = useState(false);
  // PR-PASTOS-LISTA-01 — dois modos, porque são dois usos distintos: "destino"
  // serve para CONFERIR a repartição; "manual" serve para a ordem operacional de
  // campo. Fundir os dois num único gesto de arrastar produziria um arrasto que
  // às vezes não tem efeito (o grupo manda sobre ordem_exibicao). O modo manual
  // preserva o comportamento atual intacto — e, com ele, o significado de
  // ordem_exibicao, que é a ordenação de usePastos e alimenta outras 12 telas.
  /* PASTO-AREA-OFICIAL-01 — o 4º modo, "Áreas": a área oficial × a do mapa e o "Usar área do mapa" (`AreasDosPastos`) */
  const [modo, setModo] = useState<'lista' | 'manual' | 'grupos' | 'areas'>('lista');
  /* FECH-ROTACAO-01 fatia 2 — os grupos de pastejo da fazenda (a lista do modo "Grupos" e a etiqueta do pasto nos outros dois) */
  const fazendaDosGrupos = fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;
  const gruposDePastejo = useGruposDePastejo(fazendaDosGrupos);
  const nomeDoGrupo = useMemo(() => new Map(gruposDePastejo.grupos.map(g => [g.id, g.nome])), [gruposDePastejo.grupos]);
  /** Área total do cadastro da fazenda, para o comparativo do rodapé. */
  const [areaTotalFazenda, setAreaTotalFazenda] = useState<number | null>(null);
  const [matriculaConferida, setMatriculaConferida] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(
    () => (showInativos ? pastos : pastos.filter(p => p.ativo)),
    [pastos, showInativos],
  );

  // Área total do cadastro. Query própria em vez de prop: acoplar PastosTab à aba
  // Área tornaria duas abas hoje independentes dependentes uma da outra; a leitura
  // duplicada é o custo menor e mais reversível.
  useEffect(() => {
    if (!fazendaAtual?.id || fazendaAtual.id === '__global__') { setAreaTotalFazenda(null); setMatriculaConferida(false); return; }
    let cancelado = false;
    // area_total_ha existe no banco mas NÃO em types.ts (o arquivo está defasado —
    // o V2Fazendas carrega 2 erros de baseline exatamente por isso). Idioma do
    // repositório para coluna sem tipo gerado, com leitura validada em runtime para
    // não propagar `any`. Sai no lote da regeneração de types.
    void (supabase as any)
      .from('fazenda_cadastros')
      .select('area_total_ha, matricula_conferida_em')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (cancelado) return;
        setAreaTotalFazenda(lerMatriculaCadastro(data));
        setMatriculaConferida(lerMatriculaConferida(data));
      });
    return () => { cancelado = true; };
  }, [fazendaAtual?.id]);

  // Agrupamento: família → tipo de uso. Fora da taxonomia, DOIS destinos distintos:
  // 'divergencia' ganha bloco próprio, o resto fica no balde genérico. Todo pasto de
  // `filtered` cai em exatamente um dos três — taxonomia, divergência ou legado.
  //
  // PR-AREA-EXTRAIR-01 — o corpo saiu daqui para lib/pastos/agruparPorFamilia.ts,
  // verbatim: a aba Área do V2Fazendas vai consumir a MESMA repartição, e duas
  // cópias divergiriam. O filtro de `ativo` fica aqui, em `filtered`, porque só
  // esta tela tem o modo "Inativos".
  //
  // PR-PASTOSTAB-01 item 1 — MÊS CORRENTE, declarado, no mesmo idioma do
  // V2Fazendas:88-93. Esta tela NÃO tem seletor de mês nem de ano: o único mês
  // que ela pode oferecer honestamente é o de hoje, e é o certo, porque é
  // cadastro ATUAL. A comparação é contra o mês CONSULTADO e nunca contra
  // now() dentro do predicado — daí o mês entrar como valor, não como default
  // escondido em `isPastoAtivoNoMes`.
  const mesCorrente = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Vigência (data_inicio/data_fim) no MÊS ESCOLHIDO é da lista (PASTOS-CAD-02): o rodapé e o topo somam SÓ os vigentes do mês — o
  // "Total" nunca conta pasto encerrado (foi assim que a Pureza acusava 4.725,96 contra a matrícula de 4.656,20: IND.05 e IND.06,
  // desmembrados em 2025-05-31). `ativo` continua em `filtered`, separado: vigência e ativo são coisas diferentes.

  /* PASTO-FICHA-01 PR B — o que a lista mostra além do cadastro (forrageira, avaliação, suporte, lotação do mês fechado, reforma),
     lido de uma vez para a fazenda; relê quando a ficha grava (`versaoDaFicha`). */
  const hoje = hojeLocal();
  const [versaoDaFicha, setVersaoDaFicha] = useState(0);
  /* PASTOS-CAD-02 — a lista é de TODOS os pastos ativos; ela mesma separa Vigentes / Encerrados / Todos no MÊS ESCOLHIDO (`mesDaLista`).
     A área é a oficial desse mês (vigência), a mesma do Fechamento; sem vigência lida, a do cadastro. */
  const [mesDaLista, setMesDaLista] = useState(mesCorrente);
  const areaDoMes = useAreaDosPastosNoMes(fazendaDosGrupos ? [fazendaDosGrupos] : [], mesDaLista, mesDaLista);
  const linhasDaLista = useMemo(() => filtered.map(p => {
    const a = areaDoMes.areaDe(p.id, mesDaLista);
    return { id: p.id, nome: p.nome, tipo_uso: p.tipo_uso, ativo: p.ativo, pai_id: p.pai_id ?? null, posse: p.posse ?? null,
      data_inicio: p.data_inicio, data_fim: p.data_fim ?? null, area_ha: a !== undefined && a !== null ? a : p.area_produtiva_ha };
  }), [filtered, areaDoMes.areaDe, mesDaLista]);
  const fichaDosPastos = useFichaDosPastos({
    fazendaId: fazendaDosGrupos, clienteId: fazendaAtual?.cliente_id ?? null, pastos: filtered, hoje, mes: mesDaLista, versao: versaoDaFicha,
  });

  const jaTemDivergencia = useMemo(
    () => pastos.some(p => p.tipo_uso === 'divergencia'),
    [pastos],
  );

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para gerenciar pastos.</div>;


  const handleCriarDivergencia = async () => {
    if (!fazendaAtual) return;
    setCriandoDivergencia(true);
    const ok = await criarPasto({
      fazenda_id: fazendaAtual.id,
      nome: '⚠️ Divergência do Campeiro',
      lote_padrao: null,
      area_produtiva_ha: 0,
      tipo_uso: 'divergencia',
      qualidade: null,
      entra_conciliacao: true,
      ativo: true,
      observacoes: 'Pasto especial para registrar divergências de contagem do campeiro.',
      ordem_exibicao: 0,
    } as any);
    setCriandoDivergencia(false);
    if (ok) toast.success('Pasto de divergência criado');
  };

  /* Descobre a serie ANTES de abrir o dialogo — sem numero concreto o operador nao tem
     como consentir com o tamanho do que pediu.
     A lista sai de fechamento_area_snapshot, UMA linha por fazenda+mes. O caminho
     sem cast seria fechamento_pastos (typed, ja usado no statusPorMes), mas ele tem uma
     linha por PASTO por mes: 6.617 linhas na Pureza contra 79 aqui, e cinco fazendas
     passam de mil. Este projeto ja bateu no teto de 1000 linhas do PostgREST antes
     (ProdutoAutocomplete, P0-3), e ali a truncagem e SILENCIOSA — o lote regeneraria
     meia serie achando que fez tudo. Entre um cast e uma lista incompleta sem aviso,
     o cast. Mais um item para a regeneracao de types.ts. */
  const handleAbrirLote = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    setLotePreparando(true);
    try {
      const { data, error } = await (supabase as any)
        .from('fechamento_area_snapshot')
        .select('ano_mes')
        .eq('fazenda_id', fazendaAtual.id)
        .order('ano_mes', { ascending: true });
      if (error) {
        console.error('fechamento_area_snapshot', error);
        toast.error(`Não foi possível listar os meses: ${error.message || 'tente novamente'}`);
        return;
      }
      // ano_mes ali e DATE (dia 1); a RPC quer 'YYYY-MM'. O regex e o mesmo do SQL.
      const meses: string[] = [];
      for (const linha of Array.isArray(data) ? data : []) {
        const mes = String(linha?.ano_mes ?? '').slice(0, 7);
        if (/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(mes) && !meses.includes(mes)) meses.push(mes);
      }
      if (meses.length === 0) {
        toast.error('Esta fazenda não tem nenhum mês com área gravada.');
        return;
      }
      setLoteMeses(meses);
      setLoteProgresso(0);
      setConfirmLoteOpen(true);
    } finally {
      setLotePreparando(false);
    }
  };

  /* SEQUENCIAL, do mais antigo para o mais recente. Promise.all poria 79 chamadas
     disputando o mesmo fn_lock_p1 da fazenda, e o resultado seria imprevisivel. */
  const handleRegenerarLote = async () => {
    if (!fazendaAtual || fazendaAtual.id === '__global__') return;
    setLoteRodando(true);
    setLoteProgresso(0);
    const falhas: FalhaLote[] = [];
    let regenerados = 0;
    let inalterados = 0;
    for (let i = 0; i < loteMeses.length; i++) {
      const mes = loteMeses[i];
      try {
        const { data, error } = await (supabase as any).rpc('fn_regenerar_area_do_mes', {
          p_fazenda_id: fazendaAtual.id,
          p_ano_mes: mes,
        });
        if (error) {
          const msg = String(error.message ?? '');
          const conhecido = ERROS_REGENERAR.find(([codigo]) => msg.startsWith(codigo));
          if (!conhecido) console.error('fn_regenerar_area_do_mes', mes, error);
          falhas.push({ anoMes: mes, motivo: conhecido ? conhecido[1] : (msg || 'Erro desconhecido') });
        } else {
          const antes = somarFamilias(data?.area_anterior);
          const depois = somarFamilias(data?.area_nova);
          // Valor igual e RESULTADO, nao falha: a fotografia ja refletia os pastos.
          if (antes !== null && depois !== null && Math.abs(depois - antes) < 0.01) inalterados++;
          else regenerados++;
        }
      } catch (e: any) {
        console.error('fn_regenerar_area_do_mes', mes, e);
        falhas.push({ anoMes: mes, motivo: e?.message || 'Erro inesperado' });
      }
      setLoteProgresso(i + 1);
    }
    // Sem recarga de tela de mes: aqui nao ha uma. E o lote nao altera cadastro de
    // pasto — mexe em area e conjunto —, entao a lista desta tela segue valida.
    setLoteRodando(false);
    setConfirmLoteOpen(false);
    setLoteRelatorio({ total: loteMeses.length, regenerados, inalterados, falhas });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filtered.findIndex(p => p.id === active.id);
    const newIndex = filtered.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(filtered, oldIndex, newIndex);
    reorderPastos(reordered.map(p => p.id));
  };

  // PR-UI-PASTOS-BARRA-01 — a barra é publicada como valor, não movida para o pai.
  // PastosTab tem DOIS pais (V2Fazendas e CadastrosTab); mover o JSX duplicaria a
  // barra em dois arquivos, e duas cópias divergem. Um componente, dois destinos.
  const barra = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold">Pastos</h2>
        <Badge variant="secondary" className="text-[10px]">{pastos.filter(p => p.ativo).length} ativos</Badge>
        {/* FECH-ROTACAO-01 fatia 2 — o "N total" reserva o lugar sempre (invisível com os inativos desligados): com o 3º modo na barra,
            ligar os inativos espremia os botões da direita a 1000px (gate de deslocamento) */}
        <Badge variant="outline" className={`text-[10px] ${showInativos ? '' : 'invisible'}`} aria-hidden={!showInativos}>{pastos.length} total</Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded border overflow-hidden">
          {/* PASTO-FICHA-01 PR B — a lista de verdade (uma linha por pasto, piquetes embaixo do pai) é o padrão */}
          <button
            type="button"
            onClick={() => setModo('lista')}
            className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            data-testid="pastos-modo-lista"
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setModo('manual')}
            className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            title="Lista plana, arrastável — define ordem_exibicao"
          >
            Ordem manual
          </button>
          <button
            type="button"
            onClick={() => setModo('grupos')}
            className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'grupos' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            title="Grupos de pastejo: pastos que já existem, juntos (a área do grupo é a soma)"
            data-testid="pastos-modo-grupos"
          >
            Grupos
          </button>
          <button
            type="button"
            onClick={() => setModo('areas')}
            className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'areas' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            title="Área oficial × área do mapa: a diferença e o “Usar área do mapa” (de um mês em diante, com prévia)"
            data-testid="pastos-modo-areas"
          >
            Áreas
          </button>
        </div>
        <label className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Switch checked={showInativos} onCheckedChange={setShowInativos} className="scale-75" />
          Inativos
        </label>
        {!jaTemDivergencia && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={handleCriarDivergencia}
            disabled={criandoDivergencia}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            {criandoDivergencia ? 'Criando...' : 'Criar pasto de divergência'}
          </Button>
        )}
        {/* PR-AREA-REGENERAR-01J — vindo do cabecalho do FechamentoTab. A condicao la era
            `fechadosCount > 0`, que aqui nao tem sujeito: esta tela nao tem mes. Quem
            responde "nao ha o que regenerar" e o proprio clique, pelo toast de
            handleAbrirLote. Metrica e cores preservadas do lugar de origem. */}
        {(canEdit('pastos') || canEdit('zootecnico')) && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] font-bold gap-1 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 w-fit"
            onClick={handleAbrirLote}
            disabled={lotePreparando}
          >
            <History className="h-3 w-3" /> {lotePreparando ? 'Lendo meses…' : 'Regenerar histórico'}
          </Button>
        )}
        <Button size="sm" className="h-7 text-xs" onClick={() => setFicha({ pastoId: null })} disabled={!canEdit('pastos')} data-testid="pastos-novo">
          <Plus className="h-3 w-3 mr-1" />Novo
        </Button>
        {arrumarDe && (
          <ArrumarPiquetesDialog pastoInicial={{ ...arrumarDe, area_ha: arrumarDe.area_produtiva_ha }} pastos={pastos.map((p) => ({ ...p, area_ha: p.area_produtiva_ha }))}
            geometrias={geometriasDaFazenda} pais={paisDaFazenda}
            onFechar={() => setArrumarDe(null)}
            aoGravar={() => { toast.success('Os pastos viraram piquetes'); setFicha(null); if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id); }} />
        )}
        {desfazerDe && (
          <DesfazerPiquetesDialog rodada={desfazerDe.rodada} nomeDoPai={desfazerDe.nome} onFechar={() => setDesfazerDe(null)}
            aoGravar={() => { toast.success('Os pastos voltaram a valer'); setFicha(null); if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id); }} />
        )}
      </div>
    </div>
  );

  return (
    <div className="p-3 pt-1 pb-20 space-y-2">
      {/* A barra é a MESMA em qualquer lugar; só o destino do render muda. Pai que
          passa hostBarra a recebe ao lado das abas; pai que não passa (CadastrosTab)
          continua com ela no topo do próprio conteúdo, como sempre. O portal preserva
          a árvore React — estado, contexto e eventos seguem dentro do PastosTab. */}
      {hostBarra ? createPortal(barra, hostBarra) : barra}

      {/* Grid */}
      <NomeDoGrupoContext.Provider value={nomeDoGrupo}>
      {/* o miolo troca INTEIRO com o modo (destino, manual, grupos, áreas): é conteúdo, não controle (UI-SEM-DESLOCAR-01) */}
      <div data-desloca-livre="">
      {modo === 'areas' ? (
        fazendaDosGrupos && fazendaAtual ? (
          <AreasDosPastos
            fazendaId={fazendaDosGrupos}
            fazendaCodigo={fazendaAtual.codigo ?? null}
            podeEditar={canEdit('pastos')}
            aoGravar={() => { if (fazendaAtual.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id); }}
          />
        ) : (
          <p className="rounded border bg-card px-3 py-6 text-center text-[11px] text-muted-foreground" data-testid="areas-sem-fazenda">
            Escolha uma fazenda para comparar a área oficial com a do mapa.
          </p>
        )
      ) : modo === 'grupos' && fazendaAtual ? (
        <GruposDePastejo
          fazendaId={fazendaAtual.id}
          fazendaCodigo={fazendaAtual.codigo ?? null}
          pastos={pastos}
          grupos={gruposDePastejo.grupos}
          carregando={gruposDePastejo.carregando}
          erro={gruposDePastejo.erro}
          mostrarInativos={showInativos}
          podeEditar={canEdit('pastos')}
          aoGravar={() => { void gruposDePastejo.recarregar(); if (fazendaAtual.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id); }}
        />
      ) : loading ? (
        <div className="text-center text-muted-foreground py-8 text-xs">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhum pasto cadastrado</p>
        </div>
      ) : modo === 'manual' ? (
        /* Modo manual: comportamento ANTERIOR, intocado. É onde ordem_exibicao é
           definido, e ele continua significando exatamente o que significava. */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(p => p.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {filtered.map(p => (
                <SortablePastoCard
                  key={p.id}
                  pasto={p}
                  onEdit={() => setFicha({ pastoId: p.id })}
                  onToggle={(v) => toggleAtivo(p.id, v)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        /* PASTO-FICHA-01 PR B — a LISTA (e o "Por destino", a mesma tabela agrupada): uma linha por pasto, piquetes recuados embaixo do
           pai, toda coluna ordenável, cabeçalho e rodapé presos (`ListaDosPastos`). Substitui a lista agrupada de antes. */
        <ListaDosPastos
          pastos={linhasDaLista}
          ficha={fichaDosPastos.ficha}
          mes={mesDaLista}
          onMes={setMesDaLista}
          mesDeHoje={mesCorrente}
          erroDaFicha={fichaDosPastos.erro}
          onEditar={(id) => setFicha({ pastoId: id })}
          matricula={areaTotalFazenda}
          matriculaConferida={matriculaConferida}
        />
      )}
      </div>
      </NomeDoGrupoContext.Provider>

      {ficha && fazendaAtual && fazendaDosGrupos && (
        <FichaDoPasto
          pastoId={ficha.pastoId}
          fazendaId={fazendaDosGrupos}
          fazendaNome={fazendaAtual.codigo ? `${fazendaAtual.codigo} · ${fazendaAtual.nome}` : fazendaAtual.nome}
          clienteId={fazendaAtual.cliente_id ?? null}
          mesDeHoje={mesCorrente}
          hoje={hoje}
          piquetes={ficha.pastoId ? pastos.filter(x => x.pai_id === ficha.pastoId).length : 0}
          podeEditar={canEdit('pastos')}
          acoesDoCabecalho={isAdmin && editado ? (<>
            {podeVirarPiquete({ ...editado, area_ha: editado.area_produtiva_ha }, paisDaFazenda) && (
              <Button variant="outline" size="sm" className="h-6 border-white/40 bg-transparent text-[10.5px] text-white hover:bg-white/10" data-testid="abrir-arrumar-piquetes"
                onClick={() => setArrumarDe(editado)}>É piquete de outro pasto…</Button>
            )}
            {rodadaDoEditado && (
              <Button variant="outline" size="sm" className="h-6 border-white/40 bg-transparent text-[10.5px] text-white hover:bg-white/10" data-testid="abrir-desfazer-piquetes"
                onClick={() => setDesfazerDe({ rodada: rodadaDoEditado, nome: editado.nome })}>Voltar a pastos soltos…</Button>
            )}
          </>) : undefined}
          aoFechar={() => setFicha(null)}
          aoGravar={() => { setFicha(null); setVersaoDaFicha(v => v + 1); if (fazendaAtual.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id); }}
        />
      )}

      {/* Regenerar histórico — confirmação com o TAMANHO */}
      <AlertDialog open={confirmLoteOpen} onOpenChange={(o) => { if (!loteRodando) setConfirmLoteOpen(o); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-amber-600" />
              Regenerar histórico
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Isso vai regenerar <strong>{loteMeses.length} {loteMeses.length === 1 ? 'mês' : 'meses'}</strong>
              {fazendaAtual ? ` da "${fazendaAtual.nome}"` : ''}
              {loteMeses.length > 0 ? <>, de <strong>{formatAnoMes(loteMeses[0])}</strong> a <strong>{formatAnoMes(loteMeses[loteMeses.length - 1])}</strong></> : null}.
              <br /><br />
              A área gravada de cada mês será <strong>apagada e recalculada</strong> a partir dos pastos do
              conjunto fechado.
              <br /><br />
              Para refazer a área, cada mês é conciliado antes: pasto aplicável sem card ganha um card já
              fechado, e card vazio que esteja aberto é fechado. Card aberto com dados interrompe a
              operação — nada é apagado.
              <br /><br />
              O rebanho não é afetado. Mês oficializado não regenera: reabra formalmente antes.
              <br /><br />
              <span className="text-muted-foreground text-xs">
                Cada mês é processado <strong>separadamente</strong>, um por vez. Uma falha no meio do lote
                <strong> não desfaz</strong> os meses já regenerados — no fim você recebe o relatório do que
                deu certo e do que não deu.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loteRodando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRegenerarLote(); }} disabled={loteRodando}>
              {loteRodando ? `Regenerando… ${loteProgresso} de ${loteMeses.length}` : `Regenerar ${loteMeses.length} ${loteMeses.length === 1 ? 'mês' : 'meses'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Relatório do lote — dialogo, nao toast: com falhas, a lista E o conteudo */}
      <AlertDialog open={loteRelatorio !== null} onOpenChange={(o) => { if (!o) setLoteRelatorio(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {loteRelatorio && loteRelatorio.falhas.length > 0
                ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                : <CheckCircle className="h-5 w-5 text-emerald-600" />}
              Histórico regenerado
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {loteRelatorio ? (
                <>
                  <strong>{loteRelatorio.total}</strong> {loteRelatorio.total === 1 ? 'mês processado' : 'meses processados'}:
                  {' '}<strong>{loteRelatorio.regenerados}</strong> com valor novo,
                  {' '}<strong>{loteRelatorio.inalterados}</strong> sem mudança de valor,
                  {' '}<strong>{loteRelatorio.falhas.length}</strong> com falha.
                  {loteRelatorio.falhas.length === 0 && loteRelatorio.inalterados > 0 && (
                    <><br /><br />
                    <span className="text-muted-foreground text-xs">
                      Mês sem mudança de valor não é falha: a área gravada já refletia os pastos.
                    </span></>
                  )}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {loteRelatorio && loteRelatorio.falhas.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-2 max-h-[40vh] overflow-y-auto">
              <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1">
                Meses que não regeneraram
              </div>
              <div className="flex flex-col gap-0.5">
                {loteRelatorio.falhas.map(f => (
                  <div key={f.anoMes} className="flex items-start gap-2 text-[11px] leading-tight">
                    <span className="font-bold shrink-0 w-[64px]">{formatAnoMes(f.anoMes)}</span>
                    <span className="text-muted-foreground">{f.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLoteRelatorio(null)}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
