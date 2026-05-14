# Personal Website V2: Comprehensive Architecture & Master Blueprint

This document provides a holistic technical specification for the entire personal website, covering all modules from the Library Archival system to the Spotify-integrated Music Dashboard.

---

## 1. High-Level System Architecture

### Modular "Bento" Philosophy
The site is built as a collection of self-contained modules unified by a shared Design System and a single Supabase backend:
- **Library Hub**: Comprehensive book collection and series tracking.
- **Music Studio**: Real-time Spotify integration and physical media (Vinyl/CD) database.
- **Cinema Suite**: Personal film archive and watchlist.
- **Editorial Engine**: Blog and "Now" status updates.
- **Voyager Module**: Travel logs and location-based mapping.

---

## 2. Shared Technology Stack

- **Frontend**: Vite + React (SPA architecture).
- **State Management**: React Hooks (useContext/useReducer) + Supabase Real-time.
- **Styling**: Vanilla CSS (CSS Variables for Themes, Glassmorphism, Flex/Grid Layouts).
- **Backend**: Supabase (PostgreSQL, Storage, Edge Functions, Auth).
- **AI Engine**: Google Gemini (via Edge Functions) for metadata synthesis and taxonomy generation.
- **Animation**: Framer Motion for high-fidelity transitions.

---

## 3. Database Schema (The Unified Graph)

### A. Library Module (Catalog & Ownership)
> [!IMPORTANT]
> For a granular breakdown of the archival engine, see the [Library Deep-Dive](file:///Users/eve/.gemini/antigravity/brain/bb8ba220-1e34-4c6d-8410-cae174c4c03c/library_deep_dive.md).

- **The Works-to-Edition Model**: Normalizes data by separating the literary work from the physical printing, enabling multi-edition ownership without duplicate metadata.
- **The Checklist Handshake**: Synchronizes the physical archive with the digital roadmap by mapping scanned items to the `books` table and `works` hierarchy.
- **Database Schema**:
    - **`works`**: Canonical records (Unique on Title/Author).
    - **`editions`**: Physical variations (Unique on ISBN).
    - **`user_books`**: Ownership link (Composite PK: User+Edition).
    - **`series` & `series_works`**: Saga grouping and sequencing.

### B. Music Module (Sonic Identity)
- **`music`**: Physical collection records (Artist, Album, Format, Release Year).
- **`listening_log`**: Spotify-synced history (Track Name, Artist, Timestamp).
- **`top_artists`**: Weekly/Monthly rotation data.
- **Edge Function (`spotify-sync`)**: Polls Spotify API to update "Now Playing" and rotation logs.

### C. Editorial & Content Module
- **`posts`**: Blog entries (Title, Slug, HTML Content via TipTap, Tags, Published At).
- **`now_status`**: Real-time "What I'm doing" updates (Activity, Mood, Location).
- **`gear`**: Personal equipment/tech stack list.

### D. Cinema & Travel Modules
- **`films`**: Watchlist and rated movies (Director, Release Date, Rating).
- **`trips`**: Travel logs (Trip Name, Date Range, Description).
- **`locations`**: Geospatial points linked to trips.

---

## 4. Core Feature Specifications

### 1. The Archival Pipeline (Library)
- **Multi-Path Discovery**: Sequential lookup via Open Library Search -> Data API -> Google Books -> Direct ISBN.
- **Saga Scout**: AI-driven series expansion that suggests missing volumes to complete a collection.
- **Auto-Categorization**: NLP-based genre detection using title and subject tokens.

### 2. Live Rotation System (Music)
- **Real-time Presence**: WebSocket-based "Now Playing" status with dynamic color extraction from album art.
- **The Crate**: A randomized "Spin the Crate" feature for exploring the physical collection.

### 3. Integrated Admin Dashboard
- **Module Control**: Tabbed interface (`AdminTabs`) for managing all database tables.
- **Rich Text Editing**: TipTap integration for blog content with automated image uploading to Supabase Storage.
- **Provenance Logging**: Detailed notes on book/record acquisition (Source, Condition, Cost).

---

## 5. Design & Aesthetic Standards

### Visual Language
- **Base**: Deep obsidian backgrounds (`#0a0a0a`) with high-contrast typography.
- **Glassmorphism**: Subtle translucent overlays (`backdrop-filter: blur(10px)`) for drawers and modals.
- **Gradients**: Module-specific accent gradients (e.g., Library Orange-to-Red, Music Blue-to-Purple).
- **Typography**: `Inter` for functional text, `Outfit` or `Playfair Display` for editorial headers.

### Layout Rules
- **Responsive Bento**: Grid containers that collapse from multi-column desktop to single-stack mobile while maintaining hierarchy.
- **Persistent Controls**: All commit actions (Save, Archive, Post) are pinned to the bottom of the viewport using `dvh` units to avoid mobile UI clipping.
- **Micro-interactions**: Hover-scale effects on cards, stagger-fade entries for lists, and visual "flashes" during successful scans.

---

## 6. API & Integration Map

| Service | Purpose | Type |
| :--- | :--- | :--- |
| **Supabase Auth**| User session and Admin access control | OAuth / JWT |
| **Gemini Pro** | Metadata enrichment & Genre detection | Edge Function |
| **Spotify API** | Real-time listening stats & Rotation | Web API |
| **Open Library** | Book metadata and ISBN resolution | REST |
| **Google Books** | Fallback metadata and high-res covers | REST |
| **Resend/SendGrid**| System notifications (if needed) | SMTP/API |
