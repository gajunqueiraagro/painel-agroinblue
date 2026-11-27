/**
 * PROD-FICHA-CADASTRO-01 (Gabriel 14/11 17:13; mock aprovado 17:45: ui-validar/reforma-2027/mock-ficha-cadastro-p1/p2) — a FICHA DE
 * CADASTRO que o cliente preenche à caneta: 2 folhas A4 por produtor.
 * ⚠ REGRAS DO GABRIEL: (1) NENHUM campo calculado — só vem escrito o que o cliente confere (nome, CPF, nascimento, IE, fazendas e
 *   participações, contas e contato já cadastrados); (2) tabelas com LINHAS EM BRANCO; (3) escolhas como caixinhas; (4) NADA corta: cada
 *   coluna tem largura fixa e a fonte da célula desce até 7 pt; o que ainda não couber fica em `naoCouberam` (o teste exige zero).
 * ⚠ CPF/CNPJ inteiro só o do PRÓPRIO produtor; o de outras pessoas sai mascarado (`documentoNaTabela`).
 * ⚠ UMA FONTE: a ficha do banco (`fn_fiscal_titulares_lista`, o `Titular`) e a composição das fazendas (`composicaoPorFazenda`).
 */
import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CellHookData, RowInput } from 'jspdf-autotable';
import { PALETA, addHeader, criarDocRetratoA4, yRealAposDesenho } from '@/lib/pdf/pdfChassi';
import { documentoNaTabela } from './documentoNaTabela';
import { composicaoPorFazenda, ROTULO_CONDICAO_IMOVEL, pct, type CondicaoImovel, type Titular } from './produtores';
import { RODAPE_DA_MARCA } from '@/lib/marca/marca';

/* ── 1. o CONTEÚDO (puro, testável): o que vem escrito e quantas linhas em branco ─────────────────────────────────────────── */
export interface Caixinhas { opcoes: readonly string[]; marcada: number | null }
export type Celula = string | Caixinhas;
export interface TabelaDaFicha { titulo: string; colunas: readonly string[]; larguras: readonly number[]; linhas: Celula[][]; nota?: string }
export interface FichaDeCadastro {
  produtor: string; cliente: string; emitidaEm: string; devolverAte: string;
  quemE: { nome: string; documento: string; nascimento: string; tipo: Caixinhas };
  fazendas: TabelaDaFicha; partes: TabelaDaFicha; contratos: TabelaDaFicha;
  endereco: { endereco: string; municipio: string; uf: string; cep: string; email: string };
  contas: TabelaDaFicha;
}

const SITUACAO = ['própria', 'arrendada', 'parceria', 'comodato'] as const;
const SITUACAO_DA_CONDICAO: Record<CondicaoImovel, number> = { proprietario: 0, condomino: 0, arrendatario: 1, parceiro: 2, comodatario: 3 };
const SIM_NAO = ['sim', 'não'] as const;
const vazio = (n: number): string[] => Array.from({ length: n }, () => '');
const dataBR = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const somaDias = (iso: string, d: number): string => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
/** linhas em branco até completar `total` (e pelo menos `minimo` em branco) */
const completar = (linhas: Celula[][], colunas: number, total: number, minimo: number, branco: () => Celula[] = () => vazio(colunas)): Celula[][] =>
  [...linhas, ...Array.from({ length: Math.max(minimo, total - linhas.length) }, branco)];

