/**
 * ENTREGA-FUTURA-LIGAR-01 — o GRAVADOR do "Ligar à compra": cada remessa (o XML da caixa da Receita + o DANFE em PDF gerado dele) vira
 * documento NF registrado na 1ª parcela da compra e LIGADO a todas (`gravarDocumentosDoParcelamento`, o mesmo do parcelamento da nota).
 * NÃO cria lançamento, NÃO muda valor, data, número nem status (R2). A remessa já ligada (a chave num documento vivo) é pulada pelo
 * próprio registro do banco (`fin_documento_registrar`: a nota repetida volta como recusa e a remessa fica como estava).
 */
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { danfePdfDoXml, nomeDoDanfe } from '@/lib/fiscal/danfePdf';
import { gravarDocumentosDoParcelamento, novoPendente, type DocumentoPendente, type ParcelaGravada } from '@/lib/financeiro/documentosPendentes';
import type { LancDocPayload } from '@/hooks/useLancamentoDocumentos';
import { quantidadeDosItens, type QuantidadeDaRemessa } from '@/lib/fiscal/entregaFutura';

export interface RemessaLida { chave: string; arquivo: File; numero: string; valorCent: number; qtd: QuantidadeDaRemessa }

/** lê o XML da remessa (o mesmo leitor do "+ Da nota") e tira a quantidade dos itens */
export function lerRemessa(chave: string, xml: string): RemessaLida | { erro: string } {
  const arquivo = new File([xml], `NFe-${chave}.xml`, { type: 'application/xml' });
  const r = lerNFe(new TextEncoder().encode(xml).buffer);
  if (r.ok === false) return { erro: r.frase };
  return { chave, arquivo, numero: r.nota.numero, valorCent: r.nota.totais.notaCent, qtd: quantidadeDosItens(r.nota.itens) };
}

/** os 2 pendentes da remessa: o XML (a NF) e o DANFE em PDF (falhou o DANFE = só o XML) */
export async function pendentesDaRemessa(xml: string, chave: string, gerarDanfe: typeof danfePdfDoXml = danfePdfDoXml): Promise<DocumentoPendente[] | { erro: string }> {
  const arquivo = new File([xml], `NFe-${chave}.xml`, { type: 'application/xml' });
  const r = lerNFe(new TextEncoder().encode(xml).buffer);
  if (r.ok === false) return { erro: r.frase };
  const n = r.nota;
  const base: LancDocPayload = {
    especie: 'nf', numero: n.numero, serie: n.serie || null, chaveAcesso: n.chave, dataEmissao: n.emissao.slice(0, 10),
    valorDocumento: n.totais.notaCent / 100, emitenteId: null, emitenteNome: n.emitente.nome, emitenteDocumento: n.emitente.documento,
    observacao: 'Remessa de entrega futura (ligada à compra)',
  };
  const lista = [novoPendente({ ...base, nome: `nf ${n.numero}` }, arquivo, null)];
  const d = await gerarDanfe(arquivo);
  if (d.ok) lista.push(novoPendente({ ...base, nome: nomeDoDanfe(`nf ${n.numero}.xml`) }, d.pdf, null));
  return lista;
}

export interface ResultadoDoLigar { ligadas: number; falhas: { numero: string; frase: string }[] }

/** liga as remessas aos lançamentos da compra (o 1º recebe o registro; todos, o vínculo) — uma remessa que falha não derruba as outras */
export async function ligarRemessasACompra(
  clienteId: string, remessas: readonly { numero: string; chave: string; xml: string }[], lancamentoIds: readonly string[],
  g: { pendentes?: typeof pendentesDaRemessa; gravar?: typeof gravarDocumentosDoParcelamento } = {},
): Promise<ResultadoDoLigar> {
  const pendentes = g.pendentes ?? pendentesDaRemessa;
  const gravar = g.gravar ?? gravarDocumentosDoParcelamento;
  const parcelas: ParcelaGravada[] = lancamentoIds.map((id, i) => ({ numero: i + 1, lancamentoId: id }));
  const saida: ResultadoDoLigar = { ligadas: 0, falhas: [] };
  if (parcelas.length === 0) return saida;
  for (const r of remessas) {
    const p = await pendentes(r.xml, r.chave);
    if ('erro' in p) { saida.falhas.push({ numero: r.numero, frase: p.erro }); continue; }
    const lista = await gravar(clienteId, parcelas, p);
    /* a NF é o XML (o 1º): ele gravado = ligada; o DANFE que falhou só avisa (o gesto "DANFE das notas já guardadas" gera depois) */
    if (lista[0]?.gravado) saida.ligadas += 1;
    else saida.falhas.push({ numero: r.numero, frase: lista[0]?.erro ?? 'não gravou' });
  }
  return saida;
}
