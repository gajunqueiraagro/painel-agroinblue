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

/** Os campos que uma pessoa decide, na ordem em que a frase os enumera. `artigo` monta a frase de um campo só ("alterou a safra").
 *  P116 (Gabriel 27/10/2026): entram classificação (a chave do plano), safra, forma de pagamento, tipo/número do documento e "entra no
 *  DRE" — antes viravam "ajuste técnico" (outubro: 561 trocas de classificação, 239 de forma de pagamento). `subcentro` e
 *  `plano_conta_id` são a MESMA classificação: a frase diz uma vez. */
export const CAMPOS_AUDITAVEIS: readonly { campo: string; rotulo: string; artigo: string }[] = [
  { campo: 'data_competencia', rotulo: 'competência', artigo: 'a' },
  { campo: 'data_vencimento', rotulo: 'vencimento', artigo: 'o' },
  { campo: 'data_pagamento', rotulo: 'pagamento', artigo: 'o' },
  { campo: 'valor', rotulo: 'valor', artigo: 'o' },
  { campo: 'favorecido_id', rotulo: 'fornecedor', artigo: 'o' },
  { campo: 'conta_bancaria_id', rotulo: 'conta', artigo: 'a' },
  { campo: 'conta_destino_id', rotulo: 'conta destino', artigo: 'a' },
  { campo: 'plano_conta_id', rotulo: 'classificação', artigo: 'a' },
  { campo: 'subcentro', rotulo: 'classificação', artigo: 'a' },
  { campo: 'safra_id', rotulo: 'safra', artigo: 'a' },
  { campo: 'fazenda_id', rotulo: 'fazenda', artigo: 'a' },
  { campo: 'forma_pagamento', rotulo: 'forma de pagamento', artigo: 'a' },
  { campo: 'tipo_documento', rotulo: 'tipo do documento', artigo: 'o' },
  { campo: 'numero_documento', rotulo: 'número do documento', artigo: 'o' },
  { campo: 'compoe_dre', rotulo: '"entra no DRE"', artigo: '' },
  { campo: 'descricao', rotulo: 'descrição', artigo: 'a' },
  { campo: 'observacao', rotulo: 'observação', artigo: 'a' },
  { campo: 'status_transacao', rotulo: 'situação', artigo: 'a' },
  { campo: 'cancelado', rotulo: 'cancelado', artigo: 'o' },
  { campo: 'cancelado_motivo', rotulo: 'motivo', artigo: 'o' },
];

/**
 * ⚠ GRAVAÇÃO INTERNA, SEM EFEITO PARA QUEM LÊ — P116. O que muda sozinho a cada gravação (`updated_*`, a marca `editado_manual`), o
 * que se deriva de outro campo (`ano_mes`, `sinal`, macro/grupo/centro da classificação, o escopo, a conta efetiva gerada) e as marcas
 * técnicas (`hash_importacao`, valor do mês). Um evento que só mexeu nisto NÃO aparece na trilha (é o Salvar sem mudança).
 */
export const CAMPOS_INTERNOS: ReadonlySet<string> = new Set([
  'updated_at', 'updated_by', 'created_at', 'created_by', 'editado_manual', 'hash_importacao', 'valor_do_mes_em', 'valor_do_mes_origem',
  'ano_mes', 'sinal', 'macro_custo', 'grupo_custo', 'centro_custo', 'escopo_negocio', 'conta_efetiva_id',
]);

