/* OC-DOC-ESPECIE-ABATE-01 passo 2 — o FORMULARIO DO ABATE <-> o documento. Puro: nenhuma tela monta payload por conta propria.
   ⚠ O QUE A ESPECIE NAO MOSTRA, PRESERVA. O `oc_documento_editar` grava numero, serie, chave, emissao, emitente e observacao
     sempre que a chave vem no payload — entao o formulario guarda TODOS os campos do documento e manda o que leu para os que a
     especie nao desenha (o acerto do backfill tem numero "Acerto OC …" e nao tem campo Numero). As colunas do abate (cab, peso,
     abate, vencimento) so' vao quando a especie as desenha; ausentes, o banco mantem.
   ⚠ COMPONENTE QUE A ESPECIE NAO REPRESENTA, PRESERVA: so' o PRIMEIRO de cada tipo que a especie mapeia vira campo; o resto
     (bonificacao, desconto, "outros"…) volta no payload como veio. Assim editar uma NF com bonificacao nao a apaga.
   ⚠ `dados` SUBSTITUI O OBJETO no banco: o formulario parte do `dados` lido e so' troca as chaves da especie. */
import type { ComponentePayload, DocumentoDetalhe, DocumentoPayload, EspecieDoc, NaturezaComp } from '@/hooks/useOperacaoDocumentos';
import { camposDaEspecie, retencoesDoAcerto, type ChaveCampo } from '@/lib/oc/camposDaEspecie';

/** Uma NF do produtor referida pela NF do frigorifico (`dados.nfs_produtor`). A JBS cita duas, sem valor. */
export interface NfProdutor { numero: string; data: string | null; valor: number | null }
/** Passo 7e: um credito do documento (componente tipo 'incentivo', natureza acrescimo), um por linha do PDF. */
export interface Incentivo { descricao: string; valor: number }
export const TIPO_INCENTIVO = 'incentivo';
export const DESCRICAO_INCENTIVO = 'Incentivo';
/** Soma dos incentivos (2 casas). */
export const totalDosIncentivos = (l: Incentivo[]): number => Math.round(l.reduce((s, i) => s + i.valor, 0) * 100) / 100;
/** Passo 7e — o lote com que o documento NOVO nasce (regra do Gabriel, 15/10): NF, Acerto e NPR sao da OPERACAO (todos os lotes);
 *  o Romaneio e' POR LOTE (nenhum, e o lote e' obrigatorio); o resto, como hoje (nenhum). A edicao nunca passa por aqui. */
export function lotesPadraoDaEspecie(especie: EspecieDoc, lotes: { loteId: string }[]): string[] {
  return especie === 'nf_principal' || especie === 'nf_complementar' || especie === 'acerto' || especie === 'npr' ? lotes.map(l => l.loteId) : [];
}
/** Passo 7e: o Romaneio lido sugere o lote quando EXATAMENTE um lote da OC tem a mesma quantidade de cabecas; senao, nenhum. */
export function loteSugeridoPelaQuantidade(lotes: { loteId: string; qtd?: number | null }[], cab: number | null | undefined): string | null {
  if (cab == null) return null;
  const iguais = lotes.filter(l => l.qtd != null && l.qtd === cab);
  return iguais.length === 1 ? iguais[0].loteId : null;
}
export const FRASE_LOTE_SUGERIDO = 'lote sugerido pela quantidade · confira';

