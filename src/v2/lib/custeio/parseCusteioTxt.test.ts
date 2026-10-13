/**
 * CUSTEIO-TXT-03 — o parser não trata palavra solta como ruído.
 *
 * ⚠ NASCE DE ITEM PERDIDO: o padrão de ruído do cabeçalho de página era a palavra solta, e `ehRuido` roda ANTES de
 * olhar se a linha tem valor — um item cuja descrição começa por essa palavra (a guia de trânsito de animais)
 * sumia do preview, e a sub-família divergia do impresso exatamente no valor dele.
 * ⚠ O TXT É SINTÉTICO, montado aqui no formato do relatório: nenhum nome real de fazenda, fornecedor ou produto.
 */
import { describe, it, expect } from 'vitest';
import { CUSTEIO_FORMAT, parseCusteioTxt } from './parseCusteioTxt';

const CABECALHO_DE_PAGINA = (pagina: number) => [
  'R J',
  'Sistema de Compras',
  `Emissão 06/10/2026 Hr. 14:29:06 Pag. ${pagina}`,
  '------------------------------------------------------------------',
];
const ITEM_DA_GUIA = '                 EMISSAO GUIA - GTA                         110,00';

const TXT = [
  ...CABECALHO_DE_PAGINA(1),
  'Custeio Analítico                 Período: 01/09/2026 a 30/09/2026',
  'Descrição                                             Valor em Real',
  '    Fazenda:     FAZENDA EXEMPLO                          1.692,20',
  '    Família:     ANIMAIS                                    440,00',
  '    Sub-Fam:     Produtos Veterinarios                      440,00',
  '                 VERMIFUGO TESTE 500 ML                     440,00',
  ...CABECALHO_DE_PAGINA(2),
  'Descrição                                             Valor em Real',
  '    Família:     DIVERSOS                                 1.252,20',
  '    Sub-Fam:     Despesas Diversas                        1.252,20',
  '                 MATERIAL DE ESCRITORIO                     642,20',
  ITEM_DA_GUIA,
  '                 TAXA CARTORIO FICTICIO                     500,00',
].join('\r\n');

/* Só os padrões de ruído, sem o resto do parser: é o que diz se a LINHA seria descartada antes de se olhar o valor. */
const ehRuidoPeloFormato = (linha: string) => CUSTEIO_FORMAT.ruidoRegex.some((re) => re.test(linha));

describe('CUSTEIO-TXT-03 — item cuja descrição começa pela palavra do cabeçalho de página', () => {
  const r = parseCusteioTxt(TXT);

  it('(a) a guia de trânsito É item: valor 110, na sub-família e na família certas', () => {
    const guia = r.itens.find((i) => i.produto_raw === 'EMISSAO GUIA - GTA');
    expect(guia).toBeDefined();
    expect(guia?.valor).toBe(110);
    expect(guia?.subfamilia_raw).toBe('Despesas Diversas');
    expect(guia?.familia_raw).toBe('DIVERSOS');
    // ⚠ A BUSCA SABE ACHAR: o padrão de ruído não descarta a linha do item — e descarta a do cabeçalho.
    expect(ehRuidoPeloFormato(ITEM_DA_GUIA)).toBe(false);
  });

  it('(b) o cabeçalho de página "Emissão dd/mm/aaaa Hr. …" continua ruído, com e sem a paginação', () => {
    expect(ehRuidoPeloFormato('Emissão 06/10/2026 Hr. 14:29:06')).toBe(true);
    expect(ehRuidoPeloFormato('    Emissao 06/10/2026 Hr. 14:29:06 Pag. 2')).toBe(true);
    expect(r.itens.some((i) => /emiss[ãa]o\s+\d{2}\//i.test(i.produto_raw))).toBe(false);
  });

  it('(c) a reconciliação fecha: itens = subtotais impressos = total geral', () => {
    expect(r.total_itens).toBe(4);
    expect(r.soma_valores).toBe(1692.2);
    expect(r.total_geral_impresso).toBe(1692.2);
    expect(r.reconciliacao.conferido).toBe(true);
    expect(r.reconciliacao.divergencias).toEqual([]);
    expect(r.reconciliacao.ok).toBe(true);
  });

  it('(d) os demais padrões de ruído seguem: traços, "R J", "Sistema de Compras", paginação e "Valor em Real"', () => {
    for (const linha of ['------------------', 'R J', 'Sistema de Compras', 'Pag. 2', 'Descrição      Valor em Real']) {
      expect(ehRuidoPeloFormato(linha), linha).toBe(true);
    }
    expect(r.itens.map((i) => i.produto_raw)).toEqual([
      'VERMIFUGO TESTE 500 ML', 'MATERIAL DE ESCRITORIO', 'EMISSAO GUIA - GTA', 'TAXA CARTORIO FICTICIO',
    ]);
    expect(r.fazenda_raw).toBe('FAZENDA EXEMPLO');
    expect(r.ano_mes).toBe('2026-09');
    expect(r.avisos).toEqual([]);
  });
});
