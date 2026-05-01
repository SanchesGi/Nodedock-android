import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Alert, Linking, ToastAndroid,
  Clipboard,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { bridge } from '../lib/bridge';

// ── Paleta de cores por projeto ───────────────────────────────
const PALETTE = [
  '#00c8e0', '#f5a623', '#22d36b',
  '#7c8ff5', '#f572c0', '#ff7744',
];

const STATUS_LABELS = {
  stopped:  'Parado',
  starting: 'Iniciando…',
  running:  'Rodando',
  error:    'Erro',
  missing:  'Não encontrado',
};

const STATUS_COLORS = {
  stopped:  '#5a6480',
  starting: '#7c8ff5',
  running:  '#22d36b',
  error:    '#ff5555',
  missing:  '#f5a623',
};

// ── Tela principal ────────────────────────────────────────────
export default function HomeScreen() {
  const [projects,     setProjects]     = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [selectedLog,  setSelectedLog]  = useState('all');
  const [refreshing,   setRefreshing]   = useState(false);
  const [projectsDir,  setProjectsDir]  = useState(null);
  const [tunnelMap,    setTunnelMap]    = useState({}); // id → { status, url }
  const logsRef  = useRef([]);
  const scrollRef = useRef(null);

  // ── Listeners do Node.js ──────────────────────────────────
  useEffect(() => {
    const unsubs = [
      bridge.onProjectsList((list) => {
        setProjects(list);
        setRefreshing(false);
      }),

      bridge.onServiceState(({ id, status }) => {
        setProjects(prev =>
          prev.map(p => p.id === id ? { ...p, status } : p)
        );
      }),

      bridge.onLog(({ id, text, type }) => {
        const lines = text.split('\n').filter(l => l.trim());
        const now   = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        const newEntries = lines.map((line, i) => ({
          key:  `${Date.now()}-${i}`,
          id, text: line, type, time: now,
        }));
        logsRef.current = [...logsRef.current.slice(-300), ...newEntries];
        setLogs([...logsRef.current]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }),

      bridge.onTunnelState(({ id, status, url }) => {
        setTunnelMap(prev => ({ ...prev, [id]: { status, url } }));
        if (status === 'open' && url) {
          ToastAndroid.show(`🌐 Túnel aberto: ${url}`, ToastAndroid.LONG);
        }
      }),
    ];

    bridge.refresh();

    return () => unsubs.forEach(fn => fn());
  }, []);

  // ── Selecionar pasta de projetos ─────────────────────────
  const pickDirectory = async () => {
    try {
      const res = await DocumentPicker.pickDirectory();
      const dir = res.uri;
      setProjectsDir(dir);
      bridge.setProjectsDir(dir);
      setTimeout(() => bridge.refresh(), 500);
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) {
        Alert.alert('Erro', 'Não foi possível seleccionar a pasta.');
      }
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    bridge.refresh();
  }, []);

  // ── Log filtrado ─────────────────────────────────────────
  const filteredLogs = selectedLog === 'all'
    ? logs
    : logs.filter(l => l.id === selectedLog);

  // ── Render de card de projeto ────────────────────────────
  const renderProject = ({ item: p, index }) => {
    const color    = PALETTE[index % PALETTE.length];
    const tunnel   = tunnelMap[p.id] || {};
    const running  = p.status === 'running';
    const starting = p.status === 'starting';
    const missing  = p.status === 'missing';

    return (
      <View style={[styles.card, running && { shadowColor: color, shadowOpacity: .4, shadowRadius: 12, elevation: 8 }]}>
        {/* Barra colorida no topo */}
        <View style={[styles.cardAccent, { backgroundColor: color }]} />

        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardMeta}>
            <Text style={styles.cardName} numberOfLines={1}>{p.name}</Text>
            <View style={styles.cardSubRow}>
              <View style={[styles.portPill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                <Text style={[styles.portPillText, { color }]}>:{p.port}</Text>
              </View>
              <Text style={styles.cardDesc} numberOfLines={1}>
                {p.description || p.folderName + '/'}
              </Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[p.status] + '22', borderColor: STATUS_COLORS[p.status] + '55' }]}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLORS[p.status] }]} />
            <Text style={[styles.badgeText, { color: STATUS_COLORS[p.status] }]}>
              {STATUS_LABELS[p.status] || p.status}
            </Text>
          </View>
        </View>

        {/* Aviso pasta ausente */}
        {missing && (
          <View style={styles.missingWarn}>
            <Text style={styles.missingText}>⚠️ Pasta não encontrada: {p.folderName}/</Text>
          </View>
        )}

        {/* Tunnel URL */}
        {tunnel.status === 'open' && tunnel.url && (
          <TouchableOpacity
            style={styles.tunnelBar}
            onPress={() => {
              Clipboard.setString(tunnel.url);
              ToastAndroid.show('URL copiada!', ToastAndroid.SHORT);
            }}
          >
            <Text style={styles.tunnelUrl} numberOfLines={1}>🌐 {tunnel.url}</Text>
            <Text style={styles.tunnelCopy}>⎘</Text>
          </TouchableOpacity>
        )}

        {tunnel.status === 'opening' && (
          <View style={styles.tunnelOpening}>
            <Text style={styles.tunnelOpeningText}>🌐 Abrindo túnel…</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.btnAction, styles.btnStart, (running || starting || missing) && styles.btnDisabled]}
            onPress={() => bridge.startService(p.id)}
            disabled={running || starting || missing}
          >
            <Text style={[styles.btnActionText, (running || starting || missing) && styles.btnDisabledText]}>▶ Iniciar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAction, styles.btnStop, (!running && !starting) && styles.btnDisabled]}
            onPress={() => bridge.stopService(p.id)}
            disabled={!running && !starting}
          >
            <Text style={[styles.btnActionText, (!running && !starting) && styles.btnDisabledText]}>⏹ Parar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnIcon, !running && styles.btnDisabled]}
            onPress={() => Linking.openURL(`http://127.0.0.1:${p.port}`)}
            disabled={!running}
          >
            <Text style={[styles.btnIconText, !running && styles.btnDisabledText]}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnIcon, styles.btnTunnel,
              tunnel.status === 'open'    && styles.btnTunnelActive,
              tunnel.status === 'opening' && styles.btnTunnelOpening,
              missing && styles.btnDisabled,
            ]}
            onPress={() => tunnel.status === 'open' ? bridge.closeTunnel(p.id) : bridge.openTunnel(p.id)}
            disabled={missing}
          >
            <Text style={styles.btnIconText}>🌐</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>

      {/* Barra de diretório */}
      <View style={styles.dirBar}>
        <Text style={styles.dirLabel} numberOfLines={1}>
          {projectsDir ? `📁 ${projectsDir}` : '📁 Nenhuma pasta selecionada'}
        </Text>
        <TouchableOpacity style={styles.btnDir} onPress={pickDirectory}>
          <Text style={styles.btnDirText}>Selecionar</Text>
        </TouchableOpacity>
      </View>

      {/* Ações globais */}
      <View style={styles.globalActions}>
        <TouchableOpacity style={styles.btnGlobal} onPress={() => bridge.startAll()}>
          <Text style={styles.btnGlobalText}>▶▶ Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnGlobal, styles.btnGlobalDanger]} onPress={() => bridge.stopAll()}>
          <Text style={[styles.btnGlobalText, { color: '#ff5555' }]}>⏹ Parar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGlobal} onPress={onRefresh}>
          <Text style={styles.btnGlobalText}>↻ Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de projetos */}
      <FlatList
        data={projects}
        keyExtractor={p => p.id}
        renderItem={renderProject}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c8e0" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIco}>📦</Text>
            <Text style={styles.emptyText}>
              {projectsDir
                ? 'Nenhum projeto Node.js encontrado.\nVerifique se as pastas têm package.json.'
                : 'Selecione a pasta com seus projetos acima.'}
            </Text>
          </View>
        }
      />

      {/* Log */}
      <View style={styles.logWrap}>
        {/* Filtros de log */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.logFilters}>
          <TouchableOpacity
            style={[styles.filterBtn, selectedLog === 'all' && styles.filterBtnActive]}
            onPress={() => setSelectedLog('all')}
          >
            <Text style={[styles.filterText, selectedLog === 'all' && styles.filterTextActive]}>Todos</Text>
          </TouchableOpacity>
          {projects.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.filterBtn, selectedLog === p.id && { borderColor: PALETTE[i % PALETTE.length] }]}
              onPress={() => setSelectedLog(p.id)}
            >
              <Text style={[styles.filterText, selectedLog === p.id && { color: PALETTE[i % PALETTE.length] }]}>
                {p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.filterBtn} onPress={() => { logsRef.current = []; setLogs([]); }}>
            <Text style={[styles.filterText, { color: '#ff5555' }]}>✕ Limpar</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Linhas de log */}
        <ScrollView ref={scrollRef} style={styles.logBody} nestedScrollEnabled>
          {filteredLogs.length === 0
            ? <Text style={styles.logEmpty}>📡 Inicie um serviço para ver os logs.</Text>
            : filteredLogs.map((l, i) => {
                const projIdx = projects.findIndex(p => p.id === l.id);
                const color   = projIdx >= 0 ? PALETTE[projIdx % PALETTE.length] : '#00c8e0';
                return (
                  <View key={l.key} style={styles.logLine}>
                    <Text style={styles.logTime}>{l.time}</Text>
                    <View style={[styles.logTag, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.logTagText, { color }]}>
                        {(projects[projIdx]?.name || l.id).slice(0, 8)}
                      </Text>
                    </View>
                    <Text style={[styles.logMsg, l.type === 'err' && styles.logErr]} selectable>
                      {l.text}
                    </Text>
                  </View>
                );
              })
          }
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d13' },

  dirBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535',
  },
  dirLabel:    { flex: 1, fontSize: 11, color: '#5a6480', fontFamily: 'monospace' },
  btnDir:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: '#00c8e0', backgroundColor: 'rgba(0,200,224,.08)' },
  btnDirText:  { fontSize: 11, color: '#00c8e0', fontWeight: '700' },

  globalActions: { flexDirection: 'row', gap: 7, padding: 12, paddingBottom: 6 },
  btnGlobal:     { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnGlobalDanger: { borderColor: 'rgba(255,85,85,.3)', backgroundColor: 'rgba(255,85,85,.06)' },
  btnGlobalText:   { fontSize: 11, color: '#c8d0e8', fontWeight: '700' },

  list:        { flex: 1 },
  listContent: { padding: 12, gap: 10 },

  card: {
    backgroundColor: '#181c28', borderRadius: 12,
    borderWidth: 1, borderColor: '#1f2535', overflow: 'hidden',
  },
  cardAccent:  { height: 2 },
  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10 },
  cardMeta:    { flex: 1 },
  cardName:    { fontSize: 14, fontWeight: '900', color: '#c8d0e8', letterSpacing: .3 },
  cardSubRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  portPill:    { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  portPillText:{ fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  cardDesc:    { fontSize: 10, color: '#5a6480', flex: 1 },

  badge:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  badgeText:   { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  missingWarn: { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(245,166,35,.06)', borderWidth: 1, borderColor: 'rgba(245,166,35,.2)' },
  missingText: { fontSize: 10, color: '#f5a623', fontFamily: 'monospace' },

  tunnelBar:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(34,211,107,.06)', borderWidth: 1, borderColor: 'rgba(34,211,107,.2)' },
  tunnelUrl:     { flex: 1, fontSize: 10, color: '#22d36b', fontFamily: 'monospace' },
  tunnelCopy:    { fontSize: 14, color: '#22d36b', paddingLeft: 8 },
  tunnelOpening: { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(124,143,245,.06)', borderWidth: 1, borderColor: 'rgba(124,143,245,.2)' },
  tunnelOpeningText: { fontSize: 10, color: '#7c8ff5', fontFamily: 'monospace' },

  cardActions:   { flexDirection: 'row', gap: 7, padding: 13, paddingTop: 0 },
  btnAction:     { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnStart:      {},
  btnStop:       {},
  btnActionText: { fontSize: 12, color: '#c8d0e8', fontWeight: '700' },
  btnDisabled:   { opacity: .3 },
  btnDisabledText: { color: '#5a6480' },
  btnIcon:       { width: 36, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnIconText:   { fontSize: 13 },
  btnTunnel:     {},
  btnTunnelActive:  { borderColor: '#22d36b', backgroundColor: 'rgba(34,211,107,.1)' },
  btnTunnelOpening: { borderColor: '#7c8ff5', backgroundColor: 'rgba(124,143,245,.1)' },

  empty:    { flex: 1, alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyIco: { fontSize: 32, opacity: .4 },
  emptyText:{ fontSize: 12, color: '#3a4260', fontFamily: 'monospace', textAlign: 'center', lineHeight: 20 },

  /* Log */
  logWrap:    { height: 200, backgroundColor: '#12151f', borderTopWidth: 1, borderTopColor: '#1f2535' },
  logFilters: { flexGrow: 0, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  filterBtn:  { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#2a3148', marginRight: 6 },
  filterBtnActive: { backgroundColor: 'rgba(90,100,128,.15)', borderColor: '#2a3148' },
  filterText: { fontSize: 10, color: '#5a6480', fontFamily: 'monospace' },
  filterTextActive: { color: '#c8d0e8' },
  logBody:    { flex: 1, padding: 8 },
  logEmpty:   { fontSize: 11, color: '#3a4260', fontFamily: 'monospace', textAlign: 'center', marginTop: 16 },
  logLine:    { flexDirection: 'row', gap: 6, marginBottom: 2, alignItems: 'flex-start' },
  logTime:    { fontSize: 9, color: '#3a4260', fontFamily: 'monospace', paddingTop: 2, width: 60 },
  logTag:     { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  logTagText: { fontSize: 9, fontFamily: 'monospace', fontWeight: '700' },
  logMsg:     { flex: 1, fontSize: 10, color: '#c8d0e8', fontFamily: 'monospace', lineHeight: 16 },
  logErr:     { color: '#ff5555' },
});
