/**
 * NOTA-GABARITO-01 (Chat 12/11 13:20) — a ASSINATURA de uma nota lida: o que a suite de notas reais confere em todo gate de leitura.
 * So' numeros, datas e codigos (nunca nome; CPF vira 'CPF'): numero, serie, modelo, emissao, o CNPJ do emitente, os totais, as duplicatas e, por item, valor, quantidade,
 * unitario, codigo, NCM, CFOP e a descricao; mais os avisos e as divergencias da chave. Os PDFs e o esperado ficam FORA do repositorio
 * (~/Downloads/relatorios/nf-gabarito/), porque sao notas de clientes.
 */
import type { NotaDoArquivo } from './lerNota';

export function emitenteDoGabarito(documento: string): string {
  const d = documento.replace(/\D/g, '');
  return d.length === 14 ? d : d.length === 11 ? 'CPF' : '';
}

export function assinaturaDaNota(r: Extract<NotaDoArquivo, { ok: true }>) {
  const n = r.nota;
  return {
    numero: n.numero, serie: n.serie, modelo: n.modelo, emissao: n.emissao,
    /* o emitente (a filial) pelo CNPJ; CPF (produtor) nunca vai ao esperado */
    emitente: emitenteDoGabarito(n.emitente.documento),
    notaCent: n.totais.notaCent, produtosCent: n.totais.produtosCent,
    duplicatas: n.duplicatas.map((d) => [d.numero, d.vencimento, d.valorCent]),
    /* NOTA-PDF-REGRESSAO-01 (Chat 13:45): a descricao do item INTEIRA (as linhas de continuacao juntadas) tambem e' conferida */
    itens: n.itens.map((i) => [i.valorCent, i.quantidade, i.unitarioCent, i.fiscal?.codigo ?? null, i.fiscal?.ncm ?? null, i.fiscal?.cfop ?? null, i.descricao]),
    avisos: [...r.avisos].sort(),
    divergencias: [...r.divergencias].sort(),
  };
}
