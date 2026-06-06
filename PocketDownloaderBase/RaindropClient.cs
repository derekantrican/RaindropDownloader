using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace PocketDownloaderBase
{
    public class RaindropClient
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private const string BaseUrl = "https://api.raindrop.io/rest/v1";
        private const string AuthUrl = "https://raindrop.io/oauth/authorize";
        private const string TokenUrl = "https://raindrop.io/oauth/access_token";

        private readonly string clientId;
        private readonly string clientSecret;
        private readonly string redirectUri;

        private string accessToken;
        private string refreshToken;
        private DateTime tokenExpiry;

        public RaindropClient(string clientId, string clientSecret, string redirectUri = "https://derekantrican.github.io/authsuccess")
        {
            this.clientId = clientId;
            this.clientSecret = clientSecret;
            this.redirectUri = redirectUri;
        }

        public string GetAuthorizationUrl()
        {
            return $"{AuthUrl}?client_id={clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_type=code";
        }

        public async Task ExchangeCodeForToken(string authCode)
        {
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = authCode,
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["redirect_uri"] = redirectUri
            });

            var response = await httpClient.PostAsync(TokenUrl, content);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var tokenResponse = JsonSerializer.Deserialize<TokenResponse>(json);

            accessToken = tokenResponse.AccessToken;
            refreshToken = tokenResponse.RefreshToken;
            tokenExpiry = DateTime.UtcNow.AddSeconds(tokenResponse.ExpiresIn);
        }

        public void SetTokens(string accessToken, string refreshToken = null, DateTime? expiry = null)
        {
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.tokenExpiry = expiry ?? DateTime.UtcNow.AddDays(14);
        }

        public async Task RefreshAccessToken()
        {
            if (string.IsNullOrEmpty(refreshToken))
                throw new InvalidOperationException("No refresh token available. Re-authentication required.");

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refreshToken,
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret
            });

            var response = await httpClient.PostAsync(TokenUrl, content);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var tokenResponse = JsonSerializer.Deserialize<TokenResponse>(json);

            accessToken = tokenResponse.AccessToken;
            refreshToken = tokenResponse.RefreshToken;
            tokenExpiry = DateTime.UtcNow.AddSeconds(tokenResponse.ExpiresIn);
        }

        private async Task EnsureValidToken()
        {
            if (DateTime.UtcNow >= tokenExpiry.AddMinutes(-5))
                await RefreshAccessToken();
        }

        public async Task<List<RaindropBookmark>> GetYouTubeBookmarks(int collectionId = 0, int page = 0, int perPage = 50)
        {
            await EnsureValidToken();

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
                {
                    await RefreshAccessToken();
                    request = new HttpRequestMessage(HttpMethod.Get, url);
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                    response = await httpClient.SendAsync(request);
                }

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

        public string AccessToken => accessToken;
        public string RefreshToken => refreshToken;
        public DateTime TokenExpiry => tokenExpiry;
    }

    public class TokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; }

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("token_type")]
        public string TokenType { get; set; }
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
