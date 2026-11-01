/**
 * FECH-ROTACAO-01 · FATIA 2 — os grupos de pastejo no cadastro de pastos (dado SINTÉTICO; a API do banco é falsa, injetada).
 *   G1 a área do grupo é a soma (sem área = sem número) · G2 quem pode entrar: ativo, sem grupo ou deste grupo, não escolhido
 *   G3 a resposta sem frase não vira prévia · G4 a lista: membros, área, inativos só com o seletor, ordenar pela área
 *   G5 novo grupo: o Salvar só acende com a prévia DO QUE ESTÁ NA TELA e grava exatamente aquilo (simular=false, mesmos pastos)
 *   G6 a recusa do banco vai inteira e o Salvar apaga · G7 "já está assim" não grava · G8 desativar passa pela prévia antes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { GruposDePastejo } from './GruposDePastejo';
import {
  areaDoGrupo, pastosQuePodemEntrar, lerPrevia,
  type ApiGruposDePastejo, type GrupoDePastejo, type PastoDoGrupo, type PreviaDoGrupo,
} from '@/lib/pastos/gruposDePastejo';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PASTOS: PastoDoGrupo[] = [
  { id: 'a', nome: 'P10A', area_produtiva_ha: 21.4, ativo: true, grupo_id: 'g1' },
  { id: 'b', nome: 'P10B', area_produtiva_ha: 22.9, ativo: true, grupo_id: 'g1' },
  { id: 'c', nome: 'P10C', area_produtiva_ha: 20, ativo: true, grupo_id: null },
  { id: 'd', nome: 'P11', area_produtiva_ha: 35.5, ativo: true, grupo_id: null },
  { id: 'e', nome: 'P12 velho', area_produtiva_ha: 9, ativo: false, grupo_id: null },
  { id: 'f', nome: 'T-A1', area_produtiva_ha: 12, ativo: true, grupo_id: 'g2' },
];
const GRUPOS: GrupoDePastejo[] = [
  { id: 'g1', fazenda_id: 'faz', nome: 'P10', ativo: true },
  { id: 'g2', fazenda_id: 'faz', nome: 'Terminação', ativo: true },
  { id: 'g3', fazenda_id: 'faz', nome: 'Antigo', ativo: false },
];

const previa = (p: Partial<PreviaDoGrupo>): PreviaDoGrupo => ({
  simulado: true, semMudanca: false, grupoId: null, frase: 'Cria o grupo X: 2 pastos, 55,50 ha.', entram: [], saem: [], areaHa: 55.5, ...p,
});

function apiFalsa(over: Partial<ApiGruposDePastejo> = {}) {
  const api: ApiGruposDePastejo = {
    listar: vi.fn<ApiGruposDePastejo['listar']>(async () => ({ ok: true, dados: GRUPOS })),
    salvar: vi.fn<ApiGruposDePastejo['salvar']>(async (a) => ({ ok: true, dados: previa({ simulado: a.simular }) })),
    desativar: vi.fn<ApiGruposDePastejo['desativar']>(async (_id, simular) => ({ ok: true, dados: previa({ simulado: simular, frase: 'Desativa o grupo P10: 2 pastos voltam a ficar sem grupo, com o mesmo nome e a mesma área.' }) })),
    ...over,
  };
  return api;
}

function montar(api: ApiGruposDePastejo, mostrarInativos = false) {
  const aoGravar = vi.fn();
  render(<GruposDePastejo fazendaId="faz" fazendaCodigo="PUR" pastos={PASTOS} grupos={GRUPOS} carregando={false} erro={null}
    mostrarInativos={mostrarInativos} podeEditar api={api} aoGravar={aoGravar} />);
  return { aoGravar };
}

const linhas = () => screen.getAllByTestId('grupo-linha').map((l) => l.textContent ?? '');
const esperarPrevia = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); };

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

describe('G1–G3 as contas puras', () => {
  it('G1 a área do grupo é a soma, com 2 casas; ninguém com área = sem número', () => {
    expect(areaDoGrupo([{ area_produtiva_ha: 21.4 }, { area_produtiva_ha: 22.9 }, { area_produtiva_ha: null }])).toBe(44.3);
    expect(areaDoGrupo([{ area_produtiva_ha: null }])).toBeNull();
    expect(areaDoGrupo([])).toBeNull();
  });
  it('G2 quem pode entrar: ativo, sem grupo ou já deste grupo, e ainda não escolhido', () => {
    expect(pastosQuePodemEntrar(PASTOS, null, []).map((p) => p.nome)).toEqual(['P10C', 'P11']);
    expect(pastosQuePodemEntrar(PASTOS, 'g1', ['a']).map((p) => p.nome)).toEqual(['P10B', 'P10C', 'P11']);
  });
  it('G3 resposta sem frase é recusa, nunca prévia vazia; entram/saem lidos sem `as`', () => {
    expect(lerPrevia({ ok: true }).ok).toBe(false);
    const r = lerPrevia({ simulado: true, frase: 'O grupo P10: 3 pastos, 64,30 ha.', area_ha: '64.3', entram: [{ id: 'c', nome: 'P10C', area_ha: 20 }, { lixo: 1 }], saem: [] });
    expect(r.ok && r.dados.areaHa).toBe(64.3);
    expect(r.ok && r.dados.entram.map((p) => p.nome)).toEqual(['P10C']);
  });
});

describe('G4 a lista', () => {
  it('membros pelo nome inteiro, a área somada, o inativo só com "Inativos"', () => {
    montar(apiFalsa());
    expect(linhas()).toHaveLength(2);
    expect(linhas()[0]).toContain('P10A, P10B');
    expect(linhas()[0]).toContain('44,30');
    expect(screen.queryByText('Antigo')).toBeNull();
  });
  it('com "Inativos" o inativo aparece, sem pastos; ordenar pela área põe o maior primeiro', () => {
    montar(apiFalsa(), true);
    expect(linhas()).toHaveLength(3);
    expect(screen.getByText('Antigo').closest('tr')?.textContent).toContain('sem pastos');
    fireEvent.click(screen.getByTitle('Ordenar por Área (ha)'));
    expect(linhas()[0]).toContain('P10');
    expect(linhas()[1]).toContain('Terminação');
  });
});

describe('G5–G8 o modal', () => {
  it('G5 novo: Salvar só com a prévia do que está na tela; grava o mesmo nome e os mesmos pastos', async () => {
    const api = apiFalsa();
    const { aoGravar } = montar(api);
    fireEvent.click(screen.getByTestId('grupo-novo'));
    const dlg = screen.getByTestId('grupo-dialog');
    expect(within(dlg).getByTestId('grupo-salvar')).toBeDisabled();
    fireEvent.change(within(dlg).getByTestId('grupo-nome'), { target: { value: 'Retiro' } });
    for (const nome of ['P10C', 'P11']) {
      fireEvent.click(within(dlg).getByRole('button', { name: /Adicionar pasto/ }));
      fireEvent.click(await screen.findByText(nome));
    }
    expect(within(dlg).getByTestId('grupo-area').textContent).toBe('55,50');
    await esperarPrevia();
    expect(api.salvar).toHaveBeenLastCalledWith({ grupoId: null, fazendaId: 'faz', nome: 'Retiro', pastoIds: ['c', 'd'], simular: true });
    expect(within(dlg).getByTestId('previa-frase').textContent).toBe('Cria o grupo X: 2 pastos, 55,50 ha.');
    /* mudou o nome depois da prévia: o Salvar apaga até a prévia nova chegar */
    fireEvent.change(within(dlg).getByTestId('grupo-nome'), { target: { value: 'Retiro 2' } });
    expect(within(dlg).getByTestId('grupo-salvar')).toBeDisabled();
    await esperarPrevia();
    fireEvent.click(within(dlg).getByTestId('grupo-salvar'));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    expect(api.salvar).toHaveBeenLastCalledWith({ grupoId: null, fazendaId: 'faz', nome: 'Retiro 2', pastoIds: ['c', 'd'], simular: false });
  });

  it('G6 a recusa do banco vai inteira ao lado e o Salvar fica apagado', async () => {
    const frase = 'O pasto P10A já está no grupo P10. Tire-o de lá antes. Nada foi gravado.';
    montar(apiFalsa({ salvar: vi.fn<ApiGruposDePastejo['salvar']>(async () => ({ ok: false, erro: frase })) }));
    fireEvent.click(screen.getByText('Terminação'));
    const dlg = screen.getByTestId('grupo-dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: /Adicionar pasto/ }));
    fireEvent.click(await screen.findByText('P11'));
    await esperarPrevia();
    expect(within(dlg).getByTestId('previa-recusa').textContent).toBe(frase);
    expect(within(dlg).getByTestId('grupo-salvar')).toBeDisabled();
  });

  it('G7 editar sem mudar nada: "já está assim" e nada é gravado', async () => {
    const api = apiFalsa({ salvar: vi.fn<ApiGruposDePastejo['salvar']>(async () => ({ ok: true, dados: previa({ semMudanca: true, frase: 'O grupo P10 já está assim.' }) })) });
    montar(api);
    fireEvent.click(screen.getByText('P10'));
    const dlg = screen.getByTestId('grupo-dialog');
    expect(within(dlg).getAllByTestId('grupo-pasto').map((l) => l.textContent)).toEqual(['P10A21,40', 'P10B22,90']);
    await esperarPrevia();
    expect(within(dlg).getByTestId('previa-frase').textContent).toBe('O grupo P10 já está assim.');
    expect(within(dlg).getByTestId('grupo-salvar')).toBeDisabled();
    expect(api.salvar).toHaveBeenCalledTimes(1);
  });

  it('G8 desativar: primeiro a prévia (nada gravado), depois Confirmar grava', async () => {
    const api = apiFalsa();
    const { aoGravar } = montar(api);
    fireEvent.click(screen.getByText('P10'));
    const dlg = screen.getByTestId('grupo-dialog');
    fireEvent.click(within(dlg).getByTestId('grupo-desativar'));
    await waitFor(() => expect(within(dlg).getByTestId('previa-frase').textContent).toContain('Desativa o grupo P10'));
    expect(api.desativar).toHaveBeenCalledWith('g1', true);
    expect(aoGravar).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByTestId('grupo-confirmar-desativar'));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    expect(api.desativar).toHaveBeenLastCalledWith('g1', false);
  });
});
