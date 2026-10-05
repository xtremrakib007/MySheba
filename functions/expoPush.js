/**
 * Sending an Expo push, and finding out whether it actually went.
 *
 * Expo answers HTTP 200 and puts the real outcome in the body, one ticket per
 * message: {"data":[{"status":"ok","id":"..."},{"status":"error","details":{"error":"DeviceNotRegistered"}}]}.
 * Both copies of this function - there were two, one here in spirit and one in
 * index.js - checked only res.ok. So every push in a broadcast could fail and
 * the sender would report the number of messages it had composed as if that
 * were the number delivered. An admin saw "sent to 50", nobody's phone made a
 * sound, and nothing anywhere recorded why.
 *
 * The three errors worth knowing apart, because they have different fixes:
 *
 *   DeviceNotRegistered  that install is gone or revoked notifications. The
 *                        documented remedy is to stop sending to the token,
 *                        which is why they come back for the caller to clear.
 *   MismatchSenderId     the FCM credentials on the Expo project do not match
 *                        the ones the app was built with. Every Android push
 *                        fails until that is fixed; no amount of retrying helps.
 *   InvalidCredentials   the project has no usable FCM key at all.
 *
 * The last two are configuration, not data, so the point of reporting them is
 * that somebody can go and fix the configuration.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * @returns {Promise<{attempted:number, accepted:number, failed:number,
 *   errors:Object<string,number>, unregistered:string[]}>}
 */
async function sendExpoPush(messages) {
  const valid = (Array.isArray(messages) ? messages : []).filter((m) => m && m.to);
  const summary = { attempted: valid.length, accepted: 0, failed: 0, errors: {}, unregistered: [] };
  const fail = (code, token) => {
    summary.failed += 1;
    summary.errors[code] = (summary.errors[code] || 0) + 1;
    if (code === 'DeviceNotRegistered' && token && !summary.unregistered.includes(token)) {
      summary.unregistered.push(token);
    }
  };

  for (const batch of chunk(valid, BATCH)) {
    let response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))),
      });
    } catch (error) {
      // The whole batch never left. Counted as failures rather than ignored,
      // or a network outage reads as a successful send.
      console.error('Expo push send failed', error);
      batch.forEach((m) => fail('NetworkError', m.to));
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Expo push HTTP error', response.status, text.slice(0, 500));
      batch.forEach((m) => fail('HTTP' + response.status, m.to));
      continue;
    }

    let tickets = null;
    try {
      const body = await response.json();
      tickets = Array.isArray(body?.data) ? body.data : null;
    } catch (error) {
      console.error('Expo push response was not JSON', error);
    }
    if (!tickets) {
      // A 200 we cannot read is not evidence of delivery.
      batch.forEach((m) => fail('UnreadableResponse', m.to));
      continue;
    }

    batch.forEach((message, index) => {
      const ticket = tickets[index];
      if (ticket && ticket.status === 'ok') { summary.accepted += 1; return; }
      const code = String(ticket?.details?.error || ticket?.status || 'UnknownError');
      if (ticket?.message) console.error('Expo push rejected', code, String(ticket.message).slice(0, 200));
      fail(code, message.to);
    });
  }

  return summary;
}

/**
 * A one-line account of a send, for an admin reading a result rather than logs.
 * "Delivered to 48 of 50. 2 failed: DeviceNotRegistered 2."
 */
function describePush(summary) {
  const s = summary || {};
  const attempted = Number(s.attempted || 0);
  if (!attempted) return 'Nobody to notify: no eligible device had a push token.';
  const accepted = Number(s.accepted || 0);
  const parts = [`Delivered to ${accepted} of ${attempted}.`];
  const failed = Number(s.failed || 0);
  if (failed) {
    const reasons = Object.entries(s.errors || {}).map(([code, n]) => `${code} ${n}`).join(', ');
    parts.push(`${failed} failed${reasons ? ': ' + reasons : ''}.`);
  }
  return parts.join(' ');
}

module.exports = { sendExpoPush, describePush, EXPO_PUSH_URL, BATCH };
