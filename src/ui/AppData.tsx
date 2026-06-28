// Uygulama genelinde paylaşılan veri context'i.
// Tek işi: açılışta initDataLayer()'ı BİR KEZ çalıştırmak ve aktif kullanıcıyı
// (anonim ya da hesaplı) tüm ekranlara sunmak. Ekranlar user.id'yi buradan alır,
// sonra doğrudan repository fonksiyonlarını çağırır - context içine SQL sızmaz.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initDataLayer } from '@/db';
import type { User } from '@/db';

interface AppData {
  user: User;
}

const AppDataContext = createContext<AppData | null>(null);

// Ekranlar kullanıcıya bu hook ile erişir. Provider dışında çağrılırsa erken hata verir.
export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData yalnızca <AppDataProvider> içinde kullanılabilir.');
  }
  return value;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Şemayı kurar, anonim kullanıcıyı garantiler. Yalnızca ilk açılışta çalışır.
    initDataLayer()
      .then(({ user }) => setUser(user))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Veri katmanı başlatılamadı</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return <AppDataContext.Provider value={{ user }}>{children}</AppDataContext.Provider>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
