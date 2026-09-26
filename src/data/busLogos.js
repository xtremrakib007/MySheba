// Bus-operator artwork, supplied by the app owner.
//
// `require` paths have to be literal for the bundler to see them, which is
// why this is a written-out map rather than a lookup built from the key.
//
// redbus.png was cropped from a source with a white surround: the mark is
// the red rounded square, and letterboxing it inside the tile would have
// left it noticeably smaller than the other two. All three are 256x256,
// which is plenty for a 34px tile on a 3x screen.
export const BUS_LOGOS = {
  'bus-redbus': require('../../assets/bus/redbus.png'),
  'bus-busonlineticket': require('../../assets/bus/busonlineticket.png'),
  'bus-easybook': require('../../assets/bus/easybook.png'),
};

export function busLogoImage(key) {
  return BUS_LOGOS[key] || null;
}
