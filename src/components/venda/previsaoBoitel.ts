/**
 * A PREVISAO DE CAIXA DA VENDA BOITEL — as linhas que o "Gerar previsao" da aba Financeiro grava.
 *
 * ⚠ MOVIDA DO `VendaModalShell` SEM MUDANCA DE COMPORTAMENTO (BOITEL-ABATE-PRODUTOR-01): o corpo e' o do
 *   `useMemo` que morava la', byte a byte salvo a indentacao, o `ehBoitel` (que ficou no chamador) e
 *   `lotesApi?.lotes` virando o parametro `lotes`. Saiu para ser testavel sem montar a tela — a previsao
 *   da modalidade A tem de continuar IDENTICA, e a B nasce aqui ao lado dela.
 */
import { format, addDays, parseISO } from 'date-fns';
import { siglaCategoria } from '@/lib/financeiro/produtoOC';
import { subcentroVendaPorCategoria, SUBCENTRO_DESPESA_VENDA, SUBCENTRO_ADIANTAMENTO_BOITEL } from '@/hooks/useOperacaoLiquidacao';
import { custosDaVendaBoitel, principalDaPrevisaoBoitel, derivadosBoitel, type ValorDaVendaBoitel } from '@/components/venda/BoitelNegociacaoDerivado';
import { faltamDosCinco, type BoitelEdicao } from '@/components/venda/BoitelBlocosModais';
import type { LinhaPrevisao } from '@/components/compra/AbaCompromissosOC';

/* Data ISO + N dias, em ISO. `null` quando nao da' para responder — data vazia, data
   malformada ou prazo nao informado. ⚠ NUNCA LANCA: um throw dentro do `useMemo` que
   monta a previsao apagaria o modal inteiro, e `parseISO` de uma string invalida devolve
   Invalid Date, que faz `format` estourar RangeError. */
function dataMaisDias(iso: string | null | undefined, dias: number): string | null {
  if (!iso || !(dias > 0)) return null;
  const base = parseISO(iso);
  if (Number.isNaN(base.getTime())) return null;
  return format(addDays(base, dias), 'yyyy-MM-dd');
}

export interface EntradaPrevisaoBoitel {
  /** A linha `projetado`, ja' com cabecas e peso dos lotes. */
  boitelData: BoitelEdicao | null;
  /** A linha `realizado` COMO O BANCO A TEM (nunca o rascunho). */
  boitelRealSalvo: BoitelEdicao | null;
  compradorId: string;
  /** `data_operacao` da OC. */
  data: string;
  lotes: ReadonlyArray<{ id?: string | null; categoria: string; quantidade: string }>;
  vendaBoitel: ValorDaVendaBoitel | null;
}

