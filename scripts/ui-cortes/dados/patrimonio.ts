/**
 * PATR-01 · PR B — Patrimônio na bancada do `check:ui-cortes` / `check:ui-desloca`: a API em memória (a mesma porta injetável da tela,
 * `PatrimonioApiProvider`), com dado SINTÉTICO — os bens do mock v4 e um pior caso (descrição longa, valor no teto). Nada fala com o banco.
 */
import type { PatrimonioApi, FormBem, LancamentoDoBem, Resultado } from '@/lib/patrimonio/patrimonioApi';
import type { BemDaLista, CategoriaBem } from '@/lib/patrimonio/patrimonio';

export const FAZENDAS_PATRIMONIO = [{ id: 'fPUR', nome: 'Faz. Pureza', codigo: 'PUR', cliente_id: 'cli' }, { id: 'fRET', nome: 'Faz. Retiro', codigo: 'RET', cliente_id: 'cli' }];

const CAT: CategoriaBem[] = [
  ['maquinas', 'Máquinas', 10, 20, true, 'bem', false], ['implementos', 'Implementos', 10, 10, true, 'bem', false], ['veiculos', 'Veículos', 5, 30, true, 'bem', false],
  ['equipamentos_informatica', 'Equipamentos e informática', 5, 0, false, null, false], ['benfeitorias', 'Benfeitorias', 25, 0, true, 'bem', false],
  ['instalacoes', 'Instalações', 20, 0, true, 'bem', false], ['rede_agua', 'Rede de água e bebedouros', 15, 0, false, null, false], ['cercas', 'Cercas', 10, 0, false, null, false],
  ['estradas_aceiros', 'Estradas e aceiros', 10, 0, false, null, false], ['pastagens', 'Pastagens', 5, 0, false, null, true], ['formacao_area', 'Formação de área agrícola', 5, 0, false, null, false],
  ['correcao_solo', 'Correção de solo', 3, 0, false, null, false], ['terra', 'Terra', null, 0, true, 'terra', false],
].map(([codigo, nome, vida, res, merc, base, past], i) => ({ id: `c-${codigo}`, cliente_id: null, codigo: String(codigo), nome: String(nome), vida_util_anos: vida == null ? null : Number(vida),
  residual_pct: Number(res), deprecia: vida != null, tem_mercado: !!merc, base_mercado: base === 'terra' ? 'terra' : base === 'bem' ? 'bem' : null, tem_pastos: !!past, ordem: (i + 1) * 10, ativo: true }));
const cat = (c: string) => CAT.find(x => x.codigo === c)!;

