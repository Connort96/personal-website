import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

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

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim());
    }
    meta[key] = value;
  }
  return { meta, content };
}

const postsDir = './src/posts';
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

let sql = `\n\n-- 3. Seed existing posts\n`;

for (const file of files) {
  const slug = file.replace('.md', '');
  const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const { meta, content } = parseFrontmatter(raw);
  
  const title = meta.title || slug;
  const excerpt = meta.excerpt || '';
  const html = marked(content).replace(/'/g, "''"); // escape single quotes for SQL
  const publishedAt = meta.date ? new Date(meta.date).toISOString() : new Date().toISOString();
  
  sql += `INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('${slug}', '${title.replace(/'/g, "''")}', '${excerpt.replace(/'/g, "''")}', '${html}', '${publishedAt}') ON CONFLICT (slug) DO NOTHING;\n`;
}

fs.appendFileSync('./blog_migration.sql', sql);
console.log('Seed SQL appended to blog_migration.sql');
