/**
 * PR-CONC-ENRIQ-MESA-CULTURA-FASE-B — cultura e fase na linha Safra da Mesa (o banco é do FASE-A; aqui só a tela).
 *
 * ⚠ O QUE SE PROVA: o rótulo da linha pela atividade sem mudar a altura; as opções vêm do dono (`rateioLancamento.ts` —
 *   o módulo é MOCKADO com uma cultura e uma fase a mais: lista local na Mesa não as veria); o cru de lavoura mostra a
 *   cultura da planilha; o classificado sem cultura recebe a sugestão em âmbar (gravada no Salvar com `_sugestao`, só em
 *   linha não gravada); "Todas (rateia)" recusa a sugestão; trocar de atividade limpa o eixo; nada entra no checklist; a
 *   linha gravada edita e acende "alterada"; a sugestão na gravada só grava no clique, sem `_sugestao`; "a Mesa não apaga";
 *   o lado da safra no administrativo não carrega a frase (que cortava a 148px); o cache do `useCulturasDaSafra`.
 * ⚠ O jsdom NÃO MEDE: largura e altura são contrato de estilo; a medida vai no relatório.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consultas = vi.hoisted(() => ({ n: 0, safras: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (tabela: string) => {
    let safra = '';
    const b = {
      select: () => b,
      eq: (col: string, v: string) => { if (col === 'safra_id') safra = v; return b; },
      then: (cb: (r: { data: Array<{ cultura: string }>; error: null }) => void) => {
        if (tabela === 'agri_safra_area') { consultas.n += 1; consultas.safras.push(safra); }
        cb({ data: safra === 's-lav' ? [{ cultura: 'mandioca' }, { cultura: 'amendoim' }] : [], error: null });
      },
    };
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) } };
});
/* ⚠ O DONO, COM UMA CULTURA E UMA FASE A MAIS: se a Mesa tivesse lista própria, "Cultura Teste" e "Fase Teste" não
   apareceriam e estes testes cairiam. */
vi.mock('@/lib/agri/rateioLancamento', async (orig) => {
  const real = await orig<typeof import('@/lib/agri/rateioLancamento')>();
  return {
    ...real,
    CULTURAS_LANCAMENTO: [...real.CULTURAS_LANCAMENTO, { valor: 'teste', label: 'Cultura Teste', sigla: 'TST' }],
    FASES: [...real.FASES, { valor: 'teste', label: 'Fase Teste' }],
  };
});

import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import {
  toRowVM, culturaSugeridaNoSalvar, culturaSugeridaDaPlanilha, patchesAoTrocarAtividade, diferencasDoResultado,
  DICA_NAO_APAGA,
} from '@/v2/lib/mesa/enriquecimentoView';
import { CULTURAS_LANCAMENTO, FASES } from '@/lib/agri/rateioLancamento';
import { AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';
import type { ClassificacaoItem, Safra } from '@/hooks/useFinanceiroV2';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import {
  MesaCamposTabela, checklistDaLinha, pendenciasDaLinha, ALTURA_LINHA,
} from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';
import { ResultadoCulturaFaseEditor, ResultadoSafraEditor } from '@/v2/components/mesa/enriquecimento/ResultadoCamposGravaveis';
import { useCulturasDaSafra, invalidarCulturasDaSafra, limparCacheCulturasDaSafra } from '@/hooks/useAreaPlantada';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});
beforeEach(() => { consultas.n = 0; consultas.safras = []; limparCacheCulturasDaSafra(); });

const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Variável',
  centro_custo: 'Centro', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Fertilizantes Agricultura', 'agricultura'), cls('Nutrição', 'pecuaria')];
const SAFRAS: Safra[] = [
  { id: 's-lav', nome: 'Lavoura 25/26', ativa: true, codigo: '25/26-Lav', escopo_negocio: 'agricultura' },
  { id: 's-pec', nome: 'Pecuária 26/27', ativa: true, codigo: '26/27-Pec', escopo_negocio: 'pecuaria' },
];
const GRAVADO = '2026-10-02T17:13:28Z';
const DEPOIS = '2026-10-02T17:20:00Z';

