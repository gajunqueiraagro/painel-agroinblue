import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  FRASE_TIPO_INVALIDO, anexarDocumentoDoMes, cancelarDocumentoDoMes, renomearDocumentoDoMes, useDocumentosDoMes,
} from './useDocumentosDoMes';
import { TIPOS_FAKE, arquivoFake, criarFonteFake } from '@/test/fonteDeDocumentosDoMesFake';
import {
  FRASE_DOCUMENTO_MUDOU, FRASE_MOTIVO_OBRIGATORIO, FRASE_NOME_OBRIGATORIO, dataDoEnvio, lerDocumentoDoMes, lerTiposDeDocumento,
  mesCurtoDoDocumento, mesPorExtenso, mesVizinho, nomeDoTipo, ordenarPorTipo, rotuloDoBotaoDeDocumentos, rotuloCurtoDoBotaoDeDocumentos, textoDoTamanho, tituloDosDocumentos,
} from '@/lib/pecuaria/documentosDoMes';

const CHAVE = { clienteId: 'cli', fazendaId: 'faz', anoMes: '2031-03' };

describe('FECH-DOCS-01 — dono puro', () => {
  it('FECH-DOCS-02: os tipos vêm do catálogo, na ordem do banco; tipo desconhecido é "—"; a lista se agrupa por tipo e nome', () => {
    const lidos = lerTiposDeDocumento([{ id: 'z', nome: 'Outro', grupo: 'Outros', ordem: 1000 }, { id: 'a', nome: 'Mortes', grupo: null, ordem: 60 },
      { id: '', nome: 'torto', ordem: 1 }, { id: 'b', nome: '  ', ordem: 2 }, null]);
    expect(lidos.map(t => t.nome)).toEqual(['Mortes', 'Outro']);
    expect(nomeDoTipo(TIPOS_FAKE, 't-mortes')).toBe('Mortes');
    expect(nomeDoTipo(TIPOS_FAKE, 'sumiu')).toBe('—');
    const doc = (id: string, tipoId: string, nome: string) => ({ id, tipoId, nome, url: null, tamanhoBytes: null, uploadedEm: '2031-03-05T12:00:00Z', versao: 1 });
    expect(ordenarPorTipo([doc('1', 't-outro', 'b'), doc('2', 'sumiu', 'a'), doc('3', 't-mapa', 'z'), doc('4', 't-outro', 'a'), doc('5', 't-mapa', 'c')], TIPOS_FAKE)
      .map(d => d.id)).toEqual(['5', '3', '4', '1', '2']);
  });
  it('peça torta não vira documento', () => {
    const boa = { id: 'a', tipo_id: 't-mortes', nome: 'x.pdf', url: null, tamanho_bytes: null, uploaded_em: '2031-03-05T12:00:00Z', versao: 1 };
    expect(lerDocumentoDoMes(boa)).toMatchObject({ id: 'a', tipoId: 't-mortes', url: null, tamanhoBytes: null });
    expect(lerDocumentoDoMes({ ...boa, tipo_id: null })).toBeNull();
    expect(lerDocumentoDoMes({ ...boa, nome: '  ' })).toBeNull();
    expect(lerDocumentoDoMes({ ...boa, versao: '1' })).toBeNull();
    expect(lerDocumentoDoMes(null)).toBeNull();
  });
  it('textos: tamanho, mês, título e o rótulo do botão', () => {
    expect(textoDoTamanho(null)).toBe('—');
    expect(textoDoTamanho(340 * 1024)).toBe('340 KB');
    expect(textoDoTamanho(1.2 * 1024 * 1024)).toBe('1,2 MB');
    expect(dataDoEnvio('2031-03-05T12:00:00Z')).toBe('05/03/2031');
    expect(dataDoEnvio('torto')).toBe('—');
    expect(textoDoTamanho(2048)).toBe('2 KB');
    expect(mesPorExtenso('2026-10')).toBe('out/2026');
    /* FECH-DOCS-01b: o título leva o mês curto entre as setas */
    expect(mesCurtoDoDocumento('2026-09')).toBe('set/26');
    expect(mesCurtoDoDocumento('torto')).toBe('torto');
    expect(tituloDosDocumentos('Faz. Teste', '2026-09')).toBe('Documentos do mês — Faz. Teste · ‹ set/26 ›');
    expect(mesVizinho('2026-09', -1)).toBe('2026-08');
    expect(mesVizinho('2026-09', 1)).toBe('2026-10');
    expect(mesVizinho('2026-12', 1)).toBe('2027-01');
    expect(mesVizinho('2026-01', -1)).toBe('2025-12');
    expect(mesVizinho('torto', 1)).toBe('torto');
    expect(rotuloDoBotaoDeDocumentos(0)).toBe('Documentos do mês · 0');
    expect(rotuloDoBotaoDeDocumentos(3)).toBe('Documentos do mês · 3');
    expect(rotuloDoBotaoDeDocumentos(null)).toBe('Documentos do mês · …');
    expect(rotuloDoBotaoDeDocumentos(5, true)).toBe('Documentos do mês · —');
    /* FECH-TOPO-COMPACTO-01: o rótulo curto da barra do Fechamento */
    expect(rotuloCurtoDoBotaoDeDocumentos('Documentos do mês · 11')).toBe('Documentos 11');
    expect(rotuloCurtoDoBotaoDeDocumentos('Documentos do mês · …')).toBe('Documentos …');
    expect(rotuloCurtoDoBotaoDeDocumentos('Documentos do mês · —')).toBe('Documentos —');
  });
});

