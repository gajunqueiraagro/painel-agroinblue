/** NOTAS-RECEITA-A1-01 · F2 — as regras da aba Certificado: leitura sem cast, validade (aviso 30 dias), trilha e a resposta da borda. */
import { describe, expect, it } from 'vitest';
import {
  CORPO_DO_TESTE, lerRespostaDoTeste,
  certificadoDaFicha, estadoDaValidade, FRASE_A3_NAO_SERVE, fraseDoPasso, impressaoCurta, lerCertificados, lerRespostaDoSubir, lerTrilha,
} from './certificadoTela';

const LINHA = { id: 'c1', situacao: 'ativo', documento: '52998224725', emissor: 'AC X', numero_serie: '0a', impressao_digital: 'ab'.repeat(32),
  valido_de: '2026-01-01T00:00:00+00:00', valido_ate: '2027-01-01T00:00:00+00:00', enviado_em: '2026-11-13T10:00:00+00:00' };

describe('certificadoTela', () => {
  it('lê as linhas do banco sem cast; linha torta (situação desconhecida, sem validade) fica de fora', () => {
    const l = lerCertificados([LINHA, { ...LINHA, id: 'c2', situacao: 'qualquer' }, { id: 'c3', situacao: 'ativo' }, null, 'x']);
    expect(l.map((c) => c.id)).toEqual(['c1']);
    expect(l[0]).toMatchObject({ situacao: 'ativo', numeroSerie: '0a', validoAte: '2027-01-01T00:00:00+00:00' });
    expect(lerCertificados(null)).toEqual([]);
  });
  it('a ficha mostra o ATIVO; sem ativo, o mais recente', () => {
    const [a, r] = lerCertificados([{ ...LINHA, id: 'velho', situacao: 'revogado', enviado_em: '2026-01-01' }, { ...LINHA, id: 'novo', situacao: 'revogado', enviado_em: '2026-06-01' }]);
    expect(certificadoDaFicha([a, r])?.id).toBe('novo');
    /* o ATIVO manda mesmo sendo mais antigo que um revogado */
    const [ativoVelho] = lerCertificados([{ ...LINHA, id: 'ativo-velho', enviado_em: '2025-01-01' }]);
    expect(certificadoDaFicha([r, ativoVelho])?.id).toBe('ativo-velho');
    expect(certificadoDaFicha([])).toBeNull();
  });
  it('validade: ok, aviso de 30 dias para baixo (S5), vencido com a data', () => {
    expect(estadoDaValidade('2027-01-01T00:00:00Z', '2026-11-13')).toEqual({ tom: 'ok', frase: 'válido até 01/01/2027' });
    expect(estadoDaValidade('2026-12-13T00:00:00Z', '2026-11-13')).toEqual({ tom: 'aviso', frase: 'vence em 30 dias (13/12/2026)' });
    expect(estadoDaValidade('2026-12-14T00:00:00Z', '2026-11-13').tom).toBe('ok');
    expect(estadoDaValidade('2026-11-14', '2026-11-13').frase).toBe('vence em 1 dia (14/11/2026)');
    expect(estadoDaValidade('2026-11-13', '2026-11-13').frase).toBe('vence hoje (13/11/2026)');
    expect(estadoDaValidade('2026-11-12', '2026-11-13')).toEqual({ tom: 'vencido', frase: 'vencido em 12/11/2026 — suba o novo' });
  });
  it('impressão digital curta (16 caracteres em grupos de 4, maiúsculos)', () => {
    expect(impressaoCurta('ab12cd34ef567890' + 'f'.repeat(48))).toBe('AB12 CD34 EF56 7890');
  });
  it('a trilha em frases; a recusa do envio diz o porquê sem o código', () => {
    const t = lerTrilha([{ id: 1, acao: 'recusado_upload', em: '2026-11-13', motivo: 'nao_a1' }, { id: 2, acao: 'subiu', em: '2026-11-13', motivo: null }, { acao: 'x' }]);
    expect(t.map(fraseDoPasso)).toEqual(['envio recusado: não é A1', 'certificado enviado']);
    expect(fraseDoPasso({ id: '3', acao: 'revogou', em: 'x', motivo: 'perdi o certificado' })).toBe('certificado revogado: perdi o certificado');
  });
  it('a resposta da borda: ok com avisos; em erro a frase vem do corpo em error.context (nunca a genérica quando a borda falou)', async () => {
    expect(await lerRespostaDoSubir({ data: { ok: true, acao: 'trocou', avisos: ['x', 3] }, error: null })).toEqual({ ok: true, acao: 'trocou', avisos: ['x'] });
    const erro = { message: 'non-2xx', context: new Response(JSON.stringify({ ok: false, recusa: 'nao_a1', frase: `Não é A1. ${FRASE_A3_NAO_SERVE}` }), { status: 422 }) };
    expect(await lerRespostaDoSubir({ data: null, error: erro })).toEqual({ ok: false, frase: `Não é A1. ${FRASE_A3_NAO_SERVE}` });
    expect(await lerRespostaDoSubir({ data: null, error: { message: 'rede' } })).toEqual({ ok: false, frase: 'Não consegui enviar o certificado. Nada foi gravado; tente de novo.' });
  });
});

describe('lerRespostaDoTeste — o "Testar certificado" só dá ✓ com o ENSAIO e a cadeia conferida', () => {
  const caminho = [{ nome: 'PRODUTORA SINTETICA:52998224725', ate: '2027-11-16T15:27:00.000Z' }, { nome: 'AC X', ate: '2029-01-01T00:00:00.000Z' }];
  it('o corpo pede SEMPRE o ensaio', () => {
    expect(CORPO_DO_TESTE('t1')).toEqual({ titular_id: 't1', ambiente: 'producao', ensaio: true });
  });
  it('200 SEM "ensaio: true" (seria uma busca de verdade) ou com a cadeia não ok: nunca ✓', async () => {
    expect((await lerRespostaDoTeste({ data: { ok: true, cstat: '137', cadeia: { ok: true, raiz: 'R', caminho } }, error: null })).ok).toBe(false);
    expect((await lerRespostaDoTeste({ data: { ok: true, ensaio: true, cadeia: { ok: false, motivo: 'assinatura', caminho } }, error: null })).ok).toBe(false);
    expect(await lerRespostaDoTeste({ data: { ok: true, ensaio: true, cadeia: { ok: true, raiz: 'R', caminho } }, error: null }))
      .toEqual({ ok: true, titular: 'PRODUTORA SINTETICA · ***.982.247-**', validade: 'até 16/11/2027', cadeia: 'AC X ✓ ICP-Brasil' });
  });
  it('o CPF nunca sai inteiro: nem no titular do ✓ nem no caminho da recusa', async () => {
    const ok = await lerRespostaDoTeste({ data: { ok: true, ensaio: true, cadeia: { ok: true, raiz: 'R', caminho } }, error: null });
    const nao = await lerRespostaDoTeste({ data: { ok: false, frase: 'x', cadeia: { ok: false, motivo: 'sem_intermediaria', caminho } }, error: null });
    expect(JSON.stringify([ok, nao])).not.toContain('52998224725');
    expect(JSON.stringify([ok, nao])).not.toContain('529.982.247-25');
    expect(nao.ok === false && nao.cadeia).toContain('PRODUTORA SINTETICA · ***.982.247-** → AC X');
  });
});
