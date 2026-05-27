/**
 * MesaRowCompact — versão compacta de uma row da Mesa de Classificação
 * Excel (PR-UI-CompactMesa).
 *
 * 3 camadas:
 *   1. Linha compacta (sempre visível): badge status + data + valor +
 *      descrição truncada + ações condicionais + chevron.
 *   2. Expandido (CONTEXTO EXCEL × CLASSIFICAÇÃO OFICIAL): 2 cards
 *      lado-a-lado.
 *   3. Detalhes técnicos: grid label/valor com todos os campos do
 *      staging row (com "—" quando ausente).
 *
 * Regras visuais:
 *   - sem_match OU proposto_subcentro_existe_no_plano === false →
 *     Classificação Oficial em vermelho + ícone X (cobre os 2
 *     cenários do briefing #4 — alerta de órfão também fora de
 *     sem_match).
 *   - erro_apply só aparece no expandido (briefing #5).
 *   - Descrição/data/valor compactos usam lanc_* se houver lanc casado,
 *     senão excel_* (briefing #1 e #2).
 *   - Conta no Excel sempre mostra raw; no Oficial só mostra se
 *     lanc_id !== null (briefing #3).
 */
import type {
  ClassificacaoStagingPreviewRow,
  MatchStatus,
} from '@/v2/hooks/useClassificacaoStaging';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface MesaRowCompactProps {
  row: ClassificacaoStagingPreviewRow;
  expanded: boolean;
  /**
   * Arrays auxiliares (contas + fazendas) carregados — gate do botão
   * "Criar lançamento". Preserva o guard de PR-Mesa-A1: sem isso, o
   * botão fica habilitado mas o handleOpenCreate do pai aborta com
   * toast "Aguarde carregamento..." (UX ruim).
   */
  auxLoaded: boolean;
  onToggleExpand: () => void;
  onOpenCandidatos: () => void;
  onCreateLancamento: () => void;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  exato: 'Exato',
  ambiguo: 'Ambíguo',
  sem_match: 'Sem match',
  ja_classificado: 'Já classificado',
  divergente: 'Divergente',
};

const STATUS_BADGE_CLS: Record<MatchStatus, string> = {
  exato:           'bg-emerald-100 text-emerald-800 border-emerald-300',
  ja_classificado: 'bg-blue-100 text-blue-800 border-blue-300',
  ambiguo:         'bg-amber-100 text-amber-800 border-amber-300',
  divergente:      'bg-amber-100 text-amber-800 border-amber-300',
  sem_match:       'bg-red-100 text-red-800 border-red-300',
};

const STATUS_BORDER_LEFT: Record<MatchStatus, string> = {
  exato:           'border-l-emerald-600',
  ja_classificado: 'border-l-blue-600',
  ambiguo:         'border-l-amber-600',
  divergente:      'border-l-amber-600',
  sem_match:       'border-l-red-600',
};

