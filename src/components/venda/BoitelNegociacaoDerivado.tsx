/**
 * BoitelNegociacaoDerivado — a base operacional e o painel de resultado do boitel,
 * dentro da aba de Negociação da Venda como Operação Comercial.
 *
 * PR-OC-VENDA-BOITEL-01A. É a primeira metade do boitel na OC: a bifurcação, a base
 * derivada e o resultado. Os quatro modais de ENTRADA de dado são do 01B.
 *
 * ⚠ AQUI NAO SE DIGITA NADA. Este arquivo só LÊ o que já está gravado em
 * `detalhes_snapshot.boitelSnapshot` e mostra. Quem escreve continua sendo o
 * `BoitelPlanningDialog` do formulário antigo, que não mudou.
 *
 * ⚠ AS FORMULAS FORAM COPIADAS DO `calc` DO SIMULADOR (BoitelPlanningDialog.tsx,
 * linhas 86-124) e do bloco de adiantamento (linhas 134-144). Os nomes curtos das
 * variáveis foram mantidos de propósito, para que a comparação lado a lado com o
 * original seja literal. Há UMA divergência deliberada, marcada abaixo: `cAb`.
 *
 * ⚠ NUNCA ZERO MUDO. Um valor que não pode ser calculado aparece como "—", e o painel
 * diz em âmbar QUAL dado falta. Zero é valor real e só aparece quando é o resultado.
 *
 * ⚠ TRES COLUNAS VIRAM UMA LINHA SO NO FINANCEIRO. Quem mexer em uma precisa saber das
 * outras duas: `outros_custos`, `custo_nutricao` e `custos_extras_parceria` são somadas
 * numa única obrigação, rotulada "Outros Custos", em `useBoitelOperacoes.ts` —
 *     { valor: plan.outros_custos + plan.custo_nutricao + plan.custos_extras_parceria,
 *       label: `Outros Custos - ${descBase}`, origemTipo: 'boitel:custo_outros' }
 * ⚠ DAS TRES, SO `outros_custos` TEM CAMPO NA TELA. A nutrição saiu em
 * PR-OC-VENDA-NUTRICAO-DUPLICADA-01 — a DIARIA JA E A NUTRICAO, é o que o boitel cobra
 * para alimentar o gado, e pedir os dois era o mesmo conceito duas vezes; os extras de
 * parceria são de uma modalidade que nunca rodou. As duas colunas ficam zeradas no banco,
 * então hoje aquela linha do financeiro é o que se digita em Outros.
 * ⚠ E ESTE MOTOR ESTAVA CERTO O TEMPO TODO: `custoTotalBoitel` é `cDT + cs + oc` e nunca
 * somou nutrição. O que parecia omissão dele era a tela cobrando em dobro.
 */
