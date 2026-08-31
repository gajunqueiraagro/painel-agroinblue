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
import { formatMoeda, formatKg } from '@/lib/calculos/formatters';
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
  /* ─── OS TRES FATOS DO PAPEL — PR-OC-VENDA-REALIZADO-02E ─────────────────────
     ⚠ `undefined` E RESPOSTA, e nao ausencia de dado: significa "o abate ainda nao
     aconteceu". As colunas sao nullable e sem default justamente por isso — um zero ali
     diria "abateu zero cabecas", que e' outra coisa.
     ⚠ `qtdAbatida` E O TERCEIRO NUMERO do lote: negociadas (do lote) menos mortes nao
     bastava, porque no ABATE PARCIAL animais doentes ficam no boitel e o acerto deles vem
     depois. Sem coluna propria, o saldo teria de virar "morte" — e morte propaga ao
     rebanho. */
  qtdAbatida?: number;
  /** O valor do papel, ja liquido de bonus, tributos e descontos do frigorifico. */
  valorTotalAbate?: number;
  /** O acerto que o boitel informou — para a conferencia deixar de ser do momento. */
  acertoPapel?: number;
  /* ⚠ MARCA DE EDICAO MANUAL DOS DIAS — 02G item 2. Nao e' dado do negocio: e' memoria de
     que o operador digitou por cima da derivacao pela data. Sem ela, a tela nao saberia se
     o numero na frente dele veio da conta ou da mao — e a ajuda mentiria numa das duas.
     ⚠ NAO PERSISTE (fora do `MAPA_BOITEL`), e e' deliberado: ao reabrir, a derivacao pela
     data volta a valer, que e' o comportamento certo depois que as datas ja estao fixas. */
  diasEditadoManual?: boolean;
  /* ⚠ O TOTAL DAS DIARIAS COMO FATO — 02F. Na projecao a fonte e' a TARIFA
     (`custoDiaria`, R$/cab/dia) e o total deriva dela; no acerto e' o contrario, e
     derivar a tarifa de volta fabrica fantasma de centavos na conferencia (o mesmo erro
     que `valorTotalAbate` corrigiu). Nulo = o acerto ainda nao chegou, e o motor cai na
     tarifa como sempre fez. */
  valorTotalDiarias?: number;
  /* ─── OS DOIS TOTAIS DA BALANCA — 02G item 1 ─────────────────────────────────
     ⚠ O ULTIMO LUGAR ONDE O REALIZADO FALAVA POR DERIVACAO. O papel do frigorifico traz
     estes dois numeros escritos, e a tela os reconstruia a partir de `gmd` e
     `rendimento` — duas contas encadeadas para reproduzir algo que ja estava medido.
     Medido no papel do Santa Clara: 2.251,67 @ em 109 cabecas dao 20,657522935779816
     @/cab, uma dizima que NENHUMA quantidade de casas no `gmd` reconstitui de volta.
     ⚠ SAO TOTAIS, nunca medias — o nome diz. A tela oferece o atalho [total | /cab] para
     digitar do jeito que o papel estiver escrito, mas o que atravessa e' sempre o total;
     guardar a media perderia a soma exata, que e' o que se veio buscar.
     ⚠ Nulo = "o papel ainda nao chegou", e o motor volta a derivar como sempre fez. Na
     projecao ficam nulos: la' `gmd` e `rendimento` sao o que se negocia. */
  pesoVivoTotalAbate?: number;
  arrobasTotaisAbate?: number;
}

/** As cabeças que SAÍRAM do boitel — o lote menos as mortes. */
export function cabecasQueSairam(d: BoitelEdicao): number {
  return Math.max(0, (d.qtdCabecas || 0) - (d.morteQuantidade || 0));
}

type Grupo = 'ind' | 'op';
interface Exigencia { rotulo: string; grupo: Grupo; presente: boolean }

