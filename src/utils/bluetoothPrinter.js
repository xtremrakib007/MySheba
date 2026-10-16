// A Bluetooth thermal receipt printer (ESC/POS over Bluetooth Classic), e.g.
// the PrinterMax M58: pair it once in Android's Bluetooth settings, choose it
// in MySheba's Printer screen, and every Print button sends the receipt to it
// directly (utils/printService.js) - no Android print dialog.
//
// Only printers already paired are listed, so MySheba needs no Bluetooth scan
// and no location permission - just BLUETOOTH_CONNECT on Android 12+.
//
// The native module arrived with a new build. A binary without it (an older
// build running this code as an OTA update) reports the printer as
// unavailable and printing falls back to the Android print dialog.
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bytesToBase64 } from './escpos';

const STORAGE_KEY = 'mysheba:thermalPrinter';
const CHUNK = 256; // bytes per write: cheap printers drop a larger burst

function bluetooth() {
  if (Platform.OS !== 'android') return null;
  try {
    // Required lazily so an older binary without the module still loads.
    const mod = require('react-native-bluetooth-classic');
    const api = mod?.default || mod;
    return api && typeof api.getBondedDevices === 'function' ? api : null;
  } catch (_) {
    return null;
  }
}

/** Whether this build can talk to a Bluetooth printer at all. */
export function thermalPrintingAvailable() {
  return !!bluetooth();
}

async function ensurePermission() {
  if (Platform.OS !== 'android' || Platform.Version < 31) return;
  const perm = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(perm)) return;
  const result = await PermissionsAndroid.request(perm, {
    title: 'Connect to your printer',
    message: 'MySheba needs Bluetooth access to print receipts on your Bluetooth printer.',
    buttonPositive: 'Allow',
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Bluetooth permission is needed to print. Allow "Nearby devices" for MySheba in Android settings.');
}

async function ready() {
  const bt = bluetooth();
  if (!bt) throw new Error('This version of MySheba cannot print to a Bluetooth printer. Update the app from the Play Store.');
  await ensurePermission();
  if (!(await bt.isBluetoothEnabled())) {
    const on = await bt.requestBluetoothEnabled().catch(() => false);
    if (!on) throw new Error('Turn on Bluetooth to print.');
  }
  return bt;
}

/** Printers paired in Android's Bluetooth settings: [{ name, address }]. */
export async function listPairedPrinters() {
  const bt = await ready();
  const devices = await bt.getBondedDevices();
  return (devices || []).map((d) => ({ name: String(d.name || d.address), address: String(d.address) }));
}

/** The chosen printer, { name, address, paper: 58 | 80 }, or null. */
export async function getThermalPrinter() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || 'null');
    return saved && saved.address ? { paper: 58, ...saved } : null;
  } catch (_) {
    return null;
  }
}
export async function saveThermalPrinter(printer) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ name: printer.name, address: printer.address, paper: printer.paper === 80 ? 80 : 58 }));
}
export async function forgetThermalPrinter() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch (_) { /* nothing saved */ }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sends ESC/POS bytes to the chosen printer, connecting (once more on a drop) as needed. */
export async function printBytes(printer, bytes) {
  const bt = await ready();
  const send = async () => {
    if (!(await bt.isDeviceConnected(printer.address).catch(() => false))) {
      await bt.connectToDevice(printer.address, { delimiter: '', charset: 'ascii' });
    }
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await bt.writeToDevice(printer.address, bytesToBase64(bytes.slice(i, i + CHUNK)), 'base64');
      await pause(30);
    }
  };
  try {
    await send();
  } catch (first) {
    // A printer that slept or was switched off and on drops the link once.
    try { await bt.disconnectFromDevice(printer.address); } catch (_) { /* already gone */ }
    try { await send(); } catch (_) {
      throw new Error(`Could not print to ${printer.name}. Check it is on, charged, has paper and is near the phone.`);
    }
  }
}
