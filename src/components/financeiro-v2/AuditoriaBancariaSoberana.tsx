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
    extrato_cru: { movimentos: number; entradas: number; saidas: number; liquido: number; ignorados: number };
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
    problema: 'Extrato sem vínculo com o sistema',
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
  sugestao?: SugestaoPorLancamento;
  sugestaoInversa?: SugestaoPorOfx;
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

// ── C2.3 — Motor de SUGESTÃO de vínculo (PURO, read-only) ──────────────────
interface SugestaoVinculo {
  extrato_id: string;
  data: string | null;
  valor: number;          // assinado (sinal do OFX)
  descricao: string;
  origem: 'sem_vinculo' | 'vinculo_morto';
  dataIgual: boolean;
}
interface SugestaoPorLancamento {
  candidatos: SugestaoVinculo[];
  classe: 'sugestao' | 'possiveis';
}
// Espelho — sentido inverso OFX -> Sistema.
interface SugestaoLancamento {
  lancamento_id: string;
  data: string | null;
  valor: number;          // assinado (sinal do lançamento)
  descricao: string;
  status_transacao: string;
  origem_lancamento?: string | null;
  dataIgual: boolean;
}
interface SugestaoPorOfx {
  candidatos: SugestaoLancamento[];
  classe: 'sugestao' | 'possiveis';
}

// Cruza lançamentos órfãos (sistema_sem_extrato) com OFX disponíveis
// (extrato_sem_sistema + divergências motivo='cancelado' = vínculo morto).
// |valor| igual (obrigatório) + mesmo sinal. Data igual = confiança máxima.
// OFX com vínculo vivo NUNCA entra no pool. Não escreve nada.
function gerarSugestoes(diag: DiagnosticoSoberano): Record<string, SugestaoPorLancamento> {
  const b = diag.buckets;
  const pool: SugestaoVinculo[] = [];
  for (const x of (b.extrato_sem_sistema ?? [])) {
    pool.push({ extrato_id: x.extrato_id, data: x.data, valor: x.valor, descricao: x.descricao ?? '—', origem: 'sem_vinculo', dataIgual: false });
  }
  for (const x of (b.divergencias_vinculo ?? [])) {
    if (x.motivo === 'cancelado') {
      pool.push({ extrato_id: x.extrato_id, data: x.data_ofx, valor: x.valor, descricao: x.descricao ?? '—', origem: 'vinculo_morto', dataIgual: false });
    }
  }
  const out: Record<string, SugestaoPorLancamento> = {};
  for (const l of (b.sistema_sem_extrato ?? [])) {
    const alvo = l.valor_assinado;
    const cands = pool
      .filter((o) => Math.abs(Math.abs(o.valor) - Math.abs(alvo)) < 0.005 && Math.sign(o.valor) === Math.sign(alvo))
      .map((o) => ({ ...o, dataIgual: o.data === l.data }));
    if (cands.length === 0) continue;
    cands.sort((a, c) => Number(c.dataIgual) - Number(a.dataIgual));
    const fortes = cands.filter((c) => c.dataIgual);
    const classe: 'sugestao' | 'possiveis' = fortes.length === 1 ? 'sugestao' : 'possiveis';
    out[l.lancamento_id] = { candidatos: cands, classe };
  }
  return out;
}

// Espelho de gerarSugestoes: sentido inverso OFX -> Sistema. Para cada OFX órfão
// (extrato_sem_sistema), busca lançamentos órfãos (sistema_sem_extrato) com
// |valor| igual + mesmo sinal. Data igual = confiança máxima. PURO, read-only.
function gerarSugestoesInverso(diag: DiagnosticoSoberano): Record<string, SugestaoPorOfx> {
  const b = diag.buckets;
  const pool: SugestaoLancamento[] = [];
  for (const l of (b.sistema_sem_extrato ?? [])) {
    pool.push({ lancamento_id: l.lancamento_id, data: l.data, valor: l.valor_assinado, descricao: l.descricao ?? '—', status_transacao: l.status_transacao ?? '', origem_lancamento: l.origem_lancamento, dataIgual: false });
  }
  const out: Record<string, SugestaoPorOfx> = {};
  for (const e of (b.extrato_sem_sistema ?? [])) {
    const alvo = e.valor;
    const cands = pool
      .filter((c) => Math.abs(Math.abs(c.valor) - Math.abs(alvo)) < 0.005 && Math.sign(c.valor) === Math.sign(alvo))
      .map((c) => ({ ...c, dataIgual: c.data === e.data }));
    if (cands.length === 0) continue;
    cands.sort((a, c) => Number(c.dataIgual) - Number(a.dataIgual));
    const fortes = cands.filter((c) => c.dataIgual);
    const classe: 'sugestao' | 'possiveis' = fortes.length === 1 ? 'sugestao' : 'possiveis';
    out[e.extrato_id] = { candidatos: cands, classe };
  }
  return out;
}

