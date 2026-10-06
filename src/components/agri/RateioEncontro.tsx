/**
 * A ABA RATEIO DO MODAL DE VALOR, NO ADMINISTRATIVO — DRE-RATEIO-MODAL-01 (Gabriel, 06/10/2026).
 *
 * "Toda vez que eu vejo um rateio, eu abro aquele modalzinho e ele tem que me mostrar claramente qual é o
 *  total, o que está rateando para pecuária ou agricultura […] tem que ter um encontro de contas ali que
 *  prova que está sendo feito corretamente."
 *
 * ⚠ ESTA TELA NÃO FAZ CONTA. O total, cada parte, o % de cada uma, a soma das partes, a diferença e o mês
 *   a mês vêm do banco (`fn_painel_rateio_detalhe`: `resumo`, `por_mes`, `por_mes_total`), lidos por
 *   `lerEncontroRateio`. Aqui só se escolhe o que desenhar e em que cor. Preso por teste de fonte.
 * ⚠ LAYOUT FIXO: Resumo e Mês a mês ocupam a MESMA caixa (a área de rolagem do modal, que aqui não rola);
 *   quem rola, se precisar, é a tabela de baixo do Resumo e o corpo do Mês a mês, com cabeçalho e total fixos.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import { Donut } from '@/components/agri/dreGrade';
import {
  parteDoDestino, parteMudaNoPeriodo, ROTULO_DESTINO,
  type DestinoRateio, type EncontroRateio, type MesDoRateio,
} from '@/lib/agri/encontroRateio';

/** Uma linha da tabela "Dentro da atividade": a fazenda (pecuária) ou a cultura (lavoura). */
export interface LinhaDentro {
  chave: string;
  nome: string;
  /** Cabeças médias ou hectares; `null` = o hospedeiro não tem o dado. */
  base: number | null;
  pct: number | null;
  valor: number | null;
  destaque: boolean;
}

export interface DentroDaAtividade {
  titulo: string;
  legenda: string;
  colNome: string;
  colBase: string;
  casasBase: number;
  linhas: LinhaDentro[];
  rotuloTotal: string;
  totalBase: number | null;
  totalValor: number | null;
  /** Escrito no lugar das linhas quando o hospedeiro não tem a divisão. */
  vazio?: string;
}

/** O que o modal entrega à aba: o retorno do banco e o que destacar. */
export interface EncontroValorDre {
  dados: EncontroRateio;
  /** A atividade do DRE aberto. */
  atividade: 'pecuaria' | 'agricultura';
  /**
   * O GRUPO DE CUSTO da linha clicada (Mão de Obra, Máquinas…), ou `null`. Com grupo, os dois blocos de cima são o
   * administrativo INTEIRO (a RPC não abre o rateio por atividade por grupo) e dizem isso no cabeçalho.
   */
  grupo: string | null;
  /**
   * O NÚMERO DA GRADE DO DRE para a mesma parcela que o Resumo destaca (o total da pecuária; a safra, na lavoura) —
   * o que o modal já recebe do hospedeiro. `null` = não há o que comparar (com grupo, ou sem o DRE do período).
   * ⚠ A tela só COMPARA os dois e os escreve lado a lado; não subtrai (dívida DRE-RATEIO-TOTAL-CENTAVO-01).
   */
  gradeTotal: number | null;
  /** Os motivos do "não alocado" que a RPC escreveu (sem a silvicultura, que é parte própria). */
  motivosNaoAlocado: string[];
  dentro: DentroDaAtividade | null;
}

export type VisaoRateio = 'resumo' | 'mes';

/* A cor de cada destino no donut e na legenda: pecuária navy, agricultura verde, o que não tem DRE cinza. */
export const COR_DESTINO: Record<DestinoRateio, string> = {
  pecuaria: 'hsl(var(--primary))', agricultura: '#15803d', silvicultura: '#9ca3af', nao_alocado: '#d1d5db',
};

