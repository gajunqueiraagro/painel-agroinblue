/**
 * FIN-LR-SYNC-01 passo c — quais dos arquivos da pasta Downloads são os relatórios do LR (puro, sem navegador).
 * Regra aprovada (Gabriel 14/10/2026): o nome começa por "relatorio-contas-pagar-unificado" / "relatorio-contas-receber-unificado",
 * extensão .xlsx; vale o MAIS NOVO de cada (lastModified). Falta um: diz qual. Mais de 3 dias: avisa a data, não bloqueia.
 */
import { dataLocalISO } from '@/lib/datas/hojeLocal';

export type TipoRelatorioLr = 'pagar' | 'receber';
export const PREFIXO_RELATORIO_LR: Record<TipoRelatorioLr, string> = {
  pagar: 'relatorio-contas-pagar-unificado',
  receber: 'relatorio-contas-receber-unificado',
};
/** Mais velho que isto (em dias, pela data local) ganha o aviso. */
export const DIAS_ATE_AVISAR = 3;

export interface ArquivoDaPasta { nome: string; lastModified: number; tamanho: number }

/** O tipo do relatório pelo nome; nulo = não é relatório do LR. */
export function tipoDoRelatorio(nome: string): TipoRelatorioLr | null {
  const n = nome.trim().toLowerCase();
  if (!n.endsWith('.xlsx')) return null;
  if (n.startsWith(PREFIXO_RELATORIO_LR.pagar)) return 'pagar';
  if (n.startsWith(PREFIXO_RELATORIO_LR.receber)) return 'receber';
  return null;
}

const diasEntre = (de: string, ate: string) =>
  Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000);

export interface EscolhaDaPasta<T> {
  pagar: T | null;
  receber: T | null;
  faltam: TipoRelatorioLr[];
  velhos: { tipo: TipoRelatorioLr; data: string }[];
}

/** O mais novo de cada tipo, o que falta e o que está velho. `hoje` = 'AAAA-MM-DD' local. */
export function escolherRelatorios<T extends ArquivoDaPasta>(lista: readonly T[], hoje: string): EscolhaDaPasta<T> {
  const melhor: Record<TipoRelatorioLr, T | null> = { pagar: null, receber: null };
  for (const a of lista) {
    const t = tipoDoRelatorio(a.nome);
    if (!t) continue;
    const atual = melhor[t];
    if (!atual || a.lastModified > atual.lastModified) melhor[t] = a;
  }
  const tipos: TipoRelatorioLr[] = ['pagar', 'receber'];
  const faltam = tipos.filter(t => !melhor[t]);
  const velhos: EscolhaDaPasta<T>['velhos'] = [];
  for (const t of tipos) {
    const a = melhor[t];
    if (!a) continue;
    const dia = dataLocalISO(new Date(a.lastModified));
    if (diasEntre(dia, hoje) > DIAS_ATE_AVISAR) velhos.push({ tipo: t, data: `${dia.slice(8, 10)}/${dia.slice(5, 7)}` });
  }
  return { pagar: melhor.pagar, receber: melhor.receber, faltam, velhos };
}

const NOME_DO_TIPO: Record<TipoRelatorioLr, string> = { pagar: 'contas a pagar', receber: 'contas a receber' };

export function fraseDaFalta(faltam: readonly TipoRelatorioLr[]): string | null {
  if (faltam.length === 0) return null;
  if (faltam.length === 2) return 'Nenhum relatório do LR na pasta: baixe os dois no LR ou arraste-os aqui.';
  return `Falta o relatório de ${NOME_DO_TIPO[faltam[0]]} na pasta: arraste só esse.`;
}

export function fraseDosVelhos(velhos: EscolhaDaPasta<unknown>['velhos']): string | null {
  if (velhos.length === 0) return null;
  const datas = [...new Set(velhos.map(v => v.data))];
  return `relatório de ${datas.join(' e ')} — baixe o de hoje no LR?`;
}

export function textoDoTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
