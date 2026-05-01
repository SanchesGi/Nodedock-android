import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, StatusBar, StyleSheet, View,
  TouchableOpacity, Text, Animated,
} from 'react-native';
import HomeScreen    from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { initBridge } from './src/lib/bridge';

const TABS = [
  { key: 'home',     label: '⬡ Projetos' },
  { key: 'settings', label: '⚙ Config'   },
];

export default function App() {
  const [tab,      setTab]      = useState('home');
  const [ready,    setReady]    = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initBridge().then(() => {
      setReady(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  }, []);

  if (!ready) return (
    <View style={styles.splash}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0d13" />
      <Text style={styles.splashLogo}>⬡ Node<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
      <Text style={styles.splashSub}>Iniciando runtime…</Text>
    </View>
  );

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#12151f" />
      <SafeAreaView style={styles.root}>

        {/* Topbar */}
        <View style={styles.topbar}>
          <Text style={styles.brand}>⬡ Node<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
          <Text style={styles.tagline}>project manager</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {tab === 'home'     && <HomeScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>

        {/* Bottom nav */}
        <View style={styles.bottomNav}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.navItem, tab === t.key && styles.navItemActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, tab === t.key && styles.navLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0b0d13' },
  splash:  { flex: 1, backgroundColor: '#0b0d13', alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashLogo: { fontSize: 28, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  splashSub:  { fontSize: 12, color: '#3a4260', fontFamily: 'monospace' },

  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: '#12151f',
    borderBottomWidth: 1, borderBottomColor: '#1f2535',
  },
  brand:   { fontSize: 16, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  tagline: { fontSize: 10, color: '#3a4260', fontFamily: 'monospace',
             borderWidth: 1, borderColor: '#2a3148', borderRadius: 10,
             paddingHorizontal: 8, paddingVertical: 2 },

  content: { flex: 1 },

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#12151f',
    borderTopWidth: 1, borderTopColor: '#1f2535',
  },
  navItem: {
    flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  navItemActive: {
    borderTopWidth: 2, borderTopColor: '#00c8e0',
  },
  navLabel: { fontSize: 12, color: '#5a6480', fontWeight: '600' },
  navLabelActive: { color: '#00c8e0' },
});
