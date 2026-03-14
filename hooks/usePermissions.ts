import { useEffect, useState } from 'react';
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';

export const usePermissions = () => {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      setPermissionsGranted(true);
      setChecking(false);
      return;
    }

    try {
      console.log('🔐 开始请求权限...');
      
      const apiLevel = Platform.Version as number;
      const permissions = [];

      if (apiLevel < 33) {
        permissions.push(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
      } else {
        console.log('📱 Android 13+，使用新权限模型');
      }

      if (permissions.length > 0) {
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        console.log('🔐 权限请求结果:', granted);

        const allGranted = Object.values(granted).every(
          (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );

        if (allGranted) {
          console.log('✅ 所有权限已授予');
          setPermissionsGranted(true);
        } else {
          console.warn('⚠️ 部分权限被拒绝');
          showPermissionDeniedAlert();
        }
      } else {
        setPermissionsGranted(true);
      }

    } catch (err) {
      console.error('❌ 权限请求失败:', err);
      showPermissionDeniedAlert();
    } finally {
      setChecking(false);
    }
  };

  const showPermissionDeniedAlert = () => {
    Alert.alert(
      '需要权限',
      '应用需要存储权限才能正常运行。请在设置中授予权限。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '去设置',
          onPress: () => {
            Linking.openSettings();
          },
        },
        {
          text: '重试',
          onPress: () => {
            setChecking(true);
            requestPermissions();
          },
        },
      ]
    );
  };

  return { permissionsGranted, checking };
};
