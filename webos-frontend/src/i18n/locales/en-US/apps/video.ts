const video = {
          name: 'Video Player',
          fileAssociations: {
            video: 'Video Player',
            playlist: 'Playlist',
          },
          player: {
            loading: 'Loading...',
            fallbackTitle: 'Video',
            customSkin: {
              errorTitle: 'Something went wrong.',
              errorDescription: 'An error occurred while trying to play the video. Please try again.',
              replay: 'Replay',
              play: 'Play',
              pause: 'Pause',
              disableCaptions: 'Disable captions',
              enableCaptions: 'Enable captions',
              exitPictureInPicture: 'Exit picture-in-picture',
              enterPictureInPicture: 'Enter picture-in-picture',
              exitFullscreen: 'Exit fullscreen',
              enterFullscreen: 'Enter fullscreen',
              seekBackward: 'Seek backward {{seconds}} seconds',
              seekForward: 'Seek forward {{seconds}} seconds',
              togglePlaybackRate: 'Toggle playback rate',
            },
            errors: {
              resolveFailed: 'Unable to resolve video URL',
              invalidUrl: 'Invalid video URL',
            },
            playlist: {
              button: 'Episode List',
              episodes: 'Episodes · {{count}}',
              nowPlaying: 'Now Playing · {{label}}',
            },
          },
          playlist: {
            channelFallback: 'Channel {{count}}',
            parseFailed: 'Failed to parse playlist file',
          },
        } as const

export default video
