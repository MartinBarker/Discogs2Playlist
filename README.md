### Discogs Artist Credits Release Videos to Playlist
- Take a discogs artist ID as input (ex: '316989'), fetch all youtube videos on all discogs releases, and add them to a youtube playlist

# Roadmap
- This repo can be run locally by following the below instructions, I am working on a web interface version coming soon!

# Instructions to run locally:

1. Set Up Google Cloud Project (GCP)
- Go to the Google Cloud Console.
- Create a new project.
- Enable the YouTube Data API v3 for your project.
- Create OAuth2 credentials with a redirect URI: http://localhost:3000/oauth2callback.
- Add the following scopes:
- https://www.googleapis.com/auth/youtube.force-ssl
- https://www.googleapis.com/auth/youtube
- Create a `.env` file (base it off of the .env-template file I've included in this repo)
- Download the OAuth2 client credentials and add the GCP_CLIENT_ID and GCP_CLIENT_SECRET to the .env file.
```
GCP_CLIENT_ID=
GCP_CLIENT_SECRET=
PLAYLIST_ID=
```

2. Run the following commands to clone and setup this repo
- `git clone https://github.com/MartinBarker/Discogs2Playlist.git`
- `npm i`

3. Fetch all IDs
- Edit discogsArtistYouTubeToJson.js to set the discogs artist id:
`const artistId = '83376'; // Example artist ID`
- You can get a discogs artist id from a url like so:
```
https://www.discogs.com/artist/656-A-Guy-Called-Gerald
Artist id would be "656"
```
- Run `node discogsArtistYouTubeToJson.js` 
- This will create a .json file with every youtube id, such as "JammingGerald_44589_youtube_links.json"

4. Create a YouTube playlist
- Create a playlist, and get the playlist id from the url like so:
```
https://www.youtube.com/playlist?list=PLpQuORMLvnZaEwq6CofOmow8SPCM2LMRM
playlist id is everything after "list=" like so: PLpQuORMLvnZaEwq6CofOmow8SPCM2LMRM
```
- Set the playlist id in the .env file like so:
```
GCP_CLIENT_ID=abc123
GCP_CLIENT_SECRET=abc123
PLAYLIST_ID=PLpQuORMLvnZaEwq6CofOmow8SPCM2LMRM
```

5. Add all youtube videos from the .json file to the yutube playlist:
- Run the script: `node addJsonToYoutube.js`
