import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Share as RNShare, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import RNShareModule, { Social } from 'react-native-share';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useApp } from '../context/AppContext';
import { showAlert } from '../utils/appAlert';
import { getListingShareUrl, getListingShareCaption, getListingShareImage } from '../utils/listingShare';

// Share menu opened from ListingDetailScreen's Share button. Every target
// below degrades gracefully instead of throwing when the target app isn't
// installed or a step fails - the worst case is an alert telling the
// person what to do manually, never a crash.
//
// Two targets are "best effort" by nature of what each platform actually
// allows a third-party app to do, and both are commented at their onPress:
//  - Instagram feed post: Meta doesn't let any outside app prefill a Feed
//    post's caption. We copy the caption and open Instagram instead.
//  - WhatsApp Status: WhatsApp has no public API for a third-party app to
//    post to Status directly (unlike FB/IG Stories, which Meta explicitly
//    supports for any app with a registered App ID). We route this to the
//    OS's own share sheet, where WhatsApp itself sometimes registers as a
//    "Status" target for image shares - not guaranteed, but the most that
//    can be done without a private API.
export default function ShareListingSheet({ visible, onClose, listing }) {
  const { colors } = useTheme();
  const { socialLinks } = useApp();
  const styles = createStyles(colors);
  const [copied, setCopied] = useState(false);

  if (!listing) return null;

  const url = getListingShareUrl(listing.id);
  const caption = getListingShareCaption(listing);
  const image = getListingShareImage(listing);
  const facebookAppId = (socialLinks && socialLinks.facebookAppId) || '';

  const closeAnd = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      // user cancelled a native share sheet, or the target app rejected
      // the call - neither is worth surfacing as an error
    }
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openWebFallback = (appUrl, webUrl) => {
    Linking.openURL(appUrl).catch(() => Linking.openURL(webUrl));
  };

  const shareWhatsappChat = () => {
    RNShareModule.shareSingle({ social: Social.Whatsapp, message: `${caption}\n${url}` }).catch(() => {
      openWebFallback(`whatsapp://send?text=${encodeURIComponent(`${caption}\n${url}`)}`, `https://wa.me/?text=${encodeURIComponent(`${caption}\n${url}`)}`);
    });
  };

  const shareWhatsappStatus = () => {
    // See file header - no reliable direct API, so this opens the regular
    // OS share sheet (image, when there is one) and lets the person pick
    // WhatsApp's own Status target if their OS/WhatsApp version offers it.
    RNShare.share(image ? { url: image, message: `${caption}\n${url}` } : { message: `${caption}\n${url}` }).catch(() => {});
  };

  const shareFacebook = () => {
    // Facebook's share dialog only ever takes a URL, never a custom
    // caption - that's a Meta platform restriction, not a limitation of
    // this code. The link preview card (title/image/description) comes
    // from the Open Graph tags on the mysheba.top page itself.
    RNShareModule.shareSingle({ social: Social.Facebook, url }).catch(() => {
      Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    });
  };

  const shareFacebookStory = () => {
    if (!facebookAppId) {
      showAlert('Story sharing not set up', "An admin needs to add a Facebook App ID under Admin > Social before Facebook Story sharing works. It's free to create in Meta's developer console.");
      return;
    }
    if (!image) {
      showAlert('MySheba', 'Add at least one photo to this listing to share it as a Story.');
      return;
    }
    RNShareModule.shareSingle({
      social: Social.FacebookStories,
      appId: facebookAppId,
      backgroundImage: image,
      attributionURL: url,
    }).catch(() => showAlert('MySheba', "Couldn't open Facebook - is the app installed?"));
  };

  const shareInstagramStory = () => {
    if (!facebookAppId) {
      showAlert('Story sharing not set up', "An admin needs to add a Facebook App ID under Admin > Social before Instagram Story sharing works. It's free to create in Meta's developer console - Instagram Stories uses the same App ID as Facebook.");
      return;
    }
    if (!image) {
      showAlert('MySheba', 'Add at least one photo to this listing to share it as a Story.');
      return;
    }
    RNShareModule.shareSingle({
      social: Social.InstagramStories,
      appId: facebookAppId,
      backgroundImage: image,
      attributionURL: url,
    }).catch(() => showAlert('MySheba', "Couldn't open Instagram - is the app installed?"));
  };

  const shareInstagramFeed = async () => {
    // See file header - Instagram Feed can't be prefilled by another app.
    // Copy the caption, then hand off to Instagram so the person can paste
    // it into a new post themselves.
    await Clipboard.setStringAsync(`${caption}\n${url}`);
    showAlert('Caption copied', 'Paste it into your new Instagram post. Opening Instagram now…');
    openWebFallback('instagram://app', 'https://www.instagram.com/');
  };

  const shareX = () => {
    RNShareModule.shareSingle({ social: Social.Twitter, message: caption, url }).catch(() => {
      Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`);
    });
  };

  const shareLinkedIn = () => {
    RNShareModule.shareSingle({ social: Social.Linkedin, url }).catch(() => {
      Linking.openURL(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
    });
  };

  const shareMore = () => {
    RNShare.share({ message: `${caption}\n${url}` }).catch(() => {});
  };

  const OPTIONS = [
    { key: 'copy', icon: copied ? '✅' : '🔗', label: copied ? 'Copied!' : 'Copy Link', onPress: copyLink },
    { key: 'whatsapp', icon: '💬', label: 'WhatsApp Chat', onPress: closeAnd(shareWhatsappChat) },
    { key: 'whatsappStatus', icon: '⭕', label: 'WhatsApp Status', onPress: closeAnd(shareWhatsappStatus) },
    { key: 'facebook', icon: '📘', label: 'Facebook', onPress: closeAnd(shareFacebook) },
    { key: 'facebookStory', icon: '📘', label: 'Facebook Story', onPress: closeAnd(shareFacebookStory) },
    { key: 'instagram', icon: '📷', label: 'Instagram Post', onPress: closeAnd(shareInstagramFeed) },
    { key: 'instagramStory', icon: '📷', label: 'Instagram Story', onPress: closeAnd(shareInstagramStory) },
    { key: 'x', icon: '✖️', label: 'X', onPress: closeAnd(shareX) },
    { key: 'linkedin', icon: '💼', label: 'LinkedIn', onPress: closeAnd(shareLinkedIn) },
    { key: 'more', icon: '⋯', label: 'More Apps', onPress: closeAnd(shareMore) },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share this listing</Text>

          <View style={styles.grid}>
            {OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.key} style={styles.item} onPress={opt.onPress} activeOpacity={0.7}>
                <View style={styles.iconCircle}>
                  <Text style={styles.icon}>{opt.icon}</Text>
                </View>
                <Text style={styles.label} numberOfLines={2}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: 'white', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: 10, paddingBottom: 28, paddingHorizontal: 16 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 16, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    item: { width: '25%', alignItems: 'center', marginBottom: 18, paddingHorizontal: 4 },
    iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    icon: { fontSize: 24 },
    label: { fontSize: 11, color: colors.text, textAlign: 'center' },
    closeBtn: { marginTop: 6, paddingVertical: 12, borderRadius: radius.md, backgroundColor: '#F2F2F2', alignItems: 'center' },
    closeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  });
}