export function fichaDoProdutor(t: Titular, todos: readonly Titular[], cliente: string, hoje: string): FichaDeCadastro {
  const composicao = composicaoPorFazenda(todos);
  const docDe = new Map(todos.map(x => [x.id, x]));
  const ieDa = (fazendaId: string) => t.ies.find(i => i.fazenda_id === fazendaId)?.ie ?? '';
  const brancoSituacao = (): Celula[] => [...vazio(4), { opcoes: SITUACAO, marcada: null }];
  const brancoConta = (): Celula[] => [...vazio(4), { opcoes: SIM_NAO, marcada: null }];

  const fazendas = completar(t.fazendas.map(f => [f.fazenda, ieDa(f.fazenda_id), '', '', { opcoes: SITUACAO, marcada: SITUACAO_DA_CONDICAO[f.condicao] }]), 5, 6, 2, brancoSituacao);
  const partes = completar(t.fazendas.flatMap(f => (composicao.get(f.fazenda_id) ?? []).map(p => {
    const pessoa = docDe.get(p.titular_id);
    const doc = !pessoa ? '' : pessoa.id === t.id ? pessoa.documento_formatado : documentoNaTabela(pessoa.documento);
    return [f.fazenda, p.nome, doc, pct(p.participacao), ROTULO_CONDICAO_IMOVEL[p.condicao].toLowerCase()];
  })), 5, 11, 6);
  const contratos = completar(t.fazendas.filter(f => f.condicao === 'arrendatario' || f.condicao === 'parceiro' || f.condicao === 'comodatario')
    .map(f => [f.fazenda, '', '', '', '']), 5, 6, 5);
  const contas = completar(t.contas.map(c => [c.conta, '', '', '', { opcoes: SIM_NAO, marcada: null }]), 5, 5, 2, brancoConta);

  return {
    produtor: t.nome, cliente, emitidaEm: dataBR(hoje), devolverAte: dataBR(somaDias(hoje, 14)),
    quemE: { nome: t.nome, documento: t.documento_formatado, nascimento: dataBR(t.nascimento),
      tipo: { opcoes: ['Pessoa física', 'Empresa (PJ)', 'Integrado'], marcada: t.tipo === 'PF' ? 0 : 1 } },
    fazendas: { titulo: '2 · Fazendas', colunas: ['Fazenda', 'Inscrição estadual', 'Município · UF', 'NIRF / CAR', 'Situação da terra'],
      larguras: [46, 24, 30, 22, 68], linhas: fazendas },
    partes: { titulo: '3 · Quem tem parte em cada fazenda', colunas: ['Fazenda', 'Nome da pessoa ou empresa', 'CPF ou CNPJ', 'Parte (%)', 'Papel'],
      larguras: [40, 58, 36, 20, 36], linhas: partes, nota: 'Inclua sócios, cônjuge, parceiros e empresas. A soma de cada fazenda deve dar 100%.' },
    contratos: { titulo: '4 · Contratos de arrendamento ou parceria', colunas: ['Fazenda', 'Arrendador ou parceiro', 'CPF ou CNPJ', 'Vigência', 'Pagamento'],
      larguras: [40, 52, 34, 30, 34], linhas: contratos, nota: 'Pagamento: em dinheiro ou em produto (arrobas, sacas). Anexe a cópia do contrato.' },
    endereco: { endereco: t.endereco ?? '', municipio: t.municipio ?? '', uf: t.uf ?? '', cep: t.cep ? `${t.cep.slice(0, 5)}-${t.cep.slice(5)}` : '', email: t.email_fiscal ?? '' },
    contas: { titulo: '6 · Contas bancárias usadas na atividade rural', colunas: ['Banco', 'Agência', 'Conta', 'Titular da conta', 'Conta do produtor?'],
      larguras: [52, 24, 32, 52, 30], linhas: contas },
  };
}

/** "Todos os pendentes do cliente": produtor ativo com pendência no banco. */
export const pendentesDoCliente = (titulares: readonly Titular[]): Titular[] =>
  titulares.filter(t => t.papel === 'produtor' && t.ativo && t.pendencias.length > 0);

/* ── 2. o DESENHO (A4 retrato, chassi da casa) ────────────────────────────────────────────────────────────────────────────── */
const M = 10; const W = 190; const PISO_FONTE = 7; const FONTE = 9; const PAD = 1.2;
const AMARELO: [number, number, number] = [255, 247, 214];
const ehCaixinhas = (c: Celula): c is Caixinhas => typeof c !== 'string';

