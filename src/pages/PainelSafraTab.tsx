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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sprout, Info } from 'lucide-react';
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

/** Cabeçalho azul das três colunas, como o resto da família. */
const TH = 'bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-wide'
  + ' text-primary-foreground';

/**
 * O CABEÇALHO CINZA DAS TABELAS DE APOIO — talhão e histórico.
 *
 * ⚠ DOIS AZUIS SEGUIDOS VIRAM UM SÓ. O DRE e o Investimento são a resposta principal e ficam no
 * azul da casa; talhão e histórico são leitura de apoio, e repetir o azul neles fazia quatro
 * faixas iguais empilhadas — o olho perdia onde uma seção terminava e a outra começava.
 * ⚠ O CINZA NÃO É NOVO: é o `PALETA.CINZA_CABECALHO` do chassi do PDF (88,96,105), já usado no
 * cabeçalho e no total das tabelas impressas. Papel e tela passam a falar a mesma língua.
 */
const TH_CINZA = 'bg-[#58606a] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide'
  + ' text-white';

/**
 * A ZEBRA, LINHA A LINHA — e explicitamente, nunca por `:nth-child`.
 *
 * ⚠ O SELETOR NÃO PEGA AQUI, e o mock provou: `odd:`/`nth-child` contam o `<tr>` DENTRO do pai,
 * e o corpo destas tabelas é montado por `map` com linhas condicionais ao redor — basta uma
 * linha aparecer ou sumir (uma safra sem colheita, um talhão a menos) para toda a alternância
 * inverter. Pintar pelo índice do dado é o que mantém a faixa onde ela estava.
 */
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
 * ⚠ A UNIDADE SOBE PARA O RÓTULO, e é o que impede o corte — item 2 do F2.
 *
 * MEDIDO com a fonte compilada, e o corte é ESTRUTURAL, não de tamanho: o bloco Colheita tem
 * cinco cartões em meia tela, o que dá ~88px de texto por cartão em 1440 e ~72px em 1280.
 * "R$ 2.742.022,26" pede 157px em 20px e ainda 107px em 13px — não existe fonte acima do piso
 * que o faça caber. O maior número real da base é 6.087.725,25 (investimento da 25/26), então
 * não é caso de borda.
 * ⚠ TRÊS CORTES, NESTA ORDEM, cada um medido: o "R$ " sai do número e vira unidade de 9px no
 * rótulo (−20px); os centavos saem (−20px); e a fonte do bloco denso cai para 13px. Só o
 * conjunto cabe: 65,9px contra os 72px disponíveis na tela mais estreita.
 * ⚠ OS CENTAVOS NÃO SE PERDEM — eles seguem no `title` e, exatos, na tabela do DRE logo abaixo.
 * O cartão é o relance; a conferência é a tabela.
 */
