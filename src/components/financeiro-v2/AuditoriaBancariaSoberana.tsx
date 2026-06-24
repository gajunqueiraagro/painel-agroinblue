// ============================================================================
// P0-H1.1 — Auditoria Bancária Soberana (UX render-only / diagnóstico).
// Consome o read-model fn_conciliacao_soberana (SOBERANA-01.4, status realizado)
// e exibe: Resumo compacto → cards-filtro clicáveis → lista única filtrável.
//
// READ-ONLY: nenhuma ação grava/altera dado. Botões = navegação por mês
// (onNavigateToLancamentos) + toast de contexto (descrição/valor/motivo/origem).
// Agrupamento é apenas sugestão visual. Gravação fica para o P0-H2.
// Frente isolada da Conciliação Bancária atual.
//
// RPC não tipado nos types gerados -> (supabase as any).rpc (idioma do projeto).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { ExtratoImportPreview } from '@/components/financeiro-v2/ExtratoImportPreview';
import { toast } from 'sonner';

interface Props {
  initialAno: string | number;
  initialMes?: number;
  onNavigateToLancamentos?: (ano: number, mes: number) => void;
}

// ── Contrato do JSON 01.4 ──────────────────────────────────────────────────
interface DivItem {
  link_id: string; motivo: string;
  extrato_id: string; data_ofx: string | null; valor: number; descricao: string | null;
  lancamento_id: string | null; data_lancamento: string | null; valor_lancamento: number | null;
  origem_lancamento: string | null; status_transacao: string | null; dias: number | null;
}
interface SistemaItem {
  lancamento_id: string; data: string | null; valor_assinado: number;
  sinal: string | null; descricao: string | null; origem_lancamento: string | null;
  status_transacao: string | null;
}
interface ExtratoItem {
  extrato_id: string; data: string | null; valor: number; tipo: string | null; descricao: string | null;
}
interface DesconItem {
  extrato_id: string; data: string | null; valor: number; tipo: string | null;
  descricao: string | null; lancamento_id: string | null;
}
interface AgrItem {
  extrato_id: string; valor: number;
  lancamentos: { lancamento_id: string; valor_assinado: number }[];
}
interface DiagnosticoSoberano {
  versao: string;
  resumo: {
    ofx: { movimentos: number; entradas: number; saidas: number; saldo_inicial: number | null; saldo_final: number | null };
    lv2: { lancamentos: number; entradas: number; saidas: number };
    corretos: { qtd: number; valor: number };
    desconsiderados: { movimentos: number; entradas: number; saidas: number };
  };
  veredito: { conciliado: boolean; bloqueios: { tipo: string; count: number }[] };
  buckets: {
    divergencias_vinculo: DivItem[];
    sistema_sem_extrato: SistemaItem[];
    extrato_sem_sistema: ExtratoItem[];
    desconsiderados: DesconItem[];
    agrupamentos: AgrItem[];
  };
}

// Existência/contagem do extrato salvo (derivada de extrato_bancario_v2).
interface ExtratoExistencia {
  movimentos: number;
  periodo_ini: string | null;
  periodo_fim: string | null;
  importado_em: string | null;
}

