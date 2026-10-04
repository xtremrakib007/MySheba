import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Path, Polygon } from 'react-native-svg';

// Vector country flags.
//
// The flags were emoji, and emoji flags cannot be drawn large. On Android
// they come from Noto Color Emoji, which is a *bitmap* font - each glyph is
// a small PNG inside the font file. CountrySelectCard asked for fontSize 40
// (about 120 physical pixels on a 3x screen) and Android upscaled that
// bitmap to fit, which is exactly the blur. Raising the font size makes it
// worse, not better, because the source bitmap never gets any bigger.
//
// These are paths, so they are resolution-independent: crisp at 24px in the
// phone picker and crisp at 64px on a selection card, on every device. They
// also render at all - a regional-indicator pair silently falls back to two
// letter boxes on devices whose emoji font lacks the flag.
//
// One 60x40 viewBox for every flag, so a row of them lines up. That is a UI
// decision rather than a cartographic one: real flags disagree about aspect
// (Malaysia is 1:2, India 2:3, Nepal is not even a rectangle), and a flag
// set that shares one frame reads as a set. Nepal keeps its pennon shape
// inside the frame, because that shape *is* the flag.
//
// Only the countries the app actually offers a service in are drawn. Anything
// else - the 195-entry phone dial-code list - falls back to its emoji, which
// is fine at picker size where it is not being stretched.

// n-pointed star, first point straight up. Alternates outer/inner radius.
function star(cx, cy, n, ro, ri, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

// Malaysia's 14 stripes: red field with white over the even ones.
const MY_STRIPE = 40 / 14;
const myWhiteStripes = [1, 3, 5, 7, 9, 11, 13];

const FLAGS = {
  // Red over white.
  ID: () => (
    <>
      <Rect x="0" y="0" width="60" height="20" fill="#CE1126" />
      <Rect x="0" y="20" width="60" height="20" fill="#FFFFFF" />
    </>
  ),

  // Bottle green, red disc set slightly toward the hoist.
  // Kuwait: three bands with a black trapezoid at the hoist. The trapezoid is
  // the flag's whole distinguishing feature - a plain black rectangle there
  // reads as Sudan or Palestine, so it is drawn as the polygon it is.
  KW: () => (
    <>
      <Rect x="0" y="0" width="60" height="13.33" fill="#007A3D" />
      <Rect x="0" y="13.33" width="60" height="13.34" fill="#FFFFFF" />
      <Rect x="0" y="26.67" width="60" height="13.33" fill="#CE1126" />
      <Polygon points="0,0 18,13.33 18,26.67 0,40" fill="#000000" />
    </>
  ),

  BD: () => (
    <>
      <Rect x="0" y="0" width="60" height="40" fill="#006A4E" />
      <Circle cx="27" cy="20" r="11" fill="#F42A41" />
    </>
  ),

  // Saffron / white / green with the navy Ashoka Chakra.
  IN: () => (
    <>
      <Rect x="0" y="0" width="60" height="13.34" fill="#FF9933" />
      <Rect x="0" y="13.34" width="60" height="13.33" fill="#FFFFFF" />
      <Rect x="0" y="26.67" width="60" height="13.33" fill="#138808" />
      <Circle cx="30" cy="20" r="5.6" fill="none" stroke="#000080" strokeWidth="1" />
      <Circle cx="30" cy="20" r="1" fill="#000080" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        return (
          <Path
            key={i}
            d={`M30,20L${30 + 5.6 * Math.cos(a)},${20 + 5.6 * Math.sin(a)}`}
            stroke="#000080"
            strokeWidth="0.45"
          />
        );
      })}
    </>
  ),

  // 14 stripes, blue canton, crescent and 14-point star.
  MY: () => (
    <>
      <Rect x="0" y="0" width="60" height="40" fill="#CC0001" />
      {myWhiteStripes.map((i) => (
        <Rect key={i} x="0" y={i * MY_STRIPE} width="60" height={MY_STRIPE} fill="#FFFFFF" />
      ))}
      <Rect x="0" y="0" width="30" height={MY_STRIPE * 8} fill="#010066" />
      <Circle cx="11.5" cy="11.4" r="5.8" fill="#FFCC00" />
      <Circle cx="14.1" cy="11.4" r="5.8" fill="#010066" />
      <Polygon points={star(20, 11.4, 14, 4.2, 2.3)} fill="#FFCC00" />
    </>
  ),

  // White hoist bar, green field, crescent and star.
  PK: () => (
    <>
      <Rect x="0" y="0" width="60" height="40" fill="#01411C" />
      <Rect x="0" y="0" width="15" height="40" fill="#FFFFFF" />
      <Circle cx="34" cy="20" r="8.6" fill="#FFFFFF" />
      <Circle cx="36.9" cy="18.3" r="8.6" fill="#01411C" />
      <Polygon points={star(41.2, 13.6, 5, 4.2, 1.8, -70)} fill="#FFFFFF" />
    </>
  ),

  // Yellow / green / red with one large white star.
  MM: () => (
    <>
      <Rect x="0" y="0" width="60" height="13.34" fill="#FECB00" />
      <Rect x="0" y="13.34" width="60" height="13.33" fill="#34B233" />
      <Rect x="0" y="26.67" width="60" height="13.33" fill="#EA2839" />
      <Polygon points={star(30, 19.5, 5, 12, 5)} fill="#FFFFFF" />
    </>
  ),

  // Blue over red, white triangle at the hoist holding the sun and 3 stars.
  PH: () => (
    <>
      <Rect x="0" y="0" width="60" height="20" fill="#0038A8" />
      <Rect x="0" y="20" width="60" height="20" fill="#CE1126" />
      <Polygon points="0,0 0,40 30,20" fill="#FFFFFF" />
      <Polygon points={star(11, 20, 8, 7, 3)} fill="#FCD116" />
      <Circle cx="11" cy="20" r="2.6" fill="#FCD116" />
      <Polygon points={star(5.5, 6.2, 5, 1.9, 0.8)} fill="#FCD116" />
      <Polygon points={star(5.5, 33.8, 5, 1.9, 0.8)} fill="#FCD116" />
      <Polygon points={star(23.6, 20, 5, 1.9, 0.8)} fill="#FCD116" />
    </>
  ),

  // Blue / red / blue with Angkor Wat in white.
  KH: () => (
    <>
      <Rect x="0" y="0" width="60" height="40" fill="#032EA1" />
      <Rect x="0" y="10" width="60" height="20" fill="#E00025" />
      <Path d="M30,9.2 32.4,16.2 32.4,23.4 27.6,23.4 27.6,16.2 Z" fill="#FFFFFF" />
      <Path d="M22.4,13.6 24.3,18.8 24.3,23.4 20.5,23.4 20.5,18.8 Z" fill="#FFFFFF" />
      <Path d="M37.6,13.6 39.5,18.8 39.5,23.4 35.7,23.4 35.7,18.8 Z" fill="#FFFFFF" />
      <Rect x="20.5" y="23.4" width="19" height="1.9" fill="#FFFFFF" />
      <Rect x="18.4" y="25.9" width="23.2" height="2.1" fill="#FFFFFF" />
    </>
  ),

  // Sri Lanka. The lion is stylised rather than heraldic - at the 16px the
  // homepage rate chips use, the real figure is a smudge either way, and
  // what identifies this flag at a glance is its layout: gold frame, green
  // and orange bands at the hoist, maroon panel, four corner leaves.
  LK: () => (
    <>
      <Rect x="0" y="0" width="60" height="40" fill="#FFB700" />
      <Rect x="2.5" y="2.5" width="7" height="35" fill="#00534E" />
      <Rect x="10.8" y="2.5" width="7" height="35" fill="#EB7400" />
      <Rect x="19.6" y="2.5" width="37.9" height="35" fill="#8D153A" />
      <Circle cx="23.6" cy="7" r="1.9" fill="#FFB700" />
      <Circle cx="53.4" cy="7" r="1.9" fill="#FFB700" />
      <Circle cx="23.6" cy="33" r="1.9" fill="#FFB700" />
      <Circle cx="53.4" cy="33" r="1.9" fill="#FFB700" />
      <Path d="M35.5,12.5c3.4,0,6,2.6,6,6.2c0,3.4-1.6,6-4.2,7.6l1.4,3.4l-3.6-1.6l-3.4,1.6l1.4-3.4c-2.6-1.6-4.2-4.2-4.2-7.6C28.9,15.1,32.1,12.5,35.5,12.5Z" fill="#FFB700" />
      <Path d="M44,11.5 46.4,17.5 44,28" stroke="#FFB700" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  // Nepal is two stacked pennons, not a rectangle. The blue border is the
  // path's own stroke, which is what keeps the notch and the tips clean.
  NP: () => (
    <>
      <Path
        d="M20,3 41,15 28.5,18.4 43,31.6 20,37 Z"
        fill="#DC143C"
        stroke="#003893"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <Circle cx="29.5" cy="11.6" r="3.5" fill="#FFFFFF" />
      <Circle cx="29.5" cy="8.9" r="3.5" fill="#DC143C" />
      <Polygon points={star(30, 26.6, 12, 4.6, 2.4)} fill="#FFFFFF" />
      <Circle cx="30" cy="26.6" r="1.7" fill="#FFFFFF" />
    </>
  ),
};

