/**
 * FIN-DOCUMENTOS-LAYOUT-01 — a aba Documentos do lançamento: tabela compacta de linha única e cancelados ocultos.
 *
 * ⚠ SÓ APRESENTAÇÃO: os gestos (clipe, lápis, cancelar), os selos e o confronto são os de antes e têm os seus testes
 *   (`documentoCompartilhado`, `documentosFix2`, `documentoDaCompraFix1`). Aqui se prova a forma nova: cancelado fora da
 *   vista por padrão, atrás do "mostrar"; emitente e emissão em colunas próprias; "sem arquivo" no ativo sem url.
 * ⚠ O CASO É O DO GABRIEL (Vera, "Ferramentas - 2/2", R$ 852,65): três documentos ativos e um cancelado.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import type { LancDocumento, LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';

const doc = (x: Partial<LancDocumento>): LancDocumento => ({
  id: 'd', origem: 'lancamento', operacaoId: null, especie: 'nf', especieOC: null, nome: 'nf', numero: null, serie: null,
  chaveAcesso: null, dataEmissao: null, valorDocumento: null, url: 'x.pdf', tipo: 'application/pdf', tamanhoBytes: 1,
  observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: null, cancelado: false, canceladoMotivo: null,
  versao: 2, ligadoAQtd: 1, ...x,
});
const EMITENTE = 'Comercial Pantanal de Rio Verde Ltda';
const NF = doc({ id: 'nf', numero: '18112', valorDocumento: 1705.3, emitenteNome: EMITENTE, dataEmissao: '2026-07-18' });
const BOLETO = doc({ id: 'bol', especie: 'boleto', valorDocumento: 852.65, emitenteNome: EMITENTE, dataEmissao: '2026-08-18' });
const COMPROVANTE = doc({ id: 'comp', especie: 'comprovante', url: null, emitenteNome: EMITENTE });
const CANCELADO = doc({ id: 'canc', especie: 'boleto', valorDocumento: 852.65, emitenteNome: EMITENTE, dataEmissao: '2026-08-18',
  cancelado: true, canceladoMotivo: 'anexado em duplicidade' });

function api(documentos: LancDocumento[]): LancamentoDocumentosApi {
  return {
    documentos, confronto: null, loading: false, saving: false, operacaoId: null, operacaoTipo: null,
    registrar: vi.fn(), editar: vi.fn().mockResolvedValue(true), cancelar: vi.fn().mockResolvedValue(true),
    anexar: vi.fn(), urlAssinada: vi.fn(), recarregar: vi.fn(),
  };
}
const monta = (documentos: LancDocumento[]) => render(
  <MemoryRouter><AbaDocumentosLancamento api={api(documentos)} fornecedores={[]} /></MemoryRouter>);
const linhas = () => screen.queryAllByTestId('linha-documento');
const n = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('(a) cancelado não aparece por padrão; o rodapé diz quantos são', () => {
  it('3 ativos + 1 cancelado: três linhas, nenhuma cancelada, "1 documento cancelado oculto · mostrar"', () => {
    monta([NF, CANCELADO, BOLETO, COMPROVANTE]);
    expect(linhas()).toHaveLength(3);
    expect(linhas().some(l => l.getAttribute('data-cancelado') === 'sim')).toBe(false);
    expect(screen.queryByText('Cancelado')).toBeNull();
    expect(n(screen.getByTestId('rodape-cancelados').textContent)).toBe('1 documento cancelado oculto · mostrar');
    expect(screen.getByText('3 documentos')).toBeInTheDocument();          // a contagem é a dos ATIVOS, como sempre
  });

  it('plural, e sem cancelado não há rodapé', () => {
    const { unmount } = monta([NF, CANCELADO, { ...CANCELADO, id: 'canc2' }]);
    expect(n(screen.getByTestId('rodape-cancelados').textContent)).toBe('2 documentos cancelados ocultos · mostrar');
    unmount();
    monta([NF, BOLETO]);
    expect(screen.queryByTestId('rodape-cancelados')).toBeNull();
    expect(linhas()).toHaveLength(2);
  });

  it('só cancelados: o cabeçalho e o rodapé, nenhuma linha, e a contagem diz "Nenhum documento anexado"; sem documento, sem tabela', () => {
    const { unmount } = monta([CANCELADO]);
    expect(screen.getByTestId('cabecalho-documentos')).toBeInTheDocument();
    expect(linhas()).toHaveLength(0);
    expect(n(screen.getByTestId('rodape-cancelados').textContent)).toBe('1 documento cancelado oculto · mostrar');
    expect(screen.getByText('Nenhum documento anexado')).toBeInTheDocument();
    unmount();
    monta([]);
    expect(screen.queryByTestId('tabela-documentos')).toBeNull();
  });
});

describe('(b) "mostrar" exibe o cancelado DEPOIS dos ativos, com o motivo e sem ações; "ocultar" o tira de novo', () => {
  it('a linha cancelada: riscada, "motivo: …" na coluna Emitente, selo Cancelado, nenhum botão', () => {
    monta([CANCELADO, NF, BOLETO, COMPROVANTE]);
    fireEvent.click(screen.getByText('mostrar'));
    expect(linhas()).toHaveLength(4);
    const ultima = linhas()[3];                                            // depois dos ativos, qualquer que seja a ordem da api
    expect(ultima.getAttribute('data-cancelado')).toBe('sim');
    expect(linhas().slice(0, 3).every(l => l.getAttribute('data-cancelado') === null)).toBe(true);
    expect(within(ultima).getByTestId('doc-nome').className).toContain('line-through');
    expect(within(ultima).getByTestId('doc-nome').className).not.toContain('font-semibold');
    expect(n(within(ultima).getByTestId('cel-emitente').textContent)).toBe('motivo: anexado em duplicidade');
    expect(within(ultima).getByText('Cancelado')).toBeInTheDocument();
    expect(within(ultima).queryAllByRole('button')).toHaveLength(0);       // história, não trabalho pendente
    expect(n(screen.getByTestId('rodape-cancelados').textContent)).toBe('1 documento cancelado · ocultar');
    fireEvent.click(screen.getByText('ocultar'));
    expect(linhas()).toHaveLength(3);
    expect(screen.queryByText('Cancelado')).toBeNull();
  });

  it('cancelado sem motivo mostra o emitente; os ativos seguem com as três ações', () => {
    monta([NF, { ...CANCELADO, canceladoMotivo: null }]);
    fireEvent.click(screen.getByText('mostrar'));
    expect(n(within(linhas()[1]).getByTestId('cel-emitente').textContent)).toBe(EMITENTE);
    expect(within(linhas()[0]).getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['Abrir arquivo', 'Editar documento', 'Cancelar documento']);
  });
});

describe('(c) documento ATIVO sem arquivo diz "sem arquivo", em âmbar, ao lado do emitente', () => {
  it('o aviso aparece só na linha sem url; o clipe dela fica desabilitado', () => {
    monta([NF, COMPROVANTE]);
    const [comUrl, semUrl] = linhas();
    expect(within(comUrl).queryByText('sem arquivo')).toBeNull();
    const aviso = within(semUrl).getByText('sem arquivo');
    expect(aviso.className).toContain('text-amber-700');
    expect(n(within(semUrl).getByTestId('cel-emitente').textContent)).toBe(`sem arquivo${EMITENTE}`);
    expect(within(semUrl).getByLabelText('Abrir arquivo')).toBeDisabled();
    expect(within(comUrl).getByLabelText('Abrir arquivo')).not.toBeDisabled();
  });

  it('cancelado sem url NÃO leva o aviso', () => {
    monta([{ ...CANCELADO, url: null }]);
    fireEvent.click(screen.getByText('mostrar'));
    expect(screen.queryByText('sem arquivo')).toBeNull();
  });
});

describe('(d) emitente e emissão em colunas próprias, na ordem do cabeçalho', () => {
  it('cabeçalho Documento · Emitente · Emissão · Valor · Situação; cada célula com o seu dado e o texto inteiro no title', () => {
    monta([NF, doc({ id: 'vazio', especie: 'boleto' })]);
    expect([...screen.getByTestId('cabecalho-documentos').children].map(c => c.textContent))
      .toEqual(['Documento', 'Emitente', 'Emissão', 'Valor', 'Situação', '']);
    const [a, vazio] = linhas();
    expect([...a.children].map(c => n(c.textContent)).slice(0, 5))
      .toEqual(['NF 000.018.112', EMITENTE, '18/07/2026', 'R$ 1.705,30', 'Ativo']);
    /* a grade é UMA, na tabela; o cabeçalho e as linhas são subgrades dela — alinham por construção */
    expect(screen.getByTestId('tabela-documentos').className)
      .toContain('grid-cols-[max-content_minmax(0,1fr)_70px_92px_66px_72px]');
    for (const el of [screen.getByTestId('cabecalho-documentos'), a, vazio]) {
      expect(el.className).toContain('[grid-template-columns:subgrid]');
      expect(el.className).toContain('col-span-full');
      expect(el.className).not.toMatch(/grid-cols-\[/);
    }
    /* dado ausente é "—", nunca vazio */
    expect([...vazio.children].map(c => n(c.textContent)).slice(1, 4)).toEqual(['—', '—', '—']);
  });
});

