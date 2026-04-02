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

export async function notifyOutsourceVendor(request: ProjectRequest, submitterEmail: string, vendorEmail: string) {
  const subject = `[New 3D Request] Action Required: ${request.projectName} - ${request.requestName}`;
  const portalLink = `${window.location.origin}/outsource`;

  // We add this to make it easy for vendors to contact the requester
  const replyTo = submitterEmail;

  const htmlMessage = `
    <div style="font-family: Arial, sans-serif; color: #000; font-size: 15px; line-height: 1.6;">
      <h2 style="color: #f97316;">New 3D Work Request Assigned</h2>
      
      <p>Hello,</p>
      <p>A new 3D visualization request has been assigned to you by <strong>${request.requester}</strong>.</p>
      
      <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #e4e4e7;">
        <h3 style="margin-top: 0; color: #18181b;">Request Details</h3>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 150px;">Project Name</td>
            <td style="padding: 8px 0;">${request.projectName || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Request Title</td>
            <td style="padding: 8px 0;">${request.requestName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Deadline</td>
            <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${request.deadline}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Renderings</td>
            <td style="padding: 8px 0;">${request.numberOfRenderings}</td>
          </tr>
        </table>
      </div>

      <p>Please review the full brief, download the provided resources, and submit your deliverables via the dwp.Partner Portal:</p>
      
      <div style="margin-top: 25px; margin-bottom: 35px;">
        <a href="${portalLink}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Open Partner Portal</a>
      </div>
      
      <p style="margin-top: 30px; font-size: 13px; color: #71717a; border-top: 1px solid #e4e4e7; padding-top: 15px;">
        This is an automated notification from dwp.intelligence.<br/>
        If you have questions, please reply directly to this email to contact <strong>${submitterEmail}</strong>.
      </p>
    </div>
    `.trim();

  // Try to send and set CC to requester so they are in the loop
  return await sendEmailNotification(vendorEmail, subject, htmlMessage, replyTo);
}

/**
 * Notify an internal 3D team member when they are assigned to a project by a leader.
 */
export async function notifyAssignedMember(
  memberEmail: string,
  memberName: string,
  projectData: {
    project_name?: string;
    project_number?: string;
    request_name?: string;
    deadline?: string;
    status?: string;
    priority?: string;
    description?: string;
  }
) {
  const projectLabel = projectData.project_number
    ? `${projectData.project_number} - ${projectData.project_name || 'Untitled'}`
    : projectData.project_name || 'Untitled Project';

  const subject = `[Project Assigned] ${projectLabel}`;
  const dashboardLink = `${window.location.origin}`;

  const deadlineDisplay = projectData.deadline
    ? new Date(projectData.deadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not specified';

  const htmlMessage = `
    <div style="font-family: Arial, sans-serif; color: #000; font-size: 15px; line-height: 1.6;">
      <h2 style="color: #3b82f6;">You've Been Assigned to a Project</h2>
      
      <p>Hi ${memberName},</p>
      <p>You have been assigned to a new 3D visualization project. Please review the details below and begin work at your earliest convenience.</p>
      
      <div style="background-color: #f0f4ff; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #dbeafe;">
        <h3 style="margin-top: 0; color: #1e3a5f;">Project Details</h3>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 150px;">Project</td>
            <td style="padding: 8px 0;">${projectLabel}</td>
          </tr>
          ${projectData.request_name ? `
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Request</td>
            <td style="padding: 8px 0;">${projectData.request_name}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Deadline</td>
            <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${deadlineDisplay}</td>
          </tr>
          ${projectData.priority ? `
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Priority</td>
            <td style="padding: 8px 0;">${projectData.priority}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Status</td>
            <td style="padding: 8px 0;">${projectData.status || 'Submitted'}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top: 25px; margin-bottom: 35px;">
        <a href="${dashboardLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Open 3D Pipeline Dashboard</a>
      </div>
      
      <p style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #e4e4e7; padding-top: 15px;">
        This is an automated notification from the DWP.Intelligence 3D Pipeline.<br/>
        If you have questions, please contact your 3D Pipeline Lead.
      </p>
    </div>
  `.trim();

  // Send to the assigned member, CC the pipeline lead so they have a record
  return await sendEmailNotification(memberEmail, subject, htmlMessage, PIPELINE_LEAD_EMAIL);
}
