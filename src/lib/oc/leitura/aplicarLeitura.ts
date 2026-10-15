/* OC-DOC-ESPECIE-ABATE-01 passo 4 — O QUE A LEITURA DO PDF PREENCHE NO FORMULARIO.
   ⚠ SO' CAMPO VAZIO, e so' campo que a especie DESENHA (regra 6): o que o operador ja' digitou — ou o que o documento ja' tem, na
     edicao — fica. E' SUGESTAO: quem grava e' o Registrar / Salvar, pelo payload de sempre.
   ⚠ `dados` informativos (documento, instrucao, carga, ordem de compra do romaneio) entram no `dados` lido, so' na chave vazia,
     e nao contam como campo preenchido (nao aparecem na grade). */
import { camposDaEspecie, type ChaveCampo } from '@/lib/oc/camposDaEspecie';
import type { FormAbate } from '@/lib/oc/formDocumentoAbate';
import type { CamposLidos } from '@/lib/oc/leitura/layoutsAbate';

type ChaveTexto = 'numero' | 'serie' | 'chaveAcesso' | 'dataEmissao' | 'dataAbate' | 'vencimento' | 'ordemCompra' | 'loteFrigorifico' | 'op';
type ChaveNumero = 'cab' | 'pesoKg' | 'precoArroba' | 'bruto' | 'funrural' | 'senar' | 'seguro' | 'rat' | 'liquido';
const TEXTOS: ChaveTexto[] = ['numero', 'serie', 'chaveAcesso', 'dataEmissao', 'dataAbate', 'vencimento', 'ordemCompra', 'loteFrigorifico', 'op'];
const NUMEROS: ChaveNumero[] = ['cab', 'pesoKg', 'precoArroba', 'bruto', 'funrural', 'senar', 'seguro', 'rat', 'liquido'];

export function aplicarLeitura(
  form: FormAbate, campos: CamposLidos, dados: Record<string, unknown>,
  formatarNumero: (n: string) => string = n => n,
): { form: FormAbate; preenchidos: ChaveCampo[] } {
  const desenha = new Set((camposDaEspecie('abate', form.especie) ?? []).flat().map(c => c.chave));
  const f: FormAbate = { ...form, dadosLidos: { ...form.dadosLidos } };
  const preenchidos: ChaveCampo[] = [];
  for (const k of TEXTOS) {
    const v = campos[k];
    if (!desenha.has(k) || v == null || v === '' || f[k].trim() !== '') continue;
    f[k] = k === 'numero' ? formatarNumero(v) : v;
    preenchidos.push(k);
  }
  for (const k of NUMEROS) {
    const v = campos[k];
    if (!desenha.has(k) || v == null || f[k] != null) continue;
    f[k] = v;
    preenchidos.push(k);
  }
  if (desenha.has('nfsProdutor') && campos.nfsProdutor?.length && f.nfsProdutor.length === 0) {
    f.nfsProdutor = campos.nfsProdutor;
    preenchidos.push('nfsProdutor');
  }
  /* Passo 7e: os incentivos lidos (NF e acerto) entram so' com a lista VAZIA; na NF eles nao tem campo na grade (vao como componente). */
  const comIncentivo = form.especie === 'nf_principal' || form.especie === 'nf_complementar' || form.especie === 'acerto';
  if (comIncentivo && campos.incentivos?.length && f.incentivos.length === 0) {
    f.incentivos = campos.incentivos;
    if (desenha.has('incentivo')) preenchidos.push('incentivo');
  }
  for (const [k, v] of Object.entries(dados)) {
    const atual = f.dadosLidos[k];
    if (v != null && v !== '' && (atual == null || atual === '')) f.dadosLidos[k] = v;
  }
  return { form: f, preenchidos };
}

export const fraseDaLeitura = (rotulo: string, n: number): string =>
  n === 0 ? `lido do PDF (${rotulo}): nenhum campo vazio a preencher` : `lido do PDF (${rotulo}): ${n} campo${n === 1 ? '' : 's'} · confira antes de salvar`;
