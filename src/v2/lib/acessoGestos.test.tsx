/**
 * ACESSOS-02c — GESTO QUE ALTERA A OPERACAO COMERCIAL, FORA DA TELA DELA: quem nao tem a tela ve^ o gesto APAGADO com o motivo (atalho
 * some; gesto fica desabilitado). O ajudante (`usePodeAlterarOperacao`), a peca que desenha o gesto (`GestoDeOperacao`), os dois
 * textos do modal e a ligacao no `LancamentoV2Dialog`, LIDA DA FONTE — o modal nao se monta em teste (o metodo do ACESSOS-02b).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { usePodeAbrir, usePodeAlterarOperacao, TELA_DA_OPERACAO } from '@/v2/hooks/usePodeAbrir';
import { GestoDeOperacao } from '@/components/financeiro-v2/GestoDeOperacao';
import { RodapeCancelamento } from '@/components/financeiro-v2/RodapeCancelamento';
import {
  MOTIVO_BLOQUEIO_TITULO_OC, MOTIVO_BLOQUEIO_TITULO_OC_SEM_ACESSO, MOTIVO_SEM_ACESSO_DESVINCULAR, MOTIVO_SEM_ACESSO_VINCULAR,
  ondeAjustarTituloOC,
} from '@/lib/financeiro/cancelamentoLancamento';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'gestor_cliente' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', perfil: quem.perfil } }),
}));
const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('gestor_cliente'));

describe('usePodeAlterarOperacao — so consulta o dono, pela MESMA tela dos atalhos do 02b', () => {
  const pode = () => renderHook(() => usePodeAlterarOperacao()).result.current;
  it('a tela da operacao e a que o 02b consulta', () => {
    expect(TELA_DA_OPERACAO).toBe('lancamentos-zoot');
  });
  it('os quatro perfis de cliente (tela da operacao nao liberada) e o perfil nulo: nao alteram', () => {
    for (const p of ['gestor_cliente', 'financeiro', 'campo', 'leitura', null]) { como(p); expect(pode()).toBe(false); }
  });
  it('admin: altera, como sempre', () => {
    como('admin_agroinblue', true);
    expect(pode()).toBe(true);
  });
  it('quem nao abre a tela nunca altera (alterar exige mais que abrir)', () => {
    for (const p of ['gestor_cliente', 'financeiro', 'campo', 'leitura']) {
      como(p);
      const abre = renderHook(() => usePodeAbrir(TELA_DA_OPERACAO)).result.current;
      if (!abre) expect(pode()).toBe(false);
    }
  });
});

describe('o gesto (GestoDeOperacao): um caso por gesto do modal', () => {
  const GESTOS = [
    { nome: 'Desvincular da operação', testId: 'acao-desvincular-oc', motivo: MOTIVO_SEM_ACESSO_DESVINCULAR, exato: 'só quem tem acesso à operação pode desvincular' },
    { nome: 'Vincular à operação', testId: 'acao-vincular-oc', motivo: MOTIVO_SEM_ACESSO_VINCULAR, exato: 'só quem tem acesso à operação pode vincular' },
  ];
  for (const g of GESTOS) {
    it(`${g.nome} · sem a tela: visivel, DESABILITADO, com o motivo exato no title e escrito ao lado; o clique nao dispara`, () => {
      const onClick = vi.fn();
      render(<GestoDeOperacao podeAlterar={false} motivo={g.motivo} onClick={onClick} testId={g.testId}>{g.nome}</GestoDeOperacao>);
      const botao = screen.getByTestId(g.testId);
      expect(botao.textContent).toBe(g.nome);
      expect(botao).toHaveProperty('disabled', true);
      expect(botao.getAttribute('title')).toBe(g.exato);
      expect(screen.getByTestId(`${g.testId}-motivo`).textContent).toBe(g.exato);
      fireEvent.click(botao);
      expect(onClick).not.toHaveBeenCalled();
    });
    it(`${g.nome} · com a tela (admin): o botao de antes, habilitado, sem frase nem title; o clique dispara`, () => {
      const onClick = vi.fn();
      render(<GestoDeOperacao podeAlterar motivo={g.motivo} onClick={onClick} testId={g.testId}>{g.nome}</GestoDeOperacao>);
      const botao = screen.getByTestId(g.testId);
      expect(botao).toHaveProperty('disabled', false);
      expect(botao.getAttribute('title')).toBeNull();
      expect(screen.queryByTestId(`${g.testId}-motivo`)).toBeNull();
      fireEvent.click(botao);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  }
});

describe('os dois textos do modal, nas duas situacoes', () => {
  it('faixa de origem: com a tela "(ajuste na OC)"; sem a tela "(ajustados pelo administrador na operação)"', () => {
    expect(ondeAjustarTituloOC(true)).toBe('ajuste na OC');
    expect(ondeAjustarTituloOC(false)).toBe('ajustados pelo administrador na operação');
  });
  const titulo = { operacaoId: '1940de90-e156-4d42-b5cd-243d112858dc', tipo: 'venda' };
  it('rodape com a tela: a frase de sempre ("desfaça pelo Desfazer compromisso") e o "Abrir OC →"', () => {
    render(<RodapeCancelamento tituloOC={titulo} bloqueioRebanho={false} onCancelar={vi.fn()} onAbrirOC={vi.fn()} />);
    expect(MOTIVO_BLOQUEIO_TITULO_OC).toBe('Título de operação comercial — desfaça pelo Desfazer compromisso');
    expect(screen.getByTestId('cancelar-titulo-oc').textContent).toBe(`${MOTIVO_BLOQUEIO_TITULO_OC}Abrir OC →`);
  });
  it('rodape sem a tela: "alterações na operação são feitas pelo administrador", sem "Desfazer compromisso" e sem atalho', () => {
    render(<RodapeCancelamento tituloOC={titulo} bloqueioRebanho={false} onCancelar={vi.fn()} />);
    const texto = screen.getByTestId('cancelar-titulo-oc').textContent ?? '';
    expect(texto).toBe('Título de operação comercial — alterações na operação são feitas pelo administrador');
    expect(texto).toBe(MOTIVO_BLOQUEIO_TITULO_OC_SEM_ACESSO);
    expect(texto).not.toContain('Desfazer compromisso');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('a ligacao no modal (LancamentoV2Dialog, lido da FONTE)', () => {
  const modal = fonte('src/components/financeiro-v2/LancamentoV2Dialog.tsx');
  it('o ajudante e chamado uma vez, no topo — nenhum `if` de perfil no modal', () => {
    expect(modal.match(/usePodeAlterarOperacao\(\)/g)).toHaveLength(1);
    expect(modal).toContain('const podeAlterarOperacao = usePodeAlterarOperacao();');
    expect(modal).not.toMatch(/perfil === '/);
  });
  it('"Desvincular da operação": o gesto continua aparecendo pela condicao de antes, e quem decide o apagado e o ajudante', () => {
    expect(modal).toContain("&& podeOferecerDesvinculo({ lancamentoId: lancamento.id, cancelado: lancamento.cancelado, temParteViva: true }) && ( <GestoDeOperacao podeAlterar={podeAlterarOperacao} motivo={MOTIVO_SEM_ACESSO_DESVINCULAR} onClick={() => setDesvincularAberto(true)} testId=\"acao-desvincular-oc\">");
  });
  it('"Vincular à operação": idem', () => {
    expect(modal).toContain('{isEdit && vinculoDisponivel && lancamento && clienteAtual?.id && ( <GestoDeOperacao podeAlterar={podeAlterarOperacao} motivo={MOTIVO_SEM_ACESSO_VINCULAR} onClick={() => setVincularAberto(true)} testId="acao-vincular-oc">');
  });
  it('os dois dialogos so abrem pelos gestos (nenhum outro ponto os liga)', () => {
    expect(modal.match(/setDesvincularAberto\(true\)/g)).toHaveLength(1);
    expect(modal.match(/setVincularAberto\(true\)/g)).toHaveLength(1);
  });
  it('a faixa de origem le o texto do dono, pela tela que a pessoa abre', () => {
    expect(modal).toContain('são somente leitura ({ondeAjustarTituloOC(podeAbrirOC)}); data prevista');
    expect(modal).not.toContain('(ajuste na OC)');
  });
  it('o rodape recebe o atalho so com a tela — e e a ausencia dele que troca a frase', () => {
    expect(modal).toContain('onAbrirOC={podeAbrirOC ? (opId, tipo) => {');
  });
});
