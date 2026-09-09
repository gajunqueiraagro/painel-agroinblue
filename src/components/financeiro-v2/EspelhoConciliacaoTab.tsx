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
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { iconeOrigemLancamento, LEGENDA_ICONES, vinculoVencedor } from '@/v2/lib/origemLancamento';
import { desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import { LancamentoLeituraDialog } from '@/components/financeiro-v2/LancamentoLeituraDialog';

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};

type EspStatus = 'conciliado' | 'sem_vinculo' | 'ignorado';
interface EspOfx { extrato_id: string; data: string | null; historico: string | null; documento: string | null; valor: number; status: EspStatus; flag_dup: boolean; flag_investimento: boolean; }
interface EspSis { lancamento_id: string; data: string | null; descricao: string | null; centro: string | null; subcentro: string | null; valor_assinado: number; sinal: string | null; status: 'conciliado' | 'sem_vinculo'; }
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

// ── Conferência — a lista que segue o vínculo ──────────────────────────────
interface FilhaConf { lancamento_id: string; valor_aplicado: number; sis?: EspSis; deN: number; }
interface LinhaConf {
  extrato: EspOfx;
  filhas: FilhaConf[];
  grupoId: string | null;
  tipoVencedor: string | null;
  somaAplicada: number;
  diferenca: number;
}

/**
 * Monta a Conferência a partir de `vinculos`.
 *
 * ⚠ NENHUM PAREAMENTO POR VALOR OU DATA. Cada extrato recebe exatamente os lançamentos que
 * `conciliacao_bancaria_itens` diz que ele tem. Extrato sem vínculo fica sem lado direito, e
 * essa lacuna é a resposta — não um defeito a maquiar.
 */
function montarConferencia(data: EspelhadosReais) {
  const vinculos = data.vinculos ?? [];
  const sisPorId = new Map(data.sistema_completo.map((s) => [s.lancamento_id, s]));

  /* Em quantos extratos cada lançamento aparece — o sufixo "1 de N" do N:1. */
  const extratosPorLanc = new Map<string, number>();
  for (const v of vinculos) {
    extratosPorLanc.set(v.lancamento_id, (extratosPorLanc.get(v.lancamento_id) ?? 0) + 1);
  }

  const porExtrato = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porExtrato.get(v.extrato_id);
    if (l) l.push(v); else porExtrato.set(v.extrato_id, [v]);
  }

  const linhas: LinhaConf[] = data.ofx_completo.map((extrato) => {
    const vs = porExtrato.get(extrato.extrato_id) ?? [];
    const somaAplicada = vs.reduce((acc, v) => acc + Number(v.valor_aplicado ?? 0), 0);
    /* A precedência é a mesma do ícone do Financeiro — uma função só, desde o B-4. */
    const vencedor = vinculoVencedor(vs, (v) => v.tipo_aprovacao);
    return {
      extrato,
      filhas: vs.map((v) => ({
        lancamento_id: v.lancamento_id,
        valor_aplicado: Number(v.valor_aplicado ?? 0),
        sis: sisPorId.get(v.lancamento_id),
        deN: extratosPorLanc.get(v.lancamento_id) ?? 1,
      })),
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      tipoVencedor: vencedor?.tipo_aprovacao ?? null,
      somaAplicada,
      /* ⚠ ABS DOS DOIS LADOS: extrato e lançamento carregam sinal por convenções diferentes.
         Comparar com sinal acusaria diferença em toda saída. */
      diferenca: vs.length ? Math.abs(extrato.valor) - Math.abs(somaAplicada) : 0,
    };
  });

  /* "No sistema e não no banco": o que o recorte pagou nesta conta sem extrato que o explique.
     É a resposta para "o que está a mais", e por isso é lista própria, não uma linha perdida. */
  const comVinculo = new Set(vinculos.map((v) => v.lancamento_id));
  const semPar = data.sistema_completo.filter((s) => !comVinculo.has(s.lancamento_id));

  return { linhas, semPar };
}

function agruparPorDia(linhas: readonly LinhaConf[]) {
  const dias: { data: string | null; itens: LinhaConf[] }[] = [];
  const idx = new Map<string, LinhaConf[]>();
  for (const l of linhas) {
    const k = l.extrato.data ?? 'sem-data';
    const atual = idx.get(k);
    if (atual) atual.push(l);
    else { const nova = [l]; idx.set(k, nova); dias.push({ data: l.extrato.data, itens: nova }); }
  }
  return dias;
}

