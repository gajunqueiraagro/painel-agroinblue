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
import { DecisaoDerivadosDialog } from '@/components/financeiro-v2/DecisaoDerivadosDialog';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { ExtratoImportPreview } from '@/components/financeiro-v2/ExtratoImportPreview';
import { EstacaoConciliacao } from '@/components/financeiro-v2/EstacaoConciliacao';
import { LancamentoLeituraDialog } from '@/components/financeiro-v2/LancamentoLeituraDialog';
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
// grupos_conciliados (RPC 01.10): vínculos REAIS do cbi (1xN/Nx1). NÃO confundir
// com AgrItem (bucket agrupamentos = sugestão/heurística). São buckets distintos.
interface GrupoAncora { id: string; data: string | null; valor: number; descricao: string | null; }
interface GrupoMembro { id: string; data: string | null; valor_assinado: number; descricao: string | null; }
interface GrupoConciliado {
  tipo: '1xN' | 'Nx1';
  ancora: GrupoAncora;
  membros: GrupoMembro[];
  total_ofx: number; total_sistema: number; diferenca: number;
  status_grupo: 'batido' | 'divergente';
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
    grupos_conciliados: GrupoConciliado[];
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
          <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 shrink-0 whitespace-nowrap min-w-[56px]" onClick={linha.onAcao}>
            {linha.acaoLabel}
          </Button>
        ) : (
          <span className="min-w-[56px] shrink-0" />
        )}
      </div>
      {/* Fase A — fila de trabalho: "por quê" explícito (guidance vinda do read-model). */}
      {linha.motivoAcao && (
        <div className="ml-10 mt-0.5 text-[9px] text-muted-foreground">Por quê: {linha.motivoAcao}</div>
      )}
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
      <div className="px-3 py-1.5 space-y-1.5">
        {/* HERO — 1º Status (veredito: fecha?) · 2º Diferença de Saldo (saldo bate?) */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-md border px-2 py-1 ${diag.veredito.conciliado ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">Status</span>
            <span className={`block text-[15px] font-bold leading-tight ${diag.veredito.conciliado ? 'text-emerald-700' : 'text-rose-700'}`}>
              {diag.veredito.conciliado ? '✔ Conciliado' : '✖ Não fecha'}
            </span>
          </div>
          <div className={`rounded-md border px-2 py-1 ${difSaldo == null ? 'bg-muted/30' : difZero ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">Diferença de Saldo</span>
            <span className={`block text-[15px] font-bold leading-tight tabular-nums ${difSaldo == null ? 'text-muted-foreground' : difZero ? 'text-emerald-700' : 'text-rose-700'}`}>
              {difSaldo == null ? '—' : `${difZero ? '✔' : '✖'} ${fmtBRL(difSaldo)}`}
            </span>
          </div>
        </div>

        {/* TABELA — ordem cronológica; Saldo Final Calculado destacado (3º ponto de atenção) */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-0 text-[11px] leading-tight">
          <span />
          <span className="text-right text-[9px] font-medium text-muted-foreground">Extrato</span>
          <span className="text-right text-[9px] font-medium text-muted-foreground">Sistema</span>
          <span className="text-right text-[9px] font-medium text-muted-foreground">Dif.</span>

          <span className="text-[11px] text-muted-foreground">Saldo Inicial</span>
          <span className="text-right tabular-nums text-[11px]">{temSaldo ? fmtBRL(saldoInicial) : 'não informado'}</span>
          <span className="text-right tabular-nums text-[11px]">{temSaldo ? fmtBRL(saldoInicial) : 'não informado'}</span>
          <span className="text-right tabular-nums text-muted-foreground">—</span>

          <span className="text-[11px] text-muted-foreground">Entradas</span>
          <span className="text-right tabular-nums text-[11px] text-emerald-700">{fmtBRL(diag.resumo.extrato_cru.entradas)}</span>
          <span className="text-right tabular-nums text-[11px] text-emerald-700">{fmtBRL(diag.resumo.lv2.entradas)}</span>
          <span className={`text-right tabular-nums text-[11px] font-medium ${corDif(difEnt)}`}>{fmtBRL(difEnt)}</span>
          {/* H1.4: sub-linhas Terceiros/Transferências aqui — NÃO implementar agora */}

          <span className="text-[11px] text-muted-foreground">Saídas</span>
          <span className="text-right tabular-nums text-[11px] text-rose-700">{fmtBRL(diag.resumo.extrato_cru.saidas)}</span>
          <span className="text-right tabular-nums text-[11px] text-rose-700">{fmtBRL(diag.resumo.lv2.saidas)}</span>
          <span className={`text-right tabular-nums text-[11px] font-medium ${corDif(difSai)}`}>{fmtBRL(difSai)}</span>
          {/* H1.4: sub-linhas Terceiros/Transferências aqui — NÃO implementar agora */}

          {/* Saldo Final Calculado — realce (3º) via bg-amber, sem aumentar fonte */}
          <span className="text-[12px] font-medium bg-amber-50 py-0.5 pl-1 rounded-l">Saldo Final Calculado</span>
          <span className="text-right tabular-nums text-[12px] font-medium bg-amber-50 py-0.5">{saldoCalcExtrato != null ? fmtBRL(saldoCalcExtrato) : '—'}</span>
          <span className="text-right tabular-nums text-[12px] font-medium bg-amber-50 py-0.5">{saldoCalcSistema != null ? fmtBRL(saldoCalcSistema) : '—'}</span>
          <span className={`text-right tabular-nums text-[12px] font-medium bg-amber-50 py-0.5 pr-1 rounded-r ${corDif(difSFC)}`}>{difSFC != null ? fmtBRL(difSFC) : '—'}</span>

          <span className="col-span-2 text-[11px] text-muted-foreground">Saldo Extrato Real</span>
          <span className="text-right tabular-nums text-[11px] font-medium">{saldoExtratoReal != null ? fmtBRL(saldoExtratoReal) : 'não informado'}</span>
          <span className="text-right tabular-nums text-muted-foreground">—</span>
        </div>
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
            {/* Fase A — card de pendência vira tarefa: cue "Resolver →" (clique segue filtrando a fila). */}
            {(['divergencias', 'sistema_sem_extrato', 'extrato_sem_sistema'] as FiltroKey[]).includes(f.key) && contagens[f.key] > 0 && (
              <span className="text-[8px] font-semibold text-primary">Resolver →</span>
            )}
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
      <span className={`text-[12px] truncate ${muted ? 'text-muted-foreground italic' : ''}`} title={valor}>{valor}</span>
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
      <Card className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Extrato soberano do mês</span>
          <StatusBadge texto="Nenhum extrato carregado" tom="muted" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Carregue o extrato para auditar esta conta/mês.</p>
          <Button size="sm" variant="outline" className="h-6 text-[11px] shrink-0" onClick={onCarregar}>↑ Carregar Extrato</Button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-1.5 space-y-0.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onToggle} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} Extrato soberano do mês
        </button>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Carregado
        </span>
      </div>
      {aberto ? (
        <>
          <div className="space-y-1">
            {/* IDENTIFICAÇÃO */}
            <section>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">Identificação</span>
                <span className="flex-1 border-t border-border/50" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Conta</span>
                  <span className="text-[11px] font-medium text-right min-w-0 break-words">{nomeConta || '—'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Competência</span>
                  <span className="text-[11px] font-medium text-right min-w-0 break-words">{MESES[mes - 1]}/{ano}</span>
                </div>
              </div>
            </section>
            {/* VOLUME */}
            <section>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">Volume</span>
                <span className="flex-1 border-t border-border/50" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Movimentos</span>
                  <span className="text-[11px] font-medium text-right min-w-0 break-words tabular-nums">{extrato.movimentos}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Período</span>
                  <span className="text-[11px] font-medium text-right min-w-0 break-words">{fmtData(extrato.periodo_ini)} – {fmtData(extrato.periodo_fim)}</span>
                </div>
              </div>
            </section>
            {/* ORIGEM DO ARQUIVO */}
            <section>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">Origem do arquivo</span>
                <span className="flex-1 border-t border-border/50" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Importado</span>
                  <span className="text-[11px] font-medium text-right min-w-0 break-words">{fmtDataHora(extrato.importado_em)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Saldo</span>
                  <span className="text-[11px] italic text-muted-foreground text-right min-w-0 break-words">não disponível</span>
                </div>
                <div className="col-span-2 flex items-baseline justify-between gap-2 border-b border-border/30 py-0 leading-tight">
                  <span className="text-[10px] text-muted-foreground shrink-0">Arquivo</span>
                  <span className="text-[11px] italic text-muted-foreground text-right min-w-0 break-words">não disponível</span>
                </div>
              </div>
            </section>
          </div>
          <div className="flex justify-end gap-1 border-t border-border/50 pt-1 mt-1">
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-muted-foreground hover:text-foreground" onClick={onCarregar}>Ver OFX</Button>
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-muted-foreground hover:text-foreground" onClick={onCarregar}>Atualizar OFX</Button>
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

// Bloco de grupo conciliado REAL (cbi): 1 âncora + N membros. NUNCA "sem vínculo".
// 1xN: âncora=OFX (esq), membros=lançamentos (dir). Nx1: espelhado.
function LinhaGrupo({ grupo, compartilhados }: { grupo: GrupoConciliado; compartilhados: Set<string> }) {
  const batido = grupo.status_grupo === 'batido';
  const corBloco = batido ? 'border-emerald-300 bg-emerald-50/50' : 'border-rose-400 bg-rose-50/60';
  const ancoraEsq = grupo.tipo === '1xN';
  const selo = (id: string) =>
    compartilhados.has(id) ? (
      <span className="ml-1 px-1 rounded bg-violet-100 text-violet-700 text-[8px] shrink-0"
        title="Este item também aparece em outro grupo (relação N:N).">↔ também em outro grupo</span>
    ) : null;
  const ancoraCell = (
    <div className="flex items-center gap-1 min-w-0">
      <LadoCelula data={grupo.ancora.data} valor={grupo.ancora.valor} descricao={grupo.ancora.descricao ?? '—'} />
      {selo(grupo.ancora.id)}
    </div>
  );
  const membrosCells = (
    <div className="space-y-0.5">
      {grupo.membros.map((m) => (
        <div key={m.id} className="flex items-center gap-1 min-w-0">
          <LadoCelula data={m.data} valor={m.valor_assinado} descricao={m.descricao ?? '—'} />
          {selo(m.id)}
        </div>
      ))}
    </div>
  );
  return (
    <div className={`rounded border ${corBloco} px-1 py-1 mb-1`}>
      <div className="flex items-stretch gap-1 text-[10px]">
        <div className="flex-1 min-w-0">{ancoraEsq ? ancoraCell : membrosCells}</div>
        <div className="w-16 shrink-0 flex flex-col items-center justify-center gap-0.5">
          <span className={`px-1 rounded text-[8px] font-bold ${batido ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-900'}`}>
            {ancoraEsq ? '1×N' : 'N×1'}
          </span>
          <span className={`text-[8px] ${batido ? 'text-emerald-700' : 'text-rose-700'}`}>{batido ? 'batido' : 'divergente'}</span>
        </div>
        <div className="flex-1 min-w-0">{ancoraEsq ? membrosCells : ancoraCell}</div>
      </div>
      {!batido && (
        <div className="mt-1 pt-0.5 border-t border-rose-300 text-[8px] text-rose-800 text-right tabular-nums">
          OFX R$ {fmtBRL(grupo.total_ofx)} · Sistema R$ {fmtBRL(grupo.total_sistema)} · dif R$ {fmtBRL(grupo.diferenca)}
        </div>
      )}
    </div>
  );
}

function ComparacaoEspelhada({ diag }: { diag: DiagnosticoSoberano }) {
  const pares = useMemo(() => montarPares(diag), [diag]);
  const grupos = useMemo(() => diag.buckets.grupos_conciliados ?? [], [diag]);
  // N:N — ids (âncora + membros) que aparecem em mais de um grupo.
  const compartilhados = useMemo(() => {
    const cont = new Map<string, number>();
    for (const g of grupos) {
      for (const id of [g.ancora.id, ...g.membros.map((m) => m.id)]) cont.set(id, (cont.get(id) ?? 0) + 1);
    }
    const s = new Set<string>();
    cont.forEach((n, id) => { if (n > 1) s.add(id); });
    return s;
  }, [grupos]);
  if (pares.length === 0 && grupos.length === 0)
    return <div className="p-3 text-center text-[11px] text-muted-foreground">Nada a comparar — sem itens não resolvidos. 🎉</div>;
  return (
    <div className="space-y-1">
      {grupos.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-semibold uppercase text-muted-foreground">Grupos conciliados</div>
          <div className="max-h-[40vh] overflow-y-auto">
            {/* ordem da RPC (soberana) preservada — sem reordenar */}
            {grupos.map((g, i) => <LinhaGrupo key={`grp-${i}`} grupo={g} compartilhados={compartilhados} />)}
          </div>
        </div>
      )}
      {pares.length > 0 && (
        <div className="space-y-1">
          {grupos.length > 0 && (
            <div className="text-[9px] font-semibold uppercase text-muted-foreground pt-1 border-t">Pares / não resolvidos</div>
          )}
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-muted-foreground">
            <span className="flex-1">Extrato (OFX)</span>
            <span className="w-16 shrink-0 text-center" />
            <span className="flex-1">Sistema</span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto divide-y-0">
            {pares.map((p) => <LinhaPar key={p.key} par={p} />)}
          </div>
        </div>
      )}
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


// ── C3.4 — Extratos espelhados REAIS (consome fn_extratos_espelhados) ──────
type EspStatus = 'conciliado' | 'sem_vinculo' | 'ignorado';
interface EspOfx { extrato_id: string; data: string | null; historico: string | null; documento: string | null; valor: number; status: EspStatus; flag_dup: boolean; flag_investimento: boolean; }
interface EspSis { lancamento_id: string; data: string | null; descricao: string | null; centro: string | null; subcentro: string | null; valor_assinado: number; sinal: string | null; status: 'conciliado' | 'sem_vinculo'; }
interface EspelhadosReais {
  escopo: { cliente_id: string; conta_id: string; ano_mes: string; nome_conta: string | null };
  saldos: { inicial: number | null; final_oficial: number | null; periodo_ini: string | null; periodo_fim: string | null; extrato_ini: string | null; extrato_fim: string | null };
  ofx_completo: EspOfx[];
  sistema_completo: EspSis[];
  versao: string;
  gerado_em: string;
}

const corValReal = (v: number) => (v >= 0 ? 'text-blue-600' : 'text-rose-600');
function EspStatusCell({ status }: { status: string }) {
  if (status === 'conciliado') return <span className="text-emerald-700 text-[9px] shrink-0">✓ conciliado</span>;
  if (status === 'ignorado') return <span className="text-muted-foreground text-[9px] shrink-0">⊘ ignorado</span>;
  return <span className="text-amber-700 text-[9px] shrink-0">⚠ sem vínculo</span>;
}

function AbaOfxReal({ ofx, inicial }: { ofx: EspOfx[]; inicial: number }) {
  const rows = useMemo(() => {
    let acc = inicial;
    return ofx.map((r) => { acc += r.valor; return { r, saldo: acc }; });
  }, [ofx, inicial]);
  return (
    <div className="text-[10px] max-h-[55vh] overflow-y-auto">
      <div className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 bg-card">
        <span>Data</span><span>Histórico</span><span>Documento</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      {rows.map(({ r, saldo }) => (
        <div key={r.extrato_id} className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 py-0.5 border-b last:border-b-0 items-center">
          <span className="text-muted-foreground">{fmtData(r.data)}</span>
          <span className="truncate flex items-center gap-1" title={r.historico ?? ''}>
            <span className="truncate">{r.historico ?? '—'}</span>
            {r.flag_dup && <span className="px-1 rounded bg-orange-100 text-orange-700 text-[8px] shrink-0">dup</span>}
            {r.flag_investimento && <span className="px-1 rounded bg-violet-100 text-violet-700 text-[8px] shrink-0">invest</span>}
          </span>
          <span className="truncate text-muted-foreground" title={r.documento ?? ''}>{r.documento ?? '—'}</span>
          <span className={`text-right tabular-nums ${corValReal(r.valor)}`}>{fmtBRL(r.valor)}</span>
          <span className={`text-right tabular-nums ${corValReal(saldo)}`}>{fmtBRL(saldo)}</span>
          <EspStatusCell status={r.status} />
        </div>
      ))}
    </div>
  );
}

function AbaSistemaReal({ sistema, inicial, onAbrir }: { sistema: EspSis[]; inicial: number; onAbrir?: (lancamentoId: string) => void }) {
  const rows = useMemo(() => {
    let acc = inicial;
    return sistema.map((r) => { acc += r.valor_assinado; return { r, saldo: acc }; });
  }, [sistema, inicial]);
  return (
    <div className="text-[10px] max-h-[55vh] overflow-y-auto">
      <div className="grid grid-cols-[44px_1fr_130px_92px_92px_80px] gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 bg-card">
        <span>Data</span><span>Descrição</span><span>Centro/Subcentro</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      {rows.map(({ r, saldo }) => {
        const cs = [r.centro, r.subcentro].filter(Boolean).join(' / ') || '—';
        return (
          <div key={r.lancamento_id}
               onClick={() => r.lancamento_id && onAbrir?.(r.lancamento_id)}
               className="grid grid-cols-[44px_1fr_130px_92px_92px_80px] gap-1 py-0.5 border-b last:border-b-0 items-center cursor-pointer hover:bg-muted/50">
            <span className="text-muted-foreground">{fmtData(r.data)}</span>
            <span className="truncate" title={r.descricao ?? ''}>{r.descricao ?? '—'}</span>
            <span className="truncate text-muted-foreground" title={cs}>{cs}</span>
            <span className={`text-right tabular-nums ${corValReal(r.valor_assinado)}`}>{fmtBRL(r.valor_assinado)}</span>
            <span className={`text-right tabular-nums ${corValReal(saldo)}`}>{fmtBRL(saldo)}</span>
            <EspStatusCell status={r.status} />
          </div>
        );
      })}
    </div>
  );
}

// Aba 3 (Opção B): conciliados (status) + sugestões/sem-vínculo (motor via diag).
type ClasseEsp = 'conciliado' | 'forte' | 'possiveis' | 'sem_vinculo';
interface LadoCell { data: string | null; valor: number; descricao: string; }
interface ParReal {
  key: string; classe: ClasseEsp;
  ofx?: LadoCell; sis?: LadoCell; nPossiveis?: number;
  extrato_id?: string;     // quando há lado OFX (para a ação Resolver)
  lancamento_id?: string;  // quando há lado Sistema
  dataChave?: string | null; // data que posiciona o item na timeline (OFX soberano)
}
function montarEspelhoReal(data: EspelhadosReais, diag: DiagnosticoSoberano): ParReal[] {
  const out: ParReal[] = [];
  // Conciliados: pareamento de exibição (mesmo valor assinado + data; fallback só valor). Não é o motor.
  const cOfx = data.ofx_completo.filter((o) => o.status === 'conciliado');
  const cSis = data.sistema_completo.filter((s) => s.status === 'conciliado');
  const usado = new Set<number>();
  for (const o of cOfx) {
    let idx = cSis.findIndex((s, i) => !usado.has(i) && Math.abs(s.valor_assinado - o.valor) < 0.005 && s.data === o.data);
    if (idx < 0) idx = cSis.findIndex((s, i) => !usado.has(i) && Math.abs(s.valor_assinado - o.valor) < 0.005);
    let s: EspSis | null = null;
    if (idx >= 0) { usado.add(idx); s = cSis[idx]; }
    out.push({
      key: `c-${o.extrato_id}`, classe: 'conciliado',
      ofx: { data: o.data, valor: o.valor, descricao: o.historico ?? '—' }, extrato_id: o.extrato_id,
      sis: s ? { data: s.data, valor: s.valor_assinado, descricao: s.descricao ?? '—' } : undefined,
      lancamento_id: s?.lancamento_id,
    });
  }
  cSis.forEach((s, i) => {
    if (!usado.has(i)) out.push({
      key: `cs-${s.lancamento_id}`, classe: 'conciliado',
      sis: { data: s.data, valor: s.valor_assinado, descricao: s.descricao ?? '—' }, lancamento_id: s.lancamento_id,
    });
  });
  // Sugestões (forte/possíveis) + sem-vínculo: reusa montarPares(diag) — sem reescrever o motor.
  for (const p of montarPares(diag)) {
    const classe: ClasseEsp = p.classe === 'forte' ? 'forte' : p.classe === 'possiveis' ? 'possiveis' : 'sem_vinculo';
    out.push({
      key: `m-${p.key}`, classe, nPossiveis: p.nPossiveis,
      ofx: p.ofx ? { data: p.ofx.data, valor: p.ofx.valor, descricao: p.ofx.descricao } : undefined,
      extrato_id: p.ofx?.extrato_id,
      sis: p.sistema ? { data: p.sistema.data, valor: p.sistema.valor, descricao: p.sistema.descricao } : undefined,
      lancamento_id: p.sistema?.lancamento_id,
    });
  }
  // dataChave por item (OFX soberano: data do OFX ancora; senão a do Sistema). Não muda pareamento.
  return out.map((p) => ({ ...p, dataChave: p.ofx?.data ?? p.sis?.data ?? null }));
}
// Agrupa ParReal por dataChave, grupos em data ASC (cronológico), grupo sem-data por último.
// ESTÁVEL: preserva a ordem dos itens dentro do mesmo dia (não re-pareia nem reordena).
function agruparPorData(pares: ParReal[]): { data: string | null; itens: ParReal[] }[] {
  const KNULL = '__sem_data__';
  const ordem: (string | null)[] = [];
  const mapa = new Map<string, ParReal[]>();
  for (const p of pares) {
    const d = p.dataChave ?? null;
    const k = d ?? KNULL;
    if (!mapa.has(k)) { mapa.set(k, []); ordem.push(d); }
    mapa.get(k)!.push(p);
  }
  return ordem
    .map((d) => ({ data: d, itens: mapa.get(d ?? KNULL)! }))
    .sort((a, b) => {
      if (a.data === b.data) return 0;
      if (a.data === null) return 1;
      if (b.data === null) return -1;
      return a.data < b.data ? -1 : 1; // 'YYYY-MM-DD' ordena lexicograficamente = cronológico
    });
}
type ResolverCtx = { tipo: 'extrato_sem_vinculo' | 'sistema_sem_vinculo'; id: string };
function LinhaEspReal({ par, onResolver, onDesconsiderar }: { par: ParReal; onResolver: (ctx: ResolverCtx) => void; onDesconsiderar?: (extratoId: string) => void }) {
  // Conector por classe — 4 estados (verde/amarelo/amarelo/cinza). Vermelho = divergência REAL,
  // tratado nos GRUPOS (LinhaGrupo), não aqui (sem classe 'divergente' por linha no contrato).
  const conector =
    par.classe === 'conciliado' ? <span className="text-emerald-600 text-[10px]" title="Conciliado">◀══▶</span>
    : par.classe === 'forte' ? <span className="px-1 rounded bg-amber-100 text-amber-700 text-[8px] font-medium" title="Sugestão forte">sugestão</span>
    : par.classe === 'possiveis' ? <span className="px-1 rounded bg-amber-100 text-amber-700 text-[8px] font-medium" title="Candidatos possíveis">{par.nPossiveis} poss.</span>
    : <span className="text-muted-foreground text-[10px]" title="Sem vínculo">────</span>;
  // Ação Resolver → abre a MESMA Estação dos buckets (reusa onResolver=setEstacaoCtx).
  let acao: React.ReactNode = null;
  if (par.classe !== 'conciliado') {
    const ctx: ResolverCtx | null =
      par.ofx && par.extrato_id ? { tipo: 'extrato_sem_vinculo', id: par.extrato_id }
      : par.sis && par.lancamento_id ? { tipo: 'sistema_sem_vinculo', id: par.lancamento_id }
      : null;
    if (ctx) acao = (
      <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 shrink-0" onClick={() => onResolver(ctx)}>Resolver →</Button>
    );
  }
  return (
    <div className="flex items-center gap-1 py-0.5 text-[10px] border-b last:border-b-0">
      <div className="flex-1 min-w-0">{par.ofx ? <LadoCelula data={par.ofx.data} valor={par.ofx.valor} descricao={par.ofx.descricao} /> : <span className="text-[9px] italic text-muted-foreground">— sem OFX</span>}</div>
      <div className="w-16 shrink-0 flex justify-center">{conector}</div>
      <div className="flex-1 min-w-0">{par.sis ? <LadoCelula data={par.sis.data} valor={par.sis.valor} descricao={par.sis.descricao} /> : <span className="text-[9px] italic text-muted-foreground">— sem lançamento</span>}</div>
      <div className="w-24 shrink-0 flex flex-col items-end gap-0.5">
        {acao}
        {par.ofx && par.extrato_id && onDesconsiderar && (
          <button type="button" title="Desconsiderar este movimento da conciliação"
                  onClick={() => onDesconsiderar(par.extrato_id!)}
                  className="text-[8px] text-muted-foreground hover:text-rose-600 underline">desconsiderar</button>
        )}
      </div>
    </div>
  );
}
function AbaEspelhoReal({ data, diag, onResolver, onDesconsiderar }: { data: EspelhadosReais; diag: DiagnosticoSoberano; onResolver: (ctx: ResolverCtx) => void; onDesconsiderar?: (extratoId: string) => void }) {
  // Timeline única: agrupa por data a saída de montarEspelhoReal (sem re-parear nem recalcular).
  const grupos = useMemo(() => agruparPorData(montarEspelhoReal(data, diag)), [data, diag]);
  return (
    <div className="max-h-[55vh] overflow-y-auto">
      {/* Legenda de cores (4 estados) */}
      <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted-foreground pb-1">
        <span className="inline-flex items-center gap-1"><span className="text-emerald-600">●</span> conciliado</span>
        <span className="inline-flex items-center gap-1"><span className="text-amber-600">●</span> sugestão</span>
        <span className="inline-flex items-center gap-1"><span className="text-rose-600">●</span> divergência</span>
        <span className="inline-flex items-center gap-1"><span className="text-muted-foreground">●</span> sem vínculo</span>
      </div>
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-muted-foreground border-b pb-0.5 sticky top-0 bg-card z-10">
        <span className="flex-1">Extrato (banco)</span><span className="w-16 text-center">vínculo</span><span className="flex-1">Sistema</span><span className="w-24 text-right">ação</span>
      </div>
      {grupos.map((g) => (
        <div key={g.data ?? 'sem-data'}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 px-1 py-0.5 border-b mt-1">
            {g.data ? fmtData(g.data) : 'Sem data'}
          </div>
          {g.itens.map((p) => <LinhaEspReal key={p.key} par={p} onResolver={onResolver} onDesconsiderar={onDesconsiderar} />)}
        </div>
      ))}
    </div>
  );
}

// Aba 4: evolução diária (todos os dias do mês), saldo corrido e diferença acumulada.
function montarEvolucao(data: EspelhadosReais) {
  const inicial = data.saldos.inicial ?? 0;
  const nDias = data.saldos.periodo_fim ? Number(data.saldos.periodo_fim.split('-')[2]) : 31;
  const dia = (s: string | null) => (s ? Number(s.split('-')[2]) : 0);
  const movOfx = Array(nDias + 1).fill(0);
  const movSis = Array(nDias + 1).fill(0);
  for (const o of data.ofx_completo) { const d = dia(o.data); if (d >= 1 && d <= nDias) movOfx[d] += o.valor; }
  for (const s of data.sistema_completo) { const d = dia(s.data); if (d >= 1 && d <= nDias) movSis[d] += s.valor_assinado; }
  const rows: { dia: number; movOfx: number; movSis: number; saldoOfx: number; saldoSis: number; dif: number; nasce: boolean }[] = [];
  let accO = inicial, accS = inicial, nasceu = false;
  for (let d = 1; d <= nDias; d++) {
    accO += movOfx[d]; accS += movSis[d];
    const dif = accO - accS;
    const nasce = Math.abs(dif) >= 0.005 && !nasceu;
    if (nasce) nasceu = true;
    rows.push({ dia: d, movOfx: movOfx[d], movSis: movSis[d], saldoOfx: accO, saldoSis: accS, dif, nasce });
  }
  return rows;
}
function AbaEvolucaoReal({ data }: { data: EspelhadosReais }) {
  const rows = useMemo(() => montarEvolucao(data), [data]);
  const mm = data.saldos.periodo_ini ? data.saldos.periodo_ini.split('-')[1] : '';
  return (
    <div className="space-y-2">
      <div className="text-[10px] max-h-[50vh] overflow-y-auto">
        <div className="grid grid-cols-[52px_1fr_1fr_1fr_1fr_1fr] gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 bg-card">
          <span>Data</span><span className="text-right">Mov. OFX</span><span className="text-right">Mov. Sist.</span><span className="text-right">Saldo OFX</span><span className="text-right">Saldo Sist.</span><span className="text-right">Dif. Acum.</span>
        </div>
        {rows.map((r) => {
          const difZero = Math.abs(r.dif) < 0.005;
          return (
            <div key={r.dia} className={`grid grid-cols-[52px_1fr_1fr_1fr_1fr_1fr] gap-1 py-0.5 border-b last:border-b-0 items-center ${r.nasce ? 'border-l-2 border-l-rose-500 bg-rose-50/50' : ''}`}>
              <span className="text-muted-foreground flex items-center gap-1">{String(r.dia).padStart(2, '0')}/{mm}{r.nasce && <span className="px-1 rounded bg-rose-200 text-rose-800 text-[8px] font-bold shrink-0">nasceu aqui</span>}</span>
              <span className={`text-right tabular-nums ${r.movOfx === 0 ? 'text-muted-foreground' : corValReal(r.movOfx)}`}>{fmtBRL(r.movOfx)}</span>
              <span className={`text-right tabular-nums ${r.movSis === 0 ? 'text-muted-foreground' : corValReal(r.movSis)}`}>{fmtBRL(r.movSis)}</span>
              <span className={`text-right tabular-nums ${corValReal(r.saldoOfx)}`}>{fmtBRL(r.saldoOfx)}</span>
              <span className={`text-right tabular-nums ${corValReal(r.saldoSis)}`}>{fmtBRL(r.saldoSis)}</span>
              <span className={`text-right tabular-nums ${difZero ? 'text-muted-foreground' : 'text-rose-600 font-medium'}`}>{fmtBRL(r.dif)}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-amber-700">Extrato bancário importado contém movimentos até {fmtData(data.saldos.extrato_fim)}.</div>
      <div className="text-[11px] font-semibold">Saldo final oficial (extrato): {fmtBRL(data.saldos.final_oficial)}</div>
    </div>
  );
}

function ExtratosEspelhadosReais({ data, diag, onResolver, onAbrirLanc, onDesconsiderar }: { data: EspelhadosReais; diag: DiagnosticoSoberano; onResolver: (ctx: ResolverCtx) => void; onAbrirLanc?: (id: string) => void; onDesconsiderar?: (extratoId: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'ofx' | 'sistema' | 'espelho' | 'evolucao'>('espelho');
  const inicial = data.saldos.inicial ?? 0;
  // Conferência (foto) primeiro: é a tela principal de conferência operacional. Demais = apoio.
  const abas = [
    { key: 'espelho' as const, label: 'Conferência' },
    { key: 'ofx' as const, label: 'Extrato (banco)' },
    { key: 'sistema' as const, label: 'Sistema' },
    { key: 'evolucao' as const, label: 'Evolução do saldo' },
  ];
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-xs font-semibold inline-flex items-center gap-1">
          {aberto ? '▼' : '▶'} Extratos espelhados (OFX × Sistema)
        </button>
        <span className="text-[10px] text-muted-foreground truncate max-w-[45%]" title={data.escopo.nome_conta ?? ''}>{data.escopo.nome_conta ?? ''}</span>
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
          {aba === 'ofx' && <AbaOfxReal ofx={data.ofx_completo} inicial={inicial} />}
          {aba === 'sistema' && <AbaSistemaReal sistema={data.sistema_completo} inicial={inicial} onAbrir={onAbrirLanc} />}
          {aba === 'espelho' && <AbaEspelhoReal data={data} diag={diag} onResolver={onResolver} onDesconsiderar={onDesconsiderar} />}
          {aba === 'evolucao' && <AbaEvolucaoReal data={data} />}
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
  // WS1 — contexto da Estação de Conciliação (read-only). null = fechada.
  const [estacaoCtx, setEstacaoCtx] = useState<{ tipo: 'sistema_sem_vinculo' | 'extrato_sem_vinculo'; id: string } | null>(null);
  // P3.3 — leitura do lançamento oficial (aba Sistema → linha clicável).
  const [lancLeituraId, setLancLeituraId] = useState<string | null>(null);
  // PR-PROTOCOLO-01 — invalidação de origem (extrato): abre o protocolo de derivados.
  const [protocoloExtrato, setProtocoloExtrato] = useState<{ id: string; modo: 'ignorar' | 'resolver' } | null>(null);
  // PR F — extrato em reversão de desconsideração (loading do botão). null = ocioso.
  const [revertendoId, setRevertendoId] = useState<string | null>(null);

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

  // C3.4 — listas completas (OFX/Sistema) + saldos-ancora p/ as telas espelhadas.
  const { data: espelhados } = useQuery({
    queryKey: ['extratos-espelhados', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId && temExtrato,
    staleTime: 30_000,
    queryFn: async (): Promise<EspelhadosReais | null> => {
      const { data, error: e } = await (supabase as any).rpc('fn_extratos_espelhados', {
        p_cliente: clienteId, p_conta: contaId, p_mes: anoMes,
      });
      if (e) throw e;
      return (data as EspelhadosReais) ?? null;
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

  // PR F — reverte a desconsideração de um extrato: recalcula o status pelo CBI ativo
  // (RPC fn_reverter_desconsideracao_extrato). Só toca extrato_bancario_v2.status; não
  // desfaz vínculo nem reconcilia. Card sai do bucket via invalidate de 'auditoria-soberana'.
  const reverterDesconsideracao = async (extratoId: string) => {
    if (revertendoId) return;
    setRevertendoId(extratoId);
    try {
      const { error } = await (supabase as any).rpc('fn_reverter_desconsideracao_extrato', { p_extrato_id: extratoId });
      if (error) throw error;
      toast.success('Desconsideração revertida.');
      queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
      queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
      queryClient.invalidateQueries({ queryKey: ['extratos-espelhados'] });
    } catch (e) {
      // PostgrestError (objeto, não Error) -> lê .message para o motivo real do PostgreSQL.
      const msg = (e as { message?: string } | null)?.message || 'Falha ao reverter desconsideração.';
      toast.error(msg);
    } finally {
      setRevertendoId(null);
    }
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
        acaoLabel: 'Abrir lançamento',
        onAcao: () => irLancamentos(`Abrir lançamento · ${desc} · R$ ${fmtBRL(valor)} · ${motivo} · ${origem}`),
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
        acaoLabel: 'Resolver',
        // WS1/Fase A — abre a Estação de Conciliação (read-only) em vez de navegar.
        onAcao: () => setEstacaoCtx({ tipo: 'sistema_sem_vinculo', id: it.lancamento_id }),
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
        acaoLabel: 'Resolver',
        // Fase A — abre a Estação no modo extrato (read-only). Criação real segue no fluxo existente.
        onAcao: () => setEstacaoCtx({ tipo: 'extrato_sem_vinculo', id: it.extrato_id }),
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
        // Fase A — sem botão: a Estação não cobre agrupamento; resolução avançada virá depois.
        motivoAcao: 'Agrupamento sugerido — resolução avançada ainda não disponível.',
        acaoLabel: null,
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
        // PR F — reverte a desconsideração (recalcula status pelo CBI ativo).
        acaoLabel: revertendoId === it.extrato_id ? 'Revertendo…' : 'Reverter',
        onAcao: () => reverterDesconsideracao(it.extrato_id),
      });
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diag, ano, mes, revertendoId]);

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
        <span className="text-sm font-bold mr-1">Central de Conciliação Bancária</span>
        <ContaBancariaSelect
          value={contaId}
          onValueChange={(id) => setContaId(id || null)}
          contas={contas}
          placeholder="Selecionar conta"
          className="h-7 text-xs w-[200px]"
        />
        <select className="text-xs border rounded px-2 py-0.5 h-7 bg-background" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="text-xs border rounded px-2 py-0.5 h-7 bg-background" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {temExtrato && diag && (
          <span className="ml-auto">
            {diag.veredito.conciliado
              ? <StatusBadge texto="Conciliado" tom="emerald" />
              : <StatusBadge texto="Não fecha" tom="rose" />}
          </span>
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

          {/* C3.4 — Extratos espelhados reais (fn_extratos_espelhados) */}
          {espelhados && <ExtratosEspelhadosReais data={espelhados} diag={diag} onResolver={setEstacaoCtx} onAbrirLanc={setLancLeituraId} onDesconsiderar={(id) => setProtocoloExtrato({ id, modo: 'ignorar' })} />}
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

      {/* WS1 — Estação de Conciliação (read-only). Acionada pelo botão "Verificar". */}
      {estacaoCtx && (
        <EstacaoConciliacao
          tipo={estacaoCtx.tipo}
          id={estacaoCtx.id}
          contaNome={nomeConta}
          contaExtratoId={contaId ?? undefined}
          contas={contas}
          onClose={() => setEstacaoCtx(null)}
        />
      )}

      {/* P3.3 — Leitura do lançamento oficial (aba Sistema). Sem editar/cancelar. */}
      <LancamentoLeituraDialog
        open={!!lancLeituraId}
        lancamentoId={lancLeituraId}
        onClose={() => setLancLeituraId(null)}
        onResolver={(id) => { setLancLeituraId(null); setEstacaoCtx({ tipo: 'sistema_sem_vinculo', id }); }}
        onCancelado={() => {
          setLancLeituraId(null);
          // recarrega a Auditoria sem sair da tela/conta/mês.
          queryClient.invalidateQueries({ queryKey: ['extratos-espelhados'] });
          queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
          queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
        }}
      />

      {/* PR-PROTOCOLO-01 — invalidação de origem (mesmo dialog do ExtratoListaTab; 1 implementação). */}
      <DecisaoDerivadosDialog
        extratoId={protocoloExtrato?.id ?? null}
        aberto={!!protocoloExtrato}
        modo={protocoloExtrato?.modo ?? 'ignorar'}
        onClose={() => setProtocoloExtrato(null)}
        onConcluido={() => {
          queryClient.invalidateQueries({ queryKey: ['auditoria-soberana'] });
          queryClient.invalidateQueries({ queryKey: ['auditoria-extrato-existe'] });
          queryClient.invalidateQueries({ queryKey: ['extratos-espelhados'] });
        }}
      />
    </div>
  );
}
