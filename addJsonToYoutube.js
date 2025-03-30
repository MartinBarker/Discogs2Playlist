const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
const express = require('express'); // Add express for hosting
const path = require('path');
require('dotenv').config();

const TOKEN_PATH = 'tokens.json';
const LINKS_JSON_PATH = 'Kevin_McCord_youtube_links.json';

var GCP_CLIENT_ID = process.env.GCP_CLIENT_ID;
var GCP_CLIENT_SECRET = process.env.GCP_CLIENT_SECRET;
var PLAYLIST_ID = process.env.PLAYLIST_ID; // Add PLAYLIST_ID from environment variables

const oauth2Client = new google.auth.OAuth2(
    GCP_CLIENT_ID,
    GCP_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback'
);

const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to load tokens from the JSON file
function loadTokens() {
    try {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
        oauth2Client.setCredentials(tokens);
        console.log('Tokens loaded from file.');
        return true;
    } catch (error) {
        console.log('No tokens found, starting OAuth flow...');
        return false;
    }
}

// Function to save tokens to the JSON file
function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Tokens saved to', TOKEN_PATH);
}

// Load YouTube links from JSON file
function loadYouTubeLinks() {
    console.log('Reading YouTube links from JSON file...');
    if (fs.existsSync(LINKS_JSON_PATH)) {
        try {
            const data = fs.readFileSync(LINKS_JSON_PATH, 'utf-8');
            if (!data.trim()) {
                console.error('Error: JSON file is empty.');
                return [];
            }
            const youtubeLinks = JSON.parse(data);
            const totalUrls = youtubeLinks.reduce((count, release) => count + release.videos.length, 0);
            console.log(`Total number of URLs in JSON file: ${totalUrls}`);
            return youtubeLinks;
        } catch (error) {
            console.error('Error parsing JSON file:', error.message);
            return [];
        }
    }
    console.log('No YouTube links found in the JSON file.');
    return [];
}

// Save updated YouTube links to JSON file
function saveYouTubeLinks(links) {
    fs.writeFileSync(LINKS_JSON_PATH, JSON.stringify(links, null, 2), 'utf-8');
    console.log('YouTube links saved to', LINKS_JSON_PATH);
}

let notFoundErrors = 0;
let otherErrors = {};
let totalRequests = 0;
let totalSuccess = 0;

let uploadedVideoIds = new Set(); // Track successfully uploaded video IDs

