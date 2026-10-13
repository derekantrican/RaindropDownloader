import React, { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiService from './src/services/api';
import PendingDeletes from './src/services/pendingDeletes';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;
    // Token has to be set before queued Raindrop deletes can be sent
    loadToken().then(() => { unsubscribe = PendingDeletes.start(); });
    return () => unsubscribe?.();
  }, []);

  const loadToken = async () => {
    const token = await AsyncStorage.getItem('raindrop_test_token');
    if (token) {
      ApiService.setTestToken(token);
    }
    setLoading(false);
  };

  if (loading) return null;

  return (
    <NavigationContainer>
      <StatusBar backgroundColor="#4a5068" barStyle="light-content" translucent={false} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a1a2e' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Downloads" component={DownloadsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
