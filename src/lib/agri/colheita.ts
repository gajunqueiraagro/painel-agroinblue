/**
 * A COLHEITA DE UMA ÁREA PLANTADA, CARGA POR CARGA — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ FIEL AO ROMANEIO, NÃO AO QUE SERIA PRÁTICO. O papel que a cooperativa devolve traz ticket
 * de balança, nota do produtor, filial, os DOIS pesos, umidade, aflatoxina em ppb, sacas boas
 * e o grão de roça em saca E em quilo. Cada um desses é um campo, e nenhum deles é calculado a
 * partir de outro: quando o sistema deduz um número que o papel já traz, é o papel que perde a
 * discussão três meses depois.
 * ⚠ SÓ O FÍSICO. Preço e venda não moram aqui: são da operação comercial de grão, frente
 * própria. O que esta camada sabe é quanto saiu do talhão, quanto voltou seco e em que classe.
 * ⚠ SÓ REGRA PURA: nada de React nem de Supabase.
 */
import { parseMoeda } from '@/lib/calculos/numeroBR';
/* ⚠ ARESTA NOVA E DE MAO UNICA: `areaPlantada` nao importa `colheita` (ela so' puxa
   `./culturas` e `calculos/abate`, ambos folhas), entao nao ha' ciclo. Conferido com o madge
   oficial no mesmo PR. */
import { labelDaCultura } from '@/lib/agri/areaPlantada';

/**
 * O CORTE DE CLASSE DA COOPERATIVA, em ppb.
 *
 * ⚠ CONSTANTE NOMEADA, NUNCA `20` SOLTO NO MEIO DE UM `if`. O limite é regra de quem compra, e
 * quem compra muda de regra: no dia em que virar 15, tem de haver UM lugar a trocar, e a
 * mudança tem de aparecer no diff como decisão — não escondida numa comparação.
 */
export const LIMITE_AFLATOXINA = 20;

/** Em que faixa a carga caiu. `null` quando ninguém classificou ainda. */
export type FaixaAflatoxina = 'ate' | 'acima' | null;

/**
 * ⚠ SEM PPB NÃO HÁ FAIXA — e isso não é o mesmo que "até o limite". Assumir a faixa boa para a
 * carga não classificada inflaria o lote bom com o que ainda está no laboratório, e o operador
 * venderia um número que não existe. A tela mostra essas sacas à parte, como pendência.
 */
export function faixaAflatoxina(ppb: number | null | undefined): FaixaAflatoxina {
  if (ppb == null) return null;
  return ppb <= LIMITE_AFLATOXINA ? 'ate' : 'acima';
}

/**
 * A UNIDADE DE CADA CULTURA — e ela muda o que a tela pergunta.
 *
 * ⚠ AMENDOIM EM SACAS DE 25 kg, decisão do Gabriel (11/09/2026). Mandioca NÃO tem saca: é
 * raiz, e se mede em tonelada.
 * ⚠ SOJA, MILHO, CANA E "OUTRAS" FICAM SEM SACA ATÉ ALGUÉM DECIDIR, de propósito. A saca de
 * 60 kg é convenção de mercado para soja e milho, mas convenção não é decisão: escrevê-la
 * aqui faria o sistema afirmar um peso que ninguém confirmou, e produtividade errada só
 * aparece no fechamento da safra. Sem saca, a tela mostra kg e diz que a saca não se aplica —
 * que é a ausência honesta.
 */
export interface UnidadeCultura {
  /** Quilos por saca. `null` quando a cultura não se mede em sacas. */
  kgPorSaca: number | null;
  /** A unidade em que o total se lê: 'sacas' ou 't'. */
  unidadeTotal: 'sacas' | 't';
  /** Como a produtividade se escreve: "sc/ha" ou "t/ha". */
  unidadeProdutividade: string;
}

const UNIDADES: Record<string, UnidadeCultura> = {
  amendoim: { kgPorSaca: 25, unidadeTotal: 'sacas', unidadeProdutividade: 'sc/ha' },
  mandioca: { kgPorSaca: null, unidadeTotal: 't', unidadeProdutividade: 't/ha' },
};

const PADRAO: UnidadeCultura = { kgPorSaca: null, unidadeTotal: 't', unidadeProdutividade: 't/ha' };

