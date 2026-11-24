import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
} from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyCbhQSSimqWf7WSAr3GSmyNLWU21TLsye0',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'aquejugamos-81425.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'aquejugamos-81425',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'aquejugamos-81425.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '120748068937',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:120748068937:web:a95306c645a442c92e6f98',
};

export const firebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);

if (
  import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true' &&
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost'
) {
  connectAuthEmulator(firebaseAuth, 'http://localhost:9099', {
    disableWarnings: true,
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