/* ⚠ O ROTULO TEM DE APONTAR UM CAMPO QUE EXISTE NA TELA — B-05, achado B. No PROJETADO o
   operador digita o preco da @ e o faturamento deriva dele; no REALIZADO a direcao
   INVERTE: digita-se o valor total do abate e as arrobas do papel, e o preco e' que
   DERIVA (`valorTotalAbate / aTS`, ver o campo em `corposDoBoitel`). Dizer "falta preco de
   venda da @" no realizado manda o operador procurar um campo que aquele modal nao tem —
   e nao diz o que de fato falta.
   ⚠ QUAL DOS DOIS FALTA depende de onde a conta quebrou: sem arrobas nao ha por que
   dividir, entao ELAS vem primeiro; com arrobas de pe', o que falta e' o valor do abate.
   ⚠ MINUSCULA, como as irmas: os rotulos entram numa frase unica ("Falta X, Y e Z."), e
   uma maiuscula no meio dela leria como nome proprio. */
function rotuloDoPreco(d: BoitelEdicao, cenario?: CenarioBoitel): string {
  if (cenario !== 'realizado') return 'preço de venda da @';
  return derivadosBoitel(d).aTS > 0 ? 'valor total do abate' : 'arrobas totais do abate';
}

function exigencias(d: BoitelEdicao, cenario?: CenarioBoitel): Exigencia[] {
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
    { rotulo: rotuloDoPreco(d, cenario), grupo: 'op',  presente: d.precoVendaArroba > 0 },
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
  const aEF = pi / 30;
  /* ⚠ `sairam` SUBIU PARA CA — 02G. Ele era calculado logo abaixo; agora o peso e as
     arrobas dependem dele, porque os dois fatos do papel sao TOTAIS do lote abatido e
     viram numero por cabeca dividindo por quem foi para a balanca. */
  const sairam = cabecasQueSairam(data);
  /* ⚠ O FATO MANDA QUANDO EXISTE — 02G, o MESMO idioma do `cDT` logo abaixo, e pelo mesmo
     motivo. `pesoVivoTotalAbate` e `arrobasTotaisAbate` sao o que esta escrito no papel do
     frigorifico; `gmd` e `rendimento` continuam sendo a fonte na projecao e enquanto o
     papel nao chega. UMA fonte por vez, e a preferencia declarada AQUI — nao espalhada
     pelos consumidores.
     ⚠ ESTAS QUATRO LINHAS ALCANCAM A TELA INTEIRA. Tudo que le peso ou arroba passa por
     `pf`, `aS`, `aTS` ou `aP`: o faturamento (`fba`), o custo por arroba (`cPArr`), o GMC,
     o painel longo, o comparativo previsto x realizado e a cascata do bolso. Nenhum deles
     precisou saber que existe um fato — e' o que "num lugar so" quer dizer.
     ⚠ SEM FATO AS CONTAS SAO AS DE ANTES, LINHA A LINHA: `pvTotal = pfDerivado x cabAbate`
     e `aTS = aSDerivado x cabAbate` reproduzem exatamente o que estava escrito, e
     `aP = aTS - aEF x q` e' a MESMA expressao de `aS x cabAbate - aEF x q`, so que apoiada
     no total. Nada muda nas 10 vendas existentes, onde os dois campos sao nulos.
     ⚠ `cabAbate > 0` GUARDA A DIVISAO: sem cabeca na balanca nao ha por cabeca, e o
     derivado volta a valer em vez de um `Infinity` silencioso. */
  /* ⚠ AS METRICAS DO ABATE DIVIDEM PELAS ABATIDAS — 02H item L, regra do Gabriel, e e' o
     ultimo canto do abate parcial. `sairam` sao as que deixaram o boitel; `cabAbate` sao
     as que foram para a BALANCA. Com abate parcial os dois numeros diferem, e o peso e as
     arrobas do papel sao das ABATIDAS: dividir por `sairam` diluia o papel entre animais
     que nao passaram pela balanca.
     Medido na b58bf556: 62.075,5 kg em 109 abatidas dao 569,50 kg/cab, que e' o que o
     papel diz; por 110 davam 564,32, que nao esta escrito em lugar nenhum.
     ⚠ NO PROJETADO NADA MUDA, e por construcao: `qtdAbatida` so' existe no realizado, e
     sem ela `cabAbate` E' `sairam`. La' nao ha abate para ter uma terceira quantidade.
     ⚠ A DIARIA CONTINUA EM `sairam` (ver `cDT` abaixo): ela nao e' metrica de abate — o
     boitel cobra dos animais que ficaram com ele, abatidos ou nao. E' a mesma divisao de
     aguas do 02E: quem passou pela balanca x quem passou pelo cocho.
     ⚠ `aEF` TAMBEM FICA FORA: as arrobas de ENTRADA sao do lote que entrou, e o animal
     que morreu entrou. Ver a nota do `aP` logo abaixo. */
  const cabAbate = data.qtdAbatida ?? sairam;
  const pfDerivado = pi + ganho;
  const pvFato = cabAbate > 0 ? data.pesoVivoTotalAbate : undefined;
  const pvTotal = pvFato ?? pfDerivado * cabAbate;
  const pf = pvFato != null ? pvFato / cabAbate : pfDerivado;
  const aSDerivado = (pf * rs / 100) / 15;
  const aFato = cabAbate > 0 ? data.arrobasTotaisAbate : undefined;
  const aTS = aFato ?? aSDerivado * cabAbate;
  const aS = aFato != null ? aFato / cabAbate : aSDerivado;
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
  const aP = aTS - aEF * q;
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
  const gmc = dias > 0 ? ((aS * 15) - (pi * re / 100)) / dias : 0;
  /* ⚠ OS DOIS ESPELHOS — 02G. No realizado `gmd` e `rendimento` viram EXIBICAO PURA: os
     campos do papel deixaram de escrever por cima deles, e mostrar o valor guardado
     mostraria a premissa da PROJECAO ao lado de um fato que a contradiz. Estes dois
     dizem o que o papel implica, e sao os unicos lugares que os reconstituem.
     ⚠ SEM FATO ELES DEVOLVEM O QUE FOI DIGITADO: `pf = pi + gmd x dias` faz
     `(pf - pi) / dias` voltar a ser `gmd`, e `aTS x 15 / pvTotal` volta a ser `rs`. */
  const gmdEfetivo = dias > 0 ? (pf - pi) / dias : 0;
  const rcEfetivo = pvTotal > 0 ? (aTS * 15) / pvTotal * 100 : rs;
  /* ⚠ A INDENIZACAO SOMA AO FATURAMENTO. Estava so' no bloco de Comercializacao do 01B, e
     o painel mostrava o faturamento sem ela — dois numeros diferentes para a mesma coisa
     na mesma tela. Agora e' uma conta so'.
     ⚠ O FATO MANDA QUANDO EXISTE — 02H item M, o MESMO idioma do `cDT` e dos dois totais
     da balanca, e agora no ultimo derivado que ainda reconstruia um numero escrito.
     `valorTotalAbate` e' o que o frigorifico pagou; `aTS x pva` reconstroi esse valor a
     partir de um preco que ELE PROPRIO e' derivado e arredondado a duas casas no
     realizado. Medido na b58bf556: 2.251,67 @ x R$ 361,41 dao R$ 813.776,05 contra os
     R$ 813.771,01 do papel — R$ 5,04 de fantasma. Noutro caso ja medido, R$ 93,76.
     ⚠ ISSO SAIU DE UM CONSUMIDOR E VEIO PARA CA. A conferencia do acerto no modal ja
     preferia o fato — sozinha, por conta propria (`local.valorTotalAbate ?? derLocal.fba`).
     Enquanto a cascata do realizado nao existia, os dois numeros nunca se viam; com as
     duas cascatas lado a lado (item J) eles ficariam a quatorze pixels um do outro,
     discordando. A preferencia mora NUM LUGAR SO, e este e' o lugar.
     ⚠ A INDENIZACAO CONTINUA SOMANDO POR FORA, com fato ou sem ele: ela nao e' do
     frigorifico, e' do boitel pagando pelo animal que morreu. O papel do abate nao a
     contem, e some-la aqui e' o que mantem uma conta so'.
     ⚠ NO PROJETADO NADA MUDA: la' `valorTotalAbate` e' nulo e o derivado segue sendo a
     resposta certa — o preco da @ e' o que se negocia, e o faturamento nasce dele. */
  const fba = (data.valorTotalAbate ?? aTS * pva) + (data.morteValorIndenizacao || 0);
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
  /* ⚠ O FATO MANDA QUANDO EXISTE — 02F. `valorTotalDiarias` e' o total do papel do
     acerto; a tarifa x dias x cabecas continua valendo na projecao e enquanto o acerto
     nao chega. Uma fonte por vez, e a preferencia declarada aqui — nao espalhada.
     ⚠ ISTO ALCANCA TUDO QUE LE `cDT`: custo do boitel, custo operacional, desconto do
     acerto e a exibicao "Diarias no periodo". E' o mesmo custo, com fonte melhor. */
  if (mc === 'diaria') cDT = data.valorTotalDiarias ?? (cd * dias * sairam);
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
  /* ⚠ AS PARCELAS SAEM DO MOTOR, uma a uma — 02F (adendo B). A conferencia do acerto
     precisa ITEMIZAR o desconto, e somar os itens na tela seria a segunda copia desta
     composicao: no dia em que uma flag mudasse, o total e a lista discordariam. Aqui os
     itens JA vem condicionados, e o total e' a soma deles por construcao.
     ⚠ DIARIAS E SANIDADE NAO TEM FLAG: sao sempre do boitel. Ver a nota das flags. */
  const dAcertoDiarias = cDT;
  const dAcertoSanidade = cs;
  const dAcertoOutros = outrosNoBoitel ? oc : 0;
  const dAcertoFrete = freteNoBoitel ? cf : 0;
  const dAcertoAbate = abateNoBoitel ? da : 0;
  const dAcertoNotas = notasNoBoitel ? cne : 0;
  const descontoDoAcerto = dAcertoDiarias + dAcertoSanidade + dAcertoOutros
    + dAcertoFrete + dAcertoAbate + dAcertoNotas;

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

  return { ple, ganho, pf, pvTotal, aEF, aS, aPcab, aP, aTS, sairam, cabAbate, gmc, gmdEfetivo, rcEfetivo, fba, cAb, fLiq, cDT, cOp, coT, cPArr,
    pParte, rProd, rLiq, rLCab, custoTotalBoitel, margemVenda,
    descontoDoAcerto, custosDoProdutor, cne,
    dAcertoDiarias, dAcertoSanidade, dAcertoOutros, dAcertoFrete, dAcertoAbate, dAcertoNotas,
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

/* ─── O BOLSO DA VENDA BOITEL ──────────────────────────────────────────────────
   PR-OC-VENDA-TOPO-PROJECAO-01. Funcao irma de `liquidoDaVendaBoitel`, mesma guarda e
   mesmo contrato: le `derivadosBoitel` e nao reescreve nada.

       bolso = rLiq = acerto liquido - gastos diretos do produtor

   ⚠ A DOUTRINA DOS DOIS MUNDOS — decisao do Gabriel, B-04, e a razao desta funcao existir.
   Uma venda boitel tem DUAS verdades e elas nao se misturam:
     (1) O VALOR OFICIAL da operacao mora em `zoo_operacao_lotes.valor_informado` e e'
         REALIZADO-SOBERANO (858ee073: "o realizado corrige o rebanho sozinho"). O
         rebanho, o resumo lateral e o card do lote leem ELE — e esta' CERTO que mostrem o
         real depois do abate. E' o valor da operacao, nao a promessa.
     (2) A PROJECAO PURA deriva SEMPRE da linha `projetado` pelo motor. A promessa mora
         la', intacta, e NAO SE GRAVA EM SEGUNDO LUGAR: seria copia de verdade derivavel,
         e copia de verdade derivavel e' como dois numeros comecam a divergir.
   ⚠ O DEFEITO QUE ISTO FECHA (print do Gabriel, 31/08): o topo ambar lia
   `lotesApi.totais.valorNegociado` — o slot (1) — e mostrava R$ 595.071,81 / 13,26 como
   se fosse projecao, porque um rascunho de realizado ja tinha revalorado o lote. A linha
   `projetado` estava INTACTA o tempo todo; quem estava trocado era o endereco de leitura.
   Medido: as duas linhas de boitel da b58bf556 nunca se contaminaram — o lote e' que e'
   um so' para os dois cenarios, e nao tem coluna de cenario.
   ⚠ NENHUM CAMPO DA LINHA REALIZADO ENTRA EM CONTA DE PROJECAO. A projecao e' historica e
   imutavel depois do abate: ela e' a promessa, e o realizado compara COM ela, nunca a
   reescreve.
   ⚠ POR QUE O BOLSO E NAO O ACERTO no topo — decisao de produto do Gabriel: "tem que
   mostrar exatamente quanto me sobraria por optar pelo boitel em vez de vender vivo". O
   acerto (565.217,00 na b58bf556) e' o que o boitel repassa; o BOLSO (552.717,00) e' o
   que sobra depois do frete e das guias, que o produtor paga por fora. O acerto continua
   inteiro na cascata e no acerto itemizado — ele nao sumiu, mudou de posto.
   ⚠ `rLiq` NAO CONSULTA FLAG, e e' o que torna o numero comparavel: as flags decidem ONDE
   cada custo e' cobrado, nao SE ele existe. Trocar quem paga o frete nao muda quanto
   sobra — muda so' por qual porta o dinheiro sai.
   ⚠ NULL, NUNCA ZERO, pela mesma razao da irma: sem os campos que sustentam a conta nao
   existe projecao, e zero afirmaria que a venda nao vale nada. */
export function bolsoDaVendaBoitel(d: BoitelEdicao | null): number | null {
  if (!d) return null;
  if (exigencias(d).some(e => !e.presente)) return null;
  return Math.round(derivadosBoitel(d).rLiq * 100) / 100;
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
   ⚠ "O TOPO NAO DERIVA" ESTA REVOGADO — B-04, declaradamente. Aquela regra e' anterior a
   existirem dois mundos: quando havia um cenario so', ler o valor gravado no lote e
   derivar da linha davam o MESMO numero, e a regra so' evitava uma segunda copia. Depois
   que o realizado passou a revalorar o lote, as duas fontes discordam — e o print do
   Gabriel mostrou as duas na mesma tela, uma dizendo 595.071,81 e a outra 565.217,00.
   ⚠ A DIVISAO DE TRABALHO AGORA E POR LADO: a ESQUERDA (cabecas, peso, card do lote) le o
   OFICIAL, que e' realizado-soberano e deve mesmo mostrar o real; a DIREITA (a faixa
   ambar) deriva da linha `projetado` pelo motor. Nao ha contradicao na tela — ha dois
   numeros com dois nomes, cada um dizendo o que e'. Doutrina inteira em
   `bolsoDaVendaBoitel`.
   ⚠ E A FAIXA JA DERIVAVA de qualquer forma: o painel de resultado, a cascata e o
   comparativo logo abaixo sempre sairam do motor. O topo era o unico ponto lendo o slot
   gravado, e era justamente ele que destoava.
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
  /* ⚠ O TOPO SEGUE O MELHOR CONHECIMENTO — 02H item K, regra do Gabriel: "realizado
     substitui o projetado". Enquanto o abate nao aconteceu, o melhor que se sabe do
     negocio e' a PROMESSA, e ela vem marcada em ambar com a pilula. Depois do abate, o
     melhor que se sabe e' o FATO — e continuar anunciando a promessa no cabecalho seria
     mostrar a previsao do tempo com a janela aberta.
     ⚠ A TROCA E VISUAL INTEIRA, e nao so' de numero: valores SOLIDOS, borda do grupo
     NEUTRA (o ambar e' a marca da projecao, e mante-lo diria "projecao" sobre um fato) e
     a pilula sai sozinha, porque `PilulaCenario` ja devolve `null` no realizado. Os
     rotulos dizem qual dos dois esta' na tela — a cor informa, a palavra confirma.
     ⚠ A PROJECAO NAO SE PERDE: ela segue integra na cascata da esquerda, ao lado da gemea
     do realizado, que e' onde a comparacao mora. O cabecalho responde "quanto e' hoje", e
     a cascata responde "o que mudou".
     ⚠ QUEM DECIDE E O CHAMADOR, pelo `cenario` — este bloco nao pergunta ao banco nem
     infere de nulo. E' o mesmo criterio que a `PilulaCenario` ja documenta. */
  const real = cenario === 'realizado';
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

        <div className={`flex min-w-0 flex-wrap gap-x-7 gap-y-2 pl-3.5 pr-2 py-0.5 rounded-r-md border-l-2 ${
          real ? 'border-border bg-muted/30' : 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">
                R$/kg ({real ? 'real.' : 'proj.'})
              </span>
              <PilulaCenario cenario={cenario} />
            </div>
            {/* ⚠ O AMBAR E' O DO 600 DA FAMILIA DA PILULA. `dark:` proprio porque o hex
                fixo some no fundo escuro — a marca tem de sobreviver aos dois temas. */}
            <div className={`mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap ${
              real ? 'text-foreground' : 'text-[#854F0B] dark:text-amber-500'}`}>
              {valorPorKg == null ? traco : formatMoeda(valorPorKg)}
            </div>
          </div>
          {/* ⚠ O ROTULO MUDOU COM A FONTE — B-04. Era "Valor liq. do lote", lendo o valor
              GRAVADO no lote (o slot oficial, realizado-soberano); virou o BOLSO
              PROJETADO, derivado da linha `projetado` pelo motor. Ver a doutrina dos dois
              mundos em `bolsoDaVendaBoitel`.
              ⚠ "(proj.)" NO ROTULO alem da pilula do grupo: aqui a palavra faz trabalho
              que a cor nao faz — ela diz que este numero NAO e' o valor da operacao, e sim
              a promessa. Os dois convivem na mesma tela, e o card do lote, ao lado,
              mostra o oficial de proposito. */}
          <div className="min-w-0">
            <div className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">
              Liq. no bolso ({real ? 'real.' : 'proj.'})
            </div>
            <div className={`mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap ${
              real ? 'text-foreground' : 'text-[#854F0B] dark:text-amber-500'}`}>
              {valorTotal > 0 ? formatMoeda(valorTotal) : traco}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── O PAINEL DE RESULTADO FOI REMOVIDO — PR-OC-LIMPEZA-PAINEL-MORTO (B-15) ───
   `BoitelPainelResultado` era ORFAO: declarado, exportado e NUNCA montado — medido no
   repositorio inteiro, zero referencias fora da propria declaracao. Ele sobrevivia por
   uma promessa escrita no proprio comentario ("e' a peca que
   PR-OC-VENDA-BOITEL-RESUMO-MODAL-01 vai abrir num modal, para print e para mandar aos
   responsaveis") — e essa promessa foi CUMPRIDA POR OUTRO: o modal da analise
   (`BoitelAnaliseFaixa`, PR-OC-VENDA-ANALISE-01/02) mostra os numeros, compara os tres
   cenarios e ja exporta PNG. O motivo de existir dele acabou junto.
   ⚠ SAIRAM COM ELE `LinhaPainel` e `TituloGrupo`, que nao tinham outro consumidor, e os
   imports `formatArroba` e `AlertTriangle`, que ficaram sem uso. `formatKg` FICOU: o topo
   ainda o usa.
   ⚠ NADA MIGROU, e essa e' a diferenca desta limpeza para a do ANALISE-01: la' os
   componentes morreram porque o conteudo deles mudou de casa, e a nota dizia para onde.
   Aqui nao ha para onde — o conteudo ja existia melhor noutro lugar, e o que se apaga e'
   duplicata que nunca chegou a ser vista. */
