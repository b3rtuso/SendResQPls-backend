import axios from 'axios';
import fs from 'fs';
import path from 'path';

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SYSTEM_EMAIL?.trim().replace(/"/g, '') || 'bertingmagiting16@gmail.com';
  
  if (!apiKey) {
    console.error('❌ BREVO_API_KEY is not set in environment variables!');
  }
  return { apiKey, senderEmail };
}

let cachedLogoBase64: string = '';
function getLogoBase64(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const possiblePaths = [
      path.join(__dirname, '../assets/logo.jpg'),
      path.join(process.cwd(), 'src/assets/logo.jpg'),
      'c:\\Users\\angel\\disaster-mobile\\public\\logo.jpg',
      'c:\\Users\\angel\\disaster-admin\\public\\logo.jpg',
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
  return [
    {
      content: logoBase64,
      name: 'logo.jpg',
    },
  ];
}

function renderEmailLayout(title: string, contentHtml: string): string {
  const logoBase64 = getLogoBase64();
  const logoSrc = logoBase64 ? 'cid:logo.jpg' : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 36px rgba(15, 23, 42, 0.1), 0 2px 6px rgba(0, 0, 0, 0.04); border: 1px solid #E2E8F0;">
          
          <!-- Branded Header with Navy/Blue Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0A192F 0%, #1E3A8A 50%, #2563EB 100%); padding: 32px 28px 26px; text-align: center;">
              ${logoSrc ? `
              <div style="margin-bottom: 14px;">
                <img src="${logoSrc}" alt="SRQ Logo" width="64" height="64" style="border-radius: 14px; border: 2.5px solid rgba(255,255,255,0.9); box-shadow: 0 6px 18px rgba(0,0,0,0.3); display: inline-block; vertical-align: middle;" />
              </div>
              ` : ''}
              <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 900; letter-spacing: -0.3px; line-height: 1.25;">
                SENDRESQPLS • MDRRMO
              </h1>
              <p style="margin: 6px 0 0; color: #BFDBFE; font-size: 12px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase;">
                Municipality of Balayan, Batangas
              </p>
            </td>
          </tr>

          <!-- Dynamic Body Content -->
          <tr>
            <td style="padding: 30px 28px 24px; color: #1E293B;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Municipal Hotline & Support Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 22px 28px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 14px;">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; background-color: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; margin-right: 8px;">
                      HOTLINE 911
                    </span>
                    <span style="display: inline-block; background-color: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px;">
                      MDRRMO: 0917-123-4567
                    </span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #475569;">
                Municipal Disaster Risk Reduction & Management Office
              </p>
              <p style="margin: 0 0 10px; font-size: 11px; color: #64748B; line-height: 1.4;">
                Balayan Government Center, Plaza Rizal, Balayan, Batangas
              </p>
              <p style="margin: 0; font-size: 10.5px; color: #94A3B8; line-height: 1.35;">
                This is an automated operational notification from SendResQPls. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export const sendVerificationEmail = async (to: string, code: string) => {
  const { apiKey, senderEmail } = getBrevoConfig();
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');

  const content = `
    <h2 style="margin: 0 0 10px; color: #0F172A; font-size: 19px; font-weight: 800; letter-spacing: -0.3px;">
      Email Verification Code
    </h2>
    <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.55;">
      You are registering or signing in to the <strong>SendResQPls MDRRMO Emergency Response System</strong>. Use the 6-digit verification code below to confirm your account:
    </p>

    <!-- Code Display Card -->
    <div style="background-color: #0F172A; border-radius: 14px; padding: 22px 20px; text-align: center; margin: 0 0 20px; border: 1px solid #334155; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);">
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #38BDF8; line-height: 1; padding-left: 10px;">
        ${code}
      </div>
      <div style="margin-top: 10px; font-size: 11px; color: #94A3B8; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
        ⏱ Valid for 10 minutes
      </div>
    </div>

    <div style="background-color: #EFF6FF; border-left: 3.5px solid #2563EB; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
      <p style="margin: 0; color: #1E40AF; font-size: 12.5px; line-height: 1.45;">
        <strong>Security Notice:</strong> Never share this code with anyone. MDRRMO personnel and dispatchers will never ask for your verification code.
      </p>
    </div>

    <p style="margin: 0; color: #64748B; font-size: 12.5px; line-height: 1.45;">
      If you did not initiate this request, you can safely disregard this email.
    </p>
  `;

  try {
    const payload: any = {
      sender: { name: 'MDRRMO Balayan System', email: senderEmail },
      to: [{ email: to }],
      subject: `${code} is your SendResQPls verification code`,
      htmlContent: renderEmailLayout('Email Verification - SendResQPls', content),
    };

    const attachments = getEmailAttachments();
    if (attachments) payload.attachment = attachments;

    await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.message;
    throw new Error(errorMsg);
  }
};

export const sendStatusNotification = async (to: string, reporterName: string, incidentType: string, newStatus: string) => {
  const statusMessages: Record<string, string> = {
    PENDING: 'Your emergency report has been queued and is awaiting triage review by MDRRMO Balayan.',
    REVIEWING: 'The Command Center is currently validating incident details and mobilizing nearest units.',
    DISPATCHED: 'Emergency responders have been dispatched and are en route to the scene!',
    RESOLVED: 'On-scene emergency operations have concluded and this report has been marked as resolved. Thank you for your report.',
    REJECTED: 'Your report was reviewed by the triage team and could not be verified as an active emergency.',
  };

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    PENDING:    { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    REVIEWING:  { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
    DISPATCHED: { bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },
    RESOLVED:   { bg: '#DCFCE7', text: '#14532D', border: '#BBF7D0' },
    REJECTED:   { bg: '#FEE2E2', text: '#7F1D1D', border: '#FECACA' },
  };

  const currentTheme = statusColors[newStatus] || { bg: '#F1F5F9', text: '#334155', border: '#E2E8F0' };

  const content = `
    <h2 style="margin: 0 0 8px; color: #0F172A; font-size: 19px; font-weight: 800; letter-spacing: -0.3px;">
      Incident Status Update
    </h2>
    <p style="margin: 0 0 18px; color: #475569; font-size: 14px;">
      Hello <strong>${reporterName}</strong>,
    </p>

    <!-- Incident Info Card -->
    <div style="background-color: #F8FAFC; border-radius: 14px; padding: 20px; margin: 0 0 20px; border: 1px solid #E2E8F0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 14px;">
        <tr>
          <td>
            <div style="font-size: 11px; font-weight: 800; color: #64748B; letter-spacing: 0.5px; text-transform: uppercase;">INCIDENT TYPE</div>
            <div style="font-size: 17px; font-weight: 800; color: #0F172A; margin-top: 3px;">${incidentType}</div>
          </td>
          <td align="right">
            <div style="font-size: 11px; font-weight: 800; color: #64748B; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">CURRENT STATUS</div>
            <div style="display: inline-block; padding: 5px 12px; border-radius: 8px; font-weight: 800; font-size: 12.5px; background-color: ${currentTheme.bg}; color: ${currentTheme.text}; border: 1px solid ${currentTheme.border}; letter-spacing: 0.4px;">
              ${newStatus}
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top: 1px solid #E2E8F0; padding-top: 12px; font-size: 13.5px; color: #334155; line-height: 1.5;">
        ${statusMessages[newStatus] || 'Your report status has been updated by the dispatch team.'}
      </div>
    </div>

    <p style="margin: 0; color: #64748B; font-size: 12.5px; line-height: 1.5;">
      You can track real-time incident progression and responder deployment directly inside the SendResQPls mobile app.
    </p>
  `;

  const { apiKey, senderEmail } = getBrevoConfig();
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');

  try {
    const payload: any = {
      sender: { name: 'MDRRMO Balayan Dispatch', email: senderEmail },
      to: [{ email: to }],
      subject: `Emergency Report Update: ${incidentType} [${newStatus}]`,
      htmlContent: renderEmailLayout(`Incident Update - ${incidentType}`, content),
    };

    const attachments = getEmailAttachments();
    if (attachments) payload.attachment = attachments;

    await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.message;
    throw new Error(errorMsg);
  }
};

export const sendPasswordResetEmail = async (to: string, name: string, resetUrl: string) => {
  const { apiKey, senderEmail } = getBrevoConfig();
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');

  const content = `
    <h2 style="margin: 0 0 10px; color: #0F172A; font-size: 19px; font-weight: 800; letter-spacing: -0.3px;">
      Password Reset Request
    </h2>
    <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">
      Hello <strong>${name}</strong>,
    </p>
    <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.55;">
      We received a request to reset your password for your <strong>SendResQPls</strong> account. Click the button below to choose a new secure password:
    </p>

    <div style="text-align: center; margin: 0 0 24px;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; padding: 14px 34px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 14.5px; box-shadow: 0 6px 18px rgba(220, 38, 38, 0.28); letter-spacing: 0.2px;">
        Reset My Password
      </a>
    </div>

    <div style="background-color: #FFFBEB; border-left: 3.5px solid #F59E0B; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
      <p style="margin: 0; color: #92400E; font-size: 12px; line-height: 1.45;">
        <strong>Notice:</strong> This password reset link expires in 30 minutes. If you did not request a password reset, please ignore this message.
      </p>
    </div>
  `;

  try {
    const payload: any = {
      sender: { name: 'MDRRMO Balayan Security', email: senderEmail },
      to: [{ email: to }],
      subject: 'Reset your SendResQPls password',
      htmlContent: renderEmailLayout('Password Reset - SendResQPls', content),
    };

    const attachments = getEmailAttachments();
    if (attachments) payload.attachment = attachments;

    await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    const errorMsg = err.response?.data?.message || err.message;
    throw new Error(errorMsg);
  }
};