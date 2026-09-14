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
import { useMemo } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';

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
  data: string | null;
  descricao: string | null;
  favorecido: string | null;
  valor: number;
  /** `true` = sem cultura marcada, é o que entra no pool compartilhado. */
  compartilhado: boolean;
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
}

/**
 * ⚠ ORDEM FIXA, NÃO SORTEADA POR HASH: a mesma cultura tem de sair da mesma cor toda vez que o
 * modal abre, senão comparar duas aberturas vira adivinhação. O índice é o da lista de fatias,
 * que a RPC já devolve ordenada por área desc.
 */
const CORES = ['#2a78d6', '#eb6834', '#2f9e6b', '#b45cd6', '#d6a52a', '#5a6b7a'];
const corDaFatia = (i: number) => CORES[i % CORES.length];

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const TH = 'sticky top-0 z-10 bg-primary px-2 py-1 text-[9px] font-semibold uppercase'
  + ' tracking-wide text-primary-foreground';

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
export function subtituloDoRateio(d: RateioDetalhe): string {
  const fatia = fatiaAtual(d)?.valor ?? 0;
  if (d.direto_cultura > 0) {
    return `${formatMoeda(d.direto_cultura + fatia)} nesta cultura `
      + `(${formatMoeda(d.direto_cultura)} direto + ${formatMoeda(fatia)} do compartilhado)`;
  }
  return `${formatMoeda(fatia)} nesta cultura · ${formatMoeda(d.pool)} no total `
    + '(compartilhado, rateado por área)';
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
    return 'A lista mostra o custo administrativo inteiro do período. A fração desta cultura é '
      + (d.pct_agricultura != null ? `${formatNum(d.pct_agricultura, 1)}% (agricultura) × ` : '')
      + `${peso}% (área) = ${formatMoeda(fatia)}. `
      + 'Por isso a lista não soma o valor da linha — é rateio em dois passos.';
  }
  return `A fração desta cultura (${peso}% por área) é ${formatMoeda(fatia)} `
    + '— é esse valor que entra na linha do painel.';
}

