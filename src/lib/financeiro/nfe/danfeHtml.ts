/**
 * NOTA-DANFE-01 (FASE 0 aprovada 17/11: layout PRÓPRIO, mock ui-validar/nota-danfe-01.html) — o DANFE de uma NF-e a partir do XML.
 * PURO: recebe a `NotaLida` + os `ExtrasDoDanfe` (os dois do MESMO leitor, `lerNFe.ts`) e devolve o documento HTML A4 inteiro, que o
 * navegador imprime ou salva em PDF (sem servidor, sem biblioteca de PDF). Vale para a NF-e de qualquer cliente.
 *  · blocos e ordem do modelo (MOC, Anexo II): canhoto, emitente | DANFE | código de barras + chave, natureza + protocolo, IE/CNPJ,
 *    destinatário, pagamento/fatura, cálculo do imposto, transporte, produtos, dados adicionais;
 *  · código de barras Code-128 conjunto C da chave (44 dígitos), em SVG;
 *  · várias folhas: a 1ª com ITENS_FOLHA_1 itens e as outras com ITENS_POR_FOLHA (o cabeçalho se repete);
 *  · homologação = "SEM VALOR FISCAL" em marca d'água;
 *  · tudo que vem do XML é escapado (nome com "<" ou "&" não quebra a página).
 */
import type { NotaLida } from './tipos';
import type { ExtrasDoDanfe, ItemDoDanfe } from './lerNFe';

export const ITENS_FOLHA_1 = 22;
export const ITENS_POR_FOLHA = 46;

/* Code 128 — os 107 padrões (largura de barra/espaço); 105 = início do conjunto C, 106 = fim */
const PADROES = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112',
  '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331',
  '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311',
  '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112',
  '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211',
  '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112'];

/** os códigos do Code-128C para uma sequência PAR de dígitos: início (105), pares, verificador (mod 103), fim (106) */
export function codigos128C(digitos: string): number[] {
  if (!/^(\d\d)+$/.test(digitos)) throw new Error('Code-128C pede um número par de dígitos.');
  const cod = [105];
  for (let i = 0; i < digitos.length; i += 2) cod.push(Number(digitos.slice(i, i + 2)));
  const soma = cod.reduce((s, c, i) => s + c * (i === 0 ? 1 : i), 0);
  return [...cod, soma % 103, 106];
}
/** o SVG das barras (zona quieta de 10 módulos de cada lado) */
export function barras128C(digitos: string): string {
  let x = 10; let rects = '';
  for (const c of codigos128C(digitos)) {
    const p = PADROES[c];
    for (let i = 0; i < p.length; i++) { const w = Number(p[i]); if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w; }
  }
  return `<svg class="bar" viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" role="img" aria-label="código de barras da chave">${rects}</svg>`;
}

const esc = (t: string | null | undefined): string =>
  (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c: number | null | undefined): string =>
  c == null ? '' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (t: string, casas: number): string => {
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : esc(t);
};
const data = (iso: string | null): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const dataHora = (iso: string | null): string => (iso ? `${data(iso)} ${/T(\d{2}:\d{2}:\d{2})/.exec(iso)?.[1] ?? ''}`.trim() : '');
export const chaveEmGrupos = (chave: string): string => chave.replace(/(\d{4})(?=\d)/g, '$1 ');
const nf = (n: string): string => n.replace(/\D/g, '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
const docFmt = (d: string | null): string => {
  if (!d) return '';
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d;
};
const cep = (c: string | null): string => (c && c.length === 8 ? `${c.slice(0, 2)}.${c.slice(2, 5)}-${c.slice(5)}` : (c ?? ''));
const FRETE: Record<string, string> = { '0': '0 - Por conta do emitente', '1': '1 - Por conta do destinatário', '2': '2 - Por conta de terceiros',
  '3': '3 - Próprio do remetente', '4': '4 - Próprio do destinatário', '9': '9 - Sem frete' };
const TPAG: Record<string, string> = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '05': 'Crédito loja',
  '10': 'Vale alimentação', '11': 'Vale refeição', '12': 'Vale presente', '13': 'Vale combustível', '15': 'Boleto', '16': 'Depósito', '17': 'PIX',
  '18': 'Transferência', '19': 'Fidelidade', '90': 'Sem pagamento', '99': 'Outros' };

