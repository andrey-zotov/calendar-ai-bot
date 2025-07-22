/* global describe, it */

var assert = require("assert");

var index = require("../index");

describe('index.js', function() {
  describe('#checkEmailVerification()', function() {
    it('should skip email verification check when not required', function(done) {
      var data = {
        config: {
          requireEmailVerification: false
        },
        log: function() {},
        senderEmail: 'test@example.com'
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(result.earlyTermination, undefined, 'Should not set early termination when email verification not required');
          done();
        })
        .catch(done);
    });

    it('should pass when both SPF and DKIM verification pass', function(done) {
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com'
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(result.earlyTermination, undefined, 'Should not set early termination when both SPF and DKIM pass');
          done();
        })
        .catch(done);
    });

    it('should reject when DKIM verification fails', function(done) {
      var callbackCalled = false;
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; spf=pass smtp.mailfrom=example.com; dkim=fail\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        callback: function() {
          callbackCalled = true;
        }
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(callbackCalled, true, 'Should call callback when DKIM fails');
          assert.equal(result.earlyTermination, true, 'Should set early termination when DKIM fails');
          done();
        })
        .catch(done);
    });

    it('should reject when SPF verification fails', function(done) {
      var callbackCalled = false;
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; spf=fail smtp.mailfrom=example.com; dkim=pass header.d=example.com\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        callback: function() {
          callbackCalled = true;
        }
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(callbackCalled, true, 'Should call callback when SPF fails');
          assert.equal(result.earlyTermination, true, 'Should set early termination when SPF fails');
          done();
        })
        .catch(done);
    });

    it('should reject when no Authentication-Results header found', function(done) {
      var callbackCalled = false;
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        callback: function() {
          callbackCalled = true;
        }
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(callbackCalled, true, 'Should call callback when no auth results');
          assert.equal(result.earlyTermination, true, 'Should set early termination when no auth results');
          done();
        })
        .catch(done);
    });

    it('should handle various SPF and DKIM pass formats', function(done) {
      var testCases = [
        'Authentication-Results: example.com; spf=pass smtp.mailfrom=example.com; dkim=pass',
        'Authentication-Results: example.com; dkim=pass (1024-bit key); spf=pass',
        'Authentication-Results: example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com',
        'Authentication-Results: example.com; SPF=PASS; DKIM=PASS'
      ];

      var completedTests = 0;

      testCases.forEach(function(authHeader) {
        var data = {
          config: {
            requireEmailVerification: true
          },
          emailData: 'From: test@example.com\n' + authHeader + '\nSubject: Test\n\nTest body',
          log: function() {},
          senderEmail: 'test@example.com'
        };

        index.checkEmailVerification(data)
          .then(function(result) {
            assert.equal(result.earlyTermination, undefined, 'Should not set early termination for: ' + authHeader);
            completedTests++;
            if (completedTests === testCases.length) {
              done();
            }
          })
          .catch(done);
      });
    });

    it('should reject various SPF and DKIM fail statuses', function(done) {
      var testCases = [
        'Authentication-Results: example.com; spf=pass smtp.mailfrom=example.com; dkim=fail',
        'Authentication-Results: example.com; spf=fail smtp.mailfrom=example.com; dkim=pass',
        'Authentication-Results: example.com; spf=none; dkim=pass',
        'Authentication-Results: example.com; spf=pass; dkim=none',
        'Authentication-Results: example.com; spf=fail; dkim=fail',
        'Authentication-Results: example.com; spf=softfail smtp.mailfrom=example.com; dkim=pass'
      ];

      var completedTests = 0;

      testCases.forEach(function(authHeader) {
        var callbackCalled = false;
        var data = {
          config: {
            requireEmailVerification: true
          },
          emailData: 'From: test@example.com\n' + authHeader + '\nSubject: Test\n\nTest body',
          log: function() {},
          senderEmail: 'test@example.com',
          callback: function() {
            callbackCalled = true;
          }
        };

        index.checkEmailVerification(data)
          .then(function(result) {
            assert.equal(callbackCalled, true, 'Should call callback for: ' + authHeader);
            assert.equal(result.earlyTermination, true, 'Should set early termination for: ' + authHeader);
            completedTests++;
            if (completedTests === testCases.length) {
              done();
            }
          })
          .catch(done);
      });
    });

    it('should reject when SPF information missing', function(done) {
      var callbackCalled = false;
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; dkim=pass header.d=example.com\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        callback: function() {
          callbackCalled = true;
        }
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(callbackCalled, true, 'Should call callback when no SPF info');
          assert.equal(result.earlyTermination, true, 'Should set early termination when no SPF info');
          done();
        })
        .catch(done);
    });

    it('should reject when DKIM information missing', function(done) {
      var callbackCalled = false;
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; spf=pass smtp.mailfrom=example.com\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        callback: function() {
          callbackCalled = true;
        }
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(callbackCalled, true, 'Should call callback when no DKIM info');
          assert.equal(result.earlyTermination, true, 'Should set early termination when no DKIM info');
          done();
        })
        .catch(done);
    });

    it('should skip processing if early termination already set', function(done) {
      var data = {
        config: {
          requireEmailVerification: true
        },
        emailData: 'From: test@example.com\nAuthentication-Results: example.com; spf=pass; dkim=pass\nSubject: Test\n\nTest body',
        log: function() {},
        senderEmail: 'test@example.com',
        earlyTermination: true
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(result.earlyTermination, true, 'Should maintain early termination flag');
          done();
        })
        .catch(done);
    });

    it('should handle missing email data gracefully', function(done) {
      var data = {
        config: {
          requireEmailVerification: true
        },
        log: function() {},
        senderEmail: 'test@example.com'
        // emailData is missing
      };

      index.checkEmailVerification(data)
        .then(function(result) {
          assert.equal(result.earlyTermination, undefined, 'Should not terminate when email data missing');
          done();
        })
        .catch(done);
    });
  });
});
