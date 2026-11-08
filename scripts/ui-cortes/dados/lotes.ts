/**
 * LOTES-03 F1 — dado SINTÉTICO da bancada de Lotes (lista, assistente, ficha, campo Lote do modal do pasto). Os nomes imitam o
 * caderno do NJ (REC-DF-NE-05 "L05 - DF Nel. SP", ENG-DM-AN-01…; LOTES-04: código ATIV-CAT-RAÇA-NN), os números não são dado de cliente. Cobre o pior caso de tela:
 * lote em "3 pastos", nome do campeiro longo, lote encerrado, lote sem lançamento ("—"), código antigo na busca.
 */
const cad = (id: string, tipo: string, sigla: string | null, nome: string, ordem: number, categorias_rebanho: string[] = []) =>
  ({ id, cliente_id: 'cli', tipo, sigla, nome, categorias_rebanho, ordem, ativo: true });

export const CATEGORIAS_REBANHO = [
  { id: 'r-mm', codigo: 'mamotes_m', nome: 'Mamotes M', ordem_exibicao: 1 }, { id: 'r-dm', codigo: 'desmama_m', nome: 'Desmama M', ordem_exibicao: 2 },
  { id: 'r-ga', codigo: 'garrotes', nome: 'Garrotes', ordem_exibicao: 3 }, { id: 'r-bo', codigo: 'bois', nome: 'Bois', ordem_exibicao: 4 },
  { id: 'r-to', codigo: 'touros', nome: 'Touros', ordem_exibicao: 5 }, { id: 'r-mf', codigo: 'mamotes_f', nome: 'Mamotes F', ordem_exibicao: 6 },
  { id: 'r-df', codigo: 'desmama_f', nome: 'Desmama F', ordem_exibicao: 7 }, { id: 'r-no', codigo: 'novilhas', nome: 'Novilhas', ordem_exibicao: 8 },
  { id: 'r-va', codigo: 'vacas', nome: 'Vacas', ordem_exibicao: 9 },
];

export const CADASTROS = [
  cad('c-pp', 'categoria', 'PP', 'Prenha parida', 10, ['r-va', 'r-mm', 'r-mf']), cad('c-vp', 'categoria', 'VP', 'Vaca prenha', 20, ['r-va']),
  cad('c-px', 'categoria', 'PX', 'Vaca descarte', 30, ['r-va']), cad('c-n1', 'categoria', 'N1', 'Novilha 1', 40, ['r-no', 'r-mm', 'r-mf']),
  cad('c-n2', 'categoria', 'N2', 'Novilha 2', 50, ['r-no']), cad('c-df', 'categoria', 'DF', 'Desmama fêmea', 60, ['r-df']),
  cad('c-dm', 'categoria', 'DM', 'Desmama macho', 70, ['r-dm']), cad('c-g1', 'categoria', 'G1', 'Garrote 1 ano', 80, ['r-ga']),
  cad('c-bo', 'categoria', 'BO', 'Boi', 90, ['r-bo']), cad('c-to', 'categoria', 'TO', 'Touro', 100, ['r-to']),
  cad('r-ne', 'raca', 'NE', 'Nelore', 10), cad('r-an', 'raca', 'AN', 'Angus', 20), cad('r-ch', 'raca', 'CH', 'Charolês', 30),
  cad('r-si', 'raca', 'SI', 'Sindi', 40), cad('r-mx', 'raca', 'MX', 'Mestiço', 50),
  cad('a-cr', 'atividade', 'CRI', 'Cria', 10), cad('a-rc', 'atividade', 'REC', 'Recria', 20), cad('a-eg', 'atividade', 'ENG', 'Engorda', 30),
  cad('a-rp', 'atividade', 'RP', 'Reprodução', 40), cad('a-dc', 'atividade', 'DC', 'Descarte', 50),
  cad('s-pa', 'sistema', null, 'Pasto', 10), cad('s-se', 'sistema', null, 'Semiconfinamento', 20), cad('s-co', 'sistema', null, 'Confinamento', 30),
  cad('p-sp', 'programa', null, 'Superprecoce', 10), cad('p-pr', 'programa', null, 'Precoce', 20), cad('p-cv', 'programa', null, 'Convencional', 30),
  cad('d-em', 'destino', null, 'Estação de monta', 10), cad('d-de', 'destino', null, 'Desmama', 20), cad('d-ab', 'destino', null, 'Abate', 30),
  cad('d-ve', 'destino', null, 'Venda', 40), cad('d-re', 'destino', null, 'Reposição', 50),
];

