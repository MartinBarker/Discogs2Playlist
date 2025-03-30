const axios = require('axios');
const express = require('express');
const cors = require('cors');
const fs = require('fs'); // Add the fs module to handle file operations
const app = express();

app.use(cors({ origin: '*' }));

// Function to make a Discogs request and handle pagination with exponential backoff
async function makeDiscogsRequest(url) {
    console.log(`makeDiscogsRequest: ${url}`);
    console.log(`pagination = ${PAGINATION_ENABLED}`);
    let allData = [];
    let lastResponse = null; // Variable to store the last response
    let retryCount = 0; // Initialize retry count for exponential backoff

    try {
        while (url) {
            console.log(`Making axios get request for url: ${url}`);
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                lastResponse = response; // Store the last response
                allData = allData.concat(response.data.releases || response.data.videos || []);
                url = PAGINATION_ENABLED && response.data.pagination && response.data.pagination.urls ? response.data.pagination.urls.next || null : null;
                retryCount = 0; // Reset retry count on successful request
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    retryCount++;
                    const waitTime = Math.pow(2, retryCount) * 10000; // Exponential backoff
                    console.error(`Error 429: Too Many Requests. Retrying in ${waitTime / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    console.error('Non-429 error encountered. Terminating script.');
                    process.exit(1); // Terminate the script
                }
            }
        }
    } catch (error) {
        console.error('Error making Discogs request:', error);
        if (lastResponse) {
            console.error('Last response:', lastResponse.data);
        }
    }
    return allData;
}

// Function to fetch release IDs for an artist
async function fetchReleaseIds(artistId) {
    console.log('fetchReleaseIds for artistId:', artistId);
    const url = `${DISCOGS_API_URL}/artists/${artistId}/releases`;
    const releases = await makeDiscogsRequest(url);
    return releases.map(release => {
        if (!release.main_release) {
            return release.id;
        } else {
            return release.main_release;
        }
    });
}

// Function to fetch video IDs for a release
async function fetchVideoIds(releaseId) {
    console.log('fetchVideoIds for releaseId:', releaseId);
    const url = `${DISCOGS_API_URL}/releases/${releaseId}`;
    const videos = await makeDiscogsRequest(url);
    return videos.map(video => ({ url: video.uri }));
}

// Function to fetch artist details (e.g., name)
async function fetchArtistDetails(artistId) {
    console.log('Fetching artist details for artistId:', artistId);
    const url = `${DISCOGS_API_URL}/artists/${artistId}`;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        return response.data.name;
    } catch (error) {
        console.error('Error fetching artist details:', error);
        process.exit(1); // Terminate the script on failure
    }
}

// Save video data to JSON file incrementally
function saveVideoDataIncrementally(filePath, videoData) {
    fs.writeFileSync(filePath, JSON.stringify(videoData, null, 2));
}

// Main function to execute the script
async function main(artistId, playlistId, apiKey, debug = false) {
    const artistName = await fetchArtistDetails(artistId);
    const filePath = `${artistName.replace(/[^a-zA-Z0-9]/g, '_')}_youtube_links.json`;

    let existingVideoData = [];
    if (fs.existsSync(filePath)) {
        existingVideoData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
        saveVideoDataIncrementally(filePath, existingVideoData); // Create the file at the start
    }

    const releaseIds = await fetchReleaseIds(artistId);
    console.log(`${releaseIds.length} Release IDs:`, releaseIds);
    const idsToProcess = debug ? releaseIds.slice(0, 1) : releaseIds;

    for (let i = 0; i < idsToProcess.length; i++) {
        const releaseId = idsToProcess[i];
        console.log(`\n 🎉 Processing release ${i + 1} of ${idsToProcess.length}: ${releaseId} `);

        const existingRelease = existingVideoData.find(release => release.releaseId === releaseId);
        if (existingRelease && existingRelease.complete) {
            console.log(`Release ${releaseId} already processed. Skipping...`);
            continue;
        }

        const videoIds = await fetchVideoIds(releaseId);
        if (existingRelease) {
            existingRelease.videos = videoIds;
            existingRelease.complete = true;
        } else {
            existingVideoData.push({ releaseId, videos: videoIds, complete: true });
        }

        saveVideoDataIncrementally(filePath, existingVideoData); // Save after processing each release
    }

    console.log(`${existingVideoData.length} Releases processed.`);
}

// Replace with actual values before running
const artistId = '83376'; // Example artist ID
const playlistId = 'YOUR_YOUTUBE_PLAYLIST_ID';
const apiKey = 'YOUR_YOUTUBE_API_KEY';
const debug = false; // Set to true to only get videos for the first release ID
const DISCOGS_API_URL = 'https://api.discogs.com';
const USER_AGENT = 'MyDiscogsClient/1.0 +http://mydiscogsclient.org';
const PAGINATION_ENABLED = true; // Global flag for pagination

main(artistId, playlistId, apiKey, debug);

app.listen(3002, () => {
    console.log('Server is running on port 3002');
});
