/**
 * FIXTURES SINTETICAS DE NF-e 4.00 — FIN-NFE-XML-01a. NENHUM DADO REAL: CNPJ, CPF, IE, nomes e enderecos sao FICTICIOS, de
 * formato valido. A estrutura e' a de uma NF-e autorizada de 2026 (com os grupos da reforma tributaria: `IBSCBS`, `IBSCBSTot`,
 * `vNFTot`), montada a partir de um molde para nao repetir quinze arquivos inteiros.
 */
const NS = 'http://www.portalfiscal.inf.br/nfe';

export const EMITENTE_CNPJ = '11222333000181';
export const EMITENTE_CPF = '52998224725';
export const DESTINATARIO_CPF = '11144477735';

/** Digito verificador da chave de acesso (modulo 11, pesos 2..9 da direita para a esquerda). */
function dvDaChave(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}
export function chaveDe(docEmitente: string, modelo: string, numero: string): string {
  const base = `50${'2609'}${docEmitente.padStart(14, '0')}${modelo}001${numero.padStart(9, '0')}1${'12345678'}`;
  return base + dvDaChave(base);
}

export interface OpcoesNota {
  modelo?: string;
  numero?: string;
  vNF?: string;
  /** [nDup, dVenc, vDup] — `null` tira o grupo `cobr` inteiro. */
  duplicatas?: [string, string, string][] | null;
  cStat?: string | null;            // null = NFe solta, sem protNFe
  finNFe?: string;
  emitenteCpf?: boolean;
  nomeEmitente?: string;
  dhEmi?: string;
  encoding?: string;
  /** Prefixo de namespace nos elementos (`nfe:`), para provar a leitura por localName. */
  prefixo?: string;
  semCampo?: 'nNF' | 'dhEmi' | 'emit' | 'vNF' | 'chave';
}

const ITENS: [string, string, string, string][] = [
  ['SAL MINERAL 80 P SC 30KG', '120.0000', 'SC', '9600.00'],
  ['RACAO ENGORDA 18% SC 40KG', '50.0000', 'SC', '4250.00'],
  ['UREIA PECUARIA SC 25KG', '10.0000', 'SC', '1180.00'],
  ['VERMIFUGO INJETAVEL 500ML', '4.0000', 'FR', '716.00'],
  ['ARAME FARPADO 500M', '2.0000', 'RL', '392.00'],
  ['BRINCO IDENTIFICACAO CX 100', '1.0000', 'CX', '100.00'],
];

