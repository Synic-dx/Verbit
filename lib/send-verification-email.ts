import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail({ to, code }: { to: string; code: string }) {
  // Use React Email for HTML content
  const html = `<div style="font-family: 'Inter', Arial, sans-serif; background: #0f172a; color: #fff; padding: 32px; border-radius: 16px; max-width: 420px; margin: auto; border: 1px solid #3b82f6;">
    <h2 style="color: #3b82f6; margin-bottom: 16px;">Verbit Email Verification</h2>
    <p style="margin-bottom: 24px;">Your verification code is:</p>
    <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.2em; background: #1e293b; color: #3b82f6; padding: 16px 0; border-radius: 8px; text-align: center; margin-bottom: 24px;">${code}</div>
    <p style="font-size: 0.95rem; color: #cbd5e1;">Enter this code in the app to verify your email and unlock all features.</p>
    <div style="margin-top: 32px; text-align: center;">
      <span style="font-size: 0.85rem; color: #64748b;">If you did not request this, you can ignore this email.</span>
    </div>
  </div>`;

  await resend.emails.send({
    from: 'Verbit <verbit@resend.dev>',
    to,
    subject: 'Verify your email for Verbit',
    html,
  });
}
