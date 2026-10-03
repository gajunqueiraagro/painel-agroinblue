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
import { iconeOrigemLancamento, LEGENDA_ICONES, rotuloOrigem } from '@/v2/lib/origemLancamento';
import { desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  CasarComBancoModal, CasarN1Modal, CasarBlocoModal, fraseDaRecusa,
  type ExtratoAlvo, type LevadoInicial, type RegraBloco,
} from '@/components/financeiro-v2/CasarComBancoModal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DecisaoDerivadosDialog } from '@/components/financeiro-v2/DecisaoDerivadosDialog';
import { useEspelhoInternas, type EspelhoInternas } from '@/hooks/useEspelhoInternas';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import {
  TabelaExtratoDoMes, EspStatusCell, fmtBRL, fmtData, corValReal,
  type EspOfx, type EspStatus,
} from '@/components/conciliacao/TabelaExtratoDoMes';
import { toast } from 'sonner';
import { X, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { sugerirCasamentos, type Sugestao } from '@/lib/conciliacao/sugestoesCasamento';
import { SugestoesCasarModal } from '@/components/financeiro-v2/SugestoesCasarModal';
/* ⚠ A MESA DO DIA MUDOU DE CASA — PR-CONC-CONFERENCIA-FECHAMENTO-DIA: tipos do Espelho, `montarMesa`, `totaisDoEspelho`,
   `sinalDoAplicado` e `ordenar` foram para a lib pura (movidos byte a byte); a tela importa de lá e REEXPORTA, para quem
   já importava daqui (o Extrato da planilha, os testes) não mudar. */
import {
  montarMesa, sinalDoAplicado, ordenar,
  type EspSis, type EspCandidato, type EspelhadosReais, type FilhaConf,
} from '@/lib/conciliacao/mesaDoDia';
import { useResumoMes } from '@/hooks/useResumoConciliacao';
import { fraseDoRetido, saldosDaLinha, TIPO_TRANSFERENCIA_INTERNA, type LinhaResumo, type LinhaSistemaDono } from '@/lib/conciliacao/resumoDoDono';
export {
  montarMesa, totaisDoEspelho, sinalDoAplicado,
  type EspSis, type EspVinculo, type EspelhadosReais, type FilhaConf, type Pareado, type ParedoN1, type DiaConf,
} from '@/lib/conciliacao/mesaDoDia';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ⚠ OS FORMATADORES, O STATUS E O TIPO DA LINHA MUDARAM DE CASA — PR-IMPORTAR-VER-EXTRATO-01.
   Eles foram com a tabela do extrato para `TabelaExtratoDoMes`, e o Espelho passa a
   importá-los de lá. A direção é única de propósito: a peça importando daqui fecharia um
   ciclo de import, que o `npx madge --circular` acusa. Nada mudou no que eles fazem. */




/**
 * O status de exibição da linha do sistema — o do DONO (`status_exibicao`). O parcial diz quanto falta.
 * ⚠ A FRASE INTEIRA vai no `title`; a coluna tem largura fixa medida no pior caso ("parcial · falta R$ 9.999.999,99").
 */
function StatusLinhaSistema({ l }: { l: LinhaSistemaDono }) {
  /* A perna da transferência mãe↔interna (PR-CONC-INTERNA-SEPARADA-01b, D6): o ⇄ da mesa; a legenda inteira no `title`
     (a coluna tem 154px e "transferência interna · fora do extrato" pede mais). */
  if (l.tipo === TIPO_TRANSFERENCIA_INTERNA) {
    return (
      <span className="text-muted-foreground text-[10px] whitespace-nowrap" data-testid="sistema-transferencia-interna"
        title="transferência interna · fora do extrato: conta só no saldo próprio desta conta">
        ⇄ interna · fora do extrato
      </span>
    );
  }
  if (l.status_exibicao === 'parcial') {
    const texto = `parcial · falta ${l.falta != null ? formatarFalta(l.falta) : '—'}`;
    return <span className="text-amber-700 text-[10px] whitespace-nowrap" title={`programado que o extrato não quitou: ${texto}`}>{texto}</span>;
  }
  if (l.status_exibicao === 'conciliado') return <EspStatusCell status="conciliado" />;
  return <span className="text-muted-foreground text-[10px] whitespace-nowrap" title="realizado sem par no extrato">realizado</span>;
}
const formatarFalta = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Cor de uma diferença do dono: zero (ou ausente) neutro, negativo vermelho, positivo verde (D11). */
function corDaDiferenca(v: number | null | undefined) {
  if (v == null || saldoConfere(v)) return 'text-muted-foreground';
  return v < 0 ? 'text-destructive' : 'text-emerald-600';
}

/**
 * A ABA SISTEMA DESENHA A LISTA DO DONO — PR-CONC-SALDO-UMA-REGUA-02 (D7).
 *
 * ⚠ ERA O `sistema_completo` A VALOR CHEIO com o saldo corrido somado aqui: o Emerson (NJ Sicredi Lavoura, set/26)
 *   terminava em 158.533,89 — o programado parcial de −2.561,60 contado inteiro — enquanto a Conferência confere.
 *   Agora as linhas são `linhas_sistema` de `fn_conciliacao_resumo_mes` (a régua do caixa: o vínculo na data do extrato,
 *   o parcial pelo aplicado), o saldo de cada uma é o `saldo_apos` do dono e o "Saldo final (sistema)" é o `saldo_sistema`.
 *   Nada é somado aqui.
 * ⚠ O SALDO É O DA CONTA — PR-CONC-INTERNA-SEPARADA-01b (D6): o saldo corrido é o `saldo_apos_proprio`, o inicial e o final são
 *   os do `proprio`, e na conta-mãe aparecem as linhas 'transferencia_interna' (aplicações e resgates na interna), que só
 *   existem no sistema. Em conta sem par os três são os de antes. A Conferência dia a dia segue consolidada, sem elas.
 */
function AbaSistemaReal({ linha, onAbrir }: { linha: LinhaResumo | null; onAbrir?: (lancamentoId: string) => void }) {
  if (!linha) {
    return <div className="min-h-0 flex-1 border-t px-3.5 py-6 text-center text-[10px] text-muted-foreground">Carregando o resumo do mês…</div>;
  }
  const linhas = linha.linhas_sistema ?? [];
  const proprio = saldosDaLinha(linha);
  const inicial = proprio.saldo_inicial;
  const final = proprio.saldo_sistema;
  return (
    /* Mesma régua do Extrato acima — a lista é o scrollport, e ele é o modal inteiro. */
    <div className="min-h-0 flex-1 overflow-y-auto border-t px-3.5 text-[10px]" data-testid="aba-sistema">
      {/* ⚠ O MESMO CABEÇALHO DO EXTRATO — PR-CONC-CABECALHO-PADRAO-01: navy do token da casa
          (`bg-primary`), primeira maiúscula, e `z-[3]` que faltava. Sem o z-index o cabeçalho
          dependia da regra implícita de que um elemento posicionado cobre os não-posicionados,
          e essa regra quebra quando alguém põe um badge posicionado numa célula. */}
      {/* ⚠ FORNECEDOR EM COLUNA PRÓPRIA — PR-CONC-CONFERENCIA-MODAL-01-fix1 (pedido do Gabriel, 30/09): a
          Descrição ocupava um terço da linha para "Folha de Pagamento", e o nome de quem recebeu não
          aparecia. As três de texto dividem o que sobra em frações fixas (0,85 · 0,95 · 1,4) — largura que
          não muda com o dado —, truncam com o texto inteiro no `title` e Centro/Subcentro fica com a maior.
          ⚠ A COLUNA STATUS FOI DE 68 PARA 154px (PR-CONC-SALDO-UMA-REGUA-02): o parcial escreve quanto falta. Medido a
          10px com `Range`: o real do Emerson ("parcial · falta R$ 300,00") 113,9px; o pior de sete dígitos
          ("parcial · falta R$ 9.999.999,99") 145,2 + 8 de folga. Os 86px saem das frações de texto.
          ⚠ GRID, COMO AS VIZINHAS: "Extrato (banco)" e "Evolução" também são grids a 10px com `py-0.5`;
          trocar esta por `<table>` daria uma régua diferente ao lado. Data, valor, saldo e status têm
          largura em px e `whitespace-nowrap` — não cortam. */}
      <div className="grid grid-cols-[44px_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1.4fr)_80px_80px_154px] gap-1 font-medium text-primary-foreground border-b py-1 sticky top-0 z-[3] bg-primary">
        <span>Data</span><span>Descrição</span><span>Fornecedor</span><span>Centro/Subcentro</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      {/* ⚠ SALDO INICIAL E FINAL, como no Extrato: as duas pontas que tornam a coluna conferível — as do DONO. */}
      <div className="grid grid-cols-[44px_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1.4fr)_80px_80px_154px] gap-1 py-0.5 bg-muted/40 text-[11px] font-semibold border-b">
        <span className="col-span-4">Saldo inicial (sistema)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(inicial ?? 0))} data-testid="sistema-saldo-inicial">{inicial != null ? fmtBRL(inicial) : '—'}</span>
        <span />
      </div>
      {linhas.map((r, i) => {
        const cs = [r.centro, r.subcentro].filter(Boolean).join(' / ') || '—';
        return (
          <div key={`${i}-${r.extrato_id ?? ''}-${r.lancamento_id ?? ''}`}
               onClick={() => r.lancamento_id && onAbrir?.(r.lancamento_id)}
               data-testid="sistema-linha" data-tipo={r.tipo}
               className="grid grid-cols-[44px_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1.4fr)_80px_80px_154px] gap-1 py-0.5 border-b last:border-b-0 items-center cursor-pointer hover:bg-muted/50">
            <span className="whitespace-nowrap text-muted-foreground">{fmtData(r.data)}</span>
            <span className="truncate" title={r.descricao ?? ''}>{r.descricao ?? '—'}</span>
            <span className="truncate" title={r.fornecedor ?? ''} data-testid="sistema-fornecedor">{r.fornecedor || '—'}</span>
            <span className="truncate text-muted-foreground" title={cs}>{cs}</span>
            <span className={`whitespace-nowrap text-right tabular-nums ${corValReal(r.valor)}`}>{fmtBRL(r.valor)}</span>
            <span className={`whitespace-nowrap text-right tabular-nums ${corValReal(r.saldo_apos_proprio ?? 0)}`} data-testid="sistema-saldo">{r.saldo_apos_proprio != null ? fmtBRL(r.saldo_apos_proprio) : '—'}</span>
            <StatusLinhaSistema l={r} />
          </div>
        );
      })}
      {/* ⚠ CONGELADO NO RODAPÉ (`sticky bottom-0`) e com FUNDO OPACO, o mesmo tratamento do
          Extrato: um total transparente deixa as linhas passarem por baixo do número que se
          está conferindo — a lição já paga naquele arquivo. */}
      <div className="sticky bottom-0 z-[2] grid grid-cols-[44px_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,1.4fr)_80px_80px_154px] gap-1 border-t bg-muted py-0.5 text-[11px] font-semibold">
        <span className="col-span-4">Saldo final (sistema)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(final ?? 0))} data-testid="sistema-saldo-final">{final != null ? fmtBRL(final) : '—'}</span>
        <span />
      </div>
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
export function montarEvolucao(data: EspelhadosReais, internos: ReadonlySet<string>) {
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
        {/* ⚠ O MESMO CABEÇALHO DAS OUTRAS TRÊS — PR-CONC-CABECALHO-02, fechando o que o 01
            deixou de fora. Em `bg-card` + `text-muted-foreground` ele tinha a cor do contexto
            das linhas e sumia no branco. `bg-primary` é o token da casa, o mesmo do
            `CompraModalShell` e da Conferência — nunca um hex, que foi a lição do PR anterior.
            ⚠ E O `z-[3]` QUE FALTAVA: sem ele o cabeçalho dependia da regra implícita de que
            elemento posicionado cobre não-posicionado, e ela quebra no dia em que alguém puser
            um badge posicionado numa célula — e aqui já há um, o "nasceu aqui". */}
        <div className="grid grid-cols-[52px_1fr_1fr_1fr_1fr_1fr] gap-1 font-medium text-primary-foreground border-b py-1 sticky top-0 z-[3] bg-primary">
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
      {/* ⚠ CONGELADO NO RODAPÉ, como o saldo final do Extrato e o do Sistema: é a fronteira
          do que o banco cobre, e rolar trinta dias perdendo-a de vista é justamente perder a
          régua contra a qual se está lendo a coluna.
          ⚠ FUNDO OPACO (`bg-muted`) e `z-[2]`: transparente deixaria as linhas passarem por
          baixo do número — a lição já paga no `TabelaExtratoDoMes`.
          ⚠ "DATA DO EXTRATO", E NÃO "MOVIMENTOS ATÉ": a frase antiga se lia como um recorte
          qualquer; o que ela diz é ATÉ ONDE o extrato do banco alcança. O valor é o mesmo
          `extrato_fim` de sempre — mudou a palavra, não o cálculo. */}
      <div className="sticky bottom-0 z-[2] border-t bg-muted py-1 text-[10px] leading-tight text-muted-foreground">
        Data do extrato: {fmtData(data.saldos.extrato_fim)}
        {' · '}Saldo final oficial (extrato):{' '}
        <span className="tabular-nums font-semibold text-foreground">{fmtBRL(data.saldos.final_oficial)}</span>
      </div>
    </div>
  );
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
    <span className="ml-1.5 text-[9.5px] text-muted-foreground" title={icone.significado}>{icone.simbolo}</span>
  );
}

function Acao({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('text-[9.5px] underline underline-offset-2 text-muted-foreground hover:text-foreground', className)}>
      {children}
    </button>
  );
}

/** Uma ação do menu "⋯" da linha. Sem `onClick`, ela aparece DESABILITADA e o `motivo` diz por quê. */
interface ItemAcao { rotulo: string; onClick?: () => void; motivo?: string }

