/**
 * CAIXA-ATUALIZAR-01 — a chegada na Caixa: a última (o arrastado não conta), os e-mails novos (mensagens, não anexos) e o texto do lugar fixo.
 */
import { describe, it, expect } from 'vitest';
import { dataHoraCurta, novosEmails, textoDaChegada, ultimaChegada } from './chegadasDaCaixa';
import { entradaDaLinha } from './entradaEmailApi';

const e = (id: string, mensagem_id: string, recebido_em: string, origem = 'email') =>
  entradaDaLinha({ id, mensagem_id, recebido_em, origem, estado: 'a_ler', tipo: 'pdf', storage_path: `c/entrada/${id}`, md5: id.padEnd(32, '0') });

describe('a chegada na Caixa', () => {
  const lista = [e('a', '<m1>', '2026-11-27T18:50:31Z'), e('b', '<m1>', '2026-11-27T18:50:31Z'), e('c', '<m0>', '2026-11-16T22:42:40Z'),
    e('d', '<arr>', '2026-11-28T10:00:00Z', 'arrastado')];
  it('a última chegada é a do e-mail mais novo (o arrastado não conta); sem e-mail, "—"', () => {
    expect(ultimaChegada(lista)).toBe('2026-11-27T18:50:31Z');
    expect(ultimaChegada([lista[3]])).toBeNull();
    expect(dataHoraCurta(null)).toBe('—');
  });
  it('novos = MENSAGENS que não estavam (2 anexos do mesmo e-mail = 1); o arrastado não é e-mail novo', () => {
    expect(novosEmails(new Set(['c']), lista)).toBe(1);
    expect(novosEmails(new Set(), lista)).toBe(2);
    expect(novosEmails(new Set(['a', 'b', 'c']), lista)).toBe(0);
  });
  it('o texto: o aviso por 60 s, depois a última chegada', () => {
    expect(textoDaChegada({ n: 1, em: 1000 }, 1000 + 59_000, null)).toBe('1 novo e-mail · agora');
    expect(textoDaChegada({ n: 2, em: 1000 }, 1000, null)).toBe('2 novos e-mails · agora');
    expect(textoDaChegada({ n: 1, em: 1000 }, 1000 + 61_000, null)).toBe('última chegada: —');
  });
});
