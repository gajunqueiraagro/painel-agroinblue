/**
 * NOTA-JA-LANCADA-01 — a nota ja' lancada (PURO). O banco (`fn_nota_ja_lancada`) devolve os lancamentos do cliente que batem com a
 * nota (valor e data de uma parcela nos cadastros parecidos com o emitente; o numero; a chave); aqui cada parcela da nota fica com o
 * MAIS PROXIMO (menos centavos de diferenca, depois menos dias), cada lancamento uma vez so'. O que sobra pelo valor conta como
 * "parecidos a mais" (outra compra igual?); o que bateu so' pelo numero ou pela chave entra junto (e' a mesma nota).
 */
import { reais } from '@/lib/financeiro/nfe/formatos';

export interface LancamentoJaLancado {
  id: string;
  vencimento: string | null;
  pagamento: string | null;
  competencia: string | null;
  descricao: string | null;
  valorCent: number;
  status: string | null;
  conciliado: boolean;
  financiamentoId: string | null;
  /** P128b-N1 — a conta do achado (a parcela que falta nasce com a das irmãs quando todas têm a mesma) */
  contaBancariaId?: string | null;
  /** P167 — o documento DESTA nota que o achado já tem (pela chave ou pelo emitente + nº): o anexar LIGA este, nunca registra outro */
  notaDocumentoId?: string | null;
  numeroDocumento: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  /** como o cadastro dele se parece com o emitente: 'cnpj' (mesma raiz), 'nome' (sem CNPJ, nome parecido), 'mesclado' */
  fornecedorPor: string | null;
  parcelas: { n: number; difCent: number; difDias: number }[];
  /** P95 — 'fracao': a IRMA de uma achada pelo numero/chave ("… - 3/6": mesmo fornecedor, mesmo N, valor ≈ nota/N).
   *  P128a — 'documento': o numero num documento anexado; 'soma': o parcelamento do emitente que soma EXATAMENTE a nota; 'parcelamento':
   *  so' por ser irmao (do mesmo parcelamento) de um achado — a parcela que SOBRA no sistema aparece */
  por: PorDoAchado[];
  /** P128a — o numero da parcela no parcelamento (`financiamento_parcelas`); `null` no solto */
  parcelaN?: number | null;
  /** P128a — o documento com ESTA chave ja' esta' nele; e quantos documentos vivos ele tem ("Documento hoje") */
  temEstaNota?: boolean;
  documentos?: number;
  /** P95 — o N da fracao "k/N" da descricao, quando o banco a conferiu (valor ≈ nota/N); `null` sem ela */
  fracaoN?: number | null;
  /** NOTA-CONTAS-NA-CRIACAO-01 D — cancelado: aparece cinza, no fim, e NUNCA conta como "ja' lancada" nem recebe o "Anexar" */
  cancelado: boolean;
}

export type PorDoAchado = 'valor' | 'numero' | 'chave' | 'fracao' | 'documento' | 'soma' | 'parcelamento' | 'lancamento';
const PORES: readonly PorDoAchado[] = ['valor', 'numero', 'chave', 'fracao', 'documento', 'soma', 'parcelamento', 'lancamento'];

export interface ParcelaDaNotaParaCasar { n: number; vencimento: string; valorCent: number }

export interface NotaJaLancada {
  /** uma linha por parcela da nota: o lancamento que a cobre, ou `null` (falta) */
  porParcela: { parcela: ParcelaDaNotaParaCasar; lancamento: LancamentoJaLancado | null }[];
  /** os que bateram so' pelo numero ou pela chave (sem parcela) */
  pelaNota: LancamentoJaLancado[];
  /** os que tambem bateram pelo valor e ficaram sem parcela (outra compra parecida?) */
  outrosParecidos: number;
  /** todos os lancamentos que recebem a nota no "Anexar" */
  alvos: LancamentoJaLancado[];
  faltam: ParcelaDaNotaParaCasar[];
  /** NOTA-CONTAS-NA-CRIACAO-01 C — dos achados so' pelo numero/chave, os que sao uma FRACAO da nota (valor x N = a nota): id -> N */
  fracoes: ReadonlyMap<string, number>;
  /** a nota de uma parcela so' achada EM PARCELAS (a linha "falta" da nota inteira some, e nada se oferece criar) */
  emParcelas: boolean;
  /** D — os CANCELADOS desta nota (pelo numero ou pela chave): so' para mostrar, no fim da lista */
  cancelados: LancamentoJaLancado[];
  /** P167 — os achados de OUTRA compra (outro parcelamento do mesmo fornecedor): aparecem na frase, nunca recebem a nota */
  outraCompra: LancamentoJaLancado[];
  /** P167 — duas compras com a MESMA evidência (nenhuma âncora, nem nº, chave, documento ou parcela que as separe): nada se grava */
  compraAmbigua: boolean;
  /** NOTA-PAGA-A-VISTA-01 — a nota de 2+ duplicatas paga À VISTA: o achado (do fornecedor da busca) com o valor da NOTA INTEIRA (± 5 centavos).
   *  Ele não casa parcela nenhuma e recebe a nota; as duplicatas ficam como informação ("já paga no lançamento acima"). Dois = nenhum. */
  aVista: LancamentoJaLancado | null;
}

