/**
 * FIN-VISAO-GERAL-01 PR 3 — o CARD esquerdo da Visão Geral (SPEC §3.3), pelo modo:
 *   · Entradas × saídas: Saldo 1º/mês · "Conciliado até dd/mm" (no mês vigente) · Entradas (total + grupos, valor e % do mês) · Saídas
 *     (idem) · Resultado · Saldo final (previsto no mês vigente/futuro).
 *   · Saídas | Entradas: donut pequeno + total (fonte maior) + grupos com valor, % e vs média · rodapé com o outro lado, o resultado e os
 *     saldos inicial e final.
 *   · Totais e itens na MESMA coluna de valor (a mesma grade de colunas). Tudo do banco: valor, % do mês e vs média vêm prontos.
 *   · A lista de grupos rola DENTRO do card (o card tem a altura do bloco, nunca a do conteúdo).
 *   · P90 — o critério (mês · média · acumulado): o card escreve a série que o banco mandou para ele (`serieDoCriterio`) e a parte no
 *     intervalo (`pct_acum`); vencidos e "vs média" são do mês e só aparecem em "mês". No acumulado o saldo de cima é o inicial do
 *     PERÍODO (saldo inicial + resultado acumulado = saldo final do mês: o mesmo invariante do banco).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  COR, brl, corDoGrupo, corSinal, corVariacao, dataCurta, mil1, pct1, pctDoCriterio, rotuloDoCriterio, rotuloMes, serieDoCriterio, vsMedia,
  type AlvoAnaliseVG, type CriterioTelaVG, type LadoVG, type LinhaVG, type ModoVG, type TelaVG,
} from '@/lib/financeiro/visaoGeral';

const linhaDe = (tela: TelaVG, chave: string) => tela.linhas.find((l) => l.chave === chave);
const totalDe = (tela: TelaVG, lado: LadoVG) => tela.linhas.find((l) => l.tipo === 'total' && l.lado === lado);
const gruposDe = (tela: TelaVG, lado: LadoVG) => tela.linhas.filter((l) => l.tipo === 'grupo' && l.lado === lado);

/** P83 — o aviso no lugar do saldo quando o recorte não é de contas (fazenda/atividade): saldo existe só por conta */
export const AVISO_SEM_SALDO = 'Saldo existe só por conta — escolha contas para ver o saldo';

export function CardVG({ tela, modo, sel, onAnalisar, ampliado = false, acao, criterio = 'mes' }: {
  tela: TelaVG; modo: ModoVG; sel: string; onAnalisar: (a: AlvoAnaliseVG) => void;
  /** P90 — mês · média · acumulado (a série vem do banco) */
  criterio?: CriterioTelaVG;
  /** P83 — no modal "ampliar": todas as linhas (os grupos sem valor inclusive), sem rolagem */
  ampliado?: boolean;
  /** o botão "ampliar" no canto do título */
  acao?: ReactNode;
}) {
  const k = tela.meses.findIndex((m) => m.am === sel);
  const mes = tela.meses[k];
  const v = (l: LinhaVG | undefined) => (l && k >= 0 ? serieDoCriterio(l, criterio)[k] ?? null : null);
  const previsto = !!mes?.previsto;
  if (k < 0) return <div className="text-[10px] text-muted-foreground">O mês escolhido está fora do período.</div>;
  return modo === 'flx'
    ? <CardFluxo tela={tela} k={k} sel={sel} v={v} previsto={previsto} vigente={!!mes?.vigente} onAnalisar={onAnalisar} ampliado={ampliado} acao={acao} criterio={criterio} />
    : <CardGrupos tela={tela} lado={modo === 'sai' ? 'saida' : 'entrada'} k={k} sel={sel} v={v} previsto={previsto} onAnalisar={onAnalisar} ampliado={ampliado} acao={acao} criterio={criterio} />;
}

const Titulo = ({ children, acao }: { children: ReactNode; acao?: ReactNode }) => (
  <div className="flex h-[16px] shrink-0 items-center justify-between gap-2">
    <span className="whitespace-nowrap text-[11px] font-bold" data-testid="card-vg-titulo">{children}</span>
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="whitespace-nowrap text-[8.5px] text-muted-foreground">clique para analisar</span>
      {acao}
    </span>
  </div>
);

