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
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Play, AlertTriangle, FileX, Trash2, ExternalLink, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda, type Fazenda } from '@/contexts/FazendaContext';
import {
  parseExcelClassificacao,
  type ClassificacaoParseResult,
} from '@/v2/lib/excelPreview/parserClassificacao';
import {
  useClassificacaoStaging,
  type MatchStatus,
  type ClassificacaoStagingPreviewRow,
} from '@/v2/hooks/useClassificacaoStaging';
import {
  useFinanceiroV2,
  type LancamentoV2Form,
  type ContaBancariaV2,
  type ClassificacaoItem,
} from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { MesaClassificacaoCandidatosDrawer } from './MesaClassificacaoCandidatosDrawer';
import { formatMoeda } from '@/lib/calculos/formatters';

// ─── PR-Mesa-CreateFromExcel-A: helpers de prefill ────────────────────
//
// Resolução de conta a partir do texto Excel ("cc-001 | banco do brasil
// pecuária"): mesma regra determinística do fn_classificacao_resolver_conta
// SQL — split por '|' → split por '-' → mapeia tipo + parseInt(codigo).
// Zero fuzzy, zero LIKE.
function resolverContaPorTexto(
  texto: string | null,
  contas: ContaBancariaV2[],
): string | undefined {
  if (!texto) return undefined;
  const partePrimeira = texto.split('|')[0].trim().toLowerCase();
  const parts = partePrimeira.split('-');
  if (parts.length < 2) return undefined;
  const tipoPrefix = parts[0];
  const codigoStr = (parts[1] ?? '').replace(/^0+/, '');
  const codigoN = parseInt(codigoStr || '0', 10);
  if (Number.isNaN(codigoN)) return undefined;
  const tipoMapped =
    tipoPrefix === 'c.credito' ? 'cartao'
      : tipoPrefix === 'terceiros' ? null
        : tipoPrefix;
  if (!tipoMapped) return undefined;
  const match = contas.find((c) => {
    if ((c.tipo_conta ?? '').toLowerCase() !== tipoMapped) return false;
    const dbCodStr = (c.codigo_conta ?? '').replace(/^0+/, '');
    const dbCodN = parseInt(dbCodStr || '0', 10);
    return !Number.isNaN(dbCodN) && dbCodN === codigoN;
  });
  return match?.id;
}