export function unidadeDaCultura(cultura: string | null | undefined): UnidadeCultura {
  return UNIDADES[(cultura || '').trim()] ?? PADRAO;
}

/**
 * QUANTOS QUILOS PESA UMA UNIDADE DESTA CULTURA — 25 para a saca de amendoim, 1.000 para a
 * tonelada.
 *
 * ⚠ ELE EXISTE PARA SOMAR O QUE NÃO SE SOMA. Saca e tonelada não têm denominador comum, e
 * qualquer conta que misture duas culturas — um percentual de estoque parado sobre a safra
 * inteira, por exemplo — precisa converter os dois lados antes de dividir. O quilo é a moeda
 * dessa conversão.
 * ⚠ O `1000` MORA AQUI E SÓ AQUI. `kgPorSaca` já dizia o peso da saca, mas o peso da TONELADA
 * estava implícito em `unidadeTotal === 't'` e teria de ser escrito à mão em cada consumidor —
 * que é como um número vira três números.
 * ⚠ E O RESULTADO NÃO VAI PARA A TELA. Quilo é unidade de CÁLCULO: o operador pensa em saca e em
 * tonelada, e mostrar "1.103.538 kg parados" trocaria uma resposta que ele lê por uma que ele
 * teria de converter de cabeça.
 */
export function kgPorUnidade(cultura: string | null | undefined): number {
  const { kgPorSaca } = unidadeDaCultura(cultura);
  return kgPorSaca ?? 1000;
}

/**
 * QUANTAS SACAS HÁ EM N QUILOS — AGRI-COLHEITA-DERIVADOS-02.
 *
 * ⚠ O PESO DA SACA VEM DE `UNIDADES`, NÃO DE UMA CONSTANTE NOVA. O briefing pedia um
 * `SACA_AMENDOIM_KG = 25` "por ora fixa, futuramente por cultura" — e o mapa por cultura já
 * existe neste arquivo desde o AGRI-COLHEITA-TELA-01, com o 25 do amendoim decidido pelo
 * Gabriel. Criar a constante seria uma SEGUNDA fonte do mesmo número, e no dia da mudança uma
 * das duas ficaria para trás.
 * ⚠ DUAS CASAS, e é o que faz o consolidado fechar com a cooperativa: 22.222,70 kg dão
 * 888,908 sacas, que se guardam como 888,91 e se EXIBEM como 889. Arredondar para inteiro
 * antes de somar perderia 65 centésimos de saca nas dez cargas — a diferença que o produtor
 * encontra conferindo o total contra o papel da Casul.
 * ⚠ `null` PARA CULTURA SEM SACA: mandioca é raiz e se mede em tonelada. Devolver zero ali
 * faria a tela escrever "0 sc" onde a resposta certa é "não se aplica".
 */
export function sacasDoPeso(pesoKg: number | null, cultura: string | null | undefined): number | null {
  const { kgPorSaca } = unidadeDaCultura(cultura);
  if (!kgPorSaca || pesoKg == null || !(pesoKg > 0)) return null;
  return Math.round((pesoKg / kgPorSaca) * 100) / 100;
}

/**
 * A QUEBRA DA CARGA, em quilos — o que a secagem tirou, ou o que o transporte comeu.
 *
 * ⚠ A MESMA FUNÇÃO SERVE ÀS DUAS, e é de propósito: `quebraKg(fazenda, verde)` é a de
 * transporte e `quebraKg(verde, seco)` é a de secagem. São a mesma pergunta — quanto se perdeu
 * entre duas pesagens — e uma segunda função com outro nome as deixaria livres para divergir
 * no arredondamento.
 * ⚠ ELA PODE SER NEGATIVA na de transporte, e isso NÃO é erro: a cooperativa às vezes
 * reconhece MAIS peso do que a balança da fazenda mediu. Recusar o negativo aqui esconderia
 * um ganho real do produtor.
 *
 * ⚠ SÓ EXISTE COM OS DOIS PESOS. Enquanto o seco não voltou da cooperativa, a quebra não é
 * zero: ela ainda não aconteceu, e um "0 kg" ali leria como "não houve perda".
 */
