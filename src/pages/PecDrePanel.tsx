/**
 * DRE DA PECUÁRIA — a grade por fazenda, num período de meses.
 *
 * ⚠⚠ NENHUM CÁLCULO AQUI. `fn_dre_pecuaria` devolve cada linha por fazenda e no total; as únicas
 * contas são `valor / producao.ha_medio` e o percentual sobre a base — as duas de APRESENTAÇÃO, a
 * mesma licença que o `/ha` tem na lavoura.
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
import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { ChevronRight, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { formatNum } from '@/lib/calculos/formatters';
import {
  W_RS, W_HA, W_RS_TOTAL, larguraDoGrupo, VERDE, VERMELHO, NAVY_TOTAL, BORDA_TOTAL, FUNDO_TOTAL, traco,
  corDoSinal, numeroDaCelula, Celula, CelulaUnit, Etiqueta, Caixas, REGUA_LINHA, tipoDaLinha,
  fundoDaLinha,
  type CaixaFaixa,
} from '@/components/agri/dreGrade';
import { Segmentado } from '@/components/ui/segmentado';
/* ⚠ A RÉGUA DA PECUÁRIA SAIU DAQUI — DRE-HISTORICO-LINHA-01a. A cascata, a conta das unidades e o
   tipo da coluna moram em `drePecRegua`, porque o modal do histórico precisa das MESMAS, e ele é
   montado por esta tela: importar de volta fecharia um ciclo. Nada mudou de corpo. */
import {
  LINHAS_PEC, COM_PERCENTUAL, BASE_DO_PERCENTUAL, ROTULO_DA_BASE, corDoTom, valorDe,
  valorNaUnidade, percentual, centrosDoBloco, UNIDADES_PEC, ROTULO_UNIDADE,
  type DefPec, type ColunaPec, type UnidadePec,
} from '@/components/agri/drePecRegua';
import type { RecorteHistoricoPec } from '@/components/agri/PecHistoricoLinhaModal';
import {
  BLOCO_DA_LINHA, rotuloCurtoPeriodo,
  type DrePecuaria, type DrePecLinhas, type ChaveLinhaPec, type CentroPec, type RecortePec,
  type CenarioPec,
} from '@/hooks/useDrePecuaria';

/* ⚠ 200px NO RÓTULO — DRE-PADRAO-01a-2: a mesma largura da coluna de rótulos da lavoura, para as
   duas abas começarem a tabela no mesmo x. Era 190 antes do 01a, subiu a 240 e desceu a 200 na
   homologação do Gabriel — com a régua de 9px o rótulo mais longo cabe, e os 40px voltam para as
   colunas de número. */
const W_FAZENDA = 200;
/** A sub-coluna R$/ha — a mesma largura da lavoura (`W_HA`), que desceu a 64 no DRE-PADRAO-01a. */
const W_SUB = W_HA;





const TITULO_ARROBA = 'Divisor por linha: receita e deduções pela @ vendida, reposição pela @ comprada, '
  + 'demais pela @ produzida. Esta coluna não soma.';
const TITULO_CAB = 'R$ por cabeça média do período, por mês';

/** O que o cabeçalho da sub-coluna explica: a unidade, o período e a ÁREA que dividiu. */
const tituloHa = (c: ColunaPec) => {
  const ha = c.linhas?.producao.ha_medio;
  return `R$ por hectare produtivo no período${ha != null && ha > 0 ? ` · área média ${formatNum(ha, 2)} ha` : ' · sem área no período'}`;
};



/* ══════════════ AS QUATRO VISÕES — DRE-PEC-TELA-02 ══════════════ */

/**
 * AS QUATRO PERGUNTAS DA GRADE, uma por card (Art. 19 da Constituição nº 2):
 *   global  — quanto a pecuária ganhou no período?
 *   meta    — ganhou o que planejou?
 *   anos    — está melhor ou pior que nos anos anteriores?
 *   fazenda — qual fazenda carrega o resultado?
 */
export type VisaoPec = 'global' | 'meta' | 'anos' | 'fazenda';
const VISOES: readonly VisaoPec[] = ['global', 'meta', 'anos', 'fazenda'];

/** `f_visao` na URL. ⚠ Constantes de módulo: o `useFiltroUrl` as usa nas dependências. */
export const lerVisaoPec = (bruto: string): VisaoPec => VISOES.find(v => v === bruto) ?? 'global';
export const escreverVisaoPec = (v: VisaoPec): string => v;
/** `f_anos` na URL — de 1 a 5, padrão 3. Fora da faixa volta ao padrão, nunca quebra a tela. */
export const N_ANOS_PADRAO = 3;
export const lerNAnosPec = (bruto: string): number => {
  const n = Number(bruto);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : N_ANOS_PADRAO;
};
export const escreverNAnosPec = (n: number): string => String(n);

/**
 * AS LINHAS QUE NÃO TÊM META — patrimônio não tem cenário.
 *
 * ⚠ A RPC NÃO FILTRA O PATRIMÔNIO POR CENÁRIO (rebanho é fato): a leitura em 'meta' devolve a MESMA
 * variação de rebanho do realizado. Mostrá-la na coluna Meta faria parecer que existe meta de
 * patrimônio. A coluna diz "—" e o delta também.
 */
const SEM_META: ReadonlySet<ChaveLinhaPec> = new Set<ChaveLinhaPec>([
  'vpb_operacional', 'efeito_mercado', 'resultado_com_mercado',
]);

const CHAVES_FINANCEIRAS: readonly ChaveLinhaPec[] = [
  'vendas', 'outras_receitas', 'deducoes', 'reposicao', 'custo_variavel', 'custo_fixo', 'juros', 'investimento',
];