/** O nome legível do campo que não é da lista branca nem interno — a frase diz O QUE mudou, nunca "ajuste técnico". */
const ROTULO_TECNICO: Record<string, string> = {
  tipo_operacao: 'tipo de operação', financiamento_id: 'parcelamento', origem_tipo: 'origem', origem_lancamento: 'origem',
  conciliado_em: 'conciliação', nivel_duplicidade: 'marca de duplicidade', status_duplicidade: 'marca de duplicidade',
  duplicado_de_id: 'duplicado de', importado_duplicado: 'marca de duplicidade', classificacao_dividida: 'classificação dividida',
  recorrencia_id: 'recorrência', dados_pagamento: 'dados do pagamento', cenario: 'cenário', sem_movimentacao_caixa: 'sem movimento de caixa',
  gera_lcdpr: '"entra no LCDPR"', transferencia_grupo_id: 'transferência', movimentacao_rebanho_id: 'movimentação do rebanho',
  cancelado_em: 'data do cancelamento', cancelado_por: 'quem cancelou', contrato_id: 'contrato', grupo_geracao_id: 'grupo de geração',
  lote_importacao_id: 'lote da importação', staging_id: 'importação', saldo_de_id: 'saldo', boitel_id: 'boitel', boitel_lote_id: 'lote do boitel',
  orfao_definitivo: 'marca de órfão', orfao_definitivo_motivo: 'motivo do órfão', orfao_definitivo_por: 'marca de órfão',
  orfao_definitivo_em: 'marca de órfão', origem_apontamento: 'origem do apontamento', cultura: 'cultura', fase: 'fase',
  documento: 'documento', historico: 'histórico', cliente_id: 'cliente',
};
const rotuloTecnico = (campo: string) => ROTULO_TECNICO[campo] ?? campo.replace(/_id$/, '').replace(/_/g, ' ');

