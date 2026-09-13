import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_WIDTH = Math.min(SCREEN_WIDTH - 28, 480);

export default function BannerSlider() {
  const { banners, startService, openWebView } = useApp();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);
  const slides = useMemo(() => banners.filter((b) => b.active !== false), [banners]);

  useEffect(() => { if (index >= slides.length) setIndex(0); }, [slides.length, index]);
  useEffect(() => {
    if (slides.length < 2) return undefined;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(id);
  }, [slides.length]);

  const goTo = (i) => { setIndex(i); scrollRef.current?.scrollTo({ x: i * SLIDE_WIDTH, animated: true }); };
  const onScrollEnd = (e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH));
  const onPressLink = (linkTo) => {
    if (!linkTo || linkTo === 'none') return;
    if (linkTo === 'fomema' || linkTo === 'visa') openWebView(linkTo);
    else startService(linkTo);
  };
  const onPressPhoto = (s) => onPressLink(s.photoLinkTo && s.photoLinkTo !== 'none' ? s.photoLinkTo : s.linkTo);
  const onPressText = (s) => onPressLink(s.linkTo);

  if (!slides.length) return null;

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd} onTouchStart={() => { pausedRef.current = true; }} onTouchEnd={() => { pausedRef.current = false; }}>
        {slides.map((s) => s.imageUrl ? (
          <View key={s.id} style={[styles.slide, { width: SLIDE_WIDTH }]}>
            <TouchableOpacity activeOpacity={0.9} style={StyleSheet.absoluteFill} onPress={() => onPressPhoto(s)}>
              <Image source={{ uri: s.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
              <View style={styles.imageShade} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.photoOverlay} onPress={() => onPressText(s)}>
              <View style={styles.pill}><Text style={styles.pillText}>MY SHEBA</Text></View>
              <Text style={styles.title}>{s.title}</Text>
              {!!s.body && <Text style={styles.body}>{s.body}</Text>}
              {!!s.linkTo && s.linkTo !== 'none' && <Text style={styles.cta}>Explore now  ›</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity key={s.id} activeOpacity={0.9} style={[styles.slide, styles.gradientFallback, { width: SLIDE_WIDTH, backgroundColor: s.colorStart || '#1769AA' }]} onPress={() => onPressText(s)}>
            <View style={styles.fallbackIcon}><Text style={styles.icon}>{s.icon || '📣'}</Text></View>
            <View style={styles.fallbackCopy}>
              <View style={styles.pill}><Text style={styles.pillText}>MY SHEBA FINANCE</Text></View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
              {!!s.linkTo && s.linkTo !== 'none' && <Text style={styles.cta}>Explore now  ›</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {slides.length > 1 && <View style={styles.dots}>{slides.map((s, i) => <TouchableOpacity key={s.id} onPress={() => goTo(i)}><View style={[styles.dot, i === index && styles.dotActive]} /></TouchableOpacity>)}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 5 },
  slide: { height: 156, borderRadius: 18, overflow: 'hidden', position: 'relative' },
  gradientFallback: { padding: 17, flexDirection: 'row', alignItems: 'center' },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.20)' },
  photoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: 'rgba(7,24,48,0.68)' },
  fallbackIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  fallbackCopy: { flex: 1 },
  icon: { fontSize: 26 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 5 },
  pillText: { color: 'white', fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: 18, color: 'white', fontWeight: '800', marginBottom: 3 },
  body: { fontSize: 10.5, color: 'white', opacity: 0.9, lineHeight: 15 },
  cta: { color: 'white', fontSize: 10, fontWeight: '800', marginTop: 7 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9D1DC' },
  dotActive: { width: 18, borderRadius: 4, backgroundColor: '#1769AA' },
});
