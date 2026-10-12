const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { refreshIimmpactCatalogMirror, refreshIimmpactOptionsMirror } = require('./apiProviderService');

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

// Refills MySheba's saved amount lists (iimmpactOptionsMirror), so tapping a
// product draws its amounts from Firestore instead of waiting on IIMMPACT.
// Stops after ~7 minutes; anything left is done first on the next run.
exports.refreshIimmpactOptionsAutomatically = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const result = await refreshIimmpactOptionsMirror(admin.firestore(), 'MY', { budgetMs: 420000 });
    console.log('IIMMPACT amount lists mirrored', JSON.stringify(result));
  },
);
