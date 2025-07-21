/* global describe, it */

var assert = require("assert");

const {GetObjectCommand} = require('@aws-sdk/client-s3');

var index = require("../index");

describe('index.js', function() {
  describe('#fetchMessage()', function() {
    it('should invoke the AWS S3 SDK to fetch the message for calendar bot',
      function(done) {
        var data = {
          config: {
            emailBucket: "bucket",
            emailKeyPrefix: "prefix/"
          },
          context: {
            fail: function() {
              assert.ok(false, 'context.fail() was called');
              done();
            }
          },
          email: {
            messageId: "abc"
          },
          log: console.log,
          s3: {
            send: function(options, callback) {
              if (options instanceof GetObjectCommand)
                callback(null, {
                  Body: {
                    transformToString: function() {
                      return "email data";
                    }
                  }
                });
            }
          }
        };
        index.fetchMessage(data)
          .then(function(data) {
            assert.equal(data.emailData,
              "email data",
              "fetchMessage returned email data for calendar bot");
            done();
          });
      });

    it('should result in failure if the AWS S3 SDK cannot get the message',
      function(done) {
        var data = {
          config: {
            emailBucket: "bucket",
            emailKeyPrefix: "prefix/"
          },
          context: {},
          email: {
            messageId: "abc"
          },
          log: console.log,
          s3: {
            send: function(options, callback) {
              if (options instanceof GetObjectCommand)
                callback(new Error('S3 GetObject failed'));
            }
          }
        };
        index.fetchMessage(data)
          .catch(function(err) {
            assert.ok(err, "fetchMessage should abort operation on S3 error");
            assert.ok(err.message.includes('Failed to load message body from S3'), "Should have descriptive error message");
            done();
          });
      });

    it('should handle email message correctly from S3',
      function(done) {
        var testEmailContent = "From: test@example.com\nSubject: Test\n\nTest email content";
        var data = {
          config: {
            emailBucket: "test-bucket",
            emailKeyPrefix: "emails/"
          },
          context: {},
          email: {
            messageId: "test-message-id"
          },
          log: function() {},
          s3: {
            send: function(options, callback) {
              if (options instanceof GetObjectCommand) {
                assert.equal(options.input.Bucket, "test-bucket", "Should use correct bucket");
                assert.equal(options.input.Key, "emails/test-message-id", "Should use correct key");
                callback(null, {
                  Body: {
                    transformToString: function() {
                      return testEmailContent;
                    }
                  }
                });
              }
            }
          }
        };
        index.fetchMessage(data)
          .then(function(result) {
            assert.equal(result.emailData, testEmailContent, "Should return correct email content");
            done();
          })
          .catch(done);
      });
  });
});
