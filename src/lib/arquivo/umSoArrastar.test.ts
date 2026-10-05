/**
 * UI-ARRASTAR-ARQUIVO-01b — UMA implementação de arrastar arquivo no sistema.
 *
 * `onDrop`, `onDragOver`, `onDragEnter`, `onDragLeave` e `dataTransfer` só existem no hook `useSoltarArquivo` e na proteção
 * global. Tela nenhuma escreve o gesto por conta própria — usa a `AreaDeArquivo` ou espalha o `alvo` do hook.
 * ⚠ EXCEÇÕES NOMEADAS, e só elas: as duas áreas de FOTO de telas só-admin (área alta com prévia), que ficam para o 01c.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');
const GESTO = /\bonDrop\b|\bonDragOver\b|\bonDragEnter\b|\bonDragLeave\b|\bdataTransfer\b/;
const DONOS = ['lib/arquivo/useSoltarArquivo.ts', 'lib/arquivo/protegerSoltarFora.ts'];
const FICAM_PARA_O_01C = ['components/MapaRebanhoImportDialog.tsx', 'pages/CadernoImportTab.tsx'];

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) return fontes(p);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) ? [p] : [];
  });
}

describe('o gesto de arrastar arquivo tem um dono', () => {
  const comGesto = fontes(RAIZ).filter(p => GESTO.test(readFileSync(p, 'utf8'))).map(p => relative(RAIZ, p)).sort();
  it('a busca sabe achar: os donos estão na lista', () => {
    for (const d of DONOS) expect(comGesto).toContain(d);
  });
  it('fora dos donos, só as duas exceções do 01c', () => {
    expect(comGesto.filter(p => !DONOS.includes(p))).toEqual([...FICAM_PARA_O_01C].sort());
  });
  it('quem recebe arquivo usa a área do sistema ou o hook', () => {
    const usa = (p: string, texto: string) => expect(readFileSync(join(RAIZ, p), 'utf8')).toContain(texto);
    for (const p of [
      'components/financeiro-v2/AbaDocumentosLancamento.tsx', 'components/financeiro-v2/AnexarBoletosDialog.tsx',
      'components/financeiro-v2/NovoDeXmlDialog.tsx', 'components/compra/DocumentoFormOC.tsx',
      'components/conciliacao/SaldoRealDialog.tsx', 'components/conciliacao/ImportarBancoInline.tsx',
      'v2/components/mesa/enriquecimento/EnriquecerTresPassos.tsx', 'v2/components/mesa/enriquecimento/EnriquecimentoImportarDialog.tsx',
    ]) usa(p, '<AreaDeArquivo');
    usa('components/financeiro-v2/ParcelasDaCompra.tsx', 'useSoltarArquivo(');
    usa('components/ui/area-de-arquivo.tsx', 'useSoltarArquivo(');
  });
});
