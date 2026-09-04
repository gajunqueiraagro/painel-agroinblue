/**
 * O que este teste trava — o Resumo da Atividade conta o mês pelo tipo DAQUELE mês.
 *
 * ⚠ O DEFEITO ERA DE LENTE, NÃO DE CONTA. A tela agrupava por `pasto.tipo_uso` — o valor
 * ATUAL do cadastro — enquanto o fechamento guarda `tipo_uso_mes`, o que o pasto era
 * naquele mês. Medido em 04/09/2026: **14.790 dos 21.870 fechamentos (68%), em 80 meses**,
 * têm os dois diferentes. Um pasto que era `cria` em março e virou `engorda` aparecia como
 * `engorda` no cartão de março, e `vedado` — que só existe no mês, nunca no cadastro —
 * sumia inteiro da tela.
 *
 * ⚠ E A ÁREA SEM CABEÇA DIVIDIA O REBANHO DOS OUTROS. Em ago/2026, 156 dos 311 pastos
 * ativos não tinham fechamento; a área deles (7.626,94 ha de 17.007,80 — 44,8%) entrava no
 * denominador da UA/ha sem contribuir uma cabeça, e o indicador saía ~45% menor. Agora eles
 * têm balde próprio, nomeado, fora do denominador de qualquer atividade.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumoAtividadesView } from '@/components/ResumoAtividadesView';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';
import type { FechamentoPasto, FechamentoItem } from '@/hooks/useFechamento';

const MES = '2026-08';

const pasto = (id: string, nome: string, tipoUsoHoje: string, areaHa: number): Pasto => ({
  id, nome, tipo_uso: tipoUsoHoje, area_produtiva_ha: areaHa,
  fazenda_id: 'faz-1', lote_padrao: null, qualidade: null,
  /* ⚠ `true` DE PROPOSITO: a coluna esta aposentada e o filtro deixou de le-la. Deixar
     `true` aqui garante que o teste falharia se alguem a reintroduzisse E gravasse
     `false` — o fixture nao esconde a volta da armadilha, so' nao depende dela. */
  entra_conciliacao: true,
  ativo: true, observacoes: null, ordem_exibicao: 0,
  data_inicio: '2020-01-01', data_fim: null,
  created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z',
});

const fechamento = (id: string, pastoId: string, tipoUsoMes: string | null): FechamentoPasto => ({
  id, pasto_id: pastoId, ano_mes: MES, status: 'fechado',
  tipo_uso_mes: tipoUsoMes, fazenda_id: 'faz-1',
  responsavel_nome: null, lote_mes: null, qualidade_mes: null, observacao_mes: null,
  created_at: '2026-08-31T00:00:00Z', updated_at: '2026-08-31T00:00:00Z',
});

const item = (fechId: string, qtd: number, pesoMedio: number): FechamentoItem => ({
  id: `i-${fechId}`, fechamento_id: fechId, categoria_id: 'cat-1',
  quantidade: qtd, peso_medio_kg: pesoMedio,
  lote: null, observacoes: null, origem_dado: 'manual', peso_atualizado: false,
});

/** Um pasto que HOJE é engorda mas em agosto estava em cria, com 100 cabeças. */
const P_VIROU = pasto('p1', 'Pasto Um', 'engorda', 100);
/** Um pasto que hoje é cria e em agosto estava vedado — sem cabeça. */
const P_VEDADO = pasto('p2', 'Pasto Dois', 'cria', 50);
/** Um pasto ativo que ninguém fechou no mês — 200 ha de área órfã. */
const P_SEM_FECH = pasto('p3', 'Pasto Três', 'engorda', 200);

const FECHAMENTOS = [fechamento('f1', 'p1', 'cria'), fechamento('f2', 'p2', 'vedado')];
const ITENS = new Map<string, FechamentoItem[]>([
  ['f1', [item('f1', 100, 450)]],
  ['f2', []],
]);
const CATEGORIAS: CategoriaRebanho[] = [];

function montar() {
  return render(
    <ResumoAtividadesView
      pastos={[P_VIROU, P_VEDADO, P_SEM_FECH]}
      fechamentos={FECHAMENTOS}
      itensMap={ITENS}
      categorias={CATEGORIAS}
      anoMes={MES}
      onBack={vi.fn()}
    />,
  );
}

describe('Resumo da Atividade — o tipo é o do mês', () => {
  it('o pasto entra no cartão do que ELE ERA no mês, não do que é hoje', () => {
    montar();
    /* `p1` é engorda no cadastro e estava em cria em agosto: as 100 cabeças são de Cria. */
    expect(screen.getByText('Cria')).toBeInTheDocument();
    /* ⚠ DUAS OCORRENCIAS, e as duas importam: o cabeçalho da tela e o cartão de Cria. Como
       ele é o único balde com rebanho, o total da tela TEM de ser igual ao dele — se a
       lente do cadastro voltasse, as 100 iriam para Engorda e o cartão de Cria sumiria,
       deixando uma só ocorrência. */
    expect(screen.getAllByText('100 cab')).toHaveLength(2);
    expect(screen.queryByText('Engorda')).not.toBeInTheDocument();
  });

  it('"vedado" aparece — ele só existe no mês e sumia da tela', () => {
    montar();
    expect(screen.getByText(/vedado/i)).toBeInTheDocument();
  });

  it('o pasto sem fechamento tem balde próprio e nomeado', () => {
    montar();
    /* ⚠ Não é atividade: é ausência de dado, e o rótulo diz isso. */
    expect(screen.getByText('Sem fechamento no mês')).toBeInTheDocument();
  });

  it('a área órfã NÃO entra no denominador de nenhuma atividade', () => {
    montar();
    /* Cria tem 100 ha e 100 cabeças. Se os 200 ha do pasto sem fechamento entrassem no
       mesmo balde, a área do cartão de Cria seria 300 — e a UA/ha, um terço da real. */
    expect(screen.getByText('100,0 ha')).toBeInTheDocument();
    expect(screen.getByText('200,0 ha')).toBeInTheDocument();
    expect(screen.queryByText('300,0 ha')).not.toBeInTheDocument();
  });

  it('cada pasto conta uma vez só — três pastos, três cartões', () => {
    montar();
    expect(screen.getAllByText(/^1 pasto$/)).toHaveLength(3);
  });
});
