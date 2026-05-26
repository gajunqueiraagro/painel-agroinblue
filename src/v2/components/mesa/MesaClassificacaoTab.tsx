/**
 * MesaClassificacaoTab — UI da tab "Classificação Excel" na Mesa Operacional.
 *
 * Usa parser PRÓPRIO `parseExcelClassificacao` (PR-M2.1) — validação
 * mínima (linha rejeitada só se faltar Data_Ref/Valor/Tipo/Subcentro).
 * O parser OFX é incompatível (schema/validação OFX-específicos);
 * detalhes em parserClassificacao.ts.
 *
 * Fluxo:
 *   1. Operador escolhe arquivo (input file accept=.xlsx)
 *   2. handleSelectFile reseta TUDO (arquivo, lote, sessaoId, errosParser, filtroStatus)
 *   3. parseExcelClassificacao → exibe contagens + botão "Popular staging"
 *   4. Click "Popular" → crypto.randomUUID() → setSessaoId → populate RPC
 *      → useQuery dispara → tabela populada
 *   5. Operador revisa cards/tabela
 *   6. Click "Aplicar exatos (N)" → apply RPC → refetch
 *
 * Tab dark/glass não aplicado por escolha — opção mantida shadcn padrão
 * para preservar legibilidade da tabela densa.
 */
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Play, AlertTriangle, Check, FileX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import {
  parseExcelClassificacao,
  type ClassificacaoParseResult,
} from '@/v2/lib/excelPreview/parserClassificacao';
import {
  useClassificacaoStaging,
  type MatchStatus,
} from '@/v2/hooks/useClassificacaoStaging';
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

function fmtData(s: string | null): string {
  if (!s) return '-';
  // 'YYYY-MM-DD' → 'DD/MM/YY'
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

function truncUuid(uuid: string | null): string {
  if (!uuid) return '-';
  return uuid.slice(0, 8);
}

export function MesaClassificacaoTab() {
  const { clienteAtual } = useCliente();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado local da sessão atual.
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lote, setLote] = useState<ClassificacaoParseResult | null>(null);
  const [errosParser, setErrosParser] = useState<Array<{ linha: number; motivo: string }>>([]);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<MatchStatus | 'todos'>('todos');
  const [parsing, setParsing] = useState(false);

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

  // Contagens derivadas
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

  const nExatosAplicaveis = useMemo(
    () => staging.filter((r) => r.match_status === 'exato' && !r.aplicado).length,
    [staging],
  );

  // Reset cirúrgico ao trocar de arquivo.
  function resetSessao() {
    setArquivo(null);
    setLote(null);
    setErrosParser([]);
    setSessaoId(null);
    setFiltroStatus('todos');
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
    // PR-M2.1: parser já retorna rows no shape exato da RPC.
    const rows = lote.rows;
    try {
      setSessaoId(novaSessao);
      const res = await populate({ sessao_id: novaSessao, rows });
      const totais = Object.entries(res.counts_por_status ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      toast.success(`Staging populada (${res.inseridas} linhas). ${totais}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro no populate: ${msg}`);
      // Mantém sessaoId para o operador inspecionar via SQL se necessário.
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro no apply: ${msg}`);
    }
  }

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

      {/* ─── Bloco Counts + Filtro (só quando há sessão) ─────────── */}
      {sessaoId && (
        <div className="border rounded-md p-3 bg-card space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              Sessão {truncUuid(sessaoId)}
            </span>
            {(isLoading || isFetching) && (
              <span className="text-[10px] text-muted-foreground">atualizando…</span>
            )}
            <div className="ml-auto flex gap-1.5 flex-wrap">
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
          </div>

          <div className="flex items-center gap-2 pt-1 border-t">
            <Button
              size="sm"
              className="h-8"
              disabled={nExatosAplicaveis === 0 || isApplying}
              onClick={handleAplicar}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {isApplying
                ? 'Aplicando…'
                : `Aplicar classificações exatas (${nExatosAplicaveis})`}
            </Button>
            {applyResult && (
              <span className="text-[10px] text-muted-foreground">
                Último apply: {applyResult.aplicados} aplicado(s) ·{' '}
                {applyResult.pulados_subcentro_preenchido} pulado(s) ·{' '}
                {applyResult.erros} erro(s)
              </span>
            )}
            {populateResult && !applyResult && (
              <span className="text-[10px] text-muted-foreground">
                Populate: {populateResult.inseridas} linha(s) inseridas
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Tabela de revisão (só quando há staging) ───────────── */}
      {sessaoId && (
        <div className="border rounded overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="text-[10px] w-[40px]">L#</TableHead>
                <TableHead className="text-[10px]">Data</TableHead>
                <TableHead className="text-[10px] text-right">Valor</TableHead>
                <TableHead className="text-[10px]">Tipo</TableHead>
                <TableHead className="text-[10px]">Conta origem</TableHead>
                <TableHead className="text-[10px]">Conta destino</TableHead>
                <TableHead className="text-[10px]">Subcentro</TableHead>
                <TableHead className="text-[10px]">Fornecedor</TableHead>
                <TableHead className="text-[10px]">Status</TableHead>
                <TableHead className="text-[10px]">Lanc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsFiltradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">
                    {staging.length === 0
                      ? 'Aguardando populate da staging...'
                      : 'Nenhuma linha bate com o filtro selecionado.'}
                  </TableCell>
                </TableRow>
              )}
              {rowsFiltradas.map((r) => (
                <TableRow
                  key={r.staging_id}
                  className={r.aplicado ? 'opacity-60' : undefined}
                >
                  <TableCell className="text-[10px] font-mono">{r.excel_linha_origem ?? '-'}</TableCell>
                  <TableCell className="text-[10px] font-mono">{fmtData(r.excel_data)}</TableCell>
                  <TableCell className="text-[10px] text-right tabular-nums font-mono">
                    {r.excel_valor != null ? formatMoeda(r.excel_valor) : '-'}
                  </TableCell>
                  <TableCell className="text-[10px]">{r.excel_tipo_operacao ?? '-'}</TableCell>
                  <TableCell className="text-[10px] max-w-[180px] truncate" title={r.excel_conta_origem ?? ''}>
                    {r.excel_conta_origem ?? '-'}
                  </TableCell>
                  <TableCell className="text-[10px] max-w-[180px] truncate" title={r.excel_conta_destino ?? ''}>
                    {r.excel_conta_destino ?? '-'}
                  </TableCell>
                  <TableCell className="text-[10px] max-w-[200px] truncate" title={r.excel_subcentro ?? ''}>
                    {r.excel_subcentro ?? '-'}
                  </TableCell>
                  <TableCell className="text-[10px] max-w-[140px] truncate" title={r.excel_fornecedor ?? ''}>
                    {r.excel_fornecedor ?? '-'}
                  </TableCell>
                  <TableCell className="text-[10px]">
                    <Badge
                      variant="outline"
                      className={`h-4 px-1.5 text-[9px] ${STATUS_BADGE_CLS[r.match_status]}`}
                    >
                      {STATUS_LABEL[r.match_status]}
                    </Badge>
                    {r.aplicado && (
                      <span className="ml-1 text-[9px] text-emerald-700 font-semibold">✓</span>
                    )}
                    {r.erro_apply && (
                      <AlertTriangle
                        className="inline h-3 w-3 ml-1 text-red-600"
                        aria-label={r.erro_apply}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] font-mono" title={r.match_lancamento_id ?? ''}>
                    {truncUuid(r.match_lancamento_id)}
                  </TableCell>
                </TableRow>
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
    </div>
  );
}
