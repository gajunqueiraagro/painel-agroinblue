/**
 * Tipos do Preview Excel × OFX (PR2).
 *
 * Nada aqui é persistido. Tudo vive em useState durante a sessão.
 */

export interface ExcelLinhaRaw {
  // colunas brutas do EXPORT_APP_UNICO — preserva exatamente como veio
  Tipo_Registro: string | null;
  AnoMes: string | null;
  Data_Ref: string | null;
  Data_Competencia: string | null;
  Conta: string | null;
  Conta_Destino: string | null;
  Fazenda: string | null;
  Tipo: string | null;  // '1-Entrada' | '2-Saídas' | outros
  Grupo: string | null;
  Valor: number | null;
  Status: string | null;
  Produto: string | null;
  Fornecedor: string | null;
  Macro_Custo: string | null;
  Grupo_Custo: string | null;
  Centro_Custo: string | null;
  Subcentro: string | null;
  Documento: string | number | null;
  Obs: string | null;
}

export interface ExcelLinhaNormalizada {
  // chaveada por linha (índice no arquivo + lote)
  loteId: string;
  loteNomeArquivo: string;
  indiceLinha: number;  // posição na planilha original (zero-based)

  /** Identidade determinística da linha — hash dos 5 campos canônicos.
   *  Construída pelo parser via buildLinhaKeyDeterministica.
   *  Esta é a chave que persiste como excel_key em mesa_par.
   */
  chaveLinha: string;

  // canonicalizado
  dataPagamento: string | null;       // Data_Ref → 'YYYY-MM-DD' ou null
  dataCompetencia: string | null;     // Data_Competencia → 'YYYY-MM-DD'
  valorCentavos: number;              // Math.round(Valor * 100) — sempre POSITIVO
  sinal: 'entrada' | 'saida' | 'desconhecido';  // derivado do Tipo
  contaTexto: string;                 // Conta original (texto bruto)
  fazendaTexto: string;               // Fazenda original
  fornecedor: string;                 // Fornecedor original
  subcentro: string;                  // Subcentro original
  produto: string;                    // Produto
  documento: string;                  // Documento (normalizado pra string)
  observacao: string;                 // Obs

  // flags detectadas na auditoria
  flags: {
    semDataRef: boolean;                // 76% das linhas
    competenciaForaDoMes: boolean;      // ano_mes != data_competencia.YYYY-MM
    tipoInconsistente: boolean;         // 2-Saídas em arquivo de receber
    contaInvalida: boolean;             // Conta = '-'
    impreciFloat: boolean;              // valor com decimal IEEE 754 problemático
  };

  // raw original pra debug/tooltip
  raw: ExcelLinhaRaw;
}

export interface LoteExcel {
  loteId: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  hashConteudo: string;  // SHA-256 dos bytes (apenas para identificação no front)
  parsedAt: string;      // ISO timestamp
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  erros: string[];
  linhas: ExcelLinhaNormalizada[];
}

// Resultado do motor de match para UMA linha Excel
export interface MatchResult {
  excelKey: string;            // chaveLinha (hash determinístico — ver linhaKey.ts)
  ofxIdMatched: string | null; // id do extrato_bancario_v2 que casou; null se nenhum
  score: number;               // 0-100
  faixa: 'forte' | 'fraco' | 'nenhum';
  ofxIdCandidatos: string[];   // top 3 candidatos (mesmo se faixa='nenhum')
  detalheScore: {
    valorBate: boolean;            // gate obrigatório
    diasDistancia: number | null;  // dias entre data Excel e data OFX
    pontosData: number;
    pontosNome: number;
    similaridadeNome: number;      // 0-1
    pontosConta: number;           // 0 ou 10
    pontosFazenda: number;         // 0 ou 3
  };
}

// Estado consolidado do preview (vive em useState)
export interface PreviewState {
  ativo: boolean;
  lotes: LoteExcel[];
  matches: Map<string, MatchResult>;  // key = chaveLinha (hash determinístico — ver linhaKey.ts)
}
