import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  Image,
  Dimensions,
  Animated,
  PanResponder,
  BackHandler,
  Easing,
} from 'react-native';
import { WebView } from 'react-native-webview';
import nodejs from 'nodejs-mobile-react-native';
import RNFS from 'react-native-fs';
import { unzip, zip } from 'react-native-zip-archive';
import ReactNativeBlobUtil from 'react-native-blob-util';
import DocumentPicker from 'react-native-document-picker';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { Linking } from 'react-native';
import FileManager from './src/FileManager';

const UPDATE_CONFIG_URL = 'http://114.66.43.215:8888/version.json';
const CURRENT_APP_VERSION = '1.1.3';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ★★★ 颜色主题配置 (艳粉色 -> 淡粉色) ★★★
const THEME = {
  primary: '#FF1493', // 艳粉色 (DeepPink) - 用于按钮、高亮框
  secondary: '#FF69B4', // 热粉色 (HotPink) - 用于次要元素
  light: '#FFB6C1', // 淡粉色 (LightPink) - 用于背景装饰
  bg: '#2a2a2a', // 深色背景
  text: '#FFF0F5', // 淡紫红白 (LavenderBlush) - 用于文本
};

const App = () => {
  const [status, setStatus] = useState('系统初始化...');
  const [serverReady, setServerReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  // ★★★ 新增：下载详情状态 ★★★
  const [downloadDetails, setDownloadDetails] = useState({
    bytesWritten: 0,
    contentLength: 0,
    speed: 0, // bytes/s
    remainingTime: 0, // 秒
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showConsoleMenu, setShowConsoleMenu] = useState(false);
  const consoleMenuAnim = useRef(new Animated.Value(-250)).current;
  const [showLogOverlay, setShowLogOverlay] = useState(false);
  const [hasNewError, setHasNewError] = useState(false);
  const [proxyServer, setProxyServer] = useState('');
  const [isCompatMode, setIsCompatMode] = useState(false);
  const [isInputFixEnabled, setIsInputFixEnabled] = useState(false);
  const [apkDownloading, setApkDownloading] = useState(false);
  const [apkProgress, setApkProgress] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  // ★★★ 旧的文件选择器状态（用于菜单中的导入功能，保持与 FileManager 配合） ★★★
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [fileSelectorCallback, setFileSelectorCallback] = useState<
    ((path: string, name: string) => void) | null
  >(null);
  const [fileSelectorTitle, setFileSelectorTitle] = useState('选择文件');
  const [fileSelectorFilter, setFileSelectorFilter] = useState<
    ((name: string) => boolean) | undefined
  >(undefined);
  const [guideStep, setGuideStep] = useState(0);
  // ★★★ 新增：引导倒计时 ★★★
  const [nextBtnCountdown, setNextBtnCountdown] = useState(5);
  const guideCardScale = useRef(new Animated.Value(0)).current;
  const guideCardOpacity = useRef(new Animated.Value(0)).current;
  const guideCardRotate = useRef(new Animated.Value(0)).current;
  const highlightScale = useRef(new Animated.Value(0)).current;
  const highlightOpacity = useRef(new Animated.Value(0)).current;
  const highlightPulse = useRef(new Animated.Value(1)).current;
  const fingerX = useRef(new Animated.Value(0)).current;
  const fingerY = useRef(new Animated.Value(0)).current;
  const fingerOpacity = useRef(new Animated.Value(0)).current;
  const fingerScale = useRef(new Animated.Value(1)).current;
  const fireworkOpacity = useRef(new Animated.Value(0)).current;
  const fireworkScale = useRef(new Animated.Value(0)).current;
  const [checkingWebView, setCheckingWebView] = useState(true);

  // ★★★ 控制台/菜单动画值 ★★★
  const logOverlayAnim = useRef(new Animated.Value(0)).current;
  const webViewRef = useRef<any>(null);
  const scrollViewRef = useRef<any>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.extractOffset();
      },
    }),
  ).current;

  const targetDir = `${RNFS.DocumentDirectoryPath}/SillyTavern`;
  const nodeProjectDir = `${RNFS.DocumentDirectoryPath}/nodejs-project`;
  const mainJsPath = `${nodeProjectDir}/main.js`;
  const settingsPath = `${targetDir}/app_settings.json`;

  // ★★★ 引导步骤定义 ★★★
  const guideSteps = [
    {
      id: 'welcome',
      title: '欢迎使用 SillyTavern',
      content: '这是一个快速引导，帮助你了解基本操作。\n\n点击「下一步」开始探索吧！',
      action: 'none',
    },
    {
      id: 'console_intro',
      title: '控制台按钮',
      content:
        '看到屏幕右下角那个 🛠️ 按钮了吗？\n\n那是「控制台」入口，可以查看系统日志，发现错误时会变红提醒哦~',
      action: 'highlight_console',
    },
    {
      id: 'console_click',
      title: '打开控制台',
      content: '让我来演示如何打开它...',
      action: 'click_console',
    },
    {
      id: 'console_opened',
      title: '控制台界面',
      content:
        '这里可以查看系统运行日志。\n\n• 蓝色 = 系统信息\n• 红色 = 错误提示\n• 灰色 = 普通日志',
      action: 'show_in_console',
    },
    {
      id: 'menu_intro',
      title: '设置菜单',
      content: '看到左上角的 ☰ 按钮了吗？\n点击它可以打开设置菜单~',
      action: 'highlight_menu',
    },
    {
      id: 'menu_click',
      title: '打开菜单',
      content: '让我来帮你点开它...',
      action: 'click_menu',
    },
    {
      id: 'menu_refresh',
      title: '🔄 刷新页面',
      content: '遇到显示问题？点这里可以重新加载界面。',
      action: 'highlight_menu_item',
      menuIndex: 0,
    },
    {
      id: 'menu_chrome',
      title: '🌐 Chrome 模式',
      content: '用系统浏览器打开酒馆，某些功能可能更稳定。',
      action: 'highlight_menu_item',
      menuIndex: 1,
    },
    {
      id: 'menu_import',
      title: '📂 导入用户数据',
      content: '从备份文件恢复你的角色、聊天记录等数据。',
      action: 'highlight_menu_item',
      menuIndex: 2,
    },
    {
      id: 'menu_zip',
      title: '📦 从 ZIP 安装插件',
      content: '手动安装扩展插件，适用于无法自动下载的情况。',
      action: 'highlight_menu_item',
      menuIndex: 3,
    },
    {
      id: 'menu_compat',
      title: '🖥️ 兼容模式',
      content: '如果界面显示异常（如下图侧边栏被遮挡），开启这个选项试试！',
      action: 'highlight_menu_item',
      menuIndex: 4,
      image: 'compat',
    },
    {
      id: 'menu_reset',
      title: '⚠️ 重置系统资源',
      content: '遇到严重问题时可以重新下载所有资源。\n注意：这会删除插件！',
      action: 'highlight_menu_item',
      menuIndex: 5,
    },
    {
      id: 'menu_tutorial',
      title: '📖 必读教程！',
      content:
        '遇到问题先看这里！\n\n绝大多数问题（如连不上、怎么用）在教程里都有详细解答。\n\n请务必看完教程再提问，否则可能会被忽略哦！',
      action: 'highlight_menu_item',
      menuIndex: 6,
    },
    {
      id: 'complete',
      title: '🎉 恭喜你！',
      content: '你已经掌握了基本操作！\n\n现在可以尽情探索 SillyTavern 了，祝你使用愉快！',
      action: 'firework',
    },
  ];

  // ★★★ 开启控制台动画 ★★★
  const openLogOverlayAnimated = (callback?: () => void) => {
    setShowLogOverlay(true);
    logOverlayAnim.setValue(0);
    Animated.spring(logOverlayAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start(callback);
  };

  // ★★★ 关闭控制台动画 ★★★
  const closeLogOverlayAnimated = (callback?: () => void) => {
    Animated.timing(logOverlayAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowLogOverlay(false);
      if (callback) callback();
    });
  };

  // ★★★ 开关控制台菜单（带动画） ★★★
  const toggleConsoleMenu = (forceOpen: boolean | null = null) => {
    const shouldOpen = forceOpen !== null ? forceOpen : !showConsoleMenu;
    const toValue = shouldOpen ? 0 : -250;
    setShowConsoleMenu(shouldOpen);
    Animated.spring(consoleMenuAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  };

  // 1. 解析版本号的函数
  const getChromeVersion = (ua: string) => {
    const match = ua.match(/Chrome\/(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
  };

  // 2. 跳转更新的函数
  const openWebViewUpdate = () => {
    Alert.alert(
      '组件版本过低',
      '检测到您的 "Android System WebView" 版本过低，这导致画面黑屏。\n\n请务必更新该组件，或下载最新版 APK 安装。',
      [
        {
          text: '去 Google Play 更新',
          onPress: () =>
            Linking.openURL('market://details?id=com.google.android.webview').catch(() => {
              Linking.openURL(
                'https://play.google.com/store/apps/details?id=com.google.android.webview',
              );
            }),
        },
        {
          text: '下载安装包 (APKPure)',
          onPress: () =>
            Linking.openURL(
              'https://m.apkpure.com/android-system-webview/com.google.android.webview/download',
            ),
        },
        { text: '取消', style: 'cancel' },
      ],
    );
  };

  // ★★★ 引导卡片入场动画 ★★★
  const animateCardIn = (callback?: () => void) => {
    guideCardScale.setValue(0);
    guideCardOpacity.setValue(0);
    guideCardRotate.setValue(-10);

    Animated.parallel([
      Animated.spring(guideCardScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 60,
      }),
      Animated.timing(guideCardOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(guideCardRotate, {
        toValue: 0,
        useNativeDriver: true,
        friction: 5,
      }),
    ]).start(callback);
  };

  const pulseAnimation = useRef<Animated.CompositeAnimation | null>(null);
  // ★★★ 高亮框动画 ★★★
  const animateHighlight = (callback?: () => void) => {
    // 先停止之前的动画
    if (pulseAnimation.current) {
      pulseAnimation.current.stop();
    }

    highlightScale.setValue(0);
    highlightOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(highlightScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 60,
      }),
      Animated.timing(highlightOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      pulseAnimation.current = Animated.loop(
        Animated.sequence([
          Animated.timing(highlightPulse, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(highlightPulse, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseAnimation.current.start();
      if (callback) callback();
    });
  };

  // ★★★ 手指点击动画 ★★★
  const animateFingerClick = (
    x: number,
    y: number,
    onClickMoment?: () => void,
    callback?: () => void,
  ) => {
    fingerX.setValue(x + 50);
    fingerY.setValue(y + 50);
    fingerOpacity.setValue(0);
    fingerScale.setValue(1);

    // 隐藏高亮框
    Animated.timing(highlightOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      // 手指出现
      Animated.timing(fingerOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // 移动到按钮
      Animated.parallel([
        Animated.timing(fingerX, {
          toValue: x,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(fingerY, {
          toValue: y,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // 点击效果
      Animated.timing(fingerScale, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onClickMoment) onClickMoment();

      Animated.sequence([
        Animated.timing(fingerScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.delay(200),
        Animated.timing(fingerOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(callback);
    });
  };

  // ★★★ 烟花动画 ★★★
  const animateFirework = (callback?: () => void) => {
    fireworkOpacity.setValue(0);
    fireworkScale.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fireworkOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(fireworkScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 3,
          tension: 40,
        }),
      ]),
      Animated.delay(1500),
      Animated.parallel([
        Animated.timing(fireworkOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(fireworkScale, {
          toValue: 2,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start(callback);
  };

  // ★★★ 处理下一步 (简化版) ★★★
  const handleNextStep = () => {
    const nextIndex = guideStep + 1;
    if (nextIndex >= guideSteps.length) {
      completeGuide();
      return;
    }

    // 立即切换步骤
    setGuideStep(nextIndex);
    const nextStep = guideSteps[nextIndex];

    // 触发副作用（手指点击演示、烟花等）
    if (nextStep.id === 'console_click') {
      setTimeout(() => {
        animateFingerClick(SCREEN_WIDTH - 50, SCREEN_HEIGHT - 120, () =>
          openLogOverlayAnimated(),
        );
      }, 300);
    } else if (nextStep.id === 'menu_click') {
      setTimeout(() => {
        animateFingerClick(35, 55, () => toggleConsoleMenu(true));
      }, 300);
    } else if (nextStep.action === 'firework') {
      toggleConsoleMenu(false);
      closeLogOverlayAnimated();
      animateFirework();
    } else if (nextStep.action && nextStep.action.includes('highlight')) {
      animateHighlight();
    }
  };

  const handlePrevStep = () => {
    if (guideStep <= 0) return;

    const currentStep = guideSteps[guideStep];
    const prevIndex = guideStep - 1;
    const prevStep = guideSteps[prevIndex];

    setGuideStep(prevIndex);

    // 如果当前在控制台相关步骤，且返回到非控制台步骤
    if (
      ['console_opened', 'console_click'].includes(currentStep.id) &&
      !['console_opened', 'console_click', 'show_in_console'].includes(
        prevStep.id,
      )
    ) {
      closeLogOverlayAnimated();
    }

    // 如果当前在菜单相关步骤，且返回到非菜单步骤
    if (
      currentStep.action === 'highlight_menu_item' &&
      prevStep.action !== 'highlight_menu_item'
    ) {
      toggleConsoleMenu(false);
    }
  };

  // 把原来的 renderHighlightBorder 替换成这个
  const renderHighlightBorder = useCallback(
    (targetIndex: number) => {
      const step = guideSteps[guideStep] || {};
      if (
        !showGuide ||
        step.action !== 'highlight_menu_item' ||
        step.menuIndex !== targetIndex
      ) {
        return null;
      }

      return (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: 2,
            borderColor: '#FF1493',
            borderRadius: 5,
            backgroundColor: 'rgba(255, 20, 147, 0.1)',
            zIndex: 999,
          }}
        />
      );
    },
    [showGuide, guideStep, guideSteps],
  ); // 只在这两个值变化时重新创建

  // ★★★ 开始引导 (简化版) ★★★
  const startGuide = () => {
    setShowGuide(true);
    setGuideStep(0);
    // setGuidePhase('idle');
    highlightOpacity.setValue(0);

    // 关闭可能打开的面板
    if (showLogOverlay) {
      toggleConsoleMenu(false);
      setShowLogOverlay(false);
    }

    // 入场动画
    setTimeout(() => animateCardIn(), 300);
  };

  // ★★★ 完成引导 ★★★
  const completeGuide = async () => {
    Animated.parallel([
      Animated.timing(guideCardOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(guideCardScale, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      setShowGuide(false);
      setGuideStep(0);

      try {
        let existingSettings: any = {};
        if (await RNFS.exists(settingsPath)) {
          const content = await RNFS.readFile(settingsPath, 'utf8');
          existingSettings = JSON.parse(content);
        }
        const settings = {
          ...existingSettings,
          compatibilityMode: isCompatMode,
          proxyServer: proxyServer,
          guideCompleted: true,
        };
        if (!(await RNFS.exists(targetDir))) await RNFS.mkdir(targetDir);
        await RNFS.writeFile(settingsPath, JSON.stringify(settings), 'utf8');
      } catch (e) {}
    });
  };

  // ★★★ 检查并显示引导 ★★★
  const checkAndShowGuide = async () => {
    try {
      if (await RNFS.exists(settingsPath)) {
        const content = await RNFS.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(content);
        if (!settings.guideCompleted) {
          setTimeout(() => startGuide(), 1500);
        }
      } else {
        setTimeout(() => startGuide(), 1500);
      }
    } catch (e) {
      setTimeout(() => startGuide(), 1500);
    }
  };

  // ★★★ 引导倒计时逻辑 ★★★
  useEffect(() => {
    if (showGuide) {
      setNextBtnCountdown(5); // 重置为 5 秒
      const timer = setInterval(() => {
        setNextBtnCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [guideStep, showGuide]);

  useEffect(() => {
    requestPermissions();
    loadSettings();
    setTimeout(() => {
      initSystem(); // 可能在这里卡住了
    }, 1000);
  }, []);

  // 放在其他 useEffect 附近
  useEffect(() => {
    return () => {
      // 组件卸载时清理所有动画
      if (pulseAnimation.current) {
        pulseAnimation.current.stop();
      }
      // 也可以清理其他可能运行的动画
      highlightPulse.stopAnimation();
      guideCardScale.stopAnimation();
      guideCardOpacity.stopAnimation();
    };
  }, []);

  // ★★★ 修复返回键逻辑：只模拟 Esc 键，永不退出 App ★★★
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        // 1. 如果正在引导中，拦截返回键，什么都不做
        if (showGuide) {
          return true;
        }

        // 2. 注入脚本：模拟按下 ESC 键
        // 这会关闭 SillyTavern 的弹窗、侧边栏、图片查看器等
        const sendEscScript = `
        (function() {
          // 优先尝试关闭全屏图片预览
          const bigImg = document.querySelector('#img_preview_overlay, #image-modal');
          if (bigImg && getComputedStyle(bigImg).display !== 'none') {
             bigImg.click();
             return;
          }

          // 模拟 ESC 键盘事件
          const escEvent = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            view: window,
            key: 'Escape',
            code: 'Escape',
            keyCode: 27
          });
          document.dispatchEvent(escEvent);

          // 额外尝试点击遮罩层（处理侧边栏）
          const overlays = document.querySelectorAll('.drawer-overlay');
          overlays.forEach(o => {
            if (getComputedStyle(o).display !== 'none') o.click();
          });
        })();
      `;

        if (serverReady && webViewRef.current) {
          webViewRef.current.injectJavaScript(sendEscScript);
        }

        // 3. 这里不再检测双击，也不调用 exitApp()
        // 只是单纯的 return true。
        // 在 Android 开发中，返回 true 意味着：“我处理了这个事件，系统请不要执行默认的后退/退出操作”
        return true;
      },
    );

    return () => backHandler.remove();
  }, [serverReady, showGuide]);

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

  const loadSettings = async () => {
    try {
      if (await RNFS.exists(settingsPath)) {
        const content = await RNFS.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(content);
        if (settings.compatibilityMode !== undefined) {
          setIsCompatMode(settings.compatibilityMode);
        }
        // ★★★ 新增：加载输入框修复设置 ★★★
        if (settings.inputFixEnabled !== undefined) {
          setIsInputFixEnabled(settings.inputFixEnabled);
        }
        if (settings.proxyServer) {
          setProxyServer(settings.proxyServer);
        }
        addLog(`[系统] 已加载设置`);
      }
    } catch (e) {}
  };

  const configureProxyAndroid = () => {
    Alert.alert(
      '配置代理服务器',
      proxyServer
        ? `当前代理: ${proxyServer}\n\n选择操作：`
        : '未配置代理，扩展安装将直连 GitHub。\n\n如果安装失败，建议：\n1. 开启 VPN\n2. 或配置代理服务器',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除代理',
          onPress: async () => {
            setProxyServer('');
            let existingSettings: any = {};
            try {
              if (await RNFS.exists(settingsPath)) {
                const content = await RNFS.readFile(settingsPath, 'utf8');
                existingSettings = JSON.parse(content);
              }
            } catch (e) {}
            const settings = {
              ...existingSettings,
              compatibilityMode: isCompatMode,
              proxyServer: '',
            };
            await RNFS.writeFile(
              settingsPath,
              JSON.stringify(settings),
              'utf8',
            );
            addLog('[系统] 代理已清除');
          },
        },
        {
          text: '设置代理',
          onPress: () => {
            addLog(
              '[提示] 请在 SillyTavern 的 config.yaml 中配置 EXTENSION_PROXY',
            );
            Alert.alert(
              '手动配置',
              '请编辑 SillyTavern/data/config.yaml\n添加一行:\nextensionProxy: http://your-server:port',
            );
          },
        },
      ],
    );
  };

  const toggleCompatMode = async () => {
    const newMode = !isCompatMode;
    setIsCompatMode(newMode);
    try {
      let existingSettings: any = {};
      if (await RNFS.exists(settingsPath)) {
        const content = await RNFS.readFile(settingsPath, 'utf8');
        existingSettings = JSON.parse(content);
      }
      const settings = {
        ...existingSettings,
        compatibilityMode: newMode,
        proxyServer: proxyServer,
      };
      if (!(await RNFS.exists(targetDir))) await RNFS.mkdir(targetDir);
      await RNFS.writeFile(settingsPath, JSON.stringify(settings), 'utf8');

      Alert.alert(
        '模式已切换',
        `已切换为：${
          newMode ? '兼容模式 (强制排版修复)' : '普通模式 (默认 UI)'
        }\n\n建议重启 APP 生效，或者直接刷新页面。`,
        [
          { text: '稍后重启', style: 'cancel' },
          {
            text: '立即刷新',
            onPress: () => webViewRef.current?.reload(),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('保存设置失败', e.message);
    }
  };

  const toggleInputFix = async () => {
    const newMode = !isInputFixEnabled;
    setIsInputFixEnabled(newMode);
    try {
      let existingSettings: any = {};
      if (await RNFS.exists(settingsPath)) {
        const content = await RNFS.readFile(settingsPath, 'utf8');
        existingSettings = JSON.parse(content);
      }
      const settings = {
        ...existingSettings,
        compatibilityMode: isCompatMode,
        inputFixEnabled: newMode,
        proxyServer: proxyServer,
      };
      if (!(await RNFS.exists(targetDir))) await RNFS.mkdir(targetDir);
      await RNFS.writeFile(settingsPath, JSON.stringify(settings), 'utf8');

      Alert.alert(
        '设置已更新',
        `输入框修复：${newMode ? '已开启' : '已关闭'}\n\n点击刷新立即生效。`,
        [
          { text: '稍后', style: 'cancel' },
          {
            text: '立即刷新',
            onPress: () => webViewRef.current?.reload(),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('保存设置失败', e.message);
    }
  };

  const addLog = (msg: string) => {
    setLogs((prev: string[]) => {
      const newLogs = [...prev, msg];
      return newLogs.length > 5 ? newLogs.slice(-5) : newLogs;
    });
  };

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
        if (chunk) {
            const str = chunk.toString().trim();
            // 过滤进度条和频繁日志，防止 Bridge 崩溃
            if (str.length > 0 && !str.includes('%') && !str.includes('\\r')) {
                rn_bridge.channel.send('LOG:' + str);
            }
        }
        return originalStdout.apply(process.stdout, arguments);
    };
    process.stderr.write = function(chunk, encoding, callback) {
        if (chunk) rn_bridge.channel.send('ERR:' + chunk.toString().trim());
        return originalStderr.apply(process.stderr, arguments);
    };
    process.on('uncaughtException', (err) => {
        rn_bridge.channel.send('ERR: [致命错误] ' + err.message + '\\n' + err.stack);
    });

    try {
        const v8 = require('v8');
        const totalHeap = v8.getHeapStatistics().total_available_size;
        const totalHeapMb = (totalHeap / 1024 / 1024).toFixed(0);
        rn_bridge.channel.send('LOG: [系统] Node堆内存限制: ' + totalHeapMb + 'MB');
    } catch (e) {}

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
                // 限制内存为 1024MB，2GB 可能过大导致 Native OOM
                process.env.NODE_OPTIONS = "--no-warnings --max-old-space-size=1024";
                process.env.NO_COLOR = "1";
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

      // ★★★ 检查是否需要从 Assets 解压内置包 ★★★
      if (!serverJsExists) {
        addLog('检测到首次运行，尝试查找内置资源...');
        try {
          const assetPayloadPath = 'payload.zip'; // 在 assets 根目录下
          const destPayloadPath = `${RNFS.DocumentDirectoryPath}/payload.zip`;

          // 尝试从 assets 复制到文档目录
          try {
            if (await RNFS.exists(destPayloadPath))
              await RNFS.unlink(destPayloadPath);

            addLog('正在释放内置资源...');
            await RNFS.copyFileAssets(assetPayloadPath, destPayloadPath);

            addLog('正在解压内置资源...');
            if (await RNFS.exists(targetDir)) await RNFS.unlink(targetDir);
            await RNFS.mkdir(targetDir);
            await unzip(destPayloadPath, targetDir);
            await RNFS.unlink(destPayloadPath);

            addLog('内置资源部署完成');
            // ★★★ 写入内置版本号 1.1.7 ★★★
            await RNFS.writeFile(
              localVersionPath,
              JSON.stringify({ version: '1.1.7', desc: 'Built-in' }),
              'utf8',
            );

            // 重新检查 serverJsExists
            if (await RNFS.exists(`${targetDir}/server.js`)) {
              startNode();
              return;
            }
          } catch (assetErr) {
            addLog('未找到内置资源或释放失败，请手动检查更新');
          }
        } catch (e: any) {
          addLog('内置资源处理出错: ' + e.message);
        }
      }

      // ★★★ 移除自动更新检查，直接启动 ★★★
      startNode();
    } catch (err: any) {
      setStatus(`系统初始化错误: ${err.message}`);
    }
  };

  // ★★★ 手动检查更新函数 ★★★
  const handleCheckUpdate = async () => {
    toggleConsoleMenu(false); // 关闭菜单
    addLog('正在手动检查更新...');
    const localVersionPath = `${targetDir}/version_info.json`;

    try {
      const res = await fetch(`${UPDATE_CONFIG_URL}?t=${new Date().getTime()}`);
      if (res.ok) {
        const remoteConfig = await res.json();

        // 1. 检查 APK 更新
        if (
          remoteConfig.apkVersion &&
          remoteConfig.apkVersion > CURRENT_APP_VERSION
        ) {
          Alert.alert(
            '发现新版本 APP',
            `检测到客户端有更新 (${remoteConfig.apkVersion})。\n\n更新内容: ${
              remoteConfig.apkDesc || '性能优化与Bug修复'
            }`,
            [
              { text: '稍后', style: 'cancel' },
              {
                text: '立即更新',
                onPress: () => downloadAppUpdate(remoteConfig.apkUrl),
              },
            ],
          );
          return;
        }

        // 2. 检查资源更新
        const remoteVer = remoteConfig.version;
        let localVer = '0.0.0';
        if (await RNFS.exists(localVersionPath)) {
          const localContent = await RNFS.readFile(localVersionPath, 'utf8');
          try {
            localVer = JSON.parse(localContent).version || '0.0.0';
          } catch (e) {}
        }

        if (localVer !== remoteVer) {
          Alert.alert(
            '发现资源更新',
            `最新版本: ${remoteVer}\n当前版本: ${localVer}\n\n是否立即更新？`,
            [
              { text: '取消', style: 'cancel' },
              { text: '更新', onPress: () => downloadAssets(remoteConfig) },
            ],
          );
        } else {
          Alert.alert('已是最新', `当前版本 ${localVer} 已是最新版。`);
          addLog('当前已是最新版本');
        }
      } else {
        Alert.alert('检查失败', '无法连接到更新服务器');
        addLog('无法连接更新服务器');
      }
    } catch (e: any) {
      Alert.alert('检查出错', e.message);
      addLog('检查更新出错: ' + e.message);
    }
  };

  const checkResourceUpdate = async (
    remoteConfig: any,
    localVersionPath: string,
    serverJsExists: boolean,
  ) => {
    const remoteVer = remoteConfig.version;
    let localVer = '0.0.0';
    if (serverJsExists && (await RNFS.exists(localVersionPath))) {
      const localContent = await RNFS.readFile(localVersionPath, 'utf8');
      try {
        localVer = JSON.parse(localContent).version || '0.0.0';
      } catch (e) {}
    }
    if (!serverJsExists || localVer !== remoteVer) {
      addLog(`发现资源更新: ${remoteVer} (本地: ${localVer})`);
      downloadAssets(remoteConfig);
    } else {
      addLog('资源已是最新，启动中...');
      startNode();
    }
  };

  // 下载 APK 更新
  const downloadAppUpdate = async (apkUrl: string) => {
    setApkDownloading(true);
    setApkProgress(0);
    setDownloadDetails({
      bytesWritten: 0,
      contentLength: 0,
      speed: 0,
      remainingTime: 0,
    });
    setStatus('正在下载新版本...');
    addLog('开始下载 APK...');

    // 用于存储实际下载进度（后台更新）
    let actualProgress = 0;
    let actualDetails = {
      bytesWritten: 0,
      contentLength: 0,
      speed: 0,
      remainingTime: 0,
    };
    let downloadCompleted = false;
    let lastBytesWritten = 0;
    let lastSpeedCheckTime = Date.now();

    // 启动定时器，每 200ms 读取一次进度并更新UI
    const progressInterval = setInterval(() => {
      if (!downloadCompleted) {
        setApkProgress(actualProgress);
        setDownloadDetails({ ...actualDetails });
      }
    }, 200);

    try {
      const apkPath = `${RNFS.DownloadDirectoryPath}/SillyAndroid_Update.apk`;

      // 删除旧文件
      if (await RNFS.exists(apkPath)) {
        await RNFS.unlink(apkPath);
      }

      // 后台下载，回调只更新变量，不直接更新UI
      const ret = RNFS.downloadFile({
        fromUrl: apkUrl,
        toFile: apkPath,
        progressDivider: 1, // 尽可能频繁地获取进度
        progress: (res) => {
          const now = Date.now();
          const timeDelta = (now - lastSpeedCheckTime) / 1000; // 秒

          if (res.contentLength > 0) {
            actualProgress = res.bytesWritten / res.contentLength;

            // 计算速度（每秒字节数）
            if (timeDelta > 0.5) {
              // 每 0.5 秒更新一次速度
              const bytesDelta = res.bytesWritten - lastBytesWritten;
              const speed = bytesDelta / timeDelta;
              const remainingBytes = res.contentLength - res.bytesWritten;
              const remainingTime = speed > 0 ? remainingBytes / speed : 0;

              actualDetails = {
                bytesWritten: res.bytesWritten,
                contentLength: res.contentLength,
                speed: speed,
                remainingTime: remainingTime,
              };

              lastBytesWritten = res.bytesWritten;
              lastSpeedCheckTime = now;
            }
          }
        },
      });

      const result = await ret.promise;

      // 下载完成，停止轮询
      downloadCompleted = true;
      clearInterval(progressInterval);

      if (result.statusCode === 200) {
        setApkProgress(1);
        setApkDownloading(false);
        addLog('APK 下载完成，正在打开安装...');

        // 打开安装界面
        ReactNativeBlobUtil.android.actionViewIntent(
          apkPath,
          'application/vnd.android.package-archive',
        );
      } else {
        throw new Error('下载失败 code:' + result.statusCode);
      }
    } catch (e: any) {
      clearInterval(progressInterval);
      setApkDownloading(false);
      addLog('APK下载失败: ' + e.message);
      Alert.alert('下载出错', '无法下载更新: ' + e.message);
    }
  };

  // ★★★ 格式化文件大小 ★★★
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // ★★★ 格式化剩余时间 ★★★
  const formatTime = (seconds: number): string => {
    if (seconds <= 0 || !isFinite(seconds)) return '计算中...';
    if (seconds < 60) return `约 ${Math.ceil(seconds)} 秒`;
    if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`;
    return `约 ${(seconds / 3600).toFixed(1)} 小时`;
  };

  const downloadAssets = async (preFetchedConfig: any = null) => {
    setDownloading(true);
    setProgress(0);
    setDownloadDetails({
      bytesWritten: 0,
      contentLength: 0,
      speed: 0,
      remainingTime: 0,
    });

    let actualProgress = 0;
    let actualDetails = {
      bytesWritten: 0,
      contentLength: 0,
      speed: 0,
      remainingTime: 0,
    };
    let downloadCompleted = false;
    let lastBytesWritten = 0;
    let lastSpeedCheckTime = Date.now();

    // ★★★ 定时更新 UI（每 200ms）★★★
    const progressInterval = setInterval(() => {
      if (!downloadCompleted) {
        setProgress(actualProgress);
        setDownloadDetails({ ...actualDetails });
      }
    }, 200);
    try {
      let config = preFetchedConfig;
      if (!config) {
        const configRes = await fetch(
          `${UPDATE_CONFIG_URL}?t=${new Date().getTime()}`,
        );
        config = await configRes.json();
      }
      const downloadUrl = String(config?.downloadUrl || '');
      if (!downloadUrl) {
        throw new Error('无法获取下载地址');
      }
      const version = config?.version || '最新版';
      setStatus(`正在下载系统资源 (v${version})...`);

      const tempZip = `${RNFS.DocumentDirectoryPath}/payload.zip`;
      if (await RNFS.exists(tempZip)) await RNFS.unlink(tempZip);
      const ret = RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: tempZip,
        progressDivider: 1,
        progress: (res) => {
          const now = Date.now();
          const timeDelta = (now - lastSpeedCheckTime) / 1000; // 秒

          if (res.contentLength > 0) {
            actualProgress = res.bytesWritten / res.contentLength;

            // 计算速度（每秒字节数）
            if (timeDelta > 0.5) {
              // 每 0.5 秒更新一次速度
              const bytesDelta = res.bytesWritten - lastBytesWritten;
              const speed = bytesDelta / timeDelta;
              const remainingBytes = res.contentLength - res.bytesWritten;
              const remainingTime = speed > 0 ? remainingBytes / speed : 0;

              actualDetails = {
                bytesWritten: res.bytesWritten,
                contentLength: res.contentLength,
                speed: speed,
                remainingTime: remainingTime,
              };

              lastBytesWritten = res.bytesWritten;
              lastSpeedCheckTime = now;
            }
          }
        },
      });
      const result = await ret.promise;
      downloadCompleted = true;
      clearInterval(progressInterval);
      if (result.statusCode === 200) {
        setProgress(1);
        setDownloading(false);
        setStatus('正在解压与合并数据...');
        const userDataToPreserve = [
          'config.yaml',
          'data',
          'public/user',
          'plugins',
        ];
        const backupDir = `${RNFS.DocumentDirectoryPath}/_user_backup_${Date.now()}`;
        await RNFS.mkdir(backupDir);
        addLog('备份用户数据...');
        // ✅ 改用流式复制，避免内存溢出
        for (const item of userDataToPreserve) {
          const srcPath = `${targetDir}/${item}`;
          const dstPath = `${backupDir}/${item}`;

          if (await RNFS.exists(srcPath)) {
            try {
              const stat = await RNFS.stat(srcPath);
              const dstParent = dstPath.substring(0, dstPath.lastIndexOf('/'));

              if (!(await RNFS.exists(dstParent))) {
                await RNFS.mkdir(dstParent);
              }

              if (stat.isDirectory()) {
                // 目录：递归复制后删除原目录
                await copyDirectorySafely(srcPath, dstPath);
                await deleteDirectoryRecursive(srcPath);
              } else {
                // 文件：直接移动
                await RNFS.moveFile(srcPath, dstPath);
              }

              addLog(`  备份: ${item}`);
            } catch (e: any) {
              addLog(`  备份失败: ${item} - ${e.message}`);
            }
          }
        }
        if (await RNFS.exists(targetDir)) {
          addLog('清理旧版本文件...');
          try {
            await RNFS.unlink(targetDir);
          } catch (e) {
            addLog('使用递归删除...');
            await deleteDirectoryRecursive(targetDir);
          }
        }
        await RNFS.mkdir(targetDir);
        addLog('解压新版本...');
        await unzip(tempZip, targetDir);
        addLog('恢复用户数据...');
        // ✅ 恢复时也使用流式复制
        for (const item of userDataToPreserve) {
          const srcPath = `${backupDir}/${item}`;
          const dstPath = `${targetDir}/${item}`;

          if (await RNFS.exists(srcPath)) {
            try {
              const stat = await RNFS.stat(srcPath);

              if (await RNFS.exists(dstPath)) {
                if (stat.isDirectory()) {
                  await deleteDirectoryRecursive(dstPath);
                } else {
                  await RNFS.unlink(dstPath);
                }
              }

              if (stat.isDirectory()) {
                await copyDirectorySafely(srcPath, dstPath);
              } else {
                await RNFS.moveFile(srcPath, dstPath);
              }

              addLog(`  恢复: ${item}`);
            } catch (e: any) {
              addLog(`  恢复失败: ${item} - ${e.message}`);
            }
          }
        }
        // 清理备份目录
        try {
          await deleteDirectoryRecursive(backupDir);
        } catch (e) {}

        await RNFS.unlink(tempZip);
        await RNFS.writeFile(
          `${targetDir}/version_info.json`,
          JSON.stringify(config),
          'utf8',
        );
        addLog('资源更新完成');
        startNode();
      } else {
        throw new Error('下载失败 code:' + result.statusCode);
      }
    } catch (e: any) {
      clearInterval(progressInterval);
      setDownloading(false);
      setStatus(`资源更新失败: ${e.message}`);
      Alert.alert('错误', `资源下载失败，请检查网络。\n${e.message}`);
    }
  };

  // 递归删除目录（如果你还没有这个函数）
  const deleteDirectoryRecursive = async (dirPath: string) => {
    if (!(await RNFS.exists(dirPath))) return;

    const stat = await RNFS.stat(dirPath);
    if (!stat.isDirectory()) {
      await RNFS.unlink(dirPath);
      return;
    }

    const items = await RNFS.readDir(dirPath);
    for (const item of items) {
      if (item.isDirectory()) {
        await deleteDirectoryRecursive(item.path);
      } else {
        await RNFS.unlink(item.path);
      }
    }

    await RNFS.unlink(dirPath);
  };

  const fixCsrfConfig = async () => {
    const configPath = `${targetDir}/config.yaml`;

    try {
      if (!(await RNFS.exists(configPath))) {
        return;
      }

      let content = await RNFS.readFile(configPath, 'utf8');

      if (/disableCsrfProtection:\s*true/.test(content)) {
        return;
      }

      if (/disableCsrfProtection:\s*false/.test(content)) {
        content = content.replace(
          /disableCsrfProtection:\s*false/,
          'disableCsrfProtection: true',
        );
        addLog('[系统] 自动启用 CSRF 兼容模式');
      } else {
        content = content.trimEnd() + '\ndisableCsrfProtection: true\n';
        addLog('[系统] 添加 CSRF 兼容配置');
      }

      await RNFS.writeFile(configPath, content, 'utf8');
    } catch (error: any) {
      console.log('CSRF config fix error:', error.message);
    }
  };

  const startNode = async () => {
    await fixCsrfConfig();

    setStatus('正在启动本地服务器...');
    nodejs.start('main.js');
    let started = false;
    // nodejs.channel.removeAllListeners('message'); // removeAllListeners 不存在
    nodejs.channel.addListener('message', (msg) => {
      if (typeof msg !== 'string') return;

      const IGNORABLE_WARNINGS = [
        'config.yaml not found',
        'Creating a new one with default values',
        'World info file',
        'CSRF protection is disabled',
        'extract-zip',
        'Cannot find package',
        'unzipper failed',
        '[Extract] Trying',
        'extract-zip failed',
      ];

      if (msg.startsWith('ERR:')) {
        const errorContent = msg.replace('ERR:', '').trim();
        if (
          errorContent &&
          !IGNORABLE_WARNINGS.some((i) => errorContent.includes(i))
        ) {
          setHasNewError(true);
        }
      }

      if (msg.startsWith('LOG:') || msg.startsWith('ERR:')) {
        addLog(msg);
      }

      // ★★★ 移除：不再将后台错误直接显示在启动界面，避免惊吓用户 ★★★
      // if (msg.startsWith('ERR:')) setStatus('后台错误: ' + msg);

      if (msg === 'READY') setStatus('服务环境准备就绪...');
      if (msg === 'READY' && !started) {
        started = true;
        nodejs.channel.send(`START:${targetDir}`);
      }
      if (msg === 'SERVER_STARTED') {
        setStatus('服务已启动，正在连接界面...');
        checkServer();
      }
    });
  };

  const handleManualExtensionInstall = async (
    failedUrl: string,
    errorMessage: string,
  ) => {
    let repoUrl = failedUrl || '';

    Alert.alert(
      '扩展安装失败',
      `${
        errorMessage || '无法自动下载扩展'
      }\n\n可能是因为：\n• Gitee 需要人机验证\n• GitHub 网络问题\n• 仓库地址错误\n\n请选择手动安装方式：`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '浏览器下载',
          onPress: async () => {
            let zipUrl = repoUrl;
            if (repoUrl.includes('gitee.com')) {
              zipUrl =
                repoUrl.replace(/\.git\/?$/, '') +
                '/repository/archive/master.zip';
            } else if (repoUrl.includes('github.com')) {
              zipUrl =
                repoUrl.replace(/\.git\/?$/, '') +
                '/archive/refs/heads/main.zip';
            }

            try {
              await Linking.openURL(zipUrl || repoUrl);
              setTimeout(() => {
                Alert.alert(
                  '下载完成后',
                  '下载完成后，请点击「选择 ZIP 安装」按钮来安装扩展',
                  [
                    { text: '知道了' },
                    {
                      text: '选择 ZIP 安装',
                      onPress: () => pickAndInstallExtensionZip(),
                    },
                  ],
                );
              }, 1000);
            } catch (e: any) {
              Alert.alert('错误', '无法打开浏览器：' + e.message);
            }
          },
        },
        {
          text: '选择 ZIP 安装',
          onPress: () => pickAndInstallExtensionZip(),
        },
      ],
    );
  };

  const pickAndInstallExtensionZip = async () => {
    try {
      addLog('[扩展安装] 请选择扩展 ZIP 文件...');

      const res = await DocumentPicker.pick({
        type: [
          '*/*',
          'application/octet-stream',
          'application/json',
          'text/plain',
          'text/*',
        ],
        mode: 'import',
        copyTo: 'cachesDirectory',
      });

      const pickedFile = res[0];
      const sourcePath = pickedFile.fileCopyUri || pickedFile.uri;
      const fileName = pickedFile.name || 'extension.zip';

      addLog(`[扩展安装] 已选择: ${fileName}`);
      addLog('[扩展安装] 正在读取文件...');

      const base64Data = await RNFS.readFile(
        sourcePath.replace('file://', ''),
        'base64',
      );
      addLog(
        `[扩展安装] 文件大小: ${(base64Data.length / 1024).toFixed(1)} KB`,
      );

      if (webViewRef.current) {
        const installScript = `
          (async function() {
            try {
              if (typeof toastr !== 'undefined') {
                toastr.info('正在安装扩展...', '', { timeOut: 0 });
              }

              let headers = { 'Content-Type': 'application/json' };
              if (typeof getRequestHeaders === 'function') {
                headers = getRequestHeaders();
                headers['Content-Type'] = 'application/json';
              }

              const response = await fetch('/api/extensions/install-from-zip', {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify({
                  filename: '${fileName}',
                  data: '${base64Data}'
                })
              });

              if (typeof toastr !== 'undefined') {
                toastr.clear();
              }

              if (response.ok) {
                const result = await response.json();
                if (typeof toastr !== 'undefined') {
                  toastr.success('扩展安装成功！请刷新页面。', '', { timeOut: 5000 });
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'extension_install_success',
                  name: result.display_name || '${fileName}'
                }));
              } else {
                const errorText = await response.text();
                if (typeof toastr !== 'undefined') {
                  toastr.error('安装失败: ' + errorText);
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'extension_zip_install_error',
                  message: errorText
                }));
              }
            } catch (e) {
              if (typeof toastr !== 'undefined') {
                toastr.error('安装出错: ' + e.message);
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'extension_zip_install_error',
                message: e.message
              }));
            }
          })();
          true;
        `;

        webViewRef.current.injectJavaScript(installScript);
        addLog('[扩展安装] 已发送安装请求，等待响应...');
      }
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) {
        addLog('[扩展安装] 用户取消选择');
      } else {
        Alert.alert('错误', '选择文件失败：' + err.message);
        addLog('[扩展安装] 错误: ' + err.message);
      }
    }
  };

  const checkServer = async () => {
    let retries = 0;
    while (retries < 60) {
      try {
        const res = await fetch('http://127.0.0.1:8000', { method: 'HEAD' });
        if (res.ok || res.status) {
          setServerReady(true);
          checkAndShowGuide();
          return;
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
      retries++;
    }
    setStatus('连接超时，请尝试完全关闭 APP 后重试');
  };

  const handleReset = async () => {
    Alert.alert('重置资源', '确定要删除所有文件并重新下载吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        onPress: async () => {
          setDownloading(false);
          setServerReady(false);
          setStatus('正在清理旧文件...');
          try {
            if (await RNFS.exists(targetDir)) await RNFS.unlink(targetDir);
            initSystem();
          } catch (e) {}
        },
      },
    ]);
  };

  // ★★★ 导出用户数据 (public + data) ★★★
  const exportUserData = async () => {
    try {
      addLog('正在准备导出...');
const now = new Date();
const dateStr =
  now.getFullYear().toString() +
  (now.getMonth() + 1).toString().padStart(2, '0') +
  now.getDate().toString().padStart(2, '0');
const timeStr =
  now.getHours().toString().padStart(2, '0') +
  now.getMinutes().toString().padStart(2, '0') +
  now.getSeconds().toString().padStart(2, '0');
const backupName = `SillyTavern-Data_${dateStr}_${timeStr}.zip`;

      const tempExportDir = `${RNFS.CachesDirectoryPath}/export_temp_${Date.now()}`;
      const zipPath = `${RNFS.CachesDirectoryPath}/${backupName}`;
      const finalPath = `${RNFS.DownloadDirectoryPath}/${backupName}`;

      // 1. 创建临时目录结构
      await RNFS.mkdir(tempExportDir);

      // 2. 复制 data 目录
      if (await RNFS.exists(`${targetDir}/data`)) {
        addLog('正在复制 data 目录...');
        await copyDirectorySafely(`${targetDir}/data`, `${tempExportDir}/data`);
      }

      // 3. 复制 public 目录
      if (await RNFS.exists(`${targetDir}/public`)) {
        addLog('正在复制 public 目录...');
        await copyDirectorySafely(
          `${targetDir}/public`,
          `${tempExportDir}/public`,
        );
      }

      // 4. 打包
      addLog('正在压缩数据...');
      await zip(tempExportDir, zipPath);

      // 5. 移动到下载目录
      if (await RNFS.exists(finalPath)) {
        await RNFS.unlink(finalPath);
      }
      await RNFS.moveFile(zipPath, finalPath);

      // 6. 清理
      await deleteDirectoryRecursive(tempExportDir);

      addLog(`导出成功: ${backupName}`);
      Alert.alert('导出成功', `备份文件已保存到下载目录：\n${backupName}`, [
        { text: '知道了' },
      ]);
    } catch (err: any) {
      addLog(`导出失败: ${err.message}`);
      Alert.alert('导出失败', err.message);
    }
  };

  const importUserData = async () => {
    try {
      addLog('请求选择文件...');
      const res = await DocumentPicker.pick({
        type: [
          '*/*',
          'application/octet-stream',
          'application/json',
          'text/plain',
          'text/*',
          'application/zip',
        ],
        mode: 'import',
        copyTo: 'cachesDirectory',
      });

      const pickedFile = res[0];
      const sourcePath = String(pickedFile.fileCopyUri || pickedFile.uri).replace(
        'file://',
        '',
      );
      const fileName = pickedFile.name || 'imported_file';
      const lowerName = fileName.toLowerCase();

      if (lowerName.endsWith('.zip')) {
        addLog('正在分析压缩包...');
        const tempUnzipDir = `${RNFS.CachesDirectoryPath}/import_temp_${Date.now()}`;
        await RNFS.mkdir(tempUnzipDir);

        try {
          await unzip(sourcePath, tempUnzipDir);

          // 检查结构
          const hasData = await RNFS.exists(`${tempUnzipDir}/data`);
          const hasPublic = await RNFS.exists(`${tempUnzipDir}/public`);

          if (hasData || hasPublic) {
            // 新版备份结构：选择模式
            Alert.alert(
              '恢复备份',
              '检测到完整的备份包 (包含 data/public)。\n请选择恢复模式：',
              [
                { text: '取消', style: 'cancel', onPress: () => deleteDirectoryRecursive(tempUnzipDir) },
                {
                  text: '📥 合并 (跳过现有)',
                  onPress: async () => {
                    try {
                      addLog('正在合并数据...');
                      if (hasData) {
                        await mergeDirectorySafely(
                          `${tempUnzipDir}/data`,
                          `${targetDir}/data`,
                        );
                      }
                      if (hasPublic) {
                        await mergeDirectorySafely(
                          `${tempUnzipDir}/public`,
                          `${targetDir}/public`,
                        );
                      }
                      addLog('合并完成');
                      Alert.alert(
                        '合并成功',
                        '新数据已合并，请重启 APP 或刷新页面。',
                        [
                          {
                            text: '刷新',
                            onPress: () => webViewRef.current?.reload(),
                          },
                        ],
                      );
                    } catch (e: any) {
                      addLog(`合并出错: ${e.message}`);
                      Alert.alert('错误', e.message);
                    } finally {
                      await deleteDirectoryRecursive(tempUnzipDir);
                    }
                  },
                },
                {
                  text: '🔄 覆盖 (替换所有)',
                  onPress: async () => {
                    try {
                      addLog('正在覆盖数据...');
                      if (hasData) {
                        await copyDirectorySafely(
                          `${tempUnzipDir}/data`,
                          `${targetDir}/data`,
                        );
                      }
                      if (hasPublic) {
                        await copyDirectorySafely(
                          `${tempUnzipDir}/public`,
                          `${targetDir}/public`,
                        );
                      }
                      addLog('覆盖完成');
                      Alert.alert(
                        '恢复成功',
                        '数据已覆盖，请重启 APP 或刷新页面。',
                        [
                          {
                            text: '刷新',
                            onPress: () => webViewRef.current?.reload(),
                          },
                        ],
                      );
                    } catch (e: any) {
                      addLog(`恢复出错: ${e.message}`);
                      Alert.alert('错误', e.message);
                    } finally {
                      await deleteDirectoryRecursive(tempUnzipDir);
                    }
                  },
                },
              ],
            );
          } else {
            // 旧版逻辑：解压到 default-user
            const destPath = `${targetDir}/data/default-user`;
            if (!(await RNFS.exists(destPath))) await RNFS.mkdir(destPath);

            addLog('导入到默认用户目录...');
            await copyDirectorySafely(tempUnzipDir, destPath);
            await deleteDirectoryRecursive(tempUnzipDir);

            Alert.alert('导入成功', '数据已导入到默认用户目录。', [
              { text: '知道了' },
            ]);
          }
        } catch (e) {
          await deleteDirectoryRecursive(tempUnzipDir);
          throw e;
        }
      } else {
        // 单文件导入逻辑保持不变
        const destPath = `${targetDir}/data/default-user`;
        if (!(await RNFS.exists(destPath))) await RNFS.mkdir(destPath);
        const destFile = `${destPath}/${fileName}`;
        addLog('复制文件到: ' + destFile);
        await RNFS.copyFile(sourcePath, destFile);
        Alert.alert('导入成功', `文件 "${fileName}" 已导入。`, [
          { text: '知道了' },
        ]);
      }

      addLog('用户数据导入完成');
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) {
        addLog('用户取消导入');
      } else {
        Alert.alert('导入出错', err.message);
        addLog('导入错误: ' + err.message);
      }
    }
  };

  // ★★★ 使用 ReactNativeBlobUtil 流式下载备份（不用系统下载管理器）★★★
  const downloadBackupNative = async (filename: string) => {
    try {
      addLog('[备份] 开始下载...');

      const { dirs } = ReactNativeBlobUtil.fs;
      const destPath = `${RNFS.DownloadDirectoryPath}/${filename}`;

      // ★★★ 关键：移除 addAndroidDownloads，直接用 RNBlobUtil 下载 ★★★
      const response = await ReactNativeBlobUtil.config({
        fileCache: true,
        path: destPath,
        // 不要加 addAndroidDownloads！
      }).fetch(
        'POST',
        'http://127.0.0.1:8000/api/users/backup',
        {
          'Content-Type': 'application/json',
        },
        JSON.stringify({
          handle: 'default-user',
        }),
      );

      // 检查文件是否成功写入
      const fileExists = await ReactNativeBlobUtil.fs.exists(response.path());
      if (fileExists) {
        const stat = await ReactNativeBlobUtil.fs.stat(response.path());
        addLog(`[备份] 已保存: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
        Alert.alert(
          '备份成功',
          `文件已保存到：\n${dirs.DownloadDir}/${filename}\n\n大小: ${(stat.size / 1024 / 1024).toFixed(1)}MB`,
        );
      } else {
        throw new Error('文件写入失败');
      }
    } catch (error: any) {
      addLog(`[备份] 下载失败: ${error.message}`);
      Alert.alert('备份失败', error.message);
    }
  };

  const openWithChrome = async () => {
    try {
      if (await InAppBrowser.isAvailable()) {
        addLog('[系统] 正在启动 Chrome 模式...');
        await InAppBrowser.open('http://127.0.0.1:8000', {
          showTitle: false,
          toolbarColor: '#1a1a1a',
          secondaryToolbarColor: '#1a1a1a',
          navigationBarColor: '#1a1a1a',
          enableUrlBarHiding: true,
          enableDefaultShare: false,
          forceCloseOnRedirection: false,
          showInRecents: false,
          hasBackButton: true,
          browserPackage: null,
        });
      } else {
        Alert.alert(
          '提示',
          '未检测到可用的浏览器内核，请确保手机安装了 Chrome 或其他浏览器',
        );
      }
    } catch (e: any) {
      addLog('[错误] Chrome 模式启动失败: ' + e.message);
      Alert.alert('错误', e.message);
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

            // ★★★ 检查是否是备份文件（zip 文件通常很大）★★★
            if (filename.endsWith('.zip')) {
              // 不走 blob 下载，通知 RN 直接调用 API
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'backup_download_request',
                filename: filename
              }));
              return; // 不执行原始下载
            }

            // ★★★ 所有文件都通过 blob 下载，移除大小限制 ★★★
            var xhr = new XMLHttpRequest();
            xhr.open('GET', this.href, true);
            xhr.responseType = 'blob';
            xhr.onload = function() {
              // ★★★ 对于大文件（超过50MB），提示用户可能需要等待 ★★★
              if (xhr.response.size > 50 * 1024 * 1024) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'large_file_processing',
                  filename: filename,
                  size: xhr.response.size
                }));
              }
              var reader = new FileReader();
              reader.onload = function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'blob_download',
                  data: reader.result,
                  filename: filename
                }));
              };
              reader.onerror = function() {
                // ★★★ 读取失败时尝试分块读取 ★★★
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'blob_download_error',
                  filename: filename,
                  size: xhr.response.size,
                  error: 'FileReader failed'
                }));
              };
              reader.readAsDataURL(xhr.response);
            };
            xhr.onerror = function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'blob_download_error',
                filename: filename,
                error: 'XHR failed'
              }));
            };
            xhr.send();
          } else {
            originalClick.call(this);
          }
        };
      }
      return element;
    };
  })();
  `;


  const extensionInstallInterceptor = `
  (function() {
    let lastExtensionUrl = '';

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0]?.url || args[0] || '';

      if (url.includes('/api/extensions/install')) {
        try {
          const body = args[1]?.body;
          if (body) {
            const parsed = JSON.parse(body);
            lastExtensionUrl = parsed.url || '';
          }
        } catch(e) {}
      }

      const response = await originalFetch.apply(this, args);

      if (url.includes('/api/extensions/install') && !response.ok) {
        try {
          const cloned = response.clone();
          const text = await cloned.text();

          const isInvalidFile =
            text.includes('Invalid file') ||
            text.includes('too small') ||
            text.includes('couldn\\'t open') ||
            text.includes('unzip');

          const isNetworkError =
            text.includes('Could not resolve') ||
            text.includes('Connection') ||
            text.includes('timeout') ||
            text.includes('ETIMEDOUT') ||
            text.includes('unable to access') ||
            response.status === 503;

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'extension_install_error',
            status: response.status,
            message: text,
            repoUrl: lastExtensionUrl,
            isInvalidFile: isInvalidFile,
            isNetworkError: isNetworkError
          }));
        } catch(e) {}
      }
      return response;
    };

    const injectZipInstallButton = () => {
      const observer = new MutationObserver((mutations) => {
        const dialogs = document.querySelectorAll('.popup, .dialogue_popup, [role="dialog"]');
        dialogs.forEach(dialog => {
          const text = dialog.textContent || '';
          if ((text.includes('Install extension') || text.includes('安装扩展') || text.includes('Git URL'))
              && !dialog.querySelector('.zip-install-btn')) {

            const buttonArea = dialog.querySelector('.popup-controls, .dialogue_popup_controls, .menu_button')?.parentElement;

            if (buttonArea) {
              const zipBtn = document.createElement('div');
              zipBtn.className = 'menu_button zip-install-btn';
              zipBtn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> 从 ZIP 安装';
              zipBtn.style.cssText = 'margin-left: 10px; background: #4a9eff;';
              zipBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'request_zip_install'
                }));
              };
              buttonArea.appendChild(zipBtn);
            }
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === 'complete') {
      injectZipInstallButton();
    } else {
      window.addEventListener('load', injectZipInstallButton);
    }
  })();
  `;

  // ★★★ 独立的输入框修复脚本（轻量版）★★★
  const inputFixScript = `
    (function() {
      function fixInputArea() {
        const screenHeight = window.screen.height;
        const windowHeight = window.innerHeight;
        const navBarHeight = Math.max(screenHeight - windowHeight, 50);

        const styleId = 'st-input-fix';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          document.head.appendChild(styleEl);
        }

        styleEl.textContent = \`
          #sheld {
            height: calc(100vh - \${navBarHeight}px) !important;
            max-height: calc(100vh - \${navBarHeight}px) !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          #chat {
            flex: 1 1 auto !important;
            overflow-y: auto !important;
            min-height: 100px !important;
          }
          #qr--bar, .qr--bar, .qr--buttons {
            max-height: 20vh !important;
            overflow-y: auto !important;
            flex-shrink: 0 !important;
          }
          #form_sheld {
            flex: 0 0 auto !important;
            padding-bottom: \${navBarHeight}px !important;
            background: var(--SmartThemeBlurTintColor, #1a1a1a) !important;
          }
          #send_form {
            min-height: 45px !important;
            z-index: 100 !important;
          }
          #send_textarea {
            min-height: 36px !important;
            max-height: 100px !important;
          }
        \`;
      }

      window.addEventListener('load', fixInputArea);
      window.addEventListener('resize', fixInputArea);
      setTimeout(fixInputArea, 500);
      setTimeout(fixInputArea, 1500);
    })();
  `;

  const viewportAndLayoutFix = `
    (function() {
      // === 1. 注入 CSS 修复宽度问题 ===
      const style = document.createElement('style');
      style.innerHTML = \`
        @media screen and (max-width: 1000px) {
            /* 强制使用 vw 而不是 dvw，解决 WebView 宽度识别问题 */
            #sheld, #character_popup, .drawer-content, #bg1, #bg_custom {
                width: 100vw !important;
                max-width: 100vw !important;
                box-sizing: border-box !important;
                left: 0 !important;
                right: 0 !important;
                margin: 0 !important;
            }

            /* 强制隐藏水平滚动条 */
            body {
                width: 100vw !important;
                overflow-x: hidden !important;
                position: fixed !important;
            }

            /* 修复侧边栏宽度 */
            #left-nav-panel, #right-nav-panel {
                max-width: 85vw !important; /* 防止侧边栏太宽 */
            }
        }
      \`;
      document.head.appendChild(style);

      // === 2. 轻量级高度修复 ===
      function fixSidebarHeight() {
        // 获取当前窗口可视高度
        const vh = window.innerHeight;

        // 修复 CSS 变量 (SillyTavern 依赖这个变量)
        document.documentElement.style.setProperty('--doc-height', vh + 'px');

        // 手动修正侧边栏高度，减去顶部栏的 45px
        const contentHeight = vh - 45;

        const leftPanel = document.getElementById('left-nav-panel');
        const rightPanel = document.getElementById('right-nav-panel');

        if (leftPanel) {
            leftPanel.style.height = contentHeight + 'px';
            leftPanel.style.maxHeight = contentHeight + 'px';
        }

        if (rightPanel) {
            rightPanel.style.height = contentHeight + 'px';
            rightPanel.style.maxHeight = contentHeight + 'px';
        }
      }

      // 3. 监听窗口大小变化 (添加防抖，解决卡顿问题)
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fixSidebarHeight, 200); // 200毫秒延迟，防止疯狂重绘
      });

      // 4. 启动时执行几次，确保加载完成
      window.addEventListener('load', fixSidebarHeight);
      setTimeout(fixSidebarHeight, 500);
      setTimeout(fixSidebarHeight, 2000);
    })();
  `;

  // 流式复制大文件，避免内存溢出
  const copyFileSafely = async (srcPath: string, dstPath: string) => {
    const fileSize = (await RNFS.stat(srcPath)).size;

    // 小文件直接复制
    if (fileSize < 10 * 1024 * 1024) {
      // 小于10MB
      await RNFS.copyFile(srcPath, dstPath);
      return;
    }

    // 大文件使用原生复制命令（Android）
    // 通过下载到本地的方式实现流式复制
    await RNFS.copyFile(srcPath, dstPath);
  };
  // 递归复制目录（流式，避免内存溢出）
  const copyDirectorySafely = async (srcDir: string, dstDir: string) => {
    if (!(await RNFS.exists(srcDir))) return;

    const stat = await RNFS.stat(srcDir);

    if (!stat.isDirectory()) {
      // 是文件，直接复制
      const dstParent = dstDir.substring(0, dstDir.lastIndexOf('/'));
      if (!(await RNFS.exists(dstParent))) {
        await RNFS.mkdir(dstParent);
      }
      await copyFileSafely(srcDir, dstDir);
      return;
    }

    // 是目录，创建目标目录
    if (!(await RNFS.exists(dstDir))) {
      await RNFS.mkdir(dstDir);
    }

    // 遍历子项
    const items = await RNFS.readDir(srcDir);
    for (const item of items) {
      const srcPath = item.path;
      const dstPath = `${dstDir}/${item.name}`;

      if (item.isDirectory()) {
        await copyDirectorySafely(srcPath, dstPath);
      } else {
        await copyFileSafely(srcPath, dstPath);
      }
    }
  };

  // ★★★ 递归合并目录 (跳过已存在的文件) ★★★
  const mergeDirectorySafely = async (srcDir: string, dstDir: string) => {
    if (!(await RNFS.exists(srcDir))) return;

    // 如果目标目录不存在，直接创建
    if (!(await RNFS.exists(dstDir))) {
      await RNFS.mkdir(dstDir);
    }

    const items = await RNFS.readDir(srcDir);
    for (const item of items) {
      const srcPath = item.path;
      const dstPath = `${dstDir}/${item.name}`;

      if (item.isDirectory()) {
        await mergeDirectorySafely(srcPath, dstPath);
      } else {
        // 只有当目标文件不存在时才复制
        if (!(await RNFS.exists(dstPath))) {
          await copyFileSafely(srcPath, dstPath);
        }
      }
    }
  };

  // ★★★ 组合注入脚本 ★★★
  const buildCombinedScript = () => {
    let script = fileDownloadPatch + '\n' + extensionInstallInterceptor;

    // 输入框修复（独立开关，轻量）
    if (isInputFixEnabled && !isCompatMode) {
      script += '\n' + inputFixScript;
    }

    // 兼容模式（完整布局修复，已包含输入框修复）
    if (isCompatMode) {
      script += '\n' + viewportAndLayoutFix;
    }

    return script;
  };

  const combinedScript = buildCombinedScript();

  const handleWebViewMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      // ★★★ 处理备份下载请求 ★★★
      if (msg.type === 'backup_download_request') {
        addLog(`[备份] 收到下载请求: ${msg.filename}`);
        await downloadBackupNative(msg.filename);
        return;
      }

      // ★★★ 大文件处理中提示 ★★★
      if (msg.type === 'large_file_processing') {
        addLog(`[下载] 正在处理大文件: ${msg.filename} (${(msg.size / 1024 / 1024).toFixed(1)}MB)，请稍候...`);
        return;
      }

      // ★★★ Blob 下载错误处理 ★★★
      if (msg.type === 'blob_download_error') {
        addLog(`[下载] 文件下载失败: ${msg.filename} - ${msg.error}`);
        Alert.alert(
          '下载失败',
          `文件 "${msg.filename}" 下载失败。\n\n错误: ${msg.error}\n\n建议：请尝试使用菜单中的「导出用户数据」功能进行备份。`,
          [{ text: '知道了' }],
        );
        return;
      }

      if (msg.type === 'extension_install_error') {
        addLog(`[扩展安装失败] ${msg.message}`);

        if (msg.isInvalidFile || msg.isNetworkError) {
          handleManualExtensionInstall(msg.repoUrl, msg.message);
        } else {
          Alert.alert('安装失败', msg.message);
        }
        return;
      }

      if (msg.type === 'extension_install_success') {
        addLog(`[扩展安装] 成功: ${msg.name}`);
        Alert.alert(
          '安装成功',
          `扩展 "${msg.name}" 已安装。\n\n请刷新页面加载扩展。`,
          [
            { text: '稍后' },
            {
              text: '刷新页面',
              onPress: () => webViewRef.current?.reload(),
            },
          ],
        );
        return;
      }

      if (msg.type === 'extension_zip_install_error') {
        addLog(`[ZIP安装失败] ${msg.message}`);
        Alert.alert('ZIP 安装失败', msg.message);
        return;
      }

      if (msg.type === 'request_zip_install') {
        pickAndInstallExtensionZip();
        return;
      }

      if (msg.type === 'blob_download') {
        const { data, filename } = msg;
        const base64Code = data.split(',')[1];
        const destPath = `${RNFS.DownloadDirectoryPath}/${filename}`;
        try {
          await RNFS.writeFile(destPath, base64Code, 'base64');
          addLog(`[下载] 文件已保存: ${filename}`);
        } catch (err) {
          const fallbackPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
          await RNFS.writeFile(fallbackPath, base64Code, 'base64');
          addLog(`[下载] (fallback) 保存: ${filename}`);
        }
      }
    } catch (e) {}
  };

  // ★★★ 获取当前引导步骤 ★★★
  const currentGuideStep = guideSteps[guideStep] || {};

  if (!serverReady) {
    const { width, height } = Dimensions.get('window');
    const bgImage = require('./assets/background.png');
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden={true} />
        {/* 背景图 */}
        <Image
          source={bgImage}
          style={{
            position: 'absolute',
            width: width,
            height: height,
            opacity: 0.5,
          }}
          resizeMode="cover"
          blurRadius={3}
        />

        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          {/* 上半部分留白，把内容往下顶一点 */}
          <View style={{ height: '10%' }} />
          {/* 加载圈 */}
          <ActivityIndicator
            size="large"
            color={THEME.primary}
            style={{ transform: [{ scale: 1.5 }] }}
          />

          {/* 当前主要状态 */}
          <Text
            style={{
              color: '#fff',
              marginTop: 20,
              fontSize: 18,
              fontWeight: '600',
              letterSpacing: 1,
              textAlign: 'center',
            }}
          >
            {status}
          </Text>
          {/* 下载进度（系统资源或APK） */}
          {(downloading || apkDownloading) && (
            <View style={{ width: '85%', marginTop: 20 }}>
              {/* 进度条容器 */}
              <View
                style={{
                  width: '100%',
                  height: 6,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: `${
                      (downloading ? progress : apkProgress) * 100
                    }%`,
                    height: '100%',
                    backgroundColor: THEME.primary,
                    borderRadius: 3,
                  }}
                />
              </View>

              {/* 详细信息行 */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {/* 左侧：百分比 */}
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                  }}
                >
                  {((downloading ? progress : apkProgress) * 100).toFixed(1)}%
                </Text>

                {/* 右侧：大小信息 (仅资源下载显示) */}
                {downloading && downloadDetails.contentLength > 0 && (
                  <Text
                    style={{
                      color: '#aaa',
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    {formatBytes(downloadDetails.bytesWritten)} /{' '}
                    {formatBytes(downloadDetails.contentLength)}
                  </Text>
                )}
              </View>

              {/* 速度和时间行 (仅资源下载显示) */}
              {downloading && downloadDetails.speed > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  }}
                >
                  <Text
                    style={{
                      color: THEME.secondary,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    {formatBytes(downloadDetails.speed)}/s
                  </Text>
                  <Text style={{ color: '#888', fontSize: 10 }}>
                    {formatTime(downloadDetails.remainingTime)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ★★★ 新增：启动日志窗口 ★★★ */}
          <View
            style={{
              width: '95%',
              height: 200, // 固定高度
              backgroundColor: 'rgba(0,0,0,0.6)', // 半透明黑底
              marginTop: 30,
              borderRadius: 8,
              padding: 10,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <Text style={{ color: '#888', fontSize: 10, marginBottom: 5 }}>
              启动日志:
            </Text>
            <ScrollView
              ref={scrollViewRef}
              onContentSizeChange={() =>
                scrollViewRef.current?.scrollToEnd({ animated: true })
              }
            >
              {logs.map((log, i) => (
                <Text
                  key={i}
                  style={{
                    color: log.startsWith('ERR:') ? '#ff6b6b' : '#ccc', // 错误标红，普通标灰
                    fontSize: 10,
                    fontFamily: 'monospace',
                    marginBottom: 2,
                  }}
                >
                  {log}
                </Text>
              ))}
            </ScrollView>
          </View>
          {/* 底部按钮组 (已移除兼容模式开关) */}
          <View style={{ flexDirection: 'row', marginTop: 30, gap: 15 }}>
            {/* 代理设置 */}
            <TouchableOpacity
              onPress={configureProxyAndroid}
              style={{
                padding: 10,
                backgroundColor: proxyServer
                  ? '#00aa44'
                  : 'rgba(255,255,255,0.1)', // 有代理显绿，无代理显灰
                borderRadius: 5,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                {proxyServer ? '代理已开' : '设置代理'}
              </Text>
            </TouchableOpacity>
            {/* 导入数据 */}
            <TouchableOpacity
              style={{
                padding: 10,
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: 5,
              }}
              onPress={importUserData}
            >
              <Text
                style={{
                  color: THEME.primary,
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                导入数据
              </Text>
            </TouchableOpacity>
            {/* 重置资源 */}
            <TouchableOpacity style={{ padding: 10 }} onPress={handleReset}>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                重置资源
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#242425' }}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      <WebView
        key={`${isCompatMode}-${isInputFixEnabled}`}
        ref={webViewRef}
        source={{ uri: 'http://127.0.0.1:8000' }}
        style={{ flex: 1, backgroundColor: '#242425' }}
        // ✅ 改成这样（始终用硬件加速）
        androidLayerType="hardware"
        // 允许全屏 API (解决 Fullscreen is not supported 错误)
        allowsFullscreenVideo={true}
        // ★★★ 只在兼容模式下注入布局修复脚本 ★★★
        injectedJavaScript={combinedScript}
        // 基础配置（两种模式都需要）
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        // 伪装 UA，防止被识别为旧版 WebView
        userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
        // 消息处理
        onMessage={handleWebViewMessage}
        // 错误捕获
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          addLog(`[WebView错误] ${nativeEvent.description}`);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          addLog(`[HTTP错误] 状态码: ${nativeEvent.statusCode}`);
        }}
        onRenderProcessGone={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          addLog(
            `[严重崩溃] 渲染进程丢失: ${
              nativeEvent.didCrash ? '崩溃' : '被杀'
            }`,
          );
        }}
      />

      {/* ========== 控制台浮动按钮 ========== */}
      {!showLogOverlay && (
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            position: 'absolute',
            bottom: 100,
            right: 20,
            zIndex: showGuide ? 10001 : 99,
          }}
        >
          {/* 指引手指 */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -50,
              left: -50,
              width: 100,
              height: 100,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: fingerOpacity,
              transform: [
                {
                  translateY: fingerY.interpolate({
                    inputRange: [0, SCREEN_HEIGHT],
                    outputRange: [-SCREEN_HEIGHT + 100, 0], // 相对定位修正
                  }),
                },
                {
                  translateX: fingerX.interpolate({
                    inputRange: [0, SCREEN_WIDTH],
                    outputRange: [-SCREEN_WIDTH + 20, 0], // 相对定位修正
                  }),
                },
                { scale: fingerScale },
              ],
              zIndex: 10002,
            }}
          >
            <Text style={{ fontSize: 40 }}>👆</Text>
          </Animated.View>

          {/* 高亮光圈 */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -10,
              left: -10,
              right: -10,
              bottom: -10,
              borderRadius: 35,
              borderWidth: 2,
              borderColor: '#FF1493',
              backgroundColor: 'rgba(255, 20, 147, 0.2)',
              opacity: highlightOpacity,
              transform: [{ scale: highlightScale }, { scale: highlightPulse }],
              zIndex: 99,
            }}
          />

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (showGuide) {
                const step = guideSteps[guideStep];
                if (step.id === 'console_click') {
                  handleNextStep();
                }
              }
              openLogOverlayAnimated();
            }}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: hasNewError ? '#ff4444' : '#333',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 5,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 3,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <Text style={{ fontSize: 24 }}>🛠️</Text>
            {/* 红点提示 */}
            {hasNewError && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: '#ff0000',
                  borderWidth: 2,
                  borderColor: '#333',
                }}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ========== 底部弹出控制台 (全屏覆盖) ========== */}
      {showLogOverlay && (
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '50%', // 占据下半屏
            backgroundColor: 'rgba(26, 26, 26, 0.98)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            transform: [
              {
                translateY: logOverlayAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [500, 0], // 从底部滑入
                }),
              },
            ],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 20,
            zIndex: 10000,
          }}
        >
          {/* 顶部把手/标题栏 */}
          <View
            style={{
              height: 50,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 15,
              borderBottomWidth: 1,
              borderBottomColor: '#333',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 'bold',
                  marginRight: 10,
                }}
              >
                🛠️ 系统控制台
              </Text>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  backgroundColor: serverReady ? '#00aa44' : '#ffaa00',
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}
                >
                  {serverReady ? '运行中' : '启动中'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={() => toggleConsoleMenu()}
                style={{
                  padding: 8,
                  backgroundColor: '#333',
                  borderRadius: 5,
                  marginRight: 10,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>☰ 菜单</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => closeLogOverlayAnimated()}
                style={{ padding: 8 }}
              >
                <Text style={{ color: '#aaa', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 日志内容区 */}
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1, padding: 10 }}
            contentContainerStyle={{ paddingBottom: 30 }}
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({ animated: true })
            }
          >
            {logs.slice(-5).map((log, i) => (
              <Text
                key={i}
                style={{
                  color: log.startsWith('ERR:')
                    ? '#ff6b6b'
                    : log.startsWith('[系统]')
                    ? '#4fc3f7'
                    : '#aaa',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  marginBottom: 2,
                }}
              >
                {log}
              </Text>
            ))}
          </ScrollView>

          {/* 左侧滑出菜单 */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 250,
              backgroundColor: '#1a1a1a',
              paddingTop: 40,
              borderRightWidth: 1,
              borderRightColor: '#333',
              transform: [{ translateX: consoleMenuAnim }],
              shadowColor: '#000',
              shadowOffset: { width: 4, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 10,
              elevation: 20,
            }}
          >
            {/* 菜单头部 */}
            <View
              style={{
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: '#333',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                ⚙️ 设置菜单
              </Text>
              <Text style={{ color: '#666', fontSize: 11, marginTop: 5 }}>
                SillyTavern Android
              </Text>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {/* 快捷操作 */}
              <View style={{ padding: 15 }}>
                <Text
                  style={{ color: '#888', fontSize: 11, marginBottom: 10 }}
                >
                  快捷操作
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    webViewRef.current?.reload();
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(0)}
                  <Text style={{ color: '#4fc3f7', fontSize: 14 }}>
                    🔄 刷新页面
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    openWithChrome();
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(1)}
                  <Text style={{ color: '#4fc3f7', fontSize: 14 }}>
                    🌐 浏览器模式
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: '#333',
                  marginHorizontal: 15,
                }}
              />

              {/* 数据管理 */}
              <View style={{ padding: 15 }}>
                <Text
                  style={{ color: '#888', fontSize: 11, marginBottom: 10 }}
                >
                  数据管理
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    toggleConsoleMenu();
                    // 显示导入选项
                    Alert.alert(
                      '导入用户数据',
                      '请选择导入方式：',
                      [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '📁 从内置文件管理器',
                          onPress: () => {
                            setFileSelectorTitle('选择要导入的文件');
                            // ★★★ 使用 () => (name) => ... 的形式 ★★★
                            setFileSelectorFilter(() => (name: string) => {
                              const lower = (name || '').toLowerCase();
                              return (
                                lower.endsWith('.zip') ||
                                lower.endsWith('.json') ||
                                lower.endsWith('.jsonl') ||
                                lower.endsWith('.png') ||
                                lower.endsWith('.webp')
                              );
                            });
                            setFileSelectorCallback(() => async (filePath: string, fileName: string) => {
                              try {
                                addLog(`正在导入: ${fileName}`);
                                const lowerName = fileName.toLowerCase();

                                if (lowerName.endsWith('.zip')) {
                                  // ZIP 文件处理
                                  const tempUnzipDir = `${RNFS.CachesDirectoryPath}/import_temp_${Date.now()}`;
                                  await RNFS.mkdir(tempUnzipDir);
                                  await unzip(filePath, tempUnzipDir);

                                  const hasData = await RNFS.exists(`${tempUnzipDir}/data`);
                                  const hasPublic = await RNFS.exists(`${tempUnzipDir}/public`);

                                  if (hasData || hasPublic) {
                                    if (hasData) {
                                      await mergeDirectorySafely(`${tempUnzipDir}/data`, `${targetDir}/data`);
                                    }
                                    if (hasPublic) {
                                      await mergeDirectorySafely(`${tempUnzipDir}/public`, `${targetDir}/public`);
                                    }
                                    await deleteDirectoryRecursive(tempUnzipDir);
                                    addLog('导入完成');
                                    Alert.alert('导入成功', '数据已合并，请刷新页面。', [
                                      { text: '刷新', onPress: () => webViewRef.current?.reload() },
                                    ]);
                                  } else {
                                    const destPath = `${targetDir}/data/default-user`;
                                    if (!(await RNFS.exists(destPath))) await RNFS.mkdir(destPath);
                                    await copyDirectorySafely(tempUnzipDir, destPath);
                                    await deleteDirectoryRecursive(tempUnzipDir);
                                    Alert.alert('导入成功', '数据已导入到默认用户目录。');
                                  }
                                } else {
                                  // 单文件处理
                                  const destPath = `${targetDir}/data/default-user`;
                                  if (!(await RNFS.exists(destPath))) await RNFS.mkdir(destPath);
                                  const destFile = `${destPath}/${fileName}`;
                                  await RNFS.copyFile(filePath, destFile);
                                  addLog(`文件已复制到: ${destFile}`);
                                  Alert.alert('导入成功', `文件 "${fileName}" 已导入。`);
                                }
                              } catch (err: any) {
                                addLog(`导入失败: ${err.message}`);
                                Alert.alert('导入失败', err.message);
                              }
                            });
                            setShowFileSelector(true);
                          },
                        },
                        {
                          text: '📱 从系统文件选择器',
                          onPress: () => setTimeout(() => importUserData(), 300),
                        },
                      ],
                    );
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(2)}
                  <Text style={{ color: '#fff', fontSize: 14 }}>
                    📂 导入用户数据
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    toggleConsoleMenu();
                    setTimeout(() => exportUserData(), 300);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14 }}>
                    💾 导出用户数据
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    toggleConsoleMenu();
                    setTimeout(() => pickAndInstallExtensionZip(), 300);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(3)}
                  <Text style={{ color: '#fff', fontSize: 14 }}>
                    📦 从 ZIP 安装插件
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    toggleConsoleMenu();
                    setShowFileManager(true);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14 }}>
                    📁 文件管理
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: '#333',
                  marginHorizontal: 15,
                }}
              />

              {/* 显示设置 */}
              <View style={{ padding: 15 }}>
                <Text
                  style={{ color: '#888', fontSize: 11, marginBottom: 10 }}
                >
                  显示设置
                </Text>

                {/* ★★★ 新增：输入框修复开关 ★★★ */}
                <TouchableOpacity
                  onPress={() => {
                    toggleInputFix();
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 14 }}>
                      📱 输入框修复
                    </Text>
                    <Text style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                      修复被导航栏遮挡（轻量）
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: isInputFixEnabled ? '#4CAF50' : '#444',
                      justifyContent: 'center',
                      alignItems: isInputFixEnabled ? 'flex-end' : 'flex-start',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: '#fff',
                      }}
                    />
                  </View>
                </TouchableOpacity>

                {/* 兼容模式 */}
                <TouchableOpacity
                  onPress={() => {
                    toggleCompatMode();
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(4)}
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 14 }}>
                      🖥️ 兼容模式
                    </Text>
                    <Text style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                      完整布局修复（含侧边栏）
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: isCompatMode ? '#ff8800' : '#444',
                      justifyContent: 'center',
                      alignItems: isCompatMode ? 'flex-end' : 'flex-start',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: '#fff',
                      }}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: '#333',
                  marginHorizontal: 15,
                }}
              />

              {/* 系统 */}
              <View style={{ padding: 15 }}>
                <Text
                  style={{ color: '#888', fontSize: 11, marginBottom: 10 }}
                >
                  系统
                </Text>

                {/* ★★★ 新增：手动检查更新按钮 ★★★ */}
                <TouchableOpacity
                  onPress={() => handleCheckUpdate()}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#4fc3f7', fontSize: 14 }}>
                    ☁️ 检查更新
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    handleReset();
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(5)}
                  <Text style={{ color: '#ff4444', fontSize: 14 }}>
                    ⚠️ 重置系统资源
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: '#333',
                  marginHorizontal: 15,
                }}
              />

              {/* 教程 */}
              <View style={{ padding: 15 }}>
                <Text
                  style={{ color: '#888', fontSize: 11, marginBottom: 10 }}
                >
                  教程
                </Text>

                {/* ★★★ APP 使用引导按钮（第一个） ★★★ */}
                <TouchableOpacity
                  onPress={() => {
                    toggleConsoleMenu(false);
                    closeLogOverlayAnimated(() => {
                      startGuide();
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(6)}
                  <Text style={{ color: THEME.primary, fontSize: 14 }}>
                    🎓 APP 使用引导
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Linking.openURL('https://www.sillyandroid.icu/');
                    toggleConsoleMenu();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {renderHighlightBorder(8)}
                  <Text style={{ color: '#4fc3f7', fontSize: 14 }}>
                    📖 使用教程
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* 版本信息 */}
            <View
              style={{
                padding: 15,
                borderTopWidth: 1,
                borderTopColor: '#333',
              }}
            >
              <Text
                style={{ color: '#444', fontSize: 10, textAlign: 'center' }}
              >
                版本 {CURRENT_APP_VERSION}
              </Text>
            </View>
          </Animated.View>

          {/* 点击遮罩关闭菜单 */}
          {showConsoleMenu && (
          <TouchableOpacity
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 250,
                right: 0,
              }}
              onPress={() => toggleConsoleMenu(false)}
              activeOpacity={1}
            />
          )}
        </Animated.View>
      )}

      {/* ========== 文件管理器 ========== */}
      <FileManager
        visible={showFileManager}
        onClose={() => setShowFileManager(false)}
        rootPath={targetDir}
      />

      {/* ========== 文件选择器（用于菜单导入） ========== */}
      <FileManager
        visible={showFileSelector}
        onClose={() => {
          setShowFileSelector(false);
          setFileSelectorCallback(null);
        }}
        rootPath={targetDir}
        selectMode={true}
        selectTitle={fileSelectorTitle}
        fileFilter={fileSelectorFilter}
        onFileSelected={(path, name) => {
          setShowFileSelector(false);
          if (fileSelectorCallback) {
            fileSelectorCallback(path, name);
          }
          setFileSelectorCallback(null);
        }}
      />

    </View>
  );
};

export default App;
