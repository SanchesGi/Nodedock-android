import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, Switch, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { bridge } from '../lib/bridge';

export default function SettingsScreen() {
  const [enabled,  setEnabled]  = useState(false);
  const [token,    setToken]    = useState('');
  const [chatId,   setChatId]   = useState('');
  const [notify,   setNotify]   = useState({ start: true, stop: true, error: true, tunnel: true });
  const [testing,  setTesting]  = useState(false);
  const [testRes,  setTestRes]  = useState(null); // { ok, error }
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    // Carrega config salva
    const unsub = bridge.onConfig((cfg) => {
      const tg = cfg.telegram || {};
      setEnabled(!!tg.enabled);
      setToken(tg.token   || '');
      setChatId(tg.chatId || '');
      setNotify({ start: true, stop: true, error: true, tunnel: true, ...tg.notify });
    });
    bridge.getConfig();

    const unsubTest = bridge.onTestResult((res) => {
      setTestRes(res);
      setTesting(false);
    });

    return () => { unsub(); unsubTest(); };
  }, []);

  const handleSave = () => {
    bridge.saveConfig({
      telegram: { enabled, token: token.trim(), chatId: chatId.trim(), notify },
    });
    setSaved(true);
    setTestRes(null);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleTest = () => {
    setTesting(true);
    setTestRes(null);
    bridge.testTelegram(token.trim(), chatId.trim());
  };

  const toggleNotify = (key) => setNotify(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* ── Telegram ── */}
      <Text style={styles.sectionTitle}>🤖 Telegram Bot</Text>

      <View style={styles.row}>
        <View>
          <Text style={styles.rowLabel}>Notificações ativas</Text>
          <Text style={styles.rowSub}>Liga/desliga o bot</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: '#2a3148', true: '#29b6f6' }}
          thumbColor={enabled ? '#fff' : '#5a6480'}
        />
      </View>

      <Text style={styles.fieldLabel}>Token do Bot</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2"
        placeholderTextColor="#3a4260"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Chat ID</Text>
      <TextInput
        style={styles.input}
        value={chatId}
        onChangeText={setChatId}
        placeholder="123456789"
        placeholderTextColor="#3a4260"
        keyboardType="numeric"
      />

      {/* Notificações */}
      <Text style={styles.fieldLabel}>Notificar quando:</Text>
      <View style={styles.notifyGrid}>
        {[
          { key: 'start',  label: '🟢 Iniciar' },
          { key: 'stop',   label: '⏹ Parar'   },
          { key: 'error',  label: '🔴 Erro'    },
          { key: 'tunnel', label: '🌐 Túnel'   },
        ].map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.notifyItem, notify[key] && styles.notifyItemActive]}
            onPress={() => toggleNotify(key)}
          >
            <Text style={styles.notifyCheck}>{notify[key] ? '✓' : ' '}</Text>
            <Text style={[styles.notifyLabel, notify[key] && { color: '#c8d0e8' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Teste */}
      <TouchableOpacity
        style={[styles.btnTest, testing && styles.btnTestDisabled]}
        onPress={handleTest}
        disabled={testing}
      >
        {testing
          ? <ActivityIndicator size="small" color="#29b6f6" />
          : <Text style={styles.btnTestText}>📨 Testar Conexão</Text>}
      </TouchableOpacity>

      {testRes && (
        <View style={[styles.testResult, testRes.ok ? styles.testOk : styles.testErr]}>
          <Text style={testRes.ok ? styles.testOkText : styles.testErrText}>
            {testRes.ok ? '✅ Mensagem enviada com sucesso!' : `❌ ${testRes.error}`}
          </Text>
        </View>
      )}

      {/* ── Comandos ── */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>📟 Comandos do Bot</Text>
      <View style={styles.cmdBox}>
        {[
          ['/status',          'status de todos os projetos'],
          ['/list',            'lista os projetos'],
          ['/start <nome>',    'inicia um projeto'],
          ['/stop <nome>',     'para um projeto'],
          ['/tunnel <nome>',   'abre/fecha túnel público'],
          ['/help',            'exibe ajuda'],
        ].map(([cmd, desc]) => (
          <View key={cmd} style={styles.cmdRow}>
            <Text style={styles.cmdName}>{cmd}</Text>
            <Text style={styles.cmdDesc}>{desc}</Text>
          </View>
        ))}
      </View>

      {/* ── Salvar ── */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>💾 Salvar</Text>
      <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
        <Text style={styles.btnSaveText}>Salvar Configurações</Text>
      </TouchableOpacity>

      {saved && <Text style={styles.savedMsg}>✅ Configurações salvas!</Text>}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0b0d13' },
  content: { padding: 18, gap: 10 },

  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: '#3a4260', letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#1f2535', paddingBottom: 8,
  },

  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rowLabel:{ fontSize: 13, color: '#c8d0e8', fontWeight: '600' },
  rowSub:  { fontSize: 10.5, color: '#5a6480', fontFamily: 'monospace' },

  fieldLabel: { fontSize: 10.5, color: '#5a6480', fontFamily: 'monospace', marginBottom: 5, marginTop: 4 },
  input: {
    backgroundColor: '#181c28', borderWidth: 1, borderColor: '#2a3148',
    borderRadius: 8, padding: 11, color: '#c8d0e8',
    fontFamily: 'monospace', fontSize: 12, marginBottom: 4,
  },

  notifyGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  notifyItem:     { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#181c28', flex: 1, minWidth: '45%' },
  notifyItemActive: { borderColor: '#29b6f6', backgroundColor: 'rgba(41,182,246,.08)' },
  notifyCheck:    { fontSize: 12, color: '#29b6f6', width: 14, textAlign: 'center' },
  notifyLabel:    { fontSize: 12, color: '#5a6480', fontFamily: 'monospace' },

  btnTest:         { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(41,182,246,.3)', backgroundColor: 'rgba(41,182,246,.08)', alignItems: 'center', marginTop: 4 },
  btnTestDisabled: { opacity: .5 },
  btnTestText:     { fontSize: 12, color: '#29b6f6', fontWeight: '700' },

  testResult: { padding: 10, borderRadius: 8, borderWidth: 1 },
  testOk:     { backgroundColor: 'rgba(34,211,107,.08)', borderColor: 'rgba(34,211,107,.25)' },
  testErr:    { backgroundColor: 'rgba(255,85,85,.08)',  borderColor: 'rgba(255,85,85,.25)' },
  testOkText: { fontSize: 11, color: '#22d36b', fontFamily: 'monospace' },
  testErrText:{ fontSize: 11, color: '#ff5555', fontFamily: 'monospace' },

  cmdBox: { backgroundColor: '#181c28', borderRadius: 8, borderWidth: 1, borderColor: '#1f2535', padding: 12, gap: 8 },
  cmdRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cmdName:{ fontSize: 11, color: '#29b6f6', fontFamily: 'monospace', width: 130 },
  cmdDesc:{ fontSize: 11, color: '#5a6480', fontFamily: 'monospace', flex: 1 },

  btnSave:     { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,200,224,.3)', backgroundColor: 'rgba(0,200,224,.08)', alignItems: 'center' },
  btnSaveText: { fontSize: 14, color: '#c8d0e8', fontWeight: '900', letterSpacing: .5 },
  savedMsg:    { fontSize: 12, color: '#22d36b', textAlign: 'center', fontFamily: 'monospace' },
});
