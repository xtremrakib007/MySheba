#!/usr/bin/env node
/**
 * The arithmetic behind DateField and TimeField.
 *
 * These replaced a bare `DateTimePicker` reference that was never imported
 * (and whose package was never a dependency), so every date field in the
 * app threw the moment it was tapped.
 */
const esbuild = require('esbuild');
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'dateFieldUtils.js'), 'utf8'),
  { loader: 'js', format: 'cjs' }).code;
const box = { module: { exports: {} }, exports: {} };
box.module.exports = box.exports; vm.createContext(box); vm.runInContext(code, box);
const U = box.module.exports;

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  const ok = a === b;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `  (got ${a}, want ${b})`}`);
};

console.log('\n-- month lengths --');
is('February 2024 is a leap year', U.daysInMonth(2024, 2), 29);
is('February 2023 is not', U.daysInMonth(2023, 2), 28);
is('February 2000 is (divisible by 400)', U.daysInMonth(2000, 2), 29);
is('February 1900 is not (divisible by 100)', U.daysInMonth(1900, 2), 28);
is('April has 30', U.daysInMonth(2024, 4), 30);
is('December has 31', U.daysInMonth(2024, 12), 31);

console.log('\n-- parsing --');
is('a real date', U.parseISODate('1994-03-07'), { year: 1994, month: 3, day: 7 });
is('29 Feb in a leap year is real', U.parseISODate('2024-02-29'), { year: 2024, month: 2, day: 29 });
is('29 Feb in a common year is not', U.parseISODate('2023-02-29'), null);
is('month 13 is not', U.parseISODate('2024-13-01'), null);
is('day 0 is not', U.parseISODate('2024-01-00'), null);
is('empty is not', U.parseISODate(''), null);
is('a display date is not an ISO date', U.parseISODate('07/03/1994'), null);
is('round trip', U.toISODate({ year: 1994, month: 3, day: 7 }), '1994-03-07');

console.log('\n-- the day has to survive changing month --');
is('31 Jan -> Feb clamps to 29 in a leap year',
   U.clampDate({ year: 2024, month: 2, day: 31 }), { year: 2024, month: 2, day: 29 });
is('31 Jan -> Feb clamps to 28 otherwise',
   U.clampDate({ year: 2023, month: 2, day: 31 }), { year: 2023, month: 2, day: 28 });
is('31 -> April clamps to 30',
   U.clampDate({ year: 2024, month: 4, day: 31 }), { year: 2024, month: 4, day: 30 });
is('a valid date is left alone',
   U.clampDate({ year: 2024, month: 5, day: 15 }), { year: 2024, month: 5, day: 15 });

console.log('\n-- bounds --');
const min = new Date(2024, 0, 10);   // 2024-01-10
const max = new Date(2024, 11, 20);  // 2024-12-20
is('before minimum is pulled up',
   U.clampDate({ year: 2023, month: 6, day: 1 }, min, max), { year: 2024, month: 1, day: 10 });
is('after maximum is pulled down',
   U.clampDate({ year: 2025, month: 6, day: 1 }, min, max), { year: 2024, month: 12, day: 20 });
is('inside the range is untouched',
   U.clampDate({ year: 2024, month: 6, day: 1 }, min, max), { year: 2024, month: 6, day: 1 });
is('a day before the minimum is not selectable',
   U.isDaySelectable(2024, 1, 9, min, max), false);
is('the minimum day itself is',
   U.isDaySelectable(2024, 1, 10, min, max), true);
is('the maximum day itself is',
   U.isDaySelectable(2024, 12, 20, min, max), true);
is('a day after the maximum is not',
   U.isDaySelectable(2024, 12, 21, min, max), false);
is('a month entirely before the minimum is not offered',
   U.isMonthSelectable(2023, 12, min, max), false);
is('the minimum month is, even though part of it is out',
   U.isMonthSelectable(2024, 1, min, max), true);
is('a month entirely after the maximum is not',
   U.isMonthSelectable(2025, 1, min, max), false);

console.log('\n-- years offered --');
const dob = U.yearRange(undefined, new Date(2026, 0, 1), new Date(2026, 0, 1));
is('date of birth: newest first', dob[0], 2026);
is('date of birth: reaches back a century', dob[dob.length - 1], 1926);
const future = U.yearRange(new Date(2026, 0, 1), undefined, new Date(2026, 0, 1));
is('an expiry date starts at the minimum', future[future.length - 1], 2026);

console.log('\n-- time --');
is('afternoon', U.parseDisplayTime('02:45 PM'), { hour12: 2, minute: 45, suffix: 'PM' });
is('lowercase and unpadded', U.parseDisplayTime('9:05 am'), { hour12: 9, minute: 5, suffix: 'AM' });
is('hour 13 is not a 12-hour time', U.parseDisplayTime('13:00 PM'), null);
is('minute 60 is not', U.parseDisplayTime('01:60 PM'), null);
is('nonsense is not', U.parseDisplayTime('later'), null);
is('formats padded', U.formatDisplayTime({ hour12: 9, minute: 5, suffix: 'AM' }), '09:05 AM');
is('round trip', U.formatDisplayTime(U.parseDisplayTime('02:45 PM')), '02:45 PM');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