const REGRA_ATIVIDADE = 'chave do ano · meses com a atividade';
const DICA_ATIVIDADE = 'Chave declarada do ano aplicada só aos meses em que a atividade existe.';
const DICA_SILVICULTURA = 'A silvicultura ainda não tem DRE: o custo existe e espera o seu.';
export const FRASE_PARTE_MUDA = 'a parte muda quando uma atividade começa ou termina no período';
export const LEGENDA_CABECAS = 'critério: cabeças médias no período — a fatia de cada fazenda muda com o período escolhido';
export const TITULO_ARREDONDAMENTO = 'soma das parcelas arredondadas a centavos × total';
export const ROTULO_TODOS_OS_GRUPOS = 'administrativo inteiro · todos os grupos';
export const TITULO_TODOS_OS_GRUPOS = 'o rateio por atividade não é aberto por grupo; a tabela abaixo é do grupo escolhido';
export const TITULO_GRADE_DIFERE = 'A grade do DRE soma células já arredondadas (grupo × fazenda); o resumo arredonda o total. '
  + 'Os dois números diferem só pelo arredondamento.';
/** O aviso do slot sob "Para onde foi": os dois números lado a lado, prontos — nenhuma conta. */
export const textoGradeDifere = (grade: number, resumo: number) =>
  `grade do DRE: R$ ${formatNum(grade, 2)} · resumo: R$ ${formatNum(resumo, 2)}`;
export const LEGENDA_AREA = 'critério: área plantada de cada cultura na safra';

/* ⚠ `py-0`: a célula de tabela tem 1px de padding vertical do navegador; com ele a linha media 22px, não 18 (medido).
   A linha de dado é 17 + 1 da borda de cima = 18. */
const TH = 'h-[18px] whitespace-nowrap bg-primary px-1.5 py-0 text-center text-[9.5px] font-semibold leading-[18px] text-primary-foreground';
const TD = 'h-[17px] whitespace-nowrap px-1.5 py-0 text-[10px] leading-[17px]';
const NUM = `${TD} text-right tabular-nums`;
const CORTA = 'overflow-hidden text-ellipsis';
const DESTAQUE = 'bg-primary/10 font-semibold';
const FILETE = 'shadow-[inset_3px_0_0_0_hsl(var(--primary))]';
const DIVISOR = 'border-l border-border';

const MENOS = '−';
const modulo = (v: number) => Math.abs(v);

/**
 * O VALOR DE UM CUSTO: ▼ vermelho (saiu); o negativo (estorno) inverte — ▲ verde, com o "−" colado.
 * Zero é "0,00" apagado, sem seta; ausente é "—".
 */
export function ValorRateio({ v, forte }: { v: number | null; forte?: boolean }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (v === 0) return <span className="text-muted-foreground">0,00</span>;
  return (
    <span className={cn(v > 0 ? COR_SINAL.neg : COR_SINAL.pos, forte && 'font-semibold')}>
      {v > 0 ? '▼ ' : `▲ ${MENOS}`}{formatNum(modulo(v), 2)}
    </span>
  );
}

/** A DIFERENÇA: zero é a prova ("0,00 ✓", verde); qualquer outra coisa aparece em vermelho, com o sinal. */
export function DiferencaRateio({ v }: { v: number }) {
  if (v === 0) return <span className={cn(COR_SINAL.pos, 'font-semibold')} data-testid="diferenca-zero">0,00 ✓</span>;
  return (
    <span className={cn(COR_SINAL.neg, 'font-semibold')} data-testid="diferenca-aberta">
      {v < 0 ? MENOS : '+'}{formatNum(modulo(v), 2)}
    </span>
  );
}

/**
 * O ARREDONDAMENTO: o centavo que sobra entre o total e a soma das parcelas arredondadas — do banco, à vista.
 * Zero é "0,00" apagado; fora disso, o valor com o sinal, em âmbar (não é erro: é centavo de arredondamento).
 */
export function ArredondamentoRateio({ v }: { v: number }) {
  if (v === 0) return <span className="text-muted-foreground" data-testid="arredondamento-zero">0,00</span>;
  return (
    <span className="font-semibold text-amber-700" data-testid="arredondamento-aberto">
      {v < 0 ? MENOS : '+'}{formatNum(modulo(v), 2)}
    </span>
  );
}

