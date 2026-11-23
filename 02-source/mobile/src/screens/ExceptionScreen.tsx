import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Card, ErrorBanner, Field, SeverityBadge, StatusBadge, TypeChip } from '../components';
import { date, humanize, money } from '../format';
import { colors, fonts, radius, resolutionOptions } from '../theme';
import type { ExceptionDetail } from '../types';

function KV({ label, value, moneyValue = false }: { label: string; value: unknown; moneyValue?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  const text = moneyValue && typeof value === 'number' ? money(value) : String(value);
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, moneyValue && styles.kvMoney]}>{text}</Text>
    </View>
  );
}

export function ExceptionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const id = route.params?.id as string;

  const [data, setData] = useState<ExceptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.get<ExceptionDetail>(`/api/exceptions/${id}`);
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this case.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const exception = data?.exception;
  const invoice = data?.invoice;
  const editable = user?.role === 'ANALYST' || user?.role === 'SUPERVISOR';

  const evidence = useMemo(
    () =>
      Object.entries(data?.detail ?? {})
        .filter(([key]) => !['reason', 'guidance'].includes(key))
        .map(([key, value]) => ({ key, label: humanize(key), value })),
    [data?.detail],
  );

  async function apply(patch: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      await api.patch(`/api/exceptions/${id}`, patch);
      setNote('');
      setRefreshing(true);
      await load();
    } catch (cause) {
      Alert.alert('Action blocked', cause instanceof Error ? cause.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  }

  function resolve() {
    if (!resolution) {
      Alert.alert('Choose a disposition', 'Select how this exception is being closed.');
      return;
    }
    if (note.trim().length < 8) {
      Alert.alert('Add a resolution note', 'Record what you checked and the next step (at least 8 characters).');
      return;
    }
    void apply({ status: 'RESOLVED', resolutionCode: resolution, note: note.trim() }, 'resolve');
  }

  function ignore() {
    if (note.trim().length < 8) {
      Alert.alert('Explain the ignore', 'A note of at least 8 characters is required.');
      return;
    }
    void apply({ status: 'IGNORED', note: note.trim() }, 'ignore');
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={styles.loadingHead}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
            <Ionicons name="arrow-back" size={19} color="#F2F6E8" />
          </Pressable>
          <Text style={styles.loadingHeadText}>Exception case</Text>
        </SafeAreaView>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand2} />
          <Text style={styles.centerText}>Loading evidence pack…</Text>
        </View>
      </View>
    );
  }

  if (error || !exception) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <SafeAreaView edges={['top']} style={styles.lightHead}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backLight} hitSlop={8}>
            <Ionicons name="arrow-back" size={19} color={colors.ink} />
          </Pressable>
          <Text style={styles.lightHeadText}>Exception case</Text>
        </SafeAreaView>
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error ?? 'Case not found.'} onRetry={() => void load()} />
        </View>
      </View>
    );
  }

  const reason = typeof data?.detail?.reason === 'string' ? data.detail.reason : null;
  const guidance = typeof data?.detail?.guidance === 'string' ? data.detail.guidance : null;
  const closed = exception.status === 'RESOLVED' || exception.status === 'IGNORED';
  const receipts = invoice?.receipts ?? [];
  const kuitansiTotal = receipts.reduce((sum, item) => sum + item.amountMinor, 0);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.brandHead}>
        <View style={styles.navRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
            <Ionicons name="arrow-back" size={19} color="#F2F6E8" />
          </Pressable>
          <Text style={styles.navTitle}>CASE DETAIL</Text>
          <Text style={styles.navId}>{exception.id.slice(0, 12)}</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.brand2}
          />
        }
      >
        <Card style={styles.headCard}>
          <View style={styles.tags}>
            <TypeChip type={exception.type} />
            <SeverityBadge severity={exception.severity} />
            <StatusBadge status={exception.status} />
          </View>
          <Text style={styles.title}>{exception.title}</Text>
          <Text style={styles.subline}>
            {exception.vendorName ?? 'Unknown vendor'}
            {exception.vendorCode ? ` · ${exception.vendorCode}` : ''} · opened {date(exception.createdAt)}
          </Text>
          <View style={styles.amountRow}>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>EXCEPTION AMOUNT</Text>
              <Text style={styles.amountValue}>{money(exception.amountMinor, exception.currency)}</Text>
            </View>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>NOMINAL DELTA</Text>
              <Text style={[styles.amountValue, { color: exception.deltaMinor ? colors.warning : colors.success }]}>
                {money(exception.deltaMinor, exception.currency)}
              </Text>
            </View>
          </View>
          <View style={styles.refRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountLabel}>TRANSACTION REF</Text>
              <Text style={styles.refValue}>{exception.transactionRef ?? 'No ledger ref'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountLabel}>INVOICE</Text>
              <Text style={styles.refValue}>{exception.invoiceNumber ?? '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.amountLabel}>OWNER</Text>
              <Text style={styles.refValue}>{data?.assignee?.name ?? 'Unassigned'}</Text>
            </View>
          </View>
        </Card>

        {reason ? (
          <View style={[styles.callout, exception.severity === 'CRITICAL' && styles.calloutCritical]}>
            <View style={styles.calloutIcon}>
              <Ionicons name={exception.type === 'MISSING_PAYMENT' ? 'time-outline' : 'alert-circle-outline'} size={17} color={exception.severity === 'CRITICAL' ? colors.danger : colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.calloutTitle}>{reason}</Text>
              {guidance ? <Text style={styles.calloutText}>{guidance}</Text> : null}
            </View>
          </View>
        ) : null}

        {evidence.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>EVIDENCE VALUES</Text>
            <View style={styles.kvWrap}>
              {evidence.map((item) => (
                <KV
                  key={item.key}
                  label={item.label}
                  value={item.value}
                  moneyValue={/amount|total|nominal|delta|subtotal|tax|receipt/i.test(item.key)}
                />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.sectionTitle}>LEDGER EVIDENCE</Text>
          {(data?.evidenceLedger ?? []).length === 0 ? (
            <Text style={styles.bodyMuted}>No ledger row is attached. The engine raised this from the invoice or kuitansi register.</Text>
          ) : (
            (data?.evidenceLedger ?? []).map((row, index) => (
              <View key={String(row.transactionId ?? index)} style={styles.ledgerRow}>
                <View style={styles.ledgerIcon}>
                  <Ionicons name="swap-horizontal" size={15} color={colors.brand2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerRef}>{String(row.transactionId ?? 'Ledger row')}</Text>
                  <Text style={styles.ledgerMeta}>
                    {date(String(row.valueDate ?? ''))} · {String(row.channel ?? 'Channel n/a')} · {String(row.accountMask ?? '')}
                  </Text>
                </View>
                <Text style={styles.ledgerAmount}>{money(Number(row.amountMinor ?? 0), String(row.currency ?? 'IDR'))}</Text>
              </View>
            ))
          )}
        </Card>

        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.sectionTitle}>INVOICE & KUITANSI</Text>
            <Text style={styles.linkText}>{invoice?.invoiceNumber ?? 'No invoice'}</Text>
          </View>
          {invoice ? (
            <>
              <View style={styles.invoiceGrid}>
                <KV label="Invoice total" value={money(invoice.totalMinor, invoice.currency)} />
                <KV label="DPP + PPN" value={money(invoice.subtotalMinor + invoice.taxMinor, invoice.currency)} />
                <KV label="Kuitansi total" value={money(kuitansiTotal, invoice.currency)} />
                <KV label="Due date" value={date(invoice.dueDate)} />
              </View>
              <Text style={styles.bodyMuted}>
                {receipts.length === 0
                  ? 'No kuitansi recorded for this invoice.'
                  : `${receipts.length} kuitansi registered${Math.abs(kuitansiTotal - invoice.totalMinor) > 0 ? ' · nominal differs from invoice total' : ' · matches invoice total'}.`}
              </Text>
              {receipts.map((receipt) => (
                <View key={receipt.id} style={styles.receiptRow}>
                  <View style={styles.receiptIcon}>
                    <Ionicons name="document-text-outline" size={14} color="#46651C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.receiptRef}>{receipt.receiptNumber}</Text>
                    <Text style={styles.receiptMeta}>{date(receipt.receivedDate)} · {receipt.fileName ?? 'No file linked'}</Text>
                  </View>
                  <Text style={styles.receiptAmount}>{money(receipt.amountMinor, invoice.currency)}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.bodyMuted}>No invoice snapshot is available for this exception.</Text>
          )}
        </Card>

        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.sectionTitle}>ATTACHMENTS</Text>
            <Pressable
              onPress={() =>
                navigation.navigate('Main', {
                  screen: 'Capture',
                  params: { invoiceNumber: invoice?.invoiceNumber ?? undefined, exceptionId: exception.id },
                })
              }
              style={styles.attachBtn}
            >
              <Ionicons name="camera-outline" size={14} color={colors.brand} />
              <Text style={styles.attachText}>Capture</Text>
            </Pressable>
          </View>
          {(data?.attachments ?? []).length === 0 ? (
            <Text style={styles.bodyMuted}>No supporting document is linked yet. Capture a kuitansi or transfer receipt.</Text>
          ) : (
            (data?.attachments ?? []).map((attachment) => (
              <View key={attachment.id} style={styles.attachmentRow}>
                <View style={styles.receiptIcon}>
                  <Ionicons name="document-attach-outline" size={14} color="#46651C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.receiptRef}>{attachment.fileName}</Text>
                  <Text style={styles.receiptMeta}>
                    {attachment.kind} · {date(attachment.createdAt)} · {attachment.declaredAmountMinor ? money(attachment.declaredAmountMinor) : 'no declared nominal'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Card style={styles.actionCard}>
          <Text style={styles.sectionTitle}>{closed ? 'CASE OUTCOME' : 'DISPOSITION'}</Text>
          {closed ? (
            <>
              <View style={styles.closedBox}>
                <Ionicons name={exception.status === 'RESOLVED' ? 'checkmark-circle' : 'remove-circle'} size={22} color={exception.status === 'RESOLVED' ? colors.success : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.closedTitle}>{exception.status}</Text>
                  <Text style={styles.closedText}>
                    {exception.resolutionCode ? humanize(exception.resolutionCode) : 'No resolution code'} · {exception.resolutionNote ?? 'No note recorded'}
                  </Text>
                </View>
              </View>
              {editable ? (
                <Button label="Reopen case" icon="refresh-outline" variant="secondary" block onPress={() => void apply({ status: 'OPEN' }, 'reopen')} loading={busy === 'reopen'} style={{ marginTop: 10 }} />
              ) : (
                <Text style={styles.hint}>Auditor access is read-only. Reopening is restricted to analysts and supervisors.</Text>
              )}
            </>
          ) : editable ? (
            <>
              <View style={styles.toolRow}>
                <Button
                  label={data?.assignee?.id === user?.id ? 'Unassign' : 'Assign to me'}
                  icon="person-add-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    void apply({ assigneeId: data?.assignee?.id === user?.id ? null : user?.id }, 'assign')
                  }
                  loading={busy === 'assign'}
                />
                <Button
                  label="Start review"
                  icon="eye-outline"
                  variant="mint"
                  size="sm"
                  onPress={() => void apply({ status: 'IN_REVIEW' }, 'review')}
                  loading={busy === 'review'}
                />
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 15, marginBottom: 6 }]}>RESOLUTION CODE</Text>
              <View style={styles.resolutionWrap}>
                {resolutionOptions.map(([code, label]) => {
                  const active = resolution === code;
                  return (
                    <Pressable key={code} onPress={() => setResolution(code)} style={[styles.resolutionChip, active && styles.resolutionChipActive]}>
                      <Text style={[styles.resolutionText, active && styles.resolutionTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ height: 10 }} />
              <Field
                label="Resolution note"
                placeholder="What did you check, which evidence was reviewed, what happens next? (min. 8 chars)"
                value={note}
                onChangeText={setNote}
                multiline
                hint={`${note.trim().length}/8 minimum characters`}
              />

              <Button
                label="Resolve case"
                icon="checkmark-circle-outline"
                block
                onPress={resolve}
                loading={busy === 'resolve'}
                style={{ marginTop: 12 }}
              />
              <Button
                label="Ignore as false positive"
                variant="ghost"
                size="sm"
                block
                onPress={ignore}
                loading={busy === 'ignore'}
                style={{ marginTop: 4 }}
              />
              <Text style={styles.hint}>
                Analysts cannot write off or adjust cases at or above the supervisor threshold; the API will require approval.
              </Text>
            </>
          ) : (
            <Text style={styles.bodyMuted}>Auditor access is read-only. Dispositions are recorded by analysts and supervisors.</Text>
          )}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>AUDIT HISTORY</Text>
          {(data?.history ?? []).length === 0 ? (
            <Text style={styles.bodyMuted}>No actions recorded yet.</Text>
          ) : (
            (data?.history ?? []).map((event, index) => (
              <View key={`${event.at}-${index}`} style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyText}>{event.summary}</Text>
                  <Text style={styles.historyMeta}>{event.actorName} · {date(event.at)}</Text>
                </View>
              </View>
            ))
          )}
        </Card>

        {user?.role === 'AUDITOR' ? (
          <View
            style={styles.readonly}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand2} />
            <Text style={styles.readonlyText}>Auditor session: evidence is visible, disposition controls are disabled.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  brandHead: { backgroundColor: colors.brand, paddingBottom: 10 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  back: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  navTitle: { color: 'rgba(242,246,232,0.8)', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  navId: { marginLeft: 'auto', color: 'rgba(242,246,232,0.4)', fontSize: 8, fontFamily: fonts.mono },
  lightHead: { backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  backLight: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  lightHeadText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  loadingHead: { backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  loadingHeadText: { color: '#F2F6E8', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { color: colors.muted, fontSize: 10.5 },
  content: { padding: 14, paddingBottom: 36, gap: 10 },
  headCard: { padding: 15, gap: 7 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: colors.ink, marginTop: 2 },
  subline: { fontSize: 9.5, color: colors.muted, lineHeight: 14 },
  amountRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.line, borderRadius: radius.sm, overflow: 'hidden', marginTop: 6 },
  amountCell: { flex: 1, backgroundColor: colors.surface2, paddingHorizontal: 10, paddingVertical: 9, gap: 2 },
  amountLabel: { fontSize: 7.5, fontWeight: '600', letterSpacing: 0.7, color: colors.muted },
  amountValue: { fontSize: 13.5, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  refRow: { flexDirection: 'row', gap: 10, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 3 },
  refValue: { fontSize: 10, color: colors.inkSoft, marginTop: 3, fontWeight: '500' },
  callout: { flexDirection: 'row', gap: 9, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#F4DFC1', borderRadius: radius.md, padding: 11 },
  calloutCritical: { backgroundColor: colors.dangerSoft, borderColor: '#F5D0CC' },
  calloutIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' },
  calloutTitle: { fontSize: 11, fontWeight: '600', color: colors.ink, lineHeight: 15 },
  calloutText: { fontSize: 9.5, color: colors.inkSoft, lineHeight: 14, marginTop: 2 },
  sectionTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, color: colors.muted, marginBottom: 8 },
  kvWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: colors.line, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden' },
  kv: { flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8, gap: 2, minWidth: 120 },
  kvLabel: { fontSize: 7.5, fontWeight: '600', letterSpacing: 0.7, color: colors.muted, textTransform: 'uppercase' },
  kvValue: { fontSize: 10.5, fontWeight: '600', color: colors.inkSoft, lineHeight: 14 },
  kvMoney: { fontVariant: ['tabular-nums'] },
  bodyMuted: { fontSize: 10, lineHeight: 15, color: colors.muted },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  ledgerIcon: { width: 27, height: 27, borderRadius: 7, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' },
  ledgerRef: { fontSize: 10, fontWeight: '600', fontFamily: fonts.mono, color: colors.ink },
  ledgerMeta: { fontSize: 8.5, color: colors.muted, marginTop: 2 },
  ledgerAmount: { fontSize: 10, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  linkText: { fontFamily: fonts.mono, fontSize: 9.5, fontWeight: '600', color: colors.brand2 },
  invoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 7 },
  invoiceGridCell: {},
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  receiptIcon: { width: 26, height: 26, borderRadius: 7, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' },
  receiptRef: { fontSize: 9.5, fontWeight: '600', color: colors.ink, fontFamily: fonts.mono },
  receiptMeta: { fontSize: 8.5, color: colors.muted, marginTop: 1 },
  receiptAmount: { fontSize: 10, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.mintSoft, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: '#DFEAB8' },
  attachText: { fontSize: 9, fontWeight: '700', color: colors.brand },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  actionCard: { borderColor: '#DFEAB8' },
  toolRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  resolutionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  resolutionChip: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.surface },
  resolutionChipActive: { backgroundColor: colors.mintSoft, borderColor: colors.brand2 },
  resolutionText: { fontSize: 9.5, color: colors.muted, fontWeight: '500' },
  resolutionTextActive: { color: colors.brand, fontWeight: '700' },
  hint: { fontSize: 8.5, lineHeight: 13, color: colors.muted2, marginTop: 8 },
  closedBox: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: radius.sm, backgroundColor: '#EEF7EE', borderWidth: 1, borderColor: '#D6E9D7' },
  closedTitle: { fontSize: 11.5, fontWeight: '700', color: colors.success },
  closedText: { fontSize: 9, color: '#517A63', lineHeight: 13, marginTop: 2 },
  historyRow: { flexDirection: 'row', gap: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  historyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand2, marginTop: 5 },
  historyText: { fontSize: 10, color: colors.inkSoft, lineHeight: 14 },
  historyMeta: { fontSize: 8.5, color: colors.muted2, marginTop: 2 },
  readonly: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#EEF2F1', borderWidth: 1, borderColor: '#DBE3E0', borderRadius: radius.sm, padding: 11 },
  readonlyText: { flex: 1, fontSize: 9, lineHeight: 13, color: '#475A53' },
});