const POS = '2026-10-31';
function calc(valor: number, vidaAnos: number | null, res: number, desde: string | null, emUso: boolean) {
  if (!vidaAnos || !emUso || !desde) return { da: 0, ano: 0 };
  const [y, m] = desde.split('-').map(Number); const dep = valor * (1 - res / 100); const vida = vidaAnos * 12;
  const meses = Math.min(vida, Math.max(0, (2026 - y) * 12 + (10 - m) + 1)); const antes = Math.min(vida, Math.max(0, (2026 - y) * 12 + (1 - m)));
  const da = Math.round(dep * meses / vida * 100) / 100; const daAntes = Math.round(dep * antes / vida * 100) / 100;
  return { da, ano: Math.round((da - daAntes) * 100) / 100 };
}
const B = (id: string, descricao: string, c: string, faz: 'PUR' | 'RET', sit: 'em_uso' | 'em_formacao', desde: string | null, valor: number, mk: number | null, nl: number, origem: 'lancamentos' | 'sem_lancamento' = 'lancamentos'): BemDaLista => {
  const k = cat(c); const r = calc(valor, k.vida_util_anos, k.residual_pct, desde, sit === 'em_uso');
  return { bem_id: id, fazenda_id: `f${faz}`, fazenda_codigo: faz, categoria_id: k.id, categoria_codigo: k.codigo, categoria_nome: k.nome, deprecia: k.deprecia,
    tem_mercado: k.tem_mercado, tem_pastos: k.tem_pastos, descricao, marca: null, modelo: null, identificacao: null, situacao: sit, em_uso_desde: sit === 'em_uso' ? desde : null,
    baixado_em: null, atividade: 'pecuaria', origem_valor: origem, valor_extra: origem === 'sem_lancamento' ? valor : 0, valor_lancamentos: origem === 'sem_lancamento' ? 0 : valor,
    aquisicao: valor, a_realizar: 0, n_lancamentos: nl, n_a_realizar: 0, n_a_conferir: 0, n_selo: 0, n_repetidas: 0, primeira_data: nl ? desde : null,
    vida_util_meses: k.vida_util_anos ? k.vida_util_anos * 12 : null, residual_pct: k.residual_pct, depreciacao_acumulada: r.da, depreciacao_no_ano: r.ano,
    valor_contabil: Math.round((valor - r.da) * 100) / 100, mercado_valor: mk, mercado_data: mk ? '2026-06-30' : null, mercado_base: mk ? (c === 'terra' ? 'terra_nua' : 'bem') : null,
    area_pastos_ha: c === 'pastagens' && id === 'past' ? 120 : null, versao: 1 };
};
const BENS: BemDaLista[] = [
  B('mq', 'Trator Valtra A950 4x4', 'maquinas', 'PUR', 'em_uso', '2022-03-15', 388400, 330000, 3),
  B('gr', 'Grade aradora 16 discos 32"', 'implementos', 'PUR', 'em_uso', '2023-08-02', 48500, null, 1),
  B('hi', 'Caminhonete Hilux CD 2.8', 'veiculos', 'RET', 'em_uso', '2024-01-10', 289900, 215000, 2),
  B('cu', 'Curral de manejo com balança', 'instalacoes', 'RET', 'em_uso', '2021-05-20', 142300, null, 23),
  B('ce', 'Cerca divisa 4,2 km — 5 fios', 'cercas', 'PUR', 'em_uso', '2024-09-05', 67200, null, 14),
  B('ba', 'Barracão de máquinas 600 m²', 'benfeitorias', 'PUR', 'em_uso', '2020-11-18', 210000, null, 0, 'sem_lancamento'),
  B('past', 'Reforma de pastagem — 6 pastos', 'pastagens', 'RET', 'em_uso', '2025-02-14', 156000, null, 5),
  B('fp', 'Formação de pasto — Retiro novo', 'pastagens', 'RET', 'em_formacao', '2026-04-03', 94600, null, 28),
  B('terra', 'Terra nua 850 ha', 'terra', 'PUR', 'em_uso', '2019-06-01', 6800000, 24650000, 0, 'sem_lancamento'),
  B('be', 'Bebedouros e rede hidráulica', 'rede_agua', 'RET', 'em_uso', '2025-07-22', 38700, null, 6),
  /* o pior caso do corte: a descrição mais longa (corta com "…" e o `title`) e os valores no teto */
  B('lg', 'Pivô central de irrigação com adutora, casa de bombas, quadro elétrico e 1.200 m de linha enterrada — área do Retiro', 'equipamentos_informatica', 'RET', 'em_uso', '2023-02-01', 99999999.99, null, 999),
];
const L = (id: string, comp: string, pg: string, desc: string, forn: string, sub: string, faz: string, nf: string, v: number): LancamentoDoBem => ({ vinculo_id: `v${id}`, lancamento_id: id, parte_ordem: 1,
  partes_total: 1, estado: 'soma', motivo: null, selo: null, valor: v, data: comp, data_pagamento: pg, numero_documento: nf, status_transacao: 'realizado', descricao: desc,
  fornecedor: forn, subcentro: sub, fazenda_id: faz, repetida: false, de_contrato: false });