/**
 * "SEM META NO PERÍODO" — nenhum lançamento de meta em linha nenhuma, e nenhum pool de meta.
 *
 * ⚠ NÃO É "sem fazenda": a lista de fazendas da RPC entra por fechamento de rebanho, que não tem
 * cenário — a leitura em meta de um cliente com gado SEMPRE traz fazendas. Olhar só as fazendas
 * faria o aviso nunca aparecer.
 */
export function semMovimento(d: DrePecuaria): boolean {
  return d.rateio_adm.pool === 0
    && CHAVES_FINANCEIRAS.every(k => { const v = valorDe(d.total, k); return v == null || v === 0; });
}



export interface EntradaVisoes {
  visao: VisaoPec;
  de: string;
  ate: string;
  real: DrePecuaria;
  meta: DrePecuaria | null;
  carregandoMeta: boolean;
  /** Os anos anteriores, do mais recente ao mais antigo (k = 1..N). */
  anos: readonly { de: string; ate: string; dre: DrePecuaria | null; carregando: boolean }[];
}

const subCab = (l: DrePecLinhas) => `${formatNum(l.patrimonio.cab_media, 0)} cab med.`;

/**
 * AS COLUNAS DE CADA VISÃO. ⚠ Nenhuma conta aqui: cada coluna é um JSON da RPC inteiro; a única
 * aritmética da tela é o delta, e ela mora na célula.
 */
export function colunasDaVisao(e: EntradaVisoes): ColunaPec[] {
  const { real, de, ate } = e;
  const meses = real.periodo.meses;
  const totalReal: ColunaPec = {
    chave: '__total__', nome: 'Total', sub: subCab(real.total), fazendaId: null, linhas: real.total,
    total: true, tipo: 'valor', unidade: 'ha', de, ate, cenario: 'realizado', meses, atual: true,
  };
  if (e.visao === 'global') return [totalReal];

  if (e.visao === 'fazenda') {
    /* ⚠ O TOTAL ENTRA NA FRENTE (§2a). A RPC devolve as fazendas e o total separados; quem os
       ordena é a tela, e é aqui que a decisão fica visível. */
    return [totalReal, ...real.fazendas.map((f): ColunaPec => ({
      chave: f.fazenda_id, nome: f.nome, sub: subCab(f.linhas), fazendaId: f.fazenda_id,
      linhas: f.linhas, total: false, tipo: 'valor', unidade: 'ha', de, ate, cenario: 'realizado',
      meses, atual: true,
    }))];
  }

  if (e.visao === 'meta') {
    /* ⚠ META NUNCA SE SOMA AO REALIZADO: dois JSONs, duas colunas, e o delta é a diferença. */
    const semMeta = !e.carregandoMeta && (!e.meta || semMovimento(e.meta));
    return [
      { ...totalReal, nome: 'Realizado' },
      {
        /* ⚠ A META GANHOU A SUB-COLUNA — TELA-03a. Ela não tinha nenhuma, e comparar R$ com R$/ha
           obrigava o olho a pular de largura. O divisor é o DELA (`producao.ha_medio` do JSON de
           meta: 4.813,6 ha contra 4.824,3 do realizado, na NJ 2026). Quando a meta não existe,
           `semDado` apaga a coluna inteira — então o `?? real.total` nunca vira número na tela;
           ele é esqueleto de layout, não empréstimo de dado. */
        chave: '__meta__', nome: 'Meta', sub: semMeta ? 'sem meta' : '',
        subLongo: semMeta ? 'sem meta no período' : undefined, fazendaId: null,
        linhas: e.carregandoMeta ? null : (e.meta?.total ?? real.total), total: false, tipo: 'valor',
        unidade: 'ha', de, ate, cenario: 'meta', meses: e.meta?.periodo.meses ?? meses, atual: false,
        semPatrimonio: true, semDado: semMeta,
      },
      {
        chave: '__delta__', nome: 'Δ', sub: 'real − meta', fazendaId: null,
        linhas: e.carregandoMeta ? null : real.total, ref: semMeta ? null : (e.meta?.total ?? null),
        total: false, tipo: 'delta', unidade: 'pct', de, ate, cenario: 'realizado', meses, atual: false,
      },
    ];
  }

  /* ANOS — o atual à esquerda, depois ano−1, ano−2…
     ⚠ CADA ANO COM O DIVISOR DELE — TELA-03a, que é o que faltava para esta visão sair do só-R$:
     até aqui ela vinha com `unidade: null` e o comentário "o denominador de cada ano vem no
     TELA-03". Vem agora, e é o hectare do JSON de cada ano — usar o do ano corrente compararia
     2024 com a área de 2026. Ano sem dado já é coluna de traço pelo `semDado`. */
  return [
    { ...totalReal, nome: rotuloCurtoPeriodo(de, ate), sub: '' },
    ...e.anos.map((a, i): ColunaPec => ({
      chave: `__ano${i + 1}__`, nome: rotuloCurtoPeriodo(a.de, a.ate), sub: '', fazendaId: null,
      linhas: a.carregando ? null : (a.dre?.total ?? real.total), total: false, tipo: 'valor',
      unidade: 'ha', de: a.de, ate: a.ate, cenario: 'realizado', meses: a.dre?.periodo.meses ?? meses,
      atual: false,
      /* ⚠ ANO SEM DADO É COLUNA DE "—", não coluna escondida: sumir faria "2023" parecer igual a
         "nunca houve 2023". Sem fazenda na resposta = nem fechamento nem lançamento naquele ano. */
      semDado: !a.carregando && (!a.dre || a.dre.fazendas.length === 0),
    })),
  ];
}