const cx = (rotulo: string, valor: string, classe = ''): string => `<div class="cx ${classe}"><b>${esc(rotulo)}</b><span>${valor}</span></div>`;
const grade = (colunas: string, ...caixas: string[]): string => `<div class="g" style="grid-template-columns:${colunas}">${caixas.join('')}</div>`;

const CSS = `@page{size:A4 portrait;margin:6mm}*{box-sizing:border-box}
body{margin:0;background:#8a9099;font:7.2pt/1.15 Arial,Helvetica,sans-serif;color:#000}
.barra{width:210mm;margin:12px auto 0;display:flex;justify-content:space-between;align-items:center;color:#fff;font:12px system-ui,sans-serif}
.barra button{font:12px system-ui,sans-serif;padding:4px 10px;border-radius:4px;border:0;background:#1F3A5F;color:#fff;cursor:pointer}
.folha{position:relative;width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:6mm;box-shadow:0 4px 20px #0005;page-break-after:always}
.folha:last-child{page-break-after:auto}
@media print{body{background:#fff}.barra{display:none}.folha{margin:0;box-shadow:none;padding:0;width:auto;min-height:auto}}
.cx{border:1px solid #000;padding:1px 3px;min-height:7mm;margin:-0.5px 0 0 -0.5px;overflow:hidden}
.cx b{display:block;font-size:5.6pt;font-weight:normal;text-transform:uppercase}.cx span{font-size:7.6pt}
.g{display:grid}.t{font-size:6.4pt;font-weight:bold;margin:2.5mm 0 .6mm;text-transform:uppercase}.r{text-align:right}.c{text-align:center}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{border:1px solid #000;font-size:5.4pt;font-weight:normal;padding:1px 2px;text-transform:uppercase}
td{border-left:1px solid #000;border-right:1px solid #000;font-size:6.4pt;padding:.6px 2px;white-space:nowrap;overflow:hidden}td.d{white-space:normal}
tbody tr:last-child td{border-bottom:1px solid #000}
.canhoto{display:grid;grid-template-columns:1fr 34mm;border:1px solid #000;margin-bottom:2mm}.canhoto .a{padding:1px 3px;border-right:1px solid #000;font-size:6pt}
.canhoto .s{display:grid;grid-template-columns:30mm 1fr;border-top:1px solid #000}.canhoto .s div{padding:1px 3px;min-height:7mm;font-size:5.6pt}
.canhoto .s div+div{border-left:1px solid #000}
.cab{display:grid;grid-template-columns:80mm 34mm 1fr}.cab>div{border:1px solid #000;margin-left:-1px;padding:2mm}
.dt{text-align:center}.dt h1{font-size:13pt;margin:0}.dt p{margin:1mm 0;font-size:6.2pt}
.chave{font:8pt/1 Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.4px;text-align:center}svg.bar{width:100%;height:12mm;display:block}
.hom{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:bold 40pt Arial;color:#c0000033;transform:rotate(-30deg)}`;

const TH_ITENS = '<colgroup><col style="width:13mm"><col><col style="width:13mm"><col style="width:7mm"><col style="width:8mm"><col style="width:7mm">'
  + '<col style="width:12mm"><col style="width:12mm"><col style="width:13mm"><col style="width:12mm"><col style="width:10mm"><col style="width:9mm">'
  + '<col style="width:8mm"></colgroup><thead><tr><th>Código</th><th>Descrição do produto / serviço</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>Un</th>'
  + '<th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>BC ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th></tr></thead>';

function linhaDoItem(i: ItemDoDanfe): string {
  return `<tr><td>${esc(i.codigo)}</td><td class="d">${esc(i.descricao)}</td><td>${esc(i.ncm)}</td><td>${esc(i.cst)}</td><td>${esc(i.cfop)}</td>`
    + `<td>${esc(i.unidade)}</td><td class="r">${num(i.quantidade, 4)}</td><td class="r">${num(i.unitario, 4)}</td><td class="r">${brl(i.totalCent)}</td>`
    + `<td class="r">${brl(i.bcIcmsCent)}</td><td class="r">${brl(i.vIcmsCent)}</td><td class="r">${brl(i.vIpiCent ?? 0)}</td>`
    + `<td class="r">${i.aliqIcms ? num(i.aliqIcms, 2) : ''}</td></tr>`;
}

