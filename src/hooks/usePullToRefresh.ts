import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  enabled?: boolean;
  threshold?: number;
  maxDistance?: number;
  settleDistance?: number;
  scrollSelector?: string;
}

export function usePullToRefresh(
  onRefresh: () => Promise<unknown>,
  {
    enabled = true,
    threshold = 64,
    maxDistance = 96,
    settleDistance = 44,
    scrollSelector = '.content-area',
  }: PullToRefreshOptions = {},
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const scrollElement = document.querySelector<HTMLElement>(scrollSelector);
    if (!scrollElement) return;

    const updateDistance = (distance: number) => {
      distanceRef.current = distance;
      setPullDistance(distance);
    };

    const resetGesture = () => {
      startYRef.current = null;
      setIsPulling(false);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || scrollElement.scrollTop > 0) {
        return;
      }
      startYRef.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null || event.touches.length !== 1) return;

      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0 || scrollElement.scrollTop > 0) {
        updateDistance(0);
        resetGesture();
        return;
      }

      if (event.cancelable) event.preventDefault();
      setIsPulling(true);
      updateDistance(Math.min(maxDistance, delta * 0.45));
    };

    const handleTouchEnd = () => {
      if (startYRef.current === null) return;

      const shouldRefresh = distanceRef.current >= threshold && !refreshingRef.current;
      resetGesture();

      if (!shouldRefresh) {
        updateDistance(0);
        return;
      }

      refreshingRef.current = true;
      setIsRefreshing(true);
      updateDistance(settleDistance);

      void onRefreshRef.current().finally(() => {
        refreshingRef.current = false;
        if (!mountedRef.current) return;
        setIsRefreshing(false);
        updateDistance(0);
      });
    };

    const handleTouchCancel = () => {
      resetGesture();
      if (!refreshingRef.current) updateDistance(0);
    };

    scrollElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    scrollElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    scrollElement.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      scrollElement.removeEventListener('touchstart', handleTouchStart);
      scrollElement.removeEventListener('touchmove', handleTouchMove);
      scrollElement.removeEventListener('touchend', handleTouchEnd);
      scrollElement.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [enabled, maxDistance, scrollSelector, settleDistance, threshold]);

  return {
    pullDistance,
    isPulling,
    isRefreshing,
    isArmed: pullDistance >= threshold,
    progress: Math.min(pullDistance / threshold, 1),
  };
}
