import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { initializeTasksDatabase } from '@/lib/tasks';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="daymark.db" onInit={initializeTasksDatabase}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F5F6F2' },
        }}
      />
    </SQLiteProvider>
  );
}