/** O `infNFe` + a `NFe` que o envolve. */
function nfe(o: OpcoesNota, p: string): string {
  const modelo = o.modelo ?? '55';
  const numero = o.numero ?? '12345';
  const vNF = o.vNF ?? '16238.00';
  const doc = o.emitenteCpf ? EMITENTE_CPF : EMITENTE_CNPJ;
  const chave = chaveDe(doc, modelo, numero);
  const t = (nome: string, valor: string) => `<${p}${nome}>${valor}</${p}${nome}>`;
  const dups = o.duplicatas === undefined
    ? [['001', '2026-11-05', '8119.00'], ['002', '2026-12-05', '8119.00']] as [string, string, string][]
    : o.duplicatas;
  const cobr = dups === null ? '' : `<${p}cobr><${p}fat>${t('nFat', numero)}${t('vOrig', vNF)}${t('vDesc', '0.00')}${t('vLiq', vNF)}</${p}fat>${
    dups.map(([n, d, v]) => `<${p}dup>${t('nDup', n)}${t('dVenc', d)}${t('vDup', v)}</${p}dup>`).join('')}</${p}cobr>`;
  const ide = `<${p}ide>${t('cUF', '50')}${t('cNF', '12345678')}${t('natOp', 'VENDA DE MERCADORIA')}${t('mod', modelo)}${t('serie', '1')}${
    o.semCampo === 'nNF' ? '' : t('nNF', numero)}${o.semCampo === 'dhEmi' ? '' : t('dhEmi', o.dhEmi ?? '2026-09-30T10:15:00-04:00')}${
    t('dhSaiEnt', '2026-10-01T08:00:00-04:00')}${t('tpNF', '1')}${t('idDest', '1')}${t('cMunFG', '5002704')}${t('tpImp', '1')}${
    t('tpEmis', '1')}${t('cDV', chave.slice(-1))}${t('tpAmb', '1')}${t('finNFe', o.finNFe ?? '1')}${t('indFinal', '0')}${t('indPres', '1')}</${p}ide>`;
  const emit = o.semCampo === 'emit' ? '' : `<${p}emit>${o.emitenteCpf ? t('CPF', EMITENTE_CPF) : t('CNPJ', EMITENTE_CNPJ)}${
    t('xNome', o.nomeEmitente ?? 'AGROPECUARIA EXEMPLO LTDA')}${o.emitenteCpf ? '' : t('xFant', 'CASA DO CAMPO')}<${p}enderEmit>${
    t('xLgr', 'RUA FICTICIA')}${t('nro', '100')}${t('xBairro', 'CENTRO')}${t('cMun', '5002704')}${t('xMun', 'CAMPO GRANDE')}${t('UF', 'MS')}${
    t('CEP', '79000000')}</${p}enderEmit>${t('IE', '283456789')}${t('CRT', '3')}</${p}emit>`;
  const dest = `<${p}dest>${t('CPF', DESTINATARIO_CPF)}${t('xNome', 'PRODUTOR RURAL DE TESTE')}<${p}enderDest>${t('xLgr', 'FAZENDA MODELO')}${
    t('nro', 'SN')}${t('xBairro', 'ZONA RURAL')}${t('cMun', '5002704')}${t('xMun', 'CAMPO GRANDE')}${t('UF', 'MS')}</${p}enderDest>${
    t('indIEDest', '1')}${t('IE', '28.987.654-3')}</${p}dest>`;
  const det = ITENS.map(([x, q, u, v], i) => `<${p}det nItem="${i + 1}"><${p}prod>${t('cProd', String(1000 + i))}${t('cEAN', 'SEM GTIN')}${
    t('xProd', x)}${t('NCM', '23099090')}${t('CFOP', '5102')}${t('uCom', u)}${t('qCom', q)}${t('vUnCom', '1.0000000000')}${t('vProd', v)}${
    t('indTot', '1')}</${p}prod><${p}imposto><${p}ICMS><${p}ICMS00>${t('orig', '0')}${t('CST', '00')}${t('vBC', v)}${t('pICMS', '0.00')}${
    t('vICMS', '0.00')}</${p}ICMS00></${p}ICMS><${p}IBSCBS>${t('CST', '000')}${t('cClassTrib', '000001')}<${p}gIBSCBS>${t('vBC', v)}<${p}gIBSUF>${
    t('pIBSUF', '0.1000')}${t('vIBSUF', '0.00')}</${p}gIBSUF><${p}gCBS>${t('pCBS', '0.9000')}${t('vCBS', '0.00')}</${p}gCBS></${p}gIBSCBS></${p}IBSCBS></${p}imposto></${p}det>`).join('');
  const total = `<${p}total><${p}ICMSTot>${t('vBC', vNF)}${t('vICMS', '0.00')}${t('vProd', vNF)}${t('vFrete', '0.00')}${t('vSeg', '0.00')}${
    t('vDesc', '0.00')}${t('vOutro', '0.00')}${o.semCampo === 'vNF' ? '' : t('vNF', vNF)}</${p}ICMSTot><${p}IBSCBSTot>${t('vBCIBSCBS', vNF)}<${p}gIBS>${
    t('vIBS', '0.00')}</${p}gIBS><${p}gCBS>${t('vCBS', '0.00')}</${p}gCBS></${p}IBSCBSTot>${t('vNFTot', vNF)}</${p}total>`;
  const pag = `<${p}pag><${p}detPag>${t('indPag', '1')}${t('tPag', '15')}${t('vPag', vNF)}</${p}detPag></${p}pag>`;
  const id = o.semCampo === 'chave' ? '' : ` Id="NFe${chave}"`;
  return `<${p}NFe${p ? '' : ` xmlns="${NS}"`}><${p}infNFe versao="4.00"${id}>${ide}${emit}${dest}${det}${total}<${p}transp>${
    t('modFrete', '9')}</${p}transp>${cobr}${pag}</${p}infNFe></${p}NFe>`;
}