export function quebraKg(verdeKg: number | null, secoKg: number | null): number | null {
  if (verdeKg == null || secoKg == null) return null;
  return Math.round((verdeKg - secoKg) * 100) / 100;
}

/**
 * O CAMINHO INVERSO — quantos quilos há em N sacas (AGRI-COLHEITA-MODAL-04).
 *
 * ⚠ SERVE SÓ À ENTRADA, e a distinção é a que evita um segundo peso no sistema: o operador
 * escolhe em que unidade DIGITA, e o banco guarda quilo sempre. Gravar a saca como peso faria
 * a mesma carga ter dois números de origem — o da balança e o da conversão — e nenhum jeito de
 * saber qual é o do papel.
 */
export function pesoDasSacas(sacas: number | null, cultura: string | null | undefined): number | null {
  const { kgPorSaca } = unidadeDaCultura(cultura);
  if (!kgPorSaca || sacas == null || !(sacas > 0)) return null;
  return Math.round(sacas * kgPorSaca * 100) / 100;
}

/** Uma carga, como a tela a edita — tudo texto, porque campo é texto. */
export interface CargaForm {
  id: string | null;
  dataColheita: string;
  /** `HH:MM` — hora em que o caminhão chegou à balança. AGRI-COLHEITA-02. */
  horaChegada: string;
  /**
   * O PESO QUE SAIU DA BALANÇA DA FAZENDA — AGRI-COLHEITA-04.
   *
   * ⚠ TERCEIRO PESO DA MESMA CARGA, e nenhum deriva do outro: fazenda (saída), verde
   * (chegada na cooperativa) e seco (depois de secar). A diferença fazenda → verde é a QUEBRA
   * DE TRANSPORTE, que ninguém media; verde → seco é a de secagem, que a tela já mostra.
   */
  pesoFazendaKg: string;
  ticketBalanca: string;
  nfProdutor: string;
  filial: string;
  pesoVerdeKg: string;
  pesoSecoKg: string;
  umidadePct: string;
  aflatoxinaPpb: string;
  sacasBoas: string;
  graoRocaSacas: string;
  graoRocaKg: string;
  rendaLiquidaPct: string;
  /**
   * A SECAGEM DO ROMANEIO — AGRI-COLHEITA-03.
   *
   * ⚠ DOIS NÚMEROS DIGITADOS, nenhum derivado do outro: a taxa é o quanto a cooperativa cobra
   * (R$/saca ou %, como ela escrever) e o valor é o que aquela carga pagou. Multiplicar um
   * pelo outro produziria um terceiro número que o papel não tem.
   * ⚠ POR ORA SÓ REGISTRO. A secagem É CUSTO e futuramente vira lançamento financeiro no
   * subcentro "Secagem e Beneficiamento" (13180) — frente própria,
   * PR-COLHEITA-SECAGEM-FINANCEIRO. Até lá o valor vive aqui e no consolidado, sem tocar o DRE.
   */
  taxaSecagem: string;
  valorSecagem: string;
  observacoes: string;
}

export interface CargaPayload {
  data_colheita: string;
  hora_chegada: string | null;
  peso_fazenda_kg: number | null;
  ticket_balanca: string | null;
  nf_produtor: string | null;
  filial: string | null;
  peso_verde_kg: number | null;
  peso_seco_kg: number | null;
  umidade_pct: number | null;
  aflatoxina_ppb: number | null;
  sacas_boas: number | null;
  grao_roca_sacas: number | null;
  grao_roca_kg: number | null;
  renda_liquida_pct: number | null;
  taxa_secagem: number | null;
  valor_secagem: number | null;
  observacoes: string | null;
}

export interface ValidacaoCarga {
  ok: boolean;
  erro?: string;
  payload?: CargaPayload;
}

export const cargaVazia = (): CargaForm => ({
  id: null, dataColheita: '', horaChegada: '', pesoFazendaKg: '',
  ticketBalanca: '', nfProdutor: '', filial: '',
  pesoVerdeKg: '', pesoSecoKg: '', umidadePct: '', aflatoxinaPpb: '', sacasBoas: '',
  graoRocaSacas: '', graoRocaKg: '', rendaLiquidaPct: '', taxaSecagem: '', valorSecagem: '',
  observacoes: '',
});

