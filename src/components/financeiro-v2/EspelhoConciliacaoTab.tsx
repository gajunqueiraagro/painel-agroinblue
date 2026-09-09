/**
 * ESPELHO — O QUE O BANCO VIU × O QUE O SISTEMA TEM. PR-ESPELHO-01.
 *
 * ⚠ O CASAMENTO É O VÍNCULO, E SÓ ELE. Até aqui a Conferência recebia da RPC a informação
 * de QUAIS extratos e QUAIS lançamentos estavam conciliados — nunca qual com qual — e
 * re-pareava por `valor + data`, com fallback só valor. Duas linhas de mesmo valor no mesmo
 * dia trocavam de par; um lançamento fora do recorte não achava par nenhum e a tela dizia
 * "conciliado" com o lado direito vazio, que é a frase mais perigosa que uma conferência
 * pode emitir. A RPC passou a devolver `vinculos` (20260909120258) e a heurística morreu:
 * não ficou como fallback, porque um fallback errado é pior que uma lacuna visível.
 *
 * ⚠ DIVERGÊNCIA É INFORMAÇÃO. Quando a soma dos aplicados não fecha com o valor do extrato,
 * a diferença aparece em âmbar na linha-mãe. Nada é escondido para a tela "ficar limpa".
 *
 * ⚠ SEÇÃO MOVIDA, NÃO REESCRITA. `AbaOfxReal`, `AbaSistemaReal` e a Evolução do saldo vieram
 * de `AuditoriaBancariaSoberana` byte a byte — o que mudou foi a casa e a Conferência.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { iconeOrigemLancamento, LEGENDA_ICONES, rotuloOrigem, vinculoVencedor } from '@/v2/lib/origemLancamento';
import { desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import { LancamentoLeituraDialog } from '@/components/financeiro-v2/LancamentoLeituraDialog';
import { CasarComBancoModal, type ExtratoAlvo, type LevadoInicial } from '@/components/financeiro-v2/CasarComBancoModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};

type EspStatus = 'conciliado' | 'sem_vinculo' | 'ignorado';
interface EspOfx { extrato_id: string; data: string | null; historico: string | null; documento: string | null; valor: number; status: EspStatus; flag_dup: boolean; flag_investimento: boolean; }
interface EspSis {
  lancamento_id: string; data: string | null; descricao: string | null;
  centro: string | null; subcentro: string | null; valor_assinado: number;
  sinal: string | null; status: 'conciliado' | 'sem_vinculo';
  /* ⚠ AINDA NÃO VÊM DA RPC (medido em 09/09/2026: `fn_extratos_espelhados` não os emite).
     Opcionais porque a tela já sabe o que fazer com a ausência — "—" —, e no dia em que a
     coluna chegar a segunda linha passa a nomear o fornecedor sem tocar neste arquivo. */
  fornecedor?: string | null;
  origem_lancamento?: string | null;
  competencia?: string | null;
}
interface EspVinculo {
  extrato_id: string; lancamento_id: string; valor_aplicado: number;
  tipo_aprovacao: string | null; grupo_id: string | null;
}
export interface EspelhadosReais {
  escopo: { cliente_id: string; conta_id: string; ano_mes: string; nome_conta: string | null };
  saldos: { inicial: number | null; final_oficial: number | null; periodo_ini: string | null; periodo_fim: string | null; extrato_ini: string | null; extrato_fim: string | null };
  ofx_completo: EspOfx[];
  sistema_completo: EspSis[];
  /* ⚠ A CHAVE QUE MATOU A HEURÍSTICA (migration 20260909120258). Diz qual lançamento casa
     com qual extrato, com quanto foi aplicado e sob que tipo — tudo o que a Conferência
     precisava e antes tinha de adivinhar. */
  vinculos?: EspVinculo[];
  versao: string;
  gerado_em: string;
}

const corValReal = (v: number) => (v >= 0 ? 'text-blue-600' : 'text-rose-600');

/* ⚠ PISO DE 10px NO MODAL INTEIRO — PR-ESPELHO-02. Estes rótulos vieram em 8px e 9px do
   arquivo de origem, quando eram detalhe de um card recolhido dentro de outra tela. Num
   modal de 92vh não há o que economizar em altura, e 8px deixa de ser denso para virar
   ilegível: só a classe muda, o texto e a regra ficam. */
