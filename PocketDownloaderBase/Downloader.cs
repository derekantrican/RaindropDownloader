using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using YoutubeExplode;
using YoutubeExplode.Models;
using YoutubeExplode.Models.MediaStreams;

namespace PocketDownloaderBase
{
    public class Downloader //Todo: should probably rename this class
    {
        #region Private Properties
        private static RaindropClient raindropClient;
        #endregion Private Properties


        #region Public Properties
        public static string DownloadDirectory { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        public static IProgress<double> TotalProgress { get; set; }
        public static int FailedDownloads { get; set; } = 0;
        public static List<Item> ItemsScheduledForDownload { get; set; } = new List<Item>();
        public static List<FileDownload> FilesDownloading { get; set; } = new List<FileDownload>();
        #endregion Public Properties


        #region Private Methods
        private static void UpdateTotalProgress()
        {
            double totalDownloadSeconds = ItemsScheduledForDownload.Sum(p => p.Progress >= 0 ? p.GetOrGenerateVideoInfo().Result.Duration.TotalSeconds : 0);
            double totalProgress = ItemsScheduledForDownload.Sum(p => p.Progress >= 0 ? p.Progress * (p.GetOrGenerateVideoInfo().Result.Duration.TotalSeconds / totalDownloadSeconds) : 0);

            TotalProgress?.Report(totalProgress);
        }

        private static async Task<bool> DownloadWithYouTubeExplode(Item itemToDownload, string targetPath, YoutubeClient client, Progress<double> progress = null)
        {
            FileDownload fileDownload = null;

            try
            {
                if (File.Exists(targetPath))
                    File.Delete(targetPath);

                string youTubeVideoId = YoutubeClient.ParseVideoId(itemToDownload.Bookmark.Link);
                Video videoInfo = await itemToDownload.GetOrGenerateVideoInfo();
                MediaStreamInfoSet streamInfoSet = await client.GetVideoMediaStreamInfosAsync(youTubeVideoId);
                List<MuxedStreamInfo> qualities = streamInfoSet.Muxed.OrderByDescending(s => s.VideoQuality).ToList();

                //Loop through qualities highest to lowest (in case high qualities fail) as suggested in https://github.com/Tyrrrz/YoutubeExplode/issues/219
                foreach (MuxedStreamInfo videoQuality in qualities)
                {
                    try
                    {
                        //using (MediaStream stream = await client.GetMediaStreamAsync(videoQuality).ConfigureAwait(false))
                        {
                            fileDownload = new FileDownload(client, videoQuality, targetPath, progress);
                            FilesDownloading.Add(fileDownload);
                            await fileDownload.Start();
                        }

                        FilesDownloading.Remove(fileDownload); //Remove download once it is completed

                        return true;
                    }
                    catch (Exception ex)  //Catch errors caused by https://github.com/Tyrrrz/YoutubeExplode/issues/219
                    {
                        itemToDownload.Progress = -1;

                        if (fileDownload != null)
                            FilesDownloading.Remove(fileDownload);

                        if (File.Exists(targetPath))
                            File.Delete(targetPath);
                    }
                }
            }
            catch (Exception ex)
            {
                if (fileDownload != null)
                    FilesDownloading.Remove(fileDownload);

                return false;
            }

            return false;
        }

        private static async Task<bool> DownloadAlternate(Item itemToDownload, string targetPath, Progress<double> progress = null)
        {
            FileDownload fileDownload = null;

            try
            {
                if (File.Exists(targetPath))
                    File.Delete(targetPath);

                string youTubeVideoId = YoutubeClient.ParseVideoId(itemToDownload.Bookmark.Link);

                string saveMediaURL = $"https://dev.invidio.us/watch?v={youTubeVideoId}";
                using (WebClient client = new WebClient())
                {
                    client.Headers.Add("user-agent", "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.2; .NET CLR 1.0.3705;)");
                    string html = client.DownloadString(saveMediaURL);
                    string videoSources = Regex.Match(html, @"<source.*>").Value;
                    string downloadURLWithHighestQuality = "https://www.invidio.us" + Regex.Match(videoSources, @"src=""([^""]*)""").Groups[1].Value;
                    downloadURLWithHighestQuality = Utilities.GetRedirectURL(downloadURLWithHighestQuality);

                    fileDownload = new FileDownload(downloadURLWithHighestQuality, targetPath, progress: progress);
                    FilesDownloading.Add(fileDownload);
                    await fileDownload.Start();
                }

                FilesDownloading.Remove(fileDownload); //Remove download once it is completed
                return true;
            }
            catch (Exception ex)
            {
                itemToDownload.Progress = -1;

                if (fileDownload != null)
                    FilesDownloading.Remove(fileDownload);

                if (File.Exists(targetPath))
                    File.Delete(targetPath);
            }

            return false;
        }
        #endregion Private Methods


        #region Public Methods
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
            //Generate download path
            YoutubeClient client = new YoutubeClient();
            string fileName;

            try
            {
                Video videoInfo = await itemToDownload.GetOrGenerateVideoInfo();
                fileName = $"[{videoInfo.Author}] {videoInfo.Title}.mp4";
                fileName = Utilities.RemoveInvalidPathCharacters(fileName);
            }
            catch (Exception ex)
            {
                fileName = Utilities.RemoveInvalidPathCharacters(itemToDownload.Title + ".mp4");
            }

            string fullTargetPath = Path.Combine(DownloadDirectory, fileName);

            if (progress == null)
            {
                progress = new Progress<double>();
                progress.ProgressChanged += (s, e) => { itemToDownload.Progress = e; UpdateTotalProgress(); };
            }

            //Download video
            bool success = await DownloadWithYouTubeExplode(itemToDownload, fullTargetPath, client, progress);
            if (!success)
            {
                itemToDownload.Progress = -1;
                success = await DownloadAlternate(itemToDownload, fullTargetPath, progress);
            }

            if (!success)
                FailedDownloads++;
        }
        #endregion Public Methods
    }
}
