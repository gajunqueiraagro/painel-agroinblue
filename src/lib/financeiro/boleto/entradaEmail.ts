/**
 * BOLETO D3c — a REGRA DA TELA do e-mail de boletos (só apresentação; quem decide é o banco, 118110).
 *
 * ⚠ O QUE CHEGOU POR E-MAIL É SEMPRE "A CONFERIR": ler um PDF é o MESMO caminho de soltar o arquivo na caixa (leitor da D1b → prévia da
 *   `fn_boleto_entrar` → "Pôr na caixa"); nada vira boleto nem lançamento sozinho.
 * ⚠ XML (nota fiscal) não se lê aqui: entra pelo "+ Novo ▾ › Da nota fiscal" (a fatia do "chegaram por e-mail" vem depois).
 * ⚠ O PASSO A PASSO é de encaminhamento POR REGRA (só os e-mails de boleto), nunca "encaminhar tudo"; o endereço da caixa do cliente
 *   não é pedido nem guardado.
 */
import type { EntradaDoEmail } from './entradaEmailApi';
import type { Selo } from './caixaDeBoletos';

export function seloDaEntrada(e: EntradaDoEmail): Selo {
  switch (e.estado) {
    case 'a_ler': return { texto: 'a ler', tom: 'azul' };
    case 'nao_reconhecido': return { texto: 'não reconhecido', tom: 'ambar' };
    case 'sem_anexo': return { texto: 'sem anexo', tom: 'cinza' };
    case 'recusado': return { texto: 'recusado', tom: 'vermelho' };
    case 'confirmacao_gmail': return { texto: 'confirmação do Gmail', tom: 'ambar' };
    case 'boleto': return { texto: 'boleto', tom: 'ok' };
    case 'nota': return { texto: 'nota', tom: 'ok' };
    case 'dispensado': return { texto: 'dispensado', tom: 'cinza' };
  }
}

/** A frase da linha: o que a pessoa faz com ela. */
export function fraseDaEntrada(e: EntradaDoEmail): string {
  if (e.estado === 'confirmacao_gmail') {
    return 'O Gmail pede para confirmar o encaminhamento: o código está no assunto. Digite-o no Gmail (Encaminhamento › Verificar) e dispense esta linha.';
  }
  if (e.estado === 'sem_anexo') return 'Chegou sem PDF nem XML. Se o boleto vem por link, baixe-o no seu e-mail e solte aqui.';
  if (e.estado === 'recusado') return e.motivo ?? 'O arquivo foi recusado na entrada.';
  if (e.tipo === 'xml') return 'Nota fiscal em XML: abra pelo "+ Novo › Da nota fiscal".';
  if (e.estado === 'nao_reconhecido') return e.motivo ?? 'Não achei a linha digitável neste PDF. Pode ser uma nota (DANFE) ou um boleto escaneado.';
  return e.chegouDeNovo > 0 ? `PDF para ler (chegou de novo ${e.chegouDeNovo}×).` : 'PDF para ler: abre como os que você solta aqui.';
}

/** Ler = baixar e passar pelo leitor da caixa. Só PDF, só a ler / não reconhecido. */
export const podeLer = (e: EntradaDoEmail): boolean =>
  e.tipo === 'pdf' && !!e.storagePath && (e.estado === 'a_ler' || e.estado === 'nao_reconhecido');

/** O motivo de trocar/revogar: o banco recusa vazio; a tela diz antes (UX-OBRIGATORIOS-01: campo vermelho, nunca toast). */
export const FRASE_MOTIVO_OBRIGATORIO = 'Escreva o motivo (o endereço antigo para de receber).';
export const motivoValido = (m: string): boolean => m.trim().length > 0;

export type ProvedorDoPasso = 'gmail' | 'outlook' | 'm365';
export const PROVEDORES: readonly { valor: ProvedorDoPasso; rotulo: string }[] = [
  { valor: 'gmail', rotulo: 'Gmail' }, { valor: 'outlook', rotulo: 'Hotmail / Outlook.com' }, { valor: 'm365', rotulo: 'Microsoft 365 (empresa)' },
];

/** O passo a passo de cada provedor (o endereço entra onde está `{endereco}`). */
export const PASSOS: Record<ProvedorDoPasso, readonly string[]> = {
  gmail: [
    'No Gmail (computador), clique na engrenagem › "Ver todas as configurações" › aba "Encaminhamento e POP/IMAP".',
    'Clique em "Adicionar um endereço de encaminhamento", cole {endereco} e confirme.',
    'O Gmail manda um código para esse endereço. Ele aparece aqui, na aba "Por e-mail", como "confirmação do Gmail" (o código está no assunto).',
    'Volte ao Gmail, digite o código e clique em "Verificar". Deixe marcado "Desativar encaminhamento": não encaminhe todos os e-mails.',
    'Crie o filtro: na barra de busca, clique no ícone de filtros › em "De" coloque os remetentes dos boletos (ex.: cobranca@fornecedor.com.br OR financeiro@outro.com.br) ou, em "Contém as palavras", boleto.',
    'Clique em "Criar filtro" › marque "Encaminhar para" › escolha {endereco} › "Criar filtro".',
  ],
  outlook: [
    'Entre em outlook.live.com (Hotmail / Outlook.com) › engrenagem (Configurações) › "Email" › "Regras".',
    'Clique em "+ Adicionar nova regra" e dê um nome, por exemplo "Boletos AgroinBlue".',
    'Em "Adicionar uma condição": "De" (os remetentes dos boletos) ou "O assunto inclui" (boleto).',
    'Em "Adicionar uma ação": "Encaminhar para" › cole {endereco}. Não use "Encaminhar como anexo": os PDFs não chegariam.',
    'Clique em "Salvar". O Outlook.com não pede código de confirmação.',
  ],
  m365: [
    'A regra é a mesma do Outlook (Outlook na web › Configurações › Email › Regras › "Encaminhar para" {endereco}).',
    'Antes, o administrador do Microsoft 365 da empresa precisa liberar o encaminhamento externo (por padrão vem bloqueado e o e-mail volta com o erro 5.7.520).',
    'O administrador libera em Microsoft Defender › Políticas › Antispam › política de saída › "Regras de encaminhamento automático" = Ativado — de preferência só para a caixa que recebe os boletos.',
  ],
};
export const passosCom = (p: ProvedorDoPasso, endereco: string | null): string[] =>
  PASSOS[p].map((s) => s.split('{endereco}').join(endereco ?? 'o endereço de boletos'));
