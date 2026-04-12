export interface ContaSaldoRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
}

export interface SaldoV2SourceRow {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  status_mes: string;
  origem_saldo: string | null;
  origem_saldo_inicial: string;
  observacao: string | null;
}

export interface SaldoLegacySourceRow {
  id: string;
  ano_mes: string;
  conta_banco: string;
  fazenda_id: string;
  saldo_final: number;
}

export interface MovimentoResumoMap {
  [key: string]: {
    entradas: number;
    saidas: number;
  };
}

export interface UnifiedSaldoRow {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  conta_bancaria_id_v2: string | null;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  status_mes: string;
  origem_saldo: string | null;
  origem_saldo_inicial: string;
  observacao: string | null;
  fonte: 'v2' | 'legado';
  conta_label: string;
  tipo_conta: string | null;
  legacy_conta_banco: string | null;
}

function normalizeContaText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCodigoConta(value: string | null | undefined): number | null {
  const matches = (value || '').match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  return Number.parseInt(matches[matches.length - 1], 10);
}

function normalizeLegacyLabel(value: string): string {
  return value
    .replace(/\bpecu[aá]ria\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLegacyConta(contaBanco: string): { tipo: string | null; codigo: number | null; label: string } {
  const trimmed = contaBanco.trim();
  const codeMatch = trimmed.match(/^(cc|inv|cartao)\s*-\s*0*(\d+)\s*\|\s*(.+)$/i);

  if (codeMatch) {
    return {
      tipo: codeMatch[1].toLowerCase(),
      codigo: Number.parseInt(codeMatch[2], 10),
      label: normalizeLegacyLabel(codeMatch[3]),
    };
  }

  const pipeTail = trimmed.includes('|') ? trimmed.split('|').slice(1).join('|').trim() : trimmed;

  return {
    tipo: null,
    codigo: null,
    label: normalizeLegacyLabel(pipeTail) || trimmed,
  };
}

function prevAnoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  if (!ano || !mes) return anoMes;
  if (mes === 1) return `${ano - 1}-12`;
  return `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

export function buildSaldosAnosDisponiveis({
  saldosV2,
  saldosLegacy,
  lancamentos,
  currentYear = String(new Date().getFullYear()),
}: {
  saldosV2: Array<{ ano_mes: string | null }>;
  saldosLegacy: Array<{ ano_mes: string | null }>;
  lancamentos: Array<{ ano_mes: string | null }>;
  currentYear?: string;
}): string[] {
  const anos = new Set<string>([currentYear]);

  [saldosV2, saldosLegacy, lancamentos].forEach((rows) => {
    rows.forEach((row) => {
      if (row.ano_mes) anos.add(row.ano_mes.slice(0, 4));
    });
  });

  return Array.from(anos).sort((a, b) => b.localeCompare(a));
}

export function buildUnifiedSaldos({
  v2Saldos,
  legacySaldos,
  contas,
  movSummary,
}: {
  v2Saldos: SaldoV2SourceRow[];
  legacySaldos: SaldoLegacySourceRow[];
  contas: ContaSaldoRef[];
  movSummary: MovimentoResumoMap;
}): UnifiedSaldoRow[] {
  const contasById = new Map(contas.map((conta) => [conta.id, conta]));
  const contasByName = new Map<string, ContaSaldoRef>();
  const contasByTypeCode = new Map<string, ContaSaldoRef>();

  contas.forEach((conta) => {
    [conta.nome_exibicao, conta.nome_conta].forEach((nome) => {
      const key = normalizeContaText(nome);
      if (key && !contasByName.has(key)) contasByName.set(key, conta);
    });

    const tipo = (conta.tipo_conta || '').trim().toLowerCase();
    const codigo = parseCodigoConta(conta.codigo_conta);
    if (tipo && codigo !== null && !contasByTypeCode.has(`${tipo}|${codigo}`)) {
      contasByTypeCode.set(`${tipo}|${codigo}`, conta);
    }
  });

  const v2Unified: UnifiedSaldoRow[] = v2Saldos.map((row) => {
    const conta = contasById.get(row.conta_bancaria_id);
    return {
      id: row.id,
      ano_mes: row.ano_mes,
      conta_bancaria_id: row.conta_bancaria_id,
      conta_bancaria_id_v2: row.conta_bancaria_id,
      fazenda_id: row.fazenda_id,
      saldo_inicial: Number(row.saldo_inicial) || 0,
      saldo_final: Number(row.saldo_final) || 0,
      fechado: Boolean(row.fechado),
      status_mes: row.status_mes || 'aberto',
      origem_saldo: row.origem_saldo || null,
      origem_saldo_inicial: row.origem_saldo_inicial || 'manual',
      observacao: row.observacao || null,
      fonte: 'v2' as const,
      conta_label: conta?.nome_exibicao || conta?.nome_conta || row.conta_bancaria_id,
      tipo_conta: conta?.tipo_conta || null,
      legacy_conta_banco: null,
    };
  });

  const v2Keys = new Set(v2Unified.map((row) => `${row.fazenda_id}|${row.ano_mes}|${row.conta_bancaria_id}`));

  const legacyBase: UnifiedSaldoRow[] = legacySaldos
    .map((row) => {
      const parsed = parseLegacyConta(row.conta_banco);
      const byTypeCode = parsed.tipo && parsed.codigo !== null
        ? contasByTypeCode.get(`${parsed.tipo}|${parsed.codigo}`)
        : null;
      const byRawName = contasByName.get(normalizeContaText(row.conta_banco));
      const byLabelName = contasByName.get(normalizeContaText(parsed.label));
      const conta = byTypeCode || byRawName || byLabelName || null;
      const contaId = conta?.id || null;
      const contaLabel = conta?.nome_exibicao || conta?.nome_conta || parsed.label || row.conta_banco;
      const displayId = contaId || `legacy:${normalizeContaText(row.conta_banco) || row.id}`;

      return {
        id: `legacy:${row.id}`,
        ano_mes: row.ano_mes,
        conta_bancaria_id: displayId,
        conta_bancaria_id_v2: contaId,
        fazenda_id: row.fazenda_id,
        saldo_inicial: 0,
        saldo_final: Number(row.saldo_final) || 0,
        fechado: false,
        status_mes: 'aberto',
        origem_saldo: null,
        origem_saldo_inicial: 'manual',
        observacao: null,
        fonte: 'legado' as const,
        conta_label: contaLabel,
        tipo_conta: conta?.tipo_conta || parsed.tipo || null,
        legacy_conta_banco: row.conta_banco,
      };
    })
    .filter((row) => !row.conta_bancaria_id_v2 || !v2Keys.has(`${row.fazenda_id}|${row.ano_mes}|${row.conta_bancaria_id_v2}`));

  const combined = [...v2Unified, ...legacyBase].sort((a, b) => {
    return a.ano_mes.localeCompare(b.ano_mes)
      || a.fazenda_id.localeCompare(b.fazenda_id)
      || a.conta_label.localeCompare(b.conta_label);
  });

  const finalByKey = new Map<string, number>();

  return combined.map((row) => {
    const chainId = row.conta_bancaria_id_v2 || row.conta_bancaria_id;
    const currentKey = `${row.fazenda_id}|${row.ano_mes}|${chainId}`;

    if (row.fonte === 'v2') {
      finalByKey.set(currentKey, row.saldo_final);
      return row;
    }

    const previousKey = `${row.fazenda_id}|${prevAnoMes(row.ano_mes)}|${chainId}`;
    const previousFinal = finalByKey.get(previousKey);
    const movimentoKey = row.conta_bancaria_id_v2 ? `${row.conta_bancaria_id_v2}|${row.ano_mes}` : null;
    const movimento = movimentoKey ? movSummary[movimentoKey] : undefined;

    const saldoInicial = previousFinal !== undefined
      ? previousFinal
      : movimento
        ? row.saldo_final - movimento.entradas + movimento.saidas
        : 0;

    const normalizedRow: UnifiedSaldoRow = {
      ...row,
      saldo_inicial: saldoInicial,
      origem_saldo_inicial: previousFinal !== undefined
        ? 'automatico'
        : movimento
          ? 'calculado_legado'
          : 'manual',
    };

    finalByKey.set(currentKey, normalizedRow.saldo_final);
    return normalizedRow;
  });
}
