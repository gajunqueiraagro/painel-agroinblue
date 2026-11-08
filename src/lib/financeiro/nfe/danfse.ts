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
 * NOTA-NFSE-LEITURA-02 (Gabriel 08/11, NF 402): le^ tambem a inscricao municipal do prestador, o quadro do ISSQN (base, aliquota, apurado,
 *   retido) e o da REFORMA (IBS/CBS) — este nas MESMAS chaves do grupo `IBSCBS` da NF-e (`ibsCbsDoDanfse`), para gravar no mesmo lugar.
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

/** "2,45%" / "0,10 % / 0,00 %" -> as aliquotas com ponto ("2.45", "0.10"), na ordem; o "-" (sem valor) nao entra. */
export function aliquotasDoTexto(s: string | null | undefined): string[] {
  return Array.from((s ?? '').matchAll(/(\d+(?:,\d+)?)\s*%/g), (m) => m[1].replace(',', '.'));
}
/** centavos -> "2828.95" (como no XML). */
const decimalDoXml = (cent: number) => (cent / 100).toFixed(2);

/**
 * NOTA-NFSE-LEITURA-02 — o quadro "TRIBUTAÇÃO IBS/CBS" do DANFSe nas chaves do `IBSCBS` da NF-e. `null` quando o quadro nao existe
 * (DANFSe antigo) ou nao traz nada.
 */
export function ibsCbsDoDanfse(v: {
  cstClass: string | null; base: string | null; aliqIbs: string | null; ibsUf: string | null; ibsMun: string | null; ibsTotal: string | null;
  aliqCbs: string | null; cbs: string | null;
}): Record<string, string> | null {
  const o: Record<string, string> = {};
  const [cst, cClass] = (v.cstClass ?? '').split('/').map((x) => x.trim()).filter((x) => x && x !== '-');
  if (cst) o.CST = cst;
  if (cClass) o.cClassTrib = cClass;
  const c = (t: string | null) => { const n = t == null || t.trim() === '-' ? null : centavosBr(t); return n == null ? null : decimalDoXml(n); };
  const [pUf, pMun] = aliquotasDoTexto(v.aliqIbs);
  const [pCbs] = aliquotasDoTexto(v.aliqCbs);
  const poe = (k: string, x: string | null | undefined) => { if (x != null) o[k] = x; };
  poe('vBC', c(v.base)); poe('pIBSUF', pUf); poe('vIBSUF', c(v.ibsUf)); poe('pIBSMun', pMun); poe('vIBSMun', c(v.ibsMun));
  poe('vIBS', c(v.ibsTotal)); poe('pCBS', pCbs); poe('vCBS', c(v.cbs));
  return Object.keys(o).length ? o : null;
}

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
  const itImPrest = d.campo('INSCRICAO MUNICIPAL', noPrest);
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
  const linhasDoServico = linhasDescricao.map((l) => l.map((o) => o.str.trim()).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const descricao = linhasDoServico.join(' ');
  for (const l of linhasDescricao) for (const o of l) d.marcar('itens', o);

  /* AS RETENCOES (o ISS so' conta quando "Retencao do ISSQN" diz retido) */
  const issRetido = /^RETIDO/.test(normalizar(texto(d.campo('RETENCAO DO ISSQN')) ?? ''));
  const issApurado = cent(d.campo('ISSQN APURADO'));
  /* NOTA-NFSE-LEITURA-02 — o quadro do ISSQN inteiro (informacao; o lancamento segue o liquido impresso) */
  const issqn = { baseCent: cent(d.campo('BC ISSQN')), aliquota: aliquotasDoTexto(texto(d.campo('ALIQUOTA APLICADA')))[0] ?? null, apuradoCent: issApurado, retido: issRetido };
  /* NOTA-NFSE-LEITURA-02 — a REFORMA: o quadro "TRIBUTAÇÃO IBS/CBS", entre o titulo dele e o do valor total */
  const yIbs = y('TRIBUTACAO IBS/CBS');
  const noIbs = faixa(yIbs, yTotal);
  const ibsCbs = yIbs == null ? null : ibsCbsDoDanfse({
    cstClass: texto(d.campo('CST / CCLASSTRIB', noIbs)), base: texto(d.campo('BASE DE CALCULO APOS EXCLUSOES E REDUCOES', noIbs)),
    aliqIbs: texto(d.campo('ALIQUOTA - IBS UF / IBS MUN', noIbs)), ibsUf: texto(d.campo('VALOR APURADO ESTADUAL - IBS', noIbs)),
    ibsMun: texto(d.campo('VALOR APURADO MUNICIPAL - IBS', noIbs)), ibsTotal: texto(d.campo('VALOR TOTAL APURADO - IBS', noIbs)),
    aliqCbs: texto(d.campo('ALIQUOTA - CBS', noIbs)), cbs: texto(d.campo('VALOR TOTAL APURADO - CBS', noIbs)),
  });
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
      inscricaoMunicipal: texto(itImPrest),
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
      brutoCent, retencoes, totalRetidoCent: cent(itRetido), liquidoCent, issqn, ibsCbs, linhas: linhasDoServico,
    },
  };

  /* NFS-e nao tem duplicata nem protocolo da SEFAZ (o "sem protocolo" da NF-e nao vale aqui) */
  const avisos: AvisoNFe[] = ['sem_duplicatas'];
  return {
    ok: true, nota, avisos, marcas: d.marcas, divergencias: conferirChaveNfse(nota),
    extras: { seguroCent: 0, outrasCent: 0, ipiCent: 0, stCent: 0, tributosAproxCent: null },
  };
}

