/**
 * LOTE-PESO-CALC-01 (Gabriel, 14/10/2026) — A CONTA NOS CAMPOS DO LOTE (Quantidade, Peso médio, Valor), pelo dono de sempre.
 *
 * "36+18" na Quantidade, "(36*461,72+18*456,61)/54" no Peso médio, "10000*2+500" no Valor: o operador junta dois lotes do
 * frigorifico fazendo a conta no proprio campo. Quem calcula a CONTA e' o `contaNoCampo` (`calcularConta`); o numero simples segue
 * no leitor de sempre do lote (`parseNumericValue`). ⚠ PROIBIDO PARSER NOVO: este arquivo so' decide o que o campo aceita e como o
 * resultado volta ao texto.
 * ⚠ NASCE DE DEFEITO MEDIDO: o `parseNumericValue` tira tudo que nao e' digito, virgula, ponto ou sinal — "36+18" virava 3618
 * cabecas, em silencio, e "54,5" era truncado para 54 no salvar.
 */
import { calcularConta, contaOk, ehConta, FRASE_DA_CONTA } from '@/lib/calculos/contaNoCampo';
import { parseNumericValue } from '@/lib/calculos/abate';

export type CampoDoLote = 'quantidade' | 'peso' | 'valor';

/** A recusa da quantidade que nao da' numero inteiro (digitada direto ou vinda de conta). */
export const FRASE_QUANTIDADE_INTEIRA = 'quantidade precisa ser inteira';

const duasCasas = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A QUANTIDADE lida de um numero simples: o ponto de milhar pt-BR ("1.200", "12.000") e' milhar — quantidade nao tem decimal, so'
 * ha' ambiguidade com o decimal e ela nao existe aqui. Fora disso, o leitor de sempre ("1.200,5" -> 1200,5, que a regra do inteiro
 * recusa). O texto do banco e' inteiro sem ponto ("1200": a coluna e' integer).
 */
export function lerQuantidadeDoLote(texto: string | null | undefined): number {
  const t = (texto ?? '').trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return parseNumericValue(t);
}

const casasDigitadas = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 });

/** O texto ainda tem cara de conta (operador ou parenteses)? A tela nunca deixa isso ir ao `parseNumericValue`. */
export function textoComOperador(texto: string | null | undefined): boolean {
  const t = (texto ?? '').trim();
  if (!t) return false;
  return ehConta(t) || /[+*/()×÷−]/.test(t) || /\d\s*-\s*\d/.test(t);
}

/**
 * Resolve o texto de um campo do lote: vazio fica vazio. COM OPERADOR, a conta e' do `calcularConta`; SEM OPERADOR, o numero e'
 * lido pelo leitor de sempre do lote (`parseNumericValue`; na quantidade, `lerQuantidadeDoLote`). Quantidade so' aceita inteiro (e
 * sai sem casas); peso sai a duas casas; valor sai a duas casas quando e' conta e com as casas digitadas quando e' numero simples. Recusa = a frase do dono (ou a da quantidade inteira).
 * ⚠ POR QUE O NUMERO SIMPLES NAO VAI AO `calcularConta`: o lote chega do banco como texto de MAQUINA ("481.780", o numeric com
 *   tres casas), e o `parseMoeda` le' "481.780" como 481 MIL (o ponto e' milhar em pt-BR) — medido. O `parseNumericValue` le' 481,78.
 *   Na conta o operador digita pt-BR ("461,72"), e la' o `parseMoeda` e' o certo.
 */
export function resolverCampoDoLote(texto: string | null | undefined, campo: CampoDoLote): { ok: true; texto: string } | { ok: false; frase: string } {
  const t = (texto ?? '').trim();
  if (!t) return { ok: true, texto: '' };
  let valor: number;
  const conta = textoComOperador(t);
  if (conta) {
    const r = calcularConta(t);
    if (!contaOk(r)) return { ok: false, frase: r.ok === false ? FRASE_DA_CONTA[r.motivo] : FRASE_DA_CONTA.invalida };
    valor = r.valor;
  } else {
    valor = campo === 'quantidade' ? lerQuantidadeDoLote(t) : parseNumericValue(t);
  }
  if (campo === 'quantidade') {
    if (!Number.isInteger(valor)) return { ok: false, frase: FRASE_QUANTIDADE_INTEIRA };
    return { ok: true, texto: String(valor) };
  }
  /* Duas casas e' a regra do RESULTADO DE UMA CONTA (contaNoCampo) e a do peso medio; o VALOR digitado como numero simples vai com
     as casas que o operador escreveu ("14,125" R$/kg). */
  if (campo === 'valor' && !conta) return { ok: true, texto: casasDigitadas(valor) };
  return { ok: true, texto: duasCasas(Math.round(valor * 100) / 100) };
}
