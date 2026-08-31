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
  /* ─── DE QUE LADO DO ACERTO MORA CADA DESPESA ────────────────────────────────
     PR-OC-VENDA-REALIZADO-01A. Ate' aqui a regra era CRAVADA no motor — o frete sempre
     fora do custo do boitel, as despesas de abate sempre dentro — e nao havia como o
     operador descrever um contrato que combinasse diferente.
     `true` = NO BOITEL: desconta do repasse, sem caixa proprio.
     `false` = DO PRODUTOR: fica fora do acerto e vira previsao de caixa no Financeiro.
     ⚠ OS DEFAULTS SAO A REGRA DE HOJE (frete fora, abate dentro), e e' isso que faz
     nenhum numero existente mudar. Diaria e sanidade NAO tem flag: sao sempre do boitel,
     e uma pergunta sem duas respostas possiveis so' gasta a atencao de quem le'.
     ⚠ Estendem `BoitelEdicao`, e nao `BoitelData`: o simulador legado nao os conhece. */
  custoFreteNoBoitel?: boolean;
  despesasAbateNoBoitel?: boolean;
  notasEnvioNoBoitel?: boolean;
  /** ⚠ Default `true`, ao contrario dos irmaos: "Outros" SEMPRE viveu dentro do acerto. */
  outrosNoBoitel?: boolean;
  /** Despesa nova — guias de envio. Nasce zerada, do lado do produtor. */
  custoNotasEnvio?: number;
  /** Data em que o abate aconteceu. Do cenario REALIZADO; vazia enquanto nao acontecer. */
  dataAbate?: string;
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
  /* ⚠ GMC MEDE DA PORTEIRA AO GANCHO — DECISAO DE PRODUTO do Gabriel, 31/08, POR CIMA da
     formula herdada do simulador antigo. A base da ponta de entrada e' o peso de SAIDA DA
     FAZENDA (`pi`), e nao o pos-quebra (`ple`): a viagem esta' DENTRO do ciclo que o
     indicador mede, e descontá-la da base faria o boitel parecer produzir carcaca que ele
     nao produziu.
     ⚠ O SIMULADOR LEGADO NAO ACOMPANHA SOZINHO: `BoitelPlanningDialog.tsx:96` tem a sua
     PROPRIA copia desta linha, ainda com `ple`. Ele nao importa `derivadosBoitel` — e' o
     mesmo caso do `custoNfAbate` e do `pctAdiantamentoDiarias`, ja registrados. Enquanto
     ele viver, os dois caminhos mostram GMC diferente para o mesmo lote (1,010 aqui,
     1,066 la'). Reportado; a convergencia e' decisao de quando aposentar o legado.
     ⚠ `gmc` E FOLHA: medido, nenhum outro derivado o consome. Mudar esta linha muda os
     DOIS consumidores (o painel longo e o campo do modal) e mais nada. */
  const gmc = dias > 0 ? ((pf * rs / 100) - (pi * re / 100)) / dias : 0;
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
  /* ─── DE QUE LADO DO ACERTO MORA CADA DESPESA ────────────────────────────────
     PR-OC-VENDA-REALIZADO-01A. Ate' aqui a regra era CRAVADA: o frete SEMPRE fora do
     custo do boitel, as despesas de abate SEMPRE dentro. Agora cada uma declara o lado, e
     os defaults reproduzem a regra antiga — nenhum numero existente muda.

     ⚠ AS FLAGS NAO MUDAM O RESULTADO DO PRODUTOR, e essa e' a chave para nao errar aqui.
     Elas decidem ONDE cada custo e' cobrado (descontado do repasse x pago por fora), nao
     SE ele existe. Por isso `rLiq`, `cPArr` e `coT` NAO consultam flag nenhuma: quem soma
     tudo soma tudo, dos dois lados. O que as flags governam e' o LIQUIDO DO ACERTO (o que
     o boitel repassa) e a PREVISAO DE CAIXA (o que sai do bolso do produtor).
     ⚠ `?? default` em vez de `!` — os tres booleanos sao opcionais no tipo, e um registro
     hidratado por caminho que nao passe pelo `MAPA_BOITEL` chegaria `undefined`. O default
     e' o do banco, letra por letra. */
  const cne = data.custoNotasEnvio || 0;
  const freteNoBoitel = data.custoFreteNoBoitel ?? false;
  const abateNoBoitel = data.despesasAbateNoBoitel ?? true;
  const notasNoBoitel = data.notasEnvioNoBoitel ?? false;
  const outrosNoBoitel = data.outrosNoBoitel ?? true;

  /* ⚠ `cne` ENTRA NO CUSTO OPERACIONAL como o frete — e' desembolso, e o custo da arroba
     produzida tem de conhecê-lo. Com a despesa nova zerada, `cOp`, `cPArr` e `rLiq` sao
     identicos aos de antes, ao centavo.
     ⚠ `cAb` NAO ENTRA NO `cOp`, e nunca entrou: ele ja e' descontado via `fLiq`. Soma-lo
     aqui o cobraria duas vezes no `rLiq`. */
  const cOp = cDT + cs + oc + cf + cne;
  const coT = co * pi * q;
  let rProd = fLiq, pParte = 0, pArr = 0;
  if (mc === 'parceria') { pArr = aP * (pp / 100); pParte = pArr * pva; rProd = fLiq - pParte; }
  const rLiq = rProd - cOp;
  const rLCab = q > 0 ? rLiq / q : 0;
  /* ⚠ VOLTOU DO SIMULADOR, verbatim (`BoitelPlanningDialog.tsx:117`). Saiu no 01A entre
     as nove linhas que o painel de então não mostrava; o painel de resultado de
     PR-BOITEL-ACORDEAO-01 mostra "Custo da arroba", e ele é este. */
  const cPArr = aP > 0 ? cOp / aP : 0;
  /* ⚠ `custoTotalBoitel` PASSOU A SER SO' O QUE O BOITEL SEMPRE COBRA — diarias e
     sanidade. "Outros" saiu daqui e virou parcela CONDICIONADA no `descontoDoAcerto`,
     como frete, abate e notas de envio: era a ultima despesa sem escolha de lado.
     ⚠ COM O DEFAULT `true` A SOMA E A MESMA, ao centavo — `oc` volta pelo condicional.
     Quem le' este numero fora daqui (o resumo do card, o painel longo) continua vendo o
     custo do boitel, agora sem a parte que o contrato pos no bolso do produtor. */
  const custoTotalBoitel = cDT + cs + (outrosNoBoitel ? oc : 0);

  /* ─── UMA COMPOSICAO, NUNCA DOIS CAMINHOS ────────────────────────────────────
     O que o boitel desconta do repasse: o que ele sempre cobra (diarias, sanidade,
     outros) MAIS as despesas que o contrato pos do lado dele.
     ⚠ `cAb` DEIXOU DE SER SUBTRACAO SEPARADA. O liquido era
     `fba - custoTotalBoitel - cAb`, com o abate por fora da soma como se fosse outra
     natureza de coisa; agora e' uma parcela CONDICIONADA como as outras duas. Uma
     composicao so' — e o dia em que uma quarta despesa aparecer, ela entra aqui e em
     nenhum outro lugar. */
  const descontoDoAcerto = cDT + cs
    + (outrosNoBoitel ? oc : 0)
    + (freteNoBoitel ? cf : 0)
    + (abateNoBoitel ? da : 0)
    + (notasNoBoitel ? cne : 0);

  /* O QUE SAI DO BOLSO DO PRODUTOR — o complemento exato do desconto. A aba Financeiro
     le' daqui para montar a linha de previsao de caixa: o que o operador marcar como
     "produtor" entra na previsao, o que marcar "boitel" sai dela. */
  const custosDoProdutor = (outrosNoBoitel ? 0 : oc)
    + (freteNoBoitel ? 0 : cf)
    + (abateNoBoitel ? 0 : da)
    + (notasNoBoitel ? 0 : cne);

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
  const saldoReceberBase = Math.round((fba - descontoDoAcerto + valorTotalAntecipadoCalc) * 100) / 100;

  return { ple, ganho, pf, aEF, aS, aPcab, aP, aTS, sairam, gmc, fba, cAb, fLiq, cDT, cOp, coT, cPArr,
    pParte, rProd, rLiq, rLCab, custoTotalBoitel, margemVenda,
    descontoDoAcerto, custosDoProdutor, cne,
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

       liquido = fba - descontoDoAcerto

   ⚠ A COMPOSICAO PASSOU A OBEDECER AS FLAGS — PR-OC-VENDA-REALIZADO-01A. Era
   `fba - custoTotalBoitel - cAb`, com o frete sempre fora e o abate sempre dentro; agora
   `descontoDoAcerto` reune o que o CONTRATO pos do lado do boitel. Com os defaults o
   numero e' o mesmo ao centavo (conferido na b58bf556: R$ 565.217,00 antes e depois).
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
  return Math.round((x.fba - x.descontoDoAcerto) * 100) / 100;
}

