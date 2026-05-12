/**
 * Genre Auto-Detection Utility
 * 
 * Maps Open Library subjects[] and Google Books categories[] to the
 * existing 42-genre system used in the books/editions tables.
 * 
 * Usage:
 *   const result = detectGenre(olSubjects, gbCategories);
 *   // result = { genre_id: 'scifi', genre_name: 'Sci-Fi', color: '#3A7DB5' }
 *   // or null if no match
 */

// Complete genre metadata lookup (all 42 genres from the seed data)
export const GENRE_META = {
  penguin_black:      { genre_name: 'Penguin Black Classics',               color: '#1a1a1a' },
  penguin_modern:     { genre_name: 'Penguin Modern Classics',              color: '#1a1a1a' },
  penguin_red:        { genre_name: 'Penguin Red Classics',                 color: '#b5231a' },
  ancient_classics:   { genre_name: 'Ancient Classics',                     color: '#B4916A' },
  vintage_classics:   { genre_name: 'Vintage Classics',                     color: '#1e3a6e' },
  vintage_genre:      { genre_name: 'Vintage (20th Century American)',      color: '#9A6A3A' },
  the_canon:          { genre_name: 'The Canon (Literary Essentials)',       color: '#2a2a2a' },
  contemporary_literary: { genre_name: 'Contemporary Literary Fiction',     color: '#2a4a5a' },
  modern_post2000:    { genre_name: 'Modern Fiction (Post-2000)',            color: '#4A8A8A' },
  translated:         { genre_name: 'Translated Fiction',                   color: '#6D7FB5' },
  scifi:              { genre_name: 'Sci-Fi',                               color: '#3A7DB5' },
  speculative_scifi_new: { genre_name: 'New Wave & Speculative Fiction',    color: '#1a4a4a' },
  fantasy:            { genre_name: 'Fantasy',                              color: '#7B5EA7' },
  horror:             { genre_name: 'Horror',                               color: '#8B3A3A' },
  horror_gothic:      { genre_name: 'Horror & Gothic (Expanded)',           color: '#5a1a1a' },
  gothic_supernatural:{ genre_name: 'Gothic, Supernatural & Weird Fiction', color: '#2a1a3a' },
  crime:              { genre_name: 'Crime',                                color: '#5A5A7A' },
  dark_romance:       { genre_name: 'Dark Romance & New Adult',             color: '#6e1a3a' },
  erotic_literary:    { genre_name: 'Literary Erotica & Transgressive Fiction', color: '#6e2a3a' },
  weird_transgressive:{ genre_name: 'Weird, Transgressive & Extreme Fiction', color: '#3a1a2a' },
  ya_fiction:         { genre_name: 'Young Adult & Coming of Age',          color: '#3a6a4a' },
  childrens:          { genre_name: "Children's",                           color: '#4a8a6a' },
  history:            { genre_name: 'History',                              color: '#8A6A4A' },
  memoir_biography:   { genre_name: 'Memoir & Biography',                   color: '#5a4a2a' },
  true_crime_history: { genre_name: 'True Crime & Dark History',            color: '#3a1a1a' },
  philosophy:         { genre_name: 'Philosophy',                           color: '#6A7A4A' },
  religion_spirituality: { genre_name: 'Religion, Spirituality & Sacred Texts', color: '#4a3a1a' },
  mythology:          { genre_name: 'Mythology',                            color: '#8B6BB1' },
  folk_fairy:         { genre_name: 'Folklore, Fairy Tales & World Traditions', color: '#4a6a2a' },
  poetry_drama:       { genre_name: 'Poetry & Drama',                       color: '#4a2a6a' },
  nonfiction:         { genre_name: 'Non-Fiction (Orange Spines)',           color: '#E07B39' },
  science_popular:    { genre_name: 'Popular Science & Mathematics',        color: '#1a4a6a' },
  social_political:   { genre_name: 'Social Science, Politics & Cultural Theory', color: '#3a5a3a' },
  finance_business:   { genre_name: 'Finance, Business & Productivity',     color: '#1a3a2a' },
  selfhelp:           { genre_name: 'Self Help',                            color: '#4A8A6A' },
  tarot_esoterica:    { genre_name: 'Tarot & Esoterica',                    color: '#4a1a6e' },
  japanese_lit:       { genre_name: 'Japanese Literature',                  color: '#8a6a4a' },
  korean_east_asian:  { genre_name: 'Korean & East Asian Fiction',          color: '#6a4a8a' },
  asian_classics:     { genre_name: 'Asian Classics',                       color: '#C0784A' },
  manga:              { genre_name: 'Manga',                                color: '#C05080' },
  comics:             { genre_name: 'Comics',                               color: '#3A8A5A' },
  art_drawing:        { genre_name: 'Art & Drawing',                        color: '#8a4a1a' },
};