function fmtDataCurta(s: string | null): string {
  if (!s) return '—';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}`;
}

function fmtDataCompleta(s: string | null): string {
  if (!s) return '—';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function fmtValor(v: number | null): string {
  return v != null ? formatMoeda(v) : '—';
}

function fmtTexto(s: string | null | undefined): string {
  return s && s.trim().length > 0 ? s : '—';
}

export function MesaRowCompact({
  row,
  expanded,
  auxLoaded,
  onToggleExpand,
  onOpenCandidatos,
  onCreateLancamento,
}: MesaRowCompactProps) {
  const status = row.match_status;
  const noLanc = !row.lanc_id;

  // Briefing #4: órfão reforça alerta mesmo fora de sem_match
  const isOrfao = row.proposto_subcentro_existe_no_plano === false;
  const isOficialErro = status === 'sem_match' || isOrfao;

  // Briefing #1: descrição compacta
  const compactDescricao = !noLanc && row.lanc_descricao
    ? row.lanc_descricao
    : [row.excel_fornecedor, row.excel_produto, row.excel_subcentro]
        .filter((s): s is string => !!s && s.trim().length > 0)
        .join(' · ') || '—';

  // Briefing #2: data/valor compactos
  const compactData = !noLanc ? row.lanc_data_pagamento : row.excel_data;
  const compactValor = !noLanc ? row.lanc_valor : row.excel_valor;

  // Conta resumida pra segunda linha mini
  const contaResumida = row.excel_conta_origem || row.excel_conta_destino || '—';

  return (
    <Card
      className={[
        'my-2 border-l-[3px]',
        STATUS_BORDER_LEFT[status],
        row.aplicado ? 'opacity-60' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* ─── Camada 1 — Linha compacta ──────────────────────────────── */}
      <div className="px-3 py-2">
        <div className="grid items-center gap-3" style={{ gridTemplateColumns: '92px 60px 90px 1fr auto' }}>
          {/* Badge status */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge
              variant="outline"
              className={`h-5 px-2 text-[10px] ${STATUS_BADGE_CLS[status]}`}
            >
              {STATUS_LABEL[status]}
            </Badge>
            {row.aplicado && (
              <Badge variant="default" className="h-5 px-1.5 text-[9px]">
                <Check className="h-2.5 w-2.5" />
              </Badge>
            )}
          </div>

          {/* Data DD/MM */}
          <div className="text-xs tabular-nums text-muted-foreground">
            {fmtDataCurta(compactData)}
          </div>

          {/* Valor R$ */}
          <div className="text-xs tabular-nums font-medium">
            {fmtValor(compactValor)}
          </div>

          {/* Descrição truncada */}
          <div
            className="text-xs truncate"
            title={compactDescricao}
          >
            {compactDescricao}
          </div>

          {/* Ações condicionais */}
          <div className="flex items-center gap-1">
            {status === 'sem_match' && !row.aplicado && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  disabled={!auxLoaded}
                  onClick={onCreateLancamento}
                  title={auxLoaded ? undefined : 'Aguarde carregamento de contas e fazendas...'}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Criar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  disabled
                  title="Em breve"
                >
                  Ignorar
                </Button>
              </>
            )}
            {(status === 'exato' || status === 'ja_classificado') && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                disabled
                title="Em breve"
              >
                Editar
              </Button>
            )}
            {(status === 'ambiguo' || status === 'divergente') && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={onOpenCandidatos}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Resolver
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onToggleExpand}
              aria-label={expanded ? 'Recolher' : 'Expandir'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Segunda linha mini — conta + subcentro Excel */}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <span className="truncate" title={contaResumida}>
            <span className="opacity-60">Conta:</span> {fmtTexto(contaResumida)}
          </span>
          <span className="opacity-40">•</span>
          <span className="truncate" title={row.excel_subcentro ?? ''}>
            <span className="opacity-60">Excel:</span> {fmtTexto(row.excel_subcentro)}
          </span>
          {row.excel_linha_origem != null && (
            <span className="opacity-40 ml-auto font-mono">
              L{row.excel_linha_origem}
            </span>
          )}
        </div>
      </div>

      {/* ─── Camada 2 + 3 — Expandido ──────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-dashed border-slate-200">
          {/* Camada 2: 2 cards lado-a-lado */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* CONTEXTO EXCEL (sempre neutro) */}
            <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Contexto Excel
              </div>
              <FieldLine label="Data" value={fmtDataCompleta(row.excel_data)} />
              <FieldLine label="Valor" value={fmtValor(row.excel_valor)} />
              <FieldLine label="Tipo" value={fmtTexto(row.excel_tipo_operacao)} />
              <FieldLine label="Fazenda" value={fmtTexto(row.excel_fazenda_codigo)} />
              <FieldLine label="Conta origem" value={fmtTexto(row.excel_conta_origem)} />
              <FieldLine label="Conta destino" value={fmtTexto(row.excel_conta_destino)} />
              <FieldLine label="Subcentro" value={fmtTexto(row.excel_subcentro)} mono />
              <FieldLine label="Fornecedor" value={fmtTexto(row.excel_fornecedor)} />
              <FieldLine label="Produto" value={fmtTexto(row.excel_produto)} />
            </div>

            {/* CLASSIFICAÇÃO OFICIAL (cor por status) */}
            <OficialPanel row={row} isOficialErro={isOficialErro} isOrfao={isOrfao} noLanc={noLanc} status={status} />
          </div>

          {/* Camada 3: detalhes técnicos */}
          <div className="border-t border-dashed border-slate-200 pt-2">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
              Detalhes técnicos
            </div>
            <div
              className="grid gap-x-3 gap-y-0.5 text-[10px]"
              style={{ gridTemplateColumns: '110px 1fr' }}
            >
              <DetailRow label="hash / staging_id" value={row.staging_id} mono />
              <DetailRow label="match_status" value={row.match_status} mono />
              <DetailRow label="match_score" value="—" mono />
              <DetailRow label="match_lancamento_id" value={fmtTexto(row.lanc_id)} mono />
              <DetailRow label="aplicado" value={row.aplicado ? 'sim' : 'não'} />
              <DetailRow label="alias_id_usado" value="—" mono />
              <DetailRow label="subcentro raw" value={fmtTexto(row.excel_subcentro)} mono />
              <DetailRow label="subcentro oficial" value={fmtTexto(row.proposto_subcentro)} mono />
              <DetailRow label="favorecido raw" value={fmtTexto(row.excel_fornecedor)} />
              <DetailRow label="favorecido oficial" value={fmtTexto(row.proposto_favorecido_nome)} />
              <DetailRow
                label="conta"
                value={fmtTexto(row.excel_conta_origem || row.excel_conta_destino)}
              />
              <DetailRow
                label="observação"
                value={
                  row.will_create_subcentro_orfao
                    ? 'Subcentro fora do plano oficial'
                    : (row.erro_apply ?? '—')
                }
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Subcomponentes locais ───────────────────────────────────────────

function FieldLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-[11px] flex items-baseline gap-1.5">
      <span className="opacity-60 shrink-0">{label}:</span>
      <span className={`min-w-0 truncate ${mono ? 'font-mono text-[10px]' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className={`truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </>
  );
}

interface OficialPanelProps {
  row: ClassificacaoStagingPreviewRow;
  isOficialErro: boolean;
  isOrfao: boolean;
  noLanc: boolean;
  status: MatchStatus;
}

function OficialPanel({ row, isOficialErro, isOrfao, noLanc, status }: OficialPanelProps) {
  // Decisão de cor + ícone líder do painel.
  let panelCls = 'rounded-md border p-3 space-y-1.5';
  let titleCls = 'text-[10px] uppercase tracking-wide font-semibold';
  let LeadIcon: typeof Check | typeof X | typeof AlertTriangle = Check;
  let leadIconCls = '';
  let leadText = '';

  if (isOficialErro) {
    panelCls += ' bg-red-50 border-red-300';
    titleCls += ' text-red-900';
    LeadIcon = X;
    leadIconCls = 'h-3.5 w-3.5 text-red-700';
    leadText = isOrfao && status !== 'sem_match'
      ? 'Subcentro fora do plano oficial'
      : 'Sem lançamento compatível';
  } else if (status === 'exato') {
    panelCls += ' bg-emerald-50 border-emerald-300';
    titleCls += ' text-emerald-900';
    LeadIcon = Check;
    leadIconCls = 'h-3.5 w-3.5 text-emerald-700';
    leadText = '1 lançamento compatível';
  } else if (status === 'ambiguo') {
    panelCls += ' bg-amber-50 border-amber-300';
    titleCls += ' text-amber-900';
    LeadIcon = AlertTriangle;
    leadIconCls = 'h-3.5 w-3.5 text-amber-700';
    leadText = 'Múltiplos candidatos no plano';
  } else if (status === 'divergente') {
    panelCls += ' bg-amber-50 border-amber-300';
    titleCls += ' text-amber-900';
    LeadIcon = AlertTriangle;
    leadIconCls = 'h-3.5 w-3.5 text-amber-700';
    leadText = 'Sistema e Excel divergem';
  } else if (status === 'ja_classificado') {
    panelCls += ' bg-blue-50 border-blue-300';
    titleCls += ' text-blue-900';
    LeadIcon = Check;
    leadIconCls = 'h-3.5 w-3.5 text-blue-700';
    leadText = 'Lançamento já classificado';
  } else {
    panelCls += ' bg-slate-50 border-slate-300';
    titleCls += ' text-slate-700';
    leadText = '';
  }

  return (
    <div className={panelCls}>
      <div className="flex items-center gap-1.5">
        <div className={titleCls}>Classificação Oficial</div>
      </div>

      {leadText && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <LeadIcon className={leadIconCls} />
          <span>{leadText}</span>
        </div>
      )}

      <FieldLine
        label="Subcentro"
        value={fmtTexto(row.proposto_subcentro)}
        mono
      />
      <FieldLine
        label="Favorecido"
        value={fmtTexto(row.proposto_favorecido_nome)}
      />
      {/* Briefing #3: conta oficial só se lanc_id !== null */}
      <FieldLine
        label="Conta sistema"
        value={
          noLanc
            ? '—'
            : fmtTexto(row.lanc_conta_bancaria_nome || row.lanc_conta_destino_nome)
        }
      />
      {/* Briefing #4: alerta extra de órfão mesmo fora de sem_match */}
      {isOrfao && status !== 'sem_match' && (
        <div className="flex items-start gap-1.5 mt-1 pt-1 border-t border-red-200 text-[10px] text-red-800">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-red-600" />
          <span>
            O subcentro proposto não existe em <code>financeiro_plano_contas</code>{' '}
            para este cliente — Apply NÃO gravaria mesmo sem o bloqueio anti-órfão.
          </span>
        </div>
      )}
      {/* Briefing #5: erro_apply só no expandido, dentro do Oficial */}
      {row.erro_apply && (
        <div className="flex items-start gap-1.5 mt-1 pt-1 border-t border-red-200 text-[10px] text-red-800">
          <X className="h-3 w-3 mt-0.5 shrink-0 text-red-700" />
          <span>
            <strong>Erro no apply:</strong> {row.erro_apply}
          </span>
        </div>
      )}
    </div>
  );
}
