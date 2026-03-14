import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  BackHandler,
  TextInput,
} from 'react-native';
import RNFS from 'react-native-fs';
import {zip, unzip} from 'react-native-zip-archive';

interface FileManagerProps {
  visible: boolean;
  onClose: () => void;
  rootPath: string;
  // ★★★ 新增：选择模式 ★★★
  selectMode?: boolean;
  onFileSelected?: (filePath: string, fileName: string) => void;
  fileFilter?: (fileName: string) => boolean;
  selectTitle?: string;
}

interface FileItem {
  name: string;
  path: string;
  size: number;
  isDirectory: () => boolean;
  mtime: Date;
}

interface SelectedItem extends FileItem {
  isSelected?: boolean;
}

const FileManager: React.FC<FileManagerProps> = ({
  visible,
  onClose,
  rootPath,
  selectMode = false,
  onFileSelected,
  fileFilter,
  selectTitle,
}) => {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [files, setFiles] = useState<SelectedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<SelectedItem | null>(null);
  const [editContent, setEditContent] = useState('');
  // ★★★ 新增：查找功能状态 ★★★
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]); // 存储匹配位置
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const editorRef = React.useRef<TextInput>(null);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await RNFS.readDir(path);
      // 排序：文件夹在前，文件在后；然后按名称排序
      const sortedFiles = result.sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) {
          return a.name.localeCompare(b.name);
        }
        return a.isDirectory() ? -1 : 1;
      });
      setFiles(sortedFiles as any);
    } catch (err: any) {
      Alert.alert('错误', '无法读取目录: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadFiles(currentPath);
    }
  }, [visible, currentPath, loadFiles]);

  const handleGoBack = useCallback(() => {
    if (currentPath === rootPath) {
      return;
    }
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    setCurrentPath(parentPath);
  }, [currentPath, rootPath]);

  // 处理返回键
  useEffect(() => {
    const backAction = () => {
      if (visible) {
        if (currentPath !== rootPath) {
          handleGoBack();
          return true;
        }
        onClose();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction,
    );

    return () => backHandler.remove();
  }, [visible, currentPath, rootPath, onClose, handleGoBack]);

  // ★★★ 处理文件点击 - 支持选择模式 ★★★
  const handleFilePress = (item: SelectedItem) => {
    // 选择模式：点击文件直接返回
    if (selectMode && !item.isDirectory()) {
      // 检查文件过滤器
      if (fileFilter && !fileFilter(item.name)) {
        Alert.alert('提示', '此文件类型不支持');
        return;
      }
      if (onFileSelected) {
        onFileSelected(item.path, item.name);
      }
      return;
    }

    // 多选模式
    if (isMultiSelectMode) {
      toggleSelection(item);
    } else if (item.isDirectory()) {
      setCurrentPath(item.path);
    } else if (selectMode) {
      // 选择模式下点击文件
      if (onFileSelected) {
        onFileSelected(item.path, item.name);
      }
    } else if (isTextFile(item.name)) {
      handleEdit(item);
    } else {
      showFileOperationMenu(item);
    }
  };

  const handleLongPress = (item: SelectedItem) => {
    if (!isMultiSelectMode) {
      enterMultiSelectMode();
      toggleSelection(item);
    }
  };

  const toggleSelection = (item: SelectedItem) => {
    const newFiles = files.map(f => {
      if (f.path === item.path) {
        return {...f, isSelected: !f.isSelected};
      }
      return f;
    });
    setFiles(newFiles);
    setSelectedItems(newFiles.filter(f => f.isSelected));
  };

  const enterMultiSelectMode = () => {
    setIsMultiSelectMode(true);
    setSelectedItems([]);
    setFiles(files.map(item => ({...item, isSelected: false})));
  };

  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedItems([]);
    setFiles(files.map(item => ({...item, isSelected: false})));
  };

  // ★★★ 支持更多文本文件格式，包括 JSONL ★★★
  const isTextFile = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    return (
      extension === 'txt' ||
      extension === 'json' ||
      extension === 'jsonl' ||  // 新增 JSONL 支持
      extension === 'js' ||
      extension === 'css' ||
      extension === 'html' ||
      extension === 'md' ||
      extension === 'yaml' ||
      extension === 'yml' ||
      extension === 'xml' ||
      extension === 'csv' ||
      extension === 'log'
    );
  };

  const showFileOperationMenu = (item: SelectedItem) => {
    const actions = [
      {text: '取消', style: 'cancel' as const},
      {
        text: '删除',
        style: 'destructive' as const,
        onPress: () => handleDelete(item),
      },
      {
        text: '下载',
        onPress: () => handleDownload(item),
      },
    ];

    if (item.name.endsWith('.zip')) {
      actions.push({
        text: '解压',
        onPress: () => handleUnzip(item),
      });
    }

    if (isTextFile(item.name)) {
      actions.push({
        text: '编辑',
        onPress: () => handleEdit(item),
      });
    }

    actions.push({
      text: '压缩',
      onPress: () => handleZip([item]),
    });

    Alert.alert('文件操作', `对 "${item.name}" 进行操作`, actions);
  };

  const handleUnzip = async (item: SelectedItem) => {
    try {
      const destDir = `${currentPath}/${item.name.replace('.zip', '')}`;
      if (!(await RNFS.exists(destDir))) {
        await RNFS.mkdir(destDir);
      }
      await unzip(item.path, destDir);
      loadFiles(currentPath);
      Alert.alert('解压成功', `文件 "${item.name}" 已解压到当前目录。`);
    } catch (err: any) {
      Alert.alert('解压失败', err.message);
    }
  };

  const handleZip = async (items: SelectedItem[]) => {
    try {
      if (items.length === 0) {
        Alert.alert('提示', '请先选择要压缩的文件');
        return;
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;

      const zipName =
        items.length === 1
          ? `${items[0].name}_${timestamp}.zip`
          : `Archive_${timestamp}.zip`;
      const zipPath = `${currentPath}/${zipName}`;

      await zip(
        items.map(i => i.path),
        zipPath,
      );
      loadFiles(currentPath);
      Alert.alert('压缩成功', `文件已压缩为 "${zipName}"`);
    } catch (err: any) {
      Alert.alert('压缩失败', err.message);
    }
  };

  const handleDownload = async (item: SelectedItem) => {
    try {
      const destPath = `${RNFS.DownloadDirectoryPath}/${item.name}`;
      await RNFS.copyFile(item.path, destPath);
      Alert.alert('下载成功', `文件 "${item.name}" 已保存到下载目录`);
    } catch (err: any) {
      Alert.alert('下载失败', err.message);
    }
  };

  const handleEdit = async (item: SelectedItem) => {
    try {
      const content = await RNFS.readFile(item.path, 'utf8');
      setEditingFile(item);
      setEditContent(content);
      setShowEditor(true);
    } catch (err: any) {
      Alert.alert('读取失败', err.message);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingFile) {
      return;
    }
    try {
      await RNFS.writeFile(editingFile.path, editContent, 'utf8');
      setShowEditor(false);
      setEditingFile(null);
      loadFiles(currentPath);
      Alert.alert('保存成功', `文件 "${editingFile.name}" 已更新。`);
    } catch (err: any) {
      Alert.alert('保存失败', err.message);
    }
  };

  const handleDelete = async (item: SelectedItem) => {
    Alert.alert('确认删除', `确定要删除 "${item.name}" 吗？此操作无法撤销。`, [
      {text: '取消', style: 'cancel'},
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          try {
            await RNFS.unlink(item.path);
            loadFiles(currentPath);
            Alert.alert('成功', '文件已删除');
          } catch (err: any) {
            Alert.alert('错误', '删除失败: ' + err.message);
          }
        },
      },
    ]);
  };

  const handleBatchUnzip = async () => {
    const zips = selectedItems.filter(i => i.name.endsWith('.zip'));
    if (zips.length === 0) {
      Alert.alert('提示', '请选择zip文件进行解压');
      return;
    }
    let successCount = 0;
    for (const item of zips) {
      try {
        const destDir = `${currentPath}/${item.name.replace('.zip', '')}`;
        if (!(await RNFS.exists(destDir))) {
          await RNFS.mkdir(destDir);
        }
        await unzip(item.path, destDir);
        successCount++;
      } catch (err: any) {
        console.error(err);
      }
    }
    loadFiles(currentPath);
    Alert.alert('完成', `成功解压 ${successCount} 个文件`);
    exitMultiSelectMode();
  };

  const handleBatchDownload = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('提示', '请先选择文件');
      return;
    }
    let successCount = 0;
    for (const item of selectedItems) {
      try {
        const destPath = `${RNFS.DownloadDirectoryPath}/${item.name}`;
        await RNFS.copyFile(item.path, destPath);
        successCount++;
      } catch (err: any) {
        console.error(err);
      }
    }
    Alert.alert('完成', `成功下载 ${successCount} 个文件到下载目录`);
    exitMultiSelectMode();
  };

  const handleBatchDelete = () => {
    if (selectedItems.length === 0) {
      Alert.alert('提示', '请先选择文件');
      return;
    }
    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedItems.length} 个项目吗？`,
      [
        {text: '取消', style: 'cancel'},
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            for (const item of selectedItems) {
              try {
                await RNFS.unlink(item.path);
              } catch (err: any) {
                console.error(err);
              }
            }
            loadFiles(currentPath);
            exitMultiSelectMode();
          },
        },
      ],
    );
  };

  const handleEditSelected = () => {
    if (selectedItems.length !== 1) {
      Alert.alert('提示', '请选择一个文件进行编辑');
      return;
    }
    const item = selectedItems[0];
    if (item.isDirectory()) {
      Alert.alert('提示', '无法编辑文件夹');
      return;
    }
    if (!isTextFile(item.name)) {
      Alert.alert('提示', '不支持编辑该类型文件');
      return;
    }
    handleEdit(item);
  };

  const formatTime = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date
      .getHours()
      .toString()
      .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // ★★★ 新增：查找功能 ★★★
  const handleSearch = (text: string) => {
    setSearchText(text);
    if (!text) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    // 查找所有匹配位置
    const results: number[] = [];
    let index = editContent.toLowerCase().indexOf(text.toLowerCase());
    while (index !== -1) {
      results.push(index);
      index = editContent.toLowerCase().indexOf(text.toLowerCase(), index + 1);
    }
    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);

    // 如果有匹配，定位到第一个
    if (results.length > 0) {
      jumpToPosition(results[0], text.length);
    }
  };

  const jumpToPosition = (position: number, length: number) => {
    // 设置光标到匹配位置
    if (editorRef.current) {
      editorRef.current.setNativeProps({
        selection: {start: position, end: position + length},
      });
      editorRef.current.focus();
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) {
      return;
    }
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    jumpToPosition(searchResults[nextIndex], searchText.length);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) {
      return;
    }
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    jumpToPosition(searchResults[prevIndex], searchText.length);
  };

  const toggleSearchBar = () => {
    setShowSearchBar(!showSearchBar);
    if (showSearchBar) {
      // 关闭搜索栏时清除搜索
      setSearchText('');
      setSearchResults([]);
      setCurrentSearchIndex(0);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (currentPath !== rootPath) {
          handleGoBack();
        } else {
          onClose();
        }
      }}>
      <View style={styles.container}>
        {/* 顶部导航栏 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {selectMode ? (selectTitle || '选择文件') : (currentPath.replace(rootPath, '') || '/')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* 选择模式提示 */}
        {selectMode && (
          <View style={styles.selectModeHint}>
            <Text style={styles.selectModeHintText}>
              📂 点击文件即可选择，点击文件夹可进入浏览
            </Text>
          </View>
        )}

        {/* 路径导航 */}
        <View style={styles.pathBar}>
          {currentPath !== rootPath && (
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>.. (返回上级)</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.pathText}>{currentPath}</Text>
        </View>

        {/* 工具栏 */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[
              styles.toolbarButton,
              isMultiSelectMode && styles.activeToolbarButton,
            ]}
            onPress={() => {
              if (isMultiSelectMode) {
                exitMultiSelectMode();
              } else {
                enterMultiSelectMode();
              }
            }}>
            <Text style={styles.toolbarButtonText}>
              {isMultiSelectMode ? '✓ 完成' : '🔢 多选'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 文件列表 */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF1493" />
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {files.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>空文件夹</Text>
              </View>
            ) : (
              files.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.item, item.isSelected && styles.selectedItem]}
                  onPress={() => handleFilePress(item)}
                  onLongPress={() => handleLongPress(item)}>
                  <Text style={styles.icon}>
                    {item.isDirectory() ? '📁' : '📄'}
                  </Text>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.isDirectory()
                        ? formatTime(item.mtime)
                        : `${(item.size / 1024).toFixed(1)} KB  |  ${formatTime(
                            item.mtime,
                          )}`}
                    </Text>
                  </View>
                  {isMultiSelectMode ? (
                    <View
                      style={[
                        styles.checkbox,
                        item.isSelected && styles.checkedCheckbox,
                      ]}>
                      {item.isSelected && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={e => {
                        e.stopPropagation();
                        showFileOperationMenu(item);
                      }}>
                      <Text style={styles.moreButtonText}>⋮</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
            <View style={styles.listSpacer} />
          </ScrollView>
        )}

        {/* 底部工具栏 */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.bottomButton}
            onPress={handleBatchUnzip}>
            <Text style={styles.bottomButtonText}>📦 解压</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButton}
            onPress={handleEditSelected}>
            <Text style={styles.bottomButtonText}>✏️ 编辑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButton}
            onPress={handleBatchDownload}>
            <Text style={styles.bottomButtonText}>📥 下载</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomButton, styles.deleteButton]}
            onPress={handleBatchDelete}>
            <Text style={styles.bottomButtonText}>🗑️ 删除</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButton}
            onPress={() => handleZip(selectedItems)}>
            <Text style={styles.bottomButtonText}>🗜️ 压缩</Text>
          </TouchableOpacity>
        </View>

        {/* 文本编辑器 Modal */}
        {showEditor && (
          <Modal
            visible={showEditor}
            animationType="slide"
            onRequestClose={() => setShowEditor(false)}>
            <View style={styles.editorContainer}>
              <View style={styles.editorHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setShowEditor(false);
                    setShowSearchBar(false);
                    setSearchText('');
                    setSearchResults([]);
                  }}
                  style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.editorTitle}>
                  {editingFile?.name || '编辑文件'}
                </Text>
                <View style={styles.editorHeaderButtons}>
                  <TouchableOpacity
                    onPress={toggleSearchBar}
                    style={styles.searchToggleButton}>
                    <Text style={styles.searchToggleText}>🔍</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveEdit}
                    style={styles.saveButton}>
                    <Text style={styles.saveButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ★★★ 搜索栏 ★★★ */}
              {showSearchBar && (
                <View style={styles.searchBar}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="查找..."
                    placeholderTextColor="#888"
                    value={searchText}
                    onChangeText={handleSearch}
                    autoFocus={true}
                  />
                  <View style={styles.searchInfo}>
                    <Text style={styles.searchInfoText}>
                      {searchResults.length > 0
                        ? `${currentSearchIndex + 1}/${searchResults.length}`
                        : searchText
                        ? '无匹配'
                        : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.searchNavButton}
                    onPress={handlePrevMatch}
                    disabled={searchResults.length === 0}>
                    <Text
                      style={[
                        styles.searchNavText,
                        searchResults.length === 0 && styles.searchNavDisabled,
                      ]}>
                      ▲
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.searchNavButton}
                    onPress={handleNextMatch}
                    disabled={searchResults.length === 0}>
                    <Text
                      style={[
                        styles.searchNavText,
                        searchResults.length === 0 && styles.searchNavDisabled,
                      ]}>
                      ▼
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.searchCloseButton}
                    onPress={toggleSearchBar}>
                    <Text style={styles.searchCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                ref={editorRef}
                style={styles.editorContent}
                multiline={true}
                value={editContent}
                onChangeText={setEditContent}
                autoFocus={!showSearchBar}
                textAlignVertical="top"
              />
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  pathBar: {
    padding: 10,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    marginBottom: 5,
  },
  backButtonText: {
    color: '#FF1493',
    fontWeight: 'bold',
  },
  pathText: {
    color: '#888',
    fontSize: 12,
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  icon: {
    fontSize: 24,
    marginRight: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  itemMeta: {
    color: '#666',
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 50,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  bottomButton: {
    flex: 1,
    backgroundColor: '#FF1493',
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  editorTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    padding: 5,
  },
  saveButtonText: {
    color: '#FF1493',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editorContent: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 15,
    fontFamily: 'monospace',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  toolbarButton: {
    flex: 1,
    backgroundColor: '#FF1493',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#444',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalPrimaryButton: {
    backgroundColor: '#FF1493',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectedItem: {
    backgroundColor: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  checkedCheckbox: {
    backgroundColor: '#FF1493',
    borderColor: '#FF1493',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  moreButton: {
    padding: 10,
    marginLeft: 5,
  },
  moreButtonText: {
    color: '#aaa',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 40,
  },
  activeToolbarButton: {
    backgroundColor: '#4CAF50',
  },
  listSpacer: {
    height: 80,
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
  selectModeHint: {
    backgroundColor: '#4a9eff',
    padding: 10,
    alignItems: 'center',
  },
  selectModeHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // ★★★ 新增：编辑器搜索栏样式 ★★★
  editorHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchToggleButton: {
    padding: 8,
    marginRight: 10,
  },
  searchToggleText: {
    fontSize: 18,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  searchInfo: {
    paddingHorizontal: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  searchInfoText: {
    color: '#888',
    fontSize: 12,
  },
  searchNavButton: {
    padding: 8,
    marginHorizontal: 2,
  },
  searchNavText: {
    color: '#FF1493',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchNavDisabled: {
    color: '#555',
  },
  searchCloseButton: {
    padding: 8,
    marginLeft: 5,
  },
  searchCloseText: {
    color: '#888',
    fontSize: 16,
  },
});

export default FileManager;
