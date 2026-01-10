import { Platform } from 'react-native';

/**
 * SessionMap Component Dispatcher
 * 
 * This file ensures that we only import the native MapLibre library on mobile devices
 * and the web version in the browser. This prevents "NativeModule undefined" errors
 * that crash the Expo Web preview.
 */

let SessionMap: any;

if (Platform.OS === 'web') {
    SessionMap = require('./SessionMapWeb').default;
} else {
    SessionMap = require('./SessionMapNative').default;
}

export default SessionMap;