/* ─── A PREVISAO DE CAIXA DO BOITEL ───────────────────────────────────────────
   PR-OC-VENDA-FIN-PREVISAO-01, e e' um MODELO NOVO, nao um ajuste do anterior.

   A NEGOCIACAO cuida da OPERACAO — faturamento bruto, custo do boitel, margem. Aqueles
   numeros vivem no painel como analise e NAO viram linha financeira: sao "sem caixa".
   A aba Financeiro cuida SO do que ATRAVESSA O CAIXA, e sao quatro movimentos:

     1. Adiantamento ao boitel        SAI    (o produtor paga na entrada)
     2. Despesas fora do boitel       SAI    (hoje, o frete — custo do produtor)
     3. Recebimento ref. operacao     ENTRA  (o acerto, ja liquido do que o boitel cobra)
     4. Recebimento ref. adiantamento ENTRA  (o adiantamento volta no acerto)

   ⚠ DUAS LINHAS DE RECEBIMENTO, e nao uma soma — decisao do Gabriel: "duas linhas e'
   melhor de entender". 3 + 4 = `saldoReceberBase`, o mesmo numero do painel; separa-las
   nao muda o total, so' diz de onde ele vem.

   ⚠ A LINHA 4 E' `obrigacao` DESCREVENDO UM RECEBIMENTO, e isso e' proposital. O
   `oc_criar_compromisso` limita a SOMA dos compromissos `principal` a base da operacao
   (medido: base 565.217,00 na b58bf556, que a linha 3 consome inteira), entao um
   segundo principal de 96.783,50 seria RECUSADO pelo banco. Como o sentido do dinheiro
   passou a vir do PLANO DE CONTAS (PR-OC-SENTIDO-POR-PLANO-01), uma obrigacao com
   subcentro de '1-Entradas' materializa como ENTRADA — o resultado no caixa e' o certo
   e o teto do principal fica integro. A palavra "obrigacao" descrevendo um recebimento
   e' divida ESTETICA, registrada para o acabamento; nao ha divida de valor.

   ⚠ NENHUM VALOR E' CONGELADO. Tudo sai do motor a cada render — editar o planejamento
   e regerar da os numeros novos, nunca os do dia da primeira geracao.

   ⚠ O ANTECIPADO SAI DO MOTOR, como todo o resto — `valorTotalAntecipadoCalc`. Esta
   linha ja leu uma funcao de tela (`antecipadoTotal`), e vale registrar por que:
   ate' PR-OC-VENDA-BOITEL-ANTECIPADO-NO-MOTOR-01 o motor rederivava o adiantamento de
   `pctAdiantamentoDiarias`, um campo que a tabela da OC nao guarda — a previsao dizia
   96.783,50 e o painel dizia 1.540,00 na mesma tela. Corrigido o motor, a funcao de
   tela virou copia identica dele (md5 `bae60d01…` nas duas) e deixou de existir.
   Uma verdade so': se o antecipado mudar de regra um dia, muda em UM lugar.

   ⚠ A CATEGORIA VEM DOS LOTES, e nao do campo `categoria` do formulario simples. Esse
   campo NUNCA e' preenchido numa OC de venda (a hidratacao nao o seta, e nem poderia:
   uma OC tem N lotes com N categorias), e era por isso que a descricao saia "Boitel
   110" sem sigla — `siglaCategoria('')` devolve string vazia.
   ⚠ LOTES MISTOS: vale o lote de MAIOR numero de cabecas. O boitel guarda UM
   planejamento por operacao (uma linha em `zoo_operacao_boitel`, nao uma por lote),
   entao ja nao ha como classificar por lote aqui. Medido: as vendas boitel existentes
   tem um lote so'. Quem ler um dia uma venda boitel de lotes mistos precisa saber que
   a classificacao seguiu a maioria. */
