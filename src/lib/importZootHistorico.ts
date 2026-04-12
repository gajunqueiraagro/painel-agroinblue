/**
 * Parser e validação para importação histórica zootécnica.
 *
 * Layout padrão: aba IMPORT_ZOOT_HISTORICO
 * Cada linha = 1 evento zootécnico.
 * Tipos aceitos: saldo_inicial, nascimento, compra, venda, abate, morte,
 *                transferencia_saida, reclassificacao, consumo, ajuste.
 * transferencia_entrada NÃO é aceita (nasce do par automático).
 */

import type { Categoria } from '@/types/cattle';

// ── Mapeamento de colunas ──────────────────────────────────────────────────

export const COLUNAS_TEMPLATE = [
  'data',
  'fazenda',
  'tipo',
  'categoria',
  'categoria_destino',
  'quantidade',
  'peso_medio_kg',
  'peso_carcaca_kg',
  'preco_arroba',
  'preco_cabeca',
  'valor_total',
  'fazenda_destino',
  'comprador_fornecedor',
  'numero_documento',
  'observacao',
  'cenario',
  'lote',
  'sexo',
  'finalidade',
] as const;

export type ColunaTemplate = (typeof COLUNAS_TEMPLATE)[number];

// ── Tipos válidos ──────────────────────────────────────────────────────────

export const TIPOS_VALIDOS = [
  'saldo_inicial',
  'nascimento',
  'compra',
  'venda',
  'abate',
  'morte',
  'transferencia_saida',
  'reclassificacao',
  'consumo',
  'ajuste',
] as const;

export type TipoImportavel = (typeof TIPOS_VALIDOS)[number];

// ── Categorias válidas ─────────────────────────────────────────────────────

const CATEGORIAS_VALIDAS: string[] = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

// ── Obrigatoriedade por tipo ───────────────────────────────────────────────

type CampoReq = ColunaTemplate;

const CAMPOS_OBRIGATORIOS: Record<TipoImportavel, CampoReq[]> = {
  saldo_inicial:       ['fazenda', 'data', 'categoria', 'quantidade'],
  nascimento:          ['fazenda', 'data', 'categoria', 'quantidade'],
  compra:              ['fazenda', 'data', 'categoria', 'quantidade'],
  venda:               ['fazenda', 'data', 'categoria', 'quantidade'],
  abate:               ['fazenda', 'data', 'categoria', 'quantidade'],
  morte:               ['fazenda', 'data', 'categoria', 'quantidade'],
  transferencia_saida: ['fazenda', 'data', 'categoria', 'quantidade', 'fazenda_destino'],
  reclassificacao:     ['fazenda', 'data', 'categoria', 'quantidade', 'categoria_destino'],
  consumo:             ['fazenda', 'data', 'categoria', 'quantidade'],
  ajuste:              ['fazenda', 'data', 'categoria', 'quantidade'],
};

// ── Tipos do parser ────────────────────────────────────────────────────────

export interface LinhaImportacao {
  linha: number; // 1-based, Excel row
  data: string;
  fazenda: string;
  tipo: string;
  categoria: string;
  categoria_destino: string;
  quantidade: number | null;
  peso_medio_kg: number | null;
  peso_carcaca_kg: number | null;
  preco_arroba: number | null;
  preco_cabeca: number | null;
  valor_total: number | null;
  fazenda_destino: string;
  comprador_fornecedor: string;
  numero_documento: string;
  observacao: string;
  cenario: string;
  lote: string;
  sexo: string;
  finalidade: string;
}

