/**
 * O MODAL DE VALOR DO DRE — DRE-MODAL-VALOR-01b. Um só para a Lavoura e para a Pecuária.
 *
 * ⚠ ELE NASCEU DO MODAL DO RATEIO DA LAVOURA (PR-RATEIO-F1) e responde a mesma pergunta, agora nas
 *   duas atividades: "de onde sai ESTE número da grade?". Cabeçalho em duas linhas (o número e a
 *   conta por trás dele), abas Lançamentos | Rateio, três cartões (direto, rateio, total), a lista
 *   inteira — direto e rateio na mesma tabela, o rateio marcado — e o rodapé com o total.
 * ⚠ ELE NÃO BUSCA NADA: recebe um `ValorDre` pronto. Os dois adaptadores puros (`valorDaLavoura`,
 *   `valorDaPecuaria`) moram aqui embaixo e são o que se testa: a soma das linhas FECHA NA CÉLULA.
 * ⚠ SAÍRAM COM ELE o `PecLancamentosModal` e o `PecRateioAdmModal` (a lista e o rateio da pecuária
 *   em dois modais), os donuts e as três abas do rateio da lavoura.
 * ⚠ A ABA RATEIO TEM DUAS FORMAS (DRE-RATEIO-MODAL-01): no ADMINISTRATIVO é o encontro de contas do banco
 *   (`RateioEncontro`: Resumo | Mês a mês — total, para onde foi, a prova); no rateio COMPARTILHADO da lavoura
 *   (pool por área) segue a tabela de etapas, porque a RPC só devolve o encontro no ramo admin.
 * ⚠ A LINHA DE RATEIO JÁ VEM NA PARTE DA CÉLULA: a RPC devolve a parte da atividade (`parte`) e o
 *   adaptador a reparte até a coluna (fazenda ou cultura) por `ratearNoAlvo`, em centavos, com o
 *   resíduo na maior linha. Por isso a soma da lista é o número da grade, e não o bruto.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { Loader2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { porCabeca, rateioDoGrupo, valorDe, centrosDoBloco, LINHAS_PEC } from '@/components/agri/drePecRegua';
import { BLOCO_DA_LINHA } from '@/hooks/useDrePecuaria';
import type {
  ChaveLinhaPec, DrePecLinhas, DrePecuaria, LancamentoPec, NaoAlocadoRateio, RateioAdmPec, RecortePec,
} from '@/hooks/useDrePecuaria';
import { lerEncontroRateio, parteDoDestino } from '@/lib/agri/encontroRateio';
import {
  RateioEncontro, LEGENDA_AREA, LEGENDA_CABECAS, type EncontroValorDre, type VisaoRateio,
} from '@/components/agri/RateioEncontro';


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
  /**
   * O centro de custo do lançamento — `null` fora do ramo natureza/investimento.
   *
   * ⚠ ELE EXISTE PARA A LISTA DO POOL. Quando o modal abre o rateio compartilhado inteiro, as
   * linhas vêm de VÁRIOS centros (Insumos, Operações Mecanizadas, Serviços…), e sem esta coluna
   * a lista é um amontoado em que o operador não sabe de onde cada nota veio. Nas listas de um
   * centro só a coluna não aparece — ali ela repetiria o título.
   */
  centro?: string | null;
  data: string | null;
  descricao: string | null;
  favorecido: string | null;
  valor: number;
  /**
   * DRE-MODAL-VALOR-01a: pagamento, status e fazenda nos dois ramos; `grupo`, `pct` e `parte` no
   * ramo admin (`parte` = a fatia da atividade, sem arredondar). Opcionais: o payload antigo não os traz.
   */
  pagamento?: string | null;
  status?: string | null;
  fazenda?: string | null;
  grupo?: string | null;
  pct?: number | null;
  parte?: number | null;
  origem?: string | null;
  /** O subcentro da linha, lido da CHAVE (`plano_conta_id`) — DRE-MODAL-SUBCENTRO-01. Opcional: payload antigo. */
  subcentro?: string | null;
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
  /** RATEIO-VIGENCIA-01 — o administrativo que não caiu em DRE nenhum (só no ramo admin). */
  nao_alocado?: NaoAlocadoRateio | null;
  /**
   * DRE-RATEIO-MODAL-01 — o encontro de contas do administrativo, como o banco o devolve (nulos fora do ramo
   * admin). ⚠ NÃO SE LEEM DAQUI: quem dá forma é `lerEncontroRateio`, sobre o payload inteiro.
   */
  resumo?: unknown;
  por_mes?: unknown;
  por_mes_total?: unknown;
}


const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/** O tipo de recorte que o painel clicou — muda a frase do rodapé, nunca o cálculo. */
/**
 * O tipo de recorte que o painel clicou — muda a frase do rodapé, nunca o cálculo.
 *
 * ⚠ `pool_fixo` E `pool_investimento` ENTRARAM NO PR-09: eles pedem à RPC o POOL de um bloco
 * (chave nula), que é o que as filhas de rateio do Custo fixo e do Investimento mostram. São
 * ramos de `p_tipo`, não um segundo modal — do lado de cá se comportam como 'natureza'.
 */
