import { useState, useMemo, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePastos, isPastoAtivoNoMes, type Pasto } from '@/hooks/usePastos';
import { formatarAreaBR, parseAreaBR } from '@/lib/areaBR';
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
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, MapPin, GripVertical, AlertTriangle, History, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TIPOS_USO_OPTIONS_AGRUPADAS, isTipoUsoValido, labelDoTipoUso, grupoDoTipoUso, corDoTipoUso,
  corTextoDoTipoUso,
} from '@/lib/pastos/tiposUso';
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
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
            <p className="text-[9px] leading-tight text-muted-foreground mt-1">
              Família:{' '}
              {familiaLabel
                ? <strong className="text-foreground font-medium">{familiaLabel}</strong>
                : <em>— legado</em>}
            </p>
            <p className="text-[9px] leading-tight text-muted-foreground mt-0.5">
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
              <p className="text-[9px] leading-tight text-muted-foreground mt-1">
                Vazio = todos os meses. Preenchido, o pasto passa a existir a partir desse mês.
              </p>
            </div>
            <div>
              <Label className="text-xs">Data de fim (opcional)</Label>
              <Input type="month" value={dataFimMes} onChange={e => setDataFimMes(e.target.value)} className="h-9" />
              {/* Texto diz o EFEITO REAL: data_fim é o filtro temporal soberano
                  de fn_pastos_aplicaveis_mes. */}
              <p className="text-[9px] leading-tight text-muted-foreground mt-1">
                Último mês de uso. Depois dele o pasto não gera card no fechamento nem entra
                na conta de área. Meses anteriores ficam intactos. Vazio = sem fim previsto.
              </p>
            </div>
          </div>
          {/* O switch MIGROU para cá, sob o Observações: como faixa horizontal própria
              custava ~32px de altura para usar 3% da largura, e a coluna direita era mais
              curta que a esquerda (duas datas empilhadas). Ocupa folga que já existia. */}
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                className="text-xs min-h-[120px] resize-none"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Observações gerais..."
              />
            </div>
            {/* entra_conciliacao aposentado em 19/08/2026 (PR-PASTO-VIGENCIA-02): a vigência
                (data_inicio/data_fim) + ativo já respondem "este pasto vale neste mês?".
                Como interruptor manual ele escondia o pasto INCLUSIVE nos meses em que existiu.
                Esse é o motivo, e é o único: a taxonomia exclui reserva/APP/benfeitorias do
                CÁLCULO DE ÁREA pelo tipo_uso, não da lista do Fechamento — todo pasto vira
                card, com destino fixo (decisão de produto, 19/08/2026).
                Coluna mantida no banco forçada a true; não reintroduzir na UI. */}
          </div>
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
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0.5">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        {/* No modo manual o destino não aparecia em lugar nenhum: arrastava-se um pasto
            sem saber se era Cria ou Vedado. */}
        <Badge variant="outline" className={`text-[9px] px-1 py-0 leading-tight ${corDoTipoUso(pasto.tipo_uso)}`}>
          {labelDoTipoUso(pasto.tipo_uso)}
        </Badge>
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

/* Piso de 220px na coluna de rotulo (era minmax(0,1.4fr), sem piso): com
   `truncate` no label, "INFRAESTRUTURA" saia como "INFRAESTRU..." e
   "Divergencia Campo" tambem cortava. 220px cobrem o pior caso pedido —
   chevron (12) + gap (4) + "Divergencia Campo" em text-xs bold uppercase
   com tracking-wide (~140) + gap (4) + a contagem shrink-0 (~50).
   O piso NAO desalinha nada: GRID_LINHA e a MESMA grade da familia, do
   tipo, da linha de pasto, do cabecalho de colunas e do total — os cinco
   deslocam juntos. Os cinco tracks "em breve" tem piso zero, entao a
   grade so passa a transbordar abaixo de ~480px de largura util.
   "Legado — fora da taxonomia" (26 caracteres) SEGUE truncando: caberia
   so com ~330px, e o briefing pediu duas etiquetas, nao esta. */
const GRID_LINHA =
  'minmax(220px,1.4fr) 96px repeat(5, minmax(0,0.8fr)) 108px';