export interface LinhaValidada extends LinhaImportacao {
  erros: string[];
  valida: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDate(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'number') {
    // Excel serial date
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function anoMes(dateStr: string): string {
  if (dateStr.length >= 7) return dateStr.slice(0, 7);
  return '';
}

// ── Parser de linhas brutas (output do xlsx read) ──────────────────────────

export function parsePlanilha(rows: Record<string, any>[]): LinhaImportacao[] {
  return rows.map((row, idx) => {
    // Normaliza keys para lowercase e sem espaços
    const norm: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      norm[k.toLowerCase().trim().replace(/\s+/g, '_')] = v;
    }
    return {
      linha: idx + 2, // row 1 = header
      data: parseDate(norm.data),
      fazenda: toStr(norm.fazenda),
      tipo: toStr(norm.tipo).toLowerCase().replace(/\s/g, '_'),
      categoria: toStr(norm.categoria).toLowerCase().replace(/\s/g, '_'),
      categoria_destino: toStr(norm.categoria_destino).toLowerCase().replace(/\s/g, '_'),
      quantidade: toNum(norm.quantidade),
      peso_medio_kg: toNum(norm.peso_medio_kg),
      peso_carcaca_kg: toNum(norm.peso_carcaca_kg),
      preco_arroba: toNum(norm.preco_arroba),
      preco_cabeca: toNum(norm.preco_cabeca),
      valor_total: toNum(norm.valor_total),
      fazenda_destino: toStr(norm.fazenda_destino),
      comprador_fornecedor: toStr(norm.comprador_fornecedor),
      numero_documento: toStr(norm.numero_documento),
      observacao: toStr(norm.observacao),
      cenario: toStr(norm.cenario).toLowerCase() || 'realizado',
      lote: toStr(norm.lote),
      sexo: toStr(norm.sexo),
      finalidade: toStr(norm.finalidade),
    };
  });
}

// ── Validação ──────────────────────────────────────────────────────────────

export function validarLinhas(
  linhas: LinhaImportacao[],
  fazendasMap: Record<string, string>, // nome_lower → id
): LinhaValidada[] {
  return linhas.map((l) => {
    const erros: string[] = [];

    // Tipo válido
    if (!TIPOS_VALIDOS.includes(l.tipo as any)) {
      erros.push(`Tipo inválido: "${l.tipo}"`);
    }

    // transferencia_entrada bloqueada
    if (l.tipo === 'transferencia_entrada') {
      erros.push('transferencia_entrada não pode ser importada manualmente.');
    }

    // Campos obrigatórios por tipo
    const reqs = CAMPOS_OBRIGATORIOS[l.tipo as TipoImportavel];
    if (reqs) {
      for (const campo of reqs) {
        const v = l[campo];
        if (v === null || v === undefined || v === '' || v === 0) {
          // quantidade 0 também é inválida
          if (campo === 'quantidade' && v === 0) {
            erros.push(`"${campo}" não pode ser zero.`);
          } else if (v === null || v === undefined || v === '') {
            erros.push(`"${campo}" é obrigatório para tipo "${l.tipo}".`);
          }
        }
      }
    }

    // Data válida
    if (!l.data || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) {
      erros.push(`Data inválida: "${l.data}"`);
    }

    // Categoria válida
    if (l.categoria && !CATEGORIAS_VALIDAS.includes(l.categoria)) {
      erros.push(`Categoria inválida: "${l.categoria}"`);
    }
    if (l.categoria_destino && !CATEGORIAS_VALIDAS.includes(l.categoria_destino)) {
      erros.push(`Categoria destino inválida: "${l.categoria_destino}"`);
    }

    // Fazenda encontrada
    if (l.fazenda && !fazendasMap[l.fazenda.toLowerCase()]) {
      erros.push(`Fazenda não encontrada: "${l.fazenda}"`);
    }
    if (l.tipo === 'transferencia_saida' && l.fazenda_destino && !fazendasMap[l.fazenda_destino.toLowerCase()]) {
      erros.push(`Fazenda destino não encontrada: "${l.fazenda_destino}"`);
    }

    // Cenário
    if (l.cenario && !['realizado', 'meta'].includes(l.cenario)) {
      erros.push(`Cenário inválido: "${l.cenario}" (use "realizado" ou "meta")`);
    }

    // Quantidade positiva
    if (l.quantidade !== null && l.quantidade < 0) {
      erros.push('Quantidade deve ser positiva.');
    }

    return { ...l, erros, valida: erros.length === 0 };
  });
}

// ── Montar payload de insert ───────────────────────────────────────────────

export function montarInserts(
  linhas: LinhaValidada[],
  fazendasMap: Record<string, string>, // nome_lower → id
  clienteId: string,
) {
  return linhas
    .filter((l) => l.valida)
    .map((l) => {
      const fazId = fazendasMap[l.fazenda.toLowerCase()];
      const fazDestinoId = l.fazenda_destino ? fazendasMap[l.fazenda_destino.toLowerCase()] : null;
      return {
        cliente_id: clienteId,
        fazenda_id: fazId,
        data: l.data,
        ano_mes: anoMes(l.data),
        tipo: l.tipo,
        categoria: l.categoria || null,
        categoria_destino: l.categoria_destino || null,
        quantidade: l.quantidade,
        peso_medio_kg: l.peso_medio_kg,
        peso_carcaca_kg: l.peso_carcaca_kg,
        preco_arroba: l.preco_arroba,
        preco_por_cabeca: l.preco_cabeca,
        valor_total: l.valor_total,
        fazenda_destino: fazDestinoId,
        comprador_fornecedor: l.comprador_fornecedor || null,
        nota_fiscal: l.numero_documento || null,
        observacao: l.observacao || null,
        cenario: l.cenario || 'realizado',
        lote: l.lote || null,
        sexo: l.sexo || null,
        finalidade: l.finalidade || null,
        origem_registro: 'importacao_historica',
        cancelado: false,
      };
    });
}

// ── Gerar template para download ───────────────────────────────────────────

export function gerarTemplateHistorico() {
  const headers = [
    'data', 'fazenda', 'tipo', 'categoria', 'categoria_destino',
    'quantidade', 'peso_medio_kg', 'peso_carcaca_kg', 'preco_arroba',
    'preco_cabeca', 'valor_total', 'fazenda_destino', 'comprador_fornecedor',
    'numero_documento', 'observacao', 'cenario', 'lote', 'sexo', 'finalidade',
  ];

  const exemplos: Record<string, any>[] = [
    { data: '01/01/2020', fazenda: 'Fazenda A', tipo: 'saldo_inicial', categoria: 'bois', quantidade: 500, cenario: 'realizado', observacao: 'Saldo abertura 2020' },
    { data: '15/01/2020', fazenda: 'Fazenda A', tipo: 'nascimento', categoria: 'mamotes_m', quantidade: 30, cenario: 'realizado' },
    { data: '20/02/2020', fazenda: 'Fazenda A', tipo: 'compra', categoria: 'garrotes', quantidade: 100, peso_medio_kg: 280, preco_cabeca: 2500, valor_total: 250000, comprador_fornecedor: 'João Silva', cenario: 'realizado' },
    { data: '10/03/2020', fazenda: 'Fazenda A', tipo: 'venda', categoria: 'bois', quantidade: 50, peso_medio_kg: 540, preco_arroba: 320, valor_total: 288000, comprador_fornecedor: 'Frigorífico X', cenario: 'realizado' },
    { data: '15/04/2020', fazenda: 'Fazenda A', tipo: 'abate', categoria: 'bois', quantidade: 20, peso_medio_kg: 550, peso_carcaca_kg: 302, preco_arroba: 330, valor_total: 132000, cenario: 'realizado' },
    { data: '01/05/2020', fazenda: 'Fazenda A', tipo: 'morte', categoria: 'vacas', quantidade: 2, cenario: 'realizado', observacao: 'Picada de cobra' },
    { data: '10/06/2020', fazenda: 'Fazenda A', tipo: 'transferencia_saida', categoria: 'garrotes', quantidade: 40, fazenda_destino: 'Fazenda B', cenario: 'realizado' },
    { data: '01/07/2020', fazenda: 'Fazenda A', tipo: 'reclassificacao', categoria: 'garrotes', categoria_destino: 'bois', quantidade: 60, cenario: 'realizado' },
  ];

  return { headers, exemplos };
}