/**
 * Texto do campo para número, ou `null` quando o operador não preencheu.
 *
 * ⚠ `parseMoeda`, NUNCA `parseNumericValue` — e a diferença custou uma carga que não salvava.
 * O parser do abate trata ponto sem vírgula como DECIMAL (`'5.000'` → 5, está no CLAUDE.md),
 * regra boa para peso de boi e péssima para peso de balança: "26.560" virava 26,56, a quebra
 * dava −22.655,92 e a tela recusava a carga dizendo que o seco era maior que o verde.
 * `parseMoeda` decide pelo número de dígitos depois do ponto — 1 ou 2 é decimal, 3 é milhar.
 * ⚠ E ELE É O PARSER DO DINHEIRO, de propósito: um só lugar no sistema decide o que é milhar.
 */
const num = (t: string): number | null => {
  const texto = t.trim();
  if (!texto) return null;
  const n = parseMoeda(texto);
  if (n == null) return null;
  /**
   * ⚠ O SINAL SE PRESERVA AQUI, e não é preciosismo: `parseMoeda` limpa tudo que não é dígito,
   * ponto ou vírgula — inclusive o menos. Descoberto pelo teste ao trocar de parser: "-1" de
   * aflatoxina virava 1 e passava na validação, ou seja, o sistema CORRIGIA em silêncio o que
   * devia recusar. Inverter o número do operador é pior que recusá-lo.
   * ⚠ A CORREÇÃO É LOCAL, de propósito: `parseMoeda` tem doze consumidores de dinheiro, e
   * mudar o sinal lá dentro é outro PR, com outra homologação.
   */
  return texto.startsWith('-') ? -n : n;
};

/**
 * ⚠ UM OBJETO SÓ, NÃO UNIÃO DISCRIMINADA — pelo mesmo motivo medido em `areaPlantada.ts`:
 * com `strict: false` o TypeScript não estreita a união pelo `if (!v.ok)`, e a união criaria
 * mais uma entrada de baseline.
 * ⚠ O PARSE É O DO DINHEIRO (`parseMoeda`): "5.000" e "1.234,5" são o que o operador digita, e
 * `Number('5.000')` devolve 5. Ver a nota em `num`.
 */
export function validarCarga(form: CargaForm): ValidacaoCarga {
  const data = (form.dataColheita || '').trim();
  if (!data) return { ok: false, erro: 'Informe a data da colheita.' };

  const pesoFazenda = num(form.pesoFazendaKg);
  const verde = num(form.pesoVerdeKg);
  const seco = num(form.pesoSecoKg);
  const umidade = num(form.umidadePct);
  const aflatoxina = num(form.aflatoxinaPpb);
  const sacasBoas = num(form.sacasBoas);
  const rocaSacas = num(form.graoRocaSacas);
  const rocaKg = num(form.graoRocaKg);
  const renda = num(form.rendaLiquidaPct);
  const taxaSecagem = num(form.taxaSecagem);
  const valorSecagem = num(form.valorSecagem);

  const naoNegativos: ReadonlyArray<readonly [string, number | null]> = [
    ['o peso da fazenda', pesoFazenda], ['peso verde', verde], ['peso seco', seco], ['a umidade', umidade],
    ['a aflatoxina', aflatoxina], ['as sacas boas', sacasBoas],
    ['o grão de roça em sacas', rocaSacas], ['o grão de roça em quilos', rocaKg],
    ['a renda líquida', renda],
    ['a taxa de secagem', taxaSecagem], ['o valor da secagem', valorSecagem],
  ];
  for (const [rotulo, v] of naoNegativos) {
    if (v != null && v < 0) return { ok: false, erro: `Valor negativo em ${rotulo}.` };
  }

  if (verde == null && seco == null) {
    return { ok: false, erro: 'Informe ao menos o peso verde embarcado.' };
  }
  /**
   * ⚠ SECO MAIOR QUE VERDE É ERRO DE DIGITAÇÃO, e vale recusar: secar TIRA água, nunca
   * acrescenta. Deixar passar produziria quebra negativa — um número que parece ganho de peso
   * e que ninguém saberia explicar três meses depois.
   */
  if (verde != null && seco != null && seco > verde) {
    return { ok: false, erro: 'O peso seco não pode ser maior que o verde embarcado.' };
  }
  /* Percentuais são percentuais: 120% de umidade é dígito trocado, não medição. */
  for (const [rotulo, v] of [['umidade', umidade], ['renda líquida', renda]] as const) {
    if (v != null && v > 100) return { ok: false, erro: `A ${rotulo} não pode passar de 100%.` };
  }

  return {
    ok: true,
    payload: {
      data_colheita: data,
      /* ⚠ BRANCO É NULO, não '00:00': meia-noite é uma hora, ausência não é. */
      hora_chegada: form.horaChegada.trim() || null,
      peso_fazenda_kg: pesoFazenda,
      ticket_balanca: form.ticketBalanca.trim() || null,
      nf_produtor: form.nfProdutor.trim() || null,
      filial: form.filial.trim() || null,
      peso_verde_kg: verde,
      peso_seco_kg: seco,
      umidade_pct: umidade,
      aflatoxina_ppb: aflatoxina,
      sacas_boas: sacasBoas,
      grao_roca_sacas: rocaSacas,
      grao_roca_kg: rocaKg,
      renda_liquida_pct: renda,
      taxa_secagem: taxaSecagem,
      valor_secagem: valorSecagem,
      observacoes: form.observacoes.trim() || null,
    },
  };
}

