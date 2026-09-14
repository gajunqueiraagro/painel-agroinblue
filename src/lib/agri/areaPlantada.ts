/**
 * A ÁREA PLANTADA DE UM PASTO NUMA SAFRA — AGRI-AREA-PLANTADA-01.
 *
 * ⚠ É AQUI QUE A CULTURA MORA, e não na safra. O AGRI-CADASTRO-SAFRA-01 tirou a cultura do
 * cadastro de safra justamente para ela vir parar neste lugar: a safra é o PERÍODO ("25/26
 * Lavoura") e a cultura é o que se plantou EM CADA TALHÃO. Amendoim e milho na mesma
 * temporada são duas áreas plantadas do mesmo pasto, não duas safras.
 * ⚠ O BANCO JÁ DIZ ISSO: `agri_safra_area` tem UNIQUE (safra_id, pasto_id, cultura, variedade)
 * — a safrinha é prevista por construção, e é por isso que a tela é uma LISTA e não um
 * formulário de um registro só. A `variedade` entrou na chave depois, e com ela o pasto passou
 * a comportar dois cultivares da MESMA cultura: OL3 e BRS 421 lado a lado.
 * ⚠ SÓ REGRA PURA AQUI. Nada de React nem de Supabase: o que este módulo sabe é o que torna
 * uma linha gravável, e é o que os testes cobrem.
 */
import { CULTURAS, type Cultura } from './culturas';
import { parseNumericValue } from '@/lib/calculos/abate';

/**
 * As culturas que a área plantada aceita.
 *
 * ⚠ SÃO AS SEIS DA LIB, e elas batem com o CHECK da tabela — conferido no `pg_constraint` em
 * 11/09/2026: `amendoim, mandioca, milho, soja, cana, eucalipto, outras`.
 * ⚠ O CHECK ADMITE `eucalipto` E ESTA LISTA NÃO, de propósito: eucalipto é SILVICULTURA, uma
 * família própria de `tipo_uso` (decisão de 19/08/2026 registrada em `tiposUso.ts`), não um
 * destino dentro da lavoura. Quando a silvicultura ganhar a porta dela, o banco já a espera —
 * o que não se faz é oferecê-la no painel do pasto agrícola e misturar as duas contas.
 */
export const CULTURAS_AREA: readonly Cultura[] = CULTURAS;

/* ───────────────────────────────────────────────────────────────────────────────
   O ESTADO DA ÁREA — AGRI-AREA-ABERTURA-01.

   ⚠ "EM ABERTURA" É ÁREA QUE AINDA NÃO PLANTOU, e existe para a tela parar de pedir o que
   não existe. O P5 está em abertura desde fev/2026 para plantar em out/2026: não há data de
   plantio, variedade, densidade nem colheita, e um formulário que insiste faz o operador
   inventar dado ou desistir. A casa não inventa dado.
   ⚠ O ESTADO NÃO MUDA CONTA NENHUMA. Em abertura, o que se gasta é FORMAÇÃO DE ÁREA, que já
   é investimento pelo grupo de conta, e o DRE já o põe abaixo da linha de resultado
   (AGRI-04C). Este campo é cadastro e apresentação — a RPC não o lê, e não deve.
   ⚠ VIRAR PARA "PLANTADA" NÃO REDIGITA NADA: safra, cultura e hectares já estão lá; o que
   aparece são os campos que faltavam.
   ─────────────────────────────────────────────────────────────────────────────── */

export type StatusArea = 'abertura' | 'plantada';

export const STATUS_AREA = [
  { valor: 'abertura', rotulo: 'Em abertura' },
  { valor: 'plantada', rotulo: 'Plantada' },
] as const;

/** O default do banco é `plantada`, e o da tela é o mesmo — um não pode discordar do outro. */
export const STATUS_AREA_PADRAO: StatusArea = 'plantada';

export function ehAbertura(status: string | null | undefined): boolean {
  return (status || '').trim() === 'abertura';
}

/**
 * A frase que ensina, aprovada pelo Gabriel em 12/09/2026.
 *
 * ⚠ ELA DIZ O QUE MUDA NO DINHEIRO, não o que muda na tela. "Em abertura" sem explicação
 * parece um rótulo administrativo; o que o operador precisa saber é que ali o gasto é
 * investimento e não entra no custo da safra — e quando isso passa a valer.
 */
