/**
 * O MODAL DO RATEIO — PR-RATEIO-F1.
 *
 * ⚠ ELE EXISTE PARA RESPONDER UMA PERGUNTA SÓ: "por que a linha do painel mostra ESTE valor, se
 * a nota fiscal diz outro?". A resposta é sempre a mesma — o gasto é compartilhado e foi
 * repartido por área plantada —, e até aqui ela não estava em lugar nenhum da tela. Era a razão
 * de o Rateio administrativo ter ficado sem clique desde a F1.
 *
 * ⚠ SÓ O COMPONENTE (fatia 1). Ele não busca nada: recebe o payload de `fn_painel_rateio_detalhe`
 * pronto. Quem chama a RPC e quem liga no drill é a fatia 3.
 *
 * ⚠ O DONUT É `recharts`, NÃO SVG À MÃO, e isso contraria a letra do briefing de propósito. A
 * condição que ele põe é "se NÃO tiver Chart.js, desenhar em SVG": Chart.js de fato não existe
 * aqui, mas `recharts` existe e é dependência desde sempre — e a casa já desenha ESTE donut, com
 * `innerRadius/outerRadius` numa caixa de tamanho fixo e uma tabela alinhada ao lado, em
 * `ExtratoDistribuicaoEconomica`. Escrever um arco de `stroke-dasharray` aqui criaria a segunda
 * maneira de desenhar a mesma figura, e nenhuma dependência seria evitada.
 * ⚠ A LEI DO GRÁFICO COMPACTO CONTINUA VALENDO: caixa de tamanho declarado, sem `ResponsiveContainer`
 * espalhando o donut pela largura do modal.
 */
import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Segmentado } from '@/components/ui/segmentado';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';

/** Uma cultura na repartição do pool. */
export interface FatiaRateio {
  cultura: string;
  area_ha: number;
  /** A participação da cultura na área total, em % — vem pronta da RPC. */
  peso: number;
  /** O quanto do pool coube a esta cultura. */
  valor: number;
  /** É a cultura aberta na tela. */
  atual: boolean;
}

/** Um lançamento de origem, como a RPC o devolve. */
export interface LancamentoRateio {
  /**
   * ⚠ ELE SEMPRE VEIO DA RPC E O FRONT O JOGAVA FORA. `fn_painel_rateio_detalhe` monta cada
   * lançamento com `jsonb_build_object('id', lid, ...)` desde que existe; esta interface é que
   * não o declarava, e por isso a lista era só de leitura. Com ele, clicar numa linha abre o
   * lançamento — o mesmo caminho do drawer do DRE.
   */
  id: string;
  data: string | null;
  descricao: string | null;
  favorecido: string | null;
  valor: number;
  /** `true` = sem cultura marcada, é o que entra no pool compartilhado. */
  compartilhado: boolean;
}

/** Uma atividade da fazenda no PRIMEIRO passo do rateio administrativo. */
export interface FatiaAtividade {
  atividade: string;
  valor: number;
}

/** O payload de `fn_painel_rateio_detalhe`, inteiro. */
export interface RateioDetalhe {
  pool: number;
  direto_cultura: number;
  fatias: FatiaRateio[];
  lancamentos: LancamentoRateio[];
  /**
   * O percentual da atividade agricultura no rateio administrativo. `null` fora do ramo admin.
   *
   * ⚠ É O EFETIVO DO PERÍODO, NÃO O CADASTRADO, e a diferença aparece na tela: a RPC soma o custo
   * administrativo ANO A ANO, cada ano multiplicado pelo percentual daquele ano, e devolve
   * `100 × pool / bruto`. Toda safra do Proto atravessa a virada (jul→jun), e a 23/24 tem 15% em
   * 2023 e 25% em 2024 — ela mostra 21,0%, que não está em lugar nenhum do cadastro. Está certo.
   * ⚠ `null` FORA DO ADMIN é ausência declarada, não zero: nos outros ramos não há rateio em dois
   * passos, e a pergunta não existe.
   */
  pct_agricultura: number | null;
  /**
   * O PRIMEIRO passo do rateio administrativo: o custo do escritório repartido entre as
   * atividades da fazenda. `null`/vazio fora do ramo admin.
   *
   * ⚠ ELAS SOMAM O BRUTO POR CADASTRO, NÃO POR CONSTRUÇÃO. Medido no Proto: os sete anos de
   * `agri_rateio_admin` fecham em 100%. Nada na função obriga isso — um ano cadastrado com 90%
   * deixaria 10% fora de todas as fatias, e o donut somaria menos que o bruto sem dizer por quê.
   * Por isso o total do passo 1 é a SOMA DAS FATIAS, nunca um "bruto" assumido: assim o número
   * do centro e as fatias sempre concordam, e a diferença, se houver, aparece contra a aba
   * Lançamentos em vez de se esconder.
   */
  fatias_atividade?: FatiaAtividade[] | null;
}