function LinhaAuditoria({ linha }: { linha: LinhaAud }) {
  const motivoTitle = linha.motivoAcao ? `${linha.motivo} — ${linha.motivoAcao}` : linha.motivo;
  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1 text-[10px]">
        <StatusBadge texto={linha.status} tom={linha.tom} />
        <span className="w-10 shrink-0 text-muted-foreground">{fmtData(linha.data)}</span>
        <span className="flex-1 min-w-0 truncate" title={linha.descricao}>{linha.descricao}</span>
        <span className="w-20 shrink-0 truncate text-[9px] text-muted-foreground" title={linha.origem}>{linha.origem}</span>
        <TipoBadge tipo={linha.tipo} />
        <span className="w-24 shrink-0 text-right tabular-nums text-[11px]">R$ {fmtBRL(linha.valor)}</span>
        <span className="w-28 shrink-0 truncate text-[9px] text-muted-foreground" title={motivoTitle}>{linha.motivo}</span>
        {linha.acaoLabel ? (
          <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 shrink-0 w-[56px]" onClick={linha.onAcao}>
            {linha.acaoLabel}
          </Button>
        ) : (
          <span className="w-[56px] shrink-0" />
        )}
      </div>
      {linha.sugestao && (
        linha.sugestao.classe === 'sugestao' ? (
          <div className="mt-0.5 ml-10 pl-2 border-l-2 border-amber-300 flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="px-1 rounded bg-amber-100 text-amber-800 font-medium shrink-0">Sugestão</span>
            <span className="w-10 shrink-0">{fmtData(linha.sugestao.candidatos[0].data)}</span>
            <span className="flex-1 min-w-0 truncate" title={linha.sugestao.candidatos[0].descricao}>{linha.sugestao.candidatos[0].descricao}</span>
            <span className="shrink-0 text-[8px] italic">{linha.sugestao.candidatos[0].origem === 'vinculo_morto' ? 'vínculo cancelado' : 'sem vínculo'}</span>
            <span className="w-24 shrink-0 text-right tabular-nums">R$ {fmtBRL(Math.abs(linha.sugestao.candidatos[0].valor))}</span>
            <span className="flex gap-1 shrink-0">
              <Button size="sm" variant="outline" disabled title="Em breve — ação de vínculo (C2.4)" className="h-4 px-1 text-[8px]">Vincular</Button>
              <Button size="sm" variant="outline" disabled title="Em breve (C2.4)" className="h-4 px-1 text-[8px]">Ignorar</Button>
              <Button size="sm" variant="outline" disabled title="Em breve (C2.4)" className="h-4 px-1 text-[8px]">Editar</Button>
            </span>
          </div>
        ) : (
          <div className="mt-0.5 ml-10 pl-2 border-l-2 border-amber-300 text-[9px] text-amber-700">
            Possíveis vínculos: {linha.sugestao.candidatos.length} candidatos
          </div>
        )
      )}
      {linha.sugestaoInversa && (
        linha.sugestaoInversa.classe === 'sugestao' ? (
          <div className="mt-0.5 ml-10 pl-2 border-l-2 border-amber-300 flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="px-1 rounded bg-amber-100 text-amber-800 font-medium shrink-0">Sugestão</span>
            <span className="w-10 shrink-0">{fmtData(linha.sugestaoInversa.candidatos[0].data)}</span>
            <span className="flex-1 min-w-0 truncate" title={linha.sugestaoInversa.candidatos[0].descricao}>{linha.sugestaoInversa.candidatos[0].descricao}</span>
            <span className="shrink-0 text-[8px] italic">no sistema</span>
            <span className="w-24 shrink-0 text-right tabular-nums">R$ {fmtBRL(Math.abs(linha.sugestaoInversa.candidatos[0].valor))}</span>
            <span className="flex gap-1 shrink-0">
              <Button size="sm" variant="outline" disabled title="Em breve — ação de vínculo (C2.4)" className="h-4 px-1 text-[8px]">Vincular</Button>
              <Button size="sm" variant="outline" disabled title="Em breve (C2.4)" className="h-4 px-1 text-[8px]">Ignorar</Button>
              <Button size="sm" variant="outline" disabled title="Em breve (C2.4)" className="h-4 px-1 text-[8px]">Editar</Button>
            </span>
          </div>
        ) : (
          <div className="mt-0.5 ml-10 pl-2 border-l-2 border-amber-300 text-[9px] text-amber-700">
            Possíveis vínculos: {linha.sugestaoInversa.candidatos.length} candidatos
          </div>
        )
      )}
    </div>
  );
}