export const AVISO_ABERTURA =
  'Em abertura — aqui entra só investimento de formação de área; não vira custo da safra. '
  + 'O custeio começa quando você marcar Plantada.';

/** Uma linha da lista, como a tela a edita — tudo texto, porque campo é texto. */
export interface AreaPlantadaForm {
  /** Vazio numa linha nova que ainda não foi gravada. */
  id: string | null;
  cultura: string;
  /**
   * A VARIEDADE — AGRI-AREA-CAMPO-VARIEDADE.
   *
   * ⚠ OPCIONAL, E É O BANCO QUE GUARDA A REGRA: a chave é
   * `UNIQUE NULLS NOT DISTINCT (safra, pasto, cultura, variedade)`, então dois "amendoim sem
   * variedade" no mesmo pasto colidem e dois com variedades diferentes passam. O front não
   * repete essa conta — ele traduz a recusa.
   * ⚠ TEXTO LIVRE: não existe lista de variedades no repo (procurado; só há a menção num
   * comentário de `AGRI-AREA-ABERTURA-01`). Inventar um enum aqui fixaria em código os
   * cultivares que o produtor compra por safra.
   */
  variedade: string;
  /** 'abertura' | 'plantada' — AGRI-AREA-ABERTURA-01. */
  status: string;
  /** Texto digitado, em pt-BR ("96,4"). */
  areaHa: string;
  dataPlantio: string;
  dataColheitaPrevista: string;
}

/** O que vai ao banco depois de validado. */
export interface AreaPlantadaPayload {
  cultura: string;
  variedade: string | null;
  status: string;
  area_plantada_ha: number;
  data_plantio: string | null;
  data_colheita_prevista: string | null;
}

/**
 * ⚠ UM OBJETO SÓ, NÃO UMA UNIÃO DISCRIMINADA — e a razão é medida, não estética: este projeto
 * compila com `strict: false`, e sem `strictNullChecks` o TypeScript NÃO estreita
 * `{ok:true;payload} | {ok:false;erro}` pelo `if (!v.ok)`. As duas entradas de baseline em
 * `safrasHelpers.ts` e `FinV2SafrasTab.tsx` ("Property 'erro' does not exist on type…") são
 * exatamente isso, e escrever a união aqui acrescentaria a terceira.
 * ⚠ O PREÇO É O `payload` OPCIONAL, e o chamador o paga com um `if (!v.ok || !v.payload)` —
 * barato, e explícito sobre o que o modo lenient não garante.
 */
export interface ValidacaoArea {
  ok: boolean;
  erro?: string;
  payload?: AreaPlantadaPayload;
}

const CULTURAS_VALIDAS = new Set(CULTURAS_AREA.map((c) => c.valor));

/**
 * ⚠ `parseNumericValue`, NUNCA `Number()`: o campo guarda o que o operador digitou, em pt-BR.
 * `Number('96,4')` é `NaN`, que vira 0 e grava um talhão sem área — e o CHECK do banco
 * (`area_plantada_ha > 0`) recusaria com uma mensagem que a tela não sabe traduzir.
 */