import { useMemo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import type { BoitelData } from '@/components/BoitelPlanningDialog';

/* ─── ENTRADAS OBRIGATORIAS ────────────────────────────────────────────────────
   O rótulo é o que o painel mostra em âmbar quando o campo falta. `grupo` diz qual
   metade do painel o campo trava: 'ind' entra nos indicadores zootécnicos e, por
   consequência, também na operação; 'op' trava só a operação. */
/* ⚠ DOIS CAMPOS QUE O SIMULADOR ANTIGO NAO TEM. Estendem `BoitelData` em vez de mexer
   nele — `BoitelPlanningDialog` nao muda. Vieram de `BoitelBlocosModais` para cá em
   PR-OC-VENDA-BOITEL-FIX-ARROBAS-MORTE-01, porque as contas abaixo passaram a precisar
   deles e o outro arquivo importa deste: manter lá criaria ciclo. */
export interface BoitelEdicao extends BoitelData {
  morteQuantidade?: number;
  morteValorIndenizacao?: number;
}

/** As cabeças que SAÍRAM do boitel — o lote menos as mortes. */
export function cabecasQueSairam(d: BoitelEdicao): number {
  return Math.max(0, (d.qtdCabecas || 0) - (d.morteQuantidade || 0));
}

type Grupo = 'ind' | 'op';
interface Exigencia { rotulo: string; grupo: Grupo; presente: boolean }

function exigencias(d: BoitelEdicao): Exigencia[] {
  const base: Exigencia[] = [
    /* ⚠ UMA EXIGENCIA SO PARA OS DOIS, e o texto diz ONDE resolver. Cabeças e peso deixaram
       de ser campos em PR-OC-VENDA-BOITEL-CABECAS-DOS-LOTES-01: os dois derivam dos lotes.
       Listá-los separados faria a frase dizer "falta cabeças" duas vezes pelo mesmo motivo,
       e mandaria o operador procurar um campo que não existe. */
    { rotulo: 'lote negociado (as cabeças e o peso vêm dele)',
      grupo: 'ind', presente: d.qtdCabecas > 0 && d.pesoInicial > 0 },
    { rotulo: 'dias no boitel',          grupo: 'ind', presente: d.dias > 0 },
    { rotulo: 'GMD',                     grupo: 'ind', presente: d.gmd > 0 },
    { rotulo: 'rendimento de entrada',   grupo: 'ind', presente: d.rendimentoEntrada > 0 },
    { rotulo: 'rendimento de saída',     grupo: 'ind', presente: d.rendimento > 0 },
    { rotulo: 'preço de venda da @',     grupo: 'op',  presente: d.precoVendaArroba > 0 },
  ];
  /* O custo da operação depende da modalidade, e cada uma pergunta o seu.
     ⚠ `parceria` NAO tem custo direto: o parceiro entra como dedução da receita, e é
     por isso que ela exige o percentual e não um valor de custo. Ela nunca rodou com
     dado real (medido: as 10 vendas boitel são `diaria`) — o desenho próprio dela é
     assunto do 01B. */
  if (d.modalidadeCusto === 'diaria')   base.push({ rotulo: 'custo da diária',        grupo: 'op', presente: d.custoDiaria > 0 });
  if (d.modalidadeCusto === 'arroba')   base.push({ rotulo: 'custo por @ produzida',  grupo: 'op', presente: d.custoArroba > 0 });
  if (d.modalidadeCusto === 'parceria') base.push({ rotulo: 'percentual do parceiro', grupo: 'op', presente: d.percentualParceria > 0 });
  return base;
}

/* ─── AS CONTAS ────────────────────────────────────────────────────────────────
   Copiadas do `calc`. A única diferença deliberada está em `cAb`, e está comentada
   no lugar. */
export function derivadosBoitel(data: BoitelEdicao) {
  const { qtdCabecas: q, pesoInicial: pi, quebraViagem: qv, dias, gmd, rendimentoEntrada: re, rendimento: rs, modalidadeCusto: mc, custoDiaria: cd, custoArroba: ca, percentualParceria: pp, custoFrete: cf, custoOportunidade: co, custoSanidade: cs, outrosCustos: oc, precoVendaArroba: pva, despesasAbate: da } = data;
  const ple = pi * (1 - qv / 100);
  const ganho = gmd * dias;
  const pf = pi + ganho;
  const aEF = pi / 30;
  const aS = (pf * rs / 100) / 15;
  const aPcab = aS - aEF;
  /* ⚠ TERCEIRA DIVERGENCIA DELIBERADA contra o simulador antigo (as duas primeiras: o
     `cAb` no 01A, a diaria no 01B). ANIMAL MORTO NAO VIRA CARCACA: as arrobas de saida
     sao das cabecas que SAIRAM, como a diaria ja e' desde o 01B. O que compensa a perda
     e' a INDENIZACAO, e e' para isso que o campo existe.
     ⚠ `aEF` FICA SOBRE O LOTE INTEIRO, e de proposito: as arrobas de ENTRADA sao do lote
     que entrou, e o animal que morreu entrou. Por isso `aP` NAO e' `aPcab x cabecas` — as
     duas pontas tem bases diferentes, e escrever a subtracao inteira e' o que impede o
     indicador de misturar as duas sem dizer.
     ⚠ COM ZERO MORTES OS TRES SAO IDENTICOS AO DE ANTES: `aS*q - aEF*q = (aS-aEF)*q`. A
     conferencia lado a lado com o simulador antigo continua valendo. */
  const sairam = cabecasQueSairam(data);
  const aP = aS * sairam - aEF * q;
  const aTS = aS * sairam;
  const gmc = dias > 0 ? ((pf * rs / 100) - (ple * re / 100)) / dias : 0;
  /* ⚠ A INDENIZACAO SOMA AO FATURAMENTO. Estava so' no bloco de Comercializacao do 01B, e
     o painel mostrava o faturamento sem ela — dois numeros diferentes para a mesma coisa
     na mesma tela. Agora e' uma conta so'. */
  const fba = aTS * pva + (data.morteValorIndenizacao || 0);
  /* ⚠ AQUI ESTA A UNIFICACAO de PR-OC-VENDA-BOITEL-01A. No simulador antigo esta linha
     é `const cAb = da + nf`, somando `despesasAbate` com `custoNfAbate`. Os dois eram o
     mesmo custo escrito duas vezes: `custo_nf_abate` NAO existe como coluna no banco —
     zero ocorrências em supabase/ e em types.ts — enquanto `despesas_abate` existe.
     Medido nas 10 vendas boitel: `despesasAbate > 0` em 6, `custoNfAbate > 0` em zero,
     os dois juntos em zero. A soma vira LEITURA DE UM SO, e não o outro somando zero
     por baixo: `nf` sequer é desestruturado acima. */
  const cAb = da;
  const fLiq = fba - cAb;
  let cDT = 0;
  /* ⚠ CABECAS QUE SAIRAM, igual ao bloco de Custos do 01B. Ficou `q` aqui naquele PR, e o
     painel cobrava a diaria do animal morto enquanto o bloco nao cobrava. Medido no acerto
     real: 109 x 104 x 18,93. */
  if (mc === 'diaria') cDT = cd * dias * sairam;
  else if (mc === 'arroba') cDT = ca * aP;
  const cOp = cDT + cs + oc + cf;
  const coT = co * pi * q;
  let rProd = fLiq, pParte = 0, pArr = 0;
  if (mc === 'parceria') { pArr = aP * (pp / 100); pParte = pArr * pva; rProd = fLiq - pParte; }
  const rLiq = rProd - cOp;
  const rLCab = q > 0 ? rLiq / q : 0;
  /* ⚠ VOLTOU DO SIMULADOR, verbatim (`BoitelPlanningDialog.tsx:117`). Saiu no 01A entre
     as nove linhas que o painel de então não mostrava; o painel de resultado de
     PR-BOITEL-ACORDEAO-01 mostra "Custo da arroba", e ele é este. */
  const cPArr = aP > 0 ? cOp / aP : 0;
  const custoTotalBoitel = cDT + cs + oc;
  const margemVenda = fba > 0 ? ((fba - cOp) / fba * 100) : 0;

  /* ─── O ANTECIPADO ────────────────────────────────────────────────────────────
     PR-OC-VENDA-BOITEL-ANTECIPADO-NO-MOTOR-01. Ate aqui esta conta REDERIVAVA o
     adiantamento de diarias a partir de `pctAdiantamentoDiarias`:

         const custoTotalDiarias = data.custoDiaria * data.dias * data.qtdCabecas;
         const valorAdiantamentoDiariasCalc = data.possuiAdiantamento
           ? Math.round(custoTotalDiarias * data.pctAdiantamentoDiarias / 100 * 100) / 100
           : 0;

     ⚠ E ESSE PERCENTUAL NAO CHEGA AQUI. `zoo_operacao_boitel` NAO tem coluna de pct de
     adiantamento (conferido nas colunas: existem `valor_adiantamento_diarias`,
     `valor_adiantamento_sanitario` e `valor_adiantamento_outros`, e nenhum `pct_*` de
     adiantamento), e o campo tambem nao esta no `MAPA_BOITEL` — nao e' gravado nem
     hidratado. A tela do boitel na OC nem o pergunta: ela pede "Valor total adiantado",
     que escreve direto em `valorAdiantamentoDiarias`. Resultado: em toda operacao
     REABERTA o pct valia 0, e o antecipado sumia.

     ⚠ O PREJUIZO ERA VISIVEL E GRANDE. Medido na b58bf556: o painel dizia Antecipado
     R$ 1.540,00 (so' o sanitario) e Saldo a receber R$ 566.757,00, quando os valores sao
     R$ 96.783,50 e R$ 662.000,50 — noventa e cinco mil de diferenca, ao lado de uma
     previsao de caixa que dizia o numero certo.

     ⚠ O PCT NAO E' FANTASMA — SO' NAO E' DAQUI. Ele tem leitor vivo: e' campo de entrada
     do simulador legado (`BoitelPlanningDialog.tsx:242`, "% diárias"), que tem a SUA
     PROPRIA copia destas formulas (linhas 136-145), NAO importa `derivadosBoitel`, e
     persiste `pct_adiantamento_diarias` na tabela `boitel_planejamento` — onde a coluna
     existe de verdade. Por isso ele fica em `BoitelData` e nao se remove.
     ⚠ E OS DOIS CAMINHOS CONVERGEM: ao salvar, aquele dialogo grava
     `valorAdiantamentoDiarias = valorAdiantamentoDiariasCalc` (linha 153). O valor
     derivado do pct vira campo persistido — que e' exatamente o que se le abaixo.

     Agora o motor soma os TRES CAMPOS PERSISTIDOS, e nao depende de nada que a tela
     calcule: previsao e painel passam a dizer o mesmo numero por construcao.
     ⚠ `valorAdiantamentoDiariasCalc` SAIU DO RETORNO junto com o pct: era derivado
     exclusivamente dele e nao tinha um so' consumidor (medido em todo o src/). */
  const valorTotalAntecipadoCalc = data.possuiAdiantamento
    ? Math.round(((data.valorAdiantamentoDiarias || 0) + (data.valorAdiantamentoSanitario || 0)
                + (data.valorAdiantamentoOutros || 0)) * 100) / 100
    : 0;
  const saldoReceberBase = Math.round((fba - custoTotalBoitel - cAb + valorTotalAntecipadoCalc) * 100) / 100;

  return { ple, ganho, pf, aEF, aS, aPcab, aP, aTS, sairam, gmc, fba, cAb, fLiq, cDT, cOp, coT, cPArr,
    pParte, rProd, rLiq, rLCab, custoTotalBoitel, margemVenda,
    valorTotalAntecipadoCalc, saldoReceberBase };
}

/* ─── A ANALISE 1: PROJECAO x CUSTO DE OPORTUNIDADE ────────────────────────────
   PR-OC-VENDA-LAYOUT-NEG-01. Decisao do Gabriel: o custo de oportunidade mora no
   RESULTADO, e nao nos Custos — custo com custo, decisao com decisao. Ele nao e' um
   desembolso que o boitel cobra; e' o que o capital renderia noutro lugar.

   ⚠ FUNCAO IRMA, E `derivadosBoitel` INTOCADO. Mesmo padrao de `liquidoDaVendaBoitel`
   logo abaixo: le' o motor e nao o altera. As DUAS grandezas ja saiam de la' —
   `rLiq` e `coT` —, o que faltava exportado era o VEREDITO, que o simulador legado
   calcula solto no corpo do componente (BoitelPlanningDialog.tsx:159 e 162):

       const diffTotal = calc.rLiq - calc.coT;
       const pctDiffOp = calc.coT > 0 ? ((calc.rLiq - calc.coT) / calc.coT * 100) : 0;

   Escrever essas duas linhas dentro da tela criaria a SEGUNDA copia da mesma conta —
   a doenca que este mes inteiro passou consertando. Aqui elas ficam num lugar so'.

   ⚠ O LADO "RESULTADO" E' `rLiq`, E NAO O LIQUIDO DA VENDA. Os dois diferem PELO FRETE:
       liquidoDaVendaBoitel = fba - custoTotalBoitel - cAb      (custoTotalBoitel = cDT+cs+oc)
       rLiq                 = fba - cAb - cOp                   (cOp              = cDT+cs+oc+cf)
   Contra o custo de oportunidade vale o resultado do PRODUTOR, que paga o frete do
   proprio bolso — e' o mesmo lado que o simulador legado compara. Quem exibir os dois
   numeros na mesma tela precisa dizer que a diferenca e' o frete, senao parecem dois
   resultados brigando.

   ⚠ NULL QUANDO NAO HA O QUE COMPARAR: falta dado do planejamento, ou o custo de
   oportunidade nao foi informado (`coT` zero). Zero por cabeca nao e' "empate": e'
   ausencia de pergunta, e a tela mostra "—". */
export interface ComparativoOportunidade {
  /** `rLiq` — resultado do produtor, ja' com o frete descontado. */
  resultado: number;
  /** `coT` — o que o capital renderia noutro lugar. */
  oportunidade: number;
  diferenca: number;
  percentual: number;
}

export function comparativoOportunidade(d: BoitelEdicao | null): ComparativoOportunidade | null {
  if (!d) return null;
  if (exigencias(d).some(e => !e.presente)) return null;
  const x = derivadosBoitel(d);
  if (!(x.coT > 0)) return null;
  return {
    resultado: Math.round(x.rLiq * 100) / 100,
    oportunidade: Math.round(x.coT * 100) / 100,
    diferenca: Math.round((x.rLiq - x.coT) * 100) / 100,
    percentual: ((x.rLiq - x.coT) / x.coT) * 100,
  };
}

/* ─── O VALOR DA VENDA BOITEL ──────────────────────────────────────────────────
   PR-OC-VENDA-VALOR-LOTE-01. Decisão do Gabriel: o valor de uma venda boitel é SEMPRE o
   LIQUIDO, nunca o bruto — é o que sobra para o produtor depois do que o boitel cobra e
   do que o abate custa.

       liquido = fba - custoTotalBoitel - cAb

   ⚠ OS TRES SAEM DE `derivadosBoitel`, e nenhum é reescrito aqui. Uma segunda fórmula
   para a mesma pergunta é como dois números começam a divergir — a lição do
   `pesoMedioPorCabeca`, que este projeto já pagou uma vez.
   ⚠ O FRETE NAO ENTRA: é custo do produtor, pago por fora, e `custoTotalBoitel` já o
   exclui (lá é `cDT + cs + oc`). Ver PR-OC-VENDA-BOITEL-FRETE-PAGADOR-01.
   ⚠ O ADIANTAMENTO NAO ENTRA: é caixa antecipado e reembolsado no acerto; muda QUANDO o
   dinheiro passa, não QUANTO a venda vale.
   ⚠ A NUTRICAO NAO ENTRA, e agora esta' DECIDIDO: a diária já é a nutrição, e o campo
   duplicado saiu da tela em PR-OC-VENDA-NUTRICAO-DUPLICADA-01. A divergência que
   PR-OC-VENDA-BOITEL-CUSTO-COMPOSICAO-01 registrava está ENCERRADA — e encerrada do lado
   do motor, que estava certo: quem somava a mais era a tela.
   ⚠ DEVOLVE `null`, e nunca zero, quando não há o que calcular — sem os campos que
   sustentam a conta não existe projeção, e zero afirmaria que a venda não vale nada. */
export function liquidoDaVendaBoitel(d: BoitelEdicao | null): number | null {
  if (!d) return null;
  if (exigencias(d).some(e => !e.presente)) return null;
  const x = derivadosBoitel(d);
  return Math.round((x.fba - x.custoTotalBoitel - x.cAb) * 100) / 100;
}

/* ─── A MARCA DE PROJECAO ──────────────────────────────────────────────────────
   PR-OC-VENDA-ROTULO-PROJECAO-01. A aba de Negociação lança EXPECTATIVA — dias, GMD,
   diária e preço são projeção até o abate — e a tela não dizia isso em lugar nenhum.
   ⚠ MESMA FAMILIA VISUAL da pílula do valor na lista (417342ff): o TEXTO informa e o
   âmbar acompanha. Fora daquela tabela vale o piso de 10px do PADROES-UI.
   ⚠ UMA POR CONJUNTO, e não uma por seção: quatro pílulas iguais viram ruído e param de
   ser lidas.
   ⚠ O CENARIO VEM POR PROP, com 'projetado' fixo hoje porque é o único que a tela edita —
   o shell grava 'projetado' sempre. Quando PR-OC-VENDA-BOITEL-REALIZADO-01 existir, é
   esta prop que passa a receber 'realizado' e a marca troca de contexto. Não se deriva do
   banco aqui: a tela SABE o que está editando, e perguntar seria inventar incerteza. */
export type CenarioBoitel = 'projetado' | 'realizado';

export function PilulaCenario({ cenario = 'projetado' }: { cenario?: CenarioBoitel }) {
  if (cenario !== 'projetado') return null;
  return (
    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-normal text-amber-700"
      title="Planejamento projetado do boitel — o realizado será lançado no abate.">
      projeção
    </span>
  );
}

/* ─── O TOPO CONGELADO DA NEGOCIACAO ──────────────────────────────────────────
   PR-OC-VENDA-LAYOUT-NEG-01, item 1. Substitui o cartao "Base operacional" E o bloco de
   quatro numeros do cabecalho da secao de lotes: os dois diziam a MESMA coisa em dois
   lugares — cabecas e peso apareciam duas vezes na mesma aba, um dos dois sempre fora
   de vista. Agora ha um bloco so', e ele nao rola.

   ⚠ NAO DERIVA NADA. Recebe os quatro numeros ja' prontos de quem os tem: `lotesApi`
   e' a fonte de todos eles (cabecas e peso do boitel SAO os do lote — ver
   `boitelDaVenda`), e este componente so' formata. Uma conta aqui seria a terceira
   copia dos mesmos totais.
   ⚠ A PILULA MIGROU PARA CA, e nao ha uma segunda: ela marcava a faixa "Base
   operacional", que deixou de existir. Este bloco e' o cabecalho do boitel na aba, entao
   a marca cobre o conjunto — o planejamento E o valor do lote que dele deriva.
   ⚠ A21 — `sticky top-0`, fundo OPACO e a borda NO PROPRIO bloco.
   ⚠ SEM `-mt/pt` AQUI, e a ausencia e' a correcao (PR-OC-VENDA-LAYOUT-NEG-01B). A regra do
   A21 manda compensar o padding do container que rola; MEDIDO, este container nao tem
   nenhum: quem rola e' `space-y-2 min-w-0 lg:overflow-y-auto` (VendaModalShell:438), e o
   `p-4` mora no grid PAI, que nao rola. O `-mt-2 pt-2` que estava aqui compensava um
   padding inexistente — puxava o bloco 8px para cima e abria um vao de 8px por onde o
   conteudo passava ao rolar. Era o defeito do print 2. Compensar so' onde ha o que
   compensar; medir o container antes de copiar a receita.
   ⚠ AUSENCIA E' TRACO, nunca zero — o mesmo criterio do cabecalho de lotes que ele
   substitui. */
export function BoitelTopoNegociacao({ cabecas, pesoMedioKg, valorPorKg, valorTotal, cenario }: {
  cabecas: number;
  pesoMedioKg: number | null;
  valorPorKg: number | null;
  valorTotal: number;
  cenario?: CenarioBoitel;
}) {
  const itens: { rotulo: string; valor: string | null; destaque?: boolean }[] = [
    { rotulo: 'Cabeças',   valor: cabecas > 0 ? String(cabecas) : null },
    { rotulo: 'Peso',      valor: pesoMedioKg == null ? null : formatKg(pesoMedioKg) },
    { rotulo: 'R$/kg',     valor: valorPorKg == null ? null : formatMoeda(valorPorKg) },
    { rotulo: 'Valor',     valor: valorTotal > 0 ? formatMoeda(valorTotal) : null, destaque: true },
  ];
  return (
    <div className="sticky top-0 z-20 border-b bg-card pb-2">
      <div className="grid grid-cols-4 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
        {itens.map((i, idx) => (
          <div key={i.rotulo} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-normal text-muted-foreground leading-none">{i.rotulo}</span>
              {/* A pilula acompanha a ULTIMA coluna — o valor — porque e' dele que a
                  projecao fala. Uma por bloco, nunca uma por numero. */}
              {idx === itens.length - 1 && <PilulaCenario cenario={cenario} />}
            </div>
            {/* ⚠ `whitespace-nowrap`, NUNCA `truncate` — mesma regra da faixa do Resultado:
                numero cortado nao e' numero. Faltando largura, a linha cresce. */}
            <div className={`mt-1 text-[20px] font-medium leading-none whitespace-nowrap tabular-nums ${i.destaque ? 'text-primary' : ''}`}>
              {i.valor ?? <span className="text-muted-foreground font-normal">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Par rótulo-valor do painel — A17. Segue o idioma do `LinhaResumo` do VendaModalShell. */
function LinhaPainel({ rotulo, valor, destaque }: { rotulo: string; valor: string | null; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className={`text-right truncate tabular-nums ${destaque ? 'font-bold' : 'font-medium'} ${valor ? '' : 'text-muted-foreground font-normal'}`}>
        {valor ?? '—'}
      </span>
    </div>
  );
}

function TituloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">{children}</span>
    </div>
  );
}

/* ─── PAINEL DE RESULTADO — a coluna da direita ────────────────────────────────
   PR-BOITEL-ACORDEAO-01. Quatro números, e a razão de serem quatro: o operador mexe na
   diária olhando a margem. O que não é decisão fica de fora — memória de cálculo é o que
   o `BoitelPainelResultado` abaixo mostra.
   ⚠ RECALCULA A CADA TECLA, e é isso que faz o redesenho valer. Nada aqui é memoizado
   contra o valor digitado de propósito.
   ⚠ TRAVESSAO, NUNCA ZERO: sem dado que sustente a conta, o número não aparece. */
export function BoitelResultadoCompacto({ boitelData, cenario }: {
  boitelData: BoitelEdicao | null;
  cenario?: CenarioBoitel;
}) {
  const liquido = liquidoDaVendaBoitel(boitelData);
  const cmp = useMemo(() => comparativoOportunidade(boitelData), [boitelData]);

  return (
    <section className="rounded-md border bg-card px-3 py-2.5 shadow-sm min-w-0">
      {/* ─── FAIXA ENXUTA, LARGURA TOTAL ──────────────────────────────────────────
          PR-OC-VENDA-LAYOUT-NEG-01B (forma final). Ela ja foi a terceira coluna de uma
          grade de tres num modal de 1024px, e sobravam ~280px: "R$ 5...." e "7,41 ..." —
          numero TRUNCADO, que e' pior que card alto, porque numero cortado nao e' numero.
          Depois deitou com quatro pares e o campo do custo de oportunidade; agora ficam
          so' os DOIS numeros que decidem. Os quatro pares sao memoria de calculo e vivem
          no `BoitelPainelResultado`; o campo do CoP voltou para o modal de Custos, que e'
          onde se digita.
          ⚠ NENHUM `truncate` AQUI. `whitespace-nowrap` em tudo: faltando largura, o
          `flex-wrap` cresce em altura e nenhum digito se perde. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">

        {/* O NUMERO DA VENDA — a mesma fonte do lote e da previsao do financeiro
            (`liquidoDaVendaBoitel`), uma verdade so'. */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-normal text-muted-foreground leading-none">Líquido projetado</span>
            <PilulaCenario cenario={cenario} />
          </div>
          <div className={`mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap ${
            liquido == null ? 'text-muted-foreground font-normal' : 'text-primary'}`}>
            {liquido == null ? '—' : formatMoeda(liquido)}
          </div>
        </div>

        {/* O VEREDITO — a ANALISE 1 reduzida a uma frase.
            ⚠ "vs. vender vivo hoje" e' o que o custo de oportunidade PERGUNTA em
            portugues: quanto o capital renderia se o gado nao fosse para o boitel.
            ⚠ O NUMERO COMPARADO E O RESULTADO APOS O FRETE, e nao o liquido a' esquerda —
            os dois diferem pelo frete, que o produtor paga por fora. O `title` carrega
            isso; sem ele, a diferenca pareceria um salto sem explicacao. Ver
            `comparativoOportunidade`.
            ⚠ SINAL E FRASE, nao so' cor: "+3,0% acima" se le' em monocromatico. */}
        <div className="min-w-0 text-right">
          {cmp == null ? (
            <span className="text-[10px] text-muted-foreground">
              {boitelData && boitelData.custoOportunidade > 0
                ? 'Faltam dados do planejamento para comparar.'
                : 'Informe o custo de oportunidade em Custos para comparar.'}
            </span>
          ) : (
            <div title={`Resultado após frete ${formatMoeda(cmp.resultado)} contra custo de oportunidade ${formatMoeda(cmp.oportunidade)}`}>
              <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">
                vs. vender vivo hoje
              </div>
              <div className={`mt-1 text-[15px] font-medium leading-none tabular-nums whitespace-nowrap ${
                cmp.diferenca >= 0 ? 'text-emerald-700 dark:text-emerald-500' : 'text-destructive'}`}>
                {cmp.diferenca >= 0 ? '+' : '−'}{Math.abs(cmp.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                {' '}{cmp.diferenca >= 0 ? 'acima' : 'abaixo'}
                {' · '}{cmp.diferenca >= 0 ? '+' : '−'}{formatMoeda(Math.abs(cmp.diferenca))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!boitelData && (
        <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
          Sem planejamento gravado nesta venda.
        </p>
      )}
    </section>
  );
}



/* ─── O RESULTADO INTEIRO ──────────────────────────────────────────────────────
   240px, dois grupos: Indicadores e Operação.
   ⚠ FORA DA TELA DESDE PR-BOITEL-ACORDEAO-01, e de propósito: a coluna da direita passou
   a mostrar os quatro números de decisão, e este é a memória de cálculo. Ele NAO é órfão
   por acidente — é a peça que `PR-OC-VENDA-BOITEL-RESUMO-MODAL-01` vai abrir num modal,
   para print e para mandar aos responsáveis. Se aquele PR morrer, este componente sai
   junto. */
export function BoitelPainelResultado({ boitelData, cenario }: { boitelData: BoitelEdicao | null; cenario?: CenarioBoitel }) {
  const faltas = useMemo(() => boitelData ? exigencias(boitelData).filter(e => !e.presente) : [], [boitelData]);
  const d = useMemo(() => boitelData ? derivadosBoitel(boitelData) : null, [boitelData]);

  const faltaInd = faltas.some(f => f.grupo === 'ind');
  const faltaOp = faltaInd || faltas.some(f => f.grupo === 'op');

  /* `ind` e `op` devolvem null quando o dado que sustenta a conta não existe — é isso
     que faz o "—" aparecer em vez de um zero que parece resultado. */
  const ind = (fn: (x: NonNullable<typeof d>) => string) => (d && !faltaInd ? fn(d) : null);
  const op  = (fn: (x: NonNullable<typeof d>) => string) => (d && !faltaOp ? fn(d) : null);

  return (
    <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px] min-w-0">
      {/* ⚠ JA NASCE MARCADO para quando `PR-OC-VENDA-BOITEL-RESUMO-MODAL-01` o abrir num
          modal para print: um print que sai do sistema sem dizer que e' projecao e' o
          mesmo risco da lista, so' que fora da tela e sem contexto. */}
      <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center justify-between gap-2 px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
        <span>Resultado do boitel</span>
        <PilulaCenario cenario={cenario} />
      </div>
      <div className="pb-1">
        <TituloGrupo>Indicadores</TituloGrupo>
        <div className="px-3 space-y-0.5">
          <LinhaPainel rotulo="Peso entrada"   valor={ind(x => formatKg(x.ple))} />
          <LinhaPainel rotulo="Ganho período"  valor={ind(x => formatKg(x.ganho))} />
          <LinhaPainel rotulo="Peso final"     valor={ind(x => formatKg(x.pf))} />
          <LinhaPainel rotulo="GMC"            valor={ind(x => `${x.gmc.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`)} />
          <LinhaPainel rotulo="@ prod./cab"    valor={ind(x => formatArroba(x.aPcab))} />
          <LinhaPainel rotulo="@ produzidas"   valor={ind(x => formatArroba(x.aP))} />
          <LinhaPainel rotulo="@ saída total"  valor={ind(x => formatArroba(x.aTS))} />
        </div>

        <TituloGrupo>Operação</TituloGrupo>
        <div className="px-3 space-y-0.5">
          <LinhaPainel rotulo="Faturamento bruto" valor={op(x => formatMoeda(x.fba))} />
          <LinhaPainel rotulo="Despesas de abate" valor={op(x => formatMoeda(x.cAb))} />
          <LinhaPainel rotulo="Fatur. líquido"    valor={op(x => formatMoeda(x.fLiq))} />
          <LinhaPainel rotulo="Custo do boitel"   valor={op(x => formatMoeda(x.custoTotalBoitel))} />
          {boitelData?.modalidadeCusto === 'parceria' && (
            <LinhaPainel rotulo="(-) Parceiro" valor={op(x => formatMoeda(x.pParte))} />
          )}
          <LinhaPainel rotulo="Resultado líquido" valor={op(x => formatMoeda(x.rLiq))} destaque />
          <LinhaPainel rotulo="Result./cab"       valor={op(x => formatMoeda(x.rLCab))} />
          <LinhaPainel rotulo="Margem s/ venda"   valor={op(x => `${x.margemVenda.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`)} />
          {/* ⚠ O ANTECIPADO SAI DOS TRES CAMPOS PERSISTIDOS (diárias + sanitário +
              outros) — é o que o mockup chamou de "valor total adiant. em R$".
              O comentário anterior dizia "sai do percentual das diárias", e essa era a
              descrição do defeito, não do comportamento: o percentual não existe como
              coluna nesta tabela e zerava a linha em operação reaberta. Ver a nota em
              `derivadosBoitel`. */}
          <LinhaPainel rotulo="Antecipado"        valor={op(x => formatMoeda(x.valorTotalAntecipadoCalc))} />
          <LinhaPainel rotulo="Saldo a receber"   valor={op(x => formatMoeda(x.saldoReceberBase))} destaque />
        </div>

        {/* ⚠ O QUE FALTA, EM AMBAR. Nunca zero mudo: o painel diz o que impede. */}
        {!boitelData ? (
          <div className="mx-3 mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-[1px]" />
              <span className="leading-snug">
                Sem planejamento de boitel gravado nesta venda. Os números aparecem quando
                o planejamento existir.
              </span>
            </div>
          </div>
        ) : faltas.length > 0 ? (
          <div className="mx-3 mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-[1px]" />
              <span className="leading-snug">
                Falta {faltas.map(f => f.rotulo).join(', ')}.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
