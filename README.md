# RaindropDownloader

A multi-platform application that downloads YouTube videos saved to [Raindrop.io](https://raindrop.io). Available as a Windows console app and a React Native mobile app, with a Node.js backend for OAuth and YouTube stream resolution.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Mobile Client  │────▶│   Backend    │────▶│  Raindrop.io API │
│  (React Native) │     │  (Express)   │────▶│  YouTube         │
└─────────────────┘     └──────────────┘     └──────────────────┘

┌─────────────────┐     ┌──────────────────┐
│ Windows Client  │────▶│  Raindrop.io API │
│   (.NET 8)      │────▶│  YouTube         │
└─────────────────┘     └──────────────────┘
```

## Components

### Windows Client (`WindowsClient/`)
Console application using .NET 8. Authenticates directly with Raindrop.io, fetches YouTube bookmarks, and downloads them using [YoutubeExplode](https://github.com/Tyrrrz/YoutubeExplode).

### Shared Library (`PocketDownloaderBase/`)
.NET 8 class library containing `RaindropClient`, `Downloader`, and YouTube download logic.

### Backend (`Backend/`)
Express.js server that:
- Handles Raindrop.io OAuth token exchange (keeps `client_secret` server-side)
- Resolves YouTube video stream URLs using `@distube/ytdl-core`
- Serves as the API for the mobile client

### Mobile Client (`MobileClient/`)
React Native app with:
- Raindrop.io OAuth login (via WebView)
- YouTube bookmark listing with selection
- Video download with progress tracking
- WiFi-only download mode
- Pause/stop functionality

## Setup

### Prerequisites
- .NET 8 SDK (for Windows client)
- Node.js 18+ (for backend and mobile)
- React Native CLI + Android SDK (for mobile)

### 1. Register a Raindrop.io App
1. Go to https://app.raindrop.io/settings/integrations
2. Create a new app
3. Set redirect URI to `https://derekantrican.github.io/authsuccess`
4. Note your Client ID and Client Secret

### 2. Backend Setup
```bash
cd Backend
cp .env.example .env
# Edit .env with your Raindrop credentials
npm install
npm start
```

### 3. Windows Client
```bash
# Set environment variables
set RAINDROP_CLIENT_ID=your_id
set RAINDROP_CLIENT_SECRET=your_secret
# Optionally set saved tokens:
# set RAINDROP_ACCESS_TOKEN=...
# set RAINDROP_REFRESH_TOKEN=...

dotnet run --project WindowsClient
```

### 4. Mobile Client
```bash
cd MobileClient
npm install
# Update BASE_URL in src/services/api.js to point to your backend
npx react-native run-android
```

## Migration from Pocket

This project was originally "PocketDownloader" using the Pocket API. Since Pocket has been discontinued, it now uses [Raindrop.io](https://raindrop.io) as the bookmark source. The old Xamarin.Forms Android client has been replaced with React Native.