/** Os valores digitaveis. Numero = number | null (vazio e' ausencia, nao zero); texto = string. */
export interface FormAbate {
  documentoId: string | null;
  versao: number;
  especie: EspecieDoc;
  url: string;
  documentoOrigemId: string | null;
  numero: string; serie: string; chaveAcesso: string; dataEmissao: string; observacao: string;
  emitenteId: string; emitenteNome: string; emitenteDocumento: string;
  dataAbate: string; vencimento: string;
  ordemCompra: string; loteFrigorifico: string; op: string; nfRefNumero: string;
  cab: number | null; pesoKg: number | null; precoArroba: number | null;
  bruto: number | null; funrural: number | null; senar: number | null; seguro: number | null; rat: number | null;
  liquido: number | null; valor: number | null; nfRefValor: number | null;
  /** NF e Acerto: os incentivos (todos os componentes tipo 'incentivo'). */
  incentivos: Incentivo[];
  /** So' na NF: as NFs do produtor (a NPR segue com `nfRefNumero`/`nfRefValor`, em `dados.nf_referida`). */
  nfsProdutor: NfProdutor[];
  loteIds: string[];
  /** Componentes que a especie nao representa — voltam como vieram. */
  preservados: ComponentePayload[];
  /** O `dados` lido, para preservar chaves que esta tela nao conhece. */
  dadosLidos: Record<string, unknown>;
}

export function formAbateVazio(especie: EspecieDoc = 'nf_principal'): FormAbate {
  return {
    documentoId: null, versao: 0, especie, url: '', documentoOrigemId: null,
    numero: '', serie: '', chaveAcesso: '', dataEmissao: '', observacao: '',
    emitenteId: '', emitenteNome: '', emitenteDocumento: '',
    dataAbate: '', vencimento: '', ordemCompra: '', loteFrigorifico: '', op: '', nfRefNumero: '',
    cab: null, pesoKg: null, precoArroba: null, bruto: null, funrural: null, senar: null, seguro: null, rat: null,
    liquido: null, valor: null, nfRefValor: null, incentivos: [], nfsProdutor: [], loteIds: [], preservados: [], dadosLidos: {},
  };
}

/* Que componente vira qual campo, por especie. So' o PRIMEIRO de cada (tipo, natureza). */
type Mapa = { campo: 'bruto' | 'funrural' | 'senar' | 'seguro' | 'rat' | 'retAcerto' | 'valor'; tipo: string; natureza: NaturezaComp }[];
export const TIPO_RETENCAO_ACERTO = 'retencao_acerto';
export const DESCRICAO_RETENCAO_ACERTO = 'Retenções do acerto';
function mapaDaEspecie(e: EspecieDoc): Mapa {
  switch (e) {
    case 'nf_principal': case 'nf_complementar': return [
      { campo: 'bruto', tipo: 'valor_bruto', natureza: 'acrescimo' },
      { campo: 'funrural', tipo: 'funrural', natureza: 'retencao_sem_caixa' },
      { campo: 'senar', tipo: 'senar', natureza: 'retencao_sem_caixa' },
      { campo: 'seguro', tipo: 'seguro', natureza: 'retencao_sem_caixa' },
      { campo: 'rat', tipo: 'rat', natureza: 'retencao_sem_caixa' },
    ];
    case 'acerto': return [
      { campo: 'bruto', tipo: 'valor_bruto', natureza: 'acrescimo' },
      { campo: 'retAcerto', tipo: TIPO_RETENCAO_ACERTO, natureza: 'retencao_sem_caixa' },
    ];
    case 'romaneio': return [];
    default: return [{ campo: 'valor', tipo: 'valor_bruto', natureza: 'acrescimo' }];
  }
}

/** Le um objeto JSON sem cast; o que nao e' objeto vira {}. */
const objeto = (v: unknown): Record<string, unknown> =>
  (v != null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {});
