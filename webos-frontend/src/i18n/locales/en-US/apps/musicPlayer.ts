const musicPlayer = {
          name: 'Music Player',
          fileAssociations: {
            audio: 'Music Player',
          },
          unknownTrack: 'Unknown Track',
          errors: {
            unplayable: 'Unable to play this audio file',
            playFailed: 'Playback failed',
          },
          empty: {
            noContent: {
              title: 'No music content yet',
              description: 'Click the add-folder button in the top right to scan and build a playlist automatically',
            },
            noTracks: {
              title: 'No playable tracks',
              description: 'There are no audio files in the saved folders, or the file formats are not supported yet. Try refreshing or adding other folders.',
            },
          },
          repeat: {
            none: 'Repeat Off',
            all: 'Repeat All',
            one: 'Repeat One',
          },
          shuffle: {
            on: 'Shuffle On',
            off: 'Shuffle Off',
          },
          playlist: {
            title: 'Playlist ({{count}})',
          },
          savedFolders: {
            title: 'Saved Folders ({{count}})',
            empty: 'No saved folders yet. Click the add-folder button in the top right to start scanning music.',
          },
          actions: {
            refreshFolders: 'Refresh folders',
            addFolder: 'Add folder',
            removeFolder: 'Remove folder',
          },
          folderPicker: {
            empty: 'There are no subfolders in this directory',
            cancel: 'Cancel',
            selectCurrent: 'Select this folder',
          },
          scanning: 'Scanning music files...',
        } as const

export default musicPlayer
