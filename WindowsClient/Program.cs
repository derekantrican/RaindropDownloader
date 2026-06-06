using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using PocketDownloaderBase;

namespace WindowsClient
{
    class Program
    {
        public class ConsoleItem
        {
            public Item Item { get; set; }
            public int ConsoleLocLeft { get; set; }
            public int ConsoleLocTop { get; set; }
        }

        static async Task Main(string[] args)
        {
            // Prefer test token (simplest auth for personal use)
            string testToken = Environment.GetEnvironmentVariable("RAINDROP_TEST_TOKEN");

            if (!string.IsNullOrEmpty(testToken))
            {
                Downloader.ClientId = "unused";
                Downloader.ClientSecret = "unused";
                await Downloader.AuthRaindrop(testToken);
            }
            else
            {
                // Fall back to full OAuth
                Downloader.ClientId = Environment.GetEnvironmentVariable("RAINDROP_CLIENT_ID");
                Downloader.ClientSecret = Environment.GetEnvironmentVariable("RAINDROP_CLIENT_SECRET");

                if (string.IsNullOrEmpty(Downloader.ClientId) || string.IsNullOrEmpty(Downloader.ClientSecret))
                {
                    Console.WriteLine("Please set RAINDROP_TEST_TOKEN (or RAINDROP_CLIENT_ID + RAINDROP_CLIENT_SECRET).");
                    Console.WriteLine("Get a test token from https://app.raindrop.io/settings/integrations");
                    return;
                }

                string savedToken = Environment.GetEnvironmentVariable("RAINDROP_ACCESS_TOKEN");
                string savedRefresh = Environment.GetEnvironmentVariable("RAINDROP_REFRESH_TOKEN");

                Downloader.AuthBrowserAction = s => Process.Start(new ProcessStartInfo(s) { UseShellExecute = true });
                Downloader.SaveTokensAction = (access, refresh, expiry) =>
                {
                    Console.WriteLine($"\nSave these tokens for future use:");
                    Console.WriteLine($"  RAINDROP_ACCESS_TOKEN={access}");
                    Console.WriteLine($"  RAINDROP_REFRESH_TOKEN={refresh}");
                };

                if (!string.IsNullOrEmpty(savedToken))
                {
                    await Downloader.AuthRaindrop(savedToken, savedRefresh);
                }
                else
                {
                    await Downloader.AuthRaindrop();
                    Console.WriteLine("Enter the authorization code from the redirect URL:");
                    string authCode = Console.ReadLine();
                    await Downloader.CompleteAuth(authCode);
                }
            }

            List<Item> allArticles = await Downloader.GetBookmarks();
            List<Item> selectedArticles = GetSelectionFromList(allArticles);

            Console.WriteLine(); //Line separator

            List<ConsoleItem> consoleItems = ConvertToConsoleItems(selectedArticles);
            int maxLeft = consoleItems.Max(p => p.ConsoleLocLeft);
            consoleItems.ForEach(p => p.ConsoleLocLeft = maxLeft);

            int finalCursorLeft = Console.CursorLeft;
            int finalCursorTop = Console.CursorTop;

            Console.CursorVisible = false;
            List<Task> tasksForDownloads = StartTasks(consoleItems);

            await Task.WhenAll(tasksForDownloads.ToArray());
            Console.CursorVisible = true;
            Console.SetCursorPosition(finalCursorLeft, finalCursorTop);
            Console.WriteLine($"All videos downloaded to {Downloader.DownloadDirectory}");
            Console.WriteLine("Press any key to exit");
            Console.Read();
        }

        public static string GetTitleForDisplay(Item item, bool withQuotes = true)
        {
            string titleToDisplay = item.Title;
            if (titleToDisplay.Length > 50)
                titleToDisplay = titleToDisplay.Substring(0, 50) + "...";

            if (withQuotes)
                titleToDisplay = $"\"{titleToDisplay}\"";

            return titleToDisplay;
        }

        public static List<Item> GetSelectionFromList(List<Item> listToDisplay)
        {
            foreach (Item item in listToDisplay)
                Console.WriteLine("(" + listToDisplay.IndexOf(item) + ") " + GetTitleForDisplay(item, false));

            Console.WriteLine();
            Console.WriteLine("Which # would you like? (you can choose multiple items with commas or ranges eg \"1-3,7,9\")");
            string input = Console.ReadLine();
            input = Regex.Replace(input, @"[^\d-,]", "");

            List<Item> result = new List<Item>();
            foreach (string indexStr in input.Split(','))
            {
                if (Regex.IsMatch(indexStr, @"\d+-\d+"))
                {
                    int startOfRange = Convert.ToInt32(indexStr.Split('-')[0]);
                    int endOfRange = Convert.ToInt32(indexStr.Split('-')[1]);
                    for (int i = startOfRange; i <= endOfRange; i++)
                    {
                        if (i < 0 || i > listToDisplay.Count - 1)
                        {
                            Console.WriteLine("Could not find index " + i);
                            continue;
                        }

                        result.Add(listToDisplay[i]);
                    }
                }
                else if (Regex.IsMatch(indexStr, @"\d+"))
                {
                    int index = Convert.ToInt32(indexStr);
                    if (index < 0 || index > listToDisplay.Count - 1)
                    {
                        Console.WriteLine("Could not find index " + index);
                        continue;
                    }

                    result.Add(listToDisplay[index]);
                }
            }

            return result;
        }

        public static List<ConsoleItem> ConvertToConsoleItems(List<Item> listToConvert)
        {
            List<ConsoleItem> consoleItems = new List<ConsoleItem>();
            foreach (Item item in listToConvert)
            {
                Console.Write($"Downloading {GetTitleForDisplay(item)} ");

                ConsoleItem consoleItem = new ConsoleItem()
                {
                    Item = item,
                    ConsoleLocLeft = Console.CursorLeft,
                    ConsoleLocTop = Console.CursorTop
                };
                consoleItems.Add(consoleItem);

                Console.Write("\n");
            }

            return consoleItems;
        }

        public static List<Task> StartTasks(List<ConsoleItem> itemsToDownload)
        {
            List<Task> progressTasks = new List<Task>();
            foreach (ConsoleItem item in itemsToDownload)
            {
                Task itemTask = DownloadItem(item);
                progressTasks.Add(itemTask);
            }

            return progressTasks;
        }

        public static async Task DownloadItem(ConsoleItem itemToDownload)
        {
            Progress<double> progress = new Progress<double>();
            progress.ProgressChanged += (s, e) => { UpdatePercentange(itemToDownload, Math.Round(e * 100, 1)); };

            await Downloader.DownloadItem(itemToDownload.Item, progress);
        }

        private static object _sync = new object();
        private static void UpdatePercentange(ConsoleItem item, double percentage)
        {
            lock (_sync)
            {
                Console.SetCursorPosition(item.ConsoleLocLeft, item.ConsoleLocTop);
                Console.Write($"({string.Format("{0,5:0.0}", percentage)}%)");
            }
        }
    }
}