/* Classificado de lavoura SEM cultura no lançamento; a planilha diz "Mandioca 2025/2026" (cultura derivada: mandioca). */
const CLASSIFICADO: Partial<ClassificacaoStagingPreviewRow> = {
  staging_id: 's-cl', lanc_id: 'l-cl', match_status: 'ja_classificado', lanc_origem_lancamento: 'recorrencia',
  lanc_descricao: 'Adubo', lanc_valor: 1200, excel_valor: 1200, lanc_sinal: '-1', lanc_tipo_operacao: '2-Saídas',
  lanc_data_pagamento: '2026-09-22', excel_data_pagamento: '2026-09-22', lanc_data_competencia: '2026-09-19',
  lanc_subcentro_atual: 'Fertilizantes Agricultura', lanc_plano_conta_id_atual: 'Fertilizantes Agricultura',
  lanc_fazenda_id: 'pureza', lanc_conta_bancaria_id: 'sic', lanc_conta_bancaria_nome: 'Sicredi Lavoura',
  lanc_safra_id: 's-lav', lanc_safra_codigo: '25/26-Lav', excel_safra: 'Mandioca 2025/2026',
  planilha_cultura: 'mandioca', lanc_cultura: null, proposto_cultura: null,
};
/* O cru de lavoura: a precedência já subiu a cultura da planilha à proposta. */
const CRU: Partial<ClassificacaoStagingPreviewRow> = {
  ...CLASSIFICADO, staging_id: 's-cru', lanc_id: 'l-cru', match_status: 'divergente', lanc_origem_lancamento: 'ofx',
  lanc_subcentro_atual: null, lanc_plano_conta_id_atual: null, lanc_safra_id: null, lanc_safra_codigo: null,
  proposto_subcentro: 'Fertilizantes Agricultura', proposto_subcentro_existe_no_plano: true, proposto_fazenda_id: 'pureza',
  proposto_safra_id: 's-lav', proposto_cultura: 'mandioca',
};
const vm = (base: Partial<ClassificacaoStagingPreviewRow>, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) =>
  toRowVM(linhaCrua({ ...base, ...sobre }), [], { classificacoes: CLASSIF, safras: SAFRAS });
const montar = (r: ReturnType<typeof vm>, atividade: string | null,
  extra: { onEditar?: ReturnType<typeof vi.fn>; recusada?: boolean; onRecusar?: ReturnType<typeof vi.fn> } = {}) => {
  const onEditar = extra.onEditar ?? vi.fn(() => Promise.resolve());
  render(<MesaCamposTabela row={r} classificacoes={CLASSIF} safras={SAFRAS} onEditar={onEditar}
    onAtividade={vi.fn()} atividade={atividade} culturasDaSafra={['mandioca']}
    culturaRecusada={extra.recusada} onRecusarCultura={extra.onRecusar} />);
  return onEditar;
};
const linhaSafra = () => screen.getByTestId('linha-Safra');
const segundo = () => within(linhaSafra()).getByTestId('segundo-controle-safra');
const abrir = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
const opcoes = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('D1 — o rótulo da linha Safra pela atividade, sem mudar a altura', () => {
  it.each([
    ['agricultura', 'Safra · Cultura', 'cultura'],
    ['pecuaria', 'Safra · Fase', 'fase'],
    ['administrativo', 'Safra', 'nenhum'],
  ])('%s -> "%s", eixo %s, linha de 22px', (atividade, rotulo, eixo) => {
    montar(vm(CLASSIFICADO), atividade);
    const tr = linhaSafra();
    expect(within(tr).getAllByRole('cell')[0].textContent).toBe(rotulo);
    expect(tr.style.height).toBe(ALTURA_LINHA);
    expect(segundo().getAttribute('data-eixo')).toBe(eixo);
  });

  it('fora de lavoura e pecuária o segundo controle EXISTE, em leitura "—", com o motivo no title', () => {
    montar(vm(CLASSIFICADO), 'administrativo');
    const l = within(segundo()).getByTestId('cultura-fase-leitura');
    expect(l.textContent).toBe('—');
    expect(l.getAttribute('title')).toBe('não se aplica a esta atividade');
  });
});

describe('D3 — as opções vêm de rateioLancamento.ts', () => {
  it('cultura: "Todas (rateia)" + CULTURAS_LANCAMENTO, com as plantadas primeiro e a marca "· plantada"', () => {
    render(<ResultadoCulturaFaseEditor eixo="cultura" value={null} valorAtual={null} culturasDaSafra={['mandioca']}
      onEditar={vi.fn(() => Promise.resolve())} />);
    abrir(screen.getByTestId('editor-cultura'));
    const ops = opcoes();
    expect(ops).toContain('Cultura Teste');                     // a do mock: a lista é a do dono
    expect(ops[0]).toBe('Todas (rateia)');
    expect(ops[1]).toBe('Mandioca· plantada');
    expect(ops).toHaveLength(1 + CULTURAS_LANCAMENTO.length);
  });

  it('fase: "rateia" + FASES', () => {
    render(<ResultadoCulturaFaseEditor eixo="fase" value={null} valorAtual={null}
      onEditar={vi.fn(() => Promise.resolve())} />);
    abrir(screen.getByTestId('editor-fase'));
    expect(opcoes()).toEqual(['rateia', ...FASES.map((f) => f.label)]);
    expect(opcoes()).toContain('Fase Teste');
  });
});