// ── Rótulos legíveis (nunca campo técnico) ─────────────────────────────────
const LABEL_ORIGEM: Record<string, string> = {
  movimentacao_rebanho: 'Movimentação Rebanho', mesa_excel: 'Mesa Excel', manual: 'Manual',
  ofx: 'OFX', importacao: 'Importação', migracao: 'Migração',
  parcela_financiamento: 'Financiamento', contrato: 'Contrato',
  referencia_operacional: 'Referência', extrato: 'Extrato', boitel: 'Boitel',
};
// Motivo técnico -> linguagem operacional: { problema (curto, na linha), acao (no tooltip) }.
const MOTIVO_INFO: Record<string, { problema: string; acao: string }> = {
  cancelado: {
    problema: 'Lançamento vinculado está cancelado',
    acao: 'Revise o vínculo ou recrie o lançamento correto.',
  },
  sinal_cruzado: {
    problema: 'Entrada/saída não bate com o lançamento',
    acao: 'Verifique se o lançamento foi registrado na direção correta.',
  },
  conta_divergente: {
    problema: 'Lançamento vinculado está em outra conta',
    acao: 'Corrija a conta do lançamento ou o vínculo.',
  },
  valor_divergente: {
    problema: 'Valor do extrato difere do lançamento',
    acao: 'Confira o valor lançado.',
  },
  data_divergente: {
    problema: 'Data do extrato e do lançamento diferem',
    acao: 'Confira a data de pagamento/compensação.',
  },
  sem_lancamento: {
    problema: 'Extrato sem lançamento no sistema',
    acao: 'Crie o lançamento correspondente.',
  },
  status_nao_realizado: {
    problema: 'Lançamento vinculado não está realizado',
    acao: 'Realize o lançamento ou remova o vínculo.',
  },
};
// status_transacao do lançamento (exposto pelo 01.4).
const LABEL_STATUS: Record<string, string> = {
  realizado: 'Realizado', previsto: 'Previsto', projetado: 'Projetado', cancelado: 'Cancelado',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};
const labelOrigem = (o: string | null) => (o ? LABEL_ORIGEM[o] ?? o : '—');
const problemaMotivo = (m: string) => MOTIVO_INFO[m]?.problema ?? m;
const acaoMotivo = (m: string) => MOTIVO_INFO[m]?.acao ?? '';
const labelStatus = (s: string | null) => (s ? LABEL_STATUS[s] ?? s : '—');
const fmtDataHora = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Próxima ação — rótulos PT dos bloqueios do veredito 01.4 (ordem do array).
const LABEL_BLOQUEIO: Record<string, (n: number) => string> = {
  divergencias_vinculo: (n) => `${n} ${n === 1 ? 'divergência de vínculo' : 'divergências de vínculo'}`,
  sistema_sem_extrato: (n) => `${n} ${n === 1 ? 'lançamento sem extrato' : 'lançamentos sem extrato'}`,
  extrato_sem_sistema: (n) => `${n} ${n === 1 ? 'movimento sem lançamento' : 'movimentos sem lançamento'}`,
};

type Tom = 'rose' | 'amber' | 'violet' | 'emerald' | 'muted';

