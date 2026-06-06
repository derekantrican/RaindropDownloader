using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

namespace PocketDownloaderBase
{
    public class FileDownload
    {
        private volatile bool allowedToRun;
        private Stream sourceStream;
        private string sourceUrl;
        private string destination;
        private bool disposeOnCompletion;
        private int chunkSize;
        private IProgress<double> progress;
        private Lazy<long> contentLength;

        public long BytesWritten { get; private set; }
        public long ContentLength { get { return contentLength.Value; } }
        public bool Done { get { return ContentLength == BytesWritten; } }

        public FileDownload(Stream source, string destination, bool disposeOnCompletion = true, int chunkSizeInBytes = 10000, IProgress<double> progress = null)
        {
            this.allowedToRun = true;
            this.sourceStream = source;
            this.destination = destination;
            this.disposeOnCompletion = disposeOnCompletion;
            this.chunkSize = chunkSizeInBytes;
            this.contentLength = new Lazy<long>(() => GetContentLength());
            this.progress = progress;
            this.BytesWritten = 0;
        }

        public FileDownload(string source, string destination, int chunkSizeInBytes = 10000, IProgress<double> progress = null)
        {
            this.allowedToRun = true;
            this.sourceUrl = source;
            this.destination = destination;
            this.chunkSize = chunkSizeInBytes;
            this.contentLength = new Lazy<long>(() => GetContentLength());
            this.progress = progress;
            this.BytesWritten = 0;
        }

        private long GetContentLength()
        {
            if (sourceStream != null)
                return sourceStream.Length;
            else
            {
                var request = (HttpWebRequest)WebRequest.Create(sourceUrl);
                request.Method = "HEAD";

                using (var response = request.GetResponse())
                    return response.ContentLength;
            }
        }

        private async Task Start(int range)
        {
            if (!allowedToRun)
                throw new InvalidOperationException();

            if (sourceStream != null)
            {
                await DownloadFromStream(sourceStream);

                if (BytesWritten == ContentLength && disposeOnCompletion)
                    sourceStream?.Dispose();
            }
            else
            {
                var request = (HttpWebRequest)WebRequest.Create(sourceUrl);
                request.Method = "GET";
                request.UserAgent = "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.2; .NET CLR 1.0.3705;)";
                request.AddRange(range);

                using (var response = await request.GetResponseAsync())
                {
                    using (var responseStream = response.GetResponseStream())
                    {
                        await DownloadFromStream(responseStream);
                    }
                }
            }
        }

        private async Task DownloadFromStream(Stream stream)
        {
            using (var fs = new FileStream(destination, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            {
                while (BytesWritten < ContentLength)
                {
                    if (!allowedToRun)
                    {
                        await Task.Delay(100);
                        continue;
                    }

                    var buffer = new byte[chunkSize];
                    var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);

                    if (bytesRead == 0)
                        break;

                    await fs.WriteAsync(buffer, 0, bytesRead);
                    BytesWritten += bytesRead;
                    progress?.Report((double)BytesWritten / ContentLength);
                }

                await fs.FlushAsync();
            }
        }

        public Task Start()
        {
            allowedToRun = true;
            return Start(0);
        }

        public void Resume()
        {
            allowedToRun = true;
        }

        public void Pause()
        {
            allowedToRun = false;
        }
    }
}