function buildPrefillFromRow(
  row: ClassificacaoStagingPreviewRow,
  fazendas: Fazenda[],
  contas: ContaBancariaV2[],
  classificacoes: ClassificacaoItem[],
) {
  // Resolver fazenda via codigo_importacao (campo do briefing PR-M).
  const fazenda = row.excel_fazenda_codigo
    ? fazendas.find((f) => (f as any).codigo_importacao === row.excel_fazenda_codigo)
    : undefined;

  const contaOrigemId  = resolverContaPorTexto(row.excel_conta_origem,  contas);
  const contaDestinoId = resolverContaPorTexto(row.excel_conta_destino, contas);

  // Macro/centro vêm do plano local resolvido pelo subcentro canônico
  // (a view não expõe proposto_macro/centro — resolve client-side via
  // classificacoes já carregadas).
  let macroProposto:  string | undefined;
  let centroProposto: string | undefined;
  if (row.proposto_subcentro) {
    const cls = classificacoes.find((c) => c.subcentro === row.proposto_subcentro);
    macroProposto  = cls?.macro_custo;
    centroProposto = cls?.centro_custo;
  }

  // Descrição útil concatenando contexto operacional do Excel.
  // Operador edita livremente no modal antes de salvar.
  const descricao = [
    row.excel_fornecedor,
    row.excel_produto,
    row.excel_subcentro,
  ].filter(Boolean).join(' · ');

  return {
    fazenda_id: fazenda?.id,
    data_pagamento:   row.excel_data ?? undefined,
    data_competencia: row.excel_data ?? undefined,
    valor:            row.excel_valor ?? undefined,
    tipo_operacao:    row.excel_tipo_operacao ?? undefined,
    conta_bancaria_id: contaOrigemId,
    conta_destino_id:  contaDestinoId,
    descricao:        descricao || undefined,
    numero_documento: undefined,
    status_transacao: undefined,
    favorecido_id:    row.proposto_favorecido_id ?? undefined,
    subcentro:        row.proposto_subcentro ?? undefined,
    macro_custo:      macroProposto,
    centro_custo:     centroProposto,
  };
}

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
  const { user } = useAuth();
  const { fazendas, fazendaAtual } = useFazenda();
  const hookFin = useFinanceiroV2();
  const qc = useQueryClient();
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

  // PR-Mesa-CreateFromExcel-A — criar lançamento a partir de row Mesa
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogRow, setCreateDialogRow] = useState<ClassificacaoStagingPreviewRow | null>(null);

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

  // PR-M5-A2 ajuste: 2 contadores de órfãos.
  // nOrfaosAplicaveis = exatamente o que apply tocaria hoje (filtro
  //   match_status='exato' bate com o LOOP da fn_classificacao_apply).
  //   Usado pra bloquear o botão Apply.
  // nOrfaosTotal = todos os órfãos da sessão (qualquer status).
  //   Usado pra contexto do alerta — mostra escopo do problema.
  const nOrfaosAplicaveis = useMemo(
    () => staging.filter(
      (r) => r.will_create_subcentro_orfao && !r.aplicado && r.match_status === 'exato'
    ).length,
    [staging],
  );
  const nOrfaosTotal = useMemo(
    () => staging.filter(
      (r) => r.will_create_subcentro_orfao && !r.aplicado
    ).length,
    [staging],
  );

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

  // PR-Mesa-CreateFromExcel-A — abrir dialog de criação a partir de row
  function handleOpenCreate(row: ClassificacaoStagingPreviewRow) {
    if (!hookFin.contasBancarias.length || !fazendas.length) {
      toast.error('Aguarde carregamento de contas e fazendas.');
      return;
    }
    setCreateDialogRow(row);
    setCreateDialogOpen(true);
  }

  // PR-Mesa-CreateFromExcel-A — save handler do modal:
  //   1. criarLancamentoComId via hook oficial (origem='mesa_excel')
  //   2. UPDATE financeiro_classificacao_staging marcando aplicado + vínculo
  //      Opção B: usa match_lancamento_id (já tem FK pra lancamentos_v2);
  //      NÃO toca financeiro_lancamentos_v2.staging_id (FK aponta pra outra
  //      staging table — PR6.2).
  async function handleSaveFromMesa(form: LancamentoV2Form): Promise<boolean> {
    if (!createDialogRow || !user?.id) return false;
    const stagingId = createDialogRow.staging_id;

    const novoId = await hookFin.criarLancamentoComId(form, { origem: 'mesa_excel' });
    if (!novoId) return false; // toast de erro já mostrado pelo hook

    // PR-M2: cast `any` enquanto types Supabase não regeneram após PR-M
    // (financeiro_classificacao_staging não está no types gerado).
    const { error } = await (supabase as any)
      .from('financeiro_classificacao_staging')
      .update({
        aplicado: true,
        aplicado_em: new Date().toISOString(),
        aplicado_por: user.id,
        match_lancamento_id: novoId,
      })
      .eq('staging_id', stagingId);

    if (error) {
      toast.error('Lançamento criado, mas falhou ao marcar staging: ' + error.message);
      return false;
    }

    // Refetch staging (mesma queryKey usada pelo useClassificacaoStaging)
    qc.invalidateQueries({ queryKey: ['classificacao-staging', sessaoId] });

    toast.success('Lançamento criado e linha marcada como aplicada.');
    setCreateDialogOpen(false);
    setCreateDialogRow(null);
    return true;
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

          {/* PR-M5-A2 ajuste: alerta usa 2 contadores (aplicáveis + total) e tom neutro */}
          {nOrfaosTotal > 0 && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-red-900">
                ⚠ {nOrfaosAplicaveis} {nOrfaosAplicaveis === 1 ? 'proposta exata' : 'propostas exatas'} com
                subcentro fora do plano oficial
              </p>
              <p className="text-xs text-red-800 mt-1 leading-relaxed">
                Há <strong>{nOrfaosTotal}</strong> {nOrfaosTotal === 1 ? 'proposta órfã' : 'propostas órfãs'} na sessão inteira
                (todos os status).
                {nOrfaosAplicaveis > 0 && (
                  <>
                    {' '}O Apply está <strong>bloqueado</strong> porque {nOrfaosAplicaveis}{' '}
                    {nOrfaosAplicaveis === 1 ? 'delas seria aplicada' : 'delas seriam aplicadas'} agora.
                    Corrija o Excel para usar exatamente as strings canônicas do{' '}
                    <code className="mx-1 px-1 bg-red-100 rounded">financeiro_plano_contas</code>
                    antes de aplicar. Revise as linhas marcadas em vermelho.
                  </>
                )}
                {nOrfaosAplicaveis === 0 && (
                  <>
                    {' '}Nenhuma das propostas exatas tem subcentro órfão — o bloqueio
                    anti-órfão não impede o Apply. As demais propostas indicam que o
                    Excel ainda contém strings fora do plano oficial
                    (<code className="mx-1 px-1 bg-red-100 rounded">financeiro_plano_contas</code>).
                    Revise as linhas vermelhas antes de continuar.
                  </>
                )}
              </p>
            </div>
          )}

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
            disabled={
              !confirmadoCheckbox ||
              isApplying ||
              headerStats.total === 0 ||
              nOrfaosAplicaveis > 0
            }
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

      {/* ─── PR-M5-A: Lista de Cards 4 colunas × 10 linhas ──── */}
      {sessaoId && (
        <div className="max-h-[65vh] overflow-auto pr-1">
          {rowsFiltradas.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6 border rounded-md">
              {staging.length === 0
                ? 'Aguardando populate da staging...'
                : 'Nenhuma linha bate com o filtro selecionado.'}
            </div>
          ) : (
            rowsFiltradas.map((r) => (
              <RowPreview
                key={r.staging_id}
                row={r}
                onOpenCandidatos={() => setDrawerStagingId(r.staging_id)}
                onCreateLancamento={() => handleOpenCreate(r)}
              />
            ))
          )}
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

      {/* PR-Mesa-CreateFromExcel-A — modal oficial reusado, prefill estendido.
          Operador edita TUDO livremente; nenhum campo travado. */}
      <LancamentoV2Dialog
        open={createDialogOpen}
        onClose={() => { setCreateDialogOpen(false); setCreateDialogRow(null); }}
        onSave={handleSaveFromMesa}
        lancamento={undefined}
        fazendas={fazendas.filter((f) => f.id !== '__global__')}
        contas={hookFin.contasBancarias}
        classificacoes={hookFin.classificacoes}
        fornecedores={hookFin.fornecedores}
        defaultFazendaId={
          fazendaAtual && fazendaAtual.id !== '__global__'
            ? fazendaAtual.id
            : fazendas.find((f) => f.id !== '__global__')?.id
        }
        onCriarFornecedor={hookFin.criarFornecedor}
        prefill={
          createDialogRow
            ? buildPrefillFromRow(
                createDialogRow,
                fazendas,
                hookFin.contasBancarias,
                hookFin.classificacoes,
              )
            : undefined
        }
      />
    </div>
  );
}

