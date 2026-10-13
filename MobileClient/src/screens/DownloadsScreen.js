import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
  Pressable,
  ToastAndroid,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '../services/api';
import DownloadService from '../services/download';
import PendingDeletes from '../services/pendingDeletes';
import Logger from '../services/logger';

const VIEW_MODES = [
  { label: 'Tiles', value: 'tile' },
  { label: 'Details', value: 'details' },
];

// yt-dlp runs with --restrict-filenames, so turn "My_Video_Title.mp4" back into "My Video Title"
const displayName = (name) => name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

function Thumbnail({ file, style }) {
  const [uri, setUri] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!file.isAudio) {
      DownloadService.getThumbnail(file.path).then((result) => {
        if (!cancelled) setUri(result);
      });
    }
    return () => { cancelled = true; };
  }, [file.path, file.isAudio]);

  if (uri) {
    return <Image source={{ uri }} style={style} resizeMode="cover" />;
  }
  return (
    <View style={[style, styles.thumbnailPlaceholder]}>
      <Text style={styles.placeholderIcon}>{file.isAudio ? '♪' : '▶'}</Text>
    </View>
  );
}

export default function DownloadsScreen({ navigation }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('tile');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingCount, setPendingCount] = useState(PendingDeletes.count);

  useEffect(() => {
    AsyncStorage.getItem('downloadsViewMode').then((saved) => {
      if (saved) setViewMode(saved);
    });
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      setFiles(await DownloadService.listDownloads());
    } catch (error) {
      Logger.error('Failed to list downloads', error);
      Alert.alert('Error', 'Failed to list downloads: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the screen comes into view (e.g. after downloads finish or returning from the player)
  useFocusEffect(
    useCallback(() => {
      loadFiles();
      PendingDeletes.process();
    }, [loadFiles])
  );

  useEffect(() => PendingDeletes.subscribe(setPendingCount), []);

  const changeViewMode = (mode) => {
    setViewMode(mode);
    AsyncStorage.setItem('downloadsViewMode', mode);
  };

  const openFile = async (file) => {
    try {
      await DownloadService.openFile(file.path);
    } catch (error) {
      Logger.error(`Failed to open "${file.name}"`, error);
      Alert.alert('Error', error.message);
    }
  };

  const deleteFile = async (file, { fromDevice, fromRaindrop }) => {
    setDeleteTarget(null);
    // Raindrop first: if that fails while deleting both, the file is still here to retry with
    if (fromRaindrop) {
      try {
        await ApiService.deleteBookmark(file.raindropId);
      } catch (error) {
        if (!error.isNetworkError) {
          Logger.error(`Failed to delete Raindrop bookmark for "${file.name}"`, error);
          Alert.alert('Error', 'Failed to delete from Raindrop: ' + error.message);
          return;
        }
        // Offline: queue it and carry on as if it succeeded
        await PendingDeletes.enqueue(file.raindropId, displayName(file.name));
        ToastAndroid.show('Offline: will delete from Raindrop when back online', ToastAndroid.LONG);
      }
      await DownloadService.unlinkRaindrop(file.path);
      setFiles((prev) => prev.map((f) => (f.path === file.path ? { ...f, raindropId: null } : f)));
    }
    if (fromDevice) {
      try {
        await DownloadService.deleteFile(file.path);
        setFiles((prev) => prev.filter((f) => f.path !== file.path));
      } catch (error) {
        Logger.error(`Failed to delete "${file.name}"`, error);
        Alert.alert('Error', 'Failed to delete file: ' + error.message);
      }
    }
  };

  const confirmDelete = (file) => setDeleteTarget(file);

  const renderTile = ({ item }) => (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => openFile(item)}
      onLongPress={() => confirmDelete(item)}
    >
      <Thumbnail file={item} style={styles.tileThumbnail} />
      <Text style={styles.tileTitle} numberOfLines={2}>{displayName(item.name)}</Text>
    </TouchableOpacity>
  );

  const renderDetailRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openFile(item)}
      onLongPress={() => confirmDelete(item)}
    >
      <Thumbnail file={item} style={styles.rowThumbnail} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{displayName(item.name)}</Text>
        <Text style={styles.rowMeta}>
          {formatSize(item.size)}
          {item.modified ? `  ·  ${item.modified.toLocaleDateString()}` : ''}
          {`  ·  ${item.name.split('.').pop().toUpperCase()}`}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const isTile = viewMode === 'tile';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Downloads</Text>
      </View>

      <View style={styles.toolbar}>
        <View>
          <Text style={styles.countText}>
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </Text>
          {pendingCount > 0 && (
            <Text style={styles.pendingText}>
              {pendingCount} pending Raindrop {pendingCount === 1 ? 'delete' : 'deletes'}
            </Text>
          )}
        </View>
        <View style={styles.optionRow}>
          {VIEW_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.value}
              style={[styles.optionButton, viewMode === mode.value && styles.optionButtonActive]}
              onPress={() => changeViewMode(mode.value)}
            >
              <Text style={[styles.optionButtonText, viewMode === mode.value && styles.optionButtonTextActive]}>
                {mode.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5c6bc0" style={styles.loader} />
      ) : (
        <FlatList
          // numColumns can't change on the fly, so remount the list when switching views
          key={viewMode}
          data={files}
          numColumns={isTile ? 2 : 1}
          renderItem={isTile ? renderTile : renderDetailRow}
          keyExtractor={(item) => item.path}
          columnWrapperStyle={isTile ? styles.tileRow : undefined}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadFiles(); PendingDeletes.process(); }}
              colors={['#5c6bc0']}
            />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No downloads yet</Text>}
          ListFooterComponent={files.length > 0 ? (
            <Text style={styles.hintText}>Tap to play · Long-press to delete</Text>
          ) : null}
        />
      )}

      {/* Android alerts max out at 3 buttons, so the delete options get their own dialog */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setDeleteTarget(null)}>
          {deleteTarget && (
            <Pressable style={styles.dialog}>
              <Text style={styles.dialogTitle}>Delete</Text>
              <Text style={styles.dialogMessage} numberOfLines={3}>{displayName(deleteTarget.name)}</Text>
              {[
                { label: 'Delete from device', fromDevice: true, fromRaindrop: false },
                { label: 'Delete from Raindrop', fromDevice: false, fromRaindrop: true },
                { label: 'Delete from both', fromDevice: true, fromRaindrop: true },
              ].map((opt) => {
                const disabled = opt.fromRaindrop && !deleteTarget.raindropId;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.dialogButton, disabled && styles.dialogButtonDisabled]}
                    disabled={disabled}
                    onPress={() => deleteFile(deleteTarget, opt)}
                  >
                    <Text style={styles.dialogButtonText}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {!deleteTarget.raindropId && (
                <Text style={styles.dialogNote}>
                  This file isn't linked to a Raindrop bookmark (it may have been downloaded before linking was added, or its bookmark was already deleted).
                </Text>
              )}
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3a3f51' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#4a5068',
  },
  backButton: { color: '#ffffff', fontSize: 16, marginRight: 12 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#e0e0e0' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: { color: '#9e9e9e', fontSize: 13 },
  pendingText: { color: '#ffa726', fontSize: 11, marginTop: 2 },
  optionRow: { flexDirection: 'row', gap: 6 },
  optionButton: {
    backgroundColor: '#4a5068',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#5c6370',
  },
  optionButtonActive: { backgroundColor: '#5c6bc0', borderColor: '#5c6bc0' },
  optionButtonText: { color: '#c0c0c0', fontSize: 13, fontWeight: 'bold' },
  optionButtonTextActive: { color: '#fff' },
  list: { paddingHorizontal: 8, paddingBottom: 30, flexGrow: 1 },
  // Tile view
  tileRow: { gap: 8 },
  tile: {
    flex: 1,
    maxWidth: '50%',
    backgroundColor: '#4a5068',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  tileThumbnail: { width: '100%', aspectRatio: 16 / 9 },
  tileTitle: { color: '#e0e0e0', fontSize: 13, padding: 8 },
  // Details view
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a5068',
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  rowThumbnail: { width: 96, height: 54, borderRadius: 3 },
  rowInfo: { flex: 1, marginLeft: 10 },
  rowTitle: { color: '#e0e0e0', fontSize: 14 },
  rowMeta: { color: '#9e9e9e', fontSize: 12, marginTop: 4 },
  thumbnailPlaceholder: { backgroundColor: '#2c2f3a', justifyContent: 'center', alignItems: 'center' },
  placeholderIcon: { color: '#7986cb', fontSize: 22 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 40 },
  hintText: { color: '#888', fontSize: 11, textAlign: 'center', marginTop: 8 },
  loader: { flex: 1, justifyContent: 'center' },
  // Delete dialog
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: '#4a5068', borderRadius: 8, padding: 16 },
  dialogTitle: { color: '#e0e0e0', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  dialogMessage: { color: '#c0c0c0', fontSize: 14, marginBottom: 14 },
  dialogButton: {
    backgroundColor: '#c62828',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  dialogButtonDisabled: { opacity: 0.35 },
  dialogButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  dialogNote: { color: '#9e9e9e', fontSize: 11, marginBottom: 8 },
  dialogCancel: { paddingVertical: 10, alignItems: 'center' },
  dialogCancelText: { color: '#7986cb', fontSize: 14, fontWeight: 'bold' },
});