/* ───────────────────────── NFSE-MUNICIPAL-01 — a NFS-e DA PREFEITURA (o layout municipal) ─────────────────────────
 * Gabriel 03/11: a NFS-e de SP (que traz o "Identificador Nacional", a chave de 50 — conferida pela `conferirChaveNfse`, caminho a) e a
 * municipal SEM chave nacional (Presidente Prudente: aceita, com o aviso `sem_chave` — "confira"). Os dois layouts sao da mesma familia:
 * titulo "NOTA FISCAL … SERVIÇOS … NFS-e", os quadros PRESTADOR / TOMADOR DE SERVIÇOS com "Rótulo:" e o valor AO LADO, o numero, a
 * emissao e o codigo de verificacao com o valor ABAIXO (como no DANFE), os valores numa linha so' ("VALOR LÍQUIDO DA NOTA FISCAL: R$ …",
 * "VALOR TOTAL DO SERVIÇO = R$ …"). O lancamento e' o LIQUIDO: o impresso; sem ele, o total so' quando nenhuma retencao foi impressa
 * (com retencao e sem liquido impresso: recusa — nunca calculado por adivinhacao).
 * A condicao de pagamento escrita na discriminacao ("COND.PAGTO.:28/56/84/112 DIAS") vira as parcelas a partir da emissao, com o aviso
 * `vencimentos_pelas_condicoes`; o que nao se le com seguranca nao vira parcela (1 parcela, o operador ajusta).
 */
export const FRASE_NFSE_SEM_PRESTADOR = 'NFS-e sem o CPF/CNPJ do prestador: nada foi lido.';
export const FRASE_NFSE_RETENCAO_SEM_LIQUIDO = 'NFS-e com retenções e sem o valor líquido impresso: nada foi lido. Lance pelo valor do boleto.';

/** E' a NFS-e de uma prefeitura? O titulo ("NOTA FISCAL" + "SERVIÇOS" + "NFS-e") E os quadros do prestador e do tomador. */
export function ehNfseMunicipal(paginas: readonly ItemDoDanfe[][]): boolean {
  const ns = paginas.flat().map((it) => normalizar(it.str));
  const titulo = ns.some((n) => n.includes('NOTA FISCAL') && n.includes('SERVICOS') && n.includes('NFS-E'));
  return titulo && ns.some((n) => n === 'PRESTADOR DE SERVICOS') && ns.some((n) => n.startsWith('TOMADOR DE SERVICOS'));
}

/** O primeiro valor em reais de um texto ("R$ 11.360,00", "9,99 (*)") -> centavos; `null` se nao tem. */
function centDoTexto(s: string | null | undefined): number | null {
  const m = /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?![\d,])/.exec(s ?? '');
  return m ? centavosBr(m[1]) : null;
}

/** Os dias da condicao de pagamento ("COND.PAGTO.:28/56/84/112 DIAS"): crescentes, ate' 12, ate' 400 dias. Senao `null`. */
export function diasDaCondicao(texto: string | null | undefined): number[] | null {
  const m = /COND\.?\s*(?:DE\s+)?PAG(?:TO|AMENTO)?\.?\s*:?\s*(\d{1,3}(?:\s*\/\s*\d{1,3})*)\s*DIAS?\b/.exec(normalizar(texto ?? ''));
  if (!m) return null;
  const dias = m[1].split('/').map((x) => Number(x.trim()));
  const ok = dias.length >= 1 && dias.length <= 12 && dias.every((d, i) => d > 0 && d <= 400 && (i === 0 || d > dias[i - 1]));
  return ok ? dias : null;
}

