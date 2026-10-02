/**
 * PR-CONC-ENRIQ-SPLIT-REVERTER — o desfazer do desmembramento na Mesa (a regra e as recusas são do banco:
 * `supabase/tests/conc_enriq_split_reverter_test.sql`, P1–P9; aqui só a tela).
 *
 * ⚠ O QUE SE PROVA: o Reverter fica habilitado na linha de split COM registro e apagado, com o texto do D8, no split antigo
 *   sem registro; a simulação do banco vai para o slot da mensagem do rodapé em âmbar, com Confirmar/cancelar e a marca
 *   "· K editados"; as frases completas no `title`; o motivo é obrigatório no próprio rodapé; a recusa fica escrita em
 *   vermelho; tudo no MESMO slot (`flex-1`), com o rodapé de 32px em todos os passos; nenhum toast no fluxo.
 * ⚠ O jsdom NÃO MEDE: o rodapé de 32px é contrato de classe; a medida vai no relatório.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import {
  toRowVM, motivoReverterBloqueado, resumoDesfazerSplit, MOTIVO_SEM_DESFAZER,
} from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { EnriquecimentoMesaModal } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

/* Os status que o banco grava e o tipo `MatchStatus` não declara entram pelo JSON (como no enriquecerV2.test) — sem cast. */
const st = (s: string): Partial<ClassificacaoStagingPreviewRow> => JSON.parse(JSON.stringify({ match_status: s }));
/* O filho de desmembramento gravado (linha 371 do NJ): sem estado anterior, como todo filho de split. */
const FILHO: Partial<ClassificacaoStagingPreviewRow> = {
  ...st('sugestao_split'), staging_id: 's-371', lanc_id: '65dbd985', aplicado: true, aplicado_em: '2026-10-02T17:13:28Z',
  tem_estado_anterior: false, lanc_origem_lancamento: 'mesa_split', lanc_valor: 354.88, excel_valor: 354.88, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_descricao: 'Receita Federal', proposto_produto: 'Receita Federal',
};
const vm = (sobre: Partial<ClassificacaoStagingPreviewRow> = {}) => toRowVM(linhaCrua({ ...FILHO, ...sobre }), [], {});

const ACOES = (sobre: Record<string, unknown> = {}) => ({
  posicao: '1 / 1', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: true,
  revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
  onAplicarTodos: vi.fn(), nAplicaveis: 0, gravada: { alterada: false }, salvarDisabled: true,
  onDesfazerConfirmar: vi.fn(), onDesfazerMotivo: vi.fn(), onDesfazerCancelar: vi.fn(), ...sobre,
});
const montarMesa = (row: ReturnType<typeof vm>, acoes: ReturnType<typeof ACOES>) => (
  <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
    lista={{ rows: [row], selecionadoId: row.id, onSelecionar: vi.fn() }}
    detalhe={{ row, onEditar: vi.fn(() => Promise.resolve()) }}
    actions={acoes} contaId={null} contaNome="BB" baldePorId={new Map([[row.id, 'gravada']])} filtroInicial="feitas" />
);
const SIMULADO = {
  ok: true, motivo: 'simulado', linhas: 2, valor_consolidado: 709.76, editados: 1,
  avisos: ['1 filhos foram editados; as edições no lançamento se perdem'],
  mensagem: 'desfaz: 2 linhas voltam · R$ 709,76 vira um só',
};

describe('o Reverter na linha de split (D8)', () => {
  it('com registro vivo: habilitado (nenhum motivo de bloqueio)', () => {
    expect(vm({ split_id: 'sp-1' }).splitId).toBe('sp-1');
    expect(motivoReverterBloqueado(vm({ split_id: 'sp-1' }))).toBeNull();
  });

  it('split antigo SEM registro: apagado, com "desmembramento antigo · sem registro para desfazer"', () => {
    expect(MOTIVO_SEM_DESFAZER).toBe('desmembramento antigo · sem registro para desfazer');
    expect(motivoReverterBloqueado(vm({ split_id: null }))).toBe(MOTIVO_SEM_DESFAZER);
    render(montarMesa(vm({ split_id: null }), ACOES({ reverterDisabled: true, motivoReverter: MOTIVO_SEM_DESFAZER })));
    expect(screen.getByTestId('reverter')).toBeDisabled();
    expect(screen.getByTestId('mensagem-rodape')).toHaveTextContent(MOTIVO_SEM_DESFAZER);
  });

  it('linha de OUTRA importação gravada num filho (tem estado anterior): o Reverter de sempre (1:1)', () => {
    expect(motivoReverterBloqueado(vm({ split_id: null, tem_estado_anterior: true }))).toBeNull();
  });
});

