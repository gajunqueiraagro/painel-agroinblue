/**
 * FIN-FINANC-LAYOUT-02 (Gabriel 11/11/2026, "olha o rolo que ficou a tela dos contratos de financiamento") — o cronograma do crédito:
 * (1) o Prazo curto em "d" ("há 41 d" · "em 324 d"; o longo vai no title); (2) o Lançamento é UM status por linha, em texto curto
 * ("juros ✓ · principal ✓", "sem lançamento" laranja, o que falta), sem selo e sem quebrar; (3) a linha não leva o title "Parcela sem
 * lançamento" (o tooltip cobria Total e Saldo): o porquê mora no status; (4) linha de 22px e 6px de cada lado na célula.
 * A medida de corte e sobreposição na tela é a `scripts/ui-cortes/fotoContrato.mjs` (bancada; contrato de 15 e de 3 parcelas).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { textoDoPrazo, textoDoPrazoCurto } from '@/lib/financiamentos/situacaoDoContrato';

const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
const cronograma = fonte.slice(fonte.indexOf('data-testid="tabela-cronograma"'), fonte.indexOf('{ehParcelamento && (\n      <div className="min-h-0 flex-1 px-3 pb-1"'));

describe('FIN-FINANC-LAYOUT-02 — o cronograma do crédito', () => {
  it('o prazo curto em "d"; o longo continua para o title', () => {
    expect([
      textoDoPrazoCurto({ tipo: 'vencida', dias: 41 }), textoDoPrazoCurto({ tipo: 'a_vencer', dias: 324 }), textoDoPrazoCurto({ tipo: 'a_vencer', dias: 0 }),
      textoDoPrazoCurto({ tipo: 'antes', dias: 3 }), textoDoPrazoCurto({ tipo: 'no_dia', dias: 0 }), textoDoPrazoCurto({ tipo: 'atraso', dias: 2 }), textoDoPrazoCurto(null),
    ]).toEqual(['há 41 d', 'em 324 d', 'hoje', '3 d antes', 'no dia', '2 d atraso', '—']);
    expect(textoDoPrazo({ tipo: 'a_vencer', dias: 1785 })).toBe('vence em 1785 dias');
    expect(cronograma).toContain('title={d?.prazo ? textoDoPrazo(d.prazo) : undefined}>');
  });
  it('o Lançamento: um status em texto, juros ✓ · principal ✓, sem selo e sem quebra', () => {
    const gestos = cronograma.slice(cronograma.indexOf('const gestos = ('), cronograma.indexOf('return (', cronograma.indexOf('const gestos = (')));
    expect(gestos).toContain('data-testid="ver-juros">juros ✓</button>');
    expect(gestos).toContain('data-testid="ver-principal">principal ✓</button>');
    expect(gestos.indexOf('ver-juros')).toBeLessThan(gestos.indexOf('ver-principal'));
    expect(gestos).toContain('>sem principal</span>');
    expect(gestos).toContain('>sem juros</span>');
    expect(gestos).not.toMatch(/flex-wrap|rounded px-|whitespace-normal/);
    expect(gestos).toContain('title={semLanc ? porQueSemLancamento(p)');
    /* ajuste do Chat 09:58: sem lançamento (regra `semLancamento`) = "sem lançamento" + Buscar, nunca "juros ✓" */
    expect(gestos).toContain('{!semLanc && p.lancamentoJurosId && (');
  });
  it('a linha não tem title (o tooltip cobria a linha); régua 22px com 6px de cada lado', () => {
    const linha = cronograma.slice(cronograma.indexOf('data-testid="linha-do-contrato"'), cronograma.indexOf('<td', cronograma.indexOf('data-testid="linha-do-contrato"')));
    expect(linha).not.toContain('title=');
    expect(fonte).toContain('const TD_V4 = `h-[22px] overflow-hidden whitespace-nowrap px-[6px] ${E.td} leading-[21px] text-[#111827]`;');
    expect(fonte).toMatch(/const TH_V4 = `sticky top-0 z-10 h-\[22px\] whitespace-nowrap bg-\[#1d3a5d\] px-\[6px\]/);
    expect(fonte).toMatch(/const TF_V4 = `sticky bottom-0 z-10 h-\[22px\] whitespace-nowrap bg-\[#e4e9ef\] px-\[6px\]/);
  });
  it('o modal Editar contrato › Liberações é o MESMO BlocoLiberacoes da tela do contrato, com a conta do contrato (Chat 10:26)', () => {
    const modal = readFileSync(resolve(__dirname, './CadastroDeContratoDialog.tsx'), 'utf8');
    expect(modal).toContain("import { BlocoDestinacoes, BlocoDocumentos, BlocoLiberacoes } from '@/components/financiamentos/ContratoDeCredito';");
    expect(modal).toContain('<BlocoLiberacoes api={credito} contaDoContrato={nomeDaContaDoContrato}');
    expect(modal).toContain('const nomeDaContaDoContrato = contaDoForm ? (contaDoForm.nome_exibicao || contaDoForm.nome_conta || null) : null;');
    /* nenhuma outra tabela de liberações no código (uma fonte só) */
    expect(modal).not.toMatch(/Entrou na conta|A identificar/);
    expect(fonte).not.toMatch(/Entrou na conta|A identificar/);
  });
});
