/**
 * DRE POR CULTURA — PR-AGRI-DRE-01, com a leitura de UX-03.
 *
 * ⚠ TELA DE RENDER, ZERO CONTA. Todo número vem de `fn_dre_agricola_por_safra`, inclusive o
 * Total: ele é a coluna `__total__`, nunca a soma das culturas na tela. O que a tela deriva é
 * só apresentação — resultado por hectare, percentual de custo direto, montante rateado —, e
 * isso mora em `lib/agri/dreCultura`, com teste, fora do JSX.
 * ⚠ O INVESTIMENTO FICA ABAIXO DA LINHA, em bloco próprio: é caixa que saiu e não é custo da
 * safra (regra de formação de área, congelada na RPC). Misturá-lo ao resultado faria a
 * primeira safra de uma área nova parecer desastre.
 * ⚠ "NÃO APROPRIADO" É UMA PENDÊNCIA, E PENDÊNCIA RESOLVIDA SAI DA TELA. A coluna mostra o que
 * ainda não tem cultura decidida — receita sem cultura e lançamento marcado com cultura não
 * plantada nesta safra — e só é renderizada quando carrega algo (tolerância de meio centavo,
 * em `montarMatriz`). Sem resíduo, some com a nota que a explica; a RPC continua devolvendo a
 * coluna zerada para quem for conferir no banco.
 * ⚠ CLICAR NA CÉLULA ABRE OS LANÇAMENTOS DELA, no mesmo drawer/árvore do Painel por período.
 * ⚠ E A CÉLULA TEM DUAS PARTES, o que o drill precisou aprender: DIRETO (lançamento marcado
 * com a cultura) + RATEADO (o pool sem cultura, distribuído por peso de área). No Investimento
 * do amendoim o direto é R$ 429 mil de um número de R$ 5,1 milhões — mostrar só ele fazia o
 * relatório parecer errado. O drawer abre as duas seções e a soma fecha com a célula.
 * ⚠ E O LANÇAMENTO ABRE PARA EDIÇÃO, no MESMO `LancamentoV2Dialog` do Painel por período. O
 * clique na linha já existia no `DrillDownEconomico` (prop `onAbrirLancamento`); esta tela é
 * que não o ligava. Nada de modal novo: de onde se enxerga o número, corrige-se o número.
 */
import { useMemo, useState, useEffect } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Sprout, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useSafrasLavoura } from '@/hooks/useAreaPlantada';
import { useDreAgricola } from '@/hooks/useDreAgricola';
import { useLancamentosDaSafra, type LancamentoDaSafra } from '@/hooks/useLancamentosDaSafra';
import { usePoolAdministrativo } from '@/hooks/usePoolAdministrativo';
import { AnaliseDrawer } from '@/components/financeiro-v2/AnaliseDrawer';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { DrillDownEconomico } from '@/components/financeiro-v2/DrillDownEconomico';
import { NIVEIS_DRILL, type ItemDrill } from '@/lib/analise/drillEconomico';
import {
  montarMatriz, valorDe, resultadoPorHa, percentualCustoDireto, montanteRateado, houveRateio,
  exibeTraco, bucketDaLinha, celulaTemDrill, ehLinhaRateio, ehLinhaSaida,
  temParteRateada, pesoDaCultura,
  GRUPO_DA_LINHA, TIPO_DA_LINHA, POOL_DA_LINHA, LINHA, COL_TOTAL, COL_COMPARTILHADO,
  COL_NAO_APROPRIADO,
  ORDENS_CASCATA, ORDENS_ABAIXO_DA_LINHA, ORDENS_SUBTOTAL,
} from '@/lib/agri/dreCultura';

/** Os dois lados do negócio. A pecuária ainda não tem DRE — ver a nota no seletor. */
type Atividade = 'lavoura' | 'pecuaria';

/**
 * A COR DE UM NÚMERO DA CASCATA — PR-AGRI-DRE-UX-15.
 *
 * ⚠ TRÊS RÉGUAS DIFERENTES, e a ordem entre elas é o que importa:
 *  1. traço é ausência e some em cinza, antes de qualquer outra cor;
 *  2. no RESULTADO a cor vem do SINAL — é a única linha em que o número pode ser negativo,
 *     e é a pergunta que a tela responde ("a cultura fechou no azul?");
 *  3. nas demais, a cor vem da LINHA, não do sinal: entrada em verde, saída em vermelho. Na
 *     cascata o valor sai sempre positivo e a direção é da linha, então pintar por sinal
 *     deixaria a coluna inteira verde e esconderia o que é gasto.
 */