/**
 * P167 (NOTA-COMPRA-ERRADA-01, Gabriel 28/10) — UMA COMPRA SÓ. A nota se liga a UM parcelamento (mais as soltas, como na Alta Paulista); um
 * parcelamento de OUTRA compra do mesmo fornecedor — mesma descrição, mesma soma: NJ, NF 119.237 × 118.480 — nunca é alvo. Com dois ou mais
 * parcelamentos entre os achados: vale o da ÂNCORA (a parcela aberta, 'lancamento'); sem ela, o de mais evidência FORTE (nº, chave,
 * documento: 3 cada; cada parcela casada pelo valor e data: 1). Empate = ambígua (`grupo` nulo): nenhum parcelamento é alvo.
 */
export function compraDaNota(achados: readonly LancamentoJaLancado[]): { grupo: string | null; ambigua: boolean } {
  const fins = [...new Set(achados.flatMap((l) => (l.financiamentoId ? [l.financiamentoId] : [])))];
  if (fins.length <= 1) return { grupo: fins[0] ?? null, ambigua: false };
  const ancora = achados.find((l) => l.financiamentoId && l.por.includes('lancamento'));
  if (ancora?.financiamentoId) return { grupo: ancora.financiamentoId, ambigua: false };
  const forca = (l: LancamentoJaLancado) => l.por.filter((x) => x === 'numero' || x === 'chave' || x === 'documento').length * 3 + l.parcelas.length;
  const placar = fins.map((f) => ({ f, pontos: achados.filter((l) => l.financiamentoId === f).reduce((s, l) => s + forca(l), 0) }))
    .sort((a, b) => b.pontos - a.pontos);
  if (placar[0].pontos === placar[1].pontos) return { grupo: null, ambigua: true };
  return { grupo: placar[0].f, ambigua: false };
}

/**
 * NOTA-CONTAS-NA-CRIACAO-01 C (P75) — o lancamento e' uma PARCELA da nota quando o valor x N bate com ela (1 centavo de folga por parcela,
 * o arredondamento de quem dividiu): 821,22 x 4 = 3.284,88. Devolve o menor N (2 a 72), ou `null`. Qual das N, a nota nao diz — a tela
 * mostra "parcela ? de N".
 */
/** P128b-N1 (Gabriel 28/10 16:04) — a conta das irmãs para a parcela que FALTA: a conta quando TODAS as vivas têm a mesma; divergem ou
 *  alguma está sem conta = `null` (a prévia pede a conta no "Falta:"). */
export function contaUnicaDasIrmas(alvos: readonly LancamentoJaLancado[]): string | null {
  const vivas = alvos.filter((l) => !l.cancelado);
  const contas = new Set(vivas.map((l) => l.contaBancariaId ?? null));
  if (vivas.length === 0 || contas.size !== 1 || contas.has(null)) return null;
  return vivas[0].contaBancariaId ?? null;
}

export function fracaoDaNota(valorCent: number, notaCent: number): number | null {
  if (!(valorCent > 0) || !(notaCent > valorCent)) return null;
  for (let n = 2; n <= 72; n++) if (Math.abs(valorCent * n - notaCent) <= n) return n;
  return null;
}

/* ── Caso 3 (Gabriel 29/10 11:33, a M2 Tratores NF 14.222): a nota À VISTA no CARTÃO em N ─────────────────────────────────────────────────
   N = nota ÷ parcela (o da fração), nunca o número achado. A POSIÇÃO de cada achada no cartão tem duas leituras: (a) pela DESCRIÇÃO ("Parcela K",
   "Parc.K"; as sem número pela sequência mensal a partir das numeradas) e (b) pela ORDEM das faturas (a 1ª achada = 1). Concordam = segue;
   discordam (ou a descrição não diz) = a TELA PERGUNTA, nada se grava antes. As que faltam nascem no vencimento da fatura (o mesmo dia, mês a mês). PURO. */