/**
 * A CÉLULA DE AÇÕES: ALÇA + "⋯" — PR-CONC-CONFERENCIA-MODAL-01-fix1 (decisão do Gabriel, 30/09).
 *
 * ⚠ ERAM LINKS POR EXTENSO ("criar ignorar ⠿", "abrir desconciliar") numa coluna de 142px, e o
 * histórico do OFX cortava ao lado. Agora a coluna tem 46px: a alça de arrasto (a MESMA `Alca`, o
 * mesmo DnD) e o menu "⋯" da casa — o `DropdownMenu` da lista do Financeiro V2, mesmo gatilho
 * (`Button` ghost 20px com `MoreHorizontal`), sem variante. Os ~100px liberados foram para o
 * histórico.
 * ⚠ AS AÇÕES SÃO AS MESMAS, com as mesmas funções de antes: só mudou onde o clique mora.
 * ⚠ AÇÃO QUE NÃO SE APLICA APARECE DESABILITADA, com o motivo escrito embaixo — nunca some sem
 * explicar (regra da casa: botão desabilitado diz por quê; o `title` não aparece em item
 * desabilitado do Radix, que corta os eventos de ponteiro, então o motivo vai no texto).
 * ⚠ NÃO É FIXO: o "⋯" é a última coluna normal (regra soberana de 30/09). O menu abre num portal
 * por cima do modal, e não é cortado pelo scroller da mesa.
 */
