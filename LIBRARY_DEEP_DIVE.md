# Personal Library V2: Deep-Dive Specification (Library & Archival Engine)

This document provides a granular breakdown of the Library module, focusing on data normalization, the multi-tier scanning logic, and the synchronization between the physical archive and the digital checklist.

---

## 1. The Data Normalization Model (Works vs. Editions)

To prevent metadata duplication while supporting multiple physical copies, the system uses a **Parent-Child-Link** architecture.

### A. Works (The Canonical Identity)
- **Purpose**: Represents the intellectual work (e.g., "The Great Gatsby").
- **Fields**: `title`, `author`, `synopsis`, `vibes[]`, `motifs[]`, `setting_era`, `setting_location`.
- **Constraint**: Unique on `(normalized_title, normalized_author)`.
- **Design Decision**: Literary metadata (vibes/motifs) is stored at this level so that reading one edition "populates" the profile for all others.

### B. Editions (The Physical Variation)
- **Purpose**: Represents a specific printing or ISBN.
- **Fields**: `work_id` (FK), `isbn`, `publisher`, `format`, `page_count`, `cover_image_url`, `publication_date`.
- **Constraint**: Unique on `isbn` (if provided).
- **Multi-Edition Logic**: One `work_id` can have many `editions`. This allows you to own both a mass-market paperback and a signed hardcover of the same book.

### C. User Books (The Ownership Link)
- **Purpose**: The bridge between the user and a specific edition.
- **Fields**: `user_id`, `edition_id` (FK), `book_id` (Legacy FK), `status`, `rating`, `review`, `owned_at`.
- **Primary Key**: Composite `(user_id, edition_id)`.
- **Handshake Logic**: When a user scans an edition they already own, the `owned_at` date is updated, but the record is preserved.

---

## 2. The ISBN Scanner (Discovery Engine)

The scanner uses a **Tiered Parallel Discovery** model to maximize both speed and metadata depth.

### A. Discovery Tiers
1.  **Tier 1: Comprehensive (OL Search & Data API)**
    - Primary source for `author_name`, `series_name`, and `subject` taxonomy.
    - Resolves author names immediately to prevent "Unknown Author" placeholders.
2.  **Tier 2: Enrichment (Google Books)**
    - Fetches high-resolution `extraLarge` cover art and synopses.
    - Used as a fallback for page counts and categories.
3.  **Tier 3: Fallback (OL Direct ISBN)**
    - Near-instant identification for modern ISBNs.
    - Triggers an automated "Author Key Resolution" if the name is returned as an OL key.

### B. Archival Commit Logic (The Pipeline)
1.  **Work Discovery**: Checks for existing `works` via fuzzy matching. Creates if missing.
2.  **Edition Discovery**: Broad ISBN lookup across all works to find any existing record of this printing.
3.  **Cover Synthesis**: If a new cover is found, it is downloaded, compressed, and mirrored in **Supabase Storage** to prevent broken links from external APIs.
4.  **Error Isolation**: Each book in the queue is wrapped in a `try/catch`. Database conflicts (e.g., RLS violations) are caught per-item, allowing the rest of the batch to continue.

---

## 3. Library vs. Checklist (The Digital Handshake)

The system manages two distinct states: **Roadmap** (what I want) and **Archive** (what I own).

### A. The Checklist (`books` table)
- **Role**: A "shopping list" or series roadmap.
- **Functionality**:
    - **Saga Scout Integration**: When a series is identified, AI injects missing volumes into this table as `draft` items.
    - **Work Mapping**: Each checklist item must point to a `work_id` to ensure it "glows" on the series roadmap when owned.

### B. The Handshake Logic
- **Verification**: When a physical book is scanned, the system performs a `Checklist Handshake`:
    1.  Looks for a row in the `books` table with a matching `title`/`author` or `work_id`.
    2.  Updates that row to point to the new `work_id`.
    3.  Marks the item as "Owned" in the UI by resolving the `user_books` link.
- **De-duplication**: The `retro_dedupe_library.cjs` utility ensures that if a book exists in both the checklist and the library, they are merged into a single canonical `work_id`.

---

## 4. UI Layout & Ergonomics

- **Sticky Viewport Controls**: The scanner commit bar uses `position: sticky; bottom: 0; height: 10dvh;` to remain reachable on all mobile viewports.
- **Batch Results Queue**: A scrollable `flex: 1` container that isolates the results from the camera viewport, preventing UI jumping during ingestion.
- **Draft Status**: Scans with missing metadata are marked as `status: 'draft'`, prompting the user for manual correction before archival.
