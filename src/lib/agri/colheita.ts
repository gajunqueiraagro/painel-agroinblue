/**
 * A COLHEITA DE UMA ÁREA PLANTADA — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ SÓ O FÍSICO. Preço, classe de aflatoxina e venda NÃO moram aqui: são da operação
 * comercial de venda de grão, frente própria. O que esta camada sabe é quanto saiu do talhão,
 * quanto voltou seco e quando.
 * ⚠ DOIS PESOS, E ELES CHEGAM EM DIAS DIFERENTES. O verde é o que embarcou na fazenda e se
 * sabe na hora; o seco é o que a cooperativa devolve depois de secar e classificar, romaneio
 * por romaneio. Por isso o seco é opcional e se preenche reabrindo a linha — e por isso a
 * quebra e a produtividade só existem quando ele chega.
 * ⚠ SÓ REGRA PURA AQUI: nada de React nem de Supabase.
 */
import { parseNumericValue } from '@/lib/calculos/abate';

/**
 * A UNIDADE DE CADA CULTURA — e ela muda o que a tela pergunta.
 *
 * ⚠ AMENDOIM EM SACAS DE 25 kg, decisão do Gabriel (11/09/2026). Mandioca NÃO tem saca: é
 * raiz, e se mede em tonelada.
 * ⚠ SOJA, MILHO, CANA E "OUTRAS" FICAM SEM SACA ATÉ ALGUÉM DECIDIR, de propósito. A saca de
 * 60 kg é convenção de mercado para soja e milho, mas convenção não é decisão: escrevê-la
 * aqui faria o sistema afirmar um peso que ninguém confirmou, e produtividade errada só
 * aparece no fechamento da safra. Sem saca, a tela mostra kg e diz que a saca não se aplica —
 * que é a ausência honesta.
 */
export interface UnidadeCultura {
  /** Quilos por saca. `null` quando a cultura não se mede em sacas. */
  kgPorSaca: number | null;
  /** A unidade em que o total se lê: 'sacas' ou 't'. */
  unidadeTotal: 'sacas' | 't';
  /** Como a produtividade se escreve: "sc/ha" ou "t/ha". */
  unidadeProdutividade: string;
}

const UNIDADES: Record<string, UnidadeCultura> = {
  amendoim: { kgPorSaca: 25, unidadeTotal: 'sacas', unidadeProdutividade: 'sc/ha' },
  mandioca: { kgPorSaca: null, unidadeTotal: 't', unidadeProdutividade: 't/ha' },
};

const PADRAO: UnidadeCultura = { kgPorSaca: null, unidadeTotal: 't', unidadeProdutividade: 't/ha' };

export function unidadeDaCultura(cultura: string | null | undefined): UnidadeCultura {
  return UNIDADES[(cultura || '').trim()] ?? PADRAO;
}

/** Quantas sacas há em N quilos, ou `null` quando a cultura não se mede assim. */
export function sacasDoPeso(pesoKg: number, cultura: string | null | undefined): number | null {
  const { kgPorSaca } = unidadeDaCultura(cultura);
  if (!kgPorSaca || !(pesoKg > 0)) return null;
  /* Duas casas: o romaneio fecha em saca inteira, mas a soma de vários não precisa mentir
     arredondando cada um. */
  return Math.round((pesoKg / kgPorSaca) * 100) / 100;
}

/** Uma entrega, como a tela a edita — tudo texto, porque campo é texto. */
export interface RomaneioForm {
  id: string | null;
  dataColheita: string;
  pesoVerdeKg: string;
  sacas: string;
  pesoSecoKg: string;
  pesoRefugoKg: string;
  destino: string;
  romaneioRef: string;
  observacoes: string;
}

export interface RomaneioPayload {
  data_colheita: string;
  peso_bruto_kg: number | null;
  peso_liquido_kg: number | null;
  peso_refugo_kg: number | null;
  sacas: number | null;
  destino: string | null;
  romaneio_ref: string | null;
  observacoes: string | null;
}

export interface ValidacaoRomaneio {
  ok: boolean;
  erro?: string;
  payload?: RomaneioPayload;
}

export const DESTINOS = [
  { valor: 'armazem', label: 'Armazém' },
  { valor: 'venda', label: 'Venda' },
  { valor: 'consumo', label: 'Consumo' },
  { valor: 'outro', label: 'Outro' },
] as const;

/* `Set<string>` explícito: `DESTINOS` é `as const`, e sem a anotação o Set herdaria a união
   literal — `has(texto)` então não compilaria, que é justamente a pergunta a fazer. */
const DESTINOS_VALIDOS: ReadonlySet<string> = new Set<string>(DESTINOS.map(d => d.valor));

/**
 * ⚠ UM OBJETO SÓ, NÃO UNIÃO DISCRIMINADA — pelo mesmo motivo medido em `areaPlantada.ts`:
 * com `strict: false` o TypeScript não estreita a união pelo `if (!v.ok)`, e a união criaria
 * mais uma entrada de baseline.
 * ⚠ `parseNumericValue`, NUNCA `Number()`: "5.000" e "1.234,5" são o que o operador digita.
 */
