/**
 * COMO O PERÍODO SE ESCREVE NA URL — PR-BARRA-UNICA-01c.
 *
 * ⚠ UM CONTRATO SÓ (`f_ano`, `f_mes`) PARA SETE TELAS QUE FALAM VOCABULÁRIOS DIFERENTES. O
 * mês é `'todos'` nos Lançamentos, `'__all__'` nos Saldos, `'01'..'12'` nos Indicadores e
 * um NÚMERO na Auditoria Bancária — quatro formas do mesmo dado, cada uma gravada em algum
 * lugar da própria tela. Trocar todas por uma seria reescrever sete telas; então a tradução
 * mora aqui, na borda, e cada uma continua guardando o que sempre guardou.
 *
 * ⚠ ANO INTEIRO É `0` NA URL, decisão do envelope — e é a mesma convenção do
 * `SeletorPeriodo`, onde `mes === 0` já significa "o ano todo". Um vocabulário só entre o
 * componente e o endereço.
 *
 * ⚠ OS CODECS SÃO CONSTANTES DE MÓDULO, e isso não é estilo: `useFiltroUrl` os leva nas
 * dependências do `useCallback` que escreve. Criados dentro do componente, mudariam de
 * identidade a cada render e o setter seria recriado sem parar.
 */

/** Ano como texto — o formato que seis das sete telas já guardam. */
export const ANO_URL = {
  ler: (b: string) => b,
  escrever: (v: string) => v,
};

/** Ano como número — a Auditoria Bancária guarda assim. */
export const ANO_URL_NUM = {
  ler: (b: string) => Number(b) || new Date().getFullYear(),
  escrever: (v: number) => String(v),
};

/**
 * ⚠ `f_ano`/`f_mes` SÃO COMPARTILHADOS ENTRE AS TELAS, e é isso que faz o período
 * atravessar a navegação — mas duas das sete NÃO SABEM dizer "ano inteiro". Saindo dos
 * Lançamentos com `f_mes=0` e entrando nos Indicadores, um `Number('0')` cru abriria a tela
 * em JANEIRO (ou, pior, num mês zero que o banco não conhece). Quando o endereço pede um
 * recorte que a tela não tem, ela abre onde sempre abriu: o mês corrente.
 */
const MES_CORRENTE = () => new Date().getMonth() + 1;

/** Mês como número 1..12. Esta tela não tem ano inteiro: `0` vira o mês corrente. */
export const MES_URL_NUM = {
  ler: (b: string) => Number(b) || MES_CORRENTE(),
  escrever: (v: number) => String(v),
};

/** Mês como `'01'..'12'`, sem opção de ano inteiro — `0` vira o mês corrente. */
export const MES_URL_2D = {
  ler: (b: string) => String(Number(b) || MES_CORRENTE()).padStart(2, '0'),
  escrever: (v: string) => String(Number(v) || MES_CORRENTE()),
};

/** Fábrica dos vocabulários com "ano inteiro" — chamada UMA vez, fora de componente. */
function mesComTodos(token: string) {
  return {
    ler: (b: string) => (Number(b) === 0 ? token : String(Number(b)).padStart(2, '0')),
    escrever: (v: string) => (v === token ? '0' : String(Number(v) || 0)),
  };
}

/** Lançamentos zootécnicos e Conferência de Lançamentos: o ano inteiro é `'todos'`. */
export const MES_URL_TODOS = mesComTodos('todos');
/** Saldos Mensais: o ano inteiro é `'__all__'`. */
export const MES_URL_ALL = mesComTodos('__all__');
