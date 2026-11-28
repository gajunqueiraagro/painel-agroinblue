/**
 * REBANHO-ORGAO-01 F3 v3 (mock aprovado 27/11) — o "Relatório de sugestão para declaração" (Exportar ▾ Excel / PDF), para o contador
 * ou o declarante. NADA É DECLARADO PELO SISTEMA: o relatório leva a sugestão (a MESMA conta da tela), o que foi editado e cada
 * diferença com a causa que o sistema conhece (sem causa = "sem causa no sistema", nunca inventada).
 *   · Excel: uma aba por fazenda no formato das planilhas do Gabriel (`linhasDaPlanilha`) + a aba "Diferenças";
 *   · PDF: a mesma tabela da tela por fazenda + as diferenças.
 * As linhas são puras (testadas); o arquivo se monta só no gesto (os pacotes da casa, sob demanda pelo `importarDoApp`).
 */
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { FAIXAS, ROTULO_DA_FAIXA, type Sexo } from './tipos';
import { linhasDaPlanilha } from './planilhaDaDeclaracao';
import type { Explicacao, PropostaDaFazenda } from './propostaDaDeclaracao';

export interface FazendaDoRelatorio {
  nome: string;
  /** 'dd/mm/aaaa' — a data do saldo do órgão (e do sistema comparado) */
  dataDoSaldo: string | null;
  proposta: PropostaDaFazenda | null;
  explicacoes: Explicacao[];
}
export interface Relatorio { cliente: string; etapa: string; orgao: string; emitidoEm: string; fazendas: FazendaDoRelatorio[] }

export const AVISO_DO_RELATORIO = 'Sugestão do sistema AGROinBLUE: quem declara ao órgão é o produtor ou o contador. Confira antes de declarar.';
const SEXO: Record<Sexo, string> = { F: 'Fêmea', M: 'Macho' };
const CLASSE: Record<Explicacao['classe'], string> = {
  a: 'morte/consumo não declarado', b: 'falta lançar no sistema', c: 'saída/entrada sem GTA', d: 'sexo/faixa declarado antes', e: 'GTA/nota ≠ embarque',
};
const comSinal = (v: number) => (v > 0 ? `+${v}` : String(v));

/** As diferenças (sistema − sugerido ≠ 0) de cada fazenda, cada uma com as causas que o sistema conhece para aquele sexo. */
export function linhasDasDiferencas(r: Relatorio): string[][] {
  const out: string[][] = [];
  for (const f of r.fazendas) {
    if (!f.proposta) continue;
    for (const s of ['F', 'M'] as const) {
      for (const g of f.proposta.sistema[s]) {
        if (g.dif === null || g.dif === 0) continue;
        const faixa = g.de === g.ate ? ROTULO_DA_FAIXA[g.de] : `${ROTULO_DA_FAIXA[g.de]} a ${ROTULO_DA_FAIXA[g.ate]}`;
        const causas = f.explicacoes.filter((x) => x.sexo === s || x.sexo === null);
        out.push([f.nome, `${SEXO[s]} ${faixa}`, comSinal(g.dif),
          causas.length ? causas.map((x) => `(${CLASSE[x.classe]}) ${x.texto}`).join(' · ') : 'sem causa no sistema']);
      }
    }
  }
  return out;
}

/** A tabela da tela (por fazenda), em texto: Sexo · Faixa · Órgão · Nascimentos · Mortes/consumo · Passa · Entra · Sugerido · Sistema · Diferença. */
export const CABECALHO_DO_PDF = ['Sexo', 'Faixa (órgão)', 'Órgão', 'Nascimentos', 'Mortes/consumo', 'Passa p/ próxima', 'Entra', 'Sugerido', 'Sistema', 'Diferença'];
export function linhasDaTabela(p: PropostaDaFazenda): string[][] {
  const t = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR'));
  const out: string[][] = [];
  for (const s of ['F', 'M'] as const) {
    for (const k of FAIXAS) {
      const l = p.linhas[s][k];
      const g = p.sistema[s].find((x) => k >= x.de && k <= x.ate);
      const primeira = !!g && g.de === k;
      out.push([SEXO[s], ROTULO_DA_FAIXA[k], t(l.iagro), k === 0 ? t(l.nascimentos) : '—', t(l.mortesConsumo), k === 3 ? '—' : t(l.passa),
        k === 0 ? '—' : t(l.entra), t(l.proposto), g && primeira ? t(g.cab) + (g.ate > g.de ? ' (bloco)' : '') : g ? '' : '—',
        g && primeira ? (g.dif === null ? '—' : comSinal(g.dif)) : g ? '' : '—']);
    }
  }
  return out;
}