/** O que o rodapé consolidado da safra mostra. */
export interface TotaisColheita {
  cargas: number;
  verdeKg: number;
  secoKg: number;
  sacasBoas: number;
  graoRocaSacas: number;
  graoRocaKg: number;
  /** 1 − seco/verde, em pontos percentuais. `null` enquanto a cooperativa não devolveu o seco. */
  quebraPct: number | null;
  /**
   * sacas/ha (ou t/ha) das SACAS BOAS. `null` sem base ou sem área.
   *
   * ⚠ É A LÍQUIDA, e a tela tem de dizer isso: a FINAL inclui o grão de roça e é maior. A
   * diferença entre as duas é o refugo inteiro da safra, e confundi-las faz o talhão parecer
   * pior do que foi — ou melhor, dependendo de qual se comparou.
   */
  produtividade: number | null;
  /** Sacas boas + grão de roça: o que de fato saiu do talhão e a cooperativa aceitou. */
  sacasFinais: number;
  /** sacas finais/ha. `null` sem área — e sempre >= a líquida. */
  produtividadeFinal: number | null;
  /** O verde convertido em sacas — "o que arrancou", antes da secagem. `null` sem saca. */
  verdeEmSacas: number | null;
  /** Quantas cargas ainda esperam o peso seco. */
  aguardandoSeco: number;
  /** A separação que a cooperativa faz, derivada do ppb de cada carga. */
  sacasAteLimite: number;
  sacasAcimaLimite: number;
  /** Sacas de carga sem aflatoxina informada — pendência, não faixa. */
  sacasSemClasse: number;
  /** O que a cooperativa cobrou de secagem na safra — custo, ainda sem lançamento. */
  valorSecagem: number;
}

