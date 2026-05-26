/**
 * MesaClassificacaoTab — UI da tab "Classificação Excel" na Mesa Operacional.
 *
 * Usa parser PRÓPRIO `parseExcelClassificacao` (PR-M2.1) — validação
 * mínima (linha rejeitada só se faltar Data_Ref/Valor/Tipo/Subcentro).
 *
 * PR-M4: tabela 3-zonas (Excel · Sistema · Proposta) baseada na view
 * `vw_classificacao_staging_preview`. Header explicativo com contagens
 * + checkbox de confirmação + drawer de candidatos para ambíguos.
 *
 * Fluxo:
 *   1. Operador escolhe arquivo (input file accept=.xlsx)
 *   2. handleSelectFile reseta TUDO
 *   3. parseExcelClassificacao → exibe contagens + botão "Popular staging"
 *   4. Click "Popular" → crypto.randomUUID() → setSessaoId → populate RPC
 *   5. Operador revisa tabela 3-zonas + clica candidatos em ambíguos
 *   6. Marca checkbox "Revisei…" → Click "Aplicar exatos (N)" → apply RPC
 */
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Play, AlertTriangle, FileX, Trash2, ExternalLink, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import {
  parseExcelClassificacao,
  type ClassificacaoParseResult,
} from '@/v2/lib/excelPreview/parserClassificacao';
import {
  useClassificacaoStaging,
  type MatchStatus,
  type ClassificacaoStagingPreviewRow,
} from '@/v2/hooks/useClassificacaoStaging';
import { MesaClassificacaoCandidatosDrawer } from './MesaClassificacaoCandidatosDrawer';
import { formatMoeda } from '@/lib/calculos/formatters';

const STATUS_ORDER: MatchStatus[] = [
  'exato',
  'divergente',
  'ja_classificado',
  'ambiguo',
  'sem_match',
];

const STATUS_LABEL: Record<MatchStatus, string> = {
  exato: 'Exato',
  divergente: 'Divergente',
  ja_classificado: 'Já classificado',
  ambiguo: 'Ambíguo',
  sem_match: 'Sem match',
};

const STATUS_BADGE_CLS: Record<MatchStatus, string> = {
  exato: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  divergente: 'bg-amber-100 text-amber-800 border-amber-300',
  ja_classificado: 'bg-blue-100 text-blue-800 border-blue-300',
  ambiguo: 'bg-orange-100 text-orange-800 border-orange-300',
  sem_match: 'bg-red-100 text-red-800 border-red-300',
};

// PR-M4 A2: mensagem auto-explicativa por status, exibida sob o badge.
const STATUS_MESSAGE: Record<MatchStatus, string> = {
  exato: '1 lançamento compatível encontrado.',
  ja_classificado: 'Lançamento já possui classificação.',
  divergente: 'Sistema e Excel possuem classificações diferentes.',
  ambiguo: 'Mais de um lançamento compatível encontrado.',
  sem_match: 'Nenhum lançamento compatível encontrado.',
};

// PR-M4 ajuste: flags will_set_* da view são condicionais — "se a row
// fosse processada, gravaria isso". Mas fn_classificacao_apply filtra
// match_status='exato' AND aplicado=false AND match_lancamento_id IS NOT NULL.
// Em rows fora de 'exato' a flag é informativa, NÃO ação — não usar verde
// "Gravará". Mostrar badge muted com explicação de por que não processa.
const STATUS_APPLY_NAO_PROCESSA: Partial<Record<MatchStatus, string>> = {
  divergente:      'Apply não processa rows divergentes',
  ja_classificado: 'Apply não processa rows já classificadas',
  ambiguo:         'Apply não processa rows ambíguas',
  sem_match:       'Apply não processa rows sem match',
};