/** as folhas: a 1ª com ITENS_FOLHA_1 itens, as outras com ITENS_POR_FOLHA (sempre ao menos 1 folha) */
export function folhasDosItens<T>(itens: readonly T[]): T[][] {
  const folhas: T[][] = [itens.slice(0, ITENS_FOLHA_1)];
  for (let i = ITENS_FOLHA_1; i < itens.length; i += ITENS_POR_FOLHA) folhas.push(itens.slice(i, i + ITENS_POR_FOLHA));
  return folhas;
}

export function danfeHtml(n: NotaLida, x: ExtrasDoDanfe): string {
  const folhas = folhasDosItens(x.itens);
  const total = folhas.length;
  const e = n.emitente;
  const end = e.endereco;
  const emitente = `<div style="font-size:9pt;font-weight:bold">${esc(e.nome)}</div><div style="margin-top:1mm">${esc([end?.logradouro, end?.numero, end?.complemento].filter(Boolean).join(', '))}`
    + `${end?.bairro ? ` · ${esc(end.bairro)}` : ''}<br>${esc(end?.municipio)}${end?.uf ? ` - ${esc(end.uf)}` : ''}${end?.cep ? ` · CEP ${cep(end.cep)}` : ''}`
    + `${end?.telefone ? `<br>Fone ${esc(end.telefone)}` : ''}</div>`;
  const cabecalho = (folha: number) => `<div class="cab"><div>${emitente}</div>`
    + `<div class="dt"><h1>DANFE</h1><p>Documento Auxiliar da<br>Nota Fiscal Eletrônica</p><p>0 - ENTRADA<br>1 - SAÍDA <b style="border:1px solid #000;padding:0 3px;font-size:10pt">${n.tipoNota === 'entrada' ? '0' : '1'}</b></p>`
    + `<p style="font-size:8pt"><b>Nº ${nf(n.numero)}</b><br>SÉRIE ${esc(n.serie)}<br>FOLHA ${folha}/${total}</p></div>`
    + `<div>${barras128C(n.chave)}${cx('Chave de acesso', `<div class="chave">${chaveEmGrupos(n.chave)}</div>`)}`
    + `<p class="c" style="margin:1mm 0 0;font-size:6.4pt">Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</p></div></div>`
    + grade('1fr 70mm', cx('Natureza da operação', esc(n.naturezaOperacao)),
      cx('Protocolo de autorização de uso', n.protocolo ? `${esc(n.protocolo.numero)} · ${dataHora(x.protocoloEm)}` : 'SEM PROTOCOLO'))
    + grade('1fr 1fr 1fr', cx('Inscrição estadual', esc(e.ie)), cx('Insc. estadual do subst. trib.', esc(x.emitenteIeSt)), cx(e.documento.length === 11 ? 'CPF' : 'CNPJ', docFmt(e.documento)));
  const d = n.destinatario;
  const dx = x.destinatario;
  const pag = n.pagamentos.map((p) => `${esc(p.tPag)} — ${esc(TPAG[p.tPag] ?? '')} R$ ${brl(p.valorCent)}`).join(' · ') || '—';
  const dups = n.duplicatas.length ? n.duplicatas.map((u) => `${esc(u.numero)} ${data(u.vencimento)} R$ ${brl(u.valorCent)}`).join(' · ') : '— (sem cobrança)';
  const i = x.impostos;
  const t = x.transporte;
  const primeira = `<div class="canhoto"><div class="a">RECEBEMOS DE ${esc(e.nome)} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. `
    + `EMISSÃO: ${data(n.emissao)} · VALOR TOTAL: R$ ${brl(n.totais.notaCent)} · DESTINATÁRIO: ${esc(d.nome)} — ${esc(dx.municipio)}${dx.uf ? `/${esc(dx.uf)}` : ''}`
    + `<div class="s"><div>DATA DE RECEBIMENTO</div><div>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div></div></div>`
    + `<div class="c" style="padding:1mm"><b style="font-size:10pt">NF-e</b><br>Nº ${nf(n.numero)}<br>Série ${esc(n.serie)}</div></div>`
    + cabecalho(1)
    + '<div class="t">Destinatário / remetente</div>'
    + grade('1fr 45mm 28mm', cx('Nome / razão social', esc(d.nome)), cx('CNPJ / CPF', docFmt(d.documento)), cx('Data da emissão', data(n.emissao)))
    + grade('1fr 40mm 22mm 28mm', cx('Endereço', esc(dx.logradouro)), cx('Bairro / distrito', esc(dx.bairro)), cx('CEP', cep(dx.cep)), cx('Data da saída/entrada', data(n.saidaEntrada)))
    + grade('1fr 32mm 12mm 34mm 28mm', cx('Município', esc(dx.municipio)), cx('Fone / fax', esc(dx.fone)), cx('UF', esc(dx.uf)), cx('Inscrição estadual', esc(d.ie)),
      cx('Hora da saída/entrada', esc(x.horaSaida)))
    + '<div class="t">Pagamento / fatura</div>'
    + grade('1fr 1fr', cx('Forma e valor', pag), cx('Duplicatas', dups))
    + '<div class="t">Cálculo do imposto</div>'
    + grade('repeat(6,1fr)', cx('Base de cálc. do ICMS', brl(i.bcIcmsCent), 'r'), cx('Valor do ICMS', brl(i.icmsCent), 'r'), cx('Base de cálc. ICMS ST', brl(i.bcStCent), 'r'),
      cx('Valor do ICMS ST', brl(i.stCent), 'r'), cx('Valor aprox. tributos', brl(i.tributosCent), 'r'), cx('Valor total dos produtos', brl(i.produtosCent), 'r'),
      cx('Valor do frete', brl(i.freteCent), 'r'), cx('Valor do seguro', brl(i.seguroCent), 'r'), cx('Desconto', brl(i.descontoCent), 'r'),
      cx('Outras despesas', brl(i.outrasCent), 'r'), cx('Valor do IPI', brl(i.ipiCent), 'r'), cx('Valor total da nota', `<b>${brl(i.notaCent)}</b>`, 'r'))
    + '<div class="t">Transportador / volumes transportados</div>'
    + grade('1fr 34mm 22mm 22mm 28mm', cx('Razão social', esc(t.nome)), cx('Frete por conta', esc(FRETE[t.modFrete ?? ''] ?? t.modFrete)),
      cx('Placa do veículo', `${esc(t.placa)}${t.placaUf ? ` ${esc(t.placaUf)}` : ''}`), cx('CNPJ / CPF', docFmt(t.documento)), cx('Inscrição estadual', esc(t.ie)))
    + grade('22mm 1fr 1fr 1fr 28mm 28mm', cx('Quantidade', esc(t.quantidade), 'r'), cx('Espécie', esc(t.especie)), cx('Marca', esc(t.marca)), cx('Numeração', esc(t.numeracao)),
      cx('Peso bruto', esc(t.pesoBruto), 'r'), cx('Peso líquido', esc(t.pesoLiquido), 'r'));
  const adicionais = '<div class="t">Dados adicionais</div>'
    + grade('1fr 60mm', cx('Informações complementares', esc(n.informacoesComplementares)
      + (x.ibsCbs ? `${n.informacoesComplementares ? '<br>' : ''}IBS R$ ${brl(x.ibsCbs.ibsCent)} · CBS R$ ${brl(x.ibsCbs.cbsCent)} (grupo IBSCBSTot)` : '')),
    cx('Reservado ao fisco', esc(x.infAdFisco)));
  const marca = x.ambiente === 'homologacao' ? '<div class="hom">SEM VALOR FISCAL</div>' : '';
  const corpo = folhas.map((itens, k) => {
    const continua = k < total - 1 ? `<tr><td colspan="13" class="c" style="font-style:italic">… continua na folha ${k + 2}</td></tr>` : '';
    return `<div class="folha">${marca}${k === 0 ? primeira : cabecalho(k + 1)}<div class="t">Dados dos produtos / serviços</div>`
      + `<table>${TH_ITENS}<tbody>${itens.map(linhaDoItem).join('')}${continua}</tbody></table>${k === 0 ? adicionais : ''}</div>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>DANFE ${nf(n.numero)}</title><style>${CSS}</style></head><body>`
    + `<div class="barra"><span>DANFE gerado do XML · NF ${nf(n.numero)} · ${total} ${total === 1 ? 'folha' : 'folhas'}</span>`
    + '<button onclick="print()">Imprimir / salvar PDF</button></div>'
    + `${corpo}</body></html>`;
}
