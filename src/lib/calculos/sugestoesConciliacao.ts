/**
 * Sugestões inteligentes de conciliação — lógica compartilhada entre
 * ConciliacaoCategoriaTab e FechamentoTab.
 */

// Cadeia zootécnica
const CADEIA_MACHOS = ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros'];
const CADEIA_FEMEAS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];

function getCadeiaVizinhos(codigo: string): string[] {
  const idxM = CADEIA_MACHOS.indexOf(codigo);
  if (idxM >= 0) {
    const vizinhos: string[] = [];
    if (idxM > 0) vizinhos.push(CADEIA_MACHOS[idxM - 1]);
    if (idxM < CADEIA_MACHOS.length - 1) vizinhos.push(CADEIA_MACHOS[idxM + 1]);
    return vizinhos;
  }
  const idxF = CADEIA_FEMEAS.indexOf(codigo);
  if (idxF >= 0) {
    const vizinhos: string[] = [];
    if (idxF > 0) vizinhos.push(CADEIA_FEMEAS[idxF - 1]);
    if (idxF < CADEIA_FEMEAS.length - 1) vizinhos.push(CADEIA_FEMEAS[idxF + 1]);
    return vizinhos;
  }
  return [];
}

export interface RowData {
  codigo: string;
  nome: string;
  qtdSistema: number;
  qtdPasto: number;
  diferenca: number;
}

export interface Sugestao {
  tipo: 'evolucao' | 'excesso' | 'falta';
  mensagem: string;
  acao?: { origemCodigo: string; destinoCodigo: string; qtd: number };
}

export function gerarSugestoes(rows: RowData[], catMap: Map<string, string>): Sugestao[] {
  const sugestoes: Sugestao[] = [];
  const divergentes = rows.filter(r => r.diferenca !== 0);
  if (divergentes.length === 0) return sugestoes;

  const usados = new Set<string>();

  for (const r of divergentes) {
    if (usados.has(r.codigo)) continue;
    const vizinhos = getCadeiaVizinhos(r.codigo);

    for (const viz of vizinhos) {
      if (usados.has(viz)) continue;
      const vizRow = divergentes.find(d => d.codigo === viz);
      if (!vizRow) continue;

      if (r.diferenca < 0 && vizRow.diferenca > 0 && Math.abs(r.diferenca + vizRow.diferenca) <= 3) {
        const qty = Math.min(Math.abs(r.diferenca), vizRow.diferenca);
        sugestoes.push({
          tipo: 'evolucao',
          mensagem: `${r.nome} tem ${Math.abs(r.diferenca)} cab a mais no sistema e ${vizRow.nome} tem ${vizRow.diferenca} a menos. Sugestão: reclassificar ${qty} cabeça(s) de ${r.nome} → ${vizRow.nome}.`,
          acao: { origemCodigo: r.codigo, destinoCodigo: vizRow.codigo, qtd: qty },
        });
        usados.add(r.codigo);
        usados.add(viz);
        break;
      }
      if (r.diferenca > 0 && vizRow.diferenca < 0 && Math.abs(r.diferenca + vizRow.diferenca) <= 3) {
        const qty = Math.min(r.diferenca, Math.abs(vizRow.diferenca));
        sugestoes.push({
          tipo: 'evolucao',
          mensagem: `${vizRow.nome} tem ${Math.abs(vizRow.diferenca)} cab a mais no sistema e ${r.nome} tem ${r.diferenca} a menos. Sugestão: reclassificar ${qty} cabeça(s) de ${vizRow.nome} → ${r.nome}.`,
          acao: { origemCodigo: vizRow.codigo, destinoCodigo: r.codigo, qtd: qty },
        });
        usados.add(r.codigo);
        usados.add(viz);
        break;
      }
    }
  }

  for (const r of divergentes) {
    if (usados.has(r.codigo)) continue;
    const vizinhos = getCadeiaVizinhos(r.codigo);
    const vizNomes = vizinhos.map(v => catMap.get(v) || v).join(' ou ');

    if (r.diferenca < 0) {
      sugestoes.push({
        tipo: 'excesso',
        mensagem: `${r.nome} (+${Math.abs(r.diferenca)} no sistema): verificar se deveria ter sido evoluído para ${vizNomes || 'outra categoria'}.`,
      });
    } else {
      sugestoes.push({
        tipo: 'falta',
        mensagem: `${r.nome} (-${r.diferenca} no sistema): verificar se animais foram corretamente evoluídos a partir de ${vizNomes || 'outra categoria'}.`,
      });
    }
  }

  return sugestoes;
}
