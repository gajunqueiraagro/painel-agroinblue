/** NFSE-MUNICIPAL-01 — a NFS-e DA PREFEITURA, SINTETICA: as POSICOES dos dois layouts reais da FASE 0 (Presidente Prudente, sem chave
 *  nacional; Sao Paulo, com o "Identificador Nacional") com dados de teste (prestador CNPJ 11.222.333/0004-24, tomador CPF 111.444.777-35).
 *  Os PDFs reais ficam fora do repo (dado de cliente). */
import { digitoDaChave, type ItemDoDanfe } from '../danfe';
import { CNPJ_PRESTADOR_SINTETICO } from './danfseSintetico';

/** A chave de 50 de SP (municipio 3550308), com o digito certo. */
export function chaveSpSintetica(numero: string, aamm: string): string {
  const sem = `3550308${'1'}${'2'}${CNPJ_PRESTADOR_SINTETICO.padStart(14, '0')}${numero.padStart(13, '0')}${aamm}${'123456789'}`;
  return `${sem}${digitoDaChave(sem)}`;
}

export interface OpcoesNfseMunicipal {
  numero?: string; emissao?: string; codigo?: string;
  /** "COND.PAGTO.:28/56/84/112" na discriminacao; `null` = sem condicao. */
  condicao?: string | null;
  total?: string; liquido?: string | null; iss?: string; issRetido?: boolean;
  irrf?: string; inss?: string; pis?: string; cofins?: string; csll?: string;
  /** Tira o titulo "NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e" (vira "nao e' NFS-e"). */
  semTitulo?: boolean;
  /** Tira o CPF/CNPJ do prestador. */
  semCnpjPrestador?: boolean;
  /** SP: a chave impressa (para a conferencia); sem ela, a montada com o digito certo. */
  chave?: string;
}

const it = (str: string, x: number, y: number, w: number, h = 10): ItemDoDanfe => ({ str, x, y, w, h });