export type TipoRateio =
  'natureza' | 'investimento' | 'admin' | 'pool_fixo' | 'pool_investimento';

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
export function subtituloDoRateio(d: RateioDetalhe, tipo: TipoRateio, ehPool?: boolean): string {
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
  /* ⚠ A CAUDA MUDA ENTRE "UM CENTRO SEM DIRETO" E "O POOL INTEIRO": no primeiro caso o operador
     precisa saber que aquele centro não tem nota marcada com a cultura; no segundo a frase seria
     falsa — um pool não tem parte direta por definição. */
  if (ehPool) {
    return `${pct}% de ${formatMoeda(d.pool)} por área`;
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

/* ══════════════════════════ O CONTRATO DO MODAL ══════════════════════════ */

/** Uma linha da tabela — direta ou de rateio (`rateioPct` preenchido). */
export interface LinhaValorDre {
  chave: string;
  /** Só a linha que VEIO de `financeiro_lancamentos_v2` abre o Financeiro (regra do lápis). */
  idEditavel: string | null;
  competencia: string | null;
  pagamento: string | null;
  descricao: string | null;
  favorecido: string | null;
  fazenda: string | null;
  /** O subcentro, pela chave — agrupa o quadro "Por subcentro" e filtra a lista (DRE-MODAL-SUBCENTRO-01). */
  subcentro: string | null;
  valor: number;
  status: string | null;
  /** % do lançamento original que caiu NESTA célula. `null` = linha direta. */
  rateioPct: number | null;
}

/** Uma etapa da aba Rateio: do bruto à parte da coluna. */
export interface EtapaValorDre {
  chave: string;
  etapa: string;
  base: string;
  pct: number | null;
  valor: number | null;
  /** 0 = etapa da conta; 1 = a repartição (fazenda ou cultura), recuada. */
  nivel: 0 | 1;
  /** A etapa que É a célula clicada (a cultura aberta). */
  destaque?: boolean;
}

export interface ValorDre {
  /** O grupo ou a linha — "Mão de Obra", "Administração", "Custo fixo". */
  titulo: string;
  /** A conta por trás: atividade · fazenda · período · divisor. */
  contexto: string;
  /** R$/cab/mês (pecuária) ou R$/ha (lavoura) — a MESMA conta da grade. */
  porUnidade: (v: number | null) => string;
  /**
   * O NÚMERO da mesma conta, sem "R$" nem sufixo, e o rótulo da coluna — para o quadro "Por subcentro"
   * (DRE-MODAL-SUBCENTRO-01). `porUnidade` é montado A PARTIR dele: uma conta só, dois formatos.
   */
  porUnidadeNum: (v: number | null) => string;
  rotuloUnidade: string;
  /** `null` = a linha não tem parte direta ("—"). */
  direto: number | null;
  /** `null` = a linha não tem rateio ("—"). */
  rateio: number | null;
  rotuloRateio: string;
  /** "Direto da fazenda" (pecuária) ou "Direto da cultura" (lavoura) — cartão e segmentado. */
  rotuloDireto: string;
  /** "rateio adm." ou "rateio" — o selo da linha de rateio. */
  seloRateio: string;
  /**
   * A célula é de SAÍDA (custo, investimento, deduções…) — DRE-MODAL-SUBCENTRO-01. Governa a regra do sinal nos
   * cartões, no quadro e na lista: saída em vermelho; o negativo (estorno) inverte.
   */
  saida: boolean;
  linhas: LinhaValorDre[];
  /**
   * As etapas do rateio COMPARTILHADO da lavoura (pool → culturas). ⚠ SÓ FORA DO ADMINISTRATIVO: ali a aba
   * Rateio é o `encontro` (DRE-RATEIO-MODAL-01) e esta lista vem vazia.
   */
  etapas: EtapaValorDre[];
  /**
   * O ENCONTRO DE CONTAS DO ADMINISTRATIVO — DRE-RATEIO-MODAL-01: total, para onde foi, a prova e o mês a mês,
   * lidos do banco. `null` = a linha não tem rateio administrativo (ou o banco não o devolveu).
   */
  encontro: EncontroValorDre | null;
  rodapeRateio: string;
}

/**
 * REPARTE UMA LISTA ATÉ UM ALVO, EM CENTAVOS — a soma devolvida é o alvo, exata.
 *
 * ⚠ PROPORCIONAL AO PESO DE CADA LINHA, arredondado em centavo, e o RESÍDUO VAI PARA A MAIOR (em
 *   módulo) — o mesmo idioma da RPC no 01a. Sem isso, 1.119 linhas arredondadas somariam alguns
 *   centavos longe da célula, e o rodapé "não bateria" por construção.
 * ⚠ PESO TOTAL ZERO devolve zeros, e o alvo não se distribui: não há proporção a seguir.
 */
export function ratearNoAlvo(pesos: readonly number[], alvo: number): number[] {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (pesos.length === 0 || soma === 0) return pesos.map(() => 0);
  const alvoC = Math.round(alvo * 100);
  const cents = pesos.map(p => Math.round((p / soma) * alvoC));
  const residuo = alvoC - cents.reduce((a, c) => a + c, 0);
  if (residuo !== 0) {
    let iMax = 0;
    pesos.forEach((p, i) => { if (Math.abs(p) > Math.abs(pesos[iMax])) iMax = i; });
    cents[iMax] += residuo;
  }
  return cents.map(c => c / 100);
}

const pctDe = (parte: number, base: number) => (base !== 0 ? (parte / base) * 100 : null);

/** Os motivos do "não alocado" que a RPC escreveu — sem a silvicultura, que no encontro de contas é parte própria. */
const motivosNaoAlocado = (n: NaoAlocadoRateio | null | undefined): string[] =>
  (n?.motivos ?? []).filter(m => m.valor !== 0 && !m.motivo.toLowerCase().startsWith('silvicultura'))
    .map(m => m.motivo).filter(Boolean);

/* ══════════════════════════ LAVOURA ══════════════════════════ */

/**
 * O PAYLOAD DE `fn_painel_rateio_detalhe` NA FORMA DO MODAL — Lavoura.
 *
 * ⚠ A DIVISÃO É A DA RPC, como sempre foi: `compartilhado` separa o direto da cultura do pool, e a
 *   linha de pool entra repartida pela fatia da cultura (`ratearNoAlvo` até `fatia.valor`). No
 *   admin a lista inteira é rateio, e o peso de cada linha é a `parte` da agricultura.
 * ⚠ SEM DIVISÃO (pool zero), o rateio é `null` — "—", não R$ 0,00 — e a aba Rateio fica desligada.
 */
export function valorDaLavoura(d: RateioDetalhe, tipo: TipoRateio, o: {
  rotulo: string; cultura: string; safra: string | null; area: number | null; pool: boolean;
}): ValorDre {
  const f = fatiaAtual(d);
  const admin = tipo === 'admin';
  const temRateio = admin || d.pool > 0;
  const rateio = temRateio ? (f?.valor ?? 0) : null;
  const direto = admin || o.pool ? null : d.direto_cultura;
  const diretos = admin ? [] : d.lancamentos.filter(l => !l.compartilhado);
  const doPool = admin ? d.lancamentos : d.lancamentos.filter(l => l.compartilhado);
  const repartidos = rateio == null ? [] : ratearNoAlvo(doPool.map(l => l.parte ?? l.valor), rateio);
  const linha = (l: LancamentoRateio, i: number, valor: number, rateioPct: number | null): LinhaValorDre => ({
    chave: `${rateioPct == null ? 'd' : 'r'}-${l.id || i}`,
    idEditavel: l.id && (l.origem == null || l.origem === 'lancamento') ? l.id : null,
    competencia: l.data, pagamento: l.pagamento ?? null, descricao: l.descricao,
    favorecido: l.favorecido, fazenda: l.fazenda ?? null, subcentro: l.subcentro ?? null, valor,
    status: l.status ?? null, rateioPct,
  });
  const etapas: EtapaValorDre[] = [];
  /* ⚠ O ADMINISTRATIVO NÃO TEM MAIS ETAPAS: a aba Rateio dele é o encontro de contas, lido do banco. */
  if (temRateio && !admin) {
    etapas.push({ chave: 'pool', etapa: 'Custo compartilhado a ratear', base: '—', pct: null, valor: d.pool, nivel: 0 });
    d.fatias.forEach(x => etapas.push({
      chave: `c-${x.cultura}`, etapa: labelDaCultura(x.cultura), base: `${formatNum(x.area_ha, 2)} ha`,
      pct: x.peso, valor: x.valor, nivel: 1, destaque: x.atual,
    }));
  }
  const dados = admin ? lerEncontroRateio(d) : null;
  const encontro: EncontroValorDre | null = dados ? {
    dados, atividade: 'agricultura', grupo: null, motivosNaoAlocado: motivosNaoAlocado(d.nao_alocado),
    /* O número que a grade mostra para a safra é o `pool` da mesma resposta. */
    gradeTotal: d.pool,
    dentro: {
      titulo: 'Dentro da lavoura · por cultura', legenda: LEGENDA_AREA,
      colNome: 'Cultura', colBase: 'Área (ha)', casasBase: 2,
      linhas: d.fatias.map(x => ({
        chave: x.cultura, nome: labelDaCultura(x.cultura), base: x.area_ha, pct: x.peso, valor: x.valor, destaque: x.atual,
      })),
      rotuloTotal: dados.porSafra ? 'Total · parte da safra' : 'Total · parte da agricultura',
      totalBase: null,
      /* A parte da SAFRA aberta quando a RPC a abre; senão, a da agricultura. Lida, nunca somada. */
      totalValor: dados.porSafra?.find(x => x.safraId != null)?.valor ?? parteDoDestino(dados, 'agricultura')?.valor ?? null,
    },
  } : null;
  const area = o.area ?? f?.area_ha ?? null;
  const porHa = (v: number | null) => (v == null || area == null || !(area > 0) ? '—' : formatNum(v / area, 2));
  return {
    titulo: o.rotulo,
    contexto: [labelDaCultura(o.cultura), o.safra ? `Safra ${o.safra}` : null,
      subtituloDoRateio(d, tipo, o.pool)].filter(Boolean).join(' · '),
    porUnidade: v => { const t = porHa(v); return t === '—' ? '—' : `R$ ${t}/ha`; },
    porUnidadeNum: porHa,
    rotuloUnidade: 'R$/ha',
    direto, rateio,
    rotuloRateio: admin ? 'Rateio administrativo' : 'Rateio compartilhado',
    rotuloDireto: 'Direto da cultura',
    seloRateio: admin ? 'rateio adm.' : 'rateio',
    /* Todo ramo da Lavoura aqui é custo: natureza, pool, investimento e o rateio administrativo. */
    saida: true,
    linhas: [
      ...diretos.map((l, i) => linha(l, i, l.valor, null)),
      ...doPool.map((l, i) => linha(l, i, repartidos[i] ?? 0, pctDe(repartidos[i] ?? 0, l.valor))),
    ],
    etapas,
    encontro,
    rodapeRateio: admin ? 'Mesma conta do DRE: bruto × % da agricultura × % da área'
      : notaDoRateio(d, tipo),
  };
}

/* ══════════════════════════ PECUÁRIA ══════════════════════════ */

/* Os blocos de ENTRADA da cascata da pecuária; o resto é saída (a regra do sinal do modal). */
const BLOCOS_DE_ENTRADA_PEC = new Set(['venda', 'outras_receitas']);

const ROTULO_BLOCO_PEC: Record<string, string> = {
  fixo: 'Custo fixo', variavel: 'Custo variável', investimento: 'Investimento', rateio_adm: 'Rateio administrativo',
  venda: 'Vendas', outras_receitas: 'Outras receitas', deducoes: 'Deduções', reposicao: 'Reposição', juros: 'Despesas financeiras',
};

/**
 * A CÉLULA DA PECUÁRIA NA FORMA DO MODAL.
 *
 * ⚠ OS NÚMEROS SÃO OS DA CÉLULA (`recorte.celula`), não uma segunda conta: o direto é o que a RPC
 *   da lista soma para o recorte, e o rateio das linhas é repartido até o rateio da coluna — o grupo
 *   (`rateio_adm_grupos`) ou o total (`rateio_adm`).
 * ⚠ O R$/cab/mês É O `porCabeca` DA GRADE, com a `cab_media` e os `meses` da coluna clicada.
 * ⚠ A REPARTIÇÃO POR FAZENDA DA ABA RATEIO vem do DRE DO MESMO PERÍODO (`dre`), quando a tela o tem;
 *   sem ele, a aba mostra bruto e parte da atividade e não inventa a divisão.
 */
/**
 * A CELULA DO CLIQUE, RELIDA NO DRE ATUAL — DRE-MODAL-REFRESH-01.
 *
 * ⚠ O DEFEITO: os cards (Direto, Rateio, Total, R$/cab/mes) e o alvo da reparticao do rateio liam
 *   `recorte.celula`, a FOTOGRAFIA que a grade tirou no clique. Depois de salvar um lancamento pelo
 *   modal a grade relia o DRE e o modal continuava com o numero velho — so' fechar e reabrir refazia a
 *   foto. Agora a FORMA vem do clique (qual fazenda, qual bloco, qual centro, se ha direto, se ha
 *   rateio, de qual grupo) e os NUMEROS vem do DRE que a tela acabou de reler, pelas mesmas leituras
 *   que a grade faz ao montar a celula (`LinhaPec`/`LinhaCentro`, `celulaDaColuna`).
 * ⚠ NAO E' CONTA DA TELA: nada e' somado aqui — cada numero e' uma chave ou um centro da RPC.
 * ⚠ SEM DRE PARA A COLUNA (ainda carregando, ou coluna que a tela nao guarda), vale a foto do clique.
 */
/* A linha da cascata dona de um bloco — a mesma `BLOCO_DA_LINHA` que a grade usa, lida ao contrario. */
const chaveDoBloco = (bloco: string): ChaveLinhaPec | undefined =>
  LINHAS_PEC.find(d => BLOCO_DA_LINHA[d.chave] === bloco)?.chave;
export function celulaAtualizada(r: RecortePec, dre: DrePecuaria | null): RecortePec['celula'] {
  const cel = r.celula;
  if (!cel || !dre) return cel;
  const l: DrePecLinhas | undefined = r.fazendaId === null
    ? dre.total : dre.fazendas.find(f => f.fazenda_id === r.fazendaId)?.linhas;
  if (!l) return cel;
  const chave = chaveDoBloco(r.bloco);
  const direto = cel.direto == null ? null
    : r.centro === null ? (chave ? valorDe(l, chave) : cel.direto)
      : centrosDoBloco(l, r.bloco).find(c => c.centro === r.centro)?.valor ?? null;
  const rateio = cel.rateio == null ? null
    : cel.grupo ? rateioDoGrupo(l, cel.grupo) : valorDe(l, 'rateio_adm');
  return { ...cel, direto, rateio, cabMedia: l.patrimonio.cab_media };
}

export function valorDaPecuaria(o: {
  recorte: RecortePec;
  lancamentos: readonly LancamentoPec[];
  rateio: RateioAdmPec | null;
  dre: DrePecuaria | null;
  periodoRotulo: string;
}): ValorDre {
  const r = o.recorte;
  const diretos = r.soRateio ? [] : o.lancamentos;
  const somaDiretos = diretos.reduce((a, l) => a + l.valor, 0);
  const cel = celulaAtualizada(r, o.dre)
    ?? { direto: somaDiretos, rateio: null, grupo: null, cabMedia: 0, meses: 0, comRateio: false };
  const grupo = cel.grupo;
  const doGrupo = (o.rateio?.lancamentos ?? []).filter(l => grupo == null || l.grupo === grupo);
  const repartidos = cel.rateio == null ? [] : ratearNoAlvo(doGrupo.map(l => l.parte), cel.rateio);
  const linhas: LinhaValorDre[] = [
    ...diretos.map((l, i): LinhaValorDre => ({
      chave: `d-${l.origem}-${l.id ?? i}`,
      idEditavel: l.origem === 'lancamento' ? l.id : null,
      competencia: l.data, pagamento: l.pagamento ?? null, descricao: l.descricao, favorecido: l.favorecido,
      fazenda: l.fazenda, subcentro: l.subcentro, valor: l.valor, status: l.status, rateioPct: null,
    })),
    ...(cel.rateio == null ? [] : doGrupo.map((l, i): LinhaValorDre => ({
      chave: `r-${l.id ?? i}-${i}`,
      idEditavel: l.origem === 'lancamento' ? l.id : null,
      competencia: l.data, pagamento: l.pagamento, descricao: l.descricao, favorecido: l.favorecido,
      fazenda: l.fazenda, subcentro: l.subcentro ?? null, valor: repartidos[i] ?? 0, status: l.status,
      rateioPct: pctDe(repartidos[i] ?? 0, l.valor),
    }))),
  ];
  /* ⚠ O ENCONTRO DE CONTAS — DRE-RATEIO-MODAL-01. O total, as partes e a prova são do banco (`o.rateio.encontro`);
     a divisão por FAZENDA é a do DRE que a tela já tem para o período (`rateio_adm` e `cab_media` de cada uma) —
     nenhuma consulta nova. Sem o DRE, a tabela de fazendas diz que não tem a divisão, e não a inventa.
     ⚠ COM GRUPO DE CUSTO (Mão de Obra, Máquinas…): a RPC NÃO abre o resumo por grupo — os blocos de cima são o
     administrativo INTEIRO, e a tabela por fazenda mostra o rateio DAQUELE grupo (`rateio_adm_grupos`), como antes. */
  const dados = cel.rateio != null ? o.rateio?.encontro ?? null : null;
  let encontro: EncontroValorDre | null = null;
  if (dados) {
    const doGrupoNaLinha = (l: DrePecLinhas) => (grupo == null ? l.rateio_adm : rateioDoGrupo(l, grupo));
    const totalValor = grupo == null
      ? parteDoDestino(dados, 'pecuaria')?.valor ?? null
      : o.dre ? doGrupoNaLinha(o.dre.total) : null;
    const faz = (o.dre?.fazendas ?? [])
      .filter(f => f.linhas.patrimonio.cab_media !== 0 || doGrupoNaLinha(f.linhas) !== 0);
    encontro = {
      dados, atividade: 'pecuaria', grupo, motivosNaoAlocado: motivosNaoAlocado(o.rateio?.naoAlocado),
      /* O total da pecuária NA GRADE (`total.rateio_adm` do DRE que a tela já tem). Com grupo não há par a comparar. */
      gradeTotal: grupo == null && o.dre ? o.dre.total.rateio_adm : null,
      dentro: {
        titulo: grupo == null ? 'Dentro da pecuária · por fazenda' : `Dentro da pecuária · ${grupo} adm. · por fazenda`,
        legenda: LEGENDA_CABECAS,
        colNome: 'Fazenda', colBase: 'Cabeças médias', casasBase: 0,
        linhas: faz.map(f => ({
          chave: f.fazenda_id, nome: f.nome, base: f.linhas.patrimonio.cab_media,
          pct: totalValor == null ? null : pctDe(doGrupoNaLinha(f.linhas), totalValor),
          valor: doGrupoNaLinha(f.linhas), destaque: f.fazenda_id === r.fazendaId,
        })),
        rotuloTotal: grupo == null ? 'Total · parte da pecuária' : `Total · ${grupo} adm. na pecuária`,
        totalBase: o.dre ? o.dre.total.patrimonio.cab_media : null,
        totalValor,
        vazio: 'sem a divisão por fazenda neste recorte',
      },
    };
  }
  const bloco = ROTULO_BLOCO_PEC[r.bloco] ?? r.bloco;
  return {
    titulo: r.rotulo,
    /* ⚠ NA COLUNA TOTAL O `fazendaNome` É O NOME DA COLUNA — na Comparação, o próprio período — e
       sairia repetido ao lado do rótulo do período. Medido no preview em 27/09. */
    contexto: [`${bloco} pecuária`, r.fazendaId === null ? 'Todas as fazendas' : r.fazendaNome, o.periodoRotulo,
      cel.cabMedia > 0 && cel.meses > 0 ? `${formatNum(cel.cabMedia, 0)} cab médias × ${cel.meses} meses` : null,
    ].filter(Boolean).join(' · '),
    porUnidade: v => {
      const t = porCabeca(v, cel.cabMedia, cel.meses);
      return v == null || t === '—' ? '—' : `R$ ${t}/cab/mês`;
    },
    porUnidadeNum: v => porCabeca(v, cel.cabMedia, cel.meses),
    rotuloUnidade: 'R$/cab/mês',
    direto: r.soRateio ? null : cel.direto,
    rateio: cel.rateio,
    rotuloRateio: grupo ? `Rateio administrativo (${grupo} adm.)` : 'Rateio administrativo',
    rotuloDireto: 'Direto da fazenda',
    seloRateio: 'rateio adm.',
    saida: !BLOCOS_DE_ENTRADA_PEC.has(r.bloco),
    linhas,
    etapas: [],
    encontro,
    rodapeRateio: 'Mesma conta do DRE: a soma dos grupos fecha no rateio administrativo total',
  };
}

/* ══════════════════════════ O QUADRO "POR SUBCENTRO" ══════════════════════════ */

/** Uma linha do quadro: o subcentro, o direto, o rateio e o total, em reais; `n` = lançamentos. */
export interface LinhaQuadroSubcentro {
  subcentro: string | null;
  direto: number;
  rateio: number;
  total: number;
  n: number;
  /** Quantas linhas de cada tipo: sem linha de um tipo, a célula é "—" (ausência), nunca 0,00. */
  nDireto: number;
  nRateio: number;
}

/** O rótulo do subcentro nulo (linha antiga, ou planejamento sem plano): ausência dita, nunca vazio. */
export const ROTULO_SEM_SUBCENTRO = '(sem subcentro)';

/**
 * O QUADRO "POR SUBCENTRO" — DRE-MODAL-SUBCENTRO-01.
 *
 * ⚠ AGRUPA AS MESMAS LINHAS QUE A LISTA MOSTRA, e nada mais: não há conta paralela. As linhas de rateio já vêm
 *   repartidas até o rateio da célula (`ratearNoAlvo`), então a soma do quadro é a da lista, que é a dos cartões.
 *   Medido na FASE 0 (NJ jul/25-jun/26, Mão de Obra e Administração; Lavoura NJ 25/26, Operações Mecanizadas do
 *   Amendoim): fecha ao centavo nos dois modos.
 * ⚠ SOMA EM CENTAVOS INTEIROS: somar reais em ponto flutuante deixaria o total do quadro a um décimo de centavo do
 *   cartão, e a igualdade "quadro = cartões" deixaria de ser exata.
 * ⚠ O MODO VEM PRONTO NA LISTA: em "Direto" as linhas de rateio já saíram, e o subcentro só de rateio some junto.
 * Ordem: Total, do maior para o menor; empate pelo nome, para a ordem não mudar entre renders.
 */
export function quadroPorSubcentro(linhas: readonly LinhaValorDre[]): {
  linhas: LinhaQuadroSubcentro[]; direto: number; rateio: number; total: number;
} {
  const m = new Map<string | null, { d: number; r: number; nd: number; nr: number }>();
  for (const l of linhas) {
    const acc = m.get(l.subcentro) ?? { d: 0, r: 0, nd: 0, nr: 0 };
    const c = Math.round(l.valor * 100);
    if (l.rateioPct == null) { acc.d += c; acc.nd += 1; } else { acc.r += c; acc.nr += 1; }
    m.set(l.subcentro, acc);
  }
  const out = [...m.entries()].map(([subcentro, a]) => ({
    subcentro, direto: a.d / 100, rateio: a.r / 100, total: (a.d + a.r) / 100, n: a.nd + a.nr,
    nDireto: a.nd, nRateio: a.nr,
  }));
  out.sort((a, b) => b.total - a.total
    || (a.subcentro ?? ROTULO_SEM_SUBCENTRO).localeCompare(b.subcentro ?? ROTULO_SEM_SUBCENTRO, 'pt-BR'));
  const d = [...m.values()].reduce((x, a) => x + a.d, 0);
  const r = [...m.values()].reduce((x, a) => x + a.r, 0);
  return { linhas: out, direto: d / 100, rateio: r / 100, total: (d + r) / 100 };
}

/** A regra do sinal do modal: saída em vermelho; o negativo (estorno) inverte a regra. */
export function corDoSinal(v: number | null, saida: boolean): string | undefined {
  if (v == null || v === 0) return undefined;
  return (saida ? v > 0 : v < 0) ? 'text-destructive' : undefined;
}

/* ══════════════════════════ O MODAL ══════════════════════════ */

type ColunaLinha = 'comp' | 'pgto' | 'descricao' | 'subcentro' | 'favorecido' | 'fazenda' | 'valor' | 'status';

/* ⚠ TODAS AS COLUNAS ORDENAM (o lápis não é coluna de dado). As larguras são as do mock, e a
   Descrição fica com o resto — `table-fixed`, sem rolagem horizontal. */
export const COLUNAS_VALOR_DRE: Array<ColunaOrdenavel<LinhaValorDre, ColunaLinha> & { h: string; w?: number; direita?: boolean }> = [
  { coluna: 'comp', h: 'Comp.', w: 74, tipo: 'data', valor: l => l.competencia },
  { coluna: 'pgto', h: 'Pgto', w: 74, tipo: 'data', valor: l => l.pagamento },
  { coluna: 'descricao', h: 'Descrição', tipo: 'texto', valor: l => l.descricao },
  /* DRE-MODAL-SUBCENTRO-01 — só o nome (sem código), ordenável; a largura sai da Descrição. */
  { coluna: 'subcentro', h: 'Subcentro', w: 150, tipo: 'texto', valor: l => l.subcentro },
  { coluna: 'favorecido', h: 'Favorecido', w: 130, tipo: 'texto', valor: l => l.favorecido },
  { coluna: 'fazenda', h: 'Fazenda', w: 96, tipo: 'texto', valor: l => l.fazenda },
  { coluna: 'valor', h: 'Valor', w: 92, tipo: 'numero', valor: l => l.valor, direita: true },
  { coluna: 'status', h: 'Status', w: 88, tipo: 'texto', valor: l => l.status },
];
const W_LAPIS = 28;

const TH = 'sticky top-0 z-10 bg-card px-2 py-1 text-[9.5px] font-semibold text-muted-foreground'
  + ' shadow-[inset_0_-1px_0_0_hsl(var(--border))] hover:bg-muted';
const TD = 'px-2 py-[3px] text-[10.5px] leading-[1.25]';
/* DRE-MODAL-SUBCENTRO-01 — os cabeçalhos do quadro e da lista CENTRALIZADOS; as células seguem texto à esquerda e
   valor à direita. E TEXTO SEM RETICÊNCIA: não cabe, quebra (regra do Gabriel, 27/09/2026). */
const TH_C = `${TH} !text-center`;
const QUEBRA = 'whitespace-normal break-words';
const SELO = 'ml-1 inline-block shrink-0 whitespace-nowrap rounded-[4px] border border-amber-200 bg-amber-50 px-1'
  + ' text-[9.5px] leading-[13px] text-amber-700';

/** "Programado" é âmbar, não vermelho: um compromisso ainda não pago não é erro. */
function Status({ s }: { s: string | null }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const realizado = s === 'realizado' || s === 'conciliado';
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-[9px] px-1.5 text-[9.5px] font-semibold leading-[14px]',
      realizado ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

function Cartao({ rotulo, valor, sub, total, cor }: { rotulo: string; valor: string; sub: string; total?: boolean; cor?: string }) {
  return (
    <div className={cn('min-w-0 rounded-md border px-2.5 py-1.5', total && 'border-[#c9d6e6] bg-[#eef3f9]')}>
      <div className="truncate text-[10px] text-muted-foreground" title={rotulo}>{rotulo}</div>
      <div className={cn('whitespace-nowrap text-[15px] font-semibold tabular-nums', cor)}>
        {valor}
      </div>
      <div className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{sub}</div>
    </div>
  );
}

/**
 * O QUADRO "POR SUBCENTRO" — DRE-MODAL-SUBCENTRO-01 (mock docs/mocks/dre_modal_subcentro_mock_v2.html). Bloco do
 * próprio modal, não componente compartilhado. Em "Direto" a coluna Rateio some e o Total é o direto (as linhas de
 * rateio já saíram da lista). O % é sobre o Total do modo ativo — o mesmo número do cartão.
 */
function QuadroSubcentro({ quadro, valor, comRateio, baseTotal, filtro, onAlternar, rotuloSub }: {
  quadro: ReturnType<typeof quadroPorSubcentro>;
  valor: ValorDre;
  comRateio: boolean;
  baseTotal: number;
  filtro: { sub: string | null } | null;
  onAlternar: (s: string | null) => void;
  rotuloSub: (s: string | null) => string;
}) {
  const mostraRateio = comRateio && valor.rateio != null;
  const pctDoTotal = (v: number) => (baseTotal !== 0 ? (v / baseTotal) * 100 : null);
  /* `presente = false` = o subcentro não tem linha daquele tipo: "—", que é ausência, e não 0,00 (sentinela da casa). */
  const cel = (v: number, presente = true) => (
    <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', presente && corDoSinal(v, valor.saida),
      !presente && 'text-muted-foreground')}>{presente ? formatNum(v, 2) : '—'}</td>
  );
  return (
    <div className="mb-2 mt-1 overflow-hidden rounded-md border" data-testid="quadro-subcentro">
      <div className="flex items-baseline gap-2 bg-[#E8E6DF] px-2 py-[3px] text-[10px] font-semibold">
        Por subcentro
        <span className="ml-auto font-normal text-muted-foreground">
          clique numa linha para filtrar a lista · clique de novo para ver todos
        </span>
      </div>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col />
          <col style={{ width: 110 }} />
          {mostraRateio && <col style={{ width: 110 }} />}
          <col style={{ width: 120 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead><tr>
          <th className={cn(TH_C, 'static hover:bg-card')}>Subcentro</th>
          <th className={cn(TH_C, 'static hover:bg-card')}>Direto</th>
          {/* O rótulo é o selo do próprio modal: "Rateio adm." (pecuária, admin) ou "Rateio" (pool da lavoura). */}
          {mostraRateio && <th className={cn(TH_C, 'static hover:bg-card')}>{valor.seloRateio.charAt(0).toUpperCase() + valor.seloRateio.slice(1)}</th>}
          <th className={cn(TH_C, 'static hover:bg-card')}>Total</th>
          <th className={cn(TH_C, 'static hover:bg-card')}>{valor.rotuloUnidade}</th>
          <th className={cn(TH_C, 'static hover:bg-card')}>%</th>
          <th className={cn(TH_C, 'static hover:bg-card')} />
        </tr></thead>
        <tbody>
          {quadro.linhas.map((q, i) => {
            const total = mostraRateio ? q.total : q.direto;
            const p = pctDoTotal(total);
            const ativo = !!filtro && filtro.sub === q.subcentro;
            return (
              <tr key={q.subcentro ?? '__sem__'} onClick={() => onAlternar(q.subcentro)} data-testid="linha-quadro"
                title={ativo ? 'clique para ver todos' : 'clique para filtrar a lista'}
                className={cn('cursor-pointer border-t border-slate-100 hover:bg-primary/[0.06]',
                  ativo ? 'bg-[#dfe8f3] font-semibold' : i % 2 === 1 && 'bg-[#F5F4F0]')}>
                <td className={cn(TD, QUEBRA)}>{rotuloSub(q.subcentro)}</td>
                {cel(q.direto, q.nDireto > 0)}
                {mostraRateio && cel(q.rateio, q.nRateio > 0)}
                {cel(total)}
                <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{valor.porUnidadeNum(total)}</td>
                <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{p == null ? '—' : `${formatNum(p, 1)}%`}</td>
                <td className={TD}>
                  <div className="h-[5px] overflow-hidden rounded bg-slate-200">
                    <i className="block h-full bg-slate-400" style={{ width: `${Math.max(0, Math.min(100, p ?? 0))}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="border-t bg-[#D6D4CC] font-semibold" data-testid="total-quadro">
            <td className={TD}>Total do grupo</td>
            {cel(quadro.direto)}
            {mostraRateio && cel(quadro.rateio)}
            {cel(mostraRateio ? quadro.total : quadro.direto)}
            <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>
              {valor.porUnidadeNum(mostraRateio ? quadro.total : quadro.direto)}
            </td>
            <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>
              {baseTotal !== 0 ? `${formatNum(((mostraRateio ? quadro.total : quadro.direto) / baseTotal) * 100, 1)}%` : '—'}
            </td>
            <td className={TD} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const moedaOuTraco = (v: number | null) => (v == null ? '—' : formatMoeda(v));
const corValor = (v: number) => (v < 0 ? 'text-destructive' : undefined);

export function ModalValorDre({
  aberto, onFechar, valor, carregando, comRateioInicial, abaInicial = 'lancamentos', onAbrirLancamento,
}: {
  aberto: boolean;
  onFechar: () => void;
  valor: ValorDre | null;
  carregando?: boolean;
  /** O estado do botão da grade no clique — o modal nasce ecoando a célula. */
  comRateioInicial: boolean;
  abaInicial?: 'lancamentos' | 'rateio';
  onAbrirLancamento?: (id: string) => void;
}) {
  const [aba, setAba] = useState<'lancamentos' | 'rateio'>(abaInicial);
  const [comRateioEscolha, setComRateio] = useState(comRateioInicial);
  /* A visão da aba Rateio no administrativo — DRE-RATEIO-MODAL-01. Nasce no Resumo. */
  const [visaoRateio, setVisaoRateio] = useState<VisaoRateio>('resumo');
  const semDireto = valor?.direto == null;
  const semRateio = valor?.rateio == null;
  /* ⚠ SEM PARTE DIRETA, SÓ HÁ RATEIO A MOSTRAR; SEM RATEIO, SÓ O DIRETO. O segmentado fica, travado. */
  const comRateio = semDireto ? true : semRateio ? false : comRateioEscolha;
  const linhas = useMemo(
    () => (valor?.linhas ?? []).filter(l => comRateio || l.rateioPct == null), [valor, comRateio]);
  /* O quadro "Por subcentro" agrupa AS MESMAS linhas da lista (DRE-MODAL-SUBCENTRO-01). Relido junto com elas
     depois de salvar um lançamento pelo modal (DRE-MODAL-REFRESH-01). */
  const quadro = useMemo(() => quadroPorSubcentro(linhas), [linhas]);
  /* O filtro por subcentro: `null` = todos. O subcentro nulo é um valor de filtro de verdade, por isso o objeto. */
  const [filtro, setFiltro] = useState<{ sub: string | null } | null>(null);
  /* Se o subcentro filtrado sumir (salvar um lançamento o tirou do grupo, ou o modo "Direto" o escondeu), volta a
     todos — um filtro vazio pareceria "nenhum lançamento". */
  useEffect(() => {
    if (filtro && !quadro.linhas.some(q => q.subcentro === filtro.sub)) setFiltro(null);
  }, [filtro, quadro]);
  const linhasDaLista = useMemo(
    () => (filtro ? linhas.filter(l => l.subcentro === filtro.sub) : linhas), [linhas, filtro]);
  const ord = useOrdenacaoTabela(linhasDaLista, COLUNAS_VALOR_DRE, { coluna: 'comp', direcao: 'desc' });
  const soma = useMemo(() => linhasDaLista.reduce((a, l) => a + l.valor, 0), [linhasDaLista]);
  const nRateio = linhasDaLista.filter(l => l.rateioPct != null).length;
  if (!valor) return null;
  const rotuloSub = (s: string | null) => s ?? ROTULO_SEM_SUBCENTRO;
  const alternarFiltro = (s: string | null) => setFiltro(f => (f && f.sub === s ? null : { sub: s }));
  const total = (valor.direto ?? 0) + (valor.rateio ?? 0);
  const mostrado = comRateio ? total : (valor.direto ?? 0);
  const pct = (v: number | null) => (v == null || total === 0 ? '' : ` · ${formatNum((v / total) * 100, 0)}%`);
  const encontro = valor.encontro;
  const temEtapas = valor.etapas.length > 0 || !!encontro;

  let corpo: ReactNode;
  if (aba === 'rateio' && encontro) {
    corpo = <RateioEncontro encontro={encontro} visao={visaoRateio} />;
  } else if (aba === 'rateio') {
    corpo = (
      <table className="w-full table-fixed border-collapse">
        <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>
        <thead><tr>
          <th className={cn(TH, 'text-left hover:bg-card')}>Etapa</th>
          <th className={cn(TH, 'text-right hover:bg-card')}>Base</th>
          <th className={cn(TH, 'text-right hover:bg-card')}>%</th>
          <th className={cn(TH, 'text-right hover:bg-card')}>Valor</th>
        </tr></thead>
        <tbody>
          {valor.etapas.map((e, i) => (
            <tr key={e.chave} className={cn('border-t border-slate-100',
              e.nivel === 1 && i % 2 === 1 && 'bg-muted/30', e.destaque && 'font-semibold')}>
              <td className={cn(TD, 'truncate')} style={{ paddingLeft: e.nivel === 1 ? 22 : 8 }} title={e.etapa}>{e.etapa}</td>
              <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>{e.base}</td>
              <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums')}>
                {e.pct == null ? '—' : `${formatNum(e.pct, 1)}%`}
              </td>
              <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', e.valor != null && corValor(e.valor))}>
                {e.valor == null ? '—' : formatNum(e.valor, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else {
    corpo = (
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {COLUNAS_VALOR_DRE.map(c => <col key={c.coluna} style={c.w ? { width: c.w } : undefined} />)}
          <col style={{ width: W_LAPIS }} />
        </colgroup>
        <thead><tr>
          {COLUNAS_VALOR_DRE.map(c => (
            <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h} ordem={ord.ordem} onOrdenar={ord.alternar}
              className={TH_C} alinhaDireita={c.direita}
              extra={c.coluna === 'descricao' && filtro ? (
                <button type="button" onClick={() => setFiltro(null)} title="voltar a todos os subcentros"
                  data-testid="selo-filtro-subcentro"
                  className="ml-1.5 inline-flex max-w-full items-center gap-1 rounded-[9px] bg-[#dfe8f3] px-1.5 text-[9.5px] font-medium normal-case leading-[14px] text-primary">
                  <span className={QUEBRA}>{rotuloSub(filtro.sub)}</span><X className="h-2.5 w-2.5 shrink-0" />
                </button>
              ) : undefined} />
          ))}
          <th className={cn(TH, 'hover:bg-card')} />
        </tr></thead>
        <tbody>
          {carregando && (
            <tr><td colSpan={COLUNAS_VALOR_DRE.length + 1} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </td></tr>
          )}
          {!carregando && ord.ordenadas.length === 0 && (
            <tr><td colSpan={COLUNAS_VALOR_DRE.length + 1} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
              Nenhum lançamento neste recorte.
            </td></tr>
          )}
          {!carregando && ord.ordenadas.map((l, i) => {
            const abrir = l.idEditavel && onAbrirLancamento ? () => onAbrirLancamento(l.idEditavel ?? '') : undefined;
            return (
              <tr key={l.chave} onClick={abrir} title={abrir ? 'abrir o lançamento no Financeiro' : undefined}
                className={cn('border-t border-slate-100',
                  l.rateioPct != null ? 'bg-[#fbfaf6]' : i % 2 === 1 && 'bg-muted/30',
                  abrir && 'cursor-pointer hover:bg-primary/[0.06]')}>
                <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{dataBR(l.competencia)}</td>
                <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{dataBR(l.pagamento)}</td>
                <td className={TD}>
                  <div className="flex min-w-0 flex-wrap items-center">
                    <span className={cn('min-w-0', QUEBRA)}>{l.descricao || '—'}</span>
                    {l.rateioPct != null && (
                      <span className={SELO}>{valor.seloRateio} {formatNum(l.rateioPct, 1)}%</span>
                    )}
                  </div>
                </td>
                <td className={cn(TD, QUEBRA)}>{rotuloSub(l.subcentro)}</td>
                <td className={cn(TD, QUEBRA, 'text-muted-foreground')}>{l.favorecido || '—'}</td>
                <td className={cn(TD, QUEBRA)}>{l.fazenda || '—'}</td>
                <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums', corDoSinal(l.valor, valor.saida))}>{formatNum(l.valor, 2)}</td>
                <td className={TD}><Status s={l.status} /></td>
                <td className={cn(TD, 'text-center')}>
                  <Pencil className={cn('inline h-3 w-3 text-muted-foreground', !abrir && 'invisible')} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA (lei de estabilidade): trocar de aba ou de segmentado não mexe no modal. Um
          scrollport só — o corpo; cabeçalho, barra, cartões e rodapé ficam (A21). */}
      <DialogContent className="flex h-[min(640px,calc(100vh-64px))] max-w-[980px] flex-col gap-0 overflow-hidden p-0
        [&>button.absolute]:hidden">
        <div className="flex shrink-0 items-start gap-3 bg-primary px-3.5 py-2 text-primary-foreground">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-tight">
              {valor.titulo} · <span className="whitespace-nowrap tabular-nums">{formatMoeda(mostrado)}</span>
              {' · '}<span className="whitespace-nowrap tabular-nums">{valor.porUnidade(mostrado)}</span>
            </h2>
            <div className="mt-0.5 truncate text-[10px] text-primary-foreground/80" title={valor.contexto}>{valor.contexto}</div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 border-b bg-muted/40 px-3.5 py-1.5">
          <Segmentado altura={22} valor={aba} onEscolher={setAba} opcoes={[
            { valor: 'lancamentos', rotulo: 'Lançamentos' },
            { valor: 'rateio', rotulo: 'Rateio', desabilitada: !temEtapas,
              title: temEtapas ? undefined : 'sem rateio neste recorte' },
          ]} />
          {/* ⚠ O SEGUNDO SEGMENTADO SÓ SE ESCONDE (invisível) na aba Rateio: sumir moveria a barra.
              ⚠ NO ADMINISTRATIVO, o "Resumo | Mês a mês" ocupa O MESMO LUGAR, por cima (posição absoluta): a barra
              não muda de altura nem empurra nada — DRE-RATEIO-MODAL-01. */}
          <span className="relative">
            <span className={cn(aba === 'rateio' && 'invisible')}>
              <Segmentado altura={22} valor={comRateio ? 'com' : 'direto'} onEscolher={v => setComRateio(v === 'com')} opcoes={[
                { valor: 'direto', rotulo: valor.rotuloDireto, desabilitada: semDireto || semRateio,
                  title: semDireto ? 'esta linha não tem parte direta' : semRateio ? 'esta linha não tem rateio' : undefined },
                { valor: 'com', rotulo: `Com ${valor.seloRateio}`, desabilitada: semDireto || semRateio },
              ]} />
            </span>
            {aba === 'rateio' && encontro && (
              <span className="absolute left-0 top-0" data-testid="visao-rateio">
                <Segmentado altura={22} valor={visaoRateio} onEscolher={setVisaoRateio} opcoes={[
                  { valor: 'resumo', rotulo: 'Resumo' },
                  { valor: 'mes', rotulo: 'Mês a mês' },
                ]} />
              </span>
            )}
          </span>
          <span className={cn('ml-auto text-[10px] text-muted-foreground', aba === 'rateio' && 'invisible')}>
            clique na linha abre no Financeiro
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2 px-3.5 py-2">
          <Cartao rotulo={valor.rotuloDireto} valor={moedaOuTraco(valor.direto)} cor={corDoSinal(valor.direto, valor.saida)}
            sub={valor.direto == null ? '—' : `${valor.porUnidade(valor.direto)}${pct(valor.direto)}`} />
          <Cartao rotulo={valor.rotuloRateio} valor={moedaOuTraco(valor.rateio)} cor={corDoSinal(valor.rateio, valor.saida)}
            sub={valor.rateio == null ? '—' : `${valor.porUnidade(valor.rateio)}${pct(valor.rateio)}`} />
          <Cartao total rotulo="Total do grupo" valor={formatMoeda(total)} sub={valor.porUnidade(total)} cor={corDoSinal(total, valor.saida)} />
        </div>

        {/* ⚠ O QUADRO MORA DENTRO DO MESMO SCROLLPORT DA LISTA (um só por tela): rola junto, e o cabeçalho da lista
            gruda no topo quando chega lá. */}
        {/* No encontro de contas quem rola, se as linhas não couberem, é a tabela de dentro (cabeçalho e total fixos). A caixa
            só rola em janela BAIXA (a tabela de dentro tem piso de duas linhas; medido: a 579 de altura não rola). */}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5', aba === 'rateio' && encontro && 'flex flex-col pb-1.5')}
          data-testid="corpo-do-modal">
          {aba === 'lancamentos' && !carregando && quadro.linhas.length > 0 && (
            <QuadroSubcentro quadro={quadro} valor={valor} comRateio={comRateio} baseTotal={mostrado}
              filtro={filtro} onAlternar={alternarFiltro} rotuloSub={rotuloSub} />
          )}
          {corpo}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/40 px-3.5 py-1.5 text-[11px]">
          {aba === 'rateio' ? (
            <>
              <span className="min-w-0 truncate" title={valor.rodapeRateio}>{valor.rodapeRateio}</span>
              <b className="whitespace-nowrap text-[12px] tabular-nums">{moedaOuTraco(valor.rateio)}</b>
            </>
          ) : (
            <>
              <span data-testid="rodape-lista">
                {ord.ordenadas.length} lançamento{ord.ordenadas.length === 1 ? '' : 's'}
                {filtro
                  ? ` em “${rotuloSub(filtro.sub)}” · de ${linhas.length} no grupo`
                  : nRateio > 0 ? ` · ${nRateio} de ${valor.seloRateio}` : ''}
              </span>
              <b className={cn('whitespace-nowrap text-[12px] tabular-nums', corDoSinal(soma, valor.saida))}>{formatMoeda(soma)}</b>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