// ── C2 — Demonstrativo de posição da conta (Extrato × Sistema) ──────────────
function ResumoAuditoria({ diag, nomeConta, saldoInicial, saldoExtratoReal, aberto, onToggle }: { diag: DiagnosticoSoberano; nomeConta: string; saldoInicial: number | null; saldoExtratoReal: number | null; aberto: boolean; onToggle: () => void }) {
  const temSaldo = saldoInicial != null;
  // Saldo final calculado (inicial + entradas - saídas), por fonte.
  // Estreitamento por null-check no próprio saldoInicial (TS strict não narrowa via `temSaldo`).
  const saldoCalcExtrato = saldoInicial != null ? saldoInicial + diag.resumo.extrato_cru.entradas - diag.resumo.extrato_cru.saidas : null;
  const saldoCalcSistema = saldoInicial != null ? saldoInicial + diag.resumo.lv2.entradas - diag.resumo.lv2.saidas : null;
  // Indicador principal: Diferença de Saldo = Saldo Calculado (Sistema) − Saldo Extrato Real (banco/PDF).
  const difSaldo = (saldoCalcSistema != null && saldoExtratoReal != null) ? saldoCalcSistema - saldoExtratoReal : null;
  const difZero = difSaldo != null && Math.abs(difSaldo) < 0.005;
  // Coluna "Dif." — mesma régua em TODAS as linhas: Dif = Extrato − Sistema.
  const difEnt = diag.resumo.extrato_cru.entradas - diag.resumo.lv2.entradas;
  const difSai = diag.resumo.extrato_cru.saidas - diag.resumo.lv2.saidas;
  const difSFC = (saldoCalcExtrato != null && saldoCalcSistema != null) ? saldoCalcExtrato - saldoCalcSistema : null;
  const corDif = (d: number | null) =>
    d == null ? 'text-muted-foreground' : (Math.abs(d) < 0.005 ? 'text-emerald-600' : 'text-rose-600');
  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-1 border-b">
        <button type="button" onClick={onToggle} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} 📊 Resumo da auditoria
        </button>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 truncate max-w-[55%]">{nomeConta}</span>
      </div>
      {!aberto && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground flex flex-wrap gap-x-3 tabular-nums">
          {temSaldo ? (
            <>
              <span>Saldo Calculado {fmtBRL(saldoCalcSistema)}</span>
              <span>Saldo Extrato Real {fmtBRL(saldoExtratoReal)}</span>
              <span className={difZero ? 'text-emerald-600' : 'text-rose-600 font-semibold'}>Diferença de Saldo {fmtBRL(difSaldo)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Saldo inicial não informado</span>
          )}
        </div>
      )}
      {aberto && (
      <div className="px-3 py-2 grid grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
        <span />
        <span className="text-right font-medium text-muted-foreground">Extrato</span>
        <span className="text-right font-medium text-muted-foreground">Sistema</span>
        <span className="text-right font-medium text-muted-foreground">Dif.</span>

        <span className="text-muted-foreground">Saldo Inicial</span>
        <span className="text-right tabular-nums text-[12px]">{temSaldo ? fmtBRL(saldoInicial) : 'não informado'}</span>
        <span className="text-right tabular-nums text-[12px]">{temSaldo ? fmtBRL(saldoInicial) : 'não informado'}</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>

        <span className="text-muted-foreground">Entradas</span>
        <span className="text-right tabular-nums text-[12px]">{fmtBRL(diag.resumo.extrato_cru.entradas)}</span>
        <span className="text-right tabular-nums text-[12px]">{fmtBRL(diag.resumo.lv2.entradas)}</span>
        <span className={`text-right tabular-nums text-[12px] ${corDif(difEnt)}`}>{fmtBRL(difEnt)}</span>
        {/* H1.4: sub-linhas Terceiros/Transferências aqui — NÃO implementar agora */}

        <span className="text-muted-foreground">Saídas</span>
        <span className="text-right tabular-nums text-[12px]">{fmtBRL(diag.resumo.extrato_cru.saidas)}</span>
        <span className="text-right tabular-nums text-[12px]">{fmtBRL(diag.resumo.lv2.saidas)}</span>
        <span className={`text-right tabular-nums text-[12px] ${corDif(difSai)}`}>{fmtBRL(difSai)}</span>
        {/* H1.4: sub-linhas Terceiros/Transferências aqui — NÃO implementar agora */}

        <span className="col-span-4 border-t my-1" />

        <span className="text-muted-foreground font-medium">Saldo Final Calculado</span>
        <span className="text-right tabular-nums text-[12px] font-medium">{saldoCalcExtrato != null ? fmtBRL(saldoCalcExtrato) : '—'}</span>
        <span className="text-right tabular-nums text-[12px] font-medium">{saldoCalcSistema != null ? fmtBRL(saldoCalcSistema) : '—'}</span>
        <span className={`text-right tabular-nums text-[12px] font-medium ${corDif(difSFC)}`}>{difSFC != null ? fmtBRL(difSFC) : '—'}</span>

        <span className="col-span-2 text-muted-foreground">Saldo Extrato Real</span>
        <span className="text-right tabular-nums text-[12px] font-medium">{saldoExtratoReal != null ? fmtBRL(saldoExtratoReal) : 'não informado'}</span>
        <span className="text-right tabular-nums text-muted-foreground">—</span>

        <span className="col-span-4 border-t my-1" />

        <span className="text-muted-foreground font-semibold">Diferença de Saldo</span>
        <span className={`col-span-3 text-right tabular-nums text-[13px] font-bold ${difZero ? 'text-emerald-600' : 'text-rose-600'}`}>
          {difSaldo != null ? fmtBRL(difSaldo) : '—'}
        </span>
      </div>
      )}
    </div>
  );
}

// ── Cards-filtro clicáveis ─────────────────────────────────────────────────
function CardsFiltro({
  ativo, onSelect, contagens, valores,
}: {
  ativo: FiltroKey;
  onSelect: (k: FiltroKey) => void;
  contagens: Record<FiltroKey, number>;
  valores: Record<FiltroKey, number>;
}) {
  const FILTROS: { key: FiltroKey; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'divergencias', label: 'Divergências' },
    { key: 'sistema_sem_extrato', label: 'Sistema sem vínculo' },
    { key: 'extrato_sem_sistema', label: 'Extrato sem vínculo' },
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
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] transition-colors ${
              on ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            <span>{f.label}</span>
            <span className={`tabular-nums font-semibold ${on ? 'text-foreground' : 'text-foreground/80'}`}>{contagens[f.key]}</span>
            <span className="text-[8px] text-muted-foreground tabular-nums">R$ {fmtBRL(valores[f.key])}</span>
          </button>
        );
      })}
    </div>
  );
}

