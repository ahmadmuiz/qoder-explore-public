import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, API_URL } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorBanner, SectionLabel } from '../components';
import { date, money, timeAgo } from '../format';
import { colors, fonts, radius } from '../theme';

type Attachment = {
  id: string;
  kind: 'RECEIPT' | 'INVOICE' | 'EVIDENCE';
  fileName: string;
  mime: string;
  sizeBytes: number;
  declaredAmountMinor: number | null;
  linkedInvoiceNumber: string | null;
  linkedExceptionId: string | null;
  createdAt: string;
};

const KIND_META: Record<Attachment['kind'], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  RECEIPT: { label: 'Kuitansi', icon: 'receipt-outline', color: colors.brand2, bg: colors.mintSoft },
  INVOICE: { label: 'Invoice', icon: 'document-text-outline', color: colors.info, bg: '#EDF3FD' },
  EVIDENCE: { label: 'Evidence', icon: 'attach-outline', color: colors.violet, bg: '#F3EEFC' },
};

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'RECEIPT', label: 'Kuitansi' },
  { key: 'INVOICE', label: 'Invoice' },
  { key: 'EVIDENCE', label: 'Evidence' },
] as const;

export function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { token, user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ items: Attachment[] }>('/api/attachments');
      setItems(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load evidence.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { ALL: items.length };
    for (const item of items) base[item.kind] = (base[item.kind] ?? 0) + 1;
    return base;
  }, [items]);

  const visible = useMemo(
    () => (filter === 'ALL' ? items : items.filter((item) => item.kind === filter)),
    [items, filter],
  );

  const isImage = preview?.mime.startsWith('image/') ?? false;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.head}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>DOCUMENT REGISTER</Text>
            <Text style={styles.title}>Evidence library</Text>
            <Text style={styles.subtitle}>
              {items.length} documents · SHA-256 de-duplicated · {user?.role.toLowerCase()} access
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Capture')} style={styles.captureBtn}>
            <Ionicons name="camera-outline" size={20} color={colors.brand} />
          </Pressable>
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{counts[option.key] ?? 0}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      {error ? (
        <View style={{ padding: 14 }}>
          <ErrorBanner message={error} onRetry={() => void load('initial')} />
        </View>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load('refresh');
            }}
            tintColor={colors.brand2}
          />
        }
        ListHeaderComponent={<SectionLabel>Recent uploads</SectionLabel>}
        renderItem={({ item }) => {
          const meta = KIND_META[item.kind];
          return (
            <Pressable
              onPress={() => (item.mime.startsWith('image/') ? setPreview(item) : undefined)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
            >
              <View style={[styles.icon, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.kind, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                  <Text style={styles.age}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.linkedInvoiceNumber ?? (item.linkedExceptionId ? `${item.linkedExceptionId.slice(0, 12)}…` : 'Unlinked')}
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.meta}>{item.declaredAmountMinor ? money(item.declaredAmountMinor) : `${(item.sizeBytes / 1024).toFixed(0)} KB`}</Text>
                </View>
                {item.linkedExceptionId ? (
                  <Pressable
                    onPress={() => navigation.navigate('Exception', { id: item.linkedExceptionId })}
                    style={styles.caseLink}
                  >
                    <Ionicons name="git-compare-outline" size={12} color={colors.brand2} />
                    <Text style={styles.caseLinkText}>Open linked case</Text>
                  </Pressable>
                ) : null}
              </View>
              {item.mime.startsWith('image/') ? (
                <Ionicons name="expand-outline" size={15} color={colors.muted2} style={{ marginTop: 2 }} />
              ) : (
                <Ionicons name="document-outline" size={15} color={colors.muted2} style={{ marginTop: 2 }} />
              )}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Loading documents…</Text>
            </View>
          ) : (
            <EmptyState
              title="No documents yet"
              message={filter === 'ALL' ? 'Captured kuitansi and uploaded evidence will appear here, newest first.' : 'No documents of this kind have been uploaded.'}
              icon="folder-open-outline"
            />
          )
        }
        ListFooterComponent={
          <Text style={styles.footer}>
            Files are served from {API_URL}/api/attachments/:id/file with bearer authentication. Declared nominal feeds the variance check.
          </Text>
        }
      />

      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreview(null)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{preview?.fileName}</Text>
                <Text style={styles.modalMeta}>
                  {preview ? `${date(preview.createdAt)} · ${preview.mime}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setPreview(null)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
            {preview && isImage ? (
              <Image
                source={{ uri: `${API_URL}/api/attachments/${preview.id}/file`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            ) : null}
            {preview?.declaredAmountMinor ? (
              <Text style={styles.modalAmount}>{money(preview.declaredAmountMinor)} declared</Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: 'rgba(217,237,155,0.62)', fontSize: 8, fontWeight: '700', letterSpacing: 1.3 },
  title: { fontFamily: fonts.display, color: '#F7FAEE', fontSize: 27, letterSpacing: -0.5, marginTop: 3 },
  subtitle: { color: 'rgba(242,246,232,0.55)', fontSize: 9, marginTop: 5 },
  captureBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  filterChipActive: { backgroundColor: colors.mint },
  filterText: { color: 'rgba(242,246,232,0.72)', fontSize: 9.5, fontWeight: '500' },
  filterTextActive: { color: colors.brand, fontWeight: '700' },
  filterCount: { minWidth: 16, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center' },
  filterCountActive: { backgroundColor: 'rgba(11,61,50,0.14)' },
  filterCountText: { fontSize: 7.5, color: 'rgba(242,246,232,0.8)', fontWeight: '700' },
  filterCountTextActive: { color: colors.brand },
  list: { padding: 14, paddingBottom: 30 },
  row: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 11,
  },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { fontSize: 7.5, fontWeight: '700', letterSpacing: 0.7 },
  age: { fontSize: 8, color: colors.muted2 },
  fileName: { fontSize: 11, fontWeight: '600', color: colors.ink, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontSize: 8.5, color: colors.muted },
  dot: { fontSize: 8, color: colors.muted2 },
  caseLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7, alignSelf: 'flex-start' },
  caseLinkText: { fontSize: 8.5, fontWeight: '600', color: colors.brand2 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  loadingText: { fontSize: 10, color: colors.muted },
  footer: { fontSize: 8, lineHeight: 12, color: colors.muted2, marginTop: 16, paddingHorizontal: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(8,28,23,0.72)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, gap: 10 },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  modalTitle: { fontSize: 11.5, fontWeight: '700', color: colors.ink },
  modalMeta: { fontSize: 8.5, color: colors.muted, marginTop: 2 },
  modalImage: { width: '100%', height: 340, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  modalAmount: { fontSize: 13, fontWeight: '700', color: colors.brand2, textAlign: 'right' },
});