/**
 * O ícone de origem, com a mesma régua do Financeiro.
 *
 * ⚠ SÓ O RAMO DO VÍNCULO É EXERCITADO AQUI, e por isso os demais campos são inertes: esta
 * função só é chamada quando há vínculo, e a primeira cláusula do classificador decide
 * antes de olhar status, conta ou data. O `!` e o `M` não existem nesta tela — quem não tem
 * vínculo aparece como "sem correspondência", que é a mesma informação dita em palavras.
 */
function iconeDoLancamento(tipo: string | null) {
  return iconeOrigemLancamento(
    { status_transacao: 'realizado', editado_manual: false, conta_bancaria_id: null, data_pagamento: null },
    { tipoAprovacao: tipo },
    undefined,
  );
}

function Acao({ children, onClick, tom }: { children: React.ReactNode; onClick: () => void; tom?: 'destructive' }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('text-[10px] underline underline-offset-2', tom === 'destructive' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground')}>
      {children}
    </button>
  );
}

const GRADE = 'grid grid-cols-[44px_22px_1fr_96px_100px_22px_1fr_96px_92px] gap-1 items-center';

function LinhaConferencia({ l, onAbrir, onDesfeito }: {
  l: LinhaConf; onAbrir?: (id: string) => void; onDesfeito: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nFilhas = l.filhas.length;
  const agrupado = nFilhas > 1;
  const temDif = Math.abs(l.diferenca) > 0.01;
  const icone = nFilhas ? iconeDoLancamento(l.tipoVencedor) : null;
  const unica = nFilhas === 1 ? l.filhas[0] : null;

  const desfazer = async () => {
    setErro(null);
    const r = l.grupoId
      ? await desfazerGrupo(l.grupoId, 'desfeito_no_espelho')
      : await desfazerVinculo(l.extrato.extrato_id, 'desfeito_no_espelho');
    setConfirmando(false);
    if (!r.ok) { setErro(r.erro ?? 'Não foi possível desfazer.'); return; }
    onDesfeito();
  };

  /* ⚠ COM N VÍNCULOS SEM `grupo_id` A AÇÃO SOME. A RPC unitária recusa membro de grupo e não
     existe "desfazer os N": prometer o botão seria prometer o que o banco nega. */
  const podeDesfazer = nFilhas === 1 || !!l.grupoId;

  return (
    <div className={cn('border-b last:border-b-0', agrupado && 'bg-[#fbfcfd]')}>
      <div className={cn(GRADE, 'px-3.5 py-1.5 text-[12px]')}>
        <span className="text-[10px] text-muted-foreground tabular-nums">{fmtData(l.extrato.data)}</span>
        <span className="text-center" title={nFilhas ? 'conciliado' : 'sem correspondência'}>
          {nFilhas ? <span className="text-emerald-500">●</span> : <span className="text-muted-foreground">○</span>}
        </span>
        <span className="truncate" title={l.extrato.historico ?? ''}>{l.extrato.historico ?? '—'}</span>
        <span className={cn('text-right tabular-nums', corValReal(l.extrato.valor))}>{fmtBRL(l.extrato.valor)}</span>
        <span className="text-[10px] text-muted-foreground">{nFilhas ? 'conciliado' : 'sem correspondência'}</span>

        {icone
          ? <span className={cn('text-center text-[14px] font-semibold leading-none', icone.cor)} title={icone.significado}>{icone.simbolo}</span>
          : <span />}

        <span className="min-w-0">
          {nFilhas === 0 && <span className="text-muted-foreground">— nenhum lançamento vinculado</span>}
          {agrupado && (
            <span className="truncate block">
              {nFilhas} lançamentos <span className="text-[10px] text-muted-foreground">{l.grupoId ? 'agrupados' : `${nFilhas} vínculos`}</span>
            </span>
          )}
          {unica && (
            <>
              <span className="truncate block" title={unica.sis?.descricao ?? ''}>
                {unica.sis?.descricao ?? '—'}
                {unica.deN > 1 && <span className="ml-1 text-[10px] text-muted-foreground">1 de {unica.deN}</span>}
              </span>
              <span className="block text-[10px] text-muted-foreground truncate">
                {[unica.sis?.subcentro, unica.sis?.centro].filter(Boolean).join(' · ') || '—'}
              </span>
            </>
          )}
        </span>

        <span className={cn('text-right tabular-nums', temDif ? 'text-amber-600 font-medium' : nFilhas ? corValReal(-l.somaAplicada) : '')}>
          {nFilhas ? fmtBRL(l.somaAplicada) : ''}
        </span>

        <span className="flex items-center justify-end gap-1.5">
          {unica && onAbrir && <Acao onClick={() => onAbrir(unica.lancamento_id)}>abrir</Acao>}
          {nFilhas > 0 && podeDesfazer && (
            confirmando
              ? <Acao tom="destructive" onClick={desfazer}>confirmar</Acao>
              : <Acao onClick={() => setConfirmando(true)}>{l.grupoId ? 'desfazer grupo' : 'desfazer'}</Acao>
          )}
        </span>
      </div>

      {temDif && (
        <div className="px-3.5 pb-1 text-[10px] text-amber-700">
          banco pagou {fmtBRL(Math.abs(l.diferenca))} a {l.diferenca > 0 ? 'mais' : 'menos'} que a soma dos lançamentos
        </div>
      )}
      {erro && <div className="px-3.5 pb-1 text-[10px] text-destructive">{erro}</div>}

      {agrupado && l.filhas.map((f) => (
        <div key={f.lancamento_id} className={cn(GRADE, 'bg-muted/40 px-3.5 py-1 text-[10px]')}>
          <span className="text-muted-foreground pl-3.5">↳</span>
          <span /><span /><span /><span /><span />
          <span className="truncate" title={f.sis?.descricao ?? ''}>
            {f.sis?.descricao ?? '—'}
            {f.deN > 1 && <span className="ml-1 text-muted-foreground">1 de {f.deN}</span>}
            <span className="block text-muted-foreground truncate">
              {[f.sis?.subcentro, fmtData(f.sis?.data ?? null)].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className={cn('text-right tabular-nums', corValReal(-f.valor_aplicado))}>{fmtBRL(f.valor_aplicado)}</span>
          <span className="flex justify-end">{onAbrir && <Acao onClick={() => onAbrir(f.lancamento_id)}>abrir</Acao>}</span>
        </div>
      ))}
    </div>
  );
}

function AbaConferencia({ data, mesRotulo, onAbrir, onDesfeito }: {
  data: EspelhadosReais; mesRotulo: string; onAbrir?: (id: string) => void; onDesfeito: () => void;
}) {
  const { linhas, semPar } = useMemo(() => montarConferencia(data), [data]);
  const dias = useMemo(() => agruparPorDia(linhas), [linhas]);
  const totalSemPar = semPar.reduce((a, s) => a + s.valor_assinado, 0);

  return (
    <div className="flex min-h-0 flex-col gap-1">
      {/* A21 — só a lista rola; a legenda fica fora dela. */}
      <div className="min-h-0 max-h-[55vh] overflow-y-auto rounded-md border">
        {dias.map((d) => {
          const banco = d.itens.reduce((a, l) => a + l.extrato.valor, 0);
          /* O aplicado é magnitude; o sinal de cada linha é o do extrato que ela explica. */
          const sistema = d.itens.reduce((a, l) => a + Math.sign(l.extrato.valor || 1) * l.somaAplicada, 0);
          const confere = Math.abs(banco - sistema) <= 0.01;
          return (
            <div key={d.data ?? 'sem-data'}>
              <div className="sticky top-0 z-10 bg-muted/40 px-3.5 py-0.5 text-[10px] text-muted-foreground border-b">
                {fmtData(d.data)} · banco {fmtBRL(banco)} · sistema {fmtBRL(sistema)} ·{' '}
                {confere
                  ? <span className="text-emerald-600">confere</span>
                  : <span className="text-amber-600">diferença {fmtBRL(banco - sistema)}</span>}
              </div>
              {d.itens.map((l) => (
                <LinhaConferencia key={l.extrato.extrato_id} l={l} onAbrir={onAbrir} onDesfeito={onDesfeito} />
              ))}
            </div>
          );
        })}

        <div className="border-t">
          <div className="px-3.5 py-1.5 text-[12px] font-medium text-destructive">
            No sistema e não no banco
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              — {semPar.length} lançamento{semPar.length === 1 ? '' : 's'} pago{semPar.length === 1 ? '' : 's'} em {mesRotulo} nesta conta sem extrato correspondente
            </span>
          </div>
          {semPar.length === 0 ? (
            <div className="px-3.5 pb-2 text-[11px] text-muted-foreground">
              nenhum — tudo o que o sistema pagou nesta conta tem extrato
            </div>
          ) : semPar.map((s) => (
            <div key={s.lancamento_id} className="grid grid-cols-[44px_22px_1fr_150px_96px_92px] gap-1 items-center px-3.5 py-1 border-t text-[12px]">
              <span className="text-[10px] text-muted-foreground tabular-nums">{fmtData(s.data)}</span>
              <span className="text-center text-[14px] font-semibold leading-none text-destructive" title="Sem par no banco">!</span>
              <span className="min-w-0">
                <span className="truncate block" title={s.descricao ?? ''}>{s.descricao ?? '—'}</span>
                {/* ⚠ SEM A ORIGEM: `sistema_completo` não traz `origem_lancamento`, e chamar
                    `rotuloOrigem(null)` só produziria um "—" fixo fingindo informação. Quando
                    a RPC devolver a coluna, a linha ganha a origem sem mudar de forma. */}
                <span className="block text-[10px] text-muted-foreground truncate">
                  {s.subcentro || s.centro || '—'}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground">pagamento {fmtData(s.data)}</span>
              <span className={cn('text-right tabular-nums', corValReal(s.valor_assinado))}>{fmtBRL(s.valor_assinado)}</span>
              <span className="flex justify-end">{onAbrir && <Acao onClick={() => onAbrir(s.lancamento_id)}>abrir</Acao>}</span>
            </div>
          ))}
          {semPar.length > 0 && (
            <div className="px-3.5 py-1 text-[10px] text-destructive border-t">total {fmtBRL(totalSemPar)}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
        <span><span className="text-emerald-500">●</span> conciliado</span>
        <span><span className="text-muted-foreground">○</span> sem correspondência</span>
        {LEGENDA_ICONES.map((ic) => (
          <span key={ic.simbolo}><span className={cn('font-semibold', ic.cor)}>{ic.simbolo}</span> {ic.curto}</span>
        ))}
        <span>linha em cinza = lançamento dentro de um agrupamento</span>
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

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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
  const mesRotulo = `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;

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
    <div className="flex min-h-0 flex-col gap-2">
      {/* A21 — o cabeçalho e os números não rolam; só a lista de dentro da sub-aba. */}
      <div className="sticky top-0 z-20 shrink-0 rounded-md border bg-card px-3 py-2 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-medium">Espelho — o que o banco viu × o que o sistema tem</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[40%]" title={data.escopo.nome_conta ?? ''}>
            {data.escopo.nome_conta ?? ''}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {data.ofx_completo.length} movimento{data.ofx_completo.length === 1 ? '' : 's'} no extrato ·{' '}
          {noSistemaNaoNoBanco.length} lançamento{noSistemaNaoNoBanco.length === 1 ? '' : 's'} sem par no banco
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-muted-foreground">Saídas do banco</div>
            <div className="text-[20px] font-medium tabular-nums leading-tight">{fmtBRL(saidasBanco)}</div>
            {entradasBanco > 0 && <div className="text-[10px] text-muted-foreground">entradas {fmtBRL(entradasBanco)}</div>}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Saídas do sistema</div>
            <div className="text-[20px] font-medium tabular-nums leading-tight">{fmtBRL(saidasSistema)}</div>
            {confereSaidas
              ? <div className="text-[11px] text-emerald-600">confere</div>
              : <div className="text-[11px] text-amber-600">diferença {fmtBRL(difSaidas)}</div>}
            {entradasSistema > 0 && <div className="text-[10px] text-muted-foreground">entradas {fmtBRL(entradasSistema)}</div>}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Extratos sem correspondência</div>
            <div className="text-[20px] font-medium tabular-nums leading-tight">{semCorrespondencia.length}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">No sistema e não no banco</div>
            <div className={cn('text-[20px] font-medium tabular-nums leading-tight', noSistemaNaoNoBanco.length > 0 && 'text-destructive')}>
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
              className={cn('px-2 py-0.5 rounded text-[11px] border',
                aba === a.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'conferencia' && (
        <AbaConferencia data={data} mesRotulo={mesRotulo} onAbrir={onAbrirLancamento} onDesfeito={() => { void refetch(); }} />
      )}
      {aba === 'ofx' && <AbaOfxReal ofx={data.ofx_completo} inicial={inicial} />}
      {aba === 'sistema' && <AbaSistemaReal sistema={data.sistema_completo} inicial={inicial} onAbrir={onAbrirLancamento} />}
      {aba === 'evolucao' && <AbaEvolucaoReal data={data} />}

      <LancamentoLeituraDialog open={!!lancLeituraId} lancamentoId={lancLeituraId} onClose={() => setLancLeituraId(null)} />
    </div>
  );
}
