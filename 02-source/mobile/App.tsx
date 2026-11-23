import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { RootNavigator } from './src/navigation';
import { colors, fonts } from './src/theme';

function Splash() {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <View style={styles.mark}>
        <View style={styles.markBar} />
        <View style={[styles.markBar, { width: 18 }]} />
        <View style={[styles.markBar, { width: 11 }]} />
      </View>
      <Text style={styles.name}>Laras</Text>
      <Text style={styles.tag}>BANK CAKRAWALA NUSANTARA · FIELD OPS</Text>
      <ActivityIndicator color={colors.mint} style={{ marginTop: 26 }} />
    </View>
  );
}

function Gate() {
  const { booting } = useAuth();
  if (booting) return <Splash />;
  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', gap: 4 },
  markBar: { height: 4, width: 23, borderRadius: 2, backgroundColor: colors.brand },
  name: { fontFamily: fonts.display, fontSize: 32, color: '#F8FAEE', marginTop: 16, letterSpacing: -0.6 },
  tag: { fontSize: 8, fontWeight: '700', letterSpacing: 1.6, color: 'rgba(217,237,155,0.6)', marginTop: 6 },
});