export function linhasPrevisaoBoitel({
  boitelData, boitelRealSalvo, compradorId, data, lotes, vendaBoitel,
}: EntradaPrevisaoBoitel): LinhaPrevisao[] | undefined {
  if (!boitelData || faltamDosCinco(boitelData).length > 0) return undefined;
  const qtd = boitelData.qtdCabecas || 0;

  /* O lote de maior rebanho decide a sigla e a classificacao — ver a nota acima. */
  const catDominante = lotes
    .map(l => ({ cat: l.categoria, q: Number(l.quantidade) || 0 }))
    .filter(x => !!x.cat)
    .sort((a, b) => b.q - a.q)[0]?.cat ?? '';
  /* ⚠ `true` NAO E' CONSTANTE SOLTA: este bloco inteiro so' roda quando `ehBoitel`, pelo
     return de tres linhas acima. Era exatamente aqui que a receita do boitel vestia
     'Venda de Machos Adultos' — as quatro OCs medidas em 24/09 saem deste `useMemo`. */
  const subEntrada = subcentroVendaPorCategoria(catDominante, true);
  /* ⚠ SEM CLASSIFICACAO NAO HA PREVISAO. O writer recusa subcentro que nao exista no
     plano; gerar tres linhas e engasgar na quarta deixaria a operacao pela metade. */
  if (!subEntrada) return undefined;

  const rot = `Boitel ${String(qtd).padStart(3, '0')} ${siglaCategoria(catDominante)}`.trim();
  /* A data PROJETADA do abate: o gado sai da fazenda na data da operacao e fica `dias`
     no boitel. E' previsao, e o "~" do rotulo da linha diz isso ao operador. */
  const dataAbate = dataMaisDias(data, boitelData.dias);
  /* ⚠ ADIANTAMENTO E DESPESAS FORA DO BOITEL SAEM DA LINHA QUE VALE — OC-BOITEL-VALOR-01 A4.
     Com o realizado aplicado, a `realizado`; sem ele, a projetada. Liam SEMPRE a projetada, e a
     Vera 7f7de76f ficou com um "adiantamento devolvido" de 42.416 quando o realizado dizia
     46.458,50. `custos` so' e' nulo sem linha nenhuma, e `boitelData` ja foi exigido acima. */
  const custos = custosDaVendaBoitel({ realizado: boitelRealSalvo, projetado: boitelData });
  const antecipado = custos?.antecipado ?? 0;
  /* ⚠ A PRINCIPAL LE O SLOT, NAO A PROJECAO — OC-BOITEL-VALOR-01 A3. Era
     `liquidoDaVendaBoitel(boitelData)` SEMPRE, com realizado ou sem: o 0fdec0eb da 8b211cae
     nasceu assim, com 848.713,32, depois de o acerto ter dito 882.608,62. Sem realizado o slot
     JA E' a projecao (gravada ao salvar a negociacao) — o numero nao muda nesse caso, muda a
     FONTE. Em divergencia a linha nao sai: quem recusa e' `bloqueioPrevisao`, com a razao. */
  /* ⚠ `id` DO LOTE E' OPCIONAL (lote ainda nao gravado nao tem), e o TSC com `strict: false`
     nao reclamaria de um `undefined` no meio da lista. Lote sem id nao conta como lote para
     ligar — e com um so' deles sem id a lista encolhe e a linha nasce solta, que e' o seguro. */
  const idsDosLotes = lotes.map(l => l.id);
  const principal = principalDaPrevisaoBoitel(vendaBoitel,
    idsDosLotes.every(id => !!id) ? idsDosLotes.filter((id): id is string => !!id) : []);

  const linhas: LinhaPrevisao[] = [];
  /* ─── MODALIDADE B — ABATE EM NOME DO PRODUTOR (BOITEL-ABATE-PRODUTOR-01) ─────────────────
     O frigorifico paga o PRODUTOR (principal, 1150, favorecido = frigorifico) e o boitel cobra as despesas do
     lado dele (obrigacao `acerto_boitel`, 1155, favorecido = boitel). Sem "a receber do boitel" e sem
     adiantamento (fora deste corte). As despesas fora do boitel seguem como na A.
     ⚠ OS DOIS VALORES SAO DO MOTOR, da MESMA linha que vale (`custos.dados`): recebido = `fba`, pago = `descontoDoAcerto`.
     Nenhuma segunda formula — e' a conta do "(=) Saldo do acerto" com o dinheiro passando por dois titulos.
     ⚠ O ACERTO VEM ANTES DO PRINCIPAL: o "Gerar previsao" grava na ordem da lista, e `oc_criar_compromisso` so'
     aceita o principal (bruto) acima do slot (liquido) depois que o acerto de saida existe.
     ⚠ SEM TOLERANCIA: se o slot nao for exatamente recebido - pago, o principal NAO sai — quem diz por que e'
     `avisoBoitelProdutor`, no botao. */
  const dadosVale = custos?.dados ?? boitelData;
  if (dadosVale.quemAbate === 'produtor') {
    const foraB = custos?.foraDoBoitel ?? 0;
    if (foraB > 0) linhas.push({
      natureza: 'obrigacao', componente: 'frete',
      subcentro: SUBCENTRO_DESPESA_VENDA,
      valor: foraB,
      rotulo: 'Despesas fora do boitel',
      descricao: `${rot} - Despesas fora do boitel`,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: data || null,
    });
    const b = valoresDoProdutor(dadosVale, vendaBoitel);
    if (b.pago > 0) linhas.push({
      natureza: 'obrigacao', componente: 'acerto_boitel',
      subcentro: SUBCENTRO_ACERTO_BOITEL,
      valor: b.pago,
      rotulo: 'Pago ao boitel (acerto)',
      descricao: `${rot} - Acerto boitel`,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: dataAbate,
    });
    if (principal && b.divergencia == null) linhas.push({
      natureza: 'principal', componente: 'principal',
      subcentro: subEntrada,
      valor: b.recebido,
      rotulo: 'Recebimento do frigorífico',
      descricao: `${rot} - Frigorífico`,
      favorecidoId: dadosVale.frigorificoId || null,
      vencimentoPrevisto: dataAbate,
      loteId: principal.loteId,
    });
    if (custos?.fonte === 'realizado' && !(foraB > 0)) {
      linhas.push({
        natureza: 'obrigacao', componente: 'frete', subcentro: SUBCENTRO_DESPESA_VENDA, valor: 0,
        rotulo: 'Despesas fora do boitel', descricao: `${rot} - Despesas fora do boitel`,
        favorecidoId: compradorId || null, vencimentoPrevisto: null, zerada: true,
      });
    }
    return linhas.length > 0 ? linhas : undefined;
  }
  /* `antecipado` ja' e' zero sem `possuiAdiantamento` (`valorTotalAntecipadoCalc`), na linha que vale. */
  if (antecipado > 0) linhas.push({
    natureza: 'obrigacao', componente: 'adiantamento',
    subcentro: SUBCENTRO_ADIANTAMENTO_BOITEL,
    valor: antecipado,
    rotulo: 'Adiantamento ao boitel',
    descricao: `${rot} - Adiantamento`,
    favorecidoId: compradorId || null,
    vencimentoPrevisto: custos?.dados.dataAdiantamento || null,
  });
  /* ⚠ A LINHA OBEDECE AO SELETOR — PR-OC-VENDA-REALIZADO-01A. Ela somava SO' o frete,
     porque "fora do boitel" era regra cravada e o frete era o unico que estava fora.
     Agora cada despesa declara o lado, e `custosDoProdutor` e' o complemento exato do
     `descontoDoAcerto`: entra aqui o que o operador marcou como "produtor", sai o que
     ele marcou como "boitel" — que nao tem caixa proprio, e' desconto no repasse.
     ⚠ UMA FONTE SO'. O valor vem do motor, e nao de uma soma repetida aqui: somar
     `custoFrete + custoNotasEnvio + despesasAbate` na tela seria a segunda copia da
     regra, e ela divergiria do liquido no primeiro seletor que alguem virasse. */
  const foraDoBoitel = custos?.foraDoBoitel ?? 0;
  if (foraDoBoitel > 0) linhas.push({
    natureza: 'obrigacao', componente: 'frete',
    subcentro: SUBCENTRO_DESPESA_VENDA,
    valor: foraDoBoitel,
    rotulo: 'Despesas fora do boitel',
    descricao: `${rot} - Despesas fora do boitel`,
    favorecidoId: compradorId || null,
    vencimentoPrevisto: data || null,
  });
  if (principal) linhas.push({
    natureza: 'principal', componente: 'principal',
    subcentro: subEntrada,
    valor: principal.valor,
    rotulo: 'Recebimento ref. operação',
    descricao: rot,
    favorecidoId: compradorId || null,
    vencimentoPrevisto: dataAbate,
    loteId: principal.loteId,
  });
  if (antecipado > 0) linhas.push({
    natureza: 'obrigacao', componente: 'adiantamento_devolvido',
    subcentro: subEntrada,
    valor: antecipado,
    rotulo: 'Recebimento ref. adiantamento',
    descricao: `${rot} - Adiantamento devolvido`,
    favorecidoId: compradorId || null,
    vencimentoPrevisto: dataAbate,
  });
  /* ⚠ O ITEM QUE O REALIZADO ZERA VIRA LINHA MARCADA — OC-BOITEL-VALOR-01 A4b. So' com o
     realizado aplicado: sem ele, zero e' so' "a projecao nao previa", e nao ha o que desfazer.
     A linha nao cria nada; ela diz ao "Gerar previsao" que o compromisso desse item, se ainda for
     previsao pura, deve ser cancelado — depois de o operador confirmar. */
  if (custos?.fonte === 'realizado') {
    const zerada = (componente: string, subcentro: string, rotulo: string, descricao: string): LinhaPrevisao => ({
      natureza: 'obrigacao', componente, subcentro, valor: 0, rotulo, descricao,
      favorecidoId: compradorId || null, vencimentoPrevisto: null, zerada: true,
    });
    if (!(antecipado > 0)) {
      linhas.push(zerada('adiantamento', SUBCENTRO_ADIANTAMENTO_BOITEL, 'Adiantamento ao boitel', `${rot} - Adiantamento`));
      linhas.push(zerada('adiantamento_devolvido', subEntrada, 'Recebimento ref. adiantamento', `${rot} - Adiantamento devolvido`));
    }
    if (!(foraDoBoitel > 0)) {
      linhas.push(zerada('frete', SUBCENTRO_DESPESA_VENDA, 'Despesas fora do boitel', `${rot} - Despesas fora do boitel`));
    }
  }
  return linhas.length > 0 ? linhas : undefined;
}

