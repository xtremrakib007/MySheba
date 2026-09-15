// Legacy KYC provider compatibility shim.
// MySheba now performs selfie capture in the native app. These exports remain
// temporarily so older deployed function names do not crash on import, but no
// third-party KYC network request is made.
const disabled = async () => {
  const error = new Error('Legacy hosted KYC is disabled. Use the native MySheba KYC camera flow.');
  error.code = 'failed-precondition';
  throw error;
};

exports.createDiditKycSession = disabled;
exports.diditKycWebhook = async (_request, response) => {
  response.status(410).json({ error: 'Legacy hosted KYC webhook is disabled.' });
};
