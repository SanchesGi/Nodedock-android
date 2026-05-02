import React,{useEffect,useRef,useState,useCallback}from 'react';
import{View,Text,StyleSheet,FlatList,TouchableOpacity,ScrollView,RefreshControl,ToastAndroid,Clipboard,Linking,TextInput,Alert}from 'react-native';
import RNFS from 'react-native-fs';
import{bridge}from '../lib/bridge';
import{scanProjects}from '../lib/scanner';

const PAL=['#00c8e0','#f5a623','#22d36b','#7c8ff5','#f572c0','#ff7744'];
const SL={stopped:'Parado',starting:'Iniciando…',running:'Rodando',error:'Erro',missing:'Não encontrado'};
const SC={stopped:'#5a6480',starting:'#7c8ff5',running:'#22d36b',error:'#ff5555',missing:'#f5a623'};

const COMMON_PATHS = [
  RNFS.ExternalStorageDirectoryPath,
  `${RNFS.ExternalStorageDirectoryPath}/Download`,
  `${RNFS.ExternalStorageDirectoryPath}/Documents`,
  `${RNFS.ExternalStorageDirectoryPath}/projects`,
  `${RNFS.ExternalStorageDirectoryPath}/NodeProjects`,
];

export default function HomeScreen(){
  const[projects,setProjects]=useState([]);
  const[logs,setLogs]=useState([]);
  const[selLog,setSelLog]=useState('all');
  const[refreshing,setRefreshing]=useState(false);
  const[dirPath,setDirPath]=useState('');
  const[tunnelMap,setTunnelMap]=useState({});
  const[scanning,setScanning]=useState(false);
  const[showInput,setShowInput]=useState(false);
  const logsRef=useRef([]);
  const scrollRef=useRef(null);

  useEffect(()=>{
    const u=[
      bridge.onProjectsList(list=>{setProjects(list);setRefreshing(false);}),
      bridge.onServiceState(({id,status})=>setProjects(prev=>prev.map(p=>p.id===id?{...p,status}:p))),
      bridge.onLog(({id,text,type})=>{
        const lines=text.split('\n').filter(l=>l.trim());
        const now=new Date().toLocaleTimeString('pt-BR',{hour12:false});
        const ne=lines.map((line,i)=>({key:`${Date.now()}-${i}`,id,text:line,type,time:now}));
        logsRef.current=[...logsRef.current.slice(-300),...ne];
        setLogs([...logsRef.current]);
        setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),100);
      }),
      bridge.onTunnelState(({id,status,url})=>{
        setTunnelMap(prev=>({...prev,[id]:{status,url}}));
        if(status==='open'&&url)ToastAndroid.show(`🌐 ${url}`,ToastAndroid.LONG);
      }),
    ];
    bridge.refresh();
    return()=>u.forEach(f=>f());
  },[]);

  const doScan=async(path)=>{
    if(!path)return;
    setScanning(true);
    setProjects([]);
    const{found,debug}=await scanProjects(path.trim());
    if(found.length===0){
      Alert.alert('Nenhum projeto encontrado',debug,[{text:'OK'}]);
    }else{
      bridge.setProjectsList(found);
      ToastAndroid.show(`${found.length} projeto(s) encontrado(s)!`,ToastAndroid.SHORT);
    }
    setScanning(false);
  };

  const onRefresh=useCallback(()=>{
    setRefreshing(true);
    if(dirPath)doScan(dirPath).then(()=>setRefreshing(false));
    else setRefreshing(false);
  },[dirPath]);

  const filteredLogs=selLog==='all'?logs:logs.filter(l=>l.id===selLog);

  const renderProject=({item:p,index})=>{
    const color=PAL[index%PAL.length];const t=tunnelMap[p.id]||{};
    const run=p.status==='running';const start=p.status==='starting';const miss=p.status==='missing';
    return(
      <View style={[st.card,run&&{shadowColor:color,shadowOpacity:.4,shadowRadius:12,elevation:8}]}>
        <View style={[st.accent,{backgroundColor:color}]}/>
        <View style={st.ch}>
          <View style={st.cm}>
            <Text style={st.cn} numberOfLines={1}>{p.name}</Text>
            <View style={st.csr}>
              <View style={[st.pp,{backgroundColor:color+'22',borderColor:color+'55'}]}><Text style={[st.ppt,{color}]}>:{p.port}</Text></View>
              <Text style={st.cd} numberOfLines={1}>{p.description||p.folderName+'/'}</Text>
            </View>
          </View>
          <View style={[st.badge,{backgroundColor:SC[p.status]+'22',borderColor:SC[p.status]+'55'}]}>
            <View style={[st.dot,{backgroundColor:SC[p.status]}]}/>
            <Text style={[st.badget,{color:SC[p.status]}]}>{SL[p.status]||p.status}</Text>
          </View>
        </View>
        {miss&&<View style={st.mw}><Text style={st.mt}>⚠️ {p.folderName}/ não encontrado</Text></View>}
        {t.status==='open'&&t.url&&(<TouchableOpacity style={st.tb} onPress={()=>{Clipboard.setString(t.url);ToastAndroid.show('Copiado!',ToastAndroid.SHORT);}}>
          <Text style={st.tu} numberOfLines={1}>🌐 {t.url}</Text><Text style={st.tc}>⎘</Text></TouchableOpacity>)}
        {t.status==='opening'&&<View style={st.to}><Text style={st.tot}>🌐 Abrindo túnel…</Text></View>}
        <View style={st.ca}>
          <TouchableOpacity style={[st.ba,(run||start||miss)&&st.bd]} onPress={()=>bridge.startService(p.id)} disabled={run||start||miss}><Text style={[st.bat,(run||start||miss)&&st.bdt]}>▶ Iniciar</Text></TouchableOpacity>
          <TouchableOpacity style={[st.ba,(!run&&!start)&&st.bd]} onPress={()=>bridge.stopService(p.id)} disabled={!run&&!start}><Text style={[st.bat,(!run&&!start)&&st.bdt]}>⏹ Parar</Text></TouchableOpacity>
          <TouchableOpacity style={[st.bi,!run&&st.bd]} onPress={()=>Linking.openURL(`http://127.0.0.1:${p.port}`)} disabled={!run}><Text style={st.bit}>↗</Text></TouchableOpacity>
          <TouchableOpacity style={[st.bi,t.status==='open'&&st.bta,t.status==='opening'&&st.bto,miss&&st.bd]} onPress={()=>t.status==='open'?bridge.closeTunnel(p.id):bridge.openTunnel(p.id)} disabled={miss}><Text style={st.bit}>🌐</Text></TouchableOpacity>
        </View>
      </View>
    );
  };

  return(
    <View style={st.root}>

      {/* Barra de caminho */}
      <View style={st.db}>
        <TextInput
          style={st.inp}
          value={dirPath}
          onChangeText={setDirPath}
          placeholder="/storage/emulated/0/MeusProjetos"
          placeholderTextColor="#3a4260"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={st.bdb} onPress={()=>doScan(dirPath)} disabled={!dirPath||scanning}>
          <Text style={st.bdbt}>{scanning?'⏳':'↻ Scan'}</Text>
        </TouchableOpacity>
      </View>

      {/* Atalhos de caminhos comuns */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.shortcuts} contentContainerStyle={{gap:6,padding:8}}>
        {COMMON_PATHS.map((p,i)=>(
          <TouchableOpacity key={i} style={st.shortcut} onPress={()=>{setDirPath(p);doScan(p);}}>
            <Text style={st.shortcutText} numberOfLines={1}>{p.replace(RNFS.ExternalStorageDirectoryPath,'📱')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ações globais */}
      <View style={st.ga}>
        <TouchableOpacity style={st.bg} onPress={()=>bridge.startAll()}><Text style={st.bgt}>▶▶ Todos</Text></TouchableOpacity>
        <TouchableOpacity style={[st.bg,st.bgd]} onPress={()=>bridge.stopAll()}><Text style={[st.bgt,{color:'#ff5555'}]}>⏹ Parar</Text></TouchableOpacity>
      </View>

      <FlatList data={projects} keyExtractor={p=>p.id} renderItem={renderProject} style={st.list} contentContainerStyle={st.lc}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c8e0"/>}
        ListEmptyComponent={<View style={st.empty}>
          <Text style={st.ei}>{scanning?'⏳':'📦'}</Text>
          <Text style={st.em}>{scanning?'Escaneando…':'Digite o caminho da pasta acima e clique Scan\n\nExemplo:\n/storage/emulated/0/Download/meus-projetos'}</Text>
        </View>}
      />

      {/* Log */}
      <View style={st.lw}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.lf}>
          <TouchableOpacity style={[st.fb,selLog==='all'&&st.fba]} onPress={()=>setSelLog('all')}><Text style={[st.ft,selLog==='all'&&st.fta]}>Todos</Text></TouchableOpacity>
          {projects.map((p,i)=>(<TouchableOpacity key={p.id} style={[st.fb,selLog===p.id&&{borderColor:PAL[i%PAL.length]}]} onPress={()=>setSelLog(p.id)}><Text style={[st.ft,selLog===p.id&&{color:PAL[i%PAL.length]}]}>{p.name.length>10?p.name.slice(0,10)+'…':p.name}</Text></TouchableOpacity>))}
          <TouchableOpacity style={st.fb} onPress={()=>{logsRef.current=[];setLogs([]);}}><Text style={[st.ft,{color:'#ff5555'}]}>✕</Text></TouchableOpacity>
        </ScrollView>
        <ScrollView ref={scrollRef} style={st.lb} nestedScrollEnabled>
          {filteredLogs.length===0?<Text style={st.le}>📡 Logs aparecerão aqui.</Text>
          :filteredLogs.map(l=>{const pi=projects.findIndex(p=>p.id===l.id);const c=PAL[Math.max(pi,0)%PAL.length];return(<View key={l.key} style={st.ll}><Text style={st.lt}>{l.time}</Text><View style={[st.ltg,{backgroundColor:c+'22'}]}><Text style={[st.ltgt,{color:c}]}>{(projects[pi]?.name||l.id).slice(0,8)}</Text></View><Text style={[st.lm,l.type==='err'&&st.le2]} selectable>{l.text}</Text></View>);})}
        </ScrollView>
      </View>
    </View>
  );
}

const st=StyleSheet.create({
  root:{flex:1,backgroundColor:'#0b0d13'},
  db:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#12151f',borderBottomWidth:1,borderBottomColor:'#1f2535'},
  inp:{flex:1,backgroundColor:'#181c28',borderWidth:1,borderColor:'#2a3148',borderRadius:8,paddingHorizontal:10,paddingVertical:7,color:'#c8d0e8',fontFamily:'monospace',fontSize:11},
  bdb:{paddingHorizontal:12,paddingVertical:8,borderRadius:7,borderWidth:1,borderColor:'#00c8e0',backgroundColor:'rgba(0,200,224,.08)'},
  bdbt:{fontSize:11,color:'#00c8e0',fontWeight:'700'},
  shortcuts:{flexGrow:0,borderBottomWidth:1,borderBottomColor:'#1f2535'},
  shortcut:{paddingHorizontal:10,paddingVertical:5,borderRadius:6,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#181c28'},
  shortcutText:{fontSize:10,color:'#5a6480',fontFamily:'monospace'},
  ga:{flexDirection:'row',gap:7,padding:10,paddingBottom:6},
  bg:{flex:1,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
  bgd:{borderColor:'rgba(255,85,85,.3)',backgroundColor:'rgba(255,85,85,.06)'},
  bgt:{fontSize:11,color:'#c8d0e8',fontWeight:'700'},
  list:{flex:1},lc:{padding:12,gap:10},
  card:{backgroundColor:'#181c28',borderRadius:12,borderWidth:1,borderColor:'#1f2535',overflow:'hidden'},
  accent:{height:2},ch:{flexDirection:'row',alignItems:'flex-start',padding:13,gap:10},
  cm:{flex:1},cn:{fontSize:14,fontWeight:'900',color:'#c8d0e8',letterSpacing:.3},
  csr:{flexDirection:'row',alignItems:'center',gap:6,marginTop:4},
  pp:{borderWidth:1,borderRadius:5,paddingHorizontal:6,paddingVertical:1},
  ppt:{fontSize:10,fontFamily:'monospace',fontWeight:'700'},
  cd:{fontSize:10,color:'#5a6480',flex:1},
  badge:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:4,borderRadius:20,borderWidth:1},
  dot:{width:6,height:6,borderRadius:3},badget:{fontSize:10,fontFamily:'monospace',fontWeight:'700'},
  mw:{marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(245,166,35,.06)',borderWidth:1,borderColor:'rgba(245,166,35,.2)'},
  mt:{fontSize:10,color:'#f5a623',fontFamily:'monospace'},
  tb:{flexDirection:'row',alignItems:'center',marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(34,211,107,.06)',borderWidth:1,borderColor:'rgba(34,211,107,.2)'},
  tu:{flex:1,fontSize:10,color:'#22d36b',fontFamily:'monospace'},tc:{fontSize:14,color:'#22d36b',paddingLeft:8},
  to:{marginHorizontal:13,marginBottom:8,padding:8,borderRadius:7,backgroundColor:'rgba(124,143,245,.06)',borderWidth:1,borderColor:'rgba(124,143,245,.2)'},
  tot:{fontSize:10,color:'#7c8ff5',fontFamily:'monospace'},
  ca:{flexDirection:'row',gap:7,padding:13,paddingTop:0},
  ba:{flex:1,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
  bat:{fontSize:12,color:'#c8d0e8',fontWeight:'700'},bd:{opacity:.3},bdt:{color:'#5a6480'},
  bi:{width:36,paddingVertical:8,borderRadius:8,borderWidth:1,borderColor:'#2a3148',backgroundColor:'#12151f',alignItems:'center'},
  bit:{fontSize:13},
  bta:{borderColor:'#22d36b',backgroundColor:'rgba(34,211,107,.1)'},
  bto:{borderColor:'#7c8ff5',backgroundColor:'rgba(124,143,245,.1)'},
  empty:{flex:1,alignItems:'center',paddingTop:30,gap:12,paddingHorizontal:20},
  ei:{fontSize:32,opacity:.4},em:{fontSize:12,color:'#3a4260',fontFamily:'monospace',textAlign:'center',lineHeight:20},
  lw:{height:180,backgroundColor:'#12151f',borderTopWidth:1,borderTopColor:'#1f2535'},
  lf:{flexGrow:0,paddingHorizontal:10,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#1f2535'},
  fb:{paddingHorizontal:12,paddingVertical:4,borderRadius:5,borderWidth:1,borderColor:'#2a3148',marginRight:6},
  fba:{backgroundColor:'rgba(90,100,128,.15)'},ft:{fontSize:10,color:'#5a6480',fontFamily:'monospace'},fta:{color:'#c8d0e8'},
  lb:{flex:1,padding:8},le:{fontSize:11,color:'#3a4260',fontFamily:'monospace',textAlign:'center',marginTop:16},
  ll:{flexDirection:'row',gap:6,marginBottom:2,alignItems:'flex-start'},
  lt:{fontSize:9,color:'#3a4260',fontFamily:'monospace',paddingTop:2,width:60},
  ltg:{borderRadius:4,paddingHorizontal:5,paddingVertical:1,alignSelf:'flex-start'},
  ltgt:{fontSize:9,fontFamily:'monospace',fontWeight:'700'},
  lm:{flex:1,fontSize:10,color:'#c8d0e8',fontFamily:'monospace',lineHeight:16},le2:{color:'#ff5555'},
});
