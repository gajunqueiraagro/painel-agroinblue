/**
 * P88 — O TEXTO DE MÁQUINA dos formulários antigos ("1234.56", o que o `Input type="number"` produzia e o `String(valor)` do banco
 * escreve). Os estados desses formulários seguem guardando ESTE formato — os leitores (`Number`, `parseNumericValue`) não mudam —, e
 * o campo do sistema (`CampoMoeda` / `CampoNumeroComConta`) conversa em número por estes dois.
 * ⚠ NÃO É LEITOR DE DIGITAÇÃO: o que o operador digita é lido pelo campo (`parseMoeda`); aqui só passa o número já lido.
 */
export const numeroDoTextoDeMaquina = (t: string | null | undefined): number | null => {
  if (t == null || t.trim() === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
export const textoDeMaquina = (n: number | null): string => (n == null ? '' : String(n));
