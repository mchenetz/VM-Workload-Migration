import { useState } from 'react';

interface Permission {
  object: string;
  privileges: string[];
}

interface PermissionsInfoProps {
  platform: string;
  userLabel: string;
  permissions: Permission[];
  notes?: string[];
}

export function PermissionsInfo({ platform, userLabel, permissions, notes }: PermissionsInfoProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-blue-900/50 bg-blue-950/30 px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <span className="text-xs font-medium text-blue-300">
            Minimum {platform} permissions required for {userLabel}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-blue-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {permissions.map((group) => (
            <div key={group.object}>
              <p className="text-xs font-semibold text-slate-300 mb-1">{group.object}</p>
              <ul className="space-y-0.5">
                {group.privileges.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs text-slate-400">
                    <span className="mt-0.5 text-blue-500 shrink-0">•</span>
                    <span className="font-mono">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {notes && notes.length > 0 && (
            <div className="border-t border-blue-900/40 pt-2 space-y-1">
              {notes.map((n) => (
                <p key={n} className="text-xs text-slate-500 italic">{n}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
