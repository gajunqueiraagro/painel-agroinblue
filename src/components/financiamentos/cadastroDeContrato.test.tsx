/**
 * FIN-FINANC-28 · PASSO 7 — o formulário novo de contrato. O componente pede o contexto inteiro do app; a ligação e o contrato
 * de layout são lidos da FONTE (com auto-teste dos detectores): tamanho fixo, a conta é do banco (gerador e criar), nenhuma soma
 * de dinheiro na tela, e as três portas que o abrem (Nova obrigação, "Criar contrato" do lançamento, "Criar contrato novo" da rolagem).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const temSoma = (s: string) => /\.reduce\(|\+=/.test(s);

describe('o formulário novo', () => {
  const fonte = semComentario(ler('CadastroDeContratoDialog.tsx'));
  it("tem tamanho fixo de 1150 x 720 (FIN-CONTRATO-CRONOGRAMA-01; encolhe só com a janela menor) e a coluna de resumo", () => {
    expect(fonte).toMatch(/h-\[min\(720px,calc\(100vh-16px\)\)\] w-\[min\(1150px,calc\(100vw-16px\)\)\]/);
    expect(fonte).toMatch(/data-testid="resumo-do-cadastro"/);
  });
  it('o cronograma é do gerador do banco e a criação é uma RPC', () => {
    expect(fonte).toMatch(/rpc\('fn_financiamento_cronograma'/);
    expect(fonte).toMatch(/rpc\('fn_financiamento_criar'/);
  });
  it('não soma dinheiro (o detector sabe achar)', () => {
    expect(temSoma('a.reduce((s, x) => s + x, 0)')).toBe(true);
    expect(temSoma('t += v')).toBe(true);
    expect(temSoma(fonte)).toBe(false);
  });
  it('a natureza escolhe-se na criação: financiamento, compra parcelada e consórcio', () => {
    expect(fonte).toMatch(/'financiamento' \| 'parcelado' \| 'consorcio'/);
    expect(fonte).toMatch(/data-testid="compra-parcelada-no-cadastro"/);
  });
});

describe('as portas', () => {
  it('Nova obrigação abre o formulário novo', () => {
    expect(semComentario(ler('../../pages/FinanciamentosListaPage.tsx'))).toMatch(/<CadastroDeContratoDialog/);
  });
  it('"Criar contrato" do lançamento abre o formulário com a data e o valor do lançamento', () => {
    const f = semComentario(ler('FinanciamentoDoLancamento.tsx'));
    expect(f).toMatch(/onCriarContrato=\{onCriarContrato \?\? setCriando\}/);
    expect(f).toMatch(/prefill=\{\{ natureza: 'financiamento', valor: criando\.valor, data: criando\.data/);
  });
  it('"Criar contrato novo" da rolagem abre o formulário e relê os sucessores', () => {
    const d = semComentario(ler('../../pages/FinanciamentoDetalhe.tsx'));
    expect(d).toMatch(/onCriarContratoNovo=\{\(\) => setCriandoSucessor\(true\)\}/);
    expect(d).toMatch(/onSalvo=\{\(\) => setVersaoDosContratos\(\(v\) => v \+ 1\)\}/);
    expect(semComentario(ler('DarBaixa.tsx'))).toMatch(/\[tipo, api\.lerSucessores, versaoDosContratos\]/);
  });
});