/**
 * ⚠ ORDEM FIXA, NÃO SORTEADA POR HASH: a mesma cultura tem de sair da mesma cor toda vez que o
 * modal abre, senão comparar duas aberturas vira adivinhação. O índice é o da lista de fatias,
 * que a RPC já devolve ordenada por área desc.
 */
const CORES = ['#2a78d6', '#eb6834', '#2f9e6b', '#b45cd6', '#d6a52a', '#5a6b7a'];
const corDaFatia = (i: number) => CORES[i % CORES.length];

/**
 * ⚠ A ATIVIDADE TEM COR PRÓPRIA, POR NOME e não por posição: a agricultura é o azul da casa —
 * o mesmo do donut do passo 2 — e as outras duas ficam em tons neutros. É o que liga
 * visualmente a fatia azul do primeiro donut ao total do segundo; com cor por índice, a
 * agricultura mudaria de cor conforme a ordem por valor, e o elo entre os dois passos sumiria.
 */
const COR_ATIVIDADE: Record<string, string> = {
  pecuaria: '#888780', agricultura: '#2a78d6', silvicultura: '#c8c6bd',
};
const corDaAtividade = (a: string) => COR_ATIVIDADE[a.toLowerCase()] ?? '#5a6b7a';
const rotuloAtividade = (a: string) => (a ? a.charAt(0).toUpperCase() + a.slice(1) : '—');

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const TH = 'sticky top-0 z-10 bg-primary px-2 py-1 text-[9px] font-semibold uppercase'
  + ' tracking-wide text-primary-foreground';

/**
 * O DONUT — um só componente para os dois passos do admin e para o de cultura.
 *
 * ⚠ ELE ILUSTRA, NÃO SELECIONA. Sem `onClick`, sem `activeIndex`, sem `activeShape`: o realce
 * que "prendia" a fatia depois do clique vinha de o recharts assumir seleção onde não há nada
 * para selecionar — quem lista e destaca é a TABELA ao lado.
 * ⚠ E A BORDA FEIA ERA O FOCO DO NAVEGADOR, não o recharts: os setores são `<path>` focáveis
 * (o recharts dá `tabIndex` a eles por acessibilidade), e clicar desenhava o anel de foco do
 * SO por cima do arco. `rootTabIndex={-1}` tira os setores da navegação e o `outline-none`
 * fecha o caso nos navegadores que focam no clique mesmo assim.
 * ⚠ SEM `ResponsiveContainer`: a caixa tem tamanho declarado, então não há o que medir — e ele
 * monta um `ResizeObserver` que o jsdom não tem, derrubando os testes.
 */
/**
 * AS COLUNAS ORDENÁVEIS — o mesmo contrato de `useOrdenacaoTabela`, que a lista de cargas da
 * colheita já usa. Não há ordenação nova aqui: o hook e o `ThOrdenavel` são os da casa, e a
 * seta invisível que eles reservam em cada cabeçalho é o que impede a tabela de se remexer a
 * cada clique.
 */
const COLUNAS_ATIVIDADE: Array<ColunaOrdenavel<FatiaAtividade, string> & { h: string }> = [
  { coluna: 'atividade', h: 'Atividade', tipo: 'texto', valor: f => f.atividade },
  { coluna: 'pct', h: '%', tipo: 'numero', valor: f => f.valor },
  { coluna: 'valor', h: 'R$', tipo: 'numero', valor: f => f.valor },
];

const COLUNAS_FATIA: Array<ColunaOrdenavel<FatiaRateio, string> & { h: string }> = [
  { coluna: 'cultura', h: 'Cultura', tipo: 'texto', valor: f => f.cultura },
  { coluna: 'area', h: 'Área ha', tipo: 'numero', valor: f => f.area_ha },
  { coluna: 'peso', h: '%', tipo: 'numero', valor: f => f.peso },
  { coluna: 'valor', h: 'R$', tipo: 'numero', valor: f => f.valor },
];

const COLUNAS_LANC: Array<ColunaOrdenavel<LancamentoRateio, string> & { h: string }> = [
  { coluna: 'data', h: 'Data', tipo: 'data', valor: l => l.data },
  { coluna: 'descricao', h: 'Descrição', tipo: 'texto', valor: l => l.descricao },
  { coluna: 'favorecido', h: 'Favorecido', tipo: 'texto', valor: l => l.favorecido },
  { coluna: 'valor', h: 'Valor', tipo: 'numero', valor: l => l.valor },
];