/** O valor de uma linha numa coluna — ou o delta, se a coluna é o delta. */
function valorNaColuna(col: ColunaPec, chave: ChaveLinhaPec): number | null {
  if (!col.linhas || col.semDado) return null;
  if (col.tipo === 'delta') {
    if (SEM_META.has(chave) || !col.ref) return null;
    const r = valorDe(col.linhas, chave);
    const m = valorDe(col.ref, chave);
    return r == null || m == null ? null : r - m;
  }
  if (col.semPatrimonio && SEM_META.has(chave)) return null;
  return valorDe(col.linhas, chave);
}

/**
 * O PERCENTUAL DO DELTA — delta ÷ |meta|. ⚠ Meta zero dá traço (não há do que ser percentual).
 * ⚠ O MÓDULO NO DENOMINADOR: com meta negativa (um resultado planejado de prejuízo), dividir pelo
 * valor com sinal inverteria o sentido — melhorar sobre a meta apareceria como percentual negativo.
 */
const pctDelta = (delta: number | null, meta: number | null): string =>
  (delta == null || meta == null || meta === 0 ? traco : `${formatNum((delta / Math.abs(meta)) * 100, 1)} %`);

/**
 * A COR DO DELTA É O SINAL DO NÚMERO, NÃO JUÍZO — mas o sinal de "bom" depende da linha: em receita
 * e resultado, acima da meta é verde; em custo, gastar MENOS que a meta é verde.
 */
const corDoDelta = (def: DefPec, v: number | null): string => {
  if (v == null || v === 0) return '';
  const bom = def.tom === 'custo' ? v < 0 : v > 0;
  return bom ? VERDE : VERMELHO;
};

/**
 * O TÍTULO DA COLUNA DE RÓTULOS — DRE-PADRAO-01a-2, decisão do Gabriel.
 *
 * ⚠ "FAZENDA" SÓ ERA VERDADE NUMA DAS QUATRO VISÕES. Nas outras, a coluna lista cenários (Realizado
 * e Meta), períodos (2026, 2025, 2024) ou uma linha só de consolidado — chamar tudo de "Fazenda"
 * fazia o cabeçalho descrever a exceção. O nome sai das colunas que a visão montou, não de um
 * estado à parte: é o mesmo dado que desenha a grade.
 */
function tituloDaPrimeiraColuna(colunas: readonly ColunaPec[]): string {
  if (colunas.some(c => c.chave === '__meta__')) return 'Cenário';
  if (colunas.some(c => c.chave.startsWith('__ano'))) return 'Período';
  if (colunas.some(c => c.fazendaId !== null)) return 'Fazenda';
  return 'Global';
}

/** As larguras de cada coluna — fixas por TIPO, nunca pelo dado. */
const larguraRs = (c: ColunaPec) => (c.total ? W_RS_TOTAL : W_RS);
const larguraUn = (c: ColunaPec) => (c.total ? W_HA : W_SUB);

/**
 * AS CÉLULAS DE UMA COLUNA — DRE-UNIDADES-01.
 *
 * ⚠ CADA CHIP MARCADO É UMA CÉLULA, na ordem fixa de `UNIDADES_PEC`, e o R$ é um chip como os
 * outros: desmarcá-lo deixa a coluna só com as unidades. O delta não entra nessa conta — ele é
 * "Δ R$ + Δ %" e sempre foi.
 */
type SlotPec = UnidadePec | 'pct';
const slotsDaColuna = (c: ColunaPec, unidades: readonly UnidadePec[]): readonly SlotPec[] =>
  (c.tipo === 'delta' ? ['rs', 'pct'] : c.unidade === null ? ['rs'] : unidades);
const larguraSlot = (s: SlotPec, c: ColunaPec) => (s === 'rs' ? larguraRs(c) : larguraUn(c));
const rotuloSlot = (s: SlotPec, c: ColunaPec) =>
  (s === 'pct' ? 'Δ %' : s === 'rs' ? (c.tipo === 'delta' ? 'Δ R$' : 'R$') : ROTULO_UNIDADE[s]);

/**
 * AS LARGURAS DE UMA COLUNA JÁ COM O PISO DO GRUPO — DRE-UNIDADES-01b.
 *
 * ⚠ É FUNÇÃO PURA DE (coluna, chips) DE PROPÓSITO, e não um valor calculado no topo e passado
 * para baixo: as três linhas da grade (a comum, a de %, a da filha) precisam da MESMA conta para
 * congelar o Total no lugar certo, e três componentes recebendo um número por prop é três lugares
 * onde ele pode chegar velho. Aqui todos chamam a mesma função com o que já têm em mãos.
 */
const largurasDaColuna = (c: ColunaPec, unidades: readonly UnidadePec[]): number[] =>
  larguraDoGrupo(slotsDaColuna(c, unidades).map(sl => larguraSlot(sl, c)));

/**
 * As duas células congeladas do Total, na régua da linha.
 *
 * ⚠ O SEGUNDO `left` NÃO É MAIS `W_RS_TOTAL`: com o piso de grupo, a primeira célula do Total
 * mede 160 quando há um chip só e 80 quando há duas unidades de 64 — o offset tem de ser a
 * largura que o `<colgroup>` deu àquela célula, senão a segunda coluna congelada cobre a
 * primeira (ou deixa uma fresta) exatamente na coluna que se veio conferir.
 */
const estiloTotalRs = { position: 'sticky' as const, left: W_FAZENDA, zIndex: 20 };
const estiloTotalCab = (c: ColunaPec, unidades: readonly UnidadePec[]) =>
  ({ position: 'sticky' as const, left: W_FAZENDA + largurasDaColuna(c, unidades)[0], zIndex: 20 });

