/**
 * Utilitários de exportação (Excel e PDF) — Relatórios de Rebanho
 *
 * Arquitetura: as funções de export aceitam dados pré-computados da view oficial
 * (vw_zoot_fazenda_mensal / vw_zoot_categoria_mensal) quando disponíveis.
 * Fallback: cálculo local por movimentações (mantido para compatibilidade offline).
 *
 * Regra: "Movimentação explica. Fechamento define. View distribui."
 * O export de movimentações detalha o fluxo; o saldo oficial vem da view.
 */

import { Lancamento, SaldoInicial, CATEGORIAS, isEntrada, isReclassificacao, TODOS_TIPOS } from '@/types/cattle';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import type { ZootMensal } from '@/hooks/useZootMensal';
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';

const MESES_COLS = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

type FluxoTipo = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

const LINHAS_FLUXO: { tipo: FluxoTipo; label: string; sinal: '+' | '-' }[] = [
  { tipo: 'nascimento', label: 'Nascimentos', sinal: '+' },
  { tipo: 'compra', label: 'Compras', sinal: '+' },
  { tipo: 'transferencia_entrada', label: 'Transf. Entrada', sinal: '+' },
  { tipo: 'abate', label: 'Abates', sinal: '-' },
  { tipo: 'venda', label: 'Vendas em Pé', sinal: '-' },
  { tipo: 'transferencia_saida', label: 'Transf. Saída', sinal: '-' },
  { tipo: 'consumo', label: 'Consumo', sinal: '-' },
  { tipo: 'morte', label: 'Mortes', sinal: '-' },
];

const COLUNAS_EVOL = [
  { tipo: 'nascimento', label: 'Nasc.', entrada: true },
  { tipo: 'compra', label: 'Compras', entrada: true },
  { tipo: 'transferencia_entrada', label: 'Transf.E', entrada: true },
  { tipo: 'reclassificacao_entrada', label: 'Recl.E', entrada: true },
  { tipo: 'abate', label: 'Abates', entrada: false },
  { tipo: 'venda', label: 'Vendas', entrada: false },
  { tipo: 'transferencia_saida', label: 'Transf.S', entrada: false },
  { tipo: 'consumo', label: 'Consumo', entrada: false },
  { tipo: 'morte', label: 'Mortes', entrada: false },
  { tipo: 'reclassificacao_saida', label: 'Recl.S', entrada: false },
];

// ── helpers ──

/** Indexa array de ZootMensal por mes_key */
function indexZootByMes(rows: ZootMensal[]): Record<string, ZootMensal> {
  const map: Record<string, ZootMensal> = {};
  for (const r of rows) map[r.mes_key] = r;
  return map;
}

function calcFluxoAnual(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: string, zootMensal?: ZootMensal[]) {
  const saldoInicialAno = saldosIniciais.filter(s => s.ano === Number(ano)).reduce((sum, s) => sum + s.quantidade, 0);
  const lancAno = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy') === ano; } catch { return false; } });

  const porMesTipo: Record<string, Record<FluxoTipo, number>> = {};
  MESES_COLS.forEach(m => {
    porMesTipo[m.key] = {} as Record<FluxoTipo, number>;
    LINHAS_FLUXO.forEach(li => { porMesTipo[m.key][li.tipo] = 0; });
  });
  lancAno.forEach(l => {
    const mes = format(parseISO(l.data), 'MM');
    if (porMesTipo[mes] && !isReclassificacao(l.tipo)) {
      const tipo = l.tipo as FluxoTipo;
      if (porMesTipo[mes][tipo] !== undefined) porMesTipo[mes][tipo] += l.quantidade;
    }
  });

  // Saldo: priorizar view oficial quando disponível
  const zByMes = zootMensal ? indexZootByMes(zootMensal) : null;

  const saldoInicioMes: Record<string, number> = {};
  let acum = saldoInicialAno;
  MESES_COLS.forEach((m, i) => {
    const z = zByMes?.[m.key];
    saldoInicioMes[m.key] = z?.cabecas_inicio ?? acum;
    const ent = LINHAS_FLUXO.filter(li => li.sinal === '+').reduce((s, li) => s + porMesTipo[m.key][li.tipo], 0);
    const sai = LINHAS_FLUXO.filter(li => li.sinal === '-').reduce((s, li) => s + porMesTipo[m.key][li.tipo], 0);
    acum += ent - sai;
  });

  const saldoFinalAno = zByMes?.['12']?.cabecas_final ?? acum;

  return { porMesTipo, saldoInicioMes, saldoFinalAno, saldoInicialAno };
}