function StatusBadge({ texto, tom }: { texto: string; tom: Tom }) {
  const cor = {
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    muted: 'bg-muted text-muted-foreground border-border',
  }[tom];
  return <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${cor}`}>{texto}</span>;
}

// ── Linha normalizada da lista única ───────────────────────────────────────
type FiltroKey =
  | 'todos' | 'divergencias' | 'sistema_sem_extrato' | 'extrato_sem_sistema'
  | 'agrupamentos' | 'desconsiderados' | 'corretos';

// tipo do bloqueio (veredito) -> card-filtro correspondente da lista.
const BLOQUEIO_FILTRO: Record<string, FiltroKey> = {
  divergencias_vinculo: 'divergencias',
  sistema_sem_extrato: 'sistema_sem_extrato',
  extrato_sem_sistema: 'extrato_sem_sistema',
};

interface LinhaAud {
  key: string;
  bucket: Exclude<FiltroKey, 'todos' | 'corretos'>;
  status: string;
  tom: Tom;
  data: string | null;
  descricao: string;
  origem: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  motivo: string;
  motivoAcao: string;
  acaoLabel: string | null;
  onAcao?: () => void;
}

// Direção pelo SINAL numérico (entrada = credito/positivo, saida = debito/negativo).
const dirSinal = (v: number): 'entrada' | 'saida' => (v >= 0 ? 'entrada' : 'saida');
// Direção pelo TIPO do movimento do extrato (credito/debito).
const dirTipo = (t: string | null, fallbackVal: number): 'entrada' | 'saida' =>
  t === 'credito' ? 'entrada' : t === 'debito' ? 'saida' : dirSinal(fallbackVal);

const tomStatusTransacao = (s: string | null): Tom => {
  if (s === 'realizado') return 'emerald';
  if (s === 'previsto' || s === 'projetado') return 'amber';
  if (s === 'cancelado') return 'rose';
  return 'muted';
};

function TipoBadge({ tipo }: { tipo: 'entrada' | 'saida' }) {
  const entrada = tipo === 'entrada';
  return (
    <span
      className={`w-16 shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold ${
        entrada ? 'text-emerald-700' : 'text-rose-700'
      }`}
    >
      {entrada ? '▲' : '▼'} {entrada ? 'Entrada' : 'Saída'}
    </span>
  );
}

function LinhaAuditoria({ linha }: { linha: LinhaAud }) {
  const motivoTitle = linha.motivoAcao ? `${linha.motivo} — ${linha.motivoAcao}` : linha.motivo;
  return (
    <div className="py-1 flex items-center gap-2 text-[11px]">
      <StatusBadge texto={linha.status} tom={linha.tom} />
      <span className="w-10 shrink-0 text-muted-foreground">{fmtData(linha.data)}</span>
      <span className="flex-1 min-w-0 truncate" title={linha.descricao}>{linha.descricao}</span>
      <span className="w-24 shrink-0 truncate text-[10px] text-muted-foreground" title={linha.origem}>{linha.origem}</span>
      <TipoBadge tipo={linha.tipo} />
      <span className="w-24 shrink-0 text-right tabular-nums">R$ {fmtBRL(linha.valor)}</span>
      <span className="w-36 shrink-0 truncate text-[10px] text-muted-foreground" title={motivoTitle}>{linha.motivo}</span>
      {linha.acaoLabel ? (
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0 w-[68px]" onClick={linha.onAcao}>
          {linha.acaoLabel}
        </Button>
      ) : (
        <span className="w-[68px] shrink-0" />
      )}
    </div>
  );
}

// ── Resumo compacto (espelha "Resumo das Movimentações") ───────────────────
function ResumoAuditoria({ diag, nomeConta }: { diag: DiagnosticoSoberano; nomeConta: string }) {
  const difEnt = diag.resumo.ofx.entradas - diag.resumo.lv2.entradas;
  const difSai = diag.resumo.ofx.saidas - diag.resumo.lv2.saidas;
  const Dif = ({ v }: { v: number }) => (
    <span className={`text-right tabular-nums ${Math.abs(v) >= 0.005 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>{fmtBRL(v)}</span>
  );
  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <span className="text-xs font-semibold">📊 Resumo da auditoria</span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 truncate max-w-[55%]">{nomeConta}</span>
      </div>
      <div className="px-3 py-2 grid grid-cols-4 gap-x-3 gap-y-1 text-xs">
        <span />
        <span className="text-right font-medium text-muted-foreground">Extrato</span>
        <span className="text-right font-medium text-muted-foreground">Sistema</span>
        <span className="text-right font-medium text-muted-foreground">Diferença</span>

        <span className="text-muted-foreground">Saldo Inicial</span>
        <span className="text-right tabular-nums">{diag.resumo.ofx.saldo_inicial == null ? 'não disp.' : fmtBRL(diag.resumo.ofx.saldo_inicial)}</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>

        <span className="text-muted-foreground">Entradas</span>
        <span className="text-right tabular-nums">{fmtBRL(diag.resumo.ofx.entradas)}</span>
        <span className="text-right tabular-nums">{fmtBRL(diag.resumo.lv2.entradas)}</span>
        <Dif v={difEnt} />

        <span className="text-muted-foreground">Saídas</span>
        <span className="text-right tabular-nums">{fmtBRL(diag.resumo.ofx.saidas)}</span>
        <span className="text-right tabular-nums">{fmtBRL(diag.resumo.lv2.saidas)}</span>
        <Dif v={difSai} />

        <span className="text-muted-foreground">Saldo Final</span>
        <span className="text-right tabular-nums">{diag.resumo.ofx.saldo_final == null ? 'não disp.' : fmtBRL(diag.resumo.ofx.saldo_final)}</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>
      </div>
    </div>
  );
}

