/**
 * FORN-MESCLAR-01 — o dono puro da mesclagem de fornecedores na tela: o leitor do que o banco devolve (sem cast; peça torta =
 * nulo), a ordem dos módulos e as frases. A regra (quem move, o que recusa, o que vira apelido) é do banco:
 * `fn_fornecedor_mesclar`, `fn_fornecedor_mesclagem_desfazer` e `fn_fornecedor_repetidos`. Aqui nenhuma conta além de ler.
 */

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A ordem em que a prévia mostra os módulos (a mesma do banco, `_fn_fornecedor_mesclar_alvos`). */
export const MODULOS_DA_MESCLAGEM: ReadonlyArray<string> = [
  'Financeiro', 'Recorrências', 'Financiamentos', 'Operação comercial', 'Rebanho', 'Agricultura', 'Importação', 'Cadastro',
];

export interface FornecedorDaMesclagem { id: string; nome: string; cpfCnpj: string | null; ativo: boolean; nomeFantasia?: string | null }
export interface Recusa { motivo: string; frase: string }
export interface PreviaDaMesclagem {
  simulado: boolean;
  recusa: Recusa | null;
  mesclagemId: string | null;
  mantido: FornecedorDaMesclagem | null;
  absorvidos: FornecedorDaMesclagem[];
  porModulo: Array<{ modulo: string; quantidade: number }>;
  total: number;
  apelidos: string[];
  /** FORN-MESCLAR-02b — as referências que passam, por "tabela.coluna" (do banco); vazio no banco anterior */
  porTabela: Record<string, number>;
}

const lerRecusa = (v: unknown): Recusa | null | undefined => {
  if (v === null || v === undefined) return null;
  if (!ehObj(v)) return undefined;
  const motivo = txt(v.motivo); const frase = txt(v.frase);
  return motivo && frase ? { motivo, frase } : undefined;
};

const lerFornecedor = (v: unknown): FornecedorDaMesclagem | null => {
  if (!ehObj(v)) return null;
  const id = txt(v.id); const nome = txt(v.nome);
  if (!id || !nome) return null;
  return { id, nome, cpfCnpj: txt(v.cpf_cnpj), ativo: v.ativo !== false, nomeFantasia: txt(v.nome_fantasia) };
};

export function lerPreviaDaMesclagem(r: unknown): PreviaDaMesclagem | null {
  if (!ehObj(r)) return null;
  const recusa = lerRecusa(r.recusa);
  if (recusa === undefined) return null;
  const simulado = r.simulado === true;
  if (recusa) return { simulado, recusa, mesclagemId: null, mantido: null, absorvidos: [], porModulo: [], total: 0, apelidos: [], porTabela: {} };
  const mantido = lerFornecedor(r.mantido);
  if (!mantido || !Array.isArray(r.absorvidos) || !ehObj(r.por_modulo) || num(r.total) === null || !Array.isArray(r.apelidos)) return null;
  const absorvidos: FornecedorDaMesclagem[] = [];
  for (const a of r.absorvidos) { const f = lerFornecedor(a); if (!f) return null; absorvidos.push(f); }
  const porModulo: Array<{ modulo: string; quantidade: number }> = [];
  for (const [modulo, q] of Object.entries(r.por_modulo)) { const n = num(q); if (n === null) return null; porModulo.push({ modulo, quantidade: n }); }
  porModulo.sort((a, b) => ordemDoModulo(a.modulo) - ordemDoModulo(b.modulo));
  const apelidos = r.apelidos.filter((x): x is string => typeof x === 'string');
  const porTabela: Record<string, number> = {};
  if (ehObj(r.por_tabela)) for (const [k, q] of Object.entries(r.por_tabela)) { const n = num(q); if (n !== null) porTabela[k] = n; }
  return { simulado, recusa: null, mesclagemId: txt(r.mesclagem_id), mantido, absorvidos, porModulo, total: num(r.total) ?? 0, apelidos, porTabela };
}

const ordemDoModulo = (m: string) => { const i = MODULOS_DA_MESCLAGEM.indexOf(m); return i < 0 ? MODULOS_DA_MESCLAGEM.length : i; };

/** FORN-MESCLAR-02c: 'parecido' = ligados por nome PARECIDO (o banco decide; nunca documentos diferentes no mesmo grupo). */
export interface GrupoRepetido { motivo: 'documento' | 'nome' | 'parecido'; chave: string; fornecedores: FornecedorDaMesclagem[] }

