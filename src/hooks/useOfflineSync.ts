import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getQueue, removeFromQueue, QueuedLancamento } from '@/lib/offlineQueue';
import { toast } from 'sonner';

export function useOfflineSync(fazendaId: string | undefined, onSyncComplete: () => void) {
  const [pendingCount, setPendingCount] = useState(getQueue().length);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const syncingRef = useRef(false);

  // Track online status
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Refresh pending count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPendingCount(getQueue().length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const syncQueue = useCallback(async () => {
    if (!fazendaId || syncingRef.current || !navigator.onLine) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);

    let synced = 0;
    let errors = 0;

    for (const item of queue) {
      try {
        if (item.action === 'insert') {
          const insertData = {
            fazenda_id: item.fazendaId,
            ...item.data,
          };
          const { error } = await supabase.from('lancamentos').insert(insertData as any);
          if (error) throw error;
        } else if (item.action === 'update') {
          const { error } = await supabase.from('lancamentos')
            .update(item.data as any)
            .eq('id', item.data.id);
          if (error) throw error;
        } else if (item.action === 'delete') {
          const { error } = await supabase.from('lancamentos')
            .delete()
            .eq('id', item.data.id);
          if (error) throw error;
        }
        removeFromQueue(item.id);
        synced++;
      } catch (err) {
        errors++;
        console.error('Sync error for item', item.id, err);
      }
    }

    setPendingCount(getQueue().length);
    syncingRef.current = false;
    setSyncing(false);

    if (synced > 0) {
      toast.success(`${synced} lançamento(s) sincronizado(s)!`);
      onSyncComplete();
    }
    if (errors > 0) {
      toast.error(`${errors} lançamento(s) falharam. Tentaremos novamente.`);
    }
  }, [fazendaId, onSyncComplete]);

  // Auto-sync when coming online
  useEffect(() => {
    if (online && getQueue().length > 0) {
      syncQueue();
    }
  }, [online, syncQueue]);

  // Periodic retry
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine && getQueue().length > 0) {
        syncQueue();
      }
    }, 30000); // every 30s
    return () => clearInterval(interval);
  }, [syncQueue]);

  return { pendingCount, syncing, online, syncQueue };
}