const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Le `dados.nfs_produtor` sem cast; o que nao e' lista de objetos com numero vira []. */
export function nfsProdutorDe(v: unknown): NfProdutor[] {
  if (!Array.isArray(v)) return [];
  return v.map(objeto).filter(o => txt(o.numero).trim() !== '' || num(o.valor) != null)
    .map(o => ({ numero: txt(o.numero).trim(), data: txt(o.data) || null, valor: num(o.valor) }));
}
/** Os numeros como a grade os mostra ("9444845 · 9444790"). */
export const textoDasNfsProdutor = (l: NfProdutor[]): string => l.map(n => n.numero).filter(Boolean).join(' · ');
/** Soma dos valores INFORMADOS; nulo quando nenhuma tem valor (vazio nunca vira zero). */
export function valorDasNfsProdutor(l: NfProdutor[]): number | null {
  const com = l.filter(n => n.valor != null);
  return com.length === 0 ? null : Math.round(com.reduce((s, n) => s + (n.valor ?? 0), 0) * 100) / 100;
}
/** Edicao: numeros separados por virgula (ou " · "); o que ja' existia com o mesmo numero guarda data e valor. */
export function nfsProdutorDoTexto(texto: string, atuais: NfProdutor[]): NfProdutor[] {
  const nums = texto.split(/[,;·]+/).map(t => t.trim()).filter(Boolean);
  return nums.map(n => atuais.find(a => a.numero === n) ?? { numero: n, data: null, valor: null });
}

export function formAbateDoDetalhe(d: DocumentoDetalhe): FormAbate {
  const f = formAbateVazio(d.especie);
  const dados = objeto(d.dados);
  const ref = objeto(dados.nf_referida);
  const mapa = mapaDaEspecie(d.especie);
  const usados = new Set<number>();
  let retAcerto: number | null = null;
  const valores: Partial<Record<Mapa[number]['campo'], number>> = {};
  for (const m of mapa) {
    const i = d.componentes.findIndex((c, j) => !usados.has(j) && c.tipo === m.tipo && c.natureza === m.natureza);
    if (i < 0) continue;
    usados.add(i);
    valores[m.campo] = Number(d.componentes[i].valor);
  }
  if (valores.retAcerto != null) retAcerto = valores.retAcerto;
  /* Passo 7e: TODOS os incentivos da NF e do acerto viram a lista (nao so' o primeiro). */
  const incentivos: Incentivo[] = [];
  if (d.especie === 'nf_principal' || d.especie === 'nf_complementar' || d.especie === 'acerto')
    d.componentes.forEach((c, j) => {
      if (usados.has(j) || c.tipo !== TIPO_INCENTIVO || c.natureza !== 'acrescimo') return;
      usados.add(j); incentivos.push({ descricao: c.descricao ?? DESCRICAO_INCENTIVO, valor: Number(c.valor) });
    });
  const preservados = d.componentes.filter((_, j) => !usados.has(j));
  const bruto = valores.bruto ?? null;
  return {
    ...f,
    documentoId: d.documentoId, versao: d.versao, url: d.url, documentoOrigemId: d.documentoOrigemId,
    numero: d.numero, serie: d.serie, chaveAcesso: d.chaveAcesso, dataEmissao: d.dataEmissao, observacao: d.observacao,
    emitenteId: d.emitenteId ?? '', emitenteNome: d.emitenteNome, emitenteDocumento: d.emitenteDocumento,
    dataAbate: d.dataAbate ?? '', vencimento: d.vencimento ?? '',
    ordemCompra: txt(dados.ordem_compra), loteFrigorifico: txt(dados.lote_frigorifico), op: txt(dados.op),
    nfRefNumero: txt(ref.numero), nfRefValor: num(ref.valor), precoArroba: num(dados.preco_arroba),
    cab: d.cab ?? null, pesoKg: d.pesoKg ?? null,
    bruto, funrural: valores.funrural ?? null, senar: valores.senar ?? null, seguro: valores.seguro ?? null, rat: valores.rat ?? null,
    nfsProdutor: nfsProdutorDe(dados.nfs_produtor),
    valor: valores.valor ?? null, incentivos,
    /* No acerto o operador digita o LIQUIDO; ao abrir, ele e' o bruto + incentivo menos a retencao gravada. */
    liquido: d.especie === 'acerto' && bruto != null ? Math.round((bruto + totalDosIncentivos(incentivos) - (retAcerto ?? 0)) * 100) / 100 : null,
    loteIds: d.loteIds, preservados, dadosLidos: dados,
  };
}

const vazio = (s: string) => s.trim() === '';