/**
 * calcEvolucaoCategoria — Evolução por categoria para um mês.
 *
 * Prioriza dados da view oficial (zootCategorias) quando disponíveis.
 * Fallback: cálculo local por movimentações (compatibilidade offline).
 *
 * Fonte oficial: vw_zoot_categoria_mensal via useRebanhoOficial.
 */
function calcEvolucaoCategoria(
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  ano: string,
  mes: string,
  zootCategorias?: ZootCategoriaMensal[],
) {
  const mesNum = Number(mes);

  // ── Caminho oficial: dados da view ──
  if (zootCategorias && zootCategorias.length > 0) {
    const catsMes = zootCategorias.filter(r => r.mes === mesNum);
    if (catsMes.length > 0) {
      return CATEGORIAS.map(cat => {
        const row = catsMes.find(r => r.categoria_codigo === cat.value);
        if (!row) {
          return { label: cat.label, saldoInicioMes: 0, movs: COLUNAS_EVOL.map(() => 0), saldoFinal: 0 };
        }
        // Mapear movimentações da view para as colunas do Excel
        const movs = COLUNAS_EVOL.map(col => {
          switch (col.tipo) {
            case 'nascimento': return row.entradas_externas > 0 ? 0 : 0; // nascimento incluso em entradas_externas na view
            case 'compra': return 0; // detalhamento por tipo não disponível na view
            case 'transferencia_entrada': return 0;
            case 'reclassificacao_entrada': return row.evol_cat_entrada;
            case 'abate': return 0;
            case 'venda': return 0;
            case 'transferencia_saida': return 0;
            case 'consumo': return 0;
            case 'morte': return 0;
            case 'reclassificacao_saida': return row.evol_cat_saida;
            default: return 0;
          }
        });
        // Entradas/saídas externas consolidadas da view
        movs[0] = row.entradas_externas; // Coluna "Nasc." → entradas externas consolidadas
        movs[4] = row.saidas_externas;   // Coluna "Abates" → saídas externas consolidadas
        // Zerar os demais para evitar dupla contagem (view já consolida)
        movs[1] = 0; movs[2] = 0; // compra, transf.E já inclusos em entradas_externas
        movs[5] = 0; movs[6] = 0; movs[7] = 0; movs[8] = 0; // venda, transf.S, consumo, morte já inclusos

        return {
          label: cat.label,
          saldoInicioMes: row.saldo_inicial,
          movs,
          saldoFinal: row.saldo_final,
        };
      });
    }
  }

  // ── Fallback: cálculo por movimentações (offline) ──
  const mesKey = `${ano}-${mes}`;
  const filtrados = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy-MM') === mesKey; } catch { return false; } });
  const anteriores = lancamentos.filter(l => { try { const k = format(parseISO(l.data), 'yyyy-MM'); return format(parseISO(l.data), 'yyyy') === ano && k < mesKey; } catch { return false; } });

  return CATEGORIAS.map(cat => {
    const saldoAno = saldosIniciais.filter(s => s.ano === Number(ano) && s.categoria === cat.value).reduce((sum, s) => sum + s.quantidade, 0);
    const entAnt = anteriores.filter(l => l.categoria === cat.value && isEntrada(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
    const saiAnt = anteriores.filter(l => l.categoria === cat.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo)).reduce((s, l) => s + l.quantidade, 0);
    const reclEntAnt = anteriores.filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value).reduce((s, l) => s + l.quantidade, 0);
    const reclSaiAnt = anteriores.filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value).reduce((s, l) => s + l.quantidade, 0);
    const saldoInicioMes = saldoAno + entAnt - saiAnt + reclEntAnt - reclSaiAnt;

    const getQtd = (tipo: string) => {
      if (tipo === 'reclassificacao_entrada') return filtrados.filter(l => l.tipo === 'reclassificacao' && l.categoriaDestino === cat.value).reduce((s, l) => s + l.quantidade, 0);
      if (tipo === 'reclassificacao_saida') return filtrados.filter(l => l.tipo === 'reclassificacao' && l.categoria === cat.value).reduce((s, l) => s + l.quantidade, 0);
      return filtrados.filter(l => l.tipo === tipo && l.categoria === cat.value).reduce((s, l) => s + l.quantidade, 0);
    };
    const movs = COLUNAS_EVOL.map(col => getQtd(col.tipo));
    const totalEnt = movs.slice(0, 4).reduce((a, b) => a + b, 0);
    const totalSai = movs.slice(4).reduce((a, b) => a + b, 0);
    return { label: cat.label, saldoInicioMes, movs, saldoFinal: saldoInicioMes + totalEnt - totalSai };
  });
}

