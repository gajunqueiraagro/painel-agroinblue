/**
 * OC-HOSPEDEIRO-LEVE-01 — a pagina de medida do `scripts/medir-hospedeiro-oc.mjs` (fora do `telas.tsx`: ela alcanca o `V2Index` inteiro,
 * e no `telas.tsx` o gate rapido passaria a medir esta tela para quase todo arquivo). A tela PROPRIA da OC — o hospedeiro REAL,
 * `V2LancamentosWrapper somenteOperacao` — abrindo uma OC existente pela URL (`?oc_<tipo>=1&oc_id=`), como a lista de OCs, o lancamento
 * e a conciliacao abrem. `?v=compra|venda|abate` (padrao compra). O rebanho da fazenda tem o volume da maior do proto (1.633 lancamentos,
 * SINTETICOS). Os pedidos ao banco ficam em `__pedidosBancada` (mocks/supabase.ts); `__inicioBancada` marca o render.
 */
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { V2LancamentosWrapper } from '@/v2/V2Index';

const g = globalThis as any;
const v = new URLSearchParams(location.search).get('v');
const TIPO_OC = v === 'venda' || v === 'abate' ? v : 'compra';
const OC_ID = 'a1b2c3d4-0000-4000-8000-000000000000';
const FAZ1 = { id: 'f1', nome: 'Faz. Exemplo', cliente_id: 'cli', tem_pecuaria: true };
g.__fazendaBancada = { fazendas: [FAZ1], fazendasComPecuaria: [FAZ1], fazendaAtual: FAZ1, isGlobal: false, fazendaId: 'f1', setFazendaAtual: () => {}, loading: false };
const REBANHO = Array.from({ length: 1633 }, (_, i) => ({ id: `l${i}`, data: `2026-${String(1 + (i % 9)).padStart(2, '0')}-10`, tipo: 'nascimento',
  quantidade: 1 + (i % 7), categoria: 'bezerros', cenario: 'realizado', status_operacional: 'realizado', fazenda_id: 'f1', cliente_id: 'cli',
  peso_medio_kg: 30, created_by: 'u1', cancelado: false }));
g.__bancoBancada = {
  from: (t: string, e: any) => t === 'zoo_operacoes_comerciais' ? [{ id: OC_ID, cliente_id: 'cli', fazenda_id: 'f1', tipo_operacao: TIPO_OC,
    data_operacao: '2026-09-15', versao: 3, status_comercial: 'rascunho', rascunho: true, cenario: 'realizado', contraparte_id: null,
    observacoes: null, numero_documento: null, entrega_encerrada: false }]
    : t === 'lancamentos' ? (e.eq.cenario === 'meta' ? [] : REBANHO) : [],
  rpc: (fn: string) => fn === 'get_status_pilares_fechamento' ? { p1_mapa_pastos: { status: 'aberto' }, p2_valor_rebanho: { status: 'aberto' } } : null };
g.__pedidosBancada = [];
g.__inicioBancada = performance.now();
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/v2?oc_${TIPO_OC}=1&oc_id=${OC_ID}`]}>
    <V2LancamentosWrapper somenteOperacao cenariosPermitidos={['realizado']} onFecharOperacaoOC={() => { g.__ocFechou = true; }} />
  </MemoryRouter></QueryClientProvider>);