function Campo({ label, valor, muted }: { label: string; valor: string; muted?: boolean }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] truncate ${muted ? 'text-muted-foreground italic' : ''}`} title={valor}>{valor}</span>
    </div>
  );
}

// ── MUDANÇA 2 — Extrato soberano do mês (cabeçalho de decisão) ─────────────
function ExtratoSoberanoCard({
  extrato, nomeConta, ano, mes, onCarregar, aberto, onToggle,
}: {
  extrato: ExtratoExistencia; nomeConta: string; ano: number; mes: number; onCarregar: () => void;
  aberto: boolean; onToggle: () => void;
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
    <Card className="p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onToggle} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} Extrato soberano do mês
        </button>
        <StatusBadge texto="Extrato carregado" tom="emerald" />
      </div>
      {aberto ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
            <Campo label="Conta" valor={nomeConta || '—'} />
            <Campo label="Mês" valor={`${MESES[mes - 1]}/${ano}`} />
            <Campo label="Movimentos" valor={String(extrato.movimentos)} />
            <Campo label="Período" valor={`${fmtData(extrato.periodo_ini)} – ${fmtData(extrato.periodo_fim)}`} />
            <Campo label="Importado em" valor={fmtDataHora(extrato.importado_em)} />
            <Campo label="Arquivo" valor="não disponível" muted />
            <Campo label="Saldo" valor="não disponível" muted />
          </div>
          <div className="flex justify-start gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCarregar}>Ver extrato</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCarregar}>Carregar versão atualizada</Button>
          </div>
        </>
      ) : (
        <div className="text-[11px] text-muted-foreground truncate">
          {nomeConta || '—'} · {MESES[mes - 1]}/{ano} · {extrato.movimentos} movimentos · carregado
        </div>
      )}
    </Card>
  );
}

// ── C3 ONDA 1 — Extratos espelhados (Comparação + Diagnóstico). READ-ONLY ──
// Tudo derivado do diag existente. Consome o motor bilateral; não reimplementa
// matching, não busca dados, não escreve. NÃO é o extrato completo linha-a-linha.
interface LadoOfx { extrato_id: string; data: string | null; valor: number; descricao: string; }
interface LadoSis { lancamento_id: string; data: string | null; valor: number; descricao: string; }
interface ParEspelho { key: string; ofx?: LadoOfx; sistema?: LadoSis; classe?: 'forte' | 'possiveis'; nPossiveis?: number; }

function montarPares(diag: DiagnosticoSoberano): ParEspelho[] {
  const b = diag.buckets;
  const sug = gerarSugestoes(diag);          // lancamento_id -> OFX candidatos
  const sugInv = gerarSugestoesInverso(diag); // extrato_id -> lançamento candidatos
  const seen = new Set<string>();
  const out: ParEspelho[] = [];
  for (const l of (b.sistema_sem_extrato ?? [])) {
    const sis: LadoSis = { lancamento_id: l.lancamento_id, data: l.data, valor: l.valor_assinado, descricao: l.descricao ?? '—' };
    const s = sug[l.lancamento_id];
    if (s && s.candidatos.length) {
      const c = s.candidatos[0];
      const key = `${c.extrato_id}|${l.lancamento_id}`;
      seen.add(key);
      out.push({ key, sistema: sis, ofx: { extrato_id: c.extrato_id, data: c.data, valor: c.valor, descricao: c.descricao }, classe: s.classe === 'sugestao' ? 'forte' : 'possiveis', nPossiveis: s.candidatos.length });
    } else {
      out.push({ key: `sis-${l.lancamento_id}`, sistema: sis });
    }
  }
  for (const e of (b.extrato_sem_sistema ?? [])) {
    const ofx: LadoOfx = { extrato_id: e.extrato_id, data: e.data, valor: e.valor, descricao: e.descricao ?? '—' };
    const s = sugInv[e.extrato_id];
    if (s && s.candidatos.length) {
      const c = s.candidatos[0];
      const key = `${e.extrato_id}|${c.lancamento_id}`;
      if (seen.has(key)) continue; // dedup: par já mostrado via sistema->ofx
      seen.add(key);
      out.push({ key, ofx, sistema: { lancamento_id: c.lancamento_id, data: c.data, valor: c.valor, descricao: c.descricao }, classe: s.classe === 'sugestao' ? 'forte' : 'possiveis', nPossiveis: s.candidatos.length });
    } else {
      out.push({ key: `ext-${e.extrato_id}`, ofx });
    }
  }
  return out;
}

type Sev = 'vermelho' | 'laranja' | 'amarelo' | 'verde';
interface Achado { sev: Sev; titulo: string; texto: string; }

function montarAchados(diag: DiagnosticoSoberano): Achado[] {
  const b = diag.buckets;
  const r = diag.resumo;
  const sug = gerarSugestoes(diag);
  const sugInv = gerarSugestoesInverso(diag);
  const out: Achado[] = [];

  // Divergência Extrato x Sistema — líquido (Extrato − Sistema). NÃO é "saldo não fecha".
  const difLiquido = (r.extrato_cru.entradas - r.extrato_cru.saidas) - (r.lv2.entradas - r.lv2.saidas);
  if (Math.abs(difLiquido) >= 0.005) {
    out.push({ sev: 'vermelho', titulo: 'Divergência Extrato × Sistema', texto: `Diferença líquida (Extrato − Sistema): R$ ${fmtBRL(difLiquido)}.` });
  }
  const fortesOfx = (b.extrato_sem_sistema ?? []).filter((e) => sugInv[e.extrato_id]?.classe === 'sugestao').length;
  if (fortesOfx > 0) {
    out.push({ sev: 'verde', titulo: 'Vínculos prováveis encontrados', texto: `${fortesOfx} movimento(s) do extrato já têm lançamento provável no sistema.` });
  }
  const lancSemOfx = (b.sistema_sem_extrato ?? []).filter((l) => !sug[l.lancamento_id]).length;
  if (lancSemOfx > 0) {
    out.push({ sev: 'amarelo', titulo: 'Lançamentos sem movimento no extrato', texto: `${lancSemOfx} lançamento(s) sem movimento correspondente no extrato.` });
  }
  const ofxSemLanc = (b.extrato_sem_sistema ?? []).filter((e) => !sugInv[e.extrato_id]).length;
  if (ofxSemLanc > 0) {
    out.push({ sev: 'amarelo', titulo: 'Movimentos sem lançamento', texto: `${ofxSemLanc} movimento(s) do extrato sem lançamento no sistema.` });
  }
  // Duplicidade provável — só nos itens disponíveis do diag (não afirma extrato completo).
  const grupos = new Map<string, { valor: number; data: string | null; n: number }>();
  for (const e of (b.extrato_sem_sistema ?? [])) {
    const k = `${Math.round(Math.abs(e.valor) * 100)}|${e.data ?? ''}`;
    const g = grupos.get(k);
    if (g) g.n += 1; else grupos.set(k, { valor: Math.abs(e.valor), data: e.data, n: 1 });
  }
  for (const g of grupos.values()) {
    if (g.n >= 2) out.push({ sev: 'laranja', titulo: 'Possível duplicidade', texto: `${g.n} movimentos de R$ ${fmtBRL(g.valor)} em ${fmtData(g.data)} (nos itens disponíveis do diag).` });
  }
  const invRe = /cdb|invest|aplic|resg/i;
  const invest = (b.extrato_sem_sistema ?? []).filter((e) => invRe.test(e.descricao ?? '')).length;
  if (invest > 0) {
    out.push({ sev: 'amarelo', titulo: 'Movimentos de investimento', texto: `${invest} movimento(s) de investimento podem inflar o bruto.` });
  }
  if (out.length === 0) out.push({ sev: 'verde', titulo: 'Sem achados relevantes', texto: 'Nada a destacar nos itens disponíveis do diagnóstico.' });
  return out;
}

function LadoCelula({ data, valor, descricao }: { data: string | null; valor: number; descricao: string }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="w-9 shrink-0 text-muted-foreground">{fmtData(data)}</span>
      <span className={`shrink-0 ${valor >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{valor >= 0 ? '▲' : '▼'}</span>
      <span className="flex-1 min-w-0 truncate" title={descricao}>{descricao}</span>
      <span className="shrink-0 tabular-nums">{fmtBRL(Math.abs(valor))}</span>
    </div>
  );
}

