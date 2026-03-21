const QUEUE_KEY = 'offline-lancamentos-queue';

export interface QueuedLancamento {
  id: string; // temporary local id
  timestamp: number;
  action: 'insert' | 'update' | 'delete';
  fazendaId: string;
  data: Record<string, any>;
}

export function getQueue(): QueuedLancamento[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToQueue(item: QueuedLancamento) {
  const queue = getQueue();
  queue.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter(q => q.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
