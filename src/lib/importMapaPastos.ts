import * as XLSX from 'xlsx';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

export interface MapaImportRow {
  linha: number;
  pasto: string;
  atividade: string;
  lote: string;
  qualidade: string;
  categoria: string;
  quantidade: string;
  pesoMedio: string;
}

export interface MapaImportValidated {
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
}

const COL_MAP: Record<string, string> = {
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

export function parseMapaPastosExcel(file: ArrayBuffer): MapaImportRow[] {
  const wb = XLSX.read(file, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (raw.length === 0) return [];

  // Map headers
  const firstRow = raw[0];
  const headerMap: Record<string, string> = {};
  Object.keys(firstRow).forEach(key => {
    const norm = normalizeHeader(key);
    // Try direct match first
    if (COL_MAP[norm]) {
      headerMap[key] = COL_MAP[norm];
    } else {
      // Try partial match
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
      linha: idx + 2, // Excel row (1-based header + 1)
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
): MapaImportResult {
  const erros: { linha: number; mensagem: string }[] = [];
  const validas: MapaImportValidated[] = [];
  const seen = new Set<string>();

  const pastoMap = new Map(pastos.filter(p => p.ativo).map(p => [p.nome.trim().toLowerCase(), p]));
  const catMap = new Map(categorias.map(c => [c.nome.trim().toLowerCase(), c]));

  for (const row of rows) {
    // Skip completely empty rows
    if (!row.pasto && !row.categoria && !row.quantidade) continue;

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

    // Duplicity check
    const key = `${pasto.id}|${cat.id}`;
    if (seen.has(key)) {
      erros.push({ linha: row.linha, mensagem: `Duplicado: "${row.pasto}" + "${row.categoria}" já existe nesta importação` });
      continue;
    }
    seen.add(key);

    // Optional fields
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

  return { validas, erros, totalLinhas: rows.length };
}

export function gerarModeloMapaPastos(
  pastos: Pasto[],
  categorias: CategoriaRebanho[],
  fazendaNome: string,
) {
  const wb = XLSX.utils.book_new();
  const headers = ['Pasto', 'Atividade', 'Lote', 'Qualidade', 'Categoria', 'Quantidade', 'Peso Médio (kg)'];

  const dataRows: (string | number)[][] = [];

  // Generate example rows: one per pasto × first category
  const pastosAtivos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  if (pastosAtivos.length > 0 && categorias.length > 0) {
    // One example row
    dataRows.push([
      pastosAtivos[0].nome,
      'recria',
      pastosAtivos[0].lote_padrao || '',
      5,
      categorias[0].nome,
      10,
      350,
    ]);
    // Second example if more categories
    if (categorias.length > 1) {
      dataRows.push([
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

  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 16 },
  ];

  // Add reference sheets
  // Pastos reference
  const pastosRef = [['Pastos Disponíveis'], ...pastosAtivos.map(p => [p.nome])];
  const wsPastos = XLSX.utils.aoa_to_sheet(pastosRef);
  wsPastos['!cols'] = [{ wch: 25 }];

  // Categorias reference
  const catRef = [['Categorias Disponíveis'], ...categorias.map(c => [c.nome])];
  const wsCat = XLSX.utils.aoa_to_sheet(catRef);
  wsCat['!cols'] = [{ wch: 25 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Mapa Rebanho');
  XLSX.utils.book_append_sheet(wb, wsPastos, 'Pastos');
  XLSX.utils.book_append_sheet(wb, wsCat, 'Categorias');

  XLSX.writeFile(wb, `Modelo_Mapa_Rebanho_${fazendaNome.replace(/\s+/g, '_')}.xlsx`);
}
