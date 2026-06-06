using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using YoutubeExplode;
using YoutubeExplode.Videos;
using YoutubeExplode.Videos.Streams;

namespace PocketDownloaderBase
{
    public class Downloader
    {
        #region Private Properties
        private static RaindropClient raindropClient;
        #endregion Private Properties


        #region Public Properties
        public static Action<string> AuthBrowserAction { get; set; }
        public static Action<string, string, DateTime> SaveTokensAction { get; set; }
        public static string DownloadDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        public static IProgress<double> TotalProgress { get; set; }
        public static int FailedDownloads { get; set; } = 0;
        public static List<Item> ItemsScheduledForDownload { get; set; } = new List<Item>();
        public static List<FileDownload> FilesDownloading { get; set; } = new List<FileDownload>();

        // Must be set before calling AuthRaindrop
        public static string ClientId { get; set; }
        public static string ClientSecret { get; set; }
        #endregion Public Properties


        #region Private Methods
        private static void UpdateTotalProgress()
        {
            double totalDownloadSeconds = ItemsScheduledForDownload.Sum(p => p.Progress >= 0 ? p.GetOrGenerateVideoInfo().Result.Duration?.TotalSeconds ?? 0 : 0);
            double totalProgress = ItemsScheduledForDownload.Sum(p => p.Progress >= 0 ? p.Progress * ((p.GetOrGenerateVideoInfo().Result.Duration?.TotalSeconds ?? 0) / totalDownloadSeconds) : 0);

            TotalProgress?.Report(totalProgress);
        }

        private static async Task<bool> DownloadWithYouTubeExplode(Item itemToDownload, string targetPath, YoutubeClient client, Progress<double> progress = null)
        {
            FileDownload fileDownload = null;

            try
            {
                if (File.Exists(targetPath))
                    File.Delete(targetPath);

                var videoId = VideoId.Parse(itemToDownload.Bookmark.Link);
                var streamManifest = await client.Videos.Streams.GetManifestAsync(videoId);
                var muxedStreams = streamManifest.GetMuxedStreams().OrderByDescending(s => s.VideoQuality.MaxHeight).ToList();

                foreach (var streamInfo in muxedStreams)
                {
                    try
                    {
                        var stream = await client.Videos.Streams.GetAsync(streamInfo);
                        fileDownload = new FileDownload(stream, targetPath, progress: progress);
                        FilesDownloading.Add(fileDownload);
                        await fileDownload.Start();

                        FilesDownloading.Remove(fileDownload);
                        return true;
                    }
                    catch (Exception)
                    {
                        itemToDownload.Progress = -1;

                        if (fileDownload != null)
                            FilesDownloading.Remove(fileDownload);

                        if (File.Exists(targetPath))
                            File.Delete(targetPath);
                    }
                }
            }
            catch (Exception)
            {
                if (fileDownload != null)
                    FilesDownloading.Remove(fileDownload);

                return false;
            }

            return false;
        }
        #endregion Private Methods


        #region Public Methods
        public static async Task AuthRaindrop(string accessToken = null, string refreshToken = null, DateTime? expiry = null)
        {
            raindropClient = new RaindropClient(ClientId, ClientSecret);

            if (!string.IsNullOrEmpty(accessToken))
            {
                raindropClient.SetTokens(accessToken, refreshToken, expiry);
            }
            else if (AuthBrowserAction != null)
            {
                string authUrl = raindropClient.GetAuthorizationUrl();
                AuthBrowserAction.Invoke(authUrl);

                // The caller must capture the auth code from the redirect and call CompleteAuth
                // This is a placeholder - in practice the UI captures the code
            }
        }

        public static async Task CompleteAuth(string authCode)
        {
            await raindropClient.ExchangeCodeForToken(authCode);
            SaveTokensAction?.Invoke(raindropClient.AccessToken, raindropClient.RefreshToken, raindropClient.TokenExpiry);
        }

        public static async Task<List<Item>> GetBookmarks(DateTime? sinceDate = null)
        {
            var bookmarks = await raindropClient.GetYouTubeBookmarks();

            if (sinceDate != null)
                bookmarks = bookmarks.Where(b => b.LastUpdate >= sinceDate.Value.ToUniversalTime()).ToList();

            return bookmarks.Select(b => new Item(b)).ToList();
        }

        public static async Task DownloadItem(Item itemToDownload, Progress<double> progress = null)
        {
            var client = new YoutubeClient();
            string fileName;

            try
            {
                var videoInfo = await itemToDownload.GetOrGenerateVideoInfo();
                fileName = $"[{videoInfo.Author}] {videoInfo.Title}.mp4";
                fileName = Utilities.RemoveInvalidPathCharacters(fileName);
            }
            catch (Exception)
            {
                fileName = Utilities.RemoveInvalidPathCharacters(itemToDownload.Title + ".mp4");
            }

            string fullTargetPath = Path.Combine(DownloadDirectory, fileName);

            if (progress == null)
            {
                progress = new Progress<double>();
                progress.ProgressChanged += (s, e) => { itemToDownload.Progress = e; UpdateTotalProgress(); };
            }

            bool success = await DownloadWithYouTubeExplode(itemToDownload, fullTargetPath, client, progress);

            if (!success)
                FailedDownloads++;
        }
        #endregion Public Methods
    }
}