const LANC: Record<string, LancamentoDoBem[]> = {
  mq: [L('l1', '2022-03-10', '2022-03-10', 'Trator Valtra A950 — entrada', 'Valtra Revenda MS', 'Investimento Máquinas e Equip. Pecuária', 'fPUR', '000.012.334', 120000),
       L('l2', '2022-03-15', '2022-04-15', 'Trator Valtra A950 — FINAME parcela única', 'Banco do Brasil', 'Investimento Máquinas e Equip. Pecuária', 'fPUR', '000.012.334', 250000),
       L('l3', '2022-03-20', '2022-03-25', 'Frete e entrega técnica', 'Transportes Rio Verde', 'Investimento Máquinas e Equip. Pecuária', 'fPUR', '000.000.981', 18400)],
  past: [L('p1', '2025-01-20', '2025-01-20', 'Calcário dolomítico 240 t', 'Calcário Bonito Ltda', 'Investimento Formação Pasto Pecuária', 'fRET', '000.004.512', 38400),
         L('p2', '2025-01-28', '2025-01-28', 'Gradagem pesada 120 ha — empreita', 'Serviços Agrícolas Ramos', 'Investimento Formação Pasto Pecuária', 'fRET', '000.000.877', 42000),
         L('p3', '2025-02-05', '2025-02-05', 'Semente Marandu VC 80% — 1.440 kg', 'Sementes Oeste', 'Investimento Formação Pasto Pecuária', 'fRET', '000.019.230', 31680),
         L('p4', '2025-02-12', '2025-02-12', 'Plantio e incorporação — empreita', 'Serviços Agrícolas Ramos', 'Investimento Formação Pasto Pecuária', 'fRET', '000.000.891', 24000),
         L('p5', '2025-02-14', '2025-02-14', 'Adubo NPK 04-30-10 — 12 t', 'Agro Insumos MS', 'Investimento Formação Pasto Pecuária', 'fRET', '000.031.004', 19920)],
};
const PASTOS = [['Piquete 07', 22.5], ['Piquete 08', 18], ['Piquete 09', 21.3], ['Piquete 10', 19.7], ['Piquete 11', 20.5], ['Piquete 12', 18], ['Piquete 13', 24], ['Mangueira', 6.2]]
  .map(([n, a], i) => ({ id: `pa${i}`, nome: String(n), fazenda_id: 'fRET', area_produtiva_ha: Number(a), ativo: true }));
const form = (b: BemDaLista): FormBem => ({ id: b.bem_id, versao: 1, cliente_id: 'cli', fazenda_id: b.fazenda_id, categoria_id: b.categoria_id, descricao: b.descricao,
  marca: b.bem_id === 'mq' ? 'Valtra' : '', modelo: b.bem_id === 'mq' ? 'A950' : '', ano_fabricacao: b.bem_id === 'mq' ? 2022 : null, identificacao: b.bem_id === 'mq' ? 'A950P22-11873' : '',
  observacao: b.bem_id === 'mq' ? 'trator principal da lavoura e da manutenção de pastos' : b.bem_id === 'past' ? 'gradagem, calagem e plantio de Marandu em fev/2025' : '',
  situacao: b.situacao, em_uso_desde: b.em_uso_desde ?? '', atividade: b.bem_id === 'terra' ? 'compartilhado' : 'pecuaria', financiamento_id: null, origem_valor: b.origem_valor,
  valor_sem_lancamento: b.origem_valor === 'sem_lancamento' ? b.aquisicao : null, estimativa_rs_ha: null, estimativa_area_ha: null, area_ha: b.bem_id === 'terra' ? 850 : null,
  matricula: b.bem_id === 'terra' ? '12.447' : '', nirf: b.bem_id === 'terra' ? '7.123.456-0' : '', seguradora: b.bem_id === 'mq' ? 'Porto Seguro' : '', apolice: b.bem_id === 'mq' ? '7712004' : '',
  seguro_vence_em: b.bem_id === 'mq' ? '2027-03-14' : '', vida_util_meses: b.vida_util_meses, residual_pct: b.residual_pct });