function LinhaPar({ par }: { par: ParEspelho }) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[10px] border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        {par.ofx ? <LadoCelula data={par.ofx.data} valor={par.ofx.valor} descricao={par.ofx.descricao} /> : <span className="text-[9px] italic text-muted-foreground">— sem vínculo</span>}
      </div>
      <div className="w-16 shrink-0 flex justify-center">
        {par.classe === 'forte' && <span className="px-1 rounded bg-emerald-100 text-emerald-700 text-[8px] font-medium">forte</span>}
        {par.classe === 'possiveis' && <span className="px-1 rounded bg-amber-100 text-amber-700 text-[8px] font-medium">{par.nPossiveis} poss.</span>}
      </div>
      <div className="flex-1 min-w-0">
        {par.sistema ? <LadoCelula data={par.sistema.data} valor={par.sistema.valor} descricao={par.sistema.descricao} /> : <span className="text-[9px] italic text-muted-foreground">— sem vínculo</span>}
      </div>
    </div>
  );
}

function ComparacaoEspelhada({ diag }: { diag: DiagnosticoSoberano }) {
  const pares = useMemo(() => montarPares(diag), [diag]);
  if (pares.length === 0) return <div className="p-3 text-center text-[11px] text-muted-foreground">Nada a comparar — sem itens não resolvidos. 🎉</div>;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-muted-foreground">
        <span className="flex-1">Extrato (OFX)</span>
        <span className="w-16 shrink-0 text-center" />
        <span className="flex-1">Sistema</span>
      </div>
      <div className="max-h-[50vh] overflow-y-auto divide-y-0">
        {pares.map((p) => <LinhaPar key={p.key} par={p} />)}
      </div>
    </div>
  );
}

function ChipAchado({ sev, titulo, texto }: Achado) {
  const cor = { vermelho: 'border-rose-300 bg-rose-50', laranja: 'border-orange-300 bg-orange-50', amarelo: 'border-amber-300 bg-amber-50', verde: 'border-emerald-300 bg-emerald-50' }[sev];
  const dot = { vermelho: 'bg-rose-500', laranja: 'bg-orange-500', amarelo: 'bg-amber-500', verde: 'bg-emerald-500' }[sev];
  return (
    <div className={`flex items-start gap-2 rounded border px-2 py-1 ${cor}`}>
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold">{titulo}</div>
        <div className="text-[10px] text-muted-foreground">{texto}</div>
      </div>
    </div>
  );
}

function DiagnosticoAutomatico({ diag }: { diag: DiagnosticoSoberano }) {
  const achados = useMemo(() => montarAchados(diag), [diag]);
  return (
    <div className="space-y-1">
      {achados.map((a, i) => <ChipAchado key={i} sev={a.sev} titulo={a.titulo} texto={a.texto} />)}
    </div>
  );
}

function ExtratosEspelhados({ diag, saldoInicial, saldoExtratoReal, nomeConta }: { diag: DiagnosticoSoberano; saldoInicial: number | null; saldoExtratoReal: number | null; nomeConta: string }) {
  const [aberto, setAberto] = useState(false);
  const [view, setView] = useState<'comparacao' | 'diagnostico'>('comparacao');
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} Ver comparação e diagnóstico
        </button>
        <span className="text-[10px] text-muted-foreground truncate max-w-[45%]" title={nomeConta}>{nomeConta}</span>
      </div>
      {aberto && (
        <>
          <div className="flex gap-1">
            <button type="button" onClick={() => setView('comparacao')} className={`px-2 py-0.5 rounded text-[10px] border ${view === 'comparacao' ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground'}`}>Comparação</button>
            <button type="button" onClick={() => setView('diagnostico')} className={`px-2 py-0.5 rounded text-[10px] border ${view === 'diagnostico' ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground'}`}>Diagnóstico</button>
          </div>
          {view === 'comparacao' ? <ComparacaoEspelhada diag={diag} /> : <DiagnosticoAutomatico diag={diag} />}
        </>
      )}
    </Card>
  );
}

// ── C3.2-MOCK — Protótipo visual dos Extratos Espelhados (DADOS FICTÍCIOS) ──
// PROTÓTIPO de UI. Tudo hardcoded; NÃO usa diag/buckets/banco/RPC. Read-only.
// Objetivo: aprovar layout das 4 abas antes da fonte de dados real (C3.3-DADOS).
type MockStatus = 'conciliado' | 'sem_vinculo' | 'dup' | 'investimento' | 'transferencia' | null;