function corDoNumero(
  ordem: number, valor: number | null, traco: boolean, rotulo: string,
): string | undefined {
  if (traco) return 'text-muted-foreground';
  if (ordem === LINHA.resultadoCaixa) {
    return (valor ?? 0) < 0 ? 'text-destructive' : 'text-success';
  }
  if (ordem === LINHA.receitaBruta || ordem === LINHA.receitaLiquida) return 'text-success';
  return ehLinhaSaida(rotulo) ? 'text-destructive' : undefined;
}

function MetricCard({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-0.5 text-[20px] font-medium leading-none tabular-nums', cor)}>{valor}</div>
    </div>
  );
}

export function AgriDreCulturaTab() {
  const { clienteAtual } = useCliente();
  const { safras } = useSafrasLavoura(clienteAtual?.id ?? null);
  const [safraId, setSafraId] = useState('');
  const [atividade, setAtividade] = useState<Atividade>('lavoura');
  /** A célula aberta no drawer: coluna + linha da cascata. */
  const [drill, setDrill] = useState<{ cultura: string; ordem: number } | null>(null);

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente, então
     é a última. Só escolhe sozinho enquanto ninguém escolheu. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  const { linhas, carregando, erro, recarregar: recarregarDre } = useDreAgricola(clienteAtual?.id ?? null, safraId || null);
  const m = useMemo(() => montarMatriz(linhas), [linhas]);
  const {
    lancamentos, fornecedores, recarregar: recarregarLancamentos,
  } = useLancamentosDaSafra(clienteAtual?.id ?? null, safraId || null);
  /* O pool administrativo é o único que não sai por `safra_id` — ver `usePoolAdministrativo`. */
  const safraAtual = safras.find(s => s.id === safraId);
  const poolAdmin = usePoolAdministrativo(
    clienteAtual?.id ?? null, safraAtual?.data_inicio, safraAtual?.data_fim);

  /* ── A EDIÇÃO, igual à do Painel por período ────────────────────────────────────────── */
  const fin = useFinanceiroV2();
  const { fazendas } = useFazenda();
  const [editando, setEditando] = useState<LancamentoV2 | null>(null);

  /**
   * ⚠ OS QUATRO CATÁLOGOS SÃO OBRIGATÓRIOS, e a lição é do `PainelPeriodoTab`: o hook não
   * carrega nada sozinho, e sem eles o modal abre com os selects VAZIOS — favorecido em
   * branco, safra em branco, subcentro mudo. Nenhum tipo acusa isso, porque lista vazia é
   * lista válida; só aparece na tela do operador.
   */
  useEffect(() => {
    void fin.loadContas();
    void fin.loadClassificacoes();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);

  /**
   * ⚠ A LINHA VEM INTEIRA DO BANCO (`select('*')`), como no Painel por período: a lista do
   * drill carrega quinze colunas, e o modal precisa das sessenta e cinco. Buscar uma linha ao
   * clicar é mais barato que trazer tudo para o caso de o operador abrir uma.
   */
  const abrirLancamento = async (id: string) => {
    const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('*').eq('id', id).maybeSingle();
    const linha: LancamentoV2 | null = data ?? null;
    if (linha) setEditando(linha);
  };

  const resultadoTotal = valorDe(m, COL_TOTAL, LINHA.resultadoCaixa);
  const porHaTotal = resultadoPorHa(m, COL_TOTAL);
  const rateado = montanteRateado(m);

  /* ⚠ A ORDEM É FIXA — culturas, "Não apropriado", Total — e só a do meio é condicional. O
     Total nunca sai, e nenhuma cultura plantada some por estar zerada: o que aparece e
     desaparece é a PENDÊNCIA, não o relatório. */
  const colunas = [...m.culturas, ...(m.temNaoApropriado ? [COL_NAO_APROPRIADO] : []), COL_TOTAL];
  const tituloColuna = (c: string) => {
    if (c === COL_TOTAL) return 'Total';
    if (c === COL_NAO_APROPRIADO) return 'Não apropriado';
    return labelDaCultura(c);
  };

  /**
   * ⚠ OS DOIS MAPAS DE NOME SE SOMAM, e a ordem importa pouco porque um id não aparece nos
   * dois com nomes diferentes: são a mesma tabela, consultada por quem tem os ids. O da safra
   * cobre o drill direto e os pools de custo e investimento; o do administrativo cobre a
   * seção rateada da linha 8, cujos lançamentos não são da safra.
   */
  const nomesDeFavorecidos = useMemo(
    () => new Map([...fornecedores, ...poolAdmin.fornecedores]),
    [fornecedores, poolAdmin.fornecedores]);

  const paraItemDrill = useMemo(() => (l: LancamentoDaSafra): ItemDrill => ({
    id: l.id,
    data: l.data_pagamento || l.data_vencimento || l.data_competencia || '',
    mov: ((l.tipo_operacao || '').startsWith('1') ? 1 : -1) * Math.abs(Number(l.valor) || 0),
    tipo: l.tipo_operacao ?? '',
    produto: l.descricao,
    fornecedor: (l.favorecido_id && nomesDeFavorecidos.get(l.favorecido_id)) || '',
    doc: l.numero_documento || l.documento || '',
    macro: l.macro_custo ?? null,
    grupo: l.grupo_custo ?? null,
    centroPlano: l.centro_custo ?? null,
    subcentro: l.subcentro ?? null,
  }), [nomesDeFavorecidos]);

  /* ⚠ OS ITENS DO DRILL SAEM DO MESMO `bucketDaLinha` QUE A RPC USA. Agrupar pela coluna
     `cultura` crua faria a lista discordar da célula clicada em toda safra que tenha
     lançamento com cultura não plantada — que é justamente a que mais precisa de conferência. */
  const itensDiretos: ItemDrill[] = useMemo(() => {
    if (!drill) return [];
    const grupo = GRUPO_DA_LINHA[drill.ordem];
    const tipo = TIPO_DA_LINHA[drill.ordem];
    if (!grupo || !tipo) return [];
    return lancamentos
      .filter(l => l.grupo_custo === grupo && l.tipo_operacao === tipo
        && bucketDaLinha(l.cultura, l.grupo_custo, m.culturas) === drill.cultura)
      .map(paraItemDrill);
  }, [drill, lancamentos, paraItemDrill, m.culturas]);

  /**
   * O POOL QUE A LINHA RATEIA — os lançamentos SEM cultura que a RPC distribuiu por área.
   *
   * ⚠ ELES APARECEM PELO VALOR CHEIO, e a nota do cabeçalho diz o peso. Multiplicar cada
   * lançamento pelo peso inventaria centavos que não existem em lugar nenhum — nem no banco,
   * nem no extrato — e o operador não conseguiria casar a linha com a nota fiscal dela.
   */
  const itensDoPool: ItemDrill[] = useMemo(() => {
    if (!drill || drill.cultura === COL_NAO_APROPRIADO || !temParteRateada(drill.ordem)) return [];
    if (drill.ordem === LINHA.rateioAdmin) return poolAdmin.lancamentos.map(paraItemDrill);
    const grupos = POOL_DA_LINHA[drill.ordem] ?? [];
    return lancamentos
      .filter(l => l.tipo_operacao === '2-Saídas' && (l.grupo_custo ?? '') !== ''
        && grupos.includes(l.grupo_custo ?? '')
        && bucketDaLinha(l.cultura, l.grupo_custo, m.culturas) === COL_COMPARTILHADO)
      .map(paraItemDrill);
  }, [drill, lancamentos, poolAdmin.lancamentos, paraItemDrill, m.culturas]);

  /**
   * ⚠ O RATEADO É A CÉLULA MENOS O DIRETO, e nunca `pool × peso` refeito aqui. A RPC já
   * arredondou uma vez; refazer a conta no front criaria um segundo resultado e a soma do
   * drawer deixaria de fechar com o número clicado por centavos — a diferença mais cara de
   * conferir, porque parece erro de regra e é erro de aritmética repetida.
   */
  const valorDaCelula = drill ? valorDe(m, drill.cultura, drill.ordem) : null;
  const totalDireto = itensDiretos.reduce((s, it) => s + Math.abs(it.mov), 0);
  const totalDoPool = itensDoPool.reduce((s, it) => s + Math.abs(it.mov), 0);
  const totalRateado = (valorDaCelula ?? 0) - totalDireto;
  const pesoDoDrill = drill ? pesoDaCultura(m, drill.cultura) : null;

  /**
   * AS DUAS SEÇÕES DO DRAWER, como valores — PR-AGRI-DRE-DRILL-13.
   *
   * ⚠ ELAS SÃO USADAS EM DOIS ARRANJOS e por isso saíram do JSX do drawer: sozinha, a seção
   * ocupa o painel inteiro; juntas, cada uma vira o conteúdo de uma aba. Escrevê-las duas
   * vezes deixaria os dois arranjos livres para divergir — e o que diverge em silêncio neste
   * repo é sempre a segunda cópia.
   */
  const secaoDireta = drill && GRUPO_DA_LINHA[drill.ordem] != null ? (

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2 border-b pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                Direto da cultura
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatMoeda(totalDireto)} · {itensDiretos.length} lançamento{itensDiretos.length === 1 ? '' : 's'}
              </span>
            </div>
            <DrillDownEconomico
              itens={itensDiretos}
              raiz={GRUPO_DA_LINHA[drill.ordem] ?? ''}
              niveis={NIVEIS_DRILL.slice(2)}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
          </div>
  ) : null;

  const secaoRateada = drill && itensDoPool.length > 0 ? (

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2 border-b pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                Rateado por área
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatMoeda(totalRateado)}
                {pesoDoDrill != null && m.areaTotal != null && (
                  <> · {formatNum(pesoDoDrill * 100, 1)}% da área
                    ({formatNum(m.areaPorCultura.get(drill.cultura) ?? 0, 1)} de {formatNum(m.areaTotal, 1)} ha)</>
                )}
              </span>
            </div>
            {/* ⚠ A NOTA É FIXA E FICA NO TOPO DA LISTA, não num rodapé: sem ela o operador lê
                R$ 5,9 milhões de pool dentro de uma célula de R$ 5,1 milhões e conclui que a
                tela está somando errado. O que ele vê é o pool INTEIRO; o que a cultura
                recebe é a fração dita ao lado. */}
            <p className="mb-1.5 shrink-0 rounded bg-muted/60 px-2 py-1 text-[9px] leading-snug text-muted-foreground">
              Valores do pool comum, inteiros — a cultura recebe{' '}
              {pesoDoDrill != null ? `${formatNum(pesoDoDrill * 100, 1)}%` : 'a fração'} dele por área.
              {drill.ordem === LINHA.rateioAdmin && poolAdmin.porAno.length > 0 && (
                <> O administrativo entra antes pelo percentual declarado de cada ano:{' '}
                  {poolAdmin.porAno.map(a => `${a.ano} ${a.percentual != null ? `${formatNum(a.percentual, 0)}%` : '— não declarado'}`).join(' · ')}.</>
              )}
              {' '}Pool listado: {formatMoeda(totalDoPool)} em {itensDoPool.length} lançamento{itensDoPool.length === 1 ? '' : 's'}.
            </p>
            <DrillDownEconomico
              itens={itensDoPool}
              raiz={drill.ordem === LINHA.rateioAdmin ? 'Administrativo da janela' : 'Pool comum sem cultura'}
              /* Com mais de um grupo no pool, o grupo volta a ser um degrau — senão centros de
                 custo de juros e de insumo apareceriam lado a lado sem dizer de onde vêm. */
              niveis={(POOL_DA_LINHA[drill.ordem]?.length ?? 2) > 1 || drill.ordem === LINHA.rateioAdmin
                ? NIVEIS_DRILL.slice(1) : NIVEIS_DRILL.slice(2)}
              onAbrirLancamento={(id) => { void abrirLancamento(id); }} />
          </div>
  ) : null;

  return (
    <div className="w-full space-y-3 p-4 pb-20 animate-fade-in">
      {/* ── CABEÇALHO ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">DRE por cultura</h2>
          <p className="text-xs text-muted-foreground">{clienteAtual?.nome ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* ⚠ O BOTÃO DESLIGADO DIZ POR QUÊ, ao lado e por escrito — a mesma regra da OC. Um
              "Pecuária" que não responde ao clique e não explica nada é lido como defeito. */}
          <div>
            <Label className="text-[10px]">Atividade</Label>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5">
                {(['lavoura', 'pecuaria'] as const).map(a => (
                  <button key={a} type="button"
                    disabled={a === 'pecuaria'}
                    title={a === 'pecuaria' ? 'O DRE de pecuária ainda não existe.' : undefined}
                    onClick={() => setAtividade(a)}
                    className={cn('rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                      atividade === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      a === 'pecuaria' && 'cursor-not-allowed opacity-50')}>
                    {a === 'lavoura' ? 'Lavoura' : 'Pecuária'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] leading-tight text-muted-foreground">
                o DRE de pecuária<br />ainda não existe
              </span>
            </div>
          </div>
          <div className="w-[220px]">
            {/* ⚠ SELECT, E NÃO CARDS: não existe seletor de safra reusável no repo — o do
                FIN-PAINEL-SAFRA-01 é um `Select` embutido no `PainelPeriodoTab`, não extraído.
                Criar um segundo desenho aqui seria a terceira forma de escolher safra no
                sistema. A lista é a mesma do resto da lavoura (`useSafrasLavoura`). */}
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          <b>O DRE não pôde ser lido.</b> {erro}
        </div>
      )}

      {!erro && !carregando && m.vazio && safraId && (
        <div className="rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">
          Esta safra ainda não tem lançamento nem área — nada a apurar.
        </div>
      )}

      {!m.vazio && (
        <>
          {/* ── QUATRO NÚMEROS DE TOPO, todos do __total__ ── */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricCard rotulo="Área plantada"
              valor={m.areaTotal != null && m.areaTotal > 0 ? `${formatNum(m.areaTotal, 1)} ha` : '—'} />
            <MetricCard rotulo="Receita líquida"
              valor={formatMoeda(valorDe(m, COL_TOTAL, LINHA.receitaLiquida))} />
            <MetricCard rotulo="Resultado de caixa"
              valor={formatMoeda(resultadoTotal)}
              cor={resultadoTotal != null && resultadoTotal < 0 ? 'text-destructive' : 'text-success'} />
            <MetricCard rotulo="Resultado por ha"
              valor={porHaTotal != null ? `${formatMoeda(porHaTotal)}/ha` : '—'}
              cor={porHaTotal != null && porHaTotal < 0 ? 'text-destructive' : undefined} />
          </div>

          {/* ⚠ ÂMBAR SE GUARDA PARA O QUE PRECISA DE AÇÃO. O rateio é o funcionamento normal da
              tela, não um defeito: dizê-lo em faixa de alerta, todo mês, ensina o operador a
              ignorar a cor — e no dia do aviso de verdade (o % não declarado, logo abaixo) ele
              já não olha. A explicação fica em observação neutra, no mesmo lugar de sempre. */}
          {houveRateio(m) && (
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
              <Calculator className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <b className="font-medium text-foreground">{formatMoeda(rateado)}</b> em custos comuns
                foram rateados por área entre as culturas — as duas linhas de rateio são estimativa,
                não lançamento; abri-las mostra o pool comum que as originou.
              </span>
            </p>
          )}

          {!m.rateioAdminDeclarado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Falta cadastrar o % de rateio administrativo de algum ano desta safra — o rateio
                administrativo pode estar incompleto.
              </span>
            </div>
          )}

          {/* ── A CASCATA ──
              ⚠ O CABEÇALHO FICA. O scrollport é o próprio card (altura limitada), e é nele que
              o `sticky` ancora: sem essa altura ele subiria junto com a página, que é a
              armadilha já paga duas vezes na casa. A coluna de rótulos gruda à esquerda pelo
              mesmo motivo, na rolagem horizontal — com muitas culturas, o número sem o nome da
              linha não se lê. */}
          <Card className="rounded-md">
            <CardContent className="max-h-[70vh] overflow-auto p-0 rolagem-fina">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 border-b bg-card px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cultura
                    </th>
                    {colunas.map(c => (
                      <th key={c} className={cn('sticky top-0 z-20 border-b bg-card px-2 py-1 text-right align-bottom',
                        /* ⚠ O TOTAL É UM CARD CINZA que começa no cabeçalho e fecha na última
                           linha de rateio: ele não é "mais uma cultura", é a leitura da safra
                           inteira, e a cor o separa das colunas que se comparam entre si. */
                        c === COL_TOTAL && 'bg-muted/40',
                        c === COL_NAO_APROPRIADO && 'bg-muted/20')}>
                        <div className={cn('text-[11px] font-bold',
                          c === COL_NAO_APROPRIADO ? 'text-muted-foreground' : 'text-foreground')}>
                          {tituloColuna(c)}
                        </div>
                        {c === COL_NAO_APROPRIADO && (
                          <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">
                            sem cultura decidida
                          </div>
                        )}
                        {c !== COL_TOTAL && c !== COL_NAO_APROPRIADO && (
                          m.areaCadastrada.get(c) === false ? (
                            <div className="mt-0.5 flex flex-col items-end gap-0.5">
                              <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                área não cadastrada
                              </span>
                              <span className="text-[9px] text-muted-foreground">— · não recebe rateio</span>
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">
                              {formatNum(m.areaPorCultura.get(c) ?? 0, 1)} ha
                            </div>
                          )
                        )}
                        {c === COL_TOTAL && m.areaTotal != null && (
                          <div className="mt-0.5 text-[9px] font-normal text-muted-foreground">
                            {formatNum(m.areaTotal, 1)} ha
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ORDENS_CASCATA.map(ordem => {
                    const subtotal = ORDENS_SUBTOTAL.includes(ordem);
                    const rateio = ehLinhaRateio(ordem);
                    const resultado = ordem === LINHA.resultadoCaixa;
                    const rotulo = m.rotulos.get(ordem) ?? '';
                    return (
                      <tr key={ordem} className={cn(
                        subtotal && 'border-t',
                        /* ⚠ A FAIXA DO RESULTADO ATRAVESSA A LINHA INTEIRA, Total incluído:
                           quebrar a cor no Total sugeriria que ele é outra coisa, e era isso
                           que o card cinza fazia — deixava um retalho no fim da faixa.
                           ⚠ E ELA É NEUTRA, NÃO VERDE, por causa do número: nesta linha o valor
                           é verde ou vermelho conforme o sinal, e verde sobre verde sumiria
                           justamente na cultura que fechou no azul. Fundo neutro, número
                           colorido — cada um diz uma coisa. */
                        resultado && 'bg-muted',
                      )}>
                        <td className={cn('sticky left-0 z-10 px-2 py-0.5 text-left leading-tight',
                          /* Opaca nos dois casos: a coluna gruda à esquerda e as linhas
                             passariam por baixo do rótulo se o fundo fosse translúcido. */
                          resultado ? 'bg-muted' : 'bg-card',
                          subtotal && 'font-bold')}>
                          <span className="inline-flex items-center gap-1">
                            {rotulo}
                            {/* ⚠ O ÍCONE DIZ "ESTE NÚMERO FOI CALCULADO", e continua verdade
                                agora que as duas linhas abrem: o que se abre é o POOL que foi
                                rateado, não um lançamento da cultura. */}
                            {rateio && (
                              <span title="Valor estimado: rateio por área — clique no número para ver o pool que o originou"
                                className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <Calculator className="h-2.5 w-2.5" /> estimado
                              </span>
                            )}
                          </span>
                        </td>
                        {colunas.map(c => {
                          const valor = valorDe(m, c, ordem);
                          const traco = exibeTraco(ordem, valor, c);
                          const abre = celulaTemDrill(ordem, c) && valor != null && valor !== 0;
                          return (
                            <td key={c} className={cn('px-2 py-0.5 text-right tabular-nums leading-tight',
                              c === COL_TOTAL && !resultado && 'bg-muted/40',
                              c === COL_NAO_APROPRIADO && !resultado && 'bg-muted/20',
                              subtotal && 'font-bold',
                              corDoNumero(ordem, valor, traco, rotulo))}>
                              {traco ? '—' : abre ? (
                                <button type="button"
                                  onClick={() => setDrill({ cultura: c, ordem })}
                                  /* ⚠ O CLICÁVEL SE ANUNCIA NO HOVER, não o tempo todo: o
                                     tracejado fixo embaixo de cada número riscava a matriz
                                     inteira e competia com os próprios valores, que são o que
                                     se veio ler. */
                                  className="rounded px-0.5 underline-offset-2 hover:bg-muted/60 hover:underline">
                                  {formatMoeda(valor)}
                                </button>
                              ) : formatMoeda(valor)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {m.temNaoApropriado && (
            <p className="text-[10px] leading-snug text-muted-foreground">
              A coluna <b className="font-medium text-foreground">Não apropriado</b> reúne o que ainda
              não tem cultura decidida — receita sem cultura marcada e lançamento marcado com cultura
              que não foi plantada nesta safra. Ela não recebe rateio e não entra no resultado de
              nenhuma cultura; classificar esses lançamentos é o que move o número para elas.
            </p>
          )}

          {/* ── ABAIXO DA LINHA ── */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Abaixo da linha de caixa — não entra no resultado do período
            </p>
            <Card className="rounded-md">
              <CardContent className="overflow-x-auto p-0 rolagem-fina">
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    {ORDENS_ABAIXO_DA_LINHA.map(ordem => {
                      const rotulo = m.rotulos.get(ordem) ?? '';
                      return (
                        <tr key={ordem} className="border-b last:border-0">
                          <td className="sticky left-0 z-10 bg-card px-2 py-0.5 text-left leading-tight">
                            {rotulo}
                            {ordem === LINHA.depreciacao && (
                              <span className="ml-1 text-[9px] text-muted-foreground">(reservada)</span>
                            )}
                          </td>
                          {colunas.map(c => {
                            const valor = valorDe(m, c, ordem);
                            const traco = exibeTraco(ordem, valor, c);
                            const abre = celulaTemDrill(ordem, c) && valor != null && valor !== 0;
                            return (
                              <td key={c} className={cn('px-2 py-0.5 text-right tabular-nums leading-tight',
                                c === COL_TOTAL && 'bg-muted/40',
                                c === COL_NAO_APROPRIADO && 'bg-muted/20',
                                traco && 'text-muted-foreground')}>
                                {traco ? '—' : abre ? (
                                  <button type="button"
                                    onClick={() => setDrill({ cultura: c, ordem })}
                                    /* ⚠ O CLICÁVEL SE ANUNCIA NO HOVER, não o tempo todo: o
                                     tracejado fixo embaixo de cada número riscava a matriz
                                     inteira e competia com os próprios valores, que são o que
                                     se veio ler. */
                                  className="rounded px-0.5 underline-offset-2 hover:bg-muted/60 hover:underline">
                                    {formatMoeda(valor)}
                                  </button>
                                ) : formatMoeda(valor)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* ── UM CARD POR CULTURA ── */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {m.culturas.map(c => {
              const porHa = resultadoPorHa(m, c);
              const pct = percentualCustoDireto(m, c);
              return (
                <div key={c} className="rounded-md border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-bold text-foreground">{labelDaCultura(c)}</span>
                    <span className={cn('text-[13px] font-medium tabular-nums',
                      porHa != null && porHa < 0 ? 'text-destructive' : 'text-foreground')}>
                      {porHa != null ? `${formatMoeda(porHa)}/ha` : '—'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    {/* ⚠ O SELO É SOBRE CUSTO. Não existe "% de receita apropriada" porque a RPC
                        não decompõe receita por cultura — a receita que ninguém marcou fica em
                        "Não apropriado", e a nota ao lado diz isso em vez de deixar o selo
                        insinuar o contrário. */}
                    {pct != null && (
                      <span className="rounded bg-muted px-1 py-0.5 font-medium">
                        custos {pct}% apropriados direto
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Sprout className="h-3 w-3" /> receita só entra quando a cultura é marcada
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── O DRILL ──
          ⚠ MESMO DRAWER E MESMA ÁRVORE DO PAINEL POR PERÍODO, sem cópia. O que é próprio daqui
          são as DUAS SEÇÕES: a célula de uma cultura pode ser direto + rateado, e um drawer de
          seção única mostraria uma fração do número clicado. */}
      {drill && (
        <AnaliseDrawer
          /* ⚠ A SAFRA ENTRA NO TÍTULO porque o drawer sobrevive a uma troca de contexto na
             cabeça do operador: ele abre o detalhe, vai conferir a nota fiscal, volta — e o
             número só quer dizer alguma coisa junto do período a que pertence. */
          titulo={`${tituloColuna(drill.cultura)} · ${m.rotulos.get(drill.ordem) ?? ''}`
            + (safraAtual ? ` · Safra ${safraAtual.codigo || safraAtual.nome}` : '')}
          subtitulo={pesoDoDrill != null && totalRateado > 0.005
            ? `direto + rateado por área · ${formatNum(pesoDoDrill * 100, 1)}% da área da safra`
            : `${GRUPO_DA_LINHA[drill.ordem] ?? ''} · ${itensDiretos.length} lançamento${itensDiretos.length === 1 ? '' : 's'}`}
          total={valorDaCelula ?? 0}
          totalLabel="TOTAL DA CÉLULA"
          onClose={() => setDrill(null)}>

          {/* ⚠ ABA SÓ QUANDO HÁ AS DUAS. Uma aba solitária é um rótulo que não decide nada, e
              custa a altura de uma linha que a lista quer. Hoje só o Investimento tem direto e
              rateado; nas demais células a seção única entra direto, como sempre entrou.
              ⚠ ABRE NA DIRETA porque ela é o gasto que alguém marcou naquela cultura — o
              rateado é estimativa por área, e estimativa não é o que se confere primeiro.
              ⚠ TROCAR DE ABA RECOMEÇA A NAVEGAÇÃO, e é de graça: o Radix não monta os FILHOS
              da aba inativa (`present && children`), então o caminho que o `DrillDownEconomico`
              guarda no state dele se perde junto. Voltar para a aba devolve a raiz, não um
              degrau esquecido de minutos atrás.
              ⚠ MAS O DIV DA ABA INATIVA CONTINUA NO FLUXO — medido no Radix instalado: ele
              renderiza `<div hidden>` e só os filhos somem. E `[hidden]{display:none}` do
              preflight PERDE para `.flex{display:flex}`: mesma especificidade, e as utilities
              vêm depois no CSS. Com `flex` cru aqui, o painel repartia a altura com uma caixa
              VAZIA e a segunda aba abria empurrada para baixo dela. Por isso o `display` é
              condicionado ao estado, nunca escrito solto. */}
          {secaoDireta && secaoRateada ? (
            <Tabs defaultValue="direta" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mb-1 grid h-7 w-full shrink-0 grid-cols-2">
                <TabsTrigger value="direta" className="text-[10px]">
                  Direto da cultura · {formatMoeda(totalDireto)}
                </TabsTrigger>
                <TabsTrigger value="rateada" className="text-[10px]">
                  Rateado por área · {formatMoeda(totalRateado)}
                </TabsTrigger>
              </TabsList>
              {/* `mt-0` cancela a margem padrão do primitivo: aqui quem dá o respiro é a aba. */}
              <TabsContent value="direta"
                className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden">
                {secaoDireta}
              </TabsContent>
              <TabsContent value="rateada"
                className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex data-[state=inactive]:hidden">
                {secaoRateada}
              </TabsContent>
            </Tabs>
          ) : (secaoDireta ?? secaoRateada)}
        </AnaliseDrawer>
      )}

      {/* ⚠ O MODAL É IRMÃO DO DRAWER, NUNCA FILHO — é o que faz a volta funcionar de graça:
          fechar a edição não desmonta o drawer, então o breadcrumb, a ordenação e o degrau
          continuam onde estavam. Aninhá-lo dentro do drawer reconstruiria a árvore a cada
          abertura e devolveria o operador à raiz. */}
      <LancamentoV2Dialog
        open={!!editando}
        onClose={() => setEditando(null)}
        onSave={async (form, id) => {
          const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
          /* ⚠ AS DUAS FONTES RECARREGAM, e nenhuma das duas é opcional: a matriz é somada no
             banco e a lista do drill é lida do PostgREST. Atualizar só uma deixaria a célula
             dizendo um número e o detalhe dela outro — na mesma tela, ao mesmo tempo. */
          if (ok && id) {
            /* ⚠ AS TRÊS FONTES, e nenhuma sobra: a matriz vem da RPC, a lista das seções
               diretas vem da query da safra, e a seção rateada do administrativo vem de uma
               query PRÓPRIA — o lançamento administrativo tem `safra_id` nulo e não está na
               da safra. Recarregar duas das três é o pior dos mundos: a célula muda e o
               detalhe dela não, na mesma tela aberta. */
            await recarregarLancamentos();
            await poolAdmin.recarregar();
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