/* uma linha da `fn_lotes_da_fazenda` (snake_case, como o banco devolve) */
const lote = (id: string, c: string, r: string, a: string, numero: number, nome: string | null, x: Record<string, unknown> = {}) => {
  const sig = (cid: string) => CADASTROS.find(k => k.id === cid)?.sigla ?? '??';
  return {
    id, codigo: `${sig(a)}-${sig(c)}-${sig(r)}-${String(numero).padStart(2, '0')}`, codigos_antigos: [], nome_campeiro: nome, situacao: 'ativo',
    formado_em: '2026-09-30', encerrado_em: null, categoria_id: c, raca_id: r, atividade_id: a, numero, sistema_id: 's-pa', programa_id: 'p-cv',
    destino_id: 'd-ab', safra: '26/27', carimbo: null, idade_media_meses: null, meta_peso_kg: null, meta_gmd_kg: null, meta_data: null, versao: 1,
    ano_mes_dado: '2026-10', cabecas: null, peso_medio_kg: null, gmd_kg: null, pastos: [], lancamentos: 0, conferir: null, ...x,
  };
};

export const LOTES = [
  lote('l-df5', 'c-df', 'r-ne', 'a-rc', 5, 'L05 - DF Nel. SP', { sistema_id: 's-co', programa_id: 'p-sp', destino_id: 'd-em', idade_media_meses: 9,
    meta_peso_kg: 380, meta_gmd_kg: 0.85, meta_data: '2026-12-15', cabecas: 80, peso_medio_kg: 345, gmd_kg: 0.833, pastos: ['CONF.01'], lancamentos: 2, versao: 3,
    codigos_antigos: ['ENG-DF-NE-05', 'DF-NE-RC-05'] }),
  lote('l-df1', 'c-df', 'r-an', 'a-rc', 1, 'L01-DF Ang SP', { sistema_id: 's-co', programa_id: 'p-sp', destino_id: 'd-em', cabecas: 110, peso_medio_kg: 412, gmd_kg: 0.88, pastos: ['CONF.10'], lancamentos: 2, conferir: 'o nome diz N1; o lançado é só novilha (N2)' }),
  lote('l-dm1', 'c-dm', 'r-an', 'a-eg', 1, 'DM Angus L1', { programa_id: 'p-pr', cabecas: 55, peso_medio_kg: 548, gmd_kg: 0.62, pastos: ['T-B1'], lancamentos: 2 }),
  lote('l-dm6', 'c-dm', 'r-an', 'a-eg', 6, 'DM Angus L6 · lote em três pastos do retiro de baixo', { programa_id: 'p-pr', cabecas: 162, peso_medio_kg: 421,
    gmd_kg: 0.55, pastos: ['T-A2', 'T-A3', 'T-B6'], lancamentos: 6 }),
  lote('l-pp1', 'c-pp', 'r-ne', 'a-cr', 1, 'Vaca Nel CAR_7.1', { programa_id: 'p-cv', destino_id: 'd-de', carimbo: '7.1', cabecas: 1204, peso_medio_kg: 270, gmd_kg: 0.7, pastos: ['P18'], lancamentos: 3 }),
  /* LOTES-05 — a ressinc. de julho (7R) */
  lote('l-pp7r', 'c-pp', 'r-ne', 'a-cr', 3, 'Vacas ressinc. jul', { programa_id: 'p-cv', destino_id: 'd-de', carimbo: '7R', cabecas: 312, peso_medio_kg: 268, gmd_kg: 0.6, pastos: ['P18', 'P20'], lancamentos: 2 }),
  lote('l-n1', 'c-n1', 'r-an', 'a-cr', 2, 'N1 Angus SP CAR_8.2', { programa_id: 'p-sp', destino_id: 'd-de', carimbo: '8.2', cabecas: 184, peso_medio_kg: 255, gmd_kg: null, pastos: ['P19A'], lancamentos: 1 }),
  lote('l-novo', 'c-n2', 'r-ne', 'a-rp', 1, null, { sistema_id: null, programa_id: null, destino_id: null, ano_mes_dado: null }),
  lote('l-px2', 'c-px', 'r-ne', 'a-dc', 2, 'Vacas PX antigas', { situacao: 'encerrado', encerrado_em: '2026-10-31', formado_em: '2026-03-15',
    cabecas: 0, peso_medio_kg: null, gmd_kg: null, pastos: [], lancamentos: 4 }),
];

