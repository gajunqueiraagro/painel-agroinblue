/**
 * CUSTO DIRETO OU COMPARTILHADO — AGRI-MODAL-CULTURA-01.
 *
 * ⚠ O CAMPO VAZIO É UMA ESCOLHA, NÃO UMA FALTA. `cultura`/`fase` em branco significa
 * "compartilhado": o custo rateia entre as culturas da safra (por área) ou entre as fases
 * (por percentual declarado). Preenchido significa "direto": vai inteiro para aquela cultura
 * ou fase. Como as duas leituras são legítimas, a tela tem de DIZER qual está valendo — um
 * campo opcional em silêncio faria o operador descobrir a diferença no DRE, meses depois.
 * ⚠ A REGRA MORA AQUI, e não no JSX, porque ela é a mesma nos dois eixos e vai ser a mesma na
 * Mesa no dia em que o apply souber gravar estas colunas.
 */
import { CULTURAS, type Cultura } from './culturas';

/** As fases da pecuária que a coluna `fase` aceita — o CHECK do banco tem estas três. */
export const FASES = [
  { valor: 'cria', label: 'Cria' },
  { valor: 'recria', label: 'Recria' },
  { valor: 'engorda', label: 'Engorda' },
] as const;

/**
 * As culturas oferecidas no lançamento de LAVOURA.
 *
 * ⚠ SÃO AS SEIS DA LAVOURA, e o CHECK do banco aceita SETE: `eucalipto` também passa. Ele
 * fica de fora aqui pelo mesmo motivo de `CULTURAS_AREA` — eucalipto é silvicultura, família
 * própria de `tipo_uso` desde 19/08/2026, e a atividade dele é outra pílula no card. Oferecê-lo
 * sob "Lavoura" produziria um custo de eucalipto dentro do DRE da lavoura.
 */
export const CULTURAS_LANCAMENTO: readonly Cultura[] = CULTURAS;

export const SEM_CULTURA = '__todas__';

/** O que a frase abaixo do campo diz, e de que cor. */
export interface AvisoRateio {
  texto: string;
  /** Classe de cor: verde para direto, âmbar para compartilhado. */
  classe: string;
}

/* As duas cores já existem no sistema: `text-success` é a do valor de entrada, e o âmbar 600
   é o do status `programado` — a cor de atenção da casa. Nenhuma cor nova. */
const VERDE = 'text-success';
const AMBAR = 'text-amber-600';

/**
 * A frase da CULTURA.
 *
 * ⚠ ELA NOMEIA ENTRE QUEM O RATEIO VAI ACONTECER quando as culturas da safra são conhecidas.
 * "Rateia entre as culturas da safra" é abstrato; "rateia entre Amendoim e Mandioca" é o que
 * o operador confere — e é o que denuncia uma safra que só tem uma cultura plantada, caso em
 * que ratear não muda nada.
 */
export function avisoCultura(
  cultura: string | null | undefined,
  culturasDaSafra?: readonly string[] | null,
): AvisoRateio {
  const escolhida = (cultura || '').trim();
  if (escolhida) {
    const label = CULTURAS_LANCAMENTO.find(c => c.valor === escolhida)?.label ?? escolhida;
    return { texto: `Custo direto de ${label} — não rateia.`, classe: VERDE };
  }
  const nomes = (culturasDaSafra ?? [])
    .map(v => CULTURAS_LANCAMENTO.find(c => c.valor === v)?.label ?? v);
  const entre = nomes.length > 0 ? nomes.join(' e ') : 'as culturas da safra';
  return { texto: `Compartilhado — rateia entre ${entre} no fechamento.`, classe: AMBAR };
}

/** A frase da FASE — mesmo par de leituras, outro eixo. */
export function avisoFase(fase: string | null | undefined): AvisoRateio {
  const escolhida = (fase || '').trim();
  if (escolhida) {
    const label = FASES.find(f => f.valor === escolhida)?.label ?? escolhida;
    return { texto: `Custo direto de ${label} — não rateia.`, classe: VERDE };
  }
  return { texto: 'Compartilhado — rateia entre as fases no fechamento.', classe: AMBAR };
}

/**
 * O QUE VAI NO PAYLOAD — e é aqui que o eixo errado se apaga.
 *
 * ⚠ UM CUSTO DE PECUÁRIA NÃO TEM CULTURA, e vice-versa. Se o operador escolhe Amendoim e
 * depois troca a atividade para Pecuária, a cultura tem de sair: deixá-la gravada produziria
 * um lançamento que aparece como custo direto de amendoim no DRE da lavoura sem nunca ter
 * sido da lavoura.
 * ⚠ SILVICULTURA E ADMINISTRATIVO NÃO TÊM NENHUM DOS DOIS: nem cultura, nem fase.
 */
export function culturaParaGravar(atividade: string | null | undefined, cultura: string): string | null {
  return atividade === 'agricultura' ? (cultura.trim() || null) : null;
}

export function faseParaGravar(atividade: string | null | undefined, fase: string): string | null {
  return atividade === 'pecuaria' ? (fase.trim() || null) : null;
}