function calcCategoriasMes(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[]) {
  const mesesSet = new Set<string>();
  lancamentos.forEach(l => { try { mesesSet.add(format(parseISO(l.data), 'yyyy-MM')); } catch {} });
  const meses = Array.from(mesesSet).sort();
  if (meses.length === 0) return { meses: [], dados: {} as any };

  const primeiroAno = Number(meses[0].split('-')[0]);
  const dados: Record<string, { saldoInicial: number; meses: Record<string, number> }> = {};

  CATEGORIAS.forEach(c => {
    const saldoIni = saldosIniciais.filter(s => s.ano === primeiroAno && s.categoria === c.value).reduce((sum, s) => sum + s.quantidade, 0);
    dados[c.value] = { saldoInicial: saldoIni, meses: {} };
    let acum = saldoIni;
    meses.forEach(mes => {
      const ent = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && isEntrada(l.tipo); } catch { return false; } }).reduce((s, l) => s + l.quantidade, 0);
      const sai = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.categoria === c.value && !isEntrada(l.tipo) && !isReclassificacao(l.tipo); } catch { return false; } }).reduce((s, l) => s + l.quantidade, 0);
      const reclEnt = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoriaDestino === c.value; } catch { return false; } }).reduce((s, l) => s + l.quantidade, 0);
      const reclSai = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy-MM') === mes && l.tipo === 'reclassificacao' && l.categoria === c.value; } catch { return false; } }).reduce((s, l) => s + l.quantidade, 0);
      acum += ent - sai + reclEnt - reclSai;
      dados[c.value].meses[mes] = acum;
    });
  });

  return { meses, dados };
}

// ── Resumo calc ──
function calcResumo(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: string, mes: string, zootMensal?: ZootMensal[]) {
  const saldoInicialAno = saldosIniciais.filter(s => s.ano === Number(ano)).reduce((sum, s) => sum + s.quantidade, 0);

  const filtrados = lancamentos.filter(l => {
    try {
      const d = parseISO(l.data);
      const a = format(d, 'yyyy');
      const m = format(d, 'MM');
      if (a !== ano) return false;
      if (mes !== 'todos' && m !== mes) return false;
      return true;
    } catch { return false; }
  });

  let saldoInicialPeriodo = saldoInicialAno;
  if (mes !== 'todos') {
    const mesNum = Number(mes);
    // Tentar usar view oficial
    if (zootMensal) {
      const z = zootMensal.find(r => r.mes === mesNum);
      if (z) saldoInicialPeriodo = z.cabecas_inicio;
    } else {
      const acum = lancamentos.filter(l => {
        try { const d = parseISO(l.data); return format(d, 'yyyy') === ano && Number(format(d, 'MM')) < mesNum; } catch { return false; }
      }).reduce((sum, l) => {
        if (isEntrada(l.tipo)) return sum + l.quantidade;
        if (!isReclassificacao(l.tipo)) return sum - l.quantidade;
        return sum;
      }, 0);
      saldoInicialPeriodo += acum;
    }
  }

  const totalEntradas = filtrados.filter(l => isEntrada(l.tipo)).reduce((sum, l) => sum + l.quantidade, 0);
  const totalSaidas = filtrados.filter(l => !isEntrada(l.tipo) && !isReclassificacao(l.tipo)).reduce((sum, l) => sum + l.quantidade, 0);

  // Saldo final: priorizar view oficial
  let saldoFinal = saldoInicialPeriodo + totalEntradas - totalSaidas;
  if (zootMensal && mes !== 'todos') {
    const z = zootMensal.find(r => r.mes === Number(mes));
    if (z) saldoFinal = z.cabecas_final;
  } else if (zootMensal && mes === 'todos') {
    const z12 = zootMensal.find(r => r.mes === 12);
    if (z12) saldoFinal = z12.cabecas_final;
  }

  return { saldoInicialPeriodo, totalEntradas, totalSaidas, saldoFinal };
}

