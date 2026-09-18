import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, Cpu, Database, HardDrive, Mail, RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react';
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { adminPlatformApi } from './admin.api';

const fmtUptime = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

function Metric({ icon, label, value, ok, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; ok?: boolean | null; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ok === false ? 'bg-danger-bg text-danger' : ok ? 'bg-success-bg text-success' : 'bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300')}>{icon}</span>
      <div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="truncate text-lg font-semibold">{value}</p>{hint && <p className="text-xs text-faint">{hint}</p>}</div>
    </motion.div>
  );
}

export function SystemHealthPage() {
  const q = useQuery({ queryKey: ['admin', 'system'], queryFn: adminPlatformApi.system, select: (r) => r.data, refetchInterval: 30_000 });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div></div>;
  if (q.isError) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const dbUp = s.database.status === 'connected';

  return (
    <div>
      <PageHeader title="System health" description={`Auto-refreshes every 30s · last check ${formatDate(s.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`} actions={<Button variant="outline" size="sm" leftIcon={<RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />} onClick={() => void q.refetch()}>Refresh</Button>} />

      <div className={cn('mb-6 flex items-center gap-3 rounded-2xl border p-4', s.status === 'healthy' ? 'border-success/30 bg-success-bg' : 'border-danger/30 bg-danger-bg')}>
        <span className={cn('h-3 w-3 rounded-full', s.status === 'healthy' ? 'bg-success animate-pulse-soft' : 'bg-danger')} />
        <p className="font-semibold">{s.status === 'healthy' ? 'All systems operational' : 'Degraded — database unreachable'}</p>
        <Badge className="ml-auto capitalize">{s.api.environment}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Wifi className="h-5 w-5" />} label="API" value="Online" ok hint={`${s.api.prefix} · v${s.api.version}`} />
        <Metric icon={<Database className="h-5 w-5" />} label="MongoDB Atlas" value={dbUp ? 'Connected' : 'Disconnected'} ok={dbUp} hint={s.database.pingMs !== null ? `ping ${s.database.pingMs} ms · db ${s.database.name}` : undefined} />
        <Metric icon={<Server className="h-5 w-5" />} label="Uptime" value={fmtUptime(s.api.uptimeSeconds)} hint={`Node ${s.api.node} · ${s.api.platform}`} />
        <Metric icon={<Cpu className="h-5 w-5" />} label="Memory" value={`${s.process.heapUsedMb} MB heap`} hint={`${s.process.rssMb} MB RSS · ${s.process.cpuCount} CPUs`} />
        <Metric icon={<HardDrive className="h-5 w-5" />} label="File storage" value={s.services.storage === 'configured' ? 'Cloudinary' : 'Not configured'} ok={s.services.storage === 'configured' ? true : null} hint={s.services.storage !== 'configured' ? 'Resume downloads unavailable' : undefined} />
        <Metric icon={<Mail className="h-5 w-5" />} label="Email provider" value={s.services.email === 'resend' ? 'Resend' : 'Console (dev)'} ok={s.services.email === 'resend' ? true : null} />
        <Metric icon={<Activity className="h-5 w-5" />} label="Active sessions" value={s.activity.activeSessions} hint={`${s.activity.auditEventsLast24h} admin actions in 24h`} />
        <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Token policy" value={`${s.security.accessTokenTtlMinutes} min / ${s.security.refreshTokenTtlDays} d`} hint={`secure cookies ${s.security.secureCookies ? 'on' : 'off (dev)'}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Database collections</h2>
          <p className="text-xs text-muted">Host {s.database.host ?? '—'} · credentials are never exposed here.</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {s.database.collections.map((c) => <li key={c.name} className="flex items-center justify-between py-2"><span className="font-mono text-xs">{c.name}</span><span className="font-semibold">{c.count.toLocaleString('en-IN')}</span></li>)}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Runtime & security</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {[['Environment', s.api.environment], ['Node.js', s.api.node], ['Platform', s.api.platform], ['Heap', `${s.process.heapUsedMb} / ${s.process.heapTotalMb} MB`], ['Load average', s.process.loadAverage.join(' · ') || 'n/a on Windows'], ['CORS origins', s.security.corsOrigins.join(', ')], ['Unread notifications (all users)', s.activity.unreadNotifications]].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="truncate text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