// Nepal is drawn inside the frame rather than filling it, so it gets no
// rounded frame or hairline - it already carries its own blue border, and a
// rectangle drawn around a pennon just looks like a mistake.
const FILLS_FRAME = (code) => code !== 'NP';

export function hasVectorFlag(code) {
  return !!FLAGS[String(code || '').toUpperCase()];
}

/**
 * A country flag at `size` wide (3:2, so height is two thirds of that).
 * Falls back to the emoji for a country with no drawing, which keeps the
 * 195-country dial-code picker working untouched.
 */
export default function CountryFlag({ code, emoji, size = 40, style }) {
  const key = String(code || '').toUpperCase();
  const Draw = FLAGS[key];
  const height = (size * 2) / 3;

  if (!Draw) {
    return (
      <Text allowFontScaling={false} style={[{ fontSize: height, lineHeight: height * 1.16 }, style]}>
        {emoji || ''}
      </Text>
    );
  }

  const art = (
    <Svg width={size} height={height} viewBox="0 0 60 40">
      <Draw />
    </Svg>
  );

  // The rounded corners come from a clipping View rather than an SVG
  // ClipPath: a ClipPath needs an id, and ids are not reliably scoped per
  // <Svg> in react-native-svg, so a screen showing nine flags at once can
  // have them all clip against whichever definition won.
  if (!FILLS_FRAME(key)) return <View style={[{ width: size, height }, style]}>{art}</View>;

  return (
    <View style={[styles.frame, { width: size, height, borderRadius: Math.max(2, size * 0.075) }, style]}>
      {art}
    </View>
  );
}

// The frame is load-bearing, not decoration. Indonesia is red over white,
// Pakistan has a white bar at the hoist and the Philippines a white
// triangle - on the white card these sit on, the flag's own white simply
// vanishes and Indonesia reads as a red bar floating in space. A visible
// edge is what gives those flags their shape back, so it is a real 1px
// line rather than a hairline.
const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.26)',
  },
});
