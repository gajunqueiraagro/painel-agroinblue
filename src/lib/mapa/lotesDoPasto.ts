/**
 * MAPA-PAINEL-LOTE-UA-01 (homologação do Gabriel 02/11 07:22) — o título da tabela do pasto no painel do Gestor é o LOTE do mês:
 * um lote = "Lote Vacas paridas" (o nome que já começa com "Lote" não repete a palavra); mais de um = "Lotes: A · B" (na ordem em que
 * aparecem nas linhas); nenhum = "Sem lote"; sem fechamento no mês = "Lote —" (dado ausente, nunca "Sem lote"). Puro.
 */
export interface TituloDosLotes {
  titulo: string;
  /** mais de um lote: a tabela mostra o lote de cada linha */
  varios: boolean;
}

function comPalavraLote(nome: string): string {
  return /^lote\b/i.test(nome) ? nome : `Lote ${nome}`;
}

export function tituloDosLotes(linhas: readonly { lote: string | null }[], temFechamento: boolean): TituloDosLotes {
  if (!temFechamento) return { titulo: 'Lote —', varios: false };
  const lotes: string[] = [];
  for (const l of linhas) {
    const n = l.lote?.trim();
    if (n && !lotes.includes(n)) lotes.push(n);
  }
  if (lotes.length === 0) return { titulo: 'Sem lote', varios: false };
  if (lotes.length === 1) return { titulo: comPalavraLote(lotes[0]), varios: false };
  return { titulo: `Lotes: ${lotes.join(' · ')}`, varios: true };
}
