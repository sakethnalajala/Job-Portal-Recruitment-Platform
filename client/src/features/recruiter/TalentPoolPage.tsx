import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookmarkPlus, ExternalLink, FolderKanban, MapPin, Pencil, Search, Star, Trash2, UserRoundSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, Textarea, APPLICATION_TONE } from '@/components/ui';
import { BackButton } from '@/components/ui/BackButton';
import { FilterPills, Pagination } from '@/components/ui/DataTable';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TagInput } from '@/components/ui/extras';
import { useListParams } from '@/features/admin/useListParams';
import { toApiError } from '@/lib/api';
import { cn, LABELS, timeAgo } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/api';
import { talentApi, type TalentEntry } from './portals.api';

export function Stars({ value, onChange, size = 'h-4 w-4' }: { value: number | null; onChange?: (v: number | null) => void; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(value === n ? null : n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={cn('rounded p-0.5 transition-transform', onChange && 'hover:scale-110', (value ?? 0) >= n ? 'text-warning' : 'text-faint')}>
          <Star className={cn(size, (value ?? 0) >= n && 'fill-current')} />
        </button>
      ))}
    </span>
  );
}

/** Dialog shared by the pool page and the application review page. */
export function TalentEntryDialog({ open, onClose, entry, candidateId, candidateName, sourceApplication, categories }: { open: boolean; onClose: () => void; entry?: TalentEntry | null; candidateId?: string; candidateName?: string; sourceApplication?: string; categories?: string[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ category: 'general', tags: [] as string[], notes: '', rating: null as number | null });
  const [newCategory, setNewCategory] = useState(false);
  useEffect(() => { if (open) { setForm(entry ? { category: entry.category, tags: entry.tags, notes: entry.notes ?? '', rating: entry.rating } : { category: 'general', tags: [], notes: '', rating: null }); setNewCategory(false); } }, [open, entry]);
  const options = [...new Set(['general', ...(categories ?? []), form.category])];
  const save = useMutation({
    mutationFn: () => entry ? talentApi.update(entry.id, form) : talentApi.save({ candidateId: candidateId!, category: form.category, tags: form.tags, notes: form.notes || undefined, rating: form.rating ?? undefined, sourceApplication }),
    onSuccess: () => { toast.success(entry ? 'Talent pool entry updated' : `${candidateName ?? 'Candidate'} added to your talent pool`); void qc.invalidateQueries({ queryKey: ['talent'] }); onClose(); },
    onError: (e) => toast.error(toApiError(e).message),
  });
  return (
    <Dialog open={open} onClose={onClose} title={entry ? `Edit · ${entry.candidate?.fullName ?? 'candidate'}` : `Save ${candidateName ?? 'candidate'} to talent pool`} size="md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={save.isPending} leftIcon={<BookmarkPlus className="h-4 w-4" />} onClick={() => save.mutate()}>{entry ? 'Save changes' : 'Add to pool'}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {newCategory
            ? <Input label="New category" autoFocus value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value.toLowerCase() })} placeholder="backend, design, future-leads…" hint="Letters, numbers, spaces and dashes" />
            : <Select label="Category" value={form.category} onChange={(e) => e.target.value === '__new' ? (setNewCategory(true), setForm({ ...form, category: '' })) : setForm({ ...form, category: e.target.value })}>{options.map((c) => <option key={c} value={c}>{c}</option>)}<option value="__new">+ New category…</option></Select>}
          <div><p className="mb-1.5 text-sm font-medium text-text-secondary">Rating</p><Stars value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} size="h-6 w-6" /></div>
        </div>
        <TagInput label="Tags" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="node.js, senior, remote-ok…" max={15} />
        <Textarea label="Private notes" rows={4} maxLength={3000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Why this candidate stands out, roles to consider them for…" />
      </div>
    </Dialog>
  );
}

