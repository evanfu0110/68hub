import { useCallback, useEffect, useRef, useState } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { fetcherRef.current = fetcher; });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    fetchData();

    intervalRef.current = setInterval(() => {
      fetcherRef.current()
        .then((result) => { setData(result); setError(null); })
        .catch((e) => setError(e));
    }, intervalMs);

    const onVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else {
        fetchData();
        intervalRef.current = setInterval(() => {
          fetcherRef.current()
            .then((result) => { setData(result); setError(null); })
            .catch((e) => setError(e));
        }, intervalMs);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled, fetchData]);

  return { data, error, loading, refetch: fetchData };
}
