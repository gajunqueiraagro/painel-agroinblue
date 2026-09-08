/**
 * Baixar um CSV — [ENRIQUECER-PROGRESSO-01] (131).
 *
 * ⚠ O MESMO CORPO ESTAVA EM TRÊS LUGARES (`ConferenciaImportacaoDialog`,
 * `ImportacaoFinanceira`, `AuditoriaDuplicidadeTab`): o BOM (`﻿`) que faz o Excel
 * brasileiro abrir o acento certo, o `text/csv;charset=utf-8` e o `revokeObjectURL`. A
 * quarta cópia não se justificava. Os três antigos NÃO migram neste PR — cada um tem o
 * seu formato de linha, e trocá-los junto misturaria três telas homologadas com uma nova.
 *
 * ⚠ O BOM NÃO É DECORAÇÃO: sem ele o Excel lê o arquivo como Latin-1 e "Não conciliado"
 * vira "NÃ£o conciliado" na planilha do produtor.
 */

/** Escapa um campo para CSV: aspas dobradas e o todo entre aspas. */
export const csvCampo = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * Uma linha de CSV para o Excel BRASILEIRO — 133i item 13.
 *
 * ⚠ O SEPARADOR É `;`, E É POR ISSO QUE O ARQUIVO ABRIA EM UMA COLUNA SÓ. O Excel em
 * pt-BR usa o separador de lista do sistema — que é `;` —, então um arquivo com `,`
 * chega inteiro na coluna A. O BOM já resolvia o acento; faltava o separador.
 *
 * ⚠ ASPAS SÓ ONDE PRECISA: com todo campo entre aspas, o Excel ainda abre, mas o
 * conteúdo vira texto e some o alinhamento dos números. Aspas quando há `;`, aspas ou
 * quebra de linha — que é exatamente quando elas mudam o significado.
 *
 * ⚠ NÃO SUBSTITUI `csvCampo`: as outras três telas que o usam têm formato próprio e
 * homologação própria. Trocar todas junto misturaria quatro mudanças numa.
 */
export function csvLinhaPt(campos: readonly unknown[]): string {
  return campos.map((v) => {
    const t = String(v ?? '');
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(';');
}

/**
 * Monta e dispara o download. `linhas` já vem pronta — a primeira costuma ser o cabeçalho.
 * @param nome nome do arquivo, sem extensão; a data entra no fim.
 */
export function baixarCsv(nome: string, linhas: string[]): void {
  const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
