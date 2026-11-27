/**
 * REGRA DO GABRIEL (27/11 11:58) — RISCO ZERO AO CLIENTE: só a Ciência da Operação (210210) sai do sistema; Confirmação (210200),
 * Desconhecimento (210220) e Operação não Realizada (210240) NUNCA. Teste de MUTAÇÃO das três travas independentes:
 *   S1 o envelope montado passa nas três (o controle: o teste sabe aceitar)
 *   S2 o envelope MUTADO para 210200/210220/210240 é recusado pela conferência do código (`exigirSoCiencia`)
 *   S3 … e pela regra da Lambda `agro-dfe-mtls` (`conferirEnvelope`: só o formato literal do 210210)
 *   S4 o banco tem o CHECK `tp_evento = '210210'` em `fiscal_dfe_eventos` (e nenhuma migration o tira)
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envelopeCiencia, exigirSoCiencia, EVENTOS_PERMITIDOS } from '../../../../supabase/functions/_shared/dfe/eventoCiencia';
import { conferirEnvelope } from '../../../../infra/dfe-mtls/src/regra';

const CPF = '52998224725';
const CHAVE = '35261199999999000191550040012266161157868177';
let envelope = '';
beforeAll(() => {
  const k = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = '01';
  c.validity.notBefore = new Date('2025-01-01'); c.validity.notAfter = new Date('2030-01-01');
  c.setSubject([{ shortName: 'CN', value: `PRODUTORA SINTETICA:${CPF}` }]); c.setIssuer([{ shortName: 'CN', value: 'AC SINTETICA' }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  const par = { cert: forge.pki.certificateToPem(c), key: forge.pki.privateKeyToPem(k.privateKey) };
  envelope = envelopeCiencia({ ambiente: 'producao', documento: CPF, chave: CHAVE, agora: new Date('2026-11-27T12:00:00Z'), idLote: '1794900000123', par }).envelope;
}, 60000);

const CONCLUSIVOS: [string, string][] = [['210200', 'Confirmacao da Operacao'], ['210220', 'Desconhecimento da Operacao'], ['210240', 'Operacao nao Realizada']];
const mutar = (env: string, tp: string, desc: string) =>
  env.split('210210').join(tp).replace('<descEvento>Ciencia da Operacao</descEvento>', `<descEvento>${desc}</descEvento>`);

describe('só a ciência (210210) sai do sistema', () => {
  it('S1 o envelope de ciência passa nas travas do código e da Lambda', () => {
    expect(EVENTOS_PERMITIDOS).toEqual(['210210']);
    expect(() => exigirSoCiencia(envelope)).not.toThrow();
    expect(conferirEnvelope(envelope, 'producao').ok).toBe(true);
  });
  it.each(CONCLUSIVOS)('S2/S3 o envelope mutado para %s (%s) é recusado pelo código E pela Lambda', (tp, desc) => {
    const m = mutar(envelope, tp, desc);
    expect(m).toContain(`<tpEvento>${tp}</tpEvento>`);
    expect(() => exigirSoCiencia(m)).toThrow(/Só a Ciência da Operação/);
    expect(conferirEnvelope(m, 'producao').ok).toBe(false);
    /* só trocar o tipo e manter a descrição também não passa */
    expect(() => exigirSoCiencia(envelope.replace('<tpEvento>210210</tpEvento>', `<tpEvento>${tp}</tpEvento>`))).toThrow();
  });
  it('S4 o banco: o CHECK tp_evento = 210210 está numa migration e nenhuma posterior o derruba', () => {
    const dir = 'supabase/migrations';
    const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const cria = arquivos.find((f) => /tp_evento\s+text[^,]*check\s*\(\s*tp_evento\s*=\s*'210210'\s*\)/i.test(readFileSync(join(dir, f), 'utf8')));
    expect(cria).toBeTruthy();
    const depois = arquivos.filter((f) => f > (cria ?? ''));
    for (const f of depois) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/fiscal_dfe_eventos[\s\S]{0,200}drop\s+constraint|tp_evento[^;]*2102[024]0/i);
  });
});
