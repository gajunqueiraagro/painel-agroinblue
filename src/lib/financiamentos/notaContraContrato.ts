/**
 * A NOTA FISCAL CONTRA O CONTRATO DO PARCELAMENTO — PARC-LIVRES-01 passo 6.
 *
 * ⚠ CONFERE, NÃO SOBRESCREVE: importar o XML no contrato NÃO muda fornecedor, valor nem parcela. A tela escreve a tabela
 *   contrato × nota e o operador decide. Tudo em CENTAVOS inteiros, por igualdade — nenhuma tolerância, nenhuma diferença "pequena".
 * ⚠ PARCELA PAGA NÃO MUDA: "Usar as duplicatas da nota" só mexe nas NÃO pagas; a duplicata que é igual (data e valor) a uma
 *   parcela paga é a própria parcela paga e fica fora do que se aplica.
 */
import { acrescentarParcela, editarValor, editarVencimento, retirarParcela, type ParcelaLivre } from './parcelasLivres';

export interface DuplicataDaNota { vencimento: string; valorCent: number }
export interface NotaParaConferir {
  emitenteDocumento: string; emitenteNome: string; valorCent: number; duplicatas: readonly DuplicataDaNota[];
}
export interface ParcelaParaConferir { vencimento: string; valorCent: number; paga: boolean }
export interface ContratoParaConferir {
  credorDocumento: string | null; credorNome: string | null; valorCent: number; parcelas: readonly ParcelaParaConferir[];
}

export interface LinhaDaConferencia {
  campo: 'fornecedor' | 'valor' | 'parcelas';
  rotulo: string;
  /** Valor em centavos quando o campo é dinheiro; `null` quando é texto. */
  contratoCent: number | null; notaCent: number | null;
  contratoTexto: string; notaTexto: string;
  /** A parte que NUNCA corta (o CNPJ/CPF, só dígitos); '' quando não há. */
  contratoFixo: string; notaFixo: string;
  /** `null` = não dá para comparar (o cadastro não tem documento). */
  confere: boolean | null;
}
export interface Conferencia { linhas: LinhaDaConferencia[]; duplicatasDiferem: boolean; temDuplicatas: boolean }

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const mesmaParcela = (a: DuplicataDaNota, b: { vencimento: string; valorCent: number }) => a.vencimento === b.vencimento && a.valorCent === b.valorCent;

/** As duplicatas que NÃO são uma parcela paga do contrato (cada parcela paga "consome" no máximo uma duplicata igual). */
export function duplicatasEmAberto(nota: NotaParaConferir, parcelas: readonly ParcelaParaConferir[]): DuplicataDaNota[] {
  const pagas = parcelas.filter((p) => p.paga).map((p) => ({ ...p, usada: false }));
  const resto: DuplicataDaNota[] = [];
  for (const d of nota.duplicatas) {
    const paga = pagas.find((p) => !p.usada && mesmaParcela(d, p));
    if (paga) paga.usada = true; else resto.push(d);
  }
  return resto;
}

export function conferirNota(nota: NotaParaConferir, contrato: ContratoParaConferir): Conferencia {
  const docContrato = soDigitos(contrato.credorDocumento);
  const docNota = soDigitos(nota.emitenteDocumento);
  const naoPagas = contrato.parcelas.filter((p) => !p.paga);
  const abertas = duplicatasEmAberto(nota, contrato.parcelas);
  const temDuplicatas = nota.duplicatas.length > 0;
  const parcelasConferem = temDuplicatas
    && abertas.length === naoPagas.length && abertas.every((d, i) => mesmaParcela(d, naoPagas[i]));
  return {
    linhas: [
      { campo: 'fornecedor', rotulo: 'Fornecedor (CNPJ/CPF)', contratoCent: null, notaCent: null,
        contratoTexto: contrato.credorNome ?? '—', contratoFixo: docContrato || 'sem documento no cadastro',
        notaTexto: nota.emitenteNome, notaFixo: docNota,
        confere: docContrato ? docContrato === docNota : null },
      { campo: 'valor', rotulo: 'Valor total', contratoCent: contrato.valorCent, notaCent: nota.valorCent, contratoTexto: '', notaTexto: '', contratoFixo: '', notaFixo: '',
        confere: contrato.valorCent === nota.valorCent },
      { campo: 'parcelas', rotulo: 'Parcelas × duplicatas', contratoCent: null, notaCent: null,
        contratoTexto: `${contrato.parcelas.length} ${contrato.parcelas.length === 1 ? 'parcela' : 'parcelas'}`,
        notaTexto: temDuplicatas ? `${nota.duplicatas.length} ${nota.duplicatas.length === 1 ? 'duplicata' : 'duplicatas'}` : 'sem duplicatas',
        contratoFixo: '', notaFixo: '',
        confere: temDuplicatas ? parcelasConferem : null },
    ],
    duplicatasDiferem: temDuplicatas && !parcelasConferem,
    temDuplicatas,
  };
}

/**
 * "Usar as duplicatas da nota": a grade com as NÃO pagas trocadas pelas duplicatas em aberto, na ordem. A paga fica onde está;
 * a não paga que já existe é EDITADA (guarda o "era", e por isso aparece como editada); a que sobra sai; a que falta entra.
 * Não grava nada: é a lista que a aba Parcelas passa a mostrar.
 */
export function usarDuplicatasDaNota(grade: readonly ParcelaLivre[], nota: NotaParaConferir): ParcelaLivre[] {
  const abertas = duplicatasEmAberto(nota, grade.map((p) => ({ vencimento: p.vencimento, valorCent: p.valorCent, paga: !!p.paga })));
  let lista: ParcelaLivre[] = [...grade];
  const naoPagas = grade.filter((p) => !p.paga);
  naoPagas.forEach((p, i) => {
    const d = abertas[i];
    if (!d) { lista = retirarParcela(lista, p.chave); return; }
    lista = editarValor(editarVencimento(lista, p.chave, d.vencimento), p.chave, d.valorCent);
  });
  for (const d of abertas.slice(naoPagas.length)) {
    lista = acrescentarParcela(lista);
    const nova = lista[lista.length - 1];
    lista = editarValor(editarVencimento(lista, nova.chave, d.vencimento), nova.chave, d.valorCent);
  }
  return lista;
}
