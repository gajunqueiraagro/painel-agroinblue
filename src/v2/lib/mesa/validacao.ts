// ============================================================================
// PR6.1C-1 — Fonte única de validação de aprovação
//
// Helper consumido por TODOS os caminhos de aprovação da Mesa (Modo Excel,
// Modo OFX, Operador Rápido) e pelo salvarPares (defesa em profundidade).
//
// Função pura. Sem efeitos. Sem chamadas de banco. Sem dependência de
// componente React (tipo de domínio em lib/).
//
// camposFaltantes vem UX-ready em português — reuso direto em badge,
// tooltip, toast, operador rápido. Sem mapear label em 4 lugares.
//
// A1 — projeto não possui helper isUUID utilitário nem dep `uuid`. Helper
// interno minimalista criado abaixo.
// ============================================================================
import type { AprovacaoLocal } from '@/v2/lib/mesaSessao/types';
import type { ExcelLinhaNormalizada } from '@/v2/lib/excelPreview/types';

/** Resultado da validação — UX-ready, sem chaves técnicas. */
export interface ResultadoValidacao {
  valido: boolean;
  camposFaltantes: string[]; // labels em português prontos pra UI
  mensagem: string;          // "Faltam: X, Y" ou "" se válido
}

/**
 * Valida uma aprovação. Função pura.
 *
 * Regras (PR6.1C):
 * - Categoria contábil: subcentro + grupo + centro + macro obrigatórios (D1)
 * - Identificação: contaId + fazendaId UUIDs válidos (D1)
 * - Data: aprovacao.dataCompetencia OR linha.dataPagamento
 *         OR linha.dataCompetencia (D2)
 * - Coerência sinal × tipo (D6):
 *   - 1-Entradas exige sinal === 'entrada'
 *   - 2-Saídas exige sinal === 'saida'
 *   - 3-Transferências aceita 'entrada' OU 'saida' (sem amarrar lado;
 *     prepara PR6.2 com split N↔M)
 * - Fornecedor: NÃO bloqueante (D8).
 */
export function validarAprovacao(
  aprovacao: Partial<AprovacaoLocal> | null | undefined,
  linha?: ExcelLinhaNormalizada | null,
): ResultadoValidacao {
  if (!aprovacao) {
    return {
      valido: false,
      camposFaltantes: ['Aprovação ausente'],
      mensagem: 'Aprovação ausente',
    };
  }

  const faltam: string[] = [];

  // Categoria contábil
  if (!isNonEmpty(aprovacao.subcentro)) faltam.push('Subcentro');
  if (!isNonEmpty(aprovacao.grupo)) faltam.push('Grupo de custo');
  if (!isNonEmpty(aprovacao.centro)) faltam.push('Centro de custo');
  if (!isNonEmpty(aprovacao.macro)) faltam.push('Macro de custo');

  // Identificação
  if (!isUUID(aprovacao.contaId)) faltam.push('Conta bancária');
  if (!isUUID(aprovacao.fazendaId)) faltam.push('Fazenda');

  // Data — competência da aprovação OU qualquer data da linha Excel
  const temDataCompAprov = isNonEmpty(aprovacao.dataCompetencia);
  const temDataCompLinha = !!linha && isNonEmpty(linha.dataCompetencia);
  const temDataPagLinha = !!linha && isNonEmpty(linha.dataPagamento);
  if (!temDataCompAprov && !temDataCompLinha && !temDataPagLinha) {
    faltam.push('Data (competência ou pagamento)');
  }

  // Coerência sinal × tipo (D6) — só validável com linha em mão
  if (linha) {
    const sinal = linha.sinal;
    const tipo = derivarTipoOperacao(linha);

    if (sinal !== 'entrada' && sinal !== 'saida') {
      // 'desconhecido' (ou qualquer valor inesperado) bloqueia.
      faltam.push('Sinal inválido na linha Excel');
    } else if (tipo === '1-Entradas' && sinal !== 'entrada') {
      faltam.push('Sinal incompatível com tipo de operação');
    } else if (tipo === '2-Saídas' && sinal !== 'saida') {
      faltam.push('Sinal incompatível com tipo de operação');
    }
    // 3-Transferências: aceita 'entrada' OU 'saida' (D6 revisado).
    // Tipo indeterminado: não bloqueia coerência (parser pode não ter classificado).
  }

  return {
    valido: faltam.length === 0,
    camposFaltantes: faltam,
    mensagem: faltam.length === 0 ? '' : `Faltam: ${faltam.join(', ')}`,
  };
}

// ───────── helpers internos (não exportados) ─────────

function isNonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

// Formato 8-4-4-4-12 hex. Aceita UUIDs canônicos do crypto.randomUUID()
// E os derivados via SHA-256 do parser (PR6.1B-1).
const RE_UUID_FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(v: unknown): boolean {
  return typeof v === 'string' && RE_UUID_FORMATO.test(v);
}

/**
 * Deriva tipo de operação canônico ('1-Entradas' / '2-Saídas' /
 * '3-Transferências') a partir da linha.
 *
 * Estratégia:
 * 1. Fonte autoritativa: linha.raw.Tipo (texto bruto do Excel)
 *    - prefixos numéricos '1-' / '2-' / '3-' são determinísticos
 *    - palavra-chave 'transfer' captura variações de capitalização
 * 2. Fallback canonicalizado: linha.sinal (parser só conhece entrada/saida)
 * 3. Sem classificação possível: '' (caller trata como tipo indeterminado)
 */
function derivarTipoOperacao(linha: ExcelLinhaNormalizada): string {
  const tipoRaw = (linha.raw?.Tipo ?? '').toString().toLowerCase().trim();

  if (tipoRaw.startsWith('3-') || tipoRaw.includes('transfer')) {
    return '3-Transferências';
  }
  if (tipoRaw.startsWith('1-') || tipoRaw.includes('entrada')) {
    return '1-Entradas';
  }
  if (
    tipoRaw.startsWith('2-') ||
    tipoRaw.includes('saída') ||
    tipoRaw.includes('saida')
  ) {
    return '2-Saídas';
  }

  switch (linha.sinal) {
    case 'entrada':
      return '1-Entradas';
    case 'saida':
      return '2-Saídas';
    default:
      return '';
  }
}
