import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, severityColors, shadow, typeColors } from './theme';
import { initials } from './format';
import type { ExceptionItem } from './types';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.logo}>
      <View style={[styles.logoMark, compact && styles.logoMarkSmall]}>
        <Text style={[styles.logoGlyph, compact && styles.logoGlyphSmall]}>L</Text>
      </View>
      {!compact && (
        <View>
          <Text style={styles.wordmark}>LARAS</Text>
          <Text style={styles.wordmarkSub}>FIELD OPERATIONS</Text>
        </View>
      )}
    </View>
  );
}

export function Avatar({ name, size = 34, dark = false }: { name: string | null; size?: number; dark?: boolean }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        dark && { backgroundColor: 'rgba(217,237,155,0.16)', borderColor: 'rgba(217,237,155,0.25)' },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.33 }, dark && { color: colors.mint }]}>{initials(name)}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'mint';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  block = false,
  size = 'md',
  style,
}: ButtonProps) {
  const tone = {
    primary: { background: colors.brand, border: colors.brand, text: '#F8FAEE' },
    secondary: { background: colors.surface, border: colors.lineStrong, text: colors.ink },
    ghost: { background: 'transparent', border: 'transparent', text: colors.muted },
    danger: { background: colors.danger, border: colors.danger, text: '#FFFFFF' },
    mint: { background: colors.mint, border: colors.mint, text: colors.brand },
  }[variant];
  const height = size === 'sm' ? 34 : size === 'lg' ? 50 : 42;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          backgroundColor: tone.background,
          borderColor: tone.border,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          paddingHorizontal: size === 'sm' ? 12 : 16,
        },
        block && styles.block,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 14 : 16} color={tone.text} /> : null}
          <Text style={[styles.buttonText, { color: tone.text, fontSize: size === 'sm' ? 11.5 : size === 'lg' ? 14 : 12.5 }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function TypeChip({ type, compact = false }: { type: ExceptionItem['type']; compact?: boolean }) {
  const tone = typeColors[type] ?? { color: colors.muted, bg: colors.surface3, label: type };
  return (
    <View style={[styles.typeChip, { backgroundColor: tone.bg, borderColor: tone.bg }, compact && styles.typeChipCompact]}>
      <View style={[styles.typeDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.typeChipText, { color: tone.color }, compact && { fontSize: 9 }]}>{tone.label}</Text>
    </View>
  );
}

export function SeverityBadge({ severity, label = true }: { severity: ExceptionItem['severity']; label?: boolean }) {
  const tone = severityColors[severity] ?? colors.muted;
  return (
    <View style={styles.severity}>
      <View style={[styles.severityDot, { backgroundColor: tone }]} />
      {label ? <Text style={[styles.severityText, { color: tone }]}>{severity}</Text> : null}
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'OPEN'
      ? { bg: colors.warningSoft, fg: colors.warning }
      : status === 'IN_REVIEW'
        ? { bg: colors.infoSoft, fg: colors.info }
        : status === 'RESOLVED'
          ? { bg: '#E8F4EC', fg: colors.success }
          : status === 'IGNORED'
            ? { bg: colors.surface3, fg: colors.muted }
            : { bg: colors.surface3, fg: colors.muted };
  return (
    <View style={[styles.status, { backgroundColor: tone.bg }]}>
      <Text style={[styles.statusText, { color: tone.fg }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted2}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry}>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'checkmark-circle-outline', title, message }: { icon?: keyof typeof Ionicons.glyphMap; title: string; message: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={23} color={colors.brand2} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 36 },
  muted: { color: colors.muted },
  strong: { fontWeight: '600' },
  mono: { fontFamily: fonts.mono, fontSize: 11 },
  money: { fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(217,237,155,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(217,237,155,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkSmall: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brand },
  logoGlyph: { fontFamily: fonts.display, fontSize: 23, fontWeight: '700', color: colors.mint, marginTop: -2 },
  logoGlyphSmall: { fontSize: 18, color: colors.mint },
  wordmark: { color: '#F5F8E9', fontSize: 14, fontWeight: '800', letterSpacing: 3.4 },
  wordmarkSub: { color: 'rgba(233,240,228,0.48)', fontSize: 8, letterSpacing: 1.3, marginTop: 2 },
  avatar: {
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', color: colors.brand },
  button: {
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  block: { alignSelf: 'stretch' },
  buttonText: { fontWeight: '600' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  typeChipCompact: { paddingHorizontal: 6, paddingVertical: 2 },
  typeDot: { width: 5, height: 5, borderRadius: 3 },
  typeChipText: { fontSize: 9.5, fontWeight: '600' },
  severity: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  severityDot: { width: 6, height: 6, borderRadius: 3 },
  severityText: { fontSize: 9.5, fontWeight: '600', letterSpacing: 0.3 },
  status: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, alignSelf: 'flex-start' },
  statusText: { fontSize: 8.5, fontWeight: '700', letterSpacing: 0.5 },
  sectionLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    ...shadow,
  },
  field: { gap: 6 },
  fieldLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.9, color: colors.muted, textTransform: 'uppercase' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  fieldHint: { fontSize: 9.5, lineHeight: 14, color: colors.muted2 },
  fieldError: { fontSize: 10, color: colors.danger },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#F5D0CC',
  },
  errorText: { flex: 1, fontSize: 11, color: colors.danger, lineHeight: 16 },
  retry: { fontSize: 11, fontWeight: '700', color: colors.danger },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 5 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  emptyMessage: { fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 16 },
});