/** Uma NF-e: `nfeProc` com protocolo (padrao) ou a `NFe` solta (`cStat: null`). */
export function montarNFe(o: OpcoesNota = {}): string {
  const p = o.prefixo ? `${o.prefixo}:` : '';
  const xmlns = o.prefixo ? ` xmlns:${o.prefixo}="${NS}"` : ` xmlns="${NS}"`;
  const cabecalho = `<?xml version="1.0" encoding="${o.encoding ?? 'UTF-8'}"?>`;
  const corpo = nfe(o, p);
  if (o.cStat === null) return o.prefixo ? `${cabecalho}${corpo.replace(`<${p}NFe>`, `<${p}NFe${xmlns}>`)}` : `${cabecalho}${corpo}`;
  const chave = chaveDe(o.emitenteCpf ? EMITENTE_CPF : EMITENTE_CNPJ, o.modelo ?? '55', o.numero ?? '12345');
  const t = (nome: string, valor: string) => `<${p}${nome}>${valor}</${p}${nome}>`;
  const prot = `<${p}protNFe versao="4.00"><${p}infProt>${t('tpAmb', '1')}${t('verAplic', 'MS_NFE_1.0')}${
    o.semCampo === 'chave' ? '' : t('chNFe', chave)}${t('dhRecbto', '2026-09-30T10:16:02-04:00')}${t('nProt', '150260000123456')}${
    t('digVal', 'AAAA')}${t('cStat', o.cStat ?? '100')}${t('xMotivo', 'Autorizado o uso da NF-e')}</${p}infProt></${p}protNFe>`;
  return `${cabecalho}<${p}nfeProc versao="4.00"${xmlns}>${corpo}${prot}</${p}nfeProc>`;
}

/** Dois `infNFe` no mesmo arquivo (lote). */
export function montarLote(): string {
  const a = nfe({ numero: '1' }, '');
  const b = nfe({ numero: '2' }, '');
  return `<?xml version="1.0" encoding="UTF-8"?><enviNFe versao="4.00" xmlns="${NS}"><idLote>1</idLote>${a}${b}</enviNFe>`;
}

/** Um `nfeProc` com DUAS notas dentro: a raiz nao denuncia o lote, so' a contagem de `infNFe`. */
export function montarProcComDuasNotas(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="${NS}">${nfe({ numero: '1' }, '')}${nfe({ numero: '2' }, '')}</nfeProc>`;
}

export const CTE = '<?xml version="1.0" encoding="UTF-8"?><cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte"><CTe><infCte versao="4.00" Id="CTe50260911222333000181570010000001231000001230"><ide><mod>57</mod><nCT>123</nCT></ide></infCte></CTe></cteProc>';
export const EVENTO = `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00" xmlns="${NS}"><evento versao="1.00"><infEvento Id="ID110111${chaveDe(EMITENTE_CNPJ, '55', '12345')}01"><tpEvento>110111</tpEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento></detEvento></infEvento></evento></procEventoNFe>`;
export const NFSE = '<?xml version="1.0" encoding="UTF-8"?><CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse><InfNfse><Numero>77</Numero></InfNfse></Nfse></CompNfse>';
export const NAO_XML = 'Banco;Data;Valor\n001;30/09/2026;1345,50\n';

/** Texto → bytes UTF-8. */
export function utf8(texto: string): ArrayBuffer {
  const u = new TextEncoder().encode(texto);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
}
/** Texto → bytes windows-1252 (so' para caracteres ate' U+00FF, que e' o que o Latin-1 cobre). */
export function latin1(texto: string): ArrayBuffer {
  const u = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    if (c > 0xff) throw new Error(`fixture: caractere fora do Latin-1 na posicao ${i}`);
    u[i] = c;
  }
  return u.buffer;
}
