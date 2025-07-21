/* global describe, it */

var assert = require("assert");

var index = require("../index");

describe('index.js', function() {
  describe('#parseEventDetails()', function() {
    it('should parse event details from email content using OpenAI mock', function(done) {
      var data = {
        emailData: 'Subject: Team Meeting Tomorrow\n\nLet\'s have a meeting tomorrow at 2 PM in the conference room.\nWe\'ll discuss the Q4 strategy.',
        config: {
          openaiApiKey: 'test-api-key',
          openaiModel: 'gpt-3.5-turbo',
          maxTokens: 500
        },
        log: function() {},
        // Mock HTTPS request for this test
        httpsRequest: function(options, callback) {
          const mockResponse = {
            statusCode: 200,
            on: function(event, handler) {
              if (event === 'data') {
                handler(JSON.stringify({
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        hasEvent: true,
                        title: 'Team Meeting Tomorrow',
                        description: 'Q4 strategy discussion',
                        dateTime: '2024-01-02T14:00:00',
                        location: 'conference room',
                        duration: 'PT1H'
                      })
                    }
                  }]
                }));
              } else if (event === 'end') {
                handler();
              }
            }
          };
          
          const mockRequest = {
            on: function(event, handler) {},
            write: function() {},
            end: function() {
              setTimeout(() => callback(mockResponse), 0);
            }
          };
          
          return mockRequest;
        }
      };

      index.parseEventDetails(data)
        .then(function(result) {
          assert.ok(result.eventInfo, 'Event info should be set');
          assert.equal(result.eventInfo.hasEvent, true, 'Should detect event');
          assert.equal(result.eventInfo.title, 'Team Meeting Tomorrow', 'Should extract title');
          assert.equal(result.eventInfo.location, 'conference room', 'Should extract location');
          done();
        })
        .catch(done);
    });

    it('should handle non-event emails gracefully', function(done) {
      var data = {
        emailData: 'Subject: Just saying hello\n\nHi there! How are you doing? Hope you have a great day.',
        config: {
          openaiApiKey: 'test-api-key',
          openaiModel: 'gpt-3.5-turbo',
          maxTokens: 500
        },
        log: function() {},
        // Mock HTTPS request for non-event response
        httpsRequest: function(options, callback) {
          const mockResponse = {
            statusCode: 200,
            on: function(event, handler) {
              if (event === 'data') {
                handler(JSON.stringify({
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        hasEvent: false
                      })
                    }
                  }]
                }));
              } else if (event === 'end') {
                handler();
              }
            }
          };
          
          const mockRequest = {
            on: function(event, handler) {},
            write: function() {},
            end: function() {
              setTimeout(() => callback(mockResponse), 0);
            }
          };
          
          return mockRequest;
        }
      };

      index.parseEventDetails(data)
        .then(function(result) {
          assert.ok(result.eventInfo, 'Event info should be set');
          assert.equal(result.eventInfo.hasEvent, false, 'Should not detect event');
          done();
        })
        .catch(done);
    });

    it('should handle OpenAI API errors', function(done) {
      var data = {
        emailData: 'Subject: Test\n\nTest content',
        config: {
          openaiApiKey: 'invalid-key',
          openaiModel: 'gpt-3.5-turbo',
          maxTokens: 500
        },
        log: function() {},
        // Mock HTTPS request to simulate API error
        httpsRequest: function(options, callback) {
          const mockResponse = {
            statusCode: 401,
            on: function(event, handler) {
              if (event === 'data') {
                handler('Invalid API key');
              } else if (event === 'end') {
                handler();
              }
            }
          };
          
          const mockRequest = {
            on: function(event, handler) {},
            write: function() {},
            end: function() {
              setTimeout(() => callback(mockResponse), 0);
            }
          };
          
          return mockRequest;
        }
      };

      index.parseEventDetails(data)
        .catch(function(err) {
          assert.ok(err, 'Should throw error for invalid API key');
          assert.ok(err.message.includes('Failed to parse event details'), 'Should have descriptive error message');
          done();
        });
    });

    it('should extract subject from email headers', function(done) {
      var data = {
        emailData: 'From: test@example.com\nSubject: Important Meeting\nTo: info@example.com\n\nMeeting at 3pm tomorrow.',
        config: {
          openaiApiKey: 'test-api-key',
          openaiModel: 'gpt-3.5-turbo',
          maxTokens: 500
        },
        log: function() {},
        // Mock HTTPS request to verify subject extraction
        httpsRequest: function(options, callback) {
          // Verify that subject was included in the request body
          const requestBody = '';
          const mockResponse = {
            statusCode: 200,
            on: function(event, handler) {
              if (event === 'data') {
                handler(JSON.stringify({
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        hasEvent: true,
                        title: 'Important Meeting',
                        dateTime: '2024-01-02T15:00:00'
                      })
                    }
                  }]
                }));
              } else if (event === 'end') {
                handler();
              }
            }
          };
          
          const mockRequest = {
            on: function(event, handler) {},
            write: function(body) {
              // Verify that subject was included in the request body
              const parsedBody = JSON.parse(body);
              assert.ok(parsedBody.messages[0].content.includes('Subject: Important Meeting'),
                'Subject should be included in OpenAI prompt');
            },
            end: function() {
              setTimeout(() => callback(mockResponse), 0);
            }
          };
          
          return mockRequest;
        }
      };

      index.parseEventDetails(data)
        .then(function(result) {
          assert.ok(result.eventInfo.hasEvent, 'Should detect event');
          done();
        })
        .catch(done);
    });
  });
});
