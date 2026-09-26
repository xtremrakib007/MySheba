import React from 'react';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

// Modern line icons for the service grid, sidebar and home screen.
//
// Replaces RoyalIcon, whose paths hardcoded GOLD #D8AF48 and GREEN #033B31
// in every shape. It accepted a `color` prop and ignored it, so every tile
// rendered the same gold-on-green illustration no matter which service it
// was - the per-service accent computed in Tile had no effect on the glyph,
// only on the wash behind it.
//
// Everything here strokes in the colour it is given, on one 24x24 grid, at
// one weight. That is what makes a set read as a set, and it lets the
// service colours actually show.
//
// RoyalIcon also defined only 17 names while the app asks for 23, so visa,
// fomema, mydigital, passport, salary and settings all silently fell back
// to the four-square "more" glyph. They have their own icons now.

const S = { fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  home: (c) => <><Path d="M3 10.5 12 3l9 7.5" stroke={c} {...S} /><Path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" stroke={c} {...S} /><Path d="M9.5 21v-6h5v6" stroke={c} {...S} /></>,

  recharge: (c) => <><Rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke={c} {...S} /><Line x1="10" y1="5.5" x2="14" y2="5.5" stroke={c} {...S} /><Path d="M12 9.5v6M9 12.5h6" stroke={c} {...S} /></>,

  topup: (c) => <><Rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke={c} {...S} /><Path d="M2.5 10.5h19" stroke={c} {...S} /><Path d="M16.5 15.5h2" stroke={c} {...S} /></>,

  internet: (c) => <><Circle cx="12" cy="12" r="9" stroke={c} {...S} /><Path d="M3 12h18" stroke={c} {...S} /><Path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" stroke={c} {...S} /></>,

  billpayment: (c) => <><Path d="M6 2.5h12a1 1 0 0 1 1 1v18l-2.2-1.6L14.6 21 12 19.4 9.4 21l-2.2-1.6L5 21V3.5a1 1 0 0 1 1-1Z" stroke={c} {...S} /><Path d="M8.5 8h7M8.5 12h5" stroke={c} {...S} /></>,

  mobilebanking: (c) => <><Path d="M3 9.5 12 4l9 5.5" stroke={c} {...S} /><Path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8" stroke={c} {...S} /><Path d="M3 20.5h18" stroke={c} {...S} /></>,

  remittance: (c) => <><Circle cx="12" cy="12" r="9" stroke={c} {...S} /><Path d="M15 9.5H10.8a1.8 1.8 0 0 0 0 3.6h2.4a1.8 1.8 0 0 1 0 3.6H9" stroke={c} {...S} /><Path d="M12 7.5v1.8M12 16.7v1.8" stroke={c} {...S} /></>,

  bus: (c) => <><Rect x="3.5" y="3.5" width="17" height="13" rx="2.5" stroke={c} {...S} /><Path d="M3.5 11h17" stroke={c} {...S} /><Circle cx="7.5" cy="19" r="1.8" stroke={c} {...S} /><Circle cx="16.5" cy="19" r="1.8" stroke={c} {...S} /></>,

  train: (c) => <><Rect x="5.5" y="2.5" width="13" height="14" rx="3" stroke={c} {...S} /><Path d="M5.5 9h13" stroke={c} {...S} /><Circle cx="9" cy="13" r="1.1" stroke={c} {...S} /><Circle cx="15" cy="13" r="1.1" stroke={c} {...S} /><Path d="M8 16.5 6 21M16 16.5 18 21M4 21h16" stroke={c} {...S} /></>,

  flight: (c) => <Path d="M21 15.5 13.8 13V7a1.8 1.8 0 0 0-3.6 0v6L3 15.5v2l7.2-2v3.3l-2.2 1.5v1.2l4-1 4 1v-1.2l-2.2-1.5V15.5l7.2 2Z" stroke={c} {...S} />,

  visa: (c) => <><Rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke={c} {...S} /><Circle cx="8.5" cy="11" r="2.2" stroke={c} {...S} /><Path d="M5.5 16.5c.6-1.6 5-1.6 6 0" stroke={c} {...S} /><Path d="M14 9.5h4.5M14 13h3" stroke={c} {...S} /></>,

  fomema: (c) => <><Rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke={c} {...S} /><Path d="M9 3.5V6h6V3.5" stroke={c} {...S} /><Path d="M12 10v6M9 13h6" stroke={c} {...S} /></>,

  mydigital: (c) => <><Rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke={c} {...S} /><Path d="M18.5 9.5 12 12l-6.5-2.5" stroke={c} {...S} /><Path d="M7 15h4" stroke={c} {...S} /></>,

  passport: (c) => <><Path d="M5 4.5A2 2 0 0 1 7 2.5h11a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2Z" stroke={c} {...S} /><Circle cx="12" cy="10" r="3" stroke={c} {...S} /><Path d="M9.5 16.5h5" stroke={c} {...S} /></>,

  entertainment: (c) => <><Rect x="2.5" y="4.5" width="19" height="13" rx="2.5" stroke={c} {...S} /><Path d="M10.2 8.6 14.5 11l-4.3 2.4Z" stroke={c} {...S} /><Path d="M8 21h8" stroke={c} {...S} /></>,

  salary: (c) => <><Rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke={c} {...S} /><Circle cx="12" cy="12" r="2.6" stroke={c} {...S} /><Path d="M6 9.5v5M18 9.5v5" stroke={c} {...S} /></>,

  history: (c) => <><Path d="M3.6 9.5A9 9 0 1 1 3 13.4" stroke={c} {...S} /><Path d="M3 4.5v5h5" stroke={c} {...S} /><Path d="M12 7.5V12l3 2" stroke={c} {...S} /></>,

  support: (c) => <><Path d="M4 13.5v-1.8a8 8 0 0 1 16 0v1.8" stroke={c} {...S} /><Rect x="2.5" y="12.5" width="4" height="6" rx="2" stroke={c} {...S} /><Rect x="17.5" y="12.5" width="4" height="6" rx="2" stroke={c} {...S} /><Path d="M19.5 18.5c0 2-2 3-4.5 3" stroke={c} {...S} /></>,

  profile: (c) => <><Rect x="3.5" y="3" width="17" height="18" rx="2.5" stroke={c} {...S} /><Circle cx="9.5" cy="9.5" r="2.4" stroke={c} {...S} /><Path d="M6.5 15.5c.7-1.8 5.3-1.8 6 0" stroke={c} {...S} /><Path d="M15 9h3M15 13h2.5" stroke={c} {...S} /></>,

  account: (c) => <><Circle cx="12" cy="8.5" r="3.8" stroke={c} {...S} /><Path d="M4.5 20.5c.8-4.3 3.7-6.3 7.5-6.3s6.7 2 7.5 6.3" stroke={c} {...S} /></>,

  kyc: (c) => <><Rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke={c} {...S} /><Circle cx="9" cy="10.5" r="2.3" stroke={c} {...S} /><Path d="M6 15.5c.7-1.7 5.3-1.7 6 0" stroke={c} {...S} /><Path d="M15 10h4M15 13.5h3" stroke={c} {...S} /></>,

  settings: (c) => <><Circle cx="12" cy="12" r="3" stroke={c} {...S} /><Path d="M19.3 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.7-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.1-2.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" stroke={c} {...S} /></>,

  more: (c) => <><Rect x="3" y="3" width="7" height="7" rx="2" stroke={c} {...S} /><Rect x="14" y="3" width="7" height="7" rx="2" stroke={c} {...S} /><Rect x="3" y="14" width="7" height="7" rx="2" stroke={c} {...S} /><Path d="M17.5 14.5v6M14.5 17.5h6" stroke={c} {...S} /></>,
};

export default function ServiceIcon({ name = 'more', size = 22, color = '#1A73E8', style }) {
  const draw = PATHS[name] || PATHS.more;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {draw(color)}
    </Svg>
  );
}

export const SERVICE_ICON_NAMES = Object.keys(PATHS);
