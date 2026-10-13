'use strict';

// A fixed outgoing IP for the functions that BUY from IIMMPACT.
//
// IIMMPACT's API gateway refuses POST /v2/topup from Google Cloud's shared
// addresses (403 ForbiddenException) while the same key and request are
// accepted from elsewhere; balance and catalogue calls pass either way. The
// purchase functions therefore send their traffic through a Serverless VPC
// Access connector to a Cloud NAT with a reserved static IP, which IIMMPACT
// can allow.
//
// Off until the connector exists: set IIMMPACT_VPC_CONNECTOR in
// functions/.env (e.g. projects/<project>/locations/us-central1/connectors/
// mysheba-connector, or just mysheba-connector) and redeploy. Read at deploy
// time, so an unset value leaves every function exactly as it was - a
// connector named here that does not exist would fail the deploy instead.

function egressOptions() {
  const connector = String(process.env.IIMMPACT_VPC_CONNECTOR || '').trim();
  if (!connector) return {};
  return { vpcConnector: connector, vpcConnectorEgressSettings: 'ALL_TRAFFIC' };
}

module.exports = { egressOptions };