/* Item 6 — cor por FAMILIA, no texto do rotulo. Nao e derivada de
   corDoTipoUso: aquela funcao responde por DESTINO (cria verde, recria
   laranja, engorda azul, reforma vermelho) e essas cores permanecem
   intactas um nivel abaixo. Familia sem entrada cai em text-foreground,
   nunca em string vazia — apagar a cor sem avisar seria pior que herdar.
   Divergencia e legado NAO entram aqui: sao alerta, nao familia, e
   mantem o ambar proprio. */
const COR_FAMILIA: Record<string, string> = {
  pecuaria: 'text-success',
  /* text-meta (25 85% 45%) e nao text-cta: o --cta e amarelo de FUNDO de
     botao (mesmo valor literal de --warning, 43 87% 63%) e le fraco como
     texto sobre branco. Mesma razao pela qual o token --meta foi criado em
     fb72b86e. O amarelo permanece onde e fundo. */
  agricultura: 'text-meta',
  silvicultura: 'text-primary',
  ambiental: 'text-muted-foreground',
  infraestrutura: 'text-muted-foreground',
};

/**
 * Percentual de `valor` sobre `base`, com uma casa. Base zero ou ausente devolve
 * `—`, nunca "0,0%": sem denominador não há proporção, e zero por cento seria
 * afirmar uma que não existe (sentinela do projeto).
 */
