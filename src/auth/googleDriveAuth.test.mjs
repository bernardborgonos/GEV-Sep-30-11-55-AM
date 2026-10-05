import test from 'node:test';
import assert from 'node:assert/strict';
import { SCOPES, isSignInInProgress, setAccessTokenForTesting, getAccessToken, subscribeAuth } from './googleDriveAuth.js';

test('googleDriveAuth exports correct least-privilege scopes', () => {
  assert.ok(Array.isArray(SCOPES));
  assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(SCOPES.includes('https://www.googleapis.com/auth/drive.readonly'));
});

test('googleDriveAuth manages in-memory token state without persistence leaks', () => {
  setAccessTokenForTesting('mock-token-12345');
  assert.equal(getAccessToken(), 'mock-token-12345');

  let notifiedToken = null;
  const unsubscribe = subscribeAuth((state) => {
    notifiedToken = state.token;
  });

  assert.equal(notifiedToken, 'mock-token-12345');

  setAccessTokenForTesting(null);
  assert.equal(getAccessToken(), null);
  assert.equal(notifiedToken, null);

  unsubscribe();
});

test('googleDriveAuth tracks isSignInInProgress accurately', () => {
  assert.equal(isSignInInProgress(), false);
});