function caixinhas(doc: jsPDF, c: Caixinhas, x: number, y: number, fonte = FONTE): number {
  doc.setFontSize(fonte); doc.setTextColor(...PALETA.PRETO);
  let cx = x;
  c.opcoes.forEach((o, i) => {
    doc.setDrawColor(...PALETA.CINZA_MEDIO); doc.setLineWidth(0.2); doc.rect(cx, y - 2.6, 3, 3);
    if (c.marcada === i) { doc.setLineWidth(0.5); doc.line(cx + 0.5, y - 1.1, cx + 1.3, y - 0.1); doc.line(cx + 1.3, y - 0.1, cx + 2.6, y - 2.2); }
    doc.text(o, cx + 4, y);
    cx += 4 + doc.getTextWidth(o) + 3.5;
  });
  return cx - x;
}
const largCaixinhas = (doc: jsPDF, c: Caixinhas, fonte: number): number => {
  doc.setFontSize(fonte); return c.opcoes.reduce((s, o) => s + 4 + doc.getTextWidth(o) + 3.5, 0) - 3.5;
};

function titulo(doc: jsPDF, texto: string, y: number): number {
  doc.setFillColor(...PALETA.AZUL_PRIMARIO); doc.rect(M, y, W, 5.5, 'F');
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PALETA.BRANCO); doc.text(texto, M + 2, y + 3.9);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...PALETA.PRETO);
  return y + 7;
}
/** um campo de formulário: rótulo miúdo + caixa (amarela se vazia = "preencha") */
function campo(doc: jsPDF, rotulo: string, valor: string, x: number, y: number, w: number, naoCouberam: string[]): void {
  doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_MEDIO); doc.text(rotulo, x, y);
  if (!valor) { doc.setFillColor(...AMARELO); doc.rect(x, y + 0.8, w, 6, 'F'); }
  doc.setDrawColor(...PALETA.LINHA_SEPARADORA); doc.setLineWidth(0.2); doc.rect(x, y + 0.8, w, 6);
  if (valor) {
    let f = FONTE; doc.setFontSize(f);
    while (f > PISO_FONTE && doc.getTextWidth(valor) > w - 2 * PAD) { f -= 0.5; doc.setFontSize(f); }
    if (doc.getTextWidth(valor) > w - 2 * PAD) naoCouberam.push(`${rotulo}: ${valor}`);
    doc.setTextColor(...PALETA.PRETO); doc.text(valor, x + PAD, y + 5.2);
  }
}

function tabela(doc: jsPDF, t: TabelaDaFicha, y: number, naoCouberam: string[]): number {
  y = titulo(doc, t.titulo, y);
  const body: RowInput[] = t.linhas.map(l => l.map(c => (ehCaixinhas(c) ? '' : c)));
  autoTable(doc, {
    startY: y, head: [t.colunas.slice()], body, theme: 'grid', margin: { left: M, right: M },
    styles: { fontSize: FONTE, cellPadding: PAD, minCellHeight: 6.4, overflow: 'linebreak', valign: 'middle', lineColor: PALETA.LINHA_SEPARADORA, lineWidth: 0.2, textColor: PALETA.PRETO },
    headStyles: { fillColor: PALETA.ZEBRA_CLARA, textColor: PALETA.CINZA_TEXTO, fontStyle: 'normal', fontSize: 7.5 },
    columnStyles: Object.fromEntries(t.larguras.map((w, i) => [i, { cellWidth: w }])),
    didParseCell: (h: CellHookData) => {
      if (h.section !== 'body') return;
      const c = t.linhas[h.row.index]?.[h.column.index];
      const texto = typeof c === 'string' ? c : '';
      if (texto === '' && !(c && ehCaixinhas(c))) h.cell.styles.fillColor = AMARELO;
      const w = t.larguras[h.column.index] - 2 * PAD;
      let f = FONTE; doc.setFontSize(f);
      /* caixinhas: uma linha só; texto: a fonte desce até o piso e, no papel, pode ir a 2 linhas (quebrar não corta); mais que isso = não coube */
      const linhasDe = () => (c && ehCaixinhas(c) ? (largCaixinhas(doc, c, f) > w ? 99 : 1) : doc.splitTextToSize(texto, w).length);
      while (f > PISO_FONTE && linhasDe() > 1) { f -= 0.5; doc.setFontSize(f); }
      if (linhasDe() > (c && ehCaixinhas(c) ? 1 : 2)) naoCouberam.push(`${t.titulo} · ${t.colunas[h.column.index]}: ${texto || (c && ehCaixinhas(c) ? c.opcoes.join(' ') : '')}`);
      h.cell.styles.fontSize = f;
    },
    didDrawCell: (h: CellHookData) => {
      if (h.section !== 'body') return;
      const c = t.linhas[h.row.index]?.[h.column.index];
      if (c && ehCaixinhas(c)) caixinhas(doc, c, h.cell.x + PAD, h.cell.y + h.cell.height / 2 + 1.1, Number(h.cell.styles.fontSize) || FONTE);
    },
  });
  const fim = yRealAposDesenho(doc, y);
  if (t.nota) { doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_MEDIO); doc.text(t.nota, M, fim + 3.5); doc.setTextColor(...PALETA.PRETO); return fim + 6; }
  return fim + 3;
}

