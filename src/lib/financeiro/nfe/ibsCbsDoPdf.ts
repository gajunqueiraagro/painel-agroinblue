/**
 * NOTA-PDF-IBS-CBS-01 (Gabriel 12/11 20:45; OK do Chat 22:00) — o IBS/CBS da reforma ESCRITO no DANFE em PDF. Antes o leitor de PDF não lia
 * nada da reforma (0 de 748 itens; o XML, 107 de 109). Censo de 12/11 (211 DANFEs lidos; 168 de 2026): 6 notas trazem o valor impresso,
 * em três formas — as três estão aqui, e o resto do papel NÃO traz (a fonte, aí, é o XML):
 *   A · por ITEM, na linha de baixo do item (o `detalhe`):  "CST/Cl.Trib: 000/000001, BC: 632,81, IBS UF: 0,63, IBS Mun: 0,00, CBS: 5,70"
 *   B · o TOTAL nas informações complementares:             "Vlr.CBS R$ 0,70 Vlr.IBS UF R$ 0,07 Vlr.IBS MUN R$ 0,00"
 *   C · o TOTAL com a base e as alíquotas:                  "Base IBS/CBS:R$ 5181,88, IBS:R$ 5,16(IBSUF:5,16(0,1000%), IBSMun:0,00(0,0000%)) e CBS:R$ 46,65(0,9000%)"
 *   D · o TOTAL na continuação das complementares (NF 39423, junto da forma A): "Base IBS/CBS: 22851,53, IBS UF: 22,85, IBS Mun: 0,00, CBS: 205,68"
 * ⚠ SÓ LÊ O QUE ESTÁ ESCRITO: as chaves são as do grupo `IBSCBS` do XML (as mesmas de `nota_fiscal_itens.ibs_cbs`), valores com ponto decimal;
 *   o total impresso NÃO é rateado pelos itens (nunca calcular por fora) — vai no total da nota. `vIBS` só quando o papel o escreve ou
 *   quando UF e Mun estão escritos (vIBS = vIBSUF + vIBSMun, a própria definição do grupo). A conferência só AVISA, nunca muda valor.
 */

import { CCLASSTRIB_RTC } from './cClassTribRtc';

/** "632,81" / "5181,88" / "18.43" → "632.81" (o texto como no XML); nada que não seja número → null */
function decimal(t: string | undefined): string | null {
  if (!t) return null;
  const s = t.trim();
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) return s.replace(/\./g, '').replace(',', '.');
  if (/^\d+,\d{1,4}$/.test(s)) return s.replace(',', '.');
  if (/^\d+\.\d{1,4}$/.test(s)) return s;
  if (/^\d+$/.test(s)) return s;
  return null;
}
const cent = (v: string) => Math.round(Number(v) * 100);
const somaDe = (a: string | null, b: string | null): string | null => (a !== null && b !== null ? ((cent(a) + cent(b)) / 100).toFixed(2) : null);
/** o leitor junta as linhas do DANFE com " · " — aqui o separador some (o número pode ter ido para a linha de baixo) */
const limpo = (t: string) => t.replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ');
const NUM = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2,4}|\\d+\\.\\d{2,4})';

/** A · o grupo de UM item, da linha de baixo dele; sem a forma A, null */
export function ibsCbsDoItem(detalhe: string | null | undefined): Record<string, string> | null {
  if (!detalhe) return null;
  const t = limpo(detalhe);
  const m = new RegExp(`CST/Cl\\.?\\s*Trib:?\\s*(\\d{3})\\s*/\\s*(\\d{6}),\\s*BC:?\\s*${NUM},\\s*IBS\\s*UF:?\\s*${NUM},\\s*IBS\\s*Mun:?\\s*${NUM},\\s*CBS:?\\s*${NUM}`, 'i').exec(t);
  if (!m) return null;
  const [vBC, vIBSUF, vIBSMun, vCBS] = [decimal(m[3]), decimal(m[4]), decimal(m[5]), decimal(m[6])];
  if (vBC === null || vIBSUF === null || vIBSMun === null || vCBS === null) return null;
  return { CST: m[1], cClassTrib: m[2], vBC, vIBSUF, vIBSMun, vIBS: somaDe(vIBSUF, vIBSMun) ?? vIBSUF, vCBS };
}

