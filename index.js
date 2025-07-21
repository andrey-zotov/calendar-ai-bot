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
// - MAX_TOKENS: Maximum tokens for OpenAI response (default: 500)
// - FROM_EMAIL: Email address the bot sends from
// - SUBJECT_PREFIX: Calendar invite emails subject prefix
// - WHITELISTED_EMAILS: Comma-separated list of allowed sender emails
// - ALLOW_PLUS_SIGN: Enables support for plus sign suffixes
// - EMAIL_BUCKET: S3 bucket name where SES stores emails
// - EMAIL_KEY_PREFIX: S3 key name prefix where SES stores email

const getConfig = () => ({
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
  maxTokens: parseInt(process.env.MAX_TOKENS) || 500,
  fromEmail: process.env.FROM_EMAIL || "noreply@example.com",
  subjectPrefix: process.env.SUBJECT_PREFIX || "Calendar Invite: ",
  emailBucket: process.env.EMAIL_BUCKET,
  emailKeyPrefix: process.env.EMAIL_KEY_PREFIX || "emails/",
  allowPlusSign: process.env.ALLOW_PLUS_SIGN !== 'false',
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
 * Checks if the sender email is in the whitelist.
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

    const prompt = `Parse the following email content and extract event information. If this email contains information about a meeting, event, or appointment, return a JSON object with the following structure:

{
  "hasEvent": true,
  "title": "Event title",
  "description": "Event description",
  "dateTime": "YYYY-MM-DDTHH:mm:ss",
  "location": "Event location",
  "duration": "PT1H" // ISO 8601 duration format
}

If no event information is found, return: {"hasEvent": false}

Email content:
${emailContent}`;

    const requestBody = JSON.stringify({
      model: data.config.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: data.config.maxTokens,
      temperature: 0.1
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
  if (!data.eventInfo.hasEvent) {
    data.log({
      level: "info",
      message: "No event information found. Not sending calendar invite."
    });
    return data.callback();
  }

  // Generate calendar invite content
  const ics = generateICS(data.eventInfo, data.senderEmail);

  const params = {
    Destination: { ToAddresses: [data.senderEmail] },
    Source: data.config.fromEmail,
    Content: {
      Simple: {
        Subject: {
          Data: data.config.subjectPrefix + data.eventInfo.title,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `<html><body>
              <p>Hello,</p>
              <p>I've detected event information in your email and created a calendar invite for you:</p>
              <ul>
                <li><strong>Event:</strong> ${data.eventInfo.title}</li>
                <li><strong>Date/Time:</strong> ${data.eventInfo.dateTime}</li>
                <li><strong>Location:</strong> ${data.eventInfo.location || 'Not specified'}</li>
                <li><strong>Description:</strong> ${data.eventInfo.description || 'No description'}</li>
              </ul>
              <p>Please see the attached calendar invite.</p>
              <p>Best regards,<br>Calendar AI Bot</p>
            </body></html>`,
            Charset: 'UTF-8'
          }
        }
      }
    },
    ReplyToAddresses: [data.config.fromEmail]
  };

  // Add calendar invite as attachment if we had a way to add attachments
  // For now, we'll include the ICS content in the email body
  params.Content.Simple.Body.Text = {
    Data: `Hello,\n\nI've detected event information in your email and created a calendar invite for you:\n\nEvent: ${data.eventInfo.title}\nDate/Time: ${data.eventInfo.dateTime}\nLocation: ${data.eventInfo.location || 'Not specified'}\nDescription: ${data.eventInfo.description || 'No description'}\n\nCalendar Invite (copy and save as .ics file):\n\n${ics}\n\nBest regards,\nCalendar AI Bot`,
    Charset: 'UTF-8'
  };

  data.log({
    level: "info",
    message: `Sending calendar invite to ${data.senderEmail} for event: ${data.eventInfo.title}`
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
 * Generates ICS (iCalendar) content for the event.
 *
 * @param {object} eventInfo - Event information from OpenAI.
 * @param {string} attendeeEmail - Email of the attendee.
 *
 * @return {string} - ICS content.
 */
function generateICS(eventInfo, attendeeEmail) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const eventDate = new Date(eventInfo.dateTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `${now}-${Math.random().toString(36).substr(2, 9)}@calendar-ai-bot`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calendar AI Bot//Calendar AI Bot 1.0//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTAMP:${now}
UID:${uid}
DTSTART:${eventDate}
SUMMARY:${eventInfo.title}
DESCRIPTION:${eventInfo.description || ''}
LOCATION:${eventInfo.location || ''}
ATTENDEE:mailto:${attendeeEmail}
ORGANIZER:mailto:${attendeeEmail}
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;
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
