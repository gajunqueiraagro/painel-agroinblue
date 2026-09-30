/**
 * FIN-V2-HOMOLOG-FIX-01 — correcoes da homologacao do Financeiro V2 (29/09/2026).
 *
 * ⚠ O "Criar OC" NAO APARECIA PORQUE A TABELA ROLAVA NA HORIZONTAL: com a coluna OC ela pedia 991px num container de 908 e o "..."
 *   ficava FORA DA VISTA. Deploy e regra estavam certos (153 recebimentos de venda passam em `podeCriarOCDoLegado`). Por isso: a
 *   coluna OC saiu, a celula do "..." ficou fixa a' direita (sticky) e o menu ganhou "Abrir OC".
 * ⚠ LIDO DA FONTE: a `FinanceiroV2Tab` e o `LancamentoV2Dialog` nao se montam em teste (contexto, supabase, dezenas de hooks). A
 *   regra do botao e' a MESMA funcao da lista, testada em `src/lib/oc/criarDoLegado.test.ts`.
 * ⚠ jsdom nao faz layout: "sem rolagem a 1440" foi medido no navegador (tabela 1190/1210, ampliada 1398/1418), nao aqui.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { podeCriarOCDoLegado } from '@/lib/oc/criarDoLegado';

const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
const dialogo = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
const migration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261027174000_fin_v2_homolog_fix_01.sql'), 'utf8');

describe('item 3 — lista sem coluna OC, "..." sempre visivel, "Abrir OC" no menu', () => {
  it('a coluna OC sai do cabecalho e das linhas; a linha vazia passa a ocupar 15 colunas', () => {
    expect(tela).not.toContain('>OC</th>');
    expect(tela).not.toContain('<CelulaOC oc={lancamentosComOC.get(l.id)}');
    expect(tela).toContain('<td colSpan={15}');
    expect(tela).not.toContain('<td colSpan={16}');
    /* a busca sabe achar: a secao sem caixa ainda usa a celula OC (cabe sem rolagem la') */
    expect(tela).toContain("import { SecaoSemCaixa, totalSemCaixa } from '@/components/financeiro-v2/SecaoSemCaixa';");
  });

  /* ⚠ CONTRATO MUDOU NO PR-FIN-V2-STATUS-PGTO-01-fix1 (decisao do Gabriel, 30/09): o "..." NAO e' mais fixo — fixo, ele cobria
     o status sempre que a lista rolava. Ele continua visivel porque a lista passou a caber sem rolar (medido na tela). */
  it('o cabecalho e a celula do "..." sao a ultima coluna normal, sem sticky', () => {
    expect(tela).toContain('text-primary-foreground" aria-label="Ações"></th>');
    expect(tela).toContain('<td className="!py-0 px-0 align-middle" onClick={(e) => e.stopPropagation()}>');
    expect(tela).not.toContain('sticky right-0');
  });

  it('"Abrir OC" so na linha com OC, abrindo a OC na aba Financeiro; o icone ao lado do produto continua', () => {
    const menu = tela.slice(tela.indexOf('data-testid="menu-abrir-oc"') - 200, tela.indexOf('data-testid="menu-abrir-oc"') + 300);
    expect(menu).toContain('{lancamentosComOC.get(l.id) && (');
    expect(menu).toContain('abrirOCFinanceiro(oc.operacaoId, oc.tipo)');
    expect(menu).toContain('Abrir OC');
    expect(tela).toContain('onClick={e => { e.stopPropagation(); abrirOCFinanceiro(oc.operacaoId, oc.tipo); }}');
  });
});

describe('item 2 — "Criar OC a partir deste lançamento" no rodape do Editar lançamento', () => {
  it('mesma regra da lista, so depois de ler a parte da OC, e o mesmo dialogo', () => {
    expect(dialogo).toContain('parteOCLida && podeCriarOCDoLegado(lancamento, !!parteOCViva) && (');
    expect(dialogo).toContain('data-testid="acao-criar-oc-legado"');
    expect(dialogo).toContain("import { CriarOCDoLegadoDialog } from '@/components/financeiro-v2/CriarOCDoLegadoDialog';");
    /* ao lado do Vincular: o botao vem logo depois dele no rodape */
    expect(dialogo.indexOf('data-testid="acao-vincular-oc"')).toBeLessThan(dialogo.indexOf('data-testid="acao-criar-oc-legado"'));
    /* sem a leitura da parte o botao piscaria para um titulo de OC: a flag zera ao trocar de lancamento e so' liga depois */
    expect(dialogo).toContain('setParteOCLida(false);');
    expect(dialogo.match(/setParteOCLida\(true\)/g)?.length).toBe(2);
  });

  it('a regra que o botao usa: venda legada sem OC passa; com OC, nao', () => {
    const venda = { tipo_operacao: '1-Entradas', subcentro: 'Venda de Desmama Machos', cancelado: false,
      sem_movimentacao_caixa: false, origem_lancamento: 'manual' };
    expect(podeCriarOCDoLegado(venda, false)).toBe(true);
    expect(podeCriarOCDoLegado(venda, true)).toBe(false);
  });
});

describe('item 4 — favorecido das despesas no cancelar', () => {
  it('o do compromisso; sem ele, o do titulo vivo mais antigo; patch guardado por md5', () => {
    expect(migration).toContain("'_oc_cancelar_conta_corrente', 'a15e583a93087e07f8014412fc85c234', '5f585988500b26e1fb84f73914aa2b32'");
    expect(migration).toContain("'favorecido', coalesce(fo.nome, (");
    expect(migration).toContain('ORDER BY tl.data_competencia, tl.id LIMIT 1)), \'valor\', c.valor_total');
    /* a ancora de antes casa exatamente uma vez */
    expect(migration).toContain("$a$'favorecido', fo.nome, 'valor', c.valor_total$a$");
  });
});
