import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Logo, ThemeToggle } from '@/components/ui';

const points = [
  'Track every application from applied to offer',
  'Recruiters see a verified, structured profile',
  'Smart recommendations from your skills and city',
];

export function AuthLayout() {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-primary-700 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(124,58,237,0.45),transparent_55%)]" aria-hidden />
        <div className="relative">
          <Logo className="text-white [&_span:first-child]:bg-white/15 [&_span:last-child_span]:text-primary-200" />
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-balance">Your next role, one focused workflow away.</h2>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-primary-50">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-200" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <p className="relative text-sm text-primary-200">Trusted by teams in Bengaluru, Mumbai, Hyderabad, Pune and beyond.</p>
      </aside>

      {/* Form panel */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="w-full max-w-md">
            <Outlet />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