function fmtData(s: string | null): string {
  if (!s) return '-';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function MesaClassificacaoTab() {
  const { clienteAtual } = useCliente();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lote, setLote] = useState<ClassificacaoParseResult | null>(null);
  const [errosParser, setErrosParser] = useState<Array<{ linha: number; motivo: string }>>([]);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<MatchStatus | 'todos'>('todos');
  const [parsing, setParsing] = useState(false);
  const [confirmadoCheckbox, setConfirmadoCheckbox] = useState(false);

  // PR-M4 — drawer de candidatos
  const [drawerStagingId, setDrawerStagingId] = useState<string | null>(null);

  const {
    staging,
    isLoading,
    isFetching,
    populate,
    isPopulating,
    populateResult,
    apply,
    isApplying,
    applyResult,
  } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

  const countsPorStatus = useMemo(() => {
    const c: Record<MatchStatus, number> = {
      exato: 0,
      ambiguo: 0,
      sem_match: 0,
      ja_classificado: 0,
      divergente: 0,
    };
    for (const r of staging) c[r.match_status] = (c[r.match_status] ?? 0) + 1;
    return c;
  }, [staging]);

  const rowsFiltradas = useMemo(() => {
    if (filtroStatus === 'todos') return staging;
    return staging.filter((r) => r.match_status === filtroStatus);
  }, [staging, filtroStatus]);

  // PR-M4 — contagens do header (todas em 'exato' && !aplicado)
  const headerStats = useMemo(() => {
    const exatos = staging.filter((r) => r.match_status === 'exato' && !r.aplicado);
    return {
      total: exatos.length,
      n1_subcentro: exatos.filter((r) => r.will_set_subcentro).length,
      n2_favorecido: exatos.filter((r) => r.will_set_favorecido).length,
      n3_no_change: exatos.filter((r) => !r.will_change_anything).length,
    };
  }, [staging]);

  function resetSessao() {
    setArquivo(null);
    setLote(null);
    setErrosParser([]);
    setSessaoId(null);
    setFiltroStatus('todos');
    setConfirmadoCheckbox(false);
    setDrawerStagingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSelectFile(file: File | null) {
    resetSessao();
    if (!file) return;
    setArquivo(file);
    setParsing(true);
    try {
      const parsed = await parseExcelClassificacao(file);
      setLote(parsed);
      setErrosParser(parsed.erros);
      if (parsed.linhasValidas === 0 && parsed.linhasComErro > 0) {
        toast.error(`Nenhuma linha válida — todas as ${parsed.linhasComErro} linhas foram rejeitadas.`);
      } else if (parsed.linhasComErro > 0) {
        toast.warning(`${parsed.linhasValidas} linha(s) válida(s) · ${parsed.linhasComErro} rejeitada(s) — revisar antes de popular.`);
      } else {
        toast.success(`Excel lido: ${parsed.linhasValidas} linha(s) válida(s).`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro ao ler Excel: ${msg}`);
      setErrosParser([{ linha: 0, motivo: msg }]);
    } finally {
      setParsing(false);
    }
  }

  async function handlePopular() {
    if (!lote || !clienteAtual?.id) {
      toast.error('Carregue um Excel e selecione o cliente antes de popular.');
      return;
    }
    const novaSessao = crypto.randomUUID();
    const rows = lote.rows;
    try {
      setSessaoId(novaSessao);
      setConfirmadoCheckbox(false);
      const res = await populate({ sessao_id: novaSessao, rows });
      const totais = Object.entries(res.counts_por_status ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      toast.success(`Staging populada (${res.inseridas} linhas). ${totais}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro no populate: ${msg}`);
    }
  }

  async function handleAplicar() {
    if (!sessaoId) return;
    try {
      const res = await apply(sessaoId);
      if (res.erros > 0) {
        toast.warning(
          `Apply: ${res.aplicados} aplicado(s), ${res.pulados_subcentro_preenchido} pulado(s), ${res.erros} erro(s).`,
        );
      } else {
        toast.success(
          `Apply: ${res.aplicados} aplicado(s)${res.pulados_subcentro_preenchido > 0 ? ` · ${res.pulados_subcentro_preenchido} pulado(s)` : ''}.`,
        );
      }
      setConfirmadoCheckbox(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro no apply: ${msg}`);
    }
  }

  // Contexto do drawer (encontra a row do staging_id ativo)
  const drawerContexto = useMemo(() => {
    if (!drawerStagingId) return null;
    const row = staging.find((r) => r.staging_id === drawerStagingId);
    if (!row) return null;
    return {
      linha: row.excel_linha_origem,
      data: row.excel_data,
      valor: row.excel_valor,
      tipo_operacao: row.excel_tipo_operacao,
      conta_origem: row.excel_conta_origem,
      conta_destino: row.excel_conta_destino,
      subcentro: row.excel_subcentro,
      fornecedor: row.excel_fornecedor,
      produto: row.excel_produto,
    };
  }, [drawerStagingId, staging]);

  return (
    <div className="space-y-3">
      {/* ─── Bloco Upload ───────────────────────────────────────── */}
      <div className="border rounded-md p-3 bg-card space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={parsing || isPopulating || isApplying}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {parsing ? 'Lendo Excel…' : 'Selecionar Excel referência'}
          </Button>
          {arquivo && (
            <span className="text-[11px] text-muted-foreground">
              {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
            </span>
          )}
          {lote && (
            <span className="text-[11px] text-muted-foreground">
              · {lote.linhasValidas} linha(s) válida(s) · {lote.linhasComErro} com erro
            </span>
          )}
          {arquivo && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto text-muted-foreground"
              disabled={isPopulating || isApplying}
              onClick={resetSessao}
              title="Descartar sessão e arquivo"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          )}
        </div>

        {errosParser.length > 0 && (
          <div className="text-[10px] text-red-700 flex items-start gap-1.5">
            <FileX className="h-3 w-3 mt-0.5 shrink-0" />
            <div>
              <strong>Linhas rejeitadas pelo parser ({errosParser.length}):</strong>{' '}
              {errosParser
                .slice(0, 3)
                .map((e) => `Linha ${e.linha}: ${e.motivo}`)
                .join(' · ')}
              {errosParser.length > 3 && ` (+${errosParser.length - 3})`}
            </div>
          </div>
        )}

        {lote && !sessaoId && (
          <Button
            size="sm"
            className="h-8"
            disabled={!clienteAtual?.id || isPopulating || lote.linhasValidas === 0}
            onClick={handlePopular}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {isPopulating ? 'Populando staging…' : `Popular staging (${lote.linhasValidas} linha(s))`}
          </Button>
        )}
      </div>

      {/* ─── HEADER explicativo (A3) — visível só com sessão ───── */}
      {sessaoId && !applyResult && (
        <div className="border rounded-md p-3 bg-card space-y-2 text-[12px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              Sessão {sessaoId.slice(0, 8).toUpperCase()} · {staging.length} linha(s)
            </span>
            {(isLoading || isFetching) && (
              <span className="text-[10px] text-muted-foreground">atualizando…</span>
            )}
          </div>

          <div className="space-y-0.5">
            <p>
              Apply tocaria <strong>{headerStats.total}</strong> lançamento(s):
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 ml-3">
              <li>• Preencherá <strong>subcentro</strong> em {headerStats.n1_subcentro} caso(s) (campo vazio)</li>
              <li>• Preencherá <strong>favorecido</strong> em {headerStats.n2_favorecido} caso(s) (campo vazio)</li>
              <li>• {headerStats.n3_no_change} caso(s) com classificação já igual (<em>nada mudará</em>)</li>
            </ul>
          </div>

          <div className="text-[11px] text-muted-foreground border-t pt-2">
            <strong className="text-foreground">O apply NÃO:</strong>
            <ul className="ml-3 mt-0.5 space-y-0.5">
              <li>• altera valor</li>
              <li>• altera data</li>
              <li>• altera conta bancária</li>
              <li>• cria lançamentos</li>
              <li>• remove classificações existentes</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            <strong>Apply processa apenas linhas com status "Exato" e ainda não
            aplicadas.</strong> Linhas em outros status (Divergente, Já classificado,
            Ambíguo, Sem match) NÃO são alteradas, mesmo que tenham campos vazios
            alinháveis.
          </p>

          <label className="flex items-center gap-2 cursor-pointer pt-1 border-t mt-2 select-none">
            <Checkbox
              checked={confirmadoCheckbox}
              onCheckedChange={(v) => setConfirmadoCheckbox(v === true)}
              disabled={isApplying || headerStats.total === 0}
            />
            <span className="text-[11px]">
              Revisei o preview e autorizo aplicar nas{' '}
              <strong>{headerStats.total}</strong> linha(s) exata(s).
            </span>
          </label>

          <Button
            size="sm"
            className="h-8 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!confirmadoCheckbox || isApplying || headerStats.total === 0}
            onClick={handleAplicar}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {isApplying ? 'Aplicando…' : `Aplicar classificações exatas (${headerStats.total})`}
          </Button>
        </div>
      )}

      {/* ─── Resumo pós-apply ─────────────────────────────────── */}
      {sessaoId && applyResult && (
        <div className="border rounded-md p-3 bg-emerald-50/40 border-emerald-300 text-[12px]">
          <strong className="text-emerald-800">✓ Apply concluído:</strong>{' '}
          {applyResult.aplicados} aplicado(s) · {applyResult.pulados_subcentro_preenchido} pulado(s) ·{' '}
          {applyResult.erros} erro(s).
          {populateResult && (
            <span className="text-[10px] text-muted-foreground ml-2">
              (Populate inicial: {populateResult.inseridas} linha(s))
            </span>
          )}
        </div>
      )}

      {/* ─── Filtros + counts ────────────────────────────────── */}
      {sessaoId && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant={filtroStatus === 'todos' ? 'default' : 'outline'}
            className="h-6 text-[10px] px-2"
            onClick={() => setFiltroStatus('todos')}
          >
            Todos ({staging.length})
          </Button>
          {STATUS_ORDER.map((st) => (
            <Button
              key={st}
              size="sm"
              variant={filtroStatus === st ? 'default' : 'outline'}
              className="h-6 text-[10px] px-2"
              disabled={countsPorStatus[st] === 0}
              onClick={() => setFiltroStatus(st)}
            >
              {STATUS_LABEL[st]} ({countsPorStatus[st] ?? 0})
            </Button>
          ))}
        </div>
      )}

      {/* ─── Tabela 3-zonas ──────────────────────────────────── */}
      {sessaoId && (
        <div className="border rounded overflow-auto max-h-[65vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="text-[10px] w-[140px]">Status</TableHead>
                <TableHead className="text-[10px] w-[280px]">Excel</TableHead>
                <TableHead className="text-[10px] w-[280px]">Sistema (estado atual)</TableHead>
                <TableHead className="text-[10px] w-[220px]">Proposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsFiltradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                    {staging.length === 0
                      ? 'Aguardando populate da staging...'
                      : 'Nenhuma linha bate com o filtro selecionado.'}
                  </TableCell>
                </TableRow>
              )}
              {rowsFiltradas.map((r) => (
                <RowPreview
                  key={r.staging_id}
                  row={r}
                  onOpenCandidatos={() => setDrawerStagingId(r.staging_id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Estado inicial vazio */}
      {!arquivo && !sessaoId && (
        <div className="text-center text-xs text-muted-foreground py-6">
          Selecione um arquivo Excel referência para iniciar a classificação.
        </div>
      )}

      {/* Drawer de candidatos (ambíguo) */}
      <MesaClassificacaoCandidatosDrawer
        stagingId={drawerStagingId}
        open={!!drawerStagingId}
        onOpenChange={(o) => { if (!o) setDrawerStagingId(null); }}
        contextoExcel={drawerContexto}
      />
    </div>
  );
}

// ─── Render de uma linha ──────────────────────────────────────────────

interface RowPreviewProps {
  row: ClassificacaoStagingPreviewRow;
  onOpenCandidatos: () => void;
}

function RowPreview({ row, onOpenCandidatos }: RowPreviewProps) {
  const status = row.match_status;
  const contaSistema =
    row.lanc_tipo_operacao === '1-Entradas'
      ? row.lanc_conta_destino_nome
      : row.lanc_conta_bancaria_nome;

  return (
    <TableRow className={row.aplicado ? 'opacity-60' : undefined}>
      {/* STATUS */}
      <TableCell className="align-top">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={`h-4 px-1.5 text-[9px] ${STATUS_BADGE_CLS[status]}`}
            >
              {STATUS_LABEL[status]}
            </Badge>
            <span className="text-[10px] font-mono text-muted-foreground">
              L{row.excel_linha_origem ?? '-'}
            </span>
            {row.aplicado && (
              <span className="text-[9px] text-emerald-700 font-semibold">✓</span>
            )}
            {row.erro_apply && (
              <AlertTriangle
                className="inline h-3 w-3 text-red-600"
                aria-label={row.erro_apply}
              />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {STATUS_MESSAGE[status]}
          </p>
        </div>
      </TableCell>

      {/* EXCEL */}
      <TableCell className="align-top text-[11px]">
        <div className="font-semibold tabular-nums">
          {fmtData(row.excel_data)} · {row.excel_valor != null ? formatMoeda(row.excel_valor) : '-'}
        </div>
        <div className="text-[10px]">{row.excel_tipo_operacao ?? '-'}</div>
        <div className="text-[10px] text-muted-foreground truncate" title={row.excel_conta_origem ?? ''}>
          De: {row.excel_conta_origem ?? '-'}
        </div>
        <div className="text-[10px] text-muted-foreground truncate" title={row.excel_conta_destino ?? ''}>
          Para: {row.excel_conta_destino ?? '-'}
        </div>
        <div className="text-[10px] mt-1 truncate" title={row.excel_subcentro ?? ''}>
          <span className="text-muted-foreground">Sub Excel:</span> {row.excel_subcentro ?? '-'}
        </div>
        <div className="text-[10px] truncate" title={row.excel_fornecedor ?? ''}>
          <span className="text-muted-foreground">Forn:</span> {row.excel_fornecedor ?? '-'}
        </div>
        {row.excel_produto && (
          <div className="text-[10px] truncate" title={row.excel_produto}>
            <span className="text-muted-foreground">Prod:</span> {row.excel_produto}
          </div>
        )}
      </TableCell>

      {/* SISTEMA */}
      <TableCell className="align-top text-[11px]">
        {!row.lanc_id ? (
          <div className="text-[10px] text-muted-foreground italic">
            — (nenhum lançamento vinculado)
          </div>
        ) : (
          <>
            <div className="font-medium truncate" title={row.lanc_descricao ?? ''}>
              {row.lanc_descricao ?? '(sem descrição)'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {fmtData(row.lanc_data_pagamento)} · {row.lanc_tipo_operacao} · sinal: {row.lanc_sinal ?? '-'}
            </div>
            <div className="text-[10px] truncate" title={contaSistema ?? ''}>
              <span className="text-muted-foreground">Conta:</span> {contaSistema ?? '-'}
            </div>
            <div className="text-[10px] mt-1">
              <span className="text-muted-foreground">Sub atual:</span>{' '}
              {row.lanc_subcentro_atual ? (
                <span className={row.conflito_subcentro ? 'text-amber-700 font-medium' : ''}>
                  {row.lanc_subcentro_atual}
                  {row.conflito_subcentro && (
                    <Badge
                      variant="outline"
                      className="h-3 px-1 ml-1 text-[8px] bg-amber-50 text-amber-700 border-amber-300"
                    >
                      ≠ Excel
                    </Badge>
                  )}
                </span>
              ) : (
                <span className="italic text-muted-foreground">∅ vazio</span>
              )}
            </div>
            {(row.lanc_macro_atual || row.lanc_grupo_atual || row.lanc_centro_atual) && (
              <div className="text-[10px] text-muted-foreground truncate">
                {[row.lanc_macro_atual, row.lanc_grupo_atual, row.lanc_centro_atual]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            <div className="text-[10px]">
              <span className="text-muted-foreground">Forn atual:</span>{' '}
              {row.lanc_favorecido_nome_atual ?? (
                <span className="italic text-muted-foreground">∅ vazio</span>
              )}
            </div>
          </>
        )}
      </TableCell>

      {/* PROPOSTA */}
      <TableCell className="align-top text-[11px]">
        {status === 'ambiguo' ? (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Múltiplos candidatos</div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={onOpenCandidatos}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Ver candidatos
            </Button>
          </div>
        ) : status === 'sem_match' ? (
          <div className="space-y-0.5">
            <div className="text-[10px]">Sem lançamento compatível</div>
            <div className="text-[10px] text-muted-foreground italic">
              Apply NÃO criará lançamento.
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Subcentro */}
            <div className="flex items-start gap-1.5 flex-wrap">
              <div className="flex-1 min-w-0 truncate" title={row.proposto_subcentro ?? ''}>
                <span className="text-muted-foreground">Subcentro:</span>{' '}
                {row.proposto_subcentro ?? '—'}
              </div>
              {status === 'exato' && row.will_set_subcentro && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300"
                >
                  ✓ Gravará subcentro
                </Badge>
              )}
              {!row.will_set_subcentro &&
                row.lanc_subcentro_atual &&
                row.proposto_subcentro &&
                row.lanc_subcentro_atual === row.proposto_subcentro && (
                  <Badge
                    variant="outline"
                    className="h-4 px-1.5 text-[9px] bg-slate-100 text-slate-700 border-slate-300"
                  >
                    ⊘ Já igual
                  </Badge>
                )}
              {row.conflito_subcentro && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-amber-100 text-amber-800 border-amber-300"
                >
                  ⚠ Sistema tem outro
                </Badge>
              )}
            </div>

            {/* Favorecido */}
            <div className="flex items-start gap-1.5 flex-wrap">
              <div className="flex-1 min-w-0 truncate" title={row.proposto_favorecido_nome ?? ''}>
                <span className="text-muted-foreground">Favorecido:</span>{' '}
                {row.proposto_favorecido_nome ?? '—'}
              </div>
              {status === 'exato' && row.will_set_favorecido && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300"
                >
                  ✓ Gravará favorecido
                </Badge>
              )}
              {!row.will_set_favorecido && row.lanc_favorecido_id_atual && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-slate-100 text-slate-700 border-slate-300"
                >
                  ⊘ Já preenchido
                </Badge>
              )}
            </div>

            {/* PR-M4 ajuste: row fora de 'exato' com campos alinháveis —
                badge muted explicando por que apply NÃO processará. */}
            {status !== 'exato' && row.will_change_anything && STATUS_APPLY_NAO_PROCESSA[status] && (
              <div className="pt-0.5">
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-slate-100 text-slate-600 border-slate-300"
                >
                  ⊘ {STATUS_APPLY_NAO_PROCESSA[status]}
                </Badge>
              </div>
            )}

            {/* A1: badge "Nada será alterado" */}
            {row.lanc_id && !row.will_change_anything && (
              <div className="pt-0.5">
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[9px] bg-slate-100 text-slate-600 border-slate-300"
                >
                  ⊘ Nada será alterado neste lançamento
                </Badge>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
