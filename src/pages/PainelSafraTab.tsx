/**
 * PAINEL DA SAFRA — Executivo › Painel da Safra (PR-PAINEL-SAFRA-A).
 *
 * ⚠ O RAIO-X DE UM CICLO, no formato do fechamento que o produtor já faz à mão: o que plantou, o
 * que colheu, o que gastou e o que sobrou — por hectare e por saca, que são as duas réguas com
 * que ele compara uma safra com a outra.
 * ⚠ IRMÃ DO "DRE POR CULTURA", NÃO CONCORRENTE. As duas leem `fn_dre_agricola_por_safra`; o DRE
 * mostra a linha contábil e esta mostra o ciclo. O dia em que os dois números discordarem, é
 * porque alguém recalculou em vez de ler — e não há recálculo aqui.
 *
 * ⚠ FATIA A de três. Investimento aparece como UMA linha fora do resultado; o detalhe por tipo,
 * o talhão/variedade e o comparativo entre safras são as fatias B e C.
 */
import { useState, useEffect, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import {
  usePainelSafra, useComparativoSafras, custeioTotal, porHa, porSaca, colheu,
  type SafraComparada,
} from '@/hooks/usePainelSafra';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';
import {
  useLancamentosDaSafra, paraItemDrillDaSafra, type LancamentoDaSafra,
} from '@/hooks/useLancamentosDaSafra';
import { AnaliseDrawer } from '@/components/financeiro-v2/AnaliseDrawer';
import { DrillDownEconomico } from '@/components/financeiro-v2/DrillDownEconomico';
import { NIVEIS_DRILL, type ItemDrill } from '@/lib/analise/drillEconomico';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import {
  RateioDetalheModal, type RateioDetalhe, type TipoRateio,
} from '@/components/agri/RateioDetalheModal';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';

/** Cabeçalho azul das três colunas, como o resto da família. */
const TH = 'bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-wide'
  + ' text-primary-foreground';

/* ⚠ O CINZA DAS TABELAS DE APOIO SAIU. Ele existia para separar a resposta principal (DRE e
   Investimento, em azul) da leitura de apoio (talhão, composição, histórico) — quatro faixas
   azuis empilhadas faziam o olho perder onde uma seção terminava. As ABAS passaram a fazer essa
   separação, e melhor: agora cada tabela está numa aba própria, nunca empilhada com as outras.
   O cinza virou distinção sem diferença, e a tela volta a ter um azul só. */

/**
 * A ZEBRA, LINHA A LINHA — e explicitamente, nunca por `:nth-child`.
 *
 * ⚠ O SELETOR NÃO PEGA AQUI, e o mock provou: `odd:`/`nth-child` contam o `<tr>` DENTRO do pai,
 * e o corpo destas tabelas é montado por `map` com linhas condicionais ao redor — basta uma
 * linha aparecer ou sumir (uma safra sem colheita, um talhão a menos) para toda a alternância
 * inverter. Pintar pelo índice do dado é o que mantém a faixa onde ela estava.
 */
/**
 * O CORPO DA ABA — o mesmo tom e a mesma borda da aba ativa, que é o que fecha a pasta.
 *
 * ⚠ `-mt-2` CANCELA o `mb-2` do bloco congelado: a aba ativa tem de ENCOSTAR no corpo, e o
 * respiro que separa o cabeçalho do conteúdo, quando havia abas de sublinhado, agora seria a
 * fresta que desmancha a pasta.
 * ⚠ `rounded-b-lg rounded-tr-lg` E NÃO `rounded-lg`: o canto superior ESQUERDO fica reto porque
 * é lá que a primeira aba encosta. Arredondá-lo deixaria um degrau visível sob a aba "Resultado".
 */
const ABA = 'mt-0 space-y-1.5 rounded-b-lg rounded-tr-lg border border-border bg-card p-1.5';

const zebra = (i: number) => (i % 2 === 0 ? 'bg-card' : 'bg-muted/40');

/**
 * AS LARGURAS DO DRE — e do Investimento, que usa as MESMAS.
 *
 * ⚠ UMA CONSTANTE, NÃO DOIS LITERAIS IGUAIS. As duas tabelas ficam coladas uma sob a outra e
 * precisam de "R$ total sob R$ total"; com o array escrito duas vezes, o primeiro ajuste de
 * coluna desalinharia as duas e ninguém veria até alguém conferir com régua.
 */
const COLS_DRE = ['40%', '17%', '16%', '11%', '16%'];

/**
 * O CARTÃO DA RÉGUA — quatro deles, todos POR HECTARE.
 *
 * ⚠ A UNIDADE VOLTOU PARA O LADO DO NÚMERO, e o motivo de ela ter subido para o rótulo deixou
 * de existir. No F2 o bloco Colheita tinha CINCO cartões em meia tela (~72px de texto cada na
 * tela mais estreita) e "R$ 2.742.022,26" pedia 157px: foi preciso tirar o "R$" do número,
 * tirar os centavos e descer a fonte para 13px. Agora são DOIS por bloco — ~264px cada — e os
 * valores que sobraram têm 4 ou 5 dígitos, não 7. O aperto que justificava a gambiarra sumiu
 * junto com os cartões de total.
 * ⚠ O `nowrap` É LEI, não zelo: o número e a unidade são uma coisa só, e "R$" sozinho numa
 * segunda linha é a quebra clássica deste cartão.
 * ⚠ OS CENTAVOS VOLTARAM. Eles saíram no F2 por causa de um número de SETE dígitos — o
 * faturamento de 2,7 milhões num cartão de ~72px — e essa razão morreu com o bloco de cinco.
 * Por-hectare tem 4 ou 5 dígitos: "14.822,37" pede ~110px num cartão de ~264px. A regra tinha
 * sobrevivido ao motivo dela, e o custo era real — o cartão não batia com a linha do DRE logo
 * abaixo sem passar o mouse.
 * ⚠ O `title` FICA MESMO ASSIM: ele é a defesa do `truncate`, não o esconderijo do centavo.
 */
function Cartao({ rotulo, valor, unidade, titulo, cor }: {
  rotulo: string;
  valor: string;
  /** "R$", "ha" — miúdo, colado no número. */
  unidade?: string;
  /** O valor por extenso, com centavos, no hover. */
  titulo?: string;
  /**
   * A cor do VALOR — vermelho para custo, verde para receita.
   *
   * ⚠ SÓ NOS CARTÕES DE DINHEIRO, e é o que dá sentido à cor: Área e sc/ha ficam neutros porque
   * não são custo nem receita, e pintá-los faria a cor virar decoração em vez de sinal.
   * ⚠ O RÓTULO E A UNIDADE NÃO ACOMPANHAM: quem carrega o sinal é o número.
   */
  cor?: string;
}) {
  return (
    /* ⚠ `py-1` E `leading-none` NO VALOR: a altura do cartão é multiplicada por dois blocos e
       some da tela em toda rolagem. Cada pixel aqui é pixel de tabela lá embaixo. */
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1">
      <div className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      {/* ⚠ O `truncate` FICA como última defesa, mesmo com a conta folgada: uma safra futura
          pode passar da casa dos milhões, e cortar com o inteiro no `title` é melhor que
          empurrar o cartão vizinho para fora do bloco. */}
      <div className="mt-0.5 flex items-baseline gap-1 truncate whitespace-nowrap" title={titulo}>
        {unidade && (
          <span className="shrink-0 text-[11px] font-medium leading-none text-muted-foreground">
            {unidade}
          </span>
        )}
        <span className={cn('truncate text-[16px] font-medium leading-[1.1] tabular-nums', cor)}>
          {valor}
        </span>
      </div>
    </div>
  );
}

/**
 * Uma linha do DRE.
 *
 * ⚠ A HIERARQUIA É TIPOGRÁFICA, NÃO DE FUNDO COLORIDO. Faturamento e Custeio em 14px negrito
 * coloridos; as naturezas recuadas em 11px cinza. Fundo colorido em linha de total competiria
 * com o cabeçalho azul e com o vermelho do saldo negativo — três sinais disputando a mesma
 * leitura.
 */
function Linha({
  rotulo, valor, area, sacas, nivel, cor, nota, onAbrir, pct,
}: {
  rotulo: string;
  valor: number;
  area: number;
  sacas: number;
  /**
   * A participação da linha no custeio total, em %. `undefined` = a coluna fica VAZIA.
   *
   * ⚠ SÓ AS NATUREZAS TÊM: a participação de "Custeio total" em si mesmo seria 100% — um número
   * que não informa nada e ainda compete com os que informam. Faturamento e Saldo não são parte
   * do custeio, então para eles a pergunta nem existe.
   * ⚠ CALCULADO NO FRONT, sem RPC nova: a RPC já manda o valor de cada natureza, e o custeio
   * total já é somado aqui por `custeioTotal`. Pedir o percentual ao banco seria criar uma
   * segunda fonte para uma divisão.
   */
  pct?: number;
  /** 'destaque' = 14px negrito; 'item' = 11px recuado cinza; 'saldo' = 15px negrito. */
  nivel: 'destaque' | 'item' | 'saldo';
  cor?: string;
  nota?: string;
  /**
   * Abre o detalhe daquela linha. Sem ela, a linha não é clicável — e essa é a regra:
   * as linhas-RESUMO (Faturamento, Custeio total, Saldo, Total investido) NÃO abrem.
   *
   * ⚠ É O MESMO CRITÉRIO DO DRE POR CULTURA, conferido lá: `celulaTemDrill` só devolve `true`
   * quando a linha tem grupo próprio; receita líquida, resultado de caixa e depreciação — os
   * resumos dele — ficam sem clique. Um total que abre uma lista "de tudo" não é um drill: é a
   * tela inteira num drawer mais estreito.
   */
  onAbrir?: () => void;
}) {
  const destaque = nivel === 'destaque';
  const saldo = nivel === 'saldo';
  /* ⚠ A ALTURA ACOMPANHA A FONTE, e é metade da hierarquia: só aumentar o corpo do total sem
     lhe dar ar deixa o número grande espremido entre duas naturezas, e a linha que devia
     descansar o olho vira a mais apertada da tabela.
     ⚠ A NATUREZA FOI AO CHÃO — `py-0` e 10px, o piso do A18. O que ganha densidade é SÓ ela: os
     totais mantêm `py-1`, senão comprimir a tabela inteira devolveria o bloco uniforme que a
     hierarquia existiu para desfazer.
     ⚠ E OS TOTAIS DESCERAM ATÉ 12px `font-medium` (eram 15/17 negrito, depois 14): a hierarquia
     12 > 10 continua inteira — dois pontos bastam para o olho separar total de item — e cada
     ponto a menos é linha de tabela que passa a caber sem rolar. O respiro que sobrou entre as
     naturezas é o `border-t` de cada linha, não padding. */
  const pad = nivel === 'item' ? 'py-0' : 'py-1';
  const td = `px-2 ${pad} text-right tabular-nums`;
  return (
    /* ⚠ O `hover` E O `cursor` SÓ EXISTEM QUANDO HÁ O QUE ABRIR: uma linha que muda de cor ao
       passar o mouse e não faz nada ao clique é pior que uma linha inerte — ela promete. */
    <tr className={cn('border-t border-slate-100', saldo && 'border-t-2 border-slate-300',
      onAbrir && 'cursor-pointer hover:bg-[#1e3a5f]/[0.06]')}
      onClick={onAbrir}
      tabIndex={onAbrir ? 0 : undefined}
      role={onAbrir ? 'button' : undefined}
      aria-label={onAbrir ? `Ver lançamentos de ${rotulo}` : undefined}
      onKeyDown={onAbrir
        ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }
        : undefined}>
      <td className={cn('px-2', pad,
        destaque && 'text-[12px] font-medium',
        saldo && 'text-[12px] font-medium',
        nivel === 'item' && 'pl-6 text-[10px] text-muted-foreground')}>
        {rotulo}
        {/* ⚠ "estimado" FICA COLADO NO RÓTULO, não numa coluna própria: é qualidade do número,
            e quem lê a linha tem de ver a ressalva sem procurar. */}
        {nota && <span className="ml-1 text-[9px] font-normal text-amber-600">{nota}</span>}
      </td>
      <td className={cn(td, destaque && 'text-[12px] font-medium', saldo && 'text-[12px] font-medium',
        nivel === 'item' && 'text-[10px]', cor)}>
        {formatMoeda(valor)}
      </td>
      <td className={cn(td, destaque && 'text-[12px] font-medium', saldo && 'text-[12px] font-medium',
        nivel === 'item' && 'text-[10px]', cor)}>
        {formatMoeda(porHa(valor, area))}
      </td>
      {/* ⚠ A % FICA CINZA MESMO NA LINHA VERMELHA: ela não é dinheiro, é proporção — pintá-la
          de vermelho junto faria três colunas gritando a mesma coisa e nenhuma sobressaindo. */}
      <td className={cn(td, nivel === 'item' && 'text-[10px]', 'text-muted-foreground')}>
        {pct == null ? '' : `${formatNum(pct, 1)}%`}
      </td>
      <td className={cn(td, destaque && 'text-[12px] font-medium', saldo && 'text-[12px] font-medium',
        nivel === 'item' && 'text-[10px]', cor)}>
        {formatMoeda(porSaca(valor, sacas))}
      </td>
    </tr>
  );
}