export function validarRomaneio(form: RomaneioForm, cultura?: string | null): ValidacaoRomaneio {
  const data = (form.dataColheita || '').trim();
  if (!data) return { ok: false, erro: 'Informe a data da colheita.' };

  const verde = form.pesoVerdeKg.trim() ? parseNumericValue(form.pesoVerdeKg) : null;
  const seco = form.pesoSecoKg.trim() ? parseNumericValue(form.pesoSecoKg) : null;
  const refugo = form.pesoRefugoKg.trim() ? parseNumericValue(form.pesoRefugoKg) : null;
  const sacas = form.sacas.trim() ? parseNumericValue(form.sacas) : null;

  for (const [rotulo, v] of [['verde', verde], ['seco', seco], ['de roça', refugo], ['de sacas', sacas]] as const) {
    if (v != null && v < 0) return { ok: false, erro: `O peso ${rotulo} não pode ser negativo.` };
  }
  if (verde == null && seco == null) {
    return { ok: false, erro: 'Informe ao menos o peso verde embarcado.' };
  }
  /**
   * ⚠ SECO MAIOR QUE VERDE É ERRO DE DIGITAÇÃO, e vale recusar: secar TIRA água, nunca
   * acrescenta. Deixar passar produziria quebra negativa — um número que parece ganho de peso
   * e que ninguém saberia explicar três meses depois.
   */
  if (verde != null && seco != null && seco > verde) {
    return { ok: false, erro: 'O peso seco não pode ser maior que o verde embarcado.' };
  }
  const destino = (form.destino || '').trim();
  if (destino && !DESTINOS_VALIDOS.has(destino)) return { ok: false, erro: 'Destino fora da lista.' };

  /* Sacas em branco: deriva do verde quando a cultura tem saca. O operador pode sobrescrever —
     o romaneio às vezes já vem em sacas, e ali quem manda é o papel. */
  const sacasFinal = sacas != null ? sacas : (verde != null ? sacasDoPeso(verde, cultura) : null);

  return {
    ok: true,
    payload: {
      data_colheita: data,
      peso_bruto_kg: verde,
      peso_liquido_kg: seco,
      peso_refugo_kg: refugo,
      sacas: sacasFinal,
      destino: destino || null,
      romaneio_ref: form.romaneioRef.trim() || null,
      observacoes: form.observacoes.trim() || null,
    },
  };
}

/** O que o rodapé do bloco mostra. */
export interface TotaisColheita {
  verdeKg: number;
  secoKg: number;
  refugoKg: number;
  sacas: number | null;
  /** 1 − seco/verde, em pontos percentuais. `null` enquanto a cooperativa não devolveu o seco. */
  quebraPct: number | null;
  /** sacas/ha (ou t/ha). `null` sem seco ou sem área. */
  produtividade: number | null;
  /** Quantos romaneios ainda esperam o peso seco. */
  aguardandoSeco: number;
}

/**
 * OS TOTAIS DAS ENTREGAS.
 *
 * ⚠ A QUEBRA SÓ EXISTE SOBRE O QUE JÁ VOLTOU SECO, e a conta é feita romaneio a romaneio: usar
 * o verde TOTAL contra o seco PARCIAL daria uma quebra fantasiosa de 60% enquanto metade da
 * carga ainda está na cooperativa — e o operador leria isso como perda.
 * ⚠ A PRODUTIVIDADE SEGUE O MESMO CRITÉRIO: ela é do que já foi classificado. Enquanto não há
 * nenhum seco, ela não existe, e a tela diz "aguardando cooperativa" em vez de mostrar zero.
 */
export function totaisColheita(
  linhas: readonly RomaneioForm[],
  cultura: string | null | undefined,
  areaHa: number | null | undefined,
): TotaisColheita {
  let verdeKg = 0, secoKg = 0, refugoKg = 0, sacas = 0, verdeComSeco = 0, aguardandoSeco = 0;
  let temSaca = false;

  for (const l of linhas) {
    const v = parseNumericValue(l.pesoVerdeKg);
    const s = parseNumericValue(l.pesoSecoKg);
    const r = parseNumericValue(l.pesoRefugoKg);
    const sc = l.sacas.trim() ? parseNumericValue(l.sacas) : sacasDoPeso(v, cultura);
    verdeKg += v;
    secoKg += s;
    refugoKg += r;
    if (sc != null) { sacas += sc; temSaca = true; }
    if (s > 0) verdeComSeco += v; else if (v > 0) aguardandoSeco++;
  }

  const quebraPct = secoKg > 0 && verdeComSeco > 0
    ? Math.round((1 - secoKg / verdeComSeco) * 1000) / 10
    : null;

  const { kgPorSaca } = unidadeDaCultura(cultura);
  let produtividade: number | null = null;
  if (secoKg > 0 && areaHa && areaHa > 0) {
    /* ⚠ A PRODUTIVIDADE É DO SECO, não do embarcado: o verde carrega água, e comparar dois
       talhões pelo verde premia quem colheu mais úmido. */
    produtividade = kgPorSaca
      ? Math.round((secoKg / kgPorSaca / areaHa) * 100) / 100
      : Math.round((secoKg / 1000 / areaHa) * 100) / 100;
  }

  return {
    verdeKg, secoKg, refugoKg,
    sacas: temSaca ? Math.round(sacas * 100) / 100 : null,
    quebraPct, produtividade, aguardandoSeco,
  };
}