/** "AAAA-MM-DD" + dias (em UTC, sem fuso). */
function somarDias(iso: string, dias: number): string {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) + dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Le^ a NFS-e municipal. */
export function notaDaNfseMunicipal(paginas: readonly ItemDoDanfe[][]): ResultadoDoDanfe {
  const d = new Danfe(paginas);
  if (d.itens.length === 0) return { ok: false, motivo: 'pdf_sem_texto', frase: FRASE_PDF_SEM_TEXTO };
  const pg = d.itens.find((it) => normalizar(it.str) === 'PRESTADOR DE SERVICOS')?.pagina ?? 1;
  const naPg = d.itens.filter((it) => it.pagina === pg);
  if (naPg.some((it) => /\bNFS-E CANCELADA\b|^CANCELADA$|\bNOTA CANCELADA\b|\bSUBSTITUIDA\b/.test(normalizar(it.str)))) {
    return { ok: false, motivo: 'incompleta', frase: FRASE_NFSE_CANCELADA };
  }

  const yDe = (pred: (n: string) => boolean) => naPg.find((it) => pred(normalizar(it.str)))?.y ?? null;
  const yPrest = yDe((n) => n === 'PRESTADOR DE SERVICOS');
  const yTom = yDe((n) => n.startsWith('TOMADOR DE SERVICOS'));
  const yInter = yDe((n) => n.startsWith('INTERMEDIARIO DE SERVICOS'));
  /* o TITULO da discriminacao (o de cima: em PP o cabecalho da tabela de servicos, mais abaixo, tem o mesmo texto) */
  const yDisc = naPg.filter((it) => /^DISCRIMINACAO D[EO]S? SERVICOS$/.test(normalizar(it.str))).map((it) => it.y).sort((a, b) => b - a)[0] ?? null;
  const faixa = (de: number | null, ate: number | null) => ({ abaixoDe: de ?? undefined, acimaDe: ate ?? undefined });
  const noPrest = faixa(yPrest, yTom);
  const noTom = faixa(yTom, yInter ?? yDisc);

  /** "Rótulo: valor" — o valor no proprio item (depois do ":") ou no item AO LADO, o primeiro rotulo de cima na faixa. */
  const aoLadoDe = (rotulo: string, f: { abaixoDe?: number; acimaDe?: number }): { str: string; it: ItemNaPagina } | null => {
    const alvo = normalizar(rotulo);
    const rots = d.rotulos(rotulo, true).filter((r) => r.pagina === pg && (f.abaixoDe == null || r.y < f.abaixoDe) && (f.acimaDe == null || r.y > f.acimaDe))
      .sort((a, b) => b.y - a.y);
    for (const r of rots) {
      const resto = normalizar(r.str).slice(alvo.length).replace(/^\s*[:=]\s*/, '').trim();
      if (resto) { const bruto = r.str.slice(r.str.indexOf(':') + 1).trim(); return { str: bruto || resto, it: r }; }
      const v = d.aoLado(r);
      if (v && v.str.trim() && v.str.trim() !== '----') return { str: v.str.trim(), it: v };
    }
    return null;
  };
  const abaixo = (rotulo: string) => d.campo(rotulo, { abaixoDe: undefined }, true);

  const itNumero = abaixo('NUMERO DA NOTA');
  const itEmissao = abaixo('DATA E HORA DE EMISSAO');
  const itCodigo = abaixo('CODIGO DE VERIFICACAO');
  d.marcar('numero', itNumero);
  d.marcar('emissao', itEmissao);

  /* a chave nacional (SP): "Identificador Nacional: <50 digitos>" no proprio item ou ao lado */
  const idNac = aoLadoDe('IDENTIFICADOR NACIONAL', {});
  const chave = soDigitos(idNac?.str).length === 50 ? soDigitos(idNac?.str) : '';
  if (chave) d.marcar('chave', idNac?.it);

  const docPrest = aoLadoDe('CPF/CNPJ', noPrest);
  const nomePrest = aoLadoDe('NOME/RAZAO SOCIAL', noPrest);
  const imPrest = aoLadoDe('INSCRICAO MUNICIPAL', noPrest);
  const enderPrest = aoLadoDe('ENDERECO', noPrest) ?? aoLadoDe('LOGRADOURO', noPrest);
  const bairroPrest = aoLadoDe('BAIRRO', noPrest);
  const cepPrest = aoLadoDe('CEP', noPrest);
  const munPrest = aoLadoDe('MUNICIPIO', noPrest);
  const ufPrest = aoLadoDe('UF', noPrest);
  d.marcar('emitente_cnpj', docPrest?.it);
  d.marcar('emitente', nomePrest?.it);
  d.marcar('emitente_endereco', enderPrest?.it);
  d.marcar('emitente_cidade', munPrest?.it);

  const docTom = aoLadoDe('CPF/CNPJ', noTom);
  const nomeTom = aoLadoDe('NOME/RAZAO SOCIAL', noTom);
  const enderTom = aoLadoDe('ENDERECO', noTom) ?? aoLadoDe('LOGRADOURO', noTom);
  d.marcar('destinatario', nomeTom?.it);

  /* A DISCRIMINACAO: as linhas do titulo dela ate' a 1a linha de valor ("VALOR LIQUIDO…" / "VALOR TOTAL…") abaixo */
  const yValor = naPg.filter((it) => /^VALOR (LIQUIDO|TOTAL) D/.test(normalizar(it.str)) && (yDisc == null || it.y < yDisc)).map((it) => it.y)
    .sort((a, b) => b - a)[0] ?? null;
  const linhasDisc = yDisc != null ? d.linhasEntre(pg, yDisc - 1, (yValor ?? yDisc - 120) + 1) : [];
  const discriminacao = linhasDisc.map((l) => l.map((o) => o.str.trim()).join(' ')).join(' ').replace(/\s+/g, ' ').trim();
  for (const l of linhasDisc) for (const o of l) d.marcar('itens', o);

  /* OS VALORES: o liquido e o total impressos numa linha so' */
  const linhaDe = (re: RegExp) => naPg.find((it) => re.test(normalizar(it.str))) ?? null;
  const itLiquido = linhaDe(/^VALOR LIQUIDO DA (NOTA FISCAL|NFS-E)\b/);
  const itTotal = linhaDe(/^VALOR TOTAL D[AO] (NOTA FISCAL|SERVICO|NFS-E)\b/);
  d.marcar('valor_nota', itLiquido ?? itTotal);
  const totalCent = centDoTexto(itTotal?.str) ?? centDoTexto(itLiquido?.str);

  /* AS RETENCOES (os quadros com o valor abaixo; "-" ou vazio = 0) */
  const cent = (rotulo: string) => centDoTexto(abaixo(rotulo)?.str) ?? 0;
  const issRetido = /^RETIDO/.test(normalizar(abaixo('ISS RETIDO')?.str ?? ''));
  const issCent = cent('VALOR DO ISS');
  const retencoes = {
    issRetidoCent: issRetido ? (cent('VALOR ISS RETIDO') || issCent) : 0,
    irrfCent: cent('IRRF'),
    previdenciaCent: cent('INSS') || cent('CONTRIBUICAO PREVIDENCIARIA - RETIDA'),
    /* SP tem o quadro das RETIDAS (o PIS/COFINS ao lado sao destacados, nao retidos): com ele, so' ele; sem ele (PP), PIS + COFINS + CSLL */
    contribuicoesSociaisCent: d.rotulos('CONTRIBUICOES SOCIAIS - RETIDAS', true).some((r) => r.pagina === pg)
      ? cent('CONTRIBUICOES SOCIAIS - RETIDAS') : cent('PIS') + cent('COFINS') + cent('CSLL'),
  };
  const totalRetidoCent = retencoes.issRetidoCent + retencoes.irrfCent + retencoes.previdenciaCent + retencoes.contribuicoesSociaisCent;

  const numero = soDigitos(itNumero?.str);
  const emissao = dataIso(itEmissao?.str) ?? '';
  const documento = soDigitos(docPrest?.str);
  const nomeEmit = nomePrest?.str.trim() ?? '';
  if (!numero) return { ok: false, motivo: 'incompleta', frase: 'Nota sem número.' };
  if (!emissao) return { ok: false, motivo: 'incompleta', frase: 'Nota sem data de emissão.' };
  if (documento.length !== 11 && documento.length !== 14) return { ok: false, motivo: 'incompleta', frase: FRASE_NFSE_SEM_PRESTADOR };
  if (!nomeEmit) return { ok: false, motivo: 'incompleta', frase: 'Nota sem emitente.' };
  if (totalCent == null) return { ok: false, motivo: 'incompleta', frase: 'Nota sem valor total.' };
  const liquidoImpresso = centDoTexto(itLiquido?.str);
  if (liquidoImpresso == null && totalRetidoCent > 0) return { ok: false, motivo: 'incompleta', frase: FRASE_NFSE_RETENCAO_SEM_LIQUIDO };
  const liquidoCent = liquidoImpresso ?? totalCent;

  /* AS PARCELAS PELA CONDICAO (a partir da emissao; o centavo que sobra fica na 1a, como no boleto) */
  const dias = diasDaCondicao(discriminacao);
  const duplicatas = dias ? dias.map((dd, i) => {
    const base = Math.floor(liquidoCent / dias.length);
    return { numero: String(i + 1).padStart(3, '0'), vencimento: somarDias(emissao, dd), valorCent: i === 0 ? liquidoCent - base * (dias.length - 1) : base };
  }) : [];

  /* o item: a linha da tabela de servicos (PP: "SERVICO MECANICA") ou o codigo do servico (SP: "99999 - …"); o detalhe e' a discriminacao */
  const yTabela = naPg.find((it) => /^DISCRIMINACAO D[EO]S? SERVICOS$/.test(normalizar(it.str)) && yDisc != null && it.y < yDisc - 1)?.y ?? null;
  const linhaTabela = yTabela != null ? d.linhasEntre(pg, yTabela - 1, yTabela - 30)[0] ?? null : null;
  const doCodigo = abaixo('CODIGO DO SERVICO')?.str.replace(/^\s*\d+\s*-\s*/, '').trim() || null;
  const descricaoItem = linhaTabela?.filter((o) => /[A-Za-zÀ-ÿ]/.test(o.str) && !/R\$/.test(o.str)).map((o) => o.str.trim()).join(' ').trim()
    || doCodigo || discriminacao.slice(0, 120) || 'Serviço';

  const [logradouro = null, bairroDoEndereco = null] = (enderPrest?.str ?? '').split(/\s+-\s+/).map((s) => s.trim() || null);
  const cep = soDigitos(cepPrest?.str ?? /CEP:?\s*([\d.-]{8,10})/.exec(enderPrest?.str ?? '')?.[1]) || null;

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
      documento, nome: nomeEmit, fantasia: null, ie: null, inscricaoMunicipal: imPrest?.str.trim() || null,
      endereco: { logradouro: logradouro?.replace(/\s*-?\s*CEP:.*$/i, '') || null, numero: null, complemento: null,
        bairro: bairroPrest?.str.trim() || (bairroDoEndereco && !/^CEP/i.test(bairroDoEndereco) ? bairroDoEndereco : null),
        municipio: munPrest?.str.trim() || null, uf: ufPrest?.str.trim() || null, cep, telefone: null },
    },
    destinatario: { documento: soDigitos(docTom?.str) || null, nome: nomeTom?.str.trim() || null, ie: null, endereco: enderTom?.str.trim() || null },
    totais: { produtosCent: totalCent, freteCent: 0, descontoCent: 0, notaCent: liquidoCent },
    fatura: null,
    duplicatas,
    somaDuplicatasCent: duplicatas.reduce((s, x) => s + x.valorCent, 0),
    pagamentos: [],
    itens: [{ descricao: descricaoItem, quantidade: '1', unidade: '', valorCent: totalCent, unitarioCent: totalCent, detalhe: discriminacao || null, fiscal: { codigo: null } }],
    protocolo: null,
    informacoesComplementares: imPrest ? `Inscrição municipal do prestador: ${imPrest.str.trim()}` : null,
    cfops: [],
    servico: {
      competencia: emissao, codigoTributacao: null, nbs: null, brutoCent: totalCent, retencoes, totalRetidoCent, liquidoCent,
      codigoVerificacao: itCodigo?.str.trim() || null, issCent, condicoesPagamento: dias,
    },
  };

  const avisos: AvisoNFe[] = [];
  if (!duplicatas.length) avisos.push('sem_duplicatas');
  else avisos.push('vencimentos_pelas_condicoes');
  if (!chave) avisos.push('sem_chave');
  return {
    ok: true, nota, avisos, marcas: d.marcas, divergencias: chave ? conferirChaveNfse(nota) : [],
    extras: { seguroCent: 0, outrasCent: 0, ipiCent: 0, stCent: 0, tributosAproxCent: null },
  };
}
