// 🔥 FIREBASE: Central config — replace with your actual Firebase project values
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 🔥 FIREBASE: Owner email — hardcoded, cannot be changed
const OWNER_EMAIL = "wjohnston.media@gmail.com";

// 🔥 FIREBASE: Role hierarchy
const ROLES = {
  PROSPECTIVE: 'Prospective',
  CLIENT: 'Client',
  ADMIN: 'Admin',
  MASTER_ADMIN: 'Master Admin',
  OWNER: 'Owner'
};

// 🔥 FIREBASE: Project status stages
const PROJECT_STAGES = ['Planning', 'Shooting', 'Editing', 'Delivering', 'Delivered'];
