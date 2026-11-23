import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth';
import { LoginScreen } from './screens/LoginScreen';
import { TriageScreen } from './screens/TriageScreen';
import { ExceptionScreen } from './screens/ExceptionScreen';
import { CaptureScreen } from './screens/CaptureScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { colors } from './theme';

export type RootStackParamList = {
  Login: undefined;
  Main: { screen?: 'Triage' | 'History' | 'Capture'; params?: Record<string, unknown> } | undefined;
  Exception: { id: string };
};

export type MainTabParamList = {
  Triage: undefined;
  History: undefined;
  Capture: { invoiceNumber?: string; exceptionId?: string; transactionRef?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    primary: colors.brand2,
    border: colors.line,
  },
};

const TAB_ICONS: Record<keyof MainTabParamList, { active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }> = {
  Triage: { active: 'funnel', idle: 'funnel-outline' },
  History: { active: 'folder-open', idle: 'folder-open-outline' },
  Capture: { active: 'camera', idle: 'camera-outline' },
};

function MainTabs() {
  const { user } = useAuth();
  const canCapture = user?.role === 'ANALYST' || user?.role === 'SUPERVISOR';
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted2,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 8.5, fontWeight: '600', letterSpacing: 0.2 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name as keyof MainTabParamList];
          return <Ionicons name={focused ? icons.active : icons.idle} size={Math.min(size, 21)} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Triage" component={TriageScreen} options={{ title: 'Triage' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'Evidence' }} />
      {canCapture ? <Tab.Screen name="Capture" component={CaptureScreen} options={{ title: 'Capture' }} /> : null}
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user } = useAuth();
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Exception" component={ExceptionScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