function cabecalho(doc: jsPDF, f: FichaDeCadastro, pagina: number, logo?: string): number {
  const y = addHeader(doc, { titulo: 'Ficha de cadastro do produtor', subtitulo: f.produtor,
    infoLinha: `${f.cliente} · emitida em ${f.emitidaEm} · devolver até ${f.devolverAte} · página ${pagina} de 2`, logoData: logo });
  if (pagina !== 1) return y;
  doc.setFontSize(8); doc.setTextColor(...PALETA.CINZA_TEXTO);
  doc.text('Texto já escrito: confira e corrija se preciso.', M, y);
  doc.setFillColor(...AMARELO); doc.rect(M + 68, y - 2.6, 4, 3, 'F'); doc.text('Fundo amarelo: preencha.', M + 73.5, y);
  doc.text('Faltou espaço? Use o verso.', M + 112, y);
  doc.setTextColor(...PALETA.PRETO);
  return y + 4;
}
function rodapes(doc: jsPDF): void {
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setDrawColor(...PALETA.LINHA_SEPARADORA); doc.setLineWidth(0.1); doc.line(M, 285, M + W, 285);
    doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_RODAPE);
    doc.text(RODAPE_DA_MARCA, M, 289);
    doc.text('Dados tratados conforme a LGPD · uso exclusivo do cadastro fiscal', M + W, 289, { align: 'right' });
  }
  doc.setTextColor(...PALETA.PRETO);
}

export interface PdfDaFicha { doc: jsPDF; naoCouberam: string[]; folhas: number }

