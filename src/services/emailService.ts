import axios from 'axios';

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SYSTEM_EMAIL?.trim().replace(/"/g, '') || 'bertingmagiting16@gmail.com';
  
  if (!apiKey) {
    console.error('❌ BREVO_API_KEY is not set in environment variables!');
  }
  return { apiKey, senderEmail };
}

export const sendVerificationEmail = async (to: string, code: string) => {
  const { apiKey, senderEmail } = getBrevoConfig();
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'MDRRMO System', email: senderEmail },
      to: [{ email: to }],
      subject: 'Your Verification Code - SendResqPls',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #DC2626; margin-bottom: 8px;">SendResqPls Verification</h2>
          <p style="color: #333;">Use this code to verify your email address:</p>
          <div style="background: #F3F4F6; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #111;">${code}</span>
          </div>
          <p style="color: #666; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #999; font-size: 11px;">MDRRMO Disaster Incident Reporting System</p>
        </div>
      `,
    }, {
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
    PENDING: 'Your report is pending review by MDRRMO.',
    REVIEWING: 'Your report is being reviewed by the dispatch team.',
    DISPATCHED: 'A response team has been dispatched to the reported location!',
    RESOLVED: 'Your incident report has been resolved. Thank you for reporting.',
    REJECTED: 'Your report has been reviewed and was not classified as an emergency.',
  };

  const statusColors: Record<string, string> = {
    PENDING: '#F59E0B',
    REVIEWING: '#3B82F6',
    DISPATCHED: '#8B5CF6',
    RESOLVED: '#22C55E',
    REJECTED: '#EF4444',
  };

  const { apiKey, senderEmail } = getBrevoConfig();
  if (!apiKey) throw new Error('BREVO_API_KEY is missing');

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'MDRRMO System', email: senderEmail },
      to: [{ email: to }],
      subject: `Report Update: ${incidentType} — ${newStatus}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #DC2626; margin-bottom: 8px;">Report Status Update</h2>
          <p style="color: #333;">Hi <strong>${reporterName}</strong>,</p>
          <p style="color: #333;">Your incident report has been updated:</p>
          <div style="background: #F3F4F6; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">INCIDENT TYPE</div>
            <div style="font-size: 18px; font-weight: 700; color: #111; margin-bottom: 16px;">${incidentType}</div>
            <div style="font-size: 13px; color: #666; margin-bottom: 4px;">NEW STATUS</div>
            <div style="display: inline-block; padding: 6px 16px; border-radius: 8px; font-weight: 700; font-size: 14px; color: white; background: ${statusColors[newStatus] || '#666'};">${newStatus}</div>
          </div>
          <p style="color: #333; font-size: 14px;">${statusMessages[newStatus] || ''}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #999; font-size: 11px;">MDRRMO Disaster Incident Reporting System — SendResqPls</p>
        </div>
      `,
    }, {
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

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'MDRRMO System', email: senderEmail },
      to: [{ email: to }],
      subject: 'Password Reset - SendResqPls',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #DC2626; margin-bottom: 8px;">Password Reset Request</h2>
          <p style="color: #333;">Hi <strong>${name}</strong>,</p>
          <p style="color: #333;">You requested to reset your password for SendResqPls. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="background: #DC2626; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">Reset My Password</a>
          </div>
          <p style="color: #666; font-size: 13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #999; font-size: 11px;">MDRRMO Disaster Incident Reporting System — SendResqPls</p>
        </div>
      `,
    }, {
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