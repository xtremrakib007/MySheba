import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import DownloadButton from '../components/DownloadButton';
import { listDocuments } from '../firebase/documentService';

export default function DocumentViewerScreen() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, activeDocumentId } = useApp();
  const [document, setDocument] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser || !activeDocumentId) return;
    (async () => {
      const docs = await listDocuments(authUser.uid);
      setDocument(docs.find((d) => d.id === activeDocumentId) ?? null);
      setLoading(false);
    })();
  }, [authUser, activeDocumentId]);

  if (loading) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }
  if (!document || !document.files?.length) {
    return (
      <View style={[styles.safe, styles.center]}>
        <TouchableOpacity style={styles.backBtnFloating} onPress={goBackOrHome}>
          <Text style={styles.backIcon}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.notFound}>No file to display.</Text>
      </View>
    );
  }

  const file = document.files[pageIndex];
  const isPdf = file.fileType === 'application/pdf';

  return (
    <View style={styles.safe}>
      <TouchableOpacity style={styles.backBtnFloating} onPress={goBackOrHome}>
        <Text style={styles.backIcon}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.viewer}>
        {isPdf ? (
          <WebView source={{ uri: file.url }} style={styles.pdf} />
        ) : (
          <Image source={{ uri: file.url }} style={styles.image} resizeMode="contain" />
        )}
      </View>

      {document.files.length > 1 && (
        <View style={styles.pager}>
          {document.files.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => setPageIndex(i)}>
              <View style={[styles.dot, i === pageIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.downloadWrap}>
        <DownloadButton url={file.url} filename={`${document.documentName}-${pageIndex + 1}`} label="Download" />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#000000' },
    center: { alignItems: 'center', justifyContent: 'center' },
    backBtnFloating: { position: 'absolute', top: 46, left: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
    backIcon: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    viewer: { flex: 1, paddingTop: 90 },
    image: { flex: 1 },
    pdf: { flex: 1, backgroundColor: '#FFFFFF' },
    pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#555555' },
    dotActive: { backgroundColor: colors.primary },
    downloadWrap: { alignItems: 'center', paddingBottom: 20 },
    notFound: { textAlign: 'center', marginTop: 12, color: '#999999' },
  });
}