// ─── PR-M5-A: Visual Diff Alinhado ────────────────────────────────────
//
// Cada staging row vira um Card com 2 zonas:
//   1) HEADER do card — badge + L# + R$ valor + descrição + msg status
//      (+ botão "Ver candidatos" se ambiguo)
//   2) Sub-grid 4 colunas × 10 linhas alinhadas
//      (Campo / Excel / Sistema / Proposta)
//
// Ordem das 10 linhas é canônica para toda a Mesa — operador escaneia
// sempre na mesma posição.
// ─────────────────────────────────────────────────────────────────────

type CellKind =
  | 'empty'         // valor null/'' → muted italic "∅ vazio"
  | 'na'            // não se aplica → "—" muted
  | 'no-lanc'       // sistema/proposta quando lanc_id === null
  | 'value'         // valor sem destaque
  | 'value-equal'   // valor sem destaque (alias semântico)
  | 'value-diff'    // vai gravar (exato + will_set_*) → bg-emerald-50
  | 'value-conflict' // sistema ≠ proposta em row não-exato → bg-amber-50
  | 'value-orfao';  // PR-M5-A2: subcentro proposto NÃO EXISTS no plano → bg-red-100

interface CellSpec {
  kind: CellKind;
  value?: string | null;
  title?: string;
}

