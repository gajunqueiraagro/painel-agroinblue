/**
 * O que este teste trava — o RELATÓRIO DA MANDIOCA NÃO FALA DE SACA.
 *
 * ⚠ ELE NASCE DE UM PRINT, não de zelo: em 16/09 o "Relatório de Colheita" da mandioca saiu com
 * Peso verde, Sacas boas, Grão de roça, Ticket, Verde/Seco/Umid./Afla/Sacas/Roça — e com 42 linhas
 * para as 21 cargas do backfill. Tudo de amendoim, num papel que vai para a indústria.
 * ⚠ E O CHECK DO BRIEFING É SOBRE O TEXTO DO DOCUMENTO ("nenhuma palavra saca, afla, secagem,
 * roça"). Aqui ele vira gate: a planilha é inspecionável célula a célula, então é sobre ela que a
 * asserção roda — os cabeçalhos das colunas, os nomes das abas e o conteúdo.
 * ⚠ UMA LINHA POR CARGA, e o caso trava isso também: 21 cargas viram 21 linhas mais o TOTAL, nunca
 * 42. É o mesmo agrupamento pelo lançamento de venda que a tela usa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ⚠ O DOWNLOAD É MOCKADO, não o módulo inteiro: o que se quer inspecionar é exatamente o payload
   que ele receberia. Mockar `exportarEntregaDiretaXlsx` provaria que o teste chama o teste. */
const enviado = vi.fn();
vi.mock('@/lib/xlsxDownload', () => ({
  triggerXlsxDownload: (p: unknown) => enviado(p),
}));

import { exportarEntregaDiretaXlsx } from '@/lib/agri/exportEntregaDireta';
import type { CargaAgrupada } from '@/components/agri/CargasEntregaDireta';
import type { EntregaDireta } from '@/hooks/usePainelSafra';
import type { ColheitaRow } from '@/hooks/useColheita';

const colheita = (id: string, nf: string): ColheitaRow => ({
  id, safra_area_id: 'a1', data_colheita: '2026-08-24',
  hora_chegada: null, peso_fazenda_kg: null, peso_bruto_kg: null, ticket_balanca: null, nf_produtor: nf,
  filial: null, local_estoque_id: null, peso_verde_kg: null, peso_seco_kg: null,
  umidade_pct: null, aflatoxina_ppb: null, sacas_boas: null, grao_roca_sacas: null,
  grao_roca_kg: null, renda_liquida_pct: null, taxa_secagem: null, valor_secagem: null,
  observacoes: null, toneladas: 21.1, desconto_kg: 0, rendimento_g: 495, preco_g: 1.05,
  industria_id: 'ind-1',
});

/** 21 cargas, como o NJ 25/26 — o número que o print errou. */
const CARGAS: CargaAgrupada[] = Array.from({ length: 21 }, (_, i) => ({
  chave: `venda:L${i}`,
  ids: [`c${i}a`, `c${i}b`],
  principal: colheita(`c${i}a`, `93${String(i).padStart(5, '0')}`),
  faz: 'NJ',
  talhao: 'IND.05 · IND.06',
  comprador: 'T Cortez Fraga Lopes Ltda',
  toneladas: 21.1,
  rendimento_g: 495,
  preco_g: 1.05,
  valor: 10966.73,
  status: 'programado',
  contaId: 'CONTA-1',
}));

const ENTREGA: EntregaDireta = {
  toneladas_bruto: 462.1, desconto_t: 4.54, toneladas: 457.56,
  rendimento_medio_g: 490,
  receita_bruta: 235625.56, deducoes: 12000, a_receber: 100000,
  preco_t: 514.96, servicos_total: 150994.8, servicos_t: 330,
  cargas: 21,
  por_nf: [
    { nf: '9287581', data: '2026-08-21', cargas: 2, toneladas: 40.34, rendimento_g: 486, valor: 20000, comprador: 'Ind. e Com. de Fecula Olinda Ltda' },
    { nf: '9294773', data: '2026-08-24', cargas: 2, toneladas: 40.06, rendimento_g: 507, valor: 21000, comprador: 'T Cortez Fraga Lopes Ltda' },
  ],
  rendimento_min: { g: 469, data: '2026-08-28', nf: '9310349' },
  rendimento_max: { g: 508, data: '2026-08-24', nf: '9294773' },
};