/** "Parcela 8 - None" -> 8; "Manutencao Maquinas - Parc.7" -> 7; o "k/N" do fim NÃO conta (é o que o sistema pôs). */
export function posicaoDaDescricao(descricao: string | null | undefined): number | null {
  const m = /\bparc(?:ela)?\.?\s*(\d{1,2})\b(?!\s*\/)/i.exec(descricao ?? '');
  return m ? Number(m[1]) : null;
}
const mesesEntre = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7));
/** a data `iso` andando `m` meses, no mesmo dia (o fim do mês quando o dia não existe) */
export function maisMeses(iso: string, m: number): string {
  const ano = Number(iso.slice(0, 4)); const mes = Number(iso.slice(5, 7)) - 1 + m; const dia = Number(iso.slice(8, 10));
  const a = ano + Math.floor(mes / 12); const mm = ((mes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(a, mm + 1, 0)).getUTCDate();
  return `${a}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}
export interface PosicoesNoCartao {
  n: number;
  /** pela descrição: ≥ 2 numeradas numa sequência mensal sem buraco (as sem número pelo mês); `null` = a descrição não diz com segurança */
  pelaDescricao: ReadonlyMap<string, number> | null;
  /** pela ordem das faturas: a 1ª achada = 1, as outras pelo mês */
  pelaOrdem: ReadonlyMap<string, number> | null;
  /** as duas leituras dão o MESMO (sem pergunta) */
  concordam: boolean;
}
export function posicoesNoCartao(achadas: readonly Pick<LancamentoJaLancado, 'id' | 'vencimento' | 'descricao'>[], n: number): PosicoesNoCartao {
  const comData = [...achadas].filter((l): l is typeof l & { vencimento: string } => !!l.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const valida = (m: Map<string, number>) => m.size === comData.length && new Set(m.values()).size === m.size && [...m.values()].every((k) => k >= 1 && k <= n);
  let pelaOrdem: Map<string, number> | null = null;
  if (comData.length && comData.length === achadas.length) {
    const m = new Map(comData.map((l) => [l.id, 1 + mesesEntre(comData[0].vencimento, l.vencimento)] as const));
    pelaOrdem = valida(m) ? m : null;
  }
  let pelaDescricao: Map<string, number> | null = null;
  /* o "k/N" do fim com o N da NOTA (o P95: "… - 3/6") também diz a posição; o de outro N (o "1/3" que um completar pôs) não */
  const daFracao = (d: string | null) => { const f = fracaoDaDescricao(d); return f && f.n === n ? f.k : null; };
  const numeradas = comData.flatMap((l) => { const k = posicaoDaDescricao(l.descricao) ?? daFracao(l.descricao); return k ? [{ l, k }] : []; });
  if (numeradas.length >= 2 && comData.length === achadas.length) {
    const [ancora] = numeradas;
    const coerente = numeradas.every(({ l, k }) => k - ancora.k === mesesEntre(ancora.l.vencimento, l.vencimento));
    if (coerente) {
      const m = new Map(comData.map((l) => [l.id, ancora.k + mesesEntre(ancora.l.vencimento, l.vencimento)] as const));
      pelaDescricao = valida(m) ? m : null;
    }
  }
  const iguais = !!pelaDescricao && !!pelaOrdem && [...pelaDescricao].every(([id, k]) => pelaOrdem?.get(id) === k);
  return { n, pelaDescricao, pelaOrdem, concordam: iguais };
}
/** As posições da nota que faltam no sistema, no vencimento da fatura (a achada mais próxima é a âncora) e no valor da parcela. Com o valor da
 *  nota, a ÚLTIMA que falta leva os centavos que sobram: as N fecham a nota exata (a soma nunca passa da nota — o B2). */
export function parcelasQueFaltamNoCartao(achadas: readonly Pick<LancamentoJaLancado, 'id' | 'vencimento' | 'valorCent'>[], posicoes: ReadonlyMap<string, number>, n: number,
  valorCent: number, notaCent?: number): ParcelaDaNotaParaCasar[] {
  const ancoras = achadas.flatMap((l) => { const k = posicoes.get(l.id); return l.vencimento && k ? [{ v: l.vencimento, k }] : []; });
  if (!ancoras.length) return [];
  const ocupadas = new Set(posicoes.values());
  const faltam: ParcelaDaNotaParaCasar[] = [];
  for (let k = 1; k <= n; k++) {
    if (ocupadas.has(k)) continue;
    const a = [...ancoras].sort((x, y) => Math.abs(x.k - k) - Math.abs(y.k - k))[0];
    faltam.push({ n: k, vencimento: maisMeses(a.v, k - a.k), valorCent });
  }
  if (notaCent !== undefined && faltam.length) {
    const resto = notaCent - achadas.reduce((t, l) => t + l.valorCent, 0) - valorCent * (faltam.length - 1);
    if (resto > 0) faltam[faltam.length - 1] = { ...faltam[faltam.length - 1], valorCent: resto };
  }
  return faltam;
}

export function casarJaLancados(parcelas: readonly ParcelaDaNotaParaCasar[], todos: readonly LancamentoJaLancado[], notaCent = 0): NotaJaLancada | null {
  /* D — o cancelado nunca casa parcela, nunca e' alvo e sozinho nao faz a nota "ja' lancada" */
  const vivos = todos.filter((l) => !l.cancelado);
  /* P167 — UMA COMPRA SÓ: daqui para baixo só a compra da nota (e as soltas); a outra compra fica de fora, dita na frase */
  const compra = compraDaNota(vivos);
  const achados = vivos.filter((l) => !l.financiamentoId || l.financiamentoId === compra.grupo);
  const outraCompra = vivos.filter((l) => !achados.includes(l));
  /* NOTA-PAGA-A-VISTA-01 — a nota inteira num lançamento solto do fornecedor (o critério da busca: `fornecedorPor`): fora do casamento por
     parcela (sem isto o P128a o punha na 1/3 pela data e "criava" as outras: a soma passava da nota). O irmão só do parcelamento não conta. */
  const candidatosAVista = parcelas.length > 1 && notaCent > 0
    ? achados.filter((l) => !l.financiamentoId && !!l.fornecedorPor && l.por.some((x) => x !== 'parcelamento') && Math.abs(l.valorCent - notaCent) <= 5)
    : [];
  const aVista = candidatosAVista.length === 1 ? candidatosAVista[0] : null;
  const casaveis = aVista ? achados.filter((l) => l !== aVista) : achados;
  const pares = casaveis.flatMap((l) => l.parcelas.map((p) => ({ l, ...p })))
    .filter((x) => parcelas.some((p) => p.n === x.n))
    .sort((a, b) => a.difCent - b.difCent || a.difDias - b.difDias || a.n - b.n || a.l.id.localeCompare(b.l.id));
  const daParcela = new Map<number, LancamentoJaLancado>();
  const usados = new Set<string>();
  for (const x of pares) {
    if (daParcela.has(x.n) || usados.has(x.l.id)) continue;
    daParcela.set(x.n, x.l);
    usados.add(x.l.id);
  }
  /* P128a — a parcela da nota SEM par pelo valor casa com o achado pela nota (numero, documento, chave, soma, mesmo parcelamento) de data mais
     PROXIMA (ate' 20 dias): e' a mesma parcela com valor ou dia diferente (Ferri & Prado: 05/11 × 09/11, 1.904,00 × 1.904,34) — a tabela
     mostra a diferenca em vermelho; sem isso ela viraria "falta → criar" + "a mais no sistema" (em dobro). Nunca na nota de UMA parcela. */
  const pelaNotaPor = (l: LancamentoJaLancado) => l.por.some((x) => x !== 'valor');
  if (parcelas.length > 1) {
    const dia = (x: string | null) => (x ? Date.parse(`${x}T12:00:00Z`) / 86_400_000 : Number.NaN);
    for (const parcela of [...parcelas].sort((a, b) => a.n - b.n)) {
      if (daParcela.has(parcela.n)) continue;
      const melhor = casaveis
        .filter((l) => !usados.has(l.id) && pelaNotaPor(l))
        .map((l) => ({ l, d: Math.abs(dia(l.vencimento ?? l.pagamento ?? l.competencia) - dia(parcela.vencimento)) }))
        .filter((x) => x.d <= 20)
        .sort((a, b) => a.d - b.d || a.l.id.localeCompare(b.l.id))[0];
      if (melhor) { daParcela.set(parcela.n, melhor.l); usados.add(melhor.l.id); }
    }
  }
  /* P162 — a nota de UMA parcela (sem duplicata: o "vencimento" é a emissão) achada pela nota (nº, documento, chave; o emitente o banco já
     conferiu) com o MESMO valor (até 5 centavos) é ELA, qualquer que seja a data — sem isso, "só na nota → criar" + "só no sistema" (em dobro).
     O irmão achado só por ser do parcelamento nunca casa. */
  if (parcelas.length === 1 && !daParcela.has(parcelas[0].n)) {
    const unica = parcelas[0];
    const mesma = casaveis.find((l) => !usados.has(l.id) && l.por.some((x) => x !== 'valor' && x !== 'parcelamento')
      && Math.abs(l.valorCent - unica.valorCent) <= 5);
    if (mesma) { daParcela.set(unica.n, mesma); usados.add(mesma.id); }
  }
  const pelaNota = casaveis.filter((l) => !usados.has(l.id) && pelaNotaPor(l));
  for (const l of pelaNota) usados.add(l.id);
  if (aVista) usados.add(aVista.id);
  if (usados.size === 0 && outraCompra.length === 0) return null;
  const outrosParecidos = casaveis.filter((l) => !usados.has(l.id)).length;
  const porParcela = parcelas.map((parcela) => ({ parcela, lancamento: daParcela.get(parcela.n) ?? null }));
  const fracoes = new Map<string, number>();
  /* P95 — o N conferido pelo banco (a fracao da descricao) vale antes do calculo pelo valor (1 centavo por parcela) */
  for (const l of pelaNota) { const n = l.fracaoN ?? fracaoDaNota(l.valorCent, notaCent); if (n) fracoes.set(l.id, n); }
  /* a nota de UMA parcela (sem duplicatas) ja' lancada EM PARCELAS: a "que falta" seria a nota inteira de novo — em dobro. Nao se oferece. */
  /* P128a — tambem achada PELA SOMA (o parcelamento do emitente que soma exatamente a nota): a "que falta" seria a nota inteira em dobro */
  const emParcelas = parcelas.length === 1 && (fracoes.size > 0 || pelaNota.some((l) => l.por.includes('soma')));
  return {
    porParcela, pelaNota, outrosParecidos, fracoes, emParcelas, cancelados: canceladosDaNota(todos), outraCompra, compraAmbigua: compra.ambigua, aVista,
    /* P128a — o irmão achado SÓ por ser do mesmo parcelamento ("só no sistema", a parcela que sobra) nunca recebe a nota: ele não é dela */
    alvos: [...(aVista ? [aVista] : []), ...porParcela.flatMap((x) => (x.lancamento ? [x.lancamento] : [])), ...pelaNota.filter((l) => l.por.some((x) => x !== 'parcelamento'))],
    /* P167 — ambígua: nada se cria (a que "falta" pode ser a outra compra) */
    faltam: emParcelas || compra.ambigua ? [] : porParcela.filter((x) => !x.lancamento).map((x) => x.parcela),
  };
}

/** D — os cancelados achados (pela data, o mais antigo primeiro). */
export function canceladosDaNota(todos: readonly LancamentoJaLancado[]): LancamentoJaLancado[] {
  const data = (l: LancamentoJaLancado) => l.vencimento ?? l.pagamento ?? l.competencia ?? '';
  return todos.filter((l) => l.cancelado).sort((a, b) => data(a).localeCompare(data(b)) || a.id.localeCompare(b.id));
}

/** A frase do rodape da nota achada EM PARCELAS: "achadas 1 de 4 parcelas (R$ 821,22 cada)" — o N mais comum entre as achadas.
 *  P95 — achadas TODAS as N: a soma delas e a da nota, e a diferenca quando ha' (mostrar, nunca "fazer bater"). */
export function fraseEmParcelas(j: Pick<NotaJaLancada, 'fracoes' | 'pelaNota'>, notaCent = 0): string {
  const porN = new Map<number, number>();
  for (const n of j.fracoes.values()) porN.set(n, (porN.get(n) ?? 0) + 1);
  const [n, qtd] = [...porN].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0];
  const dasN = j.pelaNota.filter((l) => j.fracoes.get(l.id) === n);
  const uma = dasN[0];
  if (qtd === n && n > 0 && notaCent > 0) {
    const soma = dasN.reduce((s, l) => s + l.valorCent, 0);
    const dif = soma - notaCent;
    return `Esta nota parece já lançada em parcelas: achadas ${n} de ${n} · soma R$ ${reais(soma)} · nota R$ ${reais(notaCent)}${dif ? ` · diferença R$ ${reais(Math.abs(dif))}` : ''}. Nada será criado em dobro.`;
  }
  return `Esta nota parece já lançada em parcelas: ${qtd === 1 ? 'achada 1' : `achadas ${qtd}`} de ${n} (R$ ${reais(uma?.valorCent ?? 0)} cada). Nada será criado em dobro.`;
}

/** P95 — a fracao "k/N" no fim da descricao ("Tinta … - 3/6" -> { k: 3, n: 6 }); `null` sem ela. A mesma regra do banco. */
export function fracaoDaDescricao(descricao: string | null | undefined): { k: number; n: number } | null {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(descricao ?? '');
  if (!m) return null;
  const k = Number(m[1]); const n = Number(m[2]);
  return n >= 2 && n <= 72 && k >= 1 && k <= n ? { k, n } : null;
}

/** As parcelas da nota para a busca: as duplicatas; sem duplicata, o valor da nota no vencimento escolhido (ou na emissao). */
export function parcelasParaCasar(duplicatas: readonly { vencimento: string; valorCent: number }[], notaCent: number, vencimento: string): ParcelaDaNotaParaCasar[] {
  if (duplicatas.length) return duplicatas.map((d, i) => ({ n: i + 1, vencimento: d.vencimento, valorCent: d.valorCent }));
  return [{ n: 1, vencimento, valorCent: notaCent }];
}

/** Le^ a linha do banco (snake_case) — nada fora do formato passa. */
export function lerJaLancados(r: unknown): LancamentoJaLancado[] {
  if (!Array.isArray(r)) return [];
  const texto = (o: object, k: string) => { const v: unknown = Reflect.get(o, k); return typeof v === 'string' && v ? v : null; };
  return r.flatMap((o: unknown) => {
    if (!o || typeof o !== 'object') return [];
    const id = texto(o, 'id');
    if (!id) return [];
    const parc: unknown = Reflect.get(o, 'parcelas');
    const por: unknown = Reflect.get(o, 'por');
    return [{
      id, vencimento: texto(o, 'vencimento'), pagamento: texto(o, 'pagamento'), competencia: texto(o, 'competencia'),
      descricao: texto(o, 'descricao'), valorCent: Number(Reflect.get(o, 'valor_cent')) || 0, status: texto(o, 'status'),
      conciliado: Reflect.get(o, 'conciliado') === true, financiamentoId: texto(o, 'financiamento_id'), numeroDocumento: texto(o, 'numero_documento'),
      contaBancariaId: texto(o, 'conta_bancaria_id'), notaDocumentoId: texto(o, 'nota_documento_id'),
      fornecedorId: texto(o, 'fornecedor_id'), fornecedorNome: texto(o, 'fornecedor_nome'), fornecedorPor: texto(o, 'fornecedor_por'),
      parcelas: Array.isArray(parc) ? parc.flatMap((p: unknown) => (p && typeof p === 'object'
        ? [{ n: Number(Reflect.get(p, 'n')), difCent: Number(Reflect.get(p, 'dif_cent')) || 0, difDias: Number(Reflect.get(p, 'dif_dias')) || 0 }] : [])) : [],
      por: Array.isArray(por) ? por.filter((x): x is PorDoAchado => PORES.some((y) => y === x)) : [],
      fracaoN: Number.isInteger(Reflect.get(o, 'fracao_n')) ? Number(Reflect.get(o, 'fracao_n')) : null,
      cancelado: Reflect.get(o, 'cancelado') === true,
      parcelaN: Number.isInteger(Reflect.get(o, 'parcela_n')) ? Number(Reflect.get(o, 'parcela_n')) : null,
      temEstaNota: Reflect.get(o, 'tem_esta_nota') === true,
      documentos: Number(Reflect.get(o, 'documentos')) || 0,
    }];
  });
}

/**
 * P128a (NOTA-JA-LANCADA, mock aprovado 27/10) — a TABELA SISTEMA × NOTA: TODAS as parcelas, lado a lado (venc. e valor do sistema e da
 * nota), a diferença marcada e o que cada uma é. A nota de UMA parcela achada EM N lançamentos (Casa da Cerca: 5 × 632,00 = 3.160,00) mostra
 * os N do sistema, com a parte da nota (nota/N) ao lado. Os cancelados não entram (a frase os conta).
 */
export type SituacaoNaTabela = 'conciliada' | 'realizada' | 'programada' | 'so_na_nota' | 'so_no_sistema';
export interface LinhaSistemaNota {
  chave: string;
  rotulo: string;
  sistema: LancamentoJaLancado | null;
  notaVencimento: string | null;
  notaValorCent: number | null;
  situacao: SituacaoNaTabela;
  difValor: boolean;
  difData: boolean;
  /** o porquê do rótulo da parcela (o title): "parcela ? de 4 da nota: 4 × R$ 491,64 = R$ 1.966,56 (…)" */
  dica?: string;
}
export const TEXTO_DA_SITUACAO: Record<SituacaoNaTabela, string> = {
  conciliada: 'conciliada', realizada: 'realizada', programada: 'programada', so_na_nota: 'só na nota → criar', so_no_sistema: 'só no sistema',
};
const situacaoDe = (l: LancamentoJaLancado): SituacaoNaTabela =>
  (l.conciliado ? 'conciliada' : l.status === 'realizado' || l.status === 'conciliado' || !!l.pagamento ? 'realizada' : 'programada');
const dataDe = (l: LancamentoJaLancado) => l.vencimento ?? l.pagamento ?? l.competencia;

/** Em quantas parcelas a nota foi lançada: o N mais comum das frações achadas; sem fração, quantos foram achados. */
export function nDasParcelas(j: Pick<NotaJaLancada, 'fracoes' | 'pelaNota'>): number {
  /* achada pela soma: o parcelamento inteiro SAO as parcelas (nem toda parcela e' nota ÷ N: 33.000,00 + 6 × 12.833,33) */
  const pelaSoma = j.pelaNota.filter((l) => l.por.includes('soma')).length;
  if (pelaSoma) return pelaSoma;
  const porN = new Map<number, number>();
  for (const n of j.fracoes.values()) porN.set(n, (porN.get(n) ?? 0) + 1);
  const [n] = [...porN].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0];
  return n || j.pelaNota.length;
}

export function linhasSistemaNota(j: NotaJaLancada, notaCent: number): LinhaSistemaNota[] {
  const total = j.porParcela.length;
  if (j.emParcelas) {
    /* a nota de uma parcela, achada em N lançamentos: os do sistema, a parte da nota (nota ÷ N) ao lado; qual das N, só a descrição diz
       ("… - 3/6" -> "3/6"; sem ela, "?/N", como no P95) */
    const n = nDasParcelas(j);
    const parte = n > 0 ? Math.round(notaCent / n) : 0;
    /* P95 — a descricao so' vale para a irma conferida pelo banco ('fracao') */
    const qual = (l: LancamentoJaLancado) => {
      const f = l.por.includes('fracao') ? fracaoDaDescricao(l.descricao) : null;
      return f && f.n === n ? f.k : l.por.includes('soma') && l.parcelaN ? l.parcelaN : null;
    };
    /* a parte da nota (nota ÷ N) so' ao lado da achada como FRACAO; a achada pela soma nao tem parte da nota: "—" (nunca vermelho inventado) */
    const temParte = (l: LancamentoJaLancado) => j.fracoes.has(l.id) && !l.por.includes('soma');
    return [...j.pelaNota].sort((a, b) => (qual(a) ?? 99) - (qual(b) ?? 99) || (dataDe(a) ?? '').localeCompare(dataDe(b) ?? '') || a.id.localeCompare(b.id))
      .map((l) => ({
        chave: l.id, rotulo: `${qual(l) ?? '?'}/${n}`, sistema: l, notaVencimento: null, notaValorCent: temParte(l) ? parte : null,
        situacao: situacaoDe(l), difValor: temParte(l) && Math.abs(l.valorCent - parte) > 1, difData: false,
        dica: l.por.includes('soma') ? `parcela ${qual(l) ?? '?'} de ${n} do parcelamento que soma a nota`
          : qual(l) ? `parcela ${qual(l)} de ${n} (pela descrição do lançamento)`
          : `parcela ? de ${n} da nota: ${n} × R$ ${reais(l.valorCent)} = R$ ${reais(notaCent)} (qual das ${n}, a nota não diz)`,
      }));
  }
  /* NOTA-PAGA-A-VISTA-01 — o lançamento à vista primeiro, com a nota inteira ao lado; as duplicatas embaixo, só como informação */
  const linhaAVista: LinhaSistemaNota[] = j.aVista ? [{ chave: j.aVista.id, rotulo: 'à vista', sistema: j.aVista, notaVencimento: null,
    notaValorCent: notaCent, situacao: situacaoDe(j.aVista), difValor: j.aVista.valorCent !== notaCent, difData: false,
    dica: `a nota inteira (R$ ${reais(notaCent)}) paga à vista neste lançamento; as ${total} duplicatas ficam como informação` }] : [];
  const linhas: LinhaSistemaNota[] = [...linhaAVista, ...j.porParcela.map(({ parcela, lancamento: l }) => ({
    chave: `p${parcela.n}`, rotulo: `${parcela.n}/${total}`, sistema: l, notaVencimento: parcela.vencimento, notaValorCent: parcela.valorCent,
    situacao: l ? situacaoDe(l) : 'so_na_nota',
    difValor: !!l && l.valorCent !== parcela.valorCent,
    difData: !!l && (l.vencimento ?? l.pagamento ?? l.competencia) !== parcela.vencimento,
  }))];
  for (const l of j.pelaNota) {
    linhas.push({ chave: l.id, rotulo: l.parcelaN ? `${l.parcelaN}/?` : '—', sistema: l, notaVencimento: null, notaValorCent: null,
      situacao: 'so_no_sistema', difValor: false, difData: false });
  }
  return linhas;
}

/** O que caminho achou, em palavras (a frase do mock): "pelo CNPJ + nº", "pelo documento anexado", "pela soma", … */
function comoAchou(achados: readonly LancamentoJaLancado[]): string {
  const tem = (p: PorDoAchado) => achados.some((l) => l.por.includes(p));
  const partes: string[] = [];
  if (tem('numero') || tem('documento')) partes.push(achados.some((l) => l.fornecedorPor === 'cnpj') ? 'pelo CNPJ + nº da nota' : 'pelo nº da nota');
  if (tem('chave')) partes.push('pela chave');
  if (tem('soma')) partes.push('pela soma');
  /* P128c — a porta 2: o lançamento aberto é a âncora, ache a nota ele ou não */
  if (tem('lancamento')) partes.push('a partir do lançamento aberto');
  if (tem('valor') && !partes.length) partes.push('pelo valor e vencimento');
  return partes.join(' · ');
}

/** A frase do topo: quantas, como achou, a soma × a nota e o que cada uma é. */
export function fraseDoAchado(j: NotaJaLancada, linhas: readonly LinhaSistemaNota[], notaCent: number): string {
  const doSistema = linhas.flatMap((x) => (x.sistema ? [x.sistema] : []));
  const conta = (s: SituacaoNaTabela) => linhas.filter((x) => x.situacao === s).length;
  const soma = doSistema.reduce((t, l) => t + l.valorCent, 0);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const partes: string[] = [];
  if (j.emParcelas) {
    const n = doSistema.length;
    const deN = nDasParcelas(j);
    const valores = new Set(doSistema.map((l) => l.valorCent));
    if (n < deN) {
      /* achadas só algumas das N: quantas, e o valor de cada (a soma não fecha, nem deveria) */
      partes.push(`${n} de ${deN} parcelas desta nota já estão lançadas${valores.size === 1 ? ` (R$ ${reais(doSistema[0].valorCent)} cada)` : ''}`);
    } else {
      const conta1 = valores.size === 1 ? `${n} × R$ ${reais(doSistema[0].valorCent)} = R$ ${reais(soma)}` : `R$ ${reais(soma)}`;
      partes.push(doSistema.some((l) => l.por.includes('soma')) ? `${plural(n, 'parcela lançada', 'parcelas lançadas')} num parcelamento desta nota`
        : `${plural(n, 'lançamento solto', 'lançamentos soltos')} desta nota`);
      partes.push(`soma ${conta1} ${soma === notaCent ? '✓' : `× nota R$ ${reais(notaCent)} (diferença R$ ${reais(Math.abs(soma - notaCent))})`}`);
    }
  } else if (j.aVista) {
    /* NOTA-PAGA-A-VISTA-01 — a nota inteira num lançamento: as duplicatas são só informação (nunca "0 de 3 lançadas", nem "só na nota") */
    const v = j.aVista.valorCent;
    partes.push(`A nota inteira já está paga à vista num lançamento (R$ ${reais(v)} ${v === notaCent ? '✓' : `× nota R$ ${reais(notaCent)}, diferença R$ ${reais(Math.abs(v - notaCent))}`})`);
    partes.push(`as ${j.porParcela.length} duplicatas ficam como informação`);
  } else {
    const achadas = linhas.filter((x) => x.sistema && x.notaValorCent !== null).length;
    partes.push(`${achadas} de ${j.porParcela.length} parcelas desta nota já estão lançadas`);
    if (soma !== notaCent) partes.push(`soma no sistema R$ ${reais(soma)} × nota R$ ${reais(notaCent)} (diferença R$ ${reais(Math.abs(soma - notaCent))})`);
  }
  const como = comoAchou(doSistema);
  if (como) partes.push(`achados ${como}`);
  if (conta('conciliada')) partes.push(plural(conta('conciliada'), 'conciliada', 'conciliadas'));
  if (conta('realizada')) partes.push(plural(conta('realizada'), 'realizada', 'realizadas'));
  if (conta('programada')) partes.push(plural(conta('programada'), 'programada', 'programadas'));
  if (conta('so_na_nota') && !j.aVista) partes.push(`${conta('so_na_nota')} só na nota`);
  if (conta('so_no_sistema')) partes.push(`${conta('so_no_sistema')} só no sistema`);
  if (j.cancelados.length) partes.push(plural(j.cancelados.length, 'cancelado (não conta)', 'cancelados (não contam)'));
  return partes.join(' · ');
}