export function lerGruposRepetidos(r: unknown): GrupoRepetido[] | null {
  if (!Array.isArray(r)) return null;
  const grupos: GrupoRepetido[] = [];
  for (const g of r) {
    if (!ehObj(g) || !Array.isArray(g.fornecedores)) return null;
    const motivo = g.motivo === 'documento' || g.motivo === 'nome' || g.motivo === 'parecido' ? g.motivo : null;
    const chave = txt(g.chave);
    if (!motivo || !chave) return null;
    const fornecedores: FornecedorDaMesclagem[] = [];
    for (const f of g.fornecedores) { const x = lerFornecedor(f); if (!x) return null; fornecedores.push(x); }
    grupos.push({ motivo, chave, fornecedores });
  }
  return grupos;
}

export interface MesclagemFeita {
  id: string; mantidoId: string; absorvidos: string[]; absorvidosNomes: string[]; criadoEm: string; total: number;
  desfeitoEm: string | null; desfeitoMotivo: string | null;
}

export function lerMesclagens(r: unknown): MesclagemFeita[] | null {
  if (!Array.isArray(r)) return null;
  const out: MesclagemFeita[] = [];
  for (const l of r) {
    if (!ehObj(l)) return null;
    const id = txt(l.id); const mantidoId = txt(l.mantido_id); const criadoEm = txt(l.criado_em);
    if (!id || !mantidoId || !criadoEm || !Array.isArray(l.absorvidos)) return null;
    const total = ehObj(l.resumo) ? num(l.resumo.total) ?? 0 : 0;
    const nomes = ehObj(l.antes) && Array.isArray(l.antes.absorvidos)
      ? l.antes.absorvidos.map((a) => (ehObj(a) ? txt(a.nome) : null)).filter((x): x is string => x !== null) : [];
    out.push({ id, mantidoId, absorvidos: l.absorvidos.filter((x): x is string => typeof x === 'string'), absorvidosNomes: nomes, criadoEm, total,
      desfeitoEm: txt(l.desfeito_em), desfeitoMotivo: txt(l.desfeito_motivo) });
  }
  return out;
}

/** "o motivo do grupo": por que o sistema acha que são o mesmo. */
export const fraseDoGrupo = (g: GrupoRepetido): string => {
  if (g.motivo === 'nome') return `mesmo nome · ${g.fornecedores.length} cadastros`;
  if (g.motivo === 'parecido') return `nome parecido · ${g.fornecedores.length} cadastros`;
  const d = (g.fornecedores.find((f) => f.cpfCnpj)?.cpfCnpj ?? '').replace(/\D/g, '');
  return `mesmo ${d.length === 11 ? 'CPF' : 'CNPJ'} · ${g.fornecedores.length} cadastros`;
};

/** O texto do resultado da gravação, com os números do banco. */
export const fraseDoResultado = (p: PreviaDaMesclagem): string =>
  `${p.absorvidos.length} ${p.absorvidos.length === 1 ? 'cadastro absorvido' : 'cadastros absorvidos'} · ${p.total} ${p.total === 1 ? 'referência movida' : 'referências movidas'} para ${p.mantido?.nome ?? '—'}.`;

export const MOTIVO_SEM_PREVIA = 'Escolha o fornecedor que fica e ao menos um para absorver.';
export const MOTIVO_DESFAZER_SEM_MOTIVO = 'Informe o motivo para desfazer.';

/* ─────────────────────────────── FORN-MESCLAR-02b — a comparação lado a lado ─────────────────────────────── */

/** Um cadastro na comparação: a linha do banco (as colunas como texto), o subcentro padrão já lido e o uso. */
export interface CadastroComparado {
  id: string; nome: string; ativo: boolean;
  linha: Record<string, string | null>;
  /** o nome do subcentro padrão; nulo sem subcentro */
  planoNome: string | null;
  /** o subcentro padrão está no plano do cliente (ativo, global ou dele); nulo sem subcentro */
  planoNoPlano: boolean | null;
}
export interface UsoDoCadastro {
  lancamentos: number; comprasParceladas: number; recorrencias: number; documentos: number; financiamentos: number; operacoes: number;
  ultimoUso: string | null;
}

