/**
 * O SALVAR QUE NÃO MUDA NADA NÃO GRAVA — P116 (Gabriel 27/10/2026). Puro: sem React e sem rede.
 *
 * Nasce do caso do Agnaldo (NF 778.618, 23/10 12:16): o segundo Salvar do modal, 19 s depois do pagamento, regravou a linha com os
 * mesmos valores — o gatilho da trilha registrou um evento em que só `updated_at` mudou ("ajuste técnico"). Em outubro foram 760.
 *
 * ⚠ COMPARA O QUE O UPDATE MANDARIA com a linha do banco, campo a campo. `updated_by` e `editado_manual` não contam: são a marca de
 *   QUEM gravou, e gravar sem mudança é justamente o que não se quer.
 * ⚠ NA DÚVIDA, GRAVA: campo que a linha lida não tem (coluna fora do select) conta como mudança — nunca se perde uma edição.
 * ⚠ IGUAIS DE VERDADE, NÃO DE TEXTO: `''` e nulo são o mesmo vazio (o form manda `|| null`); número e texto numérico se comparam como
 *   número (`888.49` x `'888.49'`); data pura se compara pelos 10 primeiros (`2026-10-01` x `2026-10-01T00:00:00+00:00`); json por
 *   conteúdo, sem depender da ordem das chaves.
 */
const MARCAS_DE_QUEM_GRAVA: ReadonlySet<string> = new Set(['updated_by', 'editado_manual']);
const DATA = /^\d{4}-\d{2}-\d{2}/;

function estavel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) o[k] = estavel(Reflect.get(v, k));
    return o;
  }
  return v;
}

function mesmoValor(a: unknown, b: unknown): boolean {
  const va = a === '' || a === undefined ? null : a;
  const vb = b === '' || b === undefined ? null : b;
  if (va === null || vb === null) return va === vb;
  if (typeof va === 'number' || typeof vb === 'number') {
    const na = Number(va); const nb = Number(vb);
    return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
  }
  if (typeof va === 'string' && typeof vb === 'string') {
    if (va === vb) return true;
    const puraA = /^\d{4}-\d{2}-\d{2}$/.test(va); const puraB = /^\d{4}-\d{2}-\d{2}$/.test(vb);
    if ((puraA || puraB) && DATA.test(va) && DATA.test(vb)) return va.slice(0, 10) === vb.slice(0, 10);
    return false;
  }
  if (typeof va === 'object' || typeof vb === 'object') return JSON.stringify(estavel(va)) === JSON.stringify(estavel(vb));
  return va === vb;
}

/** `true` quando o UPDATE não mudaria nenhum campo da linha (a gravação é dispensada). */
export function edicaoSemMudanca(payload: Readonly<Record<string, unknown>>, linha: Readonly<Record<string, unknown>> | null): boolean {
  if (!linha) return false;
  for (const [campo, valor] of Object.entries(payload)) {
    if (MARCAS_DE_QUEM_GRAVA.has(campo)) continue;
    if (!(campo in linha)) return false;
    if (!mesmoValor(valor, linha[campo])) return false;
  }
  return true;
}