/** B / C · o TOTAL escrito nas informações complementares (ou no rodapé); sem nenhuma das duas formas, null */
export function ibsCbsDoTotal(texto: string | null | undefined): Record<string, string> | null {
  if (!texto) return null;
  const t = limpo(texto);
  /* C — "Base IBS/CBS:R$ 5181,88, IBS:R$ 5,16(IBSUF:5,16(0,1000%), IBSMun:0,00(0,0000%)) e CBS:R$ 46,65(0,9000%)" */
  const c = new RegExp(`Base\\s*IBS/CBS:?\\s*R\\$\\s*${NUM},?\\s*IBS:?\\s*R\\$\\s*${NUM}\\s*\\(\\s*IBSUF:?\\s*${NUM}\\s*\\(\\s*${NUM}\\s*%\\s*\\),?\\s*IBSMun:?\\s*${NUM}\\s*\\(\\s*${NUM}\\s*%\\s*\\)\\s*\\)\\s*e\\s*CBS:?\\s*R\\$\\s*${NUM}\\s*(?:\\(\\s*${NUM}\\s*%\\s*\\))?`, 'i').exec(t);
  if (c) {
    const r: Record<string, string> = {};
    const pares: [string, string | undefined][] = [['vBC', c[1]], ['vIBS', c[2]], ['vIBSUF', c[3]], ['pIBSUF', c[4]], ['vIBSMun', c[5]], ['pIBSMun', c[6]], ['vCBS', c[7]], ['pCBS', c[8]]];
    for (const [k, v] of pares) { const d = decimal(v); if (d !== null) r[k] = d; }
    return r.vCBS && r.vIBS ? r : null;
  }
  /* D — "Base IBS/CBS: 22851,53, IBS UF: 22,85, IBS Mun: 0,00, CBS: 205,68" (sem R$; a linha de UM item começa por "CST/Cl.Trib … BC:") */
  const d = new RegExp(`Base\\s*IBS/CBS:?\\s*${NUM},\\s*IBS\\s*UF:?\\s*${NUM},\\s*IBS\\s*Mun:?\\s*${NUM},\\s*CBS:?\\s*${NUM}`, 'i').exec(t);
  if (d) {
    const [vBC, vIBSUF, vIBSMun, vCBS] = [decimal(d[1]), decimal(d[2]), decimal(d[3]), decimal(d[4])];
    if (vBC !== null && vIBSUF !== null && vIBSMun !== null && vCBS !== null) return { vBC, vIBSUF, vIBSMun, vIBS: somaDe(vIBSUF, vIBSMun) ?? vIBSUF, vCBS };
  }
  /* B — "Vlr.CBS R$ 0,70 Vlr.IBS UF R$ 0,07 Vlr.IBS MUN R$ 0,00" (a ordem pode variar; cada um pelo seu rótulo) */
  const um = (rot: string) => decimal(new RegExp(`Vlr\\.?\\s*${rot}\\s*R\\$\\s*${NUM}`, 'i').exec(t)?.[1]);
  const vCBS = um('CBS'); const vIBSUF = um('IBS\\s*UF'); const vIBSMun = um('IBS\\s*MUN');
  if (vCBS === null || vIBSUF === null) return null;
  const r: Record<string, string> = { vIBSUF, vCBS };
  if (vIBSMun !== null) { r.vIBSMun = vIBSMun; r.vIBS = somaDe(vIBSUF, vIBSMun) ?? vIBSUF; }
  return r;
}

