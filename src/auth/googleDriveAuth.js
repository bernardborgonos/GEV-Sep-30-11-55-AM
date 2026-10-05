/**
 * @fileoverview Client-side Google Drive & Workspace Authentication via Firebase Auth.
 * 
 * Complies with least-privilege principles and in-memory token caching mandates.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';

import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

// In-memory access token cache (never stored in localStorage or sessionStorage)
let cachedAccessToken = null;
let isSigningIn = false;
let activeSignInPromise = null;
let currentUser = null;

// Listeners for auth state changes
const authListeners = new Set();

export function subscribeAuth(listener) {
  authListeners.add(listener);
  // Trigger initial emission
  listener({ user: currentUser, token: cachedAccessToken });
  return () => authListeners.delete(listener);
}

function notifyListeners() {
  const state = { user: currentUser, token: cachedAccessToken };
  for (const fn of authListeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[googleDriveAuth] Listener error:', err);
    }
  }
}

/**
 * Initializes auth state observer. Call on app load.
 * @param {Function} [onAuthSuccess]
 * @param {Function} [onAuthFailure]
 */
export function initAuth(onAuthSuccess, onAuthFailure) {
  return onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        notifyListeners();
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Cached token is absent; user must authenticate to refresh token for Workspace APIs
        cachedAccessToken = null;
        notifyListeners();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      notifyListeners();
      if (onAuthFailure) onAuthFailure();
    }
  });
}

/**
 * Initiates Google sign-in popup to acquire OAuth access token with Drive scopes.
 * Guards against concurrent popup executions to avoid auth/cancelled-popup-request.
 * Must be triggered by a direct user interaction.
 */
export async function googleSignIn() {
  if (cachedAccessToken && currentUser) {
    return { user: currentUser, accessToken: cachedAccessToken };
  }

  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  isSigningIn = true;
  activeSignInPromise = (async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Failed to obtain Google Drive access token from authentication result');
      }

      cachedAccessToken = credential.accessToken;
      currentUser = result.user;
      notifyListeners();
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error) {
      const isCancellation =
        error?.code === 'auth/cancelled-popup-request' ||
        error?.code === 'auth/popup-closed-by-user';

      if (isCancellation) {
        console.warn('[googleDriveAuth] Sign-in popup cancelled or closed by user:', error?.code || error?.message);
      } else {
        console.error('[googleDriveAuth] Sign-in error:', error);
      }
      throw error;
    } finally {
      isSigningIn = false;
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
}

/**
 * Returns true if an authentication popup is currently active.
 * @returns {boolean}
 */
export function isSignInInProgress() {
  return isSigningIn;
}

/**
 * Returns the currently cached in-memory access token.
 * @returns {string|null}
 */
export function getAccessToken() {
  return cachedAccessToken;
}

/**
 * Returns current authenticated user or null.
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Disconnects / signs out and purges in-memory token cache.
 */
export async function googleSignOut() {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
  notifyListeners();
}

/**
 * Sets access token for test runners or automation.
 * @param {string|null} token
 */
export function setAccessTokenForTesting(token) {
  cachedAccessToken = token;
  notifyListeners();
}