// Priority-ordered keyword rules. First match wins.
// Higher-specificity patterns go first to avoid false positives.
const GENRE_RULES = [
  // Very specific matches
  { match: /\bmanga\b/i,                                          genre_id: 'manga' },
  { match: /\btrue crime\b/i,                                    genre_id: 'true_crime_history' },
  { match: /\btarot\b|\besoteric/i,                              genre_id: 'tarot_esoterica' },
  { match: /\bself[- ]?help\b|\bpersonal development\b/i,        genre_id: 'selfhelp' },
  { match: /\byoung adult\b|\bcoming of age\b|\bteen\b/i,        genre_id: 'ya_fiction' },
  { match: /\bgraphic novel\b|\bcomics?\b/i,                     genre_id: 'comics' },

  // Genre fiction (specific before broad)
  { match: /\bfantasy\b/i,                                       genre_id: 'fantasy' },
  { match: /\bscience fiction\b|\bsci-fi\b|\bsci fi\b/i,         genre_id: 'scifi' },
  { match: /\bspeculative fiction\b/i,                            genre_id: 'speculative_scifi_new' },
  { match: /\bhorror\b/i,                                        genre_id: 'horror' },
  { match: /\bgothic\b|\bsupernatural\b|\bweird fiction\b/i,     genre_id: 'gothic_supernatural' },
  { match: /\bcrime\b|\bmystery\b|\bthriller\b|\bdetective\b/i,  genre_id: 'crime' },
  { match: /\bromance\b/i,                                       genre_id: 'dark_romance' },
  { match: /\berotic/i,                                          genre_id: 'erotic_literary' },

  // Regional / cultural
  { match: /\bjapanese\b.*\b(literature|fiction|novel)\b/i,       genre_id: 'japanese_lit' },
  { match: /\bkorean\b.*\b(literature|fiction|novel)\b/i,         genre_id: 'korean_east_asian' },
  { match: /\bjapanese\b/i,                                      genre_id: 'japanese_lit' },
  { match: /\bkorean\b/i,                                        genre_id: 'korean_east_asian' },

  // Non-fiction categories
  { match: /\bphilosophy\b/i,                                    genre_id: 'philosophy' },
  { match: /\bmythology\b|\bmyth\b/i,                            genre_id: 'mythology' },
  { match: /\breligion\b|\bspiritual\b|\btheology\b|\bsacred\b/i,genre_id: 'religion_spirituality' },
  { match: /\bfolklore\b|\bfairy tale/i,                         genre_id: 'folk_fairy' },
  { match: /\bpoetry\b|\bpoems\b|\bdrama\b|\bplay(s|wright)?\b/i,genre_id: 'poetry_drama' },
  { match: /\bmemoir\b|\bbiograph\b|\bautobiograph/i,            genre_id: 'memoir_biography' },
  { match: /\bhistory\b|\bhistorical\b/i,                        genre_id: 'history' },
  { match: /\bscience\b|\bmathematic/i,                          genre_id: 'science_popular' },
  { match: /\bfinance\b|\bbusiness\b|\beconom/i,                 genre_id: 'finance_business' },
  { match: /\bpolitics\b|\bpolitical\b|\bsocial science\b|\bsociology\b/i, genre_id: 'social_political' },
  { match: /\bart\b|\bdrawing\b|\billustrat/i,                   genre_id: 'art_drawing' },
  { match: /\bchildren\b|\bkids\b|\bpicture book\b/i,           genre_id: 'childrens' },
  { match: /\bnon[- ]?fiction\b/i,                               genre_id: 'nonfiction' },

  // Broad fiction fallbacks (last resort)
  { match: /\bliterary fiction\b|\bliterature\b/i,               genre_id: 'contemporary_literary' },
  { match: /\bfiction\b|\bnovel\b/i,                            genre_id: 'modern_post2000' },
];


/**
 * Detect the best-matching genre from API subject/category data.
 * 
 * @param {Array<{name: string}>} olSubjects - Open Library subjects array
 * @param {string[]} gbCategories - Google Books categories array
 * @returns {{ genre_id: string, genre_name: string, color: string } | null}
 */
export function detectGenre(olSubjects = [], gbCategories = []) {
  // Build a single searchable string from all subject data
  const subjectNames = olSubjects.map(s => typeof s === 'string' ? s : s.name || '');
  const allTerms = [...subjectNames, ...gbCategories].join(' | ');

  if (!allTerms.trim()) return null;

  for (const rule of GENRE_RULES) {
    if (rule.match.test(allTerms)) {
      const meta = GENRE_META[rule.genre_id];
      if (meta) {
        return {
          genre_id: rule.genre_id,
          genre_name: meta.genre_name,
          color: meta.color,
        };
      }
    }
  }

  return null;
}

/**
 * Get full metadata for a genre_id.
 * @param {string} genreId
 * @returns {{ genre_name: string, color: string } | null}
 */
export function getGenreMeta(genreId) {
  return GENRE_META[genreId] || null;
}
