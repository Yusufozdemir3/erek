import { NativeModule, requireNativeModule } from 'expo';

declare class CustomNotificationChannelModule extends NativeModule<{}> {
  createChannel(channelId: string, name: string, soundUri: string | null, vibrate: boolean): void;
  deleteChannel(channelId: string): void;
}

export default requireNativeModule<CustomNotificationChannelModule>('CustomNotificationChannel');
