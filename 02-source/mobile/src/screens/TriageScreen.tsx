import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, EmptyState, ErrorBanner, Logo, SeverityBadge, StatusBadge, TypeChip } from '../components';
import { compactMoney, money, timeAgo } from '../format';
import { colors, fonts, radius, shadow, typeColors as tones } from '../theme';
import type { ExceptionItem, Paged, Summary } from '../types';

const FILTERS = [
  ['ALL', 'All types'],
  ['DUPLICATE_PAYMENT', 'Duplicates'],
  ['AMOUNT_MISMATCH', 'Mismatch'],
  ['MISSING_PAYMENT', 'Missing'],
  ['UNALLOCATED_PAYMENT', 'Unallocated'],
  ['NOMINAL_VARIANCE', 'Nominal'],
  ['ORPHAN_RECEIPT', 'Orphan'],
  ['DUPLICATE_RECEIPT', 'Duplicate doc'],
] as const;

export function TriageScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<ExceptionItem[]>([]);
  const [type, setType] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      setError(null);
      try {
        const [nextSummary, list] = await Promise.all([
          api.get<Summary>('/api/exceptions/summary'),
          api.get<Paged<ExceptionItem>>(
            `/api/exceptions?status=ACTIVE&sort=risk&pageSize=50${type === 'ALL' ? '' : `&type=${type}`}`,
          ),
        ]);
        setSummary(nextSummary);
        setItems(list.items);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load the queue.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [type],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function confirmLogout() {
    Alert.alert('Sign out?', 'The stored session will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const open = summary?.totals.open ?? 0;
  const inReview = summary?.totals.inReview ?? 0;
  const value = summary?.totals.valueMinor ?? 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.safeBrand}>
        <View style={styles.brandHeader}>
          <Logo />
          <Pressable onPress={confirmLogout} hitSlop={8} style={styles.account}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.accountName}>{user?.name}</Text>
              <Text style={styles.accountRole}>{user?.role}</Text>
            </View>
            <Avatar name={user?.name ?? ''} size={34} dark />
          </Pressable>
        </View>
        <View style={styles.brandTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MANUAL CHECKS · ACTIVE WORK</Text>
            <Text style={styles.pageTitle}>Triage queue</Text>
            <Text style={styles.pageSub}>Prioritised by exposure. Open a case to see evidence and record a disposition.</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Capture')} style={styles.cameraButton}>
            <Ionicons name="camera-outline" size={20} color={colors.brand} />
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand2} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>OPEN</Text>
                <Text style={[styles.statValue, { fontFamily: fonts.display }]}>{open}</Text>
                <Text style={styles.statHint}>need disposition</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>IN REVIEW</Text>
                <Text style={[styles.statValue, { fontFamily: fonts.display }]}>{inReview}</Text>
                <Text style={styles.statHint}>being checked</Text>
              </View>
              <View style={[styles.stat, styles.statDark]}>
                <Text style={[styles.statLabel, { color: 'rgba(242,246,232,0.55)' }]}>VALUE AT RISK</Text>
                <Text style={[styles.statValue, { color: colors.mint, fontFamily: fonts.display, fontSize: 20 }]}>{compactMoney(value)}</Text>
                <Text style={[styles.statHint, { color: 'rgba(242,246,232,0.45)' }]}>open exposure</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map(([key, label]) => {
                const count =
                  key === 'ALL'
                    ? open + inReview
                    : (summary?.types.find((entry) => entry.type === key)?.open ?? 0) +
                      (summary?.types.find((entry) => entry.type === key)?.inReview ?? 0);
                const active = type === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setType(key);
                      setLoading(true);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    {key !== 'ALL' ? (
                      <View style={[styles.chipDot, { backgroundColor: tones[key]?.color ?? colors.muted }]} />
                    ) : null}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('Exception', { id: item.id })}
            style={({ pressed }) => [styles.caseCard, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.caseTop}>
              <TypeChip type={item.type} />
              <SeverityBadge severity={item.severity} />
              <Text style={styles.caseAge}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={styles.caseTitle}>{item.title}</Text>
            <View style={styles.caseMeta}>
              <Ionicons name="business-outline" size={12} color={colors.muted2} />
              <Text style={styles.caseMetaText}>
                {item.vendorName ?? 'Unknown vendor'}
                {item.vendorCode ? ` · ${item.vendorCode}` : ''}
              </Text>
            </View>
            <View style={styles.caseFoot}>
              <View>
                <Text style={styles.caseAmount}>{money(item.amountMinor, item.currency)}</Text>
                {Math.abs(item.deltaMinor) > 0 ? (
                  <Text style={styles.caseDelta}>Variance {money(item.deltaMinor, item.currency)}</Text>
                ) : (
                  <Text style={styles.caseDelta}>No amount variance</Text>
                )}
              </View>
              <View style={styles.caseRight}>
                <StatusBadge status={item.status} />
                <Text style={styles.caseOwner}>{item.assigneeName ?? 'Unassigned'}</Text>
              </View>
              <View style={styles.chev}>
                <Ionicons name="arrow-forward" size={15} color={colors.muted} />
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand2} />
              <Text style={styles.loadingText}>Loading queue…</Text>
            </View>
          ) : (
            <EmptyState title="Queue is clear" message="No exceptions match this filter. Pull to refresh after the next run." />
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <Text style={styles.footer}>Showing {items.length} active case{items.length === 1 ? '' : 's'} · pull to refresh</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  safeBrand: { backgroundColor: colors.brand, paddingBottom: 16 },
  brandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountName: { color: '#F2F6E8', fontSize: 10, fontWeight: '600' },
  accountRole: { color: 'rgba(242,246,232,0.46)', fontSize: 8, letterSpacing: 0.8, marginTop: 1 },
  brandTitleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, paddingTop: 20 },
  eyebrow: { color: 'rgba(217,237,155,0.62)', fontSize: 8, fontWeight: '700', letterSpacing: 1.3 },
  pageTitle: { fontFamily: fonts.display, color: '#F7FAEE', fontSize: 29, letterSpacing: -0.7, marginTop: 4 },
  pageSub: { color: 'rgba(242,246,232,0.56)', fontSize: 10, lineHeight: 15, marginTop: 3, maxWidth: 290 },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  listContent: { padding: 14, paddingBottom: 28, gap: 9 },
  headerBlock: { gap: 12, paddingBottom: 4 },
  stats: { flexDirection: 'row', gap: 7 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 11,
    gap: 1,
  },
  statDark: { backgroundColor: colors.brand, borderColor: colors.brand },
  statLabel: { fontSize: 7.5, fontWeight: '700', letterSpacing: 1, color: colors.muted },
  statValue: { fontSize: 24, color: colors.ink, fontWeight: '600', lineHeight: 30 },
  statHint: { fontSize: 7.5, color: colors.muted2 },
  chips: { gap: 6, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipDot: { width: 5, height: 5, borderRadius: 3 },
  chipText: { fontSize: 10, color: colors.muted, fontWeight: '500' },
  chipTextActive: { color: '#F2F6E8', fontWeight: '600' },
  chipCount: { fontSize: 9.5, color: colors.muted2, fontVariant: ['tabular-nums'] },
  chipCountActive: { color: colors.mint },
  caseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    gap: 6,
    ...shadow,
  },
  caseTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  caseAge: { marginLeft: 'auto', fontSize: 8.5, color: colors.muted2 },
  caseTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.ink },
  caseMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caseMetaText: { fontSize: 9.5, color: colors.muted, flex: 1 },
  caseFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  caseAmount: { fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  caseDelta: { fontSize: 8.5, color: colors.muted, marginTop: 2 },
  caseRight: { marginLeft: 'auto', alignItems: 'flex-end', gap: 4 },
  caseOwner: { fontSize: 8.5, color: colors.muted2 },
  chev: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 10, color: colors.muted },
  footer: { textAlign: 'center', fontSize: 8.5, color: colors.muted2, paddingTop: 10 },
});
