/**
 * FIN-NFE-PARCELAS-01, PR 1 — a aba Documentos do "Novo lançamento", ANTES de salvar.
 *
 * A lista e o formulário são montados de verdade. A ligação com o salvar do `LancamentoV2Dialog` e
 * com o `FinanceiroV2Tab` é LIDA DA FONTE: os dois não se montam em teste (contexto, supabase,
 * dezenas de hooks) — o mesmo método de `finV2HomologFix01.test.ts`. A cadeia depois do salvar está
 * em `src/lib/financeiro/documentosPendentes.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DocumentosPendentes, apiDePendentes } from '@/components/financeiro-v2/DocumentosPendentes';
import { novoPendente, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';

function Palco({ inicial = [], parcelado = false, travado = false }: { inicial?: DocumentoPendente[]; parcelado?: boolean; travado?: boolean }) {
  const [lista, setLista] = useState<DocumentoPendente[]>(inicial);
  return (
    <>
      <DocumentosPendentes pendentes={lista} onMudar={setLista} fornecedores={[{ id: 'f1', nome: 'St Repro' }]}
        parcelado={parcelado} travado={travado} />
      <output data-testid="n">{lista.length}</output>
    </>
  );
}

describe('pendentes antes de salvar', () => {
  it('a lista A31 mostra o documento como "pendente", com a data dd/mm/aa e o valor à direita', () => {
    const p = novoPendente({ especie: 'nf', numero: '18112', serie: '2', dataEmissao: '2026-09-24', valorDocumento: 24052, emitenteNome: 'St Repro' },
      new File(['%PDF'], 'nfe_18112.pdf', { type: 'application/pdf' }));
    render(<Palco inicial={[p]} />);
    const linha = screen.getByText('18112 · série 2').closest('tr');
    expect(linha?.textContent).toContain('NF');
    expect(linha?.textContent).toContain('24/09/26');
    expect(linha?.textContent).toContain('St Repro');
    expect(linha?.textContent).toContain('nfe_18112.pdf');
    expect(linha?.textContent).toContain('pendente');
    expect(screen.getByText('1 documento pendente · gravados ao salvar o lançamento')).toBeTruthy();
    /* cabeçalho navy de 9,5px (A31) */
    expect(screen.getByText('Espécie').className).toContain('text-[9.5px]');
    expect(screen.getByText('Espécie').className).toContain('bg-primary');
  });

  it('o formulário da aba adiciona à lista, sem gravar nada, e o botão diz isso', async () => {
    render(<Palco />);
    fireEvent.click(screen.getByText('Adicionar documento'));
    fireEvent.change(screen.getAllByPlaceholderText('Opcional')[0], { target: { value: '777' } });
    fireEvent.click(screen.getByText('Adicionar à lista'));
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('1'));
    expect(screen.getByText('777')).toBeTruthy();
    expect(screen.queryByText('Adicionar à lista')).toBeNull();
  });

  it('tirar da lista remove o pendente; travado (depois do salvar), a lista não se edita', () => {
    const { unmount } = render(<Palco inicial={[novoPendente({ especie: 'recibo' }, null)]} />);
    fireEvent.click(screen.getByLabelText('Tirar da lista'));
    expect(screen.getByTestId('n').textContent).toBe('0');
    unmount();
    render(<Palco inicial={[novoPendente({ especie: 'recibo' }, null)]} travado />);
    expect(screen.queryByLabelText('Tirar da lista')).toBeNull();
    expect(screen.getByText('Adicionar documento').closest('button')?.disabled).toBe(true);
  });

  it('no parcelado a aba avisa, em uma linha, que os documentos vão para a parcela 1 — e à vista não', () => {
    const { unmount } = render(<Palco parcelado />);
    expect(screen.getByTestId('aviso-parcela-1').textContent).toContain('parcela 1');
    unmount();
    render(<Palco />);
    expect(screen.queryByTestId('aviso-parcela-1')).toBeNull();
  });

  it('arquivo recusado no mesmo clique DESFAZ o registro — o segundo clique não duplica o pendente', async () => {
    let lista: DocumentoPendente[] = [];
    const mudar = (f: (l: DocumentoPendente[]) => DocumentoPendente[]) => { lista = f(lista); };
    const api = apiDePendentes(lista, mudar);
    const criado = await api.registrar({ especie: 'nf' });
    expect(lista).toHaveLength(1);
    await expect(api.anexar(criado!.id, 1, new File(['x'], 'a.txt', { type: 'text/plain' }), { origem: 'lancamento', operacaoId: null }))
      .rejects.toThrow('Formato não aceito');
    expect(lista).toHaveLength(0);
    /* na EDIÇÃO (versão 2) o arquivo recusado não tira o documento da lista */
    const outro = await api.registrar({ especie: 'boleto' });
    await act(async () => {
      await expect(api.anexar(outro!.id, 2, new File(['x'], 'a.txt', { type: 'text/plain' }), { origem: 'lancamento', operacaoId: null }))
        .rejects.toThrow();
    });
    expect(lista).toHaveLength(1);
  });
});

const dialogo = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');

describe('ligação com o salvar (lida da fonte)', () => {
  it('à vista: o id que o onSave devolve recebe a cadeia antes de fechar; sem pendentes, fecha como antes', () => {
    const trecho = dialogo.slice(dialogo.indexOf('const ok = await onSave(form, currentEditId || undefined);'));
    expect(trecho).toContain("if (!currentIsEdit && pendentes.length > 0) {");
    expect(trecho).toContain("const idCriado = typeof ok === 'string' ? ok : null;");
    expect(trecho).toContain('const tudo = await gravarPendentesDepoisDoSalvar(idCriado);');
    expect(trecho).toContain('if (tudo) onClose();');
  });

  it('parcelado: o uuid da RPC leva à parcela 1, e só então fecha', () => {
    expect(dialogo).toContain('const financiamentoId = await gravarParcelamento(payload, clienteAtual.id, () => qc.invalidateQueries());');
    expect(dialogo).toContain('const parcela1 = financiamentoId ? await lancamentoDaParcela1(financiamentoId) : null;');
    expect(dialogo).toContain('if (!(await gravarPendentesDepoisDoSalvar(parcela1))) return;');
    expect(dialogo).toContain("return typeof data === 'string' ? data : null;");
  });

  it('falha: a frase fica ao lado do botão, sem toast, e o "Tentar de novo" substitui o salvar', () => {
    const ini = dialogo.indexOf('{posSalvar ? (');
    const rodape = dialogo.slice(ini, dialogo.indexOf(') : (', ini));
    expect(rodape).toContain('data-testid="erro-documentos"');
    expect(rodape).toContain('onClick={tentarDeNovo}');
    expect(rodape).not.toContain('onClick={handleSubmit}');
    const cadeia = dialogo.slice(dialogo.indexOf('const gravarPendentesDepoisDoSalvar'), dialogo.indexOf('const tentarDeNovo'));
    expect(cadeia).not.toContain('toast');
    expect(cadeia).toContain('setPosSalvar({');
  });

  it('só o Financeiro V2 liga a aba antes de salvar, e ele devolve o id do lançamento criado', () => {
    expect(tela).toContain('documentosAntesDeSalvar');
    expect(tela).toContain("const criadoId = id ? null : await hook.criarLancamentoComId(form, { origem: 'manual' });");
    expect(tela).toContain('return criadoId ?? true;');
    expect(tela).toContain('if (criadoId && clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);');
    /* sem a prop, a aba segue dizendo para salvar antes (os outros 13 chamadores) */
    expect(dialogo).toContain('Salve o lançamento para anexar documentos.');
  });
});
