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

export interface FornecedorDaMesclagem { id: string; nome: string; cpfCnpj: string | null; ativo: boolean }
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
  return { id, nome, cpfCnpj: txt(v.cpf_cnpj), ativo: v.ativo !== false };
};

export function lerPreviaDaMesclagem(r: unknown): PreviaDaMesclagem | null {
  if (!ehObj(r)) return null;
  const recusa = lerRecusa(r.recusa);
  if (recusa === undefined) return null;
  const simulado = r.simulado === true;
  if (recusa) return { simulado, recusa, mesclagemId: null, mantido: null, absorvidos: [], porModulo: [], total: 0, apelidos: [] };
  const mantido = lerFornecedor(r.mantido);
  if (!mantido || !Array.isArray(r.absorvidos) || !ehObj(r.por_modulo) || num(r.total) === null || !Array.isArray(r.apelidos)) return null;
  const absorvidos: FornecedorDaMesclagem[] = [];
  for (const a of r.absorvidos) { const f = lerFornecedor(a); if (!f) return null; absorvidos.push(f); }
  const porModulo: Array<{ modulo: string; quantidade: number }> = [];
  for (const [modulo, q] of Object.entries(r.por_modulo)) { const n = num(q); if (n === null) return null; porModulo.push({ modulo, quantidade: n }); }
  porModulo.sort((a, b) => ordemDoModulo(a.modulo) - ordemDoModulo(b.modulo));
  const apelidos = r.apelidos.filter((x): x is string => typeof x === 'string');
  return { simulado, recusa: null, mesclagemId: txt(r.mesclagem_id), mantido, absorvidos, porModulo, total: num(r.total) ?? 0, apelidos };
}

const ordemDoModulo = (m: string) => { const i = MODULOS_DA_MESCLAGEM.indexOf(m); return i < 0 ? MODULOS_DA_MESCLAGEM.length : i; };

export interface GrupoRepetido { motivo: 'documento' | 'nome'; chave: string; fornecedores: FornecedorDaMesclagem[] }

export function lerGruposRepetidos(r: unknown): GrupoRepetido[] | null {
  if (!Array.isArray(r)) return null;
  const grupos: GrupoRepetido[] = [];
  for (const g of r) {
    if (!ehObj(g) || !Array.isArray(g.fornecedores)) return null;
    const motivo = g.motivo === 'documento' || g.motivo === 'nome' ? g.motivo : null;
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
export const fraseDoGrupo = (g: GrupoRepetido): string =>
  g.motivo === 'documento' ? `mesmo CPF/CNPJ · ${g.fornecedores.length} cadastros` : `mesmo nome · ${g.fornecedores.length} cadastros`;

/** O texto do resultado da gravação, com os números do banco. */
export const fraseDoResultado = (p: PreviaDaMesclagem): string =>
  `${p.absorvidos.length} ${p.absorvidos.length === 1 ? 'cadastro absorvido' : 'cadastros absorvidos'} · ${p.total} ${p.total === 1 ? 'referência movida' : 'referências movidas'} para ${p.mantido?.nome ?? '—'}.`;

export const MOTIVO_SEM_PREVIA = 'Escolha o fornecedor que fica e ao menos um para absorver.';
export const MOTIVO_DESFAZER_SEM_MOTIVO = 'Informe o motivo para desfazer.';
