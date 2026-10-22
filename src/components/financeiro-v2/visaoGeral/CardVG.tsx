/**
 * FIN-VISAO-GERAL-01 PR 3 — o CARD esquerdo da Visão Geral (SPEC §3.3), pelo modo:
 *   · Entradas × saídas: Saldo 1º/mês · "Conciliado até dd/mm" (no mês vigente) · Entradas (total + grupos, valor e % do mês) · Saídas
 *     (idem) · Resultado · Saldo final (previsto no mês vigente/futuro).
 *   · Saídas | Entradas: donut pequeno + total (fonte maior) + grupos com valor, % e vs média · rodapé com o outro lado, o resultado e os
 *     saldos inicial e final.
 *   · Totais e itens na MESMA coluna de valor (a mesma grade de colunas). Tudo do banco: valor, % do mês e vs média vêm prontos.
 *   · A lista de grupos rola DENTRO do card (o card tem a altura do bloco, nunca a do conteúdo).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  COR, brl, corDoGrupo, corSinal, corVariacao, dataCurta, mil1, pct1, rotuloMes, vsMedia,
  type AlvoAnaliseVG, type LadoVG, type LinhaVG, type ModoVG, type TelaVG,
} from '@/lib/financeiro/visaoGeral';

const linhaDe = (tela: TelaVG, chave: string) => tela.linhas.find((l) => l.chave === chave);
const totalDe = (tela: TelaVG, lado: LadoVG) => tela.linhas.find((l) => l.tipo === 'total' && l.lado === lado);
const gruposDe = (tela: TelaVG, lado: LadoVG) => tela.linhas.filter((l) => l.tipo === 'grupo' && l.lado === lado);

export function CardVG({ tela, modo, sel, onAnalisar }: { tela: TelaVG; modo: ModoVG; sel: string; onAnalisar: (a: AlvoAnaliseVG) => void }) {
  const k = tela.meses.findIndex((m) => m.am === sel);
  const mes = tela.meses[k];
  const v = (l: LinhaVG | undefined) => (l && k >= 0 ? l.valores[k] ?? null : null);
  const previsto = !!mes?.previsto;
  if (k < 0) return <div className="text-[10px] text-muted-foreground">O mês escolhido está fora do período.</div>;
  return modo === 'flx'
    ? <CardFluxo tela={tela} k={k} sel={sel} v={v} previsto={previsto} vigente={!!mes?.vigente} onAnalisar={onAnalisar} />
    : <CardGrupos tela={tela} lado={modo === 'sai' ? 'saida' : 'entrada'} k={k} sel={sel} v={v} previsto={previsto} onAnalisar={onAnalisar} />;
}

const Titulo = ({ children }: { children: ReactNode }) => (
  <div className="flex h-[17px] shrink-0 items-baseline justify-between gap-2">
    <span className="whitespace-nowrap text-[11.5px] font-bold" data-testid="card-vg-titulo">{children}</span>
    <span className="whitespace-nowrap text-[9px] text-muted-foreground">clique para analisar</span>
  </div>
);

function CardFluxo({ tela, k, sel, v, previsto, vigente, onAnalisar }: {
  tela: TelaVG; k: number; sel: string; v: (l: LinhaVG | undefined) => number | null; previsto: boolean; vigente: boolean;
  onAnalisar: (a: AlvoAnaliseVG) => void;
}) {
  const si = v(linhaDe(tela, 'saldo_inicial'));
  const sf = v(linhaDe(tela, 'saldo_final'));
  const res = v(linhaDe(tela, 'resultado'));
  const futuro = previsto || vigente;
  const bloco = (lado: LadoVG) => {
    const t = totalDe(tela, lado);
    const cor = lado === 'saida' ? COR.saida : COR.entrada;
    return (
      <>
        <tr className="cursor-pointer border-b-2 border-[#1b2430]" onClick={() => onAnalisar({ lado, grupo: null, am: sel })} data-testid={`card-total-${lado}`}>
          <td className="h-5 truncate px-1 text-[10px] font-bold" title={lado === 'saida' ? 'Saídas' : 'Entradas'}>{lado === 'saida' ? 'Saídas' : 'Entradas'} <span className="text-[#8d9cad]">›</span></td>
          <td className="h-5 whitespace-nowrap px-1 text-right text-[13px] font-bold tabular-nums" style={{ color: cor }} data-testid={`card-valor-${lado}`}>{brl(v(t))}</td>
          <td className="h-5 whitespace-nowrap px-1 text-right text-[10px] font-bold tabular-nums text-muted-foreground">{v(t) == null ? '' : '100%'}</td>
        </tr>
        {gruposDe(tela, lado).map((g, gi) => (
          <tr key={g.chave} className="cursor-pointer border-b border-[#eef1f5] hover:bg-muted/40" onClick={() => onAnalisar({ lado, grupo: g.grupo ?? null, am: sel })}
            data-testid={`card-grupo-${g.chave}`}>
            <td className="h-[17px] truncate px-1 text-[10px]" title={`${g.rotulo} ›`}>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: corDoGrupo(lado, gi) }} />{g.rotulo} <span className="text-[#8d9cad]">›</span>
            </td>
            <td className="h-[17px] whitespace-nowrap px-1 text-right text-[10px] tabular-nums">{brl(v(g))}</td>
            <td className="h-[17px] whitespace-nowrap px-1 text-right text-[10px] tabular-nums text-muted-foreground">{pct1(g.pct_mes?.[k])}</td>
          </tr>
        ))}
      </>
    );
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Titulo>Entradas e saídas · {rotuloMes(sel)}{previsto ? ' (previsto)' : ''}</Titulo>
      <div className="mt-[3px] grid h-[17px] shrink-0 grid-cols-2 gap-2.5 text-[10px]">
        <span className="flex items-center justify-between bg-[#f1f3f6] px-1.5">
          <span className="whitespace-nowrap font-semibold">Saldo 1º/{rotuloMes(sel)}</span>
          <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: corSinal(si) }} data-testid="card-saldo-inicial">{brl(si)}</span>
        </span>
        {vigente ? (
          <span className="flex items-center justify-between bg-[#eaf4ec] px-1.5" data-testid="card-conciliado"
            title={tela.contas_sem_ancora.length ? `Contas sem saldo conciliado (fora do saldo): ${tela.contas_sem_ancora.join(', ')}` : 'A conta mais atrasada entre as escolhidas'}>
            <span className="whitespace-nowrap font-semibold">Conciliado até {dataCurta(tela.conciliado_ate)}</span>
            <span className="whitespace-nowrap text-[9px] text-muted-foreground">{tela.contas_sem_ancora.length ? `${tela.contas_sem_ancora.length} sem saldo` : ''}</span>
          </span>
        ) : (
          <span className="flex items-center px-1.5 text-muted-foreground">{previsto ? 'mês previsto' : 'mês conciliado'}</span>
        )}
      </div>
      <div className="mt-0.5 min-h-0 flex-1 overflow-y-auto" data-testid="card-vg-lista">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 118 }} /><col style={{ width: 46 }} /></colgroup>
          <tbody>{bloco('entrada')}{bloco('saida')}</tbody>
        </table>
      </div>
      <div className="flex h-[18px] shrink-0 items-center justify-between px-1 text-[10.5px] font-bold">
        <span>Resultado</span><span className="tabular-nums" style={{ color: corSinal(res) }} data-testid="card-resultado">{brl(res)}</span>
      </div>
      <div className="flex h-[18px] shrink-0 items-center justify-between bg-[#f1f3f6] px-1 text-[10.5px] font-bold">
        <span className="whitespace-nowrap">Saldo final{futuro ? ' previsto' : ''}</span>
        <span className="tabular-nums" style={{ color: corSinal(sf) }} data-testid="card-saldo-final">{brl(sf)}</span>
      </div>
    </div>
  );
}

function CardGrupos({ tela, lado, k, sel, v, previsto, onAnalisar }: {
  tela: TelaVG; lado: LadoVG; k: number; sel: string; v: (l: LinhaVG | undefined) => number | null; previsto: boolean;
  onAnalisar: (a: AlvoAnaliseVG) => void;
}) {
  const t = totalDe(tela, lado);
  const outro = totalDe(tela, lado === 'saida' ? 'entrada' : 'saida');
  const grupos = gruposDe(tela, lado);
  const cor = lado === 'saida' ? COR.saida : COR.entrada;
  const nome = lado === 'saida' ? 'Saídas' : 'Entradas';
  const res = v(linhaDe(tela, 'resultado'));
  const si = v(linhaDe(tela, 'saldo_inicial'));
  const sf = v(linhaDe(tela, 'saldo_final'));
  /* o donut desenha os % do mês que o banco deu (pct_mes): nenhuma divisão aqui */
  let acc = 0;
  const fatias = grupos.map((g, gi) => { const p = Math.max(0, g.pct_mes?.[k] ?? 0); const a = acc; acc += p; return `${corDoGrupo(lado, gi)} ${a}% ${acc}%`; });
  const fundo = fatias.length ? `conic-gradient(${fatias.join(', ')}, #eef1f5 ${acc}% 100%)` : '#eef1f5';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Titulo>{nome} por grupo · {rotuloMes(sel)}{previsto ? ' (previsto)' : ''}</Titulo>
      <div className="mt-[7px] flex min-h-0 flex-1 items-start gap-2.5">
        <div className="flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full" style={{ background: fundo }} role="img" aria-label="Gráfico de rosca">
          <div className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-white text-center">
            <span className="text-[7.5px] tracking-wide text-muted-foreground">{nome.toUpperCase()}</span>
            <span className="whitespace-nowrap text-[9.5px] font-bold tabular-nums" style={{ color: cor }} data-testid="card-donut-valor">{mil1(v(t))} mil</span>
          </div>
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="card-vg-lista">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 112 }} /><col style={{ width: 42 }} /><col style={{ width: 50 }} /></colgroup>
              <tbody>
                <tr className="cursor-pointer border-b-2 border-[#1b2430]" onClick={() => onAnalisar({ lado, grupo: null, am: sel })} data-testid={`card-total-${lado}`}>
                  <td className="h-[26px] truncate px-1 text-[10.5px] font-bold" title={`${nome} totais`}>{nome} totais <span className="text-[#8d9cad]">›</span></td>
                  <td className="h-[26px] whitespace-nowrap px-1 text-right text-[13px] font-bold tabular-nums" style={{ color: cor }} data-testid={`card-valor-${lado}`}>{brl(v(t))}</td>
                  <td className="h-[26px] whitespace-nowrap px-1 text-right text-[10px] font-bold tabular-nums text-muted-foreground">{v(t) == null ? '' : '100%'}</td>
                  <td />
                </tr>
                <tr className="text-[7.5px] text-muted-foreground">
                  <td className="px-1">GRUPO</td><td className="px-1 text-right">{rotuloMes(sel).toUpperCase()}</td><td className="px-1 text-right">%</td>
                  <td className="whitespace-nowrap px-1 text-right">VS MÉDIA</td>
                </tr>
                {grupos.map((g, gi) => (
                  <tr key={g.chave} className="cursor-pointer border-b border-[#eef1f5] hover:bg-muted/40" onClick={() => onAnalisar({ lado, grupo: g.grupo ?? null, am: sel })}
                    data-testid={`card-grupo-${g.chave}`}>
                    <td className="h-[21px] truncate px-1 text-[10.5px]" title={`${g.rotulo} ›`}>
                      <i className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: corDoGrupo(lado, gi) }} />{g.rotulo} <span className="text-[#8d9cad]">›</span>
                    </td>
                    <td className="h-[21px] whitespace-nowrap px-1 text-right text-[10.5px] tabular-nums">{brl(v(g))}</td>
                    <td className="h-[21px] whitespace-nowrap px-1 text-right text-[10px] tabular-nums text-muted-foreground">{pct1(g.pct_mes?.[k])}</td>
                    <td className="h-[21px] whitespace-nowrap px-1 text-right text-[10px] tabular-nums" style={{ color: corVariacao(lado, g.vs_media?.[k]) }}
                      data-testid={`card-vs-media-${g.chave}`}>{vsMedia(g.vs_media?.[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex h-5 shrink-0 items-center justify-between gap-2 px-1 text-[10px]">
            <span className="whitespace-nowrap font-semibold tabular-nums" style={{ color: lado === 'saida' ? COR.entrada : COR.saida }}>
              {lado === 'saida' ? 'Entradas' : 'Saídas'} {brl(v(outro))}</span>
            <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: corSinal(res) }}>Resultado {brl(res)}</span>
          </div>
          <div className="flex h-[18px] shrink-0 items-center justify-between gap-2 bg-[#f1f3f6] px-1 text-[10px]">
            <span className="whitespace-nowrap">Saldo inicial <b className="tabular-nums" style={{ color: corSinal(si) }}>{brl(si)}</b></span>
            <span className="whitespace-nowrap">Saldo final <b className="tabular-nums" style={{ color: corSinal(sf) }}>{brl(sf)}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
