/* global describe, it */

var assert = require("assert");

var index = require("../index");

describe('index.js', function() {
  describe('#sendCalendarInvite()', function() {
    it('should send calendar invite when event is detected', function(done) {
      var sentEmails = [];
      var data = {
        eventInfo: {
          hasEvent: true,
          title: 'Team Meeting',
          description: 'Quarterly review meeting',
          dateTime: '2024-01-02T14:00:00',
          location: 'Conference Room A',
          duration: 'PT1H'
        },
        senderEmail: 'jane@example.com',
        config: {
          fromEmail: 'bot@example.com',
          subjectPrefix: 'Calendar Invite: '
        },
        log: function() {},
        ses: {
          send: function(options, callback) {
            sentEmails.push(options);
            callback(null, {MessageId: 'test-message-id'});
          }
        }
      };

      index.sendCalendarInvite(data)
        .then(function() {
          assert.equal(sentEmails.length, 1, 'Should send one email');

          var sentEmail = sentEmails[0];
          assert.equal(sentEmail.input.Destination.ToAddresses[0], 'jane@example.com', 'Should send to original sender');
          assert.equal(sentEmail.input.FromEmailAddress, 'bot@example.com', 'Should send from bot email');
          assert.ok(sentEmail.input.Content.Simple.Subject.Data.includes('Calendar Invite: Team Meeting'), 'Should include subject prefix and title');
          assert.ok(sentEmail.input.Content.Simple.Body.Html.Data.includes('Team Meeting'), 'Should include event title in HTML body');
          assert.ok(sentEmail.input.Content.Simple.Body.Text.Data.includes('BEGIN:VCALENDAR'), 'Should include ICS content in text body');

          done();
        })
        .catch(done);
    });

    it('should not send invite when no event is detected', function(done) {
      var data = {
        eventInfo: {
          hasEvent: false
        },
        senderEmail: 'jane@example.com',
        config: {
          fromEmail: 'bot@example.com'
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early
        }
      };

      // This should call the callback and not return a promise
      index.sendCalendarInvite(data);
    });

    it('should handle SES sending errors gracefully', function(done) {
      var data = {
        eventInfo: {
          hasEvent: true,
          title: 'Test Event',
          dateTime: '2024-01-02T10:00:00'
        },
        senderEmail: 'test@example.com',
        config: {
          fromEmail: 'bot@example.com',
          subjectPrefix: ''
        },
        log: function() {},
        ses: {
          send: function(options, callback) {
            callback(new Error('SES sending failed'));
          }
        }
      };

      index.sendCalendarInvite(data)
        .catch(function(err) {
          assert.ok(err, 'Should throw error when SES fails');
          assert.ok(err.message.includes('Calendar invite sending failed'), 'Should have descriptive error message');
          done();
        });
    });

    it('should generate valid ICS content', function(done) {
      var sentEmails = [];
      var data = {
        eventInfo: {
          hasEvent: true,
          title: 'Test Event with Special Characters & Symbols',
          description: 'Event description with details',
          dateTime: '2024-01-02T15:30:00',
          location: 'Room 123, Building A',
          duration: 'PT2H'
        },
        senderEmail: 'organizer@example.com',
        config: {
          fromEmail: 'bot@example.com',
          subjectPrefix: ''
        },
        log: function() {},
        ses: {
          send: function(options, callback) {
            sentEmails.push(options);
            callback(null, {MessageId: 'test-id'});
          }
        }
      };

      index.sendCalendarInvite(data)
        .then(function() {
          var textBody = sentEmails[0].input.Content.Simple.Body.Text.Data;

          // Check ICS format
          assert.ok(textBody.includes('BEGIN:VCALENDAR'), 'Should start with VCALENDAR');
          assert.ok(textBody.includes('END:VCALENDAR'), 'Should end with VCALENDAR');
          assert.ok(textBody.includes('BEGIN:VEVENT'), 'Should contain VEVENT');
          assert.ok(textBody.includes('END:VEVENT'), 'Should end VEVENT');
          assert.ok(textBody.includes('SUMMARY:Test Event with Special Characters & Symbols'), 'Should include event title');
          assert.ok(textBody.includes('LOCATION:Room 123, Building A'), 'Should include location');
          assert.ok(textBody.includes('ATTENDEE:mailto:organizer@example.com'), 'Should include attendee');
          assert.ok(textBody.includes('ORGANIZER:mailto:organizer@example.com'), 'Should include organizer');

          done();
        })
        .catch(done);
    });

    it('should handle missing event details gracefully', function(done) {
      var sentEmails = [];
      var data = {
        eventInfo: {
          hasEvent: true,
          title: 'Minimal Event',
          dateTime: '2024-01-02T10:00:00'
          // Missing description and location
        },
        senderEmail: 'test@example.com',
        config: {
          fromEmail: 'bot@example.com',
          subjectPrefix: 'Invite: '
        },
        log: function() {},
        ses: {
          send: function(options, callback) {
            sentEmails.push(options);
            callback(null, {MessageId: 'test-id'});
          }
        }
      };

      index.sendCalendarInvite(data)
        .then(function() {
          var htmlBody = sentEmails[0].input.Content.Simple.Body.Html.Data;
          var textBody = sentEmails[0].input.Content.Simple.Body.Text.Data;

          // Check that missing fields are handled
          assert.ok(htmlBody.includes('Not specified'), 'Should show "Not specified" for missing location');
          assert.ok(htmlBody.includes('No description'), 'Should show "No description" for missing description');
          assert.ok(textBody.includes('LOCATION:'), 'Should include empty location field in ICS');
          assert.ok(textBody.includes('DESCRIPTION:'), 'Should include empty description field in ICS');

          done();
        })
        .catch(done);
    });
  });
});