const ROTULO_POR_CAMPO = new Map(CAMPOS_AUDITAVEIS.map((c) => [c.campo, c.rotulo]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Catálogos que a tela já carregou. Nenhum deles provoca consulta nova. */
export interface CatalogosAuditoria {
  fornecedor?: (id: string) => string | undefined;
  conta?: (id: string) => string | undefined;
  fazenda?: (id: string) => string | undefined;
  /** A linha do plano (`plano_conta_id`) pelo nome que o operador vê (o subcentro). Sem ele, o texto gravado na própria linha. */
  classificacao?: (id: string) => string | undefined;
  safra?: (id: string) => string | undefined;
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

function valorLegivel(campo: string, v: unknown, cat: CatalogosAuditoria, linha: Record<string, unknown>): string {
  /* a classificação pela chave: o nome do plano, ou o texto que a própria linha gravava — ligar a chave ao MESMO texto não é mudança */
  if (campo === 'plano_conta_id') {
    const nome = typeof v === 'string' ? cat.classificacao?.(v) : undefined;
    const texto = typeof linha.subcentro === 'string' && linha.subcentro ? linha.subcentro : undefined;
    return nome ?? texto ?? '—';
  }
  if (v === null || v === undefined || v === '') return '—';
  if (ehData(campo)) return fmtData(v);
  if (campo === 'valor') return fmtValor(v);
  if (campo === 'favorecido_id') return (typeof v === 'string' && cat.fornecedor?.(v)) || '—';
  if (campo === 'conta_bancaria_id' || campo === 'conta_destino_id') {
    return (typeof v === 'string' && cat.conta?.(v)) || '—';
  }
  if (campo === 'fazenda_id') return (typeof v === 'string' && cat.fazenda?.(v)) || '—';
  if (campo === 'safra_id') return (typeof v === 'string' && cat.safra?.(v)) || '—';
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
): { campo: string; rotulo: string; artigo: string; de: string; para: string }[] {
  const a = objeto(antes) ?? {};
  const d = objeto(depois);
  if (!d) return [];
  const saida: { campo: string; rotulo: string; artigo: string; de: string; para: string }[] = [];
  for (const { campo, rotulo, artigo } of CAMPOS_AUDITAVEIS) {
    if (!(campo in d)) continue;
    if (saida.some((m) => m.rotulo === rotulo)) continue;   // subcentro e chave do plano: uma classificação só
    const de = valorLegivel(campo, a[campo], cat, a);
    const para = valorLegivel(campo, d[campo], cat, d);
    if (de !== para) saida.push({ campo, rotulo, artigo, de, para });
  }
  return saida;
}

/** O valor de um campo fora da lista branca: sem UUID (vira "vinculado"), sem json cru ("preenchido"). */
function valorTecnico(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return 'preenchido';
  if (typeof v === 'string' && UUID.test(v)) return 'vinculado';
  if (typeof v === 'string' && (campo.startsWith('data_') || campo.endsWith('_em'))) return fmtData(v);
  return String(v);
}

/**
 * Os campos que mudaram FORA da lista branca e que não são internos (P116 — o antigo "ajuste técnico" diz o que foi). Comparação
 * pelo conteúdo (json), não pelo texto exibido: dois "preenchido" diferentes são mudança.
 */
export function camposTecnicosMudados(
  antes: unknown, depois: unknown,
): { campo: string; rotulo: string; artigo: string; de: string; para: string }[] {
  const a = objeto(antes) ?? {};
  const d = objeto(depois);
  if (!d) return [];
  const saida: { campo: string; rotulo: string; artigo: string; de: string; para: string }[] = [];
  for (const campo of Object.keys(d).sort()) {
    if (ROTULO_POR_CAMPO.has(campo) || CAMPOS_INTERNOS.has(campo)) continue;
    const va = a[campo] ?? null; const vd = d[campo] ?? null;
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    const de = valorTecnico(campo, va); const para = valorTecnico(campo, vd);
    if (de === para && typeof va !== 'object' && typeof vd !== 'object') continue;   // mesma data em dois formatos
    const rotulo = rotuloTecnico(campo);
    if (saida.some((m) => m.rotulo === rotulo)) continue;
    saida.push({ campo, rotulo, artigo: '', de, para });
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
 * ⚠ `oculto` (P116): a gravação que só mexeu em campo interno — o Salvar sem mudança — NÃO aparece, e a contagem do topo não a conta.
 * Antes ela era "ajuste técnico"; um campo de fora da lista branca agora diz o próprio nome.
 */
export function fraseDoEvento(
  ev: EventoAuditoriaBruto, cat: CatalogosAuditoria,
): { frase: string; detalhe: string | null; tecnico: boolean; oculto: boolean } {
  switch (ev.acao) {
    case 'criou': {
      const d = objeto(ev.depois);
      const descr = d && typeof d.descricao === 'string' && d.descricao ? d.descricao : null;
      return { frase: 'criou', detalhe: descr, tecnico: false, oculto: false };
    }
    case 'cancelou':
      return { frase: 'cancelou', detalhe: ev.motivo ? `motivo: ${ev.motivo}` : null, tecnico: false, oculto: false };
    case 'conciliacao_criada':
      return {
        frase: 'conciliou com o extrato',
        detalhe: ev.dataExtrato ? `de ${fmtData(ev.dataExtrato)}` : null,
        tecnico: false, oculto: false,
      };
    case 'conciliacao_desfeita':
      return { frase: 'desfez a conciliação', detalhe: ev.motivo ?? null, tecnico: false, oculto: false };
    case 'extrato_ignorado':
      return { frase: 'ignorou o extrato', detalhe: ev.motivo ?? null, tecnico: false, oculto: false };
    case 'editou': {
      const decididos = camposMudados(ev.antes, ev.depois, cat);
      const tecnicos = camposTecnicosMudados(ev.antes, ev.depois);
      const mudou = [...decididos, ...tecnicos];
      if (mudou.length === 0) return { frase: 'gravou sem mudança', detalhe: null, tecnico: true, oculto: true };
      const tecnico = decididos.length === 0;
      if (mudou.length === 1) {
        const m = mudou[0];
        return { frase: `alterou ${m.artigo ? `${m.artigo} ` : ''}${m.rotulo}`, detalhe: `${m.de} → ${m.para}`, tecnico, oculto: false };
      }
      return { frase: `alterou ${enumerar(mudou.map((m) => m.rotulo))}`, detalhe: null, tecnico, oculto: false };
    }
    default:
      /* Ação que o banco tem e este módulo ainda não traduz — o texto literal diz mais que
         um "evento desconhecido", e o detalhe técnico continua completo. */
      return { frase: ev.acao.replace(/_/g, ' '), detalhe: ev.motivo ?? null, tecnico: true, oculto: false };
  }
}

export { fmtData as formatarDataAuditoria, ROTULO_POR_CAMPO };
