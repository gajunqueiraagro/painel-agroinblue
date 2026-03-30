import * as XLSX from 'xlsx';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';

export interface MapaImportRow {
  linha: number;
  anoMes: string;
  pasto: string;
  atividade: string;
  lote: string;
  qualidade: string;
  categoria: string;
  quantidade: string;
  pesoMedio: string;
}

export interface MapaImportValidated {
  anoMes: string;
  pastoId: string;
  pastoNome: string;
  categoriaId: string;
  categoriaNome: string;
  quantidade: number;
  pesoMedioKg: number | null;
  atividade: string | null;
  lote: string | null;
  qualidade: number | null;
}

export interface MapaImportResult {
  validas: MapaImportValidated[];
  erros: { linha: number; mensagem: string }[];
  totalLinhas: number;
  mesesEncontrados: string[];
}

const COL_MAP: Record<string, string> = {
  'ano_mes': 'anoMes',
  'anomes': 'anoMes',
  'ano mes': 'anoMes',
  'mes': 'anoMes',
  'periodo': 'anoMes',
  'pasto': 'pasto',
  'atividade': 'atividade',
  'lote': 'lote',
  'qualidade': 'qualidade',
  'categoria': 'categoria',
  'quantidade': 'quantidade',
  'peso médio (kg)': 'pesoMedio',
  'peso medio (kg)': 'pesoMedio',
  'peso_medio_kg': 'pesoMedio',
  'peso medio': 'pesoMedio',
  'peso médio': 'pesoMedio',
};