// ── EXCEL EXPORT ──
export function exportToExcel(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: string, zootMensal?: ZootMensal[], zootCategorias?: ZootCategoriaMensal[]) {
  const resumo = calcResumo(lancamentos, saldosIniciais, ano, 'todos', zootMensal);
  const resumoData = [
    ['Resumo - ' + ano],
    [],
    ['Saldo Inicial', resumo.saldoInicialPeriodo],
    ['Entradas', resumo.totalEntradas],
    ['Saídas', resumo.totalSaidas],
    ['Saldo Final', resumo.saldoFinal],
  ];

  const fluxo = calcFluxoAnual(lancamentos, saldosIniciais, ano, zootMensal);
  const fluxoHeader = ['Movimentação', ...MESES_COLS.map(m => m.label), 'Total'];
  const fluxoRows: (string | number)[][] = [fluxoHeader];
  fluxoRows.push(['Saldo Início', ...MESES_COLS.map(m => fluxo.saldoInicioMes[m.key]), fluxo.saldoInicialAno]);
  LINHAS_FLUXO.forEach(li => {
    const total = MESES_COLS.reduce((s, m) => s + fluxo.porMesTipo[m.key][li.tipo], 0);
    fluxoRows.push([li.label, ...MESES_COLS.map(m => fluxo.porMesTipo[m.key][li.tipo]), total]);
  });
  const zByMes = zootMensal ? indexZootByMes(zootMensal) : null;
  const saldosFinal = MESES_COLS.map((m, i) => {
    const z = zByMes?.[m.key];
    if (z) return z.cabecas_final;
    if (i < 11) return fluxo.saldoInicioMes[MESES_COLS[i + 1].key];
    return fluxo.saldoFinalAno;
  });
  fluxoRows.push(['Saldo Final', ...saldosFinal, fluxo.saldoFinalAno]);

  const sheets: Array<{ name: string; mode: 'aoa'; rows: (string | number)[][] }> = [
    { name: 'Resumo', mode: 'aoa', rows: resumoData },
    { name: 'Fluxo Anual', mode: 'aoa', rows: fluxoRows },
  ];

  MESES_COLS.forEach(mes => {
    const dados = calcEvolucaoCategoria(lancamentos, saldosIniciais, ano, mes.key, zootCategorias);
    const header = ['Categoria', 'Saldo Ini.', ...COLUNAS_EVOL.map(c => c.label), 'Saldo Fin.'];
    const rows: (string | number)[][] = [header];
    dados.forEach(d => rows.push([d.label, d.saldoInicioMes, ...d.movs, d.saldoFinal]));
    const totais = {
      saldoIni: dados.reduce((s, d) => s + d.saldoInicioMes, 0),
      movs: COLUNAS_EVOL.map((_, i) => dados.reduce((s, d) => s + d.movs[i], 0)),
      saldoFin: dados.reduce((s, d) => s + d.saldoFinal, 0),
    };
    rows.push(['TOTAL', totais.saldoIni, ...totais.movs, totais.saldoFin]);
    sheets.push({ name: `Evol ${mes.label}`, mode: 'aoa', rows });
  });

  const catMes = calcCategoriasMes(lancamentos, saldosIniciais);
  if (catMes.meses.length > 0) {
    const header = ['Categoria', 'Saldo Ini.', ...catMes.meses.map(m => format(parseISO(m + '-01'), 'MMM/yy', { locale: ptBR }))];
    const rows: (string | number)[][] = [header];
    CATEGORIAS.forEach(c => {
      rows.push([c.label, catMes.dados[c.value]?.saldoInicial || 0, ...catMes.meses.map(m => catMes.dados[c.value]?.meses[m] || 0)]);
    });
    const totalIni = CATEGORIAS.reduce((s, c) => s + (catMes.dados[c.value]?.saldoInicial || 0), 0);
    rows.push(['TOTAL', totalIni, ...catMes.meses.map(m => CATEGORIAS.reduce((s, c) => s + (catMes.dados[c.value]?.meses[m] || 0), 0))]);
    sheets.push({ name: 'Cat por Mês', mode: 'aoa', rows });
  }

  const lancAno = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy') === ano; } catch { return false; } });
  const lancHeader = ['Data', 'Tipo', 'Categoria', 'Quantidade', 'Cat. Destino', 'Observação'];
  const lancRows: (string | number)[][] = [lancHeader];
  lancAno.sort((a, b) => a.data.localeCompare(b.data)).forEach(l => {
    const tipoLabel = TODOS_TIPOS.find(t => t.value === l.tipo)?.label || l.tipo;
    const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label || l.categoria;
    const catDest = l.categoriaDestino ? CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label || '' : '';
    lancRows.push([format(parseISO(l.data), 'dd/MM/yyyy'), tipoLabel, catLabel, l.quantidade, catDest, l.observacao || '']);
  });
  sheets.push({ name: 'Lançamentos', mode: 'aoa', rows: lancRows });

  triggerXlsxDownload({
    filename: `rebanho_${ano}.xlsx`,
    sheets,
  });
}

