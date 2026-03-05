import { ProjectRequest } from '../types';

/**
 * EMAIL NOTIFICATION SERVICE
 * 
 * Uses Gmail API to send emails directly from the user's account.
 * Requires 'https://www.googleapis.com/auth/gmail.send' scope.
 */

const PIPELINE_LEAD_EMAIL = 'taradon.t@dwp.com';

export async function sendEmailNotification(to: string, subject: string, htmlMessage: string, cc?: string) {
  const accessToken = localStorage.getItem('dwp_access_token');
  if (!accessToken) {
    console.error('❌ No Access Token found. User must re-login.');
    return false;
  }

  try {
    const boundary = "__3D_PIPELINE_BOUNDARY__";
    const CRLF = "\r\n";

    let body = "";
    body += `MIME-Version: 1.0${CRLF}`;
    body += `To: ${to}${CRLF}`;
    if (cc) body += `Cc: ${cc}${CRLF}`;
    body += `Subject: ${subject}${CRLF}`;
    body += `Content-Type: multipart/mixed; boundary="${boundary}"${CRLF}${CRLF}`;

    // HTML Part
    body += `--${boundary}${CRLF}`;
    body += `Content-Type: text/html; charset="UTF-8"${CRLF}${CRLF}`;
    body += `${htmlMessage}${CRLF}${CRLF}`;

    body += `--${boundary}--`;

    // Base64Url encode for Gmail API
    const encodedMessage = btoa(unescape(encodeURIComponent(body)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    console.log('✅ Email sent via Gmail API');
    return true;

  } catch (error) {
    console.error('❌ Gmail API Error:', error);
    return false;
  }
}

export async function notifyNewWorkRequest(request: ProjectRequest, submitterEmail: string) {
  const subject = `[New Work Request] ${request.studioFullName} - ${request.requestName}`;
  const requestLink = `${window.location.origin}`;

  const htmlMessage = `
    <div style="font-family: Arial, sans-serif; color: #000; font-size: 15px; line-height: 1.6;">
      <h2 style="color: #7c3aed;">New 3D Pipeline Work Request</h2>
      
      <p>A new work request has been submitted:</p>
      
      <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 150px;">Studio</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.studioFullName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Project Name</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.projectName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Request Name</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.requestName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Number of Renderings</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.numberOfRenderings}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Priority</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.priority}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Submitted By</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.submittedBy}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Preferred Tool</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${request.preferredTool || 'Not Specified'}</td>
        </tr>
      </table>
      
      <div style="margin-top: 20px;">
        <a href="${requestLink}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">View in Dashboard</a>
      </div>
      
      <p style="margin-top: 30px; font-size: 12px; color: #666;">
        This is an automated notification from the DWP.Intelligence 3D Pipeline.
      </p>
    </div>
    `.trim();

  const to = PIPELINE_LEAD_EMAIL;
  const cc = submitterEmail;

  return await sendEmailNotification(to, subject, htmlMessage, cc);
}
