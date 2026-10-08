/**
 * fornecedorTexto — FORN-SELETOR-PADRAO-01 passo 1b. As funções PURAS do seletor de fornecedor: normalização (da busca e do
 * nome repetido), formatação do documento e o recorte do que a lista mostra. Um lugar só; o seletor e os testes leem daqui.
 */

/** Só os dígitos de um texto ("" quando não há). */
export const soDigitos = (t: string | null | undefined): string => (t ?? '').replace(/\D/g, '');

/** A máscara de CNPJ (14) ou CPF (11) sobre os DÍGITOS; nulo para qualquer outro tamanho — não se inventa máscara. */
export function mascaraDoDocumento(digitos: string): string | null {
  const d = digitos;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return null;
}

/** O documento como a tela o escreve: 00.000.000/0000-00 ou 000.000.000-00; outro tamanho aparece COMO ESTÁ. Vazio = "". */
export function formatarDocumento(doc: string | null | undefined): string {
  const cru = (doc ?? '').trim();
  if (!cru) return '';
  return mascaraDoDocumento(soDigitos(cru)) ?? cru;
}

/** Nome para comparar: sem acento, sem caixa, espaços duplos viram um, sem espaço nas pontas. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A busca digitada é NÚMERO (só dígitos, com ou sem ponto, barra, traço e espaço)? Devolve os dígitos, ou nulo. */
export function digitosDaBusca(busca: string): string | null {
  const semPontuacao = busca.replace(/[.\-/\s]/g, '');
  return semPontuacao !== '' && /^\d+$/.test(semPontuacao) ? semPontuacao : null;
}

/** O mínimo que estas funções leem de um fornecedor. */
export interface FornecedorDoSeletor { id: string; nome: string; cpf_cnpj?: string | null; ativo?: boolean | null }

/** Cadastro de projeção ("[META]" no nome): fora da lista por padrão; só entra em modal de meta. A regra mora aqui. */
export const ehCadastroDeMeta = (nome: string): boolean => nome.includes('[META]');

/** O que se calcula UMA vez por fornecedor ao montar a lista (a busca corre sobre isto a cada tecla). */
export interface OpcaoDeFornecedor<F extends FornecedorDoSeletor> {
  f: F;
  nomeNorm: string;
  digitos: string;
  /** Documento formatado ("" = sem documento: a área do documento da opção fica vazia). */
  documento: string;
  /** Quantos ATIVOS têm este mesmo nome normalizado; 0 quando o nome é único (sem selo). */
  iguais: number;
}

/** Monta as opções: tira os de meta (salvo `incluirMeta`), normaliza e conta os nomes repetidos ENTRE OS LISTADOS. */
export function montarOpcoes<F extends FornecedorDoSeletor>(ativos: readonly F[], incluirMeta = false): OpcaoDeFornecedor<F>[] {
  const base = incluirMeta ? ativos : ativos.filter((f) => !ehCadastroDeMeta(f.nome));
  const contagem = new Map<string, number>();
  const norm = base.map((f) => {
    const n = normalizarNome(f.nome);
    contagem.set(n, (contagem.get(n) ?? 0) + 1);
    return n;
  });
  return base.map((f, i) => {
    const vezes = contagem.get(norm[i]) ?? 1;
    return { f, nomeNorm: norm[i], digitos: soDigitos(f.cpf_cnpj), documento: formatarDocumento(f.cpf_cnpj), iguais: vezes > 1 ? vezes : 0 };
  });
}

/** A opção casa com a busca? Pelo nome (sem acento, sem caixa); e, quando a busca é só número, também pelo documento. */
export function casaComABusca<F extends FornecedorDoSeletor>(o: OpcaoDeFornecedor<F>, busca: string): boolean {
  const q = normalizarNome(busca);
  if (!q) return true;
  if (o.nomeNorm.includes(q)) return true;
  const d = digitosDaBusca(busca);
  return d !== null && o.digitos.includes(d);
}

export const LIMITE_DE_OPCOES = 100;

export interface RecorteDeOpcoes<F extends FornecedorDoSeletor> {
  /** Quantas casam com a busca (a busca corre sobre TODAS). */
  total: number;
  /** As que a lista desenha: o escolhido no topo (mesmo fora do limite) e as demais até o limite. */
  visiveis: OpcaoDeFornecedor<F>[];
}

/** Filtra sobre todas, põe o escolhido no topo e corta no limite — o corte nunca muda o RESULTADO da busca, só o que se desenha. */
export function recortarOpcoes<F extends FornecedorDoSeletor>(
  opcoes: readonly OpcaoDeFornecedor<F>[], busca: string, escolhidoId: string | null | undefined, limite: number = LIMITE_DE_OPCOES,
): RecorteDeOpcoes<F> {
  const casam = busca.trim() ? opcoes.filter((o) => casaComABusca(o, busca)) : opcoes;
  const escolhido = escolhidoId ? casam.find((o) => o.f.id === escolhidoId) : undefined;
  if (!escolhido) return { total: casam.length, visiveis: casam.slice(0, limite) };
  const visiveis: OpcaoDeFornecedor<F>[] = [escolhido];
  for (const o of casam) {
    if (visiveis.length >= limite) break;
    if (o !== escolhido) visiveis.push(o);
  }
  return { total: casam.length, visiveis };
}

/** O rodapé fixo da lista quando há mais do que se desenha; nulo quando cabe tudo. */
export function fraseDoLimite(mostrando: number, total: number): string | null {
  return total > mostrando ? `Mostrando ${mostrando} de ${total.toLocaleString('pt-BR')} — digite para refinar` : null;
}

export const SEM_DOCUMENTO = 'sem CNPJ/CPF';
/** A linha fixa sob o campo: o documento do escolhido, "sem CNPJ/CPF", ou vazia quando nada foi escolhido. */
export function linhaDoDocumento(escolhido: FornecedorDoSeletor | null | undefined): string {
  if (!escolhido) return '';
  return formatarDocumento(escolhido.cpf_cnpj) || SEM_DOCUMENTO;
}
/** O selo do nome repetido ("3 iguais"); "" quando o nome é único. */
export const seloDeIguais = (n: number): string => (n > 1 ? `${n} iguais` : '');
