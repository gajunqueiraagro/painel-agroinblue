/**
 * FOLHA-DOC-VIEW-01 (Gabriel 24/11) — a página do recibo/holerite do contador (`folha_documentos`) aparece no lançamento pela
 * `vw_lancamento_documentos` (origem 'folha'): o Resumo diz "Holerite ✓", a contagem do clipe a conta, ela abre no bucket da Folha e
 * na aba Documentos só se lê (sem editar/cancelar). Dado sintético.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
import { docDaLinha, documentoDoResumo, resumoDosDocumentos, type DocumentoDaLinha } from '@/lib/financeiro/documentoHelper';
import { rotuloEspecieDoc } from '@/hooks/useLancamentoDocumentos';

const daFolhaNaLista: DocumentoDaLinha = { especie: 'holerite', numero: null, origem: 'folha', nome: 'Holerite · 13º 1ª · Fulano Sintético' };
const daFolhaNoModal: DocumentoDaLinha = { especie: 'outro', numero: null, origem: 'folha', nome: 'Holerite · 13º 1ª · Fulano Sintético' };

describe('o holerite da folha no lançamento', () => {
  it('sem número próprio, a linha diz "Holerite" e o Resumo "Holerite ✓" — vindo da lista (holerite) ou do modal (outro)', () => {
    for (const d of [daFolhaNaLista, daFolhaNoModal]) {
      const doc = docDaLinha({ tipo_documento: null, numero_documento: null }, [d]);
      expect(doc).toMatchObject({ rotulo: 'Holerite', origem: 'folha', clipe: true, resumo: '1 holerite' });
      expect(documentoDoResumo(doc, null)).toEqual({ numero: 'Holerite', selo: '✓', titulo: 'Holerite · 13º 1ª · Fulano Sintético' });
    }
  });
  it('a NF (ou o número do próprio lançamento) manda sobre o holerite; o resumo conta os dois', () => {
    const nf: DocumentoDaLinha = { especie: 'nf', numero: '910', origem: 'lancamento' };
    const doc = docDaLinha({ tipo_documento: null, numero_documento: null }, [daFolhaNaLista, nf]);
    expect(doc.origem).toBe('nota');
    expect(resumoDosDocumentos([daFolhaNaLista, nf])).toBe('NF 000.000.910 · 1 holerite');
    expect(docDaLinha({ tipo_documento: 'Recibo', numero_documento: '12' }, [daFolhaNaLista]).origem).toBe('lancamento');
  });
  it('cancelado não conta', () => {
    expect(docDaLinha({}, [{ ...daFolhaNaLista, cancelado: true }])).toMatchObject({ rotulo: '', clipe: false });
  });
  it('o rótulo da espécie na aba é "Holerite"', () => {
    expect(rotuloEspecieDoc({ origem: 'folha', especie: 'outro', especieOC: null })).toBe('Holerite');
  });
});

describe('lido da fonte', () => {
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useLancamentoDocumentos.ts'), 'utf8');
  const aba = readFileSync(resolve(process.cwd(), 'src/components/financeiro-v2/AbaDocumentosLancamento.tsx'), 'utf8');
  it('abre no bucket da Folha; editar, cancelar e anexar recusam a página da folha', () => {
    expect(hook).toContain("const bucket = origem === 'operacao' ? BUCKET_OC : origem === 'folha' ? BUCKET_FOLHA : BUCKET;");
    expect(hook).toContain("const BUCKET_FOLHA = 'folha-documentos';");
    expect(hook).toContain("if (!clienteId || origemDoDocumento(documentoId) === 'folha') return false;");
    expect(hook).toContain("if (!habilitado || !clienteId || destino.origem === 'folha') return false;");
    expect(hook).toContain("o === 'folha' ? 'folha'");
  });
  it('na aba: selo "da folha", o lápis desabilitado e sem o cancelar', () => {
    expect(aba).toContain('data-testid="selo-folha"');
    expect(aba).toContain("disabled={somenteLeitura || d.origem === 'folha'}");
    expect(aba).toContain("{d.origem !== 'folha' && l.membros.every((m) => (m.ligadoAQtd ?? 1) <= 1) && (");
  });
});
