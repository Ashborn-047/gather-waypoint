# ⦿ Gather

> **Real-time journey coordination — powered by the Waypoint engine.**

Gather is a mobile-first, session-based application designed for small groups to coordinate and navigate toward a shared destination. Built on a backend-authoritative architecture, it provides a glanceable, high-fidelity experience for real-time presence and spatial coordination.

---

## 📖 Overview

Gather solves the "Where are you?" problem for groups meeting up. Unlike traditional navigation apps, Gather focuses on **synchronous presence**. It allows participants to share live location, visualize the routes of others, and monitor estimated arrival times (ETA) in a unified, private session.

**The Philosophy:**
- **Intent-driven:** Built for specific sessions, not persistent tracking.
- **Glanceable:** Minimalistic UI designed to give the answer in 2 seconds.
- **Human-centric:** Includes social signaling like "Running Late" rather than just cold data.

---

## 🛠️ Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Mobile** | React Native (Expo) | Cross-platform high-fidelity UI |
| **Map Renderer** | MapLibre GL + OSM | In-app map with dark theme tiles |
| **Backend** | Convex | Real-time state, subscriptions, & persistence |
| **Routing** | OSRM (Railway) | Open Source Routing Machine for polyline/ETA |
| **Navigation** | Expo Router | File-based routing for mobile |
| **Identity** | Anonymous / Device-based | Privacy-first, zero-onboarding friction |

> **Note:** Google Maps SDK is not used — all map interactions stay within Gather.

---

## 📐 Architecture & System Design

### The Waypoint Engine
At the core of Gather is **Waypoint**, a backend engine hosted on Convex that maintains the "Ground Truth" for every session.

#### 1. Session-First Data Model
Every action happens within a volatile `Session`. Each session has a 4-hour TTL (Time-To-Live) and a unique 6-character invite code.

#### 2. Presence as a Snapshot
Unlike traditional location apps that store heavy history breadcrumbs, Waypoint uses a **Snapshot Model**. The `presence` table contains exactly one row per active participant, updated via high-frequency `patch` mutations. This keeps the database lean and subscriptions ultra-fast.

#### 3. Real-Time Data Flow

```
                    ┌─────────────────────────────────────────────┐
                    │            📱 MOBILE CLIENTS                │
                    │                                             │
                    │   ┌─────────────┐      ┌─────────────────┐  │
                    │   │  Location   │      │  Map Renderer   │  │
                    │   │  Service    │      │                 │  │
                    │   └──────┬──────┘      └────────▲────────┘  │
                    │          │                      │           │
                    │          │ 1-3s updateLocation  │ Real-time │
                    │          │                      │ Snapshot  │
                    │          ▼                      │           │
                    │   ┌─────────────────────────────┴───────┐   │
                    │   │         Interpolation Engine        │   │
                    │   │            (60fps smooth)           │   │
                    │   └─────────────────┬───────────────────┘   │
                    │                     │                       │
                    │                     ▼                       │
                    │            ┌─────────────────┐              │
                    │            │  Glanceable UI  │              │
                    │            └─────────────────┘              │
                    └─────────────────────┬───────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │          ⚡ WAYPOINT ENGINE (Convex)        │
                    │                                             │
                    │   ┌────────────┐ ┌────────────┐ ┌────────┐  │
                    │   │sessions.ts │ │presence.ts │ │ eta.ts │  │
                    │   └────────────┘ └────────────┘ └───┬────┘  │
                    │                                     │       │
                    └─────────────────────────────────────┼───────┘
                                                          │
                                          async action    │
                                          Polyline + ETA  │
                                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │           🚂 ROUTING LAYER (Railway)        │
                    │                                             │
                    │                 ┌──────────┐                │
                    │                 │ OSRM API │                │
                    │                 └──────────┘                │
                    └─────────────────────────────────────────────┘
```

### Key Invariants
- **Backend Authority:** All distance/ETA calculations are performed server-side.
- **Ephemeral Signals:** User-declared delays (e.g., "traffic") auto-expire after 15 minutes to keep information fresh.
- **Drift Detection:** Routes are only recomputed if a participant drifts >500m from their initial computed route, saving API calls.

---

## ✨ Features

- **Anonymous Sync:** Join with just a name; no account or password required.
- **Live Maps:** Real-time marker movement with smooth client-side interpolation.
- **Destination Waypoints:** One shared destination per session that everyone navigates toward.
- **Automated ETAs:** See everyone's arrival time update as they move through traffic.
- **Delay Signaling:** One-tap "Running Late" button to notify the group with ephemeral social badges.

---

## 🚀 Getting Started

### 1. Installation
```bash
git clone https://github.com/your-username/gather-waypoint.git
cd gather-waypoint
npm install
```

### 2. Backend Setup
1. Create a project at [convex.dev](https://convex.dev).
2. Run the initialization:
   ```bash
   npx convex dev
   ```
3. Copy your Deployment URL from the settings.

### 3. Environment Config
Create a `.env.local` file in the root:
```env
EXPO_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

### 4. Launch (Web)
```bash
npx expo start --web
```
The browser preview uses a dedicated `SessionMapWeb` implementation for instant feedback.

### 5. Launch (Native Mobile)
Since Gather uses native high-performance maps, you must perform a prebuild to generate the native code:
```bash
npx expo prebuild
npx expo run:android  # or run:ios
```
> [!IMPORTANT]
> A physical device or emulator is required for native map rendering.

---

## 📁 Project Structure

```bash
gather/
├── app/                    # Expo Router Screens
│   ├── _layout.tsx         # Providers & Navigation Stack
│   ├── index.tsx           # Home (Create/Join)
├── components/             # Reusable UI Components
│   ├── SessionMap/         # Platform-isolated Map
│   │   ├── index.tsx       # Platform Dispatcher
│   │   ├── SessionMapNative.tsx
│   │   └── SessionMapWeb.tsx
│   └── DestinationPicker.tsx
├── convex/                 # Waypoint Backend logic
│   ├── schema.ts           # Data definitions
│   ├── sessions.ts         # Lifecycle logic
│   ├── presence.ts         # Location logic
│   └── eta.ts              # Routing logic
├── lib/                    # Shared Utilities
│   ├── device.ts           # UID persistence
│   └── geo.ts              # Math & Formatting
└── docs/                   # Extended Implementation Docs
```

---

## 🛡️ License
MIT - Created by Pushan. Developed with Antigravity.