const nomeDaAba = (nome: string, usados: Set<string>) => {
  let n = nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Fazenda';
  for (let i = 2; usados.has(n); i++) n = `${n.slice(0, 26)} ${i}`;
  usados.add(n);
  return n;
};

export async function baixarRelatorioExcel(nomeDoArquivo: string, r: Relatorio): Promise<void> {
  const XLSX = await importarDoApp(() => import('xlsx'));
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const f of r.fazendas) {
    if (!f.proposta) continue;
    const { linhas, mesclas } = linhasDaPlanilha(f.nome, f.dataDoSaldo ?? r.emitidoEm, f.proposta);
    const ws = XLSX.utils.aoa_to_sheet([...linhas, [], [null, AVISO_DO_RELATORIO]]);
    ws['!merges'] = mesclas.map((m) => ({ s: { r: m.linha, c: m.coluna }, e: { r: m.linha + m.linhas - 1, c: m.coluna } }));
    XLSX.utils.book_append_sheet(wb, ws, nomeDaAba(f.nome, usados));
  }
  const dif = XLSX.utils.aoa_to_sheet([[`${r.cliente} · ${r.orgao} · etapa de ${r.etapa}`], [AVISO_DO_RELATORIO], [],
    ['Fazenda', 'Sexo e faixa', 'Diferença', 'Causa'], ...linhasDasDiferencas(r)]);
  XLSX.utils.book_append_sheet(wb, dif, nomeDaAba('Diferenças', usados));
  XLSX.writeFile(wb, nomeDoArquivo);
}

export async function baixarRelatorioPdf(nomeDoArquivo: string, r: Relatorio): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([importarDoApp(() => import('jspdf')), importarDoApp(() => import('jspdf-autotable'))]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const azul: [number, number, number] = [29, 53, 87];
  doc.setFontSize(13); doc.text('Relatório de sugestão para declaração', 12, 14);
  doc.setFontSize(9); doc.text(`${r.cliente} · ${r.orgao} · etapa de ${r.etapa} · emitido em ${r.emitidoEm}`, 12, 20);
  doc.text(AVISO_DO_RELATORIO, 12, 25);
  let y = 30;
  for (const f of r.fazendas) {
    if (!f.proposta) continue;
    doc.setFontSize(10); doc.text(`${f.nome}${f.dataDoSaldo ? ` · órgão e sistema em ${f.dataDoSaldo}` : ''}`, 12, y + 4);
    autoTable(doc, { startY: y + 6, head: [CABECALHO_DO_PDF], body: linhasDaTabela(f.proposta), styles: { fontSize: 7.5, cellPadding: 1 },
      headStyles: { fillColor: azul, fontSize: 7.5 }, columnStyles: Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9].map((i) => [i, { halign: 'right' }])),
      margin: { left: 12, right: 12 }, didDrawPage: (d) => { y = d.cursor?.y ?? y; } });
  }
  const difs = linhasDasDiferencas(r);
  doc.setFontSize(10); doc.text('Diferenças e causas', 12, y + 8);
  autoTable(doc, { startY: y + 10, head: [['Fazenda', 'Sexo e faixa', 'Diferença', 'Causa']], body: difs.length ? difs : [['—', '—', '—', 'nenhuma diferença']],
    styles: { fontSize: 7.5, cellPadding: 1 }, headStyles: { fillColor: azul, fontSize: 7.5 }, columnStyles: { 2: { halign: 'right' }, 3: { cellWidth: 160 } },
    margin: { left: 12, right: 12 } });
  doc.save(nomeDoArquivo);
}
