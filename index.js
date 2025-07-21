"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const https = require('https');

console.log("Calendar AI Bot // Version 1.0.0");

// Configuration for the Calendar AI Bot
//
// Environment variables:
// - OPENAI_API_KEY: OpenAI API key for content parsing
// - OPENAI_MODEL: OpenAI model to use (default: gpt-3.5-turbo)
// - FROM_EMAIL: Email address the bot sends from
// - SUBJECT_PREFIX: Calendar invite emails subject prefix
// - WHITELISTED_EMAILS: Comma-separated list of allowed sender emails
// - ALLOW_PLUS_SIGN: Enables support for plus sign suffixes
// - DEFAULT_TIMEZONE: Timezone for event times (default: Europe/London)
// - EMAIL_BUCKET: S3 bucket name where SES stores emails
// - EMAIL_KEY_PREFIX: S3 key name prefix where SES stores email

const getConfig = () => ({
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
  fromEmail: process.env.FROM_EMAIL || "noreply@example.com",
  subjectPrefix: process.env.SUBJECT_PREFIX || "",
  emailBucket: process.env.EMAIL_BUCKET,
  emailKeyPrefix: process.env.EMAIL_KEY_PREFIX || "emails/",
  allowPlusSign: process.env.ALLOW_PLUS_SIGN !== 'false',
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/London',
  whitelistedEmails: process.env.WHITELISTED_EMAILS ?
      process.env.WHITELISTED_EMAILS.split(',').map(email => email.trim().toLowerCase()) : []
});

/**
 * Parses the SES event record provided for the `mail` and `recipients` data.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.parseEvent = function(data) {
  // Validate characteristics of a SES event record.
  if (!data.event ||
    !Object.hasOwn(data.event, 'Records') ||
    data.event.Records.length !== 1 ||
    !Object.hasOwn(data.event.Records[0], 'eventSource') ||
    data.event.Records[0].eventSource !== 'aws:ses' ||
    data.event.Records[0].eventVersion !== '1.0') {
    data.log({
      message: "parseEvent() received invalid SES message:",
      level: "error", event: JSON.stringify(data.event)
    });
    return Promise.reject(new Error('Error: Received invalid SES message.'));
  }

  data.email = data.event.Records[0].ses.mail;
  data.recipients = data.event.Records[0].ses.receipt.recipients;
  return Promise.resolve(data);
};

/**
 * Detects if the email is a calendar invitation response (accept/decline notification).
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {boolean} - True if this is an invitation response email.
 */