export function lerUso(r: unknown): UsoDoCadastro | null {
  if (!ehObj(r)) return null;
  const n = (k: string) => num(r[k]) ?? 0;
  return { lancamentos: n('lancamentos'), comprasParceladas: n('compras_parceladas'), recorrencias: n('recorrencias'), documentos: n('documentos'),
    financiamentos: n('financiamentos'), operacoes: n('operacoes'), ultimoUso: txt(r.ultimo_lancamento) };
}

const v = (l: Record<string, string | null>, c: string) => { const x = l[c]; return x && x.trim() ? x.trim() : null; };
const juntar = (partes: Array<string | null>, sep = ' · ') => { const p = partes.filter((x): x is string => !!x); return p.length ? p.join(sep) : null; };

/** Uma linha da comparação. `campo` é a chave que o banco aceita em `p_valores` (`_fn_fornecedor_mesclar_campos`); nulo = só leitura. */
interface DefinicaoDaLinha {
  chave: string; rotulo: string; campo: string | null; base: boolean;
  mostrar: (c: CadastroComparado) => string | null;
  /** o que decide "discordam" (o documento pelos dígitos, o endereço inteiro); padrão = o mostrado */
  comparar?: (c: CadastroComparado) => string | null;
  title?: (c: CadastroComparado) => string | null;
}
const endereco = (c: CadastroComparado) => juntar([v(c.linha, 'logradouro'), v(c.linha, 'numero'), v(c.linha, 'complemento'), v(c.linha, 'bairro'),
  juntar([v(c.linha, 'municipio'), v(c.linha, 'uf')], '/'), v(c.linha, 'cep')], ', ');
const pagamento = (c: CadastroComparado) => v(c.linha, 'pix_chave')
  ?? juntar([v(c.linha, 'banco'), v(c.linha, 'agencia') && `ag ${v(c.linha, 'agencia')}`, v(c.linha, 'conta') && `cc ${v(c.linha, 'conta')}`], ' ');

