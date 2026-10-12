import type { ChaveDoMes, FonteDeDocumentosDoMes } from '@/hooks/useDocumentosDoMes';

/** Banco de mentira dos documentos do mês (FECH-DOCS-01): guarda as linhas em memória e anota cada ida, na ordem. */
export interface LinhaFake {
  id: string; cliente_id: string; fazenda_id: string; ano_mes: string; especie: string; nome: string; url: string | null;
  tamanho_bytes: number | null; uploaded_em: string; versao: number; cancelado: boolean; cancelado_motivo: string | null;
}

export function criarFonteFake(inicial: Partial<LinhaFake>[] = []) {
  let serie = 0;
  const linhas: LinhaFake[] = inicial.map(l => ({
    id: l.id ?? `doc-${++serie}`, cliente_id: l.cliente_id ?? 'cli', fazenda_id: l.fazenda_id ?? 'faz', ano_mes: l.ano_mes ?? '2031-03',
    especie: l.especie ?? 'outro', nome: l.nome ?? 'a.pdf', url: l.url === undefined ? 'cli/faz/2031-03/x.pdf' : l.url,
    tamanho_bytes: l.tamanho_bytes ?? 2048, uploaded_em: l.uploaded_em ?? '2031-03-05T12:00:00Z', versao: l.versao ?? 1,
    cancelado: l.cancelado ?? false, cancelado_motivo: l.cancelado_motivo ?? null,
  }));
  const idas: string[] = [];
  const falhas = { subir: null as string | null, listar: null as string | null, cancelar: null as string | null };

  const fonte: FonteDeDocumentosDoMes = {
    async usuario() { return 'usuario-1'; },
    async listar(c: ChaveDoMes) {
      idas.push(`listar:${c.fazendaId}:${c.anoMes}`);
      if (falhas.listar) return { linhas: [], erro: falhas.listar };
      return {
        linhas: linhas.filter(l => l.cliente_id === c.clienteId && l.fazenda_id === c.fazendaId && l.ano_mes === c.anoMes && !l.cancelado)
          .map(l => ({ ...l })),
        erro: null,
      };
    },
    async inserir(l) {
      idas.push(`inserir:${l.especie}:${l.nome}`);
      const id = `doc-${++serie}`;
      linhas.unshift({
        id, cliente_id: l.clienteId, fazenda_id: l.fazendaId, ano_mes: l.anoMes, especie: l.especie, nome: l.nome, url: null,
        tamanho_bytes: l.tamanhoBytes, uploaded_em: '2031-03-06T12:00:00Z', versao: 1, cancelado: false, cancelado_motivo: null,
      });
      return { id, erro: null };
    },
    async subir(caminho) {
      idas.push(`subir:${caminho}`);
      return falhas.subir ? { ok: false, erro: falhas.subir } : { ok: true, erro: null };
    },
    async gravarCaminho(id, _cliente, caminho) {
      idas.push(`gravarCaminho:${id}`);
      const l = linhas.find(x => x.id === id);
      if (l) l.url = caminho;
      return { ok: true, erro: null };
    },
    async renomear(id, _cliente, versao, dados) {
      idas.push(`renomear:${id}:v${versao}:${dados.especie}:${dados.nome}`);
      const l = linhas.find(x => x.id === id && x.versao === versao && !x.cancelado);
      if (!l) return { ok: true, erro: null, alcancou: false };
      l.especie = dados.especie; l.nome = dados.nome; l.versao = versao + 1;
      return { ok: true, erro: null, alcancou: true };
    },
    async cancelar(id, _cliente, motivo) {
      idas.push(`cancelar:${id}:${motivo}`);
      if (falhas.cancelar) return { ok: false, erro: falhas.cancelar };
      const l = linhas.find(x => x.id === id);
      if (l) { l.cancelado = true; l.cancelado_motivo = motivo; }
      return { ok: true, erro: null };
    },
    async urlAssinada(caminho) {
      idas.push(`url:${caminho}`);
      return `https://assinada.test/${caminho}`;
    },
  };
  return { fonte, linhas, idas, falhas };
}

export const arquivoFake = (nome: string, tipo = 'application/pdf', bytes = 9) =>
  new File([new Uint8Array(bytes)], nome, { type: tipo });