/** Presidente Prudente (o layout sem chave nacional). */
export function nfsePresidentePrudente(o: OpcoesNfseMunicipal = {}): ItemDoDanfe[][] {
  const numero = o.numero ?? '6001';
  const emissao = o.emissao ?? '13/07/2026';
  const condicao = o.condicao === undefined ? 'COND.PAGTO.:28/56/84/112 DIAS' : o.condicao;
  const total = o.total ?? '11.360,00';
  const liquido = o.liquido === undefined ? total : o.liquido;
  const p: ItemDoDanfe[] = [
    it('Número da Nota', 444, 813, 59, 8), it('PREFEITURA MUNICIPAL DE EXEMPLO', 133, 804, 244, 12), it(numero, 500, 799, 22),
    it('Data e Hora de Emissão', 444, 786, 87, 8), it(`${emissao} 16:48:40`, 465, 773, 93),
    ...(o.semTitulo ? [] : [it('NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e', 109, 771, 292, 12)]),
    it('Código de verificação', 444, 763, 77, 8), it('RPS N°', 134, 750, 35), it('6000', 175, 750, 22), it(o.codigo ?? '5A1B2C3D4E', 481, 750, 61),
    it('PRESTADOR DE SERVIÇOS', 231, 734, 134),
    it('Nome/Razão Social:', 100, 713, 91), it('PRESTADORA SINTETICA LTDA', 192, 713, 130),
    it('Inscrição Municipal:', 331, 703, 88), it('9999', 421, 703, 22),
    ...(o.semCnpjPrestador ? [] : [it('CPF/CNPJ:', 100, 701, 52), it('11.222.333/0004-24', 159, 701, 90)]),
    it('Logradouro:', 100, 688, 54), it('AVENIDA EXEMPLO, 381 - A', 160, 688, 150),
    it('CEP:', 331, 677, 23), it('19000-000', 354, 677, 45, 9.5), it('Bairro:', 100, 675, 30), it('VILA EXEMPLO', 134, 675, 77),
    it('Município:', 100, 661, 46), it('CIDADE EXEMPLO', 148, 661, 100), it('UF:', 331, 661, 16), it('SP', 348, 661, 13),
    it('TOMADOR DE SERVIÇOS', 236, 647, 123),
    it('Nome/Razão Social:', 23, 628, 91), it('PRODUTOR SINTETICO DE TESTE', 116, 628, 150),
    it('Inscrição Municipal:', 333, 618, 88), it('CPF/CNPJ:', 23, 616, 52), it('111.444.777-35', 80, 616, 70),
    it('Logradouro:', 23, 604, 54), it('FAZ SINTETICA, S/N', 82, 604, 86),
    it('INTERMEDIÁRIO DE SERVIÇOS', 222, 558, 151), it('CPF/CNPJ:', 23, 542, 52), it('Nome/Razão Social:', 210, 542, 91),
    it('DISCRIMINAÇÃO DOS SERVIÇOS', 218, 524, 160),
    it(`Atividade: *INFORMACOES ADICIONAIS: O.S.:00001/0${condicao ? ` ${condicao}` : ''} CHASSI:SINTETICO`, 21, 511, 519, 8),
    it('MANUTENCAO CAMPO, MAQUINA DE TESTE', 21, 491, 198, 8),
    ...(liquido != null ? [it(`VALOR LÍQUIDO DA NOTA FISCAL: R$ ${liquido}`, 181, 305, 233)] : []),
    it('Discriminação dos Serviços', 160, 292, 123), it('QTDE UNITÁRIO R$ TOTAL R$', 424, 292, 149),
    it('SERVICO MECANICA', 20, 275, 101), it('1', 447, 275, 6), it(`R$ ${total}`, 462, 275, 60), it('R$ 0,00', 540, 275, 35),
    it('PIS:', 21, 252, 19), it('COFINS:', 129, 252, 40), it('INSS:', 240, 252, 26), it('IRRF:', 351, 252, 26), it('CSLL:', 462, 252, 28),
    it(`R$ ${o.pis ?? '0,00'}`, 99, 241, 28, 8), it(`R$ ${o.cofins ?? '0,00'}`, 210, 241, 28, 8), it(`R$ ${o.inss ?? '0,00'}`, 320, 241, 28, 8),
    it(`R$ ${o.irrf ?? '0,00'}`, 432, 241, 28, 8), it(`R$ ${o.csll ?? '0,00'}`, 543, 241, 28, 8),
    it(`VALOR TOTAL DA NOTA FISCAL: R$ ${total}`, 202, 222, 224),
    it('Valor Total das Deduções:', 22, 210, 118), it('Base de Cálculo:', 146, 210, 76), it('Alíquota:', 225, 210, 40),
    it('Valor do ISS:', 273, 210, 59), it('Crédito (R$):', 338, 210, 57), it('ISS Retido:', 409, 210, 51), it('Valor ISS Retido:', 491, 210, 77),
    it(`R$ ${total}`, 176, 198, 48, 8), it('R$ 0,00', 116, 197, 28, 8), it('5,00%', 248, 197, 23, 8), it(`R$ ${o.iss ?? '568,00'}`, 299, 197, 37, 8),
    it('R$ 0,00', 377, 197, 28, 8), it(o.issRetido ? 'Retido' : 'Não Retido', 447, 197, 42, 8), it(`R$ ${o.issRetido ? (o.iss ?? '568,00') : '0,00'}`, 546, 197, 28, 8),
    it('OUTRAS INFORMAÇÕES', 238, 146, 120),
  ];
  return [p];
}

