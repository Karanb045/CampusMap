<div align="center">

# 🏛️ DIT University Smart Campus Navigation PWA

**An interactive indoor/outdoor wayfinding system for DIT University, Dehradun**

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Leaflet](https://img.shields.io/badge/Leaflet.js-Map-199900?style=flat-square&logo=leaflet)](https://leafletjs.com)
[![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-5A0FC8?style=flat-square&logo=pwa)](https://web.dev/progressive-web-apps/)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com/karanb045s-projects/campus-map)

[🗺️ Live Demo](https://campus-map-ivory.vercel.app/)

</div>

## 🎯 About the Project

The **DIT University Smart Campus Navigation PWA** is a real-time, mobile-first Progressive Web Application that helps students, faculty, staff, and visitors navigate the DIT University campus in Dehradun, Uttarakhand.

The system provides:
- 🗺️ An **interactive Leaflet map** with real surveyed GeoJSON building polygons
- 🧭 **Step-by-step directions** from campus gate to any specific room
- 🏢 **Indoor floor-plan navigation** with room pin overlays
- 🔍 **Full-text scored search** across buildings, rooms, and departments
- ⚙️ A **Firebase-powered admin panel** for managing all campus data
- 📴 **Offline support** via PWA service worker caching

> Built as a Software Engineering project at DIT University (2025–2026).

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗺️ Interactive Map | Leaflet.js map with real GeoJSON polygons for 6 campus buildings |
| 🔍 Smart Search | Debounced, scored search across buildings, rooms, departments, in-charge names |
| 🧭 Directions Stepper | 4 step types: Outdoor → Building Entry → Floor Checkpoint → Indoor |
| 🏢 Indoor Navigation | Floor plan viewer with room dot overlays using planX/planY coordinates |
| 🔐 Auth System | Google Sign-In, Email/Password, Guest mode, Admin role via Firestore |
| ⚙️ Admin Panel | Full CRUD for buildings, floors, rooms, directions, floor plan pins |
| 📂 Directory | Alphabetical building and room directory listing |
| 📴 Offline PWA | Service worker caching — works without internet after first load |
| 📱 Responsive | Mobile bottom-nav layout + Desktop three-column sidebar layout |
| 🔗 Deep Links | QR code / URL parameter support to open specific buildings or rooms |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (functional components + hooks) |
| Build Tool | Vite |
| Map | Leaflet.js via react-leaflet v4 |
| Styling | Tailwind CSS + Inline styles |
| State | Zustand (`useMapStore`) |
| Database | Firebase Firestore (real-time listeners) |
| Auth | Firebase Auth — Google OAuth + Email/Password |
| Search | In-memory scored full-text (`searchService.js`) |
| Language | Plain JavaScript ES2022 — **no TypeScript** |
| PWA | Vite PWA plugin + Service Worker |
| Hosting | **Vercel** |

---

## 📁 Project Structure

```
src/
├── App.jsx                          # Root — all state wiring, layout, tab management
├── components/
│   ├── CampusMap.jsx                # Leaflet map, GeoJSON polygons, POI markers
│   ├── SearchBar.jsx                # Debounced search + scored results dropdown
│   ├── FilterChips.jsx              # Category filter pills
│   ├── DetailPanel.jsx              # Building/room detail bottom sheet
│   ├── DirectionsStepper.jsx        # Step-by-step directions modal
│   ├── IndoorPathView.jsx           # Indoor floor navigation view
│   ├── OfflineBanner.jsx            # Offline indicator banner
│   ├── AuthScreen.jsx               # Login / register / guest screen
│   └── admin/
│       └── FloorPlanPinTool.jsx     # Admin room dot placement on floor plan
├── pages/
│   ├── DirectoryPage.jsx            # Alphabetical building/room directory
│   └── AdminPage.jsx                # Full CRUD admin dashboard (lazy-loaded)
├── hooks/
│   ├── useAuth.js                   # Firebase auth + admin role check
│   ├── useMapStore.js               # Zustand global store
│   └── useRoute.js                  # Dijkstra outdoor routing
├── services/
│   ├── firebase.js                  # Firebase init — exports db, auth
│   ├── firestoreService.js          # All Firestore reads/writes
│   └── searchService.js            # In-memory scored search index
└── data/
    └── ditBuildings.json            # Real GeoJSON building polygons (map only)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- Git

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/karanb045/campus-map.git
cd campus-map

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your Firebase config values

# 4. Seed Firestore with all 6 campus buildings
node scripts/seedFirestore.js

# 5. Start the development server
npm run dev
```

App runs at **`http://localhost:5173`**

### Testing on a Real Mobile Device

```bash
npm run dev -- --host
```

Exposes the dev server on your local network (e.g. `http://192.168.1.x:5173`) — test on a physical phone without deploying.

---

## 🔥 Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add Project** → name it
3. Enable **Firestore Database** → Start in test mode
4. Enable **Authentication** → Sign-in method → turn on **Google** and **Email/Password**

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=ditumap-69820.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ditumap-69820
VITE_FIREBASE_STORAGE_BUCKET=ditumap-69820.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```
> When deploying on Vercel, add these same keys in **Vercel → Project Settings → Environment Variables**.

### 3. Add Your First Admin User

In Firebase Console → **Firestore** → create a document manually:

```
Collection : admins
Document ID: your-email@example.com
Fields:
  name    → "Your Name"      (string)
  role    → "superadmin"     (string)
  addedAt → (current date)   (timestamp)
```

Log in with that email — the **Admin tab** appears automatically.

---

## 🌱 Seeding the Database

```bash
node scripts/seedFirestore.js
```

Populates Firestore `/buildings` with all 6 campus buildings:

| ID | Name | Category | Floors |
|---|---|---|---|
| `vedanta` | Vedanta Block | Admin | G + 5 |
| `chanakya` | Chanakya Block | Academic | G + 4 |
| `civil` | Civil Block | Academic | G + 4 |
| `vivekananda` | Vivekananda Block | Academic | G + 5 |
| `boys_hostel` | Boys Hostel | Hostel | G + 5 |
| `girls_hostel` | Girls Hostel | Hostel | G + 5 |

> Safe to re-run — existing documents are overwritten with the same data.

---

## 🗺️ Campus Data

- **Campus centre:** Lat `30.3990`, Lng `78.0755`
- **Bounding box:** Lat `30.397–30.401`, Lng `78.074–78.077`
- **GeoJSON file:** `src/data/ditBuildings.json`

> The GeoJSON file is used **only** by `CampusMap.jsx` for polygon outlines. All building metadata comes exclusively from **Firestore**.

---

## 🔐 Authentication

| Mode | How to Access | Permissions |
|---|---|---|
| Google Sign-In | Click Google button on auth screen | Full browse + navigate |
| Email / Password | Register or login with email | Full browse + navigate |
| Guest | Click "Continue as Guest" | Browse-only |
| Admin | Any auth + email exists in `/admins` collection | Full CRUD via Admin Panel |

---

## ⚙️ Admin Panel

Visible only when your email exists in Firestore `/admins` collection.

**Manage from the Admin tab:**

- 🏢 **Buildings** — Add/edit name, category, coordinates, photo URL (Imgur link)
- 🏗️ **Floors** — Add floor records with floor plan image URL (Imgur link)
- 🚪 **Rooms** — Full room data: number, name, type, department, capacity, in-charge, equipment, hours, accessibility
- 🧭 **Directions** — Configure `directions[]` per room for the step-by-step stepper
- 📌 **Floor Plan Pins** — Click on floor plan photo to place room dots (saves `planX`/`planY`)
- 👤 **Admin Users** — Add or remove admin access by email

> 📸 Floor plan images are hosted on **Imgur**. Paste the direct `.jpg`/`.png` URL into the floor plan URL field.

---

## 🗄️ Firestore Collections

```
/buildings   →  One doc per building   (ID = buildingId, e.g. "chanakya")
/floors      →  One doc per floor      (ID = "buildingId_F0", "buildingId_F1" ...)
/rooms       →  One doc per room       (auto-generated ID)
/admins      →  One doc per admin      (ID = admin email address)
/audit       →  Admin action log       (auto-written on every CRUD action)
```

### `directions[]` step object structure

```js
{
  type: 'outdoor' | 'building_entry' | 'checkpoint' | 'indoor',
  instruction: 'Walk towards Chanakya Block',
  hint: 'Follow the main campus path',
  landmark: 'Main Gate',

  // checkpoint steps only:
  targetFloor: 2,
  confirmText: 'Have you reached Floor 2?',
  confirmSub: 'Tap Yes when you are on Floor 2'
}
```

---

## 🚢 Deployment on Vercel

This project is deployed on **Vercel** at:
👉 [https://campus-map-ivory.vercel.app/](https://campus-map-ivory.vercel.app/)

### Deploy Your Own Fork

**Option A — Vercel Dashboard (recommended):**

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Set **Framework Preset** to `Vite`
4. Add all `VITE_FIREBASE_*` keys under **Environment Variables**
5. Click **Deploy**

**Option B — Vercel CLI:**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Vercel Configuration (`vercel.json`)

Create this file in the project root to handle React Router correctly:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Environment Variables on Vercel

In **Vercel → Project → Settings → Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | your api key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ditumap-69820.firebaseapp.com |
| `VITE_FIREBASE_PROJECT_ID` | ditumap-69820 |
| `VITE_FIREBASE_STORAGE_BUCKET` | ditumap-69820.appspot.com |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | your sender id |
| `VITE_FIREBASE_APP_ID` | your app id |

> After adding env vars, trigger a **Redeploy** from the Vercel dashboard for them to take effect.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
