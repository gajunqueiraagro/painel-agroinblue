/**
 * DRE DA PECUÁRIA — a grade por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha por fazenda e no total; as únicas
 * contas são `valor / cab_fim` e o percentual sobre a base — as duas de APRESENTAÇÃO, a mesma
 * licença que o `/ha` tem na lavoura.
 *
 * ⚠ ELE NÃO É A `Grade` DA LAVOURA, e a razão é estrutural, não preguiça. Aquela grade é feita de
 * grupos expansíveis, centros de custo, ponto de rateio, etiquetas e TRÊS sub-colunas por
 * cultura; esta tem DUAS sub-colunas por fazenda e uma cascata própria. Encaixar as duas num
 * componente só custaria uma dúzia de condicionais numa peça que acabou de estabilizar — e o
 * primeiro ajuste da pecuária mexeria na lavoura sem querer.
 * ⚠ O QUE SE REUSA É A RÉGUA, que é o que não pode divergir: larguras de coluna, altura de linha,
 * cores, `Celula`, `CelulaUnit` e as caixas da faixa vêm todas do módulo `components/agri/dreGrade`.
 * Duas telas do mesmo DRE não podem ter dois cinzas de cabeçalho nem dois vermelhos de saída.
 *
 * ⚠ O TOTAL É A PRIMEIRA COLUNA (§2a). Ele era a última, e a última coluna de uma grade que rola
 * é a que ninguém vê: a pergunta "quanto deu no conjunto" é a primeira que se faz, e a resposta
 * ficava atrás de uma barra de rolagem. À esquerda, ele fica congelado junto da coluna de rótulos
 * e as fazendas passam por baixo dele.
 */
