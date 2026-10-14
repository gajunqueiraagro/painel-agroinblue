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
  bruto: number | null; funrural: number | null; senar: number | null; seguro: number | null;
  liquido: number | null; valor: number | null; nfRefValor: number | null;
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
    cab: null, pesoKg: null, precoArroba: null, bruto: null, funrural: null, senar: null, seguro: null,
    liquido: null, valor: null, nfRefValor: null, loteIds: [], preservados: [], dadosLidos: {},
  };
}

/* Que componente vira qual campo, por especie. So' o PRIMEIRO de cada (tipo, natureza). */
type Mapa = { campo: 'bruto' | 'funrural' | 'senar' | 'seguro' | 'retAcerto' | 'valor'; tipo: string; natureza: NaturezaComp }[];
export const TIPO_RETENCAO_ACERTO = 'retencao_acerto';
export const DESCRICAO_RETENCAO_ACERTO = 'Retenções do acerto';
function mapaDaEspecie(e: EspecieDoc): Mapa {
  switch (e) {
    case 'nf_principal': case 'nf_complementar': return [
      { campo: 'bruto', tipo: 'valor_bruto', natureza: 'acrescimo' },
      { campo: 'funrural', tipo: 'funrural', natureza: 'retencao_sem_caixa' },
      { campo: 'senar', tipo: 'senar', natureza: 'retencao_sem_caixa' },
      { campo: 'seguro', tipo: 'seguro', natureza: 'retencao_sem_caixa' },
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
    bruto, funrural: valores.funrural ?? null, senar: valores.senar ?? null, seguro: valores.seguro ?? null,
    valor: valores.valor ?? null,
    /* No acerto o operador digita o LIQUIDO; ao abrir, ele e' o bruto menos a retencao gravada. */
    liquido: d.especie === 'acerto' && bruto != null ? Math.round((bruto - (retAcerto ?? 0)) * 100) / 100 : null,
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
  if (f.especie === 'acerto' && f.bruto != null && f.liquido != null && f.liquido > f.bruto)
    falta.push({ chave: 'liquido', rotulo: 'Líquido maior que o bruto' });
  return falta;
}

/** O valor bruto de um campo digitavel (para pendencia e para o desenho). */
export function valorDoCampo(f: FormAbate, chave: ChaveCampo): string | number | null {
  switch (chave) {
    case 'numero': case 'serie': case 'chaveAcesso': case 'dataEmissao': case 'observacao':
    case 'dataAbate': case 'vencimento': case 'ordemCompra': case 'loteFrigorifico': case 'op': case 'nfRefNumero':
      return f[chave];
    case 'cab': case 'pesoKg': case 'precoArroba': case 'bruto': case 'funrural': case 'senar': case 'seguro':
    case 'liquido': case 'valor': case 'nfRefValor':
      return f[chave];
    default: return null;
  }
}

const temCampo = (e: EspecieDoc, chave: ChaveCampo) => (camposDaEspecie('abate', e) ?? []).flat().some(c => c.chave === chave);
const ouNada = (s: string) => (vazio(s) ? undefined : s.trim());

export function payloadDoFormAbate(f: FormAbate): DocumentoPayload {
  const e = f.especie;
  const tem = (k: ChaveCampo) => temCampo(e, k);
  const comps: Omit<ComponentePayload, 'ordem'>[] = [];
  const pos = (v: number | null) => v != null && v > 0;
  if (tem('bruto') && pos(f.bruto)) comps.push({ tipo: 'valor_bruto', natureza: 'acrescimo', valor: f.bruto! });
  if (tem('funrural') && pos(f.funrural)) comps.push({ tipo: 'funrural', natureza: 'retencao_sem_caixa', valor: f.funrural! });
  if (tem('senar') && pos(f.senar)) comps.push({ tipo: 'senar', natureza: 'retencao_sem_caixa', valor: f.senar! });
  if (tem('seguro') && pos(f.seguro)) comps.push({ tipo: 'seguro', natureza: 'retencao_sem_caixa', valor: f.seguro! });
  if (e === 'acerto') {
    const ret = retencoesDoAcerto(f.bruto, f.liquido);
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
