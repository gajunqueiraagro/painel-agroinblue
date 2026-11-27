/**
 * ENTRADA-CENTRAL-01 F1 — O LEITOR DA CAIXA, PURO: o mesmo código lê no navegador (a caixa) e na Lambda do SES (na chegada do e-mail).
 * Movido VERBATIM de `src/hooks/useCaixaDeBoletos.ts` (o hook re-exporta tudo; nenhum chamador muda). Sem React, sem supabase.
 * `pdfjs`: o injetado (a Lambda passa o build `legacy`, como os testes); sem ele, o do app.
 */
import { lerBoletosDoArquivo, type ParteDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import type { BoletoNormalizado } from '@/lib/financeiro/linhaDigitavel';
import { FRASE_FOLHA_AINDA_NAO, FRASE_NEM_BOLETO_NEM_NOTA, type ResumoDaNota } from '@/lib/financeiro/boleto/caixaPorEmail';
import { itensDoPdf, type PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';
import { montarLinhas } from '@/lib/oc/leitura/montarLinhas';
import { lerFolha, pareceFolha, type FolhaLida } from '@/lib/folha/lerFolha';
import { acharChaveNFe } from '@/lib/oc/leitura/chaveNFe';
import { lerResumoDoContador, type ResumoLido } from '@/lib/folha/lerResumoDoContador';
import { lerFolhaAnalitica, type FolhaAnaliticaLida } from '@/lib/folha/lerFolhaAnalitica';
import { lerFaturaConsumo, type FaturaLida } from '@/lib/financeiro/consumo/lerFaturaConsumo';
import { lerPosicaoOperacoes, type PosicaoLida } from '@/lib/financeiro/consumo/lerPosicaoOperacoes';
import { lerDarf, lerGfd, type GfdLida } from '@/lib/folha/lerGuiasDaFolha';

/** A leitura de UM arquivo pela caixa (injetável: a bancada e os testes passam a sua). */
export type LeituraDaCaixa =
  | { k: 'nota'; nota: ResumoDaNota }
  | { k: 'boletos'; boletos: BoletoNormalizado[]; beneficiario: ParteDoBoleto; pagador: ParteDoBoleto; paginaDeCada?: number[]; totalDePaginas?: number }
  | { k: 'folha'; folha: FolhaLida }
  | { k: 'resumo'; resumo: ResumoLido }
  | { k: 'analitica'; analitica: FolhaAnaliticaLida }
  | { k: 'fatura'; fatura: FaturaLida }
  | { k: 'posicao'; posicao: PosicaoLida }
  | { k: 'gfd'; gfd: GfdLida }
  | { k: 'nada'; frase: string }
  | { k: 'senha'; errada: boolean }
  | { k: 'erro'; frase: string };
export type LerArquivoDaCaixa = (bytes: ArrayBuffer, tipo: 'xml' | 'pdf', senha?: string, nomeDoArquivo?: string) => Promise<LeituraDaCaixa>;

/**
 * CAIXA-DANFE-CHAVE-01 (Gabriel 24/11, NJ, NF 48.053): a DANFE que o `lerNota` não lê ainda tem a CHAVE — impressa em grupos ("5026 1104 …") e,
 * muitas vezes, no NOME do arquivo ("<chave>-danfe.pdf"). Vale a 1ª chave VÁLIDA (`acharChaveNFe`: DV, UF, mês, modelo 55, CNPJ) do texto do
 * PDF; sem ela, a do nome. Com a chave, a linha é uma nota: a consulta de sempre (`fn_nota_ja_lancada` pela chave) acha o lançamento.
 * O número sai da própria chave; emitente, valor e vencimento ficam vazios ("—"), nunca inventados.
 */
export function notaPelaChave(textoDoPdf: string | null, nomeDoArquivo: string | undefined): ResumoDaNota | null {
  const chave = (textoDoPdf ? acharChaveNFe(textoDoPdf) : null) ?? (nomeDoArquivo ? acharChaveNFe(nomeDoArquivo) : null);
  if (!chave) return null;
  return { chave, numero: String(Number(chave.slice(25, 34))), emitente: null, valor: null, vencimento: null };
}

export const FRASE_PDF_IMAGEM = 'O PDF é uma imagem (escaneado): sem linha digitável nem chave legível.';

/** O leitor de verdade: XML → a nota; PDF → os boletos (D7); sem boleto, a nota (o DANFE, pelo `lerNota` de sempre); senão, nada
 *  (o que parece folha diz que a folha ainda não é lida aqui, CAIXA-FOLHA-AVISO-01). `pdfjs`: o do teste (no app, o de sempre). */
export const lerDaCaixaCom = (pdfjs?: PdfjsMinimo): LerArquivoDaCaixa => async (bytes, tipo, senha, nomeDoArquivo) => {
  if (tipo === 'xml') {
    const n = await lerNota(bytes);
    if ('nota' in n && n.ok) return { k: 'nota', nota: resumoDaNota(n.nota) };
    return { k: 'nada', frase: 'frase' in n ? n.frase : 'Não consegui ler a nota.' };
  }
  const b = await lerBoletosDoArquivo(bytes.slice(0), { senha, pdfjs });
  if (b.ok === false) {
    if (b.motivo === 'senha' || b.motivo === 'senha_errada') return { k: 'senha', errada: b.motivo === 'senha_errada' };
    if (b.motivo === 'sem_texto') {
      /* a DANFE escaneada ainda pode ter a chave no nome do arquivo */
      const pelaChave = notaPelaChave(null, nomeDoArquivo);
      return pelaChave ? { k: 'nota', nota: pelaChave } : { k: 'nada', frase: FRASE_PDF_IMAGEM };
    }
    return { k: 'erro', frase: b.frase };
  }
  /* CONTAS-CONSUMO-01 C1: a fatura de energia (NF3e) ANTES do boleto — a linha digitável dela fica dentro da fatura */
  const paginas = await linhasDasPaginas(bytes, senha, pdfjs);
  const fatura = paginas ? lerFaturaConsumo(paginas) : null;
  if (fatura && fatura.ok === true) return { k: 'fatura', fatura: fatura.fatura };
  if (b.leitura.boletos.length) {
    /* CAIXA-FOLHA-VERA (Gabriel 15:10): o DARF não tem "Beneficiário" impresso — o beneficiário é a Receita Federal (o nome; o "confira"
       fica), e a sugestão por nome acha o previsto "Receita Federal" de mesmo valor (antes: "sem lançamento, nenhum parecido") */
    const darf = paginas ? lerDarf(paginas) : null;
    const semBeneficiario = !b.leitura.beneficiario.documento && !b.leitura.beneficiario.nome;
    const beneficiario = darf && darf.ok === true && semBeneficiario ? { documento: null, nome: 'Receita Federal', confira: true } : b.leitura.beneficiario;
    return { k: 'boletos', ...b.leitura, beneficiario };
  }
  const n = await lerNota(bytes.slice(0), { pdfjs });
  if (n.ok && n.nota.chave) return { k: 'nota', nota: resumoDaNota(n.nota) };
  /* FOLHA-NA-CAIXA-01: o recibo do contador (3º tipo); o que só PARECE folha (layout que o lerFolha não lê) avisa */
  const f = paginas ? lerFolha(paginas) : null;
  if (f && f.ok === true) return { k: 'folha', folha: f.folha };
  if (f && f.ok === false && f.motivo === 'nao_fecha') return { k: 'nada', frase: `Folha que não fecha: ${f.frase} Fale com o consultor.` };
  /* FOLHA-RESUMO-CONTADOR-01: o "Extrato Mensal" do contador (o FGTS por empresa) */
  const resumo = paginas ? lerResumoDoContador(paginas) : null;
  if (resumo && resumo.ok === true) return { k: 'resumo', resumo: resumo.resumo };
  /* FOLHA-VERA-PACOTE-01 F1: o relatório analítico da folha (o espelho; antes caía no "Folha ainda não é lida aqui") */
  const analitica = paginas ? lerFolhaAnalitica(paginas) : null;
  if (analitica && analitica.ok === true) return { k: 'analitica', analitica: analitica.folha };
  /* CAIXA-OCR-01 O4: a posição de operações do banco */
  const posicao = paginas ? lerPosicaoOperacoes(paginas) : null;
  if (posicao && posicao.ok === true) return { k: 'posicao', posicao: posicao.posicao };
  /* CAIXA-FOLHA-VERA: a guia do FGTS Digital (GFD) — só PIX, sem linha digitável (antes: "Não sei · sem linha digitável nem chave") */
  const gfd = paginas ? lerGfd(paginas) : null;
  if (gfd && gfd.ok === true) return { k: 'gfd', gfd: gfd.gfd };
  const pelaChave = notaPelaChave(paginas ? paginas.flat().join('\n') : null, nomeDoArquivo);
  if (pelaChave) return { k: 'nota', nota: pelaChave };
  return { k: 'nada', frase: paginas && pareceFolha(paginas) ? FRASE_FOLHA_AINDA_NAO : FRASE_NEM_BOLETO_NEM_NOTA };
};
export const lerDaCaixa: LerArquivoDaCaixa = lerDaCaixaCom();
/** As linhas de cada página (as do `montarLinhas`, como o `lerFolha` pede); falhou a leitura = null (fica o "sem linha digitável"). */
async function linhasDasPaginas(bytes: ArrayBuffer, senha?: string, pdfjs?: PdfjsMinimo): Promise<string[][] | null> {
  try {
    const { paginas } = await itensDoPdf(bytes.slice(0), pdfjs, { senha });
    return paginas.map((p) => montarLinhas([p]));
  } catch {
    return null;
  }
}
/** CAIXA-FOLHA-AVISO-01: o PDF parece recibo de pagamento? */
export async function pdfPareceFolha(bytes: ArrayBuffer, senha?: string, pdfjs?: PdfjsMinimo): Promise<boolean> {
  const p = await linhasDasPaginas(bytes, senha, pdfjs);
  return !!p && pareceFolha(p);
}
function resumoDaNota(n: { chave: string; numero: string; emitente: { nome: string }; totais: { notaCent: number }; duplicatas: { vencimento: string }[] }): ResumoDaNota {
  return { chave: n.chave, numero: n.numero, emitente: n.emitente.nome || null, valor: n.totais.notaCent / 100, vencimento: n.duplicatas[0]?.vencimento ?? null };
}
