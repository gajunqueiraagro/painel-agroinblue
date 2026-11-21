/**
 * COMPRAS-PARC-LAYOUT-02 — os filtros da aba Compras parceladas (as regras puras), o botão que segue a aba e a moldura única dos 3 modais
 * (estas duas, pela fonte).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { credoresComContagem, escopoSigla, opcoesDeAtividade, ROTULO_DO_NOVO } from './filtrosDasCompras';

const fonte = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('filtros da aba Compras parceladas', () => {
  it('o sufixo do escopo é o certo (o Administrativo não sai mais "AGR")', () => {
    expect(['pecuaria', 'agricultura', 'silvicultura', 'administrativo', 'outro', null].map(escopoSigla))
      .toEqual(['PEC', 'AGR', 'SILV', 'ADM', '—', '—']);
  });
  it('"Atividade" = os grupos das atividades LIGADAS (ordem do cadastro, sem repetir) e Administrativo por último (D1)', () => {
    const lidas = { cadastrado: true, atividades: [
      { id: 'a', nome: 'Cria', grupo: 'pecuaria' as const, ordem: 1 }, { id: 'b', nome: 'Recria', grupo: 'pecuaria' as const, ordem: 2 },
      { id: 'c', nome: 'Eucalipto', grupo: 'silvicultura' as const, ordem: 3 }] };
    expect(opcoesDeAtividade(lidas, ['agricultura']).map((o) => o.rotulo)).toEqual(['Pecuária', 'Silvicultura', 'Administrativo']);
    /* sem cadastro (ou leitura falhou): os escopos que as compras TÊM, nunca lista fixa */
    expect(opcoesDeAtividade(null, ['agricultura', 'administrativo']).map((o) => o.valor)).toEqual(['agricultura', 'administrativo']);
    expect(opcoesDeAtividade({ cadastrado: false, atividades: [] }, ['pecuaria']).map((o) => o.valor)).toEqual(['pecuaria', 'administrativo']);
  });
  it('credores das linhas filtradas, com a contagem; o mais usado primeiro', () => {
    const c = (id: string, nome: string) => ({ id, nome, nome_fantasia: null, cpf_cnpj: null, aliases_norm: null, ativo: true });
    expect(credoresComContagem([c('b', 'Banco'), c('o', 'Oficina'), c('o', 'Oficina'), c('a', 'Agro')]).map((x) => `${x.nome}:${x.uso}`))
      .toEqual(['Oficina:2', 'Agro:1', 'Banco:1']);
  });
});

describe('o botão do topo segue a aba; a natureza vem travada (fonte)', () => {
  const pagina = fonte('src/pages/FinanciamentosListaPage.tsx');
  it('176px fixos, rótulo e destino pela aba; o "+ Nova obrigação" genérico saiu', () => {
    expect(ROTULO_DO_NOVO).toEqual({ financiamentos: 'Novo financiamento', parcelas: 'Nova compra parcelada', consorcios: 'Novo consórcio' });
    expect(pagina).toMatch(/w-\[176px\][^>]*\n\s+onClick=\{\(\) => \(aba === 'parcelas' \? setNovaObrigacaoAberta\(true\) : setCadastroNovoAberto\(true\)\)\}/);
    expect(pagina).toContain("tipoDaAba={aba === 'consorcios' ? 'consorcio' : 'financiamento'}");
    expect(pagina).not.toContain('Nova obrigação\n');
    expect(pagina).not.toContain('onAbrirCompraParcelada');
  });
  it('o cadastro com o tipo da aba: sem o seletor Financiamento/Compra/Consórcio e sem "outra natureza"', () => {
    const cad = fonte('src/components/financiamentos/CadastroDeContratoDialog.tsx');
    expect(cad).toContain('{!tipoDaAba && <Segmentado altura={22} valor={valorDaEscolha}');
    expect(cad).toContain('onOutraNatureza={editando || tipoDaAba ? undefined');
    expect(cad).toMatch(/useState<'financiamento' \| 'parcelado' \| 'consorcio'>\(tipoDaAba \?\?/);
  });
});

describe('a moldura única dos 3 modais (D1) e a compra parcelada no padrão (fonte)', () => {
  const MOLDURA = 'h-[min(720px,calc(100vh-16px))] w-[min(1150px,calc(100vw-16px))]';
  it('Financiamento, Compra parcelada e Consórcio com o MESMO tamanho fixo', () => {
    for (const f of ['CadastroDeContratoDialog', 'ObrigacaoDialog', 'ConsorcioDialog']) {
      expect(fonte(`src/components/financiamentos/${f}.tsx`)).toContain(MOLDURA);
    }
  });
  it('compra parcelada: título navy, 4 abas, Resumo com "O que falta", "Data da compra", sem o bloco Natureza; a FIN-REGRA trava o Salvar', () => {
    const d = fonte('src/components/financiamentos/ObrigacaoDialog.tsx');
    expect(d).toContain('`Nova compra parcelada · ${clienteAtual?.nome ?? \'\'}`');
    expect(d).toContain('`Editar compra parcelada · ${form.descricao || contrato?.descricao || \'\'}`');
    expect(d).toContain("{ key: 'contrato', label: 'Compra' },");
    expect(d).toContain('Data da compra *');
    expect(d).not.toContain('Data do contrato *');
    expect(d).not.toContain('testId="bloco-natureza"');
    expect(d).toContain('data-testid="o-que-falta"');
    expect(d).toContain("if (regraFazenda) lista.push({ aba: 'classificacao', texto: regraFazenda });");
    expect(d).toContain('perguntarRegraFazenda(planoDaRegra, fazendaDaRegra)');
  });
});
