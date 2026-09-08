console.log('MYSHEBA_ANIMATION_FIX_V2_LOADED');
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { lightColors } from '../theme/theme';

// Branded loading screen shown while the app is figuring out auth state.
// Mirrors the native splash (same white background in light mode, dark
// background in dark mode), then animates the logo mark in with an
// orbiting-particle ring, a staged progress bar ("Connecting to
// Firebase...", "Loading wallet...", etc.), and finally a fade-out once
// the real app is ready - so there's no dead gap between the static
// splash image and the first real screen appearing.
//
// `ready` flips true once the parent's real init (auth/session check,
// config load) has actually finished. Until then the progress bar eases
// up to 92% and holds - it never claims to be done before the app is.
// Once `ready` is true, progress finishes to 100%, a brief "Ready" check
// shows, then the whole view fades out and `onFinished` is called so the
// parent can swap in the real screen.
//
// `loaded` (from ThemeContext) flips true once the saved theme mode/accent
// has been read back from AsyncStorage. Until then, only the container
// BACKGROUND falls back to the fixed light-mode value that matches
// app.json's splash.backgroundColor (hardcoded white - Expo's native
// splash can't read app-level dark/light state), since that's the one
// thing painted before any entrance animation runs and so the one thing
// that must be right immediately. Every other color here (logo tint, text,
// progress bar) keeps using the live theme colors as before: those elements
// all start at opacity 0 and only fade in after their animation stage
// completes, by which point the (typically sub-50ms) AsyncStorage read has
// long since resolved - so there's nothing for them to visibly snap from.

const STAGES = [
  { label: 'Loading MySheba...', to: 0.3, duration: 500 },
  { label: 'Checking session...', to: 0.55, duration: 450 },
  { label: 'Preparing your dashboard...', to: 0.75, duration: 400 },
  { label: 'Loading wallet...', to: 0.92, duration: 450 },
];

// Colors the "Powered By" footer cycles through - first and last are the
// same so the loop (which restarts instantly at 0, see the effect below)
// never visibly snaps.
const FOOTER_COLORS = ['#00A99D', '#1A73E8', '#8E44AD', '#E91E8C', '#FF7A00', '#2ECC71', '#00A99D'];

// Splash always stays on screen at least this long, even if the real app
// (auth/session check) finishes loading sooner - so the brand moment
// (logo, name, slogan) always gets a full, unhurried read instead of
// flashing by on a fast connection.
const MIN_HOLD_MS = 5000;