/** As fichas num PDF só (2 folhas por produtor). `logo` = o dataURL do chassi (sem ele, o cabeçalho sai sem a logo). */
export function pdfDasFichas(fichas: readonly FichaDeCadastro[], logo?: string): PdfDaFicha {
  const doc = criarDocRetratoA4(); const nao: string[] = [];
  fichas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    /* folha 1: quem é · fazendas · partes · contratos */
    let y = cabecalho(doc, f, 1, logo);
    y = titulo(doc, '1 · Quem é o produtor', y);
    campo(doc, 'Nome completo', f.quemE.nome, M, y + 2.5, 92, nao);
    campo(doc, 'CPF ou CNPJ', f.quemE.documento, M + 95, y + 2.5, 45, nao);
    campo(doc, 'Nascimento', f.quemE.nascimento, M + 143, y + 2.5, 47, nao);
    doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_MEDIO); doc.text('Tipo', M, y + 14);
    caixinhas(doc, f.quemE.tipo, M, y + 18.5, 8.5);
    campo(doc, 'Telefone para assuntos fiscais', '', M + 95, y + 14, 95, nao);
    y = tabela(doc, f.fazendas, y + 25, nao);
    y = tabela(doc, f.partes, y, nao);
    tabela(doc, f.contratos, y, nao);
    /* folha 2: contador e endereço · contas · certificado · notas e reforma · observações e assinatura */
    doc.addPage();
    y = cabecalho(doc, f, 2, logo);
    y = titulo(doc, '5 · Contador e endereço fiscal', y);
    campo(doc, 'Contador ou escritório', '', M, y + 2.5, 92, nao);
    campo(doc, 'CRC', '', M + 95, y + 2.5, 40, nao);
    campo(doc, 'Telefone', '', M + 138, y + 2.5, 52, nao);
    campo(doc, 'E-mail do contador', f.endereco.email, M, y + 13, 92, nao);
    campo(doc, 'Endereço fiscal do produtor', f.endereco.endereco, M + 95, y + 13, 95, nao);
    campo(doc, 'Município', f.endereco.municipio, M, y + 23.5, 92, nao);
    campo(doc, 'UF', f.endereco.uf, M + 95, y + 23.5, 20, nao);
    campo(doc, 'CEP', f.endereco.cep, M + 118, y + 23.5, 30, nao);
    y = tabela(doc, f.contas, y + 34, nao);
    y = titulo(doc, '7 · Certificado digital do produtor', y);
    caixinhas(doc, { opcoes: ['e-CPF A1 (arquivo)', 'e-CPF A3 (token ou cartão)', 'e-CNPJ', 'não tem'], marcada: null }, M, y + 3.5, 8.5);
    campo(doc, 'Validade', '', M, y + 7.5, 40, nao);
    campo(doc, 'Quem guarda o certificado (nome e telefone)', '', M + 43, y + 7.5, 147, nao);
    doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_MEDIO);
    doc.text('Para a busca automática de notas, só o e-CPF A1 serve. Envie pelo sistema; arquivo e senha nunca juntos.', M, y + 18.5);
    y = titulo(doc, '8 · Notas fiscais e reforma tributária 2027 (responda com o contador)', y + 21.5);
    const pergunta = (texto: string, c: Caixinhas, yy: number) => {
      doc.setFontSize(8.5); doc.setTextColor(...PALETA.PRETO); doc.text(texto, M, yy); caixinhas(doc, c, M + 78, yy, 8.5);
    };
    pergunta('Como emite a nota de venda hoje', { opcoes: ['app da Sefaz', 'sistema próprio', 'contador emite'], marcada: null }, y + 3.5);
    pergunta('Regime em 2027', { opcoes: ['contribuinte (regime regular)', 'não contribuinte', 'a decidir'], marcada: null }, y + 9.5);
    pergunta('Tem empresa rural (CNPJ) além do CPF?', { opcoes: ['não', 'sim, CNPJ: ____________________'], marcada: null }, y + 15.5);
    pergunta('Vende para cooperativa ou integradora?', { opcoes: ['não', 'sim, qual: ____________________'], marcada: null }, y + 21.5);
    y = titulo(doc, '9 · Observações', y + 25);
    doc.setFillColor(...AMARELO); doc.rect(M, y, W, 26, 'F'); doc.setDrawColor(...PALETA.LINHA_SEPARADORA); doc.rect(M, y, W, 26);
    y += 40;
    doc.setDrawColor(...PALETA.PRETO); doc.setLineWidth(0.2);
    doc.line(M, y, M + 78, y); doc.line(M + 86, y, M + 158, y); doc.line(M + 164, y, M + W, y);
    doc.setFontSize(7.5); doc.setTextColor(...PALETA.CINZA_TEXTO);
    doc.text('Assinatura do produtor', M, y + 3.5); doc.text('Quem preencheu (nome)', M + 86, y + 3.5); doc.text('Data', M + 164, y + 3.5);
    doc.setTextColor(...PALETA.PRETO);
  });
  rodapes(doc);
  return { doc, naoCouberam: nao, folhas: doc.getNumberOfPages() };
}

/** Monta e baixa o PDF (o gesto da tela). Devolve o que não coube (vazio = tudo inteiro no papel). */
export function baixarFichas(fichas: readonly FichaDeCadastro[], arquivo: string, logo?: string): string[] {
  const r = pdfDasFichas(fichas, logo);
  r.doc.save(arquivo);
  return r.naoCouberam;
}
