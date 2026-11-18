/**
 * CONC-CRIAR-COM-NOTA-02 (Fatia 1, Gabriel 18/11 — caso Azulão NF 77.066 × BB 13/10 2.903,00; dados SINTÉTICOS) — no lançamento NOVO pelo extrato
 * a NOTA preenche o lançamento (o mesmo "Ler a NF"); nada se compara ("difere do quê?").
 *   N1 a NF adicionada em "Adicionar documento" com XML/PDF chama o "Ler a NF"; recibo/boleto e arquivo que não é nota, não
 *   N2 a frase do que impediu (ex.: já lançada) chega ao aviso · N3 a linha das datas ("Nota emitida 28/09, vence 10/11 · pago no banco 13/10 (28 dias antes)")
 */
import { describe, expect, it, vi } from 'vitest';
import { apiDePendentes, comLeituraDaNota } from './DocumentosPendentes';
import { linhaDasDatasDaNota } from './AbaDocumentosLancamento';
import type { DocumentoPendente } from '@/lib/financeiro/documentosPendentes';

function montar(ler = vi.fn(async () => null as string | null)) {
  let lista: DocumentoPendente[] = [];
  const mudar = (f: (l: DocumentoPendente[]) => DocumentoPendente[]) => { lista = f(lista); };
  const aviso = vi.fn();
  const especies = new Map<string, string>();
  const api = () => comLeituraDaNota(apiDePendentes(lista, mudar), especies, ler, aviso);
  return { api, ler, aviso, lista: () => lista };
}
const destino = { origem: 'lancamento' as const, operacaoId: null };

describe('CONC-CRIAR-COM-NOTA-02 — a NF adicionada preenche o lançamento novo', () => {
  it('N1 NF + PDF/XML → "Ler a NF" com o arquivo; recibo e arquivo que não é nota, não', async () => {
    const m = montar();
    const nf = await m.api().registrar({ especie: 'nf', numero: '000.077.066' });
    const pdf = new File(['%PDF'], '000.077.066.pdf', { type: 'application/pdf' });
    expect(await m.api().anexar(nf!.id, 1, pdf, destino)).toBe(true);
    await vi.waitFor(() => expect(m.ler).toHaveBeenCalledWith(pdf));
    const rec = await m.api().registrar({ especie: 'recibo' });
    await m.api().anexar(rec!.id, 1, new File(['%PDF'], 'recibo.pdf', { type: 'application/pdf' }), destino);
    const nf2 = await m.api().registrar({ especie: 'nf' });
    await m.api().anexar(nf2!.id, 1, new File(['x'], 'foto.jpg', { type: 'image/jpeg' }), destino);
    expect(m.ler).toHaveBeenCalledTimes(1);
    expect(m.lista()).toHaveLength(3);
  });
  it('N2 a frase do que impediu chega ao aviso; a leitura que falha também (nunca em silêncio)', async () => {
    const m = montar(vi.fn(async () => 'Esta nota já está lançada: case pelo "Casar com o banco".'));
    const nf = await m.api().registrar({ especie: 'nf' });
    await m.api().anexar(nf!.id, 1, new File(['<x/>'], 'NFe.xml', { type: 'application/xml' }), destino);
    await vi.waitFor(() => expect(m.aviso).toHaveBeenLastCalledWith('Esta nota já está lançada: case pelo "Casar com o banco".'));
    const f = montar(vi.fn(async () => { throw new Error('rede'); }));
    const nf3 = await f.api().registrar({ especie: 'nf' });
    await f.api().anexar(nf3!.id, 1, new File(['<x/>'], 'NFe.xml'), destino);
    await vi.waitFor(() => expect(f.aviso).toHaveBeenLastCalledWith('Não consegui ler a nota para preencher o lançamento.'));
  });
  it('N3 a linha das datas: emissão, vencimento da duplicata e o pagamento do banco, com os dias', () => {
    expect(linhaDasDatasDaNota('2026-09-28', '2026-11-10', '2026-10-13')).toBe('Nota emitida 28/09, vence 10/11 · pago no banco 13/10 (28 dias antes)');
    expect(linhaDasDatasDaNota('2026-09-28', '2026-10-10', '2026-10-13')).toBe('Nota emitida 28/09, vence 10/10 · pago no banco 13/10 (3 dias depois)');
    expect(linhaDasDatasDaNota('2026-09-28', '2026-10-13', '2026-10-13')).toBe('Nota emitida 28/09, vence 13/10 · pago no banco 13/10 (no vencimento)');
    expect(linhaDasDatasDaNota('2026-09-28', null, '2026-10-13')).toBe('Nota emitida 28/09 · pago no banco 13/10');
    expect(linhaDasDatasDaNota('2026-09-28', '2026-11-10', null)).toBe('Nota emitida 28/09, vence 10/11');
  });
});