export function PainelSafraTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');
  const [cultura, setCultura] = useState('');
  /**
   * A aba aberta. `'resultado'` por padrão — é a pergunta que traz o operador aqui.
   *
   * ⚠ NÃO VAI PARA A URL, e é decisão, não esquecimento: a casa tem o padrão (`useFiltroUrl`,
   * `usePeriodoUrl`) e ele existe para o que se COMPARTILHA por link — período e filtro. Qual
   * aba estava aberta é estado de sessão de quem olha, não recorte do dado; pô-la na URL faria
   * o link do painel carregar a preferência de navegação de quem o mandou.
   * ⚠ E TROCAR DE SAFRA NÃO VOLTA PARA A PRIMEIRA ABA: quem está comparando histórico quer
   * comparar outra safra no MESMO histórico.
   */
  const [aba, setAba] = useState('resultado');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  /**
   * ⚠ A CULTURA SAI DOS TALHÕES DAQUELA SAFRA, como na colheita e na venda do barter: só se
   * analisa o que se plantou. Uma lista fixa ofereceria milho numa safra que só teve amendoim, e
   * o painel abriria zerado sem dizer por quê.
   */
  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);
  useEffect(() => {
    if (culturasDaSafra.length === 0) { setCultura(''); return; }
    if (!culturasDaSafra.includes(cultura)) setCultura(culturasDaSafra[0]);
  }, [culturasDaSafra, cultura]);

  const { painel, carregando, erro, recarregar: recarregarPainel } =
    usePainelSafra(clienteId, safraId || null, cultura || null);
  const { safras: comparadas, recarregar: recarregarComparativo } =
    useComparativoSafras(clienteId, cultura || null);
  /**
   * As safras que EFETIVAMENTE colheram — a série dos dois gráficos do histórico.
   *
   * ⚠ SUBIU PARA CÁ quando a Roça mudou de aba: ela era um `const` dentro do closure da
   * Composição, e o gráfico foi para o Histórico. Em vez de refazer o `filter` nos dois lugares,
   * ele passou a ser um só — dois filtros iguais em telas diferentes é como um deles envelhece
   * sozinho.
   * ⚠ SAFRA SEM COLHEITA FICA DE FORA, não entra com zero: a 26/27 tem 279 ha plantados e o grão
   * no chão, e uma barra de altura zero afirmaria fracasso sobre safra que nem terminou.
   */
  const comColheita = useMemo(() => comparadas.filter(colheu), [comparadas]);
  const safra = safras.find(s => s.id === safraId);

  const area = painel?.area_ha ?? 0;
  const sacas = painel?.total_sacas ?? 0;
  const custeio = painel ? custeioTotal(painel) : 0;

  /** Só as naturezas com valor — a tabela ajusta entre safras, como o briefing decidiu. */
  const naturezas = (painel?.natureza ?? []).filter(n => n.valor !== 0);

  /* ───────────────────────── O DRILL ─────────────────────────
   * ⚠ MESMO DRAWER, MESMA ÁRVORE, MESMA TRADUÇÃO DO DRE POR CULTURA. Nada novo foi escrito:
   * `AnaliseDrawer` + `DrillDownEconomico` + `NIVEIS_DRILL` + `paraItemDrillDaSafra`.
   *
   * ⚠ MAS A PENEIRA É A DO PAINEL, NÃO A DO DRE, e é a parte que não se pode copiar. O DRE
   * agrupa por `grupo_custo` e reparte as culturas com `bucketDaLinha`; `fn_painel_safra`
   * agrupa por `centro_custo` (custeio) e por `subcentro` (investimento), e trata a cultura de
   * outro jeito — `coalesce(cultura,'') in (p_cultura,'')`, ou seja, o lançamento SEM cultura
   * entra em TODAS as culturas da safra. Medido na 25/26: são 397 lançamentos sem cultura, que
   * contam tanto no amendoim quanto na mandioca. Filtrar por `cultura = X` faria a lista somar
   * bem menos que o número clicado.
   */
  const { lancamentos, fornecedores, recarregar: recarregarLancamentos } =
    useLancamentosDaSafra(clienteId, safraId || null);
  const [drill, setDrill] = useState<
    { tipo: 'centro' | 'subcentro' | 'grupo'; chave: string; rotulo: string } | null>(null);

  /* ⚠ OS TRÊS PREDICADOS COMUNS, COPIADOS DA RPC: cliente e safra já vêm da consulta; aqui
     ficam a cultura (com o vazio junto) e a separação custeio × investimento, que é
     `macro_custo ilike '%investimento%'` — nunca uma lista de nomes escrita à mão. */
  const daCultura = (l: LancamentoDaSafra) => (l.cultura ?? '') === cultura || (l.cultura ?? '') === '';
  const ehInvestimento = (l: LancamentoDaSafra) => (l.macro_custo ?? '').toLowerCase().includes('investimento');

  const itensDoDrill: ItemDrill[] = useMemo(() => {
    if (!drill) return [];
    const filtro = drill.tipo === 'centro'
      /* ⚠ `compoe_dre` E `2-Saídas` SÃO DA RPC, e sem os dois a lista passaria a somar o que a
         própria tela declara FORA do custeio, no aviso do rodapé. O `(sem)` é o rótulo que a
         RPC dá ao centro nulo — comparar com ele devolve exatamente aquelas linhas. */
      ? (l: LancamentoDaSafra) => l.compoe_dre === true && l.tipo_operacao === '2-Saídas'
        && !ehInvestimento(l) && (l.centro_custo ?? '(sem)') === drill.chave
      : drill.tipo === 'subcentro'
        ? (l: LancamentoDaSafra) => ehInvestimento(l) && (l.subcentro ?? '') === drill.chave
        /* ⚠ JUROS É O ÚNICO QUE FILTRA POR GRUPO, porque é o único que não vem da agregação por
           natureza: o painel o lê do DRE (`fn_dre_agricola_por_safra`), e o grupo é a chave que
           o DRE usa. Conferido nas cinco combinações safra×cultura do Proto: onde a linha
           aparece, a soma por grupo bate com o número do DRE ao centavo (25/26 amendoim,
           137.241,23 dos dois lados). */
        : (l: LancamentoDaSafra) => (l.grupo_custo ?? '') === drill.chave;
    return lancamentos.filter(l => daCultura(l) && filtro(l))
      .map(l => paraItemDrillDaSafra(l, fornecedores));
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `daCultura`/`ehInvestimento` são
       puras e derivam de `cultura`, que já está nas dependências. */
  }, [drill, lancamentos, fornecedores, cultura]);

  const totalDoDrill = useMemo(
    () => itensDoDrill.reduce((acc, it) => acc + Math.abs(it.mov), 0), [itensDoDrill]);

  /* ─────────────────────── O MODAL DO RATEIO ───────────────────────
   * ⚠ QUEM DECIDE QUAL TELA ABRIR É O DADO, NÃO O TIPO DA LINHA. Uma natureza pode ser 100%
   * direta (Logística, Operações) ou quase toda compartilhada (Operações Mecanizadas, com
   * R$ 561 mil de pool na 25/26) — e o painel não sabe qual é qual, porque `fn_painel_safra`
   * devolve só o valor somado. A `fn_painel_rateio_detalhe` sabe: se ela volta com `pool > 0`,
   * a linha é rateada e merece o modal; senão, o drawer simples de sempre responde melhor.
   * ⚠ UMA CONSULTA POR CLIQUE, nunca por render: é o mesmo payload que o modal consome, então
   * quando ele abre já está tudo carregado — e a linha direta paga uma consulta barata para
   * cair no caminho de antes.
   */
  const [rateio, setRateio] = useState<
    { dados: RateioDetalhe; tipo: TipoRateio; titulo: string } | null>(null);

  const abrirRateio = async (
    tipo: TipoRateio, chave: string, rotulo: string,
    /* O que fazer quando a linha for direta pura — o drawer de sempre. */
    seDireta: () => void,
  ) => {
    if (!clienteId || !safraId || !cultura) return;
    const { data } = await (supabase as any).rpc('fn_painel_rateio_detalhe', {
      p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
      p_tipo: tipo, p_chave: chave,
    });
    const d = data as RateioDetalhe | null;
    /* ⚠ O ADMIN ABRE SEMPRE, mesmo com pool zero: ele É o rateio, e a explicação dos dois passos
       é a razão de a linha existir. Nas outras duas, pool zero quer dizer "não há o que
       repartir" — e um donut de uma fatia só não explica nada. */
    if (d && (tipo === 'admin' || d.pool > 0)) {
      setRateio({
        dados: d, tipo,
        titulo: `${rotulo} · ${labelDaCultura(cultura)}`
          + (safra ? ` · Safra ${safra.codigo || safra.nome}` : ''),
      });
      return;
    }
    seDireta();
  };

  /* ⚠ UMA FUNÇÃO SÓ PARA O INVESTIMENTO porque o clique e o Enter chamam o mesmo caminho, e
     duplicar a chamada nos dois faria um deles envelhecer sozinho.
     ⚠ E ELA VEM DEPOIS DE `abrirRateio`, não antes: o gate de TDZ acusa função usada acima da
     declaração no mesmo escopo, e aqui o conserto é só ordem. */
  const abrirInvestimento = (tipo: string) => abrirRateio('investimento', tipo, tipo,
    () => setDrill({ tipo: 'subcentro', chave: tipo, rotulo: tipo }));


  /**
   * A LINHA DE TOTAIS DA ANÁLISE POR TALHÃO — somada aqui, não pedida à RPC.
   *
   * ⚠ SOMAR O QUE A TELA MOSTRA é o que garante que o total feche com as linhas acima dele. Uma
   * soma feita no banco, sobre a mesma tabela mas por outro caminho, pode divergir da lista por
   * um talhão filtrado ou um arredondamento — e aí o operador confere com a régua e acha uma
   * diferença que não existe em lugar nenhum.
   * ⚠ MAS O sc/ha É RAZÃO, NÃO SOMA: `soma(sacas) / soma(area)`, nunca a média dos sc/ha. Somar
   * produtividades daria peso igual a um talhão de 5 ha e a um de 90.
   * ⚠ E A % DE AFLATOXINA É PONDERADA PELAS SACAS BOAS, pela mesma razão e com mais força: a
   * média simples de 11,5% num talhão pequeno com 0,0% num grande diria ~5,8%, quando o lote
   * inteiro que a cooperativa recebe tem outra proporção. O peso é o grão, não o talhão.
   */
  const totaisTalhoes = useMemo(() => {
    const ts = painel?.talhoes ?? [];
    const area = ts.reduce((a, t) => a + t.area_ha, 0);
    const sacas = ts.reduce((a, t) => a + t.sacas, 0);
    const boas = ts.reduce((a, t) => a + t.sacas_boas, 0);
    const roca = ts.reduce((a, t) => a + t.roca_sacas, 0);
    const acima = ts.reduce((a, t) => a + (t.sacas_boas * t.pct_afla20) / 100, 0);
    return {
      area, sacas, boas, roca,
      sacasHa: area > 0 ? sacas / area : 0,
      pctAfla: boas > 0 ? (acima / boas) * 100 : 0,
    };
  }, [painel?.talhoes]);

  /* ───────────────── A EDIÇÃO DE UM LANÇAMENTO, DE DENTRO DO DRILL ─────────────────
   * ⚠ O MESMO `LancamentoV2Dialog` DO DRE POR CULTURA E DO PAINEL POR PERÍODO, com a mesma
   * passagem de catálogos e o mesmo `onSave`. Nenhuma variante: o operador que corrige um
   * lançamento aqui vê exatamente a tela que veria vindo do DRE.
   */
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);

  /* ⚠ OS CATÁLOGOS CARREGAM UMA VEZ, na montagem, como no DRE: o modal precisa de contas,
     classificações, fornecedores e safras, e buscá-los ao abrir deixaria o primeiro clique com
     os seletores vazios. */
  useEffect(() => {
    void fin.loadContas();
    void fin.loadClassificacoes();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  /**
   * ⚠ A LINHA VEM INTEIRA DO BANCO (`select('*')`) — copiado do DRE, e pelo mesmo motivo: a
   * lista do drill carrega quinze colunas e o modal precisa das sessenta e cinco. Buscar uma
   * linha ao clicar é mais barato que trazer tudo para o caso de o operador abrir uma.
   */
  const abrirLancamento = async (id: string) => {
    const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('*').eq('id', id).maybeSingle();
    const linha: LancamentoV2 | null = data ?? null;
    if (linha) setEditando(linha);
  };

  return (
    <div className="w-full p-4 animate-fade-in">
      {/* ⚠ O `Tabs` ENVOLVE O BLOCO CONGELADO TAMBÉM, e não só o conteúdo: a `TabsList` é parte
          do que fica fixo, e ela só funciona dentro do contexto. O `Tabs` em si não desenha
          nada — é provedor e um `div`. */}
      <Tabs value={aba} onValueChange={setAba}>
      {/* ── O BLOCO QUE FICA ──
          ⚠ AGORA É O CABEÇALHO INTEIRO, não só os cartões: título, seletores, régua e a barra de
          abas. Antes, rolar até o histórico deixava o operador sem saber qual safra estava
          vendo — e trocar de safra exigia subir a tela toda.
          ⚠ QUEM ROLA É A `<section>` DO V2INDEX, reconferido: a seção `painel-safra` não está em
          `SECOES_APP_SHELL`, então cai no ramo `flex-1 min-h-0 overflow-auto` — é NELA que o
          `top-0` ancora. Sem essa conferência o `sticky` gruda num scrollport que não existe e o
          bloco sobe junto com a página, que é o defeito que a lista de movimentações já teve
          duas vezes.
          ⚠ `-mx-4 -mt-4 px-4 pt-4` CANCELA O `p-4` DO CONTAINER: sem isso o bloco é mais estreito
          que as tabelas e elas passam pelos dois vãos laterais por cima dele, e sobra uma fresta
          transparente acima quando ele gruda.
          ⚠ FUNDO `bg-background` OPACO e `border-b` NO PRÓPRIO BLOCO (A21): translúcido é pior
          que não fixar — o número que se está conferindo fica com a tabela correndo por dentro. */}
      {/* ⚠ OS VÃOS FORAM AO MÍNIMO ÚTIL, não a zero: `space-y-1.5` entre as faixas do cabeçalho,
          `pt-3` acima do título e `pb-1` abaixo das abas. Colar tudo faria a barra de abas
          parecer parte da régua de cartões; o que se tirou foi o excesso, não a separação. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-1.5 space-y-1.5 border-b bg-background
        px-4 pb-1 pt-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* ⚠ O SUBTÍTULO SAIU. Ele explicava o que a tela é — "o ciclo inteiro: o que plantou,
            colheu, gastou e sobrou" — e isso se aprende na primeira visita, não na milésima. O
            bloco congelado cobra a altura dele em TODA rolagem, de todo operador, para sempre:
            é a linha mais cara da tela e a menos lida. Os quatro cartões logo abaixo dizem a
            mesma coisa com números. */}
        <h2 className="text-[15px] font-bold text-foreground">Painel da Safra</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[150px]">
            <Label className="text-[10px]">Cultura</Label>
            <Select value={cultura} onValueChange={setCultura} disabled={culturasDaSafra.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Escolha'} />
              </SelectTrigger>
              <SelectContent>
                {culturasDaSafra.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ⚠ A FAIXA DO CICLO SAIU, e as quatro coisas que ela dizia continuam na tela: cultura e
          safra nos seletores logo acima, área no primeiro cartão, e os NOMES DOS TALHÕES na
          coluna "Análise por talhão" lá embaixo — conferido antes de apagar, porque era a única
          informação da faixa que os filtros não repetiam. Ela custava uma linha inteira para
          reescrever o que já estava à vista. */}

      {erro && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          Não foi possível carregar o painel: {erro.message}
        </div>
      )}

      {/* ── PLANTIO E COLHEITA — A FAIXA QUE FICA ──
          ⚠ OS DOIS BLOCOS FICAM SEMPRE, com os mesmos cartões, mesmo zerados. Safra sem colheita
          mostra zero — que é a verdade — em vez de sumir com metade da tela.
          ⚠ E AGORA ELES NÃO SAEM DA TELA (A21): as tabelas rolam POR BAIXO desta faixa. Área,
          custeio/ha e sc/ha são a régua contra a qual cada linha do DRE é lida — rolar até o
          histórico e não ter mais o denominador à vista é o que obrigava a subir e descer.
          ⚠ QUEM ROLA É A `<section>` DO V2INDEX, conferido antes de escrever `sticky`: a seção
          `painel-safra` não está em `SECOES_APP_SHELL`, então cai no ramo
          `flex-1 min-h-0 overflow-auto` — é NELA que o `top-0` ancora. Sem essa conferência o
          `sticky` gruda num scrollport que não existe e a faixa sobe junto com a página, que é
          o defeito que a lista de movimentações já teve duas vezes.
          ⚠ `-mx-4 px-4` PARA COBRIR O `p-4` DO CONTAINER: sem isso a faixa é mais estreita que
          as tabelas, e as linhas passam pelos dois vãos laterais por cima dela. E o fundo é
          `bg-background` OPACO — translúcido seria pior que não fixar, porque o número que se
          está conferindo ficaria com a tabela correndo por dentro.
          ⚠ `-mt-2 pt-2` CANCELA O `space-y-2` acima dela: o respiro do irmão anterior viraria
          uma fresta transparente no topo quando a faixa gruda. */}
      {/* ⚠ O `sticky` SAIU DAQUI: quem fixa agora é o bloco inteiro acima. Dois `sticky top-0`
          aninhados disputariam a mesma âncora e o de dentro venceria, deixando o título rolar
          por baixo dos próprios cartões. */}
      <div className="grid gap-1.5 md:grid-cols-2">
        <div className="rounded-md border p-1.5">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Plantio</div>
          {/* ⚠ DOIS CARTÕES, E SÓ O POR HECTARE. O "Custeio total" saiu daqui porque ele está,
              em R$ cheio e com centavos, na linha "Custeio total" do DRE dez pixels abaixo —
              e dois números iguais em tamanhos diferentes na mesma tela é como nascem as
              divergências de leitura.
              ⚠ E O POR-HECTARE CABE FOLGADO: os valores que sobraram têm 4 a 5 dígitos, não 7.
              Foi o `6.087.725` que obrigou a tirar os centavos e a descer para 13px no bloco de
              cinco; sem ele, o número volta a caber inteiro. */}
          <div className="grid grid-cols-2 gap-1.5">
            <Cartao rotulo="Área" unidade="ha" valor={formatNum(area, 2)} />
            <Cartao rotulo="Custeio / ha" unidade="R$" cor="text-destructive"
              valor={formatNum(porHa(custeio, area), 2)}
              titulo={formatMoeda(porHa(custeio, area))} />
          </div>
        </div>
        <div className="rounded-md border p-1.5">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Colheita</div>
          {/* ⚠ Sc/ha ANTES de Fat./ha: é a ordem da pergunta do produtor — primeiro quanto o
              hectare produziu, depois quanto isso virou dinheiro.
              ⚠ SAÍRAM "Total sc", "Faturamento" e "R$/sc". Os dois primeiros porque o
              faturamento em R$ cheio já é a primeira linha do DRE e as sacas totais estão no
              rodapé da análise por talhão; o "R$/sc" porque é PREÇO, não régua de ciclo — ele
              pertence à venda, não ao raio-x da safra. */}
          <div className="grid grid-cols-2 gap-1.5">
            <Cartao rotulo="sc / ha" valor={formatNum(painel?.sacas_ha ?? 0, 2)} />
            <Cartao rotulo="Fat. / ha" unidade="R$" cor="text-success"
              valor={formatNum(porHa(painel?.faturamento ?? 0, area), 2)}
              titulo={formatMoeda(porHa(painel?.faturamento ?? 0, area))} />
          </div>
        </div>
      </div>

        {/* ⚠ A BARRA DE ABAS É A ÚLTIMA COISA DO BLOCO FIXO, encostada na borda de baixo: é ela
            que diz o que está sendo mostrado logo abaixo, e separá-la do conteúdo por uma faixa
            que rola faria o rótulo e a tabela se descolarem ao primeiro scroll. */}
        {/* ⚠ ABAS EM PASTA, e o que as faz parecer pasta é UMA coisa: a ativa NÃO TEM BORDA
            EMBAIXO. É essa falta que cola a aba no corpo e cria a ilusão de continuidade; o
            fundo igual e o raio só de cima são o acabamento. Sem isso, três retângulos
            arredondados em cima de uma caixa não leem como pasta nenhuma.
            ⚠ E ELA É PUXADA MEIO PIXEL PARA BAIXO (`top-[0.5px]`) para COBRIR a borda superior
            do corpo — sem esse meio pixel sobra um fio entre a aba e o conteúdo, e a pasta
            aparece cortada.
            ⚠ O `TabsList` DA CASA VEM COM `bg-muted`, `rounded-md` e `p-0.5`, que desenham a
            pílula do padrão antigo: os três são desfeitos aqui, não sobrescritos por acaso.
            `h-auto` porque a aba ativa é mais alta que as inativas, de propósito. */}
        <TabsList className="h-auto w-auto justify-start gap-1 rounded-none bg-transparent p-0">
          {([
            ['resultado', 'Resultado'],
            ['producao', 'Produção'],
            ['historico', 'Histórico'],
          ] as const).map(([v, rotulo]) => (
            <TabsTrigger key={v} value={v}
              className={cn(
                'rounded-b-none rounded-t-lg border border-border px-5 text-[12px] font-medium',
                'data-[state=active]:relative data-[state=active]:top-[0.5px]',
                'data-[state=active]:border-b-transparent data-[state=active]:bg-card',
                'data-[state=active]:text-foreground data-[state=active]:shadow-none',
                'data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground',
                'data-[state=active]:py-1.5 data-[state=inactive]:py-1',
              )}>
              {rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* ⚠ `mt-0` CANCELA a margem padrão do primitivo — quem dá o respiro é o `mb-2` do bloco
          fixo. E o `space-y-2` de cada aba é o que era do container antes das abas: o
          espaçamento entre tabelas não mudou, só mudou de dono. */}
      <TabsContent value="resultado" className={ABA}>

      {/* ── O DRE DO CICLO ──
          ⚠ CINCO COLUNAS AGORA, e as MESMAS cinco no Investimento logo abaixo: as duas tabelas
          ficam uma sob a outra e um colgroup diferente faria o olho reancorar entre elas. */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {COLS_DRE.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {/* ⚠ "DRE" E NÃO "Linha": com as abas, esta é a tabela que responde pela aba
                  Resultado, e o cabeçalho da primeira coluna é onde ela se nomeia — o mesmo
                  padrão de "Investimento na abertura" logo abaixo. */}
              <th className={cn(TH, 'text-left')}>DRE</th>
              <th className={cn(TH, 'text-right')}>R$ total</th>
              <th className={cn(TH, 'text-right')}>R$ / ha</th>
              <th className={cn(TH, 'text-right')}>%</th>
              <th className={cn(TH, 'text-right')}>R$ / sc</th>
            </tr>
          </thead>
          <tbody>
            <Linha rotulo="Faturamento" valor={painel?.faturamento ?? 0}
              area={area} sacas={sacas} nivel="destaque" cor="text-success" />
            {(painel?.deducoes ?? 0) !== 0 && (
              <Linha rotulo="Deduções" valor={painel?.deducoes ?? 0}
                area={area} sacas={sacas} nivel="item" cor="text-destructive" />
            )}

            <Linha rotulo="Custeio total" valor={custeio}
              area={area} sacas={sacas} nivel="destaque" cor="text-destructive" />
            {naturezas.map(n => (
              <Linha key={n.centro} rotulo={n.centro} valor={n.valor}
                area={area} sacas={sacas} nivel="item" cor="text-destructive"
                pct={custeio > 0 ? (n.valor / custeio) * 100 : undefined}
                onAbrir={() => { void abrirRateio('natureza', n.centro, n.centro,
                  () => setDrill({ tipo: 'centro', chave: n.centro, rotulo: n.centro })); }} />
            ))}
            {/* ⚠ LINHA PRÓPRIA, E MARCADA. O rateio administrativo não tem centro de custo: ele é
                repartido por janela de datas e peso da cultura. Somado às naturezas viraria um
                centro que não existe; fora da conta, o custeio não fecharia com o DRE. */}
            {/* ⚠ O "estimado" SAIU DO RÓTULO (decisão do Gabriel), mas a ressalva NÃO sumiu da
                tela: ela segue no comentário acima e, para o operador, no rodapé do comparativo,
                que explica que o rateio entra por janela de datas. O que se tirou foi o adjetivo
                colado no nome — não a informação.
                ⚠ E O COMENTÁRIO FICA AQUI FORA, nunca como primeiro filho de `cond && (…)`: ali
                ele é uma EXPRESSÃO de objeto vazio para o parser, não um comentário, e derruba o
                build com TS1005. Já aconteceu duas vezes neste repo. */}
            {/* ⚠ E AGORA ELE ABRE — era a única linha sem clique desde a F1, e por um motivo que
                deixou de valer: faltava a maquinaria que explica o rateio em dois passos, e ela é
                exatamente o que o `RateioDetalheModal` faz. A chave é VAZIA porque a RPC ignora
                `p_chave` no ramo admin; inventar uma seria fingir um recorte.
                ⚠ O COMENTÁRIO FICA AQUI FORA, nunca como primeiro filho de `cond && (…)`: ali ele
                é uma expressão de objeto vazio para o parser, não um comentário. Terceira vez
                neste arquivo. */}
            {(painel?.rateio_admin ?? 0) !== 0 && (
              <Linha rotulo="Rateio administrativo" valor={painel?.rateio_admin ?? 0}
                area={area} sacas={sacas} nivel="item" cor="text-destructive"
                pct={custeio > 0 ? ((painel?.rateio_admin ?? 0) / custeio) * 100 : undefined}
                onAbrir={() => { void abrirRateio('admin', '', 'Rateio administrativo', () => {}); }} />
            )}
            {(painel?.juros ?? 0) !== 0 && (
              <Linha rotulo="Juros" valor={painel?.juros ?? 0}
                area={area} sacas={sacas} nivel="item" cor="text-destructive"
                pct={custeio > 0 ? ((painel?.juros ?? 0) / custeio) * 100 : undefined}
                onAbrir={() => setDrill({
                  tipo: 'grupo', chave: 'Juros de Financiamento Agricultura', rotulo: 'Juros',
                })} />
            )}

            <Linha rotulo="Saldo" valor={painel?.saldo ?? 0} area={area} sacas={sacas}
              nivel="saldo" cor={(painel?.saldo ?? 0) < 0 ? 'text-destructive' : 'text-success'} />
          </tbody>
        </table>
      </div>

      {/* ── INVESTIMENTO NA ABERTURA ──
          ⚠ MESMAS COLUNAS DA TABELA DE CIMA, e por isso o mesmo `colgroup`: as duas tabelas ficam
          uma sob a outra, e larguras diferentes fariam o olho reancorar a cada bloco. Aqui só
          duas das três colunas têm sentido — R$/saca de um trator não diz nada —, e a terceira
          fica VAZIA em vez de sumir, para as bordas continuarem alinhadas. */}
      {(painel?.investimento_tipos.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {COLS_DRE.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              {/* ⚠ AS CINCO COLUNAS DO DRE, DUAS DELAS VAZIAS DE PROPÓSITO. "% do custeio" não
                  existe para investimento — ele está FORA do custeio — e "R$/saca de um trator"
                  não quer dizer nada. Vazias, elas mantêm R$ total sob R$ total; removidas,
                  as duas tabelas deixariam de se ler como uma coluna só. */}
              <tr>
                <th className={cn(TH, 'text-left')}>Investimentos</th>
                <th className={cn(TH, 'text-right')}>R$ total</th>
                <th className={cn(TH, 'text-right')}>R$ / ha</th>
                <th className={TH} />
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {/* ⚠ UM DRILL POR SUBCENTRO, não um "investimento" só: Formação de Área, Máquinas,
                  Instalações e Correção de Solo são linhas distintas porque a RPC as agrupa por
                  `subcentro` — e é pelo subcentro que a lista de cada uma se filtra. */}
              {painel?.investimento_tipos.map(t => (
                <tr key={t.tipo}
                  className="cursor-pointer border-t border-slate-100 hover:bg-[#1e3a5f]/[0.06]"
                  onClick={() => { void abrirInvestimento(t.tipo); }}
                  tabIndex={0} role="button" aria-label={`Ver lançamentos de ${t.tipo}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void abrirInvestimento(t.tipo);
                    }
                  }}>
                  <td className="px-2 py-0 pl-6 text-[10px] text-muted-foreground">{t.tipo}</td>
                  <td className="px-2 py-0 text-right text-[10px] tabular-nums text-destructive">
                    {formatMoeda(t.valor)}
                  </td>
                  <td className="px-2 py-0 text-right text-[10px] tabular-nums text-destructive">
                    {formatMoeda(t.valor_ha)}
                  </td>
                  {/* ⚠ TRAÇO, NÃO CÉLULA VAZIA. Vazio é ambíguo — parece dado que não carregou;
                      o traço afirma que a pergunta não se aplica: investimento está FORA do
                      custeio, então não tem participação nele, e R$/saca de um trator não quer
                      dizer nada. As colunas continuam existindo para a régua bater com o DRE. */}
                  <td className="px-2 py-0 text-right text-[10px] text-muted-foreground">—</td>
                  <td className="px-2 py-0 text-right text-[10px] text-muted-foreground">—</td>
                </tr>
              ))}
              {/* ⚠ FAIXA ESCURA NO TOTAL, o mesmo `bg-primary` do cabeçalho: as duas bordas da
                  tabela fecham iguais, como no `tfoot` das listas da colheita. Aqui ela substitui
                  o negrito solto sobre fundo branco, que se confundia com mais uma linha de
                  investimento. */}
              {/* ⚠ A TABELA INTEIRA EM 10px, TOTAL INCLUÍDO. Aqui não há hierarquia a marcar: são
                  quatro subcentros e a soma deles, não totais competindo com itens como no DRE.
                  O que separa o total é a FAIXA ESCURA, que já faz o trabalho sozinha — o corpo
                  grande só roubava altura. */}
              <tr className="bg-primary text-primary-foreground">
                <td className="px-2 py-0.5 text-[10px] font-bold">Total investido</td>
                <td className="px-2 py-0.5 text-right text-[10px] font-bold tabular-nums">
                  {formatMoeda(painel?.investimento ?? 0)}
                </td>
                <td className="px-2 py-0.5 text-right text-[10px] font-bold tabular-nums">
                  {formatMoeda(porHa(painel?.investimento ?? 0, area))}
                </td>
                <td className="px-2 py-0.5 text-right text-[10px] font-bold">—</td>
                <td className="px-2 py-0.5 text-right text-[10px] font-bold">—</td>
              </tr>
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Fora do resultado do ciclo: vira patrimônio e amortiza em anos. Está aqui para o
            produtor ver quanto a safra consumiu de caixa ao todo, não só de custeio.
          </p>
        </div>
      )}

      </TabsContent>

      <TabsContent value="producao" className={ABA}>

      {/* ── POR TALHÃO / VARIEDADE ── */}
      {(painel?.talhoes.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['21%', '17%', '11%', '14%', '12%', '13%', '12%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {/* ⚠ O PRIMEIRO `th` É O NOME DA SEÇÃO, não o rótulo da coluna — o padrão que a
                    tabela de Investimento já usa neste arquivo ("Investimento na abertura" no
                    lugar de "Tipo"). O rótulo não se perde: uma coluna de nomes de talhão sob um
                    título que diz "Análise por Talhão" não precisa repetir a palavra.
                    ⚠ E O PADRÃO TEM DUAS PARTES: o título AQUI e o `pl-6` na primeira célula do
                    corpo. É o recuo que faz as linhas se lerem como itens DAQUELA seção; só o
                    texto no `th` deixaria o nome da seção parecendo um cabeçalho de coluna
                    comprido. */}
                <th className={cn(TH, 'text-left')}>Análise por talhão</th>
                <th className={cn(TH, 'text-left')}>Variedade</th>
                <th className={cn(TH, 'text-right')}>Área ha</th>
                <th className={cn(TH, 'text-right')}>Sacas boas</th>
                <th className={cn(TH, 'text-right')}>sc / ha</th>
                <th className={cn(TH, 'text-right')}>Roça (sc)</th>
                {/* ⚠ "% Afla" É SOBRE AS SACAS BOAS ACIMA DE 20 ppb — o corte da cooperativa.
                    O rótulo é curto porque a coluna é estreita; o que ele significa está no
                    tipo da RPC e na nota do rodapé desta tabela. */}
                <th className={cn(TH, 'text-right')}>% Afla</th>
              </tr>
            </thead>
            <tbody>
              {painel?.talhoes.map((t, i) => (
                <tr key={`${t.talhao}·${t.variedade ?? ''}`}
                  className={cn('border-t border-slate-100', zebra(i))}>
                  <td className="truncate px-2 py-0.5 pl-6 text-[11px]" title={t.talhao}>{t.talhao}</td>
                  {/* ⚠ `—` PARA VARIEDADE NULA: a coluna existe sempre, porque some-la quando
                      nenhum talhão tem variedade faria a tabela mudar de forma entre safras. */}
                  <td className="truncate px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t.variedade ?? '—'}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.area_ha, 2)}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.sacas_boas, 2)}</td>
                  {/* ⚠ O MELHOR EM NEGRITO SÓ QUANDO HÁ COM QUEM COMPARAR. Com um talhão só,
                      destacar a única linha sugeriria um ranking que não existe. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    i === 0 && (painel?.talhoes.length ?? 0) > 1 && 'font-bold text-success')}>
                    {formatNum(t.sacas_ha, 2)}
                  </td>
                  {/* ⚠ ROÇA É SEMPRE VERMELHA, a mesma convenção da lista de cargas: ela é
                      refugo, e o vermelho aqui não julga uma faixa — diz o que aquele grão é.
                      ⚠ ZERO FICA CINZA: um talhão sem refugo não é um alerta. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    t.roca_sacas > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatNum(t.roca_sacas, 2)}
                  </td>
                  {/* ⚠ 0,0% APARECE, nunca "—": o traço diria que o laudo não existe, e aqui
                      ele existe e deu zero — que é o melhor resultado possível. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    t.pct_afla20 > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatNum(t.pct_afla20, 1)}%
                  </td>
                </tr>
              ))}
              {/* ⚠ FAIXA ESCURA, como o "Total investido": é o mesmo papel — a borda de baixo da
                  tabela — e duas convenções diferentes para a mesma função fariam o olho
                  reaprender a cada bloco.
                  ⚠ A ÁREA E AS SACAS FECHAM COM OS CARTÕES DO TOPO por construção: são o mesmo
                  array somado. Se um dia divergirem, é porque alguém passou a filtrar a lista
                  sem filtrar o cartão. */}
              <tr className="bg-primary text-primary-foreground">
                <td className="px-2 py-1 text-[12px] font-bold" colSpan={2}>Total</td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.area, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.boas, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.sacasHa, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.roca, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-bold tabular-nums">
                  {formatNum(totaisTalhoes.pctAfla, 1)}%
                </td>
              </tr>
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Só a <strong>produtividade</strong> é real por talhão. O custo não aparece aqui porque
            o lançamento financeiro guarda safra e cultura, nunca o talhão — custo por talhão vem
            quando o lançamento marcar talhão.
          </p>
        </div>
      )}

      {/* ── COMPOSIÇÃO POR QUALIDADE ──
          ⚠ A ROÇA É RECEITA *E* PERDA, e as duas coisas ao mesmo tempo (decisão do Gabriel). Ela
          é vendida a R$ 80 e entra no faturamento e na produtividade — escondê-la faria a conta
          não fechar. Mas é grão refugado, e o que se quer é reduzi-la safra a safra. Por isso
          aparece SEPARADA e nomeada "perda de qualidade", nunca fundida no total nem omitida. */}
      {(() => {
        const sel = comparadas.find(sf => sf.safra_id === safraId);
        if (!sel || !colheu(sel)) return null;
        const pctBom = sel.total_sacas > 0 ? 100 - sel.pct_roca : 0;
        return (
          /* ⚠ UMA COLUNA AGORA: o grid de duas existia para o gráfico da Roça, que foi para a aba
             Histórico. Mantê-lo faria a tabela ocupar metade da largura e a outra metade ficar
             vazia — o grid vazio é mais visível que o grid ausente. */
          <div className="grid gap-2">
            <div className="min-w-0 overflow-hidden rounded-md border">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  {['34%', '22%', '22%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Composição da produção</th>
                    <th className={cn(TH, 'text-right')}>Sacas</th>
                    <th className={cn(TH, 'text-right')}>% do total</th>
                    <th className={cn(TH, 'text-right')}>sc / ha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-[-1px]" />
                      Grão bom
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_boas, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(pctBom, 1)}%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_boas, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-0.5 text-[11px]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#8b5e3c] align-[-1px]" />
                      Grão de roça <span className="text-[9px] text-muted-foreground">perda de qualidade</span>
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sel.sacas_roca, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                      {formatNum(sel.pct_roca, 1)}%
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                      {formatNum(porHa(sel.sacas_roca, sel.area_ha), 2)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td className="px-2 py-0.5 text-[11px] font-bold">Total colhido</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.total_sacas, 2)}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">100,0%</td>
                    <td className="px-2 py-0.5 text-right text-[11px] font-bold tabular-nums">
                      {formatNum(sel.sacas_ha, 2)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
                O grão de roça <strong>é receita</strong> — a cooperativa o compra mais barato — e
                já está no faturamento e na produtividade acima. Aparece separado porque é
                <strong> perda de qualidade</strong>: o alvo é reduzi-lo safra a safra.
              </p>
            </div>

          </div>
        );
      })()}

      {/* ⚠ A COMPOSIÇÃO SUBIU E O COMPARATIVO DESCEU — é a única troca de ordem desta fatia, e
          ela é consequência das abas, não escolha de layout: a composição pertence a "Produção"
          e o comparativo a "Histórico", e no arquivo o comparativo vinha primeiro. Dentro de
          cada aba a ordem dos blocos está intacta. */}
      </TabsContent>

      <TabsContent value="historico" className={ABA}>

      {/* ── COMPARATIVO ENTRE SAFRAS (fatia C) ── */}
      {comparadas.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['20%', '14%', '17%', '17%', '18%', '14%'].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {/* ⚠ MESMO PADRÃO DA SEÇÃO ACIMA: o nome da seção no primeiro `th`, e o
                      `pl-6` no corpo. */}
                  <th className={cn(TH, 'text-left')}>Histórico de safras</th>
                  {/* ⚠ "Custeio direto" SAIU E NÃO FOI RENOMEADO: a coluna agora é o custeio
                      TOTAL por hectare, que é outro número — o direto ignora o rateio
                      administrativo. Trocar só o rótulo sobre o campo velho seria pior que a
                      coluna antiga, porque passaria a prometer o que não entrega.
                      ⚠ Área e Sacas saíram para abrir espaço: as duas seguem nos cartões do topo
                      para a safra aberta, e o que esta tabela compara entre safras é a RÉGUA POR
                      HECTARE — somar hectares de safras diferentes não quer dizer nada. */}
                  <th className={cn(TH, 'text-right')}>sc / ha</th>
                  <th className={cn(TH, 'text-right')}>Receita / ha</th>
                  <th className={cn(TH, 'text-right')}>Custeio / ha</th>
                  <th className={cn(TH, 'text-right')}>Margem / ha</th>
                  <th className={cn(TH, 'text-right')}>% roça</th>
                </tr>
              </thead>
              <tbody>
                {comparadas.map((sf, i) => {
                  const atual = sf.safra_id === safraId;
                  return (
                    /* ⚠ A MARCA DA SAFRA ABERTA VENCE A ZEBRA, nesta ordem: as duas pintam o
                       fundo, e se a zebra viesse depois ela apagaria justamente a linha que o
                       operador precisa achar. */
                    <tr key={sf.safra_id}
                      className={cn('border-t border-slate-100',
                        atual ? 'bg-primary/[0.06]' : zebra(i))}>
                      <td className="truncate px-2 py-0.5 pl-6 text-[11px]">
                        {/* ⚠ A SAFRA ABERTA FICA MARCADA: sem isso o operador compara quatro linhas
                            sem saber qual delas é a que os cards acima estão descrevendo. */}
                        <span className={cn(atual && 'font-bold')}>{sf.codigo}</span>
                        {sf.receita_incompleta && (
                          /* ⚠ ÂMBAR, NUNCA VERMELHO. Vermelho aqui diria "prejuízo", e é venda que
                             falta lançar — o produtor não pode achar que perdeu dinheiro. */
                          <span className="ml-1 whitespace-nowrap text-[8px] text-amber-600">
                            venda parcial — falta lançar
                          </span>
                        )}
                      </td>
                      {/* ⚠ SEM COLHEITA É "—", NÃO ZERO: a 26/27 tem 279 ha plantados e o grão no
                          chão; zero afirmaria fracasso sobre safra que nem terminou. */}
                      <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                        {colheu(sf) ? formatNum(sf.sacas_ha, 2) : '—'}
                      </td>
                      {/* ⚠ A COR SEGUE O SINAL DO DINHEIRO, não a coluna: receita verde,
                          custeio e roça vermelhos — o mesmo par do DRE acima, para as duas
                          tabelas se lerem com a mesma convenção.
                          ⚠ O "—" NÃO GANHA COR. Ausência não é receita nem gasto; pintá-la de
                          verde diria que a safra faturou nada, que é diferente de não se saber. */}
                      <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                        sf.receita > 0 && 'text-success')}>
                        {sf.receita > 0 ? formatMoeda(sf.receita_ha) : '—'}
                      </td>
                      <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                        sf.custeio_ha > 0 && 'text-destructive')}>
                        {sf.custeio_ha > 0 ? formatMoeda(sf.custeio_ha) : '—'}
                      </td>
                      {/* ⚠ MARGEM NEGATIVA NEM SEMPRE É PREJUÍZO, e esta é a única célula da
                          tela em que a cor MENTIRIA. São DOIS motivos diferentes, e nenhum é
                          prejuízo:
                            · `receita_incompleta` — a 24/25 tem −2.431,86/ha porque a venda ainda
                              não foi lançada, não porque a safra deu errado;
                            · SEM COLHEITA — a 26/27 tem 279 ha plantados, custeio lançado e o grão
                              no chão. A receita não está atrasada: ela ainda não existe.
                          Nos dois a margem sai CINZA com o motivo no hover — o número continua à
                          vista, sem o veredicto que ele não sustenta.
                          ⚠ O CRITÉRIO É A FLAG OU A AUSÊNCIA DE SACAS, NUNCA O SINAL: pintar de
                          cinza toda margem negativa esconderia o prejuízo real de uma safra
                          fechada, que é justamente o que esta coluna existe para mostrar. */}
                      <td className={cn('px-2 py-0.5 text-right text-[11px] font-medium tabular-nums',
                        !colheu(sf) || sf.receita_incompleta ? 'text-muted-foreground'
                          : sf.margem_ha >= 0 ? 'text-success' : 'text-destructive')}
                        title={!colheu(sf)
                          ? 'Safra em andamento — ainda não há colheita, então não há receita.'
                          : sf.receita_incompleta
                            ? 'Receita incompleta — falta lançar a venda desta safra.' : undefined}>
                        {formatMoeda(sf.margem_ha)}
                        {(!colheu(sf) || sf.receita_incompleta)
                          && <span className="ml-0.5 text-amber-600">*</span>}
                      </td>
                      <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                        colheu(sf) && sf.pct_roca > 0 && 'text-destructive')}>
                        {colheu(sf) ? `${formatNum(sf.pct_roca, 1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* ⚠ A RESSALVA VELHA SAIU COM A COLUNA VELHA, e é preciso dizer por quê: ela
                avisava "não subtraia da receita aqui" porque a coluna era o custeio DIRETO, e a
                subtração dava um saldo diferente do DRE. Com o custeio TOTAL, a margem fecha —
                e manter o aviso mandaria desconfiar de um número que agora está certo.
                ⚠ O QUE FICA É A NOTA DO ASTERISCO: a única ressalva que sobrevive é a da safra
                cuja venda não foi lançada, e ela é por LINHA, não da tabela inteira. */}
            <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
              <strong>Custeio / ha</strong> é o custeio total do ciclo — rateio administrativo
              incluído —, então <strong>receita − custeio = margem</strong> fecha com o saldo da
              tabela do topo. A margem marcada com <span className="text-amber-600">*</span> é de
              safra com venda ainda não lançada: o número é parcial, não prejuízo.
            </p>
          </div>

          {/* ⚠ OS DOIS GRÁFICOS EMPILHADOS NA MESMA COLUNA `auto` do grid, não lado a lado: eles
              respondem perguntas diferentes sobre a MESMA série de safras — quanto produziu e
              quanto refugou —, e lê-los um sob o outro mantém os rótulos de safra alinhados na
              vertical, que é o que permite comparar a mesma safra nos dois.
              ⚠ A ROÇA VEIO DA ABA PRODUÇÃO (F1), onde tinha ficado por dividir grid e closure com
              a Composição. Separá-la não custou estado nenhum: `comColheita` era usado SÓ por ela,
              e `sel` SÓ pela tabela — bastou a filtragem mudar de lugar. */}
          <div className="flex flex-col gap-2">
          <BarrasCompactas
            titulo="Produtividade por safra"
            legenda="sacas por hectare, com grão de roça — quanto maior, melhor"
            barras={comparadas.map((sf): BarraCompacta => ({
              rotulo: sf.codigo.replace('-Lav', ''),
              valor: colheu(sf) ? sf.sacas_ha : null,
              texto: colheu(sf) ? formatNum(sf.sacas_ha, 0) : '—',
              nota: sf.receita_incompleta ? 'parcial' : undefined,
              cor: sf.safra_id === safraId ? 'bg-primary' : 'bg-primary/45',
            }))}
          />
          <BarrasCompactas
            titulo="Roça por safra"
            legenda="% do total — quanto menor, melhor"
            barras={comColheita.map((sf): BarraCompacta => ({
              rotulo: sf.codigo.replace('-Lav', ''),
              valor: sf.pct_roca,
              texto: `${formatNum(sf.pct_roca, 1)}%`,
              cor: sf.safra_id === safraId ? 'bg-[#8b5e3c]' : 'bg-[#8b5e3c]/45',
            }))}
          />
          </div>
        </div>
      )}


      </TabsContent>
      </Tabs>

      {/* ── O QUE FICA FORA DO RESULTADO ──
          ⚠ ESTA LINHA EXISTE PARA NÃO MENTIR POR OMISSÃO. O operador que somar os lançamentos da
          safra à mão vai achar diferença; dizer antes o que ficou de fora, e por quê, é mais
          barato do que ele descobrir sozinho e desconfiar da tela inteira. */}
      <div className="space-y-1">
        {(painel?.fora_do_custeio ?? 0) !== 0 && (
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>
              <strong>{formatMoeda(painel?.fora_do_custeio ?? 0)}</strong> em lançamentos da safra
              que não compõem o DRE — não entram no custeio, e aparecem aqui para a soma manual
              fechar.
            </span>
          </p>
        )}
        {carregando && <p className="text-[10px] text-muted-foreground">Carregando…</p>}
      </div>

      {/* ── O DRILL ──
          ⚠ O MESMO DRAWER E A MESMA ÁRVORE DO DRE POR CULTURA, sem cópia e sem variante: os
          quatro degraus de `NIVEIS_DRILL` (natureza → grupo → centro → subcentro) são os
          mesmos, e o operador que já usa o DRE não aprende nada novo.
          ⚠ SEÇÃO ÚNICA, ao contrário do DRE: lá a célula de uma cultura pode ser direto +
          rateado e precisa de duas abas. Aqui cada linha clicável tem uma origem só — o rateio
          administrativo, que seria a exceção, é justamente a linha que NÃO abre nesta fatia.
          ⚠ COM `onAbrirLancamento` DESDE A F1B: a orquestração de recarga que faltava está
          escrita no `onSave` do modal abaixo — e são TRÊS fontes nesta tela, não duas. */}
      {drill && (
        <AnaliseDrawer
          titulo={`${drill.rotulo} · ${labelDaCultura(cultura)}`
            + (safra ? ` · Safra ${safra.codigo || safra.nome}` : '')}
          /* ⚠ O SUBTÍTULO DIZ A CONTAGEM, que é o que se confere primeiro contra a tela. */
          subtitulo={`${itensDoDrill.length} lançamento${itensDoDrill.length === 1 ? '' : 's'}`}
          total={totalDoDrill}
          totalLabel="TOTAL DA LINHA"
          onClose={() => setDrill(null)}>
          <DrillDownEconomico itens={itensDoDrill} raiz={drill.rotulo} niveis={NIVEIS_DRILL}
            onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
        </AnaliseDrawer>
      )}

      {/* ⚠ O MODAL DO RATEIO É IRMÃO DOS OUTROS DOIS, pelo mesmo motivo: fechá-lo não pode
          desmontar nada por baixo. Ele recebe o payload INTEIRO da RPC — inclusive o
          `pct_agricultura` —, e deriva sozinho o subtítulo e a nota. */}
      {rateio && (
        <RateioDetalheModal
          aberto
          onFechar={() => setRateio(null)}
          titulo={rateio.titulo}
          dados={rateio.dados}
          tipo={rateio.tipo}
        />
      )}

      {/* ⚠ O MODAL É IRMÃO DO DRAWER, NUNCA FILHO — a mesma decisão do DRE, e é o que faz a
          volta funcionar de graça: fechar a edição não desmonta o drawer, então o caminho
          descido na árvore e a ordenação continuam onde estavam. Aninhá-lo dentro do drawer
          reconstruiria a árvore a cada abertura e devolveria o operador à raiz. */}
      <LancamentoV2Dialog
        open={!!editando}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          /* ⚠ AS TRÊS FONTES DESTA TELA, e nenhuma sobra: o painel é somado pela RPC, a lista do
             drawer é lida do PostgREST e o histórico de safras vem de uma SEGUNDA RPC — o
             lançamento editado entra no custeio direto da safra dele, que é coluna de lá.
             Recarregar duas das três é o pior dos mundos: a linha muda e o detalhe dela não, na
             mesma tela aberta. É a lição que o DRE já pagou. */
          if (ok && id) {
            await recarregarLancamentos();
            await recarregarPainel();
            await recarregarComparativo();
          }
          return ok;
        }}
        lancamento={editando}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
      />
    </div>
  );
}