/** Sao Paulo (o layout com o "Identificador Nacional"). Sem `liquido` impresso: so' o "VALOR TOTAL DO SERVIÇO". */
export function nfseSaoPaulo(o: OpcoesNfseMunicipal = {}): ItemDoDanfe[][] {
  const numero = o.numero ?? '000004321';
  const emissao = o.emissao ?? '20/10/2026';
  const aamm = `${emissao.slice(8, 10)}${emissao.slice(3, 5)}`;
  const chave = o.chave ?? chaveSpSintetica(numero, aamm);
  const total = o.total ?? '26,39';
  const p: ItemDoDanfe[] = [
    it('Número da Nota', 456, 805, 59, 8), it('PREFEITURA DO MUNICÍPIO DE EXEMPLO', 130, 796, 279, 14), it(numero, 478, 792, 62, 12),
    it('Data e Hora de Emissão', 456, 782, 85, 8), it(`${emissao} 10:00:00`, 461, 770, 96),
    ...(o.semTitulo ? [] : [it('NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e', 145, 760, 248, 11)]),
    it('Código de Verificação', 456, 759, 78, 8), it(`RPS Nº 1 Série E1, emitido em ${emissao}`, 199, 751, 141, 6), it(o.codigo ?? 'ABCD-EFGH', 481, 748, 56),
    it(`Identificador Nacional: ${chave}`, 144, 729, 307, 8),
    it('PRESTADOR DE SERVIÇOS', 237, 710, 122),
    ...(o.semCnpjPrestador ? [] : [it('CPF/CNPJ:', 99, 697, 40, 8), it('11.222.333/0004-24', 145, 697, 75, 8)]),
    it('Inscrição Municipal:', 368, 697, 71, 8), it('1.234.567-8', 442, 697, 44, 8),
    it('Nome/Razão Social:', 99, 686, 73, 8), it('PRESTADORA SINTETICA S/A', 176, 686, 100, 8),
    it('Endereço:', 99, 675, 35, 8), it('AV EXEMPLO 1000, ANDAR 10 - BAIRRO EXEMPLO - CEP: 01000-000', 139, 675, 292, 8),
    it('Município:', 99, 663, 37, 8), it('São Paulo', 142, 663, 36, 8), it('UF:', 368, 663, 12, 8), it('SP', 386, 663, 10, 8),
    it('TOMADOR DE SERVIÇOS', 241, 636, 113),
    it('Nome/Razão Social:', 31, 624, 73, 8), it('PRODUTOR SINTETICO DE TESTE', 108, 624, 142, 8),
    it('CPF/CNPJ:', 31, 612, 40, 8), it('111.444.777-35', 76, 612, 58, 8),
    it('INTERMEDIÁRIO DE SERVIÇOS', 228, 573, 139), it('CPF/CNPJ:', 31, 561, 40, 8), it('----', 76, 561, 13, 8),
    it('DISCRIMINAÇÃO DE SERVIÇOS', 227, 545, 141),
    it('Disponibilização de conteúdos de teste por meio da internet.', 31, 533, 300, 8),
    it(`VALOR TOTAL DO SERVIÇO = R$ ${total}`, 210, 256, 176),
    it('Contribuição Previdenciária - Retida (R$)', 55, 244, 126, 7), it('IRRF (R$)', 238, 244, 29, 7), it('COFINS (R$)', 323, 244, 39, 7),
    it('PIS/PASEP (R$)', 407, 244, 50, 7), it('IPI (R$)', 510, 244, 23, 7),
    it(o.inss ?? '0,00', 189, 234, 16, 8), it(o.irrf ?? '0,00', 279, 234, 16, 8), it(o.cofins ?? '0,00', 369, 234, 16, 8), it(o.pis ?? '0,00', 458, 234, 16, 8),
    it('0,00', 548, 234, 16, 8),
    it('Contribuições Sociais - Retidas (R$)', 107, 222, 111, 7), it('0,00', 279, 211, 16, 8),
    it('Código do Serviço', 31, 197, 64, 8), it('02800 - Disponibilização de conteúdos de teste', 31, 189, 367, 8),
    it('Valor Total das Deduções (R$)', 35, 176, 95, 7), it('Base de Cálculo (R$)', 158, 176, 65, 7), it('Alíquota (%)', 279, 176, 38, 7),
    it('Valor do ISS (R$)', 379, 176, 53, 7),
    it('0,00', 117, 166, 16, 8), it(total, 220, 166, 20, 8), it('2,00%', 327, 166, 22, 8), it(`${o.iss ?? '0,52'} (*)`, 429, 166, 27, 8),
    it('OUTRAS INFORMAÇÕES', 242, 128, 111),
  ];
  return [p];
}