function percentualBR(valor: number, base: number | null | undefined): string {
  if (!base || base <= 0) return '—';
  return `${(valor / base * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function LinhaPasto({
  pasto, zebra, onEdit, onToggle,
}: { pasto: Pasto; zebra: boolean; onEdit: () => void; onToggle: (v: boolean) => void }) {
  return (
    /* Zebra vem de `zebra`, calculado em JS, NAO de odd:/even: do CSS. As
       variantes do CSS contam irmaos do MESMO pai, e cada destino renderiza
       seus pastos em container proprio: a alternancia reiniciaria a cada
       destino e o ultimo pasto da Cria sairia da mesma cor que o primeiro da
       Recria. Foi exatamente o defeito de 7a6fd296 na Composicao da Area. */
    <div
      className={`grid gap-2 items-center px-2 py-0.5 border-b last:border-b-0 hover:bg-muted/40 leading-tight ${zebra ? 'bg-muted/30' : 'bg-card'} ${!pasto.ativo ? 'opacity-45' : ''}`}
      style={{ gridTemplateColumns: GRID_LINHA }}
    >
      {/* Terceiro degrau do recuo: familia 0, destino pl-4, pasto pl-8. O recuo
          fica DENTRO da primeira celula, nunca no container — padding no
          container mudaria a largura disponivel e os tracks `fr` seriam
          calculados sobre bases diferentes em cada nivel. */}
      <span className="text-[10px] font-medium truncate pl-8" title={pasto.nome}>{pasto.nome}</span>
      <span className="text-[10px] font-medium tabular-nums text-right">
        {formatarAreaBR(pasto.area_produtiva_ha ?? null) || '—'}
      </span>
      {COLUNAS_EM_BREVE.map(c => (
        <span key={c} className="text-[10px] text-muted-foreground/40 truncate" title={`${c} — em breve`}>—</span>
      ))}
      <div className="flex items-center justify-end gap-0.5">
        {pasto.observacoes && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 leading-tight" title={pasto.observacoes}>Obs</Badge>
        )}
        {/* h-4 no wrapper: o scale-[0.6] do Switch é transformação visual e não
            reduz a altura que ele ocupa no layout — sem isto, ele é quem define a
            altura da linha inteira. */}
        <div className="h-4 flex items-center">
          <Switch checked={pasto.ativo} onCheckedChange={onToggle} className="scale-[0.6] origin-center" />
        </div>
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0 h-4 w-4 flex items-center justify-center" title="Editar">
          <Edit2 className="h-3 w-3" />
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

/**
 * PR-AREA-LISTA-02 — nível MACRO colapsável (família, Divergência, Legado).
 *
 * Precisa ser componente, não JSX inline no `.map()`: cada bloco tem estado próprio
 * de aberto/fechado, e hook dentro de callback de map não é permitido.
 *
 * O cabeçalho vem do chamador como função de `chevron`, para que cada bloco decida
 * ONDE encaixá-lo. Nas famílias isso importa: o cabeçalho é um grid com GRID_LINHA,
 * e um chevron como filho direto ocuparia a coluna de área. Ele entra dentro da
 * primeira célula, ao lado do rótulo — visualmente à esquerda, sem quebrar o
 * alinhamento das colunas.
 *
 * Nasce FECHADO, como o GrupoTipo desde o PR-UI-PASTOS-HIERARQUIA-01: com 68 pastos
 * a lista era uma parede antes de o operador escolher o que ver. Bloco VAZIO
 * continua aparecendo, recolhido — a regra do grupo vazio vale nos dois níveis.
 */
function BlocoColapsavel({
  botaoClassName, cabecalho, style, children,
}: {
  botaoClassName: string;
  cabecalho: (chevron: ReactNode) => ReactNode;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const chevron = aberto
    ? <ChevronDown className="h-3 w-3 shrink-0" />
    : <ChevronRight className="h-3 w-3 shrink-0" />;
  return (
    <div className="space-y-0.5">
      <button type="button" onClick={() => setAberto(!aberto)} className={botaoClassName} style={style}>
        {cabecalho(chevron)}
      </button>
      {aberto && children}
    </div>
  );
}

/** Um tipo de uso dentro de uma família. Vazio aparece, recolhido. */
function GrupoTipo({
  tipo, label, pastos: doTipo, basePercentual, zebraOffset = 0, onEdit, onToggle,
}: { tipo: string; label: string; pastos: Pasto[]; basePercentual?: number; zebraOffset?: number; onEdit: (p: Pasto) => void; onToggle: (p: Pasto, v: boolean) => void }) {
  // PR-PASTOS-LISTA-01 — grupo VAZIO aparece recolhido, nunca omitido: um
  // "Reserva Legal · 0 pastos" é INFORMAÇÃO, não ausência dela. Omitir esconderia
  // exatamente a lacuna que esta frente quer tornar visível — a repartição só fecha
  // quando reserva, APP e benfeitorias existem como pasto.
  const vazio = doTipo.length === 0;
  // PR-UI-PASTOS-HIERARQUIA-01 — a lista abre TODA recolhida. Com a taxonomia
  // completa (5 famílias, até 10 destinos), abrir tudo por padrão produz uma
  // parede de linhas antes de o operador decidir o que quer ver. A regra do
  // grupo VAZIO permanece: ele APARECE, recolhido — omiti-lo esconderia a
  // lacuna que a lista quer tornar visível.
  const [aberto, setAberto] = useState(false);
  const somaHa = doTipo.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0);

  // PR-UI-PASTOS-BLOCO-01 — a caixa (border rounded-md) saiu daqui e foi para o
  // container da família: cinco destinos com moldura própria liam-se como cinco
  // ilhas, e a família não se lia como unidade. Aqui fica só o overflow.
  // PR-PASTOSTAB-01 — a caixa da FAMÍLIA também saiu: a hierarquia agora é
  // recuo progressivo dentro de um bloco só, sem moldura envolvendo destino.
  return (
    <div className="overflow-hidden">
      {/* PR-CORES-TEXTO-01 — a cor sai da BARRA e fica só no TEXTO do label.
          O HIERARQUIA-01 tinha levado o pacote de badge para a linha inteira; a regra
          do produto é cor em título e subtítulo, nunca tint na linha. A barra perde
          fundo, texto e borda; o que separa as faixas é o divide-y do container da
          família, que já existe desde o BLOCO-01. */}
      {/* PR-PASTOSTAB-01 itens 2 e 3 — o cabeçalho do destino deixa de ser flex com
          texto corrido encostado na borda direita e passa a ser a MESMA grade da
          família (GRID_LINHA), com a MESMA anatomia: contagem ao lado do rótulo na
          primeira célula, área na segunda, percentual na terceira. Família e destino
          passam a ler na mesma vertical.
          Segundo degrau do recuo: pl-4 DENTRO da primeira célula. Fora dela,
          deslocaria a base dos tracks `fr` e quebraria justamente o alinhamento
          que este item constrói. */}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full text-left grid gap-2 px-2 py-0.5 items-baseline font-medium hover:bg-muted/40"
        style={{ gridTemplateColumns: GRID_LINHA }}
      >
        <span className="flex items-baseline gap-1 min-w-0 pl-4">
          {aberto ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {/* Cor mantida também no grupo VAZIO: "Reserva Legal · 0 pastos" é informação,
              e apagar a cor dele o esconderia de novo — o oposto do que a lista quer. */}
          <span className={`text-[11px] font-semibold truncate ${corTextoDoTipoUso(tipo)}`}>
            {label}
          </span>
          {/* A contagem herdava a cor do BOTÃO, que agora não tem nenhuma — sem isto ela
              cairia na cor de texto padrão, mais forte que o label colorido ao lado.
              Vazio segue mais esmaecido: ali a informação é a AUSÊNCIA, não o destino. */}
          <span className={`text-[10px] tabular-nums shrink-0 whitespace-nowrap ${vazio ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
            {doTipo.length} pasto{doTipo.length !== 1 ? 's' : ''}
          </span>
        </span>
        <span className="text-[11px] tabular-nums font-semibold text-foreground text-right">
          {formatarAreaBR(somaHa)}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground pl-2">
          {percentualBR(somaHa, basePercentual)}
        </span>
      </button>
      {aberto && !vazio && (
        <div>
          <CabecalhoColunas />
          {doTipo.map((p, i) => (
            <LinhaPasto
              key={p.id}
              pasto={p}
              /* Índice CORRIDO na família (offset + i), não o índice local: é o que
                 impede a zebra de reiniciar na virada de destino. */
              zebra={(zebraOffset + i) % 2 === 0}
              onEdit={() => onEdit(p)}
              onToggle={(v) => onToggle(p, v)}
            />
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

export function PastosTab({ hostBarra }: { hostBarra?: HTMLElement | null } = {}) {
  const { pastos, loading, criarPasto, editarPasto, toggleAtivo, reorderPastos } = usePastos();
  const { isGlobal, fazendaAtual } = useFazenda();
  const { canEdit } = usePermissions();

  /* PR-AREA-REGENERAR-01J — o lote de regeneracao de area mora AQUI, no cadastro de
     pastos, e nao no fechamento de um mes: ele varre TODOS os meses da fazenda. */
  const [confirmLoteOpen, setConfirmLoteOpen] = useState(false);
  const [lotePreparando, setLotePreparando] = useState(false);
  const [loteMeses, setLoteMeses] = useState<string[]>([]);
  const [loteProgresso, setLoteProgresso] = useState(0);
  const [loteRodando, setLoteRodando] = useState(false);
  const [loteRelatorio, setLoteRelatorio] = useState<LoteRelatorio | null>(null);
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

  // Vigência (data_inicio/data_fim) é UM conjunto, usado por DOIS consumidores:
  // o agrupamento e o total do rodapé. Filtrar só no agrupamento deixaria o
  // "Total dos pastos" contando pasto encerrado — foi assim que a Pureza
  // acusava 4.725,96 contra matrícula de 4.656,20, os 69,76 ha de IND.05 e
  // IND.06, desmembrados para o Retiro Agricultura em 2025-05-31.
  // `ativo` continua em `filtered`, separado: vigência e ativo são coisas
  // diferentes, e só esta tela tem o modo "Inativos".
  const vigentes = useMemo(
    () => filtered.filter(p => isPastoAtivoNoMes(p, mesCorrente)),
    [filtered, mesCorrente],
  );

  // `mesCorrente` vai TAMBÉM para a função, como o briefing pede: a filtragem
  // é idempotente (mesmo predicado, mesmo mês) e deixa a regra explícita na
  // chamada, sem depender de quem montou `vigentes` acima.
  const agrupado = useMemo(
    () => agruparPastosPorFamilia(vigentes, mesCorrente),
    [vigentes, mesCorrente],
  );

  const somaPastos = useMemo(
    () => vigentes.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0),
    [vigentes],
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
        {showInativos && <Badge variant="outline" className="text-[10px]">{pastos.length} total</Badge>}
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
  );

  return (
    <div className="p-3 pt-1 pb-20 space-y-2">
      {/* A barra é a MESMA em qualquer lugar; só o destino do render muda. Pai que
          passa hostBarra a recebe ao lado das abas; pai que não passa (CadastrosTab)
          continua com ela no topo do próprio conteúdo, como sempre. O portal preserva
          a árvore React — estado, contexto e eventos seguem dentro do PastosTab. */}
      {hostBarra ? createPortal(barra, hostBarra) : barra}

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
        <div className="space-y-1">
          {/* Item 7 — título do agrupamento, com a MESMA palavra do botão do toggle
              ("Por destino", na barra): a lista deixa de começar sem sujeito, e o
              rótulo repetido amarra o que se vê ao modo que o produziu. */}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pb-0.5">
            Por destino
          </p>
          {/* PR-AREA-LISTA-03 — moldura contínua: com tudo recolhido, as cinco famílias
              eram cinco linhas soltas no branco. Antes o bloco de destinos abaixo de cada
              uma dava a estrutura; recolhido, sumiu. divide-y no mesmo idioma do container
              de destinos, para a lista recolhida ler como UMA tabela.
              O alinhamento sobrevive porque o border do container desloca cabeçalho e
              linhas de pasto JUNTOS — os dois ganham o mesmo 1px. */}
          <div className="divide-y divide-border/40 border rounded-md overflow-hidden">
          {agrupado.familias.map(f => (
            /* PR-UI-PASTOS-BLOCO-01 item 5 — o cabeçalho usa a MESMA grade das linhas
               de pasto (GRID_LINHA), para o total da família cair exatamente sob a
               coluna "Área (ha)".
               Alinhar exige que a LARGURA DISPONÍVEL seja idêntica à das linhas, senão
               os tracks `fr` são calculados sobre bases diferentes. As linhas ficam
               dentro do bloco: ml-2 (8px) + borda (1px) + px-2 (8px). O cabeçalho
               reproduz os três — daí o `border border-transparent`, que não desenha
               nada e existe só para igualar a caixa. Alinhamento exato, sem calc.
               PR-AREA-LISTA-02: o chevron entra DENTRO da primeira célula, não como
               filho do grid — como filho ele ocuparia a coluna de área. */
            <BlocoColapsavel
              key={f.grupo}
              botaoClassName="w-full text-left grid gap-2 px-2 py-1 ml-2 border border-transparent items-baseline hover:bg-muted/40"
              style={{ gridTemplateColumns: GRID_LINHA }}
              cabecalho={(chevron) => (<>
                {/* PR-AREA-LISTA-03 — a contagem truncava ("0 pastoc") porque o `truncate`
                    estava no CONTAINER FLEX: text-overflow não se aplica a filhos de flex,
                    então eles eram cortados no meio da letra, sem reticências. O truncate
                    vai para o texto do rótulo (curto, raramente corta) e a contagem ganha
                    shrink-0: ela nunca mais cede largura. Sem mexer no track — alargá-lo
                    deslocaria a coluna de área e quebraria o alinhamento com as linhas
                    de pasto, que é o que o BLOCO-01 construiu. */}
                <span className="flex items-baseline gap-1 min-w-0">
                  {chevron}
                  <span className={`text-xs uppercase tracking-wide font-bold truncate ${COR_FAMILIA[f.grupo] ?? 'text-foreground'}`}>
                    {f.label}
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground shrink-0 whitespace-nowrap">
                    {f.qtd} pasto{f.qtd !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-xs tabular-nums font-semibold text-foreground text-right">
                  {formatarAreaBR(f.somaHa)}
                </span>
                {/* Percentual da família sobre a SOMA DOS PASTOS da fazenda — não sobre
                    o cadastro. A soma dos pastos é a base do sistema; o cadastro é que
                    deve puxar dela, e não o contrário. */}
                <span className="text-[10px] tabular-nums text-muted-foreground pl-2">
                  {percentualBR(f.somaHa, somaPastos)}
                </span>
              </>)}
            >
              {/* PR-PASTOSTAB-01 item 2 — a moldura da família SAIU: `border` virou
                  `border-transparent`. A caixa deixa de ser desenhada, mas a
                  GEOMETRIA fica: ml-2 (8px) + borda (1px) são exatamente o que
                  alinha as linhas de pasto com o cabeçalho da família. Trocar por
                  nada desalinharia 9px a coluna de área. Hierarquia agora é recuo
                  progressivo — família 0, destino pl-4, pasto pl-8 — dentro do
                  bloco único que a lista inteira já é. */}
              <div className="divide-y divide-border/30 border border-transparent overflow-hidden ml-2">
                {f.tipos.map((t, i) => (
                  <GrupoTipo
                    key={t.tipo}
                    tipo={t.tipo}
                    label={t.label}
                    pastos={t.pastos}
                    basePercentual={f.somaHa}
                    /* Zebra CORRIDA na família: soma dos pastos dos destinos
                       anteriores. Sem isto a alternância reinicia a cada destino. */
                    zebraOffset={f.tipos.slice(0, i).reduce((acc, x) => acc + x.pastos.length, 0)}
                    onEdit={(p) => { setEditingPasto(p); setDialogOpen(true); }}
                    onToggle={(p, v) => toggleAtivo(p.id, v)}
                  />
                ))}
              </div>
            </BlocoColapsavel>
          ))}

          {/* Divergência do Campeiro: bloco próprio, antes do legado genérico.
              É valor OPERANTE (a linha que fecha a conta da fazenda), não resíduo —
              merece nome e lugar seus, não ser diluído em "fora da taxonomia". */}
          {agrupado.divergencia.length > 0 && (
            /* PR-AREA-LISTA-03 — mesma grade e mesmas trilhas das famílias. O âmbar
               fica SÓ no texto do rótulo: é o sinal de "fora da taxonomia" e permanece,
               sem fundo colorido e sem alinhamento próprio. */
            <BlocoColapsavel
              botaoClassName="w-full text-left grid gap-2 px-2 py-1 ml-2 border border-transparent items-baseline hover:bg-muted/40"
              style={{ gridTemplateColumns: GRID_LINHA }}
              cabecalho={(chevron) => (<>
                <span className="flex items-baseline gap-1 min-w-0">
                  {chevron}
                  <span className="text-xs uppercase tracking-wide font-bold text-amber-700 truncate">
                    Divergência Campo
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground shrink-0 whitespace-nowrap">
                    {agrupado.divergencia.length} pasto{agrupado.divergencia.length !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-xs tabular-nums font-semibold text-foreground text-right">
                  {formatarAreaBR(agrupado.divergencia.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0))}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground pl-2">
                  {percentualBR(agrupado.divergencia.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0), somaPastos)}
                </span>
              </>)}
            >
              {/* Mesma anatomia das famílias (item 2): sem desenho de caixa, com a
                  geometria ml-2 + 1px que alinha as linhas de pasto. */}
              <div className="divide-y divide-border/30 border border-transparent overflow-hidden ml-2">
                <GrupoTipo
                  tipo="divergencia"
                  label="Pendente"
                  pastos={agrupado.divergencia}
                  basePercentual={agrupado.divergencia.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0)}
                  onEdit={(p) => { setEditingPasto(p); setDialogOpen(true); }}
                  onToggle={(p, v) => toggleAtivo(p.id, v)}
                />
              </div>
            </BlocoColapsavel>
          )}

          {/* Legado ao final: qualquer OUTRO valor fora da taxonomia oficial (ex.: 'pecuaria').
              Fica visível e editável — reclassificar é ato explícito do operador.

              O nome genérico é deliberado: este balde recebe qualquer tipo_uso desconhecido,
              e chamá-lo de "Divergência Campo" rotularia um pasto 'pecuaria' como divergência
              de campo, que é falso. Divergência tem bloco próprio acima; aqui cada valor
              aparece com o nome real que tem no banco. */}
          {agrupado.legado.length > 0 && (
            <BlocoColapsavel
              botaoClassName="w-full text-left grid gap-2 px-2 py-1 ml-2 border border-transparent items-baseline hover:bg-muted/40"
              style={{ gridTemplateColumns: GRID_LINHA }}
              cabecalho={(chevron) => (<>
                <span className="flex items-baseline gap-1 min-w-0">
                  {chevron}
                  <span className="text-xs uppercase tracking-wide font-bold text-amber-700 truncate">
                    Legado — fora da taxonomia
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground shrink-0 whitespace-nowrap">
                    {agrupado.legado.length} pasto{agrupado.legado.length !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-xs tabular-nums font-semibold text-foreground text-right">
                  {formatarAreaBR(agrupado.legado.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0))}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground pl-2">
                  {percentualBR(agrupado.legado.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0), somaPastos)}
                </span>
              </>)}
            >
              <div className="divide-y divide-border/30 border border-transparent overflow-hidden ml-2">
              {Object.entries(
                agrupado.legado.reduce<Record<string, Pasto[]>>((acc, p) => {
                  (acc[p.tipo_uso] ??= []).push(p);
                  return acc;
                }, {}),
              ).map(([tipo, lista], i, todos) => (
                <GrupoTipo
                  key={tipo}
                  tipo={tipo}
                  label={`${labelDoTipoUso(tipo)} — legado`}
                  pastos={lista}
                  basePercentual={agrupado.legado.reduce((s, p) => s + (p.area_produtiva_ha ?? 0), 0)}
                  zebraOffset={todos.slice(0, i).reduce((acc, [, l]) => acc + l.length, 0)}
                  onEdit={(p) => { setEditingPasto(p); setDialogOpen(true); }}
                  onToggle={(p, v) => toggleAtivo(p.id, v)}
                />
              ))}
              </div>
            </BlocoColapsavel>
          )}

          </div>

          {/* PR-AREA-LISTA-02 item 4 — o total é a ÚLTIMA LINHA DA TABELA, não uma barra
              à parte: usa o MESMO GRID_LINHA das famílias, com o mesmo `border
              border-transparent` que iguala a caixa, para o número cair sob a coluna
              de área onde estão 2.778,25 / 740,12 / 147,17.
              A comparação contra o cadastro fica ao LADO, em peso menor: é comentário
              sobre o total, não parte dele.
              PR-FIX-PASTOS-RODAPE-01 — o número comparado passou a ser a MATRÍCULA
              (fazenda_cadastros.area_total_ha), a mesma que a aba Cadastro exibe. Antes
              vinha da soma das seis colunas de família, que nenhuma tela edita desde o
              77cec994 — as duas abas mostravam números diferentes para a mesma fazenda. */}
          <div
            className="grid gap-2 px-2 ml-2 border border-transparent border-t-border items-baseline pt-1.5 mt-1"
            style={{ gridTemplateColumns: GRID_LINHA }}
          >
            {/* Sem truncate: "TOTAL DOS PASTOS" cortava. tracking-wide no lugar de
                widest devolve a largura sem tocar no tamanho da fonte — é fechamento,
                não mais uma família, e a régua acima (border-t-border) diz isso. */}
            <span className="text-sm uppercase tracking-wide font-bold text-foreground whitespace-nowrap">
              Total dos pastos
            </span>
            <span className="text-sm tabular-nums font-bold text-foreground text-right">
              {formatarAreaBR(somaPastos)}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground pl-2">
              {somaPastos > 0 ? '100,0%' : '—'}
            </span>
          </div>
          <div className="px-2 ml-2">
            {areaTotalFazenda === null ? (
              <span className="text-[10px] text-muted-foreground">
                Matrícula: — (não informada)
              </span>
            ) : (() => {
              const dif = somaPastos - areaTotalFazenda;
              const fecha = Math.abs(dif) < 0.005;
              // PR-FIX-PASTOS-RODAPE-02 — TRÊS estados, não dois. Achatar divergência
              // e "não conferida" na mesma cor perderia informação: são coisas
              // diferentes e podem coexistir.
              //   |Δ| >= 0,01              → VERMELHO. Divergência é divergência,
              //                              conferida ou não.
              //   |Δ| < 0,01 e conferida   → VERDE.
              //   |Δ| < 0,01 e NÃO conf.   → ÂMBAR. Diferença zero contra número que
              //                              ninguém conferiu é conferência APARENTE.
              // Sem botão nem data aqui: o lugar de conferir é a aba Cadastro, e
              // repetir a ação criaria um segundo caminho para o mesmo estado.
              const cor = !fecha
                ? 'text-red-700'
                : matriculaConferida ? 'text-emerald-700' : 'text-amber-700';
              return (
                <span className="text-[10px] tabular-nums">
                  <span className="text-muted-foreground">Matrícula: {formatarAreaBR(areaTotalFazenda)} ha · </span>
                  <span className={`${cor} font-semibold`}>
                    {fecha ? 'confere' : `divergência de ${formatarAreaBR(Math.abs(dif))} ha`}
                    {!fecha && (dif > 0 ? ' a mais nos pastos' : ' a menos nos pastos')}
                  </span>
                  {!matriculaConferida && (
                    <span className="text-muted-foreground"> · não conferida</span>
                  )}
                </span>
              );
            })()}
          </div>
        </div>
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
