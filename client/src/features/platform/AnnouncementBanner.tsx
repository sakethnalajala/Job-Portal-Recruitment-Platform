import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Megaphone } from 'lucide-react';
import { get } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface PublicSettings {
  platformName: string;
  supportEmail: string | null;
  registration: { candidate: boolean; recruiter: boolean };
  maintenance: { enabled: boolean; message: string | null };
  announcement: { message: string; tone: 'info' | 'success' | 'warning' } | null;
}

export function usePublicSettings() {
  return useQuery({ queryKey: ['settings', 'public'], queryFn: () => get<PublicSettings>('/settings/public'), select: (r) => r.data, staleTime: 60_000 });
}

/** Admin-controlled banner shown under the public navbar (announcement and/or maintenance notice). */
export function AnnouncementBanner() {
  const { data } = usePublicSettings();
  if (!data) return null;
  const items: { tone: 'info' | 'success' | 'warning'; text: string; icon: React.ReactNode }[] = [];
  if (data.maintenance.enabled) items.push({ tone: 'warning', text: data.maintenance.message ?? 'The platform is under maintenance.', icon: <AlertTriangle className="h-4 w-4" /> });
  if (data.announcement) items.push({ tone: data.announcement.tone, text: data.announcement.message, icon: data.announcement.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : data.announcement.tone === 'warning' ? <Megaphone className="h-4 w-4" /> : <Info className="h-4 w-4" /> });
  if (items.length === 0) return null;
  const cls = { info: 'bg-info-bg text-info border-info/30', success: 'bg-success-bg text-success border-success/30', warning: 'bg-warning-bg text-warning border-warning/30' };
  return (
    <div role="status" aria-live="polite">
      {items.map((it, i) => (
        <div key={i} className={cn('border-b px-4 py-2 text-center text-sm font-medium', cls[it.tone])}>
          <span className="inline-flex items-center gap-2">{it.icon}<span className="text-text">{it.text}</span></span>
        </div>
      ))}
    </div>
  );
}