describe('D2/D4/D5 — o que mostra e o que sugere', () => {
  it('cru de lavoura com a planilha "Mandioca 2025/2026": "Vai gravar" = Mandioca; a planilha mostra a cultura junto', () => {
    montar(vm(CRU), 'agricultura');
    expect(within(segundo()).getByTestId('editor-cultura').textContent).toBe('Mandioca');
    const cels = within(linhaSafra()).getAllByRole('cell');
    expect(cels[1].textContent).toContain('Mandioca');
  });

  it('classificado sem cultura + planilha com cultura: sugestão âmbar, primeiro item do menu, e o Salvar a grava', () => {
    const r = vm(CLASSIFICADO);
    montar(r, 'agricultura');
    const gat = within(segundo()).getByTestId('editor-cultura');
    expect(gat.className).toMatch(/border-amber-500/);
    expect(gat.textContent).toBe('Mandioca');
    abrir(gat);
    expect(opcoes()[0]).toBe('Mandioca · da planilha');
    /* o Salvar (linha NÃO gravada) grava com `_sugestao: true` — a função que a aba consulta */
    expect(culturaSugeridaNoSalvar(r, 'cultura')).toBe('mandioca');
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    expect(src).toMatch(/patch: \{ cultura: culturaSug, _sugestao: true \}/);
  });

  it('o operador escolhe "Todas (rateia)": a sugestão é recusada e nada é gravado em cultura', () => {
    const onEditar = vi.fn(() => Promise.resolve());
    const onRecusar = vi.fn();
    const r = vm(CLASSIFICADO);
    montar(r, 'agricultura', { onEditar, onRecusar });
    abrir(within(segundo()).getByTestId('editor-cultura'));
    fireEvent.click(screen.getByRole('option', { name: 'Todas (rateia)' }));
    expect(onRecusar).toHaveBeenCalledTimes(1);
    expect(onEditar).not.toHaveBeenCalled();
    /* recusada: a sugestão some e o Salvar não a grava */
    expect(culturaSugeridaDaPlanilha(r.edicao, 'cultura', true)).toBeNull();
    expect(culturaSugeridaNoSalvar(r, 'cultura', true)).toBeNull();
  });

  it('escolher o item da sugestão grava pelo editar de sempre, SEM `_sugestao` (é gesto do operador)', () => {
    const onEditar = vi.fn(() => Promise.resolve());
    montar(vm(CLASSIFICADO), 'agricultura', { onEditar });
    abrir(within(segundo()).getByTestId('editor-cultura'));
    fireEvent.click(screen.getByRole('option', { name: 'Mandioca · da planilha' }));
    expect(onEditar).toHaveBeenCalledWith({ cultura: 'mandioca' });
  });
});

describe('D6 — trocar a atividade limpa o eixo que não se aplica', () => {
  it('lavoura -> pecuária tira a cultura; pecuária -> lavoura tira a fase; administrativo tira as duas', () => {
    expect(patchesAoTrocarAtividade({ cultura: 'mandioca', fase: null }, 'pecuaria')).toEqual([{ cultura: null }]);
    expect(patchesAoTrocarAtividade({ cultura: null, fase: 'cria' }, 'agricultura')).toEqual([{ fase: null }]);
    expect(patchesAoTrocarAtividade({ cultura: 'soja', fase: 'cria' }, 'administrativo')).toEqual([{ cultura: null }, { fase: null }]);
    expect(patchesAoTrocarAtividade({ cultura: 'soja', fase: null }, 'agricultura')).toEqual([]);
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    expect(src).toMatch(/patchesAoTrocarAtividade\(selecionado\.edicao, a\)/);
  });
});

describe('D7 — nunca é pendência', () => {
  it('o checklist não tem cultura nem fase, e a sugestão não muda as pendências', () => {
    const com = vm(CLASSIFICADO);
    const sem = vm(CLASSIFICADO, { planilha_cultura: null });
    const rotulos = checklistDaLinha(com, { classificacoes: CLASSIF, atividade: 'agricultura' }).map((i) => i.rotulo);
    expect(rotulos.some((r) => /cultura|fase/i.test(r))).toBe(false);
    expect(pendenciasDaLinha(com, { classificacoes: CLASSIF, atividade: 'agricultura' }))
      .toEqual(pendenciasDaLinha(sem, { classificacoes: CLASSIF, atividade: 'agricultura' }));
  });
});