/* a trilha do REC-DF-NE-05 (audit_log): criado na semente, atividade trocada (código mudou), perfil editado */
const base = LOTES[0];
export const TRILHA = [
  { id: 't1', created_at: '2026-09-30T18:02:00-03:00', usuario_id: 'u1', via: null, acao: 'criou', resumo: 'motivo: semente set+out/26',
    dados_anteriores: null, dados_novos: { ...base, codigo: 'ENG-DF-NE-05', atividade_id: 'a-eg', codigos_antigos: [], sistema_id: 's-pa', versao: 1 } },
  { id: 't2', created_at: '2026-10-05T09:14:00-03:00', usuario_id: 'u1', via: null, acao: 'editou', resumo: 'motivo: lote editado',
    dados_anteriores: { ...base, codigo: 'ENG-DF-NE-05', atividade_id: 'a-eg', codigos_antigos: [], sistema_id: 's-pa', versao: 1 },
    dados_novos: { ...base, sistema_id: 's-pa', versao: 2 } },
  { id: 't3', created_at: '2026-11-06T14:45:00-03:00', usuario_id: 'u1', via: null, acao: 'editou', resumo: 'motivo: lote editado',
    dados_anteriores: { ...base, sistema_id: 's-pa', versao: 2 }, dados_novos: { ...base, versao: 3 } },
];

export const AUTORES = [{ user_id: 'u1', nome: 'Gabriel Junqueira Sintético', email: null, situacao: 'membro ativo' }];

const PARTE: Record<string, [number, 'categoria_id' | 'raca_id' | 'atividade_id']> = { atividade: [0, 'atividade_id'], categoria: [1, 'categoria_id'], raca: [2, 'raca_id'] };
function trocaDeSigla(a: Record<string, unknown>) {
  const p = PARTE[String(a.p_tipo)];
  const lotes = p ? LOTES.filter(l => l[p[1]] === a.p_id).map(l => {
    const partes = l.codigo.split('-'); partes[p[0]] = String(a.p_sigla);
    return { id: l.id, antes: l.codigo, depois: partes.join('-') };
  }) : [];
  return { ok: true, simulado: a.p_simular, id: a.p_id, lotes };
}

/** o banco da tela `lotes`; `vazio` = nenhum lote (a 1ª vez da fazenda) */
export function bancoDeLotes(vazio = false) {
  return {
    from: (t: string, e: { eq: Record<string, unknown> }) => (
      t === 'rebanho_lote_cadastros' ? CADASTROS
      : t === 'categorias_rebanho' ? CATEGORIAS_REBANHO
      : t === 'audit_log' ? TRILHA.filter(x => !e.eq.registro_id || e.eq.registro_id === base.id)
      : []),
    rpc: (fn: string, a: Record<string, unknown>) => (
      fn === 'fn_lotes_da_fazenda' ? (vazio ? [] : LOTES)
      : fn === 'fn_lote_proximo_numero' ? 1 + Math.max(0, ...LOTES.filter(l => l.categoria_id === a.p_categoria && l.raca_id === a.p_raca
          && l.atividade_id === a.p_atividade).map(l => l.numero))
      : fn === 'fn_nomes_dos_autores' ? AUTORES
      /* LOTE-SIGLA-EDITAR-01 — a prévia da troca de sigla: os lotes que usam o cadastro, com a parte do tipo trocada */
      : fn === 'fn_lote_cadastro_salvar' ? trocaDeSigla(a)
      : null),
  };
}
