import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { toApiError } from '@/lib/api';
import { interviewsApi, type Interview, type InterviewMode } from './portals.api';

const toLocalInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 2 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Schedule a new round for this application… */
  applicationId?: string;
  candidateName?: string;
  /** …or edit / reschedule an existing interview. */
  interview?: Interview | null;
  onDone?: (i: Interview) => void;
}

export function InterviewDialog({ open, onClose, applicationId, candidateName, interview, onDone }: Props) {
  const qc = useQueryClient();
  const editing = Boolean(interview);
  const [form, setForm] = useState({ title: '', scheduledAt: toLocalInput(), durationMinutes: 60, mode: 'video' as InterviewMode, location: '', meetingLink: '', notes: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(interview
      ? { title: interview.title, scheduledAt: toLocalInput(interview.scheduledAt), durationMinutes: interview.durationMinutes, mode: interview.mode, location: interview.location ?? '', meetingLink: interview.meetingLink ?? '', notes: interview.notes ?? '', reason: '' }
      : { title: '', scheduledAt: toLocalInput(), durationMinutes: 60, mode: 'video', location: '', meetingLink: '', notes: '', reason: '' });
  }, [open, interview]);

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['interviews'] }); void qc.invalidateQueries({ queryKey: ['recruiter'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); };
  const mutation = useMutation({
    mutationFn: () => {
      const body = { title: form.title || undefined, scheduledAt: new Date(form.scheduledAt).toISOString(), durationMinutes: Number(form.durationMinutes), mode: form.mode, location: form.mode === 'onsite' ? form.location || undefined : undefined, meetingLink: form.mode !== 'onsite' ? form.meetingLink || undefined : undefined, notes: form.notes || undefined };
      return editing ? interviewsApi.reschedule(interview!.id, { ...body, reason: form.reason || undefined }) : interviewsApi.schedule({ ...body, applicationId: applicationId! });
    },
    onSuccess: (r) => { toast.success(editing ? 'Interview updated — candidate notified of any time change' : 'Interview scheduled — candidate notified'); invalidate(); onDone?.(r.data.interview); onClose(); },
    onError: (e) => { const err = toApiError(e); const next: Record<string, string> = {}; for (const d of err.details) next[d.field.replace(/^body\./, '')] = d.message; setErrors(next); toast.error(err.details.length ? 'Check the highlighted fields' : err.message); },
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.scheduledAt || new Date(form.scheduledAt).getTime() < Date.now()) next.scheduledAt = 'Pick a future date and time';
    if (form.mode === 'onsite' && !form.location.trim()) next.location = 'Add the interview location';
    if (form.mode !== 'onsite' && form.meetingLink && !/^https?:\/\//.test(form.meetingLink)) next.meetingLink = 'Enter a valid link';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Edit interview · ${interview!.title}` : `Schedule interview${candidateName ? ` · ${candidateName}` : ''}`} description={editing ? 'Moving the time notifies the candidate automatically.' : 'The candidate gets an in-app notification and email with these details.'} size="md"
      footer={<><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button leftIcon={<CalendarClock className="h-4 w-4" />} loading={mutation.isPending} onClick={() => validate() && mutation.mutate()}>{editing ? 'Save changes' : 'Schedule'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Input label="Title" placeholder="Technical round, Culture fit…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <Input label="Date & time" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} error={errors.scheduledAt} required />
        <Input label="Duration (minutes)" type="number" min={5} max={480} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} error={errors.durationMinutes} />
        <Select label="Format" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as InterviewMode })}><option value="video">Online · video call</option><option value="phone">Online · phone</option><option value="onsite">Offline · in person</option></Select>
        {form.mode === 'onsite'
          ? <Input label="Location" placeholder="Office address / room" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} error={errors.location} />
          : <Input label="Meeting link" type="url" placeholder="https://meet.google.com/…" value={form.meetingLink} onChange={(e) => setForm({ ...form, meetingLink: e.target.value })} error={errors.meetingLink} />}
        <div className="sm:col-span-2"><Textarea label="Notes for the candidate" rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What to prepare, who they'll meet…" /></div>
        {editing && <div className="sm:col-span-2"><Input label="Reason for the change (internal)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" /></div>}
      </div>
    </Dialog>
  );
}