const pctTexto = (p: number | null) => (p == null ? '—' : `${formatNum(p, 1)}%`);
const MESES: Record<string, string> = {
  '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'set', '10': 'out', '11': 'nov', '12': 'dez',
};
const rotuloDoMes = (am: string) => `${MESES[am.slice(5, 7)] ?? am.slice(5, 7)}/${am.slice(2, 4)}`;

function Caixa({ titulo, extra, children, className, testid }: {
  titulo: string; extra?: ReactNode; children: ReactNode; className?: string; testid: string;
}) {
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border', className)} data-testid={testid}>
      <div className="flex h-[18px] shrink-0 items-center gap-2 bg-muted/60 px-2 text-[10px] font-semibold">
        <span className="shrink-0 whitespace-nowrap">{titulo}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════════ RESUMO ══════════════════════════ */

/** Com grupo de custo escolhido: o cabeçalho das duas caixas de cima diz que elas são o administrativo inteiro. */
function MarcaTodosOsGrupos({ grupo }: { grupo: string | null }) {
  if (grupo == null) return null;
  return (
    <span className={cn('min-w-0 flex-1 text-right font-normal text-amber-700', CORTA, 'whitespace-nowrap')}
      title={`${ROTULO_TODOS_OS_GRUPOS} — ${TITULO_TODOS_OS_GRUPOS}`} data-testid="marca-todos-os-grupos">
      {ROTULO_TODOS_OS_GRUPOS}
    </span>
  );
}

function BlocoTotal({ e }: { e: EncontroValorDre }) {
  const fatias = e.dados.partes.filter(p => p.valor > 0);
  return (
    <Caixa titulo="Administrativo do período" testid="rateio-bloco-total" className="w-[300px] shrink-0"
      extra={<MarcaTodosOsGrupos grupo={e.grupo} />}>
      <div className="flex min-h-0 flex-1 items-center gap-2 px-2">
        <Donut tamanho={130} total={e.dados.bruto} rotuloTotal="total"
          dados={fatias.map(p => ({ nome: p.destino, valor: p.valor }))}
          cor={(_i, nome) => COR_DESTINO[e.dados.partes.find(p => p.destino === nome)?.destino ?? 'nao_alocado']}
          centro={<>
            <span className="text-[9.5px] text-muted-foreground">total</span>
            <span className="text-[10px] font-bold leading-tight tabular-nums" data-testid="rateio-total-centro">
              {formatNum(e.dados.bruto, 2)}
            </span>
          </>} />
        <ul className="min-w-0 flex-1 space-y-[3px]" data-testid="rateio-legenda">
          {fatias.map(p => (
            <li key={p.destino} data-destino={p.destino}
              className={cn('flex items-center gap-1.5 text-[10px] leading-[14px]', p.destino === e.atividade && 'font-bold')}>
              <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: COR_DESTINO[p.destino] }} />
              <span className={cn('min-w-0 flex-1', CORTA, 'whitespace-nowrap')} title={ROTULO_DESTINO[p.destino]}>
                {ROTULO_DESTINO[p.destino]}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">{pctTexto(p.pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Caixa>
  );
}

function BlocoDestinos({ e }: { e: EncontroValorDre }) {
  const d = e.dados;
  const naoAlocado = parteDoDestino(d, 'nao_alocado');
  const safras = e.atividade === 'agricultura' ? d.porSafra ?? [] : [];
  /* Na lavoura com safra o número do DRE é o da SAFRA: o selo vai nela; a agricultura fica só realçada. */
  const seloNaSafra = safras.some(s => s.safraId != null);
  const selo = <span className="ml-1 rounded-[3px] bg-primary px-1 text-[9.5px] font-medium leading-[13px] text-primary-foreground">este DRE</span>;
  const linha = (chave: string, rotulo: ReactNode, titulo: string, regra: string, dicaRegra: string | undefined,
    pct: string, valor: ReactNode, o: { destaque?: boolean; recuo?: boolean; forte?: boolean; topo?: boolean } = {}) => (
    <tr key={chave} data-linha={chave} data-destaque={o.destaque ? 'sim' : undefined}
      className={cn('border-t border-slate-100', o.destaque && DESTAQUE, o.forte && 'font-semibold', o.topo && 'border-t-border bg-muted/40')}>
      <td className={cn(TD, CORTA, o.destaque && FILETE)} style={{ paddingLeft: o.recuo ? 20 : 6 }} title={titulo}>{rotulo}</td>
      <td className={cn(TD, CORTA, 'font-normal text-muted-foreground')} title={dicaRegra ?? regra}>{regra}</td>
      <td className={NUM}>{pct}</td>
      <td className={NUM}>{valor}</td>
    </tr>
  );
  /* A parcela que o Resumo destaca como "este DRE": a safra aberta (lavoura) ou a atividade. Só para COMPARAR com a grade. */
  const destacada = safras.find(s => s.safraId != null)?.valor ?? parteDoDestino(d, e.atividade)?.valor ?? null;
  const gradeDifere = e.gradeTotal != null && destacada != null && e.gradeTotal !== destacada;
  return (
    <Caixa titulo="Para onde foi o administrativo" testid="rateio-bloco-destinos" className="flex-1"
      extra={<MarcaTodosOsGrupos grupo={e.grupo} />}>
      <table className="w-full table-fixed border-collapse">
        <colgroup><col /><col style={{ width: 196 }} /><col style={{ width: 66 }} /><col style={{ width: 118 }} /></colgroup>
        <thead><tr>
          <th className={TH}>Destino</th><th className={TH}>Regra</th><th className={TH}>% do total</th><th className={TH}>Valor</th>
        </tr></thead>
        <tbody>
          {linha('bruto', 'Administrativo no período (bruto)', 'Administrativo no período (bruto)',
            'lançamentos administrativos', undefined, '100,0%', <ValorRateio v={d.bruto} forte />, { forte: true })}
          {d.partes.filter(p => p.destino !== 'nao_alocado').flatMap(p => {
            const aberta = p.destino === e.atividade;
            const regra = p.destino === 'silvicultura' ? 'sem DRE' : REGRA_ATIVIDADE;
            const dica = p.destino === 'silvicultura' ? DICA_SILVICULTURA : DICA_ATIVIDADE;
            const out = [linha(p.destino, <>{ROTULO_DESTINO[p.destino]}{aberta && !seloNaSafra && selo}</>, ROTULO_DESTINO[p.destino],
              regra, dica, pctTexto(p.pct), <ValorRateio v={p.valor} />, { destaque: aberta })];
            if (p.destino === 'agricultura') {
              safras.forEach(s => out.push(linha(`safra-${s.safraId ?? 'outras'}`,
                <>{s.safra}{s.safraId != null && selo}</>, s.safra,
                s.safraId != null ? 'parte da safra na agricultura' : 'demais safras do período', undefined,
                pctTexto(s.pct), <ValorRateio v={s.valor} />,
                { recuo: true, destaque: s.safraId != null })));
            }
            return out;
          })}
          {naoAlocado && naoAlocado.valor !== 0 && linha('nao_alocado', 'Não alocado', 'Não alocado',
            e.motivosNaoAlocado.length > 0 ? e.motivosNaoAlocado.join(', ') : 'mês sem chave ou sem atividade', undefined,
            pctTexto(naoAlocado.pct), <ValorRateio v={naoAlocado.valor} />)}
          {linha('soma', 'Soma das partes', 'Soma das partes', '', undefined, '', <ValorRateio v={d.soma} forte />, { forte: true, topo: true })}
          {/* Sempre presente (altura fixa): o centavo que sobra do arredondamento de cada parcela — do banco. */}
          {linha('arredondamento', 'Arredondamento', TITULO_ARREDONDAMENTO, '', undefined, '', <ArredondamentoRateio v={d.arredondamento} />)}
          {linha('diferenca', 'Diferença para o total', 'Diferença para o total', '', undefined, '', <DiferencaRateio v={d.diferenca} />, { forte: true })}
        </tbody>
      </table>
      {/* Slot de altura fixa, sempre presente: vazio quando a grade e o resumo mostram o mesmo número. */}
      <div className={cn('h-[14px] shrink-0 px-1.5 text-[9.5px] leading-[14px] text-amber-700', CORTA, 'whitespace-nowrap')}
        data-testid="rateio-aviso-grade" title={gradeDifere ? `${textoGradeDifere(e.gradeTotal ?? 0, destacada ?? 0)} — ${TITULO_GRADE_DIFERE}` : undefined}>
        {gradeDifere ? textoGradeDifere(e.gradeTotal ?? 0, destacada ?? 0) : ''}
      </div>
    </Caixa>
  );
}

function BlocoDentro({ dentro }: { dentro: DentroDaAtividade }) {
  return (
    <Caixa titulo={dentro.titulo} testid="rateio-bloco-dentro" className="min-h-[92px] flex-1"
      extra={<span className={cn('min-w-0 flex-1 text-right font-normal text-muted-foreground', CORTA, 'whitespace-nowrap')}
        title={dentro.legenda}>{dentro.legenda}</span>}>
      {/* Só ESTA tabela rola, e só se as linhas não couberem: cabeçalho e total ficam. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" data-testid="rateio-dentro-rolagem">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 66 }} /><col style={{ width: 118 }} /></colgroup>
          <thead className="sticky top-0 z-10"><tr>
            <th className={TH}>{dentro.colNome}</th><th className={TH}>{dentro.colBase}</th><th className={TH}>%</th><th className={TH}>Valor</th>
          </tr></thead>
          <tbody>
            {dentro.linhas.length === 0 && (
              <tr><td colSpan={4} className={cn(TD, 'text-center text-muted-foreground')}>{dentro.vazio ?? '—'}</td></tr>
            )}
            {dentro.linhas.map(l => (
              <tr key={l.chave} data-linha-dentro={l.chave} data-destaque={l.destaque ? 'sim' : undefined}
                className={cn('border-t border-slate-100', l.destaque && DESTAQUE)}>
                <td className={cn(TD, CORTA, l.destaque && FILETE)} title={l.nome}>{l.nome}</td>
                <td className={NUM}>{l.base == null ? '—' : formatNum(l.base, dentro.casasBase)}</td>
                <td className={NUM}>{pctTexto(l.pct)}</td>
                <td className={NUM}><ValorRateio v={l.valor} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10"><tr className="bg-[#e7ecf3] font-semibold" data-testid="rateio-dentro-total">
            <td className={cn(TD, CORTA)} title={dentro.rotuloTotal}>{dentro.rotuloTotal}</td>
            <td className={NUM}>{dentro.totalBase == null ? '' : formatNum(dentro.totalBase, dentro.casasBase)}</td>
            <td className={NUM}>{dentro.totalValor == null ? '' : '100,0%'}</td>
            <td className={NUM}><ValorRateio v={dentro.totalValor} forte /></td>
          </tr></tfoot>
        </table>
      </div>
    </Caixa>
  );
}

/* ══════════════════════════ MÊS A MÊS ══════════════════════════ */

function MesAMes({ e }: { e: EncontroValorDre }) {
  const d = e.dados;
  const comSafra = d.total.agriculturaSafra != null;
  const pec = e.atividade === 'pecuaria';
  /* O cabeçalho da atividade aberta: o mesmo navy com uma camada clara por cima; as células, o realce da casa. */
  const thAberta = 'shadow-[inset_0_0_0_99px_rgba(255,255,255,0.2)]';
  const tdAberta = 'bg-primary/10 font-semibold';
  const celulas = (m: Omit<MesDoRateio, 'anoMes'>, forte?: boolean) => (<>
    <td className={NUM}><ValorRateio v={m.bruto} forte={forte} /></td>
    <td className={cn(NUM, DIVISOR, pec && tdAberta)}>{pctTexto(m.pctPecuaria)}</td>
    <td className={cn(NUM, pec && tdAberta)}><ValorRateio v={m.pecuaria} forte={forte} /></td>
    <td className={cn(NUM, DIVISOR, !pec && !comSafra && tdAberta)}>{pctTexto(m.pctAgricultura)}</td>
    <td className={cn(NUM, !pec && !comSafra && tdAberta)}><ValorRateio v={m.agricultura} forte={forte} /></td>
    {comSafra && <td className={cn(NUM, tdAberta)}><ValorRateio v={m.agriculturaSafra} forte={forte} /></td>}
    <td className={cn(NUM, DIVISOR)}><ValorRateio v={m.silvicultura} forte={forte} /></td>
    <td className={NUM}><ValorRateio v={m.naoAlocado} forte={forte} /></td>
    <td className={cn(NUM, DIVISOR)}><DiferencaRateio v={m.diferenca} /></td>
  </>);
  const muda = parteMudaNoPeriodo(d, e.atividade);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="rateio-mes-a-mes">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border" data-testid="rateio-mes-rolagem">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: 62 }} /><col />
            <col style={{ width: 58 }} /><col style={{ width: 112 }} />
            <col style={{ width: 58 }} /><col style={{ width: 112 }} />
            {comSafra && <col style={{ width: 112 }} />}
            <col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 84 }} />
          </colgroup>
          <thead className="sticky top-0 z-10"><tr>
            <th className={TH}>Mês</th>
            <th className={TH}>Administrativo</th>
            <th className={cn(TH, DIVISOR, pec && thAberta)} data-aberta={pec ? 'sim' : undefined}>Pec. %</th>
            <th className={cn(TH, pec && thAberta)} data-aberta={pec ? 'sim' : undefined}>Pecuária</th>
            <th className={cn(TH, DIVISOR, !pec && !comSafra && thAberta)} data-aberta={!pec && !comSafra ? 'sim' : undefined}>Lav. %</th>
            <th className={cn(TH, !pec && !comSafra && thAberta)} data-aberta={!pec && !comSafra ? 'sim' : undefined}>Lavoura</th>
            {comSafra && <th className={cn(TH, thAberta)} data-aberta="sim" title="a parte da safra aberta — o número do DRE">Esta safra</th>}
            <th className={cn(TH, DIVISOR)} title={DICA_SILVICULTURA}>Silvicultura</th>
            <th className={TH} title="mês sem chave ou sem atividade: o administrativo que não caiu em DRE nenhum">Não alocado</th>
            <th className={cn(TH, DIVISOR)} title="administrativo do mês menos a soma das partes">Diferença</th>
          </tr></thead>
          <tbody>
            {d.porMes.map((m, i) => (
              <tr key={m.anoMes} data-mes={m.anoMes} className={cn('border-t border-slate-100', i % 2 === 1 && 'bg-muted/30')}>
                <td className={cn(TD, 'tabular-nums')}>{rotuloDoMes(m.anoMes)}</td>
                {celulas(m)}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10"><tr className="bg-[#e7ecf3] font-semibold" data-testid="rateio-mes-total"
            title={d.total.arredondamento !== 0
              ? `arredondamento ${d.total.arredondamento < 0 ? MENOS : '+'}${formatNum(modulo(d.total.arredondamento), 2)} · ${TITULO_ARREDONDAMENTO}`
              : undefined}>
            <td className={TD}>Total</td>
            {celulas(d.total, true)}
          </tr></tfoot>
        </table>
      </div>
      {/* Slot de altura fixa, sempre presente: vazio quando a parte não muda. */}
      <div className={cn('h-[14px] shrink-0 text-[9.5px] leading-[14px] text-muted-foreground', CORTA, 'whitespace-nowrap')}
        data-testid="rateio-mes-aviso" title={muda ? FRASE_PARTE_MUDA : undefined}>
        {muda ? FRASE_PARTE_MUDA : ''}
      </div>
    </div>
  );
}

export function RateioEncontro({ encontro, visao }: { encontro: EncontroValorDre; visao: VisaoRateio }) {
  if (visao === 'mes') return <MesAMes e={encontro} />;
  return (
    /* `min-h-0`: a caixa do Resumo tem a altura do corpo do modal, e a tabela de baixo fica com o que sobra (piso de duas
       linhas) e rola POR DENTRO. Só em janela baixa o piso estoura e o corpo do modal rola. */
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="rateio-resumo">
      <div className="flex shrink-0 items-stretch gap-1.5">
        <BlocoTotal e={encontro} />
        <BlocoDestinos e={encontro} />
      </div>
      {encontro.dentro && <BlocoDentro dentro={encontro.dentro} />}
    </div>
  );
}
