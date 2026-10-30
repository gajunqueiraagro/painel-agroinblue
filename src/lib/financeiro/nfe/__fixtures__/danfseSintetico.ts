/** P174 NFSE-LEITURA-01 — um DANFSe v2.0 (NFS-e nacional) SINTETICO: as POSICOES do leiaute nacional (folha em pe', rotulo em cima e valor
 *  8 pt abaixo) com dados de teste (prestador CNPJ 11.222.333/0004-24, tomador CPF 111.444.777-35, municipio IBGE 5002704, IE 280000001;
 *  a chave de 50 montada com o digito certo). O PDF real da FASE 0 fica fora do repo (dado de cliente). */
import { digitoDaChave, type ItemDoDanfe } from '../danfe';

export interface OpcoesDanfse {
  numero?: string; emissao?: string; competencia?: string; situacao?: string;
  /** Valores como impressos ("1.234,56" ou "-"). */
  bruto?: string; desconto?: string; issApurado?: string; issRetido?: boolean; irrf?: string; previdencia?: string; contribuicoes?: string;
  totalRetido?: string; liquido?: string;
  /** Troca a chave impressa (para a conferencia). */
  chave?: string;
}

export const CNPJ_PRESTADOR_SINTETICO = '11222333000424';

/** A chave de 50: municipio(7) ambiente(1) tpInsc(1) inscricao(14) numero(13) AAMM(4) codigo(9) + DV. */
export function chaveNfseSintetica(numero: string, aamm: string, inscricao = CNPJ_PRESTADOR_SINTETICO, tipoInscricao = '2'): string {
  const sem = `5002704${'1'}${tipoInscricao}${inscricao.padStart(14, '0')}${numero.padStart(13, '0')}${aamm}${'123456789'}`;
  return `${sem}${digitoDaChave(sem)}`;
}

const R = (v: string) => (v === '-' ? '-' : `R$ ${v}`);

