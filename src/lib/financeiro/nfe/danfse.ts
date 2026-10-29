/**
 * O DANFSe (O PDF DA NFS-e NACIONAL, v2.0) LIDO PELO ROTULO — P174 NFSE-LEITURA-01 (Gabriel, 29/10/2026). PURO, como o `danfe.ts`: recebe
 * os itens de texto de cada pagina e devolve a MESMA `NotaLida`, com `modelo = 'nfse'`. A porta (`lerNota`) decide o leiaute pelo titulo
 * ("DANFSe" / "Documento Auxiliar da NFS-e"); daqui para a frente a NFS-e segue o caminho da NF-e.
 *
 * A REGRA E' A DO DANFE: o ROTULO em cima e o VALOR logo abaixo, na mesma coluna (`Danfe.valorDe`). Os rotulos que se repetem no
 * prestador e no tomador ("CPF / CNPJ / NIF", "Nome / Nome empresarial", "Endereço") se leem pela FAIXA de cada quadro.
 * ⚠ A CHAVE DE 50 DIGITOS CONFERE O LIDO: municipio IBGE(7) ambiente(1) tipo de inscricao(1) CPF/CNPJ do prestador(14) numero(13)
 *   AAMM(4) codigo(9) DV(1, modulo 11). O que nao bate vira `divergencias` (a tela pinta de vermelho e nada cria), como na NF-e.
 * ⚠ VALORES (Gabriel 29/10, T2): `totais.notaCent` = o VALOR LIQUIDO impresso (o do lancamento); o bruto, as retencoes e o total retido
 *   ficam em `servico`. NFS-e nao tem duplicatas: o vencimento e' o da NF-e sem duplicata (a previa pede).
 * ⚠ NFS-e nao tem protocolo da SEFAZ: a validade e' a SITUACAO ("NFS-e Gerada"). Cancelada ou substituida: recusa.
 * ⚠ O "-" do DANFSe e' "sem valor": conta 0.
 */
import { soDigitos } from './formatos';
import {
  Danfe, FRASE_NOTA_SEM_CHAVE, FRASE_PDF_SEM_TEXTO, centavosBr, dataIso, digitoDaChave, normalizar, textoDosDadosAdicionais,
  type CampoConferido, type ItemDoDanfe, type ItemNaPagina, type ResultadoDoDanfe,
} from './danfe';
import type { AvisoNFe, NotaLida } from './tipos';

export const FRASE_NFSE_CANCELADA = 'NFS-e cancelada ou substituída: nada foi lido.';

/** E' um DANFSe? Pelo titulo do documento. */
export function ehDanfse(paginas: readonly ItemDoDanfe[][]): boolean {
  return paginas.some((p) => p.some((it) => { const n = normalizar(it.str); return n.startsWith('DANFSE') || n === 'DOCUMENTO AUXILIAR DA NFS-E'; }));
}

/** As partes da chave de 50: municipio(7) ambiente(1) tpInsc(1) inscricao(14) numero(13) AAMM(4) codigo(9) DV(1). */
export function partesDaChaveNfse(chave: string) {
  return {
    municipio: chave.slice(0, 7), ambiente: chave.slice(7, 8), tipoInscricao: chave.slice(8, 9), inscricao: chave.slice(9, 23),
    numero: chave.slice(23, 36), aamm: chave.slice(36, 40), dv: chave.slice(49, 50),
  };
}

/** O CPF/CNPJ do prestador pela chave (tipo de inscricao 1 = CPF, com 3 zeros a' esquerda nos 14). */
export function documentoDaChaveNfse(chave: string): string {
  const p = partesDaChaveNfse(chave);
  return p.tipoInscricao === '1' ? p.inscricao.slice(3) : p.inscricao;
}

/** O que a chave de 50 contradiz no que foi lido. Vazio = confere. O mes confere com a emissao OU com a competencia. */
export function conferirChaveNfse(nota: Pick<NotaLida, 'chave' | 'numero' | 'emissao' | 'emitente' | 'servico'>): CampoConferido[] {
  const c = nota.chave;
  if (!/^\d{50}$/.test(c)) return ['digito'];
  const p = partesDaChaveNfse(c);
  const fora: CampoConferido[] = [];
  if (digitoDaChave(c.slice(0, 49)) !== Number(p.dv)) fora.push('digito');
  if (soDigitos(nota.emitente.documento).padStart(14, '0') !== p.inscricao) fora.push('cnpj');
  if (Number(soDigitos(nota.numero) || -1) !== Number(p.numero)) fora.push('numero');
  const aamm = (iso: string | null | undefined) => (iso ? `${iso.slice(2, 4)}${iso.slice(5, 7)}` : '');
  if (aamm(nota.emissao) !== p.aamm && aamm(nota.servico?.competencia) !== p.aamm) fora.push('mes');
  return fora;
}

const RE_CHAVE_NFSE = /^[\d\s]+$/;

