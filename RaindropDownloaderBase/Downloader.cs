using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using YoutubeDLSharp;
using YoutubeDLSharp.Options;

namespace RaindropDownloaderBase
{
    public class Downloader //Todo: should probably rename this class
    {
        #region Private Properties
        private static RaindropClient raindropClient;
        private static YoutubeDL youtubeDL;
        private static readonly SemaphoreSlim initLock = new SemaphoreSlim(1, 1);
        #endregion Private Properties


        #region Public Properties
        public static string DownloadDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        public static int FailedDownloads { get; set; } = 0;
        #endregion Public Properties


        #region Private Methods
        private static async Task<YoutubeDL> EnsureYoutubeDLCore()
        {
            if (youtubeDL != null)
                return youtubeDL;

            await initLock.WaitAsync();
            try
            {
                if (youtubeDL == null)
                {
                    string binDir = Path.Combine(AppContext.BaseDirectory, "yt-dlp-bin");
                    Directory.CreateDirectory(binDir);
                    await Utils.DownloadBinaries(directoryPath: binDir);

                    youtubeDL = new YoutubeDL
                    {
                        YoutubeDLPath = Path.Combine(binDir, Utils.YtDlpBinaryName),
                        FFmpegPath = Path.Combine(binDir, Utils.FfmpegBinaryName),
                        OutputFileTemplate = "[%(uploader)s] %(title)s.%(ext)s"
                    };
                }
            }
            finally
            {
                initLock.Release();
            }

            return youtubeDL;
        }
        #endregion Private Methods


        #region Public Methods
        // Downloads yt-dlp/ffmpeg on first use if needed. Safe to call ahead of time to avoid a silent pause on the first download.
        public static Task<YoutubeDL> EnsureYoutubeDL() => EnsureYoutubeDLCore();

        public static void AuthRaindrop(string testToken)
        {
            raindropClient = new RaindropClient(testToken);
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
            var ytdl = await EnsureYoutubeDLCore();
            ytdl.OutputFolder = DownloadDirectory;

            if (progress == null)
            {
                progress = new Progress<double>();
                progress.ProgressChanged += (s, e) => { itemToDownload.Progress = e; };
            }

            var downloadProgress = new Progress<DownloadProgress>(p => ((IProgress<double>)progress).Report(p.Progress));

            // Progress/Newline: yt-dlp only emits parseable "[download] x%" lines when explicitly asked to (it detects the piped, non-tty stdout otherwise).
            // ExtractorArgs: works around YouTube's JS-runtime-dependent signature extraction (same workaround MobileClient's YtDlpModule uses).
            var options = new OptionSet
            {
                Progress = true,
                Newline = true,
                NoUpdate = true,
                ExtractorArgs = "youtube:player_client=android,web"
            };

            var result = await ytdl.RunVideoDownload(itemToDownload.Bookmark.Link, progress: downloadProgress, overrideOptions: options);

            if (!result.Success)
            {
                itemToDownload.Progress = -1;
                FailedDownloads++;
            }
        }
        #endregion Public Methods
    }
}
