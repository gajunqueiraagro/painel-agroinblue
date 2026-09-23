/**
 * DRE DA LAVOURA — a grade única, por safra, em custo operacional efetivo.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_lavoura` devolve cada linha já arredondada, por cultura e no
 * total, e esta tela RENDERIZA. As únicas contas são as duas divisões que o contrato deixa
 * explicitamente ao consumidor — `valor / area_ha` e `valor / producao`. A soma que existia aqui
 * (o total de um centro) saiu na migration `20261027120300`, que passou a devolver `total.valor`.
 *
 * ⚠ ELA NASCEU DO `AgriDreCulturaTab` (mesmo esqueleto de tabela) e o SUBSTITUIU no PR-02,
 * junto com o Painel da Safra: as duas telas foram apagadas e suas seções redirecionam para cá.
 * A Produção do Painel veio inteira (`ProducaoSafraPanel`) e o Histórico passou a ler
 * `fn_dre_lavoura_historico`. Uma safra, uma tela, um número.
 *
 * ⚠ DUAS TELAS: a RAIZ compara as culturas da safra; o DRILL (clique no cabeçalho de uma
 * cultura) é o painel dela, com Resultado, Produção e Histórico. O que separa as duas é um
 * estado só — `cultura`, lido da URL.
 *
 * ⚠ A ORDEM DAS LINHAS É O DRE (padrão Conab), e ela mora AQUI, não no banco: `fn_dre_lavoura`
 * devolve um objeto de 15 chaves sem ordem, porque JSON não tem ordem. Quem sabe que "margem de
 * contribuição" vem depois do custo variável é a apresentação.
 */