export function validarAreaPlantada(form: AreaPlantadaForm, areaDoPastoHa?: number | null): ValidacaoArea {
  const cultura = (form.cultura || '').trim();
  if (!cultura) return { ok: false, erro: 'Escolha a cultura.' };
  if (!CULTURAS_VALIDAS.has(cultura)) return { ok: false, erro: 'Cultura fora da lista.' };

  const area = parseNumericValue(form.areaHa);
  if (!(area > 0)) return { ok: false, erro: 'Informe a área plantada em hectares.' };

  /**
   * ⚠ MAIOR QUE O PASTO É ERRO, e é o engano que a sugestão automática torna provável: a linha
   * nasce com a área produtiva do pasto e, ao acrescentar a SEGUNDA cultura, somam-se dois
   * talhões inteiros num pasto que só tem um. O banco não pega isto — o CHECK dele só exige
   * área positiva.
   * ⚠ TOLERÂNCIA DE UM CENTÉSIMO, porque a área do pasto tem uma casa decimal e a soma de duas
   * culturas arredondadas pode passar por um fio do que o cadastro guarda.
   */
  if (areaDoPastoHa != null && areaDoPastoHa > 0 && area > areaDoPastoHa + 0.01) {
    return { ok: false, erro: `A área plantada (${area} ha) é maior que a área do pasto (${areaDoPastoHa} ha).` };
  }

  /**
   * ⚠ EM ABERTURA, AS DATAS SAEM DO PAYLOAD — AGRI-AREA-ABERTURA-01. A área que ainda não
   * plantou não tem plantio nem colheita, e o que a tela esconde ela não pode continuar
   * gravando por baixo: "a definir" é ausência declarada, não um valor guardado fora de vista.
   */
  const emAbertura = ehAbertura(form.status);
  /* ⚠ EM ABERTURA A VARIEDADE SAI DO PAYLOAD, como as datas: o P5 não plantou, e o cultivar
     escolhido é justamente uma das coisas que ainda não existem. O que a tela esconde ela não
     pode continuar gravando por baixo. */
  const plantio = emAbertura ? null : ((form.dataPlantio || '').trim() || null);
  const colheita = emAbertura ? null : ((form.dataColheitaPrevista || '').trim() || null);
  /* Mesma regra do cadastro de safra: fim antes do início é engano de digitação, e uma data
     sozinha é dado incompleto, não inválido. */
  if (plantio && colheita && colheita < plantio) {
    return { ok: false, erro: 'A colheita prevista não pode ser anterior ao plantio.' };
  }

  return {
    ok: true,
    payload: {
      cultura,
      /* Branco vira NULL, e o `NULLS NOT DISTINCT` da chave faz dois nulos colidirem — que é
         exatamente o bloqueio que se quer para duas linhas da mesma cultura sem variedade. */
      variedade: emAbertura ? null : ((form.variedade || '').trim() || null),
      /* O estado desconhecido cai no default do banco, nunca num terceiro valor: o CHECK só
         admite dois, e inventar um terceiro seria trocar um erro de tela por um 23514. */
      status: emAbertura ? 'abertura' : STATUS_AREA_PADRAO,
      area_plantada_ha: area,
      data_plantio: plantio,
      data_colheita_prevista: colheita,
    },
  };
}

/** O que a chave do banco recusaria, e QUAL das três recusas é — cada uma tem uma saída
 *  diferente para o operador, e uma mensagem só serviria mal às três. */
export interface ColisaoArea {
  /** A cultura repetida. */
  cultura: string;
  /**
   * `duplicata` — mesma cultura E mesma variedade: é a mesma área digitada duas vezes.
   * `sem-variedade` — mesma cultura, e pelo menos duas sem cultivar informado.
   * `abertura` — mesma cultura em duas linhas EM ABERTURA. Parece o caso acima e NÃO é:
   *   ali o operador digita a variedade e resolve; aqui o campo nem existe na tela.
   */
  motivo: 'duplicata' | 'sem-variedade' | 'abertura';
  /** Só no `duplicata`: o cultivar que repetiu, para a mensagem poder nomeá-lo. */
  variedade?: string;
}

/**
 * A LINHA REPETIDA NA MESMA SAFRA — o que o UNIQUE do banco recusaria.
 *
 * ⚠ AVISAR ANTES, NÃO DEPOIS: sem isto o operador preenche a segunda linha inteira e leva um
 * 23505 no Salvar, com a tela sem saber qual das linhas causou. É a mesma decisão do aviso de
 * código repetido no cadastro de safra.
 *
 * ⚠⚠ A IDENTIDADE É CULTURA + VARIEDADE, NÃO CULTURA. Esta função nasceu quando a chave era
 * (safra, pasto, cultura) e ficou para trás quando a `variedade` entrou nela: o banco passou a
 * aceitar OL3 e BRS 421 no mesmo pasto, e era o FRONT que recusava — o operador via a faixa
 * âmbar e a segunda área não persistia, por uma regra que só existia aqui. Medido no Proto em
 * 14/09/2026: `UNIQUE NULLS NOT DISTINCT (safra_id, pasto_id, cultura, variedade)`.
 *
 * ⚠ O `NULLS NOT DISTINCT` É A PARTE QUE SURPREENDE, e é por isso que "sem variedade" continua
 * sendo colisão. No Postgres, por padrão, dois NULLs NÃO colidem numa UNIQUE — seriam duas
 * linhas válidas. Com `NULLS NOT DISTINCT` eles colidem, e duas áreas de amendoim sem cultivar
 * viram a mesma chave. O front não escolhe isso: ele espelha.
 *
 * ⚠ E ABERTURA É CASO PRÓPRIO, não um "sem variedade" mais preguiçoso. `validarAreaPlantada`
 * força `variedade: null` em abertura, e o painel ESCONDE o campo — então "informe o cultivar"
 * mandaria o operador preencher algo que a tela não mostra. A saída dele é outra: uma linha só,
 * ou marcar como plantada a que já foi.
 */
