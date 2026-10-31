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
  tipo_uso: 'recria', qualidade: null, entra_conciliacao: true, ativo: true, observacoes: i === 0 ? 'Bebedouro novo instalado em ago/26.' : null,
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
export const FECHAMENTOS: { id: string; fazenda_id: string; pasto_id: string; ano_mes: string; tipo_uso_mes: string; status: string }[] = [];
export const ITENS: { id: string; fechamento_id: string; quantidade: number; peso_medio_kg: number; categoria_id: string }[] = [];
PASTOS.forEach((p, i) => MESES.forEach((m, k) => {
  if (i === 2 && m === '2026-09') return; // P_03 sem fechamento em set/26: "—" e "último fechamento 08/26"
  if (i === 7 && k % 4 === 1) return;      // P_08 com meses sem fechamento no histórico
  const id = `f-${p.id}-${m}`;
  // fix1 E: o P_02 em ago/26 ainda em rascunho → o cenário de agosto mostra "fechamento de 08/26 aberto"
  FECHAMENTOS.push({ id, fazenda_id: 'f1', pasto_id: p.id, ano_mes: m, tipo_uso_mes: ATIVIDADE[i], status: i === 1 && m === '2026-08' ? 'rascunho' : 'fechado' });
  if (i === 5) return;                     // P_06 vedado: fechamento SEM animais (vazio)
  const base = 30 + ((i * 13 + k * 7) % 60);
  ITENS.push({ id: `${id}-1`, fechamento_id: id, quantidade: base, peso_medio_kg: 260 + ((i * 17 + k * 11) % 160), categoria_id: 'c1' });
  if (i % 2 === 0) ITENS.push({ id: `${id}-2`, fechamento_id: id, quantidade: 12 + (k % 9), peso_medio_kg: 210 + k * 3, categoria_id: 'c2' });
  if (i === 0) ITENS.push({ id: `${id}-3`, fechamento_id: id, quantidade: 8, peso_medio_kg: 420, categoria_id: 'c3' });
  // fix1: o P_01 com 7 categorias (o painel com 6+ não rola a 1366×768)
  if (i === 0) ['c4', 'c5', 'c6', 'c7'].forEach((c, n) => ITENS.push({ id: `${id}-${4 + n}`, fechamento_id: id, quantidade: 5 + n * 3, peso_medio_kg: 180 + n * 40, categoria_id: c }));
}));

