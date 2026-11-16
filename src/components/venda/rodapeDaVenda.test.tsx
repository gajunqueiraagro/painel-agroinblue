/**
 * OC-SALVAR-RODAPE-01 F2 — a VENDA no rodapé único: fechar com pendência pergunta (dados, lotes, boitel ou o realizado), o "Salvar e
 * fechar" grava dados → negociação com a versão passada, e a base dos dados nasce do banco (ou da tela nova, com a fazenda semeada).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assinaturaDosDadosDaVenda, dadosDaVendaDaOperacao, dadosDaVendaNova } from '@/lib/oc/fecharOC';

const AGORA = new Date(2026, 10, 15, 8, 0);

describe('a base dos dados da venda', () => {
  it('venda nova: a data de hoje e a fazenda semeada; escolher o comprador já é alteração', () => {
    const base = dadosDaVendaNova('faz-1', AGORA);
    const tela = { comprador: '', data: '2026-11-15', fazenda: 'faz-1', tipo: '', destino: '', observacao: '', notaFiscal: '' };
    expect(assinaturaDosDadosDaVenda(tela)).toBe(base);
    expect(assinaturaDosDadosDaVenda({ ...tela, comprador: 'frig-1' })).not.toBe(base);
    expect(assinaturaDosDadosDaVenda({ ...tela, fazenda: '' })).not.toBe(base);
  });
  it('venda do banco: o que a hidratação põe na tela, com o tipo resolvido na carga', () => {
    const op = { contraparte_id: 'c1', data_operacao: '2026-10-02', fazenda_id: 'f1', observacoes: 'obs', numero_documento: '123', propriedade_destino: 'Faz. X' };
    const tela = { comprador: 'c1', data: '2026-10-02', fazenda: 'f1', tipo: 'boitel', destino: 'Faz. X', observacao: 'obs', notaFiscal: '123' };
    expect(dadosDaVendaDaOperacao(op, 'boitel', AGORA)).toBe(assinaturaDosDadosDaVenda(tela));
    expect(dadosDaVendaDaOperacao(op, '', AGORA)).not.toBe(assinaturaDosDadosDaVenda(tela));
  });
  it('o destino conta sem os espaços das pontas (o gravador manda `trim`)', () => {
    const tela = { comprador: 'c1', data: '2026-10-02', fazenda: 'f1', tipo: '', destino: 'Faz. X', observacao: '', notaFiscal: '' };
    expect(assinaturaDosDadosDaVenda({ ...tela, destino: ' Faz. X ' })).toBe(assinaturaDosDadosDaVenda(tela));
  });
});

describe('a fiação da Venda (LancamentosTab)', () => {
  const fonte = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
  const fechar = fonte.slice(fonte.indexOf('const fecharModalOCComAutosave = useCallback('));
  const blocoFechar = fechar.slice(0, fechar.indexOf('}, ['));
  const blocoVenda = blocoFechar.slice(blocoFechar.indexOf('if (modoOCVenda) {'), blocoFechar.indexOf('if (modoOCCompra'));
  it('fechar a venda com pendência PERGUNTA e não salva calado (D1); a pergunta própria do realizado saiu', () => {
    expect(blocoVenda).toContain('if (ocVendaPendente) { setPerguntaFecharVenda(true); return; }');
    expect(blocoVenda).not.toMatch(/salvar\w*\(/);
    expect(fonte).not.toContain('setFecharRealizadoPendente');
  });
  it('o pendente da negociação: lotes contra o banco, o realizado e o planejamento do boitel', () => {
    expect(fonte).toContain("negociacaoSuja: !!lotesApi.alterados || realizadoSujo || (vendaTipoVenda === 'boitel' && ocVendaBoitelAtual !== ocVendaBoitelBase),");
    expect(fonte).toContain('setOcVendaBoitelBase(JSON.stringify(bd ? payloadBoitel(bd) : null));');
    expect(fonte).toContain('setOcVendaDadosBase(dadosDaVendaDaOperacao(op, tipoCarregado));');
  });
  it('"Salvar e fechar" grava dados → negociação com a versão passada e só fecha se tudo passou (D3)', () => {
    expect(fonte).toContain("passo === 'dados' ? salvarDadosDaVenda() : salvarNegociacaoVendaOC(versao));");
    expect(fonte).toContain('lotesSobrescritos: sobrescritos, aoRecusar: setRecusaNegociacaoOC, versaoEsperada: versaoOverride });');
  });
});

describe('o rodapé da Venda (VendaModalShell)', () => {
  const shell = readFileSync('src/components/venda/VendaModalShell.tsx', 'utf8');
  it('é o RodapeDaOC, com o estado; o Fechar próprio saiu', () => {
    expect(shell).toContain('<RodapeDaOC onFechar={onFechar} pendente={pendente} salvoAs={salvoAs}>');
    expect(shell).not.toContain('title="Fechar sem salvar"');
  });
});