// Function to add video to YouTube playlist with exponential backoff for quota errors
async function addVideoToPlaylist(playlistId, videoId) {
    if (uploadedVideoIds.has(videoId)) {
        console.log(`Video ${videoId} is already uploaded. Skipping...`);
        return true;
    }

    totalRequests++;
    let attempt = 0;
    const maxAttempts = 5;
    const baseDelay = 20000; // 20 seconds

    while (attempt < maxAttempts) {
        try {
            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        playlistId: playlistId,
                        resourceId: {
                            kind: 'youtube#video',
                            videoId: videoId
                        }
                    }
                }
            });
            console.log(`Video ${videoId} added to playlist successfully!`);
            totalSuccess++;
            uploadedVideoIds.add(videoId); // Add video ID to the set
            return true;
        } catch (error) {
            console.log('Error:', error);
            if (error.response && error.response.status === 404) {
                notFoundErrors++;
                console.error(`Error adding video ${videoId}: Video not found.`);
                return 404;
            } else if (error.response && error.response.status === 403) {
                attempt++;
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.error(`Quota exceeded. Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                const status = error.response ? error.response.status : 'unknown';
                otherErrors[status] = (otherErrors[status] || 0) + 1;
                console.error(`Error adding video ${videoId}:`, error.message);
                return false;
            }
        }
    }
    return false;
}

// OAuth2 callback route
function startOAuthFlow() {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Ensures we get a refresh token
        scope: ['https://www.googleapis.com/auth/youtube.force-ssl']
    });

    console.log('Please open the following URL in your browser to authenticate:');
    console.log(authUrl);

    // Use dynamic import for the `open` module
    (async () => {
        const open = (await import('open')).default;
        open(authUrl);
    })();
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    try {
        const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(?:embed\/)?(?:v\/)?(?:shorts\/)?([a-zA-Z0-9_-]+)/);
        return match && match[1];
    } catch (error) {
        console.error(`Error extracting video ID from URL ${url}:`, error.message);
        return null;
    }
}

// Process videos and add them to the playlist
async function processVideos(playlistId) {
    const youtubeLinks = loadYouTubeLinks();
    if (youtubeLinks.length === 0) {
        console.log('No YouTube links found in the JSON file.');
        return;
    }
    console.log(`Found ${youtubeLinks.length} url videos in the JSON file.`);
    // Process each release in the JSON file
    for (const release of youtubeLinks) {
        for (const video of release.videos) {
            if (video.uploaded === true || video.uploaded === 404) {
                console.log(`Video ${video.url} already processed with status: ${video.uploaded}`);
                continue;
            }
            const videoId = extractVideoId(video.url);
            if (uploadedVideoIds.has(videoId)) {
                console.log(`Video ${videoId} is already uploaded. Skipping...`);
                video.uploaded = true; // Mark as uploaded in the JSON
                continue;
            }
            console.log(`Adding video ${video.url} / ${videoId} to playlist ${playlistId}...`);
            const result = await addVideoToPlaylist(playlistId, videoId);
            if (result === true) {
                video.uploaded = true;
            } else if (result === 404) {
                video.uploaded = 404;
            }
            saveYouTubeLinks(youtubeLinks);
            console.log(`🎉 JSON file updated for video ${video.url}`);
        }
    }

    console.log(`Number of 404 errors: ${notFoundErrors}`);
    console.log(`Total requests made: ${totalRequests}`);
    console.log(`Total successful responses: ${totalSuccess}`);
    console.log(`Other errors:`, otherErrors);
}

// Prompt user to enter playlist ID and begin processing
function promptForPlaylistId() {
    rl.question('Enter the YouTube playlist ID: ', async (playlistId) => {
        if (!playlistId) {
            console.log('Invalid playlist ID. Please try again.');
            return promptForPlaylistId();
        }

        await processVideos(playlistId);
        rl.close();
    });
}

// Handle the OAuth2 callback
function handleOAuthCallback(req, res) {
    const { code } = req.query;
    if (code) {
        oauth2Client.getToken(code, (err, tokens) => {
            if (err) {
                console.error('Error getting tokens:', err.message);
                res.status(500).send('Authentication failed.');
                return;
            }

            oauth2Client.setCredentials(tokens);
            saveTokens(tokens); // Save tokens after successful authentication
            res.send('Authentication successful! You can close this window and return to the console.');
            if (PLAYLIST_ID) {
                processVideos(PLAYLIST_ID);
            } else {
                promptForPlaylistId();
            }
        });
    } else {
        res.status(400).send('No code found in the request.');
    }
}

// Create an Express server to handle the OAuth2 callback
const app = express();
app.get('/oauth2callback', handleOAuthCallback);
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Start the OAuth flow or use existing tokens
if (loadTokens()) {
    console.log('Using existing tokens for authentication.');
    // If tokens are loaded, use the playlist ID from environment variable or prompt for it
    if (PLAYLIST_ID) {
        processVideos(PLAYLIST_ID);
    } else {
        promptForPlaylistId();
    }
} else {
    console.log('Starting OAuth flow for authentication.');
    startOAuthFlow();
}

// Function to upload video to YouTube (mock implementation)
async function uploadVideo(url) {
  // Simulate video upload
  return new Promise((resolve) => setTimeout(() => resolve(true), 1000));
}

// Function to update JSON file
async function updateJsonFile() {
  const data = JSON.parse(fs.readFileSync(LINKS_JSON_PATH, 'utf8'));

  for (const release of data) {
    for (const video of release.videos) {
      const uploaded = await uploadVideo(video.url);
      if (uploaded) {
        video.uploaded = true;
      }
    }
  }

  fs.writeFileSync(LINKS_JSON_PATH, JSON.stringify(data, null, 2));
}

updateJsonFile().then(() => console.log('JSON file updated successfully.'));

// Function to get the total count of all YouTube URLs and the number of unique URLs
function getTotalAndUniqueUrls(youtubeLinks) {
    let totalUrls = 0;
    const uniqueUrls = new Set();

    for (const release of youtubeLinks) {
        totalUrls += release.videos.length;
        for (const video of release.videos) {
            uniqueUrls.add(video.url);
        }
    }

    console.log(`Total number of YouTube URLs: ${totalUrls}`);
    console.log(`Number of unique YouTube URLs: ${uniqueUrls.size}`);
}

// Example usage
const youtubeLinks = loadYouTubeLinks();
getTotalAndUniqueUrls(youtubeLinks);

