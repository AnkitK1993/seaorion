// ── PASTE YOUR FIREBASE CONFIG HERE ────────────────────────────────────────
// Get it from: Firebase Console → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey: "AIzaSyAuLPXsa4QmHtQoOU1aeoWmdsWhGOV3SY0",
  authDomain: "seaorion-fef6d.firebaseapp.com",
  projectId: "seaorion-fef6d",
  storageBucket: "seaorion-fef6d.firebasestorage.app",
  messagingSenderId: "294651815553",
  appId: "1:294651815553:web:9d504a92d96f66df84cf80",
  measurementId: "G-MTPD4DN418",
};
// ────────────────────────────────────────────────────────────────────────────

(function () {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn(
      "SeaOrion: Firebase not configured — running in local-only mode.",
    );
    window._fbEnabled = false;
    return;
  }

  firebase.initializeApp(firebaseConfig);
  window._db = firebase.firestore();
  window._auth = firebase.auth();
  window._fbEnabled = true;
  console.info("SeaOrion: Firebase connected.");
})();
