import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.min(SCREEN_WIDTH, 480);

// The admin-managed Firestore banners are preferred. These finance banners
// are a safe fallback so the customer Home page never has an empty banner
// area when no admin banner has been published yet.
const DEFAULT_BANNERS = [
  {
    id: 'default-recharge',
    title: 'Recharge made simple',
    body: 'Top up mobile services quickly and securely with MySheba.',
    icon: '📱',
    colorStart: '#0F766E',
    colorEnd: '#14B8A6',
    linkTo: 'recharge',
    active: true,
  },
  {
    id: 'default-remittance',
    title: 'Send money with MySheba',
    body: 'Fast, secure remittance services for your family and friends.',
    icon: '💸',
    colorStart: '#155E75',
    colorEnd: '#0891B2',
    linkTo: 'remittance',
    active: true,
  },
  {
    id: 'default-travel',
    title: 'Travel services in one place',
    body: 'Bus, train, flight, visa and Malaysia arrival services.',
    icon: '✈️',
    colorStart: '#1D4ED8',
    colorEnd: '#2563EB',
    linkTo: 'flight',
    active: true,
  },
];

export default function BannerSlider() {
  const { banners, startService, openWebView } = useApp();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);

  const slides = useMemo(() => {
    const active = (Array.isArray(banners) ? banners : []).filter((b) => b.active !== false);
    return active.length > 0 ? active : DEFAULT_BANNERS;
  }, [banners]);

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

  const onPressPhoto = (s) => onPressLink(s.photoLinkTo && s.photoLinkTo !== 'none' ? s.photoLinkTo : s.linkTo);
  const onPressText = (s) => onPressLink(s.linkTo);

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
              <TouchableOpacity activeOpacity={0.9} style={StyleSheet.absoluteFill} onPress={() => onPressPhoto(s)}>
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
  container: { marginTop: 2, marginBottom: 10 },
  slide: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 104 },
  photoSlide: { padding: 0, overflow: 'hidden', height: 150 },
  photoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', padding: 10 },
  icon: { fontSize: 34, marginRight: 4 },
  title: { fontSize: 14, color: 'white', fontWeight: '700', marginBottom: 3 },
  body: { fontSize: 11, color: 'white', opacity: 0.92, lineHeight: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 6, paddingBottom: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: '#1A73E8', width: 20, borderRadius: 4 },
});
