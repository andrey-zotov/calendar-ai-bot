/* global describe, it */

var fs = require("fs");

const {GetObjectCommand} = require('@aws-sdk/client-s3');

var index = require("../index");

// Mock environment variables for testing
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.FROM_EMAIL = 'bot@example.com';
process.env.WHITELISTED_EMAILS = 'janedoe@example.com';

describe('index.js', function() {
  describe('#handler()', function() {
    it('should process calendar bot request successfully', function(done) {
      var event = JSON.parse(fs.readFileSync("test/assets/event.json"));
      var context = {};
      var callback = function() {
        done();
      };
      var overrides = {
        s3: {
          send: function(options, callback) {
            if (options instanceof GetObjectCommand) {
              callback(null, {
                Body: {
                  transformToString: function() {
                    return fs.readFileSync("test/assets/message.txt", 'utf8');
                  }
                }
              });
            }
          }
        },
        ses: {
          send: function(options, callback) {
            callback(null, {MessageId: "test-message-id"});
          }
        },
        config: {
          openaiApiKey: 'test-api-key',
          fromEmail: 'bot@example.com',
          emailBucket: "bucket",
          emailKeyPrefix: "prefix/",
          whitelistedEmails: ['janedoe@example.com']
        },
        steps: [
          index.parseEvent,
          index.checkWhitelist,
          index.fetchMessage,
          function(data) {
            // Mock parseEventDetails to avoid OpenAI API call in tests
            data.eventInfo = { hasEvent: true, title: 'Test Event', dateTime: '2024-01-01T10:00:00' };
            return Promise.resolve(data);
          },
          index.sendCalendarInvite
        ]
      };
      index.handler(event, context, callback, overrides);
    });

    it('should reject emails from non-whitelisted senders', function(done) {
      var event = JSON.parse(fs.readFileSync("test/assets/event.json"));
      // Modify event to have non-whitelisted sender
      event.Records[0].ses.mail.commonHeaders.from = ['unauthorized@example.com'];
      var context = {};
      var callbackCalled = false;
      var callback = function() {
        if (!callbackCalled) {
          callbackCalled = true;
          done(); // Should exit early due to whitelist check
        }
      };
      var overrides = {
        config: {
          openaiApiKey: 'test-api-key',
          whitelistedEmails: ['janedoe@example.com'] // Different from sender
        }
      };
      index.handler(event, context, callback, overrides);
    });

    it('should handle no event information gracefully', function(done) {
      var event = JSON.parse(fs.readFileSync("test/assets/event.json"));
      var context = {};
      var callbackCalled = false;
      var callback = function() {
        if (!callbackCalled) {
          callbackCalled = true;
          done(); // Should exit early when no event found
        }
      };
      var overrides = {
        s3: {
          send: function(options, callback) {
            callback(null, {
              Body: {
                transformToString: function() {
                  return "Just a regular email with no event information.";
                }
              }
            });
          }
        },
        config: {
          openaiApiKey: 'test-api-key',
          whitelistedEmails: ['janedoe@example.com']
        },
        steps: [
          index.parseEvent,
          index.checkWhitelist,
          index.fetchMessage,
          function(data) {
            // Mock parseEventDetails to return no event
            data.eventInfo = { hasEvent: false };
            return Promise.resolve(data);
          },
          index.sendCalendarInvite
        ]
      };
      index.handler(event, context, callback, overrides);
    });

    it('should accept functions as steps', function(done) {
      var event = {};
      var context = {};
      var callback = function() {};
      var overrides = {
        config: {
          openaiApiKey: 'test-api-key'
        },
        steps: [
          function(data) {
            if (data && data.context) {
              done();
            }
          }
        ]
      };
      index.handler(event, context, callback, overrides);
    });
  });
});