describe('FECH-DOCS-01 — gestos', () => {
  it('anexar: a linha nasce sem tipo (o banco põe "Outro") com o nome que veio, registra ANTES de subir, e a chave do arquivo é o id', async () => {
    const { fonte, idas, linhas } = criarFonteFake();
    const r = await anexarDocumentoDoMes(fonte, CHAVE, arquivoFake('WhatsApp Image 2031-03-04.pdf'));
    expect(r).toEqual({ ok: true, erro: null, id: 'doc-1' });
    expect(idas).toEqual([
      'inserir:WhatsApp Image 2031-03-04.pdf', 'subir:cli/faz/2031-03/doc-1.pdf', 'gravarCaminho:doc-1',
    ]);
    expect(linhas[0]).toMatchObject({ tipo_id: 't-outro', nome: 'WhatsApp Image 2031-03-04.pdf', url: 'cli/faz/2031-03/doc-1.pdf', versao: 1 });
  });
  it('anexar: formato fora da regra é recusado sem ir ao banco', async () => {
    const { fonte, idas } = criarFonteFake();
    const r = await anexarDocumentoDoMes(fonte, CHAVE, arquivoFake('nota.xml', 'text/xml'));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/PDF/);
    expect(idas).toEqual([]);
  });
  it('anexar: arquivo que não sobe deixa a linha registrada e devolve o id com o erro', async () => {
    const { fonte, falhas, linhas } = criarFonteFake();
    falhas.subir = 'rede caiu';
    const r = await anexarDocumentoDoMes(fonte, CHAVE, arquivoFake('a.png', 'image/png'));
    expect(r).toEqual({ ok: false, erro: 'rede caiu', id: 'doc-1' });
    expect(linhas[0].url).toBeNull();
  });
  it('renomear: tipo + nome num gesto, e a versão sobe', async () => {
    const { fonte, linhas } = criarFonteFake([{ id: 'd1', nome: 'IMG.pdf' }]);
    const r = await renomearDocumentoDoMes(fonte, 'cli', { id: 'd1', versao: 1 }, { tipoId: 't-nasc', nome: '  Nascimentos março  ' }, TIPOS_FAKE);
    expect(r).toEqual({ ok: true, erro: null });
    expect(linhas[0]).toMatchObject({ tipo_id: 't-nasc', nome: 'Nascimentos março', versao: 2 });
  });
  it('renomear: versão velha não grava e diz que o documento mudou; nome vazio e tipo fora da lista nem vão ao banco', async () => {
    const { fonte, linhas, idas } = criarFonteFake([{ id: 'd1', nome: 'IMG.pdf', versao: 2 }]);
    expect(await renomearDocumentoDoMes(fonte, 'cli', { id: 'd1', versao: 1 }, { tipoId: 't-mortes', nome: 'x' }, TIPOS_FAKE))
      .toEqual({ ok: false, erro: FRASE_DOCUMENTO_MUDOU });
    expect(linhas[0]).toMatchObject({ tipo_id: 't-outro', nome: 'IMG.pdf', versao: 2 });
    const antes = idas.length;
    expect((await renomearDocumentoDoMes(fonte, 'cli', { id: 'd1', versao: 2 }, { tipoId: 't-mortes', nome: '   ' }, TIPOS_FAKE)).erro).toBe(FRASE_NOME_OBRIGATORIO);
    expect(await renomearDocumentoDoMes(fonte, 'cli', { id: 'd1', versao: 2 }, { tipoId: 'boleto', nome: 'x' }, TIPOS_FAKE))
      .toEqual({ ok: false, erro: FRASE_TIPO_INVALIDO });
    expect(idas.length).toBe(antes);
  });
  it('cancelar: exige motivo (sem ele nem vai ao banco) e não apaga a linha', async () => {
    const { fonte, linhas, idas } = criarFonteFake([{ id: 'd1' }]);
    expect(await cancelarDocumentoDoMes(fonte, 'cli', 'd1', '   ')).toEqual({ ok: false, erro: FRASE_MOTIVO_OBRIGATORIO });
    expect(idas).toEqual([]);
    expect(await cancelarDocumentoDoMes(fonte, 'cli', 'd1', ' enviado errado ')).toEqual({ ok: true, erro: null });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ cancelado: true, cancelado_motivo: 'enviado errado' });
  });
});

