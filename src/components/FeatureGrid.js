import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { iconFor, iconRenderFor } from '../theme/iconSets';
import { serviceColor } from '../theme/serviceColors';

const GRID_PADDING = 10;
const COLUMN_GAP = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;
function itemWidth(numColumns) { return (CONTAINER_WIDTH - COLUMN_GAP * (numColumns - 1)) / numColumns; }
function isLight(colors) { return colors && colors.bg === '#FFFFFF'; }
function luminance(hex) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return 1;
  const rgb = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastText(hex) { return luminance(hex) > 0.55 ? '#000000' : '#FFFFFF'; }
function gridCanvas(gridStyle, colors, isDark) {
  const dark = isDark ? {
    bordered: '#0B0F12', classic: '#0B1220', soft: '#101418', minimal: 'transparent', glass: '#0E1A24',
    threeD: '#0D1116', gradient: '#17122A', neon: '#050709', bento: '#0C1015', adaptive: '#0B1512'
  } : {
    bordered: '#F5F7FA', classic: '#EEF5FF', soft: '#F7FAFC', minimal: 'transparent', glass: '#EAF6FF',
    threeD: '#EEF1F5', gradient: '#F0ECFF', neon: '#EEF2F5', bento: '#F4F0FF', adaptive: '#ECF9F3'
  };
  return dark[gridStyle] || colors.bg;
}

export default function FeatureGrid({ title, items, activeKey, onPress, numColumns = 4 }) {
  const { colors, isDark, gridStyle, iconStyle } = useTheme();
  const styles = createStyles(colors);
  const width = itemWidth(numColumns);
  const gradientColors = [colors.primary, colors.secondary];
  const gradientText = contrastText(gradientColors[0]);
  const iconRender = iconRenderFor(iconStyle);
  // Emoji carry their own colour, so iconText never needed one. The symbol
  // styles are monochrome and inherit it, and the default is black - which
  // on the translucent-white icon wrap in dark mode is all but invisible.
  // Follow whatever the label does for this grid style.
  const iconColor = gridStyle === 'neon' ? '#FFFFFF' : gridStyle === 'gradient' ? gradientText : colors.text;
  return (
    <View>
      {!!title && <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text></View>}
      <View style={[styles.gridCanvas, { backgroundColor: gridCanvas(gridStyle, colors, isDark) }, gridStyle === 'minimal' && styles.gridCanvasMinimal]}>
        <View style={styles.grid}>
          {items.map((it, index) => {
            const active = it.key === activeKey;
            const bento = gridStyle === 'bento' && index % 6 === 0;
            const adaptive = gridStyle === 'adaptive' && index < 4;
            const itemStyle = [
              styles.item,
              { width: bento ? width * 2 + COLUMN_GAP : width },
              gridStyle === 'bordered' && styles.bordered,
              gridStyle === 'classic' && styles.classic,
              gridStyle === 'soft' && styles.soft,
              gridStyle === 'minimal' && styles.minimal,
              gridStyle === 'glass' && styles.glass,
              gridStyle === 'threeD' && styles.threeD,
              gridStyle === 'neon' && styles.neon,
              gridStyle === 'bento' && styles.bento,
              gridStyle === 'adaptive' && styles.adaptive,
              adaptive && styles.itemAdaptive,
              active && styles.itemActive,
            ];
            // Each tile carries its own colour, as the mockup draws them; the
            // wash behind the glyph is that colour so the tint tracks it
            // instead of being one flat blue for everything.
            const tileTint = serviceColor(it.key, isDark, null);
            const iconBg = tileTint ? `${tileTint}24` : (isDark ? '#FFFFFF14' : (it.bg || '#E3F2FD'));
            const labelStyle = [styles.name, active && styles.nameActive, gridStyle === 'neon' && { color: '#FFFFFF' }, gridStyle === 'gradient' && { color: gradientText }];
            const content = (
              <>
                {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{String(it.badge)}</Text></View>
                )}
                <View style={[styles.iconWrap, { backgroundColor: iconBg }, (gridStyle === 'neon' || gridStyle === 'gradient') && styles.iconWrapBright]}>
                  <Text style={[styles.iconText, { color: tileTint || iconColor, fontSize: 27 * iconRender.scale, fontWeight: iconRender.weight }]}>{iconFor(it.key, iconStyle, it.icon)}</Text>
                </View>
                <Text style={labelStyle} numberOfLines={2}>{String(it.name || '')}</Text>
              </>
            );
            if (gridStyle === 'gradient') {
              return (
                <TouchableOpacity key={it.key} style={itemStyle} activeOpacity={0.82} onPress={() => onPress(it.key)}>
                  <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientFill}>
                    {content}
                  </LinearGradient>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity key={it.key} style={itemStyle} activeOpacity={0.82} onPress={() => onPress(it.key)}>
                {gridStyle === 'classic' && <View style={[styles.classicBar, { backgroundColor: it.accent || colors.primary }]} />}
                {gridStyle === 'adaptive' && adaptive && <View style={[styles.adaptiveBar, { backgroundColor: colors.primary }]} />}
                {content}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    sectionHead: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.navy },
    gridCanvas: { marginHorizontal: 4, borderRadius: radius.xl, paddingVertical: 8, overflow: 'hidden' },
    gridCanvasMinimal: { paddingVertical: 0 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP },
    item: { minHeight: 92, borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    bordered: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    classic: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}66` },
    soft: { backgroundColor: isLight(colors) ? '#F7FAFC' : '#101010' },
    minimal: { backgroundColor: 'transparent', borderWidth: 0 },
    glass: { backgroundColor: isLight(colors) ? '#FFFFFFD9' : '#FFFFFF12', borderWidth: 1, borderColor: isLight(colors) ? '#FFFFFF' : '#FFFFFF30', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    threeD: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}55`, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 5, transform: [{ translateY: -1 }] },
    neon: { backgroundColor: isLight(colors) ? '#10151A' : '#080A0C', borderWidth: 1, borderColor: `${colors.primary}99`, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
    bento: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}55`, minHeight: 108, paddingHorizontal: 8 },
    adaptive: { backgroundColor: colors.card, borderWidth: 1, borderColor: `${colors.primary}44` },
    itemAdaptive: { shadowColor: colors.primary, shadowOpacity: 0.18, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    classicBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    adaptiveBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    gradientFill: { flex: 1, width: '100%', minHeight: 92, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4 },
    iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    iconWrapBright: { borderWidth: 1, borderColor: '#FFFFFF30' },
    iconText: { fontSize: 27 },
    name: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: colors.text, lineHeight: 15, flexShrink: 1 },
    nameActive: { color: colors.primary },
    badge: { position: 'absolute', top: 5, right: 5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, zIndex: 2 },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
    itemActive: { borderColor: colors.primary, borderWidth: 2 },
  });
}