export const LINHAS_DA_COMPARACAO: ReadonlyArray<DefinicaoDaLinha> = [
  { chave: 'razao_social', rotulo: 'Razão social', campo: 'razao_social', base: true, mostrar: (c) => v(c.linha, 'nome') },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', campo: 'nome_fantasia', base: true, mostrar: (c) => v(c.linha, 'nome_fantasia') },
  { chave: 'cpf_cnpj', rotulo: 'CNPJ/CPF', campo: 'cpf_cnpj', base: true,
    mostrar: (c) => { const d = v(c.linha, 'cpf_cnpj'); return d ? formatarDocumentoDaMesclagem(d) : null; },
    comparar: (c) => (v(c.linha, 'cpf_cnpj') ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase() || null },
  { chave: 'inscricao_estadual', rotulo: 'Insc. estadual', campo: 'inscricao_estadual', base: true, mostrar: (c) => v(c.linha, 'inscricao_estadual') },
  { chave: 'inscricao_municipal', rotulo: 'Insc. municipal', campo: 'inscricao_municipal', base: false, mostrar: (c) => v(c.linha, 'inscricao_municipal') },
  { chave: 'endereco', rotulo: 'Cidade/UF', campo: 'endereco', base: true,
    mostrar: (c) => juntar([v(c.linha, 'municipio'), v(c.linha, 'uf')], '/') ?? (endereco(c) ? 'endereço sem cidade' : null), comparar: endereco, title: endereco },
  { chave: 'email', rotulo: 'E-mail', campo: 'email', base: true, mostrar: (c) => v(c.linha, 'email'), comparar: (c) => v(c.linha, 'email')?.toLowerCase() ?? null },
  { chave: 'telefone', rotulo: 'Telefone', campo: 'telefone', base: false, mostrar: (c) => v(c.linha, 'telefone') },
  { chave: 'celular', rotulo: 'Celular', campo: 'celular', base: false, mostrar: (c) => v(c.linha, 'celular') },
  { chave: 'contato', rotulo: 'Contato', campo: 'contato', base: false, mostrar: (c) => v(c.linha, 'contato_nome') },
  { chave: 'pagamento', rotulo: 'Chave Pix', campo: 'pagamento', base: true, mostrar: pagamento },
  { chave: 'plano_padrao', rotulo: 'Subcentro padrão', campo: 'plano_padrao', base: true,
    mostrar: (c) => (c.planoNome ? (c.planoNoPlano === false ? `${c.planoNome} (fora do plano)` : c.planoNome) : null), comparar: (c) => v(c.linha, 'plano_padrao_id') },
  { chave: 'observacao', rotulo: 'Observação', campo: 'observacao', base: false, mostrar: (c) => v(c.linha, 'observacao') },
  { chave: 'situacao', rotulo: 'Situação', campo: null, base: true, mostrar: (c) => (c.ativo ? 'ativo' : 'inativo') },
];

function formatarDocumentoDaMesclagem(d: string): string {
  const x = d.replace(/\D/g, '');
  if (x.length === 14) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
  if (x.length === 11) return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`;
  return d;
}

export interface CelulaDaComparacao { id: string; texto: string | null; title: string | null; escolhivel: boolean }
export interface LinhaDaComparacao {
  chave: string; rotulo: string; campo: string | null; celulas: CelulaDaComparacao[];
  /** dois ou mais valores preenchidos diferentes: a linha fica amarela e cada célula preenchida tem rádio */
  divergente: boolean;
  /** de qual cadastro vem o valor que fica; nulo quando nenhum tem (ou a linha não se escolhe) */
  escolhido: string | null;
}

/** O que fica por padrão: o COM documento; empate, o de mais lançamentos; empate, o ativo; depois a ordem das colunas. */
export function ficaPadrao(cadastros: readonly CadastroComparado[], uso: ReadonlyMap<string, UsoDoCadastro>): string | null {
  if (cadastros.length === 0) return null;
  const temDoc = (c: CadastroComparado) => (v(c.linha, 'cpf_cnpj') ? 1 : 0);
  const ordem = cadastros.map((c, i) => ({ c, i })).sort((a, b) =>
    temDoc(b.c) - temDoc(a.c) || (uso.get(b.c.id)?.lancamentos ?? 0) - (uso.get(a.c.id)?.lancamentos ?? 0)
    || Number(b.c.ativo) - Number(a.c.ativo) || a.i - b.i);
  return ordem[0].c.id;
}

/**
 * As linhas da comparação: o valor de cada cadastro, se discordam, e de quem vem o valor que fica — o escolhido (se válido), senão o
 * do que fica, senão o primeiro preenchido dos outros na ordem das colunas (a MESMA regra do banco). Subcentro fora do plano nunca
 * é escolhível. As linhas extras (Insc. municipal, telefone…) só aparecem quando algum cadastro tem valor.
 */
export function linhasDaComparacao(cadastros: readonly CadastroComparado[], ficaId: string, escolhas: Readonly<Record<string, string>>): LinhaDaComparacao[] {
  const fica = cadastros.find((c) => c.id === ficaId);
  const ordem = fica ? [fica, ...cadastros.filter((c) => c.id !== ficaId)] : [...cadastros];
  const out: LinhaDaComparacao[] = [];
  for (const d of LINHAS_DA_COMPARACAO) {
    const celulas = cadastros.map((c) => {
      const texto = d.mostrar(c);
      const escolhivel = !!d.campo && texto !== null && !(d.campo === 'plano_padrao' && c.planoNoPlano === false);
      return { id: c.id, texto, title: (d.title?.(c) ?? texto), escolhivel };
    });
    if (!d.base && celulas.every((x) => x.texto === null)) continue;
    const comparados = new Set(cadastros.map((c) => (d.comparar ?? d.mostrar)(c)).filter((x): x is string => x !== null));
    const divergente = !!d.campo && comparados.size > 1;
    let escolhido: string | null = null;
    if (d.campo) {
      const pode = (id: string) => celulas.find((x) => x.id === id)?.escolhivel === true;
      const pedido = escolhas[d.campo];
      escolhido = pedido && pode(pedido) ? pedido : ordem.find((c) => pode(c.id))?.id ?? null;
    }
    out.push({ chave: d.chave, rotulo: d.rotulo, campo: d.campo, celulas, divergente, escolhido });
  }
  return out;
}

/** O que vai em `p_valores`: de quem vem cada campo que tem valor (o banco confere de novo). */
export function valoresParaGravar(linhas: readonly LinhaDaComparacao[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of linhas) if (l.campo && l.escolhido) out[l.campo] = l.escolhido;
  return out;
}

/** "Resultado: <razão social> · fantasia <x> · <documento>", ao vivo, das escolhas. */
export function resultadoAoVivo(linhas: readonly LinhaDaComparacao[]): string {
  const de = (chave: string) => { const l = linhas.find((x) => x.chave === chave); return l?.celulas.find((c) => c.id === l.escolhido)?.texto ?? null; };
  return `Resultado: ${[de('razao_social') ?? '—', de('nome_fantasia') ? `fantasia ${de('nome_fantasia')}` : null, de('cpf_cnpj') ?? 'sem CNPJ/CPF']
    .filter(Boolean).join(' · ')}`;
}

/** "Pec.3M-" com cadastro sem o prefixo: a tela bloqueia antes do banco, com a frase do banco. */
export function bloqueioDoRateio(cadastros: readonly CadastroComparado[], ficaId: string, ehRateio: (n: string) => boolean): string | null {
  const fica = cadastros.find((c) => c.id === ficaId);
  if (!fica) return null;
  const outro = cadastros.find((c) => c.id !== ficaId && ehRateio(c.nome) !== ehRateio(fica.nome));
  return outro ? `"${fica.nome}" e "${outro.nome}" não se mesclam: "Pec.3M-" marca o pagamento por rateio (nota fiscal em nome do Higino) e o cadastro com o prefixo é diferente do sem prefixo de propósito.` : null;
}

/** O rodapé: o que passa, com os números da prévia do banco (`por_tabela`). */
export function fraseDoQuePassa(p: PreviaDaMesclagem, absorvidos: number): string {
  const t = (k: string) => p.porTabela[k] ?? 0;
  const docs = t('financeiro_lancamento_documentos.emitente_id') + t('zoo_operacao_documentos.emitente_id');
  return `Passam para o que fica: ${t('financeiro_lancamentos_v2.favorecido_id')} lançamentos · ${t('financeiro_recorrencias.favorecido_id')} recorrências · ${docs} documentos. `
    + `${absorvidos === 1 ? 'O outro cadastro fica inativo' : `Os outros ${absorvidos} cadastros ficam inativos`} e ${absorvidos === 1 ? 'pode' : 'podem'} ser desfeito${absorvidos === 1 ? '' : 's'}.`;
}

/* ── FORN-MESCLAR-02c — a busca de cadastros para comparar (visível no vazio e na barra) ─────────────────────────────── */
export const PLACEHOLDER_BUSCA_CADASTRO = 'Buscar cadastro para comparar (nome, fantasia ou CNPJ)';
export const TEXTO_DO_VAZIO_DA_MESCLAGEM = 'Escolha uma sugestão à esquerda ou busque os cadastros que quer juntar.';
export const LIMITE_DA_BUSCA_DE_CADASTRO = 8;

/** Sem acento, sem caixa, espaços colapsados — "jere" acha "Jerê". */
const semAcento = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Os candidatos que casam com a busca (razão social, fantasia ou dígitos do documento), fora os que já são coluna.
 *  Ordem: o nome que COMEÇA pela busca, depois ativo antes de inativo, depois o nome. Busca vazia = nada. */
export function buscarCadastros(candidatos: readonly FornecedorDaMesclagem[], busca: string, jaNaComparacao: readonly string[],
  limite = LIMITE_DA_BUSCA_DE_CADASTRO): { itens: FornecedorDaMesclagem[]; total: number } {
  const q = semAcento(busca);
  if (!q) return { itens: [], total: 0 };
  const dig = busca.replace(/[.\-/\s]/g, '');
  const soDigitos = /^\d+$/.test(dig) ? dig : null;
  const fora = new Set(jaNaComparacao);
  const achados = candidatos.filter((f) => {
    if (fora.has(f.id)) return false;
    if (semAcento(f.nome).includes(q) || semAcento(f.nomeFantasia).includes(q)) return true;
    return soDigitos !== null && (f.cpfCnpj ?? '').replace(/\D/g, '').includes(soDigitos);
  });
  const peso = (f: FornecedorDaMesclagem) => (semAcento(f.nome).startsWith(q) ? 0 : 1) * 2 + (f.ativo ? 0 : 1);
  achados.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { itens: achados.slice(0, limite), total: achados.length };
}
