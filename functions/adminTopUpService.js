const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

/**
 * Legacy callable kept only so older clients fail closed.
 *
 * The Malaysia wallet blueprint forbids administrative money creation:
 * every wallet credit must originate from an approved funding mechanism or
 * an audited transfer from an existing funded wallet.
 */
exports.adminTopUpPoints = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async () => {
  throw new HttpsError(
    'failed-precondition',
    'Direct administrative wallet credit is disabled. Use the approved wallet funding workflow.'
  );
});
