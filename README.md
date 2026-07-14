# RaindropDownloader

A multi-platform application that downloads YouTube videos saved to [Raindrop.io](https://raindrop.io). Available as a Windows console app and a React Native Android app.

## Components

### Windows Client (`WindowsClient/`)
Console app (.NET) that authenticates with Raindrop.io using a test token, fetches YouTube bookmarks, and downloads them using [yt-dlp](https://github.com/yt-dlp/yt-dlp) via the [YoutubeDLSharp](https://github.com/Bluegrams/YoutubeDLSharp) wrapper. The `yt-dlp`/`ffmpeg` binaries are downloaded automatically on first run.

![windows](https://i.imgur.com/x8jzR52.gif)

### Shared Library (`RaindropDownloaderBase/`)
.NET class library containing `RaindropClient`, `Downloader`, and the YouTube download logic used by the Windows client.

### Mobile Client (`MobileClient/`)
React Native Android app that authenticates with Raindrop.io using a test token, lists YouTube bookmarks, and downloads them using [yt-dlp](https://github.com/yt-dlp/yt-dlp) via the [youtubedl-android](https://github.com/yausername/youtubedl-android) native module. See [MobileClient/DEVELOPMENT.md](MobileClient/DEVELOPMENT.md) for the full dev setup.

<img src="https://i.imgur.com/OzbZlLw.gif" width="400">

## Getting a Raindrop.io Test Token

Both clients authenticate with a personal test token rather than a full OAuth flow:

1. Go to https://app.raindrop.io/settings/integrations
2. Create a new app (or use an existing one) and click "Create test token"
3. Windows client: set the `RAINDROP_TEST_TOKEN` environment variable before running
4. Mobile client: paste the token in Settings after installing the app