function EspStatusCell({ status }: { status: string }) {
  if (status === 'conciliado') return <span className="text-emerald-700 text-[10px] shrink-0">✓ conciliado</span>;
  if (status === 'ignorado') return <span className="text-muted-foreground text-[10px] shrink-0">⊘ ignorado</span>;
  return <span className="text-amber-700 text-[10px] shrink-0">⚠ sem vínculo</span>;
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
            {r.flag_dup && <span className="px-1 rounded bg-orange-100 text-orange-700 text-[10px] shrink-0">dup</span>}
            {r.flag_investimento && <span className="px-1 rounded bg-violet-100 text-violet-700 text-[10px] shrink-0">invest</span>}
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
              <span className="text-muted-foreground flex items-center gap-1">{String(r.dia).padStart(2, '0')}/{mm}{r.nasce && <span className="px-1 rounded bg-rose-200 text-rose-800 text-[10px] font-bold shrink-0">nasceu aqui</span>}</span>
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

// ── Conferência — a mesa do dia ────────────────────────────────────────────
interface FilhaConf { lancamento_id: string; valor_aplicado: number; sis?: EspSis; deN: number; }
interface Pareado {
  extrato: EspOfx; filhas: FilhaConf[]; grupoId: string | null;
  tipoVencedor: string | null; soma: number; diferenca: number;
}
interface DiaConf {
  data: string | null;
  pareados: Pareado[];
  extratosSemPar: EspOfx[];
  lancsSemPar: EspSis[];
  banco: number;
  sistema: number;
}

/**
 * ⚠ ENTRADAS ANTES DAS SAÍDAS, MAIORES PRIMEIRO — dentro de cada grupo do dia. A ordem não é
 * estética: quem confere um dia procura o valor grande primeiro, porque é o que explica a
 * diferença. Ordenar por data dentro do dia não ordenaria nada (é o mesmo dia).
 */
function ordenar<T>(itens: T[], valor: (t: T) => number): T[] {
  const entradas = itens.filter((i) => valor(i) > 0).sort((a, b) => Math.abs(valor(b)) - Math.abs(valor(a)));
  const saidas = itens.filter((i) => valor(i) <= 0).sort((a, b) => Math.abs(valor(b)) - Math.abs(valor(a)));
  return [...entradas, ...saidas];
}

/**
 * A mesa: um dia por bloco, com os dois lados na mesma cronologia.
 *
 * ⚠ SEM PAR DOS DOIS LADOS FICA DENTRO DO DIA. A versão anterior empurrava os lançamentos sem
 * extrato para um bloco no fim da lista, e ali eles não conversavam com nada — o operador via
 * "falta alguém" sem ver ao lado de quê. Dentro do dia, o extrato órfão e o lançamento órfão
 * aparecem a três linhas um do outro, que é como se descobre que são o mesmo dinheiro.
 */
function montarMesa(data: EspelhadosReais) {
  const vinculos = data.vinculos ?? [];
  const sisPorId = new Map(data.sistema_completo.map((s) => [s.lancamento_id, s]));
  const extratosPorLanc = new Map<string, number>();
  for (const v of vinculos) extratosPorLanc.set(v.lancamento_id, (extratosPorLanc.get(v.lancamento_id) ?? 0) + 1);

  const porExtrato = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porExtrato.get(v.extrato_id);
    if (l) l.push(v); else porExtrato.set(v.extrato_id, [v]);
  }
  const comVinculo = new Set(vinculos.map((v) => v.lancamento_id));

  const dias = new Map<string, DiaConf>();
  const dia = (d: string | null): DiaConf => {
    const k = d ?? 'sem-data';
    let atual = dias.get(k);
    if (!atual) { atual = { data: d, pareados: [], extratosSemPar: [], lancsSemPar: [], banco: 0, sistema: 0 }; dias.set(k, atual); }
    return atual;
  };

  for (const extrato of data.ofx_completo) {
    const d = dia(extrato.data);
    d.banco += extrato.valor;
    const vs = porExtrato.get(extrato.extrato_id) ?? [];
    if (vs.length === 0) { d.extratosSemPar.push(extrato); continue; }
    const soma = vs.reduce((a, v) => a + Number(v.valor_aplicado ?? 0), 0);
    /* O aplicado é magnitude; o sinal de quem o explica é o do extrato. */
    d.sistema += Math.sign(extrato.valor || 1) * soma;
    d.pareados.push({
      extrato,
      filhas: vs.map((v) => ({
        lancamento_id: v.lancamento_id,
        valor_aplicado: Number(v.valor_aplicado ?? 0),
        sis: sisPorId.get(v.lancamento_id),
        deN: extratosPorLanc.get(v.lancamento_id) ?? 1,
      })),
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      tipoVencedor: vinculoVencedor(vs, (v) => v.tipo_aprovacao)?.tipo_aprovacao ?? null,
      soma,
      diferenca: Math.abs(extrato.valor) - Math.abs(soma),
    });
  }

  for (const s of data.sistema_completo) {
    if (comVinculo.has(s.lancamento_id)) continue;
    const d = dia(s.data);
    d.lancsSemPar.push(s);
    d.sistema += s.valor_assinado;
  }

  const lista = [...dias.values()].sort((a, b) => (a.data ?? '') < (b.data ?? '') ? -1 : (a.data ?? '') > (b.data ?? '') ? 1 : 0);
  for (const d of lista) {
    d.pareados = ordenar(d.pareados, (p) => p.extrato.valor);
    d.extratosSemPar = ordenar(d.extratosSemPar, (e) => e.valor);
    d.lancsSemPar = ordenar(d.lancsSemPar, (s) => s.valor_assinado);
  }
  return lista;
}

/**
 * O ícone de origem, com a mesma régua do Financeiro.
 *
 * ⚠ SÓ O RAMO DO VÍNCULO É EXERCITADO AQUI, e por isso os demais campos são inertes: só se
 * chama com vínculo, e a primeira cláusula do classificador decide antes de olhar status,
 * conta ou data. O `!` desta tela é outro: significa "lançamento sem extrato", e vem da
 * mesa, não do classificador.
 */
function iconeDoLancamento(tipo: string | null) {
  return iconeOrigemLancamento(
    { status_transacao: 'realizado', editado_manual: false, conta_bancaria_id: null, data_pagamento: null },
    { tipoAprovacao: tipo },
    undefined,
  );
}