/** Le^ o DANFSe. */
export function notaDoDanfse(paginas: readonly ItemDoDanfe[][]): ResultadoDoDanfe {
  const d = new Danfe(paginas);
  if (d.itens.length === 0) return { ok: false, motivo: 'pdf_sem_texto', frase: FRASE_PDF_SEM_TEXTO };

  const itemChave = d.itens.find((it) => RE_CHAVE_NFSE.test(it.str.trim()) && soDigitos(it.str).length === 50);
  if (!itemChave) return { ok: false, motivo: 'incompleta', frase: FRASE_NOTA_SEM_CHAVE };
  const chave = soDigitos(itemChave.str);
  d.marcar('chave', itemChave);
  const pg = itemChave.pagina;

  const y = (rotulo: string, prefixo = false) => d.rotulos(rotulo, prefixo).find((r) => r.pagina === pg)?.y ?? null;
  const yPrest = y('PRESTADOR / FORNECEDOR');
  const yTom = y('TOMADOR / ADQUIRENTE');
  const yServ = y('SERVICO PRESTADO');
  const yIss = y('TRIBUTACAO MUNICIPAL (ISSQN)');
  const yTotal = y('VALOR TOTAL DA NFS-E');
  /* os rotulos de um quadro ficam na linha do titulo dele ou abaixo (o titulo e o 1o rotulo dividem a linha, a 1-2 pt) */
  const faixa = (de: number | null, ate: number | null) => ({ abaixoDe: de == null ? undefined : de + 5, acimaDe: ate == null ? undefined : ate + 5 });
  const noPrest = faixa(yPrest, yTom);
  const noTom = faixa(yTom, yServ);
  const texto = (it: ItemNaPagina | null) => { const s = it?.str.trim() ?? ''; return s === '' || s === '-' ? null : s; };
  const cent = (it: ItemNaPagina | null) => (texto(it) == null ? 0 : centavosBr(it?.str) ?? 0);

  /* SITUACAO: cancelada ou substituida nao vale */
  const situacao = normalizar(texto(d.campo('SITUACAO DA NFS-E')) ?? '');
  if (situacao.includes('CANCELAD') || situacao.includes('SUBSTITUID')) return { ok: false, motivo: 'incompleta', frase: FRASE_NFSE_CANCELADA };

  const itNumero = d.campo('NUMERO DA NFS-E');
  const itEmissao = d.campo('DATA E HORA DA EMISSAO DA NFS-E');
  const itCompetencia = d.campo('COMPETENCIA DA NFS-E');
  d.marcar('numero', itNumero);
  d.marcar('emissao', itEmissao);

  const itDocPrest = d.campo('CPF / CNPJ / NIF', noPrest);
  const itNomePrest = d.campo('NOME / NOME EMPRESARIAL', noPrest);
  const itCidadePrest = d.campo('MUNICIPIO / SIGLA UF', noPrest);
  const itCepPrest = d.campo('CODIGO IBGE / CEP', noPrest);
  const itEnderPrest = d.campo('ENDERECO', noPrest);
  const itFonePrest = d.campo('TELEFONE', noPrest);
  d.marcar('emitente_cnpj', itDocPrest);
  d.marcar('emitente', itNomePrest);
  d.marcar('emitente_cidade', itCidadePrest);
  d.marcar('emitente_endereco', itEnderPrest);

  const itDocTom = d.campo('CPF / CNPJ / NIF', noTom);
  const itNomeTom = d.campo('NOME / NOME EMPRESARIAL', noTom);
  const itEnderTom = d.campo('ENDERECO', noTom);
  d.marcar('destinatario', itNomeTom);

  /* O SERVICO: os codigos e a descricao livre (varias linhas, do rotulo ate' o quadro do ISSQN) */
  const noServ = faixa(yServ, yIss);
  const itCodigo = d.campo('CODIGO DE TRIBUTACAO NACIONAL / MUNICIPAL', noServ);
  const itNbs = d.campo('CODIGO DA NBS', noServ);
  const rotDescricao = d.rotulos('DESCRICAO DO SERVICO').find((r) => r.pagina === pg) ?? null;
  const linhasDescricao = rotDescricao ? d.linhasEntre(pg, rotDescricao.y - 1, (yIss ?? rotDescricao.y - 60) + 5) : [];
  const descricao = linhasDescricao.map((l) => l.map((o) => o.str.trim()).join(' ')).join(' ').replace(/\s+/g, ' ').trim();
  for (const l of linhasDescricao) for (const o of l) d.marcar('itens', o);

  /* AS RETENCOES (o ISS so' conta quando "Retencao do ISSQN" diz retido) */
  const issRetido = /^RETIDO/.test(normalizar(texto(d.campo('RETENCAO DO ISSQN')) ?? ''));
  const issApurado = cent(d.campo('ISSQN APURADO'));
  const retencoes = {
    issRetidoCent: issRetido ? issApurado : 0,
    irrfCent: cent(d.campo('IRRF')),
    previdenciaCent: cent(d.campo('CONTRIBUICAO PREVIDENCIARIA - RETIDA')),
    contribuicoesSociaisCent: cent(d.campo('CONTRIBUICOES SOCIAIS - RETIDAS')),
  };

  /* O QUADRO DO VALOR TOTAL (o "Desconto Incondicionado" tambem existe no quadro do ISSQN: so' o daqui) */
  const noTotal = { abaixoDe: yTotal == null ? undefined : yTotal + 5 };
  const itBruto = d.campo('VALOR DA OPERACAO / SERVICO', noTotal);
  const itDesconto = d.campo('DESCONTO INCONDICIONADO', noTotal);
  const itRetido = d.campo('TOTAL DAS RETENCOES (ISSQN / FEDERAIS)', noTotal);
  const itLiquido = d.campo('VALOR LIQUIDO DA NFS-E', noTotal);
  d.marcar('produtos', itBruto);
  d.marcar('desconto', itDesconto);
  d.marcar('valor_nota', itLiquido);

  const numero = soDigitos(itNumero?.str);
  const emissao = dataIso(itEmissao?.str) ?? '';
  const nomeEmit = texto(itNomePrest);
  const brutoCent = centavosBr(itBruto?.str);
  const liquidoCent = centavosBr(itLiquido?.str);
  if (!numero) return { ok: false, motivo: 'incompleta', frase: 'Nota sem número.' };
  if (!emissao) return { ok: false, motivo: 'incompleta', frase: 'Nota sem data de emissão.' };
  if (!nomeEmit) return { ok: false, motivo: 'incompleta', frase: 'Nota sem emitente.' };
  if (brutoCent == null || liquidoCent == null) return { ok: false, motivo: 'incompleta', frase: 'Nota sem valor total.' };

  /* "RUA X, 1405, , CENTRO" · "CIDADE / UF" · "5007554 / 79690-000" */
  const [logradouro = null, numeroEnd = null, complemento = null, bairro = null] = (texto(itEnderPrest) ?? '').split(',').map((s) => s.trim() || null);
  const [municipio = null, uf = null] = (texto(itCidadePrest) ?? '').split('/').map((s) => s.trim() || null);
  const cep = soDigitos((texto(itCepPrest) ?? '').split('/')[1]) || null;
  const informacoesComplementares = textoDosDadosAdicionais(d);
  /* a IE do tomador (a fazenda, NOTA-FAZENDA-PELA-IE-01): o DANFSe nao tem o campo; o emissor a escreve nas informacoes complementares */
  const ieTomador = soDigitos(/INSCRICAO ESTADUAL:?\s*([\d.\-/]+)/.exec(normalizar(informacoesComplementares ?? ''))?.[1]) || null;
  const descontoCent = cent(itDesconto);

  const nota: NotaLida = {
    chave,
    modelo: 'nfse',
    numero,
    serie: '',
    emissao,
    saidaEntrada: null,
    tipoNota: 'saida',
    finalidade: 'normal',
    naturezaOperacao: 'Prestação de serviço',
    emitente: {
      documento: soDigitos(itDocPrest?.str) || documentoDaChaveNfse(chave), nome: nomeEmit, fantasia: null, ie: null,
      endereco: { logradouro, numero: numeroEnd, complemento, bairro, municipio, uf, cep, telefone: soDigitos(texto(itFonePrest)) || null },
    },
    destinatario: { documento: soDigitos(itDocTom?.str) || null, nome: texto(itNomeTom), ie: ieTomador, endereco: texto(itEnderTom) },
    totais: { produtosCent: brutoCent, freteCent: 0, descontoCent, notaCent: liquidoCent },
    fatura: null,
    duplicatas: [],
    somaDuplicatasCent: 0,
    pagamentos: [],
    itens: [{ descricao, quantidade: '1', unidade: '', valorCent: brutoCent, unitarioCent: brutoCent, detalhe: null, fiscal: { codigo: texto(itCodigo) } }],
    protocolo: null,
    informacoesComplementares,
    cfops: [],
    servico: {
      competencia: dataIso(itCompetencia?.str) ?? emissao, codigoTributacao: texto(itCodigo), nbs: texto(itNbs),
      brutoCent, retencoes, totalRetidoCent: cent(itRetido), liquidoCent,
    },
  };

  /* NFS-e nao tem duplicata nem protocolo da SEFAZ (o "sem protocolo" da NF-e nao vale aqui) */
  const avisos: AvisoNFe[] = ['sem_duplicatas'];
  return {
    ok: true, nota, avisos, marcas: d.marcas, divergencias: conferirChaveNfse(nota),
    extras: { seguroCent: 0, outrasCent: 0, ipiCent: 0, stCent: 0, tributosAproxCent: null },
  };
}
