/**
 * OS QUATRO CARTÕES DO DRILL — o ciclo da cultura ao lado da grade, nunca embaixo dela.
 *
 * ⚠ NENHUM CÁLCULO NOVO, e cada campo tem dono declarado: talhões e média vêm de
 * `usePainelSafra` (`fn_painel_safra`); a qualidade, dos totais que a aba Produção já soma; o
 * equilíbrio, de `useDreLavoura`; o histórico, de `useDreLavouraHistorico`. As duas únicas
 * contas são de APRESENTAÇÃO e estão nomeadas onde acontecem: a folga percentual do preço e a
 * escala das barras.
 * ⚠ ELES SÃO DA ABA RESULTADO. Produção e Histórico já mostram estas mesmas tabelas inteiras;
 * repetir os cartões lá seria dizer duas vezes a mesma coisa em tamanhos diferentes.
 */
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { simboloDaUnidade, descricaoDaUnidade } from '@/lib/agri/colheita';
import { temClassesDeQualidade } from '@/lib/agri/modeloComercial';
import type { PainelSafra } from '@/hooks/usePainelSafra';
import type { TotaisTalhoes } from '@/components/agri/ProducaoSafraPanel';
import type { DreCultura } from '@/hooks/useDreLavoura';
import type { SafraHistorico } from '@/hooks/useDreLavouraHistorico';

const TRACO = '—';
const VERDE = 'text-green-700';
const VERMELHO = 'text-red-600';
/** O trilho das barras — cinza frio, para o colorido ser só o dado. */
const TRILHO = '#eef2f7';

/** A moldura comum: título, contexto à direita, corpo e nota de rodapé. */
function Cartao({ titulo, contexto, nota, children }: {
  titulo: string;
  contexto?: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card text-[10px]"
      style={{ padding: '7px 10px' }}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold">{titulo}</span>
        {contexto && (
          <span className="shrink-0 truncate text-[10px] text-muted-foreground">{contexto}</span>
        )}
      </div>
      {children}
      {/* ⚠ A NOTA É UMA LINHA SÓ, com ellipsis: ela explica a barra, e uma explicação que empurra
          o cartão para baixo a cada safra diferente tira do lugar o cartão seguinte. */}
      {nota && <p className="mt-1.5 truncate text-[9px] text-muted-foreground" title={nota}>{nota}</p>}
    </div>
  );
}

/** Uma barra simples, de 0 a 1. */
function Barra({ fracao, cor }: { fracao: number; cor: string }) {
  const pct = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <div className="h-[10px] w-full overflow-hidden" style={{ background: TRILHO, borderRadius: 2 }}>
      <div className="h-full" style={{ width: `${pct}%`, background: cor, borderRadius: 2 }} />
    </div>
  );
}

/* ═════════════════════ 3a — PRODUÇÃO POR TALHÃO ═════════════════════ */

