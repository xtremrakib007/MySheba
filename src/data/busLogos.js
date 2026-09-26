// Licensed bus-operator artwork, if you have it.
//
// Left empty on purpose: redBus, Bus Online Ticket and Easybook logos are
// their owners' trademarks, so they are not vendored into this repo. The
// app ships drawn monogram badges instead (see BusOperatorLogo), which are
// ours and need no permission.
//
// If you do obtain the real marks, drop the files in assets/bus/ and
// uncomment the matching line - the tile picks the image up with no other
// change. `require` paths have to be literal, which is why this is a map
// rather than a lookup built from the key.
export const BUS_LOGOS = {
  // 'bus-redbus': require('../../assets/bus/redbus.png'),
  // 'bus-busonlineticket': require('../../assets/bus/busonlineticket.png'),
  // 'bus-easybook': require('../../assets/bus/easybook.png'),
};

export function busLogoImage(key) {
  return BUS_LOGOS[key] || null;
}