/** P83 — os grupos do mês: com valor, na ordem do banco; os sem valor recolhidos numa linha (no ampliado, todos à vista) */
const comValor = (g: LinhaVG, k: number, c: CriterioTelaVG) => (serieDoCriterio(g, c)[k] ?? 0) !== 0;
/** P90 — o saldo de cima: o 1º do mês; no acumulado, o inicial do PERÍODO (o do 1º mês, do banco) */
const saldoDeCima = (tela: TelaVG, k: number, c: CriterioTelaVG) => {
  const l = linhaDe(tela, 'saldo_inicial');
  const i = c === 'acumulado' ? 0 : k;
  return { valor: l?.valores[i] ?? null, rotulo: c === 'acumulado' ? `Saldo inicial · ${rotuloMes(tela.meses[0].am)}` : `Saldo 1º/${rotuloMes(tela.meses[k].am)}` };
};

function CardFluxo({ tela, k, sel, v, previsto, vigente, onAnalisar, ampliado, acao, criterio }: {
  tela: TelaVG; k: number; sel: string; v: (l: LinhaVG | undefined) => number | null; previsto: boolean; vigente: boolean;
  onAnalisar: (a: AlvoAnaliseVG) => void; ampliado: boolean; acao?: ReactNode; criterio: CriterioTelaVG;
}) {
  const semSaldo = !!tela.sem_saldo;
  const cima = saldoDeCima(tela, k, criterio);
  const si = cima.valor;
  const sf = v(linhaDe(tela, 'saldo_final'));
  const res = v(linhaDe(tela, 'resultado'));
  const futuro = previsto || vigente;
  const venc = (l: LinhaVG | undefined) => (criterio === 'mes' && l?.vencidos?.[k] ? l.vencidos[k] : null);
  const bloco = (lado: LadoVG) => {
    const t = totalDe(tela, lado);
    const cor = lado === 'saida' ? COR.saida : COR.entrada;
    const grupos = gruposDe(tela, lado);
    const vistos = ampliado ? grupos : grupos.filter((g) => comValor(g, k, criterio));
    const zerados = grupos.length - vistos.length;
    return (
      <>
        <tr className="cursor-pointer border-b-2 border-[#1b2430]" onClick={() => onAnalisar({ lado, grupo: null, am: sel })} data-testid={`card-total-${lado}`}>
          {/* P79 — quanto do mês é ATRASO: o vencido não realizado que entrou neste mês (do banco), ao lado do rótulo; sem vencido, nada */}
          <td className="h-[14px] truncate px-1 text-[9px] font-bold leading-[13px]" title={`${lado === 'saida' ? 'Saídas' : 'Entradas'}${venc(t) ? ` · dos quais vencidos ${brl(venc(t))}` : ''}`}>
            {lado === 'saida' ? 'Saídas' : 'Entradas'} <span className="text-[#8d9cad]">›</span>
            {venc(t) ? <span className="ml-1.5 text-[9px] font-semibold text-amber-700" data-testid={`card-vencido-${lado}`}>vencidos {brl(venc(t))}</span> : null}
          </td>
          <td className="h-[14px] whitespace-nowrap px-1 text-right text-[11px] font-bold leading-[13px] tabular-nums" style={{ color: cor }} data-testid={`card-valor-${lado}`}>{brl(v(t))}</td>
          <td className="h-[14px] whitespace-nowrap px-1 text-right text-[9px] font-bold leading-[13px] tabular-nums" style={{ color: cor }}>{v(t) == null ? '' : '100%'}</td>
        </tr>
        {vistos.map((g) => {
          const gi = grupos.indexOf(g);
          return (
            <tr key={g.chave} className="cursor-pointer border-b border-[#eef1f5] hover:bg-muted/40" onClick={() => onAnalisar({ lado, grupo: g.grupo ?? null, am: sel })}
              data-testid={`card-grupo-${g.chave}`}>
              <td className="h-[12px] truncate px-1 text-[9px] leading-[11px]" title={`${g.rotulo} ›`}>
                <i className="mr-1.5 inline-block h-[6px] w-[6px] rounded-sm align-middle" style={{ background: corDoGrupo(lado, gi) }} />{g.rotulo} <span className="text-[#8d9cad]">›</span>
              </td>
              <td className="h-[12px] whitespace-nowrap px-1 text-right text-[9px] leading-[11px] tabular-nums" style={{ color: cor }}>{brl(v(g))}</td>
              <td className="h-[12px] whitespace-nowrap px-1 text-right text-[8.5px] leading-[11px] tabular-nums" style={{ color: cor }}>{pct1(pctDoCriterio(g, criterio)?.[k])}</td>
            </tr>
          );
        })}
        {zerados > 0 && (
          <tr className="border-b border-[#eef1f5]" data-testid={`card-zerados-${lado}`}>
            <td colSpan={3} className="h-[12px] px-1 text-[8.5px] leading-[11px] text-muted-foreground"
              title={grupos.filter((g) => !comValor(g, k, criterio)).map((g) => g.rotulo).join(', ')}>
              + {zerados} {zerados === 1 ? 'grupo' : 'grupos'} sem valor {criterio === 'mes' ? 'no mês' : 'no período'}
            </td>
          </tr>
        )}
      </>
    );
  };
  return (
    <div className={cn('flex min-h-0 flex-col', !ampliado && 'h-full')}>
      <Titulo acao={acao}>Entradas e saídas · {rotuloDoCriterio(criterio, tela.meses[0].am, sel)}{previsto ? ' (previsto)' : ''}</Titulo>
      {/* P83 — o lugar do saldo existe sempre (a altura não muda); sem contas no recorte, o aviso fica nele */}
      {semSaldo ? (
        <div className="mt-[3px] flex h-[17px] shrink-0 items-center bg-[#fdf6e7] px-1.5 text-[9.5px] text-amber-800" data-testid="card-sem-saldo">{AVISO_SEM_SALDO}</div>
      ) : (
      <div className="mt-[3px] grid h-[17px] shrink-0 grid-cols-2 gap-2.5 text-[9.5px]">
        <span className="flex items-center justify-between bg-[#f1f3f6] px-1.5">
          <span className="whitespace-nowrap font-semibold" data-testid="card-saldo-inicial-rotulo">{cima.rotulo}</span>
          <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: corSinal(si) }} data-testid="card-saldo-inicial">{brl(si)}</span>
        </span>
        {vigente ? (
          <span className="flex items-center justify-between bg-[#eaf4ec] px-1.5" data-testid="card-conciliado"
            title={`Saldo das contas escolhidas no dia do conciliado (a conta mais atrasada entre elas)${tela.contas_sem_ancora.length ? ` · contas sem saldo conciliado (fora do saldo): ${tela.contas_sem_ancora.join(', ')}` : ''}`}>
            <span className="whitespace-nowrap font-semibold">Conciliado até {dataCurta(tela.conciliado_ate)}</span>
            {/* P70 — o saldo das contas escolhidas NAQUELE dia (do banco); conta sem saldo conciliado: a marca âmbar, o nome no title */}
            <span className="flex items-center gap-1 whitespace-nowrap font-bold tabular-nums">
              {tela.contas_sem_ancora.length ? <span className="text-[8.5px] font-semibold text-amber-700" data-testid="card-conciliado-sem-ancora">{tela.contas_sem_ancora.length} sem saldo ·</span> : null}
              <span style={{ color: corSinal(tela.conciliado_saldo ?? 0) }} data-testid="card-conciliado-saldo">{tela.conciliado_saldo == null ? '—' : brl(tela.conciliado_saldo)}</span>
            </span>
          </span>
        ) : (
          <span className="flex items-center px-1.5 text-muted-foreground">{previsto ? 'mês previsto' : 'mês conciliado'}</span>
        )}
      </div>
      )}
      <div className={cn('mt-0.5', ampliado ? '' : 'min-h-0 flex-1 overflow-y-auto')} data-testid="card-vg-lista">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 112 }} /><col style={{ width: 42 }} /></colgroup>
          <tbody>{bloco('entrada')}{bloco('saida')}</tbody>
        </table>
      </div>
      {/* P100 item 8 — um respiro FIXO antes do "Resultado" (6px + a borda): a última saída nunca encosta nele. A lista de cima é a que
          estica e rola; "Resultado" e "Saldo final" ficam presos embaixo, na mesma posição com 1 ou 8 grupos */}
      <div className="mt-[6px] flex h-[16px] shrink-0 items-center justify-between border-t border-[#cfd6df] px-1 text-[10px] font-bold" data-testid="card-linha-resultado" data-desloca="">
        <span>Resultado</span><span className="tabular-nums" style={{ color: corSinal(res) }} data-testid="card-resultado">{brl(res)}</span>
      </div>
      <div className="flex h-[16px] shrink-0 items-center justify-between bg-[#f1f3f6] px-1 text-[10px] font-bold" data-testid="card-linha-saldo-final" data-desloca="">
        {semSaldo ? <span /> : (
          <>
            <span className="whitespace-nowrap">Saldo final{futuro ? ' previsto' : ''}</span>
            <span className="tabular-nums" style={{ color: corSinal(sf) }} data-testid="card-saldo-final">{brl(sf)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CardGrupos({ tela, lado, k, sel, v, previsto, onAnalisar, ampliado, acao, criterio }: {
  tela: TelaVG; lado: LadoVG; k: number; sel: string; v: (l: LinhaVG | undefined) => number | null; previsto: boolean;
  onAnalisar: (a: AlvoAnaliseVG) => void; ampliado: boolean; acao?: ReactNode; criterio: CriterioTelaVG;
}) {
  const t = totalDe(tela, lado);
  const outro = totalDe(tela, lado === 'saida' ? 'entrada' : 'saida');
  const grupos = gruposDe(tela, lado);
  const cor = lado === 'saida' ? COR.saida : COR.entrada;
  const nome = lado === 'saida' ? 'Saídas' : 'Entradas';
  const res = v(linhaDe(tela, 'resultado'));
  const cima = saldoDeCima(tela, k, criterio);
  const si = cima.valor;
  const sf = v(linhaDe(tela, 'saldo_final'));
  /* o donut desenha os % que o banco deu (pct_mes; pct_acum na média/acumulado): nenhuma divisão aqui */
  let acc = 0;
  const fatias = grupos.map((g, gi) => { const p = Math.max(0, pctDoCriterio(g, criterio)?.[k] ?? 0); const a = acc; acc += p; return `${corDoGrupo(lado, gi)} ${a}% ${acc}%`; });
  const fundo = fatias.length ? `conic-gradient(${fatias.join(', ')}, #eef1f5 ${acc}% 100%)` : '#eef1f5';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Titulo acao={acao}>{nome} por grupo · {rotuloDoCriterio(criterio, tela.meses[0].am, sel)}{previsto ? ' (previsto)' : ''}</Titulo>
      <div className="mt-[7px] flex min-h-0 flex-1 items-start gap-2.5">
        <div className="flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full" style={{ background: fundo }} role="img" aria-label="Gráfico de rosca">
          <div className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-white text-center">
            <span className="text-[7.5px] tracking-wide text-muted-foreground">{nome.toUpperCase()}</span>
            <span className="whitespace-nowrap text-[9.5px] font-bold tabular-nums" style={{ color: cor }} data-testid="card-donut-valor">{mil1(v(t))} mil</span>
          </div>
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <div className={cn(ampliado ? '' : 'min-h-0 flex-1 overflow-y-auto')} data-testid="card-vg-lista">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 112 }} /><col style={{ width: 42 }} /><col style={{ width: 50 }} /></colgroup>
              <tbody>
                <tr className="cursor-pointer border-b-2 border-[#1b2430]" onClick={() => onAnalisar({ lado, grupo: null, am: sel })} data-testid={`card-total-${lado}`}>
                  <td className="h-[20px] truncate px-1 text-[10px] font-bold" title={`${nome} totais`}>{nome} totais <span className="text-[#8d9cad]">›</span></td>
                  <td className="h-[20px] whitespace-nowrap px-1 text-right text-[12px] font-bold tabular-nums" style={{ color: cor }} data-testid={`card-valor-${lado}`}>{brl(v(t))}</td>
                  <td className="h-[20px] whitespace-nowrap px-1 text-right text-[9.5px] font-bold tabular-nums" style={{ color: cor }}>{v(t) == null ? '' : '100%'}</td>
                  <td />
                </tr>
                <tr className="text-[7.5px] text-muted-foreground">
                  <td className="px-1">GRUPO</td><td className="px-1 text-right">{criterio === 'mes' ? rotuloMes(sel).toUpperCase() : criterio === 'media' ? 'MÉDIA' : 'ACUM.'}</td><td className="px-1 text-right">%</td>
                  <td className="whitespace-nowrap px-1 text-right">VS MÉDIA</td>
                </tr>
                {grupos.map((g, gi) => (ampliado || comValor(g, k, criterio)) && (
                  <tr key={g.chave} className="cursor-pointer border-b border-[#eef1f5] hover:bg-muted/40" onClick={() => onAnalisar({ lado, grupo: g.grupo ?? null, am: sel })}
                    data-testid={`card-grupo-${g.chave}`}>
                    <td className="h-[16px] truncate px-1 text-[9.5px]" title={`${g.rotulo} ›`}>
                      <i className="mr-1.5 inline-block h-[7px] w-[7px] rounded-sm align-middle" style={{ background: corDoGrupo(lado, gi) }} />{g.rotulo} <span className="text-[#8d9cad]">›</span>
                    </td>
                    <td className="h-[16px] whitespace-nowrap px-1 text-right text-[9.5px] tabular-nums" style={{ color: cor }}>{brl(v(g))}</td>
                    <td className="h-[16px] whitespace-nowrap px-1 text-right text-[9px] tabular-nums" style={{ color: cor }}>{pct1(pctDoCriterio(g, criterio)?.[k])}</td>
                    <td className="h-[16px] whitespace-nowrap px-1 text-right text-[9px] tabular-nums" style={{ color: corVariacao(lado, g.vs_media?.[k]) }}
                      data-testid={`card-vs-media-${g.chave}`}>{criterio === 'mes' ? vsMedia(g.vs_media?.[k]) : '—'}</td>
                  </tr>
                ))}
                {!ampliado && grupos.some((g) => !comValor(g, k, criterio)) && (
                  <tr data-testid={`card-zerados-${lado}`}>
                    <td colSpan={4} className="h-[14px] px-1 text-[8.5px] text-muted-foreground" title={grupos.filter((g) => !comValor(g, k, criterio)).map((g) => g.rotulo).join(', ')}>
                      + {grupos.filter((g) => !comValor(g, k, criterio)).length} sem valor {criterio === 'mes' ? 'no mês' : 'no período'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex h-5 shrink-0 items-center justify-between gap-2 px-1 text-[10px]">
            <span className="whitespace-nowrap font-semibold tabular-nums" style={{ color: lado === 'saida' ? COR.entrada : COR.saida }}>
              {lado === 'saida' ? 'Entradas' : 'Saídas'} {brl(v(outro))}</span>
            <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: corSinal(res) }}>Resultado {brl(res)}</span>
          </div>
          <div className="flex h-[18px] shrink-0 items-center justify-between gap-2 bg-[#f1f3f6] px-1 text-[10px]">
            {tela.sem_saldo ? <span className="truncate text-[9.5px] text-amber-800" title={AVISO_SEM_SALDO} data-testid="card-sem-saldo">{AVISO_SEM_SALDO}</span> : (
              <>
                <span className="whitespace-nowrap">{criterio === 'acumulado' ? cima.rotulo : 'Saldo inicial'} <b className="tabular-nums" style={{ color: corSinal(si) }}>{brl(si)}</b></span>
                <span className="whitespace-nowrap">Saldo final <b className="tabular-nums" style={{ color: corSinal(sf) }}>{brl(sf)}</b></span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
