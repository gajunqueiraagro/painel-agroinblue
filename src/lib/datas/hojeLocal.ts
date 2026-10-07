/**
 * "HOJE" NA DATA LOCAL DO NAVEGADOR — um dono só (PARC-FECHA-02).
 *
 * ⚠ NUNCA `new Date().toISOString().slice(0, 10)` PARA DATA DE CALENDÁRIO: `toISOString` é UTC. Em America/Campo_Grande (UTC−4),
 *   das 20h à meia-noite ele já devolve o dia SEGUINTE — a competência padrão nascia 07/10 às 22h40 do dia 06.
 *   Carimbo de INSTANTE (created_at, updated_at) continua em ISO/UTC: é outro dado.
 */
const dois = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de uma data, no fuso LOCAL. */
export function dataLocalISO(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** 'YYYY-MM-DD' de hoje, no fuso local. `agora` só existe para o teste fixar o relógio. */
export function hojeLocal(agora: Date = new Date()): string {
  return dataLocalISO(agora);
}

/** 'YYYY-MM' de hoje, no fuso local. */
export function mesLocal(agora: Date = new Date()): string {
  return hojeLocal(agora).slice(0, 7);
}