function isInvitationResponse(data) {
  const subject = data.email.commonHeaders.subject || '';
  const subjectLower = subject.toLowerCase();

  // Check for common invitation response patterns in subject
  const responsePatterns = [
    'accepted:',
    'declined:',
    'tentative:',
    'accepted invitation:',
    'declined invitation:',
    'tentative invitation:',
    'has accepted',
    'has declined',
    'has tentatively accepted',
    'response to your invitation',
    'invitation response',
    're: invitation',
    'meeting response',
    'calendar response'
  ];

  for (const pattern of responsePatterns) {
    if (subjectLower.includes(pattern)) {
      return true;
    }
  }

  // Check sender patterns - common calendar systems
  const senderEmail = data.email.commonHeaders.from[0];
  const extractedEmail = senderEmail.match(/<(.+)>/) ? senderEmail.match(/<(.+)>/)[1] : senderEmail;
  const senderLower = extractedEmail.toLowerCase();

  const calendarSenders = [
    'calendar-server@',
    'noreply@calendar',
    'calendar@',
    'no-reply@calendar',
    'calendar-notification@',
    'calendar.google.com',
    'outlook.office365.com',
    'exchange.',
    'calendar-daemon@'
  ];

  for (const sender of calendarSenders) {
    if (senderLower.includes(sender)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the sender email is in the whitelist and filters out invitation responses.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.checkWhitelist = function(data) {
  const senderEmail = data.email.commonHeaders.from[0];
  const extractedEmail = senderEmail.match(/<(.+)>/) ? senderEmail.match(/<(.+)>/)[1] : senderEmail;
  const normalizedEmail = extractedEmail.toLowerCase();

  data.senderEmail = normalizedEmail;
  data.originalRecipients = data.recipients;

  // Check if this is an invitation response email and skip processing
  if (isInvitationResponse(data)) {
    data.log({
      message: `Email from ${extractedEmail} appears to be a calendar invitation response. Ignoring.`,
      level: "info",
      subject: data.email.commonHeaders.subject
    });
    // Set a flag to indicate early termination and call callback
    data.earlyTermination = true;
    data.callback();
    return Promise.resolve(data);
  }

  if (data.config.whitelistedEmails.length === 0) {
    data.log({
      message: "Warning: No whitelisted emails configured. Processing all emails.",
      level: "warn"
    });
    return Promise.resolve(data);
  }

  if (!data.config.whitelistedEmails.includes(normalizedEmail)) {
    data.log({
      message: `Email from ${extractedEmail} not in whitelist. Ignoring.`,
      level: "info"
    });
    return data.callback();
  }

  data.log({
    message: `Email from ${normalizedEmail} is whitelisted. Processing.`,
    level: "info"
  });

  return Promise.resolve(data);
};

/**
 * Fetches the message data from S3.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.fetchMessage = function(data) {
  // Skip processing if early termination was requested
  if (data.earlyTermination) {
    return Promise.resolve(data);
  }

  data.log({
    level: "info",
    message: "Fetching email at s3://" + data.config.emailBucket + '/' +
      data.config.emailKeyPrefix + data.email.messageId
  });
  return new Promise(function(resolve, reject) {
    // Load the raw email from S3
    data.s3.send(new GetObjectCommand({
      Bucket: data.config.emailBucket,
      Key: data.config.emailKeyPrefix + data.email.messageId
    }), async function(err, result) {
      if (err) {
        data.log({
          level: "error",
          message: "GetObjectCommand() returned error:",
          error: err,
          stack: err.stack
        });
        return reject(
          new Error("Error: Failed to load message body from S3."));
      }
      data.emailData = await result.Body.transformToString();
      return resolve(data);
    });
  });
};

/**
 * Parses email content using OpenAI to extract event information.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.parseEventDetails = async function(data) {
  // Skip processing if early termination was requested
  if (data.earlyTermination) {
    return Promise.resolve(data);
  }

  try {
    // Extract email body content
    const match = data.emailData.match(/^((?:.+\r?\n)*)(\r?\n(?:.*\s+)*)/m);
    const header = match && match[1] ? match[1] : data.emailData;
    const body = match && match[2] ? match[2] : '';

    // Extract subject from header
    const subjectMatch = header.match(/^subject:[\t ]?(.*)/mi);
    const subject = subjectMatch ? subjectMatch[1].trim() : '';

    const emailContent = `Subject: ${subject}\n\n${body.trim()}`;

    data.log({
      level: "info",
      message: "Parsing email content with OpenAI"
    });

    const prompt = `Parse the following email content and extract event information.
If this email contains information about a meeting, event, or appointment, return a JSON object with the following structure:
{
  "hasEvent": true,
  "title": "Event title",
  "description": "Event description",
  "dateTime": "YYYY-MM-DDTHH:mm:ss",
  "location": "Event location",
  "duration": "PT1H" // ISO 8601 duration format
}

Important guidelines:
- For the event title, use the email subject if it's descriptive and appropriate for a calendar event. If the subject is generic (like "Re: Meeting" or "FW: Question"), create a more descriptive title based on the email content.
- Today is ${new Date().toISOString().split('T')[0]}.
- The current timezone is ${data.config.defaultTimezone}. When parsing times, assume they are in this timezone unless otherwise specified.
- With regards to the meeting date, if the email is not specific enough (e.g. year is not specified, or only weekday is given), pick the date in the future, which is closest to today.
- Return times in ISO 8601 format (YYYY-MM-DDTHH:mm:ss) without timezone designator, as they will be interpreted in the ${data.config.defaultTimezone} timezone.

If no event information is found, return: {"hasEvent": false}

Email content:
${emailContent}`;

    const requestBody = JSON.stringify({
      model: data.config.openaiModel,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.config.openaiApiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const httpsRequest = data.httpsRequest || https.request;
    const response = await new Promise((resolve, reject) => {
      const req = httpsRequest(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.choices[0].message.content.trim());
            } catch (e) {
              reject(new Error('Failed to parse OpenAI response: ' + e.message));
            }
          } else {
            reject(new Error(`OpenAI API error: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });
    data.eventInfo = JSON.parse(response);

    data.log({
      level: "info",
      message: "OpenAI response parsed",
      eventInfo: data.eventInfo
    });

    return Promise.resolve(data);
  } catch (error) {
    data.log({
      level: "error",
      message: "Error parsing event details with OpenAI:",
      error: error.message
    });
    return Promise.reject(new Error('Error: Failed to parse event details.'));
  }
};

/**
 * Creates and sends a calendar invite if event information was found.
 *
 * @param {object} data - Data bundle with context, email, etc.
 *
 * @return {object} - Promise resolved with data.
 */
exports.sendCalendarInvite = function(data) {
  // Skip processing if early termination was requested
  if (data.earlyTermination) {
    return Promise.resolve(data);
  }

  if (!data.eventInfo.hasEvent) {
    data.log({
      level: "info",
      message: "No event information found. Not sending calendar invite."
    });
    return data.callback();
  }

  // Generate calendar invite content
  const ics = generateICS(data.eventInfo, data.senderEmail, data.config.fromEmail, data.config.defaultTimezone);

  // Validate required data
  data.log({
    level: "info",
    message: "Validating email parameters",
    senderEmail: data.senderEmail,
    fromEmail: data.config.fromEmail,
    eventTitle: data.eventInfo.title,
    hasValidSenderEmail: !!data.senderEmail && data.senderEmail.includes('@'),
    hasValidFromEmail: !!data.config.fromEmail && data.config.fromEmail.includes('@')
  });

  if (!data.senderEmail || !data.senderEmail.includes('@')) {
    data.log({
      level: "error",
      message: "Invalid sender email address",
      senderEmail: data.senderEmail
    });
    return Promise.reject(new Error('Error: Invalid sender email address.'));
  }

  if (!data.config.fromEmail || !data.config.fromEmail.includes('@')) {
    data.log({
      level: "error",
      message: "Invalid from email address",
      fromEmail: data.config.fromEmail
    });
    return Promise.reject(new Error('Error: Invalid from email address.'));
  }

  // Clean and validate event data
  const cleanTitle = (data.eventInfo.title || 'Event').replace(/[\r\n\t]/g, ' ').substring(0, 200);
  const cleanDateTime = data.eventInfo.dateTime || 'Not specified';
  const cleanLocation = (data.eventInfo.location || 'Not specified').replace(/[\r\n\t]/g, ' ').substring(0, 200);
  const cleanDescription = (data.eventInfo.description || 'No description').replace(/[\r\n\t]/g, ' ').substring(0, 500);

  const textBody = `Hello,

I've detected event information in your email and created a calendar invite for you:

Event: ${cleanTitle}
Date/Time: ${cleanDateTime}
Location: ${cleanLocation}
Description: ${cleanDescription}

Please find the calendar invite attached to this email.

Best regards,
Calendar AI Bot`;

  const htmlBody = `<html><body>
<p>Hello,</p>
<p>I've detected event information in your email and created a calendar invite for you:</p>
<ul>
  <li><strong>Event:</strong> ${cleanTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>
  <li><strong>Date/Time:</strong> ${cleanDateTime}</li>
  <li><strong>Location:</strong> ${cleanLocation.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>
  <li><strong>Description:</strong> ${cleanDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>
</ul>
<p>Please find the calendar invite attached to this email.</p>
<p>Best regards,<br>Calendar AI Bot</p>
</body></html>`;

  // Convert ICS to base64 for attachment (following StackOverflow solution)
  const buf = Buffer.from(ics, 'utf-8');
  const base64Cal = buf.toString('base64');

  // Create raw MIME email with base64 ICS attachment
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const subject = (data.config.subjectPrefix || "") + cleanTitle;

  const rawEmail = [
    `From: ${data.config.fromEmail}`,
    `To: ${data.senderEmail}`,
    `Reply-To: ${data.config.fromEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${boundary}-alt"`,
    ``,
    `--${boundary}-alt`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    textBody,
    ``,
    `--${boundary}-alt`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    htmlBody,
    ``,
    `--${boundary}-alt--`,
    ``,
    `--${boundary}`,
    `Content-Type: text/calendar;method=REQUEST;name="invite.ics"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="invite.ics"`,
    ``,
    base64Cal,
    ``,
    `--${boundary}--`
  ].join('\r\n');

  const params = {
    FromEmailAddress: data.config.fromEmail,
    Destination: { ToAddresses: [data.senderEmail] },
    Content: {
      Raw: {
        Data: Buffer.from(rawEmail, 'utf8')
      }
    },
    ReplyToAddresses: [data.config.fromEmail]
  };

  data.log({
    level: "info",
    message: `Sending calendar invite to ${data.senderEmail} for event: ${data.eventInfo.title}`,
    sesParams: JSON.stringify(params, null, 2)
  });

  return new Promise(function(resolve, reject) {
    data.ses.send(new SendEmailCommand(params), function(err, result) {
      if (err) {
        data.log({
          level: "error",
          message: "SendEmailCommand() returned error.",
          error: err,
          stack: err.stack
        });
        return reject(new Error('Error: Calendar invite sending failed.'));
      }
      data.log({
        level: "info",
        message: "Calendar invite sent successfully.",
        result: result
      });
      resolve(data);
    });
  });
};

/**
 * Converts a timezone string to an offset from UTC.
 *
 * @param {string} timezone - Timezone identifier (e.g., 'Europe/London')
 * @param {Date} date - Date to get offset for (needed for DST)
 *
 * @return {number} - Offset in minutes from UTC (positive for ahead, negative for behind)
 */
function getTimezoneOffset(timezone, date) {
  // Simple mapping for common timezones (in a production app, use a proper timezone library)
  const timezoneOffsets = {
    'Europe/London': () => {
      // British Summer Time (BST) is UTC+1 (Mar-Oct), GMT is UTC+0 (Nov-Feb)
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-indexed
      const day = date.getDate();
      const hour = date.getHours();

      // Approximate BST dates (last Sunday in March to last Sunday in October)
      // This is a simplified check - in production use a proper timezone library
      if (month > 2 && month < 9) return 60; // BST (UTC+1)
      if (month === 2) { // March
        const lastSunday = 31 - new Date(year, 2, 31).getDay();
        return day >= lastSunday ? 60 : 0;
      }
      if (month === 9) { // October
        const lastSunday = 31 - new Date(year, 9, 31).getDay();
        return day < lastSunday ? 60 : 0;
      }
      return 0; // GMT (UTC+0)
    },
    'UTC': () => 0,
    'GMT': () => 0
  };

  const offsetFunc = timezoneOffsets[timezone] || timezoneOffsets['Europe/London'];
  return offsetFunc();
}

/**
 * Formats a date for ICS with timezone support.
 *
 * @param {Date} date - Date to format
 * @param {string} timezone - Timezone identifier
 *
 * @return {string} - Formatted date string for ICS
 */
function formatICSDate(date, timezone) {
  if (timezone === 'UTC' || timezone === 'GMT') {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  // For local timezone, format without Z suffix so calendar apps interpret in user's local timezone
  // The timezone offset adjustment helps ensure the time displays correctly
  const offset = getTimezoneOffset(timezone, date);
  const localDate = new Date(date.getTime() + offset * 60000);
  return localDate.toISOString().replace(/[-:]/g, '').split('.')[0];
}

/**
 * Generates ICS (iCalendar) content for the event.
 *
 * @param {object} eventInfo - Event information from OpenAI.
 * @param {string} attendeeEmail - Email of the attendee.
 * @param {string} organizerEmail - Email of the organizer (bot).
 * @param {string} timezone - Timezone for the event (e.g., 'Europe/London').
 *
 * @return {string} - ICS content.
 */
function generateICS(eventInfo, attendeeEmail, organizerEmail, timezone = 'Europe/London') {
  const now = new Date();
  const nowFormatted = formatICSDate(now, 'UTC'); // DTSTAMP should always be in UTC

  const startDate = new Date(eventInfo.dateTime);
  const startDateFormatted = formatICSDate(startDate, timezone);

  // Calculate end time (default to 1 hour if no duration specified)
  let duration = eventInfo.duration || 'PT1H';  // ISO 8601 duration format
  let durationMs = 60 * 60 * 1000; // Default 1 hour in milliseconds

  // Parse ISO 8601 duration (PT1H = 1 hour, PT30M = 30 minutes, etc.)
  if (duration.match(/PT(\d+)H/)) {
    const hours = parseInt(duration.match(/PT(\d+)H/)[1]);
    durationMs = hours * 60 * 60 * 1000;
  } else if (duration.match(/PT(\d+)M/)) {
    const minutes = parseInt(duration.match(/PT(\d+)M/)[1]);
    durationMs = minutes * 60 * 1000;
  }

  const endDate = new Date(startDate.getTime() + durationMs);
  const endDateFormatted = formatICSDate(endDate, timezone);

  const uid = `${eventInfo.title?.replace(/\s+/g, '-') || 'event'}-${Date.now()}@calendar-ai-bot`;

  // Follow the exact format from StackOverflow solution - order is critical!
  // Use local time format (without Z suffix) so calendar apps interpret in user's timezone
  const iCal = `BEGIN:VCALENDAR
PRODID:-//Calendar AI Bot//_Scheduler//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:${startDateFormatted}
DTEND:${endDateFormatted}
DTSTAMP:${nowFormatted}
ORGANIZER;CN=${organizerEmail}:mailto:${organizerEmail}
UID:${uid}
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${attendeeEmail};X-NUM-GUESTS=0:mailto:${attendeeEmail}
CREATED:${nowFormatted}
DESCRIPTION:${eventInfo.description || ''}
LAST-MODIFIED:${nowFormatted}
LOCATION:${eventInfo.location || ''}
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:${eventInfo.title || 'Event'}
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

  return iCal;
}

/**
 * Handler function to be invoked by AWS Lambda with an inbound SES email as
 * the event.
 *
 * @param {object} event - Lambda event from inbound email received by AWS SES.
 * @param {object} context - Lambda context object.
 * @param {object} callback - Lambda callback object.
 * @param {object} overrides - Overrides for the default data, including the
 * configuration, SES object, and S3 object.
 */
exports.handler = function(event, context, callback, overrides) {
  const config = getConfig();

  if (!config.openaiApiKey) {
    console.log({
      level: "error",
      message: "OPENAI_API_KEY environment variable is required"
    });
    return callback(new Error("Error: OPENAI_API_KEY environment variable is required"));
  }

  const steps = overrides && overrides.steps ? overrides.steps :
      [
        exports.parseEvent,
        exports.checkWhitelist,
        exports.fetchMessage,
        exports.parseEventDetails,
        exports.sendCalendarInvite
      ];
  const data = {
    event: event,
    callback: callback,
    context: context,
    config: overrides && overrides.config ? overrides.config : config,
    log: overrides && overrides.log ? overrides.log : console.log,
    ses: overrides && overrides.ses ? overrides.ses : new SESv2Client(),
    s3: overrides && overrides.s3 ?
      overrides.s3 : new S3Client({signatureVersion: 'v4'})
  };
  Promise.series(steps, data)
    .then(function(data) {
      data.log({
        level: "info",
        message: "Calendar AI Bot process finished successfully."
      });
      return data.callback();
    })
    .catch(function(err) {
      data.log({
        level: "error",
        message: "Step returned error: " + err.message,
        error: err,
        stack: err.stack
      });
      return data.callback(new Error("Error: Step returned error."));
    });
};

Promise.series = function(promises, initValue) {
  return promises.reduce(function(chain, promise) {
    if (typeof promise !== 'function') {
      return chain.then(() => {
        throw new Error("Error: Invalid promise item: " + promise);
      });
    }
    return chain.then(promise);
  }, Promise.resolve(initValue));
};
