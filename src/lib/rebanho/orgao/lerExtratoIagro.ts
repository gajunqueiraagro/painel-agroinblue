/**
 * REBANHO-ORGAO-01 (F2) — o leitor do EXTRATO DO PRODUTOR do e-Saniagro (IAGRO, MS), uma espécie por arquivo. PURO, sobre as linhas do
 * `montarLinhas`. O leiaute (a forma, nunca o dado — os testes usam linhas inventadas):
 *   cabeçalho: "Ficha Sanitária: | <n> - <nome> | …" · "… | Período: | dd/mm/aaaa | até | dd/mm/aaaa" · "… | Espécie: | BOVINO | …";
 *   as colunas "M | F" de 0012 · 1324 · 2536 · 3700 e o Geral (9 números);
 *   o corpo em BLOCOS que fecham numa linha "[…] | Saldo: | 9 números": cada bloco tem 1+ operações ("[…] | <OPERAÇÃO> | 9 números":
 *   SALDO ANTERIOR · DB-eGTA · CR-eGTA · ESTORNO - DB-eGTA · CR-NASCIMENTO · DB-MORTE · DB-CONSUMO · DB-SAIDA ERA · CR-ENTRADA ERA ·
 *   BRUCELOSE dd/mm/aaaa), o documento ("<n>/P", "<n>/Q" = eGTA; "<n>/U" = declaração), a data/hora e a procedência/destino
 *   ("<ficha> - <nome> -", "<município>/UF"); na virada de página o documento pode vir antes da operação (o bloco é o mesmo).
 *   ⚠ o nome da operação pode ficar SOZINHO numa linha e os 9 números na seguinte (junto com o documento): os números vão para ela.
 * PROVA (cada bloco): o saldo anterior + as operações = o "Saldo:" impresso, coluna a coluna. Um bloco que não fecha = 'nao_fecha'.
 *   ⚠ "BRUCELOSE dd/mm/aaaa" é INFORMAÇÃO (as fêmeas vacinadas): não mexe no saldo e não entra na soma.
 */
import type { PorFaixa, PorSexo } from './tipos';

export type TipoDaOperacao = 'saldo_anterior' | 'egta_saida' | 'egta_entrada' | 'estorno_saida' | 'estorno_entrada' | 'nascimento'
  | 'morte' | 'consumo' | 'era_saida' | 'era_entrada' | 'brucelose' | 'outra';
export interface OperacaoDoExtrato {
  tipo: TipoDaOperacao;
  /** o texto como veio ("DB-eGTA", "CR-NASCIMENTO", …) */
  texto: string;
  /** o movimento por sexo × faixa (negativo = saída) */
  mov: PorSexo<PorFaixa>;
  geral: number;
  /** 'AAAA-MM-DDThh:mm:ss' do bloco; null no SALDO ANTERIOR */
  quando: string | null;
  /** "773457/P"; null quando o bloco não traz */
  documento: string | null;
  /** a ficha sanitária do outro lado (destino/procedência), só dígitos */
  outraFicha: string | null;
  /** "TERENOS/MS" */
  municipio: string | null;
  /** BRUCELOSE: a data da vacinação ('AAAA-MM-DD') */
  dataDaVacina: string | null;
}
export interface ExtratoLido {
  ficha: string | null;
  especie: string | null;
  /** 'AAAA-MM-DD' */
  periodoDe: string | null; periodoAte: string | null;
  operacoes: OperacaoDoExtrato[];
  /** o último "Saldo:" impresso */
  saldoFinal: PorSexo<PorFaixa>;
}
export type LeituraDoExtrato = { ok: true; extrato: ExtratoLido } | { ok: false; motivo: 'nao_sei' | 'nao_fecha'; frase: string };
export const FRASE_NAO_E_EXTRATO = 'Não é um Extrato do Produtor do e-Saniagro que eu conheça.';
export const fraseBlocoNaoFecha = (quando: string) => `O bloco de ${quando} não soma com o saldo impresso: nada foi usado.`;