export function RateioDetalheModal({
  aberto, onFechar, titulo, subtitulo, dados, tipo,
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
}) {
  const totalArea = useMemo(
    () => dados.fatias.reduce((a, f) => a + f.area_ha, 0), [dados.fatias]);
  const totalLancamentos = useMemo(
    () => dados.lancamentos.reduce((a, l) => a + l.valor, 0), [dados.lancamentos]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA EM 80vh, como o `BarterListaModal`, e NÃO `max-h`: a aba de lançamentos
          tem de 3 a 418 linhas (medido no admin), e com `max-h` o modal mudaria de tamanho ao
          trocar de aba — o rodapé saindo do lugar debaixo do cursor.
          ⚠ O X DO PRIMITIVO FICA ESCONDIDO: quem fecha é o do cabeçalho, como nos outros modais
          da casa. */}
      <DialogContent
        className={cn('flex h-[80vh] max-w-3xl flex-col gap-0 overflow-hidden p-0',
          '[&>button.absolute]:hidden')}>
        <div className="flex shrink-0 items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">{titulo}</h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {subtitulo ?? subtituloDoRateio(dados)}
            </p>
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
        <Tabs defaultValue="rateio" className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
          <TabsList className="mb-1.5 grid h-7 w-full shrink-0 grid-cols-2">
            <TabsTrigger value="rateio" className="text-[10px]">Rateio</TabsTrigger>
            <TabsTrigger value="lancamentos" className="text-[10px]">
              Lançamentos · {dados.lancamentos.length}
            </TabsTrigger>
          </TabsList>

          {/* ───────────────────────── ABA 1 — O RATEIO ───────────────────────── */}
          <TabsContent value="rateio"
            className="mt-0 min-h-0 flex-1 flex-col overflow-auto data-[state=active]:flex data-[state=inactive]:hidden">
            <div className="mb-2 shrink-0 text-[11px] font-semibold text-foreground">
              Como este valor foi repartido — por área plantada
            </div>

            <div className="flex flex-wrap items-start justify-center gap-3">
              {/* ⚠ CAIXA DE TAMANHO DECLARADO, e o total NO CENTRO: sem o número no miolo, o
                  donut vira decoração — ele mostra proporção e esconde a grandeza. */}
              {/* ⚠ SEM `ResponsiveContainer`, E É A LEI DO GRÁFICO COMPACTO APLICADA: ele existe
                  para OCUPAR a largura disponível, e aqui a caixa tem 168px declarados — não há
                  nada para ele medir. Passar as medidas direto ao `PieChart` é o que o desenho
                  já pedia.
                  ⚠ E FOI O TESTE QUE COBROU: o `ResponsiveContainer` monta um `ResizeObserver`,
                  que não existe no jsdom, e derrubava os oito casos com `ReferenceError`. Podia
                  ter sido resolvido com um stub global; tirar o que não era necessário é melhor
                  que instalar uma muleta para sustentá-lo. */}
              <div className="relative h-[168px] w-[168px] shrink-0">
                <PieChart width={168} height={168}>
                  <Pie data={dados.fatias} dataKey="valor" nameKey="cultura"
                    cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                    paddingAngle={1} isAnimationActive={false}>
                    {dados.fatias.map((f, i) => (
                      <Cell key={f.cultura} fill={corDaFatia(i)} stroke="#fff" strokeWidth={1} />
                    ))}
                  </Pie>
                </PieChart>
                {/* ⚠ `pointer-events-none` PARA O TEXTO NÃO ROUBAR O HOVER do donut atrás dele. */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Total</span>
                  <span className="text-[13px] font-bold leading-tight tabular-nums">
                    {formatMoeda(dados.pool)}
                  </span>
                </div>
              </div>

              {/* ⚠ A LEGENDA É UMA TABELA, não uma lista com bolinhas: as quatro colunas se leem
                  em coluna, e é isso que permite comparar duas culturas sem contar dígito. */}
              <div className="min-w-[280px] flex-1">
                <table className="w-full table-fixed border-collapse">
                  <colgroup>
                    {['38%', '19%', '15%', '28%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={cn(TH, 'text-left')}>Cultura</th>
                      <th className={cn(TH, 'text-right')}>Área ha</th>
                      <th className={cn(TH, 'text-right')}>%</th>
                      <th className={cn(TH, 'text-right')}>R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.fatias.map((f, i) => (
                      /* ⚠ A CULTURA ABERTA FICA DESTACADA: sem isso o operador lê quatro linhas
                         sem saber qual delas explica o número que ele clicou. */
                      <tr key={f.cultura}
                        className={cn('border-t border-slate-100', f.atual && 'bg-accent')}>
                        <td className="truncate px-2 py-0.5 text-[11px]" title={labelDaCultura(f.cultura)}>
                          <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px] align-middle"
                            style={{ backgroundColor: corDaFatia(i) }} />
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
          </TabsContent>

          {/* ────────────────────── ABA 2 — OS LANÇAMENTOS ────────────────────── */}
          <TabsContent value="lancamentos"
            className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden">
            {/* ⚠ UM SCROLLPORT SÓ, e é este: a aba não rola, a caixa da tabela rola. Duas barras
                fariam o cabeçalho grudado ficar parado enquanto a lista anda por dentro. */}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  {['16%', '40%', '26%', '18%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Data</th>
                    <th className={cn(TH, 'text-left')}>Descrição</th>
                    <th className={cn(TH, 'text-left')}>Favorecido</th>
                    <th className={cn(TH, 'text-right')}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.lancamentos.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                      Nenhum lançamento neste recorte.
                    </td></tr>
                  )}
                  {dados.lancamentos.map((l, i) => (
                    <tr key={`${l.data}-${i}`}
                      className={cn('border-t border-slate-100', i % 2 === 1 && 'bg-muted/40')}>
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
              <span>Total dos lançamentos ({dados.lancamentos.length})</span>
              <span className="tabular-nums">{formatMoeda(totalLancamentos)}</span>
            </div>

            <p className="mt-1 shrink-0 text-[10px] leading-snug text-muted-foreground">
              {notaDoRateio(dados, tipo)}
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