import { Fragment, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { formatNum } from '@/lib/calculos/formatters';
import {
  W_RS, W_HA, W_RS_TOTAL, VERDE, VERMELHO, NAVY_TOTAL, BORDA_TOTAL, FUNDO_TOTAL, traco,
  corDoSinal, numeroDaCelula, Celula, CelulaUnit, Etiqueta, Caixas, REGUA_LINHA, tipoDaLinha,
  fundoDaLinha,
  type CaixaFaixa,
} from '@/components/agri/dreGrade';
import {
  BLOCO_DA_LINHA,
  type DrePecuaria, type DrePecLinhas, type ChaveLinhaPec, type CentroPec, type RecortePec,
} from '@/hooks/useDrePecuaria';

/** A coluna de rótulos: mais estreita que a da lavoura, que carrega caret e etiquetas. */
const W_FAZENDA = 190;
/** R$/cab — o mesmo lugar do R$/ha da lavoura. */
const W_CAB = 76;

/**
 * A BASE DO PERCENTUAL É O VBP — decisão do Gabriel, 16/09, e ela tem história.
 *
 * ⚠ A ÂNCORA DO BRIEFING NÃO EXISTIA: o DRE da "Visão Geral" (`BlocoAnaliseEconomica`) NÃO tem
 * "% da receita" — os percentuais dele são DELTAS (Δ ano anterior, Δ meta), por
 * `pctDelta(atual, anterior)`. Não havia ali uma base a copiar.
 * ⚠ O QUE DECIDIU FOI UM DEFEITO MEDIDO, não preferência. Com a receita como base, o Resultado da
 * Atividade deu 203% em janeiro na Santa Rita — porque a variação de estoque entra no NUMERADOR e
 * nunca passou pela receita. A pecuária tem a mesma forma: `vpb_operacional` entra na cascata
 * DEPOIS da receita líquida, então dividir por ela compara coisas de tamanhos diferentes.
 * ⚠ E O VBP JÁ CONTÉM A VARIAÇÃO POR PRODUÇÃO — a RPC o monta como
 * `receita_liquida + vpb_operacional − reposicao`. É por isso que ele é o denominador honesto: o
 * numerador e o denominador passam a falar da mesma produção.
 * ⚠ VBP ≤ 0 DÁ TRAÇO, NUNCA 0% — ver `percentual` abaixo. Desfrute acima da produção é resultado
 * real, e é justamente o que a auditoria procura.
 */
const BASE_DO_PERCENTUAL: ChaveLinhaPec = 'vbp';
const ROTULO_DA_BASE = '% do VBP';

/** As linhas que ganham a linha de % logo abaixo. */
const COM_PERCENTUAL: ReadonlySet<ChaveLinhaPec> = new Set<ChaveLinhaPec>([
  'margem', 'resultado_operacional', 'resultado_com_mercado',
]);

/**
 * A CASCATA, declarada — e a diferença entre as linhas é DADO.
 *
 * ⚠ A ORDEM É O DRE, e ela mora AQUI: a RPC devolve um objeto de chaves sem ordem, porque JSON
 * não tem ordem. Quem sabe que a margem vem depois do custo variável é a apresentação.
 */
interface DefPec {
  chave: ChaveLinhaPec;
  rotulo: string;
  tom: 'receita' | 'custo' | 'neutro';
  destaque?: 'subtotal' | 'sub';
  /** A cor sai do próprio número, coluna a coluna. */
  corPorSinal?: boolean;
  etiqueta?: string;
  /**
   * A linha abre em centros de custo (§4).
   *
   * ⚠ NÃO É "TODA LINHA COM BLOCO": `Reposição` e `Juros` têm bloco e NÃO expandem, por decisão do
   * §4 — a reposição é um gesto só (comprar boi) e os juros não se dividem em centro que o
   * produtor reconheça. Elas continuam clicáveis; só não têm filhas.
   */
  expande?: boolean;
  /** Abre o modal didático em vez da lista de lançamentos (§6). */
  didatico?: 'vpb' | 'efeito';
  /** Abre o modal do rateio administrativo (§5, último parágrafo). */
  rateio?: boolean;
}

const LINHAS_PEC: DefPec[] = [
  { chave: 'vendas', rotulo: 'Vendas', tom: 'receita', expande: true },
  { chave: 'outras_receitas', rotulo: 'Outras receitas', tom: 'receita', expande: true },
  { chave: 'receita_bruta', rotulo: '= Receita bruta', tom: 'receita', destaque: 'sub' },
  { chave: 'deducoes', rotulo: '(−) Deduções', tom: 'custo', expande: true },
  { chave: 'receita_liquida', rotulo: '= Receita líquida', tom: 'receita', destaque: 'subtotal' },
  /* ⚠ A VARIAÇÃO POR PRODUÇÃO É O REBANHO QUE MUDOU A PREÇO CONGELADO — pode ser negativa numa
     safra de venda, e negativa aqui não é prejuízo: é boi que saiu da fazenda. Cor pelo sinal. */
  { chave: 'vpb_operacional', rotulo: 'Variação por produção', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado', didatico: 'vpb' },
  { chave: 'reposicao', rotulo: '(−) Reposição', tom: 'custo' },
  { chave: 'vbp', rotulo: '= VBP', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_variavel', rotulo: '(−) Custo variável', tom: 'custo', expande: true },
  { chave: 'margem', rotulo: '= Margem de contribuição', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo', rotulo: '(−) Custo fixo', tom: 'custo', expande: true },
  { chave: 'rateio_adm', rotulo: '(−) Rateio administrativo', tom: 'custo', etiqueta: 'estimado', rateio: true },
  { chave: 'resultado_operacional', rotulo: '= Resultado operacional', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros', rotulo: '(−) Despesas financeiras (juros)', tom: 'custo' },
  { chave: 'resultado_periodo', rotulo: '= Resultado do período', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'efeito_mercado', rotulo: 'Efeito de mercado', tom: 'neutro', corPorSinal: true, etiqueta: 'estimado', didatico: 'efeito' },
  { chave: 'resultado_com_mercado', rotulo: '= Resultado com mercado', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento', rotulo: 'Investimento no período', tom: 'custo', expande: true },
];

const corDoTom = (t: DefPec['tom']) => (t === 'receita' ? VERDE : t === 'custo' ? VERMELHO : '');

/** ⚠ `null` É AUSÊNCIA, não zero: fazenda sem fechamento numa das pontas não tem variação. */
const valorDe = (l: DrePecLinhas, c: ChaveLinhaPec): number | null => {
  const v = l[c];
  return typeof v === 'number' ? v : null;
};

/** ⚠ A ÚNICA DIVISÃO DE UNIDADE, e é de apresentação. Sem cabeça no fim, traço — nunca Infinity. */
const porCabeca = (v: number | null, cab: number) =>
  (v == null || !(cab > 0) ? traco : formatNum(v / cab, 2));

/**
 * ⚠ BASE ZERO OU NEGATIVA DÁ TRAÇO, NUNCA 0% — a regra do VBP ≤ 0 do DRE gerencial, trazida
 * inteira. Uma fazenda cujo VBP não é positivo não tem "0% de margem": ela não tem percentual
 * nenhum. E com VBP negativo o sinal do percentual se inverteria — uma margem positiva sobre um
 * VBP negativo apareceria como percentual negativo, que é o oposto do que aconteceu.
 */
const percentual = (v: number | null, base: number): string => {
  if (v == null || !(base > 0)) return traco;
  return `${formatNum((v / base) * 100, 1)} %`;
};

/**
 * UMA COLUNA DA GRADE — o Total é uma coluna como as outras, só que primeiro e destacada.
 *
 * ⚠ `fazendaId: null` É O TOTAL, e esse `null` viaja até a RPC: `fn_dre_pecuaria_lancamentos`
 * trata `p_fazenda is null` como "todas". A coluna e o filtro falam a mesma língua.
 */
interface ColunaPec {
  chave: string;
  nome: string;
  fazendaId: string | null;
  linhas: DrePecLinhas;
  total: boolean;
}

export function PecDrePanel({ dre, alturaCartao, cartaoRef, onAbrirLista, onAbrirDidatico, onAbrirRateio }: {
  dre: DrePecuaria;
  alturaCartao: number | null;
  cartaoRef: React.RefObject<HTMLDivElement>;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
}) {
  /* ⚠ O TOTAL ENTRA NA FRENTE (§2a). A RPC devolve as fazendas e o total separados; quem os
     ordena é a tela, e é aqui que a decisão fica visível. */
  const colunas: ColunaPec[] = useMemo(() => ([
    { chave: '__total__', nome: 'Total', fazendaId: null, linhas: dre.total, total: true },
    ...dre.fazendas.map(f => ({
      chave: f.fazenda_id, nome: f.nome, fazendaId: f.fazenda_id, linhas: f.linhas, total: false,
    })),
  ]), [dre]);

  const larguras = useMemo(() => {
    const cols: number[] = [W_FAZENDA, W_RS_TOTAL, W_HA];
    dre.fazendas.forEach(() => cols.push(W_RS, W_CAB));
    return cols;
  }, [dre.fazendas]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);

  /** Quais grupos estão abertos. Fechados por padrão (§4). */
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const alternar = (c: ChaveLinhaPec) => setAbertos(a => ({ ...a, [c]: !a[c] }));

  return (
    /* ⚠ A ROLAGEM HORIZONTAL É DESTE CARTÃO, NUNCA DA PÁGINA (§2b). `min-w-0` é o que garante
       isso: sem ele, um filho de largura intrínseca grande EMPURRA o contêiner flex/grid pai, a
       página inteira ganha barra lateral e, ao rolar, o cabeçalho da tela e a faixa de caixas
       saem de vista. `overflow-auto` sozinho não basta — ele só age depois que o pai aceita
       encolher. */
    <div ref={cartaoRef}
      className="min-w-0 max-w-full overflow-auto rounded-lg border border-border/60 bg-card"
      style={alturaCartao ? { maxHeight: alturaCartao } : undefined}>
      {/* ⚠ A MESMA RÉGUA DA LAVOURA: `leading-none`, px fixos e largura igual à soma das colunas.
          Ver a nota no `AgriDreLavouraTab` — foi ela que fez as alturas declaradas valerem. */}
      <table className="border-collapse text-[11px] leading-none"
        style={{ tableLayout: 'fixed', width: larguraMin }}>
        <colgroup>{larguras.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>

        <thead>
          <tr style={{ height: 26 }}>
            <th rowSpan={2}
              className={cn(CINZA_CABECALHO, 'sticky left-0 top-0 z-40 px-[7px] text-left',
                'text-[10px] font-medium text-white')}>
              Fazenda
            </th>
            {/* ⚠ O TOTAL TAMBÉM GRUDA À ESQUERDA, colado na coluna de rótulos: ele é a referência
                contra a qual cada fazenda se lê, e rolar para comparar obrigaria a decorá-lo. */}
            <th colSpan={2}
              className="sticky top-0 z-40 px-[7px] text-center text-white"
              style={{ left: W_FAZENDA, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL }}>
              <div className="text-[10px] font-medium leading-[12px]">Total</div>
              <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                {formatNum(dre.total.patrimonio.cab_fim, 0)} cab
              </div>
            </th>
            {dre.fazendas.map(f => {
              /* ⚠ A COLUNA "Admin" APARECE, e é de propósito: ela é lançamento de pecuária sem
                 fazenda produtiva — lixo visível. Escondê-la faria o Total não fechar com a soma
                 das colunas, e ninguém saberia por quê. */
              const admin = /admin/i.test(f.nome);
              return (
                <th key={f.fazenda_id} colSpan={2}
                  title={admin ? 'lançamentos de pecuária sem fazenda produtiva' : undefined}
                  className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-center',
                    'align-middle text-white')}
                  style={{ borderLeft: '1px solid rgba(255,255,255,.22)' }}>
                  <div className="truncate text-[10px] font-medium leading-[12px]">{f.nome}</div>
                  <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                    {formatNum(f.linhas.patrimonio.cab_fim, 0)} cab
                  </div>
                </th>
              );
            })}
          </tr>
          <tr style={{ height: 14 }}>
            <th className="sticky z-40 px-[7px] text-right text-[10px] font-normal text-white"
              style={{ top: 26, left: W_FAZENDA, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL }}>R$</th>
            <th className="sticky z-40 px-[7px] text-right text-[10px] font-normal text-white"
              style={{ top: 26, left: W_FAZENDA + W_RS_TOTAL, backgroundColor: NAVY_TOTAL }}>R$/cab</th>
            {dre.fazendas.map(f => (
              <Fragment key={f.fazenda_id}>
                <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
                  style={{ top: 26, borderLeft: '1px solid rgba(255,255,255,.22)' }}>R$</th>
                <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
                  style={{ top: 26 }}>R$/cab</th>
              </Fragment>
            ))}
          </tr>
        </thead>

        <tbody>
          {LINHAS_PEC.map(def => {
            const bloco = BLOCO_DA_LINHA[def.chave];
            const aberto = !!abertos[def.chave];
            /* ⚠ AS FILHAS SAEM DA COLUNA TOTAL, e é ela que manda: um centro que só existe numa
               fazenda tem de aparecer na lista de todos, senão a linha some conforme a coluna que
               se olha. O Total é a união por construção — a RPC o monta agrupando `finc` inteiro. */
            const centros = def.expande && bloco
              ? dre.total.centros.filter(c => c.bloco === bloco)
              : [];
            return (
              <Fragment key={def.chave}>
                {def.chave === 'investimento' && (
                  <tr className="bg-card" style={{ height: 17 }}>
                    <td className="sticky left-0 z-20 truncate border-r border-t border-border/60 bg-card
                      px-[7px] text-[10px] text-muted-foreground"
                      title="Abaixo da linha de caixa — não entra no resultado do período">
                      Abaixo da linha de caixa
                    </td>
                    {Array.from({ length: larguras.length - 1 }).map((_, i) => (
                      <td key={i} className="border-t border-border/60 bg-card"
                        style={i < 2 ? { position: 'sticky', left: i === 0 ? W_FAZENDA : W_FAZENDA + W_RS_TOTAL, zIndex: 20, backgroundColor: FUNDO_TOTAL } : undefined} />
                    ))}
                  </tr>
                )}
                <LinhaPec def={def} colunas={colunas} centros={centros}
                  aberto={aberto} onAlternar={() => alternar(def.chave)}
                  onAbrirLista={onAbrirLista} onAbrirDidatico={onAbrirDidatico}
                  onAbrirRateio={onAbrirRateio} />

                {/* ⚠ A LINHA DE % VEM LOGO ABAIXO e é leitura de apoio: 9px, muted, sem recuo,
                    altura 14. Ela não é uma linha do DRE — é a mesma linha vista noutra unidade,
                    e por isso não ganha nem cor de sinal nem clique. */}
                {COM_PERCENTUAL.has(def.chave) && (
                  <LinhaPercentual def={def} colunas={colunas} />
                )}

                {/* As filhas: um centro por linha, na régua `filha` (9px/14px, recuo 16). */}
                {aberto && centros.map(c => (
                  <LinhaCentro key={`${def.chave}-${c.centro}`} def={def} centro={c}
                    colunas={colunas} bloco={bloco ?? ''} onAbrirLista={onAbrirLista} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** As duas células congeladas do Total, na régua da linha. */
const estiloTotalRs = { position: 'sticky' as const, left: W_FAZENDA, zIndex: 20 };
const estiloTotalCab = { position: 'sticky' as const, left: W_FAZENDA + W_RS_TOTAL, zIndex: 20 };

function LinhaPec({ def, colunas, centros, aberto, onAlternar, onAbrirLista, onAbrirDidatico, onAbrirRateio }: {
  def: DefPec;
  colunas: readonly ColunaPec[];
  centros: readonly CentroPec[];
  aberto: boolean;
  onAlternar: () => void;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
}) {
  const fundo = fundoDaLinha(def.destaque);
  const corLinha = corDoTom(def.tom);
  const bloco = BLOCO_DA_LINHA[def.chave];
  const temFilhas = def.expande && centros.length > 0;
  /* ⚠ A MESMA RÉGUA DA LAVOURA (PR-10): o papel de grupo entra quando a linha expande, e é ela
     que traz o peso 500 sem mudar o tamanho. O mapa é um só de propósito: o dia em que o subtotal
     mudar de tamanho, ele muda nas duas telas. */
  const regua = REGUA_LINHA[tipoDaLinha(def.destaque, temFilhas)];

  /**
   * O QUE ACONTECE AO CLICAR NUMA CÉLULA — §5.
   *
   * ⚠ TRÊS DESTINOS, E O DA LINHA DECIDE: as duas variações de patrimônio abrem o modal didático
   * (não há lançamento por trás delas — são fechamentos de rebanho); o rateio administrativo abre
   * o modal do pool (o valor é rateado, não lançado nesta fazenda); o resto abre a lista.
   * ⚠ LINHA DE SOMA NÃO ABRE NADA. `= Receita bruta`, `= VBP`, `= Margem` e os resultados não têm
   * lançamento próprio: eles são a conta das linhas de cima, e abrir uma lista ali teria de
   * inventar qual dos termos mostrar.
   */
  const abrirDaColuna = (col: ColunaPec) => {
    if (def.didatico) return onAbrirDidatico ? () => onAbrirDidatico(col.fazendaId, col.nome, def.didatico!) : undefined;
    if (def.rateio) return onAbrirRateio;
    if (!bloco || !onAbrirLista) return undefined;
    return () => onAbrirLista({
      fazendaId: col.fazendaId,
      fazendaNome: col.nome,
      bloco,
      centro: null,
      rotulo: def.rotulo.replace(/^[=(−)\s-]+/, '').trim(),
    });
  };

  return (
    <tr className={cn(fundo, regua.peso)} style={{ height: regua.altura }}>
      <td className={cn('sticky left-0 z-30 truncate py-px', fundo,
        'border-r border-border/60', corLinha, temFilhas && 'cursor-pointer')}
        title={def.rotulo}
        onClick={temFilhas ? onAlternar : undefined}
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}>
        {temFilhas && (
          <ChevronRight className={cn('mr-0.5 inline h-3 w-3 align-[-2px] transition-transform',
            aberto && 'rotate-90')} />
        )}
        {def.rotulo}
        {def.etiqueta && <Etiqueta texto={def.etiqueta} />}
      </td>

      {colunas.map(col => {
        const v = valorDe(col.linhas, def.chave);
        const cab = col.linhas.patrimonio.cab_fim;
        const cor = def.corPorSinal ? corDoSinal(v) : corLinha;
        /* ⚠ SEM FECHAMENTO A CÉLULA DIZ POR QUÊ: as duas linhas de variação vêm nulas, e o
           `title` é o que separa "não mudou" de "não sei". */
        const semFech = (def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado')
          && (col.linhas.sem_p0 || col.linhas.sem_p1);
        const abrir = abrirDaColuna(col);
        return (
          <Fragment key={col.chave}>
            <Celula valor={v} cor={cor} destaque={def.destaque} fonte={regua.fonte}
              bordaEsquerda={!col.total} total={col.total} fundo={fundo}
              onAbrir={abrir}
              estilo={col.total ? estiloTotalRs : undefined}
              title={semFech ? 'sem fechamento' : undefined} />
            <CelulaUnit texto={porCabeca(v, cab)} cor={cor} destaque={def.destaque}
              fonte={regua.fonte} total={col.total} fundo={fundo} onAbrir={abrir}
              estilo={col.total ? estiloTotalCab : undefined} />
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * A LINHA DE PERCENTUAL — §3.
 *
 * ⚠ ELA NÃO É UMA LINHA DO DRE. Não entra em soma nenhuma, não tem cor de sinal e não abre lista:
 * é a linha de cima dita em outra unidade. Por isso a régua dela é a de `filha` (9px, altura 14),
 * mas SEM recuo — recuar sugeriria que ela é um item dentro do subtotal, e ela não é.
 */
function LinhaPercentual({ def, colunas }: { def: DefPec; colunas: readonly ColunaPec[] }) {
  const fundo = fundoDaLinha(def.destaque);
  return (
    <tr className={cn(fundo, 'font-normal')} style={{ height: 14 }}>
      <td className={cn('sticky left-0 z-30 truncate border-r border-border/60 py-px text-muted-foreground', fundo)}
        style={{ fontSize: 9, paddingLeft: 7, paddingRight: 7 }}
        title={`${def.rotulo} em ${ROTULO_DA_BASE}`}>
        {ROTULO_DA_BASE}
      </td>
      {colunas.map(col => {
        const v = valorDe(col.linhas, def.chave);
        const base = col.linhas[BASE_DO_PERCENTUAL];
        const texto = percentual(v, typeof base === 'number' ? base : 0);
        return (
          <Fragment key={col.chave}>
            <td className={cn('truncate px-[7px] text-right tabular-nums text-muted-foreground', fundo)}
              style={{
                fontSize: 9,
                ...(col.total ? { ...estiloTotalRs, backgroundColor: FUNDO_TOTAL, borderLeft: BORDA_TOTAL } : {}),
              }}>
              {texto}
            </td>
            {/* A coluna de R$/cab fica vazia: percentual não tem por-cabeça. */}
            <td className={cn(fundo)}
              style={col.total ? { ...estiloTotalCab, backgroundColor: FUNDO_TOTAL } : undefined} />
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * UMA FILHA — o centro de custo dentro do bloco.
 *
 * ⚠ O VALOR DA FILHA VEM DOS `centros` DAQUELA COLUNA, não do Total repetido: cada fazenda tem os
 * seus, e um centro que ela não tem mostra "—" em vez de herdar o número do conjunto.
 * ⚠ E O `'(sem)'` VIAJA INTEIRO ATÉ A RPC — ele é um centro de verdade ("lançamento sem centro"),
 * não ausência. Mandar `null` no lugar dele traria o bloco todo.
 */
function LinhaCentro({ def, centro, colunas, bloco, onAbrirLista }: {
  def: DefPec;
  centro: CentroPec;
  colunas: readonly ColunaPec[];
  bloco: string;
  onAbrirLista?: (r: RecortePec) => void;
}) {
  const regua = REGUA_LINHA.filha;
  const corLinha = corDoTom(def.tom);
  return (
    <tr className={cn('bg-card', regua.peso)} style={{ height: regua.altura }}>
      <td className="sticky left-0 z-30 truncate border-r border-border/60 bg-card py-px"
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}
        title={centro.centro}>
        {centro.centro === '(sem)' ? 'sem centro' : centro.centro}
      </td>
      {colunas.map(col => {
        const achou = col.linhas.centros.find(c => c.bloco === bloco && c.centro === centro.centro);
        const v = achou ? achou.valor : null;
        const cab = col.linhas.patrimonio.cab_fim;
        const abrir = onAbrirLista
          ? () => onAbrirLista({
            fazendaId: col.fazendaId, fazendaNome: col.nome, bloco,
            centro: centro.centro,
            rotulo: centro.centro === '(sem)' ? 'sem centro' : centro.centro,
          })
          : undefined;
        return (
          <Fragment key={col.chave}>
            <Celula valor={v} cor={corLinha} fonte={regua.fonte} filha
              bordaEsquerda={!col.total} total={col.total} fundo="bg-card" onAbrir={abrir}
              estilo={col.total ? estiloTotalRs : undefined} />
            <CelulaUnit texto={porCabeca(v, cab)} cor={corLinha} fonte={regua.fonte} filha
              total={col.total} fundo="bg-card" onAbrir={abrir}
              estilo={col.total ? estiloTotalCab : undefined} />
          </Fragment>
        );
      })}
    </tr>
  );
}

/** As seis caixas da pecuária — a mesma régua da lavoura, outro conteúdo. */
export function FaixaPecuaria({ dre }: { dre: DrePecuaria }) {
  const t = dre.total;
  const caixas: CaixaFaixa[] = [
    { rotulo: 'Cabeças', valor: formatNum(t.patrimonio.cab_fim, 0), unidade: 'cab' },
    { rotulo: 'Receita líquida', valor: numeroDaCelula(t.receita_liquida), unidade: 'R$', cor: VERDE },
    { rotulo: 'VBP', valor: numeroDaCelula(t.vbp), unidade: 'R$', cor: corDoSinal(t.vbp),
      titleRotulo: 'Valor bruto da produção' },
    { rotulo: 'Resultado do período', valor: numeroDaCelula(t.resultado_periodo), unidade: 'R$',
      cor: corDoSinal(t.resultado_periodo) },
    { rotulo: 'Efeito de mercado', valor: numeroDaCelula(t.efeito_mercado),
      unidade: t.efeito_mercado == null ? undefined : 'R$', cor: corDoSinal(t.efeito_mercado),
      title: 'O preço mudou, o rebanho ficou — não é resultado de operação.' },
    { rotulo: 'Patrimônio no fim', valor: numeroDaCelula(t.patrimonio.v_fim_p1), unidade: 'R$' },
  ];
  return <Caixas caixas={caixas} />;
}