function Donut({ dados, cor, total, rotuloTotal, tamanho = 150 }: {
  dados: Array<{ nome: string; valor: number }>;
  cor: (i: number, nome: string) => string;
  total: number;
  rotuloTotal: string;
  tamanho?: number;
}) {
  return (
    <div className="relative shrink-0 [&_*]:outline-none"
      style={{ width: tamanho, height: tamanho }}>
      <PieChart width={tamanho} height={tamanho}>
        <Pie data={dados} dataKey="valor" nameKey="nome" cx="50%" cy="50%"
          innerRadius={tamanho * 0.31} outerRadius={tamanho * 0.47}
          paddingAngle={1} isAnimationActive={false} rootTabIndex={-1}>
          {dados.map((d, i) => (
            <Cell key={d.nome} fill={cor(i, d.nome)} stroke="#fff" strokeWidth={1} />
          ))}
        </Pie>
      </PieChart>
      {/* ⚠ `pointer-events-none` PARA O TEXTO NÃO ROUBAR O HOVER do donut atrás dele. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotuloTotal}</span>
        <span className="text-[12px] font-bold leading-tight tabular-nums">{formatMoeda(total)}</span>
      </div>
    </div>
  );
}

/** O tipo de recorte que o painel clicou — muda a frase do rodapé, nunca o cálculo. */
export type TipoRateio = 'natureza' | 'investimento' | 'admin';

/** A fatia da cultura aberta, ou `null` se o recorte não tiver nenhuma marcada. */
const fatiaAtual = (d: RateioDetalhe) => d.fatias.find(f => f.atual) ?? null;

/**
 * O SUBTÍTULO — os dois números que o operador está comparando.
 *
 * ⚠ FUNÇÃO PURA E EXPORTADA, não um `const` dentro do render, e a razão é dupla: ela É a regra
 * que o briefing especifica (com o ramo do `direto_cultura`), e dentro do JSX ela só seria
 * testável montando o modal inteiro. Aqui um teste de três linhas trava as duas pontas.
 * ⚠ ELE ABRE A PARCELA DIRETA QUANDO ELA EXISTE: uma cultura pode ter gasto marcado NELA mais a
 * fatia do compartilhado, e um número só somando os dois faria o operador procurar uma nota
 * fiscal de um valor que nunca foi lançado.
 */
/**
 * A PRIMEIRA LINHA DO SUBTÍTULO — o número que o operador acabou de clicar, e nenhum outro.
 *
 * ⚠ ELA DEPENDE DO TOGGLE DA GRADE, e é esse o ponto: "dentro dos centros" mostra o total
 * (direto + fatia) e "em linha própria" mostra só o direto. O modal precisa dizer o mesmo, ou a
 * primeira coisa que o operador lê já contradiz a célula de onde ele veio.
 * ⚠ SEM O TOGGLE (admin, ou chamada de outra tela) ela dá o total — que é o que o modal sempre
 * disse, e continua certo.
 */
export function ecoDaCelula(
  d: RateioDetalhe, tipo: TipoRateio, rateioDentro?: boolean,
): string {
  const fatia = fatiaAtual(d)?.valor ?? 0;
  /* ⚠ NO MODO "Custos diretos" O ECO É O DIRETO E NADA MAIS. A palavra "direto" saiu da frase:
     o modal inteiro é dos diretos ali, e repetir o adjetivo em cada linha só o esvazia. */
  if (tipo !== 'admin' && rateioDentro === false) {
    return `${formatMoeda(d.direto_cultura)} nesta cultura`;
  }
  return `${formatMoeda(d.direto_cultura + fatia)} nesta cultura`;
}

export function subtituloDoRateio(d: RateioDetalhe, tipo: TipoRateio): string {
  const fatia = fatiaAtual(d)?.valor ?? 0;
  /**
   * ⚠ O ADMIN DIZ A CADEIA INTEIRA, porque ela É a resposta: o valor da linha não sai de uma
   * divisão, sai de DUAS em sequência. "R$ 968.986 de admin → 25% agricultura → 78,8% área"
   * é a conta que o operador refaz no papel; o subtítulo a escreve na ordem em que ele a faz.
   */
  if (tipo === 'admin') {
    const bruto = (d.fatias_atividade ?? []).reduce((a, f) => a + f.valor, 0);
    const passo1 = d.pct_agricultura != null ? `${formatNum(d.pct_agricultura, 1)}% agricultura` : 'agricultura';
    const passo2 = `${formatNum(fatiaAtual(d)?.peso ?? 0, 1)}% área`;
    return `${formatMoeda(fatia)} nesta cultura · rateio em dois passos: `
      + `${formatMoeda(bruto)} de admin → ${passo1} → ${passo2}`;
  }
  /* ⚠ A CONTA INTEIRA NUMA LINHA, e os quatro números já vêm do payload — `direto_cultura`, o
     `valor` e o `peso` da fatia marcada, e o `pool`. A soma `direto + fatia` é a mesma que o
     modal sempre fez; o que entrou foi dizer de ONDE a fatia saiu, que é a pergunta seguinte.
     ⚠ O PERCENTUAL É O DA RPC, arredondado só na exibição: 78,8% de 561.493,13 dá 442.456, e a
     fatia real é 442.403,02 (peso 78,79%). Quem manda é a fatia; o percentual é legenda. */
  const pct = formatNum(fatiaAtual(d)?.peso ?? 0, 1);
  if (d.direto_cultura > 0) {
    return `${formatMoeda(d.direto_cultura + fatia)} nesta cultura = ${formatMoeda(d.direto_cultura)} `
      + `direto + ${formatMoeda(fatia)} do rateio (${pct}% de ${formatMoeda(d.pool)} por área)`;
  }
  return `${formatMoeda(fatia)} nesta cultura = ${pct}% de ${formatMoeda(d.pool)} por área `
    + '(sem custo direto neste centro)';
}

/**
 * A NOTA DO RODAPÉ — e no administrativo ela não é um texto mais longo, é OUTRO FATO.
 *
 * ⚠ Nos outros dois tipos a lista de lançamentos SOMA o pool, e conferir é somar. No
 * administrativo a lista traz o custo inteiro do período e o pool já vem multiplicado pelo
 * percentual da atividade: a soma da lista NÃO fecha com o valor da linha, POR CONSTRUÇÃO. Sem
 * esta frase o operador soma, acha diferença e conclui que o sistema errou — o pior desfecho
 * possível para uma tela cuja função é auditar.
 * ⚠ O PERCENTUAL SAI DO PAYLOAD, NÃO DE UMA PROP. Ele chegou a ser prop enquanto a RPC não o
 * devolvia; agora que devolve, recebê-lo de fora só abriria a porta para um chamador passar um
 * número diferente do que a RPC calculou — e seriam DOIS números certos e discordantes na mesma
 * frase. O `null` continua tratado: sem ele, a frase explica os dois passos sem nomear o primeiro.
 */
export function notaDoRateio(d: RateioDetalhe, tipo: TipoRateio): string {
  const f = fatiaAtual(d);
  const fatia = f?.valor ?? 0;
  const peso = formatNum(f?.peso ?? 0, 1);
  if (tipo === 'admin') {
    /* ⚠ A NOTA ENCOLHEU PORQUE OS DONUTS PASSARAM A EXPLICAR. Ela existia para dizer, em
       palavras, que a lista NÃO fecha com a linha do painel — e agora a aba Rateio mostra os
       dois passos desenhados. O que sobrou é o que o desenho não diz: que ESTA LISTA é o admin
       inteiro, e por isso ela fecha com o PRIMEIRO donut, não com a linha.
       ⚠ O PERCENTUAL SAI DO PAYLOAD, não de uma prop: recebê-lo de fora abriria a porta para um
       chamador passar número diferente do que a RPC calculou. */
    return 'Esta lista é o custo administrativo INTEIRO do período: ela fecha com o primeiro '
      + 'donut, não com a linha do painel. '
      + (d.pct_agricultura != null ? `${formatNum(d.pct_agricultura, 1)}% (agricultura) × ` : '')
      + `${peso}% (área) = ${formatMoeda(fatia)}.`;
  }
  return `A fração desta cultura (${peso}% por área) é ${formatMoeda(fatia)} `
    + '— é esse valor que entra na linha do painel.';
}

/**
 * A LISTA DE LANÇAMENTOS DE UM RECORTE — usada pelas DUAS abas novas, nunca copiada.
 *
 * ⚠ ELA NASCEU DA ABA "Lançamentos" ÚNICA, que somava direto e rateado no mesmo rolo. Separar em
 * duas listas foi o pedido da homologação, e a razão é de leitura: numa o operador confere a
 * nota fiscal que ele mesmo marcou com a cultura; na outra, o custo comum que a fazenda inteira
 * dividiu. São duas perguntas, e a soma de cada uma bate com um número diferente do subtítulo.
 * ⚠ UM COMPONENTE, DOIS USOS: com duas cópias, a primeira coluna que alguém ajustasse desalinharia
 * as abas irmãs.
 */
function ListaLancamentos({ linhas, rotuloTotal, onAbrir }: {
  linhas: LancamentoRateio[];
  rotuloTotal: string;
  onAbrir?: (id: string) => void;
}) {
  const ord = useOrdenacaoTabela(linhas, COLUNAS_LANC, { coluna: 'data', direcao: 'asc' });
  const total = useMemo(() => linhas.reduce((a, l) => a + l.valor, 0), [linhas]);
  return (
    <>
      {/* ⚠ UM SCROLLPORT SÓ, e é este: a aba não rola, a caixa da tabela rola. Duas barras
          fariam o cabeçalho grudado ficar parado enquanto a lista anda por dentro. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {['16%', '40%', '26%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUNAS_LANC.map(c => (
                <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h}
                  ordem={ord.ordem} onOrdenar={ord.alternar}
                  className={TH} alinhaDireita={c.coluna === 'valor'} />
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhum lançamento neste recorte.
              </td></tr>
            )}
            {ord.ordenadas.map((l, i) => (
              <tr key={l.id || `${l.data}-${i}`}
                onClick={onAbrir ? () => onAbrir(l.id) : undefined}
                title={onAbrir ? 'abrir o lançamento' : undefined}
                className={cn('border-t border-slate-100', i % 2 === 1 && 'bg-muted/40',
                  onAbrir && 'cursor-pointer hover:bg-primary/[0.06]')}>
                <td className="whitespace-nowrap px-2 py-0.5 text-[10px] tabular-nums">
                  {dataBR(l.data)}
                </td>
                {/* ⚠ `truncate` COM `title`: a descrição é o campo livre do lançamento e
                    não tem teto de tamanho; deixá-la quebrar faria a linha crescer e a
                    lista de 418 itens virar um rolo. */}
                <td className="truncate px-2 py-0.5 text-[10px]" title={l.descricao ?? undefined}>
                  {l.descricao || '—'}
                </td>
                <td className="truncate px-2 py-0.5 text-[10px] text-muted-foreground"
                  title={l.favorecido ?? undefined}>
                  {l.favorecido || '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-[10px] tabular-nums">
                  {formatMoeda(l.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⚠ O TOTAL FICA FIXO FORA DO SCROLLPORT, não num `tfoot`: com 418 linhas o operador
          precisa do total à vista enquanto procura a nota, não depois de rolar até o fim. */}
      <div className="mt-1 flex shrink-0 items-center justify-between gap-2 rounded-md
        bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
        <span>{rotuloTotal} ({linhas.length})</span>
        <span className="tabular-nums">{formatMoeda(total)}</span>
      </div>
    </>
  );
}

export function RateioDetalheModal({
  aberto, onFechar, titulo, subtitulo, dados, tipo, onAbrirLancamento, rateioDentro,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** "<chave> · <Cultura> · Safra <safra>" — o contexto é de quem abre. */
  titulo: string;
  /**
   * ⚠ OPCIONAL, E O DEFAULT É DERIVADO — decisão consciente contra a letra do briefing, que o
   * pede por prop. A frase é função PURA do payload (a fatia com `atual`, o `direto_cultura` e o
   * `pool`), e todos os três já estão aqui dentro. Passá-la de fora obrigaria cada chamador a
   * refazer a mesma conta, e na segunda tela os dois textos divergiriam. A prop fica para quem
   * precisar sobrescrever.
   */
  subtitulo?: string;
  dados: RateioDetalhe;
  /** 'natureza' | 'investimento' | 'admin' — muda a nota do rodapé, não o cálculo. */
  tipo: TipoRateio;
  /** Abre o lançamento clicado. Sem ela as listas continuam de leitura, como antes. */
  onAbrirLancamento?: (id: string) => void;
  /**
   * O estado do toggle "Rateio compartilhado" da grade que abriu este modal.
   *
   * ⚠ ELE EXISTE PARA O TÍTULO ECOAR A CÉLULA CLICADA. Com o toggle desligado a tabela mostra
   * 1.121.599,85 (só o direto) e o modal abria dizendo 1.172.900,53 — o número certo do centro,
   * mas não o que o dedo apontou. Dois números certos e discordantes na mesma ação é o começo de
   * toda desconfiança de relatório.
   * ⚠ E ELE TAMBÉM ESCOLHE A ABA INICIAL: desligado, o operador veio olhar o direto; ligado,
   * veio entender a divisão.
   */
  rateioDentro?: boolean;
}) {
  const totalArea = useMemo(
    () => dados.fatias.reduce((a, f) => a + f.area_ha, 0), [dados.fatias]);
  const passo1 = dados.fatias_atividade ?? [];
  const totalAtividades = useMemo(
    () => passo1.reduce((a, f) => a + f.valor, 0), [passo1]);

  /* ⚠ TRÊS ORDENAÇÕES INDEPENDENTES, uma por tabela: ordenar as culturas não pode reordenar os
     lançamentos, e o hook guarda o estado de cada uma separadamente. */
  const ordAtv = useOrdenacaoTabela(passo1, COLUNAS_ATIVIDADE, { coluna: 'valor', direcao: 'desc' });
  const ordFat = useOrdenacaoTabela(dados.fatias, COLUNAS_FATIA, { coluna: 'valor', direcao: 'desc' });
  /* ⚠ A DIVISÃO É A DA PRÓPRIA RPC, não um critério novo: lá dentro, `comp` é `l.cultura is
     null`, e é com ele que ela soma `pool` (compartilhado) e `direto_cultura` (o resto). Aqui
     `compartilhado` é esse mesmo booleano, já no payload — então a soma de cada lista fecha com
     o número do subtítulo por construção, sem o front refazer conta nenhuma. */
  const diretos = useMemo(
    () => dados.lancamentos.filter(l => !l.compartilhado), [dados.lancamentos]);
  const rateados = useMemo(
    () => dados.lancamentos.filter(l => l.compartilhado), [dados.lancamentos]);
  /* ⚠ O ADMIN CONTINUA COM DUAS ABAS. Lá a lista é o custo do escritório INTEIRO e não se divide
     em "meu" e "comum" — a repartição dele é por atividade, que é o que o passo 1 desenha.
     Três abas ali inventariam um recorte que o dado não tem. */
  const admin = tipo === 'admin';
  /* ⚠ AS ABAS DE RATEIO SÓ EXISTEM QUANDO HÁ RATEIO PARA EXPLICAR (§10): pool zero, ou uma
     cultura só na safra, e não há divisão nenhuma — o donut teria uma fatia e a tabela uma
     linha. Nesse caso o modal vira o que o operador foi buscar: a lista daquele centro naquela
     cultura, sem barra de abas. Mesmo componente, mesma chamada, mesma lista. */
  const temDivisao = dados.pool > 0 && dados.fatias.length > 1;
  /* ⚠ O MODAL SEGUE O TOGGLE DA GRADE (§0), e não só no título: no modo "Custos diretos" a
     célula mostra o direto e o operador veio ver AQUELES lançamentos — abas de rateio ali
     oferecem uma divisão que a tela de trás não está aplicando. No modo "Com rateio nos centros"
     a célula é direto + fatia, e a divisão é a explicação do número.
     ⚠ `rateioDentro === undefined` MANTÉM O COMPORTAMENTO ANTIGO (três abas): o admin e
     qualquer chamador futuro que não conheça o toggle continuam como estavam. */
  const mostrarRateio = temDivisao && rateioDentro !== false;
  const tresAbas = !admin && mostrarRateio;
  const semAbas = !admin && !mostrarRateio;

  /* ⚠ AS ABAS VIRARAM ESTADO CONTROLADO porque a barra deixou de ser a `TabsList` do Radix e
     passou a ser o `Segmentado` da casa (regra de UI do PR-04). O `Tabs` continua governando o
     CONTEÚDO — é ele que monta e desmonta cada `TabsContent`; o que mudou foi quem desenha a
     escolha. */
  /* ⚠ SEM ABAS SÓ HÁ UMA; COM ABAS ABRE NA DIVISÃO — que é o que o número da célula precisa
     explicar quando o toggle está em "Com rateio nos centros". */
  const abaInicial = semAbas ? 'diretos' : 'rateio';
  const [abaAtual, setAbaAtual] = useState(abaInicial);
  const opcoesDeAba = tresAbas
    ? [
      { valor: 'diretos', rotulo: `Custos diretos · ${diretos.length}` },
      { valor: 'rateio', rotulo: 'Divisão do rateio' },
      { valor: 'rateados', rotulo: `A ratear · ${rateados.length}` },
    ]
    : [
      { valor: 'rateio', rotulo: 'Rateio' },
      { valor: 'lancamentos', rotulo: `Lançamentos · ${dados.lancamentos.length}` },
    ];

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA EM 80vh, como o `BarterListaModal`, e NÃO `max-h`: a aba de lançamentos
          tem de 3 a 418 linhas (medido no admin), e com `max-h` o modal mudaria de tamanho ao
          trocar de aba — o rodapé saindo do lugar debaixo do cursor.
          ⚠ O X DO PRIMITIVO FICA ESCONDIDO: quem fecha é o do cabeçalho, como nos outros modais
          da casa. */}
      <DialogContent
        /* ⚠ `calc(100vh - 96px)` NO LUGAR DE `80vh` (§5a): em telas de 800px o modal media 640 e
           o passo 2 do administrativo — donut mais tabela de culturas — ficava cortado na base.
           ⚠ CONTINUA ALTURA FIXA, e não `max-h`: a aba de lançamentos tem de 3 a 418 linhas, e
           com `max-h` o modal mudaria de tamanho ao trocar de aba, com o rodapé saindo debaixo
           do cursor. O que mudou foi o número, não a natureza da regra. */
        className={cn('flex h-[calc(100vh-96px)] max-w-3xl flex-col gap-0 overflow-hidden p-0',
          '[&>button.absolute]:hidden')}>
        <div className="flex shrink-0 items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          {/* ⚠ DUAS LINHAS (§1b): a primeira É O NÚMERO QUE O DEDO APONTOU, em 14px; a segunda é a
              conta que o explica, em 11px. Antes havia uma só, e ela dava o total com rateio
              mesmo quando a tabela estava mostrando o direto — o operador clicava em
              1.121.599,85 e o modal respondia 1.172.900,53. */}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">{titulo}</h2>
            {subtitulo ? (
              <p className="mt-0.5 text-[11px] text-primary-foreground/80">{subtitulo}</p>
            ) : (
              <>
                <p className="mt-0.5 truncate text-[14px] font-medium leading-tight">
                  {ecoDaCelula(dados, tipo, rateioDentro)}
                </p>
                {/* ⚠ A SEGUNDA LINHA SÓ EXISTE ONDE HÁ RATEIO A EXPLICAR (§0a): no modo "Custos
                    diretos" ela falaria de pool e de percentual que a tela de trás não está
                    usando — informação certa na hora errada. */}
                {!semAbas && (
                  <p className="mt-0.5 text-[11px] text-primary-foreground/80">
                    {subtituloDoRateio(dados, tipo)}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ O `display` DA ABA É CONDICIONADO AO ESTADO, nunca `flex` cru — a lição que o
            `AgriDreCulturaTab` já pagou: o Radix renderiza a aba inativa como `<div hidden>` e
            só os FILHOS somem; `[hidden]{display:none}` do preflight perde para `.flex`, e a
            caixa vazia continuaria repartindo a altura com a aba visível. */}
        {/* ⚠ A ABA INICIAL SEGUE O TOGGLE DA GRADE (§1c): desligado, o operador estava olhando o
            direto e é nele que o modal abre; ligado, ele estava olhando o total com rateio
            dentro, e a divisão é a explicação daquele número. Sem o toggle (admin, ou chamada de
            outra tela) fica o rateio, como sempre foi. */}
        <Tabs value={abaAtual} onValueChange={setAbaAtual}
          className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
          {/* ⚠ A ORDEM É DIRETO → DIVISÃO → RATEADO, a mesma da frase do subtítulo: o operador lê
              "X = Y direto + Z do rateio" e encontra as abas na ordem em que acabou de ler. */}
          {/* ⚠ SEM BARRA DE ABAS quando não há divisão (§10c): uma aba só é um rótulo, não uma
              escolha, e desenhá-la só ocuparia 28px dizendo ao operador que existe outro lugar
              para ir. O conteúdo continua sendo um `TabsContent` — o Radix segue governando. */}
          {!semAbas && (
            <Segmentado className="mb-1.5 w-full [&>button]:flex-1" valor={abaAtual}
              onEscolher={setAbaAtual} opcoes={opcoesDeAba} />
          )}

          {(tresAbas || semAbas) && (
            <TabsContent value="diretos"
              className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden">
              <ListaLancamentos linhas={diretos} rotuloTotal="Direto nesta cultura"
                onAbrir={onAbrirLancamento} />
              <p className="mt-1 shrink-0 text-[10px] leading-snug text-muted-foreground">
                {semAbas
                  ? 'Lançamentos deste centro nesta cultura. Não há rateio a repartir aqui.'
                  : 'Lançamentos marcados com esta cultura — é o que soma o "direto" do subtítulo.'}
              </p>
            </TabsContent>
          )}

          {/* ───────────────────────── ABA 1 — O RATEIO ───────────────────────── */}
          <TabsContent value="rateio"
            className="mt-0 min-h-0 flex-1 flex-col gap-3 overflow-auto data-[state=active]:flex data-[state=inactive]:hidden">

            {/* ── PASSO 1 — só no administrativo ──
                ⚠ SÓ O ADMIN TEM DOIS PASSOS. Numa natureza ou num investimento o compartilhado
                já é da lavoura e vai direto para as culturas; no administrativo o custo é do
                ESCRITÓRIO, e antes de chegar à cultura ele passa pela atividade. Desenhar um
                passo 1 vazio nos outros dois inventaria uma etapa que não existe. */}
            {passo1.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-foreground">
                  Passo 1 — o administrativo do período repartido entre as atividades
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <Donut dados={passo1.map(f => ({ nome: f.atividade, valor: f.valor }))}
                    cor={(_, nome) => corDaAtividade(nome)}
                    total={totalAtividades} rotuloTotal="Admin do período" />
                  <div className="min-w-[240px] flex-1">
                    <table className="w-full table-fixed border-collapse">
                      {/* ⚠ px FIXOS (§5b), não porcentagem: esticada até a borda, a tabela
                          deixava o R$ a meia tela do nome da atividade e o olho perdia a linha.
                          A última coluna absorve a sobra. */}
                      <colgroup>
                        <col style={{ width: 220 }} />
                        <col style={{ width: 130 }} />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          {COLUNAS_ATIVIDADE.map(c => (
                            <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h}
                              ordem={ordAtv.ordem} onOrdenar={ordAtv.alternar}
                              className={TH} alinhaDireita={c.coluna !== 'atividade'} />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ordAtv.ordenadas.map(f => (
                          /* ⚠ A AGRICULTURA FICA DESTACADA porque é a fatia que SEGUE para o
                             passo 2 — sem isso os dois donuts parecem dois assuntos. */
                          <tr key={f.atividade}
                            className={cn('border-t border-slate-100',
                              f.atividade.toLowerCase() === 'agricultura' && 'bg-accent')}>
                            <td className="truncate px-2 py-0.5 text-[11px]">
                              <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px] align-middle"
                                style={{ backgroundColor: corDaAtividade(f.atividade) }} />
                              <span className={cn(f.atividade.toLowerCase() === 'agricultura' && 'font-bold')}>
                                {rotuloAtividade(f.atividade)}
                              </span>
                            </td>
                            <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                              {totalAtividades > 0 ? `${formatNum((f.valor / totalAtividades) * 100, 1)}%` : '—'}
                            </td>
                            <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                              {formatMoeda(f.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── PASSO 2 (ou o único, fora do admin) ── */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-foreground">
                {passo1.length > 0
                  ? `Passo 2 — a parcela da lavoura (${formatMoeda(dados.pool)}) repartida entre as culturas, por área`
                  : 'Como este valor foi repartido — por área plantada'}
              </div>

              {/* ⚠ O DIRETO NÃO VIRA FATIA, E ISSO PRECISA ESTAR ESCRITO. O donut mostra só o
                  POOL, porque só ele se reparte; o gasto já marcado nesta cultura não passa por
                  rateio nenhum. Sem esta linha, o total do centro (o pool) discordaria do
                  subtítulo (direto + fração) e pareceria erro — quando é a diferença entre "o
                  que se reparte" e "o que a cultura tem". */}
              {dados.direto_cultura > 0 && (
                <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
                  O que se reparte: <strong>{formatMoeda(dados.pool)}</strong>. O resto,{' '}
                  <strong>{formatMoeda(dados.direto_cultura)}</strong>, é direto desta cultura e
                  não se reparte.
                </p>
              )}

              <div className="flex flex-wrap items-start gap-3">
                <Donut dados={dados.fatias.map(f => ({ nome: f.cultura, valor: f.valor }))}
                  cor={i => corDaFatia(i)}
                  total={dados.pool} rotuloTotal="A repartir" />

                {/* ⚠ A LEGENDA É UMA TABELA, não uma lista com bolinhas: as quatro colunas se
                    leem em coluna, e é isso que permite comparar duas culturas sem contar
                    dígito. */}
                <div className="min-w-[280px] flex-1">
                  <table className="w-full table-fixed border-collapse">
                    {/* ⚠ A MESMA RÉGUA DA TABELA DE CIMA (§5b/§5c): nome 220, área 90, % 70,
                        R$ 130. As duas ficam uma sob a outra e larguras diferentes fariam o olho
                        reancorar a cada bloco. */}
                    <colgroup>
                      <col style={{ width: 220 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 70 }} />
                      <col style={{ width: 130 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        {COLUNAS_FATIA.map(c => (
                          <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h}
                            ordem={ordFat.ordem} onOrdenar={ordFat.alternar}
                            className={TH} alinhaDireita={c.coluna !== 'cultura'} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ordFat.ordenadas.map(f => (
                        <tr key={f.cultura}
                          className={cn('border-t border-slate-100', f.atual && 'bg-accent')}>
                          <td className="truncate px-2 py-0.5 text-[11px]" title={labelDaCultura(f.cultura)}>
                            <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px] align-middle"
                              style={{ backgroundColor: corDaFatia(dados.fatias.indexOf(f)) }} />
                            <span className={cn(f.atual && 'font-bold')}>{labelDaCultura(f.cultura)}</span>
                          </td>
                          <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                            {formatNum(f.area_ha, 2)}
                          </td>
                          <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                            {formatNum(f.peso, 1)}%
                          </td>
                          <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                            {formatMoeda(f.valor)}
                          </td>
                        </tr>
                      ))}
                      {/* ⚠ O TOTAL NA MESMA RÉGUA, e os 100% ESCRITOS: eles são a prova de que
                          nenhuma cultura ficou de fora da repartição. */}
                      <tr className="bg-primary text-primary-foreground">
                        <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                        <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatNum(totalArea, 2)}
                        </td>
                        <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">100,0%</td>
                        <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatMoeda(dados.pool)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ────────────────────── ABA 2 — OS LANÇAMENTOS ────────────────────── */}
          {/* ─────────── ABA 3 — OS RATEADOS (ou a lista inteira, no admin) ─────────── */}
          <TabsContent value={tresAbas ? 'rateados' : 'lancamentos'}
            className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden">
            <ListaLancamentos
              linhas={tresAbas ? rateados : dados.lancamentos}
              rotuloTotal={tresAbas ? 'Pool compartilhado' : 'Total dos lançamentos'}
              onAbrir={onAbrirLancamento} />
            <p className="mt-1 shrink-0 text-[10px] leading-snug text-muted-foreground">
              {tresAbas
                /* ⚠ A SOMA DESTA LISTA É O POOL INTEIRO, não a fatia da cultura — e dizer isso
                   aqui é o que impede o operador de somar, achar diferença e concluir que o
                   sistema errou. A fatia está no subtítulo e na aba do meio. */
                ? 'Lançamentos sem cultura marcada — o custo comum. A soma é o pool INTEIRO; '
                  + 'a fatia desta cultura está no subtítulo.'
                : notaDoRateio(dados, tipo)}
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
