import http from 'http';
import https from 'https';
import { exec } from 'child_process';
import { URLSearchParams } from 'url';

const CLIENT_ID = '05756ff4d93044d2a7b0048ce8942517';
const CLIENT_SECRET = '4a9603a630eb408f99e71700c8056efb';
const REDIRECT_URI = 'http://localhost:8888/callback';
const PORT = 8888;

const SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'playlist-read-private'
].join(' ');

const authUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  scope: SCOPES,
  redirect_uri: REDIRECT_URI,
}).toString();

console.log('\n--- SPOTIFY AUTHENTICATION SETUP ---');
console.log('1. Open this URL in your browser to authorize your app:');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n2. Waiting for you to authorize...');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    
    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Success!</h1><p>You can close this window and return to your terminal.</p>');
      
      console.log('3. Received authorization code. Exchanging for refresh token...');
      
      const authOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        }
      };

      const body = new URLSearchParams({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }).toString();

      const request = https.request('https://accounts.spotify.com/api/token', authOptions, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          const result = JSON.parse(data);
          if (result.refresh_token) {
            console.log('\n\x1b[32m--- REFRESH TOKEN GENERATED ---\x1b[0m');
            console.log('\x1b[1m%s\x1b[0m', result.refresh_token);
            console.log('\n--- COPY AND RUN THIS COMMAND TO FIX SUPABASE ---');
            console.log(`\x1b[33msupabase secrets set SPOTIFY_CLIENT_ID=${CLIENT_ID} SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET} SPOTIFY_REFRESH_TOKEN=${result.refresh_token}\x1b[0m\n`);
            process.exit(0);
          } else {
            console.error('Error getting refresh token:', result);
            process.exit(1);
          }
        });
      });

      request.write(body);
      request.end();
    }
  }
}).listen(PORT);