describe('D8/D9 — linha gravada e "a Mesa não apaga"', () => {
  const GRAVADA: Partial<ClassificacaoStagingPreviewRow> = {
    ...CLASSIFICADO, aplicado: true, aplicado_em: GRAVADO, tem_estado_anterior: true,
  };

  it('gravada: o campo é editor, e mudar só a cultura acende "alterada"', () => {
    montar(vm(GRAVADA), 'agricultura');
    expect(within(segundo()).getByTestId('editor-cultura').getAttribute('role')).toBe('combobox');
    const r = vm(GRAVADA, { proposto_editado_em: DEPOIS, proposto_cultura: 'amendoim' });
    expect(diferencasDoResultado(r.edicao)).toEqual(['cultura']);
    expect(r.gravada?.alterada).toBe(true);
  });

  it('gravada: a sugestão aparece, mas o Salvar NÃO a grava — só o clique', () => {
    const r = vm(GRAVADA);
    expect(culturaSugeridaDaPlanilha(r.edicao, 'cultura')).toBe('mandioca');
    expect(culturaSugeridaNoSalvar(r, 'cultura')).toBeNull();
    const onEditar = vi.fn(() => Promise.resolve());
    montar(r, 'agricultura', { onEditar });
    abrir(within(segundo()).getByTestId('editor-cultura'));
    fireEvent.click(screen.getByRole('option', { name: 'Mandioca · da planilha' }));
    expect(onEditar).toHaveBeenCalledWith({ cultura: 'mandioca' });
  });

  it('lançamento com cultura + "Todas (rateia)": "a Mesa não apaga · mantém", sem gravar nada', () => {
    const onEditar = vi.fn(() => Promise.resolve());
    montar(vm(CLASSIFICADO, { lanc_cultura: 'amendoim' }), 'agricultura', { onEditar });
    const gat = () => within(segundo()).getByTestId('editor-cultura');
    expect(gat().getAttribute('data-nao-apaga')).toBeNull();
    abrir(gat());
    fireEvent.click(screen.getByRole('option', { name: 'Todas (rateia)' }));
    expect(onEditar).not.toHaveBeenCalled();
    expect(gat().getAttribute('data-nao-apaga')).toBe('sim');
    expect(gat().getAttribute('title')).toContain(DICA_NAO_APAGA);
    expect(gat().textContent).toBe('Amendoim');
  });

  it('gravada esvaziada depois de gravar (camposEsvaziados): o controle diz que a Mesa não apaga', () => {
    montar(vm(GRAVADA, { lanc_cultura: 'amendoim', proposto_editado_em: DEPOIS }), 'agricultura');
    expect(within(segundo()).getByTestId('editor-cultura').getAttribute('data-nao-apaga')).toBe('sim');
  });
});

describe('o lado da safra no administrativo (decisão 1 do Gabriel) — a frase vai no title', () => {
  it('sem safra: só "—"; com safra: a safra riscada; a frase inteira no title', () => {
    const { rerender } = render(<ResultadoSafraEditor value={null} valorAtual={null} safras={SAFRAS}
      onEditar={vi.fn(() => Promise.resolve())} administrativo />);
    const el = () => screen.getByTestId('safra-administrativo');
    expect(el().textContent).toBe('—');
    expect(el().getAttribute('title')).toBe(AVISO_ADMIN_SEM_SAFRA);
    rerender(<ResultadoSafraEditor value={null} valorAtual="s-lav" safras={SAFRAS}
      onEditar={vi.fn(() => Promise.resolve())} administrativo />);
    expect(el().textContent).toBe('25/26-Lav');
    expect(el().getAttribute('title')).toBe(AVISO_ADMIN_SAFRA_SAI);
    /* 153px ("— · administrativo não tem safra") e 192px (com a safra) não cabiam nos 148px do lado da safra */
    expect(el().textContent).not.toContain(AVISO_ADMIN_SEM_SAFRA);
  });
});

describe('o cache de useCulturasDaSafra (decisão 2 do Gabriel: no dono)', () => {
  it('safra já vista não reconsulta; outra safra consulta uma vez; voltar não consulta', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useCulturasDaSafra(id), { initialProps: { id: 's-lav' } });
    await waitFor(() => expect(result.current).toEqual(['amendoim', 'mandioca']));
    rerender({ id: 's-pec' });
    rerender({ id: 's-lav' });
    expect(result.current).toEqual(['amendoim', 'mandioca']);
    rerender({ id: 's-pec' });
    expect(consultas.safras).toEqual(['s-lav', 's-pec']);
  });

  it('o cadastro de área invalida a safra: quem a mostra reconsulta', async () => {
    const { result } = renderHook(() => useCulturasDaSafra('s-lav'));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(consultas.n).toBe(1);
    invalidarCulturasDaSafra('s-lav');
    await waitFor(() => expect(consultas.n).toBe(2));
  });

  it('linha de pecuária não dispara consulta: a aba só passa a safra no eixo cultura', () => {
    renderHook(() => useCulturasDaSafra(null));
    expect(consultas.n).toBe(0);
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    expect(src).toMatch(/useCulturasDaSafra\(eixoSel === 'cultura' \? safraSel : null\)/);
  });
});
