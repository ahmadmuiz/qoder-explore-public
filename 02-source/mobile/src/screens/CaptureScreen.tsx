import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api, API_URL } from '../api';
import { useAuth } from '../auth';
import { Button, Card, Field } from '../components';
import { money } from '../format';
import { colors, fonts, radius } from '../theme';

type Picked = {
  uri: string;
  name: string;
  mime: string;
  size: number | null;
};

type UploadResult = {
  attachment: { id: string; fileName: string; mime: string; sizeBytes: number; declaredAmountMinor: number | null; linkedInvoiceNumber: string | null };
  duplicate: boolean;
  runId: string | null;
  run: { matchedRate?: number; exceptionsOpen?: number; autoCleared?: number } | null;
};

const KIND_OPTIONS = [
  ['RECEIPT', 'Kuitansi'],
  ['INVOICE', 'Invoice'],
  ['EVIDENCE', 'Evidence'],
] as const;

export function CaptureScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const [kind, setKind] = useState<'RECEIPT' | 'INVOICE' | 'EVIDENCE'>('RECEIPT');
  const [invoiceNumber, setInvoiceNumber] = useState<string>(route.params?.invoiceNumber ?? '');
  const [declared, setDeclared] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const exceptionId = route.params?.exceptionId as string | undefined;
  const allowed = user?.role === 'ANALYST' || user?.role === 'SUPERVISOR';

  function accept(asset: ImagePicker.ImagePickerAsset) {
    const fallbackName = asset.uri.split('/').pop() ?? `document-${Date.now()}.jpg`;
    const mime = asset.mimeType ?? (fallbackName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    setPicked({ uri: asset.uri, name: asset.fileName ?? fallbackName, mime, size: asset.fileSize ?? null });
    setError(null);
    setResult(null);
  }

  async function pickLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to attach an existing kuitansi.');
      return;
    }
    const choice = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!choice.canceled && choice.assets[0]) accept(choice.assets[0]);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access to capture a kuitansi or transfer receipt.');
      return;
    }
    const choice = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!choice.canceled && choice.assets[0]) accept(choice.assets[0]);
  }

  async function submit() {
    if (!allowed) return;
    if (!picked) {
      setError('Capture or choose a document first.');
      return;
    }
    if (!/^\d{1,15}$/.test(declared.replace(/[^\d]/g, ''))) {
      setError('Declared nominal is required. Enter the amount stated on the document in whole rupiah.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('declaredAmount', declared.replace(/[^\d]/g, ''));
      if (invoiceNumber.trim()) form.append('invoiceNumber', invoiceNumber.trim().toUpperCase());
      if (exceptionId) form.append('exceptionId', exceptionId);
      form.append('file', {
        uri: picked.uri,
        name: picked.name,
        type: picked.mime,
      } as unknown as Blob);

      const response = await api.upload<UploadResult>('/api/attachments', form);
      setResult(response);
      setDeclared('');
      setKind('RECEIPT');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.head}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>EVIDENCE INTAKE</Text>
            <Text style={styles.title}>Capture kuitansi</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Triage')} style={styles.close}>
            <Ionicons name="close" size={19} color="#F2F6E8" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Photograph the vendor kuitansi or transfer receipt. A declared nominal lets the engine compare evidence to the invoice.
        </Text>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!allowed ? (
            <Card>
              <Text style={styles.blockedTitle}>Read-only session</Text>
              <Text style={styles.blockedText}>Auditors can review evidence but cannot upload documents or run reconciliation.</Text>
            </Card>
          ) : (
            <>
              <Card style={styles.previewCard}>
                {picked ? (
                  <>
                    <Image source={{ uri: picked.uri }} style={styles.preview} resizeMode="cover" />
                    <View style={styles.pickedRow}>
                      <View style={styles.pickedIcon}>
                        <Ionicons name="document-attach-outline" size={16} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickedName} numberOfLines={1}>{picked.name}</Text>
                        <Text style={styles.pickedMeta}>
                          {picked.mime} · {picked.size ? `${(picked.size / 1024).toFixed(0)} KB` : 'size unknown'}
                        </Text>
                      </View>
                      <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={17} color={colors.muted} />
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.drop}>
                    <View style={styles.dropIcon}>
                      <Ionicons name="camera-outline" size={25} color={colors.brand} />
                    </View>
                    <Text style={styles.dropTitle}>Add a document</Text>
                    <Text style={styles.dropText}>JPG, PNG, WEBP or PDF · max 8 MB. Photos are compressed to 80% quality.</Text>
                    <View style={styles.pickRow}>
                      <Button label="Take photo" icon="camera-outline" onPress={takePhoto} />
                      <Button label="Choose file" icon="images-outline" variant="secondary" onPress={pickLibrary} />
                    </View>
                  </View>
                )}
              </Card>

              <Card style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>DOCUMENT KIND</Text>
                  <View style={styles.kindRow}>
                    {KIND_OPTIONS.map(([value, label]) => (
                      <Pressable key={value} onPress={() => setKind(value)} style={[styles.kindChip, kind === value && styles.kindChipActive]}>
                        <Text style={[styles.kindText, kind === value && styles.kindTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Field
                  label="Invoice number"
                  placeholder="INV-2026-0142"
                  autoCapitalize="characters"
                  value={invoiceNumber}
                  onChangeText={setInvoiceNumber}
                  hint="Links the document to the invoice register when the number is recognised."
                />

                <Field
                  label="Declared nominal (IDR)"
                  placeholder="499500000"
                  keyboardType="number-pad"
                  value={declared}
                  onChangeText={(value) => setDeclared(value.replace(/[^\d]/g, ''))}
                  hint={declared ? money(Number(declared) * 100) : 'The nominal printed on the kuitansi, in whole rupiah.'}
                />

                {exceptionId ? (
                  <View style={styles.linked}>
                    <Ionicons name="link-outline" size={14} color={colors.brand2} />
                    <Text style={styles.linkedText}>Will be attached to exception {exceptionId.slice(0, 14)}…</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Button label={busy ? 'Uploading…' : 'Upload evidence'} icon="cloud-upload-outline" block onPress={submit} loading={busy} />
                <Text style={styles.note}>
                  Uploading a KUITANSI triggers a reconciliation run immediately. Identical files are de-duplicated by SHA-256; the API URL is {API_URL}.
                </Text>
              </Card>

              {result ? (
                <View style={[styles.result, result.duplicate && styles.resultDuplicate]}>
                  <View style={styles.resultHead}>
                    <Ionicons
                      name={result.duplicate ? 'copy-outline' : 'checkmark-circle-outline'}
                      size={20}
                      color={result.duplicate ? colors.warning : colors.success}
                    />
                    <Text style={styles.resultTitle}>
                      {result.duplicate ? 'Existing document reused' : 'Evidence uploaded'}
                    </Text>
                  </View>
                  <Text style={styles.resultText}>
                    {result.duplicate
                      ? 'The same file was already stored by SHA-256. The link was updated without duplicating the upload.'
                      : `${result.attachment.fileName} is now linked${result.attachment.linkedInvoiceNumber ? ` to ${result.attachment.linkedInvoiceNumber}` : ''}.`}
                  </Text>
                  {result.run ? (
                    <View style={styles.runRow}>
                      <View style={styles.runPill}>
                        <Text style={styles.runLabel}>MATCH RATE</Text>
                        <Text style={styles.runValue}>{result.run.matchedRate?.toFixed(1) ?? '—'}%</Text>
                      </View>
                      <View style={styles.runPill}>
                        <Text style={styles.runLabel}>OPEN AFTER RUN</Text>
                        <Text style={styles.runValue}>{result.run.exceptionsOpen ?? '—'}</Text>
                      </View>
                      <View style={styles.runPill}>
                        <Text style={styles.runLabel}>AUTO-CLEARED</Text>
                        <Text style={styles.runValue}>{result.run.autoCleared ?? 0}</Text>
                      </View>
                    </View>
                  ) : result.runId ? (
                    <View style={styles.runRow}>
                      <View style={styles.runPill}>
                        <Text style={styles.runLabel}>RECONCILIATION</Text>
                        <Text style={styles.runValue}>Run {result.runId.slice(0, 12)}…</Text>
                      </View>
                      <View style={styles.runPill}>
                        <Text style={styles.runLabel}>DECLARED</Text>
                        <Text style={styles.runValue}>{result.attachment.declaredAmountMinor ? money(result.attachment.declaredAmountMinor) : '—'}</Text>
                      </View>
                    </View>
                  ) : null}
                  <Button label="Back to queue" variant="secondary" size="sm" block onPress={() => navigation.navigate('Triage')} style={{ marginTop: 10 }} />
                </View>
              ) : null}

              {picked && !busy ? (
                <View style={styles.queueNote}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.muted} />
                  <Text style={styles.queueNoteText}>Open a case first to attach this evidence directly to an exception.</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {busy ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.mint} size="large" />
          <Text style={styles.busyText}>Uploading and re-running match…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: 'rgba(217,237,155,0.62)', fontSize: 8, fontWeight: '700', letterSpacing: 1.3 },
  title: { fontFamily: fonts.display, color: '#F7FAEE', fontSize: 29, letterSpacing: -0.6, marginTop: 4 },
  subtitle: { color: 'rgba(242,246,232,0.56)', fontSize: 10, lineHeight: 15, marginTop: 7, maxWidth: 330 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 36, gap: 10 },
  previewCard: { padding: 10, gap: 10 },
  preview: { width: '100%', height: 190, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  pickedIcon: { width: 29, height: 29, borderRadius: 8, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' },
  pickedName: { fontSize: 10.5, fontWeight: '600', color: colors.ink },
  pickedMeta: { fontSize: 8.5, color: colors.muted, marginTop: 1 },
  drop: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, gap: 5, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, borderRadius: radius.md },
  dropIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  dropTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  dropText: { fontSize: 9, lineHeight: 14, color: colors.muted, textAlign: 'center', maxWidth: 280 },
  pickRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: colors.muted, marginBottom: 6 },
  kindRow: { flexDirection: 'row', gap: 6 },
  kindChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  kindChipActive: { backgroundColor: colors.mintSoft, borderColor: colors.brand2 },
  kindText: { fontSize: 10, color: colors.muted, fontWeight: '500' },
  kindTextActive: { color: colors.brand, fontWeight: '700' },
  linked: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.mintSoft, borderRadius: 6, padding: 8 },
  linkedText: { fontSize: 9, color: colors.brand2, flex: 1 },
  errorBox: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: radius.sm, borderWidth: 1, borderColor: '#F5D0CC', padding: 9 },
  errorText: { flex: 1, color: colors.danger, fontSize: 9.5, lineHeight: 14 },
  note: { fontSize: 8.5, lineHeight: 13, color: colors.muted2 },
  result: { backgroundColor: '#EEF7EE', borderWidth: 1, borderColor: '#D6E9D7', borderRadius: radius.md, padding: 13 },
  resultDuplicate: { backgroundColor: '#F4F8EA', borderColor: '#DFEAB8' },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  resultText: { fontSize: 9.5, lineHeight: 14, color: colors.inkSoft, marginTop: 5 },
  runRow: { flexDirection: 'row', gap: 6, marginTop: 9 },
  runPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 7, padding: 7 },
  runLabel: { fontSize: 6.5, fontWeight: '700', letterSpacing: 0.6, color: colors.muted },
  runValue: { fontSize: 12, fontWeight: '700', color: colors.ink, marginTop: 2 },
  queueNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  queueNoteText: { flex: 1, fontSize: 8.5, color: colors.muted2, lineHeight: 12 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,61,50,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  busyText: { color: colors.mint, fontSize: 10.5, fontWeight: '600' },
  blockedTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  blockedText: { fontSize: 10, color: colors.muted, lineHeight: 15, marginTop: 4 },
});
