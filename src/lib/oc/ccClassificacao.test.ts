/**
 * OC-CC-CLASSIFICACAO-01 — o recebimento/pagamento da OC conta corrente fica no subcentro da operacao e sai do DRE PELA PARTE.
 *
 * ⚠ A REGRA MORA NO BANCO e foi provada la', em rollback, como o usuario do Gabriel (ver o bloco no CLAUDE.md): vincular deixa a
 *   conta e poe compoe_dre false; cancelar a OC devolve compoe_dre true; programado e devolucao nascem na conta da operacao, fora do
 *   DRE; 294 saidas das quatro RPCs do DRE identicas antes e depois do gate. Este arquivo trava o TEXTO das migrations — quem
 *   "simplificar" um predicado, tirar o gate de um leitor ou voltar a ler a conta pela origem derruba um caso aqui.
 * ⚠ E CADA CASO DE PRESENCA TEM O SEU DE AUSENCIA: afirmar so' que o novo esta' la' passaria verde com o velho convivendo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';

const sql = readFileSync('supabase/migrations/20261027173000_oc_cc_classificacao_01.sql', 'utf8');
const dados = readFileSync('supabase/migrations/20261027173100_oc_cc_classificacao_01_dados.sql', 'utf8');

/** O texto que um patch poe no lugar (o segundo argumento de cada trinca), para nao casar com a ancora antiga. */
function destinos(): string {
  return [...sql.matchAll(/\$b\$([\s\S]*?)\$b\$/g)].map(m => m[1]).join('\n');
}

describe('a regra: uma so, num lugar so', () => {
  it('o gatilho que ja grava compoe_dre aplica a parte viva da OC depois de tudo, e recalcula quando a parte nasce ou morre', () => {
    const d = destinos();
    expect(d).toContain("IF TG_OP = 'UPDATE' AND public._oc_cc_fora_do_dre(NEW.id) THEN\n    NEW.compoe_dre := false;");
    expect(d).toContain("OR coalesce(current_setting('app.oc_recalcular_dre', true), 'off') = 'on'");
    /* o predicado: recebimento fora de explicacao/entrega, ou devolucao — e so' em conta corrente */
    expect(sql).toContain("pt.cancelada = false and o.modelo_financeiro = 'conta_corrente'");
    expect(sql).toContain("and ((pt.componente = 'recebimento' and pt.origem not in ('explicacao', 'entrega'))");
    /* quem toca o lancamento e' a parte: insert e mudanca de cancelada, lancamento, componente ou origem */
    expect(sql).toContain('after insert or update of cancelada, financeiro_lancamento_id, componente, origem on public.zoo_operacao_partes');
    expect(sql).toContain("perform set_config('app.oc_recalcular_dre', 'off', true);");
  });

  it('os quatro leitores do DRE respeitam a bandeira; a leitura do zootecnico (lancamentos) fica como estava', () => {
    expect(sql).toContain("$b$where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.compoe_dre and l.cenario=p_cenario$b$, '4'");
    expect(sql).toContain("$b$where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and l.compoe_dre$b$, '1'");
    for (const f of ['fn_dre_pecuaria_lancamentos', 'fn_dre_lavoura', 'fn_dre_agricola_por_safra']) {
      expect(sql).toContain(`select pg_temp.oc_cc_patch('${f}'`);
    }
    expect(destinos()).not.toContain('from lancamentos');
  });
});

describe('o vincular nao troca mais a conta', () => {
  it('a conta do plano e a do proprio lancamento; o UPDATE so solta o elo antigo com o rebanho', () => {
    const d = destinos();
    expect(d).toContain('SELECT * INTO v_pc FROM public.financeiro_plano_contas WHERE id = v_l.plano_conta_id;');
    expect(d).toContain('SET movimentacao_rebanho_id = NULL, updated_at = now(), updated_by = v_actor');
    expect(d).not.toContain('SET plano_conta_id = v_pc.id');
    /* e a invariancia passa a conferir a conta do plano e as duas colunas da conta bancaria */
    expect(d).toContain('OR v_l_depois.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id THEN');
    expect(d).toContain('OR v_l_depois.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id');
  });

  it('o mapa perde 3015 e 5005 e volta ao md5 de antes do 01b; o ramo "Adiantamento de Clientes so se vincula" some', () => {
    expect(sql).toContain("'_oc_vinculo_mapa', 'fd9e1305efe5c36983e0add791d5d2b9', '928535c7e5f786282fed637187dd0b23'");
    expect(destinos()).not.toContain('Adiantamento de Clientes so se vincula');
    expect(sql).toContain('drop function public._oc_cc_conta_dinheiro(text);');
  });
});

