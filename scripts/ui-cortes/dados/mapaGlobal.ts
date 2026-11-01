/* MAPA-GLOBAL-01 — o Geo Pastos em Global na bancada: dados SINTÉTICOS (nenhum dado de cliente). `n=2` (duas fazendas) ou `n=5` (cinco,
 * com o nome mais longo, uma SEM FECHAMENTO no mês e uma SEM MAPA). Cada fazenda é uma grade de pastos quadrados; fechamentos de
 * out/2025 a set/2026 com lotação variada (carga alta, sublotado, ideal, vazio, sem fechamento) e um pasto vigente SEM polígono com
 * cabeças (o aviso "N cab em pastos sem mapa"). */
const PASSO = 0.0062;

interface DefFazenda { id: string; codigo: string; nome: string; colunas: number; linhas: number; semFechamentoNoMes?: boolean; semMapa?: boolean }

const CINCO: DefFazenda[] = [
  { id: 'fa', codigo: '3M', nome: 'Faz. 3 Muchachas', colunas: 4, linhas: 4 },
  { id: 'fb', codigo: 'BG', nome: 'Faz Baia Grande', colunas: 5, linhas: 3 },
  { id: 'fc', codigo: 'SJR', nome: 'Fazenda São João do Retiro das Palmeiras', colunas: 3, linhas: 3 },
  { id: 'fd', codigo: 'NV', nome: 'Faz. Nova Vista', colunas: 3, linhas: 2, semFechamentoNoMes: true },
  { id: 'fe', codigo: 'PZ', nome: 'Faz. Pureza', colunas: 2, linhas: 2, semMapa: true },
];

const MESES = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const ATIV = ['recria', 'cria', 'engorda', 'recria', 'vedado'];

export function mapaGlobal(n: number) {
  const defs = n >= 5 ? CINCO : CINCO.slice(0, 2);
  const FAZENDAS = defs.map(d => ({ id: d.id, nome: d.nome, codigo: d.codigo, cliente_id: 'cli', tem_pecuaria: true }));
  const PASTOS: Record<string, unknown>[] = [];
  const GEOMETRIAS: Record<string, unknown>[] = [];
  const FECHAMENTOS: { id: string; fazenda_id: string; pasto_id: string; ano_mes: string; tipo_uso_mes: string; status: string }[] = [];
  const ITENS: { id: string; fechamento_id: string; quantidade: number; peso_medio_kg: number; categoria_id: string }[] = [];
  defs.forEach((d, fi) => {
    const lon0 = -54.03 + fi * 0.06; const lat0 = -19.63;
    let k = 0;
    for (let l = 0; l < d.linhas; l++) for (let c = 0; c < d.colunas; c++) {
      k++;
      const id = `${d.id}-p${k}`;
      const area = 30 + ((fi * 7 + k * 11) % 35);
      PASTOS.push({ id, fazenda_id: d.id, cliente_id: 'cli', nome: `P_${String(k).padStart(2, '0')}`, lote_padrao: null, area_produtiva_ha: area,
        tipo_uso: 'recria', qualidade: null, entra_conciliacao: true, ativo: true, observacoes: null, ordem_exibicao: k, data_inicio: null, data_fim: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
      if (!d.semMapa) {
        const x = lon0 + c * PASSO; const y = lat0 - l * PASSO;
        GEOMETRIAS.push({ id: `g-${id}`, fazenda_id: d.id, cliente_id: 'cli', pasto_id: id, tipo: 'pasto', nome_original: `P_${k}`, cor: null,
          geojson: { type: 'Polygon', coordinates: [[[x, y], [x + PASSO, y], [x + PASSO, y - PASSO], [x, y - PASSO], [x, y]]] },
          created_at: '2026-03-31T10:00:00Z', updated_at: '2026-03-31T10:00:00Z' });
      }
      MESES.forEach((m, mi) => {
        if (d.semFechamentoNoMes && m === '2026-09') return;
        if (k === 3 && m === '2026-09') return; // um pasto sem fechamento no mês em cada fazenda
        const fid = `f-${id}-${m}`;
        const atv = ATIV[(k + fi) % ATIV.length];
        FECHAMENTOS.push({ id: fid, fazenda_id: d.id, pasto_id: id, ano_mes: m, tipo_uso_mes: atv, status: 'fechado' });
        if (atv === 'vedado') return; // vazio
        const lot = 180 + ((fi * 53 + k * 97 + mi * 31) % 520); // de 180 a 700 kg/ha: as três faixas
        const peso = 260 + ((k * 17 + mi * 13) % 160);
        ITENS.push({ id: `${fid}-1`, fechamento_id: fid, quantidade: Math.max(1, Math.round((lot * area) / peso)), peso_medio_kg: peso, categoria_id: 'c1' });
      });
    }
    // o pasto vigente SEM polígono, com cabeças no mês (o aviso), só na 1ª fazenda
    if (fi === 0) {
      const id = `${d.id}-div`;
      PASTOS.push({ id, fazenda_id: d.id, cliente_id: 'cli', nome: 'Divergência do campeiro', lote_padrao: null, area_produtiva_ha: 0, tipo_uso: 'recria',
        qualidade: null, entra_conciliacao: true, ativo: true, observacoes: null, ordem_exibicao: 99, data_inicio: null, data_fim: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
      FECHAMENTOS.push({ id: `f-${id}`, fazenda_id: d.id, pasto_id: id, ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado' });
      ITENS.push({ id: `f-${id}-1`, fechamento_id: `f-${id}`, quantidade: 66, peso_medio_kg: 300, categoria_id: 'c1' });
    }
  });
  return { FAZENDAS, PASTOS, GEOMETRIAS, FECHAMENTOS, ITENS, CATEGORIAS: [{ id: 'c1', codigo: 'bois', nome: 'Bois', ordem_exibicao: 1, cliente_id: 'cli' }] };
}