export function colisaoDeArea(linhas: readonly AreaPlantadaForm[]): ColisaoArea | null {
  /* ⚠ A CHAVE COMPARADA É A QUE VAI AO BANCO, não a que está no formulário: em abertura a
     variedade é descartada no payload, então ela vale vazio aqui também. Comparar o que o
     operador digitou faria a tela liberar um par que o banco recusaria — que é o defeito
     inverso do que este PR conserta, e o pior dos dois: falha só no Salvar. */
  const chave = (l: AreaPlantadaForm) =>
    ehAbertura(l.status) ? '' : (l.variedade || '').trim().toLowerCase();

  const porCultura = new Map<string, AreaPlantadaForm[]>();
  for (const l of linhas) {
    const c = (l.cultura || '').trim();
    if (!c) continue;
    const g = porCultura.get(c);
    if (g) g.push(l); else porCultura.set(c, [l]);
  }

  for (const [cultura, grupo] of porCultura) {
    if (grupo.length < 2) continue;
    const vistas = new Set<string>();
    for (const l of grupo) {
      const v = chave(l);
      if (!vistas.has(v)) { vistas.add(v); continue; }
      /* ⚠ A ORDEM DOS TESTES IMPORTA: uma linha em abertura tem chave vazia, e sem esta
         checagem ela cairia em `sem-variedade` e receberia um conselho impossível de seguir. */
      if (ehAbertura(l.status) || grupo.some(g => ehAbertura(g.status) && chave(g) === v)) {
        return { cultura, motivo: 'abertura' };
      }
      if (!v) return { cultura, motivo: 'sem-variedade' };
      return { cultura, motivo: 'duplicata', variedade: (l.variedade || '').trim() };
    }
  }
  return null;
}

/**
 * A FRASE DA COLISÃO — uma fonte só para a faixa âmbar e para o toast do Salvar.
 *
 * ⚠ CADA MOTIVO TEM UMA SAÍDA DIFERENTE, e a frase tem de dizer QUAL: "aparece duas vezes" sem
 * o que fazer é o aviso que o operador lê três vezes e ignora na quarta. A redação antiga
 * afirmava "o banco guarda uma linha por cultura em cada safra" — uma regra que não existe mais,
 * e que mandava somar duas áreas que são legitimamente distintas.
 */
export function textoDaColisao(c: ColisaoArea): string {
  const nome = labelDaCultura(c.cultura);
  if (c.motivo === 'duplicata') {
    return `${nome} "${c.variedade}" aparece duas vezes. Duas áreas da mesma cultura convivem no `
      + `pasto quando têm variedades diferentes — troque a variedade de uma ou some as duas áreas.`;
  }
  if (c.motivo === 'sem-variedade') {
    return `${nome} aparece duas vezes sem variedade. Informe o cultivar de cada uma `
      + `(OL3, BRS 421…) para as duas áreas se distinguirem.`;
  }
  /* ⚠ NÃO DIZ "as duas em abertura": BASTA UMA. Uma linha em abertura tem a variedade
     descartada, então ela colide com a linha da mesma cultura que também está sem cultivar —
     e afirmar que ambas estão em abertura mandaria o operador procurar um estado que uma
     delas não tem. */
  return `${nome} tem duas áreas que o sistema não consegue distinguir: área em abertura não `
    + `guarda cultivar. Deixe uma só enquanto não plantar, ou marque como plantada a que já foi `
    + `e informe a variedade dela.`;
}

