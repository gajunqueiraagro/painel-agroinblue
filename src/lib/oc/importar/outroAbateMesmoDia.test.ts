import { describe, expect, it } from 'vitest';
import { chavesDoPacote, ocParecidaEDesteAbate, type PacoteDoAbate } from './pacoteDoAbate';

/* Chat 13/11 10:10 — Pureza × Fortunceres, abate de 12/11: os bois (NFs 9218/9219) e as novilhas (NF 9232) são ordens de compra
   diferentes. A OC das novilhas, já criada, não pode fazer a importação dos bois virar "Anexar à OC existente". */
const NF_9232 = '50261152168923000231550020000092321000451807';
const NF_9219 = '50261152168923000231550020000092191000451503';
const NF_9218 = '50261152168923000231550020000092181000451490';

const pacote = (chave: string | null, nfs: string[]): PacoteDoAbate => ({
  fazenda_id: 'f', contraparte_id: 'c', data_abate: '2026-11-12', categoria: 'bois', peso_vivo_medio_kg: 550, observacoes: '',
  chave_nf: chave, lotes: [], recebimento: { valor: 0, vencimento: '2026-11-16', documento: '', observacao: '' },
  documentos: [{ especie: 'acerto', chave_acesso: null }, ...nfs.map(c => ({ especie: 'nf_principal', chave_acesso: c })), { especie: 'nf_produtor', chave_acesso: 'x' }],
});

describe('a OC parecida só bloqueia se for este abate', () => {
  it('as chaves do pacote: a chave_nf e as das NFs do frigorífico, sem repetir e sem as de outra espécie', () => {
    expect(chavesDoPacote(pacote(NF_9219, [NF_9219, NF_9218]))).toEqual([NF_9219, NF_9218]);
    expect(chavesDoPacote(pacote(null, []))).toEqual([]);
  });
  it('os bois (9218/9219) com a OC das novilhas (9232) no mesmo dia: outro abate, não bloqueia', () => {
    expect(ocParecidaEDesteAbate([NF_9232], chavesDoPacote(pacote(NF_9219, [NF_9219, NF_9218])))).toBe(false);
  });
  it('a OC com uma das NFs do pacote: é este abate, bloqueia (vira anexar / já existe)', () => {
    expect(ocParecidaEDesteAbate([NF_9218], [NF_9219, NF_9218])).toBe(true);
  });
  it('a OC lançada à mão, sem NF (o caso SM-LT06): bloqueia como antes', () => {
    expect(ocParecidaEDesteAbate([], [NF_9219])).toBe(true);
  });
  it('o pacote sem chave legível: não prova que é outro, bloqueia', () => {
    expect(ocParecidaEDesteAbate([NF_9232], [])).toBe(true);
  });
});
