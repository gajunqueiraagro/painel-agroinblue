/**
 * A ÁREA PLANTADA DE UM PASTO NUMA SAFRA — AGRI-AREA-PLANTADA-01.
 *
 * ⚠ É AQUI QUE A CULTURA MORA, e não na safra. O AGRI-CADASTRO-SAFRA-01 tirou a cultura do
 * cadastro de safra justamente para ela vir parar neste lugar: a safra é o PERÍODO ("25/26
 * Lavoura") e a cultura é o que se plantou EM CADA TALHÃO. Amendoim e milho na mesma
 * temporada são duas áreas plantadas do mesmo pasto, não duas safras.
 * ⚠ O BANCO JÁ DIZ ISSO: `agri_safra_area` tem UNIQUE (safra_id, pasto_id, cultura) — a
 * safrinha é prevista por construção, e é por isso que a tela é uma LISTA e não um formulário
 * de um registro só.
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

/** Uma linha da lista, como a tela a edita — tudo texto, porque campo é texto. */
export interface AreaPlantadaForm {
  /** Vazio numa linha nova que ainda não foi gravada. */
  id: string | null;
  cultura: string;
  /** Texto digitado, em pt-BR ("96,4"). */
  areaHa: string;
  dataPlantio: string;
  dataColheitaPrevista: string;
}

/** O que vai ao banco depois de validado. */
export interface AreaPlantadaPayload {
  cultura: string;
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

  const plantio = (form.dataPlantio || '').trim() || null;
  const colheita = (form.dataColheitaPrevista || '').trim() || null;
  /* Mesma regra do cadastro de safra: fim antes do início é engano de digitação, e uma data
     sozinha é dado incompleto, não inválido. */
  if (plantio && colheita && colheita < plantio) {
    return { ok: false, erro: 'A colheita prevista não pode ser anterior ao plantio.' };
  }

  return {
    ok: true,
    payload: {
      cultura,
      area_plantada_ha: area,
      data_plantio: plantio,
      data_colheita_prevista: colheita,
    },
  };
}

/**
 * A CULTURA REPETIDA NA MESMA SAFRA — o que o UNIQUE do banco recusaria.
 *
 * ⚠ AVISAR ANTES, NÃO DEPOIS: sem isto o operador preenche a segunda linha inteira e leva um
 * 23505 no Salvar, com a tela sem saber qual das linhas causou. É a mesma decisão do aviso de
 * código repetido no cadastro de safra.
 */
export function culturaDuplicada(linhas: readonly AreaPlantadaForm[]): string | null {
  const vistas = new Set<string>();
  for (const l of linhas) {
    const c = (l.cultura || '').trim();
    if (!c) continue;
    if (vistas.has(c)) return c;
    vistas.add(c);
  }
  return null;
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
