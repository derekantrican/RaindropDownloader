import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Linking,
  ScrollView,
  Clipboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from '../services/api';
import Logger from '../services/logger';

export default function SettingsScreen({ navigation }) {
  const [wifiOnly, setWifiOnly] = useState(true);
  const [chunkSize, setChunkSize] = useState(3);
  const [testToken, setTestToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadSettings();
    setLogs(Logger.getLogs());
    const unsub = Logger.subscribe(setLogs);
    return unsub;
  }, []);

  const loadSettings = async () => {
    const saved = await AsyncStorage.getItem('settings');
    if (saved) {
      const settings = JSON.parse(saved);
      setWifiOnly(settings.wifiOnly ?? true);
      setChunkSize(settings.chunkSize ?? 3);
    }

    const token = await AsyncStorage.getItem('raindrop_test_token');
    if (token) {
      setTestToken(token);
      setTokenSaved(true);
      ApiService.setTestToken(token);
    }
  };

  const saveSettings = async (key, value) => {
    const saved = await AsyncStorage.getItem('settings');
    const settings = saved ? JSON.parse(saved) : {};
    settings[key] = value;
    await AsyncStorage.setItem('settings', JSON.stringify(settings));
  };

  const saveToken = async () => {
    if (!testToken.trim()) {
      Alert.alert('Error', 'Please enter a test token');
      return;
    }
    await AsyncStorage.setItem('raindrop_test_token', testToken.trim());
    ApiService.setTestToken(testToken.trim());
    setTokenSaved(true);
    Logger.log('Test token saved');
    Alert.alert('Saved', 'Raindrop test token saved successfully');
  };

  const clearToken = async () => {
    await AsyncStorage.removeItem('raindrop_test_token');
    setTestToken('');
    setTokenSaved(false);
    ApiService.setTestToken(null);
  };

  const getLogColor = (level) => {
    switch (level) {
      case 'ERROR': return '#ff5252';
      case 'WARN': return '#ffab40';
      default: return '#a5d6a7';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Settings</Text>
      </View>

      {/* Raindrop Token Section */}
      <Text style={styles.sectionTitle}>Raindrop.io Test Token</Text>
      <View style={styles.tokenSection}>
        <TextInput
          style={styles.tokenInput}
          value={testToken}
          onChangeText={(val) => { setTestToken(val); setTokenSaved(false); }}
          placeholder="Paste your test token here"
          placeholderTextColor="#666"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.tokenButtons}>
          <TouchableOpacity style={styles.saveButton} onPress={saveToken}>
            <Text style={styles.buttonText}>{tokenSaved ? '✓ Saved' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={clearToken}>
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://app.raindrop.io/settings/integrations')}
        >
          <Text style={styles.helpLink}>Get token from Raindrop.io →</Text>
        </TouchableOpacity>
      </View>

      {/* Download Settings */}
      <Text style={styles.sectionTitle}>Downloads</Text>
      <View style={styles.setting}>
        <Text style={styles.label}>Download over WiFi only</Text>
        <Switch
          value={wifiOnly}
          onValueChange={(val) => {
            setWifiOnly(val);
            saveSettings('wifiOnly', val);
          }}
          trackColor={{ true: '#5c6bc0' }}
        />
      </View>

      <View style={styles.setting}>
        <Text style={styles.label}>Simultaneous downloads</Text>
        <View style={styles.chunkControls}>
          <TouchableOpacity
            style={styles.chunkButton}
            onPress={() => {
              const val = Math.max(1, chunkSize - 1);
              setChunkSize(val);
              saveSettings('chunkSize', val);
            }}
          >
            <Text style={styles.chunkButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.chunkValue}>{chunkSize}</Text>
          <TouchableOpacity
            style={styles.chunkButton}
            onPress={() => {
              const val = Math.min(10, chunkSize + 1);
              setChunkSize(val);
              saveSettings('chunkSize', val);
            }}
          >
            <Text style={styles.chunkButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Log Box */}
      <View style={styles.logHeader}>
        <Text style={styles.sectionTitle}>Log</Text>
        <View style={styles.logActions}>
          <TouchableOpacity onPress={() => {
            const text = logs.map((e) => `[${e.timestamp}] ${e.level}: ${e.message}`).join('\n');
            Clipboard.setString(text);
            Alert.alert('Copied', 'Log copied to clipboard');
          }}>
            <Text style={styles.logActionText}>Copy All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Logger.clear()}>
            <Text style={styles.logActionText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {logs.length === 0 && <Text style={styles.logEmpty}>No log entries yet</Text>}
        <Text selectable style={styles.logText}>
          {logs.map((entry) => `[${entry.timestamp}] ${entry.level}: ${entry.message}`).join('\n')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3a3f51', padding: 16, paddingTop: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backButton: { color: '#7986cb', fontSize: 16, marginRight: 12 },
  header: { fontSize: 22, fontWeight: 'bold', color: '#e0e0e0' },
  sectionTitle: { fontSize: 14, color: '#9e9e9e', marginBottom: 6, marginTop: 12, textTransform: 'uppercase' },
  tokenSection: {
    backgroundColor: '#4a5068',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  tokenInput: {
    backgroundColor: '#2c2f3a',
    color: '#fff',
    padding: 10,
    borderRadius: 4,
    fontSize: 14,
    marginBottom: 10,
  },
  tokenButtons: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  saveButton: { flex: 1, backgroundColor: '#5c6bc0', padding: 10, borderRadius: 4, alignItems: 'center' },
  clearButton: { backgroundColor: '#4a5068', borderWidth: 1, borderColor: '#7986cb', padding: 10, borderRadius: 4, paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  helpLink: { color: '#7986cb', fontSize: 13 },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#4a5068',
    padding: 14,
    borderRadius: 6,
    marginBottom: 8,
  },
  label: { color: '#e0e0e0', fontSize: 15 },
  chunkControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chunkButton: {
    width: 30,
    height: 30,
    backgroundColor: '#5c6bc0',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chunkButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chunkValue: { color: '#fff', fontSize: 18, minWidth: 24, textAlign: 'center' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  logActions: { flexDirection: 'row', gap: 16 },
  logActionText: { color: '#7986cb', fontSize: 13 },
  logBox: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  logContent: { paddingBottom: 8 },
  logEmpty: { color: '#666', fontSize: 12, fontStyle: 'italic' },
  logText: { fontSize: 11, fontFamily: 'monospace', color: '#a5d6a7' },
});