const arred = (v: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/**
 * OS TOTAIS DAS CARGAS.
 *
 * ⚠ A QUEBRA SÓ EXISTE SOBRE O QUE JÁ VOLTOU SECO, e a conta é feita carga a carga: usar o
 * verde TOTAL contra o seco PARCIAL daria uma quebra fantasiosa de 60% enquanto metade da
 * safra ainda está na cooperativa — e o operador leria isso como perda.
 * ⚠ A SEPARAÇÃO POR FAIXA É SOBRE SACAS BOAS, e o grão de roça fica FORA das duas: ele já é
 * refugo, e somá-lo a qualquer faixa faria o lote bom parecer maior do que a cooperativa vai
 * pagar.
 */
export function totaisColheita(
  linhas: readonly CargaForm[],
  cultura: string | null | undefined,
  areaHa: number | null | undefined,
): TotaisColheita {
  let verdeKg = 0, secoKg = 0, sacasBoas = 0, graoRocaSacas = 0, graoRocaKg = 0;
  let verdeComSeco = 0, aguardandoSeco = 0;
  let sacasAteLimite = 0, sacasAcimaLimite = 0, sacasSemClasse = 0, valorSecagem = 0;

  for (const l of linhas) {
    const v = num(l.pesoVerdeKg) ?? 0;
    const s = num(l.pesoSecoKg) ?? 0;
    const sb = num(l.sacasBoas) ?? 0;
    verdeKg += v;
    secoKg += s;
    sacasBoas += sb;
    graoRocaSacas += num(l.graoRocaSacas) ?? 0;
    graoRocaKg += num(l.graoRocaKg) ?? 0;
    valorSecagem += num(l.valorSecagem) ?? 0;
    if (s > 0) verdeComSeco += v; else if (v > 0) aguardandoSeco++;

    const faixa = faixaAflatoxina(num(l.aflatoxinaPpb));
    if (faixa === 'ate') sacasAteLimite += sb;
    else if (faixa === 'acima') sacasAcimaLimite += sb;
    else sacasSemClasse += sb;
  }

  const quebraPct = secoKg > 0 && verdeComSeco > 0
    ? arred((1 - secoKg / verdeComSeco) * 100, 1)
    : null;

  /**
   * ⚠ A PRODUTIVIDADE É DO QUE A COOPERATIVA ACEITOU, não do que embarcou: em saca, são as
   * sacas boas; sem saca, o peso seco em tonelada. O verde carrega água, e comparar dois
   * talhões pelo verde premia quem colheu mais úmido.
   */
  const { kgPorSaca } = unidadeDaCultura(cultura);
  const sacasFinais = arred(sacasBoas + graoRocaSacas);
  let produtividade: number | null = null;
  let produtividadeFinal: number | null = null;
  if (areaHa && areaHa > 0) {
    if (kgPorSaca && sacasBoas > 0) produtividade = arred(sacasBoas / areaHa);
    else if (!kgPorSaca && secoKg > 0) produtividade = arred(secoKg / 1000 / areaHa);
    if (kgPorSaca && sacasFinais > 0) produtividadeFinal = arred(sacasFinais / areaHa);
  }

  return {
    cargas: linhas.length,
    verdeKg: arred(verdeKg), secoKg: arred(secoKg),
    sacasBoas: arred(sacasBoas), graoRocaSacas: arred(graoRocaSacas), graoRocaKg: arred(graoRocaKg),
    quebraPct, produtividade, aguardandoSeco,
    sacasAteLimite: arred(sacasAteLimite),
    sacasAcimaLimite: arred(sacasAcimaLimite),
    sacasSemClasse: arred(sacasSemClasse),
    valorSecagem: arred(valorSecagem),
    sacasFinais,
    produtividadeFinal,
    /* ⚠ CONVERSÃO SÓ DE LEITURA: o verde em sacas é o "o que arrancou" da cadeia, e não existe
       no romaneio — a cooperativa pesa verde em quilo. Ele não se grava em lugar nenhum. */
    verdeEmSacas: kgPorSaca && verdeKg > 0 ? arred(verdeKg / kgPorSaca) : null,
  };
}

/**
 * O RÓTULO "Cultura · unidade" — "Amendoim · sacas de 25kg", "Mandioca · toneladas".
 *
 * ⚠ UM SÓ PARA OS TRÊS LUGARES que o mostram — a tela de Estoque de Grãos, o modal de venda
 * avulsa e o modal do balanço por safra. Três textos escritos à mão é a lição do `Cartao` e do
 * cinza do cabeçalho, paga duas vezes neste mesmo mês: o que diverge não é o primeiro, é o
 * terceiro, no dia em que alguém corrige só dois.
 * ⚠ A UNIDADE VEM DE `UNIDADES`, nunca de uma lista escrita no consumidor: hoje só o amendoim
 * tem saca, e soja e milho dizem "toneladas" porque o peso da saca deles ainda não foi decidido.
 * Quando for, este rótulo muda sozinho nos três lugares.
 */
export function rotuloCulturaUnidade(cultura: string | null | undefined): string {
  const { kgPorSaca } = unidadeDaCultura(cultura);
  const unidade = kgPorSaca ? `sacas de ${kgPorSaca}kg` : 'toneladas';
  return `${labelDaCultura(cultura)} · ${unidade}`;
}
