/* OC-DOC-ESPECIE-ABATE-01 passo 4 — A CHAVE DE ACESSO SO' VALE COM O DIGITO VERIFICADOR CERTO.
   ⚠ NASCE DE DEFEITO MEDIDO: na NF da JBS o texto traz "DOCUMENTO: 3010403" colado antes da chave, e a busca antiga ("os
     primeiros 44 digitos") lia 3010403 + 37 digitos da chave: CNPJ 35.026.100/2916-26, numero 685500400, serie 77 — tudo errado e
     pre-preenchido em silencio. Agora: TODAS as janelas de 44 digitos de cada trecho numerico sao conferidas, e vale a primeira
     com DV modulo 11 certo, UF do IBGE, mes de 01 a 12, modelo 55 e CNPJ do emitente com DV certo. Sem nenhuma, nulo. */

const UFS = new Set(['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33',
  '35', '41', '42', '43', '50', '51', '52', '53']);

/** DV modulo 11 da chave (pesos 2..9 da direita para a esquerda; resto 0 ou 1 = 0). */
export function dvDaChaveOk(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0; let peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(chave[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(chave[43]);
}

/** DV do CNPJ (14 digitos). */
export function cnpjOk(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string, pesos: number[]) => {
    const s = pesos.reduce((acc, p, i) => acc + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  return dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), p2) === Number(d[13]);
}

export function chaveValida(c: string): boolean {
  const mes = Number(c.slice(4, 6));
  return dvDaChaveOk(c) && UFS.has(c.slice(0, 2)) && mes >= 1 && mes <= 12 && c.slice(20, 22) === '55' && cnpjOk(c.slice(6, 20));
}

/** A primeira chave valida do texto (digitos separados por espaco ou ponto contam como um trecho). */
export function acharChaveNFe(texto: string): string | null {
  for (const m of texto.matchAll(/\d(?:[ .]*\d)*/g)) {
    const d = m[0].replace(/\D/g, '');
    for (let i = 0; i + 44 <= d.length; i++) {
      const c = d.slice(i, i + 44);
      if (chaveValida(c)) return c;
    }
  }
  return null;
}