/** Os campos obrigatorios que faltam, pelos rotulos da grade. */
export function pendenciasDoFormAbate(f: FormAbate, contraparteId: string | null): { chave: ChaveCampo; rotulo: string }[] {
  const linhas = camposDaEspecie('abate', f.especie) ?? [];
  const falta: { chave: ChaveCampo; rotulo: string }[] = [];
  for (const campo of linhas.flat()) {
    if (!campo.obrigatorio) continue;
    const v = valorDoCampo(f, campo.chave);
    const ausente = campo.chave === 'emitente' ? !(f.emitenteId || contraparteId) : v == null || (typeof v === 'string' && vazio(v));
    if (ausente) falta.push({ chave: campo.chave, rotulo: campo.rotulo });
  }
  if (f.especie === 'acerto' && f.bruto != null && f.liquido != null && f.liquido > f.bruto + totalDosIncentivos(f.incentivos))
    falta.push({ chave: 'liquido', rotulo: 'Líquido maior que o bruto + incentivo' });
  return falta;
}

/** O valor bruto de um campo digitavel (para pendencia e para o desenho). */
export function valorDoCampo(f: FormAbate, chave: ChaveCampo): string | number | null {
  switch (chave) {
    case 'numero': case 'serie': case 'chaveAcesso': case 'dataEmissao': case 'observacao':
    case 'dataAbate': case 'vencimento': case 'ordemCompra': case 'loteFrigorifico': case 'op': case 'nfRefNumero':
      return f[chave];
    case 'cab': case 'pesoKg': case 'precoArroba': case 'bruto': case 'funrural': case 'senar': case 'seguro': case 'rat':
    case 'liquido': case 'valor': case 'nfRefValor':
      return f[chave];
    case 'nfsProdutor': return textoDasNfsProdutor(f.nfsProdutor);
    case 'incentivo': return f.incentivos.length ? totalDosIncentivos(f.incentivos) : null;
    case 'lote': return f.loteIds.length ? f.loteIds.join(',') : null;
    case 'nfsProdutorValor': return valorDasNfsProdutor(f.nfsProdutor);
    default: return null;
  }
}

const temCampo = (e: EspecieDoc, chave: ChaveCampo) => (camposDaEspecie('abate', e) ?? []).flat().some(c => c.chave === chave);
const ouNada = (s: string) => (vazio(s) ? undefined : s.trim());

