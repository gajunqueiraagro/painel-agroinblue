/** LOTES-LISTA-ALINHAR-01 (Gabriel 08/11 09:31, print 3M) — número nunca ao lado de texto: a linha do grupo só com o nome; no fim de
 *  cada grupo o "Subtotal <grupo>" com o nº de lotes na coluna Categoria e cab · peso · GMD nas colunas deles; o total do rodapé na
 *  mesma régua; ordenar por qualquer coluna mantém os grupos e os subtotais no lugar. */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CadastroDoLote, LoteDaLista } from '@/lib/lotes/tipos';

const dados = vi.hoisted(() => ({ lotes: [] as unknown[], cadastros: [] as unknown[] }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', nome: 'Faz. 3 Muchachas', codigo: '3M' }, isGlobal: false }) }));
vi.mock('@/hooks/useLotesDaFazenda', () => ({ useLotesDaFazenda: () => ({ lotes: dados.lotes, carregando: false, erro: null }) }));
vi.mock('@/hooks/useCadastrosDoLote', () => ({ useCadastrosDoLote: () => ({ cadastros: dados.cadastros }) }));
vi.mock('@/components/lotes/FichaDoLote', () => ({ FichaDoLote: () => null }));
vi.mock('@/components/lotes/AssistenteDoLote', () => ({ AssistenteDoLote: () => null }));

import { LotesTab } from './LotesTab';

const cad = (id: string, tipo: CadastroDoLote['tipo'], sigla: string, nome: string): CadastroDoLote =>
  ({ id, tipo, sigla, nome, categoriasRebanho: [], ordem: 10, ativo: true });
const lote = (id: string, atividadeId: string, codigo: string, cabecas: number | null, pesoMedioKg: number | null, gmdKg: number | null): LoteDaLista => ({
  id, codigo, codigosAntigos: [], nomeCampeiro: null, situacao: 'ativo', formadoEm: '2026-01-01', encerradoEm: null, categoriaId: 'vac', racaId: 'ne',
  atividadeId, numero: 1, sistemaId: null, programaId: null, destinoId: null, safra: null, carimbo: null, idadeMediaMeses: null, metaPesoKg: null,
  metaGmdKg: null, metaData: null, versao: 1, anoMesDado: '2026-11', cabecas, pesoMedioKg, gmdKg, pastos: [], lancamentos: 1, conferir: null,
});
dados.cadastros = [cad('cr', 'atividade', 'CR', 'Cria'), cad('rc', 'atividade', 'RC', 'Recria'), cad('vac', 'categoria', 'VAC', 'Vaca'), cad('ne', 'raca', 'NE', 'Nelore')];
dados.lotes = [
  lote('a', 'cr', 'CR-VAC-NE-01', 100, 400, 0.2), lote('b', 'cr', 'CR-VAC-NE-02', 50, 300, 0.5),
  lote('c', 'rc', 'RC-VAC-NE-01', 10, 250, 1), lote('d', 'rc', 'RC-VAC-NE-02', 30, 210, null),
];
const celulas = (tr: Element) => Array.from(tr.querySelectorAll('td')).map(td => td.textContent);
/** as linhas do corpo em ordem: G = grupo, S = subtotal, o código = lote */
const ordem = () => Array.from(screen.getByTestId('tabela-lotes').querySelectorAll('tbody tr')).map(tr =>
  tr.getAttribute('data-testid') === 'grupo-lotes' ? `G ${tr.textContent}` : tr.getAttribute('data-testid') === 'grupo-lotes-subtotal' ? `S ${celulas(tr)[0]}` : tr.textContent?.slice(0, 12));

describe('LotesTab — subtotal alinhado (LOTES-LISTA-ALINHAR-01)', () => {
  it('a linha do grupo só tem o nome; o subtotal fecha o grupo com cada número na coluna dele; o total na mesma régua', () => {
    render(<LotesTab />);
    const grupos = screen.getAllByTestId('grupo-lotes');
    expect(grupos.map(g => g.textContent)).toEqual(['Cria', 'Recria']);
    expect(grupos[0].querySelectorAll('td')).toHaveLength(1);
    const [cria, recria] = screen.getAllByTestId('grupo-lotes-subtotal');
    /* Código · Categoria · Raça · Programa · Cab · Peso (ponderado) · GMD (ponderado) · Pasto */
    expect(celulas(cria)).toEqual(['Subtotal Cria', '2 lotes', '', '', '150', '367', '0,300', '']);
    expect(celulas(recria)).toEqual(['Subtotal Recria', '2 lotes', '', '', '40', '220', '1,000', '']);
    expect(celulas(within(screen.getByTestId('lotes-total')).getByRole('row'))).toEqual(['Total', '4 lotes', '', '', '190', '336', '0,344', '']);
    expect(ordem()).toEqual(['G Cria', 'CR-VAC-NE-01', 'CR-VAC-NE-02', 'S Subtotal Cria', 'G Recria', 'RC-VAC-NE-01', 'RC-VAC-NE-02', 'S Subtotal Recria']);
  });

  it('ordenar por Cab (as duas direções) troca os lotes dentro do grupo; grupos e subtotais ficam no lugar', () => {
    render(<LotesTab />);
    fireEvent.click(screen.getByRole('columnheader', { name: /Cab/ }));
    const um = ordem();
    fireEvent.click(screen.getByRole('columnheader', { name: /Cab/ }));
    const outro = ordem();
    const crescente = ['G Cria', 'CR-VAC-NE-02', 'CR-VAC-NE-01', 'S Subtotal Cria', 'G Recria', 'RC-VAC-NE-01', 'RC-VAC-NE-02', 'S Subtotal Recria'];
    const decrescente = ['G Cria', 'CR-VAC-NE-01', 'CR-VAC-NE-02', 'S Subtotal Cria', 'G Recria', 'RC-VAC-NE-02', 'RC-VAC-NE-01', 'S Subtotal Recria'];
    expect([um, outro].sort()).toEqual([crescente, decrescente].sort());
    expect(celulas(screen.getAllByTestId('grupo-lotes-subtotal')[0])).toEqual(['Subtotal Cria', '2 lotes', '', '', '150', '367', '0,300', '']);
  });
});
