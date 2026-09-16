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
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { supabase } from '@/integrations/supabase/client';
import { RateioDetalheModal, type RateioDetalhe, type TipoRateio } from '@/components/agri/RateioDetalheModal';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { simboloDaUnidade, descricaoDaUnidade } from '@/lib/agri/colheita';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { useColheita } from '@/hooks/useColheita';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { usePainelSafra, useComparativoSafras } from '@/hooks/usePainelSafra';
import { ProducaoSafraPanel } from '@/components/agri/ProducaoSafraPanel';
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
const W_CULTURA = 240;
const W_RS = 104;      // R$ por cultura
const W_HA = 76;       // R$/ha
const W_UN = 60;       // R$/unidade
const W_RS_TOTAL = 108;

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
  { chave: 'receita_liquida',        rotulo: '= Receita líquida',               tom: 'receita', destaque: 'subtotal' },
  { chave: 'custeio',                rotulo: '(−) Custeio da lavoura',          tom: 'custo', bloco: 'custeio' },
  { chave: 'pos_colheita',           rotulo: '(−) Pós-colheita',                tom: 'custo', bloco: 'pos_colheita' },
  { chave: 'rateio_compartilhado',   rotulo: '(−) Rateio compartilhado',        tom: 'custo', etiqueta: 'estimado', someComRateioDentro: true },
  { chave: 'custo_variavel',         rotulo: '= Custo variável',                tom: 'custo', destaque: 'sub' },
  { chave: 'margem_contribuicao',    rotulo: '= Margem de contribuição',        tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'custo_fixo',             rotulo: '(−) Custo fixo da lavoura',       tom: 'custo', bloco: 'fixo' },
  { chave: 'rateio_admin',           rotulo: '(−) Rateio administrativo',       tom: 'custo', etiqueta: 'estimado' },
  { chave: 'resultado_operacional',  rotulo: '= Resultado operacional',         tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'juros',                  rotulo: '(−) Despesas financeiras (juros)', tom: 'custo' },
  { chave: 'resultado_caixa',        rotulo: '= Resultado de caixa',            tom: 'neutro', destaque: 'subtotal', corPorSinal: true },
  { chave: 'investimento',           rotulo: 'Investimento no período',         tom: 'neutro', bloco: 'investimento' },
  { chave: 'depreciacao',            rotulo: 'Depreciação (reservada · o custo operacional total = efetivo + depreciação nasce aqui)', tom: 'neutro' },
];

/** Onde entra a faixa "abaixo da linha de caixa". */
const APOS_CAIXA: ChaveLinha = 'resultado_caixa';

/** As chaves que o modal do Painel sabe abrir, e com que `tipo`. */
const TIPO_DO_MODAL: Partial<Record<ChaveLinha, 'admin'>> = { rateio_admin: 'admin' };

/**
 * O VERDE DOS VALORES POSITIVOS — e ele NÃO é `text-success`.
 *
 * ⚠ MEDIDO: `--success` é hsl(145 63% 42%) = rgb(40,175,96), um verde claro que, em 11px sobre
 * `bg-card`, lê como cinza-esverdeado ao lado do vermelho. `green-700` (#15803d) é o verde que a
 * Conciliação usa para o mesmo significado — dinheiro que entrou —, e as duas telas passam a
 * dizer a mesma coisa com a mesma cor.
 * ⚠ `--success` CONTINUA VÁLIDO NA CASA e não foi tocado: a troca é desta grade, onde o tamanho
 * da fonte é o problema, não do token.
 */
const VERDE = 'text-green-700';
const VERDE_70 = 'text-green-700/70';

const corDoTom = (tom: DefLinha['tom']) =>
  (tom === 'receita' ? VERDE : tom === 'custo' ? 'text-destructive' : '');

/** ⚠ A COR DO SUBTOTAL VEM DO PRÓPRIO NÚMERO, célula a célula: numa safra o amendoim pode fechar
    positivo e a mandioca negativa, e uma cor só para a linha mentiria sobre uma das duas. */
const corDoSinal = (v: number | null) =>
  (v == null ? '' : v < 0 ? 'text-destructive' : VERDE);

