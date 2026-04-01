interface StatusDotProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  label?: string;
}

const statusColors: Record<StatusDotProps['status'], string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-500',
  connecting: 'bg-yellow-500 animate-pulse',
  error: 'bg-red-500',
};

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColors[status]}`} />
      {label && <span className="text-sm text-slate-400">{label}</span>}
    </div>
  );
}
