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
import { CasarComBancoModal, CasarN1Modal, type ExtratoAlvo, type LevadoInicial } from '@/components/financeiro-v2/CasarComBancoModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DecisaoDerivadosDialog } from '@/components/financeiro-v2/DecisaoDerivadosDialog';
import { useEspelhoInternas, type EspelhoInternas } from '@/hooks/useEspelhoInternas';
import { toast } from 'sonner';
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

/**
 * A aba do extrato, com as duas pontas do saldo — PR-ESPELHO-07 item C.
 *
 * ⚠ O SALDO DO EXTRATO É CONSOLIDADO, e é isso que a lista precisava dizer. O extrato do
 * Bradesco mostra a conta corrente JUNTO com a Invest Fácil, que o banco consolida nela:
 * 1,00 + 238.790,26 = 238.791,26 em 31/07. Abrir a lista pelo saldo da conta sozinha —
 * 1,00 — faria a última linha fechar 238 mil longe do papel do banco, e o operador
 * procuraria por semanas um erro que não existe.
 *
 * ⚠ O FINAL É CALCULADO, O INFORMADO É LIDO, e os dois aparecem lado a lado. Exibir só um
 * deles obrigaria a confiar: com os dois, "confere" é uma afirmação verificável, e a
 * diferença — quando existe — é o próprio número que falta explicar.
 */
function AbaOfxReal({ ofx, inicial, internas }: { ofx: EspOfx[]; inicial: number; internas: EspelhoInternas }) {
  /* ⚠ O CONSOLIDADO MANDA QUANDO EXISTE; sem ele, o saldo da própria conta, que é o que a
     lista sempre usou. Nunca um zero no lugar do desconhecido: `??` não cai em 0. */
  const abertura = internas.saldoInicialConsolidado ?? inicial;
  const rows = useMemo(() => {
    let acc = abertura;
    return ofx.map((r) => { acc += r.valor; return { r, saldo: acc }; });
  }, [ofx, abertura]);
  const movimentos = ofx.reduce((a, r) => a + r.valor, 0);
  const fechamento = abertura + movimentos;
  const informado = internas.saldoInformadoConsolidado;
  const difere = informado == null ? null : fechamento - informado;
  const SALDO_LINHA = 'grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 py-0.5 bg-muted/40 text-[11px] font-semibold';
  return (
    /* ⚠ A LISTA OCUPA A ALTURA QUE SOBRA, E TEM A MARGEM DA CONFERÊNCIA — PR-ESPELHO-06 item C.
       Era `max-h-[55vh]` sem padding lateral: a tabela parava no meio do modal de 92vh,
       sobrava faixa morta até o rodapé, e o texto encostava na borda enquanto a Conferência
       respirava em `px-3.5`. `min-h-0 flex-1` é a MESMA receita da Conferência — 55vh é uma
       altura chutada; `flex-1` é a altura que existe.
       ⚠ `min-h-0` NÃO É ENFEITE: sem ele o filho de um flex não encolhe abaixo do conteúdo e
       o `overflow-y-auto` nunca ganha barra — a página inteira é que rolaria. */
    <div className="min-h-0 flex-1 overflow-y-auto border-t px-3.5 text-[10px]">
      <div className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 bg-card">
        <span>Data</span><span>Histórico</span><span>Documento</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      <div className={cn(SALDO_LINHA, 'border-b')}>
        <span className="col-span-3">Saldo inicial (extrato)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(abertura))}>{fmtBRL(abertura)}</span>
        <span />
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
      <div className={cn(SALDO_LINHA, 'border-t')}>
        <span className="col-span-3">Saldo final (extrato)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(fechamento))}>{fmtBRL(fechamento)}</span>
        {/* ⚠ "—" QUANDO FALTA SALDO INFORMADO, nunca "difere R$ 0,00": a sentinela do
            CLAUDE.md diz que ausência é traço, e um "confere" sobre dado que não existe é a
            pior das duas mentiras possíveis aqui. */}
        <span className="text-[10px] font-normal text-muted-foreground truncate"
          title={informado == null ? 'sem saldo informado para o mês' : undefined}>
          {informado == null
            ? '—'
            : <>informado: {fmtBRL(informado)}{' · '}
                {Math.abs(difere ?? 0) <= 0.01
                  ? <span className="text-success">confere</span>
                  : <span className="text-amber-600">difere R$ {fmtBRL(Math.abs(difere ?? 0))}</span>}
              </>}
        </span>
      </div>
    </div>
  );
}

