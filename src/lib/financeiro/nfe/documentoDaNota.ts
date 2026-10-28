/**
 * P127 + P128c (Gabriel 28/10/2026: "essa inteligência é a mais importante agora") — o "Novo documento" do Editar lançamento LÊ A NOTA
 * solta no campo Arquivo, pelo MESMO leitor do "+ Da nota" (`lerNota`): os campos do documento saem do que a NOTA diz, e onde a nota e o
 * lançamento divergem os dois aparecem lado a lado (a nota em destaque) para o operador escolher. PURO: quem lê o arquivo e quem desenha
 * é o formulário.
 * ⚠ NADA MUDA O LANÇAMENTO: o documento é outra tabela; o que a nota muda no lançamento só pela prévia (P128a), depois do clique.
 */
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';

/** O que a nota põe no documento (número formatado como na casa, "000.074.974"; valor em reais, como o campo). */
export interface CamposDaNota {
  numero: string;
  serie: string;
  emissao: string;
  valor: number;
  chave: string;
  emitenteNome: string;
  emitenteDocumento: string;
  /** a nota tem itens ou duplicatas: há o que ela muda além do documento ("Ver o que a nota muda") */
  muda: boolean;
}

export function camposDaNota(n: NotaLida): CamposDaNota {
  return {
    numero: formatNFNumber(n.numero), serie: n.serie, emissao: n.emissao, valor: n.totais.notaCent / 100, chave: n.chave,
    emitenteNome: n.emitente.nome, emitenteDocumento: n.emitente.documento,
    muda: n.itens.length > 0 || n.duplicatas.length > 0,
  };
}

/** O campo onde a nota e o lançamento divergem: os dois, para o operador escolher. */
export type CampoDivergente = 'numero' | 'emissao' | 'valor' | 'emitente';
export interface Divergencia { campo: CampoDivergente; rotulo: string; nota: string; lancamento: string }

const ROTULO: Record<CampoDivergente, string> = { numero: 'nº', emissao: 'emissão', valor: 'valor', emitente: 'emitente' };
const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const reais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O que o LANÇAMENTO dizia (a sugestão de sempre) × o que a NOTA diz. Só entra o campo que o lançamento TEM e que difere: o lançamento sem
 * nº não "diverge" da nota. Nº compara só os dígitos sem zeros à esquerda ("4875" = "000.004.875"); emitente compara o cadastro.
 */
export function divergenciasDaNota(nota: CamposDaNota, lancamento: {
  numero: string | null; dataEmissao: string | null; valor: number | null; emitenteId: string | null; emitenteNome: string | null;
}, emitenteIdDaNota: string | null): Divergencia[] {
  const out: Divergencia[] = [];
  const num = (s: string | null) => soDigitos(s).replace(/^0+/, '');
  if (lancamento.numero && num(lancamento.numero) !== num(nota.numero)) {
    out.push({ campo: 'numero', rotulo: ROTULO.numero, nota: nota.numero, lancamento: lancamento.numero });
  }
  if (lancamento.dataEmissao && nota.emissao && lancamento.dataEmissao !== nota.emissao) {
    out.push({ campo: 'emissao', rotulo: ROTULO.emissao, nota: dataBr(nota.emissao), lancamento: dataBr(lancamento.dataEmissao) });
  }
  if (lancamento.valor != null && Math.round(lancamento.valor * 100) !== Math.round(nota.valor * 100)) {
    out.push({ campo: 'valor', rotulo: ROTULO.valor, nota: reais(nota.valor), lancamento: reais(lancamento.valor) });
  }
  if (lancamento.emitenteId && emitenteIdDaNota !== lancamento.emitenteId) {
    out.push({ campo: 'emitente', rotulo: ROTULO.emitente, nota: nota.emitenteNome, lancamento: lancamento.emitenteNome ?? 'o do lançamento' });
  }
  return out;
}

/** A frase da nota que NÃO se leu (PDF escaneado, arquivo que não é NF-e): o documento se registra com o digitado, e diz o que não foi. */
export const FRASE_NOTA_NAO_LIDA = 'Não consegui ler a chave da nota — itens não gravados. Os campos ficam para digitar.';

/** XML ou PDF: o que vale tentar ler como nota (imagem não). */
export const ehArquivoDeNota = (nome: string) => /\.(xml|pdf)$/i.test(nome);
