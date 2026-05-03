import { marked } from 'marked';

// Parse frontmatter from markdown string
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const frontmatter = match[1];
  const content = match[2];
  const meta = {};

  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Parse arrays like [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim());
    }

    meta[key] = value;
  }

  return { meta, content };
}

// Load all markdown posts from src/posts/
const postFiles = import.meta.glob('/src/posts/*.md', { eager: true, query: '?raw', import: 'default' });

const allPosts = Object.entries(postFiles).map(([path, raw]) => {
  const filename = path.split('/').pop().replace('.md', '');
  const { meta, content } = parseFrontmatter(raw);

  return {
    id: filename,
    title: meta.title || filename,
    date: meta.date || '',
    readTime: meta.readTime || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    excerpt: meta.excerpt || '',
    content: content,
    html: marked(content),
  };
});

// Sort by date, newest first
allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

export const posts = allPosts;

export function getPost(id) {
  return allPosts.find(p => p.id === id) || null;
}