function AbaSistemaReal({ sistema, inicial, onAbrir }: { sistema: EspSis[]; inicial: number; onAbrir?: (lancamentoId: string) => void }) {
  const rows = useMemo(() => {
    let acc = inicial;
    return sistema.map((r) => { acc += r.valor_assinado; return { r, saldo: acc }; });
  }, [sistema, inicial]);
  return (
    /* Mesma régua do Extrato acima — a lista é o scrollport, e ele é o modal inteiro. */
    <div className="min-h-0 flex-1 overflow-y-auto border-t px-3.5 text-[10px]">
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

/**
 * A EVOLUÇÃO LÊ A MESMA MESA DA CONFERÊNCIA — PR-ESPELHO-06 item B. UMA RÉGUA.
 *
 * ⚠ ERAM DUAS LEITURAS DO MESMO DIA, e o caso medido mostra por quê. No Bradesco do Agnaldo,
 * jul/26, o extrato de 29/07 "RENTAB.INVEST FACILCRED" de R$ 0,05 está conciliado com DOIS
 * lançamentos de outros dias: 0,02 de 17/07 e 0,03 de 22/07. A Conferência põe o valor
 * aplicado no dia do EXTRATO (é a mesa do dia: banco × sistema têm de fechar naquele dia);
 * esta função somava `sistema_completo` pelo dia do LANÇAMENTO. Resultado medido, e é
 * exatamente o que o Gabriel viu: 17/07 divergia 0,02, 22/07 divergia 0,03 e 29/07 divergia
 * 0,05 — três dias, um único vínculo, e uma "Dif. Acum." que não era diferença nenhuma, só
 * duas datas para o mesmo dinheiro.
 * ⚠ QUEM MANDA É A CONFERÊNCIA, e não `sistema_completo` cru. A Evolução existe para
 * comparar com o OFX dia a dia, e o dia do OFX é o do extrato: pôr o movimento do sistema
 * no dia do lançamento faria a coluna "Dif. Acum." acender por um descasamento de data que
 * a conciliação já resolveu. É também a leitura homologada.
 * ⚠ E O `banco` VEM DA MESMA MESA, embora fosse igual: `montarMesa` soma todo extrato do dia
 * uma vez só, inclusive os que desenha dentro de um bloco N:1. Ler os dois lados da mesma
 * função é o que impede a próxima regra de entrar em um só.
 */
function montarEvolucao(data: EspelhadosReais, internos: ReadonlySet<string>) {
  const inicial = data.saldos.inicial ?? 0;
  const nDias = data.saldos.periodo_fim ? Number(data.saldos.periodo_fim.split('-')[2]) : 31;
  const dia = (s: string | null) => (s ? Number(s.split('-')[2]) : 0);
  const movOfx = Array(nDias + 1).fill(0);
  const movSis = Array(nDias + 1).fill(0);
  for (const d of montarMesa(data, internos)) {
    const n = dia(d.data);
    if (n >= 1 && n <= nDias) { movOfx[n] += d.banco; movSis[n] += d.sistema; }
  }
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
function AbaEvolucaoReal({ data, internos }: { data: EspelhadosReais; internos: ReadonlySet<string> }) {
  /* ⚠ A EVOLUÇÃO LÊ A MESMA MESA, e por isso herda a regra da conta interna sem repeti-la.
     Se lesse `sistema_completo` cru, a curva do sistema descolaria da do banco exatamente
     nos dias em que houve transferência interna — e o gráfico acusaria uma divergência que
     o fechamento por dia, ao lado, diz não existir. */
  const rows = useMemo(() => montarEvolucao(data, internos), [data, internos]);
  const mm = data.saldos.periodo_ini ? data.saldos.periodo_ini.split('-')[1] : '';
  return (
    /* ⚠ UM SCROLLPORT SÓ, E O RODAPÉ DENTRO DELE. Havia um `space-y-2` externo com a lista em
       `max-h-[50vh]` e DOIS blocos abaixo — um aviso âmbar de 10px e um "Saldo final oficial"
       de 11px em negrito. Os dois ocupavam duas linhas grandes de altura permanente para
       dizer o que cabe numa; e a lista, limitada a metade da tela, terminava muito antes do
       rodapé do modal. Agora a lista é o scrollport (a mesma receita das outras três) e as
       duas frases viram UMA linha de 10px muted no fim dela. */
    <div className="min-h-0 flex-1 overflow-y-auto border-t px-3.5 text-[10px]">
      <div>
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
      <div className="py-1 text-[10px] leading-tight text-muted-foreground">
        Extrato bancário importado contém movimentos até {fmtData(data.saldos.extrato_fim)}
        {' · '}Saldo final oficial (extrato):{' '}
        <span className="tabular-nums">{fmtBRL(data.saldos.final_oficial)}</span>
      </div>
    </div>
  );
}

// ── Conferência — a mesa do dia ────────────────────────────────────────────
interface FilhaConf { lancamento_id: string; valor_aplicado: number; sis?: EspSis; deN: number; }
interface Pareado {
  extrato: EspOfx; filhas: FilhaConf[]; grupoId: string | null;
  tipoVencedor: string | null; soma: number; diferenca: number;
}
/**
 * O SENTIDO INVERSO — PR-ESPELHO-05. Um lançamento explicado por VÁRIOS extratos.
 *
 * ⚠ A MÃE TROCA DE LADO. No 1:N a âncora é o extrato e as filhas são lançamentos; aqui é o
 * contrário, e a tela tem de dizer isso sem palavra nenhuma: a mãe aparece do lado do
 * SISTEMA, as filhas do lado do BANCO, e a seta do meio vira `↰` — apontando para o OFX em
 * vez de para o sistema. Desenhar os dois casos igual faria o operador ler "um extrato
 * pagou N lançamentos" onde houve "N depósitos pagaram um título".
 */
interface ParedoN1 {
  sis: EspSis;
  extratos: { extrato: EspOfx; valorAplicado: number }[];
  grupoId: string | null;
  soma: number;
  diferenca: number;
}

interface DiaConf {
  data: string | null;
  pareados: Pareado[];
  paredosN1: ParedoN1[];
  extratosSemPar: EspOfx[];
  lancsSemPar: EspSis[];
  /**
   * ⚠ TRANSFERÊNCIA COM CONTA INTERNA NÃO É "SEM PAR" — PR-ESPELHO-07 item D. O banco
   * consolida a interna nesta conta e NÃO exporta o movimento entre as duas: cobrar par de
   * um movimento que o extrato nunca teve é alarme onde não havia como acertar, e alarme
   * assim ensina a ignorar o alarme. Ela sai do contador, sai da soma do dia e aparece no
   * fim com sinal próprio — visível, porque o dinheiro andou; fora da conta, porque o banco
   * não a mostra.
   */
  internas: EspSis[];
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
/**
 * Os quatro números do topo.
 *
 * ⚠ FUNÇÃO, E EXPORTADA, PARA PODER SER PROVADA. Isto era um cálculo solto no corpo do
 * componente, e foi por isso que ninguém percebeu que ele somava um conjunto diferente do
 * fechamento por dia logo abaixo: não havia onde escrever o teste que os compara. O
 * `internos` é o MESMO que a mesa recebe — é o que faz "o mesmo conjunto" ser verdade por
 * construção, e não por coincidência mantida à mão em dois lugares.
 */
export function totaisDoEspelho(data: EspelhadosReais, internos: ReadonlySet<string>) {
  const doSistema = data.sistema_completo.filter((s) => !internos.has(s.lancamento_id));
  const soma = (xs: number[], positivo: boolean) =>
    xs.filter((v) => (positivo ? v > 0 : v < 0)).reduce((a, v) => a + v, 0);
  const banco = data.ofx_completo.map((o) => o.valor);
  const sistema = doSistema.map((s) => s.valor_assinado);
  const entradasBanco = soma(banco, true);
  const entradasSistema = soma(sistema, true);
  const saidasBanco = soma(banco, false);
  const saidasSistema = soma(sistema, false);
  return {
    entradasBanco, entradasSistema, saidasBanco, saidasSistema,
    difEntradas: entradasBanco - entradasSistema,
    difSaidas: saidasBanco - saidasSistema,
  };
}

export function montarMesa(data: EspelhadosReais, internos: ReadonlySet<string>) {
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
    if (!atual) { atual = { data: d, pareados: [], paredosN1: [], extratosSemPar: [], lancsSemPar: [], internas: [], banco: 0, sistema: 0 }; dias.set(k, atual); }
    return atual;
  };

  /* ⚠ O N:1 É DECIDIDO PELO VÍNCULO, NÃO PELO `grupo_id`. Um lançamento com dois vínculos
     ativos em extratos diferentes É um N:1, tenha ou não grupo — e os 9 casos antigos da
     base não têm. Ler o grupo primeiro deixaria esses nove desenhados como nove pares
     independentes que repetem o mesmo lançamento. */
  const porLanc = new Map<string, EspVinculo[]>();
  for (const v of vinculos) {
    const l = porLanc.get(v.lancamento_id);
    if (l) l.push(v); else porLanc.set(v.lancamento_id, [v]);
  }
  const ofxPorId = new Map(data.ofx_completo.map((o) => [o.extrato_id, o]));
  const consumidos = new Set<string>();

  porLanc.forEach((vs, lancId) => {
    if (vs.length < 2) return;
    const sis = sisPorId.get(lancId);
    if (!sis) return;
    const extratos = vs
      .map((v) => ({ extrato: ofxPorId.get(v.extrato_id), valorAplicado: Number(v.valor_aplicado ?? 0) }))
      .filter((x): x is { extrato: EspOfx; valorAplicado: number } => !!x.extrato);
    if (extratos.length < 2) return;
    extratos.forEach((x) => consumidos.add(x.extrato.extrato_id));
    const soma = extratos.reduce((a, x) => a + x.valorAplicado, 0);
    const d = dia(sis.data);
    d.sistema += sis.valor_assinado;
    d.paredosN1.push({
      sis, extratos,
      grupoId: vs.find((v) => v.grupo_id)?.grupo_id ?? null,
      soma,
      diferenca: soma - Math.abs(sis.valor_assinado),
    });
  });

  for (const extrato of data.ofx_completo) {
    const d = dia(extrato.data);
    d.banco += extrato.valor;
    /* Já contado no banco do dia, mas desenhado dentro do bloco N:1 — não vira linha aqui. */
    if (consumidos.has(extrato.extrato_id)) continue;
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
    /* ⚠ FORA DA SOMA, E É O `continue` QUE FAZ O CABEÇALHO FECHAR. Medido em agosto/2026 no
       Bradesco do Agnaldo: as 17 transferências da Invest Fácil valem 1.206.567,85 de
       entrada e 1.022.515,14 de saída — exatamente a distância entre o sistema e o banco nos
       dois lados. Somá-las é comparar o que o banco tem com o que ele nunca exportou. */
    if (internos.has(s.lancamento_id)) { d.internas.push(s); continue; }
    d.lancsSemPar.push(s);
    d.sistema += s.valor_assinado;
  }

  const lista = [...dias.values()].sort((a, b) => (a.data ?? '') < (b.data ?? '') ? -1 : (a.data ?? '') > (b.data ?? '') ? 1 : 0);
  for (const d of lista) {
    d.pareados = ordenar(d.pareados, (p) => p.extrato.valor);
    d.paredosN1 = ordenar(d.paredosN1, (p) => p.sis.valor_assinado);
    d.extratosSemPar = ordenar(d.extratosSemPar, (e) => e.valor);
    d.lancsSemPar = ordenar(d.lancsSemPar, (s) => s.valor_assinado);
    d.internas = ordenar(d.internas, (s) => s.valor_assinado);
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

/**
 * ⚠ A COLUNA DO MEIO RESPONDE UMA PERGUNTA SÓ — PR-ESPELHO-07 item A. Ela mostrava o ÍCONE
 * DE ORIGEM nos pareados (B / ↺ / ✓) e o estado nos sem-par (○ / !), então o mesmo lugar
 * respondia "de onde veio" numa linha e "está casado?" na linha de baixo. Quem varre a
 * coluna de cima a baixo procurando o que falta tinha de saber, símbolo a símbolo, qual das
 * duas perguntas aquele estava respondendo. Agora o meio diz UMA coisa — casou, não casou,
 * ou é filha — e a origem desce para um marcador ao lado da descrição.
 */
const SINAL_CASADO = { simbolo: '\u2713', cor: 'text-success', titulo: 'extrato e lançamento casados' };

/**
 * A origem, discreta, depois da descrição do sistema.
 *
 * ⚠ 10px E MUTED MESMO PARA `!` E `↺`: a cor saiu junto com a coluna. O que colore agora é o
 * ESTADO, no meio; a origem é anotação, e anotação que grita disputa a atenção com o número.
 * O `title` é o mesmo `significado` do classificador — a régua continua sendo
 * `iconeOrigemLancamento`, e este arquivo não reescreve nenhuma parte dela.
 */
function MarcadorOrigem({ tipo }: { tipo: string | null }) {
  const icone = iconeDoLancamento(tipo);
  if (!icone) return null;
  return (
    <span className="ml-1.5 text-[10px] text-muted-foreground" title={icone.significado}>{icone.simbolo}</span>
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
/* ⚠ A DATA NUNCA ENCOLHE. Com `text-ellipsis` numa coluna de 36px, "16/07" virava "16/…" —
   e data cortada não é data. 44px cabe o formato inteiro, e a célula não corta. */
const CEL_DATA = 'px-[5px] whitespace-nowrap text-[10px] text-muted-foreground';
const H21 = 'h-[21px]';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/** O aplicado é magnitude; quem dá o sinal é o extrato que a filha explica. */
const assinado = (valorExtrato: number, aplicado: number) => Math.sign(valorExtrato || 1) * aplicado;

/** Na filha, descrição e fornecedor saem no mesmo tom — ela não repete competência nem origem. */
function textoFilha(s: EspSis | undefined) {
  if (!s) return '—';
  return <>{s.descricao ?? '—'}{' · '}{s.fornecedor || '—'}</>;
}

/**
 * ⚠ CADA LINHA É UM COMPONENTE PORQUE O @dnd-kit É HOOK. `useDroppable`/`useDraggable` não
 * podem ser chamados dentro de um `.map()` — a regra dos hooks proíbe, e o React quebraria ao
 * mudar a contagem de linhas entre renders. Extrair não foi estética: era a única forma.
 */
function LinhaExtratoSemPar({ e, marcado, onMarcar, onCriar, onIgnorar }: {
  e: EspOfx; marcado: boolean; onMarcar: () => void; onCriar: () => void; onIgnorar: () => void;
}) {
  /* ⚠ A MESMA LINHA É ALVO E ORIGEM. Alvo quando um lançamento vem por cima (1:N); origem
     quando ELA é arrastada sobre um lançamento (N:1). São dois nós do @dnd-kit no mesmo
     `<tr>`: o droppable envolve a linha, o draggable mora só na alça. */
  const { isOver, setNodeRef } = useDroppable({ id: `ext:${e.extrato_id}` });
  return (
    <tr ref={setNodeRef} className={cn(H21, 'border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <td className="text-center">
        <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
          onChange={onMarcar} aria-label="Marcar movimento do banco" />
      </td>
      <td className={CEL_DATA}>{fmtData(e.data)}</td>
      <td className={cn(CEL, 'text-[10px] font-medium')} title={e.historico ?? ''}>{e.historico ?? '—'}</td>
      <td className={cn(CEL, 'text-right text-[11px] font-medium tabular-nums', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
      <td className={cn(MEIO, 'text-[12px] text-muted-foreground')} title="sem correspondência">○</td>
      <td />
      <td />
      <td className={cn(CEL, 'text-[10px] italic text-muted-foreground')}>— nenhum lançamento vinculado</td>
      {/* ⚠ "criar" ABRE O MODAL COM A LISTA VAZIA, e não um formulário à parte: o caminho é o
          mesmo do "criar pela diferença", só que a diferença é o valor inteiro. Um segundo
          caminho para criar o mesmo lançamento seria a segunda forma. */}
      <td className={cn(CEL, 'text-right whitespace-nowrap')}>
        <Acao onClick={onCriar}>criar</Acao>
        {/* ⚠ "IGNORAR" É A ÚLTIMA FUNÇÃO QUE SÓ EXISTIA NA AUDITORIA BANCÁRIA. O operador via
            aqui a linha que o banco trouxe e não tinha o que fazer com ela; para desconsiderá-la
            precisava sair do espelho, achar a mesma linha noutra tela e voltar. O fluxo inteiro
            — listar derivados, decidir um a um, exigir motivo — já é o `DecisaoDerivadosDialog`:
            esta tela o INSTANCIA, não o reescreve. */}
        <Acao className="ml-1.5" onClick={onIgnorar}>ignorar</Acao>
        <Alca id={`dragExt:${e.extrato_id}`} />
      </td>
    </tr>
  );
}

function LinhaLancSemPar({ s, mesDoRecorte, marcado, onMarcar, onAbrir }: {
  s: EspSis; mesDoRecorte: string; marcado: boolean; onMarcar: () => void; onAbrir?: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `lan:${s.lancamento_id}` });
  return (
    <tr ref={setNodeRef} className={cn(H21, 'border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <td />
      <td className={CEL_DATA}>{fmtData(s.data)}</td>
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
        <Alca id={`dragLan:${s.lancamento_id}`} />
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
  /* Só do sentido N:1 (`fn_espelho_casar_n1`). */
  minimo_dois_extratos: 'Marque ao menos dois movimentos do banco.',
  contas_diferentes: 'Os movimentos são de contas diferentes.',
  extrato_repetido: 'O mesmo movimento foi marcado duas vezes.',
};

interface EstadoSelecao { extratos: Set<string>; lancamentos: Set<string>; }

/** Um extrato desconsiderado — o que a lista do rodapé precisa para oferecer o "reverter". */
interface ExtratoIgnorado { extrato_id: string; data: string | null; historico: string | null; valor: number; motivo: string | null; }

/** O envelope que `fn_espelho_casar` / `fn_espelho_casar_n1` devolvem pelo PostgREST. */
interface RespostaCasar {
  data: { ok?: boolean; motivo?: string } | null;
  error: { message: string } | null;
}

/** Quanto se espera por uma conciliação antes de devolver o botão ao operador. */
const PRAZO_CONCILIAR_MS = 20_000;

/**
 * A promessa, com prazo — PR-ESPELHO-06 item A.
 *
 * ⚠ NÃO CANCELA A GRAVAÇÃO, e não pode fingir que cancela: a requisição segue no servidor e
 * pode terminar bem. O que o prazo devolve é o CONTROLE — o botão volta e o operador lê que
 * o banco não respondeu, em vez de olhar "Conciliando…" sem fim. Por isso a mensagem manda
 * conferir antes de repetir: repetir uma conciliação que talvez tenha gravado é o único
 * jeito de piorar este caso.
 */
function comPrazo<T>(promessa: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promessa),
    new Promise<T>((_, rejeitar) => setTimeout(
      () => rejeitar(new Error(
        'O banco não respondeu a tempo. Confira se a conciliação foi feita antes de tentar de novo.')),
      ms)),
  ]);
}

function AbaConferencia({ data, anoMes, nomeConta, clienteId, contaId, internos, onAbrir, onMudou }: {
  data: EspelhadosReais; anoMes: string; nomeConta?: string; clienteId: string; contaId: string | null;
  internos: ReadonlySet<string>; onAbrir?: (id: string) => void; onMudou: () => void;
}) {
  const dias = useMemo(() => montarMesa(data, internos), [data, internos]);
  const [sel, setSel] = useState<EstadoSelecao>({ extratos: new Set(), lancamentos: new Set() });
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  /* ⚠ O IGNORADO NÃO ESTÁ NO ESPELHO, e é por isso que precisa de leitura própria: a RPC
     filtra `ignorado_em IS NULL` (é o que faz a linha sumir ao ignorar). Sem esta consulta,
     desconsiderar seria uma porta sem volta dentro desta tela — e uma decisão que não se
     desfaz onde foi tomada é uma decisão que o operador evita tomar. */
  const [verIgnorados, setVerIgnorados] = useState(false);
  const [ignorarId, setIgnorarId] = useState<string | null>(null);
  const [revertendoId, setRevertendoId] = useState<string | null>(null);
  const { data: ignorados, refetch: refetchIgnorados } = useQuery({
    queryKey: ['espelho-ignorados', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<ExtratoIgnorado[]> => {
      const [ano, mes] = anoMes.split('-');
      const d1 = `${anoMes}-01`;
      const d2 = new Date(Number(ano), Number(mes), 0).toISOString().slice(0, 10);
      const { data: linhas, error } = await supabase
        .from('extrato_bancario_v2')
        .select('id, data_movimento, descricao, valor, ignorado_motivo, ignorado_em')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId ?? '')
        .gte('data_movimento', d1)
        .lte('data_movimento', d2)
        .is('cancelado_em', null)
        .not('ignorado_em', 'is', null)
        .order('data_movimento');
      if (error) throw error;
      return (linhas ?? []).map((l) => ({
        extrato_id: l.id, data: l.data_movimento, historico: l.descricao,
        valor: Number(l.valor ?? 0), motivo: l.ignorado_motivo ?? null,
      }));
    },
  });

  const reverterIgnorado = async (extratoId: string) => {
    if (revertendoId) return;
    setRevertendoId(extratoId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_reverter_desconsideracao_extrato', { p_extrato_id: extratoId });
      if (error) throw error;
      toast.success('Desconsideração revertida.');
      void refetchIgnorados();
      onMudou();
    } catch (e) {
      /* PostgrestError é objeto, não Error: a mensagem real do PostgreSQL vem em `.message`. */
      toast.error((e as { message?: string } | null)?.message || 'Falha ao reverter.');
    } finally {
      setRevertendoId(null);
    }
  };

  const [casar, setCasar] = useState<{ extrato: ExtratoAlvo; iniciais: LevadoInicial[] } | null>(null);
  const [arrastando, setArrastando] = useState<EspSis | null>(null);
  const [arrastandoExt, setArrastandoExt] = useState<EspOfx | null>(null);
  const [casarN1, setCasarN1] = useState<{ sis: EspSis; extratos: EspOfx[] } | null>(null);
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
  /* ⚠ DOIS SENTIDOS, UMA BARRA. 1 extrato : N lançamentos vai pela `fn_espelho_casar`;
     N extratos : 1 lançamento pela `fn_espelho_casar_n1`. O que decide é a contagem dos dois
     lados — não há botão para escolher, porque a marcação já disse o que se quer. */
  const sentido: 'um_n' | 'n_um' | null =
    sel.extratos.size === 1 && sel.lancamentos.size >= 1 ? 'um_n'
    : sel.extratos.size >= 2 && sel.lancamentos.size === 1 ? 'n_um'
    : null;
  const podeConciliar = !!sentido && Math.abs(difSel) <= 0.01;
  const motivoBloqueio = sentido ? (Math.abs(difSel) > 0.01 ? 'os valores não batem' : '')
    : sel.extratos.size === 0 ? 'marque ao menos um extrato'
    : sel.lancamentos.size === 0 ? 'marque ao menos um lançamento'
    : 'marque 1 extrato para N lançamentos, ou N extratos para 1 lançamento';

  /**
   * Conciliar pela barra — os dois sentidos.
   *
   * ⚠ O MÉTODO NÃO SE EXTRAI PARA UMA VARIÁVEL. Esta função escrevia
   * `const rpc = (supabase as any).rpc; rpc('fn_espelho_casar_n1', …)`, e o método arrancado
   * do objeto perde o `this`: o corpo do `rpc` lê `this.rest`/`this.url` para montar a URL e
   * lança `TypeError: Cannot read properties of undefined` SÍNCRONO, antes de qualquer
   * rede. Era o defeito inteiro do 20/07 — a chamada nunca saiu (zero vínculo, zero audit,
   * nenhuma requisição), e como o `throw` acontecia antes do `setGravando(false)` e não
   * havia `try`, o botão ficava preso em "Conciliando…" para sempre. Medido: o mesmo
   * cliente chamado como MÉTODO devolve o builder; extraído para variável, lança.
   * ⚠ VALIA PARA OS DOIS SENTIDOS, não só o N:1. O 1:N parecia funcionar porque o caminho
   * exercitado era o modal "Casar com o banco", que sempre chamou como método — os 105
   * outros pontos do repo escrevem `(supabase as any).rpc(...)`, e este era o único que não.
   *
   * ⚠ E O BOTÃO VOLTA SEMPRE. `finally` devolve o estado aconteça o que acontecer, e o
   * prazo impede o outro jeito de ficar preso: uma resposta que nunca chega. Um botão que
   * não volta é pior que um erro — o operador não sabe se gravou.
   */
  const conciliar = async () => {
    if (!sentido) return;
    setGravando(true); setErro(null);
    try {
      const chamada = sentido === 'um_n'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        ? (supabase as any).rpc('fn_espelho_casar', {
            p_extrato_id: [...sel.extratos][0],
            p_itens: [...sel.lancamentos].map((id) => ({ lancamento_id: id, valor: Math.abs(sisIndex.get(id)?.valor_assinado ?? 0) })),
            p_simular: false, p_motivo: 'casado_no_espelho',
          })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        : (supabase as any).rpc('fn_espelho_casar_n1', {
            p_lancamento_id: [...sel.lancamentos][0],
            p_extratos: [...sel.extratos],
            p_simular: false, p_motivo: 'casado_no_espelho_n1',
          });
      /* O argumento de tipo é explícito porque o `.rpc` do idioma devolve `any`, e sem ele o
         `T` do `comPrazo` cairia em `unknown` — o envelope da resposta é o mesmo dos outros
         chamadores desta RPC. Sem cast: é declaração, não conversão. */
      const { data: r, error } = await comPrazo<RespostaCasar>(chamada, PRAZO_CONCILIAR_MS);
      if (error) { setErro(error.message); return; }
      const res = r ?? {};
      if (res.ok === false) { setErro(MOTIVO_CASAR_LABEL[res.motivo ?? ''] ?? res.motivo ?? 'Não foi possível conciliar.'); return; }
      limpar();
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível conciliar.');
    } finally {
      setGravando(false);
    }
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
    setArrastandoExt(null);
    const alvo = String(ev.over?.id ?? '');
    const origem = String(ev.active?.id ?? '');

    /* Lançamento sobre extrato — 1 extrato : N lançamentos. */
    if (alvo.startsWith('ext:') && origem.startsWith('dragLan:')) {
      const extrato = extratoIndex.get(alvo.slice(4));
      if (!extrato) return;
      const ids = new Set<string>([origem.slice(8), ...sel.lancamentos]);
      const iniciais = [...ids].map((id) => sisIndex.get(id)).filter((x): x is EspSis => !!x).map(comoLevado);
      if (iniciais.length === 0) return;
      setCasar({
        extrato: { extrato_id: extrato.extrato_id, data: extrato.data, historico: extrato.historico, valor: extrato.valor },
        iniciais,
      });
      return;
    }

    /* ⚠ EXTRATO SOBRE LANÇAMENTO — o sentido inverso. Aqui o modal não é o mesmo: o que se
       edita no 1:N é o valor do lançamento, e do lado do banco não há o que editar. Por isso
       este ramo abre o modal N:1, e não o de sempre com os papéis trocados. */
    if (alvo.startsWith('lan:') && origem.startsWith('dragExt:')) {
      const sis = sisIndex.get(alvo.slice(4));
      if (!sis) return;
      const ids = new Set<string>([origem.slice(8), ...sel.extratos]);
      const extratos = [...ids].map((id) => extratoIndex.get(id)).filter((x): x is EspOfx => !!x);
      if (extratos.length === 0) return;
      setCasarN1({ sis, extratos });
    }
  };

  /* O botão da barra abre o modal do SENTIDO que a marcação já declarou. */
  const abrirCasarDaBarra = () => {
    if (sentido === 'n_um') {
      const sis = sisIndex.get([...sel.lancamentos][0]);
      const extratos = [...sel.extratos].map((id) => extratoIndex.get(id)).filter((x): x is EspOfx => !!x);
      if (sis && extratos.length) setCasarN1({ sis, extratos });
      return;
    }
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
      onDragStart={(ev) => {
        const id = String(ev.active.id);
        if (id.startsWith('dragLan:')) setArrastando(sisIndex.get(id.slice(8)) ?? null);
        else if (id.startsWith('dragExt:')) setArrastandoExt(extratoIndex.get(id.slice(8)) ?? null);
      }}>
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ⚠ A MARGEM É DO CONTAINER, NÃO DA TABELA. As bordas e a divisória continuam de fora a
          fora DA TABELA; é ela que se afasta da borda do modal, e não as linhas que encurtam. */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t px-3.5">
        {/* ⚠ A RÉGUA É O PADRÃO DA TABELA, não de cada célula. Sem isto, as células que não
            declaram tamanho — as dos checkboxes, a das ações, a do lançamento — herdam os
            16px/24px do documento e esticam a linha de 21px para 26,5px, mesmo com `h-[21px]`
            no `<tr>`: altura em tabela é mínimo, não teto. Medido em 09/09/2026. */}
        <table className="w-full border-collapse text-[11px] leading-[1.3]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 18 }} /><col style={{ width: 44 }} /><col />
            <col style={{ width: 92 }} /><col style={{ width: 26 }} />
            <col style={{ width: 18 }} /><col style={{ width: 92 }} /><col />
            <col style={{ width: 104 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary h-[22px] text-primary-foreground">
              <th />
              <th colSpan={3} className="px-[5px] text-left text-[10px] font-medium">BANCO (OFX)</th>
              {/* A divisória atravessa o cabeçalho também — em branco, porque o fundo é azul. */}
              <th className="border-l border-r border-primary-foreground/40 px-0" />
              <th colSpan={3} className="px-[5px] text-left text-[10px] font-medium">SISTEMA</th>
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
                        <td className={CEL_DATA}>{fmtData(p.extrato.data)}</td>
                        <td className={cn(CEL, 'text-[10px] font-medium')} title={p.extrato.historico ?? ''}>{p.extrato.historico ?? '—'}</td>
                        <td className={cn(CEL, 'text-right text-[11px] font-medium tabular-nums', corVal(p.extrato.valor))}>{fmtBRL(p.extrato.valor)}</td>
                        <td className={cn(MEIO, 'text-[12px] font-semibold', SINAL_CASADO.cor)} title={SINAL_CASADO.titulo}>{SINAL_CASADO.simbolo}</td>
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
                          <MarcadorOrigem tipo={p.tipoVencedor} />
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

                      {/* ⚠ A FILHA É DETALHE DE COMPOSIÇÃO, e a tipografia diz isso: 10px, peso
                          400 em tudo — inclusive no valor —, descrição em muted e borda mais
                          fraca que a das linhas. Ela explica a mãe; não compete com ela. */}
                      {agrupado && p.filhas.map((f) => (
                        <tr key={f.lancamento_id} className="h-[15px] bg-muted/40 border-b border-border/30">
                          <td /><td /><td /><td />
                          <td className={cn(MEIO, 'text-[11px] font-normal text-muted-foreground')}>↳</td>
                          <td />
                          <td className={cn(CEL, 'text-left text-[10px] font-normal tabular-nums', corVal(assinado(p.extrato.valor, f.valor_aplicado)))}>
                            {fmtBRL(assinado(p.extrato.valor, f.valor_aplicado))}
                          </td>
                          <td className={cn(CEL, 'text-[10px] font-normal text-muted-foreground')}>{textoFilha(f.sis)}</td>
                          <td className={cn(CEL, 'text-right')}>{onAbrir && <Acao onClick={() => onAbrir(f.lancamento_id)}>abrir</Acao>}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* ⚠ N:1 — a mãe do lado do SISTEMA. Ver `ParedoN1`. */}
                {d.paredosN1.map((g) => {
                  const temDif = Math.abs(g.diferenca) > 0.01;
                  const somaAssinada = Math.sign(g.sis.valor_assinado || 1) * g.soma;
                  return (
                    <React.Fragment key={g.sis.lancamento_id}>
                      <tr className={cn(H21, 'border-b border-border/50 bg-muted/20')}>
                        <td /><td /><td />
                        <td className={cn(CEL, 'text-right text-[11px] font-medium tabular-nums', temDif ? 'text-amber-600' : corVal(somaAssinada))}
                            title={temDif ? `os extratos somam ${fmtBRL(Math.abs(g.diferenca))} ${g.diferenca > 0 ? 'a mais' : 'a menos'} que o lançamento` : undefined}>
                          {fmtBRL(somaAssinada)}
                        </td>
                        <td className={cn(MEIO, 'text-[12px] font-semibold', SINAL_CASADO.cor)} title={SINAL_CASADO.titulo}>{SINAL_CASADO.simbolo}</td>
                        <td />
                        <td className={cn(CEL, 'text-left text-[11px] font-medium tabular-nums', corVal(g.sis.valor_assinado))}>{fmtBRL(g.sis.valor_assinado)}</td>
                        <td className={CEL}>
                          {textoLancamento(g.sis, mesDoRecorte)}
                          <span className="text-[10px] text-muted-foreground">{' · '}{g.extratos.length} extratos</span>
                          <MarcadorOrigem tipo="agrupamento_manual" />
                        </td>
                        <td className={cn(CEL, 'text-right whitespace-nowrap')}>
                          {onAbrir && <Acao onClick={() => onAbrir(g.sis.lancamento_id)}>abrir</Acao>}
                          {g.grupoId && (
                            <Acao className="ml-1.5" onClick={async () => {
                              const r = await desfazerGrupo(g.grupoId!, 'desfeito_no_espelho');
                              if (r.ok) onMudou(); else setErro(r.erro ?? 'Não foi possível desconciliar.');
                            }}>desconciliar grupo</Acao>
                          )}
                        </td>
                      </tr>
                      {/* ⚠ FILHAS DO LADO DO BANCO e `↰` no meio: a seta aponta para o OFX porque
                          é ele que está sendo decomposto. Mesma régua das filhas do 1:N. */}
                      {g.extratos.map((x) => (
                        <tr key={x.extrato.extrato_id} className="h-[15px] bg-muted/40 border-b border-border/30">
                          <td />
                          <td className={CEL_DATA}>{fmtData(x.extrato.data)}</td>
                          <td className={cn(CEL, 'text-[10px] font-normal text-muted-foreground')} title={x.extrato.historico ?? ''}>{x.extrato.historico ?? '—'}</td>
                          <td className={cn(CEL, 'text-right text-[10px] font-normal tabular-nums', corVal(x.extrato.valor))}>{fmtBRL(x.extrato.valor)}</td>
                          <td className={cn(MEIO, 'text-[11px] font-normal text-muted-foreground')}>↰</td>
                          <td /><td /><td /><td />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {d.extratosSemPar.map((e) => (
                  <LinhaExtratoSemPar key={e.extrato_id} e={e}
                    marcado={marcado('extratos', e.extrato_id)} onMarcar={() => alterna('extratos', e.extrato_id)}
                    onCriar={() => setCasar({
                      extrato: { extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor },
                      iniciais: [],
                    })}
                    onIgnorar={() => setIgnorarId(e.extrato_id)} />
                ))}

                {/* ⚠ NO FIM DO DIA, e depois do sem par: a ordem é a da atenção. O que falta
                    vem antes; o que está explicado e fora do extrato vem depois. */}
                {d.internas.map((si) => (
                  <tr key={si.lancamento_id} className={cn(H21, 'border-b border-border/50 bg-muted/20')}>
                    <td />
                    <td className={CEL_DATA}>{fmtData(si.data)}</td>
                    <td className={cn(CEL, 'text-[10px] italic text-muted-foreground')}>— o banco não exporta este movimento</td>
                    <td />
                    <td className={cn(MEIO, 'text-[12px] text-muted-foreground')} title="transferência com conta interna">⇄</td>
                    <td />
                    <td className={cn(CEL, 'text-left text-[11px] font-medium tabular-nums text-muted-foreground')}>{fmtBRL(si.valor_assinado)}</td>
                    <td className={CEL}>
                      <span className="text-[11px] font-medium text-muted-foreground">{si.descricao ?? '—'}</span>
                      <span className="text-[10px] text-muted-foreground">{' · '}transferência interna · fora do extrato</span>
                    </td>
                    <td className={cn(CEL, 'text-right whitespace-nowrap')}>
                      {onAbrir && <Acao onClick={() => onAbrir(si.lancamento_id)}>abrir</Acao>}
                    </td>
                  </tr>
                ))}

                {d.lancsSemPar.map((sl) => (
                  <LinhaLancSemPar key={sl.lancamento_id} s={sl} mesDoRecorte={mesDoRecorte}
                    marcado={marcado('lancamentos', sl.lancamento_id)}
                    onMarcar={() => alterna('lancamentos', sl.lancamento_id)} onAbrir={onAbrir} />
                ))}

                <tr className="h-[22px] bg-primary/10 border-t border-b border-border">
                  <td colSpan={3} className={cn(CEL, 'text-[11px] font-semibold text-primary')}>fechamento {fmtData(d.data)}</td>
                  <td className={cn(CEL, 'text-right text-[11px] font-semibold tabular-nums text-primary')}>{fmtBRL(d.banco)}</td>
                  <td className={MEIO} />
                  <td />
                  {/* ⚠ NO FECHAMENTO O AZUL VENCE O VERMELHO/VERDE: a linha inteira é subtotal, e o
                      sinal já está no número. Colorir por sinal aqui faria o subtotal competir
                      visualmente com os movimentos que ele resume. */}
                  <td className={cn(CEL, 'text-left text-[11px] font-semibold tabular-nums text-primary')}>{fmtBRL(d.sistema)}</td>
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

      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-1 text-[10px] text-muted-foreground">
        {/* ⚠ A LEGENDA SEGUE A COLUNA: primeiro os quatro sinais do meio, que são um
            vocabulário fechado, e depois a origem, que é outro. Misturá-los numa fila só era
            o que fazia o operador procurar `B` na coluna do estado. */}
        <span><span className={cn('font-semibold', SINAL_CASADO.cor)}>{SINAL_CASADO.simbolo}</span> casados</span>
        <span><span className="text-muted-foreground">○</span> extrato sem par</span>
        <span><span className="text-destructive font-semibold">!</span> lançamento sem par</span>
        <span>↳ dentro de um agrupamento</span>
        <span><span className="text-muted-foreground">⇄</span> transferência interna</span>
        <span className="opacity-60">|</span>
        <span>origem:</span>
        {LEGENDA_ICONES.map((ic) => (
          <span key={ic.simbolo}><span className="text-muted-foreground">{ic.simbolo}</span> {ic.curto}</span>
        ))}
        {!!ignorados?.length && (
          <span className="ml-auto">
            {ignorados.length} ignorado{ignorados.length === 1 ? '' : 's'} neste mês{' · '}
            <Acao onClick={() => setVerIgnorados((v) => !v)}>{verIgnorados ? 'ocultar' : 'ver'}</Acao>
          </span>
        )}
      </div>

      {/* ⚠ A LISTA FICA FORA DA MESA, e não como mais um bloco de dia: o ignorado não está no
          fechamento — ele saiu de lá, é isso que ignorar significa. Mostrá-lo entre os dias
          convidaria a somá-lo de novo com os olhos. */}
      {verIgnorados && !!ignorados?.length && (
        <div className="shrink-0 max-h-[132px] overflow-y-auto border-t bg-muted/20 px-3.5 py-1">
          <table className="w-full table-fixed">
            <tbody>
              {ignorados.map((ig) => (
                <tr key={ig.extrato_id} className="h-[19px] border-b border-border/30">
                  <td className={cn(CEL_DATA, 'w-[44px]')}>{fmtData(ig.data)}</td>
                  <td className={cn(CEL, 'text-[10px]')} title={ig.historico ?? ''}>{ig.historico ?? '—'}</td>
                  <td className={cn(CEL, 'w-[96px] text-right text-[10px] tabular-nums', corVal(ig.valor))}>{fmtBRL(ig.valor)}</td>
                  <td className={cn(CEL, 'w-[38%] text-[10px] italic text-muted-foreground')} title={ig.motivo ?? ''}>
                    {ig.motivo || '—'}
                  </td>
                  <td className={cn(CEL, 'w-[62px] text-right')}>
                    <Acao onClick={() => void reverterIgnorado(ig.extrato_id)}>
                      {revertendoId === ig.extrato_id ? 'revertendo…' : 'reverter'}
                    </Acao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ⚠ INSTANCIADO, NÃO REESCRITO — o mesmo diálogo da Auditoria Bancária, com o mesmo
          motivo obrigatório e a mesma decisão por derivado. A "simulação" é a primeira
          chamada da própria RPC com motivo vazio: o banco recusa e devolve os derivados. */}
      <DecisaoDerivadosDialog
        extratoId={ignorarId}
        aberto={!!ignorarId}
        modo="ignorar"
        onClose={() => setIgnorarId(null)}
        onConcluido={() => { setIgnorarId(null); void refetchIgnorados(); onMudou(); }}
      />

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
              {sentido === 'n_um' && <span className="ml-2 opacity-80">N extratos → 1 lançamento</span>}
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
              <button type="button" disabled={!sentido} onClick={abrirCasarDaBarra}
                title={sentido ? undefined : motivoBloqueio}
                className={cn('rounded px-2 py-0.5 text-[11px]',
                  sentido
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
        {(arrastando || arrastandoExt) && (
          <div className="rounded border bg-card px-2 py-0.5 text-[10px] shadow">
            {arrastando ? (arrastando.descricao ?? '—') : (arrastandoExt?.historico ?? '—')}
            <span className={cn('ml-2 font-medium tabular-nums',
              corVal(arrastando ? arrastando.valor_assinado : (arrastandoExt?.valor ?? 0)))}>
              {fmtBRL(arrastando ? arrastando.valor_assinado : arrastandoExt?.valor)}
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

      <CasarN1Modal
        open={!!casarN1}
        onClose={() => setCasarN1(null)}
        sis={casarN1?.sis ?? null}
        extratos={(casarN1?.extratos ?? []).map((e) => ({
          extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor,
        }))}
        nomeConta={nomeConta}
        onConciliado={() => { limpar(); onMudou(); }}
      />
    </div>
    </DndContext>
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

  const internas = useEspelhoInternas(clienteId, contaId, anoMes);

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
  /* ⚠ O SISTEMA EXCLUI AS INTERNAS, E É SÓ ISSO QUE FALTAVA — itens B e D. O cabeçalho nunca
     filtrou por origem: os crus de entrada (21.513,03 em agosto) sempre estiveram dentro. O
     que ele somava A MAIS eram as transferências que o banco consolida e não exporta. Medido
     no Bradesco do Agnaldo, agosto/2026: 4.204.804,10 − 1.206.567,85 = 2.998.236,25, o mesmo
     do banco; −4.204.804,10 + 1.022.515,14 = −3.182.288,96, idem. E é o MESMO conjunto do
     fechamento por dia por construção — os dois pulam os mesmos lançamentos. */
  const { entradasBanco, entradasSistema, saidasBanco, saidasSistema, difEntradas, difSaidas } =
    totaisDoEspelho(data, internas.lancamentosInternos);

  const vinculados = new Set((data.vinculos ?? []).map((v) => v.lancamento_id));
  const extratosComVinculo = new Set((data.vinculos ?? []).map((v) => v.extrato_id));
  const semCorrespondencia = data.ofx_completo.filter((o) => !extratosComVinculo.has(o.extrato_id));
  /* ⚠ A INTERNA SAI DO CONTADOR — item D. Ela não tem par porque o banco não exportou o
     movimento, não porque falta conciliar; contá-la aqui é pedir ao operador que procure no
     extrato uma linha que o extrato nunca teve. No Bradesco do Agnaldo em agosto isso são 17
     linhas, e eram 17 das 17 do contador. */
  const noSistemaNaoNoBanco = data.sistema_completo.filter(
    (s) => !vinculados.has(s.lancamento_id) && !internas.lancamentosInternos.has(s.lancamento_id));
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
      {/* ⚠ TETO DE 96px NO CABEÇALHO. Cada pixel aqui é uma linha a menos na mesa, e a mesa é a
          tela. O que cede é espaçamento — a informação fica inteira. */}
      <div className="shrink-0 space-y-0.5 px-3.5 py-1">
        <div className="text-[10px] text-muted-foreground">
          {data.ofx_completo.length} movimento{data.ofx_completo.length === 1 ? '' : 's'} no extrato ·{' '}
          {noSistemaNaoNoBanco.length} lançamento{noSistemaNaoNoBanco.length === 1 ? '' : 's'} sem par no banco
        </div>

        {/* ⚠ UMA GRADE, NÃO QUATRO CARTÕES. O bloco que ficava ABAIXO da lista dizia isto mesmo,
            e ninguém rolava até lá para ver — enquanto o topo repetia dois dos quatro números
            noutro arranjo. Uma leitura só, no lugar por onde o olho entra, e a altura que
            sobrou foi inteira para a lista. */}
        <div className="grid grid-cols-[54px_1fr_1fr_1fr_1.4fr] gap-x-3 items-baseline">
          <span />
          <span className="text-[10px] leading-[12px] text-muted-foreground">banco</span>
          <span className="text-[10px] leading-[12px] text-muted-foreground">sistema</span>
          <span className="text-[10px] leading-[12px] text-muted-foreground">diferença</span>
          <span className="text-[10px] leading-[12px] text-muted-foreground">sem par</span>

          <span className="text-[10px] text-muted-foreground">saídas</span>
          <span className="text-[15px] font-medium tabular-nums leading-[16px] text-destructive">{fmtBRL(saidasBanco)}</span>
          <span className="text-[15px] font-medium tabular-nums leading-[16px] text-destructive">{fmtBRL(saidasSistema)}</span>
          <span className={cn('text-[15px] font-medium tabular-nums leading-[16px]',
            Math.abs(difSaidas) <= 0.01 ? 'text-muted-foreground' : 'text-amber-600')}>{fmtBRL(difSaidas)}</span>
          <span className="row-span-2 self-center text-[10px] text-muted-foreground leading-tight">
            {semCorrespondencia.length} extrato{semCorrespondencia.length === 1 ? '' : 's'}
            {' · '}{noSistemaNaoNoBanco.length} lançamento{noSistemaNaoNoBanco.length === 1 ? '' : 's'}
            {noSistemaNaoNoBanco.length > 0 && (
              <><br /><span className="text-destructive">{fmtBRL(totalNaoNoBanco)}</span></>
            )}
          </span>

          <span className="text-[10px] text-muted-foreground">entradas</span>
          <span className="text-[15px] font-medium tabular-nums leading-[16px] text-emerald-600">{fmtBRL(entradasBanco)}</span>
          <span className="text-[15px] font-medium tabular-nums leading-[16px] text-emerald-600">{fmtBRL(entradasSistema)}</span>
          <span className={cn('text-[15px] font-medium tabular-nums leading-[16px]',
            Math.abs(difEntradas) <= 0.01 ? 'text-muted-foreground' : 'text-amber-600')}>{fmtBRL(difEntradas)}</span>
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
          clienteId={clienteId} contaId={contaId} internos={internas.lancamentosInternos}
          onAbrir={onAbrirLancamento} onMudou={() => { void refetch(); }} />
      )}
      {aba === 'ofx' && <AbaOfxReal ofx={data.ofx_completo} inicial={inicial} internas={internas} />}
      {aba === 'sistema' && <AbaSistemaReal sistema={data.sistema_completo} inicial={inicial} onAbrir={onAbrirLancamento} />}
      {aba === 'evolucao' && <AbaEvolucaoReal data={data} internos={internas.lancamentosInternos} />}

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