export function CartaoTalhoes({ painel, totais, cultura }: {
  painel: PainelSafra | null;
  totais: TotaisTalhoes;
  cultura: string;
}) {
  const un = simboloDaUnidade(cultura);
  const talhoes = painel?.talhoes ?? [];
  /* ⚠ A ESCALA É O MELHOR TALHÃO, não um teto fixo: o que a barra responde é "quanto este rende
     comparado com o melhor que eu tenho" — e um teto arbitrário faria uma safra ruim inteira
     parecer boa. É conta de apresentação, e morre aqui. */
  const melhor = talhoes.reduce((a, t) => Math.max(a, t.sacas_ha), 0);

  return (
    <Cartao titulo="Produção por talhão"
      contexto={talhoes.length > 0
        ? `${talhoes.length} talhões · ${formatNum(totais.area, 2)} ha · ${formatNum(totais.sacas, 2)} ${un}`
        : undefined}
      nota={talhoes.length > 0
        ? `Barra = produtividade relativa ao melhor talhão. Média da cultura ${formatNum(painel?.sacas_ha ?? 0, 2)} ${un}/ha.`
        : undefined}>
      {talhoes.length === 0 ? (
        <p className="text-muted-foreground">{TRACO}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {talhoes.map(t => (
            /* ⚠ TRÊS COLUNAS, e a área saiu da direita para junto do NOME: ela descreve o
               talhão, não o rendimento. Com os dois números empilhados à direita, o olho lia
               "120,00 ha · 245,80 sc/ha" como um par comparável — e só o segundo é comparável
               entre talhões, que é o que a barra ordena.
               ⚠ E O RÓTULO TEM DOIS PESOS (PR-11): o TALHÃO é o que identifica a linha e fica em
               10px; a área e a variedade são contexto e vão em 9px muted. Tudo do mesmo tamanho
               fazia "Ind 04 · 94,00 ha · OL3" ler como três coisas igualmente importantes.
               ⚠ SEM VARIEDADE, SEM O TERCEIRO SEGMENTO — nunca "· —". O cultivar não é campo
               obrigatório, e um traço ali afirmaria que falta dado onde só não há o que dizer. */
            <div key={`${t.talhao}-${t.variedade ?? ''}`} className="flex items-center gap-2">
              <span className="w-[170px] shrink-0 truncate whitespace-nowrap"
                title={`${t.talhao} · ${formatNum(t.area_ha, 2)} ha${t.variedade ? ` · ${t.variedade}` : ''}`}>
                <span className="text-[10px]">{t.talhao}</span>
                <span className="text-[9px] text-muted-foreground">
                  {' · '}{formatNum(t.area_ha, 2)} ha{t.variedade ? ` · ${t.variedade}` : ''}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <Barra fracao={melhor > 0 ? t.sacas_ha / melhor : 0} cor="hsl(var(--primary))" />
              </span>
              {/* ⚠ LARGURA FIXA E `nowrap`: é o que mantém as barras alinhadas quando um talhão
                  tem 4 dígitos e o outro tem 2. */}
              <span className="w-[90px] shrink-0 whitespace-nowrap text-right tabular-nums">
                {formatNum(t.sacas_ha, 2)} {un}/ha
              </span>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}

/* ═════════════════════ 3b — QUALIDADE DA COLHEITA ═════════════════════ */

export function CartaoQualidade({ totais, cultura }: { totais: TotaisTalhoes; cultura: string }) {
  /* ⚠ SEM CLASSES, O CARTÃO NÃO EXISTE (§3i) — não é um cartão com "—". A mandioca não tem grão
     bom nem roça: a indústria pesa e mede o amido. Um cartão vazio ocuparia 110px dizendo que
     falta dado, quando a resposta é que a pergunta não se aplica. */
  if (!temClassesDeQualidade(cultura)) return null;
  const un = simboloDaUnidade(cultura);
  /* ⚠ TRÊS CLASSES, E A DO MEIO NÃO É CAMPO DE HOOK NENHUM — ver o relatório do PR-09. Ela sai
     de `totais.acima`, que a própria aba Produção já soma (carga a carga, o grão bom acima de
     20 ppb) e usava só para derivar o "% Afla" do rodapé. Aqui ela aparece inteira. */
  const ate20 = totais.boas - totais.acima;
  const classes = [
    { nome: 'Até 20 ppb', sc: ate20, cor: '#15803d' },
    { nome: 'Acima de 20 ppb', sc: totais.acima, cor: '#ea580c' },
    { nome: 'Grão de roça', sc: totais.roca, cor: '#8b5e3c' },
  ];
  const total = totais.sacas;

  return (
    <Cartao titulo="Qualidade da colheita"
      contexto={total > 0 ? `${formatNum(total, 2)} ${un}` : undefined}
      nota={total > 0 ? 'O grão de roça é receita e perda ao mesmo tempo — o alvo é reduzi-lo.' : undefined}>
      {/* ⚠ SEM COLHEITA É "—", NÃO ZERO: a mandioca da 25/26 tem a lavoura no chão. Zero diria
          que ela colheu nada, que é diferente de ainda não ter colhido. */}
      {total <= 0 ? (
        <p className="text-muted-foreground">{TRACO}</p>
      ) : (
        <>
          <div className="flex h-[10px] w-full overflow-hidden" style={{ background: TRILHO, borderRadius: 2 }}>
            {classes.map(c => (
              <div key={c.nome} style={{ width: `${(c.sc / total) * 100}%`, background: c.cor }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {classes.map(c => (
              <div key={c.nome} className="flex items-center gap-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c.cor }} />
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {formatNum(c.sc, 2)} {un} · {formatNum((c.sc / total) * 100, 1)} %
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Cartao>
  );
}

/* ═════════════════════ 3c — PREÇO × EQUILÍBRIO ═════════════════════ */

function BlocoEquilibrio({ rotulo, realizado, equilibrio, unidade, peso }: {
  rotulo: string;
  realizado: number | null;
  equilibrio: number | null;
  unidade: string;
  peso: string;
}) {
  const temOsDois = realizado != null && equilibrio != null && equilibrio > 0;
  /* ⚠ A ÚNICA CONTA DESTE CARTÃO, e ela é de apresentação: a folga é quanto o realizado passou
     do ponto de equilíbrio. Nenhum dos dois números nasce aqui — os dois vêm do payload. */
  const folga = temOsDois ? (realizado / equilibrio - 1) * 100 : null;
  const acima = folga != null && folga >= 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-muted-foreground">{rotulo}</div>
      <div className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn('text-[14px] font-medium tabular-nums', folga == null ? '' : acima ? VERDE : VERMELHO)}>
          {realizado == null ? TRACO : formatNum(realizado, 2)}
        </span>
        <span className="truncate text-[9px] text-muted-foreground" title={peso}>{unidade}</span>
      </div>
      <div className="mt-1">
        {/* ⚠ A BARRA É O EQUILÍBRIO DENTRO DO REALIZADO: cheia quer dizer "empatou". Verde quando
            sobra, vermelha quando falta — e vazia quando não há os dois números. */}
        <Barra fracao={temOsDois ? equilibrio / realizado : 0}
          cor={acima ? '#15803d' : '#dc2626'} />
      </div>
      <div className="mt-1 truncate text-[9px] text-muted-foreground">
        {equilibrio == null ? `equilíbrio ${TRACO}`
          : `equilíbrio ${formatNum(equilibrio, 2)}`}
        {folga != null && ` · folga ${folga >= 0 ? '+' : ''}${formatNum(folga, 1)} %`}
      </div>
    </div>
  );
}

export function CartaoEquilibrio({ c }: { c: DreCultura }) {
  const un = simboloDaUnidade(c.cultura);
  const peso = descricaoDaUnidade(c.cultura);
  const eq = c.equilibrio;
  return (
    <Cartao titulo="Preço × equilíbrio"
      nota="Equilíbrio = o ponto em que a safra paga o custo operacional efetivo.">
      <div className="flex gap-3">
        <BlocoEquilibrio rotulo="Preço realizado" realizado={eq.preco_realizado}
          equilibrio={eq.preco_equilibrio} unidade={`R$/${un}`} peso={peso} />
        <BlocoEquilibrio rotulo="Produtividade" realizado={c.producao > 0 ? c.produtividade : null}
          equilibrio={eq.produtividade_equilibrio} unidade={`${un}/ha`} peso={peso} />
      </div>
    </Cartao>
  );
}

/* ═════════════════════ 3d — RESULTADO POR SAFRA ═════════════════════ */

export function CartaoHistorico({ safras, safraAtual, onEscolher }: {
  safras: SafraHistorico[];
  safraAtual: string;
  onEscolher: (codigo: string) => void;
}) {
  /* ⚠ A ESCALA É O MAIOR |resultado|, e o zero fica no MEIO: sem isso, uma safra de −312 mil e
     outra de +3 mil dividiriam a mesma barra crescente e a segunda sumiria. Com o zero no
     centro, o lado da barra já diz o sinal antes de o olho chegar ao número. */
  const maior = safras.reduce((a, s) => Math.max(a, Math.abs(s.resultado_ha)), 0);
  return (
    <Cartao titulo="Resultado por safra" contexto={safras.length > 0 ? 'R$/ha' : undefined}
      nota={safras.length > 0 ? 'Clique numa safra para abrir o DRE dela.' : undefined}>
      {safras.length === 0 ? (
        <p className="text-muted-foreground">{TRACO}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {safras.map(s => {
            const atual = s.safra === safraAtual;
            const pos = s.resultado_ha >= 0;
            const fr = maior > 0 ? Math.abs(s.resultado_ha) / maior : 0;
            return (
              <div key={s.safra} onClick={() => onEscolher(s.safra)}
                title={`ver a safra ${s.safra}`}
                className={cn('flex cursor-pointer items-center gap-2 rounded-sm hover:bg-muted/60',
                  atual && 'font-medium')}>
                <span className="w-[62px] shrink-0 truncate">{s.safra}</span>
                <span className="flex min-w-0 flex-1 items-center">
                  <span className="flex h-[10px] w-1/2 justify-end overflow-hidden"
                    style={{ background: TRILHO, borderRadius: '2px 0 0 2px' }}>
                    {!pos && <span className="h-full" style={{ width: `${fr * 100}%`, background: '#dc2626' }} />}
                  </span>
                  <span className="flex h-[10px] w-1/2 overflow-hidden"
                    style={{ background: TRILHO, borderRadius: '0 2px 2px 0' }}>
                    {pos && <span className="h-full" style={{ width: `${fr * 100}%`, background: '#15803d' }} />}
                  </span>
                </span>
                <span className={cn('w-[80px] shrink-0 whitespace-nowrap text-right tabular-nums',
                  pos ? VERDE : VERMELHO)}>
                  {formatNum(s.resultado_ha, 2)}
                </span>
                {/* ⚠ A PRIMEIRA SAFRA NÃO TEM DELTA, e "—" é o que se diz: não há anterior contra
                    o que comparar. Zero afirmaria "não mudou". */}
                <span className={cn('w-[84px] shrink-0 whitespace-nowrap text-right tabular-nums',
                  s.delta_resultado_ha == null ? 'text-muted-foreground'
                    : s.delta_resultado_ha >= 0 ? VERDE : VERMELHO)}>
                  {s.delta_resultado_ha == null ? TRACO
                    : `${s.delta_resultado_ha >= 0 ? '▲' : '▼'} ${formatNum(Math.abs(s.delta_resultado_ha), 2)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}
