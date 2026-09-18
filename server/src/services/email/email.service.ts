import { Resend } from 'resend';
import { User } from '../../models/User';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { templates, type EmailContent, type TemplateName } from './templates';

interface EmailProvider {
  send(to: string, content: EmailContent): Promise<void>;
}

/** Development / test: prints the email so verification links can be copied. */
const consoleProvider: EmailProvider = {
  async send(to, content) {
    if (env.isTest) return;
    logger.info(
      `\n──────── EMAIL (console provider) ────────\nTo: ${to}\nSubject: ${content.subject}\n\n${content.text}\n──────────────────────────────────────────`,
    );
  },
};

function createResendProvider(): EmailProvider {
  const client = new Resend(env.RESEND_API_KEY);
  return {
    async send(to, content) {
      const { error } = await client.emails.send({
        from: env.EMAIL_FROM,
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (error) throw new Error(`Resend: ${error.name} — ${error.message}`);
    },
  };
}

const provider: EmailProvider = env.EMAIL_PROVIDER === 'resend' ? createResendProvider() : consoleProvider;

type TemplateData<N extends TemplateName> = Parameters<(typeof templates)[N]>[0];

/**
 * Fire-and-forget email dispatch. Never throws — a failing email provider must
 * not fail the HTTP request that triggered it. Awaiting is optional.
 */
export async function sendEmail<N extends TemplateName>(
  template: N,
  to: string,
  data: TemplateData<N>,
): Promise<void> {
  try {
    const build = templates[template] as (d: TemplateData<N>) => EmailContent;
    await provider.send(to, build(data));
    logger.debug({ template, to }, '[email] sent');
  } catch (err) {
    logger.error({ err, template, to }, '[email] failed to send');
  }
}

/** Sink for spies in tests. */
export const emailService = { sendEmail };

/** Preference key per template for user-facing (non-transactional) emails. */
const TEMPLATE_PREF: Partial<Record<TemplateName, 'applicationUpdates' | 'newApplicants' | 'interviews' | 'jobUpdates'>> = {
  applicationConfirmation: 'applicationUpdates',
  applicationStatus: 'applicationUpdates',
  interviewScheduled: 'interviews',
};

/** Sends only if the recipient has not opted out of that category. Auth/security emails bypass this. */
export async function sendPreferredEmail<N extends TemplateName>(userId: string | { toString(): string }, template: N, to: string, data: TemplateData<N>): Promise<void> {
  const key = TEMPLATE_PREF[template];
  if (key) {
    const user = await User.findById(userId).select('notificationPreferences').lean();
    const prefs = user?.notificationPreferences?.email as Record<string, boolean> | undefined;
    if (prefs && prefs[key] === false) return;
  }
  await sendEmail(template, to, data);
}
