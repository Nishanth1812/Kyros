import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';

import AddTransactionScreen from '../screens/AddTransactionScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HistoryScreen from '../screens/HistoryScreen';
import { colors } from '../theme/theme';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.expense,
  },
};

const tabIcons: Record<keyof RootTabParamList, string> = {
  Dashboard: '▦',
  Add: '＋',
  History: '◷',
};

export default function AppNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 62,
            paddingBottom: 6,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Text
              style={{ color, fontSize: size, fontWeight: focused ? '700' : '400' }}
            >
              {tabIcons[route.name]}
            </Text>
          ),
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Add" component={AddTransactionScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
