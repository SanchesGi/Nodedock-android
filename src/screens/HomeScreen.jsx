import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Linking, ToastAndroid,
  Clipboard, Modal, ActivityIndicator,
} from 'react-native';
import { bridge } from '../lib/bridge';

const PALETTE = ['#00c8e0', '#f5a623', '#22d36b', '#7c8ff5', '#f572c0', '#ff7744'];
const STATUS_LABELS = {
  stopped: 'Parado', starting: 'Iniciando…', running: 'Rodando',
  error: 'Erro', missing: 'Não encontrado',
};
const STATUS_COLORS = {
  stopped: '#5a6480', starting: '#7c8ff5', running: '#22d36b',
  error: '#ff5555', missing: '#f5a623',
};

// ── Tela 1: gate de permissão ───────────────────────────────
function PermissionGate({ onGranted }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  const check = useCallback(() => {
    setChecking(true);
    bridge.checkAccess();
  }, []);

  useEffect(() => {
    const unsub = bridge.onAccessState(({ ok, error }) => {
      setChecking(false);
      if (ok) onGranted();
      else    setError(error || 'Acesso negado');
    });
    check();
    return () => unsub();
  }, [check, onGranted]);

  return (
    <View style={s.permRoot}>
      <Text style={s.permIcon}>🔓</Text>
      <Text style={s.permTitle}>Permita acesso aos arquivos</Text>
      <Text style={s.permBody}>
        O SentriDock precisa ler suas pastas pra encontrar os projetos Node.js.
        {'\n\n'}
        Toque em <Text style={{ color: '#00c8e0', fontWeight: '700' }}>Abrir configurações</Text>,
        ative <Text style={{ color: '#00c8e0', fontWeight: '700' }}>Permitir gerenciar todos os arquivos</Text>{' '}
        e volte aqui.
      </Text>

      {error && <Text style={s.permError}>⚠ {error}</Text>}

      <TouchableOpacity style={s.permBtn} onPress={() => Linking.openSettings()}>
        <Text style={s.permBtnText}>⚙ Abrir configurações</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.permBtn2} onPress={check} disabled={checking}>
        {checking
          ? <ActivityIndicator color="#00c8e0" size="small" />
          : <Text style={s.permBtn2Text}>↻ Já permiti, conferir de novo</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Tela 2: picker de pasta ─────────────────────────────────
function DirPicker({ visible, onClose, onSelect }) {
  const [current, setCurrent] = useState(null);
  const [items, setItems]     = useState([]);
  const [parent, setParent]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const unsub = bridge.onDirListing(({ path, parent, items, error }) => {
      setLoading(false);
      if (error) {
        ToastAndroid.show(`Erro: ${error}`, ToastAndroid.SHORT);
        return;
      }
      setCurrent(path);
      setParent(parent);
      setItems(items || []);
    });
    setLoading(true);
    bridge.listDir('/storage/emulated/0');
    return () => unsub();
  }, [visible]);

  const navigate = (p) => { setLoading(true); bridge.listDir(p); };

  const display = current ? current.replace('/storage/emulated/0', '/sdcard') : '...';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.pickRoot}>
        <View style={s.pickHeader}>
          <Text style={s.pickTitle}>Selecione a pasta dos projetos</Text>
          <TouchableOpacity onPress={onClose} style={s.pickClose}>
            <Text style={s.pickCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={s.pickPath}>
          <Text style={s.pickPathText} numberOfLines={1}>📁 {display}</Text>
        </View>

        <View style={s.pickActions}>
          {parent && (
            <TouchableOpacity style={s.pickActionBtn} onPress={() => navigate(parent)}>
              <Text style={s.pickActionText}>⬆️ Subir</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.pickActionBtn, s.pickActionConfirm]}
            onPress={() => { if (current) { onSelect(current); onClose(); } }}
            disabled={!current}
          >
            <Text style={[s.pickActionText, { color: '#22d36b' }]}>✓ Usar esta pasta</Text>
          </TouchableOpacity>
        </View>

        {loading
          ? <View style={s.pickLoading}><ActivityIndicator color="#00c8e0" /></View>
          : (
            <FlatList
              data={items}
              keyExtractor={i => i.path}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pickItem} onPress={() => navigate(item.path)}>
                  <Text style={s.pickItemIcon}>{item.isProject ? '📦' : '📁'}</Text>
                  <Text style={s.pickItemName} numberOfLines={1}>{item.name}</Text>
                  {item.isProject && <Text style={s.pickItemBadge}>Node</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={s.pickEmpty}>Pasta vazia ou sem subpastas.</Text>
              }
            />
          )}
      </View>
    </Modal>
  );
}

