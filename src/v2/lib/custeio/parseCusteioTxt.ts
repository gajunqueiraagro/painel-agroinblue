// src/v2/lib/custeio/parseCusteioTxt.ts
// PR-RAUL-01 — Parser puro de relatório de Custeio Analítico (TXT) — cliente Raul / Faz. Monterrey.
//
// ESCOPO TRAVADO:
//   - Apenas LEITURA + estruturação + reconciliação em memória.
//   - SEM Supabase, SEM banco, SEM de-para, SEM plano de contas, SEM gravação.
//   - Cada ITEM-FOLHA (produto indentado com valor) vira uma linha de preview.
//   - Linhas de Fazenda / Família / Sub-Fam (cabeçalhos) e totais NÃO viram item.
//
// LAYOUT REAL (042026.txt) — confirmado:
//   "    Fazenda:     FAZENDA MONTERREY                 101.383,95"   <- header + TOTAL GERAL embutido
//   "    Família:     ANIMAIS                            34.297,00"   <- header família + subtotal embutido
//   "    Sub-Fam:     Produtos Veterinarios               2.293,00"   <- header subfam + subtotal embutido
//   "                 DECTOMAX 500 ML                        725,00"   <- ITEM-FOLHA (indentado, sem rótulo)
//
//   Os rótulos ficam na coluna da esquerda; os itens são indentados. Por isso a detecção é por
//   PREFIXO ANCORADO (^Fazenda: / ^Família: / ^Sub-Fam:) após trim — nunca por includes(),
//   pois itens contêm a palavra "FAZENDA" (ex.: "ORD. E SALARIOS - FAZENDA").

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

export interface CusteioItem {
  linha_num: number;
  familia_raw: string;
  subfamilia_raw: string;
  produto_raw: string;
  valor: number;
}

export interface CusteioSubtotal {
  nivel: 'familia' | 'subfamilia' | 'geral';
  familia_raw: string | null;
  subfamilia_raw: string | null;
  valor: number;
  linha_num: number;
}

export interface CusteioDivergencia {
  escopo: string;
  soma_itens: number;
  subtotal_impresso: number;
  diferenca: number;
}

export interface CusteioReconciliacao {
  ok: boolean;
  divergencias: CusteioDivergencia[];
  conferido: boolean;
}

export interface CusteioParseResult {
  fazenda_raw: string | null;
  ano_mes: string | null;     // YYYY-MM derivado do período
  periodo_raw: string | null; // texto do período como impresso
  itens: CusteioItem[];
  subtotais: CusteioSubtotal[];
  total_itens: number;
  soma_valores: number;             // soma de TODOS os itens-folha
  total_geral_impresso: number | null;
  reconciliacao: CusteioReconciliacao;
  avisos: string[];
}

// ----------------------------------------------------------------------------
// CONFIG DE FORMATO — toda a dependência de layout vive aqui.
// ----------------------------------------------------------------------------

export const CUSTEIO_FORMAT = {
  toleranciaReconciliacao: 0.01, // R$

  // Detecção de seção por PREFIXO (linha já trimada). Itens são indentados e NÃO casam nenhum.
  prefixoFazenda: /^fazenda\s*:/i,
  prefixoFamilia: /^fam[íi]lia\s*:/i,
  prefixoSubfamilia: /^sub-?fam(?:[íi]lia)?\s*:/i,

  // Rótulos do cabeçalho de período (sem valor).
  labelsPeriodo: ['periodo', 'período', 'competencia', 'competência'],

  // Palavras de TOTAL/SUBTOTAL em linha PRÓPRIA (variantes de relatório que imprimem total em
  // linha separada). No 042026.txt o subtotal é embutido no header, então isto raramente dispara.
  keywordsTotal: ['total geral', 'subtotal', 'sub-total', 'total da familia', 'total da família', 'total da subfamilia'],

  // Ruído: cabeçalho de página, traços, paginação. NÃO incluir a linha que carrega "Período"
  // (ela precisa cair em cabecalho_periodo).
  ruidoRegex: [
    /^[-=_*\s.]+$/,                 // só traços/pontos/espaços
    /p[áa]g(?:ina)?\.?\s*\d+/i,     // "Pag. 1" / "Página 2"
    /^r\s*j\s*$/i,                  // "R J"
    /sistema\s+de\s+compras/i,
    /emiss[ãa]o/i,
    /valor\s+em\s+real/i,           // cabeçalho de coluna "Descrição ... Valor em Real"
  ],
} as const;

// ----------------------------------------------------------------------------
// Decodificação (encoding pt-BR legado)
// ----------------------------------------------------------------------------

export function decodeTxt(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
}

// ----------------------------------------------------------------------------
// Número BR
// ----------------------------------------------------------------------------

