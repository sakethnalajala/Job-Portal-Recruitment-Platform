import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button, ThemeToggle } from './index';
import { formatSalary, timeAgo } from '@/lib/utils';

describe('ThemeToggle', () => {
  it('toggles the dark class and persists the choice', async () => {
    render(<MemoryRouter><ThemeToggle /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /switch to dark mode/i });
    await userEvent.click(btn);
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('tb-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('tb-theme')).toBe('light');
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('formatters', () => {
  it('formats INR annual salaries as LPA', () => {
    expect(formatSalary({ min: 1800000, max: 2800000, currency: 'INR', period: 'year' })).toBe('₹18–28 LPA');
    expect(formatSalary({ min: 40000, max: 60000, currency: 'INR', period: 'month' })).toBe('₹40,000/mo – ₹60,000/mo');
    expect(formatSalary({ isVisible: false })).toBe('Not disclosed');
    expect(formatSalary(undefined)).toBe('Not disclosed');
  });
  it('humanises relative time', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(timeAgo(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe('3d ago');
  });
});
