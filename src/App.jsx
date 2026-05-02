import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity,
  Text, Animated, Platform, Linking, Alert
} from 'react-native';
import HomeScreen     from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { initBridge } from './src/lib/bridge';

const TABS = [
  { key: 'home',     label: '⬡ Projetos' },
  { key: 'settings', label: '⚙ Config'   },
];

function openAllFilesAccess() {
  Alert.alert(
    '📁 Permissão necessária',
    'Para ler seus projetos, o SentriDock precisa de "Acesso a todos os arquivos".\n\n1. Toque em "Abrir configurações"\n2. Procure "Acesso a todos os arquivos" ou "Permissão de arquivos"\n3. Ative para o SentriDock\n4. Volte ao app',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Abrir configurações',
        onPress: () => {
          // Tenta abrir direto na tela de permissão do app
          const pkg = 'com.sentridock.android';
          Linking.openURL(`android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`)
            .catch(() => Linking.openSettings());
        }
      }
    ]
  );
}

export default function App() {
  const [tab,   setTab]   = useState('home');
  const [ready, setReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initBridge().then(() => {
      setReady(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  }, []);

  if (!ready) return (
    <View style={s.splash}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0d13" />
      <Text style={s.splashLogo}>⬡ Sentri<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
      <Text style={s.splashSub}>Iniciando runtime…</Text>
    </View>
  );

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#12151f" />
      <SafeAreaView style={s.root}>
        <View style={s.topbar}>
          <Text style={s.brand}>⬡ Sentri<Text style={{ color: '#00c8e0' }}>Dock</Text></Text>
          <TouchableOpacity onPress={openAllFilesAccess} style={s.permBtn}>
            <Text style={s.permBtnText}>🔑 Permissão</Text>
          </TouchableOpacity>
        </View>
        <View style={s.content}>
          {tab === 'home'     && <HomeScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>
        <View style={s.bottomNav}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[s.navItem, tab === t.key && s.navActive]} onPress={() => setTab(t.key)}>
              <Text style={[s.navLabel, tab === t.key && s.navLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#0b0d13' },
  splash:         { flex: 1, backgroundColor: '#0b0d13', alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashLogo:     { fontSize: 28, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  splashSub:      { fontSize: 12, color: '#3a4260', fontFamily: 'monospace' },
  topbar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 11, backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  brand:          { fontSize: 16, fontWeight: '900', color: '#c8d0e8', letterSpacing: 1 },
  permBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(245,166,35,.5)', backgroundColor: 'rgba(245,166,35,.1)' },
  permBtnText:    { fontSize: 11, color: '#f5a623', fontWeight: '700' },
  content:        { flex: 1 },
  bottomNav:      { flexDirection: 'row', backgroundColor: '#12151f', borderTopWidth: 1, borderTopColor: '#1f2535' },
  navItem:        { flex: 1, paddingVertical: 14, alignItems: 'center' },
  navActive:      { borderTopWidth: 2, borderTopColor: '#00c8e0' },
  navLabel:       { fontSize: 12, color: '#5a6480', fontWeight: '600' },
  navLabelActive: { color: '#00c8e0' },
});
