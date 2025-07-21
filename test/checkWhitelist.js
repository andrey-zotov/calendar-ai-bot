/* global describe, it */

var assert = require("assert");

var index = require("../index");

describe('index.js', function() {
  describe('#checkWhitelist()', function() {
    it('should allow emails from whitelisted addresses', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['Jane Doe <janedoe@example.com>']
          }
        },
        config: {
          whitelistedEmails: ['janedoe@example.com', 'john@example.com']
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'janedoe@example.com',
            'Sender email should be extracted correctly');
          assert.deepEqual(result.originalRecipients, ['info@example.com'],
            'Original recipients should be preserved');
          done();
        })
        .catch(done);
    });

    it('should extract email from angle bracket format', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['John Smith <john.smith@example.com>']
          }
        },
        config: {
          whitelistedEmails: ['john.smith@example.com']
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'john.smith@example.com',
            'Email should be extracted from angle brackets');
          done();
        })
        .catch(done);
    });

    it('should handle plain email addresses without angle brackets', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['simple@example.com']
          }
        },
        config: {
          whitelistedEmails: ['simple@example.com']
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'simple@example.com',
            'Plain email address should be handled correctly');
          done();
        })
        .catch(done);
    });

    it('should reject emails from non-whitelisted addresses', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['unauthorized@example.com']
          }
        },
        config: {
          whitelistedEmails: ['janedoe@example.com', 'john@example.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });

    it('should process all emails when whitelist is empty', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['anyone@example.com']
          }
        },
        config: {
          whitelistedEmails: [] // Empty whitelist
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'anyone@example.com',
            'Should process email even with empty whitelist');
          done();
        })
        .catch(done);
    });

    it('should handle case insensitive email addresses', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['JANEDOE@EXAMPLE.COM']
          }
        },
        config: {
          whitelistedEmails: ['janedoe@example.com'] // lowercase
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'janedoe@example.com',
            'Should convert to lowercase and match');
          done();
        })
        .catch(done);
    });

    it('should ignore calendar invitation acceptance emails', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['john@example.com'],
            subject: 'Accepted: Team Meeting Tomorrow'
          }
        },
        config: {
          whitelistedEmails: ['john@example.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early for invitation responses
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });

    it('should ignore calendar invitation decline emails', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['jane@example.com'],
            subject: 'Declined: Weekly standup meeting'
          }
        },
        config: {
          whitelistedEmails: ['jane@example.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early for invitation responses
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });

    it('should ignore emails from calendar systems', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['calendar-server@example.com'],
            subject: 'Meeting Response'
          }
        },
        config: {
          whitelistedEmails: ['calendar-server@example.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early for calendar system emails
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });

    it('should ignore Google Calendar notification emails', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['calendar.google.com'],
            subject: 'John has accepted your invitation'
          }
        },
        config: {
          whitelistedEmails: ['calendar.google.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early for Google Calendar emails
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });

    it('should process legitimate event emails with normal subjects', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['john@example.com'],
            subject: 'Team Meeting Tomorrow at 2PM'
          }
        },
        config: {
          whitelistedEmails: ['john@example.com']
        },
        log: function() {},
        recipients: ['info@example.com']
      };
      index.checkWhitelist(data)
        .then(function(result) {
          assert.equal(result.senderEmail, 'john@example.com',
            'Should process legitimate event emails normally');
          done();
        })
        .catch(done);
    });

    it('should ignore tentative response emails', function(done) {
      var data = {
        email: {
          commonHeaders: {
            from: ['sarah@example.com'],
            subject: 'Tentative: Project kickoff meeting'
          }
        },
        config: {
          whitelistedEmails: ['sarah@example.com']
        },
        log: function() {},
        callback: function() {
          done(); // Should call callback to exit early for tentative responses
        },
        recipients: ['info@example.com']
      };
      // This should call the callback and not return a promise
      index.checkWhitelist(data);
    });
  });
});
