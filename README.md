# Email Calendar Bot

An AWS Lambda-based email bot that automatically creates and sends calendar invites when it receives emails containing event information (date, time, and location).

## Overview

This bot monitors incoming emails sent to a specific email address and uses OpenAI's API to intelligently parse event details from email content. When event information is detected, it automatically generates and sends calendar invites to the original sender.

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

## Installation & Setup

### 1. Clone the Repository

```bash
git clone git@github.com:andrey-zotov/calendar-ai-bot.git
cd calendar-ai-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo
MAX_TOKENS=500

# Email Configuration
FROM_EMAIL=your-bot@yourdomain.com
SUBJECT_PREFIX=
ALLOW_PLUS_SIGN=true

# Whitelist Configuration
WHITELISTED_EMAILS=email1@domain.com,email2@domain.com

# AWS Configuration
EMAIL_BUCKET=
EMAIL_KEY_PREFIX=
```

### 4. AWS Setup

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
Ensure your Lambda execution role has the following permissions:
- `ses:SendEmail`
- `ses:SendRawEmail`
- `logs:CreateLogGroup`
- `logs:CreateLogStream`
- `logs:PutLogEvents`


## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `OPENAI_MODEL` | OpenAI model to use (default: gpt-3.5-turbo) | No |
| `MAX_TOKENS` | Maximum tokens for OpenAI response (default: 500) | No |
| `FROM_EMAIL` | Email address the bot sends from | Yes |
| `WHITELISTED_EMAILS` | Comma-separated list of allowed sender emails | Yes |
| `ALLOW_PLUS_SIGN` | Enables support for plus sign suffixes on email addresses. | No |
| `SUBJECT_PREFIX` | Invite emails subject will contain this prefix | No |
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
- Attendee information

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
- Attendees

## Development

### Local Development and Testing

```bash
# Install dependencies
npm install

# Lint
npm run lint

# Test
npm run test
```

## Security Considerations

- **API Key Security**: Store OpenAI API key in AWS Secrets Manager
- **Email Validation**: Always validate email addresses
- **Rate Limiting**: Implement rate limiting for OpenAI API calls
- **Error Handling**: Proper error handling to prevent information leakage
- **Logging**: Secure logging practices

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder)
- Uses OpenAI API for intelligent email parsing
- Built with AWS Lambda and SES

## Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section
- Review AWS and OpenAI documentation