import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth';
import { API_URL } from '../api';
import { Avatar, Logo } from '../components';
import { colors, fonts, radius } from '../theme';

const DEMO = [
  { name: 'Rani Prameswari', email: 'rani@bcn.co.id', role: 'ANALYST' },
  { name: 'Dimas Adiwangsa', email: 'dimas@bcn.co.id', role: 'SUPERVISOR' },
  { name: 'Ayu Lestari', email: 'ayu@bcn.co.id', role: 'AUDITOR' },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('rani@bcn.co.id');
  const [password, setPassword] = useState('laras2026');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your work email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo />
            <View style={styles.brandCopy}>
              <Text style={styles.kicker}>BANK CAKRAWALA NUSANTARA · FIELD OPS</Text>
              <Text style={styles.headline}>
                Every rupiah,{'\n'}
                <Text style={styles.headlineAccent}>accounted for.</Text>
              </Text>
              <Text style={styles.tagline}>
                Triage settlement exceptions, capture vendor kuitansi and clear evidence gaps from the field.
              </Text>
            </View>
            <View style={styles.proofRow}>
              <Text style={styles.proof}>MATCH ID × AMOUNT</Text>
              <Text style={styles.proof}>KUITANSI EVIDENCE</Text>
              <Text style={styles.proof}>IDEMPOTENT IMPORTS</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.formEyebrow}>SECURE SIGN-IN</Text>
            <Text style={styles.formTitle}>Welcome back.</Text>
            <Text style={styles.formSubtitle}>Use your operations account. Access is written to the audit trail.</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>WORK EMAIL</Text>
              <View style={styles.inputShell}>
                <Ionicons name="mail-outline" size={16} color={colors.muted2} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="name@bcn.co.id"
                  placeholderTextColor={colors.muted2}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.muted2} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted2}
                  style={styles.input}
                  onSubmitEditing={submit}
                />
                <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10} accessibilityLabel="Show password">
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.submit, (pressed || busy) && { opacity: 0.82 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.mint} />
              ) : (
                <>
                  <Text style={styles.submitText}>Enter workspace</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.mint} />
                </>
              )}
            </Pressable>

            <View style={styles.demoHead}>
              <Text style={styles.demoTitle}>DEMO ACCOUNTS</Text>
              <Text style={styles.demoPassword}>laras2026</Text>
            </View>
            {DEMO.map((account) => {
              const selected = email === account.email;
              return (
                <Pressable
                  key={account.email}
                  onPress={() => {
                    setEmail(account.email);
                    setPassword('laras2026');
                    setError(null);
                  }}
                  style={[styles.demoAccount, selected && styles.demoAccountSelected]}
                >
                  <Avatar name={account.name} size={32} dark={selected} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.demoName}>{account.name}</Text>
                    <Text style={styles.demoEmail}>{account.email}</Text>
                  </View>
                  <Text style={styles.demoRole}>{account.role}</Text>
                  {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} /> : null}
                </Pressable>
              );
            })}

            <Text style={styles.fineprint}>
              Pilot data is synthetic. API: {API_URL}. JWT sessions expire after 12 hours.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  brand: {
    backgroundColor: colors.brand,
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 26,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    gap: 26,
  },
  brandCopy: { gap: 11 },
  kicker: { color: 'rgba(217,237,155,0.66)', fontSize: 8.5, fontWeight: '700', letterSpacing: 1.4 },
  headline: {
    fontFamily: fonts.display,
    color: '#F7FAEE',
    fontSize: 39,
    lineHeight: 43,
    letterSpacing: -1.2,
  },
  headlineAccent: { color: colors.mint, fontStyle: 'italic' },
  tagline: { color: 'rgba(239,244,230,0.6)', fontSize: 11.5, lineHeight: 18, maxWidth: 330 },
  proofRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  proof: { color: 'rgba(239,244,230,0.45)', fontSize: 7.5, letterSpacing: 0.9, fontWeight: '600' },
  form: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 36, gap: 12 },
  formEyebrow: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  formTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 30, letterSpacing: -0.6, marginTop: -4 },
  formSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  errorBox: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#F5D0CC',
    padding: 10,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 10.5, lineHeight: 15 },
  field: { gap: 6 },
  label: { color: colors.inkSoft, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 47,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
  },
  input: { flex: 1, height: '100%', fontSize: 13, color: colors.ink },
  submit: {
    marginTop: 4,
    height: 49,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
  },
  submitText: { color: '#F7FAEE', fontSize: 13, fontWeight: '600' },
  demoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  demoTitle: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  demoPassword: { color: colors.muted2, fontSize: 9, fontFamily: fonts.mono },
  demoAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  demoAccountSelected: { borderColor: colors.brand2, backgroundColor: '#F5F9EA' },
  demoName: { color: colors.ink, fontSize: 10.5, fontWeight: '600' },
  demoEmail: { color: colors.muted, fontSize: 9, marginTop: 1 },
  demoRole: { color: colors.muted, fontSize: 7.5, fontWeight: '700', letterSpacing: 0.5, backgroundColor: colors.surface3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  fineprint: { color: colors.muted2, fontSize: 8.5, lineHeight: 13, marginTop: 130 },
});
