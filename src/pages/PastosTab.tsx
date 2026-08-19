import { useState, useMemo } from 'react';
import { usePastos, type Pasto } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, MapPin, GripVertical, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TIPOS_USO_OPTIONS_AGRUPADAS, isTipoUsoValido, labelDoTipoUso, grupoDoTipoUso,
} from '@/lib/pastos/tiposUso';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronRight, ChevronDown } from 'lucide-react';
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

// ── PR-PASTO-DESTINO-01 — formatação de área no padrão BR (0.000,00) ──
// Input é texto, não number: `type="number"` não exibe separador de milhar nem
// vírgula decimal. Digitação livre; a formatação acontece no blur.
function formatarAreaBR(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAreaBR(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Último dia do mês 'YYYY-MM' → 'YYYY-MM-DD'. data_fim é fim INCLUSIVO. */
function ultimoDiaDoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  const dia = new Date(ano, mes, 0).getDate();
  return `${anoMes}-${String(dia).padStart(2, '0')}`;
}

/** Campo ainda não implementado — existe só para dimensionar o layout. */
function CampoEmBreve({ label }: { label: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">
        {label} <span className="text-[10px] font-normal">· em breve</span>
      </Label>
      <Input disabled placeholder="—" className="h-9" />
    </div>
  );
}

function PastoForm({ pasto, onSave, onCancel }: { pasto?: Pasto; onSave: (data: any) => void; onCancel: () => void }) {
  const { fazendaAtual } = useFazenda();
  const [nome, setNome] = useState(pasto?.nome || '');
  const [area, setArea] = useState(formatarAreaBR(pasto?.area_produtiva_ha ?? null));
  const [entraConciliacao, setEntraConciliacao] = useState(pasto?.entra_conciliacao ?? true);
  const [observacoes, setObservacoes] = useState(pasto?.observacoes || '');
  // data_inicio armazenada como 'YYYY-MM-DD'; input month usa 'YYYY-MM'
  const [dataInicioMes, setDataInicioMes] = useState(
    pasto?.data_inicio ? pasto.data_inicio.slice(0, 7) : ''
  );
  const [dataFimMes, setDataFimMes] = useState(
    pasto?.data_fim ? pasto.data_fim.slice(0, 7) : ''
  );
  const [tipoUso, setTipoUso] = useState(pasto?.tipo_uso || 'recria');

  // PR-PASTO-DESTINO-01 — valor LEGADO fora da taxonomia oficial (ex.: 'divergencia',
  // 'pecuaria'). Entra como opção extra rotulada, NUNCA some do seletor.
  //
  // 'divergencia' é valor OPERANTE, não resíduo: PastosTab cria deliberadamente um
  // pasto com esse tipo para registrar divergência de contagem do campeiro, e
  // fn_pastos_aplicaveis_mes o exclui do conjunto do mês por
  // `tipo_uso IS DISTINCT FROM 'divergencia'`. Reclassificá-lo por efeito colateral
  // — abrir o modal para mudar outro campo e salvar — quebraria esse registro.
  // Por isso o valor atual é sempre selecionável, e a reclassificação é ato explícito.
  const tipoUsoLegado = !isTipoUsoValido(tipoUso) ? tipoUso : null;

  // PR-UI-PADROES-01 / B4 — família é TEXTO DERIVADO, nunca campo.
  // tiposUso.ts declara grupo como "conceito derivado (NÃO armazenar no banco)".
  // Dois campos permitiriam contradição — um pasto 'cria' marcado como 'Ambiental'.
  // Aqui a família é sempre recalculada a partir do destino escolhido.
  const familiaLabel =
    TIPOS_USO_OPTIONS_AGRUPADAS.find(g => g.grupo === grupoDoTipoUso(tipoUso))?.label ?? null;

  const handleSubmit = () => {
    if (!nome.trim()) return;
    onSave({
      fazenda_id: fazendaAtual?.id,
      nome: nome.trim(),
      area_produtiva_ha: parseAreaBR(area),
      tipo_uso: tipoUso,
      entra_conciliacao: entraConciliacao,
      observacoes: observacoes || null,
      ativo: pasto?.ativo ?? true,
      data_inicio: dataInicioMes ? `${dataInicioMes}-01` : null,
      data_fim: dataFimMes ? ultimoDiaDoMes(dataFimMes) : null,
    });
  };

  return (
    // PR-UI-PADROES-01 / B3 — duas abas: "Área e uso" concentra o que é editável hoje;
    // "Avançado" isola os campos ainda não implementados, para que eles não competam
    // com o fluxo principal nem sugiram que já são salvos.
    <Tabs defaultValue="area-uso" className="flex flex-col flex-1 min-h-0">
      <div className="px-5 pt-3 shrink-0">
        <TabsList className="h-7">
          <TabsTrigger value="area-uso" className="text-xs">Área e uso</TabsTrigger>
          <TabsTrigger value="avancado" className="text-xs">Avançado</TabsTrigger>
        </TabsList>
      </div>

      {/* min-h-0 nos DOIS níveis (Tabs e este miolo) é obrigatório: sem ele o flex
          child não encolhe e a rolagem vaza para o modal inteiro. */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
      <TabsContent value="area-uso" className="space-y-3 mt-0">

        {/* ── Linha 1: identificação + destino ──────────────────────────────
            A2 levado ao limite: nome de pasto tem 3-6 caracteres, área tem 5,
            destino é seletor. Os três cabem numa linha só. ── */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_300px] items-start">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do pasto" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Área Produtiva (ha)</Label>
            <Input
              inputMode="decimal"
              value={area}
              onChange={e => setArea(e.target.value)}
              onBlur={() => setArea(formatarAreaBR(parseAreaBR(area)))}
              placeholder="0,00"
              className="h-9 text-right tabular-nums"
            />
          </div>
          <div>
            <Label className="text-xs">Destino padrão *</Label>
            <Select value={tipoUso} onValueChange={setTipoUso}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolher destino" /></SelectTrigger>
                <SelectContent>
                  {tipoUsoLegado && (
                    <SelectGroup>
                      <SelectLabel className="text-amber-700">Valor atual (legado)</SelectLabel>
                      <SelectItem value={tipoUsoLegado}>{labelDoTipoUso(tipoUsoLegado)} — legado</SelectItem>
                    </SelectGroup>
                  )}
                  {TIPOS_USO_OPTIONS_AGRUPADAS.map(g => (
                    <SelectGroup key={g.grupo}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.options.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
            </Select>

            {/*
              ╔════════════════════════════════════════════════════════════════════╗
              ║ REGRA INVIOLÁVEL — O DESTINO PADRÃO NUNCA ALTERA MÊS JÁ FECHADO.   ║
              ║                                                                    ║
              ║ pastos.tipo_uso é o destino CADASTRAL; fechamento_pastos.          ║
              ║ tipo_uso_mes é a fotografia do mês. A propagação de um para o      ║
              ║ outro acontece UMA vez, na criação do card do mês, em              ║
              ║ fn_obter_ou_criar_fechamentos_lote:                                ║
              ║   SELECT ... p.tipo_uso ... ON CONFLICT (fazenda_id, pasto_id,     ║
              ║   ano_mes) DO NOTHING                                              ║
              ║                                                                    ║
              ║ O DO NOTHING é o mecanismo: card que já existe nunca é tocado.     ║
              ║ Não há UPDATE de fechamento_pastos a partir de pastos em lugar     ║
              ║ nenhum do sistema. A garantia é ESTRUTURAL, não disciplinar —      ║
              ║ mudar este campo é incapaz de alcançar mês fechado.                ║
              ║                                                                    ║
              ║ Se você veio "corrigir" isto achando que faltou propagar para os   ║
              ║ meses existentes: não faltou. Propagar reescreveria fechamento     ║
              ║ contábil já conferido.                                             ║
              ╚════════════════════════════════════════════════════════════════════╝
            */}

            {/* Família deixa de ser caixa: é valor derivado, nunca editável — caixa
                com borda sugere campo. Vira linha de leitura sob o destino. */}
            <p className="text-[10px] leading-snug text-muted-foreground mt-1">
              Família:{' '}
              {familiaLabel
                ? <strong className="text-foreground font-medium">{familiaLabel}</strong>
                : <em>— legado</em>}
            </p>
            <p className="text-[10px] leading-snug text-muted-foreground mt-0.5">
              Vale como padrão dos <strong>próximos</strong> fechamentos. Meses já fechados
              não mudam — cada mês guarda o destino que tinha quando foi fechado.
            </p>
          </div>
        </div>

        {/* ── Linha 2: vigência empilhada + observações ao lado ────────────
            Os dois campos de mês são estreitos por natureza; empilhados à
            esquerda liberam a direita inteira para o texto livre, que é o
            único campo do formulário que ganha com altura. ── */}
        <div className="grid gap-3 sm:grid-cols-[260px_minmax(0,1fr)] items-start">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Data de início (opcional)</Label>
              <Input type="month" value={dataInicioMes} onChange={e => setDataInicioMes(e.target.value)} className="h-9" />
              <p className="text-[10px] leading-snug text-muted-foreground mt-1">
                Vazio = todos os meses. Preenchido, o pasto passa a existir a partir desse mês.
              </p>
            </div>
            <div>
              <Label className="text-xs">Data de fim (opcional)</Label>
              <Input type="month" value={dataFimMes} onChange={e => setDataFimMes(e.target.value)} className="h-9" />
              {/* Texto diz o EFEITO REAL: data_fim é o filtro temporal soberano
                  de fn_pastos_aplicaveis_mes. */}
              <p className="text-[10px] leading-snug text-muted-foreground mt-1">
                Último mês de uso. Depois dele o pasto não gera card no fechamento nem entra
                na conta de área. Meses anteriores ficam intactos. Vazio = sem fim previsto.
              </p>
            </div>
          </div>
          <div className="flex flex-col">
            <Label className="text-xs">Observações</Label>
            <Textarea
              className="text-xs min-h-[150px] resize-none"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Observações gerais..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={entraConciliacao} onCheckedChange={setEntraConciliacao} />
          <Label className="text-xs">Entra na conciliação</Label>
        </div>

      </TabsContent>

      {/* ── Campos futuros: desabilitados, sem persistência e sem coluna nova.
             Existem para dimensionar o layout definitivo do cadastro. ── */}
      <TabsContent value="avancado" className="space-y-3 mt-0">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Campos em preparação — ainda não são salvos.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoEmBreve label="Tipo de pastagem" />
          <CampoEmBreve label="Invasoras" />
          <CampoEmBreve label="Fonte de água (natural ou bebedouro)" />
          <CampoEmBreve label="Qualidade das cercas" />
          <CampoEmBreve label="Última reforma" />
        </div>
      </TabsContent>
      </div>

      {/* Ações fora das abas e fora do miolo rolável: salvar vale para o formulário
          inteiro, e o botão nunca sai da tela no scroll (A8). */}
      <div className="shrink-0 flex gap-2 px-5 py-3 border-t bg-background">
        <Button onClick={handleSubmit} className="flex-1 h-9">{pasto ? 'Atualizar' : 'Criar Pasto'}</Button>
        <Button variant="outline" onClick={onCancel} className="h-9">Cancelar</Button>
      </div>
    </Tabs>
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
          <span className="font-bold text-sm truncate flex-1 min-w-0">{pasto.nome}</span>
        </div>
        <Switch checked={pasto.ativo} onCheckedChange={onToggle} className="scale-75 shrink-0" />
      </div>

      {/* Área */}
      <span className="text-xs text-muted-foreground">
        {pasto.area_produtiva_ha != null ? `${pasto.area_produtiva_ha} ha` : '—'}
      </span>

      {/* Rodapé: editar + badge conciliação */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0.5">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        {pasto.entra_conciliacao && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 leading-tight">Conc</Badge>
        )}
        {pasto.observacoes && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 leading-tight">Obs</Badge>
        )}
      </div>
    </div>
  );
}

// ── PR-PASTOS-LISTA-01 — colunas "em breve" da LISTA, espelhando os campos que o
// modal já reserva. Desabilitadas e sem dado: existem para dimensionar o layout
// definitivo antes de haver coluna no banco.
const COLUNAS_EM_BREVE = ['Pastagem', 'Invasoras', 'Água', 'Cercas', 'Últ. reforma'] as const;

/** Colunas de área do cadastro da fazenda, somadas. Mesmo conjunto do V2Fazendas. */
const COLUNAS_AREA_CADASTRO = [
  'area_pecuaria_ha', 'area_agricultura_ha', 'area_app_ha',
  'area_reserva_ha', 'area_benfeitorias_ha', 'area_outras_ha',
] as const;

/**
 * Soma as áreas do cadastro validando a forma em runtime — a linha vem sem tipo
 * (types.ts defasado). null quando não há cadastro: ausência de dado NÃO é zero,
 * e o rodapé precisa distinguir "não informada" de "zero hectares".
 */
function somarAreasCadastro(bruto: unknown): number | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const linha: Record<string, unknown> = Object.fromEntries(Object.entries(bruto));
  let total = 0;
  for (const col of COLUNAS_AREA_CADASTRO) {
    const v = Number(linha[col]);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

const GRID_LINHA =
  'minmax(0,1.4fr) 96px repeat(5, minmax(0,0.8fr)) 108px';

function LinhaPasto({
  pasto, onEdit, onToggle,
}: { pasto: Pasto; onEdit: () => void; onToggle: (v: boolean) => void }) {
  return (
    <div
      className={`grid gap-2 items-center px-2 py-1 border-b last:border-b-0 hover:bg-muted/40 leading-tight ${!pasto.ativo ? 'opacity-45' : ''}`}
      style={{ gridTemplateColumns: GRID_LINHA }}
    >
      <span className="text-[11px] font-medium truncate" title={pasto.nome}>{pasto.nome}</span>
      <span className="text-[11px] font-medium tabular-nums text-right">
        {formatarAreaBR(pasto.area_produtiva_ha ?? null) || '—'}
      </span>
      {COLUNAS_EM_BREVE.map(c => (
        <span key={c} className="text-[10px] text-muted-foreground/40 truncate" title={`${c} — em breve`}>—</span>
      ))}
      <div className="flex items-center justify-end gap-1">
        {pasto.entra_conciliacao && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 leading-tight">Conc</Badge>
        )}
        {pasto.observacoes && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 leading-tight" title={pasto.observacoes}>Obs</Badge>
        )}
        <Switch checked={pasto.ativo} onCheckedChange={onToggle} className="scale-[0.6]" />
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0.5" title="Editar">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Cabeçalho de colunas — densidade A4 (padrão Plano de Contas), sticky. */
function CabecalhoColunas() {
  return (
    <div
      className="grid gap-2 px-2 py-1 border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground sticky top-0 z-10"
      style={{ gridTemplateColumns: GRID_LINHA }}
    >
      <span>Pasto</span>
      <span className="text-right">Área (ha)</span>
      {COLUNAS_EM_BREVE.map(c => (
        <span key={c} className="text-muted-foreground/50" title="em breve">{c}</span>
      ))}
      <span className="text-right">Ações</span>
    </div>
  );
}

/** Um tipo de uso dentro de uma família. Vazio aparece, recolhido. */
function GrupoTipo({
  label, pastos: doTipo, onEdit, onToggle,
}: { label: string; pastos: Pasto[]; onEdit: (p: Pasto) => void; onToggle: (p: Pasto, v: boolean) => void }) {
  // PR-PASTOS-LISTA-01 — grupo VAZIO aparece recolhido, nunca omitido: um
  // "Reserva Legal · 0 pastos" é INFORMAÇÃO, não ausência dela. Omitir esconderia
  // exatamente a lacuna que esta frente quer tornar visível — a repartição só fecha
  // quando reserva, APP e benfeitorias existem como pasto.
  const vazio = doTipo.length === 0;
  const [aberto, setAberto] = useState(!vazio);
  const somaHa = doTipo.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0);

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center gap-2 px-2 py-1 bg-card hover:bg-muted/50 text-left"
      >
        {aberto ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="text-[11px] font-semibold">{label}</span>
        <span className={`text-[11px] tabular-nums ml-auto ${vazio ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
          {doTipo.length} pasto{doTipo.length !== 1 ? 's' : ''} · {formatarAreaBR(somaHa)} ha
        </span>
      </button>
      {aberto && !vazio && (
        <div>
          <CabecalhoColunas />
          {doTipo.map(p => (
            <LinhaPasto key={p.id} pasto={p} onEdit={() => onEdit(p)} onToggle={(v) => onToggle(p, v)} />
          ))}
        </div>
      )}
      {aberto && vazio && (
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
          Nenhum pasto com este destino.
        </div>
      )}
    </div>
  );
}

export function PastosTab() {
  const { pastos, loading, criarPasto, editarPasto, toggleAtivo, reorderPastos } = usePastos();
  const { isGlobal, fazendaAtual } = useFazenda();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPasto, setEditingPasto] = useState<Pasto | undefined>();
  const [showInativos, setShowInativos] = useState(false);
  const [criandoDivergencia, setCriandoDivergencia] = useState(false);
  // PR-PASTOS-LISTA-01 — dois modos, porque são dois usos distintos: "destino"
  // serve para CONFERIR a repartição; "manual" serve para a ordem operacional de
  // campo. Fundir os dois num único gesto de arrastar produziria um arrasto que
  // às vezes não tem efeito (o grupo manda sobre ordem_exibicao). O modo manual
  // preserva o comportamento atual intacto — e, com ele, o significado de
  // ordem_exibicao, que é a ordenação de usePastos e alimenta outras 12 telas.
  const [modo, setModo] = useState<'destino' | 'manual'>('destino');
  /** Área total do cadastro da fazenda, para o comparativo do rodapé. */
  const [areaTotalFazenda, setAreaTotalFazenda] = useState<number | null>(null);

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
    if (!fazendaAtual?.id || fazendaAtual.id === '__global__') { setAreaTotalFazenda(null); return; }
    let cancelado = false;
    // As colunas area_*_ha existem no banco mas NÃO em types.ts (o arquivo está
    // defasado — o V2Fazendas já carrega 2 erros de baseline pelo mesmo motivo).
    // Idioma do repositório para coluna sem tipo gerado, com leitura validada em
    // runtime para não propagar `any`. Sai no lote da regeneração de types.
    void (supabase as any)
      .from('fazenda_cadastros')
      .select('area_pecuaria_ha, area_agricultura_ha, area_app_ha, area_reserva_ha, area_benfeitorias_ha, area_outras_ha')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (cancelado) return;
        setAreaTotalFazenda(somarAreasCadastro(data));
      });
    return () => { cancelado = true; };
  }, [fazendaAtual?.id]);

  // Agrupamento: família → tipo de uso. Legado (fora da taxonomia) num grupo ao final.
  const agrupado = useMemo(() => {
    const porTipo = new Map<string, Pasto[]>();
    const legado: Pasto[] = [];
    for (const p of filtered) {
      if (isTipoUsoValido(p.tipo_uso)) {
        const arr = porTipo.get(p.tipo_uso) ?? [];
        arr.push(p);
        porTipo.set(p.tipo_uso, arr);
      } else {
        legado.push(p);
      }
    }
    const familias = TIPOS_USO_OPTIONS_AGRUPADAS.map(g => {
      const tipos = g.options.map(o => ({ tipo: o.value, label: o.label, pastos: porTipo.get(o.value) ?? [] }));
      const todos = tipos.flatMap(t => t.pastos);
      return {
        grupo: g.grupo,
        label: g.label,
        tipos,
        qtd: todos.length,
        somaHa: todos.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0),
      };
    });
    return { familias, legado };
  }, [filtered]);

  const somaPastos = useMemo(
    () => filtered.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0),
    [filtered],
  );

  const jaTemDivergencia = useMemo(
    () => pastos.some(p => p.tipo_uso === 'divergencia'),
    [pastos],
  );

  if (isGlobal) return <div className="p-6 text-center text-muted-foreground">Selecione uma fazenda para gerenciar pastos.</div>;

  const handleSave = async (data: any) => {
    const ok = editingPasto
      ? await editarPasto(editingPasto.id, data)
      : await criarPasto(data);
    if (ok) { setDialogOpen(false); setEditingPasto(undefined); }
  };

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filtered.findIndex(p => p.id === active.id);
    const newIndex = filtered.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(filtered, oldIndex, newIndex);
    reorderPastos(reordered.map(p => p.id));
  };

  return (
    <div className="p-3 pb-20 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold">Pastos</h2>
          <Badge variant="secondary" className="text-xs">{pastos.filter(p => p.ativo).length} ativos</Badge>
          {showInativos && <Badge variant="outline" className="text-xs">{pastos.length} total</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border overflow-hidden">
            <button
              type="button"
              onClick={() => setModo('destino')}
              className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'destino' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              Por destino
            </button>
            <button
              type="button"
              onClick={() => setModo('manual')}
              className={`px-2 py-0.5 text-[10px] font-semibold ${modo === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
              title="Lista plana, arrastável — define ordem_exibicao"
            >
              Ordem manual
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
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingPasto(undefined); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Novo</Button>
            </DialogTrigger>
            {/* A1 largura · A7 altura fixa (h-[540px]) para não mudar de tamanho ao
                trocar de aba · A8 header e rodapé congelados, só o miolo rola.
                max-h-[92vh] é teto em tela baixa. Receita de MesaPareamentoModal:1365
                e LancamentoV2Dialog:1017. */}
            <DialogContent className="max-w-3xl h-[470px] max-h-[92vh] p-0 flex flex-col gap-0">
              <DialogHeader className="px-5 py-3 border-b shrink-0">
                <DialogTitle className="text-sm font-semibold">{editingPasto ? 'Editar Pasto' : 'Novo Pasto'}</DialogTitle>
              </DialogHeader>
              <PastoForm pasto={editingPasto} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingPasto(undefined); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
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
                  onEdit={() => { setEditingPasto(p); setDialogOpen(true); }}
                  onToggle={(v) => toggleAtivo(p.id, v)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {agrupado.familias.map(f => (
            <div key={f.grupo} className="space-y-1">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
                  {f.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {f.qtd} pasto{f.qtd !== 1 ? 's' : ''} · {formatarAreaBR(f.somaHa)} ha
                </span>
              </div>
              <div className="space-y-1">
                {f.tipos.map(t => (
                  <GrupoTipo
                    key={t.tipo}
                    label={t.label}
                    pastos={t.pastos}
                    onEdit={(p) => { setEditingPasto(p); setDialogOpen(true); }}
                    onToggle={(p, v) => toggleAtivo(p.id, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Legado ao final: valor fora da taxonomia oficial (divergencia, pecuaria).
              Fica visível e editável — reclassificar é ato explícito do operador. */}
          {agrupado.legado.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[11px] uppercase tracking-widest font-bold text-amber-700">
                  Legado — fora da taxonomia
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {agrupado.legado.length} pasto{agrupado.legado.length !== 1 ? 's' : ''} ·{' '}
                  {formatarAreaBR(agrupado.legado.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0))} ha
                </span>
              </div>
              {Object.entries(
                agrupado.legado.reduce<Record<string, Pasto[]>>((acc, p) => {
                  (acc[p.tipo_uso] ??= []).push(p);
                  return acc;
                }, {}),
              ).map(([tipo, lista]) => (
                <GrupoTipo
                  key={tipo}
                  label={`${labelDoTipoUso(tipo)} — legado`}
                  pastos={lista}
                  onEdit={(p) => { setEditingPasto(p); setDialogOpen(true); }}
                  onToggle={(p, v) => toggleAtivo(p.id, v)}
                />
              ))}
            </div>
          )}

          {/* Rodapé: total dos pastos × área do cadastro da fazenda. Era informação
              que só existia na aba Área — aqui ela fica ao lado da soma que a produz. */}
          <div className="rounded-md border bg-card px-3 py-2 flex items-baseline justify-between flex-wrap gap-2">
            <span className="text-[11px] font-semibold">
              Total dos pastos: <span className="tabular-nums">{formatarAreaBR(somaPastos)} ha</span>
            </span>
            {areaTotalFazenda === null ? (
              <span className="text-[11px] text-muted-foreground">
                Área do cadastro da fazenda: — (não informada)
              </span>
            ) : (() => {
              const dif = somaPastos - areaTotalFazenda;
              const fecha = Math.abs(dif) < 0.005;
              return (
                <span className="text-[11px] tabular-nums">
                  <span className="text-muted-foreground">Cadastro da fazenda: {formatarAreaBR(areaTotalFazenda)} ha · </span>
                  <span className={fecha ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                    {fecha ? 'confere' : `divergência de ${formatarAreaBR(Math.abs(dif))} ha`}
                    {!fecha && (dif > 0 ? ' a mais nos pastos' : ' a menos nos pastos')}
                  </span>
                </span>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
