export function Loading() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-48 space-y-2">
        <div className="h-1 bg-base-200 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full animate-loading-bar" />
        </div>
        <p className="text-[11px] text-base-content/40 text-center">加载中...</p>
      </div>
    </div>
  );
}