/** O total da NOTA: nas complementares; se não estiver lá, num detalhe de item que traga o marcador do TOTAL ("Base IBS/CBS") — o leitor do
 *  DANFE às vezes cola a "continuação das informações complementares" na linha de baixo do último item (a NF 39423) */
export function ibsCbsTotalDaNota(complementares: string | null | undefined, detalhes: readonly (string | null | undefined)[]): Record<string, string> | null {
  const daComplementar = ibsCbsDoTotal(complementares);
  if (daComplementar) return daComplementar;
  for (const d of detalhes) if (d && /Base\s*IBS\/CBS/i.test(d)) { const r = ibsCbsDoTotal(d.slice(d.search(/Base\s*IBS\/CBS/i))); if (r) return r; }
  return null;
}

/** CALCULADORA-RTC-CONFERIR-01 (Gabriel 22/11) — a conta da CALCULADORA OFICIAL da Receita (`calculadora-rtc-regime-regular`, MIT;
 *  `CalculoCbsIbsService` + `ArredondamentoUtils`, ADR003), para UM tributo de UM item:
 *    alíquota efetiva = arred4(alíquota × (1 − pRed/100)) · calculado = arred2(arred2(vBC) × efetiva ÷ 100)
 *    vDif = arred2(vBC × efetiva ÷ 100 × pDif ÷ 100) · devido = calculado − vDif
 *  Cada número é arredondado UMA vez, em HALF_EVEN (meio → par, ABNT NBR 5891); a conta no meio é exata (inteiros grandes). Entradas e
 *  saídas em texto decimal (como no XML: "200.00", "0.9000", "60"); os casos da calculadora prendem a conta (`calculadoraRtc.casos.json`). */