// ── Cards-filtro clicáveis ─────────────────────────────────────────────────
function CardsFiltro({
  ativo, onSelect, contagens,
}: {
  ativo: FiltroKey;
  onSelect: (k: FiltroKey) => void;
  contagens: Record<FiltroKey, number>;
}) {
  const FILTROS: { key: FiltroKey; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'divergencias', label: 'Divergências' },
    { key: 'sistema_sem_extrato', label: 'Sistema sem Extrato' },
    { key: 'extrato_sem_sistema', label: 'Extrato sem Sistema' },
    { key: 'agrupamentos', label: 'Agrupamentos' },
    { key: 'desconsiderados', label: 'Desconsiderados' },
    { key: 'corretos', label: 'Corretos' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTROS.map((f) => {
        const on = ativo === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onSelect(f.key)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
              on ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            <span>{f.label}</span>
            <span className={`tabular-nums font-semibold ${on ? 'text-foreground' : 'text-foreground/80'}`}>{contagens[f.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Campo({ label, valor, muted }: { label: string; valor: string; muted?: boolean }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`truncate ${muted ? 'text-muted-foreground italic' : ''}`} title={valor}>{valor}</span>
    </div>
  );
}

// ── MUDANÇA 2 — Extrato soberano do mês (cabeçalho de decisão) ─────────────
function ExtratoSoberanoCard({
  extrato, nomeConta, ano, mes, onCarregar,
}: {
  extrato: ExtratoExistencia; nomeConta: string; ano: number; mes: number; onCarregar: () => void;
}) {
  if (extrato.movimentos === 0) {
    return (
      <Card className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Extrato soberano do mês</span>
          <StatusBadge texto="Nenhum extrato carregado" tom="muted" />
        </div>
        <p className="text-[11px] text-muted-foreground">Carregue o extrato para auditar esta conta/mês.</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCarregar}>↑ Carregar Extrato</Button>
      </Card>
    );
  }
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Extrato soberano do mês</span>
        <StatusBadge texto="Extrato carregado" tom="emerald" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
        <Campo label="Conta" valor={nomeConta || '—'} />
        <Campo label="Mês" valor={`${MESES[mes - 1]}/${ano}`} />
        <Campo label="Movimentos" valor={String(extrato.movimentos)} />
        <Campo label="Período" valor={`${fmtData(extrato.periodo_ini)} – ${fmtData(extrato.periodo_fim)}`} />
        <Campo label="Importado em" valor={fmtDataHora(extrato.importado_em)} />
        <Campo label="Arquivo" valor="não disponível" muted />
        <Campo label="Saldo" valor="não disponível" muted />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCarregar}>Ver extrato</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCarregar}>Carregar versão atualizada</Button>
      </div>
    </Card>
  );
}

// ── MUDANÇA 3 — Próxima ação (derivada EXCLUSIVAMENTE do veredito 01.4) ─────
function ProximaAcao({ diag, onResolver }: { diag: DiagnosticoSoberano; onResolver: (f: FiltroKey) => void }) {
  if (diag.veredito.conciliado) {
    return (
      <Card className="p-3 flex items-center gap-2 text-xs border-emerald-200 bg-emerald-50/50">
        <span className="font-semibold text-emerald-700">Próxima ação ·</span>
        <span className="text-emerald-800">Conta conciliada contra o extrato.</span>
      </Card>
    );
  }
  const bloqueios = diag.veredito.bloqueios.filter((b) => b.count > 0 && LABEL_BLOQUEIO[b.tipo]);
  const frase = bloqueios.map((b) => LABEL_BLOQUEIO[b.tipo](b.count)).join(' e ');
  const primeiro = bloqueios[0];
  return (
    <Card className="p-3 space-y-1.5 border-rose-200 bg-rose-50/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">
          <span className="font-semibold text-rose-700">Próxima ação · </span>Conta não fecha.
        </span>
        {primeiro && BLOQUEIO_FILTRO[primeiro.tipo] && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0"
            onClick={() => onResolver(BLOQUEIO_FILTRO[primeiro.tipo])}>Resolver agora</Button>
        )}
      </div>
      {frase && <p className="text-[11px] text-muted-foreground">Resolva {frase}.</p>}
    </Card>
  );
}