const MOCK_OFX = [
  { data: '01/05', hist: 'Saldo Inicial',   valor: null,        saldo: 100.00,     status: null as MockStatus },
  { data: '04/05', hist: 'Pix Cliente X',   valor: 10000.00,    saldo: 10100.00,   status: 'conciliado' as MockStatus },
  { data: '07/05', hist: 'Compra Insumos',  valor: -2500.00,    saldo: 7600.00,    status: 'conciliado' as MockStatus },
  { data: '11/05', hist: 'Parcela Crédito', valor: -195720.44,  saldo: -188120.44, status: 'sem_vinculo' as MockStatus },
  { data: '21/05', hist: 'Pix Diocese',     valor: -2500.00,    saldo: -190620.44, status: 'sem_vinculo' as MockStatus },
];
const MOCK_SISTEMA = [
  { data: '01/05', desc: 'Saldo Inicial', centro: '',                       valor: null,     saldo: 100.00,  status: null as MockStatus },
  { data: '21/05', desc: 'Pix Diocese',   centro: 'Receitas / Doações',     valor: -2500.00, saldo: 5100.00, status: 'conciliado' as MockStatus },
  { data: '14/05', desc: 'Salário',       centro: 'Mão de obra / Salários', valor: -1200.00, saldo: 6400.00, status: 'sem_vinculo' as MockStatus },
];
const MOCK_ESPELHO = [
  { ofx: '21/05 Pix Diocese -2.500',       sistema: '21/05 Pix Diocese -2.500', rel: 'par' as const },
  { ofx: '11/05 Parcela Crédito -195.720', sistema: null as string | null,      rel: 'so_ofx' as const },
  { ofx: null as string | null,            sistema: '14/05 Salário -1.200',     rel: 'so_sistema' as const },
];
const MOCK_EVOLUCAO = [
  { data: '01/05', saldoOfx: 100.00,     saldoSis: 100.00,  dif: 0.00 },
  { data: '07/05', saldoOfx: 7600.00,    saldoSis: 7600.00, dif: 0.00 },
  { data: '11/05', saldoOfx: -188120.44, saldoSis: 7600.00, dif: 195720.44 },
  { data: '21/05', saldoOfx: -190620.44, saldoSis: 5100.00, dif: 195720.44 },
];

