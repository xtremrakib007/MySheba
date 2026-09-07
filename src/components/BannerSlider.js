import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.min(SCREEN_WIDTH, 480); // full width, no side margins

// Slides used to be a hardcoded array here. They now live in Firestore
// (banners/{id}), managed from Admin > Banners - see src/firebase/bannerService.js.
export default function BannerSlider() {
  const { banners, startService, openWebView } = useApp();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);

  const slides = useMemo(() => banners.filter((b) => b.active !== false), [banners]);

  // Clamp the active dot/scroll position if the list shrinks (e.g. an admin
  // deletes the last slide while it's on screen).
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [slides.length]);

  const goTo = (i) => {
    setIndex(i);
    scrollRef.current?.scrollTo({ x: i * SLIDE_WIDTH, animated: true });
  };

  const onScrollEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    setIndex(i);
  };

  const onPressLink = (linkTo) => {
    if (!linkTo || linkTo === 'none') return;
    if (linkTo === 'fomema' || linkTo === 'visa') openWebView(linkTo);
    else startService(linkTo);
  };

  // Photo slides can send the photo and the text overlay to two different
  // places (e.g. photo -> a listing, text -> "Recharge"). photoLinkTo is
  // new - banners saved before this feature have no such field, so they
  // fall back to the original single `linkTo`, keeping their old
  // whole-card-is-one-link behavior until an admin explicitly sets a
  // different photo link in BannerFormModal.
  const onPressPhoto = (s) => onPressLink(s.photoLinkTo && s.photoLinkTo !== 'none' ? s.photoLinkTo : s.linkTo);
  const onPressText = (s) => onPressLink(s.linkTo);

  if (slides.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onTouchStart={() => { pausedRef.current = true; }}
        onTouchEnd={() => { pausedRef.current = false; }}
      >
        {slides.map((s) =>
          s.imageUrl ? (
            <View key={s.id} style={[styles.slide, styles.photoSlide, { width: SLIDE_WIDTH }]}>
              {/* expo-image instead of RN's Image/ImageBackground - caches
                  slides to disk+memory so returning to Home (every user,
                  every visit) doesn't re-download the same banner images
                  over and over, and decodes off the JS thread. No built-in
                  "background with overlay children" mode like
                  ImageBackground had, so the image is absolutely
                  positioned behind the overlay instead.
                  This is now a plain (non-touchable) View wrapping two
                  SEPARATE touch targets - see onPressPhoto/onPressText
                  above - rather than one TouchableOpacity around
                  everything, so the photo and the text overlay can link
                  to different places. The text overlay is rendered last
                  (on top, in the same stacking position), so a tap inside
                  its bounds goes to it; anywhere else on the photo falls
                  through to the photo's own touchable underneath. */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={StyleSheet.absoluteFill}
                onPress={() => onPressPhoto(s)}
              >
                <Image
                  source={{ uri: s.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.9} style={styles.photoOverlay} onPress={() => onPressText(s)}>
                <Text style={styles.title}>{s.title}</Text>
                {!!s.body && <Text style={styles.body}>{s.body}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              key={s.id}
              activeOpacity={0.9}
              style={[styles.slide, { width: SLIDE_WIDTH, backgroundColor: s.colorStart || '#1A73E8' }]}
              onPress={() => onPressText(s)}
            >
              <Text style={styles.icon}>{s.icon || '📣'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <TouchableOpacity key={s.id} onPress={() => goTo(i)}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 2 },
  slide: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 84 },
  photoSlide: { padding: 0, overflow: 'hidden', height: 150 },
  // photoOverlay used to sit at the bottom via ImageBackground's own
  // flex:1 + justifyContent:'flex-end' wrapper - now that the image is a
  // plain absolutely-positioned sibling (see the expo-image swap above),
  // the overlay needs its own absolute bottom-anchored positioning to keep
  // the same look.
  photoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', padding: 10 },
  icon: { fontSize: 32, marginRight: 12 },
  title: { fontSize: 13, color: 'white', fontWeight: '600', marginBottom: 2 },
  body: { fontSize: 11, color: 'white', opacity: 0.9 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 6, paddingBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: '#1A73E8', width: 20, borderRadius: 4 },
});