describe('(e) nada corta com reticência: o nome fica inteiro numa linha e o emitente quebra', () => {
  const LONGO = 'Cooperativa Agropecuaria dos Produtores do Mato Grosso do Sul';
  const DA_OC = doc({ id: 'oc', origem: 'operacao', operacaoId: 'op1', numero: '84', serie: '1', ligadoAQtd: 3,
    emitenteNome: LONGO, valorDocumento: 315000, dataEmissao: '2026-09-10' });

  it('nome longo com os dois selos: sem truncate, sem title de corte, célula que não quebra; a linha só tem altura MÍNIMA', () => {
    monta([DA_OC, { ...CANCELADO, canceladoMotivo: 'anexado em duplicidade na parcela errada do parcelamento' }]);
    fireEvent.click(screen.getByText('mostrar'));
    const tabela = screen.getByTestId('tabela-documentos');
    /* a busca sabe achar: a tabela tem classes; nenhuma é de corte */
    expect(tabela.querySelectorAll('[class]').length).toBeGreaterThan(10);
    expect(tabela.querySelectorAll('.truncate, [class*="text-ellipsis"], [class*="line-clamp"]')).toHaveLength(0);
    for (const l of linhas()) {
      const nome = within(l).getByTestId('doc-nome');
      expect(nome.getAttribute('title')).toBeNull();
      expect(nome.parentElement?.className).toContain('whitespace-nowrap');
      expect(nome.parentElement?.className).not.toContain('min-w-0');
      expect(l.className).toContain('min-h-[22px]');
      expect(l.className).not.toMatch(/(^| )h-\[22px\]/);
    }
    const [oc] = linhas();
    expect(within(oc).getByTestId('doc-nome').textContent).toBe('NF 000.000.084 · série 1');
    expect(within(oc).getByTestId('selo-parcelas').textContent).toBe('3 parcelas');
    expect(within(oc).getByText('da operação')).toBeInTheDocument();
  });

  it('emitente (e o motivo do cancelado) inteiro, numa célula que pode quebrar de linha', () => {
    monta([DA_OC, { ...CANCELADO, canceladoMotivo: 'anexado em duplicidade na parcela errada do parcelamento' }]);
    fireEvent.click(screen.getByText('mostrar'));
    const textos = linhas().map(l => within(l).getByTestId('doc-emitente-texto'));
    expect(textos.map(t => t.textContent)).toEqual([LONGO, 'motivo: anexado em duplicidade na parcela errada do parcelamento']);
    for (const t of textos) {
      expect(t.className).toContain('[overflow-wrap:anywhere]');
      expect(t.className).toContain('min-w-0');
      expect(t.className).not.toContain('whitespace-nowrap');
      expect(t.getAttribute('title')).toBeNull();
    }
  });
});