const corValor = (v: number | null) => (v == null ? 'text-muted-foreground' : v >= 0 ? 'text-blue-600' : 'text-rose-600');
const corSaldo = (v: number) => (v >= 0 ? 'text-blue-600' : 'text-rose-600');
const STATUS_MOCK: Record<string, { icon: string; label: string; cls: string }> = {
  conciliado:    { icon: '✓',  label: 'conciliado',    cls: 'text-emerald-700' },
  sem_vinculo:   { icon: '⚠',  label: 'sem vínculo',   cls: 'text-amber-700' },
  dup:           { icon: '⚠',  label: 'dup?',          cls: 'text-orange-700' },
  investimento:  { icon: '💰', label: 'investimento',  cls: 'text-violet-700' },
  transferencia: { icon: '🔄', label: 'transferência', cls: 'text-blue-700' },
};
function StatusMockCell({ status }: { status: MockStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = STATUS_MOCK[status];
  return <span className={`${s.cls} text-[9px]`}>{s.icon} {s.label}</span>;
}
function SeloMock() {
  return (
    <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 text-[9px] font-bold uppercase tracking-wide shrink-0">
      MOCK · exemplo visual
    </span>
  );
}

function AbaOfxMock() {
  return (
    <div className="text-[10px]">
      <div className="grid grid-cols-[40px_1fr_90px_90px_90px] gap-1 font-semibold text-muted-foreground border-b pb-0.5">
        <span>Data</span><span>Histórico</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      {MOCK_OFX.map((r, i) => (
        <div key={i} className="grid grid-cols-[40px_1fr_90px_90px_90px] gap-1 py-0.5 border-b last:border-b-0 items-center">
          <span className="text-muted-foreground">{r.data}</span>
          <span className="truncate" title={r.hist}>{r.hist}</span>
          <span className={`text-right tabular-nums ${corValor(r.valor)}`}>{fmtBRL(r.valor)}</span>
          <span className={`text-right tabular-nums ${corSaldo(r.saldo)}`}>{fmtBRL(r.saldo)}</span>
          <StatusMockCell status={r.status} />
        </div>
      ))}
    </div>
  );
}
function AbaSistemaMock() {
  return (
    <div className="text-[10px]">
      <div className="grid grid-cols-[40px_1fr_120px_80px_80px_80px] gap-1 font-semibold text-muted-foreground border-b pb-0.5">
        <span>Data</span><span>Descrição</span><span>Centro/Subcentro</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      {MOCK_SISTEMA.map((r, i) => (
        <div key={i} className="grid grid-cols-[40px_1fr_120px_80px_80px_80px] gap-1 py-0.5 border-b last:border-b-0 items-center">
          <span className="text-muted-foreground">{r.data}</span>
          <span className="truncate" title={r.desc}>{r.desc}</span>
          <span className="truncate text-muted-foreground" title={r.centro}>{r.centro || '—'}</span>
          <span className={`text-right tabular-nums ${corValor(r.valor)}`}>{fmtBRL(r.valor)}</span>
          <span className={`text-right tabular-nums ${corSaldo(r.saldo)}`}>{fmtBRL(r.saldo)}</span>
          <StatusMockCell status={r.status} />
        </div>
      ))}
    </div>
  );
}
function EspelhoParMock({ par }: { par: typeof MOCK_ESPELHO[number] }) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[10px] border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        {par.ofx ? <span className="truncate block" title={par.ofx}>{par.ofx}</span> : <span className="text-[9px] italic text-muted-foreground">SEM OFX</span>}
      </div>
      <div className="w-16 shrink-0 text-center">
        {par.rel === 'par' ? <span className="text-emerald-600">◀────▶</span> : <span className="text-muted-foreground">────</span>}
      </div>
      <div className="flex-1 min-w-0 text-right">
        {par.sistema ? <span className="truncate block" title={par.sistema}>{par.sistema}</span> : <span className="text-[9px] italic text-muted-foreground">SEM LANÇAMENTO</span>}
      </div>
    </div>
  );
}
function AbaEspelhoMock() {
  return (
    <div>
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-muted-foreground border-b pb-0.5">
        <span className="flex-1">Extrato OFX</span><span className="w-16 text-center" /><span className="flex-1 text-right">Sistema</span>
      </div>
      {MOCK_ESPELHO.map((p, i) => <EspelhoParMock key={i} par={p} />)}
    </div>
  );
}
function AbaEvolucaoMock() {
  // primeira linha onde a diferença passa de 0 -> != 0 (onde a divergência nasce).
  let nasceIdx = -1;
  for (let i = 0; i < MOCK_EVOLUCAO.length; i++) {
    if (Math.abs(MOCK_EVOLUCAO[i].dif) >= 0.005 && (i === 0 || Math.abs(MOCK_EVOLUCAO[i - 1].dif) < 0.005)) { nasceIdx = i; break; }
  }
  return (
    <div className="text-[10px]">
      <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-1 font-semibold text-muted-foreground border-b pb-0.5">
        <span>Data</span><span className="text-right">Saldo OFX</span><span className="text-right">Saldo Sistema</span><span className="text-right">Diferença</span>
      </div>
      {MOCK_EVOLUCAO.map((r, i) => {
        const difZero = Math.abs(r.dif) < 0.005;
        const nasce = i === nasceIdx;
        return (
          <div key={i} className={`grid grid-cols-[64px_1fr_1fr_1fr] gap-1 py-0.5 border-b last:border-b-0 items-center ${nasce ? 'border-l-2 border-l-rose-500 bg-rose-50/50' : ''}`}>
            <span className="text-muted-foreground flex items-center gap-1">{r.data}{nasce && <span className="px-1 rounded bg-rose-200 text-rose-800 text-[8px] font-bold">nasce aqui</span>}</span>
            <span className={`text-right tabular-nums ${corSaldo(r.saldoOfx)}`}>{fmtBRL(r.saldoOfx)}</span>
            <span className={`text-right tabular-nums ${corSaldo(r.saldoSis)}`}>{fmtBRL(r.saldoSis)}</span>
            <span className={`text-right tabular-nums ${difZero ? 'text-muted-foreground' : 'text-rose-600 font-medium'}`}>{fmtBRL(r.dif)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ExtratosEspelhadosMock() {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'ofx' | 'sistema' | 'espelho' | 'evolucao'>('espelho');
  const abas: { key: 'ofx' | 'sistema' | 'espelho' | 'evolucao'; label: string }[] = [
    { key: 'ofx', label: 'Extrato OFX' },
    { key: 'sistema', label: 'Extrato Sistema' },
    { key: 'espelho', label: 'Espelhado' },
    { key: 'evolucao', label: 'Evolução da Divergência' },
  ];
  return (
    <Card className="p-3 space-y-2 border-dashed border-fuchsia-300">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} Ver protótipo: Extratos Espelhados (MOCK)
        </button>
        <SeloMock />
      </div>
      {aberto && (
        <>
          <div className="flex flex-wrap gap-1">
            {abas.map((a) => (
              <button key={a.key} type="button" onClick={() => setAba(a.key)}
                className={`px-2 py-0.5 rounded text-[10px] border ${aba === a.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground'}`}>
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-fuchsia-700">
            <SeloMock /> <span>Números fictícios — apenas para validar o layout. Nenhum dado real.</span>
          </div>
          {aba === 'ofx' && <AbaOfxMock />}
          {aba === 'sistema' && <AbaSistemaMock />}
          {aba === 'espelho' && <AbaEspelhoMock />}
          {aba === 'evolucao' && <AbaEvolucaoMock />}
        </>
      )}
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
  const [cardsTopoAbertos, setCardsTopoAbertos] = useState(false);
  const [ordenacao, setOrdenacao] = useState<'valor_desc' | 'valor_asc' | 'data_asc' | 'data_desc' | 'descricao' | 'tipo'>('data_desc');

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

  // C2 — saldo inicial do mês = saldo_final do mês anterior (financeiro_saldos_bancarios_v2).
  // Leitura client-side; não toca a RPC. null quando o mês anterior não foi calculado.
  const { data: saldoAnterior } = useQuery({
    queryKey: ['auditoria-saldo-anterior', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const mPrev = mes === 1 ? 12 : mes - 1;
      const aPrev = mes === 1 ? ano - 1 : ano;
      const anoMesPrev = `${aPrev}-${String(mPrev).padStart(2, '0')}`;
      const { data, error } = await (supabase as any)
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .eq('ano_mes', anoMesPrev)
        .maybeSingle();
      if (error) throw error;
      return data?.saldo_final != null ? Number(data.saldo_final) : null;
    },
  });

  // C2.1 — saldo final REAL conferido do extrato (financeiro_saldos_bancarios_v2.saldo_final do mês atual).
  const { data: saldoExtratoReal } = useQuery({
    queryKey: ['auditoria-saldo-extrato-real', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await (supabase as any)
        .from('financeiro_saldos_bancarios_v2')
        .select('saldo_final')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .eq('ano_mes', anoMes)
        .maybeSingle();
      if (error) throw error;
      return data?.saldo_final != null ? Number(data.saldo_final) : null;
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
    const sugestoes = gerarSugestoes(diag);
    const sugestoesInv = gerarSugestoesInverso(diag);
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
        motivo: 'Lançado no sistema, sem vínculo com o extrato',
        motivoAcao: 'Confirme se o movimento existe no extrato ou ajuste o lançamento.',
        acaoLabel: 'Verificar',
        onAcao: () => irLancamentos(`Verificar lançamento sem vínculo · ${desc} · R$ ${fmtBRL(valor)} · ${labelStatus(it.status_transacao)} · ${origem}`),
        sugestao: sugestoes[it.lancamento_id],
      });
    }

    for (const it of b.extrato_sem_sistema) {
      const desc = it.descricao ?? '—';
      const valor = Math.abs(it.valor);
      const tipo = dirTipo(it.tipo, it.valor);
      out.push({
        key: `ext-${it.extrato_id}`, bucket: 'extrato_sem_sistema', status: 'Sem vínculo', tom: 'amber',
        data: it.data, descricao: desc, origem: 'Extrato', tipo, valor,
        motivo: 'Movimento no extrato, sem vínculo com o sistema',
        motivoAcao: 'Crie o lançamento correspondente a este movimento.',
        acaoLabel: 'Criar',
        onAcao: () => irLancamentos(`Criar lançamento p/ extrato · ${desc} · R$ ${fmtBRL(valor)} · Sem lançamento no sistema · Extrato`),
        sugestaoInversa: sugestoesInv[it.extrato_id],
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

  const valores = useMemo<Record<FiltroKey, number>>(() => {
    const v: Record<FiltroKey, number> = {
      todos: 0, divergencias: 0, sistema_sem_extrato: 0, extrato_sem_sistema: 0,
      agrupamentos: 0, desconsiderados: 0, corretos: Math.abs(diag?.resumo.corretos.valor ?? 0),
    };
    for (const l of linhas) {
      const a = Math.abs(l.valor);
      v[l.bucket] += a;
      v.todos += a;
    }
    return v;
  }, [linhas, diag]);

  const linhasFiltradas = useMemo(() => {
    const base = (filtroAtivo === 'todos' || filtroAtivo === 'corretos')
      ? linhas
      : linhas.filter((l) => l.bucket === filtroAtivo);
    const arr = [...base];
    const cmpData = (a: LinhaAud, b: LinhaAud) => (a.data ?? '').localeCompare(b.data ?? '');
    switch (ordenacao) {
      case 'valor_desc': arr.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)); break;
      case 'valor_asc':  arr.sort((a, b) => Math.abs(a.valor) - Math.abs(b.valor)); break;
      case 'data_asc':   arr.sort(cmpData); break;
      case 'data_desc':  arr.sort((a, b) => cmpData(b, a)); break;
      case 'descricao':  arr.sort((a, b) => a.descricao.localeCompare(b.descricao)); break;
      case 'tipo':       arr.sort((a, b) => a.tipo.localeCompare(b.tipo)); break;
    }
    return arr;
  }, [linhas, filtroAtivo, ordenacao]);

  const anos = [ano - 1, ano, ano + 1].filter((a, i, arr) => arr.indexOf(a) === i);

  return (
    <div className="space-y-1.5 p-2 overflow-auto h-full">
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

      {/* MUDANÇA 2 — Extrato soberano do mês (standalone só quando não há diag p/ 2 colunas) */}
      {loadingExtrato && <Card className="p-3 text-xs text-muted-foreground">Verificando extrato…</Card>}
      {!loadingExtrato && extrato && !(temExtrato && diag) && (
        <ExtratoSoberanoCard
          extrato={extrato}
          nomeConta={nomeConta}
          ano={ano}
          mes={mes}
          onCarregar={() => setImportOpen(true)}
          aberto={cardsTopoAbertos}
          onToggle={() => setCardsTopoAbertos((v) => !v)}
        />
      )}

      {/* Sem extrato salvo: nada a auditar abaixo. */}
      {temExtrato && isLoading && <Card className="p-3 text-xs text-muted-foreground">Carregando diagnóstico…</Card>}
      {temExtrato && error && <Card className="p-3 text-xs text-rose-600">Falha ao carregar o diagnóstico.</Card>}

      {temExtrato && diag && (
        <>
          {/* FASE 2 — Extrato + Resumo lado a lado (empilha no mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            <ExtratoSoberanoCard
              extrato={extrato!}
              nomeConta={nomeConta}
              ano={ano}
              mes={mes}
              onCarregar={() => setImportOpen(true)}
              aberto={cardsTopoAbertos}
              onToggle={() => setCardsTopoAbertos((v) => !v)}
            />
            <ResumoAuditoria
              diag={diag}
              nomeConta={nomeConta}
              saldoInicial={saldoAnterior ?? null}
              saldoExtratoReal={saldoExtratoReal ?? null}
              aberto={cardsTopoAbertos}
              onToggle={() => setCardsTopoAbertos((v) => !v)}
            />
          </div>

          <CardsFiltro ativo={filtroAtivo} onSelect={setFiltroAtivo} contagens={contagens} valores={valores} />

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
            <>
              {/* FASE 6 — ordenação (client-side, fora do container que scrolla) */}
              <div className="flex items-center justify-end gap-2">
                <span className="text-[11px] text-muted-foreground">Ordenar:</span>
                <select className="text-xs border rounded px-2 py-1 bg-background"
                  value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as typeof ordenacao)}>
                  <option value="data_desc">Data ↓</option>
                  <option value="data_asc">Data ↑</option>
                  <option value="valor_desc">Maior valor</option>
                  <option value="valor_asc">Menor valor</option>
                  <option value="descricao">Descrição A-Z</option>
                  <option value="tipo">Tipo</option>
                </select>
              </div>
              <Card className="p-0">
                {linhasFiltradas.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Nenhum movimento neste filtro. 🎉</div>
                ) : (
                  <div className="divide-y px-3 max-h-[60vh] overflow-y-auto">
                    {linhasFiltradas.map((l) => <LinhaAuditoria key={l.key} linha={l} />)}
                  </div>
                )}
              </Card>
            </>
          )}

          {/* C3 ONDA 1 — Comparação e diagnóstico (card recolhível, read-only) */}
          <ExtratosEspelhados
            diag={diag}
            saldoInicial={saldoAnterior ?? null}
            saldoExtratoReal={saldoExtratoReal ?? null}
            nomeConta={nomeConta}
          />

          {/* C3.2-MOCK — Protótipo visual (dados fictícios, sem banco) */}
          <ExtratosEspelhadosMock />
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
