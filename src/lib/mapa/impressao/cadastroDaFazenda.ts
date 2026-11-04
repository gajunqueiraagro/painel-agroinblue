/**
 * MAPA-IMPRESSAO-01 — o que a IDENTIFICAÇÃO da folha lê do cadastro da fazenda (`fazenda_cadastros`, a fonte da matrícula — a mesma
 * do rodapé do Pastos e da aba Área): município, UF, matrícula e a data em que ela foi conferida. Sem linha ou sem valor = null ("—").
 * `(supabase as any)`: o Row do `types.ts` está defasado para esta tabela (ver `useFazendaCadastro.ts`), a exceção do zero-cast.
 */
import { supabase } from '@/integrations/supabase/client';

export interface CadastroLido { municipio: string | null; uf: string | null; matricula: number | null; matriculaConferidaEm: string | null }

const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function lerCadastroLido(linha: unknown): CadastroLido {
  if (typeof linha !== 'object' || linha === null) return { municipio: null, uf: null, matricula: null, matriculaConferidaEm: null };
  const l: Record<string, unknown> = { ...linha };
  const conferida = texto(l.matricula_conferida_em);
  return { municipio: texto(l.municipio), uf: texto(l.estado), matricula: numero(l.area_total_ha), matriculaConferidaEm: conferida ? conferida.slice(0, 10) : null };
}

export async function lerCadastroDaFazenda(clienteId: string, fazendaId: string): Promise<CadastroLido> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts defasado para fazenda_cadastros (a exceção do zero-cast)
  const { data, error } = await (supabase as any).from('fazenda_cadastros')
    .select('municipio, estado, area_total_ha, matricula_conferida_em')
    .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).maybeSingle();
  if (error) throw new Error('Não consegui ler o cadastro da fazenda (município e matrícula).');
  return lerCadastroLido(data);
}