describe('programado e devolucao na conta da operacao', () => {
  it('a conta e a da categoria do lote de MAIOR valor; a descricao e "Venda NNN cab · Pagamento X de Y"', () => {
    expect(sql).toContain("order by (public._oc_valor_do_lote(lo.id)->>'total')::numeric desc nulls last, lo.ordem");
    const d = destinos();
    expect(d).toContain("'subcentro', public._oc_cc_conta_principal(p_operacao_id),");
    expect(d).toContain("format('%s %s cab · Pagamento %s de %s', public._oc_cc_verbo(v_op.tipo_operacao),");
    expect(d).not.toContain("'Recebimento programado'");
  });

  it('a devolucao vai para a conta da operacao, no sentido contrario ao do dinheiro dela', () => {
    const d = destinos();
    expect(d).toContain('pc.subcentro = public._oc_cc_conta_principal(p_operacao_id)');
    expect(d).toContain("THEN CASE WHEN v_pc.tipo_operacao = '1-Entradas' THEN '2-Saídas' ELSE '1-Entradas' END");
    expect(d).not.toContain("'Devolução de Adiantamento de Clientes'");
  });
});

describe('conta bancaria pela direcao (o "sem conta" do extrato)', () => {
  it('entrada le conta_destino_id, saida conta_bancaria_id — no extrato e nos vinculaveis', () => {
    const d = destinos();
    const direcao = "CASE WHEN f.tipo_operacao LIKE '1-%' THEN f.conta_destino_id ELSE f.conta_bancaria_id END";
    expect(d).toContain(`${direcao} AS f_conta,`);
    expect(d).toContain(`${direcao}, f.status_transacao,`);
    expect(d).not.toContain('f.conta_bancaria_id AS f_conta');
  });
});

describe('o dado dos 7 e o plano', () => {
  it('os 7 ids voltam a conta do evento vincular_recebimento, com hash e editado_manual do retrato de antes', () => {
    for (const id of ['568e80e6', '693fc917', 'aee255bc', 'e57e3e60', '4df4ea15', '692f1957', 'f110eb68']) expect(dados).toContain(id);
    expect(dados).toContain("(e.dados_anteriores->'lancamento'->>'plano_conta_id')::uuid plano_orig");
    expect(dados).toContain("set plano_conta_id = r.plano_orig, editado_manual = r.em_orig");
    expect(dados).toContain('update public.financeiro_lancamentos_v2 set hash_importacao = v_l.hash_importacao');
    expect(dados).toContain("or v_l2.compoe_dre is not false then");
  });

  it('3015, 5005 e 5006 sao DESATIVADAS (nunca apagadas) e so com zero lancamento, parte ou compromisso vivo nelas', () => {
    expect(dados).toContain('update public.financeiro_plano_contas set ativo = false');
    expect(dados).not.toMatch(/delete from public\.financeiro_plano_contas/);
    expect(dados).toContain("raise exception 'ainda ha lancamento, parte ou compromisso vivo em 3015/5005/5006'");
    /* e as guardas de chegada: DRE, caixa, rebanho e saldo da conta corrente iguais */
    for (const g of ['o DRE (SR 2025/2026, Agnaldo 2026) mudou', 'o caixa (SR e Agnaldo) mudou', 'o rebanho (SR e Agnaldo) mudou',
      'o saldo da conta corrente mudou']) expect(dados).toContain(g);
  });

  it('os rotulos de adiantamento sairam da tela', () => {
    expect(rotuloDaConta('Adiantamento de Clientes')).toBe('Adiantamento de Clientes');
    expect(rotuloDaConta('Adiantamento a Fornecedores')).toBe('Adiantamento a Fornecedores');
    expect(rotuloDaConta('Venda de Desmama Machos')).toBe('Venda de Desmama Machos');
  });
});
