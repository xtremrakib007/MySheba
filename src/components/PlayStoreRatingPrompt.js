import React, { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { showAlert } from '../utils/appAlert';

const COMPLETED_KEY = '@mysheba/ratingPromptCompleted';
const LAST_SHOWN_KEY = '@mysheba/ratingPromptLastShown';
const SHOWN_COUNT_KEY = '@mysheba/ratingPromptShownCount';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.satulink.mysheba';
const MIN_DAYS_BETWEEN_PROMPTS = 90;
const MAX_PROMPTS = 2;

export default function PlayStoreRatingPrompt() {
  const { profile, screen } = useApp();
  const shownThisSession = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !profile?.uid || shownThisSession.current) return undefined;
    if (!['customerHome','dealerHome','resellerHome','adminHome','staffHome'].includes(screen)) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const completed = await AsyncStorage.getItem(COMPLETED_KEY);
        if (completed === '1' || cancelled || shownThisSession.current) return;

        const count = Number(await AsyncStorage.getItem(SHOWN_COUNT_KEY) || 0);
        if (count >= MAX_PROMPTS) return;
        const last = Number(await AsyncStorage.getItem(LAST_SHOWN_KEY) || 0);
        if (last && Date.now() - last < MIN_DAYS_BETWEEN_PROMPTS * 86400000) return;

        shownThisSession.current = true;
        await AsyncStorage.multiSet([
          [LAST_SHOWN_KEY, String(Date.now())],
          [SHOWN_COUNT_KEY, String(count + 1)],
        ]);

        showAlert(
          'Enjoying MySheba?',
          'If MySheba is useful to you, please rate us on Google Play. Your feedback helps us improve.',
          [
            {
              text: 'Rate MySheba',
              onPress: async () => {
                await AsyncStorage.setItem(COMPLETED_KEY, '1');
                try { await Linking.openURL(PLAY_URL); } catch (_) {}
              },
            },
            { text: 'Not now', style: 'cancel' },
          ],
        );
      } catch (_) {}
    }, 45000);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [profile?.uid, screen]);

  return null;
}