function CelAcoes({ itens, alcaId }: { itens: ItemAcao[]; alcaId?: string }) {
  return (
    <td className="px-[3px] text-right whitespace-nowrap" data-testid="acoes-da-linha">
      <span className="inline-flex items-center justify-end gap-0.5 align-middle">
        {alcaId && <Alca id={alcaId} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* O gatilho da lista do Financeiro V2, a 16px em vez de 20: numa linha de 18px o de 20 esticaria a linha. */}
            <Button variant="ghost" size="icon" className="h-4 w-4 rounded-sm" title="Ações" aria-label="Ações da linha">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[150px]">
            {itens.map((it) => (
              <DropdownMenuItem key={it.rotulo}  disabled={!it.onClick}
                onClick={it.onClick}>
                <span className="flex flex-col">
                  <span>{it.rotulo}</span>
                  {!it.onClick && it.motivo && <span className="text-[10px] text-muted-foreground">{it.motivo}</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </td>
  );
}

const SEM_ABRIR = 'abrir o lançamento não está disponível nesta tela';

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
      className="inline-block cursor-grab select-none align-middle text-[9.5px] leading-none text-muted-foreground active:cursor-grabbing"
      title="Arraste sobre um movimento do banco para casar" aria-label="Arrastar lançamento">
      ⠿
    </span>
  );
}

/** A borda que separa os dois lados. Mesma célula em toda linha — é o que a faz contínua.
 *  ⚠ À DIREITA, 2px NO NAVY (PR-CONC-CONFERENCIA-MODAL-01, mock v2): é o divisor entre o banco e
 *  o sistema, e ele atravessa a tabela inteira porque a célula existe em toda linha. */
const MEIO = 'border-l border-border border-r-2 border-r-primary text-center px-0';
const CEL = 'px-[5px] overflow-hidden text-ellipsis whitespace-nowrap';
/* ⚠ A DATA NUNCA ENCOLHE. Com `text-ellipsis` numa coluna de 36px, "16/07" virava "16/…" —
   e data cortada não é data. 38px cabe o formato inteiro a 10px ("30/09" mede 29,5), e a
   célula não corta. */
const CEL_DATA = 'px-[4px] whitespace-nowrap text-[9.5px] text-muted-foreground';
/* ⚠ UMA ALTURA SÓ, 18px, EM TODA LINHA — PR-CONC-CONFERENCIA-MODAL-01. Eram três na mesma
   tabela (16 no dia, 21 no movimento, 22 no fechamento e no aviso de vencidos) e 15 nas filhas,
   com fontes de 10, 11 e 12px. Uma régua só; a hierarquia fica no peso e no fundo. */
const H18 = 'h-[18px]';
/* ⚠ A LINHA CASADA TEM FUNDO VERDE MUITO LEVE — PR-CONC-SUGESTOES-CASAR-01 (Gabriel, 30/09): o token de sucesso a 6%
   na mãe e 8% na filha (tipos de linha diferentes, fundos diferentes), nos dois lados, sem mudar fonte nem altura. O
   que não está casado segue com os fundos de antes. */
const CONCILIADA = 'bg-success/[0.06]';
const CONCILIADA_FILHA = 'bg-success/[0.08]';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');

/**
 * O STATUS DO LADO DO SISTEMA, NUMA COLUNA PRÓPRIA — PR-CONC-CONFERENCIA-MODAL-01 (regra do
 * Gabriel de 28/09: uma informação por coluna, nunca selo misturado com texto). Ele morava no
 * fim do texto do candidato, com as cores de `badgeDeStatusTransacao`; agora vem da PALETA ÚNICA
 * (`STATUS_PALETA`, `statusFinanceiro.ts`): previsto, programado e agendado em texto colorido,
 * realizado com caixa e conciliado com selo — as mesmas da lista do Financeiro e da OC.
 * ⚠ SEM `text-ellipsis`: a coluna foi medida para o maior rótulo ("Conciliado" com selo, 65px a
 * 10px), e status cortado não é status.
 */
function paletaDoStatus(k: string) {
  switch (k) {
    case 'previsto': return STATUS_PALETA.previsto;
    case 'programado': return STATUS_PALETA.programado;
    case 'agendado': return STATUS_PALETA.agendado;
    case 'realizado': return STATUS_PALETA.realizado;
    case 'conciliado': return STATUS_PALETA.conciliado;
    default: return null;
  }
}
/* ⚠ O SELO DA CONFERÊNCIA É MENOR QUE A PÍLULA DA CASA — PR-CONC-CONFERENCIA-MODAL-01-fix2 (Gabriel, 30/09:
   "é só uma referência"). 8px, 4px de padding lateral, sem padding vertical, 12px de altura, raio pequeno,
   encostado à direita (junto do "⋯"). É a ÚNICA exceção ao piso de 9,5px nesta tabela, registrada no
   CLAUDE.md; a pílula de `STATUS_PILULA_BASE` continua valendo nas outras telas. Cores: as da paleta única. */
const SELO_CONFERENCIA = 'inline-flex h-[12px] items-center rounded-[3px] border px-[4px] text-[8px] font-semibold leading-none align-middle';
const SELO_CONFERENCIA_TEXTO = 'text-[8px] font-semibold leading-none align-middle';
function CelStatus({ status }: { status: string | null }) {
  const k = (status ?? '').trim().toLowerCase();
  const p = paletaDoStatus(k);
  const rotulo = k === 'conciliado' ? 'Conciliado' : (STATUS_FILTRO_LABEL[k] ?? (status || ''));
  return (
    <td className="px-[3px] text-right whitespace-nowrap" data-status={k || undefined}>
      {!p ? <span className={cn(SELO_CONFERENCIA_TEXTO, 'text-muted-foreground')}>{rotulo}</span>
        : p.comCaixa ? <span className={cn(SELO_CONFERENCIA, p.pilula)}>{rotulo}</span>
        : <span className={cn(SELO_CONFERENCIA_TEXTO, p.texto)}>{rotulo}</span>}
    </td>
  );
}

/**
 * A DATA DO LADO DO SISTEMA, na coluna própria — PR-CONC-CONFERENCIA-MODAL-01. No candidato é o
 * VENCIMENTO (vencido em vermelho, e é aqui que o "vencido" é dito — o selo que ficava no texto
 * saiu); no realizado é a data do lançamento, porque `fn_extratos_espelhados` não devolve o
 * vencimento dele (`EspSis` não o tem).
 */
function CelDataSistema({ data, vencido = false, rotulo }: { data: string | null | undefined; vencido?: boolean; rotulo: string }) {
  return (
    <td className={cn(CEL_DATA, vencido && 'font-semibold text-destructive')}
      title={data ? `${rotulo}${vencido ? ' · vencido' : ''}` : undefined}>
      {data ? fmtData(data) : ''}
    </td>
  );
}

/** Na filha, descrição e fornecedor saem no mesmo tom — ela não repete competência nem origem. */
function textoFilha(s: EspSis | undefined) {
  if (!s) return '—';
  return <>{s.descricao ?? '—'}{' · '}{s.fornecedor || '—'}</>;
}

/** "resto em 04/09" · "resto em 04/09 e 09/09" · "resto em 04/09, 09/09 e 11/09" — D3. */
export function textoResto(datas: readonly string[]): string {
  const ds = datas.map((d) => fmtData(d));
  if (ds.length === 0) return '';
  if (ds.length === 1) return `resto em ${ds[0]}`;
  return `resto em ${ds.slice(0, -1).join(', ')} e ${ds[ds.length - 1]}`;
}

type AvisosVinculo = { lancadoEm: string | null; parte?: FilhaConf['parte']; sobreAplicado: boolean };

/** A frase inteira dos avisos, para o `title` (o hover diz tudo mesmo quando a célula corta a descrição). */
function tituloAvisos(a: AvisosVinculo): string[] {
  return [
    a.sobreAplicado ? 'aplicado acima do lançamento: os extratos desta conta aplicam mais do que o lançamento vale' : null,
    a.lancadoEm ? `lançado em ${fmtData(a.lancadoEm)}: a data do lançamento difere da do banco (aviso, não diferença)` : null,
    a.parte ? `parte de ${fmtBRL(a.parte.valorCheio)}${a.parte.restoEm.length ? ` · ${textoResto(a.parte.restoEm)}` : ''}` : null,
  ].filter((x): x is string => !!x);
}

/**
 * A ESCADA DE ABREVIAÇÃO DOS AVISOS — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (D8: abreviar por regra, nunca cortar). Os avisos
 * moram na coluna da descrição (296px; 286 úteis) e, medido na tela a 9,5px, o pior caso real do mês ("lançado em 04/09 ·
 * parte de 11.080,80 · resto em 04/09 · ", 57 caracteres) ocupa 278px: ~4,9px por caractere, 58 cabem. A regra escolhe o
 * PRIMEIRO nível cujo texto inteiro cabe em `LIMITE_AVISOS` caracteres: (1) por extenso; (2) "lanç." / "parte X · resto
 * DD/MM" / "aplic. acima"; (3) o resto vira "resto em N datas"; (4) a parte sem o resto. A frase inteira fica sempre no
 * `title` (`tituloAvisos`).
 */
export const LIMITE_AVISOS = 58;
export function textosDosAvisos(a: AvisosVinculo): { tipo: 'sobre-aplicado' | 'lancado-em' | 'parte'; texto: string }[] {
  const datas = (ds: readonly string[]) => ds.length <= 1 ? ds.map((d) => fmtData(d)).join('')
    : `${ds.slice(0, -1).map((d) => fmtData(d)).join(', ')} e ${fmtData(ds[ds.length - 1])}`;
  const niveis = [
    { sobre: 'aplicado acima do lançamento', lanc: (d: string) => `lançado em ${fmtData(d)}`,
      parte: (p: NonNullable<FilhaConf['parte']>) => `parte de ${fmtBRL(p.valorCheio)}${p.restoEm.length ? ` · ${textoResto(p.restoEm)}` : ''}` },
    { sobre: 'aplic. acima', lanc: (d: string) => `lanç. ${fmtData(d)}`,
      parte: (p: NonNullable<FilhaConf['parte']>) => `parte ${fmtBRL(p.valorCheio)}${p.restoEm.length ? ` · resto ${datas(p.restoEm)}` : ''}` },
    { sobre: 'aplic. acima', lanc: (d: string) => `lanç. ${fmtData(d)}`,
      parte: (p: NonNullable<FilhaConf['parte']>) => `parte ${fmtBRL(p.valorCheio)}${p.restoEm.length > 1 ? ` · resto em ${p.restoEm.length} datas` : p.restoEm.length ? ` · resto ${datas(p.restoEm)}` : ''}` },
    { sobre: 'aplic. acima', lanc: (d: string) => `lanç. ${fmtData(d)}`,
      parte: (p: NonNullable<FilhaConf['parte']>) => `parte ${fmtBRL(p.valorCheio)}` },
  ];
  let itens: { tipo: 'sobre-aplicado' | 'lancado-em' | 'parte'; texto: string }[] = [];
  for (const n of niveis) {
    itens = [
      ...(a.sobreAplicado ? [{ tipo: 'sobre-aplicado' as const, texto: n.sobre }] : []),
      ...(a.lancadoEm ? [{ tipo: 'lancado-em' as const, texto: n.lanc(a.lancadoEm) }] : []),
      ...(a.parte ? [{ tipo: 'parte' as const, texto: n.parte(a.parte) }] : []),
    ];
    if (itens.reduce((t, i) => t + i.texto.length + 3, 0) <= LIMITE_AVISOS) return itens;
  }
  return itens;
}

/**
 * OS AVISOS DO VÍNCULO — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (D3, D4, R5). Vêm ANTES da descrição, na mesma célula: ela
 * corta no FIM (a descrição, que está inteira no `title`), e o aviso nunca pode ser o pedaço cortado — por isso a escada
 * de `textosDosAvisos`. Âmbar é aviso (data do lançamento diferente, aplicado acima); a parte é contexto (cinza). Nenhum
 * deles entra na diferença do dia.
 */
function AvisosDoVinculo(a: AvisosVinculo) {
  return (
    <>
      {textosDosAvisos(a).map((i) => (
        <span key={i.tipo} data-aviso={i.tipo} className={i.tipo === 'parte' ? 'text-muted-foreground' : 'text-amber-600'}>
          {i.texto}{' · '}
        </span>
      ))}
    </>
  );
}

/**
 * ⚠ CADA LINHA É UM COMPONENTE PORQUE O @dnd-kit É HOOK. `useDroppable`/`useDraggable` não
 * podem ser chamados dentro de um `.map()` — a regra dos hooks proíbe, e o React quebraria ao
 * mudar a contagem de linhas entre renders. Extrair não foi estética: era a única forma.
 */
function LinhaExtratoSemPar({ e, marcado, onMarcar, onCriar, onIgnorar, nSugestoes, onSugestoes }: {
  e: EspOfx; marcado: boolean; onMarcar: () => void; onCriar: () => void; onIgnorar: () => void;
  nSugestoes: number; onSugestoes: () => void;
}) {
  /* ⚠ A MESMA LINHA É ALVO E ORIGEM. Alvo quando um lançamento vem por cima (1:N); origem
     quando ELA é arrastada sobre um lançamento (N:1). São dois nós do @dnd-kit no mesmo
     `<tr>`: o droppable envolve a linha, o draggable mora só na alça. */
  const { isOver, setNodeRef } = useDroppable({ id: `ext:${e.extrato_id}` });
  return (
    <tr ref={setNodeRef} className={cn(H18, 'border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <td className="text-center">
        <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
          onChange={onMarcar} aria-label="Marcar movimento do banco" />
      </td>
      <td className={CEL_DATA}>{fmtData(e.data)}</td>
      <td className={cn(CEL, 'font-medium')} title={e.historico ?? ''}>{e.historico ?? '—'}</td>
      <td className={cn(CEL, 'text-right font-medium tabular-nums', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
      <td className={cn(MEIO, 'text-muted-foreground')} title="sem correspondência">○</td>
      <td />
      <td />
      <td />
      <td className={cn(CEL, 'italic text-muted-foreground')}>— nenhum lançamento vinculado</td>
      <td />
      {/* ⚠ "Criar" ABRE O MODAL COM A LISTA VAZIA, e não um formulário à parte: o caminho é o
          mesmo do "criar pela diferença", só que a diferença é o valor inteiro. Um segundo
          caminho para criar o mesmo lançamento seria a segunda forma.
          ⚠ "IGNORAR" É A ÚLTIMA FUNÇÃO QUE SÓ EXISTIA NA AUDITORIA BANCÁRIA. O operador via
          aqui a linha que o banco trouxe e não tinha o que fazer com ela; para desconsiderá-la
          precisava sair do espelho, achar a mesma linha noutra tela e voltar. O fluxo inteiro
          — listar derivados, decidir um a um, exigir motivo — já é o `DecisaoDerivadosDialog`:
          esta tela o INSTANCIA, não o reescreve. */}
      {/* ⚠ "VER SUGESTÕES (N)" — PR-CONC-SUGESTOES-CASAR-01. Com N = 0 aparece desabilitado e diz por quê. */}
      <CelAcoes alcaId={`dragExt:${e.extrato_id}`} itens={[
        { rotulo: `Ver sugestões (${nSugestoes})`, onClick: nSugestoes > 0 ? onSugestoes : undefined, motivo: 'nenhuma sugestão para este movimento' },
        { rotulo: 'Criar', onClick: onCriar },
        { rotulo: 'Ignorar', onClick: onIgnorar },
      ]} />
    </tr>
  );
}

function LinhaLancSemPar({ s, mesDoRecorte, marcado, onMarcar, onAbrir }: {
  s: EspSis; mesDoRecorte: string; marcado: boolean; onMarcar: () => void; onAbrir?: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `lan:${s.lancamento_id}` });
  return (
    <tr ref={setNodeRef} className={cn(H18, 'border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      {/* ⚠ A DATA DESTE LANÇAMENTO MORAVA NA COLUNA DE DATA DO BANCO — PR-CONC-CONFERENCIA-MODAL-01:
          ela é do sistema, e desceu para a coluna de data do sistema. */}
      <td />
      <td />
      <td className={cn(CEL, 'italic text-muted-foreground')}>— sem extrato correspondente</td>
      <td />
      <td className={cn(MEIO, 'font-semibold text-destructive')} title="sem par no banco">!</td>
      <td className="text-center">
        <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
          onChange={onMarcar} aria-label="Marcar lançamento" />
      </td>
      <td className={cn(CEL, 'text-left font-medium tabular-nums', corVal(s.valor_assinado))}>{fmtBRL(s.valor_assinado)}</td>
      <CelDataSistema data={s.data} rotulo="data do lançamento" />
      <td className={CEL} title={tituloLancamento(s)}>{textoLancamento(s, mesDoRecorte, true)}</td>
      <CelStatus status="realizado" />
      <CelAcoes alcaId={`dragLan:${s.lancamento_id}`} itens={[
        { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(s.lancamento_id) : undefined, motivo: SEM_ABRIR },
      ]} />
    </tr>
  );
}

/**
 * UM CANDIDATO NA COLUNA DO SISTEMA, EM LINHA ÚNICA — PR-ESPELHO-CANDIDATOS-COLUNA-02.
 *
 * Mesmo desenho do lançamento sem par (checkbox · valor · texto · ações), porque entra na mesma
 * mecânica de marcar e casar. O texto segue a ordem: vencimento · descrição · fornecedor ·
 * subcentro · status · vencido · sem conta · documento, truncado com o inteiro no `title`.
 * ⚠ JÁ VINCULADO não é casável (a RPC recusa `lancamento_ja_conciliado`): linha esmaecida, sem
 * checkbox, sem alça e sem receber arrasto.
 * ⚠ SEM CONTA É CASÁVEL — PR-ESPELHO-SEMCONTA-CASAVEL-03. O bloqueio de 9310fd3d existia porque
 * `fn_espelho_casar` promovia a realizado sem preencher a conta, e o lançamento sairia conciliado
 * e fora do saldo de qualquer conta. As duas RPCs passaram a preencher a conta do extrato POR
 * DIREÇÃO quando ela falta (saída → `conta_bancaria_id`; entrada → `conta_destino_id`; migrations
 * 20261027122200 e 20261027122300), nos dois sentidos (1:N e N:1). A pílula "sem conta" continua:
 * diz que o lançamento vai ganhar a conta do extrato ao casar.
 */
function LinhaCandidato({ c, marcado, onMarcar, onAbrir, falta = null }: {
  c: EspCandidato; marcado: boolean; onMarcar: () => void; onAbrir?: (id: string) => void;
  /** CONC-BLOCOS-TELA-01: o que falta para quitar um vinculado PARCIAL. Com falta, ele continua casável. */
  falta?: number | null;
}) {
  const parcial = c.ja_conciliado && falta != null;
  const casavel = !c.ja_conciliado || parcial;
  const { isOver, setNodeRef } = useDroppable({ id: `lan:${c.lancamento_id}`, disabled: !casavel });
  const doc = c.numero_documento ? [c.tipo_documento, c.numero_documento].filter(Boolean).join(' ') : null;
  const fornecedorDiferente = c.fornecedor && c.fornecedor !== c.descricao ? c.fornecedor : null;
  /* O `title` continua dizendo TUDO numa frase — é o que o hover mostra quando o texto trunca. */
  const titulo = [
    `${fmtData(c.data_vencimento)} venc.`, c.descricao || c.fornecedor, fornecedorDiferente && c.descricao ? fornecedorDiferente : null,
    c.subcentro, STATUS_FILTRO_LABEL[(c.status_transacao ?? '').toLowerCase()] ?? c.status_transacao,
    c.vencido ? 'vencido' : null, c.sem_conta ? 'sem conta' : null,
    c.ja_conciliado ? 'já vinculado' : null, doc,
  ].filter(Boolean).join(' · ');
  return (
    <tr ref={setNodeRef} className={cn(H18, 'border-b border-border/50',
      c.ja_conciliado && !parcial && 'opacity-60',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <td /><td /><td /><td />
      <td className={MEIO} />
      <td className="text-center">
        {casavel && (
          <input type="checkbox" className="h-3 w-3 align-middle" checked={marcado}
            onChange={onMarcar} aria-label="Marcar candidato" />
        )}
      </td>
      <td className={cn(CEL, 'text-left font-medium tabular-nums', corVal(c.valor_assinado))}>{fmtBRL(c.valor_assinado)}</td>
      <CelDataSistema data={c.data_vencimento} vencido={c.vencido} rotulo="vencimento" />
      {/* ⚠ O STATUS ERA A PRIMEIRA COISA A SUMIR — PR-ESPELHO-CANDIDATOS-POR-DATA-05, e é ele que
          o operador vem ler. A célula inteira era uma linha de texto corrido dentro de um
          `overflow-hidden text-ellipsis`: descrição e subcentro são longos, empurravam o badge
          para fora da largura e o corte comia justamente `agendado`/`previsto`/`programado`. Na
          tela tudo parecia "venc.", porque o que sobrava à esquerda era a data.
          ⚠ A CORREÇÃO É DE ESTRUTURA, NÃO DE TAMANHO: a célula vira `flex`, o que PODE encolher
          (descrição, fornecedor, subcentro) fica num `min-w-0 truncate`, e o que NÃO pode (badge,
          vencido, sem conta, já vinculado) é `shrink-0`. Diminuir a fonte adiaria o corte; tirar
          do truncamento o resolve.
          ⚠ AS CORES DO BADGE NÃO SE TOCAM: vêm de `badgeDeStatusTransacao`, o mapa da casa.
          ⚠ E A DATA PERDE PESO, não presença: ela é o RÓTULO do vencimento, e estava competindo
          com o dado por ser a primeira e estar em tabular.
          ⚠ E AGORA VENCIMENTO E STATUS SAÍRAM DA CÉLULA — PR-CONC-CONFERENCIA-MODAL-01 (regra do
          Gabriel de 28/09: uma informação por coluna). O vencimento tem coluna própria (e o
          "vencido" é dito nela, em vermelho, em vez de um selo âmbar no texto); o status tem a
          dele, com a paleta única. No texto sobram descrição · fornecedor · subcentro · documento,
          que truncam com tudo no `title`, e os dois avisos que não são status nem data ("sem conta",
          "já vinculado"), que ficam `shrink-0` no fim para nunca serem cortados. */}
      <td className={cn(CEL, 'max-w-0')} title={titulo}>
        <span className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{c.descricao || c.fornecedor || '—'}</span>
            <span className="text-muted-foreground">
              {fornecedorDiferente && c.descricao && <>{' · '}{fornecedorDiferente}</>}
              {c.subcentro && <>{' · '}{c.subcentro}</>}
              {doc && <>{' · '}{doc}</>}
            </span>
          </span>
          {c.sem_conta && <span className="shrink-0 rounded bg-destructive/10 px-1 font-medium text-destructive">sem conta</span>}
          {parcial && falta != null && <ChipParcial falta={falta} />}
          {c.ja_conciliado && !parcial && <span className="shrink-0 italic text-muted-foreground">já vinculado</span>}
        </span>
      </td>
      <CelStatus status={c.status_transacao} />
      <CelAcoes alcaId={casavel ? `dragLan:${c.lancamento_id}` : undefined} itens={[
        { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(c.lancamento_id) : undefined, motivo: SEM_ABRIR },
      ]} />
    </tr>
  );
}

/**
 * "PARCIAL — FALTA R$ X" — CONC-BLOCOS-TELA-01: o lançamento que um bloco deixou parcial. Ele continua programado e
 * continua candidato para o próximo extrato; o chip diz quanto falta.
 */
function ChipParcial({ falta }: { falta: number }) {
  return (
    <span className="ml-1 shrink-0 rounded-[3px] bg-amber-100 px-1 text-[9.5px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      data-testid="chip-parcial">
      Parcial — falta R$ {fmtBRL(falta)}
    </span>
  );
}

/** O texto inteiro do lançamento para o `title` — é o que o hover mostra quando a célula trunca. */
function tituloLancamento(s: EspSis | undefined) {
  if (!s) return undefined;
  return [s.descricao, s.fornecedor, s.subcentro].filter(Boolean).join(' · ') || undefined;
}

/** Descrição + fornecedor (+ competência quando difere, + origem quando sem par), UMA linha. */
function textoLancamento(s: EspSis | undefined, mesDoRecorte: string, semPar = false) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const comp = s.competencia && s.competencia.slice(0, 7) !== mesDoRecorte
    ? `${MESES_CURTOS[Number(s.competencia.slice(5, 7)) - 1] ?? ''}/${s.competencia.slice(2, 4)}`
    : null;
  return (
    <>
      {/* ⚠ 10px COMO TUDO — PR-CONC-CONFERENCIA-MODAL-01: a descrição era 11px e o resto 10; agora a
          tabela tem UMA fonte, e a hierarquia fica só no peso (descrição `font-medium`). */}
      <span className="font-medium">{s.descricao ?? '—'}</span>
      {/* ⚠ SEM `text-muted-foreground` — PR-ESPELHO-CONFERENCIA-FONTE-07. O fornecedor e a
          competência são o que o operador LÊ para ter certeza de que este lançamento é o par
          daquele movimento do banco; em cinza claro a 10px eles viravam contexto de fundo, e
          conciliar passava a depender de adivinhar.
          ⚠ SÓ A COR MUDA: 10px continua, porque a hierarquia com a descrição (11px/medium) vem
          do tamanho e do peso, não do apagado. Tirar os dois faria o fornecedor competir com a
          descrição; tirar só a cor o traz para a leitura sem mexer em uma linha do layout. */}
      <span>
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

function AbaConferencia({ data, anoMes, nomeConta, clienteId, contaId, internos, onAbrir, onMudou, mostrarCandidatos = true, soNaoConciliados = false, diaFoco = null, onDiaFocado }: {
  data: EspelhadosReais; anoMes: string; nomeConta?: string; clienteId: string; contaId: string | null;
  internos: ReadonlySet<string>; onAbrir?: (id: string) => void; onMudou: () => void;
  /** Sem candidatos, a mesa é só o fecho dos realizados (o modal do Espelho). */
  mostrarCandidatos?: boolean;
  /** Esconde as linhas casadas (✓, dos dois lados); o dia sem linha visível some; o fechamento não é recalculado. */
  soNaoConciliados?: boolean;
  /** Rola até o cabeçalho deste dia ao abrir (o link do Status da Conciliação) e avisa quem pediu. */
  diaFoco?: string | null;
  onDiaFocado?: () => void;
}) {
  const dias = useMemo(() => montarMesa(data, internos), [data, internos]);
  /* PR-CONC-SALDO-UMA-REGUA-02 — o link "N dias com diferença" abre a mesa NESTE dia: o cabeçalho do dia leva
     `data-dia`, e a rolagem é a do scrollport da mesa (`scrollIntoView` acha o ancestral que rola). Uma vez por pedido. */
  const refMesa = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!diaFoco || dias.length === 0) return;
    const el = refMesa.current?.querySelector(`[data-dia="${diaFoco}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'start' });
    onDiaFocado?.();
  }, [diaFoco, dias, onDiaFocado]);
  const [sel, setSel] = useState<EstadoSelecao>({ extratos: new Set(), lancamentos: new Set() });
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  /* ⚠ O IGNORADO NÃO ESTÁ NO ESPELHO, e é por isso que precisa de leitura própria: a RPC
     filtra `ignorado_em IS NULL` (é o que faz a linha sumir ao ignorar). Sem esta consulta,
     desconsiderar seria uma porta sem volta dentro desta tela — e uma decisão que não se
     desfaz onde foi tomada é uma decisão que o operador evita tomar. */
  const [verIgnorados, setVerIgnorados] = useState(false);
  /* ⚠ COMEÇA OCULTO — PR-ESPELHO-VENCIDOS-NO-TOPO-08. O vencido é do passado e não pertence ao
     fluxo do mês que se está conferindo; aberto por padrão, ele empurraria o dia 01 para baixo
     da dobra em toda abertura da tela. A contagem no rótulo é o que garante que ele não some:
     "Mostrar vencidos (7)" informa mesmo fechado. */
  const [mostrarVencidos, setMostrarVencidos] = useState(false);
  /* ⚠ UM LUGAR SÓ DECIDE — PR-CONCILIACAO-5-ABAS-01. Com a lista vazia somem de uma vez a
     faixa, as linhas e os candidatos do `sisIndex` (nada de marcar ou arrastar candidato). */
  const candidatos = useMemo(
    () => (mostrarCandidatos ? (data.sistema_candidatos ?? []) : []),
    [data, mostrarCandidatos]);
  /* ⚠ AS SUGESTÕES DE CADA MOVIMENTO SEM PAR — PR-CONC-SUGESTOES-CASAR-01. Calculadas UMA vez por mesa e guardadas
     por linha: o "(N)" do menu é o tamanho desta lista e o modal mostra ESTA lista. Com orçamentos diferentes (2ms no
     menu, 30 no modal) o menu dizia (2) e o modal mostrava 1 — medido no Camargo. Com a soma entre fornecedores
     limitada a 3, a busca termina muito antes dos 30ms, e o resultado não depende mais do relógio.
     Sem candidatos (o modal do Espelho), toda lista é vazia. */
  const sugestoesPorLinha = useMemo(() => {
    const m = new Map<string, Sugestao[]>();
    for (const d of dias) for (const e of d.extratosSemPar) {
      m.set(e.extrato_id, sugerirCasamentos(e, candidatos, { orcamentoMs: 30 }));
    }
    return m;
  }, [dias, candidatos]);

  /**
   * OS VENCIDOS — PR-ESPELHO-VENCIDOS-NO-TOPO-08. O que já passou da data e continua em aberto.
   *
   * ⚠ A ORDEM É CRONOLÓGICA, E ISSO É O CONSERTO. A faixa anterior ordenava só por VALOR,
   * atravessando datas — e aí dois "−3.671,00 Folha", um de 05/06 e outro de 05/07, apareciam
   * colados sem nada dizendo que eram dois meses diferentes. Numa lista de atraso, QUANDO venceu
   * é a informação; o valor só desempata.
   * ⚠ DUAS PASSADAS, NÃO UM COMPARADOR NOVO: primeiro a `ordenar` da casa (entrada antes de
   * saída, maior primeiro), depois um `sort` estável por data ascendente. O `Array#sort` do JS é
   * estável desde o ES2019, então a ordem de valor sobrevive dentro de cada data — que é
   * exatamente a régua das outras linhas do mesmo dia.
   */
  const vencidos = useMemo(() => {
    if (!mostrarCandidatos) return [];
    const doMaiorParaOMenor = ordenar(
      (data.sistema_candidatos ?? []).filter((c) => c.vencido),
      (c) => c.valor_assinado);
    return [...doMaiorParaOMenor].sort((a, b) =>
      (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''));
  }, [data, mostrarCandidatos]);
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
  const [sugerir, setSugerir] = useState<ExtratoAlvo | null>(null);
  const [arrastando, setArrastando] = useState<EspSis | null>(null);
  const [arrastandoExt, setArrastandoExt] = useState<EspOfx | null>(null);
  const [casarN1, setCasarN1] = useState<{ sis: EspSis; extratos: EspOfx[] } | null>(null);
  /* CONC-BLOCOS-TELA-01 — a variante BLOCO (N extratos × M lançamentos, `fn_conciliar_bloco`). */
  const [casarBloco, setCasarBloco] = useState<{ extratos: EspOfx[]; lancs: EspSis[]; regra: RegraBloco } | null>(null);
  /* O passo de desfazer um bloco: o id do bloco aberto, o motivo digitado e a recusa (inline, nunca toast). */
  const [desfazendoBloco, setDesfazendoBloco] = useState<string | null>(null);
  const [motivoDesfazer, setMotivoDesfazer] = useState('');
  const [erroDesfazer, setErroDesfazer] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  /**
   * OS BLOCOS VIVOS DA CONTA — quem é bloco ganha "Desfazer bloco" no "⋯" (e não "Desconciliar grupo", que desfaria os
   * vínculos sem devolver status e data). Relido a cada `data` nova (depois de conciliar ou desfazer).
   */
  const [blocosVivos, setBlocosVivos] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!contaId) { setBlocosVivos(new Set()); return; }
    let vivo = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: linhas } = await (supabase as any).from('conciliacao_blocos')
        .select('id').eq('conta_bancaria_id', contaId).is('desfeito_em', null);
      if (vivo) setBlocosVivos(new Set(((linhas ?? []) as Array<{ id: string }>).map((b) => b.id)));
    })();
    return () => { vivo = false; };
  }, [contaId, data]);
  /**
   * ⚠ O PARCIAL CONTINUA CANDIDATO — CONC-BLOCOS-TELA-01. O candidato com QUALQUER vínculo vem `ja_conciliado` e ficava
   * sem checkbox; o que o bloco deixou parcial ("falta R$ X") tem de poder casar com o próximo depósito. Uma consulta só,
   * pelos ids dos vinculados (candidatos e filhas): soma o aplicado vivo de cada um. A falta é exibição; quem valida o
   * saldo livre é a `fn_conciliar_bloco`.
   */
  const idsVinculados = useMemo(() => {
    const s = new Set<string>();
    for (const c of data.sistema_candidatos ?? []) if (c.ja_conciliado) s.add(c.lancamento_id);
    for (const v of data.vinculos ?? []) s.add(v.lancamento_id);
    return [...s].sort().join(',');
  }, [data]);
  const [aplicadoVivo, setAplicadoVivo] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    if (!idsVinculados) { setAplicadoVivo(new Map()); return; }
    let vivo = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: linhas } = await (supabase as any).from('conciliacao_bancaria_itens')
        .select('lancamento_id, valor_aplicado').in('lancamento_id', idsVinculados.split(',')).is('desfeito_em', null);
      if (!vivo) return;
      const m = new Map<string, number>();
      for (const l of (linhas ?? []) as Array<{ lancamento_id: string; valor_aplicado: number }>) {
        m.set(l.lancamento_id, (m.get(l.lancamento_id) ?? 0) + Number(l.valor_aplicado ?? 0));
      }
      setAplicadoVivo(m);
    })();
    return () => { vivo = false; };
  }, [idsVinculados]);
  /** Quanto falta para quitar (> 0,005), ou `null` quando está inteiro ou sem vínculo. */
  const faltaDe = (lancamentoId: string, valor: number): number | null => {
    const ap = aplicadoVivo.get(lancamentoId);
    if (ap == null) return null;
    const falta = Math.round((Math.abs(valor) - ap) * 100) / 100;
    return falta > 0.005 ? falta : null;
  };
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
  /* ⚠ O CANDIDATO ENTRA NO MESMO ÍNDICE DO REALIZADO — PR-ESPELHO-CANDIDATOS-COLUNA-02. Soma da
     barra, conciliar pela barra, arrastar e o modal "Casar com o banco" leem `sisIndex`; com o
     candidato lá, a mecânica inteira serve a ele sem um segundo caminho. A data é o vencimento,
     e a RPC de casar é quem promove a realizado (data de pagamento = data do extrato). */
  const sisIndex = useMemo(() => new Map([
    ...data.sistema_completo,
    ...candidatos.map((c): EspSis => ({
      lancamento_id: c.lancamento_id, data: c.data_vencimento, descricao: c.descricao,
      centro: c.centro, subcentro: c.subcentro, valor_assinado: c.valor_assinado, sinal: c.sinal,
      status: c.ja_conciliado ? 'conciliado' : 'sem_vinculo',
      fornecedor: c.fornecedor, origem_lancamento: null, competencia: c.competencia,
    })),
  ].map((s) => [s.lancamento_id, s])), [data, candidatos]);
  const somaExtratos = [...sel.extratos].reduce((a, id) => a + (extratoIndex.get(id)?.valor ?? 0), 0);
  const somaLancs = [...sel.lancamentos].reduce((a, id) => a + (sisIndex.get(id)?.valor_assinado ?? 0), 0);
  /* ⚠ A DIFERENÇA DA BARRA É SÓ PARA EXIBIR. Quem decide se pode conciliar é a RPC: ela
     revalida a soma no servidor, com os valores que estão lá e não os que a tela viu. */
  const difSel = somaExtratos - somaLancs;
  /* ⚠ DOIS SENTIDOS, UMA BARRA. 1 extrato : N lançamentos vai pela `fn_espelho_casar`;
     N extratos : 1 lançamento pela `fn_espelho_casar_n1`. O que decide é a contagem dos dois
     lados — não há botão para escolher, porque a marcação já disse o que se quer. */
  /* ⚠ O BLOCO — CONC-BLOCOS-TELA-01: 2+ extratos E 2+ lançamentos, ou um lançamento PARCIAL marcado (o 1:N e o N:1
     recusam lançamento já vinculado; só o bloco completa o saldo livre). Com 1 extrato e N lançamentos, ou N e 1, os
     caminhos de sempre continuam como estão. */
  const algumParcial = [...sel.lancamentos].some((id) => faltaDe(id, sisIndex.get(id)?.valor_assinado ?? 0) != null);
  const sentido: 'um_n' | 'n_um' | 'bloco' | null =
    sel.extratos.size >= 1 && sel.lancamentos.size >= 1 && algumParcial ? 'bloco'
    : sel.extratos.size >= 2 && sel.lancamentos.size >= 2 ? 'bloco'
    : sel.extratos.size === 1 && sel.lancamentos.size >= 1 ? 'um_n'
    : sel.extratos.size >= 2 && sel.lancamentos.size === 1 ? 'n_um'
    : null;
  /* O bloco não concilia pela barra: a matriz e a regra se conferem no modal, que é quem chama a RPC. */
  const podeConciliar = !!sentido && sentido !== 'bloco' && Math.abs(difSel) <= 0.01;
  const motivoBloqueio = sentido === 'bloco' ? 'bloco: confira em "Casar com o banco…"'
    : sentido ? (Math.abs(difSel) > 0.01 ? 'os valores não batem' : '')
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
    if (!sentido || sentido === 'bloco') return;
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

  /* ⚠ VENC E STATUS DO LEVADO — PR-CONC-SUGESTOES-CASAR-01. O candidato traz os dois; o realizado sem par não traz o
     vencimento (`EspSis.data` é a data do LANÇAMENTO), então vai "—", e o status é o que a mesa já mostra dele. */
  const candidatoPorId = new Map(candidatos.map((c) => [c.lancamento_id, c]));
  const comoLevado = (s: EspSis): LevadoInicial => {
    const c = candidatoPorId.get(s.lancamento_id);
    return {
      lancamento_id: s.lancamento_id, descricao: s.descricao,
      fornecedor: s.fornecedor ?? null, valor_assinado: s.valor_assinado,
      data_vencimento: c ? c.data_vencimento : null,
      status_transacao: c ? c.status_transacao : (s.status === 'conciliado' ? 'conciliado' : 'realizado'),
    };
  };

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

  /* A variante bloco, com a seleção inteira. A regra começa em "Soma exata", ou na que o operador pediu. */
  const abrirBloco = (regra: RegraBloco) => {
    const extratos = [...sel.extratos].map((id) => extratoIndex.get(id)).filter((x): x is EspOfx => !!x);
    const lancs = [...sel.lancamentos].map((id) => sisIndex.get(id)).filter((x): x is EspSis => !!x);
    if (extratos.length && lancs.length) setCasarBloco({ extratos, lancs, regra });
  };

  /* O GESTO CONTRÁRIO do bloco: um passo inline (sem `confirm()` nativo), motivo obrigatório. */
  const abrirDesfazerBloco = (blocoId: string) => {
    setDesfazendoBloco(blocoId); setMotivoDesfazer(''); setErroDesfazer(null);
  };
  const desfazerBlocoAgora = async () => {
    if (!desfazendoBloco || desfazendo) return;
    if (!motivoDesfazer.trim()) { setErroDesfazer('Diga por que o bloco está sendo desfeito.'); return; }
    setDesfazendo(true); setErroDesfazer(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_desfazer_bloco', { p_bloco: desfazendoBloco, p_motivo: motivoDesfazer.trim() });
      if (error) { setErroDesfazer(fraseDaRecusa(error.message)); return; }
      setDesfazendoBloco(null);
      onMudou();
    } finally {
      setDesfazendo(false);
    }
  };

  /* O botão da barra abre o modal do SENTIDO que a marcação já declarou. */
  const abrirCasarDaBarra = () => {
    if (sentido === 'bloco') { abrirBloco(algumParcial ? 'mais_antigo_primeiro' : 'exato'); return; }
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
    <div ref={refMesa} className="flex min-h-0 flex-1 flex-col">
      {/* ⚠ A MARGEM É DO CONTAINER, NÃO DA TABELA. As bordas e a divisória continuam de fora a
          fora DA TABELA; é ela que se afasta da borda do modal, e não as linhas que encurtam. */}
      {/* ⚠ `overflow-auto`, NOS DOIS EIXOS — PR-CONC-CONFERENCIA-MODAL-01: abaixo da largura mínima
          da tabela ela rola DENTRO do modal, nunca a página. */}
      <div className="min-h-0 flex-1 overflow-auto border-t px-3.5">
        {/* ⚠ A RÉGUA É O PADRÃO DA TABELA, não de cada célula. Sem isto, as células que não
            declaram tamanho — as dos checkboxes, a das ações, a do lançamento — herdam os
            16px/24px do documento e esticam a linha de 21px para 26,5px, mesmo com `h-[21px]` (hoje 18px)
            no `<tr>`: altura em tabela é mínimo, não teto. Medido em 09/09/2026. */}
        {/* ⚠ A RÉGUA DO MODAL — PR-CONC-CONFERENCIA-MODAL-01 (mock v2 aprovado pelo Gabriel), MEDIDA
            NA TELA. 10px e 18px em TODA célula; onze colunas, uma informação por coluna:
            OFX [check 18][data 38][histórico][valor 80][status 18] | divisor 2px | Sistema
            [check 18][valor 80][data 38][descrição · fornecedor · subcentro][status 72][ações 142].
            ⚠ AS DUAS DE TEXTO NÃO TÊM LARGURA: dividem o que sobra, e é isso que as faz crescer em
            1440 sem alargar valor, data nem status. O piso é o `minWidth` de 1046, a largura útil do
            modal na janela do Gabriel (innerWidth 1.135): 504 fixos + 271 para cada texto.
            ⚠ STATUS 72, NÃO OS 58 DO MOCK: medido a 10px, "Conciliado" com selo pede 65 (51,4 de
            texto + 14 da pílula) e "Programado" em texto 59,3; 58 cortaria os dois.
            ⚠ AÇÕES 142: "diferença -134.613,84" pede 112,2 a 10px semibold — era ela que saía "-134…"
            nos 104 de antes, a 11px (123,4). */}
        {/* ⚠ fix1 (Gabriel, 30/09): 9,5px (o piso da casa) em TODA célula, e a coluna de ações de 142 → 46 (alça +
            "⋯"). Os ~100px liberados foram para o HISTÓRICO DO OFX, que agora é a única coluna sem largura: fica
            com tudo o que sobra. A descrição do sistema ficou fixa nos 278 de antes; status foi a 78 para a
            diferença do fechamento (status + ações = 124) caber inteira. */}
        {/* ⚠ `[&_td]:py-0` E O ALINHAMENTO AO MEIO DO SELO E DO "⋯" (fix1): o `td` herdava 1px de padding em cima e
            embaixo, e o selo (`inline-block` de 15px) e o gatilho (16px) alinhavam pela BASE da linha de texto —
            as linhas saíam com 19, 21 e 22px. Medido na tela antes e depois. */}
        <table className="w-full border-collapse text-[9.5px] leading-[13px] [&_td]:py-0" style={{ tableLayout: 'fixed', minWidth: 1046 }}>
          <colgroup>
            <col style={{ width: 18 }} /><col style={{ width: 38 }} /><col />
            <col style={{ width: 80 }} /><col style={{ width: 18 }} />
            <col style={{ width: 18 }} /><col style={{ width: 80 }} /><col style={{ width: 38 }} /><col style={{ width: 296 }} />
            <col style={{ width: 60 }} /><col style={{ width: 46 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className={cn(H18, 'bg-primary text-primary-foreground')}>
              <th />
              <th colSpan={3} className="px-[5px] text-left text-[9.5px] font-medium">Banco (OFX)</th>
              {/* A divisória atravessa o cabeçalho também — em branco, porque o fundo é azul. */}
              <th className="border-l border-primary-foreground/40 border-r-2 border-r-primary-foreground/60 px-0" />
              <th colSpan={5} className="px-[5px] text-left text-[9.5px] font-medium">Sistema</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {/* ═══ VENCIDOS — NO TOPO, CRONOLÓGICOS, FECHADOS POR PADRÃO ═══════════════════
                ⚠ ELES SUBIRAM DO FIM PARA CÁ — PR-ESPELHO-VENCIDOS-NO-TOPO-08. Atraso se lê
                antes, não depois: quem abre a conferência precisa saber que há coisa vencida
                ANTES de decidir o que fazer com o mês corrente, e no fim da mesa isso ficava
                atrás de trinta dias de movimento.
                ⚠ E FECHADO POR PADRÃO, com a contagem no rótulo: aberto, ele empurraria o dia 01
                para baixo da dobra em toda abertura. Fechado, ele AVISA sem ocupar — que é o que
                uma lista de pendência antiga deve fazer numa tela de conferir o mês. */}
            {vencidos.length > 0 && (
              <tr className={cn(H18, 'bg-amber-50 border-b border-amber-200 dark:bg-amber-950/20 dark:border-amber-900')}>
                <td colSpan={4} />
                <td className={MEIO} />
                <td colSpan={6} className="px-[5px] whitespace-nowrap">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[9.5px] font-medium text-amber-900 dark:text-amber-200">
                    <input type="checkbox" className="h-3 w-3 cursor-pointer"
                      checked={mostrarVencidos}
                      onChange={(e) => setMostrarVencidos(e.target.checked)} />
                    Mostrar vencidos ({vencidos.length})
                    <span className="font-normal opacity-70">— em aberto de meses anteriores</span>
                  </label>
                </td>
              </tr>
            )}
            {mostrarVencidos && vencidos.map((c) => (
              <LinhaCandidato key={c.lancamento_id} c={c} falta={faltaDe(c.lancamento_id, c.valor)}
                marcado={marcado('lancamentos', c.lancamento_id)}
                onMarcar={() => alterna('lancamentos', c.lancamento_id)} onAbrir={onAbrir} />
            ))}

            {dias.map((d) => (
              /* ⚠ "SÓ NÃO CONCILIADOS": o dia sem nenhuma linha visível some inteiro (cabeçalho e fechamento). O dia que
                 fica mostra o fechamento com os totais do DIA INTEIRO, casados incluídos — o filtro esconde linhas, não
                 muda a conta. */
              soNaoConciliados && d.extratosSemPar.length === 0 && d.lancsSemPar.length === 0 && d.internas.length === 0
                && d.restos.length === 0 && !(mostrarCandidatos && d.candidatos.length > 0) ? null :
              <React.Fragment key={d.data ?? 'sem-data'}>
                <tr className={cn(H18, 'bg-muted/40')} data-dia={d.data ?? undefined}>
                  <td colSpan={4} className="px-[5px] whitespace-nowrap font-medium text-muted-foreground">{fmtData(d.data)}</td>
                  <td className={MEIO} />
                  <td colSpan={6} />
                </tr>

                {!soNaoConciliados && d.pareados.map((p) => {
                  const icone = iconeDoLancamento(p.tipoVencedor);
                  const agrupado = p.filhas.length > 1;
                  const unica = p.filhas.length === 1 ? p.filhas[0] : null;
                  const temDif = Math.abs(p.diferenca) > 0.01;
                  const somaAssinada = Math.sign(p.extrato.valor || 1) * p.soma;
                  return (
                    <React.Fragment key={p.extrato.extrato_id}>
                      <tr className={cn(H18, 'border-b border-border/50', CONCILIADA)} data-conciliada="">
                        <td />
                        <td className={CEL_DATA}>{fmtData(p.extrato.data)}</td>
                        <td className={cn(CEL, 'font-medium')} title={p.extrato.historico ?? ''}>{p.extrato.historico ?? '—'}</td>
                        <td className={cn(CEL, 'text-right font-medium tabular-nums', corVal(p.extrato.valor))}>{fmtBRL(p.extrato.valor)}</td>
                        <td className={cn(MEIO, 'font-semibold', SINAL_CASADO.cor)} title={SINAL_CASADO.titulo}>{SINAL_CASADO.simbolo}</td>
                        <td />
                        <td className={cn(CEL, 'text-left font-medium tabular-nums', temDif ? 'text-amber-600' : corVal(somaAssinada))}
                            title={temDif ? `banco ${fmtBRL(Math.abs(p.diferenca))} ${p.diferenca > 0 ? 'a mais' : 'a menos'} que a soma` : undefined}>
                          {fmtBRL(somaAssinada)}
                        </td>
                        <CelDataSistema data={unica?.sis?.data} rotulo="data do lançamento" />
                        <td className={CEL} title={[
                          ...tituloAvisos({ lancadoEm: unica?.lancadoEm ?? null, parte: unica?.parte, sobreAplicado: p.sobreAplicado }),
                          unica ? tituloLancamento(unica.sis) : null,
                        ].filter(Boolean).join(' · ') || undefined}>
                          {/* PR-CONC-CONFERENCIA-FECHAMENTO-DIA: os avisos ANTES da descrição (a célula corta no fim). No agrupado
                              a mãe só diz o "aplicado acima"; data e parte de cada lançamento vão na filha dele. */}
                          <AvisosDoVinculo lancadoEm={unica?.lancadoEm ?? null} parte={unica?.parte ?? null} sobreAplicado={p.sobreAplicado} />
                          {agrupado
                            ? <><span className="font-medium">{p.filhas.length} lançamentos</span>
                                <span className="text-muted-foreground">{' · '}{p.grupoId ? 'agrupados' : `${p.filhas.length} vínculos`}</span></>
                            : textoLancamento(unica?.sis, mesDoRecorte)}
                          {unica && unica.deN > 1 && <span className="text-muted-foreground">{' · '}1 de {unica.deN}</span>}
                          <MarcadorOrigem tipo={p.tipoVencedor} />
                        </td>
                        <CelStatus status="conciliado" />
                        <CelAcoes itens={[
                          { rotulo: 'Abrir',
                            onClick: unica && onAbrir ? () => onAbrir(unica.lancamento_id) : undefined,
                            motivo: unica ? SEM_ABRIR : 'agrupado: abra cada lançamento nas linhas abaixo' },
                          /* ⚠ BLOCO SE DESFAZ PELO GESTO CONTRÁRIO DELE (CONC-BLOCOS-TELA-01): `fn_desfazer_bloco` devolve
                             status e data de cada lançamento; o "Desconciliar grupo" só desfaria os vínculos. */
                          p.grupoId && blocosVivos.has(p.grupoId)
                            ? { rotulo: 'Desfazer bloco', onClick: () => abrirDesfazerBloco(p.grupoId!) }
                            : { rotulo: p.grupoId ? 'Desconciliar grupo' : 'Desconciliar',
                            onClick: (unica || p.grupoId) ? async () => {
                              const r = p.grupoId
                                ? await desfazerGrupo(p.grupoId, 'desfeito_no_espelho')
                                : await desfazerVinculo(p.extrato.extrato_id, 'desfeito_no_espelho');
                              if (r.ok) onMudou(); else setErro(r.erro ?? 'Não foi possível desconciliar.');
                            } : undefined,
                            motivo: 'vínculos sem grupo: desconcilie cada um pelo lançamento' },
                        ]} />
                      </tr>

                      {/* ⚠ A FILHA É DETALHE DE COMPOSIÇÃO, e a tipografia diz isso: 10px, peso
                          400 em tudo — inclusive no valor —, descrição em muted e borda mais
                          fraca que a das linhas. Ela explica a mãe; não compete com ela. */}
                      {agrupado && p.filhas.map((f) => (
                        <tr key={f.lancamento_id} className={cn(H18, CONCILIADA_FILHA, 'border-b border-border/30')} data-conciliada="">
                          <td /><td /><td /><td />
                          <td className={cn(MEIO, 'font-normal text-muted-foreground')}>↳</td>
                          <td />
                          {/* CONC-MESA-SINAL-01: o sinal da filha é o do lançamento — a dedução aparece negativa no depósito. */}
                          <td className={cn(CEL, 'text-left font-normal tabular-nums', corVal(sinalDoAplicado(f.sis, p.extrato.valor) * f.valor_aplicado))}>
                            {fmtBRL(sinalDoAplicado(f.sis, p.extrato.valor) * f.valor_aplicado)}
                          </td>
                          <CelDataSistema data={f.sis?.data} rotulo="data do lançamento" />
                          <td className={cn(CEL, 'font-normal text-muted-foreground')}
                            title={[...tituloAvisos({ lancadoEm: f.lancadoEm, parte: f.parte, sobreAplicado: false }), tituloLancamento(f.sis)]
                              .filter(Boolean).join(' · ') || undefined}>
                            <AvisosDoVinculo lancadoEm={f.lancadoEm} parte={f.parte} sobreAplicado={false} />
                            {textoFilha(f.sis)}
                            {(() => {
                              const falta = faltaDe(f.lancamento_id, f.sis?.valor_assinado ?? 0);
                              return falta == null ? null : <ChipParcial falta={falta} />;
                            })()}
                          </td>
                          <td />
                          <CelAcoes itens={[
                            { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(f.lancamento_id) : undefined, motivo: SEM_ABRIR },
                            { rotulo: 'Desconciliar', motivo: 'desconcilie pela linha do extrato, acima' },
                          ]} />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* ⚠ N:1 — a mãe do lado do SISTEMA. Ver `ParedoN1`. */}
                {!soNaoConciliados && d.paredosN1.map((g) => {
                  const temDif = Math.abs(g.diferenca) > 0.01;
                  const somaAssinada = Math.sign(g.sis.valor_assinado || 1) * g.soma;
                  return (
                    <React.Fragment key={g.sis.lancamento_id}>
                      <tr className={cn(H18, 'border-b border-border/50', CONCILIADA)} data-conciliada="">
                        <td /><td /><td />
                        <td className={cn(CEL, 'text-right font-medium tabular-nums', temDif ? 'text-amber-600' : corVal(somaAssinada))}
                            title={temDif ? `os extratos somam ${fmtBRL(Math.abs(g.diferenca))} ${g.diferenca > 0 ? 'a mais' : 'a menos'} que o lançamento` : undefined}>
                          {fmtBRL(somaAssinada)}
                        </td>
                        <td className={cn(MEIO, 'font-semibold', SINAL_CASADO.cor)} title={SINAL_CASADO.titulo}>{SINAL_CASADO.simbolo}</td>
                        <td />
                        <td className={cn(CEL, 'text-left font-medium tabular-nums', corVal(g.sis.valor_assinado))}>{fmtBRL(g.sis.valor_assinado)}</td>
                        <CelDataSistema data={g.sis.data} rotulo="data do lançamento" />
                        <td className={CEL} title={[...tituloAvisos({ lancadoEm: g.lancadoEm, sobreAplicado: g.sobreAplicado }), tituloLancamento(g.sis)]
                          .filter(Boolean).join(' · ') || undefined}>
                          <AvisosDoVinculo lancadoEm={g.lancadoEm} sobreAplicado={g.sobreAplicado} />
                          {textoLancamento(g.sis, mesDoRecorte)}
                          <span className="text-muted-foreground">{' · '}{g.extratos.length} extratos</span>
                          <MarcadorOrigem tipo="agrupamento_manual" />
                        </td>
                        <CelStatus status="conciliado" />
                        <CelAcoes itens={[
                          { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(g.sis.lancamento_id) : undefined, motivo: SEM_ABRIR },
                          g.grupoId && blocosVivos.has(g.grupoId)
                            ? { rotulo: 'Desfazer bloco', onClick: () => abrirDesfazerBloco(g.grupoId!) }
                            : { rotulo: 'Desconciliar grupo',
                            onClick: g.grupoId ? async () => {
                              const r = await desfazerGrupo(g.grupoId!, 'desfeito_no_espelho');
                              if (r.ok) onMudou(); else setErro(r.erro ?? 'Não foi possível desconciliar.');
                            } : undefined,
                            motivo: 'sem grupo: desconcilie cada extrato nas linhas abaixo' },
                        ]} />
                      </tr>
                      {/* ⚠ FILHAS DO LADO DO BANCO e `↰` no meio: a seta aponta para o OFX porque
                          é ele que está sendo decomposto. Mesma régua das filhas do 1:N. */}
                      {g.extratos.map((x) => (
                        <tr key={x.extrato.extrato_id} className={cn(H18, CONCILIADA_FILHA, 'border-b border-border/30')} data-conciliada="">
                          <td />
                          <td className={CEL_DATA}>{fmtData(x.extrato.data)}</td>
                          <td className={cn(CEL, 'font-normal text-muted-foreground')} title={x.extrato.historico ?? ''}>{x.extrato.historico ?? '—'}</td>
                          <td className={cn(CEL, 'text-right font-normal tabular-nums', corVal(x.extrato.valor))}>{fmtBRL(x.extrato.valor)}</td>
                          <td className={cn(MEIO, 'font-normal text-muted-foreground')}>↰</td>
                          <td /><td /><td /><td /><td />
                          <CelAcoes itens={[
                            { rotulo: 'Abrir', motivo: 'é um movimento do banco: abra o lançamento acima' },
                            /* ⚠ CONC-N1-DESCONCILIAR-01: o vínculo SEM grupo se desfaz um a um, pela RPC unitária (que recusa
                               membro de grupo — é segura aqui). Com grupo, continua pela linha mãe (grupo ou bloco). */
                            x.grupoId
                              ? { rotulo: 'Desconciliar', motivo: 'desconcilie pela linha do lançamento, acima' }
                              : { rotulo: 'Desconciliar', onClick: async () => {
                                  const r = await desfazerVinculo(x.extrato.extrato_id, 'desfeito_no_espelho');
                                  if (r.ok) onMudou(); else setErro(r.erro ?? 'Não foi possível desconciliar.');
                                } },
                          ]} />
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
                    onIgnorar={() => setIgnorarId(e.extrato_id)}
                    nSugestoes={sugestoesPorLinha.get(e.extrato_id)?.length ?? 0}
                    onSugestoes={() => setSugerir({ extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor })} />
                ))}

                {/* ⚠ NO FIM DO DIA, e depois do sem par: a ordem é a da atenção. O que falta
                    vem antes; o que está explicado e fora do extrato vem depois. */}
                {d.internas.map((si) => (
                  <tr key={si.lancamento_id} className={cn(H18, 'border-b border-border/50 bg-muted/20')}>
                    {/* A data é do lançamento do sistema: desceu da coluna do banco para a do sistema. */}
                    <td />
                    <td />
                    <td className={cn(CEL, 'italic text-muted-foreground')}>— o banco não exporta este movimento</td>
                    <td />
                    <td className={cn(MEIO, 'text-muted-foreground')} title="transferência com conta interna">⇄</td>
                    <td />
                    <td className={cn(CEL, 'text-left font-medium tabular-nums text-muted-foreground')}>{fmtBRL(si.valor_assinado)}</td>
                    <CelDataSistema data={si.data} rotulo="data do lançamento" />
                    <td className={CEL} title={tituloLancamento(si)}>
                      <span className="font-medium text-muted-foreground">{si.descricao ?? '—'}</span>
                      <span className="text-muted-foreground">{' · '}transferência interna · fora do extrato</span>
                    </td>
                    <CelStatus status="realizado" />
                    <CelAcoes itens={[
                      { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(si.lancamento_id) : undefined, motivo: SEM_ABRIR },
                    ]} />
                  </tr>
                ))}

                {d.lancsSemPar.map((sl) => (
                  <LinhaLancSemPar key={sl.lancamento_id} s={sl} mesDoRecorte={mesDoRecorte}
                    marcado={marcado('lancamentos', sl.lancamento_id)}
                    onMarcar={() => alterna('lancamentos', sl.lancamento_id)} onAbrir={onAbrir} />
                ))}

                {/* ⚠ O RESTO NÃO APLICADO — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (R5). O lançamento diz um valor e o banco aplicou
                    menos: o aplicado está no dia do extrato, e o que falta aparece aqui, no dia do lançamento, somando no
                    fechamento — a diferença real. Sem caixa de marcar: não é um lançamento a casar, é o pedaço que falta de um
                    lançamento já casado; o gesto "pagou diferente do programado" é PR próprio. */}
                {d.restos.map((r) => (
                  <tr key={`resto-${r.sis.lancamento_id}`} data-resto="" className={cn(H18, 'border-b border-border/50')}>
                    <td /><td /><td /><td />
                    <td className={cn(MEIO, 'font-semibold text-destructive')} title="parte do lançamento sem extrato">!</td>
                    <td />
                    <td className={cn(CEL, 'text-left font-medium tabular-nums', corVal(Math.sign(r.sis.valor_assinado || 1) * r.resto))}>
                      {fmtBRL(Math.sign(r.sis.valor_assinado || 1) * r.resto)}
                    </td>
                    <CelDataSistema data={r.sis.data} rotulo="data do lançamento" />
                    <td className={CEL}
                      title={`aplicado abaixo do lançamento: o lançamento vale ${fmtBRL(r.sis.valor_assinado)} e os extratos desta conta aplicam ${fmtBRL(r.aplicado)}; falta ${fmtBRL(r.resto)} · ${tituloLancamento(r.sis) ?? ''}`}>
                      <span className="text-amber-600" data-aviso="sub-aplicado">aplicado abaixo do lançamento{' · '}</span>
                      <span className="text-muted-foreground">resto de {fmtBRL(r.sis.valor_assinado)}{' · '}</span>
                      {textoLancamento(r.sis, mesDoRecorte)}
                    </td>
                    <CelStatus status="realizado" />
                    <CelAcoes itens={[
                      { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(r.sis.lancamento_id) : undefined, motivo: SEM_ABRIR },
                    ]} />
                  </tr>
                ))}

                {/* ⚠ OS CANDIDATOS DO DIA, LOGO ABAIXO DO EXTRATO DELE — PR-ESPELHO-CANDIDATOS-
                    POR-DATA-05. Eles viviam num POOL no fim da mesa, depois de todos os dias: o
                    operador via um movimento do banco em 04/09 e precisava rolar até o fim para
                    achar o agendado do mesmo 04/09 que talvez fosse o par. Agora estão a uma
                    linha de distância.
                    ⚠ E FICAM DEPOIS DO FECHAMENTO? NÃO — ficam ANTES dele e FORA da soma. O
                    `d.banco` e o `d.sistema` não os contam (ver `DiaConf.candidatos`), então o
                    "confere" do dia é exatamente o mesmo de antes deste PR. Estar na vizinhança
                    não é estar na conta.
                    ⚠ `mostrarCandidatos` MANDA AQUI, como mandava no pool: o modal-fecho passa
                    `false` e não vê candidato nenhum. `montarMesa` agrupa sempre; quem decide
                    mostrar é o render. */}
                {mostrarCandidatos && d.candidatos.map((c) => (
                  <LinhaCandidato key={c.lancamento_id} c={c} falta={faltaDe(c.lancamento_id, c.valor)}
                    marcado={marcado('lancamentos', c.lancamento_id)}
                    onMarcar={() => alterna('lancamentos', c.lancamento_id)} onAbrir={onAbrir} />
                ))}

                {/* ⚠ DIA SÓ DE CANDIDATO NÃO TEM O QUE FECHAR — PR-ESPELHO-VENCIDOS-NO-TOPO-08.
                    Com os "a vencer" criando o próprio dia (o 25/09 sem OFX, por exemplo), passou
                    a existir dia com ZERO linha realizada. Uma linha de "fechamento 25/09" ali
                    diria `0,00 · 0,00 · confere` — e um "confere" sobre um dia em que nada
                    aconteceu é a afirmação mais vazia que esta tela poderia fazer: ela parece
                    conferência e não conferiu nada.
                    ⚠ O TESTE É PELAS LINHAS REALIZADAS, não pelos totais: um dia pode fechar em
                    zero tendo movimento (entrada e saída que se anulam), e esse fecha de verdade.
                    Olhar `banco === 0 && sistema === 0` esconderia justamente esse caso. */}
                {(d.pareados.length > 0 || d.paredosN1.length > 0 || d.extratosSemPar.length > 0
                  || d.lancsSemPar.length > 0 || d.internas.length > 0 || d.restos.length > 0) && (
                <tr className={cn(H18, 'bg-primary/10 border-t border-b border-border')}>
                  <td colSpan={3} className={cn(CEL, 'font-semibold text-primary')}>fechamento {fmtData(d.data)}</td>
                  <td className={cn(CEL, 'text-right font-semibold tabular-nums text-primary')}>{fmtBRL(d.banco)}</td>
                  <td className={MEIO} />
                  <td />
                  {/* ⚠ NO FECHAMENTO O AZUL VENCE O VERMELHO/VERDE: a linha inteira é subtotal, e o
                      sinal já está no número. Colorir por sinal aqui faria o subtotal competir
                      visualmente com os movimentos que ele resume. */}
                  <td className={cn(CEL, 'text-left font-semibold tabular-nums text-primary')}>{fmtBRL(d.sistema)}</td>
                  <td />
                  {/* ⚠ A DIFERENÇA OCUPA DESCRIÇÃO + STATUS + AÇÕES (colSpan 3) — fix2: com o selo de 8px a coluna de
                      status encolheu, e status + ações já não cabem "diferença -134.613,84" (106,6px a 9,5px semibold +
                      10 de padding). Na linha de fechamento a descrição é vazia, então o texto vai inteiro, à direita. */}
                  <td colSpan={3} className="px-[5px] whitespace-nowrap text-right font-semibold">
                    {/* ⚠ TOLERÂNCIA ZERO — PR-CONCILIACAO-TOLERANCIA-ZERO-02. */}
                    {saldoConfere(d.banco - d.sistema)
                      ? <span className="text-emerald-600">confere</span>
                      : <span className="text-amber-600">diferença {fmtBRL(d.banco - d.sistema)}</span>}
                  </td>
                </tr>
                )}
              </React.Fragment>
            ))}

          </tbody>
        </table>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-1 text-[9.5px] text-muted-foreground">
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
                <tr key={ig.extrato_id} className="h-[18px] border-b border-border/30">
                  <td className={cn(CEL_DATA, 'w-[44px]')}>{fmtData(ig.data)}</td>
                  <td className={cn(CEL, 'text-[9.5px]')} title={ig.historico ?? ''}>{ig.historico ?? '—'}</td>
                  <td className={cn(CEL, 'w-[96px] text-right text-[9.5px] tabular-nums', corVal(ig.valor))}>{fmtBRL(ig.valor)}</td>
                  <td className={cn(CEL, 'w-[38%] text-[9.5px] italic text-muted-foreground')} title={ig.motivo ?? ''}>
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

      {/* ⚠ DESFAZER BLOCO — CONC-BLOCOS-TELA-01: passo inline, no lugar da barra, com motivo obrigatório. A recusa da RPC
          aparece aqui, em vermelho — nunca em toast. */}
      {desfazendoBloco && (
        <div className="shrink-0 border-t-2 border-t-destructive bg-card px-3.5 py-1.5" data-testid="passo-desfazer-bloco">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold">Desfazer bloco</span>
            <span className="text-[10px] text-muted-foreground">os vínculos saem e cada lançamento volta ao status e à data de antes</span>
            <input value={motivoDesfazer} onChange={(e) => setMotivoDesfazer(e.target.value)} placeholder="Motivo *"
              aria-label="Motivo do desfazer" className="h-[22px] w-64 rounded border px-1.5 text-[11px]" />
            <button type="button" onClick={() => { void desfazerBlocoAgora(); }} disabled={desfazendo}
              className="h-[22px] rounded bg-destructive px-2 text-[11px] font-medium text-destructive-foreground disabled:opacity-50">
              {desfazendo ? 'Desfazendo…' : 'Desfazer'}
            </button>
            <button type="button" onClick={() => setDesfazendoBloco(null)} className="text-[11px] underline underline-offset-2 text-muted-foreground">Cancelar</button>
            <span className="text-[10px] text-destructive" data-testid="erro-desfazer-bloco">{erroDesfazer ?? ''}</span>
          </div>
        </div>
      )}

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
              {sentido === 'bloco' && <span className="ml-2 opacity-80">bloco: N extratos × M lançamentos</span>}
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
              {/* ⚠ "MAIS ANTIGO PRIMEIRO" COM QUALQUER SELEÇÃO — CONC-BLOCOS-TELA-01: o operador que escolhe a regra abre a
                  variante bloco já nela (o depósito que paga duas vendas e deixa uma parcial). */}
              {sentido !== 'bloco' && sel.extratos.size >= 1 && sel.lancamentos.size >= 1 && (
                <button type="button" onClick={() => abrirBloco('mais_antigo_primeiro')}
                  title="Abre o bloco com a regra Mais antigo primeiro: o último lançamento pode ficar parcial"
                  className="rounded bg-primary-foreground/20 px-2 py-0.5 text-[11px] hover:bg-primary-foreground/30">
                  Mais antigo primeiro…
                </button>
              )}
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
          <div className="rounded border bg-card px-2 py-0.5 text-[9.5px] shadow">
            {arrastando ? (arrastando.descricao ?? '—') : (arrastandoExt?.historico ?? '—')}
            <span className={cn('ml-2 font-medium tabular-nums',
              corVal(arrastando ? arrastando.valor_assinado : (arrastandoExt?.valor ?? 0)))}>
              {fmtBRL(arrastando ? arrastando.valor_assinado : arrastandoExt?.valor)}
            </span>
          </div>
        )}
      </DragOverlay>

      {/* ⚠ "casar" NUMA SUGESTÃO ABRE O MESMO `CasarComBancoModal` do "Criar" e do arrasto, já com os levados. Um
          lançamento de valor diferente abre com o valor do banco no campo ("era R$ X"); a soma abre como está. */}
      <SugestoesCasarModal
        open={!!sugerir}
        onClose={() => setSugerir(null)}
        extrato={sugerir}
        nomeConta={nomeConta}
        sugestoes={(sugerir && sugestoesPorLinha.get(sugerir.extrato_id)) || []}
        onCasar={(s) => {
          if (!sugerir) return;
          const umDiferente = s.lancamentos.length === 1 && s.valorDiferente;
          setCasar({
            extrato: sugerir,
            iniciais: s.lancamentos.map((c) => ({
              lancamento_id: c.lancamento_id, descricao: c.descricao, fornecedor: c.fornecedor,
              valor_assinado: c.valor_assinado, usarValorDoBanco: umDiferente,
              data_vencimento: c.data_vencimento, status_transacao: c.status_transacao,
            })),
          });
          setSugerir(null);
        }}
      />

      <CasarComBancoModal
        open={!!casar}
        onClose={() => setCasar(null)}
        extrato={casar?.extrato ?? null}
        iniciais={casar?.iniciais ?? []}
        nomeConta={nomeConta}
        contaBancariaId={contaId}
        onConciliado={() => { limpar(); onMudou(); }}
      />

      <CasarBlocoModal
        open={!!casarBloco}
        onClose={() => setCasarBloco(null)}
        extratos={(casarBloco?.extratos ?? []).map((e) => ({ extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor }))}
        lancamentos={(casarBloco?.lancs ?? []).map((s) => ({
          lancamento_id: s.lancamento_id, data: s.data, descricao: s.descricao, fornecedor: s.fornecedor ?? null, valor_assinado: s.valor_assinado,
        }))}
        nomeConta={nomeConta}
        regraInicial={casarBloco?.regra ?? 'exato'}
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
  /**
   * Candidatos do sistema (previsto/agendado/programado) na mesa — PR-CONCILIACAO-5-ABAS-01.
   * A aba "Casar lançamentos" os mostra para casar; o modal do Espelho é o FECHO e passa
   * `false`: só realizados.
   */
  mostrarCandidatos?: boolean;
  /** Só a Conferência, sem a fileira das 4 sub-abas — a montagem como aba da Conciliação. */
  soConferencia?: boolean;
  /**
   * A sub-aba aberta, CONTROLADA DE FORA — PR-SISTEMA-BARRA-COMPACTA-01.
   *
   * ⚠ ELA EXISTE PARA A FILEIRA PODER MORAR NA BARRA DE AÇÕES da tela que monta este
   * componente, em vez de dentro dele. A fileira custava 23px de altura no corpo, e esses
   * 23px saíam da Mesa — que é a tela. Na barra de ações eles custam ZERO: lá já há uma linha,
   * com 569px ocupados de ~1.300.
   * ⚠ CONTROLADO OU NÃO, os dois modos valem: sem estas props o componente governa a própria
   * sub-aba (é o que o modal faz). Com elas, quem monta governa — e desenha a fileira onde
   * quiser, usando `ABAS_ESPELHO`.
   * ⚠ E NÃO USEI PORTAL. `createPortal` + `hostBarra` (o padrão do `PastosTab`) resolveria o
   * mesmo, mas exige um `callback ref` no host e move DOM entre árvores; içar o ESTADO é o
   * caminho mais simples e é o idioma React de sempre para "quem manda é quem monta".
   */
  aba?: AbaEspelho;
  onAbaChange?: (a: AbaEspelho) => void;
  /**
   * O dia em que a Conferência abre — PR-CONC-SALDO-UMA-REGUA-02: o link "N dias com diferença" do Status da Conciliação.
   * A mesa rola até o cabeçalho do dia e chama `onDiaFocado` (quem monta limpa o pedido).
   */
  diaFoco?: string | null;
  onDiaFocado?: () => void;
}

/** As quatro visões do mês, na ordem em que se lê o extrato. */
/**
 * A leitura do Espelho de UMA conta no mês — `fn_extratos_espelhados`.
 *
 * ⚠ SAIU DO CORPO DO `EspelhoConciliacaoTab` NO PR-CONC-ENRIQUECER-V2-01, SEM MUDANÇA: a mesma chave e o mesmo
 *   `queryFn`. O Extrato da planilha (Enriquecer) lê o MESMO lado Sistema que a Conferência — dois `useQuery` com a
 *   mesma chave e dois corpos seriam duas donas do mesmo cache.
 */
export function useEspelhadosReais(clienteId: string | null | undefined, contaId: string | null | undefined, anoMes: string) {
  return useQuery({
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
}

export type AbaEspelho = 'conferencia' | 'ofx' | 'sistema' | 'evolucao';
export const ABAS_ESPELHO: readonly { key: AbaEspelho; label: string }[] = [
  { key: 'conferencia', label: 'Conferência' },
  { key: 'ofx', label: 'Extrato (banco)' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'evolucao', label: 'Evolução do saldo' },
] as const;

export function EspelhoConciliacaoTab({ clienteId, contaId, ano, mes, mostrarCandidatos = true, soConferencia = false, aba: abaDeFora, onAbaChange, diaFoco = null, onDiaFocado }: Props) {
  const anoMes = `${ano}-${mes}`;
  /* ⚠ O QUADRO DO TOPO E A ABA SISTEMA LEEM O DONO — PR-CONC-SALDO-UMA-REGUA-02 (D6/D7): a linha da conta de
     `fn_conciliacao_resumo_mes` (com UMA conta ela traz os dias e a lista do sistema). Chamado antes dos retornos
     antecipados abaixo — hook nunca depois de `return`. Sem conta, a consulta não sai. */
  const resumoQ = useResumoMes(clienteId, anoMes, contaId ? [contaId] : []);
  const linhaDono = resumoQ.data?.find((l) => l.nivel === 'conta' && l.conta_id === contaId) ?? null;
  /* ⚠ NASCE EM "Extrato (banco)", NÃO MAIS NA CONFERÊNCIA — PR-CONC-CONFERENCIA-MODAL-01: a
     Conferência virou modal, e nascer nela abriria o Dialog sozinho, sem nada atrás. */
  const [abaEscolhida, setAba] = useState<AbaEspelho>('ofx');
  /* Com `soConferencia` a sub-aba é fixa: a fileira some e nada a troca.
     ⚠ E `abaDeFora` VENCE QUANDO EXISTE: quem monta a fileira na própria barra governa a
     escolha; sem ela, o estado interno continua mandando, como sempre. */
  const aba = soConferencia ? 'conferencia' : (abaDeFora ?? abaEscolhida);
  /* ⚠ A CONFERÊNCIA É UM MODAL POR CIMA DA SUB-ABA QUE ESTAVA ABERTA — PR-CONC-CONFERENCIA-MODAL-01.
     O corpo continua mostrando a anterior, e fechar o modal volta para ela. `soConferencia` (a
     montagem como aba da Conciliação, hoje sem consumidor) segue inline, como sempre foi. */
  const conferenciaEmModal = !soConferencia;
  const [abaAnterior, setAbaAnterior] = useState<Exclude<AbaEspelho, 'conferencia'>>('ofx');
  useEffect(() => { if (aba !== 'conferencia') setAbaAnterior(aba); }, [aba]);
  /* ⚠ "SÓ NÃO CONCILIADOS" VIVE SÓ ENQUANTO O MODAL ESTÁ ABERTO — PR-CONC-SUGESTOES-CASAR-01 (Gabriel, 30/09): fechar a
     Conferência volta a mostrar tudo na próxima abertura. */
  const [soNaoConciliados, setSoNaoConciliados] = useState(false);
  useEffect(() => { if (aba !== 'conferencia') setSoNaoConciliados(false); }, [aba]);
  const abaCorpo = aba === 'conferencia' && conferenciaEmModal ? abaAnterior : aba;
  const fecharConferencia = () => { if (onAbaChange) onAbaChange(abaAnterior); else setAba(abaAnterior); };
  /**
   * "ABRIR" PASSA A EDITAR — PR-ESPELHO-ABRIR-EDITA-09, e a fiação é COPIADA do
   * `AgriDreLavouraTab`, que já fazia isto.
   *
   * ⚠ ERA UM FIM DE LINHA: o `LancamentoLeituraDialog` só lê — não edita, não cancela, não
   * restaura. Quem achava um cru errado no extrato (um `PIX TRANSF EDVALDO` sem fornecedor, por
   * exemplo) via o problema e não podia resolvê-lo daqui; tinha de sair, achar o lançamento
   * noutra tela e voltar. Uma tela que mostra o defeito e não deixa corrigir ensina a ignorá-lo.
   * ⚠ O ESCRITOR É O DO FINANCEIRO — `fin.editarLancamento` / `fin.excluirLancamento`. Nada de
   * salvar próprio: dois escritores para o mesmo lançamento divergem na primeira regra nova.
   */
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);

  /**
   * OS QUATRO CATÁLOGOS DO `LancamentoV2Dialog`.
   *
   * ⚠ ELES NÃO SE CARREGAM SOZINHOS, e esta é a terceira tela a herdar a lição (o
   * `AgriBarterTab`, o `AgriDreCulturaTab` e o `AgriDreLavouraTab` a registraram antes):
   * `useFinanceiroV2` nasce com `contasBancarias`, `fornecedores`, `classificacoes` e `safras`
   * VAZIOS e só os preenche quando alguém chama os `load*`. Lista vazia é lista VÁLIDA —
   * nenhum tipo acusa, o build passa, e o modal abre com "Selecione fornecedor…" e a conta em
   * branco num lançamento que tem os dois. Salvar dali grava nulo por cima de dado bom.
   */
  useEffect(() => {
    void fin.loadContas();
    void fin.loadClassificacoes();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  const catalogosProntos = fin.contasBancarias.length > 0 && fin.fornecedores.length > 0
    && fin.safras.length > 0 && fin.classificacoes.length > 0;

  /* ⚠ O LOADER É O DO FINANCEIRO — `buscarLancamentoPorId` faz a consulta que esta tela
     precisaria repetir, e ter as duas é ter duas donas do mesmo `select`: a primeira coluna que
     uma ganhar, a outra não ganha. Também evita carregar o mês inteiro para editar uma linha. */
  const onAbrirLancamento = (id: string) => {
    void (async () => {
      const linha = await fin.buscarLancamentoPorId(id);
      if (linha) setEditando(linha);
    })();
  };

  const internas = useEspelhoInternas(clienteId, contaId, anoMes);

  const { data, refetch } = useEspelhadosReais(clienteId, contaId, anoMes);

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
  /* ⚠ OS NÚMEROS DO TOPO SÃO DO DONO — PR-CONC-SALDO-UMA-REGUA-02 (D6). Eram `totaisDoEspelho` sobre o espelho a valor
     cheio: no Emerson (NJ Sicredi Lavoura, set/26) o quadro dizia −1.344,59 nas saídas e −1.217,01 nas entradas com a
     Conferência conferindo todos os dias. O dono põe a ponta ligada a extrato do LADO DO EXTRATO (a retenção do
     depósito líquido é entrada negativa, e o retido aparece na linha própria) e o parcial pelo aplicado. */
  const fmtOu = (v: number | null | undefined) => (v == null ? '—' : fmtBRL(v));
  const retidoTopo = linhaDono ? fraseDoRetido(linhaDono.retido_em_depositos) : null;

  /* O mesmo elemento vai inline (`soConferencia`) ou dentro do Dialog — um só, nunca dois. */
  const conferencia = (
    <AbaConferencia data={data} anoMes={anoMes} nomeConta={data.escopo.nome_conta ?? undefined}
      clienteId={clienteId} contaId={contaId} internos={internas.lancamentosInternos}
      onAbrir={onAbrirLancamento} onMudou={() => { void refetch(); }}
      mostrarCandidatos={mostrarCandidatos} soNaoConciliados={soNaoConciliados}
      diaFoco={aba === 'conferencia' ? diaFoco : null} onDiaFocado={onDiaFocado} />
  );

  /* "Sem par" também é do dono (a interna fica fora, como já era): extratos com a quantidade E o valor, que a tela
     nunca soube calcular, e lançamentos. */
  const semParExt = linhaDono?.extratos_sem_par ?? null;
  const semParLanc = linhaDono?.lancamentos_sem_par ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A21 — os números não rolam; só a lista de dentro da sub-aba. O título e a conta
          moram no cabeçalho azul do modal, não aqui: repetir seria gastar altura duas vezes. */}
      {/* ⚠ TETO DE 96px NO CABEÇALHO. Cada pixel aqui é uma linha a menos na mesa, e a mesa é a
          tela. O que cede é espaçamento — a informação fica inteira. */}
      <div className="shrink-0 space-y-0.5 px-3.5 py-1">
        {/* ⚠ O TEXTO "N movimentos no extrato · N lançamentos sem par" SAIU — PR-SISTEMA-BARRA-
            COMPACTA-01. Ele custava uma linha inteira do cabeçalho para repetir dois números que
            a grade logo abaixo já dá, na coluna "sem par", e que a Mesa mostra linha a linha.
            Cada pixel daqui é uma linha a menos na Mesa, e a Mesa é a tela. */}
        {/* ⚠ UMA GRADE, NÃO QUATRO CARTÕES. O bloco que ficava ABAIXO da lista dizia isto mesmo,
            e ninguém rolava até lá para ver — enquanto o topo repetia dois dos quatro números
            noutro arranjo. Uma leitura só, no lugar por onde o olho entra, e a altura que
            sobrou foi inteira para a lista. */}
        {/* ⚠ OS SEIS NÚMEROS DESCERAM DE 15px PARA 12px — PR-IMPORTAR-VER-EXTRATO-01, a pedido
            do Gabriel olhando a tela. 15px é tamanho de NÚMERO DE TOPO (a régua A18 reserva
            20px/500 para aquele papel), e estes não são o número de topo: são seis valores de
            CONFERÊNCIA, lidos em par — banco contra sistema. Em 15px ao lado de rótulos de 10px
            eles gritavam sem hierarquizar nada, porque todos os seis gritavam junto.
            ⚠ 12px/500 É A "IDENTIDADE" DA RÉGUA A18, que é exatamente o papel deles, e fica dois
            pontos acima dos rótulos — a hierarquia continua legível. O piso da casa é 9,5px, bem
            abaixo; não se está raspando limite nenhum. */}
        {/* ⚠ TABELA, E NÃO TRÊS COLUNAS ELÁSTICAS — PR-SISTEMA-BARRA-COMPACTA-01, A16: valores
            alinhados em coluna, à direita, em `tabular-nums`. As colunas eram `1fr` e ficavam com
            213px cada; o número usava 75 e os outros 138 eram ar entre o rótulo e o valor, que é
            o que fazia isto parecer texto corrido em vez de tabela.
            ⚠ 92px NÃO É CHUTE: a 11px, "123.456.789,01" (nove dígitos) mede 89,14px e
            "12.500.000,55" mede 82px. 92 cobre nove dígitos com folga — a lição dos 86px que
            cortaram o valor de sete dígitos duas vezes hoje.
            ⚠ E 11px, NÃO 10px: medi os dois. De 12px para 11px o bloco cai 3px (40 → 37); de
            11px para 10px não cai NADA (os rótulos e os `line-height` é que passam a mandar),
            e o número encostaria nos rótulos de 9,5px. Menor sem ganhar altura é só menos
            legível. */}
        {/* ⚠ AGORA É TABELA DE VERDADE — PR-CONC-CONFERENCIA-MODAL-01 (mock v2 do Gabriel): cabeçalho
            navy, linhas de 18px a 10px, borda entre linhas e divisor vertical entre colunas. SÓ LAYOUT:
            os números são os mesmos de `totaisDoEspelho`, e o "sem par" os mesmos contadores de antes,
            com o total dos lançamentos sem par (`totalNaoNoBanco`) na coluna Valor. O dos extratos sem
            par nunca foi calculado — fica "—" em vez de uma conta nova. */}
        {/* ⚠ PR-CONC-SALDO-UMA-REGUA-02 (D6): os seis números, a diferença por lado, o retido e o "sem par" são a LINHA DO
            DONO (`fn_conciliacao_resumo_mes` da conta). A diferença segue o sinal (vermelho negativo, verde positivo) e
            zero fica neutro. A linha "Retido" está SEMPRE presente (vazia é "—"): a altura do quadro não muda com o dado. */}
        <div className="flex flex-wrap items-start gap-3" data-testid="resumo-espelho">
          <table className="border-collapse border border-border text-[10px]" style={{ tableLayout: 'fixed', width: 358 }}>
            <colgroup>
              <col style={{ width: 70 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground">
                <th className="border-r border-primary-foreground/30 px-[5px]" />
                <th className="border-r border-primary-foreground/30 px-[5px] text-center font-medium">Banco (OFX)</th>
                <th className="border-r border-primary-foreground/30 px-[5px] text-center font-medium">Sistema</th>
                <th className="px-[5px] text-center font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              <tr className="h-[18px] border-b border-border">
                <td className="border-r border-border px-[5px] text-muted-foreground">Saídas</td>
                <td className="border-r border-border px-[5px] text-right font-medium tabular-nums whitespace-nowrap text-destructive" data-testid="topo-saidas-banco">{fmtOu(linhaDono?.banco.saidas)}</td>
                <td className="border-r border-border px-[5px] text-right font-medium tabular-nums whitespace-nowrap text-destructive" data-testid="topo-saidas-sistema">{fmtOu(linhaDono?.saidas)}</td>
                <td className={cn('px-[5px] text-right font-medium tabular-nums whitespace-nowrap', corDaDiferenca(linhaDono?.diferenca_saidas))}
                  data-testid="topo-dif-saidas">{fmtOu(linhaDono?.diferenca_saidas)}</td>
              </tr>
              <tr className="h-[18px] border-b border-border">
                <td className="border-r border-border px-[5px] text-muted-foreground">Entradas</td>
                <td className="border-r border-border px-[5px] text-right font-medium tabular-nums whitespace-nowrap text-emerald-600" data-testid="topo-entradas-banco">{fmtOu(linhaDono?.banco.entradas)}</td>
                <td className="border-r border-border px-[5px] text-right font-medium tabular-nums whitespace-nowrap text-emerald-600" data-testid="topo-entradas-sistema">{fmtOu(linhaDono?.entradas)}</td>
                <td className={cn('px-[5px] text-right font-medium tabular-nums whitespace-nowrap', corDaDiferenca(linhaDono?.diferenca_entradas))}
                  data-testid="topo-dif-entradas">{fmtOu(linhaDono?.diferenca_entradas)}</td>
              </tr>
              <tr className="h-[18px]">
                <td className="border-r border-border px-[5px] text-muted-foreground">Retido</td>
                <td colSpan={3} className="overflow-hidden whitespace-nowrap px-[5px] text-muted-foreground" title={retidoTopo?.titulo}
                  data-testid="topo-retido">{retidoTopo ? retidoTopo.texto : '—'}</td>
              </tr>
            </tbody>
          </table>
          <table className="border-collapse border border-border text-[10px]" style={{ tableLayout: 'fixed', width: 216 }}>
            <colgroup><col style={{ width: 70 }} /><col style={{ width: 50 }} /><col style={{ width: 96 }} /></colgroup>
            <thead>
              <tr className="h-[18px] bg-primary text-primary-foreground">
                <th className="border-r border-primary-foreground/30 px-[5px] text-left font-medium">Sem par</th>
                <th className="border-r border-primary-foreground/30 px-[5px] text-center font-medium">Qtde</th>
                <th className="px-[5px] text-center font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="h-[18px] border-b border-border">
                <td className="border-r border-border px-[5px] text-muted-foreground">Extratos</td>
                <td className="border-r border-border px-[5px] text-right tabular-nums" data-testid="topo-sem-par-extratos-qtde">{semParExt ? semParExt.qtde : '—'}</td>
                <td className={cn('px-[5px] text-right font-medium tabular-nums whitespace-nowrap', corDaDiferenca(semParExt?.valor))}
                  data-testid="topo-sem-par-extratos-valor">{fmtOu(semParExt?.valor)}</td>
              </tr>
              <tr className="h-[18px]">
                <td className="border-r border-border px-[5px] text-muted-foreground">Lançamentos</td>
                <td className="border-r border-border px-[5px] text-right tabular-nums" data-testid="topo-sem-par-lancamentos-qtde">{semParLanc ? semParLanc.qtde : '—'}</td>
                <td className={cn('px-[5px] text-right font-medium tabular-nums whitespace-nowrap', corDaDiferenca(semParLanc?.valor))}
                  data-testid="topo-sem-par-lancamentos-valor">{fmtOu(semParLanc?.valor)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ⚠ A FILEIRA SÓ NASCE AQUI QUANDO NINGUÉM A MONTOU FORA — PR-SISTEMA-BARRA-COMPACTA-01.
            É o que o modal faz. Na aba da Conciliação ela vive na barra de ações, onde não custa
            altura, e aí `onAbaChange` chega preenchido. */}
        {!soConferencia && !onAbaChange && (
        <div className="flex flex-wrap gap-1">
          {ABAS_ESPELHO.map((a) => (
            <button key={a.key} type="button" onClick={() => setAba(a.key)}
              className={cn('px-2 py-0.5 rounded text-[10px] border',
                aba === a.key ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground')}>
              {a.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {!conferenciaEmModal && aba === 'conferencia' && conferencia}
      {abaCorpo === 'ofx' && <TabelaExtratoDoMes ofx={data.ofx_completo} inicial={inicial} internas={internas} />}
      {abaCorpo === 'sistema' && <AbaSistemaReal linha={linhaDono} onAbrir={onAbrirLancamento} />}
      {abaCorpo === 'evolucao' && <AbaEvolucaoReal data={data} internos={internas.lancamentosInternos} />}

      {/* ⚠ A CONFERÊNCIA ABRE EM MODAL LARGO — PR-CONC-CONFERENCIA-MODAL-01 (mock v2 do Gabriel). O
          corpo é o MESMO `AbaConferencia`, só que dentro do Dialog: mesmas linhas, marcação, arrasto,
          barra de casar, ignorados e legenda. 96vw × 90vh; cabeçalho de 32px com a conta e o mês, e
          logo abaixo o resumo numa linha de 10px (os mesmos números da tabela do corpo). O cabeçalho
          da mesa é `sticky` dentro do scroller e a legenda fica fora dele — só as linhas rolam. */}
      {conferenciaEmModal && (
        <Dialog open={aba === 'conferencia'} onOpenChange={(v) => { if (!v) fecharConferencia(); }}>
          <DialogContent className="w-[96vw] max-w-[96vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden"
            data-testid="modal-conferencia">
            <div className="flex h-8 shrink-0 items-center justify-between gap-2 bg-primary px-3.5 text-primary-foreground">
              <div className="flex items-center gap-4">
                <DialogTitle className="text-[12px] font-medium">
                  {['Conferência', data.escopo.nome_conta, `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano}`].filter(Boolean).join(' · ')}
                </DialogTitle>
                {/* ⚠ CHECKBOX CLARO, E NÃO O `Segmentado` — PR-CONC-SUGESTOES-CASAR-01. O segmentado marca a escolha em
                    navy, e aqui o fundo JÁ é navy: o selecionado sumiria. É o `Checkbox` da casa com as cores invertidas
                    para o cabeçalho escuro. */}
                <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-medium">
                  <Checkbox checked={soNaoConciliados} onCheckedChange={(v) => setSoNaoConciliados(v === true)}
                    aria-label="Só não conciliados" data-testid="so-nao-conciliados"
                    className="h-3.5 w-3.5 border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary [&_svg]:h-3 [&_svg]:w-3" />
                  Só não conciliados
                </label>
              </div>
              <button type="button" onClick={fecharConferencia} aria-label="Fechar"
                className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="shrink-0 whitespace-nowrap border-b px-3.5 py-[2px] text-[10px] text-muted-foreground">
              {/* Os mesmos números do quadro do topo — os do dono. */}
              Banco saídas <span className="font-medium tabular-nums text-destructive">{fmtOu(linhaDono?.banco.saidas)}</span>
              {' · '}entradas <span className="font-medium tabular-nums text-emerald-600">{fmtOu(linhaDono?.banco.entradas)}</span>
              {'  |  '}Sistema saídas <span className="font-medium tabular-nums text-destructive">{fmtOu(linhaDono?.saidas)}</span>
              {' · '}entradas <span className="font-medium tabular-nums text-emerald-600">{fmtOu(linhaDono?.entradas)}</span>
              {'  |  '}Sem par {semParExt?.qtde ?? '—'} extrato{semParExt?.qtde === 1 ? '' : 's'}
              {' · '}{semParLanc?.qtde ?? '—'} lançamento{semParLanc?.qtde === 1 ? '' : 's'}
            </div>
            {aba === 'conferencia' && conferencia}
          </DialogContent>
        </Dialog>
      )}

      {/* ⚠ `carregando={!catalogosProntos}`: esqueleto e Salvar travado até os quatro catálogos
          estarem na mão. Abrir o formulário editável com seletor vazio é o caminho para gravar
          nulo por cima de dado bom — ver o comentário dos catálogos acima.
          ⚠ EDITAR E EXCLUIR VALEM MESMO NO CONCILIADO, decisão do Gabriel: o `refetch` re-avalia
          a mesa, e se o valor mudou e não bate mais, a linha passa a MOSTRAR a divergência.
          Bloquear esconderia o que a tela existe para revelar. */}
      <LancamentoV2Dialog
        open={!!editando}
        carregando={!catalogosProntos}
        lancamento={editando}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          /* O Espelho inteiro vem de UMA RPC: um `refetch` recarrega a mesa, os candidatos, os
             saldos e a evolução de uma vez — não há segunda fonte para sair de sincronia. */
          if (ok) { setEditando(null); await refetch(); }
          return ok;
        }}
        onDelete={async (id, motivo) => {
          /* Motivo da confirmacao do modal — PR-CPR-2A.4. */
          const ok = await fin.excluirLancamento(id, motivo);
          if (ok) { setEditando(null); await refetch(); }
          return ok;
        }}
      />
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
        {/* O modal é o FECHO: só realizados, sem candidatos (PR-CONCILIACAO-5-ABAS-01). */}
        {open && (
          <EspelhoConciliacaoTab clienteId={clienteId} contaId={contaId} ano={ano} mes={mes}
            mostrarCandidatos={false} />
        )}
      </DialogContent>
    </Dialog>
  );
}