function Acao({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('text-[10px] underline underline-offset-2 text-muted-foreground hover:text-foreground', className)}>
      {children}
    </button>
  );
}

/**
 * A alça de arrasto do lançamento sem par.
 *
 * ⚠ ALÇA, NÃO A LINHA INTEIRA: a linha tem um checkbox e um "abrir", e tornar a linha
 * arrastável roubaria o clique dos dois. A alça é o único ponto que só serve para arrastar,
 * e o cursor anuncia isso antes de o operador tentar.
 */
function Alca({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id });
  return (
    <span ref={setNodeRef} {...listeners} {...attributes}
      className="ml-1.5 inline-block cursor-grab select-none align-middle text-[12px] leading-none text-muted-foreground active:cursor-grabbing"
      title="Arraste sobre um movimento do banco para casar" aria-label="Arrastar lançamento">
      ⠿
    </span>
  );
}

/** A borda que separa os dois lados. Mesma célula em toda linha — é o que a faz contínua. */
const MEIO = 'border-l border-r border-border text-center px-0';
const CEL = 'px-[5px] overflow-hidden text-ellipsis whitespace-nowrap';
const H21 = 'h-[21px]';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');

/**
 * ⚠ CADA LINHA É UM COMPONENTE PORQUE O @dnd-kit É HOOK. `useDroppable`/`useDraggable` não
 * podem ser chamados dentro de um `.map()` — a regra dos hooks proíbe, e o React quebraria ao
 * mudar a contagem de linhas entre renders. Extrair não foi estética: era a única forma.
 */