const traco = '—';
/** Com "R$" — para a faixa, os títulos e os `title`, onde não há cabeçalho declarando a unidade. */
const dinheiro = (v: number | null | undefined) => (v == null ? traco : formatMoeda(v));
/**
 * SEM "R$" — só dentro da grade, e a razão é a régua, medida no harness.
 *
 * ⚠ A UNIDADE JÁ ESTÁ NO CABEÇALHO: a segunda linha do thead é literalmente "R$ | R$/ha | R$/sc".
 * Repeti-la em cada célula não acrescenta informação e custa 17px por número — e a coluna tem
 * 104px, dos quais 90 são úteis. Medido: "R$ 2.925.162,25" ocupa 90,1px (estoura por 0,1px já no
 * dado real do NJ) e "R$ 12.345.678,90" ocupa 97,3px. Sem o prefixo, os mesmos números dão 73,1 e
 * 80,2 — e até 123.456.789,01 cabe, com 87,3. A régua de 104px do briefing só fecha assim.
 * ⚠ E ISTO NÃO É "NÚMERO CRU" (A19): dinheiro sem unidade é o que a regra proíbe, e aqui a
 * unidade é declarada uma vez, no alto da coluna, em vez de repetida mil vezes embaixo dela.
 */
const numeroDaCelula = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
/* ⚠ DATAS FATIADAS DA STRING, NUNCA POR `new Date('2025-11-10')`: essa forma é interpretada
   como UTC e, em fuso negativo, volta um dia — "09/11" para quem plantou em 10/11. O banco
   devolve `date` como 'YYYY-MM-DD', e o que a régua mostra é exatamente o que está lá. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mesCurto = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1] ?? '—'}/${d.slice(0, 4)}`;

/** ⚠ DIVISÃO É A ÚNICA CONTA QUE O CONTRATO DEIXA AQUI. Denominador zero vira traço, não Infinity. */
const porUnidade = (v: number | null | undefined, den: number) =>
  (v == null || !(den > 0) ? traco : formatNum(v / den, 2));

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
   * quem volta de uma tela global (V2Index:1531 diz isso com todas as letras). Quem recarrega o
   * /v2 cai em `home`, hoje, em QUALQUER seção. O que este PR pode garantir — e garante — é que
   * a volta a Executivo › DRE reabre a mesma safra e a mesma cultura.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const safraId = searchParams.get('safra') ?? '';
  const cultura = searchParams.get('cultura') ?? '';

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
  const abrirCultura = useCallback((c: string) => {
    mexerNaUrl(p => { p.set('cultura', c); });
  }, [mexerNaUrl]);
  const voltarParaRaiz = useCallback(() => {
    mexerNaUrl(p => { p.delete('cultura'); });
  }, [mexerNaUrl]);

  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId, setSafraId]);

  const { dre, carregando, erro, recarregar: recarregarDre } = useDreLavoura(clienteId, safraId || null);

  /* ⚠ TRÊS CONTROLES DE APRESENTAÇÃO, e nenhum deles refaz consulta: o payload já traz `direto`,
     `rateado` e `valor` em cada linha. Trocar de modo é escolher qual ler. */
  const [rateioDentro, setRateioDentro] = useState(false);
  const [mostrarUnitarios, setMostrarUnitarios] = useState(true);
  const [ampliado, setAmpliado] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  /* ⚠ A ABA É ESTADO DE TELA, não de URL: ela não muda o QUE se vê (a safra e a cultura mudam),
     só o ângulo. Pôr mais um parâmetro na barra por causa dela seria ruído no link que o
     operador copia. Volta a 'resultado' ao trocar de cultura — ver o efeito abaixo. */
  const [aba, setAba] = useState<'resultado' | 'producao' | 'historico'>('resultado');
  useEffect(() => { setAba('resultado'); }, [cultura]);

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
    { dados: RateioDetalhe; tipo: TipoRateio; titulo: string } | null>(null);

  const abrir = (tipo: TipoRateio, chave: string, rotulo: string, cultura: string) => {
    if (!clienteId || !safraId) return;
    void (async () => {
      const { data } = await (supabase as any).rpc('fn_painel_rateio_detalhe', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
        p_tipo: tipo, p_chave: chave,
      });
      const d = data as RateioDetalhe | null;
      if (!d || (tipo !== 'admin' && d.pool <= 0)) return;
      const s = safras.find(x => x.id === safraId);
      setRateio({
        dados: d, tipo,
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

  const abrirLancamento = async (id: string) => {
    const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('*').eq('id', id).maybeSingle();
    const linha: LancamentoV2 | null = data ?? null;
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

  /** O valor de um grupo no modo escolhido: `direto` em linha própria, `valor` com rateio dentro. */
  const valorDaLinha = (l: DreValor, def: DefLinha): number | null =>
    (rateioDentro || !def.bloco ? l.valor : (l.direto ?? l.valor));

  const colsPorCultura = mostrarUnitarios ? 3 : 1;

  /** O que aparece no cartão: a grade só some quando o drill está em Produção ou Histórico. */
  const mostraGrade = !culturaAberta || aba === 'resultado' || ampliado;

  /** O contexto da régua — um por tela, e a régua não sabe qual delas está aberta. */
  const contextoDaTela = culturaAberta ? contexto
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
  useLayoutEffect(() => {
    const medir = () => {
      const el = cartao.current;
      if (!el) { setAlturaCartao(null); return; }
      const topo = el.getBoundingClientRect().top;
      setAlturaCartao(Math.max(120, Math.round(window.innerHeight - topo - 8)));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [ampliado, culturaAberta, aba, mostrarUnitarios, rateioDentro, dre]);


  if (!dre && !carregando && !erro) return null;

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
        <div className="flex h-[24px] shrink-0 items-center justify-end">
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
            {culturaAberta && (
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
              <div className="flex h-[22px] overflow-hidden rounded-md border">
                {(['Lavoura', 'Pecuária', 'Consolidado'] as const).map(a => (
                  <button key={a} type="button" disabled={a !== 'Lavoura'}
                    title={a === 'Lavoura' ? undefined : 'em breve'}
                    className={cn('px-2 text-[10px] font-medium transition-colors',
                      a === 'Lavoura' ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground disabled:opacity-50')}>
                    {a}
                  </button>
                ))}
              </div>
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
              {/* ⚠ O SLOT DE CULTURA SÓ APARECE NO DRILL: na raiz todas as culturas já estão na
                  grade, e um seletor ali significaria filtrar a comparação — que é o oposto do
                  que a raiz existe para fazer. */}
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
              <button type="button" onClick={() => setAmpliado(true)}
                title="Ampliar a grade (só a tabela)"
                className="inline-flex h-[22px] items-center gap-1 rounded-md border px-2 text-[10px] hover:bg-muted">
                <Maximize2 className="h-3 w-3" /> Ampliar
              </button>
            </div>
          </div>

          {culturaAberta
            ? <FaixaCultura c={culturaAberta} />
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
          {culturaAberta && (
            /* ⚠ A ALTURA É DO CONTÊINER, NÃO DOS BOTÕES, e o 1px da divisória mora DENTRO dela.
               Com `h-[26px]` nos botões e a borda no pai, a barra media 27 — e o cartão do drill
               descia 27 em vez de 26. `box-border` (padrão do Tailwind) faz a borda caber na
               altura declarada; os botões preenchem o que sobra. */
            <div className="flex h-[26px] gap-3 border-b border-border/60">
              {(['resultado', 'producao', 'historico'] as const).map(v => (
                <button key={v} type="button" onClick={() => setAba(v)}
                  className={cn('h-full px-1 text-[11px] transition-colors',
                    aba === v
                      ? 'border-b-2 border-primary font-medium text-foreground'
                      : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground')}>
                  {v === 'resultado' ? 'Resultado' : v === 'producao' ? 'Produção' : 'Histórico'}
                </button>
              ))}
            </div>
          )}

          {mostraGrade && (
          <div className="flex h-[18px] flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>
              {formatNum(poolTotal, 2)} em custos comuns rateados por área — estimativa, não lançamento.
              {rateioDentro && <> {' · '}<span className="text-amber-700">●</span> ao lado do valor = tem rateio dentro.</>}
            </span>
            <span className="flex items-center gap-2">
              Rateio compartilhado:
              <span className="flex h-[22px] overflow-hidden rounded-md border">
                {([[false, 'em linha própria'], [true, 'dentro dos centros']] as const).map(([v, r]) => (
                  <button key={r} type="button" onClick={() => setRateioDentro(v)}
                    className={cn('px-2 text-[10px] font-medium transition-colors',
                      rateioDentro === v ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                    {r}
                  </button>
                ))}
              </span>
              <span className="flex items-center gap-1">
                <Checkbox checked={mostrarUnitarios}
                  onCheckedChange={c => setMostrarUnitarios(c === true)} />
                <Label className="text-[10px] font-normal">/ha e /sc</Label>
              </span>
            </span>
          </div>
          )}
          </div>
        </>
      )}

      {/* ⚠ PRODUÇÃO E HISTÓRICO NÃO ENTRAM NO CARTÃO DA GRADE: cada um traz as próprias tabelas,
          com o próprio scroll. Empilhá-los dentro do cartão do DRE daria dois scrollports. */}
      {culturaAberta && aba === 'producao' && !ampliado && (
        <ProducaoSafraPanel painel={painel} totaisTalhoes={totaisTalhoes}
          comparadas={comparadas} safraId={safraId || null} />
      )}
      {culturaAberta && aba === 'historico' && !ampliado && (
        <HistoricoCultura safras={historico} carregando={carregandoHist}
          cultura={cultura} safraAtual={safraAtual?.codigo || safraAtual?.nome || ''}
          onEscolher={cod => {
            const alvo = safras.find(x => (x.codigo || x.nome) === cod);
            if (alvo) setSafraId(alvo.id);
          }} />
      )}

      {/* ⚠ UM SCROLLPORT SÓ, e é o cartão: o cabeçalho gruda dentro dele (`sticky`) e a coluna
          Cultura gruda à esquerda. Duas barras fariam rolar a de dentro sem mover o cabeçalho. */}
      {mostraGrade && (
      <div ref={cartao} className="overflow-auto rounded-lg border border-border/60 bg-card"
        style={alturaCartao ? { maxHeight: alturaCartao } : undefined}>
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
            rateioDentro={rateioDentro} mostrarUnitarios={mostrarUnitarios}
            colsPorCultura={colsPorCultura} centrosDoBloco={centrosDoBloco}
            valorDaLinha={valorDaLinha} abrir={abrir}
            onAbrirCultura={culturaAberta ? undefined : abrirCultura}
            onDrill={(chave, rotulo, cult) => setDrill({ chave, rotulo, cultura: cult })} />
        )}
      </div>
      )}

      {/* ⚠ SÓ APARECE COM SOBRA: `nao_apropriado` zero significa que toda cultura lançada está
          plantada nesta safra — e um aviso permanente ensinaria a ignorá-lo. */}
      {!!dre && dre.nao_apropriado.total > 0 && (
        <p className="text-[10px] text-amber-700">
          {formatMoeda(dre.nao_apropriado.total)} em lançamentos com cultura que não está plantada
          nesta safra — fora do DRE até ajustar.
        </p>
      )}

      {rateio && (
        <RateioDetalheModal aberto onFechar={() => setRateio(null)}
          titulo={rateio.titulo} dados={rateio.dados} tipo={rateio.tipo}
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

      <LancamentoV2Dialog
        open={!!editando}
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
    { rotulo: 'Custo operacional /ha', valor: custoHa == null ? traco : formatNum(custoHa, 2),
      unidade: custoHa == null ? undefined : 'R$/ha', cor: 'text-destructive',
      title: custoHa == null ? undefined : formatMoeda(custoHa) },
    /* ⚠ `null` É "—", NUNCA "0,00": a mandioca da 25/26 chega com os três nulos porque não
       colheu. "0,00 R$/t" seria um preço — uma afirmação, e falsa. */
    { rotulo: 'Preço de equilíbrio',
      valor: eq.preco_equilibrio == null ? traco : formatNum(eq.preco_equilibrio, 2),
      unidade: eq.preco_equilibrio == null ? undefined : `R$/${un}`,
      title: eq.preco_realizado == null ? peso
        : `realizado ${formatNum(eq.preco_realizado, 2)} R$/${un} · ${peso}` },
    { rotulo: 'Prod. de equilíbrio',
      valor: eq.produtividade_equilibrio == null ? traco
        : formatNum(eq.produtividade_equilibrio, 2),
      unidade: eq.produtividade_equilibrio == null ? undefined : `${un}/ha`,
      title: temColheita ? `realizada ${formatNum(c.produtividade, 2)} ${un}/ha · ${peso}` : peso },
  ];
  return <Caixas caixas={caixas} />;
}

interface CaixaFaixa {
  rotulo: string;
  valor: string;
  /** A unidade sai do valor e vira 10px muted ao lado — "185,00" + "ha". */
  unidade?: string;
  cor?: string;
  title?: string;
}

/**
 * As seis caixas, desenhadas uma vez só — a raiz e o drill mudam o conteúdo, nunca a régua.
 *
 * ⚠ SEM "R$" NA CAIXA, e a razão é a mesma da grade, por outro caminho: lá a unidade está no
 * cabeçalho da coluna; aqui está no RÓTULO ("Receita líquida" não precisa dizer que é dinheiro).
 * O prefixo custava 17px por número em caixas que, a 1168px, têm ~180px — e era ele que fazia
 * "Custo operacional efetivo" truncar.
 * ⚠ E O QUE EXPLICA VAI PARA O `title`: "a pagar 136.277,79" dentro da caixa disputava espaço com
 * o número que a caixa existe para mostrar.
 */
function Caixas({ caixas }: { caixas: CaixaFaixa[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
      {caixas.map(c => (
        <div key={c.rotulo} className="min-w-0 rounded-md border border-border/60 bg-card"
          style={{ height: 32, padding: '3px 10px' }} title={c.title}>
          <div className="truncate text-[10px] leading-none text-muted-foreground">{c.rotulo}</div>
          <div className="mt-0.5 flex items-baseline gap-1 overflow-hidden whitespace-nowrap leading-none">
            <span className={cn('text-[14px] font-medium tabular-nums', c.cor)}>{c.valor}</span>
            {c.unidade && <span className="truncate text-[10px] text-muted-foreground">{c.unidade}</span>}
          </div>
        </div>
      ))}
    </div>
  );
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
    { rotulo: 'Resultado de caixa', valor: numeroDaCelula(res), unidade: 'R$', cor: corDoSinal(res) },
    { rotulo: 'Resultado por hectare', valor: numeroDaCelula(resHa),
      unidade: resHa == null ? undefined : 'R$/ha', cor: corDoSinal(resHa) },
    /* ⚠ AQUI É O `pct_direto` DO TOTAL (66 no NJ 25/26), não o de uma cultura (70 no amendoim).
       São dois números certos em dois lugares: esta caixa descreve a safra inteira. */
    { rotulo: 'Custos apropriados direto', valor: formatNum(t.pct_direto, 0), unidade: '%' },
  ];
  return <Caixas caixas={caixas} />;
}

/* ═══════════════════════════════ A GRADE ═══════════════════════════════ */

/** O que um clique num valor precisa dizer para o modal do Painel. */
type AbrirRateio = (tipo: TipoRateio, chave: string, rotulo: string, cultura: string) => void;

interface PropsGrade {
  dre: DreLavoura;
  culturas: DreCultura[];
  abertos: Record<string, boolean>;
  setAbertos: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  rateioDentro: boolean;
  mostrarUnitarios: boolean;
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

/** Divisória entre grupos de coluna — a mesma nas duas linhas do cabeçalho e no corpo. */
const DIVISOR = '1px solid rgba(255,255,255,.22)';

function Grade({
  dre, culturas, abertos, setAbertos, rateioDentro, mostrarUnitarios,
  colsPorCultura, centrosDoBloco, valorDaLinha, abrir, semTotal, onAbrirCultura, onDrill,
}: PropsGrade) {
  /* ⚠ A RÉGUA NASCE UMA VEZ E SERVE AO `<colgroup>` E À LARGURA MÍNIMA. Escrever as larguras no
     `<col>` e repeti-las no `style` de cada `<td>` é o caminho conhecido para as duas listas
     divergirem — com `table-layout: fixed` o `<colgroup>` já é a única autoridade. */
  const larguras = useMemo(() => {
    const cols: number[] = [W_CULTURA];
    culturas.forEach(() => {
      cols.push(W_RS);
      if (mostrarUnitarios) cols.push(W_HA, W_UN);
    });
    if (!semTotal) {
      cols.push(W_RS_TOTAL);
      if (mostrarUnitarios) cols.push(W_HA);
    }
    return cols;
  }, [culturas, mostrarUnitarios, semTotal]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);
  const colsTotal = mostrarUnitarios ? 2 : 1;
  /** +1 da coluna vazia final, que absorve a sobra. */
  const nColunas = larguras.length + 1;

  const alterna = (k: string) => setAbertos(a => ({ ...a, [k]: !a[k] }));

  return (
    /* ⚠ `leading-none` NA TABELA INTEIRA, e é ele que faz a régua valer. Medido no harness: sem
       ele o `line-height` herdado (1,5) dá 16,5px de caixa de texto num `text-[11px]`, e a linha
       fechava em 18,5px com `height: 18` declarado — porque `height` em `<tr>` é MÍNIMO, não
       máximo. A filha ia a 18px no lugar de 15, e a segunda linha do cabeçalho a 17 no lugar de
       14. Com `leading-none` o conteúdo fica menor que a altura declarada em todas elas, e a
       altura declarada passa a ser a que manda. */
    <table className="border-collapse text-[11px] leading-none"
      style={{ tableLayout: 'fixed', width: '100%', minWidth: larguraMin }}>
      <colgroup>
        {larguras.map((w, i) => <col key={i} style={{ width: w }} />)}
        {/* ⚠ SEM `width`: é ela que absorve a sobra quando o cartão é mais largo que a soma. */}
        <col />
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
              <div className="truncate text-[10px] font-medium leading-[12px]">
                {labelDaCultura(c.cultura)}
              </div>
              <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                {formatNum(c.area_ha, 1)} ha
              </div>
            </th>
          ))}
          {!semTotal && (
            <th colSpan={colsTotal}
              className={cn(CINZA_CABECALHO, 'sticky top-0 z-20 px-[7px] text-center text-white')}
              style={{ borderLeft: DIVISOR }}>
              <div className="text-[10px] font-medium leading-[12px]">Total</div>
              <div className="whitespace-nowrap text-[10px] font-normal leading-[12px] text-white">
                {formatNum(dre.total.area_ha, 1)} ha
              </div>
            </th>
          )}
          <th rowSpan={2} className={cn(CINZA_CABECALHO, 'sticky top-0 z-20')} />
        </tr>
        <tr style={{ height: 14 }}>
          {culturas.map(c => (
            <ThUnidade key={c.cultura} cultura={c.cultura} mostrarUnitarios={mostrarUnitarios} />
          ))}
          {!semTotal && <>
            <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
              style={{ top: 26, borderLeft: DIVISOR }}>R$</th>
            {mostrarUnitarios && (
              <th className={cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white')}
                style={{ top: 26 }}>R$/ha</th>
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
              {def.chave === 'investimento' && (
                <tr>
                  <td colSpan={nColunas}
                    className="border-t border-border/60 px-[7px] text-[10px] text-muted-foreground"
                    style={{ height: 17 }}>
                    Abaixo da linha de caixa — não entra no resultado do período
                  </td>
                </tr>
              )}
              <LinhaDre def={def} dre={dre} culturas={culturas} rateioDentro={rateioDentro}
                mostrarUnitarios={mostrarUnitarios} aberto={!!(def.bloco && abertos[def.bloco])}
                onAlternar={def.bloco ? () => alterna(def.bloco as string) : undefined}
                valorDaLinha={valorDaLinha} abrir={abrir} semTotal={semTotal} onDrill={onDrill} />
              {filhas.map(ct => (
                <LinhaCentro key={`${def.chave}:${ct.centro}`} centro={ct} culturas={culturas}
                  rateioDentro={rateioDentro} mostrarUnitarios={mostrarUnitarios}
                  areaTotal={dre.total.area_ha} abrir={abrir} semTotal={semTotal} />
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** A segunda linha do cabeçalho de UMA cultura — separada porque a unidade é dela, não da tela. */
function ThUnidade({ cultura, mostrarUnitarios }: { cultura: string; mostrarUnitarios: boolean }) {
  const cls = cn(CINZA_CABECALHO, 'sticky z-20 px-[7px] text-right text-[10px] font-normal text-white');
  return (
    <>
      <th className={cls} style={{ top: 26, borderLeft: DIVISOR }}>R$</th>
      {mostrarUnitarios && <>
        <th className={cls} style={{ top: 26 }}>R$/ha</th>
        {/* ⚠ A UNIDADE É DA CULTURA, não da tela: mandioca fecha em tonelada e amendoim em saca,
            e um "/sc" fixo faria a coluna da mandioca mentir sobre a própria grandeza.
            ⚠ E É O SÍMBOLO CURTO: a coluna tem 60px e "R$/sc 25kg" quebrava em duas linhas,
            empurrando a segunda linha do cabeçalho para além dos 14px. O peso foi para o
            `title`, onde não custa largura. */}
        <th className={cls} style={{ top: 26 }} title={descricaoDaUnidade(cultura)}>
          <span className="whitespace-nowrap">R$/{simboloDaUnidade(cultura)}</span>
        </th>
      </>}
    </>
  );
}

/* ─────────────────────── UMA LINHA DO DRE ─────────────────────── */

/** Fundo da linha — e ele tem de ser OPACO, porque a coluna Cultura gruda por cima do corpo. */
const fundoDaLinha = (d: DefLinha['destaque']) =>
  (d === 'subtotal' ? 'bg-muted' : d === 'sub' ? 'bg-muted/40' : 'bg-card');

/** Etiqueta pequena ao lado do rótulo — "estimado", "inclui rateio". */
function Etiqueta({ texto, cor }: { texto: string; cor?: string }) {
  return (
    <span className="ml-1 whitespace-nowrap rounded-[3px] border px-1 text-[9px] leading-[11px]"
      style={{ borderColor: cor ?? 'currentColor', color: cor }}>
      {texto}
    </span>
  );
}

const AMBAR = '#b45309';

function LinhaDre({
  def, dre, culturas, rateioDentro, mostrarUnitarios, aberto, onAlternar, valorDaLinha, abrir,
  semTotal, onDrill,
}: {
  def: DefLinha; dre: DreLavoura; culturas: DreCultura[];
  rateioDentro: boolean; mostrarUnitarios: boolean;
  aberto: boolean; onAlternar?: () => void;
  valorDaLinha: (l: DreValor, def: DefLinha) => number | null;
  abrir: AbrirRateio;
  semTotal?: boolean;
  onDrill?: (chave: string, rotulo: string, cultura: string) => void;
}) {
  const fundo = fundoDaLinha(def.destaque);
  const peso = def.destaque === 'subtotal' ? 'font-semibold'
    : def.destaque === 'sub' ? 'font-medium' : '';
  const corLinha = corDoTom(def.tom);
  const tot = dre.total.linhas[def.chave];
  /* ⚠ O RATEIO DO GRUPO SE MEDE NAS CULTURAS MOSTRADAS, não no total da safra: no drill só há
     uma coluna, e o total traria o rateio de culturas que não estão na tela. */
  const temRateio = def.bloco
    ? culturas.reduce((a, c) => a + (c.linhas[def.chave].rateado ?? 0), 0) : 0;

  return (
    <tr className={cn(fundo, peso)} style={{ height: 18 }}>
      <td className={cn('sticky left-0 z-10 truncate px-[7px] py-px', fundo,
        'border-r border-border/60', corLinha)}
        title={def.rotulo}>
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
        {def.bloco && rateioDentro && (temRateio ?? 0) > 0
          && <Etiqueta texto="inclui rateio" cor={AMBAR} />}
      </td>

      {culturas.map(c => {
        const l = c.linhas[def.chave];
        const v = valorDaLinha(l, def);
        const rat = def.bloco && rateioDentro ? (l.rateado ?? 0) : 0;
        const cor = def.corPorSinal ? corDoSinal(v) : corLinha;
        const tipo = TIPO_DO_MODAL[def.chave];
        /* ⚠ DUAS PORTAS, NUNCA AS DUAS NA MESMA CÉLULA: o rateio administrativo abre o MODAL
           (ele é rateio e precisa dos dois passos desenhados); receita, deduções e juros abrem o
           DRAWER, porque cada um tem origem única e o que se quer ali é a lista. */
        const grupo = onDrill ? GRUPO_DO_DRAWER[def.chave] : undefined;
        const aoAbrir = tipo ? () => abrir(tipo, '', def.rotulo, c.cultura)
          : grupo && onDrill ? () => onDrill(grupo, def.rotulo, c.cultura)
            : undefined;
        return (
          <Fragment key={c.cultura}>
            <Celula valor={v} cor={cor} destaque={def.destaque} rateado={rat}
              direto={l.direto} bordaEsquerda onAbrir={aoAbrir} />
            {mostrarUnitarios && <>
              <CelulaUnit texto={porUnidade(v, c.area_ha)} cor={cor} destaque={def.destaque} />
              <CelulaUnit texto={porUnidade(v, c.producao)} cor={cor} destaque={def.destaque} />
            </>}
          </Fragment>
        );
      })}

      {/* ⚠ A COLUNA TOTAL NÃO ABRE MODAL: `fn_painel_rateio_detalhe` recebe `p_cultura` e não
          aceita "todas" — abrir com uma cultura arbitrária mostraria o detalhe errado sob o
          número certo. Ela fica de leitura até o drill do PR-02. */}
      {!semTotal && <>
        <Celula valor={valorDaLinha(tot, def)} cor={def.corPorSinal ? corDoSinal(valorDaLinha(tot, def)) : corLinha}
          destaque={def.destaque} rateado={def.bloco && rateioDentro ? (tot.rateado ?? 0) : 0}
          direto={tot.direto} bordaEsquerda />
        {mostrarUnitarios && (
          <CelulaUnit texto={porUnidade(valorDaLinha(tot, def), dre.total.area_ha)}
            cor={def.corPorSinal ? corDoSinal(valorDaLinha(tot, def)) : corLinha} destaque={def.destaque} />
        )}
      </>}
      <td className={fundo} />
    </tr>
  );
}

/** Uma filha: o centro de custo dentro do grupo aberto. */
function LinhaCentro({ centro, culturas, rateioDentro, mostrarUnitarios, areaTotal, abrir, semTotal }: {
  centro: DreCentro; culturas: DreCultura[];
  rateioDentro: boolean; mostrarUnitarios: boolean; areaTotal: number; abrir: AbrirRateio;
  semTotal?: boolean;
}) {
  /* ⚠ SOLO DESTACADO, e só ele: é a formação de área — o dinheiro que vira terra plantável e
     não volta nesta safra. O âmbar diz "leia esta linha antes de comparar o investimento". */
  const solo = centro.bloco === 'investimento' && /solo/i.test(centro.centro);
  const fundo = solo ? '' : 'bg-card';
  const estilo = solo ? { backgroundColor: '#fbf3e6' } : undefined;
  const tipo: TipoRateio = centro.bloco === 'investimento' ? 'investimento' : 'natureza';
  const totalCentro = rateioDentro ? centro.total.valor : centro.total.direto;

  return (
    <tr className={fundo} style={{ height: 15, ...estilo }}>
      <td className={cn('sticky left-0 z-10 truncate border-r border-t border-dashed border-border/60',
        'px-[7px] py-px text-[10px]', fundo)}
        style={{ ...estilo, ...(solo ? { color: '#8a5a1e', fontWeight: 600 } : undefined) }}
        title={centro.centro}>
        <span className="mr-px inline-block w-[11px]" />{centro.centro}
      </td>

      {culturas.map(c => {
        const p = centro.por_cultura[c.cultura];
        const v = p ? (rateioDentro ? p.valor : p.direto) : null;
        return (
          <Fragment key={c.cultura}>
            <Celula filha valor={v} cor="" rateado={rateioDentro && p ? p.rateado : 0}
              direto={p?.direto} bordaEsquerda fundo={fundo} estilo={estilo}
              onAbrir={() => abrir(tipo, centro.centro, centro.centro, c.cultura)} />
            {mostrarUnitarios && <>
              <CelulaUnit filha texto={porUnidade(v, c.area_ha)} cor="" fundo={fundo} estilo={estilo} />
              <CelulaUnit filha texto={porUnidade(v, c.producao)} cor="" fundo={fundo} estilo={estilo} />
            </>}
          </Fragment>
        );
      })}

      {!semTotal && <>
        <Celula filha valor={totalCentro} cor="" rateado={rateioDentro ? centro.total.rateado : 0}
          direto={centro.total.direto} bordaEsquerda fundo={fundo} estilo={estilo} />
        {mostrarUnitarios && (
          <CelulaUnit filha texto={porUnidade(totalCentro, areaTotal)} cor="" fundo={fundo} estilo={estilo} />
        )}
      </>}
      <td className={cn('border-t border-dashed border-border/60', fundo)} style={estilo} />
    </tr>
  );
}

/* ─────────────────────── AS CÉLULAS ─────────────────────── */

/**
 * A célula de R$.
 *
 * ⚠ SEM `overflow: hidden` e com `nowrap`: a coluna é FIXA em px, e o que não coubesse seria
 * cortado no meio do número — um "3.009.508," que parece um valor menor. Sobrando, o número
 * transborda e é visível; faltando, o operador vê e a régua se ajusta. Só a coluna Cultura
 * trunca, porque ali o corte tem `title` para desfazer.
 */
function Celula({ valor, cor, destaque, rateado = 0, direto, bordaEsquerda, onAbrir, filha, fundo, estilo }: {
  valor: number | null; cor: string; destaque?: DefLinha['destaque'];
  rateado?: number; direto?: number; bordaEsquerda?: boolean;
  onAbrir?: () => void; filha?: boolean; fundo?: string; estilo?: React.CSSProperties;
}) {
  const clicavel = !!onAbrir && valor != null;
  return (
    <td className={cn('whitespace-nowrap px-[7px] py-px text-right tabular-nums',
      filha ? 'border-t border-dashed border-border/60 text-[10px]' : '', fundo, cor)}
      style={{ ...estilo, ...(bordaEsquerda ? { borderLeft: '1px solid hsl(var(--border) / .6)' } : {}) }}>
      <span className={cn(clicavel && 'cursor-pointer hover:underline hover:decoration-dotted')}
        onClick={onAbrir}>
        {numeroDaCelula(valor)}
      </span>
      {/* ⚠ O PONTO ÂMBAR É A ÚNICA PISTA DE QUE O NÚMERO MUDOU DE SIGNIFICADO no modo "dentro dos
          centros". Sem ele, Insumos saltaria de 1.121.599,85 para 1.172.900,53 sem explicação. */}
      {rateado > 0 && (
        <span title={`direto ${formatMoeda(direto ?? 0)} + rateio ${formatMoeda(rateado)}`}
          className="ml-1 inline-block h-[6px] w-[6px] rounded-full align-middle"
          style={{ backgroundColor: AMBAR }} />
      )}
    </td>
  );
}

/** A célula de /ha e /unidade — mais clara que a de R$, porque ela é derivada, não lançada. */
function CelulaUnit({ texto, cor, destaque, filha, fundo, estilo }: {
  texto: string; cor: string; destaque?: DefLinha['destaque'];
  filha?: boolean; fundo?: string; estilo?: React.CSSProperties;
}) {
  const sub = destaque === 'subtotal' || destaque === 'sub';
  return (
    <td className={cn('whitespace-nowrap px-[7px] py-px text-right text-[10px] tabular-nums',
      sub ? 'bg-muted' : 'bg-muted/40',
      filha ? 'border-t border-dashed border-border/60' : '',
      /* ⚠ 70% NAS LINHAS COMUNS, 100% NOS SUBTOTAIS: o unitário é leitura de apoio, e ao lado do
         valor cheio ele tem de ceder. No subtotal ele É o número que se lê. */
      sub ? cor : cor === VERDE ? VERDE_70
        : cor === 'text-destructive' ? 'text-destructive/70' : cor)}
      style={estilo}>
      {texto}
    </td>
  );
}

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
