/* MAPA-02a — o mapa de pastos em tela cheia na bancada: dados SINTÉTICOS (nenhum dado de cliente). Uma fazenda de exemplo com 9 pastos
 * (retângulos ~42 ha, um pequeno de ~5 ha para o rótulo no hover, o de nome mais longo), a área total (só contorno), uma reserva, uma área
 * sem uso e uma estrada; fechamentos de nov/2025 a set/2026, com um pasto SEM fechamento em set (o "—"), um VAZIO (fechamento sem
 * animais) e atividades variadas no mês (cria, recria, engorda, vedado). O último mês com fechamento é set/2026 (o mês em que o mapa abre). */
const LON0 = -54.03;
const LAT0 = -19.63;
const PASSO = 0.0062;
const ret = (col: number, lin: number, lado = PASSO) => {
  const x = LON0 + col * PASSO; const y = LAT0 - lin * PASSO;
  return { type: 'Polygon', coordinates: [[[x, y], [x + lado, y], [x + lado, y - lado], [x, y - lado], [x, y]]] };
};

export const FAZENDA = { id: 'f1', nome: 'Faz. Exemplo do Mapa', codigo: 'EXM', cliente_id: 'cli' };

/* fix1: + um pasto comprido e torto (faixa diagonal, o rótulo no ponto mais interno) e dois pequenos vizinhos (a colisão dos rótulos) */
const NOMES = ['P_01', 'P_02', 'P_03', 'P_04 Retiro do Córrego Comprido', 'P_05', 'P_06', 'P_07', 'P_08', 'Piq. Curral', 'Faixa do Brejo', 'P5A', 'P5B'];
const AREA_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 4.7, 18.3, 3.1, 2.9];
export const PASTOS = NOMES.map((nome, i) => ({
  id: `p${i + 1}`, fazenda_id: 'f1', cliente_id: 'cli', nome, lote_padrao: null, area_produtiva_ha: i >= 8 ? AREA_EXTRA[i] : 41.6 + i,
  /* MAPA-ATIVIDADE-LAVOURA-01: o P5B é RESERVA no cadastro e não tem fechamento em set/26 (D1: vale o cadastro) */
  tipo_uso: i === 11 ? 'reserva' : 'recria', qualidade: null, entra_conciliacao: true, ativo: true, observacoes: i === 0 ? 'Bebedouro novo instalado em ago/26.' : null,
  ordem_exibicao: i + 1, data_inicio: null, data_fim: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}));