function normalizeHeader(h: string): string {
  return (h || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normalize various date formats to yyyy-MM */
function normalizeAnoMes(val: string): string | null {
  const s = val.trim();
  // yyyy-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // MM/yyyy
  if (/^\d{2}\/\d{4}$/.test(s)) {
    const [m, y] = s.split('/');
    return `${y}-${m}`;
  }
  // yyyy/MM
  if (/^\d{4}\/\d{2}$/.test(s)) {
    const [y, m] = s.split('/');
    return `${y}-${m}`;
  }
  // MM-yyyy
  if (/^\d{2}-\d{4}$/.test(s)) {
    const [m, y] = s.split('-');
    return `${y}-${m}`;
  }
  return null;
}

export function parseMapaPastosExcel(file: ArrayBuffer): MapaImportRow[] {
  const wb = XLSX.read(file, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (raw.length === 0) return [];

  const firstRow = raw[0];
  const headerMap: Record<string, string> = {};
  Object.keys(firstRow).forEach(key => {
    const norm = normalizeHeader(key);
    if (COL_MAP[norm]) {
      headerMap[key] = COL_MAP[norm];
    } else {
      for (const [pattern, mapped] of Object.entries(COL_MAP)) {
        if (norm.includes(normalizeHeader(pattern))) {
          headerMap[key] = mapped;
          break;
        }
      }
    }
  });

  return raw.map((row, idx) => {
    const get = (field: string) => {
      for (const [origKey, mappedField] of Object.entries(headerMap)) {
        if (mappedField === field) return String(row[origKey] ?? '').trim();
      }
      return '';
    };
    return {
      linha: idx + 2,
      anoMes: get('anoMes'),
      pasto: get('pasto'),
      atividade: get('atividade'),
      lote: get('lote'),
      qualidade: get('qualidade'),
      categoria: get('categoria'),
      quantidade: get('quantidade'),
      pesoMedio: get('pesoMedio'),
    };
  });
}

export function validateMapaPastos(
  rows: MapaImportRow[],
  pastos: Pasto[],
  categorias: CategoriaRebanho[],
  fallbackAnoMes: string,
): MapaImportResult {
  const erros: { linha: number; mensagem: string }[] = [];
  const validas: MapaImportValidated[] = [];
  const seen = new Set<string>();
  const mesesSet = new Set<string>();

  const pastoMap = new Map(pastos.filter(p => p.ativo).map(p => [p.nome.trim().toLowerCase(), p]));
  const catMap = new Map(categorias.map(c => [c.nome.trim().toLowerCase(), c]));

  for (const row of rows) {
    if (!row.pasto && !row.categoria && !row.quantidade) continue;

    // Resolve ano_mes: from column or fallback to selector
    let anoMes: string;
    if (row.anoMes) {
      const parsed = normalizeAnoMes(row.anoMes);
      if (!parsed) {
        erros.push({ linha: row.linha, mensagem: `Ano_Mes inválido: "${row.anoMes}". Use yyyy-MM ou MM/yyyy` });
        continue;
      }
      anoMes = parsed;
    } else {
      anoMes = fallbackAnoMes;
    }
    mesesSet.add(anoMes);

    // Validate pasto
    if (!row.pasto) {
      erros.push({ linha: row.linha, mensagem: 'Campo "Pasto" é obrigatório' });
      continue;
    }
    const pasto = pastoMap.get(row.pasto.toLowerCase());
    if (!pasto) {
      erros.push({ linha: row.linha, mensagem: `Pasto "${row.pasto}" não encontrado (ou inativo)` });
      continue;
    }

    // Validate categoria
    if (!row.categoria) {
      erros.push({ linha: row.linha, mensagem: 'Campo "Categoria" é obrigatório' });
      continue;
    }
    const cat = catMap.get(row.categoria.toLowerCase());
    if (!cat) {
      erros.push({ linha: row.linha, mensagem: `Categoria "${row.categoria}" não encontrada` });
      continue;
    }

    // Validate quantidade
    const qty = parseInt(row.quantidade, 10);
    if (isNaN(qty) || qty < 0) {
      erros.push({ linha: row.linha, mensagem: `Quantidade inválida: "${row.quantidade}"` });
      continue;
    }

    // Duplicity: anoMes + pasto + categoria
    const key = `${anoMes}|${pasto.id}|${cat.id}`;
    if (seen.has(key)) {
      erros.push({ linha: row.linha, mensagem: `Duplicado: "${row.pasto}" + "${row.categoria}" em ${anoMes}` });
      continue;
    }
    seen.add(key);

    const pesoMedio = row.pesoMedio ? parseFloat(row.pesoMedio.replace(',', '.')) : null;
    if (row.pesoMedio && (pesoMedio === null || isNaN(pesoMedio) || pesoMedio < 0)) {
      erros.push({ linha: row.linha, mensagem: `Peso médio inválido: "${row.pesoMedio}"` });
      continue;
    }

    const qualidade = row.qualidade ? parseInt(row.qualidade, 10) : null;
    if (row.qualidade && (qualidade === null || isNaN(qualidade) || qualidade < 1 || qualidade > 10)) {
      erros.push({ linha: row.linha, mensagem: `Qualidade deve ser de 1 a 10: "${row.qualidade}"` });
      continue;
    }

    validas.push({
      anoMes,
      pastoId: pasto.id,
      pastoNome: pasto.nome,
      categoriaId: cat.id,
      categoriaNome: cat.nome,
      quantidade: qty,
      pesoMedioKg: pesoMedio,
      atividade: row.atividade || null,
      lote: row.lote || null,
      qualidade,
    });
  }

  return {
    validas,
    erros,
    totalLinhas: rows.length,
    mesesEncontrados: Array.from(mesesSet).sort(),
  };
}

export function gerarModeloMapaPastos(
  pastos: Pasto[],
  categorias: CategoriaRebanho[],
  fazendaNome: string,
) {
  const headers = ['Ano_Mes', 'Pasto', 'Atividade', 'Lote', 'Qualidade', 'Categoria', 'Quantidade', 'Peso Médio (kg)'];

  const dataRows: (string | number)[][] = [];
  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);

  if (pastosAtivos.length > 0 && categorias.length > 0) {
    dataRows.push([
      '2025-01',
      pastosAtivos[0].nome,
      'recria',
      pastosAtivos[0].lote_padrao || '',
      5,
      categorias[0].nome,
      10,
      350,
    ]);
    if (categorias.length > 1) {
      dataRows.push([
        '2025-01',
        pastosAtivos[0].nome,
        'recria',
        pastosAtivos[0].lote_padrao || '',
        5,
        categorias[1].nome,
        8,
        280,
      ]);
    }
  }

  const wsData: (string | number)[][] = [headers, ...dataRows];
  const pastosRef: string[][] = [['Pastos Disponíveis'], ...pastosAtivos.map(p => [p.nome])];
  const catRef: string[][] = [['Categorias Disponíveis'], ...categorias.map(c => [c.nome])];

  triggerXlsxDownload({
    filename: `Modelo_Mapa_Rebanho_${fazendaNome.replace(/\s+/g, '_')}.xlsx`,
    sheets: [
      {
        name: 'Mapa Rebanho',
        mode: 'aoa',
        rows: wsData,
        cols: [
          { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 16 },
        ],
      },
      {
        name: 'Pastos',
        mode: 'aoa',
        rows: pastosRef,
        cols: [{ wch: 25 }],
      },
      {
        name: 'Categorias',
        mode: 'aoa',
        rows: catRef,
        cols: [{ wch: 25 }],
      },
    ],
  });
}