import { Fragment, useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Maximize2, Minimize2, AlertTriangle, Loader2, ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { Segmentado } from '@/components/ui/segmentado';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import {
  W_RS, W_HA, W_UN, W_RS_TOTAL, W_GRUPO_MIN, larguraDoGrupo, VERDE, VERDE_70, VERMELHO, VERMELHO_70, AMBAR,
  NAVY_TOTAL, BORDA_TOTAL, BORDA_TOTAL_CAB, FUNDO_TOTAL, FAIXA_TOTAL, traco, corDoSinal, corDoTotal, marcadorDoTotal, Marcador, numeroDaCelula, porUnidade,
  Etiqueta, Celula, CelulaUnit, Caixas, ChipsUnidade, PontoRateio, REGUA_LINHA, tipoDaLinha, fundoDaLinha,
  type CaixaFaixa, type DestaqueLinha, type TomFaixa,
} from '@/components/agri/dreGrade';
import { supabase } from '@/integrations/supabase/client';
import { RateioDetalheModal, type RateioDetalhe, type TipoRateio } from '@/components/agri/RateioDetalheModal';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { simboloDaUnidade, descricaoDaUnidade } from '@/lib/agri/colheita';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { useColheita } from '@/hooks/useColheita';
import { useCliente } from '@/contexts/ClienteContext';
import { usePeriodoUrl } from '@/v2/hooks/usePeriodoUrl';
import { anoMes, descreverPeriodo } from '@/v2/lib/periodo';
import {
  useDrePecuaria, useDrePecuariaLancamentos, useDrePecuariaPatrimonio, useDrePecuariaLista,
  anoMesAntes, type RecortePec, type PeriodoPec,
} from '@/hooks/useDrePecuaria';
import { useFiltroUrl } from '@/v2/hooks/useFiltroUrl';
import {
  SeletorPeriodoPecuaria, safraCorrentePecuaria, useSafraDeAbertura,
} from '@/components/agri/SeletorPeriodoPecuaria';
import { PecLancamentosModal } from '@/components/agri/PecLancamentosModal';
import { PecPatrimonioModal } from '@/components/agri/PecPatrimonioModal';
import { PecRateioAdmModal } from '@/components/agri/PecRateioAdmModal';
import {
  PecHistoricoLinhaModal, type RecorteHistoricoPec,
} from '@/components/agri/PecHistoricoLinhaModal';
import {
  PecDrePanel, FaixaVisoesPec, SeletorAnosPec, colunasDaVisao, deltasDaVisao, lerVisaoPec, escreverVisaoPec, lerNAnosPec,
  escreverNAnosPec, N_ANOS_PADRAO, ehVisaoMetaLegada, type VisaoPec,
} from '@/pages/PecDrePanel';
/* ⚠ AS UNIDADES VÊM DA RÉGUA, não mais da tela — DRE-HISTORICO-LINHA-01a. Mesma lista, mesmo
   rótulo; só o arquivo mudou. */
import {
  UNIDADES_PEC_GRADE, ROTULO_UNIDADE, LINHAS_DO_MODO, type UnidadePec, type ModoDre,
} from '@/components/agri/drePecRegua';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { usePainelSafra, useComparativoSafras } from '@/hooks/usePainelSafra';
import { ProducaoSafraPanel } from '@/components/agri/ProducaoSafraPanel';
import {
  CartaoTalhoes, CartaoQualidade, CartaoEquilibrio, CartaoHistorico,
} from '@/components/agri/CartoesDoDrill';
import { useDreLavouraHistorico, type SafraHistorico } from '@/hooks/useDreLavouraHistorico';
import {
  useLancamentosDaSafra, paraItemDrillDaSafra, type LancamentoDaSafra,
} from '@/hooks/useLancamentosDaSafra';
import { AnaliseDrawer } from '@/components/financeiro-v2/AnaliseDrawer';
import { DrillDownEconomico } from '@/components/financeiro-v2/DrillDownEconomico';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { NIVEIS_DRILL, type ItemDrill } from '@/lib/analise/drillEconomico';
import {
  useDreLavoura,
  type ChaveLinha, type DreCentro, type DreCultura, type DreLavoura, type DreValor,
} from '@/hooks/useDreLavoura';

/* ─────────────────────────── A RÉGUA DAS COLUNAS ───────────────────────────
   ⚠ px FIXOS, e `table-layout: fixed`: número não quebra e não encolhe. Porcentagem faria as
   colunas seguirem a janela, e "3.009.508,69" partido em duas linhas desalinha a coluna inteira.
   A coluna vazia do fim absorve a sobra — é ela que deixa a tabela caber sem esticar números. */
/**
 * ⚠ 210px, E O NÚMERO SAIU DA RÉGUA, não do palpite. O rótulo mais longo é
 * "▸ (−) Rateio compartilhado [estimado]" e ele mede, a 11px: caret 11 + texto 128,8 + espaço 4 +
 * etiqueta 49 + padding 14 = **206,8px**. Em 200 ele truncava por 6,8px — e truncar justamente a
 * etiqueta "[estimado]" apagaria a ressalva que a linha existe para fazer. Em 210 sobram 3,2px.
 * ⚠ ERA 240, e os 33px que sobravam eram largura roubada das colunas de número.
 */
/* ⚠ 200px — DRE-PADRAO-01a-2: a mesma da pecuária, para as duas tabelas começarem no mesmo x. */
const W_CULTURA = 200;

/**
 * AS UNIDADES DA LAVOURA — DRE-UNIDADES-01, na ordem fixa em que as colunas saem.
 *
 * ⚠ `un` É "SACA OU TONELADA", e o símbolo é da CULTURA, não da tela: mandioca fecha em tonelada e
 * amendoim em saca (ver `simboloDaUnidade`). Um rótulo fixo faria a coluna da mandioca mentir
 * sobre a própria grandeza — por isso o chip diz "R$/sc ou t" e o cabeçalho de cada cultura diz o
 * símbolo dela.
 */
const UNIDADES_LAV = ['rs', 'ha', 'un'] as const;
type UnidadeLav = typeof UNIDADES_LAV[number];
const ROTULO_UNIDADE_LAV: Record<UnidadeLav, string> = {
  rs: 'R$', ha: 'R$/ha', un: 'R$/sc ou t',
};

/* ⚠ OS DOIS MÍNIMOS DA GRADE DE DUAS COLUNAS (§3), medidos: abaixo de 380px os cartões perdem a
   coluna de número e os valores quebram linha; abaixo de 450px a tabela não mostra nem a coluna
   Cultura com uma cultura ao lado. */
const W_MIN_GRADE = 450;
const W_MIN_CARTOES = 380;
export 

/** Bloco do DRE que cada grupo expansível abre. */
type Bloco = DreCentro['bloco'];

/**
 * A ANATOMIA DE UMA LINHA, declarada — não quinze blocos de JSX.
 *
 * ⚠ QUINZE LINHAS ESCRITAS À MÃO DIVERGEM NA PRIMEIRA CORREÇÃO: bastaria um `text-destructive`
 * esquecido para uma delas mentir sobre o sinal. Aqui a diferença entre elas é DADO.
 */
interface DefLinha {
  chave: ChaveLinha;
  rotulo: string;
  /** `custo` pinta de vermelho, `receita` de verde, `neutro` não pinta. */
  tom: 'receita' | 'custo' | 'neutro';
  /** Subtotal: fundo, peso 600. `sinal` = a cor vem do próprio número, por cultura. */
  destaque?: 'subtotal' | 'sub' | null;
  /** O tom da faixa azul quando a linha é um total — a mesma escala da pecuária (03b). */
  faixa?: TomFaixa;
  corPorSinal?: boolean;
  /** Grupo que abre em centros. */
  bloco?: Bloco;
  /** Etiqueta cinza-âmbar depois do rótulo. */
  etiqueta?: string;
  /** Some no modo "dentro dos centros" — o rateio passa a viver dentro dos grupos. */
  someComRateioDentro?: boolean;
}

const LINHAS: DefLinha[] = [
  { chave: 'receita_bruta',          rotulo: 'Receita bruta',                   tom: 'receita' },
  { chave: 'deducoes',               rotulo: '(−) Deduções',                    tom: 'custo' },
  { chave: 'receita_liquida',        rotulo: '= Receita líquida',               faixa: 't1', tom: 'receita', destaque: 'subtotal' },
  { chave: 'custeio',                rotulo: '(−) Custeio da lavoura',          tom: 'custo', bloco: 'custeio' },
  { chave: 'pos_colheita',           rotulo: '(−) Pós-colheita',                tom: 'custo', bloco: 'pos_colheita' },
  { chave: 'rateio_compartilhado',   rotulo: '(−) Rateio compartilhado',        tom: 'custo', etiqueta: 'estimado', someComRateioDentro: true },
  { chave: 'custo_variavel',         rotulo: '= Custo variável',                faixa: 't1', tom: 'custo', destaque: 'sub' },
  { chave: 'margem_contribuicao',    rotulo: '= Margem de contribuição',        faixa: 't2', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo',             rotulo: '(−) Custo fixo da lavoura',       tom: 'custo', bloco: 'fixo' },
  { chave: 'rateio_admin',           rotulo: '(−) Rateio administrativo',       tom: 'custo', etiqueta: 'estimado' },
  { chave: 'resultado_operacional',  rotulo: '= Resultado operacional',         faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros',                  rotulo: '(−) Despesas financeiras (juros)', tom: 'custo' },
  /* ⚠ O NOME MUDOU, A CHAVE NÃO — DRE-CASCATA-03a: "Resultado do período" é como a pecuária já
     chamava a mesma linha, e duas atividades do mesmo DRE não podem ter dois nomes para a mesma
     pergunta. A chave `resultado_caixa` fica: renomeá-la quebraria o histórico da lavoura (que
     dele deriva o `resultado_ha`) e o PC-100, em silêncio. */
  { chave: 'resultado_caixa',        rotulo: '= Resultado do período',           faixa: 't3', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  /* ⚠ O INVESTIMENTO ENTROU NA CASCATA — DRE-CASCATA-03a. Ele era vermelho e ficava "abaixo da
     linha de caixa": a faixa dizia que não entrava no resultado do período, e era verdade — mas o
     dinheiro saiu, e a conta que o produtor faz é a que sobra DEPOIS dele. Agora a cascata segue
     até o lucro líquido e a faixa não existe mais. A depreciação continua reservada, sem valor. */
  { chave: 'investimento',           rotulo: '(−) Investimento no período',     tom: 'custo', bloco: 'investimento' },
  { chave: 'lucro_liquido',          rotulo: '= Lucro líquido',                 faixa: 't4', tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'depreciacao',            rotulo: 'Depreciação (reservada · o custo operacional total = efetivo + depreciação nasce aqui)', tom: 'custo' },
];

/* ⚠ DATAS FATIADAS DA STRING, NUNCA POR `new Date('2025-11-10')`: essa forma é interpretada
   como UTC e, em fuso negativo, volta um dia — "09/11" para quem plantou em 10/11. O banco
   devolve `date` como 'YYYY-MM-DD', e o que a régua mostra é exatamente o que está lá. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mesCurto = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1] ?? '—'}/${d.slice(0, 4)}`;

/** As chaves que o modal do Painel sabe abrir, e com que `tipo`. */
const TIPO_DO_MODAL: Partial<Record<ChaveLinha, 'admin'>> = { rateio_admin: 'admin' };



const corDoTom = (tom: DefLinha['tom']) =>
  (tom === 'receita' ? VERDE : tom === 'custo' ? VERMELHO : '');





export function AgriDreLavouraTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);

  /* ───────────────────── SAFRA E CULTURA MORAM NA URL ─────────────────────
   * ⚠ `cultura` É O QUE SEPARA A RAIZ DO DRILL: vazio, a grade compara as culturas da safra;
   * preenchido, a tela vira o painel daquela cultura. Um estado só, e não um `modo` paralelo
   * que pudesse discordar dele.
   * ⚠ E A SEÇÃO NÃO VAI PARA A URL — não é escolha, é como este shell funciona: `section` é
   * estado do `V2Index`, espelhado em `sessionStorage['v2:section']` só para dizer a ORIGEM a
   * quem volta de uma tela global (V2Index:1531 diz isso com todas as letras).
   *
   * ⚠ A SAFRA MORA NA URL; A CULTURA NÃO MORA EM LUGAR NENHUM. Ela era um `searchParam` como a
   * safra, e isso produzia o defeito: `section` é estado e a query string NÃO é limpa ao trocar
   * de seção, então sair para a Visão Geral e voltar em Executivo › DRE reabria no drill da
   * última cultura — uma tela que o operador não pediu, por causa de um parâmetro que ninguém
   * apagou. Em estado de React ela morre com a desmontagem, que é exatamente "nada guardado
   * entre entradas".
   * ⚠ O QUE SE PERDE É O LINK DIRETO PARA UM DRILL, e ele nunca funcionou de verdade: sem
   * `section` na URL, abrir `?cultura=amendoim` do zero cai em `home`. Trocar uma persistência
   * que só atrapalhava por um estado honesto é o negócio certo.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const safraId = searchParams.get('safra') ?? '';
  const [cultura, setCultura] = useState('');
  /* ⚠ O SEGMENTO É ESTADO DA TELA, como a cultura: trocar de atividade não é navegação, e
     guardá-lo entre entradas traria de volta o defeito que o PR-08 consertou.
     ⚠ E A TELA ABRE NA PECUÁRIA — DRE-PERIODO-01, decisão do Gabriel, 23/09. Era a Lavoura, que é
     onde a grade nasceu; hoje a pergunta que traz o produtor ao DRE é a do rebanho, e abrir na
     lavoura obrigava um clique antes de toda leitura. */
  const [segmento, setSegmento] = useState<'lavoura' | 'pecuaria' | 'consolidado'>('pecuaria');
  /* ⚠ A ABA É ESTADO DE TELA, não de URL: ela não muda o QUE se vê (a safra e a cultura mudam),
     só o ângulo. Pôr mais um parâmetro na barra por causa dela seria ruído no link que o
     operador copia. Volta a 'resultado' ao trocar de cultura — ver o efeito abaixo.
     ⚠ SUBIU PARA CÁ no 03b-fix3: `trocarSegmento` precisa zerá-la, e ela era declarada 280 linhas
     abaixo. Só a ordem mudou. */
  const [aba, setAbaDrill] = useState<'resultado' | 'producao' | 'historico'>('resultado');
  /* ⚠ O PERÍODO DA PECUÁRIA É O DA CASA (`f_de`/`f_ate`), o mesmo do Financeiro — não um
     seletor novo. Ele mora na URL porque é filtro de período, e é assim que o resto do
     sistema o trata. Abre no mês corrente. */
  /* ⚠ ABRE NA SAFRA CORRENTE DA PECUÁRIA (§1), não no mês: a pergunta do DRE é o ciclo, e um mês
     solto mostra uma fatia que nunca fecha com o fechamento de rebanho. `safraCorrentePecuaria`
     deriva jul→jun do calendário porque o `usePeriodoUrl` exige um padrão no primeiro render,
     antes de o cadastro de safras chegar. */
  const [periodo, setPeriodo] = usePeriodoUrl(safraCorrentePecuaria());

  /* ⚠ `replace: true` SEMPRE: trocar de safra ou abrir o drill não é navegação, é filtro. Com
     `push` o botão Voltar do navegador percorreria cada clique de seletor antes de sair da
     tela — o defeito clássico de filtro em query string. */
  const mexerNaUrl = useCallback((mudar: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams);
    mudar(p);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const setSafraId = useCallback((id: string) => {
    mexerNaUrl(p => { p.set('safra', id); });
  }, [mexerNaUrl]);
  const abrirCultura = useCallback((c: string) => { setCultura(c); }, []);
  const voltarParaRaiz = useCallback(() => { setCultura(''); }, []);
  /**
   * TROCAR DE ATIVIDADE FECHA O DRILL — 03b-fix3/adendo item 3.
   *
   * ⚠ ELE SOBREVIVIA À TROCA, e o estrago era visível: Lavoura > Amendoim > Histórico > Pecuária
   * deixava o histórico da cultura NA TELA, acima da tabela da pecuária. A causa é que `cultura` e
   * `aba` são estado da tela e ninguém os zerava — `setSegmento` mexia só no segmento.
   * ⚠ ZERAR NÃO BASTA, e por isso o render também é guardado (ver `painelDoDrill`): estado limpo
   * conserta o caminho conhecido; o guard conserta qualquer caminho que apareça depois.
   * ⚠ E A LAVOURA VOLTA NA RAIZ, que é o padrão de entrada do PERIODO-01: quem troca de atividade
   * está trocando de pergunta, não guardando o lugar.
   */
  const trocarSegmento = useCallback((s: 'lavoura' | 'pecuaria' | 'consolidado') => {
    setSegmento(s);
    setCultura('');
    setAbaDrill('resultado');
  }, []);

  useEffect(() => { setAbaDrill('resultado'); }, [cultura]);

  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId, setSafraId]);

  const { dre, carregando, erro, recarregar: recarregarDre } = useDreLavoura(clienteId, safraId || null);
  /* ⚠ SÓ CONSULTA QUANDO A PECUÁRIA ESTÁ ABERTA: o `enabled` do hook mantém a lavoura numa
     chamada só, e é o segmento que liga a segunda. */
  const ehPec = segmento === 'pecuaria';
  /* ⚠ O DRILL É DA LAVOURA, e a pergunta é essa — não "não é pecuária". Hoje `consolidado` está
     desabilitado e os dois dariam o mesmo; o dia em que ele existir, `!ehPec` deixaria o drill de
     uma cultura aparecer numa tela consolidada. */
  const ehLavoura = segmento === 'lavoura';
  const {
    dre: drePec, carregando: carregandoPec, erro: erroPec, recarregar: recarregarPec,
  } = useDrePecuaria(
    ehPec ? clienteId : null, ehPec ? anoMes(periodo.de) : null, ehPec ? anoMes(periodo.ate) : null);

  /* ════════ OS TRÊS DESTINOS DE UM CLIQUE NA GRADE DA PECUÁRIA (§5 e §6) ════════ */
  /** O recorte da célula clicada. `null` = nenhuma lista aberta. */
  const [recortePec, setRecortePec] = useState<RecortePec | null>(null);
  const [didatico, setDidatico] = useState<
    { fazendaId: string | null; nome: string; qual: 'vpb' | 'efeito' } | null>(null);
  const [rateioPecAberto, setRateioPecAberto] = useState(false);
  const [historicoPec, setHistoricoPec] = useState<RecorteHistoricoPec | null>(null);
  /**
   * ONDE A PECUÁRIA ABRE — a última safra com movimento e com fechamento no fim.
   *
   * ⚠ SÓ QUANDO A URL NÃO DIZ NADA. Se `f_de`/`f_ate` vieram no endereço, eles mandam: o link que
   * o operador copiou tem de reabrir exatamente onde estava, e sobrescrevê-lo aqui faria a tela
   * "pular" de período um instante depois de carregar.
   * ⚠ E UMA VEZ SÓ, pelo `aplicada`: sem a trava, trocar o período à mão seria desfeito no render
   * seguinte — o efeito veria a URL diferente do alvo e a puxaria de volta.
   */
  const aberturaPec = useSafraDeAbertura(ehPec ? clienteId : null);
  const [aberturaAplicada, setAberturaAplicada] = useState(false);

  /**
   * O DRE NÃO HERDA O RECORTE DE OUTRA VISITA — DRE-PERIODO-01.
   *
   * ⚠ O ESTADO MORA NA URL, e era isso que o fazia sobreviver ao que não devia: sair para o
   * Financeiro e voltar, ou trocar de cliente, mantinha `f_de`/`f_ate` do que se estava vendo
   * antes — a tela reabria no período de OUTRO cliente, sem erro nenhum, só com números menores.
   * ⚠ A LIMPEZA É NA SAÍDA, NÃO NA ENTRADA, e a diferença é o link colado: no momento em que a
   * tela monta, um `f_de` vindo de um link e um `f_de` esquecido pela visita anterior são
   * indistinguíveis. Limpando ao sair, a visita seguinte encontra o endereço limpo e aplica o
   * padrão, enquanto o link continua valendo — quem o cola monta com o parâmetro na mão.
   * ⚠ O `safra` DA LAVOURA NÃO ENTRA: ele é o seletor próprio dela, que o briefing manda não
   * tocar, e o drill por URL depende dele.
   */
  const limparFiltrosDoDre = useCallback(() => {
    setSearchParams(atual => {
      const p = new URLSearchParams(atual);
      ['f_de', 'f_ate', 'f_visao', 'f_anos'].forEach(k => p.delete(k));
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  /* ⚠ A LIMPEZA É NA SAÍDA DE VERDADE, e a dependência tem de ser VAZIA — medido na tela: com
     `[limparFiltrosDoDre]` o efeito se refazia toda vez que o `setSearchParams` do react-router
     trocava de identidade (o que acontece a cada mudança de endereço), e a função de limpeza
     rodava ali mesmo. Escolher um ano gravava `f_de`/`f_ate` e o próprio efeito os apagava no
     render seguinte: o botão "Ano" não fazia nada. A `ref` mantém a versão fresca da limpeza sem
     dar ao efeito um motivo para renascer. */
  const limparRef = useRef(limparFiltrosDoDre);
  limparRef.current = limparFiltrosDoDre;
  useEffect(() => () => { limparRef.current(); }, []);

  /* ⚠ TROCAR DE CLIENTE É COMEÇAR DE NOVO: a atividade volta à Pecuária, o recorte sai da URL e a
     abertura se rearma para achar a safra DAQUELE cliente. O primeiro render não conta — é ele que
     honra o link colado. */
  const clienteAnterior = useRef(clienteId);
  useEffect(() => {
    if (clienteAnterior.current === clienteId) return;
    clienteAnterior.current = clienteId;
    setSegmento('pecuaria');
    setAberturaAplicada(false);
    limparFiltrosDoDre();
  }, [clienteId, limparFiltrosDoDre]);
  useEffect(() => {
    if (!ehPec || aberturaAplicada || !aberturaPec) return;
    setAberturaAplicada(true);
    if (searchParams.get('f_de') || searchParams.get('f_ate')) return;
    setPeriodo(aberturaPec.periodo);
  }, [ehPec, aberturaAplicada, aberturaPec, searchParams, setPeriodo]);

  const pecDe = ehPec ? anoMes(periodo.de) : null;
  const pecAte = ehPec ? anoMes(periodo.ate) : null;
  const {
    lancamentos: lancPec, carregando: carregandoLancPec, recarregar: recarregarLancPec,
  } = useDrePecuariaLancamentos(clienteId, recortePec, pecDe, pecAte);
  const { patrimonio: patPec, carregando: carregandoPatPec } = useDrePecuariaPatrimonio(
    clienteId, didatico?.fazendaId ?? null, pecDe, pecAte, !!didatico);

  /* ════════ AS QUATRO VISÕES DA PECUÁRIA — DRE-PEC-TELA-02 ════════ */
  /* ⚠ NA URL, COMO O PERÍODO: F5 e link copiado reabrem a mesma visão. `useFiltroUrl` não grava o
     padrão ("global", 3 anos), então endereço limpo continua sendo "tela padrão". */
  const [visaoPec, setVisaoPec] = useFiltroUrl<VisaoPec>('f_visao', 'global', lerVisaoPec, escreverVisaoPec);
  const [nAnosPec, setNAnosPec] = useFiltroUrl<number>('f_anos', N_ANOS_PADRAO, lerNAnosPec, escreverNAnosPec);
  /* ⚠ A META E O ANO ANTERIOR SÃO BUSCADOS SEMPRE (decisão 2): os cards "× Meta" e "× Anos" mostram
     o delta em qualquer visão. São leituras em cache do react-query — trocar de visão não refaz. */
  const { dre: drePecMeta, carregando: carregandoPecMeta } = useDrePecuaria(
    ehPec ? clienteId : null, pecDe, pecAte, 'meta');
  /* ⚠ A LISTA VARIA, O HOOK NÃO: fora da visão x Anos só o ano−1 (o do card); nela, 1..N. */
  const periodosAnosPec = useMemo((): PeriodoPec[] => {
    if (!pecDe || !pecAte) return [];
    const n = visaoPec === 'anos' ? nAnosPec : 1;
    return Array.from({ length: n }, (_, i): PeriodoPec => ({
      de: anoMesAntes(pecDe, i + 1), ate: anoMesAntes(pecAte, i + 1), cenario: 'realizado',
    }));
  }, [pecDe, pecAte, visaoPec, nAnosPec]);
  const anosPec = useDrePecuariaLista(ehPec ? clienteId : null, periodosAnosPec);
  /**
   * OS CINCO ANOS DO HISTÓRICO — DRE-HISTORICO-LINHA-01a.
   *
   * ⚠ É A MESMA LEITURA, NÃO UMA SEGUNDA: `useDrePecuariaLista` monta a chave
   * `['dre-pecuaria', cliente, de, ate, cenario]`, a mesma da grade. Os anos que a visão x Anos já
   * trouxe saem do cache; com o padrão de 3 anos, abrir o modal custa DUAS requisições.
   * ⚠ E A LISTA SÓ EXISTE COM O MODAL ABERTO: fora dele são zero períodos e zero requisições —
   * quem nunca clicar no ícone não paga nada por ele.
   */
  const periodosHistoricoPec = useMemo((): PeriodoPec[] => {
    if (!historicoPec || !pecDe || !pecAte) return [];
    return Array.from({ length: 5 }, (_, i): PeriodoPec => ({
      de: anoMesAntes(pecDe, i + 1), ate: anoMesAntes(pecAte, i + 1), cenario: 'realizado',
    }));
  }, [historicoPec, pecDe, pecAte]);
  const anosHistoricoPec = useDrePecuariaLista(
    historicoPec ? clienteId : null, periodosHistoricoPec);
  const [modoPec, setModoPec] = useState<ModoDre>('resumido');
  /**
   * OS CHIPS DE Δ E A REFERÊNCIA — DRE-CASCATA-03b/adendo.
   *
   * ⚠ ABREM DESLIGADOS: a tela responde primeiro "como fechou o período"; a comparação é o passo
   * seguinte, e ela custa duas colunas de largura.
   * ⚠ EXCETO PELO LINK ANTIGO: `f_visao=meta` apontava para um card que não existe mais, e quem o
   * colou queria a comparação com a meta — então ele abre no Global com o Δ meta ligado.
   */
  const [deltasPec, setDeltasPec] = useState<readonly ('rs' | 'pct')[]>(
    () => (ehVisaoMetaLegada(searchParams.get('f_visao')) ? ['rs', 'pct'] : []));
  const [refDeltaPec, setRefDeltaPec] = useState<'meta' | 'ano'>('meta');
  /* ⚠ O Δ DO x ANOS TEM ESTADO PRÓPRIO — fix3, e nasce DESLIGADO: ver `deltasDaVisao`. Ele governa
     as colunas de Δ que cada ano ganha contra o período da tela, que é outra pergunta que a do
     Global (realizado x meta). */
  const [deltasAnos, setDeltasAnos] = useState<readonly ('rs' | 'pct')[]>([]);
  const colunasPec = useMemo(() => (drePec && pecDe && pecAte
    ? colunasDaVisao({
      visao: visaoPec, de: pecDe, ate: pecAte, real: drePec,
      meta: drePecMeta, carregandoMeta: carregandoPecMeta,
      anos: anosPec.map(a => ({ de: a.periodo.de, ate: a.periodo.ate, dre: a.dre, carregando: a.carregando })),
      deltas: deltasDaVisao(visaoPec, deltasPec, deltasAnos), refDelta: refDeltaPec,
    })
    : []), [drePec, pecDe, pecAte, visaoPec, drePecMeta, carregandoPecMeta, anosPec, deltasPec, deltasAnos, refDeltaPec]);
  /* ⚠ O MODAL DE LANÇAMENTOS DIZ DE QUE COLUNA VEIO: a lista da coluna de 2024 não pode aparecer
     sob o rótulo do período da tela, nem a de meta sob o do realizado. */
  const rotuloRecortePec = useMemo(() => {
    const ponto = (am: string) => ({ ano: Number(am.slice(0, 4)), mes: Number(am.slice(5, 7)) });
    const base = recortePec?.de && recortePec?.ate
      ? descreverPeriodo({ de: ponto(recortePec.de), ate: ponto(recortePec.ate) })
      : descreverPeriodo(periodo);
    return recortePec?.cenario === 'meta' ? `${base} · meta` : base;
  }, [recortePec, periodo]);

  /* ⚠ TRÊS CONTROLES DE APRESENTAÇÃO, e nenhum deles refaz consulta: o payload já traz `direto`,
     `rateado` e `valor` em cada linha. Trocar de modo é escolher qual ler. */
  const [rateioDentro, setRateioDentro] = useState(false);
  /* ⚠ AS UNIDADES SÃO ESCOLHA MÚLTIPLA — DRE-UNIDADES-01, e cada aba tem a sua lista: a lavoura
     fecha em saca ou tonelada, a pecuária em cabeça e arroba. As duas abrem com R$ e R$/ha. */
  const [unidadesLav, setUnidadesLav] = useState<readonly UnidadeLav[]>(['rs', 'ha']);
  const [unidadesPec, setUnidadesPec] = useState<readonly UnidadePec[]>(['rs', 'ha']);
  const [ampliado, setAmpliado] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  /**
   * O DRE ABRE FECHADO E RESUMIDO — DRE-CASCATA-03b.
   *
   * ⚠ FECHADO JÁ ERA O COMPORTAMENTO (as duas grades nascem com `{}`); o que faltava era o
   * controle para abrir tudo de uma vez, e ele mora aqui porque a linha dos chips é da página.
   * ⚠ E A EXPANSÃO DA PECUÁRIA SUBIU PARA CÁ pelo mesmo motivo: o botão precisa de algo para
   * alternar. A da lavoura já morava aqui (`abertos`).
   */

  const [abertosPec, setAbertosPec] = useState<Record<string, boolean>>({});
  /* ⚠ OS GRUPOS QUE EXISTEM EM CADA ABA, para o "abrir tudo" saber o que abrir. Na pecuária eles
     dependem do modo: o Resumido tem três (custo variável, custo fixo e investimento). */
  const gruposDaAba = useMemo(() => (ehPec
    ? LINHAS_DO_MODO(modoPec).filter(d => d.expande).map(d => d.chave as string)
    : ['custeio', 'pos_colheita', 'fixo', 'investimento']), [ehPec, modoPec]);
  const expandidos = ehPec ? abertosPec : abertos;
  const tudoAberto = gruposDaAba.length > 0 && gruposDaAba.every(g => expandidos[g]);
  const alternarTudo = () => {
    const alvo = !tudoAberto;
    const novo = Object.fromEntries(gruposDaAba.map(g => [g, alvo]));
    if (ehPec) setAbertosPec(novo); else setAbertos(novo);
  };
  /**
   * OS CONTROLES DA GRADE DA PECUÁRIA — DRE-CASCATA-03b-fix2.
   *
   * ⚠ ELES SAÍRAM DA LINHA PRÓPRIA PORQUE ELA NÃO CABIA NA TELA. Medido em 23/09: a régua de
   * controles somava 1068px dentro de um cartão de 887, e o grupo "Comparar" começava em x=1105 —
   * fora da área visível, sem barra de rolagem que o alcançasse. Um controle que o operador não vê
   * não existe. Aqui eles ocupam as três colunas que a faixa de cards já deixava vazias (a
   * pecuária tem 3 cards numa grade de 6), e a linha de 28px deixou de existir na aba.
   * ⚠ O SLOT DA VISÃO É EXCLUSIVO E DE LARGURA FIXA: Global mostra "Comparar", x Anos mostra
   * "anos anteriores", Por fazenda não mostra nada — e os três ocupam os MESMOS 247px, que é a
   * largura do maior. Sem a largura fixa, trocar de visão moveria os chips de unidade e o "abrir
   * tudo", que não têm nada com a visão.
   * ⚠ E A EXCLUSIVIDADE TEM UMA CONSEQUÊNCIA QUE FICA REGISTRADA: os chips de Δ também governam a
   * visão x Anos (lá cada ano ganha uma coluna de Δ contra o período da tela). Ligados no Global e
   * trocando para x Anos, as colunas de Δ aparecem sem que o chip esteja à mão para desligá-las —
   * volta-se ao Global para isso. Foi decisão do briefing ("nunca os dois juntos"), não descuido.
   */
  const controlesPec = (
    <>
      <ChipsUnidade valor={unidadesPec} onEscolher={setUnidadesPec}
        opcoes={UNIDADES_PEC_GRADE.map(u => ({ valor: u, rotulo: ROTULO_UNIDADE[u] }))} />
      <span className="flex w-[247px] shrink-0 items-center justify-end gap-1.5">
        {visaoPec === 'global' && <>
          {/* ⚠ A BARRA VERTICAL MORA DENTRO DO SLOT, não antes dele: o conteúdo é ancorado à
              direita, então ela acompanha o grupo e nada se move quando o slot fica vazio. */}
          <span className="h-[14px] w-px shrink-0 bg-border" aria-hidden />
          <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">Comparar:</span>
          {/* ⚠ O SELETOR SÓ EXISTE COM Δ LIGADO — sem diferença na tela ele não governa nada —, mas
              o LUGAR dele é reservado sempre: senão a palavra "Comparar:" andaria 104px ao ligar o
              primeiro chip. */}
          <span className="flex w-[104px] shrink-0 items-center justify-start">
            {deltasPec.length > 0 && (
              <Select value={refDeltaPec} onValueChange={v => setRefDeltaPec(v as 'meta' | 'ano')}>
                <SelectTrigger className="h-[22px] w-[104px] text-[10px]"
                  title="Compara o realizado com a meta ou com o período anterior">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta" className="text-[12px]">Meta</SelectItem>
                  <SelectItem value="ano" className="text-[12px]">Ano anterior</SelectItem>
                </SelectContent>
              </Select>
            )}
          </span>
          <ChipsUnidade valor={deltasPec} onEscolher={setDeltasPec} permiteVazio
            opcoes={[{ valor: 'rs', rotulo: 'Δ R$' }, { valor: 'pct', rotulo: 'Δ %' }]} />
        </>}
        {visaoPec === 'anos' && <>
          <span className="h-[14px] w-px shrink-0 bg-border" aria-hidden />
          <SeletorAnosPec visao={visaoPec} nAnos={nAnosPec} onNAnos={setNAnosPec} curto />
          {/* ⚠ CHIPS PRÓPRIOS, não os do Global — ver `deltasDaVisao`. Aqui o Δ é "quanto mudou
              daquele ano para cá", e cada ano ganha uma coluna ao lado da sua. */}
          <ChipsUnidade valor={deltasAnos} onEscolher={setDeltasAnos} permiteVazio
            opcoes={[{ valor: 'rs', rotulo: 'Δ R$' }, { valor: 'pct', rotulo: 'Δ %' }]} />
        </>}
      </span>
      {/* ⚠ UM BOTÃO SÓ, QUE DIZ O QUE VAI FAZER — o mesmo da linha de antes, palavra por palavra. */}
      <button type="button" onClick={alternarTudo}
        className="shrink-0 whitespace-nowrap rounded border px-2 text-[10px] text-muted-foreground
          hover:bg-muted hover:text-foreground"
        style={{ height: 22 }}>
        {tudoAberto ? 'fechar tudo' : 'abrir tudo'}
      </button>
    </>
  );


  /* ─────────────────── O MODAL DO PAINEL, REUSADO COMO ESTÁ ───────────────────
   * ⚠ NENHUM MODAL NOVO: o `RateioDetalheModal` do Painel da Safra já responde às três chaves
   * que `fn_painel_rateio_detalhe` conhece — natureza (o centro), investimento e admin. O de
   * três abas que o briefing cogita NÃO EXISTE no repo (o do Painel tem duas: Rateio e
   * Lançamentos), e a FASE 0 manda reportar em vez de construir.
   * ⚠ UMA CONSULTA POR CLIQUE, como no Painel — e a mesma regra de lá: pool zero numa linha
   * que não é admin significa "não há o que repartir", e aí não se abre modal nenhum. Aqui o
   * caminho alternativo (o drawer) é do PR-02, então o clique simplesmente não abre.
   */
  const [rateio, setRateio] = useState<
    { dados: RateioDetalhe; tipo: TipoRateio; titulo: string; pool: boolean } | null>(null);

  /* ⚠ `chave` PODE SER `null` DESDE O PR-07, e é o que abre o POOL: no ramo natureza da
     `fn_painel_rateio_detalhe`, `p_chave` nulo deixou de significar "nenhum centro" e passou a
     significar "todos os centros compartilhados" — os lançamentos sem cultura cujo plano está em
     `bloco_dre in ('custeio','pos_colheita')`. É a RPC que soma; aqui só se pede. */
  const abrir = (tipo: TipoRateio, chave: string | null, rotulo: string, cultura: string) => {
    if (!clienteId || !safraId) return;
    void (async () => {
      const { data } = await (supabase as any).rpc('fn_painel_rateio_detalhe', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_tipo: tipo, p_chave: chave,
      });
      const d = data as RateioDetalhe | null;
      /* ⚠ O GUARD DE `pool > 0` SAIU (§10), e ele era o defeito. A regra vinha copiada do Painel
         da Safra, onde fazia sentido: lá, pool zero caía no drawer de lançamentos daquele
         centro, então havia PARA ONDE ir. Aqui não havia alternativa nenhuma — o clique em
         Operações, Logística ou em qualquer centro de uma safra de cultura única simplesmente
         não fazia nada, e nada é o pior resultado possível: o operador não sabe se a tela quebrou
         ou se ele errou o alvo.
         ⚠ AGORA QUEM DECIDE É O MODAL, não este guard: ele abre sempre que a RPC responde, e as
         abas de rateio só aparecem quando há rateio para explicar. Um componente, duas formas. */
      if (!d) return;
      const s = safras.find(x => x.id === safraId);
      setRateio({
        dados: d, tipo, pool: chave === null,
        titulo: `${rotulo} · ${labelDaCultura(cultura)}`
          + (s ? ` · Safra ${s.codigo || s.nome}` : ''),
      });
    })();
  };

  /* ⚠ `Esc` SAI DO AMPLIAR — o botão flutuante é o caminho do mouse, e quem ampliou com o teclado
     espera sair por ele. Sem isto o operador fica preso numa tela sem cabeçalho. */
  useEffect(() => {
    if (!ampliado) return;
    const sai = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false); };
    window.addEventListener('keydown', sai);
    return () => window.removeEventListener('keydown', sai);
  }, [ampliado]);

  /* ───────────────────── O QUE SÓ O DRILL CONSOME ─────────────────────
   * ⚠ TUDO DESLIGADO NA RAIZ, e é o que mantém a grade barata: as quatro consultas abaixo só
   * ganham `enabled` quando há cultura. Na raiz nenhuma delas sai — é uma chamada só,
   * `fn_dre_lavoura`, como no PR-01.
   */
  const culturaOuNulo = cultura || null;
  /* ⚠ A CULTURA MORA NO DRILL, não em `cultura` da URL: na raiz a URL não tem cultura nenhuma e
     cada coluna abre a sua. Guardá-la aqui é o que faz o mesmo drawer servir às duas telas. */
  const [drill, setDrill] = useState<
    { chave: string; rotulo: string; cultura: string } | null>(null);
  const { fazendas } = useFazenda();
  const { talhoes } = useTalhoesDaSafra(clienteId, culturaOuNulo ? (safraId || null) : null);
  const talhoesDaCultura = useMemo(
    () => talhoes.filter(t => t.cultura === cultura), [talhoes, cultura]);
  /* ⚠ A PRIMEIRA COLHEITA VEM DAS CARGAS, não de `agri_safra_area.data_colheita_real`: medido no
     NJ 25/26, a coluna está NULA nos 5 talhões, enquanto `agri_colheita` tem 40 cargas entre
     07/03 e 11/04/2026. Ler a coluna daria "—" numa safra inteiramente colhida. */
  const { linhas: cargas } = useColheita(useMemo(
    () => talhoesDaCultura.map(t => t.id), [talhoesDaCultura]));
  const fin = useFinanceiroV2();
  const { painel, recarregar: recarregarPainel } = usePainelSafra(clienteId, safraId || null, culturaOuNulo);
  const { safras: comparadas, recarregar: recarregarComparativo } = useComparativoSafras(clienteId, culturaOuNulo);
  const { safras: historico, carregando: carregandoHist } = useDreLavouraHistorico(clienteId, culturaOuNulo);
  /* ⚠ O MAPA DE FORNECEDORES VEM DAQUI, não de `fin.fornecedores`: `paraItemDrillDaSafra` quer
     um `Map<id, nome>`, e é este hook que o monta — a lista do `useFinanceiroV2` é outra forma
     do mesmo dado e não encaixa. Mesma escolha do Painel (`PainelSafraTab:254`). */
  /* ⚠ ELE CARREGA NO DRILL **E** QUANDO UM DRAWER ABRE NA RAIZ — a lista de lançamentos serve às
     duas telas desde o PR-03. Continua desligado na raiz em repouso: é o `enabled` do hook que
     mantém a grade em uma consulta só, e o `drillAberto` que o liga sob demanda. */
  const drillAberto = !!drill;
  const { lancamentos, fornecedores, carregando: carregandoLanc,
    recarregar: recarregarLancamentos } = useLancamentosDaSafra(
    clienteId, (culturaOuNulo || drillAberto) ? (safraId || null) : null);

  /* ⚠ OS TOTAIS DOS TALHÕES, COPIADOS DE `PainelSafraTab:349-361`: eles somam o que a tabela
     mostra, e é isso que faz o rodapé fechar com as linhas acima dele. */
  const totaisTalhoes = useMemo(() => {
    const ts = painel?.talhoes ?? [];
    const area = ts.reduce((a, t) => a + t.area_ha, 0);
    const sacas = ts.reduce((a, t) => a + t.sacas, 0);
    const boas = ts.reduce((a, t) => a + t.sacas_boas, 0);
    const roca = ts.reduce((a, t) => a + t.roca_sacas, 0);
    const acima = ts.reduce((a, t) => a + (t.sacas_boas * t.pct_afla20) / 100, 0);
    return {
      area, sacas, boas, roca,
      /* ⚠ `acima` JÁ ERA CALCULADO E DESCARTADO: a linha de cima o usava só para derivar o
         percentual. Ele é a soma, carga a carga, do grão bom que passou de 20 ppb — e é o que
         o cartão de qualidade mostra como classe própria. Expor o que já existe é melhor que
         reconstruí-lo a partir do percentual. */
      acima,
      sacasHa: area > 0 ? sacas / area : 0,
      pctAfla: boas > 0 ? (acima / boas) * 100 : 0,
    };
  }, [painel?.talhoes]);

  /* ───────────────── O DRAWER DE LANÇAMENTOS, O MESMO DO PAINEL ─────────────────
   * ⚠ RECEITA, DEDUÇÕES E JUROS PELO MESMO RAMO `grupo`, e as chaves são as do plano de contas
   * — as MESMAS do `CASE` da migration `plano_bloco_dre`. Medido no NJ 25/26 amendoim:
   * 'Receita Agrícola' soma 2.925.162,25 (= receita_bruta), 'Deduções Agricultura' 33.905,13
   * (e 2.925.162,25 − 33.905,13 = 2.891.257,12 = receita_liquida) e o grupo dos juros
   * 143.707,14. Nenhuma maquinaria nova: o Painel já abria os juros exatamente assim.
   */
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);

  const itensDoDrill: ItemDrill[] = useMemo(() => {
    if (!drill) return [];
    /* ⚠ A MESMA REGRA DE CULTURA DO PAINEL: o lançamento da cultura E o sem cultura, que é o
       pool compartilhado. Copiada de `PainelSafraTab:262`, não reinventada. */
    const daCultura = (l: LancamentoDaSafra) => (l.cultura ?? '') === drill.cultura || (l.cultura ?? '') === '';
    return lancamentos
      .filter(l => daCultura(l) && (l.grupo_custo ?? '') === drill.chave)
      .map(l => paraItemDrillDaSafra(l, fornecedores));
  }, [drill, lancamentos, fornecedores]);
  const totalDoDrill = useMemo(
    () => itensDoDrill.reduce((acc, it) => acc + Math.abs(it.mov), 0), [itensDoDrill]);

  /**
   * OS QUATRO CATÁLOGOS DO `LancamentoV2Dialog` — e é a ausência deles que era o defeito.
   *
   * ⚠ ELES NÃO SE CARREGAM SOZINHOS. `useFinanceiroV2` nasce com `contasBancarias`,
   * `fornecedores`, `classificacoes` e `safras` VAZIOS e só os preenche quando alguém chama os
   * `load*`. Lista vazia é lista válida: nenhum tipo acusa, o build passa, e o modal abre com
   * "Selecione fornecedor…", Conta Origem em branco e "Nenhuma safra de Lavoura cadastrada" —
   * num lançamento que tem os três. Salvar dali grava nulo por cima do que existia.
   * ⚠ O EFEITO EXISTIA NO `PainelSafraTab` (linhas 376-380) e eu não o trouxe junto quando movi
   * o drill para cá, no PR-02. O que veio foi a montagem do diálogo e o `abrirLancamento`; o que
   * ficou para trás foi o que os alimenta. É a terceira tela a pagar esta mesma lição — o
   * `AgriBarterTab` e o `AgriDreCulturaTab` a registraram antes de mim, com estas palavras.
   */
  useEffect(() => {
    void fin.loadContas();
    void fin.loadClassificacoes();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  /**
   * Os catálogos prontos — sem eles o formulário mente sobre o que o lançamento tem.
   *
   * ⚠ OS QUATRO, `classificacoes` INCLUSA: ela alimenta o seletor de plano de contas, e vazia
   * produz exatamente o mesmo estrago dos outros três — campo em branco sobre dado preenchido.
   */
  const catalogosProntos = fin.contasBancarias.length > 0 && fin.fornecedores.length > 0
    && fin.safras.length > 0 && fin.classificacoes.length > 0;

  /* ⚠ O LOADER É O DO FINANCEIRO, não um `select` próprio: `buscarLancamentoPorId` faz
     exatamente a mesma consulta que eu vinha repetindo aqui, e ter as duas é ter duas donas do
     mesmo `select` — a primeira coluna que uma ganhar, a outra não ganha. */
  const abrirLancamento = async (id: string) => {
    const linha = await fin.buscarLancamentoPorId(id);
    if (linha) setEditando(linha);
  };

  const culturas = dre?.culturas ?? [];
  /** A cultura aberta, do payload do DRE — é dela que a faixa e a grade do drill vivem. */
  const culturaAberta = cultura ? culturas.find(c => c.cultura === cultura) ?? null : null;
  const safraAtual = safras.find(x => x.id === safraId) ?? null;

  /* ⚠ ELE VEM DEPOIS DE `culturaAberta`, E ISSO É ORDEM, NÃO LÓGICA: o array de dependências de
     um `useMemo` é avaliado NA HORA, então `culturaAberta` citada ali acima da própria
     declaração estoura em TDZ e derruba a tela inteira. É o caso que o `check:tdz` existe para
     pegar, e o conserto é mover a declaração — nunca mudar a conta. */
  /**
   * A LINHA DE CONTEXTO DO DRILL — seis fatos, e cada ausência vira "—".
   *
   * ⚠ ELA NÃO INVENTA NENHUM: fazendas e talhões saem de `useTalhoesDaSafra`, o plantio da
   * coluna `data_plantio` (que este PR acrescentou ao `select`), a colheita do MÊS da primeira
   * carga em `agri_colheita`, e o percentual do `pct_direto` da própria cultura no payload.
   * ⚠ E O `pct_direto` AQUI É O DA CULTURA (70 no amendoim), não o do total (66). São dois
   * números certos em dois lugares, e o que a régua do drill descreve é a cultura aberta.
   */
  const contexto = useMemo(() => {
    if (!culturaAberta) return '';
    const nomes = (lista: (string | null)[]) =>
      Array.from(new Set(lista.filter((x): x is string => !!x))).join(' · ');
    const faz = nomes(talhoesDaCultura.map(t => t.fazendaNome)) || '—';
    const tal = nomes(talhoesDaCultura.map(t => t.pastoNome)) || '—';
    const plantios = talhoesDaCultura.map(t => t.data_plantio).filter((d): d is string => !!d).sort();
    const colheitas = cargas.map(c => c.data_colheita).filter(Boolean).sort();
    return `${labelDaCultura(cultura)} · ${faz} · ${tal}`
      + ` · plantio ${plantios[0] ? dataCurta(plantios[0]) : '—'}`
      + ` · colheita ${colheitas[0] ? mesCurto(colheitas[0]) : '—'}`
      + ` · custos ${formatNum(culturaAberta.pct_direto, 0)} % apropriados direto`;
  }, [culturaAberta, talhoesDaCultura, cargas, cultura]);

  const poolTotal = useMemo(
    () => Object.values(dre?.pool_compartilhado ?? {}).reduce((a, b) => a + b, 0),
    [dre]);

  const centrosDoBloco = (b: Bloco) => (dre?.centros ?? []).filter(c => c.bloco === b);

  /**
   * O valor de uma linha de grupo — e ele NÃO é o mesmo para os quatro blocos.
   *
   * ⚠ CUSTEIO E PÓS-COLHEITA MOSTRAM `direto` NO MODO "Custos diretos", porque o rateio deles
   * tem LINHA PRÓPRIA logo abaixo (a `rateio_compartilhado`), e a coluna soma
   * `custeio + pós + rateio = custo variável`. Mostrar `.valor` neles faria a soma contar o
   * rateio duas vezes.
   * ⚠ CUSTO FIXO E INVESTIMENTO MOSTRAM `valor` NOS DOIS MODOS (§2), porque não há linha própria
   * para o rateio deles em lugar nenhum da cascata. Com `.direto` o Custo fixo do NJ aparecia
   * como 0,00 — e aí `margem − 0 − rateio_admin` não dava o Resultado operacional que a linha
   * de baixo mostrava. O total mudava de valor ao trocar um modo de APRESENTAÇÃO, que é o que o
   * A23 proíbe, e a coluna deixava de fechar.
   */
  const valorDaLinha = (l: DreValor, def: DefLinha): number | null => {
    if (!def.bloco) return l.valor;
    if (rateioDentro) return l.valor;
    if (BLOCOS_SEM_LINHA_PROPRIA.includes(def.bloco)) return l.valor;
    return l.direto ?? l.valor;
  };

  const colsPorCultura = unidadesLav.length;

  /* ⚠ O DRILL É DA LAVOURA, E O RENDER TAMBÉM PERGUNTA ISSO — ver `painelDoDrill`. */
  const painelDrill = painelDoDrill(segmento, cultura, aba, ampliado);
  /** O que aparece no cartão: a grade só some quando o drill está em Produção ou Histórico. */
  const mostraGrade = !culturaAberta || aba === 'resultado' || ampliado;
  /** Os cartões são do drill, da aba Resultado, e somem no Ampliar. */
  const mostraCartoes = !!culturaAberta && aba === 'resultado' && !ampliado;

  /** O contexto da régua — um por tela, e a régua não sabe qual delas está aberta. */
  const contextoDaTela = ehPec
    ? `${clienteAtual?.nome ?? '—'} · ${descreverPeriodo(periodo)} · por fazenda`
    : culturaAberta ? contexto
      : `${clienteAtual?.nome ?? '—'} · por safra · custo operacional efetivo`;

  /* ─────────────── A ALTURA DO CARTÃO É MEDIDA, NÃO ESTIMADA ───────────────
   * ⚠ ERA `calc(100vh - 212px)`, UM NÚMERO ESCRITO À MÃO, e ele errava por construção: a régua,
   * a faixa, as abas e a linha de toggles aparecem e somem conforme a tela e a aba, então
   * qualquer constante está certa para UMA combinação e sobra ou falta em todas as outras. Era
   * por isso que a tabela não ia até a borda de baixo.
   * ⚠ MEDIR O TOPO REAL resolve as quatro combinações de uma vez: `viewport − topo − 8`. E o
   * `useLayoutEffect` (não `useEffect`) é o que impede o quadro piscado com a altura velha.
   */
  const raiz = useRef<HTMLDivElement | null>(null);
  const cartao = useRef<HTMLDivElement | null>(null);
  const [alturaCartao, setAlturaCartao] = useState<number | null>(null);
  /**
   * ⚠ A LARGURA DO CONTÊINER, NÃO A DA JANELA — e é por isso que não há `lg:` nem `xl:` aqui. O
   * que decide se os cartões cabem ao lado da grade é o espaço que SOBRA depois da barra
   * lateral, e nenhum breakpoint de viewport sabe quanto ela ocupa. Medido no harness: as duas
   * colunas cabem até 830px de conteúdo (450 + 380 + 12 de gap = 842 com a margem), e nada
   * quebra linha nem é cortado. Abaixo disso os cartões descem para baixo da tabela.
   */
  const [larguraRaiz, setLarguraRaiz] = useState(0);
  /* ⚠ ELE VEM DEPOIS DE `larguraRaiz`, E ISSO É ORDEM, NÃO LÓGICA — o mesmo caso do `contexto`:
     `const` de bloco lida acima da própria declaração é TDZ, e o TSC pegou (TS2448).
     ⚠ `- 32` É O `px-4` DOS DOIS LADOS: a raiz medida inclui o próprio padding, e a largura útil
     é a que sobra dele. Sem descontar, a decisão erraria por 32px justamente no limiar. */
  const duasColunas = larguraRaiz - 32 >= W_MIN_GRADE + W_MIN_CARTOES + 12;
  useLayoutEffect(() => {
    const medir = () => {
      const el = cartao.current;
      if (el) {
        const topo = el.getBoundingClientRect().top;
        setAlturaCartao(Math.max(120, Math.round(window.innerHeight - topo - 8)));
      } else {
        setAlturaCartao(null);
      }
      if (raiz.current) setLarguraRaiz(raiz.current.getBoundingClientRect().width);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [ampliado, culturaAberta, aba, unidadesLav, unidadesPec, rateioDentro, dre]);


  if (!ehPec && !dre && !carregando && !erro) return null;

  return (
    <div ref={raiz}
      className={cn('w-full animate-fade-in',
        /* ⚠ 16px DE PADDING LATERAL, e a faixa respeita por ser filha normal: a última caixa
           termina onde o conteúdo termina, sem margem negativa nem overflow. */
        ampliado ? 'fixed inset-0 z-50 flex flex-col gap-1 overflow-hidden bg-background p-1'
          : 'space-y-2 px-4 py-3')}>

      {ampliado ? (
        /* ⚠ BARRA DE VERDADE, NÃO BOTÃO FLUTUANTE. Flutuando, ele pousava por cima da primeira
           linha do cabeçalho — justamente a régua que o Ampliar existe para deixar ler. Aqui ele
           ocupa 24px próprios e o cartão começa embaixo. */
        <div className="flex h-[24px] shrink-0 items-center justify-between gap-2">
          {/* ⚠ O CONTEXTO NA BARRA (§6): ampliado esconde a régua inteira, e sem ele o operador
              olha uma grade de números sem saber de que safra — ou de que cultura, no drill. */}
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {ehPec ? `Pecuária · ${descreverPeriodo(periodo)}`
              : culturaAberta ? labelDaCultura(cultura) : 'Lavoura'}
            {!ehPec && safraAtual ? ` · Safra ${safraAtual.codigo || safraAtual.nome}` : ''}
          </span>
          <button type="button" onClick={() => setAmpliado(false)} title="Reduzir (Esc)"
            className="inline-flex h-[22px] items-center gap-1 rounded-md border bg-card px-2 text-[10px] hover:bg-muted">
            <Minimize2 className="h-3 w-3" /> Reduzir
          </button>
        </div>
      ) : (
        <>
          {/* ⚠ A RÉGUA É UMA LINHA DE 30px, E É A MESMA NAS DUAS TELAS. O contexto encolhe
              (`min-w-0` + `truncate`) e os slots não (`shrink-0` + `nowrap`): sem esses dois
              lados a linha quebrava e os seletores desciam, empurrando a faixa e a tabela para
              baixo só no drill — que é exatamente o que o A23 proíbe.
              ⚠ O `PageHeader` SAIU DESTA TELA: ele põe o contexto ABAIXO do título, em duas
              linhas, e aqui as duas alturas têm de fechar em 30px com a faixa no mesmo y. */}
          <div className="flex h-[30px] items-center gap-2">
            {ehLavoura && culturaAberta && (
              <button type="button" onClick={voltarParaRaiz} title="Voltar para todas as culturas"
                className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md border hover:bg-muted">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <h2 className="shrink-0 text-[15px] font-medium leading-none">DRE</h2>
            {/* ⚠ O TEXTO INTEIRO NO `title`: truncar pela direita esconde o fim da frase, e no
                drill o fim é justamente o percentual de custo direto. */}
            <p className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted-foreground"
              title={contextoDaTela}>
              {contextoDaTela}
            </p>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              {/* ⚠ PECUÁRIA E CONSOLIDADO NASCEM DESLIGADOS E VISÍVEIS: eles dizem para onde a
                  tela vai, e escondê-los faria a Lavoura parecer a única resposta possível. */}
              {/* ⚠ O PARÂMETRO DE TIPO EXPLÍCITO porque as outras duas opções ainda não existem
                  como estado: sem ele o `T` sairia de `valor="lavoura"` e as opções desligadas
                  seriam erro de compilação — o que é o comportamento certo do componente. */}
              <Segmentado altura={22} valor={segmento} onEscolher={trocarSegmento}
                opcoes={[
                  { valor: 'lavoura', rotulo: 'Lavoura' },
                  { valor: 'pecuaria', rotulo: 'Pecuária' },
                  { valor: 'consolidado', rotulo: 'Consolidado', desabilitada: true, title: 'em breve' },
                ]} />
              {/* ⚠ O MODO MORA NO CABEÇALHO — 03b-fix1, e é uma questão de alcance: "Resumido" e
                  "Detalhado" não mudam uma coluna nem uma unidade, mudam QUANTAS LINHAS a cascata
                  tem. Na linha de toggles ele se lia como mais um filtro da grade, ao lado do
                  rateio e dos chips de unidade; aqui, junto do período e da atividade, ele fica
                  entre as escolhas que definem O QUE a tela mostra.
                  ⚠ SÓ A PECUÁRIA O TEM (a lavoura não tem cascata resumida), e o slot é reservado
                  do mesmo tamanho nas duas abas pela mesma lei do seletor de período: sem a
                  reserva, o seletor de período e o botão Ampliar andariam ao trocar de aba. */}
              <span className="flex w-[148px] shrink-0 items-center justify-end">
                {ehPec && (
                  <Segmentado altura={22} valor={modoPec} onEscolher={setModoPec}
                    opcoes={[{ valor: 'resumido', rotulo: 'Resumido' }, { valor: 'detalhado', rotulo: 'Detalhado' }]} />
                )}
              </span>
              {/* ⚠ O MESMO SLOT, OUTRA PERGUNTA: a lavoura fecha por SAFRA (o ciclo), a pecuária
                  por PERÍODO DE MESES (o rebanho não tem safra). É o seletor do Financeiro, não
                  um terceiro — "Ano safra" se faz nele pelo Personalizado jul→jun. */}
              {/* ⚠ SLOT DE 250px NAS DUAS ABAS — DRE-PADRAO-01a. Medido em 22/09: o seletor da
                  pecuária ocupa 250 e o da lavoura 130, e a diferença empurrava o seletor de
                  atividade 120px para a esquerda ao trocar de aba — a tela inteira andava. Agora o
                  slot é o mesmo e o conteúdo se alinha à esquerda dentro dele; na lavoura sobram
                  120px de espaço reservado, que é o preço de a régua não se mexer. */}
              <div className="flex w-[250px] shrink-0 items-center justify-start">
                {ehPec ? (
                  <SeletorPeriodoPecuaria clienteId={clienteId}
                    periodo={periodo} onPeriodoChange={setPeriodo} />
                ) : (
                  <Select value={safraId} onValueChange={setSafraId}>
                    <SelectTrigger className="h-[22px] w-[130px] text-[10px]">
                      <SelectValue placeholder="Safra" />
                    </SelectTrigger>
                    <SelectContent>
                      {safras.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-[12px]">
                          {s.codigo || s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <button type="button" onClick={() => setAmpliado(true)}
                title="Ampliar a grade (só a tabela)"
                className="inline-flex h-[22px] items-center gap-1 rounded-md border px-2 text-[10px] hover:bg-muted">
                <Maximize2 className="h-3 w-3" /> Ampliar
              </button>
            </div>
          </div>

          {ehPec ? (drePec ? (
            <FaixaVisoesPec deltas={deltasPec} refDelta={refDeltaPec} visao={visaoPec} onVisao={setVisaoPec} real={drePec}
              meta={drePecMeta} carregandoMeta={carregandoPecMeta}
              anoAnterior={anosPec[0]?.dre ?? null} carregandoAnoAnterior={anosPec[0]?.carregando ?? true}
              nAnos={nAnosPec} onNAnos={setNAnosPec} controles={controlesPec} />
          ) : null)
            : culturaAberta ? <FaixaCultura c={culturaAberta} />
              : <Faixa dre={dre} />}

          {/* ⚠ AS ABAS VÊM ANTES DA LINHA DE TOGGLES, e a ordem não é estética: os toggles são da
              aba Resultado — eles mudam a GRADE. Embaixo das abas eles pertencem visivelmente ao
              conteúdo que comandam; acima, comandariam também Produção e Histórico, onde não
              fazem nada. */}
          {/* ⚠ ABAS E TOGGLES SÃO UM BLOCO SÓ, e isso é o que faz o A23 fechar em 26px exatos. Com
              os dois como itens irmãos do `space-y-2`, a linha de abas custava 26 + 8 de gap e o
              cartão do drill descia 34px em vez de 26 — "nada muda de lugar" viraria "quase
              nada". Juntos, o gap da pilha é pago uma vez pelos dois, e a diferença entre raiz e
              drill passa a ser a altura da barra de abas e nada mais. */}
          <div>
          {ehLavoura && culturaAberta && (
            /* ⚠ A ALTURA É DO CONTÊINER, NÃO DOS BOTÕES, e o 1px da divisória mora DENTRO dela.
               Com `h-[26px]` nos botões e a borda no pai, a barra media 27 — e o cartão do drill
               descia 27 em vez de 26. `box-border` (padrão do Tailwind) faz a borda caber na
               altura declarada; os botões preenchem o que sobra. */
            /* ⚠ O SUBLINHADO SAIU (regra de UI do PR-04): estas abas marcavam a selecionada com
               uma linha embaixo enquanto o seletor de atividade, dez pixels acima, marcava com
               navy. Duas marcações para a mesma pergunta na MESMA régua. */
            <Segmentado valor={aba} onEscolher={setAbaDrill}
              opcoes={[
                { valor: 'resultado', rotulo: 'Resultado' },
                { valor: 'producao', rotulo: 'Produção' },
                { valor: 'historico', rotulo: 'Histórico' },
              ]} />
          )}

          {/* ⚠ ALTURA FIXA DE 28px E `nowrap` (§6): o controle segmentado tem 26 e não cabia nos
              18 de antes — ele vazava para fora da linha e ia parar por trás do cartão. E a
              frase à esquerda muda de tamanho com o toggle: com `flex-wrap` ela quebrava para
              uma segunda linha e empurrava a tabela para baixo, que é o A23 quebrando a cada
              clique. Agora a frase trunca e a altura não se move. */}
          {/* ⚠ A LINHA DE RATEIO EXISTE NAS DUAS ABAS E ESTÁ NO MESMO y — DRE-PADRAO-01a. Ela tinha
              saído da pecuária no DRE-PEC-TELA-02b, e o efeito medido em 22/09 foi a tabela começar
              28px mais alto ali: trocar de aba fazia a grade pular.
              ⚠ AS FRASES SAÍRAM DAS DUAS — DRE-PADRAO-01a-2, decisão do Gabriel na homologação: o
              "X em custos comuns rateados por área — estimativa" e o equivalente da pecuária
              disputavam a linha com os controles e diziam, em prosa, o que o selo `estimado` da
              própria linha do rateio já diz. Quem quer o número abre o modal do rateio.
              ⚠ O CONTROLE É O MESMO NAS DUAS, e é o ponto do PR: mesmo componente, mesma posição,
              mesmos rótulos. O que muda é de onde sai o número — ver `valorNoModo` no painel da
              pecuária e `valorDaLinha` aqui. */}
          {/* ⚠ ESTA LINHA É SÓ DA LAVOURA DESDE O fix2. Na pecuária ela deixou de existir — os
              controles subiram para as colunas vazias da faixa de cards (ver `controlesPec`), e a
              tabela subiu os 28px dela mais o gap. Os ramos `ehPec` daqui para baixo ficaram
              inalcançáveis; não foram apagados porque a Lavoura ainda não fez a mesma mudança (a
              decisão de reduzir os 6 cards dela está com o Gabriel), e é neles que a régua de
              reservas está escrita. */}
          {!ehPec && mostraGrade && (
          <div className="flex h-[28px] items-center justify-between gap-2 text-[10px] text-muted-foreground">
            {/* ⚠ O SELETOR DE CULTURA DESCEU PARA CÁ — DRE-PADRAO-01a-3. Ele vivia no cabeçalho, e
                o slot de 130px que guardava o lugar dele era justamente o espaço que faltava ao
                subtítulo: a 1126 o subtítulo precisava de 252px (pecuária) ou 259 (lavoura) e tinha
                177. Aqui ele ocupa o lado esquerdo desta linha, que ficou vazio quando as frases de
                rateio saíram no 01a-2.
                ⚠ E O SLOT CONTINUA RESERVADO NAS DUAS ABAS: vazio na pecuária e na raiz da lavoura.
                Sem ele, abrir o drill empurraria os controles da direita 130px — trocar a régua de
                lugar não pode ser o preço de abrir uma cultura.
                ⚠ SÓ MUDOU DE LUGAR: mesmas opções, mesmo estado, mesmo efeito no drill. */}
            <div className="flex w-[130px] shrink-0 items-center justify-start">
              {culturaAberta && (
                <Select value={cultura} onValueChange={abrirCultura}>
                  <SelectTrigger className="h-[22px] w-[130px] text-[10px]">
                    <SelectValue placeholder="Cultura" />
                  </SelectTrigger>
                  <SelectContent>
                    {culturas.map(c => (
                      <SelectItem key={c.cultura} value={c.cultura} className="text-[12px]">
                        {labelDaCultura(c.cultura)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <span className="min-w-0 flex-1 truncate">
              {rateioDentro && <><span className="text-amber-700">●</span> ao lado do nome = tem rateio dentro.</>}
            </span>
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              {/* ⚠ O SELETOR DE RATEIO É SÓ DA LAVOURA — DRE-RATEIO-FIX-01. Ele chegou à pecuária
                  no 2665e9c7 com um modo "Custos diretos" que SOMAVA o rateio administrativo de
                  volta aos resultados: mostrava lucro que não existe. O custo administrativo é
                  real e sai do resultado em qualquer leitura; na lavoura o seletor não mexe no
                  resultado — só muda ONDE o custo aparece (linha própria ou distribuído nos
                  centros), e a RPC de lá devolve os dois números para isso. A pecuária ainda não
                  tem a distribuição por centro, então não tem o que escolher.
                  ⚠ E A RESERVA INVISÍVEL SAIU NO fix3: esta linha inteira é da Lavoura desde o
                  fix2, então não há mais aba nenhuma com quem alinhar. */}
              <span className="flex items-center gap-2">
              Rateio compartilhado:
              <Segmentado valor={rateioDentro ? 'dentro' : 'propria'}
                onEscolher={v => setRateioDentro(v === 'dentro')}
                opcoes={[
                  /* ⚠ OS RÓTULOS DIZEM O QUE A CÉLULA MOSTRA, não onde o rateio mora: "em linha
                     própria" descrevia a LINHA que some, e o operador tinha de deduzir o efeito
                     sobre os centros. As chaves internas não mudaram. */
                  { valor: 'propria', rotulo: 'Custos diretos' },
                  { valor: 'dentro', rotulo: 'Com rateio nos centros' },
                ]} />
              </span>
              {/* ⚠ OS CHIPS DE UNIDADE — DRE-UNIDADES-01, e são seleção MÚLTIPLA: cada um marcado
                  é uma coluna a mais em cada grupo. O antigo "/ha e /sc" era um interruptor só
                  para duas unidades, e não havia como ver a saca sem o hectare.
                  ⚠ O R$ TAMBÉM DESMARCA, e é o ponto: quem compara produtividade entre culturas
                  quer a tela inteira em R$/ha. O que não se pode é ficar sem nenhuma — o último
                  marcado não responde ao clique, e o `title` diz por quê. */}
              {/* ⚠ O SLOT DE 192px FICA, mesmo sem a pecuária com quem alinhar: os três chips da
                  lavoura mudam de largura com o rótulo da unidade da cultura ("R$/sc" ou "R$/t"),
                  e sem ele o "abrir tudo" andaria ao trocar de cultura. */}
              <span className="flex w-[192px] shrink-0 items-center justify-start">
                <ChipsUnidade valor={unidadesLav} onEscolher={setUnidadesLav}
                  opcoes={UNIDADES_LAV.map(u => ({ valor: u, rotulo: ROTULO_UNIDADE_LAV[u] }))} />
              </span>
              {/* ⚠ AS DUAS RESERVAS SAÍRAM AQUI — fix3, e elas custavam 455px numa linha que já não
                  cabia: 193 para o seletor de anos e 262 para o grupo "Comparar", ambos controles da
                  PECUÁRIA, guardados nesta linha só para que os chips da lavoura não andassem ao
                  trocar de aba. Desde o fix2 a pecuária não tem mais esta linha — não havia o que
                  alinhar, e o que sobrava era espaço vazio empurrando o "abrir tudo" 327px para fora
                  do cartão. Os dois controles seguem vivos, na faixa de cards da pecuária. */}
              {/* ⚠ UM BOTÃO SÓ, QUE DIZ O QUE VAI FAZER: "abrir tudo" quando há grupo fechado,
                  "fechar tudo" quando todos estão abertos. Dois botões lado a lado obrigariam a
                  ler qual está disponível. */}
              <button type="button" onClick={alternarTudo}
                className="shrink-0 whitespace-nowrap rounded border px-2 text-[10px] text-muted-foreground
                  hover:bg-muted hover:text-foreground"
                style={{ height: 22 }}>
                {tudoAberto ? 'fechar tudo' : 'abrir tudo'}
              </button>
            </span>          </div>
          )}
          </div>
        </>
      )}

      {/* ⚠ PRODUÇÃO E HISTÓRICO NÃO ENTRAM NO CARTÃO DA GRADE: cada um traz as próprias tabelas,
          com o próprio scroll. Empilhá-los dentro do cartão do DRE daria dois scrollports. */}
      {painelDrill === 'producao' && (
        <ProducaoSafraPanel painel={painel} totaisTalhoes={totaisTalhoes}
          comparadas={comparadas} safraId={safraId || null} cultura={cultura} />
      )}
      {painelDrill === 'historico' && (
        <HistoricoCultura safras={historico} carregando={carregandoHist}
          cultura={cultura} safraAtual={safraAtual?.codigo || safraAtual?.nome || ''}
          onEscolher={cod => {
            const alvo = safras.find(x => (x.codigo || x.nome) === cod);
            if (alvo) setSafraId(alvo.id);
          }} />
      )}

      {/* ⚠ UM SCROLLPORT SÓ, e é o cartão: o cabeçalho gruda dentro dele (`sticky`) e a coluna
          Cultura gruda à esquerda. Duas barras fariam rolar a de dentro sem mover o cabeçalho. */}
      {/* ⚠ DUAS COLUNAS NO DRILL (§3), e a dos cartões tem MÍNIMO: abaixo de 380px eles ficariam
          com barras de dois centímetros e números quebrando linha, então o `minmax` empurra a
          coluna inteira para baixo da tabela — que é o comportamento certo numa janela estreita.
          ⚠ SÓ NA ABA RESULTADO E FORA DO AMPLIAR: Produção e Histórico já mostram estas tabelas
          inteiras, e ampliar é ver a grade. */}
      {/* ⚠ NO AMPLIAR É `height`, NÃO `maxHeight` (§8): com `maxHeight` o cartão encolhe até o
          tamanho da tabela e sobra janela embaixo — que é exatamente o que "Ampliar" existe para
          não fazer. No modo normal segue `maxHeight`, para uma tabela curta não desenhar um
          cartão vazio de meia tela. */}
      {/* ⚠ A PECUÁRIA TEM O PRÓPRIO PAINEL, e ele recebe o MESMO `cartaoRef` e a MESMA altura
          medida: o cartão vai até a borda de baixo nos dois, porque a régua é uma só. */}
      {ehPec && (
        erroPec ? (
          <div className="rounded-lg border border-border/60 bg-card px-3 py-8 text-center text-[11px] text-destructive">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Não foi possível carregar o DRE da pecuária — o dado continua no banco.
          </div>
        ) : carregandoPec || !drePec ? (
          <div className="rounded-lg border border-border/60 bg-card px-3 py-8 text-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
          </div>
        ) : (
          <PecDrePanel colunas={colunasPec} alturaCartao={alturaCartao} cartaoRef={cartao}
            unidades={unidadesPec}
            modo={modoPec} abertos={abertosPec} onAbertos={f => setAbertosPec(f)}
            onAbrirLista={setRecortePec}
            onAbrirDidatico={(fazendaId, nome, qual) => setDidatico({ fazendaId, nome, qual })}
            onAbrirRateio={() => setRateioPecAberto(true)}
            onAbrirHistorico={setHistoricoPec} />
        )
      )}

      {/* ⚠ OS TRÊS MODAIS DA PECUÁRIA SÃO IRMÃOS DA GRADE, nunca filhos de uma célula: assim
          fechar um não desmonta a tabela por baixo, e o estado da expansão dos grupos sobrevive. */}
      {ehPec && (
        <PecLancamentosModal
          aberto={!!recortePec}
          recorte={recortePec}
          lancamentos={lancPec}
          carregando={carregandoLancPec}
          periodoRotulo={rotuloRecortePec}
          onFechar={() => setRecortePec(null)}
          /* ⚠ O MESMO CAMINHO DA LAVOURA (PR-05): `abrirLancamento` usa o
             `buscarLancamentoPorId` do Financeiro, e os quatro catálogos já foram carregados no
             efeito do topo. Sem eles o formulário abre com os campos em branco sobre dado
             preenchido — o defeito que esta frente já pagou quatro vezes. */
          onAbrirLancamento={catalogosProntos ? id => { void abrirLancamento(id); } : undefined}
        />
      )}
      {ehPec && didatico && drePec && (
        <PecPatrimonioModal
          aberto
          fazendaNome={didatico.nome}
          qual={didatico.qual}
          patrimonio={patPec}
          carregando={carregandoPatPec}
          /* ⚠ A AUSÊNCIA VEM DA GRADE, não de uma segunda consulta: `fn_dre_pecuaria` já disse
             quais fazendas não têm fechamento na ponta inicial. */
          semP0={(didatico.fazendaId
            ? drePec.fazendas.find(f => f.fazenda_id === didatico.fazendaId)?.linhas.sem_p0
            : drePec.total.sem_p0) === true}
          onFechar={() => setDidatico(null)}
        />
      )}
      {ehPec && drePec && rateioPecAberto && (
        <PecRateioAdmModal aberto dre={drePec} periodoRotulo={descreverPeriodo(periodo)}
          onFechar={() => setRateioPecAberto(false)} />
      )}
      {/* ⚠ IRMÃO DA GRADE, como os outros três: fechá-lo não desmonta a tabela nem perde a
          expansão dos grupos. A unidade inicial é a PRIMEIRA marcada nos chips do DRE — o modal
          abre falando a língua em que o operador estava lendo a grade. */}
      {ehPec && (
        <PecHistoricoLinhaModal
          aberto={!!historicoPec}
          recorte={historicoPec}
          atual={drePec}
          meta={drePecMeta}
          anos={anosHistoricoPec.map(a => ({
            de: a.periodo.de, ate: a.periodo.ate, dre: a.dre, carregando: a.carregando,
          }))}
          periodoRotulo={descreverPeriodo(periodo)}
          clienteNome={clienteAtual?.nome ?? '—'}
          unidadeInicial={unidadesPec[0] ?? 'rs'}
          onFechar={() => setHistoricoPec(null)}
        />
      )}

      {/* ⚠ `items-stretch` NO DRILL (§3b), não `items-start`: com `start` o cartão da tabela
          parava na última linha do DRE e a coluna dos cartões seguia meia tela abaixo, deixando
          um degrau. Esticado, os dois terminam no mesmo y e a tabela rola por dentro se
          precisar — o scrollport continua sendo um só. */}
      {!ehPec && mostraGrade && (
      <div className={cn(mostraCartoes && duasColunas && 'grid items-stretch gap-3')}
        style={mostraCartoes && duasColunas
          ? {
            gridTemplateColumns: `minmax(${W_MIN_GRADE}px, 1fr) minmax(${W_MIN_CARTOES}px, 1fr)`,
            /* ⚠ `minHeight` NA LINHA DO GRID, e é o que faz o §3: com `stretch` sozinho a altura
               da linha é a do item MAIS ALTO, então numa cultura de poucos centros a tabela e os
               cartões acabavam os dois no meio da tela. Com o piso, a linha vale
               `max(coluna dos cartões, viewport − topo − 8)` — e o cartão da grade chega ao pé
               da janela em qualquer cultura. */
            minHeight: alturaCartao ?? undefined,
          }
          : undefined}>
      <div ref={cartao} className="overflow-auto rounded-lg border border-border/60 bg-card"
        style={alturaCartao
          ? (ampliado ? { height: alturaCartao }
            /* ⚠ COM OS CARTÕES AO LADO, `height: 100%` faz o `stretch` valer: sem altura própria
               o `grid` estica a CAIXA e o conteúdo não a preenche, e a borda de baixo continua
               onde a tabela acabou.
               ⚠ E SEM `maxHeight` AQUI (PR-11): o teto vem do `minHeight` da linha do grid, que
               já é `max(cartões, viewport − topo − 8)`. Um teto próprio de `alturaCartao`
               cortaria o cartão quando a coluna dos cartões fosse a mais alta — a tabela pararia
               no meio e os cartões seguiriam abaixo, que é o degrau que o §3b do PR-09 tirou. */
            : mostraCartoes && duasColunas ? { height: '100%' }
              : { maxHeight: alturaCartao })
          : undefined}>
        {erro ? (
          <div className="px-3 py-8 text-center text-[11px] text-destructive">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Não foi possível carregar o DRE — o dado continua no banco.
          </div>
        ) : carregando || !dre ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
          </div>
        ) : (
          /* ⚠ A MESMA `Grade`, com a lista de culturas reduzida a uma e sem a coluna Total: o
             drill não é outra tabela, é a mesma olhando para uma cultura só. Duas tabelas com a
             mesma gramática divergiriam na primeira correção. */
          <Grade dre={dre} culturas={culturaAberta ? [culturaAberta] : culturas}
            semTotal={!!culturaAberta}
            abertos={abertos} setAbertos={setAbertos}
            rateioDentro={rateioDentro} unidades={unidadesLav}
            colsPorCultura={colsPorCultura} centrosDoBloco={centrosDoBloco}
            valorDaLinha={valorDaLinha} abrir={abrir}
            onAbrirCultura={culturaAberta ? undefined : abrirCultura}
            onDrill={(chave, rotulo, cult) => setDrill({ chave, rotulo, cultura: cult })} />
        )}
      </div>

      {mostraCartoes && culturaAberta && (
        <div className="flex flex-col gap-2" style={{ maxHeight: alturaCartao ?? undefined }}>
          <CartaoTalhoes painel={painel} totais={totaisTalhoes} cultura={cultura} />
          <CartaoQualidade totais={totaisTalhoes} cultura={cultura} />
          <CartaoEquilibrio c={culturaAberta} />
          <CartaoHistorico safras={historico}
            safraAtual={safraAtual?.codigo || safraAtual?.nome || ''}
            onEscolher={cod => {
              const alvo = safras.find(x => (x.codigo || x.nome) === cod);
              if (alvo) setSafraId(alvo.id);
            }} />
        </div>
      )}
      </div>
      )}

      {/* ⚠ SÓ APARECE COM SOBRA: `nao_apropriado` zero significa que toda cultura lançada está
          plantada nesta safra — e um aviso permanente ensinaria a ignorá-lo. */}
      {!ehPec && !!dre && dre.nao_apropriado.total > 0 && (
        <p className="text-[10px] text-amber-700">
          {formatMoeda(dre.nao_apropriado.total)} em lançamentos com cultura que não está plantada
          nesta safra — fora do DRE até ajustar.
        </p>
      )}

      {rateio && (
        <RateioDetalheModal aberto onFechar={() => setRateio(null)}
          titulo={rateio.titulo} dados={rateio.dados} tipo={rateio.tipo}
          rateioDentro={rateioDentro} pool={rateio.pool}
          onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
      )}

      {/* ⚠ O DRAWER É IRMÃO DO MODAL, NUNCA FILHO — a mesma decisão do Painel e do DRE por
          cultura: fechar a edição não pode desmontar o drawer, senão o operador volta à raiz da
          árvore a cada lançamento corrigido. */}
      {drill && (
        <AnaliseDrawer
          titulo={`${drill.rotulo} · ${labelDaCultura(drill.cultura)}`
            + (safraAtual ? ` · Safra ${safraAtual.codigo || safraAtual.nome}` : '')}
          /* ⚠ "Carregando" ENQUANTO A LISTA NÃO CHEGA: na raiz o hook só liga quando o drawer
              abre, e sem esta frase o primeiro quadro diria "0 lançamentos" — uma afirmação
              falsa sobre um número que o operador veio conferir. */
          subtitulo={carregandoLanc ? 'carregando…'
            : `${itensDoDrill.length} lançamento${itensDoDrill.length === 1 ? '' : 's'}`}
          total={totalDoDrill}
          totalLabel="TOTAL DA LINHA"
          onClose={() => setDrill(null)}>
          <DrillDownEconomico itens={itensDoDrill} raiz={drill.rotulo} niveis={NIVEIS_DRILL}
            onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
        </AnaliseDrawer>
      )}

      {/* ⚠ `carregando` ENQUANTO OS CATÁLOGOS NÃO CHEGAM (§1c): o formulário editável com os
          seletores vazios é o caminho para gravar nulo por cima de dado bom. Esqueleto e Salvar
          travado até os quatro estarem na mão. */}
      <LancamentoV2Dialog
        open={!!editando}
        carregando={!catalogosProntos}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          /* ⚠ AS QUATRO FONTES DESTA TELA, e nenhuma sobra: o DRE é somado por `fn_dre_lavoura`,
             a lista do drawer vem do PostgREST, a Produção de `fn_painel_safra` mais o
             comparativo, e o Histórico de `fn_dre_lavoura_historico`. Recarregar algumas é o
             pior dos mundos — a linha muda e o detalhe dela não, na mesma tela aberta. */
          if (ok && id) {
            await recarregarLancamentos();
            await recarregarPainel();
            await recarregarComparativo();
            await recarregarDre();
            /* ⚠ A PECUÁRIA TAMBÉM, e pelo MESMO motivo das quatro acima: corrigir a fazenda de um
               lançamento é justamente o gesto do §5 — a coluna errada perde o valor e a certa o
               ganha. Recarregar só a lista deixaria a grade mostrando o número velho ao lado do
               detalhe já corrigido, na mesma tela aberta. */
            if (ehPec) {
              recarregarPec();
              await recarregarLancPec();
            }
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

/**
 * A FAIXA DO DRILL — os seis números do ciclo daquela cultura.
 *
 * ⚠ REGRA DO BRIEFING, E ELA É DE LEGIBILIDADE: valor + unidade curta na caixa; o que explica
 * vai para o `title`. "Preço de equilíbrio 60,42 R$/sc" cabe; "preço de equilíbrio 60,42 contra
 * 66,56 realizado" não cabe em 32px de altura sem virar duas linhas de 9px. O realizado está a
 * um hover.
 * ⚠ E A UNIDADE É DA CULTURA: mandioca fecha em tonelada. Um "/sc" fixo mentiria.
 * ⚠ SEM COLHEITA, TUDO É "—" E NÃO ZERO. A mandioca da 25/26 tem `producao 0` e os três campos
 * de equilíbrio `null` — a safra está no chão, não fracassou. Zero afirmaria fracasso.
 */
function FaixaCultura({ c }: { c: DreCultura }) {
  /* ⚠ SÍMBOLO CURTO NA CAIXA, PESO NO `title`: "sc 25kg" ao lado de um número de seis dígitos
     empurrava o valor para fora de uma caixa de 180px. O peso não sumiu — mudou de lugar. */
  const un = simboloDaUnidade(c.cultura);
  const peso = descricaoDaUnidade(c.cultura);
  const temColheita = c.producao > 0;
  const eq = c.equilibrio;
  /* ⚠ A ÚNICA CONTA DESTA FAIXA, e o briefing a previu: `custo_operacional` chega escalar, sem
     `valor_ha` pronto. Medido: 2.655.464,72 / 185 = 14.353,86 — o número da homologação. */
  const custoHa = c.area_ha > 0 ? c.custo_operacional / c.area_ha : null;
  const caixas: CaixaFaixa[] = [
    { rotulo: 'Área', valor: formatNum(c.area_ha, 2), unidade: 'ha' },
    { rotulo: 'Colhido', valor: temColheita ? formatNum(c.producao, 2) : traco,
      unidade: temColheita ? un : undefined, title: peso },
    { rotulo: 'Produtividade', valor: temColheita ? formatNum(c.produtividade, 2) : traco,
      unidade: temColheita ? `${un}/ha` : undefined, title: peso },
    { rotulo: 'Custo op. por ha', titleRotulo: 'Custo operacional por hectare',
      valor: custoHa == null ? traco : formatNum(custoHa, 2),
      unidade: custoHa == null ? undefined : 'R$/ha', cor: 'text-destructive',
      title: custoHa == null ? undefined : formatMoeda(custoHa) },
    /* ⚠ `null` É "—", NUNCA "0,00": a mandioca da 25/26 chega com os três nulos porque não
       colheu. "0,00 R$/t" seria um preço — uma afirmação, e falsa. */
    { rotulo: 'Preço equilíbrio', titleRotulo: 'Preço de equilíbrio',
      valor: eq.preco_equilibrio == null ? traco : formatNum(eq.preco_equilibrio, 2),
      unidade: eq.preco_equilibrio == null ? undefined : `R$/${un}`,
      title: eq.preco_realizado == null ? peso
        : `realizado ${formatNum(eq.preco_realizado, 2)} R$/${un} · ${peso}` },
    { rotulo: 'Prod. equilíbrio', titleRotulo: 'Produtividade de equilíbrio',
      valor: eq.produtividade_equilibrio == null ? traco
        : formatNum(eq.produtividade_equilibrio, 2),
      unidade: eq.produtividade_equilibrio == null ? undefined : `${un}/ha`,
      title: temColheita ? `realizada ${formatNum(c.produtividade, 2)} ${un}/ha · ${peso}` : peso },
  ];
  return <Caixas caixas={caixas} />;
}

/** As seis caixas do topo, na raiz: o consolidado da safra. */
function Faixa({ dre }: { dre: DreLavoura | null }) {
  if (!dre) return null;
  const t = dre.total;
  const res = t.linhas.resultado_caixa.valor;
  const resHa = t.linhas.resultado_caixa.por_ha ?? null;
  const caixas: CaixaFaixa[] = [
    { rotulo: 'Área plantada', valor: formatNum(t.area_ha, 2), unidade: 'ha' },
    { rotulo: 'Receita líquida', valor: numeroDaCelula(t.linhas.receita_liquida.valor),
      unidade: 'R$', cor: VERDE },
    /* ⚠ O "a pagar" SAIU DE DENTRO DA CAIXA e foi para o `title`: ele é uma segunda informação
       sobre o mesmo número, e lado a lado os dois disputavam a largura — era esta a caixa que
       truncava a 1168px. */
    { rotulo: 'Custo operacional efetivo', valor: numeroDaCelula(t.custo_operacional),
      unidade: 'R$', cor: 'text-destructive',
      title: t.a_pagar.operacional > 0
        ? `a pagar ${formatMoeda(t.a_pagar.operacional)}` : undefined },
    /* ⚠ O NOME ACOMPANHA A LINHA — DRE-CASCATA-03a: a grade passou a chamá-la "Resultado do
       período", e a caixa que a resume não pode chamá-la de outra coisa dez pixels acima. */
    { rotulo: 'Resultado do período', valor: numeroDaCelula(res), unidade: 'R$', cor: corDoSinal(res) },
    { rotulo: 'Resultado por hectare', valor: numeroDaCelula(resHa),
      unidade: resHa == null ? undefined : 'R$/ha', cor: corDoSinal(resHa) },
    /* ⚠ AQUI É O `pct_direto` DO TOTAL (66 no NJ 25/26), não o de uma cultura (70 no amendoim).
       São dois números certos em dois lugares: esta caixa descreve a safra inteira. */
    { rotulo: 'Custos diretos', valor: formatNum(t.pct_direto, 0), unidade: '%',
      titleRotulo: `Custos apropriados direto: ${formatNum(t.pct_direto, 0)} %`,
      title: `Custos apropriados direto: ${formatNum(t.pct_direto, 0)} %` },
  ];
  return <Caixas caixas={caixas} />;
}

/* ═══════════════════════════════ A GRADE ═══════════════════════════════ */

/**
 * Os blocos cujo rateio NÃO tem linha própria na cascata do DRE.
 *
 * ⚠ CUSTEIO E PÓS-COLHEITA TÊM a linha `(−) Rateio compartilhado` logo depois deles, e é ela que
 * fecha `custeio + pós + rateio = custo variável`. Custo fixo e Investimento não têm nada
 * parecido — o rateio deles só existe dentro do próprio número.
 */
const BLOCOS_SEM_LINHA_PROPRIA: Bloco[] = ['fixo', 'investimento'];

/** O que um clique num valor precisa dizer para o modal do Painel. */
type AbrirRateio = (tipo: TipoRateio, chave: string, rotulo: string, cultura: string) => void;

interface PropsGrade {
  dre: DreLavoura;
  culturas: DreCultura[];
  abertos: Record<string, boolean>;
  setAbertos: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  rateioDentro: boolean;
  unidades: readonly UnidadeLav[];
  colsPorCultura: number;
  centrosDoBloco: (b: Bloco) => DreCentro[];
  valorDaLinha: (l: DreValor, def: DefLinha) => number | null;
  abrir: AbrirRateio;
  /** No drill a coluna Total some: com uma cultura só ela repetiria a coluna ao lado. */
  semTotal?: boolean;
  /** Só na raiz: clicar no cabeçalho da cultura abre o drill dela. */
  onAbrirCultura?: (cultura: string) => void;
  /**
   * Receita, deduções e juros abrem o drawer de lançamentos — NA RAIZ TAMBÉM.
   *
   * ⚠ A CULTURA VAI NO ARGUMENTO, e é o que permitiu ligar a raiz: o drawer filtra por
   * `grupo_custo` E por cultura, então na raiz cada coluna abre a lista DAQUELA cultura. A
   * coluna Total continua sem clique — não há cultura para filtrar.
   */
  onDrill?: (chave: string, rotulo: string, cultura: string) => void;
}

/**
 * As três linhas que abrem o DRAWER (e não o modal de rateio), com a chave do plano de contas.
 *
 * ⚠ AS CHAVES SÃO `grupo_custo`, as MESMAS do `CASE` da migration `plano_bloco_dre` — não são
 * rótulos de tela. Medido no NJ 25/26 amendoim: 2.925.162,25 · 33.905,13 · 143.707,14, que são
 * exatamente `receita_bruta`, a diferença até `receita_liquida` e `juros` do payload.
 */
const GRUPO_DO_DRAWER: Partial<Record<ChaveLinha, string>> = {
  receita_bruta: 'Receita Agrícola',
  deducoes: 'Deduções Agricultura',
  juros: 'Juros de Financiamento Agricultura',
};

/**
 * O QUE O DRILL DE UMA CULTURA MOSTRA — 03b-fix3/adendo item 3.
 *
 * ⚠ ELE NÃO PERGUNTAVA PELA ATIVIDADE, e era esse o defeito: os dois painéis do drill checavam só
 * `cultura` e `aba`, então Lavoura > Amendoim > Histórico > Pecuária deixava o histórico da
 * cultura na tela, acima da tabela do rebanho. O estado agora é zerado ao trocar de segmento
 * (`trocarSegmento`), e este guard é a segunda tranca: estado limpo conserta o caminho conhecido,
 * o guard conserta o caminho que ainda não existe.
 * ⚠ `null` É "NENHUM PAINEL DE DRILL", não "erro": a aba Resultado não tem painel próprio — ela é
 * a grade, que o cartão desenha.
 */
export function painelDoDrill(
  segmento: 'lavoura' | 'pecuaria' | 'consolidado',
  cultura: string,
  aba: 'resultado' | 'producao' | 'historico',
  ampliado: boolean,
): 'producao' | 'historico' | null {
  if (segmento !== 'lavoura' || !cultura || ampliado) return null;
  return aba === 'resultado' ? null : aba;
}

/** Divisória entre grupos de coluna — a mesma nas duas linhas do cabeçalho e no corpo. */
const DIVISOR = '1px solid rgba(255,255,255,.22)';

/**
 * O QUE O TOTAL SABE SOMAR — DRE-UNIDADES-01c.
 *
 * ⚠ O /sc NÃO ENTRA, e a razão é aritmética, não de layout: a safra inteira mistura culturas, e
 * somar saca de amendoim com tonelada de mandioca não dá número nenhum.
 * ⚠ MAS A COLUNA NÃO SOME. Com só o R$/sc marcado, `colsTotal` dava 0 e o cabeçalho saía como
 * `<th colSpan={0}>` — que em HTML significa "todas as colunas restantes", não "nenhuma". Ele
 * rendia 0px, o título "Total" ficava ilegível e a grade terminava numa coluna fantasma. Agora o
 * Total tem SEMPRE ao menos uma coluna: quando nada é somável, ela vem em traço e o `title` diz
 * por quê (Art. 19 — a tela declara o limite em vez de esconder o dado).
 */
const TOTAL_SEM_SOMA = 'sc e t não somam entre culturas';
const unidadesDoTotal = (u: readonly UnidadeLav[]): readonly UnidadeLav[] => u.filter(x => x !== 'un');
const totalEmTraco = (u: readonly UnidadeLav[]) => unidadesDoTotal(u).length === 0;



/**
 * ⚠ EXPORTADA PARA TESTE, e não é vazamento de escopo: o que ela decide — QUAIS células abrem o
 * quê — já quebrou duas vezes (o clique que só existia na célula de R$; o guard de `pool > 0` que
 * fazia o clique não fazer nada). É a parte mais propensa a defeito da tela e a única que um
 * teste consegue travar sem subir a aplicação inteira com sessão e dados.
 */
export function Grade({
  dre, culturas, abertos, setAbertos, rateioDentro, unidades,
  colsPorCultura, centrosDoBloco, valorDaLinha, abrir, semTotal, onAbrirCultura, onDrill,
}: PropsGrade) {
  /* ⚠ A RÉGUA NASCE UMA VEZ E SERVE AO `<colgroup>` E À LARGURA MÍNIMA. Escrever as larguras no
     `<col>` e repeti-las no `style` de cada `<td>` é o caminho conhecido para as duas listas
     divergirem — com `table-layout: fixed` o `<colgroup>` já é a única autoridade. */
  /* ⚠ E A RÉGUA SE MONTA POR GRUPO, não coluna a coluna — DRE-UNIDADES-01b: o piso de 160px é do
     CABEÇALHO (a cultura, o Total), então a lista tem de saber onde um grupo acaba e o outro
     começa. Somar as colunas soltas e aplicar o piso no fim daria um número certo e uma divisão
     errada. */
  const larguras = useMemo(() => {
    const daCultura: number[] = [];
    if (unidades.includes('rs')) daCultura.push(W_RS);
    if (unidades.includes('ha')) daCultura.push(W_HA);
    if (unidades.includes('un')) daCultura.push(W_UN);
    /* ⚠ E O TOTAL SEM NENHUMA UNIDADE SOMÁVEL TEM UMA COLUNA, não zero: é a do traço. */
    const doTotal: number[] = [];
    if (unidades.includes('rs')) doTotal.push(W_RS_TOTAL);
    if (unidades.includes('ha')) doTotal.push(W_HA);

    const cols: number[] = [W_CULTURA];
    culturas.forEach(() => cols.push(...larguraDoGrupo(daCultura)));
    if (!semTotal) cols.push(...larguraDoGrupo(doTotal.length ? doTotal : [W_GRUPO_MIN]));
    return cols;
  }, [culturas, unidades, semTotal]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);
  /* ⚠ A COLUNA TOTAL NÃO TEM /sc (ver `unidadesDoTotal`): ela leva o R$ e o R$/ha que estiverem
     marcados, e NUNCA menos de uma coluna — `colSpan={0}` é "todas as restantes" em HTML. */
  const colsTotal = Math.max(1, unidadesDoTotal(unidades).length);

  const alterna = (k: string) => setAbertos(a => ({ ...a, [k]: !a[k] }));

  return (
    /* ⚠ `leading-none` NA TABELA INTEIRA, e é ele que faz a régua valer. Medido no harness: sem
       ele o `line-height` herdado (1,5) dá 16,5px de caixa de texto num `text-[11px]`, e a linha
       fechava em 18,5px com `height: 18` declarado — porque `height` em `<tr>` é MÍNIMO, não
       máximo. A filha ia a 18px no lugar de 15, e a segunda linha do cabeçalho a 17 no lugar de
       14. Com `leading-none` o conteúdo fica menor que a altura declarada em todas elas, e a
       altura declarada passa a ser a que manda.

       ⚠ E A LARGURA É A SOMA DAS COLUNAS, não 100% do cartão. Com `width: 100%` e
       `table-layout: fixed`, a coluna vazia final esticava até a margem direita e a grade
       terminava no vazio, longe da coluna Total — o olho procurava o fim do dado onde só havia
       fundo. Agora a tabela acaba na última coluna e a sobra é fundo do cartão. */
    <table className="border-collapse text-[11px] leading-none"
      style={{ tableLayout: 'fixed', width: larguraMin }}>
      <colgroup>
        {larguras.map((w, i) => <col key={i} style={{ width: w }} />)}
      </colgroup>

      {/* ⚠ `sticky` NO `<th>`, NUNCA NO `<thead>`: com `border-collapse` o navegador não gruda o
          grupo de linhas, e a régua subiria junto com o corpo. E o scrollport é o cartão de
          fora — quem rola é ele, por isso o `top` é 0 e 26. */}
      <thead>
        <tr style={{ height: 26 }}>
          <th rowSpan={2}
            className={cn(CINZA_CABECALHO, 'sticky left-0 top-0 z-30 px-[7px] text-left',
              'text-[10px] font-medium text-white')}>
            Cultura
          </th>
          {culturas.map(c => (
            /* ⚠ O CABEÇALHO DA CULTURA É A PORTA DO DRILL, e só na raiz: dentro do drill ele
               abriria a tela em que já se está. `cursor default` quando não abre — um pointer
               que não leva a lugar nenhum é promessa quebrada. */
            /* ⚠ DUAS LINHAS CENTRADAS, não nome e área lado a lado à direita: empilhados, os
               dois cabem nos 26px e o nome fica sobre as colunas que ele governa. Alinhados à
               direita, "Amendoim 185,0 ha" competia com o número da primeira coluna. */
            <th key={c.cultura} colSpan={colsPorCultura}
              onClick={onAbrirCultura ? () => onAbrirCultura(c.cultura) : undefined}
              title={onAbrirCultura ? `abrir o painel de ${labelDaCultura(c.cultura)}` : undefined}
              className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-center',
                'align-middle text-white', onAbrirCultura ? 'cursor-pointer' : 'cursor-default')}
              style={{ borderLeft: DIVISOR }}>
              {/* ⚠ UMA LINHA CADA, SEMPRE — DRE-UNIDADES-01b: `truncate` traz o `nowrap` junto, e é
                  ele que impede a segunda linha de nascer e empurrar o cabeçalho para além dos
                  26px. A área tinha `nowrap` sem `truncate`: não quebrava, mas TRANSBORDAVA por
                  cima da coluna vizinha quando o grupo encolhia.
                  ⚠ E O `title` DA CULTURA FICA NO `th`, não aqui: ele já diz o nome ("abrir o
                  painel de Amendoim") e ainda anuncia o clique. Repeti-lo na `div` apagaria a
                  segunda metade justamente onde o ponteiro passa. */}
              <div className="truncate text-[10px] font-medium leading-[12px]">
                {labelDaCultura(c.cultura)}
              </div>
              <div className="truncate whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                {formatNum(c.area_ha, 1)} ha
              </div>
            </th>
          ))}
          {!semTotal && (
            <th colSpan={colsTotal}
              className="sticky top-0 z-20 px-[7px] text-center text-white"
              style={{ backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL_CAB }}>
              {/* ⚠ AQUI O `title` É NECESSÁRIO: este `th` não abre nada, então não tem `title`
                  próprio — sem ele, área cortada seria dado perdido, não dado escondido. */}
              <div className="truncate text-[10px] font-medium leading-[12px]">Total</div>
              <div className="truncate whitespace-nowrap text-[10px] font-normal leading-[12px] text-white"
                title={`${formatNum(dre.total.area_ha, 1)} ha`}>
                {formatNum(dre.total.area_ha, 1)} ha
              </div>
            </th>
          )}
          <th rowSpan={2} className={cn(CINZA_CABECALHO, 'sticky top-0 z-20')} />
        </tr>
        <tr style={{ height: 14 }}>
          {culturas.map(c => (
            <ThUnidade key={c.cultura} cultura={c.cultura} unidades={unidades} />
          ))}
          {!semTotal && <>
            {unidades.includes('rs') && (
              <th className="sticky z-20 px-[7px] text-right text-[10px] font-normal text-white"
                style={{ top: 26, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL_CAB }}>R$</th>
            )}
            {unidades.includes('ha') && (
              <th className="sticky z-20 px-[7px] text-right text-[10px] font-normal text-white"
                style={{ top: 26, backgroundColor: NAVY_TOTAL,
                  ...(unidades.includes('rs') ? {} : { borderLeft: BORDA_TOTAL_CAB }) }}>R$/ha</th>
            )}
            {/* ⚠ A CÉLULA DA UNIDADE FICA VAZIA, não escrita: a coluna não tem unidade nenhuma —
                é só o lugar onde o traço mora. Quem explica é o `title` do traço, na linha. */}
            {totalEmTraco(unidades) && (
              <th className="sticky z-20 px-[7px] text-right text-[10px] font-normal text-white"
                title={TOTAL_SEM_SOMA}
                style={{ top: 26, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL_CAB }} />
            )}
          </>}
        </tr>
      </thead>

      <tbody>
        {LINHAS.map(def => {
          if (def.someComRateioDentro && rateioDentro) return null;
          const filhas = def.bloco && abertos[def.bloco] ? centrosDoBloco(def.bloco) : [];
          return (
            <Fragment key={def.chave}>
              <LinhaDre def={def} dre={dre} culturas={culturas} rateioDentro={rateioDentro}
                unidades={unidades} aberto={!!(def.bloco && abertos[def.bloco])}
                onAlternar={def.bloco ? () => alterna(def.bloco as string) : undefined}
                valorDaLinha={valorDaLinha} abrir={abrir} semTotal={semTotal} onDrill={onDrill} />
              {/* ⚠ O LUCRO POR HECTARE É LEITURA DE APOIO, na régua da linha de % da pecuária: 9px,
                  muted, altura 14, sem cor de sinal e sem clique. Ele some quando o chip R$/ha está
                  marcado — ali a sub-coluna já responde. */}
              {def.chave === 'lucro_liquido' && !unidades.includes('ha') && (
                <LinhaPorHectareLav dre={dre} culturas={culturas} unidades={unidades} semTotal={semTotal} />
              )}
              {filhas.map(ct => (
                <LinhaCentro key={`${def.chave}:${ct.centro}`} centro={ct} culturas={culturas}
                  rateioDentro={rateioDentro} unidades={unidades}
                  areaTotal={dre.total.area_ha} abrir={abrir} semTotal={semTotal} />
              ))}
              {/* ⚠ A ÚLTIMA FILHA É O RATEIO DO GRUPO (§2), e ela existe para a conta fechar à
                  vista: no modo "Custos diretos" os centros mostram só o direto, e sem esta
                  linha as filhas do Custo fixo somavam 0,00 embaixo de um grupo de 76.544,30.
                  ⚠ SÓ NOS BLOCOS SEM LINHA PRÓPRIA: custeio e pós-colheita já têm a
                  `rateio_compartilhado` na cascata, e repetir aqui contaria duas vezes.
                  ⚠ E ELA NÃO ABRE MODAL — ver o relatório: o `p_chave` nulo da RPC soma
                  `bloco_dre in ('custeio','pos_colheita')`, e não há como pedir o pool de um
                  bloco. Cursor normal, para não prometer o que não entrega. */}
              {/* ⚠ A CONDIÇÃO É O GRUPO ESTAR ABERTO, não ter filhas: um bloco pode ter rateio e
                  nenhum centro direto (o Custo fixo do NJ é 100% rateado), e amarrar a linha à
                  existência de filhas a faria sumir justamente no caso que ela explica. */}
              {def.bloco && abertos[def.bloco] && !rateioDentro
                && BLOCOS_SEM_LINHA_PROPRIA.includes(def.bloco)
                && culturas.some(c => (c.linhas[def.chave].rateado ?? 0) > 0) && (
                <LinhaRateioDoGrupo key={`${def.chave}:rateio`} chave={def.chave} dre={dre}
                  culturas={culturas} unidades={unidades} semTotal={semTotal}
                  abrir={abrir} />
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** A segunda linha do cabeçalho de UMA cultura — separada porque a unidade é dela, não da tela. */
function ThUnidade({ cultura, unidades }: { cultura: string; unidades: readonly UnidadeLav[] }) {
  const cls = cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white');
  /* ⚠ A BORDA DE DIVISÃO É DA PRIMEIRA CÉLULA QUE EXISTIR: com o R$ desmarcado, ela passa para a
     unidade seguinte — senão o grupo de colunas da cultura perderia a divisa. */
  const primeira = unidades[0];
  return (
    <>
      {unidades.includes('rs') && (
        <th className={cls} style={{ top: 26, borderLeft: DIVISOR }}>R$</th>
      )}
      {unidades.includes('ha') && (
        <th className={cls} style={{ top: 26, ...(primeira === 'ha' ? { borderLeft: DIVISOR } : {}) }}>R$/ha</th>
      )}
      {unidades.includes('un') && <>
        {/* ⚠ A UNIDADE É DA CULTURA, não da tela: mandioca fecha em tonelada e amendoim em saca,
            e um "/sc" fixo faria a coluna da mandioca mentir sobre a própria grandeza.
            ⚠ E É O SÍMBOLO CURTO: a coluna tem 60px e "R$/sc 25kg" quebrava em duas linhas,
            empurrando a segunda linha do cabeçalho para além dos 14px. O peso foi para o
            `title`, onde não custa largura. */}
        <th className={cls} style={{ top: 26, ...(primeira === 'un' ? { borderLeft: DIVISOR } : {}) }}
          title={descricaoDaUnidade(cultura)}>
          <span className="whitespace-nowrap">R$/{simboloDaUnidade(cultura)}</span>
        </th>
      </>}
    </>
  );
}

/* ─────────────────────── UMA LINHA DO DRE ─────────────────────── */

/** Fundo da linha — e ele tem de ser OPACO, porque a coluna Cultura gruda por cima do corpo. */




/**
 * O LUCRO POR HECTARE DA LAVOURA — DRE-CASCATA-03a.
 *
 * ⚠ O NÚMERO VEM PRONTO DA RPC (`lucro_liquido.por_ha`), não é dividido aqui: a área da cultura é
 * a que a `fn_dre_lavoura` usou para o `resultado_caixa`, e refazer a conta no front criaria a
 * segunda dona dela — que diverge no primeiro ajuste de área.
 * ⚠ SEM ÁREA, TRAÇO: a RPC devolve `por_ha` nulo quando não há hectare, e "R$ 0,00/ha" afirmaria
 * que a cultura não lucrou.
 */
function LinhaPorHectareLav({ dre, culturas, unidades, semTotal }: {
  dre: DreLavoura; culturas: DreCultura[]; unidades: readonly UnidadeLav[]; semTotal?: boolean;
}) {
  const celula = (v: number | null | undefined) => (v == null ? traco : `R$ ${formatNum(v, 2)}/ha`);
  /* ⚠ ELA MORA NA FAIXA DO LUCRO LÍQUIDO — item 12: é a mesma linha noutra unidade, e a tira branca
     que ela era logo abaixo do azul se lia como uma linha nova da cascata. O fundo, a cor do texto
     e o marcador ▲/▼ são os do t4, os mesmos da linha de cima. */
  const t4 = FAIXA_TOTAL.t4;
  const vazias = (n: number) => Array.from({ length: n }).map((_, i) => (
    <td key={i} className={t4.fundo} />
  ));
  const valor = (v: number | null | undefined) => (
    <>
      {v != null && <Marcador marcador={marcadorDoTotal('t4', v)} />}
      {celula(v)}
    </>
  );
  return (
    <tr className={cn(t4.fundo, 'font-normal')} style={{ height: 14 }}>
      <td className={cn('sticky left-0 z-10 truncate border-r border-border/60 py-px text-primary-foreground/80', t4.fundo)}
        style={{ fontSize: 9, paddingLeft: 7, paddingRight: 7 }}
        title="Lucro líquido dividido pela área plantada da cultura">
        Lucro por hectare
      </td>
      {culturas.map(c => (
        <Fragment key={c.cultura}>
          <td className={cn('truncate px-[7px] text-right tabular-nums', t4.fundo, t4.texto)}
            style={{ fontSize: 9, borderLeft: '1px solid hsl(var(--border))' }}>
            {valor(c.linhas.lucro_liquido.por_ha)}
          </td>
          {vazias(unidades.length - 1)}
        </Fragment>
      ))}
      {!semTotal && <>
        <td className={cn('truncate px-[7px] text-right tabular-nums', t4.fundo, t4.texto)}
          style={{ fontSize: 9, borderLeft: BORDA_TOTAL }}>
          {valor(dre.total.linhas.lucro_liquido.por_ha)}
        </td>
        {vazias(unidades.filter(u => u !== 'un').length - 1)}
      </>}
    </tr>
  );
}

function LinhaDre({
  def, dre, culturas, rateioDentro, unidades, aberto, onAlternar, valorDaLinha, abrir,
  semTotal, onDrill,
}: {
  def: DefLinha; dre: DreLavoura; culturas: DreCultura[];
  rateioDentro: boolean; unidades: readonly UnidadeLav[];
  aberto: boolean; onAlternar?: () => void;
  valorDaLinha: (l: DreValor, def: DefLinha) => number | null;
  abrir: AbrirRateio;
  semTotal?: boolean;
  onDrill?: (chave: string, rotulo: string, cultura: string) => void;
}) {
  /* ⚠ A FAIXA MANDA NO FUNDO; A COR É DO SINAL — 03b-fix1, a mesma correção da pecuária. A regra
     do 03b dizia o contrário ("num total o destaque é a faixa"), e o efeito foi um total de
     −1,4 milhão com a mesma cara de um positivo: a faixa marca a IMPORTÂNCIA da linha, que é igual
     nos dois casos, e não o resultado dela. `corDoTotal` escolhe o tom certo para cada faixa. */
  const daFaixa = def.faixa ? FAIXA_TOTAL[def.faixa] : null;
  const fundo = daFaixa ? daFaixa.fundo : fundoDaLinha(def.destaque);
  /* ⚠ TRÊS PESOS, E A REGRA É A HIERARQUIA DO DRE: subtotal e grupo em 500, filha em 400. O 600
     de antes fazia os cinco subtotais competirem entre si e com o cabeçalho — com 500 eles
     continuam destacados das linhas comuns sem virar cinco títulos empilhados. */
  /* ⚠ A RÉGUA VEM DO MÓDULO, não de literais aqui: tamanho, peso, altura e recuo saem de
     `REGUA_LINHA` pelo PAPEL da linha, e é o que mantém a lavoura e a pecuária iguais. */
  const regua = REGUA_LINHA[tipoDaLinha(def.destaque, !!def.bloco)];
  const peso = regua.peso;
  const corLinha = daFaixa ? (daFaixa.texto ?? '') : corDoTom(def.tom);
  const tot = dre.total.linhas[def.chave];
  /* ⚠ A COLUNA TOTAL SEGUE A MESMA REGRA das culturas, com o valor DELA: o sinal do total da safra
     não é o de nenhuma cultura em particular. */
  const corDoTotalDaSafra = def.faixa ? corDoTotal(def.faixa, valorDaLinha(tot, def))
    : def.corPorSinal ? corDoSinal(valorDaLinha(tot, def)) : corLinha;
  /* ⚠ O MARCADOR SÓ EXISTE NO AZUL CHEIO (item 13): nas outras faixas o próprio número é azul ou
     vermelho, e o glifo seria o mesmo recado duas vezes. */
  const marcador = (v: number | null) => (def.faixa ? marcadorDoTotal(def.faixa, v) : undefined);
  /* ⚠ O RATEIO DO GRUPO SE MEDE NAS CULTURAS MOSTRADAS, não no total da safra: no drill só há
     uma coluna, e o total traria o rateio de culturas que não estão na tela. */
  const temRateio = def.bloco
    ? culturas.reduce((a, c) => a + (c.linhas[def.chave].rateado ?? 0), 0) : 0;
  /* ⚠ SÓ COM UMA CULTURA NA TELA: é o drill. Com N, "a linha" não aponta para lugar nenhum. */
  const grupoDoRotulo = onDrill && culturas.length === 1 ? GRUPO_DO_DRAWER[def.chave] : undefined;
  const rotuloAbre = !!grupoDoRotulo;
  const aoAbrirRotulo = grupoDoRotulo && onDrill
    ? () => onDrill(grupoDoRotulo, def.rotulo, culturas[0].cultura) : undefined;

  return (
    <tr className={cn(fundo, peso)} style={{ height: regua.altura }}>
      {/* ⚠ NO DRILL O RÓTULO TAMBÉM ABRE (§5): com uma cultura só, a linha inteira é aquele
          número, e obrigar a mirar na célula da direita é atrito sem razão. Na raiz o rótulo
          continua inerte — ali ele governa N culturas e não há qual abrir. */}
      <td onClick={rotuloAbre ? aoAbrirRotulo : undefined}
        title={def.rotulo}
        className={cn('sticky left-0 z-10 truncate py-px', fundo,
          'border-r border-border/60', corLinha,
          rotuloAbre && 'cursor-pointer hover:underline hover:decoration-dotted')}
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}>
        {onAlternar ? (
          /* ⚠ O CARET É BOTÃO, não um `<span onClick>`: a linha inteira não pode alternar
             (clicar no VALOR abre o modal), e um alvo de 11px precisa ser focável pelo teclado. */
          <button type="button" onClick={onAlternar}
            className="mr-px inline-block w-[11px] text-left text-[10px] text-muted-foreground">
            {aberto ? '▾' : '▸'}
          </button>
        ) : <span className="mr-px inline-block w-[11px]" />}
        {def.rotulo}
        {def.etiqueta && <Etiqueta texto={def.etiqueta} />}
        {/* ⚠ SÓ QUANDO HÁ RATEIO DE VERDADE. A etiqueta aparecia em todo grupo expansível no
            modo "dentro dos centros", e Pós-colheita tem `rateado 0` no NJ — ela prometia um
            rateio que não existe e mandava o operador procurar diferença onde não há. */}
        {/* ⚠ A ETIQUETA CONTINUA, E A BOLINHA VEM DEPOIS DELA (§1 do PR-10): a etiqueta diz o
            QUE a linha tem; o ponto é a marca rápida que o olho pega varrendo a coluna. Na
            célula de valor ele empurrava o número — e a grade existe para comparar colunas. */}
        {def.bloco && rateioDentro && (temRateio ?? 0) > 0 && <>
          <Etiqueta texto="rateio" cor={AMBAR} title="inclui rateio compartilhado" />
          <PontoRateio />
        </>}
      </td>

      {culturas.map(c => {
        const l = c.linhas[def.chave];
        const v = valorDaLinha(l, def);
        const rat = def.bloco && rateioDentro ? (l.rateado ?? 0) : 0;
        const cor = def.faixa ? corDoTotal(def.faixa, v)
          : def.corPorSinal ? corDoSinal(v) : corLinha;
        /* ⚠ A LINHA DO RATEIO COMPARTILHADO ABRE O POOL INTEIRO (§2), com `p_chave` nulo. Ela só
           existe no modo "Custos diretos" — no outro o rateio está dentro dos centros e a linha
           some, junto com a pergunta que ela responde. */
        const ehPool = def.chave === 'rateio_compartilhado';
        const tipo = TIPO_DO_MODAL[def.chave];
        /* ⚠ DUAS PORTAS, NUNCA AS DUAS NA MESMA CÉLULA: o rateio administrativo abre o MODAL
           (ele é rateio e precisa dos dois passos desenhados); receita, deduções e juros abrem o
           DRAWER, porque cada um tem origem única e o que se quer ali é a lista. */
        const grupo = onDrill ? GRUPO_DO_DRAWER[def.chave] : undefined;
        const aoAbrir = ehPool ? () => abrir('natureza', null, def.rotulo, c.cultura)
          : tipo ? () => abrir(tipo, '', def.rotulo, c.cultura)
            : grupo && onDrill ? () => onDrill(grupo, def.rotulo, c.cultura)
              : undefined;
        return (
          <Fragment key={c.cultura}>
            {/* ⚠ AS TRÊS CÉLULAS ABREM A MESMA LISTA (§5), e não só a de R$: são a MESMA linha
                lida em três unidades. Clicar em "16.046,42 /ha" e nada acontecer ensina que a
                tabela é inerte — e o operador para de tentar na célula que funcionaria. */}
            {/* ⚠ CADA CHIP MARCADO É UMA CÉLULA — DRE-UNIDADES-01. A divisa do grupo de colunas
                vai na PRIMEIRA que existir: com o R$ desmarcado, ela passa para o R$/ha. */}
            {unidades.includes('rs') && (
              <Celula valor={v} cor={cor} destaque={def.destaque} fonte={regua.fonte}
                faixa={daFaixa?.fundo} marcador={marcador(v)}
                bordaEsquerda onAbrir={aoAbrir} />
            )}
            {unidades.includes('ha') && (
              <CelulaUnit texto={porUnidade(v, c.area_ha)} cor={cor} destaque={def.destaque}
                bordaEsquerda={unidades[0] === 'ha'}
                faixa={daFaixa?.fundo} marcador={marcador(v)}
                fonte={regua.fonte} onAbrir={aoAbrir} />
            )}
            {unidades.includes('un') && (
              <CelulaUnit texto={porUnidade(v, c.producao)} cor={cor} destaque={def.destaque}
                bordaEsquerda={unidades[0] === 'un'}
                faixa={daFaixa?.fundo} marcador={marcador(v)}
                fonte={regua.fonte} onAbrir={aoAbrir} />
            )}
          </Fragment>
        );
      })}

      {/* ⚠ A COLUNA TOTAL NÃO ABRE MODAL: `fn_painel_rateio_detalhe` recebe `p_cultura` e não
          aceita "todas" — abrir com uma cultura arbitrária mostraria o detalhe errado sob o
          número certo. Ela fica de leitura até o drill do PR-02. */}
      {/* ⚠ A COLUNA TOTAL EM CINZA CLARO E COM BORDA DE 2px: ela responde pela safra inteira e
          estava lendo como mais um grupo de cultura. O fundo é do `style` e não de classe porque
          precisa perder para a zebra e para o `bg-muted` do subtotal, que vêm na linha. */}
      {!semTotal && <>
        {unidades.includes('rs') && (
          <Celula valor={valorDaLinha(tot, def)} cor={corDoTotalDaSafra}
            faixa={daFaixa?.fundo} marcador={marcador(valorDaLinha(tot, def))}
            destaque={def.destaque} fonte={regua.fonte} total />
        )}
        {unidades.includes('ha') && (
          <CelulaUnit texto={porUnidade(valorDaLinha(tot, def), dre.total.area_ha)}
            cor={corDoTotalDaSafra}
            faixa={daFaixa?.fundo} marcador={marcador(valorDaLinha(tot, def))}
            destaque={def.destaque} fonte={regua.fonte}
            total />
        )}
        {totalEmTraco(unidades) && (
          <CelulaUnit texto={traco} cor="" destaque={def.destaque} fonte={regua.fonte}
            faixa={daFaixa?.fundo}
            total title={TOTAL_SEM_SOMA} />
        )}
      </>}
    </tr>
  );
}

/**
 * A FILHA DE RATEIO DE UM GRUPO — a parcela compartilhada que os centros não mostram.
 *
 * ⚠ ELA É LEITURA, NÃO CONTA: o número é `linhas.<grupo>.rateado`, que a RPC já devolve por
 * cultura e no total. O front não soma nem subtrai nada aqui.
 * ⚠ E ELA ABRE DESDE O PR-09. No PR-08 ficou sem clique porque a RPC só sabia devolver o pool de
 * `custeio + pos_colheita`; a migration `20261027120500` deu a ela `pool_fixo` e
 * `pool_investimento`, e o `p_tipo` passou a dizer de qual bloco é o pool. Mesmo modal do PR-07.
 */
const TIPO_DO_POOL: Partial<Record<ChaveLinha, TipoRateio>> = {
  custo_fixo: 'pool_fixo',
  investimento: 'pool_investimento',
};
/** O nome do bloco no título, para o modal não dizer só "Rateio compartilhado" duas vezes. */
const BLOCO_NO_TITULO: Partial<Record<ChaveLinha, string>> = {
  custo_fixo: 'Custo fixo',
  investimento: 'Investimento',
};

function LinhaRateioDoGrupo({ chave, dre, culturas, unidades, semTotal, abrir }: {
  chave: ChaveLinha;
  dre: DreLavoura;
  culturas: DreCultura[];
  unidades: readonly UnidadeLav[];
  semTotal?: boolean;
  abrir: AbrirRateio;
}) {
  const totalRateado = dre.total.linhas[chave].rateado ?? 0;
  const tipo = TIPO_DO_POOL[chave];
  const rotulo = `(−) Rateio compartilhado · ${BLOCO_NO_TITULO[chave] ?? ''}`;
  return (
    <tr className="bg-card" style={{ height: REGUA_LINHA.filha.altura }}>
      <td className={cn('sticky left-0 z-10 truncate border-r border-t border-dashed border-border/60',
        'bg-card py-px', VERMELHO)}
        style={{ fontSize: REGUA_LINHA.filha.fonte,
          paddingLeft: 7 + REGUA_LINHA.filha.recuo, paddingRight: 7 }}
        title="(−) Rateio compartilhado — estimado, rateado por área">
        (−) Rateio compartilhado
        <Etiqueta texto="estimado" title="rateado por área — estimativa, não lançamento" />
      </td>

      {culturas.map(c => {
        const r = c.linhas[chave].rateado ?? 0;
        return (
          <Fragment key={c.cultura}>
            {unidades.includes('rs') && (
              <Celula filha valor={r} cor={VERMELHO} fonte={REGUA_LINHA.filha.fonte}
                bordaEsquerda fundo="bg-card"
                onAbrir={tipo ? () => abrir(tipo, null, rotulo, c.cultura) : undefined} />
            )}
            {unidades.includes('ha') && (
              <CelulaUnit filha texto={porUnidade(r, c.area_ha)} cor={VERMELHO}
                bordaEsquerda={unidades[0] === 'ha'}
                fonte={REGUA_LINHA.filha.fonte} fundo="bg-card"
                onAbrir={tipo ? () => abrir(tipo, null, rotulo, c.cultura) : undefined} />
            )}
            {unidades.includes('un') && (
              <CelulaUnit filha texto={porUnidade(r, c.producao)} cor={VERMELHO}
                bordaEsquerda={unidades[0] === 'un'}
                fonte={REGUA_LINHA.filha.fonte} fundo="bg-card"
                onAbrir={tipo ? () => abrir(tipo, null, rotulo, c.cultura) : undefined} />
            )}
          </Fragment>
        );
      })}

      {!semTotal && <>
        {unidades.includes('rs') && (
          <Celula filha valor={totalRateado} cor={VERMELHO} fonte={REGUA_LINHA.filha.fonte}
            total fundo="bg-card" />
        )}
        {unidades.includes('ha') && (
          <CelulaUnit filha texto={porUnidade(totalRateado, dre.total.area_ha)} cor={VERMELHO}
            fonte={REGUA_LINHA.filha.fonte} total fundo="bg-card" />
        )}
        {totalEmTraco(unidades) && (
          <CelulaUnit filha texto={traco} cor="" fonte={REGUA_LINHA.filha.fonte}
            total fundo="bg-card" title={TOTAL_SEM_SOMA} />
        )}
      </>}
    </tr>
  );
}

/** Uma filha: o centro de custo dentro do grupo aberto. */
function LinhaCentro({ centro, culturas, rateioDentro, unidades, areaTotal, abrir, semTotal }: {
  centro: DreCentro; culturas: DreCultura[];
  rateioDentro: boolean; unidades: readonly UnidadeLav[]; areaTotal: number; abrir: AbrirRateio;
  semTotal?: boolean;
}) {
  /* ⚠ SOLO DESTACADO, e só ele: é a formação de área — o dinheiro que vira terra plantável e
     não volta nesta safra. O âmbar diz "leia esta linha antes de comparar o investimento". */
  const solo = centro.bloco === 'investimento' && /solo/i.test(centro.centro);
  const fundo = solo ? '' : 'bg-card';
  const estilo = solo ? { backgroundColor: '#fbf3e6' } : undefined;
  const tipo: TipoRateio = centro.bloco === 'investimento' ? 'investimento' : 'natureza';
  const totalCentro = rateioDentro ? centro.total.valor : centro.total.direto;
  const regua = REGUA_LINHA.filha;
  /* ⚠ UMA BOLINHA POR LINHA, não uma por coluna: ela diz que AQUELE CENTRO tem rateio dentro, e
     isso é um fato da linha. Repetida célula a célula, virava ruído e desalinhava os números. */
  const temRateioAqui = rateioDentro
    && (centro.total.rateado > 0 || culturas.some(c => (centro.por_cultura[c.cultura]?.rateado ?? 0) > 0));

  return (
    <tr className={fundo} style={{ height: regua.altura, ...estilo }}>
      <td className={cn('sticky left-0 z-10 truncate border-r border-t border-dashed border-border/60',
        'py-px', fundo)}
        style={{
          fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7,
          ...estilo, ...(solo ? { color: '#8a5a1e', fontWeight: 600 } : undefined),
        }}
        title={centro.centro}>
        {centro.centro}
        {temRateioAqui && <PontoRateio />}
      </td>

      {culturas.map(c => {
        const p = centro.por_cultura[c.cultura];
        const v = p ? (rateioDentro ? p.valor : p.direto) : null;
        return (
          <Fragment key={c.cultura}>
            {/* ⚠ FILHO DE SAÍDA É VERMELHO, SEM EXCEÇÃO POR BLOCO (§4): os centros de investimento
                ficavam em cinza herdado, e Infraestrutura com 5,9 milhões lia como nota de
                rodapé ao lado dos custeios vermelhos. Investimento é dinheiro que saiu.
                ⚠ O FUNDO ÂMBAR DO SOLO NÃO MUDA — ele marca a formação de área, não o sinal. */}
            {unidades.includes('rs') && (
              <Celula filha valor={v} cor={VERMELHO} fonte={regua.fonte}
                bordaEsquerda fundo={fundo} estilo={estilo}
                onAbrir={() => abrir(tipo, centro.centro, centro.centro, c.cultura)} />
            )}
            {unidades.includes('ha') && (
              <CelulaUnit filha texto={porUnidade(v, c.area_ha)} cor={VERMELHO} fonte={regua.fonte}
                bordaEsquerda={unidades[0] === 'ha'} fundo={fundo} estilo={estilo} />
            )}
            {unidades.includes('un') && (
              <CelulaUnit filha texto={porUnidade(v, c.producao)} cor={VERMELHO} fonte={regua.fonte}
                bordaEsquerda={unidades[0] === 'un'} fundo={fundo} estilo={estilo} />
            )}
          </Fragment>
        );
      })}

      {!semTotal && <>
        {unidades.includes('rs') && (
          <Celula filha valor={totalCentro} cor={VERMELHO} fonte={regua.fonte}
            total fundo={fundo} estilo={estilo} />
        )}
        {unidades.includes('ha') && (
          <CelulaUnit filha texto={porUnidade(totalCentro, areaTotal)} cor={VERMELHO}
            fonte={regua.fonte} total fundo={fundo} estilo={estilo} />
        )}
        {totalEmTraco(unidades) && (
          <CelulaUnit filha texto={traco} cor="" fonte={regua.fonte}
            total fundo={fundo} estilo={estilo} title={TOTAL_SEM_SOMA} />
        )}
      </>}
    </tr>
  );
}

/* ─────────────────────── AS CÉLULAS ─────────────────────── */

/* ═══════════════════════════ O HISTÓRICO DA CULTURA ═══════════════════════════ */

/**
 * Uma linha por safra em que a cultura teve área plantada — a régua do ciclo ao longo do tempo.
 *
 * ⚠ ZERO CONTA AQUI, nem as divisões: `fn_dre_lavoura_historico` devolve `/ha`, `/unidade`, o
 * equilíbrio e o `delta_resultado_ha` prontos. O delta em especial NÃO poderia ser do front sem
 * reordenar as safras por data — e reordenar é o tipo de passo que diverge calado.
 * ⚠ A ORDEM É CRESCENTE POR `data_inicio`, como a RPC devolve: o histórico se lê do passado para
 * o presente, e a safra aberta é a última linha, marcada.
 */
function HistoricoCultura({ safras, carregando, cultura, safraAtual, onEscolher }: {
  safras: SafraHistorico[];
  carregando: boolean;
  cultura: string;
  safraAtual: string;
  onEscolher: (codigo: string) => void;
}) {
  const un = simboloDaUnidade(cultura);
  /* ⚠ px FIXOS E `nowrap`, a mesma régua da grade e pelo mesmo motivo: número partido no meio
     desalinha a coluna inteira. A última coluna absorve a sobra. */
  const cols = [90, 70, 70, 96, 80, 96, 96, 96, 96];
  const cabecalhos: [string, string][] = [
    ['Safra', ''], ['Área', 'ha'], ['Produtividade', `${un}/ha`],
    ['Custo op.', 'R$/ha'], ['Custo', `R$/${un}`],
    ['Preço realizado', `R$/${un}`], ['Preço equilíbrio', `R$/${un}`],
    ['Resultado', 'R$/ha'], ['Δ vs anterior', 'R$/ha'],
  ];
  const th = cn(CINZA_CABECALHO, 'sticky px-[7px] text-right text-white');

  return (
    <div className="overflow-auto rounded-lg border border-border/60 bg-card"
      style={{ maxHeight: 'calc(100vh - 212px)' }}>
      {carregando ? (
        <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
        </div>
      ) : safras.length === 0 ? (
        <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
          Nenhuma safra com esta cultura plantada.
        </div>
      ) : (
        <table className="border-collapse text-[11px] leading-none"
          style={{ tableLayout: 'fixed', width: '100%', minWidth: cols.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            {cols.map((w, i) => <col key={i} style={{ width: w }} />)}
            <col />
          </colgroup>
          <thead>
            <tr style={{ height: 26 }}>
              {cabecalhos.map(([nome], i) => (
                <th key={nome} className={cn(th, 'top-0 z-20', i === 0 && 'text-left')}
                  style={{ top: 0 }}>
                  <span className="text-[10px] font-medium leading-none">{nome}</span>
                </th>
              ))}
              <th className={cn(CINZA_CABECALHO, 'sticky z-20')} style={{ top: 0 }} />
            </tr>
            <tr style={{ height: 14 }}>
              {cabecalhos.map(([nome, un2], i) => (
                <th key={nome} className={cn(th, 'z-20', i === 0 && 'text-left')} style={{ top: 26 }}>
                  <span className="text-[10px] font-normal leading-none">{un2}</span>
                </th>
              ))}
              <th className={cn(CINZA_CABECALHO, 'sticky z-20')} style={{ top: 26 }} />
            </tr>
          </thead>
          <tbody>
            {safras.map(s => {
              const atual = s.safra === safraAtual;
              const td = cn('whitespace-nowrap px-[7px] py-px text-right tabular-nums',
                atual && 'bg-muted font-semibold');
              return (
                /* ⚠ CLICAR NUMA SAFRA TROCA O SLOT, não abre nada: o histórico é a porta de
                   entrada para o ciclo anterior, e a tela inteira se recarrega naquela safra. */
                <tr key={s.safra} onClick={() => onEscolher(s.safra)}
                  title={`ver a safra ${s.safra}`}
                  className={cn('cursor-pointer hover:bg-muted/60', atual ? 'bg-muted' : 'bg-card')}
                  style={{ height: 18 }}>
                  <td className={cn(td, 'text-left')}>
                    {s.safra}
                    {/* ⚠ "em dia" MUDO, EM MUTED: ele diz qual linha os cartões acima descrevem,
                        sem competir com os números — é marca, não aviso. */}
                    {atual && <span className="ml-1 font-normal text-muted-foreground">· em dia</span>}
                  </td>
                  <td className={td}>{formatNum(s.area_ha, 2)}</td>
                  <td className={td}>{s.producao > 0 ? formatNum(s.produtividade, 2) : traco}</td>
                  <td className={cn(td, 'text-destructive')}>{formatNum(s.custo_ha, 2)}</td>
                  <td className={cn(td, 'text-destructive')}>{formatNum(s.custo_unidade, 2)}</td>
                  <td className={cn(td, 'text-success')}>
                    {s.preco_realizado == null ? traco : formatNum(s.preco_realizado, 2)}
                  </td>
                  <td className={td}>
                    {s.preco_equilibrio == null ? traco : formatNum(s.preco_equilibrio, 2)}
                  </td>
                  <td className={cn(td, corDoSinal(s.resultado_ha))}>{formatNum(s.resultado_ha, 2)}</td>
                  {/* ⚠ "—" NA PRIMEIRA SAFRA, e sem cor: não há anterior contra o que comparar.
                      Zero diria "não mudou", que é uma afirmação — e falsa. */}
                  <td className={cn(td, corDoSinal(s.delta_resultado_ha))}>
                    {s.delta_resultado_ha == null ? traco : formatNum(s.delta_resultado_ha, 2)}
                  </td>
                  <td className={atual ? 'bg-muted' : 'bg-card'} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