/* ─── OS UNITARIOS DO LIQUIDO ──────────────────────────────────────────────────
   PR-OC-VENDA-LAYOUT-NEG-01D, item 4. O liquido da venda por cabeca e por quilo — os
   dois numeros com que o produtor compara uma venda com outra.
   ⚠ FUNCAO IRMA, pelo mesmo motivo de `comparativoOportunidade`: sao divisoes de um
   numero soberano por duas bases, e escritas na tela virariam a segunda copia no dia em
   que a base mudar. `derivadosBoitel` segue intocado.
   ⚠ O DENOMINADOR DO /kg E O PESO DE SAIDA DA FAZENDA vezes o LOTE INTEIRO — o mesmo
   peso que o topo exibe. Nao e' o peso de carcaca: quem vende arroba de carcaca e' o
   preco de venda, outro numero, noutra unidade.
   ⚠ NULL, NUNCA ZERO: sem liquido ou sem base, nao ha unitario — e a tela mostra "—". */
export interface UnitariosLiquido { porCabeca: number | null; porKg: number | null }

export function unitariosDoLiquido(d: BoitelEdicao | null, base?: number | null): UnitariosLiquido {
  /* ⚠ `base` PARAMETRIZA A GRANDEZA, e nao duplica a conta — PR-OC-VENDA-CASCATA-BOLSO-01.
     A cascata precisa dos unitarios do LIQUIDO NO BOLSO (`rLiq`), nao do acerto; escrever
     `bolso/cabecas` na tela seria a segunda copia da mesma divisao, e ela divergiria no dia
     em que o denominador mudasse. Omitida, vale o liquido da venda — o comportamento de
     antes, para quem ja chamava. */
  const liq = base !== undefined ? base : liquidoDaVendaBoitel(d);
  if (d == null || liq == null) return { porCabeca: null, porKg: null };
  const q = d.qtdCabecas || 0;
  const pesoTotal = q * (d.pesoInicial || 0);
  return {
    porCabeca: q > 0 ? Math.round((liq / q) * 100) / 100 : null,
    porKg: pesoTotal > 0 ? Math.round((liq / pesoTotal) * 100) / 100 : null,
  };
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
export function BoitelTopoNegociacao({ cabecas, pesoMedioKg, valorPorKg, valorTotal, cenario, slotLote }: {
  cabecas: number;
  pesoMedioKg: number | null;
  valorPorKg: number | null;
  valorTotal: number;
  cenario?: CenarioBoitel;
  /* ⚠ O LOTE VIROU O TERCEIRO FATO — PR-OC-VENDA-CASCATA-BOLSO-01 (complemento C). A
     linha magra que vivia abaixo do topo MORREU: ela repetia cabecas (ja aqui) e o
     R$/cab (ja nos unitarios da faixa), e sobrava dizendo a categoria — que e' fato, como
     os dois vizinhos, e pertence a este bloco.
     ⚠ VEM PRONTO DE FORA, como `ReactNode`, e a razao e' de maquina: quem sabe abrir a
     edicao de lote e' o `AbaNegociacaoLotes`, dono do `LoteDialog` e do `editandoId`.
     Reconstruir aquele caminho aqui seria um SEGUNDO jeito de editar lote — a doenca que
     esta frente inteira passou consertando. O endereco mudou; a maquina, nao. */
  slotLote?: ReactNode;
}) {
  const traco = <span className="text-muted-foreground font-normal">—</span>;
  return (
    <div className="sticky top-0 z-20 border-b bg-card pb-2">
      {/* ─── FATO A ESQUERDA, PROJECAO A DIREITA ──────────────────────────────────
          PR-OC-VENDA-LAYOUT-NEG-01D. E' a regra que organiza a tela inteira e a
          FUNDACAO do REALIZADO: fato e' solido, projecao e' marcada. Quando o realizado
          entrar, ele vem SOLIDO ao lado do ambar e o comparativo nasce da cor — sem
          precisar de uma terceira coluna dizendo "previsto x realizado".
          ⚠ CABECAS E PESO SAO FATO: vieram do lote negociado, ja acordado. R$/kg e valor
          do lote sao PROJECAO — derivam do planejamento, que ainda vai acontecer.
          ⚠ UMA PILULA POR GRUPO, NUNCA POR NUMERO. Marcar cada valor faria a marca virar
          ruido de fundo e parar de informar; a moldura ambar ja diz onde ela vale. */}
      <div className="flex flex-wrap items-stretch gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px]">

        <div className="flex min-w-0 flex-1 flex-wrap gap-x-7 gap-y-2">
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">Cabeças</div>
            <div className="mt-1 text-[22px] font-medium leading-none tabular-nums whitespace-nowrap text-foreground">
              {cabecas > 0 ? cabecas : traco}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">Peso de saída da faz.</div>
            <div className="mt-1 text-[22px] font-medium leading-none tabular-nums whitespace-nowrap text-foreground">
              {pesoMedioKg == null ? traco : formatKg(pesoMedioKg)}
            </div>
          </div>
          {slotLote}
        </div>

        <div className="flex min-w-0 flex-wrap gap-x-7 gap-y-2 border-l-2 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 pl-3.5 pr-2 py-0.5 rounded-r-md">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">R$/kg</span>
              <PilulaCenario cenario={cenario} />
            </div>
            {/* ⚠ O AMBAR E' O DO 600 DA FAMILIA DA PILULA. `dark:` proprio porque o hex
                fixo some no fundo escuro — a marca tem de sobreviver aos dois temas. */}
            <div className="mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap text-[#854F0B] dark:text-amber-500">
              {valorPorKg == null ? traco : formatMoeda(valorPorKg)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">Valor liq. do lote</div>
            <div className="mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap text-[#854F0B] dark:text-amber-500">
              {valorTotal > 0 ? formatMoeda(valorTotal) : traco}
            </div>
          </div>
        </div>
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
  const cmp = useMemo(() => comparativoOportunidade(boitelData), [boitelData]);
  const d = useMemo(() => boitelData ? derivadosBoitel(boitelData) : null, [boitelData]);
  const faltas = useMemo(() => boitelData ? exigencias(boitelData).filter(e => !e.presente) : [], [boitelData]);
  const pronto = !!d && faltas.length === 0;
  /* ⚠ O BOLSO E `rLiq`, e nao um numero novo: acerto liquido menos os gastos diretos do
     produtor. E' exatamente o que o veredito SEMPRE comparou com vender vivo hoje — a
     cascata so' torna visivel o caminho que levava ate' ele. */
  const bolso = pronto ? d.rLiq : null;
  const uni = useMemo(() => unitariosDoLiquido(boitelData, bolso), [boitelData, bolso]);
  const ganhou = cmp != null && cmp.diferenca >= 0;

  return (
    <section className="rounded-md border bg-card px-3.5 py-3 shadow-sm min-w-0">
      {/* ─── A CASCATA DO BOLSO ────────────────────────────────────────────────────
          PR-OC-VENDA-CASCATA-BOLSO-01. O numero que decide e' o LIQUIDO NO BOLSO, e ele
          estava invisivel: a tela mostrava o acerto (565.217) e o veredito comparava
          outro numero (554.717), sem dizer que a diferenca era o gasto direto. Quem lia
          via um salto sem explicacao — e a explicacao cabia em duas linhas de conta.
          ⚠ A CASCATA SAI SEMPRE INTEIRA, mesmo com gasto direto zerado: uma linha que
          some quando vale zero faz a conta parecer outra a cada operacao, e o leitor perde
          a referencia de onde procurar cada degrau.
          ⚠ "Acerto liquido" SEM DESTAQUE, de proposito: o destaque dele mora no cartao de
          Projecao, acima. Aqui ele e' degrau, nao resposta. */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">

        <div className="min-w-0 w-fit max-w-[380px]">
          <LinhaCascata rotulo="Faturamento projetado" valor={pronto ? formatMoeda(d.fba) : null} />
          <LinhaCascata rotulo="− Descontos do boitel" valor={pronto ? `− ${formatMoeda(d.descontoDoAcerto)}` : null} />
          <LinhaCascata rotulo="= Acerto líquido"      valor={pronto ? formatMoeda(d.fba - d.descontoDoAcerto) : null} />
          <LinhaCascata rotulo="− Gastos diretos"      valor={pronto ? `− ${formatMoeda(d.custosDoProdutor)}` : null} />

          <div className="mt-1.5 border-t pt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-normal text-secondary leading-none whitespace-nowrap">= Líquido no bolso</span>
              <PilulaCenario cenario={cenario} />
            </div>
            <div className={`mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap ${
              bolso == null ? 'text-muted-foreground font-normal' : 'text-[#854F0B] dark:text-amber-500'}`}>
              {bolso == null ? '—' : formatMoeda(bolso)}
            </div>
            {/* Os unitarios do BOLSO — a mesma funcao irma, com a base trocada. */}
            {(uni.porCabeca != null || uni.porKg != null) && (
              <div className="mt-1.5 text-[13px] leading-none tabular-nums whitespace-nowrap text-[#854F0B] dark:text-amber-500">
                {uni.porCabeca == null ? '—' : `${formatMoeda(uni.porCabeca)}/cab`}
                {' · '}
                {uni.porKg == null ? '—' : `${formatMoeda(uni.porKg)}/kg liq.`}
              </div>
            )}
          </div>
        </div>

        {/* O VEREDITO — a ANALISE 1 reduzida a uma frase.
            ⚠ "apos frete" SAIU da conferencia: aquilo existia para explicar por que o
            numero comparado nao era o liquido mostrado ao lado. A cascata acabou de
            mostrar o caminho inteiro, entao a ressalva virou repeticao. */}
        <div className="min-w-0 lg:max-w-[55%]">
          {cmp == null ? (
            <span className="text-[11px] text-muted-foreground leading-snug">
              {boitelData && boitelData.custoOportunidade > 0
                ? 'Faltam dados do planejamento para comparar com a venda de hoje.'
                : 'Informe o custo de oportunidade em Custos para comparar com a venda de hoje.'}
            </span>
          ) : (
            <>
              <p className={`text-[11px] leading-[1.45] ${ganhou ? 'text-success' : 'text-destructive'}`}>
                Mandar para o boitel deve render{' '}
                <span className="font-medium tabular-nums">{formatMoeda(Math.abs(cmp.diferenca))}</span>
                {' '}<span className="font-medium">{ganhou ? 'a mais' : 'a menos'}</span>
                {' '}(<span className="font-medium tabular-nums">{ganhou ? '+' : '−'}{Math.abs(cmp.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>)
                {' '}do que vender esses animais vivos hoje.
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground leading-snug tabular-nums">
                comparando o líquido no bolso ({formatMoeda(cmp.resultado)}) com a venda a{' '}
                {formatMoeda(boitelData?.custoOportunidade ?? 0)}/kg hoje ({formatMoeda(cmp.oportunidade)})
              </p>
            </>
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

/* Um degrau da cascata — A18: rotulo 12px, valor 12px tabular, duas colunas `w-fit`.
   ⚠ SEM `truncate` no valor; a tabela cresce, o numero nao encolhe. */
function LinhaCascata({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-6 leading-[1.6]">
      <span className="text-[12px] font-normal text-secondary whitespace-nowrap">{rotulo}</span>
      <span className={`text-[12px] tabular-nums whitespace-nowrap ${
        valor ? 'text-[#854F0B] dark:text-amber-500' : 'text-muted-foreground'}`}>
        {valor ?? '—'}
      </span>
    </div>
  );
}

/* ─── AS COMPARACOES — o cartao que so' existe DEPOIS DO ABATE ─────────────────
   PR-OC-VENDA-REALIZADO-02. Enquanto ha um mundo so', nao ha o que comparar: o cartao
   nem aparece. Com os dois, ele diz o que mudou entre o que se planejou e o que
   aconteceu.
   ⚠ COR E' VEREDITO, NUNCA SINAL CRU. "+3 dias" nao diz se foi bom; ficar mais tempo no
   boitel pode ser otimo (ganhou peso) ou pessimo (atrasou o abate). Por isso cada linha
   declara o que e' BOM para ela — `maiorEMelhor` —, e a cor sai dali. Numero cru com
   sinal deixaria o leitor decidir, e ele decidiria errado metade das vezes.
   ⚠ "vs. VENDER VIVO NA EPOCA" e' a analise 3: o mesmo custo de oportunidade, agora
   contra o resultado REAL. E' a pergunta que so' o abate responde — valeu a pena? */
export function BoitelComparacoes({ projetado, realizado }: {
  projetado: BoitelEdicao | null; realizado: BoitelEdicao | null;
}) {
  const dados = useMemo(() => {
    if (!projetado || !realizado) return null;
    const p = derivadosBoitel(projetado);
    const r = derivadosBoitel(realizado);
    const lp = liquidoDaVendaBoitel(projetado);
    const lr = liquidoDaVendaBoitel(realizado);
    if (lp == null || lr == null) return null;
    return { p, r, lp, lr, cmp: comparativoOportunidade(realizado) };
  }, [projetado, realizado]);
  if (!dados) return null;
  const { p, r, lp, lr, cmp } = dados;

  const linhas: { rotulo: string; previsto: string; real: string; delta: number; texto: string; maiorEMelhor: boolean }[] = [
    { rotulo: 'Líquido', previsto: formatMoeda(lp), real: formatMoeda(lr),
      delta: lr - lp, texto: formatMoeda(Math.abs(lr - lp)), maiorEMelhor: true },
    { rotulo: 'GMD', previsto: `${projetado.gmd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`,
      real: `${realizado.gmd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`,
      delta: realizado.gmd - projetado.gmd,
      texto: `${Math.abs(realizado.gmd - projetado.gmd).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`,
      maiorEMelhor: true },
    { rotulo: 'Dias', previsto: String(projetado.dias), real: String(realizado.dias),
      delta: realizado.dias - projetado.dias, texto: `${Math.abs(realizado.dias - projetado.dias)} dias`,
      /* ⚠ MENOS DIAS E MELHOR: cada dia a mais e' uma diaria a mais no acerto. */
      maiorEMelhor: false },
    { rotulo: 'Peso de abate', previsto: formatKg(p.pf), real: formatKg(r.pf),
      delta: r.pf - p.pf, texto: formatKg(Math.abs(r.pf - p.pf)), maiorEMelhor: true },
  ];

  return (
    <section className="rounded-md border bg-card p-3 shadow-sm min-w-0 lg:col-span-2">
      <div className="text-[13px] font-medium text-foreground leading-none border-b pb-1.5 mb-2.5">
        Previsto × realizado
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        {linhas.map(l => {
          const bom = l.delta === 0 ? null : (l.delta > 0) === l.maiorEMelhor;
          return (
            <div key={l.rotulo} className="min-w-0">
              <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">{l.rotulo}</div>
              <div className="mt-1 text-[15px] font-medium leading-none tabular-nums whitespace-nowrap text-foreground">{l.real}</div>
              <div className="mt-1 text-[9px] tabular-nums leading-snug text-[#854F0B] dark:text-amber-500">
                previsto: {l.previsto}
              </div>
              <div className={`mt-0.5 text-[10px] font-medium tabular-nums leading-snug whitespace-nowrap ${
                bom == null ? 'text-muted-foreground' : bom ? 'text-success' : 'text-destructive'}`}>
                {l.delta === 0 ? 'igual ao previsto' : `${l.delta > 0 ? '+' : '−'}${l.texto}`}
              </div>
            </div>
          );
        })}
      </div>
      {cmp && (
        <p className={`mt-3 border-t pt-2 text-[11px] leading-[1.45] ${cmp.diferenca >= 0 ? 'text-success' : 'text-destructive'}`}>
          Mandar para o boitel rendeu{' '}
          <span className="font-medium tabular-nums">{formatMoeda(Math.abs(cmp.diferenca))}</span>
          {' '}<span className="font-medium">{cmp.diferenca >= 0 ? 'a mais' : 'a menos'}</span>
          {' '}(<span className="font-medium tabular-nums">{cmp.diferenca >= 0 ? '+' : '−'}{Math.abs(cmp.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>)
          {' '}do que vender esses animais vivos na época.
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