/**
 * O ÍCONE DO HISTÓRICO — DRE-HISTORICO-LINHA-01a.
 *
 * ⚠ ELE FICA NA FRENTE DO NOME, ANTES DA SETA, e ocupa lugar em TODA linha: com o espaço
 * reservado, abrir um grupo não faz os nomes das filhas andarem para o lado. Uma grade que se
 * desalinha ao expandir obriga o olho a reencontrar a coluna a cada clique.
 * ⚠ E ELE NÃO ROUBA O CLIQUE DA SETA: a seta abre as filhas, o nome abre o rateio onde há, e o
 * ícone abre o histórico. Três gestos, três alvos — `stopPropagation` garante que o clique no
 * ícone não alterna o grupo por baixo.
 */
function BotaoHistorico({ onAbrir }: { onAbrir?: () => void }) {
  return (
    <button type="button" title="Ver histórico" aria-label="Ver histórico"
      aria-hidden={!onAbrir} tabIndex={onAbrir ? undefined : -1}
      onClick={onAbrir ? e => { e.stopPropagation(); onAbrir(); } : undefined}
      className={cn('mr-0.5 align-[-2px] text-muted-foreground hover:text-primary',
        !onAbrir && 'invisible')}>
      <BarChart3 className="inline h-3 w-3" />
    </button>
  );
}

/** A célula que ainda não chegou: um traço pulsando, só nela — a grade não espera. */
function CelulaCarregando({ total, fundo, estilo }: { total?: boolean; fundo?: string; estilo?: CSSProperties }) {
  return (
    <td className={cn('px-[7px] py-px', fundo)}
      style={{ ...(total ? { backgroundColor: FUNDO_TOTAL } : {}), ...estilo }}>
      <div className="ml-auto h-[8px] w-3/4 animate-pulse rounded bg-muted-foreground/20" />
    </td>
  );
}



