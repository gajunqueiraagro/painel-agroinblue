/**
 * EVENTO DE AUDITORIA VIRA FRASE — PR-FIN-AUDIT-01.
 *
 * ⚠ LISTA BRANCA, NÃO LISTA NEGRA. O trigger de auditoria grava a linha inteira, e a maior
 * parte do que muda numa gravação não é decisão de ninguém: `updated_at`, `ano_mes` derivado,
 * `hash_*`, `editado_manual`. Uma frase que dissesse "alterou updated_at, ano_mes e valor"
 * enterraria a única palavra que importa. A lista abaixo é o que um humano decidiu; o resto
 * existe e continua visível — no detalhe técnico, que é onde prova mora.
 *
 * ⚠ SEM UUID NA FRASE. `favorecido_id` e `conta_bancaria_id` são resolvidos pelo catálogo que
 * a tela já tem; sem nome, "—". Um UUID no meio de uma frase não informa e ainda ocupa a
 * largura que a frase precisa.
 */

/** Os campos que uma pessoa decide, na ordem em que a frase os enumera. */
export const CAMPOS_AUDITAVEIS: readonly { campo: string; rotulo: string }[] = [
  { campo: 'data_competencia', rotulo: 'competência' },
  { campo: 'data_vencimento', rotulo: 'vencimento' },
  { campo: 'data_pagamento', rotulo: 'pagamento' },
  { campo: 'valor', rotulo: 'valor' },
  { campo: 'favorecido_id', rotulo: 'fornecedor' },
  { campo: 'conta_bancaria_id', rotulo: 'conta' },
  { campo: 'conta_destino_id', rotulo: 'conta destino' },
  { campo: 'subcentro', rotulo: 'subcentro' },
  { campo: 'fazenda_id', rotulo: 'fazenda' },
  { campo: 'descricao', rotulo: 'descrição' },
  { campo: 'observacao', rotulo: 'observação' },
  { campo: 'status_transacao', rotulo: 'situação' },
  { campo: 'cancelado', rotulo: 'cancelado' },
  { campo: 'cancelado_motivo', rotulo: 'motivo' },
];

const ROTULO_POR_CAMPO = new Map(CAMPOS_AUDITAVEIS.map((c) => [c.campo, c.rotulo]));

/** Catálogos que a tela já carregou. Nenhum deles provoca consulta nova. */
export interface CatalogosAuditoria {
  fornecedor?: (id: string) => string | undefined;
  conta?: (id: string) => string | undefined;
  fazenda?: (id: string) => string | undefined;
}

export interface EventoAuditoriaBruto {
  id: string;
  acao: string;
  criadoEm: string;
  autorId: string | null;
  antes: unknown;
  depois: unknown;
  /** Só na trilha de conciliação. */
  motivo?: string | null;
  dataExtrato?: string | null;
}

const ehData = (c: string) => c.startsWith('data_');

function fmtData(v: unknown): string {
  if (typeof v !== 'string' || v.length < 10) return '—';
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

/** A19 — dinheiro nunca cru, nem dentro de uma frase de auditoria. */
function fmtValor(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function valorLegivel(campo: string, v: unknown, cat: CatalogosAuditoria): string {
  if (v === null || v === undefined || v === '') return '—';
  if (ehData(campo)) return fmtData(v);
  if (campo === 'valor') return fmtValor(v);
  if (campo === 'favorecido_id') return (typeof v === 'string' && cat.fornecedor?.(v)) || '—';
  if (campo === 'conta_bancaria_id' || campo === 'conta_destino_id') {
    return (typeof v === 'string' && cat.conta?.(v)) || '—';
  }
  if (campo === 'fazenda_id') return (typeof v === 'string' && cat.fazenda?.(v)) || '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v);
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Quais campos da lista branca mudaram entre `antes` e `depois`, na ordem de exibição.
 *
 * ⚠ COMPARAÇÃO FROUXA DE PROPÓSITO nas datas: o banco devolve `2026-07-01` num lado e
 * `2026-07-01T00:00:00` no outro conforme a coluna, e um `!==` cru acusaria mudança onde
 * ninguém mexeu. Compara-se o que a frase mostraria.
 */
export function camposMudados(
  antes: unknown, depois: unknown, cat: CatalogosAuditoria,
): { campo: string; rotulo: string; de: string; para: string }[] {
  const a = objeto(antes) ?? {};
  const d = objeto(depois);
  if (!d) return [];
  const saida: { campo: string; rotulo: string; de: string; para: string }[] = [];
  for (const { campo, rotulo } of CAMPOS_AUDITAVEIS) {
    if (!(campo in d)) continue;
    const de = valorLegivel(campo, a[campo], cat);
    const para = valorLegivel(campo, d[campo], cat);
    if (de !== para) saida.push({ campo, rotulo, de, para });
  }
  return saida;
}

/** Lista em português: "a", "a e b", "a, b e c". */
function enumerar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * A frase e o detalhe de um evento.
 *
 * ⚠ UM CAMPO MOSTRA O ANTES → DEPOIS; DOIS OU MAIS, SÓ OS NOMES. Com três campos a linha
 * teria seis valores e nenhum caberia — e a trilha existe para varrer, não para conferir.
 * Quem quer os valores clica: o detalhe técnico tem todos, inclusive os de fora da lista.
 */
export function fraseDoEvento(
  ev: EventoAuditoriaBruto, cat: CatalogosAuditoria,
): { frase: string; detalhe: string | null; tecnico: boolean } {
  switch (ev.acao) {
    case 'cancelou':
      return { frase: 'cancelou', detalhe: ev.motivo ? `motivo: ${ev.motivo}` : null, tecnico: false };
    case 'conciliacao_criada':
      return {
        frase: 'conciliou com o extrato',
        detalhe: ev.dataExtrato ? `de ${fmtData(ev.dataExtrato)}` : null,
        tecnico: false,
      };
    case 'conciliacao_desfeita':
      return { frase: 'desfez a conciliação', detalhe: ev.motivo ?? null, tecnico: false };
    case 'extrato_ignorado':
      return { frase: 'ignorou o extrato', detalhe: ev.motivo ?? null, tecnico: false };
    case 'editou': {
      const mudou = camposMudados(ev.antes, ev.depois, cat);
      if (mudou.length === 0) {
        /* ⚠ "AJUSTE TÉCNICO" É UMA RESPOSTA, não um erro: o evento existe, e nenhum campo
           que uma pessoa decide mudou. Esconder a linha faria a contagem do topo não bater
           com o que a lista mostra. */
        return { frase: 'ajuste técnico', detalhe: null, tecnico: true };
      }
      if (mudou.length === 1) {
        const m = mudou[0];
        return { frase: `alterou o ${m.rotulo}`, detalhe: `${m.de} → ${m.para}`, tecnico: false };
      }
      return { frase: `alterou ${enumerar(mudou.map((m) => m.rotulo))}`, detalhe: null, tecnico: false };
    }
    default:
      /* Ação que o banco tem e este módulo ainda não traduz — o texto literal diz mais que
         um "evento desconhecido", e o detalhe técnico continua completo. */
      return { frase: ev.acao.replace(/_/g, ' '), detalhe: ev.motivo ?? null, tecnico: true };
  }
}

export { fmtData as formatarDataAuditoria, ROTULO_POR_CAMPO };
