using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace RaindropDownloaderBase
{
    public class RaindropClient
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private const string BaseUrl = "https://api.raindrop.io/rest/v1";

        private readonly string accessToken;

        public RaindropClient(string accessToken)
        {
            this.accessToken = accessToken;
        }

        public async Task<List<RaindropBookmark>> GetYouTubeBookmarks(int collectionId = 0, int page = 0, int perPage = 50)
        {
            var allBookmarks = new List<RaindropBookmark>();
            int currentPage = page;
            bool hasMore = true;

            while (hasMore)
            {
                var url = $"{BaseUrl}/raindrops/{collectionId}?search=%5B%7B%22key%22%3A%22link%22%2C%22val%22%3A%22youtu%22%7D%5D&page={currentPage}&perpage={perPage}";

                var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

                var response = await httpClient.SendAsync(request);

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                    throw new InvalidOperationException("Test token is invalid or expired");

                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<RaindropListResponse>(json);

                if (result.Items == null || result.Items.Count == 0)
                    break;

                // Filter to actual YouTube URLs by host
                var youtubeItems = result.Items.Where(IsYouTubeUrl).ToList();
                allBookmarks.AddRange(youtubeItems);

                hasMore = result.Items.Count == perPage;
                currentPage++;
            }

            return allBookmarks;
        }

        private static bool IsYouTubeUrl(RaindropBookmark bookmark)
        {
            if (string.IsNullOrEmpty(bookmark.Link))
                return false;

            try
            {
                var uri = new Uri(bookmark.Link);
                var host = uri.Host.ToLowerInvariant();
                return host == "youtube.com" ||
                       host == "www.youtube.com" ||
                       host == "m.youtube.com" ||
                       host == "music.youtube.com" ||
                       host == "youtu.be";
            }
            catch
            {
                return false;
            }
        }
    }

    public class RaindropBookmark
    {
        [JsonPropertyName("_id")]
        public long Id { get; set; }

        [JsonPropertyName("title")]
        public string Title { get; set; }

        [JsonPropertyName("link")]
        public string Link { get; set; }

        [JsonPropertyName("excerpt")]
        public string Excerpt { get; set; }

        [JsonPropertyName("cover")]
        public string Cover { get; set; }

        [JsonPropertyName("created")]
        public DateTime Created { get; set; }

        [JsonPropertyName("lastUpdate")]
        public DateTime LastUpdate { get; set; }

        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; }
    }

    public class RaindropListResponse
    {
        [JsonPropertyName("result")]
        public bool Result { get; set; }

        [JsonPropertyName("items")]
        public List<RaindropBookmark> Items { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }
    }
}