export function danfseSintetico(o: OpcoesDanfse = {}): ItemDoDanfe[][] {
  const numero = o.numero ?? '57';
  const emissao = o.emissao ?? '06/10/2026';
  const competencia = o.competencia ?? emissao;
  const aamm = `${emissao.slice(8, 10)}${emissao.slice(3, 5)}`;
  const chave = o.chave ?? chaveNfseSintetica(numero, aamm);
  const it = (str: string, x: number, y: number, w = 60, h = 7): ItemDoDanfe => ({ str, x, y, w, h });
  const rot = (str: string, x: number, y: number) => it(str, x, y, 60, 6);
  return [[
    it('DANFSe v2.0', 270, 827.4, 55, 9),
    it('Documento Auxiliar da NFS-e', 238, 815.4, 119, 9),
    it('Município: CAMPO GRANDE / MS', 437, 826.6, 149, 8),
    it('', 7, 786.3, 0, 7),
    it('CHAVE DE ACESSO DA NFS-E', 7, 786.3, 102.6),
    it(chave, 7, 778.5, 194.6),
    it('NÚMERO DA NFS-E', 7, 767.3), it(numero, 7, 759.5, 11.7),
    it('COMPETÊNCIA DA NFS-E', 107, 767.3), it(competencia, 107, 759.5, 35),
    it('DATA E HORA DA EMISSÃO DA NFS-E', 207, 767.3, 129.8), it(`${emissao} 10:46:06`, 207, 759.5, 64.2),
    it('NÚMERO DA DPS', 7, 749.3), it('-', 7, 741.5, 2.3),
    it('DATA E HORA DA EMISSÃO DA DPS', 207, 749.3, 123.2), it(`${emissao} 10:46:06`, 207, 741.5, 64.2),
    it('SITUAÇÃO DA NFS-e', 107, 731.3), it(o.situacao ?? 'NFS-e Gerada', 107, 723.5, 45.5),
    it('FINALIDADE', 207, 731.3), it('NFS-e regular', 207, 723.5, 44),
    /* PRESTADOR */
    it('PRESTADOR / FORNECEDOR', 8, 708.4, 99.5),
    rot('CPF / CNPJ / NIF', 152, 709.7), it('11.222.333/0004-24', 152, 701.5, 62.7),
    rot('Inscrição Municipal', 297, 709.7), it('1234', 297, 701.5, 11.7),
    rot('Telefone', 442, 709.7),
    rot('Nome / Nome empresarial', 7, 690.7), it('OFICINA SINTETICA DE TESTE LTDA', 7, 682.5, 110),
    rot('Município / Sigla UF', 297, 690.7), it('CAMPO GRANDE / MS', 297, 682.5, 70),
    rot('Código IBGE / CEP', 442, 690.7), it('5002704 / 79000-000', 442, 682.5, 66.5),
    rot('Endereço', 7, 671.7), it('RUA DAS FLORES, 100, , CENTRO', 7, 663.5, 120),
    rot('E-mail', 297, 671.7), it('-', 297, 663.5, 2.3),
    /* TOMADOR */
    it('TOMADOR / ADQUIRENTE', 8, 632.4, 88.2),
    rot('CPF / CNPJ / NIF', 152, 633.7), it('111.444.777-35', 152, 625.5, 49),
    rot('Inscrição Municipal', 297, 633.7), it('-', 297, 625.5, 2.3),
    rot('Nome / Nome empresarial', 7, 614.7), it('PRODUTOR SINTETICO DE TESTE', 7, 606.5, 93.7),
    rot('Município / Sigla UF', 297, 614.7), it('TERENOS / MS', 297, 606.5, 60),
    rot('Endereço', 7, 595.7), it('FAZENDA SINTETICA, S/N, ZONA RURAL', 7, 587.5, 117.1),
    it('O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO', 172.7, 575.3, 248.7),
    /* SERVICO */
    it('SERVIÇO PRESTADO', 8, 552.3, 72.3),
    rot('Código de Tributação Nacional / Municipal', 152, 552.7), it('14.01.01', 152, 544.5, 27.2),
    rot('Código da NBS', 297, 552.7), it('120013110', 297, 544.5, 35),
    it('Lubrificação, limpeza, conserto e manutenção de máquinas, veículos, aparelhos, equipamentos,...', 7, 534.5, 536.9),
    rot('Descrição do Serviço', 7, 523.7),
    it('CONSERTO DA BOMBA DO POCO SINTETICO', 7, 514.5, 200),
    it('02 DESLOCAMENTO', 8.9, 506.6, 68.5),
    /* ISSQN (os rotulos a 1,3 pt acima do titulo: nao entram na descricao) */
    it('TRIBUTAÇÃO MUNICIPAL (ISSQN)', 8, 488.4, 115.4),
    rot('Tipo de Tributação do ISSQN', 152, 489.7), it('Operação tributável', 152, 481.6, 61.1),
    rot('Município / Sigla UF / País de Incidência do ISSQN', 297, 489.7), it('CAMPO GRANDE / MS / BR', 297, 481.6, 100),
    rot('Desconto Incondicionado', 442, 453.7), it(R(o.desconto ?? '-'), 442, 445.6, 30),
    rot('BC ISSQN', 7, 435.7), it(R(o.bruto ?? '980,00'), 7, 427.6, 32.3),
    rot('Alíquota Aplicada', 152, 435.7), it('2,45%', 152, 427.6, 19.8),
    rot('Retenção do ISSQN', 297, 435.7), it(o.issRetido ? 'Retido' : 'Não Retido', 297, 427.6, 35),
    rot('ISSQN Apurado', 442, 435.7), it(R(o.issApurado ?? '24,01'), 442, 427.6, 28.4),
    /* FEDERAL (o valor sai antes do rotulo, na ordem do fluxo) */
    it('TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 8, 415.4, 133.3),
    it(R(o.irrf ?? '-'), 152, 408.6, 20), rot('IRRF', 152, 416.7),
    it(R(o.previdencia ?? '-'), 297, 408.6, 20), rot('Contribuição Previdenciária - Retida', 297, 416.7),
    rot('Contribuições Sociais - Retidas', 442, 416.7), it(R(o.contribuicoes ?? '-'), 442, 408.6, 20),
    /* VALOR TOTAL */
    it('VALOR TOTAL DA NFS-E', 8, 303.4, 84.7),
    rot('VALOR DA OPERAÇÃO / SERVIÇO', 152, 304.7), it(R(o.bruto ?? '980,00'), 152, 296.6, 32.3),
    rot('Desconto Incondicionado', 297, 304.7), it(R(o.desconto ?? '0,00'), 297, 296.6, 24.5),
    rot('Desconto Condicionado', 442, 304.7), it('R$ 0,00', 442, 296.6, 24.5),
    rot('Total das Retenções (ISSQN / Federais)', 7, 286.7), it(R(o.totalRetido ?? '0,00'), 7, 278.6, 24.5),
    rot('VALOR LÍQUIDO DA NFS-e', 152, 286.7), it(R(o.liquido ?? '980,00'), 152, 278.6, 32.3),
    rot('VALOR LÍQUIDO DA NFS-E + IBS/CBS', 442, 286.7), it(R(o.liquido ?? '980,00'), 442, 278.6, 32.3),
    it('INFORMAÇÕES COMPLEMENTARES', 7, 265.3, 123.6),
    it('Inf. Cont.: INSCRIÇÃO ESTADUAL: 280000001; | Totais Aproximados dos Tributos: Federais: R$0,00', 7, 255.6, 300),
  ]];
}