const celulas = (l: string) => l.split('|').map((c) => c.trim()).filter((c) => c !== '');
const RE_INT = /^-?\d+$/;
const RE_OP = /^(SALDO ANTERIOR|(ESTORNO - )?(DB|CR)-[A-ZÇÃÁÉÍÓÚÊ ]+|BRUCELOSE \d{2}\/\d{2}\/\d{4})$/i;
const RE_DOC = /^\d+\/[A-Z]$/;
const RE_QUANDO = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/;
const RE_FICHA = /^(\d{6,})\s*-/;
const RE_MUNICIPIO = /^[A-ZÀ-Ú' .-]+\/[A-Z]{2}$/;

function tipoDe(t: string): TipoDaOperacao {
  const u = t.toUpperCase();
  if (u === 'SALDO ANTERIOR') return 'saldo_anterior';
  if (u.startsWith('BRUCELOSE')) return 'brucelose';
  const est = u.startsWith('ESTORNO');
  if (/DB-EGTA$/.test(u)) return est ? 'estorno_saida' : 'egta_saida';
  if (/CR-EGTA$/.test(u)) return est ? 'estorno_entrada' : 'egta_entrada';
  if (/NASCIMENTO/.test(u)) return 'nascimento';
  if (/MORTE/.test(u)) return 'morte';
  if (/CONSUMO/.test(u)) return 'consumo';
  if (/SAIDA ERA|SAÍDA ERA/.test(u)) return 'era_saida';
  if (/ENTRADA ERA/.test(u)) return 'era_entrada';
  return 'outra';
}
/** 9 números: M,F de 0012 · 1324 · 2536 · 3700 + o Geral */
function nove(c: string[]): { mov: PorSexo<PorFaixa>; geral: number } | null {
  if (c.length < 9 || !c.slice(-9).every((x) => RE_INT.test(x))) return null;
  const n = c.slice(-9).map(Number);
  return { mov: { M: [n[0], n[2], n[4], n[6]], F: [n[1], n[3], n[5], n[7]] }, geral: n[8] };
}
const soma = (a: PorSexo<PorFaixa>, b: PorSexo<PorFaixa>): PorSexo<PorFaixa> => ({
  F: [a.F[0] + b.F[0], a.F[1] + b.F[1], a.F[2] + b.F[2], a.F[3] + b.F[3]],
  M: [a.M[0] + b.M[0], a.M[1] + b.M[1], a.M[2] + b.M[2], a.M[3] + b.M[3]],
});
const igual = (a: PorSexo<PorFaixa>, b: PorSexo<PorFaixa>) => a.F.every((x, i) => x === b.F[i]) && a.M.every((x, i) => x === b.M[i]);
const dataISO = (s: string) => { const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export function lerExtratoIagro(linhas: readonly string[]): LeituraDoExtrato {
  if (!linhas.some((l) => /Extrato do Produtor/i.test(l))) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_EXTRATO };
  let ficha: string | null = null; let especie: string | null = null; let de: string | null = null; let ate: string | null = null;
  for (const l of linhas) {
    const c = celulas(l);
    const iF = c.indexOf('Ficha Sanitária:'); if (iF >= 0 && !ficha) ficha = (c[iF + 1] ?? '').match(/^(\d+)/)?.[1] ?? null;
    const iE = c.indexOf('Espécie:'); if (iE >= 0 && !especie) especie = c[iE + 1] ?? null;
    const iP = c.indexOf('Período:'); if (iP >= 0 && !de) { de = dataISO(c[iP + 1] ?? ''); ate = dataISO(c[iP + 3] ?? ''); }
  }
  type Pendente = { texto: string; mov: PorSexo<PorFaixa>; geral: number };
  let ops: Pendente[] = [];
  let semNumeros: string | null = null;   // a operação cujo nome veio sozinho na linha
  let quando: string | null = null; let documento: string | null = null; let outraFicha: string | null = null; let municipio: string | null = null;
  let saldo: PorSexo<PorFaixa> | null = null;
  const lidas: OperacaoDoExtrato[] = [];
  for (const l of linhas) {
    const c = celulas(l);
    if (c.some((x) => /^Data\/Hora$|^Ficha Sanitária:$|^Produtor:$|^Município:$/.test(x))) continue;   // cabeçalho (repete a cada página)
    const iSaldo = c.indexOf('Saldo:');
    for (const x of iSaldo >= 0 ? c.slice(0, iSaldo) : c) {
      const q = x.match(RE_QUANDO); if (q && !quando) quando = `${q[3]}-${q[2]}-${q[1]}T${q[4]}`;
      if (RE_DOC.test(x) && !documento) documento = x;
      const f = x.match(RE_FICHA); if (f && !outraFicha) outraFicha = f[1];
      if (RE_MUNICIPIO.test(x) && !municipio) municipio = x;
    }
    if (iSaldo >= 0) {
      const s = nove(c.slice(iSaldo + 1));
      if (!s) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_EXTRATO };
      const anterior = saldo;
      let conta = anterior;
      for (const o of ops) {
        const t = tipoDe(o.texto);
        if (t === 'brucelose') continue;
        conta = t === 'saldo_anterior' ? o.mov : conta ? soma(conta, o.mov) : null;
      }
      if (!conta || !igual(conta, s.mov)) return { ok: false, motivo: 'nao_fecha', frase: fraseBlocoNaoFecha(quando ?? 'abertura') };
      for (const o of ops) {
        const tipo = tipoDe(o.texto);
        lidas.push({ tipo, texto: o.texto, mov: o.mov, geral: o.geral, quando: tipo === 'saldo_anterior' ? null : quando,
          documento: tipo === 'saldo_anterior' ? null : documento, outraFicha, municipio,
          dataDaVacina: tipo === 'brucelose' ? dataISO(o.texto) : null });
      }
      saldo = s.mov; ops = []; semNumeros = null; quando = null; documento = null; outraFicha = null; municipio = null;
      continue;
    }
    const iOp = c.findIndex((x) => RE_OP.test(x));
    if (iOp >= 0) {
      const n = nove(c.slice(iOp + 1));
      if (n) ops.push({ texto: c[iOp], ...n }); else semNumeros = c[iOp];
    } else if (semNumeros) {
      const n = nove(c);
      if (n) { ops.push({ texto: semNumeros, ...n }); semNumeros = null; }
    }
  }
  if (!saldo || ops.length || semNumeros) return { ok: false, motivo: ops.length ? 'nao_fecha' : 'nao_sei', frase: ops.length ? fraseBlocoNaoFecha('o fim') : FRASE_NAO_E_EXTRATO };
  return { ok: true, extrato: { ficha, especie, periodoDe: de, periodoAte: ate, operacoes: lidas, saldoFinal: saldo } };
}
