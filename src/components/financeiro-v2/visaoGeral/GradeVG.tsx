/**
 * FIN-VISAO-GERAL-01 PR 3 — a GRADE da Visão Geral (SPEC §3.5), igual em todo modo: SALDO INICIAL · ENTRADAS › · grupos · SAÍDAS
 * TOTAIS › · grupos · RESULTADO · SALDO FINAL; colunas = meses do período + Total · Média · % (linha grossa e fundo cinza claro).
 *   · Tudo o que está escrito veio do banco (`fn_vg_tela`): a grade NÃO soma, NÃO tira média, NÃO calcula % — só escreve.
 *   · Mês selecionado: coluna com fundo leve + cabeçalho escuro com traço dourado (nunca borda em cada célula). Mês previsto: fundo
 *     cinza e itálico; cabeçalho "·P". Mais de 14 meses: R$ mil com 1 decimal. Ano na 2ª linha do cabeçalho na virada.
 *   · Vencido: no mês corrente, a célula com previsto vencido leva uma marca âmbar discreta (absoluta: não muda altura) e o valor no title.
 *   · Lista longa rola DENTRO do quadro (cabeçalho preso); o quadro tem altura do bloco, nunca do conteúdo.
 *   · P83 (Gabriel 23/10): cabeçalho de UMA linha (o ano só na virada, pequeno, antes do mês); linhas de grupo mais baixas e em fonte
 *     menor (cabe mais sem rolar); "Saldo inicial" em caixa normal e fonte menor; no TOTAL, o saldo inicial do PERÍODO e o saldo final do
 *     período (`total` das linhas de saldo, do banco) — "Resultado no mês" no TOTAL é o do período.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import {
  COR, brl, corSinal, mil1, n0, pct1, anoDe, mes0De, MESES_ABR,
  type AlvoAnaliseVG, type LinhaVG, type MesVG, type TelaVG,
} from '@/lib/financeiro/visaoGeral';

const FUNDO_RESUMO = 'rgba(68,84,106,.07)';

export function GradeVG({ tela, sel, onAnalisar, ampliado = false, acao }: {
  tela: TelaVG; sel: string; onAnalisar: (a: AlvoAnaliseVG) => void;
  /** P83 — no modal "ampliar": a grade inteira, sem rolagem */
  ampliado?: boolean;
  /** o botão "ampliar", no canto da 1ª célula do cabeçalho */
  acao?: ReactNode;
}) {
  const meses = tela.meses;
  /* R$ mil com 1 decimal: mais de 14 meses (SPEC §3.5) OU valor de mês na casa do milhão — "2.256.036" não cabe em 12 colunas a 1130px
     (medido na NJ, 22/10). É escrita do número que veio, não conta. */
  const maior = Math.max(0, ...tela.linhas.flatMap((l) => l.valores.map((v) => Math.abs(v ?? 0))));
  const comp = meses.length > 14 || maior >= 1_000_000;
  const fmt = comp ? mil1 : n0;
  const larguraMes = meses.length > 14 ? 52 : 46;
  const algumPrevisto = meses.some((m) => m.previsto);
  return (
    <div className={ampliado ? '' : 'h-full min-h-0 overflow-auto'} data-testid={ampliado ? 'grade-vg-ampliada' : 'grade-vg-rolagem'}>
      {/* no ampliado (print) o nome da linha cabe inteiro: a 1ª coluna com 230px */}
      <table className="w-full table-fixed border-collapse" style={{ minWidth: (ampliado ? 230 : 170) + meses.length * larguraMes + (comp ? 150 : 166) }}
        data-testid="grade-vg">
        <colgroup>
          <col style={{ width: ampliado ? 230 : 170 }} />
          {meses.map((m) => <col key={m.am} />)}
          <col style={{ width: comp ? 56 : 66 }} /><col style={{ width: comp ? 50 : 58 }} /><col style={{ width: 44 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-primary">
          <tr>
            <th className={cn(TH_REGUA, 'h-[19px] text-left align-middle text-[8.5px]')} title={`R$${comp ? ' mil' : ''} · ${algumPrevisto ? 'realizado + previsto' : 'realizado'}`}>
              <span className="flex items-center justify-between gap-1">
                <span className="truncate">R${comp ? ' mil' : ''} · {algumPrevisto ? 'realizado + previsto' : 'realizado'}</span>
                {acao && <span className="shrink-0 rounded bg-white/90">{acao}</span>}
              </span>
            </th>
            {meses.map((m, k) => {
              const virada = k === 0 || mes0De(m.am) === 0;
              return (
                <th key={m.am} data-testid={`grade-mes-${m.am}`}
                  className={cn(TH_REGUA, 'h-[19px] text-right align-middle leading-none', k > 0 && mes0De(m.am) === 0 ? 'border-l-2 border-l-[#c8d2de]' : 'border-l border-l-white/20')}
                  style={m.am === sel ? { background: '#1b2430', boxShadow: 'inset 0 -2px 0 #f2b84b' } : m.previsto ? { background: '#55657a' } : undefined}>
                  {virada && <span className="mr-[2px] text-[7px] font-normal opacity-75">{String(anoDe(m.am)).slice(2)}</span>}
                  <span>{MESES_ABR[mes0De(m.am)].toUpperCase()}{m.previsto && !comp ? ' ·P' : ''}</span>
                </th>
              );
            })}
            <th className={cn(TH_REGUA, 'h-[19px] border-l-2 border-l-[#c8d2de] text-right align-middle')} style={{ background: '#2f3d4f' }}>TOTAL</th>
            <th className={cn(TH_REGUA, 'h-[19px] border-l border-l-white/20 text-right align-middle')} style={{ background: '#2f3d4f' }}>MÉDIA</th>
            <th className={cn(TH_REGUA, 'h-[19px] border-l border-l-white/20 text-right align-middle')} style={{ background: '#2f3d4f' }}>%</th>
          </tr>
        </thead>
        <tbody>
          {tela.linhas.map((l) => <LinhaGrade key={l.chave} l={l} meses={meses} sel={sel} fmt={fmt} comp={comp} onAnalisar={onAnalisar} />)}
        </tbody>
      </table>
    </div>
  );
}

const TITULO_CARTAO = 'Pagamento de fatura de cartão de crédito que não está entre as contas escolhidas: o caixa cai, mas é transferência, '
  + 'não saída — a saída foi a compra no cartão. Saldo final = inicial + entradas − saídas − esta linha.';

function LinhaGrade({ l, meses, sel, fmt, comp, onAnalisar }: {
  l: LinhaVG; meses: MesVG[]; sel: string; fmt: (v: number | null | undefined) => string; comp: boolean; onAnalisar: (a: AlvoAnaliseVG) => void;
}) {
  const saldo = l.tipo === 'saldo';
  const forte = saldo || l.tipo === 'total' || l.tipo === 'resultado';
  const porSinal = saldo || l.tipo === 'resultado';
  /* P82 — "Pagamento de cartão (transferência)": o caixa cai por ela, mas não é saída (a saída foi a compra) — cor neutra */
  const cartao = l.tipo === 'cartao';
  const cor = porSinal ? undefined : cartao ? COR.muted : l.lado === 'saida' ? COR.saida : COR.entrada;
  const fundo = saldo || l.tipo === 'resultado' ? '#f1f3f6' : l.tipo === 'total' ? (l.lado === 'saida' ? '#fbeeee' : '#eef3fa') : '#fff';
  const clicavel = (l.tipo === 'total' || l.tipo === 'grupo') && !!l.lado;
  const recuo = l.tipo === 'grupo' ? 16 : l.tipo === 'transf' ? 26 : 5;
  const nome = l.tipo === 'total' || l.tipo === 'grupo' ? `${l.rotulo} ›` : l.rotulo;
  /* P83 — linhas de grupo (e a transferência) mais baixas e em fonte menor; o saldo inicial em fonte menor, sem negrito */
  const miuda = l.tipo === 'grupo' || l.tipo === 'transf';
  const saldoIni = l.chave === 'saldo_inicial';
  const fs = cn(comp ? 'text-[9px]' : '', miuda && 'h-[16px] text-[9px]', saldoIni && 'text-[9px]');
  const analisar = (am: string) => clicavel && onAnalisar({ lado: l.lado!, grupo: l.tipo === 'grupo' ? l.grupo ?? null : null, am });
  return (
    <tr data-testid={`grade-linha-${l.chave}`} data-tipo={l.tipo}
      className={cn('border-b border-[#eef1f5]', forte && !saldoIni && 'font-bold', saldoIni && 'font-semibold', clicavel && 'cursor-pointer hover:brightness-[.98]')}
      style={{ background: fundo }} onClick={() => analisar(sel)}
      title={clicavel ? `Analisar ${l.rotulo.toLowerCase()} (a análise abre no PR 4)` : cartao ? TITULO_CARTAO : undefined}>
      <td className={cn(TD_REGUA, 'truncate', miuda && 'h-[16px] text-[9.5px]', saldoIni && 'text-[9.5px]', l.tipo === 'transf' && 'text-[9px] font-normal opacity-80')}
        style={{ paddingLeft: recuo, color: cor }} title={nome}>{nome}</td>
      {meses.map((m, k) => {
        const v = l.valores[k] ?? null;
        const venc = m.vigente ? l.vencidos?.[k] ?? 0 : 0;
        return (
          <td key={m.am} data-testid={`grade-celula-${l.chave}-${m.am}`}
            className={cn(TD_REGUA_NUM, fs, 'relative border-l border-[#eef1f5]', m.am === sel && 'font-bold', m.am !== sel && m.previsto && 'italic')}
            style={{ color: porSinal ? corSinal(v) : cor, background: m.am === sel ? 'rgba(31,63,102,.07)' : m.previsto ? '#f8f9fb' : undefined }}
            title={venc > 0 ? `${brl(v)} — inclui ${brl(venc)} de previsto vencido (não pago)` : undefined}>
            {venc > 0 && <span aria-label="tem previsto vencido" data-testid="marca-vencido"
              className="pointer-events-none absolute left-0.5 top-0.5 h-[5px] w-[5px] rounded-full" style={{ background: '#d97400' }} />}
            {fmt(v)}
          </td>
        );
      })}
      {saldo ? (
        <>
          {/* P83 — no TOTAL, o saldo do PERÍODO (inicial do 1º mês; final do último), do banco */}
          <td data-testid={`grade-total-${l.chave}`} className={cn(TD_REGUA_NUM, fs, 'border-l-2 border-l-[#8a96a6] font-bold')}
            style={{ background: FUNDO_RESUMO, color: corSinal(l.total) }}>{l.total == null ? '' : fmt(l.total)}</td>
          <td className={cn(TD_REGUA, 'border-l border-l-[#dde2e8]')} style={{ background: FUNDO_RESUMO }} />
          <td className={cn(TD_REGUA, 'border-l border-l-[#dde2e8]')} style={{ background: FUNDO_RESUMO }} />
        </>
      ) : (
        <>
          <td data-testid={`grade-total-${l.chave}`} className={cn(TD_REGUA_NUM, fs, 'border-l-2 border-l-[#8a96a6] font-bold')}
            style={{ background: FUNDO_RESUMO, color: porSinal ? corSinal(l.total) : cor }}>{fmt(l.total)}</td>
          <td data-testid={`grade-media-${l.chave}`} className={cn(TD_REGUA_NUM, fs, 'border-l border-l-[#dde2e8] font-bold')}
            style={{ background: FUNDO_RESUMO, color: porSinal ? corSinal(l.media) : cor }}>{fmt(l.media)}</td>
          <td data-testid={`grade-pct-${l.chave}`} className={cn(TD_REGUA_NUM, 'border-l border-l-[#dde2e8] font-normal')}
            style={{ background: FUNDO_RESUMO, color: cor }}>{l.tipo === 'grupo' || l.tipo === 'transf' ? pct1(l.pct) : ''}</td>
        </>
      )}
    </tr>
  );
}