export function contaDaCalculadora(e: { vBC: string; aliquota: string; pRed?: string | number; pDif?: string | number }): { aliquotaEfetiva: string; calculado: string; diferido: string; devido: string } {
  const bc = escala(e.vBC, 2);                 // centavos
  const p = escala(e.aliquota, 4);             // alíquota em 1/10.000 de ponto
  const red = escala(String(e.pRed ?? 0), 4);  // redução em 1/10.000 de ponto
  const dif = escala(String(e.pDif ?? 0), 4);
  const MILHAO = BigInt(1000000);
  const efet = meioParaPar(p * (MILHAO - red), MILHAO);                        // p × (1 − red/100), em 1/10.000 de ponto
  const calculado = meioParaPar(bc * efet, MILHAO);                             // centavos × (efet/10⁴)/100
  const diferido = meioParaPar(bc * efet * dif, MILHAO * MILHAO);
  return { aliquotaEfetiva: texto(efet, 4), calculado: texto(calculado, 2), diferido: texto(diferido, 2), devido: texto(calculado - diferido, 2) };
}
/** "200" / "0.9000" / "-1.5" → inteiro em 10^casas (exato; mais casas que `casas` = arredondado meio → par) */
function escala(t: string, casas: number): bigint {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(t.trim());
  if (!m) return BigInt(0);
  const frac = (m[3] ?? '');
  const inteiro = BigInt((m[2] || '0') + frac.slice(0, casas).padEnd(casas, '0'));
  const resto = frac.slice(casas);
  const v = resto && /[1-9]/.test(resto)
    ? meioParaPar(inteiro * BigInt(10) ** BigInt(resto.length) + BigInt(resto), BigInt(10) ** BigInt(resto.length))
    : inteiro;
  return m[1] === '-' ? -v : v;
}
/** n ÷ d arredondado meio → par (d > 0) */
function meioParaPar(n: bigint, d: bigint): bigint {
  const neg = n < BigInt(0); const a = neg ? -n : n;
  let q = a / d; const r = a % d;
  if (r * BigInt(2) > d || (r * BigInt(2) === d && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  return neg ? -q : q;
}
function texto(v: bigint, casas: number): string {
  const neg = v < BigInt(0); const s = (neg ? -v : v).toString().padStart(casas + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, s.length - casas)}.${s.slice(s.length - casas)}`;
}

/** A regra de um item: o que o grupo traz (XML: `pRedAliq`, `pDif`) e, sem isso, a TABELA de cClassTrib da calculadora (o PDF só escreve
 *  CST/cClassTrib, base e valores). `null` = não se confere: classificação "fora" (a conta não se refaz pela base e alíquota escritas) ou
 *  cClassTrib que a tabela não conhece com CST diferente de 000. */
function regraDoItem(g: Record<string, string>): { pRed: { CBS: string; IBSUF: string; IBSMun: string }; pDif: string; zero: boolean } | null {
  const t = g.cClassTrib ? CCLASSTRIB_RTC[g.cClassTrib] : undefined;
  if (t?.regra === 'fora') return null;
  if (!t && !g.pRedAliq && g.CST && g.CST !== '000') return null;
  const r = (tributo: 'CBS' | 'IBSUF' | 'IBSMun') => g.pRedAliq ?? String(t?.pRed?.[tributo] ?? 0);
  return { pRed: { CBS: r('CBS'), IBSUF: r('IBSUF'), IBSMun: r('IBSMun') }, pDif: g.pDif ?? String(t?.pDif ?? 0), zero: t?.regra === 'zero' };
}

/** A CONFERÊNCIA (só avisa): cada item fecha com a sua base pela CONTA DA CALCULADORA OFICIAL (`contaDaCalculadora`: redução e diferimento
 *  do grupo ou da tabela de cClassTrib; alíquotas do item, senão as escritas no total, senão as de 2026: CBS 0,9% · IBS UF 0,1% · IBS Mun 0),
 *  e a soma dos itens fecha com o total escrito, quando os dois existem. Tolerância: 1 centavo por item (o arredondamento do emissor). */
export function conferirIbsCbs(itens: readonly (Record<string, string> | null)[], total: Record<string, string> | null): string[] {
  const avisos: string[] = [];
  const com = itens.map((g, k) => [g, k] as const).filter((x): x is readonly [Record<string, string>, number] => x[0] !== null);
  for (const [g, k] of com) {
    if (!g.vBC) continue;
    const regra = regraDoItem(g);
    if (!regra) continue;
    const aliq = (campo: 'pCBS' | 'pIBSUF' | 'pIBSMun', padrao: string) => (regra.zero ? '0' : g[campo] ?? total?.[campo] ?? padrao);
    const devido = (campo: 'pCBS' | 'pIBSUF' | 'pIBSMun', tributo: 'CBS' | 'IBSUF' | 'IBSMun', padrao: string) =>
      contaDaCalculadora({ vBC: g.vBC, aliquota: aliq(campo, padrao), pRed: regra.pRed[tributo], pDif: regra.pDif }).devido;
    const longe = (esperado: string, escrito: string | undefined) => escrito !== undefined && Math.abs(cent(esperado) - cent(escrito)) > 1;
    if (longe(devido('pCBS', 'CBS', '0.90'), g.vCBS) || longe(devido('pIBSUF', 'IBSUF', '0.10'), g.vIBSUF) || longe(devido('pIBSMun', 'IBSMun', '0'), g.vIBSMun)) {
      avisos.push(`item ${k + 1}: IBS/CBS escritos não fecham com a base ${g.vBC}`);
    }
  }
  if (total && com.length > 0) {
    for (const chave of ['vCBS', 'vIBSUF'] as const) {
      if (!total[chave]) continue;
      const soma = com.reduce((s, [g]) => s + cent(g[chave] ?? '0'), 0);
      if (Math.abs(soma - cent(total[chave])) > com.length) avisos.push(`a soma dos itens (${(soma / 100).toFixed(2)}) não fecha com o total escrito de ${chave === 'vCBS' ? 'CBS' : 'IBS UF'} (${total[chave]})`);
    }
  }
  return avisos;
}