const CELL_CLS: Record<CellKind, string> = {
  empty: 'text-muted-foreground italic',
  na: 'text-muted-foreground',
  'no-lanc': 'text-muted-foreground italic',
  value: '',
  'value-equal': '',
  'value-diff': 'bg-emerald-50',
  'value-conflict': 'bg-amber-50',
  'value-orfao': 'bg-red-100 text-red-900 font-medium',
};

function Cell({ spec }: { spec: CellSpec }) {
  const base = `px-3 py-1.5 align-top text-[11px] ${CELL_CLS[spec.kind]}`;
  if (spec.kind === 'empty') return <td className={base}>∅ vazio</td>;
  if (spec.kind === 'na')    return <td className={base}>—</td>;
  if (spec.kind === 'no-lanc') return <td className={base}>∅ Sem lançamento</td>;
  return (
    <td className={base} title={spec.title ?? spec.value ?? undefined}>
      <div className="truncate">{spec.value}</div>
    </td>
  );
}

function hierarquia(
  macro: string | null,
  grupo: string | null,
  centro: string | null,
): string | null {
  const parts = [macro, grupo, centro].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' › ') : null;
}

interface RowPreviewProps {
  row: ClassificacaoStagingPreviewRow;
  onOpenCandidatos: () => void;
  onCreateLancamento: () => void;
}

