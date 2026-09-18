import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BackButton } from './BackButton';
import { ConfirmDialog } from './Dialog';
import { DataTable, FilterPills, Pagination } from './DataTable';
import { TagInput } from './extras';

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div>; }

describe('BackButton', () => {
  it('uses the fallback route when there is no in-app history (deep link)', async () => {
    window.history.replaceState({ idx: 0 }, '');
    render(<MemoryRouter initialEntries={['/jobs/1']}><Routes><Route path="/jobs/1" element={<><BackButton fallback="/jobs" /><Where /></>} /><Route path="/jobs" element={<Where />} /></Routes></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByTestId('where')).toHaveTextContent('/jobs');
  });

  it('goes back in history when a previous in-app page exists', async () => {
    window.history.replaceState({ idx: 3 }, '');
    render(<MemoryRouter initialEntries={['/jobs', '/jobs/1']} initialIndex={1}><Routes><Route path="/jobs/1" element={<><BackButton fallback="/" /><Where /></>} /><Route path="/jobs" element={<Where />} /></Routes></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByTestId('where')).toHaveTextContent('/jobs');
  });
});

describe('ConfirmDialog', () => {
  it('traps Escape/close, and confirms', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Delete?" confirmLabel="Delete" tone="danger" />);
    expect(screen.getByRole('dialog', { name: 'Delete?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DataTable & Pagination', () => {
  const columns = [{ key: 'name', header: 'Name', cell: (r: { id: string; name: string }) => r.name }];
  it('renders rows, empty state and skeleton', () => {
    const { rerender } = render(<DataTable columns={columns} rows={[{ id: '1', name: 'Asha' }]} rowKey={(r) => r.id} />);
    expect(screen.getByRole('cell', { name: 'Asha' })).toBeInTheDocument();
    rerender(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={{ title: 'Nobody here' }} />);
    expect(screen.getByText('Nobody here')).toBeInTheDocument();
    rerender(<DataTable columns={columns} rows={undefined} rowKey={(r) => r.id} loading />);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
  it('pagination navigates and hides for a single page', async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pagination meta={{ page: 2, limit: 10, total: 35, totalPages: 4 }} onPage={onPage} />);
    expect(screen.getByText(/11–20/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPage).toHaveBeenCalledWith(3);
    rerender(<Pagination meta={{ page: 1, limit: 10, total: 5, totalPages: 1 }} onPage={onPage} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('filter pills report the selected value', async () => {
    const onChange = vi.fn();
    render(<FilterPills value="" options={[{ value: 'open', label: 'Open' }]} onChange={onChange} counts={{ all: 3, open: 2 }} />);
    await userEvent.click(screen.getByRole('tab', { name: /open/i }));
    expect(onChange).toHaveBeenCalledWith('open');
  });
});

describe('TagInput', () => {
  it('adds on Enter/comma, lowercases, dedupes and removes', async () => {
    const Wrapper = () => { const [v, setV] = React.useState<string[]>([]); return <TagInput label="Skills" value={v} onChange={setV} />; };
    render(<Wrapper />);
    const input = screen.getByLabelText('Skills');
    await userEvent.type(input, 'React{Enter}node.js,React{Enter}');
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('node.js')).toBeInTheDocument();
    expect(screen.getAllByText('react')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /remove react/i }));
    expect(screen.queryByText('react')).not.toBeInTheDocument();
  });
});

import React from 'react';