/** A soma das áreas digitadas — o número que o painel mostra ao lado da área do pasto. */
export function somaAreas(linhas: readonly AreaPlantadaForm[]): number {
  return linhas.reduce((s, l) => s + parseNumericValue(l.areaHa), 0);
}

/** O rótulo da cultura para exibição; devolve o próprio valor se ele não estiver na lista. */
export function labelDaCultura(valor: string | null | undefined): string {
  if (!valor) return '—';
  return CULTURAS_AREA.find((c) => c.valor === valor)?.label ?? valor;
}

/* ───────────────────────────────────────────────────────────────────────────────
   A SAFRA QUE COBRE O MÊS — AGRI-AREA-POR-SAFRA-01.

   ⚠ LAVOURA NÃO SE APONTA POR MÊS. O pasto de gado tem contagem mensal; o talhão tem uma
   área plantada que vale da semeadura à colheita — a janela INTEIRA da safra. O dado já era
   assim (`agri_safra_area` não tem coluna de mês); quem amarrava ao mês era a tela.
   ⚠ E O DEFEITO REAL ERA OUTRO, medido no proto em 11/09/2026: o painel abria na PRIMEIRA
   safra da lista, e como as sete safras de lavoura do NJ têm `ordem_exibicao = 0`, o
   desempate por nome punha "Safra 23/24 Amendoim" na frente. A área gravada em 25/26 não
   aparecia em mês nenhum — nem no mês em que foi salva. O mês era inocente; a escolha
   inicial é que estava errada.
   ─────────────────────────────────────────────────────────────────────────────── */

/** O mínimo que se precisa de uma safra para saber se ela cobre um mês. */
export interface SafraComJanela {
  id: string;
  data_inicio: string | null;
  data_fim: string | null;
}

/** `2025-10` → `2025-10-01`. O primeiro dia é o que se compara com a janela. */
export function primeiroDiaDoMes(anoMes: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec((anoMes || '').trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/**
 * TODAS as safras cuja janela contém o primeiro dia do mês, na ordem em que chegaram.
 *
 * ⚠ SÃO VÁRIAS, E ISSO É NORMAL: no NJ, 25/26-AMD, 25/26-Lav e 25/26-MAND cobrem exatamente
 * a mesma janela (jul/25 a jun/26) — são a mesma temporada com rótulos diferentes, herança de
 * quando a cultura morava no código da safra. Escolher UMA aqui seria escolher por elas; quem
 * escolhe é o operador no seletor, e o card soma as três.
 * ⚠ SAFRA SEM JANELA NÃO COBRE MÊS NENHUM. As anteriores ao backfill têm `data_inicio` nulo —
 * e é melhor não aparecer do que aparecer num mês adivinhado pelo código do rótulo.
 */
export function safrasQueCobremOMes<T extends SafraComJanela>(
  safras: readonly T[] | null | undefined,
  anoMes: string | null | undefined,
): T[] {
  const dia = primeiroDiaDoMes(anoMes);
  if (!dia) return [];
  return (safras ?? []).filter(s => !!s.data_inicio && !!s.data_fim && s.data_inicio <= dia && dia <= s.data_fim);
}

/**
 * A safra que o painel abre num mês.
 *
 * ⚠ A QUE JÁ TEM DADO DESTE PASTO VEM PRIMEIRO, e é a regra que resolve o empate das três
 * safras da mesma janela: se o operador plantou em 25/26-Lav, é essa que ele quer ver ao
 * reabrir — não a primeira da lista alfabética. Sem isso, editar vira recadastrar.
 * ⚠ SEM NENHUMA COBRINDO O MÊS, devolve null: o painel diz que não há safra para aquele mês
 * em vez de abrir numa safra de outro ano e convidar a gravar no lugar errado.
 */
export function safraInicialDoMes<T extends SafraComJanela>(
  safras: readonly T[] | null | undefined,
  anoMes: string | null | undefined,
  safrasComDados?: ReadonlySet<string> | null,
): T | null {
  const cobrem = safrasQueCobremOMes(safras, anoMes);
  if (cobrem.length === 0) return null;
  const comDado = safrasComDados && safrasComDados.size > 0
    ? cobrem.find(s => safrasComDados.has(s.id))
    : undefined;
  return comDado ?? cobrem[0];
}