function RowPreview({ row, onOpenCandidatos, onCreateLancamento }: RowPreviewProps) {
  const status = row.match_status;
  const noLanc = !row.lanc_id;

  // Logs defensivos (console only — não-bloqueante)
  const sistemaPlano = hierarquia(row.lanc_macro_atual, row.lanc_grupo_atual, row.lanc_centro_atual);
  if (row.lanc_subcentro_atual && !sistemaPlano) {
    console.warn(
      '[MesaClassificacao] L%s: subcentro preenchido sem hierarquia macro/grupo/centro (staging=%s)',
      row.excel_linha_origem ?? '?', row.staging_id,
    );
  }
  if (!STATUS_LABEL[status]) {
    console.warn('[MesaClassificacao] L%s: match_status inesperado: %s', row.excel_linha_origem ?? '?', status);
  }

  // Kind da célula proposta para subcentro.
  // PR-M5-A2: 'value-orfao' tem PRIORIDADE MÁXIMA — vermelho sobrepõe
  // verde (will_set) e âmbar (conflito). Mesmo apply em row exato
  // gravaria string órfã se passasse, então sinalizar como erro grave.
  let propostaSubKind: CellKind;
  if (!row.proposto_subcentro) {
    propostaSubKind = 'empty';
  } else if (row.will_create_subcentro_orfao) {
    propostaSubKind = 'value-orfao';
  } else if (status === 'exato' && row.will_set_subcentro) {
    propostaSubKind = 'value-diff';
  } else if (status !== 'exato' && row.conflito_subcentro) {
    propostaSubKind = 'value-conflict';
  } else if (row.proposto_subcentro === row.lanc_subcentro_atual) {
    propostaSubKind = 'value-equal';
  } else {
    propostaSubKind = 'value';
  }

  // Kind da célula proposta para favorecido
  const favConflito = !!(
    status !== 'exato'
    && row.lanc_favorecido_id_atual
    && row.proposto_favorecido_id
    && row.lanc_favorecido_id_atual !== row.proposto_favorecido_id
  );
  const propostaFavKind: CellKind = !row.proposto_favorecido_nome
    ? 'empty'
    : status === 'exato' && row.will_set_favorecido
      ? 'value-diff'
      : favConflito
        ? 'value-conflict'
        : 'value-equal';

  // Helpers locais para spec de células
  const cellExcel = (value: string | null): CellSpec =>
    value ? { kind: 'value-equal', value, title: value } : { kind: 'empty' };
  const cellSistema = (value: string | null): CellSpec => {
    if (noLanc) return { kind: 'no-lanc' };
    return value ? { kind: 'value-equal', value, title: value } : { kind: 'empty' };
  };
  const cellPropostaStatic = (value: string | null): CellSpec => {
    if (noLanc) return { kind: 'no-lanc' };
    return value ? { kind: 'value-equal', value, title: value } : { kind: 'empty' };
  };
  const cellNoLancOrNA = (): CellSpec => (noLanc ? { kind: 'no-lanc' } : { kind: 'na' });

  const fields: Array<{
    label: string;
    excel: CellSpec;
    sistema: CellSpec;
    proposta: CellSpec;
  }> = [
    {
      label: '📅 Data',
      excel:    cellExcel(row.excel_data ? fmtData(row.excel_data) : null),
      sistema:  cellSistema(row.lanc_data_pagamento ? fmtData(row.lanc_data_pagamento) : null),
      proposta: cellPropostaStatic(row.lanc_data_pagamento ? fmtData(row.lanc_data_pagamento) : null),
    },
    {
      label: '💰 Valor',
      excel:    cellExcel(row.excel_valor != null ? formatMoeda(row.excel_valor) : null),
      sistema:  cellSistema(row.lanc_valor != null ? formatMoeda(row.lanc_valor) : null),
      proposta: cellPropostaStatic(row.lanc_valor != null ? formatMoeda(row.lanc_valor) : null),
    },
    {
      label: '🔄 Tipo',
      excel:    cellExcel(row.excel_tipo_operacao),
      sistema:  cellSistema(row.lanc_tipo_operacao),
      proposta: cellPropostaStatic(row.lanc_tipo_operacao),
    },
    {
      label: '🏦 Conta De',
      excel:    cellExcel(row.excel_conta_origem),
      sistema:  cellSistema(row.lanc_conta_bancaria_nome),
      proposta: cellPropostaStatic(row.lanc_conta_bancaria_nome),
    },
    {
      label: '🏦 Conta Para',
      excel:    cellExcel(row.excel_conta_destino),
      sistema:  cellSistema(row.lanc_conta_destino_nome),
      proposta: cellPropostaStatic(row.lanc_conta_destino_nome),
    },
    {
      label: '🧩 Subcentro',
      excel:    cellExcel(row.excel_subcentro),
      sistema:  cellSistema(row.lanc_subcentro_atual),
      proposta: noLanc
        ? { kind: 'no-lanc' }
        : !row.proposto_subcentro
          ? { kind: 'empty' }
          : { kind: propostaSubKind, value: row.proposto_subcentro, title: row.proposto_subcentro },
    },
    {
      label: '👤 Fornecedor',
      excel:    cellExcel(row.excel_fornecedor),
      sistema:  cellNoLancOrNA(),
      proposta: cellNoLancOrNA(),
    },
    {
      label: '📦 Produto',
      excel:    cellExcel(row.excel_produto),
      sistema:  cellNoLancOrNA(),
      proposta: cellNoLancOrNA(),
    },
    {
      label: '📚 Plano',
      excel:    { kind: 'na' },
      sistema:  noLanc
        ? { kind: 'no-lanc' }
        : sistemaPlano
          ? { kind: 'value-equal', value: sistemaPlano, title: sistemaPlano }
          : { kind: 'empty' },
      // Apply atual NÃO preenche plano — sempre NA na coluna Proposta
      proposta: cellNoLancOrNA(),
    },
    {
      label: '✅ Favorecido',
      excel:    { kind: 'na' },
      sistema:  cellSistema(row.lanc_favorecido_nome_atual),
      proposta: noLanc
        ? { kind: 'no-lanc' }
        : !row.proposto_favorecido_nome
          ? { kind: 'empty' }
          : { kind: propostaFavKind, value: row.proposto_favorecido_nome, title: row.proposto_favorecido_nome },
    },
  ];

  return (
    <Card className={`my-3 ${row.aplicado ? 'opacity-60' : ''}`}>
      {/* ─── Header do card ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-wrap">
        <Badge
          variant="outline"
          className={`h-5 px-2 text-[10px] ${STATUS_BADGE_CLS[status]}`}
        >
          {STATUS_LABEL[status]}
        </Badge>
        <span className="text-[11px] font-mono text-muted-foreground">
          L{row.excel_linha_origem ?? '-'}
        </span>
        <span className="font-bold tabular-nums text-sm">
          {row.excel_valor != null ? formatMoeda(row.excel_valor) : '-'}
        </span>
        <span
          className="text-xs truncate max-w-md"
          title={row.lanc_descricao ?? ''}
        >
          {row.lanc_descricao ?? (
            <span className="italic text-muted-foreground">∅ Sem lançamento vinculado</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {STATUS_MESSAGE[status]}
        </span>
        {row.aplicado && (
          <Badge variant="default" className="h-5 px-2 text-[10px]">
            <Check className="h-3 w-3 mr-1" />
            Aplicado
          </Badge>
        )}
        {row.erro_apply && (
          <AlertTriangle
            className="h-3.5 w-3.5 text-red-600"
            aria-label={row.erro_apply}
          />
        )}
        {status === 'ambiguo' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] px-2"
            onClick={onOpenCandidatos}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Ver candidatos
          </Button>
        )}
        {/* PR-Mesa-CreateFromExcel-A: criar lançamento só em sem_match
            e enquanto não aplicada. Após aplicar, condição vira false
            (aplicado=true) e o botão some automaticamente. */}
        {status === 'sem_match' && !row.aplicado && (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-[11px] px-2"
            onClick={onCreateLancamento}
          >
            <Plus className="h-3 w-3 mr-1" />
            Criar lançamento
          </Button>
        )}
      </div>

      {/* ─── Sub-grid 4 col × (1 thead + 10 tbody) ──────────────── */}
      <table className="w-full table-fixed border-collapse text-xs leading-tight">
        <colgroup>
          <col className="w-40" />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b bg-slate-50/60">
            <th className="text-left px-3 py-1.5 font-semibold text-[11px] text-slate-700">
              Campo
            </th>
            <th className="text-left px-3 py-1.5 font-semibold text-[11px] text-slate-700">
              Excel
              <span className="block text-[10px] font-normal text-muted-foreground">
                Sugestão Excel
              </span>
            </th>
            <th className="text-left px-3 py-1.5 font-semibold text-[11px] text-slate-700">
              Sistema
              <span className="block text-[10px] font-normal text-muted-foreground">
                Plano soberano atual
              </span>
            </th>
            <th className="text-left px-3 py-1.5 font-semibold text-[11px] text-slate-700">
              Proposta
              <span className="block text-[10px] font-normal text-muted-foreground">
                Após apply
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((fr, idx) => (
            <tr
              key={idx}
              className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
            >
              <td className="px-3 py-1.5 text-[11px] font-medium text-slate-700">
                {fr.label}
              </td>
              <Cell spec={fr.excel} />
              <Cell spec={fr.sistema} />
              <Cell spec={fr.proposta} />
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
