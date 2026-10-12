const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { refreshIimmpactCatalogMirror } = require('./apiProviderService');

if (!admin.apps.length) admin.initializeApp();

// Keeps MySheba's saved IIMMPACT catalogue (iimmpactCatalogMirror/MY) current,
// so customers read it from Firestore and never wait on IIMMPACT for it.
exports.refreshIimmpactCatalogAutomatically = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'UTC', timeoutSeconds: 120, memory: '512MiB' },
  async () => {
    const result = await refreshIimmpactCatalogMirror(admin.firestore(), 'MY');
    console.log('IIMMPACT catalogue mirrored', JSON.stringify(result));
  },
);