function Cartao({ rotulo, valor, nota, unidade, titulo, denso }: {
  rotulo: string;
  valor: string;
  nota?: string;
  /** "R$", "ha", "sc" — some do número e aparece ao lado do rótulo, em 9px. */
  unidade?: string;
  /** O valor por extenso, com centavos, no hover. */
  titulo?: string;
  /** O bloco tem cinco cartões em meia tela: 13px em vez de 20px. */
  denso?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1.5">
      <div className="flex items-baseline gap-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 truncate">{rotulo}</span>
        {unidade && <span className="shrink-0 normal-case opacity-70">{unidade}</span>}
      </div>
      {/* ⚠ O `truncate` FICA como última defesa, mesmo com a conta fechando: uma safra futura
          pode passar da casa dos milhões, e cortar com o inteiro no `title` é melhor que empurrar
          o cartão vizinho para fora do bloco. */}
      <div className={cn('mt-0.5 truncate font-medium leading-none tabular-nums',
        denso ? 'text-[13px]' : 'text-[20px]')} title={titulo}>
        {valor}
      </div>
      {/* ⚠ ALTURA RESERVADA MESMO SEM NOTA: sem o `min-h`, um cartão com nota e outro sem
          teriam alturas diferentes na mesma linha, e a régua de cima dançaria ao trocar de
          safra. */}
      <div className="mt-0.5 min-h-[12px] text-[9px] text-muted-foreground">{nota ?? ''}</div>
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
     descansar o olho vira a mais apertada da tabela. */
  const pad = nivel === 'item' ? 'py-0.5' : 'py-1';
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
        destaque && 'text-[15px] font-bold',
        saldo && 'text-[17px] font-bold',
        nivel === 'item' && 'pl-6 text-[11px] text-muted-foreground')}>
        {rotulo}
        {/* ⚠ "estimado" FICA COLADO NO RÓTULO, não numa coluna própria: é qualidade do número,
            e quem lê a linha tem de ver a ressalva sem procurar. */}
        {nota && <span className="ml-1 text-[9px] font-normal text-amber-600">{nota}</span>}
      </td>
      <td className={cn(td, destaque && 'text-[15px] font-bold', saldo && 'text-[17px] font-bold',
        nivel === 'item' && 'text-[11px]', cor)}>
        {formatMoeda(valor)}
      </td>
      <td className={cn(td, destaque && 'text-[15px] font-bold', saldo && 'text-[17px] font-bold',
        nivel === 'item' && 'text-[11px]', cor)}>
        {formatMoeda(porHa(valor, area))}
      </td>
      {/* ⚠ A % FICA CINZA MESMO NA LINHA VERMELHA: ela não é dinheiro, é proporção — pintá-la
          de vermelho junto faria três colunas gritando a mesma coisa e nenhuma sobressaindo. */}
      <td className={cn(td, nivel === 'item' && 'text-[11px]', 'text-muted-foreground')}>
        {pct == null ? '' : `${formatNum(pct, 1)}%`}
      </td>
      <td className={cn(td, destaque && 'text-[15px] font-bold', saldo && 'text-[17px] font-bold',
        nivel === 'item' && 'text-[11px]', cor)}>
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

  const talhoesDaCultura = useMemo(
    () => talhoes.filter(t => t.cultura === cultura), [talhoes, cultura]);

  const { painel, carregando, erro } = usePainelSafra(clienteId, safraId || null, cultura || null);
  const { safras: comparadas } = useComparativoSafras(clienteId, cultura || null);
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
  const { lancamentos, fornecedores } = useLancamentosDaSafra(clienteId, safraId || null);
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

  return (
    <div className="w-full space-y-2 p-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Painel da Safra</h2>
          <p className="text-xs text-muted-foreground">
            O ciclo inteiro: o que plantou, colheu, gastou e sobrou — por hectare e por saca.
          </p>
        </div>
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

      {/* ── O CABEÇALHO DO CICLO ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-2.5 py-1.5">
        <Sprout className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-bold">{cultura ? labelDaCultura(cultura) : '—'}</span>
        <span className="text-[11px] text-muted-foreground">{safra?.codigo || safra?.nome || '—'}</span>
        <span className="text-[11px] text-muted-foreground">{formatNum(area, 2)} ha</span>
        {/* ⚠ O NOME DO TALHÃO, NUNCA O ID — e todos, não "e mais N": são poucos por cultura
            (medido: de 1 a 3), e esconder o terceiro obrigaria a abrir outra tela para saber
            de onde veio o número. */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
          title={talhoesDaCultura.map(t => t.pastoNome).join(' · ')}>
          {talhoesDaCultura.length === 0 ? '—' : talhoesDaCultura.map(t => t.pastoNome).join(' · ')}
        </span>
      </div>

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
      <div className="sticky top-0 z-20 -mx-4 -mt-2 grid gap-2 bg-background px-4 pb-2 pt-2
        md:grid-cols-2">
        <div className="rounded-md border p-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Plantio</div>
          {/* ⚠ TRÊS CARTÕES EM MEIA TELA CABEM EM 20px — medido: ~167px de texto cada, e o
              maior número real pede 101px. Só o bloco de CINCO é que aperta. */}
          <div className="grid grid-cols-3 gap-1.5">
            <Cartao rotulo="Área" unidade="ha" valor={formatNum(area, 2)} />
            <Cartao rotulo="Custeio total" unidade="R$" valor={formatNum(custeio, 0)}
              titulo={formatMoeda(custeio)} />
            <Cartao rotulo="Custeio / ha" unidade="R$" valor={formatNum(porHa(custeio, area), 0)}
              titulo={formatMoeda(porHa(custeio, area))} />
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Colheita</div>
          {/* ⚠ O BLOCO DENSO: cinco cartões em meia tela. Todos em 13px, inclusive os curtos —
              três tamanhos numa fila só fariam o olho ler uma hierarquia que não existe entre
              eles. `R$ / sc` MANTÉM OS CENTAVOS, e é a exceção com motivo: é um PREÇO, e 90
              contra 90,37 é a diferença que o produtor negocia; ele cabe folgado (43px). */}
          <div className="grid grid-cols-5 gap-1.5">
            <Cartao denso rotulo="sc / ha" valor={formatNum(painel?.sacas_ha ?? 0, 2)} />
            <Cartao denso rotulo="R$ / sc" unidade="R$"
              valor={formatNum(porSaca(painel?.faturamento ?? 0, sacas), 2)} />
            <Cartao denso rotulo="Total sc" unidade="sc" valor={formatNum(sacas, 2)} nota="boas + roça" />
            <Cartao denso rotulo="Faturamento" unidade="R$"
              valor={formatNum(painel?.faturamento ?? 0, 0)}
              titulo={formatMoeda(painel?.faturamento ?? 0)} />
            <Cartao denso rotulo="Fat. / ha" unidade="R$"
              valor={formatNum(porHa(painel?.faturamento ?? 0, area), 0)}
              titulo={formatMoeda(porHa(painel?.faturamento ?? 0, area))} />
          </div>
        </div>
      </div>

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
              <th className={cn(TH, 'text-left')}>Linha</th>
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
                onAbrir={() => setDrill({ tipo: 'centro', chave: n.centro, rotulo: n.centro })} />
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
            {(painel?.rateio_admin ?? 0) !== 0 && (
              <Linha rotulo="Rateio administrativo" valor={painel?.rateio_admin ?? 0}
                area={area} sacas={sacas} nivel="item" cor="text-destructive"
                pct={custeio > 0 ? ((painel?.rateio_admin ?? 0) / custeio) * 100 : undefined} />
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
                <th className={cn(TH, 'text-left')}>Investimento na abertura</th>
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
                  onClick={() => setDrill({ tipo: 'subcentro', chave: t.tipo, rotulo: t.tipo })}
                  tabIndex={0} role="button" aria-label={`Ver lançamentos de ${t.tipo}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDrill({ tipo: 'subcentro', chave: t.tipo, rotulo: t.tipo });
                    }
                  }}>
                  <td className="px-2 py-0.5 pl-6 text-[11px] text-muted-foreground">{t.tipo}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-destructive">
                    {formatMoeda(t.valor)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-destructive">
                    {formatMoeda(t.valor_ha)}
                  </td>
                  <td />
                  <td />
                </tr>
              ))}
              {/* ⚠ FAIXA ESCURA NO TOTAL, o mesmo `bg-primary` do cabeçalho: as duas bordas da
                  tabela fecham iguais, como no `tfoot` das listas da colheita. Aqui ela substitui
                  o negrito solto sobre fundo branco, que se confundia com mais uma linha de
                  investimento. */}
              <tr className="bg-primary text-primary-foreground">
                <td className="px-2 py-1 text-[15px] font-bold">Total investido</td>
                <td className="px-2 py-1 text-right text-[15px] font-bold tabular-nums">
                  {formatMoeda(painel?.investimento ?? 0)}
                </td>
                <td className="px-2 py-1 text-right text-[15px] font-bold tabular-nums">
                  {formatMoeda(porHa(painel?.investimento ?? 0, area))}
                </td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Fora do resultado do ciclo: vira patrimônio e amortiza em anos. Está aqui para o
            produtor ver quanto a safra consumiu de caixa ao todo, não só de custeio.
          </p>
        </div>
      )}

      {/* ── POR TALHÃO / VARIEDADE ── */}
      {(painel?.talhoes.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {['24%', '22%', '13%', '15%', '14%', '12%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(TH_CINZA, 'text-left')}>Talhão</th>
                <th className={cn(TH_CINZA, 'text-left')}>Variedade</th>
                <th className={cn(TH_CINZA, 'text-right')}>Área ha</th>
                <th className={cn(TH_CINZA, 'text-right')}>Sacas</th>
                <th className={cn(TH_CINZA, 'text-right')}>sc / ha</th>
                <th className={cn(TH_CINZA, 'text-right')}>Cargas</th>
              </tr>
            </thead>
            <tbody>
              {painel?.talhoes.map((t, i) => (
                <tr key={`${t.talhao}·${t.variedade ?? ''}`}
                  className={cn('border-t border-slate-100', zebra(i))}>
                  <td className="truncate px-2 py-0.5 text-[11px]" title={t.talhao}>{t.talhao}</td>
                  {/* ⚠ `—` PARA VARIEDADE NULA: a coluna existe sempre, porque some-la quando
                      nenhum talhão tem variedade faria a tabela mudar de forma entre safras. */}
                  <td className="truncate px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t.variedade ?? '—'}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.area_ha, 2)}</td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(t.sacas, 2)}</td>
                  {/* ⚠ O MELHOR EM NEGRITO SÓ QUANDO HÁ COM QUEM COMPARAR. Com um talhão só,
                      destacar a única linha sugeriria um ranking que não existe. */}
                  <td className={cn('px-2 py-0.5 text-right text-[11px] tabular-nums',
                    i === 0 && (painel?.talhoes.length ?? 0) > 1 && 'font-bold text-success')}>
                    {formatNum(t.sacas_ha, 2)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                    {t.cargas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
            Só a <strong>produtividade</strong> é real por talhão. O custo não aparece aqui porque
            o lançamento financeiro guarda safra e cultura, nunca o talhão — custo por talhão vem
            quando o lançamento marcar talhão.
          </p>
        </div>
      )}

      {/* ── COMPARATIVO ENTRE SAFRAS (fatia C) ── */}
      {comparadas.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['16%', '13%', '15%', '14%', '16%', '15%', '11%'].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH_CINZA, 'text-left')}>Safra</th>
                  <th className={cn(TH_CINZA, 'text-right')}>Área ha</th>
                  <th className={cn(TH_CINZA, 'text-right')}>Sacas</th>
                  <th className={cn(TH_CINZA, 'text-right')}>sc / ha</th>
                  <th className={cn(TH_CINZA, 'text-right')}>Receita / ha</th>
                  <th className={cn(TH_CINZA, 'text-right')}>Custeio direto</th>
                  <th className={cn(TH_CINZA, 'text-right')}>% roça</th>
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
                      <td className="truncate px-2 py-0.5 text-[11px]">
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
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">{formatNum(sf.area_ha, 2)}</td>
                      {/* ⚠ SEM COLHEITA É "—", NÃO ZERO: a 26/27 tem 279 ha plantados e o grão no
                          chão; zero afirmaria fracasso sobre safra que nem terminou. */}
                      <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                        {colheu(sf) ? formatNum(sf.total_sacas, 2) : '—'}
                      </td>
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
                        sf.custeio_direto > 0 && 'text-destructive')}>
                        {sf.custeio_direto > 0 ? formatMoeda(sf.custeio_direto) : '—'}
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
            {/* ⚠ A RESSALVA DO CUSTEIO FICA ESCRITA: esta coluna é o DIRETO, sem o rateio
                administrativo. Quem subtrair receita menos custeio aqui acha um saldo diferente
                do que o DRE mostra, e tem de saber por quê antes de desconfiar de um dos dois. */}
            <p className="border-t bg-muted/40 px-2 py-1 text-[10px] leading-snug text-muted-foreground">
              <strong>Custeio direto</strong> é só o que está lançado na safra — sem o rateio
              administrativo, que entra no DRE por janela de datas. Não subtraia da receita aqui:
              o saldo do ciclo é o da tabela do topo.
            </p>
          </div>

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
        const comColheita = comparadas.filter(colheu);
        return (
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
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
        );
      })()}

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
          ⚠ SEM `onAbrirLancamento`: abrir o lançamento para edição é do DRE, que recarrega as
          três fontes ao salvar. Este painel lê de uma RPC agregada; abrir a edição aqui pediria
          a mesma orquestração de recarga, e sem ela a tela mostraria um número e o detalhe
          dele outro. Fica para quando a fatia 3 decidir. */}
      {drill && (
        <AnaliseDrawer
          titulo={`${drill.rotulo} · ${labelDaCultura(cultura)}`
            + (safra ? ` · Safra ${safra.codigo || safra.nome}` : '')}
          /* ⚠ O SUBTÍTULO DIZ A CONTAGEM, que é o que se confere primeiro contra a tela. */
          subtitulo={`${itensDoDrill.length} lançamento${itensDoDrill.length === 1 ? '' : 's'}`}
          total={totalDoDrill}
          totalLabel="TOTAL DA LINHA"
          onClose={() => setDrill(null)}>
          <DrillDownEconomico itens={itensDoDrill} raiz={drill.rotulo} niveis={NIVEIS_DRILL} />
        </AnaliseDrawer>
      )}
    </div>
  );
}
