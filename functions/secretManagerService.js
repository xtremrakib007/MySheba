const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();

function projectId() {
  const id = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || require('firebase-admin').app().options.projectId;
  if (!id) throw new Error('Google Cloud project ID is unavailable.');
  return id;
}

function normalizeSecretId(value) {
  const id = String(value || '').replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!id) throw new Error('Invalid secret id.');
  return id;
}

async function ensureSecret(secretId) {
  const parent = `projects/${projectId()}`;
  const name = `${parent}/secrets/${normalizeSecretId(secretId)}`;
  try {
    await client.getSecret({ name });
    return name;
  } catch (err) {
    if (err?.code !== 5) throw err;
    try {
      const [created] = await client.createSecret({
        parent,
        secretId: normalizeSecretId(secretId),
        secret: { replication: { automatic: {} } },
      });
      return created.name;
    } catch (createErr) {
      if (createErr?.code === 6) return name;
      throw createErr;
    }
  }
}

async function setSecret(secretId, value) {
  if (typeof value !== 'string' || !value) return null;
  const name = await ensureSecret(secretId);
  await client.addSecretVersion({ parent: name, payload: { data: Buffer.from(value, 'utf8') } });
  return name;
}

async function getSecret(secretName) {
  if (!secretName) return '';
  const [version] = await client.accessSecretVersion({ name: secretName.endsWith('/versions/latest') ? secretName : `${secretName}/versions/latest` });
  return version.payload?.data?.toString('utf8') || '';
}

async function deleteSecret(secretName) {
  if (!secretName) return;
  try { await client.deleteSecret({ name: secretName.replace(/\/versions\/latest$/, '') }); } catch (err) {
    if (err?.code !== 5) throw err;
  }
}

module.exports = { setSecret, getSecret, deleteSecret };
