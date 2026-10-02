const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

const app = readJson('app.base.json').expo;
const pkg = readJson('package.json');
const eas = readJson('eas.json');

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(app?.name === 'MySheba', 'expo.name must be MySheba');
assert(app?.android?.package === 'com.satulink.mysheba', 'Android package must be com.satulink.mysheba');
assert(Number.isInteger(app?.android?.versionCode) && app.android.versionCode > 0, 'android.versionCode must be a positive integer');
assert(typeof app?.version === 'string' && app.version.split('.').length >= 2, 'expo.version must be a valid dotted version');
assert(pkg.version === app.version, 'package.json version must match app.base.json expo.version');
assert(eas?.build?.production?.environment === 'production', 'EAS production profile must use the production environment');
assert(eas?.build?.production?.android?.buildType === 'app-bundle', 'EAS production profile must build an Android App Bundle');
assert(eas?.build?.['production-apk']?.environment === 'production', 'EAS production-apk profile must use the production environment');
assert(eas?.build?.['production-apk']?.android?.buildType === 'apk', 'EAS production-apk profile must build an APK');
assert(eas?.build?.production?.channel === 'production', 'EAS production profile must use the production channel');
assert(eas?.build?.['production-apk']?.channel === 'production', 'EAS production-apk profile must use the production channel');
assert(typeof app?.updates?.url === 'string' && app.updates.url.startsWith('https://u.expo.dev/'), 'Expo Updates URL must point to EAS');
assert(app?.runtimeVersion?.policy === 'sdkVersion', 'Runtime version policy must be sdkVersion');

const configPath = path.join(root, 'app.config.js');
assert(fs.existsSync(configPath), 'app.config.js is required');

if (failures.length) {
  console.error('Production readiness check FAILED:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Production readiness check PASSED');
console.log('MySheba ' + app.version + ' / Android versionCode ' + app.android.versionCode);
console.log('Package: ' + app.android.package);
console.log('Production profile: AAB / production environment / production channel');
console.log('Production APK profile: APK / production environment / production channel');
