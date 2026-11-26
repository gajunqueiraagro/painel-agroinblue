/**
 * FOLHA-TELAS-03 (3) — a FAZENDA do funcionário em tabela: o CÓDIGO da fazenda da 1ª atuação ("SED"), "+N" quando divide com outras
 * ("SED +1"), e o rateio inteiro no `title` ("SED Sede · Pecuária 60% · RET Retiro · Agricultura 40%"). Código = `fazendas.codigo` do
 * contexto; sem código, o nome.
 * ⚠ Arquivo PRÓPRIO (e não o `folhaTela.ts`, que o lançamento alcança em 17 telas fora da Folha — régua de fonte do gate).
 */
import { rotuloAtividade, type Atuacao } from '@/lib/folha/folhaTela';

export type CodigoDaFazenda = (fazendaId: string | null) => string | null;
export function codigosDasFazendas(fazendas: ReadonlyArray<{ id: string; codigo?: string | null }>): CodigoDaFazenda {
  const m = new Map(fazendas.map(f => [f.id, f.codigo?.trim() || null]));
  return id => (id ? m.get(id) ?? null : null);
}
const sigla = (a: Atuacao, codigo: CodigoDaFazenda): string => codigo(a.fazenda_id) ?? a.fazenda ?? '—';
const n0 = (v: number): string => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function rotuloDaFazenda(a: readonly Atuacao[], codigo: CodigoDaFazenda): string {
  if (a.length === 0) return '—';
  return a.length === 1 ? sigla(a[0], codigo) : `${sigla(a[0], codigo)} +${a.length - 1}`;
}
export function tituloDaFazenda(a: readonly Atuacao[], codigo: CodigoDaFazenda): string {
  return a.map(x => {
    const c = codigo(x.fazenda_id);
    const nome = [c && x.fazenda && c !== x.fazenda ? `${c} ${x.fazenda}` : c ?? x.fazenda, x.atividade && rotuloAtividade(x.atividade)].filter(Boolean).join(' · ');
    return `${nome} ${n0(x.pct)}%`;
  }).join(' · ');
}