// ── PDF EXPORT ──
export function exportToPDF(lancamentos: Lancamento[], saldosIniciais: SaldoInicial[], ano: string, zootMensal?: ZootMensal[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.text(`Relatório de Rebanho - ${ano}`, pageW / 2, 15, { align: 'center' });

  // 1. Resumo
  const resumo = calcResumo(lancamentos, saldosIniciais, ano, 'todos', zootMensal);
  doc.setFontSize(12);
  doc.text('Resumo Anual', 14, 25);
  autoTable(doc, {
    startY: 28,
    head: [['Indicador', 'Quantidade']],
    body: [
      ['Saldo Inicial', String(resumo.saldoInicialPeriodo)],
      ['Entradas', String(resumo.totalEntradas)],
      ['Saídas', String(resumo.totalSaidas)],
      ['Saldo Final', String(resumo.saldoFinal)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [34, 120, 74] },
    margin: { left: 14, right: 14 },
    tableWidth: 80,
  });

  // 2. Fluxo Anual
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Fluxo Anual', 14, 15);
  const fluxo = calcFluxoAnual(lancamentos, saldosIniciais, ano, zootMensal);
  const fHead = ['Movimentação', ...MESES_COLS.map(m => m.label), 'Total'];
  const fBody: string[][] = [];
  fBody.push(['Saldo Início', ...MESES_COLS.map(m => String(fluxo.saldoInicioMes[m.key])), String(fluxo.saldoInicialAno)]);
  LINHAS_FLUXO.forEach(li => {
    const total = MESES_COLS.reduce((s, m) => s + fluxo.porMesTipo[m.key][li.tipo], 0);
    fBody.push([li.label, ...MESES_COLS.map(m => String(fluxo.porMesTipo[m.key][li.tipo])), String(total)]);
  });
  const zByMes = zootMensal ? indexZootByMes(zootMensal) : null;
  const sfArr = MESES_COLS.map((m, i) => {
    const z = zByMes?.[m.key];
    if (z) return String(z.cabecas_final);
    return String(i < 11 ? fluxo.saldoInicioMes[MESES_COLS[i + 1].key] : fluxo.saldoFinalAno);
  });
  fBody.push(['Saldo Final', ...sfArr, String(fluxo.saldoFinalAno)]);
  autoTable(doc, {
    startY: 20,
    head: [fHead],
    body: fBody,
    theme: 'grid',
    headStyles: { fillColor: [34, 120, 74], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    margin: { left: 10, right: 10 },
  });

  // 3. Lançamentos
  const lancAno = lancamentos.filter(l => { try { return format(parseISO(l.data), 'yyyy') === ano; } catch { return false; } });
  if (lancAno.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Lançamentos', 14, 15);
    const lBody = lancAno.sort((a, b) => a.data.localeCompare(b.data)).map(l => [
      format(parseISO(l.data), 'dd/MM/yyyy'),
      TODOS_TIPOS.find(t => t.value === l.tipo)?.label || l.tipo,
      CATEGORIAS.find(c => c.value === l.categoria)?.label || l.categoria,
      String(l.quantidade),
      l.observacao || '',
    ]);
    autoTable(doc, {
      startY: 20,
      head: [['Data', 'Tipo', 'Categoria', 'Qtd', 'Obs']],
      body: lBody,
      theme: 'grid',
      headStyles: { fillColor: [34, 120, 74] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`rebanho_${ano}.pdf`);
}
