import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  Image,
  Dimensions,
  Animated,       
  PanResponder    
} from 'react-native';
import { WebView } from 'react-native-webview';
import nodejs from 'nodejs-mobile-react-native';
import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import ReactNativeBlobUtil from 'react-native-blob-util';

// ★★★ 修改 1：引入文件选择器 ★★★
import DocumentPicker from 'react-native-document-picker';

const UPDATE_CONFIG_URL = 'http://114.66.53.192:8080/updates/version.json';
const CURRENT_APP_VERSION = '1.0.2'; 

const App = () => {
  const [status, setStatus] = useState('系统初始化...');
  const [serverReady, setServerReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]); 

  const [showLogOverlay, setShowLogOverlay] = useState(false); 
  const [hasNewError, setHasNewError] = useState(false);       
  // const [hideFloatingBall, setHideFloatingBall] = useState(false); // ★★★ 已移除隐藏功能状态

  const webViewRef = useRef(null);
  const scrollViewRef = useRef(null); 

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.extractOffset(); 
      },
    })
  ).current;

  const targetDir = `${RNFS.DocumentDirectoryPath}/SillyTavern`;
  const nodeProjectDir = `${RNFS.DocumentDirectoryPath}/nodejs-project`;
  const mainJsPath = `${nodeProjectDir}/main.js`;

  useEffect(() => {
    requestPermissions();
    setTimeout(() => {
      initSystem();
    }, 1000);
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);
      } catch (err) {}
    }
  };

  const addLog = (msg) => {
    console.log('[AppLog]', msg);
    setLogs(prev => {
      const newLogs = [...prev, msg];
      return newLogs.length > 100 ? newLogs.slice(-100) : newLogs;
    });
  };

  // ... (中间的 bridgeScript, mock, regex 修复代码保持不变，太长了这里省略，原样保留即可) ...
  const bridgeScript = `
    const rn_bridge = require('rn-bridge');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    
    if (!global.Intl) {
        global.Intl = {
            NumberFormat: function() { return { format: (n) => n }; },
            DateTimeFormat: function() { return { format: (d) => new Date(d || Date.now()).toString() }; },
            Collator: function() { return { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }; },
            ListFormat: function() { return { format: (l) => l.join(', ') }; },
            PluralRules: function() { return { select: () => 'other' }; },
            RelativeTimeFormat: function() { return { format: (v, u) => v + ' ' + u }; },
            Segmenter: function() { return { segment: (s) => [{segment: s, index: 0, input: s}] }; }
        };
    }

    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = function(chunk, encoding, callback) {
        if (chunk) rn_bridge.channel.send('LOG:' + chunk.toString().trim());
        return originalStdout.apply(process.stdout, arguments);
    };
    process.stderr.write = function(chunk, encoding, callback) {
        if (chunk) rn_bridge.channel.send('ERR:' + chunk.toString().trim());
        return originalStderr.apply(process.stderr, arguments);
    };
    process.on('uncaughtException', (err) => {
        rn_bridge.channel.send('ERR: [致命错误] ' + err.message + '\\n' + err.stack);
    });

    os.cpus = () => [{ model: 'SillyCore', speed: 1000, times: {} }];
    
    const MOCK_CONTENT = {
        'sharp': {
            cjs: \`module.exports=function(){return{resize:()=>({toBuffer:()=>Promise.resolve(Buffer.alloc(0))}),toFormat:()=>({toBuffer:()=>Promise.resolve(Buffer.alloc(0))})}};module.exports.cache=()=>{};\`,
            esm: \`export default function(){return{resize:()=>({toBuffer:()=>Promise.resolve(Buffer.alloc(0))}),toFormat:()=>({toBuffer:()=>Promise.resolve(Buffer.alloc(0))})}};export const cache=()=>{};\`,
        },
        'open': {
            cjs: \`module.exports = async () => { console.log('LOG: [系统] 已拦截浏览器自动启动'); return Promise.resolve(); };\`,
            esm: \`export default async () => { console.log('LOG: [系统] 已拦截浏览器自动启动'); return Promise.resolve(); };\`
        }
    };

    function simpleMock(baseDir) {
        const mDir = path.join(baseDir, 'node_modules');
        if(!fs.existsSync(mDir)) return;
        
        Object.keys(MOCK_CONTENT).forEach(k => {
            const p = path.join(mDir, k);
            if(fs.existsSync(p)) {
                try {
                    const pkgPath = path.join(p, 'package.json');
                    let isEsm = false;
                    if (fs.existsSync(pkgPath)) {
                        const pkg = JSON.parse(fs.readFileSync(pkgPath));
                        if (pkg.type === 'module') isEsm = true;
                        pkg.main = 'mock.js';
                        delete pkg.exports; 
                        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
                    }
                    const content = isEsm ? MOCK_CONTENT[k].esm : MOCK_CONTENT[k].cjs;
                    fs.writeFileSync(path.join(p, 'mock.js'), content);
                } catch(e) {
                    rn_bridge.channel.send('LOG: Mock失败 ' + k + ' ' + e.message);
                }
            }
        });
    }

    function forcePatchRegex(baseDir) {
        rn_bridge.channel.send('LOG: [自检程序] 正在检查文件完整性...');
        let patchCount = 0;
        let scannedCount = 0;
        function walk(dir) {
            if (!fs.existsSync(dir)) return;
            if (dir.includes('.git') || dir.includes('public') || dir.includes('assets') || dir.includes('.cache')) return;
            let list;
            try { list = fs.readdirSync(dir); } catch(e) { return; }
            list.forEach(file => {
                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        walk(fullPath);
                    } else if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
                        scannedCount++;
                        if (scannedCount % 3000 === 0) rn_bridge.channel.send('LOG: 扫描进度... ' + scannedCount);
                        const content = fs.readFileSync(fullPath, 'utf8');
                        let newContent = content;
                        let modified = false;
                        if (/\\\\p\\{Z[a-zA-Z_]*\\}/i.test(newContent) || /\\p\\{Z[a-zA-Z_]*\\}/i.test(newContent)) {
                             newContent = newContent.replace(/\\\\p\\{Z[a-zA-Z_]*\\}/gi, '\\\\s').replace(/\\p\\{Z[a-zA-Z_]*\\}/gi, '\\\\s');
                             modified = true;
                        }
                        if (/\\\\p\\{[a-zA-Z_0-9]+\\}/.test(newContent) || /\\p\\{[a-zA-Z_0-9]+\\}/.test(newContent)) {
                            newContent = newContent.replace(/\\\\p\\{[a-zA-Z_0-9]+\\}/gi, '\\\\w').replace(/\\p\\{[a-zA-Z_0-9]+\\}/gi, '\\\\w');
                            modified = true;
                        }
                        if (content.includes('fatal:')) {
                            newContent = newContent.replace(/fatal:\\s*!0/g, 'fatal:!1').replace(/fatal:\\s*true/g, 'fatal:false').replace(/"fatal":\\s*true/g, '"fatal":false');
                            modified = true;
                        }
                        if (modified && content !== newContent) {
                            fs.writeFileSync(fullPath, newContent);
                            patchCount++;
                        }
                    }
                } catch(e) {}
            });
        }
        try {
            walk(baseDir);
            rn_bridge.channel.send('LOG: [自检完成] 修复了 ' + patchCount + ' 个文件');
        } catch(e) {
            rn_bridge.channel.send('ERR: 扫描出错: ' + e.message);
        }
    }

    rn_bridge.channel.on('message', (msg) => {
      if (msg.startsWith('START:')) {
          const dir = msg.replace('START:', '');
          try { process.chdir(dir); } catch (err) { return; }
          const dataDir = path.join(dir, 'data');
          if(!fs.existsSync(dataDir)) try{fs.mkdirSync(dataDir)}catch(e){}
          try {
             const configFile = path.join(dataDir, 'config.yaml');
             if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, 'port: 8000\\nlisten: true\\n');
          } catch(e){}
          rn_bridge.channel.send('LOG: 正在加载模块...');
          simpleMock(dir);
          forcePatchRegex(dir);
          (async () => {
             try {
                process.env.HOME = dir;
                process.env.NODE_OPTIONS = "--no-warnings";
                process.argv = ['node', 'server.js', '--no-launch']; 
                const serverPath = path.join(dir, 'server.js');
                if (!fs.existsSync(serverPath)) {
                    rn_bridge.channel.send('ERR: 找不到 server.js');
                    return;
                }
                try { fs.chmodSync(serverPath, 0o777); } catch(e){}
                await import(serverPath);
                rn_bridge.channel.send('SERVER_STARTED');
             } catch (e) { rn_bridge.channel.send('ERR:' + e.message); }
          })();
      }
    });
    rn_bridge.channel.send('READY');
  `;

  const initSystem = async () => {
    try {
      if (!(await RNFS.exists(nodeProjectDir))) await RNFS.mkdir(nodeProjectDir);
      await RNFS.writeFile(mainJsPath, bridgeScript, 'utf8');

      const localVersionPath = `${targetDir}/version_info.json`;
      const serverJsExists = await RNFS.exists(`${targetDir}/server.js`);

      addLog('正在检查版本信息...');
      try {
          const res = await fetch(`${UPDATE_CONFIG_URL}?t=${new Date().getTime()}`);
          if (res.ok) {
              const remoteConfig = await res.json();
              if (remoteConfig.apkVersion && remoteConfig.apkVersion > CURRENT_APP_VERSION) {
                  Alert.alert(
                      '发现新版本 APP',
                      `检测到客户端有更新 (${remoteConfig.apkVersion})。\n\n更新内容: ${remoteConfig.apkDesc || '性能优化与Bug修复'}`,
                      [
                          { text: '稍后', style: 'cancel', onPress: () => checkResourceUpdate(remoteConfig, localVersionPath, serverJsExists) },
                          { text: '立即更新', onPress: () => downloadAppUpdate(remoteConfig.apkUrl) }
                      ]
                  );
                  return; 
              }
              checkResourceUpdate(remoteConfig, localVersionPath, serverJsExists);
          } else {
              addLog('无法连接更新服务器，跳过检查');
              startNode();
          }
      } catch (e) {
          addLog('离线模式启动: ' + e.message);
          startNode();
      }
    } catch (err) {
      setStatus(`系统初始化错误: ${err.message}`);
    }
  };

  const checkResourceUpdate = async (remoteConfig, localVersionPath, serverJsExists) => {
      const remoteVer = remoteConfig.version;
      let localVer = '0.0.0';
      if (serverJsExists && await RNFS.exists(localVersionPath)) {
          const localContent = await RNFS.readFile(localVersionPath, 'utf8');
          try { localVer = JSON.parse(localContent).version || '0.0.0'; } catch(e) {}
      }
      if (!serverJsExists || localVer !== remoteVer) {
          addLog(`发现资源更新: ${remoteVer} (本地: ${localVer})`);
          downloadAssets(remoteConfig); 
      } else {
          addLog('资源已是最新，启动中...');
          startNode();
      }
  };

  const downloadAppUpdate = async (apkUrl) => {
    setDownloading(false);
    setStatus('正在后台下载新版本，请查看通知栏...');
    addLog('启动原生下载管理器下载 APK...');
    try {
        ReactNativeBlobUtil.config({
            addAndroidDownloads: {
                useDownloadManager: true, 
                notification: true,       
                title: 'SillyAndroid 更新',
                description: '正在下载新版本...',
                mime: 'application/vnd.android.package-archive',
                path: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/SillyAndroid_Update.apk`,
                mediaScannable: true,
            }
        })
        .fetch('GET', apkUrl)
        .then((res) => {
            addLog('APK 下载完成，尝试拉起安装');
            ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/vnd.android.package-archive');
        })
        .catch((err) => {
            addLog('下载报错: ' + err);
            Alert.alert('下载出错', '无法下载更新: ' + err);
        });
    } catch (e) {
        Alert.alert('错误', e.message);
    }
  };

  const downloadAssets = async (preFetchedConfig = null) => {
    setDownloading(true);
    try {
      let config = preFetchedConfig;
      if (!config) {
        const configRes = await fetch(`${UPDATE_CONFIG_URL}?t=${new Date().getTime()}`);
        config = await configRes.json();
      }
      const downloadUrl = config.downloadUrl;
      const version = config.version || '最新版';
      setStatus(`正在下载系统资源 (v${version})...`);
      const tempZip = `${RNFS.DocumentDirectoryPath}/payload.zip`;
      if (await RNFS.exists(tempZip)) await RNFS.unlink(tempZip);
      const ret = RNFS.downloadFile({
        fromUrl: downloadUrl, toFile: tempZip, progressDivider: 10,
        progress: (res) => { if (res.contentLength > 0) setProgress(res.bytesWritten / res.contentLength); }
      });
      const result = await ret.promise;
      if (result.statusCode === 200) {
        setDownloading(false);
        setStatus('正在解压与合并数据...');
        if (!(await RNFS.exists(targetDir))) await RNFS.mkdir(targetDir);
        
        const userConfigPath = `${targetDir}/config.yaml`;
        const backupConfigPath = `${targetDir}/config.yaml.bak`;
        let configBackedUp = false;
        if (await RNFS.exists(userConfigPath)) {
            await RNFS.copyFile(userConfigPath, backupConfigPath);
            configBackedUp = true;
        }
        await unzip(tempZip, targetDir);
        if (configBackedUp && await RNFS.exists(backupConfigPath)) {
            if (await RNFS.exists(userConfigPath)) await RNFS.unlink(userConfigPath);
            await RNFS.moveFile(backupConfigPath, userConfigPath);
        }
        await RNFS.unlink(tempZip);
        await RNFS.writeFile(`${targetDir}/version_info.json`, JSON.stringify(config), 'utf8');
        addLog('资源更新完成');
        startNode();
      } else {
        throw new Error('下载失败 code:' + result.statusCode);
      }
    } catch (e) {
      setDownloading(false);
      setStatus(`资源更新失败: ${e.message}`);
      Alert.alert('错误', `资源下载失败，请检查网络。\n${e.message}`);
    }
  };

  const startNode = () => {
    setStatus('正在启动本地服务器...');
    nodejs.start('main.js');
    let started = false;
    nodejs.channel.removeAllListeners('message');
    nodejs.channel.addListener('message', (msg) => {
      if (typeof msg !== 'string') return;
      if (msg.startsWith('LOG:') || msg.startsWith('ERR:')) {
          addLog(msg);
          if (msg.startsWith('ERR:')) {
              setHasNewError(true); 
              // setHideFloatingBall(false); // 移除
          }
      }
      if (msg.startsWith('ERR:')) setStatus('后台错误: ' + msg); 
      if (msg === 'READY') setStatus('服务环境准备就绪...');
      if (msg === 'READY' && !started) { started = true; nodejs.channel.send(`START:${targetDir}`); }
      if (msg === 'SERVER_STARTED') { setStatus('服务已启动，正在连接界面...'); checkServer(); }
    });
  };

  const checkServer = async () => {
    let retries = 0;
    while (retries < 60) { 
      try {
        const res = await fetch('http://127.0.0.1:8000', { method: 'HEAD' });
        if (res.ok || res.status) { setServerReady(true); return; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
      retries++;
    }
    setStatus('连接超时，请尝试完全关闭 APP 后重试');
  };

  const handleReset = async () => {
    Alert.alert("重置资源", "确定要删除所有文件并重新下载吗？", [
        { text: "取消", style: "cancel" },
        { text: "确定", onPress: async () => {
            setDownloading(false); setServerReady(false); setStatus('正在清理旧文件...');
            try { if (await RNFS.exists(targetDir)) await RNFS.unlink(targetDir); initSystem(); } catch (e) {}
        }}
    ]);
  };

  // ★★★ 修改 2：新增用户数据导入功能 ★★★
  const importUserData = async () => {
    try {
      addLog('请求选择文件...');
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.zip, DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      
      const pickedFile = res[0];
      const sourcePath = pickedFile.fileCopyUri || pickedFile.uri;
      
      // 目标：SillyTavern/data/default-user
      const destPath = `${targetDir}/data/default-user`;

      if (!(await RNFS.exists(destPath))) {
        await RNFS.mkdir(destPath);
      }

      addLog('开始解压数据到: ' + destPath);
      // 解压到 default-user，同名文件自动覆盖
      await unzip(sourcePath, destPath);

      Alert.alert(
        '导入成功', 
        '用户数据已覆盖。\n请重启 APP 或刷新网页以生效。',
        [{ text: '知道了' }]
      );
      addLog('用户数据导入完成');

    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        addLog('用户取消导入');
      } else {
        Alert.alert('导入出错', err.message);
        addLog('导入错误: ' + err.message);
      }
    }
  };

  const fileDownloadPatch = `
    (function() {
      var originalCreateElement = document.createElement;
      document.createElement = function(tagName) {
        var element = originalCreateElement.call(document, tagName);
        if (tagName.toLowerCase() === 'a') {
          var originalClick = element.click;
          element.click = function() {
            if (this.href && this.href.startsWith('blob:')) {
              var filename = this.download || 'silly_export_' + new Date().getTime() + '.json';
              var xhr = new XMLHttpRequest();
              xhr.open('GET', this.href, true);
              xhr.responseType = 'blob';
              xhr.onload = function() {
                  var reader = new FileReader();
                  reader.onload = function() {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blob_download', data: reader.result, filename: filename }));
                  };
                  reader.readAsDataURL(xhr.response);
              };
              xhr.send();
            } else { originalClick.call(this); }
          };
        }
        return element;
      };
    })();
  `;

  const handleWebViewMessage = async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'blob_download') {
        const { data, filename } = msg;
        const base64Code = data.split(',')[1];
        const destPath = `${RNFS.DownloadDirectoryPath}/${filename}`;
        try {
          await RNFS.writeFile(destPath, base64Code, 'base64');
          Alert.alert('导出成功', `文件已保存到系统下载文件夹：\n${filename}`);
        } catch (err) {
          const fallbackPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
          await RNFS.writeFile(fallbackPath, base64Code, 'base64');
          Alert.alert('导出成功', `(无权限写入下载目录)\n文件已保存到 APP 私有目录：\n${filename}`);
        }
      }
    } catch (e) {}
  };

  if (!serverReady) {
    const { width, height } = Dimensions.get('window');
    const bgImage = require('./assets/background.png'); 

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden={true} />
        <Image 
          source={bgImage} 
          style={{ position: 'absolute', width: width, height: height, opacity: 0.5 }} 
          resizeMode="cover"
          blurRadius={3}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ height: '40%' }} />
          <ActivityIndicator size="large" color="#00ffcc" style={{ transform: [{ scale: 1.5 }] }} />
          <Text style={{ color: '#fff', marginTop: 30, fontSize: 18, fontWeight: '600', letterSpacing: 2 }}>{status}</Text>
          
          {downloading && progress > 0 && (
             <View style={{ width: '80%', marginTop: 20, alignItems: 'center' }}>
                <View style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: '#00ffcc' }} />
                </View>
                <Text style={{ color: '#aaa', marginTop: 8, fontSize: 12 }}>{ (progress * 100).toFixed(0) }%</Text>
             </View>
          )}

          {/* 启动页面也可以放一个重置按钮，以防万一 */}
          <View style={{ flexDirection: 'row', marginTop: 50, gap: 20 }}>
            <TouchableOpacity style={{ padding: 10 }} onPress={handleReset}>
               <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>重置资源</Text>
            </TouchableOpacity>
             {/* 启动页面也加上导入，方便用户数据迁移 */}
             <TouchableOpacity style={{ padding: 10 }} onPress={importUserData}>
               <Text style={{ color: '#00ffcc', fontSize: 12, opacity: 0.8 }}>导入数据</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#111' }}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      
      <View style={{ flex: 1 }}>
        <WebView 
          ref={webViewRef}
          source={{ uri: 'http://127.0.0.1:8000' }} 
          style={{ flex: 1 }}
          allowsFullscreenVideo={true}
          androidLayerType="hardware"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          setSupportMultipleWindows={false}
          injectedJavaScript={fileDownloadPatch}
          onMessage={handleWebViewMessage}
        />
      </View>

      {/* ★★★ 修改 3：悬浮球逻辑（移除了 !hideFloatingBall 判断） ★★★ */}
      {!showLogOverlay && (
          <Animated.View
            {...panResponder.panHandlers}
            style={{
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
                position: 'absolute',
                bottom: 100, 
                right: 20,
                zIndex: 99
            }}
          >
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setShowLogOverlay(true); setHasNewError(false); }}
                style={{
                    backgroundColor: hasNewError ? '#ff4444' : 'rgba(0,0,0,0.5)', 
                    paddingVertical: 10,
                    paddingHorizontal: hasNewError ? 15 : 12,
                    borderRadius: 25,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 5,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)'
                }}
            >
                {hasNewError && (
                    <Text style={{ color: '#fff', fontWeight: 'bold', marginRight: 5, fontSize: 12 }}>⚠️ 报错</Text>
                )}
                <Text style={{ color: '#fff', fontSize: 16 }}>{hasNewError ? '!' : '🛠️'}</Text>
            </TouchableOpacity>
          </Animated.View>
      )}

      {/* ★★★ 修改 4：悬浮球展开后的控制台（移除隐藏按钮，新增导入按钮） ★★★ */}
      {showLogOverlay && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 100, padding: 20 }}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>控制台 & 日志</Text>
                    <View style={{flexDirection: 'row', gap: 10}}>
                        {/* 移除了“隐藏悬浮球”按钮 */}
                        <TouchableOpacity onPress={() => setShowLogOverlay(false)} style={{ padding: 8, backgroundColor: '#333', borderRadius: 5 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', paddingHorizontal: 10 }}>关闭</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                
                <ScrollView 
                    ref={scrollViewRef}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    style={{ flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 10, marginBottom: 15 }}
                >
                    {logs.map((log, index) => (
                        <Text key={index} style={{ 
                            color: log.startsWith('ERR:') ? '#ff4444' : '#cccccc', 
                            fontSize: 11, marginBottom: 5, fontFamily: 'monospace',
                            borderBottomColor: '#222', borderBottomWidth: 0.5, paddingBottom: 2
                        }}>
                            {log}
                        </Text>
                    ))}
                    <View style={{ height: 20 }} />
                </ScrollView>

                {/* ★★★ 底部功能菜单区域 ★★★ */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                     <TouchableOpacity onPress={() => setLogs([])} style={{ padding: 12, backgroundColor: '#444', borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' }}>
                        <Text style={{ color: '#ccc', fontSize: 12 }}>清空日志</Text>
                    </TouchableOpacity>

                    {/* 新增：导入数据按钮 */}
                    <TouchableOpacity onPress={importUserData} style={{ padding: 12, backgroundColor: '#0088aa', borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>📥 导入数据</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleReset} style={{ padding: 12, backgroundColor: '#622', borderRadius: 8, flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: '#ffaaaa', fontSize: 12 }}>⚠️ 重置资源</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
};

export default App;
