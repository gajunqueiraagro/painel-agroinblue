/**
 * FIN-MODAL-FAZENDA-TRAVA-01 (Gabriel 21/10/2026) — a lista de Lançamentos não se redesenha pelo modal.
 * Com o NJ em Global a lista tem 5.279 linhas; abrir o Novo lançamento redesenhava todas (2,85 s numa máquina livre,
 * 16,8 s na do Gabriel), e cada linha montava um menu do Radix que pendurava um ouvinte de tecla no documento.
 *
 * (1) O corpo memoizado, montado de verdade, com um "pai" que tem o estado do modal e a fazenda escolhida: abrir o modal e
 *     escolher a fazenda NÃO redesenham a lista; mudar o dado redesenha.
 * (2) A ligação em `FinanceiroV2Tab.tsx`, lida da fonte: as linhas moram no corpo memoizado, a chave não tem estado do
 *     modal, e a fazenda do modal é estado DO MODAL (`LancamentoV2Dialog`), sem callback para o pai.
 * (3) O "⋯" da linha só monta o menu do Radix depois do clique.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { CorpoDaListaMemo, MenuDaLinhaSobDemanda, rendersDoCorpoDaLista, mesmaChaveDaLista } from './corpoDaLista';

const LINHAS = Array.from({ length: 50 }, (_, i) => ({ id: `l${i}`, nome: `Lançamento ${i}` }));

function PaiComModal() {
  const [linhas, setLinhas] = useState(LINHAS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fazendaId, setFazendaId] = useState('');
  return (
    <div>
      <button onClick={() => setDialogOpen(true)}>abrir modal</button>
      <button onClick={() => setFazendaId('f-pur')}>escolher fazenda</button>
      <button onClick={() => setLinhas((ls) => [...ls, { id: 'novo', nome: 'Novo' }])}>dado novo</button>
      <span data-testid="estado">{dialogOpen ? 'aberto' : 'fechado'}·{fazendaId}</span>
      <table><tbody>
        <CorpoDaListaMemo chave={[linhas]} desenhar={() => linhas.map((l) => <tr key={l.id}><td>{l.nome}</td></tr>)} />
      </tbody></table>
    </div>
  );
}

describe('FIN-MODAL-FAZENDA-TRAVA-01 — a lista não se redesenha pelo modal', () => {
  it('abrir o modal e escolher a fazenda não redesenham a lista; dado novo redesenha', () => {
    render(<PaiComModal />);
    const base = rendersDoCorpoDaLista.n;
    act(() => { fireEvent.click(screen.getByText('abrir modal')); });
    act(() => { fireEvent.click(screen.getByText('escolher fazenda')); });
    expect(screen.getByTestId('estado').textContent).toBe('aberto·f-pur');
    expect(rendersDoCorpoDaLista.n - base).toBe(0);
    act(() => { fireEvent.click(screen.getByText('dado novo')); });
    expect(rendersDoCorpoDaLista.n - base).toBe(1);
    expect(screen.getByText('Novo')).toBeTruthy();
  });

  it('a chave compara item a item, por identidade', () => {
    const m = new Map();
    expect(mesmaChaveDaLista([m, 1, 'a'], [m, 1, 'a'])).toBe(true);
    expect(mesmaChaveDaLista([m], [new Map()])).toBe(false);
    expect(mesmaChaveDaLista([m], [m, 1])).toBe(false);
  });

  it('a tela usa o corpo memoizado, e nem a chave nem as linhas dependem do estado do modal', () => {
    const fonte = readFileSync('src/pages/FinanceiroV2Tab.tsx', 'utf8');
    expect(fonte).toMatch(/<CorpoDaListaMemo chave=\{chaveDaLista\} desenhar=/);
    const chave = fonte.slice(fonte.indexOf('const chaveDaLista'), fonte.indexOf('];', fonte.indexOf('const chaveDaLista')));
    expect(chave.length).toBeGreaterThan(50);
    for (const proibido of ['dialogOpen', 'editingLanc', 'prefillDuplicar', 'prefillXml', 'linhaXmlAberta']) {
      expect(chave).not.toContain(proibido);
    }
    const corpo = fonte.slice(fonte.indexOf('<CorpoDaListaMemo'), fonte.indexOf('</tbody>', fonte.indexOf('<CorpoDaListaMemo')));
    expect(corpo).not.toMatch(/dialogOpen|setDialogOpen|<DropdownMenu>/);
    // as ações das linhas entram pela referência estável
    expect(corpo).toContain('= acoesDaLista;');
  });

  it('a fazenda do modal é estado do modal, sem callback para o pai', () => {
    const fonte = readFileSync('src/components/financeiro-v2/LancamentoV2Dialog.tsx', 'utf8');
    expect(fonte).toMatch(/const \[fazendaId, setFazendaId\] = useState/);
    expect(fonte).toMatch(/<FazendaSelect[^>]*value=\{fazendaId\}[^>]*onChange=\{setFazendaId\}/s);
  });

  it('o "⋯" só monta o menu do Radix depois do clique', () => {
    render(<MenuDaLinhaSobDemanda itens={() => <div>item do menu</div>} />);
    expect(screen.queryByText('item do menu')).toBeNull();
    expect(document.querySelector('[aria-expanded]')).toBeNull();
    act(() => { fireEvent.click(screen.getByTitle('Ações')); });
    expect(screen.getByText('item do menu')).toBeTruthy();
  });
});