function serie(b: BemDaLista, ate: string) {
  if (!b.vida_util_meses || !b.em_uso_desde || b.situacao !== 'em_uso') return [];
  const [y, m] = b.em_uso_desde.split('-').map(Number); const dep = b.aquisicao * (1 - (b.residual_pct ?? 0) / 100); const out = [];
  let prev = 0;
  for (let k = 0; ; k++) { const tot = (y * 12 + m - 1) + k; const per = `${Math.floor(tot / 12)}-${String(tot % 12 + 1).padStart(2, '0')}`; if (per > ate.slice(0, 7)) break;
    const ac = Math.round(dep * Math.min(k + 1, b.vida_util_meses) / b.vida_util_meses * 100) / 100; out.push({ periodo: per, base: b.aquisicao, quota: Math.round((ac - prev) * 100) / 100, acumulada: ac, contabil: Math.round((b.aquisicao - ac) * 100) / 100, vida_util_meses: b.vida_util_meses, residual_pct: b.residual_pct }); prev = ac; }
  return out;
}
const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
export const API_PATRIMONIO: PatrimonioApi = {
  categorias: async () => CAT,
  lista: async (_c, faz) => ok(BENS.filter(b => !faz || b.fazenda_id === faz)),
  semBemResumo: async () => ({ n: 187, valor: 677851.6 }),
  itensSemBem: async () => [1, 2, 3, 4, 5, 6].map(i => ({ lancamento_id: `s${i}`, parte_ordem: 1, data: `2026-0${i}-1${i}`, valor: 1000 * i + 0.5, descricao: `Arame liso 700 m — lote ${i}`,
    fornecedor: 'Agropecuária Cerqueira', subcentro: 'Investimento em Cercas Pecuária', fazenda_codigo: 'PUR', repetida: i === 3, de_contrato: false, a_realizar: false })),
  lancamentosDoBem: async id => LANC[id] ?? [],
  pastosDaFazenda: async () => PASTOS,
  pastosDoBem: async id => (id === 'past' ? PASTOS.slice(0, 6).map(p => ({ pasto_id: p.id, area_ha: p.area_produtiva_ha! })) : []),
  serie: async (_c, id, ate) => serie(BENS.find(b => b.bem_id === id)!, ate),
  avaliacoes: async id => id === 'terra' ? [{ id: 'a1', data: '2026-06-30', fonte: 'Laudo Consultoria Campo Grande', base: 'terra_formada', valor_ha: 29000, area_ha: 850, valor_total: 24650000 },
    { id: 'a2', data: '2025-12-31', fonte: 'ITR 2025 — VTN', base: 'terra_nua', valor_ha: 14500, area_ha: 850, valor_total: 12325000 }]
    : id === 'mq' ? [{ id: 'a3', data: '2026-06-30', fonte: 'Revenda Valtra — tabela usados', base: 'bem', valor_ha: null, area_ha: null, valor_total: 330000 }] : [],
  documentos: async id => id === 'mq' || id === 'past' ? [{ id: 'd1', especie: 'nota_fiscal', nome: 'NF trator Valtra A950.pdf', storage_path: 'x', tamanho_bytes: 184320, criado_em: '2022-03-15T10:00:00' },
    { id: 'd2', especie: 'seguro', nome: 'Apólice Porto Seguro 7712004.pdf', storage_path: 'x', tamanho_bytes: 412000, criado_em: '2026-03-14T10:00:00' }] : [],
  cadastroDoBem: async id => form(BENS.find(b => b.bem_id === id)!),
  salvarBem: async () => ok({ ok: true }), mudarParametros: async () => ok({ quota_antes: 2589.33, quota_depois: 3540.12 }),
  ligar: async () => ok({ ok: true, soma: 0, n_ligar: 0, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [] }),
  desligar: async () => ok({}), salvarPastos: async () => ok({}), salvarAvaliacao: async () => ok({}), cancelarAvaliacao: async () => ok({}),
  enviarDocumento: async () => null, removerDocumento: async () => ok({}), urlDoDocumento: async () => null,
};

