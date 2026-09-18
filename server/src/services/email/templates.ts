/**
 * Minimal, inline-styled HTML templates. Kept dependency-free on purpose.
 * Every template returns { subject, html, text }.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Job Portal';
const PRIMARY = '#2563EB';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="background:${PRIMARY};padding:20px 28px;color:#fff;font-size:18px;font-weight:700;">${BRAND}</td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;">
          You are receiving this email because you have an account on ${BRAND}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">${escapeHtml(label)}</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(href)}</span></p>`;
}

export const templates = {
  verifyEmail(data: { name: string; url: string; expiresInHours: number }): EmailContent {
    const title = 'Verify your email address';
    return {
      subject: `${BRAND} — verify your email`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Thanks for joining ${BRAND}. Please confirm your email address to unlock applying for jobs and publishing postings.</p>
         ${button(data.url, 'Verify email')}
         <p style="color:#64748b;font-size:13px;">This link expires in ${data.expiresInHours} hours.</p>`,
      ),
      text: `Hi ${data.name},\n\nVerify your email for ${BRAND}: ${data.url}\n\nThis link expires in ${data.expiresInHours} hours.`,
    };
  },

  resetPassword(data: { name: string; url: string; expiresInMinutes: number }): EmailContent {
    const title = 'Reset your password';
    return {
      subject: `${BRAND} — password reset request`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>We received a request to reset your password. Click below to choose a new one.</p>
         ${button(data.url, 'Reset password')}
         <p style="color:#64748b;font-size:13px;">This link expires in ${data.expiresInMinutes} minutes. If you did not request this, you can safely ignore this email.</p>`,
      ),
      text: `Hi ${data.name},\n\nReset your ${BRAND} password: ${data.url}\n\nThis link expires in ${data.expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    };
  },

  passwordChanged(data: { name: string }): EmailContent {
    const title = 'Your password was changed';
    return {
      subject: `${BRAND} — password changed`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Your password was just changed and all other sessions were signed out. If this was not you, reset your password immediately.</p>`,
      ),
      text: `Hi ${data.name},\n\nYour ${BRAND} password was changed and other sessions were signed out. If this was not you, reset your password immediately.`,
    };
  },

  applicationConfirmation(data: { name: string; jobTitle: string; company: string; url: string }): EmailContent {
    const title = 'Application received';
    return {
      subject: `Application received — ${data.jobTitle} at ${data.company}`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Your application for <strong>${escapeHtml(data.jobTitle)}</strong> at <strong>${escapeHtml(data.company)}</strong> has been submitted successfully.</p>
         ${button(data.url, 'Track application')}`,
      ),
      text: `Hi ${data.name},\n\nYour application for ${data.jobTitle} at ${data.company} was submitted. Track it here: ${data.url}`,
    };
  },

  applicationStatus(data: {
    name: string;
    jobTitle: string;
    company: string;
    statusLabel: string;
    note?: string;
    url: string;
  }): EmailContent {
    const title = `Application update: ${data.statusLabel}`;
    return {
      subject: `${data.statusLabel} — ${data.jobTitle} at ${data.company}`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Your application for <strong>${escapeHtml(data.jobTitle)}</strong> at <strong>${escapeHtml(data.company)}</strong> is now <strong>${escapeHtml(data.statusLabel)}</strong>.</p>
         ${data.note ? `<p style="background:#f8fafc;border-left:4px solid ${PRIMARY};padding:12px 16px;border-radius:8px;">${escapeHtml(data.note)}</p>` : ''}
         ${button(data.url, 'View application')}`,
      ),
      text: `Hi ${data.name},\n\nYour application for ${data.jobTitle} at ${data.company} is now ${data.statusLabel}.${data.note ? `\n\nNote: ${data.note}` : ''}\n\n${data.url}`,
    };
  },

  interviewScheduled(data: {
    name: string;
    jobTitle: string;
    company: string;
    when: string;
    mode: string;
    where?: string;
    notes?: string;
    url: string;
  }): EmailContent {
    const title = 'Interview scheduled';
    return {
      subject: `Interview scheduled — ${data.jobTitle} at ${data.company}`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Great news — <strong>${escapeHtml(data.company)}</strong> has scheduled an interview for <strong>${escapeHtml(data.jobTitle)}</strong>.</p>
         <table style="font-size:14px;margin:12px 0;">
           <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td>${escapeHtml(data.when)}</td></tr>
           <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Mode</td><td>${escapeHtml(data.mode)}</td></tr>
           ${data.where ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Where</td><td>${escapeHtml(data.where)}</td></tr>` : ''}
         </table>
         ${data.notes ? `<p style="background:#f8fafc;padding:12px 16px;border-radius:8px;">${escapeHtml(data.notes)}</p>` : ''}
         ${button(data.url, 'View details')}`,
      ),
      text: `Hi ${data.name},\n\n${data.company} scheduled an interview for ${data.jobTitle}.\nWhen: ${data.when}\nMode: ${data.mode}${data.where ? `\nWhere: ${data.where}` : ''}${data.notes ? `\n\n${data.notes}` : ''}\n\n${data.url}`,
    };
  },

  recruiterVerified(data: { name: string; company: string; url: string }): EmailContent {
    const title = 'Your company is now verified';
    return {
      subject: `${BRAND} — ${data.company} is verified`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p><strong>${escapeHtml(data.company)}</strong> has been verified. Your job postings now display a verified badge.</p>
         ${button(data.url, 'Go to dashboard')}`,
      ),
      text: `Hi ${data.name},\n\n${data.company} has been verified on ${BRAND}. ${data.url}`,
    };
  },

  accountSuspended(data: { name: string; reason?: string }): EmailContent {
    const title = 'Your account has been suspended';
    return {
      subject: `${BRAND} — account suspended`,
      html: layout(
        title,
        `<p>Hi ${escapeHtml(data.name)},</p>
         <p>Your account has been suspended by a platform administrator.${data.reason ? ` Reason: ${escapeHtml(data.reason)}` : ''}</p>
         <p>If you believe this is a mistake, please contact support.</p>`,
      ),
      text: `Hi ${data.name},\n\nYour ${BRAND} account has been suspended.${data.reason ? ` Reason: ${data.reason}` : ''}`,
    };
  },
};

export type TemplateName = keyof typeof templates;