const POS: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
export const GEOMETRIAS = [
  { id: 'gt', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'area_total', nome_original: 'Area Total', cor: null,
    geojson: { type: 'Polygon', coordinates: [[[LON0 - 0.002, LAT0 + 0.002], [LON0 + 4 * PASSO + 0.002, LAT0 + 0.002],
      [LON0 + 4 * PASSO + 0.002, LAT0 - 3 * PASSO - 0.002], [LON0 - 0.002, LAT0 - 3 * PASSO - 0.002], [LON0 - 0.002, LAT0 + 0.002]]] },
    created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  ...POS.map(([c, l], i) => ({ id: `g${i + 1}`, fazenda_id: 'f1', cliente_id: 'cli', pasto_id: `p${i + 1}`, tipo: 'pasto', nome_original: NOMES[i],
    cor: null, geojson: ret(c, l), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' })),
  { id: 'g9', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'p9', tipo: 'pasto', nome_original: 'Piq. Curral', cor: null,
    geojson: ret(2, 2, 0.0021), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  /* a faixa torta: diagonal ao sul da grade */
  { id: 'g10', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'p10', tipo: 'pasto', nome_original: 'Faixa do Brejo', cor: null,
    geojson: { type: 'Polygon', coordinates: [[[LON0, LAT0 - 3.2 * PASSO], [LON0 + 0.5 * PASSO, LAT0 - 3.2 * PASSO], [LON0 + 3 * PASSO, LAT0 - 4.4 * PASSO],
      [LON0 + 2.6 * PASSO, LAT0 - 4.6 * PASSO], [LON0, LAT0 - 3.2 * PASSO]]] },
    created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  /* os dois pequenos vizinhos, colados um no outro */
  { id: 'g11', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'p11', tipo: 'pasto', nome_original: 'P5A', cor: null,
    geojson: ret(4.2, 0, 0.0028), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'g12', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'p12', tipo: 'pasto', nome_original: 'P5B', cor: null,
    geojson: { type: 'Polygon', coordinates: [[[LON0 + 4.2 * PASSO, LAT0 - 0.0028], [LON0 + 4.2 * PASSO + 0.0028, LAT0 - 0.0028],
      [LON0 + 4.2 * PASSO + 0.0028, LAT0 - 0.0054], [LON0 + 4.2 * PASSO, LAT0 - 0.0054], [LON0 + 4.2 * PASSO, LAT0 - 0.0028]]] },
    created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gr', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'reserva_legal', nome_original: 'Reserva Legal (mata)', cor: null,
    geojson: ret(3, 0), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gs', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'area_sem_uso', nome_original: 'Área do vizinho', cor: null,
    geojson: ret(3, 1), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'ge', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'estrada', nome_original: 'Estrada interna', cor: null,
    geojson: ret(3, 2, 0.003), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  /* MAPA-PAINEL-CERCADA-01: duas áreas DENTRO do P_01 (a sede e o curral) — o painel mostra "útil + áreas internas" */
  { id: 'gi1', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'benfeitoria', nome_original: 'Sede do P_01', cor: null,
    geojson: ret(0.6, 0.6, 0.0015), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gi2', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'curral', nome_original: 'Curral do P_01', cor: null,
    geojson: ret(0.1, 0.6, 0.0012), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
];

export const CATEGORIAS = [
  { id: 'c1', codigo: 'bois', nome: 'Bois 2-3 anos', ordem_exibicao: 1, cliente_id: 'cli' },
  { id: 'c2', codigo: 'garrotes', nome: 'Garrotes', ordem_exibicao: 2, cliente_id: 'cli' },
  { id: 'c3', codigo: 'vacas', nome: 'Vacas em reprodução com nome longo', ordem_exibicao: 3, cliente_id: 'cli' },
  { id: 'c4', codigo: 'novilhas', nome: 'Novilhas 13-24', ordem_exibicao: 4, cliente_id: 'cli' },
  { id: 'c5', codigo: 'bezerros', nome: 'Bezerros', ordem_exibicao: 5, cliente_id: 'cli' },
  { id: 'c6', codigo: 'bezerras', nome: 'Bezerras', ordem_exibicao: 6, cliente_id: 'cli' },
  { id: 'c7', codigo: 'touros', nome: 'Touros', ordem_exibicao: 7, cliente_id: 'cli' },
];

const MESES = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const ATIVIDADE = ['cria', 'recria', 'recria', 'engorda', 'recria', 'vedado', 'cria', 'recria', 'recria', 'recria', 'engorda', 'engorda'];
export const FECHAMENTOS: { id: string; fazenda_id: string; pasto_id: string; ano_mes: string; tipo_uso_mes: string; status: string; lote_mes: string | null }[] = [];
export const ITENS: { id: string; fechamento_id: string; quantidade: number; peso_medio_kg: number; categoria_id: string }[] = [];
PASTOS.forEach((p, i) => MESES.forEach((m, k) => {
  if (i === 2 && m === '2026-09') return; // P_03 sem fechamento em set/26: "—" e "último fechamento 08/26"
  if (i === 7 && k % 4 === 1) return;      // P_08 com meses sem fechamento no histórico
  if (i === 11 && m === '2026-09') return; // MAPA-ATIVIDADE-LAVOURA-01: o P5B sem fechamento em set/26 (reserva pelo cadastro)
  const id = `f-${p.id}-${m}`;
  // fix1 E: o P_02 em ago/26 ainda em rascunho → o cenário de agosto mostra "fechamento de 08/26 aberto"
  // MAPA-PAINEL-COMPACTO-01: o P_01 vedado em mar/26 (o histórico marca o mês como vedado)
  const vedadoNoMes = i === 0 && m === '2026-03';
  // MAPA-ATIVIDADE-LAVOURA-01: o P5A vira LAVOURA em set/26 (fechamento sem animais, uso do mês 'agricultura')
  const lavouraNoMes = i === 10 && m === '2026-09';
  FECHAMENTOS.push({ id, fazenda_id: 'f1', pasto_id: p.id, ano_mes: m, tipo_uso_mes: lavouraNoMes ? 'agricultura' : vedadoNoMes ? 'vedado' : ATIVIDADE[i], status: i === 1 && m === '2026-08' ? 'rascunho' : 'fechado',
    // MAPA-CARD-LOTE-01: o lote é do CARD (`lote_mes`, como no Fechamento); o P_01 com um nome longo (o "…" com o title no título do painel)
    lote_mes: i === 5 || vedadoNoMes || lavouraNoMes ? null : i === 0 ? 'Lote da recria de inverno 2026' : 'L-12' });
  if (i === 5 || vedadoNoMes || lavouraNoMes) return; // P_06 vedado: fechamento SEM animais (vazio)
  const base = 30 + ((i * 13 + k * 7) % 60);
  // MAPA-PAINEL-COMPACTO-01: uma linha por registro (os Bois em 2 registros = 2 linhas); o lote é o do card (MAPA-CARD-LOTE-01)
  ITENS.push({ id: `${id}-1`, fechamento_id: id, quantidade: base, peso_medio_kg: 260 + ((i * 17 + k * 11) % 160), categoria_id: 'c1' });
  if (i === 0) ITENS.push({ id: `${id}-1b`, fechamento_id: id, quantidade: 9, peso_medio_kg: 300, categoria_id: 'c1' });
  if (i % 2 === 0) ITENS.push({ id: `${id}-2`, fechamento_id: id, quantidade: 12 + (k % 9), peso_medio_kg: 210 + k * 3, categoria_id: 'c2' });
  if (i === 0) ITENS.push({ id: `${id}-3`, fechamento_id: id, quantidade: 8, peso_medio_kg: 420, categoria_id: 'c3' });
  // fix1: o P_01 com 7 categorias (o painel com 6+ não rola a 1366×768)
  if (i === 0) ['c4', 'c5', 'c6', 'c7'].forEach((c, n) => ITENS.push({ id: `${id}-${4 + n}`, fechamento_id: id, quantidade: 5 + n * 3, peso_medio_kg: 180 + n * 40, categoria_id: c }));
}));


// MAPA-02f-b — a infraestrutura sintética (um de cada grupo + um com nome longo) e os bens do Patrimônio da fazenda
const PT = (dx: number, dy: number) => ({ type: 'Point', coordinates: [LON0 + dx * PASSO, LAT0 - dy * PASSO] });
export const INFRA = [
  { id: 'i1', fazenda_id: 'f1', tipo: 'cocho', geometria: PT(0.5, 0.5), nome: 'Cocho do P_01', pasto_id: 'p1', bem_id: 'b1', observacao: 'Coberto',
    /* INFRA-FICHAS-PATR-01: a ficha completa do cocho */
    ficha: { material: 'Concreto', comprimento_m: 12, lados: 2, coberto: true, uso: 'Volumoso / confinamento' }, versao: 1, criado_em: '2026-10-20T10:00:00Z', criado_por: 'u1', ativo: true },
  { id: 'i2', fazenda_id: 'f1', tipo: 'bebedouro', geometria: PT(1.5, 0.5), nome: null, pasto_id: 'p2', bem_id: null, observacao: null,
    /* INFRA-FICHAS-PATR-01: sem bem — o "Criar bem no Patrimônio"; material fora da lista ("Outro…") */
    ficha: { modelo: 'Australiano', material: 'Fibra de vidro reforçada', capacidade_l: 15000, abastecimento: 'Poço' }, versao: 1, criado_em: '2026-10-21T10:00:00Z', criado_por: 'u1', ativo: true },
  { id: 'i3', fazenda_id: 'f1', tipo: 'sede_casa', geometria: PT(3.5, 2.5), nome: 'Sede principal da fazenda com o nome bem longo', pasto_id: null, bem_id: null, observacao: null, versao: 1, criado_em: '2026-10-22T10:00:00Z', criado_por: 'u1', ativo: true },
  { id: 'i4', fazenda_id: 'f1', tipo: 'energia', geometria: PT(2.5, 1.5), nome: 'Transformador', pasto_id: null, bem_id: null, observacao: null, versao: 1, criado_em: '2026-10-23T10:00:00Z', criado_por: 'u1', ativo: true },
  { id: 'i5', fazenda_id: 'f1', tipo: 'bebedouro', geometria: PT(0.5, 1.5), nome: 'Bebedouro 2', pasto_id: null, bem_id: null, observacao: null, versao: 1, criado_em: '2026-10-24T10:00:00Z', criado_por: 'u1', ativo: true },
];
export const BENS = [
  { id: 'b1', codigo: 'INS-1001', descricao: 'Cochos cobertos 2024', situacao: 'em_uso', categoria: { codigo: 'instalacoes' } },
  { id: 'b2', codigo: 'AGU-1002', descricao: 'Rede de bebedouros', situacao: 'em_uso', categoria: { codigo: 'rede_agua' } },
];

/* MAPA-PIQUETES-02 — só com `&piquetes=1`: dois polígonos SEM CLASSIFICAÇÃO (as divisões que viram piquetes), o 1º com o nome mais longo
   (o pior caso do corte), e a prévia sintética da `fn_piquetes_concluir` com área na casa dos milhares (o pior caso da largura). */
export const PIQUETES_SOLTOS = [
  { id: 'gq1', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: 'P_04 Retiro do Córrego Comprido – Divisão A', cor: null,
    geojson: ret(4, 1, PASSO / 2), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gq2', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: 'P_04B', cor: null,
    geojson: ret(4.5, 1, PASSO / 2), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
];
/* MAPA-LISTA-COMPACTA-01: `&praca=1` — uma praça (sem pasto) no MEIO do P_02: o rótulo dela cai em cima do rótulo do pasto (o pasto vence) */
export const PRACA_SOBRE_PASTO = [
  { id: 'gp1', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'praca_alimentacao', nome_original: 'Praça P_02', cor: null,
    geojson: ret(1.47, 0.47, PASSO * 0.06), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gp2', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: null, tipo: 'praca_alimentacao', nome_original: 'Praça P_08', cor: null,
    geojson: ret(1.15, 2.15, PASSO * 0.06), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
];
export function previaDosPiquetes(a: { p_pasto_pai?: string; p_geometrias?: string[]; p_mes?: string }) {
  const pai = PASTOS.find((p) => p.id === a.p_pasto_pai) ?? PASTOS[0];
  const piquetes = PIQUETES_SOLTOS.filter((g) => (a.p_geometrias ?? []).includes(g.id))
    .map((g, i) => ({ geometria_id: g.id, nome: g.nome_original, area_ha: i === 0 ? 9876.54 : 1234.56 }));
  const soma = piquetes.reduce((s, p) => s + p.area_ha, 0);
  return { ok: true, simulado: true, mes: a.p_mes ?? '2026-11-01', pai: { id: pai.id, nome: pai.nome, area_oficial_ha: 9999.99, encerra_em: '2026-10-31' },
    piquetes, soma_ha: soma, dif_ha: Math.round((soma - 9999.99) * 100) / 100, dif_pct: Math.round((soma - 9999.99) / 9999.99 * 1000) / 10,
    grupo: { nome: pai.nome, area_ha: soma }, frase: '' };
}
// MAPA-ATIVIDADE-LAVOURA-01 — a lavoura sintética do P5A: duas variedades na safra que contém set/26 (e uma safra antiga, que não vale)
const SAFRA_2627 = { nome: 'Safra 26/27 Lavoura', data_inicio: '2026-07-01', data_fim: '2027-06-30' };
export const LAVOURA = [
  { pasto_id: 'p11', safra_id: 's2627', cultura: 'amendoim', variedade: 'IAC 503 de ciclo longo', area_plantada_ha: 2.1, data_plantio: '2026-09-12',
    data_colheita_prevista: '2027-01-25', data_colheita_real: null, status: 'plantada', ativo: true, safra: SAFRA_2627, pasto: { fazenda_id: 'f1' } },
  { pasto_id: 'p11', safra_id: 's2627', cultura: 'amendoim', variedade: 'OL3', area_plantada_ha: 0.9, data_plantio: '2026-09-20',
    data_colheita_prevista: '2027-02-10', data_colheita_real: null, status: 'plantada', ativo: true, safra: SAFRA_2627, pasto: { fazenda_id: 'f1' } },
  { pasto_id: 'p11', safra_id: 's2425', cultura: 'soja', variedade: null, area_plantada_ha: 3, data_plantio: '2024-10-01',
    data_colheita_prevista: '2025-02-01', data_colheita_real: '2025-02-10', status: 'colhida', ativo: true,
    safra: { nome: 'Safra 24/25 Lavoura', data_inicio: '2024-07-01', data_fim: '2025-06-30' }, pasto: { fazenda_id: 'f1' } },
];

/* MAPA-PIQUETES-03 — só com `&unidade=1`: um pasto-pai (P_09 Retiro de Cima, encerrado em 31/08/2026) que virou o grupo P_09 (elo
   `pasto_origem_id`) com 2 piquetes desde 09/2026 (P_09A, P_09B — com fechamento em set/26); o contorno é o polígono do pai, as divisões os
   dos piquetes. O mapa mostra UMA unidade "P_09 Retiro de Cima" com a lotação Σ e o painel "2 divisões: … = … ha". */
const PAI_U = { id: 'pu', fazenda_id: 'f1', cliente_id: 'cli', nome: 'P_09 Retiro de Cima', lote_padrao: null, area_produtiva_ha: 40,
  tipo_uso: 'recria', qualidade: null, entra_conciliacao: true, ativo: true, observacoes: 'virou o grupo P_09 Retiro de Cima em 09/2026',
  ordem_exibicao: 20, data_inicio: null, data_fim: '2026-08-31', grupo_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const piqU = (id: string, nome: string, area: number) => ({ ...PAI_U, id, nome, area_produtiva_ha: area, observacoes: 'piquete de P_09 Retiro de Cima',
  data_inicio: '2026-09-01', data_fim: null, grupo_id: 'gu' });
/* caso P6 (Gabriel 01/11 18:28): o pai "P_10 Manga" com o contorno FURADO (a manga) e as 2 divisões SEM polígono — o painel diz "2 divisões sem desenho" */
const PAI_M = { ...PAI_U, id: 'pm', nome: 'P_10 Manga', area_produtiva_ha: 36, observacoes: 'virou o grupo P_10 Manga em 09/2026', ordem_exibicao: 21 };
const piqM = (id: string, nome: string, area: number) => ({ ...PAI_M, id, nome, area_produtiva_ha: area, observacoes: 'piquete de P_10 Manga',
  data_inicio: '2026-09-01', data_fim: null, grupo_id: 'gm' });
/* MAPA-PIQUETES-04: um pasto vigente SEM polígono — o Gestor e a Validação dizem "Pasto sem desenho: P_11 Sem Mapa" (nada some em silêncio) */
const SEM_MAPA = { ...PAI_U, id: 'psm', nome: 'P_11 Sem Mapa', area_produtiva_ha: 12, observacoes: null, ordem_exibicao: 22, data_fim: null };
export const UNIDADE_PASTOS = [PAI_U, piqU('pua', 'P_09A', 21.4), piqU('pub', 'P_09B', 19.2), PAI_M, piqM('pma', 'P_10A', 28.1), piqM('pmb', 'P_10B', 7.6),
  SEM_MAPA];
export const UNIDADE_GRUPOS = [{ id: 'gu', nome: 'P_09 Retiro de Cima', pasto_origem_id: 'pu', ativo: true, fazenda_id: 'f1' },
  { id: 'gm', nome: 'P_10 Manga', pasto_origem_id: 'pm', ativo: true, fazenda_id: 'f1' }];
const furado = () => {
  const x = LON0 + 5 * PASSO; const y = LAT0 - 2 * PASSO; const f = PASSO / 4;
  return { type: 'Polygon', coordinates: [[[x, y], [x + PASSO, y], [x + PASSO, y - PASSO], [x, y - PASSO], [x, y]],
    [[x + f, y - f], [x + f, y - 2 * f], [x + 2 * f, y - 2 * f], [x + 2 * f, y - f], [x + f, y - f]]] };
};
const metade = (dx: number) => {
  const x = LON0 + 4 * PASSO + dx; const y = LAT0 - 2 * PASSO;
  return { type: 'Polygon', coordinates: [[[x, y], [x + PASSO / 2, y], [x + PASSO / 2, y - PASSO], [x, y - PASSO], [x, y]]] };
};
export const UNIDADE_POLIGONOS = [
  { id: 'gu-c', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'pu', tipo: 'pasto', nome_original: 'P_09 Retiro de Cima', cor: null,
    geojson: ret(4, 2), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gu-a', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'pua', tipo: 'pasto', nome_original: 'P_09A', cor: null,
    geojson: metade(0), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gu-b', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'pub', tipo: 'pasto', nome_original: 'P_09B', cor: null,
    geojson: metade(PASSO / 2), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
  { id: 'gm-c', fazenda_id: 'f1', cliente_id: 'cli', pasto_id: 'pm', tipo: 'pasto', nome_original: 'P_10B', cor: null,
    geojson: furado(), created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' },
];
export const UNIDADE_FECHAMENTOS = [
  { id: 'f-pu-2026-08', fazenda_id: 'f1', pasto_id: 'pu', ano_mes: '2026-08', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: null },
  { id: 'f-pua-2026-09', fazenda_id: 'f1', pasto_id: 'pua', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: 'Lote P_09' },
  { id: 'f-pub-2026-09', fazenda_id: 'f1', pasto_id: 'pub', ano_mes: '2026-09', tipo_uso_mes: 'vedado', status: 'fechado', lote_mes: null },
  { id: 'f-pm-2026-08', fazenda_id: 'f1', pasto_id: 'pm', ano_mes: '2026-08', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: null },
  { id: 'f-pma-2026-09', fazenda_id: 'f1', pasto_id: 'pma', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: 'Lote P_10' },
  /* MAPA-CARD-LOTE-01: a outra divisão do P_10 Manga com OUTRO lote (longo) — a unidade lista os lotes das divisões ("Lotes: A · B" e a
     coluna Lote na tabela, com o "…" e o title) */
  { id: 'f-pmb-2026-09', fazenda_id: 'f1', pasto_id: 'pmb', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: 'Lote da recria de inverno 2026' },
];
export const UNIDADE_ITENS = [
  { id: 'i-pu-1', fechamento_id: 'f-pu-2026-08', quantidade: 90, peso_medio_kg: 360, categoria_id: 'c1' },
  { id: 'i-pua-1', fechamento_id: 'f-pua-2026-09', quantidade: 95, peso_medio_kg: 372, categoria_id: 'c1' },
  { id: 'i-pm-1', fechamento_id: 'f-pm-2026-08', quantidade: 70, peso_medio_kg: 350, categoria_id: 'c1' },
  { id: 'i-pma-1', fechamento_id: 'f-pma-2026-09', quantidade: 72, peso_medio_kg: 361, categoria_id: 'c1' },
  { id: 'i-pmb-1', fechamento_id: 'f-pmb-2026-09', quantidade: 9, peso_medio_kg: 300, categoria_id: 'c2' },
];

/* MAPA-CARTOES-LARGURA-01 — os cartões de cima com números de verdade grandes (`&cartoes=ursa` | `&cartoes=pior`): em set/26 só o P_01
   tem área e animais (os outros pastos ficam com área 0 e fechamento sem animais), para o resumo da fazenda dar exatamente:
   - ursa (o caso do Gabriel, Ursa Maior 02/11): 1.000 cab. · 402 kg · 2,33 UA/ha · 1.047 kg/ha · 383,8 ha;
   - pior (o pior caso fictício): 99.999 cab. · 9.999 kg · 22,22 UA/ha (mesma largura de "99,99" em algarismos tabulares) · 9.999 kg/ha ·
     99.999,9 ha. */
export function dadosDosCartoes(caso: string | null) {
  const numeros = caso === 'pior' ? { area: 99999.9, cab: 99999, peso: 9999 } : caso === 'ursa' ? { area: 383.8, cab: 1000, peso: 401.84 } : null;
  if (!numeros) return { pastos: PASTOS, itens: ITENS };
  const pastos = PASTOS.map(p => ({ ...p, area_produtiva_ha: p.id === 'p1' ? numeros.area : 0 }));
  const doMes = new Set(FECHAMENTOS.filter(f => f.ano_mes === '2026-09').map(f => f.id));
  const itens = [...ITENS.filter(i => !doMes.has(i.fechamento_id)),
    { id: 'f-p1-2026-09-cartoes', fechamento_id: 'f-p1-2026-09', quantidade: numeros.cab, peso_medio_kg: numeros.peso, categoria_id: 'c1' }];
  return { pastos, itens };
}