export function AuditoriaBancariaSoberana({ initialAno, initialMes, onNavigateToLancamentos }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const queryClient = useQueryClient();
  const [contas, setContas] = useState<ContaSelecionavel[]>([]);
  const [contaId, setContaId] = useState<string | null>(null);
  const [ano, setAno] = useState<number>(Number(initialAno) || new Date().getFullYear());
  const [mes, setMes] = useState<number>(initialMes ?? new Date().getMonth() + 1);
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroKey>('todos');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    supabase.from('financeiro_contas_bancarias')
      .select('id,nome_conta,nome_exibicao,tipo_conta')
      .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao')
      .then(({ data }) => {
        const cs = (data as ContaSelecionavel[]) || [];
        setContas(cs);
        setContaId((prev) => prev ?? cs[0]?.id ?? null);
      });
  }, [clienteId]);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // MUDANÇA 1 — existência/contagem do extrato salvo (fonte: extrato_bancario_v2).
  // Range por data_movimento (não há ano_mes nesta tabela). count/min/max derivados
  // client-side (read-only; sem RPC/SQL novo). Sem filtro de status/cancelado_em —
  // espelha o range da RPC 01.4.
  const { data: extrato, isLoading: loadingExtrato } = useQuery({
    queryKey: ['auditoria-extrato-existe', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    staleTime: 30_000,
    queryFn: async (): Promise<ExtratoExistencia> => {
      const mm = String(mes).padStart(2, '0');
      const d1 = `${ano}-${mm}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const d2 = `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`;
      const { data, error: e } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('data_movimento, created_at')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .gte('data_movimento', d1)
        .lte('data_movimento', d2);
      if (e) throw e;
      const rows = (data as { data_movimento: string; created_at: string }[]) || [];
      if (rows.length === 0) return { movimentos: 0, periodo_ini: null, periodo_fim: null, importado_em: null };
      let ini = rows[0].data_movimento, fim = rows[0].data_movimento, imp = rows[0].created_at;
      for (const r of rows) {
        if (r.data_movimento < ini) ini = r.data_movimento;
        if (r.data_movimento > fim) fim = r.data_movimento;
        if (r.created_at < imp) imp = r.created_at;
      }
      return { movimentos: rows.length, periodo_ini: ini, periodo_fim: fim, importado_em: imp };
    },
  });
  const temExtrato = (extrato?.movimentos ?? 0) > 0;

  // Diagnóstico só faz sentido com extrato salvo -> enabled gated por temExtrato.
  const { data: diag, isLoading, error } = useQuery({
    queryKey: ['auditoria-soberana', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId && temExtrato,
    staleTime: 30_000,
    queryFn: async (): Promise<DiagnosticoSoberano | null> => {
      const { data, error: e } = await (supabase as any).rpc('fn_conciliacao_soberana', {
        p_cliente: clienteId, p_conta: contaId, p_mes: anoMes,
      });
      if (e) throw e;
      if (!data || !data.buckets) return null;
      return data as DiagnosticoSoberano;
    },
  });

  const nomeConta = useMemo(() => {
    const c = contas.find((x) => x.id === contaId);
    return c ? (c.nome_exibicao ?? c.nome_conta) : '';
  }, [contas, contaId]);

  // H1.1 read-only: botão = navegação por mês + toast de contexto. Nunca grava.
  const irLancamentos = (ctx: string) => {
    toast.info(ctx);
    onNavigateToLancamentos?.(ano, mes);
  };

  // Normaliza todos os buckets em linhas comuns da lista única.
  const linhas = useMemo<LinhaAud[]>(() => {
    if (!diag) return [];
    const b = diag.buckets;
    const out: LinhaAud[] = [];

    for (const it of b.divergencias_vinculo) {
      const desc = it.descricao ?? '—';
      const origem = labelOrigem(it.origem_lancamento);
      // valor de divergencia representa o movimento do extrato (lado OFX) -> direcao pelo sinal.
      const tipo = dirSinal(it.valor);
      const valor = Math.abs(it.valor);
      const motivo = it.motivo === 'data_divergente' && it.dias != null
        ? `${problemaMotivo(it.motivo)} (${it.dias}d)`
        : problemaMotivo(it.motivo);
      out.push({
        key: `div-${it.link_id}`, bucket: 'divergencias', status: 'Divergência', tom: 'rose',
        data: it.data_ofx, descricao: desc, origem, tipo, valor, motivo, motivoAcao: acaoMotivo(it.motivo),
        acaoLabel: 'Corrigir',
        onAcao: () => irLancamentos(`Corrigir vínculo · ${desc} · R$ ${fmtBRL(valor)} · ${motivo} · ${origem}`),
      });
    }

    for (const it of b.sistema_sem_extrato) {
      const desc = it.descricao ?? '—';
      const origem = labelOrigem(it.origem_lancamento);
      const valor = Math.abs(it.valor_assinado);
      const tipo = dirSinal(it.valor_assinado);
      out.push({
        key: `sis-${it.lancamento_id}`, bucket: 'sistema_sem_extrato',
        status: labelStatus(it.status_transacao), tom: tomStatusTransacao(it.status_transacao),
        data: it.data, descricao: desc, origem, tipo, valor,
        motivo: 'Lançado no sistema, sem movimento no extrato',
        motivoAcao: 'Confirme se o movimento existe no extrato ou ajuste o lançamento.',
        acaoLabel: 'Verificar',
        onAcao: () => irLancamentos(`Verificar lançamento sem extrato · ${desc} · R$ ${fmtBRL(valor)} · ${labelStatus(it.status_transacao)} · ${origem}`),
      });
    }

    for (const it of b.extrato_sem_sistema) {
      const desc = it.descricao ?? '—';
      const valor = Math.abs(it.valor);
      const tipo = dirTipo(it.tipo, it.valor);
      out.push({
        key: `ext-${it.extrato_id}`, bucket: 'extrato_sem_sistema', status: 'Falta no sistema', tom: 'amber',
        data: it.data, descricao: desc, origem: 'Extrato', tipo, valor,
        motivo: 'Movimento no extrato, sem lançamento no sistema',
        motivoAcao: 'Crie o lançamento correspondente a este movimento.',
        acaoLabel: 'Criar',
        onAcao: () => irLancamentos(`Criar lançamento p/ extrato · ${desc} · R$ ${fmtBRL(valor)} · Sem lançamento no sistema · Extrato`),
      });
    }

    for (const it of b.agrupamentos) {
      const composicao = it.lancamentos.map((l) => `R$ ${fmtBRL(Math.abs(l.valor_assinado))}`).join(' + ');
      const desc = `R$ ${fmtBRL(it.valor)} = ${composicao}`;
      out.push({
        key: `agr-${it.extrato_id}`, bucket: 'agrupamentos', status: 'Agrupado', tom: 'violet',
        data: null, descricao: desc, origem: 'Sugestão', tipo: dirSinal(it.valor), valor: Math.abs(it.valor),
        motivo: 'Candidato de agrupamento',
        motivoAcao: 'Sugestão de agrupar vários lançamentos para um único movimento.',
        acaoLabel: 'Agrupar',
        onAcao: () => toast.info(`Candidato de agrupamento: ${desc} (sugestão; gravação no H2)`),
      });
    }

    for (const it of b.desconsiderados) {
      const desc = it.descricao ?? '—';
      out.push({
        key: `des-${it.extrato_id}`, bucket: 'desconsiderados', status: 'Desconsiderado', tom: 'muted',
        data: it.data, descricao: desc, origem: it.tipo ?? 'Extrato', tipo: dirTipo(it.tipo, it.valor),
        valor: Math.abs(it.valor),
        motivo: 'Fora da conciliação por decisão operacional',
        motivoAcao: 'Movimento marcado para não entrar na conciliação.',
        acaoLabel: null,
      });
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diag, ano, mes]);

  const contagens = useMemo<Record<FiltroKey, number>>(() => {
    const c: Record<FiltroKey, number> = {
      todos: linhas.length, divergencias: 0, sistema_sem_extrato: 0, extrato_sem_sistema: 0,
      agrupamentos: 0, desconsiderados: 0, corretos: diag?.resumo.corretos.qtd ?? 0,
    };
    for (const l of linhas) c[l.bucket] += 1;
    return c;
  }, [linhas, diag]);

  const linhasFiltradas = useMemo(() => {
    if (filtroAtivo === 'todos' || filtroAtivo === 'corretos') return linhas;
    return linhas.filter((l) => l.bucket === filtroAtivo);
  }, [linhas, filtroAtivo]);

  const anos = [ano - 1, ano, ano + 1].filter((a, i, arr) => arr.indexOf(a) === i);

  return (
    <div className="space-y-3 p-2 overflow-auto h-full">
      {/* Cabeçalho: conta (agrupada) + mês + ano + veredito + carregar extrato */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Auditoria Bancária Soberana</span>
        <ContaBancariaSelect
          value={contaId}
          onValueChange={(id) => setContaId(id || null)}
          contas={contas}
          placeholder="Selecionar conta"
          className="h-8 text-xs w-[220px]"
        />
        <select className="text-xs border rounded px-2 py-1 bg-background" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-1 bg-background" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {temExtrato && diag && (
          diag.veredito.conciliado
            ? <StatusBadge texto="Conciliado" tom="emerald" />
            : <StatusBadge texto="Não fecha" tom="rose" />
        )}
      </div>

      {/* MUDANÇA 2 — Extrato soberano do mês (sempre no topo) */}
      {loadingExtrato && <Card className="p-3 text-xs text-muted-foreground">Verificando extrato…</Card>}
      {!loadingExtrato && extrato && (
        <ExtratoSoberanoCard
          extrato={extrato}
          nomeConta={nomeConta}
          ano={ano}
          mes={mes}
          onCarregar={() => setImportOpen(true)}
        />
      )}

      {/* Sem extrato salvo: nada a auditar abaixo. */}
      {temExtrato && isLoading && <Card className="p-3 text-xs text-muted-foreground">Carregando diagnóstico…</Card>}
      {temExtrato && error && <Card className="p-3 text-xs text-rose-600">Falha ao carregar o diagnóstico.</Card>}

      {temExtrato && diag && (
        <>
          <ResumoAuditoria diag={diag} nomeConta={nomeConta} />

          {/* MUDANÇA 3 — Próxima ação (derivada do veredito 01.4) */}
          <ProximaAcao diag={diag} onResolver={setFiltroAtivo} />

          <CardsFiltro ativo={filtroAtivo} onSelect={setFiltroAtivo} contagens={contagens} />

          {filtroAtivo === 'corretos' ? (
            <Card className="p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-700">Corretos</span>
                <span className="text-muted-foreground tabular-nums">
                  {diag.resumo.corretos.qtd} · R$ {fmtBRL(diag.resumo.corretos.valor)}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {diag.resumo.corretos.qtd} movimento(s) com vínculo válido. Lista detalhada fora do escopo do H1.
              </div>
            </Card>
          ) : (
            <Card className="p-0">
              {linhasFiltradas.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Nenhum movimento neste filtro. 🎉</div>
              ) : (
                <div className="divide-y px-3">
                  {linhasFiltradas.map((l) => <LinhaAuditoria key={l.key} linha={l} />)}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Carregar Extrato — reusa o modal de importação (OFX hoje; CSV/PDF/TXT depois) */}
      <ExtratoImportPreview
        open={importOpen}
        onClose={() => setImportOpen(false)}
        contaBancariaIdInicial={contaId ?? undefined}
        onImported={(r) => {
          toast.success(`${r.inseridos} movimento(s) importado(s).`);
          // MUDANÇA 4 — recarrega existência do extrato + diagnóstico (sem F5).
          queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
          queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
        }}
      />
    </div>
  );
}