export default function AnimatedSplash({ ready, onFinished }) {
  const { colors, loaded } = useTheme();
  const containerBg = loaded ? colors.bg : lightColors.bg;
  const styles = createStyles(colors, containerBg);

  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslate = useRef(new Animated.Value(12)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;
  // Drives the "Powered By" footer's continuous rainbow color-cycle -
  // separate from footerOpacity (its fade-IN), and can't use the native
  // driver since color interpolation isn't supported there.
  const footerColorAnim = useRef(new Animated.Value(0)).current;

  // Timestamp this splash instance mounted, so the ready-effect below can
  // work out how much of MIN_HOLD_MS is still left to wait.
  const mountedAtRef = useRef(Date.now());
  const holdTimeoutRef = useRef(null);
  useEffect(() => () => { if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current); }, []);

  const [stageLabel, setStageLabel] = useState(STAGES[0].label);
  const [percent, setPercent] = useState(0);
  const [showCheck, setShowCheck] = useState(false);
  const finishedRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Continuous orbit rotation for the particles ring around the logo.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(orbitAnim, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Continuous rainbow color-cycle for the "Powered By" footer text - loops
  // 0->1 forever at a constant rate; the color itself comes from
  // interpolating this against FOOTER_COLORS in the render below, so the
  // "randomness" is really a smooth, never-repeating-looking cycle through
  // several bright brand-adjacent hues rather than true randomness (which
  // would just look like flicker on a small line of text).
  useEffect(() => {
    const colorLoop = Animated.loop(
      Animated.timing(footerColorAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    colorLoop.start();
    return () => colorLoop.stop();
  }, []);

  // Track live percent for the label without re-rendering on every native tick.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      setPercent(Math.round(value * 100));
    });
    return () => progress.removeListener(id);
  }, []);

  // Entrance: logo + wordmark + tagline, then start the staged progress fill.
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: false,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(nameTranslate, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(progressOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
      ]),
    ]).start(() => runStage(0));
  }, []);

  function runStage(index) {
    if (finishedRef.current) return;
    if (index >= STAGES.length) return; // holds at 92% until `ready`
    setStageLabel(STAGES[index].label);
    Animated.timing(progress, {
      toValue: STAGES[index].to,
      duration: STAGES[index].duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !finishedRef.current) runStage(index + 1);
    });
  }

  // Once the real app signals it's ready, finish the bar to 100%, show the
  // check mark, then fade the whole splash out and hand control back - but
  // never before MIN_HOLD_MS has elapsed since mount, so the brand moment
  // always gets its full 5 seconds even on a fast connection.
  useEffect(() => {
    if (!ready || finishedRef.current) return;
    finishedRef.current = true;

    const elapsed = Date.now() - mountedAtRef.current;
    const remaining = Math.max(0, MIN_HOLD_MS - elapsed);

    holdTimeoutRef.current = setTimeout(() => {
      progress.stopAnimation();
      setStageLabel('Ready');
      Animated.timing(progress, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(() => {
        setShowCheck(true);
        Animated.spring(checkScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: false,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(containerOpacity, {
              toValue: 0,
              duration: 350,
              easing: Easing.in(Easing.ease),
              useNativeDriver: false,
            }).start(() => onFinished && onFinished());
          }, 350);
        });
      });
    }, remaining);
  }, [ready]);

  const orbitRotation = orbitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.logoWrap}>
        <Animated.View
          style={[
            styles.orbitRing,
            { opacity: logoOpacity, transform: [{ rotate: orbitRotation }] },
          ]}
        >
          <View style={[styles.particle, styles.particleTop]} />
          <View style={[styles.particle, styles.particleRight]} />
          <View style={[styles.particle, styles.particleLeft]} />
        </Animated.View>

        <Animated.View
          style={[
            styles.logoBox,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" />
        </Animated.View>
      </View>

      <Animated.Text
        style={[
          styles.brand,
          { opacity: nameOpacity, transform: [{ translateY: nameTranslate }] },
        ]}
      >
        MySheba
      </Animated.Text>

      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Wherever you're, We're here.
      </Animated.Text>

      <Animated.View style={[styles.progressSection, { opacity: progressOpacity }]}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth }]} />
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.stageLabel}>
            {showCheck ? 'Ready' : stageLabel}
          </Text>
          <Text style={styles.percentLabel}>{percent}%</Text>
        </View>
      </Animated.View>

      {showCheck && (
        <Animated.View style={[styles.checkWrap, { transform: [{ scale: checkScale }] }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>
      )}

      <Animated.Text
        style={[
          styles.footerText,
          {
            opacity: footerOpacity,
            color: footerColorAnim.interpolate({
              inputRange: FOOTER_COLORS.map((_, i) => i / (FOOTER_COLORS.length - 1)),
              outputRange: FOOTER_COLORS,
            }),
          },
        ]}
      >
        Powered By - SATULINK SOLUTIONS SDN BHD
      </Animated.Text>
    </Animated.View>
  );
}

const ORBIT_SIZE = 108;
const PARTICLE_SIZE = 7;

function createStyles(colors, containerBg) {
  return StyleSheet.create({
    // Same background as app.json's splash.backgroundColor in light mode
    // so this flows straight out of the native splash screen with no
    // color flash; follows the dark palette once JS takes over.
    container: {
      flex: 1,
      backgroundColor: containerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoWrap: {
      width: ORBIT_SIZE,
      height: ORBIT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    orbitRing: {
      position: 'absolute',
      width: ORBIT_SIZE,
      height: ORBIT_SIZE,
      borderRadius: ORBIT_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    particle: {
      position: 'absolute',
      width: PARTICLE_SIZE,
      height: PARTICLE_SIZE,
      borderRadius: PARTICLE_SIZE / 2,
      backgroundColor: colors.primary,
    },
    particleTop: {
      top: 0,
      left: ORBIT_SIZE / 2 - PARTICLE_SIZE / 2,
    },
    particleRight: {
      bottom: 10,
      right: 6,
      opacity: 0.7,
    },
    particleLeft: {
      bottom: 10,
      left: 6,
      opacity: 0.45,
    },
    logoBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImage: {
      width: '100%',
      height: '100%',
    },
    brand: {
      color: colors.navy,
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    tagline: {
      color: colors.navy,
      opacity: 0.6,
      fontSize: 13,
      marginTop: 6,
    },
    progressSection: {
      width: 180,
      marginTop: 28,
    },
    progressTrack: {
      width: '100%',
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border || 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    stageLabel: {
      color: colors.navy,
      opacity: 0.55,
      fontSize: 12,
    },
    percentLabel: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    checkWrap: {
      position: 'absolute',
      bottom: '32%',
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '700',
    },
    footerText: {
      position: 'absolute',
      bottom: 28,
      alignSelf: 'center',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
  });
}
