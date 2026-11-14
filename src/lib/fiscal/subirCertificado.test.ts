/**
 * NOTAS-RECEITA-A1-01 · F2 — a ordem do subir do certificado (a borda `fiscal-certificado-subir`) com peças FALSAS: quem não pode não lê nada,
 * toda recusa deixa trilha e não grava, o registro que falha apaga o objeto, e a resposta nunca leva a senha nem os bytes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { subirCertificado, TAMANHO_MAXIMO, type Pecas, type Pedido } from '../../../supabase/functions/_shared/subirCertificado';
import { FRASES_DA_RECUSA } from '../../../supabase/functions/_shared/certificadoA1';

const CPF = '52998224725';
const SENHA = 'senha-de-teste-123';
let pfx: Uint8Array;
beforeAll(() => {
  const k = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = '01';
  c.validity.notBefore = new Date('2026-01-01T00:00:00Z'); c.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  c.setSubject([{ shortName: 'CN', value: `PRODUTORA DE TESTE:${CPF}` }]);
  c.setIssuer([{ shortName: 'CN', value: 'AC SINTETICA' }, { shortName: 'O', value: 'ICP-Brasil' }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  pfx = Uint8Array.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k.privateKey, [c], SENHA, { algorithm: '3des' })).getBytes(), (ch) => ch.charCodeAt(0));
}, 30000);

function pecas(o: { pode?: boolean; falhaRegistro?: string; documento?: string } = {}) {
  const log: string[] = [];
  const objetos = new Map<string, Uint8Array>();
  const p: Pecas = {
    autorDoToken: async (t) => (t === 'token-bom' ? 'u1' : null),
    lerTitular: async (id) => (id === 't1' ? { id: 't1', cliente_id: 'c1', documento: o.documento ?? CPF } : null),
    podeSubir: async (autor, cliente) => { log.push(`pode ${autor} ${cliente}`); return o.pode ?? true; },
    cifrar: async (b) => { log.push('cifrar'); return Uint8Array.from(b, (x) => x ^ 0x5a); },
    gravarObjeto: async (c, b) => { log.push(`gravar ${c}`); objetos.set(c, b); },
    apagarObjeto: async (c) => { log.push(`apagar ${c}`); objetos.delete(c); },
    registrar: async (r) => {
      log.push(`registrar ${r.titularId} ${r.autor} ${r.objeto}`);
      if (o.falhaRegistro) throw new Error(o.falhaRegistro);
      return { certificadoId: 'cert-1', acao: 'subiu' };
    },
    registrarRecusa: async (t, a, r) => { log.push(`recusa ${t} ${a} ${r}`); },
    novoId: () => 'obj-1',
    agora: () => new Date('2026-11-13T12:00:00Z'),
  };
  return { p, log, objetos };
}
const pedido = (o: Partial<Pedido> = {}): Pedido => ({ token: 'token-bom', titularId: 't1', senha: SENHA, arquivo: pfx, ...o });

describe('subirCertificado — a ordem e as recusas', () => {
  it('o caminho bom: confere quem pode PELO TITULAR, cifra, grava no bucket e registra; a resposta só tem metadados', async () => {
    const { p, log, objetos } = pecas();
    const r = await subirCertificado(pedido(), p);
    expect(r.status).toBe(200);
    expect(log).toEqual(['pode u1 c1', 'cifrar', 'gravar c1/t1/obj-1.pfx.enc', 'registrar t1 u1 c1/t1/obj-1.pfx.enc']);
    /* o que vai ao bucket é o CIFRADO, nunca o .pfx como veio */
    expect([...(objetos.get('c1/t1/obj-1.pfx.enc') ?? [])].slice(0, 8)).not.toEqual([...pfx].slice(0, 8));
    const json = JSON.stringify(r);
    expect(json).not.toContain(SENHA);
    expect(r.corpo).toMatchObject({ ok: true, certificado_id: 'cert-1', acao: 'subiu', certificado: { documento: CPF, tipo: 'e-CPF' } });
  });
  it('sem login: 401 e nada lido', async () => {
    const { p, log } = pecas();
    expect((await subirCertificado(pedido({ token: 'outro' }), p)).status).toBe(401);
    expect(log).toEqual([]);
  });
  it('titular de OUTRO cliente (quem chama não pode): 403 antes de abrir o arquivo — nada cifrado, gravado nem registrado', async () => {
    const { p, log } = pecas({ pode: false });
    const r = await subirCertificado(pedido(), p);
    expect(r).toEqual({ status: 403, corpo: { ok: false, recusa: 'sem_permissao', frase: 'Só o administrador do cliente sobe o certificado.' } });
    expect(log).toEqual(['pode u1 c1']);
  });
  it('NÃO É A1 (arquivo sem a chave) e senha errada: 422 com a frase, trilha da recusa, nada gravado', async () => {
    const casos: Array<[Pedido, 'senha' | 'nao_a1']> = [
      [pedido({ senha: 'errada' }), 'senha'],
      [pedido({ arquivo: new TextEncoder().encode('-----BEGIN CERTIFICATE-----\nAAA\n') }), 'nao_a1'],
    ];
    for (const [ped, recusa] of casos) {
      const { p, log, objetos } = pecas();
      const r = await subirCertificado(ped, p);
      expect(r).toEqual({ status: 422, corpo: { ok: false, recusa, frase: FRASES_DA_RECUSA[recusa] } });
      expect(log).toEqual(['pode u1 c1', `recusa t1 u1 ${recusa}`]);
      expect(objetos.size).toBe(0);
    }
  });
  it('arquivo grande demais para ser certificado: recusa de não-A1 com trilha', async () => {
    const { p, log } = pecas();
    const r = await subirCertificado(pedido({ arquivo: new Uint8Array(TAMANHO_MAXIMO + 1) }), p);
    expect(r.corpo).toMatchObject({ ok: false, recusa: 'nao_a1' });
    expect(log).toEqual(['pode u1 c1', 'recusa t1 u1 arquivo_grande']);
  });
  it('certificado de outro CPF que não o do produtor: 422, trilha, nada gravado', async () => {
    const { p, log } = pecas({ documento: '11144477735' });
    expect((await subirCertificado(pedido(), p)).corpo).toMatchObject({ ok: false, recusa: 'documento_diferente' });
    expect(log).toEqual(['pode u1 c1', 'recusa t1 u1 documento_diferente']);
  });
  it('o banco recusou no registro: o objeto do bucket é APAGADO (nada pela metade) e a frase do banco vai à tela; erro sem frase não vai cru', async () => {
    const a = pecas({ falhaRegistro: 'Este certificado já é o ativo deste produtor. Nada foi gravado.' });
    const r = await subirCertificado(pedido(), a.p);
    expect(r).toEqual({ status: 422, corpo: { ok: false, recusa: 'banco', frase: 'Este certificado já é o ativo deste produtor. Nada foi gravado.' } });
    expect(a.log.at(-1)).toBe('apagar c1/t1/obj-1.pfx.enc');
    expect(a.objetos.size).toBe(0);
    const b = pecas({ falhaRegistro: 'connection reset by peer' });
    expect((await subirCertificado(pedido(), b.p)).corpo).toMatchObject({ ok: false, frase: 'Não consegui gravar o certificado. Nada foi gravado; tente de novo.' });
    expect(b.objetos.size).toBe(0);
  });
});