describe('FECH-DOCS-01 — o hook', () => {
  it('lista só os vivos da fazenda + mês; "lendo" até a resposta; outro mês = outra lista', async () => {
    const { fonte } = criarFonteFake([
      { id: 'a' }, { id: 'b', cancelado: true, cancelado_motivo: 'x' }, { id: 'c', ano_mes: '2031-04' }, { id: 'd', fazenda_id: 'outra' },
    ]);
    const { result, rerender } = renderHook(({ mes }) => useDocumentosDoMes('cli', 'faz', mes, fonte), { initialProps: { mes: '2031-03' } });
    expect(result.current.lendo).toBe(true);
    expect(result.current.documentos).toEqual([]);
    await waitFor(() => expect(result.current.lendo).toBe(false));
    expect(result.current.documentos.map(d => d.id)).toEqual(['a']);
    rerender({ mes: '2031-04' });
    expect(result.current.lendo).toBe(true);
    expect(result.current.documentos).toEqual([]);
    await waitFor(() => expect(result.current.documentos.map(d => d.id)).toEqual(['c']));
  });
  it('sem fazenda não lê nada e não fica "lendo"', async () => {
    const { fonte, idas } = criarFonteFake([{ id: 'a' }]);
    const { result } = renderHook(() => useDocumentosDoMes('cli', null, '2031-03', fonte));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.lendo).toBe(false);
    expect(idas).toEqual([]);
  });
  it('anexar, renomear e cancelar relêem a lista; erro da leitura não vira lista vazia calada', async () => {
    const { fonte, falhas } = criarFonteFake();
    const { result } = renderHook(() => useDocumentosDoMes('cli', 'faz', '2031-03', fonte));
    await waitFor(() => expect(result.current.lendo).toBe(false));
    await act(async () => { await result.current.anexar(arquivoFake('mapa.jpg', 'image/jpeg')); });
    expect(result.current.documentos).toHaveLength(1);
    const doc = result.current.documentos[0];
    expect(doc).toMatchObject({ tipoId: 't-outro', nome: 'mapa.jpg', versao: 1 });
    await waitFor(() => expect(result.current.tipos.map(t => t.id)).toEqual(TIPOS_FAKE.map(t => t.id)));
    await act(async () => { await result.current.renomear(doc, { tipoId: 't-mapa', nome: 'Mapa' }); });
    expect(result.current.documentos[0]).toMatchObject({ tipoId: 't-mapa', nome: 'Mapa', versao: 2 });
    await act(async () => { await result.current.cancelar(doc.id, 'duplicado'); });
    expect(result.current.documentos).toHaveLength(0);
    falhas.listar = 'sem rede';
    await act(async () => { await result.current.recarregar(); });
    expect(result.current.erro).toBe('sem rede');
  });
});

describe('FECH-DOCS-01 — a fonte do banco (lida da fonte)', () => {
  const f = readFileSync(resolve(process.cwd(), 'src/hooks/useDocumentosDoMes.ts'), 'utf8');
  it('renomear confere a versão lida e grava versão + 1; cancelar não apaga; ninguém apaga linha', () => {
    expect(f).toContain("versao: versao + 1");
    expect(f).toContain(".eq('versao', versao)");
    expect(f).toContain("cancelado: true, cancelado_motivo: motivo");
    expect(f).not.toMatch(/\.delete\(/);
    expect(f).toContain(".eq('ano_mes', anoMes).eq('cancelado', false)");
    expect(f).toContain("createSignedUrl(caminho, 60)");
  });
  it('FECH-DOCS-02: os tipos são os ATIVOS da lista do catálogo, globais + os do cliente; a gravação é pelo tipo_id, nunca a espécie', () => {
    expect(f).toContain(".eq('lista', 'tipo_documento_mes').eq('ativo', true).or(`cliente_id.is.null,cliente_id.eq.${clienteId}`)");
    expect(f).toContain(".update({ tipo_id: dados.tipoId, nome: dados.nome, versao: versao + 1 })");
    expect(f).not.toMatch(/especie:/);
  });
});
