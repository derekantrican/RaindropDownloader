using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using YoutubeExplode;
using YoutubeExplode.Models;

namespace PocketDownloaderBase
{
    public class Item : INotifyPropertyChanged
    {
        #region Private Properties
        private string title = "";
        private bool isChecked;
        private double progress = 0;
        private Video videoInfo;
        #endregion Private Properties


        #region Constructor
        public Item(RaindropBookmark bookmark)
        {
            Bookmark = bookmark;
            Title = bookmark.Title;
        }
        #endregion Constructor


        #region Public Properties
        public RaindropBookmark Bookmark { get; set; }

        public Uri VideoUri => new Uri(Bookmark.Link);

        public string Title
        {
            get { return title; }
            set
            {
                title = value;
                OnPropertyChanged();
            }
        }
        public bool IsChecked
        {
            get { return isChecked; }
            set
            {
                isChecked = value;
                OnPropertyChanged();
            }
        }

        public double Progress
        {
            get { return progress; }
            set
            {
                progress = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(DisplayedProgress));
            }
        }

        public string DisplayedProgress
        {
            get { return this.Progress < 0 ? " ERR" : $"{Math.Round(Progress * 100, 2),5:0.0}%"; }
        }

        public Uri Thumbnail
        {
            get
            {
                if (!string.IsNullOrEmpty(Bookmark.Cover))
                    return new Uri(Bookmark.Cover);

                return null;
            }
        }
        #endregion Public Properties


        #region Private Methods

        #endregion Private Methods


        #region Public Methods
        public async Task<Video> GetOrGenerateVideoInfo()
        {
            if (videoInfo == null)
            {
                YoutubeClient client = new YoutubeClient();
                videoInfo = await client.GetVideoAsync(YoutubeClient.ParseVideoId(Bookmark.Link));
            }

            return videoInfo;
        }
        #endregion Public Methods


        #region Property Changed
        public event PropertyChangedEventHandler PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName]string propertyName = "")
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
        #endregion Property Changed
    }
}