export function TalentPoolPage() {
  const qc = useQueryClient();
  const { get, page, set, setPage } = useListParams();
  const category = get('category');
  const q = get('q');
  const sort = get('sort') || 'recent';
  const [search, setSearch] = useState(q);
  const [edit, setEdit] = useState<TalentEntry | null>(null);
  const [remove, setRemove] = useState<TalentEntry | null>(null);
  useEffect(() => setSearch(q), [q]);

  const query = useQuery({ queryKey: ['talent', { category, q, sort, page }], queryFn: () => talentApi.list({ category, q, sort, page, limit: 12 }), placeholderData: keepPreviousData });
  const del = useMutation({ mutationFn: (id: string) => talentApi.remove(id), onSuccess: () => { toast.success('Removed from talent pool'); setRemove(null); void qc.invalidateQueries({ queryKey: ['talent'] }); }, onError: (e) => toast.error(toApiError(e).message) });
  const categories = query.data?.data.categories ?? [];
  const items = query.data?.data.candidates ?? [];
  const total = categories.reduce((s, c) => s + c.count, 0);

  return (
    <div>
      <BackButton fallback="/recruiter" className="mb-2" />
      <PageHeader title="Talent pool" description="Promising candidates you want to keep close — organised your way." actions={<Link to="/recruiter/applicants"><Button variant="outline" leftIcon={<UserRoundSearch className="h-4 w-4" />}>Find applicants to save</Button></Link>} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills value={category} onChange={(v) => set({ category: v })} options={categories.map((c) => ({ value: c.name, label: c.name }))} counts={{ all: total, ...Object.fromEntries(categories.map((c) => [c.name, c.count])) }} />
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); set({ q: search.trim() }); }} className="flex gap-2">
          <Input placeholder="Name, skill, tag or note" leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full lg:w-64" aria-label="Search talent pool" />
          <div className="w-36"><Select value={sort} onChange={(e) => set({ sort: e.target.value }, false)} className="h-10" aria-label="Sort"><option value="recent">Recently updated</option><option value="rating">Top rated</option><option value="name">Name A–Z</option></Select></div>
          <Button type="submit" className="h-10">Search</Button>
        </form>
      </div>

      <div className="mt-5">
        {query.isPending ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          : query.isError ? <ErrorState message={toApiError(query.error).message} onRetry={() => void query.refetch()} />
          : items.length === 0 ? <EmptyState icon={<FolderKanban className="h-6 w-6" />} title={q || category ? 'No matches' : 'Your talent pool is empty'} description="Open any application and click “Save to talent pool” to keep strong candidates for future roles." action={<Link to="/recruiter/applicants"><Button>Browse applicants</Button></Link>} />
          : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((e, idx) => (
                <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (idx % 6) * 0.04 }}>
                  <Card hover className="flex h-full flex-col p-5">
                    <div className="flex items-start gap-3">
                      <Avatar src={e.candidate?.photoUrl} name={e.candidate?.fullName} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/recruiter/candidates/${e.candidateId}`} className="block truncate font-semibold hover:text-primary-600">{e.candidate?.fullName ?? 'Candidate'}</Link>
                        <p className="truncate text-sm text-muted">{e.candidate?.headline ?? '—'}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">{e.candidate?.location?.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.candidate.location.city}</span>}<span>{e.candidate?.totalExperienceYears ?? 0} yrs</span></p>
                      </div>
                      <Badge tone="violet" className="capitalize">{e.category}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between"><Stars value={e.rating} />{e.latestApplication && <Link to={`/recruiter/applications/${e.latestApplication.id}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary-600"><Badge tone={APPLICATION_TONE[e.latestApplication.status] ?? 'neutral'}>{LABELS.applicationStatus[e.latestApplication.status as ApplicationStatus] ?? e.latestApplication.status}</Badge></Link>}</div>
                    <div className="mt-3 flex flex-wrap gap-1">{e.candidate?.skills.slice(0, 4).map((s) => <Badge key={s} className="capitalize">{s}</Badge>)}{e.tags.map((t) => <Badge key={t} tone="primary">#{t}</Badge>)}</div>
                    {e.notes && <p className="mt-3 line-clamp-3 text-sm text-text-secondary">{e.notes}</p>}
                    <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                      <span>Updated {timeAgo(e.updatedAt)}</span>
                      <div className="flex gap-1">
                        <Link to={`/recruiter/candidates/${e.candidateId}`}><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View profile"><ExternalLink className="h-4 w-4" /></Button></Link>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit entry" onClick={() => setEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:text-danger" aria-label="Remove from pool" onClick={() => setRemove(e)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
      </div>
      <Pagination meta={query.data?.meta} onPage={setPage} className="mt-6" />

      <TalentEntryDialog open={Boolean(edit)} onClose={() => setEdit(null)} entry={edit} categories={categories.map((c) => c.name)} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={() => remove && del.mutate(remove.id)} loading={del.isPending} tone="danger" title="Remove from talent pool?" description={`${remove?.candidate?.fullName ?? 'This candidate'} will be removed along with your notes. Their applications are unaffected.`} confirmLabel="Remove" />
    </div>
  );
}
