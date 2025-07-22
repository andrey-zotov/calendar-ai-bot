# Email Calendar Bot

An AWS Lambda-based email bot that automatically creates and sends calendar invites when it receives emails containing event information (date, time, and location).

## Overview

This bot monitors incoming emails sent to a specific email address and uses OpenAI's API to intelligently parse event details from email content. When event information is detected, it automatically generates and sends calendar invites to the original sender.

<img width="1184" height="1023" alt="image" src="https://github.com/user-attachments/assets/b04caa6b-44dc-4360-bb38-91173f176dc6" />


## Features

- **Email Monitoring**: Monitors incoming emails via AWS SES
- **AI-Powered Parsing**: Uses OpenAI API to extract event details from email content
- **Automatic Calendar Invites**: Generates and sends calendar invites via email
- **Whitelist Security**: Only processes emails from whitelisted addresses
- **AWS Lambda Integration**: Serverless deployment for cost-effectiveness
- **Configurable**: Easy configuration via environment variables

## Architecture

```
Email → AWS SES → Lambda Function → OpenAI API → Calendar Invite → Email Response
```

## Prerequisites

- AWS Account with access to:
  - AWS Lambda
  - Amazon SES (Simple Email Service)
  - IAM (for permissions)
- OpenAI API key
- Domain with email capabilities (for receiving emails)

### AWS Setup

#### SES Configuration
1. Verify your domain in AWS SES
2. Create an email receiving rule set
3. Add a rule to forward emails to your Lambda function

#### Lambda Function Setup
1. Create a new Lambda function
2. Upload the deployment package
3. Configure environment variables
4. Set up SES trigger

#### IAM Permissions

Your Lambda function requires specific IAM permissions to work correctly. Create or update your Lambda execution role with the following permissions:

**Required IAM Policy (JSON format):**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:your-region:your-account-number:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": [
                "arn:aws:ses:your-region:your-account-number:identity/your-domain",
                "arn:aws:ses:your-region:your-account-number:identity/your-email-in-the-domain",
                "arn:aws:ses:your-region:your-account-number:configuration-set/your-configuration-set-name"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:your-region:your-account-number:log-group:/aws/lambda/your-lambda:*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": [
                "arn:aws:s3:::your-s3-bucket-name/*"
            ]
        }
    ]
}
```

**Step-by-step IAM Setup:**

1. **Create IAM Role for Lambda:**
   - Go to AWS IAM Console → Roles → Create Role
   - Select "Lambda" as the trusted entity
   - Create a custom policy with the JSON above
   - Name the role (e.g., `calendar-bot-lambda-role`)

2. **Common Permission Issues and Solutions:**

   **AccessDeniedException for ses:SendEmail:**
   - Ensure your FROM_EMAIL is verified in AWS SES
   - Add `ses:SendEmail` and `ses:SendRawEmail` permissions

   **S3 GetObject errors:**
   - Replace `your-s3-bucket-name` with your actual S3 bucket name
   - Ensure the Lambda role can read from the S3 bucket where SES stores emails

3. **Attach Role to Lambda:**
   - In your Lambda function configuration
   - Go to Configuration → Permissions
   - Edit the execution role and select your created role

4. **Verify SES Setup:**
   - Verify your sending email address in AWS SES Console
   - If in SES sandbox, also verify recipient email addresses
   - Check SES sending limits and quotas


## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `OPENAI_MODEL` | OpenAI model to use (default: gpt-3.5-turbo) | No |
| `FROM_EMAIL` | Email address the bot sends from | Yes |
| `WHITELISTED_EMAILS` | Comma-separated list of allowed sender emails | Yes |
| `ALLOW_PLUS_SIGN` | Enables support for plus sign suffixes on email addresses. | No |
| `SUBJECT_PREFIX` | Invite emails subject will contain this prefix | No |
| `DEFAULT_TIMEZONE` | Timezone for event times (default: Europe/London) | No |
| `EMAIL_BUCKET` | AWS region for SES operations | Yes |
| `EMAIL_KEY_PREFIX` | S3 key name prefix where SES stores email. Include the trailing slash. | No |


### Whitelist Configuration

The bot only processes emails from addresses in the whitelist. Add email addresses to the `WHITELISTED_EMAILS` environment variable, separated by commas:

```
WHITELISTED_EMAILS=john@company.com,jane@company.com,team@company.com
```

## Usage

### How It Works

1. **Email Reception**: The bot receives emails via AWS SES
2. **Whitelist Check**: Verifies the sender is in the whitelist
3. **Content Analysis**: Uses OpenAI to extract event information
4. **Calendar Generation**: Creates calendar invite with extracted details
5. **Response**: Sends calendar invite back to the original sender

### Email Format

The bot can parse event information from various email formats. It looks for:
- Date and time information
- Location details
- Event descriptions

### Example Email

```
Subject: Team Meeting Tomorrow

Hi team,

Let's have a meeting tomorrow at 2 PM in the conference room.
We'll discuss the Q4 strategy.

Best regards,
John
```

## API Reference

### Lambda Function Handler

The main handler function processes incoming SES events:

```javascript
exports.handler = async (event) => {
    // Process SES email event
    // Extract email content
    // Parse with OpenAI
    // Generate calendar invite
    // Send response
};
```

### OpenAI Integration

The bot uses OpenAI's API to intelligently parse email content and extract:
- Event date and time
- Location
- Event description

## Development

### Local Development and Testing

```bash
# Install dependencies
npm install

# Lint
npm run lint

# Test
npm test
```

## Troubleshooting

### Common Issues

1. **Emails not being processed**
   - Check SES configuration
   - Verify Lambda trigger is set up correctly
   - Check CloudWatch logs

2. **Calendar invites not being sent**
   - Verify sender email is verified in SES
   - Check IAM permissions
   - Review OpenAI API key validity

3. **OpenAI API errors**
   - Check API key validity
   - Verify account has sufficient credits
   - Check rate limits

### Debugging

Enable debug logging by setting the `DEBUG` environment variable:

```env
DEBUG=true
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE-MIT](LICENSE-MIT) file for details.

## Acknowledgments

- Inspired by [aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder)
- Uses OpenAI API for intelligent email parsing
- Built with AWS Lambda and SES

## Support

For support and questions:
- Check the troubleshooting section
- Review AWS and OpenAI documentation
- Create an issue in the GitHub repository
