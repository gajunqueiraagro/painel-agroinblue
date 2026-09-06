/**
 * A memória de apelidos vista pelo custeio — CUSTEIO-TXT-02, item 2.
 *
 * ⚠ UMA MEMÓRIA PARA LER, ESPAÇOS SEPARADOS PARA GRAVAR (121b). A tabela
 * `financeiro_subcentro_aliases` é a mesma do importador de Excel; o que muda é a coluna
 * `origem`, e a unicidade passou a ser `(cliente_id, origem, lower(trim(alias_text)))`.
 * Então o custeio LÊ tudo — inclusive o que o Excel aprendeu — e GRAVA só no seu próprio
 * espaço, `origem = 'custeio'`. Nunca reponta a linha de outra origem: quem ensinou o
 * Excel não fica sabendo que o custeio discordou, e vice-versa.
 *
 * ⚠ A NORMALIZAÇÃO VEM DO IMPORTADOR, não de uma cópia. Duas normalizações diferentes
 * fariam a mesma memória casar de um lado e falhar do outro — que é o modo silencioso de
 * ter duas memórias sem perceber.
 */
import { normalizar } from '@/v2/lib/importLanc/importLancamentosView';

/**
 * Ordem de precedência da LEITURA. O espaço do próprio custeio primeiro; depois o que as
 * outras vias aprenderam, do mais deliberado (`manual`) ao mais automático (`seed`).
 * Origem fora desta lista é ignorada — memória nova não entra por acidente.
 */
export const PRECEDENCIA_ORIGEM = ['custeio', 'importacao', 'manual', 'seed'] as const;

/** A origem em que o custeio grava. Único valor que ele tem permissão de alterar. */
export const ORIGEM_CUSTEIO = 'custeio';

export interface AliasSubcentro {
  id: string;
  cliente_id: string | null;
  alias_text: string;
  plano_conta_id: string;
  origem: string;
}

export interface FornecedorComAliases {
  id: string;
  nome: string;
  aliases?: string[] | null;
}

/**
 * Qual alias responde por este texto.
 *
 * ⚠ CLIENTE ANTES DE GLOBAL, e origem só desempata dentro do mesmo escopo: um apelido que
 * o cliente ensinou vale mais que um `seed` que veio de fábrica, mesmo que o seed esteja
 * numa origem "mais alta" na lista. O contrário faria o cadastro de fábrica sobrepor a
 * decisão de quem opera.
 */
export function escolherAlias(aliases: readonly AliasSubcentro[], texto: string | null | undefined): AliasSubcentro | null {
  if (!texto) return null;
  const alvo = normalizar(texto);
  if (!alvo) return null;

  const candidatos = aliases.filter(a => normalizar(a.alias_text) === alvo);
  if (candidatos.length === 0) return null;

  const peso = (a: AliasSubcentro) => {
    const origem = PRECEDENCIA_ORIGEM.indexOf(a.origem as typeof PRECEDENCIA_ORIGEM[number]);
    return {
      escopo: a.cliente_id === null ? 1 : 0,        // do cliente antes do global
      origem: origem === -1 ? PRECEDENCIA_ORIGEM.length : origem,
    };
  };
  const ordenados = [...candidatos].sort((a, b) => {
    const pa = peso(a), pb = peso(b);
    return pa.escopo - pb.escopo || pa.origem - pb.origem;
  });
  /* Origem desconhecida sozinha não responde: é memória de uma via que este código não
     conhece, e chutar o destino de um lançamento é pior que não sugerir. */
  return PRECEDENCIA_ORIGEM.includes(ordenados[0].origem as typeof PRECEDENCIA_ORIGEM[number])
    ? ordenados[0] : null;
}

/**
 * A sugestão de subcentro para um item do relatório.
 *
 * ⚠ A DESCRIÇÃO VEM ANTES DO SUB-FAM, e é isto que resolve o "Sub-Fam genérico" do
 * briefing sem inventar uma lista de genéricos: se alguém já ensinou o que é "ÓLEO
 * DIESEL", essa resposta é mais específica que a de "COMBUSTÍVEIS". Só quando ninguém
 * ensinou a descrição é que o Sub-Fam responde pelo grupo inteiro.
 */
export function sugerirAliasDoItem(
  aliases: readonly AliasSubcentro[],
  item: { produto_raw: string; subfamilia_raw: string },
): { alias: AliasSubcentro; por: 'descricao' | 'subfamilia' } | null {
  const porDescricao = escolherAlias(aliases, item.produto_raw);
  if (porDescricao) return { alias: porDescricao, por: 'descricao' };
  const porSubfamilia = escolherAlias(aliases, item.subfamilia_raw);
  return porSubfamilia ? { alias: porSubfamilia, por: 'subfamilia' } : null;
}

/**
 * Fornecedor cujo apelido casa com a descrição do item.
 *
 * ⚠ MAIS DE UM DONO NÃO ESCOLHE: dois fornecedores reivindicando o mesmo apelido é
 * ambiguidade real, e sortear um deles gravaria o fornecedor errado num lançamento que
 * ninguém revisa. Devolver `null` deixa o campo vazio, que o operador resolve.
 */
export function sugerirFornecedor(
  fornecedores: readonly FornecedorComAliases[],
  descricao: string | null | undefined,
): FornecedorComAliases | null {
  if (!descricao) return null;
  const alvo = normalizar(descricao);
  if (!alvo) return null;
  const donos = fornecedores.filter(f => (f.aliases ?? []).some(a => normalizar(a) === alvo));
  return donos.length === 1 ? donos[0] : null;
}

/**
 * A linha que o custeio pode alterar para este texto — e só ela.
 *
 * Devolver `null` significa "não há nada meu aqui": o chamador insere. Encontrar a linha
 * de outra origem NÃO conta, mesmo que o texto seja o mesmo — é o espaço do outro.
 */
export function aliasDoCusteio(aliases: readonly AliasSubcentro[], texto: string | null | undefined): AliasSubcentro | null {
  if (!texto) return null;
  const alvo = normalizar(texto);
  return aliases.find(a => a.origem === ORIGEM_CUSTEIO && normalizar(a.alias_text) === alvo) ?? null;
}