export function parseValorBR(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Extrai o ÚLTIMO token monetário BR no fim da linha (a coluna "Valor em Real" é a última). */
function extrairValorFinal(linha: string): { valor: number | null; resto: string } {
  const m = linha.match(/(-?\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*$/);
  if (!m || m.index === undefined) return { valor: null, resto: linha.trim() };
  const valor = parseValorBR(m[1]);
  const resto = linha.slice(0, m.index).trim();
  return { valor, resto };
}

// ----------------------------------------------------------------------------
// Helpers de classificação
// ----------------------------------------------------------------------------

type Papel = 'ruido' | 'cabecalho_fazenda' | 'cabecalho_periodo' | 'familia' | 'subfamilia' | 'item' | 'subtotal';

function semAcentoLower(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function casaAlgum(linhaNorm: string, termos: readonly string[]): boolean {
  return termos.some((t) => linhaNorm.includes(semAcentoLower(t)));
}

function ehRuido(linhaOriginal: string): boolean {
  if (!linhaOriginal.trim()) return true;
  return CUSTEIO_FORMAT.ruidoRegex.some((re) => re.test(linhaOriginal));
}

/**
 * Papel da linha. Detecção de seção por PREFIXO (linha trimada). Itens indentados não casam prefixo.
 * Ordem: ruído → fazenda → subfam → família → período → total(linha própria) → item → ruído.
 */
function classificar(linhaOriginal: string, temValor: boolean): Papel {
  if (ehRuido(linhaOriginal)) return 'ruido';

  const t = linhaOriginal.trim();
  if (CUSTEIO_FORMAT.prefixoFazenda.test(t)) return 'cabecalho_fazenda';
  if (CUSTEIO_FORMAT.prefixoSubfamilia.test(t)) return 'subfamilia';
  if (CUSTEIO_FORMAT.prefixoFamilia.test(t)) return 'familia';

  const norm = semAcentoLower(linhaOriginal);
  if (!temValor && casaAlgum(norm, CUSTEIO_FORMAT.labelsPeriodo)) return 'cabecalho_periodo';
  if (casaAlgum(norm, CUSTEIO_FORMAT.keywordsTotal)) return 'subtotal';

  if (temValor) return 'item';
  return 'ruido';
}

/** Remove o prefixo de rótulo de uma linha de cabeçalho (sem valor). */
function limparRotulo(resto: string): string {
  return resto.replace(/^(fazenda|fam[íi]lia|sub-?fam(?:[íi]lia)?)\s*:?\s*/i, '').trim();
}

// ----------------------------------------------------------------------------
// Período → YYYY-MM
// ----------------------------------------------------------------------------

const MESES_PT: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

export function derivarAnoMes(periodoRaw: string | null): string | null {
  if (!periodoRaw) return null;
  const s = semAcentoLower(periodoRaw);
  let m = s.match(/(20\d{2})[-/](\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/\b(\d{1,2})[-/](20\d{2})\b/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*[-/]?\s*(\d{2,4})/);
  if (m) {
    const mm = MESES_PT[m[1]];
    let yy = m[2];
    if (yy.length === 2) yy = `20${yy}`;
    if (mm) return `${yy}-${mm}`;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Parser principal
// ----------------------------------------------------------------------------

export function parseCusteioTxt(conteudo: string): CusteioParseResult {
  const avisos: string[] = [];
  const linhas = conteudo.replace(/\r\n?/g, '\n').split('\n');

  let fazenda_raw: string | null = null;
  let periodo_raw: string | null = null;
  let total_geral_impresso: number | null = null;

  let familiaAtual = '';
  let subfamiliaAtual = '';

  const itens: CusteioItem[] = [];
  const subtotais: CusteioSubtotal[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const original = linhas[i];
    const linhaNum = i + 1;

    const { valor, resto } = extrairValorFinal(original);
    const temValor = valor !== null;
    const papel = classificar(original, temValor);

    switch (papel) {
      case 'ruido':
        break;

      case 'cabecalho_fazenda': {
        const nome = limparRotulo(resto);
        if (nome) fazenda_raw = nome;
        // o valor na linha Fazenda é o TOTAL GERAL do relatório
        if (valor !== null) total_geral_impresso = valor;
        break;
      }

      case 'cabecalho_periodo': {
        const range = original.match(/(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/);
        if (range) {
          periodo_raw = `${range[1]} a ${range[2]}`;
        } else {
          const p = original.replace(/^.*?(per[íi]odo|compet[êe]ncia)\s*[:\-–]?\s*/i, '').trim();
          if (p) periodo_raw = p;
        }
        break;
      }

      case 'familia': {
        let nome = limparRotulo(resto);
        if (!nome) nome = '(sem família)';
        familiaAtual = nome;
        subfamiliaAtual = '';
        if (valor !== null) {
          subtotais.push({ nivel: 'familia', familia_raw: familiaAtual, subfamilia_raw: null, valor, linha_num: linhaNum });
        }
        break;
      }

      case 'subfamilia': {
        let nome = limparRotulo(resto);
        if (!nome) nome = '(sem subfamília)';
        subfamiliaAtual = nome;
        if (!familiaAtual) {
          familiaAtual = '(sem família)';
          avisos.push(`Linha ${linhaNum}: subfamília "${nome}" sem família corrente.`);
        }
        if (valor !== null) {
          subtotais.push({ nivel: 'subfamilia', familia_raw: familiaAtual, subfamilia_raw: subfamiliaAtual, valor, linha_num: linhaNum });
        }
        break;
      }

      case 'subtotal': {
        const norm = semAcentoLower(original);
        let nivel: CusteioSubtotal['nivel'] = 'subfamilia';
        if (norm.includes('geral')) nivel = 'geral';
        else if (norm.includes('sub')) nivel = 'subfamilia';
        else if (norm.includes('familia')) nivel = 'familia';
        if (valor !== null) {
          subtotais.push({
            nivel,
            familia_raw: nivel === 'geral' ? null : familiaAtual || null,
            subfamilia_raw: nivel === 'subfamilia' ? subfamiliaAtual || null : null,
            valor,
            linha_num: linhaNum,
          });
          if (nivel === 'geral') total_geral_impresso = valor;
        }
        break;
      }

      case 'item': {
        if (valor !== null) {
          itens.push({
            linha_num: linhaNum,
            familia_raw: familiaAtual || '(sem família)',
            subfamilia_raw: subfamiliaAtual || '(sem subfamília)',
            produto_raw: resto || '(sem descrição)',
            valor,
          });
        }
        break;
      }
    }
  }

  const soma_valores = round2(itens.reduce((acc, it) => acc + it.valor, 0));
  const reconciliacao = reconciliar(itens, subtotais, total_geral_impresso, soma_valores);

  const ano_mes = derivarAnoMes(periodo_raw);
  if (periodo_raw && !ano_mes) {
    avisos.push(`Período "${periodo_raw}" não convertido para YYYY-MM — confira derivarAnoMes().`);
  }
  if (itens.length === 0) {
    avisos.push('Nenhum item-folha reconhecido. Confira CUSTEIO_FORMAT (prefixos/ruído).');
  }

  return {
    fazenda_raw,
    ano_mes,
    periodo_raw,
    itens,
    subtotais,
    total_itens: itens.length,
    soma_valores,
    total_geral_impresso,
    reconciliacao,
    avisos,
  };
}

// ----------------------------------------------------------------------------
// Reconciliação
// ----------------------------------------------------------------------------

function reconciliar(
  itens: CusteioItem[],
  subtotais: CusteioSubtotal[],
  totalGeralImpresso: number | null,
  somaItens: number,
): CusteioReconciliacao {
  const tol = CUSTEIO_FORMAT.toleranciaReconciliacao;
  const divergencias: CusteioDivergencia[] = [];

  for (const st of subtotais.filter((s) => s.nivel === 'subfamilia')) {
    const soma = round2(
      itens.filter((it) => it.familia_raw === st.familia_raw && it.subfamilia_raw === st.subfamilia_raw)
        .reduce((a, it) => a + it.valor, 0),
    );
    if (Math.abs(soma - st.valor) > tol) {
      divergencias.push({
        escopo: `${st.familia_raw ?? '?'} › ${st.subfamilia_raw ?? '?'}`,
        soma_itens: soma, subtotal_impresso: st.valor, diferenca: round2(soma - st.valor),
      });
    }
  }

  for (const st of subtotais.filter((s) => s.nivel === 'familia')) {
    const soma = round2(
      itens.filter((it) => it.familia_raw === st.familia_raw).reduce((a, it) => a + it.valor, 0),
    );
    if (Math.abs(soma - st.valor) > tol) {
      divergencias.push({
        escopo: `${st.familia_raw ?? '?'} (família)`,
        soma_itens: soma, subtotal_impresso: st.valor, diferenca: round2(soma - st.valor),
      });
    }
  }

  if (totalGeralImpresso !== null && Math.abs(somaItens - totalGeralImpresso) > tol) {
    divergencias.push({
      escopo: 'TOTAL GERAL',
      soma_itens: somaItens, subtotal_impresso: totalGeralImpresso, diferenca: round2(somaItens - totalGeralImpresso),
    });
  }

  return { ok: divergencias.length === 0, divergencias, conferido: subtotais.length > 0 };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ----------------------------------------------------------------------------
// Entrada por arquivo (conveniência para a tela)
// ----------------------------------------------------------------------------

export async function parseCusteioTxtFile(file: File): Promise<CusteioParseResult> {
  const buffer = await file.arrayBuffer();
  const texto = decodeTxt(buffer);
  return parseCusteioTxt(texto);
}