export function PecDrePanel({ colunas: colunasCruas, alturaCartao, cartaoRef,
  unidades = ['rs', 'ha'], onAbrirLista, onAbrirDidatico, onAbrirRateio, onAbrirHistorico }: {
  colunas: readonly ColunaPec[];
  /** ⚠ AS UNIDADES MARCADAS, na ordem de `UNIDADES_PEC`. O padrão é o que a tela abre: R$ e R$/ha. */
  unidades?: readonly UnidadePec[];
  alturaCartao: number | null;
  cartaoRef: React.RefObject<HTMLDivElement>;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
  /** ⚠ A GRADE NÃO MONTA O MODAL: ela avisa QUAL linha, e quem lê os cinco anos é a página. */
  onAbrirHistorico?: (r: RecorteHistoricoPec) => void;
}) {
  const colunas = colunasCruas;
  const larguras = useMemo(() => {
    const cols: number[] = [W_FAZENDA];
    colunas.forEach(c => largurasDaColuna(c, unidades).forEach(w => cols.push(w)));
    return cols;
  }, [colunas, unidades]);
  const larguraMin = larguras.reduce((a, b) => a + b, 0);
  const primeira = colunas[0];

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
              {tituloDaPrimeiraColuna(colunas)}
            </th>
            {/* ⚠ O TOTAL TAMBÉM GRUDA À ESQUERDA, colado na coluna de rótulos: ele é a referência
                contra a qual cada coluna se lê, e rolar para comparar obrigaria a decorá-lo. */}
            {colunas.map(c => (
              <th key={c.chave} colSpan={slotsDaColuna(c, unidades).length}
                className={cn(!c.total && CINZA_CABECALHO, 'sticky top-0 px-[7px] text-center align-middle text-white',
                  c.total ? 'z-40' : 'z-20')}
                style={c.total
                  ? { left: W_FAZENDA, backgroundColor: NAVY_TOTAL, borderLeft: BORDA_TOTAL }
                  : { borderLeft: '1px solid rgba(255,255,255,.22)' }}>
                <div className="truncate text-[10px] font-medium leading-[12px]" title={c.nome}>{c.nome}</div>
                <div className="truncate whitespace-nowrap text-[10px] font-normal leading-[12px] text-white"
                  title={c.subLongo || c.sub || undefined}>
                  {c.sub || '\u00a0'}
                </div>
              </th>
            ))}
          </tr>
          <tr style={{ height: 14 }}>
            {colunas.map(c => (
              <Fragment key={c.chave}>
                {slotsDaColuna(c, unidades).map((sl, i) => (
                  /* ⚠ O `title` DIZ O DIVISOR, e é ele que torna a sub-coluna auditável: sem o
                     denominador à mão, o operador não tem como refazer a conta (Art. 19). O R$/@
                     avisa ali que muda de base por linha e que a coluna NÃO SOMA.
                     ⚠ SÓ AS DUAS PRIMEIRAS CÉLULAS DO TOTAL CONGELAM, como antes: congelar as
                     quatro comeria 288px da largura visível, e a coluna Total viraria a tela. */
                  <th key={sl}
                    className={cn(!c.total && CINZA_CABECALHO, 'sticky px-[7px] text-right text-[10px] font-normal text-white',
                      c.total ? 'z-40' : 'z-20')}
                    title={sl === 'ha' ? tituloHa(c) : sl === 'arroba' ? TITULO_ARROBA : sl === 'cab' ? TITULO_CAB : undefined}
                    style={c.total
                      ? { top: 26, backgroundColor: NAVY_TOTAL,
                          ...(i === 0 ? { left: W_FAZENDA, borderLeft: BORDA_TOTAL }
                            : i === 1 ? { left: W_FAZENDA + largurasDaColuna(c, unidades)[0] } : {}) }
                      : { top: 26, ...(i === 0 ? { borderLeft: '1px solid rgba(255,255,255,.22)' } : {}) }}>
                    {rotuloSlot(sl, c)}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>

        <tbody>
          {LINHAS_PEC.map(def => {
            const bloco = BLOCO_DA_LINHA[def.chave];
            const aberto = !!abertos[def.chave];
            /* ⚠ AS FILHAS SÃO A UNIÃO DAS COLUNAS DE TOTAL, e é ela que manda: um centro que só
               existe numa fazenda (ou só na meta, ou só em 2024) tem de aparecer para todas, senão a
               linha some conforme a coluna que se olha. As colunas de fazenda não entram na união:
               o Total delas já é a união por construção — a RPC o monta agrupando `finc` inteiro.
               ⚠ OS JUROS TÊM LISTA PRÓPRIA (`centros_juros`, DRE-PEC-RPC-02). Hoje a linha de juros
               não expande (§4); a leitura fica certa para o dia em que expandir. */
            const centros: CentroPec[] = [];
            if (def.expande && bloco) {
              const vistos = new Set<string>();
              colunas.forEach(c => {
                if (c.fazendaId !== null || c.tipo !== 'valor' || !c.linhas || c.semDado) return;
                centrosDoBloco(c.linhas, bloco).forEach(x => {
                  if (!vistos.has(x.centro)) { vistos.add(x.centro); centros.push(x); }
                });
              });
            }
            return (
              <Fragment key={def.chave}>
                {def.chave === 'investimento' && (
                  <tr className="bg-card" style={{ height: 17 }}>
                    <td className="sticky left-0 z-20 truncate border-r border-t border-border/60 bg-card
                      px-[7px] text-[10px] text-muted-foreground"
                      title="Abaixo da linha de caixa — não entra no resultado do período">
                      Abaixo da linha de caixa
                    </td>
                    {Array.from({ length: larguras.length - 1 }).map((_, i) => {
                      const congelada = primeira?.total && (i === 0 || (i === 1 && !!primeira.unidade));
                      return (
                        <td key={i} className="border-t border-border/60 bg-card"
                          style={congelada ? { position: 'sticky', left: i === 0 ? W_FAZENDA : W_FAZENDA + largurasDaColuna(primeira, unidades)[0], zIndex: 20, backgroundColor: FUNDO_TOTAL } : undefined} />
                      );
                    })}
                  </tr>
                )}
                <LinhaPec def={def} colunas={colunas} centros={centros} unidades={unidades}
                  aberto={aberto} onAlternar={() => alternar(def.chave)}
                  onAbrirLista={onAbrirLista} onAbrirDidatico={onAbrirDidatico}
                  onAbrirRateio={onAbrirRateio} onAbrirHistorico={onAbrirHistorico} />

                {/* ⚠ A LINHA DE % VEM LOGO ABAIXO e é leitura de apoio: 9px, muted, sem recuo,
                    altura 14. Ela não é uma linha do DRE — é a mesma linha vista noutra unidade,
                    e por isso não ganha nem cor de sinal nem clique. */}
                {COM_PERCENTUAL.has(def.chave) && (
                  <LinhaPercentual def={def} colunas={colunas} unidades={unidades} />
                )}

                {/* As filhas: um centro por linha, na régua `filha` (9px/14px, recuo 16). */}
                {aberto && centros.map(c => (
                  <LinhaCentro key={`${def.chave}-${c.centro}`} def={def} centro={c} unidades={unidades}
                    colunas={colunas} bloco={bloco ?? ''} onAbrirLista={onAbrirLista}
                    onAbrirHistorico={onAbrirHistorico} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LinhaPec({ def, colunas, centros, aberto, unidades, onAlternar, onAbrirLista, onAbrirDidatico, onAbrirRateio, onAbrirHistorico }: {
  def: DefPec;
  colunas: readonly ColunaPec[];
  centros: readonly CentroPec[];
  aberto: boolean;
  unidades: readonly UnidadePec[];
  onAlternar: () => void;
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirDidatico?: (fazendaId: string | null, fazendaNome: string, qual: 'vpb' | 'efeito') => void;
  onAbrirRateio?: () => void;
  onAbrirHistorico?: (r: RecorteHistoricoPec) => void;
}) {
  const fundo = fundoDaLinha(def.destaque);
  const corLinha = corDoTom(def.tom);
  const bloco = BLOCO_DA_LINHA[def.chave];
  const temFilhas = def.expande && centros.length > 0;
  /* ⚠ A MESMA RÉGUA DA LAVOURA (PR-10): o papel de grupo entra quando a linha expande, e é ela
     que traz o peso 500 sem mudar o tamanho. O mapa é um só de propósito: o dia em que o subtotal
     mudar de tamanho, ele muda nas duas telas. */
  const regua = REGUA_LINHA[tipoDaLinha(def.destaque, temFilhas)];
  /* ⚠ O RÓTULO DO RATEIO ABRE O MODAL (DRE-PEC-TELA-02b): a frase que explicava o rateio acima da
     grade saiu, e o selo "estimado" é a porta para a explicação — pool, critério e a fatia da
     pecuária. Só quando a primeira coluna é o realizado do período da tela, o único que o modal lê. */
  const abrirRateioDoRotulo = def.rateio && onAbrirRateio && colunas[0]?.atual ? onAbrirRateio : undefined;

  /**
   * O QUE ACONTECE AO CLICAR NUMA CÉLULA — §5.
   *
   * ⚠ TRÊS DESTINOS, E O DA LINHA DECIDE: as duas variações de patrimônio abrem o modal didático
   * (não há lançamento por trás delas — são fechamentos de rebanho); o rateio administrativo abre
   * o modal do pool (o valor é rateado, não lançado nesta fazenda); o resto abre a lista.
   * ⚠ LINHA DE SOMA NÃO ABRE NADA. `= Receita bruta`, `= VBP`, `= Margem` e os resultados não têm
   * lançamento próprio: eles são a conta das linhas de cima, e abrir uma lista ali teria de
   * inventar qual dos termos mostrar.
   * ⚠ DELTA NÃO ABRE NADA (é derivado), e os dois modais só abrem no realizado do período da tela
   * (`atual`): eles leem o período da tela, e abri-los na coluna de 2024 mostraria outro ano.
   */
  const abrirDaColuna = (col: ColunaPec) => {
    if (!col.linhas || col.semDado || col.tipo === 'delta') return undefined;
    /* ⚠ JUROS NUMA FAZENDA NÃO ABRE NADA: a RPC não os divide por fazenda, a célula é "—" e uma
       lista ali mostraria os juros que o lançamento carimbou na fazenda — justamente a divisão que
       a RPC deixou de fazer. No Total, abre como sempre (`p_fazenda` nulo traz todos). */
    if (def.chave === 'juros' && col.fazendaId !== null) return undefined;
    if (def.didatico) {
      return col.atual && onAbrirDidatico ? () => onAbrirDidatico(col.fazendaId, col.nome, def.didatico!) : undefined;
    }
    if (def.rateio) return col.atual ? onAbrirRateio : undefined;
    if (!bloco || !onAbrirLista) return undefined;
    return () => onAbrirLista({
      fazendaId: col.fazendaId,
      fazendaNome: col.nome,
      bloco,
      centro: null,
      rotulo: def.rotulo.replace(/^[=(−)\s-]+/, '').trim(),
      de: col.de, ate: col.ate, cenario: col.cenario,
    });
  };

  return (
    <tr className={cn(fundo, regua.peso)} style={{ height: regua.altura }}>
      <td className={cn('sticky left-0 z-30 truncate py-px', fundo,
        'border-r border-border/60', corLinha, (temFilhas || abrirRateioDoRotulo) && 'cursor-pointer')}
        title={abrirRateioDoRotulo ? 'ver como o rateio foi feito' : def.rotulo}
        onClick={temFilhas ? onAlternar : abrirRateioDoRotulo}
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}>
        {/* ⚠ O ESCOPO É O DA PRIMEIRA COLUNA — o Total nas visões globais, a fazenda na visão por
            fazenda. É a mesma coluna que o clique na célula usa para abrir a lista. */}
        <BotaoHistorico onAbrir={onAbrirHistorico && colunas[0]
          ? () => onAbrirHistorico({
            chave: def.chave, centro: null, rotulo: def.rotulo,
            fazendaId: colunas[0].fazendaId, fazendaNome: colunas[0].nome,
          }) : undefined} />
        {temFilhas && (
          <ChevronRight className={cn('mr-0.5 inline h-3 w-3 align-[-2px] transition-transform',
            aberto && 'rotate-90')} />
        )}
        {def.rotulo}
        {def.etiqueta && <Etiqueta texto={def.etiqueta} />}
      </td>

      {colunas.map(col => {
        const slots = slotsDaColuna(col, unidades);
        const estiloDoSlot = (i: number) => (!col.total ? undefined
          : i === 0 ? estiloTotalRs : i === 1 ? estiloTotalCab(col, unidades) : undefined);
        if (!col.linhas) {
          return (
            <Fragment key={col.chave}>
              {slots.map((sl, i) => (
                <CelulaCarregando key={sl} total={col.total} fundo={fundo} estilo={estiloDoSlot(i)} />
              ))}
            </Fragment>
          );
        }
        const v = valorNaColuna(col, def.chave);
        const cor = col.tipo === 'delta' ? corDoDelta(def, v)
          : def.corPorSinal ? corDoSinal(v) : corLinha;
        /* ⚠ JUROS DE FAZENDA: "—" no R$ (é ausência, não zero) e nada nas unidades. */
        const jurosDeFazenda = def.chave === 'juros' && col.fazendaId !== null;
        /* ⚠ SEM FECHAMENTO A CÉLULA DIZ POR QUÊ: as duas linhas de variação vêm nulas, e o
           `title` é o que separa "não mudou" de "não sei". */
        const semFech = col.tipo === 'valor' && !col.semDado
          && (def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado')
          && (col.linhas.sem_p0 || col.linhas.sem_p1);
        const abrir = abrirDaColuna(col);
        return (
          <Fragment key={col.chave}>
            {slots.map((sl, i) => (sl === 'rs' ? (
              <Celula key={sl} valor={v} cor={cor} destaque={def.destaque} fonte={regua.fonte}
                bordaEsquerda={!col.total && i === 0} total={col.total} fundo={fundo}
                onAbrir={abrir}
                estilo={estiloDoSlot(i)}
                title={semFech ? 'sem fechamento' : undefined} />
            ) : (
              <CelulaUnit key={sl}
                texto={sl === 'pct' ? pctDelta(v, col.ref ? valorDe(col.ref, def.chave) : null)
                  : jurosDeFazenda ? '' : valorNaUnidade(sl, v, col, def.chave)}
                cor={cor} destaque={def.destaque}
                fonte={regua.fonte} total={col.total} fundo={fundo} onAbrir={abrir}
                estilo={estiloDoSlot(i)} />
            )))}
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
 * ⚠ NO DELTA ELA FICA VAZIA: "% do VBP" de uma diferença não é leitura de nada.
 */
function LinhaPercentual({ def, colunas, unidades }: {
  def: DefPec; colunas: readonly ColunaPec[]; unidades: readonly UnidadePec[];
}) {
  const fundo = fundoDaLinha(def.destaque);
  return (
    <tr className={cn(fundo, 'font-normal')} style={{ height: 14 }}>
      <td className={cn('sticky left-0 z-30 truncate border-r border-border/60 py-px text-muted-foreground', fundo)}
        style={{ fontSize: 9, paddingLeft: 7, paddingRight: 7 }}
        title={`${def.rotulo} em ${ROTULO_DA_BASE}`}>
        {ROTULO_DA_BASE}
      </td>
      {colunas.map(col => {
        const texto = !col.linhas || col.tipo === 'delta' ? ''
          : percentual(valorNaColuna(col, def.chave), valorNaColuna(col, BASE_DO_PERCENTUAL) ?? 0);
        return (
          <Fragment key={col.chave}>
            <td className={cn('truncate px-[7px] text-right tabular-nums text-muted-foreground', fundo)}
              style={{
                fontSize: 9,
                ...(col.total ? { ...estiloTotalRs, backgroundColor: FUNDO_TOTAL, borderLeft: BORDA_TOTAL } : {}),
              }}>
              {texto}
            </td>
            {/* ⚠ AS CÉLULAS DE UNIDADE FICAM VAZIAS: um percentual não se divide por hectare, por
                cabeça nem por arroba — ele já é a linha de cima noutra unidade. Vazias, não
                ausentes: a coluna não pode encolher só nesta linha. */}
            {slotsDaColuna(col, unidades).slice(1).map((sl, i) => (
              <td key={sl} className={cn(fundo)}
                style={col.total && i === 0 ? { ...estiloTotalCab(col, unidades), backgroundColor: FUNDO_TOTAL } : undefined} />
            ))}
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
 * seus, e um centro que ela não tem mostra "—" em vez de herdar o número do conjunto. No delta, os
 * dois lados precisam ter o centro — faltando um, é "—".
 * ⚠ E O `'(sem)'` VIAJA INTEIRO ATÉ A RPC — ele é um centro de verdade ("lançamento sem centro"),
 * não ausência. Mandar `null` no lugar dele traria o bloco todo.
 */
function LinhaCentro({ def, centro, colunas, bloco, unidades, onAbrirLista, onAbrirHistorico }: {
  def: DefPec;
  centro: CentroPec;
  colunas: readonly ColunaPec[];
  bloco: string;
  unidades: readonly UnidadePec[];
  onAbrirLista?: (r: RecortePec) => void;
  onAbrirHistorico?: (r: RecorteHistoricoPec) => void;
}) {
  const regua = REGUA_LINHA.filha;
  const corLinha = corDoTom(def.tom);
  const achar = (l: DrePecLinhas | null | undefined) =>
    (l ? centrosDoBloco(l, bloco).find(c => c.centro === centro.centro)?.valor ?? null : null);
  return (
    <tr className={cn('bg-card', regua.peso)} style={{ height: regua.altura }}>
      <td className="sticky left-0 z-30 truncate border-r border-border/60 bg-card py-px"
        style={{ fontSize: regua.fonte, paddingLeft: 7 + regua.recuo, paddingRight: 7 }}
        title={centro.centro}>
        <BotaoHistorico onAbrir={onAbrirHistorico && colunas[0]
          ? () => onAbrirHistorico({
            chave: def.chave, centro: centro.centro,
            rotulo: centro.centro === '(sem)' ? 'sem centro' : centro.centro,
            fazendaId: colunas[0].fazendaId, fazendaNome: colunas[0].nome,
          }) : undefined} />
        {centro.centro === '(sem)' ? 'sem centro' : centro.centro}
      </td>
      {colunas.map(col => {
        const slots = slotsDaColuna(col, unidades);
        const estiloDoSlot = (i: number) => (!col.total ? undefined
          : i === 0 ? estiloTotalRs : i === 1 ? estiloTotalCab(col, unidades) : undefined);
        if (!col.linhas) {
          return (
            <Fragment key={col.chave}>
              {slots.map((sl, i) => (
                <CelulaCarregando key={sl} total={col.total} fundo="bg-card" estilo={estiloDoSlot(i)} />
              ))}
            </Fragment>
          );
        }
        let v: number | null;
        let m: number | null = null;
        if (col.semDado) v = null;
        else if (col.tipo === 'delta') {
          const r = achar(col.linhas);
          m = achar(col.ref);
          v = r == null || m == null ? null : r - m;
        } else v = achar(col.linhas);
        const cor = col.tipo === 'delta' ? corDoDelta(def, v) : corLinha;
        const abrir = onAbrirLista && col.tipo === 'valor' && !col.semDado
          ? () => onAbrirLista({
            fazendaId: col.fazendaId, fazendaNome: col.nome, bloco,
            centro: centro.centro,
            rotulo: centro.centro === '(sem)' ? 'sem centro' : centro.centro,
            de: col.de, ate: col.ate, cenario: col.cenario,
          })
          : undefined;
        /* ⚠ A FILHA SEGUE OS MESMOS CHIPS DA MÃE, e o R$/@ dela usa a base da LINHA (o bloco a
           que o centro pertence): um centro de custo variável se lê pela arroba produzida, como o
           subtotal acima dele. */
        return (
          <Fragment key={col.chave}>
            {slots.map((sl, i) => (sl === 'rs' ? (
              <Celula key={sl} valor={v} cor={cor} fonte={regua.fonte} filha
                bordaEsquerda={!col.total && i === 0} total={col.total} fundo="bg-card" onAbrir={abrir}
                estilo={estiloDoSlot(i)} />
            ) : (
              <CelulaUnit key={sl}
                texto={sl === 'pct' ? pctDelta(v, m) : valorNaUnidade(sl, v, col, def.chave)}
                cor={cor} fonte={regua.fonte} filha
                total={col.total} fundo="bg-card" onAbrir={abrir}
                estilo={estiloDoSlot(i)} />
            )))}
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * OS QUATRO CARDS DE VISÃO — DRE-PEC-TELA-02. Substituem a faixa de seis caixas: Cabeças, Receita
 * líquida, VBP, Efeito de mercado e Patrimônio saíram do topo porque já estão na grade.
 *
 * ⚠ CADA CARD MOSTRA UM NÚMERO SÓ, e o de "x Meta" e "x Anos" é o DELTA do resultado do período —
 * a resposta curta à pergunta do card. Enquanto o número não chegou, spinner: "—" diria que o dado
 * não existe (decisão 2).
 * ⚠ O SELETOR DE ANOS OCUPA O LUGAR SEMPRE, invisível fora da visão x Anos: aparecendo e sumindo,
 * ele encolheria os quatro cards a cada troca — a lei de estabilidade.
 */
export function FaixaVisoesPec({ visao, onVisao, real, meta, carregandoMeta, anoAnterior,
  carregandoAnoAnterior, nAnos, onNAnos }: {
  visao: VisaoPec;
  onVisao: (v: VisaoPec) => void;
  real: DrePecuaria;
  meta: DrePecuaria | null;
  carregandoMeta: boolean;
  anoAnterior: DrePecuaria | null;
  carregandoAnoAnterior: boolean;
  nAnos: number;
  onNAnos: (n: number) => void;
}) {
  const rp = real.total.resultado_periodo;
  const delta = (outro: DrePecuaria) => rp - outro.total.resultado_periodo;
  const semMeta = !meta || semMovimento(meta);
  const semAno = !anoAnterior || anoAnterior.fazendas.length === 0;
  const dMeta = semMeta || !meta ? null : delta(meta);
  const dAno = semAno || !anoAnterior ? null : delta(anoAnterior);
  const nFaz = real.fazendas.length;
  const caixas: CaixaFaixa[] = [
    { chave: 'global', rotulo: 'Global', valor: numeroDaCelula(rp), unidade: 'R$', cor: corDoSinal(rp),
      title: 'Resultado do período — quanto a pecuária ganhou.' },
    { chave: 'meta', rotulo: '× Meta', carregando: carregandoMeta,
      valor: semMeta ? 'sem meta no período' : numeroDaCelula(dMeta),
      unidade: semMeta ? undefined : 'R$', cor: semMeta ? 'text-muted-foreground' : corDoSinal(dMeta),
      title: 'Resultado do período menos o da meta — ganhou o que planejou?' },
    { chave: 'anos', rotulo: '× Anos', carregando: carregandoAnoAnterior,
      valor: numeroDaCelula(dAno), unidade: dAno == null ? undefined : 'R$', cor: corDoSinal(dAno),
      title: 'Resultado do período menos o do mesmo período do ano anterior.' },
    { chave: 'fazenda', rotulo: 'Por fazenda', valor: String(nFaz), unidade: nFaz === 1 ? 'fazenda' : 'fazendas',
      title: 'Qual fazenda carrega o resultado?' },
  ];
  /* ⚠ SEIS COLUNAS E A RÉGUA DA LAVOURA — DRE-PADRAO-01a. Eram 4 caixas `grande` (52px de altura,
     rótulo 11px) contra as 6 da lavoura (44px, rótulo 10px): trocar de aba mudava a altura da faixa
     e, com ela, o y da tabela. Agora a grade é de 6 e as caixas 5 e 6 ficam VAZIAS — sem borda, sem
     texto, nada clicável: são espaço reservado.
     ⚠ E O SELETOR DE ANOS SAIU DAQUI, para a linha de rateio. Ele dividia esta linha com a grade e
     roubava 123px: as caixas da pecuária mediam 122 contra as 143 da lavoura, e a grade de 6 não
     resolvia isso sozinha. Na linha de rateio ele fica onde a lavoura já põe os controles da
     grade — e as caixas passam a ter a MESMA largura nas duas abas. */
  return (
    <Caixas caixas={caixas} colunas={6} selecionada={visao}
      onEscolher={ch => { const v = VISOES.find(x => x === ch); if (v) onVisao(v); }} />
  );
}

/**
 * O SELETOR DE QUANTOS ANOS ANTERIORES — mora na linha de rateio, ao lado direito.
 *
 * ⚠ ELE FICA VISÍVEL SÓ NA VISÃO x ANOS, mas OCUPA O LUGAR sempre (`invisible`, não removido): é a
 * mesma lei que mantém a coluna de ações do drill — some o conteúdo, não o espaço.
 */
export function SeletorAnosPec({ visao, nAnos, onNAnos, reservado }: {
  visao: VisaoPec; nAnos: number; onNAnos: (n: number) => void;
  /** ⚠ NA LAVOURA ELE SÓ GUARDA O LUGAR — DRE-UNIDADES-01: sem a reserva, os chips de unidade
      andavam ao trocar de aba, porque só a pecuária tem o seletor de anos. */
  reservado?: boolean;
}) {
  const escondido = reservado || visao !== 'anos';
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap',
      escondido && 'invisible')} aria-hidden={escondido || undefined}
      style={escondido ? { pointerEvents: 'none' } : undefined}>
      anos anteriores
      <Segmentado altura={22} valor={String(nAnos)} onEscolher={v => onNAnos(Number(v))}
        opcoes={['1', '2', '3', '4', '5'].map(n => ({ valor: n, rotulo: n }))} />
    </span>
  );
}
