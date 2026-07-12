export function Loading() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="relative flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-base-200" />
        <div className="absolute w-8 h-8 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <div className="absolute w-5 h-5 rounded-full bg-primary/10" />
      </div>
    </div>
  );
}