describe('a barra do desfazer, no slot da mensagem (D8, decisão 2)', () => {
  it('o resumo da simulação: texto curto do banco, as frases completas no title, os editados', () => {
    const r = resumoDesfazerSplit(SIMULADO);
    expect(r.texto).toBe('desfaz: 2 linhas voltam · R$ 709,76 vira um só');
    expect(r.titulo).toMatch(/^desfaz o desmembramento: 2 linhas voltam e o lançamento de R\$\s709,76 volta a ser um só · 1 filhos foram editados/);
    expect(r.editados).toBe(1);
  });

  it('confirmar: âmbar, "· K editados", Confirmar e cancelar; o title leva a frase inteira', () => {
    const r = resumoDesfazerSplit(SIMULADO);
    const a = ACOES({ desfazerSplit: { etapa: 'confirmar', ...r } });
    render(montarMesa(vm({ split_id: 'sp-1' }), a));
    const barra = screen.getByTestId('desfazer-split');
    expect(barra).toHaveTextContent('desfaz: 2 linhas voltam · R$ 709,76 vira um só');
    expect(barra.className).toMatch(/text-amber-700/);
    expect(barra.className).toMatch(/flex-1/);
    expect(barra.getAttribute('title')).toBe(r.titulo);
    expect(screen.getByTestId('desfazer-editados')).toHaveTextContent('· 1 editados');
    expect(screen.queryByTestId('mensagem-rodape')).toBeNull();
    fireEvent.click(screen.getByTestId('desfazer-confirmar'));
    expect(a.onDesfazerConfirmar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('desfazer-cancelar'));
    expect(a.onDesfazerCancelar).toHaveBeenCalledTimes(1);
  });

  it('motivo: obrigatório — Confirmar apagado vazio; com texto, executa com o motivo', () => {
    const a = ACOES({ desfazerSplit: { etapa: 'motivo', texto: '' } });
    render(montarMesa(vm({ split_id: 'sp-1' }), a));
    expect(screen.getByTestId('desfazer-split')).toHaveTextContent('motivo:');
    expect(screen.getByTestId('desfazer-confirmar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('desfazer-motivo'), { target: { value: '  par errado  ' } });
    expect(screen.getByTestId('desfazer-confirmar')).toBeEnabled();
    fireEvent.click(screen.getByTestId('desfazer-confirmar'));
    expect(a.onDesfazerMotivo).toHaveBeenCalledWith('par errado');
  });

  it('recusa: o motivo do banco em vermelho, no mesmo slot', () => {
    const a = ACOES({ desfazerSplit: { etapa: 'erro', texto: 'filho gravado na importação de 02/10 15:27 · reverta lá antes' } });
    render(montarMesa(vm({ split_id: 'sp-1' }), a));
    const barra = screen.getByTestId('desfazer-split');
    expect(barra).toHaveTextContent('filho gravado na importação de 02/10 15:27 · reverta lá antes');
    expect(barra.className).toMatch(/text-red-700/);
    expect(screen.getByTestId('desfazer-cancelar')).toHaveTextContent('fechar');
  });

  it('nada muda de altura: o rodapé é o mesmo (h-8) em todos os passos, e o slot é o mesmo flex-1', () => {
    const passos = [null, { etapa: 'confirmar', texto: 'x' }, { etapa: 'motivo', texto: '' }, { etapa: 'erro', texto: 'y' }];
    for (const p of passos) {
      const { unmount } = render(montarMesa(vm({ split_id: 'sp-1' }), ACOES({ desfazerSplit: p })));
      const rodape = screen.getByTestId('rodape-mesa');
      expect(rodape.className).toMatch(/\bh-8\b/);
      expect(rodape.children).toHaveLength(7);
      unmount();
    }
  });

  it('nenhum toast no fluxo do desfazer (a barra é o único lugar da mensagem)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    const corpo = (inicio: string, fim: string) => {
      const i = src.indexOf(inicio);
      const f = src.indexOf(fim, i + inicio.length);
      if (i < 0 || f < 0) throw new Error(`não achei ${inicio}`);
      return src.slice(i, f);
    };
    const fluxo = corpo('async function iniciarDesfazerSplit(', '// P0-1A');
    expect(fluxo).toMatch(/desfazerSplitRpc\(\{ staging_id: id, motivo: null, simular: true \}\)/);
    expect(fluxo).toMatch(/desfazerSplitRpc\(\{ staging_id: id, motivo, simular: false \}\)/);
    expect(fluxo).not.toMatch(/toast/);
    /* a busca sabe achar: o handler do Reverter 1:1 (fora deste PR) ainda usa toast */
    expect(corpo('async function handleReverter(', '\n  }\n')).toMatch(/toast\./);
  });
});