/** O subcentro do boleto do boitel na modalidade B — 1155, bloco venda, saida (BOITEL-ABATE-PRODUTOR-01). */
export const SUBCENTRO_ACERTO_BOITEL = 'Acerto de Boitel (despesas)';

const centavos = (x: number) => Math.round(x * 100);

/**
 * OS DOIS TITULOS DA MODALIDADE B, e a conferencia com o slot.
 *
 * recebido = `fba` (o que o frigorifico paga) · pago = `descontoDoAcerto` (o que o boitel cobra). Os dois a duas casas.
 * ⚠ `divergencia` != null quando o SLOT (valor da operacao) nao e' exatamente recebido - pago — sem tolerancia, a
 *   mesma regra da guarda de `oc_criar_compromisso` na B (base = slot + acertos). Um centavo ja' e' divergencia.
 */
export function valoresDoProdutor(dados: BoitelEdicao, vendaBoitel: ValorDaVendaBoitel | null):
  { recebido: number; pago: number; divergencia: { slot: number; liquido: number } | null } {
  const der = derivadosBoitel(dados);
  const recebido = centavos(der.fba) / 100;
  const pago = centavos(der.descontoDoAcerto) / 100;
  const slot = vendaBoitel?.valor ?? null;
  const liquido = (centavos(recebido) - centavos(pago)) / 100;
  const divergencia = slot != null && centavos(slot) !== centavos(liquido) ? { slot, liquido } : null;
  return { recebido, pago, divergencia };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** A frase do botao "Gerar previsao" na B quando o slot nao fecha com recebido - pago. `null` sem divergencia ou na A. */
export function avisoBoitelProdutor(entrada: EntradaPrevisaoBoitel): string | null {
  const { boitelData, boitelRealSalvo, vendaBoitel } = entrada;
  if (!boitelData) return null;
  const custos = custosDaVendaBoitel({ realizado: boitelRealSalvo, projetado: boitelData });
  const dados = custos?.dados ?? boitelData;
  if (dados.quemAbate !== 'produtor') return null;
  const b = valoresDoProdutor(dados, vendaBoitel);
  if (!b.divergencia) return null;
  return `Recebido do frigorífico ${brl(b.recebido)} − pago ao boitel ${brl(b.pago)} = ${brl(b.divergencia.liquido)}, e o valor da operação é ${brl(b.divergencia.slot)} · reaplique o Realizado`;
}

/** Uma linha do bloco "Acerto" do resumo lateral. */
export interface LinhaResumoAcerto { rotulo: string; valor: number; sinal: '+' | '−' }

/**
 * O BLOCO "ACERTO" DO RESUMO LATERAL NA MODALIDADE B — "(+) Recebido do frigorifico · (−) Pago ao boitel".
 * O total "(=) Liquido" e' `fba - descontoDoAcerto`, o mesmo "(=) Saldo do acerto" da A. Na A o bloco nao muda
 * (o shell continua com as linhas itemizadas e o "A RECEBER DO BOITEL"); esta funcao so' existe para a B.
 */
export function linhasResumoProdutor(der: { fba: number; descontoDoAcerto: number }): { linhas: LinhaResumoAcerto[]; liquido: number } {
  return {
    linhas: [
      { rotulo: '(+) Recebido do frigorífico', valor: der.fba, sinal: '+' },
      { rotulo: '(−) Pago ao boitel', valor: der.descontoDoAcerto, sinal: '−' },
    ],
    liquido: der.fba - der.descontoDoAcerto,
  };
}