function LinhaExtratoSemPar({ e, marcado, onMarcar }: {
  e: EspOfx; marcado: boolean; onMarcar: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `ext:${e.extrato_id}` });
  return (
    <tr ref={setNodeRef} className={cn(H21, 'border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <td className="text-center">
        <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
          onChange={onMarcar} aria-label="Marcar movimento do banco" />
      </td>
      <td className={cn(CEL, 'text-[10px] text-muted-foreground')}>{fmtData(e.data)}</td>
      <td className={cn(CEL, 'text-[10px] font-medium')} title={e.historico ?? ''}>{e.historico ?? '—'}</td>
      <td className={cn(CEL, 'text-right text-[11px] font-medium tabular-nums', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
      <td className={cn(MEIO, 'text-[12px] text-muted-foreground')} title="sem correspondência">○</td>
      <td />
      <td />
      <td className={cn(CEL, 'text-[10px] italic text-muted-foreground')}>— nenhum lançamento vinculado</td>
      <td className={cn(CEL, 'text-right')} />
    </tr>
  );
}

function LinhaLancSemPar({ s, mesDoRecorte, marcado, onMarcar, onAbrir }: {
  s: EspSis; mesDoRecorte: string; marcado: boolean; onMarcar: () => void; onAbrir?: (id: string) => void;
}) {
  return (
    <tr className={cn(H21, 'border-b border-border/50', marcado && 'bg-amber-500/10')}>
      <td />
      <td className={cn(CEL, 'text-[10px] text-muted-foreground')}>{fmtData(s.data)}</td>
      <td className={cn(CEL, 'text-[10px] italic text-muted-foreground')}>— sem extrato correspondente</td>
      <td />
      <td className={cn(MEIO, 'text-[12px] font-semibold text-destructive')} title="sem par no banco">!</td>
      <td className="text-center">
        <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
          onChange={onMarcar} aria-label="Marcar lançamento" />
      </td>
      <td className={cn(CEL, 'text-left text-[11px] font-medium tabular-nums', corVal(s.valor_assinado))}>{fmtBRL(s.valor_assinado)}</td>
      <td className={CEL}>{textoLancamento(s, mesDoRecorte, true)}</td>
      <td className={cn(CEL, 'text-right whitespace-nowrap')}>
        {onAbrir && <Acao onClick={() => onAbrir(s.lancamento_id)}>abrir</Acao>}
        <Alca id={`lan:${s.lancamento_id}`} />
      </td>
    </tr>
  );
}

/** Descrição + fornecedor (+ competência quando difere, + origem quando sem par), UMA linha. */
function textoLancamento(s: EspSis | undefined, mesDoRecorte: string, semPar = false) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const comp = s.competencia && s.competencia.slice(0, 7) !== mesDoRecorte
    ? `${MESES_CURTOS[Number(s.competencia.slice(5, 7)) - 1] ?? ''}/${s.competencia.slice(2, 4)}`
    : null;
  return (
    <>
      <span className="text-[11px] font-medium">{s.descricao ?? '—'}</span>
      <span className="text-[10px] text-muted-foreground">
        {' · '}{s.fornecedor || '—'}
        {comp && ` · competência ${comp}`}
        {semPar && s.origem_lancamento && ` · ${rotuloOrigem(s.origem_lancamento)}`}
      </span>
    </>
  );
}

/** Os motivos que a RPC recusa, em português. Um lugar só — o modal do 03b reusa. */
export const MOTIVO_CASAR_LABEL: Readonly<Record<string, string>> = {
  extrato_nao_encontrado: 'Este movimento do banco não existe mais.',
  extrato_ja_conciliado: 'Este movimento do banco já está conciliado.',
  sem_itens: 'Marque ao menos um lançamento.',
  lancamento_nao_encontrado: 'Um dos lançamentos não existe mais.',
  cliente_divergente: 'O lançamento é de outro cliente.',
  lancamento_cancelado: 'Um dos lançamentos está cancelado.',
  lancamento_ja_conciliado: 'Um dos lançamentos já está conciliado.',
  valor_invalido: 'Valor inválido: precisa ser maior que zero.',
  soma_nao_bate: 'A soma dos lançamentos não bate com o valor do banco.',
};

interface EstadoSelecao { extratos: Set<string>; lancamentos: Set<string>; }

function AbaConferencia({ data, anoMes, nomeConta, contaId, onAbrir, onMudou }: {
  data: EspelhadosReais; anoMes: string; nomeConta?: string; contaId: string | null;
  onAbrir?: (id: string) => void; onMudou: () => void;
}) {
  const dias = useMemo(() => montarMesa(data), [data]);
  const [sel, setSel] = useState<EstadoSelecao>({ extratos: new Set(), lancamentos: new Set() });
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const [casar, setCasar] = useState<{ extrato: ExtratoAlvo; iniciais: LevadoInicial[] } | null>(null);
  const [arrastando, setArrastando] = useState<EspSis | null>(null);
  /* ⚠ 4px ANTES DE VIRAR ARRASTO: sem a distância, o clique no checkbox ao lado da alça já
     começaria um drag e o operador não conseguiria marcar nada. */
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const limpar = () => { setSel({ extratos: new Set(), lancamentos: new Set() }); setErro(null); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') limpar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const alterna = (lado: 'extratos' | 'lancamentos', id: string) => setSel((s) => {
    const n = new Set(s[lado]);
    if (n.has(id)) n.delete(id); else n.add(id);
    return { ...s, [lado]: n };
  });

  const extratoIndex = useMemo(() => new Map(data.ofx_completo.map((o) => [o.extrato_id, o])), [data]);
  const sisIndex = useMemo(() => new Map(data.sistema_completo.map((s) => [s.lancamento_id, s])), [data]);
  const somaExtratos = [...sel.extratos].reduce((a, id) => a + (extratoIndex.get(id)?.valor ?? 0), 0);
  const somaLancs = [...sel.lancamentos].reduce((a, id) => a + (sisIndex.get(id)?.valor_assinado ?? 0), 0);
  /* ⚠ A DIFERENÇA DA BARRA É SÓ PARA EXIBIR. Quem decide se pode conciliar é a RPC: ela
     revalida a soma no servidor, com os valores que estão lá e não os que a tela viu. */
  const difSel = somaExtratos - somaLancs;
  const podeConciliar = sel.extratos.size === 1 && sel.lancamentos.size >= 1 && Math.abs(difSel) <= 0.01;
  const motivoBloqueio = sel.extratos.size > 1 ? 'um extrato por vez'
    : sel.extratos.size === 0 ? 'marque um extrato'
    : sel.lancamentos.size === 0 ? 'marque ao menos um lançamento'
    : Math.abs(difSel) > 0.01 ? 'os valores não batem' : '';

  const conciliar = async () => {
    const extratoId = [...sel.extratos][0];
    if (!extratoId) return;
    setGravando(true); setErro(null);
    const itens = [...sel.lancamentos].map((id) => ({
      lancamento_id: id, valor: Math.abs(sisIndex.get(id)?.valor_assinado ?? 0),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data: r, error } = await (supabase as any).rpc('fn_espelho_casar', {
      p_extrato_id: extratoId, p_itens: itens, p_simular: false, p_motivo: 'casado_no_espelho',
    });
    setGravando(false);
    if (error) { setErro(error.message); return; }
    const res = (r ?? {}) as { ok?: boolean; motivo?: string };
    if (res.ok === false) { setErro(MOTIVO_CASAR_LABEL[res.motivo ?? ''] ?? res.motivo ?? 'Não foi possível conciliar.'); return; }
    limpar();
    onMudou();
  };

  const mesDoRecorte = anoMes;

  const comoLevado = (s: EspSis): LevadoInicial => ({
    lancamento_id: s.lancamento_id, descricao: s.descricao,
    fornecedor: s.fornecedor ?? null, valor_assinado: s.valor_assinado,
  });

  /* ⚠ O ARRASTADO ENTRA JUNTO COM OS MARCADOS, e sem duplicar: arrastar um que já estava
     marcado leva a seleção inteira uma vez só, não ele duas. */
  const aoSoltar = (ev: DragEndEvent) => {
    setArrastando(null);
    const alvo = String(ev.over?.id ?? '');
    const origem = String(ev.active?.id ?? '');
    if (!alvo.startsWith('ext:') || !origem.startsWith('lan:')) return;
    const extrato = extratoIndex.get(alvo.slice(4));
    if (!extrato) return;
    const ids = new Set<string>([origem.slice(4), ...sel.lancamentos]);
    const iniciais = [...ids].map((id) => sisIndex.get(id)).filter((x): x is EspSis => !!x).map(comoLevado);
    if (iniciais.length === 0) return;
    setCasar({
      extrato: { extrato_id: extrato.extrato_id, data: extrato.data, historico: extrato.historico, valor: extrato.valor },
      iniciais,
    });
  };

  const abrirCasarDaBarra = () => {
    const extratoId = [...sel.extratos][0];
    const extrato = extratoId ? extratoIndex.get(extratoId) : undefined;
    if (!extrato) return;
    const iniciais = [...sel.lancamentos].map((id) => sisIndex.get(id)).filter((x): x is EspSis => !!x).map(comoLevado);
    setCasar({
      extrato: { extrato_id: extrato.extrato_id, data: extrato.data, historico: extrato.historico, valor: extrato.valor },
      iniciais,
    });
  };
  const marcado = (lado: 'extratos' | 'lancamentos', id: string) => sel[lado].has(id);

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}
      onDragStart={(ev) => setArrastando(sisIndex.get(String(ev.active.id).slice(4)) ?? null)}>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {/* ⚠ A RÉGUA É O PADRÃO DA TABELA, não de cada célula. Sem isto, as células que não
            declaram tamanho — as dos checkboxes, a das ações, a do lançamento — herdam os
            16px/24px do documento e esticam a linha de 21px para 26,5px, mesmo com `h-[21px]`
            no `<tr>`: altura em tabela é mínimo, não teto. Medido em 09/09/2026. */}
        <table className="w-full border-collapse text-[11px] leading-[1.3]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 18 }} /><col style={{ width: 36 }} /><col />
            <col style={{ width: 92 }} /><col style={{ width: 26 }} />
            <col style={{ width: 18 }} /><col style={{ width: 92 }} /><col />
            <col style={{ width: 104 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted h-5">
              <th />
              <th colSpan={3} className="px-[5px] text-left text-[10px] font-medium text-primary">BANCO (OFX)</th>
              <th className={MEIO} />
              <th colSpan={3} className="px-[5px] text-left text-[10px] font-medium text-primary">SISTEMA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <React.Fragment key={d.data ?? 'sem-data'}>
                <tr className="bg-muted/40 h-4">
                  <td colSpan={4} className="px-[5px] text-[10px] font-medium text-muted-foreground">{fmtData(d.data)}</td>
                  <td className={MEIO} />
                  <td colSpan={4} />
                </tr>

                {d.pareados.map((p) => {
                  const icone = iconeDoLancamento(p.tipoVencedor);
                  const agrupado = p.filhas.length > 1;
                  const unica = p.filhas.length === 1 ? p.filhas[0] : null;
                  const temDif = Math.abs(p.diferenca) > 0.01;
                  const somaAssinada = Math.sign(p.extrato.valor || 1) * p.soma;
                  return (
                    <React.Fragment key={p.extrato.extrato_id}>
                      <tr className={cn(H21, 'border-b border-border/50', agrupado && 'bg-muted/20')}>
                        <td />
                        <td className={cn(CEL, 'text-[10px] text-muted-foreground')}>{fmtData(p.extrato.data)}</td>
                        <td className={cn(CEL, 'text-[10px] font-medium')} title={p.extrato.historico ?? ''}>{p.extrato.historico ?? '—'}</td>
                        <td className={cn(CEL, 'text-right text-[11px] font-medium tabular-nums', corVal(p.extrato.valor))}>{fmtBRL(p.extrato.valor)}</td>
                        <td className={cn(MEIO, 'text-[12px] font-semibold', icone?.cor)} title={icone?.significado}>{icone?.simbolo}</td>
                        <td />
                        <td className={cn(CEL, 'text-left text-[11px] font-medium tabular-nums', temDif ? 'text-amber-600' : corVal(somaAssinada))}
                            title={temDif ? `banco ${fmtBRL(Math.abs(p.diferenca))} ${p.diferenca > 0 ? 'a mais' : 'a menos'} que a soma` : undefined}>
                          {fmtBRL(somaAssinada)}
                        </td>
                        <td className={CEL}>
                          {agrupado
                            ? <><span className="text-[11px] font-medium">{p.filhas.length} lançamentos</span>
                                <span className="text-[10px] text-muted-foreground">{' · '}{p.grupoId ? 'agrupados' : `${p.filhas.length} vínculos`}</span></>
                            : textoLancamento(unica?.sis, mesDoRecorte)}
                          {unica && unica.deN > 1 && <span className="text-[10px] text-muted-foreground">{' · '}1 de {unica.deN}</span>}
                        </td>
                        <td className={cn(CEL, 'text-right')}>
                          {unica && onAbrir && <Acao onClick={() => onAbrir(unica.lancamento_id)}>abrir</Acao>}
                          {(unica || p.grupoId) && (
                            <Acao className="ml-1.5" onClick={async () => {
                              const r = p.grupoId
                                ? await desfazerGrupo(p.grupoId, 'desfeito_no_espelho')
                                : await desfazerVinculo(p.extrato.extrato_id, 'desfeito_no_espelho');
                              if (r.ok) onMudou(); else setErro(r.erro ?? 'Não foi possível desconciliar.');
                            }}>{p.grupoId ? 'desconciliar grupo' : 'desconciliar'}</Acao>
                          )}
                        </td>
                      </tr>

                      {agrupado && p.filhas.map((f) => (
                        <tr key={f.lancamento_id} className="h-[15px] bg-muted/40 border-b border-border/50">
                          <td /><td /><td /><td />
                          <td className={cn(MEIO, 'text-[11px] font-normal text-muted-foreground')}>↳</td>
                          <td />
                          <td className={cn(CEL, 'text-left text-[10px] tabular-nums', corVal(Math.sign(p.extrato.valor || 1) * f.valor_aplicado))}>{fmtBRL(f.valor_aplicado)}</td>
                          <td className={cn(CEL, 'text-[10px]')}>{textoLancamento(f.sis, mesDoRecorte)}</td>
                          <td className={cn(CEL, 'text-right')}>{onAbrir && <Acao onClick={() => onAbrir(f.lancamento_id)}>abrir</Acao>}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {d.extratosSemPar.map((e) => (
                  <LinhaExtratoSemPar key={e.extrato_id} e={e}
                    marcado={marcado('extratos', e.extrato_id)} onMarcar={() => alterna('extratos', e.extrato_id)} />
                ))}

                {d.lancsSemPar.map((sl) => (
                  <LinhaLancSemPar key={sl.lancamento_id} s={sl} mesDoRecorte={mesDoRecorte}
                    marcado={marcado('lancamentos', sl.lancamento_id)}
                    onMarcar={() => alterna('lancamentos', sl.lancamento_id)} onAbrir={onAbrir} />
                ))}

                <tr className="h-[22px] bg-primary/10 border-t border-b border-border">
                  <td colSpan={3} className={cn(CEL, 'text-[11px] font-semibold text-primary')}>fechamento {fmtData(d.data)}</td>
                  <td className={cn(CEL, 'text-right text-[11px] font-semibold tabular-nums', corVal(d.banco))}>{fmtBRL(d.banco)}</td>
                  <td className={MEIO} />
                  <td />
                  <td className={cn(CEL, 'text-left text-[11px] font-semibold tabular-nums', corVal(d.sistema))}>{fmtBRL(d.sistema)}</td>
                  <td />
                  <td className={cn(CEL, 'text-right text-[11px] font-semibold')}>
                    {Math.abs(d.banco - d.sistema) <= 0.01
                      ? <span className="text-emerald-600">confere</span>
                      : <span className="text-amber-600">diferença {fmtBRL(d.banco - d.sistema)}</span>}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <FechamentoDoMes data={data} dias={dias} />

      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-1 text-[10px] text-muted-foreground">
        <span><span className="text-muted-foreground">○</span> extrato sem par</span>
        <span><span className="text-destructive font-semibold">!</span> lançamento sem par</span>
        {LEGENDA_ICONES.map((ic) => (
          <span key={ic.simbolo}><span className={cn('font-semibold', ic.cor)}>{ic.simbolo}</span> {ic.curto}</span>
        ))}
        <span>↳ dentro de um agrupamento</span>
      </div>

      {/* ⚠ A BARRA SÓ EXISTE COM SELEÇÃO, e some ao limpar: uma barra permanente vazia
          ocuparia 30px de mesa para não dizer nada. Esc limpa. */}
      {(sel.extratos.size > 0 || sel.lancamentos.size > 0) && (
        <div className="shrink-0 border-t-2 border-t-[#E7C873] bg-primary px-3.5 py-1.5 text-primary-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span>
              marcados: {sel.extratos.size} extrato{sel.extratos.size === 1 ? '' : 's'}{' '}
              <span className="tabular-nums">{fmtBRL(somaExtratos)}</span>
              {' · '}{sel.lancamentos.size} lançamento{sel.lancamentos.size === 1 ? '' : 's'}{' '}
              <span className="tabular-nums">{fmtBRL(somaLancs)}</span>
            </span>
            <span className="text-[#E7C873] tabular-nums">diferença {fmtBRL(difSel)}</span>
            {erro && <span className="text-[#F5B5B5]">{erro}</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" disabled={!podeConciliar || gravando} onClick={conciliar}
                title={podeConciliar ? undefined : motivoBloqueio}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium',
                  podeConciliar && !gravando ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'bg-primary-foreground/20 text-primary-foreground/50 cursor-not-allowed')}>
                {gravando ? 'Conciliando…' : 'Conciliar'}
              </button>
              <button type="button" disabled={sel.extratos.size !== 1} onClick={abrirCasarDaBarra}
                title={sel.extratos.size === 1 ? undefined : 'marque um extrato'}
                className={cn('rounded px-2 py-0.5 text-[11px]',
                  sel.extratos.size === 1
                    ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30'
                    : 'bg-primary-foreground/20 text-primary-foreground/50 cursor-not-allowed')}>
                Casar com o banco…
              </button>
              <button type="button" onClick={limpar} className="text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100">
                limpar
              </button>
            </span>
          </div>
        </div>
      )}

      {/* O fantasma segue o cursor: quem arrasta precisa ver O QUE está arrastando. */}
      <DragOverlay dropAnimation={null}>
        {arrastando && (
          <div className="rounded border bg-card px-2 py-0.5 text-[10px] shadow">
            {arrastando.descricao ?? '—'}
            <span className={cn('ml-2 font-medium tabular-nums', corVal(arrastando.valor_assinado))}>
              {fmtBRL(arrastando.valor_assinado)}
            </span>
          </div>
        )}
      </DragOverlay>

      <CasarComBancoModal
        open={!!casar}
        onClose={() => setCasar(null)}
        extrato={casar?.extrato ?? null}
        iniciais={casar?.iniciais ?? []}
        nomeConta={nomeConta}
        contaBancariaId={contaId}
        onConciliado={() => { limpar(); onMudou(); }}
      />
    </div>
    </DndContext>
  );
}

/**
 * O fechamento do mês — fora da tabela, abaixo dos dias.
 *
 * ⚠ SAÍDAS E ENTRADAS SEPARADAS, nunca o líquido. Um mês que recebeu 100 e pagou 100 fecha em
 * zero pelos dois lados e não diz nada; separado, ele mostra os dois movimentos que houve.
 */
function FechamentoDoMes({ data, dias }: { data: EspelhadosReais; dias: readonly DiaConf[] }) {
  const somaSe = (v: readonly number[], f: (n: number) => boolean) => v.filter(f).reduce((a, n) => a + n, 0);
  const ofx = data.ofx_completo.map((o) => o.valor);
  const sis = data.sistema_completo.map((s) => s.valor_assinado);
  const vinculados = new Set((data.vinculos ?? []).map((v) => v.lancamento_id));
  const extratosSemPar = dias.reduce((a, d) => a + d.extratosSemPar.length, 0);
  const lancsSemPar = data.sistema_completo.filter((s) => !vinculados.has(s.lancamento_id));
  const totalSemPar = lancsSemPar.reduce((a, s) => a + s.valor_assinado, 0);

  const linha = (rot: string, f: (n: number) => boolean, cor: string) => {
    const b = somaSe(ofx, f), s = somaSe(sis, f);
    return (
      <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 items-baseline">
        <span className="text-[10px] text-muted-foreground">{rot}</span>
        <span className={cn('text-[15px] font-medium tabular-nums', cor)}>{fmtBRL(b)}</span>
        <span className={cn('text-[15px] font-medium tabular-nums', cor)}>{fmtBRL(s)}</span>
        <span className={cn('text-[15px] font-medium tabular-nums', Math.abs(b - s) <= 0.01 ? 'text-muted-foreground' : 'text-amber-600')}>{fmtBRL(b - s)}</span>
      </div>
    );
  };

  return (
    <div className="shrink-0 border-t bg-primary/10 px-3.5 py-1.5 space-y-1">
      <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 text-[10px] text-muted-foreground">
        <span />
        <span>banco</span><span>sistema</span><span>diferença</span>
      </div>
      {linha('saídas', (n) => n < 0, 'text-rose-600')}
      {linha('entradas', (n) => n > 0, 'text-emerald-600')}
      <div className="text-[10px] text-muted-foreground">
        sem par: {extratosSemPar} extrato{extratosSemPar === 1 ? '' : 's'} ·{' '}
        {lancsSemPar.length} lançamento{lancsSemPar.length === 1 ? '' : 's'}
        {lancsSemPar.length > 0 && <span className="text-destructive"> · {fmtBRL(totalSemPar)}</span>}
      </div>
    </div>
  );
}

interface Props {
  clienteId: string | null;
  contaId: string | null;
  ano: string;
  mes: string;
}

export function EspelhoConciliacaoTab({ clienteId, contaId, ano, mes }: Props) {
  const anoMes = `${ano}-${mes}`;
  const [aba, setAba] = useState<'conferencia' | 'ofx' | 'sistema' | 'evolucao'>('conferencia');
  /* "abrir" é a MESMA leitura que o Extrato Gerencial usa — a aba é dona do próprio diálogo,
     em vez de exigir um handler de uma página que não tem nenhum. */
  const [lancLeituraId, setLancLeituraId] = useState<string | null>(null);
  const onAbrirLancamento = (id: string) => setLancLeituraId(id);

  const { data, refetch } = useQuery({
    queryKey: ['espelho-conciliacao', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<EspelhadosReais | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data: d, error } = await (supabase as any).rpc('fn_extratos_espelhados', {
        p_cliente: clienteId, p_conta: contaId, p_mes: anoMes,
      });
      if (error) throw error;
      return (d as EspelhadosReais) ?? null;
    },
  });

  /* ⚠ A RPC É POR UMA CONTA. O cabeçalho da Conciliação permite "todas", e comparar um
     extrato de uma conta com o sistema de várias não é espelho nenhum — a tela pede a
     escolha em vez de somar o que não se soma. */
  if (!contaId) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
        Escolha uma conta no cabeçalho: o espelho compara o extrato de uma conta com o que o sistema pagou nela.
      </div>
    );
  }
  if (!data) {
    return <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">Carregando o espelho…</div>;
  }

  const inicial = data.saldos.inicial ?? 0;

  /* Os quatro números do topo (A18). "Saídas" = soma dos negativos de cada lado; entradas
     aparecem à parte quando existem, porque somá-las esconderia as duas metades. */
  const saidasBanco = data.ofx_completo.filter((o) => o.valor < 0).reduce((a, o) => a + o.valor, 0);
  const entradasBanco = data.ofx_completo.filter((o) => o.valor > 0).reduce((a, o) => a + o.valor, 0);
  const saidasSistema = data.sistema_completo.filter((s) => s.valor_assinado < 0).reduce((a, s) => a + s.valor_assinado, 0);
  const entradasSistema = data.sistema_completo.filter((s) => s.valor_assinado > 0).reduce((a, s) => a + s.valor_assinado, 0);
  const difSaidas = saidasBanco - saidasSistema;
  const confereSaidas = Math.abs(difSaidas) <= 0.01;

  const vinculados = new Set((data.vinculos ?? []).map((v) => v.lancamento_id));
  const extratosComVinculo = new Set((data.vinculos ?? []).map((v) => v.extrato_id));
  const semCorrespondencia = data.ofx_completo.filter((o) => !extratosComVinculo.has(o.extrato_id));
  const noSistemaNaoNoBanco = data.sistema_completo.filter((s) => !vinculados.has(s.lancamento_id));
  const totalNaoNoBanco = noSistemaNaoNoBanco.reduce((a, s) => a + s.valor_assinado, 0);

  const abas = [
    { key: 'conferencia' as const, label: 'Conferência' },
    { key: 'ofx' as const, label: 'Extrato (banco)' },
    { key: 'sistema' as const, label: 'Sistema' },
    { key: 'evolucao' as const, label: 'Evolução do saldo' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A21 — os números não rolam; só a lista de dentro da sub-aba. O título e a conta
          moram no cabeçalho azul do modal, não aqui: repetir seria gastar altura duas vezes. */}
      <div className="shrink-0 space-y-1.5 px-3.5 py-2">
        <div className="text-[10px] text-muted-foreground">
          {data.ofx_completo.length} movimento{data.ofx_completo.length === 1 ? '' : 's'} no extrato ·{' '}
          {noSistemaNaoNoBanco.length} lançamento{noSistemaNaoNoBanco.length === 1 ? '' : 's'} sem par no banco
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <div className="text-[10px] text-muted-foreground">Saídas do banco</div>
            <div className="text-[16px] font-medium tabular-nums leading-tight">{fmtBRL(saidasBanco)}</div>
            {entradasBanco > 0 && <div className="text-[10px] text-muted-foreground">entradas {fmtBRL(entradasBanco)}</div>}
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Saídas do sistema</div>
            <div className="text-[16px] font-medium tabular-nums leading-tight">{fmtBRL(saidasSistema)}</div>
            {confereSaidas
              ? <div className="text-[10px] text-emerald-600">confere</div>
              : <div className="text-[10px] text-amber-600">diferença {fmtBRL(difSaidas)}</div>}
            {entradasSistema > 0 && <div className="text-[10px] text-muted-foreground">entradas {fmtBRL(entradasSistema)}</div>}
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Extratos sem correspondência</div>
            <div className="text-[16px] font-medium tabular-nums leading-tight">{semCorrespondencia.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">No sistema e não no banco</div>
            <div className={cn('text-[16px] font-medium tabular-nums leading-tight', noSistemaNaoNoBanco.length > 0 && 'text-destructive')}>
              {noSistemaNaoNoBanco.length}
            </div>
            {noSistemaNaoNoBanco.length > 0 && (
              <div className="text-[10px] text-destructive">R$ {fmtBRL(totalNaoNoBanco)}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {abas.map((a) => (
            <button key={a.key} type="button" onClick={() => setAba(a.key)}
              className={cn('px-2 py-0.5 rounded text-[10px] border',
                aba === a.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'conferencia' && (
        <AbaConferencia data={data} anoMes={anoMes} nomeConta={data.escopo.nome_conta ?? undefined}
          contaId={contaId} onAbrir={onAbrirLancamento} onMudou={() => { void refetch(); }} />
      )}
      {aba === 'ofx' && <AbaOfxReal ofx={data.ofx_completo} inicial={inicial} />}
      {aba === 'sistema' && <AbaSistemaReal sistema={data.sistema_completo} inicial={inicial} onAbrir={onAbrirLancamento} />}
      {aba === 'evolucao' && <AbaEvolucaoReal data={data} />}

      <LancamentoLeituraDialog open={!!lancLeituraId} lancamentoId={lancLeituraId} onClose={() => setLancLeituraId(null)} />
    </div>
  );
}

/**
 * O ESPELHO COMO MODAL — PR-ESPELHO-02.
 *
 * ⚠ MODAL, NÃO ABA (decisão do Gabriel, 09/09). O espelho é consultado DURANTE a importação:
 * o operador acabou de subir o OFX e quer saber o que ficou de fora. Uma aba o tiraria da
 * tela onde ele está; o modal devolve o contexto ao fechar. Como efeito, a tela inteira
 * passa a ser útil — 92vh de altura contra a fatia que sobrava numa aba.
 *
 * ⚠ SÓ A LISTA ROLA (A21). O corpo é `flex-col` com `min-h-0`, os números e a legenda são
 * `shrink-0` e a lista fica com o `flex-1`. Sem isso o modal inteiro rolaria e o operador
 * perderia de vista o número que está conferindo.
 */
export function EspelhoOfxSistemaModal({
  open, onClose, clienteId, contaId, ano, mes, nomeConta,
}: {
  open: boolean; onClose: () => void;
  clienteId: string | null; contaId: string | null; ano: string; mes: string; nomeConta?: string;
}) {
  const rotuloMes = `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano}`;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[96vw] max-w-[1600px] h-[92vh] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 bg-primary px-3.5 text-primary-foreground">
          <span className="text-[13px] font-medium">Espelho OFX × Sistema</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] opacity-90 truncate max-w-[40vw]">
              {[nomeConta, rotuloMes].filter(Boolean).join(' · ')}
            </span>
            <button type="button" onClick={onClose} aria-label="Fechar"
              className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {open && (
          <EspelhoConciliacaoTab clienteId={clienteId} contaId={contaId} ano={ano} mes={mes} />
        )}
      </DialogContent>
    </Dialog>
  );
}
