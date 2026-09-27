import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { webViewPages, FOMEMA_CLINIC_FINDER_URL, SUBMIT_CHARGED_WEBVIEWS, WEBVIEW_SUBMIT_TRIGGERS, ACCESS_CLICK_WEBVIEWS, WEBVIEW_ACCESS_CLICK_TRIGGERS, PAYMENT_CHARGED_WEBVIEWS, PAYMENT_SUCCESS_URL_MARKERS, BUS_TICKET_WEBVIEW_KEYS } from '../data/countries';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

// Mirrors #webViewScreen - the original was a static placeholder describing
// what a real WebView would show; here it's an actual native WebView loading
// the real government status-check pages, with a fallback "open in browser".
export default function WebViewScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    webViewKey, goHome, goBackOrHome, profile, submitWebviewApplication, webViewSubmitBusy, confirmWebviewAccess, webViewBusy,
    confirmPaymentSuccess, webViewPaymentBusy, webViewPaymentCharged, pointCosts, setWebViewBackInterceptor,
  } = useApp();
  const page = webViewPages[webViewKey] || webViewPages.fomema;
  const webviewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // While waiting out a retry backoff (or mid-reload) after a failed load
  // on a bus ticket partner webview only - see handleLoadFailure below.
  // These never set `failed` at all, so they never reach the "couldn't
  // load - open in browser" screen; this is what shows instead.
  const [retrying, setRetrying] = useState(false);
  // Mirrors retryCountRef below into render state purely so the overlay can
  // show an "Open in browser instead" escape hatch once retries have gone
  // on for a while - bus partner webviews still keep retrying in the
  // background either way, this is just a way out for the user if the
  // underlying site is genuinely down rather than just slow to reconnect.
  const [retryAttempts, setRetryAttempts] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  // Whether the in-page site itself has somewhere to go back to (e.g. the
  // user followed a link within the gov't/partner site). Hardware back
  // should step through that first - see the interceptor effect below -
  // before ever leaving this screen.
  const [canGoBack, setCanGoBack] = useState(false);

  // Registers with the app-wide hardware-back handler (AppContext) so a
  // press steps the WebView's own history backward while there's somewhere
  // to go, and only falls through to leaving the screen once the user is
  // back at the site's own entry page. Cleared on unmount so it can never
  // fire after navigating away from this screen.
  useEffect(() => {
    setWebViewBackInterceptor(() => {
      if (canGoBack) {
        webviewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => setWebViewBackInterceptor(null);
  }, [canGoBack, setWebViewBackInterceptor]);

  // "Find your nearest FOMEMA clinic" (fomema2u.com.my) - an in-page
  // toggle shown only on the FOMEMA webview, swapping this same screen's
  // WebView between the government status-check page and the clinic
  // locator rather than opening a whole separate screen (avoids the
  // "back" button landing somewhere unexpected). See
  // FOMEMA_CLINIC_FINDER_URL in data/countries.js.
  const isFomema = webViewKey === 'fomema';
  const [showClinicFinder, setShowClinicFinder] = useState(false);
  const activeUrl = isFomema && showClinicFinder ? FOMEMA_CLINIC_FINDER_URL : page.url;
  const activeTitle = isFomema && showClinicFinder ? '📍 Nearest FOMEMA Clinic' : page.title;

  // MY Digital and Passport don't charge on open - the charge fires
  // automatically the moment the user taps the page's own action button
  // (see buildClickDetectScript below), not when the user opens or leaves
  // the WebView. profile.webviewSubmitted is the source of truth once
  // charged; hasFiredRef just stops us from calling
  // submitWebviewApplication over and over while waiting for that
  // Firestore write to land back in profile.
  const isSubmitFlow = SUBMIT_CHARGED_WEBVIEWS.includes(webViewKey);
  const alreadySubmitted = profile?.webviewSubmitted?.[webViewKey];

  // FOMEMA and Visa don't charge on open - the charge fires every time
  // the user taps the page's own "Carian"/"Search" button, with no free
  // re-search window: every search deducts points again. Suppressed
  // while showClinicFinder is active (see above) - the clinic locator is
  // a different site with its own unrelated "search" buttons, and
  // nothing on it should ever trigger a points charge.
  const isAccessClickFlow = ACCESS_CLICK_WEBVIEWS.includes(webViewKey) && !(isFomema && showClinicFinder);

  // Bus (redBus/Bus Online Ticket/Easybook) and MY e-SIM: a real purchase
  // happens on the third-party site itself. We watch every navigation for
  // a landing page that looks like a receipt/confirmation (see
  // PAYMENT_SUCCESS_URL_MARKERS), and charge the points fee the instant
  // one matches - see handleNavigationStateChange below.
  // webViewPaymentCharged (from AppContext, reset each time openWebView
  // enters a fresh session) is the source of truth so this can only fire
  // once per visit. Fully automatic - no manual "I've completed my
  // payment" button; PAYMENT_SUCCESS_URL_MARKERS needs to stay accurate
  // for each site so the auto-detect never misses.
  const isPaymentFlow = PAYMENT_CHARGED_WEBVIEWS.includes(webViewKey);

  // The bus ticket partner sites (redBus, Bus Online Ticket, Easybook -
  // see BUS_TICKET_WEBVIEW_KEYS) all show a "get our app" interstitial
  // (store links / deep-link popups) that would otherwise kick the user
  // out to the Play Store or an external browser instead of keeping them
  // in-app. Scoped to these bus webviews only - every other webview is
  // untouched, and this never touches ordinary window.open calls those
  // pages might use for something else (e.g. a real payment popup), only
  // navigations toward an app store or a native deep-link scheme.
  const isBusPartner = BUS_TICKET_WEBVIEW_KEYS.includes(webViewKey);

  const hasFiredRef = useRef(false);
  const paymentFiredRef = useRef(false);

  const handleWebViewMessage = (event) => {
    if (event?.nativeEvent?.data !== 'MYSHEBA_WEBVIEW_TRIGGER') return;
    if (hasFiredRef.current) return;
    if (isSubmitFlow && !alreadySubmitted) {
      hasFiredRef.current = true;
      submitWebviewApplication(webViewKey);
    } else if (isAccessClickFlow) {
      // Every matching click charges again - hasFiredRef only guards
      // against one physical tap firing this twice (e.g. event bubbling),
      // and is reset the moment this charge settles so the very next
      // Carian/Search click can charge again too.
      hasFiredRef.current = true;
      confirmWebviewAccess(webViewKey).finally(() => { hasFiredRef.current = false; });
    }
  };

  const handleNavigationStateChange = (navState) => {
    setCanGoBack(!!navState?.canGoBack);
    if (!isPaymentFlow || webViewPaymentCharged || paymentFiredRef.current) return;
    const url = (navState?.url || '').toLowerCase();
    if (PAYMENT_SUCCESS_URL_MARKERS.some((marker) => url.includes(marker))) {
      paymentFiredRef.current = true;
      confirmPaymentSuccess(webViewKey).finally(() => { paymentFiredRef.current = false; });
    }
  };

  const triggerWords = isSubmitFlow
    ? WEBVIEW_SUBMIT_TRIGGERS[webViewKey]
    : isAccessClickFlow
      ? WEBVIEW_ACCESS_CLICK_TRIGGERS[webViewKey]
      : null;

  // Cancels any navigation that would take the user out of this WebView -
  // for the bus ticket partner sites that means every non-http(s) URL
  // outright (app-store links, native deep links, intent:, tel:, mailto:,
  // custom schemes, ...), not just the known "install our app" markers,
  // since "must stay in app" has to hold for anything that could open an
  // external app, not only the ones we've already seen. Every other
  // webview's navigation is left alone.
  const handleShouldStartLoad = (request) => {
    if (!isBusPartner) return true;
    const url = (request?.url || '').toLowerCase();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
    const isInstallPrompt = INSTALL_POPUP_URL_MARKERS.some((marker) => url.includes(marker));
    return !isInstallPrompt;
  };

  // The bus ticket partner sites sometimes push a step (e.g. the payment
  // gateway) through `window.open` instead of an in-page navigation. With
  // setSupportMultipleWindows enabled (see below) RN's WebView doesn't
  // render that as a separate window - it fires this event with the
  // target URL instead, so we load it into this same WebView rather than
  // losing the step entirely. The install-popup guard's window.open
  // override (BUS_INSTALL_POPUP_BLOCK_SCRIPT) still runs first and
  // silently no-ops any install-prompt window.open before it ever reaches
  // here, so this only ever sees real in-flow popups.
  const handleOpenWindow = (event) => {
    const url = event?.nativeEvent?.targetUrl;
    if (url) webviewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
  };

  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  // The bus ticket partner sites must stay in-app no matter what - so a
  // load failure here never falls through to the "couldn't load - open in
  // browser" screen (that fallback is only reachable for every other
  // webview, see below). Instead it silently retries in place with a
  // short, capped backoff - most failures on these are a flaky first
  // connection or the site's own bot-check hiccuping, which usually
  // clears up within a few attempts. There's no retry ceiling: it keeps
  // trying for as long as the user stays on this screen.
  const handleLoadFailure = () => {
    if (!isBusPartner) {
      setLoading(false);
      setFailed(true);
      return;
    }
    retryCountRef.current += 1;
    setRetryAttempts(retryCountRef.current);
    setRetrying(true);
    const delay = Math.min(1500 + retryCountRef.current * 1000, 8000);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      webviewRef.current?.reload();
    }, delay);
  };

  // Only the main page's own request should ever count as a failure - a
  // failed ad/analytics/tracker sub-resource elsewhere on the page must
  // not. Android's WebView fires onError for those sub-resources too, not
  // just the main document, so without this check a single blocked
  // tracking pixel on a bus partner site was enough to throw the whole
  // screen into the "Reconnecting…" retry loop forever even though the
  // real page had already loaded fine underneath it. Mirrors the same
  // per-URL check onHttpError below already used for the same reason.
  const handleWebViewError = (e) => {
    const failedUrl = e?.nativeEvent?.url;
    if (!failedUrl || failedUrl === activeUrl || failedUrl === page.url) handleLoadFailure();
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{activeTitle}</Text>
      </LinearGradient>

      <View style={styles.toolbar}>
        <TouchableOpacity onPress={goHome}><Text style={styles.toolbarIcon}>🏠</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => webviewRef.current?.reload()}><Text style={styles.toolbarIcon}>🔄</Text></TouchableOpacity>
        {!!isFomema && (
          <TouchableOpacity
            style={styles.clinicToggle}
            onPress={() => { setShowClinicFinder((v) => !v); setLoading(true); setFailed(false); setCanGoBack(false); }}
          >
            <Text style={styles.clinicToggleText}>
              {showClinicFinder ? '🏥 Back to Status Check' : '📍 Find Nearest Clinic'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {!failed ? (
        <View style={{ flex: 1 }}>
          {(!!(loading || retrying)) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              {!!retrying && <Text style={styles.retryingText}>Reconnecting…</Text>}
              {!!(retrying && retryAttempts >= 5) && (
                <TouchableOpacity onPress={() => Linking.openURL(activeUrl)}>
                  <Text style={styles.retryEscapeText}>Taking longer than usual · Open in browser instead</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <WebView
            key={activeUrl}
            ref={webviewRef}
            source={{ uri: activeUrl }}
            onLoadStart={() => setLoading(true)}
            onLoad={() => { retryCountRef.current = 0; setRetryAttempts(0); setRetrying(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={handleWebViewError}
            onHttpError={(e) => {
              // A hard 4xx/5xx from the server itself (vs. a network/SSL
              // failure, which fires onError above) - e.g. a bus partner site
              // returning an error page to a request their WAF didn't like.
              // Only treat the main document's own status as fatal; a
              // failed sub-resource (an ad, an analytics pixel) shouldn't
              // block the whole page.
              if (e?.nativeEvent?.url === activeUrl || e?.nativeEvent?.url === page.url) handleLoadFailure();
            }}
            injectedJavaScriptBeforeContentLoaded={isBusPartner ? BUS_INSTALL_POPUP_BLOCK_SCRIPT : undefined}
            injectedJavaScript={triggerWords && isAccessClickFlow ? buildClickDetectScript(triggerWords) : undefined}
            onMessage={handleWebViewMessage}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            // Bus ticket partners: a standard mobile Chrome UA, not RN WebView's
            // default (which includes a "; wv" token some sites' bot/WAF
            // protection - and their own "get our app" logic - key off to
            // block or redirect embedded WebViews). Every other webview on
            // this screen keeps the platform default since they've never
            // had this problem.
            userAgent={isBusPartner ? BROWSER_USER_AGENT : undefined}
            // Needed for these booking flows to actually complete: login/
            // session cookies (thirdPartyCookiesEnabled + sharedCookies),
            // any state the site keeps client-side (domStorageEnabled),
            // and http assets on an https page not silently disappearing
            // (mixedContentMode). Harmless for every other webview too.
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            cacheEnabled
            mixedContentMode="always"
            // Let window.open-based navigations (e.g. a payment-gateway
            // step) fire onOpenWindow below instead of being silently
            // dropped - the install-popup guard already neutralises
            // window.open calls aimed at an app store/deep link before
            // this ever sees them, so only real in-flow popups arrive.
            setSupportMultipleWindows
            onOpenWindow={isBusPartner ? handleOpenWindow : undefined}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.bigIcon}>{page.icon}</Text>
          <Text style={styles.pageTitle}>Couldn't load this page</Text>
          {/* The in-app WebView can fail to load a site (e.g. an incomplete
              SSL cert chain the phone's regular browser tolerates but the
              embedded WebView doesn't) even when the site itself is fine.
              Opening it in the device's own browser is a real fallback,
              not just a retry - it can succeed even when the WebView
              never will. Bus ticket partners never reach this screen at all -
              handleLoadFailure retries them in place indefinitely instead
              (see the "Reconnecting…" overlay above), since that flow must
              stay in-app no matter what. */}
          <View style={styles.urlBox}>
            <Text style={styles.urlBoxText}>{activeUrl}</Text>
          </View>
          <TouchableOpacity style={styles.openBtn} onPress={() => Linking.openURL(activeUrl)}>
            <Text style={styles.openBtnText}>🌐 Open in Browser</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* No manual "I've completed this" button - the injected click-watch
          script (buildClickDetectScript below) posts back to the app the
          instant the page's own submit button is tapped, and
          submitWebviewApplication fires automatically from that message
          (see handleWebViewMessage above). Nothing shows here until it's
          actually confirmed. */}
      {!!(isSubmitFlow && alreadySubmitted) && (
        <View style={styles.submitBar}>
          <Text style={styles.submitDoneText}>✓ Submitted - points deducted</Text>
        </View>
      )}

      {/* Same as above - no manual "I'm searching now" button. Every real
          tap of the page's own Carian/Search button is caught by the same
          click-watch script and charges automatically; there's no
          "already done" state to show here since every search charges
          again. */}
      {!!isAccessClickFlow && (
        <View style={styles.submitBar}>
          <Text style={styles.autoChargeHintText}>
            {webViewBusy ? 'Confirming…' : 'Points deduct automatically when you tap Search/Carian on this page.'}
          </Text>
        </View>
      )}

      {/* No manual "I've completed my payment" button - points deduct
          automatically the instant handleNavigationStateChange sees the
          site's own receipt/confirmation URL (see PAYMENT_SUCCESS_URL_MARKERS
          in data/countries.js). Nothing shows here until that fires. */}
      {!!(isPaymentFlow && webViewPaymentCharged) && (
        <View style={styles.submitBar}>
          <Text style={styles.submitDoneText}>✓ Payment confirmed - {pointCosts[webViewKey]} pts deducted</Text>
        </View>
      )}
    </View>
  );
}

// Built per webview key with that key's own trigger words - e.g.
// ['proceed'] for MY Digital, ['submit'] for Passport,
// ['carian','search'] for FOMEMA/Visa (see WEBVIEW_SUBMIT_TRIGGERS /
// WEBVIEW_ACCESS_CLICK_TRIGGERS in data/countries.js). Rather than guess
// at confirmation wording, this listens for an actual tap on the matching
// button/link and posts a message back to the app the instant that
// happens - a real click is a concrete signal, not a guess about future
// page content. Attached once at document level in the capture phase, so
// it keeps working for buttons that render later too (these sites are JS
// apps where steps swap in without a full page reload, so
// injectedJavaScript only runs once per WebView session - a delegated
// listener handles that fine, since it isn't tied to any one render of
// the button). Matches on "contains", not exact equality, since real
// button labels can be multi-language (e.g. Passport's is
// "Submit / জমা দিন").
// Standard mobile Chrome-on-Android UA string (no RN-WebView "; wv" token)
// - see the userAgent prop above for why this only applies to bus ticket
// partner sites.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// URL fragments that identify a bus ticket partner site's "install our
// app" prompt rather than a real ticket/payment page - app store
// listings, native deep-link schemes, and the common app-banner link
// services (onelink/branch/etc). Only ever checked when isBusPartner is
// true, so every other webview navigates completely normally.
const INSTALL_POPUP_URL_MARKERS = [
  'play.google.com/store',
  'market://',
  'apps.apple.com',
  'itms-apps://',
  'itunes.apple.com',
  'redbus://',
  '.onelink.me',
  '.app.link',
  'bnc.lt',
];

// Runs before a bus ticket partner site's own scripts, so it's in place
// the instant the page starts executing. Only neutralises window.open calls aimed at
// an app store / deep link (matched against INSTALL_POPUP_URL_MARKERS) -
// any other window.open call (e.g. a real payment popup) is passed
// through to the normal browser behaviour untouched. Also hides/removes
// the common "smart app banner" DOM patterns sites use for the same
// prompt, with a MutationObserver since these are often injected after
// the initial load.
//
// Easybook's own "download the app" interstitial doesn't reliably match
// the class/id name patterns above (its markup changes with the site's
// own A/B tests), so hideInstallBanners also falls back to a text-based
// sweep: any element that (a) reads like an app-download prompt and (b)
// is actually presented as an overlay (fixed/sticky position, a dialog
// role, or a high z-index) gets hidden too. Kept separate from the
// class/id pass above so that pass - which is safe on plain in-page text
// - never gets more aggressive, while this one only ever touches things
// that are already styled as a floating overlay.
const INSTALL_PROMPT_TEXT_PATTERN = /\b(get|download|open|install)\b.{0,20}\bapp\b|\bcontinue in app\b/i;
const BUS_INSTALL_POPUP_BLOCK_SCRIPT = `
(function () {
  if (window.__mySheba_busInstallPopupGuard) return;
  window.__mySheba_busInstallPopupGuard = true;
  var markers = ${JSON.stringify(INSTALL_POPUP_URL_MARKERS)};
  var textPattern = ${INSTALL_PROMPT_TEXT_PATTERN.toString()};
  function looksLikeInstallPrompt(url) {
    if (!url) return false;
    var lower = String(url).toLowerCase();
    for (var i = 0; i < markers.length; i++) {
      if (lower.indexOf(markers[i]) !== -1) return true;
    }
    return false;
  }
  var nativeOpen = window.open;
  window.open = function (url) {
    if (looksLikeInstallPrompt(url)) return null;
    return nativeOpen.apply(window, arguments);
  };
  function isOverlayed(el) {
    try {
      var style = window.getComputedStyle(el);
      return style.position === 'fixed' || style.position === 'sticky'
        || el.getAttribute('role') === 'dialog'
        || (parseInt(style.zIndex, 10) || 0) >= 999;
    } catch (err) {
      return false;
    }
  }
  function hideIfOverlayInstallPrompt(el) {
    // Walk up a few ancestors from the matching text node so the whole
    // banner/card gets hidden, not just the inner line of text - but
    // stop well short of <body> so this can never blank out the page.
    var node = el;
    for (var depth = 0; node && node !== document.body && depth < 5; depth++) {
      if (isOverlayed(node)) {
        node.style.display = 'none';
        // Some of these prompts also lock page scroll while shown -
        // release that too so the underlying page stays usable.
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }
  function sweepForTextPrompts() {
    try {
      var candidates = document.querySelectorAll('div,section,aside,a,button,p,span');
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        // Only this node's own direct text (not an aggregated parent
        // container's), so a whole unrelated section of the page never
        // gets swept up by one small "app" mention buried inside it.
        var ownText = '';
        for (var c = 0; c < el.childNodes.length; c++) {
          if (el.childNodes[c].nodeType === 3) ownText += el.childNodes[c].textContent;
        }
        ownText = ownText.trim();
        if (ownText && ownText.length < 80 && textPattern.test(ownText)) {
          hideIfOverlayInstallPrompt(el);
        }
      }
    } catch (err) {}
  }
  function hideInstallBanners() {
    try {
      var selector = '[class*="app-banner" i],[id*="app-banner" i],' +
        '[class*="smart-banner" i],[id*="smart-banner" i],' +
        '[class*="app-install" i],[id*="app-install" i],' +
        '[class*="download-app" i],[id*="download-app" i],' +
        '[class*="get-app" i],[id*="get-app" i]';
      var nodes = document.querySelectorAll(selector);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.display = 'none';
      }
    } catch (err) {}
    sweepForTextPrompts();
  }
  document.addEventListener('DOMContentLoaded', hideInstallBanners);
  try {
    new MutationObserver(hideInstallBanners).observe(document.documentElement, { childList: true, subtree: true });
  } catch (err) {}
})();
true;
`;

function buildClickDetectScript(triggerWords) {
  const words = JSON.stringify((triggerWords || []).map((w) => w.toLowerCase()));
  return `
(function () {
  if (window.__mySheba_clickWatch) return;
  window.__mySheba_clickWatch = true;
  var triggers = ${words};
  function isTriggerTarget(el) {
    var node = el;
    for (var depth = 0; node && depth < 6; depth++) {
      var tag = (node.tagName || '').toUpperCase();
      var role = node.getAttribute && node.getAttribute('role');
      var isClickable = tag === 'BUTTON' || tag === 'A'
        || (tag === 'INPUT' && /submit|button/i.test(node.type || ''))
        || role === 'button';
      if (isClickable) {
        // Only this element's own label counts - stop here so a sibling
        // button's text (e.g. "Submit" next to "Reset") can never leak in
        // via a shared parent container's aggregated innerText.
        var text = (node.innerText || node.value || '').trim().toLowerCase();
        for (var i = 0; i < triggers.length; i++) {
          if (text.indexOf(triggers[i]) !== -1) return true;
        }
        return false;
      }
      node = node.parentElement;
    }
    return false;
  }
  document.addEventListener('click', function (e) {
    try {
      if (isTriggerTarget(e.target)) {
        window.ReactNativeWebView.postMessage('MYSHEBA_WEBVIEW_TRIGGER');
      }
    } catch (err) {}
  }, true);
})();
true;
`;
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flexShrink: 1 },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#eee' },
    toolbarIcon: { fontSize: 16 },
    clinicToggle: { marginLeft: 'auto', backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14 },
    clinicToggleText: { color: 'white', fontSize: 12, fontWeight: '700' },
    urlText: { flex: 1, fontSize: 10, color: '#999' },
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', zIndex: 1, gap: 10 },
    retryingText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    retryEscapeText: { fontSize: 12, color: colors.primary, fontWeight: '600', textDecorationLine: 'underline', marginTop: 4 },
    placeholder: { padding: 40, alignItems: 'center' },
    bigIcon: { fontSize: 60 },
    pageTitle: { fontSize: 16, fontWeight: '600', marginTop: 10 },
    urlBox: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 8, marginVertical: 12 },
    urlBoxText: { fontSize: 11, color: '#666', textAlign: 'center' },
    openBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, marginTop: 12 },
    openBtnText: { color: 'white', fontWeight: '600' },
    submitBar: { padding: 12, backgroundColor: '#f5f5f5', borderTopWidth: 1, borderTopColor: '#eee' },
    submitBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
    submitDoneText: { color: '#2E7D32', fontWeight: '600', fontSize: 13, textAlign: 'center' },
    autoChargeHintText: { color: '#666', fontSize: 12, textAlign: 'center' },
  });
}