// ── Tela principal ──────────────────────────────────────────
export default function HomeScreen() {
  const [hasAccess, setHasAccess] = useState(false);
  const [projects, setProjects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [projectsDir, setProjectsDir] = useState(null);
  const [debug, setDebug] = useState('');
  const [tunnelMap, setTunnelMap] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const logsRef = useRef([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!hasAccess) return;

    const unsubs = [
      bridge.onProjectsList((payload) => {
        const list = Array.isArray(payload) ? payload : payload.projects;
        const pdir = Array.isArray(payload) ? null : payload.dir;
        const pdbg = Array.isArray(payload) ? '' : payload.debug;
        setProjects(list || []);
        if (pdir !== undefined) setProjectsDir(pdir);
        if (pdbg) setDebug(pdbg);
        setRefreshing(false);
      }),
      bridge.onServiceState(({ id, status }) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      }),
      bridge.onLog(({ id, text, type }) => {
        const lines = text.split('\n').filter(l => l.trim());
        const now = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        const newE = lines.map((line, i) => ({ key: `${Date.now()}-${i}`, id, text: line, type, time: now }));
        logsRef.current = [...logsRef.current.slice(-300), ...newE];
        setLogs([...logsRef.current]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }),
      bridge.onTunnelState(({ id, status, url }) => {
        setTunnelMap(prev => ({ ...prev, [id]: { status, url } }));
        if (status === 'open' && url) ToastAndroid.show(`🌐 ${url}`, ToastAndroid.LONG);
      }),
    ];

    bridge.refresh();
    return () => unsubs.forEach(fn => fn());
  }, [hasAccess]);

  const onRefresh = useCallback(() => { setRefreshing(true); bridge.refresh(); }, []);

  const handleSelectDir = (dir) => {
    bridge.setProjectsDir(dir);
    ToastAndroid.show('Pasta atualizada, escaneando...', ToastAndroid.SHORT);
  };

  if (!hasAccess) return <PermissionGate onGranted={() => setHasAccess(true)} />;

  const filteredLogs = selectedLog === 'all' ? logs : logs.filter(l => l.id === selectedLog);
  const displayDir = projectsDir ? projectsDir.replace('/storage/emulated/0', '/sdcard') : 'Toque em "Selecionar"';

  const renderProject = ({ item: p, index }) => {
    const color = PALETTE[index % PALETTE.length];
    const t = tunnelMap[p.id] || {};
    const run = p.status === 'running', start = p.status === 'starting', miss = p.status === 'missing';

    return (
      <View style={[s.card, run && { shadowColor: color, shadowOpacity: .4, shadowRadius: 12, elevation: 8 }]}>
        <View style={[s.cardAccent, { backgroundColor: color }]} />
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
            <View style={s.cardSub}>
              <View style={[s.portPill, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                <Text style={[s.portText, { color }]}>:{p.port}</Text>
              </View>
              <Text style={s.cardDesc} numberOfLines={1}>{p.description || p.folderName + '/'}</Text>
            </View>
          </View>
          <View style={[s.badge, { backgroundColor: STATUS_COLORS[p.status] + '22', borderColor: STATUS_COLORS[p.status] + '55' }]}>
            <View style={[s.dot, { backgroundColor: STATUS_COLORS[p.status] }]} />
            <Text style={[s.badgeText, { color: STATUS_COLORS[p.status] }]}>{STATUS_LABELS[p.status] || p.status}</Text>
          </View>
        </View>

        {miss && <View style={s.warn}><Text style={s.warnText}>⚠️ Pasta não encontrada</Text></View>}

        {t.status === 'open' && t.url && (
          <TouchableOpacity style={s.tunnelBar}
            onPress={() => { Clipboard.setString(t.url); ToastAndroid.show('Copiado!', ToastAndroid.SHORT); }}>
            <Text style={s.tunnelUrl} numberOfLines={1}>🌐 {t.url}</Text>
            <Text style={s.tunnelCopy}>⎘</Text>
          </TouchableOpacity>
        )}
        {t.status === 'opening' && (
          <View style={s.tunnelOpening}><Text style={s.tunnelOpeningText}>🌐 Abrindo…</Text></View>
        )}

        <View style={s.cardActions}>
          <TouchableOpacity style={[s.btnA, (run || start || miss) && s.btnDis]}
            onPress={() => bridge.startService(p.id)} disabled={run || start || miss}>
            <Text style={[s.btnAT, (run || start || miss) && s.btnDisT]}>▶ Iniciar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnA, (!run && !start) && s.btnDis]}
            onPress={() => bridge.stopService(p.id)} disabled={!run && !start}>
            <Text style={[s.btnAT, (!run && !start) && s.btnDisT]}>⏹ Parar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnI, !run && s.btnDis]}
            onPress={() => Linking.openURL(`http://127.0.0.1:${p.port}`)} disabled={!run}>
            <Text style={s.btnIT}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnI, t.status === 'open' && s.btnTunOk, miss && s.btnDis]}
            onPress={() => t.status === 'open' ? bridge.closeTunnel(p.id) : bridge.openTunnel(p.id)} disabled={miss}>
            <Text style={s.btnIT}>🌐</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.dirBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.dirLabel} numberOfLines={1}>📁 {displayDir}</Text>
        </View>
        <TouchableOpacity style={s.dirBtn} onPress={() => setPickerOpen(true)}>
          <Text style={s.dirBtnText}>{projectsDir ? 'Trocar' : 'Selecionar'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.actBtn} onPress={() => bridge.startAll()}>
          <Text style={s.actBtnText}>▶▶ Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actBtn, s.actBtnDanger]} onPress={() => bridge.stopAll()}>
          <Text style={[s.actBtnText, { color: '#ff5555' }]}>⏹ Parar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actBtn} onPress={onRefresh}>
          <Text style={s.actBtnText}>↻ Scan</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={projects}
        keyExtractor={p => p.id}
        renderItem={renderProject}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c8e0" />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIco}>📦</Text>
            <Text style={s.emptyText}>
              {projectsDir
                ? 'Nenhum projeto Node.js encontrado nesta pasta.\n\nLembre: cada projeto precisa ter package.json + node_modules/.'
                : 'Toque em "Selecionar" pra escolher onde estão seus projetos.'}
            </Text>
            {!!debug && projectsDir && (
              <TouchableOpacity onPress={() => alert(debug)}>
                <Text style={s.emptyDebug}>🐛 Ver detalhes do scan</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <View style={s.logWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.logFilters}>
          <TouchableOpacity style={[s.fb, selectedLog === 'all' && s.fbA]} onPress={() => setSelectedLog('all')}>
            <Text style={[s.ft, selectedLog === 'all' && s.ftA]}>Todos</Text>
          </TouchableOpacity>
          {projects.map((p, i) => (
            <TouchableOpacity key={p.id}
              style={[s.fb, selectedLog === p.id && { borderColor: PALETTE[i % PALETTE.length] }]}
              onPress={() => setSelectedLog(p.id)}>
              <Text style={[s.ft, selectedLog === p.id && { color: PALETTE[i % PALETTE.length] }]}>
                {p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.fb} onPress={() => { logsRef.current = []; setLogs([]); }}>
            <Text style={[s.ft, { color: '#ff5555' }]}>✕</Text>
          </TouchableOpacity>
        </ScrollView>
        <ScrollView ref={scrollRef} style={s.logBody} nestedScrollEnabled>
          {filteredLogs.length === 0
            ? <Text style={s.logEmpty}>📡 Inicie um serviço pra ver os logs.</Text>
            : filteredLogs.map(l => {
              const idx = projects.findIndex(p => p.id === l.id);
              const c = idx >= 0 ? PALETTE[idx % PALETTE.length] : '#00c8e0';
              return (
                <View key={l.key} style={s.logLine}>
                  <Text style={s.logTime}>{l.time}</Text>
                  <View style={[s.logTag, { backgroundColor: c + '22' }]}>
                    <Text style={[s.logTagText, { color: c }]}>
                      {(projects[idx]?.name || l.id).slice(0, 8)}
                    </Text>
                  </View>
                  <Text style={[s.logMsg, l.type === 'err' && s.logErr]} selectable>{l.text}</Text>
                </View>
              );
            })}
        </ScrollView>
      </View>

      <DirPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectDir} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d13' },

  // Permission gate
  permRoot:   { flex: 1, backgroundColor: '#0b0d13', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permIcon:   { fontSize: 56 },
  permTitle:  { fontSize: 18, fontWeight: '900', color: '#c8d0e8', textAlign: 'center' },
  permBody:   { fontSize: 13, color: '#5a6480', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  permError:  { fontSize: 11, color: '#f5a623', fontFamily: 'monospace', textAlign: 'center' },
  permBtn:    { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#00c8e0', backgroundColor: 'rgba(0,200,224,.12)', minWidth: 240, alignItems: 'center' },
  permBtnText:{ fontSize: 14, color: '#00c8e0', fontWeight: '700' },
  permBtn2:   { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', minWidth: 240, alignItems: 'center' },
  permBtn2Text:{ fontSize: 12, color: '#c8d0e8', fontWeight: '600' },

  // Picker modal
  pickRoot:    { flex: 1, backgroundColor: '#0b0d13' },
  pickHeader:  { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  pickTitle:   { flex: 1, fontSize: 14, color: '#c8d0e8', fontWeight: '900' },
  pickClose:   { padding: 6 },
  pickCloseText:{ fontSize: 18, color: '#5a6480' },
  pickPath:    { padding: 10, paddingHorizontal: 14, backgroundColor: '#181c28', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  pickPathText:{ fontSize: 11, color: '#00c8e0', fontFamily: 'monospace' },
  pickActions: { flexDirection: 'row', gap: 7, padding: 10, backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  pickActionBtn:{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#181c28', alignItems: 'center' },
  pickActionConfirm:{ borderColor: 'rgba(34,211,107,.5)', backgroundColor: 'rgba(34,211,107,.08)' },
  pickActionText:{ fontSize: 12, color: '#c8d0e8', fontWeight: '700' },
  pickItem:    { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1f2535', gap: 12 },
  pickItemIcon:{ fontSize: 18 },
  pickItemName:{ flex: 1, fontSize: 13, color: '#c8d0e8' },
  pickItemBadge:{ fontSize: 9, color: '#22d36b', fontFamily: 'monospace', borderWidth: 1, borderColor: 'rgba(34,211,107,.4)', backgroundColor: 'rgba(34,211,107,.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pickEmpty:   { fontSize: 11, color: '#3a4260', textAlign: 'center', padding: 24, fontFamily: 'monospace' },
  pickLoading: { padding: 40, alignItems: 'center' },

  // Dir bar
  dirBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#12151f', borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  dirLabel:  { fontSize: 11, color: '#c8d0e8', fontFamily: 'monospace' },
  dirBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: '#00c8e0', backgroundColor: 'rgba(0,200,224,.08)' },
  dirBtnText:{ fontSize: 11, color: '#00c8e0', fontWeight: '700' },

  // Actions
  actions:    { flexDirection: 'row', gap: 7, padding: 12, paddingBottom: 6 },
  actBtn:     { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  actBtnDanger:{ borderColor: 'rgba(255,85,85,.3)', backgroundColor: 'rgba(255,85,85,.06)' },
  actBtnText: { fontSize: 11, color: '#c8d0e8', fontWeight: '700' },

  // Card
  card:       { backgroundColor: '#181c28', borderRadius: 12, borderWidth: 1, borderColor: '#1f2535', overflow: 'hidden' },
  cardAccent: { height: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10 },
  cardName:   { fontSize: 14, fontWeight: '900', color: '#c8d0e8' },
  cardSub:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  portPill:   { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  portText:   { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  cardDesc:   { fontSize: 10, color: '#5a6480', flex: 1 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  badgeText:  { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  warn:       { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(245,166,35,.06)', borderWidth: 1, borderColor: 'rgba(245,166,35,.2)' },
  warnText:   { fontSize: 10, color: '#f5a623', fontFamily: 'monospace' },
  tunnelBar:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(34,211,107,.06)', borderWidth: 1, borderColor: 'rgba(34,211,107,.2)' },
  tunnelUrl:     { flex: 1, fontSize: 10, color: '#22d36b', fontFamily: 'monospace' },
  tunnelCopy:    { fontSize: 14, color: '#22d36b', paddingLeft: 8 },
  tunnelOpening: { marginHorizontal: 13, marginBottom: 8, padding: 8, borderRadius: 7, backgroundColor: 'rgba(124,143,245,.06)', borderWidth: 1, borderColor: 'rgba(124,143,245,.2)' },
  tunnelOpeningText:{ fontSize: 10, color: '#7c8ff5', fontFamily: 'monospace' },
  cardActions:{ flexDirection: 'row', gap: 7, padding: 13, paddingTop: 0 },
  btnA:       { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnAT:      { fontSize: 12, color: '#c8d0e8', fontWeight: '700' },
  btnDis:     { opacity: .3 },
  btnDisT:    { color: '#5a6480' },
  btnI:       { width: 36, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2a3148', backgroundColor: '#12151f', alignItems: 'center' },
  btnIT:      { fontSize: 13 },
  btnTunOk:   { borderColor: '#22d36b', backgroundColor: 'rgba(34,211,107,.1)' },

  empty:      { flex: 1, alignItems: 'center', paddingTop: 60, gap: 16, paddingHorizontal: 24 },
  emptyIco:   { fontSize: 40, opacity: .4 },
  emptyText:  { fontSize: 12, color: '#5a6480', fontFamily: 'monospace', textAlign: 'center', lineHeight: 18 },
  emptyDebug: { fontSize: 11, color: '#7c8ff5', textDecorationLine: 'underline', marginTop: 8 },

  logWrap:    { height: 200, backgroundColor: '#12151f', borderTopWidth: 1, borderTopColor: '#1f2535' },
  logFilters: { flexGrow: 0, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1f2535' },
  fb:         { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#2a3148', marginRight: 6 },
  fbA:        { backgroundColor: 'rgba(90,100,128,.15)' },
  ft:         { fontSize: 10, color: '#5a6480', fontFamily: 'monospace' },
  ftA:        { color: '#c8d0e8' },
  logBody:    { flex: 1, padding: 8 },
  logEmpty:   { fontSize: 11, color: '#3a4260', fontFamily: 'monospace', textAlign: 'center', marginTop: 16 },
  logLine:    { flexDirection: 'row', gap: 6, marginBottom: 2, alignItems: 'flex-start' },
  logTime:    { fontSize: 9, color: '#3a4260', fontFamily: 'monospace', paddingTop: 2, width: 60 },
  logTag:     { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  logTagText: { fontSize: 9, fontFamily: 'monospace', fontWeight: '700' },
  logMsg:     { flex: 1, fontSize: 10, color: '#c8d0e8', fontFamily: 'monospace', lineHeight: 16 },
  logErr:     { color: '#ff5555' },
});
