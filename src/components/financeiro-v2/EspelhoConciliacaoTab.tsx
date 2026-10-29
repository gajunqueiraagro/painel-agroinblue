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
import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fechaAoCentavo, TOLERANCIA_CONCILIACAO } from '@/lib/conciliacao/tolerancia';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { iconeOrigemLancamento, LEGENDA_ICONES, rotuloOrigem } from '@/v2/lib/origemLancamento';
import { desfazerVinculo, desfazerGrupo } from '@/hooks/useConciliacaoDoMes';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, notificarLancamentosMudaram, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  CasarComBancoModal, CasarN1Modal, CasarBlocoModal, fraseDaRecusa,
  type ExtratoAlvo, type LevadoInicial, type RegraBloco,
} from '@/components/financeiro-v2/CasarComBancoModal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DecisaoDerivadosDialog } from '@/components/financeiro-v2/DecisaoDerivadosDialog';
import { CriarTransferenciaDialog, type MovimentoParaTransferencia } from '@/components/conciliacao/CriarTransferenciaDialog';
import { CriarTransferenciasLoteDialog } from '@/components/conciliacao/CriarTransferenciasLoteDialog';
import { sugestoesDeTransferencia, porqueDaSugestao, type SugestaoDeTransferencia } from '@/lib/conciliacao/transferenciaDoExtrato';
import { useEspelhoInternas, type EspelhoInternas } from '@/hooks/useEspelhoInternas';
import { porDia } from '@/lib/conciliacao/linhasDoDia';
import { ListaDoMesPorDia, CelSaldoDoDia, TD_LISTA, TD_LISTA_NUM, TD_RODAPE, COLUNA_SALDO, LARGURA_DATA, type ColunaDaLista } from '@/components/conciliacao/ListaDoMesPorDia';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';
import { itensDoDia, contagemDoDia, contagensDaMesa, rotuloDoDia, type FiltroConferencia, type ItemConferencia } from '@/lib/conciliacao/conferenciaDoDia';
import { TH_REGUA } from '@/components/ui/regua-tabela';
import { Segmentado } from '@/components/ui/segmentado';
import {
  TabelaExtratoDoMes, BotoesDoSemPar, EspStatusCell, fmtBRL, fmtData, corValReal,
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
import type { ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';
/* ⚠ A MESA DO DIA MUDOU DE CASA — PR-CONC-CONFERENCIA-FECHAMENTO-DIA: tipos do Espelho, `montarMesa`, `totaisDoEspelho`,
   `sinalDoAplicado` e `ordenar` foram para a lib pura (movidos byte a byte); a tela importa de lá e REEXPORTA, para quem
   já importava daqui (o Extrato da planilha, os testes) não mudar. */
import {
  montarMesa, sinalDoAplicado, ordenar,
  type EspSis, type EspCandidato, type EspelhadosReais, type FilhaConf, type DiaConf, type Pareado, type ParedoN1,
  descricaoComParcela, fraseDaFalta,
} from '@/lib/conciliacao/mesaDoDia';
import { useResumoMes, useReleDonoAoMudarLancamentos } from '@/hooks/useResumoConciliacao';
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
/** P159b (D3) — o sinal da linha do sistema, numa coluna de 22px: ✓ conciliado; ○ âmbar com o status no `title` (realizado sem par no
 *  extrato, parcial com a falta); ⇄ a perna da transferência mãe↔interna (PR-CONC-INTERNA-SEPARADA-01b, D6). */
function SinalDaLinhaSistema({ l }: { l: LinhaSistemaDono }) {
  if (l.tipo === TIPO_TRANSFERENCIA_INTERNA) {
    return <span className="text-muted-foreground" data-testid="sistema-transferencia-interna"
      title="transferência interna · fora do extrato: conta só no saldo próprio desta conta">⇄</span>;
  }
  if (l.status_exibicao === 'conciliado') return <span className="font-bold text-emerald-600" title="conciliado">✓</span>;
  const titulo = l.status_exibicao === 'parcial'
    ? `parcial · falta ${l.falta != null ? formatarFalta(l.falta) : '—'}: programado que o extrato não quitou`
    : 'realizado sem par no extrato';
  return <span className="text-amber-600" title={titulo} data-testid="sistema-nao-conciliado">○</span>;
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
/**
 * P141 (CONC-LAYOUT-01, D3/D4) + P159b (CONC-TELAS-02, mock `mock-sistema-evolucao-v1.html`, Gabriel 28/10) — UM componente: a sub-aba
 * Sistema do Casar lançamentos e o modal "Extrato do sistema" do ↗ (D5: os dois mudam juntos; `modo` só marca onde está).
 * A forma é a do `ListaDoMesPorDia` (D2 do P159a): data dd/mm só na 1ª linha do dia, dentro do dia o maior |valor| primeiro (`porDia`), o
 * saldo SÓ na última linha do dia, em negrito, LIDO do dono (`saldo_apos_proprio` da última linha do dia NA ORDEM DO BANCO — nada se
 * soma aqui), "Saldo inicial (sistema)" no topo e "Saldo final do sistema" no rodapé preso.
 * Colunas (P159e, Gabriel 29/10, mock `mock-casar-abas-v1.html`): Data 70 (dd/mm/aaaa em toda linha) · Descrição 190 · Fornecedor 160 ·
 *   Centro · Subcentro (o resto; o centro em cinza na frente) · Entradas 96 · Saídas 96 · Saldo 100 · ✓ 22 — o dinheiro em TRÊS colunas;
 *   Descrição e Fornecedor cederam (eram 220 e 200): com menos o cabeçalho "Centro · Subcentro" vaza em 1000px (o gate: pede 91).
 *   O rodapé soma Entradas e Saídas nas colunas delas e o saldo final fica NA coluna Saldo.
 * ⚠ D3: o "✓ conciliado" verde repetido virou só o ✓; o NÃO conciliado é um ○ âmbar com o status no `title` (realizado sem par, parcial
 *   com a falta); a perna da transferência interna, o ⇄ (PR-CONC-INTERNA-SEPARADA-01b).
 */
export function AbaSistemaReal({ linha, onAbrir, modo = 'aba' }: {
  linha: LinhaResumo | null; onAbrir?: (lancamentoId: string) => void; modo?: 'aba' | 'grande';
}) {
  if (!linha) {
    return <div className="min-h-0 flex-1 border-t px-3.5 py-6 text-center text-[10px] text-muted-foreground">Carregando o resumo do mês…</div>;
  }
  const dias = porDia(linha.linhas_sistema ?? [], (l) => (l.data ?? '').slice(0, 10), (l) => l.valor);
  const proprio = saldosDaLinha(linha);
  const inicial = proprio.saldo_inicial;
  const final = proprio.saldo_sistema;
  const colunas: ColunaDaLista[] = [
    { titulo: 'Data', largura: LARGURA_DATA }, { titulo: 'Descrição', largura: 190 }, { titulo: 'Fornecedor', largura: 160 },
    { titulo: 'Centro · Subcentro' }, { titulo: 'Entradas', largura: 96, alinhar: 'right' }, { titulo: 'Saídas', largura: 96, alinhar: 'right' },
    { titulo: 'Saldo', largura: 100, alinhar: 'right', id: COLUNA_SALDO }, { titulo: '', largura: 22, alinhar: 'center' },
  ];
  const ICOL_SALDO = 6;
  /* o rodapé soma Entradas e Saídas das linhas (as do dono; nada além delas) */
  const somaEntradas = (linha.linhas_sistema ?? []).reduce((a, l) => a + (l.valor > 0 ? l.valor : 0), 0);
  const somaSaidas = (linha.linhas_sistema ?? []).reduce((a, l) => a + (l.valor < 0 ? l.valor : 0), 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-modo={modo}>
      <ListaDoMesPorDia
        testid="aba-sistema" testidLinha="sistema-linha"
        linhas={dias} colunas={colunas} chave={(r, i) => `${i}-${r.extrato_id ?? ''}-${r.lancamento_id ?? ''}`}
        aoClicar={onAbrir ? (r) => { if (r.lancamento_id) onAbrir(r.lancamento_id); } : undefined}
        saldoInicial={{ rotulo: 'Saldo inicial (sistema)', valor: inicial != null ? fmtBRL(inicial) : '—', coluna: ICOL_SALDO,
          className: corValReal(inicial ?? 0), testid: 'sistema-saldo-inicial' }}
        celulas={(x) => {
          const r = x.item;
          const ultima = x.ultimaDoDiaNaOrigem;
          return (<>
            <td className={cn(TD_LISTA, 'truncate')} title={r.descricao ?? ''}>{r.descricao ?? '—'}</td>
            <td className={cn(TD_LISTA, 'truncate')} title={r.fornecedor ?? ''} data-testid="sistema-fornecedor">{r.fornecedor || '—'}</td>
            <td className={TD_LISTA} title={[r.centro, r.subcentro].filter(Boolean).join(' · ') || undefined} data-testid="sistema-centro">
              <span className="block truncate">
                {r.centro && <span className="text-muted-foreground">{r.centro} · </span>}{r.subcentro || (r.centro ? '' : '—')}
              </span>
            </td>
            {/* P159e: a entrada em Entradas (verde), a saída em Saídas (vermelha); a outra fica vazia */}
            <td className={cn(TD_LISTA_NUM, 'text-emerald-600')} data-testid="sistema-entrada">{r.valor > 0 ? fmtBRL(r.valor) : ''}</td>
            <td className={cn(TD_LISTA_NUM, 'text-rose-600')} data-testid="sistema-saida">{r.valor < 0 ? fmtBRL(r.valor) : ''}</td>
            <CelSaldoDoDia fimDoDia={x.fimDoDia} testid="sistema-saldo"
              saldo={ultima && ultima.saldo_apos_proprio != null ? fmtBRL(ultima.saldo_apos_proprio) : null}
              className={ultima ? corValReal(ultima.saldo_apos_proprio ?? 0) : undefined} />
            <td className={cn(TD_LISTA, 'px-0 text-center')} data-testid="sistema-sinal"><SinalDaLinhaSistema l={r} /></td>
          </>);
        }}
        /* P159e — ALINHAMENTO SOBERANO: o saldo final NA coluna Saldo (era solto na faixa, fora dela); o rótulo e a legenda antes */
        rodape={<tr>
          <td className={TD_RODAPE} />
          <td className={TD_RODAPE}>Saldo final do sistema</td>
          <td colSpan={2} className={cn(TD_RODAPE, 'truncate text-[9.5px] font-normal text-muted-foreground')}
            title="✓ conciliado · ○ não conciliado (o status no mouse) · ordem do dia: maior valor primeiro">
            ✓ conciliado · <span className="text-amber-600">○</span> não conciliado (o status no mouse) · ordem do dia: maior valor primeiro
          </td>
          <td className={cn(TD_RODAPE, 'text-right tabular-nums text-emerald-600')} data-testid="sistema-soma-entradas">{fmtBRL(somaEntradas)}</td>
          <td className={cn(TD_RODAPE, 'text-right tabular-nums text-rose-600')} data-testid="sistema-soma-saidas">{fmtBRL(somaSaidas)}</td>
          <td className={cn(TD_RODAPE, 'text-right tabular-nums', corValReal(final ?? 0))} data-testid="sistema-saldo-final"
            data-alinha-coluna={COLUNA_SALDO}>{final != null ? fmtBRL(final) : '—'}</td>
          <td className={TD_RODAPE} />
        </tr>}
      />
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
  /* P159b (D4) — o dia com ALGUMA linha na mesa (do banco ou do sistema; o candidato não é movimento). Um dia de +100 e −100 soma 0,00
     e tem linha: ele fica. */
  const temLinha = Array<boolean>(nDias + 1).fill(false);
  for (const d of montarMesa(data, internos)) {
    const n = dia(d.data);
    if (n >= 1 && n <= nDias) {
      movOfx[n] += d.banco; movSis[n] += d.sistema;
      if (d.pareados.length || d.paredosN1.length || d.extratosSemPar.length || d.lancsSemPar.length || d.internas.length || d.restos.length) temLinha[n] = true;
    }
  }
  const rows: { dia: number; movOfx: number; movSis: number; saldoOfx: number; saldoSis: number; dif: number; difDia: number; nasce: boolean; temLinha: boolean }[] = [];
  let accO = inicial, accS = inicial, nasceu = false;
  for (let d = 1; d <= nDias; d++) {
    accO += movOfx[d]; accS += movSis[d];
    const dif = accO - accS;
    const nasce = Math.abs(dif) >= 0.005 && !nasceu;
    if (nasce) nasceu = true;
    /* P159b (B2) — a diferença DO DIA é a subtração das duas colunas do mesmo dia (= a variação da acumulada); nada novo é somado */
    rows.push({ dia: d, movOfx: movOfx[d], movSis: movSis[d], saldoOfx: accO, saldoSis: accS, dif, difDia: movOfx[d] - movSis[d], nasce, temLinha: temLinha[d] });
  }
  return rows;
}
/**
 * P159b (CONC-TELAS-02, mock `mock-sistema-evolucao-v1.html`) — a Evolução do saldo: colunas de largura FIXA e juntas (Dia 52 · Mov. banco ·
 * Mov. sistema · Saldo banco · Saldo sistema 104 cada · Dif. do dia 96 · Dif. acumulada 104 · o resto livre). O dia em que a diferença
 * MUDA (Dif. do dia ≠ 0) fica em âmbar, com o link "ver o dia na Conferência" (abre a Conferência já naquele dia); "a diferença nasce
 * aqui" no 1º dia com diferença acumulada. Os dias SEM NENHUMA linha somem (D4); a caixinha os traz de volta. Rodapé preso.
 * ⚠ A EVOLUÇÃO LÊ A MESMA MESA (`montarEvolucao`): herda a regra da conta interna sem repeti-la.
 */
export function AbaEvolucaoReal({ data, internos, onVerDia }: {
  data: EspelhadosReais; internos: ReadonlySet<string>;
  /** "ver o dia na Conferência": quem monta abre a Conferência rolada no dia ('aaaa-mm-dd') */
  onVerDia?: (dia: string) => void;
}) {
  const rows = useMemo(() => montarEvolucao(data, internos), [data, internos]);
  const [comVazios, setComVazios] = useState(false);
  const ym = data.saldos.periodo_ini ? data.saldos.periodo_ini.slice(0, 7) : '';
  const mm = ym.slice(5, 7);
  const vazios = rows.filter((r) => !r.temLinha).length;
  const visiveis = comVazios ? rows : rows.filter((r) => r.temLinha);
  const larguras = [52, 104, 104, 104, 104, 96, 104, null];
  const td = 'h-[19px] px-[5px] py-0 text-[10.5px] leading-[18px] whitespace-nowrap overflow-hidden';
  const num = cn(td, 'text-right tabular-nums');
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      {/* a caixinha fica FORA da tabela e acima dela, num lugar fixo: ligar e desligar não mexe nas colunas */}
      <div className="flex h-[24px] shrink-0 items-center px-[5px] text-[10px] text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-1.5">
          <Checkbox checked={comVazios} onCheckedChange={(v) => setComVazios(v === true)} className="h-3.5 w-3.5" data-testid="evolucao-mostrar-vazios" />
          mostrar dias sem movimento ({vazios})
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-testid="evolucao-lista">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup>{larguras.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead className="sticky top-0 z-[3] bg-primary">
            <tr>
              {['Dia', 'Mov. banco', 'Mov. sistema', 'Saldo banco', 'Saldo sistema', 'Dif. do dia', 'Dif. acumulada', ''].map((t, i) => (
                <th key={i} className={cn(TH_REGUA, 'px-[5px]', i === 0 || i === 7 ? 'text-left' : 'text-right')}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => {
              const muda = Math.abs(r.difDia) >= 0.005;
              const difZero = Math.abs(r.dif) < 0.005;
              const iso = `${ym}-${String(r.dia).padStart(2, '0')}`;
              const cel = cn('border-b border-border/50', muda && 'bg-amber-50 dark:bg-amber-950/20');
              return (
                <tr key={r.dia} data-testid="evolucao-dia" data-muda={muda ? 'sim' : undefined}>
                  <td className={cn(td, cel, 'tabular-nums text-muted-foreground')}>{String(r.dia).padStart(2, '0')}/{mm}</td>
                  <td className={cn(num, cel, r.movOfx === 0 ? 'text-muted-foreground' : corValReal(r.movOfx))}>{fmtBRL(r.movOfx)}</td>
                  <td className={cn(num, cel, r.movSis === 0 ? 'text-muted-foreground' : corValReal(r.movSis))}>{fmtBRL(r.movSis)}</td>
                  <td className={cn(num, cel, corValReal(r.saldoOfx))}>{fmtBRL(r.saldoOfx)}</td>
                  <td className={cn(num, cel, corValReal(r.saldoSis))}>{fmtBRL(r.saldoSis)}</td>
                  <td className={cn(num, cel, muda ? 'font-bold text-amber-700' : 'text-muted-foreground')} data-testid="evolucao-dif-dia">{muda ? fmtBRL(r.difDia) : '—'}</td>
                  <td className={cn(num, cel, difZero ? 'text-muted-foreground' : 'font-medium text-rose-600')}>{fmtBRL(r.dif)}</td>
                  {/* a coluna livre: na janela estreita (1000px) o link e a frase não cabem juntos — a REGRA DE CORTE da tabela: uma linha
                      com "…" e o texto inteiro no `title` (o link vem primeiro) */}
                  <td className={cn(td, cel)} title={[muda && onVerDia ? 'ver o dia na Conferência' : null, r.nasce ? 'a diferença nasce aqui' : null].filter(Boolean).join(' ') || undefined}>
                    <span className="block truncate">
                      {muda && onVerDia && (
                        <button type="button" className="text-[10px] text-blue-700 underline underline-offset-2" data-testid="evolucao-ver-dia"
                          onClick={() => onVerDia(iso)}>ver o dia na Conferência</button>
                      )}
                      {r.nasce && muda && onVerDia && ' '}
                      {r.nasce && <span className={cn('text-[10px] font-semibold text-rose-700', muda && onVerDia && 'ml-2')} data-testid="evolucao-nasce">a diferença nasce aqui</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* ⚠ PRESO NO RODAPÉ e com fundo opaco: é a fronteira do que o banco cobre. "DATA DO EXTRATO" é o mesmo `extrato_fim` de sempre. */}
      <div className="flex h-[23px] shrink-0 items-center gap-3.5 overflow-hidden whitespace-nowrap border-t bg-muted px-[5px] text-[10.5px]" data-testid="evolucao-rodape">
        <span className="shrink-0">Data do extrato {data.saldos.extrato_fim ? fmtData(data.saldos.extrato_fim) : '—'}
          {' · '}saldo final oficial (extrato){' '}<b className="tabular-nums">{fmtBRL(data.saldos.final_oficial)}</b></span>
        <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground"><span className="text-amber-700">âmbar</span> = dia em que a diferença muda</span>
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
/* CONC-SPLIT-FILHO-CANCELADO-01 passo 1: o extrato cujos vínculos vivos somam MENOS que o banco NÃO está casado — é o caso do
   filho de desmembramento cancelado (o extrato fica 'parcial'). A linha desenha "!" e diz quanto falta; ✓ e "Conciliado" são
   afirmações, e aqui seriam falsas. `diferenca` é a da linha (`montarMesa`: |extrato| − |soma|); só o que FALTA entra aqui —
   soma maior que o banco é o "aplicado acima do lançamento", que já tem aviso próprio. */
export const SINAL_PARCIAL = { simbolo: '!', cor: 'text-destructive', titulo: 'extrato parcial: os lançamentos somam menos que o banco' };
export function faltaDoExtrato(diferenca: number): number | null {
  return diferenca > TOLERANCIA_CONCILIACAO ? Math.round(diferenca * 100) / 100 : null;
}
export const MOTIVO_EXTRATO_PARCIAL = 'extrato parcial — desfaça o desmembramento na Mesa (em breve aqui)';

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
    <td className="h-[18px] px-[3px] py-0 text-right whitespace-nowrap" data-testid="acoes-da-linha">
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

/* P159a: a divisória banco | sistema e a régua das linhas da Conferência estão em `SEP`/`TDC` (abaixo); estas duas servem à lista
   dos ignorados. */
const CEL = 'px-[5px] overflow-hidden text-ellipsis whitespace-nowrap';
/* ⚠ A DATA NUNCA ENCOLHE. Com `text-ellipsis` numa coluna de 36px, "16/07" virava "16/…" —
   e data cortada não é data. 38px cabe o formato inteiro a 10px ("30/09" mede 29,5), e a
   célula não corta. */
const CEL_DATA = 'px-[4px] whitespace-nowrap text-[9.5px] text-muted-foreground';
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
/** P159a — o selo, numa `span` (mora no fim do Subcentro); só no que NÃO está conciliado (quem chama decide). */
function SeloStatus({ status }: { status: string | null }) {
  const k = (status ?? '').trim().toLowerCase();
  const p = paletaDoStatus(k);
  const rotulo = k === 'conciliado' ? 'Conciliado' : k === 'parcial' ? 'Parcial' : (STATUS_FILTRO_LABEL[k] ?? (status || ''));
  return (
    <span className="shrink-0 whitespace-nowrap" data-status={k || undefined}>
      {k === 'parcial' ? <span className={cn(SELO_CONFERENCIA_TEXTO, 'text-amber-700')}>{rotulo}</span>
        : !p ? <span className={cn(SELO_CONFERENCIA_TEXTO, 'text-muted-foreground')}>{rotulo}</span>
        : p.comCaixa ? <span className={cn(SELO_CONFERENCIA, p.pilula)}>{rotulo}</span>
        : <span className={cn(SELO_CONFERENCIA_TEXTO, p.texto)}>{rotulo}</span>}
    </span>
  );
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
/* ⚠ P159a: a Descrição do mock tem 170px (160 úteis; ~32 caracteres a 9,5px), e este limite foi medido para 296. Ele NÃO mudou
   (decisão pendente do Gabriel): o aviso longo agora termina em "…" na célula, com a frase inteira no `title`. */
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

/* ═══ P159a (CONC-TELAS-01, mock `mock-conferencia-v1.html` aprovado pelo Gabriel 28/10 09:52) — A RÉGUA NOVA DA CONFERÊNCIA ══════
   8 colunas de largura FIXA: Banco · histórico 270 · Valor 84 · ✓/○/⇄ 20 · Sistema (valor) 84 · Descrição 170 · Favorecido 170 ·
   Subcentro (o resto) · ⋯ 22. Fonte 10,5px, linha 19px. Uma informação por coluna; texto longo termina em "…" com o inteiro no `title`.
   ⚠ O QUE O MOCK NÃO DESENHA E A TELA TEM (as funções de hoje ficam, ENCAIXE item 4): a marcação e a alça de arrasto moram num lugar
     FIXO de 24px no começo do histórico do banco (vazio quando a linha não se marca, para o texto começar sempre no mesmo ponto) e no
     começo da Descrição do que se marca do lado do sistema; o selo de status, só no que NÃO está conciliado, no fim do Subcentro; o
     vencimento do candidato vencido, na frente da Descrição. A data do lançamento saiu da linha (o dia está no cabeçalho; a data
     diferente da do banco já é o aviso "lançado em"). */
/* ⚠ VALOR E SISTEMA COM 96, NÃO OS 84 DO MOCK: número nunca corta, e o teto (-99.999.999,99) a 10,5px tabular pede 82px + 10 de
   respiro (medido na bancada 28/10; o mock usou os valores do NJ, até -200.000,00). É a mesma largura do Valor do Extrato (banco). */
/* P159e (Gabriel 29/10 08:17, URGENTE): o EXTRATO é a coluna que fica com o resto (como antes do P159a, quando era a flexível) — o
   nome do extrato inteiro de 1366px para cima; o lado do sistema cede (Descrição 180 · Favorecido 140 · Subcentro 140, que cortam com
   "…" + title antes do nome do banco). Valor 96 e Sistema 96 (o teto), o sinal 20, as ações 22. */
export const LARGURAS_CONFERENCIA: readonly (number | null)[] = [null, 96, 20, 96, 180, 140, 140, 22];
/* a soma das fixas (694) + 250 de piso para o extrato: abaixo disso a mesa rola na horizontal dentro do modal */
const PISO_DA_MESA = 944;
/* P159e (mock `mock-casar-abas-v1.html`): a LINHA de movimento 18px a 10px (era 19 a 10,5 desde o P159a); o dia e o fechamento 22px (`TDC_DESTAQUE`) */
const TDC = 'h-[18px] px-[5px] py-0 text-[10px] leading-[17px] whitespace-nowrap overflow-hidden text-ellipsis';
const TDC_NUM = cn(TDC, 'text-right tabular-nums');
const TDC_MEIO = 'h-[18px] px-0 py-0 text-center text-[10px] leading-[17px] whitespace-nowrap';
/** a divisória banco | sistema: 2px navy à esquerda do valor do sistema, em toda linha (é o que a faz contínua) */
const SEP = 'border-l-2 border-l-primary';
/** o fornecedor e o subcentro não vão em cinza claro (PR-ESPELHO-CONFERENCIA-FONTE-07: é o que se lê para ter certeza do par) */
const TEXTO_LIDO = 'text-foreground/80';

/** Um pedaço de texto da Descrição. O `title` da célula é a junção de todos (o detector de corte confere o texto inteiro nele). */
interface Pedaco { t: string; cls?: string; testid?: string; aviso?: string; title?: string }
const textoDe = (ps: readonly Pedaco[]) => ps.map((p) => p.t).join('');
function Pedacos({ ps }: { ps: readonly Pedaco[] }) {
  return <>{ps.map((p, i) => <span key={i} className={p.cls} data-testid={p.testid} data-aviso={p.aviso} title={p.title}>{p.t}</span>)}</>;
}
/** Os avisos do vínculo ANTES da descrição (a célula corta no fim, e o aviso nunca é o pedaço cortado): a escada `textosDosAvisos`. */
function pedacosDosAvisos(a: AvisosVinculo): Pedaco[] {
  return textosDosAvisos(a).map((i) => ({ t: `${i.texto} · `, aviso: i.tipo,
    cls: cn('text-[9.5px]', i.tipo === 'parte' ? 'text-muted-foreground' : 'text-amber-600') }));
}
/** A descrição do lançamento (com a parcela da OC), a competência quando é de outro mês, a origem quando sem par e a ponta que falta. */
function pedacosDoLancamento(s: EspSis | undefined, mesDoRecorte: string, semPar = false): Pedaco[] {
  if (!s) return [{ t: '—', cls: 'text-muted-foreground' }];
  const comp = s.competencia && s.competencia.slice(0, 7) !== mesDoRecorte
    ? `${MESES_CURTOS[Number(s.competencia.slice(5, 7)) - 1] ?? ''}/${s.competencia.slice(2, 4)}` : null;
  return [
    { t: descricaoComParcela(s.descricao, s.oc_parcela) ?? '—', cls: 'font-medium' },
    ...(comp ? [{ t: ` · competência ${comp}`, cls: 'text-muted-foreground' }] : []),
    ...(semPar && s.origem_lancamento ? [{ t: ` · ${rotuloOrigem(s.origem_lancamento)}`, cls: 'text-muted-foreground' }] : []),
    /* CONC-TRANSF-DUAS-PONTAS-01: a transferencia com uma ponta so' diz qual falta (a frase vem do banco) */
    ...(s.pontas && !(s.pontas.origem && s.pontas.destino) ? [{ t: ` · ${s.pontas.frase}`, cls: 'text-amber-700', testid: 'pontas-transferencia' }] : []),
  ];
}
/** A origem (B, ↺, ✓ enriquecido, M…), discreta, depois da descrição — a régua é `iconeOrigemLancamento`. */
function pedacoDaOrigem(tipo: string | null): Pedaco[] {
  const icone = iconeDoLancamento(tipo);
  return icone ? [{ t: ` ${icone.simbolo}`, cls: 'text-[9.5px] text-muted-foreground', title: icone.significado }] : [];
}

/** A marcação + a alça de arrasto, num lugar FIXO de 24px. */
function Marcar({ marcado, onMarcar, rotulo, alcaId }: { marcado?: boolean; onMarcar?: () => void; rotulo?: string; alcaId?: string }) {
  return (
    /* P159e: sem largura fixa — a caixinha e a alça ficam coladas à esquerda, sem recuo */
    <span className="inline-flex shrink-0 items-center gap-[3px]">
      {onMarcar && <input type="checkbox" className="h-3 w-3 shrink-0" checked={!!marcado} onChange={onMarcar} aria-label={rotulo} />}
      {alcaId && <Alca id={alcaId} />}
    </span>
  );
}

/** O histórico do banco: [marcação 24] [hora 28] texto limpo (`historicoDoBanco`)… — o `title` leva o limpo e o inteiro do banco. */
function CelHistorico({ historico, data, marcar, nota, apagado }: {
  historico?: string | null; data?: string | null; marcar?: ReactNode;
  /** a linha sem extrato: a frase em itálico no lugar do histórico */
  nota?: string; apagado?: boolean;
}) {
  const h = historicoDoBanco(historico, data);
  const original = historico ?? '';
  const semBanco = nota !== undefined;
  const titulo = semBanco ? undefined : h.texto && h.texto !== original ? `${h.texto}\n${original}` : original || undefined;
  return (
    <td className={cn(TDC, apagado && 'text-muted-foreground')} title={titulo}>
      <span className="flex min-w-0 items-center gap-[3px]">
        {/* P159e: SEM RECUO — sem o lugar vazio de 24px quando não há caixinha, e a hora só ocupa lugar quando o banco a trouxe */}
        {marcar}
        {!semBanco && h.hora && <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground" data-testid="conf-hora">{h.hora}</span>}
        {/* sem lado do banco (o candidato, a filha, o N:1): a célula fica vazia, ou com a frase (`nota`) em itálico */}
        {semBanco
          ? <span className="min-w-0 flex-1 truncate italic text-muted-foreground">{nota}</span>
          : <span className="min-w-0 flex-1 truncate" data-testid="conf-historico">{h.texto || '—'}</span>}
      </span>
    </td>
  );
}

/** As três colunas de texto do sistema: Descrição ([marcação] pedaços… [chips]) · Favorecido · Subcentro (+ o selo do não conciliado). */
function CelulasDoSistema({ marcar, pedacos, detalhe, fornecedor, subcentro, selo, chips, apagado }: {
  marcar?: ReactNode; pedacos: readonly Pedaco[];
  /** o que mais vai no `title` da Descrição (a frase inteira dos avisos, o documento…) */
  detalhe?: string | null;
  fornecedor: string | null | undefined; subcentro: string | null | undefined;
  selo?: ReactNode; chips?: ReactNode; apagado?: boolean;
}) {
  const texto = textoDe(pedacos);
  return (<>
    <td className={cn(TDC, apagado && 'text-muted-foreground')} title={[texto, detalhe].filter(Boolean).join('\n') || undefined} data-testid="conf-descricao">
      <span className="flex min-w-0 items-center gap-[3px]">
        {marcar}
        <span className="min-w-0 flex-1 truncate"><Pedacos ps={pedacos} /></span>
        {chips}
      </span>
    </td>
    <td className={cn(TDC, apagado ? 'text-muted-foreground' : TEXTO_LIDO)} title={fornecedor || undefined} data-testid="conf-favorecido">{fornecedor || '—'}</td>
    <td className={TDC} title={subcentro || undefined}>
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn('min-w-0 flex-1 truncate', apagado ? 'text-muted-foreground' : TEXTO_LIDO)} data-testid="conf-subcentro">{subcentro || '—'}</span>
        {selo}
      </span>
    </td>
  </>);
}

/**
 * ⚠ CADA LINHA É UM COMPONENTE PORQUE O @dnd-kit É HOOK. `useDroppable`/`useDraggable` não
 * podem ser chamados dentro de um `.map()` — a regra dos hooks proíbe, e o React quebraria ao
 * mudar a contagem de linhas entre renders. Extrair não foi estética: era a única forma.
 */
function LinhaExtratoSemPar({ e, marcado, onMarcar, onCriar, onIgnorar, nSugestoes, onSugestoes, onCriarTransferencia, transf }: {
  e: EspOfx; marcado: boolean; onMarcar: () => void; onCriar: () => void; onIgnorar: () => void;
  /** P139 — "Criar transferência" direto do "⋯" (sem os três cliques do Criar → diferença → tipo) */
  onCriarTransferencia?: () => void;
  /** P139 — a sugestão do banco (`fn_extrato_transferencias_provaveis`): o selo "transf.?" no lugar do "○", com o porquê no `title` */
  transf?: SugestaoDeTransferencia;
  nSugestoes: number; onSugestoes: () => void;
}) {
  /* ⚠ A MESMA LINHA É ALVO E ORIGEM. Alvo quando um lançamento vem por cima (1:N); origem
     quando ELA é arrastada sobre um lançamento (N:1). São dois nós do @dnd-kit no mesmo
     `<tr>`: o droppable envolve a linha, o draggable mora só na alça. */
  const { isOver, setNodeRef } = useDroppable({ id: `ext:${e.extrato_id}` });
  return (
    /* P159a: o sem par em destaque e os dois botões na própria linha — os mesmos "Ver sugestões" e "Criar" do "⋯".
       P159d (Gabriel 29/10, SÓ COR): sem o fundo amarelo — a linha é BRANCA e o destaque é um traço âmbar à esquerda (sombra interna:
       nenhuma medida muda) e o "sem lançamento" em âmbar. */
    <tr ref={setNodeRef} data-extrato-sem-par="" className={cn('border-b border-border/50 bg-background [&>td:first-child]:shadow-[inset_3px_0_0_#d97706]',
      marcado && 'bg-amber-500/15',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <CelHistorico historico={e.historico} data={e.data}
        marcar={<Marcar marcado={marcado} onMarcar={onMarcar} rotulo="Marcar movimento do banco" alcaId={`dragExt:${e.extrato_id}`} />} />
      <td className={cn(TDC_NUM, 'font-medium', corVal(e.valor))}>{fmtBRL(e.valor)}</td>
      {/* P139: o selo "transf.?" ocupa o MESMO lugar do "○" (nada se desloca); o porquê vai no `title` */}
      {transf
        ? <td className={cn(TDC_MEIO, 'text-[9.5px] font-medium text-primary')} title={porqueDaSugestao(transf)} data-testid="selo-transf">⇄?</td>
        : <td className={cn(TDC_MEIO, 'text-muted-foreground')} title="sem correspondência">○</td>}
      <td className={cn(TDC, SEP)} />
      <td colSpan={2} className={cn(TDC, 'text-[#d97706]')} data-testid="conf-sem-lancamento">
        <span className="inline-flex items-center gap-1">sem lançamento ·
          <BotoesDoSemPar e={e} semPar={{ nSugestoes: () => nSugestoes, aoSugestoes: () => onSugestoes(), aoCriar: () => onCriar() }} />
        </span>
      </td>
      <td className={TDC} />
      {/* ⚠ "Criar" ABRE O MODAL COM A LISTA VAZIA, e não um formulário à parte: o caminho é o
          mesmo do "criar pela diferença", só que a diferença é o valor inteiro.
          ⚠ "IGNORAR" INSTANCIA o `DecisaoDerivadosDialog` (o mesmo da Auditoria Bancária).
          ⚠ "VER SUGESTÕES (N)" — PR-CONC-SUGESTOES-CASAR-01. Com N = 0 aparece desabilitado e diz por quê. */}
      <CelAcoes itens={[
        { rotulo: `Ver sugestões (${nSugestoes})`, onClick: nSugestoes > 0 ? onSugestoes : undefined, motivo: 'nenhuma sugestão para este movimento' },
        { rotulo: 'Criar', onClick: onCriar },
        { rotulo: transf?.contaNome ? `Criar transferência → ${transf.contaNome}` : 'Criar transferência', onClick: onCriarTransferencia,
          motivo: 'movimento sem conta' },
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
    <tr ref={setNodeRef} data-lanc-sem-par="" className={cn('border-b border-border/50',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <CelHistorico nota="— sem extrato correspondente" />
      <td className={TDC} />
      <td className={cn(TDC_MEIO, 'font-semibold text-destructive')} title="sem par no banco">!</td>
      <td className={cn(TDC_NUM, SEP, 'font-medium', corVal(s.valor_assinado))}>{fmtBRL(s.valor_assinado)}</td>
      <CelulasDoSistema pedacos={pedacosDoLancamento(s, mesDoRecorte, true)} detalhe={tituloLancamento(s)}
        marcar={<Marcar marcado={marcado} onMarcar={onMarcar} rotulo="Marcar lançamento" alcaId={`dragLan:${s.lancamento_id}`} />}
        fornecedor={s.fornecedor} subcentro={s.subcentro} selo={<SeloStatus status="realizado" />} />
      <CelAcoes itens={[
        { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(s.lancamento_id) : undefined, motivo: SEM_ABRIR },
      ]} />
    </tr>
  );
}

/**
 * UM CANDIDATO NA COLUNA DO SISTEMA, EM LINHA ÚNICA — PR-ESPELHO-CANDIDATOS-COLUNA-02.
 *
 * Mesmo desenho do lançamento sem par (marcação · valor · texto · ações), porque entra na mesma mecânica de marcar e casar.
 * ⚠ JÁ VINCULADO não é casável (a RPC recusa `lancamento_ja_conciliado`): linha esmaecida, sem checkbox, sem alça e sem receber
 *   arrasto. ⚠ SEM CONTA É CASÁVEL (PR-ESPELHO-SEMCONTA-CASAVEL-03): a pílula "sem conta" diz que ele ganha a conta do extrato ao casar.
 * ⚠ O STATUS NUNCA É O PEDAÇO CORTADO (PR-ESPELHO-CANDIDATOS-POR-DATA-05): ele é um selo `shrink-0` no fim do Subcentro, e os avisos
 *   que não são status ("sem conta", "já vinculado", o parcial) ficam `shrink-0` no fim da Descrição.
 * P159a: no VENCIDO (de outro mês, no topo) o vencimento vai na frente da Descrição, em vermelho — o dia do cabeçalho não é o dele.
 */
function LinhaCandidato({ c, marcado, onMarcar, onAbrir, falta = null, comVencimento = false }: {
  c: EspCandidato; marcado: boolean; onMarcar: () => void; onAbrir?: (id: string) => void;
  /** CONC-BLOCOS-TELA-01: o que falta para quitar um vinculado PARCIAL. Com falta, ele continua casável. */
  falta?: number | null;
  comVencimento?: boolean;
}) {
  const parcial = c.ja_conciliado && falta != null;
  const casavel = !c.ja_conciliado || parcial;
  /* OC-RECEB-PARCIAL-01 — A FALTA de um vinculo parcial (o "Receb. 2/2" que sobrou): UMA linha, cinza, dizendo o que e'. */
  const eFalta = !!c.saldo_de_id && !c.ja_conciliado;
  const nome = descricaoComParcela(c.descricao, c.oc_parcela);
  const { isOver, setNodeRef } = useDroppable({ id: `lan:${c.lancamento_id}`, disabled: !casavel });
  const doc = c.numero_documento ? [c.tipo_documento, c.numero_documento].filter(Boolean).join(' ') : null;
  /* O `title` continua dizendo TUDO numa frase — é o que o hover mostra quando o texto trunca. */
  const titulo = [
    eFalta ? fraseDaFalta(c) : null,
    `${fmtData(c.data_vencimento)} venc.`, nome || c.fornecedor, c.subcentro,
    STATUS_FILTRO_LABEL[(c.status_transacao ?? '').toLowerCase()] ?? c.status_transacao,
    c.vencido ? 'vencido' : null, c.sem_conta ? 'sem conta' : null,
    c.ja_conciliado ? 'já vinculado' : null, doc,
  ].filter(Boolean).join(' · ');
  const venc = c.data_vencimento ? `${c.data_vencimento.slice(8, 10)}/${c.data_vencimento.slice(5, 7)}/${c.data_vencimento.slice(0, 4)}` : '—';
  const pedacos: Pedaco[] = [
    ...(comVencimento ? [{ t: `venc. ${venc} · `, cls: cn('tabular-nums', c.vencido && 'font-semibold text-destructive'), testid: 'conf-vencimento' }] : []),
    eFalta ? { t: fraseDaFalta(c), cls: 'font-medium', testid: 'linha-falta' } : { t: nome || c.fornecedor || '—', cls: 'font-medium' },
    ...(!eFalta && doc ? [{ t: ` · ${doc}`, cls: 'text-muted-foreground' }] : []),
  ];
  return (
    <tr ref={setNodeRef} data-candidato="" className={cn('border-b border-border/50',
      c.ja_conciliado && !parcial && 'opacity-60',
      eFalta && 'text-muted-foreground',
      marcado && 'bg-amber-500/10',
      isOver && 'bg-emerald-500/10 outline-dashed outline-2 outline-emerald-500')}>
      <CelHistorico nota="" />
      <td className={TDC} />
      <td className={TDC_MEIO} />
      <td className={cn(TDC_NUM, SEP, 'font-medium', eFalta ? 'text-muted-foreground' : corVal(c.valor_assinado))}>{fmtBRL(c.valor_assinado)}</td>
      <CelulasDoSistema pedacos={pedacos} detalhe={titulo} apagado={eFalta}
        marcar={<Marcar marcado={marcado} onMarcar={casavel ? onMarcar : undefined} rotulo="Marcar candidato" alcaId={casavel ? `dragLan:${c.lancamento_id}` : undefined} />}
        fornecedor={c.fornecedor && c.fornecedor !== c.descricao ? c.fornecedor : null} subcentro={c.subcentro}
        selo={<SeloStatus status={c.status_transacao} />}
        chips={<>
          {c.sem_conta && <span className="shrink-0 rounded bg-destructive/10 px-1 text-[9.5px] font-medium text-destructive">sem conta</span>}
          {parcial && falta != null && <ChipParcial falta={falta} />}
          {c.ja_conciliado && !parcial && <span className="shrink-0 text-[9.5px] italic text-muted-foreground">já vinculado</span>}
        </>} />
      <CelAcoes itens={[
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
  return [descricaoComParcela(s.descricao, s.oc_parcela), s.fornecedor, s.subcentro].filter(Boolean).join(' · ') || undefined;
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
  /* FIN-POS-FIXADO-01b: o juro de parcela pós-fixada só se grava pelo dono (a `fn_espelho_casar` direta recusa). */
  parcela_pos: 'Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.',
  /* CONC-VALOR-CERTO-ACEITA-01: o extrato maior que um valor certo só grava com a confirmação, que é do modal. */
  confirmar_valor_extrato: 'O extrato é maior que o lançamento: case em "Casar com o banco…" para confirmar o valor do extrato.',
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
  data: { ok?: boolean; motivo?: string; frase?: string } | null;
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

/** P159a — os chips de filtro do cabeçalho da Conferência (o número ao lado é o de `contagensDaMesa`). */
const CHIPS_DA_CONFERENCIA: readonly { k: FiltroConferencia; rotulo: string }[] = [
  { k: 'todos', rotulo: 'Todos' }, { k: 'sem_par', rotulo: 'Sem par' }, { k: 'casados', rotulo: 'Casados' },
];

/**
 * AS SUGESTÕES DE CADA MOVIMENTO SEM PAR — PR-CONC-SUGESTOES-CASAR-01. Calculadas UMA vez por mesa e guardadas por linha: o "(N)"
 * do menu é o tamanho desta lista e o modal mostra ESTA lista (com orçamentos diferentes o menu dizia (2) e o modal mostrava 1 —
 * medido no Camargo). P159a: saiu da Conferência para quem a monta, porque o Extrato (banco) ganhou o mesmo botão [Sugestões] — a
 * MESMA lista nas duas telas. Sem candidatos (o modal do Espelho), toda lista é vazia.
 */
export function sugestoesDaMesa(dias: readonly DiaConf[], candidatos: readonly EspCandidato[]): Map<string, Sugestao[]> {
  const m = new Map<string, Sugestao[]>();
  for (const d of dias) for (const e of d.extratosSemPar) m.set(e.extrato_id, sugerirCasamentos(e, [...candidatos], { orcamentoMs: 30 }));
  return m;
}
/** "casar" numa sugestão abre o `CasarComBancoModal` já com os levados; um lançamento de valor diferente abre com o valor do banco. */
function levadosDaSugestao(s: Sugestao): LevadoInicial[] {
  const umDiferente = s.lancamentos.length === 1 && s.valorDiferente;
  return s.lancamentos.map((c) => ({
    lancamento_id: c.lancamento_id, descricao: c.descricao, fornecedor: c.fornecedor,
    valor_assinado: c.valor_assinado, usarValorDoBanco: umDiferente,
    data_vencimento: c.data_vencimento, status_transacao: c.status_transacao,
  }));
}

/**
 * O Extrato (banco) com os dois botões do sem par — P159a (mock `mock-extrato-banco-v1.html`). [Sugestões] e [Criar] abrem os MESMOS
 * modais da Conferência (`SugestoesCasarModal` → `CasarComBancoModal`; "Criar" = o casar com a lista vazia), com a MESMA lista de
 * sugestões (`sugestoesDaMesa`). Gravou: relê o espelho e avisa o canal (CONC-SEM-F5-01), como a Conferência.
 */
function ExtratoComAcoes({ data, inicial, internas, sugestoesPorLinha, clienteId, contaId, onMudou }: {
  data: EspelhadosReais; inicial: number; internas: EspelhoInternas; sugestoesPorLinha: ReadonlyMap<string, Sugestao[]>;
  clienteId: string; contaId: string; onMudou: () => void;
}) {
  const [sugerir, setSugerir] = useState<ExtratoAlvo | null>(null);
  const [casar, setCasar] = useState<{ extrato: ExtratoAlvo; iniciais: LevadoInicial[]; modelo?: ModeloDoHistorico } | null>(null);
  const alvo = (e: EspOfx): ExtratoAlvo => ({ extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor });
  const nomeConta = data.escopo.nome_conta ?? undefined;
  return (<>
    <TabelaExtratoDoMes ofx={data.ofx_completo} inicial={inicial} internas={internas}
      semPar={{
        nSugestoes: (e) => sugestoesPorLinha.get(e.extrato_id)?.length ?? 0,
        aoSugestoes: (e) => setSugerir(alvo(e)),
        aoCriar: (e) => setCasar({ extrato: alvo(e), iniciais: [] }),
      }} />
    <SugestoesCasarModal open={!!sugerir} onClose={() => setSugerir(null)} extrato={sugerir} nomeConta={nomeConta}
      sugestoes={(sugerir && sugestoesPorLinha.get(sugerir.extrato_id)) || []}
      onCasar={(s) => { if (!sugerir) return; setCasar({ extrato: sugerir, iniciais: levadosDaSugestao(s) }); setSugerir(null); }}
      /* P153 — "Criar igual" no "Procurar no histórico": o Casar de sempre, vazio, abre o Criar com o modelo */
      clienteId={clienteId}
      onCriarIgual={(m) => { if (!sugerir) return; setCasar({ extrato: sugerir, iniciais: [], modelo: m }); setSugerir(null); }} />
    <CasarComBancoModal open={!!casar} onClose={() => setCasar(null)} extrato={casar?.extrato ?? null} iniciais={casar?.iniciais ?? []}
      modelo={casar?.modelo ?? null}
      nomeConta={nomeConta} contaBancariaId={contaId} clienteId={clienteId} onConciliado={() => onMudou()} />
  </>);
}

function AbaConferencia({ data, dias, anoMes, nomeConta, clienteId, contaId, onAbrir, onMudou, mostrarCandidatos = true, filtro = 'todos',
  mostrarVencidos = false, saldoDoBancoNoDia, sugestoesPorLinha, diaFoco = null, onDiaFocado }: {
  data: EspelhadosReais;
  /** P159a — a mesa (`montarMesa`) vem de quem monta: os chips do cabeçalho do modal contam a MESMA mesa que a tabela desenha. */
  dias: readonly DiaConf[];
  anoMes: string; nomeConta?: string; clienteId: string; contaId: string | null;
  onAbrir?: (id: string) => void; onMudou: () => void;
  /** Sem candidatos, a mesa é só o fecho dos realizados (o modal do Espelho). */
  mostrarCandidatos?: boolean;
  /** P159a — o chip do cabeçalho (Todos · Sem par · Casados); esconde linhas, nunca muda o fechamento do dia. */
  filtro?: FiltroConferencia;
  /** P159a — o chip "Vencidos de meses anteriores": os vencidos no topo (fechados por padrão). */
  mostrarVencidos?: boolean;
  /** P159a — o saldo do banco no FIM de cada dia ('aaaa-mm-dd' → saldo), lido da Evolução do saldo (`montarEvolucao`). */
  saldoDoBancoNoDia: ReadonlyMap<string, number>;
  /** As sugestões de cada movimento sem par (`sugestoesDaMesa`), as MESMAS do Extrato (banco). */
  sugestoesPorLinha: ReadonlyMap<string, Sugestao[]>;
  /** Rola até o cabeçalho deste dia ao abrir (o link do Status da Conciliação) e avisa quem pediu. */
  diaFoco?: string | null;
  onDiaFocado?: () => void;
}) {
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
  /* ⚠ UM LUGAR SÓ DECIDE — PR-CONCILIACAO-5-ABAS-01. Com a lista vazia somem de uma vez a
     faixa, as linhas e os candidatos do `sisIndex` (nada de marcar ou arrastar candidato). */
  const candidatos = useMemo(
    () => (mostrarCandidatos ? (data.sistema_candidatos ?? []) : []),
    [data, mostrarCandidatos]);
  /* P139 — os movimentos SEM PAR do recorte (a barra só oferece "Criar transferências (N)" quando todos os marcados são deles) e a
     SUGESTÃO de transferência do banco para eles (titular de outra conta; aplicação/resgate automático → a única conta de investimento
     do mesmo banco). Uma consulta por conta e mês; a tela só mostra. */
  const semParIds = useMemo(() => {
    const s = new Set<string>();
    for (const d of dias) for (const e of d.extratosSemPar) s.add(e.extrato_id);
    return s;
  }, [dias]);
  const chaveSemPar = useMemo(() => [...semParIds].sort().join(','), [semParIds]);
  const { data: transfProvaveis } = useQuery({
    queryKey: ['p139-transf-provaveis', contaId, anoMes, chaveSemPar],
    enabled: !!contaId && semParIds.size > 0,
    queryFn: () => {
      const [ano, mes] = anoMes.split('-').map(Number);
      const fim = new Date(ano, mes, 0).getDate();
      return sugestoesDeTransferencia(contaId ?? '', `${anoMes}-01`, `${anoMes}-${String(fim).padStart(2, '0')}`);
    },
  });
  const transfPorLinha: ReadonlyMap<string, SugestaoDeTransferencia> = transfProvaveis ?? new Map<string, SugestaoDeTransferencia>();

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

  const [casar, setCasar] = useState<{ extrato: ExtratoAlvo; iniciais: LevadoInicial[]; modelo?: ModeloDoHistorico } | null>(null);
  const [sugerir, setSugerir] = useState<ExtratoAlvo | null>(null);
  const [arrastando, setArrastando] = useState<EspSis | null>(null);
  const [arrastandoExt, setArrastandoExt] = useState<EspOfx | null>(null);
  const [casarN1, setCasarN1] = useState<{ sis: EspSis; extratos: EspOfx[] } | null>(null);
  /* CONC-BLOCOS-TELA-01 — a variante BLOCO (N extratos × M lançamentos, `fn_conciliar_bloco`). */
  const [casarBloco, setCasarBloco] = useState<{ extratos: EspOfx[]; lancs: EspSis[]; regra: RegraBloco } | null>(null);
  /* P139 — criar transferência pela linha (uma) e pelo lote (as marcadas, todas sem par) */
  const [transf, setTransf] = useState<MovimentoParaTransferencia | null>(null);
  const [transfLote, setTransfLote] = useState<MovimentoParaTransferencia[] | null>(null);
  const paraTransferencia = (e: EspOfx): MovimentoParaTransferencia | null =>
    contaId ? { extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor, conta_id: contaId } : null;
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
  const podeConciliar = !!sentido && sentido !== 'bloco' && fechaAoCentavo(difSel);
  const motivoBloqueio = sentido === 'bloco' ? 'bloco: confira em "Casar com o banco…"'
    : sentido ? (!fechaAoCentavo(difSel) ? 'os valores não batem' : '')
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
      if (res.ok === false) { setErro(res.frase ?? MOTIVO_CASAR_LABEL[res.motivo ?? ''] ?? res.motivo ?? 'Não foi possível conciliar.'); return; }
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

  /* P159a — o que ESTE dia desenha, na ordem da tela (`itensDoDia`: maior |valor| primeiro; candidatos depois) e com o filtro do chip. */
  const ehParcial = (p: Pareado) => faltaDoExtrato(p.diferenca) != null;

  const renderPareado = (p: Pareado) => {
    const agrupado = p.filhas.length > 1;
    const unica = p.filhas.length === 1 ? p.filhas[0] : null;
    const temDif = !fechaAoCentavo(p.diferenca);
    const falta = faltaDoExtrato(p.diferenca);
    const sinal = falta != null ? SINAL_PARCIAL : SINAL_CASADO;
    const somaAssinada = Math.sign(p.extrato.valor || 1) * p.soma;
    const avisos = { lancadoEm: unica?.lancadoEm ?? null, parte: unica?.parte ?? null, sobreAplicado: p.sobreAplicado };
    /* a falta ANTES de tudo, escrita (não só no title): a célula corta no fim, e o número nunca é o pedaço cortado. Os avisos ANTES
       da descrição; no agrupado a mãe só diz o "aplicado acima" (data e parte de cada lançamento vão na filha dele). */
    const pedacos: Pedaco[] = [
      ...(falta != null ? [{ t: `falta ${fmtBRL(falta)}`, cls: 'font-semibold text-amber-700', testid: 'falta-do-extrato' }, { t: ' · ' }] : []),
      ...pedacosDosAvisos(avisos),
      ...(agrupado
        ? [{ t: `${p.filhas.length} lançamentos`, cls: 'font-medium' }, { t: ` · ${p.grupoId ? 'agrupados' : `${p.filhas.length} vínculos`}`, cls: 'text-muted-foreground' }]
        : pedacosDoLancamento(unica?.sis, mesDoRecorte)),
      ...(unica && unica.deN > 1 ? [{ t: ` · 1 de ${unica.deN}`, cls: 'text-muted-foreground' }] : []),
      ...pedacoDaOrigem(p.tipoVencedor),
    ];
    const detalhe = [
      falta != null ? `falta R$ ${fmtBRL(falta)}: os lançamentos somam menos que o extrato` : null,
      ...tituloAvisos(avisos), unica ? tituloLancamento(unica.sis) : null,
    ].filter(Boolean).join(' · ');
    return (
      <React.Fragment key={p.extrato.extrato_id}>
        <tr className={cn('border-b border-border/50', falta == null && CONCILIADA)}
            {...(falta == null ? { 'data-conciliada': '' } : { 'data-extrato-parcial': '' })}>
          <CelHistorico historico={p.extrato.historico} data={p.extrato.data} />
          <td className={cn(TDC_NUM, 'font-medium', corVal(p.extrato.valor))}>{fmtBRL(p.extrato.valor)}</td>
          <td className={cn(TDC_MEIO, 'font-bold', sinal.cor)} title={sinal.titulo} data-testid="sinal-do-extrato">{sinal.simbolo}</td>
          <td className={cn(TDC_NUM, SEP, 'font-medium', temDif ? 'text-amber-600' : corVal(somaAssinada))}
              title={temDif ? `banco ${fmtBRL(Math.abs(p.diferenca))} ${p.diferenca > 0 ? 'a mais' : 'a menos'} que a soma` : undefined}>
            {fmtBRL(somaAssinada)}
          </td>
          <CelulasDoSistema pedacos={pedacos} detalhe={detalhe}
            fornecedor={agrupado ? null : unica?.sis?.fornecedor} subcentro={agrupado ? null : unica?.sis?.subcentro}
            selo={falta != null ? <SeloStatus status="parcial" /> : null} />
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
              motivo: falta != null ? MOTIVO_EXTRATO_PARCIAL : 'vínculos sem grupo: desconcilie cada um pelo lançamento' },
          ]} />
        </tr>
        {/* ⚠ A FILHA É DETALHE DE COMPOSIÇÃO, e a tipografia diz isso: peso 400 em tudo — inclusive no valor —, texto em
            muted e borda mais fraca que a das linhas. Ela explica a mãe; não compete com ela. */}
        {agrupado && p.filhas.map((f) => {
          const faltaF = faltaDe(f.lancamento_id, f.sis?.valor_assinado ?? 0);
          const av = { lancadoEm: f.lancadoEm, parte: f.parte, sobreAplicado: false };
          /* CONC-MESA-SINAL-01: o sinal da filha é o do lançamento — a dedução aparece negativa no depósito. */
          const v = sinalDoAplicado(f.sis, p.extrato.valor) * f.valor_aplicado;
          return (
            <tr key={f.lancamento_id} className={cn(CONCILIADA_FILHA, 'border-b border-border/30')} data-conciliada="">
              <CelHistorico nota="" />
              <td className={TDC} />
              <td className={cn(TDC_MEIO, 'text-muted-foreground')}>↳</td>
              <td className={cn(TDC_NUM, SEP, corVal(v))}>{fmtBRL(v)}</td>
              <CelulasDoSistema apagado pedacos={[...pedacosDosAvisos(av), { t: f.sis?.descricao ?? '—' }]}
                detalhe={[...tituloAvisos(av), tituloLancamento(f.sis)].filter(Boolean).join(' · ')}
                fornecedor={f.sis?.fornecedor} subcentro={f.sis?.subcentro}
                chips={faltaF == null ? null : <ChipParcial falta={faltaF} />} />
              <CelAcoes itens={[
                { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(f.lancamento_id) : undefined, motivo: SEM_ABRIR },
                { rotulo: 'Desconciliar', motivo: 'desconcilie pela linha do extrato, acima' },
              ]} />
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  /* ⚠ N:1 — a mãe do lado do SISTEMA. Ver `ParedoN1`. */
  const renderN1 = (g: ParedoN1) => {
    const temDif = !fechaAoCentavo(g.diferenca);
    const somaAssinada = Math.sign(g.sis.valor_assinado || 1) * g.soma;
    const av = { lancadoEm: g.lancadoEm, sobreAplicado: g.sobreAplicado };
    return (
      <React.Fragment key={g.sis.lancamento_id}>
        <tr className={cn('border-b border-border/50', CONCILIADA)} data-conciliada="">
          <CelHistorico nota="" />
          <td className={cn(TDC_NUM, 'font-medium', temDif ? 'text-amber-600' : corVal(somaAssinada))}
              title={temDif ? `os extratos somam ${fmtBRL(Math.abs(g.diferenca))} ${g.diferenca > 0 ? 'a mais' : 'a menos'} que o lançamento` : undefined}>
            {fmtBRL(somaAssinada)}
          </td>
          <td className={cn(TDC_MEIO, 'font-bold', SINAL_CASADO.cor)} title={SINAL_CASADO.titulo}>{SINAL_CASADO.simbolo}</td>
          <td className={cn(TDC_NUM, SEP, 'font-medium', corVal(g.sis.valor_assinado))}>{fmtBRL(g.sis.valor_assinado)}</td>
          <CelulasDoSistema
            pedacos={[...pedacosDosAvisos(av), ...pedacosDoLancamento(g.sis, mesDoRecorte),
              { t: ` · ${g.extratos.length} extratos`, cls: 'text-muted-foreground' }, ...pedacoDaOrigem('agrupamento_manual')]}
            detalhe={[...tituloAvisos(av), tituloLancamento(g.sis)].filter(Boolean).join(' · ')}
            fornecedor={g.sis.fornecedor} subcentro={g.sis.subcentro} />
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
        {/* ⚠ FILHAS DO LADO DO BANCO e `↰` no meio: a seta aponta para o OFX porque é ele que está sendo decomposto. */}
        {g.extratos.map((x) => (
          <tr key={x.extrato.extrato_id} className={cn(CONCILIADA_FILHA, 'border-b border-border/30')} data-conciliada="">
            <CelHistorico historico={x.extrato.historico} data={x.extrato.data} apagado />
            <td className={cn(TDC_NUM, corVal(x.extrato.valor))}>{fmtBRL(x.extrato.valor)}</td>
            <td className={cn(TDC_MEIO, 'text-muted-foreground')}>↰</td>
            <td className={cn(TDC, SEP)} /><td className={TDC} /><td className={TDC} /><td className={TDC} />
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
  };

  const renderItem = (it: ItemConferencia) => {
    switch (it.tipo) {
      case 'pareado': return renderPareado(it.p);
      case 'n1': return renderN1(it.g);
      case 'extrato_sem_par': {
        const e = it.e;
        return (
          <LinhaExtratoSemPar key={e.extrato_id} e={e}
            marcado={marcado('extratos', e.extrato_id)} onMarcar={() => alterna('extratos', e.extrato_id)}
            onCriar={() => setCasar({
              extrato: { extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor },
              iniciais: [],
            })}
            onIgnorar={() => setIgnorarId(e.extrato_id)}
            onCriarTransferencia={contaId ? () => setTransf(paraTransferencia(e)) : undefined}
            transf={transfPorLinha.get(e.extrato_id)}
            nSugestoes={sugestoesPorLinha.get(e.extrato_id)?.length ?? 0}
            onSugestoes={() => setSugerir({ extrato_id: e.extrato_id, data: e.data, historico: e.historico, valor: e.valor })} />
        );
      }
      case 'interna': {
        const si = it.s;
        return (
          <tr key={si.lancamento_id} className="border-b border-border/50 bg-background">
            <CelHistorico nota="— o banco não exporta este movimento" />
            <td className={TDC} />
            <td className={cn(TDC_MEIO, 'text-muted-foreground')} title="transferência com conta interna">⇄</td>
            <td className={cn(TDC_NUM, SEP, 'font-medium text-muted-foreground')}>{fmtBRL(si.valor_assinado)}</td>
            <CelulasDoSistema apagado detalhe={tituloLancamento(si)}
              pedacos={[{ t: si.descricao ?? '—', cls: 'font-medium' }, { t: ' · transferência interna · fora do extrato' }]}
              fornecedor={si.fornecedor} subcentro={si.subcentro} selo={<SeloStatus status="realizado" />} />
            <CelAcoes itens={[
              { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(si.lancamento_id) : undefined, motivo: SEM_ABRIR },
            ]} />
          </tr>
        );
      }
      case 'lanc_sem_par': {
        const sl = it.s;
        return (
          <LinhaLancSemPar key={sl.lancamento_id} s={sl} mesDoRecorte={mesDoRecorte}
            marcado={marcado('lancamentos', sl.lancamento_id)}
            onMarcar={() => alterna('lancamentos', sl.lancamento_id)} onAbrir={onAbrir} />
        );
      }
      case 'resto': {
        /* ⚠ O RESTO NÃO APLICADO — PR-CONC-CONFERENCIA-FECHAMENTO-DIA (R5): o lançamento diz um valor e o banco aplicou menos; o que
           falta aparece aqui, no dia do lançamento, somando no fechamento. Sem caixa de marcar: é o pedaço que falta de um casado. */
        const r = it.r;
        const v = Math.sign(r.sis.valor_assinado || 1) * r.resto;
        return (
          <tr key={`resto-${r.sis.lancamento_id}`} data-resto="" className="border-b border-border/50">
            <CelHistorico nota="" />
            <td className={TDC} />
            <td className={cn(TDC_MEIO, 'font-semibold text-destructive')} title="parte do lançamento sem extrato">!</td>
            <td className={cn(TDC_NUM, SEP, 'font-medium', corVal(v))}>{fmtBRL(v)}</td>
            <CelulasDoSistema
              pedacos={[{ t: 'aplicado abaixo do lançamento · ', cls: 'text-amber-600', aviso: 'sub-aplicado' },
                { t: `resto de ${fmtBRL(r.sis.valor_assinado)} · `, cls: 'text-muted-foreground' }, ...pedacosDoLancamento(r.sis, mesDoRecorte)]}
              detalhe={`aplicado abaixo do lançamento: o lançamento vale ${fmtBRL(r.sis.valor_assinado)} e os extratos desta conta aplicam ${fmtBRL(r.aplicado)}; falta ${fmtBRL(r.resto)} · ${tituloLancamento(r.sis) ?? ''}`}
              fornecedor={r.sis.fornecedor} subcentro={r.sis.subcentro} selo={<SeloStatus status="realizado" />} />
            <CelAcoes itens={[
              { rotulo: 'Abrir', onClick: onAbrir ? () => onAbrir(r.sis.lancamento_id) : undefined, motivo: SEM_ABRIR },
            ]} />
          </tr>
        );
      }
      case 'candidato': {
        /* ⚠ OS CANDIDATOS DO DIA, LOGO DEPOIS DOS MOVIMENTOS DELE e FORA da soma: o `d.banco`/`d.sistema` não os contam, então o
           "confere" do dia é o mesmo. Estar na vizinhança não é estar na conta. */
        const c = it.c;
        return (
          <LinhaCandidato key={c.lancamento_id} c={c} falta={faltaDe(c.lancamento_id, c.valor)}
            marcado={marcado('lancamentos', c.lancamento_id)}
            onMarcar={() => alterna('lancamentos', c.lancamento_id)} onAbrir={onAbrir} />
        );
      }
    }
  };

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}
      onDragStart={(ev) => {
        const id = String(ev.active.id);
        if (id.startsWith('dragLan:')) setArrastando(sisIndex.get(id.slice(8)) ?? null);
        else if (id.startsWith('dragExt:')) setArrastandoExt(extratoIndex.get(id.slice(8)) ?? null);
      }}>
    <div ref={refMesa} className="flex min-h-0 flex-1 flex-col">
      {/* ⚠ `overflow-auto`, NOS DOIS EIXOS: abaixo da largura mínima da tabela ela rola DENTRO do modal, nunca a página. Só a tabela
          rola; o cabeçalho dela é preso (`sticky`), e a faixa e o rodapé do modal ficam fora. */}
      <div className="min-h-0 flex-1 overflow-auto border-t" data-testid="mesa-conferencia">
        {/* ⚠ A RÉGUA (P159e): 7 colunas fixas — `LARGURAS_CONFERENCIA`; o EXTRATO fica com o resto. O piso (`PISO_DA_MESA`, 944) é a
            soma das fixas (694) mais 250 para o extrato: abaixo dele a mesa rola na horizontal dentro do modal. */}
        {/* ⚠ A FONTE E A ALTURA DA LINHA SÃO DA TABELA: célula que não declara (a do "⋯") herdaria os 16/24px da página e esticaria a
            linha de 19 para 25px (medido 28/10). */}
        <table className="w-full border-collapse text-[10px] leading-[18px]" style={{ tableLayout: 'fixed', minWidth: PISO_DA_MESA }}>
          <colgroup>{LARGURAS_CONFERENCIA.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead className="sticky top-0 z-10 bg-primary">
            <tr>
              <th className={cn(TH_REGUA, 'px-[5px] text-left')}>Nome do extrato</th>
              <th className={cn(TH_REGUA, 'px-[5px] text-right')}>Valor</th>
              <th className={cn(TH_REGUA, 'px-0')} />
              {/* A divisória atravessa o cabeçalho também — em branco, porque o fundo é navy. */}
              <th className={cn(TH_REGUA, 'border-l-2 border-l-primary-foreground/60 px-[5px] text-right')}>Sistema</th>
              <th className={cn(TH_REGUA, 'px-[5px] text-left')}>Descrição</th>
              <th className={cn(TH_REGUA, 'px-[5px] text-left')}>Favorecido</th>
              <th className={cn(TH_REGUA, 'px-[5px] text-left')}>Subcentro</th>
              <th className={cn(TH_REGUA, 'px-0')} />
            </tr>
          </thead>
          <tbody>
            {/* ═══ VENCIDOS — NO TOPO, CRONOLÓGICOS, FECHADOS POR PADRÃO (PR-ESPELHO-VENCIDOS-NO-TOPO-08) ═══
                P159a: quem os abre é o chip "Vencidos de meses anteriores (N)" do cabeçalho do modal (era a faixa amarela daqui). */}
            {mostrarVencidos && vencidos.length > 0 && (<>
              <tr className="bg-amber-50 dark:bg-amber-950/20" data-vencidos="">
                <td colSpan={8} className="h-[22px] px-[5px] py-0 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                  Vencidos de meses anteriores <span className="font-normal opacity-80">· {vencidos.length} em aberto</span>
                </td>
              </tr>
              {vencidos.map((c) => (
                <LinhaCandidato key={c.lancamento_id} c={c} falta={faltaDe(c.lancamento_id, c.valor)} comVencimento
                  marcado={marcado('lancamentos', c.lancamento_id)}
                  onMarcar={() => alterna('lancamentos', c.lancamento_id)} onAbrir={onAbrir} />
              ))}
            </>)}

            {dias.map((d) => {
              const itens = itensDoDia(d, filtro, { mostrarCandidatos, ehParcial });
              /* ⚠ O FILTRO ESCONDE LINHAS, NÃO MUDA A CONTA: o dia sem nenhuma linha visível some inteiro; o que fica mostra o
                 fechamento do DIA INTEIRO, casados incluídos. */
              if (itens.length === 0) return null;
              const conta = contagemDoDia(d, ehParcial);
              /* ⚠ DIA SÓ DE CANDIDATO NÃO TEM O QUE FECHAR (PR-ESPELHO-VENCIDOS-NO-TOPO-08): um "confere" sobre um dia em que nada
                 aconteceu parece conferência e não conferiu nada. O teste é pelas LINHAS realizadas, não pelos totais. */
              const temMovimento = d.pareados.length > 0 || d.paredosN1.length > 0 || d.extratosSemPar.length > 0
                || d.lancsSemPar.length > 0 || d.internas.length > 0 || d.restos.length > 0;
              const saldoDoBanco = d.data ? saldoDoBancoNoDia.get(d.data.slice(0, 10)) : undefined;
              const dif = d.banco - d.sistema;
              return (
                <React.Fragment key={d.data ?? 'sem-data'}>
                  {/* P159d (cor): o DIA é a faixa cinza-azulada; o respiro em cima é uma sombra interna branca (não ocupa lugar).
                      P159e (mock): 22px a 10px em negrito — mais alto que as linhas, de propósito (era 20px a 10,5) */}
                  <tr className="bg-[#e4e9f0] dark:bg-muted" data-dia={d.data ?? undefined}>
                    <td colSpan={8} className="h-[22px] whitespace-nowrap px-[5px] py-0 text-[10px] font-bold text-foreground/90 shadow-[inset_0_2px_0_hsl(var(--background))]">
                      {rotuloDoDia(d.data)}
                      <span className="font-normal text-muted-foreground">
                        {' · '}{conta.movimentos} movimento{conta.movimentos === 1 ? '' : 's'}{conta.semPar > 0 ? ` · ${conta.semPar} sem par` : ''}
                      </span>
                    </td>
                  </tr>
                  {itens.map(renderItem)}
                  {temMovimento && (
                    /* P159d (cor): o FECHAMENTO é cinza bem claro com um filete em cima e embaixo (sombras internas, não ocupam lugar) */
                    <tr className="border-b border-border bg-[#f3f5f8] dark:bg-muted/60 [&>td]:shadow-[inset_0_1px_0_#cfd6df,inset_0_-1px_0_#cfd6df]" data-fechamento="">
                      <td className={cn(TDC, 'h-[22px] font-bold')} title={`Fechamento ${fmtData(d.data)} · saldo do banco no fim do dia`}>
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate">Fechamento {fmtData(d.data)} · saldo do banco</span>
                          {/* o saldo do banco no FIM do dia: lido da Evolução do saldo (`montarEvolucao`), nada somado aqui */}
                          <b className="shrink-0 tabular-nums" data-testid="fechamento-saldo-banco">{saldoDoBanco != null ? fmtBRL(saldoDoBanco) : '—'}</b>
                        </span>
                      </td>
                      {/* ⚠ NO FECHAMENTO NÃO SE COLORE POR SINAL: a linha inteira é subtotal, e o sinal já está no número. */}
                      <td className={cn(TDC_NUM, 'h-[22px] font-bold')}>{fmtBRL(d.banco)}</td>
                      <td className={cn(TDC_MEIO, 'h-[22px]')} />
                      <td className={cn(TDC_NUM, SEP, 'h-[22px] font-bold')}>{fmtBRL(d.sistema)}</td>
                      {/* a diferença é número: nunca corta (sem "…"); as 4 colunas (340px+) a cabem inteira */}
                      <td colSpan={4} className="h-[22px] whitespace-nowrap px-[5px] py-0 text-[10px] font-bold leading-[18px]" data-testid="fechamento-diferenca">
                        {/* ⚠ TOLERÂNCIA ZERO — PR-CONCILIACAO-TOLERANCIA-ZERO-02. */}
                        {saldoConfere(dif)
                          ? <span className="text-emerald-600">confere</span>
                          : <span className="text-amber-600">diferença {fmtBRL(dif)}{conta.semPar > 0 ? ` (${conta.semPar} sem par)` : ''}</span>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* P159a — o rodapé: a legenda curta; os outros sinais e as origens (B, ↻, ✓ enriquecido, M…) no "?". */}
      <div className="flex h-[24px] shrink-0 items-center gap-3.5 whitespace-nowrap border-t px-3 text-[10px] text-muted-foreground" data-testid="legenda-conferencia">
        <span><span className={cn('font-bold', SINAL_CASADO.cor)}>{SINAL_CASADO.simbolo}</span> casado</span>
        <span>○ sem par</span>
        <span>⇄ transferência</span>
        <span>Ordem do dia: maior valor primeiro</span>
        <span className="ml-auto flex items-center gap-3.5">
          {!!ignorados?.length && (
            <span>
              {ignorados.length} ignorado{ignorados.length === 1 ? '' : 's'} neste mês{' · '}
              <Acao onClick={() => setVerIgnorados((v) => !v)}>{verIgnorados ? 'ocultar' : 'ver'}</Acao>
            </span>
          )}
          <span className="grid h-[15px] w-[15px] cursor-help place-items-center rounded-full border text-[9.5px]" data-testid="legenda-origens"
            title={['! sem par no outro lado (ou parte sem extrato)', '↳ parte de um agrupamento (1 extrato, N lançamentos)',
              '↰ parte de um agrupamento (N extratos, 1 lançamento)', '⇄? sugestão de transferência',
              ...LEGENDA_ICONES.map((ic) => `${ic.simbolo} ${ic.curto}`)].join('\n')}>?</span>
        </span>
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

      {/* P139 — criar transferência pela linha / pelo lote. Gravou: a Conferência, os saldos e o Casar releem (onMudou + o canal dos
          lançamentos), sem F5. A gêmea reconhecida vai ao "Ignorar" da casa (o mesmo diálogo, com motivo). */}
      <CriarTransferenciaDialog aberto={!!transf} clienteId={clienteId} movimento={transf}
        sugestao={transf ? transfPorLinha.get(transf.extrato_id) ?? null : null}
        onFechar={() => setTransf(null)}
        onGravado={() => { setTransf(null); limpar(); onMudou(); if (clienteId) notificarLancamentosMudaram(clienteId); }}
        onIgnorarDuplicada={(id) => { setTransf(null); setIgnorarId(id); }} />
      <CriarTransferenciasLoteDialog aberto={!!transfLote} clienteId={clienteId} movimentos={transfLote ?? []} sugestoes={transfPorLinha}
        onFechar={() => setTransfLote(null)}
        onGravado={() => { setTransfLote(null); limpar(); onMudou(); if (clienteId) notificarLancamentosMudaram(clienteId); }} />

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
              {/* P139 — só movimentos SEM PAR marcados (nenhum lançamento): viram transferências de uma vez, cada um com a sua conta */}
              {contaId && sel.lancamentos.size === 0 && sel.extratos.size >= 1 && [...sel.extratos].every((id) => semParIds.has(id)) && (
                <button type="button" data-testid="barra-criar-transferencias"
                  onClick={() => setTransfLote([...sel.extratos].map((id) => extratoIndex.get(id)).filter((x): x is EspOfx => !!x)
                    .map(paraTransferencia).filter((x): x is MovimentoParaTransferencia => !!x))}
                  className="rounded bg-primary-foreground/20 px-2 py-0.5 text-[11px] hover:bg-primary-foreground/30">
                  Criar transferências ({sel.extratos.size})…
                </button>
              )}
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
          setCasar({ extrato: sugerir, iniciais: levadosDaSugestao(s) });
          setSugerir(null);
        }}
        /* P153 — "Criar igual" no "Procurar no histórico": o Casar de sempre, vazio, abre o Criar com o modelo */
        clienteId={clienteId}
        onCriarIgual={(m) => { if (!sugerir) return; setCasar({ extrato: sugerir, iniciais: [], modelo: m }); setSugerir(null); }}
      />

      <CasarComBancoModal
        open={!!casar}
        onClose={() => setCasar(null)}
        extrato={casar?.extrato ?? null}
        iniciais={casar?.iniciais ?? []}
        modelo={casar?.modelo ?? null}
        nomeConta={nomeConta}
        contaBancariaId={contaId}
        clienteId={clienteId}
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
  /**
   * P159b — "ver o dia na Conferência" (a Evolução do saldo): quem monta abre a Conferência no dia, pelo MESMO caminho do link "N dias
   * com diferença" (`irParaConferencia`). Sem a prop, este componente abre a própria Conferência no dia.
   */
  onVerDiaNaConferencia?: (dia: string) => void;
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

export function EspelhoConciliacaoTab({ clienteId, contaId, ano, mes, mostrarCandidatos = true, soConferencia = false, aba: abaDeFora, onAbaChange,
  diaFoco: diaFocoDeFora = null, onDiaFocado: onDiaFocadoDeFora, onVerDiaNaConferencia }: Props) {
  /* P159b — o dia pedido pela Evolução quando ninguém de fora governa (`onVerDiaNaConferencia` ausente) */
  const [diaFocoInterno, setDiaFocoInterno] = useState<string | null>(null);
  const diaFoco = diaFocoDeFora ?? diaFocoInterno;
  const onDiaFocado = () => { setDiaFocoInterno(null); onDiaFocadoDeFora?.(); };
  const anoMes = `${ano}-${mes}`;
  /* ⚠ O QUADRO DO TOPO E A ABA SISTEMA LEEM O DONO — PR-CONC-SALDO-UMA-REGUA-02 (D6/D7): a linha da conta de
     `fn_conciliacao_resumo_mes` (com UMA conta ela traz os dias e a lista do sistema). Chamado antes dos retornos
     antecipados abaixo — hook nunca depois de `return`. Sem conta, a consulta não sai. */
  const resumoQ = useResumoMes(clienteId, anoMes, contaId ? [contaId] : []);
  /* CONC-SEM-F5-01 — o quadro do topo e a aba Sistema ouvem o canal: gesto que grava relê o dono sem F5. */
  useReleDonoAoMudarLancamentos(clienteId);
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
  /* ⚠ O FILTRO VIVE SÓ ENQUANTO O MODAL ESTÁ ABERTO — PR-CONC-SUGESTOES-CASAR-01 (Gabriel, 30/09): fechar a Conferência volta
     a mostrar tudo na próxima abertura. P159a: o "Só não conciliados" virou o chip "Sem par" (e há "Casados").
     ⚠ OS VENCIDOS COMEÇAM OCULTOS — PR-ESPELHO-VENCIDOS-NO-TOPO-08: o vencido é do passado; aberto por padrão ele empurraria o dia
     01 para baixo da dobra. A contagem no chip ("Vencidos de meses anteriores 3") é o que garante que ele não some. */
  const [filtroConf, setFiltroConf] = useState<FiltroConferencia>('todos');
  const [mostrarVencidos, setMostrarVencidos] = useState(false);
  useEffect(() => { if (aba !== 'conferencia') { setFiltroConf('todos'); setMostrarVencidos(false); } }, [aba]);
  /* P159a — abrir a Conferência NUM DIA (o link do Status, a Evolução do saldo): o chip volta a Todos, senão o dia pedido pode estar
     escondido pelo filtro. */
  useEffect(() => { if (aba === 'conferencia' && diaFoco) setFiltroConf('todos'); }, [aba, diaFoco]);
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

  /* P159a — A MESA UMA VEZ SÓ, AQUI: a tabela da Conferência a desenha e os chips do cabeçalho a contam (a mesma). O saldo do banco
     no fim de cada dia é o da Evolução do saldo (`montarEvolucao`, que lê esta mesma mesa) — o fechamento do dia só o MOSTRA.
     Antes dos retornos antecipados abaixo: hook nunca depois de `return`. */
  const diasDaMesa = useMemo(() => (data ? montarMesa(data, internas.lancamentosInternos) : []), [data, internas.lancamentosInternos]);
  const saldoDoBancoNoDia = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    const ym = data.saldos.periodo_ini ? data.saldos.periodo_ini.slice(0, 7) : anoMes;
    for (const r of montarEvolucao(data, internas.lancamentosInternos)) m.set(`${ym}-${String(r.dia).padStart(2, '0')}`, r.saldoOfx);
    return m;
  }, [data, internas.lancamentosInternos, anoMes]);
  const sugestoesPorLinha = useMemo(
    () => sugestoesDaMesa(diasDaMesa, mostrarCandidatos ? (data?.sistema_candidatos ?? []) : []),
    [diasDaMesa, data, mostrarCandidatos]);
  const ehParcialDaMesa = (p: Pareado) => faltaDoExtrato(p.diferenca) != null;
  const chips = contagensDaMesa(diasDaMesa, ehParcialDaMesa);
  const nVencidos = mostrarCandidatos ? (data?.sistema_candidatos ?? []).filter((c) => c.vencido).length : 0;

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
  const tituloConferencia = ['Conferência', data.escopo.nome_conta, `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano}`].filter(Boolean).join(' · ');

  /* O mesmo elemento vai inline (`soConferencia`) ou dentro do Dialog — um só, nunca dois. */
  /* CONC-SEM-F5-01 — TODO gesto da Conferência (casar 1:1 e N:1, bloco, desfazer bloco, desconciliar, ignorar, reverter) cai
     aqui: além de reler o espelho, AVISA o canal de lançamentos. Era o caso do Gabriel (04/10): conciliava no Casar, voltava à
     aba Conciliação e o mês seguia "Não conciliado" até o F5 — este ponto só fazia o `refetch`. */
  const aoMudarConferencia = () => {
    void refetch();
    if (clienteId) notificarLancamentosMudaram(clienteId);
  };
  const conferencia = (
    <AbaConferencia data={data} dias={diasDaMesa} anoMes={anoMes} nomeConta={data.escopo.nome_conta ?? undefined}
      clienteId={clienteId} contaId={contaId}
      onAbrir={onAbrirLancamento} onMudou={aoMudarConferencia}
      mostrarCandidatos={mostrarCandidatos} filtro={filtroConf} mostrarVencidos={mostrarVencidos} saldoDoBancoNoDia={saldoDoBancoNoDia}
      sugestoesPorLinha={sugestoesPorLinha}
      diaFoco={aba === 'conferencia' ? diaFoco : null} onDiaFocado={onDiaFocado} />
  );

  /* "Sem par" também é do dono (a interna fica fora, como já era): extratos com a quantidade E o valor, que a tela
     nunca soube calcular, e lançamentos. */
  const semParExt = linhaDono?.extratos_sem_par ?? null;
  const semParLanc = linhaDono?.lancamentos_sem_par ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A21 — os números não rolam; só a lista de dentro da sub-aba.
          ⚠ P159a (mock `mock-extrato-banco-v1.html`, Gabriel 28/10): os dois quadrinhos (Banco/Sistema/Diferença e Sem par) viram UMA
          faixa de uma linha — sobra altura para a tabela. Os números são os MESMOS, os do DONO (`fn_conciliacao_resumo_mes` da conta,
          PR-CONC-SALDO-UMA-REGUA-02 D6): cada par é saídas · entradas; a diferença segue o sinal (zero neutro). O "Retido" fica no fim,
          sempre presente ("—" sem retido): a faixa não muda de forma com o dado. */}
      <div className="flex h-[22px] shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-b bg-muted/40 px-3 text-[10px] text-foreground/80"
        data-testid="resumo-espelho">
        <span>Banco{' '}
          <b className="font-semibold tabular-nums text-destructive" data-testid="topo-saidas-banco">{fmtOu(linhaDono?.banco.saidas)}</b>{' · '}
          <b className="font-semibold tabular-nums text-emerald-600" data-testid="topo-entradas-banco">{fmtOu(linhaDono?.banco.entradas)}</b></span>
        <span>Sistema{' '}
          <b className="font-semibold tabular-nums text-destructive" data-testid="topo-saidas-sistema">{fmtOu(linhaDono?.saidas)}</b>{' · '}
          <b className="font-semibold tabular-nums text-emerald-600" data-testid="topo-entradas-sistema">{fmtOu(linhaDono?.entradas)}</b></span>
        <span>Diferença{' '}
          <b className={cn('font-semibold tabular-nums', corDaDiferenca(linhaDono?.diferenca_saidas))} data-testid="topo-dif-saidas">{fmtOu(linhaDono?.diferenca_saidas)}</b>{' · '}
          <b className={cn('font-semibold tabular-nums', corDaDiferenca(linhaDono?.diferenca_entradas))} data-testid="topo-dif-entradas">{fmtOu(linhaDono?.diferenca_entradas)}</b></span>
        <span>Sem par:{' '}
          <b className="font-semibold tabular-nums" data-testid="topo-sem-par-extratos-qtde">{semParExt ? semParExt.qtde : '—'}</b> do banco (
          <b className={cn('font-semibold tabular-nums', corDaDiferenca(semParExt?.valor))} data-testid="topo-sem-par-extratos-valor">{fmtOu(semParExt?.valor)}</b>){' · '}
          <b className="font-semibold tabular-nums" data-testid="topo-sem-par-lancamentos-qtde">{semParLanc ? semParLanc.qtde : '—'}</b> do sistema (
          <b className={cn('font-semibold tabular-nums', corDaDiferenca(semParLanc?.valor))} data-testid="topo-sem-par-lancamentos-valor">{fmtOu(semParLanc?.valor)}</b>)</span>
        <span className="min-w-0 truncate text-muted-foreground" title={`Retido ${retidoTopo ? retidoTopo.texto : '—'}${retidoTopo?.titulo ? `\n${retidoTopo.titulo}` : ''}`}>
          Retido <span data-testid="topo-retido" title={retidoTopo?.titulo}>{retidoTopo ? retidoTopo.texto : '—'}</span></span>
      </div>

      {/* ⚠ A FILEIRA SÓ NASCE AQUI QUANDO NINGUÉM A MONTOU FORA — PR-SISTEMA-BARRA-COMPACTA-01. É o que o modal faz. Na aba da
          Conciliação ela vive na barra de ações, onde não custa altura, e aí `onAbaChange` chega preenchido. P159a: o `Segmentado`. */}
      {!soConferencia && !onAbaChange && (
        <div className="shrink-0 px-3 py-1">
          <Segmentado valor={aba} onEscolher={setAba} altura={22}
            opcoes={ABAS_ESPELHO.map((a) => ({ valor: a.key, rotulo: a.label }))} />
        </div>
      )}

      {!conferenciaEmModal && aba === 'conferencia' && conferencia}
      {abaCorpo === 'ofx' && (
        <ExtratoComAcoes data={data} inicial={inicial} internas={internas} sugestoesPorLinha={sugestoesPorLinha}
          clienteId={clienteId} contaId={contaId} onMudou={aoMudarConferencia} />
      )}
      {abaCorpo === 'sistema' && <AbaSistemaReal linha={linhaDono} onAbrir={onAbrirLancamento} />}
      {abaCorpo === 'evolucao' && (
        <AbaEvolucaoReal data={data} internos={internas.lancamentosInternos}
          onVerDia={(dia) => {
            if (onVerDiaNaConferencia) { onVerDiaNaConferencia(dia); return; }
            setDiaFocoInterno(dia);
            if (onAbaChange) onAbaChange('conferencia'); else setAba('conferencia');
          }} />
      )}

      {/* ⚠ A CONFERÊNCIA ABRE EM MODAL — PR-CONC-CONFERENCIA-MODAL-01. O corpo é o MESMO `AbaConferencia`: mesmas linhas, marcação,
          arrasto, barra de casar, ignorados e legenda.
          ⚠ P159a (mock `mock-conferencia-v1.html`, Gabriel 28/10): QUASE TELA CHEIA (sobra só a moldura de 10/12px), cabeçalho navy
          com o título e os CHIPS de filtro (no lugar do "Só não conciliados" e da faixa amarela "Mostrar vencidos"), a faixa de resumo
          de uma linha, e só a tabela rola. */}
      {conferenciaEmModal && (
        <Dialog open={aba === 'conferencia'} onOpenChange={(v) => { if (!v) fecharConferencia(); }}>
          <DialogContent className="w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] h-[calc(100vh-20px)] max-h-[calc(100vh-20px)] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden"
            data-testid="modal-conferencia">
            <div className="flex h-[30px] shrink-0 items-center gap-2.5 overflow-hidden bg-primary px-3 text-primary-foreground">
              {/* ⚠ D9 do P159a (Gabriel 28/10) — a EXCEÇÃO DECLARADA fora de tabela: o nome da conta longo empurrava os chips para fora da
                  faixa (o gate acusou). O título encolhe e termina em "…" com o texto inteiro no `title` (`data-reticencias-com-title`). */}
              <DialogTitle className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold" title={tituloConferencia} data-reticencias-com-title="">
                {tituloConferencia}
              </DialogTitle>
              {/* ⚠ CHIPS CLAROS, E NÃO O `Segmentado` (PR-CONC-SUGESTOES-CASAR-01): o segmentado marca a escolha em navy, e aqui o fundo
                  JÁ é navy. O escolhido é o branco. Todos com o MESMO peso: trocar de chip não desloca os outros. Os números são da mesa
                  que a tabela desenha (`contagensDaMesa`). */}
              <div className="flex shrink-0 items-center gap-1" data-testid="chips-conferencia">
                {CHIPS_DA_CONFERENCIA.map(({ k, rotulo }) => (
                  /* o número é da mesa que a tabela desenha */
                  <button key={k} type="button" onClick={() => setFiltroConf(k)} data-testid={`chip-${k}`} aria-pressed={filtroConf === k}
                    className={cn('h-[17px] whitespace-nowrap rounded-full border px-2 text-[10px] font-medium leading-[15px]',
                      filtroConf === k ? 'border-primary-foreground bg-primary-foreground text-primary' : 'border-primary-foreground/35 text-primary-foreground/85 hover:bg-primary-foreground/10')}>
                    {rotulo} {chips[k === 'sem_par' ? 'semPar' : k]}
                  </button>
                ))}
                {mostrarCandidatos && (
                  <button type="button" onClick={() => setMostrarVencidos((v) => !v)} data-testid="chip-vencidos" aria-pressed={mostrarVencidos}
                    disabled={nVencidos === 0} title={nVencidos === 0 ? 'nenhum lançamento vencido de meses anteriores em aberto' : 'em aberto de meses anteriores, no topo da lista'}
                    className={cn('h-[17px] whitespace-nowrap rounded-full border px-2 text-[10px] font-medium leading-[15px] disabled:opacity-50',
                      mostrarVencidos ? 'border-amber-200 bg-amber-100 text-amber-900' : 'border-amber-300/70 text-amber-200 hover:bg-primary-foreground/10')}>
                    Vencidos de meses anteriores {nVencidos}
                  </button>
                )}
              </div>
              <button type="button" onClick={fecharConferencia} aria-label="Fechar"
                className="ml-auto shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* abaixo de 1000px o vão entre os números encolhe (com 18px a faixa passava 12,6px da caixa em 750px) */}
            <div className="flex h-[21px] shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b bg-muted/40 px-3 text-[10px] text-foreground/80 min-[1000px]:gap-[18px]"
              data-testid="faixa-conferencia">
              {/* Os mesmos números da faixa do corpo — os do dono. */}
              <span>Saldo inicial <b className="font-semibold tabular-nums">{fmtOu(linhaDono?.saldo_inicial)}</b></span>
              <span>Banco: saídas <b className="font-semibold tabular-nums text-destructive">{fmtOu(linhaDono?.banco.saidas)}</b>
                {' · '}entradas <b className="font-semibold tabular-nums text-emerald-600">{fmtOu(linhaDono?.banco.entradas)}</b></span>
              <span>Sistema: saídas <b className="font-semibold tabular-nums text-destructive">{fmtOu(linhaDono?.saidas)}</b>
                {' · '}entradas <b className="font-semibold tabular-nums text-emerald-600">{fmtOu(linhaDono?.entradas)}</b></span>
              <span>Sem par: <b className="font-semibold tabular-nums">{semParExt?.qtde ?? '—'}</b> do banco
                {' · '}<b className="font-semibold tabular-nums">{semParLanc?.qtde ?? '—'}</b> do sistema</span>
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