export function payloadDoFormAbate(f: FormAbate): DocumentoPayload {
  const e = f.especie;
  const tem = (k: ChaveCampo) => temCampo(e, k);
  const comps: Omit<ComponentePayload, 'ordem'>[] = [];
  /* R$ 0 DIGITADO E' DADO (passo 3, regra das sentinelas): vira componente de valor 0 — so' o campo vazio fica sem componente, e
     e' isso que a conferencia le como "sem valor". */
  const pos = (v: number | null) => v != null && v >= 0;
  if (tem('bruto') && pos(f.bruto)) comps.push({ tipo: 'valor_bruto', natureza: 'acrescimo', valor: f.bruto! });
  if (tem('funrural') && pos(f.funrural)) comps.push({ tipo: 'funrural', natureza: 'retencao_sem_caixa', valor: f.funrural! });
  if (tem('senar') && pos(f.senar)) comps.push({ tipo: 'senar', natureza: 'retencao_sem_caixa', valor: f.senar! });
  if (tem('seguro') && pos(f.seguro)) comps.push({ tipo: 'seguro', natureza: 'retencao_sem_caixa', valor: f.seguro! });
  if (tem('rat') && pos(f.rat)) comps.push({ tipo: 'rat', natureza: 'retencao_sem_caixa', valor: f.rat! });
  /* Passo 7e: os incentivos da NF e do acerto, um componente por linha (acrescimo). */
  if (e === 'nf_principal' || e === 'nf_complementar' || e === 'acerto')
    for (const i of f.incentivos) if (pos(i.valor)) comps.push({ tipo: TIPO_INCENTIVO, natureza: 'acrescimo', valor: i.valor, descricao: i.descricao || DESCRICAO_INCENTIVO });
  if (e === 'acerto') {
    const ret = retencoesDoAcerto(f.bruto, f.liquido, totalDosIncentivos(f.incentivos));
    if (pos(ret)) comps.push({ tipo: TIPO_RETENCAO_ACERTO, natureza: 'retencao_sem_caixa', valor: ret!, descricao: DESCRICAO_RETENCAO_ACERTO });
  }
  if (tem('valor') && pos(f.valor)) comps.push({ tipo: 'valor_bruto', natureza: 'acrescimo', valor: f.valor! });
  const componentes: ComponentePayload[] = [...comps, ...f.preservados.map(({ ordem: _o, ...c }) => c)]
    .map((c, i) => ({ ...c, ordem: i + 1 }));

  /* `dados`: o lido, com as chaves da especie trocadas; vazio sai. */
  const dados: Record<string, unknown> = { ...f.dadosLidos };
  const poe = (k: string, v: unknown) => { if (v == null || (typeof v === 'string' && vazio(v))) delete dados[k]; else dados[k] = v; };
  if (tem('ordemCompra')) poe('ordem_compra', f.ordemCompra.trim());
  if (tem('loteFrigorifico')) poe('lote_frigorifico', f.loteFrigorifico.trim());
  if (tem('op')) poe('op', f.op.trim());
  if (tem('precoArroba')) poe('preco_arroba', f.precoArroba);
  if (tem('nfRefNumero')) {
    const ref: Record<string, unknown> = {};
    if (!vazio(f.nfRefNumero)) ref.numero = f.nfRefNumero.trim();
    if (tem('nfRefValor') && f.nfRefValor != null) ref.valor = f.nfRefValor;
    poe('nf_referida', Object.keys(ref).length ? ref : null);
  }
  if (tem('nfsProdutor')) {
    const l = f.nfsProdutor.filter(n => n.numero.trim() !== '' || n.valor != null)
      .map(n => ({ numero: n.numero.trim(), data: n.data || null, valor: n.valor }));
    poe('nfs_produtor', l.length ? l : null);
  }

  const novo = f.documentoId == null;
  const doCabecalho = (k: ChaveCampo, v: string) => (novo && !tem(k) ? undefined : ouNada(v));
  const comEmitente = !novo || tem('emitente');
  return {
    especie: e,
    /* Cabecalho: na EDICAO vai sempre com o que o formulario tem (o editar grava por presenca, e o que a especie nao desenha
       volta como foi lido); no documento NOVO, so' o que a especie desenha (o que se digitou noutra especie nao vai junto). */
    numero: doCabecalho('numero', f.numero), serie: doCabecalho('serie', f.serie), chaveAcesso: doCabecalho('chaveAcesso', f.chaveAcesso),
    dataEmissao: doCabecalho('dataEmissao', f.dataEmissao), observacao: doCabecalho('observacao', f.observacao), url: ouNada(f.url),
    documentoOrigemId: e === 'nf_complementar' ? f.documentoOrigemId : null,
    emitenteId: comEmitente ? (f.emitenteId || null) : null,
    emitenteNome: comEmitente && f.emitenteId ? (f.emitenteNome || null) : null,
    emitenteDocumento: comEmitente && f.emitenteId ? (f.emitenteDocumento || null) : null,
    componentes,
    lotes: f.loteIds,
    /* As colunas do abate so' quando a especie as desenha; ausentes, o banco mantem o gravado. */
    ...(tem('cab') ? { cab: f.cab == null ? null : Math.round(f.cab) } : {}),
    ...(tem('pesoKg') ? { pesoKg: f.pesoKg } : {}),
    ...(tem('dataAbate') ? { dataAbate: f.dataAbate || null } : {}),
    ...(tem('vencimento') ? { vencimento: f.vencimento || null } : {}),
    dados,
  };
}
