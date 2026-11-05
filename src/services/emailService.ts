import axios from 'axios';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

// --- Email Config (Gmail SMTP preferred, Brevo API fallback) -----------------
function getEmailConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const gmailUser =
    process.env.GMAIL_USER?.trim().replace(/"/g, '') ||
    process.env.SYSTEM_EMAIL?.trim().replace(/"/g, '') ||
    'bertingmagiting16@gmail.com';
  const rawPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
  const gmailPass = rawPass ? rawPass.trim().replace(/"/g, '').replace(/\s+/g, '') : undefined;
  const senderEmail = gmailUser;

  const isGmailConfigured = Boolean(gmailUser && gmailPass);

  if (!isGmailConfigured && !apiKey) {
    console.error('[Config Error] Neither GMAIL_APP_PASSWORD nor BREVO_API_KEY is set in environment variables!');
  }

  return { apiKey, senderEmail, gmailUser, gmailPass, isGmailConfigured };
}

// --- Logo Loader ------------------------------------------------------------
let cachedLogoBase64 = '';
function getLogoBase64(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const possiblePaths = [
      path.join(__dirname, '../assets/logo.jpg'),
      path.join(process.cwd(), 'src/assets/logo.jpg'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        cachedLogoBase64 = fs.readFileSync(p).toString('base64');
        break;
      }
    }
  } catch (e) {
    console.error('Could not load logo for email:', e);
  }
  return cachedLogoBase64;
}

function getEmailAttachments() {
  const logoBase64 = getLogoBase64();
  if (!logoBase64) return undefined;
  return [{ content: logoBase64, name: 'logo.jpg' }];
}

const LOGO_PUBLIC_URL = 'https://sendresqpls-mobile.vercel.app/logo.jpg';

// --- Master Email Layout ----------------------------------------------------
// Brand palette from the SRQ logo:
//   Royal blue  -> #1A3FA3
//   Dark navy   -> #0A1931
function renderEmailLayout(title: string, contentHtml: string): string {
  const logoTag = `<img src="${LOGO_PUBLIC_URL}" alt="SendResQPls Logo" width="76" height="76"
         style="display:block; margin:0 auto; border-radius:14px; border:3px solid #FFFFFF;
                box-shadow:0 4px 16px rgba(0,0,0,0.35); object-fit:cover;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#EEF2F7;
             font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
             -webkit-font-smoothing:antialiased; color:#1E293B;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#EEF2F7; padding:36px 16px 48px;">
    <tr>
      <td align="center">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px; background-color:#FFFFFF; border-radius:20px;
                      overflow:hidden; border:1px solid #CBD5E1;
                      box-shadow:0 8px 32px rgba(10,25,49,0.12), 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Clean Header (No red accent lines/stripes) -->
          <tr>
            <td style="background-color:#1A3FA3;
                       background-image:linear-gradient(135deg, #0A1931 0%, #1A3FA3 55%, #2255C8 100%);
                       padding:32px 28px 28px; text-align:center;">
              ${logoTag ? `<div style="margin-bottom:16px;">${logoTag}</div>` : ''}
              <h1 style="margin:0 0 6px; color:#FFFFFF; font-size:22px; font-weight:800;
                         letter-spacing:0.5px; line-height:1.2; text-transform:uppercase;">
                SendResQPls
              </h1>
              <p style="margin:0; color:#BFD4FF; font-size:12px; font-weight:600;
                        letter-spacing:1px; text-transform:uppercase;">
                MDRRMO | Municipality of Balayan, Batangas
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 28px; color:#1E293B;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F8FAFC; border-top:1px solid #E2E8F0; padding:24px 32px; text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <span style="display:inline-block; background-color:#E5332A; color:#FFFFFF;
                                 font-size:11px; font-weight:800; padding:5px 13px; border-radius:99px;
                                 letter-spacing:0.6px; margin-right:6px;">
                      HOTLINE 911
                    </span>
                    <span style="display:inline-block; background-color:#EEF2FF; color:#1A3FA3;
                                 border:1px solid #C7D7FD; font-size:11px; font-weight:800;
                                 padding:5px 13px; border-radius:99px; letter-spacing:0.6px;">
                      MDRRMO: 0917-123-4567
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 4px; font-size:12px; font-weight:700; color:#334155;">
                Municipal Disaster Risk Reduction &amp; Management Office
              </p>
              <p style="margin:0 0 10px; font-size:11.5px; color:#64748B; line-height:1.5;">
                Balayan Government Center, Plaza Rizal, Balayan, Batangas
              </p>
              <p style="margin:0; font-size:10.5px; color:#94A3B8; line-height:1.5;">
                This is an automated notification from SendResQPls. Do not reply to this email.
              </p>
            </td>
          </tr>

          <!-- Bottom navy bar -->
          <tr>
            <td style="background-color:#0A1931; padding:10px 28px; text-align:center;">
              <p style="margin:0; font-size:10px; color:#5E7AA8; letter-spacing:0.4px;">
                &copy; 2026 SendResQPls | MDRRMO Balayan | All rights reserved
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// --- Send helper ------------------------------------------------------------
async function sendEmail(
  senderName: string,
  to: string,
  subject: string,
  htmlContent: string,
  skipAttachments = true,
) {
  const config = getEmailConfig();

  // 1. Primary: Brevo REST API (HTTPS port 443 — lightning-fast ~700ms, never tarpitted by Google SMTP)
  if (config.apiKey) {
    try {
      const attachments = skipAttachments ? undefined : getEmailAttachments();
      const payload: any = {
        sender: { name: senderName, email: config.senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
      };
      if (attachments) payload.attachment = attachments;

      const res = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
        timeout: 5000,
      });
      console.log(`✉️ [Brevo API] Email "${subject}" delivered instantly to: ${to} (id: ${res.data?.messageId})`);
      return;
    } catch (brevoErr: any) {
      console.warn('⚠️ [Brevo API] Delivery error:', brevoErr.response?.data?.message || brevoErr.message);
      if (!config.isGmailConfigured) {
        throw new Error(brevoErr.response?.data?.message || brevoErr.message);
      }
      console.log('🔄 Attempting fallback to Gmail SMTP...');
    }
  }

  // 2. Fallback: Gmail SMTP (Strict 3s timeout to protect against Google 421 tarpitting)
  if (config.isGmailConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        connectionTimeout: 3000,
        greetingTimeout: 3000,
        socketTimeout: 4000,
        auth: {
          user: config.gmailUser,
          pass: config.gmailPass,
        },
      } as any);

      await transporter.sendMail({
        from: `"${senderName}" <${config.gmailUser}>`,
        to,
        subject,
        html: htmlContent,
      });
      console.log(`✉️ [Gmail SMTP] Email "${subject}" delivered to: ${to}`);
      return;
    } catch (gmailErr: any) {
      console.error('⚠️ [Gmail SMTP] Delivery error:', gmailErr.message);
      throw new Error(`Email delivery failed: ${gmailErr.message}`);
    }
  }

  throw new Error('No email provider configured. Please set BREVO_API_KEY or GMAIL_APP_PASSWORD.');
}

// ----------------------------------------------------------------------------
// EMAIL 1 - Verification Code (Matches Status Update Master Design)
// ----------------------------------------------------------------------------
export const sendVerificationEmail = async (to: string, code: string) => {
  const config = getEmailConfig();
  if (!config.isGmailConfigured && !config.apiKey) {
    throw new Error('Email service is not configured (missing GMAIL_APP_PASSWORD or BREVO_API_KEY)');
  }

  const content = `
    <p style="margin:0 0 4px; color:#94A3B8; font-size:12px; font-weight:600;
              text-transform:uppercase; letter-spacing:0.8px;">
      Account Verification
    </p>
    <h2 style="margin:0 0 16px; color:#0A1931; font-size:22px; font-weight:800; line-height:1.25;">
      Verification Code
    </h2>
    <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.65;">
      Enter this 6-digit verification code to complete your SendResQPls account setup:
    </p>

    <!-- Verification Code Card matching Status Update incident card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">

          <!-- Card Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#1A3FA3; padding:12px 18px;">
                <span style="color:#FFFFFF; font-size:11px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase;">
                  One-Time Passcode (OTP)
                </span>
              </td>
            </tr>
          </table>

          <!-- Card Body -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:28px 20px; text-align:center; background-color:#F8FAFC;">
                <div style="font-size:42px; font-weight:800; letter-spacing:10px; color:#0F172A; font-family:'Courier New', Courier, monospace; padding-left:10px; line-height:1;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="height:1px; background-color:#E2E8F0; line-height:1px; font-size:1px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:14px 18px; text-align:center; background-color:#FFFFFF;">
                <span style="color:#DC2626; font-size:13px; font-weight:700;">
                  This code expires in 1 minute
                </span>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

    <p style="margin:0; color:#94A3B8; font-size:12px; line-height:1.55;">
      If you did not request this verification code, please ignore this email. Your account remains secure.
    </p>
  `;

  const html = renderEmailLayout('SendResQPls - Verification Code', content);

  try {
    await sendEmail(
      'SendResQPls',
      to,
      `${code} is your SendResQPls verification code`,
      html,
    );
  } catch (err: any) {
    throw new Error(err.response?.data?.message || err.message);
  }
};

// ----------------------------------------------------------------------------
// EMAIL 2 - Incident Status Notification
// ----------------------------------------------------------------------------
export const sendStatusNotification = async (
  to: string,
  reporterName: string,
  incidentType: string,
  newStatus: string,
) => {
  const statusMessages: Record<string, string> = {
    PENDING:    'Your emergency report has been received and is queued for triage review by MDRRMO Balayan.',
    REVIEWING:  'The Command Center is currently validating your incident report and mobilizing the nearest response units.',
    DISPATCHED: 'Emergency responders have been dispatched and are en route to the reported scene.',
    RESOLVED:   'On-scene operations have concluded. This incident has been marked as resolved. Thank you for reporting.',
    REJECTED:   'Your report was reviewed by the triage team and could not be verified as an active emergency at this time.',
  };

  const statusThemes: Record<string, { bg: string; text: string; border: string }> = {
    PENDING:    { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
    REVIEWING:  { bg: '#EEF2FF', text: '#1E40AF', border: '#C7D7FD' },
    DISPATCHED: { bg: '#EDE9FE', text: '#4C1D95', border: '#DDD6FE' },
    RESOLVED:   { bg: '#F0FDF4', text: '#14532D', border: '#BBF7D0' },
    REJECTED:   { bg: '#FEF2F2', text: '#7F1D1D', border: '#FECACA' },
  };

  const theme = statusThemes[newStatus] || { bg: '#F8FAFC', text: '#334155', border: '#E2E8F0' };
  const message = statusMessages[newStatus] || 'Your report status has been updated by the dispatch team.';

  const content = `
    <p style="margin:0 0 4px; color:#94A3B8; font-size:12px; font-weight:600;
              text-transform:uppercase; letter-spacing:0.8px;">
      Incident Status Update
    </p>
    <h2 style="margin:0 0 16px; color:#0A1931; font-size:22px; font-weight:800; line-height:1.25;">
      Hello, ${reporterName}
    </h2>
    <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.65;">
      Your emergency report has been updated by
      <strong style="color:#1A3FA3;">MDRRMO Balayan Command Center</strong>.
      Here are the latest details:
    </p>

    <!-- Incident card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">

          <!-- Card header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#1A3FA3; padding:12px 18px;">
                <span style="color:#FFFFFF; font-size:11px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase;">
                  Incident Report
                </span>
              </td>
            </tr>
          </table>

          <!-- Card body -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:18px 18px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-size:10.5px; font-weight:700; color:#94A3B8;
                                  letter-spacing:0.8px; text-transform:uppercase; margin-bottom:4px;">
                        Incident Type
                      </div>
                      <div style="font-size:18px; font-weight:800; color:#0A1931;">
                        ${incidentType}
                      </div>
                    </td>
                    <td style="vertical-align:top; text-align:right;">
                      <div style="font-size:10.5px; font-weight:700; color:#94A3B8;
                                  letter-spacing:0.8px; text-transform:uppercase; margin-bottom:6px;">
                        Current Status
                      </div>
                      <div style="display:inline-block; padding:6px 14px; border-radius:99px;
                                  background-color:${theme.bg}; color:${theme.text};
                                  border:1px solid ${theme.border}; font-size:12px; font-weight:800;
                                  letter-spacing:0.5px; text-transform:uppercase;">
                        ${newStatus}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:1px; background-color:#E2E8F0; line-height:1px; font-size:1px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:14px 18px 18px; font-size:13.5px; color:#334155; line-height:1.6;">
                ${message}
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

    <p style="margin:0; color:#94A3B8; font-size:12px; line-height:1.55;">
      Open the <strong style="color:#1A3FA3;">SendResQPls</strong> mobile app to track
      real-time incident progression and responder deployment.
    </p>
  `;

  const config = getEmailConfig();
  if (!config.isGmailConfigured && !config.apiKey) {
    throw new Error('Email service is not configured (missing GMAIL_APP_PASSWORD or BREVO_API_KEY)');
  }

  try {
    await sendEmail(
      'MDRRMO Balayan Dispatch',
      to,
      `[${newStatus}] Emergency Report Update - ${incidentType}`,
      renderEmailLayout(`Incident Update - ${incidentType}`, content),
    );
  } catch (err: any) {
    throw new Error(err.response?.data?.message || err.message);
  }
};

// ----------------------------------------------------------------------------
// EMAIL 3 - Password Reset (6-Digit OTP Code — Immune to Link Tracking Timeouts)
// ----------------------------------------------------------------------------
export const sendPasswordResetEmail = async (to: string, name: string, code: string) => {
  const config = getEmailConfig();
  if (!config.isGmailConfigured && !config.apiKey) {
    throw new Error('Email service is not configured (missing GMAIL_APP_PASSWORD or BREVO_API_KEY)');
  }

  const content = `
    <p style="margin:0 0 4px; color:#94A3B8; font-size:12px; font-weight:600;
              text-transform:uppercase; letter-spacing:0.8px;">
      Account Recovery
    </p>
    <h2 style="margin:0 0 16px; color:#0A1931; font-size:22px; font-weight:800; line-height:1.25;">
      Password Reset Code
    </h2>
    <p style="margin:0 0 6px; color:#475569; font-size:14px; line-height:1.65;">
      Hello <strong style="color:#0A1931;">${name || 'Citizen'}</strong>,
    </p>
    <p style="margin:0 0 24px; color:#64748B; font-size:13.5px; line-height:1.6;">
      Enter this 6-digit verification code in the <strong>SendResQPls</strong> app to reset your password:
    </p>

    <!-- Verification Code Card (Clean OTP: No links, no redirect proxies) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border:1px solid #E2E8F0; border-radius:14px; overflow:hidden;">

          <!-- Card Header -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#1A3FA3; padding:12px 18px;">
                <span style="color:#FFFFFF; font-size:11px; font-weight:800; letter-spacing:0.8px; text-transform:uppercase;">
                  Password Reset Code (OTP)
                </span>
              </td>
            </tr>
          </table>

          <!-- Card Body -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:28px 20px; text-align:center; background-color:#F8FAFC;">
                <div style="font-size:42px; font-weight:800; letter-spacing:10px; color:#0F172A; font-family:'Courier New', Courier, monospace; padding-left:10px; line-height:1;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="height:1px; background-color:#E2E8F0; line-height:1px; font-size:1px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:14px 18px; text-align:center; background-color:#FFFFFF;">
                <span style="color:#DC2626; font-size:13px; font-weight:700;">
                  This code expires in 15 minutes
                </span>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>

    <p style="margin:0; color:#94A3B8; font-size:12px; line-height:1.55;">
      Return to the <strong>SendResQPls mobile app</strong> on your device and enter this code along with your new password. If you did not request a password reset, you can safely ignore this email — your account remains completely secure.
    </p>
  `;

  const html = renderEmailLayout('SendResQPls - Reset Your Password', content);

  try {
    await sendEmail(
      'SendResQPls',
      to,
      `${code} is your SendResQPls password reset code`,
      html,
    );
  } catch (err: any) {
    throw new Error(err.response?.data?.message || err.message);
  }
};