const CTX = {
  cliente: 'NJ', safra: '25/26-Lav', cultura: 'mandioca',
  talhao: 'Todos os talhões', areaHa: 49.79, comAnalise: true,
};

interface Payload {
  filename: string;
  sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>;
}

const pegar = (): Payload => enviado.mock.calls[0][0] as Payload;

beforeEach(() => enviado.mockClear());

describe('o relatório da entrega direta', () => {
  it('não usa uma palavra do vocabulário da saca', () => {
    exportarEntregaDiretaXlsx(CARGAS, ENTREGA, CTX, 9.19);
    const p = pegar();
    /* Todo texto do documento: nome do arquivo, abas, cabeçalhos de coluna e conteúdo. */
    const textos: string[] = [p.filename];
    for (const aba of p.sheets) {
      textos.push(aba.name);
      for (const linha of aba.rows) {
        textos.push(...Object.keys(linha));
        for (const v of Object.values(linha)) if (typeof v === 'string') textos.push(v);
      }
    }
    const tudo = textos.join(' | ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    /* ⚠ AS QUATRO DO §CHECKS, sem acento (o texto foi normalizado): "roca" pega "roça". */
    for (const proibida of ['saca', 'afla', 'secagem', 'roca']) {
      expect(tudo.includes(proibida), `"${proibida}" apareceu no documento da mandioca`).toBe(false);
    }
    /* ⚠ E A PROVA DE QUE A BUSCA SABE ACHAR — sem ela, um payload vazio passaria verde. A lição
       do auto-teste do `check:tdz`, repetida: "não achei" só vale quando a busca funciona. */
    expect(tudo.includes('rendimento')).toBe(true);
    expect(tudo.includes('comprador')).toBe(true);
  });

  it('gera UMA linha por carga — 21, não 42 — mais o total', () => {
    exportarEntregaDiretaXlsx(CARGAS, ENTREGA, CTX, 9.19);
    const cargas = pegar().sheets.find(s => s.name === 'Cargas');
    expect(cargas?.rows).toHaveLength(22);
    expect(cargas?.rows.at(-1)?.Faz).toBe('TOTAL');
    /* ⚠ O TOTAL É O DA RPC, não a soma das 21 linhas do fixture (que daria 443,10): o papel e a
       tela têm de dizer a MESMA tonelada. */
    expect(cargas?.rows.at(-1)?.['Peso líq. (t)']).toBe(457.56);
    expect(cargas?.rows.at(-1)?.['Rendimento (g)']).toBe(490);
  });

  it('a aba "Por nota" traz o comprador e fecha com o total da RPC', () => {
    exportarEntregaDiretaXlsx(CARGAS, ENTREGA, CTX, 9.19);
    const nota = pegar().sheets.find(s => s.name === 'Por nota');
    expect(nota?.rows).toHaveLength(3);
    expect(nota?.rows[0]?.Comprador).toBe('Ind. e Com. de Fecula Olinda Ltda');
    expect(nota?.rows[1]?.Comprador).toBe('T Cortez Fraga Lopes Ltda');
    expect(nota?.rows.at(-1)?.['Valor (R$)']).toBe(235625.56);
  });

  it('todo número vai como número, para o operador somar na planilha', () => {
    exportarEntregaDiretaXlsx(CARGAS, ENTREGA, CTX, 9.19);
    const primeira = pegar().sheets.find(s => s.name === 'Cargas')?.rows[0];
    /* ⚠ A METADE DA REGRA EXPORT QUE ESTE ARQUIVO CUMPRE. A outra — data como `Date` — não é
       possível hoje: `XlsxCellValue` é `string | number | boolean | null` e o exportador é
       compartilhado por toda a casa. Está reportado. */
    for (const col of ['Peso líq. (t)', 'Rendimento (g)', 'Preço (R$/g)', 'Valor (R$)']) {
      expect(typeof primeira?.[col], col).toBe('number');
    }
    expect(primeira?.Data).toBe('24/08/2026');
  });
});
